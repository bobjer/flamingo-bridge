import * as T from 'three';
import {model} from './models.js';
import {landscape} from './scene.js';
const $=id=>document.getElementById(id),world=landscape($('view'));
const specs={sam:['ЗРК «Хлопушка»',320,4,1.7],turret:['Пулемётная турель',180,1,.45],cruiser:['Ракетный крейсер',480,7,2.1],dolphin:['Боевой дельфин',140,2,.9]};
const units=[],enemies=[],effects=[],scouts=[];
let cash,hp,time,wave,phase,paused,untilSpawn,score,level,foam,last=performance.now();
const reserves = {easy: 4500, normal: 2400, hard: 1100};
let reserve, waveDamage;
const vehicles = [];
let roadTimer, inspectionCredit, arrivals, checks, caught;
function throughput(){
 return arrivals ? 1 - 0.65 * Math.max(0, (checks / arrivals - 0.25) / 0.75) : 1;
}
function showTraffic(){
 $('traffic').textContent='Проверено '+checks+' из '+arrivals+' · задержано '+caught+' · поток '+Math.round(100*throughput())+'%';
}
function roadStep(dt){
 roadTimer-=dt;
 if(roadTimer<=0){
  const direction=Math.random()<.5?1:-1;
  const m=put('truck',-22*direction,3.22,direction*.8);
  m.rotation.y=direction===1?0:Math.PI;
  vehicles.push({m,direction,manure:Math.random()<Math.min(.55,.25+wave*.012),checked:false,hold:0,stopped:false});
  roadTimer=Math.max(1.5,3-wave*.04)/throughput();
 }
 for(let i=vehicles.length-1;i>=0;i--){
  const v=vehicles[i],p=v.m.position;
  if(v.hold>0)v.hold-=dt;
  else p.x+=v.direction*3.7*dt;
  const along=p.x*v.direction;
  if(!v.checked && along>=-10){
   v.checked=true;arrivals++;inspectionCredit+=Number($('inspection').value);
   if(inspectionCredit>=100){
    inspectionCredit-=100;checks++;v.hold=1.4;v.stopped=v.manure;
    if(v.stopped)caught++;
   }
   showTraffic();
  }
  const hit=v.manure&&!v.stopped&&along>=0;
  if(hit||along>25||(v.stopped&&v.hold<=0)){
   if(hit){const loss=Math.min(hp,6);hp-=loss;waveDamage+=loss}
   if(v.stopped)score++;
   world.scene.remove(v.m);vehicles.splice(i,1);ui();
  }
 }
}
function put(type,x,y,z){const m=model(type);m.position.set(x,y,z);world.scene.add(m);return m}
function reset(){for(const x of [...units,...enemies,...effects,...scouts,...vehicles])world.scene.remove(x.m);units.length=enemies.length=effects.length=scouts.length=0;vehicles.length=0;roadTimer=inspectionCredit=arrivals=checks=caught=0;$('inspection').value='25';showTraffic();cash=1200;hp=100;wave=time=score=level=0;paused=false;untilSpawn=0;phase='buy';foam=0;waveDamage=0;
 for(let i=0;i<6;i++){const m=put('flamingo',-9+i*2,6+i%3*1.25,8+i%2*2);m.scale.setScalar(.84);scouts.push({m,y:m.position.y})}
 $('info').textContent='Выше сложность — меньше закрытый резерв. Из него штаб оплачивает каждую волну и компенсирует повреждения.';ui()}
function button(text,action,disabled){const b=document.createElement('button');b.className='unit';b.innerHTML=text;b.disabled=disabled;b.onclick=action;$('shop').append(b)}
function ui(){const buy=phase==='buy',live=phase==='live';$('phase').textContent=paused?'Ⅱ ПАУЗА':buy?'● ФАЗА ЗАКУПКИ':live?'● ВОЛНА '+wave:'■ АРКА ЗАКРЫТА';$('cash').textContent=cash+' ₽';$('hp').textContent=hp+' %';$('bar').value=hp;$('shop').replaceChildren();$('difficulty').disabled=!buy;$('inspection').disabled=paused||phase==='over';
 for(const [k,[name,cost]] of Object.entries(specs)){const count=units.filter(u=>u.k===k).length;button(name+(count?' ×'+count:'')+'<span>'+cost+' ₽</span>',()=>purchase(k),paused||phase==='over'||cash<cost)}
 if(live){button('Ремонт +25%<span>90 ₽</span>',()=>{cash-=90;hp=Math.min(100,hp+25);ui()},paused||hp===100||cash<90);
 const cost=100+level*50;button('Усилить гарнизон · ур. '+(level+1)+'<span>'+cost+' ₽</span>',()=>{cash-=cost;level++;ui()},paused||cash<cost)}
 $('start').textContent=buy?'Начать осаду　→':live?(paused?'Продолжить　▸':'Пауза　Ⅱ'):'Новая смена　↻';$('start').disabled=buy&&!units.length;$('pause').disabled=!live;$('pause').textContent=paused?'▸':'Ⅱ';$('caption').textContent=buy?'ОБЗОР ОБЪЕКТА':live?'ОТБИТО: '+score:'ЭФИР ОКОНЧЕН'}
