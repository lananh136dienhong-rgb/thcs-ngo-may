# Kiểm thử backend (không cần tài khoản Google)

Chạy toàn bộ logic của thư mục `backend/` trên môi trường Google giả lập (Sheets, Drive, đăng nhập).
Cần Node.js (phiên bản 18 trở lên):

    node run.js

Bộ kiểm thử gồm 15 nhóm, gồm cả AI: Gemini được **giả lập** (không gọi Google thật, không tốn tiền), kiểm tra đọc/phân loại, tính hạn, dữ liệu AI xấu, lỗi 429, đề xuất nhiệm vụ, xóa nhiệm vụ và nâng cấp `upgrade()`. Việc gọi Gemini THẬT chỉ kiểm tra được bằng hàm `aiSelfTest()` trong Apps Script.

Chạy lại sau mỗi lần sửa mã backend. Kết quả cuối cùng phải là `0 lỗi`.
Lưu ý: bộ kiểm thử này không thay thế việc thử trên Google thật (xem mục 9 trong HUONG_DAN_TRIEN_KHAI.md).
