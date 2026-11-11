/**
 * Setup.gs – CÀI ĐẶT BAN ĐẦU VÀ BẢO TRÌ (chạy bằng tay trong trình soạn thảo Apps Script)
 *  setup()               : tạo Google Sheet, các thư mục Drive, khóa bí mật, tài khoản Hiệu trưởng (chạy 1 lần)
 *  checkUsers()          : kiểm tra danh sách nhân viên trong sheet Users, in lỗi ra nhật ký
 *  installWeeklyBackup() : bật sao lưu Sheet tự động mỗi tuần
 *  clearCache()          : xóa bộ nhớ đệm, chạy sau khi sửa sheet BẰNG TAY nếu muốn có hiệu lực ngay
 *  upgrade()             : nâng cấp hệ thống đang chạy lên bản có AI (thêm cột, sheet và thẻ mới). An toàn khi chạy nhiều lần
 *  aiSelfTest()          : kiểm tra khóa Gemini và kết quả AI đọc thử một văn bản mẫu
 *  installAiTrigger()    : bật bộ hẹn giờ 5 phút/lần xử lý văn bản AI chưa đọc xong
 *  purgeDeletedTasks()   : dọn dữ liệu của các nhiệm vụ đã xóa từ trước khi có bản AI
 */

const DEFAULT_TAGS = ['Báo cáo', 'Chỉ thị', 'Chương trình', 'Công văn', 'Đề án', 'Hướng dẫn', 'Kế hoạch', 'Khác', 'Quyết định', 'Thông báo', 'Thông tư'];

function clearCache() {
  Db.clearAll();
  Logger.log('Đã xóa bộ nhớ đệm. Dữ liệu sẽ được đọc lại từ Google Sheets ở lần gọi tiếp theo.');
}

