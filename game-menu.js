import {tr} from './language.js';
import {showRecords} from './records.js';

// Touch layout: the 3D scene fills the screen, a slim status bar sits on top, the current order and a
// three-tab dock sit at the bottom, and everything else lives in a bottom sheet (Arsenal / HQ / Menu).
// Desktop nodes are moved, never cloned, so main.js keeps writing to the same elements by id.
const ICONS={
 arsenal:'<path d="M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6"/>',
 hq:'<path d="M4 5h16v14H4zM4 10h16M9 10v9"/>',
 game:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 close:'<path d="M6 6l12 12M18 6L6 18"/>'
};
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+ICONS[name]+'</svg>';
const make=(tag,props={},...children)=>{const el=Object.assign(document.createElement(tag),props);el.append(...children);return el};

export function setupGameMenu(){
 const $=id=>document.getElementById(id);
 const phone=matchMedia('(pointer:coarse) and (max-width:1100px), (pointer:coarse) and (max-height:600px)');
 const drawer=make('dialog',{id:'game-drawer'}),board=make('dialog',{id:'score-board'});
 const button=(parent,handler,props={})=>{const el=make('button',{type:'button',...props});el.onclick=handler;parent.append(el);return el};

 // ---- bottom sheet: header with grip, tabs and close; one panel per tab ----
 const tabs=[['arsenal',()=>tr('Арсенал','Arsenal')],['hq',()=>tr('Штаб','HQ')],['game',()=>tr('Меню','Menu')]];
 const grip=make('span',{className:'sheet-grip'});
 const tablist=make('div',{className:'sheet-tabs',role:'tablist'});
 const close=button(make('div'),()=>drawer.close(),{className:'sheet-close',innerHTML:icon('close')});
 const head=make('header',{className:'sheet-head'},grip,tablist,close);
 const body=make('div',{className:'sheet-body'});
 const panes={},tabButtons={};
 for(const [key] of tabs){
  const tab=button(tablist,()=>select(key),{className:'sheet-tab',role:'tab',id:'sheet-tab-'+key});
  tab.setAttribute('aria-controls','sheet-'+key);tabButtons[key]=tab;
  panes[key]=make('section',{className:'sheet-pane',id:'sheet-'+key,role:'tabpanel',hidden:true});
  panes[key].setAttribute('aria-labelledby',tab.id);body.append(panes[key]);
 }
 drawer.append(head,body);
 let current='arsenal';
 function select(key){
  current=key;
  for(const [k] of tabs){
   const on=k===key;tabButtons[k].setAttribute('aria-selected',String(on));tabButtons[k].tabIndex=on?0:-1;panes[k].hidden=!on;
   dockButtons[k]?.setAttribute('aria-expanded',String(on&&drawer.open));
  }
  body.scrollTop=0;
 }
 function open(key){if(!phone.matches)return;select(key);if(!drawer.open)drawer.showModal();select(key);tabButtons[key].focus({preventScroll:true})}
 tablist.addEventListener('keydown',event=>{
  const i=tabs.findIndex(([k])=>k===current),step={ArrowRight:1,ArrowLeft:-1}[event.key];
  if(!step)return;event.preventDefault();const next=tabs[(i+step+tabs.length)%tabs.length][0];select(next);tabButtons[next].focus();
 });
 drawer.addEventListener('close',()=>{for(const b of Object.values(dockButtons))b.setAttribute('aria-expanded','false')});
 drawer.addEventListener('click',event=>{
  if(event.target!==drawer)return;
  const r=drawer.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)drawer.close();
 });
 // drag the header down to dismiss
 let dragY=null;
 head.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;dragY=event.clientY;head.setPointerCapture(event.pointerId);drawer.classList.add('dragging')});
 head.addEventListener('pointermove',event=>{if(dragY===null)return;drawer.style.translate='0 '+Math.max(0,event.clientY-dragY)+'px'});
 const endDrag=event=>{
  if(dragY===null)return;const moved=event.clientY-dragY;dragY=null;drawer.classList.remove('dragging');drawer.style.translate='';
  if(moved>70)drawer.close();
 };
 head.addEventListener('pointerup',endDrag);head.addEventListener('pointercancel',endDrag);

 // ---- on-screen HUD: status bar on top, order card + dock at the bottom ----
 const waveChip=make('span',{className:'m-wave'});
 const bar=make('div',{className:'m-bar'});
 const dock=make('nav',{className:'m-dock'});
 const dockButtons={};
 for(const [key] of tabs){
  const b=button(dock,()=>drawer.open&&current===key?drawer.close():open(key),{className:'m-dock-btn'});
  b.setAttribute('aria-controls',drawer.id);b.setAttribute('aria-expanded','false');b.dataset.tab=key;dockButtons[key]=b;
 }
 const bottom=make('div',{className:'m-bottom'});
 const side=make('div',{className:'m-side'});
 const hud=make('div',{className:'m-hud'},bar,side,bottom);

 // ---- menu tab content ----
 const brand=make('div',{className:'sheet-brand'},make('img',{src:'/flamingo.svg',width:34,height:34,alt:''}),make('div',{},make('strong'),make('span')));
 const menuList=make('div',{className:'sheet-menu'});
 const langRow=make('div',{className:'sheet-row'},make('span',{className:'sheet-row-label'}));
 panes.game.append(brand,menuList,langRow);

 // ---- leaderboard dialog ----
 const title=make('h2',{id:'score-title'});board.setAttribute('aria-labelledby',title.id);board.append(title);
 const content=make('div');board.append(content);
 const back=button(board,()=>board.close());
 const scores=button(document.querySelector('.panel-toggles'),()=>{
  if(drawer.open)drawer.close();
  board.showModal();
  showRecords(content,{difficulty:$('difficulty').value});
 },{className:'scores'});

 function translate(){
  drawer.setAttribute('aria-label',tr('Меню гри','Game menu'));
  for(const [key,label] of tabs){
   tabButtons[key].textContent=label();
   dockButtons[key].innerHTML=icon(key)+'<span>'+label()+'</span>';
  }
  close.setAttribute('aria-label',tr('Закрити','Close'));
  brand.querySelector('strong').textContent=tr('Сезон хлопків','Pop Season');
  brand.querySelector('span').textContent=tr('Симулятор оборони мосту','Bridge defence simulator');
  langRow.firstChild.textContent=tr('Мова','Language');
  back.textContent=tr('До гри','Back to game');
  scores.textContent=title.textContent=tr('Рекорди','Leaderboard');
  syncWave();
 }
 function syncWave(){
  const n=Number($('waveNo').textContent)||0,state=document.body.dataset.phase;
  waveChip.textContent=state==='buy'||!n?tr('Закупівля','Setup'):tr('Хвиля ','Wave ')+n;
  waveChip.dataset.state=state??'';
 }
 new MutationObserver(syncWave).observe($('waveNo'),{childList:true,characterData:true,subtree:true});
 new MutationObserver(syncWave).observe(document.body,{attributes:true,attributeFilter:['data-phase']});
 document.body.append(drawer,board);
 translate();document.addEventListener('siege-language',translate);
 document.addEventListener('game-sheet',event=>open(event.detail||'arsenal'));
 // Choosing a cruiser to steer happens on the water, so get the sheet out of the way.
 $('course').addEventListener('click',()=>{if(drawer.open)drawer.close()});

 // [node, phone destination]; the desktop spot is remembered with a comment placeholder.
 const placements=[
  ['#pause',bar],[waveChip,bar],['#clock',bar],
  ['#arcade',bottom],[dock,bottom],
  ['.helm',panes.arsenal],['#arsenal-panel',panes.arsenal],
  ['#wave-roll',panes.hq],['#hq-panel',panes.hq],['#timeline',panes.hq],
  ['#watch-game',side],['.panel-toggles .scores',menuList],['#new-game',menuList],
  ['.top .lang',langRow],['.legal',panes.game]
 ].map(([what,where])=>{
  const node=typeof what==='string'?document.querySelector(what):what;
  const slot=node.isConnected?document.createComment('slot'):null;slot&&node.before(slot);
  return {node,where,slot};
 });
 const panels=[$('hq-panel'),$('arsenal-panel')];let folded=null;
 function layout(){
  const on=phone.matches;
  document.body.classList.toggle('phone-game',on);
  if(drawer.open)drawer.close();
  for(const {node,where,slot} of placements){if(on)where.append(node);else if(slot)slot.after(node);else node.remove()}
  if(on){document.body.append(hud);folded??=panels.map(p=>p.hidden);for(const p of panels)p.hidden=false}
  else{hud.remove();if(folded)panels.forEach((p,i)=>p.hidden=folded[i]);folded=null}
  select(current);
 }
 layout();phone.addEventListener('change',layout);
 enhanceRestart();
 return board;
}

