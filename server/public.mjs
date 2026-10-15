// Node transport for free single-instance hosting; planning stays in MoonBit.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {createWorker,AiQuota} from './worker.js';

export function createPublicServer(config=process.env,providerFetch=fetch){
  // Render Free has ephemeral storage. These counts reset on restart/sleep;
  // they limit a running instance, not the provider account's monetary balance.
  let saved,queue=Promise.resolve(),active=0;
  const storage={get:async()=>structuredClone(saved),put:async(key,value)=>{saved=structuredClone(value);},transaction:fn=>{
    const next=queue.then(()=>fn(storage));queue=next.catch(()=>{});return next;
  }};
  const quota=new AiQuota({storage},{DAILY_LIMIT:config.DAILY_LIMIT||'30'});
  const env={KIMI_API_KEY:config.KIMI_API_KEY,KIMI_MODEL:config.KIMI_MODEL||'kimi-k2.6',ALLOWED_ORIGIN:config.ALLOWED_ORIGIN||'https://kleinrat.github.io',AI_QUOTA:{idFromName:x=>x,get:()=>({fetch:(url,init)=>quota.fetch(new Request(url,init))})}};
  const worker=createWorker(providerFetch);
  return createServer(async(req,res)=>{
    const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
    const origin=req.headers.origin,cors=origin===env.ALLOWED_ORIGIN?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
    if(req.url==='/healthz'&&req.method==='GET')return send(200,{ok:true});
    if(active>=2)return send(429,{ok:false,errors:['助手正忙，请稍后再试']},cors);
    active++;
    try{
      if(origin!==env.ALLOWED_ORIGIN)return send(403,{ok:false,errors:['请求来源不匹配']});
      let size=0;const chunks=[];
      for await(const part of req){size+=part.length;if(size>24000){send(413,{ok:false,errors:['请求过大']},cors);return;}chunks.push(part);}
      // Ignore client-supplied proxy/IP headers. One shared 3/min gate is
      // deliberately conservative for a small public competition demo.
      const request=new Request('https://moontrip.internal'+req.url,{method:req.method,headers:{Origin:origin,'Content-Type':req.headers['content-type']||''},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
      const response=await worker.fetch(request,env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch{
      if(!res.headersSent)send(500,{ok:false,errors:['AI接口暂时不可用，可继续手动规划']},cors);else res.end();
    }finally{active--;}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=createPublicServer();server.requestTimeout=15000;server.headersTimeout=10000;
  server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('MoonTrip AI backend listening'));
}
