"use strict";
/* Vĩ mô, dòng tiền, rủi ro suy thoái, lạm phát & sức mua. Dùng tiện ích trong app.js. */

let M = null, VNM = null, INV = null, NEWS = null, OUTLOOK = null, flowPeriod = "chg3m";
const RAW = "https://raw.githubusercontent.com/theodore-ng/gold-portfolio/main/data/";

async function fetchJson(name) {
  for (const u of [RAW + name, "data/" + name]) {
    try { const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" }); if (r.ok) return await r.json(); } catch { /* thử nguồn sau */ }
  }
  return null;
}
async function loadMacro() {
  [M, VNM, INV, NEWS, OUTLOOK] = await Promise.all(["macro.json", "vn_macro.json", "invest.json", "news.json", "vn_outlook.json"].map(fetchJson));
}
const vn = (k) => VNM?.items.find((x) => x.key === k);
const cpiRate = () => (vn("cpiYoy")?.value ?? 4) / 100;
const realRate = (nominal) => (1 + nominal) / (1 + cpiRate()) - 1;

/* ---------- Việt Nam ---------- */
function renderVN() {
  if (!VNM) { $("#vnTiles").innerHTML = '<p class="muted">Chưa tải được số liệu Việt Nam.</p>'; return; }
  const show = ["gdpQ", "gdpYtd", "cpiYoy", "coreYoy", "credit", "publicInv", "deposit"];
  $("#vnTiles").innerHTML = show.map(vn).filter(Boolean).map((x) =>
    `<div class="tile"><span>${esc(x.name)}</span><b>${nf(x.value, 2)}%</b><small>${esc(x.period)} · ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.source)}</a>` : esc(x.source)}</small></div>`).join("") +
    `<div class="tile"><span>Lãi suất thực tiết kiệm</span><b class="${cls(realRate((vn("deposit")?.value ?? 0) / 100))}">${pct(realRate((vn("deposit")?.value ?? 0) / 100))}</b><small>= lãi tiết kiệm trừ lạm phát</small></div>`;
  $("#vnNote").textContent = `Số liệu đến ${fmtDate(VNM.asOf)}, cập nhật thủ công mỗi tháng sau khi Cục Thống kê công bố.`;
}

/* ---------- Dòng tiền ---------- */
function renderFlows() {
  if (!M) { $("#flowSummary").textContent = "Chưa tải được dữ liệu thị trường."; return; }
  const items = Object.values(M.markets).filter((x) => x.unit === "%" && x[flowPeriod] != null).sort((a, b) => b[flowPeriod] - a[flowPeriod]);
  const label = { chg1m: "1 tháng", chg3m: "3 tháng", chg1y: "1 năm" }[flowPeriod];
  const up = css("--up"), down = css("--down"), ink = css("--muted");
  const data = { labels: items.map((x) => x.name), datasets: [{ data: items.map((x) => x[flowPeriod] * 100), backgroundColor: items.map((x) => (x[flowPeriod] >= 0 ? up : down)), borderRadius: 4 }] };
  if (charts.flow) charts.flow.destroy();
  charts.flow = new Chart($("#chartFlow"), {
    type: "bar", data,
    options: {
      indexAxis: "y", maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${pct(c.parsed.x / 100)} trong ${label}` } } },
      scales: { x: { ticks: { color: ink, callback: (v) => v + "%" }, grid: { color: css("--line") } }, y: { ticks: { color: ink }, grid: { display: false } } },
    },
  });
  const top = items.filter((x) => x[flowPeriod] > 0).slice(0, 3).map((x) => `${x.name} ${pct(x[flowPeriod])}`).join(", ") || "không có";
  const bot = items.filter((x) => x[flowPeriod] < 0).slice(-3).reverse().map((x) => `${x.name} ${pct(x[flowPeriod])}`).join(", ") || "không có";
  const pts = ["us10y", "us3m", "vix"].map((k) => M.markets[k]).filter(Boolean);
  $("#flowSummary").innerHTML = `<b>${label}:</b> tiền chảy vào <span class="up">${esc(top)}</span>; rút khỏi <span class="down">${esc(bot)}</span>.<br>` +
    pts.map((x) => `${esc(x.name)}: <b>${nf(x.last, 2)}</b> (${x[flowPeriod] >= 0 ? "+" : "−"}${nf(Math.abs(x[flowPeriod] ?? 0), 2)} điểm)`).join(" · ");
}

