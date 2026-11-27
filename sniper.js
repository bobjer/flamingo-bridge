import {changeSide,languageButton,read,write} from './factions.js';
import {tr} from './language.js';
import {analysisHtml,shotColors} from './sniper-analysis.js';
import {ballisticsFor,WORLDS,WORLD_IDS,validWorld,ouPath,pathFn,GUST_DT,GUST_SCALE,clockDir,validWind,windMs,randomWind} from './sniper-ballistics.js';
import {createShotAudio,soundMuted,setSoundMuted} from './sniper-audio.js';
import './sniper.css';

const saveKey='pop-sniper-v2';
const optics=[['Ялинка','Tree'],['Точка','Dot'],['Сітка','Grid']];
// The selected game world (Moon, 'almost Earth' with g = 10, Mars, Mercury) sets gravity, air density, speed of sound, rotation and wind (WORLDS in sniper-ballistics.js); the G7 solver instance is per world.
let worldId='earth';
const WLD=()=>WORLDS[worldId],Bw=()=>ballisticsFor(worldId),worldName=(id=worldId)=>tr(...WORLDS[id].name),gTxt=id=>WORLDS[id].g+' '+tr('м/с²','m/s²')+(WORLDS[id].gMul?' ('+WORLDS[id].gMul+' g)':''),worldTip=id=>worldName(id)+' · g '+gTxt(id),latOf=()=>WLD().lat??48;
const calibers=ballisticsFor('earth').calibers; // {name,v0,bc7,…}: 300 gr .338 Lapua, 350 gr .375 CheyTac, 395 gr .416 Barrett, 750 gr .50 BMG
const profiles=calibers.map(c=>c.name);
const distances=[300,500,1000,2000,3000];
const modeDistances=[[0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[3,3,3,3,3],[4,4,4,4,4]]; // series mode (300 m, 500 m, 1 km, 2 km, 3 km) → distance index per round: five shots at one distance
const modeLabels=()=>[tr('300 м','300 m'),tr('500 м','500 m'),tr('1 км','1 km'),tr('2 км','2 km'),tr('3 км','3 km')];
const defaultMode=2,caliberShort=['.338 LM','.375 CT','.416 B','.50 BMG'];
const tolerance=[12,8,5,4.7,6.6]; // hit tolerance in tenths of a mil, by distance index (2 km and 3 km: large ELR steel, plate Ø 1.9 m and 4.0 m)
const ring10=[1.3,1.15,.95,.95,.95]; // 10-ring radius in tenths of a mil per distance index (constant ~0.1 mil angular size, a bit larger up close)
const ringFrac=d=>ring10[d]/tolerance[d]; // 10-ring radius as a fraction of the plate (ring 1) radius
const ringOf=(err,d)=>{const t=tolerance[d],r=ring10[d];return err>t?0:err<=r?10:Math.max(1,9-Math.floor(9*(err-r)/(t-r)))};
// Random dispersion (sampled once per shot): gust g(t) Ornstein–Uhlenbeck, stationary σ 0.5 m/s, τ 4 s (read at the trigger pull, then it keeps evolving during the flight), plus a fixed spatial residual σ 0.1 m/s;
// muzzle velocity SD 2.1 m/s, rifle 0.05 mil/axis (~0.5 MOA group), hold 0.03 mil/axis plus the visible sway.
const sigma={gust:.5,res:.1,tau:4,dv0:2.1,rand:.05,hold:.03,holdReduced:.05},gustDt=GUST_DT; // gustDt: spacing of the stored gust path, s
const gauss=()=>Math.sqrt(-2*Math.log(1-Math.random()))*Math.cos(2*Math.PI*Math.random());
const swayAt=t=>({x:.05*Math.sin(2*Math.PI*.23*t)+.02*Math.sin(2*Math.PI*.9*t+1),y:.07*Math.sin(2*Math.PI*.17*t+.5)+.02*Math.sin(2*Math.PI*1.1*t)}); // mil
// Breath hold (seconds held h → multiplier of the sway amplitude and of the hold noise): 1 free breathing; eases to 0.25 over 0.8 s (respiratory pause), steady to 4 s, then oxygen debt: 1.0 at 7 s, 2.5 at 10 s (+0.5/s after); a tremor of 6–9 Hz grows after 4 s. Past 12 s the shooter must breathe.
const breathMax=12,breathRecover=1500,microScale=1/25,microLimit=3,microKey=.1; // micro-adjust: 1/25 of the drag scale, ±0.3 mil (3 tenths) per hold, arrow keys 0.01 mil = 0.1 tenth
const breathK=h=>h<=0?1:h<.8?1-.75*(h/.8)**2*(3-2*h/.8):h<=4?.25:h<=7?.25+.75*(h-4)/3:1+.5*(Math.min(h,breathMax)-7);
const tremorAt=(h,t)=>{if(h<=4)return{x:0,y:0};const a=.025*(Math.min(h,breathMax)-4)**2/36;return{x:a*Math.sin(2*Math.PI*6.3*t)+.5*a*Math.sin(2*Math.PI*8.7*t+1),y:a*Math.sin(2*Math.PI*7.4*t+2)+.5*a*Math.sin(2*Math.PI*6.1*t+.5)}}; // mil
const breathPhase=h=>h<.8?'settle':h<=4?'steady':h<=7?'strain':'hard';
const sgn=(v,d)=>(v<0?'−':v>0?'+':'')+Math.abs(v).toFixed(d);
const distLabel=d=>d<1000?d+' '+tr('м','m'):d/1000+' '+tr('км','km');
// TODO(hard mode): humidity → air density → velocity decay and drift.
const weather=[ // humidity per series (the wind itself is state.wind: regime, clock direction and flag strengths)
 {humidity:36},
 {humidity:72},
 {humidity:48},
 {humidity:64},
 {humidity:82},
 {humidity:27},
];
let windNow=null; // the series' wind {regime, clock, flags}; sets how strong the gust is (calm none, steady ×0.15, gusty full)
const applySigma=()=>{sigma.gust=WLD().gust*(GUST_SCALE[windNow?.regime]??1);sigma.res=sigma.gust/5};
const setWorld=id=>{worldId=validWorld(id)?id:'earth';applySigma()}; // gust / residual wind follow the world (Moon and Mercury: none) and the regime
const tabOf=(ci,di)=>Bw().table(ci,distances[di]); // {elev,drift1,sens,weights,spin,coriolis,sc,tof,vImpact,mach} from the G7 solver
const kzOf=w=>clockDir(w.clock).kz; // +1 = wind pushes the bullet right (from 9 o'clock), -1 = pushes it left (from 3 o'clock)
const flagMs=(w,id=worldId)=>windMs(w,WORLDS[id]); // m/s; Earth: flag strength 1/2/3 = 2/4/6 m/s, Mars 8/16/25, no wind on the Moon and Mercury; calm: 0
const noWind=()=>!WLD().flagMs[0]; // a world without air: no wind at all
const isCalm=w=>w.regime==='calm'; // a still day in a world that has wind
const regimeName=w=>w.regime==='calm'?tr('штиль','calm'):w.regime==='steady'?tr('рівний','steady'):tr('поривчастий','gusty');
const clockText=w=>tr('з ','from ')+w.clock+tr(' год',' o\'clock');
const weightsShown=T=>{const r=T.weights.map(v=>Math.round(v*100)/100),k=r.indexOf(Math.max(...r));r[k]=Math.round((r[k]+1-r.reduce((a,b)=>a+b,0))*100)/100;return r}; // 2 decimals, summing to exactly 1.00
const windEff=(w,wt)=>flagMs(w).reduce((a,v,i)=>a+v*wt[i],0); // weighted wind speed, m/s
const HI=3; // strongest flag mark
const rangeCache={};
const ranges=(id=worldId)=>rangeCache[id]||(rangeCache[id]=(B=>({ // dial ranges per world, tenths of a mil
 xMax:Math.ceil(Math.max(...calibers.flatMap(c=>distances.map(d=>{const T=B.table(calibers.indexOf(c),d);return Math.abs(T.drift1*WORLDS[id].flagMs[HI-1])+T.sc})))/5)*50, // worst case: all three flags at the top mark, wind straight across
 yMax:Math.ceil(Math.max(...calibers.flatMap((c,ci)=>distances.map(d=>{const T=B.table(ci,d);return T.elev+Math.max(0,T.ht)*WORLDS[id].flagMs[HI-1]})))/5)*50}))(ballisticsFor(id)));
const xMaxOf=()=>ranges().xMax,yMaxOf=()=>ranges().yMax;
const model={get B(){return Bw()},get world(){return WLD()},calibers,distances,tolerance,weather,tabOf,clockDir,flagMs};
const marksPlain=()=>WLD().flagMs.map((v,i)=>'▮'.repeat(i+1)+' = '+v).join(', ');
const worldCap=()=>adaptLine()+(WLD().sound?', '+tr('швидкість звуку ','speed of sound ')+WLD().sound+' '+tr('м/с',' m/s').trim():'')+'. ';
const worldHint=()=>worldId==='pyrrus'?tr('Піррус: густе повітря (≈1,3 атм), подвійне тяжіння (2 g) і штормові пориви — куля падає сильно, швидко гальмується, а вітер її зносить дужче. ','Pyrrus: dense air (about 1.3 atm), double gravity (2 g) and stormy gusts — the bullet drops hard, sheds speed quickly and the wind pushes it further. '):worldId==='mesklin'?tr('Месклін: тяжіння залежить від широти — близько 3 g на екваторі й сотні g на полюсах, бо планета обертається за ≈18 хвилин. Наш полігон на широті 40°, де воно ≈ 5,5 g. Така швидка доба дає величезний Коріоліс: куля помітно йде вбік, і це видно в колонці «Деривація + Коріоліс». ','Mesklin: gravity depends on latitude — about 3 g at the equator and hundreds of g at the poles, because the planet turns in ≈18 minutes. Our range is at latitude 40°, where it is ≈ 5.5 g. A day that short gives a huge Coriolis: the bullet visibly veers sideways, shown in the “Spin + Coriolis” column. '):'';
const adaptLine=()=>tr('Балістику адаптовано під світ гри: ','Ballistics adapted to the game world: ')+worldName()+' (g '+gTxt(worldId)+', '+(WLD().rho?'ρ '+WLD().rho+' '+tr('кг/м³','kg/m³'):tr('вакуум','vacuum'))+')';
const saved=read(saveKey),prefsKey='pop-sniper-prefs',prefs=read(prefsKey); // player preferences live apart from the series save: they survive a new game
const validIndex=(value,length)=>Number.isInteger(value)&&value>=0&&value<length;
const validDisp=d=>d===undefined||!!d&&(d.gy===undefined||Number.isFinite(d.gy))&&[d.gust,d.gustRead,d.res,d.gx,d.gxR,d.vy,d.dv0,d.rand?.x,d.rand?.y,d.hold?.x,d.hold?.y].every(Number.isFinite)&&Array.isArray(d.gp)&&d.gp.length>=2&&d.gp.length<=200&&d.gp.every(Number.isFinite); // saves from before the G7 solver lack gp/gx/vy and restart the series
const validP=p=>p===undefined||!!p&&validIndex(p.di,distances.length)&&validIndex(p.ci,calibers.length)&&validIndex(p.wi,weather.length)&&validWind(p.wind)&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const validShot=s=>!!s&&typeof s==='object'&&validDisp(s.disp)&&validP(s.p)&&Number.isInteger(s.ring)&&s.ring>=0&&s.ring<=10&&typeof s.hit==='boolean'&&Number.isFinite(s.dx)&&Number.isFinite(s.dy)&&Number.isFinite(s.ms)&&s.ms>=0;
const validSeries=s=>!!s&&typeof s==='object'&&s.v===2&&validWind(s.wind)&&Array.isArray(s.rounds)&&s.rounds.length===seriesSize&&s.rounds.every(i=>validIndex(i,weather.length)&&i===s.rounds[0])&&
 Array.isArray(s.unassisted)&&s.unassisted.length<=seriesSize&&s.unassisted.every(v=>typeof v==='boolean')&&typeof s.usedCode==='boolean'&&
 Array.isArray(s.scores)&&s.scores.length<=seriesSize&&s.scores.every(v=>Number.isInteger(v)&&v>=0&&v<=10)&&
 s.unassisted.length===s.scores.length&&Array.isArray(s.shots)&&s.shots.length===s.scores.length&&s.shots.every(validShot)&&
 Number.isFinite(s.time)&&s.time>=0&&(s.started===undefined||typeof s.started==='boolean');
const viewSize=700;
const canvasScale=()=>Math.min(2,window.devicePixelRatio||1);
const panStep=22;
const seriesSize=5;
const zoomMin=4,zoomMax=25,aimLimit=600; // magnification (×); aim clamp in tenths of a mil
const uOf=zoom=>panStep/2*zoom/10; // px per mil at a magnification
const clampAim=v=>Math.max(-aimLimit,Math.min(aimLimit,v));
const recoilOf=aim=>{const r=5+Math.random()*10,a=Math.random()*Math.PI*2;return{x:clampAim(Math.round(aim.x+r*Math.cos(a))),y:clampAim(Math.round(aim.y+r*Math.sin(a)))}}; // recoil: uniform radius 0.5–1.5 mil, random direction
const randomAim=()=>{const r=3+Math.random()*5,a=Math.random()*Math.PI*2;return{x:Math.round(r*Math.cos(a)*10),y:Math.round(r*Math.sin(a)*10)}};
const clock2=ms=>{const t=Math.round(ms/100),m=Math.floor(t/600),sec=(t%600)/10;return String(m).padStart(2,'0')+':'+(sec<10?'0':'')+sec.toFixed(1)};
const clock1=ms=>{const t=Math.floor(ms/1000);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')};
const maxScore=seriesSize*10;
const clampAxis=(axis,value)=>axis==='x'?Math.max(-xMaxOf(),Math.min(xMaxOf(),value)):Math.max(0,Math.min(yMaxOf(),value));
const apSpeeds=[0.5,1,1.5,2],speedLabel=v=>v+'×';
const initial=()=>({apSpeed:1,world:'earth',mode:defaultMode,modeV:3,plane:'ffp',distance:2,optic:0,profile:0,weather:0,wind:randomWind(),x:0,y:0,aim:randomAim(),zoom:zoomMin});
const mil=value=>(Math.abs(value)/10).toFixed(1);
const signedMil=value=>value<0?'−'+mil(value):value>0?'+'+mil(value):mil(0);

const compass=w=>noWind()?'—':isCalm(w)?tr('штиль','calm'):clockText(w)+' · '+regimeName(w);
const flagPattern=w=>noWind()?tr('вітру немає','no wind'):isCalm(w)?'—':w.flags.map(flag=>'▮'.repeat(flag)).join(' / ');
const hudWind=w=>noWind()?'—':isCalm(w)?tr('штиль','calm'):w.clock+tr(' год',' h')+' · '+w.flags.map(flag=>'▮'.repeat(flag)).join('/');

// Exact (unrounded) solution in tenths of a mil with the full wind vector: X = −(crosswind drift + spin drift + Coriolis), all rightward; Y = elevation from the 100 m zero + the head/tail wind tweak (a headwind adds drop).
function solutionExact(state){
 const w=state.wind,T=tabOf(state.profile,state.distance),ms=flagMs(w),{kx,kz}=clockDir(w.clock),wd=kz*T.sens.reduce((a,v,i)=>a+v*ms[i],0),ht=-kx*T.sensX.reduce((a,v,i)=>a+v*ms[i],0);
 return [-(wd+T.sc)*10,(T.elev+ht)*10];
}
const solution=state=>solutionExact(state).map(v=>Math.round(v)+0); // what the dials show (0.1 mil resolution)

export function startSniper(){
  setWorld(saved&&validWorld(saved.world)?saved.world:'earth'); // an unknown saved world falls back to Earth
 const validSave=!!(saved&&validIndex(saved.distance,distances.length)&&validIndex(saved.optic,optics.length)&&validIndex(saved.profile,profiles.length)&&
  validIndex(saved.weather,weather.length)&&Number.isInteger(saved.x)&&Math.abs(saved.x)<=xMaxOf()&&Number.isInteger(saved.y)&&saved.y>=0&&saved.y<=yMaxOf()),state=validSave?{...saved}:initial();
 if(!validSave&&prefs&&typeof prefs==='object'){ // fresh state (first run, new game): the player's preferences are the defaults
  if(validWorld(prefs.world)){setWorld(prefs.world);state.world=prefs.world}
  if(apSpeeds.includes(prefs.apSpeed))state.apSpeed=prefs.apSpeed;
  if(['auto','always','never'].includes(prefs.fpv))state.fpv=prefs.fpv;
  if(prefs.plane==='sfp'||prefs.plane==='ffp')state.plane=prefs.plane;
  if(validIndex(prefs.optic,optics.length))state.optic=prefs.optic;
  if(validIndex(prefs.profile,profiles.length))state.profile=prefs.profile;
  if(validIndex(prefs.mode,modeDistances.length))state.mode=prefs.mode;
  if(Number.isInteger(prefs.zoom)&&prefs.zoom>=zoomMin&&prefs.zoom<=zoomMax)state.zoom=prefs.zoom;
 }
 // Saves from before the round index existed used distance as the round.
 if(state.round===undefined&&validSeries(state.series)&&validIndex(state.distance,seriesSize))state.round=state.distance;
 delete state.best;
 if(!['auto','always','never'].includes(state.fpv))state.fpv=state.realtime===true?'never':'auto'; // FPV mode; the old real-time switch migrates (real time on = Never)
 delete state.realtime;
 if(state.modeV!==3){if(state.mode===5)state.mode=defaultMode;state.modeV=3} // the mix mode (index 5) is gone: it becomes 1 km; older saves had 0 = 300 m, 1 = 500 m, 2 = mix, which map to the same index here
 if(!validIndex(state.mode,modeDistances.length))state.mode=defaultMode;
 if(state.pendingMode!==undefined&&!validIndex(state.pendingMode,modeDistances.length))delete state.pendingMode;
 if(state.pendingProfile!==undefined&&!validIndex(state.pendingProfile,calibers.length))delete state.pendingProfile;
 state.world=worldId;if(state.pendingWorld!==undefined&&!validWorld(state.pendingWorld))delete state.pendingWorld;
 state.plane=state.plane==='sfp'?'sfp':'ffp';
 if(!apSpeeds.includes(state.apSpeed))state.apSpeed=1;
 if(state.tutorialDone!==true)state.distance=modeDistances[state.mode][0];
 if(state.series&&Array.isArray(state.series.rounds)&&state.series.rounds.length!==seriesSize)delete state.bestScore; // record from an older series length
 if(state.bestScore!==undefined&&!(Number.isInteger(state.bestScore)&&state.bestScore>=0&&state.bestScore<=maxScore))delete state.bestScore;
 if(state.bestHpm!==undefined&&!(Number.isFinite(state.bestHpm)&&state.bestHpm>0))delete state.bestHpm;
 state.zoom=Number.isInteger(state.zoom)&&state.zoom>=zoomMin&&state.zoom<=zoomMax?state.zoom:zoomMin;
 state.aim=state.aim&&Number.isFinite(state.aim.x)&&Number.isFinite(state.aim.y)?{x:clampAim(+state.aim.x.toFixed(2)),y:clampAim(+state.aim.y.toFixed(2))}:randomAim(); // fractional after a breath-hold micro-adjust
 if(!(Number.isInteger(state.misses)&&state.misses>=0))state.misses=0;
 const shot=state.lastShot;
 if(!(shot&&typeof shot==='object'&&Number.isInteger(shot.ring)&&shot.ring>=0&&shot.ring<=10&&Number.isInteger(shot.score)&&shot.score>=0&&shot.score<=10))delete state.lastShot;
 state.roundDone=state.roundDone===true&&!!state.lastShot;
 const root=document.createElement('main');
 root.className='sniper-board';document.body.append(root);
 const savePrefs=()=>write(prefsKey,{apSpeed:state.apSpeed,fpv:state.fpv,plane:state.plane,optic:state.optic,profile:state.profile,world:worldId,mode:state.mode,zoom:state.zoom});
 const save=()=>{write(saveKey,state);savePrefs()};
 if(!prefs)savePrefs(); // migration: seed the preferences from the current save (or defaults)
 // Continuous gust while aiming: Ornstein–Uhlenbeck g(t), m/s, mean 0, stationary σ sigma.gust, time constant tau. Exact update, so any elapsed time catches up. Never shown as a number: only the flags move.
 const holes=[]; // bullet holes {D,lat,dy} of this series, redrawn on the plate whenever its world is rebuilt
 const gp={g:0,t:0,h:[]};
 const gustSeed=()=>{const now=performance.now();gp.g=gauss()*sigma.gust;gp.t=now;gp.h=[[now,gp.g]]};
 const gustStep=now=>{
  const dt=(now-gp.t)/1000;
  if(!(dt>0))return;
  const a=Math.exp(-dt/sigma.tau);
  gp.g=gp.g*a+sigma.gust*Math.sqrt(1-a*a)*gauss();gp.t=now;gp.h.push([now,gp.g]);
  while(gp.h.length>1&&gp.h[1][0]<now-2000)gp.h.shift();
 };
 const gustAt=ms=>{let v=gp.h[0][1];for(const [t,g] of gp.h){if(t<=ms)v=g;else break}return v};
 const flagGusts=()=>[0,1,2].map(i=>gustAt(gp.t-500*i)); // each flag further down the range shows the gust ~0.5 s later
 if(state.tutorialDone===true&&validSeries(state.series))state.wind=state.series.wind; // the series owns its wind; an old save without one restarts the series below
 if(!validWind(state.wind))state.wind=randomWind();
 windNow=state.wind;applySigma();
 const putWind=w=>{state.wind=w;windNow=w;applySigma()}; // a new series: new wind and gust strength
 gustSeed();
 let rt=null,analysisModal=null,gl=null,glLoop=0,scopeRO=null,dragging=false,pendingRender=false,flying=false,notice='',miss=null,mark=0,tabPick=null; // tabPick: reference tab chosen by the player or autoplay (not persisted)
 const hasResults=()=>state.tutorialDone===true&&!!state.series&&state.series.scores.length===seriesSize;
 const curTab=()=>tabPick&&(tabPick!=='results'||hasResults())?tabPick:state.tutorialDone!==true?'method':'table';
 // Aiming clock: runs only while a series shot is open, the page is visible and no flight overlay is up. Call after every state flip.
 const clockOn=()=>state.tutorialDone===true&&!!state.series&&state.series.started===true&&!state.roundDone&&!flying&&!(rt&&rt.phase==='card')&&!document.hidden&&root.isConnected;
 function clock(){
  const now=performance.now();
  if(mark&&state.series)state.series.time+=now-mark;
  mark=clockOn()?now:0;
 }
 function begin(){
  const s=state.series;
  if(state.tutorialDone!==true||!s||s.started===true||state.roundDone)return;
  s.started=true;save();clock();
 }
 // ---- WebGL scope view lifecycle ----
 const swayNow=(h=holdSec())=>{if(!gl||reduced())return{x:0,y:0};const t=performance.now()/1000,s=swayAt(t),k=breathK(h),r=tremorAt(h,t);return{x:s.x*k+r.x,y:s.y*k+r.y}}; // hold sway in mil (breath hold shrinks it, oxygen debt adds tremor); only while the animated scope view runs
 const view=()=>{const w=swayNow(),m=microNow();return w.x||w.y||m.x||m.y?{...state,aim:{x:state.aim.x+w.x*10+m.x,y:state.aim.y+w.y*10+m.y}}:state}; // the target drifts by the sway and the micro-adjust of a breath hold
 const glOn=()=>!!gl&&root.isConnected&&!flying&&!document.hidden;
 function glStop(){cancelAnimationFrame(glLoop);glLoop=0}
 function glStart(){ // light ~20 fps loop for the flags; runs only while the scope is visible
  if(glLoop||!glOn()||reduced())return;
  let last=0;
  const f=t=>{
   glLoop=0;if(!glOn())return;
   glLoop=requestAnimationFrame(f);
   if(t-last<48)return;
   try{gustStep(performance.now());gl.setWind(flagGusts());gl.update(Math.min(.1,last?(t-last)/1000:.05));last=t;gl.draw(view())}catch(error){glFail(error)}
  };
  glLoop=requestAnimationFrame(f);
 }
 function glDrop(){glStop();scopeRO?.disconnect();scopeRO=null;gl?.canvas.remove();try{gl?.dispose()}catch{}gl=null}
 function glFail(error){console.warn('sniper: WebGL view failed, using 2D view',error);glDrop();render()}
 async function glLoad(){
  try{
   const [T,{buildWorld}]=await Promise.all([import('three'),import('./sniper-world.js')]);
   if(!root.isConnected)return;
   gl=createGL(T,buildWorld,holes);
   gl.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();glDrop();render()});
  }catch(error){console.warn('sniper: WebGL unavailable, using 2D view',error);gl=null;return}
  if(dragging||flying)pendingRender=true;else render();
 }
 const scopeTop=()=>{if(window.matchMedia?.('(max-width: 750px)').matches)root.querySelector('.sniper-scope')?.scrollIntoView({block:'start',behavior:reduced()?'auto':'smooth'})};
 document.addEventListener('visibilitychange',glStart);
 const paintTimer=()=>{const el=root.querySelector('[data-timer]');if(el&&state.series)el.textContent=clock1(state.series.time)};
 let moreUpdate=()=>{};
 function selectTab(id){
  tabPick=id;
  for(const t of root.querySelectorAll('[role="tab"]')){const on=t.dataset.tab===id;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1}
  for(const p of root.querySelectorAll('[role="tabpanel"]'))p.hidden=p.id!=='sniper-panel-'+id;
  moreUpdate();
 }

 // Autoplay: a single controller; every timed action goes through schedule() so pause/resume can freeze it.
 let align=()=>{},aimer=()=>{},zoomer=()=>{};
 const ap={shown:-1,on:false,paused:false,step:0,timer:0,remaining:0,startedAt:0,fn:null};
 const finalNow=()=>state.tutorialDone===true&&state.round===seriesSize-1;
 const solved=()=>{const [a,b]=solution(state),t=tolerance[state.distance];return Math.abs(a-state.x)<=t&&Math.abs(b-state.y)<=t};
 const aimed=()=>!state.aim.x&&!state.aim.y;
 const shotAudio=createShotAudio();
 const airOf=()=>WLD().rho>0?(WLD().rho<.1?'thin':worldId==='mesklin'?'hydrogen':'air'):'vacuum';
 const hold=text=>Math.max(1200,Math.min(9000,Math.max(3500,1800+45*text.length))/state.apSpeed); // reading time ÷ commentary speed
 const spd=ms=>Math.max(8,Math.round(ms/state.apSpeed)); // animation tick intervals ÷ speed
 const marksText=()=>WLD().flagMs.map((v,i)=>'▮'.repeat(i+1)+' = '+v).join(', ')+tr(' м/с',' m/s');
 const apSteps=()=>{
  const w=state.wind,c=calibers[state.profile],dk=distances[state.distance],T=tabOf(state.profile,state.distance),sp=flagMs(w),wt=weightsShown(T),wind=windEff(w,wt),
   e=T.elev,k=T.drift1,[sx,sy]=solution(state),last=finalNow(),{kx,kz}=clockDir(w.clock),cw=kz*wind,hw=-kx*wind,cross=Math.abs(cw),still=isCalm(w),again=state.tutorialDone===true?state.round>0:state.misses>0;
  return [
   {mark:'zoom',zoom:true,text:(windNote?windNote+tr('. Перевіряю розрахунок: поправку змінюю лише якщо треба. ','. I recheck the solution and re-dial only if needed. '):'')+tr('Ставлю кратність 4×, щоб знайти мішень. Для пострілу ставлю ','Setting 4× to find the target. For the shot I set ')+workZoom()+tr('× — так мішень добре видно.','× — the target is clearly visible.')+(state.plane==='sfp'?tr(' У SFP-прицілі поділки сітки точні лише на 10×, але я цілюсь у центр сітки з повною поправкою на маховиках, тож це не заважає.',' In an SFP scope the marks are true only at 10×, but I aim at the reticle center with the full dial, so it does not matter.'):'')},
   {mark:'weather',text:noWind()?tr('У світі «'+worldName()+'» немає повітря: прапорці висять на жорстких штангах, вітру немає — поправка на вітер нульова.','In the world “'+worldName()+'” there is no air: the flags hang on rigid rods and there is no wind — the windage correction is zero.'):still?tr('Читаю прапорці: усі три обвисли — штиль, вітру немає (0 м/с). Поправка на вітер нульова.','Reading the flags: all three hang limp — a calm day, no wind (0 m/s). The wind correction is zero.'):tr('Читаю прапорці: ','Reading the flags: ')+flagPattern(w)+'. '+tr('Риски: ','Marks: ')+marksText()+tr('. Тут це ','. Here that is ')+sp.join(', ')+tr(' м/с.',' m/s.')+(w.regime==='steady'?tr(' Усі прапорці однакові — рівний вітер, поривів майже немає.',' All flags are the same — a steady wind, hardly any gusts.'):tr(' Прапорці різні — вітер поривчастий.',' The flags differ — a gusty wind.'))},
   {mark:'weather',text:noWind()||still?tr('Без вітру вагові коефіцієнти прапорців не потрібні.','With no wind the flag weights are not needed.'):tr('Вітер уздовж траси різний, і ближній вітер діє на кулю довше й сильніше, тож беру зважене середнє з вагами з таблиці ','Wind varies along the range, and the near wind acts on the bullet longer and harder, so I take the weighted average with the table weights ')+wt.map(v=>v.toFixed(2)).join(' / ')+': '+wt.map((v,i)=>v.toFixed(2)+'·'+sp[i]).join(' + ')+' = '+wind.toFixed(1)+tr(' м/с.',' m/s.')},
   {mark:'weather',text:noWind()?tr('Напрямок вітру не має значення: його немає.','The wind direction does not matter: there is none.'):still?tr('Напрямок вітру не має значення: штиль.','The wind direction does not matter: it is calm.'):
    tr('Вітер дме з '+w.clock+' год (я дивлюсь на 12), тобто під кутом '+w.clock*30+'° до лінії пострілу. Бічна складова = вітер × sin = '+wind.toFixed(1)+' × '+Math.abs(kz).toFixed(2)+' = '+cross.toFixed(1)+' м/с, поздовжня = вітер × cos = '+wind.toFixed(1)+' × '+Math.abs(kx).toFixed(2)+' = '+Math.abs(hw).toFixed(1)+' м/с'+(Math.abs(kx)<.01?'. ':kx<0?' (зустрічна). ':' (попутна). ')+(Math.abs(kz)<.01?'Бокової складової немає — X лише від деривації та Коріоліса.':kz<0?'Бічний вітер справа зносить кулю ліворуч: X має бути додатним — ціль правіше.':'Бічний вітер зліва зносить кулю праворуч: X має бути від’ємним — ціль лівіше.'),
     'The wind blows from '+w.clock+' o\'clock (I face 12), an angle of '+w.clock*30+'° to the line of fire. Crosswind = wind × sin = '+wind.toFixed(1)+' × '+Math.abs(kz).toFixed(2)+' = '+cross.toFixed(1)+' m/s, head/tail = wind × cos = '+wind.toFixed(1)+' × '+Math.abs(kx).toFixed(2)+' = '+Math.abs(hw).toFixed(1)+' m/s'+(Math.abs(kx)<.01?'. ':kx<0?' (headwind). ':' (tailwind). ')+(Math.abs(kz)<.01?'No crosswind — X is only spin drift and Coriolis.':kz<0?'A crosswind from the right pushes the bullet left: X must be positive — aim right.':'A crosswind from the left pushes the bullet right: X must be negative — aim left.'))},
   {mark:'table',text:tr('Таблиця для ','Table for ')+c.name+', '+distLabel(dk)+tr(': підйом ',': elevation ')+e.toFixed(1)+(noWind()?tr(' міл, деривація + Коріоліс ',' mil, spin + Coriolis ')+T.sc.toFixed(3)+tr(' міл.',' mil.'):tr(' міл, знос ',' mil, drift ')+k.toFixed(2)+tr(' міл на кожен 1 м/с бокового вітру, зустрічний/попутний ',' mil per 1 m/s of crosswind, head/tail ')+T.ht.toFixed(3)+tr(' міл на 1 м/с, деривація + Коріоліс ',' mil per 1 m/s, spin + Coriolis ')+T.sc.toFixed(2)+tr(' міл.',' mil.'))},
   {mark:'y',text:adaptLine()+'. '+worldHint()+(noWind()?(worldId==='moon'?tr('На Місяці немає повітря — куля не гальмує й вітру немає, тож лише гравітація. ','No air on the Moon — the bullet doesn\'t slow down and there\'s no wind, only gravity. '):tr('На Меркурії немає повітря — куля не гальмує й вітру немає, тож лише гравітація (g '+WLD().g+' м/с²). ','No air on Mercury — the bullet doesn\'t slow down and there\'s no wind, only gravity (g '+WLD().g+' m/s²). ')):tr('Куля падає під дією тяжіння цього світу (g '+WLD().g+' м/с²)'+(worldId==='mars'?', а повітря дуже розріджене: куля майже не гальмує, і вітер її ледь зносить. ':', тому ствол піднімаємо. '),'The bullet drops under the gravity of this world (g '+WLD().g+' m/s²)'+(worldId==='mars'?', and the air is very thin: the bullet barely slows and the wind hardly moves it. ':', so we raise the barrel. ')))+(noWind()||still||Math.abs(kx)<.01?'':tr('Вітер уздовж траси: ','Wind along the range: ')+sgn(hw,1)+' × '+T.ht.toFixed(3)+' = '+sgn(hw*T.ht,2)+tr(' міл (зустрічний +, попутний −). ',' mil (head +, tail −). '))+tr('Y = ','Y = ')+mil(sy)+tr(' міл.',' mil.')},
   {mark:'table',text:noWind()?tr('Повітря немає, тож деривації кулі нема. Лишається лише Коріоліс від повільного обертання світу (широта '+latOf()+'° N, стрільба на північ): ','There is no air, so no spin drift. Only Coriolis remains, from the slow rotation of the world (latitude '+latOf()+'° N, shooting north): ')+T.coriolis.toFixed(3)+tr(' міл праворуч, тому в X додаємо мінус ці ',' mil to the right, so X gets minus these ')+T.sc.toFixed(3)+tr(' міл.',' mil.'):tr('Є ще дві поправки, які завжди зносять кулю праворуч, хоч би який вітер. Деривація: обертання кулі за правою нарізкою зміщує її вправо, ≈ ','Two more corrections always push the bullet right, whatever the wind. Spin drift: a right-hand twist moves the bullet right, ≈ ')+T.spin.toFixed(2)+(worldId==='earth'?tr(' міл. Коріоліс: обертання Землі на широті 48° N (стрільба на північ) — ще ',' mil. Coriolis: the Earth\'s rotation at 48° N (shooting north) adds '):tr(' міл. Коріоліс: обертання світу «'+worldName()+'» (широта '+latOf()+'° N, стрільба на північ) — ще ',' mil. Coriolis: the rotation of the world “'+worldName()+'” ('+latOf()+'° N, shooting north) adds '))+T.coriolis.toFixed(2)+tr(' міл. Разом ',' mil. Together ')+T.sc.toFixed(2)+tr(' міл праворуч, тому в X додаємо мінус ці ',' mil to the right, so X gets minus these ')+T.sc.toFixed(2)+tr(' міл.',' mil.')},
   {mark:'x',text:(noWind()||still?'X = −('+T.sc.toFixed(3)+') ≈ ':'X = −('+k.toFixed(2)+' × '+(cw<0?'(−'+cross.toFixed(1)+')':cw.toFixed(1))+' + '+T.sc.toFixed(2)+') ≈ ')+signedMil(sx)+tr(' міл. Чим довше куля летить, тим більше її зносить.',' mil. The longer the flight, the more the wind carries it.')+(noWind()||still?'':tr(' Порив не враховую — він видно лише по тому, як зараз тріпочуть прапорці.',' I ignore the current gust — it shows only in how the flags are flapping right now.'))},
   {mark:'y',dial:'y',text:tr('Кручу маховик вертикальних поправок до ','Dialing elevation to ')+mil(sy)+tr(' міл.',' mil.')},
   {mark:'x',dial:'x',text:tr('Кручу маховик бокових поправок до ','Dialing windage to ')+signedMil(sx)+tr(' міл.',' mil.')},
   {mark:'aim',aim:true,text:(again?tr('Маховики залишаю як є — поправка та сама, умови ті самі. Після віддачі лише заново наводжу мішень у центр сітки. Порив змінився — слідкую за прапорцями.','I keep the dial as it is — same correction, same conditions. After the recoil I only re-aim, target to the reticle center. The gust has moved on — I watch the flags.'):tr('Наводжу гвинтівку: ставлю мішень у центр сітки, бо поправки виставлені маховиками повністю.','Aiming the rifle: target to the reticle center, since the turrets carry the full correction.'))+tr(' Кратність ставлю ',' Magnification — ')+workZoom()+'×.'},
   {mark:'fire',text:tr('Натисніть і тримайте «Постріл» — затримка дихання; відпустіть у спокійне вікно (зелена смуга).','Press and hold Fire to hold your breath; release in the steady window (green bar).')},
   {mark:null,text:state.roundDone?(state.lastShot?.ring?tr('Влучання: ','Hit: ')+state.lastShot.ring+tr(' очок. ',' pts. ')+(state.lastShot.ring<10?tr(' Відхилення через порив і розкид — це нормально.',' The deviation comes from gusts and spread — that\'s normal.')+' ':''):tr('Промах: 0 очок. ','Miss: 0 pts. '))+(last?tr('Серію з '+seriesSize+' пострілів завершено.',seriesSize+'-shot series complete.'):tr('Переходжу до наступного раунду.','Moving to the next round.')):
    tr('Промах: ','Miss: ')+'X '+signedMil(miss?.dx??0)+' / Y '+signedMil(miss?.dy??0)+tr(' міл. Перевіряю розрахунок і виправляю.',' mil. Rechecking and correcting.')},
  ];
 };
 const apLabel=()=>ap.on?tr('✋ Грати самому','✋ Take over'):tr('Автогра','Autoplay');
 const apPanel=()=>`<section class="sniper-autoplay" aria-live="polite"><div class="ap-head"><span class="ap-pill"></span><span class="ap-bar" aria-hidden="true"></span><button type="button" class="ap-speed" data-ap-speed></button><button type="button" class="ap-pause" data-autoplay-pause></button></div><p data-narration></p></section>`;
 const escHtml=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 const narrationHtml=t=>escHtml(t).replace(/[−+-]?\d+(?:[.,]\d+)?\s?(?:міл|mil|м\/с|m\/s|км|km|м|m|×|°|%)(?!\p{L})/gu,'<b class="ap-num">$&</b>');
 function paintAutoplay(){
  const button=root.querySelector('[data-autoplay]'),panel=root.querySelector('.sniper-autoplay');
  button.textContent=apLabel();button.setAttribute('aria-pressed',String(ap.on));
  for(const old of root.querySelectorAll('.is-explained'))old.classList.remove('is-explained');
  if(!ap.on){panel?.remove();ap.shown=-1;updateFire();return}
  const steps=apSteps(),s=steps[ap.step];
  if(panel){
   panel.querySelector('.ap-pill').textContent=tr('Крок ','Step ')+(ap.step+1)+'/'+steps.length;
   panel.querySelector('.ap-bar').innerHTML=steps.map((_,i)=>`<i class="${i<ap.step?'is-done':i===ap.step?'is-cur':''}"></i>`).join('');
   panel.querySelector('[data-narration]').innerHTML=narrationHtml(s.text);
   const sb=panel.querySelector('[data-ap-speed]'),sl=tr('Швидкість коментарів','Commentary speed');sb.textContent=speedLabel(state.apSpeed);sb.setAttribute('aria-label',sl);sb.title=sl+': '+speedLabel(state.apSpeed);
   const pb=panel.querySelector('[data-autoplay-pause]'),pl=ap.paused?tr('Далі','Resume'):tr('Пауза','Pause');
   pb.textContent=ap.paused?'▶':'⏸';pb.setAttribute('aria-label',pl);pb.title=pl;
   panel.classList.toggle('is-fire',s.mark==='fire');
   if(ap.shown!==ap.step){ap.shown=ap.step;panel.classList.remove('is-new');void panel.offsetWidth;panel.classList.add('is-new')}
  }
  if(s.mark==='table')selectTab('table');
  const el=s.mark==='x'||s.mark==='y'?root.querySelector('[data-axis="'+s.mark+'"]')?.closest('.sniper-axis'):
   s.mark==='zoom'?root.querySelector('.sniper-zoom'):s.mark==='aim'?root.querySelector('.sniper-scope'):s.mark==='weather'?root.querySelector('.sniper-weather'):s.mark==='fire'?root.querySelector('[data-fire]'):s.mark==='table'?root.querySelector('tr.is-current'):null;
  el?.classList.add('is-explained');
  updateFire();
 }
 function schedule(fn,ms){
  clearTimeout(ap.timer);ap.fn=fn;ap.remaining=ms;ap.startedAt=Date.now();
  if(!ap.paused)ap.timer=setTimeout(()=>{ap.fn=null;fn()},ms);
 }
 function setApSpeed(v){
  if(!apSpeeds.includes(v)||v===state.apSpeed)return;
  const old=state.apSpeed;state.apSpeed=v;save();
  if(ap.fn){ // pending step: keep the same fraction of it left
   const left=ap.paused?ap.remaining:Math.max(0,ap.remaining-(Date.now()-ap.startedAt));
   const fn=ap.fn,rest=left*old/v;
   if(ap.paused){ap.remaining=rest}else schedule(fn,rest);
  }
  paintAutoplay();
  for(const r of root.querySelectorAll('[data-apspeed]'))r.checked=Number(r.dataset.apspeed)===v;
 }
 function togglePause(){
  if(ap.paused){ap.paused=false;if(ap.fn)schedule(ap.fn,ap.remaining)}
  else{ap.paused=true;clearTimeout(ap.timer);ap.remaining=Math.max(0,ap.remaining-(Date.now()-ap.startedAt))}
  paintAutoplay();
 }
 function stopAutoplay(){
  clearTimeout(ap.timer);
  Object.assign(ap,{on:false,paused:false,timer:0,fn:null});
  paintAutoplay();
 }
 const takeover=()=>{if(ap.on)stopAutoplay();begin()};

 // Ballistic calculator: pure arithmetic on what the player types; never reads game state, never affects scoring.
 const calc={open:false,f:['','',''],w:'',clock:'',drift:'',sc:'',ht:'',elev:'',status:''};
 const num=text=>{const t=text.trim().replace(/\s+/g,'').replace(/[−–—]/g,'-').replace(',','.');return /^-?(\d+\.?\d*|\.\d+)$/.test(t)?Number(t):NaN};
 const calcFlag=text=>{const v=num(text);return Number.isInteger(v)&&v>=0&&v<=3?v:NaN}; // 0 = limp flag (calm)
 const calcWeights=text=>{const a=text.trim().split(/[\s/;]+/).filter(Boolean).map(num);return a.length===3&&a.every(v=>v>=0&&v<=1)?a:null}; // three flag weights from the table, e.g. 0,46 0,33 0,21
 function calcResult(){
  const f=calc.f.map(calcFlag),wt=calcWeights(calc.w),drift=num(calc.drift),sc=num(calc.sc),elev=num(calc.elev),ht=calc.ht.trim()===''?0:num(calc.ht),dash='—'; // blank head/tail column = 0
  const out={bad:f.map((v,i)=>calc.f[i].trim()!==''&&Number.isNaN(v)),badW:calc.w.trim()!==''&&!wt,badH:Number.isNaN(ht),wind:dash,cross:dash,head:dash,x:dash,y:dash,xt:null,yt:null};
  let cwr=null,hw=0;
  if(f.every(v=>!Number.isNaN(v))&&wt){
   const fm=WLD().flagMs,wind=Number(f.reduce((a,v,i)=>a+(v?fm[v-1]:0)*wt[i],0).toFixed(1));
   out.wind=f.map((v,i)=>wt[i]+'·'+(v?fm[v-1]:0)).join(' + ')+' = '+wind.toFixed(1)+tr(' м/с',' m/s');
   if(calc.clock){
    const {kx,kz}=clockDir(Number(calc.clock)),deg=calc.clock*30;
    cwr=kz*wind;hw=-kx*wind; // cwr: + pushes the bullet right; hw: + headwind
    out.cross=wind.toFixed(1)+' × sin '+deg+'° = '+Math.abs(cwr).toFixed(1)+tr(' м/с',' m/s')+(Math.abs(kz)<.01?'':kz<0?tr(' (зносить ліворуч)',' (pushes left)'):tr(' (зносить праворуч)',' (pushes right)'));
    out.head=wind.toFixed(1)+' × cos '+deg+'° = '+Math.abs(hw).toFixed(1)+tr(' м/с',' m/s')+(Math.abs(kx)<.01?'':kx<0?tr(' (зустрічний)',' (headwind)'):tr(' (попутний)',' (tailwind)'));
   }
  }
  if(cwr!==null&&!Number.isNaN(drift)&&!Number.isNaN(sc)){
   out.xt=Math.round(-(drift*cwr+sc)*10)+0;
   out.x='−('+drift+' × '+(cwr<0?'(−'+Math.abs(cwr).toFixed(1)+')':cwr.toFixed(1))+' + '+sc+') = '+signedMil(out.xt)+tr(' міл',' mil');
  }
  if(!Number.isNaN(elev)&&!Number.isNaN(ht)){out.yt=Math.round((elev+hw*ht)*10)+0;out.y=(hw&&ht?elev+' + '+hw.toFixed(1)+' × '+ht+' = ':'')+(out.yt/10).toFixed(1)+tr(' міл',' mil')}
  return out;
 }
 function paintCalc(){
  const r=calcResult();
  root.querySelector('[data-calc-out="wind"]').value=r.wind;
  root.querySelector('[data-calc-out="cross"]').value=r.cross;
  root.querySelector('[data-calc-out="head"]').value=r.head;
  root.querySelector('[data-calc-out="x"]').value=r.x;
  root.querySelector('[data-calc-out="y"]').value=r.y;
  root.querySelectorAll('[data-calc^="f"]').forEach((el,i)=>el.setAttribute('aria-invalid',String(r.bad[i])));
  root.querySelector('[data-calc="w"]').setAttribute('aria-invalid',String(r.badW));
  root.querySelector('[data-calc="ht"]').setAttribute('aria-invalid',String(r.badH));
  root.querySelector('[data-calc-apply]').disabled=r.xt===null||r.yt===null||state.roundDone;
  root.querySelector('[data-calc-status]').textContent=calc.status;
 }
 function setCalcOpen(open,focus=true){
  calc.open=open;
  const drawer=root.querySelector('#sniper-calc'),toggle=root.querySelector('[data-calc-toggle]');
  drawer.classList.toggle('is-open',open);drawer.inert=!open;
  if(open)drawer.removeAttribute('aria-hidden');else drawer.setAttribute('aria-hidden','true');
  toggle.setAttribute('aria-expanded',String(open));
  if(focus)(open?drawer.querySelector('[data-calc="f1"]'):toggle).focus();
 }
 function bindCalc(){
  const drawer=root.querySelector('#sniper-calc');
  root.querySelector('[data-calc-toggle]').onclick=()=>setCalcOpen(!calc.open);
  drawer.querySelector('[data-calc-close]').onclick=()=>setCalcOpen(false);
  drawer.onkeydown=event=>{if(event.key==='Escape'&&calc.open){event.stopPropagation();setCalcOpen(false)}};
  for(const el of drawer.querySelectorAll('[data-calc]'))el.oninput=()=>{
   const k=el.dataset.calc;
   if(k[0]==='f')calc.f[k[1]-1]=el.value;else calc[k]=el.value;
   calc.status='';paintCalc();
  };
  for(const el of drawer.querySelectorAll('[name="calc-clock"]'))el.onchange=()=>{calc.clock=el.value;calc.status='';paintCalc()};
  drawer.querySelector('[data-calc-apply]').onclick=()=>{
   const r=calcResult();
   if(r.xt===null||r.yt===null)return;
   takeover();
   align(r.xt,r.yt);
   calc.status=tr('Виставлено: X ','Set: X ')+signedMil(state.x)+' / Y '+mil(state.y);
   paintCalc();
  };
  drawer.querySelector('[data-calc-clear]').onclick=()=>{
   Object.assign(calc,{f:['','',''],w:'',clock:'',drift:'',sc:'',ht:'',elev:'',status:''});
   for(const el of drawer.querySelectorAll('[data-calc]'))el.value='';
   for(const el of drawer.querySelectorAll('[name="calc-clock"]'))el.checked=false;
   paintCalc();drawer.querySelector('[data-calc="f1"]').focus();
  };
  paintCalc();
 }
 const calcDrawer=()=>{
  const field=(key,value,extra='')=>`<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-calc="${key}" value="${value}"${extra}>`;
  return `<aside id="sniper-calc" class="sniper-calc-drawer${calc.open?' is-open':''}" aria-label="${tr('Балістичний калькулятор','Ballistic calculator')}"${calc.open?'':' inert aria-hidden="true"'}>
   <div class="sniper-calc-head"><h2>${tr('Балістичний калькулятор','Ballistic calculator')}</h2><button type="button" data-calc-close aria-label="${tr('Закрити','Close')}">×</button></div>
   <div class="sniper-calc-flags">${[1,2,3].map(n=>`<label>${tr('Прапорець ','Flag ')}${n}${field('f'+n,calc.f[n-1])}</label>`).join('')}</div>
   <p class="sniper-calc-hint">${tr('кількість рисок ▮ 0–3 (0 = обвис)','marks ▮ 0–3 (0 = limp)')}</p>
   <label class="sniper-calc-row">${tr('Ваги прапорців з таблиці','Flag weights from the table')}${field('w',calc.w,' placeholder="0,46 0,33 0,21"')}</label>
   <output data-calc-out="wind"></output>
   <div class="sniper-calc-clock" role="radiogroup" aria-label="${tr('Вітер дме з: година, 12 — зустрічний, 6 — попутний','Wind comes from: o\'clock, 12 = headwind, 6 = tailwind')}"><span>${tr('Вітер з … год (12 — у лице, 3 — справа)','Wind from … o\'clock (12 = head-on, 3 = from the right)')}</span>
    <div class="sniper-calc-clockpills">${[12,1,2,3,4,5,6,7,8,9,10,11].map(n=>`<label><input type="radio" name="calc-clock" value="${n}"${Number(calc.clock)===n?' checked':''}><span>${n}</span></label>`).join('')}</div>
   </div>
   <output data-calc-out="cross" aria-label="${tr('Бічна складова','Crosswind')}"></output>
   <output data-calc-out="head" aria-label="${tr('Зустрічна / попутна складова','Head / tail')}"></output>
   <label class="sniper-calc-row">${tr('Знос на 1 м/с, міл','Drift per 1 m/s, mil')}${field('drift',calc.drift)}</label>
   <label class="sniper-calc-row">${tr('Деривація+Коріоліс з таблиці, міл','Spin + Coriolis from table, mil')}${field('sc',calc.sc)}</label>
   <label class="sniper-calc-row">${tr('Зустр./попутний 1 м/с, міл','Head/tail 1 m/s, mil')}${field('ht',calc.ht)}</label>
   <label class="sniper-calc-row">${tr('Підйом з таблиці, міл','Elevation from table, mil')}${field('elev',calc.elev)}</label>
   <div class="sniper-calc-result"><span>X</span><output data-calc-out="x" class="is-x"></output><span>Y</span><output data-calc-out="y" class="is-y"></output></div>
   <div class="sniper-hints"><button type="button" data-calc-apply>${tr('Виставити на маховики','Set on turrets')}</button><button type="button" data-calc-clear>${tr('Очистити','Clear')}</button></div>
   <p class="sniper-calc-status" data-calc-status role="status"></p>
  </aside>`;
 };
 // Moves one axis toward the solution in tenths, through the same setAlignment path as user input.
 function dial(axis,done){
  const target=solution(state)[axis==='x'?0:1],move=v=>axis==='x'?align(v,state.y,true):align(state.x,v,true);
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){move(target);done();return}
  const size=Math.ceil(Math.abs(target-state[axis])/30)||1;
  const tick=()=>{
   const rest=target-state[axis];
   if(!rest){done();return}
   move(state[axis]+Math.sign(rest)*Math.min(size,Math.abs(rest)));
   if(target-state[axis]===rest){done();return}
   schedule(tick,spd(55));
  };
  tick();
 }
 const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const workZoom=()=>[8,12,16,20,25][state.distance]||16; // fixed comfortable zoom per distance (300 m 8x, 500 m 12x, 1 km 16x, 2 km 20x, 3 km 25x), same for FFP and SFP; aims at the centre with the full dial, so the SFP mark calibration does not matter
 function zoomTo(target,done){
  const tick=()=>{
   const d=target-state.zoom;
   if(!d){done();return}
   zoomer(reduced()?target:state.zoom+Math.sign(d),false);
   if(reduced()||state.zoom===target){done();return}
   schedule(tick,spd(40));
  };
  tick();
 }
 function aimOut(done){
  const size=Math.ceil(Math.max(Math.abs(state.aim.x),Math.abs(state.aim.y))/30)||1;
  const toward=(v)=>v-Math.sign(v)*Math.min(size,Math.abs(v));
  const tick=()=>{
   const {x,y}=state.aim;
   if(!x&&!y){done();return}
   if(reduced())aimer(0,0,true);else aimer(toward(x),toward(y),true);
   if(state.aim.x===x&&state.aim.y===y){done();return}
   schedule(tick,spd(55));
  };
  tick();
 }
 function runStep(){
  paintAutoplay();
  const s=apSteps()[ap.step];
  if(s.mark==='fire'){zoomTo(workZoom(),()=>{});return} // autoplay waits for the player's shot; keep the working zoom
  const wait=()=>schedule(advance,hold(s.text));
  if(s.zoom)zoomTo(4,()=>schedule(()=>zoomTo(workZoom(),wait),spd(900)));else if(s.aim)zoomTo(workZoom(),()=>aimOut(wait));else if(s.dial)dial(s.dial,wait);else wait();
 }
 function advance(){
  if(ap.step<12){ap.step++;runStep();return}
  if(!state.roundDone){ap.step=8;runStep();return}
  if(finalNow()){stopAutoplay();return}
  nextRound();
  if(state.tutorialDone===true){state.series.usedCode=true;save()}
  ap.step=solved()?(aimed()?11:10):0;
  runStep();
 }
 function startAutoplay(){
  ap.on=true;ap.paused=false;ap.fn=null;
  if(state.tutorialDone===true){state.series.usedCode=true;save()}
  ap.step=state.roundDone?12:solved()?(aimed()?11:10):0;
  begin();
  render();root.querySelector('[data-autoplay]').focus();
  runStep();
 }

 function resetShot(next=false){ // next: another shot of the same series: the gust process keeps evolving and recoil moves the aim off the target
  if(!next)gustSeed();
  state.misses=0;state.roundDone=false;delete state.lastShot;notice='';miss=null;state.aim=next?recoilOf(state.aim):randomAim();
 }
 function startSeries(){
  const wi=Math.floor(Math.random()*weather.length),wind=randomWind(); // one weather (humidity) and one wind (regime, clock direction, flag strengths) for all five shots; only the gust keeps changing
  if(state.pendingMode!==undefined){state.mode=state.pendingMode;delete state.pendingMode}
  if(state.pendingProfile!==undefined){state.profile=state.pendingProfile;delete state.pendingProfile}
  if(state.pendingWorld!==undefined){setWorld(state.pendingWorld);state.world=worldId;delete state.pendingWorld}
  holes.length=0;gl?.reset();
  putWind(wind);
  state.series={v:2,wind,rounds:Array(seriesSize).fill(wi),unassisted:[],scores:[],shots:[],usedCode:false,time:0,started:false};
  resetShot();
  state.round=0;
  state.distance=modeDistances[state.mode][0];
  state.weather=wi;
  state.x=state.y=0;
 }

 // Restart the series when its saved history is missing, corrupt or out of step with the round.
 if(state.tutorialDone===true&&(!validSeries(state.series)||!validIndex(state.round,seriesSize)||state.distance!==modeDistances[state.mode][state.round]||
  state.weather!==state.series.rounds[state.round]||state.series.unassisted.length!==state.round+Number(state.roundDone)||state.series.scores.length!==state.series.unassisted.length||state.series.shots.length!==state.series.scores.length)){startSeries();save()}
 if(state.tutorialDone===true&&state.roundDone&&state.round<seriesSize-1){state.series.usedCode=false;resetShot(true);state.round++;state.distance=modeDistances[state.mode][state.round];state.weather=state.series.rounds[state.round]} // a save taken on the result card: move on to the next round
 if(state.series&&typeof state.series.started!=='boolean')state.series.started=state.series.time>0||state.series.scores.length>0;
 clock();
 document.addEventListener('visibilitychange',clock);
 let savedSec=-1;
 const tickId=setInterval(()=>{
  if(!root.isConnected){clearInterval(tickId);clearTimeout(breath.timer);document.removeEventListener('visibilitychange',glStart);document.removeEventListener('visibilitychange',onLeave);document.removeEventListener('keydown',onKeyDown);document.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',onLeave);glDrop();return}
  if(breath.on&&holdSec()>=breathMax)cancelHold(true);
  clock();paintTimer();
  if(!glLoop){gustStep(performance.now());if(glOn()){try{gl.setWind(flagGusts());gl.draw(view())}catch(error){glFail(error)}}} // fallback when the animation loop is not running (reduced motion)
  const sec=state.series?Math.floor(state.series.time/1000):-1;
  if(mark&&sec!==savedSec){savedSec=sec;save()}
 },250);

 // ---- Breath hold: press = hold the breath, release = shot ----
 const apFireStep=11; // index of the 'fire' step in apSteps(): autoplay waits there for the player
 const breath={on:false,t0:0,id:null,sx:0,sy:0,pm:{x:0,y:0},km:{x:0,y:0},recover:0,msg:'',msgUntil:0,key:false,timer:0};
 let painter=()=>{};
 const holdSec=()=>breath.on?(performance.now()-breath.t0)/1000:0;
 const clampMicro=v=>Math.max(-microLimit,Math.min(microLimit,v));
 const microNow=()=>breath.on?{x:clampMicro(breath.pm.x+breath.km.x),y:clampMicro(breath.pm.y+breath.km.y)}:{x:0,y:0}; // tenths of a mil
 const fireGate=()=>!ap.on||ap.step===apFireStep; // with autoplay on, Fire works only at its fire-wait step
 const canFire=()=>!state.roundDone&&!flying&&!rt&&fireGate();
 function updateFire(){
  const b=root.querySelector('[data-fire]');
  if(!b)return;
  b.hidden=state.roundDone===true;
  b.disabled=!breath.on&&(!canFire()||performance.now()<breath.recover);
  b.classList.toggle('is-holding',breath.on);b.setAttribute('aria-pressed',String(breath.on));
  const label=breath.on?tr('Відпустіть — постріл','Release to fire'):tr('Постріл','Fire');
  if(b.dataset.label!==label){b.dataset.label=label;b.innerHTML='<span aria-hidden="true">⊕</span> '+label}
 }
 function paintBreath(){
  const el=root.querySelector('.sniper-breath');
  if(!el)return;
  const now=performance.now(),h=holdSec(),msg=!breath.on&&now<breath.msgUntil;
  el.hidden=!(breath.on||msg);
  if(el.hidden)return;
  el.dataset.phase=breath.on?breathPhase(h):'over';
  el.querySelector('[data-breath-label]').textContent=msg?breath.msg:tr('Затримка дихання','Breath hold')+' · '+h.toFixed(1)+' '+tr('с','s');
  el.querySelector('[data-breath-fill]').style.width=(msg?100:Math.min(100,h/breathMax*100)).toFixed(1)+'%';
 }
 function breathTick(){
  breath.timer=0;
  if(!root.isConnected)return;
  if(breath.on&&holdSec()>=breathMax)cancelHold(true);
  paintBreath();
  if(breath.on||performance.now()<Math.max(breath.recover,breath.msgUntil))breath.timer=setTimeout(breathTick,50);else updateFire();
 }
 const breathLoop=()=>{if(!breath.timer)breath.timer=setTimeout(breathTick,50)};
 function startHold(){
  if(breath.on||!canFire()||performance.now()<breath.recover)return false;
  shotAudio.unlock(); // first user gesture creates the audio context
  begin();
  Object.assign(breath,{on:true,t0:performance.now(),pm:{x:0,y:0},km:{x:0,y:0},msg:'',msgUntil:0,key:false});
  updateFire();paintBreath();breathLoop();
  return true;
 }
 function endHold(){ // keeps the micro-adjust as part of the aim
  const m=microNow();
  if(m.x||m.y){state.aim={x:clampAim(+(state.aim.x+m.x).toFixed(2)),y:clampAim(+(state.aim.y+m.y).toFixed(2))};save()}
  Object.assign(breath,{on:false,id:null,key:false,pm:{x:0,y:0},km:{x:0,y:0}});
 }
 function cancelHold(over){ // no shot: breath held too long (12 s) or the press was lost
  if(!breath.on)return;
  endHold();
  const now=performance.now();
  breath.recover=now+(over?breathRecover:400);
  if(over){breath.msg=tr('Видихніть — затримка дихання надто довга','Breathe — breath held too long');breath.msgUntil=breath.recover;notice=breath.msg}
  updateFire();paintBreath();painter();breathLoop();
 }
 function releaseHold(){
  if(!breath.on)return;
  const h=holdSec();
  endHold();
  fire({h});
 }
 const typing=t=>t instanceof Element&&!!t.closest('input,textarea,select,[contenteditable]');
 const isSpace=e=>e.code==='Space'||e.key===' ';
 const onKeyDown=event=>{
  if(!root.isConnected||event.ctrlKey||event.altKey||event.metaKey)return;
  const t=event.target;
  if(isSpace(event)){
   if(typing(t)||(t instanceof Element&&t.closest('button:not([data-fire]),a,[role="tab"],summary')))return;
   event.preventDefault();
   if(!event.repeat&&!breath.on&&startHold())breath.key=true;
  }else if(breath.on&&breath.key&&event.key.startsWith('Arrow')){
   event.preventDefault();
   const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
   if(d){breath.km.x=clampMicro(breath.km.x+d[0]*microKey);breath.km.y=clampMicro(breath.km.y+d[1]*microKey);painter()}
  }
 };
 const onKeyUp=event=>{
  if(!root.isConnected||!isSpace(event)||!breath.on||!breath.key)return;
  event.preventDefault();releaseHold();
 };
 const onLeave=()=>{if(document.hidden||!breath.on)cancelHold(false)};
 document.addEventListener('keydown',onKeyDown);document.addEventListener('keyup',onKeyUp);
 document.addEventListener('visibilitychange',onLeave);window.addEventListener('blur',onLeave);

 // Explicit shot: score by distance from the solution, play the 3D flight, then record the result.
 async function fire(o={}){ // o.h: seconds the breath was held at the release (0 = instant shot)
  if(state.roundDone||flying||rt||!fireGate())return;
  begin();
  if(ap.on){clearTimeout(ap.timer);ap.fn=null}
  const tol=tolerance[state.distance],w=state.wind,tutorial=state.tutorialDone!==true;
  gustStep(performance.now());
  const B=Bw(),h=o.h||0,k=breathK(h),ci=state.profile,D=distances[state.distance],T=tabOf(ci,state.distance),{kx,kz}=clockDir(w.clock),sw=swayNow(h),gustRead=gp.g,flagG=flagGusts(),dv0=gauss()*sigma.dv0,hs=(reduced()?sigma.holdReduced:sigma.hold)*k;
  // The gust keeps evolving (Ornstein–Uhlenbeck, from the value the flags show now) while the bullet flies; the solver integrates the time-varying wind it actually meets.
  const gp2=ouPath(gustRead,sigma.gust,sigma.tau,gustDt,Math.ceil((T.tof+1.5)/gustDt)+2,gauss),res=gauss()*sigma.res,gf=pathFn(gp2,gustDt);
  const disp={gust:0,gustRead,res,gp:gp2.map(v=>+v.toFixed(3)),gx:0,gxR:kz*T.drift1*gustRead,gy:0,vy:0,dv0,rand:{x:gauss()*sigma.rand,y:gauss()*sigma.rand},hold:{x:gauss()*hs-sw.x,y:gauss()*hs-sw.y}}; // mil; hold is the impact error from the sway at the trigger pull (sway and hs already scaled by the breath factor k)
  const flags=flagMs(w),mean={flags,kx,kz},full={flags,kx,kz,gust:gf,res}; // wind speeds along the wind's own direction; the solver splits them into crosswind and head/tail
  // Dial and pointing errors are all angles: the bore points (dial − aim offset + rifle + hold) from the zero.
  const ang={elevMil:(state.y-state.aim.y)/10+disp.rand.y+disp.hold.y,windMil:(state.x-state.aim.x)/10+disp.rand.x+disp.hold.x};
  const path=B.trajectory(ci,D,{...ang,dv0,wind:full,beyond:60});
  const noGust=B.trajectory(ci,D,{...ang,dv0,wind:mean,dx:D}),noV=B.trajectory(ci,D,{...ang,dv0:0,wind:mean,dx:D});
  disp.gx=path.impact.x-noGust.impact.x;disp.gy=path.impact.y-noGust.impact.y;disp.vy=noGust.impact.y-noV.impact.y;disp.gust=Math.abs(kz)>.25&&Math.abs(T.drift1)>1e-9?disp.gx/(kz*T.drift1):gustRead; // gust: effective along-wind m/s equivalent (from the crosswind part; a head/tail wind shows the gust speed itself)
  const dx=10*path.impact.x,dy=10*path.impact.y,err=Math.hypot(dx,dy),ring=ringOf(err,state.distance),tof=path.tof;
  const useFpv=state.fpv==='always'||(state.fpv==='auto'&&(ring===10||ring===0)); // Auto: slow-motion flight only for a 10 or a complete miss, otherwise real time
  { // sound: muzzle blast now; the steel ting arrives after the flight plus the sound's travel time (FPV replay: at the impact of the replay, quieter)
   const air=airOf(),fpv=useFpv;
   shotAudio.shot(ci,air,fpv?.8:1);
   if(ring>0&&air!=='vacuum')shotAudio.ting(fpv?Math.max(2.5,Math.min(8,3*tof)):tof+D/WLD().sound,fpv?.6:1);
  }
  const note=tr('Порив ','Gust ')+sgn(disp.gust,1)+tr(' м/с · швидкість ',' m/s · velocity ')+sgn(dv0,1)+tr(' м/с',' m/s')+'\n'+tr('розкид ','spread ')+sgn(disp.rand.x,2)+'/'+sgn(disp.rand.y,2)+tr(' · рука ',' · hold ')+sgn(disp.hold.x,2)+'/'+sgn(disp.hold.y,2)+tr(' міл',' mil')+(h>0?'\n'+tr('затримка дихання ','breath held ')+h.toFixed(1)+tr(' с · коеф. ',' s · factor ')+k.toFixed(2):'');
  if(!useFpv){
   if(ap.on)stopAutoplayTimerOnly();
   await realtimeShot({D,dx,dy,ring,note,tof});
  }else{
    flying=true;clock();
    updateFire();
    try{
     const {playFlight}=await import('./sniper-flight.js');
     await playFlight(root,{
      distance:D,caliber:calibers[ci],gravity:WLD().g,world:worldId,path,
      aimMil:{x:state.x/10,y:state.y/10},holes:holes.filter(v=>v.D===D),impactMil:{x:dx/10,y:dy/10},targetRadiusMil:tol/10,ring10:ringFrac(state.distance),note,ring,hit:ring>0,
      wind:{regime:w.regime,clock:w.clock,flags:w.flags,gust:flagG},
      autoClose:0,tr,
     });
    }catch(error){console.warn(error)}
    if(ring>0){const hole={D,lat:dx/10*D/1000,dy:dy/10*D/1000};holes.push(hole);try{gl?.hole(hole)}catch(error){glFail(error)}}
  }
  flying=false;pendingRender=false;
  if(tutorial){
   if(ring){state.roundDone=true;state.lastShot={ring,score:Math.max(1,ring-(state.misses||0))};state.misses=0;notice='';miss=null}
   else{state.misses=(state.misses||0)+1;miss={dx,dy};state.aim=recoilOf(state.aim);notice=tr('Промах · поправте приціл і стріляйте знову','Miss · correct and fire again')}
  }else{
   const series=state.series;
   const before=series.shots.reduce((a,b)=>a+b.ms,0);
   if(useFpv)series.time+=1000*tof; // real time of flight replaces the animation time (in real-time mode it already elapsed)
   series.scores=[...series.scores,ring];
   series.unassisted=[...series.unassisted,!series.usedCode];
   series.shots=[...series.shots,{ring,hit:ring>0,dx,dy,ms:Math.max(0,series.time-before),disp,p:{di:state.distance,ci:state.profile,wi:state.weather,wind:{regime:w.regime,clock:w.clock,flags:[...w.flags]},x:state.x,y:state.y}}];
   state.roundDone=true;state.lastShot={ring,score:ring};state.misses=0;notice='';miss=null;
   if(state.round===seriesSize-1){
    const total=series.scores.reduce((a,b)=>a+b,0),hits=series.shots.filter(v=>v.hit).length,hpm=series.time>0?hits/(series.time/60000):0;
    series.newRecord={score:total>(state.bestScore??0),hpm:hits>0&&hpm>(state.bestHpm??0)};
    if(series.newRecord.score)state.bestScore=total;
    if(series.newRecord.hpm)state.bestHpm=hpm;
    tabPick='results';
   }
  }
  clock();
  save();render();scopeTop();
  if(state.roundDone&&!ap.on){
   if(tutorial||state.round<seriesSize-1){nextRound();root.querySelector('[data-axis="x"]')?.focus({preventScroll:true})} // Continue was pressed: go straight to the next round (a tutorial hit starts the series; the 5th shot stays on its results)
   else root.querySelector('[data-next]')?.focus();
  }
  if(ap.on){ap.step=12;runStep()}
 }
 const stopAutoplayTimerOnly=()=>{clearTimeout(ap.timer);ap.fn=null};
 // Real-time shot: no replay. Countdown of the true time of flight, then the impact appears in the scope view and a result card waits for Continue.
 function realtimeShot(o){
  return new Promise(resolve=>{
   const D=distances[state.distance],t0=performance.now();
   let tick=0;
   rt={phase:'flight',left:o.tof,o};render(); // locks the controls and shows the countdown
   const go=()=>{clearInterval(tick);rt=null;paintRt();resolve()};
   const impact=()=>{
    clearInterval(tick);rt.phase='card';clock();
    const h={D,hit:o.ring>0,lat:o.dx/10*D/1000,dy:o.dy/10*D/1000};
    try{gl?.impact({...h,still:reduced()})}catch(error){glFail(error)}
    if(h.hit)holes.push({D,lat:h.lat,dy:h.dy});
    rt.go=go;paintRt();
   };
   tick=setInterval(()=>{
    if(!root.isConnected){clearInterval(tick);resolve();return}
    rt.left=Math.max(0,o.tof-(performance.now()-t0)/1000);
    if(rt.left<=0)impact();else paintRt();
   },50);
  });
 }
 function paintRt(){
  const stage=root.querySelector('.sniper-stage');
  if(!stage)return;
  let el=stage.querySelector('.sniper-rt');
  if(!rt){el?.remove();return}
  if(!el){el=document.createElement('div');stage.append(el)}
  if(rt.phase==='flight'){
   if(el.dataset.p!=='f'){el.dataset.p='f';el.className='sniper-rt sniper-hud sniper-hud-flight';el.setAttribute('role','status');el.innerHTML='<span></span>'}
   el.firstChild.textContent=tr('Куля в польоті… ','Bullet in flight… ')+rt.left.toFixed(1)+' '+tr('с','s');
  }else if(el.dataset.p!=='c'){
   const o=rt.o,hit=o.ring>0;
   el.dataset.p='c';el.className='sniper-rt sniper-impact';el.setAttribute('role','status');
   el.innerHTML=`<div class="sniper-impact-ring">${o.ring}</div><div class="sniper-impact-main"><b class="${hit?'is-hit':'is-miss'}">${hit?tr('Влучання','Hit'):tr('Промах','Miss')}</b> <span>${tr('Відхилення: ','Offset: ')}X ${sgn(o.dx/10,2)} / Y ${sgn(o.dy/10,2)} ${tr('міл','mil')}</span><small></small></div><button type="button" data-rt-go>${tr('Далі','Continue')}</button>`;
   el.querySelector('small').textContent=o.note;
   const b=el.querySelector('[data-rt-go]');b.onclick=()=>rt?.go?.();b.focus({preventScroll:true});
  }
 }
 // Between shots the wind may shift, rarely and gently (~20% per shot): the clock moves one hour and/or the flags one step; steady stays steady, calm and a 1-step steady wind can swap (~10%).
 let windNote='';
 function driftWind(){
  const w=state.wind;
  if(Math.random()>=.2)return;
  const hour=()=>(w.clock-1+(Math.random()<.5?-1:1)+12)%12+1,step=()=>Math.random()<.5?-1:1,cl=v=>Math.max(1,Math.min(3,v));
  let n;
  if(w.regime==='calm'){if(Math.random()>=.1)return;n={regime:'steady',clock:Math.random()<.5?hour():w.clock,flags:[1,1,1]}}
  else if(w.regime==='steady'&&w.flags[0]===1&&Math.random()<.1)n={regime:'calm',clock:w.clock,flags:[0,0,0]};
  else{
   let clock=Math.random()<.5?hour():w.clock,flags=[...w.flags];
   if(w.regime==='steady'){if(Math.random()<.6||clock===w.clock){const f=cl(flags[0]+step());flags=[f,f,f]}}
   else if(Math.random()<.6||clock===w.clock){const i=Math.floor(Math.random()*3);flags=flags.map((v,j)=>j===i||Math.random()<.4?cl(v+step()):v)}
   n={regime:w.regime,clock,flags};
  }
  if(!validWind(n)||(n.clock===w.clock&&n.flags.join()===w.flags.join()&&n.regime===w.regime))return;
  const regimeChanged=n.regime!==w.regime;
  state.series.wind=n;putWind(n);if(regimeChanged)gustSeed();
  windNote=tr('Вітер змінився: ','Wind changed: ')+compass(n)+' · '+flagPattern(n);
 }
 function nextRound(){
  if(tabPick==='results')tabPick=null;
  if(state.tutorialDone!==true||state.round===seriesSize-1){
   state.tutorialDone=true;
   startSeries();
  }else{
   state.series.usedCode=false;
   resetShot(true);
   state.round++;
   state.distance=modeDistances[state.mode][state.round];
   state.weather=state.series.rounds[state.round]; // same conditions; the turrets and zoom stay as the player left them
   windNote='';driftWind();if(windNote)notice=windNote;
  }
  clock();
  save();render();scopeTop();
 }
 function methodSteps(){
 const d1=(ci,di)=>tabOf(ci,di).drift1,row=ci=>[2,3,4].map(di=>d1(ci,di).toFixed(2)).join(' / '),T=tabOf(state.profile,state.distance),W=weightsShown(T).map(v=>v.toFixed(2)).join(' / '),
  g=di=>(WLD().gust*d1(1,di)).toFixed(2);
 return `<li>${adaptLine()}.</li>
  <li>${tr('Спершу підберіть кратність: на 4× видно всю трасу, щоб знайти мішень; потім збільште, щоб точно навестися.','First set magnification: at 4× you see the whole range to find the target; then zoom in to aim precisely.')}</li>
  ${noWind()?`<li>${tr('У цьому світі немає повітря, а отже й вітру: прапорці висять на жорстких штангах, поправка на вітер нульова. X — лише Коріоліс.','This world has no air and so no wind: the flags hang on rigid rods and the windage correction is zero. X is Coriolis only.')}</li>`:`<li>${tr('Кожен прапорець: '+marksPlain()+' м/с (обвислий прапорець — штиль, 0). Режим вітру серії видно по прапорцях: штиль — усі обвисли, поправки на вітер немає; рівний — усі три однакові, вітер майже не «дихає»; поривчастий — прапорці різні, і порив змінюється. Вітер на трасі різний, і чим ближче до стрільця, тим довше він діє на кулю, тож середнє зважене: вага прапорців з таблиці (ближній / середній / дальній), для вашої дистанції ','Each flag: '+marksPlain()+' m/s (a limp flag = calm, 0). The regime of the series shows in the flags: calm — all hang limp and there is no wind correction; steady — all three the same, the wind hardly breathes; gusty — the flags differ and the gust keeps changing. Wind differs along the range, and the nearer it is to the shooter the longer it acts on the bullet, so use the weighted average with the table weights (near / middle / far), for your distance ')}<b>${W}</b>${tr(': вітер = сума (вага × швидкість прапорця).',': wind = sum of (weight × flag speed).')}</li>
  <li>${tr('Напрям вітру — як годинник: ви дивитесь на 12 (мішень), вітер дме З вказаної години. 12 — зустрічний, 6 — попутний, 3 — справа (зносить кулю ліворуч), 9 — зліва (зносить праворуч). Розкладіть вітер: бічна складова = вітер × sin(кут), поздовжня = вітер × cos(кут), кут = година × 30°. Бічна: повне значення з 3 і 9 год, ≈0,87 з 2, 4, 8, 10 год, 0,5 з 1, 5, 7, 11 год, 0 з 12 і 6 год. Поздовжня — навпаки: 1 з 12 і 6, ≈0,87 з 1, 5, 7, 11, 0,5 з 2, 4, 8, 10, 0 з 3 і 9.','Wind direction works like a clock: you face 12 (the target) and the wind blows FROM the given hour. 12 = headwind, 6 = tailwind, 3 = from the right (pushes the bullet left), 9 = from the left (pushes it right). Split the wind: crosswind = wind × sin(angle), head/tail = wind × cos(angle), angle = hour × 30°. Crosswind: full at 3 and 9 o\'clock, ≈0.87 at 2, 4, 8, 10, 0.5 at 1, 5, 7, 11, 0 at 12 and 6. Head/tail is the opposite: 1 at 12 and 6, ≈0.87 at 1, 5, 7, 11, 0.5 at 2, 4, 8, 10, 0 at 3 and 9.')}</li>`}
  <li>${tr('Y = підйом з таблиці'+(noWind()?'':' + зустрічна складова × колонка «Зустр./попутний 1 м/с» (попутна віднімається: перед нею мінус)')+' для вашої дистанції (нуль на 100 м).','Y = elevation from the table'+(noWind()?'':' + head/tail component × the “Head/tail 1 m/s” column (a tailwind subtracts)')+' for your distance (100 m zero).')}${noWind()?'':tr(' Зустрічний вітер подовжує політ і додає падіння: ≈'+tabOf(state.profile,state.distance).ht.toFixed(3)+' міл на 1 м/с на вашій дистанції — на 300–1000 м це майже непомітно, а на 3 км уже понад пів-міл на кілька м/с.',' A headwind lengthens the flight and adds drop: about '+tabOf(state.profile,state.distance).ht.toFixed(3)+' mil per 1 m/s at your distance — barely visible at 300–1000 m, but at 3 km a few m/s already add over half a mil.')}</li>
  ${worldId!=='earth'?`<li>${noWind()?tr('Деривації немає (повітря немає). Коріоліс від обертання світу «'+worldName()+'» (широта '+latOf()+'° N, стрільба на північ) зносить кулю праворуч: див. колонку «Деривація + Коріоліс».','No spin drift (no air). Coriolis from the rotation of the world “'+worldName()+'” ('+latOf()+'° N, shooting north) pushes the bullet right: see the “Spin + Coriolis” column.'):(WLD().rho<.1?tr('Деривація (мала в розрідженому повітрі) й Коріоліс від обертання світу «'+worldName()+'» зносять кулю праворуч, і не залежать від вітру: колонка «Деривація + Коріоліс».','Spin drift (tiny in thin air) and Coriolis from the rotation of the world “'+worldName()+'” push the bullet right regardless of wind: the “Spin + Coriolis” column.'):tr('Деривація й Коріоліс від обертання світу «'+worldName()+'» (широта '+latOf()+'° N, стрільба на північ) зносять кулю праворуч, і не залежать від вітру: колонка «Деривація + Коріоліс».','Spin drift and Coriolis from the rotation of the world “'+worldName()+'” (latitude '+latOf()+'° N, shooting north) push the bullet right regardless of wind: the “Spin + Coriolis” column.'))}</li>`:`<li>${tr('Деривація й Коріоліс: куля з правою нарізкою завжди йде праворуч, і обертання Землі (широта 48° N, стрільба на північ) теж зносить її праворуч. Обидві поправки — у колонці «Деривація + Коріоліс» таблиці, і не залежать від вітру.','Spin drift and Coriolis: a right-hand twist always carries the bullet right, and the Earth\'s rotation (latitude 48° N, shooting north) also pushes it right. Both are in the “Spin + Coriolis” table column and do not depend on the wind.')}</li>`}
  <li>${tr('X = −(знос на 1 м/с × бічна складова + деривація + Коріоліс), де бічна складова з плюсом, якщо вітер дме вправо (з 7–11 год), і з мінусом, якщо вліво (з 1–5 год). Отже вітер справа дає додатну частину X, вітер зліва — від’ємну; деривація й Коріоліс завжди дають від’ємний внесок.','X = −(drift per 1 m/s × crosswind + spin + Coriolis), where the crosswind is positive if the wind blows right (from 7–11 o\'clock) and negative if it blows left (from 1–5). So a wind from the right gives a positive part of X, a wind from the left a negative one; spin and Coriolis always contribute a negative part.')}</li>
  ${worldId==='earth'?`<li>${tr('Навіть ідеальний розрахунок не гарантує 10: реальний розкид — порив і залишок вітру (≈±0,5 м/с), розкид швидкості кулі ±2 м/с (≈7 фут/с), кучність гвинтівки ≈0,5 MOA, дихання стрільця й округлення маховиків до 0,1 міл — дає випадкове відхилення. За симуляцією ідеальний постріл дає 10 приблизно у 70% випадків на 300 м, 55% на 500 м, 20–32% на 1 км, 4–13% на 2 км і 2–4% на 3 км. Мішені на 2 і 3 км великі (сталева плита ⌀ 1,9 і 4,0 м): ідеальний постріл влучає в плиту приблизно у 60–90% (2 км) і 55–85% (3 км) випадків залежно від калібру — найкраще для .416 Barrett і .50 BMG, найгірше для .338 Lapua, яка на 2 км вже майже дозвукова.','Even a perfect solution doesn\'t guarantee a 10. Realistic error adds up: gust plus the unreadable part of the wind (about ±0.5 m/s), muzzle velocity varies by ±2 m/s (~7 fps), the rifle shoots about 0.5 MOA, the shooter\'s breathing moves the hold, and the turrets round to 0.1 mil. In simulation a perfect shot is a 10 about 70% of the time at 300 m, 55% at 500 m, 20–32% at 1 km, 4–13% at 2 km and 2–4% at 3 km. The 2 km and 3 km targets are large steel plates (1.9 m and 4.0 m across): a perfect shot still hits the plate about 60–90% of the time at 2 km and 55–85% at 3 km, depending on the caliber — best for the .416 Barrett and .50 BMG, worst for the .338 Lapua, which is nearly subsonic at 2 km.')}</li>`:`<li>${tr('Навіть ідеальний розрахунок не гарантує 10: розкид швидкості кулі ±2 м/с, кучність гвинтівки ≈0,5 MOA, дихання стрільця, округлення маховиків до 0,1 міл'+(noWind()?'':' і порив вітру (σ '+WLD().gust+' м/с)')+' дають випадкове відхилення. Відсотки в цьому розділі — для світу «Майже Земля»; '+(WLD().rho<.1?'тут куля майже не гальмує, тож влучати легше.':'тут тяжіння, повітря й вітер інші, тож результат відрізняється: куля падає сильніше й довше летить.'),'Even a perfect solution doesn\'t guarantee a 10: muzzle velocity spread of ±2 m/s, rifle grouping about 0.5 MOA, breathing, and the turrets rounding to 0.1 mil'+(noWind()?'':' and wind gusts (σ '+WLD().gust+' m/s)')+' add random error. The percentages in this section are for the Almost Earth world; here '+(WLD().rho<.1?'the bullet barely slows, so hitting is easier.':'gravity, air and wind differ, so the result differs: the bullet drops more and flies longer.'))}</li>`}
  ${worldId==='earth'?`<li>${tr('Режими: штиль (20% серій) — порива немає; рівний вітер (30%) — порив у ≈7 разів слабший; поривчастий (50%) — повний порив. Ідеальний постріл дає 10 для .375 на 1 / 2 / 3 км приблизно: штиль 43 / 31 / 16%, рівний 47 / 28 / 13%, поривчастий 33 / 15 / 6%. ','Regimes: calm (20% of series) — no gust; steady (30%) — the gust is about 7 times weaker; gusty (50%) — the full gust. A perfect shot is a 10 for the .375 at 1 / 2 / 3 km about: calm 43 / 31 / 16%, steady 47 / 28 / 13%, gusty 33 / 15 / 6%. ')+tr('Вітер не постійний: порив повільно «дихає» (приблизно ±0,5 м/с, з часом ≈4 с), і його видно лише по прапорцях. Але куля летить кілька секунд, а порив за цей час змінюється: чим довший політ, тим менше допомагає зчитаний порив (на 1 км він прибирає ≈60% розкиду від вітру, на 3 км лише ≈20%). Прапорці випрямляються — вітер сильнішає: додайте поправку в бік вітру; обвисли — слабшає: додайте проти вітру або зачекайте затишшя. Скільки міл на кожен +1 м/с: .375 CheyTac — '+row(1)+' на 1 / 2 / 3 км; .338 Lapua — '+row(0)+'; .416 Barrett — '+row(2)+'; .50 BMG — '+row(3)+'. Тож порив ±0,5 м/с — це ≈±'+g(2)+' міл на 1 км і ≈±'+g(4)+' міл на 3 км для .375. Невидима частина вітру (≈0,1 м/с по трасі та майбутня зміна пориву) лишається випадковою.','The wind is not constant: the gust slowly breathes (about ±0.5 m/s, time constant about 4 s) and is visible only in the flags. But the bullet flies for several seconds and the gust keeps changing: the longer the flight, the less a gust you have read helps (at 1 km it removes about 60% of the wind scatter, at 3 km only about 20%). Flags straighten out = stronger wind: add windage toward the wind side; flags droop = weaker wind: add against the wind, or wait for a lull. Mil per extra +1 m/s: .375 CheyTac '+row(1)+' at 1 / 2 / 3 km; .338 Lapua '+row(0)+'; .416 Barrett '+row(2)+'; .50 BMG '+row(3)+'. So a ±0.5 m/s gust is about ±'+g(2)+' mil at 1 km and ±'+g(4)+' mil at 3 km for the .375. The unreadable part (about 0.1 m/s along the range and the future change of the gust) stays random.')}</li>`:noWind()?'':`<li>${WLD().rho<.1?tr('Вітер не постійний: порив повільно «дихає» (σ '+WLD().gust+' м/с, час ≈4 с), і його видно по прапорцях. Але в розрідженому повітрі куля майже не гальмує, тож знос від вітру малий: '+row(1)+' міл на 1 м/с (.375 CheyTac, 1 / 2 / 3 км).','The wind is not constant: the gust slowly breathes (σ '+WLD().gust+' m/s, about 4 s), visible in the flags. But in thin air the bullet barely slows, so wind drift is small: '+row(1)+' mil per 1 m/s (.375 CheyTac, 1 / 2 / 3 km).'):tr('Вітер не постійний: порив повільно «дихає» (σ '+WLD().gust+' м/с, час ≈4 с), і його видно по прапорцях. Куля летить довго, тож порив за цей час змінюється. Знос від вітру: '+row(1)+' міл на 1 м/с (.375 CheyTac, 1 / 2 / 3 км).','The wind is not constant: the gust slowly breathes (σ '+WLD().gust+' m/s, about 4 s), visible in the flags. The bullet flies for a long time and the gust changes meanwhile. Wind drift: '+row(1)+' mil per 1 m/s (.375 CheyTac, 1 / 2 / 3 km).')}</li>`}
  <li>${tr('Сітка: у FFP (перша фокальна площина) сітка росте разом з кратністю, тож 1 поділка = 1 міл на будь-якому збільшенні. У SFP (друга фокальна площина) сітка має незмінний розмір і калібрована на 10×: на іншій кратності одна поділка — це 10/кратність міл, тож винос у поділках множте на 10/кратність. Точні поділки в SFP лише на 10×.','Reticle: in an FFP (first focal plane) scope the reticle grows with magnification, so 1 mark = 1 mil at any zoom. In an SFP (second focal plane) scope the reticle stays a fixed size and is calibrated at 10×: at any other magnification one mark is 10/zoom mil, so multiply your holdover in marks by 10/zoom. SFP marks are true only at 10×.')}</li>
  <li>${tr('Затримка дихання: натисніть і тримайте «Постріл» (або пробіл) — відпускання робить постріл. Дихальна пауза гасить гойдання прицілу до 25% приблизно за 0,8 с; «тихе вікно» (зелена смуга) триває до ≈4 с. Далі кисневий борг: гойдання наростає (амбер до 7 с, червоне далі) і з’являється тремор. Через 12 с треба видихнути — затримка скасовується. Поки тримаєте, прапорці рухаються: чекайте на потрібний порив. Мікрокорекції: рухайте мишею (25 пікселів ≈ 1 піксель перетягування прицілу, до ±0,3 міл) або стрілками під час утримання пробілу (±0,01 міл).','Breath hold: press and hold Fire (or Space); releasing takes the shot. The respiratory pause cuts the sway to 25% in about 0.8 s, and the steady window (green bar) lasts until about 4 s. After that oxygen debt builds: the sway grows (amber to 7 s, red beyond) and a tremor appears. At 12 s you must breathe — the hold is cancelled. The flags keep moving while you hold, so wait for the right gust. Micro-corrections: move the mouse (25 px ≈ 1 px of scope drag, up to ±0.3 mil) or use the arrow keys while holding Space (±0.01 mil).')}</li>
  ${worldId==='earth'?`<li>${tr('Вологість на код не впливає.','Humidity does not affect the code.')}</li>`:''}
  <li>${tr('Можна не докручувати маховики: якщо бракує поправки, поставте мішень на поділку сітки на цю різницю (винос). Наприклад, бракує 0.7 міл підйому — мішень на поділці 0.7 нижче центру.','You don\'t have to dial everything: if the dial is short, put the target on the reticle mark at that difference (holdover). E.g. 0.7 mil elevation short — put the target on the 0.7 mark below center.')}</li>`;
}
 const cmOf=(milValue,D)=>Math.round(milValue*D/10)+' '+tr('см','cm'); // mil at the target, metric
 const dispTip=d=>tr('Порив ','Gust ')+sgn(d.gust,1)+tr(' м/с · швидкість ',' m/s · velocity ')+sgn(d.dv0,1)+tr(' м/с · розкид ',' m/s · spread ')+sgn(d.rand.x,2)+'/'+sgn(d.rand.y,2)+tr(' · рука ',' · hold ')+sgn(d.hold.x,2)+'/'+sgn(d.hold.y,2)+tr(' міл',' mil');
 function resultsHtml(){
  const series=state.series,shots=series.shots,n=shots.length,hits=shots.filter(v=>v.hit).length,total=series.scores.reduce((a,b)=>a+b,0),
   time=series.time,hpm=time>0?hits/(time/60000):0,rec=series.newRecord||{},R=40,E=54,fp=.25;
  const pick=(better)=>shots.reduce((b,v,i)=>better(v.ring,shots[b].ring)?i:b,0);
  const bi=pick((a,b)=>a>b),wi=pick((a,b)=>a<b);
  const badge=on=>on?` <span class="sniper-badge" title="${tr('Новий рекорд','New record')}" aria-label="${tr('Новий рекорд','New record')}"></span>`:'';
  const cell=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const marks=shots.map((v,i)=>{
   const di=modeDistances[state.mode][i],t=tolerance[di],r10=ring10[di],e=Math.hypot(v.dx,v.dy),len=e||1,
    pr=(e<=r10?e/r10*fp:fp+(1-fp)*(e-r10)/(t-r10))*R, // radius on the plot: same 10-ring / 9-band layout for every distance
    k=(v.hit?pr:Math.min(E,Math.max(pr,R+4)))/len,x=(v.dx*k).toFixed(1),y=(-v.dy*k).toFixed(1);
   return v.hit?`<g transform="translate(${x} ${y})"><circle r="5.5" class="hit"/><text>${i+1}</text></g>`:
    `<g transform="translate(${x} ${y})" class="miss"><path d="M-4-4L4 4M4-4L-4 4"/><text x="8" y="-5">${i+1}</text></g>`;
  }).join('');
  const rings=Array.from({length:10},(_,j)=>`<circle r="${(R*(fp+(1-fp)*j/9)).toFixed(1)}"${j===9?' class="edge"':''}/>`).join('');
  const rows=shots.map((v,i)=>`<tr><td><span class="sa-dot" style="background:${shotColors[i%shotColors.length]}"></span>${i+1}</td><td>${v.ring}${v.hit?'':' ×'}</td><td class="nw">${(v.ms/1000).toFixed(1)} ${tr('с','s')}</td><td class="nw"${v.disp?` title="${dispTip(v.disp)}"`:''}>${(Math.hypot(v.dx,v.dy)/10).toFixed(2)} <small>· ${cmOf(Math.hypot(v.dx,v.dy)/10,distances[modeDistances[state.mode][i]])}</small></td></tr>`).join('');
  return `<dl class="sniper-stats">
    ${cell(tr('Влучань','Hits'),hits+'/'+n)}${cell(tr('Точність','Accuracy'),Math.round(100*hits/n)+'%')}${cell(tr('Бали','Score'),total+'/'+maxScore+badge(rec.score))}
    ${cell(tr('Час серії','Series time'),clock2(time))}${cell(tr('Влуч./хв','Hits/min'),hpm.toFixed(1)+badge(rec.hpm))}${cell(tr('Сер. постріл','Avg shot'),(time/n/1000).toFixed(1)+' '+tr('с','s'))}
    ${cell(tr('Найкращий','Best shot'),'#'+(bi+1)+' · '+shots[bi].ring)}${cell(tr('Найгірший','Worst shot'),'#'+(wi+1)+' · '+shots[wi].ring)}
   </dl>
   <button type="button" class="sniper-cta" data-expand>${tr('📊 Повний аналіз серії: траєкторії, швидкість, кучність','📊 Full series analysis: trajectories, velocity, grouping')}</button>
   <div class="sniper-results-body">
    <svg class="sniper-group" viewBox="-60 -60 120 120" width="120" height="120" role="img" aria-label="${tr('Розкид пострілів відносно допуску','Shot group relative to tolerance')}"><g class="rings">${rings}<path d="M-56 0H56M0-56V56"/></g>${marks}</svg>
    <table aria-label="${tr('Постріли серії','Series shots')}"><caption>${distLabel(distances[modeDistances[state.mode][0]])} · ${calibers[state.profile].name}</caption><thead><tr><th scope="col">#</th><th scope="col">${tr('Кільце','Ring')}</th><th scope="col">${tr('Час','Time')}</th><th scope="col">${tr('Відхилення','Deviation')}</th></tr></thead><tbody>${rows}</tbody></table>
   </div>
   ${analysisHtml(shots,model)}
   <p class="sniper-hint-note">${tr('Рекорд','Best')}: ${state.bestScore??0}/${maxScore} · ${(state.bestHpm??0).toFixed(1)} ${tr('влуч./хв','hits/min')}</p>`;
 }
 function render(){
  if(breath.on)cancelHold(false); // the button is about to be rebuilt
  const conditions=weather[state.weather],wnd=state.wind;
  const tutorial=state.tutorialDone!==true;
  const finalRound=!tutorial&&state.round===seriesSize-1;
  const caliber=calibers[state.profile];
  const tableRows=distances.map((d,i)=>{const T=tabOf(state.profile,i);return '<tr'+(i===state.distance?' class="is-current"':'')+'><td>'+distLabel(d)+'</td><td>'+T.elev.toFixed(1)+'</td><td>'+T.drift1.toFixed(2)+'</td><td>'+T.ht.toFixed(3)+'</td><td>'+T.sc.toFixed(2)+'</td></tr>'}).join('');
  const curT=tabOf(state.profile,state.distance),curW=weightsShown(curT).map(v=>v.toFixed(2)).join(' / ');
  const cur=curTab(),dragHint=tr('Перетягніть зображення, щоб навести мішень на сітку; колесо миші — кратність.','Drag the view to aim at the target; mouse wheel zooms.');
  const roundTitle=tutorial?tr('Навчальний раунд — спробуйте без балів','Tutorial round — practice, no score'):tr('Раунд ','Round ')+(state.round+1)+'/'+seriesSize;
  const pips=tutorial?'':Array.from({length:seriesSize},(_,i)=>{const v=state.series.scores[i];return`<li class="${v===undefined?(i===state.round?'is-now':''):v>0?'is-hit':'is-miss'}">${v??'·'}</li>`}).join('');
  const results=hasResults();
  const sel=state.series&&!tutorial&&state.roundDone&&state.round===seriesSize-1,
   canPick=tutorial||(!!state.series&&state.series.scores.length===0&&!state.roundDone)||!!sel,
   shownMode=sel&&state.pendingMode!==undefined?state.pendingMode:state.mode,shownProfile=sel&&state.pendingProfile!==undefined?state.pendingProfile:state.profile,shownWorld=sel&&state.pendingWorld!==undefined?state.pendingWorld:worldId,
   lockTip=tr('Дистанцію можна змінити до першого пострілу або після серії','Distance can be changed before the first shot or after the series'),
   pills=(attr,labels,cur,titles)=>labels.map((l,i)=>`<button type="button" data-${attr}="${i}" aria-pressed="${i===cur}"${titles?` title="${titles[i]}"`:''}>${l}</button>`).join(''),
   plan=seriesSize+' × '+distLabel(distances[modeDistances[state.mode][0]]),
   pickRows=!canPick?`<div class="sniper-pick-line" role="group" aria-label="${tr('Серія','Series')}"><span title="${lockTip}">${plan}</span><i class="sniper-dot" aria-hidden="true">·</i><span title="${tr('Калібр можна змінити до першого пострілу або після серії','Caliber can be changed before the first shot or after the series')}">${caliber.name}</span><i class="sniper-dot" aria-hidden="true">·</i><span class="sniper-world-now" title="${worldTip(worldId)}"><i class="wi wi-${worldId}" aria-hidden="true"></i> ${worldName().replace(/\s*\(g\s*=.*?\)\s*$/,'')}</span></div>`:
   `<div class="sniper-pick" role="group" aria-label="${tr('Дистанція','Distance')}"><span class="sniper-pick-label">${tr('Дистанція','Distance')}</span>${canPick?`<span class="sniper-pills">${pills('mode',modeLabels(),shownMode)}</span>`:`<span class="sniper-pick-plan" title="${lockTip}">${plan}</span>`}</div>
   <div class="sniper-pick" role="group" aria-label="${tr('Калібр','Caliber')}"><span class="sniper-pick-label">${tr('Калібр','Caliber')}</span>${canPick?`<span class="sniper-pills">${pills('profile',caliberShort,shownProfile,profiles)}</span>`:`<span class="sniper-pick-plan" title="${tr('Калібр можна змінити до першого пострілу або після серії','Caliber can be changed before the first shot or after the series')}">${caliber.name}</span>`}</div>
   <div class="sniper-pick" role="group" aria-label="${tr('Світ','World')}"><span class="sniper-pick-label">${tr('Світ','World')}</span>${canPick?`<span class="sniper-pills sniper-worlds">${WORLD_IDS.map(id=>`<button type="button" class="sniper-world-btn" data-world="${id}" aria-pressed="${shownWorld===id}" title="${worldTip(id)}" aria-label="${worldTip(id)}"><i class="wi wi-${id}" aria-hidden="true"></i></button>`).join('')}</span>`:`<span class="sniper-pick-plan sniper-world-now" title="${tr('Світ можна змінити до першого пострілу або після серії','The world can be changed before the first shot or after the series')}"><i class="wi wi-${worldId}" aria-hidden="true"></i> ${worldTip(worldId)}</span>`}</div>`;
  const axisLabel=(axis,text)=>`<label class="sniper-axis"><span>${axis==='x'?tr('Горизонталь, вітер (X)','Windage (X)'):tr('Вертикаль (Y)','Elevation (Y)')}</span><input type="range" min="${axis==='x'?-xMaxOf():0}" max="${axis==='x'?xMaxOf():yMaxOf()}" step="1" value="${state[axis]}" data-axis="${axis}" aria-label="${text}"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-number="${axis}" aria-label="${text}"></label>`;
  const tabDefs=[...results?[['results',tr('Результати','Results')]]:[],['table',tr('Таблиця','Table')],['method',tr('Як рахувати','How to solve')],['settings',tr('Налаштування','Settings')]];
  const panelAttrs=id=>`role="tabpanel" id="sniper-panel-${id}" aria-labelledby="sniper-tab-${id}" tabindex="0"${id===cur?'':' hidden'}`;
  analysisModal=null;
  root.innerHTML=`
   <header class="sniper-header"><div class="sniper-brand"><h1>${tr('Снайпер','Sniper')}</h1><small>POP SEASON</small></div>
    <nav>${languageButton()}<button type="button" data-sound aria-pressed="${!soundMuted()}" aria-label="${tr('Звук','Sound')}" title="${tr('Звук пострілів','Shot sound')}">${soundMuted()?'🔇':'🔊'}</button><button data-autoplay aria-pressed="${ap.on}">${apLabel()}</button><button data-exit>${tr('Нова гра','New game')}</button></nav>
   </header>
   <div class="sniper-layout">
    <section class="sniper-scene" aria-label="${tr('Вид в оптику','Scope view')}">
     <div class="sniper-stage">
      <div class="sniper-scope"><canvas width="${Math.round(viewSize*canvasScale())}" height="${Math.round(viewSize*canvasScale())}" aria-hidden="true" title="${dragHint}" aria-describedby="sniper-drag-desc"></canvas></div>
      <div class="sniper-hud sniper-hud-wind" aria-hidden="true">${hudWind(wnd)}</div>
      <div class="sniper-hud sniper-hud-turret" aria-hidden="true"></div>
      <div class="sniper-hud sniper-hud-plane" aria-hidden="true" hidden></div>
      <div class="sniper-hud sniper-breath" aria-hidden="true" hidden><span data-breath-label></span><i class="sniper-breath-bar"><b data-breath-fill></b></i></div>
      ${ap.on?apPanel():''}
     </div>
     <div class="sniper-reticle" role="group" aria-label="${tr('Сітка','Reticle')}">${optics.map((label,i)=>`<button type="button" class="sniper-thumb" data-optic="${i}" aria-pressed="${i===state.optic}" aria-label="${tr(...label)}" title="${tr(...label)}"><canvas aria-hidden="true"></canvas></button>`).join('')}</div>
     <span id="sniper-drag-desc" class="sniper-sr">${dragHint}</span>
     <div class="sniper-pad" role="group" aria-label="${tr('Налаштування оптики','Scope adjustment')}">
      <button type="button" data-step="x" data-delta="-10" aria-label="${tr('X −1 міл','X −1 mil')}">«</button>
      <button type="button" data-step="x" data-delta="-1" aria-label="${tr('X −0,1 міл','X −0.1 mil')}">‹</button>
      <button type="button" data-step="x" data-delta="1" aria-label="${tr('X +0,1 міл','X +0.1 mil')}">›</button>
      <button type="button" data-step="x" data-delta="10" aria-label="${tr('X +1 міл','X +1 mil')}">»</button>
      <button type="button" data-step="y" data-delta="10" aria-label="${tr('Y +1 міл (підйом вгору)','Y +1 mil (elevation up)')}">⇈</button>
      <button type="button" data-step="y" data-delta="1" aria-label="${tr('Y +0,1 міл (підйом вгору)','Y +0.1 mil (elevation up)')}">↑</button>
      <button type="button" data-step="y" data-delta="-1" aria-label="${tr('Y −0,1 міл (підйом вниз)','Y −0.1 mil (elevation down)')}">↓</button>
      <button type="button" data-step="y" data-delta="-10" aria-label="${tr('Y −1 міл (підйом вниз)','Y −1 mil (elevation down)')}">⇊</button>
     </div>
    </section>
    <aside class="sniper-console">
     <section class="sniper-status">
      <div class="sniper-status-row"><h2 class="sniper-round-title">${roundTitle}</h2>
       </div>
      ${pickRows}
       ${tutorial?'':`<div class="sniper-series-row"><ul class="sniper-pips" aria-label="${tr('Бали за постріли','Shot scores')}">${pips}</ul><span class="sniper-timer" data-timer role="timer" aria-label="${tr('Час серії','Series time')}">00:00</span></div>`}
      <p class="sniper-result" role="status"></p>
     </section>
     <section class="sniper-conditions">
      <h2 class="sniper-label">${tr('Умови','Conditions')}</h2>
      <dl class="sniper-weather">
       <div><dt>${tr('Вітер','Wind')}</dt><dd>${compass(wnd)}</dd></div>
       <div><dt>${tr('Прапорці','Flags')}</dt><dd>${flagPattern(wnd)}</dd></div>
       <div>${worldId==='earth'?`<dt>${tr('Вологість','Humidity')}</dt><dd>${conditions.humidity}%</dd>`:worldId==='mars'?`<dt>${tr('Тиск','Pressure')}</dt><dd>${tr('0,6 кПа','0.6 kPa')}</dd>`:worldId==='pyrrus'?`<dt>${tr('Тиск','Pressure')}</dt><dd>${tr('1,3 атм','1.3 atm')}</dd>`:worldId==='mesklin'?`<dt>${tr('Тиск','Pressure')}</dt><dd style="font-size:10px">${tr('водень, кілька атм','hydrogen, several atm')}</dd>`:`<dt>${tr('Атмосфера','Atmosphere')}</dt><dd>${tr('вакуум','vacuum')}</dd>`}</div>
      </dl>
     </section>
     <section class="sniper-calculator" title="${tr('Маховики вертикальних і бокових поправок, клік = 0,1 міл','Elevation and windage turrets, one click = 0.1 mil')}">
      <h2 class="sniper-label">${tr('Поправки прицілу','Scope turrets')}</h2>
      <div class="sniper-zoom"><span>${tr('Кратність','Zoom')}</span><button type="button" data-zoom-step="-1" aria-label="${tr('Зменшити кратність','Zoom out')}">−</button><input type="range" min="${zoomMin}" max="${zoomMax}" step="1" value="${state.zoom}" data-zoom aria-label="${tr('Кратність','Magnification')}"><button type="button" data-zoom-step="1" aria-label="${tr('Збільшити кратність','Zoom in')}">+</button><output data-zoom-out></output></div>
      ${axisLabel('x',tr('Бокова поправка X, міл','Windage turret X, mil'))}
      ${axisLabel('y',tr('Вертикальна поправка Y, міл','Elevation turret Y, mil'))}
      <div class="sniper-hints">
       ${tutorial?'':`<button type="button" class="sniper-ghost" data-check-axis>${tr('Перевірити X','Check X')}</button>
       <button type="button" class="sniper-ghost" data-code aria-expanded="false" aria-controls="sniper-answer" hidden>${tr('Показати повний код','Show full code')}</button>`}
       <button type="button" class="sniper-ghost" data-calc-toggle aria-expanded="${calc.open}" aria-controls="sniper-calc">${tr('Калькулятор','Calculator')}</button>
      </div>
      ${tutorial?'':`<p data-axis-feedback role="status" hidden></p>
      <p id="sniper-answer" data-answer hidden></p>`}
     </section>
     <section class="sniper-tabs">
      <div class="sniper-tablist" role="tablist" aria-label="${tr('Довідка','Reference')}">${tabDefs.map(([id,label])=>`<button type="button" role="tab" id="sniper-tab-${id}" data-tab="${id}" aria-controls="sniper-panel-${id}" aria-selected="${id===cur}" tabindex="${id===cur?0:-1}">${label}</button>`).join('')}</div>
      <div class="sniper-more-fade" data-more-fade hidden aria-hidden="true"></div><button type="button" class="sniper-more" data-more hidden></button>
      ${results?`<div class="sniper-results sniper-tabpanel" ${panelAttrs('results')}>${resultsHtml()}</div>`:''}
      <div class="sniper-field-table sniper-tabpanel" ${panelAttrs('table')}>
       <table aria-label="${tr('Балістична таблиця','Ballistic table')}">
        <thead><tr><th scope="col">${tr('Дистанція','Distance')}</th><th scope="col">${tr('Підйом, міл','Elevation, mil')}</th><th scope="col" title="${tr('Знос від 1 м/с повного бічного вітру (з 3 або 9 год)','Drift from 1 m/s of full crosswind (from 3 or 9 o\'clock)')}">${tr('Знос на 1 м/с, міл','Drift per 1 m/s, mil')}</th><th scope="col" title="${tr('Додатковий підйом на 1 м/с зустрічного вітру (з 12 год); попутний — з мінусом','Extra elevation for 1 m/s of headwind (from 12 o\'clock); a tailwind is negative')}">${tr('Зустр./попутний 1 м/с, міл','Head/tail 1 m/s, mil')}</th><th scope="col" title="${tr('Знос праворуч, тож поправка — від’ємний X: X = −(вітер + деривація + Коріоліс)','Both push the bullet right, so the correction is negative X: X = −(wind + spin + Coriolis)')}">${tr('Деривація + Коріоліс, міл','Spin + Coriolis, mil')}</th></tr></thead>
        <tbody>${tableRows}</tbody>
       </table>
       <p>${tr('Таблиця для вибраного калібру (балістика G7). Деривація й Коріоліс зносять кулю праворуч, тож X = −(вітер + деривація + Коріоліс). ','Table for the selected caliber (G7 ballistics). Spin drift and Coriolis both push the bullet right, so X = −(wind + spin + Coriolis). ')+worldCap()}<b>${tr('Вага прапорців для '+distLabel(distances[state.distance])+' (ближній / середній / дальній): ','Flag weights for '+distLabel(distances[state.distance])+' (near / middle / far): ')}${curW}</b></p>
      </div>
      <div class="sniper-method sniper-tabpanel" ${panelAttrs('method')}>
       <ol>${methodSteps()}</ol>
       ${tutorial?'':`<p class="sniper-hint-note">${tr('«Перевірити X» безкоштовна. Повний код або автогра знімають бал за раунд. У серії кожен постріл остаточний.','Check X is free. The full code or autoplay costs that round\'s point. In a series every shot is final.')}</p>`}
      </div>
      <div class="sniper-settings sniper-tabpanel" ${panelAttrs('settings')}>
       <fieldset class="sniper-plane sniper-speed-pick"><legend>${tr('Швидкість коментарів','Commentary speed')}</legend>
        <span class="sniper-speed-set">${apSpeeds.map(v=>`<label><input type="radio" name="sniper-apspeed" data-apspeed="${v}"${state.apSpeed===v?' checked':''}> ${speedLabel(v)}</label>`).join('')}</span>
       </fieldset>
       <fieldset class="sniper-plane"><legend>${tr('Площина сітки','Reticle plane')}</legend>
        <label><input type="radio" name="sniper-plane" data-plane="ffp"${state.plane==='ffp'?' checked':''}> ${tr('Сітка: перша фокальна площина (FFP)','Reticle: first focal plane (FFP)')}</label>
        <label><input type="radio" name="sniper-plane" data-plane="sfp"${state.plane==='sfp'?' checked':''}> ${tr('друга фокальна площина (SFP, калібрування 10×)','second focal plane (SFP, calibrated at 10×)')}</label>
       </fieldset>
      </div>
     </section>
     <div class="sniper-actions">
      <div class="sniper-fpv" role="group" aria-label="FPV" title="${tr('Авто: сповільнений політ кулі лише для «десятки» та промаху повз мішень; інакше — реальний час','Auto: slow-motion bullet flight only for a 10 or a complete miss; otherwise real time')}"><span>FPV</span><span class="sniper-pills">${[['auto',tr('Авто','Auto')],['always',tr('Завжди','Always')],['never',tr('Ніколи','Never')]].map(([v,l])=>`<button type="button" data-fpv="${v}" aria-pressed="${state.fpv===v}"${rt?' disabled':''}>${l}</button>`).join('')}</span></div>
      <button type="button" class="sniper-fire" data-fire aria-pressed="false" aria-keyshortcuts="Space"><span aria-hidden="true">⊕</span> ${tr('Постріл','Fire')}</button>
      <button type="button" class="sniper-next" data-next>${tutorial?tr('Почати серію','Start series'):finalRound?tr('Нова серія','New series'):tr('Наступний раунд','Next round')}</button>
     </div>
    </aside>
   </div>
   ${calcDrawer()}`;
  const scope=root.querySelector('.sniper-scope'),canvas=scope.querySelector('canvas');
  scopeRO?.disconnect();scopeRO=null;
  if(gl){
   scope.prepend(gl.canvas);
   const fit=()=>{try{gl.size(scope.clientWidth,scope.clientHeight);gl.draw(view())}catch(error){glFail(error)}};
   scopeRO=new ResizeObserver(fit);scopeRO.observe(scope);gl.size(scope.clientWidth,scope.clientHeight);
  }
  const turretHud=root.querySelector('.sniper-hud-turret');
  const sliders=[...root.querySelectorAll('[data-axis]')];
  const numbers=[...root.querySelectorAll('[data-number]')];
  const steps=[...root.querySelectorAll('[data-step]')];
  const opticButtons=[...root.querySelectorAll('[data-optic]')];
  opticButtons.forEach((b,i)=>paintThumb(b.querySelector('canvas'),i));
  const result=root.querySelector('.sniper-result');
  const next=root.querySelector('[data-next]');
  const fireButton=root.querySelector('[data-fire]');
  const feedback=root.querySelector('[data-axis-feedback]');
  const sol=solution(state),[targetX,targetY]=sol,tol=tolerance[state.distance];
  if(!tutorial){
   const codeButton=root.querySelector('[data-code]');
   const answer=root.querySelector('[data-answer]');
   root.querySelector('[data-check-axis]').onclick=()=>{
    takeover();
    feedback.hidden=false;
    feedback.textContent=Math.abs(targetX-state.x)<=tol?tr('Маховик бокових поправок (X) збігається.','Windage turret (X) matches.'):tr('Маховик бокових поправок (X) ще не збігається.','Windage turret (X) does not match yet.');
    codeButton.hidden=false;
   };
   codeButton.onclick=()=>{
    takeover();
    answer.hidden=!answer.hidden;
    codeButton.setAttribute('aria-expanded',String(!answer.hidden));
    codeButton.textContent=answer.hidden?tr('Показати повний код','Show full code'):tr('Сховати повний код','Hide full code');
    if(!answer.hidden){
     state.series.usedCode=true;save();
     answer.textContent=tr('Код мішені','Target code')+' · X '+signedMil(targetX)+' / Y '+mil(targetY);
    }
   };
  }

  function paint(){
   const complete=state.roundDone===true,shot=state.lastShot,busy=!!rt;
   drawScope(canvas,state,conditions,!!gl);
   if(gl){try{gl.draw(view());glStart()}catch(error){glFail(error)}}
   const zo=root.querySelector('[data-zoom-out]');if(zo)zo.textContent=state.zoom+'×';
   const zs=root.querySelector('[data-zoom]');if(zs)zs.value=state.zoom;
   for(const b of root.querySelectorAll('[data-zoom-step]'))b.disabled=state.zoom+Number(b.dataset.zoomStep)<zoomMin||state.zoom+Number(b.dataset.zoomStep)>zoomMax;
   paintTimer();
   if(turretHud)turretHud.innerHTML='X <b>'+signedMil(state.x)+'</b>&nbsp; Y <b>'+mil(state.y)+'</b>';
   for(const slider of sliders){
    slider.value=state[slider.dataset.axis];
    slider.disabled=complete||busy;
   }
   for(const number of numbers){
    if(document.activeElement!==number)number.value=(state[number.dataset.number]/10).toFixed(1);
    number.disabled=complete||busy;
   }
   for(const step of steps){
    const value=state[step.dataset.step];
    step.disabled=complete||busy||clampAxis(step.dataset.step,value+Number(step.dataset.delta))===value;
   }
   for(const b of root.querySelectorAll('[data-mode],[data-profile]'))b.disabled=busy||flying;
   for(const r of root.querySelectorAll('[data-world]'))r.disabled=busy||flying;
   for(const r of root.querySelectorAll('[data-plane]'))r.disabled=busy;
   const chip=root.querySelector('.sniper-hud-plane');
   if(chip){
    chip.hidden=state.plane!=='sfp';
    chip.textContent=state.zoom===10?tr('сітка точна (10×)','reticle true (10×)'):tr('1 поділка = ','1 mark = ')+(10/state.zoom).toFixed(2)+tr(' міл',' mil');
    chip.classList.toggle('is-true',state.zoom===10);
   }
   for(const hint of root.querySelectorAll('[data-check-axis],[data-code]'))hint.disabled=complete||busy;
   for(const button of opticButtons)button.disabled=complete;
   updateFire();root.dataset.aim=(state.aim.x+microNow().x).toFixed(2)+','+(state.aim.y+microNow().y).toFixed(2);
   const nextShown=complete&&(finalRound||tutorial); // other rounds advance on their own after Continue
   next.disabled=!nextShown;next.hidden=!nextShown;
   result.dataset.won=String(complete);
   let message=notice||tr('Знайдіть мішень, виставте X та Y, наведіть і стріляйте','Find the target, set X and Y, aim, then fire');
   if(complete&&shot){
    if(finalRound){
     const total=state.series.scores.reduce((a,b)=>a+b,0),n=state.series.unassisted.filter(Boolean).length;
     message=tr('Серію завершено · ','Series complete · ')+total+'/'+maxScore+' · '+tr('без підказок ','unassisted ')+n+'/'+seriesSize+
      (state.bestScore===undefined?'':' · '+tr('Рекорд','Best')+': '+state.bestScore+'/'+maxScore);
    }else if(!tutorial)message=shot.ring?tr('Влучання · ','Hit · ')+shot.ring+tr(' очок',' pts'):tr('Промах · 0 очок','Miss · 0 pts');
    else message=tr('Влучання · ','Hit · ')+shot.ring+tr(' очок',' pts')+(shot.ring>shot.score?' − '+(shot.ring-shot.score)+tr(' за промахи',' for misses'):'')+' = '+shot.score;
   }
   if(result.textContent!==message)result.textContent=message;
   paintCalc();
  }
  function setAlignment(x,y,force){
   if(state.roundDone||rt)return;
   x=clampAxis('x',x);y=clampAxis('y',y);
   if(x===state.x&&y===state.y)return;
   notice='';
   if(feedback&&x!==state.x){feedback.hidden=true;feedback.textContent=''}
   const dX=Math.abs(x-state.x),dY=Math.abs(y-state.y);
   state.x=x;state.y=y;
   if(dX)shotAudio.click('x',dX,airOf());
   if(dY)shotAudio.click('y',dY,airOf());
   save();paint();
  }
  function setAim(x,y){
   if(state.roundDone||rt)return;
   x=clampAim(Math.round(x));y=clampAim(Math.round(y));
   if(x===state.aim.x&&y===state.aim.y)return;
   state.aim={x,y};save();paint();
  }
  function setZoom(v,user=true){
   v=Math.max(zoomMin,Math.min(zoomMax,Math.round(v)));
   if(v===state.zoom)return;
   if(user)takeover();
   shotAudio.click('zoom',Math.abs(v-state.zoom),airOf());
   state.zoom=v;save();paint();
  }
  root.querySelector('[data-zoom]').oninput=event=>setZoom(Number(event.target.value));
  for(const b of root.querySelectorAll('[data-zoom-step]'))b.onclick=()=>setZoom(state.zoom+Number(b.dataset.zoomStep));
  let wheelAt=0;
  canvas.addEventListener('wheel',event=>{
   event.preventDefault();
   const now=performance.now();
   if(now-wheelAt<50||!event.deltaY)return;
   wheelAt=now;setZoom(state.zoom+(event.deltaY<0?1:-1));
  },{passive:false});
  for(const slider of sliders)slider.oninput=()=>{
   takeover();
   const value=Number(slider.value);
   if(slider.dataset.axis==='x')setAlignment(value,state.y);
   else setAlignment(state.x,value);
  };
  for(const slider of sliders)slider.onkeydown=event=>{
   const big=event.key==='PageUp'||event.shiftKey&&(event.key==='ArrowUp'||event.key==='ArrowRight')?10:
    event.key==='PageDown'||event.shiftKey&&(event.key==='ArrowDown'||event.key==='ArrowLeft')?-10:0;
   if(!big||event.ctrlKey||event.altKey||event.metaKey)return;
   takeover();
   event.preventDefault();
   if(slider.dataset.axis==='x')setAlignment(state.x+big,state.y);
   else setAlignment(state.x,state.y+big);
  };
  for(const number of numbers){
   const commit=()=>{
    takeover();
    const value=Math.round(parseFloat(number.value.trim().replace(/\s+/g,'').replace(/[−–—]/g,'-').replace(',','.'))*10);
    if(Number.isNaN(value))number.value=(state[number.dataset.number]/10).toFixed(1);
    else if(number.dataset.number==='x')setAlignment(value,state.y);
    else setAlignment(state.x,value);
    number.value=(state[number.dataset.number]/10).toFixed(1);
   };
   number.onchange=commit;
   number.onkeydown=event=>{if(event.key==='Enter')commit()};
  }
  for(const step of steps)step.onclick=()=>{
   takeover();
   const delta=Number(step.dataset.delta);
   if(step.dataset.step==='x')setAlignment(state.x+delta,state.y);
   else setAlignment(state.x,state.y+delta);
  };
  const aimStep=()=>uOf(state.zoom)*canvas.clientWidth/viewSize/10; // px per tenth of a mil
  let drag=null;
  canvas.onpointerdown=event=>{
   takeover();
   if(event.button!==0||state.roundDone||rt)return;
   drag={id:event.pointerId,left:event.clientX,top:event.clientY,x:state.aim.x,y:state.aim.y};
   dragging=true;canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove=event=>{
   if(drag?.id!==event.pointerId)return;
   const step=aimStep();
   setAim(drag.x+Math.round((event.clientX-drag.left)/step),drag.y-Math.round((event.clientY-drag.top)/step));
  };
  canvas.onlostpointercapture=()=>{drag=null;dragging=false;if(pendingRender){pendingRender=false;render()}};
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
   const v=Number(b.dataset.mode);
   takeover();
   if(tutorial){state.mode=v;state.distance=modeDistances[v][0];state.x=state.y=0;save();render();root.querySelector('[data-mode="'+v+'"]')?.focus();return}
   if(sel){state.pendingMode=v}
   else{if(v===state.mode)return;state.mode=v;startSeries();clock()}
   save();render();root.querySelector('[data-mode="'+v+'"]')?.focus();
  });
  root.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{
   const v=Number(b.dataset.profile);
   takeover();
   if(sel)state.pendingProfile=v;else{state.profile=v;state.x=state.y=0}
   save();render();root.querySelector('[data-profile="'+v+'"]')?.focus();
  });
  root.querySelectorAll('[data-world]').forEach(r=>r.onclick=()=>{
   const v=r.dataset.world;
   if(!validWorld(v))return;
   takeover();
   if(sel){if(v===worldId)delete state.pendingWorld;else state.pendingWorld=v}
   else if(v!==worldId){setWorld(v);state.world=v;state.x=state.y=0;state.aim=randomAim();holes.length=0;gl?.reset()}
   save();render();root.querySelector('[data-world="'+v+'"]')?.focus();
  });
  root.querySelectorAll('[data-plane]').forEach(r=>r.onchange=()=>{
   if(!r.checked)return;
   state.plane=r.dataset.plane==='sfp'?'sfp':'ffp';save();paint();
  });
  opticButtons.forEach((button,i)=>button.onclick=()=>{
   takeover();
   state.optic=i;state.x=state.y=0;
   save();render();root.querySelector('[data-optic="'+i+'"]').focus();
  });
  const tabs=[...root.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab,i)=>{
   tab.onclick=()=>selectTab(tab.dataset.tab);
   tab.onkeydown=event=>{
    const n=event.key==='ArrowRight'?(i+1)%tabs.length:event.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
    if(n<0||event.ctrlKey||event.altKey||event.metaKey)return;
    event.preventDefault();selectTab(tabs[n].dataset.tab);tabs[n].focus();
   };
  });
  root.querySelectorAll('[data-fpv]').forEach(b=>b.onclick=()=>{state.fpv=b.dataset.fpv;root.querySelectorAll('[data-fpv]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));save()});
  fireButton.onpointerdown=event=>{
   if(event.pointerType==='mouse'&&event.button!==0)return;
   event.preventDefault();
   if(!startHold())return;
   breath.id=event.pointerId;breath.sx=event.clientX;breath.sy=event.clientY;
   try{fireButton.setPointerCapture(event.pointerId)}catch{}
   fireButton.focus({preventScroll:true});
  };
  fireButton.onpointermove=event=>{
   if(!breath.on||breath.id!==event.pointerId)return;
   const step=aimStep();
   breath.pm.x=clampMicro((event.clientX-breath.sx)*microScale/step);breath.pm.y=clampMicro(-(event.clientY-breath.sy)*microScale/step); // 1/25 of the scope drag, tenths of a mil
   painter();
  };
  fireButton.onpointerup=event=>{if(breath.on&&breath.id===event.pointerId){try{fireButton.releasePointerCapture(event.pointerId)}catch{}releaseHold()}};
  fireButton.onpointercancel=event=>{if(breath.on&&breath.id===event.pointerId)cancelHold(false)};
  fireButton.onlostpointercapture=event=>{if(breath.on&&breath.id===event.pointerId)cancelHold(false)};
  fireButton.oncontextmenu=event=>event.preventDefault();
  fireButton.onkeydown=event=>{ // Enter on the focused button: instant shot with the current sway (accessibility fallback); Space is the global hold key
   if(event.key==='Enter'&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();if(!event.repeat&&!breath.on)fire()}
   else if(isSpace(event))event.preventDefault();
  };
  const expands=[...root.querySelectorAll('[data-expand]')];
  let expand=expands[0];
  for(const btn of expands)btn.onclick=()=>{
   expand=btn;
   analysisModal?.remove();
   const bg=document.createElement('div');analysisModal=bg;
   bg.className='sniper-modal-bg';
   bg.innerHTML=`<div class="sniper-modal" role="dialog" aria-modal="true" aria-label="${tr('Траєкторії','Trajectories')}" tabindex="-1"><div class="sa-head"><h3>${tr('Траєкторії','Trajectories')}</h3><button type="button" data-modal-close>${tr('Закрити','Close')}</button></div>${analysisHtml(state.series.shots,model,640,true)}</div>`;
   const close=()=>{bg.remove();if(analysisModal===bg)analysisModal=null;expand.focus?.()};
   bg.onclick=event=>{if(event.target===bg)close()};
   bg.onkeydown=event=>{if(event.key==='Escape'){event.stopPropagation();close()}};
   bg.querySelector('[data-modal-close]').onclick=close;
   root.append(bg);bg.querySelector('.sniper-modal').focus();
  };
  { // scroll affordance: fade + "more below" pill for any overflowing tab panel
   const tabs=root.querySelector('.sniper-tabs'),fade=root.querySelector('[data-more-fade]'),pill=root.querySelector('[data-more]');
   const panels=[...root.querySelectorAll('.sniper-tabpanel')];
   if(tabs&&fade&&pill){
    const active=()=>panels.find(p=>!p.hidden);
    const targets=p=>p.classList.contains('sniper-results')?[...p.querySelectorAll('.sniper-results-body table, .sa-sec')]:[];
    moreUpdate=()=>{
     const p=active(),more=!!p&&p.scrollHeight-p.clientHeight>6&&p.scrollTop+p.clientHeight<p.scrollHeight-6;
     fade.hidden=pill.hidden=!more;
     if(more){const res=p.classList.contains('sniper-results');pill.textContent=res?tr('↓ Ще нижче: таблиця пострілів, траєкторії','↓ More below: shot table, trajectories'):tr('↓ Прокрутіть нижче','↓ Scroll for more');fade.style.bottom='0';}
    };
    pill.onclick=()=>{
     const p=active();if(!p)return;
     const top=el=>el.getBoundingClientRect().top-p.getBoundingClientRect().top+p.scrollTop;
     const next=targets(p).map(top).find(t=>t>p.scrollTop+p.clientHeight*.5);
     const to=next!==undefined?next-4:p.scrollTop+p.clientHeight*.8;
     p.scrollTo({top:Math.min(to,p.scrollHeight),behavior:reduced()?'auto':'smooth'});
    };
    const ro=typeof ResizeObserver==='function'?new ResizeObserver(moreUpdate):null;
    for(const p of panels){p.addEventListener('scroll',moreUpdate,{passive:true});ro?.observe(p);for(const c of p.children)ro?.observe(c)}
    moreUpdate();requestAnimationFrame(moreUpdate);
   }
  }
  next.onclick=()=>{takeover();nextRound();root.querySelector('[data-axis="x"]').focus({preventScroll:true})};
  root.querySelector('[data-exit]').onclick=changeSide;
  root.querySelector('[data-autoplay]').onclick=()=>{if(ap.on)stopAutoplay();else startAutoplay()};
  root.querySelector('[data-sound]').onclick=e=>{const m=!soundMuted();setSoundMuted(m);e.currentTarget.textContent=m?'🔇':'🔊';e.currentTarget.setAttribute('aria-pressed',String(!m));if(!m)shotAudio.unlock()};
  const pauseButton=root.querySelector('[data-autoplay-pause]');
  if(pauseButton)pauseButton.onclick=togglePause;
  const speedButton=root.querySelector('[data-ap-speed]');
  if(speedButton)speedButton.onclick=()=>setApSpeed(apSpeeds[(apSpeeds.indexOf(state.apSpeed)+1)%apSpeeds.length]);
  root.querySelectorAll('[data-apspeed]').forEach(r=>r.onchange=()=>{if(r.checked)setApSpeed(Number(r.dataset.apspeed))});
  align=setAlignment;aimer=setAim;zoomer=setZoom;painter=paint;
  bindCalc();
  root.querySelector('[data-language]').onclick=()=>document.querySelector('.lang').click();
  paint();
  paintRt();
  paintAutoplay();
 }
 document.addEventListener('siege-language',()=>{if(dragging||flying)pendingRender=true;else render()});
 render();window.dispatchEvent(new Event('game-ready'));
 glLoad();
}


function drawScope(canvas,state,conditions,glMode){
 const c=canvas.getContext('2d'),size=viewSize,center=size/2,scale=canvas.width/viewSize,u=uOf(state.zoom),ur=state.plane==='sfp'?uOf(10):u; // image scale u; reticle scale ur (SFP: fixed at the 10× calibration)
 cssK=canvas.clientWidth>0?canvas.clientWidth/viewSize:1;
 c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,size,size);
 if(!glMode)drawFallback(c,state,conditions,size,center,u);
 const vignette=c.createRadialGradient(center,center,200,center,center,350);
 vignette.addColorStop(0,'#10170c00');vignette.addColorStop(1,'#071009a0');
 c.fillStyle=vignette;c.fillRect(0,0,size,size);
 c.globalAlpha=1;c.globalCompositeOperation='source-over';
 if(state.optic===0)drawTree(c,center,ur);
 else if(state.optic===1)drawDot(c,center,ur);
 else drawGrid(c,center,ur);
}

