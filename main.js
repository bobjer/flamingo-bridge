import {tr,writeMessage} from './language.js';
import {fireworks} from './effects.js';
import * as T from 'three';
import {model} from './models.js';
import {landscape} from './scene.js';
const $=id=>document.getElementById(id),world=landscape($('view'));
const fx=fireworks(world.scene);
const getSpecs=()=>({sam:[tr("ЗРК «Хлопавка»","Party Popper SAM"),320,4,1.7],turret:[tr("Кулеметна турель","Machine-gun turret"),180,1,.45],cruiser:[tr("Ракетний крейсер","Missile cruiser"),480,7,2.1],dolphin:[tr("Бойовий дельфін","Combat dolphin"),140,2,.9]});
let specs=getSpecs();
const units=[],enemies=[],effects=[],scouts=[];
let cash,hp,time,wave,phase,paused,untilSpawn,score,foam,rp,unpaid,last=performance.now();
// Hidden national budget: player never sees it. All payouts come from it; time, blockade, jams, blackouts and victims drain it.
let reserve0,hype=0,victims=0,waveVictims=0,jamLoss=0;
const drain=x=>{reserve=Math.max(0,reserve-x)};
function casualties(at){
 let n=Math.floor(Math.random()*3);
 for(const v of vehicles)n+=(v.m.position.distanceTo(at)<7?2:.25)*(.5+Math.random());
 n=Math.round(n);victims+=n;waveVictims+=n;hype+=4*n;drain(12*n);
 if(n)$('caption').textContent=tr("ВТРАТИ: ","CASUALTIES: ")+n+(n>=6?tr(" · СКУПЧЕННЯ МАШИН"," · TRAFFIC PILEUP"):'');
}
function headline(){
 const f=reserve/reserve0;
 return f>.75?tr("Мінфін: «Запас міцності великий».","Treasury: “We have plenty in reserve.”"):f>.5?tr("Аналітики фіксують уповільнення економіки.","Analysts report an economic slowdown."):f>.3?tr("Рубль оновив мінімум, судноплавство скорочується.","The ruble hits a new low as shipping shrinks."):f>.12?tr("Регіони скаржаться на затримки виплат.","Regional offices report late payments."):f>0?tr("Мінфін: «Кошти є».","Treasury: “The funds exist.”"):tr("Скарбниця порожня. Ремонт за власний кошт.","The treasury is empty. Repairs are on you.");
}
// Economy: money shrinks (decaying grants and trophies, inflation, upkeep); research points grow with every kill.
const getTechs=()=>({dmg:[tr("Калібр","Calibre"),tr("шкода +30%","damage +30%")],rate:[tr("Автозаряджання","Autoloader"),tr("темп +15%","fire rate +15%")],range:[tr("Радар","Radar"),tr("дальність +12%","range +12%")],armor:[tr("Броня","Armour"),tr("корпус +1 · шкода мосту −12%","hull +1 · bridge damage −12%")],logi:[tr("Логістика","Logistics"),tr("ціни −7% · утримання −20%","prices −7% · upkeep −20%")]});
let techs=getTechs();
const tech={};
const techCost=L=>Math.round(10*Math.pow(2.3,L));
const upkeep={sam:14,turret:6,cruiser:20,dolphin:5};
const research={loaf:2,baby:1,flamingo:1,bird:1,neptune:8};
const infl=()=>Math.pow(1.04,Math.max(0,wave-1))*(1+.8*(1-reserve/reserve0))*Math.pow(.93,tech.logi);
const price=base=>Math.round(base*infl());
const armored=x=>Math.min(hp,Math.round(x*Math.pow(.88,tech.armor)));
function reward(k){rp+=research[k]}
function upkeepBill(){return Math.round((units.reduce((s,u)=>s+upkeep[u.k],0)*Math.pow(.8,tech.logi)+barges.length*4)*infl())}
function repairCost(){return price(90*Math.min(25,100-hp)/25)}
function researchTech(k){
 rp-=techCost(tech[k]);tech[k]++;
 if(k==='armor')for(const u of units)u.hull++;
 writeMessage(()=>getTechs()[k][0]+tr(" · рів. "," · lvl ")+tech[k]+': '+getTechs()[k][1]+'.');ui();
}
const reserves = {easy: 7000, normal: 4500, hard: 2600};
let reserve, waveDamage;
const vehicles = [], barges=[];
let seaCosts=0, hits=0,selectedShip=null,placing=false,signalPenalty=0;
const orders={gps:{name:'GPS',cost:75,end:0},net:{get name(){return tr("Інтернет","Internet")},cost:100,end:0}};
const pads=[];
for(const z of [-2.05,2.05,-7.45,-4.55])for(const x of [-9,-5,0,5,9]){
 const pad=new T.Mesh(new T.CylinderGeometry(.7,.7,.14,16),new T.MeshBasicMaterial({color:0xffbd57}));
 pad.position.set(x,3.28,z);pad.visible=false;world.scene.add(pad);pads.push(pad);
}
function setPlacement(on){
 placing=on;
 for(const pad of pads)pad.visible=on&&!units.some(u=>u.pad===pad);
}
function clearCourse(a,b){
 if(!b||Math.abs(b.x)>14||Math.abs(b.z)>25)return false;
 const line=new T.Line3(a,b);
 if(Math.min(a.z,b.z)<1&&Math.max(a.z,b.z)>-8&&Math.max(Math.abs(a.x),Math.abs(b.x))>9)return false;
 return barges.every(v=>line.closestPointToPoint(v.m.position,true,new T.Vector3()).distanceTo(v.m.position)>4.1);
}
function issueOrder(key){
 const o=orders[key];cash-=price(o.cost);o.end=time+10;ui();
}
function moveShips(dt){
 for(const u of units){
  if(!u.destination)continue;
  const p=u.m.position,delta=u.destination.clone().sub(p),d=delta.length();
  if(d<.05||!clearCourse(p,u.destination)){u.destination=null;continue}
  p.addScaledVector(delta,Math.min(1,dt*3/d));
 }
}
const canvas=$('view').querySelector('canvas');
let press;
canvas.addEventListener('pointerdown',e=>{press={x:e.clientX,y:e.clientY,id:e.pointerId}});
canvas.addEventListener('pointercancel',()=>{press=null});
canvas.addEventListener('pointerup',e=>{
 if(!press||e.pointerId!==press.id)return;
 const drag=Math.hypot(e.clientX-press.x,e.clientY-press.y);press=null;
 if(drag>6||phase==='over'||paused)return;
 if(placing){
  const pad=world.pick(e,pads.filter(p=>p.visible));
  if(pad&&cash>=price(specs.turret[1])){setPlacement(false);purchase('turret',pad)}
  return;
 }
 const ships=units.filter(u=>u.k==='cruiser');
 const picked=world.pick(e,ships.map(u=>u.m));
 if(picked){selectedShip=ships.find(u=>u.m===picked);writeMessage(()=>tr("Оберіть точку на воді. Обходьте баржі проміжними точками.","Choose open water. Use intermediate stops to steer around barges."));return}
 if(selectedShip&&units.includes(selectedShip)){
  const point=world.waterPoint(e);
  if(!clearCourse(selectedShip.m.position,point)){writeMessage(()=>tr("Шлях перекрито. Оберіть вільну воду.","Route blocked. Choose open water."));return}
  point.y=selectedShip.m.position.y;selectedShip.destination=point;selectedShip=null;
  writeMessage(()=>tr("Курс прийнято.","Course set."));return;
 }
 if(phase!=='live')return;
 const mesh=world.pick(e,vehicles.map(v=>v.m));
 const truck=vehicles.find(v=>v.m===mesh);
 if(!truck)return;
 if(truck.checked){$('caption').textContent=tr("МАШИНА ВЖЕ ПРОЇХАЛА КПП","TRUCK ALREADY CLEARED");return}
 truck.marked=true;
 $('caption').textContent=tr("КПП: МАШИНУ СКЕРОВАНО НА ОГЛЯД","CHECKPOINT: TRUCK FLAGGED");
});
function buyBarge(channel){
 const count=barges.filter(b=>b.channel===channel).length;
 const m=put('barge',channel?0:(count%2?11:-11),-.27,(2+Math.floor(count/(channel?1:2))*3)*(count%2?1:-1));
 if(units.some(u=>u.k==='cruiser'&&u.m.position.distanceTo(m.position)<4.1)){world.scene.remove(m);writeMessage(()=>tr("Спершу відведіть крейсер від місця затоплення.","Move the cruiser away before sinking the barge."));return}
 m.rotation.z=.13;m.rotation.y=channel?.15:.6;
 barges.push({m,channel});cash-=price(110);ui();
}
let roadTimer, inspectionCredit, arrivals, checks, caught;
// Road: every inspection stops the truck at the checkpoint; trucks behind it queue up.
// Queued vehicle-seconds drain the hidden national budget, and a crowd near an impact means more victims.
function jammed(){return vehicles.filter(v=>v.queued||v.hold>0).length}
function showTraffic(){
 $('traffic').textContent=tr("Перевірено ","Checked ")+checks+tr(" з "," of ")+arrivals+tr(" · затримано "," · detained ")+caught+tr(" · у заторі "," · queued ")+jammed();
}
function roadStep(dt){
 roadTimer-=dt;
 if(roadTimer<=0){
  const direction=Math.random()<.5?1:-1;
  if(vehicles.some(v=>v.direction===direction&&v.m.position.x*direction<-19.3))roadTimer=.4;
  else{
   const m=put('truck',-22*direction,3.22,direction*.8);
   m.rotation.y=direction===1?0:Math.PI;
   const manure=Math.random()<Math.min(.55,.25+wave*.012);
   vehicles.push({m,direction,manure,wobbles:Math.random()<(manure?.85:.16),marked:false,checked:false,hold:0,stopped:false,queued:false});
   roadTimer=Math.max(.9,1.8-wave*.04);
  }
 }
 const along=v=>v.m.position.x*v.direction;
 for(const v of [...vehicles].sort((a,b)=>along(b)-along(a))){
  const p=v.m.position,ahead=vehicles.find(o=>o!==v&&o.direction===v.direction&&along(o)>along(v)&&along(o)-along(v)<2.7);
  v.m.rotation.z=v.wobbles&&!v.checked?Math.sin(time*9)*.11:0;
  v.queued=!!ahead&&(ahead.hold>0||ahead.queued);
  if(v.hold>0)v.hold-=dt;
  else if(!v.queued)p.x+=v.direction*3.7*dt;
  if(v.hold>0||v.queued)jamLoss+=dt*1.6;
  if(!v.checked && along(v)>=-10){
   v.checked=true;arrivals++;inspectionCredit+=Number($('inspection').value);
   if(v.marked||inspectionCredit>=100){
    if(inspectionCredit>=100)inspectionCredit-=100;checks++;v.hold=3.4;v.stopped=v.manure;
    if(v.stopped)caught++;
   }
  }
 }
 for(let i=vehicles.length-1;i>=0;i--){
  const v=vehicles[i],a=along(v);
  const hit=v.manure&&!v.stopped&&a>=0;
  if(hit||a>25||(v.stopped&&v.hold<=0)){
   if(hit){const loss=armored(6);hp-=loss;waveDamage+=loss;hype+=loss;world.scene.remove(v.m);vehicles.splice(i,1);casualties(v.m.position);}
   else{world.scene.remove(v.m);vehicles.splice(i,1)}
   if(v.stopped)score++;
   ui();
  }
 }
 showTraffic();
}
function put(type,x,y,z){const m=model(type);m.position.set(x,y,z);m.traverse(o=>{if(o.isMesh)o.castShadow=true});world.scene.add(m);return m}
function reset(){fx.reset();for(const x of [...units,...enemies,...effects,...scouts,...vehicles,...barges])x.m.removeFromParent();units.length=enemies.length=effects.length=scouts.length=0;vehicles.length=barges.length=0;seaCosts=hits=signalPenalty=0;orders.gps.end=orders.net.end=0;selectedShip=null;setPlacement(false);world.setHits(0);$('signals').textContent='';roadTimer=inspectionCredit=arrivals=checks=caught=0;$('inspection').value='0';showTraffic();cash=1200;hp=100;wave=time=score=rp=hype=victims=waveVictims=jamLoss=0;reserve=reserve0=reserves[$('difficulty').value];unpaid=1;for(const k in techs)tech[k]=0;paused=false;untilSpawn=0;phase='buy';foam=0;waveDamage=0;
 for(let i=0;i<6;i++){const m=put('flamingo',-9+i*2,6+i%3*1.25,8+i%2*2);m.scale.setScalar(.84);scouts.push({m,y:m.position.y})}
 writeMessage(()=>tr("Що вища складність, то бідніша країна. Залишок у скарбниці засекречено.","Higher difficulty means a poorer country. The treasury balance is classified."));ui()}
