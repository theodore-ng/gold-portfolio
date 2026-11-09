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
  const H = P.history.slice(-365), t0 = H[0].d;
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
    <p class="muted small">"Mã theo dõi" lấy từ danh sách cổ phiếu ở Đề xuất › Hướng dẫn giải ngân, không phải khuyến nghị mua.</p>`;
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
