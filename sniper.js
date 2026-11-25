import {changeSide,languageButton,read,write} from './factions.js';
import {tr} from './language.js';
import './sniper.css';

const saveKey='pop-sniper-v2';
const optics=[['Ялинка','Tree'],['Точка','Dot'],['Сітка','Grid']];
const gravity=10; // Game-world gravity, deliberately not 9.80665.
const calibers=[ // v0 m/s, k = velocity decay per metre (v = v0·e^(−k·x))
 {name:'.338 Lapua Mag',v0:830,k:0.00035},
 {name:'.375 CheyTac',v0:900,k:0.00028},
 {name:'.416 Barrett',v0:940,k:0.0003},
 {name:'.50 BMG',v0:860,k:0.00028},
];
const profiles=calibers.map(c=>c.name);
const distances=[300,500,1000,2000,3000];
const modeDistances=[[0,0,0,0,0],[1,1,1,1,1],[2,2,3,3,4]]; // series mode → distance index per round
const tolerance=[12,8,5,4.5,6.5]; // hit tolerance in tenths of a mil, by distance index (2 km and 3 km: large ELR steel, plate Ø 1.8 m and 3.9 m)
const ring10=[1.3,1.15,.95,.95,.95]; // 10-ring radius in tenths of a mil per distance index (constant ~0.1 mil angular size, a bit larger up close)
const ringFrac=d=>ring10[d]/tolerance[d]; // 10-ring radius as a fraction of the plate (ring 1) radius
const ringOf=(err,d)=>{const t=tolerance[d],r=ring10[d];return err>t?0:err<=r?10:Math.max(1,9-Math.floor(9*(err-r)/(t-r)))};
// Random dispersion (sampled once per shot): expert wind call 0.5 m/s, muzzle velocity SD 2.1 m/s, rifle 0.05 mil/axis (~0.5 MOA group), hold 0.03 mil/axis plus the visible sway.
const sigma={gust:.5,dv0:2.1,rand:.05,hold:.03,holdReduced:.05};
const gauss=()=>Math.sqrt(-2*Math.log(1-Math.random()))*Math.cos(2*Math.PI*Math.random());
const swayAt=t=>({x:.05*Math.sin(2*Math.PI*.23*t)+.02*Math.sin(2*Math.PI*.9*t+1),y:.07*Math.sin(2*Math.PI*.17*t+.5)+.02*Math.sin(2*Math.PI*1.1*t)}); // mil
const sgn=(v,d)=>(v<0?'−':v>0?'+':'')+Math.abs(v).toFixed(d);
const distLabel=d=>d<1000?d+' '+tr('м','m'):d/1000+' '+tr('км','km');
// TODO(hard mode): humidity → air density → velocity decay and drift.
const weather=[
 {humidity:36,east:true,flags:[1,2,1]},
 {humidity:72,east:false,flags:[3,2,3]},
 {humidity:48,east:true,flags:[2,3,2]},
 {humidity:64,east:false,flags:[1,2,1]},
 {humidity:82,east:true,flags:[3,2,1]},
 {humidity:27,east:false,flags:[2,1,2]},
];
const flightTime=(c,x)=>(Math.exp(c.k*x)-1)/(c.k*c.v0);
const drop=(c,x)=>gravity*flightTime(c,x)**2/2;
const elevation=(c,x)=>1000*(drop(c,x)/x-drop(c,100)/100); // mil, 100 m zero
const drift1=(c,x)=>1000*(flightTime(c,x)-x/c.v0)/x; // mil per 1 m/s crosswind
const windSpeed=w=>w.flags.reduce((a,f)=>a+f*2,0)/3; // m/s, flag strength 1/2/3 = 2/4/6 m/s
const xMax=Math.ceil(Math.max(...calibers.flatMap(c=>distances.flatMap(d=>weather.map(w=>drift1(c,d)*windSpeed(w)))))/5)*50;
const yMax=Math.ceil(Math.max(...calibers.flatMap(c=>distances.map(d=>elevation(c,d))))/5)*50;
const saved=read(saveKey);
const validIndex=(value,length)=>Number.isInteger(value)&&value>=0&&value<length;
const validDisp=d=>d===undefined||!!d&&[d.gust,d.dv0,d.rand?.x,d.rand?.y,d.hold?.x,d.hold?.y].every(Number.isFinite);
const validShot=s=>!!s&&typeof s==='object'&&validDisp(s.disp)&&Number.isInteger(s.ring)&&s.ring>=0&&s.ring<=10&&typeof s.hit==='boolean'&&Number.isFinite(s.dx)&&Number.isFinite(s.dy)&&Number.isFinite(s.ms)&&s.ms>=0;
const validSeries=s=>!!s&&typeof s==='object'&&Array.isArray(s.rounds)&&s.rounds.length===seriesSize&&s.rounds.every(i=>validIndex(i,weather.length))&&
 Array.isArray(s.unassisted)&&s.unassisted.length<=seriesSize&&s.unassisted.every(v=>typeof v==='boolean')&&typeof s.usedCode==='boolean'&&
 Array.isArray(s.scores)&&s.scores.length<=seriesSize&&s.scores.every(v=>Number.isInteger(v)&&v>=0&&v<=10)&&
 s.unassisted.length===s.scores.length&&Array.isArray(s.shots)&&s.shots.length===s.scores.length&&s.shots.every(validShot)&&
 Number.isFinite(s.time)&&s.time>=0&&(s.started===undefined||typeof s.started==='boolean');
