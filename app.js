"use strict";
/* Quỹ Vàng: theo dõi danh mục vàng/tiền mặt/tiết kiệm và lộ trình bán vàng.
   Dữ liệu cá nhân chỉ nằm trong localStorage của trình duyệt. Đơn vị tiền: triệu VND. */

const KEY = "quyvang_v1";
const PRICE_URLS = ["https://raw.githubusercontent.com/theodore-ng/gold-portfolio/main/data/prices.json", "data/prices.json"];
const PNJ_URL = "https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00";
const DEFAULT_SETTINGS = { keep: 3, tranche: 1, extra: 1, premHigh: 10, premLow: 3, xauConfirm: 4450, xauSupport: 3900 };

let S = null;          // trạng thái người dùng
let P = null;          // giá: {updated, latest, history[]}
let livePNJ = false;
let range = 365;
const charts = {};

/* ---------- tiện ích ---------- */
const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 1) => Number(x).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (tr) => (Math.abs(tr) >= 1000 ? nf(tr / 1000, 2) + " tỷ" : nf(tr, 1) + " tr");
const signed = (tr) => (tr >= 0 ? "+" : "−") + money(Math.abs(tr));
const pct = (x) => (x >= 0 ? "+" : "−") + nf(Math.abs(x * 100), 1) + "%";
const cls = (x) => (x >= 0 ? "up" : "down");
const fmtDate = (d) => (d ? d.split("-").reverse().join("/") : "—");
const num = (v) => (v === "" || v == null ? null : Number(v));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 864e5;

/* ---------- lưu trữ: Supabase (nếu đã cấu hình) hoặc trình duyệt ---------- */
const CFG = window.QV_CONFIG || {};
const sb = CFG.supabaseUrl && CFG.supabaseKey && window.supabase ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
let user = null, saveTimer = null;

function save() {
  if (!sb) {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alert("Không lưu được vào trình duyệt: " + e.message); }
    return;
  }
  $("#saveState").textContent = "Đang lưu…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const { error } = await sb.from("portfolios").upsert({ user_id: user.id, data: S, updated_at: new Date().toISOString() });
    $("#saveState").innerHTML = error ? `<span class="warn">Lỗi lưu: ${esc(error.message)}</span>` : "Đã lưu ✓";
  }, 600);
}
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function validState(x) {
  return x && x.v === 1 && Array.isArray(x.lots) && Array.isArray(x.tx) && typeof x.cash0 === "number";
}

/* ---------- giá ---------- */
async function loadPrices() {
  for (const u of PRICE_URLS) {
    try {
      const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" });
      if (r.ok) { P = await r.json(); break; }
    } catch { /* thử nguồn tiếp theo */ }
  }
  try { // giá SJC trực tiếp từ PNJ (cho phép CORS)
    const j = await (await fetch(PNJ_URL, { cache: "no-store" })).json();
    const m = Object.fromEntries(j.data.map((r) => [r.masp, r]));
    const f = (v) => (Number(v) * 10) / 1000;
    const live = { sjc_buy: f(m.SJC.giamua), sjc_sell: f(m.SJC.giaban), ring_buy: f(m.N24K.giamua), ring_sell: f(m.N24K.giaban) };
    if (!P) P = { history: [], latest: { world: null, xau: null } };
    const d = today();
    let h = P.history.find((x) => x.d === d);
    if (!h) { h = { ...(P.history.at(-1) || {}), d }; P.history.push(h); }
    Object.assign(h, live, { est: false });
    Object.assign(P.latest, live, { d });
    livePNJ = true;
  } catch { /* dùng giá trong prices.json */ }
  if (P?.latest?.world) P.latest.premium = P.latest.sjc_sell / P.latest.world - 1;
}
const priceOn = (d) => {
  let best = null;
  for (const h of P.history) { if (h.d <= d) best = h; else break; }
  return best || P.history[0];
};

/* ---------- tính toán danh mục ---------- */
const txSorted = () => [...S.tx].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));

function depValue(dep, d) {
  const days = Math.max(0, Math.min(daysBetween(dep.date, d), dep.months * 30.4375));
  return dep.amount * (1 + (dep.rate / 100) * days / 365);
}

