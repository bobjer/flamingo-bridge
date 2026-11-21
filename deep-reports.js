import {tr} from './language.js';

function random(seed){
 return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296};
}
function ellipse(g,x,y,w,h,color){
 g.fillStyle=color;g.beginPath();g.ellipse(x,y,w,h,0,0,Math.PI*2);g.fill();
}
function road(g,coords,width,color){
 g.strokeStyle=color;g.lineWidth=width;g.beginPath();
 coords.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();
}
function tile(site){
 const rand=random(17039+site*1973),canvas=document.createElement('canvas');
 canvas.width=480;canvas.height=370;
 const g=canvas.getContext('2d');g.fillStyle='#636752';g.fillRect(0,0,480,370);
 for(let i=0;i<120;i++){
  const v=55+Math.floor(rand()*35);
  g.fillStyle='rgb('+v+','+(v+5)+','+(v-13)+')';g.fillRect(rand()*480,rand()*370,15+rand()*130,10+rand()*60);
 }
 for(let i=0;i<16000;i++){
  g.fillStyle=i%2?'#e8e4bf12':'#14181019';g.fillRect(rand()*480,rand()*370,1+rand()*4,1+rand()*2);
 }
 g.translate(240,185);g.rotate((site%5-2)*.14);
 g.fillStyle='#777465';g.fillRect(-145,-85,290,170);
 road(g,[[-320,135],[-116,102],[50,112],[320,80]],12,'#aaa89b');
 road(g,[[-112,112],[-112,0],[135,0]],7,'#a4a196');
 for(let i=0;i<60;i++){
  const x=rand()*390-195,y=(rand()>.5?1:-1)*(92+rand()*50),r=2+rand()*7;
  ellipse(g,x+3,y+3,r,r*.85,'#363e30');ellipse(g,x,y,r,r*.85,'#515841');
 }
 function roof(x,y,w,h,color='#aba99b'){
  g.fillStyle='#45483f';g.fillRect(x+4,y+4,w,h);g.fillStyle=color;g.fillRect(x,y,w,h);
  road(g,[[x,y+h/2],[x+w,y+h/2]],1.3,'#c1bcac');
 }
 function rows(n,spacing,draw){for(let j=0;j<n;j++)draw(j*spacing,j)}
 switch(site){
 case 0:
  rows(3,74,x=>rows(3,47,y=>{ellipse(g,x-74+3,y-47+4,17,17,'#484a41');ellipse(g,x-74,y-47,17,17,'#b7b7aa');ellipse(g,x-74,y-47,13,13,'#acac9d')}));
  break;
 case 1:
  roof(-65,-25,125,52);rows(3,50,x=>{ellipse(g,x-52,-57,19,16,'#999b90');ellipse(g,x-52,-57,11,9,'#53574e')});break;
 case 2:
  rows(3,48,y=>roof(-86,y-61,174,24));break;
 case 3:
  roof(-105,-59,149,84,'#a7a29d');rows(15,7,x=>road(g,[[x-73,45],[x-73,64]],1,'#c7c4ae'));break;
 case 4:
  road(g,[[-165,0],[165,0]],24,'#565951');g.setLineDash([12,8]);road(g,[[-155,0],[155,0]],1.8,'#dedbc3');g.setLineDash([]);rows(3,47,x=>roof(x-77,44,32,23));break;
 case 5:
  roof(-30,-16,60,32);rows(3,65,x=>{ellipse(g,x-65,43,10,10,'#b5b8ab');road(g,[[x-65,43],[x-84,53]],1.7,'#484d44')});break;
 case 6:
  rows(2,58,y=>{roof(-99,y-47,195,41);rows(11,16,x=>ellipse(g,x-82,y-29,4,4,'#696d67'))});break;
 case 7:
  g.fillStyle='#556d6b';g.fillRect(-270,-230,550,222);road(g,[[-157,-8],[159,-8]],7,'#b8b6a6');
  rows(8,23,x=>rows(3,15,y=>roof(x-83,y+1,17,9,['#906d5b','#727e78','#aaa393'][y/15])));break;
 case 8:
  ellipse(g,0,0,43,34,'#8d907d');ellipse(g,0,0,27,21,'#727865');roof(-17,-8,34,16);break;
 case 9:
  roof(-107,-41,176,80);rows(8,19,x=>road(g,[[x-98,-40],[x-98,38]],2,'#cac3ad'));roof(84,-34,25,69);break;
 case 10:
  rows(6,30,x=>{road(g,[[x-76,-64],[x-76,64]],2.5,'#acafa1');rows(4,29,y=>roof(x-82,y-49,13,9,'#686e66'))});break;
 case 11:
  road(g,[[-136,66],[-46,23],[0,0],[94,-42]],10,'#a7a18b');roof(-13,-7,26,14,'#666e59');roof(62,-60,31,18);break;
 }
 return canvas;
}
function comparison(site,wave,hit){
 const base=tile(site),canvas=document.createElement('canvas');canvas.width=960;canvas.height=370;
 const g=canvas.getContext('2d');g.drawImage(base,0,0);g.drawImage(base,480,0);
 if(hit){
  const rand=random(site*771+wave*31);
  for(let i=0;i<330;i++){
   const a=rand()*Math.PI*2,r=rand()**1.5*40;
   ellipse(g,720+Math.cos(a)*r,185+Math.sin(a)*r*.7,2+rand()*6,1+rand()*4,i%5?'#302d2770':'#b2a899aa');
  }
  g.strokeStyle='#edba75';g.lineWidth=2;g.setLineDash([6,5]);g.strokeRect(668,148,104,74);g.setLineDash([]);
 }
 for(const [x,title] of [[0,tr('ДО','BEFORE')],[480,tr('ПІСЛЯ','AFTER')]]){
  g.fillStyle='#172126ed';g.fillRect(x+10,10,125,43);g.fillStyle='white';g.font='600 22px system-ui';g.fillText(title,x+22,40);
 }
 g.fillStyle='#f2e8d1';g.fillRect(478,0,4,370);return canvas;
}
const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const icon=d=>'<svg class="dr-ico" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';
const icons={
 sat:icon('<rect x="6" y="6" width="4" height="4" rx=".6"/><path d="M6 8H2.5M13.5 8H10M8 6V2.5M8 13.5V10M3 3l2 2M13 13l-2-2"/>'),
 news:icon('<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 6h6M5 8.5h6M5 11h3.5"/>'),
 bulletin:icon('<path d="M3 6.5v3l7 3V3.5z"/><path d="M12.5 6.5v3M5 10l.8 3"/>'),
 doc:icon('<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M6 8h4M6 10.5h4"/>'),
 fire:icon('<path d="M8 2.5c.5 2.5 3.5 3.8 3.5 7a3.5 3.5 0 0 1-7 0c0-1.5.8-2.5 1.6-3.2.1 1 .6 1.5 1 1.7C7 6.5 7.2 4.5 8 2.5z"/>'),
 wrench:icon('<path d="M10.5 2.5a3 3 0 0 0-2.8 3.9L2.8 11.3a1.3 1.3 0 0 0 1.9 1.9l4.9-4.9a3 3 0 0 0 3.9-2.8l-1.8 1.8-1.7-.4-.4-1.7z"/>')
};
export function conditionText(damage,known=false){
 if(damage===100)return tr('Вийшов із чату','Left the chat')+' · 100%';
 if(damage)return tr('Пошкоджено на ','Damage ')+damage+'%';
 return known?tr('Відновлено','Restored'):tr('Працює','Operational');
}
// Ten-cell bar: ghost outline = damage before, fill = damage after.
function segments(before,after){
 return '<span class="dr-seg" aria-hidden="true">'+Array.from({length:10},(_,k)=>'<i class="'+(k*10<after?'on':'')+(k*10<before?' was':'')+'"></i>').join('')+'</span>';
}
export function appendSummary(panel,{reports,repairs,bulletin,kind}){
 const confirmed=reports.filter(r=>r.hit).length,card=document.createElement('section');card.className='dr-summary';
 card.innerHTML='<div class="dr-sum-head">'+icons.doc+'<b>'+tr('Зведення минулої хвилі','Previous wave reports')+'</b></div>'+
  '<div class="dr-counts"><span class="dr-count good"><b>'+confirmed+'</b>'+tr('підтверджено','confirmed')+'</span><span class="dr-count"><b>'+(reports.length-confirmed)+'</b>'+tr('без підтвердження','unconfirmed')+'</span><span class="dr-count warn"><b>'+(repairs?.length??0)+'</b>'+tr('ремонти','repairs')+'</span></div>'+
  (bulletin?'<p class="dr-bulletin" data-kind="'+kind+'">'+icons.bulletin+'<span>'+esc(bulletin)+'</span></p>':'');
 panel.append(card);
}
export function appendEmpty(panel){
 const box=document.createElement('p');box.className='dr-empty';
 box.innerHTML=icons.doc+'<span>'+tr('Повідомлень немає','No reports received')+'</span>';panel.append(box);
}
export function appendRepairs(panel,repairs,place){
 if(!repairs?.length)return;
 const list=document.createElement('ol');list.className='dr-timeline';
 list.setAttribute('aria-label',tr('Ремонт','Repairs'));
 for(const r of repairs){
  const li=document.createElement('li');
  li.innerHTML='<span class="dr-node">'+icons.wrench+'</span><div><b>'+esc(place(r))+'</b><small>'+tr('Ремонт','Repairs')+' · '+r.previous+'% → '+esc(conditionText(r.damage,true))+'</small>'+segments(r.previous,r.damage)+'</div>';
  list.append(li);
 }
 panel.append(list);
}
export function appendReport(panel,r,wave,place){
 const article=document.createElement('article');article.className='deep-report';article.dataset.outcome=r.hit?'hit':r.source?'miss':'unknown';panel.append(article);
 const sat=!!r.source;
 const head=document.createElement('header');head.className='dr-head';
 head.innerHTML='<span class="dr-source" data-source="'+(sat?'sat':'news')+'">'+(sat?icons.sat:icons.news)+(sat?tr('Супутник','Satellite'):tr('Новини','News'))+'</span>'+
  '<span class="dr-wave">'+tr('Хв. ','W')+wave+'</span>'+
  '<span class="dr-stamp" data-stamp="'+(r.hit?'hit':sat?'miss':'unknown')+'">'+(r.hit?tr('ПІДТВЕРДЖЕНО ВЛУЧАННЯ','CONFIRMED HIT'):tr('БЕЗ ПІДТВЕРДЖЕННЯ','UNCONFIRMED'))+'</span>';
 article.append(head);
 const title=document.createElement('strong');title.className='dr-place';title.textContent=place;article.append(title);
 if(r.damage!==undefined){
  const line=document.createElement('div');line.className='dr-damage';
  line.innerHTML='<small>'+r.previous+'% → '+esc(conditionText(r.damage,true))+'</small>'+segments(r.previous,r.damage);article.append(line);
 }
 let photo;
 if(sat){
  const frame=r.i===0?document.createElement('canvas'):comparison(r.i,wave,r.hit);photo=frame;
  const figure=document.createElement('figure');figure.className='dr-frame';
  const button=document.createElement('button');
  button.className='deep-photo';button.setAttribute('aria-label',tr('Збільшити порівняльний знімок','Enlarge comparison image'));button.append(frame);figure.append(button);
  const cap=document.createElement('figcaption');cap.textContent=tr('Супутниковий знімок · до / після · ','Satellite imagery · before / after · ')+place;figure.append(cap);article.append(figure);
  button.onclick=()=>{
   const dialog=document.createElement('dialog');dialog.className='deep-photo-dialog';
   const close=document.createElement('button');close.textContent=tr('Закрити','Close');close.onclick=()=>dialog.close();
   const copy=document.createElement('canvas');copy.width=frame.width;copy.height=frame.height;copy.getContext('2d').drawImage(frame,0,0);dialog.append(close,copy);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
  };
 }
 if(r.i===0&&(r.fire||sat)){
  const clips=document.createElement('div');
  if(r.fire){
  const label=document.createElement('p');label.className='dr-clip-label';label.innerHTML=icons.fire+'<span>'+tr('Пожежа · відео місцевих · ігрова реконструкція','Fire · eyewitness clips · game reconstruction')+'</span>';article.append(label);
  clips.className='deep-clips';article.append(clips);
  }else article.append(clips);
  let dispose;
  import('./fire-replay.js').then(({mountFireReplay})=>{
   if(clips.isConnected)dispose=mountFireReplay(clips,r.fireSeed??(wave*2654435761>>>0),{frame:photo,hit:r.hit,burning:!!r.fire,showClips:!!r.fire,allViews:!!r.demo,impact:r.impact});
  });
  return ()=>dispose?.();
 }
}