const viewSize=700;
const canvasScale=()=>Math.min(2,window.devicePixelRatio||1);
const panStep=22;
const seriesSize=5;
const zoomMin=4,zoomMax=25,aimLimit=600; // magnification (×); aim clamp in tenths of a mil
const uOf=zoom=>panStep/2*zoom/10; // px per mil at a magnification
const clampAim=v=>Math.max(-aimLimit,Math.min(aimLimit,v));
const randomAim=()=>{const r=3+Math.random()*5,a=Math.random()*Math.PI*2;return{x:Math.round(r*Math.cos(a)*10),y:Math.round(r*Math.sin(a)*10)}};
const clock2=ms=>{const t=Math.round(ms/100),m=Math.floor(t/600),sec=(t%600)/10;return String(m).padStart(2,'0')+':'+(sec<10?'0':'')+sec.toFixed(1)};
const clock1=ms=>{const t=Math.floor(ms/1000);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')};
const maxScore=seriesSize*10;
const clampAxis=(axis,value)=>axis==='x'?Math.max(-xMax,Math.min(xMax,value)):Math.max(0,Math.min(yMax,value));
const initial=()=>({mode:2,distance:2,optic:0,profile:0,weather:0,x:0,y:0,aim:randomAim(),zoom:zoomMin});
const mil=value=>(Math.abs(value)/10).toFixed(1);
const signedMil=value=>value<0?'−'+mil(value):value>0?'+'+mil(value):mil(0);

const compass=conditions=>conditions.east?'W → E':'E → W';
const flagPattern=conditions=>conditions.flags.map(flag=>(conditions.east?'›':'‹').repeat(flag)).join(' / ');

function solution(state,weatherIndex=state.weather){
 const c=calibers[state.profile],x=distances[state.distance],w=weather[weatherIndex];
 return [Math.round(-(w.east?1:-1)*drift1(c,x)*windSpeed(w)*10)+0,Math.round(elevation(c,x)*10)];
}

export function startSniper(){
 const state=saved&&validIndex(saved.distance,distances.length)&&validIndex(saved.optic,optics.length)&&validIndex(saved.profile,profiles.length)&&
  validIndex(saved.weather,weather.length)&&Number.isInteger(saved.x)&&Math.abs(saved.x)<=xMax&&Number.isInteger(saved.y)&&saved.y>=0&&saved.y<=yMax?{...saved}:initial();
 // Saves from before the round index existed used distance as the round.
 if(state.round===undefined&&validSeries(state.series)&&validIndex(state.distance,seriesSize))state.round=state.distance;
 delete state.best;
 if(!validIndex(state.mode,3))state.mode=2;
 if(state.tutorialDone!==true)state.distance=modeDistances[state.mode][0];
 if(state.series&&Array.isArray(state.series.rounds)&&state.series.rounds.length!==seriesSize)delete state.bestScore; // record from an older series length
 if(state.bestScore!==undefined&&!(Number.isInteger(state.bestScore)&&state.bestScore>=0&&state.bestScore<=maxScore))delete state.bestScore;
 if(state.bestHpm!==undefined&&!(Number.isFinite(state.bestHpm)&&state.bestHpm>0))delete state.bestHpm;
 state.zoom=Number.isInteger(state.zoom)&&state.zoom>=zoomMin&&state.zoom<=zoomMax?state.zoom:zoomMin;
 state.aim=state.aim&&Number.isFinite(state.aim.x)&&Number.isFinite(state.aim.y)?{x:clampAim(Math.round(state.aim.x)),y:clampAim(Math.round(state.aim.y))}:randomAim();
 if(!(Number.isInteger(state.misses)&&state.misses>=0))state.misses=0;
 const shot=state.lastShot;
 if(!(shot&&typeof shot==='object'&&Number.isInteger(shot.ring)&&shot.ring>=0&&shot.ring<=10&&Number.isInteger(shot.score)&&shot.score>=0&&shot.score<=10))delete state.lastShot;
 state.roundDone=state.roundDone===true&&!!state.lastShot;
 const root=document.createElement('main');
 root.className='sniper-board';document.body.append(root);
 const save=()=>write(saveKey,state);
 let gl=null,glLoop=0,scopeRO=null,dragging=false,pendingRender=false,flying=false,notice='',miss=null,mark=0,tabPick=null; // tabPick: reference tab chosen by the player or autoplay (not persisted)
 const hasResults=()=>state.tutorialDone===true&&!!state.series&&state.series.scores.length===seriesSize;
 const curTab=()=>tabPick&&(tabPick!=='results'||hasResults())?tabPick:state.tutorialDone!==true?'method':'table';
 // Aiming clock: runs only while a series shot is open, the page is visible and no flight overlay is up. Call after every state flip.
 const clockOn=()=>state.tutorialDone===true&&!!state.series&&state.series.started===true&&!state.roundDone&&!flying&&!document.hidden&&root.isConnected;
 function clock(){
  const now=performance.now();
  if(mark&&state.series)state.series.time+=now-mark;
  mark=clockOn()?now:0;
 }
 function begin(){
  const s=state.series;
  if(state.tutorialDone!==true||!s||s.started===true||state.roundDone)return;
  s.started=true;save();clock();
 }
 // ---- WebGL scope view lifecycle ----
 const swayNow=()=>gl&&!reduced()?swayAt(performance.now()/1000):{x:0,y:0}; // hold sway in mil; only while the animated scope view runs
 const view=()=>{const w=swayNow();return w.x||w.y?{...state,aim:{x:state.aim.x+w.x*10,y:state.aim.y+w.y*10}}:state}; // the target drifts by the sway
 const glOn=()=>!!gl&&root.isConnected&&!flying&&!document.hidden;
 function glStop(){cancelAnimationFrame(glLoop);glLoop=0}
 function glStart(){ // light ~20 fps loop for the flags; runs only while the scope is visible
  if(glLoop||!glOn()||reduced())return;
  let last=0;
  const f=t=>{
   glLoop=0;if(!glOn())return;
   glLoop=requestAnimationFrame(f);
   if(t-last<48)return;
   try{gl.update(Math.min(.1,last?(t-last)/1000:.05));last=t;gl.draw(view())}catch(error){glFail(error)}
  };
  glLoop=requestAnimationFrame(f);
 }
 function glDrop(){glStop();scopeRO?.disconnect();scopeRO=null;gl?.canvas.remove();try{gl?.dispose()}catch{}gl=null}
 function glFail(error){console.warn('sniper: WebGL view failed, using 2D view',error);glDrop();render()}
 async function glLoad(){
  try{
   const [T,{buildWorld}]=await Promise.all([import('three'),import('./sniper-world.js')]);
   if(!root.isConnected)return;
   gl=createGL(T,buildWorld);
   gl.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();glDrop();render()});
  }catch(error){console.warn('sniper: WebGL unavailable, using 2D view',error);gl=null;return}
  if(dragging||flying)pendingRender=true;else render();
 }
 const scopeTop=()=>{if(window.matchMedia?.('(max-width: 750px)').matches)root.querySelector('.sniper-scope')?.scrollIntoView({block:'start',behavior:reduced()?'auto':'smooth'})};
 document.addEventListener('visibilitychange',glStart);
 const paintTimer=()=>{const el=root.querySelector('[data-timer]');if(el&&state.series)el.textContent=clock1(state.series.time)};
 function selectTab(id){
  tabPick=id;
  for(const t of root.querySelectorAll('[role="tab"]')){const on=t.dataset.tab===id;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1}
  for(const p of root.querySelectorAll('[role="tabpanel"]'))p.hidden=p.id!=='sniper-panel-'+id;
 }

 // Autoplay: a single controller; every timed action goes through schedule() so pause/resume can freeze it.
 let align=()=>{},aimer=()=>{},zoomer=()=>{};
 const ap={on:false,paused:false,step:0,timer:0,remaining:0,startedAt:0,fn:null};
 const finalNow=()=>state.tutorialDone===true&&state.round===seriesSize-1;
 const solved=()=>{const [a,b]=solution(state),t=tolerance[state.distance];return Math.abs(a-state.x)<=t&&Math.abs(b-state.y)<=t};
 const aimed=()=>!state.aim.x&&!state.aim.y;
 const hold=text=>Math.max(3500,Math.min(9000,1800+45*text.length));
 const apSteps=()=>{
  const w=weather[state.weather],c=calibers[state.profile],dk=distances[state.distance],sp=w.flags.map(f=>f*2),wind=windSpeed(w),
   e=elevation(c,dk),k=drift1(c,dk),[sx,sy]=solution(state),last=finalNow();
  return [
   {mark:'zoom',zoom:true,text:tr('Ставлю кратність 4×, щоб знайти мішень, потім 16× для точного наведення.','Setting 4× to find the target, then 16× for precise aiming.')},
   {mark:'weather',text:tr('Читаю прапорці: ','Reading the flags: ')+flagPattern(w)+'. '+tr('Кожна риска — 2 м/с, тож це ','Each mark is 2 m/s, so that is ')+sp.join(', ')+tr(' м/с.',' m/s.')},
   {mark:'weather',text:tr('Вітер уздовж траси різний, беру середнє: ','Wind varies along the range, so I take the average: ')+'('+sp.join(' + ')+') / 3 = '+wind.toFixed(1)+tr(' м/с.',' m/s.')},
   {mark:'weather',text:w.east?tr('Вітер дме W → E і зносить кулю праворуч. Щоб компенсувати, X має бути від’ємним — ціль лівіше.','The wind blows W → E and pushes the bullet right. To compensate, X must be negative — aim left.'):
    tr('Вітер дме E → W і зносить кулю ліворуч. Щоб компенсувати, X має бути додатним — ціль правіше.','The wind blows E → W and pushes the bullet left. To compensate, X must be positive — aim right.')},
   {mark:'table',text:tr('Таблиця для ','Table for ')+c.name+', '+distLabel(dk)+tr(': підйом ',': elevation ')+e.toFixed(1)+tr(' міл, знос ',' mil, drift ')+k.toFixed(2)+tr(' міл на кожен 1 м/с бокового вітру.',' mil per 1 m/s of crosswind.')},
   {mark:'y',text:tr('Куля падає під дією тяжіння (у світі гри g = 10 м/с²), тому ствол піднімаємо: Y = ','The bullet drops under gravity (g = 10 m/s² in the game world), so we raise the barrel: Y = ')+mil(sy)+tr(' міл.',' mil.')},
   {mark:'x',text:'X = '+k.toFixed(2)+' × '+wind.toFixed(1)+' ≈ '+signedMil(sx)+tr(' міл. Чим довше куля летить, тим більше її зносить.',' mil. The longer the flight, the more the wind carries it.')},
   {mark:'y',dial:'y',text:tr('Кручу барабан підйому до ','Dialing elevation to ')+mil(sy)+tr(' міл.',' mil.')},
   {mark:'x',dial:'x',text:tr('Кручу барабан вітру до ','Dialing windage to ')+signedMil(sx)+tr(' міл.',' mil.')},
   {mark:'aim',aim:true,text:tr('Наводжу гвинтівку: ставлю мішень у центр сітки, бо поправки виставлені барабанами повністю.','Aiming the rifle: target to the reticle center, since the turrets carry the full correction.')},
   {mark:'fire',text:tr('Приціл виставлено. Тепер ваш постріл — натисніть «Постріл».','Aim is set. Your shot — press Fire.')},
   {mark:null,text:state.roundDone?(state.lastShot?.ring?tr('Влучання: ','Hit: ')+state.lastShot.ring+tr(' очок. ',' pts. ')+(state.lastShot.ring<10?tr(' Відхилення через порив і розкид — це нормально.',' The deviation comes from gusts and spread — that\'s normal.')+' ':''):tr('Промах: 0 очок. ','Miss: 0 pts. '))+(last?tr('Серію з '+seriesSize+' пострілів завершено.',seriesSize+'-shot series complete.'):tr('Переходжу до наступного раунду.','Moving to the next round.')):
    tr('Промах: ','Miss: ')+'X '+signedMil(miss?.dx??0)+' / Y '+signedMil(miss?.dy??0)+tr(' міл. Перевіряю розрахунок і виправляю.',' mil. Rechecking and correcting.')},
  ];
 };
 const apLabel=()=>ap.on?tr('✋ Грати самому','✋ Take over'):tr('Автогра','Autoplay');
 const apPanel=()=>`<section class="sniper-autoplay" aria-live="polite"><small></small><p data-narration></p><button type="button" data-autoplay-pause></button></section>`;
 function paintAutoplay(){
  const button=root.querySelector('[data-autoplay]'),panel=root.querySelector('.sniper-autoplay');
  button.textContent=apLabel();button.setAttribute('aria-pressed',String(ap.on));
  for(const old of root.querySelectorAll('.is-explained'))old.classList.remove('is-explained');
  if(!ap.on){panel?.remove();return}
  const steps=apSteps(),s=steps[ap.step];
  if(panel){
   panel.querySelector('small').textContent=tr('Крок ','Step ')+(ap.step+1)+'/'+steps.length;
   panel.querySelector('[data-narration]').textContent=s.text;
   panel.querySelector('[data-autoplay-pause]').textContent=ap.paused?tr('Далі','Resume'):tr('Пауза','Pause');
  }
  if(s.mark==='table')selectTab('table');
  const el=s.mark==='x'||s.mark==='y'?root.querySelector('[data-axis="'+s.mark+'"]')?.closest('.sniper-axis'):
   s.mark==='zoom'?root.querySelector('.sniper-zoom'):s.mark==='aim'?root.querySelector('.sniper-scope'):s.mark==='weather'?root.querySelector('.sniper-weather'):s.mark==='fire'?root.querySelector('[data-fire]'):s.mark==='table'?root.querySelector('tr.is-current'):null;
  el?.classList.add('is-explained');
 }
 function schedule(fn,ms){
  clearTimeout(ap.timer);ap.fn=fn;ap.remaining=ms;ap.startedAt=Date.now();
  if(!ap.paused)ap.timer=setTimeout(()=>{ap.fn=null;fn()},ms);
 }
 function togglePause(){
  if(ap.paused){ap.paused=false;if(ap.fn)schedule(ap.fn,ap.remaining)}
  else{ap.paused=true;clearTimeout(ap.timer);ap.remaining=Math.max(0,ap.remaining-(Date.now()-ap.startedAt))}
  paintAutoplay();
 }
 function stopAutoplay(){
  clearTimeout(ap.timer);
  Object.assign(ap,{on:false,paused:false,timer:0,fn:null});
  paintAutoplay();
 }
 const takeover=()=>{if(ap.on)stopAutoplay();begin()};

 // Ballistic calculator: pure arithmetic on what the player types; never reads game state, never affects scoring.
 const calc={open:false,f:['','',''],dir:'',drift:'',elev:'',status:''};
 const num=text=>{const t=text.trim().replace(/\s+/g,'').replace(/[−–—]/g,'-').replace(',','.');return /^-?(\d+\.?\d*|\.\d+)$/.test(t)?Number(t):NaN};
 const calcFlag=text=>{const v=num(text);return Number.isInteger(v)&&v>=1&&v<=3?v:NaN};
 function calcResult(){
  const f=calc.f.map(calcFlag),drift=num(calc.drift),elev=num(calc.elev),dash='—';
  const out={bad:f.map((v,i)=>calc.f[i].trim()!==''&&Number.isNaN(v)),wind:dash,x:dash,y:dash,xt:null,yt:null};
  if(f.every(v=>!Number.isNaN(v))){
   const wind=Number((f.reduce((a,v)=>a+2*v,0)/3).toFixed(1));
   out.wind='('+f.map(v=>2*v).join(' + ')+') / 3 = '+wind.toFixed(1)+tr(' м/с',' m/s');
   if(calc.dir&&!Number.isNaN(drift)){
    out.xt=Math.round(-(calc.dir==='we'?1:-1)*drift*wind*10)+0;
    out.x=drift+' × '+wind.toFixed(1)+' = '+signedMil(out.xt)+tr(' міл',' mil');
   }
  }
  if(!Number.isNaN(elev)){out.yt=Math.round(elev*10)+0;out.y=(out.yt/10).toFixed(1)+tr(' міл',' mil')}
  return out;
 }
 function paintCalc(){
  const r=calcResult();
  root.querySelector('[data-calc-out="wind"]').value=r.wind;
  root.querySelector('[data-calc-out="x"]').value=r.x;
  root.querySelector('[data-calc-out="y"]').value=r.y;
  root.querySelectorAll('[data-calc^="f"]').forEach((el,i)=>el.setAttribute('aria-invalid',String(r.bad[i])));
  root.querySelector('[data-calc-apply]').disabled=r.xt===null||r.yt===null||state.roundDone;
  root.querySelector('[data-calc-status]').textContent=calc.status;
 }
 function setCalcOpen(open,focus=true){
  calc.open=open;
  const drawer=root.querySelector('#sniper-calc'),toggle=root.querySelector('[data-calc-toggle]');
  drawer.classList.toggle('is-open',open);drawer.inert=!open;
  if(open)drawer.removeAttribute('aria-hidden');else drawer.setAttribute('aria-hidden','true');
  toggle.setAttribute('aria-expanded',String(open));
  if(focus)(open?drawer.querySelector('[data-calc="f1"]'):toggle).focus();
 }
 function bindCalc(){
  const drawer=root.querySelector('#sniper-calc');
  root.querySelector('[data-calc-toggle]').onclick=()=>setCalcOpen(!calc.open);
  drawer.querySelector('[data-calc-close]').onclick=()=>setCalcOpen(false);
  drawer.onkeydown=event=>{if(event.key==='Escape'&&calc.open){event.stopPropagation();setCalcOpen(false)}};
  for(const el of drawer.querySelectorAll('[data-calc]'))el.oninput=()=>{
   const k=el.dataset.calc;
   if(k[0]==='f')calc.f[k[1]-1]=el.value;else calc[k]=el.value;
   calc.status='';paintCalc();
  };
  for(const el of drawer.querySelectorAll('[name="calc-dir"]'))el.onchange=()=>{calc.dir=el.value;calc.status='';paintCalc()};
  drawer.querySelector('[data-calc-apply]').onclick=()=>{
   const r=calcResult();
   if(r.xt===null||r.yt===null)return;
   takeover();
   align(r.xt,r.yt);
   calc.status=tr('Виставлено: X ','Set: X ')+signedMil(state.x)+' / Y '+mil(state.y);
   paintCalc();
  };
  drawer.querySelector('[data-calc-clear]').onclick=()=>{
   Object.assign(calc,{f:['','',''],dir:'',drift:'',elev:'',status:''});
   for(const el of drawer.querySelectorAll('[data-calc]'))el.value='';
   for(const el of drawer.querySelectorAll('[name="calc-dir"]'))el.checked=false;
   paintCalc();drawer.querySelector('[data-calc="f1"]').focus();
  };
  paintCalc();
 }
 const calcDrawer=()=>{
  const field=(key,value,extra='')=>`<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-calc="${key}" value="${value}"${extra}>`;
  return `<aside id="sniper-calc" class="sniper-calc-drawer${calc.open?' is-open':''}" aria-label="${tr('Балістичний калькулятор','Ballistic calculator')}"${calc.open?'':' inert aria-hidden="true"'}>
   <div class="sniper-calc-head"><h2>${tr('Балістичний калькулятор','Ballistic calculator')}</h2><button type="button" data-calc-close aria-label="${tr('Закрити','Close')}">×</button></div>
   <div class="sniper-calc-flags">${[1,2,3].map(n=>`<label>${tr('Прапорець ','Flag ')}${n}${field('f'+n,calc.f[n-1])}</label>`).join('')}</div>
   <p class="sniper-calc-hint">${tr('кількість рисок 1–3','marks, 1–3')}</p>
   <output data-calc-out="wind"></output>
   <div class="sniper-calc-dir" role="group" aria-label="${tr('Напрям вітру','Wind direction')}">
    ${[['we','W → E'],['ew','E → W']].map(([v,t])=>`<label><input type="radio" name="calc-dir" value="${v}"${calc.dir===v?' checked':''}>${t}</label>`).join('')}
   </div>
   <label class="sniper-calc-row">${tr('Знос на 1 м/с, міл','Drift per 1 m/s, mil')}${field('drift',calc.drift)}</label>
   <label class="sniper-calc-row">${tr('Підйом з таблиці, міл','Elevation from table, mil')}${field('elev',calc.elev)}</label>
   <div class="sniper-calc-result"><span>X</span><output data-calc-out="x" class="is-x"></output><span>Y</span><output data-calc-out="y" class="is-y"></output></div>
   <div class="sniper-hints"><button type="button" data-calc-apply>${tr('Виставити на барабани','Set on turrets')}</button><button type="button" data-calc-clear>${tr('Очистити','Clear')}</button></div>
   <p class="sniper-calc-status" data-calc-status role="status"></p>
  </aside>`;
 };
 // Moves one axis toward the solution in tenths, through the same setAlignment path as user input.
 function dial(axis,done){
  const target=solution(state)[axis==='x'?0:1],move=v=>axis==='x'?align(v,state.y,true):align(state.x,v,true);
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){move(target);done();return}
  const size=Math.ceil(Math.abs(target-state[axis])/30)||1;
  const tick=()=>{
   const rest=target-state[axis];
   if(!rest){done();return}
   move(state[axis]+Math.sign(rest)*Math.min(size,Math.abs(rest)));
   if(target-state[axis]===rest){done();return}
   schedule(tick,55);
  };
  tick();
 }
 const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function zoomTo(target,done){
  const tick=()=>{
   const d=target-state.zoom;
   if(!d){done();return}
   zoomer(reduced()?target:state.zoom+Math.sign(d),false);
   if(reduced()||state.zoom===target){done();return}
   schedule(tick,40);
  };
  tick();
 }
 function aimOut(done){
  const size=Math.ceil(Math.max(Math.abs(state.aim.x),Math.abs(state.aim.y))/30)||1;
  const toward=(v)=>v-Math.sign(v)*Math.min(size,Math.abs(v));
  const tick=()=>{
   const {x,y}=state.aim;
   if(!x&&!y){done();return}
   if(reduced())aimer(0,0,true);else aimer(toward(x),toward(y),true);
   if(state.aim.x===x&&state.aim.y===y){done();return}
   schedule(tick,55);
  };
  tick();
 }
 function runStep(){
  paintAutoplay();
  const s=apSteps()[ap.step];
  if(s.mark==='fire')return; // autoplay waits for the player's shot
  const wait=()=>schedule(advance,hold(s.text));
  if(s.zoom)zoomTo(4,()=>schedule(()=>zoomTo(16,wait),900));else if(s.aim)aimOut(wait);else if(s.dial)dial(s.dial,wait);else wait();
 }
 function advance(){
  if(ap.step<11){ap.step++;runStep();return}
  if(!state.roundDone){ap.step=7;runStep();return}
  if(finalNow()){stopAutoplay();return}
  nextRound();
  if(state.tutorialDone===true){state.series.usedCode=true;save()}
  ap.step=solved()?(aimed()?10:9):0;
  runStep();
 }
 function startAutoplay(){
  ap.on=true;ap.paused=false;ap.fn=null;
  if(state.tutorialDone===true){state.series.usedCode=true;save()}
  ap.step=state.roundDone?11:solved()?(aimed()?10:9):0;
  begin();
  render();root.querySelector('[data-autoplay]').focus();
  runStep();
 }

 function resetShot(){state.misses=0;state.roundDone=false;delete state.lastShot;notice='';miss=null;state.aim=randomAim()}
 function startSeries(){
  const rounds=[];
  let previous=state.weather;
  while(rounds.length<seriesSize){
   const available=weather.flatMap((entry,index)=>entry.east!==weather[previous].east?[index]:[]); // alternate wind side; indices may recur but never back to back
   previous=available[Math.floor(Math.random()*available.length)];
   rounds.push(previous);
  }
  state.series={rounds,unassisted:[],scores:[],shots:[],usedCode:false,time:0,started:false};
  resetShot();
  state.round=0;
  state.distance=modeDistances[state.mode][0];
  state.weather=rounds[0];
  state.x=state.y=0;
 }

 // Restart the series when its saved history is missing, corrupt or out of step with the round.
 if(state.tutorialDone===true&&(!validSeries(state.series)||!validIndex(state.round,seriesSize)||state.distance!==modeDistances[state.mode][state.round]||
  state.weather!==state.series.rounds[state.round]||state.series.unassisted.length!==state.round+Number(state.roundDone)||state.series.scores.length!==state.series.unassisted.length||state.series.shots.length!==state.series.scores.length)){startSeries();save()}
 if(state.series&&typeof state.series.started!=='boolean')state.series.started=state.series.time>0||state.series.scores.length>0;
 clock();
 document.addEventListener('visibilitychange',clock);
 let savedSec=-1;
 const tickId=setInterval(()=>{
  if(!root.isConnected){clearInterval(tickId);document.removeEventListener('visibilitychange',glStart);glDrop();return}
  clock();paintTimer();
  const sec=state.series?Math.floor(state.series.time/1000):-1;
  if(mark&&sec!==savedSec){savedSec=sec;save()}
 },250);

 // Explicit shot: score by distance from the solution, play the 3D flight, then record the result.
 async function fire(){
  if(state.roundDone||flying)return;
  begin();
  if(ap.on){clearTimeout(ap.timer);ap.fn=null}
  const [sx,sy]=solution(state),tol=tolerance[state.distance],w=weather[state.weather],tutorial=state.tutorialDone!==true;
  const c=calibers[state.profile],D=distances[state.distance],sw=swayNow(),gust=gauss()*sigma.gust,dv0=gauss()*sigma.dv0,hs=reduced()?sigma.holdReduced:sigma.hold;
  const disp={gust,dv0,rand:{x:gauss()*sigma.rand,y:gauss()*sigma.rand},hold:{x:gauss()*hs-sw.x,y:gauss()*hs-sw.y}}; // mil; hold is the impact error from the sway at the trigger pull
  const dx=(state.x-sx)-state.aim.x+10*((w.east?1:-1)*drift1(c,D)*gust+disp.rand.x+disp.hold.x),
   dy=(state.y-sy)-state.aim.y+10*(elevation(c,D)-elevation({...c,v0:c.v0+dv0},D)+disp.rand.y+disp.hold.y),
   err=Math.hypot(dx,dy),ring=ringOf(err,state.distance);
  const note=tr('Порив ','Gust ')+sgn(gust,1)+tr(' м/с · швидкість ',' m/s · velocity ')+sgn(dv0,1)+tr(' м/с',' m/s')+'\n'+tr('розкид ','spread ')+sgn(disp.rand.x,2)+'/'+sgn(disp.rand.y,2)+tr(' · рука ',' · hold ')+sgn(disp.hold.x,2)+'/'+sgn(disp.hold.y,2)+tr(' міл',' mil');
  flying=true;clock();
  const button=root.querySelector('[data-fire]');
  if(button)button.disabled=true;
  try{
   const {playFlight}=await import('./sniper-flight.js');
   await playFlight(root,{
    distance:distances[state.distance],caliber:calibers[state.profile],gravity,
    aimMil:{x:state.x/10,y:state.y/10},impactMil:{x:dx/10,y:dy/10},targetRadiusMil:tol/10,ring10:ringFrac(state.distance),note,ring,hit:ring>0,
    wind:{east:w.east,flags:w.flags,speed:windSpeed(w)},
    duration:distances[state.distance]/100,autoClose:ap.on?4:0,tr,
   });
  }catch(error){console.warn(error)}
  flying=false;pendingRender=false;
  if(tutorial){
   if(ring){state.roundDone=true;state.lastShot={ring,score:Math.max(1,ring-(state.misses||0))};state.misses=0;notice='';miss=null}
   else{state.misses=(state.misses||0)+1;miss={dx,dy};notice=tr('Промах · поправте приціл і стріляйте знову','Miss · correct and fire again')}
  }else{
   const series=state.series;
   const before=series.shots.reduce((a,b)=>a+b.ms,0);
   series.time+=1000*flightTime(calibers[state.profile],distances[state.distance]); // real time of flight replaces the animation time
   series.scores=[...series.scores,ring];
   series.unassisted=[...series.unassisted,!series.usedCode];
   series.shots=[...series.shots,{ring,hit:ring>0,dx,dy,ms:Math.max(0,series.time-before),disp}];
   state.roundDone=true;state.lastShot={ring,score:ring};state.misses=0;notice='';miss=null;
   if(state.round===seriesSize-1){
    const total=series.scores.reduce((a,b)=>a+b,0),hits=series.shots.filter(v=>v.hit).length,hpm=series.time>0?hits/(series.time/60000):0;
    series.newRecord={score:total>(state.bestScore??0),hpm:hits>0&&hpm>(state.bestHpm??0)};
    if(series.newRecord.score)state.bestScore=total;
    if(series.newRecord.hpm)state.bestHpm=hpm;
    tabPick='results';
   }
  }
  clock();
  save();render();scopeTop();
  if(state.roundDone&&!ap.on)root.querySelector('[data-next]')?.focus();
  if(ap.on){ap.step=11;runStep()}
 }
 function nextRound(){
  if(tabPick==='results')tabPick=null;
  if(state.tutorialDone!==true||state.round===seriesSize-1){
   state.tutorialDone=true;
   startSeries();
  }else{
   state.series.usedCode=false;
   resetShot();
   state.round++;
   state.distance=modeDistances[state.mode][state.round];
   state.weather=state.series.rounds[state.round];
   state.x=state.y=0;
  }
  clock();
  save();render();scopeTop();
 }
 function methodSteps(){
 return `<li>${tr('Спершу підберіть кратність: на 4× видно всю трасу, щоб знайти мішень; потім збільште, щоб точно навестися.','First set magnification: at 4× you see the whole range to find the target; then zoom in to aim precisely.')}</li>
  <li>${tr('Кожен прапорець: › = 2 м/с, ›› = 4 м/с, ››› = 6 м/с. Вітер — середнє трьох.','Each flag: › = 2 m/s, ›› = 4 m/s, ››› = 6 m/s. Wind is the average of the three.')}</li>
  <li>${tr('Y = підйом з таблиці для вашої дистанції.','Y = elevation from the table for your distance.')}</li>
  <li>${tr('X = знос на 1 м/с × вітер. Вітер W → E зносить праворуч — X від’ємний; E → W — ліворуч, X додатний.','X = drift per 1 m/s × wind. A W → E wind pushes right, so X is negative; E → W pushes left, so X is positive.')}</li>
  <li>${tr('Навіть ідеальний розрахунок не гарантує 10: реальний розкид — оцінка вітру експертом ±0,5 м/с (≈1 миля/год), розкид швидкості кулі ±2 м/с (≈7 фут/с), кучність гвинтівки ≈0,5 MOA і дихання стрільця — дає випадкове відхилення. За симуляцією ідеальний постріл дає 10 приблизно у 75% випадків на 300 м, 60% на 500 м, 30–40% на 1 км, 10–15% на 2 км і 3–6% на 3 км. Мішені на 2 і 3 км великі (сталева плита ⌀ 1,8 і 3,9 м), тож навіть тут ідеальний постріл влучає в плиту приблизно у 85–96% (2 км) і 70–93% (3 км) випадків залежно від калібру.','Even a perfect solution doesn\'t guarantee a 10. Realistic error adds up: an expert\'s wind call is off by about ±0.5 m/s (~1 mph), muzzle velocity varies by ±2 m/s (~7 fps), the rifle shoots about 0.5 MOA, and the shooter\'s breathing moves the hold. In simulation a perfect shot is a 10 about 75% of the time at 300 m, 60% at 500 m, 30–40% at 1 km, 10–15% at 2 km and 3–6% at 3 km. The 2 km and 3 km targets are large steel plates (1.8 m and 3.9 m across), so even there a perfect shot still hits the plate about 85–96% of the time at 2 km and 70–93% at 3 km, depending on the caliber.')}</li>
  <li>${tr('Вологість на код не впливає.','Humidity does not affect the code.')}</li>
  <li>${tr('Можна не докручувати барабани: якщо бракує поправки, поставте мішень на поділку сітки на цю різницю (винос). Наприклад, бракує 0.7 міл підйому — мішень на поділці 0.7 нижче центру.','You don\'t have to dial everything: if the dial is short, put the target on the reticle mark at that difference (holdover). E.g. 0.7 mil elevation short — put the target on the 0.7 mark below center.')}</li>`;
}
 const dispTip=d=>tr('Порив ','Gust ')+sgn(d.gust,1)+tr(' м/с · швидкість ',' m/s · velocity ')+sgn(d.dv0,1)+tr(' м/с · розкид ',' m/s · spread ')+sgn(d.rand.x,2)+'/'+sgn(d.rand.y,2)+tr(' · рука ',' · hold ')+sgn(d.hold.x,2)+'/'+sgn(d.hold.y,2)+tr(' міл',' mil');
 function resultsHtml(){
  const series=state.series,shots=series.shots,n=shots.length,hits=shots.filter(v=>v.hit).length,total=series.scores.reduce((a,b)=>a+b,0),
   time=series.time,hpm=time>0?hits/(time/60000):0,rec=series.newRecord||{},R=40,E=54,fp=.25;
  const pick=(better)=>shots.reduce((b,v,i)=>better(v.ring,shots[b].ring)?i:b,0);
  const bi=pick((a,b)=>a>b),wi=pick((a,b)=>a<b);
  const badge=on=>on?` <span class="sniper-badge">${tr('Новий рекорд','New record')}</span>`:'';
  const cell=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const marks=shots.map((v,i)=>{
   const di=modeDistances[state.mode][i],t=tolerance[di],r10=ring10[di],e=Math.hypot(v.dx,v.dy),len=e||1,
    pr=(e<=r10?e/r10*fp:fp+(1-fp)*(e-r10)/(t-r10))*R, // radius on the plot: same 10-ring / 9-band layout for every distance
    k=(v.hit?pr:Math.min(E,Math.max(pr,R+4)))/len,x=(v.dx*k).toFixed(1),y=(-v.dy*k).toFixed(1);
   return v.hit?`<g transform="translate(${x} ${y})"><circle r="5.5" class="hit"/><text>${i+1}</text></g>`:
    `<g transform="translate(${x} ${y})" class="miss"><path d="M-4-4L4 4M4-4L-4 4"/><text x="8" y="-5">${i+1}</text></g>`;
  }).join('');
  const rings=Array.from({length:10},(_,j)=>`<circle r="${(R*(fp+(1-fp)*j/9)).toFixed(1)}"${j===9?' class="edge"':''}/>`).join('');
  const rows=shots.map((v,i)=>`<tr><td>${i+1}</td><td>${distLabel(distances[modeDistances[state.mode][i]])}</td><td>${v.ring}${v.hit?'':' ×'}</td><td>${(v.ms/1000).toFixed(1)} ${tr('с','s')}</td><td${v.disp?` title="${dispTip(v.disp)}"`:''}>${(Math.hypot(v.dx,v.dy)/10).toFixed(2)}</td></tr>`).join('');
  return `<dl class="sniper-stats">
    ${cell(tr('Влучань','Hits'),hits+'/'+n)}${cell(tr('Точність','Accuracy'),Math.round(100*hits/n)+'%')}
    ${cell(tr('Бали','Score'),total+'/'+maxScore+badge(rec.score))}${cell(tr('Час серії','Series time'),clock2(time))}
    ${cell(tr('Влучань за хвилину','Hits per minute'),hpm.toFixed(1)+badge(rec.hpm))}${cell(tr('Середній час пострілу','Average per shot'),(time/n/1000).toFixed(1)+' '+tr('с','s'))}
    ${cell(tr('Найкращий','Best shot'),'#'+(bi+1)+' · '+shots[bi].ring)}${cell(tr('Найгірший','Worst shot'),'#'+(wi+1)+' · '+shots[wi].ring)}
   </dl>
   <div class="sniper-results-body">
    <svg class="sniper-group" viewBox="-60 -60 120 120" width="120" height="120" role="img" aria-label="${tr('Розкид пострілів відносно допуску','Shot group relative to tolerance')}"><g class="rings">${rings}<path d="M-56 0H56M0-56V56"/></g>${marks}</svg>
    <table aria-label="${tr('Постріли серії','Series shots')}"><thead><tr><th scope="col">#</th><th scope="col">${tr('Дистанція','Distance')}</th><th scope="col">${tr('Кільце','Ring')}</th><th scope="col">${tr('Час','Time')}</th><th scope="col">${tr('Відхилення','Deviation')}</th></tr></thead><tbody>${rows}</tbody></table>
   </div>
   <p class="sniper-hint-note">${tr('Рекорд','Best')}: ${state.bestScore??0}/${maxScore} · ${(state.bestHpm??0).toFixed(1)} ${tr('влуч./хв','hits/min')}</p>`;
 }
 function render(){
  const conditions=weather[state.weather];
  const tutorial=state.tutorialDone!==true;
  const finalRound=!tutorial&&state.round===seriesSize-1;
  const caliber=calibers[state.profile];
  const tableRows=distances.map((d,i)=>'<tr'+(i===state.distance?' class="is-current"':'')+'><td>'+distLabel(d)+'</td><td>'+elevation(caliber,d).toFixed(1)+'</td><td>'+drift1(caliber,d).toFixed(2)+'</td></tr>').join('');
  const cur=curTab(),dragHint=tr('Перетягніть зображення, щоб навести мішень на сітку; колесо миші — кратність.','Drag the view to aim at the target; mouse wheel zooms.');
  const roundTitle=tutorial?tr('Навчальний раунд — спробуйте без балів','Tutorial round — practice, no score'):tr('Раунд ','Round ')+(state.round+1)+'/'+seriesSize;
  const pips=tutorial?'':Array.from({length:seriesSize},(_,i)=>{const v=state.series.scores[i];return`<li class="${v===undefined?(i===state.round?'is-now':''):v>0?'is-hit':'is-miss'}">${v??'·'}</li>`}).join('');
  const results=hasResults();
  const axisLabel=(axis,text)=>`<label class="sniper-axis"><span>${axis.toUpperCase()}</span><input type="range" min="${axis==='x'?-xMax:0}" max="${axis==='x'?xMax:yMax}" step="1" value="${state[axis]}" data-axis="${axis}" aria-label="${text}"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-number="${axis}" aria-label="${text}"></label>`;
  const tabDefs=[...results?[['results',tr('Результати','Results')]]:[],['table',tr('Таблиця','Table')],['method',tr('Як рахувати','How to solve')],['settings',tr('Налаштування','Settings')]];
  const panelAttrs=id=>`role="tabpanel" id="sniper-panel-${id}" aria-labelledby="sniper-tab-${id}" tabindex="0"${id===cur?'':' hidden'}`;
  root.innerHTML=`
   <header class="sniper-header"><div class="sniper-brand"><h1>${tr('Снайпер','Sniper')}</h1><small>POP SEASON</small></div>
    <nav>${languageButton()}<button data-autoplay aria-pressed="${ap.on}">${apLabel()}</button><button data-exit>${tr('Режими','Modes')}</button></nav>
   </header>
   <div class="sniper-layout">
    <section class="sniper-scene" aria-label="${tr('Вид в оптику','Scope view')}">
     <div class="sniper-stage">
      <div class="sniper-scope"><canvas width="${Math.round(viewSize*canvasScale())}" height="${Math.round(viewSize*canvasScale())}" aria-hidden="true" title="${dragHint}" aria-describedby="sniper-drag-desc"></canvas></div>
      <div class="sniper-hud sniper-hud-wind" aria-hidden="true">${compass(conditions).replace(/ /g,'')} ${flagPattern(conditions).replace(/ \/ /g,'/')}</div>
      <div class="sniper-hud sniper-hud-turret" aria-hidden="true"></div>
      ${ap.on?apPanel():''}
     </div>
     <div class="sniper-reticle" role="group" aria-label="${tr('Сітка','Reticle')}">${optics.map((label,i)=>`<button type="button" data-optic="${i}" aria-pressed="${i===state.optic}">${tr(...label)}</button>`).join('')}</div>
     <span id="sniper-drag-desc" class="sniper-sr">${dragHint}</span>
     <div class="sniper-pad" role="group" aria-label="${tr('Налаштування оптики','Scope adjustment')}">
      <button type="button" data-step="x" data-delta="-10" aria-label="${tr('X −1 міл','X −1 mil')}">«</button>
      <button type="button" data-step="x" data-delta="-1" aria-label="${tr('X −0,1 міл','X −0.1 mil')}">‹</button>
      <button type="button" data-step="x" data-delta="1" aria-label="${tr('X +0,1 міл','X +0.1 mil')}">›</button>
      <button type="button" data-step="x" data-delta="10" aria-label="${tr('X +1 міл','X +1 mil')}">»</button>
      <button type="button" data-step="y" data-delta="10" aria-label="${tr('Y +1 міл (підйом вгору)','Y +1 mil (elevation up)')}">⇈</button>
      <button type="button" data-step="y" data-delta="1" aria-label="${tr('Y +0,1 міл (підйом вгору)','Y +0.1 mil (elevation up)')}">↑</button>
      <button type="button" data-step="y" data-delta="-1" aria-label="${tr('Y −0,1 міл (підйом вниз)','Y −0.1 mil (elevation down)')}">↓</button>
      <button type="button" data-step="y" data-delta="-10" aria-label="${tr('Y −1 міл (підйом вниз)','Y −1 mil (elevation down)')}">⇊</button>
     </div>
    </section>
    <aside class="sniper-console">
     <section class="sniper-status">
      <div class="sniper-status-row"><h2 class="sniper-round-title">${roundTitle}</h2>
       <ul class="sniper-chips"><li>${distLabel(distances[state.distance])}</li><li>${caliber.name}</li></ul></div>
       ${tutorial?'':`<div class="sniper-series-row"><ul class="sniper-pips" aria-label="${tr('Бали за постріли','Shot scores')}">${pips}</ul><span class="sniper-timer" data-timer role="timer" aria-label="${tr('Час серії','Series time')}">00:00</span></div>`}
      <p class="sniper-result" role="status"></p>
     </section>
     <section class="sniper-conditions">
      <h2 class="sniper-label">${tr('Умови','Conditions')}</h2>
      <dl class="sniper-weather">
       <div><dt>${tr('Компас','Compass')}</dt><dd>${compass(conditions)}</dd></div>
       <div><dt>${tr('Вітер · прапорці','Wind · flags')}</dt><dd>${flagPattern(conditions)}</dd></div>
       <div><dt>${tr('Вологість','Humidity')}</dt><dd>${conditions.humidity}%</dd></div>
      </dl>
     </section>
     <section class="sniper-calculator">
      <h2 class="sniper-label">${tr('Барабани','Turrets')}</h2>
      <div class="sniper-zoom"><span>${tr('Кратність','Zoom')}</span><button type="button" data-zoom-step="-1" aria-label="${tr('Зменшити кратність','Zoom out')}">−</button><input type="range" min="${zoomMin}" max="${zoomMax}" step="1" value="${state.zoom}" data-zoom aria-label="${tr('Кратність','Magnification')}"><button type="button" data-zoom-step="1" aria-label="${tr('Збільшити кратність','Zoom in')}">+</button><output data-zoom-out></output></div>
      ${axisLabel('x',tr('Поправка за вітром X, міл','Windage X, mil'))}
      ${axisLabel('y',tr('Підйом Y, міл','Elevation Y, mil'))}
      <div class="sniper-hints">
       ${tutorial?'':`<button type="button" class="sniper-ghost" data-check-axis>${tr('Перевірити X','Check X')}</button>
       <button type="button" class="sniper-ghost" data-code aria-expanded="false" aria-controls="sniper-answer" hidden>${tr('Показати повний код','Show full code')}</button>`}
       <button type="button" class="sniper-ghost" data-calc-toggle aria-expanded="${calc.open}" aria-controls="sniper-calc">${tr('Калькулятор','Calculator')}</button>
      </div>
      ${tutorial?'':`<p data-axis-feedback role="status" hidden></p>
      <p id="sniper-answer" data-answer hidden></p>`}
     </section>
     <section class="sniper-tabs">
      <div class="sniper-tablist" role="tablist" aria-label="${tr('Довідка','Reference')}">${tabDefs.map(([id,label])=>`<button type="button" role="tab" id="sniper-tab-${id}" data-tab="${id}" aria-controls="sniper-panel-${id}" aria-selected="${id===cur}" tabindex="${id===cur?0:-1}">${label}</button>`).join('')}</div>
      ${results?`<div class="sniper-results sniper-tabpanel" ${panelAttrs('results')}>${resultsHtml()}</div>`:''}
      <div class="sniper-field-table sniper-tabpanel" ${panelAttrs('table')}>
       <table aria-label="${tr('Балістична таблиця','Ballistic table')}">
        <thead><tr><th scope="col">${tr('Дистанція','Distance')}</th><th scope="col">${tr('Підйом, міл','Elevation, mil')}</th><th scope="col">${tr('Знос на 1 м/с, міл','Drift per 1 m/s, mil')}</th></tr></thead>
        <tbody>${tableRows}</tbody>
       </table>
       <p>${tr('Таблиця для вибраного калібру. Ігровий світ: g = 10 м/с².','Table for the selected caliber. Game world: g = 10 m/s².')}</p>
      </div>
      <div class="sniper-method sniper-tabpanel" ${panelAttrs('method')}>
       <ol>${methodSteps()}</ol>
       ${tutorial?'':`<p class="sniper-hint-note">${tr('«Перевірити X» безкоштовна. Повний код або автогра знімають бал за раунд. У серії кожен постріл остаточний.','Check X is free. The full code or autoplay costs that round\'s point. In a series every shot is final.')}</p>`}
      </div>
      <div class="sniper-settings sniper-tabpanel" ${panelAttrs('settings')}>
       <label>${tutorial?tr('Режим','Mode'):tr('Дистанція','Distance')} <select data-distance aria-label="${tutorial?tr('Режим','Mode'):tr('Дистанція','Distance')}"></select></label>
       <label>${tr('Калібр','Caliber')} <select data-profile aria-label="${tr('Калібр','Caliber')}"></select></label>
      </div>
     </section>
     <div class="sniper-actions">
      <button type="button" class="sniper-fire" data-fire><span aria-hidden="true">⊕</span> ${tr('Постріл','Fire')}</button>
      <button type="button" class="sniper-next" data-next>${tutorial?tr('Почати серію','Start series'):finalRound?tr('Нова серія','New series'):tr('Наступний раунд','Next round')}</button>
     </div>
    </aside>
   </div>
   ${calcDrawer()}`;
  const scope=root.querySelector('.sniper-scope'),canvas=scope.querySelector('canvas');
  scopeRO?.disconnect();scopeRO=null;
  if(gl){
   scope.prepend(gl.canvas);
   const fit=()=>{try{gl.size(scope.clientWidth,scope.clientHeight);gl.draw(view())}catch(error){glFail(error)}};
   scopeRO=new ResizeObserver(fit);scopeRO.observe(scope);gl.size(scope.clientWidth,scope.clientHeight);
  }
  const turretHud=root.querySelector('.sniper-hud-turret');
  const sliders=[...root.querySelectorAll('[data-axis]')];
  const numbers=[...root.querySelectorAll('[data-number]')];
  const steps=[...root.querySelectorAll('[data-step]')];
  const settings=[...root.querySelectorAll('.sniper-settings select')];
  const opticButtons=[...root.querySelectorAll('[data-optic]')];
  const result=root.querySelector('.sniper-result');
  const next=root.querySelector('[data-next]');
  const fireButton=root.querySelector('[data-fire]');
  const feedback=root.querySelector('[data-axis-feedback]');
  const sol=solution(state),[targetX,targetY]=sol,tol=tolerance[state.distance];
  if(!tutorial){
   const codeButton=root.querySelector('[data-code]');
   const answer=root.querySelector('[data-answer]');
   root.querySelector('[data-check-axis]').onclick=()=>{
    takeover();
    feedback.hidden=false;
    feedback.textContent=Math.abs(targetX-state.x)<=tol?tr('Барабан X збігається.','X dial matches.'):tr('Барабан X ще не збігається.','X dial does not match yet.');
    codeButton.hidden=false;
   };
   codeButton.onclick=()=>{
    takeover();
    answer.hidden=!answer.hidden;
    codeButton.setAttribute('aria-expanded',String(!answer.hidden));
    codeButton.textContent=answer.hidden?tr('Показати повний код','Show full code'):tr('Сховати повний код','Hide full code');
    if(!answer.hidden){
     state.series.usedCode=true;save();
     answer.textContent=tr('Код мішені','Target code')+' · X '+signedMil(targetX)+' / Y '+mil(targetY);
    }
   };
  }

  function paint(){
   const complete=state.roundDone===true,shot=state.lastShot;
   drawScope(canvas,state,conditions,!!gl);
   if(gl){try{gl.draw(view());glStart()}catch(error){glFail(error)}}
   const zo=root.querySelector('[data-zoom-out]');if(zo)zo.textContent=state.zoom+'×';
   const zs=root.querySelector('[data-zoom]');if(zs)zs.value=state.zoom;
   for(const b of root.querySelectorAll('[data-zoom-step]'))b.disabled=state.zoom+Number(b.dataset.zoomStep)<zoomMin||state.zoom+Number(b.dataset.zoomStep)>zoomMax;
   paintTimer();
   if(turretHud)turretHud.innerHTML='X <b>'+signedMil(state.x)+'</b>&nbsp; Y <b>'+mil(state.y)+'</b>';
   for(const slider of sliders){
    slider.value=state[slider.dataset.axis];
    slider.disabled=complete;
   }
   for(const number of numbers){
    if(document.activeElement!==number)number.value=(state[number.dataset.number]/10).toFixed(1);
    number.disabled=complete;
   }
   for(const step of steps){
    const value=state[step.dataset.step];
    step.disabled=complete||clampAxis(step.dataset.step,value+Number(step.dataset.delta))===value;
   }
   for(const select of settings)select.disabled=complete||(!tutorial&&select.hasAttribute('data-distance'));
   for(const hint of root.querySelectorAll('[data-check-axis],[data-code]'))hint.disabled=complete;
   for(const button of opticButtons)button.disabled=complete;
   fireButton.disabled=complete||flying;fireButton.hidden=complete;
   next.disabled=!complete;next.hidden=!complete;
   result.dataset.won=String(complete);
   let message=notice||tr('Знайдіть мішень, виставте X та Y, наведіть і стріляйте','Find the target, set X and Y, aim, then fire');
   if(complete&&shot){
    if(finalRound){
     const total=state.series.scores.reduce((a,b)=>a+b,0),n=state.series.unassisted.filter(Boolean).length;
     message=tr('Серію завершено · ','Series complete · ')+total+'/'+maxScore+' · '+tr('без підказок ','unassisted ')+n+'/'+seriesSize+
      (state.bestScore===undefined?'':' · '+tr('Рекорд','Best')+': '+state.bestScore+'/'+maxScore);
    }else if(!tutorial)message=shot.ring?tr('Влучання · ','Hit · ')+shot.ring+tr(' очок',' pts'):tr('Промах · 0 очок','Miss · 0 pts');
    else message=tr('Влучання · ','Hit · ')+shot.ring+tr(' очок',' pts')+(shot.ring>shot.score?' − '+(shot.ring-shot.score)+tr(' за промахи',' for misses'):'')+' = '+shot.score;
   }
   if(result.textContent!==message)result.textContent=message;
   paintCalc();
  }
  function setAlignment(x,y,force){
   if(state.roundDone)return;
   x=clampAxis('x',x);y=clampAxis('y',y);
   if(x===state.x&&y===state.y)return;
   notice='';
   if(feedback&&x!==state.x){feedback.hidden=true;feedback.textContent=''}
   state.x=x;state.y=y;
   save();paint();
  }
  function setAim(x,y){
   if(state.roundDone)return;
   x=clampAim(Math.round(x));y=clampAim(Math.round(y));
   if(x===state.aim.x&&y===state.aim.y)return;
   state.aim={x,y};save();paint();
  }
  function setZoom(v,user=true){
   v=Math.max(zoomMin,Math.min(zoomMax,Math.round(v)));
   if(v===state.zoom)return;
   if(user)takeover();
   state.zoom=v;save();paint();
  }
  root.querySelector('[data-zoom]').oninput=event=>setZoom(Number(event.target.value));
  for(const b of root.querySelectorAll('[data-zoom-step]'))b.onclick=()=>setZoom(state.zoom+Number(b.dataset.zoomStep));
  let wheelAt=0;
  canvas.addEventListener('wheel',event=>{
   event.preventDefault();
   const now=performance.now();
   if(now-wheelAt<50||!event.deltaY)return;
   wheelAt=now;setZoom(state.zoom+(event.deltaY<0?1:-1));
  },{passive:false});
  for(const slider of sliders)slider.oninput=()=>{
   takeover();
   const value=Number(slider.value);
   if(slider.dataset.axis==='x')setAlignment(value,state.y);
   else setAlignment(state.x,value);
  };
  for(const slider of sliders)slider.onkeydown=event=>{
   const big=event.key==='PageUp'||event.shiftKey&&(event.key==='ArrowUp'||event.key==='ArrowRight')?10:
    event.key==='PageDown'||event.shiftKey&&(event.key==='ArrowDown'||event.key==='ArrowLeft')?-10:0;
   if(!big||event.ctrlKey||event.altKey||event.metaKey)return;
   takeover();
   event.preventDefault();
   if(slider.dataset.axis==='x')setAlignment(state.x+big,state.y);
   else setAlignment(state.x,state.y+big);
  };
  for(const number of numbers){
   const commit=()=>{
    takeover();
    const value=Math.round(parseFloat(number.value.trim().replace(/\s+/g,'').replace(/[−–—]/g,'-').replace(',','.'))*10);
    if(Number.isNaN(value))number.value=(state[number.dataset.number]/10).toFixed(1);
    else if(number.dataset.number==='x')setAlignment(value,state.y);
    else setAlignment(state.x,value);
    number.value=(state[number.dataset.number]/10).toFixed(1);
   };
   number.onchange=commit;
   number.onkeydown=event=>{if(event.key==='Enter')commit()};
  }
  for(const step of steps)step.onclick=()=>{
   takeover();
   const delta=Number(step.dataset.delta);
   if(step.dataset.step==='x')setAlignment(state.x+delta,state.y);
   else setAlignment(state.x,state.y+delta);
  };
  let drag=null;
  canvas.onpointerdown=event=>{
   takeover();
   if(event.button!==0||state.roundDone)return;
   drag={id:event.pointerId,left:event.clientX,top:event.clientY,x:state.aim.x,y:state.aim.y};
   dragging=true;canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove=event=>{
   if(drag?.id!==event.pointerId)return;
   const step=uOf(state.zoom)*canvas.clientWidth/viewSize/10; // px per tenth of a mil
   setAim(drag.x+Math.round((event.clientX-drag.left)/step),drag.y-Math.round((event.clientY-drag.top)/step));
  };
  canvas.onlostpointercapture=()=>{drag=null;dragging=false;if(pendingRender){pendingRender=false;render()}};
  for(const [field,labels] of [
   ['distance',tutorial?[tr('300 м','300 m'),tr('500 м','500 m'),tr('1–3 км','1–3 km')]:distances.map(distLabel)],
   ['profile',profiles]
  ]){
   const select=root.querySelector('[data-'+field+']');
   const key=field==='distance'&&tutorial?'mode':field;
   labels.forEach((label,i)=>select.add(new Option(label,String(i),false,i===state[key])));
   select.onchange=()=>{
    takeover();
    state[key]=Number(select.value);
    if(key==='mode')state.distance=modeDistances[state.mode][0];
    state.x=state.y=0;
    save();render();root.querySelector('[data-'+field+']').focus();
   };
  }
  opticButtons.forEach((button,i)=>button.onclick=()=>{
   takeover();
   state.optic=i;state.x=state.y=0;
   save();render();root.querySelector('[data-optic="'+i+'"]').focus();
  });
  const tabs=[...root.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab,i)=>{
   tab.onclick=()=>selectTab(tab.dataset.tab);
   tab.onkeydown=event=>{
    const n=event.key==='ArrowRight'?(i+1)%tabs.length:event.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
    if(n<0||event.ctrlKey||event.altKey||event.metaKey)return;
    event.preventDefault();selectTab(tabs[n].dataset.tab);tabs[n].focus();
   };
  });
  fireButton.onclick=()=>fire();
  next.onclick=()=>{takeover();nextRound();root.querySelector('[data-axis="x"]').focus({preventScroll:true})};
  root.querySelector('[data-exit]').onclick=changeSide;
  root.querySelector('[data-autoplay]').onclick=()=>{if(ap.on)stopAutoplay();else startAutoplay()};
  const pauseButton=root.querySelector('[data-autoplay-pause]');
  if(pauseButton)pauseButton.onclick=togglePause;
  align=setAlignment;aimer=setAim;zoomer=setZoom;
  bindCalc();
  root.querySelector('[data-language]').onclick=()=>document.querySelector('.lang').click();
  paint();
  paintAutoplay();
 }
 document.addEventListener('siege-language',()=>{if(dragging||flying)pendingRender=true;else render()});
 render();window.dispatchEvent(new Event('game-ready'));
 glLoad();
}


