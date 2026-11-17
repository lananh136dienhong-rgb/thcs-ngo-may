/**
 * HoSo.gs – SỔ CÔNG VĂN ĐẾN (hồ sơ công văn → tệp thành phần)
 *
 * Một lần văn thư nhận công văn trên Idest = MỘT hồ sơ (mã HS-năm-số, không bao giờ cấp lại).
 * Mỗi tệp đính kèm của công văn là MỘT văn bản trong sheet Documents (mã VB-..., nằm trong Kho văn bản),
 * có hs_id trỏ về hồ sơ và vai trò hs_role: 'main' (văn bản chính, đúng một tệp) hoặc 'att' (phụ lục).
 *
 * Luồng:
 *   hsUploadFile  → văn thư/Hiệu trưởng tải từng tệp; tệp ở thư mục tạm, hs_id = 'NHAP' (đang tiếp nhận); AI đọc từng tệp riêng (aiProcess)
 *   hsEditFile    → sửa tay kết quả AI (vai trò, số/ký hiệu, ngày, cơ quan, loại, tóm tắt)
 *   hsCreate      → "Xác nhận và tạo hồ sơ": kiểm tra số Idest không trùng, cấp mã hồ sơ, chuyển mọi tệp vào thư mục kho
 *   hsTake        → leader được tiếp nhận hồ sơ (danh sách trong mục Cài đặt) nhận phụ trách; mỗi hồ sơ chỉ một leader
 *   hsSetLeader   → Hiệu trưởng đổi người phụ trách (khi leader nhận nhầm)
 *   hsAssign      → leader phụ trách giao nhiệm vụ (dùng chung apiCreateTask_), tệp của hồ sơ được đính kèm từ kho
 *   hsDelete      → chỉ Hiệu trưởng: xóa hồ sơ và các tệp thành phần khỏi kho; nhiệm vụ đã giao được giữ nguyên
 * Trạng thái hồ sơ: Chờ xác nhận (chưa có leader) → Đang thực hiện (leader đã nhận) → Đã giao việc (đã có nhiệm vụ).
 */

const HS_DRAFT = 'NHAP';
const DEFAULT_LV = ['Tổ chức cán bộ', 'Chuyên môn', 'Học sinh – Y tế', 'Tài chính – CSVC', 'Hành chính – Pháp chế', 'Đảng – Đoàn thể'];
const HS_ROLES = ['main', 'att'];

// ---------- quyền ----------
function receivers_() { return Db.all('HsReceivers').map(function (r) { return r.user_id; }); }
function isRcv_(u) { return isLeader_(u) && receivers_().indexOf(u.user_id) >= 0; }   // leader được tiếp nhận hồ sơ
function hsSee_(u) { return isAdmin_(u) || isSec_(u) || isRcv_(u); }
function clerk_(u) {   // văn thư và Hiệu trưởng: tiếp nhận hồ sơ, thêm/sửa/xóa tệp thành phần
  if (!isAdmin_(u) && !isSec_(u)) throw new AppError('Chỉ văn thư và Hiệu trưởng được thao tác với tệp của hồ sơ', 'FORBIDDEN');
}

// ---------- danh mục lĩnh vực ----------
function seedLv_() {
  if (Db.all('LinhVuc').length) return;
  DEFAULT_LV.forEach(function (n, i) { Db.append('LinhVuc', { lv_id: 'LV' + String(i + 1).padStart(2, '0'), name: n, active: true }); });
}
function lvs_() { seedLv_(); return Db.all('LinhVuc').filter(function (x) { return yes_(x.active); }).map(function (x) { return x.name; }); }