function setup() {
  const P = PropertiesService.getScriptProperties();
  ['GOOGLE_CLIENT_ID', 'ADMIN_EMAIL'].forEach(function (k) {
    if (!P.getProperty(k)) throw new Error('Thiếu Script property: ' + k + ' (Project Settings → Script properties).');
  });
  // 1. Google Sheet
  let ss;
  if (P.getProperty('SHEET_ID')) ss = SpreadsheetApp.openById(P.getProperty('SHEET_ID'));
  else { ss = SpreadsheetApp.create('QuanLyNhiemVu – THCS Ngô Mây'); P.setProperty('SHEET_ID', ss.getId()); }
  ss.setSpreadsheetTimeZone(CFG.TZ);
  Object.keys(SCHEMA).forEach(function (name) {
    const s = ss.getSheetByName(name) || ss.insertSheet(name), h = SCHEMA[name];
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#0a2447').setFontColor('#ffffff');
      s.setFrozenRows(1);
    }
  });
  ss.getSheets().forEach(function (s) {   // xóa sheet mặc định còn trống
    if (!SCHEMA[s.getName()] && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  // 2. Thư mục Drive
  let root;
  if (P.getProperty('FOLDER_ROOT')) root = DriveApp.getFolderById(P.getProperty('FOLDER_ROOT'));
  else { root = DriveApp.createFolder('QuanLyNhiemVu – THCS Ngô Mây'); P.setProperty('FOLDER_ROOT', root.getId()); }
  [['VanBan', 'FOLDER_VANBAN'], ['TaiLieuGiao', 'FOLDER_GIAO'], ['NopBai', 'FOLDER_NOPBAI']].forEach(function (p) {
    if (!P.getProperty(p[1])) P.setProperty(p[1], root.createFolder(p[0]).getId());
  });
  // 3. Khóa bí mật ký token phiên
  if (!P.getProperty('TOKEN_SECRET')) P.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  // 4. Tài khoản Hiệu trưởng và thẻ phân loại mặc định
  if (!Db.all('Users').length) {
    Db.append('Users', { user_id: 'U001', full_name: P.getProperty('ADMIN_NAME') || 'Hiệu trưởng', email: P.getProperty('ADMIN_EMAIL').trim().toLowerCase(), birth_year: '', address: '', position: 'Hiệu trưởng', app_role: 'admin', department: 'Ban giám hiệu', campus: 'Trường chính', active: true, created_at: now_() });
  }
  if (!Db.all('DocTags').length) {
    seedAgencies_();
    DEFAULT_TAGS.forEach(function (n, i) {
      Db.append('DocTags', { tag_id: 'TG' + String(i + 1).padStart(2, '0'), tag_name: n, active: true });
    });
  }
  Logger.log('XONG. Google Sheet: ' + ss.getUrl());
  Logger.log('Thư mục Drive: ' + root.getUrl());
  Logger.log('Bước tiếp theo: thêm nhân viên vào sheet Users, rồi Deploy → New deployment → Web app.');
}

function checkUsers() {
  const rows = Db.all('Users'), emails = {}, names = {}, problems = [];
  rows.forEach(function (u) {
    const tag = 'Dòng ' + u._row + ' (' + u.full_name + '): ';
    const em = String(u.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) problems.push(tag + 'email không hợp lệ');
    if (emails[em]) problems.push(tag + 'email trùng với dòng ' + emails[em]); else emails[em] = u._row;
    const nk = String(u.full_name).trim().toLowerCase();
    if (names[nk]) problems.push(tag + 'họ tên trùng với dòng ' + names[nk] + ' (hệ thống cần họ tên không trùng nhau)'); else names[nk] = u._row;
    if (LISTS.role.indexOf(u.app_role) < 0) problems.push(tag + 'app_role phải là admin, leader hoặc staff');
    if (LISTS.dept.indexOf(u.department) < 0) problems.push(tag + 'department không nằm trong danh mục');
    if (LISTS.campus.indexOf(u.campus) < 0) problems.push(tag + 'campus không nằm trong danh mục');
    if (u.app_role === 'leader' && ['Phó hiệu trưởng', 'Tổ trưởng chuyên môn'].indexOf(u.position) < 0) problems.push(tag + 'leader phải có position là Phó hiệu trưởng hoặc Tổ trưởng chuyên môn');
    if (u.app_role === 'staff' && ['Phó hiệu trưởng', 'Tổ trưởng chuyên môn'].indexOf(u.position) >= 0) problems.push(tag + 'đang là ' + u.position + ' nhưng app_role là staff (sẽ không có quyền thêm người vào nhiệm vụ)');
  });
  if (!rows.some(function (u) { return u.app_role === 'admin' && yes_(u.active); })) problems.push('Chưa có tài khoản admin nào đang hoạt động');
  Logger.log(problems.length ? 'PHÁT HIỆN ' + problems.length + ' VẤN ĐỀ:\n' + problems.join('\n') : 'Danh sách nhân viên hợp lệ (' + rows.length + ' người).');
}

function backup() {
  const root = DriveApp.getFolderById(prop_('FOLDER_ROOT')), dir = child_(root, 'Backups');
  DriveApp.getFileById(prop_('SHEET_ID')).makeCopy('Backup_' + today_(), dir);
  const files = [], it = dir.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(8).forEach(function (f) { f.setTrashed(true); });   // giữ 8 bản gần nhất
}
function installWeeklyBackup() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'backup'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  Logger.log('Đã bật sao lưu mỗi Chủ nhật lúc 2 giờ sáng.');
}

// ===================== NÂNG CẤP LÊN BẢN CÓ AI =====================
function upgrade() {
  const ss = SpreadsheetApp.openById(prop_('SHEET_ID')), log = [];
  Object.keys(SCHEMA).forEach(function (name) {
    const want = SCHEMA[name];
    let s = ss.getSheetByName(name);
    if (!s) { s = ss.insertSheet(name); log.push('Tạo sheet ' + name); }
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, want.length).setValues([want]).setFontWeight('bold').setBackground('#0a2447').setFontColor('#ffffff');
      s.setFrozenRows(1);
      return;
    }
    const have = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
    const miss = want.filter(function (c) { return have.indexOf(c) < 0; });
    if (miss.length) {
      s.getRange(1, have.length + 1, 1, miss.length).setValues([miss]).setFontWeight('bold').setBackground('#0a2447').setFontColor('#ffffff');
      log.push('Sheet ' + name + ': thêm cột ' + miss.join(', '));
    }
  });
  Db.clearAll();
  seedAgencies_();
  // Thêm các thẻ loại văn bản mặc định còn thiếu (không xóa hay sửa thẻ đang có).
  const tags = Db.all('DocTags');
  DEFAULT_TAGS.forEach(function (n) {
    const ex = tags.find(function (t) { return t.tag_name === n; });
    if (!ex) { Db.append('DocTags', { tag_id: Db.nextId('DocTags', 'tag_id', 'TG', 2), tag_name: n, active: true }); log.push('Thêm thẻ ' + n); }
    else if (!yes_(ex.active)) { Db.update('DocTags', ex._row, { active: true }); log.push('Bật lại thẻ ' + n); }
  });
  // Các văn bản cũ đã được xem xét: đánh dấu AI không áp dụng để không bị đưa vào hàng đợi.
  Db.refresh('Documents');
  Db.all('Documents').forEach(function (d) { if (yes_(d.reviewed) && !d.ai_status) Db.update('Documents', d._row, { ai_status: 'off' }); });
  child_(DriveApp.getFolderById(prop_('FOLDER_VANBAN')), STAGING);
  const sh = shareAllFiles();
  if (sh.done) log.push('Chia sẻ link cho ' + sh.done + ' tệp cũ để tải nhanh' + (sh.fail ? ' (' + sh.fail + ' tệp lỗi, xem Nhật ký)' : ''));
  Logger.log(log.length ? 'Đã nâng cấp:\n' + log.join('\n') : 'Hệ thống đã ở bản mới nhất, không có gì cần thay đổi.');
  Logger.log('Tiếp theo: đặt GEMINI_API_KEY trong Script properties, chạy aiSelfTest() rồi installAiTrigger().');
}

