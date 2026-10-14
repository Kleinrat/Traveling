import { plan_json, catalogue_json, plan_with_preferences_json, alternatives_with_preferences_json, edit_plan_json, reflow_plan_json, trip_cost_json, cities_json, pending_places_json, restaurants_similar, choose_plan_json, arrange_plan_json, suggestions_json, replacements_json, change_place_json, complete_dinners_json } from './engine.js';
import { emptyLocks, legKey, planStops, planLegs, freshRoutes, historyStore, projectPoints } from './journey.js';
import { mountMap } from './map.js';
const $ = id => document.getElementById(id);
const staticDemo = document.querySelector('meta[name="moontrip-mode"]')?.content === 'static';
const tags = ['自然','文化','历史','美食','摄影','城市','海边','古镇','博物馆','亲子'];
const snapshotPaths={杭州:'./data/hangzhou.json',成都:'./data/chengdu.json'};
const sourceSnapshots={};
await Promise.all(Object.entries(snapshotPaths).map(async([city,url])=>{
  try{const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();if(data.city===city&&Array.isArray(data.places)&&Array.isArray(data.pending))sourceSnapshots[city]=data;}catch{}
}));
const sightEvidence={};
try{const response=await fetch('./data/sight-evidence.json',{signal:AbortSignal.timeout(10000)});if(response.ok){const data=await response.json();if(Array.isArray(data.entries))for(const item of data.entries)if(typeof item.id==='string')sightEvidence[item.id]=item;}}catch{}
let places = Object.values(sourceSnapshots).flatMap(data=>data.places), currentPlan, plannedRequest, proposal, configured = false;
if(!places.length)places=JSON.parse(catalogue_json());
let selected=[], avoided=[];
let travelMode='custom', manualStops=[], tripLedger;
let routeCache=[], routesBusy=false;
let placeChoices={}, locks=emptyLocks(), routeSelections={}, preview, dragging, lastState;
const history=historyStore();
let activeMap;
let replacementTarget, candidateLimit=6, adjustmentFocus, placeAction;
let unarrangedKind="sight";const unarrangedLimits={sight:6,food:6};
function meals(){return {lunch:$('include_food').checked,dinner:$('include_dinner').checked};}
function validRoutes(){return freshRoutes(routeCache,places);}
function routing(strict=false){const chosen=validRoutes().filter(r=>routeSelections[legKey(r.from_id,r.to_id)]===r.option_id);return {mode:chosen.length?'mixed':$('transport').value,strict,distance_limit:Math.round(Number($('distance-limit').value)*1000),routes:chosen};}
function choices(){return Object.entries(placeChoices).filter(([id])=>places.some(p=>p.id===id&&p.city===$('city').value)).map(([id,c])=>({id,state:c.state,day:c.day||0}));}
function syncChoices(){selected=choices().filter(c=>c.state==='must'||c.day>0).map(c=>c.id);avoided=choices().filter(c=>c.state==='avoid').map(c=>c.id);}
function arrangePayload(stops=schedule(),route=routing()){return {input:{request:plannedRequest,places},preferences:preferences(),routing:route,meals:meals(),stops,locks};}
function snapshot(){return {plan:currentPlan,request:plannedRequest,preferences:preferences(),choices:placeChoices,locks,routeSelections,places,routeCache,transport:$('transport').value,distance:$('distance-limit').value,meals:meals()};}
function remember(){if(currentPlan)history.push(lastState||snapshot());}
function clearPreview(){preview=undefined;$('change-preview').hidden=true;}
function identity(){return JSON.stringify({plan:currentPlan,request:request(),preferences:preferences(),meals:meals(),locks,routing:routing(),choices:placeChoices,locations:places.map(p=>[p.id,p.location])});}
function scheduleOf(plan){return planStops(plan);}

const now=new Date();$('trip-start').value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
function preferences(){return {mode:travelMode,environment:$('prefer-indoor').checked?'indoor':$('prefer-outdoor').checked?'outdoor':'any',walking:$('walking').checked,transfer_limit:Number($('transfer-limit').value)};}
function setPreferences(p){travelMode=p.mode||'custom';$('prefer-indoor').checked=p.environment==='indoor';$('prefer-outdoor').checked=p.environment==='outdoor';$('walking').checked=Boolean(p.walking);$('transfer-limit').value=p.transfer_limit??120;$('compact').checked=travelMode==='intense';renderMode();}
function expenses(){return Object.fromEntries(['people','roundtrip','trip_budget'].map(id=>[id,Number($(id).value)]));}
function dayDate(day){const value=$('trip-start').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()+day-1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function saveTrip(){try{localStorage.setItem('moontrip.v1',JSON.stringify({places,request:plannedRequest,message:$('message').value,preferences:preferences(),expenses:expenses(),trip_start:$('trip-start').value,manual_stops:manualStops,transport:$('transport').value,routing:routing(),meals:meals(),route_cache:routeCache,place_choices:placeChoices,locks,route_selections:routeSelections}));}catch{}}
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
function feedback(text='') {for(const id of ['feedback','sheet-feedback']){$(id).hidden=!text;$(id).textContent=text;}}
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
  feedback();syncChoices();
  const r=request(),result=JSON.parse(choose_plan_json(JSON.stringify({input:{request:r,places},preferences:preferences(),routing:routing(),meals:meals(),choices:choices(),locks})));
  if(!result.ok){feedback(result.errors.join('；')+'。当前行程已保留。');return false;}
  remember();currentPlan=result.plan;plannedRequest=r;manualStops=schedule();clearPreview();render();saveTrip();return true;
}

