# Quản trị Vốn (Capital Management)

<img src="logo.svg" width="64" alt="">

Web app cá nhân quản trị danh mục **vàng, tiền mặt, tiết kiệm, chứng khoán và tài sản khác** và chuyển dần sang danh mục tối ưu theo phương pháp **CFA**, có điều chỉnh theo dữ liệu thị trường Việt Nam và thế giới.

🔗 **https://theodore-ng.github.io/gold-portfolio/**

> Công cụ theo dõi và lập kế hoạch, **không phải khuyến nghị đầu tư**. Kết quả tối ưu và mô phỏng phụ thuộc hoàn toàn vào giả định.

---

## Tính năng

Cấu trúc theo quy trình quản lý danh mục (CFA): lập kế hoạch → thực thi → theo dõi và đánh giá.

| Tab | Mục | Nội dung |
|---|---|---|
| **Danh mục** | Tổng quan | Giá trị tài sản ròng (NAV), thay đổi so với hôm trước, lãi/lỗ lũy kế (chưa chốt, đã chốt, lãi tiền gửi), giá SJC mua/bán và premium, cơ cấu tài sản hiện tại |
| | Nắm giữ & giao dịch | Mỗi lớp tài sản một khối: khớp số thực tế, bán vàng (FIFO), mua lô, gửi/tất toán tiền gửi, thu/chi tiền mặt, chứng khoán, lịch sử giao dịch |
| | Hiệu quả | Diễn biến giá trị danh mục; kiểm định quá khứ: nếu đã tái cơ cấu theo phân bổ chiến lược từ 1/6/12 tháng trước, chia theo từng lớp tài sản |
| **Thị trường** | Tin tức | Tin kinh tế CafeF, Vietstock, VnEconomy (RSS), chủ đề nóng 7 ngày |
| | Vĩ mô & dòng tiền | Nhận định quý, chu kỳ kinh tế, kinh tế VN, dòng tiền liên thị trường, ngành được tập trung đầu tư, rủi ro suy thoái, lạm phát & sức mua |
| | Vàng Việt Nam | Premium so với thế giới, chênh lệch mua–bán, cung cầu, độ ổn định, mốc xác nhận đáy sau đỉnh, bảng yếu tố kỳ vọng, bối cảnh chính sách |
| **Chiến lược** | Phân bổ chiến lược | Giả định kỳ vọng thị trường (CME); so sánh hiện trạng với 3 phân bổ tối ưu theo khẩu vị rủi ro (Thận trọng / Cân bằng / Tăng trưởng) |
| | Dự phóng | Monte Carlo 2.000 kịch bản (1/3/5/10 năm): danh mục mục tiêu so với hiện trạng, kịch bản xấu/tốt, sụt giảm tối đa, thu nhập thụ động, điểm hòa giá vàng |
| **Thực thi** | Việc cần làm | Việc cần làm trong ngày, rà soát danh mục (tính trên trình duyệt) |
| | Giảm tỷ trọng vàng | Số lượng giữ lại, lịch bán theo tháng; mỗi đợt tăng/giảm/tạm dừng theo premium SJC và giá vàng thế giới |
| | Giải ngân | Số tiền và số chứng chỉ quỹ ETF mua mỗi tháng (DCA), quỹ mở, cổ phiếu đáng quan tâm kèm chỉ số tài chính và cảnh báo rủi ro |
| **Tài khoản** | | Đăng nhập Supabase, đồng bộ giữa các thiết bị, xuất/nhập sao lưu JSON; giới thiệu |

## Phương pháp phân bổ (CFA Level III)

1. **Kỳ vọng thị trường (CME)** cho từng lớp tài sản, tính lại khi dữ liệu thay đổi:
   - *Tiết kiệm:* lãi hiện tại cho năm đầu, lãi dài hạn cho các năm sau.
   - *Trái phiếu:* trung vị lợi nhuận 12 tháng của các quỹ trái phiếu (≈ lợi suất hiện tại).
   - *Cổ phiếu:* Grinold–Kroner (cổ tức + tăng trưởng thực + lạm phát − pha loãng), điều chỉnh theo xu hướng VN-Index (MA200) và mức rủi ro suy thoái.
   - *Vàng:* kỳ vọng vàng thế giới trừ phần premium SJC dự kiến co lại, cộng thêm khi lạm phát cao.
   - *Vệ tinh (tự giao dịch):* alpha = 0, biến động cao hơn.
2. **Tối ưu trung bình–phương sai:** tối đa U = E(R) − ½·λ·σ² với λ = 8 / 4 / 2, dưới các ràng buộc IPS: quỹ khẩn cấp, vàng tối thiểu/tối đa, trần cổ phiếu và vệ tinh.

Mọi giả định và ràng buộc chỉnh được trong mục *Giả định*. Logic nằm ở `plan.js` (`cme()`, `optimize()`, `simulate()`).

## Kiến trúc

