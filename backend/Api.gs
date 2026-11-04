/**
 * Api.gs – CÁC HÀNH ĐỘNG VỀ NHIỆM VỤ
 * Mỗi hàm nhận (user, req): user là tài khoản đã đăng nhập, req là dữ liệu website gửi lên.
 * QUY TẮC: backend tự kiểm tra quyền ở từng hàm, không tin vào việc giao diện đã ẩn nút.
 */

function routes_() {
  return {
    login: apiLogin_, bootstrap: apiBootstrap_, getTask: apiGetTask_, readNotifs: apiReadNotifs_,
    createTask: apiCreateTask_, editTask: apiEditTask_, deleteTask: apiDeleteTask_,
    acceptTask: apiAccept_, progress: apiProgress_, submitTask: apiSubmit_,
    requestExt: apiRequestExt_, decideExt: apiDecideExt_, extendTask: apiExtend_,
    approveTask: apiApprove_, requestMore: apiRequestMore_, addAssignee: apiAddAssignee_, sendMsg: apiSendMsg_,
    downloadTaskFile: apiDownloadTaskFile_,
    uploadDoc: apiUploadDoc_, setDocTag: apiSetDocTag_, deleteDoc: apiDeleteDoc_, downloadDoc: apiDownloadDoc_,
    addTag: apiAddTag_, renameTag: apiRenameTag_, deleteTag: apiDeleteTag_, updateProfile: apiUpdateProfile_
  };
}

