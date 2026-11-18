import {LANDFALL} from './terrain.js';
import {railTraffic} from './rail-traffic.js';
import {tankerTraffic} from './tanker-traffic.js';
import roosterUrl from './rooster.svg';
import {ditching} from './ditching.js';
import {roadArt} from './road-art.js';
import {sceneMarkers} from './scene-markers.js';
import {arenaRadar} from './radar.js';
import {tr,writeMessage} from './language.js';
import {fireworks} from './effects.js';
import * as T from 'three';
import {model,randomCarType} from './models.js';
import {landscape} from './scene.js';
const $=id=>document.getElementById(id),world=landscape($('view'));
const drawRadar=arenaRadar($('arena-radar'));
const tankers=tankerTraffic(world.scene);
const moveTrain=railTraffic(world,LANDFALL);
const road=roadArt(world.scene);
const fx=fireworks(world.scene);
const getSpecs=()=>({sam:[tr("С-400 «Хлопавка»","S-400 Party Popper"),320,6,1.15],turret:[tr("Кулеметна турель","Machine-gun turret"),160,1,.45],cruiser:[tr("Ракетний крейсер","Missile cruiser"),420,8,1.25],dolphin:[tr("Бойовий дельфін","Combat dolphin"),120,2,.9],pantsir:[tr("Панцир-міні","Mini Pantsir"),200,2,.8]});
let specs=getSpecs();
const units=[],enemies=[],effects=[],scouts=[];
let spent=0,partialLedger=0;
function spend(amount){cash-=amount;spent+=amount}
let cash,hp,time,wave,phase,paused,untilSpawn,score,foam,rp,unpaid,last=performance.now();
// Hidden national budget: player never sees it. All payouts come from it; time, blockade, jams, blackouts and victims drain it.
let reserve0,hype=0,victims=0,waveVictims=0,jamLoss=0;
const drain=x=>{reserve=Math.max(0,reserve-x)};
function casualties(at){
 let n=Math.floor(Math.random()*3);
 for(const v of vehicles)if(v.m.position.distanceTo(at)<25)n+=(v.m.position.distanceTo(at)<7?2:.25)*(.5+Math.random());
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
const techCost=L=>Math.round(10*Math.pow(2,L));
const upkeep={pantsir:6,sam:10,turret:4,cruiser:14,dolphin:4};
// Arcade magazine sizes and prices, in millions of rubles.
const magazine={sam:10,cruiser:9,pantsir:12};
const bombTruckChance=.003;
function supplyQuote(){
 const launchers=units.filter(u=>magazine[u.k]);
 const capacity=launchers.reduce((sum,u)=>sum+magazine[u.k],0);
 const stock=launchers.reduce((sum,u)=>sum+u.ammo,0);
 const each=Math.max(1,price(MISSILE));
 const amount=Math.min(8,capacity-stock,Math.floor(cash/each));
 return {launchers,capacity,stock,each,amount};
}
function supplyHud(){
 const {capacity,stock,each,amount}=supplyQuote();
 $('ammo-panel').hidden=!capacity;
 $('ammo-count').textContent=stock+' / '+capacity;
 $('ammo-panel').classList.toggle('low-ammo',capacity>0&&stock<=capacity*.25);
 $('resupply').textContent=amount?tr('Поповнити +','Restock +')+amount+' · '+amount*each+tr(' млн ₽',' M RUB'):
  stock===capacity?tr('Повний запас','Fully stocked'):tr('Бракує коштів · ','Insufficient funds · ')+each+tr(' млн ₽ / ракета',' M RUB / missile');
 $('resupply').disabled=!amount||paused||phase==='over';
}
$('resupply').onclick=()=>{
 const {launchers,amount,each}=supplyQuote();
 if(!amount||paused||phase==='over')return;
 for(let i=0;i<amount;i++){
  const least=launchers.reduce((a,b)=>a.ammo/magazine[a.k]<=b.ammo/magazine[b.k]?a:b);
  least.ammo++;
 }
 spend(amount*each);ui();
};
const rewards={drone:[1,6],loaf:[2,7],baby:[1,7],flamingo:[1,9],bird:[1,6],neptune:[8,80]};
const infl=()=>Math.pow(1.03,Math.max(0,wave-1))*(1+.3*(1-reserve/reserve0))*Math.pow(.93,tech.logi);
const MISSILE=6,PATCH=70;
const bountyMul={easy:1.2,normal:1,hard:.85};
const price=base=>base>0?Math.max(1,Math.round(base*infl())):0;
const armored=x=>Math.min(hp,Math.round(x*Math.pow(.88,tech.armor)));
function reward(k){const [points,base]=rewards[k];rp+=points;const b=Math.min(Math.floor(reserve),Math.round(base*bountyMul[$('difficulty').value]));cash+=b;drain(b)}
function upkeepBill(){return Math.round((units.reduce((s,u)=>s+upkeep[u.k],0)*Math.pow(.8,tech.logi)+barges.length*4)*infl())}
function repairCost(){return price(PATCH*Math.min(25,100-hp)/25)}
function researchTech(k){
 rp-=techCost(tech[k]);tech[k]++;
 if(k==='armor')for(const u of units)u.hull++;
 writeMessage(()=>getTechs()[k][0]+tr(" · рів. "," · lvl ")+tech[k]+': '+getTechs()[k][1]+'.');ui();
}
const reserves = {easy: 7000, normal: 4500, hard: 2600};
let reserve, waveDamage;
const BREAK_SECONDS=8;
let waveElapsed=0,breakLeft=0,die=1;
let autoplay=false,botDelay=0;
const intensity=()=>wave%9===0?1.9+die*.09:.65+die*.115;
function waveHud(){
 $('watch-game').textContent=autoplay?tr('До моєї гри','Return to my game'):tr('Автогра ▸','Watch autoplay ▸');
 $('new-game').disabled=!!autoplay;
 $('wave-roll').textContent=wave?('⚄ '+die+'/6 · '+(wave%9===0?tr('ШТОРМ','STORM'):tr('Натиск','Pressure'))+' ×'+intensity().toFixed(2)):'';
 $('wave-roll').hidden=!wave;
}
function watchGame(){
 if(autoplay){location.reload();return}
 saveMatch();autoplay=true;reset();
 cash=5000;
 for(const k of Object.keys(techs))tech[k]=3;
 for(const k of ['sam','cruiser','pantsir','dolphin'])purchase(k);
 purchase('turret',pads[Math.floor(Math.random()*pads.length)]);
 $('inspection').value='25';$('start').click();ui();
}
$('watch-game').onclick=watchGame;
function botTurn(dt){
 botDelay-=dt;if(botDelay>0)return;botDelay=.75;
 const supply=supplyQuote(),urgent=supply.capacity&&supply.stock<=supply.capacity*.35;
 if(urgent&&supply.amount){$('resupply').click();return}
 if(hp<100&&breakLeft&&cash>=repairCost()){repairDeck();return}
 if(breakLeft&&supply.amount&&supply.stock<supply.capacity*.8){$('resupply').click();return}
 const affordable=Object.keys(techs).filter(k=>techCost(tech[k])<=rp);
 if(affordable.length){researchTech(affordable[Math.floor(Math.random()*affordable.length)]);return}
 if(cash>price(320)+price(12)*20&&units.length<9){
  const pad=pads.find(p=>!units.some(u=>u.pad===p));
  const k=Math.random()<.55?'sam':'turret';purchase(k,k==='turret'?pad:null);
 }
}
function showBreak(){
 const banner=$('break-banner');
 banner.hidden=breakLeft<=0||paused;
 const text=breakLeft>0?tr('Перерва · Хвиля ','Intermission · Wave ')+(wave+1)+tr(' через ',' in ')+Math.ceil(breakLeft)+tr(' с',' s'):'';
 if(banner.textContent!==text)banner.textContent=text;
}

const vehicles = [], barges=[];
let seaCosts=0, hits=0,selectedShip=null,placing=false,signalPenalty=0;
const orders={gps:{name:'GPS',cost:75,end:0},net:{get name(){return tr("Інтернет","Internet")},cost:100,end:0},smoke:{get name(){return tr("Димова завіса","Smoke screen")},cost:60,end:0}};
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
 const o=orders[key];spend(price(o.cost));o.end=time+10;showSignals();ui();
}
const ring=new T.Mesh(new T.RingGeometry(2.9,3.04,48),new T.MeshBasicMaterial({color:0xffb947,side:T.DoubleSide}));
ring.rotation.x=-Math.PI/2;ring.visible=false;world.scene.add(ring);
function helm(){
 const ships=units.filter(u=>u.k==='cruiser');
 if(!ships.includes(selectedShip))selectedShip=null;
 const menu=$('ship-list'),previous=menu.selectedIndex;
 menu.replaceChildren(...ships.map((u,i)=>new Option(tr('Крейсер ','Cruiser ')+(i+1),i)));
 menu.selectedIndex=selectedShip?ships.indexOf(selectedShip):Math.min(Math.max(0,previous),ships.length-1);
 menu.hidden=ships.length<2;menu.setAttribute('aria-label',tr('Оберіть крейсер','Select cruiser'));
 $('course').parentElement.hidden=!ships.length||phase==='over';
 $('course').disabled=paused;$('course').textContent=selectedShip?tr('Скасувати курс','Cancel selection'):tr('Перемістити крейсер','Move cruiser');
 $('course-hint').textContent=selectedShip?tr('Натисніть на вільну воду','Click open water'):'';
 canvas.style.cursor=selectedShip?'crosshair':'';
 ring.visible=!!selectedShip;
 if(selectedShip)ring.position.copy(selectedShip.m.position);
}
$('course').onclick=()=>{
 const ships=units.filter(u=>u.k==='cruiser');selectedShip=selectedShip?null:ships[$('ship-list').selectedIndex];
 setPlacement(false);helm();
};
$('ship-list').onchange=()=>{selectedShip=units.filter(u=>u.k==='cruiser')[$('ship-list').selectedIndex];setPlacement(false);helm()};
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
 if(picked){selectedShip=ships.find(u=>u.m===picked);helm();writeMessage(()=>tr("Оберіть точку на воді. Обходьте баржі проміжними точками.","Choose open water. Use intermediate stops to steer around barges."));return}
 if(selectedShip&&units.includes(selectedShip)){
  const point=world.waterPoint(e);
  if(!clearCourse(selectedShip.m.position,point)){$('course-hint').textContent=tr('Шлях перекрито — оберіть іншу точку','Route blocked — choose another point');writeMessage(()=>tr("Шлях перекрито. Оберіть вільну воду.","Route blocked. Choose open water."));return}
  point.y=selectedShip.m.position.y;selectedShip.destination=point;selectedShip=null;helm();$('course-hint').textContent=tr('Курс прийнято','Course set');
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
 barges.push({m,channel});fx.splash(m.position,1.3);fx.spill(m.position,1.1,45);spend(price(110));ui();
}
let trafficTime=0;
let roadTimer, inspectionCredit, arrivals, checks, caught;
// Road: every inspection stops the truck at the checkpoint; trucks behind it queue up.
// Queued vehicle-seconds drain the hidden national budget, and a crowd near an impact means more victims.
function jammed(){return vehicles.filter(v=>v.queued||v.hold>0).length}
function showTraffic(){
 $('traffic').textContent=tr("Перевірено ","Checked ")+checks+tr(" з "," of ")+arrivals+tr(" · затримано "," · detained ")+caught+tr(" · у заторі "," · queued ")+jammed();
}
function addTruck(direction,x){
 const checked=x*direction>=-10;
 const manure=!checked&&Math.random()<bombTruckChance;
 const m=put(manure||Math.random()<.42?'truck':randomCarType(),x,world.deckTop(x)+.06,direction*.8);
 m.rotation.y=direction===1?0:Math.PI;
 vehicles.push({m,direction,manure,wobbles:Math.random()<(manure?.85:.16),marked:false,checked,hold:0,stopped:false,queued:false});
}
function roadStep(dt){
 roadTimer-=dt;
 if(roadTimer<=0){
  const direction=Math.random()<.5?1:-1;
  if(vehicles.some(v=>v.direction===direction&&v.m.position.x*direction<-LANDFALL+2.7))roadTimer=.4;
  else{addTruck(direction,-LANDFALL*direction);roadTimer=Math.max(.9,1.8-wave*.04)}
 }
 const leaders=new Map();
 const along=v=>v.m.position.x*v.direction;
 for(const v of [...vehicles].sort((a,b)=>along(b)-along(a))){
  const p=v.m.position,ahead=leaders.get(v.direction);
  leaders.set(v.direction,v);
  v.m.rotation.z=v.wobbles&&!v.checked?Math.sin(time*9)*.11:0;
  const step=3.7*dt;
  const travel=ahead?Math.min(step,Math.max(0,along(ahead)-along(v)-2.75)):step;
  v.queued=v.hold<=0&&travel<step-.00001;
  if(v.hold>0)v.hold=Math.max(0,v.hold-dt);
  else p.x+=v.direction*travel;
  p.y=world.deckTop(p.x)+.06;
  if(v.hold>0||v.queued)jamLoss+=dt*1.6;
  if(v.manure&&!v.stopped&&v.checked&&!v.filmed&&along(v)>=-3.4){v.filmed=true;world.cinematic(v.m.position.clone(),2,{bomb:true,follow:v.m,lift:.7,radius:5.2,height:1.4})}
  if(!v.checked && along(v)>=-10){
   v.checked=true;arrivals++;inspectionCredit+=Number($('inspection').value);
   if(v.marked||inspectionCredit>=100){
    if(inspectionCredit>=100)inspectionCredit-=100;checks++;v.hold=8;v.stopped=v.manure;
    if(v.stopped)caught++;
   }
  }
 }
 for(let i=vehicles.length-1;i>=0;i--){
  const v=vehicles[i],a=along(v);
  const hit=v.manure&&!v.stopped&&a>=0;
  if(hit||a>LANDFALL||(v.stopped&&v.hold<=0)){
   if(hit){const blast=v.m.position.clone().setY(v.m.position.y+.7);world.cinematicBoom(blast);fx.explosion(blast,2.2);fx.wreck(blast,v.direction);const loss=damageDeck(6,v.m.position);world.scene.remove(v.m);vehicles.splice(i,1);casualties(v.m.position);}
   else{world.scene.remove(v.m);vehicles.splice(i,1)}
   if(v.stopped)score++;
   ui();
  }
 }
 showTraffic();
}
function put(type,x,y,z){const m=model(type);m.position.set(x,y,z);m.traverse(o=>{if(o.isMesh)o.castShadow=true});world.scene.add(m);return m}
function reset(){spent=0;partialLedger=0;guestWave=guestUntil=0;incoming=null;guest.hidden=true;road.reset();clearFlyby();damageSpots.length=0;breakLeft=waveElapsed=0;fx.clear();for(const x of [...units,...enemies,...effects,...scouts,...vehicles,...barges])x.m.removeFromParent();units.length=enemies.length=effects.length=scouts.length=0;vehicles.length=barges.length=0;seaCosts=hits=signalPenalty=0;trafficTime=0;tankers.restore();tankers.move(0);orders.smoke.end=orders.gps.end=orders.net.end=0;selectedShip=null;setPlacement(false);world.setHits(0);$('signals').textContent='';roadTimer=inspectionCredit=arrivals=checks=caught=0;$('inspection').value='0';showTraffic();cash=1200;hp=100;wave=time=score=rp=hype=victims=waveVictims=jamLoss=0;reserve=reserve0=reserves[$('difficulty').value];unpaid=1;for(const k in techs)tech[k]=0;paused=false;untilSpawn=0;phase='buy';foam=0;waveDamage=0;
 for(let i=0;i<6;i++){const m=put('flamingo',-9+i*2,6+i%3*1.25,8+i%2*2);m.scale.setScalar(.84);scouts.push({m,y:m.position.y})}
 writeMessage(()=>tr("Що вища складність, то бідніша країна. Залишок у скарбниці засекречено.","Higher difficulty means a poorer country. The treasury balance is classified."));ui()}
