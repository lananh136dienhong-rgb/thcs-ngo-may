/**
 * api.js – LỚP GỌI BACKEND (Google Apps Script)
 * Mọi yêu cầu là POST JSON tới CONFIG.API_URL. Dùng Content-Type text/plain để trình duyệt
 * không gửi yêu cầu "preflight" (Apps Script không trả lời được loại yêu cầu này).
 * Backend luôn trả về {ok:true,data} hoặc {ok:false,error,code}.
 */
const API = {
  async call(action, payload) {
    const body = JSON.stringify(Object.assign({ action: action, token: sessionStorage.getItem('tok') || '' }, payload || {}));
    let res;
    try {
      res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, redirect: 'follow' });
    } catch (e) {
      throw Object.assign(new Error('Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.'), { code: 'NET' });
    }
    let j;
    try { j = await res.json(); }
    catch (e) { throw Object.assign(new Error('Máy chủ trả về dữ liệu không hợp lệ. Hãy kiểm tra lại địa chỉ API_URL trong config.js.'), { code: 'NET' }); }
    if (!j.ok) throw Object.assign(new Error(j.error || 'Có lỗi xảy ra'), { code: j.code || 'ERR' });
    return j.data;
  }
};