// ===================== ĐỌC DỮ LIỆU =====================
function apiBootstrap_(u) {
  return {
    today: today_(), me: me_(u), tasks: tasksView_(u), docs: docsView_(u), notifs: notifsView_(u),
    people: peopleView_(u),
    tags: Db.all('DocTags').filter(function (t) { return yes_(t.active); }).map(function (t) { return t.tag_name; }),
    maxFileMB: CFG.MAX_FILE_MB
  };
}
function apiGetTask_(u, r) { return tasksView_(u, String(r.id))[0] || null; }
function apiReadNotifs_(u) {
  const admin = isAdmin_(u);
  Db.all('Notifications').filter(function (n) {
    return !yes_(n.is_read) && (n.to_user_id === u.user_id || (admin && n.to_user_id === 'ADMIN'));
  }).forEach(function (n) { Db.update('Notifications', n._row, { is_read: true }); });
  return true;
}
function me_(u) {
  return { id: u.user_id, n: u.full_name, y: u.birth_year === '' ? '' : String(u.birth_year), ad: u.address || '', r: u.position, t: u.department, c: u.campus, role: u.app_role };
}
function peopleView_(u) {   // danh sách nhân sự chỉ gửi cho admin và leader
  if (u.app_role === 'staff') return [];
  return Db.all('Users').filter(function (x) { return yes_(x.active) && x.app_role !== 'admin'; })
    .map(function (x) { return { id: x.user_id, n: x.full_name, t: x.department, c: x.campus, r: x.position }; });
}
function notifsView_(u) {
  const admin = isAdmin_(u);
  return Db.all('Notifications').filter(function (n) { return n.to_user_id === u.user_id || (admin && n.to_user_id === 'ADMIN'); })
    .sort(function (a, b) { return String(a.created_at) < String(b.created_at) ? 1 : -1; }).slice(0, 60)
    .map(function (n) { return { r: admin ? 'a' : 's', t: n.text, id: n.task_id || '', at: fmtTime_(n.created_at), n: yes_(n.is_read) ? 0 : 1 }; });
}
function docsView_(u) {
  const admin = isAdmin_(u), name = {};
  Db.all('Users').forEach(function (x) { name[x.user_id] = x.full_name; });
  return Db.all('Documents').filter(function (d) { return !yes_(d.is_deleted) && (admin || yes_(d.reviewed) || d.uploaded_by === u.user_id); })
    .map(function (d) {
      return { id: d.doc_id, n: d.name, sz: d.size_bytes, d: String(d.uploaded_at).slice(0, 10), by: name[d.uploaded_by] || '', k: d.tag || '', ok: yes_(d.reviewed) ? 1 : 0 };
    });
}
function tasksView_(u, onlyId) {
  const admin = isAdmin_(u), name = {}, role = {};
  Db.all('Users').forEach(function (x) { name[x.user_id] = x.full_name; role[x.user_id] = x.app_role; });
  const nm = function (id) { return name[id] || id; };
  const A = group_(Db.all('TaskAssignees'), 'task_id'), F = group_(Db.all('TaskFiles'), 'task_id'), S = group_(Db.all('Submissions'), 'task_id'),
    P = group_(Db.all('ProgressReports'), 'task_id'), X = group_(Db.all('Extensions'), 'task_id'), M = group_(Db.all('Messages'), 'task_id'), H = group_(Db.all('History'), 'task_id');
  const asc = function (k) { return function (a, b) { return String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0; }; };
  return Db.all('Tasks').filter(function (t) {
    return !yes_(t.is_deleted) && (!onlyId || t.task_id === onlyId) && (admin || (A[t.task_id] || []).some(function (a) { return a.user_id === u.user_id; }));
  }).map(function (t) {
    const id = t.task_id, as = A[id] || [], fmap = {}, files = (F[id] || []).slice();
    files.forEach(function (f) {   // tên hiển thị duy nhất trong một nhiệm vụ
      let n = f.name, i = 2;
      while (fmap[n] && fmap[n] !== f.file_id) n = f.name + ' (' + (i++) + ')';
      fmap[n] = f.file_id; f._n = n;
    });
    const px = (X[id] || []).filter(function (x) { return x.status === 'Chờ xử lý'; }).pop();
    return {
      id: id, title: t.title, desc: t.description, pri: t.priority, cs: t.campus, to: t.department, kind: t.target_type,
      due: t.due_date, st: t.status, made: String(t.created_at).slice(0, 10), review: t.review_comment || '',
      as: as.map(function (a) { return nm(a.user_id); }),
      acc: as.filter(function (a) { return a.accepted_at; }).map(function (a) { return nm(a.user_id); }),
      files: files.filter(function (f) { return f.kind === 'giao'; }).map(function (f) { return f._n; }), fmap: fmap,
      ext: px ? { to: px.new_due, reason: px.reason, by: nm(px.requested_by) } : null,
      extH: (X[id] || []).filter(function (x) { return x.status === 'Đồng ý' || x.status === 'Gia hạn trực tiếp'; })
        .map(function (x) { return { old: x.old_due, nw: x.new_due, why: x.reason, by: nm(x.decided_by || x.requested_by), at: String(x.decided_at || x.requested_at).slice(0, 10) }; }),
      subs: (S[id] || []).slice().sort(asc('submitted_at')).map(function (s) {
        return {
          by: nm(s.submitted_by), text: s.content + (s.note ? ' (Ghi chú: ' + s.note + ')' : ''), at: String(s.submitted_at).slice(0, 10),
          files: files.filter(function (f) { return f.kind === 'nop' && f.uploaded_by === s.submitted_by && f.uploaded_at === s.submitted_at; }).map(function (f) { return f._n; })
        };
      }),
      prog: (P[id] || []).slice().sort(asc('reported_at')).map(function (p) { return { by: nm(p.user_id), done: p.done, res: p.result, left: p.remaining, at: String(p.reported_at).slice(0, 10) }; }),
      chat: (M[id] || []).slice().sort(asc('sent_at')).map(function (m) { return { f: role[m.sender_id] === 'admin' ? 'Hiệu trưởng' : nm(m.sender_id), t: m.text, at: fmtTime_(m.sent_at) }; }),
      hist: (H[id] || []).slice().sort(asc('at')).map(function (h) { return [String(h.at).slice(0, 10), h.detail]; })
    };
  }).sort(function (a, b) { return a.id < b.id ? 1 : -1; });
}

