"use strict";
/* Phân bổ tài sản theo CFA Level III: kỳ vọng thị trường (CME) điều chỉnh theo dữ liệu hiện tại,
   tối ưu trung bình–phương sai (tối đa U = E(R) − ½·λ·σ²) dưới các ràng buộc IPS; mô phỏng Monte Carlo.
   Dùng chung tiện ích trong app.js và dữ liệu vĩ mô trong macro.js. Đơn vị tiền: triệu VND. */

// Ba hồ sơ = cùng một bài toán tối ưu, khác mức ngại rủi ro λ (CFA: λ cao = ngại rủi ro hơn)
const PROFILES = {
  conservative: { name: "Thận trọng", lambda: 8 },
  balanced: { name: "Cân bằng", lambda: 4 },
  growth: { name: "Tăng trưởng", lambda: 2 },
};
const CLASSES = [
  ["gold", "Vàng SJC", "--gold", "Phòng ngừa rủi ro đuôi (mất giá VND, rủi ro hệ thống). Bán dần theo lộ trình; bán nhiều hơn khi premium SJC cao."],
  ["cash", "Tiền mặt (quỹ khẩn cấp)", "--cash", "6–12 tháng chi tiêu, để ở tài khoản thanh toán hoặc tiết kiệm linh hoạt."],
  ["dep", "Tiết kiệm có kỳ hạn", "--dep", "Bậc thang 3–6–12 tháng, chia nhiều ngân hàng (≤ 125 tr/ngân hàng để được bảo hiểm)."],
  ["bond", "Quỹ trái phiếu", "--bond", "Quỹ mở trái phiếu (DCBF, VFF, TCBF, SSIBF…): rút linh hoạt hơn tiết kiệm. So sánh phí và lợi suất 3 năm."],
  ["equity", "Cổ phiếu lõi", "--equity", "Mua đều hằng tháng (DCA) ETF E1VFVN30, FUEVFVND, FUESSVFL hoặc quỹ mở cổ phiếu (DCDS, VESAF, VEOF…)."],
  ["sat", "Vệ tinh (tự giao dịch)", "--sat", "CFA giả định alpha = 0 nên tối ưu không phân bổ; chỉ thêm khi paper trading chứng minh có lợi thế."],
];
const OPT_KEYS = ["liquid", "bond", "equity", "gold", "sat"];
const LABEL = { liquid: "Tiền mặt + tiết kiệm", bond: "Quỹ trái phiếu", equity: "Cổ phiếu lõi", gold: "Vàng SJC", sat: "Vệ tinh" };
const DEFAULT_PLAN = {
  profile: "balanced", risk: "balanced", emergency: 60, horizon: 5, infl: 4,
  // Cổ phiếu VN – Grinold–Kroner: cổ tức + tăng trưởng thực + lạm phát − pha loãng (+ định giá lại = 0)
  divEq: 2, gReal: 6.5, dilution: 1, vEq: 20,
  rGold: 6, vGold: 17, premTarget: 3,
  rDep: 6.5, rCash: 0.5, rBond: 6.5, vBond: 3, vSat: 30,
  goldMin: 10, goldMax: 30, eqMax: 60, satMax: 10,
};
const ASSUME_FIELDS = [
  ["infl", "Lạm phát dài hạn (%)"], ["emergency", "Quỹ khẩn cấp (tr)"],
  ["divEq", "CP: tỷ suất cổ tức (%)"], ["gReal", "CP: tăng trưởng thực (%)"], ["dilution", "CP: pha loãng (%)"], ["vEq", "CP: biến động (%)"],
  ["rGold", "Vàng TG: tăng/năm (%)"], ["vGold", "Vàng: biến động (%)"], ["premTarget", "Premium SJC sau 2 năm (%)"],
  ["rDep", "Lãi tiết kiệm dài hạn (%)"], ["rCash", "Lãi tiền mặt (%)"], ["rBond", "Quỹ trái phiếu (%)"], ["vBond", "Quỹ TP: biến động (%)"], ["vSat", "Vệ tinh: biến động (%)"],
  ["goldMin", "Ràng buộc: vàng tối thiểu (%)"], ["goldMax", "Ràng buộc: vàng tối đa (%)"], ["eqMax", "Ràng buộc: cổ phiếu tối đa (%)"], ["satMax", "Ràng buộc: vệ tinh tối đa (%)"],
];

const PLAN_VERSION = 2; // tăng khi đổi phương pháp/giả định mặc định
const planCfg = () => {
  const old = S.settings.plan || {};
  if (old.v !== PLAN_VERSION) // chuyển sang phương pháp mới: giả định về mặc định, giữ lựa chọn cá nhân
    S.settings.plan = { ...DEFAULT_PLAN, v: PLAN_VERSION, ...(old.horizon ? { horizon: old.horizon } : {}), ...(old.emergency != null ? { emergency: old.emergency } : {}) };
  const p = (S.settings.plan = { ...DEFAULT_PLAN, ...S.settings.plan });
  if (!PROFILES[p.profile]) p.profile = p.risk; // dữ liệu cũ: "stage1"/"rec"
  if (!PROFILES[p.risk]) p.risk = "balanced";
  return p;
};
const depNow = (p) => vn("deposit")?.value ?? p.rDep;

