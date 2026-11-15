// 링크 기반 동기화 (Firebase Realtime Database).
// 서버 구조: rooms/{token}/names/{0|1}, days/{날짜}/{시작-종료}/{c0,c1,e}, notes/{날짜}/{오전|오후|저녁}, seq/{client}
//
// 원칙
// - 화면 값 = 서버가 알려준 값 + 아직 서버에 반영되지 않은 내 변경(pending). 서버 값만으로 화면을 덮어쓰지 않는다.
// - 변경은 묶음(batch)으로 순서대로 보낸다. 각 묶음은 seq/{client} 번호를 1씩 올리며, 서버 규칙이
//   "직전 번호 + 1"만 허용하므로 같은 묶음을 다시 보내도 두 번 더해지지 않는다.
// - 카운트는 증감(delta)으로 보내므로 두 기기에서 동시에 눌러도 합쳐진다.
// - 묶음은 서버 스냅샷의 seq 번호로 반영이 확인될 때까지 pending에 남는다.
(()=>{
let token='',pending=[],baseline=null,ready=false,online=false,failed=false,busy=false,nextSeq=1,server=null;
const client=Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>b.toString(16).padStart(2,'0')).join('');
const clone=x=>JSON.parse(JSON.stringify(x));
const empty=()=>({names:['남','여'],days:{},notes:{}});
const status=t=>$('syncState').textContent=t;
const config=window.CHAGOK_FIREBASE;
const base=()=>config.databaseURL.replace(/\/+$/,'');
const available=()=>!!(config&&config.databaseURL);
const link=()=>location.origin+location.pathname+'#sync='+token;
const clamp=n=>Math.max(0,Math.min(999999,Math.trunc(Number(n)||0)));
const slotKey=r=>r.start+'-'+r.end;
const pendingKey=()=>key+'-pending-'+client;
function persist(){try{localStorage.setItem(key,JSON.stringify(db));localStorage.setItem(pendingKey(),JSON.stringify(pending.map(({sending,...b})=>b)));return true}catch(e){return false}}
function operations(a,b){const ops=[],date=$('date').value;for(let i=0;i<2;i++)if(a.names[i]!==b.names[i])ops.push({type:'name',date,index:i,value:b.names[i]});for(const [d,rows]of Object.entries(b.days)){for(const r of rows){const old=(a.days[d]||[]).find(x=>x.start===r.start&&x.end===r.end);const slot={date:d,start:r.start,end:r.end};if(!old)ops.push({type:'slot',...slot});for(let i=0;i<2;i++){const delta=r.counts[i]-(old?.counts[i]||0);if(delta||(r.entered&&!old?.entered&&i===0))ops.push({type:'count',...slot,index:i,delta})}}}for(const[d,values]of Object.entries(b.notes||{}))for(const[p,v]of Object.entries(values))if(v!==(a.notes?.[d]?.[p]||''))ops.push({type:'note',date:d,period:p,value:v});return ops}
function apply(data,ops){for(const o of ops){if(o.type==='name')data.names[o.index]=o.value;else if(o.type==='note'){data.notes??={};data.notes[o.date]??={};data.notes[o.date][o.period]=o.value}else{data.days[o.date]??=[];let r=data.days[o.date].find(r=>r.start===o.start&&r.end===o.end);if(!r){r={start:o.start,end:o.end,counts:[0,0]};data.days[o.date].push(r);data.days[o.date].sort((a,b)=>a.start.localeCompare(b.start))}if(o.type==='count'){r.counts[o.index]=Math.max(0,Math.min(999999,r.counts[o.index]+o.delta));r.entered=true}}}return data}

// 서버 값 <-> 앱 데이터 변환
function fromServer(value){const data=empty();const names=value.names||{};for(let i=0;i<2;i++)if(typeof names[i]==='string'&&names[i])data.names[i]=names[i];for(const[d,slots]of Object.entries(value.days||{})){const rows=[];for(const[k,v]of Object.entries(slots||{})){const[start,end]=k.split('-');if(!start||!end)continue;const row={start,end,counts:[clamp(v&&v.c0),clamp(v&&v.c1)]};if(v&&v.e)row.entered=true;rows.push(row)}rows.sort((a,b)=>a.start.localeCompare(b.start));data.days[d]=rows}for(const[d,values]of Object.entries(value.notes||{})){data.notes[d]={};for(const[p,v]of Object.entries(values||{}))data.notes[d][p]=String(v??'')}return data}
function toServer(data){const out={names:{0:data.names[0],1:data.names[1]},days:{},notes:{}};for(const[d,rows]of Object.entries(data.days||{})){for(const r of rows){out.days[d]??={};const v={c0:clamp(r.counts[0]),c1:clamp(r.counts[1])};if(r.entered)v.e=true;out.days[d][slotKey(r)]=v}}for(const[d,values]of Object.entries(data.notes||{}))for(const[p,v]of Object.entries(values||{})){out.notes[d]??={};out.notes[d][p]=String(v??'')}return out}
function payload(batch){const map={},inc={};for(const o of batch.ops){if(o.type==='name')map['names/'+o.index]=o.value;else if(o.type==='note')map['notes/'+o.date+'/'+o.period]=o.value;else{const path='days/'+o.date+'/'+o.start+'-'+o.end+'/';if(o.type==='slot'){inc[path+'c0']??=0;inc[path+'c1']??=0}else{inc[path+'c'+o.index]=(inc[path+'c'+o.index]||0)+o.delta;map[path+'e']=true}}}for(const[p,n]of Object.entries(inc))map[p]={'.sv':{increment:n}};map['seq/'+batch.client]=batch.seq;return map}

function refresh(){if(!token)return;const waiting=pending.some(b=>!b.acked);if(!available())status('동기화 설정이 없어요 · 입력은 이 기기에 보관 중');else if(failed)status('저장 실패 · 입력은 이 기기에 보관 중, 다시 시도할게요');else if(!online&&(waiting||!ready))status('연결 대기 · 입력은 이 기기에 보관 중');else if(!ready)status('동기화 기록 불러오는 중…');else status(waiting?'저장 중…':'동기화 완료');$('saved').textContent=waiting?'전송 대기 중':ready?'서버에 저장됨':'이 브라우저에 자동 저장'}
function renderPeriodsUnlessEditing(){if(document.activeElement?.classList.contains('period-note')){$('reportText').value=report(day())}else renderPeriods(day())}
// 서버 스냅샷 + 아직 반영되지 않은 내 변경으로 화면 데이터를 다시 만든다.
function rebuild(){if(!server)return;const seqs=server.seq||{};pending=pending.filter(b=>!(b.seq<=(Number(seqs[b.client])||0)));const data=fromServer(server);for(const batch of pending)apply(data,batch.ops);const before=JSON.stringify(db);db=data;baseline=clone(db);ready=true;persist();if(JSON.stringify(db)!==before){if(!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){render()}else{renderPeriodsUnlessEditing()}}refresh()}
const roomUrl=path=>base()+'/rooms/'+token+(path?'/'+path:'')+'.json';
async function pump(){if(busy||!token||!available())return;busy=true;try{for(;;){const batch=pending.find(b=>!b.acked);if(!batch)break;batch.sending=true;const body=JSON.stringify(payload(batch));let response;try{response=await fetch(roomUrl(''),{method:'PATCH',headers:{'Content-Type':'application/json'},body,keepalive:body.length<60000})}catch(e){batch.sending=false;online=navigator.onLine&&online;break}
 if(response.ok){batch.acked=true;failed=false;online=true;persist();refresh();continue}
 // 거절: 이미 반영된 묶음(재전송)인지 서버 번호로 확인한다.
 let current=null;try{const r=await fetch(roomUrl('seq/'+batch.client),{cache:'no-store'});if(r.ok)current=Number(await r.json())||0}catch(e){}
 batch.sending=false;
 if(current===null){failed=true;break}
 if(current>=batch.seq){batch.acked=true;persist();continue}
 if(current!==batch.seq-1){let n=current;for(const b of pending)if(b.client===batch.client&&!b.acked)b.seq=++n;if(batch.client===client)nextSeq=n+1;persist();continue}
 failed=true;break}}finally{busy=false;refresh()}}
window.queueCloud=()=>{if(!token||!baseline)return;const ops=operations(baseline,db);if(!ops.length)return;const last=pending[pending.length-1];if(last&&last.client===client&&!last.sending&&!last.acked)last.ops.push(...ops);else pending.push({client,seq:nextSeq++,ops});baseline=clone(db);if(!persist())status('기기 저장 실패 · 창을 닫지 마세요');Promise.resolve().then(pump)};
// 이전에 보내지 못하고 남은 묶음을 모은다. (예전 형식 포함)
function restore(){const found=[];try{for(const name of Object.keys(localStorage)){if(!name.startsWith(key+'-pending'))continue;let list=[];try{list=JSON.parse(localStorage.getItem(name)||'[]')}catch(e){}for(const b of list){if(!b||!Array.isArray(b.ops)||!b.ops.length)continue;if(b.client&&b.seq)found.push({client:b.client,seq:b.seq,ops:b.ops,acked:!!b.acked});else found.push({client,seq:nextSeq++,ops:b.ops})}localStorage.removeItem(name)}}catch(e){}found.sort((a,b)=>a.client===b.client?a.seq-b.seq:0);return found}
function connect(t){token=t;key='chagok-sync-'+token;ready=false;$('startSync').hidden=true;$('copySync').hidden=false;$('syncHelp').textContent='이 전용 링크를 가진 사람은 기록을 보고 수정할 수 있어요. 다른 기기에서도 같은 링크를 열어 주세요.';status('동기화 기록 불러오는 중…');try{const cached=localStorage.getItem(key);db=cached?JSON.parse(cached):empty()}catch(e){db=empty()}pending=restore();baseline=clone(db);persist();render();if(!available()||typeof firebase==='undefined'){refresh();pump();return}firebase.initializeApp(config);const database=firebase.database();database.ref('rooms/'+token).on('value',s=>{server=s.val()||{};failed=false;rebuild();pump()},()=>{failed=true;refresh()});database.ref('.info/connected').on('value',s=>{online=!!s.val();if(online)pump();refresh()});pump()}
$('startSync').onclick=async()=>{if(!available()){status('동기화 서버에 연결할 수 없어요. 잠시 후 다시 눌러 주세요.');return}if(!confirm('현재 기기의 날짜별 기록과 특이사항을 서버에 저장하고 개인 전용 링크를 만들까요?'))return;const t=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');document.querySelector('main').inert=true;status('기존 기록을 동기화 공간에 저장하는 중…');try{const snapshot=clone(db);const r=await fetch(base()+'/rooms/'+t+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(toServer(snapshot))});if(!r.ok)throw Error();history.replaceState(null,'','#sync='+t);localStorage.setItem('chagok-last-sync',t);localStorage.setItem('chagok-sync-'+t,JSON.stringify(snapshot));connect(t)}catch(e){status('동기화 시작 실패 · 기존 기록은 그대로예요. 다시 눌러 주세요.')}finally{document.querySelector('main').inert=false}};
$('copySync').onclick=async()=>{try{await navigator.clipboard.writeText(link());status('전용 링크를 복사했어요.')}catch(e){$('syncLink').hidden=false;$('syncLink').value=link();$('syncLink').focus();$('syncLink').select();status('전용 링크를 선택했어요. 복사해 주세요.')}};
const supplied=new URLSearchParams(location.hash.slice(1)).get('sync');let remembered='';try{remembered=localStorage.getItem('chagok-last-sync')||''}catch(e){}const initial=supplied||remembered;if(initial&&/^[a-f0-9]{64}$/.test(initial)){history.replaceState(null,'','#sync='+initial);try{localStorage.setItem('chagok-last-sync',initial)}catch(e){}connect(initial)}
setInterval(()=>{if(!token)return;if(pending.some(b=>!b.acked))pump();refresh()},3000);
window.addEventListener('online',()=>pump());document.addEventListener('visibilitychange',()=>{if(!document.hidden)pump()});
window.addEventListener('hashchange',()=>{const next=new URLSearchParams(location.hash.slice(1)).get('sync');if(next&&next!==token&&/^[a-f0-9]{64}$/.test(next)){try{localStorage.setItem('chagok-last-sync',next)}catch(e){}location.reload()}});
})();
