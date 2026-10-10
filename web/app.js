import { plan_json, catalogue_json, alternatives_json, cities_json, pending_places_json, restaurant_identity } from './engine.js';
const $ = id => document.getElementById(id);
const staticDemo = document.querySelector('meta[name="moontrip-mode"]')?.content === 'static';
const tags = ['自然','文化','历史','摄影','科技','亲子','美食','艺术','运动'];
let places = JSON.parse(catalogue_json()), currentPlan, plannedRequest, proposal, configured = false;
let selected=[], avoided=[];
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
function request(){ return {city:$('city').value,days:Number($('days').value),budget:Number($('budget').value),start:minutes($('start').value),end:minutes($('end').value),interests:[...$('interests').querySelectorAll('input:checked')].map(i=>i.value),family:$('family').checked,rain:$('rain').checked,relaxed:$('relaxed').checked,must_visit:[...selected],avoid:[...avoided],priority:$('priority').value,include_food:$('include_food').checked,diet:$('diet').value,max_visits:Number($('max_visits').value)}; }
function setRequest(r){
  r={must_visit:[],avoid:[],priority:"balanced",include_food:true,diet:"不限",max_visits:3,...r}; selected=[...r.must_visit];avoided=[...r.avoid];
  if(![...$('city').options].some(o=>o.value===r.city)) $('city').add(new Option(r.city,r.city));
  for(const id of ['city','days','budget','priority','diet','max_visits']) $(id).value=r[id];
  for(const id of ['start','end']) $(id).value=clock(r[id]);
  for(const id of ['family','rain','relaxed','include_food']) $(id).checked=r[id];
  for(const tag of r.interests) if(!tags.includes(tag)){ tags.push(tag); const label=e('label'),input=e('input'); input.type='checkbox'; input.value=tag; label.append(input,e('span',tag)); $('interests').append(label); }
  $('interests').querySelectorAll('input').forEach(i=>i.checked=r.interests.includes(i.value));
}
function generate(){
  feedback();
  const r=request(), result=JSON.parse(plan_json(JSON.stringify({request:r,places})));
  if(!result.ok){feedback(result.errors.join('；'));return;}
  currentPlan=result.plan; plannedRequest=r; render();
  try{localStorage.setItem("moontrip.v1",JSON.stringify({places,request:r,message:$("message").value}));}catch{}
}
function render(){
  renderCandidates();renderAlternatives();
  const p=currentPlan, count=p.days.reduce((n,d)=>n+d.stops.filter(s=>s.place.kind==='sight').length,0);
  $('budget-detail').textContent=`景点 ¥${p.activity_cost} + 餐饮 ¥${p.food_cost} + 接驳 ¥${p.transfer_cost} / 人（均为当前资料估算）`;
  $('summary').replaceChildren();
  for(const [label,value,unit] of [['安排活动',count,'站'],['预计花费',p.total_cost,'元 / 人'],['预算余量',p.remaining_budget,'元 / 人']]){ const card=e('div',undefined,'metric'),strong=e('strong',String(value)); strong.append(e('span',unit)); card.append(e('small',label),strong); $('summary').append(card); }
  $('itinerary').replaceChildren();
  for(const day of p.days){
    const section=e('div',undefined,'day'),head=e('div',undefined,'day-head');head.append(e('h3',`第 ${day.day} 天 · ${plannedRequest.city}`),e('small',`活动、餐饮与接驳 ¥${day.cost} / 人`));section.append(head);
    if(!day.stops.length)section.append(e('div','这一天还没有合适的安排。试着放宽条件，或导入更多景点。','empty'));
    for(const stop of day.stops){
      const row=e('article',undefined,'stop'),time=e('div',clock(stop.start),'time'); time.append(e('small',`至 ${clock(stop.end)}`));
      const content=e('div'),title=e('h4',stop.place.name);title.append(e('span',`${stop.score} 分`,'score'));
      if(stop.place.kind==='food')content.append(e('div','午餐 · 人均消费估算','tag-food'));
      content.append(title,e('div',`${stop.place.district} · 游览 ${stop.place.duration} 分钟 · ${stop.place.kind==='food'?'人均':'活动'} ¥${stop.place.cost} · ${stop.place.indoor?'室内':'户外'}`,'meta'));
      if(stop.transfer_minutes)content.append(e('div',`上一站接驳估算 ${stop.transfer_minutes} 分钟 / ¥${stop.transfer_cost}；另预留休息时间`,'meta'));
      content.append(e('div',stop.reasons.filter(t=>!t.startsWith('基础')).join(' · ')||'满足当前时间、预算与活动条件','reason'));
      const details=e('details'),list=e('ul');details.append(e('summary','推荐理由与数据来源'));stop.reasons.forEach(reason=>list.append(e('li',reason)));list.append(e('li',`来源：${stop.place.source}`));details.append(list);content.append(details);
      for(const url of sourceLinks(stop.place)){const link=e('a','查看来源 ↗','source-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';content.append(link);}
      const controls=e('div',undefined,'stop-controls');
      for(const [label,action] of [['移除',()=>{selected=selected.filter(id=>id!==stop.place.id);if(!avoided.includes(stop.place.id))avoided.push(stop.place.id);generate();}],['优先安排',()=>{selected=[stop.place.id,...selected.filter(id=>id!==stop.place.id)];generate();}],['↑',()=>moveStop(stop.place.id,-1)],['↓',()=>moveStop(stop.place.id,1)]]){const b=e('button',label);b.type='button';b.addEventListener('click',action);controls.append(b);}content.append(controls);row.append(time,content);section.append(row);
    }
    $('itinerary').append(section);
  }
  $('exclusions').replaceChildren(...p.exclusions.map(x=>{const row=e('div',x.name,'exclusion');row.append(e('small',x.reason));return row;}));
  if(!p.exclusions.length)$('exclusions').append(e('p','所有景点均已安排。'));
  $('warnings').replaceChildren(...p.warnings.map(w=>e('li',w)));
  $('data-status').textContent=`已载入 ${places.length} 个景点 · ${[...new Set(places.map(p=>p.city))].join('、')}`;
}
const presets={weekend:{city:'杭州',days:2,budget:150,start:540,end:1020,interests:['自然','文化'],family:false,rain:false,relaxed:false},family:{city:'成都',days:2,budget:250,start:600,end:990,interests:['亲子','科技'],family:true,rain:false,relaxed:true},rain:{city:'杭州',days:1,budget:180,start:540,end:1020,interests:['文化','历史'],family:false,rain:true,relaxed:true}};
$('planner').addEventListener('submit',ev=>{ev.preventDefault();generate();});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{setRequest(presets[b.dataset.preset]);generate();}));
$('remove-demo').addEventListener('click',()=>{const demoIds=new Set(JSON.parse(catalogue_json()).map(p=>p.id));const real=places.filter(p=>!demoIds.has(p.id));if(!real.length){feedback('请先核对并加入至少一个真实地点。');return;}places=real;selected=[];avoided=[];if(!real.some(p=>p.city===$('city').value))$('city').value=real[0].city;generate();});
$('reset').addEventListener('click',()=>{places=JSON.parse(catalogue_json());selected=[];avoided=[];generate();});
$('import').addEventListener('change',async ev=>{
  const file=ev.target.files[0];if(!file)return;
  try{
    if(file.size>1000000)throw Error('景点文件不能超过 1 MB');
    const raw=JSON.parse(await file.text()),imported=Array.isArray(raw)?raw:raw.places;if(!Array.isArray(imported))throw Error('请导入景点 JSON 数组');
    const check=JSON.parse(plan_json(JSON.stringify({request:{...request(),must_visit:[],avoid:[]},places:imported})));
    if(!check.ok)throw Error(check.errors.join('；'));
    places=imported;selected=[];avoided=[];for(const city of new Set(places.map(p=>p.city)))if(![...$('city').options].some(o=>o.value===city))$('city').add(new Option(city,city));
    generate();
  }catch(err){feedback(err.message);}finally{ev.target.value='';}
});
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=e('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-json').addEventListener('click',()=>{if(currentPlan)download('moontrip-plan.json',JSON.stringify({request:plannedRequest,places,plan:currentPlan},null,2),'application/json');});
$('export-md').addEventListener('click',()=>{
  if(!currentPlan)return;
  const p=currentPlan,lines=[`# ${plannedRequest.city} · MoonTrip 行程草案`,'',`预计活动与市内交通：${p.total_cost} 元 / 人；剩余：${p.remaining_budget} 元 / 人`,''];
  for(const d of p.days){lines.push(`## 第 ${d.day} 天`,'');for(const s of d.stops)lines.push(`- ${clock(s.start)}–${clock(s.end)} ${s.place.name}（门票 ${s.place.cost} 元，接驳 ${s.transfer_cost} 元）`,`  - 理由：${s.reasons.join('；')}`,`  - 来源：${s.place.source}`);if(!d.stops.length)lines.push('暂无可行活动。');lines.push('');}
  lines.push('## 规划边界','',...p.warnings.map(w=>`- ${w}`),'','## 未安排景点','',...p.exclusions.map(x=>`- ${x.name}：${x.reason}`));
  download('moontrip-plan.md',lines.join('\n'),'text/markdown;charset=utf-8');
});
$('ask').addEventListener('click',async()=>{
  const message=$('message').value.trim();if(!message){feedback('先写下你想调整的旅行条件。');return;}
  if(!configured){feedback('尚未配置 AI 服务。你可以使用三种示例，或直接调整条件生成行程。');return;}
  $('ask').disabled=true;$('proposal').hidden=true;proposal=undefined;feedback('助手正在整理条件…');
  try{const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,current:request()})});const data=await response.json();if(!data.ok)throw Error(data.errors.join('；'));proposal=data.request;
    $('proposal-text').textContent=`${proposal.city} · ${proposal.days} 天 · 每人规划预算 ${proposal.budget} 元\n每天 ${clock(proposal.start)}–${clock(proposal.end)}\n兴趣：${proposal.interests.join('、')||'不限'}\n亲子 ${proposal.family?'是':'否'} / 雨天 ${proposal.rain?'是':'否'} / 慢游 ${proposal.relaxed?'是':'否'}\n每天最多 ${proposal.max_visits} 个景点 / 午餐 ${proposal.include_food?'安排':'不安排'} / 饮食 ${proposal.diet}\n请核对：助手只处理上述条件。`;$('proposal').hidden=false;feedback();
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
try{const saved=JSON.parse(localStorage.getItem('moontrip.v1')||'null');if(saved){const check=JSON.parse(plan_json(JSON.stringify({request:saved.request,places:saved.places})));if(check.ok){places=saved.places;setRequest(saved.request);$('message').value=saved.message||'';}}}catch{}
generate();