function button(text,action,disabled){const b=document.createElement('button');b.className='unit';b.innerHTML=text;b.disabled=disabled;b.onclick=action;$('shop').append(b)}
function ui(){
 const resume=$('resume-game');
 resume.hidden=phase!=='live'||!paused;
 resume.textContent=tr('▶ Продовжити гру','▶ Resume game');
 $('pause').setAttribute('aria-label',paused?resume.textContent:tr('Пауза','Pause'));
 waveHud();arcadeHud();supplyHud();showBreak();helm();$('phase').dataset.wave=wave;const buy=phase==='buy',live=phase==='live';$('phase').textContent=paused?tr("Ⅱ ПАУЗА · ХВИЛЯ ","Ⅱ PAUSED · WAVE ")+wave:buy?tr("● ЗАКУПІВЛЯ","● PROCUREMENT"):live&&breakLeft>0?tr('◷ ПЕРЕРВА','◷ INTERMISSION'):live?tr("● ХВИЛЯ ","● WAVE ")+wave:tr("■ АРКУ ЗАКРИТО","■ ARCH CLOSED");$('hits').textContent=hits+' / 3';$('cash').textContent=cash+tr(" млн ₽"," M RUB");$('rp').textContent=rp+' ⚙';$('hype').textContent=Math.round(hype)+(hype>60?tr(" · ЕФІР"," · ON AIR"):hype>20?tr(" · СЮЖЕТ"," · NEWS"):'');$('victims').textContent=victims;$('upkeep').textContent=phase==='over'?'—':'−'+upkeepBill()+tr(" млн ₽"," M RUB")+(unpaid<1?tr(" · борг"," · debt"):'');$('tech').replaceChildren();$('hp').textContent=hp+' %';$('bar').value=hp;$('shop').replaceChildren();$('difficulty').disabled=!buy;$('inspection').disabled=paused||phase==='over';
 for(const [k,[name,base]] of Object.entries(specs)){const cost=price(base),count=units.filter(u=>u.k===k).length;const detail=k==='sam'?tr('Важкий · весь екран','Heavy · screen-wide'):k==='pantsir'?tr('Компактний · швидкий вогонь зблизька','Compact · rapid short-range fire'):'';button(name+(count?' ×'+count:'')+(detail?'<small>'+detail+'</small>':'')+'<span>'+cost+tr(" млн ₽</span>"," M RUB</span>"),()=>{if(k==='turret'){selectedShip=null;helm();setPlacement(!placing);writeMessage(()=>placing?tr("Оберіть жовтий майданчик на будь-якому прольоті. Повторне натискання скасовує вибір.","Choose a yellow pad on either span. Press the turret button again to cancel."):tr("Розміщення скасовано.","Placement cancelled."))}else purchase(k)},paused||phase==='over'||cash<cost||(k==='turret'&&count===pads.length))}
 for(const channel of [false,true])button(tr("Баржа · ","Barge · ")+(channel?tr("фарватер","channel"):tr("біля краю","edge"))+' ×'+barges.filter(b=>b.channel===channel).length+'<span>'+price(110)+tr(" млн ₽</span>"," M RUB</span>"),()=>buyBarge(channel),paused||phase==='over'||cash<price(110)||barges.filter(b=>b.channel===channel).length>=4);
 if(live){
 for(const [key,o] of Object.entries(orders))button((key==="smoke"?"":tr("Вимкнути ","Disable "))+o.name+tr(" · 10 с<span>"," · 10 s<span>")+price(o.cost)+tr(" млн ₽</span>"," M RUB</span>"),()=>issueOrder(key),paused||o.end>time||cash<price(o.cost));
 const patch=repairCost();button(tr("Латати полотно +25%<span>","Patch deck +25%<span>")+patch+tr(" млн ₽</span>"," M RUB</span>"),repairDeck,paused||hp===100||cash<patch)}
 for(const [k,[name,effect]] of Object.entries(techs)){const c=techCost(tech[k]),b=document.createElement('button');b.className='unit';b.innerHTML=name+(tech[k]?tr(" · рів. "," · lvl ")+tech[k]:'')+'<small>'+effect+'</small><span>'+c+' ⚙</span>';b.disabled=paused||phase==='over'||rp<c;b.onclick=()=>researchTech(k);$('tech').append(b)}
 $('start').textContent=buy?tr("Почати облогу →","Start siege →"):live?(paused?tr("Продовжити ▸","Resume ▸"):tr("Пауза Ⅱ","Pause Ⅱ")):tr("Нова зміна ↻","New shift ↻");$('start').disabled=buy&&!units.length;$('pause').disabled=!live;$('pause').textContent=paused?'▸':'Ⅱ';$('caption').textContent=buy?tr("ОГЛЯД ОБ’ЄКТА","SITE OVERVIEW"):live?tr("ВІДБИТО: ","REPELLED: ")+score:tr("ЕФІР ЗАВЕРШЕНО","END OF BROADCAST")}