/** Phát lại giao dịch đến ngày `upto` (bao gồm). */
function derive(upto = "9999-12-31") {
  const lots = S.lots.map((l) => ({ ...l, rem: l.luong, src: "init" }));
  let cash = S.cash0, realized = 0, unknownSold = 0;
  const deps = {}, sales = [], errors = [];
  for (const t of txSorted()) {
    if (t.date > upto) break;
    if (t.type === "buy") {
      lots.push({ id: t.id, date: t.date, luong: t.luong, rem: t.luong, cost: t.cost, note: t.note, src: "tx" });
      if (t.fromCash) cash -= t.luong * (t.cost || 0);
    } else if (t.type === "sell") {
      let q = t.luong, pnl = 0, unknown = 0;
      for (const l of lots) {
        if (q <= 1e-9) break;
        const take = Math.min(l.rem, q);
        if (take <= 0) continue;
        l.rem -= take; q -= take;
        if (l.cost == null) unknown += take; else pnl += take * (t.price - l.cost);
      }
      if (q > 1e-9) errors.push(`Bán ${t.luong} lượng ngày ${fmtDate(t.date)} vượt số vàng đang có`);
      cash += t.luong * t.price; realized += pnl; unknownSold += unknown;
      sales.push({ ...t, pnl, unknown });
    } else if (t.type === "dep_open") {
      cash -= t.amount;
      deps[t.id] = { ...t, closed: null };
    } else if (t.type === "dep_close") {
      const dep = deps[t.depId];
      if (dep) { dep.closed = t.date; dep.received = t.received; cash += t.received; }
    } else if (t.type === "cash") {
      cash += t.amount;
    }
  }
  const depList = Object.values(deps);
  const depOpen = depList.filter((x) => !x.closed);
  return {
    lots, cash, realized, unknownSold, sales, errors, deps: depList,
    gold: lots.reduce((s, l) => s + l.rem, 0),
    depVal: depOpen.reduce((s, x) => s + depValue(x, upto === "9999-12-31" ? today() : upto), 0),
    interest: depList.reduce((s, x) => s + (x.closed ? x.received - x.amount : depValue(x, upto === "9999-12-31" ? today() : upto) - x.amount), 0),
  };
}

function valueOn(d) {
  const st = derive(d), p = priceOn(d);
  return { gold: st.gold * p.sjc_buy, cash: st.cash, dep: st.depVal, est: !!p.est };
}

/* ---------- lộ trình ---------- */
function glide(st) {
  const g = S.settings, L = P.latest, prem = L.premium ?? 0, xau = L.xau ?? 0;
  const sold = st.sales.reduce((s, x) => s + x.luong, 0);
  const gk = goldKeep(st);
  const remaining = Math.max(st.gold - gk.keep, 0);
  const month = today().slice(0, 7);
  const soldThisMonth = st.sales.filter((x) => x.date.startsWith(month)).reduce((s, x) => s + x.luong, 0);
  const pause = [], extra = [];
  if (prem * 100 < g.premLow) pause.push(`premium ${pct(prem)} < ${g.premLow}%`);
  if (xau && xau < g.xauSupport) pause.push(`vàng TG $${nf(xau, 0)} < $${nf(g.xauSupport, 0)}`);
  if (prem * 100 > g.premHigh) extra.push(`premium ${pct(prem)} > ${g.premHigh}%`);
  if (xau >= g.xauConfirm) extra.push(`vàng TG $${nf(xau, 0)} ≥ $${nf(g.xauConfirm, 0)}`);
  let qty, why;
  if (pause.length) { qty = 0; why = pause.join(", ") + " → tạm dừng bán"; }
  else if (extra.length) { qty = g.tranche + g.extra; why = extra.join(", ") + " → bán thêm 1 đợt"; }
  else { qty = g.tranche; why = `premium ${pct(prem)}, vàng TG $${nf(xau, 0)} trong vùng bình thường`; }
  qty = Math.min(qty, remaining);
  return { sold, remaining, qty, why, soldThisMonth, left: Math.max(qty - soldThisMonth, 0), gk };
}

