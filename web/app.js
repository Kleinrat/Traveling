import { plan_json, catalogue_json, plan_with_preferences_json, alternatives_with_preferences_json, edit_plan_json, reflow_plan_json, trip_cost_json, cities_json, pending_places_json, restaurants_similar } from './engine.js';
const $ = id => document.getElementById(id);
const staticDemo = document.querySelector('meta[name="moontrip-mode"]')?.content === 'static';
const tags = ['自然','文化','历史','美食','摄影','城市','海边','古镇','博物馆','亲子'];
const snapshotPaths={杭州:'./data/hangzhou.json',成都:'./data/chengdu.json'};
const sourceSnapshots={};
await Promise.all(Object.entries(snapshotPaths).map(async([city,url])=>{
  try{const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();if(data.city===city&&Array.isArray(data.places)&&Array.isArray(data.pending))sourceSnapshots[city]=data;}catch{}
}));
let places = Object.values(sourceSnapshots).flatMap(data=>data.places), currentPlan, plannedRequest, proposal, configured = false;
if(!places.length)places=JSON.parse(catalogue_json());
let selected=[], avoided=[];
let travelMode='custom', manualStops=[], tripLedger;
let routeCache=[], routesBusy=false;
function meals(){return {lunch:$('include_food').checked,dinner:$('include_dinner').checked};}
function routing(strict=false){return {mode:$('transport').value,strict,distance_limit:Math.round(Number($('distance-limit').value)*1000),routes:routeCache.filter(r=>{const a=places.find(p=>p.id===r.from_id),b=places.find(p=>p.id===r.to_id);return a&&b&&a.location===r.origin_location&&b.location===r.destination_location&&Date.now()-Date.parse(r.fetched_at)<3600000&&r.mode===$('transport').value;})};}
const now=new Date();$('trip-start').value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
function preferences(){return {mode:travelMode,environment:$('prefer-indoor').checked?'indoor':$('prefer-outdoor').checked?'outdoor':'any',walking:$('walking').checked,transfer_limit:Number($('transfer-limit').value)};}
function setPreferences(p){travelMode=p.mode||'custom';$('prefer-indoor').checked=p.environment==='indoor';$('prefer-outdoor').checked=p.environment==='outdoor';$('walking').checked=Boolean(p.walking);$('transfer-limit').value=p.transfer_limit??120;$('compact').checked=travelMode==='intense';renderMode();}
function expenses(){return Object.fromEntries(['people','roundtrip','trip_budget'].map(id=>[id,Number($(id).value)]));}
function dayDate(day){const value=$('trip-start').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()+day-1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function saveTrip(){try{localStorage.setItem('moontrip.v1',JSON.stringify({places,request:plannedRequest,message:$('message').value,preferences:preferences(),expenses:expenses(),trip_start:$('trip-start').value,manual_stops:manualStops,routing:routing(),meals:meals(),route_cache:routeCache}));}catch{}}
function renderBudget(){
  if(!currentPlan)return;
  const p=currentPlan,result=JSON.parse(trip_cost_json(JSON.stringify({activity:p.activity_cost,food:p.food_cost,transfer:p.transfer_cost,expenses:expenses()})));
  $('trip-ledger').replaceChildren();
  if(!result.ok){tripLedger=undefined;$('trip-ledger').append(e('p',result.errors.join('；'),'over-budget'));return;}
  const c=result.cost;tripLedger=c;$('trip-ledger').append(e('h2',`${c.people} 人旅行总账 · 估算`));const grid=e('div',undefined,'ledger-grid');
  for(const [label,value] of [['全团活动',c.activity],['全团餐饮',c.food],['市内接驳',c.transfer],['往返交通',c.roundtrip],['全团总额',c.total]]){const cell=e('div');cell.append(e('small',label),e('strong',`¥${value}`));grid.append(cell);}$('trip-ledger').append(grid,e('p',`每人分摊约 ¥${c.per_person_estimate}（向上取整）；活动和交通按人数计，不含住宿。`,'hint'));
  $('trip-ledger').append(e('p',c.budget_set?(c.over_budget?`超出全团预算 ¥${-c.remaining}，请调整交通或活动。`:`全团预算余量 ¥${c.remaining}`):'尚未设置全团总预算。',c.over_budget?'over-budget':'hint'));
  if(Number($('roundtrip').value)===0)$('trip-ledger').append(e('p','往返交通为 0：若实际需要付费，请补充金额。','hint'));
}
let reviewPoi, mapsConfigured=false, libraryBusy=false, stopBatch=false;
let pendingPlaces=[];
try{
  const stored=JSON.parse(localStorage.getItem("moontrip.pending.v1")||"[]");
  if(Array.isArray(stored))for(let i=0;i<stored.length;i+=40){const checked=JSON.parse(pending_places_json(JSON.stringify(stored.slice(i,i+40))));if(checked.ok)pendingPlaces.push(...checked.items);}
}catch{}
const e = (tag, text, cls) => { const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(cls) node.className = cls; return node; };
const clock = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const minutes = s => { const [h,m] = s.split(':').map(Number); return h*60+m; };
function feedback(text='') { $('feedback').hidden = !text; $('feedback').textContent = text; }
for(const tag of tags){ const label=e('label'), input=e('input'); input.type='checkbox'; input.value=tag; input.checked=['自然','文化'].includes(tag); label.append(input,e('span',tag)); $('interests').append(label); }
function request(){ return {city:$('city').value,days:Number($('days').value),budget:Number($('budget').value),start:minutes($('start').value),end:minutes($('end').value),interests:[...$('interests').querySelectorAll('input:checked')].map(i=>i.value),family:$('family').checked,rain:$('rain').checked,relaxed:$('relaxed').checked,must_visit:[...selected],avoid:[...avoided],priority:$('priority').value,include_food:$('include_food').checked||$('include_dinner').checked,diet:$('diet').value,max_visits:Number($('max_visits').value)}; }
function setRequest(r){
  r={must_visit:[],avoid:[],priority:"balanced",include_food:true,diet:"不限",max_visits:3,...r}; selected=[...r.must_visit];avoided=[...r.avoid];
  if(![...$('city').options].some(o=>o.value===r.city)) $('city').add(new Option(r.city,r.city));
  for(const id of ['city','days','budget','priority','diet','max_visits']) $(id).value=r[id];
  for(const id of ['start','end']) $(id).value=clock(r[id]);
  for(const id of ['family','rain','relaxed']) $(id).checked=r[id];
  if(!r.include_food){$('include_food').checked=false;$('include_dinner').checked=false;}else if(!meals().lunch&&!meals().dinner)$('include_food').checked=true;
  $('budget-friendly').checked=r.priority==='budget';
  for(const tag of r.interests) if(!tags.includes(tag)){ tags.push(tag); const label=e('label'),input=e('input'); input.type='checkbox'; input.value=tag; label.append(input,e('span',tag)); $('interests').append(label); }
  $('interests').querySelectorAll('input').forEach(i=>i.checked=r.interests.includes(i.value));
}
function generate(keepManual=false){
  feedback();
  const r=request(), result=JSON.parse(plan_with_preferences_json(JSON.stringify({request:r,places,preferences:preferences(),routing:routing(),meals:meals()})));
  if(!result.ok){feedback(result.errors.join('；'));return;}
  currentPlan=result.plan; plannedRequest=r;if(keepManual!==true)manualStops=[];render();saveTrip();
}
function render(){
  renderCandidates();renderAlternatives();
  renderBudget();
  const p=currentPlan, count=p.days.reduce((n,d)=>n+d.stops.filter(s=>s.place.kind==='sight').length,0);
  $('budget-detail').textContent=`景点 ¥${p.activity_cost} + 餐饮 ¥${p.food_cost} + 接驳 ¥${p.transfer_cost} / 人（均为当前资料估算）`;
  $('summary').replaceChildren();
  for(const [label,value,unit] of [['安排活动',count,'站'],['预计花费',p.total_cost,'元 / 人'],['预算余量',p.remaining_budget,'元 / 人']]){ const card=e('div',undefined,'metric'),strong=e('strong',String(value)); strong.append(e('span',unit)); card.append(e('small',label),strong); $('summary').append(card); }
  $('itinerary').replaceChildren();
  for(const day of p.days){
    const section=e('div',undefined,'day'),head=e('div',undefined,'day-head');head.append(e('h3',`第 ${day.day} 天 · ${dayDate(day.day)} · ${plannedRequest.city}`),e('small',`活动、餐饮与接驳 ¥${day.cost} / 人 · 已查询路程 ${(day.stops.reduce((n,s)=>n+s.transfer_distance,0)/1000).toFixed(1)} 公里`));section.append(head);
    if(!day.stops.length)section.append(e('div','这一天还没有合适的安排。试着放宽条件，或导入更多景点。','empty'));
    for(const stop of day.stops){
      const row=e('article',undefined,'stop'),time=e('div',clock(stop.start),'time'); time.append(e('small',`至 ${clock(stop.end)}`));
      const content=e('div'),title=e('h4',stop.place.name);title.append(e('span',stop.score===0?'手动安排':`${stop.score} 分`,'score'));
      if(stop.place.kind==='food')content.append(e('div',`${stop.meal||'餐饮'} · 人均消费估算`,'tag-food'));
      content.append(title,e('div',`${stop.place.district} · 游览 ${stop.place.duration} 分钟 · ${stop.place.kind==='food'?'人均':'活动'} ¥${stop.place.cost} · ${stop.place.indoor?'室内':'户外'}`,'meta'));
      if(stop.route_source!=='每日第一站未计接驳')content.append(e('div',`${stop.route_source} · ${stop.transfer_minutes} 分钟 / ¥${stop.transfer_cost}${stop.route_source==='高德路线规划'?' / '+(stop.transfer_distance/1000).toFixed(2)+' 公里':' / 距离未知'}；另预留休息时间`,'meta'));
      content.append(e('div',stop.reasons.filter(t=>!t.startsWith('基础')).join(' · ')||'满足当前时间、预算与活动条件','reason'));
      const details=e('details'),list=e('ul');details.append(e('summary','推荐理由与数据来源'));stop.reasons.forEach(reason=>list.append(e('li',reason)));list.append(e('li',`来源：${stop.place.source}`));details.append(list);content.append(details);
      for(const url of sourceLinks(stop.place)){const link=e('a','查看来源 ↗','source-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';content.append(link);}
      const controls=e('div',undefined,'stop-controls');
      for(const [label,action] of [['移除',()=>{selected=selected.filter(id=>id!==stop.place.id);if(!avoided.includes(stop.place.id))avoided.push(stop.place.id);generate();}],['优先安排',()=>{selected=[stop.place.id,...selected.filter(id=>id!==stop.place.id)];generate();}],['↑',()=>moveStop(stop.place.id,-1)],['↓',()=>moveStop(stop.place.id,1)]]){const b=e('button',label);b.type='button';b.addEventListener('click',action);controls.append(b);}content.append(controls);
      const editor=e('details',undefined,'stop-editor');editor.append(e('summary','调整日期和开始时间'));const fields=e('div',undefined,'fields'),dayLabel=e('label','日期'),daySelect=e('select'),timeLabel=e('label','开始时间'),timeInput=e('input');
      for(let n=1;n<=plannedRequest.days;n++)daySelect.add(new Option(`第 ${n} 天 · ${dayDate(n)}`,String(n)));daySelect.value=String(day.day);timeInput.type='time';timeInput.value=clock(stop.start);dayLabel.append(daySelect);timeLabel.append(timeInput);fields.append(dayLabel,timeLabel);editor.append(fields,e('p','保留其他站的时间；冲突时不会覆盖当前行程。','hint'));const applyEdit=e('button','保存调整');applyEdit.type='button';applyEdit.addEventListener('click',()=>{const edits=schedule();const target=edits.find(s=>s.id===stop.place.id);target.day=Number(daySelect.value);target.start=minutes(timeInput.value);applySchedule(edits);});editor.append(applyEdit);content.append(editor);row.append(time,content);section.append(row);
    }
    $('itinerary').append(section);
  }
  $('exclusions').replaceChildren(...p.exclusions.map(x=>{const row=e('div',x.name,'exclusion');row.append(e('small',x.reason));return row;}));
  if(!p.exclusions.length)$('exclusions').append(e('p','所有景点均已安排。'));
  $('warnings').replaceChildren(...p.warnings.map(w=>e('li',w)));
  $('data-status').textContent=`已载入 ${places.length} 个地点 · ${[...new Set(places.map(p=>p.city))].join('、')}${places.some(p=>p.source.includes('虚构'))?' · 含虚构示例，可点击上方城市资料按钮替换':''}`;
}
const presets={lazy:{days:2,start:600,end:1080,interests:['美食','自然'],relaxed:true,max_visits:2,include_food:true,transfer_limit:90,description:'10:00–18:00 · 每天最多 2 个景点 · 站间休息 45 分钟 · 美食和同片区优先'},intense:{days:2,start:420,end:1320,interests:['文化','历史','摄影'],relaxed:false,max_visits:6,include_food:true,transfer_limit:180,description:'07:00–22:00 · 每天最多 6 个景点 · 站间休息 5 分钟 · 衔接紧凑'},weekend:{days:2,start:540,end:1080,interests:['自然','文化'],relaxed:false,max_visits:3,include_food:true,transfer_limit:60,description:'09:00–18:00 · 2 天轻旅行 · 每天最多 3 个景点 · 接驳估算不超过 60 分钟'}};
function renderMode(){document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===travelMode)));$('mode-description').textContent=presets[travelMode]?.description||'自定义节奏 · 可调整景点数量、作息和接驳上限。';}
$('planner').addEventListener('submit',ev=>{ev.preventDefault();generate();});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const preset=presets[b.dataset.preset];travelMode=b.dataset.preset;setRequest({...request(),...preset});$('transfer-limit').value=preset.transfer_limit;$('include_food').checked=true;$('include_dinner').checked=true;$('distance-limit').value=travelMode==='weekend'?10:30;$('compact').checked=travelMode==='intense';renderMode();generate();}));
$('remove-demo').addEventListener('click',()=>{const demoIds=new Set(JSON.parse(catalogue_json()).map(p=>p.id));const real=places.filter(p=>!demoIds.has(p.id));if(!real.length){feedback('请先核对并加入至少一个真实地点。');return;}places=real;selected=[];avoided=[];if(!real.some(p=>p.city===$('city').value))$('city').value=real[0].city;generate();});
$('reset').addEventListener('click',()=>{places=JSON.parse(catalogue_json());selected=[];avoided=[];generate();});
$('import').addEventListener('change',async ev=>{
  const file=ev.target.files[0];if(!file)return;
  try{
    if(file.size>1000000)throw Error('景点文件不能超过 1 MB');
    const raw=JSON.parse(await file.text()),imported=Array.isArray(raw)?raw:raw.places;if(!Array.isArray(imported))throw Error('请导入景点 JSON 数组');
    const check=JSON.parse(plan_json(JSON.stringify({request:{...request(),must_visit:[],avoid:[]},places:imported})));
    if(!check.ok)throw Error(check.errors.join('；'));
    places=imported;routeCache=[];selected=[];avoided=[];if(Array.isArray(raw.pending))mergePending(raw.pending);for(const city of new Set(places.map(p=>p.city)))if(![...$('city').options].some(o=>o.value===city))$('city').add(new Option(city,city));
    generate();
  }catch(err){feedback(err.message);}finally{ev.target.value='';}
});
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=e('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-json').addEventListener('click',()=>{if(currentPlan)download('moontrip-plan.json',JSON.stringify({request:plannedRequest,preferences:preferences(),trip_start:$('trip-start').value,expenses:expenses(),ledger:tripLedger,manual_stops:manualStops,routing:routing(),meals:meals(),route_cache:routeCache,places,plan:currentPlan},null,2),'application/json');});
$('export-md').addEventListener('click',()=>{
  if(!currentPlan)return;
  const p=currentPlan,lines=[`# ${plannedRequest.city} · MoonTrip 行程草案`,'',`预计活动、餐饮与市内交通：${p.total_cost} 元 / 人；活动预算余量：${p.remaining_budget} 元 / 人`,''];
  if(tripLedger)lines.push(`全团 ${tripLedger.people} 人预计 ¥${tripLedger.total}；往返交通 ¥${tripLedger.roundtrip}。每人分摊约 ¥${tripLedger.per_person_estimate}。`,tripLedger.over_budget?`超过全团总预算 ¥${-tripLedger.remaining}。`:'','');
  for(const d of p.days){lines.push(`## 第 ${d.day} 天 · ${dayDate(d.day)}`,'');for(const s of d.stops)lines.push(`- ${clock(s.start)}–${clock(s.end)} ${s.place.name}（${s.place.kind==='food'?'餐饮人均':'活动费用'} ${s.place.cost} 元，接驳 ${s.transfer_cost} 元）`,`  - ${s.meal||'游览'}；${s.route_source}，接驳 ${s.transfer_minutes} 分钟，已查询距离 ${s.transfer_distance} 米\n  - 理由：${s.reasons.join('；')}`,`  - 来源：${s.place.source}`);if(!d.stops.length)lines.push('暂无可行活动。');lines.push('');}
  lines.push('## 规划边界','',...p.warnings.map(w=>`- ${w}`),'','## 未安排景点','',...p.exclusions.map(x=>`- ${x.name}：${x.reason}`));
  download('moontrip-plan.md',lines.join('\n'),'text/markdown;charset=utf-8');
});
$('ask').addEventListener('click',async()=>{
  const message=$('message').value.trim();if(!message){feedback('先写下你想调整的旅行条件。');return;}
  if(!configured){feedback('尚未配置 AI 服务。你可以使用三种示例，或直接调整条件生成行程。');return;}
  $('ask').disabled=true;$('proposal').hidden=true;proposal=undefined;feedback('助手正在整理条件…');
  try{const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,current:request()})});const data=await response.json();if(!data.ok)throw Error(data.errors.join('；'));proposal=data.request;
    $('proposal-text').textContent=`${proposal.city} · ${proposal.days} 天 · 每人规划预算 ${proposal.budget} 元\n每天 ${clock(proposal.start)}–${clock(proposal.end)}\n兴趣：${proposal.interests.join('、')||'不限'}\n亲子 ${proposal.family?'是':'否'} / 雨天 ${proposal.rain?'是':'否'} / 慢游 ${proposal.relaxed?'是':'否'}\n每天最多 ${proposal.max_visits} 个景点 / 餐饮 ${proposal.include_food?'安排':'不安排'} / 饮食 ${proposal.diet}\n请核对：助手只处理上述条件。`;$('proposal').hidden=false;feedback();
  }catch(err){feedback(err.message);}finally{$('ask').disabled=false;}
});
$('apply').addEventListener('click',()=>{if(proposal){setRequest(proposal);$('proposal').hidden=true;generate();}});
if(staticDemo){
  $('ai-status').textContent='在线演示 · 使用手动条件规划';
  $('ask').disabled=true;
  $('ask').textContent='在线演示未启用 AI';
  $('message').placeholder='在线演示请调整下方条件；AI 需求理解可在本地配置服务后使用。';
}else{
  fetch('/api/status').then(r=>r.json()).then(data=>{configured=data.configured;mapsConfigured=Boolean(data.maps_configured);updateMapsStatus();$('ai-status').textContent=configured?`${data.model} · 已配置`:'无密钥演示';}).catch(()=>{$('ai-status').textContent='AI 服务不可用';updateMapsStatus();});
}
let restoredStops=[];
try{const saved=JSON.parse(localStorage.getItem('moontrip.v1')||'null');if(saved){const check=JSON.parse(plan_json(JSON.stringify({request:saved.request,places:saved.places})));if(check.ok){places=saved.places;setRequest(saved.request);$('message').value=saved.message||'';if(saved.preferences)setPreferences(saved.preferences);if(saved.meals){$('include_food').checked=saved.meals.lunch;$('include_dinner').checked=saved.meals.dinner;}if(saved.routing){$('transport').value=saved.routing.mode;$('distance-limit').value=saved.routing.distance_limit/1000;}if(Array.isArray(saved.route_cache))routeCache=saved.route_cache;if(saved.expenses)for(const [id,value] of Object.entries(saved.expenses))if(['people','roundtrip','trip_budget'].includes(id))$(id).value=value;if(saved.trip_start)$('trip-start').value=saved.trip_start;if(Array.isArray(saved.manual_stops))restoredStops=saved.manual_stops;}}}catch{}
generate();if(restoredStops.length)applySchedule(restoredStops);renderMode();