const damageSpots=[];
const drawMarkers=sceneMarkers($('view'),world.screenPoint);
{const v=$('view'),b=document.createElement('div'),tag=document.createElement('div'),hint=document.createElement('div');b.className='cine-bottom';tag.className='cine-tag';hint.className='cine-hint';v.append(b,tag,hint);
 const label=()=>{tag.textContent=tr('ПОВТОР · ×0.15','REPLAY · ×0.15');hint.textContent=tr('клік — пропустити','click to skip')};label();document.addEventListener('siege-language',label)}
function damageDeck(amount,position){
 const loss=armored(amount);
 if(!loss)return 0;
 const point=new T.Vector3(position.x,3.23,T.MathUtils.clamp(position.z,-2,2));
 let spot=damageSpots.find(s=>s.point.distanceTo(point)<2.2);
 if(!spot){spot={point,loss:0};damageSpots.push(spot)}
 fx.explosion(new T.Vector3(position.x,Math.max(3.5,Math.min(position.y,5)),point.z),Math.min(2,.55+loss/8));fx.dust(point,Math.min(1.8,.6+loss/10));
 road.impact(spot,time);spot.loss+=loss;hp-=loss;waveDamage+=loss;hype+=loss;return loss;
}
function patchDeck(spot){
 if(phase!=='live'||paused||hp>=100||(spot&&!damageSpots.includes(spot)))return;
 const amount=Math.min(25,spot?.loss??100-hp),cost=price(PATCH*amount/25);
 if(cash<cost)return;
 let left=amount;
 for(const site of spot?[spot]:[...damageSpots]){
  const fill=Math.min(left,site.loss);site.loss-=fill;left-=fill;
  if(fill)road.repair(site,time);
  if(!site.loss)damageSpots.splice(damageSpots.indexOf(site),1);
  if(!left)break;
 }
 spend(cost);hp+=amount;ui();
}
function repairDeck(){patchDeck(null)}
function localAmmo(u){
 const each=Math.max(1,price(MISSILE)),missing=magazine[u.k]-u.ammo;
 const amount=Math.min(8,missing,Math.floor(cash/each));
 return {amount,cost:(amount||1)*each};
}
function refillUnit(u){
 if(!units.includes(u)||phase!=='live'||paused)return;
 const {amount,cost}=localAmmo(u);
 if(!amount)return;
 u.ammo+=amount;spend(cost);ui();
}
function updateMarkers(){
 const items=[];
 if(phase==='live'){
  const currency=tr(' млн ₽',' M RUB');
  for(const spot of damageSpots){
   const amount=Math.min(25,spot.loss),cost=price(PATCH*amount/25);
   items.push({key:spot,kind:'deck',point:spot.point,label:tr('Латати +','Patch +')+amount+'%',short:'−'+amount+'%',detail:cost+currency,disabled:paused||cash<cost,action:()=>patchDeck(spot)});
  }
  for(const u of units){
   const capacity=magazine[u.k];if(!capacity||u.ammo>Math.ceil(capacity*.3))continue;
   const {amount,cost}=localAmmo(u);
   const label=specs[u.k][0]+' · '+u.ammo+'/'+capacity;
   const detail=(amount?tr('Поповнити +','Restock +')+amount:tr('Бракує коштів','Low funds'))+' · '+cost+currency;
   items.push({key:u,kind:'ammo',point:u.m.position,label,short:u.ammo+'/'+capacity,urgent:!u.ammo,detail,disabled:paused||!amount,action:()=>refillUnit(u)});
  }
 }
 drawMarkers(items);
}
function arcadeHud(){
 const {capacity,stock,each,amount}=supplyQuote();
 const money=n=>n+tr(' млн ₽',' M RUB');
 const life=3-hits,poor=reserve<=reserve0*.25;
 $('arch-life').textContent=tr('Арка ','Arch ')+('◆'.repeat(life))+('◇'.repeat(hits))+' '+life+'/3';
 $('arcade').dataset.danger=hits>=2||poor?'high':hits?'medium':'low';
 $('arcade-cash').textContent=money(cash);
 $('reserve-trend').textContent=!reserve?tr('Казна порожня','Treasury empty'):poor?tr('Казна майже порожня','Treasury running dry'):tr('Базова виплата ','Base grant ')+money(grant(Math.max(1,wave)));
 const act=$('order-act'),msg=$('order-copy');
 function order(text,label,action){
  if(msg.textContent!==text)msg.textContent=text;
  act.hidden=!action;act.textContent=label??'';act.onclick=action??null;
 }
 if(phase==='over'){
  const cost=(partialLedger?tr('щонайменше ','at least '):'')+money(spent);
  const verdict=tr('Вітаю! Ви вгатили '+cost+' з бюджету. Відбито цілей — '+score+'. А міст усе одно булькнув.','Congratulations! You blew '+cost+' of the budget. Targets repelled: '+score+'. The bridge went splash anyway.');
  return order(verdict,autoplay?undefined:tr('Нова гра','New game'),autoplay?undefined:confirmNewGame);
 }
 if(autoplay)return order(tr('Автогра','Autoplay'));
 if(paused)return order(tr('Партія на паузі.','Game paused.'),tr('Продовжити ▸','Resume ▸'),toggle);
 if(phase==='buy'){
  const kit=price(specs.sam[1])+price(specs.cruiser[1]);
  if(!units.length&&!barges.length&&cash>=kit)return order(tr('Зберіть стартову оборону: С-400 і крейсер.','Deploy a starter defence: S-400 and cruiser.'),tr('Розгорнути · ','Deploy · ')+money(kit),()=>{purchase('sam');purchase('cruiser')});
  if(!units.length)return order(tr('Для початку купіть гарнізон в арсеналі.','Buy a defender in the arsenal to start.'),tr('Арсенал','Arsenal'),()=>{if($('arsenal-panel').hidden)document.querySelector('.panel-toggles [aria-controls="arsenal-panel"]').click()});
  return order(tr('Гарнізон готовий. Третій прорив обвалить арку.','Garrison ready. The third flamingo hit brings down the arch.'),tr('Почати облогу →','Start siege →'),()=>$('start').click());
 }
 const low=capacity&&stock<=Math.ceil(capacity*.3);
 const canPatch=hp<100&&cash>=repairCost();
 if(canPatch&&(!low||breakLeft>0||!amount)){
  return order(tr('Полотно ','Deck ')+hp+tr('%. Відновіть до 100% для повної виплати.','%. Restore to 100% for the full grant.'),tr('Латати · ','Repair · ')+money(repairCost()),repairDeck);
 }
 if(low&&amount)return order(tr('Ракет залишилось: ','Missiles remaining: ')+stock+'/'+capacity,tr('Поповнити +','Restock +')+amount+' · '+money(each*amount),()=>$('resupply').click());
 if(low&&!amount)return order(tr('Ракет залишилось: ','Missiles remaining: ')+stock+'/'+capacity+tr('. На наступну потрібно ','. Next missile costs ')+money(each));
 if(hp<100)return order(tr('Полотно ','Deck ')+hp+tr('%. Для ремонту потрібно ','%. Repair costs ')+money(repairCost()));
 if(breakLeft>0&&capacity&&stock<capacity&&amount)return order(tr('Перерва. Поповніть запас перед хвилею.','Intermission. Top up before the next wave.'),tr('Поповнити +','Restock +')+amount+' · '+money(each*amount),()=>$('resupply').click());
 if(hits===2)return order(tr('Останній шанс: ще один фламінго обвалить арку.','Last chance: one more flamingo hit will bring down the arch.'));
 return order(tr('Гарнізон веде вогонь самостійно. Хвиля ','Garrison firing automatically. Wave ')+wave+(capacity?tr(' · ракети ',' · missiles ')+stock+'/'+capacity:''));
}
function purchase(k,pad){const cost=price(specs[k][1]);const n=units.filter(u=>u.k===k).length;const side=n%2?1:-1;
 const marine=k==='dolphin'||k==='cruiser';const x=side*(2+Math.floor(n/2)*2.7)+(k==='turret'?1:0);const z=marine?(k==='cruiser'?-10:6)+side*(n%3):k==='sam'?-1.2:1.2;
 if(k==='cruiser'&&barges.some(b=>Math.hypot(x-b.m.position.x,z-b.m.position.z)<4.1)){writeMessage(()=>tr("Місце спуску зайняте баржею.","A barge blocks the launch site."));return}
 spend(cost);
 const m=pad?put(k,pad.position.x,3.32,pad.position.z):(k==='sam'||k==='pantsir')?put(k,side*(20+Math.floor(n/2)%5),1.0,(k==='pantsir'?-4.2:3.7)+Math.floor(n/10)*1.4):put(k,x,marine?.24:3.2,z);m.scale.setScalar(k==='cruiser'?1.2:.78);units.push({k,m,pad,ammo:magazine[k],cd:0,hull:(k==='cruiser'?4:2)+tech.armor});ui()}