// ---------- hỗ trợ ----------
function idestKey_(s) { return String(s || '').normalize('NFC').toUpperCase().replace(/\s+/g, ''); }
function hs_(id) {
  const h = Db.all('HoSo').find(function (x) { return x.hs_id === String(id) && !yes_(x.is_deleted); });
  if (!h) throw new AppError('Không tìm thấy hồ sơ', 'NOTFOUND');
  return h;
}
function hsDocs_(hsId) { return Db.all('Documents').filter(function (d) { return d.hs_id === hsId && !yes_(d.is_deleted); }); }
function draftDocs_(u) { return Db.all('Documents').filter(function (d) { return d.hs_id === HS_DRAFT && d.uploaded_by === u.user_id && !yes_(d.is_deleted); }); }
function hsDoc_(id) {
  const d = doc_(id);
  if (!d.hs_id) throw new AppError('Văn bản này không thuộc hồ sơ công văn nào', 'BAD');
  return d;
}
function setHs_(h, patch) { patch.updated_at = now_(); Db.update('HoSo', h._row, patch); }
function hsTasks_(hsId) { return Db.all('Tasks').filter(function (t) { return t.hs_id === hsId && !yes_(t.is_deleted); }); }
// Giá trị hiện tại của một tệp: đã sửa tay thì lấy giá trị đã sửa, chưa thì lấy kết quả AI.
function fileVals_(d) {
  const a = aiResult_(d) || {};
  return { k: d.tag || a.k || '', ag: code_(d.agency) || code_(a.ag) || '', num: String(d.doc_no || a.num || ''), date: d.doc_date || a.date || '', sum: String(d.summary || a.sum || '') };
}
function tagOk_(k) { return Db.all('DocTags').some(function (t) { return yes_(t.active) && t.tag_name === k; }); }
// Kết quả AI gọn (bỏ phần nhiệm vụ gợi ý) để còn hiện độ tin cậy và đánh dấu "sửa tay" sau khi tệp đã vào kho.
function compactAi_(d) {
  const a = aiResult_(d);
  return a ? JSON.stringify({ k: a.k, ag: a.ag, num: a.num, date: a.date, sum: a.sum, conf: a.conf }) : '';
}

// ===================== TẢI TỆP THÀNH PHẦN =====================
// Giống uploadDoc: ghi Drive ngoài khóa, khóa chỉ để cấp mã. r.hsId rỗng = tệp của hồ sơ đang tiếp nhận (nháp của người tải).
function apiHsUploadFile_(u, r) {
  clerk_(u);
  const hsId = r.hsId ? hs_(r.hsId).hs_id : '';
  const fl = files_([r])[0], size = fl.bytes.length;
  const sameIn = function () {
    const list = hsId ? hsDocs_(hsId) : draftDocs_(u);
    return list.some(function (d) { return d.name === fl.name && Number(d.size_bytes) === size; });
  };
  const dupMsg = 'Tệp ' + fl.name + ' đã có trong hồ sơ này.';
  if (sameIn()) throw new AppError(dupMsg, 'BAD');
  const file = share_(stagingDir_().createFile(Utilities.newBlob(fl.bytes, fl.mime, 'tmp_' + slug_(fl.name))));
  let id;
  try {
    withLock_(function () {
      Db.refresh('Documents');
      if (sameIn()) throw new AppError(dupMsg, 'BAD');
      if (hsId) hs_(hsId);
      const hasMain = (hsId ? hsDocs_(hsId) : draftDocs_(u)).some(function (d) { return d.hs_role === 'main'; });
      id = nextDocId_();
      Db.append('Documents', { doc_id: id, name: fl.name, drive_file_id: file.getId(), size_bytes: size, uploaded_by: u.user_id, uploaded_at: now_(), tag: '', reviewed: false, reviewed_at: '', is_deleted: false,
        agency: '', doc_no: '', summary: '', ai_status: aiEnabled_() ? 'queued' : 'off', ai_tries: 0, ai_at: '', ai_error: '', ai_result: '',
        hs_id: hsId || HS_DRAFT, hs_role: hasMain ? 'att' : 'main', doc_date: '' });
    });
  } catch (e) {
    try { file.setTrashed(true); } catch (x) { console.error(x); }
    throw e;
  }
  try { file.setName(id + '_' + slug_(fl.name)); } catch (e) { console.error(e); }
  const row = Db.all('Documents').find(function (d) { return d.doc_id === id; });
  return { id: id, ai: aiEnabled_(), doc: row ? docView_(row, isMgr_(u), userNames_(), u) : null };
}

