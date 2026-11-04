/**
 * Setup.gs – CÀI ĐẶT BAN ĐẦU VÀ BẢO TRÌ (chạy bằng tay trong trình soạn thảo Apps Script)
 *  setup()               : tạo Google Sheet, các thư mục Drive, khóa bí mật, tài khoản Hiệu trưởng (chạy 1 lần)
 *  checkUsers()          : kiểm tra danh sách nhân viên trong sheet Users, in lỗi ra nhật ký
 *  installWeeklyBackup() : bật sao lưu Sheet tự động mỗi tuần
 */

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
    ['Công văn', 'Nghị định', 'Kế hoạch', 'Tài liệu giảng dạy', 'Hình ảnh / video'].forEach(function (n, i) {
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