function render(){
  renderCandidates();renderAlternatives();
  renderBudget();renderRouteChoices();renderMap();renderReplacements();$('undo-change').disabled=!history.size;
  $('roadbook-title').textContent=`${plannedRequest.city} · ${plannedRequest.days} 天路书`;$('preferences-short').textContent=`${plannedRequest.city} · ${plannedRequest.days} 天 · ¥${plannedRequest.budget} / 人`;
  const p=currentPlan, count=p.days.reduce((n,d)=>n+d.stops.filter(s=>s.place.kind==='sight').length,0);
  $('budget-detail').textContent=`景点 ¥${p.activity_cost} + 餐饮 ¥${p.food_cost} + 接驳 ¥${p.transfer_cost} / 人（均为当前资料估算）`;
  $('summary').replaceChildren();
  for(const [label,value,unit] of [['安排活动',count,'站'],['预计花费',p.total_cost,'元 / 人'],['预算余量',p.remaining_budget,'元 / 人']]){ const card=e('div',undefined,'metric'),strong=e('strong',String(value)); strong.append(e('span',unit)); card.append(e('small',label),strong); $('summary').append(card); }
  $('itinerary').replaceChildren();
  for(const day of p.days){
    const section=e('div',undefined,'day'),head=e('div',undefined,'day-head');head.append(e('h3',`第 ${day.day} 天 · ${dayDate(day.day)} · ${plannedRequest.city}`),e('small',`预计 ¥${day.cost} / 人`));section.append(head);if(day.stops.length){const sights=day.stops.filter(s=>s.place.kind==='sight').length,mealLabels=day.stops.filter(s=>s.meal).map(s=>s.meal);section.append(e('p',`${clock(day.stops[0].start)} 开始 · ${clock(day.stops.at(-1).end)} 结束 · ${sights} 个景点${mealLabels.length?' · '+mealLabels.join('、'):''}`,'day-overview'));}
    if(!day.stops.length)section.append(e('div','这一天还没有合适的安排。试着放宽条件，或导入更多景点。','empty'));
    for(const stop of day.stops){
      const row=e('article',undefined,'stop'),time=e('div',clock(stop.start),'time'); time.append(e('small',`至 ${clock(stop.end)}`));
      const content=e('div'),title=e('h4',stop.place.name.replace(/\s*·\s*公共步行区$/,''));
      if(stop.place.kind==='food')content.append(e('div',`${stop.meal||'餐饮'} · 人均消费估算`,'tag-food'));
      content.append(title,e('div',`${stop.place.kind==='food'?'用餐':'停留'} ${stop.place.duration} 分钟 · 约 ¥${stop.place.cost} / 人 · ${stop.place.district}`,'meta'));
      const record=places.find(p=>p.id===stop.place.id);if(record?.visit_notice)content.append(e('p',record.visit_notice,'visit-notice'));
      const index=day.stops.indexOf(stop);
      if(index>0){const prior=day.stops[index-1],previous=prior.place,route=routing().routes.find(r=>r.from_id===previous.id&&r.to_id===stop.place.id);const mode=route?(route.mode==='walking'?'步行':'公交 / 地铁'):'站间交通';const gap=Math.max(0,stop.start-prior.end-stop.transfer_minutes);const line=e('p',`建议 ${clock(stop.start-stop.transfer_minutes)} 转场 · ${mode}约 ${stop.transfer_minutes} 分钟 · 约 ¥${stop.transfer_cost} / 人${gap?' · '+gap+' 分钟空档':''}${stop.route_source==='高德路线规划'?'':' · 片区估算'}`,'journey-connection');section.append(line);}
      const details=e('details'),list=e('ul');details.append(e('summary','地点详情'));stop.reasons.forEach(reason=>list.append(e('li',reason)));list.append(e('li',`来源：${stop.place.source}`));details.append(list);
      if(stop.place.kind==='sight'){const ev=sightEvidence[stop.place.id];if(ev){list.append(e('li',`公开时段：${ev.opening_note}`));list.append(e('li',`网络资料查找：${ev.checked_at}；规划窗口 ${clock(stop.place.open)}–${clock(stop.place.close)}，不等同于实际营业时刻。`));}}
      content.append(details);
      for(const url of sourceLinks(stop.place)){const link=e('a','查看来源 ↗','source-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';details.append(link);}
      const controls=e('div',undefined,'stop-controls');
      for(const [label,action] of [['移除',()=>removeStop(stop.place.id)],['↑',()=>moveStop(stop.place.id,-1)],['↓',()=>moveStop(stop.place.id,1)]]){const b=e('button',label);b.type='button';b.addEventListener('click',action);controls.append(b);}row.draggable=true;row.dataset.stopId=stop.place.id;row.addEventListener('dragstart',ev=>{if(ev.target.closest('input,select,button,details')){ev.preventDefault();return;}dragging=stop.place.id;ev.dataTransfer.setData('text/plain',stop.place.id);});row.addEventListener('dragover',ev=>ev.preventDefault());row.addEventListener('drop',ev=>{ev.preventDefault();if(dragging)dropStop(dragging,stop.place.id);dragging=undefined;});
      const editor=e('details',undefined,'stop-editor');editor.append(e('summary','调整这一站'));const fields=e('div',undefined,'fields'),dayLabel=e('label','日期'),daySelect=e('select'),timeLabel=e('label','开始时间'),timeInput=e('input');
      for(let n=1;n<=plannedRequest.days;n++)daySelect.add(new Option(`第 ${n} 天 · ${dayDate(n)}`,String(n)));daySelect.value=String(day.day);timeInput.type='time';timeInput.value=clock(stop.start);dayLabel.append(daySelect);timeLabel.append(timeInput);fields.append(dayLabel,timeLabel);editor.append(fields,e('p','保留其他站的时间；冲突时不会覆盖当前行程。','hint'));const applyEdit=e('button','保存调整');applyEdit.type='button';applyEdit.addEventListener('click',()=>{const edits=schedule();const target=edits.find(s=>s.id===stop.place.id);target.day=Number(daySelect.value);target.start=minutes(timeInput.value);previewSchedule(edits,'调整日期和开始时间',routing(),true);});editor.append(applyEdit,controls);addLocks(editor,stop,day.day);details.append(editor);const replace=e('button','换一站','replace-stop');replace.type='button';replace.setAttribute('aria-label',`替换 ${stop.place.name}`);replace.addEventListener('click',()=>{replacementTarget=stop.place.id;openAdjustment('places');});details.append(replace);row.append(time,content);section.append(row);
    }
    const missingMeals=p.warnings.filter(w=>w.startsWith(`第 ${day.day} 天未安排`));if(missingMeals.length)section.append(e('p',missingMeals.map(w=>w.split('：')[0]).join('；')+'，这部分餐费未计入，请自行补充。','day-caution'));
    if(!day.stops.some(s=>s.meal==='晚餐')){const dinner=e('button','补上晚餐','add-dinner');dinner.type='button';dinner.setAttribute('aria-label',`为路书补上晚餐，第 ${day.day} 天尚未安排`);dinner.addEventListener('click',previewDinners);section.append(dinner);}
    $('itinerary').append(section);
  }
  renderUnarranged();
  $('warnings').replaceChildren(...p.warnings.map(w=>e('li',w)));
  $('data-status').textContent=`已载入 ${places.length} 个地点 · ${[...new Set(places.map(p=>p.city))].join('、')}${places.some(p=>p.source.includes('虚构'))?' · 含虚构示例，可点击上方城市资料按钮替换':''}`;
  lastState=structuredClone(snapshot());
}
const presets={lazy:{days:2,start:600,end:1080,interests:['美食','自然'],relaxed:true,max_visits:2,include_food:true,transfer_limit:90,description:'10:00–18:00 · 每天最多 2 个景点 · 站间休息 45 分钟 · 美食和同片区优先'},intense:{days:2,start:420,end:1320,interests:['文化','历史','摄影'],relaxed:false,max_visits:6,include_food:true,transfer_limit:180,description:'07:00–22:00 · 每天最多 6 个景点 · 站间休息 5 分钟 · 衔接紧凑'},weekend:{days:2,start:540,end:1080,interests:['自然','文化'],relaxed:false,max_visits:3,include_food:true,transfer_limit:60,description:'09:00–18:00 · 2 天轻旅行 · 每天最多 3 个景点 · 接驳估算不超过 60 分钟'}};
function renderMode(){document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===travelMode)));$('mode-description').textContent=presets[travelMode]?.description||'自定义节奏 · 可调整景点数量、作息和接驳上限。';}
$('planner').addEventListener('submit',ev=>{ev.preventDefault();if(generate())showRoadbook();});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const preset=presets[b.dataset.preset];travelMode=b.dataset.preset;setRequest({...request(),...preset});$('transfer-limit').value=preset.transfer_limit;$('include_food').checked=true;$('include_dinner').checked=true;$('distance-limit').value=travelMode==='weekend'?10:30;$('compact').checked=travelMode==='intense';renderMode();feedback('节奏已选好，点击“生成我的路书”应用。');}));
$('remove-demo').addEventListener('click',()=>{const demoIds=new Set(JSON.parse(catalogue_json()).map(p=>p.id));const real=places.filter(p=>!demoIds.has(p.id));if(!real.length){feedback('请先核对并加入至少一个真实地点。');return;}places=real;selected=[];avoided=[];placeChoices={};locks=emptyLocks();routeSelections={};if(!real.some(p=>p.city===$('city').value))$('city').value=real[0].city;generate();});
$('reset').addEventListener('click',()=>{places=JSON.parse(catalogue_json());selected=[];avoided=[];placeChoices={};locks=emptyLocks();routeSelections={};generate();});
$('import').addEventListener('change',async ev=>{
  const file=ev.target.files[0];if(!file)return;
  try{
    if(file.size>1000000)throw Error('景点文件不能超过 1 MB');
    const raw=JSON.parse(await file.text()),imported=Array.isArray(raw)?raw:raw.places;if(!Array.isArray(imported))throw Error('请导入景点 JSON 数组');
    const check=JSON.parse(plan_json(JSON.stringify({request:{...request(),must_visit:[],avoid:[]},places:imported})));
    if(!check.ok)throw Error(check.errors.join('；'));
    places=imported;routeCache=[];selected=[];avoided=[];placeChoices={};locks=emptyLocks();routeSelections={};if(Array.isArray(raw.pending))mergePending(raw.pending);for(const city of new Set(places.map(p=>p.city)))if(![...$('city').options].some(o=>o.value===city))$('city').add(new Option(city,city));
    generate();
  }catch(err){feedback(err.message);}finally{ev.target.value='';}
});
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=e('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-json').addEventListener('click',()=>{if(currentPlan)download('moontrip-plan.json',JSON.stringify({request:plannedRequest,preferences:preferences(),trip_start:$('trip-start').value,expenses:expenses(),ledger:tripLedger,manual_stops:manualStops,transport:$('transport').value,routing:routing(),meals:meals(),route_cache:routeCache,place_choices:placeChoices,locks,route_selections:routeSelections,places,plan:currentPlan},null,2),'application/json');});
$('export-md').addEventListener('click',()=>{
  if(!currentPlan)return;
  const p=currentPlan,lines=[`# ${plannedRequest.city} · MoonTrip 行程草案`,'',`预计活动、餐饮与市内交通：${p.total_cost} 元 / 人；活动预算余量：${p.remaining_budget} 元 / 人`,''];
  if(tripLedger)lines.push(`全团 ${tripLedger.people} 人预计 ¥${tripLedger.total}；往返交通 ¥${tripLedger.roundtrip}。每人分摊约 ¥${tripLedger.per_person_estimate}。`,tripLedger.over_budget?`超过全团总预算 ¥${-tripLedger.remaining}。`:'','');
  for(const d of p.days){lines.push(`## 第 ${d.day} 天 · ${dayDate(d.day)}`,'');for(const s of d.stops)lines.push(`- ${clock(s.start)}–${clock(s.end)} ${s.place.name}（${s.place.kind==='food'?'餐饮人均':'活动费用'} ${s.place.cost} 元，接驳 ${s.transfer_cost} 元）`,`  - ${s.meal||'游览'}；${s.route_source}，接驳 ${s.transfer_minutes} 分钟，已查询距离 ${s.transfer_distance} 米\n  - 理由：${s.reasons.join('；')}`,`  - 来源：${s.place.source}`,`  - 锁定：${locks.places.some(l=>l.id===s.place.id)?'地点与日期 ':''}${locks.times.some(l=>l.id===s.place.id)?'开始时间':''}`);if(!d.stops.length)lines.push('暂无可行活动。');lines.push('');}
  lines.push('## 规划边界','',...p.warnings.map(w=>`- ${w}`),'','## 未安排地点','',...p.exclusions.map(x=>`- ${x.name}：${x.reason}`));
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
$('apply').addEventListener('click',()=>{if(proposal){setRequest(proposal);$('proposal').hidden=true;if(generate())showRoadbook();}});
if(staticDemo){
  $('ai-status').textContent='在线演示 · 使用手动条件规划';
  $('ask').disabled=true;
  $('ask').textContent='在线演示未启用 AI';
  $('message').placeholder='在线演示请调整下方条件；AI 需求理解可在本地配置服务后使用。';
}else{
  fetch('/api/status').then(r=>r.json()).then(data=>{configured=data.configured;mapsConfigured=Boolean(data.maps_configured);updateMapsStatus();$('ai-status').textContent=configured?`${data.model} · 已配置`:'无密钥演示';}).catch(()=>{$('ai-status').textContent='AI 服务不可用';updateMapsStatus();});
}
let restoredStops=[];
try{const saved=JSON.parse(localStorage.getItem('moontrip.v1')||'null');if(saved){const check=JSON.parse(plan_json(JSON.stringify({request:saved.request,places:saved.places})));if(check.ok){places=saved.places;setRequest(saved.request);$('message').value=saved.message||'';if(saved.preferences)setPreferences(saved.preferences);if(saved.meals){$('include_food').checked=saved.meals.lunch;$('include_dinner').checked=saved.meals.dinner;}if(saved.routing){$('transport').value=saved.transport||(['walking','transit'].includes(saved.routing.mode)?saved.routing.mode:'transit');$('distance-limit').value=saved.routing.distance_limit/1000;}if(Array.isArray(saved.route_cache)){routeCache=saved.route_cache.map((r,i)=>({...r,option_id:r.option_id||'legacy-'+i}));routeSelections=saved.route_selections||Object.fromEntries(routeCache.filter(r=>r.mode===$('transport').value).map(r=>[legKey(r.from_id,r.to_id),r.option_id]));}placeChoices=saved.place_choices||Object.fromEntries([...selected.map(id=>[id,{state:'must',day:0}]),...avoided.map(id=>[id,{state:'avoid',day:0}])]);if(saved.locks)locks=saved.locks;if(saved.expenses)for(const [id,value] of Object.entries(saved.expenses))if(['people','roundtrip','trip_budget'].includes(id))$(id).value=value;if(saved.trip_start)$('trip-start').value=saved.trip_start;if(Array.isArray(saved.manual_stops))restoredStops=saved.manual_stops;}}}catch{}
if(restoredStops.length){const result=JSON.parse(arrange_plan_json(JSON.stringify({input:{request:request(),places},preferences:preferences(),routing:routing(),meals:meals(),stops:restoredStops,locks,exact:true})));if(result.ok){currentPlan=result.plan;plannedRequest=request();manualStops=schedule();render();}else{locks=emptyLocks();generate();feedback('保存的安排暂不可恢复：'+result.errors.join('；'));}}else generate();renderMode();if(restoredStops.length)$('preferences-panel').removeAttribute('open');

function schedule(){return currentPlan?planStops(currentPlan):[];}
function applySchedule(edits){
  const result=JSON.parse(arrange_plan_json(JSON.stringify({...arrangePayload(edits),exact:true})));
  if(!result.ok){feedback(result.errors.join('；'));return false;}
  currentPlan=result.plan;manualStops=schedule();render();saveTrip();return true;
}
function previewSchedule(edits,label,route=routing(),exact=false,nextRequest=plannedRequest,nextChoices){
  if(!sameConditions()){feedback('条件已修改，请先生成行程，再调整路线。');return;}
  const result=JSON.parse(arrange_plan_json(JSON.stringify({...arrangePayload(edits,route),input:{request:nextRequest,places},exact})));
  if(!result.ok){feedback(result.errors.join('；')+'。当前行程已保留。');return;}
  showPreview({label,plan:result.plan,routing:route,request:nextRequest,choices:nextChoices});
}
function removeStop(id){const r={...plannedRequest,must_visit:plannedRequest.must_visit.filter(p=>p!==id),avoid:[...new Set([...plannedRequest.avoid,id])]};const next={...placeChoices,[id]:{state:'avoid',day:0}};previewSchedule(schedule().filter(s=>s.id!==id),'移除这站',routing(),false,r,next);}
function sameConditions(){return JSON.stringify(request())===JSON.stringify(plannedRequest)&&(!lastState||(JSON.stringify(preferences())===JSON.stringify(lastState.preferences)&&JSON.stringify(meals())===JSON.stringify(lastState.meals)&&$('transport').value===lastState.transport&&$('distance-limit').value===lastState.distance));}
function moveStop(id,delta){const edits=schedule(),index=edits.findIndex(s=>s.id===id),next=index+delta;if(next<0||next>=edits.length||edits[next].day!==edits[index].day){feedback('跨天调整请使用“调整日期和开始时间”。');return;}[edits[index],edits[next]]=[edits[next],edits[index]];previewSchedule(edits,'调整当天顺序');}
function dropStop(from,to){const edits=schedule(),a=edits.findIndex(s=>s.id===from),b=edits.findIndex(s=>s.id===to);if(a===b||a<0||b<0)return;if(edits[a].day!==edits[b].day){feedback('拖动只调整当天顺序；跨天请使用日期选项。');return;}edits.splice(b,0,edits.splice(a,1)[0]);previewSchedule(edits,'拖动调整当天顺序');}
function sourceLinks(place){return [...new Set([place.url,...(place.source.match(/https?:\/\/[^\s]+/g)||[])].filter(Boolean))];}
function renderCandidates(){
  const query=$('candidate-search').value.trim().toLowerCase();let count=0,total=0;
  $('candidates').replaceChildren();
  const restaurants=[];
  for(const p of places.filter(p=>p.city===request().city)){
    if(p.kind==='food'){if(restaurants.some(old=>restaurants_similar(p.city,p.name,old.city,old.name)))continue;restaurants.push(p);}
    if(query&&!`${p.name} ${p.district}`.toLowerCase().includes(query))continue;total++;if(count++>=candidateLimit)continue;
    const card=e('div',undefined,'candidate');card.append(e('strong',p.name),e('p',`${p.kind==='food'?'餐厅':'景点'} · ${p.district} · ¥${p.cost}/人 · ${p.duration} 分钟`));
    const choice=placeChoices[p.id]||{state:'maybe',day:0},controls=e('div',undefined,'choices'),state=e('select'),day=e('select');
    for(const [value,label] of [['must','必去'],['maybe','备选'],['avoid','不去']])state.add(new Option(label,value));state.value=choice.state;state.setAttribute('aria-label',`${p.name} 选择`);
    day.add(new Option('日期不限','0'));for(let n=1;n<=Number($('days').value);n++)day.add(new Option(`第 ${n} 天`,String(n)));day.value=String(choice.day);day.disabled=choice.state==='avoid';day.setAttribute('aria-label',`${p.name} 指定日期`);
    function update(){placeChoices[p.id]={state:state.value,day:state.value==='avoid'?0:Number(day.value)};syncChoices();clearPreview();renderCandidates();feedback('地点选择已修改，点击“按我的选择生成”应用。');}
    state.addEventListener('change',update);day.addEventListener('change',update);controls.append(state,day);
    card.append(controls);for(const url of sourceLinks(p)){const link=e('a','来源 ↗','source-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);} $('candidates').append(card);
  }
  $('more-candidates').hidden=total<=candidateLimit;if(!total)$('candidates').append(e('p','没有找到这个地点。','hint'));
}
function renderAlternatives(){
  const result={ok:true,alternatives:['balanced','budget','interest'].map((priority,i)=>{const r={...plannedRequest,priority};const checked=JSON.parse(choose_plan_json(JSON.stringify({input:{request:r,places},preferences:preferences(),routing:routing(),meals:meals(),choices:choices(),locks})));return checked.ok?{label:['均衡体验','预算优先','兴趣优先'][i],request:r,plan:checked.plan}:null;}).filter(Boolean)};$('alternatives').replaceChildren();if(!result.ok)return;
  for(const alt of result.alternatives){
    const card=e('div',undefined,'alternative'+(alt.request.priority===plannedRequest.priority?' selected':'')),visits=alt.plan.days.flatMap(d=>d.stops),b=e('button',alt.request.priority===plannedRequest.priority?'当前方案':'选择此方案');
    card.append(e('strong',alt.label),e('p',`¥${alt.plan.total_cost} / 人 · ${visits.length} 站`),e('p',visits.slice(0,3).map(s=>s.place.name.replace(' · 演示','')).join(' → ')));b.type='button';b.addEventListener('click',()=>{showPreview({...alt,label:alt.label,routing:routing()});});card.append(b);$('alternatives').append(card);
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
$('planner').addEventListener('input',ev=>{if(['people','roundtrip','trip_budget','trip-start'].includes(ev.target.id)){renderBudget();saveTrip();return;}feedback('条件已修改，点击“生成我的路书”更新方案与预算。');});
for(const id of ['people','roundtrip','trip_budget'])$(id).addEventListener('change',()=>{renderBudget();saveTrip();});
$('trip-start').addEventListener('change',()=>{if(currentPlan)render();saveTrip();});
for(const id of ['prefer-indoor','prefer-outdoor'])$(id).addEventListener('change',()=>{if($(id).checked)$(id==='prefer-indoor'?'prefer-outdoor':'prefer-indoor').checked=false;});
$('budget-friendly').addEventListener('change',()=>{$('priority').value=$('budget-friendly').checked?'budget':'balanced';});
$('priority').addEventListener('change',()=>{$('budget-friendly').checked=$('priority').value==='budget';});
$('relaxed').addEventListener('change',()=>{if($('relaxed').checked){$('compact').checked=false;travelMode='lazy';$('include_food').checked=true;}else travelMode='custom';renderMode();});
$('compact').addEventListener('change',()=>{if($('compact').checked){$('relaxed').checked=false;travelMode='intense';$('max_visits').value=6;}else travelMode='custom';renderMode();});
$('city').addEventListener('change',()=>{selected=[];avoided=[];placeChoices={};locks=emptyLocks();routeSelections={};generate();if([...$('review-city').options].some(o=>o.value===$('city').value)){$('review-city').value=$('city').value;renderPending();}});
$('export-html').addEventListener('click',()=>{
  if(!currentPlan)return;const page=document.implementation.createHTMLDocument(`${plannedRequest.city} · MoonTrip 离线路书`);
  const style=e('style','body{font:16px/1.8 system-ui;max-width:900px;margin:30px auto;padding:20px;color:#223b36}article{padding:20px;border:1px solid #ddd;border-radius:12px;margin:15px 0}small{color:#687b72}button,.stop-controls,.stop-editor{display:none}h1{font-size:32px}a{color:#285a47}');page.documentElement.lang='zh-CN';page.head.append(style);
  page.body.append(e('h1',`${plannedRequest.city} · ${plannedRequest.days} 天旅行路书`),e('p',`预计每人活动和市内交通 ¥${currentPlan.total_cost}：景点 ¥${currentPlan.activity_cost} / 餐饮 ¥${currentPlan.food_cost} / 接驳 ¥${currentPlan.transfer_cost}`),$('trip-ledger').cloneNode(true),$('itinerary').cloneNode(true),e('h2','规划依据与边界'),$('warnings').cloneNode(true));
  download('moontrip-roadbook.html','<!doctype html>'+page.documentElement.outerHTML,'text/html;charset=utf-8');
});

$('add-city').addEventListener('click',()=>{$('city-entry').hidden=!$('city-entry').hidden;});
$('confirm-city').addEventListener('click',()=>{const city=$('new-city').value.trim();if(!city){feedback('请输入城市名称。');return;}if(![...$('city').options].some(o=>o.value===city))$('city').add(new Option(city,city));$('city').value=city;$('place-city').value=city;selected=[];avoided=[];placeChoices={};locks=emptyLocks();routeSelections={};$('city-entry').hidden=true;generate();});


// The host transports map data; MoonBit validates city queries and candidate records.
const seedCities=JSON.parse(cities_json()).filter(c=>['杭州','成都'].includes(c.city));
for(const city of seedCities)$('review-city').add(new Option(city.city,city.city));
$('review-city').value=seedCities.some(c=>c.city===$('city').value)?$('city').value:'杭州';
$('review-city').addEventListener('change',()=>renderPending());
for(const city of seedCities){const label=e('label'),input=e('input');input.type='checkbox';input.value=city.city;input.checked=city.city==='杭州';label.append(input,document.createTextNode(`${city.province} · ${city.city}`));$('seed-cities').append(label);}
function updateMapsStatus(){
  $('refresh-routes').disabled=staticDemo||!mapsConfigured||routesBusy;$('get-suggestions').disabled=routesBusy;
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
    const ev=p.kind==='sight'?sightEvidence[p.id]:undefined;
    if(ev){
      card.append(e('p',`网络资料查找 ${ev.checked_at} · ${ev.fee_yuan===null?'门票未确认':`普通成人费用参考 ¥${ev.fee_yuan}`}。${ev.fee_note}`,'hint'));
      const details=e('details',undefined,'sight-research');details.append(e('summary','查看已查到的费用与开放资料'),e('p',ev.opening_note),e('p',ev.notes));
      for(const item of ev.sources||[])if(typeof item.url==='string'&&item.url.startsWith('https://')){const a=e('a',`${item.title} ↗`,'source-link');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';details.append(a);}
      card.append(details,e('p',ev.status==='closed'?'官方公告暂时关闭，未加入规划候选。':'资料已整理；日期限制、范围或证据尚不完整，暂未自动加入规划。','hint'));$('pending-places').append(card);continue;
    }
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
  if(cities.length===1){if(![...$('city').options].some(o=>o.value===cities[0]))$('city').add(new Option(cities[0],cities[0]));$('city').value=cities[0];selected=[];avoided=[];placeChoices={};locks=emptyLocks();routeSelections={};generate();}
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
    const snapshotIds=new Set(data.places.map(p=>p.id));
    const next=places.filter(p=>!(p.city===city&&(p.id.startsWith(prefix)||(snapshotIds.has(p.id)&&!/^用户核对|^用户整理/.test(p.source||'')))));
    for(const place of data.places)if(!next.some(old=>old.id===place.id))next.push(place);
    const check=JSON.parse(plan_json(JSON.stringify({request:{...request(),city,must_visit:[],avoid:[]},places:next})));
    if(!check.ok)throw Error(check.errors.join('；'));
    places=next;selected=[];avoided=[];placeChoices={};locks=emptyLocks();routeSelections={};$('city').value=city;$('review-city').value=city;$('place-city').value=city;
    pendingPlaces=pendingPlaces.filter(p=>!places.some(active=>active.id===p.id));mergePending(data.pending);$('review-list').open=true;
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
  const edits=schedule(),baseline=JSON.stringify(edits),city=plannedRequest.city;
  const legs=planLegs(currentPlan);
  if(!legs.length){$('routes-progress').textContent='每天至少两站才能查询站间路线。';return;}
  routesBusy=true;updateMapsStatus();let done=0,failures=[];
  try{
    for(const {from,to} of legs){
      const a=places.find(p=>p.id===from.id),b=places.find(p=>p.id===to.id);
      if(!routePoint(a)||!routePoint(b)){failures.push(`${from.name} → ${to.name} 缺少有效坐标`);continue;}
      for(const mode of ['walking','transit']){
        $('routes-progress').textContent=`${done+1}/${legs.length*2} · ${a.name} → ${b.name}，查询${mode==='walking'?'步行':'公交 / 地铁'}候选…`;
        try{
          const response=await fetch('/api/routes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city,mode,origin:routePoint(a),destination:routePoint(b)}),signal:AbortSignal.timeout(30000)});
          const data=await response.json();if(!data.ok)throw Error(data.errors.join('；'));
          const items=(data.options||[{id:'legacy-'+mode,route:data.route}]).map(o=>({...o.route,option_id:o.id+'@'+o.route.fetched_at,walking_distance:o.walking_distance,transfers:o.transfers,summary:o.summary,origin_location:a.location,destination_location:b.location}));
          // Keep a locked route available until it expires. Querying never selects a route.
          routeCache=routeCache.filter(r=>!(r.from_id===a.id&&r.to_id===b.id&&r.mode===mode)||routeSelections[legKey(r.from_id,r.to_id)]===r.option_id||locks.legs.some(l=>sameRoute(l,r)));
          for(const r of items)if(!routeCache.some(old=>old.option_id===r.option_id&&old.fetched_at===r.fetched_at))routeCache.push(r);
          routeCache=routeCache.slice(-1000);
        }catch(err){failures.push(`${a.name} → ${b.name} ${mode==='walking'?'步行':'公交/地铁'}：${err.message}`);}
        done++;
        if(JSON.stringify(schedule())!==baseline||plannedRequest.city!==city)throw Error('查询期间行程已更改；已查候选保留，请重新查询当前行程');
      }
    }
    renderRouteChoices();saveTrip();
    $('routes-progress').textContent=`已完成 ${done} 次候选查询。当前安排未改变，请逐段预览并选择。${failures.length?'未完成：'+failures.join('；'):''}`;
  }catch(err){$('routes-progress').textContent=err.message;renderRouteChoices();saveTrip();}
  finally{routesBusy=false;updateMapsStatus();}
});

function sameRoute(a,b){return ['from_id','to_id','mode','minutes','distance','cost','fetched_at'].every(k=>a[k]===b[k]);}
function routeLabel(r){return `${r.mode==='walking'?'步行':'公交 / 地铁'} · ${r.minutes} 分钟 · ¥${r.cost} / 人 · ${(r.distance/1000).toFixed(2)} 公里`;}
function addLocks(content,stop,day){
  const controls=e('div',undefined,'lock-controls');
  for(const [kind,label] of [['places','锁定地点与日期'],['times','锁定开始时间']]){
    const wrap=e('label'),box=e('input');box.type='checkbox';box.checked=locks[kind].some(l=>l.id===stop.place.id);
    box.addEventListener('change',()=>{remember();locks[kind]=locks[kind].filter(l=>l.id!==stop.place.id);if(box.checked)locks[kind].push({id:stop.place.id,day,start:stop.start});clearPreview();render();saveTrip();});wrap.append(box,document.createTextNode(label));controls.append(wrap);
  }
  content.append(controls);
}
function renderRouteChoices(){
  $('route-choices').replaceChildren();
  if(!currentPlan)return;
  for(const leg of planLegs(currentPlan)){
    const key=legKey(leg.from.id,leg.to.id),card=e('article',undefined,'route-choice');
    card.append(e('h3',`第 ${leg.day} 天 · ${leg.from.name} → ${leg.to.name}`));
    const active=routing().routes.find(r=>legKey(r.from_id,r.to_id)===key);
    card.append(e('p',active?`已选择：${routeLabel(active)}`:`当前为片区估算：${leg.stop.transfer_minutes} 分钟 / ¥${leg.stop.transfer_cost}，距离未知`,'hint'));
    const available=validRoutes().filter(r=>legKey(r.from_id,r.to_id)===key);
    const unique=available.filter((r,i)=>available.findIndex(v=>v.option_id===r.option_id)===i);
    for(const r of unique){
      const row=e('div',undefined,'transport-option'),description=e('div');description.append(e('strong',routeLabel(r)),e('p',`${r.summary||'路线详情未提供'} · 步行 ${r.walking_distance==null?'未知':r.walking_distance+' 米'} · 换乘 ${r.transfers==null?'未知':r.transfers+' 次'}`,'hint'));
      const button=e('button',active&&sameRoute(active,r)?'当前选择':'预览此方案');button.type='button';button.disabled=Boolean(active&&sameRoute(active,r));button.addEventListener('click',()=>{const route=routing();route.mode='mixed';route.routes=route.routes.filter(old=>legKey(old.from_id,old.to_id)!==key);route.routes.push(r);previewSchedule(schedule(),'选择这段交通',route);});row.append(description,button);card.append(row);
    }
    if(!unique.length)card.append(e('p',staticDemo?'在线版可先调整地点与顺序；真实交通候选需在本地查询。':'点击上方查询按钮获取步行、公交 / 地铁候选。','hint'));
    if(active){const wrap=e('label'),box=e('input');box.type='checkbox';box.checked=locks.legs.some(l=>legKey(l.from_id,l.to_id)===key);box.addEventListener('change',()=>{remember();locks.legs=locks.legs.filter(l=>legKey(l.from_id,l.to_id)!==key);if(box.checked)locks.legs.push({...active});clearPreview();render();saveTrip();});wrap.append(box,document.createTextNode('锁定这段交通与衔接地点'));wrap.className='lock-controls';card.append(wrap);}
    $('route-choices').append(card);
  }
}
function showPreview(change){
  if(!$('adjustment-dialog').hasAttribute('open'))openAdjustment('pace');
  preview={...change,identity:identity()};const box=$('change-preview');box.hidden=false;$('preview-title').textContent=change.label;
  const current=currentPlan,plan=change.plan;
  $('preview-detail').replaceChildren(e('p',change.reason||'请检查变动；确认后才会更新行程。'),e('p',`预计每人花费：¥${current.total_cost} → ¥${plan.total_cost}（${plan.total_cost-current.total_cost>=0?'+':''}${plan.total_cost-current.total_cost} 元）`));
  const old=schedule(),next=scheduleOf(plan);let changed=false;
  const full=e('details',undefined,'preview-schedule');full.append(e('summary','展开完整调整后路书'));
  for(const d of plan.days){const group=e('div',undefined,'preview-day');group.append(e('strong',`第 ${d.day} 天`));for(const s of d.stops){const was=old.find(x=>x.id===s.place.id);if(!was||was.day!==d.day||was.start!==s.start)changed=true;group.append(e('p',`${clock(s.start)}–${clock(s.end)} ${s.place.name}`));}full.append(group);}
  const changedStops=next.filter(s=>{const was=old.find(x=>x.id===s.id);return !was||was.day!==s.day||was.start!==s.start;});
  if(changedStops.length)$('preview-detail').append(e('p',`${changedStops.length} 站的地点或时间将调整；详细安排可展开查看。`));
  $('preview-detail').append(full);
  for(const removed of old.filter(s=>!next.some(n=>n.id===s.id))){changed=true;$('preview-detail').append(e('p',`移除：${places.find(p=>p.id===removed.id)?.name||removed.id}`));}
  for(const r of change.routing.routes){const was=routing().routes.find(x=>legKey(x.from_id,x.to_id)===legKey(r.from_id,r.to_id));if(!was||!sameRoute(was,r)){$('preview-detail').append(e('p',`前往 ${places.find(p=>p.id===r.to_id)?.name||r.to_id}：${routeLabel(r)}`));changed=true;}}
  if(!changed)$('preview-detail').append(e('p','地点、日期和时刻保持一致。'));
  if(plan.warnings.some(w=>w.includes('未安排')))$('preview-detail').append(e('p',plan.warnings.filter(w=>w.includes('未安排')).join('；'),'hint'));
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('accept-change').addEventListener('click',()=>{
  if(!preview)return;if(identity()!==preview.identity){clearPreview();feedback('预览期间条件或行程已变化，请重新预览。');return;}
  const target=preview,newRequest=target.request||plannedRequest;
  const result=JSON.parse(arrange_plan_json(JSON.stringify({...arrangePayload(scheduleOf(target.plan),target.routing),input:{request:newRequest,places},preferences:target.preferences||preferences(),meals:target.meals||meals(),exact:true})));
  if(!result.ok){feedback(result.errors.join('；')+'。当前行程保留。');return;}
  if(target.routing.routes.some(r=>!validRoutes().some(x=>sameRoute(x,r)))){clearPreview();feedback('交通候选已过期，请重新查询并预览。');return;}
  remember();currentPlan=result.plan;plannedRequest=newRequest;if(target.request)setRequest(target.request);if(target.choices)placeChoices=target.choices;if(target.preferences)setPreferences(target.preferences);if(target.meals){$('include_food').checked=target.meals.lunch;$('include_dinner').checked=target.meals.dinner;}syncChoices();
  routeSelections={};for(const r of target.routing.routes){const option=validRoutes().find(x=>sameRoute(x,r));if(option)routeSelections[legKey(r.from_id,r.to_id)]=option.option_id;}
  manualStops=schedule();clearPreview();$('suggestions').replaceChildren();render();saveTrip();closeAdjustment();showRoadbook();feedback('已更新路书，可撤销这次调整。');
});
$('dismiss-change').addEventListener('click',()=>{clearPreview();feedback('已忽略这项调整，行程保持原样。');});
$('undo-change').addEventListener('click',()=>{
  const old=history.pop();if(!old)return;
  const cached=[...old.routeCache,...routeCache].filter((r,i,all)=>all.findIndex(x=>x.option_id===r.option_id)===i).slice(-1000);
  const chosen=freshRoutes(cached,old.places).filter(r=>old.routeSelections[legKey(r.from_id,r.to_id)]===r.option_id);
  const route={mode:chosen.length?'mixed':old.transport,strict:false,distance_limit:Math.round(Number(old.distance)*1000),routes:chosen};
  const result=JSON.parse(arrange_plan_json(JSON.stringify({input:{request:old.request,places:old.places},preferences:old.preferences,routing:route,meals:old.meals,stops:scheduleOf(old.plan),locks:old.locks,exact:true})));
  if(!result.ok){history.push(old);feedback('当前无法恢复这次调整：'+result.errors.join('；')+'。路线可能已过期，请重新查询。');return;}
  lastState=undefined;places=old.places;routeCache=cached;const facts=p=>({cost:p.total_cost,stops:p.days.flatMap(d=>d.stops.map(s=>[d.day,s.place.id,s.start,s.end,s.transfer_minutes,s.transfer_cost,s.transfer_distance,s.route_source]))});currentPlan=JSON.stringify(facts(result.plan))===JSON.stringify(facts(old.plan))?old.plan:result.plan;plannedRequest=old.request;setRequest(old.request);setPreferences(old.preferences);placeChoices=old.choices;locks=old.locks;routeSelections=old.routeSelections;$('transport').value=old.transport;$('distance-limit').value=old.distance;$('include_food').checked=old.meals.lunch;$('include_dinner').checked=old.meals.dinner;syncChoices();manualStops=schedule();clearPreview();$('suggestions').replaceChildren();render();saveTrip();feedback('已撤销上一次调整，并校验当前有效路线与预算。');
});
$('apply-choices').addEventListener('click',()=>{if(generate()){closeAdjustment();showRoadbook();}});
$('get-suggestions').addEventListener('click',async()=>{
  if(!sameConditions()){feedback('条件已修改，请先生成行程再获取建议。');return;}
  const baseline=identity();
  // Bounded optional queries provide directional links needed by up to three sight swaps.
  if(mapsConfigured&&!staticDemo){
    const pairs=new Map();let swaps=0;
    for(const d of currentPlan.days)for(let i=1;i<d.stops.length&&swaps<3;i++){
      if(d.stops[i-1].place.kind!=='sight'||d.stops[i].place.kind!=='sight')continue;
      const order=d.stops.map(s=>s.place);[order[i-1],order[i]]=[order[i],order[i-1]];
      for(let j=1;j<order.length;j++){const a=places.find(p=>p.id===order[j-1].id),b=places.find(p=>p.id===order[j].id);if(a&&b&&routePoint(a)&&routePoint(b)&&!validRoutes().some(r=>r.from_id===a.id&&r.to_id===b.id))pairs.set(legKey(a.id,b.id),[a,b]);}
      swaps++;
    }
    routesBusy=true;updateMapsStatus();let done=0;
    try{
      for(const [a,b] of [...pairs.values()].slice(0,9)){
        $('routes-progress').textContent=`补充顺序比较路线 ${++done}/${Math.min(pairs.size,9)} · ${a.name} → ${b.name}`;
        try{const response=await fetch('/api/routes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({city:plannedRequest.city,mode:$('transport').value,origin:routePoint(a),destination:routePoint(b)}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(data.ok)for(const o of data.options||[]){const r={...o.route,option_id:o.id+'@'+o.route.fetched_at,walking_distance:o.walking_distance,transfers:o.transfers,summary:o.summary,origin_location:a.location,destination_location:b.location};if(!routeCache.some(x=>x.option_id===r.option_id))routeCache.push(r);}}catch{}
        if(identity()!==baseline){feedback('查询期间行程或条件已变化，请重新获取建议。');return;}
      }
      routeCache=routeCache.slice(-1000);saveTrip();$('routes-progress').textContent='顺序比较所需路线已查询；资料不完整或无改进的调整不会形成建议。';
    }finally{routesBusy=false;updateMapsStatus();}
  }
  const result=JSON.parse(suggestions_json(JSON.stringify({...arrangePayload(),options:validRoutes()})));$('suggestions').replaceChildren();
  if(!result.ok){feedback(result.errors.join('；'));return;}
  if(!result.suggestions.length){$('suggestions').append(e('p','当前没有通过时间、预算和锁定校验的改进方案。可先查询交通候选；资料不足时不会虚构节省效果。','hint'));return;}
  for(const s of result.suggestions){const card=e('article',undefined,'suggestion');card.append(e('h3',s.label),e('p',s.reason),e('p',`接驳时间 ${s.transfer_delta>0?'+':''}${s.transfer_delta} 分钟 · 每人费用 ${s.cost_delta>0?'+':''}${s.cost_delta} 元`));const accept=e('button','预览变动'),ignore=e('button','忽略');accept.type=ignore.type='button';accept.addEventListener('click',()=>showPreview(s));ignore.addEventListener('click',()=>card.remove());card.append(accept,ignore);$('suggestions').append(card);}
});
function renderMap(){
  const daySelect=$('map-day'),old=daySelect.value;daySelect.replaceChildren();if(!currentPlan)return;for(const d of currentPlan.days)daySelect.add(new Option(`第 ${d.day} 天`,String(d.day)));if([...daySelect.options].some(o=>o.value===old))daySelect.value=old;drawMap();
}
function mapDetail(p){const s=p.stop;$('map-detail').replaceChildren(e('strong',`${p.index+1}. ${s.place.name}`),e('p',`${clock(s.start)}–${clock(s.end)} · ${s.place.district} · ¥${s.place.cost} / 人`));const record=places.find(x=>x.id===p.id);if(record?.address)$('map-detail').append(e('p',record.address));for(const url of sourceLinks(s.place)){const a=e('a','查看地点来源 ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';$('map-detail').append(a);}}
function drawMap(){
  activeMap?.dispose();activeMap=undefined;$('real-map').hidden=true;$('map-status').textContent='展开后加载真实地图；也可查看下面的顺序简图。';
  const day=currentPlan?.days.find(d=>d.day===Number($('map-day').value));$('route-map').replaceChildren();$('map-detail').replaceChildren();if(!day)return;
  const points=day.stops.map((s,i)=>({...routePoint(places.find(p=>p.id===s.place.id)||s.place),id:s.place.id,index:i,stop:s})).filter(p=>Number.isFinite(p.longitude)&&Number.isFinite(p.latitude));
  if(!points.length){$('map-detail').append(e('p','这一天的地点尚无坐标；行程卡片仍可调整。','hint'));return;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 320');svg.setAttribute('aria-label','当天地点与顺序示意图');svg.setAttribute('role','img');const projected=projectPoints(points);
  for(let i=1;i<projected.length;i++){const a=projected[i-1],b=projected[i];if(b.index!==a.index+1)continue;const line=document.createElementNS(ns,'line');for(const [key,val] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(key,val);line.setAttribute('class','map-line');svg.append(line);}
  for(const p of projected){const group=document.createElementNS(ns,'g'),circle=document.createElementNS(ns,'circle'),text=document.createElementNS(ns,'text'),title=document.createElementNS(ns,'title');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r','15');circle.setAttribute('class',p.stop.place.kind==='food'?'map-food':'map-sight');text.setAttribute('x',p.x);text.setAttribute('y',p.y+5);text.textContent=String(p.index+1);title.textContent=p.stop.place.name;group.append(circle,text,title);group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',`${p.index+1} ${p.stop.place.name}`);function detail(){mapDetail(p);}group.addEventListener('click',detail);group.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();detail();}});svg.append(group);}
  $('route-map').append(svg);
  if($('map-panel').hasAttribute('open')){const container=$('real-map');container.hidden=false;activeMap=mountMap(container,points,mapDetail,state=>{$('map-status').textContent=state==='ready'?'可缩放地图，点击编号查看地点。虚线仅表示游览顺序。':state==='loading'?'正在加载地图底图…':'底图暂时加载失败，编号和顺序仍可查看；下方简图可以继续使用。';});}
if(points.length!==day.stops.length)$('map-detail').append(e('p','部分地点缺少坐标，图中省略对应点和连接。','hint'));
}
$('map-day').addEventListener('change',drawMap);
$('map-panel').addEventListener('toggle',drawMap);


// Roadbook first. Detailed tools appear only when explicitly requested.
function showRoadbook(){
  $('preferences-panel').removeAttribute('open');$('roadbook-title').focus?.({preventScroll:true});$('roadbook-title').scrollIntoView({behavior:'smooth',block:'start'});
}
function openAdjustment(kind){
  const labels={places:'换个地方',pace:'调整节奏',routes:'优化路线',budget:'看看预算','place-action':placeAction?.action==='replace'?'替换路书中的一站':'加入当前路书'};
  for(const name of Object.keys(labels))$('adjust-'+name).hidden=name!==kind;
  $('adjustment-title').textContent=labels[kind];clearPreview();$('sheet-feedback').hidden=true;
  if(kind==='places')renderReplacements();
  const dialog=$('adjustment-dialog');if(!dialog.hasAttribute('open')){adjustmentFocus=document.activeElement;if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');document.body.classList.add('has-adjustment');}
  dialog.scrollTop=0;
}
function closeAdjustment(){
  const dialog=$('adjustment-dialog');if(dialog.hasAttribute('open')){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}
  document.body.classList.remove('has-adjustment');clearPreview();if(lastState&&JSON.stringify(placeChoices)!==JSON.stringify(lastState.choices)){placeChoices=structuredClone(lastState.choices);syncChoices();renderCandidates();feedback('已返回路书，未应用的地点选择已取消。');}adjustmentFocus?.focus?.();
}
for(const button of document.querySelectorAll('[data-adjust]'))button.addEventListener('click',()=>openAdjustment(button.dataset.adjust));
$('close-adjustment').addEventListener('click',closeAdjustment);
$('adjustment-dialog').addEventListener('close',()=>{document.body.classList.remove('has-adjustment');clearPreview();});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&$('adjustment-dialog').hasAttribute('open')&&typeof $('adjustment-dialog').showModal!=='function')closeAdjustment();});
$('replacement-stop').addEventListener('change',()=>{replacementTarget=$('replacement-stop').value;clearPreview();renderReplacements();});
$('candidate-search').addEventListener('input',()=>{candidateLimit=6;renderCandidates();});
$('more-candidates').addEventListener('click',()=>{candidateLimit+=6;renderCandidates();});
function renderReplacements(){
  const select=$('replacement-stop'),box=$('replacement-options');select.replaceChildren();box.replaceChildren();if(!currentPlan)return;
  for(const d of currentPlan.days)for(const s of d.stops)select.add(new Option(`第 ${d.day} 天 · ${s.place.name}`,s.place.id));
  if(!select.options.length){box.append(e('p','先生成一份有地点的路书，再选择替代方案。','hint'));return;}
  if([...select.options].some(o=>o.value===replacementTarget))select.value=replacementTarget;replacementTarget=select.value;
  if(!sameConditions()){box.append(e('p','偏好已修改，请先生成路书再替换地点。','hint'));return;}
  const result=JSON.parse(replacements_json(JSON.stringify({...arrangePayload(),target_id:replacementTarget})));
  if(!result.ok){box.append(e('p',result.errors.join('；'),'hint'));return;}
  if(!result.options.length){box.append(e('p','暂无满足时间、预算和其他已选地点的替代方案。可展开下方自定义选择。','hint'));return;}
  for(const option of result.options){
    const card=e('article',undefined,'replacement-card'),description=e('div');description.append(e('strong',option.name),e('p',`${option.district} · ¥${option.cost} / 人 · ${option.duration} 分钟`,'meta'));
    const delta=option.cost_delta;description.append(e('small',`路书总额${delta===0?'不变':delta>0?'增加 ¥'+delta+' / 人':'减少 ¥'+(-delta)+' / 人'}`));
    const button=e('button','看看替换效果');button.type='button';button.addEventListener('click',()=>{
      const old=placeChoices[replacementTarget],next={...placeChoices,[replacementTarget]:{state:'maybe',day:0},[option.id]:{state:'must',day:old?.day||0}};
      showPreview({...option,label:`换成${option.name}`,choices:next,reason:'只替换这一站，保留其他地点和日期；时间与预算已重新校验。'});
    });card.append(description,button);box.append(card);
  }
}
for(const button of document.querySelectorAll('[data-pace]'))button.addEventListener('click',()=>{
  if(!sameConditions()){feedback('偏好已修改，请先生成路书。');return;}
  const r={...plannedRequest},p={...preferences()};let label;
  if(button.dataset.pace==='relax'){r.max_visits=Math.max(1,r.max_visits-1);r.relaxed=true;p.mode='lazy';label='再轻松一点';}
  else if(button.dataset.pace==='full'){r.max_visits=Math.min(8,r.max_visits+1);r.relaxed=false;p.mode='intense';label='多玩一点';}
  else{r.start=Math.min(r.start+60,r.end-60);label='晚点出门';}
  const result=JSON.parse(choose_plan_json(JSON.stringify({input:{request:r,places},preferences:p,routing:routing(),meals:meals(),choices:choices(),locks})));
  if(!result.ok){feedback(result.errors.join('；')+'。当前路书保留。');return;}
  showPreview({label,request:r,preferences:p,plan:result.plan,routing:routing(),reason:'先比较调整后的安排，满意再接受；已锁定地点和时刻会保留。'});
});

$('save-roadbook').addEventListener('click',()=>$('export-html').click());


// Unused places stay compact; choosing one opens only the relevant controls.
function renderUnarranged(){
  const box=$('exclusions');box.replaceChildren();if(!currentPlan)return;
  const used=new Set(schedule().map(s=>s.id)),unused=places.filter(p=>p.city===plannedRequest.city&&!used.has(p.id));
  $('unarranged-count').textContent=`· ${unused.length}`;
  const nav=e('div',undefined,'unarranged-tabs');nav.setAttribute('aria-label','未安排地点分类');
  for(const [kind,label] of [['sight','景点'],['food','餐厅']]){
    const items=unused.filter(p=>p.kind===kind),button=e('button',`${label} ${items.length}`);button.type='button';button.dataset.kind=kind;button.setAttribute('aria-pressed',String(kind===unarrangedKind));button.addEventListener('click',()=>{unarrangedKind=kind;renderUnarranged();});nav.append(button);
  }
  box.append(nav);
  const group=e('section',undefined,'unarranged-group');group.dataset.kind=unarrangedKind;
  const items=unused.filter(p=>p.kind===unarrangedKind);group.append(e('h3',unarrangedKind==='food'?'未安排的餐厅':'未安排的景点'));
  for(const p of items.slice(0,unarrangedLimits[unarrangedKind])){
    const row=e('article',undefined,'unused-place');row.dataset.id=p.id;row.append(e('strong',p.name),e('p',`${p.district} · ¥${p.cost} / 人 · ${p.duration} 分钟`,'meta'));
    const reason=currentPlan.exclusions.find(x=>x.id===p.id)?.reason;
    if(reason&&!['手动行程未安排','未被安排'].includes(reason))row.append(e('small',reason,'hint'));
    const actions=e('div',undefined,'unused-actions');
    for(const [action,label] of [['add','加入路书'],['replace','替换一站']]){const button=e('button',label);button.type='button';button.dataset.action=action;button.setAttribute('aria-label',`${label}：${p.name}`);button.addEventListener('click',()=>openPlaceAction(p.id,action));actions.append(button);}
    row.append(actions);group.append(row);
  }
  if(!items.length)group.append(e('p','当前没有这一类未安排的地点。','hint'));
  if(items.length>unarrangedLimits[unarrangedKind]){const more=e('button',`再看 ${Math.min(6,items.length-unarrangedLimits[unarrangedKind])} 个`,'unused-more');more.type='button';more.addEventListener('click',()=>{unarrangedLimits[unarrangedKind]+=6;renderUnarranged();});group.append(more);}
  box.append(group);
}
function openPlaceAction(id,action){
  if(!sameConditions()){feedback('偏好已修改，请先生成路书，再加入或替换地点。');return;}
  const p=places.find(p=>p.id===id);if(!p||schedule().some(s=>s.id===id))return;
  placeAction={id,action};openAdjustment('place-action');
  $('place-action-info').replaceChildren(e('h3',p.name),e('p',`${p.kind==='food'?'餐厅':'景点'} · ${p.district} · ¥${p.cost} / 人 · ${p.duration} 分钟`,'meta'));
  $('place-add-fields').hidden=action!=='add';$('place-replace-fields').hidden=action!=='replace';$('place-meal-label').hidden=p.kind!=='food';
  const days=$('place-add-day');days.replaceChildren();for(let day=1;day<=plannedRequest.days;day++)days.add(new Option(`第 ${day} 天 · ${dayDate(day)}`,String(day)));
  const targets=$('place-replace-target');targets.replaceChildren();for(const d of currentPlan.days)for(const s of d.stops)if(s.place.kind===p.kind)targets.add(new Option(`第 ${d.day} 天 · ${clock(s.start)} ${s.meal||''} ${s.place.name}`,s.place.id));
  $('preview-place-change').disabled=action==='replace'&&!targets.options.length;
  $('place-action-note').textContent=action==='replace'?(targets.options.length?'只换选中的一站，保留原日期和餐次。其他地点会保留，后续时刻与费用先预览。':'路书里没有同类地点可替换，可以返回后选择加入路书。'):'保留已有地点与日期。自动找位置会优先减少原有时刻的变化；已满的餐次请改用替换。';
  refreshPlaceInsertion();
}
function refreshPlaceInsertion(){
  if(!placeAction||!currentPlan)return;clearPreview();$('sheet-feedback').hidden=true;
  const p=places.find(p=>p.id===placeAction.id),day=Number($('place-add-day').value),mealSelect=$('place-add-meal'),previous=mealSelect.value;mealSelect.replaceChildren();
  const stops=currentPlan.days.find(d=>d.day===day)?.stops||[];
  for(const [key,label,enabled] of [['lunch','午餐',meals().lunch],['dinner','晚餐',meals().dinner]])if(enabled){const occupied=stops.some(s=>s.place.kind==='food'&&s.meal===label);const option=new Option(label+(occupied?'（已有餐厅，可替换）':''),key);option.disabled=occupied;mealSelect.add(option);}
  const available=[...mealSelect.options].filter(o=>!o.disabled);if(available.length)mealSelect.value=available.some(o=>o.value===previous)?previous:available[0].value;
  const after=$('place-add-after');after.replaceChildren();after.add(new Option('自动找合适位置','auto'));after.add(new Option('作为当天第一站',''));for(const s of stops)after.add(new Option(`${s.place.name} 之后`,s.place.id));
  if(placeAction.action==='add'){
    const unavailable=p.kind==='food'&&!available.length;$('preview-place-change').disabled=unavailable;
    if(unavailable)$('sheet-feedback').hidden=false,$('sheet-feedback').textContent=mealSelect.options.length?'这一天开启的餐次已有餐厅。可选其他日期，或返回后使用“替换一站”。':'午餐和晚餐均未开启。请先在旅行偏好中开启用餐，再生成路书。';
  }
}
$('place-add-day').addEventListener('change',refreshPlaceInsertion);
for(const id of ['place-add-after','place-add-meal','place-replace-target'])$(id).addEventListener('change',()=>{clearPreview();$('sheet-feedback').hidden=true;});
$('preview-place-change').addEventListener('click',()=>{
  if(!placeAction||!sameConditions()){feedback('条件已变化，请重新打开地点调整。');return;}
  const target=$('place-replace-target').value,after=$('place-add-after').value;
  const payload={...arrangePayload(),place_id:placeAction.id,action:placeAction.action,day:Number($('place-add-day').value),target_id:target,meal:$('place-add-meal').value};if(after!=='auto')payload.after_id=after;
  const result=JSON.parse(change_place_json(JSON.stringify(payload)));
  if(!result.ok){clearPreview();feedback(result.errors.join('；')+'。当前路书保留。');return;}
  const change=result.change,day=scheduleOf(change.plan).find(s=>s.id===change.id).day;
  const next={...placeChoices,[change.id]:{state:'must',day}};
  if(placeAction.action==='replace')next[target]={state:'maybe',day:0};
  showPreview({...change,label:`${placeAction.action==='replace'?'换成':'加入'}${change.name}`,choices:next,reason:placeAction.action==='replace'?'替换选中的一站，保留其他地点和日期；原餐次不变，后续时刻及预算已校验。':'加入选中的日期，保留原有地点和其他日期的时刻；后续安排及预算已校验。'});
});

function previewDinners(){
  if(!sameConditions()){feedback('偏好已修改，请先生成路书，再补充晚餐。');return;}
  openAdjustment('pace');const result=JSON.parse(complete_dinners_json(JSON.stringify(arrangePayload())));
  if(!result.ok){feedback(result.errors.join('；'));return;}
  showPreview({...result.change,meals:{...meals(),dinner:true},label:'补上晚餐',reason:'保留原有地点、日期和时刻。为缺晚餐的日期补充餐厅，优先参考最后景点附近的位置；结束时间不足时预留至20:00，预算、营业时间和餐厅去重仍需满足。'});
}
