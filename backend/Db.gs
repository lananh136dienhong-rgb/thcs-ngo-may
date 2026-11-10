/**
 * Db.gs – LỚP TRUY CẬP GOOGLE SHEETS
 * Mỗi sheet là một bảng; dòng 1 là tên cột. Mã đọc/ghi theo TÊN CỘT nên có thể đổi thứ tự cột.
 */
const SCHEMA = {
  Users: ['user_id', 'full_name', 'email', 'birth_year', 'address', 'position', 'app_role', 'department', 'campus', 'active', 'created_at'],
  Tasks: ['task_id', 'title', 'description', 'priority', 'campus', 'department', 'target_type', 'due_date', 'status', 'created_by', 'created_at', 'updated_at', 'review_comment', 'ext_pending', 'is_deleted', 'src_doc'],
  TaskAssignees: ['row_id', 'task_id', 'user_id', 'accepted_at', 'added_by', 'added_at'],
  TaskFiles: ['file_id', 'task_id', 'kind', 'name', 'drive_file_id', 'uploaded_by', 'uploaded_at'],
  Submissions: ['sub_id', 'task_id', 'submitted_by', 'content', 'note', 'submitted_at', 'result', 'reviewer_comment'],
  ProgressReports: ['report_id', 'task_id', 'user_id', 'done', 'result', 'remaining', 'reported_at'],
  Extensions: ['ext_id', 'task_id', 'requested_by', 'old_due', 'new_due', 'reason', 'status', 'decided_by', 'decided_at', 'decision_note', 'requested_at'],
  Messages: ['msg_id', 'task_id', 'sender_id', 'text', 'sent_at'],
  History: ['hist_id', 'task_id', 'actor_id', 'action', 'detail', 'at'],
  Documents: ['doc_id', 'name', 'drive_file_id', 'size_bytes', 'uploaded_by', 'uploaded_at', 'tag', 'reviewed', 'reviewed_at', 'is_deleted',
    'agency', 'doc_no', 'summary', 'ai_status', 'ai_tries', 'ai_at', 'ai_error', 'ai_result'],
  DocTags: ['tag_id', 'tag_name', 'active'],
  Notifications: ['notif_id', 'to_user_id', 'text', 'task_id', 'created_at', 'is_read'],
  AiSuggestions: ['sug_id', 'doc_id', 'title', 'description', 'due_date', 'source_text', 'how', 'status', 'task_id', 'created_at'],
  AiFeedback: ['fb_id', 'doc_name', 'ai_tag', 'ai_agency', 'final_tag', 'final_agency', 'at']
};

