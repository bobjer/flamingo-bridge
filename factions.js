import {tr} from './language.js';
import './factions.css';

const sideKey = 'pop-side-v1';
export const read = key => {try{return JSON.parse(localStorage.getItem(key))}catch{return null}};
export const write = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
export const preferredLevel = () => read('pop-level-v1') ?? 'normal';
export const rememberLevel = value => write('pop-level-v1',value);
export function levelField(value, next = false) {
 const select = document.querySelector('#difficulty').cloneNode(true);
 select.removeAttribute('id'); select.disabled = false; select.dataset.levelPick = '';
 for (const option of select.options) option.toggleAttribute('selected', option.value === value);
 const label = next ? tr('Складність нової гри','New game difficulty') : tr('Складність','Difficulty');
 return '<label class="side-level">' + label + select.outerHTML + '</label>';
}
const flag = '<svg viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="m50 5 36 16v27c0 23-17 37-36 46-19-9-36-23-36-46V21z"/><path fill="#27251c" d="m50 21 6 13 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2zM31 65l19 9 19-9v5l-19 10-19-10z"/></svg>';
export const languageButton = () => '<button type="button" data-language>'+tr('English','Українська')+'</button>';
export async function changeSide(){
  if(document.querySelector('.faction-picker:modal')) return;
  const result = await pickSide(true);
  if(!result) return;
  // Consume this instruction at boot, after the old page's final save has finished.
  write(sideKey,{restart:result.side,level:result.level});
  location.reload();
}
export async function chooseSide(){
  const remembered=read(sideKey);
  if(['bridge','coalition'].includes(remembered)) return remembered;
  if(['bridge','coalition'].includes(remembered?.restart)){
    localStorage.removeItem('pink-siege:match:v1');
    localStorage.removeItem('pop-coalition-v2');
    rememberLevel(remembered.level); write(sideKey,remembered.restart);
    return remembered.restart;
  }
  const {side,level}=await pickSide(false);
  rememberLevel(level); write(sideKey,side);return side;
}
async function pickSide(restart){
  let side=restart?read(sideKey):null, level=preferredLevel();
  const dialog=document.createElement('dialog');
  dialog.className='faction-picker';dialog.setAttribute('aria-labelledby','faction-title');
  document.body.append(dialog);
  const render=()=>{
    dialog.innerHTML='<div class="faction-head"><span>POP SEASON</span>'+languageButton()+'</div><h1 id="faction-title">'+tr('Оберіть сторону','Choose your side')+'</h1>'+(restart?'<p class="restart-warning">'+tr('Увесь прогрес збережених партій обох сторін буде втрачено. Нова гра почнеться з першої хвилі.','All saved progress for both factions will be lost. The new game starts at wave one.')+'</p>':'')+levelField(level,true)+'<div class="faction-options">'+
      '<button data-side="coalition"><img src="/coalition-koala.svg" alt=""><small>'+tr('НАСТУП','OFFENCE')+'</small><strong>'+tr('Коаліція охочих','Coalition of the Willing')+'</strong><span>'+tr('Зберіть зграю, виконайте контракт і переконайте спонсорів оплатити наступну хвилю.','Build a flock, deliver the contract and convince the sponsors to fund another wave.')+'</span></button>'+
      '<button data-side="bridge">'+flag+'<small>'+tr('ОБОРОНА','DEFENCE')+'</small><strong>'+tr('Гарнізон скрєп','Garrison of Iron Values')+'</strong><span>'+tr('Тримайте міст, латайте полотно й освоюйте бюджет.','Hold the bridge, patch the road and burn through the budget.')+'</span></button></div>';
    if (restart) {
      const body=document.createElement('div'); body.className='faction-body'; body.append(...dialog.children);dialog.append(body);
      dialog.insertAdjacentHTML('beforeend','<footer class="restart-actions"><button type="button" data-cancel>'+tr('Скасувати','Cancel')+'</button><button type="button" data-confirm>'+tr('Почати спочатку','Start over')+'</button></footer>');
      dialog.querySelectorAll('[data-side]').forEach(card=>card.setAttribute('aria-pressed',String(card.dataset.side===side)));
    }
  };
  render();document.addEventListener('siege-language',render);
  dialog.onchange=e=>{if(e.target.matches('[data-level-pick]'))level=e.target.value};
  dialog.showModal();
  const result=await new Promise(resolve=>{
    dialog.oncancel=e=>{e.preventDefault();if(restart)resolve(null)};
    dialog.onclick=e=>{
      if(e.target.closest('[data-language]')){document.querySelector('.lang').click();return}
      if(e.target.closest('[data-cancel]')){resolve(null);return}
      if(e.target.closest('[data-confirm]')){resolve({side,level});return}
      const card=e.target.closest('[data-side]');if(!card)return;
      side=card.dataset.side;
      if(!restart)resolve({side,level});
      else dialog.querySelectorAll('[data-side]').forEach(el=>el.setAttribute('aria-pressed',String(el===card)));
    };
  });
  dialog.close();dialog.remove();document.removeEventListener('siege-language',render);
  return result;
}
export function addSideChoice(){
  const action=document.createElement('button');
  action.type='button';action.className='switch-side';action.onclick=changeSide;
  const render=()=>action.textContent=tr('Обрати іншу сторону','Choose another side');
  render();document.addEventListener('siege-language',render);
  document.querySelector('#restart form').append(action);
}
