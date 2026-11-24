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
const distances=[1000,2000,3000];
const tolerance=[5,3,2]; // hit tolerance in tenths of a mil, by distance index
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
const validSeries=s=>!!s&&typeof s==='object'&&Array.isArray(s.rounds)&&s.rounds.length===seriesSize&&s.rounds.every(i=>validIndex(i,weather.length))&&
 Array.isArray(s.unassisted)&&s.unassisted.length<=seriesSize&&s.unassisted.every(v=>typeof v==='boolean')&&typeof s.usedCode==='boolean';
const viewSize=700;
const canvasScale=()=>Math.min(2,window.devicePixelRatio||1);
const panStep=22;
const seriesSize=3;
const clampAxis=(axis,value)=>axis==='x'?Math.max(-xMax,Math.min(xMax,value)):Math.max(0,Math.min(yMax,value));
const initial=()=>({distance:0,optic:0,profile:0,weather:0,x:0,y:0});
const mil=value=>(Math.abs(value)/10).toFixed(1);
const signedMil=value=>value<0?'−'+mil(value):value>0?'+'+mil(value):mil(0);

const compass=conditions=>conditions.east?'W → E':'E → W';
const flagPattern=conditions=>conditions.flags.map(flag=>(conditions.east?'›':'‹').repeat(flag)).join(' / ');

function solution(state,weatherIndex=state.weather){
 const c=calibers[state.profile],x=distances[state.distance],w=weather[weatherIndex];
 return [Math.round(-(w.east?1:-1)*drift1(c,x)*windSpeed(w)*10)+0,Math.round(elevation(c,x)*10)];
}