const grant=w=>Math.max(24,Math.round(150*Math.pow(.95,Math.max(0,w-1))));
function nextWave(){
 if(wave===0){
  for(const dir of [-1,1])for(let x=-LANDFALL+5;x<LANDFALL;x+=14)addTruck(dir,dir*(x+Math.random()*4));
  reserve=reserve0=reserves[$('difficulty').value];
  writeMessage(()=>tr("Перша виплата надійде після хвилі. Бухгалтер уже рахує тріщини.","First payment after the wave. Accounting is already counting cracks."));
 }else{
  // Planned funding fades; repair money is damage x hype. Then the economy erodes on its own.
  const pay=Math.min(Math.floor(reserve),Math.round(hp<100?grant(wave)*.5:grant(wave)+waveDamage*8*(1+hype/40)));
  reserve-=pay;
  cash+=pay;
  drain(reserve*.02+20+signalPenalty+jamLoss);
  const bill=upkeepBill(),paid=Math.min(cash,bill);
  const regen=reserve>0&&paid===bill&&wave%3===0&&hits>0&&hits<3;if(regen){hits--;world.setHits(hits)}
  spend(paid);unpaid=bill?paid/bill:1;
  writeMessage(()=>tr("Хвиля ","Wave ")+wave+tr(" · пошкодження "," · damage ")+waveDamage+tr(" од. · втрати "," pts · casualties ")+waveVictims+tr(" · розголос "," · publicity ")+Math.round(hype)+tr(" · на ремонт і оборону "," · repair and defence grant ")+pay+tr(" млн ₽ · утримання −"," M RUB · upkeep −")+paid+tr(" млн ₽."," M RUB.")+(unpaid<1?tr(" Платню затримано. Темп стрільби гарнізону впав на "," Payroll shortfall. Garrison fire rate down ")+Math.round(100*(1-unpaid))+tr("%.","%."):'')+(regen?tr(" Інженери підсилили арку: +1 життя."," Engineers reinforced the arch: +1 life."):'')+' '+headline());
  hype*=.55;
 }
 signalPenalty=seaCosts=jamLoss=waveVictims=0;arrivals=checks=caught=0;showTraffic();
 waveDamage=0;
 wave++;die=1+Math.floor(Math.random()*6);waveElapsed=0;untilSpawn=0;
 ui();
}
function toggle(){if(phase==='live'){paused=!paused;ui()}}
$('resume-game').onclick=toggle;
$('pause').onclick=toggle;$('start').onclick=()=>{if(phase==='over')confirmNewGame();else if(phase==='buy'){for(const s of scouts)world.scene.remove(s.m);scouts.length=0;phase='live';nextWave()}else toggle()};$('plus').onclick=()=>world.zoom(.83);$('minus').onclick=()=>world.zoom(1.2);
function spawn(k){let a=Math.random()*Math.PI*2;const r=23+Math.random()*4;let x=Math.cos(a)*r,z=Math.sin(a)*r,y=.35;if(k==='neptune'){z=Math.max(11,Math.abs(z));x*=.48}
 if(k==='drone'||k==='bird'||k==='flamingo'||k==='loaf')y=5+Math.random()*5;else if(Math.abs(z)<5)z=6;
 const m=put(k,x,y,z);if(k==='neptune')m.scale.setScalar(2.6);const stats={drone:[3,2.7],loaf:[3,2.2],baby:[3,1.6],flamingo:[4,2.7],bird:[2,3.8],neptune:[30,1.05]}[k];const candidates=gameTargets(k);
 const target=Math.random()<(k==='baby'?.82:.65)?candidates[Math.floor(Math.random()*candidates.length)]:null;
 const ships=units.filter(u=>u.k==='cruiser'),prey=k==='neptune'&&ships.length&&Math.random()<.6?ships[Math.floor(Math.random()*ships.length)]:null;
 enemies.push({m,k,y,target,prey,oldPoint:null,exitPoint:new T.Vector3(x,0,z).normalize().multiplyScalar(32),hp:Math.max(1,Math.round((stats[0]+Math.floor((wave-1)/4))*(.75+.25*intensity()))),speed:stats[1]*(1+wave*.018),angle:a});}
