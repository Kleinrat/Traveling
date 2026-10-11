import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {plan_with_preferences_json, pending_places_json} from '../web/engine.js';
const bundle=JSON.parse(readFileSync(new URL('../web/data/hangzhou.json',import.meta.url)));
assert(bundle.places.length>=15);
assert.equal(new Set([...bundle.places,...bundle.pending].map(p=>p.id)).size,bundle.places.length+bundle.pending.length);
assert(bundle.places.every(p=>p.city==='杭州'&&p.location&&p.source&&Number.isInteger(p.cost)&&p.windows.length));
assert(bundle.pending.every(p=>p.cost===undefined));
assert(JSON.parse(pending_places_json(JSON.stringify(bundle.pending))).ok);
for(const [mode,start,end,max_visits] of [['lazy',600,1080,2],['intense',420,1320,6],['weekend',540,1080,3]]){
  const request={city:'杭州',days:2,budget:1000,start,end,interests:['自然','美食'],family:false,rain:false,relaxed:mode==='lazy',must_visit:[],avoid:[],priority:'balanced',include_food:true,diet:'不限',max_visits};
  const result=JSON.parse(plan_with_preferences_json(JSON.stringify({request,places:bundle.places,preferences:{mode,environment:'any',walking:false,transfer_limit:180},meals:{lunch:true,dinner:true}})));
  assert(result.ok,JSON.stringify(result.errors));
  assert(result.plan.days.every(d=>d.stops.length>0));
  const meals=result.plan.days.flatMap(d=>d.stops.filter(s=>s.place.kind==='food'));
  assert(meals.some(s=>s.meal==='午餐'));assert(meals.some(s=>s.meal==='晚餐'));
  console.log(`${mode}: ${result.plan.days.flatMap(d=>d.stops).length} stops, ${meals.length} meals, ¥${result.plan.total_cost}/person`);
}