/* ---------- Kỳ vọng thị trường (Capital Market Expectations) ---------- */
function cme(p, years) {
  const notes = [];
  // Tiết kiệm: biết chắc lãi năm đầu, các năm sau dùng lãi dài hạn
  const dNow = depNow(p), liquid = (dNow + (years - 1) * p.rDep) / years;
  notes.push(["liquid", `Lãi hiện tại ${nf(dNow, 1)}% cho năm đầu, ${nf(p.rDep, 1)}% các năm sau → bình quân ${nf(liquid, 2)}%/năm`]);
  // Cổ phiếu: Grinold–Kroner + điều chỉnh chiến thuật
  const gk = p.divEq + p.gReal + p.infl - p.dilution;
  let eq = gk;
  const eqWhy = [`Grinold–Kroner: cổ tức ${nf(p.divEq, 1)} + tăng trưởng thực ${nf(p.gReal, 1)} + lạm phát ${nf(p.infl, 1)} − pha loãng ${nf(p.dilution, 1)} = ${nf(gk, 1)}%`];
  if (M) {
    const vni = M.markets?.vnindex;
    if (vni?.vsMa200 != null && vni.vsMa200 < 0) { eq -= 1; eqWhy.push(`VN-Index dưới MA200 (${pct(vni.vsMa200)}): −1`); }
    const score = recessionChecks().reduce((s, x) => s + (x.level === "alert" ? 2 : x.level === "warn" ? 1 : 0), 0);
    if (score >= 6) { eq -= 3; eqWhy.push(`rủi ro suy thoái cao (${score} điểm): −3`); }
    else if (score >= 3) { eq -= 1; eqWhy.push(`rủi ro suy thoái trung bình (${score} điểm): −1`); }
  }
  notes.push(["equity", eqWhy.join("; ") + ` → ${nf(eq, 1)}%`]);
  // Vàng: kỳ vọng thế giới + phần premium SJC co lại (chia đều cho kỳ hạn) + bù lạm phát cao
  const prem0 = P.latest.premium ?? 0, drag = (Math.log((1 + p.premTarget / 100) / (1 + prem0)) / years) * 100;
  const cpi = vn("cpiYoy")?.value;
  const goldBoost = cpi != null && cpi >= 4.5 ? 1 : 0;
  const gold = p.rGold + drag + goldBoost;
  notes.push(["gold", `Vàng TG ${nf(p.rGold, 1)}%; premium ${pct(prem0)} → ${nf(p.premTarget, 0)}%: ${nf(drag, 1)}%/năm${goldBoost ? `; lạm phát ${nf(cpi, 2)}% cao: +1` : ""} → ${nf(gold, 1)}%`]);
  const bondR = INV?.bondMedian12m ?? p.rBond;
  notes.push(["bond", INV?.bondMedian12m != null
    ? `Trung vị lợi nhuận 12 tháng của ${INV.bondFunds.length} quỹ trái phiếu: ${nf(bondR, 2)}% (CFA: kỳ vọng trái phiếu ≈ lợi suất hiện tại)`
    : `Giả định ${nf(p.rBond, 1)}% (CFA: kỳ vọng trái phiếu ≈ lợi suất hiện tại)`]);
  notes.push(["sat", `Như cổ phiếu (${nf(eq, 1)}%) vì CFA giả định alpha = 0, nhưng biến động cao hơn (${nf(p.vSat, 0)}%)`]);
  const r = { liquid, bond: bondR, equity: eq, gold, sat: eq };
  const v = { liquid: 0.5, bond: p.vBond, equity: p.vEq, gold: p.vGold, sat: p.vSat };
  return { r, v, notes: Object.fromEntries(notes) };
}

// Tương quan giả định (ổn định dài hạn): vàng ít tương quan với cổ phiếu; vệ tinh tương quan cao với cổ phiếu lõi
const CORR = {
  liquid: { liquid: 1, bond: 0.1, equity: 0, gold: 0, sat: 0 },
  bond: { liquid: 0.1, bond: 1, equity: 0.2, gold: 0.1, sat: 0.2 },
  equity: { liquid: 0, bond: 0.2, equity: 1, gold: 0.1, sat: 0.8 },
  gold: { liquid: 0, bond: 0.1, equity: 0.1, gold: 1, sat: 0.1 },
  sat: { liquid: 0, bond: 0.2, equity: 0.8, gold: 0.1, sat: 1 },
};

/** Tối ưu trung bình–phương sai có ràng buộc: lưới 5% rồi tinh chỉnh 1%. Trả về tỷ trọng (%), E(R), σ. */
function optimize(c, lambda, bounds) {
  const stats = (w) => {
    let er = 0, varp = 0;
    for (const i of OPT_KEYS) {
      er += (w[i] / 100) * c.r[i];
      for (const j of OPT_KEYS) varp += (w[i] / 100) * (w[j] / 100) * c.v[i] * c.v[j] * CORR[i][j];
    }
    return { er, sd: Math.sqrt(varp), u: er - 0.5 * lambda * (varp / 100) };
  };
  const ok = (w) => OPT_KEYS.every((k) => w[k] >= bounds[k][0] - 1e-9 && w[k] <= bounds[k][1] + 1e-9);
  let best = null;
  const consider = (w) => { if (!ok(w)) return; const s = stats(w); if (!best || s.u > best.u + 1e-12) best = { w: { ...w }, ...s }; };
  for (let b = 0; b <= 100; b += 5) for (let e = 0; e <= 100 - b; e += 5) for (let g = 0; g <= 100 - b - e; g += 5)
    for (let s = 0; s <= 100 - b - e - g; s += 5) consider({ liquid: 100 - b - e - g - s, bond: b, equity: e, gold: g, sat: s });
  if (!best) { // ràng buộc không khớp lưới 5%: bắt đầu từ mức tối thiểu
    const w = Object.fromEntries(OPT_KEYS.map((k) => [k, bounds[k][0]])); w.liquid = 100 - OPT_KEYS.filter((k) => k !== "liquid").reduce((s, k) => s + w[k], 0);
    best = { w, ...stats(w) };
  }
  for (let improved = true; improved;) { // leo đồi bước 1 điểm %
    improved = false;
    for (const from of OPT_KEYS) for (const to of OPT_KEYS) {
      if (from === to) continue;
      const w = { ...best.w, [from]: best.w[from] - 1, [to]: best.w[to] + 1 };
      if (!ok(w)) continue;
      const s = stats(w);
      if (s.u > best.u + 1e-12) { best = { w, ...s }; improved = true; }
    }
  }
  return best;
}

function bounds(total, p) {
  const liqMin = total ? Math.min(100, Math.ceil((p.emergency / total) * 100)) : 0;
  return { liquid: [liqMin, 100], bond: [0, 100], equity: [0, p.eqMax], gold: [p.goldMin, p.goldMax], sat: [0, p.satMax] };
}

const optCache = new Map();
function optimal(profileKey, total) {
  const p = planCfg(), c = cme(p, p.horizon);
  const key = JSON.stringify([profileKey, Math.round(total), c.r, c.v, p.goldMin, p.goldMax, p.eqMax, p.satMax, p.emergency]);
  if (!optCache.has(key)) { if (optCache.size > 50) optCache.clear(); optCache.set(key, { ...optimize(c, PROFILES[profileKey].lambda, bounds(total, p)), cme: c }); }
  return optCache.get(key);
}

