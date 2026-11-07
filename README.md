# Quỹ Vàng

Web app cá nhân theo dõi danh mục vàng SJC, tiền mặt, tiết kiệm và lộ trình bán vàng dần.

- **Dữ liệu cá nhân chỉ lưu trong trình duyệt** (localStorage), không nằm trong repo này. Dùng nút *Xuất sao lưu* / *Nhập sao lưu* để chuyển máy.
- Giá SJC lấy trực tiếp từ PNJ khi mở trang. `data/prices.json` (lịch sử giá SJC, vàng thế giới, USD/VND) được GitHub Actions cập nhật 4 lần/ngày (`scripts/update_prices.py`).
- Giá SJC trước ngày bắt đầu theo dõi là **ước tính** (giá thế giới quy đổi × premium lần đo đầu), vẽ nét đứt trên biểu đồ.

Không phải khuyến nghị đầu tư.
