const $=id=>document.getElementById(id);let key='chagok-counter-v1';let db={names:['남','여'],days:{}};let storageOK=true;try{const v=JSON.parse(localStorage.getItem(key));if(v&&Array.isArray(v.names)&&v.names.length===2&&v.days)db=v}catch(e){storageOK=false}
const today=new Date();$('date').value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');let selected=0;
const periods=[{name:'오전',start:'10:00',end:'13:00'},{name:'오후',start:'13:00',end:'17:00'},{name:'저녁',start:'17:00',end:'22:00'}];
if(db.names[0]==='섹션 A'&&db.names[1]==='섹션 B')db.names=['남','여'];
function day(){const date=$('date').value;const rows=db.days[date]??(db.days[date]=[]);for(let h=10;h<22;h++){const start=String(h).padStart(2,'0')+':00',end=String(h+1).padStart(2,'0')+':00';if(!rows.some(r=>start<r.end&&end>r.start))rows.push({start,end,counts:[0,0]})}rows.sort((a,b)=>a.start.localeCompare(b.start));return rows}
function periodRows(rows,p){return rows.filter(r=>r.start>=p.start&&r.start<p.end)}
function totals(rows){return rows.reduce((s,r)=>[s[0]+r.counts[0],s[1]+r.counts[1]],[0,0])}
function notes(){db.notes??={};return db.notes[$('date').value]??(db.notes[$('date').value]={})}
function report(rows){
 const [year,month,date]=$('date').value.split('-').map(Number);
 const weekday=['일','월','화','수','목','금','토'][new Date(year,month-1,date).getDay()];
 const lines=['✅️ 보고양식',`트래픽조사 (${String(year).slice(-2)}년 ${month}월 ${date}일 ${weekday}요일)_ifc몰`];
 const count=n=>String(n).padStart(2,'0');
 // 입력한 시간대만 숫자를 적고, 아직 입력하지 않은 시간대와 구간 합계는 비워 둔다.
 const blank=r=>!r.entered&&r.counts.every(n=>n===0);
 const rowLine=r=>`${r.start}-${r.end} `+(blank(r)?'':`남 ${count(r.counts[0])}명/여 ${count(r.counts[1])}명`);
 for(const p of periods){
  const group=periodRows(rows,p);for(const r of group)lines.push(rowLine(r));
  const sum=totals(group);
  lines.push(`📍${p.name} 합계${p.name==='오전'?'':'(명)'} `+(group.length&&group.every(blank)?'':`보고 남 ${count(sum[0])}명/여 ${count(sum[1])}명`));

 }
 const other=rows.filter(r=>r.start<'10:00'||r.start>='22:00');
 if(other.length){lines.push('기타 시간대');for(const r of other)lines.push(rowLine(r))}
 const sum=totals(rows);
 lines.push(`📍총 누적 남 ${count(sum[0])}명/여 ${count(sum[1])}명 (총=${sum[0]+sum[1]}명).`);
 return lines.join('\n');
}
function renderPeriods(rows){$('periods').replaceChildren(...periods.map(p=>{const box=document.createElement('article');box.className='period';const title=document.createElement('h2');title.textContent=p.name;const time=document.createElement('span');time.textContent=p.start+'-'+p.end;const sum=totals(periodRows(rows,p));const total=document.createElement('strong');total.textContent=number(sum[0]+sum[1])+'명';const detail=document.createElement('p');detail.textContent=`남 ${number(sum[0])}명 / 여 ${number(sum[1])}명`;const field=document.createElement('label');field.className='note-label';field.textContent=p.name+' 특이사항';const input=document.createElement('textarea');input.className='period-note';input.rows=4;input.placeholder='방문객 유형, 체험 제품, 매장 분위기 등';input.value=notes()[p.name]||'';input.oninput=()=>{notes()[p.name]=input.value;save();$('reportText').value=report(day())};const copy=document.createElement('button');copy.type='button';copy.className='add note-copy';copy.textContent=p.name+' 특이사항 복사';const status=document.createElement('span');status.className='note-status';status.setAttribute('role','status');copy.onclick=()=>copyNote(p.name,status);field.append(input);box.append(title,time,total,detail,field,copy,status);return box}));$('reportText').value=report(rows)}