function currentMix(st) {
  const m = secMix(); // "Tài sản khác" (BĐS, crypto…) không tham gia phân bổ
  return { gold: goldValue(st.lots, P.latest), cash: Math.max(st.cash, 0), dep: st.depVal, bond: m.bond, equity: m.equity, sat: m.sat };
}

function targetMix(total, profileKey) {
  const p = planCfg(), w = optimal(profileKey || p.profile, total).w;
  const liquid = (total * w.liquid) / 100, cash = Math.min(p.emergency, liquid);
  return { gold: (total * w.gold) / 100, cash, dep: liquid - cash, bond: (total * w.bond) / 100, equity: (total * w.equity) / 100, sat: (total * w.sat) / 100 };
}

/** Số lượng vàng giữ lại = tỷ trọng vàng tối ưu của hồ sơ đang áp dụng, làm tròn lượng nguyên (vàng miếng 1 lượng),
    không thấp hơn mức "Giữ tối thiểu" trong cài đặt. */
function goldKeep(st) {
  const p = planCfg();
  const total = Object.values(currentMix(st)).reduce((a, b) => a + b, 0);
  const exact = targetMix(total, p.profile).gold / P.latest.sjc_buy;
  const min = S.settings.minKeep || 0, keep = Math.max(min, Math.round(exact));
  return { keep, exact, min, floored: keep > Math.round(exact), profile: p.profile };
}

/* ---------- Monte Carlo ---------- */
function rng(seed) { // mulberry32 + Box–Muller: kết quả ổn định giữa các lần mở trang
  let a = seed >>> 0, spare = null;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => {
    if (spare != null) { const s = spare; spare = null; return s; }
    let x, y, r;
    do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (!r || r >= 1);
    const f = Math.sqrt((-2 * Math.log(r)) / r);
    spare = y * f; return x * f;
  };
}

/** Mô phỏng 2 danh mục trên cùng các kịch bản. A: giữ nguyên, không tái cân bằng. B: tái cân bằng mỗi năm. */
function simulate(A, B, years, p, paths = 2000) {
  const n = years * 12, z = rng(20261107);
  const lg = (r) => Math.log(1 + r / 100) / 12, sd = (v) => v / 100 / Math.sqrt(12);
  const prem0 = P.latest.premium ?? 0, premDrag = Math.log((1 + p.premTarget / 100) / (1 + prem0)) / 24;
  const keys = ["gold", "cash", "dep", "bond", "equity", "sat"];
  const totB = keys.reduce((s, k) => s + B[k], 0), wB = Object.fromEntries(keys.map((k) => [k, totB ? B[k] / totB : 0]));
  const c = cme(p, years); // cùng bộ kỳ vọng với bộ tối ưu
  const fixed = { cash: Math.exp(lg(p.rCash)), dep1: Math.exp(lg(depNow(p))), dep: Math.exp(lg(p.rDep)) };
  const series = { A: Array.from({ length: n + 1 }, () => new Float64Array(paths)), B: Array.from({ length: n + 1 }, () => new Float64Array(paths)) };
  const mddA = new Float64Array(paths), mddB = new Float64Array(paths);
  for (let i = 0; i < paths; i++) {
    const a = { ...A }, b = { ...B };
    let peakA = 0, peakB = 0, ddA = 0, ddB = 0;
    for (let m = 0; m <= n; m++) {
      if (m > 0) {
        const z1 = z(), z2 = z(), z3 = z(), z4 = z();
        const e = 0.1 * z1 + Math.sqrt(0.99) * z2;
        const g = Math.exp(lg(p.rGold) + sd(p.vGold) * z1 + (m <= 24 ? premDrag : 0));
        const eq = Math.exp(lg(c.r.equity) + sd(p.vEq) * e);
        const sat = Math.exp(lg(c.r.sat) + sd(p.vSat) * (0.8 * e + 0.6 * z3));
        const bd = Math.exp(lg(c.r.bond) + sd(p.vBond) * z4);
        const gr = { gold: g, cash: fixed.cash, dep: m <= 12 ? fixed.dep1 : fixed.dep, bond: bd, equity: eq, sat };
        for (const k of keys) { a[k] *= gr[k]; b[k] *= gr[k]; }
        if (m % 12 === 0) { const t = keys.reduce((s, k) => s + b[k], 0); for (const k of keys) b[k] = t * wB[k]; }
      }
      const tA = keys.reduce((s, k) => s + a[k], 0), tB = keys.reduce((s, k) => s + b[k], 0);
      series.A[m][i] = tA; series.B[m][i] = tB;
      peakA = Math.max(peakA, tA); peakB = Math.max(peakB, tB);
      ddA = Math.min(ddA, tA / peakA - 1); ddB = Math.min(ddB, tB / peakB - 1);
    }
    mddA[i] = ddA; mddB[i] = ddB;
  }
  const q = (arr, x) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(x * s.length))]; };
  const band = (S) => S.map((arr) => [q(arr, 0.05), q(arr, 0.5), q(arr, 0.95)]);
  const last = n, beat = series.B[last].reduce((c, v, i) => c + (v > series.A[last][i] ? 1 : 0), 0) / paths;
  return { A: band(series.A), B: band(series.B), mddA: q(mddA, 0.5), mddB: q(mddB, 0.5), beat, n };
}

function passiveIncome(mix, p) { // tr/năm, năm đầu
  return mix.dep * depNow(p) / 100 + mix.cash * p.rCash / 100 + mix.bond * (INV?.bondMedian12m ?? p.rBond) / 100 + mix.equity * p.divEq / 100;
}