// 2D painting of the range: only used until the WebGL view loads or when WebGL is unavailable.
function drawFallback(c,state,conditions,size,center,u){
 const polygon=(color,points)=>{
  c.fillStyle=color;c.beginPath();c.moveTo(...points[0]);
  for(const point of points.slice(1))c.lineTo(...point);
  c.closePath();c.fill();
 };
 const edge=2000,far=size+edge,k=state.zoom/10,tx=center+state.aim.x/10*u,ty=center-state.aim.y/10*u;
 c.save();
 c.translate(tx,ty);c.scale(k,k);c.translate(-center,-center); // scene geometry is authored around the target at (350,350)
 const sky=c.createLinearGradient(0,0,0,440);
 sky.addColorStop(0,'#354f52');sky.addColorStop(1,'#bfbc95');
 c.fillStyle=sky;c.fillRect(-edge,-edge,size+2*edge,size+2*edge);
 polygon('#83907b',[[-edge,317],[0,317],[120,249],[198,264],[309,222],[448,268],[574,218],[700,250],[far,250],[far,460],[-edge,460]]);
 polygon('#5a6e55',[[-edge,357],[0,357],[115,305],[211,320],[312,286],[437,323],[550,284],[700,320],[far,320],[far,490],[-edge,490]]);
 polygon('#536145',[[-edge,401],[0,401],[127,375],[287,391],[462,361],[602,379],[700,373],[far,373],[far,far],[-edge,far]]);
 polygon('#8d8057',[[322,385],[371,385],[595+edge*.71,far],[70-edge*.8,far]]);
 polygon('#75724f',[[339,388],[353,388],[475+edge*.39,far],[206-edge*.43,far]]);
 c.strokeStyle='#d7c99466';c.lineWidth=2;
 for(let i=0;i<4;i++){
  const y=416+i*i*19;
  c.beginPath();c.moveTo(313-i*29,y);c.lineTo(384+i*29,y);c.stroke();
 }

 const wnd=state.wind,wdir=clockDir(wnd.clock);
 wnd.flags.forEach((strength,i)=>{ // sideways part of the wind sets the length (a head/tail wind is foreshortened); calm: limp cloth
  const x=185+i*165,y=415+(i%2)*55,dir=wdir.kz>=0?1:-1,ext=strength?(8+strength*8)*(.25+.75*Math.abs(wdir.kz)):4,hang=strength?3*(3-strength):16;
  c.strokeStyle='#292e22';c.lineWidth=3;
  c.beginPath();c.moveTo(x,y);c.lineTo(x,y-55);c.stroke();
  polygon('#f5ad53',[[x,y-55],[x+dir*ext,y-53+hang],[x,y-37]]);
 });
 c.restore();
 // The target keeps its true angular size: ring 1 = hit tolerance in mil.
 const radius=tolerance[state.distance]/10*u,x=tx,y=ty;
 if(x>-100&&x<size+100&&y>-100&&y<size+100){
  c.fillStyle='#2b3025';c.fillRect(x-radius*.12,y+radius,radius*.24,radius*1.5);
  c.beginPath();c.arc(x,y,radius*1.3,0,Math.PI*2);c.fillStyle='#1d241b';c.fill();
  for(const [factor,color] of [[1,'#ded4a6'],[.76,'#3b4c45'],[.48,'#ded4a6'],[.23,'#d87249']]){
   c.beginPath();c.arc(x,y,radius*factor,0,Math.PI*2);c.fillStyle=color;c.fill();
  }
 }
}

