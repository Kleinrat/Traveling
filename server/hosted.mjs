import {kimiTransport} from './kimi-transport.mjs';
import {createWorker,AiQuota} from './worker.js';
export function createHostedWorker(config=process.env,providerFetch=kimiTransport){
  // Free hosting uses ephemeral instances. Counts reset on restart/cold start;
  // they limit a running instance, not the provider account's monetary balance.
  let saved,queue=Promise.resolve(),active=0;
  const storage={get:async()=>structuredClone(saved),put:async(key,value)=>{saved=structuredClone(value);},transaction:fn=>{
    const next=queue.then(()=>fn(storage));queue=next.catch(()=>{});return next;
  }};
  const quota=new AiQuota({storage},{DAILY_LIMIT:config.DAILY_LIMIT||'30'});
  const env={REPORT_ERROR:detail=>console.error('AI gateway failure',JSON.stringify(detail)),KIMI_API_KEY:config.KIMI_API_KEY,KIMI_MODEL:config.KIMI_MODEL||'kimi-k2.6',ALLOWED_ORIGIN:config.ALLOWED_ORIGIN||'https://kleinrat.github.io',AI_QUOTA:{idFromName:x=>x,get:()=>({fetch:(url,init)=>quota.fetch(new Request(url,init))})}};
  const worker=createWorker(async(url,options)=>{
    try{return await providerFetch(url,options);}catch(error){
      // Retry only a failed TCP connection: no HTTP request was delivered.
      // Reuse the original deadline and never retry HTTP/provider errors.
      if(!['UND_ERR_CONNECT_TIMEOUT','KIMI_CONNECT_TIMEOUT'].includes(error?.cause?.code||error?.code)||options.signal?.aborted)throw error;
      return providerFetch(url,options);
    }
  });
  return {async fetch(request){
    const allowed=env.ALLOWED_ORIGIN,origin=request.headers.get('Origin');
    if(active>=2)return Response.json({ok:false,errors:['助手正忙，请稍后再试']},{status:429,headers:{...(origin===allowed?{'Access-Control-Allow-Origin':allowed}:{}),'Cache-Control':'no-store','Vary':'Origin'}});
    active++;
    try{const headers=new Headers(request.headers);headers.delete('CF-Connecting-IP');return await worker.fetch(new Request(request,{headers}),env);}finally{active--;}
  }};
}