/** Vàng cần tăng bao nhiêu %/năm để hiện trạng hòa với mục tiêu (theo trung vị). */
function breakeven(A, B, years, p) {
  let lo = -10, hi = 40;
  const diff = (r) => { const s = simulate(A, B, years, { ...p, rGold: r }, 400); return s.A[s.n][1] - s.B[s.n][1]; };
  if (diff(hi) < 0) return null;
  for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (diff(mid) < 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/* ---------- thẻ so sánh các hồ sơ ---------- */
let profileCardKey = "";
function renderProfileCards(cur, total, p) {
  const y = p.horizon, defl = Math.pow(1 + p.infl / 100, y);
  // Mọi thẻ có cùng cấu trúc và cùng số dòng (tiêu đề, biểu đồ, 6 lớp tài sản, 7 chỉ số) để CSS subgrid căn thẳng hàng
  const cards = [{ key: "cur", name: "Hiện trạng", mix: cur, base: true }]
    .concat(Object.keys(PROFILES).map((k) => ({ key: k, name: PROFILES[k].name, mix: targetMix(total, k) })));
  for (const c of cards) {
    const sim = simulate(cur, c.mix, y, p, 600), f = c.base ? sim.A[sim.n] : sim.B[sim.n];
    c.stats = [
      [`Trung vị sau ${y} năm`, money(f[1])],
      ["Tăng trưởng/năm", pct(Math.pow(f[1] / total, 1 / y) - 1)],
      ["Theo sức mua hôm nay", money(f[1] / defl)],
      ["Kịch bản xấu 5%", money(f[0])],
      ["Sụt giảm tối đa", pct(c.base ? sim.mddA : sim.mddB)],
      ["Thu nhập thụ động", money(passiveIncome(c.mix, p) / 12) + "/th"],
      ["Hơn hiện trạng", c.base ? "—" : nf(sim.beat * 100, 0) + "% kịch bản"],
    ];
  }
  $("#profileCards").innerHTML = cards.map((c) => `
    <div class="pcard${c.base ? " base" : ""}" ${c.base ? "" : `data-profile="${c.key}" role="button" tabindex="0"`}>
      <h3>${esc(c.name)}${c.key === p.risk ? ' <span class="tag">Đề xuất</span>' : ""}</h3>
      <div class="pie"><canvas id="pie_${c.key}"></canvas></div>
      ${CLASSES.map(([k, name, color]) => {
        const w = total ? (c.mix[k] / total) * 100 : 0;
        return `<div class="li${w < 0.5 ? " zero" : ""}"><span class="dot" style="background:${css(color)}"></span><span>${name}</span><b>${w < 0.5 ? "—" : nf(w, 0) + "%"}</b></div>`;
      }).join("")}
      ${c.stats.map(([l, v], i) => `<div class="st${i === 0 ? " first" : ""}"><span>${l}</span><b>${v}</b></div>`).join("")}
    </div>`).join("");
  for (const c of cards) {
    const parts = CLASSES.filter(([k]) => c.mix[k] >= 0.5);
    if (charts["pie_" + c.key]) charts["pie_" + c.key].destroy();
    charts["pie_" + c.key] = new Chart($("#pie_" + c.key), {
      type: "doughnut",
      data: { labels: parts.map((x) => x[1]), datasets: [{ data: parts.map(([k]) => c.mix[k]), backgroundColor: parts.map((x) => css(x[2])), borderWidth: 0 }] },
      options: { cutout: "60%", maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (t) => `${t.label}: ${money(t.parsed)} (${nf((t.parsed / total) * 100, 0)}%)` } } } },
    });
  }
}