// ---- reticle level of detail: thresholds are on-screen px so marks never crowd or overlap ----
const skip=(spacing,u)=>{let m=1;while(spacing*m*u<6&&m<64)m*=2;return m}; // keep every m-th dot so dots stay >= 6 px apart
const lstep=(base,u)=>{for(const s of [1,2,4,5,10,20])if(s>=base&&s*u>=26)return s;return 0}; // mil step between labels, 0 = no labels
const lidx=spacing=>{for(const m of [1,2,3,4,5])if(m*spacing>=26)return m;return 0}; // every m-th labeled mark, 0 = none
const halo='#e8e4c81f',tHalo='#e8e4c840',ink='#0b100c',pTau=Math.PI*2;
let thinPx=1.4,haloOn=true,thumbMode=false;
// Reticle picker thumbnails: static mini renders (cached per DPR) drawn with the real reticle functions in a simplified LOD.
const thumbCache=new Map();
function paintThumb(canvas,i){
 const dpr=canvasScale(),key=dpr+'|'+tr('uk','en');
 let set=thumbCache.get(key);
 if(!set){thumbCache.clear();thumbCache.set(key,set=[])}
 if(!set[i]){
  const px=44,S=Math.round(px*dpr),o=document.createElement('canvas');o.width=o.height=S;
  const c=o.getContext('2d'),k=S/viewSize,center=viewSize/2;
  c.setTransform(k,0,0,k,0,0);
  c.save();c.beginPath();c.arc(center,center,center-1/k,0,pTau);c.clip();
  const bg=c.createRadialGradient(center,center,0,center,center,center);bg.addColorStop(0,'#c9c6a3');bg.addColorStop(1,'#8f9a7a');
  c.fillStyle=bg;c.fillRect(0,0,viewSize,viewSize);
  thumbMode=true;cssK=px/viewSize;
  try{(i===0?drawTree:i===1?drawDot:drawGrid)(c,center,[34,40,40][i])}finally{thumbMode=false}
  c.restore();
  c.setTransform(1,0,0,1,0,0);c.strokeStyle='#0b100c';c.lineWidth=1*dpr;c.beginPath();c.arc(S/2,S/2,S/2-.5*dpr,0,pTau);c.stroke();
  set[i]=o;
 }
 const o=set[i];canvas.width=o.width;canvas.height=o.height;canvas.getContext('2d').drawImage(o,0,0);
}
// Level of detail by px per mil: below 8 the lines thin to 1.2 px and lose their halo; below 10 the crosshair opens at the centre and the heavy posts start >= 30% of the scope radius out.
const lod=u=>{if(thumbMode){thinPx=.8;haloOn=false;return{low:false,gap:0,reach:r=>Math.min(r*u,viewSize*.3)}}thinPx=u<8?1.2:1.4;haloOn=u>=8;const low=u<10;return{low,gap:low?Math.max(8,1.2*u):0,reach:r=>low?Math.max(r*u,viewSize*.15):r*u}};
let cssK=1; // CSS px per view unit (scope is CSS-scaled; canvas DPR is already in the context transform)
// Collects the reticle, then paints every halo first and the dark ink on top, so halos never cover neighbouring lines.
function pen(c){
 const lines=new Map(),dots=new Map(),texts=[];
 const out=(x,y,r)=>Math.hypot(x-viewSize/2,y-viewSize/2)>viewSize/2+r;
 return{
  line(x1,y1,x2,y2,lw=1){
   if(Math.max(x1,x2)<-10||Math.min(x1,x2)>710||Math.max(y1,y2)<-10||Math.min(y1,y2)>710)return;
   if(thumbMode)lw=(lw<=1.4?.8:1.8)/cssK;else if(lw<=1.4)lw=thinPx/cssK;
   let p=lines.get(lw);if(!p)lines.set(lw,p=new Path2D());p.moveTo(x1,y1);p.lineTo(x2,y2);
  },
  dot(x,y,r=1.1){
   if(out(x,y,5))return;
   r=thumbMode?.65/cssK:Math.max(r,1.4/cssK);
   let d=dots.get(r);if(!d)dots.set(r,d={ink:new Path2D(),halo:new Path2D()});
   d.ink.moveTo(x+r,y);d.ink.arc(x,y,r,0,pTau);d.halo.moveTo(x+r+.5/cssK,y);d.halo.arc(x,y,r+.5/cssK,0,pTau);
  },
  text(t,x,y,font,align='center',base='middle'){if(!thumbMode&&!out(x,y,20))texts.push([t,x,y,font.startsWith('600')?font:'600 '+font,align,base])},
  flush(){
   c.save();c.globalAlpha=1;c.globalCompositeOperation='source-over';c.lineCap='butt';c.lineJoin='round';
   if(haloOn){c.strokeStyle=halo;for(const [lw,p] of lines){c.lineWidth=lw+1/cssK;c.stroke(p)}
   c.fillStyle=halo;for(const d of dots.values())c.fill(d.halo)}
   c.strokeStyle=ink;for(const [lw,p] of lines){c.lineWidth=lw;c.stroke(p)}
   c.fillStyle=ink;for(const d of dots.values())c.fill(d.ink);
   c.lineWidth=2/cssK;
   for(const [t,x,y,font,align,base] of texts){c.font=font;c.textAlign=align;c.textBaseline=base;c.strokeStyle=tHalo;c.strokeText(t,x,y);c.fillStyle=ink;c.fillText(t,x,y)}
   c.restore();
  }
 };
}

