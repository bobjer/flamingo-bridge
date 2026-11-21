import {productionOffer,deliverProduction} from './coalition-rules.js';
import {launchPrices,openingFunds,openingTrust,dealAdvance,dealTrustCost,minimumLaunch,waveCost,settleWave} from './deep-economy.js';
import {planDeepWave} from './deep-bot.js';
import {coalitionHeader} from './coalition-header.js';
import {beginDiplomacy,recordLaunch,deliveryChance} from './deep-supply.js';
import {partnerTurn,patrolSectors} from './deep-partners.js';
import {defenses,interceptionChance,rollInterception} from './deep-interception.js';
import {registerSessionSave} from './release-notice.js';
import {tr} from './language.js';
import {changeSide,read,write} from './factions.js';
import './deepstrike.css';
import {advanceConditions,boardImpact} from './site-condition.js';
import {appendReport,appendSummary,appendEmpty,appendRepairs,conditionText} from './deep-reports.js';
import {cities,points,district,boardPath,travel,zoneHits} from './deep-atlas.js';
import {lanePath,placeThreats,validThreats,relocate,resolveSurvey,dummyPath,isLost,refine,activeZones,districtsOf,crossedThreats,confidence,nearestLane} from './deep-threats.js';

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
 {name:['Шурхіт','Rustle'],baseChance:24,weakTo:'net',limit:77,cycle:1,batch:2},
 {name:['Буревійник','Squallwing'],baseChance:18,weakTo:'guard',limit:103,cycle:3},
 {name:['Міднокрил','Copperwing'],baseChance:20,weakTo:'guard',limit:116,cycle:4},
 {name:['Тіньолист','Shadeleaf'],baseChance:22,weakTo:'net',limit:91,cycle:2},
 {name:['Зорескок','Starbound'],baseChance:8,weakTo:'dome',limit:69,partner:true,restrictedChance:0,cycle:2},
 {name:['Присмерк','Gloaming'],baseChance:16,weakTo:'guard',limit:84,partner:true,restrictedChance:.35,cycle:3},
 {name:['Пустушки','Dummies'],surveyOnly:true,surveyLoss:.05,limit:69,cycle:1,batch:4,start:12}
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
const objectives=[0,1,9,10].filter(id=>playable[id]);
// Marker glyphs per layer: industry square, energy diamond + bolt, intelligence / AD triangle-ring.
const glyph=l=>l===0?'<rect class="mk" x="-1.6" y="-1.6" width="3.2" height="3.2" rx=".3"/>':
 l===1?'<path class="mk" d="M0-2.3 2.3 0 0 2.3-2.3 0Z"/><path class="mk-in" d="M.45-1.2-.9.2H0L-.45 1.2 .9-.2H0Z"/>':
 '<path class="mk" d="M0-2.2 2.1 1.6H-2.1Z"/><circle class="mk-in" r=".6" cy=".35"/>';
const glyphSvg=l=>'<svg class="deep-glyph mk-'+l+'" aria-hidden="true" viewBox="-3 -3 6 6">'+glyph(l)+'</svg>';
const surveySectors=[
 {label:['Лука','Meadow'],point:[33,27]},
 {label:['Гай','Grove'],point:[51,55]},
 {label:['Схил','Hillside'],point:[49,71]}
];
  // Spread survey markers across the sector on screen, including mixed-type groups.
  function mapFlights(flights){
   const offsets=new Map(),totals=new Map();
   for(const f of flights)if(f.survey)totals.set(f.sector,(totals.get(f.sector)??0)+f.count);
   return flights.flatMap(f=>{
    if(!f.survey)return [f];
    const start=offsets.get(f.sector)??0,total=totals.get(f.sector);
    offsets.set(f.sector,start+f.count);
    const [origin]=f.path,end=surveySectors[f.sector].point,dx=end[0]-origin[0],dy=end[1]-origin[1],length=Math.hypot(dx,dy);
    return Array.from({length:f.count},(_,index)=>{
     const loss=f.losses?.[index];
     // New saves store a loss record per dummy and fly the corridor lane; older saves stored booleans on a short path.
     if(loss&&typeof loss==='object')return {...f,path:dummyPath(f.sector,loss.offset??0),lane:true,number:start+index+1,lost:!!loss.lost,cause:loss.cause,lossAt:loss.fraction,lossPoint:loss.at};
     const lane=(start+index-(total-1)/2)*Math.min(2.7,15/total);
     const offset=[-dy/length*lane,dx/length*lane];
     const path=[origin,[origin[0]+dx*.36+offset[0],origin[1]+dy*.36+offset[1]],
      [end[0]+offset[0],end[1]+offset[1]]];
     return {...f,path,number:start+index+1,lost:loss??false};
    });
   });
  }