function button(text,action,disabled){const b=document.createElement('button');b.className='unit';b.innerHTML=text;b.disabled=disabled;b.onclick=action;$('shop').append(b)}
function ui(){const buy=phase==='buy',live=phase==='live';$('phase').textContent=paused?tr("Ⅱ ПАУЗА","Ⅱ PAUSED"):buy?tr("● ЗАКУПІВЛЯ","● PROCUREMENT"):live?tr("● ХВИЛЯ ","● WAVE ")+wave:tr("■ АРКУ ЗАКРИТО","■ ARCH CLOSED");$('hits').textContent=hits+' / 3';$('cash').textContent=cash+tr(" млн ₽"," M RUB");$('rp').textContent=rp+' ⚙';$('hype').textContent=Math.round(hype)+(hype>60?tr(" · ЕФІР"," · ON AIR"):hype>20?tr(" · СЮЖЕТ"," · NEWS"):'');$('victims').textContent=victims;$('upkeep').textContent=phase==='over'?'—':'−'+upkeepBill()+tr(" млн ₽"," M RUB")+(unpaid<1?tr(" · борг"," · debt"):'');$('tech').replaceChildren();$('hp').textContent=hp+' %';$('bar').value=hp;$('shop').replaceChildren();$('difficulty').disabled=!buy;$('inspection').disabled=paused||phase==='over';
 for(const [k,[name,base]] of Object.entries(specs)){const cost=price(base),count=units.filter(u=>u.k===k).length;button(name+(count?' ×'+count:'')+'<span>'+cost+tr(" млн ₽</span>"," M RUB</span>"),()=>{if(k==='turret'){selectedShip=null;setPlacement(!placing);writeMessage(()=>placing?tr("Оберіть жовтий майданчик на будь-якому прольоті. Повторне натискання скасовує вибір.","Choose a yellow pad on either span. Press the turret button again to cancel."):tr("Розміщення скасовано.","Placement cancelled."))}else purchase(k)},paused||phase==='over'||cash<cost||(k==='turret'&&count===pads.length))}
 for(const channel of [false,true])button(tr("Баржа · ","Barge · ")+(channel?tr("фарватер","channel"):tr("біля краю","edge"))+' ×'+barges.filter(b=>b.channel===channel).length+'<span>'+price(110)+tr(" млн ₽</span>"," M RUB</span>"),()=>buyBarge(channel),paused||phase==='over'||cash<price(110)||barges.filter(b=>b.channel===channel).length>=4);
 if(live){
 for(const [key,o] of Object.entries(orders))button(tr("Вимкнути ","Disable ")+o.name+tr(" · 10 с<span>"," · 10 s<span>")+price(o.cost)+tr(" млн ₽</span>"," M RUB</span>"),()=>issueOrder(key),paused||o.end>time||cash<price(o.cost));
 const patch=repairCost();button(tr("Латати полотно +25%<span>","Patch deck +25%<span>")+patch+tr(" млн ₽</span>"," M RUB</span>"),()=>{cash-=patch;hp=Math.min(100,hp+25);ui()},paused||hp===100||cash<patch)}
 for(const [k,[name,effect]] of Object.entries(techs)){const c=techCost(tech[k]),b=document.createElement('button');b.className='unit';b.innerHTML=name+(tech[k]?tr(" · рів. "," · lvl ")+tech[k]:'')+'<small>'+effect+'</small><span>'+c+' ⚙</span>';b.disabled=paused||phase==='over'||rp<c;b.onclick=()=>researchTech(k);$('tech').append(b)}
 $('start').textContent=buy?tr("Почати облогу →","Start siege →"):live?(paused?tr("Продовжити ▸","Resume ▸"):tr("Пауза Ⅱ","Pause Ⅱ")):tr("Нова зміна ↻","New shift ↻");$('start').disabled=buy&&!units.length;$('pause').disabled=!live;$('pause').textContent=paused?'▸':'Ⅱ';$('caption').textContent=buy?tr("ОГЛЯД ОБ’ЄКТА","SITE OVERVIEW"):live?tr("ВІДБИТО: ","REPELLED: ")+score:tr("ЕФІР ЗАВЕРШЕНО","END OF BROADCAST")}