const Db = (function () {
  let book = null;
  const memo = {};     // bộ nhớ trong MỘT lần chạy
  // Bộ nhớ đệm dùng chung giữa các lần chạy (CacheService): giúp không phải đọc lại cả chục sheet ở mỗi yêu cầu.
  // Khi ghi qua ứng dụng, bảng bị ghi tự được xóa khỏi đệm. Khi bạn sửa sheet BẰNG TAY, thay đổi có hiệu lực
  // trong tối đa TTL giây (hoặc ngay lập tức nếu chạy hàm clearCache() trong Setup.gs).
  const TTL = 90;
  const CHUNK = 30000;      // ký tự mỗi mảnh: giới hạn 100 KB mỗi khóa, chữ có dấu tối đa 3 byte/ký tự
  const MAX_CHUNKS = 60;    // bảng lớn hơn ~1,8 triệu ký tự thì không đưa vào đệm

  function cache() { return CacheService.getScriptCache(); }
  function ckey(n) { return 'tbl_' + n; }
  function readCache(n) {
    try {
      const c = cache(), cnt = Number(c.get(ckey(n) + '_n') || 0);
      if (!cnt) return null;
      const keys = [];
      for (let i = 0; i < cnt; i++) keys.push(ckey(n) + '_' + i);
      const got = c.getAll(keys);
      let s = '';
      for (let i = 0; i < cnt; i++) { const p = got[keys[i]]; if (p == null) return null; s += p; }
      return JSON.parse(s);
    } catch (e) { return null; }
  }
  function writeCache(n, rows) {
    try {
      const c = cache();
      if (c.get('lw')) return;   // vừa có thao tác ghi: không nạp đệm, tránh lưu nhầm dữ liệu cũ
      const s = JSON.stringify(rows), o = {};
      if (s.length > CHUNK * MAX_CHUNKS) return;
      let k = 0;
      for (let i = 0; i < s.length; i += CHUNK) o[ckey(n) + '_' + (k++)] = s.slice(i, i + CHUNK);
      o[ckey(n) + '_n'] = String(k || 1);
      if (!k) o[ckey(n) + '_0'] = '[]';
      c.putAll(o, TTL);
    } catch (e) { console.error(e); }
  }
  function dropCache(n) {
    delete memo[n];
    try {
      const c = cache(), cnt = Number(c.get(ckey(n) + '_n') || 0), keys = [ckey(n) + '_n'];
      for (let i = 0; i < cnt; i++) keys.push(ckey(n) + '_' + i);
      c.removeAll(keys);
      c.put('lw', '1', 15);    // đánh dấu "vừa ghi" trong 15 giây
    } catch (e) { console.error(e); }
  }
  function clearAll() {
    Object.keys(SCHEMA).forEach(function (n) {
      delete memo[n];
      try {
        const c = cache(), cnt = Number(c.get(ckey(n) + '_n') || 0), keys = [ckey(n) + '_n'];
        for (let i = 0; i < cnt; i++) keys.push(ckey(n) + '_' + i);
        c.removeAll(keys);
      } catch (e) { console.error(e); }
    });
  }

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

  function readSheet(n) {
    const vals = sheet(n).getDataRange().getValues();
    const h = vals[0].map(String);
    const rows = [];
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === '' || vals[i][0] == null) continue;
      const o = { _row: i + 1 };
      h.forEach(function (c, j) { o[c] = norm(vals[i][j], c); });
      rows.push(o);
    }
    return rows;
  }
  function all(n) {
    if (memo[n]) return memo[n];
    let rows = readCache(n);
    if (!rows) { rows = readSheet(n); writeCache(n, rows); }
    return (memo[n] = rows);
  }
  function append(n, obj) {
    sheet(n).appendRow(head(n).map(function (c) { return obj[c] === undefined ? '' : safe(obj[c]); }));
    dropCache(n);
  }
  function update(n, row, patch) {
    const h = head(n), rng = sheet(n).getRange(row, 1, 1, h.length), cur = rng.getValues()[0];
    Object.keys(patch).forEach(function (k) {
      const i = h.indexOf(k);
      if (i >= 0) cur[i] = safe(patch[k]);
    });
    rng.setValues([cur]);
    dropCache(n);
  }
  // Xóa hẳn các dòng thỏa điều kiện. Luôn đọc lại sheet từ đầu (không dùng bộ nhớ đệm) để số dòng chắc chắn đúng,
  // rồi xóa từ dưới lên, gộp các dòng liền nhau thành một lần xóa.
  function removeWhere(n, pred) {
    const rows = readSheet(n).filter(pred).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
    const sh = sheet(n);
    let i = 0;
    while (i < rows.length) {
      let j = i;
      while (j + 1 < rows.length && rows[j + 1] === rows[j] - 1) j++;
      sh.deleteRows(rows[j], j - i + 1);
      i = j + 1;
    }
    dropCache(n);
    return rows.length;
  }
  // Bỏ dữ liệu đang nhớ của một bảng để lần đọc tiếp theo lấy thẳng từ Google Sheets (dùng khi vừa lấy khóa).
  function refresh(n) {
    delete memo[n];
    try {
      const c = cache(), cnt = Number(c.get(ckey(n) + '_n') || 0), keys = [ckey(n) + '_n'];
      for (let i = 0; i < cnt; i++) keys.push(ckey(n) + '_' + i);
      c.removeAll(keys);
    } catch (e) { console.error(e); }
  }
  function nextId(n, col, prefix, pad) {
    let m = 0;
    all(n).forEach(function (r) {
      const s = String(r[col]);
      if (s.indexOf(prefix) === 0) { const k = parseInt(s.slice(prefix.length), 10); if (k > m) m = k; }
    });
    return prefix + String(m + 1).padStart(pad, '0');
  }
  return { all: all, append: append, update: update, removeWhere: removeWhere, refresh: refresh, nextId: nextId, clearAll: clearAll };
})();
