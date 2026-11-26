import {tr} from './language.js';
import './factions.css';

const sideKey = 'pop-side-v1';
const sides = ['bridge','coalition','deepstrike','sniper'];
export const read = key => {try{return JSON.parse(localStorage.getItem(key))}catch{return null}};
export const write = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
export const preferredLevel = () => read('pop-level-v1') ?? 'normal';
export const rememberLevel = value => write('pop-level-v1',value);
export function levelField(value, next = false) {
 const select = document.querySelector('#difficulty').cloneNode(true);
 select.removeAttribute('id'); select.disabled = false; select.dataset.levelPick = '';
 for (const option of select.options) option.toggleAttribute('selected', option.value === value);
 const label = next ? tr('Складність нової гри','New game difficulty') : tr('Складність','Difficulty');
 return '<label class="side-level">' + label + select.outerHTML + '</label>';
}
const paperclip = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="2" y="2" width="44" height="44" rx="11" fill="#29251e"/><path d="m18 28 12-12a3 3 0 0 1 4 4L19 35a6 6 0 0 1-8-9l17-17a8 8 0 0 1 12 11L22 38" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
export const languageButton = () => '<button type="button" data-language>'+tr('English','Українська')+'</button>';
export async function changeSide(){
  if(document.querySelector('.faction-picker:modal')) return;
  const result = await pickSide(true,true);
  if(!result) return;
  // Consume this instruction at boot, after the old page's final save has finished.
  write(sideKey,{restart:result.side,level:result.level});
  location.reload();
}
export async function chooseSide(){
  const remembered=read(sideKey);
  if(sides.includes(remembered)) return remembered;
  if(sides.includes(remembered?.restart)){
    localStorage.removeItem('pink-siege:match:v1');
    localStorage.removeItem('pop-coalition-v2');
    localStorage.removeItem('pop-deepstrike-v1');
    const old=read('pop-sniper-v2'),keep={}; // a new game resets the Sniper series but keeps its records
    if(old&&Number.isInteger(old.bestScore)&&old.bestScore>=0&&old.bestScore<=50)keep.bestScore=old.bestScore;
    if(old&&Number.isFinite(old.bestHpm)&&old.bestHpm>0)keep.bestHpm=old.bestHpm;
    // 'pop-sniper-prefs' (speed, FPV mode, scope, caliber, world, distance, zoom) is deliberately left untouched
    localStorage.removeItem('pop-sniper-v2');
    if(Object.keys(keep).length)write('pop-sniper-v2',keep);
    rememberLevel(remembered.level); write(sideKey,remembered.restart);
    return remembered.restart;
  }
  const {side,level}=await pickSide(false);
  rememberLevel(level); write(sideKey,side);return side;
}
async function pickSide(restart,canCancel=restart){
  let side=restart?read(sideKey):null, level=preferredLevel();
  const dialog=document.createElement('dialog');
  dialog.className='faction-picker';dialog.setAttribute('aria-labelledby','faction-title');
  document.body.append(dialog);
  function placeDifficulty() {
    const field=dialog.querySelector('.side-level');
    for(const card of dialog.querySelectorAll('[data-side]')){
      const selected=card.dataset.side===side;
      card.setAttribute('aria-pressed',String(selected));
      if(selected) card.after(field);
    }
  }
  let choosingMode=false;
  const render=()=>{
    if(choosingMode){
      dialog.innerHTML='<div class="faction-head"><button type="button" data-back>'+tr('Назад','Back')+'</button>'+languageButton()+'</div><h1 id="faction-title">'+tr('Режим коаліції','Coalition mode')+'</h1><div class="faction-options">'+
        '<button data-mode="coalition"><strong>'+tr('Міст','Bridge')+'</strong><span>'+tr('Зберіть зграю для атаки на міст.','Assemble a flock for the bridge.')+'</span></button>'+
        '<button data-mode="deepstrike"><strong>'+tr('Діпстрайк','Deepstrike')+'</strong><span>'+tr('Сплануйте хвилю на карті регіонів.','Plan a wave on the regional map.')+'</span></button></div>';
      dialog.querySelector('[data-mode]').focus();
      return;
    }
    dialog.innerHTML='<div class="faction-head"><span>POP SEASON</span><a href="/license.html" target="_blank" rel="noopener">'+tr('Ліцензія','License')+'</a>'+languageButton()+'</div><h1 id="faction-title">'+tr('Оберіть режим','Choose a mode')+'</h1>'+(restart?'<p class="restart-warning">'+tr('Поточний прогрес усіх режимів буде скинуто, рекорди збережуться. Нова гра почнеться спочатку.','Current progress in all modes will be reset; records are kept. The new game starts from the beginning.')+'</p>':'')+levelField(level,true)+'<div class="faction-options">'+
      '<button data-side="coalition"><img src="/coalition-koala.svg" alt=""><small>'+tr('НАСТУП','OFFENCE')+'</small><strong>'+tr('Коаліція охочих','Coalition of the Willing')+'</strong><span>'+tr('Зберіть зграю, виконайте контракт і переконайте спонсорів оплатити наступну хвилю.','Build a flock, deliver the contract and convince the sponsors to fund another wave.')+'</span></button>'+
      '<button data-side="bridge">'+paperclip+'<small>'+tr('ОБОРОНА','DEFENCE')+'</small><strong>'+tr('Гарнізон','Garrison')+'</strong><span>'+tr('Тримайте міст, латайте полотно й освоюйте бюджет.','Hold the bridge, patch the road and burn through the budget.')+'</span></button></div>';

    const options=dialog.querySelector('.faction-options');
    options.insertAdjacentHTML('beforeend','<button data-side="sniper"><span class="faction-optics" aria-hidden="true">⊕</span><small>'+tr('ПОЛІГОН','RANGE')+'</small><strong>'+tr('Снайпер','Sniper')+'</strong><span>'+tr('Головоломка з оптикою на полігоні.','An optics puzzle at the range.')+'</span></button>');
    if (canCancel) {
      const body=document.createElement('div'); body.className='faction-body'; body.append(...dialog.children);dialog.append(body);
      const confirm=restart?'<button type="button" data-confirm>'+tr('Почати спочатку','Start over')+'</button>':'';
      dialog.insertAdjacentHTML('beforeend','<footer class="restart-actions"><button type="button" data-cancel>'+tr('Скасувати','Cancel')+'</button>'+confirm+'</footer>');
      if(restart)placeDifficulty();
    }
  };
  render();document.addEventListener('siege-language',render);
  dialog.onchange=e=>{if(e.target.matches('[data-level-pick]'))level=e.target.value};
  dialog.showModal();
  const result=await new Promise(resolve=>{
    dialog.oncancel=e=>{e.preventDefault();if(canCancel)resolve(null)};
    dialog.onclick=e=>{
      if(e.target.closest('[data-back]')){choosingMode=false;render();dialog.querySelector('[data-side=coalition]').focus();return}
      const mode=e.target.closest('[data-mode]');
      if(mode){resolve({side:mode.dataset.mode,level});return}
      if(e.target.closest('[data-side=coalition]')){choosingMode=true;render();return}
      if(e.target.closest('[data-language]')){document.querySelector('.lang').click();return}
      if(e.target.closest('[data-cancel]')){resolve(null);return}
      if(e.target.closest('[data-confirm]')){resolve({side,level});return}
      const card=e.target.closest('[data-side]');if(!card)return;
      side=card.dataset.side;
      if(!restart)resolve({side,level});
      else placeDifficulty();
    };
  });
  dialog.close();dialog.remove();document.removeEventListener('siege-language',render);
  return result;
}
export function addSideChoice(){
  const action=document.createElement('button');
  action.type='button';action.className='switch-side';action.onclick=changeSide;
  const render=()=>action.textContent=tr('Нова гра','New game');
  render();document.addEventListener('siege-language',render);
  document.querySelector('#restart form').append(action);
}