function drawScope(canvas,state,conditions,glMode){
 const c=canvas.getContext('2d'),size=viewSize,center=size/2,scale=canvas.width/viewSize,u=uOf(state.zoom);
 cssK=canvas.clientWidth>0?canvas.clientWidth/viewSize:1;
 c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,size,size);
 if(!glMode)drawFallback(c,state,conditions,size,center,u);
 const vignette=c.createRadialGradient(center,center,200,center,center,350);
 vignette.addColorStop(0,'#10170c00');vignette.addColorStop(1,'#071009a0');
 c.fillStyle=vignette;c.fillRect(0,0,size,size);
 c.globalAlpha=1;c.globalCompositeOperation='source-over';
 if(state.optic===0)drawTree(c,center,u);
 else if(state.optic===1)drawDot(c,center,u);
 else drawGrid(c,center,u);
}

// 2D painting of the range: only used until the WebGL view loads or when WebGL is unavailable.
function drawFallback(c,state,conditions,size,center,u){
 const polygon=(color,points)=>{
  c.fillStyle=color;c.beginPath();c.moveTo(...points[0]);
  for(const point of points.slice(1))c.lineTo(...point);
  c.closePath();c.fill();
 };
 const edge=2000,far=size+edge,k=state.zoom/10,tx=center+state.aim.x/10*u,ty=center-state.aim.y/10*u;
 c.save();
 c.translate(tx,ty);c.scale(k,k);c.translate(-center,-center); // scene geometry is authored around the target at (350,350)
 const sky=c.createLinearGradient(0,0,0,440);
 sky.addColorStop(0,'#354f52');sky.addColorStop(1,'#bfbc95');
 c.fillStyle=sky;c.fillRect(-edge,-edge,size+2*edge,size+2*edge);
 polygon('#83907b',[[-edge,317],[0,317],[120,249],[198,264],[309,222],[448,268],[574,218],[700,250],[far,250],[far,460],[-edge,460]]);
 polygon('#5a6e55',[[-edge,357],[0,357],[115,305],[211,320],[312,286],[437,323],[550,284],[700,320],[far,320],[far,490],[-edge,490]]);
 polygon('#536145',[[-edge,401],[0,401],[127,375],[287,391],[462,361],[602,379],[700,373],[far,373],[far,far],[-edge,far]]);
 polygon('#8d8057',[[322,385],[371,385],[595+edge*.71,far],[70-edge*.8,far]]);
 polygon('#75724f',[[339,388],[353,388],[475+edge*.39,far],[206-edge*.43,far]]);
 c.strokeStyle='#d7c99466';c.lineWidth=2;
 for(let i=0;i<4;i++){
  const y=416+i*i*19;
  c.beginPath();c.moveTo(313-i*29,y);c.lineTo(384+i*29,y);c.stroke();
 }

 conditions.flags.forEach((strength,i)=>{
  const x=185+i*165,y=415+(i%2)*55,dir=conditions.east?1:-1;
  c.strokeStyle='#292e22';c.lineWidth=3;
  c.beginPath();c.moveTo(x,y);c.lineTo(x,y-55);c.stroke();
  polygon('#f5ad53',[[x,y-55],[x+dir*(14+strength*10),y-53+3*(3-strength)],[x,y-37]]);
 });
 c.restore();
 // The target keeps its true angular size: ring 1 = hit tolerance in mil.
 const radius=tolerance[state.distance]/10*u,x=tx,y=ty;
 if(x>-100&&x<size+100&&y>-100&&y<size+100){
  c.fillStyle='#2b3025';c.fillRect(x-radius*.12,y+radius,radius*.24,radius*1.5);
  c.beginPath();c.arc(x,y,radius*1.3,0,Math.PI*2);c.fillStyle='#1d241b';c.fill();
  for(const [factor,color] of [[1,'#ded4a6'],[.76,'#3b4c45'],[.48,'#ded4a6'],[.23,'#d87249']]){
   c.beginPath();c.arc(x,y,radius*factor,0,Math.PI*2);c.fillStyle=color;c.fill();
  }
 }
}

