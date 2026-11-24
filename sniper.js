import {changeSide,languageButton,read,write} from './factions.js';
import {tr} from './language.js';
import './sniper.css';

const saveKey='pop-sniper-v1';
const optics=[['Ялинка','Tree'],['Коло','Ring'],['Сітка','Grid']];
const profiles=['A','B','C'];
const weather=[
 {humidity:36,east:true,flags:[1,2,1]},
 {humidity:72,east:false,flags:[3,2,3]},
 {humidity:48,east:true,flags:[2,3,2]},
 {humidity:64,east:false,flags:[1,2,1]},
 {humidity:82,east:true,flags:[3,2,1]},
 {humidity:27,east:false,flags:[2,1,2]},
];
const fieldCodes=[
 [3,1,-2,2,-3,-1],[2,-3,4,-1,1,-4],
 [-2,4,1,-4,3,-1],[1,-2,3,4,-1,-3],
 [4,3,-1,-2,-4,2],[-3,2,-4,1,-2,4],
];
const saved=read(saveKey);
const validIndex=(value,length)=>Number.isInteger(value)&&value>=0&&value<length;
const validSeries=s=>!!s&&typeof s==='object'&&Array.isArray(s.rounds)&&s.rounds.length===seriesSize&&s.rounds.every(i=>validIndex(i,weather.length))&&
 Array.isArray(s.unassisted)&&s.unassisted.length<=seriesSize&&s.unassisted.every(v=>typeof v==='boolean')&&typeof s.usedCode==='boolean';
const viewSize=700;
const canvasScale=()=>Math.min(2,window.devicePixelRatio||1);
const panStep=22;
const seriesSize=3;
const clampAxis=value=>Math.max(-4,Math.min(4,value));
const initial=()=>({distance:0,optic:0,profile:0,weather:0,x:0,y:0});
const signed=value=>value>0?'+'+value:String(value);

const compass=conditions=>conditions.east?'W → E':'E → W';
const flagPattern=conditions=>conditions.flags.map(flag=>(conditions.east?'›':'‹').repeat(flag)).join(' / ');

function signalCode(state,weatherIndex=state.weather){
 // This is a pair of puzzle codes. The table has no relationship to physical optics.
 const row=fieldCodes[weatherIndex];
 return [row[(state.distance+state.profile)%6],row[(3+state.distance+state.optic+2*state.profile)%6]];
}

