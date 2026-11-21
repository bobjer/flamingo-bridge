// Hidden enemy air defence / EW and the estimates dummies reveal. Pure logic, no DOM.
import {corridors,origin,travel,segmentHitsCircle} from './deep-atlas.js';
export const threatKinds={ad:{radius:[9,13],hit:.75,cause:'shot'},ew:{radius:[7,10],hit:.6,cause:'jammed'}};
const xEdges=[0,22,41,63,100],yEdges=[0,40,61,100];
const between=(random,a,b)=>a+random()*(b-a);
function spot(kind,ok,random,y0,y1,avoid){
 for(let n=0;n<60;n++){
  const x=between(random,30,92),y=between(random,y0,y1);
  if(ok(x,y)&&(!avoid||Math.hypot(x-avoid[0],y-avoid[1])>=12))return [x,y];
 }
 return [60,(y0+y1)/2];
}
const radiusOf=(kind,random)=>{const [a,b]=threatKinds[kind].radius;return Math.round(between(random,a,b)*10)/10};
// 3-4 threats, one per horizontal band so they spread over the board. ok(x,y) = playable ground.
export function placeThreats(ok=()=>true,random=Math.random,wave=1){
 const count=3+Math.floor(random()*2),kinds=['ad','ew','ad',random()<.5?'ad':'ew'].slice(0,count);
 const lo=12,hi=80,step=(hi-lo)/count;
 return kinds.map((kind,id)=>{
  const [x,y]=spot(kind,ok,random,lo+id*step,lo+(id+1)*step);
  return {id,kind,x:Math.round(x*10)/10,y:Math.round(y*10)/10,r:radiusOf(kind,random),since:wave};
 });
}
export const validThreats=t=>Array.isArray(t)&&t.length>=3&&t.length<=4&&t.every(a=>a&&(a.kind==='ad'||a.kind==='ew')&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&a.r>0);
// Every third wave one threat relocates.
export function relocate(threats,wave,ok=()=>true,random=Math.random){
 if(wave%3!==0||!threats.length)return {threats,moved:null};
 const index=Math.floor(random()*threats.length),old=threats[index];
 const [x,y]=spot(old.kind,ok,random,12,80,[old.x,old.y]);
 const moved={...old,x:Math.round(x*10)/10,y:Math.round(y*10)/10,r:radiusOf(old.kind,random),since:wave};
 return {threats:threats.map((t,i)=>i===index?moved:t),moved:moved.id};
}
// Survey sector i flies corridor lane i. Lane 0 (y~32, north) = Лука (33,27), lane 1 (y~52) = Гай (51,55), lane 2 (y~67, south) = Схил (49,71).
export function lanePath(sector){
 const lane=corridors[sector]??corridors[1],last=lane[lane.length-1];
 return [origin,...lane,[96,last[1]]];
}
// Shift every point except the launch point sideways by `offset` (perpendicular to the local direction).
export function offsetPath(path,offset){
 return path.map((p,i)=>{
  if(!i||!offset)return p;
  const a=path[i-1],b=path[Math.min(i+1,path.length-1)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
  return [p[0]-dy/len*offset,p[1]+dx/len*offset];
 });
}
export const dummyPath=(sector,offset=0)=>offsetPath(lanePath(sector),offset);
export const inCoverage=(p,t)=>Math.hypot(p[0]-t.x,p[1]-t.y)<=t.r;
// Threats a path crosses (segment test).
export function crossedThreats(path,threats){
 return threats.filter(t=>path.some((p,i)=>i&&segmentHitsCircle(path[i-1],p,t)));
}
export function resolveSurvey(path,count,threats,random=Math.random,baseline=.05){
 const total=travel(path,1).total,step=.4;
 return Array.from({length:count},()=>{
  const offset=Math.round((random()*2-1)*12)/10,own=offsetPath(path,offset);
  let best=null;
  const rolled=new Set();
  for(let d=0;d<=total&&!best;d+=step){
   const f=Math.min(1,d/total),p=travel(own,f);
   for(const t of threats){
    if(rolled.has(t.id)||!inCoverage([p.x,p.y],t))continue;
    rolled.add(t.id);
    const info=threatKinds[t.kind];
    if(random()<info.hit){best={lost:true,cause:info.cause,at:[p.x,p.y],threatId:t.id,kind:t.kind,r:t.r,fraction:f,offset};break}
   }
  }
  const stray=random()<baseline?random()*.95+.02:null;
  if(stray!==null&&(!best||stray<best.fraction)){const p=travel(own,stray);return {lost:true,cause:'unknown',at:null,threatId:null,kind:null,fraction:stray,offset,pos:[p.x,p.y]}}
  return best??{lost:false,cause:null,at:null,threatId:null,kind:null,fraction:1,offset};
 });
}
export const isLost=l=>l===true||!!l?.lost;
const crossesCircle=(path,c)=>path.some((p,i)=>i&&segmentHitsCircle(path[i-1],p,c));
export function confidence(e){
 return Math.max(5,Math.min(95,e.confirmed?95:30+e.hits*18+(e.r<5?10:0))-(e.stale?25:0));
}
// Update estimates from this wave's loss records. passes = paths of dummies that survived.
export function refine(estimates,losses,wave,{threats=[],passes=[],random=Math.random}={}){
 const trace=estimates.map(e=>({...e,sx:e.sx??e.x*e.hits,sy:e.sy??e.y*e.hits}));
 const fresh=[],confirmed=[];
 let nextId=Math.max(0,...trace.map(e=>e.id))+1;
 for(const l of losses){
  if(!l?.lost||!l.at||!l.kind)continue;
  let best=null,bd=Infinity;
  for(const e of trace){
   const d=Math.hypot(e.x-l.at[0],e.y-l.at[1]);
   if(e.kind===l.kind&&d<=1.6*e.r&&d<bd){best=e;bd=d}
  }
  if(!best){
   const e={id:nextId++,kind:l.kind,x:l.at[0],y:l.at[1],r:(l.r??10)*1.1,hits:1,wave,confirmed:false,stale:false,threatId:l.threatId,sx:l.at[0],sy:l.at[1]};
   trace.push(e);fresh.push(e.id);continue;
  }
  best.hits++;best.wave=wave;best.stale=false;best.threatId=l.threatId;
  if(best.confirmed)continue;
  best.sx+=l.at[0];best.sy+=l.at[1];
  best.x=best.sx/best.hits;best.y=best.sy/best.hits;
  best.r=Math.max(3.2,best.r*.72);
  if(best.hits>=3||best.r<=3.5){
   best.confirmed=true;confirmed.push(best.id);
   const t=threats.find(a=>a.id===l.threatId);
   if(t){best.x=t.x+(random()*2-1)*.6;best.y=t.y+(random()*2-1)*.6;best.r=t.r}
  }
 }
 const kept=trace.filter(e=>{
  if(e.wave<wave&&passes.length){
   const t=threats.find(a=>a.id===e.threatId);
   if(t&&t.since>e.wave&&passes.some(p=>crossesCircle(p,e)))return false;
  }
  const age=wave-e.wave;
  e.stale=age>=4;
  return age<7;
 });
 return {trace:kept,fresh:fresh.filter(id=>kept.some(e=>e.id===id)),confirmed:confirmed.filter(id=>kept.some(e=>e.id===id))};
}
export const activeZones=trace=>(trace??[]).filter(e=>!e.stale).map(({x,y,r})=>({x,y,r}));
// Districts (deep-atlas.js grid) overlapped by a circle shrunk to 70%.
export function districtsOf({x,y,r}){
 const out=new Set(),rr=r*.7;
 for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  const cx=Math.max(xEdges[col],Math.min(xEdges[col+1],x)),cy=Math.max(yEdges[row],Math.min(yEdges[row+1],y));
  if(Math.hypot(cx-x,cy-y)<=rr)out.add(row*4+col);
 }
 return out;
}
// Nearest survey lane to a point (for naming the zone).
export function nearestLane(x,y){
 let best=0,bd=Infinity;
 corridors.forEach((_,i)=>{
  const path=lanePath(i);
  for(let f=0;f<=1;f+=.02){const p=travel(path,f),d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;best=i}}
 });
 return best;
}
