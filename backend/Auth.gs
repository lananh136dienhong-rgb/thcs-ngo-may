/**
 * Auth.gs – ĐĂNG NHẬP BẰNG GOOGLE VÀ PHIÊN LÀM VIỆC
 * 1) Website lấy "ID token" từ Google (Google Identity Services) và gửi action 'login'.
 * 2) Backend nhờ Google xác minh token, lấy email, đối chiếu sheet Users (email phải có và active = TRUE).
 * 3) Backend cấp "token phiên" ký bằng HMAC (không cần lưu ở đâu), mọi yêu cầu sau gửi kèm token này.
 */

function verifyGoogle_(idToken) {
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new AppError('Phiên đăng nhập Google không hợp lệ, vui lòng thử lại', 'AUTH');
  const t = JSON.parse(res.getContentText());
  const issOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (t.aud !== prop_('GOOGLE_CLIENT_ID') || !issOk || String(t.email_verified) !== 'true' || Number(t.exp) * 1000 < Date.now()) {
    throw new AppError('Phiên đăng nhập Google không hợp lệ, vui lòng thử lại', 'AUTH');
  }
  return String(t.email).trim().toLowerCase();
}

function apiLogin_(_, req) {
  if (!req.idToken) throw new AppError('Thiếu thông tin đăng nhập', 'BAD');
  const email = verifyGoogle_(req.idToken);
  const u = Db.all('Users').find(function (x) { return String(x.email).trim().toLowerCase() === email; });
  if (!u || !yes_(u.active)) {
    throw new AppError('Email ' + email + ' chưa được cấp quyền truy cập. Vui lòng liên hệ văn phòng nhà trường.', 'DENIED');
  }
  if (LISTS.role.indexOf(u.app_role) < 0) throw new AppError('Tài khoản chưa được gán quyền. Vui lòng liên hệ văn phòng.', 'DENIED');
  return { token: makeToken_(u.user_id) };
}

function sign_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, prop_('TOKEN_SECRET')));
}
function makeToken_(uid) {
  const exp = Date.now() + CFG.SESSION_HOURS * 3600 * 1000;
  const p = Utilities.base64EncodeWebSafe(uid + '|' + exp);
  return p + '.' + sign_(p);
}
function authUser_(tok) {
  const bad = function () { return new AppError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 'AUTH'); };
  if (!tok || typeof tok !== 'string' || tok.indexOf('.') < 1) throw bad();
  const parts = tok.split('.');
  if (sign_(parts[0]) !== parts[1]) throw bad();
  const body = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString().split('|');
  if (Number(body[1]) < Date.now()) throw bad();
  const u = Db.all('Users').find(function (x) { return x.user_id === body[0]; });
  if (!u || !yes_(u.active)) throw bad();   // tài khoản bị khóa thì mất quyền ngay, không cần chờ hết phiên
  return u;
}
function isAdmin_(u) { return u.app_role === 'admin'; }
function admin_(u) {
  if (!isAdmin_(u)) throw new AppError('Bạn không có quyền thực hiện thao tác này', 'FORBIDDEN');
}