```
index.html, style.css      Giao diện (HTML/CSS/JS thuần + Chart.js, không cần build)
app.js                     Trạng thái, giao dịch, lộ trình bán vàng, biểu đồ, đăng nhập/lưu trữ
plan.js                    CME, tối ưu danh mục, thẻ hồ sơ, Monte Carlo
invest.js                  Hướng dẫn giải ngân (ETF, quỹ mở, cổ phiếu)
macro.js                   Vĩ mô, dòng tiền, rủi ro suy thoái, lạm phát
config.js                  URL + khóa publishable của Supabase (để trống = chế độ cục bộ)
supabase/schema.sql        Bảng portfolios/profiles + Row Level Security
scripts/update_prices.py   → data/prices.json, data/macro.json
scripts/update_invest.py   → data/invest.json
data/vn_macro.json         Số liệu vĩ mô VN (cập nhật thủ công hằng tháng)
.github/workflows/prices.yml  Chạy 2 script 4 lần/ngày (9:15, 11:15, 14:15, 17:15 giờ VN) và commit dữ liệu
```

### Nguồn dữ liệu

| Dữ liệu | Nguồn | Cập nhật |
|---|---|---|
| Giá vàng SJC, nhẫn | PNJ (trình duyệt gọi trực tiếp khi mở trang + lưu lịch sử) | Thời gian thực / 4 lần/ngày |
| Vàng TG, USD/VND, chỉ số, hàng hóa, VIX | Yahoo Finance | 4 lần/ngày |
| Đường cong lợi suất, quy tắc Sahm, xác suất suy thoái, chênh lệch HY, CPI Mỹ | FRED | 4 lần/ngày |
| Lạm phát VN theo năm | World Bank | 4 lần/ngày |
| VN-Index, giá ETF và cổ phiếu, P/E, P/B, ROE… | VNDirect | 4 lần/ngày |
| Quỹ mở trái phiếu/cổ phiếu (NAV, hiệu suất, phí) | fmarket | 4 lần/ngày |
| CPI, GDP, tín dụng, đầu tư công VN | Cục Thống kê, NHNN, Bộ Tài chính | Thủ công hằng tháng (`data/vn_macro.json`) |

Giá SJC trước ngày bắt đầu theo dõi là **ước tính** (giá thế giới quy đổi × premium lần đo đầu tiên) và được vẽ nét đứt.

## Bảo mật & quyền riêng tư

- Repo này **không chứa dữ liệu tài sản cá nhân**. Dữ liệu nằm trong bảng `portfolios` của Supabase, được bảo vệ bằng Row Level Security: mỗi người chỉ đọc/ghi được dòng của mình. Ở chế độ cục bộ, dữ liệu nằm trong `localStorage` của trình duyệt.
- `config.js` chỉ chứa khóa **publishable/anon** (được phép công khai). **Không bao giờ** đặt khóa `service_role`/secret vào repo.
- Tự đăng ký đã tắt: tài khoản do quản trị viên tạo trong Supabase. Vai trò (`admin`/`user`) lưu ở bảng `profiles` và không thể tự sửa qua API.

## Cài đặt

### Chạy trên máy

```bash
python -m http.server 8000      # trong thư mục repo, rồi mở http://localhost:8000
```

Để trống `supabaseUrl`/`supabaseKey` trong `config.js` sẽ chạy chế độ cục bộ, không cần đăng nhập.

### Bật đăng nhập (Supabase)

1. Tạo project trên [supabase.com](https://supabase.com).
2. **Authentication → Sign In / Providers → Email**: tắt *Allow new users to sign up*.
3. **Authentication → Users → Add user**: email dạng `<tên>@quyvang.app`, tích *Auto Confirm User*. Người dùng đăng nhập bằng `<tên>`; tên miền đặt ở `emailDomain` trong `config.js`.
4. **SQL Editor**: chạy `supabase/schema.sql`, rồi chạy câu lệnh gán quyền admin ở cuối file (bỏ chú thích, thay `<ten>`).
5. Điền **Project URL** và **Publishable key** vào `config.js`.

### Cập nhật dữ liệu bằng tay

```bash
pip install -r scripts/requirements.txt
python scripts/update_prices.py && python scripts/update_invest.py
```

## Bảo trì

- **Mỗi lần deploy:** tăng `?v=` của các file css/js trong `index.html`. GitHub Pages cache 10 phút, nếu không tăng thì người dùng có thể thấy bản cũ.
- **Hằng tháng** (sau khi Cục Thống kê công bố, khoảng ngày 6): cập nhật `data/vn_macro.json`, ghi nguồn và kỳ số liệu, đổi `asOf`.
- **Khi có sự kiện doanh nghiệp:** cập nhật `RISK_NOTES` trong `scripts/update_invest.py`, luôn ghi nguồn. Danh sách mã theo dõi nằm ở `STOCKS` và `ETFS`.
- **Khi đổi phương pháp hoặc giả định mặc định** trong `plan.js`: tăng `PLAN_VERSION` để dữ liệu cũ của người dùng chuyển sang giả định mới.
