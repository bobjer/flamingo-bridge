import {coalitionHeader} from './coalition-header.js';
import {beginDiplomacy,recordLaunch,deliveryChance} from './deep-supply.js';
import {partnerTurn,patrolSectors} from './deep-partners.js';
import {defenses,interceptionChance,rollInterception} from './deep-interception.js';
import {registerSessionSave} from './release-notice.js';
import {tr} from './language.js';
import {changeSide,read,write} from './factions.js';
import './deepstrike.css';
import {advanceConditions} from './site-condition.js';
import {appendReport,appendSummary,appendEmpty,appendRepairs,conditionText} from './deep-reports.js';
import {cities,points,district,boardPath,travel} from './deep-atlas.js';

const key='pop-deepstrike-v1';
const names=[
 ['Нафтокомбінат','Oil works'],['Енергостанція','Power station'],['Склад','Depot'],
 ['Маркет','Market'],['Аеродром','Airfield'],['РЕБ','Jammer'],['Датацентр','Data centre'],
 ['Порт','Port'],['ППО','Air defence'],['Завод','Factory'],['Підстанція','Substation'],['Пускова','Launcher']
];
const layers=[0,1,2,0,0,2,0,0,2,0,1,2];
const sources=[['Власна розвідка','Field intelligence'],['Партнери','Partners'],['Супутник','Satellite']];
const layerNames=[['Підприємства','Industry'],['Енергетика','Energy'],['Розвідка','Intelligence']];
// Ranges and delivery intervals are board-game units.
const fleet=[
 {name:['Шурхіт','Rustle'],baseChance:24,weakTo:'net',limit:77,cycle:1},
 {name:['Буревійник','Squallwing'],baseChance:18,weakTo:'guard',limit:103,cycle:3},
 {name:['Міднокрил','Copperwing'],baseChance:20,weakTo:'guard',limit:116,cycle:4},
 {name:['Тіньолист','Shadeleaf'],baseChance:22,weakTo:'net',limit:91,cycle:2},
 {name:['Зорескок','Starbound'],baseChance:8,weakTo:'dome',limit:69,partner:true,restrictedChance:0,cycle:2},
 {name:['Присмерк','Gloaming'],baseChance:16,weakTo:'guard',limit:84,partner:true,restrictedChance:.35,cycle:3}
];
// Stylized board icons, all drawn facing right.
const flightIcons=[
 'M2.7 0 .3 -.52 -1 -2.3 -1 -.55 -2 -.7 -2 .7 -1 .55 -1 2.3 .3 .52Z',
 'M3 0 1 -.55 -.5 -.55 -1.6 -1.6 -1.2 -.48 -2.7 -.8 -2.2 0 -2.7 .8 -1.2 .48 -1.6 1.6 -.5 .55 1 .55Z',
 'M3 0 .5 -.5 -1.7 -2.5 -1 -.45 -2.5 -.8 -2.3 .8 -1 .45 -1.7 2.5 .5 .5Z',
 'M2.4 0 -.5 -1.1 -2.3 -2.1 -1.6 0 -2.3 2.1 -.5 1.1Z',
 'M3 0 1 -.65 -1.4 -.65 -2.6 -1.4 -2.2 0 -2.6 1.4 -1.4 .65 1 .65Z',
 'M2.8 0 1 -.6 0 -.6 -.7 -2 -.9 -2 -.9 -.6 -2 -.6 -2.5 -1 -2.4 1 -2 .6 -.9 .6 -.9 2 -.7 2 0 .6 1 .6Z'
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
// Marker glyphs per layer: industry square, energy diamond + bolt, intelligence / AD triangle-ring.
const glyph=l=>l===0?'<rect class="mk" x="-1.6" y="-1.6" width="3.2" height="3.2" rx=".3"/>':
 l===1?'<path class="mk" d="M0-2.3 2.3 0 0 2.3-2.3 0Z"/><path class="mk-in" d="M.45-1.2-.9.2H0L-.45 1.2 .9-.2H0Z"/>':
 '<path class="mk" d="M0-2.2 2.1 1.6H-2.1Z"/><circle class="mk-in" r=".6" cy=".35"/>';
const glyphSvg=l=>'<svg class="deep-glyph mk-'+l+'" aria-hidden="true" viewBox="-3 -3 6 6">'+glyph(l)+'</svg>';
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const bridgeReach=Math.hypot((43.5+50)/2-7,(89.7+90.7)/2-48);
const initial=()=>({wave:1,credits:2,intel:{},reports:[],flights:[],started:0,marks:[]});
export function startDeepstrike(){
 const s=read(key)||initial(), selected=new Map((s.plan?.targets??[]).filter(([i])=>playable[i])),visible=s.plan?.layers??[true,true,true];
 let closeReport,autoTimer,autoOn=false,refocus=-1,refocusCard=-1,legendOpen=false;
 let marking=false, active=s.plan?.unit??0, timer, city=s.plan?.city??-1;
 s.conditions??={};
 s.stock??=fleet.map(()=>1);
 if(!playable[city])city=-1;
 const retired=s.flights.filter(f=>!playable[f.i]);
 if(retired.length){
  for(const f of retired)s.stock[f.type??0]++;
  s.flights=s.flights.filter(f=>playable[f.i]);
  if(!s.flights.length)s.started=0;
 }
 const available=type=>s.stock[type]-[...selected.values()].filter(id=>id===type).length;
 const save=()=>write(key,{...s,plan:{targets:[...selected],layers:visible,unit:active,city}});
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
  s.reports=s.flights.filter(()=>Math.random()<.75).map(f=>({i:f.i,source:Math.random()<.5?0:1,hit:!f.lost&&Math.random()<.8}));
  for(const report of s.reports)if(report.i===0&&report.hit){report.fire=Math.random()<.75;if(report.fire)report.fireSeed=crypto.getRandomValues(new Uint32Array(1))[0]}
  s.repairs=advanceConditions(s.conditions,s.reports,s.wave);
  fleet.forEach((item,id)=>{
   if(s.wave%item.cycle===0&&(!item.partner||Math.random()<deliveryChance(item,s.wave,s.diplomacy)))s.stock[id]++;
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
  const legend='<details class="deep-legend"'+(legendOpen?' open':'')+'><summary>'+tr('Легенда','Legend')+'</summary><ul>'+
   [0,1,2].map(l=>'<li>'+glyphSvg(l)+tr(...layerNames[l])+'</li>').join('')+
   '<li><i class="lg lg-base"></i>'+tr('База запуску','Launch base')+'</li><li><i class="lg lg-range"></i>'+tr('Радіус дальності','Range ring')+'</li><li><i class="lg lg-alert"></i>'+tr('Імовірна ППО','Suspected air defence')+'</li><li><i class="lg lg-sel"></i>'+tr('Обрана ціль','Selected target')+'</li></ul></details>';
  root.innerHTML=coalitionHeader('<button class="c-sides c-auto" data-auto aria-pressed="'+autoOn+'">'+autoLabel+'</button><span class="chip"><i class="dot"></i>'+phase+'</span><button class="c-sides" data-exit>'+tr('Сторони','Factions')+'</button>')+
   '<section class="c-main deep-layout"><aside class="col c-left"><section class="panel br deep-phase"><div class="label">'+tr('Поточна фаза','Current phase')+'</div><div class="phase-row"><b class="big">'+String(s.wave).padStart(2,'0')+'</b><div><h1>'+tr('Діпстрайк','Deepstrike')+'</h1><div class="c-phase"><span class="deep-phase-chip" data-flying="'+flying+'">'+phase+'</span></div></div></div><div class="deep-credits"><span>'+tr('Кредити','Credits')+'</span><b>'+s.credits+'</b></div></section><section class="panel br" data-supply></section></aside>'+
   '<section class="c-play panel br"><div class="label">'+tr('Карта секторів','Sector map')+'</div><div class="deep-layers c-toggles"></div><svg viewBox="0 0 100 100" aria-label="'+tr('Карта секторів','Sector map')+'"></svg>'+legend+'</section>'+
   '<aside class="col c-right"><section class="panel br"><div class="label">'+tr('План хвилі','Wave plan')+'</div><div class="c-cards" data-plan></div></section></aside></section>';
  root.querySelector('.deep-legend').ontoggle=e=>{legendOpen=e.currentTarget.open};
  root.querySelector('[data-exit]').onclick=()=>{autoOn=false;clearTimeout(autoTimer);changeSide()};
  root.querySelector('[data-language]').onclick=()=>document.querySelector('.lang').click();
  root.querySelector('[data-auto]').onclick=()=>{autoOn=!autoOn;render()};
  const controls=root.querySelector('.deep-layers'),panel=root.querySelector('[data-plan]'),supply=root.querySelector('[data-supply]');
  const embargo=s.wave<=s.diplomacy.embargoThrough;
  if(embargo||s.diplomacy.talks){
   const notice=document.createElement('div');notice.className='c-phase deep-notice';
   notice.textContent=embargo?tr('Трамп обмежив поставки до кінця хвилі ','Trump restricted deliveries through wave ')+s.diplomacy.embargoThrough:
    tr('Триває «пісділ». Атака на нафтокомбінат може зупинити партнерські поставки.','Peace talks underway. A wave targeting the oil works may trigger supply restrictions.');
   supply.before(notice);
  }
  function button(parent,label,action,disabled=false,pressed,cls){
   const el=document.createElement('button');el.textContent=label;el.disabled=disabled;el.onclick=action;if(pressed!==undefined)el.setAttribute('aria-pressed',pressed);el.className=cls??(parent===panel?'c-sponsor':'c-sides');parent.append(el);return el;
  }
  layerNames.forEach((name,i)=>{const b=button(controls,tr(...name),()=>{visible[i]=!visible[i];render()},false,visible[i]);b.innerHTML=glyphSvg(i)+'<span>'+tr(...name)+'</span>'});
  if(!flying){
   supply.innerHTML='<div class="label">'+tr('Арсенал · ігрові поділки','Arsenal · board units')+'</div><div class="c-list"></div>';
   const list=supply.lastElementChild;
   fleet.forEach((unit,id)=>{
    const card=document.createElement('button'),cur=Math.round(radius(id)),defense=defenses[unit.weakTo];
    card.type='button';card.className='c-buy deep-unit';card.dataset.unit=id;
    card.setAttribute('aria-pressed',String(id===active));
    card.innerHTML='<span class="c-badge"><svg aria-hidden="true" viewBox="-3.5 -3 7 6"><path fill="currentColor" d="'+flightIcons[id]+'"/></svg></span>'+
     '<span class="c-name"><b>'+tr(...unit.name)+'</b><span class="deep-range"><span class="deep-bar" aria-hidden="true"><i style="width:'+Math.round(cur/unit.limit*100)+'%"></i></span><small>'+tr('Дальність','Range')+' '+cur+' / '+unit.limit+'</small></span></span>'+
     '<span class="deep-count" aria-label="'+tr('Доступно','Available')+' '+available(id)+'" data-empty="'+(available(id)<1)+'">×'+available(id)+'</span>'+
     '<span class="deep-chips"><small class="deep-chip" title="'+tr(...defense.profile)+' · '+tr('Шанс перехоплення','Intercept chance')+' '+unit.baseChance+'%">'+tr('Перехоплення','Intercept')+' <b>'+unit.baseChance+'%</b></small>'+
     '<small class="deep-chip weak" title="'+tr('Проти ППО','Against')+' «'+tr(...defense.name)+'» · '+interceptionChance(unit,unit.weakTo)+'%">'+tr('Слабкий проти','Weak to')+' «'+tr(...defense.name)+'» <b>'+interceptionChance(unit,unit.weakTo)+'%</b></small></span>'+
     '<small class="deep-prod">'+(unit.partner?tr('Шанс поставки','Delivery chance')+' '+Math.round(deliveryChance(unit,s.wave,s.diplomacy)*100)+'%':tr('Виробництво','Production'))+' +1 / '+unit.cycle+' '+tr('хв. гри','game waves')+'</small>';
    card.onclick=()=>{active=id;render();root.querySelector('[data-unit="'+id+'"]').focus({preventScroll:true})};
    list.append(card);
   });
  }
  supply.hidden=flying;
  let total=0;const sum=document.createElement('div'),list2=document.createElement('div');sum.className='deep-sum';list2.className='deep-targets';
  if(!flying)panel.append(sum,list2);
  const zoom=document.createElement('select');zoom.setAttribute('aria-label',tr('Масштаб карти','Map scale'));
  zoom.add(new Option(tr('Усі області','All regions'),'-1'));
  cities.forEach((name,i)=>playable[i]&&zoom.add(new Option(tr(...name),String(i))));
  zoom.value=String(city);zoom.onchange=()=>{city=Number(zoom.value);render()};controls.append(zoom);
  const map=root.querySelector('.c-play > svg');
  if(city>=0){const [x,y]=points[city];map.setAttribute('viewBox',[Math.min(62,Math.max(0,x-19)),Math.min(62,Math.max(0,y-19)),38,38].join(' '))}
  const flags=flagged(),R=radius();
  const reasonOf=i=>selected.has(i)||flying?'':distance(i)>R?tr('Поза дальністю','Out of range'):available(active)<1?tr('Немає запасу','No stock'):'';
  map.classList.toggle('marking',marking);
  const outer='26,39 29,40 31,43 32,49 34,55 39,59 42,62 40,68 38,72 39,76 38,80 40,84 43,88';
  const coast='0,88 8,87 14,88 19,90 26,87 30,89 35,92 40,92 44,90 43,88 48,87 50,90 52,93 62,94 70,91 83,94 92,90 100,91';
  const reverse=line=>line.split(' ').reverse().join(' ');
  const occ=outer+' 44,90 40,92 35,92 30,89 '+reverse(inner);
  const sea=tr('Море','Sea'),bridge=tr('Міст','Bridge');
  const ticks=[0,20,40,60,80].map(v=>'<path class="ds-tick-line" d="M0 '+v+'H1.1M'+v+' 100V98.9"/><text class="ds-tick" x="1.5" y="'+(v+(v?.7:2.4))+'">'+Math.round(54-v*.125)+tr('°пн','°N')+'</text><text class="ds-tick" x="'+(v+.8)+'" y="98.2" '+(v?'':'dx="2.5"')+'>'+Math.round(20+v*.2)+tr('°сх','°E')+'</text>').join('');
  const wave=y=>'<path class="ds-wave" d="M0 '+y+' q1.5-.7 3 0'+' t3 0'.repeat(33)+'"/>';
  map.innerHTML='<defs><linearGradient id="wake" gradientUnits="userSpaceOnUse" x1="-7" x2="0"><stop stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="white" stop-opacity=".8"/></linearGradient>'+
   '<pattern id="sector-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#6f8f95" stroke-width=".14"/></pattern>'+
   '<linearGradient id="ds-sea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#27506a"/><stop offset="1" stop-color="#0b1c29"/></linearGradient>'+
   '<linearGradient id="ds-home" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2f4d4a"/><stop offset="1" stop-color="#1f3533"/></linearGradient>'+
   '<linearGradient id="ds-occ" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5a4c33"/><stop offset="1" stop-color="#3d3325"/></linearGradient>'+
   '<linearGradient id="ds-foe" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#51393f"/><stop offset="1" stop-color="#34252b"/></linearGradient>'+
   '<pattern id="ds-hatch-occ" width="1.7" height="1.7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V1.7" stroke="#e4c98f" stroke-opacity=".2" stroke-width=".45"/></pattern>'+
   '<pattern id="ds-hatch-alert" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><path d="M0 0V1.5" stroke="#ff6b5e" stroke-opacity=".6" stroke-width=".55"/></pattern>'+
   '<radialGradient id="ds-range"><stop stop-color="#7fcfa6" stop-opacity=".02"/><stop offset=".7" stop-color="#7fcfa6" stop-opacity=".06"/><stop offset="1" stop-color="#7fcfa6" stop-opacity=".2"/></radialGradient>'+
   '<clipPath id="ds-clip-home"><polygon points="'+homeOutline+'"/></clipPath><clipPath id="ds-clip-occ"><polygon points="'+occ+'"/></clipPath></defs>'+
   '<rect class="atlas-land land-2" width="100" height="100"/>'+
   '<polygon class="atlas-land land-1" points="'+occ+'"/><polygon fill="url(#ds-hatch-occ)" points="'+occ+'" pointer-events="none"/><polygon class="ds-shade" clip-path="url(#ds-clip-occ)" points="'+occ+'"/>'+
   '<polygon class="atlas-land land-0" points="'+homeOutline+'"/><polygon class="ds-shade" clip-path="url(#ds-clip-home)" points="'+homeOutline+'"/>'+
   '<polygon fill="url(#ds-sea)" points="'+coast+' 100,100 0,100"/>'+wave(97.6)+wave(99.5)+
   '<rect width="100" height="100" fill="url(#sector-grid)" opacity=".55" pointer-events="none"/>'+ticks+
   '<circle class="ds-range" cx="7" cy="48" r="'+R+'" fill="url(#ds-range)"/>'+
   '<text class="ds-range-label" x="12" y="57.6">'+tr('дальність ','range ')+Math.round(R)+'</text>'+
   '<path class="atlas-river-bank" d="M48 1 Q46 15 49 24 T46 45 Q39 55 43 65 T40 86"/><path class="atlas-river" d="M48 1 Q46 15 49 24 T46 45 Q39 55 43 65 T40 86"/>';
  const xEdges=[0,22,41,63,100],yEdges=[0,40,61,100];
  for(const id of flags){
   const col=id%4,row=Math.floor(id/4);
   map.insertAdjacentHTML('beforeend','<rect class="atlas-alert" x="'+xEdges[col]+'" y="'+yEdges[row]+'" width="'+(xEdges[col+1]-xEdges[col])+'" height="'+(yEdges[row+1]-yEdges[row])+'"/><g class="ds-warn" transform="translate('+(xEdges[col]+4.5)+' '+(yEdges[row]+5)+')"><title>'+tr('Імовірна ППО','Suspected air defence')+'</title><path d="M0-2.7 2.7 1.9H-2.7Z"/><path class="ds-warn-i" d="M0-.9V.5"/><circle cy="1.2" r=".2"/></g>');
  }
  for(const line of [north,inner,outer])map.insertAdjacentHTML('beforeend','<polyline class="atlas-border" points="'+line+'"/>');
  map.insertAdjacentHTML('beforeend','<polyline class="ds-coast" points="'+coast+'"/>'+
   '<g pointer-events="none"><path d="M43.5 89.7L50 90.7" stroke="#232c30" stroke-width="1.9"/><path d="M43.5 89.7L50 90.7" stroke="#e9d6a7" stroke-width=".85"/><text class="atlas-city" x="46" y="95">'+bridge+'</text></g>');
  for(const [name,x,y] of [['Ненька',10,62],['Ордло',31,67],['Мордор',78,13],[sea,12,96]])map.insertAdjacentHTML('beforeend','<text class="atlas-territory'+(name===sea?' sea':'')+'" transform="rotate('+(name==='Ордло'?82:0)+' '+x+' '+y+')" x="'+x+'" y="'+y+'">'+name+'</text>');
  map.insertAdjacentHTML('beforeend','<g class="ds-base" pointer-events="none"><title>'+tr('База запуску','Launch base')+'</title><circle cx="7" cy="48" r="2.7"/><path d="M7 44.6V51.4M3.6 48H10.4"/><path class="ds-base-star" d="M7 46.1 8.3 48 7 49.9 5.7 48Z"/><text class="atlas-city" x="7" y="54.2">'+tr('База','Base')+'</text></g>');
  const seen=s.partner?.seen;
  if(visible[2]&&seen){
   const [x,y]=patrolSectors[seen.sector];
   const label=tr('ППО · хв. ','AD · wave ')+seen.wave;
   map.insertAdjacentHTML('beforeend','<g class="partner-sighting" pointer-events="none" opacity="'+(seen.wave===s.wave?1:.55)+'"><title>'+tr('Останнє спостереження партнерів','Last partner sighting')+'</title><circle cx="'+x+'" cy="'+y+'" r="2.4" fill="none" stroke="#f0b46d" stroke-width=".45" stroke-dasharray=".7 .45"/><text class="atlas-city" x="'+x+'" y="'+(y+4.7)+'">'+label+'</text></g>');
  }
  if(!flying){
   let n=0;
   for(const [i,type] of selected){
    const path=boardPath(i,type,flags),[ex,ey]=points[i];n++;
    map.insertAdjacentHTML('beforeend','<polyline class="atlas-plan" points="'+path.map(p=>p.join(',')).join(' ')+'"/>'+
     [.22,.45,.68].map(f=>{const c=travel(path,f);return '<path class="ds-chev" transform="translate('+c.x+' '+c.y+') rotate('+c.angle+')" d="M-.7-.7L.2 0L-.7.7"/>'}).join('')+
     '<g class="ds-num" transform="translate('+(ex-3.2)+' '+(ey-3.2)+')" pointer-events="none"><circle r="1.55"/><text y=".65">'+n+'</text></g>');
   }
  }
  points.forEach(([x,y],i)=>playable[i]&&map.insertAdjacentHTML('beforeend','<text class="atlas-city" x="'+x+'" y="'+(y-3.9)+'">'+tr(...cities[i])+'</text>'));
  const srcLetter=[tr('В','F'),tr('П','P'),tr('С','S')];
  points.forEach(([x,y],i)=>{
   if(!playable[i]||!visible[layers[i]]||(layers[i]===2&&!s.intel[i]))return;
   const label=tr(...names[i]),intel=s.intel[i],status=conditionText(s.conditions[i]?.damage,!!s.conditions[i]),sel=selected.has(i),why=reasonOf(i),w=Math.max(7,label.length*1.2+2.2);
   const state=s.conditions[i]?.damage===100?'out':s.conditions[i]?.damage?'dmg':s.conditions[i]?'fixed':'ok';
   map.insertAdjacentHTML('beforeend','<g class="site mk-'+layers[i]+(sel?' sel':'')+(why?' dim':'')+'" data-site="'+i+'" tabindex="0" role="button" aria-pressed="'+sel+'" aria-label="'+tr(...cities[i])+' · '+label+' · '+status+(why?' · '+why:'')+'"><title>'+status+(why?' · '+why:'')+'</title><g transform="translate('+x+' '+y+')">'+
    '<circle class="hit" r="4.4"/>'+(sel?'<circle class="pulse" r="2.9"/>':'')+'<circle class="ring" r="2.9"/><circle class="site-focus" r="3.9"/>'+glyph(layers[i])+
    '<rect class="plate" data-state="'+state+'" x="'+(-w/2)+'" y="3.6" width="'+w+'" height="3.1" rx=".5"/><text class="site-label" y="5.85">'+label+'</text>'+
    (intel?'<g class="intel" transform="translate(2.7 -2.7)"><circle r="1.3"/><text y=".55">'+srcLetter[intel.source]+'</text><title>'+tr(...sources[intel.source])+' W'+intel.wave+'</title></g>':'')+
    (sel?'<g class="unit" transform="translate(4.9 -.2)"><circle r="1.9"/><path transform="scale(.5)" d="'+flightIcons[selected.get(i)]+'"/></g>':'')+'</g></g>');
   if(!flying){
    const row=button(list2,tr(...cities[i])+' · '+label+' · '+status+(sel?' · '+tr(...fleet[selected.get(i)].name):'')+(intel?' · '+tr(...sources[intel.source])+' W'+intel.wave:'')+(why?' · '+why:''), ()=>{refocusCard=i;toggle(i)},!!why,sel,'c-sponsor target-card deep-target');
    row.title=why||status;row.dataset.card=i;total++;
    row.innerHTML='<span class="deep-t-main"><b>'+tr(...cities[i])+'</b><small>'+label+'</small></span><span class="deep-t-meta">'+
     (why?'<span class="deep-tag">'+why+'</span>':'')+'<span class="deep-status" data-state="'+state+'">'+status+'</span>'+
     (intel?'<span class="deep-intel" title="'+tr(...sources[intel.source])+' W'+intel.wave+'">'+srcLetter[intel.source]+' W'+intel.wave+'</span>':'')+
     (sel?'<svg class="deep-t-unit" aria-hidden="true" viewBox="-3.5 -3 7 6"><path fill="currentColor" d="'+flightIcons[selected.get(i)]+'"/></svg>':'')+'</span>';
   }
  });
  function toggle(i){
   if(flying||!playable[i])return;
   if(selected.has(i))selected.delete(i);
   else if(distance(i)<=radius()&&available(active)>0){
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
  map.onkeydown=e=>{
   const site=e.target.closest?.('[data-site]');
   if(!site||(e.key!=='Enter'&&e.key!==' '))return;
   e.preventDefault();refocus=+site.dataset.site;if(marking||flying)return;toggle(refocus);
  };
  if(refocus>=0){map.querySelector('[data-site="'+refocus+'"]')?.focus({preventScroll:true});refocus=-1}
  if(refocusCard>=0){root.querySelector('[data-card="'+refocusCard+'"]')?.focus({preventScroll:true});refocusCard=-1}
  function drawTracks(overlay,flights,elapsed){
   const past=elapsed===Infinity,calm=reduced();
   for(const f of flights){
    const t=Math.min(1,elapsed/f.duration);
    const path=f.path??[[7,48],points[f.i]];
    const {x:px,y:py,angle,segment}=travel(path,t*(f.lost?.68:1));
    const flown=[...path.slice(0,segment+1),[px,py]].map(p=>p.join(',')).join(' ');
    const done=t===1,k=past?1:Math.min(1,Math.max(0,(elapsed-f.duration)/1200)),tone=done?(f.lost?'#ff6b5e':'#ffb347'):'#ece4bd';
    let h='<g class="trk'+(past?' past':'')+'">'+(past?'':'<polyline class="trk-plan" points="'+path.map(p=>p.join(',')).join(' ')+'"/><polyline class="trk-glow" stroke="'+tone+'" points="'+flown+'"/>')+'<polyline class="trk-line atlas-track" stroke="'+tone+'" points="'+flown+'"/>';
    if(!past&&f.surprise&&t>=.4){
     const [x,y]=f.surprise,pulse=calm?0:Math.abs(Math.sin(elapsed/230));
     h+='<g class="trk-warn"><circle cx="'+x+'" cy="'+y+'" r="'+(3.1+pulse*.9)+'" fill="#db564730" stroke="#eb7962" stroke-width=".4" stroke-opacity="'+(.95-pulse*.4)+'"/><circle cx="'+x+'" cy="'+y+'" r="'+(1.8+pulse*.4)+'" fill="none" stroke="#eb7962" stroke-width=".25" stroke-dasharray=".6 .5"/><text x="'+x+'" y="'+(y+1)+'">!</text></g>';
    }
    let symbol;
    if(!done)symbol='<g transform="rotate('+angle+')"><path d="M-7 0H0" stroke="url(#wake)" stroke-width=".7"/><path d="'+(flightIcons[f.type]??flightIcons[0])+'" fill="white" stroke="#25343a" stroke-width=".15"/></g>';
    else if(f.lost)symbol=(past?'':'<circle class="trk-ring" r="'+(1.4+k*3.6)+'" opacity="'+(.85*(1-k))+'"/>')+'<path class="trk-x" d="M-1.5-1.5L1.5 1.5M1.5-1.5L-1.5 1.5"'+(past?' transform="scale(.7)"':'')+'/>';
    else symbol='<g'+(past?' transform="scale(.6)"':'')+'>'+(past?'':'<circle class="trk-wave" r="'+(1.5+k*4)+'" opacity="'+(.9*(1-k))+'"/>'+[0,1,2,3,4,5,6,7].map(a=>'<path class="trk-ray" d="M0-1.9V-'+(2.8+k*1.1)+'" transform="rotate('+(a*45+(a%2?0:11))+')"/>').join(''))+'<circle r="2.1" fill="#ff802740"/><path d="M0 1.5C-2 1-1.6-.4-.6-1.3L-.45-.45Q.4-1 .15-2.4C2 .1 1.6 1.2 0 1.5" fill="#ff972e"/><circle cy=".6" r=".55" fill="#ffe39a"/></g>';
    if(past&&done)symbol+=f.lost?'':'<g class="trk-tick" transform="translate(2.4 -2.4)"><circle r="1.2"/><path d="M-.6 0L-.15.5L.65-.5"/></g>';
    h+='<g transform="translate('+px+' '+py+')"><title>'+tr(...fleet[f.type??0].name)+'</title>'+symbol+'</g></g>';
    overlay.insertAdjacentHTML('beforeend',h);
   }
  }
  if(!flying&&s.lastTracks?.length){
   const history=document.createElementNS('http://www.w3.org/2000/svg','g');
   history.setAttribute('pointer-events','none');map.append(history);
   drawTracks(history,s.lastTracks,Infinity);
  }
  const fillSum=()=>{
   sum.innerHTML='<span class="deep-sum-n"><b>'+selected.size+'</b> / '+total+'<small>'+tr('цілей обрано','targets selected')+'</small></span><span class="deep-credits"><span>'+tr('Кредити','Credits')+'</span><b>'+s.credits+'</b></span>';
   if(!total)list2.innerHTML='<p class="dr-empty"><span>'+tr('Немає видимих цілей. Увімкніть шари або купіть знімок.','No visible targets. Enable layers or buy imagery.')+'</span></p>';
  };
  if(flying){
   const hud=document.createElement('div');hud.className='deep-hud';
   hud.innerHTML='<div class="deep-sec">'+tr('Хвиля в польоті','Wave in flight')+' <b>'+s.flights.length+'</b></div>';
   const rows=s.flights.map(f=>{
    const row=document.createElement('div');row.className='deep-flight';
    row.innerHTML='<span class="c-badge"><svg aria-hidden="true" viewBox="-3.5 -3 7 6"><path fill="currentColor" d="'+(flightIcons[f.type]??flightIcons[0])+'"/></svg></span><span class="c-name"><b>'+tr(...fleet[f.type??0].name)+'</b><small>'+tr(...cities[f.i])+' · '+tr(...names[f.i])+'</small></span><span class="deep-f-stat"></span><span class="deep-bar" aria-hidden="true"><i></i></span>';
    hud.append(row);return {row,bar:row.querySelector('i'),stat:row.querySelector('.deep-f-stat')};
   });
   panel.append(hud);
   const paint=elapsed=>s.flights.forEach((f,n)=>{
    const t=Math.min(1,elapsed/f.duration),st=t<1?'go':f.lost?'lost':'hit',r=rows[n];
    r.row.dataset.state=st;r.bar.style.width=(t*100)+'%';
    r.stat.textContent=st==='go'?tr('Летить','En route'):st==='lost'?tr('Перехоплено','Intercepted'):tr('Влучання','Impact');
   });
   const overlay=document.createElementNS('http://www.w3.org/2000/svg','g');map.append(overlay);
   function animate(){
    const elapsed=Date.now()-s.started;
    if(s.flights.every(f=>elapsed>=f.duration+1200)){render();return}
    overlay.replaceChildren();
    paint(elapsed);
    drawTracks(overlay,s.flights,elapsed);
    timer=setTimeout(animate,80);
   }
   animate();return;
  }
  fillSum();
  const acts=document.createElement('div');acts.className='deep-actions';panel.append(acts);
  const ghosts=document.createElement('div');ghosts.className='deep-ghosts';
  const launch=button(acts,tr('Запустити хвилю','Launch wave')+' ('+selected.size+')',()=>{
   recordLaunch(s.diplomacy,s.wave,selected);
   for(const type of selected.values())s.stock[type]--;
   s.flights=[...selected].map(([i,type])=>{
    const path=boardPath(i,type,flags);
    const surprise=Math.random()<.27?path[1]:null;
    return {i,type,path,surprise,duration:Math.round(2500+travel(path,1).total*(65+Math.random()*90)),lost:rollInterception(fleet[type],!!surprise||(s.partner&&district(points[i])===district(patrolSectors[s.partner.sector])))};
   });
   selected.clear();marking=false;s.started=Date.now();save();render();
  },!selected.size);
  launch.className='c-start deep-launch';
  launch.innerHTML='<span>'+tr('Запустити хвилю','Launch wave')+'</span><span class="deep-pill">'+selected.size+'</span>';
  acts.append(ghosts);
  const buy=button(ghosts,tr('Купити знімок · 1','Buy imagery · 1'),()=>{s.credits--;intelligence(true);save();render()},s.credits<1,undefined,'c-sides deep-ghost');
  buy.title=tr('Вартість: 1 кредит','Cost: 1 credit');buy.innerHTML='<span>'+tr('Купити знімок','Buy imagery')+'</span><span class="deep-cost" aria-hidden="true">1</span>';
  buy.setAttribute('aria-label',tr('Купити знімок · 1','Buy imagery · 1'));
  button(ghosts,tr('Позначити ймовірну загрозу','Mark suspected threat'),()=>{marking=!marking;render()},false,marking,'c-sides deep-ghost');
  if(marking){const hint=document.createElement('p');hint.className='deep-hint';hint.textContent=tr('Торкніться карти, щоб позначити район.','Tap the map to mark a district.');acts.append(hint)}
  if(autoOn)autoTimer=setTimeout(()=>{
   if(document.hidden||document.querySelector('dialog:modal')){render();return}
   if(selected.size){launch.click();return}
   const cards=[...panel.querySelectorAll('button[aria-pressed="false"]:enabled')].filter(b=>b.classList.contains('target-card'));
   if(cards.length){cards[Math.floor(Math.random()*cards.length)].click();return}
   const next=s.stock.findIndex((count,i)=>count>0&&i!==active);
   if(next>=0){active=next;visible.fill(true)}else autoOn=false;
   render();
  },1800);
  if(s.wave>1){
   let text='',kind='none';
   if(s.partner){
    if(s.partner.blocked){kind='blocked';text=tr('Трамп заблокував партнерську розвідку на цю хвилю.','Trump blocked partner intelligence for this wave.')}
    else if(seen?.wave===s.wave){kind='spotted';text=tr('Партнери помітили ППО. Сектор позначено на шарі розвідки.','Partners spotted air defence. The sector is marked on the intelligence layer.')}
    else text=tr('Партнери не надіслали нових спостережень.','No new sightings from partners.');
   }
   appendSummary(panel,{reports:s.reports,repairs:s.repairs,bulletin:text,kind});
   for(const report of s.reports)closeReport=appendReport(panel,report,s.wave-1,tr(...cities[report.i])+' · '+tr(...names[report.i]))??closeReport;
   appendRepairs(panel,s.repairs,r=>tr(...cities[r.i])+' · '+tr(...names[r.i]));
   if(!s.reports.length&&!s.repairs?.length)appendEmpty(panel);
  }
 }
 document.addEventListener('siege-language',render);
 registerSessionSave(save);
 render();window.dispatchEvent(new Event('game-ready'));
}