function schedule(){return currentPlan.days.flatMap(day=>day.stops.map(stop=>({id:stop.place.id,day:day.day,start:stop.start})));}
function applySchedule(edits){
  const result=JSON.parse(edit_plan_json(JSON.stringify({input:{request:plannedRequest,places},preferences:preferences(),routing:routing(),meals:meals(),stops:edits})));
  if(!result.ok){feedback(result.errors.join('；'));return false;}
  currentPlan=result.plan;manualStops=edits;render();saveTrip();feedback('已保存手动安排，并重算接驳和预算。');return true;
}
function moveStop(id,delta){const edits=schedule(),index=edits.findIndex(s=>s.id===id),next=index+delta;if(next<0||next>=edits.length||edits[next].day!==edits[index].day){feedback('跨天调整请使用“调整日期和开始时间”。');return;}[edits[index].id,edits[next].id]=[edits[next].id,edits[index].id];applySchedule(edits);}
function sourceLinks(place){return [...new Set([place.url,...(place.source.match(/https?:\/\/[^\s]+/g)||[])].filter(Boolean))];}
function renderCandidates(){
  $('candidates').replaceChildren();
  const restaurants=[];
  for(const p of places.filter(p=>p.city===request().city)){
    if(p.kind==='food'){if(restaurants.some(old=>restaurants_similar(p.city,p.name,old.city,old.name)))continue;restaurants.push(p);}
    const card=e('div',undefined,'candidate');card.append(e('strong',p.name),e('p',`${p.kind==='food'?'餐厅':'景点'} · ${p.district} · ¥${p.cost}/人 · ${p.duration} 分钟`));
    const choices=e('div',undefined,'choices');
    for(const [label,checked,kind] of [['想去',selected.includes(p.id),'select'],['排除',avoided.includes(p.id),'avoid']]){
      const wrap=e('label'),input=e('input');input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',`${p.name} ${label}`);
      input.addEventListener('change',()=>{
        if(kind==='select'){selected=selected.filter(id=>id!==p.id);if(input.checked){selected.push(p.id);avoided=avoided.filter(id=>id!==p.id);if(p.kind==='food'){$('include_food').checked=true;$('include_dinner').checked=true;}}}
        else{avoided=avoided.filter(id=>id!==p.id);if(input.checked){avoided.push(p.id);selected=selected.filter(id=>id!==p.id);}}
        generate();renderCandidates();
      });wrap.append(input,document.createTextNode(label));choices.append(wrap);
    }
    card.append(choices);for(const url of sourceLinks(p)){const link=e('a','来源 ↗','source-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);} $('candidates').append(card);
  }
}
function renderAlternatives(){
  const result=JSON.parse(alternatives_with_preferences_json(JSON.stringify({request:plannedRequest,places,preferences:preferences(),routing:routing(),meals:meals()})));$('alternatives').replaceChildren();if(!result.ok)return;
  for(const alt of result.alternatives){
    const card=e('div',undefined,'alternative'+(alt.request.priority===plannedRequest.priority?' selected':'')),visits=alt.plan.days.flatMap(d=>d.stops),b=e('button',alt.request.priority===plannedRequest.priority?'当前方案':'选择此方案');
    card.append(e('strong',alt.label),e('p',`¥${alt.plan.total_cost} / 人 · ${visits.length} 站`),e('p',visits.slice(0,3).map(s=>s.place.name.replace(' · 演示','')).join(' → ')));b.type='button';b.addEventListener('click',()=>{setRequest(alt.request);generate();});card.append(b);$('alternatives').append(card);
  }
}
$('add-place').addEventListener('submit',ev=>{
  ev.preventDefault();
  if(reviewPoi&&!$('review-confirm').checked){feedback('请先核对资料，再勾选确认。');return;}
  const urls=$('place-urls').value.trim().split(/\s+/);
  if($('place-location').value.trim()&&!/^\d{2,3}(?:\.\d+)?,\d{1,2}(?:\.\d+)?$/.test($('place-location').value.trim())){feedback('坐标请按 经度,纬度 填写，使用英文逗号。');return;}
  if(urls.some(url=>!/^https?:\/\//.test(url))){feedback('请填写 HTTP(S) 来源链接，每行一个。');return;}
  const p={id:reviewPoi?.id||'user-'+Date.now(),name:$('place-name').value.trim(),city:$('place-city').value.trim(),district:$('place-district').value.trim(),kind:$('place-kind').value,location:$('place-location').value.trim(),windows:null,cost:Number($('place-cost').value),duration:Number($('place-duration').value),open:minutes($('place-open').value),close:minutes($('place-close').value),tags:$('place-tags').value.split(/[,，]/).map(t=>t.trim()).filter(Boolean),indoor:$('place-indoor').checked,family:$('place-family').checked,url:urls[0],source:`${reviewPoi?'用户核对':'用户整理，未自动核实'}：${$('place-note').value.trim()}\n${urls.join('\n')}`};
  const check=JSON.parse(plan_json(JSON.stringify({request:{...request(),must_visit:[],avoid:[]},places:[...places.filter(item=>item.id!==p.id),p]})));if(!check.ok){feedback(check.errors.join('；'));return;}
  places=places.filter(item=>item.id!==p.id);places.push(p);
  if(reviewPoi){pendingPlaces=pendingPlaces.filter(item=>item.id!==reviewPoi.id);reviewPoi=undefined;$("review-confirm-wrap").hidden=true;$("review-confirm").checked=false;savePending();renderPending();}
if(![...$('city').options].some(o=>o.value===p.city))$('city').add(new Option(p.city,p.city));if(p.city===$('city').value&&p.kind==='food'){$('include_food').checked=true;$('include_dinner').checked=true;}generate();feedback('已加入候选列表，可勾选后安排进计划。');
});
$('planner').addEventListener('input',ev=>{if(['people','roundtrip','trip_budget','trip-start'].includes(ev.target.id)){renderBudget();saveTrip();return;}feedback('条件已修改，点击“生成我的行程”更新方案与预算。');});
for(const id of ['people','roundtrip','trip_budget'])$(id).addEventListener('change',()=>{renderBudget();saveTrip();});
$('trip-start').addEventListener('change',()=>{if(currentPlan)render();saveTrip();});
for(const id of ['prefer-indoor','prefer-outdoor'])$(id).addEventListener('change',()=>{if($(id).checked)$(id==='prefer-indoor'?'prefer-outdoor':'prefer-indoor').checked=false;});
$('budget-friendly').addEventListener('change',()=>{$('priority').value=$('budget-friendly').checked?'budget':'balanced';});
$('priority').addEventListener('change',()=>{$('budget-friendly').checked=$('priority').value==='budget';});
$('relaxed').addEventListener('change',()=>{if($('relaxed').checked){$('compact').checked=false;travelMode='lazy';$('include_food').checked=true;}else travelMode='custom';renderMode();});
$('compact').addEventListener('change',()=>{if($('compact').checked){$('relaxed').checked=false;travelMode='intense';$('max_visits').value=6;}else travelMode='custom';renderMode();});
$('city').addEventListener('change',()=>{selected=[];avoided=[];generate();if([...$('review-city').options].some(o=>o.value===$('city').value)){$('review-city').value=$('city').value;renderPending();}});
$('export-html').addEventListener('click',()=>{
  if(!currentPlan)return;const page=document.implementation.createHTMLDocument(`${plannedRequest.city} · MoonTrip 离线路书`);
  const style=e('style','body{font:16px/1.8 system-ui;max-width:900px;margin:30px auto;padding:20px;color:#223b36}article{padding:20px;border:1px solid #ddd;border-radius:12px;margin:15px 0}small{color:#687b72}button,.stop-controls,.stop-editor{display:none}h1{font-size:32px}a{color:#285a47}');page.documentElement.lang='zh-CN';page.head.append(style);
  page.body.append(e('h1',`${plannedRequest.city} · ${plannedRequest.days} 天旅行草案`),e('p',`预计每人活动和市内交通 ¥${currentPlan.total_cost}：景点 ¥${currentPlan.activity_cost} / 餐饮 ¥${currentPlan.food_cost} / 接驳 ¥${currentPlan.transfer_cost}`),$('trip-ledger').cloneNode(true),$('itinerary').cloneNode(true),e('h2','规划依据与边界'),$('warnings').cloneNode(true));
  download('moontrip-roadbook.html','<!doctype html>'+page.documentElement.outerHTML,'text/html;charset=utf-8');
});

$('add-city').addEventListener('click',()=>{$('city-entry').hidden=!$('city-entry').hidden;});
$('confirm-city').addEventListener('click',()=>{const city=$('new-city').value.trim();if(!city){feedback('请输入城市名称。');return;}if(![...$('city').options].some(o=>o.value===city))$('city').add(new Option(city,city));$('city').value=city;$('place-city').value=city;selected=[];avoided=[];$('city-entry').hidden=true;generate();});


// The host transports map data; MoonBit validates city queries and candidate records.
const seedCities=JSON.parse(cities_json()).filter(c=>['杭州','成都'].includes(c.city));
for(const city of seedCities)$('review-city').add(new Option(city.city,city.city));
$('review-city').value=seedCities.some(c=>c.city===$('city').value)?$('city').value:'杭州';
$('review-city').addEventListener('change',()=>renderPending());
for(const city of seedCities){const label=e('label'),input=e('input');input.type='checkbox';input.value=city.city;input.checked=city.city==='杭州';label.append(input,document.createTextNode(`${city.province} · ${city.city}`));$('seed-cities').append(label);}
function updateMapsStatus(){
  $('refresh-routes').disabled=staticDemo||!mapsConfigured||routesBusy;
  $('maps-status').textContent=staticDemo?'在线版未启用地点查询':mapsConfigured?'高德 Web 服务 · 本机已连接':'本机尚未连接高德';
  for(const id of ['query-city','query-batch'])$(id).disabled=staticDemo||!mapsConfigured||libraryBusy;
}
function savePending(){try{localStorage.setItem('moontrip.pending.v1',JSON.stringify(pendingPlaces));}catch{$('maps-progress').textContent='浏览器无法保存资料；当前页仍可核对，请避免刷新。';}}
function renderPending(){
  const accepted=[];pendingPlaces=pendingPlaces.filter(p=>{if(accepted.some(old=>old.id===p.id || (old.kind==='food'&&p.kind==='food'&&restaurants_similar(p.city,p.name,old.city,old.name))))return false;accepted.push(p);return true;});
  const visible=pendingPlaces.filter(p=>p.city===$('review-city').value);
  $('pending-count').textContent=`${$('review-city').value} · ${visible.length}`;$('pending-places').replaceChildren();
  for(const p of visible){
    const card=e('article',undefined,'pending-card');card.append(e('h3',`${p.name} · ${p.city}`),e('p',`${p.kind==='food'?'餐厅':'景点'} · ${p.district} · ${p.address||'地址待核对'}`),e('p',`高德人均消费线索：${p.cost_hint||'未提供'}（不等于门票报价）；营业时间线索：${p.open_hint||'未提供'}`,'hint'),e('p',`查询日期：${new Date(p.fetched_at).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})} · 待核对`,'hint'));
    const source=e('a','查看高德地点 ↗');source.href=p.url;source.target='_blank';source.rel='noopener noreferrer';card.append(source);
    const button=e('button','填写并核对');button.type='button';button.addEventListener('click',()=>{
      reviewPoi=p;document.querySelector('.add-place').open=true;
      for(const [id,value] of Object.entries({'place-kind':p.kind,'place-name':p.name,'place-city':p.city,'place-district':p.district,'place-cost':'','place-duration':p.kind==='food'?'60':'90','place-open':'','place-close':'','place-tags':p.kind==='food'?'美食':'','place-location':p.location,'place-urls':p.url,'place-note':`高德地点 ID：${p.id}；地址：${p.address}；坐标（GCJ-02）：${p.location}；查询时间：${p.fetched_at}。\n费用线索：${p.cost_hint||'未提供'}；时间线索：${p.open_hint||'未提供'}。\n请补充你的核对依据和推荐理由。`}))$(id).value=value;
      // Only explicit restaurant consumption and one same-day interval can be prefilled.
      if(p.kind==='food' && /^\d+(\.\d+)?$/.test(p.cost_hint||''))$('place-cost').value=String(Math.ceil(Number(p.cost_hint)));
      const hours=(p.open_hint||'').match(/^(?:周一至周日\s*)?([01]\d|2[0-3]):([0-5]\d)\s*[-–]\s*([01]\d|2[0-3]):([0-5]\d)$/);
      if(hours && `${hours[1]}:${hours[2]}` < `${hours[3]}:${hours[4]}`){$('place-open').value=`${hours[1]}:${hours[2]}`;$('place-close').value=`${hours[3]}:${hours[4]}`;}
      $('place-indoor').checked=false;$('place-family').checked=false;$('review-confirm-wrap').hidden=false;$('review-confirm').checked=false;
      $('add-place').scrollIntoView({behavior:'smooth',block:'start'});
    });card.append(button);$('pending-places').append(card);
  }
}
async function queryCities(cities){
  if(libraryBusy)return;if(!mapsConfigured||staticDemo){$('maps-progress').textContent='地点查询需要打开本机服务 http://127.0.0.1:8787/。';return;}
  if(!cities.length||cities.length>5){$('maps-progress').textContent='请选择 1–5 个城市，可分批查询。';return;}
  $('review-city').value=cities[0];renderPending();
  if(cities.length===1){if(![...$('city').options].some(o=>o.value===cities[0]))$('city').add(new Option(cities[0],cities[0]));$('city').value=cities[0];selected=[];avoided=[];generate();}
  libraryBusy=true;stopBatch=false;updateMapsStatus();$('stop-batch').hidden=false;
  try{
    for(let i=0;i<cities.length;i++){
      if(stopBatch)break;
      for(const kind of ['sight','food']){
        $('maps-progress').textContent=`${i+1}/${cities.length} · 正在查询${cities[i]}${kind==='food'?'餐厅':'景点'}…`;
        const response=await fetch('/api/places',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city:cities[i],kind})});const result=await response.json();
        if(!result.ok)throw Error(result.errors.join('；'));
        const existing=[...places,...pendingPlaces];
        for(const item of result.items)if(!existing.some(old=>old.id===item.id||(old.kind==='food'&&item.kind==='food'&&restaurants_similar(item.city,item.name,old.city,old.name)))){pendingPlaces.push(item);existing.push(item);}
        savePending();renderPending();$('review-list').open=true;
      }
    }
    $('maps-progress').textContent=`${stopBatch?'查询已停止':'查询完成'}，共 ${pendingPlaces.length} 条待核对。选少量合适的地点填写费用和时间即可，未核对资料不会进入行程。`;
  }catch(err){$('maps-progress').textContent=`查询中止：${err.message}。已成功查询的资料仍保留。`;}
  finally{libraryBusy=false;$('stop-batch').hidden=true;updateMapsStatus();}
}
$('query-city').addEventListener('click',()=>queryCities([$('review-city').value]));
$('query-batch').addEventListener('click',()=>queryCities([...$('seed-cities').querySelectorAll('input:checked')].map(i=>i.value)));
$('stop-batch').addEventListener('click',()=>{stopBatch=true;$('maps-progress').textContent='将在当前城市查询结束后停止。';});
$('clear-pending').addEventListener('click',()=>{if(libraryBusy)return;pendingPlaces=[];savePending();renderPending();$('maps-progress').textContent='待核对资料已清空，已加入行程的地点不受影响。';});
updateMapsStatus();renderPending();

function mergePending(items){
  for(const item of items)if(![...pendingPlaces,...places].some(old=>old.id===item.id||(old.kind==='food'&&item.kind==='food'&&restaurants_similar(old.city,old.name,item.city,item.name))))pendingPlaces.push(item);
  savePending();renderPending();
}
for(const [city,id,prefix] of [['杭州','load-hangzhou','hz-'],['成都','load-chengdu','cd-']])$(id).addEventListener('click',async()=>{
  $(id).disabled=true;
  try{
    let data=sourceSnapshots[city];
    if(!data){const response=await fetch(snapshotPaths[city],{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(`${city}资料暂时无法读取`);data=await response.json();}
    if(data.city!==city||!Array.isArray(data.places)||data.places.some(p=>p.city!==city))throw Error('地点资料城市不匹配');
    const next=places.filter(p=>!(p.city===city&&p.id.startsWith(prefix)));
    for(const place of data.places)if(!next.some(old=>old.id===place.id))next.push(place);
    const check=JSON.parse(plan_json(JSON.stringify({request:{...request(),city,must_visit:[],avoid:[]},places:next})));
    if(!check.ok)throw Error(check.errors.join('；'));
    places=next;selected=[];avoided=[];$('city').value=city;$('review-city').value=city;$('place-city').value=city;
    mergePending(data.pending);$('review-list').open=true;
    generate();saveTrip();$('maps-progress').textContent=`已载入 ${data.places.length} 条${city}候选，另有 ${data.pending.length} 条待补充。来源日期 ${new Date(data.updated_at).toLocaleDateString('zh-CN')}。人均消费与游览时长均为估算；饮食、亲子、预约和临时闭园请核实。`;
  }catch(err){feedback(err.message);}
  finally{$(id).disabled=false;}
});
// New visitors can plan immediately from source records; old saved plans stay editable.
for(const data of Object.values(sourceSnapshots))mergePending(data.pending);
$('export-library').addEventListener('click',()=>download('moontrip-places.json',JSON.stringify({places,pending:pendingPlaces},null,2),'application/json'));
function routePoint(p){
  if(!/^\d{2,3}(?:\.\d+)?,\d{1,2}(?:\.\d+)?$/.test(p.location||''))return null;
  const [longitude,latitude]=p.location.split(',').map(Number);return {id:p.id,longitude,latitude};
}
$('walking').addEventListener('change',()=>{if($('walking').checked)$('transport').value='walking';});
$('transport').addEventListener('change',()=>{if($('transport').value!=='walking')$('walking').checked=false;});
$('refresh-routes').addEventListener('click',async()=>{
  if(routesBusy||!currentPlan||!mapsConfigured||staticDemo)return;
  const edits=schedule(),identity=JSON.stringify(edits),city=plannedRequest.city,mode=$('transport').value;
  const legs=[];
  for(const day of currentPlan.days)for(let n=1;n<day.stops.length;n++)legs.push([day.stops[n-1].place,day.stops[n].place]);
  if(!legs.length){$('routes-progress').textContent='每天至少两站才能查询站间路线。';return;}
  const missing=legs.find(([a,b])=>!routePoint(places.find(p=>p.id===a.id)||a)||!routePoint(places.find(p=>p.id===b.id)||b));
  if(missing){$('routes-progress').textContent=`${missing.map(p=>p.name).join(' → ')} 缺少有效坐标；请载入真实资料或在地点资料中补充坐标。`;return;}
  routesBusy=true;updateMapsStatus();let done=0;
  try{
    for(const [from,to] of legs){
      const a=places.find(p=>p.id===from.id),b=places.find(p=>p.id===to.id);
      $('routes-progress').textContent=`${done+1}/${legs.length} · ${a.name} → ${b.name}，正在查询${mode==='walking'?'步行':'公交 / 地铁'}路线…`;
      const response=await fetch('/api/routes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city,mode,origin:routePoint(a),destination:routePoint(b)})});
      const data=await response.json();if(!data.ok)throw Error(data.errors.join('；'));
      routeCache=routeCache.filter(r=>!(r.from_id===a.id&&r.to_id===b.id&&r.mode===mode));
      routeCache.push({...data.route,origin_location:a.location,destination_location:b.location});routeCache=routeCache.slice(-1000);done++;
      if(JSON.stringify(schedule())!==identity||plannedRequest.city!==city||$('transport').value!==mode)throw Error('查询期间行程或交通方式已更改；已查询路段保留，请再查询当前方案');
    }
    const result=JSON.parse(reflow_plan_json(JSON.stringify({input:{request:plannedRequest,places},preferences:preferences(),routing:routing(true),meals:meals(),stops:edits})));
    if(!result.ok)throw Error(result.errors.join('；')+'。当前计划保留原来的时间和估算，可调整上限、减少地点或重新生成');
    currentPlan=result.plan;manualStops=schedule();render();saveTrip();feedback('路线已更新，保留地点和日期，重新安排了开始时间并重算预算。');
    $('routes-progress').textContent=`已查询 ${done} 段${mode==='walking'?'步行':'公交 / 地铁'}路线。时间、距离与票价为查询时的方案预估；第一站出发点接驳未包含。`;
  }catch(err){$('routes-progress').textContent=`${err.message}（已查询 ${done}/${legs.length} 段）`;saveTrip();}
  finally{routesBusy=false;updateMapsStatus();}
});