// ---- reticle level of detail: thresholds are on-screen px so marks never crowd or overlap ----
const skip=(spacing,u)=>{let m=1;while(spacing*m*u<6&&m<64)m*=2;return m}; // keep every m-th dot so dots stay >= 6 px apart
const lstep=(base,u)=>{for(const s of [1,2,4,5,10,20])if(s>=base&&s*u>=21.9)return s;return 0}; // mil step between labels, 0 = no labels
const lidx=spacing=>{for(const m of [1,2,3,4,5])if(m*spacing>=21.9)return m;return 0}; // every m-th labeled mark, 0 = none
const halo='#e8e4c81f',tHalo='#e8e4c840',ink='#0b100c',pTau=Math.PI*2;
let cssK=1; // CSS px per view unit (scope is CSS-scaled; canvas DPR is already in the context transform)
// Collects the reticle, then paints every halo first and the dark ink on top, so halos never cover neighbouring lines.
function pen(c){
 const lines=new Map(),dots=new Map(),texts=[];
 const out=(x,y,r)=>Math.hypot(x-viewSize/2,y-viewSize/2)>viewSize/2+r;
 return{
  line(x1,y1,x2,y2,lw=1){
   if(Math.max(x1,x2)<-10||Math.min(x1,x2)>710||Math.max(y1,y2)<-10||Math.min(y1,y2)>710)return;
   if(lw<=1.4)lw=1.4/cssK;
   let p=lines.get(lw);if(!p)lines.set(lw,p=new Path2D());p.moveTo(x1,y1);p.lineTo(x2,y2);
  },
  dot(x,y,r=1.1){
   if(out(x,y,5))return;
   r=Math.max(r,1.4/cssK);
   let d=dots.get(r);if(!d)dots.set(r,d={ink:new Path2D(),halo:new Path2D()});
   d.ink.moveTo(x+r,y);d.ink.arc(x,y,r,0,pTau);d.halo.moveTo(x+r+.5/cssK,y);d.halo.arc(x,y,r+.5/cssK,0,pTau);
  },
  text(t,x,y,font,align='center',base='middle'){if(!out(x,y,20))texts.push([t,x,y,font.startsWith('600')?font:'600 '+font,align,base])},
  flush(){
   c.save();c.globalAlpha=1;c.globalCompositeOperation='source-over';c.lineCap='butt';c.lineJoin='round';
   c.strokeStyle=halo;for(const [lw,p] of lines){c.lineWidth=lw+1/cssK;c.stroke(p)}
   c.fillStyle=halo;for(const d of dots.values())c.fill(d.halo);
   c.strokeStyle=ink;for(const [lw,p] of lines){c.lineWidth=lw;c.stroke(p)}
   c.fillStyle=ink;for(const d of dots.values())c.fill(d.ink);
   c.lineWidth=2/cssK;
   for(const [t,x,y,font,align,base] of texts){c.font=font;c.textAlign=align;c.textBaseline=base;c.strokeStyle=tHalo;c.strokeText(t,x,y);c.fillStyle=ink;c.fillText(t,x,y)}
   c.restore();
  }
 };
}

