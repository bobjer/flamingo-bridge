import {coalitionHeader} from './coalition-header.js';
import {beginDiplomacy,recordLaunch,deliveryChance} from './deep-supply.js';
import {partnerTurn,patrolSectors} from './deep-partners.js';
import {defenses,interceptionChance,rollInterception} from './deep-interception.js';
import {registerSessionSave} from './release-notice.js';
import {tr} from './language.js';
import {changeSide,read,write} from './factions.js';
import './deepstrike.css';
import {advanceConditions} from './site-condition.js';
import {appendReport,conditionText} from './deep-reports.js';
import {cities,points,district,boardPath,travel} from './deep-atlas.js';

const key='pop-deepstrike-v1';
const names=[
 ['Нафтокомбінат','Oil works'],['Енергостанція','Power station'],['Склад','Depot'],
 ['Маркет','Market'],['Аеродром','Airfield'],['РЕБ','Jammer'],['Датацентр','Data centre'],
 ['Порт','Port'],['ППО','Air defence'],['Завод','Factory'],['Підстанція','Substation'],['Пускова','Launcher']
];
const layers=[0,1,2,0,0,2,0,0,2,0,1,2];
const sources=[['Власна розвідка','Field intelligence'],['Партнери','Partners'],['Супутник','Satellite']];
// Ranges and delivery intervals are board-game units.
const fleet=[
 {name:['Шурхіт','Rustle'],baseChance:24,weakTo:'net',limit:77,cycle:1},
 {name:['Буревійник','Squallwing'],baseChance:18,weakTo:'guard',limit:103,cycle:3},
 {name:['Міднокрил','Copperwing'],baseChance:20,weakTo:'guard',limit:116,cycle:4},
 {name:['Тіньолист','Shadeleaf'],baseChance:22,weakTo:'net',limit:91,cycle:2},
 {name:['Зорескок','Starbound'],baseChance:8,weakTo:'dome',limit:69,partner:true,restrictedChance:0,cycle:2},
 {name:['Присмерк','Gloaming'],baseChance:16,weakTo:'guard',limit:84,partner:true,restrictedChance:.35,cycle:3},
 {name:['Пустушки','Dummies'],surveyOnly:true,surveyLoss:.2,limit:69,cycle:1,batch:4,start:12}
];
// Stylized board icons, all drawn facing right.
const flightIcons=[
 'M2.7 0 .3 -.52 -1 -2.3 -1 -.55 -2 -.7 -2 .7 -1 .55 -1 2.3 .3 .52Z',
 'M3 0 1 -.55 -.5 -.55 -1.6 -1.6 -1.2 -.48 -2.7 -.8 -2.2 0 -2.7 .8 -1.2 .48 -1.6 1.6 -.5 .55 1 .55Z',
 'M3 0 .5 -.5 -1.7 -2.5 -1 -.45 -2.5 -.8 -2.3 .8 -1 .45 -1.7 2.5 .5 .5Z',
 'M2.4 0 -.5 -1.1 -2.3 -2.1 -1.6 0 -2.3 2.1 -.5 1.1Z',
 'M3 0 1 -.65 -1.4 -.65 -2.6 -1.4 -2.2 0 -2.6 1.4 -1.4 .65 1 .65Z',
 'M2.8 0 1 -.6 0 -.6 -.7 -2 -.9 -2 -.9 -.6 -2 -.6 -2.5 -1 -2.4 1 -2 .6 -.9 .6 -.9 2 -.7 2 0 .6 1 .6Z',
 'M2.6 0 0 -1.45 -2.6 0 0 1.45Z M1.2 0 0 .6 -1.2 0 0 -.6Z'
];
const north='0,30 5,32 10,35 14,39 17,40 22,39 26,39';
const inner='26,39 24,44 20,48 20,52 22,58 23,64 24,69 25,74 25,80 26,87';
const homeOutline=north+' '+inner+' 19,90 14,88 8,87 0,88';
const homeVertices=homeOutline.split(' ').map(pair=>pair.split(',').map(Number));
function inHome([x,y]){
 let inside=false;
 for(let i=0,j=homeVertices.length-1;i<homeVertices.length;j=i++){
  const [ax,ay]=homeVertices[i],[bx,by]=homeVertices[j];
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside;
}
const playable=points.map(point=>!inHome(point));
const surveySectors=[
 {label:['Лука','Meadow'],point:[12,55]},
 {label:['Гай','Grove'],point:[15,69]},
 {label:['Схил','Hillside'],point:[11,80]}
];
const bridgeReach=Math.hypot((43.5+50)/2-7,(89.7+90.7)/2-48);
const initial=()=>({wave:1,credits:2,intel:{},reports:[],flights:[],started:0,marks:[]});
export function startDeepstrike(){
 const s=read(key)||initial(), selected=new Map((s.plan?.targets??[]).filter(([i])=>playable[i])),visible=s.plan?.layers??[true,true,true];
 const surveys=s.plan?.surveys??{};
 for(const [key,row] of Object.entries(surveys)){for(const type of Object.keys(row))if(!fleet[type]?.surveyOnly)delete row[type];if(!Object.keys(row).length)delete surveys[key]}
 let sector=s.plan?.sector??0;
 let closeReport,autoTimer,autoOn=false;
 let marking=false, active=s.plan?.unit??0, timer, city=s.plan?.city??-1;
 s.conditions??={};
 s.stock??=[];
 fleet.forEach((unit,id)=>{s.stock[id]??=unit.start??1});
 if(!playable[city])city=-1;
 const retired=s.flights.filter(f=>!f.survey&&!playable[f.i]);
 if(retired.length){
  for(const f of retired)s.stock[f.type??0]++;
  s.flights=s.flights.filter(f=>f.survey||playable[f.i]);
  if(!s.flights.length)s.started=0;
 }
 const available=type=>s.stock[type]-[...selected.values()].filter(id=>id===type).length-Object.values(surveys).reduce((sum,row)=>sum+(row[type]??0),0);
 const save=()=>write(key,{...s,plan:{targets:[...selected],surveys,sector,layers:visible,unit:active,city}});
 if(retired.length||selected.size!==(s.plan?.targets?.length??0))save();
 const root=document.createElement('main');root.className='deep-board';document.body.append(root);
 const radius=(type=active)=>Math.min(fleet[type].limit,bridgeReach+(fleet[type].limit-69)*.8+(s.wave-1)*5);
 const distance=i=>Math.hypot(points[i][0]-7,points[i][1]-48);
 const flagged=()=>new Set([...s.marks.map(district),...Object.keys(s.intel).filter(i=>(+i===5||+i===8)&&playable[i]&&s.wave-s.intel[i].wave<3).map(i=>district(points[i]))]);
 function intelligence(buy=false){
  const feeds=buy?[2]:s.partner?.blocked?[0]:[0,1];
  for(const source of feeds){
   if(Math.random()<(source===2?.15:source===1?.55:.25))continue;
   const candidates=names.map((_,i)=>i).filter(i=>playable[i]&&layers[i]===2);
   const i=candidates[Math.floor(Math.random()*candidates.length)];
   s.intel[i]={source,wave:s.wave};
  }
 }
 if(!read(key))intelligence();
 if(!s.diplomacy){s.diplomacy=beginDiplomacy(s.wave);save()}
 function finish(){
  const surveyFlights=s.flights.filter(f=>f.survey);
  s.surveyReports=surveyFlights.map(({sector,type,count})=>({sector,type,count}));
  s.surveyReports.forEach((group,index)=>{
   const lost=surveyFlights[index].losses?.filter(Boolean).length??0;
   group.lost=lost;s.stock[group.type]+=group.count-lost;
  });
  s.reports=s.flights.filter(f=>!f.survey&&Math.random()<.75).map(f=>({i:f.i,source:Math.random()<.5?0:1,hit:!f.lost&&Math.random()<.8}));
  for(const report of s.reports)if(report.i===0&&report.hit){report.fire=Math.random()<.75;if(report.fire)report.fireSeed=crypto.getRandomValues(new Uint32Array(1))[0]}
  s.repairs=advanceConditions(s.conditions,s.reports,s.wave);
  fleet.forEach((item,id)=>{
   if(s.wave%item.cycle===0&&(!item.partner||Math.random()<deliveryChance(item,s.wave,s.diplomacy)))s.stock[id]+=item.batch??1;
  });
  s.lastTracks=s.flights;s.wave++;s.credits++;s.started=0;s.flights=[];s.diplomacy=beginDiplomacy(s.wave,s.diplomacy.embargoThrough);s.partner=partnerTurn(s.partner,s.wave);intelligence();save();
 }
 function render(){
  closeReport?.();closeReport=null;
  clearTimeout(timer);clearTimeout(autoTimer);
  if(!root.isConnected)return;
  const elapsed=Date.now()-s.started;
  if(s.started&&s.flights.every(f=>elapsed>=f.duration+1200))finish();
  const flying=!!s.started;
  const phase=flying?tr('У польоті','In flight'):tr('Планування','Planning');
  const autoLabel=autoOn?tr('Грати самому','Take over'):tr('Автогра','Autoplay');
  root.innerHTML=coalitionHeader('<button class="c-sides c-auto" data-auto aria-pressed="'+autoOn+'">'+autoLabel+'</button><span class="chip"><i class="dot"></i>'+phase+'</span><button class="c-sides" data-exit>'+tr('Сторони','Factions')+'</button>')+
   '<section class="c-main deep-layout"><aside class="col c-left"><section class="panel br"><div class="label">'+tr('Поточна фаза','Current phase')+'</div><div class="phase-row"><b class="big">'+String(s.wave).padStart(2,'0')+'</b><div><h1>'+tr('Діпстрайк','Deepstrike')+'</h1><div class="c-phase">'+phase+'</div></div></div><div class="stat">'+tr('Кредити','Credits')+'<b>'+s.credits+'</b></div></section><section class="panel br" data-supply></section></aside>'+
   '<section class="c-play panel br"><div class="label">'+tr('Карта секторів','Sector map')+'</div><div class="deep-layers c-toggles"></div><svg viewBox="0 0 100 100" aria-label="'+tr('Карта секторів','Sector map')+'"></svg></section>'+
   '<aside class="col c-right"><section class="panel br"><div class="label">'+tr('План хвилі','Wave plan')+'</div><div class="c-cards" data-plan></div></section></aside></section>';
  root.querySelector('[data-exit]').onclick=()=>{autoOn=false;clearTimeout(autoTimer);changeSide()};
  root.querySelector('[data-language]').onclick=()=>document.querySelector('.lang').click();
  root.querySelector('[data-auto]').onclick=()=>{autoOn=!autoOn;render()};
  const controls=root.querySelector('.deep-layers'),panel=root.querySelector('[data-plan]'),supply=root.querySelector('[data-supply]');
  const embargo=s.wave<=s.diplomacy.embargoThrough;
  if(embargo||s.diplomacy.talks){
   const notice=document.createElement('div');notice.className='c-phase';
   notice.textContent=embargo?tr('Трамп обмежив поставки до кінця хвилі ','Trump restricted deliveries through wave ')+s.diplomacy.embargoThrough:
    tr('Триває «пісділ». Атака на нафтокомбінат може зупинити партнерські поставки.','Peace talks underway. A wave targeting the oil works may trigger supply restrictions.');
   supply.before(notice);
  }
  function button(parent,label,action,disabled=false,pressed){
   const el=document.createElement('button');el.textContent=label;el.disabled=disabled;el.onclick=action;if(pressed!==undefined)el.setAttribute('aria-pressed',pressed);el.className=parent===panel?'c-sponsor':'c-sides';parent.append(el);return el;
  }
  [['Підприємства','Industry'],['Енергетика','Energy'],['Розвідка','Intelligence']].forEach((name,i)=>button(controls,tr(...name),()=>{visible[i]=!visible[i];render()},false,visible[i]));
  if(!flying){
   supply.innerHTML='<div class="label">'+tr('Арсенал · ігрові поділки','Arsenal · board units')+'</div><div class="c-list"></div>';
   const list=supply.lastElementChild;
   const picker=document.createElement('label'),select=document.createElement('select');
   picker.className='side-level';picker.textContent=tr('Сектор розвідки','Survey sector');
   surveySectors.forEach((entry,i)=>select.add(new Option(tr(...entry.label),String(i))));
   select.value=String(sector);select.onchange=()=>{sector=Number(select.value);save();render()};
   picker.append(select);list.before(picker);
   fleet.forEach((unit,id)=>{
    const card=document.createElement('button');
    card.type='button';card.className='c-buy deep-unit';card.dataset.unit=id;
    card.setAttribute('aria-pressed',String(id===active));
    card.innerHTML='<span class="c-badge"><svg aria-hidden="true" viewBox="-3.5 -3 7 6"><path fill="currentColor" d="'+flightIcons[id]+'"/></svg></span>'+
     '<span class="c-name"><b>'+tr(...unit.name)+'</b><small>'+tr('Дальність','Range')+' '+Math.round(radius(id))+' / '+unit.limit+'</small></span>'+
     '<span class="deep-count" aria-label="'+tr('Доступно','Available')+' '+available(id)+'">×'+available(id)+'</span>'+
     (unit.surveyOnly?'<small class="c-hint">'+tr('Розвідка · ризик перехоплення','Survey · interception chance')+' '+Math.round(unit.surveyLoss*100)+'%'+'</small>':
     '<small class="c-hint">'+tr(...defenses[unit.weakTo].profile)+' · '+tr('Шанс перехоплення','Intercept chance')+' '+unit.baseChance+'%</small>'+
     '<small class="c-hint">'+tr('Проти ППО','Against')+' «'+tr(...defenses[unit.weakTo].name)+'» · '+interceptionChance(unit,unit.weakTo)+'%</small>')+
     '<small class="c-hint">'+(unit.partner?tr('Шанс поставки','Delivery chance')+' '+Math.round(deliveryChance(unit,s.wave,s.diplomacy)*100)+'%':tr('Виробництво','Production'))+' +'+(unit.batch??1)+' / '+unit.cycle+' '+tr('хв. гри','game waves')+'</small>';
    card.onclick=()=>{active=id;render();root.querySelector('[data-unit="'+id+'"]').focus({preventScroll:true})};
    const group=document.createElement('div'),stepper=document.createElement('div');
    stepper.className='deep-survey-stepper';
    const assigned=surveys[sector]?.[id]??0;
    function adjust(delta){
     const row=surveys[sector]??={};
     row[id]=assigned+delta;
     if(!row[id])delete row[id];
     if(!Object.keys(row).length)delete surveys[sector];
     if(delta>0)s.lastTracks=[];
     save();render();
    }
    const minus=button(stepper,'−',()=>adjust(-1),assigned===0);
    minus.setAttribute('aria-label',tr('Зняти з розвідки','Remove from survey')+' · '+tr(...unit.name));
    stepper.append(document.createTextNode(tr('Розвідка','Survey')+' ×'+assigned));
    const plus=button(stepper,'+',()=>adjust(1),available(id)<=0);
    plus.setAttribute('aria-label',tr('Додати до розвідки','Add to survey')+' · '+tr(...unit.name));
    group.append(card);
    if(unit.surveyOnly)group.append(stepper);
    if(unit.surveyOnly)button(group,tr('Купити 5 · 1 кредит','Buy 5 · 1 credit'),()=>{
     if(s.credits<1)return;
     s.credits--;s.stock[id]+=5;save();render();
    },s.credits<1);
    list.append(group);
   });
  }
  supply.hidden=flying;
  const zoom=document.createElement('select');zoom.setAttribute('aria-label',tr('Масштаб карти','Map scale'));
  zoom.add(new Option(tr('Усі області','All regions'),'-1'));
  cities.forEach((name,i)=>playable[i]&&zoom.add(new Option(tr(...name),String(i))));
  zoom.value=String(city);zoom.onchange=()=>{city=Number(zoom.value);render()};controls.append(zoom);
  const map=root.querySelector('.c-play > svg');
  if(city>=0){const [x,y]=points[city];map.setAttribute('viewBox',[Math.min(62,Math.max(0,x-19)),Math.min(62,Math.max(0,y-19)),38,38].join(' '))}
  const flags=flagged();
  map.innerHTML='<defs><linearGradient id="wake" gradientUnits="userSpaceOnUse" x1="-7" x2="0"><stop stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="white" stop-opacity=".8"/></linearGradient><pattern id="sector-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#405550" stroke-width=".3"/></pattern></defs><rect width="100" height="100" fill="url(#sector-grid)" opacity=".3"/><circle cx="7" cy="48" r="'+radius()+'" fill="#69d49b12" stroke="#80c8b7" stroke-width=".4"/>';
  const outer='26,39 29,40 31,43 32,49 34,55 39,59 42,62 40,68 38,72 39,76 38,80 40,84 43,88';
  const coast='0,88 8,87 14,88 19,90 26,87 30,89 35,92 40,92 44,90 43,88 48,87 50,90 52,93 62,94 70,91 83,94 92,90 100,91';
  const reverse=line=>line.split(' ').reverse().join(' ');
  const sea=tr('Море','Sea'),bridge=tr('Міст','Bridge');
  map.insertAdjacentHTML('afterbegin','<rect class="atlas-land land-2" width="100" height="100"/>'+
   '<polygon class="atlas-land land-1" points="'+outer+' 44,90 40,92 35,92 30,89 '+reverse(inner)+'"/>'+
   '<polygon class="atlas-land land-0" points="'+homeOutline+'"/>'+
   '<polygon fill="#203d4d" points="'+coast+' 100,100 0,100"/>');
  map.insertAdjacentHTML('beforeend','<path class="atlas-river" d="M48 1 Q46 15 49 24 T46 45 Q39 55 43 65 T40 86"/>');
  const xEdges=[0,22,41,63,100],yEdges=[0,40,61,100];
  for(const id of flags){
   const col=id%4,row=Math.floor(id/4);
   map.insertAdjacentHTML('beforeend','<rect class="atlas-alert" x="'+xEdges[col]+'" y="'+yEdges[row]+'" width="'+(xEdges[col+1]-xEdges[col])+'" height="'+(yEdges[row+1]-yEdges[row])+'"/>');
  }
  for(const line of [north,inner,outer])map.insertAdjacentHTML('beforeend','<polyline class="atlas-border" points="'+line+'"/>');
  map.insertAdjacentHTML('beforeend','<polyline fill="none" stroke="#70919a" stroke-width=".45" points="'+coast+'"/>'+
   '<g pointer-events="none"><path d="M43.5 89.7L50 90.7" stroke="#232c30" stroke-width="1.9"/><path d="M43.5 89.7L50 90.7" stroke="#e9d6a7" stroke-width=".85"/><text x="46" y="95">'+bridge+'</text></g>');
  for(const [name,x,y] of [['Ненька',10,62],['Ордло',31,67],['Мордор',78,13],[sea,12,96]])map.insertAdjacentHTML('beforeend','<text class="atlas-territory" transform="rotate('+(name==='Ордло'?82:0)+' '+x+' '+y+')" x="'+x+'" y="'+y+'">'+name+'</text>');
  const seen=s.partner?.seen;
  if(visible[2]&&seen){
   const [x,y]=patrolSectors[seen.sector];
   const label=tr('ППО · хв. ','AD · wave ')+seen.wave;
   map.insertAdjacentHTML('beforeend','<g class="partner-sighting" pointer-events="none" opacity="'+(seen.wave===s.wave?1:.55)+'"><title>'+tr('Останнє спостереження партнерів','Last partner sighting')+'</title><circle cx="'+x+'" cy="'+y+'" r="2.4" fill="none" stroke="#f0b46d" stroke-width=".45" stroke-dasharray=".7 .45"/><text x="'+x+'" y="'+(y+4.7)+'">'+label+'</text></g>');
  }
  if(!flying){
   const [x,y]=surveySectors[sector].point;
   map.insertAdjacentHTML('beforeend','<g pointer-events="none"><circle cx="'+x+'" cy="'+y+'" r="2.5" fill="none" stroke="#91d8ae" stroke-width=".35" stroke-dasharray=".7 .5"/><text x="'+x+'" y="'+(y+4.8)+'">'+tr(...surveySectors[sector].label)+'</text></g>');
  }
  if(!flying)for(const [i,type] of selected){
   map.insertAdjacentHTML('beforeend','<polyline class="atlas-plan" points="'+boardPath(i,type,flags).map(p=>p.join(',')).join(' ')+'"/>');
  }
  points.forEach(([x,y],i)=>playable[i]&&map.insertAdjacentHTML('beforeend','<text class="atlas-city" x="'+x+'" y="'+(y-3.6)+'">'+tr(...cities[i])+'</text>'));
  points.forEach(([x,y],i)=>{
   if(!playable[i]||!visible[layers[i]]||(layers[i]===2&&!s.intel[i]))return;
   const label=tr(...names[i]),intel=s.intel[i],status=conditionText(s.conditions[i]?.damage,!!s.conditions[i]);
   map.insertAdjacentHTML('beforeend','<g data-site="'+i+'"><title>'+status+'</title><circle cx="'+x+'" cy="'+y+'" r="2" fill="'+(selected.has(i)?'#ffc75c':'#8ececc')+'"/><text x="'+x+'" y="'+(y+5)+'">'+label+'</text></g>');
   if(!flying)button(panel,tr(...cities[i])+' · '+label+' · '+status+(selected.has(i)?' · '+tr(...fleet[selected.get(i)].name):'')+(intel?' · '+tr(...sources[intel.source])+' W'+intel.wave:''), ()=>toggle(i),!selected.has(i)&&(fleet[active].surveyOnly||distance(i)>radius()||available(active)<1),selected.has(i)).classList.add('target-card');
  });
  function toggle(i){
   if(flying||!playable[i])return;
   if(selected.has(i))selected.delete(i);
   else if(!fleet[active].surveyOnly&&distance(i)<=radius()&&available(active)>0){
    selected.set(i,active);
    s.lastTracks=[];save();
   }
   render();
  }
  s.marks.forEach(([x,y])=>map.insertAdjacentHTML('beforeend','<text class="deep-mark" x="'+x+'" y="'+y+'">?</text>'));
  map.onclick=e=>{
   if(flying)return;
   if(marking){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(map.getScreenCTM().inverse());const id=district([p.x,p.y]);if(s.marks.some(q=>district(q)===id))s.marks=s.marks.filter(q=>district(q)!==id);else s.marks.push([p.x,p.y]);save();marking=false;render();return}
   const site=e.target.closest('[data-site]');if(site)toggle(+site.dataset.site);
  };
  // Spread survey markers across the sector on screen, including mixed-type groups.
  function mapFlights(flights){
   const offsets=new Map(),totals=new Map();
   for(const f of flights)if(f.survey)totals.set(f.sector,(totals.get(f.sector)??0)+f.count);
   return flights.flatMap(f=>{
    if(!f.survey)return [f];
    const start=offsets.get(f.sector)??0,total=totals.get(f.sector);
    offsets.set(f.sector,start+f.count);
    const [origin,end]=f.path,dx=end[0]-origin[0],dy=end[1]-origin[1],length=Math.hypot(dx,dy);
    return Array.from({length:f.count},(_,index)=>{
     const lane=(start+index-(total-1)/2)*Math.min(2.7,15/total);
     const offset=[-dy/length*lane,dx/length*lane];
     const path=[origin,[origin[0]+dx*.36+offset[0],origin[1]+dy*.36+offset[1]],
      [end[0]+offset[0],end[1]+offset[1]]];
     return {...f,path,number:start+index+1,lost:f.losses?.[index]??false};
    });
   });
  }
  function drawTracks(overlay,flights,elapsed){
   const markers=[];
   for(const f of flights){
    const t=Math.min(1,elapsed/f.duration);
    const path=f.path??[[7,48],points[f.i]];
    const {x:px,y:py,angle,segment}=travel(path,t*(f.lost?.68:1));
    const flown=[...path.slice(0,segment+1),[px,py]];
    const coords=flown.map(p=>p.join(',')).join(' ');
    overlay.insertAdjacentHTML('beforeend','<g fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline stroke="#341521" stroke-width="1.15" points="'+coords+'"/><polyline class="atlas-track" stroke="#ff3947" stroke-width=".65" points="'+coords+'"/></g>');
    if(elapsed!==Infinity&&f.surprise&&t>=.4){
     const [x,y]=f.surprise;
     overlay.insertAdjacentHTML('beforeend','<circle cx="'+x+'" cy="'+y+'" r="3.5" fill="#db564738" stroke="#eb7962" stroke-width=".4"/><text x="'+x+'" y="'+(y+1)+'">!</text>');
    }
    const symbol=t===1?(f.lost?'<text class="deep-cross">×</text>':f.survey?'<text>✓</text>':
     '<g class="atlas-flame"><circle r="2.1" fill="#ff802740"/><path d="M0 1.5C-2 1-1.6-.4-.6-1.3L-.45-.45Q.4-1 .15-2.4C2 .1 1.6 1.2 0 1.5" fill="#ff972e"/><circle cy=".6" r=".55" fill="#ffe39a"/></g>'):
     '<g transform="rotate('+angle+')"><path d="M-7 0H0" stroke="url(#wake)" stroke-width=".7"/><path d="'+(flightIcons[f.type]??flightIcons[0])+'" fill="white" stroke="#25343a" stroke-width=".15"/></g>';
    markers.push('<g '+(f.survey?'data-survey-unit="'+f.number+'" ':'')+'transform="translate('+px+' '+py+')"><title>'+tr(...fleet[f.type??0].name)+(f.survey?' #'+f.number:'')+'</title>'+symbol+'</g>');
   }
   overlay.insertAdjacentHTML('beforeend',markers.join(''));

  }
  if(!flying&&s.lastTracks?.length){
   const history=document.createElementNS('http://www.w3.org/2000/svg','g');
   history.setAttribute('pointer-events','none');map.append(history);
   drawTracks(history,mapFlights(s.lastTracks),Infinity);
  }
  if(flying){
   panel.textContent=tr('Хвиля в польоті','Wave in flight');
   const overlay=document.createElementNS('http://www.w3.org/2000/svg','g');map.append(overlay);
   const tracks=mapFlights(s.flights);
   function animate(){
    const elapsed=Date.now()-s.started;
    if(s.flights.every(f=>elapsed>=f.duration+1200)){render();return}
    overlay.replaceChildren();
    drawTracks(overlay,tracks,elapsed);
    timer=setTimeout(animate,80);
   }
   animate();return;
  }
  button(panel,tr('Купити знімок · 1','Buy imagery · 1'),()=>{s.credits--;intelligence(true);save();render()},s.credits<1);
  button(panel,tr('Позначити ймовірну загрозу','Mark suspected threat'),()=>{marking=!marking;render()},false,marking);
  const groups=Object.entries(surveys).flatMap(([sector,row])=>Object.entries(row).map(([type,count])=>({sector:Number(sector),type:Number(type),count})));
  const total=selected.size+groups.reduce((sum,g)=>sum+g.count,0);
  const launch=button(panel,tr('Запустити хвилю','Launch wave')+' ('+total+')',()=>{
   recordLaunch(s.diplomacy,s.wave,selected);
   for(const type of selected.values())s.stock[type]--;
   s.flights=[...selected].map(([i,type])=>{
    const path=boardPath(i,type,flags);
    const surprise=Math.random()<.27?path[1]:null;
    return {i,type,path,surprise,duration:Math.round(2500+travel(path,1).total*(65+Math.random()*90)),lost:rollInterception(fleet[type],!!surprise||(s.partner&&district(points[i])===district(patrolSectors[s.partner.sector])))};
   });
   for(const group of groups){
    s.stock[group.type]-=group.count;
    const risk=fleet[group.type].surveyLoss??0;
    const losses=Array.from({length:group.count},()=>risk>0&&Math.random()<risk);
    s.flights.push({...group,survey:true,losses,path:[[7,48],surveySectors[group.sector].point],duration:4500});
   }
   for(const key of Object.keys(surveys))delete surveys[key];
   selected.clear();marking=false;s.started=Date.now();save();render();
  },!total);
  launch.className='c-start';
  if(autoOn)autoTimer=setTimeout(()=>{
   if(document.hidden||document.querySelector('dialog:modal')){render();return}
   if(total){launch.click();return}
   const cards=[...panel.querySelectorAll('button[aria-pressed="false"]:enabled')].filter(b=>b.classList.contains('target-card'));
   if(cards.length){cards[Math.floor(Math.random()*cards.length)].click();return}
   const next=s.stock.findIndex((count,i)=>count>0&&!fleet[i].surveyOnly&&i!==active);
   if(next>=0){active=next;visible.fill(true)}else autoOn=false;
   render();
  },1800);
  if(s.wave>1){
   const heading=document.createElement('h3');heading.textContent=tr('Зведення минулої хвилі','Previous wave reports');panel.append(heading);
   for(const g of s.surveyReports??[]){const line=document.createElement('p');line.textContent=tr('Розвідка','Survey')+' · '+tr(...surveySectors[g.sector].label)+' · '+tr(...fleet[g.type].name)+' ×'+g.count+' · '+tr('Повернулися','Returned')+' '+(g.count-(g.lost??0))+'/'+g.count;panel.append(line)}
   if(s.partner){
    const bulletin=document.createElement('p');
    if(s.partner.blocked)bulletin.textContent=tr('Трамп заблокував партнерську розвідку на цю хвилю.','Trump blocked partner intelligence for this wave.');
    else if(seen?.wave===s.wave)bulletin.textContent=tr('Партнери помітили ППО. Сектор позначено на шарі розвідки.','Partners spotted air defence. The sector is marked on the intelligence layer.');
    else bulletin.textContent=tr('Партнери не надіслали нових спостережень.','No new sightings from partners.');
    panel.append(bulletin);
   }
   for(const report of s.reports)closeReport=appendReport(panel,report,s.wave-1,tr(...cities[report.i])+' · '+tr(...names[report.i]))??closeReport;
   for(const repair of s.repairs??[]){const line=document.createElement('p');line.textContent=tr(...cities[repair.i])+' · '+tr(...names[repair.i])+' · '+tr('Ремонт','Repairs')+' · '+repair.previous+'% → '+conditionText(repair.damage,true);panel.append(line)}
   if(!s.reports.length&&!s.repairs?.length&&!s.surveyReports?.length)panel.append(document.createTextNode(tr('Повідомлень немає','No reports received')));
  }
 }
 document.addEventListener('siege-language',render);
 registerSessionSave(save);
 render();window.dispatchEvent(new Event('game-ready'));
}
