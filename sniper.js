import {changeSide,languageButton,read,write} from './factions.js';
import {tr} from './language.js';
import './sniper.css';

const saveKey='pop-sniper-v1';
const optics=[['Перехрестя','Cross'],['Коло','Ring'],['Сітка','Grid']];
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
  validIndex(saved.weather,weather.length)&&[saved.x,saved.y].every(v=>Number.isInteger(v)&&Math.abs(v)<=4)?saved:initial();
 const root=document.createElement('main');
 root.className='sniper-board';document.body.append(root);
 const save=()=>write(saveKey,state);

 function nextRound(){
  state.tutorialDone=true;
  state.weather=(state.weather+1+Math.floor(Math.random()*(weather.length-1)))%weather.length;
  state.x=state.y=0;
  save();render();
 }
 function render(){
  const conditions=weather[state.weather];
  const tutorial=state.tutorialDone!==true;
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
     <div class="sniper-scope"><canvas width="700" height="700" aria-hidden="true"></canvas></div>
    </section>
    <aside class="sniper-console">
     ${tutorial?`<section class="sniper-tutorial" aria-labelledby="sniper-lesson-title">
      <h2 id="sniper-lesson-title">${tr('Навчальний раунд','Tutorial round')}</h2>
      <ol>
       <li>${tr('Прочитайте прапорці зліва направо. Довший прапорець має більше знаків у панелі.','Read the flags left to right. A longer flag has more marks on the panel.')}</li>
       <li>${tr('У таблиці знайдіть рядок із таким самим напрямком компаса й рисунком прапорців.','Find the row with the same compass direction and flag pattern.')}</li>
       <li>${tr('Перенесіть X та Y з цього рядка на повзунки.','Set the sliders to the X and Y values in that row.')}</li>
      </ol>
     </section>`:`<p class="sniper-instructions">${tr('Сумістіть центр сітки з мішенню або знайдіть її код у таблиці.','Align the reticle with the target or look up its code in the table.')}</p>`}
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
      <p data-axis-feedback role="status" hidden></p>
      <p id="sniper-answer" data-answer hidden></p>`}
     </section>
     <p class="sniper-result" role="status"></p>
     <button class="sniper-next" data-next>${tutorial?tr('Почати звичайні раунди','Start regular rounds'):tr('Новий раунд','New round')}</button>
    </aside>
   </div>`;
  const canvas=root.querySelector('canvas');
  const sliders=[...root.querySelectorAll('[data-axis]')];
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
    if(!answer.hidden)answer.textContent=tr('Код мішені','Target code')+' · X '+signed(targetX)+' / Y '+signed(targetY);
   };
  }

  function paint(){
   const dx=targetX-state.x,dy=targetY-state.y;
   const complete=dx===0&&dy===0;
   drawScope(canvas,state,conditions,dx,dy);
   for(const slider of sliders){
    root.querySelector('[data-value="'+slider.dataset.axis+'"]').textContent=signed(Number(slider.value));
    slider.disabled=complete;
   }
   next.disabled=tutorial&&!complete;
   result.dataset.won=String(complete);
   const message=complete?tr('Перемога · мішень у центрі','Victory · target aligned'):
    tr('Налаштуйте X та Y','Adjust X and Y');
   if(result.textContent!==message)result.textContent=message;
  }
  for(const slider of sliders)slider.oninput=()=>{
   state[slider.dataset.axis]=Number(slider.value);
   if(feedback&&slider.dataset.axis==='x'){feedback.hidden=true;feedback.textContent=''}
   save();paint();
  };
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
 document.addEventListener('siege-language',render);
 render();window.dispatchEvent(new Event('game-ready'));
}

function drawScope(canvas,state,conditions,dx,dy){
 const c=canvas.getContext('2d'),size=700,center=size/2;
 const polygon=(color,points)=>{
  c.fillStyle=color;c.beginPath();c.moveTo(...points[0]);
  for(const point of points.slice(1))c.lineTo(...point);
  c.closePath();c.fill();
 };
 const sky=c.createLinearGradient(0,0,0,440);
 sky.addColorStop(0,'#354f52');sky.addColorStop(1,'#bfbc95');
 c.fillStyle=sky;c.fillRect(0,0,size,size);
 polygon('#83907b',[[0,317],[120,249],[198,264],[309,222],[448,268],[574,218],[700,250],[700,460],[0,460]]);
 polygon('#5a6e55',[[0,357],[115,305],[211,320],[312,286],[437,323],[550,284],[700,320],[700,490],[0,490]]);
 polygon('#536145',[[0,401],[127,375],[287,391],[462,361],[602,379],[700,373],[700,700],[0,700]]);
 polygon('#8d8057',[[322,385],[371,385],[595,700],[70,700]]);
 polygon('#75724f',[[339,388],[353,388],[475,700],[206,700]]);
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
 const x=center+dx*22,y=center+dy*22;
 c.fillStyle='#2b3025';c.fillRect(x-3,y+radius,6,30);
 for(const [factor,color] of [[1,'#ded4a6'],[.76,'#3b4c45'],[.48,'#ded4a6'],[.23,'#d87249']]){
  c.beginPath();c.arc(x,y,radius*factor,0,Math.PI*2);c.fillStyle=color;c.fill();
 }
 const vignette=c.createRadialGradient(center,center,200,center,center,350);
 vignette.addColorStop(0,'#10170c00');vignette.addColorStop(1,'#071009a0');
 c.fillStyle=vignette;c.fillRect(0,0,size,size);
 c.strokeStyle='#172018';c.lineWidth=2;
 c.beginPath();
 for(const [x1,y1,x2,y2] of [[55,350,341,350],[359,350,645,350],[350,55,350,341],[350,359,350,645]]){
  c.moveTo(x1,y1);c.lineTo(x2,y2);
 }
 c.stroke();
 if(state.optic===1){
  c.beginPath();c.arc(center,center,68,0,Math.PI*2);c.stroke();
 }
 if(state.optic===2){
  c.beginPath();
  for(let i=1;i<=6;i++)for(const sign of [-1,1]){
   const offset=center+i*22*sign;
   c.moveTo(offset,344);c.lineTo(offset,356);c.moveTo(344,offset);c.lineTo(356,offset);
  }
  c.stroke();
 }
}