function drawGrid(c,center,u){
 const cx=center,cy=center,p=pen(c),{line,dot,text}=p,w=k=>Math.round(1.5+k*0.95);
 const half=u/2>=5,one=u>=4,dm=skip(.5,u),rm=skip(1,u),lx=lstep(2,u),ly=lstep(1,u),font='10px system-ui';
 const thickH=(a,b)=>{if(b>a)line(a,cy,b,cy,7)},thickV=(a,b)=>{if(b>a)line(cx,a,cx,b,7)};
 const len=i=>i%10===0?6:i%2===0?4:2,shown=i=>i%10===0||(i%2?half:one);
 for(let k=1;k<=10;k++){
  if(k%rm&&!(ly&&k%ly===0))continue;
  const y=cy+k*u;
  for(let i=2;i<=2*w(k);i++)for(const s of [-1,1]){
   const x=cx+s*i*u/2;
   if(i===4)line(x,y-3,x,y+3,1);else if(i%dm===0)dot(x,y,1.1);
  }
 }
 line(cx-15*u,cy,cx-3,cy);line(cx+3,cy,cx+15*u,cy);
 line(cx,cy-3,cx,cy-10*u);line(cx,cy+3,cx,cy+10*u);
 for(let i=1;i<=30;i++)if(shown(i))for(const s of [-1,1]){const x=cx+s*i*u/2,l=len(i);line(x,cy-l,x,cy+l)}
 for(let i=1;i<=20;i++)if(i%2?half:one)for(const s of [-1,1]){const y=cy+s*i*u/2,l=i%2?2:4;line(cx-l,y,cx+l,y)}
 thickH(30,cx-15*u);thickH(cx+15*u,670);
 thickV(30,cy-10.5*u);thickV(cy+10.5*u,670);
 if(lx)for(let n=1;n<=14;n++)if(n%lx===0)for(const s of [-1,1])text(String(n),cx+s*n*u,cy-9,font,'center','bottom');
 if(ly)for(let k=2;k<=10;k++)if(k%ly===0)text(String(k),cx+8,cy-k*u,font,'left');
 if(ly)for(let k=1;k<=10;k++){
  if(k%ly)continue;
  const y=cy+k*u,x=(w(k)+0.9)*u;
  text(String(k),cx-x,y,font,'right');text(String(k),cx+x,y,font,'left');
 }
 dot(cx,cy,1.6);
 p.flush();
}