function drawGrid(c,center,u){
 const L=lod(u),g=L.gap,cx=center,cy=center,p=pen(c),{line,text}=p,w=k=>Math.round(1.5+k*0.95);
 const dot=(x,y,r)=>{if(!g||Math.hypot(x-cx,y-cy)>=g)p.dot(x,y,r)};
 const half=u/2>=6,one=u>=6,dm=skip(.5,u),rm=skip(1,u),lx=lstep(2,u),ly=lstep(1,u),font='10px system-ui',a=g||3;
 const rx=L.reach(15),ry=L.reach(10),ty=L.reach(10.5);
 const thickH=(a,b)=>{if(b>a)line(a,cy,b,cy,7)},thickV=(a,b)=>{if(b>a)line(cx,a,cx,b,7)};
 const len=i=>i%10===0?6:i%2===0?4:2,shown=i=>i%10===0||(i%2?half:one);
 for(let k=1;k<=10;k++){
  if(k%rm&&!(ly&&k%ly===0))continue;
  const y=cy+k*u;
  for(let i=2;i<=2*w(k);i++)for(const s of [-1,1]){
   const x=cx+s*i*u/2;
   if(i===4){if(!g||Math.hypot(x-cx,y-cy)>=g)line(x,y-3,x,y+3,1)}else if(i%dm===0)dot(x,y,1.1);
  }
 }
 line(cx-rx,cy,cx-a,cy);line(cx+a,cy,cx+rx,cy);
 line(cx,cy-a,cx,cy-ry);line(cx,cy+a,cx,cy+ry);
 for(let i=1;i<=30;i++)if(shown(i)&&i*u/2>=g)for(const s of [-1,1]){const x=cx+s*i*u/2,l=len(i);line(x,cy-l,x,cy+l)}
 for(let i=1;i<=20;i++)if((i%2?half:one)&&i*u/2>=g)for(const s of [-1,1]){const y=cy+s*i*u/2,l=i%2?2:4;line(cx-l,y,cx+l,y)}
 thickH(30,cx-rx);thickH(cx+rx,670);
 thickV(30,cy-ty);thickV(cy+ty,670);
 if(lx)for(let n=1;n<=14;n++)if(n%lx===0&&n*u>=g)for(const s of [-1,1])text(String(n),cx+s*n*u,cy-9,font,'center','bottom');
 if(ly)for(let k=2;k<=10;k++)if(k%ly===0)text(String(k),cx+8,cy-k*u,font,'left');
 if(ly)for(let k=1;k<=10;k++){
  if(k%ly)continue;
  const y=cy+k*u,x=(w(k)+0.9)*u;
  text(String(k),cx-x,y,font,'right');text(String(k),cx+x,y,font,'left');
 }
 p.dot(cx,cy,1.6);
 p.flush();
}

