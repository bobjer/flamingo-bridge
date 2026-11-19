import {tr} from './language.js';
import {showRecords} from './records.js';

export function setupGameMenu(){
 const phone=matchMedia('(pointer:coarse) and (max-width:1100px), (pointer:coarse) and (max-height:600px)');
 const drawer=document.createElement('dialog'),board=document.createElement('dialog');
 drawer.id='game-drawer';board.id='score-board';
 const button=(parent,handler)=>{
  const el=document.createElement('button');el.type='button';el.onclick=handler;parent.append(el);return el;
 };
 const opener=button(document.body,()=>drawer.showModal());opener.id='open-drawer';opener.setAttribute('aria-controls',drawer.id);
 drawer.addEventListener('click',event=>{
  if(event.target!==drawer)return;
  const r=drawer.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)drawer.close();
 });
 const hide=button(drawer,()=>drawer.close());
 const title=document.createElement('h2');title.id='score-title';board.setAttribute('aria-labelledby',title.id);board.append(title);
 const content=document.createElement('div');board.append(content);
 const back=button(board,()=>board.close());
 const scores=button(document.querySelector('.panel-toggles'),()=>{
  if(drawer.open)drawer.close();
  board.showModal();
  showRecords(content,{difficulty:document.getElementById('difficulty').value});
 });
 function translate(){
  opener.textContent='☰ '+tr('Меню','Menu');drawer.setAttribute('aria-label',tr('Меню гри','Game menu'));
  hide.textContent=tr('До мосту','Back to bridge');back.textContent=tr('До гри','Back to game');
  scores.textContent=title.textContent=tr('Рекорди','Leaderboard');
 }
 translate();document.addEventListener('siege-language',translate);
 document.body.append(drawer,board);
 const movable=['.top','#arcade','.strip','#hq-panel','#arsenal-panel','.helm','.zoom','#arena-radar','#wave-roll','#caption','.legal'].map(selector=>{
  const node=document.querySelector(selector),slot=document.createComment(selector);node.before(slot);return {node,slot};
 });
 function layout(){
  document.body.classList.toggle('phone-game',phone.matches);
  if(drawer.open)drawer.close();
  for(const {node,slot} of movable){if(phone.matches)drawer.append(node);else slot.after(node)}
 }
 layout();phone.addEventListener('change',layout);
 return board;
}