function save(){if(window.queueCloud)window.queueCloud();try{localStorage.setItem(key,JSON.stringify(db));storageOK=true}catch(e){storageOK=false}$('saved').textContent=storageOK?'이 브라우저에 자동 저장':'저장 불가 · 브라우저 설정을 확인해 주세요'}
const number=n=>n.toLocaleString('ko-KR');const label=r=>r.start+' – '+r.end;
function render(){const rows=day();renderPeriods(rows);selected=Math.max(0,Math.min(selected,rows.length-1));$('slot').replaceChildren(...rows.map((r,i)=>new Option(label(r),i,false,i===selected)));const current=rows[selected];const sums=[0,0];rows.forEach(r=>r.counts.forEach((n,i)=>sums[i]+=n));for(let i=0;i<2;i++){$('name'+i).value=db.names[i];$('count'+i).value=current.counts[i];$('label'+i).textContent=db.names[i];$('th'+i).textContent=db.names[i];$('sum'+i).textContent=number(sums[i]);$('foot'+i).textContent=number(sums[i])}$('slotTotal').textContent=number(current.counts[0]+current.counts[1]);$('grand').textContent=$('footTotal').textContent=number(sums[0]+sums[1]);$('prev').disabled=selected===0;$('next').disabled=selected===rows.length-1;$('rows').replaceChildren(...rows.map((r,i)=>{const tr=document.createElement('tr');if(i===selected)tr.className='active';const td=document.createElement('td'),b=document.createElement('button');b.textContent=label(r);b.setAttribute('aria-label',label(r)+' 카운트 선택');b.onclick=()=>{selected=i;render()};td.append(b);tr.append(td);for(const n of [...r.counts,r.counts[0]+r.counts[1]]){const cell=document.createElement('td');cell.textContent=number(n);tr.append(cell)}return tr}));$('saved').textContent=storageOK?'이 브라우저에 자동 저장':'저장 불가 · 브라우저 설정을 확인해 주세요'}
function update(i,n){day()[selected].entered=true;day()[selected].counts[i]=Math.max(0,Math.min(999999,Math.trunc(Number(n)||0)));save();render()}
document.querySelectorAll('[data-delta]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.index);update(i,day()[selected].counts[i]+Number(b.dataset.delta))});for(let i=0;i<2;i++){$('count'+i).oninput=e=>update(i,e.target.value);$('count'+i).onchange=e=>update(i,e.target.value);$('name'+i).onchange=e=>{db.names[i]=e.target.value.trim()||'섹션 '+(i?'B':'A');save();render()}}$('slot').onchange=e=>{selected=Number(e.target.value);render()};$('prev').onclick=()=>{selected--;render()};$('next').onclick=()=>{selected++;render()};$('date').onchange=()=>{if(!$('date').value)return;selected=0;render();save()};$('add').onclick=()=>{$('error').textContent='';$('dialog').showModal()};$('cancel').onclick=()=>$('dialog').close();$('form').onsubmit=e=>{e.preventDefault();const start=$('start').value,end=$('end').value;if(start>=end){$('error').textContent='종료 시간을 시작 시간보다 늦게 설정해 주세요.';return}if(day().some(r=>start<r.end&&end>r.start)){$('error').textContent='기존 시간대와 겹치지 않게 설정해 주세요.';return}const row={start,end,counts:[0,0]},rows=day();rows.push(row);rows.sort((a,b)=>a.start.localeCompare(b.start));selected=rows.indexOf(row);save();render();$('dialog').close()};render();

$('copyReport').onclick=async()=>{const value=$('reportText').value;try{if(!navigator.clipboard)throw Error('unavailable');await navigator.clipboard.writeText(value);$('copyStatus').textContent='복사했어요. 원하는 곳에 붙여넣으세요.'}catch(e){$('reportText').focus();$('reportText').select();$('reportText').setSelectionRange(0,value.length);let copied=false;try{copied=document.execCommand('copy')}catch(e){}$('copyStatus').textContent=copied?'복사했어요. 원하는 곳에 붙여넣으세요.':'텍스트를 선택했어요. 길게 누르거나 Ctrl+C / ⌘C로 복사해 주세요.'}};

function noteText(period){const [year,month,date]=$('date').value.split('-').map(Number);const weekday=['일','월','화','수','목','금','토'][new Date(year,month-1,date).getDay()];return `IFC몰 ${month}/${date} ${weekday}요일 ${period} 특이사항\n${notes()[period]||''}`}
async function copyNote(period,status){const value=noteText(period);try{if(!navigator.clipboard)throw Error('unavailable');await navigator.clipboard.writeText(value);status.textContent='복사했어요.'}catch(e){const area=document.createElement('textarea');area.value=value;area.className='period-note';area.setAttribute('aria-label',period+' 특이사항 복사할 내용');status.replaceChildren(area);area.focus();area.select();area.setSelectionRange(0,value.length);let ok=false;try{ok=document.execCommand('copy')}catch(e){}if(ok)status.textContent='복사했어요.';else{const hint=document.createElement('span');hint.textContent='선택된 내용을 길게 누르거나 ⌘C / Ctrl+C로 복사해 주세요.';status.append(hint)}}}