function drawDot(c,center,u){
 const L=lod(u),g=L.gap,cx=center,cy=center,p=pen(c),{line,text}=p,w=k=>Math.round(3+k*0.7);
 const dot=(x,y,r)=>{if(!g||Math.hypot(x-cx,y-cy)>=g)p.dot(x,y,r)};
 const half=u/2>=6,one=u>=6,rm=skip(1,u),lx=lstep(2,u),font='11px system-ui',a=g||4;
 const rx=L.reach(16),ru=L.reach(18),rd=L.reach(20);
 const thickH=(a,b)=>{if(b>a)line(a,cy,b,cy,7)},thickV=(a,b)=>{if(b>a)line(cx,a,cx,b,7)};
 for(let k=1;k<=20;k++){
  if(k%rm&&!(lx&&k%lx===0))continue;
  const n=Math.round(w(k)*(k%2?1:2))-(k%2?1:2)+1,st=k%2?u:u/2,m=skip(st/u,u);
  for(let j=0;j<n;j++)if(j%m===0||j===n-1)for(const s of [-1,1])dot(cx+s*(u+j*st),cy+k*u,j>=n-2?1.8:1.1);
 }
 line(cx-rx,cy,cx-a,cy);line(cx+a,cy,cx+rx,cy);
 line(cx,cy-a,cx,cy-ru);line(cx,cy+a,cx,cy+rd);
 for(let i=1;i<=20;i++)if((i%10===0||(i%2?half:one))&&i*u/2>=g)for(const s of [-1,1]){const x=i*u/2,l=i%2?2:4;line(cx+s*x,cy-l,cx+s*x,cy+l)}
 for(let i=1;i<=40;i++)if((i%10===0||(i%2?half:one))&&i*u/2>=g){const y=cy+i*u/2,l=i%2?2:4;line(cx-l,y,cx+l,y)}
 if(lx){
  for(let n=1;n<=10;n++)if(n%lx===0&&n*u>=g)for(const s of [-1,1])text(String(n),cx+s*n*u,cy-8,font,'center','bottom');
  for(let k=1;k<=20;k++)if(k%lx===0)text(String(k),cx+(w(k)+1.2)*u,cy+k*u,font,'left');
 }
 if(u>=8)text('MIL',cx+11*u,cy+8,font,'left','top');
 thickH(30,cx-rx);thickH(cx+rx,670);
 thickV(30,cy-ru);thickV(cy+rd,670);
 p.dot(cx,cy,g?1.6:1.8);
 p.flush();
}

