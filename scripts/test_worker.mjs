import assert from 'node:assert/strict';
import {createWorker,AiQuota} from '../server/worker.js';
import {catalogue_json} from '../web/engine.js';
const current={city:'杭州',days:2,budget:1000,start:540,end:1200,interests:['自然'],family:false,rain:false,relaxed:true,must_visit:['my-place'],avoid:['excluded'],priority:'balanced',include_food:true,diet:'不限',max_visits:3,start_weekday:6};
const origin='https://kleinrat.github.io';let calls=0,quota=204;
const env={KIMI_API_KEY:'test-secret-not-a-real-key',AI_QUOTA:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:quota})})}};
const req=(body={message:'晚点出门',current},headers={},method='POST',path='/api/assistant')=>new Request('https://example.workers.dev'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
const worker=createWorker(async(url,options)=>{calls++;assert.equal(url,'https://api.moonshot.cn/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+env.KIMI_API_KEY);const payload=JSON.parse(options.body);assert.equal(payload.model,'kimi-k2.6');assert.equal(payload.thinking.type,'disabled');assert.match(payload.messages[0].content,/JSON/);return Response.json({choices:[{message:{content:JSON.stringify({...current,start:600,start_weekday:2})}}]});});
const result=await worker.fetch(req(),env);assert.equal(result.status,200);const data=await result.json();assert.equal(data.request.start,600);assert.equal(data.request.start_weekday,6,'AI cannot change calendar context');assert.equal(JSON.stringify(data).includes(env.KIMI_API_KEY),false);
assert.equal((await worker.fetch(req(undefined,{Origin:'https://evil.example'}),env)).status,403);
assert.equal((await worker.fetch(req(undefined,{'Content-Type':'text/plain'}),env)).status,415);
assert.equal((await worker.fetch(req({message:'x'.repeat(3001),current}),env)).status,422);
assert.equal((await worker.fetch(req({message:'ok',current:{...current,days:99}}),env)).status,422);
assert.equal((await worker.fetch(req(),{})).status,503);assert.equal(calls,1,'invalid requests do not call provider');
quota=429;assert.equal((await worker.fetch(req(),env)).status,429);assert.equal(calls,1);quota=204;
for(const status of [401,402,403,429,500]){const w=createWorker(async()=>new Response('private provider error with secret',{status}));const response=await w.fetch(req(),env);assert.equal(response.status,502);assert.equal((await response.text()).includes('private provider'),false);}
assert.equal((await createWorker(async()=>Response.json({choices:[{message:{content:'not-json'}}]})).fetch(req(),env)).status,422);
assert.equal((await createWorker(async()=>Response.json({choices:[{message:{content:JSON.stringify({...current,must_visit:[]})}}]})).fetch(req(),env)).status,422,'AI cannot change chosen places');
assert.equal((await createWorker(async()=>new Response('x'.repeat(131073))).fetch(req(),env)).status,422);
assert.equal((await worker.fetch(req(undefined,{},'GET','/api/status'),env)).status,200);assert.equal((await worker.fetch(req(undefined,{},'OPTIONS'),env)).status,204);
// Persistent budget gate: per-client minute cap and global daily cap, atomic storage.
let stored;const storage={get:async()=>structuredClone(stored),put:async(k,v)=>{stored=structuredClone(v);},transaction:async f=>f(storage)};
const counter=new AiQuota({storage},{DAILY_LIMIT:'4'}),client='a'.repeat(64);const gate=c=>counter.fetch(new Request('https://quota.internal/check',{method:'POST',body:JSON.stringify({client:c})}));
for(let i=0;i<3;i++)assert.equal((await gate(client)).status,204);assert.equal((await gate(client)).status,429);assert.equal((await gate('b'.repeat(64))).status,204);assert.equal((await gate('c'.repeat(64))).status,429);stored.day='2000-01-01';assert.equal((await gate(client)).status,204,'new day resets quota');
console.log('Public AI worker checks passed: MoonBit validation, immutable selection/calendar, origin, bounds, missing config, provider errors, response bounds and persistent quotas. No live provider claim.');