// Chia sẻ link (chỉ xem) cho mọi tệp đã có trong hệ thống để website tải thẳng từ Drive.
// upgrade() tự gọi hàm này; có thể chạy lại nhiều lần, tệp đã chia sẻ sẽ được bỏ qua.
function shareAllFiles() {
  const ids = [], seen = {}, r = { done: 0, fail: 0 };
  Db.refresh('TaskFiles'); Db.refresh('Documents');
  Db.all('TaskFiles').forEach(function (f) { if (f.drive_file_id) ids.push(f.drive_file_id); });
  Db.all('Documents').forEach(function (d) { if (d.drive_file_id && !yes_(d.is_deleted)) ids.push(d.drive_file_id); });
  ids.forEach(function (id) {
    if (seen[id]) return; seen[id] = 1;
    try {
      const f = DriveApp.getFileById(id);
      if (f.getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK) return;
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); r.done++;
    } catch (e) { r.fail++; console.error('Không chia sẻ được tệp ' + id + ': ' + e); }
  });
  Logger.log('Đã chia sẻ link cho ' + r.done + ' tệp' + (r.fail ? ', ' + r.fail + ' tệp lỗi' : '') + '.');
  return r;
}

// Dọn dữ liệu của các nhiệm vụ đã "xóa mềm" từ bản cũ (xóa trong Sheets, KHÔNG xóa tệp trong Drive).
function purgeDeletedTasks() {
  Db.refresh('Tasks');
  const gone = Db.all('Tasks').filter(function (t) { return yes_(t.is_deleted); });
  let rows = 0;
  gone.forEach(function (t) {
    rows += purgeTaskData_(t.task_id);
    Db.update('Tasks', t._row, { title: '(đã xóa)', description: '', review_comment: '', ext_pending: false });
  });
  Logger.log('Đã dọn ' + gone.length + ' nhiệm vụ đã xóa, xóa ' + rows + ' dòng dữ liệu liên quan trong Google Sheets. Tệp trong Drive được giữ nguyên.');
}

