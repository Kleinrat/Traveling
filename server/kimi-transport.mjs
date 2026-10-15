import {request as httpsRequest} from 'node:https';
import {Readable} from 'node:stream';
// The provider hostname is fixed by worker.js. Use an IPv4 TLS socket rather
// than depending on the platform fetch agent's address-family selection.
export function kimiTransport(url,options){
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(url,{method:options.method,headers:options.headers,family:4,signal:options.signal},res=>{
      resolve(new Response(Readable.toWeb(res),{status:res.statusCode,headers:{'Content-Type':'application/json'}}));
    });
    const timer=setTimeout(()=>{const error=new Error('Provider connection deadline');error.code='KIMI_CONNECT_TIMEOUT';req.destroy(error);},12000);
    timer.unref?.();
    req.once('socket',socket=>{if(!socket.connecting)clearTimeout(timer);else socket.once('connect',()=>clearTimeout(timer));});
    req.once('error',error=>{clearTimeout(timer);reject(error);});req.once('close',()=>clearTimeout(timer));
    req.end(options.body);
  });
}
