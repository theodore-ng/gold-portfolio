// Cấu hình Supabase. Khóa "anon/publishable" được phép công khai: dữ liệu được bảo vệ bằng Row Level Security.
// KHÔNG BAO GIỜ đặt khóa service_role / secret vào đây.
// Để trống => app chạy chế độ cục bộ (dữ liệu chỉ trong trình duyệt, không đăng nhập).
window.QV_CONFIG = {
  supabaseUrl: "",
  supabaseKey: "",
  emailDomain: "quyvang.app", // tên đăng nhập "dongtrieu" => email dongtrieu@quyvang.app trong Supabase
};
