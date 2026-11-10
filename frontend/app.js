/**
 * app.js – GIAO DIỆN VÀ XỬ LÝ SỰ KIỆN
 * Thứ tự nạp (xem index.html): config.js → api.js → app.js
 *  - Dữ liệu lấy từ backend qua API.call(...) rồi đưa vào các biến T (nhiệm vụ), D (văn bản), N (thông báo), PPL (nhân sự), TAGS.
 *  - Các hàm vẽ giao diện (aOv, sOv, dtl, modal, draw...) đọc các biến này và dựng HTML.
 *  - Mọi thao tác ghi dữ liệu đi qua act(...) → API.call → backend kiểm tra quyền → tải lại dữ liệu → vẽ lại.
 */
let ME='',TD='',TAGS=[],T=[],D=[],N=[],PPL=[];
const PR={a:null,s:null,l:null};   // hồ sơ người đang đăng nhập (dùng chung cho 3 vai trò)
const $=s=>document.querySelector(s),fd=i=>i.split('-').reverse().join('/'),ini=n=>n.split(' ').slice(-2).map(w=>w[0]).join('');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TO=['Ban giám hiệu','Tổ GDTC – Nghệ thuật','Tổ KHTN – Công nghệ','Tổ Ngữ văn – GDCD','Tổ Sử – Địa','Tổ Tiếng Anh','Tổ Toán – Tin','Tổ Văn phòng'];
const ST=['Chưa tiếp nhận','Đang thực hiện','Chờ duyệt','Yêu cầu bổ sung','Đã hoàn thành'];
const SC={'Chưa tiếp nhận':'g','Đang thực hiện':'b','Chờ duyệt':'a','Yêu cầu bổ sung':'p','Đã hoàn thành':'ok'};
const S={role:'s',page:'ov',tid:null,m:null,tab:'Tất cả',f:{q:'',st:'',cs:'',to:'',who:''},pick:[],rf:{a:'',b:'',who:'',to:'',cs:'',st:''},err:'',ef:[]};
const rk=()=>S.role=='a'?'a':'s',nl=r=>N.filter(n=>n.r==r&&(r=='a'||!n.id||find(n.id)?.as.includes(ME)));
const nextId=()=>'NV-0'+(Math.max(0,...T.map(t=>+t.id.slice(3)))+1);
const od=t=>t.st!='Đã hoàn thành'&&t.due<TD,find=id=>T.find(t=>t.id==id),mine=()=>T.filter(t=>t.as.includes(ME));
const soon=t=>t.st!='Đã hoàn thành'&&t.due>=TD&&(new Date(t.due)-new Date(TD))/864e5<=3;
const bds=t=>`<span class="bd ${SC[t.st]}">${t.st}</span>`+(od(t)?'<span class="bd r">Quá hạn</span>':'')+(t.ext?'<span class="bd t">Chờ gia hạn</span>':'');
const flt=(L,f)=>L.filter(t=>(!f.q||(t.id+t.title+t.as.join()).toLowerCase().includes(f.q.toLowerCase()))&&(!f.st||(f.st=='Quá hạn'?od(t):f.st=='Yêu cầu gia hạn'?t.ext:f.st=='Sắp đến hạn'?soon(t):t.st==f.st))&&(!f.cs||t.cs==f.cs)&&(!f.to||t.to==f.to)&&(!f.who||t.as.includes(f.who)));
const opt=(a,v,all)=>(all?`<option value="">${all}</option>`:'')+a.map(x=>`<option ${x==v?'selected':''}>${esc(x)}</option>`).join('');
const stat=(c,n,l,s,a)=>`<button class="card st" data-a="${a}" style="font:inherit;color:inherit"><div><b>${n}</b><div>${l}</div><div class="sub">${s}</div></div><i class="bd ${c}">${n}</i></button>`;
const pc=(d,n)=>`<div class="sub">${esc(d)} · ${n[0]}/${n[1]} hoàn thành</div><div class="bar"><i style="width:${n[1]?n[0]/n[1]*100:0}%"></i></div>`;
const cnt=(L,k,v)=>[L.filter(t=>t[k]==v&&t.st=='Đã hoàn thành').length,L.filter(t=>t[k]==v).length];
const prog=L=>`<h2>Tiến độ theo tổ</h2><div style="height:8px"></div>${TO.map(x=>pc(x,cnt(L,'to',x))).join('')}<h3>Theo cơ sở</h3>${['Trường chính','Phân hiệu'].map(x=>pc(x,cnt(L,'cs',x))).join('')}`;
const rows=(L,w)=>`<div class="sc"><div class="tr h"><span>NHIỆM VỤ</span><span>${w}</span><span>CƠ SỞ</span><span>TRẠNG THÁI</span><span>HẠN</span><span></span></div>${L.map(t=>`<div class="tr" tabindex="0" data-a="open" data-id="${t.id}"><div><span class="id">${t.id}</span><div class="tt">${esc(t.title)}</div><div class="sub">${t.to} · Ưu tiên ${t.pri.toLowerCase()}</div></div><div>${w=='NGƯỜI GIAO'?'Hiệu trưởng':t.as.map(a=>`<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span class="av" style="width:24px;height:24px;font-size:9px">${ini(a)}</span>${esc(a)}</div>`).join('')}</div><div>${t.cs}</div><div>${bds(t)}</div><div class="${od(t)?'late':''}">${fd(t.due)}</div><span>›</span></div>`).join('')||'<p class="sub" style="padding:20px">Chưa có nhiệm vụ phù hợp bộ lọc. Hãy thử bỏ bớt điều kiện lọc.</p>'}</div>`;
const nots=(r,k)=>nl(r).slice(0,k||99).map(n=>`<div class="nt ${n.n?'':'rd'}" data-a="${n.id?'open':''}" data-id="${n.id}" style="cursor:pointer"><div style="flex:1"><b>${esc(n.t)}</b><div class="sub">${n.id?n.id+' · ':''}${n.at}</div></div></div>`).join('')||'<p class="sub">Chưa có thông báo.</p>';
function nav(){const a=S.role=='a',it=a?[['ov','Tổng quan'],['cr','Tạo nhiệm vụ'],['mo','Giám sát tiến độ'],['dc','Văn bản'],['rp','Thống kê'],['nt','Thông báo']]:[['ov','Tổng quan'],['mo','Nhiệm vụ'],['dc','Văn bản'],['nt','Thông báo']];
const cur=S.page;const unread=nl(rk()).filter(n=>n.n).length;
return it.map(([k,l])=>`<button class="nv ${cur==k?'on':''}" data-a="go" data-p="${k}">${l}${k=='nt'&&unread?'<span class="dot"></span>':''}${k=='mo'&&!a?`<em>${mine().length}</em>`:''}${k=='mo'&&a?`<em>${T.length}</em>`:''}</button>`).join('')}
/* ---------- ADMIN ---------- */
function aOv(){const c=s=>T.filter(t=>t.st==s).length,L=S.tab=='Tất cả'?T:flt(T,{st:S.tab}),docs=D.filter(d=>!d.ok).length,ex=T.filter(t=>t.ext).length;
return `<div class="hd"><div><h1>Tổng quan điều hành</h1><div class="sub">Cập nhật theo thời gian thực từ Dashboard nhân viên</div></div><button class="btn p" data-a="go" data-p="cr">+ Tạo nhiệm vụ</button></div>
<div class="g4">${stat('b',T.length,'Tổng nhiệm vụ','Toàn trường','go-mo')}${stat('g',c('Chưa tiếp nhận'),'Chưa tiếp nhận','Cần theo dõi','f-Chưa tiếp nhận')}${stat('a',c('Chờ duyệt'),'Chờ phê duyệt','Cần xử lý','f-Chờ duyệt')}${stat('r',T.filter(od).length,'Quá hạn','Cần đôn đốc','f-Quá hạn')}</div>
<div class="cols"><div class="card"><div class="hd" style="margin:0"><div><h2>Nhiệm vụ</h2><div class="sub">Cập nhật lúc 08:30, hôm nay</div></div><button class="btn" data-a="go" data-p="mo">Xem tất cả ›</button></div>
<div class="tabs">${['Tất cả','Chưa tiếp nhận','Đang thực hiện','Chờ duyệt','Yêu cầu bổ sung','Đã hoàn thành'].map(x=>`<button class="${S.tab==x?'on':''}" data-a="tab" data-v="${x}">${x}</button>`).join('')}</div>${rows(L.slice(0,6),'NGƯỜI THỰC HIỆN')}</div>
<div class="stk"><div class="card"><h2>Điểm cần chú ý</h2><div class="sub">Ưu tiên xử lý trong hôm nay</div>
<div class="li" data-a="f-Chờ duyệt"><i class="bd a">${c('Chờ duyệt')}</i><div><b>${c('Chờ duyệt')} kết quả chờ duyệt</b><div class="sub">Nhân viên đã nộp, cần kiểm tra</div></div></div>
<div class="li" data-a="f-Quá hạn"><i class="bd r">${T.filter(od).length}</i><div><b>${T.filter(od).length} nhiệm vụ quá hạn</b><div class="sub">Cần nhắc nhở hoặc gia hạn</div></div></div>
<div class="li" data-a="f-Yêu cầu gia hạn"><i class="bd t">${ex}</i><div><b>${ex} yêu cầu gia hạn</b><div class="sub">Đang chờ quyết định</div></div></div>
<div class="li" data-a="go" data-p="dc"><i class="bd p">${docs}</i><div><b>${docs} văn bản chưa xem xét</b><div class="sub">Cần đọc và phân loại</div></div></div></div>
<div class="card"><h2>Thông báo mới</h2><div class="sub">Đồng bộ theo thời gian thực</div>${nots('a',4)}</div><div class="card">${prog(T)}</div></div></div>`}
function paintPick(){const s=$('#sg'),c=$('#chips');if(!s)return;c.innerHTML=S.pick.map(n=>`<span class="chip">${esc(n)}<button type="button" data-a="unpick" data-v="${esc(n)}" aria-label="Bỏ ${esc(n)}">✕</button></span>`).join('');
const q=($('#ps').value||'').toLowerCase(),f=$('#cf');const tof=f.to.value,cs=f.cs.value,k=f.kind.value;
const r=PPL.filter(p=>!S.pick.includes(p.n)&&p.n.toLowerCase().includes(q)&&(!tof||p.t==tof)&&(!cs||p.c==cs)&&(!k||p.r==k));
s.innerHTML=r.map(p=>`<div data-a="pick" data-v="${esc(p.n)}"><b>${esc(p.n)}</b> <span class="sub">${p.r} · ${p.t} · ${p.c}</span></div>`).join('')||'<div class="sub">Không tìm thấy nhân sự phù hợp.</div>'}
function aCr(){const nid=nextId();return `<h1>Giao nhiệm vụ</h1><p class="sub">Mã nhiệm vụ tạo tự động (dự kiến ${nid}). Nhiệm vụ xuất hiện ngay trên dashboard người được giao.</p>
<form class="card fm" id="cf" data-f="create" style="max-width:760px"><label>Tên nhiệm vụ</label><input name="title" style="width:100%" required>
<label>Nội dung chi tiết</label><textarea name="desc"></textarea><label>Tài liệu liên quan</label><input type="file" name="fl" multiple>
<div class="row"><div><label>Đơn vị</label><select name="cs"><option value="">Tất cả</option><option>Trường chính</option><option>Phân hiệu</option></select></div><div><label>Loại đối tượng</label><select name="kind"><option value="">Tất cả</option><option>Phó hiệu trưởng</option><option>Tổ trưởng chuyên môn</option><option>Giáo viên</option><option>Nhân viên</option></select></div><div><label>Tổ chuyên môn</label><select name="to">${opt(TO,'','Tất cả')}</select></div></div>
<div class="row"><div><label>Mức ưu tiên</label><select name="pri"><option>Thấp</option><option selected>Trung bình</option><option>Cao</option></select></div><div><label>Thời hạn hoàn thành</label><input type="date" name="due" min="${TD}" required></div></div>
<label>Người được giao</label><input id="ps" type="search" placeholder="Tìm tên nhân sự trong danh mục…" autocomplete="off"><div id="chips"></div><div id="sg" class="sg"></div>
<div class="err">${esc(S.err)}</div><button class="btn t" style="margin-top:14px">Giao nhiệm vụ</button></form>`}
function aMo(){const f=S.f,L=flt(T,f);return `<div class="hd"><div><h1>Giám sát tiến độ</h1><div class="sub">Theo dõi trạng thái và xử lý đề nghị từ nhân viên</div></div></div>
<div class="fl" data-f2><input data-k="q" placeholder="Tìm theo mã, tên, người thực hiện" value="${esc(f.q)}" style="min-width:260px"><select data-k="st">${opt([...ST,'Quá hạn','Yêu cầu gia hạn'],f.st,'Mọi trạng thái')}</select><select data-k="cs">${opt(['Trường chính','Phân hiệu'],f.cs,'Mọi cơ sở')}</select><select data-k="to">${opt(TO,f.to,'Mọi tổ')}</select><select data-k="who">${opt(PPL.map(p=>p.n),f.who,'Mọi người')}</select></div>
<div class="card">${rows(L,'NGƯỜI THỰC HIỆN')}</div>`}
function aDc(){const gt='110px 2fr 100px 120px 170px 120px 160px';return `<h1>Quản lý văn bản</h1><p class="sub">Tệp lưu trong Drive của Hiệu trưởng, mỗi văn bản có một mã ID riêng.</p>
<form class="card fm" data-f="doc" style="margin-bottom:14px"><input type="file" name="fl" required> <button class="btn t">Tải lên</button><div class="sub" style="margin-top:8px">Hệ thống kiểm tra định dạng, dung lượng và chặn văn bản trùng tên, trùng dung lượng.</div><div class="err">${esc(S.err)}</div></form>
<div class="card" style="margin-bottom:14px"><h2>Thẻ phân loại</h2><div class="sub" style="margin-bottom:8px">Thêm, đổi tên hoặc xóa thẻ. Đổi tên sẽ cập nhật cho mọi văn bản đang dùng thẻ đó.</div>${TAGS.map(g=>`<span class="chip">${esc(g)}<button data-a="tren" data-v="${esc(g)}" aria-label="Đổi tên ${esc(g)}">✎</button><button data-a="tdel" data-v="${esc(g)}" aria-label="Xóa ${esc(g)}">✕</button></span>`).join('')}<form data-f="tag" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><input name="g" placeholder="Tên thẻ mới" required><button class="btn o">Thêm thẻ</button></form></div>
<div class="card sc"><div class="tr h" style="grid-template-columns:${gt};min-width:920px"><span>MÃ VĂN BẢN</span><span>TÊN TỆP</span><span>NGÀY TẢI</span><span>NGƯỜI TẢI</span><span>PHÂN LOẠI</span><span>TRẠNG THÁI</span><span>THAO TÁC</span></div>
${D.map(d=>`<div class="tr" style="grid-template-columns:${gt};min-width:920px;cursor:default"><b>${d.id}</b><span>${esc(d.n)}</span><span>${fd(d.d)}</span><span>${esc(d.by)}</span><select data-a="kind" data-id="${d.id}">${opt(TAGS,d.k,'Chưa phân loại')}</select><span class="bd ${d.ok?'ok':'a'}">${d.ok?'Đã xem xét':'Chưa xem xét'}</span><span><button class="btn" data-a="ddl" data-id="${d.id}">⬇ Tải</button> <button class="btn" data-a="ddel" data-id="${d.id}" style="color:#d23b3b" aria-label="Xóa ${d.id}">Xóa</button></span></div>`).join('')||'<p class="sub" style="padding:20px">Chưa có văn bản nào.</p>'}</div>
<p class="sub">Phân loại tự động và đề xuất người xử lý bằng AI (M07) sẽ bổ sung sau.</p>`}
function aRp(){const r=S.rf,L=T.filter(t=>(!r.a||t.made>=r.a)&&(!r.b||t.made<=r.b)&&(!r.who||t.as.includes(r.who))&&(!r.to||t.to==r.to)&&(!r.cs||t.cs==r.cs)&&(!r.st||(r.st=='Quá hạn'?od(t):t.st==r.st)));
const bx=[['g','Chưa tiếp nhận'],['b','Đang thực hiện'],['a','Chờ duyệt'],['p','Yêu cầu bổ sung'],['ok','Đã hoàn thành'],['r','Quá hạn']];
return `<div class="hd"><div><h1>Thống kê</h1><p class="sub" style="margin:0">Kết quả thực hiện nhiệm vụ theo bộ lọc.</p></div><button class="btn p" data-a="pdf">⬇ Tải PDF thống kê</button></div><div class="fl" data-f3>Từ <input type="date" data-k="a" value="${r.a}"> đến <input type="date" data-k="b" value="${r.b}"><select data-k="who">${opt(PPL.map(p=>p.n),r.who,'Mọi người')}</select><select data-k="to">${opt(TO,r.to,'Mọi tổ')}</select><select data-k="cs">${opt(['Trường chính','Phân hiệu'],r.cs,'Mọi cơ sở')}</select><select data-k="st">${opt([...ST,'Quá hạn'],r.st,'Mọi trạng thái')}</select></div>
<div class="g4">${bx.map(([c,s])=>`<div class="card" style="border-left:4px solid"><b style="font-size:28px" class="bd ${c}" >${L.filter(t=>s=='Quá hạn'?od(t):t.st==s).length}</b><div>${s}</div></div>`).join('')}</div>
<div class="cols" style="grid-template-columns:1fr 1fr"><div class="card">${prog(L)}</div><div class="card"><h2>Theo người thực hiện</h2><div style="height:8px"></div>${PPL.filter(p=>L.some(t=>t.as.includes(p.n))).map(p=>pc(p.n,[L.filter(t=>t.as.includes(p.n)&&t.st=='Đã hoàn thành').length,L.filter(t=>t.as.includes(p.n)).length])).join('')}</div></div>`}
/* ---------- STAFF ---------- */
function sOv(){const L=mine(),c=s=>L.filter(t=>t.st==s).length,LL=S.tab=='Tất cả'?L:flt(L,{st:S.tab}),sn=L.filter(soon).length,rq=c('Yêu cầu bổ sung'),ov=L.filter(od).length;
return `<div class="hd"><div><h1>Tổng quan</h1><div class="sub">Công việc của bạn, cập nhật thời gian thực</div></div><button class="btn p" data-a="go" data-p="mo">Xem nhiệm vụ</button></div>
<div class="g4">${stat('b',L.length,'Tổng nhiệm vụ','Trong học kỳ này','go-mo')}${stat('g',c('Chưa tiếp nhận'),'Chưa tiếp nhận','Cần xác nhận','f-Chưa tiếp nhận')}${stat('a',sn,'Sắp đến hạn','Trong 3 ngày tới','f-Sắp đến hạn')}${stat('r',ov,'Quá hạn','Cần nộp hoặc xin gia hạn','f-Quá hạn')}${stat('p',rq,'Yêu cầu bổ sung','Cần chỉnh sửa','f-Yêu cầu bổ sung')}${stat('a',c('Chờ duyệt'),'Chờ duyệt','Đã nộp kết quả','f-Chờ duyệt')}</div>
<div class="cols"><div class="card"><div class="hd" style="margin:0"><div><h2>Nhiệm vụ</h2><div class="sub">Cập nhật lúc 08:30, hôm nay</div></div><button class="btn" data-a="go" data-p="mo">Xem tất cả ›</button></div>
<div class="tabs">${['Tất cả','Chưa tiếp nhận','Đang thực hiện','Chờ duyệt','Yêu cầu bổ sung','Đã hoàn thành'].map(x=>`<button class="${S.tab==x?'on':''}" data-a="tab" data-v="${x}">${x}</button>`).join('')}</div>${rows(LL.slice(0,6),'NGƯỜI THỰC HIỆN')}</div>
<div class="stk"><div class="card"><h2>Điểm cần chú ý</h2><div class="sub">Ưu tiên xử lý trong hôm nay</div>
<div class="li" data-a="f-Sắp đến hạn"><i class="bd a">${sn}</i><div><b>${sn} nhiệm vụ sắp đến hạn</b><div class="sub">Trong 3 ngày tới</div></div></div>
<div class="li" data-a="f-Quá hạn"><i class="bd r">${ov}</i><div><b>${ov} nhiệm vụ quá hạn</b><div class="sub">Cần nộp hoặc xin gia hạn</div></div></div>
<div class="li" data-a="f-Yêu cầu bổ sung"><i class="bd p">${rq}</i><div><b>${rq} yêu cầu bổ sung</b><div class="sub">Cần chỉnh sửa và nộp lại</div></div></div></div>
<div class="card"><h2>Thông báo mới</h2><div class="sub">Đồng bộ theo thời gian thực</div>${nots('s',4)}</div></div></div>`}
function sMo(){const f=S.f,L=flt(mine(),f);return `<div class="hd"><div><h1>Nhiệm vụ</h1><div class="sub">Tất cả nhiệm vụ được giao cho bạn</div></div></div>
<div class="fl" data-f2><input data-k="q" placeholder="Tìm theo mã hoặc tên nhiệm vụ" value="${esc(f.q)}" style="min-width:240px"><select data-k="st">${opt([...ST,'Sắp đến hạn','Quá hạn','Yêu cầu gia hạn'],f.st,'Mọi trạng thái')}</select><select data-k="cs">${opt(['Trường chính','Phân hiệu'],f.cs,'Mọi cơ sở')}</select></div><div class="card">${rows(L,'NGƯỜI GIAO')}</div>`}
function sDc(){const my=D.filter(d=>d.by==ME&&!d.ok),rv=D.filter(d=>d.ok),gt='110px 2fr 100px 170px 110px';return `<h1>Văn bản</h1><p class="sub">Bạn có thể tải văn bản lên và tải về các văn bản đã được Hiệu trưởng xem xét.</p>
<form class="card fm" data-f="doc" style="margin-bottom:14px"><input type="file" name="fl" required> <button class="btn t">Tải lên</button><div class="err">${esc(S.err)}</div></form>
${my.length?`<div class="card" style="margin-bottom:14px"><h2>Văn bản bạn tải lên, chờ xem xét</h2>${my.map(d=>`<div class="li" style="cursor:default"><b>${d.id}</b><span style="flex:1">${esc(d.n)}</span><span class="bd a">Chưa xem xét</span></div>`).join('')}</div>`:''}
<div class="card sc"><h2>Văn bản đã xem xét</h2><div style="height:8px"></div><div class="tr h" style="grid-template-columns:${gt};min-width:660px"><span>MÃ VĂN BẢN</span><span>TÊN TỆP</span><span>NGÀY TẢI</span><span>PHÂN LOẠI</span><span></span></div>${rv.map(d=>`<div class="tr" style="grid-template-columns:${gt};min-width:660px;cursor:default"><b>${d.id}</b><span>${esc(d.n)}</span><span>${fd(d.d)}</span><span>${d.k?`<span class="bd b">${esc(d.k)}</span>`:'<span class="sub">Chưa phân loại</span>'}</span><button class="btn" data-a="ddl" data-id="${d.id}">⬇ Tải</button></div>`).join('')||'<p class="sub" style="padding:20px">Chưa có văn bản nào được xem xét.</p>'}</div>`}
function nt(){const r=rk();return `<h1>Thông báo</h1><p class="sub">${r=='a'?'Cập nhật trạng thái và tin nhắn từ nhân viên.':'Nhiệm vụ mới, phản hồi và kết quả phê duyệt.'}</p><div class="card">${nots(r)}</div>`}
/* ---------- DETAIL ---------- */
function dtl(){const t=find(S.tid),a=S.role=='a',sub=t.subs.at(-1),pend=t.acc.length<t.as.length;let act='';
const q=PR[S.role],can=!a&&['Phó hiệu trưởng','Tổ trưởng chuyên môn'].includes(q.r)&&t.as.includes(ME)&&t.st!='Đã hoàn thành',el=PPL.filter(p=>!t.as.includes(p.n)&&(q.r=='Phó hiệu trưởng'||p.t==q.t)),add=can?`<div class="card"><h2>Thêm người thực hiện</h2><div class="sub" style="margin:2px 0 10px">${q.r=='Phó hiệu trưởng'?'Với vai trò Phó hiệu trưởng, bạn có thể thêm nhân sự bất kỳ.':'Với vai trò Tổ trưởng, bạn có thể thêm nhân sự trong '+esc(q.t)+'.'}</div>${el.length?`<select id="ap">${el.map(p=>`<option value="${esc(p.n)}">${esc(p.n)} · ${p.r}</option>`).join('')}</select> <button class="btn t" data-a="addp">Thêm vào nhiệm vụ</button>`:'<span class="sub">Không còn nhân sự phù hợp để thêm.</span>'}</div>`:'';
if(a){act=`${t.st=='Chờ duyệt'?`<p><b>Kết quả chờ duyệt.</b> Nhận xét (bắt buộc khi yêu cầu bổ sung):</p><textarea id="cm"></textarea><div style="margin-top:8px"><button class="btn t" data-a="approve">Duyệt hoàn thành</button> <button class="btn o" data-a="more">Yêu cầu bổ sung</button></div>`:''}
${t.ext?`<div class="card" style="margin:12px 0;background:var(--hi)"><b>${esc(t.ext.by)} xin gia hạn đến ${fd(t.ext.to)}</b><div class="sub">Lý do: ${esc(t.ext.reason)}</div><textarea id="ec" placeholder="Ý kiến (bắt buộc khi không đồng ý)" style="min-height:50px;margin-top:8px"></textarea><div style="margin-top:8px"><button class="btn t" data-a="exok">Đồng ý</button> <button class="btn" data-a="exno">Không đồng ý</button></div></div>`:''}
${t.st!='Đã hoàn thành'?`<div class="sub" style="margin-top:12px">Gia hạn trực tiếp đến ngày</div><input type="date" id="xd" min="${TD}"> <button class="btn o" data-a="xt">Gia hạn</button>`:''}
<div style="margin-top:12px"><button class="btn" data-a="edit">Sửa nhiệm vụ</button> <button class="btn" data-a="del" style="color:#d23b3b">Xóa</button></div>`}
else{const m=t.as.includes(ME);if(m&&t.st!='Đã hoàn thành'){const can=['Đang thực hiện','Yêu cầu bổ sung','Chờ duyệt'].includes(t.st)&&t.acc.includes(ME);
act=(!t.acc.includes(ME)?`<button class="btn t" data-a="acc">Xác nhận tiếp nhận</button> `:'')+`<button class="btn o" data-m="prog" ${t.acc.includes(ME)?'':'disabled'}>Báo cáo tiến độ</button> <button class="btn t" data-m="sub" ${can?'':'disabled'}>Nộp kết quả</button> <button class="btn" data-m="ext" ${t.ext||t.st=='Chờ duyệt'?'disabled':''}>Xin gia hạn</button>
<div class="sub" style="margin-top:8px">${t.ext?'Yêu cầu gia hạn đang chờ Hiệu trưởng xem xét.':t.st=='Chờ duyệt'?`Đã có kết quả được nộp (${esc(sub.by)}), đang chờ duyệt. Mọi thành viên đều có thể nộp thêm hoặc nộp lại.`:!t.acc.includes(ME)?'Hãy xác nhận tiếp nhận trước khi cập nhật tiến độ hoặc nộp kết quả.':'Cập nhật tiến độ không đồng nghĩa với hoàn thành. Việc hoàn thành do Hiệu trưởng xác nhận.'}</div>`}else act='<span class="sub">Nhiệm vụ đã hoàn thành, không còn thao tác.</span>'}
const fl=a=>a.map(f=>`<span class="file" data-a="dl" data-v="${esc(f)}">📎 ${esc(f)}</span>`).join('')||'<span class="sub">Không có</span>';
return `<div class="hd"><div><button class="btn" data-a="back">← Quay lại</button><h1 style="margin-top:12px">${esc(t.title)}</h1><div><span class="id">${t.id}</span> ${bds(t)}<span class="bd ${t.pri=='Cao'?'r':'a'}">Ưu tiên ${t.pri.toLowerCase()}</span></div></div></div>
<div class="dt"><div class="stk"><div class="card"><p style="margin-top:0">${esc(t.desc)}</p><div class="kv"><span>Người giao</span><span>Hiệu trưởng</span><span>Người thực hiện</span><span>${t.as.map(esc).join(', ')}</span><span>Đã tiếp nhận</span><span>${t.acc.map(esc).join(', ')||'Chưa có'}${pend&&t.acc.length?` (chưa: ${t.as.filter(x=>!t.acc.includes(x)).map(esc).join(', ')})`:''}</span><span>Cơ sở · Tổ</span><span>${t.cs} · ${t.to}</span><span>Ngày giao</span><span>${fd(t.made)}</span><span>Hạn hoàn thành</span><b class="${od(t)?'late':''}">${fd(t.due)}</b><span>Tài liệu giao</span><span>${fl(t.files)}</span></div></div>
<div class="card"><h2>Hành động</h2><div style="margin-top:10px">${act}</div></div>
${add}<div class="card"><h2>Tài liệu và kết quả đã nộp</h2>${t.subs.length?t.subs.map(s=>`<div class="hs"><small>${fd(s.at)} · ${esc(s.by)}</small>${esc(s.text)}<div>${fl(s.files)}</div></div>`).join(''):'<p class="sub">Chưa có lượt nộp nào.</p>'}${t.review?`<p class="sub">Nhận xét gần nhất: ${esc(t.review)}</p>`:''}</div>
<div class="card"><h2>Lịch sử</h2><div style="height:8px"></div>${[...t.hist.map(h=>[h[0],h[1]]),...t.prog.map(p=>[p.at,`${p.by} cập nhật tiến độ: ${p.done}. Kết quả: ${p.res}. Còn lại: ${p.left||'—'}`]),...t.extH.map(e=>[e.at,`Gia hạn: ${fd(e.old)} → ${fd(e.nw)} (${e.why}; duyệt: ${e.by})`])].sort((x,y)=>x[0]<y[0]?-1:1).map(h=>`<div class="hs"><small>${fd(h[0])}</small>${esc(h[1])}</div>`).join('')}</div></div>
<div class="card chat"><div style="padding:14px 14px 0"><h2>Trao đổi</h2><div class="sub">Gắn với ${t.id}, không thay đổi thời hạn chính thức</div></div><div class="msgs" id="ms">${t.chat.map(m=>`<div class="m ${m.f==(a?'Hiệu trưởng':ME)?'me2':''}"><small>${esc(m.f)} · ${m.at}</small>${esc(m.t)}</div>`).join('')||'<p class="sub">Chưa có tin nhắn. Hãy bắt đầu trao đổi.</p>'}</div><form class="cin" data-f="chat"><input name="t" placeholder="Nhập tin nhắn…" autocomplete="off"><button class="btn t">Gửi</button></form></div></div>`}
/* ---------- MODALS ---------- */
function modal(){const t=find(S.tid),fi='<label>Tải tệp minh chứng</label><input type="file" name="fl" multiple>';let h='';
if(S.m=='prog')h=`<h2>Cập nhật tiến độ</h2><div class="sub">${t.id} · ${esc(t.title)} · Người thực hiện: ${ME}</div><form class="fm" data-f="prog"><label>Công việc đã thực hiện</label><textarea name="done" required></textarea><label>Kết quả đạt được</label><textarea name="res" required></textarea><label>Công việc còn lại, khó khăn</label><textarea name="left"></textarea>${fi}<button class="btn t" style="width:100%;margin-top:14px">Gửi cập nhật</button></form>`;
if(S.m=='sub')h=`<h2>Nộp kết quả</h2><div class="sub">${t.id} · Mọi thành viên (${t.as.length} người) đều có quyền nộp như nhau</div><form class="fm" data-f="sub"><label>Báo cáo hoàn thành</label><textarea name="text" required></textarea>${fi.replace('minh chứng','sản phẩm')}<label>Ghi chú cho người kiểm tra</label><textarea name="nt" style="min-height:50px"></textarea><button class="btn t" style="width:100%;margin-top:14px">Xác nhận nộp</button></form>`;
if(S.m=='ext')h=`<h2>Xin gia hạn</h2><form class="fm" data-f="ext"><label>Thời hạn hiện tại</label><div>${fd(t.due)}</div><label>Thời hạn đề nghị mới</label><input type="date" name="to" min="${t.due}" required><label>Lý do đề nghị gia hạn</label><textarea name="why" required></textarea><button class="btn t" style="width:100%;margin-top:14px">Gửi đề nghị</button></form>`;
if(S.m=='edit')h=`<h2>Sửa nhiệm vụ</h2><form class="fm" data-f="edit"><label>Tên</label><input name="title" value="${esc(t.title)}" required><label>Nội dung</label><textarea name="desc">${esc(t.desc)}</textarea><label>Mức ưu tiên</label><select name="pri">${opt(['Thấp','Trung bình','Cao'],t.pri)}</select><label>Tài liệu giao cho nhiệm vụ</label><div id="efl">${efh()}</div><input type="file" name="fl" multiple style="margin-top:6px"><button class="btn t" style="width:100%;margin-top:14px">Lưu thay đổi</button></form>`;
if(S.m=='me'||S.m=='pe'){const q=PR[S.role],p=[q.n,q.y,q.ad,q.r,q.t,q.c],K=['Họ và tên','Năm sinh','Địa chỉ','Chức vụ','Tổ chuyên môn','Cơ sở'];
h=S.m=='me'?`<h2>Hồ sơ cá nhân</h2><div class="sub" style="margin-bottom:12px">Lấy từ tài khoản đã đăng ký với nhà trường.</div><div class="kv">${K.map((k,i)=>`<span>${k}</span><span>${esc(p[i])}</span>`).join('')}</div><button class="btn o" style="margin-top:12px;width:100%" data-m="pe">Chỉnh sửa thông tin</button>`
:`<h2>Chỉnh sửa hồ sơ</h2><form class="fm" data-f="pe"><label>Họ và tên</label><input name="n" value="${esc(q.n)}" required><div class="row"><div><label>Năm sinh</label><input name="y" type="number" min="1940" max="2010" value="${esc(q.y)}"></div><div><label>Chức vụ</label>${S.role=='a'?`<input name="r" value="${esc(q.r)}" required>`:`<select name="r" ${S.role=='a'?'':'disabled'}>${opt(['Giáo viên','Tổ trưởng chuyên môn','Phó hiệu trưởng','Nhân viên'],q.r)}</select>`}</div></div><label>Địa chỉ</label><input name="ad" value="${esc(q.ad)}"><div class="row"><div><label>Tổ chuyên môn</label><select name="t" ${S.role=='a'?'':'disabled'}>${opt(TO,q.t)}</select></div><div><label>Cơ sở</label><select name="c" ${S.role=='a'?'':'disabled'}>${opt(['Trường chính','Phân hiệu'],q.c)}</select></div></div>${S.role=='a'?'':'<div class="sub" style="margin-top:8px">Chức vụ, tổ chuyên môn và cơ sở do Hiệu trưởng cập nhật.</div>'}<button class="btn t" style="width:100%;margin-top:14px">Lưu hồ sơ</button></form>`}
return `<div class="ov" data-a="x"><div class="card md" role="dialog" aria-modal="true">${h}<button class="btn" style="margin-top:12px;width:100%" data-a="close">Đóng</button></div></div>`}
/* ---------- RENDER ---------- */
function draw(){const a=S.role=='a',p=S.page,u=a?{n:PR.a.n,r:PR.a.r}:{n:PR[S.role].n,r:PR[S.role].r+' · '+PR[S.role].t};let v;
if(S.tid)v=dtl();else v=a?{ov:aOv,cr:aCr,mo:aMo,dc:aDc,rp:aRp,nt}[p]():{ov:sOv,mo:sMo,dc:sDc,nt}[p]();
const sc=$('#ms')?.scrollTop;
$('#root').innerHTML=`<div class="app"><aside class="sb"><div class="logo"><i><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/></svg></i>THCS NGÔ MÂY</div>${nav()}<div class="help"><b>Cần hỗ trợ?</b><div style="margin:4px 0">Xem hướng dẫn sử dụng hệ thống quản lý nhiệm vụ.</div></div><button class="me" data-m="me"><span class="av">${ini(u.n)}</span><span style="flex:1"><b>${u.n}</b><small>${u.r}</small></span>›</button></aside>
<div class="mn"><div class="top"><span>🔍</span><input id="gs" placeholder="Tìm mã nhiệm vụ, văn bản, người thực hiện…" value=""><span class="sub who">${esc(u.r)}</span><button class="btn" data-a="logout">Đăng xuất</button><button class="ibtn" data-a="go" data-p="nt" aria-label="Thông báo">🔔${nl(rk()).some(n=>n.n)?'<b></b>':''}</button></div><main>${v}</main></div></div>${S.m?modal():''}`;
if(a&&p=='cr'&&!S.tid)paintPick();const m=$('#ms');if(m)m.scrollTop=sc??m.scrollHeight}
function toast(x){const e=document.createElement('div');e.className='tst';e.textContent=x;document.body.append(e);setTimeout(()=>e.remove(),2200)}
const go=(p,t)=>{if(S.page=='nt'&&p!='nt')markRead();S.page=p;S.tid=t||null;S.m=null;S.err='';scrollTo(0,0);draw();if(p!='cr')refreshSoon()};
// Mỗi khi chuyển trang, lấy dữ liệu mới nhất ở nền rồi vẽ lại (trừ khi người dùng đang nhập liệu).
let lastList=Date.now();
// dirty(): người dùng đang nhập hoặc đã chọn tệp trong biểu mẫu thì không vẽ lại, tránh mất dữ liệu đang nhập.
function dirty(){const m=document.querySelector('main');if(!m)return false;if(document.activeElement?.matches?.('input,textarea,select'))return true;
 return [...m.querySelectorAll('form[data-f] input[type=file]')].some(i=>i.files.length)||[...m.querySelectorAll('form[data-f] textarea,form[data-f] input:not([type=file]):not([type=search])')].some(i=>i.value&&i.value!==i.defaultValue)}
