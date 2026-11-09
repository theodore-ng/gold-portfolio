"""Cập nhật data/news.json từ RSS công khai (CafeF, Vietstock, VnEconomy) và kho tiêu đề theo quý data/news_archive/YYYY-Qn.json.
Chỉ lưu tiêu đề, tóm tắt ngắn và link về bài gốc. Gắn chủ đề theo từ khóa. Chạy bởi GitHub Actions."""
import html
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent / "data"
OUT = ROOT / "news.json"
ARCHIVE = ROOT / "news_archive"
H = {"User-Agent": "Mozilla/5.0 (gold-portfolio news bot)"}
VN = timezone(timedelta(hours=7))
KEEP_DAYS = 10
MAX_ITEMS = 240

FEEDS = [  # (nguồn, chuyên mục, url)
    ("CafeF", "Chứng khoán", "https://cafef.vn/thi-truong-chung-khoan.rss"),
    ("CafeF", "Vĩ mô", "https://cafef.vn/vi-mo-dau-tu.rss"),
    ("CafeF", "Ngân hàng", "https://cafef.vn/tai-chinh-ngan-hang.rss"),
    ("CafeF", "Doanh nghiệp", "https://cafef.vn/doanh-nghiep.rss"),
    ("CafeF", "Quốc tế", "https://cafef.vn/tai-chinh-quoc-te.rss"),
    ("Vietstock", "Vĩ mô", "https://vietstock.vn/761/kinh-te/vi-mo.rss"),
    ("Vietstock", "Chứng khoán", "https://vietstock.vn/830/chung-khoan/co-phieu.rss"),
    ("VnEconomy", "Chứng khoán", "https://vneconomy.vn/chung-khoan.rss"),
]

# Chủ đề theo từ khóa (so khớp chữ thường trên tiêu đề + tóm tắt). Sửa danh sách này khi cần.
TOPICS = {
    "Lãi suất": ["lãi suất", "fed ", "fomc", "nới lỏng", "thắt chặt", "tái cấp vốn"],
    "Tỷ giá": ["tỷ giá", "usd/vnd", "đồng usd", "ngoại tệ", "dxy"],
    "Vàng": ["giá vàng", "vàng sjc", "vàng miếng", "vàng nhẫn", "sàn vàng"],
    "Khối ngoại": ["khối ngoại", "nhà đầu tư nước ngoài", "bán ròng", "mua ròng"],
    "Nâng hạng": ["nâng hạng", "ftse", "msci"],
    "Đầu tư công": ["đầu tư công", "giải ngân", "cao tốc", "đường sắt", "sân bay long thành"],
    "Bất động sản": ["bất động sản", "bđs", "nhà ở", "chung cư", "khu công nghiệp"],
    "Ngân hàng & tín dụng": ["tín dụng", "ngân hàng nhà nước", "nhnn", "nợ xấu", "huy động"],
    "Lạm phát": ["lạm phát", "cpi", "giá xăng", "chỉ số giá"],
    "FDI & thương mại": ["fdi", "xuất khẩu", "nhập khẩu", "thuế quan", "thặng dư thương mại", "vốn ngoại"],
    "Công nghệ": ["bán dẫn", "chip", "trí tuệ nhân tạo", "chuyển đổi số", "trung tâm dữ liệu", "khoa học công nghệ"],
    "Năng lượng": ["năng lượng", "giá dầu", "điện gió", "điện mặt trời", "giá điện", "lng", "quy hoạch điện"],
    "Tài sản số": ["tài sản số", "tiền số", "tiền mã hóa", "bitcoin", "crypto"],
    "Kinh tế tư nhân": ["kinh tế tư nhân", "nghị quyết 68"],
}


def clean(s, n=None):
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    return s if n is None or len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def tags(text):
    t = " " + text.lower() + " "
    return [k for k, words in TOPICS.items() if any(w in t for w in words)]


def fetch(source, cat, url):
    root = ET.fromstring(requests.get(url, headers=H, timeout=25).content)
    out = []
    for it in root.iter("item"):
        title, link = clean(it.findtext("title")), (it.findtext("link") or "").strip()
        if not title or not link.startswith("http"):
            continue
        try:
            d = parsedate_to_datetime(it.findtext("pubDate")).astimezone(VN)
        except (TypeError, ValueError):
            continue
        summ = clean(it.findtext("description"), 220)
        if summ.startswith(title):  # một số RSS lặp lại tiêu đề trong mô tả
            summ = summ[len(title):].strip(" .:-–")
        out.append({"t": title, "u": link, "d": d.isoformat(timespec="minutes"), "src": source, "cat": cat,
                    "s": summ, "tags": tags(title + " " + summ)})
    return out


def main():
    now = datetime.now(VN)
    items, errors = {}, []
    for source, cat, url in FEEDS:
        try:
            for x in fetch(source, cat, url):
                items.setdefault(x["u"], x)  # cùng bài ở nhiều chuyên mục: giữ lần đầu
        except Exception as e:  # một nguồn lỗi không làm hỏng cả lần chạy
            errors.append(f"{source} {cat}: {type(e).__name__}")
            print("lỗi", source, cat, e)

    cutoff = (now - timedelta(days=KEEP_DAYS)).isoformat()
    fresh = sorted((x for x in items.values() if x["d"] >= cutoff), key=lambda x: x["d"], reverse=True)[:MAX_ITEMS]

    # Chủ đề nóng: số tin 7 ngày gần nhất so với 7 ngày trước đó (trong kho quý)
    ARCHIVE.mkdir(exist_ok=True)
    q = f"{now.year}-Q{(now.month - 1) // 3 + 1}"
    arch_path = ARCHIVE / f"{q}.json"
    arch = json.loads(arch_path.read_text(encoding="utf-8")) if arch_path.exists() else {"quarter": q, "items": []}
    seen = {x["u"] for x in arch["items"]}
    for x in fresh:
        if x["u"] not in seen and x["d"][:7] >= f"{now.year}-{((now.month - 1) // 3) * 3 + 1:02d}":
            arch["items"].append({k: x[k] for k in ("t", "u", "d", "src", "cat", "tags")})
    arch["items"].sort(key=lambda x: x["d"])
    arch_path.write_text(json.dumps(arch, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    pool = {x["u"]: x for x in arch["items"]} | {x["u"]: x for x in fresh}
    d7, d14 = (now - timedelta(days=7)).isoformat(), (now - timedelta(days=14)).isoformat()
    hot = []
    for k in TOPICS:
        cur = sum(1 for x in pool.values() if k in x["tags"] and x["d"] >= d7)
        prev = sum(1 for x in pool.values() if k in x["tags"] and d14 <= x["d"] < d7)
        if cur:
            hot.append({"topic": k, "n7": cur, "prev7": prev})
    hot.sort(key=lambda x: x["n7"], reverse=True)

    OUT.write_text(json.dumps({"updated": now.isoformat(timespec="minutes"), "errors": errors, "hot": hot,
                               "sources": sorted({s for s, _, _ in FEEDS}), "items": fresh},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"news.json: {len(fresh)} tin, kho {q}: {len(arch['items'])} tin, lỗi: {errors or 'không'}")


if __name__ == "__main__":
    main()
