import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import {historyStore,freshRoutes,projectPoints} from '../web/journey.js';
const template=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
const store=new Map();
const fixture=(id,name,lon)=>({id,name,city:'杭州',district:'测试片区',tags:['文化'],cost:10,duration:40,open:480,close:1320,indoor:false,family:false,source:'交互测试合成资料',url:'https://example.org/'+id,kind:'sight',location:`${lon},30.25`});
const places=[fixture('a','测试甲',120.10),fixture('b','测试乙',120.11),fixture('c','测试丙',120.12)];
let requests=0;
async function boot(staticMode=false,dataPlaces=places,dataPending=[]){
  const {window,document}=parseHTML(template.replace('<head>',staticMode?'<head><meta name="moontrip-mode" content="static">':'<head>'));
  Object.defineProperty(window.HTMLInputElement.prototype,'checked',{get(){return this.hasAttribute('checked');},set(v){v?this.setAttribute('checked',''):this.removeAttribute('checked');},configurable:true});
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){const o=this.querySelector('option[selected]')||this.querySelector('option');return o?(o.getAttribute('value')??o.textContent):'';},set(v){for(const o of this.querySelectorAll('option'))o.selected=(o.getAttribute('value')??o.textContent)===String(v);},configurable:true});
  Object.defineProperty(window.HTMLSelectElement.prototype,'options',{get(){return [...this.querySelectorAll('option')];},configurable:true});
  window.HTMLSelectElement.prototype.add=function(o){this.append(o);};
  window.HTMLElement.prototype.scrollIntoView=function(){};
  document.implementation={createHTMLDocument:()=>parseHTML('<!doctype html><html><head></head><body></body></html>').document};
  globalThis.Option=function(text,value){const o=document.createElement('option');o.textContent=text;o.setAttribute('value',value??text);return o;};
  globalThis.document=document;globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  globalThis.fetch=async(url,options)=>{
    if(url.includes('sight-evidence.json'))return {ok:true,json:async()=>({entries:[{id:'closed-sight',status:'closed',fee_yuan:null,fee_note:'闭馆不采用旧票价',opening_note:'官方公告暂时关闭',notes:'不加入候选',checked_at:'2026-10-14',sources:[{title:'官方公告',url:'https://example.org/notice'}]}]})};
    if(url.includes('hangzhou.json'))return {ok:true,json:async()=>({city:'杭州',places:dataPlaces,pending:dataPending})};
    if(url.includes('chengdu.json'))return {ok:true,json:async()=>({city:'成都',places:[],pending:[]})};
    if(url==='/api/status')return {ok:true,json:async()=>({configured:false,maps_configured:true})};
    if(url==='/api/routes'){
      requests++;const q=JSON.parse(options.body);const r={from_id:q.origin.id,to_id:q.destination.id,mode:q.mode,minutes:q.mode==='walking'?8:20,distance:q.mode==='walking'?600:1500,cost:q.mode==='walking'?0:3,source:'高德路线规划',fetched_at:new Date().toISOString()};
      return {ok:true,json:async()=>({ok:true,route:r,options:[{id:q.mode+q.origin.id+q.destination.id,route:r,walking_distance:q.mode==='walking'?600:200,transfers:0,summary:q.mode==='walking'?'全程步行':'测试公交'}]})};
    }
    throw Error('Unexpected fetch '+url);
  };
  await import('../web/app.js?ui-test='+Date.now()+Math.random());await new Promise(r=>setTimeout(r,0));
  return {document,window,$:id=>document.getElementById(id),click:(node)=>node.dispatchEvent(new window.Event('click')),change:(node)=>node.dispatchEvent(new window.Event('change'))};
}
const ui=await boot();const {$,click,change,document}=ui;
assert.equal(document.querySelectorAll('.stop').length,3,'first visit generates a plan');
assert.equal($('adjustment-dialog').hasAttribute('open'),false,'detailed choices are hidden initially');
for(const id of ['data-tools','advanced-preferences','roadbook-adjustments','all-place-choices'])assert.equal($(id).hasAttribute('open'),false,id+' starts collapsed');
assert.equal(document.querySelector('.results #candidates'),null,'place catalogue is outside the roadbook');
assert.equal(document.querySelectorAll('.journey-connection').length,2,'transport is readable between consecutive stops');
assert.ok(document.querySelector('.day-overview').textContent.includes('开始'),'daily reading summary exists');
assert.equal(document.querySelectorAll('.stop > div > .stop-controls').length,0,'per-stop controls are hidden under details');
$('planner').dispatchEvent(new ui.window.Event('submit',{cancelable:true}));assert.equal($('preferences-panel').hasAttribute('open'),false,'generation collapses preferences and shows roadbook');
click(document.querySelector('[data-adjust=budget]'));assert.equal($('adjustment-dialog').hasAttribute('open'),true);assert.equal($('adjust-budget').hidden,false);assert.equal($('adjust-places').hidden,true);click($('close-adjustment'));assert.equal($('adjustment-dialog').hasAttribute('open'),false);
assert.equal(document.querySelectorAll('#route-map circle').length,3,'map points work without external SDK');
click(document.querySelector('#route-map g'));assert.match($('map-detail').textContent,/测试/);
const before=$('itinerary').textContent;
const aChoice=document.querySelector('.candidate .choices select');aChoice.value='must';change(aChoice);
const dayChoice=document.querySelectorAll('.candidate .choices select')[1];dayChoice.value='2';change(dayChoice);
assert.equal($('itinerary').textContent,before,'staging choices does not shuffle');
click($('apply-choices'));
assert.match(document.querySelectorAll('.day')[1].textContent,/测试甲/,'assigned day honored');
click($('undo-change'));assert.equal($('itinerary').textContent,before,'undo restores plan and choices');
click(document.querySelector('.stop-controls button:last-child'));assert.equal($('change-preview').hidden,false,'order change can be previewed');click($('accept-change'));assert.match(document.querySelector('.stop h4').textContent,/测试乙/,'order actually changes');click($('undo-change'));assert.equal($('itinerary').textContent,before,'order undo restores original');
const placeLock=document.querySelector('.lock-controls input');placeLock.checked=true;change(placeLock);click(document.querySelector('.stop-controls button'));assert.match($('feedback').textContent,/锁定/,'locked place cannot be removed');assert.equal($('change-preview').hidden,true);click($('undo-change'));
const second=document.querySelectorAll('.stop')[1];const originalTime=second.querySelector('.time').textContent;
const timeLock=second.querySelectorAll('.lock-controls input')[1];timeLock.checked=true;change(timeLock);
click($('refresh-routes'));await new Promise(r=>setTimeout(r,30));
assert.equal(requests,4,'both modes queried for every leg');
assert.equal(document.querySelectorAll('.stop')[1].querySelector('.time').textContent,originalTime,'query does not alter times');
assert.equal(document.querySelectorAll('.transport-option').length,4,'per-leg candidates displayed');
const oldPlan=$('itinerary').textContent;
click(document.querySelector('.transport-option button'));assert.equal($('change-preview').hidden,false,'route choice opens preview');
assert.equal($('itinerary').textContent,oldPlan,'preview leaves current plan intact');
click($('dismiss-change'));assert.equal($('itinerary').textContent,oldPlan,'ignore keeps plan');
click(document.querySelector('.transport-option button'));click($('accept-change'));
assert.match($('route-choices').textContent,/已选择：步行/,'accepted leg uses chosen mode');
assert.equal(document.querySelectorAll('.stop')[1].querySelector('.time').textContent,originalTime,'accepted route retains locked time');
const legLock=document.querySelector('#route-choices .lock-controls input');legLock.checked=true;change(legLock);
click(document.querySelectorAll('.transport-option button')[1]);assert.match($('feedback').textContent,/锁定路段/,'locked transport cannot be replaced');assert.equal($('change-preview').hidden,true);
click($('undo-change'));click($('undo-change'));assert.equal($('itinerary').textContent,oldPlan,'route undo restores time and budget');
click($('get-suggestions'));await new Promise(r=>setTimeout(r,30));assert.ok(document.querySelector('#suggestions button'),'validated improvements offered');
click(document.querySelector('#suggestions button'));assert.equal($('change-preview').hidden,false);
// Change a condition after preview; confirmation must reject a stale result.
$('budget').value='600';click($('accept-change'));assert.match($('feedback').textContent,/已变化/);
$('budget').value='200';
const saved=JSON.parse(store.get('moontrip.v1'));assert.equal(saved.locks.times.length,1);
const restored=await boot();assert.equal(restored.document.querySelectorAll('.lock-controls input:checked').length,1,'time lock restored after reload');
assert.match(restored.$('itinerary').textContent,/测试甲/);
// Pages has local selection, map and preview, but does not expose backend requests.
store.clear();const online=await boot(true);assert.equal(online.$('refresh-routes').disabled,true);assert.equal(online.document.querySelectorAll('#route-map circle').length,3);
// Substitution suggestions are bounded and leave the rest of the roadbook intact.
store.clear();const many=[...places,...Array.from({length:6},(_,i)=>fixture('alt-'+i,'替代地点'+i,120.13+i/100))];
const optionsUI=await boot(false,many);const firstPlan=JSON.parse(store.get('moontrip.v1')).manual_stops;
optionsUI.click(optionsUI.document.querySelector('[data-adjust=places]'));
const replacements=optionsUI.document.querySelectorAll('.replacement-card');assert.equal(replacements.length,3,'only three feasible replacement choices shown');
optionsUI.click(replacements[0].querySelector('button'));assert.equal(optionsUI.$('change-preview').hidden,false);assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,firstPlan,'preview does not mutate roadbook');
optionsUI.click(optionsUI.$('accept-change'));const changedPlan=JSON.parse(store.get('moontrip.v1')).manual_stops;
assert.equal(changedPlan.length,firstPlan.length);assert.notEqual(changedPlan[0].id,firstPlan[0].id);assert.deepEqual(changedPlan.slice(1).map(s=>[s.id,s.day]),firstPlan.slice(1).map(s=>[s.id,s.day]),'other stops and days preserved');
assert.equal(optionsUI.$('adjustment-dialog').hasAttribute('open'),false,'accepted adjustment returns to roadbook');
optionsUI.click(optionsUI.$('undo-change'));assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,firstPlan,'replacement undo restores schedule');
optionsUI.click(optionsUI.document.querySelector('[data-adjust=pace]'));optionsUI.click(optionsUI.document.querySelector('[data-pace=late]'));assert.equal(optionsUI.$('change-preview').hidden,false,'pace change previews before apply');optionsUI.click(optionsUI.$('accept-change'));assert.equal(JSON.parse(store.get('moontrip.v1')).request.start,600,'later start applies consistently');optionsUI.click(optionsUI.$('undo-change'));assert.equal(JSON.parse(store.get('moontrip.v1')).request.start,540,'pace undo restores conditions');
// Unused places can be added or explicitly chosen to replace one existing stop.
const unusedRow=optionsUI.document.querySelector('.unused-place'),chosenId=unusedRow.dataset.id;
assert.equal(optionsUI.document.querySelector('.unarranged-group').dataset.kind,'sight');
optionsUI.click(unusedRow.querySelector('[data-action=replace]'));assert.equal(optionsUI.$('adjust-place-action').hidden,false);assert.equal(optionsUI.$('place-add-fields').hidden,true);
optionsUI.$('place-replace-target').value=firstPlan[0].id;optionsUI.change(optionsUI.$('place-replace-target'));optionsUI.click(optionsUI.$('preview-place-change'));assert.equal(optionsUI.$('change-preview').hidden,false);
assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,firstPlan,'chosen replacement is only a preview');optionsUI.click(optionsUI.$('dismiss-change'));assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,firstPlan);
optionsUI.click(optionsUI.$('preview-place-change'));optionsUI.click(optionsUI.$('accept-change'));const chosenPlan=JSON.parse(store.get('moontrip.v1')).manual_stops;
assert.equal(chosenPlan[0].id,chosenId,'user chosen unused place replaces selected stop');assert.deepEqual(chosenPlan.slice(1),firstPlan.slice(1),'unchanged days and preceding stops retain times');optionsUI.click(optionsUI.$('undo-change'));
// Daily capacity rejects additions without replacing the saved roadbook.
optionsUI.click(optionsUI.document.querySelector('.unused-place [data-action=add]'));optionsUI.click(optionsUI.$('preview-place-change'));assert.equal(optionsUI.$('change-preview').hidden,true);assert.match(optionsUI.$('sheet-feedback').textContent,/景点|上限|最多/);assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,firstPlan);optionsUI.click(optionsUI.$('close-adjustment'));
// Removing a stop leaves it in unused places; adding it on the chosen day restores it.
const removed=firstPlan.at(-1);optionsUI.click([...optionsUI.document.querySelectorAll('.stop')].at(-1).querySelector('.stop-controls button'));optionsUI.click(optionsUI.$('accept-change'));
const afterRemoval=JSON.parse(store.get('moontrip.v1')).manual_stops;assert.equal(afterRemoval.length,firstPlan.length-1);
const removedRow=optionsUI.document.querySelector(`.unused-place[data-id="${removed.id}"]`);assert.ok(removedRow);optionsUI.click(removedRow.querySelector('[data-action=add]'));
optionsUI.$('place-add-day').value=String(removed.day);optionsUI.change(optionsUI.$('place-add-day'));optionsUI.$('place-add-after').value=firstPlan.at(-2).id;optionsUI.change(optionsUI.$('place-add-after'));optionsUI.click(optionsUI.$('preview-place-change'));
assert.equal(optionsUI.$('change-preview').hidden,false);assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,afterRemoval,'addition preview keeps original');optionsUI.click(optionsUI.$('accept-change'));
const afterAdd=JSON.parse(store.get('moontrip.v1')).manual_stops;assert.equal(afterAdd.at(-1).id,removed.id);assert.deepEqual(afterAdd.slice(0,-1),afterRemoval,'only affected suffix changes');assert.equal(optionsUI.document.querySelector(`.unused-place[data-id="${removed.id}"]`),null,'added place leaves unused list');
optionsUI.click(optionsUI.$('undo-change'));assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,afterRemoval);optionsUI.click(optionsUI.$('undo-change'));assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,firstPlan);
const savedPage=[];const originalBlobURL=URL.createObjectURL;URL.createObjectURL=blob=>{savedPage.push(blob);return originalBlobURL(blob);};
optionsUI.click(optionsUI.$('save-roadbook'));assert.equal(savedPage.length,1,'main save button exports a roadbook');const offline=await savedPage[0].text();assert.match(offline,/旅行路书/);assert.match(offline,/journey-connection/);URL.createObjectURL=originalBlobURL;
// Restaurant category and meal slot checks also work in the public static build.
store.clear();const foodNames=['青禾饭馆','松月餐厅','巷口食堂','溪岸小馆','山海菜馆'];const foodPlaces=foodNames.map((name,i)=>({...fixture('food-'+i,name,120.2+i/100),kind:'food',tags:['美食'],open:600,close:1320}));
const foodUI=await boot(true,[...places,...foodPlaces]);foodUI.$('end').value='17:00';foodUI.$('planner').dispatchEvent(new foodUI.window.Event('submit',{cancelable:true}));foodUI.click(foodUI.document.querySelector('.unarranged-tabs [data-kind=food]'));assert.equal(foodUI.document.querySelector('.unarranged-group').dataset.kind,'food');assert.ok(foodUI.document.querySelector('.unused-place'));
assert.ok([...foodUI.document.querySelectorAll('.unused-place')].every(r=>r.dataset.id.startsWith('food-')),'restaurant tab excludes sights');
foodUI.click(foodUI.document.querySelector('.unused-place [data-action=add]'));assert.equal(foodUI.$('place-meal-label').hidden,false);assert.equal(foodUI.$('place-add-meal').options[0].disabled,true,'occupied lunch cannot be selected again');foodUI.$('place-add-meal').value='dinner';foodUI.change(foodUI.$('place-add-meal'));foodUI.click(foodUI.$('preview-place-change'));assert.equal(foodUI.$('change-preview').hidden,true,'dinner outside daily hours rejected');assert.match(foodUI.$('sheet-feedback').textContent,/时段|结束|时间/);
foodUI.click(foodUI.$('close-adjustment'));foodUI.click(foodUI.document.querySelector('.unused-place [data-action=replace]'));assert.ok(foodUI.$('place-replace-target').options.every(o=>o.value.startsWith('food-')),'replace options only contain restaurants');foodUI.click(foodUI.$('preview-place-change'));assert.equal(foodUI.$('change-preview').hidden,false);foodUI.click(foodUI.$('accept-change'));const acceptedFood=JSON.parse(store.get('moontrip.v1')).manual_stops;
const reloadFood=await boot(true,[...places,...foodPlaces]);assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,acceptedFood,'chosen replacement survives reload');assert.ok(reloadFood.document.querySelector('.unarranged-tabs'));
// Researched closed sights stay informational; refreshed snapshots replace older
// provider records but preserve explicitly user-written overrides.
store.clear();const pending={id:'closed-sight',name:'闭馆场馆',city:'杭州',district:'测试片区',address:'测试地址',location:'120.1,30.2',kind:'sight',cost_hint:'',open_hint:'旧时段',fetched_at:'2026-10-11',url:'https://www.amap.com/place/test'};
const sourcePlaces=places.map(p=>({...p,source:'公开来源快照',visit_notice:p.id==='a'?'需自行预约，路书不代表预约成功。':undefined}));
const researchUI=await boot(true,sourcePlaces,[pending]);assert.match(researchUI.$('pending-places').textContent,/官方公告暂时关闭/);assert.equal(researchUI.$('pending-places').querySelector('button'),null,'closed researched venue has no add action');assert.ok(researchUI.document.querySelector('.visit-notice'),'reservation notice visible in roadbook');
const stale=JSON.parse(store.get('moontrip.v1'));stale.places[0].cost=1;stale.places[1].source='用户核对：我自己的费用';stale.places[1].cost=12;store.set('moontrip.v1',JSON.stringify(stale));
const refreshUI=await boot(true,sourcePlaces,[pending]);refreshUI.click(refreshUI.$('load-hangzhou'));await new Promise(r=>setTimeout(r,10));const refreshed=JSON.parse(store.get('moontrip.v1')).places;assert.equal(refreshed.find(p=>p.id==='a').cost,10,'explicit load refreshes old source record');assert.equal(refreshed.find(p=>p.id==='b').cost,12,'user override preserved');
// New plans have room for dinner. Older 17:00 roadbooks can append dinners
// through a preview without moving their existing stops or manual gaps.
store.clear();const dinnerUI=await boot(true,[...places,...foodPlaces]);assert.equal(dinnerUI.$('end').value,'20:00');assert.equal([...dinnerUI.document.querySelectorAll('.tag-food')].filter(n=>n.textContent.includes('晚餐')).length,2,'default roadbook includes dinner each day with feasible data');
dinnerUI.$('end').value='17:00';dinnerUI.$('planner').dispatchEvent(new dinnerUI.window.Event('submit',{cancelable:true}));const legacyDinner=JSON.parse(store.get('moontrip.v1'));assert.equal([...dinnerUI.document.querySelectorAll('.tag-food')].filter(n=>n.textContent.includes('晚餐')).length,0);
dinnerUI.click(dinnerUI.document.querySelector('.add-dinner'));assert.equal(dinnerUI.$('change-preview').hidden,false);assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,legacyDinner.manual_stops,'dinner preview leaves old plan intact');dinnerUI.click(dinnerUI.$('dismiss-change'));assert.equal(JSON.parse(store.get('moontrip.v1')).request.end,1020);
dinnerUI.click(dinnerUI.document.querySelector('.add-dinner'));dinnerUI.click(dinnerUI.$('accept-change'));const completedDinner=JSON.parse(store.get('moontrip.v1'));assert.equal(completedDinner.request.end,1200);assert.equal(completedDinner.meals.dinner,true);
for(const stop of legacyDinner.manual_stops)assert.deepEqual(completedDinner.manual_stops.find(s=>s.id===stop.id),stop,'dinner completion retains each existing stop and time');
assert.equal([...dinnerUI.document.querySelectorAll('.tag-food')].filter(n=>n.textContent.includes('晚餐')).length,2);dinnerUI.click(dinnerUI.$('undo-change'));assert.deepEqual(JSON.parse(store.get('moontrip.v1')).manual_stops,legacyDinner.manual_stops);assert.equal(JSON.parse(store.get('moontrip.v1')).request.end,1020,'dinner undo restores original finish');
const history=historyStore(2);const value={n:[1]};history.push(value);value.n[0]=9;assert.deepEqual(history.pop(),{n:[1]},'undo snapshots are immutable');
const expired={from_id:'a',to_id:'b',origin_location:places[0].location,destination_location:places[1].location,fetched_at:new Date(Date.now()-3600001).toISOString()};assert.equal(freshRoutes([expired],places).length,0,'expired route excluded');
const coords=projectPoints([{longitude:120,latitude:30},{longitude:120,latitude:30}]);assert.equal(coords[0].x,300);assert.equal(coords[0].y,160);
console.log('Roadbook-first UI checks passed: initial tools hidden, four on-demand panels, categorized unused places, chosen add/replace previews and undo, capacity/meal rejection, bounded replacement suggestions, pace preview/undo, offline save; staged choices, assigned days, map, locks, per-leg preview/ignore/accept, undo, stale preview, reload and static mode. No visual-browser claim.');