// ===================== SỬA TAY THÔNG TIN TỆP =====================
// r: docId, role (main|att), num, date, ag, k, sum. r.confirm = true: tệp mới thêm vào hồ sơ đã tạo → đưa vào kho luôn.
function apiHsEditFile_(u, r) {
  clerk_(u);
  const d = hsDoc_(r.docId), draft = d.hs_id === HS_DRAFT;
  if (draft && d.uploaded_by !== u.user_id && !isAdmin_(u)) throw new AppError('Tệp này thuộc hồ sơ đang tiếp nhận của người khác', 'FORBIDDEN');
  const role = oneOf_(r.role || d.hs_role || 'att', HS_ROLES, 'Vai trò tệp');
  const num = str_(r.num, 80, 'Số/ký hiệu'), sum = str_(r.sum, 500, 'Tóm tắt'), date = r.date ? date_(r.date, 'Ngày văn bản') : '';
  const k = String(r.k || ''), ag = r.ag ? agency_(r.ag).code : '';
  if (k && !tagOk_(k)) throw new AppError('Loại văn bản không hợp lệ', 'BAD');
  const siblings = (draft ? draftDocs_(userById_(d.uploaded_by) || u) : hsDocs_(d.hs_id)).filter(function (x) { return x.doc_id !== d.doc_id; });
  if (role === 'att' && d.hs_role === 'main' && !draft) throw new AppError('Hồ sơ cần một văn bản chính. Hãy đặt tệp khác làm văn bản chính trước.', 'BAD');
  const reviewed = yes_(d.reviewed), confirm = !!r.confirm && !reviewed && !draft;
  if ((reviewed || confirm) && (!k || !ag)) throw new AppError('Tệp trong kho phải có loại văn bản và cơ quan ban hành', 'BAD');
  if (confirm && d.ai_status === 'reading' && minutesSince_(d.ai_at) <= AI.STALE_MIN) throw new AppError('AI đang đọc tệp này, vui lòng chờ vài giây rồi thử lại', 'BAD');
  // Đổi cơ quan/loại của tệp đã ở trong kho, hoặc đưa tệp mới vào kho: chuyển tệp sang đúng thư mục Drive.
  if ((reviewed && (k !== d.tag || ag !== code_(d.agency))) || confirm) {
    try { fileDoc_(d, agency_(ag), k); }
    catch (e) { console.error(e); throw new AppError('Không chuyển được tệp vào thư mục Drive. Hãy kiểm tra quyền của thư mục văn bản.', 'SERVER'); }
  }
  const patch = { hs_role: role, doc_no: num, doc_date: date, agency: ag, tag: k, summary: sum };
  if (confirm) { patch.reviewed = true; patch.reviewed_at = now_(); patch.ai_result = compactAi_(d); }
  Db.update('Documents', d._row, patch);
  if (role === 'main') siblings.filter(function (x) { return x.hs_role === 'main'; }).forEach(function (x) { Db.update('Documents', x._row, { hs_role: 'att' }); });
  return true;
}

// ===================== XÓA TỆP THÀNH PHẦN =====================
function hsRemoveDoc_(d) {
  const rest = hsDocs_(d.hs_id).filter(function (x) { return x.doc_id !== d.doc_id; });
  if (!rest.length) throw new AppError('Hồ sơ phải còn ít nhất một tệp. Muốn bỏ cả hồ sơ, Hiệu trưởng dùng “Xóa hồ sơ”.', 'BAD');
  const wasMain = d.hs_role === 'main';
  wipeDoc_(d);
  if (wasMain) {   // văn bản chính bị xóa: tệp đầu tiên còn lại (ưu tiên tệp đã vào kho) trở thành văn bản chính
    const nx = rest.filter(function (x) { return yes_(x.reviewed); })[0] || rest[0];
    Db.update('Documents', nx._row, { hs_role: 'main' });
  }
  return true;
}
function apiHsRemoveFile_(u, r) {
  clerk_(u);
  const d = hsDoc_(r.docId);
  if (d.hs_id === HS_DRAFT) {
    if (d.uploaded_by !== u.user_id && !isAdmin_(u)) throw new AppError('Tệp này thuộc hồ sơ đang tiếp nhận của người khác', 'FORBIDDEN');
    const wasMain = d.hs_role === 'main', owner = userById_(d.uploaded_by) || u;
    wipeDoc_(d);
    if (wasMain) { const nx = draftDocs_(owner)[0]; if (nx) Db.update('Documents', nx._row, { hs_role: 'main' }); }
    return true;
  }
  return hsRemoveDoc_(d);
}