const lostTrackFraction=.68;
function surveyLossMarks(flights,wave){
 return mapFlights(flights.filter(f=>f.survey)).filter(f=>f.lost&&f.cause!=='unknown').map(f=>{
  const {x,y}=travel(f.path,f.lane?f.lossAt:lostTrackFraction);
  return {x,y,number:f.number,wave,cause:f.cause};
 });
}
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const bridgeReach=Math.hypot((43.5+50)/2-7,(89.7+90.7)/2-48);
const initial=()=>({wave:1,credits:openingFunds,trust:openingTrust,intel:{},reports:[],flights:[],started:0,marks:[]});
export function startDeepstrike(){
 const s=read(key)||initial(),visible=s.plan?.layers??[true,true,true];
 // Plan targets are site -> {type:count}. Older saves stored [site,type] pairs (or a type list).
 const selected=new Map();
 for(const [site,value] of s.plan?.targets??[]){
  if(!playable[site])continue;
  const row=selected.get(+site)??{};
  const add=(type,n=1)=>{if(fleet[type]&&!fleet[type].surveyOnly&&n>0)row[type]=(row[type]??0)+n};
  if(typeof value==='number')add(value);
  else if(Array.isArray(value))value.forEach(type=>add(type));
  else if(value)for(const [type,n] of Object.entries(value))add(+type,Math.floor(+n)||0);
  if(Object.keys(row).length)selected.set(+site,row);
 }
 // Give pre-economy saves the same opening grant without discarding earned credits.
 const legacy=s.trust===undefined;
 if(legacy){s.trust=openingTrust;s.credits+=openingFunds-2}
 const surveys=s.plan?.surveys??{};
 for(const [sectorKey,row] of Object.entries(surveys)){for(const type of Object.keys(row))if(!fleet[type]?.surveyOnly)delete row[type];if(!Object.keys(row).length)delete surveys[sectorKey]}
 let sector=s.plan?.sector??0;
 let closeReport,autoTimer,autoOn=false,refocus=-1,refocusCard=-1,refocusStep=null,legendOpen=false;
 let marking=false, active=s.plan?.unit??0, timer, city=s.plan?.city??-1;
 s.conditions??={};
 s.base??={station:1,damage:0,moved:false};
 const repeatLaunch=()=>!s.base.moved&&(s.base.established??(s.wave>1));
 const offline=()=>objectives.filter(id=>s.conditions[id]?.damage===100).length;
 if(offline()===objectives.length)s.won=true;
 s.stock??=[];
 const migrateThreats=!validThreats(s.threats)||!Array.isArray(s.trace);
 const onGround=(x,y)=>!inHome([x,y]);
 if(!validThreats(s.threats))s.threats=placeThreats(onGround,Math.random,s.wave);
 if(!Array.isArray(s.trace))s.trace=[];
 fleet.forEach((unit,id)=>{s.stock[id]??=unit.start??1});
 if(!playable[city])city=-1;
 const retired=s.flights.filter(f=>!f.survey&&!playable[f.i]);
 if(retired.length){
  for(const f of retired)s.stock[f.type??0]++;
  s.flights=s.flights.filter(f=>f.survey||playable[f.i]);
  if(!s.flights.length)s.started=0;
 }
 const sumRow=row=>Object.values(row).reduce((a,b)=>a+b,0);
 const droneCount=()=>[...selected.values()].reduce((a,row)=>a+sumRow(row),0);
 const assigned=type=>[...selected.values()].reduce((n,row)=>n+(row[type]??0),0)+Object.values(surveys).reduce((n,row)=>n+(row[type]??0),0);
 const available=type=>s.stock[type]-assigned(type);
 const migrateLosses=s.surveyLossMarks===undefined;
 if(migrateLosses)s.surveyLossMarks=surveyLossMarks(s.lastTracks??[],s.wave-1);
 for(const mark of s.surveyLossMarks)mark.wave??=s.wave-1;
 const save=()=>write(key,{...s,plan:{targets:[...selected],surveys,sector,layers:visible,unit:active,city}});
 if(migrateLosses||migrateThreats||legacy||retired.length||JSON.stringify([...selected])!==JSON.stringify(s.plan?.targets??[]))save();
 const root=document.createElement('main');root.className='deep-board';document.body.append(root);
 const radius=(type=active)=>Math.min(fleet[type].limit,bridgeReach+(fleet[type].limit-69)*.8+(s.wave-1)*5);
 const distance=i=>Math.hypot(points[i][0]-7,points[i][1]-48);
 const inRange=(i,type)=>distance(i)<=radius(type);
 // One shared route per site; a mixed group avoids the curved Starbound arc.
 const knownZones=()=>activeZones(s.trace);
 const sitePath=(i,row,flags)=>boardPath(i,Object.keys(row).map(Number).find(type=>type!==4)??4,flags,knownZones());
 function change(i,type,delta){
  if(!playable[i]||fleet[type].surveyOnly)return false;
  const row=selected.get(i)??{};
  if(delta>0){
   if(!inRange(i,type)||available(type)<1)return false;
   row[type]=(row[type]??0)+1;s.lastTracks=[];
  }else{
   if(!row[type])return false;
   if(!--row[type])delete row[type];
  }
  if(Object.keys(row).length)selected.set(i,row);else selected.delete(i);
  save();return true;
 }
 const flagged=()=>new Set([...s.marks.map(district),...s.trace.filter(e=>!e.stale).flatMap(e=>[district([e.x,e.y]),...districtsOf(e)]),...Object.keys(s.intel).filter(i=>(+i===5||+i===8)&&playable[i]&&s.wave-s.intel[i].wave<3).map(i=>district(points[i]))]);
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
 function finish(deal=false){
  const surveyFlights=s.flights.filter(f=>f.survey);
  s.surveyReports=surveyFlights.map(({sector,type,count})=>({sector,type,count}));
  const lossRecords=[],passes=[];
  s.surveyReports.forEach((group,index)=>{
   const flight=surveyFlights[index],tally=flight.losses??[];
   const lost=tally.filter(isLost).length;
   group.lost=lost;s.stock[group.type]+=group.count-lost;
   group.shot=tally.filter(l=>l?.cause==='shot').length;group.jammed=tally.filter(l=>l?.cause==='jammed').length;
   for(const l of tally)if(l&&typeof l==='object'){lossRecords.push(l);if(!l.lost)passes.push(dummyPath(flight.sector,l.offset))}
  });
  // Dummy losses refine the estimated AD/EW zones; the trace also ages when nothing flew.
  const refined=refine(s.trace,lossRecords,s.wave,{threats:s.threats,passes});
  s.trace=refined.trace;
  s.surveyNotice=refined.fresh.length+refined.confirmed.length>0;
  s.surveyReports.forEach((group,index)=>{
   const hit=(surveyFlights[index].losses??[]).find(l=>l?.lost&&l.at&&l.kind);
   if(!hit)return;
   const zone=s.trace.find(e=>e.kind===hit.kind&&Math.hypot(e.x-hit.at[0],e.y-hit.at[1])<=1.6*e.r+.01);
   if(zone)group.zone={kind:zone.kind,sector:nearestLane(zone.x,zone.y),r:zone.r,confirmed:zone.confirmed};
  });
  // One report per site; every surviving drone of a group rolls its own hit.
  const groups=new Map();
  for(const f of s.flights)if(!f.survey)groups.set(f.i,[...(groups.get(f.i)??[]),f]);
  const accuracy=repeatLaunch()?.90:.60;
  const damageMultiplier=repeatLaunch()?1.25:1;
  const landed=new Map();
  s.reports=[...groups].filter(()=>Math.random()<.75).map(([i,flights])=>{
   const hits=flights.filter(f=>!f.lost&&Math.random()<accuracy).length;
   landed.set(i,hits);
   return {i,source:Math.random()<.5?0:1,hit:hits>0};
  });
  for(const report of s.reports)if(report.i===0&&report.hit){report.fire=Math.random()<.75;if(report.fire)report.fireSeed=crypto.getRandomValues(new Uint32Array(1))[0]}
  s.repairs=advanceConditions(s.conditions,s.reports,s.wave,Math.random,damageMultiplier);
  // advanceConditions applies one impact per report; add one more roll per extra drone that landed.
  for(const report of s.reports){
   const hits=landed.get(report.i)??0;
   if(!report.hit||hits<2||report.damage===undefined)continue;
   let damage=report.damage;
   for(let n=1;n<hits;n++)damage=Math.min(100,damage+boardImpact(damageMultiplier));
   s.conditions[report.i].damage=damage;
   Object.assign(report,{damage,impact:damage-report.previous,hits});
  }
  if(offline()===objectives.length)s.won=true;
  const base=s.base;
  let incident=null;
  const responseAvailable=[4,11].some(i=>playable[i]&&(s.conditions[i]?.damage??0)<100);
  if(responseAvailable&&!deal&&!s.won&&s.wave>1&&!base.moved&&Math.random()<.18){
   const damage=1+Math.floor(Math.random()*100),loss=1+Math.floor(Math.random()*100);
   base.damage=Math.min(100,base.damage+damage);
   let lost=0;
   s.stock=s.stock.map(count=>{const removed=Math.ceil(count*loss/100);lost+=removed;return count-removed});
   incident={damage,loss,lost};
  }
  fleet.forEach((item,id)=>{
   if(!item.partner&&(base.damage===100||(base.moved&&s.wave%2===0)))return;
   if(s.wave%item.cycle===0&&(!item.partner||Math.random()<deliveryChance(item,s.wave,s.diplomacy)))s.stock[id]+=item.batch??1;
  });
  const result=settleWave(s.trust,s.reports,s.surveyReports.reduce((n,g)=>n+g.count-g.lost,0),deal,s.wave<=s.diplomacy.embargoThrough);
  s.trust=result.trust;s.credits+=result.payout-result.embargoFee;
  s.reportPending=true;
  s.invoice={...result,wave:s.wave,cost:s.launchCost??0};s.launchCost=0;
  const contract=s.contractSource??0;
  const qualified=!deal&&s.reports.some(r=>r.hit&&r.source===contract);
  const invoice=s.invoice;
  invoice.incident=incident;
  base.established=repeatLaunch()||!deal;base.moved=false;
  invoice.contract=contract;
  invoice.qualified=qualified;
  if(qualified){
   const offer=productionOffer(s,4);
   if(offer)invoice.offer=offer;
   else{s.credits+=12;invoice.payout+=12}
  }
  deliverProduction(s,Math.random,invoice);
  const freshMarks=surveyLossMarks(s.flights,s.wave);
  s.lastTracks=s.flights;s.wave++;s.threats=relocate(s.threats,s.wave,onGround).threats;s.started=0;s.flights=[];s.diplomacy=beginDiplomacy(s.wave,s.diplomacy.embargoThrough);s.partner=partnerTurn(s.partner,s.wave);
  invoice.weather=Math.random()<.5?'clear':'cloudy';
  const reviewAvailable=!s.partner.blocked&&invoice.weather==='clear';
  const beforeReview=s.surveyLossMarks.length;
  if(reviewAvailable)s.surveyLossMarks=s.surveyLossMarks.filter(()=>Math.random()>=.35);
  invoice.dismissedMarks=beforeReview-s.surveyLossMarks.length;
  s.surveyLossMarks.push(...freshMarks);
  intelligence();save();
 }
 function reportContents(panel){
   let text='',kind='none';
   if(s.partner){
    if(s.partner.blocked){kind='blocked';text=tr('Трамп заблокував партнерську розвідку на цю хвилю.','Trump blocked partner intelligence for this wave.')}
    else if(s.partner.seen?.wave===s.wave){kind='spotted';text=tr('Партнери помітили ППО. Сектор позначено на шарі розвідки.','Partners spotted air defence. The sector is marked on the intelligence layer.')}
    else text=tr('Партнери не надіслали нових спостережень.','No new sightings from partners.');
   }
   if(s.invoice?.weather){
    const clear=s.invoice.weather==='clear';
    text+=' '+(clear?tr('Погода: ясно.','Weather: clear.'):tr('Погода: хмарно. Перевірку позначок відкладено.','Weather: cloudy. Marker review postponed.'));
    if(clear&&!s.partner?.blocked)text+=' '+tr('Знято позначок: ','Markers removed: ')+s.invoice.dismissedMarks+'.';
   }
   const surveyLines=(s.surveyReports??[]).map(g=>tr('Розвідка','Survey')+' · '+tr(...surveySectors[g.sector].label)+' · '+tr(...fleet[g.type].name)+' ×'+g.count+' · '+tr('Повернулися','Returned')+' '+(g.count-(g.lost??0))+'/'+g.count+(g.lost?' · '+tr('Втрачено ','Lost ')+g.lost+tr(' пустушок',' dummies')+(g.zone?' · '+(g.zone.kind==='ew'?tr('РЕБ','EW'):tr('ППО','AD'))+tr(' імовірно в зоні ',' likely in zone ')+tr(...surveySectors[g.zone.sector].label)+' (±'+Math.round(g.zone.r)+')':''):''));
   const notices=s.surveyNotice?[tr('Нова позиція ППО/РЕБ на карті','New AD/EW position on the map')]:[];
   appendSummary(panel,{reports:s.reports,repairs:s.repairs,bulletin:text,kind,surveys:surveyLines,notices});
   for(const report of s.reports)closeReport=appendReport(panel,report,s.wave-1,tr(...cities[report.i])+' · '+tr(...names[report.i]))??closeReport;
   appendRepairs(panel,s.repairs,r=>tr(...cities[r.i])+' · '+tr(...names[r.i]));
   if(!s.reports.length&&!s.repairs?.length&&!surveyLines.length&&!notices.length)appendEmpty(panel);
  }
 const sponsorName=id=>id===1?tr('Супутникове агентство','Satellite agency'):tr('Редакція новин','News desk');
 function showWaveReport(){
  const wave=s.invoice?.wave??s.wave-1;
  const over=s.won||s.trust===0||s.credits<minimumLaunch(s.stock);
  root.innerHTML='<section class="c-card deep-wave-card" data-tone="report" role="dialog" aria-labelledby="deep-report-title"><div class="c-kicker">'+tr('ЗВІТ ДОНОРУ · ХВИЛЯ ','DONOR REPORT · WAVE ')+wave+'</div><h2 id="deep-report-title" tabindex="-1">'+tr('Підсумок хвилі','Wave report')+'</h2></section>';
  const card=root.firstElementChild,invoice=s.invoice;
  const title=card.querySelector('h2');
  root.scrollTop=0;title.focus({preventScroll:true});
  if(invoice){
   const line=document.createElement('p');
   line.textContent=(invoice.deal?tr('Угоду підписано · ','Deal accepted · '):'')+tr('Витрати ','Spent ')+invoice.cost+' · '+tr('Виплата ','Payout ')+invoice.payout+(invoice.embargoFee?' · '+tr('Ембарго −','Embargo −')+invoice.embargoFee:'')+' · '+tr('Баланс ','Balance ')+s.credits+' · '+tr('Довіра ','Trust ')+s.trust+'%';
   card.append(line);
  }
  const note=text=>{const p=document.createElement('p');p.textContent=text;card.append(p)};
  if(s.won)note(tr('Перемога! Промисловість та енергетика зупинені.','Victory! All factories and energy sites are offline.'));
  if(invoice?.incident){const e=invoice.incident;note(tr('Удар по базі','Base struck')+' · '+tr('Пошкодження','Damage')+' '+s.base.damage+'% · '+tr('Втрачено зі складу','Stock lost')+' '+e.lost+' ('+e.loss+'%)')}
  if(invoice?.contract!=null)note(sponsorName(invoice.contract)+' · '+(invoice.qualified?tr('Контракт виконано','Contract fulfilled'):tr('Умови не виконано','Terms unmet')));
  const delivery=invoice?.delivery;
  if(delivery)note(tr('Поставка','Delivery')+' · '+tr(...fleet[delivery.type].name)+' ×'+delivery.delivered+' · '+tr('Втрати','Lost')+' '+delivery.lost+' · '+tr('Залишилося','Remaining')+' '+delivery.remaining);
  if(autoOn){
   const takeover=document.createElement('button');
   takeover.textContent=tr('Грати самому','Take over');
   takeover.onclick=()=>{autoOn=false;render()};
   card.append(takeover);
  }
  if(invoice?.offer&&!invoice.choice){
   const order=invoice.offer;
   const choose=choice=>{
    if(invoice.choice)return;
    invoice.choice=choice;
    if(choice==='cash'){s.credits+=12;invoice.payout+=12}
    else{s.lastOrderWave=wave;s.production={...order,turnsLeft:order.turns};deliverProduction(s,Math.random,invoice)}
    save();render();
   };
   for(const [label,choice] of [[tr('Отримати 12 кредитів','Take 12 credits'),'cash'],[tr('Підписати замовлення','Sign production order')+' · '+tr(...fleet[order.type].name)+' ×'+order.remaining+' / '+order.turns+tr(' хвиль',' waves'),'order']]){
    const b=document.createElement('button');b.textContent=label;b.onclick=()=>choose(choice);card.append(b)
   }
   reportContents(card);
   if(autoOn)autoTimer=setTimeout(()=>{
    if(document.hidden||document.querySelector('dialog:modal'))render();
    else choose(s.credits>=65?'order':'cash');
   },1800);
   return;
  }
  const unreported=new Set((s.lastTracks??[]).filter(f=>!f.survey).map(f=>f.i));
  for(const r of s.reports)unreported.delete(r.i);
  if(unreported.size){
   const missing=document.createElement('p');missing.textContent=tr('Немає незалежного звіту: ','No independent report: ')+[...unreported].map(i=>tr(...cities[i])).join(', ');card.append(missing);
  }
  const next=document.createElement('button');next.textContent=over?tr('Підсумок кампанії','Campaign result'):tr('Наступна хвиля →','Next wave →');
  next.onclick=()=>{s.reportPending=false;save();render()};title.after(next);
  reportContents(card);
  if(autoOn&&!over)autoTimer=setTimeout(()=>{
   if(document.hidden||document.querySelector('dialog:modal'))render();
   else next.click();
  },3200);
 }
 function render(){
  closeReport?.();closeReport=null;
  clearTimeout(timer);clearTimeout(autoTimer);
  if(!root.isConnected)return;
  const elapsed=Date.now()-s.started;
  if(s.started&&s.flights.every(f=>elapsed>=f.duration+1200))finish();
  if(s.reportPending&&!s.started){showWaveReport();return}
  const flying=!!s.started;
  const phase=flying?tr('У польоті','In flight'):tr('Планування','Planning');
  const autoLabel=autoOn?tr('Грати самому','Take over'):tr('Автогра','Autoplay');
  const legend='<details class="deep-legend"'+(legendOpen?' open':'')+'><summary>'+tr('Легенда','Legend')+'</summary><ul>'+
   [0,1,2].map(l=>'<li>'+glyphSvg(l)+tr(...layerNames[l])+'</li>').join('')+
   '<li><i class="lg lg-base"></i>'+tr('База запуску','Launch base')+'</li><li><i class="lg lg-range"></i>'+tr('Радіус дальності','Range ring')+'</li><li><i class="lg lg-alert"></i>'+tr('Імовірна ППО','Suspected air defence')+'</li><li><i class="lg lg-sel"></i>'+tr('Обрана ціль','Selected target')+'</li><li><i class="lg lg-survey"></i>'+tr('Сектор розвідки','Survey sector')+'</li><li><i class="lg lg-ad"></i>'+tr('ППО? (за втратами)','AD? (from losses)')+'</li><li><i class="lg lg-ew"></i>'+tr('РЕБ? (за втратами)','EW? (from losses)')+'</li><li><i class="lg lg-loss"></i>'+tr('Збито / заглушено','Shot / jammed')+'</li></ul></details>';
  root.innerHTML=coalitionHeader('<button class="c-sides c-auto" data-auto aria-pressed="'+autoOn+'">'+autoLabel+'</button><span class="chip"><i class="dot"></i>'+phase+'</span><button class="c-sides" data-exit>'+tr('Сторони','Factions')+'</button>')+
   '<section class="c-main deep-layout"><aside class="col c-left"><section class="panel br deep-phase"><div class="label">'+tr('Поточна фаза','Current phase')+'</div><div class="phase-row"><b class="big">'+String(s.wave).padStart(2,'0')+'</b><div><h1>'+tr('Діпстрайк','Deepstrike')+'</h1><div class="c-phase"><span class="deep-phase-chip" data-flying="'+flying+'">'+phase+'</span></div></div></div><div class="deep-credits"><span>'+tr('Кредити','Credits')+'</span><b>'+s.credits+'</b></div></section><section class="panel br" data-supply></section></aside>'+
   '<section class="c-play panel br"><div class="label">'+tr('Карта секторів','Sector map')+'</div><div class="deep-layers c-toggles"></div><svg viewBox="0 0 100 100" aria-label="'+tr('Карта секторів','Sector map')+'"></svg>'+legend+'</section>'+
   '<aside class="col c-right"><section class="panel br"><div class="label">'+tr('План хвилі','Wave plan')+'</div><div class="c-cards" data-plan></div></section></aside></section>';
  root.querySelector('.deep-legend').ontoggle=e=>{legendOpen=e.currentTarget.open};
  root.querySelector('[data-exit]').onclick=()=>{autoOn=false;clearTimeout(autoTimer);changeSide()};
  root.querySelector('[data-language]').onclick=()=>document.querySelector('.lang').click();
  root.querySelector('[data-auto]').onclick=()=>{autoOn=!autoOn;render()};
  const controls=root.querySelector('.deep-layers'),panel=root.querySelector('[data-plan]'),supply=root.querySelector('[data-supply]');
  const treasury=document.createElement('section');treasury.className='panel br';
  supply.before(treasury);
  const details=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent=tr('Спонсори · довіра ','Sponsors · trust ')+s.trust+'%';
  details.append(summary,document.createTextNode(tr(
   'Хвиля: 5 кредитів + ціна кожного борта. За підтверджений звіт: новини 30, супутник 36, і +10 за кожне додаткове попадання по тій самій цілі. Суму помножено на 50% + половину довіри. Розвідка з поверненням: 3 за хвилю. Без підтверджень: −12 довіри, з поверненням розвідки: −4. Підтвердження: +5. Ембарго: −4 кредити за хвилю.',
   'Wave: 5 credits plus each unit. Confirmed report: news 30, satellite 36, and +10 per additional hit at the same site. The total scales by 50% plus half your trust. Returning survey: 3 per wave. No confirmations: −12 trust, or −4 with a returning survey. Confirmation: +5. Embargo: −4 credits per wave.')));
  treasury.append(details);
  if(s.invoice){
   const r=s.invoice,line=document.createElement('p');
   line.textContent=tr('Хвиля ','Wave ')+r.wave+' · '+tr('Витрати ','Spent ')+r.cost+' · '+(r.deal?tr('Аванс ','Advance '):tr('Виплата ','Payout '))+r.payout+(r.embargoFee?' · '+tr('Ембарго −','Embargo −')+r.embargoFee:'')+' · '+tr('Довіра ','Trust ')+(r.trustChange>0?'+':'')+r.trustChange;
   treasury.append(line);
  }
  if(!flying&&(s.won||s.trust===0||s.credits<minimumLaunch(s.stock))){
   autoOn=false;root.querySelector('[data-auto]').disabled=true;
   root.querySelector('.deep-phase-chip').textContent=s.won?tr('Перемога','Victory'):tr('Гру завершено','Game over');
   panel.textContent=s.won?tr('Перемога! Усі заводи та енергетичні об’єкти одночасно зупинені.','Victory! All factories and energy sites are offline together.'):s.trust===0?tr('Спонсори закрили програму.','Sponsors withdrew funding.'):tr('Бюджету не вистачає на наступну хвилю.','The budget cannot fund another wave.');
   button(panel,tr('Нова кампанія','New campaign'),()=>{if(write(key,null))location.reload()});
   return;
  }
  if(!flying){
   const status=document.createElement('p');
   status.textContent=tr('До перемоги · зупинено ','Victory objective · offline ')+offline()+'/'+objectives.length+' · '+objectives.map(i=>tr(...names[i])+' '+(s.conditions[i]?.damage??0)+'%').join(', ');
   treasury.append(status);
   const base=s.base, info=document.createElement('p');
   info.textContent=tr('База №','Base #')+base.station+' · '+tr('Пошкодження ','Damage ')+base.damage+'%';
   info.textContent+=repeatLaunch()?tr(' · Точність 90% · шкода +25%',' · Accuracy 90% · damage +25%'):tr(' · Точність 60% · базова шкода',' · Accuracy 60% · base damage');
   treasury.append(info);
   const hint=document.createElement('small');hint.textContent=tr('Переїзд скидає бонус і захищає склад на одну хвилю. Удар можливий, поки працює ворожий аеродром або пускова. У парну хвилю переїзду місцеву поставку пропущено. При 100% пошкодження місцеве виробництво зупиняється.','Moving resets the bonus and protects stock for one wave. A working enemy airfield or launcher is required for a counterstrike. Moving on an even wave skips local supply. At 100% damage local production stops.');treasury.append(hint);
   button(treasury,tr('Перемістити базу','Move base'),()=>{base.station=3-base.station;base.established=false;base.moved=true;save();render()},base.moved);
   const repair=Math.min(25,base.damage),fee=Math.ceil(repair/5);
   if(repair)button(treasury,tr('Ремонт','Repair')+' '+repair+'% · '+fee+tr(' кр.',' cr.'),()=>{base.damage-=repair;s.credits-=fee;save();render()},fee>s.credits);
   const heading=document.createElement('div');heading.className='label';heading.textContent=tr('Контракт спонсора · оберіть підтвердження','Sponsor contract · choose the evidence');treasury.append(heading);
   for(const id of [0,1])button(treasury,sponsorName(id)+' · +12',()=>{s.contractSource=id;save();render()},false,(s.contractSource??0)===id,'c-sides');
   if(s.production){const p=document.createElement('p');p.textContent=tr('У виробництві','In production')+' · '+tr(...fleet[s.production.type].name)+' ×'+s.production.remaining;treasury.append(p)}
  }
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
   const picker=document.createElement('label'),select=document.createElement('select');
   picker.className='deep-picker';picker.textContent=tr('Сектор розвідки','Survey sector');
   surveySectors.forEach((entry,i)=>select.add(new Option(tr(...entry.label),String(i))));
   select.value=String(sector);select.onchange=()=>{sector=Number(select.value);save();render()};
   picker.append(select);list.before(picker);
   fleet.forEach((unit,id)=>{
    const card=document.createElement('button'),cur=Math.round(radius(id)),defense=defenses[unit.weakTo]??{};
    card.type='button';card.className='c-buy deep-unit';card.dataset.unit=id;
    card.setAttribute('aria-pressed',String(id===active));
    card.innerHTML='<span class="c-badge"><svg aria-hidden="true" viewBox="-3.5 -3 7 6"><path fill="currentColor" d="'+flightIcons[id]+'"/></svg></span>'+
     '<span class="c-name"><b>'+tr(...unit.name)+'</b><span class="deep-range"><span class="deep-bar" aria-hidden="true"><i style="width:'+Math.round(cur/unit.limit*100)+'%"></i></span><small>'+tr('Дальність','Range')+' '+cur+' / '+unit.limit+'</small></span></span>'+
     '<span class="deep-count" aria-label="'+tr('Доступно','Available')+' '+available(id)+'" data-empty="'+(available(id)<1)+'">×'+available(id)+'</span>'+
     (unit.surveyOnly?'<span class="deep-chips"><small class="deep-chip survey" title="'+tr('Розвідка · ризик перехоплення','Survey · interception chance')+' '+Math.round(unit.surveyLoss*100)+'%">'+tr('Розвідка · ризик перехоплення','Survey · interception chance')+' <b>'+Math.round(unit.surveyLoss*100)+'%</b></small></span>':
     '<span class="deep-chips"><small class="deep-chip" title="'+tr(...defense.profile)+' · '+tr('Шанс перехоплення','Intercept chance')+' '+unit.baseChance+'%">'+tr('Перехоплення','Intercept')+' <b>'+unit.baseChance+'%</b></small>'+
     '<small class="deep-chip weak" title="'+tr('Проти ППО','Against')+' «'+tr(...defense.name)+'» · '+interceptionChance(unit,unit.weakTo)+'%">'+tr('Слабкий проти','Weak to')+' «'+tr(...defense.name)+'» <b>'+interceptionChance(unit,unit.weakTo)+'%</b></small></span>')+
     '<small class="deep-prod">'+tr('Ціна борта','Unit cost')+' '+launchPrices[id]+' · '+(unit.partner?tr('Шанс поставки','Delivery chance')+' '+Math.round(deliveryChance(unit,s.wave,s.diplomacy)*100)+'%':tr('Виробництво','Production'))+' +'+(unit.batch??1)+' / '+unit.cycle+' '+tr('хв. гри','game waves')+'</small>';
    card.onclick=()=>{active=id;render();root.querySelector('[data-unit="'+id+'"]').focus({preventScroll:true})};
    const group=document.createElement('div');group.className='deep-unit-group';group.append(card);
    if(unit.surveyOnly){
     const stepper=document.createElement('div'),count=surveys[sector]?.[id]??0;
     stepper.className='deep-survey-stepper';
     const adjust=delta=>{
      const row=surveys[sector]??={};
      row[id]=count+delta;
      if(!row[id])delete row[id];
      if(!Object.keys(row).length)delete surveys[sector];
      if(delta>0)s.lastTracks=[];
      save();render();
     };
     const minus=button(stepper,'−',()=>adjust(-1),count===0,undefined,'c-sides deep-step');
     minus.setAttribute('aria-label',tr('Зняти з розвідки','Remove from survey')+' · '+tr(...unit.name));
     const label=document.createElement('span');label.textContent=tr('Розвідка','Survey')+' ×'+count;stepper.append(label);
     const plus=button(stepper,'+',()=>adjust(1),available(id)<=0,undefined,'c-sides deep-step');
     plus.setAttribute('aria-label',tr('Додати до розвідки','Add to survey')+' · '+tr(...unit.name));
     const buy=button(group,tr('Купити 5 · 1 кредит','Buy 5 · 1 credit'),()=>{
      if(s.credits<1)return;
      s.credits--;s.stock[id]+=5;save();render();
     },s.credits<1,undefined,'c-sides deep-ghost deep-buy5');
     group.insertBefore(stepper,buy);
    }
    list.append(group);
   });
  }
  supply.hidden=flying;
  let visibleTotal=0;const sum=document.createElement('div'),list2=document.createElement('div');sum.className='deep-sum';list2.className='deep-targets';
  const kindName=k=>k==='ew'?tr('РЕБ','EW'):tr('ППО','AD');
  function zonesBlock(){
   const box=document.createElement('section');box.className='deep-zones';
   const list=[...s.trace].sort((a,b)=>confidence(b)-confidence(a));
   box.innerHTML='<div class="deep-sec">'+tr('Відомі зони ППО/РЕБ','Known AD/EW zones')+' <b>'+list.length+'</b></div>'+
    (list.length?'<ul>'+list.map(e=>'<li class="'+e.kind+(e.stale?' stale':'')+'"><b>'+kindName(e.kind)+(e.confirmed?'':'?')+'</b><span>'+tr(...surveySectors[nearestLane(e.x,e.y)].label)+' · ±'+Math.round(e.r)+'</span><small>'+confidence(e)+'% · '+Math.max(0,s.wave-1-e.wave)+tr(' хв. тому',' w. ago')+(e.stale?' · '+tr('застаріло','stale'):'')+'</small></li>').join('')+'</ul>':
     '<p class="deep-hint">'+tr('Втрати пустушок покажуть, де стоїть ППО або РЕБ.','Dummy losses will show where air defence or EW stands.')+'</p>');
   return box;
  }
  if(!flying)panel.append(zonesBlock(),sum,list2);
  const zoom=document.createElement('select');zoom.setAttribute('aria-label',tr('Масштаб карти','Map scale'));
  zoom.add(new Option(tr('Усі області','All regions'),'-1'));
  cities.forEach((name,i)=>playable[i]&&zoom.add(new Option(tr(...name),String(i))));
  zoom.value=String(city);zoom.onchange=()=>{city=Number(zoom.value);render()};controls.append(zoom);
  const map=root.querySelector('.c-play > svg');
  if(city>=0){const [x,y]=points[city];map.setAttribute('viewBox',[Math.min(62,Math.max(0,x-19)),Math.min(62,Math.max(0,y-19)),38,38].join(' '))}
  const flags=flagged(),R=radius();
  const reasonOf=i=>flying?'':fleet[active].surveyOnly?tr('Лише розвідка','Survey only'):!inRange(i,active)?tr('Поза дальністю','Out of range'):available(active)<1?tr('Немає запасу','No stock'):'';
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
  if(visible[2])for(const e of s.trace){
   const ad=e.kind==='ad',label=kindName(e.kind)+(e.confirmed?' ×'+e.hits:'?'),ago=Math.max(0,s.wave-1-e.wave);
   map.insertAdjacentHTML('beforeend','<g class="th th-'+e.kind+(e.confirmed?' conf':'')+(e.stale?' stale':'')+'" pointer-events="none"><title>'+label+' · '+confidence(e)+'% · ±'+Math.round(e.r)+' · '+ago+tr(' хв. тому',' w. ago')+(e.stale?' · '+tr('застаріло','stale'):'')+'</title>'+
    '<circle class="th-ring" cx="'+e.x+'" cy="'+e.y+'" r="'+e.r+'"/><g transform="translate('+e.x+' '+e.y+')">'+
    (ad?'<path class="th-glyph" d="M0-2.2 2.1 1.6H-2.1Z"/><circle class="th-in" r=".6" cy=".35"/>':'<circle class="th-glyph" r="2"/><path class="th-in" d="M.5-1.4-.9.2H0L-.5 1.4 .9-.2H0Z"/>')+
    '</g><text class="atlas-city th-label" x="'+e.x+'" y="'+(e.y+4.4)+'">'+label+'</text></g>');
  }
  if(!flying){
   surveySectors.forEach((entry,index)=>{
    const [x,y]=entry.point,count=sumRow(surveys[index]??{});
    if(index!==sector&&!count)return;
    map.insertAdjacentHTML('beforeend','<g class="ds-sector'+(index===sector?' cur':'')+'" data-sector="'+index+'" pointer-events="none"><title>'+tr('Сектор розвідки','Survey sector')+' · '+tr(...entry.label)+'</title><circle cx="'+x+'" cy="'+y+'" r="2.5"/><circle class="ds-sector-dot" cx="'+x+'" cy="'+y+'" r=".45"/><text x="'+x+'" y="'+(y+4.8)+'">'+tr(...entry.label)+(count?' ×'+count:'')+'</text></g>');
   });
   let n=0;
   for(const [i,row] of selected){
    const path=sitePath(i,row,flags),[ex,ey]=points[i];n++;
    map.insertAdjacentHTML('beforeend','<polyline class="atlas-plan" points="'+path.map(p=>p.join(',')).join(' ')+'"/>'+
     [.22,.45,.68].map(f=>{const c=travel(path,f);return '<path class="ds-chev" transform="translate('+c.x+' '+c.y+') rotate('+c.angle+')" d="M-.7-.7L.2 0L-.7.7"/>'}).join('')+
     '<g class="ds-num" transform="translate('+(ex-3.2)+' '+(ey-3.2)+')" pointer-events="none"><circle r="1.55"/><text y=".65">'+n+'</text></g>');
   }
  }
  points.forEach(([x,y],i)=>playable[i]&&map.insertAdjacentHTML('beforeend','<text class="atlas-city" x="'+x+'" y="'+(y-3.9)+'">'+tr(...cities[i])+'</text>'));
  const srcLetter=[tr('В','F'),tr('П','P'),tr('С','S')];
  points.forEach(([x,y],i)=>{
   if(!playable[i]||!visible[layers[i]]||(layers[i]===2&&!s.intel[i]))return;
   const label=tr(...names[i]),intel=s.intel[i],status=conditionText(s.conditions[i]?.damage,!!s.conditions[i]),sel=selected.has(i),why=reasonOf(i),row=selected.get(i),count=row?sumRow(row):0,w=Math.max(7,label.length*1.2+2.2);
   const state=s.conditions[i]?.damage===100?'out':s.conditions[i]?.damage?'dmg':s.conditions[i]?'fixed':'ok';
   map.insertAdjacentHTML('beforeend','<g class="site mk-'+layers[i]+(sel?' sel':'')+(why&&!sel?' dim':'')+'" data-site="'+i+'" tabindex="0" role="button" aria-pressed="'+sel+'" aria-label="'+tr(...cities[i])+' · '+label+' · '+status+(sel?' · '+tr('Дронів','Drones')+' '+count:'')+(why?' · '+why:'')+'"><title>'+status+(why?' · '+why:'')+'</title><g transform="translate('+x+' '+y+')">'+
    '<circle class="hit" r="4.4"/>'+(sel?'<circle class="pulse" r="2.9"/>':'')+'<circle class="ring" r="2.9"/><circle class="site-focus" r="3.9"/>'+glyph(layers[i])+
    '<rect class="plate" data-state="'+state+'" x="'+(-w/2)+'" y="3.6" width="'+w+'" height="3.1" rx=".5"/><text class="site-label" y="5.85">'+label+'</text>'+
    (intel?'<g class="intel" transform="translate(2.7 -2.7)"><circle r="1.3"/><text y=".55">'+srcLetter[intel.source]+'</text><title>'+tr(...sources[intel.source])+' W'+intel.wave+'</title></g>':'')+
    (sel?'<g class="unit" transform="translate(4.9 -.2)"><circle r="1.9"/><path transform="scale(.5)" d="'+flightIcons[+Object.keys(row)[0]]+'"/><g class="unit-n" transform="translate(1.5 -1.5)"><circle r="1.25"/><text y=".55">'+count+'</text></g></g>':'')+'</g></g>');
   if(!flying){
    const wrap=document.createElement('div');wrap.className='deep-row';wrap.dataset.row=i;list2.append(wrap);
    const card=button(wrap,tr(...cities[i])+' · '+label+' · '+status+(sel?' · '+count+' '+tr('дронів','drones'):'')+(intel?' · '+tr(...sources[intel.source])+' W'+intel.wave:'')+(why?' · '+why:''), ()=>{refocusCard=i;toggle(i)},!!why,sel,'c-sponsor target-card deep-target');
    card.title=why||status;card.dataset.card=i;visibleTotal++;
    card.innerHTML='<span class="deep-t-main"><b>'+tr(...cities[i])+'</b><small>'+label+'</small></span><span class="deep-t-meta">'+
     (why?'<span class="deep-tag">'+why+'</span>':'')+'<span class="deep-status" data-state="'+state+'">'+status+'</span>'+
     (intel?'<span class="deep-intel" title="'+tr(...sources[intel.source])+' W'+intel.wave+'">'+srcLetter[intel.source]+' W'+intel.wave+'</span>':'')+
     (sel?'<span class="deep-t-count" title="'+tr('Дронів','Drones')+'">×'+count+'</span>':'')+'</span>';
    if(sel){
     const bar=document.createElement('div');bar.className='deep-asg';wrap.dataset.sel='true';wrap.append(bar);
     for(const [typeKey,n] of Object.entries(row)){
      const type=+typeKey,chip=document.createElement('span'),unit=fleet[type];
      chip.className='deep-asg-chip';
      chip.innerHTML='<svg class="deep-asg-ico" aria-hidden="true" viewBox="-3.5 -3 7 6"><path fill="currentColor" d="'+flightIcons[type]+'"/></svg><b>'+tr(...unit.name)+'</b>';
      const minus=button(chip,'−',()=>{refocusStep=i+':'+type+':-';change(i,type,-1);render()},false,undefined,'deep-step');
      minus.dataset.step=i+':'+type+':-';minus.setAttribute('aria-label',tr('Зняти дрон','Remove drone')+' · '+tr(...unit.name)+' · '+tr(...cities[i]));
      const num=document.createElement('span');num.className='deep-asg-n';num.textContent='×'+n;chip.append(num);
      const plus=button(chip,'+',()=>{refocusStep=i+':'+type+':+';change(i,type,1);render()},!inRange(i,type)||available(type)<1,undefined,'deep-step');
      plus.dataset.step=i+':'+type+':+';plus.setAttribute('aria-label',tr('Додати дрон','Add drone')+' · '+tr(...unit.name)+' · '+tr(...cities[i]));
      bar.append(chip);
     }
     const clear=button(bar,tr('Зняти всі','Clear'),()=>{refocusCard=i;selected.delete(i);save();render()},false,undefined,'deep-clear');
     clear.setAttribute('aria-label',tr('Прибрати всі дрони з цілі','Remove all drones from target')+' · '+tr(...cities[i]));
    }
   }
  });
  function toggle(i){
   if(flying||!playable[i])return;
   change(i,active,1);
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
   if(!site)return;
   if(e.key==='Backspace'||e.key==='Delete'){
    e.preventDefault();refocus=+site.dataset.site;if(marking||flying)return;
    const row=selected.get(refocus),last=row&&Object.keys(row).pop();
    if(last!==undefined){change(refocus,+last,-1);render()}
    return;
   }
   if(e.key!=='Enter'&&e.key!==' ')return;
   e.preventDefault();refocus=+site.dataset.site;if(marking||flying)return;toggle(refocus);
  };
  if(refocus>=0){map.querySelector('[data-site="'+refocus+'"]')?.focus({preventScroll:true});refocus=-1}
  if(refocusStep){
   const el=root.querySelector('[data-step="'+refocusStep+'"]')??root.querySelector('[data-step="'+refocusStep.slice(0,-1)+(refocusStep.endsWith('-')?'+':'-')+'"]')??root.querySelector('[data-card="'+refocusStep.split(':')[0]+'"]');
   el?.focus({preventScroll:true});refocusStep=null;
  }
  if(refocusCard>=0){root.querySelector('[data-card="'+refocusCard+'"]')?.focus({preventScroll:true});refocusCard=-1}
  function drawTracks(overlay,flights,elapsed){
   const past=elapsed===Infinity,calm=reduced();
   for(const f of flights){
    const t=Math.min(1,elapsed/f.duration),laneLoss=!!(f.lane&&f.lost),jam=f.cause==='jammed';
    const path=f.path??[[7,48],points[f.i]];
    const {x:px,y:py,angle,segment}=travel(path,laneLoss?Math.min(t,f.lossAt):t*(f.lost?lostTrackFraction:1));
    const flown=[...path.slice(0,segment+1),[px,py]].map(p=>p.join(',')).join(' ');
    const done=laneLoss?t>=f.lossAt:t===1,k=past?1:Math.min(1,Math.max(0,(elapsed-(laneLoss?f.lossAt*f.duration:f.duration))/1200)),tone=done?(f.lost?(jam?'#6fd3e8':'#ff6b5e'):f.survey?'#7fcfa6':'#ffb347'):f.survey?'#bfeed3':'#ece4bd';
    let h='<g class="trk'+(past?' past':'')+'">'+(past?'':'<polyline class="trk-plan" points="'+path.map(p=>p.join(',')).join(' ')+'"/><polyline class="trk-glow" stroke="'+tone+'" points="'+flown+'"/>')+'<polyline class="trk-line atlas-track" stroke="'+tone+'" points="'+flown+'"/>';
    if(!past&&f.surprise&&t>=.4){
     const [x,y]=f.surprise,pulse=calm?0:Math.abs(Math.sin(elapsed/230));
     h+='<g class="trk-warn"><circle cx="'+x+'" cy="'+y+'" r="'+(3.1+pulse*.9)+'" fill="#db564730" stroke="#eb7962" stroke-width=".4" stroke-opacity="'+(.95-pulse*.4)+'"/><circle cx="'+x+'" cy="'+y+'" r="'+(1.8+pulse*.4)+'" fill="none" stroke="#eb7962" stroke-width=".25" stroke-dasharray=".6 .5"/><text x="'+x+'" y="'+(y+1)+'">!</text></g>';
    }
    let symbol;
    if(!done)symbol='<g transform="rotate('+angle+')"><path d="M-7 0H0" stroke="url(#wake)" stroke-width=".7"/><path d="'+(flightIcons[f.type]??flightIcons[0])+'" fill="white" stroke="#25343a" stroke-width=".15"/></g>';
    else if(past&&f.survey&&f.lost)symbol='';
    else if(f.lost){
     const kr=calm&&!past?.4:k;
     symbol=(past?'':'<circle class="trk-ring'+(jam?' jam':'')+'" r="'+(1.4+kr*3.6)+'" opacity="'+(.85*(1-kr))+'"/>')+(jam?'<path class="trk-bolt" d="M.6-1.9-1 .35H0L-.6 1.9 1-.35H0Z"'+(past?' transform="scale(.7)"':'')+'/>':'<path class="trk-x" d="M-1.5-1.5L1.5 1.5M1.5-1.5L-1.5 1.5"'+(past?' transform="scale(.7)"':'')+'/>');
    }
    else if(f.survey)symbol='<g class="trk-ok"'+(past?' transform="scale(.8)"':'')+'>'+(past?'':'<circle class="trk-wave ok" r="'+(1.5+k*3)+'" opacity="'+(.9*(1-k))+'"/>')+'<circle r="1.35"/><path d="M-.7 0L-.2.6L.75-.6"/></g>';
    else symbol='<g'+(past?' transform="scale(.6)"':'')+'>'+(past?'':'<circle class="trk-wave" r="'+(1.5+k*4)+'" opacity="'+(.9*(1-k))+'"/>'+[0,1,2,3,4,5,6,7].map(a=>'<path class="trk-ray" d="M0-1.9V-'+(2.8+k*1.1)+'" transform="rotate('+(a*45+(a%2?0:11))+')"/>').join(''))+'<circle r="2.1" fill="#ff802740"/><path d="M0 1.5C-2 1-1.6-.4-.6-1.3L-.45-.45Q.4-1 .15-2.4C2 .1 1.6 1.2 0 1.5" fill="#ff972e"/><circle cy=".6" r=".55" fill="#ffe39a"/></g>';
    if(past&&done)symbol+=f.lost||f.survey?'':'<g class="trk-tick" transform="translate(2.4 -2.4)"><circle r="1.2"/><path d="M-.6 0L-.15.5L.65-.5"/></g>';
    h+='<g '+(f.survey?'data-survey-unit="'+f.number+'" ':'')+'transform="translate('+px+' '+py+')"><title>'+tr(...fleet[f.type??0].name)+(f.survey?' #'+f.number:'')+'</title>'+symbol+'</g></g>';
    overlay.insertAdjacentHTML('beforeend',h);
   }
  }
  if(!flying&&s.lastTracks?.length){
   const history=document.createElementNS('http://www.w3.org/2000/svg','g');
   history.setAttribute('pointer-events','none');map.append(history);
   drawTracks(history,mapFlights(s.lastTracks),Infinity);
  }
  if(!flying){
   for(const mark of s.surveyLossMarks){
    const label=tr('Зв’язок втрачено · хв. ','Signal lost · W')+mark.wave+' · #'+mark.number;
    const jam=mark.cause==='jammed',fade=Math.max(.3,1-Math.max(0,s.wave-1-mark.wave)*.18);
    map.insertAdjacentHTML('beforeend','<g class="survey-loss" pointer-events="none" opacity="'+fade+'"><title>'+label+(mark.cause?' · '+(jam?tr('заглушено','jammed'):tr('збито','shot')):'')+'</title>'+(jam?'<path class="trk-bolt" d="M'+(mark.x+.6)+' '+(mark.y-1.9)+'L'+(mark.x-1)+' '+(mark.y+.35)+'H'+mark.x+'L'+(mark.x-.6)+' '+(mark.y+1.9)+'L'+(mark.x+1)+' '+(mark.y-.35)+'H'+mark.x+'Z"/>':'<path class="trk-x" d="M'+(mark.x-1)+' '+(mark.y-1)+'l2 2m-2 0l2 -2"/>')+'</g>');
   }
  }
  const surveyTotal=Object.values(surveys).reduce((n,row)=>n+sumRow(row),0),drones=droneCount(),launchTotal=drones+surveyTotal;
  const fillSum=()=>{
   sum.innerHTML='<span class="deep-sum-n"><b>'+drones+'</b><small>'+tr('дронів обрано','drones selected')+' · '+selected.size+' / '+visibleTotal+' '+tr('цілей','targets')+'</small></span><span class="deep-credits"><span>'+tr('Кредити','Credits')+'</span><b>'+s.credits+'</b></span>';
   if(!visibleTotal)list2.innerHTML='<p class="dr-empty"><span>'+tr('Немає видимих цілей. Увімкніть шари або купіть знімок.','No visible targets. Enable layers or buy imagery.')+'</span></p>';
  };
  if(flying){
   // HUD rows group the drones sent to one site (survey groups get a row each).
   const entries=[],bySite=new Map();
   for(const f of s.flights){
    if(f.survey){entries.push({flights:[f],drones:f.count,survey:true,types:[[f.type,f.count]],place:tr('Розвідка','Survey')+' · '+tr(...surveySectors[f.sector].label)});continue}
    let e=bySite.get(f.i);
    if(!e){e={flights:[],drones:0,counts:{},place:tr(...cities[f.i])+' · '+tr(...names[f.i])};bySite.set(f.i,e);entries.push(e)}
    e.flights.push(f);e.drones++;e.counts[f.type??0]=(e.counts[f.type??0]??0)+1;
   }
   for(const e of entries)e.types??=Object.entries(e.counts).map(([type,n])=>[+type,n]);
   const hud=document.createElement('div');hud.className='deep-hud';
   hud.innerHTML='<div class="deep-sec">'+tr('Хвиля в польоті','Wave in flight')+' <b>'+entries.reduce((n,e)=>n+e.drones,0)+'</b></div>';
   const rows=entries.map(e=>{
    const row=document.createElement('div');row.className='deep-flight';
    const title=e.types.map(([type,n])=>tr(...fleet[type].name)+(n>1||e.types.length>1?' ×'+n:'')).join(', ');
    row.innerHTML='<span class="c-badge"><svg aria-hidden="true" viewBox="-3.5 -3 7 6"><path fill="currentColor" d="'+(flightIcons[e.types[0][0]]??flightIcons[0])+'"/></svg></span><span class="c-name"><b>'+title+'</b><small>'+e.place+'</small></span><span class="deep-f-stat"></span><span class="deep-bar" aria-hidden="true"><i></i></span>';
    hud.append(row);return {row,bar:row.querySelector('i'),stat:row.querySelector('.deep-f-stat')};
   });
   panel.append(hud);
   const paint=elapsed=>entries.forEach((e,n)=>{
    const end=Math.max(...e.flights.map(f=>f.duration)),t=Math.min(1,elapsed/end),r=rows[n];
    const tally=e.survey?(e.flights[0].losses??[]):[];
    const alive=e.survey?e.drones-tally.filter(isLost).length:e.flights.filter(f=>!f.lost).length;
    const st=t<1?'go':alive?'hit':'lost';
    const lossText=list=>{
     const part=[[list.filter(l=>l.cause==='shot').length,tr('збито','shot')],[list.filter(l=>l.cause==='jammed').length,tr('заглушено','jammed')],[list.filter(l=>l.cause==='unknown').length,tr('зв’язок','signal')]].filter(([n])=>n).map(([n,w])=>n+' '+w);
     return list.length?tr('Втрачено ','Lost ')+list.length+' ('+part.join(' · ')+')':'';
    };
    const records=tally.filter(l=>l&&typeof l==='object'&&l.lost),reached=records.filter(l=>l.fraction*e.flights[0].duration<=elapsed);
    r.row.dataset.state=st;r.bar.style.width=(t*100)+'%';
    r.stat.textContent=st==='go'?tr('Летить','En route')+(reached.length?' · '+lossText(reached):''):st==='lost'&&!e.survey?tr('Перехоплено','Intercepted'):
     e.survey?tr('Повернулися','Returned')+' '+alive+'/'+e.drones+(records.length?' · '+lossText(records):''):tr('Влучання','Impact')+(e.drones>1?' '+alive+'/'+e.drones:'');
   });
   const overlay=document.createElementNS('http://www.w3.org/2000/svg','g');map.append(overlay);
   const tracks=mapFlights(s.flights);
   function animate(){
    const elapsed=Date.now()-s.started;
    if(s.flights.every(f=>elapsed>=f.duration+1200)){render();return}
    overlay.replaceChildren();
    paint(elapsed);
    drawTracks(overlay,tracks,elapsed);
    timer=setTimeout(animate,80);
   }
   animate();return;
  }
  fillSum();
  {
   const zones=knownZones(),risky=zones.length?[...selected].filter(([i,row])=>zoneHits(sitePath(i,row,flags),zones)>0).map(([i])=>tr(...cities[i])):[];
   if(risky.length){
    const warn=document.createElement('span');warn.className='deep-chips deep-zone-warn';warn.setAttribute('role','status');
    warn.innerHTML=risky.map(name=>'<small class="deep-chip warn">'+tr('Маршрут проходить зону ППО/РЕБ','Route crosses an AD/EW zone')+' · <b>'+name+'</b></small>').join('');
    panel.append(warn);
   }
  }
  const acts=document.createElement('div');acts.className='deep-actions';panel.append(acts);
  const ghosts=document.createElement('div');ghosts.className='deep-ghosts';
  const planCost=()=>waveCost(fleet.map((_,id)=>assigned(id)));
  const cost=planCost();
  function launchWave(){
   const cost=planCost();
   if(s.started||!cost||s.credits<cost||fleet.some((_,id)=>available(id)<0))return;
   const groups=Object.entries(surveys).flatMap(([sectorKey,row])=>Object.entries(row).map(([type,count])=>({sector:Number(sectorKey),type:Number(type),count})));
   s.credits-=cost;s.launchCost=cost;
   recordLaunch(s.diplomacy,s.wave,selected);
   s.flights=[];
   for(const [i,row] of selected){
    const types=Object.entries(row).flatMap(([type,n])=>Array(n).fill(+type));
    const path=sitePath(i,row,flags);
    // The group shares one path, surprise and pace; lanes keep a tight formation and each drone rolls its own interception.
    const surprise=Math.random()<.27?path[1]:null;
    const encounter=!!surprise||crossedThreats(path,s.threats).length>0||(s.partner&&district(points[i])===district(patrolSectors[s.partner.sector]));
    const base=2500+travel(path,1).total*(65+Math.random()*90);
    const [ox,oy]=path[0],[ex,ey]=path[path.length-1],length=Math.hypot(ex-ox,ey-oy)||1;
    types.forEach((type,k)=>{
     s.stock[type]--;
     const lane=(k-(types.length-1)/2)*.6,dx=-(ey-oy)/length*lane,dy=(ex-ox)/length*lane;
     s.flights.push({i,type,path:path.map(([x,y])=>[x+dx,y+dy]),surprise,duration:Math.round(base*(1+(Math.random()-.5)*.05)),lost:rollInterception(fleet[type],encounter)});
    });
   }
   for(const group of groups){
    s.stock[group.type]-=group.count;
    const risk=fleet[group.type].surveyLoss??0;
    // Each dummy flies its corridor lane; hidden AD/EW can shoot or jam it (see deep-threats.js).
    const path=lanePath(group.sector),losses=resolveSurvey(path,group.count,s.threats,Math.random,risk);
    s.flights.push({...group,survey:true,losses,path,duration:6000});
   }
   for(const sectorKey of Object.keys(surveys))delete surveys[sectorKey];
   selected.clear();marking=false;s.started=Date.now();save();render();
  }
  const launch=button(acts,tr('Запустити хвилю','Launch wave')+' ('+launchTotal+')',launchWave,!launchTotal||s.credits<cost);
  launch.className='c-start deep-launch';
  launch.innerHTML='<span>'+tr('Запустити хвилю','Launch wave')+'</span><span class="deep-pill">'+launchTotal+' · '+cost+' '+tr('кр.','cr.')+'</span>';
  if(s.diplomacy.talks)button(acts,tr('Прийняти умови Трампа','Accept Trump’s deal')+' · +'+dealAdvance+' / −'+dealTrustCost+'% · '+tr('пропустити хвилю','skip wave'),()=>{
   selected.clear();for(const k of Object.keys(surveys))delete surveys[k];
   finish(true);render();
  },false,undefined,'c-sides deep-ghost');
  acts.append(ghosts);
  const buy=button(ghosts,tr('Купити знімок · 1','Buy imagery · 1'),()=>{s.credits--;intelligence(true);save();render()},s.credits<1,undefined,'c-sides deep-ghost');
  buy.title=tr('Вартість: 1 кредит','Cost: 1 credit');buy.innerHTML='<span>'+tr('Купити знімок','Buy imagery')+'</span><span class="deep-cost" aria-hidden="true">1</span>';
  buy.setAttribute('aria-label',tr('Купити знімок · 1','Buy imagery · 1'));
  button(ghosts,tr('Позначити ймовірну загрозу','Mark suspected threat'),()=>{marking=!marking;render()},false,marking,'c-sides deep-ghost');
  if(marking){const hint=document.createElement('p');hint.className='deep-hint';hint.textContent=tr('Торкніться карти, щоб позначити район.','Tap the map to mark a district.');acts.append(hint)}
  if(autoOn)autoTimer=setTimeout(()=>{
   if(document.hidden||document.querySelector('dialog:modal')){render();return}
   if(launchTotal){
    if(!launch.disabled&&fleet.every((_,id)=>available(id)>=0)){launchWave();return}
    autoOn=false;render();return;
   }
   const targets=points.flatMap((_,id)=>{
    const damage=s.conditions[id]?.damage??0;
    const types=fleet.flatMap((unit,type)=>!unit.surveyOnly&&s.stock[type]>0&&inRange(id,type)?[type]:[])
     .sort((a,b)=>launchPrices[a]-launchPrices[b]);
    if(!playable[id]||damage===100||!types.length)return [];
    const objective=objectives.includes(id);
    return [{id,types,objective,groupSize:objective&&damage<75?3:2}];
   }).sort((a,b)=>Number(b.objective)-Number(a.objective)||a.types.length-b.types.length);
   const firstSector=((s.lastAutoSurvey??-1)+1)%surveySectors.length;
   const plan=planDeepWave({credits:s.credits,stock:s.stock,targets,sectorCount:surveySectors.length,firstSector});
   for(const [id,row] of plan.strikes)selected.set(id,row);
   Object.assign(surveys,plan.surveys);
   if(Object.keys(plan.surveys).length)s.lastAutoSurvey=firstSector;
   if(plan.strikes.size||Object.keys(plan.surveys).length){launchWave();return}
   autoOn=false;render();
  },1800);
  if(s.wave>1)button(panel,tr('Відкрити звіт минулої хвилі','Open previous wave report'),()=>{s.reportPending=true;save();render()});

 }
 document.addEventListener('siege-language',render);
 registerSessionSave(save);
 render();window.dispatchEvent(new Event('game-ready'));
}
