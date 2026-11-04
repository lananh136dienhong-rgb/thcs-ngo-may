/**
 * Db.gs – LỚP TRUY CẬP GOOGLE SHEETS
 * Mỗi sheet là một bảng; dòng 1 là tên cột. Mã đọc/ghi theo TÊN CỘT nên có thể đổi thứ tự cột.
 */
const SCHEMA = {
  Users: ['user_id', 'full_name', 'email', 'birth_year', 'address', 'position', 'app_role', 'department', 'campus', 'active', 'created_at'],
  Tasks: ['task_id', 'title', 'description', 'priority', 'campus', 'department', 'target_type', 'due_date', 'status', 'created_by', 'created_at', 'updated_at', 'review_comment', 'ext_pending', 'is_deleted'],
  TaskAssignees: ['row_id', 'task_id', 'user_id', 'accepted_at', 'added_by', 'added_at'],
  TaskFiles: ['file_id', 'task_id', 'kind', 'name', 'drive_file_id', 'uploaded_by', 'uploaded_at'],
  Submissions: ['sub_id', 'task_id', 'submitted_by', 'content', 'note', 'submitted_at', 'result', 'reviewer_comment'],
  ProgressReports: ['report_id', 'task_id', 'user_id', 'done', 'result', 'remaining', 'reported_at'],
  Extensions: ['ext_id', 'task_id', 'requested_by', 'old_due', 'new_due', 'reason', 'status', 'decided_by', 'decided_at', 'decision_note', 'requested_at'],
  Messages: ['msg_id', 'task_id', 'sender_id', 'text', 'sent_at'],
  History: ['hist_id', 'task_id', 'actor_id', 'action', 'detail', 'at'],
  Documents: ['doc_id', 'name', 'drive_file_id', 'size_bytes', 'uploaded_by', 'uploaded_at', 'tag', 'reviewed', 'reviewed_at', 'is_deleted'],
  DocTags: ['tag_id', 'tag_name', 'active'],
  Notifications: ['notif_id', 'to_user_id', 'text', 'task_id', 'created_at', 'is_read']
};

const Db = (function () {
  let book = null;
  const cache = {};   // bộ nhớ đệm trong MỘT lần chạy, tự xóa khi có ghi

  function ss() { return book || (book = SpreadsheetApp.openById(prop_('SHEET_ID'))); }
  function sheet(n) {
    const s = ss().getSheetByName(n);
    if (!s) throw new Error('Thiếu sheet: ' + n + '. Hãy chạy hàm setup().');
    return s;
  }
  function head(n) { const s = sheet(n); return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String); }
  // Sheets tự đổi chuỗi ngày thành kiểu Date; chuẩn hóa lại về chuỗi ISO khi đọc.
  function norm(v, col) {
    if (v instanceof Date) {
      return /(_at|^at)$/.test(col)
        ? Utilities.formatDate(v, CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss")
        : Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
    }
    return v;
  }
  // Chặn "công thức độc hại": văn bản bắt đầu bằng = + - @ sẽ bị Sheets hiểu là công thức.
  function safe(v) { return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v; }

  function all(n) {
    if (cache[n]) return cache[n];
    const vals = sheet(n).getDataRange().getValues();
    const h = vals[0].map(String);
    const rows = [];
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === '' || vals[i][0] == null) continue;
      const o = { _row: i + 1 };
      h.forEach(function (c, j) { o[c] = norm(vals[i][j], c); });
      rows.push(o);
    }
    return (cache[n] = rows);
  }
  function append(n, obj) {
    sheet(n).appendRow(head(n).map(function (c) { return obj[c] === undefined ? '' : safe(obj[c]); }));
    delete cache[n];
  }
  function update(n, row, patch) {
    const h = head(n), rng = sheet(n).getRange(row, 1, 1, h.length), cur = rng.getValues()[0];
    Object.keys(patch).forEach(function (k) {
      const i = h.indexOf(k);
      if (i >= 0) cur[i] = safe(patch[k]);
    });
    rng.setValues([cur]);
    delete cache[n];
  }
  function removeWhere(n, pred) {
    const rows = all(n).filter(pred).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
    rows.forEach(function (r) { sheet(n).deleteRow(r); });
    delete cache[n];
    return rows.length;
  }
  function nextId(n, col, prefix, pad) {
    let m = 0;
    all(n).forEach(function (r) {
      const s = String(r[col]);
      if (s.indexOf(prefix) === 0) { const k = parseInt(s.slice(prefix.length), 10); if (k > m) m = k; }
    });
    return prefix + String(m + 1).padStart(pad, '0');
  }
  return { all: all, append: append, update: update, removeWhere: removeWhere, nextId: nextId };
})();
