"use strict";
/* Định hướng phân bổ (PROJECT_PLAN mục 4) và mô phỏng Monte Carlo: theo dự án và giữ nguyên.
   Dùng chung các hàm tiện ích trong app.js. Đơn vị: triệu VND. */

const PROFILES = {
  stage1: { name: "Giai đoạn 1 – ưu tiên tiết kiệm (hiện tại)" },
  conservative: { name: "Thận trọng", w: { liquid: 25, bond: 25, equity: 20, gold: 25, sat: 5 } },
  balanced: { name: "Cân bằng", w: { liquid: 15, bond: 20, equity: 35, gold: 20, sat: 10 } },
  growth: { name: "Tăng trưởng", w: { liquid: 10, bond: 10, equity: 45, gold: 15, sat: 15 } },
};
const CLASSES = [
  ["gold", "Vàng SJC", "--gold", "Giữ phần phòng thủ, bán dần theo lộ trình ở trên. Bán nhiều hơn khi premium SJC cao."],
  ["cash", "Tiền mặt (quỹ khẩn cấp)", "--cash", "6–12 tháng chi tiêu, để ở tài khoản thanh toán hoặc tiết kiệm linh hoạt."],
  ["dep", "Tiết kiệm có kỳ hạn", "--dep", "Bậc thang 3–6–12 tháng, chia nhiều ngân hàng (≤ 125 tr/ngân hàng để được bảo hiểm)."],
  ["bond", "Quỹ trái phiếu", "--bond", "Quỹ mở trái phiếu (DCBF, VFF, TCBF, SSIBF…). So sánh phí và lợi suất 3 năm."],
  ["equity", "Cổ phiếu lõi", "--equity", "Mua đều hằng tháng (DCA) ETF E1VFVN30, FUEVFVND, FUESSVFL hoặc quỹ mở cổ phiếu (DCDS, VESAF, VEOF…)."],
  ["sat", "Vệ tinh (tự giao dịch)", "--sat", "Chỉ sau 2–3 tháng paper trading. Chủ đề đang xem xét: đầu tư công, tiền số (tối đa vài %)."],
];
const DEFAULT_PLAN = {
  profile: "stage1", emergency: 60, horizon: 5,
  rGold: 6, vGold: 17, premTarget: 3, rDep: 7.5, rCash: 0.5, rBond: 6.5, vBond: 3, rEq: 11, vEq: 20, divEq: 2, rSat: 11, vSat: 30, infl: 4,
};
const ASSUME_FIELDS = [
  ["infl", "Lạm phát dài hạn (%)"],
  ["emergency", "Quỹ khẩn cấp (tr)"], ["rGold", "Vàng TG: tăng/năm (%)"], ["vGold", "Vàng: biến động/năm (%)"],
  ["premTarget", "Premium SJC sau 2 năm (%)"], ["rDep", "Lãi tiết kiệm (%)"], ["rCash", "Lãi tiền mặt (%)"],
  ["rBond", "Quỹ trái phiếu (%)"], ["vBond", "Quỹ TP: biến động (%)"], ["rEq", "Cổ phiếu lõi gồm cổ tức (%)"],
  ["vEq", "Cổ phiếu: biến động (%)"], ["divEq", "Cổ tức tiền mặt (%)"], ["rSat", "Vệ tinh (%)"], ["vSat", "Vệ tinh: biến động (%)"],
];

const planCfg = () => (S.settings.plan = { ...DEFAULT_PLAN, ...(S.settings.plan || {}) });

function currentMix(st) {
  return { gold: st.gold * P.latest.sjc_buy, cash: Math.max(st.cash, 0), dep: st.depVal, bond: 0, equity: 0, sat: 0 };
}