function refreshSoon(){if(busy||Date.now()-lastList<(CONFIG.NAV_REFRESH_MS??15000))return;load().then(()=>{if(!S.m&&!busy&&S.page!='cr'&&!dirty())draw()}).catch(e=>{if(e.code=='AUTH')logout(true)})}
const efh=()=>S.ef.map(f=>`<span class="chip">${esc(f)}<button type="button" data-a="rmf" data-v="${esc(f)}" aria-label="Xóa ${esc(f)}">✕</button></span>`).join('')||'<span class="sub">Chưa có tài liệu</span>';
const rl=()=>{const r=S.rf;return T.filter(t=>(!r.a||t.made>=r.a)&&(!r.b||t.made<=r.b)&&(!r.who||t.as.includes(r.who))&&(!r.to||t.to==r.to)&&(!r.cs||t.cs==r.cs)&&(!r.st||(r.st=='Quá hạn'?od(t):t.st==r.st)))};
function mkpdf(J){const en=new TextEncoder(),parts=[],off=[];let len=0;const add=v=>{const u=typeof v=='string'?en.encode(v):v;parts.push(u);len+=u.length},N=J.length;
add('%PDF-1.4\n');off[1]=len;add('1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n');off[2]=len;add(`2 0 obj\n<</Type/Pages/Count ${N}/Kids[${J.map((_,i)=>(3+3*i)+' 0 R').join(' ')}]>>\nendobj\n`);
J.forEach((j,i)=>{const p=3+3*i,c=p+1,m=p+2,ct='q 595 0 0 842 0 0 cm /Im0 Do Q';off[p]=len;add(`${p} 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</XObject<</Im0 ${m} 0 R>>>>/Contents ${c} 0 R>>\nendobj\n`);off[c]=len;add(`${c} 0 obj\n<</Length ${ct.length}>>\nstream\n${ct}\nendstream\nendobj\n`);off[m]=len;add(`${m} 0 obj\n<</Type/XObject/Subtype/Image/Width ${j.w}/Height ${j.h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${j.b.length}>>\nstream\n`);add(j.b);add('\nendstream\nendobj\n')});
const xr=len,n=3+3*N;add(`xref\n0 ${n}\n0000000000 65535 f \n`);for(let i=1;i<n;i++)add(String(off[i]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<</Size ${n}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF`);return new Blob(parts,{type:'application/pdf'})}
async function exportPdf(){try{await document.fonts.load('700 20px Manrope')}catch{}
const r=S.rf,L=rl(),W=1240,H=1754,P=80,pg=[];let c,x,y;const F=(w,z)=>`${w} ${z}px Manrope,"Segoe UI",Arial,sans-serif`;
const np=()=>{c=document.createElement('canvas');c.width=W;c.height=H;x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,W,H);x.textBaseline='top';pg.push(c);y=P};
const tx=(t,px,py,f,col,al)=>{x.font=f;x.fillStyle=col||'#0f2340';x.textAlign=al||'left';x.fillText(t,px,py)};
const cut=(t,w,f)=>{x.font=f;if(x.measureText(t).width<=w)return t;while(t.length&&x.measureText(t+'…').width>w)t=t.slice(0,-1);return t+'…'};
const sec=t=>{if(y+90>H-P)np();y+=10;tx(t,P,y,F(800,26),'#12376b');y+=44};
const bar=(l,v)=>{if(y+50>H-P)np();tx(l+' · '+v[0]+'/'+v[1]+' hoàn thành',P,y,F(600,19));y+=28;x.fillStyle='#e6eaf0';x.fillRect(P,y,W-2*P,12);x.fillStyle='#0f6b68';x.fillRect(P,y,v[1]?(W-2*P)*v[0]/v[1]:0,12);y+=26};
const hd=()=>{x.fillStyle='#eef3fa';x.fillRect(P,y,W-2*P,38);[['MÃ',P+10],['NHIỆM VỤ',200],['NGƯỜI THỰC HIỆN',650],['TRẠNG THÁI',890],['HẠN',1070]].forEach(([t,px])=>tx(t,px,y+9,F(700,15),'#6b7a90'));y+=44};
np();tx('THCS NGÔ MÂY',P,y,F(800,26),'#12376b');y+=36;tx('BÁO CÁO THỐNG KÊ NHIỆM VỤ',P,y,F(800,40));y+=56;
tx('Ngày lập: '+fd(TD)+' · Người lập: '+PR.a.n+' ('+PR.a.r+')',P,y,F(500,20),'#6b7a90');y+=30;
const fl=[r.a&&'Từ '+fd(r.a),r.b&&'đến '+fd(r.b),r.who,r.to,r.cs,r.st].filter(Boolean);tx('Bộ lọc: '+(fl.join(' · ')||'Không áp dụng')+' · Tổng: '+L.length+' nhiệm vụ',P,y,F(500,20),'#6b7a90');y+=50;
const bx=[['Chưa tiếp nhận','#6b7a90'],['Đang thực hiện','#2f6fb5'],['Chờ duyệt','#b7791f'],['Yêu cầu bổ sung','#7c4dcc'],['Đã hoàn thành','#1f9d63'],['Quá hạn','#d23b3b']],bw=(W-2*P-80)/6;
bx.forEach(([t,col],i)=>{const q=P+i*(bw+16);x.strokeStyle='#e6eaf0';x.lineWidth=2;x.strokeRect(q,y,bw,100);x.fillStyle=col;x.fillRect(q,y,6,100);tx(String(L.filter(k=>t=='Quá hạn'?od(k):k.st==t).length),q+20,y+10,F(800,38),col);tx(t,q+20,y+64,F(600,16),'#6b7a90')});y+=130;
sec('Tiến độ theo tổ chuyên môn');TO.forEach(t=>bar(t,cnt(L,'to',t)));sec('Tiến độ theo cơ sở');['Trường chính','Phân hiệu'].forEach(t=>bar(t,cnt(L,'cs',t)));
sec('Theo người thực hiện');PPL.filter(p=>L.some(t=>t.as.includes(p.n))).forEach(p=>bar(p.n,[L.filter(t=>t.as.includes(p.n)&&t.st=='Đã hoàn thành').length,L.filter(t=>t.as.includes(p.n)).length]));
sec('Danh sách nhiệm vụ');if(y+90>H-P)np();hd();if(!L.length)tx('Không có nhiệm vụ phù hợp bộ lọc.',P,y,F(500,18),'#6b7a90');
L.forEach(t=>{if(y+44>H-P){np();hd()}tx(t.id,P+10,y,F(700,17),'#2f6fb5');tx(cut(t.title,430,F(600,18)),200,y,F(600,18));tx(cut(t.as.join(', '),225,F(500,17)),650,y,F(500,17));tx(t.st+(od(t)?' · Quá hạn':''),890,y,F(600,17),od(t)?'#d23b3b':'#0f2340');tx(fd(t.due),1070,y,F(500,17));x.fillStyle='#e6eaf0';x.fillRect(P,y+34,W-2*P,1);y+=44});
pg.forEach((k,i)=>{const g=k.getContext('2d');g.textBaseline='top';g.font=F(500,16);g.fillStyle='#6b7a90';g.textAlign='center';g.fillText(`Trang ${i+1}/${pg.length}`,W/2,H-50)});
const J=pg.map(k=>{const b=atob(k.toDataURL('image/jpeg',.9).split(',')[1]),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return{b:u,w:W,h:H}});
saveFile('thong-ke-nhiem-vu-'+TD+'.pdf',mkpdf(J))}
/* ---------- TẢI DỮ LIỆU ---------- */
// loadSeq: nếu có nhiều lần tải chạy song song, chỉ lần gọi MỚI NHẤT được áp dụng (tránh dữ liệu cũ ghi đè dữ liệu mới).
let loadSeq=0;
function applyState(d){TD=d.today;ME=d.me.n;PR.a=PR.s=PR.l=d.me;S.role={admin:'a',staff:'s',leader:'l'}[d.me.role];
 T=d.tasks;D=d.docs;N=d.notifs;PPL=d.people;TAGS=d.tags;CONFIG.MAX_FILE_MB=d.maxFileMB||CONFIG.MAX_FILE_MB;lastList=Date.now()}
async function load(){const my=++loadSeq;const d=await API.call('bootstrap');if(my!==loadSeq)return;applyState(d)}
function markRead(){N.forEach(n=>n.n=0);API.call('readNotifs').catch(()=>{})}
const OK_EXT=/\.(pdf|docx|xlsx|pptx|png|jpe?g|mp4|csv|txt)$/i;
async function readFiles(list){const out=[];for(const f of list){
 if(!OK_EXT.test(f.name))throw new Error('Định dạng chưa được hỗ trợ: '+f.name+'. Hãy dùng PDF, DOCX, XLSX, PPTX, ảnh, MP4, CSV hoặc TXT.');
 if(f.size>CONFIG.MAX_FILE_MB*1048576)throw new Error('Tệp '+f.name+' vượt quá '+CONFIG.MAX_FILE_MB+' MB');
 const u=new Uint8Array(await f.arrayBuffer());let bin='';for(let i=0;i<u.length;i+=0x8000)bin+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
 out.push({name:f.name,mime:f.type||'application/octet-stream',data:btoa(bin)})}return out}
function b64blob(b64,mime){const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:mime})}
function saveFile(name,data){const b=data instanceof Blob?data:new Blob([data]),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);toast('Đã lưu '+name)}
async function dlDoc(id){try{toast('Đang tải…');const f=await API.call('downloadDoc',{docId:id});saveFile(f.name,b64blob(f.data,f.mime))}catch(e){toast(e.message)}}
async function dlTask(t,name){try{const fid=t?.fmap?.[name];if(!fid)return;toast('Đang tải…');const f=await API.call('downloadTaskFile',{fileId:fid});saveFile(name,b64blob(f.data,f.mime))}catch(e){toast(e.message)}}

/* ---------- SỰ KIỆN ---------- */
let busy=false;
// act: gửi một thao tác ghi lên backend, tải lại dữ liệu, thông báo kết quả và vẽ lại.
async function act(action,payload,okMsg,done){if(busy)return;busy=true;document.body.style.cursor='progress';document.body.classList.add('busy');
 try{const {data:r,state}=await API.callR(action,payload);if(state){++loadSeq;applyState(state)}else await load();if(okMsg)toast(okMsg);S.m=null;S.err='';if(done)done(r);else draw();return r}
 catch(e){if(e.code=='AUTH')return logout(true);toast(e.message||'Có lỗi xảy ra, vui lòng thử lại')}
 finally{busy=false;document.body.style.cursor='';document.body.classList.remove('busy')}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-a],[data-m]');if(!b)return;const a=b.dataset.a,t=S.tid&&find(S.tid),v=b.dataset.v,id=t&&t.id;
if(b.dataset.m){S.m=b.dataset.m;return draw()}
if(a=='x'){if(e.target!=b)return;S.m=null;return draw()}if(a=='close'){S.m=null;return draw()}
if(a=='go')return go(b.dataset.p);if(a=='open')return go(S.page=='nt'||S.page=='ov'?'mo':S.page,b.dataset.id);if(a=='back')return go(S.page);
if(a=='go-mo'){S.f={q:'',st:'',cs:'',to:'',who:''};return go('mo')}
if(a?.startsWith('f-')){S.f={q:'',st:a.slice(2),cs:'',to:'',who:''};return go('mo')}
if(a=='tab'){S.tab=v;return draw()}
if(a=='logout')return logout();
if(a=='pick'){S.pick.push(v);$('#ps').value='';return paintPick()}if(a=='unpick'){S.pick=S.pick.filter(x=>x!=v);return paintPick()}
if(a=='dl')return dlTask(t,v);
if(a=='acc')return act('acceptTask',{id},'Đã tiếp nhận nhiệm vụ');
if(a=='approve')return act('approveTask',{id},'Đã duyệt hoàn thành');
if(a=='more'){const c=$('#cm').value.trim();if(!c)return toast('Hãy nhập nhận xét trước khi yêu cầu bổ sung');return act('requestMore',{id,comment:c},'Đã gửi yêu cầu bổ sung')}
if(a=='exok')return act('decideExt',{id,ok:true},'Đã đồng ý gia hạn');
if(a=='exno'){const c=$('#ec').value.trim();if(!c)return toast('Hãy nhập ý kiến khi không đồng ý');return act('decideExt',{id,ok:false,note:c},'Đã từ chối, thời hạn giữ nguyên')}
if(a=='xt'){const d=$('#xd').value;if(!d||d<=t.due)return toast('Hãy chọn ngày mới sau thời hạn hiện tại');return act('extendTask',{id,date:d},'Đã gia hạn')}
if(a=='addp'){const n=$('#ap')?.value,p=PPL.find(x=>x.n==n);if(!p)return;return act('addAssignee',{id,userId:p.id},'Đã thêm '+n)}
if(a=='ddl')return dlDoc(b.dataset.id);if(a=='pdf')return exportPdf();
if(a=='ddel'){const d=D.find(x=>x.id==b.dataset.id);if(!confirm('Xóa văn bản '+d.id+' ('+d.n+')? Thao tác này không thể hoàn tác.'))return;return act('deleteDoc',{docId:d.id},'Đã xóa '+d.id)}
if(a=='edit'){S.m='edit';S.ef=[...t.files];return draw()}
if(a=='rmf'){S.ef=S.ef.filter(x=>x!=v);$('#efl').innerHTML=efh();return}
if(a=='tren'){const n=(prompt('Đổi tên thẻ “'+v+'”',v)||'').trim();if(!n||n==v)return;return act('renameTag',{old:v,nw:n},'Đã đổi tên thẻ')}
if(a=='tdel'){if(!confirm('Xóa thẻ “'+v+'”? Văn bản đang dùng thẻ này sẽ chuyển về “Chưa phân loại”.'))return;return act('deleteTag',{name:v},'Đã xóa thẻ')}
if(a=='del'){if(!confirm('Xóa nhiệm vụ '+id+'? Thao tác này không thể hoàn tác.'))return;return act('deleteTask',{id},'Đã xóa '+id,()=>go('mo'))}
draw()});
document.addEventListener('change',e=>{const el=e.target,w=el.closest('[data-f2]'),r=el.closest('[data-f3]');
if(w){S.f[el.dataset.k]=el.value;draw();$('[data-f2] [data-k=q]')?.focus()}if(r){S.rf[el.dataset.k]=el.value;draw()}
if(el.dataset.a=='kind')return act('setDocTag',{docId:el.dataset.id,tag:el.value},'Đã phân loại và đánh dấu đã xem xét');
if(el.closest('#cf')&&el.id!='ps')paintPick()});
document.addEventListener('input',e=>{const el=e.target;if(el.id=='ps')paintPick();if(el.closest('[data-f2]')&&el.dataset.k=='q'){S.f.q=el.value;const c=el.selectionStart;draw();const n=$('[data-f2] [data-k=q]');n.focus();n.setSelectionRange(c,c)}});
document.addEventListener('keydown',e=>{if(e.key=='Enter'&&e.target.id=='gs'){S.f={q:e.target.value,st:'',cs:'',to:'',who:''};go('mo')}if(e.key=='Escape'&&S.m){S.m=null;draw()}if(e.key=='Enter'&&e.target.dataset.a=='open')e.target.click()});
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,k=f.dataset.f,F=Object.fromEntries(new FormData(f)),t=S.tid&&find(S.tid),id=t&&t.id;
let fl=[];try{fl=await readFiles(f.fl?.files||[])}catch(x){return toast(x.message)}
if(k=='chat'){const x=(F.t||'').trim();if(!x)return;return act('sendMsg',{id,text:x})}
if(k=='create'){if(!S.pick.length)return toast('Hãy chọn ít nhất một người được giao.');const ids=S.pick.map(n=>PPL.find(p=>p.n==n)?.id).filter(Boolean);
 return act('createTask',{title:F.title,desc:F.desc,pri:F.pri,cs:F.cs,to:F.to,kind:F.kind,due:F.due,assignees:ids,files:fl},'Đã giao nhiệm vụ',r=>{S.pick=[];go('mo',r.id)})}
if(k=='doc'){if(!fl.length)return toast('Hãy chọn một tệp');return act('uploadDoc',{...fl[0]},null,r=>{toast('Đã tải lên, mã '+r.id);draw()})}
if(k=='prog')return act('progress',{id,done:F.done,res:F.res,left:F.left,files:fl},'Đã gửi cập nhật');
if(k=='sub')return act('submitTask',{id,text:F.text,note:F.nt,files:fl},'Đã nộp, chờ Hiệu trưởng duyệt');
if(k=='ext'){if(F.to<=t.due)return toast('Thời hạn mới phải sau thời hạn hiện tại');return act('requestExt',{id,to:F.to,why:F.why},'Đã gửi đề nghị gia hạn')}
if(k=='edit')return act('editTask',{id,title:F.title,desc:F.desc,pri:F.pri,keep:S.ef,files:fl},'Đã lưu');
if(k=='pe')return act('updateProfile',{n:F.n,y:F.y,ad:F.ad,r:F.r,t:F.t,c:F.c},'Đã lưu hồ sơ');
if(k=='tag')return act('addTag',{name:F.g},'Đã thêm thẻ')});

/* ---------- ĐĂNG NHẬP / ĐĂNG XUẤT / LÀM MỚI ---------- */
function logout(expired){sessionStorage.removeItem('tok');try{google.accounts.id.disableAutoSelect()}catch{}
 if(expired)sessionStorage.setItem('msg','Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');location.reload()}
function showLogin(){$('#root').innerHTML='';$('#login').hidden=false;const m=sessionStorage.getItem('msg');if(m){setMsg(m);sessionStorage.removeItem('msg')}
 const t=setInterval(()=>{if(window.google?.accounts?.id){clearInterval(t);
  google.accounts.id.initialize({client_id:CONFIG.GOOGLE_CLIENT_ID,callback:onCred,auto_select:false});
  google.accounts.id.renderButton($('#gbtn'),{theme:'outline',size:'large',text:'signin_with',width:280,locale:'vi'})}},150)}
function setMsg(x,err){const e=$('#lmsg');e.textContent=x;e.className=err?'err':'sub'}
async function onCred(resp){document.body.classList.add('busy');try{setMsg('Đang kiểm tra tài khoản…');const {data,state}=await API.callR('login',{idToken:resp.credential});sessionStorage.setItem('tok',data.token);
 if(state){applyState(state);$('#login').hidden=true;S.page='ov';draw()}else await boot()}catch(e){setMsg(e.message,true)}finally{document.body.classList.remove('busy')}}
async function boot(){document.body.classList.add('busy');$('#login').hidden=true;$('#root').innerHTML='<div class="boot" role="status">Đang tải dữ liệu…</div>';try{await load();S.page='ov';draw()}catch(e){if(e.code=='AUTH'){sessionStorage.removeItem('tok');showLogin()}else{showLogin();setMsg(e.message||'Không kết nối được máy chủ, vui lòng thử lại.',true)}} finally{document.body.classList.remove('busy')}}
function keepChat(fn){const i=document.querySelector('.cin input'),v=i?.value,had=document.activeElement===i;fn();const n=document.querySelector('.cin input');if(n&&v){n.value=v;if(had)n.focus()}}
// Làm mới định kỳ (Apps Script không có kết nối thời gian thực nên hỏi lại máy chủ)
setInterval(async()=>{if(document.hidden||busy||S.m||!sessionStorage.getItem('tok'))return;
 try{const el=document.activeElement;
  if(S.tid){const nt=await API.call('getTask',{id:S.tid}),i=T.findIndex(x=>x.id==S.tid);if(nt&&i>=0&&JSON.stringify(T[i])!==JSON.stringify(nt)){T[i]=nt;keepChat(draw)}}
  else if(S.page!='cr'&&Date.now()-lastList>(CONFIG.POLL_LIST_MS||45000)&&!dirty()){lastList=Date.now();await load();draw()}}
 catch(e){if(e.code=='AUTH')logout(true)}},CONFIG.POLL_DETAIL_MS);
window.addEventListener('load',()=>{if(sessionStorage.getItem('tok'))boot();else{API.warm();showLogin()}});