/* ---------- hiển thị ---------- */
function render() {
  const st = derive();
  const L = P.latest, d = today();
  const goldVal = st.gold * L.sjc_buy;
  const total = goldVal + st.cash + st.depVal;
  const prevDate = P.history.length > 1 ? P.history.at(-2).d : d;
  const prev = valueOn(prevDate), prevTotal = prev.gold + prev.cash + prev.dep;
  const unreal = st.lots.reduce((s, l) => s + (l.cost == null ? 0 : l.rem * (L.sjc_buy - l.cost)), 0);
  const basis = st.lots.reduce((s, l) => s + (l.cost == null ? 0 : l.luong * l.cost), 0);
  const unknownHeld = st.lots.reduce((s, l) => s + (l.cost == null ? l.rem : 0), 0);
  const pnl = unreal + st.realized + st.interest;

  $("#priceStamp").textContent = `Giá SJC: ${livePNJ ? "trực tiếp PNJ" : "theo file giá"} · vàng TG cập nhật ${P.updated ? new Date(P.updated).toLocaleString("vi-VN") : "—"}`;
  $("#kTotal").textContent = money(total);
  $("#kDay").innerHTML = `<span class="${cls(total - prevTotal)}">${signed(total - prevTotal)} (${pct(prevTotal ? total / prevTotal - 1 : 0)})</span> so với ${fmtDate(prevDate)}`;
  $("#kPnl").innerHTML = `<span class="${cls(pnl)}">${signed(pnl)}</span>`;
  $("#kPnlNote").innerHTML = (basis ? `${pct(pnl / basis)} trên giá vốn vàng · ` : "") +
    `chưa chốt ${signed(unreal)} · đã chốt ${signed(st.realized)} · lãi TK ${signed(st.interest)}` +
    (unknownHeld + st.unknownSold > 0 ? `<br><span class="warn">Chưa tính ${nf(unknownHeld + st.unknownSold, 2)} lượng chưa có giá vốn</span>` : "");
  $("#kGold").textContent = `${nf(st.gold, 2)} lượng`;
  $("#kGoldVal").textContent = `${money(goldVal)} theo giá mua vào`;
  $("#kSjc").textContent = `${nf(L.sjc_buy, 1)} / ${nf(L.sjc_sell, 1)}`;
  $("#kPrem").textContent = `Premium ${pct(L.premium ?? 0)} · TG $${nf(L.xau ?? 0, 0)} ≈ ${nf(L.world ?? 0, 1)} tr`;
  if (st.errors.length) alert(st.errors.join("\n"));

  // lộ trình
  const g = glide(st), gs = S.settings;
  const plan = g.sold + g.remaining;
  $("#glideBar").style.width = (plan ? (g.sold / plan) * 100 : 100) + "%";
  const keepTxt = g.gk.exact == null
    ? `giữ lại ${nf(g.gk.keep, 0)} lượng (Giai đoạn 1)`
    : `giữ lại ${nf(g.gk.keep, 0)} lượng (hồ sơ ${PROFILES[g.gk.profile].name}: ≈ ${nf(g.gk.exact, 1)} lượng, làm tròn)`;
  $("#glideProgress").textContent = `Đã bán ${nf(g.sold, 2)} / ${nf(plan, 2)} lượng · ${keepTxt} · còn ${nf(g.remaining, 2)} lượng`;
  let adv;
  if (g.remaining <= 0) adv = "✅ Đã hoàn tất lộ trình bán vàng.";
  else if (g.qty === 0) adv = `⏸ Tháng này: tạm dừng bán. ${g.why}.`;
  else if (g.left === 0) adv = `✅ Tháng này đã bán ${nf(g.soldThisMonth, 2)} lượng, đủ đợt đề xuất (${nf(g.qty, 2)}). Đợt tiếp theo: tháng sau.`;
  else adv = `Đợt tháng này: <b>${nf(g.left, 2)} lượng</b> (≈ ${money(g.left * L.sjc_buy)})${g.soldThisMonth ? `, đã bán ${nf(g.soldThisMonth, 2)}` : ""}. Lý do: ${esc(g.why)}.`;
  $("#glideAdvice").innerHTML = adv;
  $("#glideHead").innerHTML = `Hồ sơ đang áp dụng: <b>${esc(PROFILES[planCfg().profile]?.name || "")}</b> → giữ <b>${nf(g.gk.keep, 0)} lượng</b>, cần bán <b>${nf(g.remaining, 2)} lượng</b>. Đổi hồ sơ ở mục Định hướng phân bổ.`;

  // Lịch bán dự kiến: tháng này theo tín hiệu hiện tại, các tháng sau theo nhịp cơ bản
  const sched = [];
  let rem = g.remaining, [yy, mm] = today().split("-").map(Number);
  for (let i = 0; rem > 1e-9 && i < 36; i++) {
    const q = i === 0 ? (g.qty === 0 ? 0 : Math.min(g.left, rem)) : Math.min(gs.tranche, rem);
    sched.push({ label: `${String(mm).padStart(2, "0")}/${yy}`, q, now: i === 0, pause: i === 0 && g.qty === 0 });
    rem -= q;
    if (++mm > 12) { mm = 1; yy++; }
    if (i > 0 && gs.tranche <= 0) break;
  }
  $("#glideSchedule").innerHTML = g.remaining <= 0 ? "" :
    `<div class="chips">${sched.map((s) => `<span class="sch${s.now ? " now" : ""}${s.pause ? " pause" : ""}"><small>${s.label}</small><b>${s.pause ? "dừng" : nf(s.q, s.q % 1 ? 1 : 0) + " lượng"}</b></span>`).join("")}</div>
     <p class="muted small">Dự kiến hoàn tất: <b>${sched.at(-1)?.label || "—"}</b> (${sched.length} tháng). Các tháng sau tính theo nhịp cơ bản ${gs.tranche} lượng/tháng; khi đến kỳ sẽ tăng/giảm theo premium và giá vàng.</p>`;
  $("#glideRule").textContent = `Số lượng giữ lại đi theo hồ sơ ở mục Định hướng phân bổ. Quy tắc: ${gs.tranche} lượng/tháng; bán thêm ${gs.extra} khi premium > ${gs.premHigh}% hoặc vàng TG ≥ $${gs.xauConfirm}; dừng khi premium < ${gs.premLow}% hoặc vàng TG < $${gs.xauSupport}. Tiền thu về: quỹ khẩn cấp → tiết kiệm bậc thang 3–6–12 tháng.`;

  renderLots(st, L);
  renderDeps(st);
  renderTx(st);
  renderAlloc(goldVal, st.cash, st.depVal, total);
  renderCharts(st);
  renderPlan(st);
  renderInflation(st);
  $("#cashNow").textContent = money(st.cash);
  sellPreview();
}

