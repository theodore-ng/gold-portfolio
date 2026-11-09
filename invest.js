"use strict";
/* Hướng dẫn giải ngân: ETF/quỹ cổ phiếu cho phần cổ phiếu lõi, quỹ trái phiếu, danh sách cổ phiếu đáng quan tâm.
   Số tiền mục tiêu lấy từ bộ tối ưu (plan.js). Dữ liệu: data/invest.json (VNDirect, fmarket). */

const ETF_SPLIT = [ // tỷ lệ gợi ý trong phần cổ phiếu lõi
  ["E1VFVN30", 50], ["FUEVFVND", 30], ["FUEDCMID", 20],
];
const LOT = 100; // HOSE: lô chẵn 100 chứng chỉ quỹ; lô lẻ 1–99 khớp ở bảng giao dịch lô lẻ

function renderInvest(st) {
  if (!INV) { $("#investBody").innerHTML = '<p class="muted">Chưa tải được dữ liệu đầu tư.</p>'; return; }
  const p = planCfg(), cur = currentMix(st), total = Object.values(cur).reduce((a, b) => a + b, 0);
  const tgt = targetMix(total), months = Math.max(1, S.settings.dcaMonths || 12);
  const eqNeed = Math.max(tgt.equity - cur.equity, 0), bondNeed = Math.max(tgt.bond - cur.bond, 0);
  const etf = Object.fromEntries(INV.etfs.map((e) => [e.code, e]));
  const trendTxt = (x) => (x == null ? "—" : `<span class="${cls(x)}">${pct(x)}</span>`);

  // 1. Cổ phiếu lõi qua ETF
  const perMonth = eqNeed / months;
  const etfRows = ETF_SPLIT.filter(([c]) => etf[c]).map(([c, w]) => {
    const e = etf[c], amt = (perMonth * w) / 100, units = Math.floor((amt * 1e6) / e.price);
    const lots = Math.floor(units / LOT), odd = units - lots * LOT;
    return `<tr><td><b>${c}</b><br><small class="muted">${esc(e.index)} · ${esc(e.role)}</small></td><td>${nf(e.price / 1000, 2)}</td>
      <td>${trendTxt(e.vsMa200)}</td><td>${trendTxt(e.chg1y)}</td><td>${w}%</td><td>${money(amt)}</td>
      <td><b>${nf(units, 0)}</b> CCQ<br><small class="muted">${lots ? `${lots} lô chẵn` : ""}${lots && odd ? " + " : ""}${odd ? `${odd} lẻ` : ""}</small></td></tr>`;
  });
  const below = ETF_SPLIT.some(([c]) => (etf[c]?.vsMa200 ?? 0) < 0);
  const eqHtml = eqNeed < 1
    ? `<p class="muted">Khẩu vị ${esc(PROFILES[p.profile].name)} hiện không cần thêm cổ phiếu lõi.</p>`
    : `<p>Cần giải ngân <b>${money(eqNeed)}</b> vào cổ phiếu lõi (khẩu vị ${esc(PROFILES[p.profile].name)}). Chia đều <b>${months} tháng</b> (DCA) → <b>${money(perMonth)}/tháng</b>:</p>
      <div class="tablewrap"><table><tr><th>ETF</th><th>Giá (nghìn)</th><th>So MA200</th><th>1 năm</th><th>Tỷ lệ</th><th>Mỗi tháng</th><th>Số CCQ mỗi tháng</th></tr>${etfRows.join("")}</table></div>
      <p class="muted small">Mua bằng tài khoản chứng khoán (SSI, VNDirect, TCBS, VPS…). Lô chẵn ${LOT} CCQ, phần lẻ đặt ở bảng lô lẻ. Phí giao dịch ~0,1–0,15%, thuế 0,1% khi bán. ${below ? "Các ETF đang dưới MA200: giữ nhịp DCA đều, không mua dồn một lần." : ""}</p>`;

  // 2. Quỹ mở cổ phiếu (thay thế ETF nếu muốn nhà quản lý chọn cổ phiếu)
  const eqFunds = INV.equityFunds.filter((f) => f.r36ann != null).sort((a, b) => b.r36ann - a.r36ann).slice(0, 6);
  const fundTable = (list, amount) => `<div class="tablewrap"><table><tr><th>Quỹ</th><th>NAV/CCQ</th><th>12 tháng</th><th>3 năm/năm</th><th>Phí QL</th>${amount ? "<th>Số CCQ</th>" : ""}</tr>` +
    list.map((f) => `<tr><td><b>${esc(f.code)}</b><br><small class="muted">${esc(f.manager || "")}</small></td><td>${nf(f.nav, 0)}</td>
      <td>${f.r12 == null ? "—" : `<span class="${cls(f.r12)}">${nf(f.r12, 1)}%</span>`}</td><td>${nf(f.r36ann, 1)}%</td><td>${nf(f.fee ?? 0, 2)}%</td>
      ${amount ? `<td>${nf((amount * 1e6) / f.nav, 2)}</td>` : ""}</tr>`).join("") + "</table></div>";

  // 3. Quỹ trái phiếu
  const bFunds = INV.bondFunds.filter((f) => f.r36ann != null).sort((a, b) => b.r36ann - a.r36ann).slice(0, 6);
  const c = cme(p, p.horizon);
  const bondHtml = bondNeed >= 1
    ? `<p>Cần giải ngân <b>${money(bondNeed)}</b> vào quỹ trái phiếu. Nên chia cho 2–3 quỹ khác công ty quản lý để giảm rủi ro tín dụng:</p>${fundTable(bFunds, bondNeed / 3)}<p class="muted small">Số CCQ tính cho mỗi quỹ 1/3 số tiền.</p>`
    : `<p class="small">Bộ tối ưu hiện <b>không phân bổ</b> quỹ trái phiếu: lợi nhuận kỳ vọng ${nf(c.r.bond, 2)}% (trung vị 12 tháng của các quỹ) so với tiết kiệm ${nf(c.r.liquid, 2)}% bình quân. Quỹ trái phiếu vẫn hợp lý nếu bạn cần <b>rút linh hoạt</b> (nhận tiền sau vài ngày) thay vì khóa kỳ hạn. Ví dụ cho 100 tr:</p>${fundTable(bFunds, 100)}`;

  // 4. Cổ phiếu đáng quan tâm (phần vệ tinh)
  const score = (s) => (s.riskNote ? -1 : (s.roe || 0) / (s.pe || 99)); // mã có rủi ro đặc thù xếp cuối
  const rows = [...INV.stocks].sort((a, b) => score(b) - score(a));
  const flag = (v, good, bad, fmt) => (v == null ? "—" : `<span class="${v >= good ? "up" : v <= bad ? "down" : ""}">${fmt(v)}</span>`);
  const flagLow = (v, good, bad, fmt) => (v == null ? "—" : `<span class="${v <= good ? "up" : v >= bad ? "down" : ""}">${fmt(v)}</span>`);
  const stockRows = rows.map((s) => `<tr><td><b>${esc(s.code)}</b> <small class="muted">${esc(s.name)}</small><br><small class="muted">${esc(s.sector)}${s.theme ? " · " + esc(s.theme) : ""}</small>${s.riskNote ? `<br><small class="warn">⚠ ${esc(s.riskNote)}</small>` : ""}</td>
    <td>${nf(s.price / 1000, 2)}</td><td>${flagLow(s.pe, 10, 20, (v) => nf(v, 1))}</td><td>${s.pb == null ? "—" : nf(s.pb, 2)}</td>
    <td>${flag(s.roe, 0.15, 0.08, (v) => nf(v * 100, 1) + "%")}</td><td>${flag(s.npGrowth, 0.15, 0, (v) => pct(v))}</td>
    <td>${s.divYield == null ? "—" : nf(s.divYield * 100, 1) + "%"}</td>
    <td>${s.dataNote ? `<span class="muted" title="${esc(s.dataNote)}">n/a*</span>` : trendTxt(s.vsMa200)}</td><td>${s.dataNote ? "—" : trendTxt(s.chg3m)}</td></tr>`);
  const fiscal = INV.stocks.find((s) => s.fiscalDate)?.fiscalDate;

  $("#investBody").innerHTML = `
    <h3 class="sub">1. Cổ phiếu lõi: ETF</h3>${eqHtml}
    <details><summary>Hoặc quỹ mở cổ phiếu (nhà quản lý chọn cổ phiếu, phí cao hơn)</summary>
      <p class="small">Top theo lợi nhuận bình quân 3 năm. So với ETF: phí quản lý 1,5–2%/năm so với ~0,5–0,8%, cần vượt chỉ số đủ bù phí.</p>${fundTable(eqFunds, perMonth > 0 ? perMonth : 0)}
      ${perMonth > 0 ? `<p class="muted small">Số CCQ tính cho ${money(perMonth)} (một tháng DCA).</p>` : ""}</details>
    <h3 class="sub">2. Quỹ trái phiếu</h3>${bondHtml}
    <h3 class="sub">3. Cổ phiếu đáng quan tâm (phần vệ tinh)</h3>
    <p class="small">Sắp xếp theo ROE ÷ P/E (chất lượng so với giá); mã có rủi ro đặc thù (⚠) xếp cuối. Xanh: ROE ≥ 15%, P/E ≤ 10, lợi nhuận tăng ≥ 15%. Chỉ số tài chính 4 quý gần nhất đến ${fmtDate(fiscal)}.</p>
    <div class="tablewrap"><table class="stocks wrapfirst"><tr><th>Mã</th><th>Giá (nghìn)</th><th>P/E</th><th>P/B</th><th>ROE</th><th>LN tăng (4Q)</th><th>Cổ tức</th><th>So MA200</th><th>3 tháng</th></tr>${stockRows.join("")}</table></div>
    <p class="muted small">Đây là danh sách theo dõi, không phải khuyến nghị mua. Theo CFA (alpha = 0), bộ tối ưu chưa phân bổ cho vệ tinh. Chỉ dùng sau khi paper trading 2–3 tháng, mỗi lệnh rủi ro ≤ 1–2% vốn vệ tinh.${INV.stocks.some((x) => x.dataNote) ? " * Dữ liệu giá có bước nhảy (có thể do chia tách), chưa tính xu hướng." : ""}</p>
    <p class="muted small">Dữ liệu: VNDirect (giá, chỉ số), fmarket (quỹ mở), cập nhật ${new Date(INV.updated).toLocaleString("vi-VN")}.</p>`;
}
