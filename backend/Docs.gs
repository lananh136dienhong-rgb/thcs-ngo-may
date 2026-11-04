/**
 * Docs.gs – VĂN BẢN, THẺ PHÂN LOẠI, HỒ SƠ CÁ NHÂN
 */

function apiUploadDoc_(u, r) {
  const fl = files_([r])[0], size = fl.bytes.length;
  if (Db.all('Documents').some(function (d) { return !yes_(d.is_deleted) && d.name === fl.name && Number(d.size_bytes) === size; })) {
    throw new AppError('Văn bản này đã tồn tại (trùng tên và dung lượng). Hãy chọn tệp khác.', 'BAD');
  }
  const year = today_().slice(0, 4), id = Db.nextId('Documents', 'doc_id', 'VB-' + year + '-', 3), at = now_(), admin = isAdmin_(u);
  const driveId = saveDrive_('FOLDER_VANBAN', '', fl, id + '_');
  Db.append('Documents', { doc_id: id, name: fl.name, drive_file_id: driveId, size_bytes: size, uploaded_by: u.user_id, uploaded_at: at, tag: '', reviewed: admin, reviewed_at: admin ? at : '', is_deleted: false });
  if (!admin) notify_('ADMIN', u.full_name + ' đã tải lên văn bản ' + id, '');
  return { id: id };
}
function doc_(id) {
  const d = Db.all('Documents').find(function (x) { return x.doc_id === String(id) && !yes_(x.is_deleted); });
  if (!d) throw new AppError('Không tìm thấy văn bản', 'NOTFOUND');
  return d;
}
function apiSetDocTag_(u, r) {
  admin_(u);
  const d = doc_(r.docId), tag = String(r.tag || '');
  if (tag && !Db.all('DocTags').some(function (t) { return yes_(t.active) && t.tag_name === tag; })) throw new AppError('Thẻ phân loại không tồn tại', 'BAD');
  Db.update('Documents', d._row, { tag: tag, reviewed: true, reviewed_at: d.reviewed_at || now_() });
  return true;
}
function apiDeleteDoc_(u, r) {
  admin_(u);
  const d = doc_(r.docId);
  Db.update('Documents', d._row, { is_deleted: true });
  try { DriveApp.getFileById(d.drive_file_id).setTrashed(true); } catch (e) { console.error(e); }
  return true;
}
// Staff và leader chỉ tải được văn bản đã được Hiệu trưởng xem xét.
function apiDownloadDoc_(u, r) {
  const d = doc_(r.docId);
  if (!isAdmin_(u) && !yes_(d.reviewed)) throw new AppError('Văn bản này chưa được Hiệu trưởng xem xét', 'FORBIDDEN');
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

// ---- hồ sơ cá nhân ----
// Mọi người tự sửa được: họ tên, năm sinh, địa chỉ. Chức vụ, tổ, cơ sở chỉ Hiệu trưởng được sửa
// (nếu không, nhân viên có thể tự nâng quyền thành Phó hiệu trưởng hoặc Tổ trưởng).
function apiUpdateProfile_(u, r) {
  const patch = {};
  if (r.n !== undefined) {
    const n = str_(r.n, 60, 'Họ và tên', true);
    if (n.length < 2) throw new AppError('Họ và tên quá ngắn', 'BAD');
    if (Db.all('Users').some(function (x) { return x.user_id !== u.user_id && String(x.full_name).trim().toLowerCase() === n.toLowerCase(); })) {
      throw new AppError('Đã có người dùng khác trùng họ tên này. Hãy thêm ký hiệu phân biệt (ví dụ: tên tổ).', 'BAD');
    }
    patch.full_name = n;
  }
  if (r.y !== undefined) {
    const y = String(r.y).trim();
    if (y && !(/^\d{4}$/.test(y) && +y >= 1940 && +y <= 2012)) throw new AppError('Năm sinh không hợp lệ', 'BAD');
    patch.birth_year = y ? Number(y) : '';
  }
  if (r.ad !== undefined) patch.address = str_(r.ad, 200, 'Địa chỉ');
  if (isAdmin_(u)) {
    if (r.r !== undefined) patch.position = str_(r.r, 60, 'Chức vụ', true);
    if (r.t !== undefined) patch.department = oneOf_(r.t, LISTS.dept, 'Tổ chuyên môn');
    if (r.c !== undefined) patch.campus = oneOf_(r.c, LISTS.campus, 'Cơ sở');
  }
  Db.update('Users', u._row, patch);
  return true;
}
