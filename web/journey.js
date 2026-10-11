// Plain state helpers; all itinerary feasibility and suggestions come from MoonBit.
export const emptyLocks=()=>({places:[],times:[],legs:[]});
export const legKey=(a,b)=>JSON.stringify([a,b]);
export const planStops=plan=>plan.days.flatMap(d=>d.stops.map(s=>({id:s.place.id,day:d.day,start:s.start})));
export const planLegs=plan=>plan.days.flatMap(d=>d.stops.slice(1).map((s,i)=>({day:d.day,from:d.stops[i].place,to:s.place,stop:s})));
export function freshRoutes(routes,places,now=Date.now()){
  return routes.filter(r=>{const a=places.find(p=>p.id===r.from_id),b=places.find(p=>p.id===r.to_id),age=now-Date.parse(r.fetched_at);return a&&b&&a.location===r.origin_location&&b.location===r.destination_location&&age>=-60000&&age<3600000;});
}
export function historyStore(limit=20){
  const items=[];
  return {push(value){items.push(structuredClone(value));if(items.length>limit)items.shift();},pop(){return items.pop();},get size(){return items.length;}};
}
export function projectPoints(points){
  const xs=points.map(p=>p.longitude),ys=points.map(p=>p.latitude);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const midLat=(minY+maxY)/2*Math.PI/180,scaleX=Math.cos(midLat);
  const spanX=(maxX-minX)*scaleX,spanY=maxY-minY,scale=Math.max(spanX/490,spanY/250,0.000001);
  return points.map(p=>({...p,x:300+((p.longitude-(minX+maxX)/2)*scaleX)/scale,y:160-(p.latitude-(minY+maxY)/2)/scale}));
}
