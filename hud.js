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
 const m = text.match(/(?:ХВИЛЯ|WAVE) (\d+)/);
 if (m) { wave = +m[1]; state = 'live'; }
 else if (/ЗАКУПІВЛЯ|PROCUREMENT/.test(text)) { wave = 0; state = 'buy'; }
 else if (/ЗАКРИТО|CLOSED/.test(text)) state = 'over';
 $('statusMirror').textContent = text;
 $('waveNo').textContent = String(wave).padStart(2, '0');
 document.body.dataset.phase = /ПАУЗА|PAUSED/.test(text) ? 'pause' : state;
 renderTimeline();
}

let last = info.textContent, lastTime = clock.textContent;
function logInfo() {
 const text = info.textContent;
 if (!text || text === last) return;
 const li = document.createElement('li');
 const t = document.createElement('time');
 t.textContent = lastTime;
 li.append(t, last);
 log.prepend(li);
 while (log.children.length > 6) log.lastChild.remove();
 last = text;
 lastTime = clock.textContent;
}

new MutationObserver(syncPhase).observe(phase, {childList: true, characterData: true, subtree: true});
new MutationObserver(logInfo).observe(info, {childList: true, characterData: true, subtree: true});
syncPhase();

for(const button of document.querySelectorAll('.panel-toggles button')){
 const panel=document.getElementById(button.getAttribute('aria-controls'));
 const key='pink-siege:'+panel.id;
 function toggle(open){
  panel.hidden=!open;
  document.querySelector('main').classList.toggle('hide-'+panel.id,!open);
  button.setAttribute('aria-expanded',String(open));
 }
 toggle(localStorage.getItem(key)!=='closed');
 button.onclick=()=>{toggle(panel.hidden);localStorage.setItem(key,panel.hidden?'closed':'open')};
}