/* ---------- hiển thị ---------- */
let simKey = "";
function renderPlan(st) {
  const p = planCfg();
  const cur = currentMix(st), total = Object.values(cur).reduce((a, b) => a + b, 0), tgt = targetMix(total);

  const rows = CLASSES.map(([k, name, color, tip]) => {
    const d = tgt[k] - cur[k];
    let act = "—";
    if (Math.abs(d) >= 1) {
      if (k === "gold") {
        const gk = goldKeep(st), sell = Math.max(st.gold - gk.keep, 0);
        act = d < 0 ? `Bán ${nf(sell, sell % 1 ? 1 : 0)} lượng, giữ ${nf(gk.keep, 0)} (theo lộ trình)` : `Thêm ${money(d)}`;
      }
      else act = d > 0 ? `Thêm ${money(d)}` : `Giảm ${money(-d)}`;
    }
    return `<tr><td><span class="dot" style="background:${css(color)}"></span>${name}</td>
      <td>${money(cur[k])} <span class="muted">${nf(total ? (cur[k] / total) * 100 : 0, 0)}%</span></td>
      <td>${money(tgt[k])} <span class="muted">${nf(total ? (tgt[k] / total) * 100 : 0, 0)}%</span></td>
      <td class="${Math.abs(d) < 1 ? "muted" : d > 0 ? "up" : "down"}">${act}</td>
      <td class="tip">${tip}</td></tr>`;
  });
  $("#planTable").innerHTML = `<tr><th>Lớp tài sản</th><th>Hiện tại</th><th>Mục tiêu</th><th>Cần làm</th><th class="tip">Gợi ý công cụ</th></tr>` + rows.join("");
  const best = optimal(p.risk, total), c = best.cme, b = bounds(total, p);
  const frontier = Object.keys(PROFILES).map((k) => { const o = optimal(k, total); return `<b>${PROFILES[k].name}</b> (λ=${PROFILES[k].lambda}): E(R) ${nf(o.er, 2)}%, σ ${nf(o.sd, 1)}%`; }).join(" · ");
  $("#recBox").innerHTML = `<h3 class="sub">Cách tính đề xuất (CFA Level III) <span class="tag">Đề xuất</span></h3>
    <p class="small">Mức chấp nhận rủi ro của tôi:
      <select data-risk class="auto">${Object.entries(PROFILES).map(([k, v]) => `<option value="${k}"${k === p.risk ? " selected" : ""}>${v.name} (λ = ${v.lambda})</option>`).join("")}</select></p>
    <p class="small"><b>Bước 1 – Kỳ vọng thị trường (CME)</b>, điều chỉnh theo dữ liệu hiện tại, kỳ hạn ${p.horizon} năm:</p>
    <div class="tablewrap"><table class="cme"><tr><th>Lớp</th><th>Lợi nhuận kỳ vọng</th><th>Biến động</th><th class="tip">Cơ sở</th></tr>
      ${OPT_KEYS.map((k) => `<tr><td>${LABEL[k]}</td><td>${nf(c.r[k], 2)}%</td><td>${nf(c.v[k], 1)}%</td><td class="tip">${esc(c.notes[k])}</td></tr>`).join("")}</table></div>
    <p class="small"><b>Bước 2 – Tối ưu hóa:</b> chọn tỷ trọng làm U = E(R) − ½·λ·σ² lớn nhất (lợi nhuận đã trừ "chi phí" rủi ro theo mức bạn chấp nhận), với ràng buộc: tiền mặt + tiết kiệm ≥ ${b.liquid[0]}% (quỹ khẩn cấp), vàng ${b.gold[0]}–${b.gold[1]}%, cổ phiếu ≤ ${b.equity[1]}%, vệ tinh ≤ ${b.sat[1]}%.</p>
    <p class="small"><b>Kết quả:</b> ${frontier}.</p>
    <p class="muted small">CME tính lại tự động khi dữ liệu thị trường (4 lần/ngày) và số liệu vĩ mô VN (hằng tháng) thay đổi, nên đề xuất thay đổi theo. Kết quả nhạy nhất với kỳ vọng cổ phiếu và vàng: chỉnh ở <a href="#strategy" data-focus="assumeForm">Chiến lược › Giả định CME</a>.</p>` +
    (p.profile !== p.risk ? `<p class="advice small">Bạn đang áp dụng khẩu vị <b>${esc(PROFILES[p.profile].name)}</b>, khác với mức rủi ro bạn chọn (${esc(PROFILES[p.risk].name)}). <button type="button" class="ghost" data-apply-rec>Áp dụng đề xuất</button></p>` : "");
  $("#planNote").textContent = `Bảng trên là các bước điều chỉnh để danh mục khớp với khẩu vị ${PROFILES[p.profile].name}. Chuyển dần trong 12–18 tháng, không làm một lần; vàng bán theo kế hoạch giảm tỷ trọng vàng (Thực thi).`;

  if (analysisAt) { analysisAt = new Date(); renderAnalysis(st); } // đã bấm Phân tích: cập nhật theo dữ liệu mới

  const { profile, ...rest } = p;
  const cardKey = JSON.stringify([cur, rest, S.settings.minKeep, P.latest.premium, c.r]);
  if (cardKey !== profileCardKey) { profileCardKey = cardKey; renderProfileCards(cur, total, p); }
  document.querySelectorAll(".pcard").forEach((c) => c.classList.toggle("on", c.dataset.profile === p.profile));

  renderBacktest(cur, tgt);
  if (typeof renderGoldVN === "function") renderGoldVN();
  // So sánh: chỉ chạy lại mô phỏng khi đầu vào thay đổi
  const key = JSON.stringify([cur, tgt, p, P.latest.premium]);
  if (key === simKey) return;
  simKey = key;
  const sim = simulate(cur, tgt, p.horizon, p);
  renderCompare(sim, cur, tgt, total, p);
  const be = breakeven(cur, tgt, p.horizon, p);
  $("#cmpBreakeven").innerHTML = be == null
    ? "Với các giả định này, hiện trạng khó vượt mục tiêu ngay cả khi vàng tăng 40%/năm."
    : `Điểm hòa: vàng thế giới cần tăng khoảng <b>${nf(be, 1)}%/năm</b> (trung vị, đã tính premium SJC co về ${nf(p.premTarget, 0)}%) thì hiện trạng mới bằng mục tiêu sau ${p.horizon} năm. ` +
      (be > p.rGold ? `Giả định hiện tại là ${nf(p.rGold, 1)}%/năm, nên mục tiêu có lợi thế.` : `Giả định hiện tại là ${nf(p.rGold, 1)}%/năm, cao hơn điểm hòa, nên hiện trạng đang có lợi thế về trung vị nhưng rủi ro tập trung cao hơn.`) +
      ` Để so sánh: 10 năm qua vàng quy VND tăng ~14%/năm, là giai đoạn đặc biệt mạnh.`;
}

/* ---------- Kiểm định quá khứ (backtest): nếu đã chuyển sang cơ cấu dự án từ 1/6/12 tháng trước ---------- */
const BT_WINDOWS = [[1, "1 tháng", "chg1m"], [6, "6 tháng", "chg6m"], [12, "1 năm", "chg1y"]];
const BT_KEYS = ["gold", "cash", "dep", "bond", "equity", "sat"];
const BT_LABEL = { gold: "Vàng SJC", cash: "Tiền mặt", dep: "Tiết kiệm", bond: "Quỹ trái phiếu", equity: "Cổ phiếu lõi", sat: "Vệ tinh" };

/** Lợi nhuận thực tế của từng lớp trong `months` tháng gần nhất (số thập phân), null nếu thiếu dữ liệu. */
function pastReturns(months, chgKey, p) {
  const t = new Date(); t.setMonth(t.getMonth() - months);
  const d0 = t.toISOString().slice(0, 10), f = months / 12;
  const h = (P.history || []).filter((x) => x.d <= d0 && x.sjc_buy).pop();
  const vni = typeof M !== "undefined" ? M?.markets?.vnindex?.[chgKey] ?? null : null;
  const bond = (typeof INV !== "undefined" && INV?.bondMedian12m) || p.rBond;
  return {
    d0, est: !!h?.est,
    r: { gold: h && P.latest.sjc_buy ? P.latest.sjc_buy / h.sjc_buy - 1 : null, cash: (p.rCash / 100) * f, dep: (depNow(p) / 100) * f,
      bond: (bond / 100) * f, equity: vni, sat: vni },
  };
}

