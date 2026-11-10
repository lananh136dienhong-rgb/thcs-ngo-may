// Môi trường Google GIẢ LẬP (Sheets, Drive, Cache, đăng nhập) để chạy mã trong backend/ bằng Node.js.
const fs = require('fs'), crypto = require('crypto'), vm = require('vm');
const DIR = require('path').join(__dirname, '..', 'backend') + '/';

const props = {};
const PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) };

// Đồng hồ giả (múi giờ +07:00)
let clock = new Date('2026-10-28T09:00:00+07:00');
const fmt = (d, p) => {
  const t = new Date(d.getTime() + 7 * 3600e3), z = n => String(n).padStart(2, '0');
  const Y = t.getUTCFullYear(), M = z(t.getUTCMonth() + 1), D = z(t.getUTCDate()), h = z(t.getUTCHours()), m = z(t.getUTCMinutes()), s = z(t.getUTCSeconds());
  return p === 'yyyy-MM-dd' ? `${Y}-${M}-${D}` : `${Y}-${M}-${D}T${h}:${m}:${s}`;
};
const Utilities = {
  formatDate: (d, tz, p) => fmt(d, p === 'yyyy-MM-dd' ? p : 'dt'),
  base64Decode: s => [...Buffer.from(s, 'base64')],
  base64Encode: b => Buffer.from(b).toString('base64'),
  base64EncodeWebSafe: x => Buffer.from(typeof x === 'string' ? x : Buffer.from(x)).toString('base64url'),
  base64DecodeWebSafe: s => [...Buffer.from(s, 'base64url')],
  getUuid: () => crypto.randomUUID(),
  computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()],
  newBlob: (b, mime, name) => ({ bytes: b, mime, name, getDataAsString: () => Buffer.from(b).toString('utf8'), getBytes: () => b, getContentType: () => mime, getName: () => name, setName(n) { this.name = n; return this; } })
};

// ---- Google Sheets giả lập (đếm số lần đọc trong stats.reads) ----
const books = {}, stats = { reads: 0 };
// Sheets tự đổi chuỗi ngày thành kiểu Date khi ghi (mô phỏng); chuỗi bắt đầu bằng ' là văn bản
function conv(x) {
  if (typeof x === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return new ctx.Date(x + 'T00:00:00+07:00');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(x)) return new ctx.Date(x + '+07:00');
    if (/^'/.test(x)) return x.slice(1);
    if (/^-?\d+(\.\d+)?$/.test(x)) return Number(x);   // Sheets tự đổi chuỗi số thành số ("03" thành 3)
  }
  return x;
}
function mkSheet(name) {
  const rows = [];
  const fmtObj = () => { const o = { setFontWeight: () => o, setBackground: () => o, setFontColor: () => o }; return o; };
  return {
    name, rows,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
    getDataRange: () => { stats.reads++; return { getValues: () => rows.map(r => [...r]) }; },
    getRange: (r, c, nr = 1, nc = 1) => {
      const o = fmtObj();
      o.getValues = () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(rows[r - 1 + i]?.[c - 1 + j] ?? ''); out.push(row); } return out; };
      o.setValues = v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = conv(x); }); }); return o; };
      return o;
    },
    appendRow: a => { rows.push(a.map(conv)); },
    deleteRow: n => { rows.splice(n - 1, 1); },
    deleteRows: (n, k) => { rows.splice(n - 1, k); },
    setFrozenRows() {}, getName: () => name
  };
}
function mkBook() {
  const sheets = [];
  const b = {
    id: 'SHEET1', sheets,
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = mkSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet: s => { sheets.splice(sheets.indexOf(s), 1); },
    setSpreadsheetTimeZone() {}, getUrl: () => 'url', getId: () => 'SHEET1'
  };
  sheets.push(mkSheet('Sheet1'));
  return b;
}
const SpreadsheetApp = { create: () => { const b = mkBook(); books.SHEET1 = b; return b; }, openById: id => books[id] };

