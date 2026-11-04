const fs=require('fs'),crypto=require('crypto'),vm=require('vm');
const DIR=require('path').join(__dirname,'..','backend')+'/';
// ---- giả lập dịch vụ Google ----
const props={};
const PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v}})};
const fmt=(d,tz,p)=>{const t=new Date(d.getTime()+7*3600e3),z=n=>String(n).padStart(2,'0');const Y=t.getUTCFullYear(),M=z(t.getUTCMonth()+1),D=z(t.getUTCDate()),h=z(t.getUTCHours()),m=z(t.getUTCMinutes()),s=z(t.getUTCSeconds());return p==='yyyy-MM-dd'?`${Y}-${M}-${D}`:`${Y}-${M}-${D}T${h}:${m}:${s}`};
let clock=new Date('2026-10-28T09:00:00+07:00');
const Utilities={formatDate:(d,tz,p)=>fmt(d,tz,p==='yyyy-MM-dd'?p:'dt'),
 base64Decode:s=>[...Buffer.from(s,'base64')],base64Encode:b=>Buffer.from(b).toString('base64'),
 base64EncodeWebSafe:x=>Buffer.from(typeof x==='string'?x:Buffer.from(x)).toString('base64url'),
 base64DecodeWebSafe:s=>[...Buffer.from(s,'base64url')],
 getUuid:()=>crypto.randomUUID(),
 computeHmacSha256Signature:(v,k)=>[...crypto.createHmac('sha256',k).update(v).digest()],
 newBlob:(b,mime,name)=>({bytes:b,mime,name,getDataAsString:()=>Buffer.from(b).toString('utf8'),getBytes:()=>b,getContentType:()=>mime,getName:()=>name})};
// Sheets
const books={};
function mkSheet(name){const rows=[];const s={name,rows,frozen:0,
 getLastRow:()=>rows.length,getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),
 getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),
 getRange:(r,c,nr=1,nc=1)=>({getValues:()=>{const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push(rows[r-1+i]?.[c-1+j]??'');o.push(row)}return o},
   setValues:v=>{v.forEach((row,i)=>{rows[r-1+i]=rows[r-1+i]||[];row.forEach((x,j)=>{rows[r-1+i][c-1+j]=conv(x)})});return rng},
   setFontWeight(){return this},setBackground(){return this},setFontColor(){return this}}),
 appendRow:a=>{rows.push(a.map(conv))},deleteRow:n=>{rows.splice(n-1,1)},setFrozenRows(){},getName:()=>name};
 const rng={setFontWeight(){return rng},setBackground(){return rng},setFontColor(){return rng}};
 s.getRange=((orig)=>(...a)=>{const o=orig(...a);const sv=o.setValues;o.setValues=v=>{sv(v);return o};return o})(s.getRange);
 return s}
// Sheets tự đổi chuỗi ngày thành Date (mô phỏng)
function conv(x){if(typeof x==='string'){if(/^\d{4}-\d{2}-\d{2}$/.test(x))return new ctx.Date(x+'T00:00:00+07:00');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(x))return new ctx.Date(x+'+07:00');if(/^'/.test(x))return x.slice(1)}return x}
function mkBook(){const sheets=[];const b={id:'SHEET1',sheets,getSheetByName:n=>sheets.find(s=>s.name===n)||null,insertSheet:n=>{const s=mkSheet(n);sheets.push(s);return s},getSheets:()=>sheets,deleteSheet:s=>{sheets.splice(sheets.indexOf(s),1)},setSpreadsheetTimeZone(){},getUrl:()=>'url',getId:()=>'SHEET1'};sheets.push(mkSheet('Sheet1'));return b}
const SpreadsheetApp={create:()=>{const b=mkBook();books.SHEET1=b;return b},openById:id=>books[id]};
// Drive
const files={};let fid=0;
function mkFolder(name){const f={name,kids:[],getFoldersByName:n=>{const m=f.kids.filter(k=>k.name===n);let i=0;return{hasNext:()=>i<m.length,next:()=>m[i++]}},createFolder:n=>{const k=mkFolder(n);k.id='D'+(++fid);files[k.id]=k;f.kids.push(k);return k},createFile:blob=>{const id='F'+(++fid);files[id]={id,blob,trashed:false,getId:()=>id,getBlob:()=>blob,setTrashed(v){this.trashed=v}};return files[id]},getId:()=>f.id,getUrl:()=>'u'};return f}
const DriveApp={createFolder:n=>{const f=mkFolder(n);f.id='D'+(++fid);files[f.id]=f;return f},getFolderById:id=>files[id],getFileById:id=>files[id]};
const LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
const ContentService={createTextOutput:t=>({t,setMimeType(){return this}}),MimeType:{JSON:'json'}};
let tokenDB={};
const UrlFetchApp={fetch:url=>{const t=decodeURIComponent(url.split('id_token=')[1]);const x=tokenDB[t];return x?{getResponseCode:()=>200,getContentText:()=>JSON.stringify(x)}:{getResponseCode:()=>400,getContentText:()=>'{}'}}};
const ScriptApp={getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({onWeekDay:()=>({atHour:()=>({create(){}})})})}),WeekDay:{SUNDAY:1}};
const Logger={log:(...a)=>console.log('  [log]',...a)};
const RealDate=Date;
class FakeDate extends RealDate{constructor(...a){if(a.length)super(...a);else super(clock.getTime())}static now(){return clock.getTime()}}
const ctx={console,PropertiesService,Utilities,SpreadsheetApp,DriveApp,LockService,ContentService,UrlFetchApp,ScriptApp,Logger,Date:FakeDate,Buffer,Error,JSON,Math,String,Number,Array,Object,parseInt,isNaN,encodeURIComponent};
vm.createContext(ctx);
for(const f of ['Code.gs','Auth.gs','Db.gs','Api.gs','Docs.gs','Setup.gs']){vm.runInContext(fs.readFileSync(DIR+f,'utf8').replace(/^const (\w+) =/mg,'var $1 =').replace(/^class (\w+)/mg,'var $1 = class $1'),ctx,{filename:f})}
// vm: const ở top-level không lộ ra ngoài -> đã đổi sang var ở trên
module.exports={ctx,props,tokenDB,setClock:d=>{clock=new RealDate(d)},files,books};
