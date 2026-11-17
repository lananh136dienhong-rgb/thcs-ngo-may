/**
 * hoso.js – SỔ CÔNG VĂN ĐẾN (hồ sơ công văn → tệp thành phần), nạp sau app.js
 *  - Văn thư (secretary) và Hiệu trưởng: Tiếp nhận hồ sơ, thêm/sửa/xóa tệp thành phần. Chỉ Hiệu trưởng xóa hẳn hồ sơ.
 *  - Leader được Hiệu trưởng cấp quyền tiếp nhận (mục Cài đặt): xem Sổ công văn đến, nhận phụ trách, giao việc.
 *  - Hiệu trưởng: Cài đặt (loại văn bản, cơ quan ban hành, lĩnh vực, người được tiếp nhận hồ sơ), đổi người phụ trách.
 * Mỗi tệp thành phần là một văn bản trong Kho văn bản (mã VB-...), dữ liệu lấy từ biến D của app.js (d.hs = mã hồ sơ).
 */
let HS=[],LVS=[],RCV=[],RCVME=0;
const PEND='Chờ AI đọc',HSST=[PEND,'Chờ xác nhận','Đang thực hiện','Đã giao việc'],HSC={[PEND]:'p','Chờ xác nhận':'a','Đang thực hiện':'b','Đã giao việc':'ok'};
const HSR={main:['Văn bản chính','b'],att:['Phụ lục','g']},HEXT={pdf:'#d23b3b',docx:'#2f6fb5',doc:'#2f6fb5',xlsx:'#1f9d63',xls:'#1f9d63',pptx:'#c4511f'};
Object.assign(S,{hs:null,hsBack:null,hsa:false,hed:null,hf:{q:'',st:'',lv:'',ld:''},hmf:{st:''},hn:{idest:'',so:'',ty:'',lv:''}});
const isSec=()=>S.role=='s'&&PR.s?.role=='secretary',clerk=()=>isA()||isSec(),rcvMe=()=>isL()&&!!RCVME,hsSee=()=>isA()||isSec()||rcvMe();
const hsBy=id=>HS.find(h=>h.id==id),hsFiles=id=>D.filter(d=>d.hs==id).sort((a,b)=>(a.hr=='main'?-1:b.hr=='main'?1:a.id<b.id?-1:1));
const hsMain=id=>hsFiles(id).find(d=>d.hr=='main'),hsDraft=()=>D.filter(d=>d.hs=='NHAP'&&d.mine).sort((a,b)=>a.id<b.id?-1:1);
const ikey=s=>String(s||'').normalize('NFC').toUpperCase().replace(/\s+/g,'');
const hsExt=n=>(String(n).split('.').pop()||'').toLowerCase();
// Giá trị hiện tại của tệp: đã sửa tay thì lấy giá trị đã sửa, chưa thì lấy gợi ý AI
const fval=d=>{const r=d.ai?.r||{};return{role:d.hr||'att',num:d.no||r.num||'',date:d.dd||r.date||'',ag:d.ag||r.ag||'',k:d.k||r.k||'',sum:d.sm||r.sum||''}};
const aiBusy=d=>RUN.has(d.id)||['queued','reading'].includes(d.ai?.st);
const hsPath=v=>{const g=AGS.find(x=>x.c==v.ag);return g&&v.k?`Drive › <b>${esc(g.f)}</b> › <b>${esc(TF[v.k]||v.k)}</b>`:'<span style="color:#b7791f">Chưa đủ cơ quan ban hành và loại văn bản</span>'};
// Hồ sơ đã lưu (Chờ AI đọc): tiến độ AI và trích yếu tạm lấy từ văn bản chính
const hsProg=id=>{const F=hsFiles(id);return{n:F.length,busy:F.filter(aiBusy).length}};
const hsTy=h=>h.ty||(()=>{const m=hsMain(h.id);return m?fval(m).sum:''})()||'(Chưa có trích yếu)';
const hsLead=h=>h.ldn?esc(h.ldn):'<span class="sub">Chưa có</span>';

/* ---------- SỔ CÔNG VĂN ĐẾN ---------- */
const HG='grid-template-columns:108px 52px 86px minmax(118px,1fr) minmax(170px,1.9fr) 58px minmax(96px,.9fr) minmax(110px,1fr) 108px;gap:10px;min-width:980px';
function hsRows(L){return `<div class="tr h" style="${HG}"><span>MÃ HỒ SƠ</span><span>SỐ ĐẾN</span><span>NGÀY TẢI LÊN</span><span>SỐ/KÝ HIỆU IDEST</span><span>TRÍCH YẾU NỘI DUNG</span><span>TỆP</span><span>LĨNH VỰC</span><span>NGƯỜI PHỤ TRÁCH</span><span>TRẠNG THÁI</span></div>`
 +(L.map(h=>`<div class="tr" style="${HG};align-items:start" tabindex="0" data-a="hsopen" data-id="${esc(h.id)}"><span class="id" style="font-size:12px">${esc(h.id)}</span><span>${esc(h.so)}</span><span>${fd(h.up)}</span><b style="overflow-wrap:anywhere">${esc(h.idest)}</b><span class="clamp3">${esc(hsTy(h))}</span><span><span class="bd b">${hsFiles(h.id).length} tệp</span></span><span>${h.lv?esc(h.lv):'<span class="sub">Chưa phân loại</span>'}</span><span>${hsLead(h)}</span><span><span class="bd ${HSC[h.st]}">${esc(h.st)}</span>${h.st==PEND?(p=>`<div class="sub" style="margin-top:4px">${p.busy?`AI đã đọc ${p.n-p.busy}/${p.n} tệp`:'Chờ văn thư xác nhận'}</div>`)(hsProg(h.id)):''}</span></div>`).join('')||'<p class="sub" style="padding:20px">Không có hồ sơ phù hợp bộ lọc.</p>')}