export function startSniper(){
 const state=saved&&validIndex(saved.distance,3)&&validIndex(saved.optic,optics.length)&&validIndex(saved.profile,profiles.length)&&
  validIndex(saved.weather,weather.length)&&Number.isInteger(saved.x)&&Math.abs(saved.x)<=xMax&&Number.isInteger(saved.y)&&saved.y>=0&&saved.y<=yMax?{...saved}:initial();
 // Saves from before the round index existed used distance as the round.
 if(state.round===undefined&&validSeries(state.series)&&validIndex(state.distance,seriesSize))state.round=state.distance;
 if(state.best!==undefined&&!(Number.isInteger(state.best)&&state.best>=0&&state.best<=seriesSize))delete state.best;
 const root=document.createElement('main');
 root.className='sniper-board';document.body.append(root);
 const save=()=>write(saveKey,state);
 let dragging=false,pendingRender=false;

 // Autoplay: a single controller; every timed action goes through schedule() so pause/resume can freeze it.
 let align=()=>{};
 const ap={on:false,paused:false,step:0,timer:0,remaining:0,startedAt:0,fn:null};
 const finalNow=()=>state.tutorialDone===true&&state.round===seriesSize-1;
 const solved=()=>{const [a,b]=solution(state),t=tolerance[state.distance];return Math.abs(a-state.x)<=t&&Math.abs(b-state.y)<=t};
 const hold=text=>Math.max(3500,Math.min(9000,1800+45*text.length));
 const apSteps=()=>{
  const w=weather[state.weather],c=calibers[state.profile],dk=distances[state.distance],sp=w.flags.map(f=>f*2),wind=windSpeed(w),
   e=elevation(c,dk),k=drift1(c,dk),[sx,sy]=solution(state),last=finalNow();
  return [
   {mark:'weather',text:tr('Читаю прапорці: ','Reading the flags: ')+flagPattern(w)+'. '+tr('Кожна риска — 2 м/с, тож це ','Each mark is 2 m/s, so that is ')+sp.join(', ')+tr(' м/с.',' m/s.')},
   {mark:'weather',text:tr('Вітер уздовж траси різний, беру середнє: ','Wind varies along the range, so I take the average: ')+'('+sp.join(' + ')+') / 3 = '+wind.toFixed(1)+tr(' м/с.',' m/s.')},
   {mark:'weather',text:w.east?tr('Вітер дме W → E і зносить кулю праворуч. Щоб компенсувати, X має бути від’ємним — ціль лівіше.','The wind blows W → E and pushes the bullet right. To compensate, X must be negative — aim left.'):
    tr('Вітер дме E → W і зносить кулю ліворуч. Щоб компенсувати, X має бути додатним — ціль правіше.','The wind blows E → W and pushes the bullet left. To compensate, X must be positive — aim right.')},
   {mark:'table',text:tr('Таблиця для ','Table for ')+c.name+', '+dk/1000+tr(' км: підйом ',' km: elevation ')+e.toFixed(1)+tr(' міл, знос ',' mil, drift ')+k.toFixed(2)+tr(' міл на кожен 1 м/с бокового вітру.',' mil per 1 m/s of crosswind.')},
   {mark:'y',text:tr('Куля падає під дією тяжіння (у світі гри g = 10 м/с²), тому ствол піднімаємо: Y = ','The bullet drops under gravity (g = 10 m/s² in the game world), so we raise the barrel: Y = ')+mil(sy)+tr(' міл.',' mil.')},
   {mark:'x',text:'X = '+k.toFixed(2)+' × '+wind.toFixed(1)+' ≈ '+signedMil(sx)+tr(' міл. Чим довше куля летить, тим більше її зносить.',' mil. The longer the flight, the more the wind carries it.')},
   {mark:'y',dial:'y',text:tr('Кручу барабан підйому до ','Dialing elevation to ')+mil(sy)+tr(' міл.',' mil.')},
   {mark:'x',dial:'x',text:tr('Кручу барабан вітру до ','Dialing windage to ')+signedMil(sx)+tr(' міл.',' mil.')},
   {mark:null,text:tr('Мітка в центрі сітки — постріл влучить. ','Target is under the reticle center — the shot will hit. ')+(last?tr('Серію завершено.','Series complete.'):tr('Переходжу до наступного раунду.','Moving to the next round.'))},
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
  if(s.mark==='table')root.querySelector('.sniper-field-table').open=true;
  const el=s.mark==='x'||s.mark==='y'?root.querySelector('[data-axis="'+s.mark+'"]')?.closest('.sniper-axis'):
   s.mark==='weather'?root.querySelector('.sniper-weather'):s.mark==='table'?root.querySelector('tr.is-current'):null;
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
 const takeover=()=>{if(ap.on)stopAutoplay()};
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
 function runStep(){
  paintAutoplay();
  const wait=()=>schedule(advance,hold(apSteps()[ap.step].text));
  const s=apSteps()[ap.step];
  if(s.dial)dial(s.dial,wait);else wait();
 }
 function advance(){
  if(ap.step<8){ap.step++;runStep();return}
  if(finalNow()){stopAutoplay();return}
  nextRound();
  if(state.tutorialDone===true){state.series.usedCode=true;save()}
  ap.step=solved()?8:0;
  runStep();
 }
 function startAutoplay(){
  ap.on=true;ap.paused=false;ap.fn=null;
  if(state.tutorialDone===true){state.series.usedCode=true;save()}
  ap.step=solved()?8:0;
  render();root.querySelector('[data-autoplay]').focus();
  runStep();
 }

 function startSeries(){
  const rounds=[];
  let previous=state.weather;
  while(rounds.length<seriesSize){
   const available=weather.flatMap((entry,index)=>entry.east!==weather[previous].east&&!rounds.includes(index)?[index]:[]);
   previous=available[Math.floor(Math.random()*available.length)];
   rounds.push(previous);
  }
  state.series={rounds,unassisted:[],usedCode:false};
  state.round=0;
  state.distance=0;
  state.weather=rounds[0];
  state.x=state.y=0;
 }

 // Restart the series when its saved history is missing, corrupt or out of step with the round.
 if(state.tutorialDone===true&&(!validSeries(state.series)||!validIndex(state.round,seriesSize)||state.distance!==Math.min(state.round,2)||
  state.weather!==state.series.rounds[state.round]||state.series.unassisted.length!==state.round)){startSeries();save()}

 function nextRound(){
  if(state.tutorialDone!==true||state.round===seriesSize-1){
   state.tutorialDone=true;
   startSeries();
  }else{
   state.series.unassisted.push(!state.series.usedCode);
   state.series.usedCode=false;
   state.round++;
   state.distance=Math.min(state.round,2);
   state.weather=state.series.rounds[state.round];
   state.x=state.y=0;
  }
  save();render();
 }
 function render(){
  const conditions=weather[state.weather];
  const tutorial=state.tutorialDone!==true;
  const finalRound=!tutorial&&state.round===seriesSize-1;
  const caliber=calibers[state.profile];
  const tableRows=distances.map((d,i)=>'<tr'+(i===state.distance?' class="is-current"':'')+'><td>'+d/1000+' '+tr('км','km')+'</td><td>'+elevation(caliber,d).toFixed(1)+'</td><td>'+drift1(caliber,d).toFixed(2)+'</td></tr>').join('');
  root.innerHTML=`
   <header class="sniper-header"><div><small>POP SEASON</small><h1>${tr('Снайпер','Sniper')}</h1></div>
    <nav>${languageButton()}<button data-autoplay aria-pressed="${ap.on}">${apLabel()}</button><button data-exit>${tr('Режими','Modes')}</button></nav>
   </header>
   <div class="sniper-layout">
    <section class="sniper-scene" aria-label="${tr('Вид в оптику','Scope view')}">
     <div class="sniper-scope"><canvas width="${Math.round(viewSize*canvasScale())}" height="${Math.round(viewSize*canvasScale())}" aria-hidden="true"></canvas></div>
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
     <p class="sniper-drag-hint">${tr('Перетягніть зображення, щоб налаштувати X та Y.','Drag the view to adjust X and Y.')}</p>
    </section>
    <aside class="sniper-console">
     ${tutorial?`<section class="sniper-tutorial" aria-labelledby="sniper-lesson-title">
      <h2 id="sniper-lesson-title">${tr('Навчальний раунд','Tutorial round')}</h2>
      <ol>
       <li>${tr('Кожен прапорець: › = 2 м/с, ›› = 4 м/с, ››› = 6 м/с. Вітер — середнє трьох.','Each flag: › = 2 m/s, ›› = 4 m/s, ››› = 6 m/s. Wind is the average of the three.')}</li>
       <li>${tr('Y = підйом з таблиці для вашої дистанції.','Y = elevation from the table for your distance.')}</li>
       <li>${tr('X = знос на 1 м/с × вітер. Вітер W → E зносить праворуч, тож X від’ємний.','X = drift per 1 m/s × wind. A W → E wind pushes right, so X is negative.')}</li>
       <li>${tr('Вологість на код не впливає.','Humidity does not affect the code.')}</li>
      </ol>
     </section>`:`<div>
      <h2 class="sniper-round-title">${tr('Раунд ','Round ')}${state.round+1}${tr(' з ',' of ')}${seriesSize}</h2>
      <p class="sniper-instructions">${tr('Виставте підйом і поправку на вітер або винесіть точку прицілювання за сіткою.','Dial elevation and windage, or hold over using the reticle.')}</p>
     </div>`}
     ${ap.on?apPanel():''}
     <div class="sniper-settings">
      <label>${tr('Дистанція','Distance')} <select data-distance aria-label="${tr('Дистанція','Distance')}"></select></label>
      <label>${tr('Сітка','Reticle')} <select data-optic aria-label="${tr('Сітка','Reticle')}"></select></label>
      <label>${tr('Калібр','Caliber')} <select data-profile aria-label="${tr('Калібр','Caliber')}"></select></label>
     </div>
     <dl class="sniper-weather">
      <div><dt>${tr('Компас','Compass')}</dt><dd>${compass(conditions)}</dd></div>
      <div><dt>${tr('Вологість','Humidity')}</dt><dd>${conditions.humidity}%</dd></div>
      <div><dt>${tr('Вітер · прапорці','Wind · flags')}</dt><dd>${flagPattern(conditions)}</dd></div>
     </dl>
     <details class="sniper-field-table"${tutorial?' open':''}>
      <summary>${tr('Ігрова таблиця','Game table')}</summary>
      <p>${tr('Таблиця для вибраного калібру. Ігровий світ: g = 10 м/с².','Table for the selected caliber. Game world: g = 10 m/s².')}</p>
      <table aria-label="${tr('Балістична таблиця','Ballistic table')}">
       <thead><tr><th scope="col">${tr('Дистанція','Distance')}</th><th scope="col">${tr('Підйом, міл','Elevation, mil')}</th><th scope="col">${tr('Знос на 1 м/с, міл','Drift per 1 m/s, mil')}</th></tr></thead>
       <tbody>${tableRows}</tbody>
      </table>
     </details>
     <section class="sniper-calculator">
      <h2>${tr('Калькулятор гри','Game calculator')}</h2>
      <label class="sniper-axis"><span>X</span><input type="range" min="${-xMax}" max="${xMax}" step="1" value="${state.x}" data-axis="x" aria-label="${tr('Поправка за вітром X, міл','Windage X, mil')}"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-number="x" aria-label="${tr('Поправка за вітром X, міл','Windage X, mil')}"></label>
      <label class="sniper-axis"><span>Y</span><input type="range" min="0" max="${yMax}" step="1" value="${state.y}" data-axis="y" aria-label="${tr('Підйом Y, міл','Elevation Y, mil')}"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-number="y" aria-label="${tr('Підйом Y, міл','Elevation Y, mil')}"></label>
      ${tutorial?'':`<div class="sniper-hints">
       <button type="button" data-check-axis>${tr('Перевірити X','Check X')}</button>
       <button type="button" data-code aria-expanded="false" aria-controls="sniper-answer" hidden>${tr('Показати повний код','Show full code')}</button>
      </div>
      <p class="sniper-hint-note">${tr('«Перевірити X» безкоштовна. Повний код або автогра знімають бал за раунд.','Check X is free. The full code or autoplay costs that round\'s point.')}</p>
      <p data-axis-feedback role="status" hidden></p>
      <p id="sniper-answer" data-answer hidden></p>`}
     </section>
     <p class="sniper-result" role="status"></p>
     <button class="sniper-next" data-next>${tutorial?tr('Почати серію','Start series'):finalRound?tr('Нова серія','New series'):tr('Наступний раунд','Next round')}</button>
    </aside>
   </div>`;
  const canvas=root.querySelector('canvas');
  const sliders=[...root.querySelectorAll('[data-axis]')];
  const numbers=[...root.querySelectorAll('[data-number]')];
  const steps=[...root.querySelectorAll('[data-step]')];
  const settings=[...root.querySelectorAll('.sniper-settings select')];
  const result=root.querySelector('.sniper-result');
  const next=root.querySelector('[data-next]');
  const feedback=root.querySelector('[data-axis-feedback]');
  const sol=solution(state),[targetX,targetY]=sol,tol=tolerance[state.distance];
  const hit=()=>Math.abs(targetX-state.x)<=tol&&Math.abs(targetY-state.y)<=tol;
  if(!tutorial){
   const codeButton=root.querySelector('[data-code]');
   const answer=root.querySelector('[data-answer]');
   root.querySelector('[data-check-axis]').onclick=()=>{
    takeover();
    feedback.hidden=false;
    feedback.textContent=Math.abs(targetX-state.x)<=tol?tr('X збігається.','X matches.'):tr('X ще не збігається.','X does not match yet.');
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
   const complete=hit();
   drawScope(canvas,state,conditions,sol);
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
   next.disabled=!complete;
   result.dataset.won=String(complete);
   const unassisted=finalRound&&complete?state.series.unassisted.filter(Boolean).length+Number(!state.series.usedCode):0;
   if(complete&&finalRound&&unassisted>(state.best??-1)){state.best=unassisted;save()}
   const message=complete&&finalRound?
    tr('Серію завершено · без повного коду: ','Series complete · solved without the full code: ')+unassisted+'/'+seriesSize+
    (state.best===undefined?'':' · '+tr('Рекорд','Best')+': '+state.best+'/'+seriesSize):
    complete?tr('Перемога · мішень у центрі','Victory · target aligned'):
    tr('Налаштуйте X та Y','Adjust X and Y');
   if(result.textContent!==message)result.textContent=message;
  }
  function setAlignment(x,y,force){
   if(!force&&hit())return;
   x=clampAxis('x',x);y=clampAxis('y',y);
   if(x===state.x&&y===state.y)return;
   if(feedback&&x!==state.x){feedback.hidden=true;feedback.textContent=''}
   state.x=x;state.y=y;
   save();paint();
   const focused=document.activeElement;
   if(hit()&&(focused===document.body||focused?.disabled))next.focus();
  }
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
   if(event.pointerType==='touch'||event.button!==0||hit())return;
   drag={id:event.pointerId,left:event.clientX,top:event.clientY,x:state.x,y:state.y};
   dragging=true;canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove=event=>{
   if(drag?.id!==event.pointerId)return;
   const step=panStep/2*canvas.clientWidth/viewSize/10; // px per tenth of a mil
   setAlignment(drag.x-Math.round((event.clientX-drag.left)/step),drag.y+Math.round((event.clientY-drag.top)/step));
  };
  canvas.onlostpointercapture=()=>{drag=null;dragging=false;if(pendingRender){pendingRender=false;render()}};
  for(const [field,labels] of [
   ['distance',[1,2,3].map(n=>n+' '+tr('км','km'))],
   ['optic',optics.map(label=>tr(...label))],['profile',profiles]
  ]){
   const select=root.querySelector('[data-'+field+']');
   labels.forEach((label,i)=>select.add(new Option(label,String(i),false,i===state[field])));
   select.onchange=()=>{
    takeover();
    state[field]=Number(select.value);
    state.x=state.y=0;
    save();render();root.querySelector('[data-'+field+']').focus();
   };
  }
  next.onclick=()=>{takeover();nextRound();root.querySelector('[data-axis="x"]').focus()};
  root.querySelector('[data-exit]').onclick=changeSide;
  root.querySelector('[data-autoplay]').onclick=()=>{if(ap.on)stopAutoplay();else startAutoplay()};
  const pauseButton=root.querySelector('[data-autoplay-pause]');
  if(pauseButton)pauseButton.onclick=togglePause;
  align=setAlignment;
  root.querySelector('[data-language]').onclick=()=>document.querySelector('.lang').click();
  paint();
  paintAutoplay();
 }
 document.addEventListener('siege-language',()=>{if(dragging)pendingRender=true;else render()});
 render();window.dispatchEvent(new Event('game-ready'));
}

function drawScope(canvas,state,conditions,[solX,solY]){
 const c=canvas.getContext('2d'),size=viewSize,center=size/2,scale=canvas.width/viewSize;
 c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,size,size);
 const polygon=(color,points)=>{
  c.fillStyle=color;c.beginPath();c.moveTo(...points[0]);
  for(const point of points.slice(1))c.lineTo(...point);
  c.closePath();c.fill();
 };
 const edge=360,far=size+edge,u=panStep/2,limit=340;
 c.save();
 c.translate(Math.max(-limit,Math.min(limit,(solX-state.x)/10*u)),Math.max(-limit,Math.min(limit,(state.y-solY)/10*u)));
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
 const radius=[26,20,15][state.distance];
 const x=center,y=center;
 c.fillStyle='#2b3025';c.fillRect(x-3,y+radius,6,30);
 for(const [factor,color] of [[1,'#ded4a6'],[.76,'#3b4c45'],[.48,'#ded4a6'],[.23,'#d87249']]){
  c.beginPath();c.arc(x,y,radius*factor,0,Math.PI*2);c.fillStyle=color;c.fill();
 }
 c.restore();
 const vignette=c.createRadialGradient(center,center,200,center,center,350);
 vignette.addColorStop(0,'#10170c00');vignette.addColorStop(1,'#071009a0');
 c.fillStyle=vignette;c.fillRect(0,0,size,size);
 c.strokeStyle='#172018';c.lineWidth=2;
 if(state.optic===0)drawTree(c,center);
 else if(state.optic===1)drawDot(c,center);
 else drawGrid(c,center);
}

function drawGrid(c,center){
 const u=panStep/2,cx=center,cy=center,col='#172018',w=k=>Math.round(1.5+k*0.95);
 c.save();c.strokeStyle=col;c.fillStyle=col;c.lineCap='butt';
 const line=(x1,y1,x2,y2,lw)=>{c.lineWidth=lw;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()};
 const dot=(x,y,r)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()};
 const text=(t,x,y,align,base)=>{c.font='10px system-ui';c.textAlign=align;c.textBaseline=base;c.fillText(t,x,y)};
 const len=i=>i%10===0?6:i%2===0?4:2;
 for(let k=1;k<=10;k++){
  const y=cy+k*u;
  for(let i=2;i<=2*w(k);i++)for(const s of [-1,1]){
   const x=cx+s*i*u/2;
   if(i===4)line(x,y-3,x,y+3,1);else dot(x,y,1.1);
  }
 }
 line(cx-15*u,cy,cx-3,cy,1);line(cx+3,cy,cx+15*u,cy,1);
 line(cx,cy-3,cx,cy-10*u,1);line(cx,cy+3,cx,cy+10*u,1);
 for(let i=1;i<=30;i++)for(const s of [-1,1]){const x=cx+s*i*u/2,l=len(i);line(x,cy-l,x,cy+l,1)}
 for(let i=1;i<=20;i++)for(const s of [-1,1]){const y=cy+s*i*u/2,l=i%2?2:4;line(cx-l,y,cx+l,y,1)}
 line(30,cy,cx-15*u,cy,7);line(cx+15*u,cy,670,cy,7);
 line(cx,30,cx,cy-10.5*u,7);line(cx,cy+10.5*u,cx,670,7);
 for(let n=2;n<=14;n+=2)for(const s of [-1,1])text(String(n),cx+s*n*u,cy-9,'center','bottom');
 for(let k=2;k<=10;k++)text(String(k),cx+8,cy-k*u,'left','middle');
 for(let k=1;k<=10;k++){
  const y=cy+k*u,x=(w(k)+0.9)*u;
  text(String(k),cx-x,y,'right','middle');text(String(k),cx+x,y,'left','middle');
 }
 dot(cx,cy,1.6);
 c.restore();
}

function drawDot(c,center){
 const u=panStep/2,cx=center,cy=center,col='#172018',w=k=>Math.round(3+k*0.7);
 c.save();c.strokeStyle=col;c.fillStyle=col;c.lineCap='butt';
 const line=(x1,y1,x2,y2,lw)=>{c.lineWidth=lw;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()};
 const dot=(x,y,r)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()};
 const text=(t,x,y,align,base)=>{c.font='11px system-ui';c.textAlign=align;c.textBaseline=base;c.fillText(t,x,y)};
 for(let k=1;k<=20;k++){
  const n=Math.round(w(k)*(k%2?1:2))-(k%2?1:2)+1,st=k%2?u:u/2;
  for(let j=0;j<n;j++)for(const s of [-1,1])dot(cx+s*(u+j*st),cy+k*u,j>=n-2?1.8:1.1);
 }
 line(cx-16*u,cy,cx-4,cy,1);line(cx+4,cy,cx+16*u,cy,1);
 line(cx,cy-4,cx,cy-18*u,1);line(cx,cy+4,cx,cy+20*u,1);
 for(let i=1;i<=20;i++){
  const x=i*u/2,l=i%2?2:4;
  if(i<=20)for(const s of [-1,1])line(cx+s*x,cy-l,cx+s*x,cy+l,1);
 }
 for(let i=1;i<=40;i++){const y=cy+i*u/2,l=i%2?2:4;line(cx-l,y,cx+l,y,1)}
 for(let n=2;n<=10;n+=2)for(const s of [-1,1])text(String(n),cx+s*n*u,cy-8,'center','bottom');
 text('MIL',cx+11*u,cy+8,'left','top');
 for(let k=2;k<=20;k+=2)text(String(k),cx+(w(k)+1.2)*u,cy+k*u,'left','middle');
 line(30,cy,cx-16*u,cy,7);line(cx+16*u,cy,670,cy,7);
 line(cx,30,cx,cy-18*u,7);line(cx,cy+20*u,cx,670,7);
 dot(cx,cy,1.8);
 c.restore();
}