function renderLots(st, L) {
  const rows = st.lots.map((l, i) => {
    const val = l.rem * L.sjc_buy, gain = l.cost == null ? null : l.rem * (L.sjc_buy - l.cost);
    return `<tr><td>${i + 1}. ${esc(l.note || "Lô vàng")}</td><td>${fmtDate(l.date)}</td>
      <td>${nf(l.rem, 2)} / ${nf(l.luong, 2)}</td>
      <td><input type="number" step="0.01" min="0" value="${l.cost ?? ""}" placeholder="?" data-cost="${l.src}:${l.id}"></td>
      <td>${money(val)}</td>
      <td class="${gain == null ? "muted" : cls(gain)}">${gain == null ? "chưa có giá vốn" : `${signed(gain)} (${pct(L.sjc_buy / l.cost - 1)})`}</td></tr>`;
  });
  $("#lotsTable").innerHTML = `<tr><th>Lô</th><th>Ngày mua</th><th>Còn / ban đầu (lượng)</th><th>Giá vốn (tr/lượng)</th><th>Giá trị</th><th>Lãi/lỗ chưa chốt</th></tr>` + rows.join("");
}

function renderDeps(st) {
  if (!st.deps.length) { $("#depTable").innerHTML = `<tr><td class="muted">Chưa có khoản tiết kiệm nào.</td></tr>`; return; }
  const d = today();
  const rows = st.deps.map((x) => {
    const mature = new Date(x.date); mature.setMonth(mature.getMonth() + Number(x.months));
    const m = mature.toLocaleDateString("sv-SE");
    const cur = x.closed ? x.received : depValue(x, d);
    return `<tr><td>${esc(x.bank)}</td><td>${fmtDate(x.date)}</td><td>${x.months} th · ${nf(x.rate, 2)}%</td><td>${money(x.amount)}</td>
      <td class="up">${signed(cur - x.amount)}</td><td>${fmtDate(m)}${!x.closed && m <= d ? " <b>· đáo hạn</b>" : ""}</td>
      <td>${x.closed ? `<span class="muted">Đã tất toán ${fmtDate(x.closed)}</span>` : `<button class="ghost" data-close="${x.id}">Tất toán</button>`}</td></tr>`;
  });
  $("#depTable").innerHTML = `<tr><th>Ngân hàng</th><th>Ngày gửi</th><th>Kỳ hạn · lãi</th><th>Gốc</th><th>Lãi dồn tích</th><th>Đáo hạn</th><th></th></tr>` + rows.join("");
}

