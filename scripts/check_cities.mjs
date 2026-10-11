import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {plan_with_preferences_json, pending_places_json, restaurants_similar} from '../web/engine.js';
for(const [file,city] of [['hangzhou','杭州'],['chengdu','成都']]){
  const data=JSON.parse(readFileSync(new URL(`../web/data/${file}.json`,import.meta.url)));
  assert.equal(data.city,city);
  const all=[...data.places,...data.pending];
  assert.equal(new Set(all.map(p=>p.id)).size,all.length);
  assert(all.every(p=>p.city===city&&p.location&&p.url&&p.fetched_at));
  assert(data.places.every(p=>Number.isInteger(p.cost)&&p.cost>=0&&p.source&&p.windows.length));
  assert(data.pending.every(p=>p.cost===undefined));
  assert(JSON.parse(pending_places_json(JSON.stringify(data.pending))).ok);
  const food=all.filter(p=>p.kind==='food');
  for(let i=0;i<food.length;i++)for(let j=i+1;j<food.length;j++)assert(!restaurants_similar(city,food[i].name,city,food[j].name),`similar restaurants: ${food[i].name}, ${food[j].name}`);
  for(const [mode,start,end,max_visits] of [['lazy',600,1080,2],['intense',420,1320,6],['weekend',540,1080,3]]){
    const request={city,days:2,budget:1000,start,end,interests:['自然','文化','美食'],family:false,rain:false,relaxed:mode==='lazy',must_visit:[],avoid:[],priority:'balanced',include_food:true,diet:'不限',max_visits};
    const result=JSON.parse(plan_with_preferences_json(JSON.stringify({request,places:data.places,preferences:{mode,environment:'any',walking:false,transfer_limit:180},meals:{lunch:true,dinner:true}})));
    assert(result.ok,JSON.stringify(result.errors));
    const stops=result.plan.days.flatMap(d=>d.stops),meals=stops.filter(s=>s.place.kind==='food');
    assert(result.plan.days.every(d=>d.stops.some(s=>s.place.kind==='sight')));
    assert.equal(meals.length,4,`${city}/${mode}: missing meals`);
    assert(result.plan.total_cost<=request.budget);
    for(const meal of meals)assert(meal.meal==='午餐'?meal.start>=660&&meal.end<=840:meal.start>=1020&&meal.end<=1260);
    for(let i=0;i<meals.length;i++)for(let j=i+1;j<meals.length;j++)assert(!restaurants_similar(city,meals[i].place.name,city,meals[j].place.name));
    console.log(`${city}/${mode}: ${stops.length} stops, ${meals.length} meals, ¥${result.plan.total_cost}/person`);
  }
}