// New-game dialog: the difficulty <select> stays the source of truth; three tappable cards drive it.
function enhanceRestart(){
 const dialog=document.getElementById('restart'),select=document.getElementById('new-difficulty');
 const label=select.closest('label'),cards=document.createElement('div');
 cards.className='difficulty-cards';cards.setAttribute('role','radiogroup');
 label.after(cards);label.classList.add('difficulty-native');
 const blurbs={easy:()=>tr('Повна казна, повільні фламінго','Fat treasury, lazy flamingos'),normal:()=>tr('Чесна гра: бюджет тане','Fair fight: the budget melts'),hard:()=>tr('Пуста казна, злі птахи','Empty treasury, angry birds')};
 const pips={easy:1,normal:2,hard:3};
 function render(){
  cards.setAttribute('aria-label',tr('Складність','Difficulty'));
  cards.replaceChildren(...[...select.options].map(option=>{
   const b=document.createElement('button');b.type='button';b.className='difficulty-card';b.setAttribute('role','radio');b.dataset.level=option.value;
   const on=select.value===option.value;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;
   const meter=document.createElement('span');meter.className='difficulty-meter';meter.innerHTML='<i></i><i></i><i></i>';meter.dataset.n=pips[option.value]??2;
   const name=document.createElement('strong');name.textContent=option.textContent;
   const note=document.createElement('small');note.textContent=blurbs[option.value]?.()??'';
   b.append(meter,name,note);
   b.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));render();b.focus()};
   return b;
  }));
 }
 cards.addEventListener('keydown',event=>{
  const step={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[event.key];if(!step)return;event.preventDefault();
  const options=[...select.options],i=options.findIndex(o=>o.value===select.value);
  select.value=options[(i+step+options.length)%options.length].value;render();cards.querySelector('[aria-checked=true]').focus();
 });
 new MutationObserver(()=>{if(dialog.open)render()}).observe(dialog,{attributes:true,attributeFilter:['open']});
 document.addEventListener('siege-language',render);render();
}