function drawTree(c,center){
 const u=panStep/2,cx=center,cy=center,col='#172018',w=k=>Math.round(2+1.6*k);
 c.save();c.strokeStyle=col;c.fillStyle=col;c.lineCap='butt';
 const line=(x1,y1,x2,y2,lw)=>{c.lineWidth=lw;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()};
 const dot=(x,y)=>{c.beginPath();c.arc(x,y,1.6,0,Math.PI*2);c.fill()};
 const text=(t,x,y,font,align,base='middle')=>{c.font=font;c.textAlign=align;c.textBaseline=base;c.fillText(t,x,y)};
 line(55-25,cy,cx-21*u,cy,7);line(cx+21*u,cy,645+25,cy,7);
 line(cx-21*u,cy,cx+21*u,cy,1.2);
 for(let i=-20;i<=20;i++){
  if(!i)continue;
  const x=cx+i*u,l=i%5?2:5;
  line(x,cy-l,x,cy+l,1.2);
  if(!(i%5))text(String(Math.abs(i)),x,cy-10,'600 12px system-ui','center');
  if(!(i%2))dot(x,cy+1.5*u);
 }
 line(cx,cy,cx,cy-14*u,1.2);
 for(let i=1;i<=14;i++){
  const y=cy-i*u,l=i%5?2:5;
  line(cx-l,y,cx+l,y,1.2);
  if(!(i%5))text(String(i),cx+8,y,'600 12px system-ui','left');
 }
 for(const s of [-1,1]){
  for(const m of [5,10]){
   const x=cx+s*m*u;
   line(x,cy-5*u,x,cy-2*u,4);
   text(String(m),x,cy-5.6*u,'11px system-ui','center','bottom');
  }
  for(let m=5.5;m<10;m+=.5){
   if(m===10)continue;
   const x=cx+s*m*u;line(x,cy-3.5*u,x,cy-2*u,1.2);
  }
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
   for(let m=2;m<=wk;m++)dot(cx+s*m*u,y);
  }
  text(String(k*2),cx,y,'600 12px system-ui','center');
  if(k<7)line(cx-3,y+u,cx+3,y+u,1.2);
  text('H'+k,cx-(wk+1.2)*u,y,'11px system-ui','right');
  text('H'+k,cx+(wk+1.2)*u,y,'11px system-ui','left');
 }
 for(const s of [-1,1])for(let m=2;m<=w(8);m++)dot(cx+s*m*u,cy+16*u);
 line(cx,cy+17.5*u,cx,670,7);
 text('MRAD',cx-16*u,cy+3.5*u,'11px system-ui','center');
 c.restore();
}
