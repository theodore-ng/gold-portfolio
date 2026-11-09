# Nhật ký thay đổi

Phiên bản theo semver: sửa lỗi và điều chỉnh nhỏ → patch, cập nhật lớn → minor, đổi cấu trúc tab hoặc mô hình dữ liệu → major. Số phiên bản là tham số `?v=` trong `index.html`.

## 1.0.3 – 09/11/2026

- Thanh tiêu đề: giá vàng SJC mua/bán hôm nay kèm ▲ xanh / ▼ đỏ / ■ đứng giá so với phiên trước (thay dòng nguồn giá; nguồn và giờ cập nhật hiện khi rê chuột).
- Diễn biến giá trị danh mục: dòng giá trị hôm nay và tăng/giảm so với phiên trước, cùng kiểu mũi tên; ô NAV ở Tổng quan dùng cùng kiểu.

## 1.0.2 – 09/11/2026

- Sửa: biểu đồ Diễn biến giá trị danh mục và Lạm phát & sức mua cắt theo số ngày lịch (trước đây cắt theo số điểm dữ liệu nên 1Y kéo dài khoảng 16 tháng). Nhãn trục hiện năm khi xem từ 1Y trở lên.
- Đơn vị thời gian theo chuẩn quốc tế: M (tháng), Y (năm) thay cho T/N (T dễ nhầm tuần/tháng).

## 1.0.1 – 09/11/2026

- Đổi tên app thành **Quản lý tài chính**.
- Logo mới: nhân vật tròn đỏ cam há miệng đớp đồng xu vàng (ảnh pixel 24×24, giữ bảng màu cũ).

## 1.0.0 – 09/11/2026 (bản ổn định đầu tiên)

- **Tên mới:** Quản trị Vốn (Capital Management), logo ảnh pixel tôm hùm cầm đồng xu (`logo.svg`).
- **Cấu trúc theo quy trình quản lý danh mục CFA** (lập kế hoạch → thực thi → theo dõi và đánh giá), 5 tab:
  - Danh mục: Tổng quan (NAV, lãi/lỗ lũy kế, cơ cấu tài sản) · Nắm giữ & giao dịch · Hiệu quả (diễn biến giá trị, kiểm định quá khứ).
  - Thị trường: Tin tức · Vĩ mô & dòng tiền · Vàng Việt Nam.
  - Chiến lược: Phân bổ chiến lược (giả định CME, SAA theo khẩu vị rủi ro) · Dự phóng Monte Carlo.
  - Thực thi: Việc cần làm + rà soát danh mục · Giảm tỷ trọng vàng · Giải ngân.
  - Tài khoản: Người dùng & sao lưu · Giới thiệu.
- **Thuật ngữ:** Hiện trạng / Mục tiêu (thay Giữ nguyên / Theo dự án), khẩu vị rủi ro (thay hồ sơ), kiểm định quá khứ, dự phóng, kế hoạch giảm tỷ trọng vàng, NAV.
- Link cũ (#info, #assets, #me, #about) tự chuyển sang tab mới. Dữ liệu (`quyvang_v1`) giữ nguyên.

## Trước 1.0.0 (07–09/11/2026)

Các bản đánh số theo ngày (`?v=2026110xx`): quản lý vàng/tiền mặt/tiết kiệm/chứng khoán, đăng nhập Supabase, lộ trình bán vàng, tối ưu CFA, Monte Carlo, vĩ mô & dòng tiền, tin tức RSS, giao diện retro nền sáng, phân tích vàng Việt Nam (premium, chênh lệch mua–bán, vùng đáy), các khối thu gọn.