function targetMix(total, profileKey) {
  const p = planCfg(), prof = PROFILES[profileKey || p.profile] || PROFILES.stage1;
  if (!prof.w) {
    const gold = Math.min(S.settings.keep * P.latest.sjc_buy, total);
    const cash = Math.min(p.emergency, total - gold);
    return { gold, cash, dep: total - gold - cash, bond: 0, equity: 0, sat: 0 };
  }
  const w = prof.w, s = Object.values(w).reduce((a, b) => a + b, 0);
  const liquid = (total * w.liquid) / s, cash = Math.min(p.emergency, liquid);
  return { gold: (total * w.gold) / s, cash, dep: liquid - cash, bond: (total * w.bond) / s, equity: (total * w.equity) / s, sat: (total * w.sat) / s };
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
  const fixed = { cash: Math.exp(lg(p.rCash)), dep: Math.exp(lg(p.rDep)) };
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
        const eq = Math.exp(lg(p.rEq) + sd(p.vEq) * e);
        const sat = Math.exp(lg(p.rSat) + sd(p.vSat) * (0.8 * e + 0.6 * z3));
        const bd = Math.exp(lg(p.rBond) + sd(p.vBond) * z4);
        const gr = { gold: g, cash: fixed.cash, dep: fixed.dep, bond: bd, equity: eq, sat };
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
  return mix.dep * p.rDep / 100 + mix.cash * p.rCash / 100 + mix.bond * p.rBond / 100 + mix.equity * p.divEq / 100;
}