function drawDot(c,center,u){
 const cx=center,cy=center,p=pen(c),{line,dot,text}=p,w=k=>Math.round(3+k*0.7);
 const half=u/2>=5,one=u>=4,rm=skip(1,u),lx=lstep(2,u),font='11px system-ui';
 const thickH=(a,b)=>{if(b>a)line(a,cy,b,cy,7)},thickV=(a,b)=>{if(b>a)line(cx,a,cx,b,7)};
 for(let k=1;k<=20;k++){
  if(k%rm&&!(lx&&k%lx===0))continue;
  const n=Math.round(w(k)*(k%2?1:2))-(k%2?1:2)+1,st=k%2?u:u/2,m=skip(st/u,u);
  for(let j=0;j<n;j++)if(j%m===0||j===n-1)for(const s of [-1,1])dot(cx+s*(u+j*st),cy+k*u,j>=n-2?1.8:1.1);
 }
 line(cx-16*u,cy,cx-4,cy);line(cx+4,cy,cx+16*u,cy);
 line(cx,cy-4,cx,cy-18*u);line(cx,cy+4,cx,cy+20*u);
 for(let i=1;i<=20;i++)if(i%10===0||(i%2?half:one))for(const s of [-1,1]){const x=i*u/2,l=i%2?2:4;line(cx+s*x,cy-l,cx+s*x,cy+l)}
 for(let i=1;i<=40;i++)if(i%10===0||(i%2?half:one)){const y=cy+i*u/2,l=i%2?2:4;line(cx-l,y,cx+l,y)}
 if(lx){
  for(let n=1;n<=10;n++)if(n%lx===0)for(const s of [-1,1])text(String(n),cx+s*n*u,cy-8,font,'center','bottom');
  for(let k=1;k<=20;k++)if(k%lx===0)text(String(k),cx+(w(k)+1.2)*u,cy+k*u,font,'left');
 }
 if(u>=8)text('MIL',cx+11*u,cy+8,font,'left','top');
 thickH(30,cx-16*u);thickH(cx+16*u,670);
 thickV(30,cy-18*u);thickV(cy+20*u,670);
 dot(cx,cy,1.8);
 p.flush();
}