const TX_LABEL = { sell: "Bán vàng", buy: "Mua vàng", dep_open: "Gửi tiết kiệm", dep_close: "Tất toán TK", cash: "Tiền mặt" };
function renderTx(st) {
  const saleById = Object.fromEntries(st.sales.map((s) => [s.id, s]));
  const rows = txSorted().reverse().map((t) => {
    let detail = "", flow = 0;
    if (t.type === "sell") {
      const s = saleById[t.id]; flow = t.luong * t.price;
      detail = `${nf(t.luong, 2)} lượng × ${nf(t.price, 1)} tr · lãi ${s ? signed(s.pnl) : "—"}${s?.unknown ? ` (${nf(s.unknown, 2)} lượng chưa có giá vốn)` : ""}`;
    } else if (t.type === "buy") { flow = t.fromCash ? -t.luong * (t.cost || 0) : 0; detail = `${nf(t.luong, 2)} lượng${t.cost ? " × " + nf(t.cost, 1) + " tr" : ""}`; }
    else if (t.type === "dep_open") { flow = -t.amount; detail = `${esc(t.bank)} · ${t.months} tháng · ${nf(t.rate, 2)}%`; }
    else if (t.type === "dep_close") { flow = t.received; detail = "Nhận gốc + lãi"; }
    else if (t.type === "cash") { flow = t.amount; }
    if (t.note) detail += (detail ? " · " : "") + esc(t.note);
    return `<tr><td>${fmtDate(t.date)}</td><td>${TX_LABEL[t.type]}</td><td style="text-align:left">${detail}</td>
      <td class="${flow ? cls(flow) : "muted"}">${flow ? signed(flow) : "—"}</td><td><button class="ghost" data-del="${t.id}">Xóa</button></td></tr>`;
  });
  $("#txTable").innerHTML = rows.length
    ? `<tr><th>Ngày</th><th>Loại</th><th style="text-align:left">Chi tiết</th><th>Tiền mặt</th><th></th></tr>` + rows.join("")
    : `<tr><td class="muted">Chưa có giao dịch.</td></tr>`;
}

function renderAlloc(gold, cash, dep, total) {
  const items = [["Vàng", gold, css("--gold")], ["Tiền mặt", cash, css("--cash")], ["Tiết kiệm", dep, css("--dep")]];
  $("#allocTable").innerHTML = `<tr><th>Lớp</th><th>Giá trị</th><th>Tỷ trọng</th></tr>` +
    items.map(([n, v, c]) => `<tr><td><span class="dot" style="background:${c}"></span>${n}</td><td>${money(v)}</td><td>${nf(total ? (v / total) * 100 : 0, 1)}%</td></tr>`).join("");
  const data = { labels: items.map((x) => x[0]), datasets: [{ data: items.map((x) => Math.max(x[1], 0)), backgroundColor: items.map((x) => x[2]), borderWidth: 0 }] };
  if (charts.alloc) { charts.alloc.data = data; charts.alloc.update(); return; }
  charts.alloc = new Chart($("#chartAlloc"), { type: "doughnut", data, options: { cutout: "68%", plugins: { legend: { display: false } }, maintainAspectRatio: false } });
}