function purchase(k,pad){const cost=price(specs[k][1]);cash-=cost;const n=units.filter(u=>u.k===k).length;const side=n%2?1:-1;
 const marine=k==='dolphin'||k==='cruiser';const x=side*(2+Math.floor(n/2)*2.7)+(k==='turret'?1:0);const z=marine?(k==='cruiser'?-10:6)+side*(n%3):k==='sam'?-1.2:1.2;
 if(k==='cruiser'&&barges.some(b=>Math.hypot(x-b.m.position.x,z-b.m.position.z)<4.1)){cash+=cost;writeMessage(()=>tr("Місце спуску зайняте баржею.","A barge blocks the launch site."));return}
 const m=pad?put(k,pad.position.x,3.32,pad.position.z):k==='sam'?put(k,side*(20+Math.floor(n/2)%5),1.0,3.7+Math.floor(n/10)*1.4):put(k,x,marine?.24:3.2,z);m.scale.setScalar(k==='cruiser'?1.2:.78);units.push({k,m,pad,cd:0,hull:(k==='cruiser'?4:2)+tech.armor});ui()}
const grant=w=>Math.round(160*Math.pow(.85,w-1));
function nextWave(){
 if(wave===0){
  reserve=reserve0=reserves[$('difficulty').value];
  writeMessage(()=>tr("Перша виплата надійде після хвилі. Бухгалтер уже рахує тріщини.","First payment after the wave. Accounting is already counting cracks."));
 }else{
  // Planned funding fades; repair money is damage x hype. Then the economy erodes on its own.
  const pay=hp<100?0:Math.min(Math.floor(reserve),Math.round(grant(wave)+waveDamage*8*(1+hype/40)));
  reserve-=pay;
  cash+=pay;
  drain(reserve*.03+20+signalPenalty+jamLoss);
  const bill=upkeepBill(),paid=Math.min(cash,bill);
  cash-=paid;unpaid=bill?Math.max(.5,paid/bill):1;
  writeMessage(()=>tr("Хвиля ","Wave ")+wave+tr(" · пошкодження "," · damage ")+waveDamage+tr(" од. · втрати "," pts · casualties ")+waveVictims+tr(" · розголос "," · publicity ")+Math.round(hype)+tr(" · на ремонт і оборону "," · repair and defence grant ")+pay+tr(" млн ₽ · утримання −"," M RUB · upkeep −")+paid+tr(" млн ₽."," M RUB.")+(unpaid<1?tr(" Платню затримано. Темп стрільби гарнізону впав на "," Payroll shortfall. Garrison fire rate down ")+Math.round(100*(1-unpaid))+tr("%.","%."):'')+' '+headline());
  hype*=.55;
 }
 signalPenalty=seaCosts=jamLoss=waveVictims=0;arrivals=checks=caught=0;showTraffic();
 waveDamage=0;
 wave++;
 ui();
}
function toggle(){if(phase==='live'){paused=!paused;ui()}}
$('pause').onclick=toggle;$('start').onclick=()=>{if(phase==='over')reset();else if(phase==='buy'){for(const s of scouts)world.scene.remove(s.m);scouts.length=0;phase='live';nextWave()}else toggle()};$('plus').onclick=()=>world.zoom(.83);$('minus').onclick=()=>world.zoom(1.2);
function spawn(k){let a=Math.random()*Math.PI*2;const r=23+Math.random()*4;let x=Math.cos(a)*r,z=Math.sin(a)*r,y=.35;if(k==='neptune'){z=Math.max(11,Math.abs(z));x*=.48}
 if(k==='bird'||k==='flamingo'||k==='loaf')y=5+Math.random()*5;else if(Math.abs(z)<5)z=6;
 const m=put(k,x,y,z);if(k==='neptune')m.scale.setScalar(2.4);const stats={loaf:[3,2.2],baby:[3,1.6],flamingo:[4,2.7],bird:[2,3.8],neptune:[30,1.05]}[k];const candidates=gameTargets(k);
 const target=Math.random()<.65?candidates[Math.floor(Math.random()*candidates.length)]:null;
 enemies.push({m,k,y,target,oldPoint:null,exitPoint:new T.Vector3(x,0,z).normalize().multiplyScalar(32),hp:stats[0]+Math.floor(wave/3),speed:stats[1]*(1+wave*.026),angle:a});}
