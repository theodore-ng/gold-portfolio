"""Cập nhật data/invest.json: giá ETF, quỹ mở trái phiếu/cổ phiếu (fmarket), chỉ số tài chính cổ phiếu (VNDirect).
Dữ liệu công khai, không chứa thông tin cá nhân. Chạy bởi GitHub Actions sau update_prices.py."""
import json
import statistics
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parent.parent / "data" / "invest.json"
H = {"User-Agent": "Mozilla/5.0 (gold-portfolio data bot)"}
VN = timezone(timedelta(hours=7))

ETFS = [  # (mã, chỉ số theo dõi, vai trò)
    ("E1VFVN30", "VN30", "Lõi: 30 cổ phiếu vốn hóa lớn, thanh khoản cao nhất"),
    ("FUEVFVND", "VN Diamond", "Cổ phiếu hết room ngoại, hưởng lợi khi FTSE nâng hạng"),
    ("FUEDCMID", "VN Midcap", "Vốn hóa vừa, đa dạng hóa ngoài nhóm VN30"),
    ("FUESSVFL", "VNFIN Lead", "Ngân hàng, chứng khoán, bảo hiểm (tài chính)"),
    ("FUEVN100", "VN100", "100 cổ phiếu lớn nhất, đa dạng hơn VN30"),
]
STOCKS = [  # (mã, tên, ngành, chủ đề)
    ("VCB", "Vietcombank", "Ngân hàng", ""), ("BID", "BIDV", "Ngân hàng", "Tín dụng đầu tư công"),
    ("CTG", "VietinBank", "Ngân hàng", ""), ("TCB", "Techcombank", "Ngân hàng", ""),
    ("MBB", "MB Bank", "Ngân hàng", ""), ("ACB", "ACB", "Ngân hàng", ""), ("VPB", "VPBank", "Ngân hàng", "Sàn tài sản số"),
    ("SSI", "Chứng khoán SSI", "Chứng khoán", "FTSE nâng hạng"), ("FPT", "FPT", "Công nghệ", ""),
    ("MWG", "Thế Giới Di Động", "Bán lẻ", ""), ("PNJ", "PNJ", "Bán lẻ", "Vàng trang sức"),
    ("VNM", "Vinamilk", "Tiêu dùng", ""), ("MSN", "Masan", "Tiêu dùng", ""),
    ("HPG", "Hòa Phát", "Thép", "Đầu tư công"), ("VCG", "Vinaconex", "Xây dựng", "Đầu tư công"),
    ("HHV", "Đèo Cả", "Hạ tầng giao thông", "Đầu tư công"), ("CTD", "Coteccons", "Xây dựng", ""),
    ("KBC", "Kinh Bắc", "Khu công nghiệp", "FDI"), ("GMD", "Gemadept", "Cảng biển", "Logistics"),
    ("GAS", "PV Gas", "Năng lượng", ""), ("VHM", "Vinhomes", "Bất động sản", ""),
]
# Rủi ro đặc thù đã biết (cập nhật thủ công, ghi nguồn): chỉ số quá khứ không còn phản ánh triển vọng
RISK_NOTES = {
    "PNJ": "Vụ buôn lậu kim cương liên quan P-Lab (7/2026), dự phòng > 7.000 tỷ, kế hoạch 2026 chuyển sang lỗ: P/E theo lợi nhuận quá khứ gây hiểu nhầm (nguồn: VietnamFinance, ViệtTimes).",
}
RATIOS = {"51006": "pe", "51012": "pb", "51033": "divYield", "52002": "roe", "52005": "npGrowth",
          "53007": "eps", "54018": "de", "51003": "mcap", "51001": "high52", "51002": "low52"}


def history(sym, days=420):
    now = int(time.time())
    j = requests.get("https://dchart-api.vndirect.com.vn/dchart/history", headers=H, timeout=20,
                     params={"resolution": "D", "symbol": sym, "from": now - days * 86400, "to": now}).json()
    if j.get("s") != "ok":
        raise RuntimeError(f"không có dữ liệu {sym}")
    return [c * 1000 for c in j["c"]]  # nghìn VND -> VND