// ---- Google Drive giả lập ----
const files = {}; let fid = 0;
function mkFolder(name) {
  const f = {
    name, kids: [], parent: null, getName: () => name,
    getFoldersByName: n => { const m = f.kids.filter(k => k.name === n); let i = 0; return { hasNext: () => i < m.length, next: () => m[i++] }; },
    getFolders: () => { let i = 0; return { hasNext: () => i < f.kids.length, next: () => f.kids[i++] }; },
    createFolder: n => { const k = mkFolder(n); k.id = 'D' + (++fid); k.parent = f; files[k.id] = k; f.kids.push(k); return k; },
    createFile: blob => { const id = 'F' + (++fid); files[id] = { id, blob, trashed: false, parent: f, getId: () => id, getBlob: () => blob, setTrashed(v) { this.trashed = v; }, setName(n) { this.blob.setName(n); return this; }, moveTo(d) { this.parent = d; return this; } }; return files[id]; },
    getId: () => f.id, getUrl: () => 'u'
  };
  return f;
}
const DriveApp = {
  createFolder: n => { const f = mkFolder(n); f.id = 'D' + (++fid); files[f.id] = f; return f; },
  getFolderById: id => files[id], getFileById: id => files[id]
};

// ---- CacheService giả lập (hết hạn theo đồng hồ giả) ----
const cacheStore = new Map();
const CacheService = {
  getScriptCache: () => {
    const c = {
      get: k => { const e = cacheStore.get(k); if (!e) return null; if (e.exp <= clock.getTime()) { cacheStore.delete(k); return null; } return e.v; },
      getAll: ks => { const o = {}; ks.forEach(k => { const v = c.get(k); if (v != null) o[k] = v; }); return o; },
      put: (k, v, t = 600) => { cacheStore.set(k, { v: String(v), exp: clock.getTime() + t * 1000 }); },
      putAll: (o, t = 600) => { for (const k in o) c.put(k, o[k], t); },
      removeAll: ks => ks.forEach(k => cacheStore.delete(k))
    };
    return c;
  }
};

const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const ContentService = { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } };
const tokenDB = {};   // token Google giả: tokenDB[token] = nội dung mà tokeninfo sẽ trả về
// Gemini giả: gemini.reply = hàm (body, url, opts) → {code, body}; gemini.calls ghi lại các yêu cầu đã gửi
const gemini = { calls: [], reply: null };
const UrlFetchApp = {
  fetch: (url, opts) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      const body = JSON.parse(opts.payload); gemini.calls.push({ url, opts, body });
      const r = gemini.reply(body, url, opts);
      return { getResponseCode: () => r.code, getContentText: () => typeof r.body === 'string' ? r.body : JSON.stringify(r.body) };
    }
    const t = decodeURIComponent(url.split('id_token=')[1]), x = tokenDB[t];
    return x ? { getResponseCode: () => 200, getContentText: () => JSON.stringify(x) } : { getResponseCode: () => 400, getContentText: () => '{}' };
  }
};
const triggers = [];
const ScriptApp = { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: fn => ({ timeBased: () => ({ onWeekDay: () => ({ atHour: () => ({ create() { triggers.push(fn); } }) }), everyMinutes: m => ({ create() { triggers.push(fn + ':' + m); } }) }) }), WeekDay: { SUNDAY: 1 } };
const Logger = { log: (...a) => console.log('  [log]', ...a) };

const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(clock.getTime()); }
  static now() { return clock.getTime(); }
}
const ctx = { console, CacheService, PropertiesService, Utilities, SpreadsheetApp, DriveApp, LockService, ContentService, UrlFetchApp, ScriptApp, Logger, Date: FakeDate, Buffer, Error, JSON, Math, String, Number, Array, Object, parseInt, isNaN, encodeURIComponent };
vm.createContext(ctx);
for (const f of ['Code.gs', 'Auth.gs', 'Db.gs', 'Api.gs', 'Docs.gs', 'Ai.gs', 'Setup.gs']) {
  // const/class ở cấp cao nhất không lộ ra ngoài vm, đổi sang var để mã khác dùng được
  vm.runInContext(fs.readFileSync(DIR + f, 'utf8').replace(/^const (\w+) =/mg, 'var $1 =').replace(/^class (\w+)/mg, 'var $1 = class $1'), ctx, { filename: f });
}
module.exports = { ctx, props, tokenDB, stats, files, books, gemini, triggers, setClock: d => { clock = new RealDate(d); } };