function drawTree(c,center,u){
 const L=lod(u),g=L.gap,cx=center,cy=center,p=pen(c),{line,dot,text}=p,w=k=>Math.round(2+1.6*k);
 const bodyOff=2*u<16,sparse=!bodyOff&&2*u<24,rowOn=k=>!bodyOff&&(!sparse||k%2===0); // tree body: hidden below 16 px row spacing, every other row below 24 px
 const half=u/2>=6,one=u>=6,dm=skip(1,u),dm2=skip(2,u),lx=lstep(5,u),lm=lidx(2*u*(sparse?2:1));
 const rx=L.reach(21);
 const thickH=(a,b)=>{if(b>a)line(a,cy,b,cy,7)},thickV=(a,b)=>{if(b>a)line(cx,a,cx,b,7)};
 thickH(30,cx-rx);thickH(cx+rx,670);
 line(cx-rx,cy,cx-g,cy,1.2);line(cx+g,cy,cx+rx,cy,1.2);
 for(let i=-20;i<=20;i++){
  if(!i||Math.abs(i)*u<g)continue;
  const x=cx+i*u,five=!(i%5),l=five?5:2;
  if(five||one)line(x,cy-l,x,cy+l,1.2);
  if(five&&lx&&Math.abs(i)%lx===0)text(String(Math.abs(i)),x,cy-10,'600 12px system-ui');
  if(!bodyOff&&!(i%2)&&Math.abs(i/2)%dm2===0)dot(x,cy+1.5*u,1.6);
 }
 line(cx,cy-g,cx,cy-Math.max(14*u,L.low?viewSize*.15:0),1.2);
 for(let i=1;i<=14;i++){
  if(i*u<g)continue;
  const y=cy-i*u,five=!(i%5),l=five?5:2;
  if(five||one)line(cx-l,y,cx+l,y,1.2);
  if(five&&lx&&i%lx===0)text(String(i),cx+8,y,'600 12px system-ui','left');
 }
 if(!bodyOff){
  for(const s of [-1,1]){
   for(const m of [5,10]){
    const x=cx+s*m*u;
    line(x,cy-5*u,x,cy-2*u,4);
    if(lx&&m%lx===0)text(String(m),x,cy-5.6*u,'11px system-ui','center','bottom');
   }
   for(let m=5.5;m<10;m+=.5)if(m%1?half:one){const x=cx+s*m*u;line(x,cy-3.5*u,x,cy-2*u,1.2)}
  }
  for(let m=2;m<=14;m+=2){
   let deep=0;
   for(let k=1;k<=7;k++)if(rowOn(k)&&w(k)>=m)deep=k;
   if(deep)for(const s of [-1,1])line(cx+s*m*u,cy+2*u,cx+s*m*u,cy+deep*2*u,1.2);
  }
  for(let k=1;k<=7;k++){
   if(!rowOn(k))continue;
   const y=cy+k*2*u,wk=w(k);
   for(const s of [-1,1]){
    line(cx+s*2*u,y,cx+s*wk*u,y,1.2);
    for(let m=2;m<=wk;m++)if(m%dm===0)dot(cx+s*m*u,y,1.6);
   }
   if(lm&&k%lm===0){
    text(String(k*2),cx,y,'600 12px system-ui');
    text('H'+k,cx-(wk+1.2)*u,y,'11px system-ui','right');
    text('H'+k,cx+(wk+1.2)*u,y,'11px system-ui','left');
   }
   if(k<7&&one&&!sparse)line(cx-3,y+u,cx+3,y+u,1.2);
  }
  if(rowOn(8))for(const s of [-1,1])for(let m=2;m<=w(8);m++)if(m%dm===0)dot(cx+s*m*u,cy+16*u,1.6);
  if(u>=8)text('MRAD',cx-16*u,cy+3.5*u,'11px system-ui');
 }
 thickV(cy+L.reach(17.5),670);
 if(g)p.dot(cx,cy,1.6);
 p.flush();
}

