// 링크 기반 동기화 (Firebase Realtime Database).
// 서버 구조: rooms/{token}/names/{0|1}, days/{날짜}/{시작-종료}/{c0,c1,e}, notes/{날짜}/{오전|오후|저녁}, applied/{batch}
// 카운트는 증감(delta)으로 보내므로 두 기기에서 동시에 눌러도 합쳐진다.
(()=>{
let token='',pending=[],baseline=null,ready=false,room=null,online=false,failed=false;
const sent=new Set(),parts={};
const clone=x=>JSON.parse(JSON.stringify(x));
const empty=()=>({names:['남','여'],days:{},notes:{}});
const status=t=>$('syncState').textContent=t;
const config=window.CHAGOK_FIREBASE;
const available=()=>typeof firebase!=='undefined'&&!!(config&&config.databaseURL);
const link=()=>location.origin+location.pathname+'#sync='+token;
const clamp=n=>Math.max(0,Math.min(999999,Math.trunc(Number(n)||0)));
const slotKey=r=>r.start+'-'+r.end;
let database=null;
function root(){if(!database){firebase.initializeApp(config);database=firebase.database()}return database}
function persist(){localStorage.setItem(key,JSON.stringify(db));localStorage.setItem(key+'-pending',JSON.stringify(pending))}
function operations(a,b){const ops=[],date=$('date').value;for(let i=0;i<2;i++)if(a.names[i]!==b.names[i])ops.push({type:'name',date,index:i,value:b.names[i]});for(const [d,rows]of Object.entries(b.days)){for(const r of rows){const old=(a.days[d]||[]).find(x=>x.start===r.start&&x.end===r.end);const base={date:d,start:r.start,end:r.end};if(!old)ops.push({type:'slot',...base});for(let i=0;i<2;i++){const delta=r.counts[i]-(old?.counts[i]||0);if(delta||(r.entered&&!old?.entered&&i===0))ops.push({type:'count',...base,index:i,delta})}}}for(const[d,values]of Object.entries(b.notes||{}))for(const[p,v]of Object.entries(values))if(v!==(a.notes?.[d]?.[p]||''))ops.push({type:'note',date:d,period:p,value:v});return ops}
function apply(data,ops){for(const o of ops){if(o.type==='name')data.names[o.index]=o.value;else if(o.type==='note'){data.notes??={};data.notes[o.date]??={};data.notes[o.date][o.period]=o.value}else{data.days[o.date]??=[];let r=data.days[o.date].find(r=>r.start===o.start&&r.end===o.end);if(!r){r={start:o.start,end:o.end,counts:[0,0]};data.days[o.date].push(r)}if(o.type==='count'){r.counts[o.index]=Math.max(0,Math.min(999999,r.counts[o.index]+o.delta));r.entered=true}}}return data}

// 서버 값 <-> 앱 데이터 변환
function fromServer(){const data=empty();const names=parts.names||{};for(let i=0;i<2;i++)if(typeof names[i]==='string'&&names[i])data.names[i]=names[i];for(const[d,slots]of Object.entries(parts.days||{})){const rows=[];for(const[k,v]of Object.entries(slots||{})){const[start,end]=k.split('-');if(!start||!end)continue;const row={start,end,counts:[clamp(v&&v.c0),clamp(v&&v.c1)]};if(v&&v.e)row.entered=true;rows.push(row)}rows.sort((a,b)=>a.start.localeCompare(b.start));data.days[d]=rows}for(const[d,values]of Object.entries(parts.notes||{})){data.notes[d]={};for(const[p,v]of Object.entries(values||{}))data.notes[d][p]=String(v??'')}return data}
function toServer(data){const out={names:{0:data.names[0],1:data.names[1]},days:{},notes:{}};for(const[d,rows]of Object.entries(data.days||{})){for(const r of rows){out.days[d]??={};const v={c0:clamp(r.counts[0]),c1:clamp(r.counts[1])};if(r.entered)v.e=true;out.days[d][slotKey(r)]=v}}for(const[d,values]of Object.entries(data.notes||{}))for(const[p,v]of Object.entries(values||{})){out.notes[d]??={};out.notes[d][p]=String(v??'')}return out}
function updates(batch){const map={},inc={};for(const o of batch.ops){if(o.type==='name')map['names/'+o.index]=o.value;else if(o.type==='note')map['notes/'+o.date+'/'+o.period]=o.value;else{const base='days/'+o.date+'/'+o.start+'-'+o.end+'/';if(o.type==='slot'){inc[base+'c0']??=0;inc[base+'c1']??=0}else{inc[base+'c'+o.index]=(inc[base+'c'+o.index]||0)+o.delta;map[base+'e']=true}}}for(const[p,n]of Object.entries(inc))map[p]=firebase.database.ServerValue.increment(n);map['applied/'+batch.batch]=firebase.database.ServerValue.TIMESTAMP;return map}

function refresh(){if(!token)return;const waiting=pending.length;if(!available())status('동기화 서버에 연결할 수 없어요 · 입력은 이 기기에 보관 중');else if(!online)status('연결 대기 · 입력은 이 기기에 보관 중');else if(failed)status('저장 실패 · 입력은 이 기기에 보관 중, 다시 시도할게요');else if(!ready)status('동기화 기록 불러오는 중…');else status(waiting?'동기화 중…':'동기화 완료');if(ready||waiting)$('saved').textContent=waiting?'전송 대기 중':online?'서버에 저장됨':'이 브라우저에 자동 저장'}
function renderPeriodsUnlessEditing(){if(document.activeElement?.classList.contains('period-note')){$('reportText').value=report(day())}else renderPeriods(day())}
function adopt(){if(!('names'in parts&&'days'in parts&&'notes'in parts))return;const data=fromServer();for(const batch of pending)if(!sent.has(batch.batch))apply(data,batch.ops);db=data;baseline=clone(db);ready=true;try{persist()}catch(e){}if(!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){render()}else{renderPeriodsUnlessEditing()}refresh()}
function drop(batch){pending=pending.filter(b=>b!==batch);sent.delete(batch.batch);try{persist()}catch(e){}}
function send(batch){if(!room||sent.has(batch.batch))return;sent.add(batch.batch);const target=room;target.update(updates(batch)).then(()=>{failed=false;drop(batch);refresh()}).catch(async()=>{
 // 거절된 경우: 이미 반영된 묶음(재전송)이면 버리고, 아니면 보관했다가 다시 보낸다.
 let done=false;try{done=(await target.child('applied/'+batch.batch).get()).exists()}catch(e){}
 if(done)drop(batch);else{sent.delete(batch.batch);failed=true}
 adopt();refresh()})}
function flush(){if(!room)return;for(const batch of [...pending])send(batch);refresh()}
window.queueCloud=()=>{if(!token||!baseline)return;const ops=operations(baseline,db);if(ops.length){pending.push({batch:crypto.randomUUID().replace(/-/g,''),ops});baseline=clone(db);try{persist()}catch(e){status('기기 저장 실패 · 창을 닫지 마세요')}Promise.resolve().then(flush)}};
function connect(t){token=t;key='chagok-sync-'+token;ready=false;$('startSync').hidden=true;$('copySync').hidden=false;$('syncHelp').textContent='이 전용 링크를 가진 사람은 기록을 보고 수정할 수 있어요. 다른 기기에서도 같은 링크를 열어 주세요.';status('동기화 기록 불러오는 중…');try{const cached=localStorage.getItem(key);db=cached?JSON.parse(cached):empty();pending=JSON.parse(localStorage.getItem(key+'-pending')||'[]')}catch(e){db=empty();pending=[]}baseline=clone(db);render();if(!available()){refresh();return}room=root().ref('rooms/'+token);for(const part of ['names','days','notes'])room.child(part).on('value',s=>{parts[part]=s.val();adopt()},()=>{failed=true;refresh()});root().ref('.info/connected').on('value',s=>{online=!!s.val();if(online)flush();refresh()});flush()}
$('startSync').onclick=async()=>{if(!available()){status('동기화 서버에 연결할 수 없어요. 잠시 후 다시 눌러 주세요.');return}if(!confirm('현재 기기의 날짜별 기록과 특이사항을 서버에 저장하고 개인 전용 링크를 만들까요?'))return;const t=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');document.querySelector('main').inert=true;status('기존 기록을 동기화 공간에 저장하는 중…');try{const snapshot=clone(db);await Promise.race([root().ref('rooms/'+t).set(toServer(snapshot)),new Promise((_,no)=>setTimeout(()=>no(Error('timeout')),15000))]);history.replaceState(null,'','#sync='+t);localStorage.setItem('chagok-last-sync',t);localStorage.setItem('chagok-sync-'+t,JSON.stringify(snapshot));connect(t)}catch(e){status('동기화 시작 실패 · 기존 기록은 그대로예요. 다시 눌러 주세요.')}finally{document.querySelector('main').inert=false}};
$('copySync').onclick=async()=>{try{await navigator.clipboard.writeText(link());status('전용 링크를 복사했어요.')}catch(e){$('syncLink').hidden=false;$('syncLink').value=link();$('syncLink').focus();$('syncLink').select();status('전용 링크를 선택했어요. 복사해 주세요.')}};
const supplied=new URLSearchParams(location.hash.slice(1)).get('sync');let remembered='';try{remembered=localStorage.getItem('chagok-last-sync')||''}catch(e){}const initial=supplied||remembered;if(initial&&/^[a-f0-9]{64}$/.test(initial)){history.replaceState(null,'','#sync='+initial);try{localStorage.setItem('chagok-last-sync',initial)}catch(e){}connect(initial)}
setInterval(()=>{if(!token||document.hidden)return;if(online&&pending.some(b=>!sent.has(b.batch)))flush();refresh()},3000);
window.addEventListener('hashchange',()=>{const next=new URLSearchParams(location.hash.slice(1)).get('sync');if(next&&next!==token&&/^[a-f0-9]{64}$/.test(next)){try{localStorage.setItem('chagok-last-sync',next)}catch(e){}location.reload()}});
})();