// ===================== TẠO HỒ SƠ =====================
// r: idest, so (số đến), ty (trích yếu), lv (lĩnh vực), docIds (các tệp đang tiếp nhận của người tạo)
function apiHsCreate_(u, r) {
  clerk_(u);
  Db.refresh('HoSo'); Db.refresh('Documents');
  const idest = str_(r.idest, 80, 'Số/ký hiệu Idest', true), key = idestKey_(idest);
  const dup = Db.all('HoSo').find(function (h) { return !yes_(h.is_deleted) && idestKey_(h.idest) === key; });
  if (dup) throw new AppError('Số Idest ' + idest + ' đã có trong hồ sơ ' + dup.hs_id + '. Không được tạo hồ sơ trùng số Idest; nếu cấp trên gửi thêm tệp, hãy thêm tệp vào hồ sơ đó.', 'BAD');
  const soTxt = String(r.so == null ? '' : r.so).trim();
  if (!/^\d{1,7}$/.test(soTxt) || !(parseInt(soTxt, 10) > 0)) throw new AppError('Số đến không hợp lệ (chỉ gồm chữ số)', 'BAD');
  const so = parseInt(soTxt, 10);
  const lv = oneOf_(String(r.lv || ''), lvs_(), 'Lĩnh vực');
  const ty = str_(r.ty, 500, 'Trích yếu');
  const mine = draftDocs_(u), want = Array.isArray(r.docIds) ? r.docIds.map(String) : mine.map(function (d) { return d.doc_id; });
  const docs = want.map(function (id) {
    const d = mine.find(function (x) { return x.doc_id === id; });
    if (!d) throw new AppError('Tệp ' + id + ' không thuộc hồ sơ bạn đang tiếp nhận', 'BAD');
    return d;
  });
  if (!docs.length) throw new AppError('Hãy tải lên ít nhất một tệp', 'BAD');
  if (docs.filter(function (d) { return d.hs_role === 'main'; }).length !== 1) throw new AppError('Hồ sơ cần đúng một văn bản chính', 'BAD');
  const vals = {};
  docs.forEach(function (d) {
    if (d.ai_status === 'reading' && minutesSince_(d.ai_at) <= AI.STALE_MIN) throw new AppError('AI đang đọc tệp ' + d.name + ', vui lòng chờ vài giây rồi thử lại', 'BAD');
    const v = fileVals_(d);
    if (!v.k || !tagOk_(v.k)) throw new AppError('Tệp ' + d.name + ' chưa có loại văn bản. Hãy bấm “Sửa” để chọn.', 'BAD');
    if (!v.ag || !agencies_().some(function (a) { return a.code === v.ag; })) throw new AppError('Tệp ' + d.name + ' chưa có cơ quan ban hành. Hãy bấm “Sửa” để chọn.', 'BAD');
    vals[d.doc_id] = v;
  });
  const id = Db.nextId('HoSo', 'hs_id', 'HS-' + today_().slice(0, 4) + '-', 4), at = now_();
  docs.forEach(function (d) {
    const v = vals[d.doc_id];
    try { fileDoc_(d, agency_(v.ag), v.k); }
    catch (e) { console.error(e); throw new AppError('Không chuyển được tệp vào thư mục Drive. Hãy kiểm tra quyền của thư mục văn bản.', 'SERVER'); }
    Db.update('Documents', d._row, { hs_id: id, tag: v.k, agency: v.ag, doc_no: v.num, summary: v.sum, doc_date: v.date, reviewed: true, reviewed_at: at, ai_result: compactAi_(d) });
  });
  const main = docs.find(function (d) { return d.hs_role === 'main'; });
  Db.append('HoSo', { hs_id: id, so_den: so, idest: idest, trich_yeu: ty || vals[main.doc_id].sum || '(chưa có trích yếu)', linh_vuc: lv, status: 'Chờ xác nhận', leader_id: '', created_by: u.user_id, created_at: at, updated_at: at, is_deleted: false });
  receivers_().forEach(function (uid) { if (uid !== u.user_id) notify_(uid, 'Hồ sơ công văn mới ' + id + ' (' + lv + '): ' + (ty || idest), ''); });
  return { id: id, docs: docs.map(function (d) { return d.doc_id; }) };
}

// ===================== SỬA THÔNG TIN HỒ SƠ =====================
// Văn thư đổi lĩnh vực khi hồ sơ chưa có người nhận; Hiệu trưởng đổi được bất cứ lúc nào. Trích yếu: văn thư và Hiệu trưởng.
function apiHsUpdate_(u, r) {
  clerk_(u);
  const h = hs_(r.hsId), patch = {};
  if (r.lv !== undefined) {
    if (!isAdmin_(u) && h.status !== 'Chờ xác nhận') throw new AppError('Hồ sơ đã có người phụ trách, chỉ Hiệu trưởng được đổi lĩnh vực', 'FORBIDDEN');
    patch.linh_vuc = oneOf_(String(r.lv), lvs_(), 'Lĩnh vực');
  }
  if (r.ty !== undefined) patch.trich_yeu = str_(r.ty, 500, 'Trích yếu', true);
  if (!Object.keys(patch).length) return true;
  setHs_(h, patch);
  return true;
}