// WebGL range view. Magnification = vertical field of view (so the reticle mil scale is exact), aim = camera rotation.
function createGL(T,buildWorld,holes){
 const canvas=document.createElement('canvas');canvas.className='sniper-gl';canvas.setAttribute('aria-hidden','true');
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,logarithmicDepthBuffer:true});
 if(!renderer.getContext())throw new Error('no gl');
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
 const camera=new T.PerspectiveCamera(10,1,.5,4500),aimAt=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3();
 camera.position.set(0,1.5,0);
 let world=null,key='',wind=[0,0,0];
 return{canvas,
  size(w,h){if(w>0&&h>0)renderer.setSize(w,h,false)},
  draw(state){
   const D=distances[state.distance],w=state.wind,tol=tolerance[state.distance],next=worldId+'|'+D+'|'+w.regime+w.clock+w.flags.join('')+'|'+tol+'|'+ring10[state.distance];
   if(next!==key){ // distance, weather or target size changed
    world?.dispose();world=null;
    world=buildWorld(T,{distance:D,wind:{regime:w.regime,clock:w.clock,flags:w.flags},targetRadiusM:tol/10*D/1000,ring10:ringFrac(state.distance),world:worldId});key=next;
    renderer.setClearColor(world.clearColor);world.setWind(wind);for(const h of holes)if(h.D===D)world.addHole(h);
   }
   camera.fov=2*Math.atan(viewSize/2/uOf(state.zoom)/1000)*180/Math.PI;camera.updateProjectionMatrix();
   camera.lookAt(world.targetCenter);camera.updateMatrixWorld();
   right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
   // the target must sit at +aim from the reticle centre, so the camera looks at -aim from the target (metres per tenth mil at D)
   const m=D/10000;
   aimAt.copy(world.targetCenter).addScaledVector(right,-state.aim.x*m).addScaledVector(up,-state.aim.y*m);
   camera.lookAt(aimAt);
   renderer.render(world.scene,camera);
  },
  setWind(g){wind=g;world?.setWind(g)},
  impact(h){world?.addImpact(h)},
  hole(h){world?.addHole(h)},
  reset(){key=''}, // rebuild the range (drops the old bullet holes) on the next draw
  update(dt){world?.update(dt)},
  dispose(){world?.dispose();world=null;renderer.dispose();renderer.forceContextLoss()}
 };
}
