// HTTP transport only: the prompt and all proposal validation are MoonBit exports.
import {assistant_system,assistant_context,validate_for_current} from '../web/engine.js';
const MAX_BODY=24000,MAX_REPLY=131072;
function json(data,status=200,origin){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})}});}
function error(message,status,origin){return json({ok:false,errors:[message]},status,origin);}
async function boundedText(body,max){
  if(!body)return '';const reader=body.getReader(),chunks=[];let count=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>max){await reader.cancel();throw Error('size');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);
}
export function createWorker(providerFetch=fetch){return {async fetch(request,env){
  const path=new URL(request.url).pathname,allowed=env.ALLOWED_ORIGIN||'https://kleinrat.github.io',origin=request.headers.get('Origin');
  if(origin!==allowed)return error('请求来源不匹配',403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
  if(path==='/api/status'&&request.method==='GET')return json({configured:Boolean(env.KIMI_API_KEY&&env.AI_QUOTA),model:env.KIMI_MODEL||'kimi-k2.6',maps_configured:false},200,origin);
  if(path!=='/api/assistant')return error('接口不存在',404,origin);
  if(request.method!=='POST')return error('请使用POST请求',405,origin);
  if(!env.KIMI_API_KEY||!env.AI_QUOTA)return error('AI服务尚未完成部署，仍可手动规划',503,origin);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return error('请使用JSON请求',415,origin);
  let data;
  try{data=JSON.parse(await boundedText(request.body,MAX_BODY));}catch{return error('请求过大或格式不正确',413,origin);}
  if(!data||typeof data.message!=='string'||!data.message.trim()||data.message.length>3000||!data.current||typeof data.current!=='object')return error('请填写有效的旅行描述和当前条件',422,origin);
  const current=JSON.stringify(data.current);let checked;
  try{checked=JSON.parse(validate_for_current(current,current));}catch{return error('当前条件无效',422,origin);}
  if(!checked.ok)return json(checked,422,origin);
  if(!['杭州','成都'].includes(checked.request.city))return error('公网版目前支持杭州和成都',422,origin);
  let phase='quota';
  try{
    // One persistent counter across locations; Origin alone cannot stop API abuse.
    const ip=request.headers.get('CF-Connecting-IP')||'unknown';
    const hashed=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.KIMI_API_KEY+ip));
    const client=Array.from(new Uint8Array(hashed)).map(n=>n.toString(16).padStart(2,'0')).join('');
    const gate=env.AI_QUOTA.get(env.AI_QUOTA.idFromName('global-budget'));
    const quota=await gate.fetch('https://quota.internal/check',{method:'POST',body:JSON.stringify({client})});
    if(!quota.ok)return error('体验请求较多或今日额度已用完，请稍后再试；仍可手动规划',429,origin);
    phase='provider';
    const response=await providerFetch('https://api.moonshot.cn/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.KIMI_API_KEY},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:env.KIMI_MODEL||'kimi-k2.6',messages:[{role:'system',content:assistant_system()},{role:'user',content:assistant_context(current,data.message.trim())}],thinking:{type:'disabled'},response_format:{type:'json_object'},max_tokens:2048})});
    if(!response.ok){await response.body?.cancel();const message=({401:'AI密钥无效或已过期',402:'AI服务余额不足',403:'AI服务访问被拒绝',429:'AI服务限流，请稍后重试'})[response.status]||'AI服务暂时不可用，请稍后重试';return error(message,502,origin);}
    let result;try{const raw=JSON.parse(await boundedText(response.body,MAX_REPLY)),content=raw.choices?.[0]?.message?.content;if(typeof content!=='string')throw Error();result=JSON.parse(validate_for_current(content,current));}catch{return error('助手返回内容暂时无法使用，请重试或手动调整',422,origin);}
    return json(result,result.ok?200:422,origin);
  }catch(err){env.REPORT_ERROR?.({phase,name:String(err?.name||'Error'),code:String(err?.cause?.code||err?.code||'unknown')});return error(err?.name==='TimeoutError'?'AI响应超时，请重试或手动调整':'AI连接暂时不可用，请稍后重试',err?.name==='TimeoutError'?504:502,origin);}
}};}
export default createWorker();
// SQLite-backed Durable Object. Stores only a salted client digest and counts,
// never user descriptions, model replies or API keys. Counters reset each UTC day.
export class AiQuota{
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    const {client}=await request.json();if(typeof client!=='string'||!/^[a-f0-9]{64}$/.test(client))return new Response(null,{status:400});
    const now=Date.now(),day=new Date(now).toISOString().slice(0,10),minute=Math.floor(now/60000),limit=Math.min(500,Math.max(1,Number(this.env.DAILY_LIMIT)||50));
    const accepted=await this.state.storage.transaction(async storage=>{
      let entry=await storage.get('quota');if(!entry||entry.day!==day)entry={day,count:0,minute,clients:{}};
      if(entry.minute!==minute){entry.minute=minute;entry.clients={};}
      if(entry.count>=limit||(entry.clients[client]||0)>=3)return false;
      entry.count++;entry.clients[client]=(entry.clients[client]||0)+1;await storage.put('quota',entry);return true;
    });return new Response(null,{status:accepted?204:429});
  }
}