// Dọn các văn bản đã xóa từ bản cũ (trước đây chỉ đánh dấu đã xóa): xóa hẳn dữ liệu trong Google Sheets, tệp Drive vào thùng rác.
function purgeDeletedDocs() {
  Db.refresh('Documents');
  const gone = Db.all('Documents').filter(function (d) { return yes_(d.is_deleted); });
  gone.forEach(wipeDoc_);
  Logger.log('Đã xóa hẳn ' + gone.length + ' văn bản đã đánh dấu xóa khỏi Google Sheets (tệp Drive nằm trong thùng rác).');
}

// Dọn dữ liệu để Google Sheets không phình to: thông báo quá 30 ngày và đề xuất AI đã bỏ qua (cũ từ bản trước) bị xóa hẳn.
// Chạy tự động mỗi ngày nếu đã chạy installCleanupTrigger; cũng có thể chạy tay.
const NOTIF_KEEP_DAYS = 30;
function dailyCleanup() {
  const cut = addDays_(today_(), -NOTIF_KEEP_DAYS);
  return withLock_(function () {
    Db.refresh('Notifications'); Db.refresh('AiSuggestions');
    const n = Db.removeWhere('Notifications', function (x) { return String(x.created_at).slice(0, 10) < cut; });
    const s = Db.removeWhere('AiSuggestions', function (x) { return x.status === 'skipped'; });
    Logger.log('Đã xóa ' + n + ' thông báo cũ hơn ' + NOTIF_KEEP_DAYS + ' ngày và ' + s + ' đề xuất AI đã bỏ qua.');
    return { notifications: n, suggestions: s };
  });
}
function installCleanupTrigger() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'dailyCleanup'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyCleanup').timeBased().atHour(2).everyDays(1).create();
  Logger.log('Đã bật: mỗi ngày khoảng 2 giờ sáng hệ thống tự dọn thông báo cũ và đề xuất AI đã bỏ qua.');
}

function installAiTrigger() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'aiSweep'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('aiSweep').timeBased().everyMinutes(5).create();
  Logger.log('Đã bật: cứ 5 phút hệ thống kiểm tra và xử lý các văn bản AI chưa đọc xong.');
}

// Chạy tay để kiểm tra Gemini: dùng một văn bản mẫu ngắn (không đụng tới dữ liệu thật, không tốn Drive).
function aiSelfTest() {
  if (!prop_('GEMINI_API_KEY')) throw new Error('Chưa có GEMINI_API_KEY trong Script properties.');
  Logger.log('Mô hình: ' + (prop_('GEMINI_MODEL') || AI.MODEL));
  const sample = 'UBND TỈNH GIA LAI\nSỞ GIÁO DỤC VÀ ĐÀO TẠO\nSố: 1234/SGDĐT-GDTrH\nGia Lai, ngày 05 tháng 11 năm 2026\nV/v tổ chức Hội thi Khoa học kỹ thuật cấp trường\nKính gửi: Các trường THCS trên địa bàn.\n'
    + 'Thực hiện kế hoạch năm học, Sở đề nghị các trường: 1) Xây dựng kế hoạch tổ chức hội thi và gửi về Sở trước ngày 30/11/2026. 2) Báo cáo kết quả hội thi trong thời hạn 05 ngày làm việc kể từ ngày kết thúc.\nNơi nhận: Như trên; Lưu VT.';
  const tags = aiTags_();
  const raw = aiParse_(aiCall_(aiSystem_(tags), [{ text: 'Hôm nay là ' + today_() + '. Tên tệp: mau.txt. NỘI DUNG VĂN BẢN:\n' + sample + '\nHãy phân tích và trả về JSON.' }]));
  const res = aiNormalize_(raw, { uploaded_at: now_(), name: 'mau.txt' }, tags);
  Logger.log('Kết quả AI đọc thử:\n' + JSON.stringify(res, null, 2));
  Logger.log('ĐÚNG KỲ VỌNG nếu: loại = Công văn, cơ quan = 03, có nhiệm vụ "Xây dựng kế hoạch…" với hạn gần 30/11/2026 (sớm hơn 2 ngày, lùi về ngày làm việc).');
}
