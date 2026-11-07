"""Cập nhật data/prices.json: giá SJC (PNJ), vàng thế giới, USD/VND. Chạy bởi GitHub Actions.

Không chứa dữ liệu cá nhân. Lần chạy đầu tự điền 1 năm lịch sử: giá thế giới thật,
giá SJC ước tính = thế giới quy đổi × (1 + premium của lần đo thật đầu tiên), đánh dấu est=true.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
import yfinance as yf

OUT = Path(__file__).resolve().parent.parent / "data" / "prices.json"
H = {"User-Agent": "Mozilla/5.0 (gold-portfolio price bot)"}
GRAM_PER_OZ, GRAM_PER_LUONG = 31.1035, 37.5
VN = timezone(timedelta(hours=7))


def world(days: int) -> dict:
    """{date: (xau_usd, usdvnd)} theo ngày giao dịch."""
    out = {}
    g = yf.Ticker("GC=F").history(period=f"{days}d")["Close"]
    fx = yf.Ticker("VND=X").history(period=f"{days}d")["Close"]
    fx.index = fx.index.strftime("%Y-%m-%d")
    last_fx = None
    for ts, x in g.items():
        d = ts.strftime("%Y-%m-%d")
        last_fx = float(fx.get(d, last_fx or fx.iloc[0]))
        out[d] = (round(float(x), 1), round(last_fx))
    return out


def pnj() -> dict | None:
    """Giá PNJ, đổi nghìn VND/chỉ -> triệu VND/lượng."""
    try:
        rows = requests.get("https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00",
                            headers=H, timeout=20).json()["data"]
        m = {r["masp"]: r for r in rows}
        f = lambda v: round(float(v) * 10 / 1000, 2)  # noqa: E731
        return {"sjc_buy": f(m["SJC"]["giamua"]), "sjc_sell": f(m["SJC"]["giaban"]),
                "ring_buy": f(m["N24K"]["giamua"]), "ring_sell": f(m["N24K"]["giaban"])}
    except Exception as e:  # nguồn VN có thể chặn IP nước ngoài: giữ giá cũ, đánh dấu ước tính
        print("PNJ lỗi:", e)
        return None


def world_luong(xau, fx):
    return round(xau * fx / GRAM_PER_OZ * GRAM_PER_LUONG / 1e6, 2)


def main():
    data = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"history": []}
    hist = {h["d"]: h for h in data["history"]}
    first_run = not hist

    w = world(400 if first_run else 10)
    for d, (xau, fx) in w.items():
        h = hist.setdefault(d, {"d": d})
        h.update(xau=xau, fx=fx, world=world_luong(xau, fx))

    today = datetime.now(VN).strftime("%Y-%m-%d")
    p = pnj()
    if today not in hist:  # cuối tuần: vàng TG không giao dịch, lấy phiên gần nhất
        last = hist[max(hist)]
        hist[today] = {"d": today, "xau": last["xau"], "fx": last["fx"], "world": last["world"]}
    if p:
        hist[today].update(p, est=False)

    days = sorted(hist)
    real = [hist[d] for d in days if hist[d].get("est") is False]
    p0 = real[0]["sjc_buy"] / real[0]["world"] - 1 if real else 0.09
    s0 = real[0]["sjc_sell"] / real[0]["world"] - 1 if real else 0.12
    prev = None
    for d in days:  # điền giá SJC còn thiếu: trước lần đo thật đầu tiên ước tính theo premium, sau đó giữ giá gần nhất
        h = hist[d]
        if h.get("est") is False:
            prev = h
            continue
        if prev:
            h.update(sjc_buy=prev["sjc_buy"], sjc_sell=prev["sjc_sell"], est=True)
        else:
            h.update(sjc_buy=round(h["world"] * (1 + p0), 2), sjc_sell=round(h["world"] * (1 + s0), 2), est=True)

    latest = dict(hist[days[-1]])
    latest["premium"] = round(latest["sjc_sell"] / latest["world"] - 1, 4)
    data = {"updated": datetime.now(VN).isoformat(timespec="minutes"), "source": "PNJ, Yahoo Finance",
            "latest": latest, "history": [hist[d] for d in days]}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(days)} ngày | {latest}")


MACRO = OUT.parent / "macro.json"
MARKETS = [  # (khóa, tên, ticker Yahoo, đơn vị: "%" thay đổi theo %, "pt" thay đổi theo điểm)
    ("gold", "Vàng", "GC=F", "%"), ("silver", "Bạc", "SI=F", "%"), ("btc", "Bitcoin", "BTC-USD", "%"),
    ("spx", "S&P 500", "^GSPC", "%"), ("em", "Cổ phiếu mới nổi (EEM)", "EEM", "%"), ("oil", "Dầu WTI", "CL=F", "%"),
    ("copper", "Đồng", "HG=F", "%"), ("dxy", "USD (DXY)", "DX-Y.NYB", "%"), ("usdvnd", "USD/VND", "VND=X", "%"),
    ("us10y", "Lợi suất Mỹ 10 năm", "^TNX", "pt"), ("us3m", "Lợi suất Mỹ 3 tháng", "^IRX", "pt"), ("vix", "VIX (sợ hãi)", "^VIX", "pt"),
]
FRED = {"T10Y3M": "Chênh lệch lợi suất 10 năm − 3 tháng", "SAHMREALTIME": "Quy tắc Sahm",
        "BAMLH0A0HYM2": "Chênh lệch trái phiếu lợi suất cao", "RECPROUSM156N": "Xác suất suy thoái Mỹ", "CPIAUCSL": "CPI Mỹ"}


def series_stats(s, unit):
    s = s.dropna()
    last = float(s.iloc[-1])
    ch = lambda n: None if len(s) <= n else round(last - float(s.iloc[-1 - n]), 3) if unit == "pt" else round(last / float(s.iloc[-1 - n]) - 1, 4)  # noqa: E731
    ma200 = float(s.tail(200).mean())
    return {"last": round(last, 4), "date": s.index[-1].strftime("%Y-%m-%d"), "chg1m": ch(21), "chg3m": ch(63), "chg1y": ch(252),
            "vsMa200": round(last / ma200 - 1, 4) if unit == "%" else None, "unit": unit}


def fred(sid):
    import csv, io
    txt = requests.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}", headers=H, timeout=30).text
    rows = [(d, float(v)) for d, v in list(csv.reader(io.StringIO(txt)))[1:] if v not in (".", "")]
    return rows


def update_macro():
    out = {"updated": datetime.now(VN).isoformat(timespec="minutes"), "markets": {}, "fred": {}}
    for key, name, t, unit in MARKETS:
        try:
            s = yf.Ticker(t).history(period="2y")["Close"]
            out["markets"][key] = {"name": name, **series_stats(s, unit)}
        except Exception as e:
            print("Yahoo lỗi", t, e)
    try:  # VN-Index từ VNDirect (có thể chặn IP nước ngoài)
        import pandas as pd
        now = int(datetime.now().timestamp())
        j = requests.get("https://dchart-api.vndirect.com.vn/dchart/history", headers=H, timeout=20,
                         params={"resolution": "D", "symbol": "VNINDEX", "from": now - 800 * 86400, "to": now}).json()
        s = pd.Series(j["c"], index=pd.to_datetime(j["t"], unit="s")).astype(float)
        out["markets"]["vnindex"] = {"name": "VN-Index", **series_stats(s, "%")}
    except Exception as e:
        print("VNDirect lỗi:", e)
    for sid, name in FRED.items():
        try:
            rows = fred(sid)
            item = {"name": name, "last": rows[-1][1], "date": rows[-1][0]}
            if sid == "T10Y3M":
                item["min24m"] = min(v for d, v in rows[-520:])
                item["series"] = [[d, v] for d, v in rows if d >= f"{datetime.now().year - 10}" and d[8:10] <= "07" and d[8:10] >= "01"][::5]
            if sid == "CPIAUCSL":
                item["yoy"] = round(rows[-1][1] / rows[-13][1] - 1, 4)
            out["fred"][sid] = item
        except Exception as e:
            print("FRED lỗi", sid, e)
    try:  # lạm phát VN theo năm (World Bank)
        j = requests.get("https://api.worldbank.org/v2/country/VNM/indicator/FP.CPI.TOTL.ZG?format=json&per_page=30",
                         headers=H, timeout=30).json()[1]
        out["vnCpiAnnual"] = sorted([[int(r["date"]), round(r["value"], 2)] for r in j if r["value"] is not None and int(r["date"]) >= 2010])
    except Exception as e:
        print("World Bank lỗi:", e)
    MACRO.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"macro: {len(out['markets'])} thị trường, {len(out['fred'])} chuỗi FRED")


if __name__ == "__main__":
    main()
    try:
        update_macro()
    except Exception as e:  # lỗi vĩ mô không được chặn cập nhật giá
        print("Macro lỗi:", e)