function renderCharts(st) {
  const H = range ? P.history.slice(-range) : P.history;
  const labels = H.map((h) => fmtDate(h.d).slice(0, 5) + (range === 0 || range > 365 ? "/" + h.d.slice(2, 4) : ""));
  const vals = H.map((h) => valueOn(h.d));
  const est = H.map((h) => !!h.est);
  const dash = (ctx) => (est[ctx.p1DataIndex] ? [5, 4] : undefined);
  const grid = css("--line"), ink = css("--muted");
  const base = {
    maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, animation: false,
    scales: { x: { ticks: { color: ink, maxTicksLimit: 8 }, grid: { display: false } }, y: { ticks: { color: ink }, grid: { color: grid } } },
    plugins: { legend: { labels: { color: ink, boxWidth: 12 } } },
  };
  const ds = (label, key, color) => ({ label, data: vals.map((v) => v[key]), borderColor: color, backgroundColor: color + "55", fill: true, pointRadius: 0, borderWidth: 1.5, segment: { borderDash: dash } });
  const fund = { labels, datasets: [ds("Vàng", "gold", css("--gold")), ds("Tiền mặt", "cash", css("--cash")), ds("Tiết kiệm", "dep", css("--dep"))] };
  const fundOpt = structuredClone(base);
  fundOpt.scales.y.stacked = true;
  fundOpt.scales.y.ticks.callback = (v) => money(v);
  fundOpt.plugins.tooltip = { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}`, footer: (items) => "Tổng: " + money(items.reduce((s, i) => s + i.parsed.y, 0)) + (est[items[0].dataIndex] ? " (giá ước tính)" : "") } };
  if (charts.fund) charts.fund.destroy();
  charts.fund = new Chart($("#chartFund"), { type: "line", data: fund, options: fundOpt });

  const saleIdx = Object.fromEntries(H.map((h, i) => [h.d, i]));
  const salePts = H.map(() => null);
  st.sales.forEach((s) => { if (s.date in saleIdx) salePts[saleIdx[s.date]] = s.price; });
  const gold = {
    labels, datasets: [
      { label: "SJC mua vào", data: H.map((h) => h.sjc_buy), borderColor: css("--gold"), pointRadius: 0, borderWidth: 2, segment: { borderDash: dash } },
      { label: "Thế giới quy đổi", data: H.map((h) => h.world), borderColor: css("--dep"), pointRadius: 0, borderWidth: 1.5 },
      { label: "Bạn đã bán", data: salePts, type: "scatter", backgroundColor: css("--down"), pointRadius: 6, showLine: false },
    ],
  };
  const goldOpt = structuredClone(base);
  goldOpt.plugins.tooltip = { callbacks: { label: (c) => (c.parsed.y == null ? null : `${c.dataset.label}: ${nf(c.parsed.y, 1)} tr`) } };
  if (charts.gold) charts.gold.destroy();
  charts.gold = new Chart($("#chartGold"), { type: "line", data: gold, options: goldOpt });
}

function sellPreview() {
  const f = $("#sellForm"), q = num(f.luong.value), p = num(f.price.value);
  if (!q || !p) { $("#sellPreview").textContent = ""; return; }
  const st = derive();
  if (q > st.gold + 1e-9) { $("#sellPreview").innerHTML = `<span class="warn">Vượt số vàng đang có (${nf(st.gold, 2)} lượng)</span>`; return; }
  let left = q, pnl = 0, unk = 0;
  for (const l of st.lots) { const t = Math.min(l.rem, left); if (t <= 0) continue; left -= t; if (l.cost == null) unk += t; else pnl += t * (p - l.cost); }
  $("#sellPreview").innerHTML = `Thu về ${money(q * p)} · lãi chốt ${signed(pnl)}${unk ? ` (chưa tính ${nf(unk, 2)} lượng chưa có giá vốn)` : ""} · còn lại ${nf(st.gold - q, 2)} lượng`;
}

/* ---------- thao tác ---------- */
function addTx(t) {
  t.id = t.id || uid(); t.seq = Date.now();
  S.tx.push(t);
  if (derive().errors.length) { S.tx.pop(); alert("Giao dịch không hợp lệ: " + derive().errors.join("; ")); return false; }
  save(); render(); return true;
}

function bind() {
  document.querySelectorAll('input[type=date]').forEach((i) => (i.value = today()));
  bindPlan();
  bindMacro();

  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, u = f.user.value.trim().toLowerCase();
    const email = u.includes("@") ? u : `${u}@${CFG.emailDomain}`;
    $("#loginErr").textContent = "";
    f.querySelector("button").disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: f.pass.value });
    f.querySelector("button").disabled = false;
    f.pass.value = "";
    if (error) { $("#loginErr").textContent = "Sai tên đăng nhập hoặc mật khẩu."; return; }
    await afterLogin(data.user);
  };
  $("#btnLogout").onclick = async () => { await sb.auth.signOut(); location.reload(); };

  $("#setupForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    S = { v: 1, created: today(), cash0: num(f.cash.value) || 0, lots: [{ id: uid(), date: null, luong: num(f.luong.value), cost: num(f.cost.value), note: "Vàng SJC ban đầu" }], tx: [], settings: { ...DEFAULT_SETTINGS } };
    save(); start();
  };

  $("#sellForm").oninput = sellPreview;
  $("#sellForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const t = { type: "sell", date: f.date.value, luong: num(f.luong.value), price: num(f.price.value), note: f.note.value.trim() };
    if (!confirm(`Ghi nhận bán ${nf(t.luong, 2)} lượng × ${nf(t.price, 1)} tr = ${money(t.luong * t.price)} vào tiền mặt?`)) return;
    if (addTx(t)) { f.luong.value = ""; f.note.value = ""; alert("Đã ghi nhận. Nhớ xuất file sao lưu."); }
  };

  $("#depForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, amount = num(f.amount.value);
    if (amount > derive().cash + 1e-9 && !confirm("Số tiền lớn hơn tiền mặt đang có. Vẫn ghi nhận?")) return;
    if (amount > 125) alert("Lưu ý: vượt hạn mức bảo hiểm tiền gửi 125 tr/người/ngân hàng.");
    if (addTx({ type: "dep_open", date: f.date.value, bank: f.bank.value.trim(), amount, rate: num(f.rate.value), months: num(f.months.value) })) f.amount.value = "";
  };

  $("#cashForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (addTx({ type: "cash", date: f.date.value, amount: num(f.amount.value), note: f.note.value.trim() })) { f.amount.value = ""; f.note.value = ""; }
  };

  $("#lotForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const t = { type: "buy", date: f.date.value || today(), luong: num(f.luong.value), cost: num(f.cost.value), note: f.note.value.trim(), fromCash: f.fromCash.checked };
    if (t.fromCash && t.cost == null) { alert("Cần giá vốn để trừ vào tiền mặt."); return; }
    if (addTx(t)) f.reset(), (f.date.value = today());
  };

  document.addEventListener("change", (e) => {
    const k = e.target.dataset?.cost;
    if (!k) return;
    const [src, id] = k.split(":"), v = num(e.target.value);
    const obj = src === "init" ? S.lots.find((l) => l.id === id) : S.tx.find((t) => t.id === id);
    if (obj) { obj.cost = v; save(); render(); }
  });

  document.addEventListener("click", (e) => {
    const del = e.target.dataset?.del, close = e.target.dataset?.close;
    if (del) {
      const t = S.tx.find((x) => x.id === del);
      if (!confirm(`Xóa giao dịch "${TX_LABEL[t.type]}" ngày ${fmtDate(t.date)}?`)) return;
      const backup = S.tx;
      S.tx = S.tx.filter((x) => x.id !== del && x.depId !== del);
      const err = derive().errors;
      if (err.length) { S.tx = backup; alert("Không xóa được: " + err.join("; ")); return; }
      save(); render();
    }
    if (close) {
      const dep = derive().deps.find((x) => x.id === close);
      const date = prompt("Ngày tất toán (YYYY-MM-DD):", today());
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const rec = num(prompt("Số tiền nhận về (tr VND, gồm gốc + lãi):", depValue(dep, date).toFixed(2)));
      if (rec == null || isNaN(rec)) return;
      addTx({ type: "dep_close", date, depId: close, received: rec });
    }
    const r = e.target.dataset?.r;
    if (r != null && e.target.closest("#range")) {
      range = Number(r);
      document.querySelectorAll("#range button").forEach((b) => b.classList.toggle("on", b === e.target));
      renderCharts(derive());
    }
  });

  $("#btnExport").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }));
    a.download = `quy-vang-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.querySelectorAll("[data-import]").forEach((inp) => (inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const x = JSON.parse(await file.text());
      if (!validState(x)) throw new Error("file không đúng định dạng Quỹ Vàng");
      if (S && !confirm("Thay toàn bộ dữ liệu hiện tại bằng file này?")) return;
      x.settings = { ...DEFAULT_SETTINGS, ...(x.settings || {}) };
      S = x; save(); start();
    } catch (err) { alert("Không nhập được: " + err.message); }
    inp.value = "";
  }));
  $("#btnReset").onclick = async () => {
    if (!confirm("Xóa toàn bộ dữ liệu trong trình duyệt này? Hãy xuất sao lưu trước.")) return;
    if (prompt('Gõ "XOA" để xác nhận') !== "XOA") return;
    try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
    if (sb) await sb.from("portfolios").delete().eq("user_id", user.id);
    location.reload();
  };

  $("#setForm").onsubmit = (e) => {
    e.preventDefault();
    for (const k of Object.keys(DEFAULT_SETTINGS)) S.settings[k] = num(e.target[k].value) ?? DEFAULT_SETTINGS[k];
    save(); render();
  };
}