def trend(c):
    last = c[-1]
    # Một phiên giảm > 40% gần như chắc chắn là chia tách/thưởng cổ phiếu chưa được điều chỉnh giá: không tính xu hướng
    if any(c[i] / c[i - 1] < 0.6 for i in range(max(1, len(c) - 260), len(c))):
        return {"price": round(last), "vsMa200": None, "chg3m": None, "chg1y": None,
                "dataNote": "Giá lịch sử có bước nhảy (có thể do chia tách/thưởng cổ phiếu), chỉ số xu hướng bị bỏ qua"}
    ma200 = sum(c[-200:]) / len(c[-200:])
    return {"price": round(last), "vsMa200": round(last / ma200 - 1, 4),
            "chg3m": round(last / c[-64] - 1, 4) if len(c) > 64 else None,
            "chg1y": round(last / c[-253] - 1, 4) if len(c) > 253 else None}


def ratios(sym):
    j = requests.get("https://api-finfo.vndirect.com.vn/v4/ratios/latest", headers=H, timeout=20, params={
        "filter": "itemCode:" + ",".join(RATIOS), "where": f"code:{sym}", "order": "reportDate",
        "fields": "itemCode,value,reportDate", "size": 50}).json()["data"]
    out = {RATIOS[r["itemCode"]]: r["value"] for r in j if r["itemCode"] in RATIOS}
    rep = [r["reportDate"] for r in j if r["itemCode"] == "52002"]
    out["fiscalDate"] = rep[0] if rep else None
    return out


def funds(asset_type):
    body = {"types": ["NEW_FUND", "TRADING_FUND"], "issuerIds": [], "sortOrder": "DESC", "sortField": "navTo36Months",
            "page": 1, "pageSize": 100, "isIpo": False, "fundAssetTypes": [asset_type], "bondRemainPeriods": [],
            "searchField": "", "isBuyByReward": False, "thirdAppIds": []}
    rows = requests.post("https://api.fmarket.vn/res/products/filter", json=body, headers=H, timeout=30).json()["data"]["rows"]
    out = []
    for r in rows:
        c = r.get("productNavChange") or {}
        out.append({"code": r["shortName"], "name": r["name"], "manager": (r.get("owner") or {}).get("shortName"),
                    "nav": round(r["nav"], 2), "r12": c.get("navTo12Months"), "r36": c.get("navTo36Months"),
                    "r36ann": c.get("annualizedReturn36Months"), "fee": r.get("managementFee"),
                    "settleDays": r.get("completeTransactionDuration"), "url": r.get("websiteURL")})
    return out


def main():
    data = {"updated": datetime.now(VN).isoformat(timespec="minutes"), "etfs": [], "stocks": [], "bondFunds": [], "equityFunds": []}
    for code, index, role in ETFS:
        try:
            data["etfs"].append({"code": code, "index": index, "role": role, **trend(history(code))})
        except Exception as e:
            print("ETF lỗi", code, e)
    for code, name, sector, theme in STOCKS:
        try:
            s = {"code": code, "name": name, "sector": sector, "theme": theme, **trend(history(code))}
            s.update(ratios(code))
            if code in RISK_NOTES:
                s["riskNote"] = RISK_NOTES[code]
            data["stocks"].append(s)
        except Exception as e:
            print("Cổ phiếu lỗi", code, e)
    for key, t in (("bondFunds", "BOND"), ("equityFunds", "STOCK")):
        try:
            data[key] = funds(t)
        except Exception as e:
            print("fmarket lỗi", t, e)
    r12 = [f["r12"] for f in data["bondFunds"] if f["r12"] is not None and f["r36"] is not None]
    data["bondMedian12m"] = round(statistics.median(r12), 2) if r12 else None
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"invest: {len(data['etfs'])} ETF, {len(data['stocks'])} cổ phiếu, {len(data['bondFunds'])} quỹ TP, "
          f"{len(data['equityFunds'])} quỹ CP, trung vị quỹ TP 12T {data['bondMedian12m']}%")


if __name__ == "__main__":
    main()