let btWin = 12, btArgs = null;
function renderBacktest(cur, tgt) {
  btArgs = [cur, tgt];
  const p = planCfg();
  const tot = (m) => BT_KEYS.reduce((s, k) => s + (m[k] || 0), 0);
  const V = tot(cur), Tt = tot(tgt);
  const pc = (x) => (x == null ? "—" : (x >= 0 ? "+" : "−") + nf(Math.abs(x * 100), 1) + "%");
  // Giữ nguyên = đúng tài sản đang giữ, tính ngược về giá trị lúc đó; dự án = giá trị lúc đó chia theo hồ sơ rồi tính tới hôm nay
  const calc = (w) => {
    if (!V || BT_KEYS.some((k) => (cur[k] || tgt[k]) && w.r[k] == null)) return null;
    const past = {}, ps = {}, pe = {};
    for (const k of BT_KEYS) past[k] = (cur[k] || 0) / (1 + w.r[k]);
    const V0 = tot(past);
    for (const k of BT_KEYS) { ps[k] = Tt ? (V0 * (tgt[k] || 0)) / Tt : 0; pe[k] = ps[k] * (1 + (w.r[k] ?? 0)); }
    return { past, ps, pe, V0, B: tot(pe), sjc0: w.r.gold != null ? P.latest.sjc_buy / (1 + w.r.gold) : null };
  };
  const W = BT_WINDOWS.map(([mo, label, key]) => { const w = { mo, label, ...pastReturns(mo, key, p) }; w.c = calc(w); return w; });

  $("#btTable").innerHTML = `<tr><th>Nếu tái cơ cấu từ</th><th>Giá trị lúc đó</th><th>Hiện trạng (hôm nay)</th><th>Mục tiêu (hôm nay)</th><th>Chênh lệch</th></tr>` +
    W.map((w) => {
      const lab = `${w.label} trước <span class="muted small">(${fmtDate(w.d0)}${w.est ? ", giá vàng ước tính" : ""})</span>`;
      if (!w.c) return `<tr><td>${lab}</td><td colspan="4" class="muted" style="text-align:center">chưa đủ số liệu</td></tr>`;
      const { V0, B } = w.c, d = B - V;
      return `<tr><td>${lab}</td><td>${money(V0)}</td><td>${money(V)} <span class="muted small">${pc(V / V0 - 1)}</span></td>
        <td>${money(B)} <span class="muted small">${pc(B / V0 - 1)}</span></td><td class="${Math.abs(d) < 0.05 ? "muted" : d > 0 ? "up" : "down"}">${signed(d)}</td></tr>`;
    }).join("");
  const last = [...W].reverse().find((w) => w.c);
  $("#btNote").innerHTML = !last ? "Chưa đủ số liệu thị trường để tính."
    : `Nếu đã tái cơ cấu theo phân bổ chiến lược đang chọn từ ${last.label} trước, danh mục hôm nay sẽ ${last.c.B >= V ? "cao" : "thấp"} hơn hiện trạng khoảng <b>${money(Math.abs(last.c.B - V))}</b>. ` +
      `Kết quả nhìn lại phụ thuộc mạnh vào diễn biến vàng trong giai đoạn đó, nên dùng để hiểu rủi ro tập trung chứ không để đoán tương lai.`;
  $("#btSum").textContent = last ? `Từ ${last.label} trước: mục tiêu ${signed(last.c.B - V)}` : "";

  // Cơ cấu từng lớp cho một mốc
  if (!W.some((w) => w.mo === btWin && w.c)) btWin = last ? last.mo : 12;
  $("#btWin").innerHTML = W.map((w) => `<button type="button" data-m="${w.mo}" class="${w.mo === btWin ? "on" : ""}"${w.c ? "" : " disabled"}>${w.label}</button>`).join("");
  $("#btWin").onclick = (e) => { const m = e.target.closest("button[data-m]"); if (!m || m.disabled) return; btWin = Number(m.dataset.m); renderBacktest(...btArgs); };
  const w = W.find((x) => x.mo === btWin), c = w?.c;
  if (!c) { $("#btClass").innerHTML = ""; return; }
  const luong = (v) => (c.sjc0 ? `<br><span class="muted small">${nf(v / c.sjc0, 2)} lượng</span>` : "");
  const span = (a, b, k) => (a < 0.05 && b < 0.05 ? `<span class="muted">—</span>` : `${money(a)} → ${money(b)}${k === "gold" ? luong(a) : ""}`);
  const keys = BT_KEYS.filter((k) => cur[k] || tgt[k]);
  $("#btClass").innerHTML = `<tr><th>Lớp</th><th>Lợi nhuận ${w.label}</th><th>Hiện trạng: lúc đó → hôm nay</th><th>Mục tiêu: lúc đó → hôm nay</th><th>Chênh lệch hôm nay</th></tr>` +
    keys.map((k) => { const d = c.pe[k] - (cur[k] || 0);
      return `<tr><td>${BT_LABEL[k]}</td><td>${pc(w.r[k])}</td><td>${span(c.past[k], cur[k] || 0, k)}</td><td>${span(c.ps[k], c.pe[k], k)}</td><td class="${Math.abs(d) < 0.05 ? "muted" : d > 0 ? "up" : "down"}">${signed(d)}</td></tr>`; }).join("") +
    `<tr><td><b>Tổng</b></td><td></td><td><b>${money(c.V0)} → ${money(V)}</b></td><td><b>${money(c.V0)} → ${money(c.B)}</b></td><td class="${c.B >= V ? "up" : "down"}"><b>${signed(c.B - V)}</b></td></tr>`;
}