function start() {
  $("#setup").hidden = true;
  $("#app").hidden = false;
  S.settings = { ...DEFAULT_SETTINGS, ...(S.settings || {}) };
  const f = $("#setForm");
  for (const k of Object.keys(DEFAULT_SETTINGS)) f[k].value = S.settings[k];
  $("#sellForm").price.value = P.latest.sjc_buy;
  fillAssume();
  renderMacroStatic();
  render();
}

async function afterLogin(u) {
  user = u;
  $("#login").hidden = true;
  const { data: prof } = await sb.from("profiles").select("username, role").eq("id", u.id).maybeSingle();
  $("#userBox").hidden = false;
  $("#userName").textContent = prof?.username || u.email.split("@")[0];
  $("#userRole").hidden = prof?.role !== "admin";
  const { data, error } = await sb.from("portfolios").select("data").eq("user_id", u.id).maybeSingle();
  if (error) { alert("Không tải được dữ liệu: " + error.message); return; }
  if (data && validState(data.data)) { S = data.data; start(); return; }
  const local = load(); // lần đầu đăng nhập: đề nghị chuyển dữ liệu đang có trên trình duyệt lên tài khoản
  if (validState(local) && confirm("Tìm thấy dữ liệu trên trình duyệt này. Chuyển lên tài khoản của bạn?")) {
    S = local; save(); start(); return;
  }
  $("#setupNote").textContent = "Dữ liệu được lưu vào tài khoản của bạn, chỉ bạn xem được. Nhập file sao lưu nếu đã có.";
  $("#setup").hidden = false;
}

(async function main() {
  bind();
  await Promise.all([loadPrices(), loadMacro()]);
  if (!P || !P.history?.length) { $("#priceStamp").innerHTML = '<span class="warn">Không tải được giá vàng. Kiểm tra kết nối mạng.</span>'; return; }
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session) await afterLogin(data.session.user);
    else $("#login").hidden = false;
    return;
  }
  S = load();
  if (validState(S)) start();
  else $("#setup").hidden = false;
})();
