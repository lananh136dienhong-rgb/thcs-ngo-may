/**
 * Code.gs – ĐIỂM VÀO CỦA API
 * Website (Cloudflare Pages) gọi POST tới web app này. Mọi yêu cầu đi qua doPost().
 * Luồng: doPost → kiểm tra token (Auth.gs) → chạy hàm trong routes_() (Api.gs) → đọc/ghi Sheets/Drive (Db.gs).
 */

const CFG = {
  TZ: 'Asia/Ho_Chi_Minh',
  SESSION_HOURS: 8,                 // thời gian một phiên đăng nhập
  MAX_FILE_MB: 10,                  // dung lượng tối đa mỗi tệp (đồng bộ với frontend/config.js)
  EXT_OK: /\.(pdf|docx|xlsx|pptx|png|jpe?g|mp4|csv|txt)$/i
};

const LISTS = {
  status: ['Chưa tiếp nhận', 'Đang thực hiện', 'Chờ duyệt', 'Yêu cầu bổ sung', 'Đã hoàn thành'],
  pri: ['Thấp', 'Trung bình', 'Cao'],
  campus: ['Trường chính', 'Phân hiệu'],
  dept: ['Ban giám hiệu', 'Tổ GDTC – Nghệ thuật', 'Tổ KHTN – Công nghệ', 'Tổ Ngữ văn – GDCD', 'Tổ Sử – Địa', 'Tổ Tiếng Anh', 'Tổ Toán – Tin', 'Tổ Văn phòng'],
  kind: ['Phó hiệu trưởng', 'Tổ trưởng chuyên môn', 'Giáo viên', 'Nhân viên'],
  role: ['admin', 'leader', 'staff']
};

// Các hành động có ghi dữ liệu: chạy trong khóa để hai người thao tác cùng lúc không làm hỏng dữ liệu.
const WRITE_ACTIONS = ['readNotifs', 'createTask', 'editTask', 'deleteTask', 'acceptTask', 'progress', 'submitTask',
  'requestExt', 'decideExt', 'extendTask', 'approveTask', 'requestMore', 'addAssignee', 'sendMsg',
  'uploadDoc', 'setDocTag', 'deleteDoc', 'addTag', 'renameTag', 'deleteTag', 'updateProfile'];

class AppError extends Error {
  constructor(msg, code) { super(msg); this.code = code || 'ERR'; }
}

function doGet() { return out_({ ok: true, data: 'THCS Ngô Mây API đang chạy' }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (x) { return out_({ ok: false, error: 'Yêu cầu không hợp lệ', code: 'BAD' }); }
  try {
    const fn = routes_()[req.action];
    if (!fn) throw new AppError('Hành động không tồn tại', 'BAD');
    const user = req.action === 'login' ? null : authUser_(req.token);
    let data;
    if (WRITE_ACTIONS.indexOf(req.action) >= 0) {
      const lock = LockService.getScriptLock();
      try { lock.waitLock(25000); } catch (x) { throw new AppError('Hệ thống đang bận, vui lòng thử lại sau vài giây', 'BUSY'); }
      try { data = fn(user, req); } finally { lock.releaseLock(); }
    } else {
      data = fn(user, req);
    }
    return out_({ ok: true, data: data });
  } catch (err) {
    if (err instanceof AppError) return out_({ ok: false, error: err.message, code: err.code });
    console.error(err && err.stack ? err.stack : err);
    return out_({ ok: false, error: 'Lỗi hệ thống, vui lòng thử lại', code: 'SERVER' });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Hàm tiện ích dùng chung ----------
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function yes_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function now_() { return Utilities.formatDate(new Date(), CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function today_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
function fmtTime_(iso) {
  const m = String(iso).match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? m[2] + '/' + m[1] + ' ' + m[3] + ':' + m[4] : String(iso || '');
}
function str_(v, max, label, req) {
  const s = String(v == null ? '' : v).trim();
  if (req && !s) throw new AppError(label + ' không được để trống', 'BAD');
  if (s.length > max) throw new AppError(label + ' quá dài (tối đa ' + max + ' ký tự)', 'BAD');
  return s;
}
function date_(v, label) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T00:00:00'))) throw new AppError(label + ' không hợp lệ', 'BAD');
  return s;
}
function oneOf_(v, list, label) {
  if (list.indexOf(v) < 0) throw new AppError(label + ' không hợp lệ', 'BAD');
  return v;
}
function group_(arr, key) {
  const m = {};
  arr.forEach(function (r) { (m[r[key]] = m[r[key]] || []).push(r); });
  return m;
}