/** Vàng cần tăng bao nhiêu %/năm để giữ nguyên hòa với dự án (theo trung vị). */
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
  const cards = [{ key: "cur", name: "Giữ nguyên (hiện tại)", mix: cur, base: true }]
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
      ["Hơn giữ nguyên", c.base ? "—" : nf(sim.beat * 100, 0) + "% kịch bản"],
    ];
  }
  $("#profileCards").innerHTML = cards.map((c) => `
    <div class="pcard${c.base ? " base" : ""}" ${c.base ? "" : `data-profile="${c.key}" role="button" tabindex="0"`}>
      <h3>${esc(c.name)}</h3>
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
  const sel = $("#planProfile");
  if (!sel.options.length) sel.innerHTML = Object.entries(PROFILES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("");
  sel.value = p.profile;

  const rows = CLASSES.map(([k, name, color, tip]) => {
    const d = tgt[k] - cur[k];
    let act = "—";
    if (Math.abs(d) >= 1) {
      if (k === "gold") act = d < 0 ? `Bán ~${nf(-d / P.latest.sjc_buy, 1)} lượng (theo lộ trình)` : `Thêm ${money(d)}`;
      else act = d > 0 ? `Thêm ${money(d)}` : `Giảm ${money(-d)}`;
    }
    return `<tr><td><span class="dot" style="background:${css(color)}"></span>${name}</td>
      <td>${money(cur[k])} <span class="muted">${nf(total ? (cur[k] / total) * 100 : 0, 0)}%</span></td>
      <td>${money(tgt[k])} <span class="muted">${nf(total ? (tgt[k] / total) * 100 : 0, 0)}%</span></td>
      <td class="${Math.abs(d) < 1 ? "muted" : d > 0 ? "up" : "down"}">${act}</td>
      <td class="tip">${tip}</td></tr>`;
  });
  $("#planTable").innerHTML = `<tr><th>Lớp tài sản</th><th>Hiện tại</th><th>Mục tiêu</th><th>Cần làm</th><th class="tip">Gợi ý công cụ</th></tr>` + rows.join("");
  $("#planNote").textContent = p.profile === "stage1"
    ? `Giai đoạn 1: giữ ${S.settings.keep} lượng vàng, quỹ khẩn cấp ${money(p.emergency)}, phần còn lại gửi tiết kiệm (lãi ~8,2% đang cao, phần bù rủi ro cổ phiếu mỏng). Chuyển sang hồ sơ khác khi lãi suất giảm hoặc thị trường vào pha phục hồi.`
    : `Hồ sơ "${PROFILES[p.profile].name}" theo PROJECT_PLAN mục 4. Đây là đích đến sau 12–18 tháng: chuyển dần, không làm một lần. Vàng vẫn bán theo lộ trình.`;

  const { profile, ...rest } = p;
  const cardKey = JSON.stringify([cur, rest, S.settings.keep, P.latest.premium]);
  if (cardKey !== profileCardKey) { profileCardKey = cardKey; renderProfileCards(cur, total, p); }
  document.querySelectorAll(".pcard").forEach((c) => c.classList.toggle("on", c.dataset.profile === p.profile));

  // So sánh: chỉ chạy lại mô phỏng khi đầu vào thay đổi
  const key = JSON.stringify([cur, tgt, p, P.latest.premium]);
  if (key === simKey) return;
  simKey = key;
  const sim = simulate(cur, tgt, p.horizon, p);
  renderCompare(sim, cur, tgt, total, p);
  const be = breakeven(cur, tgt, p.horizon, p);
  $("#cmpBreakeven").innerHTML = be == null
    ? "Với các giả định này, giữ nguyên khó vượt dự án ngay cả khi vàng tăng 40%/năm."
    : `Điểm hòa: vàng thế giới cần tăng khoảng <b>${nf(be, 1)}%/năm</b> (trung vị, đã tính premium SJC co về ${nf(p.premTarget, 0)}%) thì giữ nguyên mới bằng dự án sau ${p.horizon} năm. ` +
      (be > p.rGold ? `Giả định hiện tại là ${nf(p.rGold, 1)}%/năm, nên theo dự án có lợi thế.` : `Giả định hiện tại là ${nf(p.rGold, 1)}%/năm, cao hơn điểm hòa, nên giữ nguyên đang có lợi thế về trung vị nhưng rủi ro tập trung cao hơn.`) +
      ` Để so sánh: 10 năm qua vàng quy VND tăng ~14%/năm, là giai đoạn đặc biệt mạnh.`;
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
  $("#cmpTable").innerHTML = `<tr><th>Sau ${y} năm</th><th>Giữ nguyên</th><th>Theo dự án</th><th>Chênh lệch</th></tr>` +
    row("Giá trị trung vị", fA[1], fB[1], money) +
    row(`Theo sức mua hôm nay (lạm phát ${nf(p.infl, 1)}%)`, fA[1] / Math.pow(1 + p.infl / 100, y), fB[1] / Math.pow(1 + p.infl / 100, y), money) +
    row("Lãi trung vị", fA[1] - total, fB[1] - total, signed) +
    row("Tăng trưởng/năm (trung vị)", cagr(fA[1]), cagr(fB[1]), pctFmt) +
    row("Kịch bản xấu (5%)", fA[0], fB[0], money) +
    row("Kịch bản tốt (95%)", fA[2], fB[2], money) +
    row("Sụt giảm tối đa (trung vị)", sim.mddA, sim.mddB, pctFmt) +
    row("Thu nhập thụ động năm đầu (/tháng)", incA / 12, incB / 12, money) +
    `<tr><td>Xác suất dự án cao hơn giữ nguyên</td><td colspan="3" style="text-align:center"><b>${nf(sim.beat * 100, 0)}%</b> số kịch bản</td></tr>`;

  const labels = Array.from({ length: n + 1 }, (_, m) => (m % 12 === 0 ? `Năm ${m / 12}` : ""));
  const cA = css("--muted"), cB = css("--dep");
  const line = (label, data, color, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color + "26", pointRadius: 0, borderWidth: 2, ...extra });
  const data = {
    labels, datasets: [
      line("Giữ nguyên – xấu 5%", sim.A.map((x) => x[0]), cA, { borderWidth: 0 }),
      line("Giữ nguyên – tốt 95%", sim.A.map((x) => x[2]), cA, { borderWidth: 0, fill: "-1" }),
      line("Giữ nguyên (trung vị)", sim.A.map((x) => x[1]), cA, { borderDash: [5, 4] }),
      line("Dự án – xấu 5%", sim.B.map((x) => x[0]), cB, { borderWidth: 0 }),
      line("Dự án – tốt 95%", sim.B.map((x) => x[2]), cB, { borderWidth: 0, fill: "-1" }),
      line("Theo dự án (trung vị)", sim.B.map((x) => x[1]), cB),
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
  $("#planProfile").onchange = (e) => { planCfg().profile = e.target.value; save(); render(); };
  const pick = (e) => {
    const c = e.target.closest?.(".pcard[data-profile]");
    if (!c || (e.type === "keydown" && e.key !== "Enter")) return;
    planCfg().profile = c.dataset.profile; save(); render();
  };
  $("#profileCards").addEventListener("click", pick);
  $("#profileCards").addEventListener("keydown", pick);
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
