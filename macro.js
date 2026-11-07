"use strict";
/* Vĩ mô, dòng tiền, rủi ro suy thoái, lạm phát & sức mua. Dùng tiện ích trong app.js. */

let M = null, VNM = null, flowPeriod = "chg3m";
const RAW = "https://raw.githubusercontent.com/theodore-ng/gold-portfolio/main/data/";

async function fetchJson(name) {
  for (const u of [RAW + name, "data/" + name]) {
    try { const r = await fetch(u + "?t=" + Date.now(), { cache: "no-store" }); if (r.ok) return await r.json(); } catch { /* thử nguồn sau */ }
  }
  return null;
}
async function loadMacro() { [M, VNM] = await Promise.all([fetchJson("macro.json"), fetchJson("vn_macro.json")]); }
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
  const fundY = (v1.gold + v1.cash + v1.dep) / (v0.gold + v0.cash + v0.dep) - 1;
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
  const nom = H.map((h) => { const v = valueOn(h.d); return v.gold + v.cash + v.dep; });
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

function renderMacroStatic() {
  renderVN(); renderFlows(); renderRecession();
  $("#macroStamp").textContent = M ? `Thị trường cập nhật ${new Date(M.updated).toLocaleString("vi-VN")} · Nguồn: Yahoo Finance, FRED, World Bank, Cục Thống kê` : "";
}
function bindMacro() {
  $("#flowPeriod").onclick = (e) => {
    const k = e.target.dataset?.f;
    if (!k) return;
    flowPeriod = k;
    document.querySelectorAll("#flowPeriod button").forEach((b) => b.classList.toggle("on", b === e.target));
    renderFlows();
  };
}
