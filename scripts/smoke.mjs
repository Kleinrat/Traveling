import assert from 'node:assert/strict';
import {plan_json, catalogue_json} from '../web/engine.js';
const places=JSON.parse(catalogue_json());
const scenarios=[
  {city:'杭州',days:2,budget:150,start:540,end:1020,interests:['自然','文化'],family:false,rain:false,relaxed:false},
  {city:'成都',days:2,budget:250,start:600,end:990,interests:['亲子','科技'],family:true,rain:false,relaxed:true},
  {city:'杭州',days:1,budget:180,start:540,end:1020,interests:['文化','历史'],family:false,rain:true,relaxed:true},
];
for(const request of scenarios){
  Object.assign(request,{must_visit:[],avoid:[],priority:"balanced",include_food:false,diet:"不限",max_visits:4});
  const result=JSON.parse(plan_json(JSON.stringify({request,places})));
  assert(result.ok);assert(result.plan.total_cost<=request.budget);
  const stops=result.plan.days.flatMap(d=>d.stops);assert(stops.length>0);
  assert.equal(new Set(stops.map(s=>s.place.id)).size,stops.length);
  if(request.rain)assert(stops.every(s=>s.place.indoor));
  if(request.family)assert(stops.every(s=>s.place.family));
  console.log(`${request.city}: ${stops.length} stops, ${result.plan.total_cost} CNY`);
}
console.log('Three scenario smoke checks passed.');
const dining={...scenarios[1],include_food:true,diet:'不辣',must_visit:['cd-food-02'],max_visits:2};
const foodPlan=JSON.parse(plan_json(JSON.stringify({request:dining,places})));
assert(foodPlan.ok);
assert(foodPlan.plan.days.flatMap(d=>d.stops).some(s=>s.place.id==='cd-food-02'));
assert.equal(foodPlan.plan.total_cost,foodPlan.plan.activity_cost+foodPlan.plan.food_cost+foodPlan.plan.transfer_cost);
console.log('Dining selection and budget ledger passed.');