// ===================== NGƯỜI PHỤ TRÁCH =====================
function apiHsTake_(u, r) {
  if (!isRcv_(u)) throw new AppError('Bạn chưa được Hiệu trưởng cấp quyền tiếp nhận hồ sơ công văn', 'FORBIDDEN');
  Db.refresh('HoSo');
  const h = hs_(r.hsId);
  if (h.leader_id) {
    const x = userById_(h.leader_id);
    throw new AppError('Hồ sơ đã do ' + (x ? x.full_name : h.leader_id) + ' phụ trách. Mỗi hồ sơ chỉ một người phụ trách.', 'BAD');
  }
  setHs_(h, { leader_id: u.user_id, status: h.status === 'Chờ xác nhận' ? 'Đang thực hiện' : h.status });
  notify_('ADMIN', u.full_name + ' nhận phụ trách hồ sơ ' + h.hs_id, '');
  return true;
}
// Hiệu trưởng đổi người phụ trách (userId rỗng = bỏ người phụ trách). Nhiệm vụ đã giao giữ nguyên.
function apiHsSetLeader_(u, r) {
  admin_(u);
  const h = hs_(r.hsId), uid = String(r.userId || '');
  if (uid === (h.leader_id || '')) return true;
  if (uid) {
    const x = userById_(uid);
    if (!x || !yes_(x.active) || yes_(x.is_deleted) || !isRcv_(x)) throw new AppError('Người này chưa được cấp quyền tiếp nhận hồ sơ (mục Cài đặt)', 'BAD');
  }
  const st = uid ? (h.status === 'Chờ xác nhận' ? 'Đang thực hiện' : h.status) : (hsTasks_(h.hs_id).length ? 'Đã giao việc' : 'Chờ xác nhận');
  setHs_(h, { leader_id: uid, status: st });
  if (uid) notify_(uid, 'Hiệu trưởng giao bạn phụ trách hồ sơ ' + h.hs_id + ': ' + h.trich_yeu, '');
  if (h.leader_id && h.leader_id !== uid) notify_(h.leader_id, 'Bạn không còn phụ trách hồ sơ ' + h.hs_id + ' (Hiệu trưởng đã đổi người phụ trách)', '');
  return true;
}

// ===================== GIAO VIỆC TỪ HỒ SƠ =====================
// Dùng chung apiCreateTask_ (nhiều người thực hiện, nội dung chi tiết, tệp, văn bản từ kho). Văn bản đính kèm chỉ lấy từ tệp của hồ sơ đã vào kho.
function apiHsAssign_(u, r) {
  const h = hs_(r.hsId);
  if (h.leader_id !== u.user_id) throw new AppError('Chỉ người phụ trách hồ sơ được giao việc từ hồ sơ này', 'FORBIDDEN');
  // Mặc định đính kèm các tệp của hồ sơ đã vào kho; người phụ trách được thêm văn bản khác trong Kho văn bản (refDocs_ kiểm tra đã phân loại).
  const own = hsDocs_(h.hs_id).filter(function (d) { return yes_(d.reviewed); }).map(function (d) { return d.doc_id; });
  const docs = (Array.isArray(r.docs) ? r.docs : own).map(String);
  const made = apiCreateTask_(u, Object.assign({}, r, { docs: docs, srcDoc: '' }));
  const t = Db.all('Tasks').find(function (x) { return x.task_id === made.id; });
  Db.update('Tasks', t._row, { hs_id: h.hs_id });
  hist_(made.id, u.user_id, 'tu_ho_so', 'Giao từ hồ sơ công văn ' + h.hs_id + ' (' + h.idest + ')');
  setHs_(h, { status: 'Đã giao việc' });
  return made;
}

// ===================== XÓA HỒ SƠ (chỉ Hiệu trưởng) =====================
function apiHsDelete_(u, r) {
  admin_(u);
  const h = hs_(r.hsId), docs = hsDocs_(h.hs_id);
  docs.forEach(wipeDoc_);   // gỡ khỏi kho, tệp Drive vào thùng rác (khôi phục được trong 30 ngày)
  // Dòng hồ sơ chỉ đánh dấu đã xóa để mã hồ sơ không bị cấp lại; số Idest được giải phóng để có thể tiếp nhận lại.
  setHs_(h, { is_deleted: true });
  return { files: docs.length, tasks: hsTasks_(h.hs_id).map(function (t) { return t.task_id; }) };
}