/* ---------- Rủi ro suy thoái ---------- */
function recessionChecks() {
  const f = M?.fred || {}, m = M?.markets || {}, out = [];
  const add = (name, value, level, why) => out.push({ name, value, level, why });
  const t = f.T10Y3M;
  if (t) add("Đường cong lợi suất (10 năm − 3 tháng)", `${nf(t.last, 2)} điểm`,
    t.last < 0 ? "alert" : t.min24m < 0 ? "warn" : "ok",
    t.last < 0 ? "Đang đảo ngược: tín hiệu báo trước suy thoái Mỹ đáng tin nhất trong lịch sử."
      : t.min24m < 0 ? `Vừa thoát đảo ngược (thấp nhất 24 tháng: ${nf(t.min24m, 2)}). Lịch sử: suy thoái thường bắt đầu sau khi đường cong dốc trở lại.` : "Bình thường.");
  const s = f.SAHMREALTIME;
  if (s) add("Quy tắc Sahm (thất nghiệp Mỹ)", nf(s.last, 2), s.last >= 0.5 ? "alert" : s.last >= 0.3 ? "warn" : "ok", "≥ 0,5: suy thoái thường đã bắt đầu.");
  const r = f.RECPROUSM156N;
  if (r) add("Xác suất suy thoái Mỹ (mô hình)", `${nf(r.last, 1)}%`, r.last > 30 ? "alert" : r.last > 10 ? "warn" : "ok", `Mô hình Chauvet–Piger, số liệu ${fmtDate(r.date)}.`);
  const h = f.BAMLH0A0HYM2;
  if (h) add("Chênh lệch trái phiếu rủi ro cao", `${nf(h.last, 2)}%`, h.last > 6 ? "alert" : h.last > 4.5 ? "warn" : "ok", "Đo mức lo ngại vỡ nợ doanh nghiệp. > 6%: căng thẳng tín dụng.");
  if (m.vix) add("VIX (chỉ số sợ hãi)", nf(m.vix.last, 1), m.vix.last > 30 ? "alert" : m.vix.last > 20 ? "warn" : "ok", "> 20: thị trường lo lắng; > 30: hoảng loạn.");
  if (m.spx) add("S&P 500 so với MA200", pct(m.spx.vsMa200), m.spx.vsMa200 < -0.05 ? "alert" : m.spx.vsMa200 < 0 ? "warn" : "ok", "Dưới MA200: xu hướng dài hạn suy yếu.");
  if (m.oil?.chg1y != null) add("Giá dầu 1 năm", pct(m.oil.chg1y), m.oil.chg1y > 0.4 ? "alert" : m.oil.chg1y > 0.2 ? "warn" : "ok", "Cú sốc dầu đẩy lạm phát, buộc ngân hàng trung ương thắt chặt.");
  if (m.copper && m.gold) {
    const cg = (1 + m.copper.chg3m) / (1 + m.gold.chg3m) - 1;
    add("Tỷ lệ đồng/vàng 3 tháng", pct(cg), cg < -0.1 ? "warn" : "ok", "Đồng là kim loại công nghiệp. Tỷ lệ giảm = kỳ vọng tăng trưởng yếu đi.");
  }
  return out;
}
function renderRecession() {
  const c = recessionChecks();
  const score = c.reduce((s, x) => s + (x.level === "alert" ? 2 : x.level === "warn" ? 1 : 0), 0);
  const lvl = score >= 6 ? ["Cao", "alert"] : score >= 3 ? ["Trung bình", "warn"] : ["Thấp", "ok"];
  const chip = { ok: "Ổn", warn: "Chú ý", alert: "Cảnh báo" };
  $("#recLevel").innerHTML = `Rủi ro suy thoái toàn cầu (Mỹ dẫn dắt): <span class="chip ${lvl[1]}">${lvl[0]}</span> <span class="muted small">${score} điểm / ${c.length} chỉ báo</span>`;
  $("#recTable").innerHTML = `<tr><th>Chỉ báo</th><th>Hiện tại</th><th>Trạng thái</th><th class="tip">Ý nghĩa</th></tr>` +
    c.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.value)}</td><td><span class="chip ${x.level}">${chip[x.level]}</span></td><td class="tip">${esc(x.why)}</td></tr>`).join("");
  const g = vn("gdpQ");
  $("#recVN").textContent = g ? `Việt Nam: GDP ${g.period} tăng ${nf(g.value, 2)}%, rủi ro suy thoái trong nước thấp. Rủi ro đến từ bên ngoài: xuất khẩu sang Mỹ, tỷ giá USD/VND và dòng vốn ngoại.` : "";
  const t = M?.fred?.T10Y3M;
  if (!t?.series) return;
  if (charts.curve) charts.curve.destroy();
  charts.curve = new Chart($("#chartCurve"), {
    type: "line",
    data: { labels: t.series.map((x) => x[0].slice(0, 7)), datasets: [{ data: t.series.map((x) => x[1]), borderColor: css("--dep"), pointRadius: 0, borderWidth: 1.5, fill: { target: { value: 0 }, below: css("--down") + "40", above: "transparent" } }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${nf(c.parsed.y, 2)} điểm` } } },
      scales: { x: { ticks: { color: css("--muted"), maxTicksLimit: 6 }, grid: { display: false } }, y: { ticks: { color: css("--muted") }, grid: { color: css("--line") } } } },
  });
}