function purchase(k){const [,cost]=specs[k];cash-=cost;const n=units.filter(u=>u.k===k).length;const side=n%2?1:-1;
 const marine=k==='dolphin'||k==='cruiser';const x=side*(2+Math.floor(n/2)*2.7)+(k==='turret'?1:0);const z=marine?(k==='cruiser'?-6:6)+side*(n%3):k==='sam'?-1.2:1.2;
 const m=put(k,x,marine?.24:3.2,z);m.scale.setScalar(k==='cruiser'?1.2:.78);units.push({k,m,cd:0});ui()}
const grant=w=>Math.max(8,Math.round(300/(1+w*.3)));
function nextWave(){
 if(wave===0){
  reserve=reserves[$('difficulty').value];
  $('info').textContent='Первая выплата поступит после волны. Бухгалтер уже считает трещины.';
 }else{
  const pay=Math.min(reserve,Math.round((grant(wave)+waveDamage*6)*throughput()));
  reserve-=pay;
  cash+=pay;
  $('info').textContent='Волна '+wave+' · ущерб '+waveDamage+' ед. · поток '+Math.round(100*throughput())+'% · выплата '+pay+' ₽.'+(reserve===0?' Резерв исчерпан.':'');
 }
 arrivals=checks=caught=0;showTraffic();
 waveDamage=0;
 wave++;
 ui();
}
function toggle(){if(phase==='live'){paused=!paused;ui()}}
$('pause').onclick=toggle;$('start').onclick=()=>{if(phase==='over')reset();else if(phase==='buy'){for(const s of scouts)world.scene.remove(s.m);scouts.length=0;phase='live';nextWave()}else toggle()};$('plus').onclick=()=>world.zoom(.83);$('minus').onclick=()=>world.zoom(1.2);
function spawn(k){let a=Math.random()*Math.PI*2;const r=23+Math.random()*4;let x=Math.cos(a)*r,z=Math.sin(a)*r,y=.35;if(k==='bird'||k==='flamingo')y=5+Math.random()*5;else if(Math.abs(z)<5)z=6;
 const m=put(k,x,y,z);if(k==='neptune')m.scale.setScalar(2.4);const stats={baby:[3,1.6],flamingo:[4,2.7],bird:[2,3.8],neptune:[30,1.05]}[k];enemies.push({m,k,y,hp:stats[0]+Math.floor(wave/3),speed:stats[1]*(1+wave*.026),angle:a});}
const shotGeo=new T.SphereGeometry(.12,5,4),shotMat=new T.MeshBasicMaterial({color:0xffee8e});
function step(dt){time+=dt;if(time>=wave*17){nextWave();if(wave%4===0)spawn('neptune')}roadStep(dt);untilSpawn-=dt;if(untilSpawn<=0){const pool=['flamingo','flamingo','bird','baby'];spawn(pool[Math.floor(Math.random()*pool.length)]);untilSpawn=Math.max(.19,1.9/(1+.2*wave))}
 for(const u of units){u.cd-=dt;if(u.cd>0)continue;let target=null,closest=Infinity;for(const e of enemies){const d=Math.hypot(e.m.position.x,e.m.position.z);if(e.hp>0&&d<closest&&u.m.position.distanceTo(e.m.position)<(u.k==='dolphin'?10:17)){closest=d;target=e}}
 if(target){const p=u.m.position,to=target.m.position;u.m.rotation.y=Math.atan2(p.z-to.z,to.x-p.x);target.hp-=specs[u.k][2]*(1+level*.35);u.cd=specs[u.k][3];const m=new T.Mesh(shotGeo,shotMat);m.position.copy(p);m.position.y+=.9;world.scene.add(m);effects.push({m,to:to.clone(),life:.16})}}
 for(let i=enemies.length-1;i>=0;i--){const e=enemies[i],p=e.m.position,d=Math.hypot(p.x,p.z);if(e.hp<=0||d<1.3){if(e.hp<=0)score++;else {const loss=Math.min(hp,e.k==='neptune'?23:6);hp-=loss;waveDamage+=loss}world.scene.remove(e.m);enemies.splice(i,1);ui();continue}
 e.m.rotation.y=Math.atan2(p.z,-p.x);p.x-=p.x/d*dt*e.speed;p.z-=p.z/d*dt*e.speed;p.y=e.y+Math.sin(time*3+e.angle)*.18;flap(e.m,time+e.angle)}
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.m.position.lerp(e.to,Math.min(1,dt/e.life));e.life-=dt;if(e.life<=0){world.scene.remove(e.m);effects.splice(i,1)}}
 if(!hp){phase='over';$('info').textContent='Мост занят розовыми. Продержались волн: '+wave+'. Отбито целей: '+score+'.';ui()}}
function flap(m,t){for(const wing of m.userData.wings||[])wing.rotation.x=wing.scale.z*Math.sin(t*6)*.32}
function frame(now){const dt=Math.min((now-last)/1000,.08);last=now;if(phase==='live'&&!paused)step(dt);if(phase==='buy'){foam+=dt;scouts.forEach(({m,y},i)=>{m.position.y=y+Math.sin(foam+i)*.25;flap(m,foam+i)})}
 $('clock').textContent=[Math.floor(time/60),Math.floor(time%60)].map(n=>String(n).padStart(2,'0')).join(':');world.draw();requestAnimationFrame(frame)}
reset();requestAnimationFrame(frame);
