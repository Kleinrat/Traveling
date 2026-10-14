import assert from 'node:assert/strict';
import {gcjToWgs,mapPoints,adjacentSegments,mountMap} from '../web/map.js';
// Independent Shanghai reference pair, tolerance 12 m (display conversion only).
const sh=gcjToWgs(121.478223,31.228458);assert.ok(Math.abs(sh[0]-121.4737)<.0001&&Math.abs(sh[1]-31.2304)<.0001);
assert.deepEqual(gcjToWgs(-.1276,51.5072),[-.1276,51.5072]);
for(const pair of [[NaN,30],[120,Infinity],[181,30],[120,91]])assert.equal(gcjToWgs(...pair),null);
const input=[0,1,3].map(index=>({index,longitude:120.15+index/100,latitude:30.25,stop:{place:{kind:index===1?'food':'sight',name:'测试'+index}}}));
const points=mapPoints(input);assert.equal(points.length,3);assert.equal(adjacentSegments(points).length,1,'missing coordinates do not bridge omitted stops');assert.notEqual(points[0].latlng[1],input[0].longitude);
let removed=0,markers=[],lines=[],events={},status=[];
const map={setView(){},fitBounds(){},invalidateSize(){},remove(){removed++;}};
globalThis.L={map:()=>map,tileLayer:(url,opts)=>{assert.equal(url,'https://tile.openstreetmap.org/{z}/{x}/{y}.png');assert.match(opts.attribution,/OpenStreetMap/);return {on(event,fn){events[event]=fn;return this;},addTo(){return this;}};},polyline:p=>{lines.push(p);return {addTo(){}};},divIcon:x=>x,marker:(p,o)=>{markers.push(o);return {addTo(){return this;},on(event,fn){return this;}};},latLngBounds:p=>p};
const controller=mountMap({},input,()=>{},s=>status.push(s));await controller.ready;
assert.equal(markers.length,3);assert.equal(lines.length,1);assert.equal(markers[1].icon.className,'route-marker route-food');events.tileerror();assert.equal(status.at(-1),'failed');events.tileload();assert.equal(status.at(-1),'ready');controller.dispose();assert.equal(removed,1);
const race=mountMap({},input,()=>{},()=>assert.fail('disposed map must not publish status'));race.dispose();await race.ready;assert.equal(markers.length,3,'late library response cannot remount a discarded map');delete globalThis.L;
console.log('Map checks passed: coordinate conversion, gaps, food markers, attribution, tile failure and dispose race');