const hsLeaders=()=>[...new Set([...RCV.map(x=>x.n),...HS.map(h=>h.ldn).filter(Boolean)])];
function hsFilter(){const f=S.hf,q=nrm(f.q).trim();return HS.filter(h=>(!q||nrm([h.id,h.idest,h.ty,h.so].join(' ')).includes(q))&&(!f.st||h.st==f.st)&&(!f.lv||(f.lv=='_'?!h.lv:h.lv==f.lv))&&(!f.ld||(f.ld=='_'?!h.ld:h.ldn==f.ld)))}
function hsSo(){const f=S.hf,L=hsFilter(),c=s=>HS.filter(h=>h.st==s).length;
return `<div class="hd"><div><h1>Danh sách công văn</h1><div class="sub">Mỗi dòng là một hồ sơ (một lần nhận công văn trên Idest); một số Idest chỉ có một hồ sơ. Bấm vào dòng để xem các tệp thành phần.</div></div>${clerk()?'<button class="btn p" data-a="go" data-p="tn">+ Tải công văn</button>':''}</div>
<div class="g4">${clerk()?stat('p',c(PEND),PEND,'Đã lưu, chưa xác nhận','hsf-'+PEND):''}${stat('a',c('Chờ xác nhận'),'Chờ xác nhận','Chưa có người phụ trách','hsf-Chờ xác nhận')}${stat('b',c('Đang thực hiện'),'Đang thực hiện','Người phụ trách đã nhận','hsf-Đang thực hiện')}${stat('ok',c('Đã giao việc'),'Đã giao việc','Đã có nhiệm vụ','hsf-Đã giao việc')}</div>
<div class="fl" data-f6><input data-k="q" type="search" placeholder="Tìm mã hồ sơ, số Idest, trích yếu, số đến" value="${esc(f.q)}" style="min-width:260px"><select data-k="st">${opt(clerk()?HSST:HSST.slice(1),f.st,'Mọi trạng thái')}</select><select data-k="lv"><option value="">Mọi lĩnh vực</option>${LVS.map(x=>`<option ${x==f.lv?'selected':''}>${esc(x)}</option>`).join('')}<option value="_" ${f.lv=='_'?'selected':''}>Chưa phân loại</option></select><select data-k="ld"><option value="">Mọi người phụ trách</option><option value="_" ${f.ld=='_'?'selected':''}>Chưa có người phụ trách</option>${hsLeaders().map(x=>`<option ${x==f.ld?'selected':''}>${esc(x)}</option>`).join('')}</select>${f.q||f.st||f.lv||f.ld?'<button class="btn" data-a="hsclr">Xóa bộ lọc</button>':''}</div>
<div class="sub" style="margin:0 0 8px" id="hsc">${L.length==HS.length?HS.length+' hồ sơ':L.length+' / '+HS.length+' hồ sơ'}</div><div class="card sc" id="hsl">${hsRows(L)}</div>`}
function hsMine(){const me=myId(),all=HS.filter(h=>h.ld==me),L=all.filter(h=>!S.hmf.st||h.st==S.hmf.st);
return `<h1>Công văn tôi phụ trách</h1><p class="sub">Tìm và nhận hồ sơ mới ở mục Danh sách công văn (lọc theo lĩnh vực của bạn).</p>
<div class="fl" data-f7><select data-k="st">${opt(['Đang thực hiện','Đã giao việc'],S.hmf.st,'Mọi trạng thái')}</select><span class="sub" style="align-self:center">${L.length==all.length?all.length+' hồ sơ':L.length+' / '+all.length+' hồ sơ'}</span></div>
<div class="card sc">${hsRows(L)}</div>`}