/* ---------- Rà soát danh mục (nút ở Thực thi › Việc cần làm): tính trên trình duyệt, không gửi dữ liệu đi đâu ---------- */
let analysisAt = null;
function renderAnalysis(st) {
  const p = planCfg(), cur = currentMix(st), total = Object.values(cur).reduce((a, b) => a + b, 0), tgt = targetMix(total);
  const months = Math.max(1, S.settings.dcaMonths || 12), gs = S.settings, g = glide(st), c = optimal(p.profile, total).cme;
  const tol = Math.max(total * 0.01, 1), share = (v) => nf(total ? (v / total) * 100 : 0, 0) + "%";
  const rows = CLASSES.map(([k, name, color, tip]) => {
    const d = tgt[k] - cur[k];
    return { k, name, color, tip, d, act: Math.abs(d) < tol ? "hold" : d > 0 ? "up" : "down" };
  });
  // Lộ trình: vàng theo lịch bán (đợt tháng này, sau đó nhịp cơ bản, không dưới mức giữ); lớp khác chuyển đều trong `months` tháng
  const goldPxAvg = st.gold ? cur.gold / st.gold : P.latest.sjc_buy;
  let goldDone = 0;
  const goldAt = (m) => {
    let rem = g.remaining, sold = 0, i = 0;
    for (; i < m && rem > 1e-9; i++) { const q = i === 0 ? (g.qty === 0 ? 0 : Math.min(g.left, rem)) : Math.min(gs.tranche, rem); rem -= q; sold += q; if (gs.tranche <= 0 && i > 0) break; }
    return (st.gold - sold) * goldPxAvg;
  };
  for (let m = 1; m <= 60; m++) if (goldAt(m) <= goldAt(60) + 1e-6) { goldDone = m; break; }
  const at = (r, m) => (r.k === "gold" && r.act === "down" ? goldAt(m) : cur[r.k] + r.d * Math.min(m / months, 1));
  const marks = [3, 6, 12];
  const actTxt = { up: ["Tăng", "up"], down: ["Giảm", "down"], hold: ["Giữ", "muted"] };

  const list = (act) => rows.filter((r) => r.act === act).map((r) => `${r.name} (${r.d >= 0 ? "+" : "−"}${money(Math.abs(r.d))})`).join(", ");
  const now = [];
  for (const r of rows) {
    if (r.act === "hold") continue;
    if (r.k === "gold" && r.act === "down") now.push(g.qty === 0 ? `<b>Vàng:</b> tạm dừng bán tháng này (${esc(g.why)}).` : g.left > 0 ? `<b>Vàng:</b> bán ${nf(g.left, 2)} lượng tháng này (≈ ${money(g.left * P.latest.sjc_buy)}), sau đó ${gs.tranche} lượng/tháng; dự kiến xong sau ~${goldDone} tháng.` : `<b>Vàng:</b> đã bán đủ đợt tháng này.`);
    else now.push(`<b>${r.name}:</b> ${r.act === "up" ? "thêm" : "giảm"} khoảng <b>${money(Math.abs(r.d) / months)}/tháng</b> trong ${months} tháng. <span class="muted">${r.tip}</span>`);
  }

  const ph = typeof cyclePhase === "function" ? cyclePhase() : null, ff = typeof flowFactors === "function" ? flowFactors() : [];
  const fscore = ff.reduce((s, x) => s + x.dir, 0), rscore = recessionChecks().reduce((s, x) => s + (x.level === "alert" ? 2 : x.level === "warn" ? 1 : 0), 0);
  const prem = P.latest.premium ?? 0, dep = vn("deposit"), cpi = vn("cpiYoy"), other = secMix().other;
  const ctx = [
    ph && `Chu kỳ Việt Nam: pha <b>${ph.name}</b> (${esc(ph.axis)}): thường thuận cho ${ph.best.toLowerCase()}.`,
    ff.length && `Dòng tiền: ${fscore >= 2 ? "nghiêng về tài sản rủi ro" : fscore <= -2 ? "nghiêng về tài sản an toàn" : "trung tính, phân hóa"} (${fscore >= 0 ? "+" : ""}${fscore} điểm, xem Vĩ mô & dòng tiền).`,
    `Rủi ro suy thoái toàn cầu: ${rscore >= 6 ? "cao" : rscore >= 3 ? "trung bình" : "thấp"} (${rscore} điểm). ${rscore >= 3 ? "Giữ nhịp giải ngân đều, không mua dồn." : ""}`,
    `Premium SJC so với thế giới ${pct(prem)}: ${prem * 100 > gs.premHigh ? "cao, có lợi khi bán vàng" : prem * 100 < gs.premLow ? "thấp, nên tạm dừng bán" : "bình thường"}.`,
    dep && cpi && `Lãi tiết kiệm thực ${nf(dep.value - cpi.value, 1)}%/năm (${nf(dep.value, 1)}% − CPI ${nf(cpi.value, 2)}%).`,
    `Kỳ vọng lợi nhuận (CME, ${p.horizon} năm): ${OPT_KEYS.map((k) => `${LABEL[k]} ${nf(c.r[k], 1)}%`).join(" · ")}.`,
    other > 0 && `Tài sản khác (${money(other)}) không tính vào phân bổ.`,
  ].filter(Boolean);

  $("#analysisBox").innerHTML = `
    <p class="advice small">Danh mục đầu tư <b>${money(total)}</b>, khẩu vị rủi ro <b>${esc(PROFILES[p.profile].name)}</b>.
      ${list("down") ? `Cần giảm: <b class="down">${list("down")}</b>. ` : ""}${list("up") ? `Cần tăng: <b class="up">${list("up")}</b>. ` : ""}${list("hold") ? `Giữ: ${list("hold")}.` : ""}</p>
    <div class="tablewrap"><table><tr><th>Lớp tài sản</th><th>Hiện tại</th>${marks.map((m) => `<th>Sau ${m} tháng</th>`).join("")}<th>Mục tiêu</th><th>Hướng</th></tr>
      ${rows.map((r) => `<tr><td><span class="dot" style="background:${css(r.color)}"></span>${r.name}</td><td>${money(cur[r.k])} <span class="muted">${share(cur[r.k])}</span></td>
        ${marks.map((m) => `<td>${money(at(r, m))}</td>`).join("")}<td>${money(tgt[r.k])} <span class="muted">${share(tgt[r.k])}</span></td>
        <td class="${actTxt[r.act][1]}">${actTxt[r.act][0]}</td></tr>`).join("")}</table></div>
    <h3 class="sub">Việc cần làm</h3><ul class="pts">${now.map((x) => `<li>${x}</li>`).join("") || "<li>Danh mục đã khớp mục tiêu.</li>"}</ul>
    <h3 class="sub">Bối cảnh dùng để phân tích</h3><ul class="pts">${ctx.map((x) => `<li>${x}</li>`).join("")}</ul>
    <p class="muted small">Phân tích lúc ${analysisAt.toLocaleString("vi-VN")}. Mốc 3/6/12 tháng là ước tính: vàng theo lịch bán, các lớp khác chuyển đều trong ${months} tháng (chỉnh ở quy tắc lộ trình); tiền bán vàng đi qua tiền mặt rồi mới phân bổ. Không phải khuyến nghị đầu tư.</p>`;
}

