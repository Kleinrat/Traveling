import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPublicServer} from '../server/public.mjs';
const current={city:'杭州',days:2,budget:1000,start:540,end:1200,interests:['自然'],family:false,rain:false,relaxed:true,must_visit:[],avoid:[],priority:'balanced',include_food:true,diet:'不限',max_visits:3,start_weekday:6};
let calls=0;
const server=createPublicServer({KIMI_API_KEY:'fake-test-secret',DAILY_LIMIT:'2'},async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify({...current,start:600})}}]});});
server.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port,origin='https://kleinrat.github.io';
const ask=(body={message:'晚点出门',current},headers={})=>fetch(base+'/api/assistant',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
try{
  assert.equal((await fetch(base+'/healthz')).status,200);
  assert.equal((await fetch(base+'/api/status')).status,403);
  const status=await fetch(base+'/api/status',{headers:{Origin:origin}});assert.equal((await status.json()).configured,true);assert.equal(status.headers.get('access-control-allow-origin'),origin);
  assert.equal((await fetch(base+'/api/assistant',{method:'OPTIONS',headers:{Origin:origin}})).status,204);
  assert.equal((await ask(undefined,{Origin:'https://evil.example'})).status,403);
  assert.equal((await ask({message:'ok',current:{...current,days:99}})).status,422);
  assert.equal((await ask({message:'x'.repeat(24001),current})).status,413);
  const reply=await ask();assert.equal(reply.status,200);const data=await reply.json();assert.equal(data.request.start,600);assert.equal(data.request.start_weekday,6);assert(!JSON.stringify(data).includes('fake-test-secret'));
  assert.equal((await ask()).status,200);assert.equal((await ask()).status,429);assert.equal(calls,2);
  console.log('Free-host HTTP integration passed: health, CORS, preflight, bounds, MoonBit validation, safe secrets and instance quotas; provider mocked.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
