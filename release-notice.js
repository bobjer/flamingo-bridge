import {tr} from './language.js';
let saveSession=()=>true;
export function registerSessionSave(save){saveSession=save}
export function watchRelease(){
 if(!import.meta.env.PROD)return;
 let dismissed='',offered='',checking=false;
 const notice=document.createElement('aside'),message=document.createElement('span'),accept=document.createElement('button'),later=document.createElement('button');
 notice.id='release-notice';notice.hidden=true;message.setAttribute('role','status');
 notice.append(message,accept,later);document.body.append(notice);
 const translate=()=>{
  message.textContent=tr('Доступна нова версія гри','Game update available');
  accept.textContent=tr('Зберегти й оновити','Save and update');later.textContent=tr('Пізніше','Later');
 };
 translate();document.addEventListener('siege-language',translate);
 accept.onclick=()=>{try{if(saveSession()){location.reload();return}}catch{}message.textContent=tr('Не вдалося зберегти партію. Спробуйте ще раз.','Could not save your game. Try again.')};
 later.onclick=()=>{dismissed=offered;notice.hidden=true};
 async function check(){
  if(document.hidden||checking)return;
  checking=true;
  try{
   const r=await fetch('/release.txt',{cache:'no-store'});if(!r.ok)return;
   const id=(await r.text()).trim();if(!/^[a-f0-9-]{36}$/i.test(id))return;
   offered=id;notice.hidden=id===__GAME_RELEASE__||id===dismissed;
  }catch{}finally{checking=false}
 }
 check();setInterval(check,60000);document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
}