function gameTargets(kind){
 return units.filter(u=>(u.k==='cruiser'&&(kind==='baby'||kind==='bird'))||((u.k==='sam'||u.k==='pantsir')&&kind==='bird'));
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
function showSignals(){ $('signals').textContent=Object.values(orders).filter(o=>o.end>time).map(o=>o.name+(o===orders.smoke?tr(" · рух зупинено · "," · traffic stopped · "):tr(" вимк. · "," off · "))+Math.ceil(o.end-time)+tr(" с"," s")).join(' / ');
}
const crashArt=ditching(world.scene);
let flyby=null,tributeUntil=0,tributeDelay=0;
const tribute=document.createElement('div');tribute.className='tribute rooster-banner';tribute.hidden=true;
tribute.innerHTML='<img class="cartoon-rooster" alt="" src="'+roosterUrl+'"><span>«вечного полета братья»</span>';$('view').append(tribute);
const sinking=[];
const sinkingBanner=document.createElement('div');
sinkingBanner.className='tribute sinking-banner';sinkingBanner.hidden=true;
sinkingBanner.textContent='отрицатєльноє всплитіє';$('view').append(sinkingBanner);
let sinkingBannerEnd=0;
function removeUnit(u){
 units.splice(units.indexOf(u),1);
 if(u.k!=='cruiser'){u.m.removeFromParent();return}
 sinking.push({mesh:u.m,startY:u.m.position.y,age:0});
 fx.burst(u.m.position);fx.spill(u.m.position,1.8,60);world.cinematic(u.m.position.clone(),1.3);
 sinkingBannerEnd=time+4;sinkingBanner.hidden=false;
}
function sinkStep(dt){
 sinkingBanner.hidden=time>=sinkingBannerEnd;
 for(let i=sinking.length-1;i>=0;i--){
  const wreck=sinking[i];wreck.age+=dt;
  const t=Math.min(1,wreck.age/3);
  wreck.mesh.rotation.z=-.65*t;
  wreck.mesh.position.y=wreck.startY-4*t*t;
  if(t===1){wreck.mesh.removeFromParent();sinking.splice(i,1)}
 }
}
function clearFlyby(){for(const wreck of sinking)wreck.mesh.removeFromParent();sinking.length=0;sinkingBannerEnd=0;sinkingBanner.hidden=true;crashArt.reset();tributeDelay=0;flyby?.m.removeFromParent();flyby=null;tributeUntil=0;tribute.hidden=true}
function aircraftStep(dt){
 crashArt.tick(dt);
 if(tributeDelay>0){tributeDelay-=dt;if(tributeDelay<=0)tributeUntil=time+4}
 if(!flyby)return;
 const j=flyby,p=j.m.position;
 const rotors=j.m.userData.rotors;
 if(rotors){
  const speed=j.hp>0?25:7;
  rotors[0].rotation.y+=dt*speed;rotors[1].rotation.z+=dt*speed*1.7;
 }
 if(j.hp>0){
  p.x+=dt*(rotors?3.6:6);
  if(p.x>30){j.m.removeFromParent();flyby=null;return}
  if(!breakLeft&&time>=(j.nextAssist??0)){
   const drone=enemies.find(e=>e.k==='drone'&&e.hp>fx.pendingDamage(e)&&p.distanceToSquared(e.m.position)<225);
   if(drone){
    fx.tracer(p.clone(),drone.m.position.clone());
    drone.hp=0;
    j.nextAssist=time+2.5;
   }
  }
  return;
 }
 if(!j.fall){j.fall={start:p.clone(),age:0,smoke:0,end:new T.Vector3(T.MathUtils.clamp(p.x+8,-10,10),.08,11)};j.confused=false}
 const f=j.fall;f.age+=dt;
 const t=Math.min(1,f.age/2.4);
 p.lerpVectors(f.start,f.end,t);p.y=T.MathUtils.lerp(f.start.y,f.end.y,t*t);
 j.m.rotation.set(t*1.2,-Math.atan2(f.end.z-f.start.z,f.end.x-f.start.x),-t*.95,'YXZ');
 f.smoke-=dt;if(f.smoke<=0){crashArt.wake(p);f.smoke=.065}
 if(t===1){crashArt.splash(p);fx.splash(p,1.8);fx.spill(p,1.6,60);fx.explosion(p,1.4);world.cinematic(p.clone(),1.2);j.m.removeFromParent();flyby=null;tributeDelay=.65}

}
const guest=document.createElement('div');guest.className='guest';guest.hidden=true;$('view').append(guest);
let guestUntil=0,guestWave=0,incoming=null;
function showGuest(trump){
 const name=trump?tr('Трамп','Trump'):tr('Маск','Musk');
 const comment=trump?tr('Угода століття!','Deal of the century!'):tr('Оновлення прошивки…','Firmware update…');
 const hair=trump?'M13 35Q0 16 22 14Q42 -1 59 14L70 12Q64 28 33 26L17 41Z':'M13 36Q6 18 24 15L20 7L35 12L47 5L45 12Q65 10 65 32L52 24L31 25Z';
 guest.innerHTML='<svg viewBox="0 0 80 90" aria-hidden="true"><path fill="'+(trump?'#254568':'#282733')+'" d="M4 90Q4 65 32 62H50Q75 65 78 90Z"/><path fill="'+(trump?'#ffa871':'#f2c7ac')+'" stroke="#362635" stroke-width="2" d="M13 35Q10 13 41 14Q69 17 65 40L70 50L60 52Q61 67 45 70Q19 71 16 52Q7 53 11 43Z"/><path fill="'+(trump?'#ffcf64':'#493934')+'" d="'+hair+'"/><path fill="none" stroke="#372c37" stroke-width="3" d="M27 37l10 3m13-3 9-2m-18 9 5 7-6 1"/><path fill="#853f44" d="'+(trump?'M34 59q9-7 17-2l-7 5Z':'M29 55q14 9 27-2-10 19-27 2Z')+'"/><path fill="'+(trump?'#e2413b':'#ddd')+'" d="'+(trump?'M37 70h8l3 20H34Z':'M34 77l11 2-5 4 8 2-15-2 5-4Z')+'"/></svg><span><b>'+name+'</b><br>'+comment+'</span>';
 guest.hidden=false;guestUntil=time+4;
}
function guestStep(dt){
 guest.hidden=time>=guestUntil;
 if(incoming&&(incoming.hp<=0||!units.includes(incoming.unit))){
  if(incoming.hp<=0&&units.includes(incoming.unit)&&--incoming.unit.hull<=0){
   removeUnit(incoming.unit);ui();
  }
  incoming=null;
 }
 if(wave<3||guestWave===wave||waveElapsed<7)return;
 guestWave=wave;
 const roll=Math.random();
 if(roll<.045){
  showGuest(true);const choices=units.filter(u=>u.k==='sam');
  if(choices.length&&Math.random()<.4){
   const unit=choices[Math.floor(Math.random()*choices.length)];
   incoming={unit,m:unit.m,hp:1};
   fx.launchAt(unit.m.position.clone().add(new T.Vector3(-5,13,4)),incoming,1);
  }
 }else if(roll<.11){
  const drones=enemies.filter(e=>e.k==='drone'&&e.hp>0&&world.onScreen(e.m.position));
  if(!drones.length)return;
  showGuest(false);
  for(const e of drones){e.glitch=time+1+Math.random()*2.5;e.pop=Math.random()<.55}
 }
}
function advanceTraffic(before,after){
 const moving=after-Math.max(before,orders.smoke.end);
 if(moving>0){trafficTime+=moving;tankers.move(trafficTime);roadStep(moving)}
 if(before<orders.smoke.end&&after>=orders.smoke.end)ui();
}
function step(dt){
 if(autoplay)botTurn(dt);
 sinkStep(dt);aircraftStep(dt);
 if(breakLeft>0){
  const elapsed=Math.min(dt,breakLeft);
  for(const order of Object.values(orders))if(order!==orders.smoke&&order.end>time)order.end+=elapsed;
  time+=elapsed;breakLeft=Math.max(0,breakLeft-elapsed);
  advanceTraffic(time-elapsed,time);moveShips(elapsed);showBreak();showSignals();
  if(breakLeft===0){nextWave();if(wave%4===0)spawn('neptune');if(!flyby&&wave>=4){
   const roll=Math.random();
   const type=roll<.3?'jet':roll<.5?'helicopter':null;
   if(type)flyby={m:put(type,-29,type==='jet'?13:8,type==='jet'?4:9),hp:1,confused:Math.random()<.45};
  }}
  return;
 }
 waveElapsed+=dt;
 fx.tick(dt,[...enemies,flyby,incoming].filter(Boolean));fx.smolder(dt,damageSpots);guestStep(dt);
 const blocked=barges.filter(b=>b.channel).length;
 const before=time,elapsed=Math.floor(time);time+=dt;
 for(const o of Object.values(orders)){
  signalPenalty+=4*Math.max(0,Math.min(time,o.end)-before);
  if(before<o.end&&time>=o.end)ui();
 }
 showSignals();
 moveShips(dt);
 if(Math.floor(time)>elapsed){const loss=Math.min(reserve,blocked*4);reserve-=loss;seaCosts+=loss}
 advanceTraffic(before,time);untilSpawn-=dt;if(waveElapsed<=17&&untilSpawn<=0){const pool=['flamingo','flamingo','bird','baby','loaf','drone'];spawn(pool[Math.floor(Math.random()*pool.length)]);
  if(wave>=8){
   const flock=Math.min(8,Math.floor((wave-8+die)/4));
   for(let i=0;i<flock;i++)spawn('flamingo');
  }
  untilSpawn=Math.max(.32,1.9/((1+.12*wave)*intensity()))}
 for(const u of units){if(unpaid<=0)continue;u.cd-=dt;if(u.cd>0||u.ammo===0)continue;let target=null,closest=Infinity;for(const e of enemies){if(u.k==='dolphin'&&e.k!=='baby')continue;const d=Math.hypot(e.m.position.x,e.m.position.z);if(e.hp>fx.pendingDamage(e)&&d<closest&&(u.k==='sam'?world.onScreen(e.m.position):u.m.position.distanceTo(e.m.position)<(u.k==='dolphin'?10:u.k==='pantsir'?14:17)*(1+.12*tech.range))){closest=d;target=e}}
 if(flyby?.confused&&u.k==='sam'&&!fx.pendingDamage(flyby)&&world.onScreen(flyby.m.position))target=flyby;
 if(target){const p=u.m.position,to=target.m.position;u.m.rotation.y=Math.atan2(p.z-to.z,to.x-p.x);const damage=specs[u.k][2]*(1+.3*tech.dmg);u.cd=specs[u.k][3]*Math.pow(.85,tech.rate)/unpaid;if(magazine[u.k]){u.ammo--;arcadeHud();supplyHud();fx.launch(u.m,target,damage);continue}target.hp-=damage;fx.tracer(p.clone().setY(p.y+.9),to.clone())}}
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
  if(e.glitch&&e.hp>0){
   if(time<e.glitch){p.x+=Math.sin(time*8+e.angle)*dt*4;p.z+=Math.cos(time*5+e.angle)*dt*3;e.m.rotation.z=Math.sin(time*11);e.m.rotation.y+=dt*7;continue}
   e.glitch=0;e.m.rotation.z=0;if(e.pop){fx.burst(p);e.hp=0}
  }
  if(e.k==='neptune'&&e.prey&&!units.includes(e.prey))e.prey=units.find(u=>u.k==='cruiser')??null;
  if(e.k==='neptune'&&e.prey&&e.hp>0&&!crashed.has(e)&&!retreat){
   const q=e.prey.m.position,dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);
   e.m.rotation.y=Math.atan2(-dz,dx);
   if(d>4.6){p.x+=dx/d*dt*e.speed*1.7;p.z+=dz/d*dt*e.speed*1.7;p.y=.35+Math.sin(time*2+e.angle)*.08;e.swing=0;e.m.userData.trident.rotation.z=0;continue}
   const before=e.swing??0;e.swing=(before+dt)%2.6;
   e.m.userData.trident.rotation.z=-1.08*Math.pow(Math.sin(Math.PI*e.swing/2.6),8);
   if(before<1.3&&e.swing>=1.3){
    const u=e.prey,hit=q.clone().setY(1.1);u.hull=Math.max(0,u.hull-2);
    fx.explosion(hit,1.7);fx.splash(q,1.8);world.cinematic(hit,1.5);
    if(u.hull<=0){removeUnit(u);writeMessage(()=>tr("Нептун розколов крейсер тризубом.","Neptune split the cruiser with his trident."))}
    else writeMessage(()=>tr("Нептун ударив по крейсеру · міцність ","Neptune struck the cruiser · hull ")+u.hull);
    ui();
   }
   continue;
  }
  if(e.k==='neptune'&&e.hp>0&&!crashed.has(e)&&!retreat&&p.z<=4.4){
   p.z=4.4;e.m.rotation.y=Math.PI/2;
   const before=e.swing??0;e.swing=(before+dt)%2.6;
   e.m.userData.trident.rotation.z=-1.08*Math.pow(Math.sin(Math.PI*e.swing/2.6),8);
   if(before<1.3&&e.swing>=1.3){
    world.cinematic(p.clone().setY(3.6),1);const loss=damageDeck(9,p);
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
  if(e.k==='baby'&&e.hp>0&&tankers.collide(p,time)){
   fx.burst(p);crashArt.splash(p);fx.splash(p,1.4);world.cinematic(p.clone(),1.1);
   e.m.removeFromParent();enemies.splice(i,1);
   writeMessage(()=>tr('Пупс врізався в танкер. Нафтова пляма зникне за дві доби.','A baby hit an oil tanker. The slick will clear in two days.'));
   continue;
  }
  const intercepted=e.k==='baby'&&barges.some(b=>Math.abs(p.x-b.m.position.x)<2.3&&Math.abs(p.z-b.m.position.z)<1.25);
  if(e.hp<=0||intercepted||d<1.3){
   if(e.hp<=0||intercepted){score++;reward(e.k);if(intercepted)fx.splash(p,.8);else fx.kill(p.clone(),e.k)}
   else if(e.target){
    const u=e.target;
    if(units.includes(u)&&--u.hull<=0)removeUnit(u);
    writeMessage(()=>getSpecs()[u.k][0]+(u.hull?tr(" · міцність "," · hull ")+u.hull:tr(" вибув із ладу"," out of action")));
   }else if(e.k==='loaf'){
    fx.crumbs(p);damageDeck(8,p);
    for(const v of vehicles)v.hold=Math.max(v.hold,4);
    writeMessage(()=>tr("Паляниця розсипалася! Вантажівки стоять 4 секунди.","The loaf burst into crumbs! Trucks stop for 4 seconds."));
   }else if(e.k==='flamingo'){hits=Math.min(3,hits+1);world.cinematic(p.clone(),hits>=3?2:1.5);world.setHits(hits);damageDeck(12,p);hype+=25;casualties(new T.Vector3())}
   else{const loss=damageDeck(e.k==='neptune'?23:6,p);if(loss)casualties(e.m.position)}
   world.scene.remove(e.m);enemies.splice(i,1);ui();continue;
  }
  e.m.rotation.y=Math.atan2(-dz,dx);const travel=dt*e.speed;p.x+=dx/d*travel;p.z+=dz/d*travel;
  p.y=e.k==='loaf'&&!retreat?T.MathUtils.lerp(3.27,e.y,T.MathUtils.clamp((d-1.3)/7,0,1)):(dest&&e.k==='bird'?T.MathUtils.lerp(dest.y+.65,e.y,Math.min(1,d/7)):e.y)+Math.sin(time*3+e.angle)*.18;
  flap(e.m,time+e.angle)}
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.m.position.lerp(e.to,Math.min(1,dt/e.life));e.life-=dt;if(e.life<=0){world.scene.remove(e.m);effects.splice(i,1)}}
 if(hits<3&&waveElapsed>=17&&(!enemies.length||waveElapsed>=37)){
  for(const e of enemies)e.m.removeFromParent();
  enemies.length=0;fx.reset();breakLeft=BREAK_SECONDS;ui();
 }
 if(hits===3){breakLeft=0;world.carryDown(road.patchedMeshes());world.carryDown([...vehicles,...units.filter(u=>u.k==='turret'&&Math.abs(u.m.position.z)<3)].map(v=>v.m));phase='over';selectedShip=null;setPlacement(false);writeMessage(()=>tr("Третій фламінго обвалив арку. Хвиль протрималися: ","A third flamingo brought down the arch. Waves reached: ")+wave+tr(". Відбито цілей: ",". Targets repelled: ")+score+'.');ui()}}