function gameTargets(kind){
 return units.filter(u=>(u.k==='cruiser'&&(kind==='baby'||kind==='bird'))||(u.k==='sam'&&kind==='bird'));
}
function destination(e,offline){
 if(offline){
  if(!e.oldPoint){
   e.oldPoint=e.target?.m.position.clone()??new T.Vector3();
   e.oldPoint.x+=(Math.random()-.5)*5;
   e.oldPoint.z+=(Math.random()-.5)*5;
  }
  return e.oldPoint;
 }
 e.oldPoint=null;
 if(e.target&&!units.includes(e.target)){
  const choices=gameTargets(e.k);
  e.target=choices[Math.floor(Math.random()*choices.length)]??null;
 }
 return e.target?.m.position;
}
const shotGeo=new T.SphereGeometry(.12,5,4),shotMat=new T.MeshBasicMaterial({color:0xffee8e});
function showSignals(){ $('signals').textContent=Object.values(orders).filter(o=>o.end>time).map(o=>o.name+tr(" вимк. · "," off · ")+Math.ceil(o.end-time)+tr(" с"," s")).join(' / ');
}
function step(dt){
 fx.tick(dt,enemies);
 const blocked=barges.filter(b=>b.channel).length;
 const before=time,elapsed=Math.floor(time);time+=dt;
 for(const o of Object.values(orders)){
  signalPenalty+=4*Math.max(0,Math.min(time,o.end)-before);
  if(before<o.end&&time>=o.end)ui();
 }
 showSignals();
 moveShips(dt);
 if(Math.floor(time)>elapsed){const loss=Math.min(reserve,blocked*4);reserve-=loss;seaCosts+=loss}
 if(time>=wave*17){nextWave();if(wave%4===0)spawn('neptune')}roadStep(dt);untilSpawn-=dt;if(untilSpawn<=0){const pool=['flamingo','flamingo','bird','baby','loaf'];spawn(pool[Math.floor(Math.random()*pool.length)]);untilSpawn=Math.max(.19,1.9/(1+.2*wave))}
 for(const u of units){u.cd-=dt;if(u.cd>0)continue;let target=null,closest=Infinity;for(const e of enemies){if(u.k==='dolphin'&&e.k!=='baby')continue;const d=Math.hypot(e.m.position.x,e.m.position.z);if(e.hp>0&&d<closest&&(u.k==='sam'?world.onScreen(e.m.position):u.m.position.distanceTo(e.m.position)<(u.k==='dolphin'?10:17)*(1+.12*tech.range))){closest=d;target=e}}
 if(target){const p=u.m.position,to=target.m.position;u.m.rotation.y=Math.atan2(p.z-to.z,to.x-p.x);const damage=specs[u.k][2]*(1+.3*tech.dmg);u.cd=specs[u.k][3]*Math.pow(.85,tech.rate)/unpaid;if(u.k==='sam'){fx.launch(u.m,target,damage);continue}target.hp-=damage;const m=new T.Mesh(shotGeo,shotMat);m.position.copy(p);m.position.y+=.9;world.scene.add(m);effects.push({m,to:to.clone(),life:.16})}}
 const offline=orders.net.end>time,retreat=orders.gps.end>time;
 const crashed=new Set();
 if(offline){
  for(let i=0;i<enemies.length;i++){
   const first=enemies[i];
   if(first.hp<=0||crashed.has(first))continue;
   for(let j=i+1;j<enemies.length;j++){
    const second=enemies[j];
    if(second.hp>0&&!crashed.has(second)&&first.m.position.distanceToSquared(second.m.position)<.85){
     crashed.add(first);crashed.add(second);break;
    }
   }
  }
 }
 for(let i=enemies.length-1;i>=0;i--){const e=enemies[i],p=e.m.position;
  if(e.k==='neptune'&&e.hp>0&&!crashed.has(e)&&!retreat&&p.z<=4.4){
   p.z=4.4;e.m.rotation.y=Math.PI/2;
   const before=e.swing??0;e.swing=(before+dt)%2.6;
   e.m.userData.trident.rotation.z=-1.08*Math.pow(Math.sin(Math.PI*e.swing/2.6),8);
   if(before<1.3&&e.swing>=1.3){
    const loss=armored(9);hp-=loss;waveDamage+=loss;hype+=loss;
    writeMessage(()=>tr("Нептун ударив тризубом по полотну: −","Neptune struck the deck: −")+loss+'%');ui();
   }
   continue;
  }
  if(e.k==='neptune'){e.swing=0;e.m.userData.trident.rotation.z=0}
  const aim=destination(e,offline),dest=retreat?e.exitPoint:aim;
  const dx=(dest?.x??0)-p.x,dz=(dest?.z??0)-p.z,d=Math.hypot(dx,dz);
  const actual=e.target?.m.position;
  const missed=offline&&((e.target&&!units.includes(e.target))||Math.hypot(p.x-(actual?.x??0),p.z-(actual?.z??0))>1.3);
  if(crashed.has(e)||(e.hp>0&&d<1.3&&(retreat||missed))){
   world.scene.remove(e.m);enemies.splice(i,1);
   $('caption').textContent=crashed.has(e)?tr("ЗІТКНЕННЯ","COLLISION"):retreat?tr("ЦІЛЬ ЗАЛИШИЛА ЗОНУ","TARGET LEFT THE AREA"):tr("ПРОМАХ","MISS");
   continue;
  }
  const intercepted=e.k==='baby'&&barges.some(b=>Math.abs(p.x-b.m.position.x)<2.3&&Math.abs(p.z-b.m.position.z)<1.25);
  if(e.hp<=0||intercepted||d<1.3){
   if(e.hp<=0||intercepted){score++;reward(e.k)}
   else if(e.target){
    const u=e.target;
    if(--u.hull===0){world.scene.remove(u.m);units.splice(units.indexOf(u),1)}
    writeMessage(()=>getSpecs()[u.k][0]+(u.hull?tr(" · міцність "," · hull ")+u.hull:tr(" вибув із ладу"," out of action")));
   }else if(e.k==='loaf'){
    fx.crumbs(p);
    for(const v of vehicles)v.hold=Math.max(v.hold,4);
    writeMessage(()=>tr("Паляниця розсипалася! Вантажівки стоять 4 секунди.","The loaf burst into crumbs! Trucks stop for 4 seconds."));
   }else if(e.k==='flamingo'){hits=Math.min(3,hits+1);world.setHits(hits);hype+=25;casualties(new T.Vector3())}
   else{const loss=armored(e.k==='neptune'?23:6);hp-=loss;waveDamage+=loss;hype+=loss;if(loss)casualties(e.m.position)}
   world.scene.remove(e.m);enemies.splice(i,1);ui();continue;
  }
  e.m.rotation.y=Math.atan2(-dz,dx);const travel=dt*e.speed;p.x+=dx/d*travel;p.z+=dz/d*travel;
  p.y=e.k==='loaf'&&!retreat?T.MathUtils.lerp(3.27,e.y,T.MathUtils.clamp((d-1.3)/7,0,1)):(dest&&e.k==='bird'?T.MathUtils.lerp(dest.y+.65,e.y,Math.min(1,d/7)):e.y)+Math.sin(time*3+e.angle)*.18;
  flap(e.m,time+e.angle)}
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.m.position.lerp(e.to,Math.min(1,dt/e.life));e.life-=dt;if(e.life<=0){world.scene.remove(e.m);effects.splice(i,1)}}
 if(hits===3){world.carryDown([...vehicles,...units.filter(u=>u.k==='turret'&&Math.abs(u.m.position.z)<3)].map(v=>v.m));phase='over';selectedShip=null;setPlacement(false);writeMessage(()=>tr("Третій фламінго обвалив арку. Хвиль протрималися: ","A third flamingo brought down the arch. Waves reached: ")+wave+tr(". Відбито цілей: ",". Targets repelled: ")+score+'.');ui()}}
function flap(m,t){for(const wing of m.userData.wings||[])wing.rotation.x=wing.scale.z*Math.sin(t*6)*.32}
function frame(now){const dt=Math.min((now-last)/1000,.08);last=now;if(phase==='live'&&!paused)step(dt);if(phase==='buy'){moveShips(dt);foam+=dt;scouts.forEach(({m,y},i)=>{m.position.y=y+Math.sin(foam+i)*.25;flap(m,foam+i)})}
 $('clock').textContent=[Math.floor(time/60),Math.floor(time%60)].map(n=>String(n).padStart(2,'0')).join(':');world.draw();requestAnimationFrame(frame)}
document.addEventListener('siege-language',()=>{
 specs=getSpecs();techs=getTechs();ui();showTraffic();showSignals();
});
reset();requestAnimationFrame(frame);