// ===================== HÀM HỖ TRỢ =====================
function task_(id) {
  const t = Db.all('Tasks').find(function (x) { return x.task_id === id && !yes_(x.is_deleted); });
  if (!t) throw new AppError('Không tìm thấy nhiệm vụ', 'NOTFOUND');
  return t;
}
function assignees_(id) { return Db.all('TaskAssignees').filter(function (a) { return a.task_id === id; }); }
function member_(u, id) {
  const a = assignees_(id).find(function (x) { return x.user_id === u.user_id; });
  if (!a) throw new AppError('Bạn không được giao nhiệm vụ này', 'FORBIDDEN');
  return a;
}
function access_(u, id) { const t = task_(id); if (!isAdmin_(u)) member_(u, id); return t; }
function setTask_(t, patch) { patch.updated_at = now_(); Db.update('Tasks', t._row, patch); }
function hist_(id, actor, action, detail) {
  Db.append('History', { hist_id: Db.nextId('History', 'hist_id', 'H', 4), task_id: id, actor_id: actor, action: action, detail: detail, at: now_() });
}
function notify_(to, text, taskId) {
  Db.append('Notifications', { notif_id: Db.nextId('Notifications', 'notif_id', 'N', 4), to_user_id: to, text: text, task_id: taskId || '', created_at: now_(), is_read: false });
}
function notifyMembers_(id, text, exceptUid) {
  assignees_(id).forEach(function (a) { if (a.user_id !== exceptUid) notify_(a.user_id, text, id); });
}
function userById_(id) { return Db.all('Users').find(function (x) { return x.user_id === id; }); }

