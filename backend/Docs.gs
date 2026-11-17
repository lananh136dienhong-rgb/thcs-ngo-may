/**
 * Docs.gs – VĂN BẢN, THẺ PHÂN LOẠI, HỒ SƠ CÁ NHÂN
 */

// Tải lên nhanh: tệp được ghi vào Drive TRƯỚC và NGOÀI khóa (đây là bước chậm nhất); khóa chỉ giữ trong lúc cấp mã và ghi một dòng vào Sheets.
// Sau đó trả về luôn dòng văn bản mới, website không phải tải lại toàn bộ dữ liệu.
function stagingDir_() {
  const c = CacheService.getScriptCache();
  const cached = c.get('stg');
  if (cached) { try { return DriveApp.getFolderById(cached); } catch (e) { /* thư mục đã đổi, tìm lại */ } }
  const dir = child_(DriveApp.getFolderById(prop_('FOLDER_VANBAN')), STAGING);
  try { c.put('stg', dir.getId(), 21600); } catch (e) { console.error(e); }
  return dir;
}
// Mã văn bản chỉ tăng, không bao giờ cấp lại mã của văn bản đã xóa (nếu cấp lại, AI đang đọc văn bản cũ có thể ghi nhầm kết quả vào văn bản mới).
function nextDocId_() {
  const prefix = 'VB-' + today_().slice(0, 4) + '-', key = 'DOCSEQ_' + prefix.slice(3, 7);
  const fromRows = parseInt(Db.nextId('Documents', 'doc_id', prefix, 3).slice(prefix.length), 10);
  const n = Math.max(fromRows, Number(prop_(key) || 0) + 1);
  PropertiesService.getScriptProperties().setProperty(key, String(n));
  return prefix + String(n).padStart(3, '0');
}
function docDup_(name, size) {
  return Db.all('Documents').some(function (d) { return !yes_(d.is_deleted) && d.name === name && Number(d.size_bytes) === size; });
}
function apiUploadDoc_(u, r) {
  const fl = files_([r])[0], size = fl.bytes.length;
  const dupMsg = 'Văn bản này đã tồn tại (trùng tên và dung lượng). Hãy chọn tệp khác.';
  if (docDup_(fl.name, size)) throw new AppError(dupMsg, 'BAD');
  // Tệp nằm ở thư mục tạm cho tới khi Hiệu trưởng xác nhận phân loại (confirmDoc) thì mới chuyển vào thư mục chính thức.
  const file = share_(stagingDir_().createFile(Utilities.newBlob(fl.bytes, fl.mime, 'tmp_' + slug_(fl.name))));
  let id;
  try {
    withLock_(function () {
      Db.refresh('Documents');
      if (docDup_(fl.name, size)) throw new AppError(dupMsg, 'BAD');
      id = nextDocId_();
      Db.append('Documents', { doc_id: id, name: fl.name, drive_file_id: file.getId(), size_bytes: size, uploaded_by: u.user_id, uploaded_at: now_(), tag: '', reviewed: false, reviewed_at: '', is_deleted: false, agency: '', doc_no: '', summary: '', ai_status: aiEnabled_() ? 'queued' : 'off', ai_tries: 0, ai_at: '', ai_error: '', ai_result: '' });
    });
  } catch (e) {
    try { file.setTrashed(true); } catch (x) { console.error(x); }
    throw e;
  }
  try { file.setName(id + '_' + slug_(fl.name)); } catch (e) { console.error(e); }
  if (!isMgr_(u)) notify_('ADMIN', u.full_name + ' đã tải lên văn bản ' + id + ' (chờ phân loại)', '');
  const row = Db.all('Documents').find(function (d) { return d.doc_id === id; });
  return { id: id, ai: aiEnabled_(), doc: row ? docView_(row, isMgr_(u), userNames_(), u) : null };
}
function doc_(id) {
  const d = Db.all('Documents').find(function (x) { return x.doc_id === String(id) && !yes_(x.is_deleted); });
  if (!d) throw new AppError('Không tìm thấy văn bản', 'NOTFOUND');
  return d;
}
// ---- cơ quan ban hành (thẻ phân loại thứ hai, Hiệu trưởng tự thêm/sửa/xóa) ----
function code_(v) { const s = String(v == null ? '' : v).replace(/^'/, '').trim(); return /^\d+$/.test(s) ? s.padStart(2, '0') : s; }
function seedAgencies_() {
  if (Db.all('Agencies').length) return;
  AGENCIES.forEach(function (a) { Db.append('Agencies', { code: a.code, name: a.name, folder: a.folder, active: true }); });
}
function agencies_() {
  seedAgencies_();
  return Db.all('Agencies').filter(function (a) { return yes_(a.active); }).map(function (a) { return { code: code_(a.code), name: a.name, folder: a.folder, _row: a._row }; });
}
function agency_(code) {
  const a = agencies_().find(function (x) { return x.code === code_(code); });
  if (!a) throw new AppError('Hãy chọn cơ quan ban hành', 'BAD');
  return a;
}
function typeFolder_(tag) { return TYPE_FOLDERS[tag] || slug_(tag); }
function agencyName_(v, label) { return str_(v, 80, label || 'Tên cơ quan', true); }
function apiAddAgency_(u, r) {
  admin_(u);
  const n = agencyName_(r.name), list = agencies_();
  if (list.some(function (a) { return plain_(a.name) === plain_(n); })) throw new AppError('Cơ quan này đã tồn tại', 'BAD');
  let max = 0;
  Db.all('Agencies').forEach(function (a) { const k = parseInt(code_(a.code), 10); if (k > max) max = k; });
  const code = String(max + 1).padStart(2, '0'), folder = code + '_' + slug_(n).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  Db.append('Agencies', { code: code, name: n, folder: folder, active: true });
  return { code: code };
}
function apiRenameAgency_(u, r) {
  admin_(u);
  const nw = agencyName_(r.name), list = agencies_(), a = list.find(function (x) { return x.code === code_(r.code); });
  if (!a) throw new AppError('Cơ quan không tồn tại', 'NOTFOUND');
  if (list.some(function (x) { return x.code !== a.code && plain_(x.name) === plain_(nw); })) throw new AppError('Cơ quan này đã tồn tại', 'BAD');
  Db.update('Agencies', a._row, { name: nw });   // chỉ đổi tên hiển thị, thư mục Drive giữ nguyên
  return true;
}
function apiDeleteAgency_(u, r) {
  admin_(u);
  const list = agencies_(), a = list.find(function (x) { return x.code === code_(r.code); });
  if (!a) throw new AppError('Cơ quan không tồn tại', 'NOTFOUND');
  if (list.length <= 1) throw new AppError('Phải còn ít nhất một cơ quan ban hành', 'BAD');
  const n = Db.all('Documents').filter(function (d) { return !yes_(d.is_deleted) && code_(d.agency) === a.code; }).length;
  if (n) throw new AppError('Không xóa được: còn ' + n + ' văn bản thuộc cơ quan này. Hãy chuyển các văn bản đó sang cơ quan khác trước, hoặc đổi tên cơ quan.', 'BAD');
  Db.update('Agencies', a._row, { active: false });
  return true;
}
// Thư mục con theo tên; thư mục cơ quan khớp theo mã đầu tên ("03_..."), nhờ vậy dùng được cả thư mục có sẵn của Hiệu trưởng.
function agencyFolder_(root, ag) {
  const it = root.getFolders();
  while (it.hasNext()) {
    const f = it.next();
    if (new RegExp('^' + ag.code + '(?![0-9])').test(String(f.getName()).trim())) return f;
  }
  return root.createFolder(ag.folder);
}
function fileDoc_(d, ag, tag) {
  const root = DriveApp.getFolderById(prop_('FOLDER_VANBAN')), dest = child_(agencyFolder_(root, ag), typeFolder_(tag));
  DriveApp.getFileById(d.drive_file_id).moveTo(dest);
}
// Hiệu trưởng hoặc leader đồng ý (hoặc sửa) phân loại: tệp được chuyển vào thư mục, các nhiệm vụ AI gợi ý được đưa vào danh sách chờ duyệt.
function apiConfirmDoc_(u, r) {
  mgr_(u);
  const d = doc_(r.docId), tag = String(r.tag || ''), ag = agency_(r.agency);
  if (d.hs_id) throw new AppError('Văn bản này thuộc hồ sơ công văn, hãy xác nhận trong mục Danh sách công văn', 'BAD');
  if (yes_(d.reviewed)) throw new AppError('Văn bản này đã được phân loại rồi', 'BAD');
  if (!Db.all('DocTags').some(function (t) { return yes_(t.active) && t.tag_name === tag; })) throw new AppError('Hãy chọn loại văn bản', 'BAD');
  if (d.ai_status === 'reading' && minutesSince_(d.ai_at) <= AI.STALE_MIN) throw new AppError('AI đang đọc văn bản này, vui lòng chờ vài giây rồi thử lại', 'BAD');
  const a = aiResult_(d), at = now_();
  try { fileDoc_(d, ag, tag); }
  catch (e) { console.error(e); throw new AppError('Không chuyển được tệp vào thư mục Drive. Hãy kiểm tra quyền của thư mục văn bản.', 'SERVER'); }
  if (a && (a.k !== tag || a.ag !== ag.code)) {
    Db.append('AiFeedback', { fb_id: Db.nextId('AiFeedback', 'fb_id', 'FB', 4), doc_name: d.name, ai_tag: a.k, ai_agency: a.ag, final_tag: tag, final_agency: ag.code, at: at });
  }
  Db.update('Documents', d._row, { tag: tag, agency: ag.code, doc_no: a ? a.num : '', summary: a ? a.sum : '', reviewed: true, reviewed_at: at, ai_result: '' });
  let n = 0;
  if (a && !a.mat) {
    (a.tasks || []).forEach(function (t) {
      Db.append('AiSuggestions', { sug_id: Db.nextId('AiSuggestions', 'sug_id', 'DX-', 4), doc_id: d.doc_id, title: t.title, description: t.desc, due_date: t.due, source_text: t.src, how: t.how, status: 'pending', task_id: '', created_at: at });
      n++;
    });
  }
  if (d.uploaded_by !== u.user_id) notify_(d.uploaded_by, 'Văn bản ' + d.doc_id + ' đã được phân loại vào kho văn bản', '');
  return { tasks: n };
}
// Xóa văn bản: xóa HẲN mọi dữ liệu của văn bản trong Google Sheets (dòng văn bản, đề xuất AI, liên kết tài liệu của nhiệm vụ,
// thông báo, ghi nhận sửa phân loại) và chuyển tệp trong Drive vào thùng rác (Drive tự xóa vĩnh viễn sau 30 ngày, có thể khôi phục trước đó).
// Nhiệm vụ đã tạo từ văn bản này vẫn giữ nguyên, chỉ gỡ liên kết tới văn bản.
function wipeDoc_(d) {
  const id = d.doc_id, idRe = new RegExp(id.replace(/[-]/g, '\\-') + '(?!\\d)');
  try { DriveApp.getFileById(d.drive_file_id).setTrashed(true); } catch (e) { console.error(e); }
  Db.removeWhere('AiSuggestions', function (x) { return x.doc_id === id; });
  Db.removeWhere('TaskDocs', function (x) { return x.doc_id === id; });
  Db.removeWhere('Notifications', function (x) { return idRe.test(String(x.text)); });
  Db.removeWhere('AiFeedback', function (x) { return x.doc_name === d.name; });
  Db.all('Tasks').filter(function (t) { return t.src_doc === id; }).forEach(function (t) { Db.update('Tasks', t._row, { src_doc: '' }); });
  Db.removeWhere('Documents', function (x) { return x.doc_id === id; });
}
function apiDeleteDoc_(u, r) {
  admin_(u);   // chỉ Hiệu trưởng xóa được văn bản trong kho (leader không xóa được)
  const d = doc_(r.docId);
  if (d.hs_id && d.hs_id !== HS_DRAFT) return hsRemoveDoc_(d);   // tệp thuộc hồ sơ: giữ hồ sơ luôn có văn bản chính
  wipeDoc_(d);
  return true;
}
// Nhân viên chỉ tải được văn bản đã phân loại (hoặc do chính mình tải lên); Hiệu trưởng và leader tải được mọi văn bản.
function apiDownloadDoc_(u, r) {
  const d = doc_(r.docId);
  if (!isMgr_(u) && !yes_(d.reviewed) && d.uploaded_by !== u.user_id && !(isSec_(u) && d.hs_id)) throw new AppError('Văn bản này chưa được Hiệu trưởng phân loại', 'FORBIDDEN');
  const b = b64_(d.drive_file_id);
  return { name: d.name, mime: b.mime, data: b.data };
}

// ---- thẻ phân loại ----
function tagName_(v) { return str_(v, 40, 'Tên thẻ', true); }
function apiAddTag_(u, r) {
  admin_(u);
  const n = tagName_(r.name);
  if (Db.all('DocTags').some(function (t) { return yes_(t.active) && t.tag_name === n; })) throw new AppError('Thẻ này đã tồn tại', 'BAD');
  Db.append('DocTags', { tag_id: Db.nextId('DocTags', 'tag_id', 'TG', 2), tag_name: n, active: true });
  return true;
}
function apiRenameTag_(u, r) {
  admin_(u);
  const nw = tagName_(r.nw), tags = Db.all('DocTags').filter(function (t) { return yes_(t.active); });
  const t = tags.find(function (x) { return x.tag_name === r.old; });
  if (!t) throw new AppError('Thẻ không tồn tại', 'NOTFOUND');
  if (tags.some(function (x) { return x.tag_name === nw; })) throw new AppError('Thẻ này đã tồn tại', 'BAD');
  Db.update('DocTags', t._row, { tag_name: nw });
  Db.all('Documents').filter(function (d) { return d.tag === r.old; }).forEach(function (d) { Db.update('Documents', d._row, { tag: nw }); });
  return true;
}
function apiDeleteTag_(u, r) {
  admin_(u);
  const t = Db.all('DocTags').find(function (x) { return yes_(x.active) && x.tag_name === r.name; });
  if (!t) throw new AppError('Thẻ không tồn tại', 'NOTFOUND');
  Db.update('DocTags', t._row, { active: false });
  Db.all('Documents').filter(function (d) { return d.tag === r.name; }).forEach(function (d) { Db.update('Documents', d._row, { tag: '' }); });
  return true;
}

// ---- hồ sơ cá nhân và quản lý nhân sự ----
// Quyền trong hệ thống chỉ theo app_role (admin / leader / staff / secretary); chức vụ chỉ để hiển thị, đổi chức vụ KHÔNG làm thay đổi quyền.
const NOT_DELETED = function (x) { return !yes_(x.is_deleted); };
function nameOk_(v, selfId) {
  const n = str_(v, 60, 'Họ và tên', true);
  if (n.length < 2) throw new AppError('Họ và tên quá ngắn', 'BAD');
  if (Db.all('Users').filter(NOT_DELETED).some(function (x) { return x.user_id !== selfId && String(x.full_name).trim().toLowerCase() === n.toLowerCase(); })) {
    throw new AppError('Đã có nhân sự khác trùng họ tên này. Hãy thêm ký hiệu phân biệt (ví dụ: tên tổ).', 'BAD');
  }
  return n;
}
function emailOk_(v, selfId) {
  const e = str_(v, 120, 'Email', true).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new AppError('Email không hợp lệ', 'BAD');
  if (Db.all('Users').filter(NOT_DELETED).some(function (x) { return x.user_id !== selfId && String(x.email).trim().toLowerCase() === e; })) {
    throw new AppError('Email này đã được dùng cho nhân sự khác', 'BAD');
  }
  return e;
}
function yearOk_(v) {
  const y = String(v == null ? '' : v).trim();
  if (y && !(/^\d{4}$/.test(y) && +y >= 1940 && +y <= 2012)) throw new AppError('Năm sinh không hợp lệ', 'BAD');
  return y ? Number(y) : '';
}
function phoneOk_(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return '';
  const p = raw.replace(/[\s.\-()]/g, '');
  if (!/^\+?\d{8,15}$/.test(p)) throw new AppError('Số điện thoại không hợp lệ', 'BAD');
  return p;
}
// Số nhập tay trong sheet có thể bị Sheets đổi thành số và mất số 0 đầu (905123456): hiển thị lại thành 0905123456.
function phoneView_(v) { const s = String(v == null ? '' : v).trim(); return /^[1-9]\d{8}$/.test(s) ? '0' + s : s; }
function genderOk_(v) { const g = String(v == null ? '' : v).trim(); return g ? oneOf_(g, LISTS.gender, 'Giới tính') : ''; }
// Chức vụ: chọn trong danh mục; giữ nguyên được giá trị cũ (nhập tay trong sheet) nếu không đổi.
function positionOk_(v, cur) { const p = str_(v, 60, 'Chức vụ', true); return p === cur ? p : oneOf_(p, LISTS.position, 'Chức vụ'); }

// Mọi người tự sửa được: họ tên, năm sinh, giới tính, số điện thoại, địa chỉ. Chức vụ, tổ, cơ sở: chỉ Hiệu trưởng.
function apiUpdateProfile_(u, r) {
  const patch = {};
  if (r.n !== undefined) patch.full_name = nameOk_(r.n, u.user_id);
  if (r.y !== undefined) patch.birth_year = yearOk_(r.y);
  if (r.g !== undefined) patch.gender = genderOk_(r.g);
  if (r.ph !== undefined) patch.phone = phoneOk_(r.ph);
  if (r.ad !== undefined) patch.address = str_(r.ad, 200, 'Địa chỉ');
  if (isAdmin_(u)) {
    if (r.r !== undefined) patch.position = positionOk_(r.r, u.position);
    if (r.t !== undefined) patch.department = oneOf_(r.t, LISTS.dept, 'Tổ chuyên môn');
    if (r.c !== undefined) patch.campus = oneOf_(r.c, LISTS.campus, 'Cơ sở');
  }
  Db.update('Users', u._row, patch);
  return true;
}

// ===== Mục "Nhân sự" (chỉ Hiệu trưởng) =====
function staffView_(u) {
  if (!isAdmin_(u)) return [];
  return Db.all('Users').filter(NOT_DELETED).map(function (x) {
    return { id: x.user_id, n: x.full_name, em: x.email, y: x.birth_year === '' ? '' : String(x.birth_year), g: x.gender || '', ph: phoneView_(x.phone), ad: x.address || '',
      r: x.position || '', t: x.department || '', c: x.campus || '', role: x.app_role, on: yes_(x.active) ? 1 : 0 };
  });
}
function staffUser_(id) {
  const x = Db.all('Users').find(function (y) { return y.user_id === String(id) && !yes_(y.is_deleted); });
  if (!x) throw new AppError('Không tìm thấy nhân sự', 'NOTFOUND');
  return x;
}
// Luôn phải còn ít nhất một tài khoản Hiệu trưởng (admin) đang hoạt động.
function keepAdmin_(x) {
  if (x.app_role !== 'admin') return;
  const others = Db.all('Users').filter(function (y) { return y.user_id !== x.user_id && y.app_role === 'admin' && yes_(y.active) && !yes_(y.is_deleted); });
  if (!others.length) throw new AppError('Phải còn ít nhất một tài khoản admin đang hoạt động', 'BAD');
}
function staffFields_(r, x) {
  return {
    full_name: nameOk_(r.n, x ? x.user_id : ''), birth_year: yearOk_(r.y), gender: genderOk_(r.g), phone: phoneOk_(r.ph), address: str_(r.ad, 200, 'Địa chỉ'),
    position: positionOk_(r.r, x ? x.position : null), department: oneOf_(r.t, LISTS.dept, 'Tổ chuyên môn'), campus: oneOf_(r.c, LISTS.campus, 'Cơ sở')
  };
}
function apiAddUser_(u, r) {
  admin_(u);
  const f = staffFields_(r, null);
  f.email = emailOk_(r.em, '');
  f.app_role = oneOf_(r.role || 'staff', LISTS.role, 'Phân quyền');
  f.active = r.on === undefined ? true : !!r.on;
  f.is_deleted = false;
  f.created_at = now_();
  f.user_id = Db.nextId('Users', 'user_id', 'U', 3);
  Db.append('Users', f);
  return { id: f.user_id };
}
function apiUpdateUser_(u, r) {
  admin_(u);
  const x = staffUser_(r.id), f = staffFields_(r, x);
  const em = emailOk_(r.em, x.user_id);
  if (x.user_id === u.user_id && em !== String(x.email).trim().toLowerCase()) throw new AppError('Không thể đổi email đăng nhập của chính bạn tại đây (tránh tự khóa tài khoản). Hãy sửa trong sheet Users nếu thật sự cần.', 'BAD');
  f.email = em;
  Db.update('Users', x._row, f);
  return true;
}
function apiSetUserActive_(u, r) {
  admin_(u);
  const x = staffUser_(r.id), on = !!r.on;
  if (x.user_id === u.user_id) throw new AppError('Bạn không thể tạm dừng tài khoản của chính mình', 'BAD');
  if (!on) keepAdmin_(x);
  Db.update('Users', x._row, { active: on });
  return true;
}
function apiSetUserRole_(u, r) {
  admin_(u);
  const x = staffUser_(r.id), role = oneOf_(r.role, LISTS.role, 'Phân quyền');
  if (x.user_id === u.user_id) throw new AppError('Bạn không thể đổi phân quyền của chính mình', 'BAD');
  if (role !== 'admin') keepAdmin_(x);
  Db.update('Users', x._row, { app_role: role });
  if (role !== 'leader') Db.removeWhere('HsReceivers', function (y) { return y.user_id === x.user_id; });   // chỉ leader được tiếp nhận hồ sơ
  return true;
}
// Xóa nhân sự đã nghỉ việc: tài khoản bị khóa vĩnh viễn và ẩn khỏi danh sách, nhưng dòng trong sheet Users được giữ lại
// (đánh dấu is_deleted) để lịch sử các nhiệm vụ cũ vẫn hiện đúng tên. Người này được bỏ khỏi các nhiệm vụ CHƯA hoàn thành.
function apiDeleteUser_(u, r) {
  admin_(u);
  const x = staffUser_(r.id);
  if (x.user_id === u.user_id) throw new AppError('Bạn không thể xóa tài khoản của chính mình', 'BAD');
  keepAdmin_(x);
  const open = Db.all('TaskAssignees').filter(function (a) { return a.user_id === x.user_id; }).map(function (a) {
    return Db.all('Tasks').find(function (t) { return t.task_id === a.task_id && !yes_(t.is_deleted) && t.status !== 'Đã hoàn thành'; });
  }).filter(Boolean);
  const solo = open.filter(function (t) { return assignees_(t.task_id).length <= 1; });
  if (solo.length) throw new AppError('Không xóa được: ' + x.full_name + ' là người thực hiện duy nhất của ' + solo.map(function (t) { return t.task_id; }).join(', ') + '. Hãy giao các nhiệm vụ này cho người khác trước.', 'BAD');
  open.forEach(function (t) {
    Db.removeWhere('TaskAssignees', function (a) { return a.task_id === t.task_id && a.user_id === x.user_id; });
    hist_(t.task_id, u.user_id, 'bot_nguoi', 'Hiệu trưởng đưa ' + x.full_name + ' ra khỏi nhiệm vụ (nhân sự đã nghỉ việc)');
  });
  Db.removeWhere('Notifications', function (n) { return n.to_user_id === x.user_id; });
  Db.removeWhere('HsReceivers', function (y) { return y.user_id === x.user_id; });
  Db.update('Users', x._row, { active: false, is_deleted: true });
  return { removedFrom: open.map(function (t) { return t.task_id; }) };
}
