# Nhật ký thay đổi

Phiên bản theo semver: sửa lỗi và điều chỉnh nhỏ → patch, cập nhật lớn → minor, đổi cấu trúc tab hoặc mô hình dữ liệu → major. Số phiên bản là tham số `?v=` trong `index.html`.

## 1.0.8 – 13/11/2026

- Tổng quan, ô NAV: dòng "Do:" tách thay đổi so với phiên trước theo nguyên nhân: vàng (giá mua SJC × số lượng giữ), lãi tiết kiệm, giao dịch & khác (bán/mua, nạp/rút trong ngày).
- Thị trường: nút "Cập nhật & phân tích lại" tải lại dữ liệu mới nhất (máy chủ cập nhật 4 lần/ngày, giá SJC trực tiếp) và tính lại mọi phân tích, kèm thời điểm của dữ liệu.

## 1.0.7 – 11/11/2026

- Cơ cấu tài sản: thêm biểu đồ tròn Mục tiêu (theo khẩu vị đang chọn) cạnh biểu đồ Hiện tại, cùng bảng màu; rê chuột hiện tỷ trọng %; giãn khoảng cách hai biểu đồ, bỏ dòng "Mục tiêu theo khẩu vị…" (đã có trong nhãn biểu đồ).
- Diễn biến giá trị danh mục: trục giá trị bắt đầu từ 0 để lớp dưới cùng (vàng) không bị cắt khỏi biểu đồ khi cơ cấu thay đổi.
- Sửa: trên Safari iPhone, cột Chi tiết trong Lịch sử giao dịch (và các ô có đoạn chữ dài) bị phóng to chữ do tính năng tự điều chỉnh cỡ chữ của Safari; tắt bằng `text-size-adjust: 100%`.

## 1.0.6 – 10/11/2026

- Tổng quan làm lại: 4 ô chỉ số (NAV kèm biểu đồ nhỏ 3M, Tăng trưởng tổng tài sản, Thu nhập thụ động ước tính hiện tại và khi đạt mục tiêu, Tiến độ giảm tỷ trọng vàng có thanh tiến độ và link lịch bán). Thẻ Cơ cấu tài sản so sánh hiện tại với mục tiêu của khẩu vị đang chọn, cột Lệch (điểm %) có thanh xanh/đỏ; trên điện thoại bảng xuống dưới biểu đồ, ẩn thanh lệch.

## 1.0.5 – 10/11/2026

- Tổng quan: bỏ ô "Vàng nắm giữ" và "Giá SJC mua vào / bán ra" (giá đã lên thanh tiêu đề); dòng Vàng trong Cơ cấu tài sản ghi kèm số lượng. Ô Lãi/lỗ lũy kế thành **Tăng trưởng tổng tài sản** (%/năm, CAGR của NAV từ ngày mua lô vàng ban đầu đến nay, đã loại tiền nạp/rút từ bên ngoài; dưới 1 năm thì hiện mức tăng cộng dồn, không năm hóa). Việc cần làm nhắc nhập ngày mua cho lô vàng ban đầu nếu thiếu.
- Favicon: thêm số phiên bản vào đường dẫn (trình duyệt giữ favicon cũ rất lâu), bản PNG 32px dự phòng và apple-touch-icon PNG 180px cho màn hình chính điện thoại.
- Phân bổ chiến lược: còn 2 khẩu vị. Bỏ Thận trọng và Tăng trưởng (kết quả gần Cân bằng). Thêm **Tăng trưởng mạnh** (λ=1): không quỹ khẩn cấp, cổ phiếu ≤ 80%, vệ tinh ≤ 30% bằng quỹ cổ phiếu tăng trưởng (kỳ vọng = cổ phiếu + 2%, biến động 25%, chỉnh trong Giả định CME). Giải ngân có mục quỹ tăng trưởng (top 3 năm, mỗi công ty một quỹ); Việc cần làm gợi ý mua quỹ theo đợt DCA; loại quỹ có thêm "Tăng trưởng (vệ tinh)". Ai đang chọn Thận trọng/Tăng trưởng được chuyển về Cân bằng.
- Việc cần làm: gợi ý giải ngân cụ thể cho tiền nhàn rỗi (tiền mặt vượt quỹ khẩn cấp, vd sau khi bán vàng) theo phân bổ chiến lược: mua ETF cổ phiếu lõi đợt DCA tháng này (kèm số CCQ, trừ phần đã mua trong tháng) → quỹ trái phiếu → gửi tiết kiệm bậc thang 3–6–12 tháng (chia ngân hàng theo hạn mức bảo hiểm 125 tr) → phần còn lại giữ kỳ hạn ngắn chờ các đợt sau; cảnh báo khi quỹ khẩn cấp thiếu.
- Kiểm định quá khứ: bỏ dòng tóm tắt "Từ 1 năm trước…" trên tiêu đề thẻ; cột Chênh lệch đưa lên ngay sau mốc thời gian.

## 1.0.4 – 09/11/2026

- Thanh tiêu đề: bỏ đơn vị "tr/lượng" cạnh giá vàng (đơn vị hiện trong chú thích khi rê chuột).

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