function drawTree(c,center,u){
 const cx=center,cy=center,p=pen(c),{line,dot,text}=p,w=k=>Math.round(2+1.6*k);
 const half=u/2>=5,one=u>=4,dm=skip(1,u),dm2=skip(2,u),lx=lstep(5,u),lm=lidx(2*u);
 const thickH=(a,b)=>{if(b>a)line(a,cy,b,cy,7)},thickV=(a,b)=>{if(b>a)line(cx,a,cx,b,7)};
 thickH(30,cx-21*u);thickH(cx+21*u,670);
 line(cx-21*u,cy,cx+21*u,cy,1.2);
 for(let i=-20;i<=20;i++){
  if(!i)continue;
  const x=cx+i*u,five=!(i%5),l=five?5:2;
  if(five||one)line(x,cy-l,x,cy+l,1.2);
  if(five&&lx&&Math.abs(i)%lx===0)text(String(Math.abs(i)),x,cy-10,'600 12px system-ui');
  if(!(i%2)&&Math.abs(i/2)%dm2===0)dot(x,cy+1.5*u,1.6);
 }
 line(cx,cy,cx,cy-14*u,1.2);
 for(let i=1;i<=14;i++){
  const y=cy-i*u,five=!(i%5),l=five?5:2;
  if(five||one)line(cx-l,y,cx+l,y,1.2);
  if(five&&lx&&i%lx===0)text(String(i),cx+8,y,'600 12px system-ui','left');
 }
 for(const s of [-1,1]){
  for(const m of [5,10]){
   const x=cx+s*m*u;
   line(x,cy-5*u,x,cy-2*u,4);
   if(lx&&m%lx===0)text(String(m),x,cy-5.6*u,'11px system-ui','center','bottom');
  }
  for(let m=5.5;m<10;m+=.5)if(m%1?half:one){const x=cx+s*m*u;line(x,cy-3.5*u,x,cy-2*u,1.2)}
 }
 for(let m=2;m<=14;m+=2){
  let deep=0;
  for(let k=1;k<=7;k++)if(w(k)>=m)deep=k;
  if(deep)for(const s of [-1,1])line(cx+s*m*u,cy+2*u,cx+s*m*u,cy+deep*2*u,1.2);
 }
 for(let k=1;k<=7;k++){
  const y=cy+k*2*u,wk=w(k);
  for(const s of [-1,1]){
   line(cx+s*2*u,y,cx+s*wk*u,y,1.2);
   for(let m=2;m<=wk;m++)if(m%dm===0)dot(cx+s*m*u,y,1.6);
  }
  if(lm&&k%lm===0){
   text(String(k*2),cx,y,'600 12px system-ui');
   text('H'+k,cx-(wk+1.2)*u,y,'11px system-ui','right');
   text('H'+k,cx+(wk+1.2)*u,y,'11px system-ui','left');
  }
  if(k<7&&one)line(cx-3,y+u,cx+3,y+u,1.2);
 }
 for(const s of [-1,1])for(let m=2;m<=w(8);m++)if(m%dm===0)dot(cx+s*m*u,cy+16*u,1.6);
 thickV(cy+17.5*u,670);
 if(u>=8)text('MRAD',cx-16*u,cy+3.5*u,'11px system-ui');
 p.flush();
}

