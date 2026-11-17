/**
 * api.js – LỚP GỌI BACKEND (Google Apps Script)
 * Mọi yêu cầu là POST JSON tới CONFIG.API_URL. Dùng Content-Type text/plain để trình duyệt
 * không gửi yêu cầu "preflight" (Apps Script không trả lời được loại yêu cầu này).
 * Backend luôn trả về {ok:true,data} hoặc {ok:false,error,code}.
 *  - call(action, dữ liệu)  : trả về data
 *  - callR(action, dữ liệu) : xin backend trả KÈM dữ liệu mới nhất ({data, state}), tiết kiệm một lần gọi
 *  - warm()                 : gửi một yêu cầu nhẹ để "đánh thức" backend
 */
const API = {
  async raw(action, payload, refresh) {
    const body = JSON.stringify(Object.assign({ action: action, token: sessionStorage.getItem('tok') || '' }, payload || {}, refresh ? { refresh: true } : {}));
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
    return j;
  },
  async call(action, payload) { return (await this.raw(action, payload, false)).data; },
  async callR(action, payload) { const j = await this.raw(action, payload, true); return { data: j.data, state: j.state }; },
  warm() { try { fetch(CONFIG.API_URL, { mode: 'no-cors' }).catch(function () {}); } catch (e) {} }
};
