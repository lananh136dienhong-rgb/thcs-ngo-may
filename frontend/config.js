/**
 * config.js – CẤU HÌNH DUY NHẤT CẦN SỬA KHI TRIỂN KHAI
 * Hai giá trị đầu lấy được sau khi làm theo HUONG_DAN_TRIEN_KHAI.md (bước 1 và bước 4).
 */
window.CONFIG = {
  // Địa chỉ web app Apps Script (kết thúc bằng /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbzBFPlrnLRb7k6ZGaUuf5Tr3G7ryC_opxxkw_VSZFQSddlFVEIVmokVgmceW8G7iHIyEA/exec',
  // Client ID tạo trong Google Cloud Console (dạng xxxx.apps.googleusercontent.com)
  GOOGLE_CLIENT_ID: '761801522322-mbeq2l5cp6j55er0ej15c7u79qe983d5.apps.googleusercontent.com',
  // Dung lượng tối đa mỗi tệp (MB). Phải KHÔNG lớn hơn CFG.MAX_FILE_MB trong backend/Code.gs
  MAX_FILE_MB: 10,
  // Chu kỳ làm mới khi đang mở một nhiệm vụ (để thấy tin nhắn mới), tính bằng mili giây
  POLL_DETAIL_MS: 12000,
  // Chu kỳ làm mới các trang danh sách (nhiệm vụ, thông báo...). Tăng lên nếu lo vượt hạn mức Apps Script
  POLL_LIST_MS: 45000
};