// --- tệp ---
function files_(arr) {
  arr = arr || [];
  if (arr.length > 5) throw new AppError('Mỗi lần chỉ được đính tối đa 5 tệp', 'BAD');
  return arr.map(function (f) {
    const name = str_(f.name, 120, 'Tên tệp', true);
    if (!CFG.EXT_OK.test(name)) throw new AppError('Định dạng tệp chưa được hỗ trợ: ' + name, 'BAD');
    const bytes = Utilities.base64Decode(String(f.data || ''));
    if (!bytes.length) throw new AppError('Tệp ' + name + ' bị rỗng', 'BAD');
    if (bytes.length > CFG.MAX_FILE_MB * 1048576) throw new AppError('Tệp ' + name + ' vượt quá ' + CFG.MAX_FILE_MB + ' MB', 'BAD');
    return { name: name, bytes: bytes, mime: String(f.mime || 'application/octet-stream').slice(0, 100) };
  });
}
function slug_(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
}
function child_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function saveDrive_(folderProp, sub, fl, prefix) {
  const root = DriveApp.getFolderById(prop_(folderProp));
  const dir = sub ? child_(root, sub) : root;
  return dir.createFile(Utilities.newBlob(fl.bytes, fl.mime, prefix + slug_(fl.name))).getId();
}
function stamp_(at) { return at.replace(/[-:]/g, '').replace('T', '-').slice(0, 13); }
function saveTaskFiles_(taskId, kind, fls, userId, at) {
  const folder = kind === 'giao' ? 'FOLDER_GIAO' : 'FOLDER_NOPBAI', who = userById_(userId);
  fls.forEach(function (fl) {
    const prefix = kind === 'giao' ? taskId + '_' : taskId + '_' + slug_(who.full_name) + '_' + stamp_(at) + '_';
    const driveId = saveDrive_(folder, taskId, fl, prefix);
    Db.append('TaskFiles', { file_id: Db.nextId('TaskFiles', 'file_id', 'F', 3), task_id: taskId, kind: kind, name: fl.name, drive_file_id: driveId, uploaded_by: userId, uploaded_at: at });
  });
}
function b64_(fileId) {
  const blob = DriveApp.getFileById(fileId).getBlob();
  return { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

// ===================== NHIỆM VỤ: ADMIN =====================
function apiCreateTask_(u, r) {
  admin_(u);
  const title = str_(r.title, 200, 'Tên nhiệm vụ', true), desc = str_(r.desc, 3000, 'Nội dung chi tiết'),
    pri = oneOf_(r.pri || 'Trung bình', LISTS.pri, 'Mức ưu tiên'), due = date_(r.due, 'Thời hạn');
  if (due < today_()) throw new AppError('Thời hạn phải từ hôm nay trở đi', 'BAD');
  const ids = r.assignees || [];
  if (!ids.length) throw new AppError('Hãy chọn ít nhất một người được giao', 'BAD');
  const users = Db.all('Users'), seen = {};
  const picked = ids.map(function (id) {
    const x = users.find(function (y) { return y.user_id === id && yes_(y.active) && y.app_role !== 'admin'; });
    if (!x || seen[id]) throw new AppError('Người được giao không hợp lệ', 'BAD');
    seen[id] = 1; return x;
  });
  const cs = r.cs ? oneOf_(r.cs, LISTS.campus, 'Cơ sở') : picked[0].campus,
    to = r.to ? oneOf_(r.to, LISTS.dept, 'Tổ chuyên môn') : picked[0].department,
    kind = r.kind ? oneOf_(r.kind, LISTS.kind, 'Loại đối tượng') : (LISTS.kind.indexOf(picked[0].position) >= 0 ? picked[0].position : '');
  const fls = files_(r.files), id = Db.nextId('Tasks', 'task_id', 'NV-', 4), at = now_();
  Db.append('Tasks', { task_id: id, title: title, description: desc || 'Chưa có nội dung chi tiết.', priority: pri, campus: cs, department: to, target_type: kind, due_date: due, status: 'Chưa tiếp nhận', created_by: u.user_id, created_at: at, updated_at: at, review_comment: '', ext_pending: false, is_deleted: false });
  picked.forEach(function (p) {
    Db.append('TaskAssignees', { row_id: Db.nextId('TaskAssignees', 'row_id', 'A', 3), task_id: id, user_id: p.user_id, accepted_at: '', added_by: u.user_id, added_at: at });
    notify_(p.user_id, 'Có nhiệm vụ mới ' + id + ': ' + title, id);
  });
  saveTaskFiles_(id, 'giao', fls, u.user_id, at);
  hist_(id, u.user_id, 'giao', 'Hiệu trưởng giao nhiệm vụ');
  return { id: id };
}
function apiEditTask_(u, r) {
  admin_(u);
  const t = task_(r.id), keep = r.keep || [];
  const title = str_(r.title, 200, 'Tên nhiệm vụ', true), desc = str_(r.desc, 3000, 'Nội dung chi tiết'), pri = oneOf_(r.pri, LISTS.pri, 'Mức ưu tiên');
  const fls = files_(r.files), at = now_();
  // tên hiển thị -> file_id, phải tính giống tasksView_ để khớp với danh sách giao diện đang giữ
  const given = Db.all('TaskFiles').filter(function (f) { return f.task_id === t.task_id; }), fmap = {};
  given.forEach(function (f) { let n = f.name, i = 2; while (fmap[n] && fmap[n] !== f.file_id) n = f.name + ' (' + (i++) + ')'; fmap[n] = f.file_id; f._n = n; });
  given.filter(function (f) { return f.kind === 'giao' && keep.indexOf(f._n) < 0; }).forEach(function (f) {
    try { DriveApp.getFileById(f.drive_file_id).setTrashed(true); } catch (e) { console.error(e); }
    Db.removeWhere('TaskFiles', function (x) { return x.file_id === f.file_id; });
  });
  saveTaskFiles_(t.task_id, 'giao', fls, u.user_id, at);
  setTask_(t, { title: title, description: desc, priority: pri });
  hist_(t.task_id, u.user_id, 'sua', 'Hiệu trưởng chỉnh sửa nội dung và tài liệu nhiệm vụ');
  notifyMembers_(t.task_id, 'Nhiệm vụ ' + t.task_id + ' đã được cập nhật', '');
  return true;
}
function apiDeleteTask_(u, r) {
  admin_(u);
  const t = task_(r.id);
  setTask_(t, { is_deleted: true });
  hist_(t.task_id, u.user_id, 'xoa', 'Hiệu trưởng xóa nhiệm vụ');
  return true;
}
function apiApprove_(u, r) {
  admin_(u);
  const t = task_(r.id);
  if (t.status !== 'Chờ duyệt') throw new AppError('Nhiệm vụ này chưa có kết quả chờ duyệt', 'BAD');
  const last = Db.all('Submissions').filter(function (s) { return s.task_id === t.task_id; }).pop();
  if (last) Db.update('Submissions', last._row, { result: 'Đã duyệt' });
  setTask_(t, { status: 'Đã hoàn thành', review_comment: '' });
  hist_(t.task_id, u.user_id, 'duyet', 'Hiệu trưởng xác nhận hoàn thành');
  notifyMembers_(t.task_id, 'Kết quả ' + t.task_id + ' đã được xác nhận hoàn thành', '');
  return true;
}
function apiRequestMore_(u, r) {
  admin_(u);
  const t = task_(r.id), c = str_(r.comment, 1000, 'Nhận xét', true);
  if (t.status !== 'Chờ duyệt') throw new AppError('Nhiệm vụ này chưa có kết quả chờ duyệt', 'BAD');
  const last = Db.all('Submissions').filter(function (s) { return s.task_id === t.task_id; }).pop();
  if (last) Db.update('Submissions', last._row, { result: 'Yêu cầu bổ sung', reviewer_comment: c });
  setTask_(t, { status: 'Yêu cầu bổ sung', review_comment: c });
  hist_(t.task_id, u.user_id, 'yeu_cau_bo_sung', 'Hiệu trưởng yêu cầu bổ sung: ' + c);
  notifyMembers_(t.task_id, 'Yêu cầu bổ sung kết quả ' + t.task_id, '');
  return true;
}
function apiDecideExt_(u, r) {
  admin_(u);
  const t = task_(r.id), x = Db.all('Extensions').filter(function (e) { return e.task_id === t.task_id && e.status === 'Chờ xử lý'; }).pop();
  if (!x) throw new AppError('Không có đề nghị gia hạn đang chờ', 'BAD');
  const at = now_();
  if (r.ok) {
    Db.update('Extensions', x._row, { status: 'Đồng ý', decided_by: u.user_id, decided_at: at });
    setTask_(t, { due_date: x.new_due, ext_pending: false });
    hist_(t.task_id, u.user_id, 'gia_han', 'Đồng ý gia hạn đến ' + x.new_due);
    notifyMembers_(t.task_id, 'Yêu cầu gia hạn ' + t.task_id + ' được đồng ý', '');
  } else {
    const note = str_(r.note, 1000, 'Ý kiến', true);
    Db.update('Extensions', x._row, { status: 'Từ chối', decided_by: u.user_id, decided_at: at, decision_note: note });
    setTask_(t, { ext_pending: false });
    hist_(t.task_id, u.user_id, 'tu_choi_gia_han', 'Từ chối gia hạn: ' + note);
    notifyMembers_(t.task_id, 'Yêu cầu gia hạn ' + t.task_id + ' bị từ chối', '');
  }
  return true;
}
function apiExtend_(u, r) {
  admin_(u);
  const t = task_(r.id), d = date_(r.date, 'Thời hạn mới'), at = now_();
  if (d <= t.due_date) throw new AppError('Thời hạn mới phải sau thời hạn hiện tại', 'BAD');
  Db.all('Extensions').filter(function (e) { return e.task_id === t.task_id && e.status === 'Chờ xử lý'; }).forEach(function (e) {
    Db.update('Extensions', e._row, { status: 'Từ chối', decided_by: u.user_id, decided_at: at, decision_note: 'Hiệu trưởng đã gia hạn trực tiếp' });
  });
  Db.append('Extensions', { ext_id: Db.nextId('Extensions', 'ext_id', 'E', 3), task_id: t.task_id, requested_by: u.user_id, old_due: t.due_date, new_due: d, reason: 'Hiệu trưởng gia hạn trực tiếp', status: 'Gia hạn trực tiếp', decided_by: u.user_id, decided_at: at, requested_at: at });
  setTask_(t, { due_date: d, ext_pending: false });
  notifyMembers_(t.task_id, 'Thời hạn ' + t.task_id + ' đổi thành ' + d.split('-').reverse().join('/'), '');
  return true;
}

// ===================== NHIỆM VỤ: THÀNH VIÊN =====================
function apiAccept_(u, r) {
  const t = task_(r.id), a = member_(u, t.task_id);
  if (t.status === 'Đã hoàn thành') throw new AppError('Nhiệm vụ đã hoàn thành', 'BAD');
  if (a.accepted_at) return true;
  Db.update('TaskAssignees', a._row, { accepted_at: now_() });
  if (t.status === 'Chưa tiếp nhận') setTask_(t, { status: 'Đang thực hiện' });
  hist_(t.task_id, u.user_id, 'tiep_nhan', u.full_name + ' xác nhận tiếp nhận');
  notify_('ADMIN', u.full_name + ' đã tiếp nhận ' + t.task_id, t.task_id);
  return true;
}
function acceptedMember_(u, t) {
  const a = member_(u, t.task_id);
  if (!a.accepted_at) throw new AppError('Hãy xác nhận tiếp nhận nhiệm vụ trước', 'BAD');
  if (t.status === 'Đã hoàn thành') throw new AppError('Nhiệm vụ đã hoàn thành', 'BAD');
}
function apiProgress_(u, r) {
  const t = task_(r.id); acceptedMember_(u, t);
  const done = str_(r.done, 2000, 'Công việc đã thực hiện', true), res = str_(r.res, 2000, 'Kết quả đạt được', true), left = str_(r.left, 2000, 'Công việc còn lại');
  const fls = files_(r.files), at = now_();
  Db.append('ProgressReports', { report_id: Db.nextId('ProgressReports', 'report_id', 'P', 3), task_id: t.task_id, user_id: u.user_id, done: done, result: res, remaining: left, reported_at: at });
  saveTaskFiles_(t.task_id, 'tien_do', fls, u.user_id, at);
  notify_('ADMIN', u.full_name + ' cập nhật tiến độ ' + t.task_id, t.task_id);
  return true;
}
// Mọi thành viên đã tiếp nhận đều được nộp như nhau, kể cả khi đồng đội đã nộp hoặc khi Hiệu trưởng yêu cầu bổ sung.
function apiSubmit_(u, r) {
  const t = task_(r.id); acceptedMember_(u, t);
  const text = str_(r.text, 3000, 'Báo cáo hoàn thành', true), note = str_(r.note, 1000, 'Ghi chú'), fls = files_(r.files), at = now_();
  Db.append('Submissions', { sub_id: Db.nextId('Submissions', 'sub_id', 'S', 3), task_id: t.task_id, submitted_by: u.user_id, content: text, note: note, submitted_at: at, result: 'Chờ duyệt', reviewer_comment: '' });
  saveTaskFiles_(t.task_id, 'nop', fls, u.user_id, at);
  setTask_(t, { status: 'Chờ duyệt' });
  hist_(t.task_id, u.user_id, 'nop', u.full_name + ' nộp kết quả');
  notify_('ADMIN', u.full_name + ' đã nộp kết quả ' + t.task_id, t.task_id);
  return true;
}
function apiRequestExt_(u, r) {
  const t = task_(r.id); member_(u, t.task_id);
  if (t.status === 'Đã hoàn thành' || t.status === 'Chờ duyệt') throw new AppError('Không thể xin gia hạn ở trạng thái hiện tại', 'BAD');
  if (Db.all('Extensions').some(function (e) { return e.task_id === t.task_id && e.status === 'Chờ xử lý'; })) throw new AppError('Đã có đề nghị gia hạn đang chờ xử lý', 'BAD');
  const to = date_(r.to, 'Thời hạn đề nghị'), why = str_(r.why, 1000, 'Lý do', true);
  if (to <= t.due_date) throw new AppError('Thời hạn mới phải sau thời hạn hiện tại', 'BAD');
  Db.append('Extensions', { ext_id: Db.nextId('Extensions', 'ext_id', 'E', 3), task_id: t.task_id, requested_by: u.user_id, old_due: t.due_date, new_due: to, reason: why, status: 'Chờ xử lý', requested_at: now_() });
  setTask_(t, { ext_pending: true });
  hist_(t.task_id, u.user_id, 'xin_gia_han', u.full_name + ' xin gia hạn đến ' + to.split('-').reverse().join('/'));
  notify_('ADMIN', u.full_name + ' xin gia hạn ' + t.task_id, t.task_id);
  return true;
}
// Chỉ leader đang được giao nhiệm vụ: Phó hiệu trưởng thêm bất kỳ ai, Tổ trưởng chỉ thêm người cùng tổ.
function apiAddAssignee_(u, r) {
  const t = task_(r.id);
  if (u.app_role !== 'leader') throw new AppError('Bạn không có quyền thêm người vào nhiệm vụ', 'FORBIDDEN');
  member_(u, t.task_id);
  if (t.status === 'Đã hoàn thành') throw new AppError('Nhiệm vụ đã hoàn thành', 'BAD');
  const x = userById_(String(r.userId));
  if (!x || !yes_(x.active) || x.app_role === 'admin') throw new AppError('Người được thêm không hợp lệ', 'BAD');
  if (u.position === 'Tổ trưởng chuyên môn' && x.department !== u.department) throw new AppError('Tổ trưởng chỉ được thêm nhân sự cùng tổ chuyên môn', 'FORBIDDEN');
  if (u.position !== 'Tổ trưởng chuyên môn' && u.position !== 'Phó hiệu trưởng') throw new AppError('Bạn không có quyền thêm người vào nhiệm vụ', 'FORBIDDEN');
  if (assignees_(t.task_id).some(function (a) { return a.user_id === x.user_id; })) throw new AppError('Người này đã có trong nhiệm vụ', 'BAD');
  Db.append('TaskAssignees', { row_id: Db.nextId('TaskAssignees', 'row_id', 'A', 3), task_id: t.task_id, user_id: x.user_id, accepted_at: '', added_by: u.user_id, added_at: now_() });
  hist_(t.task_id, u.user_id, 'them_nguoi', u.position + ' ' + u.full_name + ' thêm ' + x.full_name + ' vào nhiệm vụ');
  notify_(x.user_id, 'Bạn được thêm vào nhiệm vụ ' + t.task_id + ': ' + t.title, t.task_id);
  notify_('ADMIN', u.full_name + ' thêm ' + x.full_name + ' vào ' + t.task_id, t.task_id);
  return true;
}
function apiSendMsg_(u, r) {
  const t = access_(u, String(r.id)), text = str_(r.text, 2000, 'Tin nhắn', true);
  Db.append('Messages', { msg_id: Db.nextId('Messages', 'msg_id', 'M', 4), task_id: t.task_id, sender_id: u.user_id, text: text, sent_at: now_() });
  if (isAdmin_(u)) notifyMembers_(t.task_id, 'Tin nhắn mới về ' + t.task_id, '');
  else notify_('ADMIN', 'Tin nhắn mới về ' + t.task_id + ' từ ' + u.full_name, t.task_id);
  return true;
}
function apiDownloadTaskFile_(u, r) {
  const f = Db.all('TaskFiles').find(function (x) { return x.file_id === String(r.fileId); });
  if (!f) throw new AppError('Không tìm thấy tệp', 'NOTFOUND');
  access_(u, f.task_id);
  const b = b64_(f.drive_file_id);
  return { name: f.name, mime: b.mime, data: b.data };
}