// ===================== CÀI ĐẶT (chỉ Hiệu trưởng) =====================
function apiLvAdd_(u, r) {
  admin_(u);
  const n = str_(r.name, 60, 'Tên lĩnh vực', true);
  if (lvs_().some(function (x) { return plain_(x) === plain_(n); })) throw new AppError('Lĩnh vực này đã có', 'BAD');
  const old = Db.all('LinhVuc').find(function (x) { return x.name === n; });
  if (old) Db.update('LinhVuc', old._row, { active: true });
  else Db.append('LinhVuc', { lv_id: Db.nextId('LinhVuc', 'lv_id', 'LV', 2), name: n, active: true });
  return true;
}
function apiLvDelete_(u, r) {
  admin_(u);
  const x = Db.all('LinhVuc').find(function (y) { return yes_(y.active) && y.name === String(r.name); });
  if (!x) throw new AppError('Lĩnh vực không tồn tại', 'NOTFOUND');
  Db.update('LinhVuc', x._row, { active: false });
  // hồ sơ đang thuộc lĩnh vực này chuyển về "Chưa phân loại" (để trống)
  Db.all('HoSo').filter(function (h) { return h.linh_vuc === x.name; }).forEach(function (h) { Db.update('HoSo', h._row, { linh_vuc: '' }); });
  return true;
}
function apiRcvAdd_(u, r) {
  admin_(u);
  const x = userById_(String(r.userId));
  if (!x || !yes_(x.active) || yes_(x.is_deleted) || !isLeader_(x)) throw new AppError('Chỉ chọn được nhân sự có phân quyền Quản lý (leader) đang hoạt động', 'BAD');
  if (receivers_().indexOf(x.user_id) >= 0) throw new AppError(x.full_name + ' đã có trong danh sách', 'BAD');
  Db.append('HsReceivers', { user_id: x.user_id, added_by: u.user_id, added_at: now_() });
  notify_(x.user_id, 'Bạn được Hiệu trưởng cấp quyền tiếp nhận hồ sơ công văn (mục Danh sách công văn)', '');
  return true;
}
// Bỏ quyền: các hồ sơ người này đang phụ trách vẫn giữ nguyên; Hiệu trưởng tự đổi người phụ trách trong từng hồ sơ nếu cần.
function apiRcvRemove_(u, r) {
  admin_(u);
  const n = Db.removeWhere('HsReceivers', function (y) { return y.user_id === String(r.userId); });
  if (!n) throw new AppError('Người này không có trong danh sách', 'NOTFOUND');
  return { keep: Db.all('HoSo').filter(function (h) { return !yes_(h.is_deleted) && h.leader_id === String(r.userId); }).map(function (h) { return h.hs_id; }) };
}

// ===================== DỮ LIỆU GỬI CHO WEBSITE =====================
function hsView_(u) {
  if (!hsSee_(u)) return [];
  const name = userNames_(), T = group_(Db.all('Tasks').filter(function (t) { return t.hs_id && !yes_(t.is_deleted); }), 'hs_id');
  return Db.all('HoSo').filter(function (h) { return !yes_(h.is_deleted); }).map(function (h) {
    return { id: h.hs_id, so: Number(h.so_den) || h.so_den, up: String(h.created_at).slice(0, 10), idest: String(h.idest), ty: h.trich_yeu, lv: h.linh_vuc || '', st: h.status,
      ld: h.leader_id || '', ldn: h.leader_id ? (name[h.leader_id] || h.leader_id) : '', by: name[h.created_by] || '', nv: (T[h.hs_id] || []).map(function (t) { return t.task_id; }) };
  }).sort(function (a, b) { return (b.so - a.so) || (a.id < b.id ? 1 : -1); });
}
// Danh sách người được tiếp nhận hồ sơ: để lọc "Người phụ trách" và để Hiệu trưởng quản lý trong Cài đặt.
function rcvView_(u) {
  if (!hsSee_(u)) return [];
  const ids = receivers_();
  return Db.all('Users').filter(function (x) { return ids.indexOf(x.user_id) >= 0 && !yes_(x.is_deleted); })
    .map(function (x) { return { id: x.user_id, n: x.full_name, r: x.position || '', on: yes_(x.active) && isLeader_(x) ? 1 : 0 }; });
}