function moveStop(id,delta){const ids=currentPlan.days.flatMap(day=>day.stops.map(s=>s.place.id)),index=ids.indexOf(id),next=index+delta;if(next<0||next>=ids.length)return;[ids[index],ids[next]]=[ids[next],ids[index]];selected=ids;generate();renderCandidates();}
function sourceLinks(place){return [...new Set([place.url,...(place.source.match(/https?:\/\/[^\s]+/g)||[])].filter(Boolean))];}
function renderCandidates(){
  $('candidates').replaceChildren();
  const restaurants=new Set();
  for(const p of places.filter(p=>p.city===request().city)){
    if(p.kind==='food'){const key=restaurant_identity(p.city,p.name);if(restaurants.has(key))continue;restaurants.add(key);}
    const card=e('div',undefined,'candidate');card.append(e('strong',p.name),e('p',`${p.kind==='food'?'餐厅':'景点'} · ${p.district} · ¥${p.cost}/人 · ${p.duration} 分钟`));
    const choices=e('div',undefined,'choices');
    for(const [label,checked,kind] of [['想去',selected.includes(p.id),'select'],['排除',avoided.includes(p.id),'avoid']]){
      const wrap=e('label'),input=e('input');input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',`${p.name} ${label}`);
      input.addEventListener('change',()=>{
        if(kind==='select'){selected=selected.filter(id=>id!==p.id);if(input.checked){selected.push(p.id);avoided=avoided.filter(id=>id!==p.id);if(p.kind==='food')$('include_food').checked=true;}}
        else{avoided=avoided.filter(id=>id!==p.id);if(input.checked){avoided.push(p.id);selected=selected.filter(id=>id!==p.id);}}
        generate();renderCandidates();
      });wrap.append(input,document.createTextNode(label));choices.append(wrap);
    }
    card.append(choices);for(const url of sourceLinks(p)){const link=e('a','来源 ↗','source-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);} $('candidates').append(card);
  }
}
function renderAlternatives(){
  const result=JSON.parse(alternatives_json(JSON.stringify({request:plannedRequest,places})));$('alternatives').replaceChildren();if(!result.ok)return;
  for(const alt of result.alternatives){
    const card=e('div',undefined,'alternative'+(alt.request.priority===plannedRequest.priority?' selected':'')),visits=alt.plan.days.flatMap(d=>d.stops),b=e('button',alt.request.priority===plannedRequest.priority?'当前方案':'选择此方案');
    card.append(e('strong',alt.label),e('p',`¥${alt.plan.total_cost} / 人 · ${visits.length} 站`),e('p',visits.slice(0,3).map(s=>s.place.name.replace(' · 演示','')).join(' → ')));b.type='button';b.addEventListener('click',()=>{setRequest(alt.request);generate();});card.append(b);$('alternatives').append(card);
  }
}
$('add-place').addEventListener('submit',ev=>{
  ev.preventDefault();
  if(reviewPoi&&!$('review-confirm').checked){feedback('请先核对资料，再勾选确认。');return;}
  const urls=$('place-urls').value.trim().split(/\s+/);
  if(urls.some(url=>!/^https?:\/\//.test(url))){feedback('请填写 HTTP(S) 来源链接，每行一个。');return;}
  const p={id:reviewPoi?.id||'user-'+Date.now(),name:$('place-name').value.trim(),city:$('place-city').value.trim(),district:$('place-district').value.trim(),kind:$('place-kind').value,cost:Number($('place-cost').value),duration:Number($('place-duration').value),open:minutes($('place-open').value),close:minutes($('place-close').value),tags:$('place-tags').value.split(/[,，]/).map(t=>t.trim()).filter(Boolean),indoor:$('place-indoor').checked,family:$('place-family').checked,url:urls[0],source:`${reviewPoi?'用户核对':'用户整理，未自动核实'}：${$('place-note').value.trim()}\n${urls.join('\n')}`};
  const check=JSON.parse(plan_json(JSON.stringify({request:{...request(),must_visit:[],avoid:[]},places:[...places.filter(item=>item.id!==p.id),p]})));if(!check.ok){feedback(check.errors.join('；'));return;}
  places=places.filter(item=>item.id!==p.id);places.push(p);
  if(reviewPoi){pendingPlaces=pendingPlaces.filter(item=>item.id!==reviewPoi.id);reviewPoi=undefined;$("review-confirm-wrap").hidden=true;$("review-confirm").checked=false;savePending();renderPending();}
if(![...$('city').options].some(o=>o.value===p.city))$('city').add(new Option(p.city,p.city));if(p.city===$('city').value&&p.kind==='food')$('include_food').checked=true;generate();feedback('已加入候选列表，可勾选后安排进计划。');
});
$('planner').addEventListener('input',()=>feedback('条件已修改，点击“生成我的行程”更新方案与预算。'));
$('city').addEventListener('change',()=>{selected=[];avoided=[];generate();if([...$('review-city').options].some(o=>o.value===$('city').value)){$('review-city').value=$('city').value;renderPending();}});
$('export-html').addEventListener('click',()=>{
  if(!currentPlan)return;const page=document.implementation.createHTMLDocument(`${plannedRequest.city} · MoonTrip 离线路书`);
  const style=e('style','body{font:16px/1.8 system-ui;max-width:900px;margin:30px auto;padding:20px;color:#223b36}article{padding:20px;border:1px solid #ddd;border-radius:12px;margin:15px 0}small{color:#687b72}button,.stop-controls{display:none}h1{font-size:32px}a{color:#285a47}');page.documentElement.lang='zh-CN';page.head.append(style);
  page.body.append(e('h1',`${plannedRequest.city} · ${plannedRequest.days} 天旅行草案`),e('p',`预计每人 ¥${currentPlan.total_cost}：景点 ¥${currentPlan.activity_cost} / 餐饮 ¥${currentPlan.food_cost} / 接驳 ¥${currentPlan.transfer_cost}`),$('itinerary').cloneNode(true),e('h2','规划依据与边界'),$('warnings').cloneNode(true));
  download('moontrip-roadbook.html','<!doctype html>'+page.documentElement.outerHTML,'text/html;charset=utf-8');
});

$('add-city').addEventListener('click',()=>{$('city-entry').hidden=!$('city-entry').hidden;});
$('confirm-city').addEventListener('click',()=>{const city=$('new-city').value.trim();if(!city){feedback('请输入城市名称。');return;}if(![...$('city').options].some(o=>o.value===city))$('city').add(new Option(city,city));$('city').value=city;$('place-city').value=city;selected=[];avoided=[];$('city-entry').hidden=true;generate();});


// The host transports map data; MoonBit validates city queries and candidate records.
const seedCities=JSON.parse(cities_json());
for(const city of seedCities)$('review-city').add(new Option(city.city,city.city));
$('review-city').value=seedCities.some(c=>c.city===$('city').value)?$('city').value:'杭州';
$('review-city').addEventListener('change',()=>renderPending());
for(const city of seedCities){const label=e('label'),input=e('input');input.type='checkbox';input.value=city.city;input.checked=city.city==='杭州';label.append(input,document.createTextNode(`${city.province} · ${city.city}`));$('seed-cities').append(label);}
function updateMapsStatus(){
  $('maps-status').textContent=staticDemo?'在线版未启用地点查询':mapsConfigured?'高德 Web 服务 · 本机已连接':'本机尚未连接高德';
  for(const id of ['query-city','query-batch'])$(id).disabled=staticDemo||!mapsConfigured||libraryBusy;
}
function savePending(){try{localStorage.setItem('moontrip.pending.v1',JSON.stringify(pendingPlaces));}catch{$('maps-progress').textContent='浏览器无法保存资料；当前页仍可核对，请避免刷新。';}}
function renderPending(){
  const seen=new Set();pendingPlaces=pendingPlaces.filter(p=>{const key=p.kind==='food'?restaurant_identity(p.city,p.name):p.id;if(seen.has(key))return false;seen.add(key);return true;});
  const visible=pendingPlaces.filter(p=>p.city===$('review-city').value);
  $('pending-count').textContent=`${$('review-city').value} · ${visible.length}`;$('pending-places').replaceChildren();
  for(const p of visible){
    const card=e('article',undefined,'pending-card');card.append(e('h3',`${p.name} · ${p.city}`),e('p',`${p.kind==='food'?'餐厅':'景点'} · ${p.district} · ${p.address||'地址待核对'}`),e('p',`高德人均消费线索：${p.cost_hint||'未提供'}（不等于门票报价）；营业时间线索：${p.open_hint||'未提供'}`,'hint'),e('p',`查询日期：${new Date(p.fetched_at).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})} · 待核对`,'hint'));
    const source=e('a','查看高德地点 ↗');source.href=p.url;source.target='_blank';source.rel='noopener noreferrer';card.append(source);
    const button=e('button','填写并核对');button.type='button';button.addEventListener('click',()=>{
      reviewPoi=p;document.querySelector('.add-place').open=true;
      for(const [id,value] of Object.entries({'place-kind':p.kind,'place-name':p.name,'place-city':p.city,'place-district':p.district,'place-cost':'','place-duration':p.kind==='food'?'60':'90','place-open':'','place-close':'','place-tags':p.kind==='food'?'美食':'','place-urls':p.url,'place-note':`高德地点 ID：${p.id}；地址：${p.address}；坐标（GCJ-02）：${p.location}；查询时间：${p.fetched_at}。\n费用线索：${p.cost_hint||'未提供'}；时间线索：${p.open_hint||'未提供'}。\n请补充你的核对依据和推荐理由。`}))$(id).value=value;
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
        const key=p=>p.kind==='food'?restaurant_identity(p.city,p.name):p.id;
        const existing=new Set([...places,...pendingPlaces].map(key));
        for(const item of result.items)if(!existing.has(key(item))){pendingPlaces.push(item);existing.add(key(item));}
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
