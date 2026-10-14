// Display adapter only. Planning, time constraints and budget remain in MoonBit.
let library;
function loadLeaflet(){
  if(globalThis.L)return Promise.resolve(globalThis.L);
  if(library)return library;
  library=new Promise((resolve,reject)=>{
    const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./vendor/leaflet/leaflet.css',import.meta.url).href;document.head.append(css);
    const script=document.createElement('script');script.src=new URL('./vendor/leaflet/leaflet.js',import.meta.url).href;
    const timer=setTimeout(()=>reject(Error('地图组件加载超时')),12000);
    script.onload=()=>{clearTimeout(timer);globalThis.L?resolve(globalThis.L):reject(Error('地图组件不可用'));};
    script.onerror=()=>{clearTimeout(timer);reject(Error('地图组件加载失败'));};document.head.append(script);
  }).catch(error=>{library=undefined;throw error;});return library;
}
// Amap POIs use GCJ-02; the OSM basemap uses WGS84. Approximate inverse,
// iterated to avoid displaying GCJ coordinates directly on a WGS84 map.
function offset(lon,lat){
  const x=lon-105,y=lat-35,pi=Math.PI;
  let dy=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
  let dx=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
  const common=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
  dy+=common+(20*Math.sin(y*pi)+40*Math.sin(y*pi/3))*2/3+(160*Math.sin(y*pi/12)+320*Math.sin(y*pi/30))*2/3;
  dx+=common+(20*Math.sin(x*pi)+40*Math.sin(x*pi/3))*2/3+(150*Math.sin(x*pi/12)+300*Math.sin(x*pi/30))*2/3;
  const rad=lat*pi/180,magic=1-.006693421622965943*Math.sin(rad)**2,sqrt=Math.sqrt(magic),a=6378245;
  return [dx*180/(a/sqrt*Math.cos(rad)*pi),dy*180/(a*(1-.006693421622965943)/(magic*sqrt)*pi)];
}
export function gcjToWgs(lon,lat){
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)return null;
  if(lon<72.004||lon>137.8347||lat<.8293||lat>55.8271)return [lon,lat];
  let x=lon,y=lat;for(let i=0;i<5;i++){const [dx,dy]=offset(x,y);x-=x+dx-lon;y-=y+dy-lat;}return [x,y];
}
export function mapPoints(points){return points.flatMap(p=>{const wgs=gcjToWgs(p.longitude,p.latitude);return wgs?[{...p,latlng:[wgs[1],wgs[0]]}]:[];});}
export function adjacentSegments(points){const out=[];for(let i=1;i<points.length;i++)if(points[i].index===points[i-1].index+1)out.push([points[i-1].latlng,points[i].latlng]);return out;}
export function mountMap(container,points,onSelect,onStatus){
  let disposed=false,map,timer;const valid=mapPoints(points);
  const ready=loadLeaflet().then(L=>{
    if(disposed||!valid.length)return;
    map=L.map(container,{scrollWheelZoom:false,attributionControl:true});
    const layer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'});
    let loaded=false;layer.on('tileload',()=>{loaded=true;clearTimeout(timer);onStatus('ready');});
    layer.on('tileerror',()=>{if(!loaded)onStatus('failed');});layer.addTo(map);
    timer=setTimeout(()=>{if(!loaded&&!disposed)onStatus('failed');},10000);
    for(const pair of adjacentSegments(valid))L.polyline(pair,{color:'#285a47',weight:3,dashArray:'7 7',interactive:false}).addTo(map);
    for(const p of valid){
      const number=p.index+1;
      const marker=L.marker(p.latlng,{title:`${number}. ${p.stop.place.name}`,alt:`${number}. ${p.stop.place.name}`,icon:L.divIcon({className:'route-marker '+(p.stop.place.kind==='food'?'route-food':'route-sight'),html:`<span>${number}</span>`,iconSize:[32,32],iconAnchor:[16,16]})}).addTo(map);
      marker.on('click',()=>onSelect(p));
    }
    if(valid.length===1)map.setView(valid[0].latlng,15);else map.fitBounds(L.latLngBounds(valid.map(p=>p.latlng)),{padding:[30,30],maxZoom:15});
    map.invalidateSize();onStatus('loading');
  }).catch(()=>{if(!disposed)onStatus('failed');});
  return {ready,dispose(){disposed=true;clearTimeout(timer);map?.remove();}};
}
