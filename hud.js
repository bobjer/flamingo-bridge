import {tr} from './language.js';
// Presentation-only HUD helpers: they watch the elements main.js writes to and never touch game state.
const $ = id => document.getElementById(id);
const phase = $('phase'), info = $('info'), log = $('log'), clock = $('clock'), line = $('timeline');
const NODES = 8;
let wave = 0, state = 'buy';

function renderTimeline() {
 const first = Math.max(1, wave - NODES + 3);
 const items = [tr('ЗАКУПІВЛЯ','BUY'), ...Array.from({length: NODES - 1}, (_, i) => tr('Х','W') + (first + i))];
 line.replaceChildren(...items.map((label, i) => {
  const n = i === 0 ? 0 : first + i - 1, el = document.createElement('span');
  el.className = 'node' + (n < wave || (n === 0 && wave > 0) ? ' done' : '') + (n === wave ? ' now' : '');
  if (n === wave && state === 'over') el.className = 'node done lost';
  el.textContent = label;
  return el;
 }));
}

function syncPhase() {
 const text = phase.textContent.replace(/^[●■Ⅱ]\s*/, '');
 wave=Number(phase.dataset.wave??wave);
 const m = text.match(/(?:ХВИЛЯ|WAVE) (\d+)/);
 if (m) { wave = +m[1]; state = 'live'; }
 else if (/ЗАКУПІВЛЯ|PROCUREMENT/.test(text)) { wave = 0; state = 'buy'; }
 else if (/ЗАКРИТО|CLOSED/.test(text)) state = 'over';
 $('statusMirror').textContent = text;
 $('waveNo').textContent = String(wave).padStart(2, '0');
 document.body.dataset.phase = /ПАУЗА|PAUSED/.test(text) ? 'pause' : state;
 renderTimeline();
}

let previous, previousTime;
function logInfo(){
 const lang=document.documentElement.lang;
 const current={uk:info.dataset.uk,en:info.dataset.en};
 if(!current[lang]||previous?.[lang]===current[lang])return;
 if(previous){
  const li=document.createElement('li'),stamp=document.createElement('time'),text=document.createElement('span');
  Object.assign(text.dataset,previous);text.textContent=previous[lang];stamp.textContent=previousTime;
  li.append(stamp,text);log.prepend(li);
  while(log.children.length>6)log.lastChild.remove();
 }
 previous=current;previousTime=clock.textContent;
}
new MutationObserver(syncPhase).observe(phase,{childList:true,characterData:true,subtree:true});
new MutationObserver(logInfo).observe(info,{childList:true,characterData:true,subtree:true});
syncPhase();
document.addEventListener('siege-language',()=>{
 const lang=document.documentElement.lang;
 if(info.dataset[lang])info.textContent=info.dataset[lang];
 for(const item of log.querySelectorAll('[data-uk]'))item.textContent=item.dataset[lang];
 syncPhase();
});
for(const restore of document.querySelectorAll('.panel-toggles button')){
 const panel=document.getElementById(restore.getAttribute('aria-controls'));
 const fold=panel.querySelector('.fold'),hq=panel.id==='hq-panel';
 const key='pink-siege:'+panel.id;
 function render(){
  const open=!panel.hidden;
  document.querySelector('.panel-title').textContent=tr('Панелі','Panels');
  restore.textContent=hq?(open?tr('Згорнути штаб','Hide HQ'):tr('Відкрити штаб','Open HQ')):(open?tr('Згорнути арсенал','Hide arsenal'):tr('Відкрити арсенал','Open arsenal'));
  for(const button of [restore,fold])button.setAttribute('aria-expanded',String(open));
  document.querySelector('main').classList.toggle('hide-'+panel.id,!open);
 }
 function toggle(open){
  panel.hidden=!open;render();localStorage.setItem(key,open?'open':'closed');
  (open?fold:restore).focus({preventScroll:true});
 }
 fold.onclick=()=>toggle(false);restore.onclick=()=>toggle(panel.hidden);
 panel.hidden=localStorage.getItem(key)==='closed';render();
 document.addEventListener('siege-language',render);
}
document.addEventListener('siege-reset',()=>{previous=undefined;log.replaceChildren()});
