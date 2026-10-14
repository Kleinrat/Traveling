import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {plan_with_preferences_json} from '../web/engine.js';
const evidence=JSON.parse(readFileSync(new URL('../web/data/sight-evidence.json',import.meta.url)));
const cities=['hangzhou','chengdu'].map(name=>JSON.parse(readFileSync(new URL(`../web/data/${name}.json`,import.meta.url))));
const all=cities.flatMap(c=>[...c.places,...c.pending]).filter(p=>p.kind==='sight');
assert.equal(evidence.entries.length,41);
assert.equal(new Set(evidence.entries.map(e=>e.id)).size,41);
assert.deepEqual(new Set(evidence.entries.map(e=>e.id)),new Set(all.map(p=>p.id)));
const added=[['灵隐寺',0],['飞来峰',0],['良渚古城遗址公园',60],['成都武侯祠博物馆',50],['成都杜甫草堂博物馆',50],['成都植物园',10],['锦里古街',0],['成都大熊猫繁育研究基地',55]];
for(const [name,fee] of added){
  const data=cities.find(c=>c.places.some(p=>p.name===name)),place=data?.places.find(p=>p.name===name);assert.ok(place,name);
  assert.equal(place.cost,fee);assert(place.open>=480&&place.close<=1020);
  const request={city:data.city,days:1,budget:1000,start:480,end:1080,interests:['自然','文化','美食'],family:false,rain:false,relaxed:false,must_visit:[place.id],avoid:[],priority:'balanced',include_food:false,diet:'不限',max_visits:3};
  const result=JSON.parse(plan_with_preferences_json(JSON.stringify({request,places:[place],preferences:{mode:'custom',environment:'any',walking:false,transfer_limit:180},meals:{lunch:false,dinner:false}})));
  assert.ok(result.ok,JSON.stringify(result.errors));assert.equal(result.plan.days[0].stops.length,1,name+' can be planned');
  const stop=result.plan.days[0].stops[0];assert.equal(stop.place.id,place.id);assert.equal(result.plan.activity_cost,fee);assert(stop.start>=place.open&&stop.end<=place.close);
}
for(const data of cities){
  assert(!data.places.some(p=>p.name.includes('金沙')||p.name.includes('博物馆(之江')||p.name==='中国丝绸博物馆'||p.name==='成都博物馆'||p.name==='四川博物院'),'closed or weekday-sensitive venues are not offered automatically');
  for(const e of evidence.entries.filter(e=>e.city===data.city)){
    assert(e.sources.length&&e.sources.every(s=>s.url.startsWith('https://')));
    if(e.status==='unresolved')assert.equal(e.fee_yuan,null,'unknown fee never becomes free');
    assert.equal(data.places.some(p=>p.id===e.id),e.planning_status==='candidate');
  }
}
assert.equal(evidence.entries.find(e=>e.name.includes('金沙')).status,'closed');
console.log('Sight evidence checks passed: 41 records, eight forced visits with adult fees and valid windows; unknown fees, weekly closures and renovation closure kept out of automatic candidates.');