function flap(m,t){for(const wing of m.userData.wings||[])wing.rotation.x=wing.scale.z*Math.sin(t*6)*.32}
function frame(now){const dt=Math.min((now-last)/1000,.08)*world.timeScale();last=now;if(phase==='live'&&!paused&&!$('restart').open){step(dt);if(autoplay&&!paused&&phase==='live')step(dt)};if(selectedShip)ring.position.copy(selectedShip.m.position);if(phase==='buy'){moveShips(dt);foam+=dt;scouts.forEach(({m,y},i)=>{m.position.y=y+Math.sin(foam+i)*.25;flap(m,foam+i)})}
 $('clock').textContent=[Math.floor(time/60),Math.floor(time%60)].map(n=>String(n).padStart(2,'0')).join(':');road.tick(phase==='over'?[]:damageSpots,time);tribute.hidden=time>=tributeUntil;moveTrain(trafficTime);tankers.draw(time);world.draw(time,trafficTime,phase==="live"&&orders.smoke.end>time);updateMarkers();drawRadar(enemies,time,world.heading());requestAnimationFrame(frame)}
document.addEventListener('siege-language',()=>{
 specs=getSpecs();techs=getTechs();ui();showTraffic();showSignals();
});
const SAVE_KEY='pink-siege:match:v1';
function packEntity(entity){
 const {m,pad,target,prey,destination,oldPoint,exitPoint,...state}=entity;
 return {...state,type:m.name,position:m.position.toArray(),rotation:m.quaternion.toArray(),scale:m.scale.toArray(),
  pad:pads.indexOf(pad),target:units.indexOf(target),prey:prey?units.indexOf(prey):-1,lostTarget:target&&!units.includes(target)?target.m.position.toArray():null,
  destination:destination?.toArray(),oldPoint:oldPoint?.toArray(),exitPoint:exitPoint?.toArray()};
}
function unpackEntity(item){
 const {type,position,rotation,scale,pad,target,prey,lostTarget,destination,oldPoint,exitPoint,...state}=item;
 if(magazine[type])state.ammo=Number.isInteger(state.ammo)?Math.max(0,Math.min(magazine[type],state.ammo)):magazine[type];
 const m=put(type,...position);m.quaternion.fromArray(rotation);m.scale.fromArray(scale);
 return {...state,m,pad:pads[pad],prey:units[prey]??null,target:units[target]??(lostTarget?{m:{position:new T.Vector3(...lostTarget)}}:null),
  destination:destination&&new T.Vector3(...destination),oldPoint:oldPoint&&new T.Vector3(...oldPoint),exitPoint:exitPoint&&new T.Vector3(...exitPoint)};
}
function saveMatch(){
 if(autoplay)return;
 try{
  const state={spent,partialLedger,guestWave,die,waveElapsed,breakLeft,cash,hp,time,wave,phase,untilSpawn,score,rp,unpaid,reserve0,hype,victims,waveVictims,jamLoss,reserve,waveDamage,seaCosts,hits,signalPenalty,roadTimer,inspectionCredit,arrivals,checks,caught};
  localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,state,tech,patches:road.patchedMeshes().map(m=>m.position.toArray()),damageSpots:damageSpots.map(s=>({point:s.point.toArray(),loss:s.loss})),difficulty:$('difficulty').value,inspection:$('inspection').value,
   trafficTime,oilSlicks:tankers.snapshot(),lostTankers:tankers.losses(),orders:[orders.gps.end,orders.net.end,orders.smoke.end],units:units.map(packEntity),enemies:enemies.map(packEntity),vehicles:vehicles.map(packEntity),
   barges:barges.map(packEntity),flights:fx.snapshot(enemies),camera:world.cameraPosition(),selectedShip:units.indexOf(selectedShip),placing}));
 }catch(err){console.warn('Could not save match',err)}
}
function restoreMatch(){
 const data=JSON.parse(localStorage.getItem(SAVE_KEY));
 if(!data||data.version!==1)return;
 const state={...data.state};
 if(!Object.hasOwn(reserves,data.difficulty)||!['buy','live','over'].includes(state.phase)||!Number.isInteger(state.wave))return;
 // JSON stores a previously corrupted monetary balance as null. Resume conservatively.
 for(const key of ["cash","reserve"])if(state[key]===null)state[key]=0;
 if(state.reserve0!==reserves[data.difficulty])state.reserve0=reserves[data.difficulty];
 for(const key of "cash hp time wave untilSpawn score rp unpaid reserve0 hype victims waveVictims jamLoss reserve waveDamage seaCosts hits signalPenalty roadTimer inspectionCredit arrivals checks caught".split(" "))if(!Number.isFinite(state[key]))return;
 for(const value of Object.values({...state,phase:0}))if(!Number.isFinite(value))return;
 spent=state.spent??0;partialLedger=state.partialLedger??Number(state.spent===undefined);
 ({cash,hp,time,wave,phase,untilSpawn,score,rp,unpaid,reserve0,hype,victims,waveVictims,jamLoss,reserve,waveDamage,seaCosts,hits,signalPenalty,roadTimer,inspectionCredit,arrivals,checks,caught}=state);
 for(const s of data.damageSpots??[])damageSpots.push({point:new T.Vector3(...s.point),loss:s.loss});
 if(!damageSpots.length&&hp<100)damageSpots.push({point:new T.Vector3(0,3.23,0),loss:100-hp});
 for(const pos of data.patches??[])road.repair({point:new T.Vector3(...pos)},time-1);
 for(const site of damageSpots)road.impact(site,time-6);
 guestWave=state.guestWave??wave;die=state.die??3;waveElapsed=state.waveElapsed??Math.max(0,time-(wave-1)*17);breakLeft=state.breakLeft??0;
 $('difficulty').value=data.difficulty;$('inspection').value=data.inspection;
 if(phase!=='buy'){for(const s of scouts)s.m.removeFromParent();scouts.length=0}
 for(const k of Object.keys(techs)){const level=data.tech?.[k];tech[k]=Number.isSafeInteger(level)&&level>=0&&level<1000?level:0}[orders.gps.end,orders.net.end,orders.smoke.end=0]=data.orders;trafficTime=Number.isFinite(data.trafficTime)?data.trafficTime:time;tankers.move(trafficTime);tankers.restore(data.oilSlicks,data.lostTankers);
 for(const [list,saved] of [[units,data.units],[enemies,data.enemies],[vehicles,data.vehicles],[barges,data.barges]]){
  for(const item of saved)list.push(unpackEntity(item));
 }
 fx.restore(data.flights,enemies);world.restoreCamera(data.camera);world.setHits(hits);
 if(phase==='over')world.carryDown([...vehicles,...units.filter(u=>u.k==='turret'&&Math.abs(u.m.position.z)<3)].map(v=>v.m));
 selectedShip=units[data.selectedShip]??null;setPlacement(data.placing);
 paused=phase==='live';ui();showTraffic();showSignals();
 if(paused)writeMessage(()=>tr('Партію відновлено. Натисніть ▸, щоб продовжити хвилю.','Match restored. Press ▸ to resume the wave.'));
}
function confirmNewGame(){
 const dialog=$('restart');dialog.returnValue='cancel';
 $('new-difficulty').value=$('difficulty').value;dialog.showModal();
}
$('new-game').onclick=confirmNewGame;
$('restart').addEventListener('close',()=>{
 if($('restart').returnValue!=='replace')return;
 $('difficulty').value=$('new-difficulty').value;
 reset();document.dispatchEvent(new Event('siege-reset'));saveMatch();
});
reset();
try{restoreMatch()}catch(err){console.warn('Could not restore match',err);reset()}
setInterval(()=>{if(!document.hidden)saveMatch()},2000);
window.addEventListener('pagehide',saveMatch);
function pauseAway(){
 if(phase==='live'&&!paused){paused=true;ui()}
 saveMatch();
}
window.addEventListener('blur',pauseAway);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAway()});
requestAnimationFrame(frame);