export function startSniper(){
 const state=saved&&validIndex(saved.distance,3)&&validIndex(saved.optic,3)&&validIndex(saved.profile,3)&&
  validIndex(saved.weather,weather.length)&&[saved.x,saved.y].every(v=>Number.isInteger(v)&&Math.abs(v)<=4)?{...saved}:initial();
 // Saves from before the round index existed used distance as the round.
 if(state.round===undefined&&validSeries(state.series)&&validIndex(state.distance,seriesSize))state.round=state.distance;
 if(state.best!==undefined&&!(Number.isInteger(state.best)&&state.best>=0&&state.best<=seriesSize))delete state.best;
 const root=document.createElement('main');
 root.className='sniper-board';document.body.append(root);
 const save=()=>write(saveKey,state);
 let dragging=false,pendingRender=false;

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
  const weatherRows=weather.map((entry,index)=>{
   const [x,y]=signalCode(state,index);
   return '<tr><td>'+compass(entry)+'</td><td>'+flagPattern(entry)+'</td><td>'+signed(x)+'</td><td>'+signed(y)+'</td></tr>';
  }).join('');
  root.innerHTML=`
   <header class="sniper-header"><div><small>POP SEASON</small><h1>${tr('Снайпер','Sniper')}</h1></div>
    <nav>${languageButton()}<button data-exit>${tr('Режими','Modes')}</button></nav>
   </header>
   <div class="sniper-layout">
    <section class="sniper-scene" aria-label="${tr('Вид в оптику','Scope view')}">
     <div class="sniper-scope"><canvas width="${Math.round(viewSize*canvasScale())}" height="${Math.round(viewSize*canvasScale())}" aria-hidden="true"></canvas></div>
     <div class="sniper-pad" role="group" aria-label="${tr('Налаштування оптики','Scope adjustment')}">
      <button type="button" data-step="x" data-delta="-1" aria-label="${tr('Ліворуч','Left')}">←</button>
      <button type="button" data-step="y" data-delta="-1" aria-label="${tr('Вгору','Up')}">↑</button>
      <button type="button" data-step="y" data-delta="1" aria-label="${tr('Вниз','Down')}">↓</button>
      <button type="button" data-step="x" data-delta="1" aria-label="${tr('Праворуч','Right')}">→</button>
     </div>
     <p class="sniper-drag-hint">${tr('Перетягніть зображення, щоб налаштувати X та Y.','Drag the view to adjust X and Y.')}</p>
    </section>
    <aside class="sniper-console">
     ${tutorial?`<section class="sniper-tutorial" aria-labelledby="sniper-lesson-title">
      <h2 id="sniper-lesson-title">${tr('Навчальний раунд','Tutorial round')}</h2>
      <ol>
       <li>${tr('Прочитайте прапорці зліва направо. Довший прапорець має більше знаків у панелі.','Read the flags left to right. A longer flag has more marks on the panel.')}</li>
       <li>${tr('У таблиці знайдіть рядок із таким самим напрямком компаса й рисунком прапорців.','Find the row with the same compass direction and flag pattern.')}</li>
       <li>${tr('Перенесіть X та Y з цього рядка на повзунки.','Set the sliders to the X and Y values in that row.')}</li>
       <li>${tr('Вологість на код не впливає.','Humidity does not affect the code.')}</li>
      </ol>
     </section>`:`<div>
      <h2 class="sniper-round-title">${tr('Раунд ','Round ')}${state.round+1}${tr(' з ',' of ')}${seriesSize}</h2>
      <p class="sniper-instructions">${tr('Сумістіть центр сітки з мішенню або знайдіть її код у таблиці.','Align the reticle with the target or look up its code in the table.')}</p>
     </div>`}
     <div class="sniper-settings">
      <label>${tr('Дистанція','Distance')} <select data-distance aria-label="${tr('Дистанція','Distance')}"></select></label>
      <label>${tr('Сітка','Reticle')} <select data-optic aria-label="${tr('Сітка','Reticle')}"></select></label>
      <label>${tr('Профіль','Profile')} <select data-profile aria-label="${tr('Профіль','Profile')}"></select></label>
     </div>
     <dl class="sniper-weather">
      <div><dt>${tr('Компас','Compass')}</dt><dd>${compass(conditions)}</dd></div>
      <div><dt>${tr('Вологість','Humidity')}</dt><dd>${conditions.humidity}%</dd></div>
      <div><dt>${tr('Вітер · прапорці','Wind · flags')}</dt><dd>${flagPattern(conditions)}</dd></div>
     </dl>
     <details class="sniper-field-table"${tutorial?' open':''}>
      <summary>${tr('Ігрова таблиця','Game table')}</summary>
      <p>${tr('Коди в таблиці відповідають вибраним дистанції, сітці й профілю.','The table uses your selected distance, reticle and profile.')}</p>
      <table aria-label="${tr('Ігрові коди за прапорцями','Game codes by flag pattern')}">
       <thead><tr><th scope="col">${tr('Напрямок','Direction')}</th><th scope="col">${tr('Прапорці','Flags')}</th><th scope="col">X</th><th scope="col">Y</th></tr></thead>
       <tbody>${weatherRows}</tbody>
      </table>
     </details>
     <section class="sniper-calculator">
      <h2>${tr('Калькулятор гри','Game calculator')}</h2>
      <label class="sniper-axis"><span>X</span><input type="range" min="-4" max="4" step="1" value="${state.x}" data-axis="x" aria-label="${tr('Горизонтальний код X','Horizontal code X')}"><output data-value="x"></output></label>
      <label class="sniper-axis"><span>Y</span><input type="range" min="-4" max="4" step="1" value="${state.y}" data-axis="y" aria-label="${tr('Вертикальний код Y','Vertical code Y')}"><output data-value="y"></output></label>
      ${tutorial?'':`<div class="sniper-hints">
       <button type="button" data-check-axis>${tr('Перевірити X','Check X')}</button>
       <button type="button" data-code aria-expanded="false" aria-controls="sniper-answer" hidden>${tr('Показати повний код','Show full code')}</button>
      </div>
      <p class="sniper-hint-note">${tr('«Перевірити X» безкоштовна. Повний код знімає бал за раунд.','Check X is free. The full code costs that round\'s point.')}</p>
      <p data-axis-feedback role="status" hidden></p>
      <p id="sniper-answer" data-answer hidden></p>`}
     </section>
     <p class="sniper-result" role="status"></p>
     <button class="sniper-next" data-next>${tutorial?tr('Почати серію','Start series'):finalRound?tr('Нова серія','New series'):tr('Наступний раунд','Next round')}</button>
    </aside>
   </div>`;
  const canvas=root.querySelector('canvas');
  const sliders=[...root.querySelectorAll('[data-axis]')];
  const steps=[...root.querySelectorAll('[data-step]')];
  const settings=[...root.querySelectorAll('.sniper-settings select')];
  const result=root.querySelector('.sniper-result');
  const next=root.querySelector('[data-next]');
  const feedback=root.querySelector('[data-axis-feedback]');
  const [targetX,targetY]=signalCode(state);
  if(!tutorial){
   const codeButton=root.querySelector('[data-code]');
   const answer=root.querySelector('[data-answer]');
   root.querySelector('[data-check-axis]').onclick=()=>{
    feedback.hidden=false;
    feedback.textContent=state.x===targetX?tr('X збігається.','X matches.'):tr('X ще не збігається.','X does not match yet.');
    codeButton.hidden=false;
   };
   codeButton.onclick=()=>{
    answer.hidden=!answer.hidden;
    codeButton.setAttribute('aria-expanded',String(!answer.hidden));
    codeButton.textContent=answer.hidden?tr('Показати повний код','Show full code'):tr('Сховати повний код','Hide full code');
    if(!answer.hidden){
     state.series.usedCode=true;save();
     answer.textContent=tr('Код мішені','Target code')+' · X '+signed(targetX)+' / Y '+signed(targetY);
    }
   };
  }

  function paint(){
   const dx=targetX-state.x,dy=targetY-state.y;
   const complete=dx===0&&dy===0;
   drawScope(canvas,state,conditions,dx,dy);
   for(const slider of sliders){
    slider.value=state[slider.dataset.axis];
    root.querySelector('[data-value="'+slider.dataset.axis+'"]').textContent=signed(Number(slider.value));
    slider.disabled=complete;
   }
   for(const step of steps){
    const value=state[step.dataset.step];
    step.disabled=complete||clampAxis(value+Number(step.dataset.delta))===value;
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
  function setAlignment(x,y){
   if(state.x===targetX&&state.y===targetY)return;
   x=clampAxis(x);y=clampAxis(y);
   if(x===state.x&&y===state.y)return;
   if(feedback&&x!==state.x){feedback.hidden=true;feedback.textContent=''}
   state.x=x;state.y=y;
   save();paint();
   const focused=document.activeElement;
   if(state.x===targetX&&state.y===targetY&&(focused===document.body||focused?.disabled))next.focus();
  }
  for(const slider of sliders)slider.oninput=()=>{
   const value=Number(slider.value);
   if(slider.dataset.axis==='x')setAlignment(value,state.y);
   else setAlignment(state.x,value);
  };
  for(const step of steps)step.onclick=()=>{
   const delta=Number(step.dataset.delta);
   if(step.dataset.step==='x')setAlignment(state.x+delta,state.y);
   else setAlignment(state.x,state.y+delta);
  };
  let drag=null;
  canvas.onpointerdown=event=>{
   if(event.pointerType==='touch'||event.button!==0||(state.x===targetX&&state.y===targetY))return;
   drag={id:event.pointerId,left:event.clientX,top:event.clientY,x:state.x,y:state.y};
   dragging=true;canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove=event=>{
   if(drag?.id!==event.pointerId)return;
   const step=panStep*canvas.clientWidth/viewSize;
   setAlignment(drag.x-Math.round((event.clientX-drag.left)/step),drag.y-Math.round((event.clientY-drag.top)/step));
  };
  canvas.onlostpointercapture=()=>{drag=null;dragging=false;if(pendingRender){pendingRender=false;render()}};
  for(const [field,labels] of [
   ['distance',[1,2,3].map(n=>n+' '+tr('км','km'))],
   ['optic',optics.map(label=>tr(...label))],['profile',profiles]
  ]){
   const select=root.querySelector('[data-'+field+']');
   labels.forEach((label,i)=>select.add(new Option(label,String(i),false,i===state[field])));
   select.onchange=()=>{
    state[field]=Number(select.value);
    state.x=state.y=0;
    save();render();root.querySelector('[data-'+field+']').focus();
   };
  }
  next.onclick=()=>{nextRound();root.querySelector('[data-axis="x"]').focus()};
  root.querySelector('[data-exit]').onclick=changeSide;
  root.querySelector('[data-language]').onclick=()=>document.querySelector('.lang').click();
  paint();
 }
 document.addEventListener('siege-language',()=>{if(dragging)pendingRender=true;else render()});
 render();window.dispatchEvent(new Event('game-ready'));
}

function drawScope(canvas,state,conditions,dx,dy){
 const c=canvas.getContext('2d'),size=viewSize,center=size/2,scale=canvas.width/viewSize;
 c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,size,size);
 const polygon=(color,points)=>{
  c.fillStyle=color;c.beginPath();c.moveTo(...points[0]);
  for(const point of points.slice(1))c.lineTo(...point);
  c.closePath();c.fill();
 };
 const edge=panStep*8,far=size+edge;
 c.save();
 c.translate(dx*panStep,dy*panStep);
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
 else{
  c.beginPath();
  for(const [x1,y1,x2,y2] of [[55,350,341,350],[359,350,645,350],[350,55,350,341],[350,359,350,645]]){
   c.moveTo(x1,y1);c.lineTo(x2,y2);
  }
  c.stroke();
 }
 if(state.optic===1){
  c.beginPath();c.arc(center,center,68,0,Math.PI*2);c.stroke();
 }
 if(state.optic===2){
  c.beginPath();
  for(let i=1;i<=6;i++)for(const sign of [-1,1]){
   const offset=center+i*panStep*sign;
   c.moveTo(offset,344);c.lineTo(offset,356);c.moveTo(344,offset);c.lineTo(356,offset);
  }
  c.stroke();
 }
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
