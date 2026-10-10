import { plan_json, catalogue_json } from './engine.js';
const $ = id => document.getElementById(id);
const tags = ['自然','文化','历史','摄影','科技','亲子','美食','艺术','运动'];
let places = JSON.parse(catalogue_json()), currentPlan, plannedRequest, proposal, configured = false;
const e = (tag, text, cls) => { const node = document.createElement(tag); if(text !== undefined) node.textContent = text; if(cls) node.className = cls; return node; };
const clock = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const minutes = s => { const [h,m] = s.split(':').map(Number); return h*60+m; };
function feedback(text='') { $('feedback').hidden = !text; $('feedback').textContent = text; }
for(const tag of tags){ const label=e('label'), input=e('input'); input.type='checkbox'; input.value=tag; input.checked=['自然','文化'].includes(tag); label.append(input,e('span',tag)); $('interests').append(label); }
function request(){ return {city:$('city').value,days:Number($('days').value),budget:Number($('budget').value),start:minutes($('start').value),end:minutes($('end').value),interests:[...$('interests').querySelectorAll('input:checked')].map(i=>i.value),family:$('family').checked,rain:$('rain').checked,relaxed:$('relaxed').checked}; }
function setRequest(r){
  if(![...$('city').options].some(o=>o.value===r.city)) $('city').add(new Option(r.city,r.city));
  for(const id of ['city','days','budget']) $(id).value=r[id];
  for(const id of ['start','end']) $(id).value=clock(r[id]);
  for(const id of ['family','rain','relaxed']) $(id).checked=r[id];
  for(const tag of r.interests) if(!tags.includes(tag)){ tags.push(tag); const label=e('label'),input=e('input'); input.type='checkbox'; input.value=tag; label.append(input,e('span',tag)); $('interests').append(label); }
  $('interests').querySelectorAll('input').forEach(i=>i.checked=r.interests.includes(i.value));
}
function generate(){
  feedback();
  const r=request(), result=JSON.parse(plan_json(JSON.stringify({request:r,places})));
  if(!result.ok){feedback(result.errors.join('；'));return;}
  currentPlan=result.plan; plannedRequest=r; render();
}
function render(){
  const p=currentPlan, count=p.days.reduce((n,d)=>n+d.stops.length,0);
  $('summary').replaceChildren();
  for(const [label,value,unit] of [['安排活动',count,'站'],['预计花费',p.total_cost,'元 / 人'],['预算余量',p.remaining_budget,'元 / 人']]){ const card=e('div',undefined,'metric'),strong=e('strong',String(value)); strong.append(e('span',unit)); card.append(e('small',label),strong); $('summary').append(card); }
  $('itinerary').replaceChildren();
  for(const day of p.days){
    const section=e('div',undefined,'day'),head=e('div',undefined,'day-head');head.append(e('h3',`第 ${day.day} 天 · ${plannedRequest.city}`),e('small',`活动与接驳 ¥${day.cost} / 人`));section.append(head);
    if(!day.stops.length)section.append(e('div','这一天还没有合适的安排。试着放宽条件，或导入更多景点。','empty'));
    for(const stop of day.stops){
      const row=e('article',undefined,'stop'),time=e('div',clock(stop.start),'time'); time.append(e('small',`至 ${clock(stop.end)}`));
      const content=e('div'),title=e('h4',stop.place.name);title.append(e('span',`${stop.score} 分`,'score'));
      content.append(title,e('div',`${stop.place.district} · 游览 ${stop.place.duration} 分钟 · 活动 ¥${stop.place.cost} · ${stop.place.indoor?'室内':'户外'}`,'meta'));
      if(stop.transfer_minutes)content.append(e('div',`上一站接驳估算 ${stop.transfer_minutes} 分钟 / ¥${stop.transfer_cost}；另预留休息时间`,'meta'));
      content.append(e('div',stop.reasons.filter(t=>!t.startsWith('基础')).join(' · ')||'满足当前时间、预算与活动条件','reason'));
      const details=e('details'),list=e('ul');details.append(e('summary','推荐理由与数据来源'));stop.reasons.forEach(reason=>list.append(e('li',reason)));list.append(e('li',`来源：${stop.place.source}`));details.append(list);content.append(details);row.append(time,content);section.append(row);
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
$('reset').addEventListener('click',()=>{places=JSON.parse(catalogue_json());generate();});
$('import').addEventListener('change',async ev=>{
  const file=ev.target.files[0];if(!file)return;
  try{
    if(file.size>1000000)throw Error('景点文件不能超过 1 MB');
    const imported=JSON.parse(await file.text());if(!Array.isArray(imported))throw Error('请导入景点 JSON 数组');
    const check=JSON.parse(plan_json(JSON.stringify({request:request(),places:imported})));
    if(!check.ok)throw Error(check.errors.join('；'));
    places=imported;for(const city of new Set(places.map(p=>p.city)))if(![...$('city').options].some(o=>o.value===city))$('city').add(new Option(city,city));
    generate();
  }catch(err){feedback(err.message);}finally{ev.target.value='';}
});
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=e('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-json').addEventListener('click',()=>{if(currentPlan)download('moontrip-plan.json',JSON.stringify({request:plannedRequest,plan:currentPlan},null,2),'application/json');});
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
    $('proposal-text').textContent=`${proposal.city} · ${proposal.days} 天 · 每人活动预算 ${proposal.budget} 元\n每天 ${clock(proposal.start)}–${clock(proposal.end)}\n兴趣：${proposal.interests.join('、')||'不限'}\n亲子 ${proposal.family?'是':'否'} / 雨天 ${proposal.rain?'是':'否'} / 慢游 ${proposal.relaxed?'是':'否'}\n请核对：助手只处理上述条件。`;$('proposal').hidden=false;feedback();
  }catch(err){feedback(err.message);}finally{$('ask').disabled=false;}
});
$('apply').addEventListener('click',()=>{if(proposal){setRequest(proposal);$('proposal').hidden=true;generate();}});
fetch('/api/status').then(r=>r.json()).then(data=>{configured=data.configured;$('ai-status').textContent=configured?'AI 已连接配置':'无密钥演示';}).catch(()=>{$('ai-status').textContent='AI 服务不可用';});
generate();
