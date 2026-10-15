import assert from 'node:assert/strict';
import {createHostedWorker} from '../server/hosted.mjs';
const current={city:'杭州',days:2,budget:1000,start:540,end:1200,interests:['自然'],family:false,rain:false,relaxed:true,must_visit:[],avoid:[],priority:'balanced',include_food:true,diet:'不限',max_visits:3,start_weekday:6};
const request=()=>new Request('https://example.vercel.app/api/assistant',{method:'POST',headers:{Origin:'https://kleinrat.github.io','Content-Type':'application/json','CF-Connecting-IP':String(Math.random())},body:JSON.stringify({message:'十点出门',current})});
const reply=()=>Response.json({choices:[{message:{content:JSON.stringify({...current,start:600})}}]});
for(const code of ['UND_ERR_CONNECT_TIMEOUT','KIMI_CONNECT_TIMEOUT']){
  let calls=0;
  const app=createHostedWorker({KIMI_API_KEY:'fake'},async()=>{calls++;if(calls===1){const e=new Error();e.code=code;throw e;}return reply();});
  const response=await app.fetch(request());assert.equal(response.status,200);assert.equal((await response.json()).request.start,600);assert.equal(calls,2,'one failed connection retried');
}
let errors=0;const rejected=createHostedWorker({KIMI_API_KEY:'fake'},async()=>{errors++;return new Response('private',{status:401});});assert.equal((await rejected.fetch(request())).status,502);assert.equal(errors,1,'HTTP provider errors are never retried');
let calls=0;const limited=createHostedWorker({KIMI_API_KEY:'fake',DAILY_LIMIT:'2'},async()=>{calls++;return reply();});
assert.equal((await limited.fetch(request())).status,200);assert.equal((await limited.fetch(request())).status,200);assert.equal((await limited.fetch(request())).status,429);assert.equal(calls,2,'forged client IP cannot reset the shared warm-instance quota');
console.log('Hosted adapter checks passed: connection-only retries, immutable validated response, no HTTP-error retries and spoof-resistant shared instance quota.');