function renderCompare(sim, cur, tgt, total, p) {
  const y = p.horizon, n = sim.n, fA = sim.A[n], fB = sim.B[n];
  const cagr = (v) => Math.pow(v / total, 1 / y) - 1;
  const incA = passiveIncome(cur, p), incB = passiveIncome(tgt, p);
  const row = (label, a, b, fmt, better = "higher") => {
    const d = b - a, good = better === "higher" ? d >= 0 : d <= 0;
    return `<tr><td>${label}</td><td>${fmt(a)}</td><td>${fmt(b)}</td><td class="${Math.abs(d) < 1e-9 ? "muted" : good ? "up" : "down"}">${fmt === pctFmt ? (d >= 0 ? "+" : "−") + nf(Math.abs(d * 100), 1) + " điểm" : signed(d)}</td></tr>`;
  };
  const pctFmt = (x) => pct(x);
  $("#cmpTable").innerHTML = `<tr><th>Sau ${y} năm</th><th>Hiện trạng</th><th>Mục tiêu</th><th>Chênh lệch</th></tr>` +
    row("Giá trị trung vị", fA[1], fB[1], money) +
    row(`Theo sức mua hôm nay (lạm phát ${nf(p.infl, 1)}%)`, fA[1] / Math.pow(1 + p.infl / 100, y), fB[1] / Math.pow(1 + p.infl / 100, y), money) +
    row("Lãi trung vị", fA[1] - total, fB[1] - total, signed) +
    row("Tăng trưởng/năm (trung vị)", cagr(fA[1]), cagr(fB[1]), pctFmt) +
    row("Kịch bản xấu (5%)", fA[0], fB[0], money) +
    row("Kịch bản tốt (95%)", fA[2], fB[2], money) +
    row("Sụt giảm tối đa (trung vị)", sim.mddA, sim.mddB, pctFmt) +
    row("Thu nhập thụ động năm đầu (/tháng)", incA / 12, incB / 12, money) +
    `<tr><td>Xác suất mục tiêu cao hơn hiện trạng</td><td colspan="3" style="text-align:center"><b>${nf(sim.beat * 100, 0)}%</b> số kịch bản</td></tr>`;
  $("#cmpSum").textContent = `${y} năm: mục tiêu ${signed(fB[1] - fA[1])} · cao hơn ở ${nf(sim.beat * 100, 0)}% kịch bản`;

  const labels = Array.from({ length: n + 1 }, (_, m) => (m % 12 === 0 ? `Năm ${m / 12}` : ""));
  const cA = css("--muted"), cB = css("--dep");
  const line = (label, data, color, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color + "26", pointRadius: 0, borderWidth: 2, ...extra });
  const data = {
    labels, datasets: [
      line("Hiện trạng – xấu 5%", sim.A.map((x) => x[0]), cA, { borderWidth: 0 }),
      line("Hiện trạng – tốt 95%", sim.A.map((x) => x[2]), cA, { borderWidth: 0, fill: "-1" }),
      line("Hiện trạng (trung vị)", sim.A.map((x) => x[1]), cA, { borderDash: [5, 4] }),
      line("Mục tiêu – xấu 5%", sim.B.map((x) => x[0]), cB, { borderWidth: 0 }),
      line("Mục tiêu – tốt 95%", sim.B.map((x) => x[2]), cB, { borderWidth: 0, fill: "-1" }),
      line("Mục tiêu (trung vị)", sim.B.map((x) => x[1]), cB),
    ],
  };
  const ink = css("--muted");
  const opt = {
    maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
    scales: { x: { ticks: { color: ink, autoSkip: false, maxRotation: 0, callback: (v, i) => labels[i] || null }, grid: { display: false } }, y: { ticks: { color: ink, callback: (v) => money(v) }, grid: { color: css("--line") } } },
    plugins: {
      legend: { labels: { color: ink, boxWidth: 12, filter: (it) => it.text.includes("trung vị") } },
      tooltip: { filter: (it) => it.dataset.label.includes("trung vị"), callbacks: { title: (it) => `Tháng ${it[0].dataIndex}`, label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } },
    },
  };
  if (charts.cmp) charts.cmp.destroy();
  charts.cmp = new Chart($("#chartCmp"), { type: "line", data, options: opt });
}

function bindPlan() {
  const form = $("#assumeForm");
  form.innerHTML = ASSUME_FIELDS.map(([k, l]) => `<label>${l}<input name="${k}" type="number" step="0.1"></label>`).join("") +
    `<button type="submit">Tính lại</button><button type="button" class="ghost" id="assumeReset">Về mặc định</button>`;
  const pick = (e) => {
    const c = e.target.closest?.(".pcard[data-profile]");
    if (!c || (e.type === "keydown" && e.key !== "Enter")) return;
    planCfg().profile = c.dataset.profile; save(); render();
  };
  $("#profileCards").addEventListener("click", pick);
  $("#recBox").addEventListener("click", (e) => {
    if (!e.target.closest("[data-apply-rec]")) return;
    planCfg().profile = planCfg().risk; save(); render();
  });
  $("#recBox").addEventListener("change", (e) => {
    if (!e.target.matches("[data-risk]")) return;
    const p = planCfg(); p.risk = e.target.value; p.profile = p.risk; save(); render();
  });
  $("#profileCards").addEventListener("keydown", pick);
  $("#btnAnalyze").onclick = () => { analysisAt = new Date(); renderAnalysis(derive()); $("#btnAnalyze").textContent = "Phân tích lại"; };
  $("#horizon").onclick = (e) => {
    const h = e.target.dataset?.h;
    if (!h) return;
    planCfg().horizon = Number(h); save(); render();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const p = planCfg();
    for (const [k] of ASSUME_FIELDS) { const v = num(form[k].value); p[k] = v == null || isNaN(v) ? DEFAULT_PLAN[k] : v; }
    save(); render();
  };
  $("#assumeReset").onclick = () => { S.settings.plan = { ...DEFAULT_PLAN, profile: planCfg().profile, horizon: planCfg().horizon }; save(); fillAssume(); render(); };
}
function fillAssume() {
  const p = planCfg(), form = $("#assumeForm");
  for (const [k] of ASSUME_FIELDS) form[k].value = p[k];
  document.querySelectorAll("#horizon button").forEach((b) => b.classList.toggle("on", Number(b.dataset.h) === p.horizon));
}