// WebGL range view. Magnification = vertical field of view (so the reticle mil scale is exact), aim = camera rotation.
function createGL(T,buildWorld){
 const canvas=document.createElement('canvas');canvas.className='sniper-gl';canvas.setAttribute('aria-hidden','true');
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,logarithmicDepthBuffer:true});
 if(!renderer.getContext())throw new Error('no gl');
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 const camera=new T.PerspectiveCamera(10,1,.5,4500),aimAt=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3();
 camera.position.set(0,1.5,0);
 let world=null,key='';
 return{canvas,
  size(w,h){if(w>0&&h>0)renderer.setSize(w,h,false)},
  draw(state){
   const D=distances[state.distance],w=weather[state.weather],tol=tolerance[state.distance],next=D+'|'+state.weather+'|'+tol+'|'+ring10[state.distance];
   if(next!==key){ // distance, weather or target size changed
    world?.dispose();world=null;
    world=buildWorld(T,{distance:D,wind:{east:w.east,flags:w.flags},targetRadiusM:tol/10*D/1000,ring10:ringFrac(state.distance)});key=next;
    renderer.setClearColor(world.clearColor);
   }
   camera.fov=2*Math.atan(viewSize/2/uOf(state.zoom)/1000)*180/Math.PI;camera.updateProjectionMatrix();
   camera.lookAt(world.targetCenter);camera.updateMatrixWorld();
   right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
   // the target must sit at +aim from the reticle centre, so the camera looks at -aim from the target (metres per tenth mil at D)
   const m=D/10000;
   aimAt.copy(world.targetCenter).addScaledVector(right,-state.aim.x*m).addScaledVector(up,-state.aim.y*m);
   camera.lookAt(aimAt);
   renderer.render(world.scene,camera);
  },
  update(dt){world?.update(dt)},
  dispose(){world?.dispose();world=null;renderer.dispose();renderer.forceContextLoss()}
 };
}