/* ---------- THẺ TỆP THÀNH PHẦN ---------- */
function hsCard(d,edit,mode){   // mode: 'draft' (đang tiếp nhận) | 'pend' (hồ sơ đã lưu, chờ xác nhận) | 'hs' (hồ sơ đã tạo)
 const v=fval(d),r=d.ai?.r,run=aiBusy(d),st=d.ai?.st,ed=edit&&S.hed==d.id,lo=r&&r.conf<75,role=HSR[v.role]||HSR.att;
 const mk=k=>r&&!run&&String(r[k]||'')!=String(v[k]||'')?' <span class="bd p" title="Đã sửa thủ công">sửa tay</span>':'';
 const miss=!run&&(!v.k||!v.ag||v.ag=='09'||!v.sum);
 const where=d.ok?`Mã văn bản <b>${esc(d.id)}</b> · đã lưu vào Kho văn bản`:mode!='hs'?`Mã văn bản <b>${esc(d.id)}</b> · vào kho khi ${mode=='draft'?'tạo':'xác nhận'} hồ sơ`:`Mã văn bản <b>${esc(d.id)}</b> · <span style="color:#b7791f">chưa vào kho</span>`;
 const aib=run?'<span class="aitag">✦ AI đang đọc…</span>':r?`<span class="bd ${r.conf>=80?'ok':r.conf>=60?'a':'r'}">AI ${r.conf}%</span>`:st=='failed'||st=='skipped'?'<span class="bd r">AI không đọc được</span>':'';
 const head=`<div class="fh"><div class="ext" style="background:${HEXT[hsExt(d.n)]||'#6b7a90'}">${esc(hsExt(d.n).toUpperCase().slice(0,4))}</div><div class="nm"><span class="flink" data-a="dldoc" data-v="${esc(d.id)}" data-g="${esc(d.g||'')}" data-dk="d:${esc(d.id)}" title="Bấm để tải xuống" style="font-weight:700">${esc(d.n)}</span><div class="sub" style="margin-top:4px">${where}</div></div>
<div class="fa"><span class="bd ${role[1]}">${role[0]}</span>${aib}${edit&&!ed&&!run?`<button class="btn" data-a="hsed" data-id="${esc(d.id)}" style="padding:4px 10px;font-size:12px">${d.ok||mode!='hs'?'Sửa':'Kiểm tra, đưa vào kho'}</button>`:''}${edit?`<button class="btn" data-a="hsrm" data-id="${esc(d.id)}" style="padding:4px 10px;font-size:12px;color:#d23b3b">Xóa</button>`:''}</div></div>`;
 if(run)return `<div class="fc">${head}<div class="sub" style="margin-top:10px">AI đang đọc riêng tệp này để trích xuất số/ký hiệu, ngày, cơ quan ban hành, loại và tóm tắt…</div></div>`;
 const body=ed?`<form class="ef fm" data-f="hsef" data-id="${esc(d.id)}"><div><label>Vai trò</label><select name="role">${Object.entries(HSR).map(([k,x])=>`<option value="${k}" ${k==v.role?'selected':''}>${x[0]}</option>`).join('')}</select></div><div><label>Số/ký hiệu</label><input name="num" value="${esc(v.num)}" placeholder="VD: 476/GM-UBND"></div><div><label>Ngày văn bản</label><input type="date" name="date" value="${esc(v.date)}"></div><div><label>Cơ quan ban hành</label><select name="ag" required><option value="">Chọn cơ quan ban hành</option>${AGS.map(x=>`<option value="${x.c}" ${x.c==v.ag?'selected':''}>${esc(x.n)}</option>`).join('')}</select></div><div><label>Loại văn bản</label><select name="k" required><option value="">Chọn loại văn bản</option>${TAGS.map(x=>`<option ${x==v.k?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="w"><label>Tóm tắt</label><textarea name="sum" style="min-height:64px">${esc(v.sum)}</textarea></div>
<div class="w sub" id="hp-${esc(d.id)}">Lưu trong kho tại: ${hsPath(v)}</div><div class="w" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn t">${!d.ok&&mode=='hs'?'Lưu và đưa vào kho':'Lưu'}</button><button type="button" class="btn" data-a="hsedc">Hủy</button>${r?`<button type="button" class="btn" data-a="hsedr" data-id="${esc(d.id)}">Khôi phục kết quả AI</button>`:''}</div></form>`
 :`<div class="aires"><span>Vai trò</span><span>${role[0]}</span><span>Số/ký hiệu</span><span><b>${esc(v.num)||'—'}</b>${mk('num')}</span><span>Ngày văn bản</span><span>${v.date?fd(v.date):'—'}${mk('date')}</span><span>Cơ quan ban hành</span><span>${v.ag?esc(AGN(v.ag)):'—'}${mk('ag')}</span><span>Loại văn bản</span><span>${esc(v.k)||'—'}${mk('k')}</span><span>Tóm tắt</span><span>${esc(v.sum)||'—'}${mk('sum')}</span><span>Lưu trong kho</span><span class="sub">${hsPath(v)}</span></div>
${(miss||lo||st=='failed'||st=='skipped')?`<div class="warn">${st=='failed'||st=='skipped'?esc(d.ai?.err||'AI không đọc được tệp này')+'.':lo?`AI chỉ chắc ${r.conf}%.`:'AI chưa trích xuất đủ thông tin.'} ${edit?`<button class="btn o" data-a="hsed" data-id="${esc(d.id)}" style="padding:3px 10px;font-size:12px">Nhập tay</button>`:'Văn thư hoặc Hiệu trưởng cần bổ sung.'}</div>`:''}`;
 return `<div class="fc ${v.role=='main'?'main':''}">${head}${body}</div>`}

/* ---------- CHI TIẾT HỒ SƠ ---------- */
function hsDtl(){const h=hsBy(S.hs);if(!h){S.hs=null;return hsSo()}
 if(S.hsa)return hsAssignForm(h);
 const F=hsFiles(h.id),m=F.find(d=>d.hr=='main'),mv=m?fval(m):{},ce=clerk(),me=myId(),mine=h.ld==me;
 const busy=F.filter(aiBusy).length,pend=h.st==PEND;
 const nv=h.nv.map(x=>find(x)?`<button class="btn" data-a="hsnv" data-id="${esc(x)}" style="padding:3px 10px;font-size:12px;color:var(--bt)">${esc(x)}</button>`:`<span class="bd g">${esc(x)}</span>`).join(' ');
 return `<button class="btn" data-a="hsback">← Quay lại</button><div class="hd" style="margin-top:12px"><div><span class="id">${esc(h.id)}</span> <span class="bd ${HSC[h.st]}">${esc(h.st)}</span><h1>${esc(hsTy(h))}</h1><div class="sub">Số đến ${esc(h.so)} · Ngày tải lên ${fd(h.up)} · Idest <b>${esc(h.idest)}</b>${h.by?' · Văn thư: '+esc(h.by):''}</div></div></div>
<div class="cols" style="grid-template-columns:minmax(0,1fr) 360px"><div class="card"><div class="hd" style="margin:0 0 10px;align-items:flex-start"><div><h2>Tệp thành phần (${F.length})</h2></div>${ce?`<label class="btn o" style="cursor:pointer;white-space:nowrap">+ Thêm tệp<input type="file" id="hsadd" data-id="${esc(h.id)}" multiple hidden></label>`:''}</div>
${busy?`<div class="sub" style="margin-bottom:10px">✦ AI đang đọc ${busy} tệp…</div>`:''}<div class="files">${F.map(d=>hsCard(d,ce,pend?'pend':'hs')).join('')||'<p class="sub">Hồ sơ chưa có tệp.</p>'}</div></div>
<div class="stk"><div class="card"><h2 style="margin-bottom:12px">Thông tin hồ sơ</h2><div class="kvh">
<span>Số đến</span><span><b>${esc(h.so)}</b></span><span>Số/ký hiệu Idest</span><span><b>${esc(h.idest)}</b>${m&&mv.num&&ikey(mv.num)!=ikey(h.idest)?`<br><span class="bd a">Văn bản chính ghi ${esc(mv.num)}</span>`:''}</span>
<span>Ngày văn bản</span><span>${mv.date?fd(mv.date):'—'}</span><span>Cơ quan</span><span>${mv.ag?esc(AGN(mv.ag)):'—'}</span>
<span>Lĩnh vực</span><span>${ce&&(isA()||h.st=='Chờ xác nhận'||pend)?`<select id="hslv" data-id="${esc(h.id)}" style="width:100%">${h.lv?'':'<option value="">Chưa phân loại</option>'}${LVS.map(x=>`<option ${x==h.lv?'selected':''}>${esc(x)}</option>`).join('')}</select>`:h.lv?esc(h.lv):'Chưa phân loại'}</span>
<span>Người phụ trách</span><span>${isA()&&!pend?`<select id="hsld" data-id="${esc(h.id)}" style="width:100%"><option value="">— Chưa có —</option>${RCV.filter(x=>x.on||x.id==h.ld).map(x=>`<option value="${esc(x.id)}" ${x.id==h.ld?'selected':''}>${esc(x.n)}</option>`).join('')}</select>`:hsLead(h)}</span>
<span>Trạng thái</span><span><span class="bd ${HSC[h.st]}">${esc(h.st)}</span>${h.nv.length?`<div style="margin-top:6px">Nhiệm vụ: ${nv}</div>`:''}</span></div>
${rcvMe()&&!h.ld?`<button class="btn t" style="width:100%;margin-top:14px" data-a="hstake" data-id="${esc(h.id)}">Nhận phụ trách hồ sơ</button><div class="sub" style="margin-top:6px">Mỗi hồ sơ chỉ do một người phụ trách. Ai nhận trước sẽ phụ trách.</div>`:''}
${rcvMe()&&h.ld&&!mine?`<div class="sub" style="margin-top:12px">Hồ sơ đã do ${esc(h.ldn)} phụ trách.</div>`:''}
${mine?`<button class="btn t" style="width:100%;margin-top:14px" data-a="hsasg" data-id="${esc(h.id)}">${h.nv.length?'Giao thêm nhiệm vụ':'Giao việc cho người thực hiện'}</button>`:''}
${isSec()&&!h.ld&&!pend?'<div class="sub" style="margin-top:12px">Đang chờ người được tiếp nhận hồ sơ nhận phụ trách.</div>':''}
${pend&&ce?hsConfirmBox(h,F):''}
${isA()?`<button class="btn" style="width:100%;margin-top:14px;color:#d23b3b;border-color:#d23b3b66" data-a="hsdel" data-id="${esc(h.id)}">Xóa hồ sơ</button>`:''}</div></div></div>`}
// Hồ sơ đã lưu: văn thư kiểm tra kết quả AI rồi xác nhận (tệp vào kho, người được tiếp nhận mới thấy hồ sơ)
function hsConfirmBox(h,F){const busy=F.filter(aiBusy).length,mains=F.filter(d=>d.hr=='main').length,lack=F.filter(d=>!d.ok&&!aiBusy(d)&&(()=>{const v=fval(d);return !v.k||!v.ag})()).length;
 const why=busy?`AI đang đọc ${busy} tệp, vui lòng chờ`:mains!=1?'Cần đúng một văn bản chính':lack?lack+' tệp chưa có loại văn bản hoặc cơ quan ban hành':!h.lv?'Chọn lĩnh vực':'';
 return `<div class="warn" style="margin-top:14px">Hồ sơ đã lưu nhưng chưa xác nhận: tệp chưa vào Kho văn bản và người được tiếp nhận chưa thấy hồ sơ này.</div><button class="btn t" style="width:100%;margin-top:12px" data-a="hsconfirm" data-id="${esc(h.id)}" ${why?'disabled':''}>Xác nhận và tạo hồ sơ</button>${why?`<div class="sub" style="margin-top:6px">${esc(why)}.</div>`:''}`}
// Giao việc: dùng lại biểu mẫu giao nhiệm vụ của app (nhiều người thực hiện, nội dung chi tiết, văn bản từ kho)
function hsAssignForm(h){return `<div class="hd"><div><button class="btn" data-a="hsasgx">← Quay lại hồ sơ</button><h1 style="margin-top:12px">Giao việc từ hồ sơ ${esc(h.id)}</h1></div></div>`+taskForm({f:'hsa',title:h.ty,btn:'Giao nhiệm vụ',
 top:`<div class="card" style="background:var(--hi);margin-bottom:12px"><b>${esc(h.idest)}</b> · ${esc(h.ty)}<div class="sub" style="margin-top:6px">Các tệp của hồ sơ đã được đính kèm sẵn. Bạn có thể tìm và thêm văn bản khác trong Kho văn bản, hoặc bỏ bớt tệp không cần.</div></div>`})}

/* ---------- TIẾP NHẬN HỒ SƠ ---------- */
function hsNew(){const n=S.hn,F=hsDraft(),dup=n.idest.trim()?HS.find(h=>ikey(h.idest)==ikey(n.idest)):null,mains=F.filter(d=>d.hr=='main').length,busy=F.filter(aiBusy).length;
 const nx=Math.max(0,...HS.map(h=>+h.so||0))+1,lack=F.filter(d=>{const v=fval(d);return !v.k||!v.ag}).length;
 const sok=/^\d{1,7}$/.test(String(n.so).trim());
 const whyS=!n.idest.trim()?'Nhập số/ký hiệu Idest':dup?'Số Idest đã tồn tại':!sok?'Nhập số đến (chỉ gồm chữ số)':!F.length?'Tải lên ít nhất một tệp':mains!=1?'Cần đúng một văn bản chính':'';
 const why=!n.idest.trim()?'Nhập số/ký hiệu Idest':dup?'Số Idest đã tồn tại':!sok?'Nhập số đến (chỉ gồm chữ số)':!F.length?'Tải lên ít nhất một tệp':busy?'Chờ AI đọc xong các tệp':mains!=1?'Cần đúng một văn bản chính':lack?lack+' tệp chưa có loại văn bản hoặc cơ quan ban hành':!n.lv?'Chọn lĩnh vực':'';
 return `<h1>Tải công văn</h1><p class="sub">Tải tất cả tệp của một công văn trong một lần. AI đọc riêng từng tệp; bạn kiểm tra, chỉnh nếu cần rồi bấm “Xác nhận và tạo hồ sơ”. Các tệp được lưu vào Kho văn bản ngay khi tạo hồ sơ. Không muốn chờ AI đọc thì bấm “Lưu” để giữ hồ sơ lại và tải công văn khác; khi AI đọc xong, mở hồ sơ trong Danh sách công văn để xác nhận.</p>
<div class="cols" style="grid-template-columns:minmax(0,1fr) 320px"><form class="card fm" data-f="hsnew" autocomplete="off"><div class="row"><div><label>Số/ký hiệu trên Idest</label><input name="idest" id="hsidest" value="${esc(n.idest)}" placeholder="Ví dụ: 6705/SGDĐT-GDTrH" required></div><div style="max-width:140px"><label>Số đến</label><input name="so" id="hsso" inputmode="numeric" autocomplete="off" value="${esc(n.so)}" placeholder="Số đến trên Idest" required></div><div style="max-width:170px"><label>Ngày tải lên</label><input value="${fd(TD)}" readonly title="Tự ghi theo ngày tải lên hệ thống" style="background:var(--hi);color:var(--mut)"></div></div>
<div id="hsdup">${dup?hsDupMsg(dup):''}</div>
<label>Trích yếu nội dung</label><input name="ty" value="${esc(n.ty)}" placeholder="Để trống thì lấy theo tóm tắt của văn bản chính">
<label>Lĩnh vực</label><select name="lv"><option value="">Chọn lĩnh vực</option>${LVS.map(x=>`<option ${x==n.lv?'selected':''}>${esc(x)}</option>`).join('')}</select>
<label>Tệp đính kèm (PDF, Word, Excel…, tối đa ${CONFIG.MAX_FILE_MB} MB mỗi tệp)</label><input type="file" id="hsfi" multiple style="width:100%"><div class="sub" style="margin-top:6px">${AIOK?'AI đọc từng tệp ngay sau khi tải lên.':'AI chưa được bật: hãy bấm “Sửa” ở từng tệp để nhập thông tin.'}</div></form>
<div class="card"><h2>Kiểm tra trước khi tạo</h2><div class="kvh" style="margin-top:10px"><span>Số Idest</span><span>${dup?'<span class="bd r">Trùng</span>':n.idest.trim()?'<span class="bd ok">Hợp lệ</span>':'—'}</span><span>Số tệp</span><span>${F.length}</span><span>Văn bản chính</span><span><span class="bd ${mains==1?'ok':mains?'r':'a'}">${mains}</span></span><span>AI đã đọc</span><span>${F.length-busy}/${F.length}</span></div>
<button class="btn t" style="width:100%;margin-top:16px" data-a="hscreate" ${why?'disabled':''}>Xác nhận và tạo hồ sơ</button><div class="sub" id="hswhy" style="margin-top:6px">${why?esc(why)+'.':''}</div>
<button class="btn o" style="width:100%;margin-top:12px" data-a="hssave" ${whyS?'disabled':''}>Lưu</button><div class="sub" style="margin-top:6px">${whyS?'':'Giữ hồ sơ ở trạng thái “Chờ AI đọc” để tải công văn khác; AI vẫn đọc tiếp.'}</div></div></div>
${F.length?`<div class="card" style="margin-top:14px"><h2>Tệp thành phần (${F.length})</h2><div class="sub" style="margin-bottom:10px">Kết quả AI của từng tệp. Bấm “Sửa” nếu AI trích xuất sai hoặc thiếu.</div><div class="files">${F.map(d=>hsCard(d,true,'draft')).join('')}</div></div>`:''}`}
const hsDupMsg=h=>`<div class="err" style="background:color-mix(in srgb,#d23b3b 10%,transparent);border:1px solid #d23b3b55;border-radius:10px;padding:10px 12px;font-size:13px">Số Idest <b>${esc(h.idest)}</b> đã có trong hồ sơ <button type="button" class="btn" data-a="hsopen" data-id="${esc(h.id)}" style="padding:2px 8px;font-size:12px">${esc(h.id)}</button> (số đến ${esc(h.so)}, tải lên ${fd(h.up)}). Không được tạo hồ sơ trùng số Idest. Nếu cấp trên gửi thêm tệp, hãy mở hồ sơ đó và bấm “+ Thêm tệp”.</div>`;

/* ---------- CÀI ĐẶT (chỉ Hiệu trưởng) ---------- */
function hsCfg(){const cand=NS.filter(x=>x.role=='leader'&&x.on&&!RCV.some(y=>y.id==x.id));
return `<h1>Cài đặt</h1><p class="sub">Chỉ Hiệu trưởng thấy mục này. Thay đổi áp dụng ngay cho Tải công văn, Danh sách công văn, Tải văn bản và Kho văn bản.</p><div class="cfg2">${tagCard()}
<div class="card"><h2>Lĩnh vực của hồ sơ</h2><div class="sub" style="margin-bottom:8px">Người được tiếp nhận hồ sơ lọc Danh sách công văn theo lĩnh vực để tìm hồ sơ. Xóa một lĩnh vực thì các hồ sơ đang thuộc lĩnh vực đó chuyển về “Chưa phân loại”.</div>${LVS.map(x=>`<span class="chip">${esc(x)}<button data-a="lvdel" data-v="${esc(x)}" aria-label="Xóa ${esc(x)}">✕</button></span>`).join('')}<form data-f="lv" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><input name="g" placeholder="Tên lĩnh vực mới" required style="min-width:260px"><button class="btn o">Thêm lĩnh vực</button></form></div>
<div class="card"><h2>Người được tiếp nhận hồ sơ</h2><div class="sub" style="margin-bottom:8px">Người trong danh sách này thấy “Danh sách công văn”, “Công văn tôi phụ trách” và được nhận phụ trách hồ sơ. Chỉ chọn được nhân sự có phân quyền Quản lý (đổi ở mục Nhân sự).</div>${RCV.map(x=>`<span class="chip">${esc(x.n)}${x.r?` <span class="sub" style="font-weight:500">· ${esc(x.r)}</span>`:''}${x.on?'':' <span class="bd g">không còn là Quản lý</span>'}<button data-a="rcvdel" data-v="${esc(x.id)}" aria-label="Bỏ ${esc(x.n)}">✕</button></span>`).join('')||'<span class="sub">Chưa có ai.</span>'}
<form data-f="rcv" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><select name="u" required style="min-width:260px"><option value="">${cand.length?'Chọn nhân sự…':'Không còn nhân sự Quản lý nào để thêm'}</option>${cand.map(x=>`<option value="${esc(x.id)}">${esc(x.n)} · ${esc(x.r)} · ${esc(x.t)}</option>`).join('')}</select><button class="btn o" ${cand.length?'':'disabled'}>Thêm người</button></form></div></div>`}

/* ---------- SỰ KIỆN ---------- */
function hsUpdList(){const l=$('#hsl'),c=$('#hsc');if(!l)return;const L=hsFilter();l.innerHTML=hsRows(L);c.textContent=L.length==HS.length?HS.length+' hồ sơ':L.length+' / '+HS.length+' hồ sơ'}
async function hsUpload(list,hsId){if(!list.length||busy)return;let fl;try{fl=await readFiles(list)}catch(x){return toast(x.message)}
 busy=true;document.body.classList.add('busy');const w=document.createElement('div');w.className='tst';document.body.append(w);let n=0;
 try{for(const f of fl){w.textContent=`Đang tải lên ${f.name} (${n+1}/${fl.length})… vui lòng chờ`;const r=await API.call('hsUploadFile',{...f,hsId:hsId||''});if(r.doc){D=D.filter(x=>x.id!=r.doc.id);D.unshift(r.doc)}AIOK=r.ai?1:0;n++}
  toast(`Đã tải lên ${n} tệp${AIOK?'. AI đang đọc từng tệp…':''}`)}
 catch(x){if(x.code=='AUTH')return logout(true);toast((n?`Đã tải ${n} tệp. `:'')+(x.message||'Tải lên không thành công'))}
 finally{w.remove();busy=false;document.body.classList.remove('busy');draw();kickAi()}}
function hsClick(a,b,e){const id=b.dataset.id,v=b.dataset.v;
 if(a=='hsopen'){e.stopPropagation();S.hs=id;S.hsa=false;S.hed=null;S.tid=null;S.m=null;scrollTo(0,0);draw();return true}
 if(a=='ovhsed'){S.hs=b.dataset.hs;S.hed=id;S.hsa=false;S.tid=null;scrollTo(0,0);draw();return true}
 if(a=='ovasg'){S.hs=id;S.hsa=true;S.hed=null;S.tid=null;S.pick=[];S.err='';S.dp=hsFiles(id).filter(d=>d.ok).map(d=>d.id);scrollTo(0,0);draw();return true}
 if(a=='hsback'){S.hs=null;S.hed=null;draw();return true}
 if(a=='hsnv'){S.hsBack=S.hs;go(S.page,id);return true}
 if(a?.startsWith('hsf-')){S.hf={q:'',st:a.slice(4),lv:'',ld:''};S.hsBack=null;go('so');return true}
 if(a=='hsclr'){S.hf={q:'',st:'',lv:'',ld:''};draw();return true}
 if(a=='hsed'){S.hed=id;draw();return true}
 if(a=='hsedc'){S.hed=null;draw();return true}
 if(a=='hsedr'){const d=D.find(x=>x.id==id),r=d?.ai?.r;if(!r)return true;act('hsEditFile',{docId:id,role:d.hr,num:r.num||'',date:r.date||'',ag:r.ag||'',k:r.k||'',sum:r.sum||'',confirm:false},'Đã khôi phục kết quả AI',()=>{S.hed=null;draw()});return true}
 if(a=='hsrm'){const d=D.find(x=>x.id==id);if(!d)return true;const draft=d.hs=='NHAP';
  if(!confirm(draft?`Bỏ tệp ${d.n} khỏi hồ sơ đang tiếp nhận?`:`Xóa tệp ${d.id} (${d.n}) khỏi hồ sơ ${d.hs}?\n\n• Tệp bị gỡ khỏi hồ sơ và khỏi Kho văn bản (tệp Drive vào thùng rác, khôi phục được trong 30 ngày).${d.hr=='main'?'\n• Đây là văn bản chính: tệp khác của hồ sơ sẽ được đặt làm văn bản chính.':''}\n• Nhiệm vụ đã giao vẫn giữ nguyên.`))return true;
  act('hsRemoveFile',{docId:id},draft?'Đã bỏ tệp':'Đã xóa '+id);return true}
 if(a=='hscreate'){const n=S.hn,F=hsDraft();act('hsCreate',{idest:n.idest.trim(),so:String(n.so).trim(),ty:n.ty.trim(),lv:n.lv,docIds:F.map(d=>d.id)},null,r=>{S.hn={idest:'',so:'',ty:'',lv:''};S.hs=r.id;toast(`Đã tạo ${r.id}. ${r.docs.length} tệp đã vào Kho văn bản: ${r.docs.join(', ')}`);scrollTo(0,0);draw()});return true}
 if(a=='hssave'){const n=S.hn,F=hsDraft();act('hsSave',{idest:n.idest.trim(),so:String(n.so).trim(),ty:n.ty.trim(),lv:n.lv,docIds:F.map(d=>d.id)},null,r=>{S.hn={idest:'',so:'',ty:'',lv:''};toast(`Đã lưu ${r.id} (Chờ AI đọc). Bạn có thể tải công văn tiếp theo.`);scrollTo(0,0);draw()});return true}
 if(a=='hsconfirm'){act('hsConfirm',{hsId:id},null,r=>{toast(`Đã xác nhận ${r.id}. ${r.docs.length} tệp đã vào Kho văn bản.`);draw()});return true}
 if(a=='hstake'){act('hsTake',{hsId:id},'Bạn đã nhận phụ trách '+id+'. Hồ sơ chuyển sang “Đang thực hiện”.');return true}
 if(a=='hsasg'){S.hsa=true;S.pick=[];S.err='';S.dp=hsFiles(id).filter(d=>d.ok).map(d=>d.id);scrollTo(0,0);draw();return true}
 if(a=='hsasgx'){S.hsa=false;S.pick=[];S.dp=[];draw();return true}
 if(a=='hsdel'){const h=hsBy(id),F=hsFiles(id);if(!confirm(`Xóa hồ sơ ${h.id} (${h.idest})?\n\n• ${F.length} tệp thành phần (${F.map(d=>d.id).join(', ')}) bị xóa khỏi sổ và Kho văn bản (tệp Drive vào thùng rác).${h.nv.length?'\n• Nhiệm vụ đã giao ('+h.nv.join(', ')+') vẫn được giữ nguyên.':''}\n• Số Idest được giải phóng, có thể tiếp nhận lại.\n\nKhông thể hoàn tác trong hệ thống.`))return true;
  act('hsDelete',{hsId:id},'Đã xóa '+id,()=>{S.hs=null;draw()});return true}
 if(a=='lvdel'){const n=HS.filter(h=>h.lv==v).length;if(!confirm(`Xóa lĩnh vực “${v}”?${n?`\n\n${n} hồ sơ đang thuộc lĩnh vực này sẽ chuyển về “Chưa phân loại”.`:''}`))return true;act('lvDelete',{name:v},'Đã xóa lĩnh vực');return true}
 if(a=='rcvdel'){const x=RCV.find(y=>y.id==v),n=HS.filter(h=>h.ld==v).length;if(!confirm(`Bỏ quyền tiếp nhận hồ sơ của ${x.n}?\n\nNgười này không còn thấy Danh sách công văn và Công văn tôi phụ trách.${n?`\n${n} hồ sơ người này đang phụ trách vẫn giữ nguyên; bạn có thể đổi người phụ trách trong từng hồ sơ.`:''}`))return true;act('rcvRemove',{userId:v},'Đã bỏ quyền của '+x.n);return true}
 return false}
function hsChange(el){
 if(el.closest('[data-f6]')&&el.tagName=='SELECT'){S.hf[el.dataset.k]=el.value;hsUpdList();return true}
 if(el.closest('[data-f7]')&&el.tagName=='SELECT'){S.hmf.st=el.value;draw();return true}
 if(el.id=='hsfi'){hsUpload([...el.files],'');return true}
 if(el.id=='hsadd'){hsUpload([...el.files],el.dataset.id);return true}
 if(el.id=='hslv'){act('hsUpdate',{hsId:el.dataset.id,lv:el.value},'Đã đổi lĩnh vực');return true}
 if(el.id=='hsld'){const h=hsBy(el.dataset.id),x=RCV.find(y=>y.id==el.value);
  if(!confirm(`Đổi người phụ trách ${h.id} từ ${h.ldn||'(chưa có)'} sang ${x?x.n:'(chưa có)'}?${h.nv.length?'\n\nNhiệm vụ đã giao ('+h.nv.join(', ')+') vẫn giữ nguyên.':''}`)){el.value=h.ld;return true}
  act('hsSetLeader',{hsId:h.id,userId:el.value},'Đã đổi người phụ trách '+h.id);return true}
 const ef=el.closest('form[data-f=hsef]');if(ef&&(el.name=='ag'||el.name=='k')){const p=$('#hp-'+CSS.escape(ef.dataset.id));if(p)p.innerHTML='Lưu trong kho tại: '+hsPath({ag:ef.ag.value,k:ef.k.value});return true}
 if(el.closest('form[data-f=hsnew]')&&el.name){S.hn[el.name]=el.value;if(el.name=='lv')draw();return true}
 return false}
function hsInput(el){
 if(el.closest('[data-f6]')&&el.dataset.k=='q'){S.hf.q=el.value;hsUpdList();return true}
 if(el.closest('form[data-f=hsnew]')&&el.name){S.hn[el.name]=el.value;
  if(el.name=='so'){const p=el.selectionStart;draw();const n=$('#hsso');if(n){n.focus();n.setSelectionRange(p,p)}return true}
  if(el.name=='idest'){const dup=el.value.trim()?HS.find(h=>ikey(h.idest)==ikey(el.value)):null,box=$('#hsdup');if(box)box.innerHTML=dup?hsDupMsg(dup):'';
   const p=el.selectionStart;draw();const n=$('#hsidest');if(n){n.focus();n.setSelectionRange(p,p)}}
  return true}
 return false}
function hsSubmit(k,F,fl,f){
 if(k=='hsnew')return true;
 if(k=='hsef'){const id=f.dataset.id,d=D.find(x=>x.id==id);if(!F.ag)return toast('Hãy chọn cơ quan ban hành'),true;if(!F.k)return toast('Hãy chọn loại văn bản'),true;
  act('hsEditFile',{docId:id,role:F.role,num:F.num,date:F.date,ag:F.ag,k:F.k,sum:F.sum,confirm:!!(d&&!d.ok&&d.hs!='NHAP'&&hsBy(d.hs)?.st!=PEND)},d&&!d.ok&&d.hs!='NHAP'&&hsBy(d.hs)?.st!=PEND?'Đã đưa '+id+' vào Kho văn bản':'Đã lưu thông tin tệp',()=>{S.hed=null;draw()});return true}
 if(k=='hsa'){if(!S.pick.length)return toast('Hãy chọn ít nhất một người được giao.'),true;const ids=S.pick.map(n=>PPL.find(p=>p.n==n)?.id).filter(Boolean),hid=S.hs;
  act('hsAssign',{hsId:hid,title:F.title,desc:F.desc,pri:F.pri,cs:F.cs,to:F.to,kind:F.kind,due:F.due,assignees:ids,files:fl,docs:S.dp},null,r=>{S.pick=[];S.dp=[];S.hsa=false;toast(`Đã giao ${r.id}. Hồ sơ chuyển sang “Đã giao việc”.`);draw()});return true}
 if(k=='lv'){act('lvAdd',{name:F.g},'Đã thêm lĩnh vực');return true}
 if(k=='rcv'){if(!F.u)return toast('Hãy chọn một nhân sự'),true;act('rcvAdd',{userId:F.u},'Đã cấp quyền tiếp nhận hồ sơ');return true}
 return false}