/* ---------- Lạm phát & sức mua ---------- */
function renderInflation(st) {
  const cpi = cpiRate(), d = today();
  const yAgo = new Date(Date.now() - 365 * 864e5).toLocaleDateString("sv-SE");
  const hNow = priceOn(d), hAgo = priceOn(yAgo);
  const goldY = hNow.sjc_buy / hAgo.sjc_buy - 1;
  const v0 = valueOn(yAgo), v1 = valueOn(d);
  const fundY = (v1.gold + v1.cash + v1.dep + v1.sec) / (v0.gold + v0.cash + v0.dep + v0.sec) - 1;
  const p = planCfg(), dep = vn("deposit")?.value ?? p.rDep;
  const tiles = [
    ["Lạm phát (CPI so với cùng kỳ)", pct(cpi), "", vn("cpiYoy")?.period || ""],
    ["Tiền mặt: lợi suất thực", pct(realRate(p.rCash / 100)), cls(realRate(p.rCash / 100)), `mất ~${money(Math.max(st.cash, 0) * (cpi - p.rCash / 100))} sức mua/năm`],
    ["Tiết kiệm: lợi suất thực", pct(realRate(dep / 100)), cls(realRate(dep / 100)), `lãi hiện tại ${nf(dep, 1)}% − lạm phát`],
    ["Vàng SJC 1 năm: thực", pct(realRate(goldY)), cls(realRate(goldY)), `danh nghĩa ${pct(goldY)}${hAgo.est ? " (giá đầu kỳ ước tính)" : ""}`],
    ["Quỹ của bạn 1 năm: thực", pct(realRate(fundY)), cls(realRate(fundY)), `danh nghĩa ${pct(fundY)}`],
  ];
  $("#inflTiles").innerHTML = tiles.map(([n, v, c, s]) => `<div class="tile"><span>${n}</span><b class="${c}">${v}</b><small>${esc(s)}</small></div>`).join("");

  // giá trị danh nghĩa và sức mua (quy về tiền đầu kỳ)
  const H = historySince(365), t0 = H[0].d;
  const nom = H.map((h) => { const v = valueOn(h.d); return v.gold + v.cash + v.dep + v.sec; });
  const real = nom.map((v, i) => v / Math.pow(1 + cpi, daysBetween(t0, H[i].d) / 365));
  const ink = css("--muted");
  if (charts.infl) charts.infl.destroy();
  charts.infl = new Chart($("#chartInfl"), {
    type: "line",
    data: { labels: H.map((h) => fmtDate(h.d).slice(0, 5)), datasets: [
      { label: "Danh nghĩa", data: nom, borderColor: css("--gold"), pointRadius: 0, borderWidth: 2 },
      { label: `Sức mua (tiền ${fmtDate(t0)})`, data: real, borderColor: css("--down"), borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5 },
    ] },
    options: { maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: ink, boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } } },
      scales: { x: { ticks: { color: ink, maxTicksLimit: 8 }, grid: { display: false } }, y: { ticks: { color: ink, callback: (v) => money(v) }, grid: { color: css("--line") } } } },
  });
  $("#inflNote").textContent = `Sau 1 năm, lạm phát ${pct(cpi)} lấy đi khoảng ${money(nom.at(-1) - real.at(-1))} sức mua của quỹ. Sức mua ước tính với CPI cố định ${pct(cpi)}/năm. Giá trị quỹ 1 năm trước giả định bạn đã giữ đúng số tài sản hiện có.`;

  if (charts.cpiHist || !M?.vnCpiAnnual) return;
  const rows = [...M.vnCpiAnnual];
  const avg = vn("cpiAvg");
  if (avg) rows.push([avg.period.replace(/.*\//, "") + "*", avg.value]);
  charts.cpiHist = new Chart($("#chartCpi"), {
    type: "bar",
    data: { labels: rows.map((r) => String(r[0])), datasets: [{ data: rows.map((r) => r[1]), backgroundColor: rows.map((r, i) => (i === rows.length - 1 && avg ? css("--down") : css("--muted") + "99")), borderRadius: 3 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `Lạm phát ${nf(c.parsed.y, 2)}%` } } },
      scales: { x: { ticks: { color: ink }, grid: { display: false } }, y: { ticks: { color: ink, callback: (v) => v + "%" }, grid: { color: css("--line") } } } },
  });
}

/* ---------- Chu kỳ kinh tế (Investment Clock, CFA Level III: business cycle & sector rotation) ---------- */
const POTENTIAL_GDP = 7; // tăng trưởng tiềm năng ước tính của Việt Nam (%), mốc so sánh "trên/dưới xu hướng"
const PHASES = {
  recovery: { name: "Phục hồi", axis: "Tăng trưởng ↑ · Lạm phát ↓", best: "Cổ phiếu", sectors: "Ngân hàng, chứng khoán, bất động sản, tiêu dùng không thiết yếu, công nghệ", why: "Lãi suất còn thấp, lợi nhuận doanh nghiệp bắt đầu tăng." },
  overheat: { name: "Tăng trưởng nóng", axis: "Tăng trưởng ↑ · Lạm phát ↑", best: "Hàng hóa, vàng; cổ phiếu chu kỳ", sectors: "Thép & vật liệu, năng lượng, xây dựng – hạ tầng, khu công nghiệp", why: "Cầu mạnh đẩy giá nguyên liệu; ngân hàng trung ương dần thắt chặt, lãi suất có xu hướng tăng." },
  stagflation: { name: "Đình lạm", axis: "Tăng trưởng ↓ · Lạm phát ↑", best: "Tiền mặt, tiết kiệm kỳ hạn ngắn", sectors: "Phòng thủ: điện – nước, y tế, tiêu dùng thiết yếu", why: "Lợi nhuận bị bào mòn bởi chi phí, lãi suất cao; giữ thanh khoản." },
  reflation: { name: "Suy giảm", axis: "Tăng trưởng ↓ · Lạm phát ↓", best: "Trái phiếu", sectors: "Tiêu dùng thiết yếu, y tế; chuẩn bị chuyển sang ngân hàng khi lãi suất giảm", why: "Ngân hàng trung ương nới lỏng, lợi suất trái phiếu giảm." },
};
function cyclePhase() {
  const g = vn("gdpQ"), c = vn("cpiYoy"), ca = vn("cpiAvg");
  if (!g || !c) return null;
  const gUp = g.value > POTENTIAL_GDP, iUp = c.value > (ca?.value ?? 4.5);
  const key = gUp ? (iUp ? "overheat" : "recovery") : (iUp ? "stagflation" : "reflation");
  return { key, ...PHASES[key],
    growth: `GDP ${g.period} ${nf(g.value, 2)}% ${gUp ? ">" : "≤"} tiềm năng ~${POTENTIAL_GDP}%`,
    infl: `CPI ${c.period} ${nf(c.value, 2)}% ${iUp ? ">" : "≤"} bình quân từ đầu năm ${nf(ca?.value ?? 4.5, 2)}% (${iUp ? "đang tăng" : "đang giảm"})` };
}

/** Các yếu tố quyết định dòng tiền (CFA: lãi suất thực, thanh khoản, tỷ giá, khẩu vị rủi ro). +1 = thuận cho tài sản rủi ro. */
function flowFactors() {
  const out = [], m = M?.markets || {}, add = (name, value, dir, why) => out.push({ name, value, dir, why });
  const dep = vn("deposit"), cpi = vn("cpiYoy");
  if (dep && cpi) {
    const r = dep.value - cpi.value;
    add("Lãi suất thực tiết kiệm", `${nf(r, 1)}%`, r > 2 ? -1 : r < 0 ? 1 : 0,
      r > 2 ? "Gửi tiết kiệm có lãi thực cao: tiền có xu hướng ở lại ngân hàng." : r < 0 ? "Lãi thực âm: tiền bị đẩy sang cổ phiếu, vàng, BĐS." : "Trung tính.");
  }
  const cr = vn("credit"), gy = vn("gdpYtd"), ca = vn("cpiAvg");
  if (cr && gy && ca) {
    const mo = Number((cr.period.match(/\/(\d{2})\//) || [])[1]) || 12, ann = (cr.value * 12) / mo, nom = gy.value + ca.value;
    add("Thanh khoản (tín dụng)", `${nf(ann, 1)}%/năm`, ann > nom ? 1 : -1,
      `Tín dụng quy năm ${ann > nom ? ">" : "<"} GDP danh nghĩa ~${nf(nom, 1)}%: ${ann > nom ? "tiền trong nền kinh tế dồi dào, hỗ trợ tài sản" : "thanh khoản eo hẹp"}.`);
  }
  const pi = vn("publicInv");
  if (pi) add("Đầu tư công", `${nf(pi.value, 1)}% kế hoạch`, 1, `Giải ngân ${pi.period}: lực đỡ cho xây dựng, vật liệu, hạ tầng.`);
  if (m.usdvnd?.chg3m != null) add("Tỷ giá USD/VND 3 tháng", pct(m.usdvnd.chg3m), m.usdvnd.chg3m > 0.01 ? -1 : m.usdvnd.chg3m < 0 ? 1 : 0,
    m.usdvnd.chg3m > 0.01 ? "VND mất giá: khối ngoại có xu hướng bán ròng." : "VND ổn định/mạnh lên: giảm áp lực rút vốn ngoại.");
  if (m.dxy?.chg3m != null) add("USD toàn cầu (DXY) 3 tháng", pct(m.dxy.chg3m), m.dxy.chg3m > 0.02 ? -1 : m.dxy.chg3m < -0.02 ? 1 : 0, "USD mạnh hút vốn khỏi thị trường mới nổi; USD yếu thì ngược lại.");
  if (m.us10y?.chg3m != null) add("Lợi suất Mỹ 10 năm 3 tháng", `${m.us10y.chg3m >= 0 ? "+" : "−"}${nf(Math.abs(m.us10y.chg3m), 2)} điểm`, m.us10y.chg3m > 0.15 ? -1 : m.us10y.chg3m < -0.15 ? 1 : 0, "Lợi suất Mỹ tăng làm tài sản rủi ro kém hấp dẫn hơn (chi phí cơ hội).");
  if (m.vnindex?.vsMa200 != null) add("VN-Index so với MA200", pct(m.vnindex.vsMa200), m.vnindex.vsMa200 >= 0 ? 1 : -1, m.vnindex.vsMa200 >= 0 ? "Xu hướng dài hạn tăng." : "Dưới MA200: xu hướng dài hạn yếu, dòng tiền đứng ngoài.");
  if (m.vix) add("Khẩu vị rủi ro toàn cầu (VIX)", nf(m.vix.last, 1), m.vix.last > 20 ? -1 : 1, m.vix.last > 20 ? "Nhà đầu tư lo ngại, ưu tiên tài sản an toàn." : "Ổn định.");
  return out;
}

function renderCycle() {
  const ph = cyclePhase(), ff = flowFactors();
  const score = ff.reduce((s, x) => s + x.dir, 0);
  const tilt = score >= 2 ? ["Nghiêng về tài sản rủi ro (cổ phiếu)", "ok"] : score <= -2 ? ["Nghiêng về tài sản an toàn (tiết kiệm, USD)", "alert"] : ["Trung tính, phân hóa", "warn"];
  const dirTxt = { 1: ["Thuận", "ok"], 0: ["Trung tính", "warn"], "-1": ["Nghịch", "alert"] };
  $("#cycleBox").innerHTML = (ph ? `
    <div class="clock">${Object.entries(PHASES).map(([k, x]) => `<div class="ph${k === ph.key ? " on" : ""}"><b>${x.name}</b><small>${x.axis}</small><small>Tốt nhất: ${x.best}</small></div>`).join("")}</div>
    <p>Việt Nam đang ở pha <b>${ph.name}</b>: ${esc(ph.growth)}; ${esc(ph.infl)}.</p>
    <p class="small">${ph.why} Lớp tài sản thường tốt nhất: <b>${ph.best}</b>. Ngành thường hưởng lợi: <b>${ph.sectors}</b>.</p>`
    : `<p class="muted">Chưa đủ số liệu GDP/CPI.</p>`) + `
    <h3 class="sub">Các yếu tố dòng tiền · tổng hợp: <span class="chip ${tilt[1]}">${tilt[0]}</span> <span class="muted small">${score >= 0 ? "+" : ""}${score} điểm</span></h3>
    <div class="tablewrap"><table><tr><th>Yếu tố</th><th>Hiện tại</th><th>Với cổ phiếu</th><th class="tip">Ý nghĩa</th></tr>
      ${ff.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.value)}</td><td><span class="chip ${dirTxt[x.dir][1]}">${dirTxt[x.dir][0]}</span></td><td class="tip">${esc(x.why)}</td></tr>`).join("")}</table></div>
    <p class="muted small">Khung Investment Clock (Merrill Lynch) và luân chuyển ngành theo chu kỳ trong CFA Level III. Pha xác định tự động từ GDP so với tiềm năng (~${POTENTIAL_GDP}%) và hướng lạm phát; chỉ là định hướng, các pha có thể chồng lấn và bỏ qua nhau.</p>`;
}

/* ---------- Nhận định vĩ mô (data/vn_outlook.json, Claude cập nhật định kỳ, người dùng duyệt) ---------- */
const srcLinks = (src) => (src || []).map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>` : esc(s.name))).join(", ");
const pointList = (pts) => `<ul class="pts">${(pts || []).map((x) => `<li>${esc(x.text)}${x.src?.length ? ` <small class="muted">(${srcLinks(x.src)})</small>` : ""}</li>`).join("")}</ul>`;
function renderOutlook() {
  if (!OUTLOOK) { $("#outlookBox").innerHTML = '<p class="muted">Chưa có bản nhận định.</p>'; $("#sectorBox").innerHTML = ""; return; }
  const o = OUTLOOK;
  $("#outlookHead").textContent = `Nhận định vĩ mô · ${o.period}`;
  $("#outlookBox").innerHTML = `${pointList(o.summary)}
    ${(o.sections || []).map((s) => `<details><summary>${esc(s.title)}</summary>${pointList(s.points)}</details>`).join("")}
    <p class="muted small">Cập nhật ${fmtDate(o.asOf)} · ${esc(o.author || "")}. Tổng hợp từ tin tức và số liệu có nguồn, không phải khuyến nghị đầu tư.</p>`;
  const ph = cyclePhase(), tickers = (sec) => (INV?.stocks || []).filter((s) => (sec.match || []).some((w) => (s.sector + " " + s.theme).includes(w))).map((s) => s.code);
  $("#sectorBox").innerHTML = `<div class="tablewrap"><table class="wrapfirst"><tr><th>Ngành</th><th class="tip">Vì sao được chú ý</th><th>Mã theo dõi</th></tr>
    ${(o.sectors || []).map((s) => `<tr><td><b>${esc(s.name)}</b>${s.horizon ? `<br><small class="muted">${esc(s.horizon)}</small>` : ""}</td>
      <td class="tip">${esc(s.why)}${s.src?.length ? ` <small>(${srcLinks(s.src)})</small>` : ""}${s.risk ? `<br><span class="warn small">Rủi ro: ${esc(s.risk)}</span>` : ""}</td>
      <td>${tickers(s).join(", ") || "—"}</td></tr>`).join("")}</table></div>
    ${ph ? `<p class="small">Theo pha chu kỳ hiện tại (<b>${ph.name}</b>), các ngành thường hưởng lợi: ${ph.sectors}.</p>` : ""}
    <p class="muted small">"Mã theo dõi" lấy từ danh sách cổ phiếu ở Thực thi › Giải ngân, không phải khuyến nghị mua.</p>`;
}

/* ---------- Tin tức (data/news.json: RSS CafeF, Vietstock, VnEconomy qua GitHub Actions) ---------- */
let newsSrc = "", newsTopic = "", newsLimit = 30;
function ago(iso) {
  const m = Math.max(0, (Date.now() - new Date(iso)) / 6e4);
  return m < 60 ? `${Math.round(m)} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
}
function renderNews() {
  if (!NEWS) { $("#newsList").innerHTML = '<li class="muted">Chưa tải được tin tức.</li>'; return; }
  $("#newsHot").innerHTML = NEWS.hot.map((h) => {
    const tr = h.prev7 ? (h.n7 > h.prev7 * 1.3 ? ' <span class="up">↑</span>' : h.n7 < h.prev7 * 0.7 ? ' <span class="down">↓</span>' : "") : "";
    return `<button type="button" data-topic="${esc(h.topic)}" class="${newsTopic === h.topic ? "on" : ""}">${esc(h.topic)} <small>${h.n7}</small>${tr}</button>`;
  }).join("");
  $("#newsSrc").innerHTML = ["", ...NEWS.sources].map((s) => `<button type="button" data-src="${esc(s)}" class="${newsSrc === s ? "on" : ""}">${s ? esc(s) : "Tất cả"}</button>`).join("");
  const list = NEWS.items.filter((x) => (!newsSrc || x.src === newsSrc) && (!newsTopic || x.tags.includes(newsTopic)));
  $("#newsList").innerHTML = list.slice(0, newsLimit).map((x) => `<li>
      <a href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">${esc(x.t)}</a>
      <small class="muted">${esc(x.src)} · ${esc(x.cat)} · ${ago(x.d)}${x.tags.length ? " · " + x.tags.map(esc).join(", ") : ""}</small>
      ${x.s ? `<p>${esc(x.s)}</p>` : ""}</li>`).join("") || '<li class="muted">Không có tin phù hợp.</li>';
  $("#newsMore").hidden = list.length <= newsLimit;
  $("#newsStamp").textContent = `Cập nhật ${new Date(NEWS.updated).toLocaleString("vi-VN")} (4 lần/ngày) · ${list.length} tin trong ${NEWS.items.length} tin 10 ngày qua` +
    (NEWS.errors?.length ? ` · Lỗi nguồn: ${NEWS.errors.join(", ")}` : "") + ". Bấm tiêu đề để đọc bài gốc.";
}

function renderMacroStatic() {
  renderVN(); renderFlows(); renderRecession(); renderCycle(); renderOutlook(); renderNews();
  $("#macroStamp").textContent = M ? `Thị trường cập nhật ${new Date(M.updated).toLocaleString("vi-VN")} · Nguồn: Yahoo Finance, FRED, World Bank, Cục Thống kê` : "";
}
function bindMacro() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("#newsHot button, #newsSrc button, #newsMore");
    if (!t) return;
    if (t.id === "newsMore") newsLimit += 30;
    else if (t.dataset.topic != null) { newsTopic = newsTopic === t.dataset.topic ? "" : t.dataset.topic; newsLimit = 30; }
    else { newsSrc = t.dataset.src; newsLimit = 30; }
    renderNews();
  });
  $("#flowPeriod").onclick = (e) => {
    const k = e.target.dataset?.f;
    if (!k) return;
    flowPeriod = k;
    document.querySelectorAll("#flowPeriod button").forEach((b) => b.classList.toggle("on", b === e.target));
    renderFlows();
  };
}

/* ---------- Vàng Việt Nam: premium so với thế giới, chênh lệch mua–bán, cung cầu, độ ổn định, kỳ vọng (Thị trường › Vàng Việt Nam) ---------- */
let goldVNKey = null;
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const stdev = (a) => { const n = a.length; if (n < 2) return null; const m = a.reduce((s, x) => s + x, 0) / n; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)); };

/** Chuỗi ngày có giá thật (không ước tính). prem = giá bán / thế giới quy đổi − 1 (cách báo chí VN hay tính). */
function goldSeries() {
  return (P?.history || []).filter((h) => h.est === false && h.world && h.sjc_buy && h.sjc_sell).map((h) => ({
    d: h.d, buy: h.sjc_buy, w: h.world, prem: h.sjc_sell / h.world - 1,
    ring: h.ring_sell ? h.ring_sell / h.world - 1 : null, sp: h.sjc_sell - h.sjc_buy, spR: h.ring_sell && h.ring_buy ? h.ring_sell - h.ring_buy : null,
  }));
}

function goldStats() {
  const s = goldSeries();
  if (s.length < 30) return null;
  const last = s[s.length - 1];
  const ago = (days) => { const t = new Date(last.d); t.setDate(t.getDate() - days); const k = t.toISOString().slice(0, 10); return s.filter((x) => x.d <= k).pop(); };
  const y1 = s.filter((x) => x.d >= (ago(365)?.d || s[0].d));
  const prems = y1.map((x) => x.prem), pctl = prems.filter((x) => x <= last.prem).length / prems.length;
  const rets = (k, n) => { const t = s.slice(-n - 1); return t.slice(1).map((x, i) => Math.log(x[k] / t[i][k])); };
  const rs = rets("buy", 120), rw = rets("w", 120);
  const ms = rs.reduce((a, b) => a + b, 0) / rs.length, mw = rw.reduce((a, b) => a + b, 0) / rw.length;
  const cov = rs.reduce((a, x, i) => a + (x - ms) * (rw[i] - mw), 0), varW = rw.reduce((a, x) => a + (x - mw) ** 2, 0);
  const p30 = ago(30);
  return {
    s, last, pctl, premMed: median(prems), premMin: Math.min(...prems), premMax: Math.max(...prems),
    dPrem30: p30 ? last.prem - p30.prem : null, spMed: median(y1.map((x) => x.sp)),
    volS: stdev(rets("buy", 60)) * Math.sqrt(252), volW: stdev(rets("w", 60)) * Math.sqrt(252),
    beta: varW ? cov / varW : null, premSd90: stdev(s.slice(-90).map((x) => x.prem)),
  };
}

/** Yếu tố cho giá vàng SJC tính bằng VND. +1 = thuận (hỗ trợ giá), −1 = nghịch. */
function goldFactors(g) {
  const out = [], m = M?.markets || {}, add = (name, value, dir, why) => out.push({ name, value, dir, why });
  if (m.gold?.vsMa200 != null) add("Vàng thế giới so với MA200", pct(m.gold.vsMa200), m.gold.vsMa200 > 0.02 ? 1 : m.gold.vsMa200 < -0.02 ? -1 : 0,
    `Xu hướng dài hạn của giá gốc; 3 tháng ${pct(m.gold.chg3m)}.`);
  add("Premium so với 1 năm", `${nf(g.last.prem * 100, 1)}% (trung vị ${nf(g.premMed * 100, 1)}%)`, g.pctl >= 0.75 ? -1 : g.pctl <= 0.25 ? 1 : 0,
    g.pctl >= 0.75 ? "Vùng cao: dư địa co lại lớn khi cung được nới hoặc thế giới tăng mà SJC đứng giá."
      : g.pctl <= 0.25 ? "Vùng thấp: rủi ro co thêm ít, có thể bật lại nếu cầu dồn nén." : "Vùng giữa của 1 năm.");
  if (g.dPrem30 != null) add("Xu hướng premium 30 ngày", `${g.dPrem30 >= 0 ? "+" : "−"}${nf(Math.abs(g.dPrem30 * 100), 1)} điểm`, g.dPrem30 > 0.02 ? 1 : g.dPrem30 < -0.02 ? -1 : 0,
    g.dPrem30 > 0.02 ? "Cầu trong nước mạnh lên so với thế giới." : g.dPrem30 < -0.02 ? "Cầu trong nước yếu đi hoặc cung tăng." : "Đi ngang.");
  const spR = g.last.sp / g.spMed;
  add("Chênh lệch mua–bán SJC", `${nf(g.last.sp, 1)} tr (trung vị ${nf(g.spMed, 1)} tr)`, spR > 1.3 ? -1 : 0,
    spR > 1.3 ? "Giãn: tiệm hạ giá mua vào để phòng rủi ro, bán ra lúc này chịu thiệt." : "Bình thường.");
  if (m.usdvnd?.chg3m != null) add("Tỷ giá USD/VND 3 tháng", pct(m.usdvnd.chg3m), m.usdvnd.chg3m > 0.01 ? 1 : m.usdvnd.chg3m < -0.01 ? -1 : 0,
    "VND mất giá đẩy giá vàng quy VND lên; VND mạnh lên thì ngược lại.");
  if (m.dxy?.chg3m != null) add("USD toàn cầu (DXY) 3 tháng", pct(m.dxy.chg3m), m.dxy.chg3m > 0.02 ? -1 : m.dxy.chg3m < -0.02 ? 1 : 0, "USD mạnh thường đè giá vàng thế giới.");
  if (m.us10y?.chg3m != null) add("Lợi suất Mỹ 10 năm 3 tháng", `${m.us10y.chg3m >= 0 ? "+" : "−"}${nf(Math.abs(m.us10y.chg3m), 2)} điểm`,
    m.us10y.chg3m > 0.15 ? -1 : m.us10y.chg3m < -0.15 ? 1 : 0, "Lợi suất tăng làm tăng chi phí cơ hội của việc giữ vàng (không sinh lãi).");
  const dep = vn("deposit"), cpi = vn("cpiYoy");
  if (dep && cpi) {
    const r = dep.value - cpi.value;
    add("Lãi suất thực tiết kiệm VN", `${nf(r, 1)}%`, r > 2 ? -1 : r < 0 ? 1 : 0,
      r > 2 ? "Gửi tiết kiệm có lãi thực cao: cạnh tranh với vàng." : r < 0 ? "Lãi thực âm: tiền tìm đến vàng." : "Trung tính.");
  }
  const ph = cyclePhase();
  if (ph) {
    const infl = ph.key === "overheat" || ph.key === "stagflation";
    add("Pha chu kỳ trong nước", ph.name, infl ? 1 : ph.key === "recovery" ? -1 : 0,
      infl ? "Lạm phát đang tăng: hàng hóa và vàng thường được ưa chuộng (Investment Clock)." : ph.key === "recovery" ? "Tăng trưởng không lạm phát: cổ phiếu hút tiền hơn vàng." : "Trung tính với vàng.");
  }
  if (m.vix) add("Tâm lý trú ẩn (VIX)", nf(m.vix.last, 1), m.vix.last > 20 ? 1 : 0, m.vix.last > 20 ? "Thị trường lo ngại: nhu cầu trú ẩn hỗ trợ vàng." : "Bình thường.");
  return out;
}

/** Sau đỉnh: vàng thế giới đã có đáy chưa? Kiểm tra các mốc xác nhận (giá, xu hướng, USD, lợi suất Mỹ). */
function goldBottom() {
  const h = (P?.history || []).filter((x) => x.xau), n = h.length;
  if (n < 220) return null;
  const px = h.map((x) => x.xau), last = px[n - 1];
  let pk = 0, tr;
  px.forEach((v, i) => { if (v >= px[pk]) pk = i; });
  tr = pk;
  for (let i = pk; i < n; i++) if (px[i] <= px[tr]) tr = i;
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const ma200 = avg(px.slice(-200)), ma200p = avg(px.slice(-220, -20));
  let up = 0, dn = 0;
  px.slice(1).forEach((v, i) => { const d = v - px[i], k = i < 14 ? 1 / (i + 1) : 1 / 14; up += (Math.max(d, 0) - up) * k; dn += (Math.max(-d, 0) - dn) * k; });
  const rsi = dn ? 100 - 100 / (1 + up / dn) : 100;
  const lowNow = Math.min(...px.slice(-60)), lowPrev = Math.min(...px.slice(-120, -60)), since = n - 1 - tr;
  const m = M?.markets || {}, money = (v) => "$" + nf(v, 0), checks = [];
  const add = (name, value, ok) => checks.push({ name, value, ok });
  add("Đáy giữ được ít nhất 20 phiên", `${since} phiên kể từ đáy ${money(px[tr])} (${fmtDate(h[tr].d)})`, since >= 20);
  add("Giá trên MA200", `${money(last)} so với ${money(ma200)} (${pct(last / ma200 - 1)})`, last > ma200);
  add("MA200 ngừng dốc xuống", `20 phiên ${pct(ma200 / ma200p - 1)}`, ma200 >= ma200p);
  add("Đáy sau cao hơn đáy trước", `đáy 60 phiên gần nhất ${money(lowNow)}, 60 phiên trước đó ${money(lowPrev)}`, lowNow > lowPrev);
  if (m.dxy?.chg3m != null) add("USD (DXY) quay đầu giảm", `3 tháng ${pct(m.dxy.chg3m)}, 1 tháng ${pct(m.dxy.chg1m)}`, m.dxy.chg3m < 0);
  if (m.us10y?.chg3m != null) add("Lợi suất Mỹ 10 năm quay đầu giảm", `3 tháng ${m.us10y.chg3m >= 0 ? "+" : "−"}${nf(Math.abs(m.us10y.chg3m), 2)} điểm`, m.us10y.chg3m < 0);
  const hits = checks.filter((c) => c.ok).length, dd = last / px[pk] - 1;
  const status = dd > -0.1 ? ["Không trong đợt điều chỉnh", "ok"] : hits >= 5 ? ["Đáy đã được xác nhận", "ok"] : hits >= 3 ? ["Đáy đang hình thành", "warn"] : ["Chưa xác nhận đáy", "alert"];
  return { h, px, pk, tr, last, dd, bounce: last / px[tr] - 1, ma200, rsi, checks, hits, status };
}

function renderGoldBottom(g) {
  const b = goldBottom();
  if (!b) { $("#gvBottom").innerHTML = '<p class="muted">Chưa đủ lịch sử giá thế giới.</p>'; return null; }
  const money = (v) => "$" + nf(v, 0), days = Math.round((new Date(b.h[b.tr].d) - new Date(b.h[b.pk].d)) / 864e5);
  // SJC: đỉnh và đáy theo giá mua vào (giá bán được), có thể lệch với thế giới vì premium
  const s = g.s, sb = s.map((x) => x.buy);
  let spk = 0; sb.forEach((v, i) => { if (v >= sb[spk]) spk = i; });
  let str = spk; for (let i = spk; i < sb.length; i++) if (sb[i] <= sb[str]) str = i;
  const sjcLine = spk < sb.length - 1
    ? `SJC mua vào: đỉnh ${nf(sb[spk], 1)} tr (${fmtDate(s[spk].d)}), đáy ${nf(sb[str], 1)} tr (${fmtDate(s[str].d)}), hiện ${nf(sb.at(-1), 1)} tr (${pct(sb.at(-1) / sb[spk] - 1)} so với đỉnh).
       ${s[str].d < b.h[b.tr].d ? " Thế giới về đáy mới nhưng SJC không giảm theo (premium nới ra), nên SJC có đệm khi thế giới giảm tiếp nhưng sẽ tăng ít hơn khi thế giới hồi." : ""}` : "";
  $("#gvBottom").innerHTML = `<ul class="pts">
      <li><b>Đợt này:</b> vàng thế giới đỉnh ${money(b.px[b.pk])} (${fmtDate(b.h[b.pk].d)}), thấp nhất sau đó ${money(b.px[b.tr])} (${pct(b.px[b.tr] / b.px[b.pk] - 1)}, sau ${days} ngày), hiện ${money(b.last)} (hồi ${pct(b.bounce)} từ đáy, ${pct(b.dd)} so với đỉnh). RSI 14 phiên ${nf(b.rsi, 0)}.</li>
      ${sjcLine ? `<li>${sjcLine}</li>` : ""}
      <li><b>Lịch sử từ năm 2000:</b> các đợt giảm sau đỉnh nóng sâu 21–44%. Năm 2008 (−30%, 8 tháng) và 2020–22 (−21%) đáy giữ được khi Fed ngừng thắt chặt, 6 tháng sau hồi 25–30%. Năm 2011–15 Fed thắt chặt, USD mạnh: mốc −25% (04/2013) chưa phải đáy, giá giảm thêm 23% và mất 2,5 năm nữa mới có đáy thật.</li>
    </ul>
    <div class="tablewrap"><table class="wrapfirst"><tr><th>Mốc xác nhận đáy</th><th>Hiện tại</th><th>Đạt?</th></tr>
      ${b.checks.map((c) => `<tr><td>${c.name}</td><td>${c.value}</td><td><span class="chip ${c.ok ? "ok" : "alert"}">${c.ok ? "Đạt" : "Chưa"}</span></td></tr>`).join("")}</table></div>
    <p class="advice"><span class="chip ${b.status[1]}">${b.status[0]}</span> ${b.hits}/${b.checks.length} mốc đạt. ${b.last < b.ma200
      ? `Mốc quan trọng nhất: giá vượt và giữ trên MA200 (~${money(b.ma200)}). Nếu thủng đáy ${money(b.px[b.tr])} thì đợt giảm còn tiếp.`
      : `Giá đã trên MA200 (~${money(b.ma200)}); theo dõi đáy ${money(b.px[b.tr])} làm mốc dừng.`} Biên độ (chênh lệch mua–bán, biến động) không dự báo được hướng giá; chỉ dùng để chọn ngày bán khi chênh lệch hẹp.</p>`;
  return b;
}

function renderGoldVN() {
  if (!$("#goldVN")) return;
  const p = typeof planCfg === "function" ? planCfg() : { premTarget: 3, horizon: 5 };
  const key = JSON.stringify([P?.updated, M?.updated, VNM?.asOf, OUTLOOK?.asOf, p.premTarget, p.horizon, p.rGold]);
  if (key === goldVNKey) return;
  goldVNKey = key;
  const g = goldStats();
  if (!g) { $("#gvTiles").innerHTML = '<p class="muted">Chưa đủ lịch sử giá thật để phân tích.</p>'; return; }
  const L = g.last, pp = (x) => `${x >= 0 ? "" : "−"}${nf(Math.abs(x * 100), 1)}%`;
  const level = g.pctl >= 0.75 ? "cao" : g.pctl <= 0.25 ? "thấp" : "trung bình";
  const shrink = (1 + p.premTarget / 100) / (L.buy / L.w) - 1;
  const spR = L.sp / g.spMed;
  // Độ ổn định: chênh lệch mua–bán, biến động SJC, độ dao động của premium
  const bad = (spR > 1.3) + (g.volS > 0.25) + (g.premSd90 > 0.04);
  const stab = bad === 0 ? ["Ổn định", "ok"] : bad === 1 ? ["Trung bình", "warn"] : ["Kém ổn định", "alert"];
  const tile = (name, val, note) => `<div class="tile"><span>${name}</span><b>${val}</b><small>${note}</small></div>`;
  $("#gvTiles").innerHTML =
    tile("Premium SJC so với thế giới", pp(L.prem), `≈ ${nf(L.prem * L.w, 1)} tr/lượng · mức ${level} của 1 năm (trung vị ${pp(g.premMed)})`) +
    tile("Premium vàng nhẫn", L.ring != null ? pp(L.ring) : "—", "nhẫn SJC 99,99%, giá bán so với thế giới") +
    tile("Chênh lệch mua–bán SJC", `${nf(L.sp, 1)} tr`, `${nf((L.sp / (L.buy + L.sp)) * 100, 1)}% giá bán · trung vị 1 năm ${nf(g.spMed, 1)} tr`) +
    tile("Chênh lệch mua–bán nhẫn", L.spR != null ? `${nf(L.spR, 1)} tr` : "—", "mua vào rồi bán ra ngay thì mất khoản này") +
    tile("Biến động 60 phiên (năm hóa)", pp(g.volS), `SJC mua vào · thế giới quy đổi ${pp(g.volW)}`) +
    tile("Độ bám giá thế giới (beta)", g.beta != null ? nf(g.beta, 2) : "—", "120 phiên; 1 = đi đúng theo thế giới") +
    tile(`Nếu premium co về ${nf(p.premTarget, 0)}%`, pp(shrink), "giá SJC mua vào, khi vàng thế giới đứng yên");

  const lab = g.s.map((x) => x.d), ink = css("--muted"), grid = css("--line");
  const opt = (fmt) => ({
    maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
    scales: { x: { ticks: { color: ink, maxTicksLimit: 7, callback: (v, i) => `${lab[i].slice(5, 7)}/${lab[i].slice(2, 4)}` }, grid: { display: false } },
      y: { ticks: { color: ink, callback: fmt }, grid: { color: grid } } },
    plugins: { legend: { labels: { color: ink, boxWidth: 12 } }, tooltip: { callbacks: { title: (it) => fmtDate(lab[it[0].dataIndex]) } } },
  });
  const ln = (label, data, color, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 1.8, spanGaps: true, ...extra });
  if (charts.gvPrem) charts.gvPrem.destroy();
  charts.gvPrem = new Chart($("#chartGvPrem"), { type: "line", options: opt((v) => v + "%"), data: { labels: lab, datasets: [
    ln("SJC miếng", g.s.map((x) => +(x.prem * 100).toFixed(2)), css("--gold")),
    ln("Nhẫn 99,99%", g.s.map((x) => (x.ring == null ? null : +(x.ring * 100).toFixed(2))), css("--equity")),
    ln(`Giả định dài hạn ${nf(p.premTarget, 0)}%`, g.s.map(() => p.premTarget), css("--muted"), { borderDash: [5, 4], borderWidth: 1 }),
  ] } });
  if (charts.gvSpread) charts.gvSpread.destroy();
  charts.gvSpread = new Chart($("#chartGvSpread"), { type: "line", options: opt((v) => v + " tr"), data: { labels: lab, datasets: [
    ln("SJC miếng", g.s.map((x) => +x.sp.toFixed(2)), css("--gold")),
    ln("Nhẫn 99,99%", g.s.map((x) => (x.spR == null ? null : +x.spR.toFixed(2))), css("--equity")),
  ] } });

  // Đọc cung cầu và độ ổn định (quy tắc đơn giản, có ghi rõ lý do)
  const trend = g.dPrem30 == null ? "" : g.dPrem30 > 0.02 ? "đang nới rộng" : g.dPrem30 < -0.02 ? "đang co lại" : "đi ngang";
  const sd = level === "cao"
    ? (trend === "đang nới rộng"
      ? "Cầu trong nước vượt cung và chênh lệch còn đang nới: người mua đang trả giá cao hơn thế giới nhiều. Rủi ro lớn nhất là premium co lại khi nguồn cung được nới (cấp phép nhập khẩu, sản xuất vàng miếng)."
      : "Premium ở vùng cao của 1 năm: phần chênh do chính sách lớn, người giữ SJC có thể lỗ phần này dù vàng thế giới đứng yên.")
    : level === "thấp" ? "Premium thấp so với 1 năm: giá trong nước sát thế giới, rủi ro co thêm ít; premium có thể bật lại nếu cầu dồn nén quay lại."
    : "Premium ở vùng giữa của 1 năm: cung cầu trong nước tương đối cân bằng so với giai đoạn trước.";
  const d30 = g.dPrem30 == null ? "" : `${trend} trong 30 ngày (${g.dPrem30 >= 0 ? "+" : "−"}${nf(Math.abs(g.dPrem30 * 100), 1)} điểm), `;
  const sticky = g.beta != null && g.beta < 0.6;
  $("#gvRead").innerHTML = `<ul class="pts">
    <li><b>Cung cầu:</b> premium ${pp(L.prem)}, ${d30}dao động trong 1 năm từ ${pp(g.premMin)} đến ${pp(g.premMax)}. ${sd}</li>
    <li><b>Độ bám thế giới:</b> beta ${g.beta != null ? nf(g.beta, 2) : "—"}. ${sticky
      ? "Giá SJC điều chỉnh chậm hơn thế giới: biến động thế giới đi vào premium trước (thế giới tăng mạnh thì premium co, thế giới giảm thì premium nới), nên premium không chỉ phản ánh cung cầu."
      : "Giá SJC đi khá sát thế giới trong ngày."}</li>
    <li><b>Độ ổn định:</b> <span class="chip ${stab[1]}">${stab[0]}</span> chênh lệch mua–bán ${spR > 1.3 ? "giãn" : "bình thường"} (${nf(L.sp, 1)} tr so với trung vị ${nf(g.spMed, 1)} tr), biến động SJC ${pp(g.volS)}/năm so với thế giới ${pp(g.volW)}, premium dao động ${pp(g.premSd90)} trong 90 ngày.</li>
  </ul>`;

  const ff = goldFactors(g), score = ff.reduce((s, x) => s + x.dir, 0);
  const tilt = score >= 2 ? "Nghiêng tích cực cho giá vàng SJC" : score <= -2 ? "Nghiêng tiêu cực cho giá vàng SJC" : "Trung tính, phân hóa";
  const dirTxt = { 1: ["Thuận", "ok"], 0: ["Trung tính", "warn"], "-1": ["Nghịch", "alert"] };
  let cmeTxt = "";
  if (typeof cme === "function") {
    const c = cme(p, p.horizon);
    cmeTxt = `Kỳ vọng đang dùng cho mô phỏng và tối ưu (CME, ${p.horizon} năm): vàng SJC <b>${nf(c.r.gold, 1)}%/năm</b>, đã trừ phần premium co về ${nf(p.premTarget, 0)}% (chỉnh ở Giả định của mục So sánh).`;
  }
  $("#gvFactors").innerHTML = `<div class="tablewrap"><table class="wrapfirst"><tr><th>Yếu tố</th><th>Hiện tại</th><th>Tác động</th><th class="tip">Giải thích</th></tr>
    ${ff.map((f) => `<tr><td>${f.name}</td><td>${f.value}</td><td><span class="chip ${dirTxt[f.dir][1]}">${dirTxt[f.dir][0]}</span></td><td class="tip">${f.why}</td></tr>`).join("")}</table></div>
    <p class="advice">Tổng điểm ${score >= 0 ? "+" : "−"}${Math.abs(score)}: <b>${tilt}</b> trong 6–12 tháng tới. ${cmeTxt}</p>`;
  const og = OUTLOOK?.gold;
  $("#gvPolicy").hidden = !og;
  if (og) {
    $("#gvPolicyT").textContent = og.title;
    $("#gvPolicyB").innerHTML = `${pointList(og.points)}<p class="muted small">Claude tổng hợp, người dùng duyệt (${fmtDate(OUTLOOK.asOf)}).</p>`;
  }
  const b = renderGoldBottom(g);
  $("#gvSum").innerHTML = `Premium ${pp(L.prem)} · ${b ? b.status[0] : "—"} · điểm ${score >= 0 ? "+" : "−"}${Math.abs(score)}`;
}
