import {tr} from './language.js';
import {pathFn,GUST_DT} from './sniper-ballistics.js';

// End-of-series trajectory analysis: pure SVG strings. Every shot's path is re-integrated with the shared G7 solver (M.B) from its saved dial, wind and gust path.
export const shotColors=['#e6c35c','#7fc3c0','#f08a6c','#a7c4ff','#c39ae6']; // categorical, colour-blind safe on the dark panel
const hyp=Math.hypot,MOA=3.4377;
let uid=0;
const nice=(lo,hi,n)=>{
 const raw=(hi-lo||1)/n,p=10**Math.floor(Math.log10(raw)),q=raw/p,st=(q<1.5?1:q<3?2:q<7?5:10)*p,t=[];
 for(let v=Math.ceil(lo/st-1e-9)*st;v<=hi+1e-9;v+=st)t.push(+v.toFixed(8));
 return{t,st};
};
const fmtTick=(v,st)=>(st>=1?String(Math.round(v)):v.toFixed(st>=.1?1:2)).replace('-','−');
const sg=(v,d=2)=>(v<0?'−':v>0?'+':'')+Math.abs(v).toFixed(d);
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const cmAt=(m,D)=>Math.round(m*D/10)+' '+tr('см','cm'); // mil → centimetres at the target
const dist=d=>d<1000?d+' '+tr('м','m'):d/1000+' '+tr('км','km');

// Greedy vertical nudge so direct labels do not overlap: items {x,y}, returns adjusted y.
function nudge(items,dx=46,gap=12){
 const placed=[];
 for(const it of items){let y=it.y;for(let k=0;k<12&&placed.some(p=>Math.abs(p.x-it.x)<dx&&Math.abs(p.y-y)<gap);k++)y-=gap;it.y=y;placed.push(it)}
 return items;
}

// Per-shot model: path functions and error components (all angular components in mil).
export function prepShots(shots,M){
 const {B,calibers,distances,weather,tolerance,tabOf,dirOf,flagMs}=M;
 return shots.flatMap((s,i)=>{
  const p=s.p,d=s.disp;
  if(!p||!d)return[];
  const c=calibers[p.ci],D=distances[p.di],w=weather[p.wi],dir=dirOf(w),T=tabOf(p.ci,p.di),flags=flagMs(w).map(v=>dir*v),ex=s.dx/10,ey=s.dy/10,gf=pathFn(d.gp,GUST_DT);
  // Re-integrate with the dial, the rifle and hold angles, the muzzle velocity and the shot's own gust path; the aim offset is not saved, so any remainder is spread linearly over the range to end exactly at the recorded impact.
  const ang={elevMil:p.y/10+d.rand.y+d.hold.y,windMil:p.x/10+d.rand.x+d.hold.x},act=B.trajectory(p.ci,D,{...ang,dv0:d.dv0,wind:{flags,gust:t=>dir*gf(t),res:dir*d.res},dx:D/60,dt:.002});
  const exp=B.trajectory(p.ci,D,{elevMil:p.y/10,windMil:p.x/10,wind:{flags},dx:D/60,dt:.002}); // what the dialled solution expects in the mean wind
  const rx=ex-act.impact.x,ry=ey-act.impact.y,gx=d.gx,gr=Number.isFinite(d.gustRead)?d.gustRead:null,gxR=gr===null?0:d.gxR,vy=d.vy;
  const px=ex-(gx+d.rand.x+d.hold.x),py=ey-(vy+d.rand.y+d.hold.y);
  return[{i,s,c,ci:p.ci,D,dir,ex,ey,color:shotColors[i%shotColors.length],
   h:x=>B.at(act,'y',x)-act.sight+x*ry/1000, // height above the line of sight, m; ends exactly at the recorded vertical impact
   lat:x=>B.at(act,'z',x)+x*rx/1000, // actual lateral path with the gust, spin drift and Coriolis, m
   exp:x=>B.at(exp,'z',x), // dialled windage in the mean wind only, m
   tof:act.tof,vD:act.vImpact,r:D*tolerance[p.di]/10000, // plate radius, m
   sc:T.sc,spin:T.spin,cor:T.coriolis,gxR,hasRead:gr!==null,px,
   comp:{gustR:[gxR,0],gustU:[gx-gxR,0],vel:[0,vy],rifle:[d.rand.x,d.rand.y],hold:[d.hold.x,d.hold.y],you:[px,py]}}];
 });
}

export function groupStats(P){
 const n=P.length,pts=P.map(q=>[q.ex,q.ey]),mx=pts.reduce((a,b)=>a+b[0],0)/n,my=pts.reduce((a,b)=>a+b[1],0)/n;
 const sd=k=>n>1?Math.sqrt(pts.reduce((a,b)=>a+(b[k]-(k?my:mx))**2,0)/(n-1)):0;
 let es=0,pair=[0,0];
 for(let a=0;a<n;a++)for(let b=a+1;b<n;b++){const e=hyp(pts[a][0]-pts[b][0],pts[a][1]-pts[b][1]);if(e>es){es=e;pair=[a,b]}}
 const rad=pts.map(q=>hyp(q[0]-mx,q[1]-my));
 const src=Object.fromEntries(['gustR','gustU','vel','rifle','hold','you'].map(k=>[k,Math.sqrt(P.reduce((a,q)=>a+q.comp[k][0]**2+q.comp[k][1]**2,0)/n)]));
 return{n,pts,mx,my,sdX:sd(0),sdY:sd(1),es,pair,meanR:rad.reduce((a,b)=>a+b,0)/n,cep:median(rad),src};
}

const srcName=()=>({gustR:tr('порив, видний по прапорцях','readable gust'),gustU:tr('невидимий залишок вітру','unreadable wind residual'),vel:tr('розкид швидкості','velocity spread'),rifle:tr('гвинтівка','rifle'),hold:tr('рука','hold'),you:tr('ваша поправка','your dial/aim')});

function insight(P,G){
 const names=srcName(),top=Object.entries(G.src).sort((a,b)=>b[1]-a[1])[0],v=top[1].toFixed(2),
  vert=Math.max(G.src.vel,G.src.rifle,G.src.hold),multi=new Set(P.map(q=>q.D)).size>1,off=hyp(G.mx,G.my);
 let a=top[0]==='you'?tr(`Найбільший внесок — ваша поправка (${v} міл RMS): перевірте розрахунок і наведення.`,`Biggest contribution is your dial/aim (${v} mil RMS): recheck the solution and the aim.`):
  tr(`Найбільший внесок — ${names[top[0]]} (${v} міл RMS).`,`Biggest contribution is the ${names[top[0]]} (${v} mil RMS).`);
 let b='';
 if(G.src.vel>=vert&&G.sdY>G.sdX&&multi)b=tr(' Вертикальний розкид росте з дистанцією через розкид швидкості.',' Vertical spread grows with distance because of the velocity spread.');
 else if(G.sdY>1.5*G.sdX)b=tr(' Розкид більший по вертикалі.',' The spread is larger vertically.');
 else if(G.sdX>1.5*G.sdY)b=tr(' Розкид більший по горизонталі — вітер.',' The spread is larger horizontally — wind.');
 else if(off>.15)b=tr(` Центр групи зміщений на ${off.toFixed(2)} міл — систематична похибка.`,` The group centre is ${off.toFixed(2)} mil off — a systematic error.`);
 const R=P.filter(q=>q.hasRead),rms=f=>Math.sqrt(R.reduce((t,q)=>t+f(q)**2,0)/R.length);
 if(R.length&&rms(q=>q.gxR)>.04){const rd=rms(q=>q.gxR),rem=rms(q=>q.gxR+q.px);b+=rem<.6*rd?tr(' Порив по прапорцях ви прочитали добре.',' You read the gust from the flags well.'):rem>1.2*rd?tr(' Порив по прапорцях зчитано невдало.',' The gust was misread from the flags.'):tr(' Порив по прапорцях зчитано частково.',' The gust was only partly read from the flags.')}
 return a+b;
}

// Plot frame: margins, scales, grid, tick labels, axis titles. o: {W,H,x,y,xl,yl,eq,r}
function frame(o){
 const m={l:44,r:o.r??16,t:12,b:38},pw=o.W-m.l-m.r,ph=o.H-m.t-m.b;
 let [x0,x1]=o.x;
 if(o.eq){const k=pw/ph*(o.y[1]-o.y[0])/2;x0=-k;x1=k}
 const sx=v=>m.l+(v-x0)/(x1-x0)*pw,sy=v=>m.t+ph-(v-o.y[0])/(o.y[1]-o.y[0])*ph,xt=nice(x0,x1,Math.max(3,Math.round(pw/80))),yt=nice(o.y[0],o.y[1],Math.max(3,Math.round(ph/42)));
 let g='';
 for(const v of yt.t)g+=`<line class="sa-gl" x1="${m.l}" x2="${m.l+pw}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/><text class="sa-t" x="${m.l-6}" y="${sy(v).toFixed(1)}" text-anchor="end" dominant-baseline="central">${fmtTick(v,yt.st)}</text>`;
 for(const v of xt.t)g+=`<line class="sa-gl" x1="${sx(v).toFixed(1)}" x2="${sx(v).toFixed(1)}" y1="${m.t}" y2="${m.t+ph}"/><text class="sa-t" x="${sx(v).toFixed(1)}" y="${m.t+ph+14}" text-anchor="middle">${fmtTick(v,xt.st)}</text>`;
 g+=`<text class="sa-t sa-ax" x="${m.l+pw/2}" y="${o.H-6}" text-anchor="middle">${o.xl}</text><text class="sa-t sa-ax" transform="translate(11 ${m.t+ph/2}) rotate(-90)" text-anchor="middle">${o.yl}</text>`;
 return{sx,sy,g,m,pw,ph};
}
const svg=(W,H,title,body)=>`<svg class="sa-chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;
const path=(pts,sx,sy)=>'M'+pts.map(p=>sx(p[0]).toFixed(1)+' '+sy(p[1]).toFixed(1)).join('L');
const samples=(D,fn,n=48)=>Array.from({length:n+1},(_,j)=>{const x=D*j/n;return[x,fn(x)]});
const plate=(f,q,x)=>{ // target plate span at the shot distance, at least 8 px tall
 const a=f.sy(q.r),b=f.sy(-q.r),mid=(a+b)/2,h=Math.max(Math.abs(b-a),8)/2;
 return`<line class="sa-plate" x1="${x}" x2="${x}" y1="${(mid-h).toFixed(1)}" y2="${(mid+h).toFixed(1)}"/>`;
};
const tip=q=>tr(`Постріл #${q.i+1} · ${dist(q.D)} · кільце ${q.s.ring}${q.s.hit?'':' (промах)'} · X ${sg(q.ex)} / Y ${sg(q.ey)} міл`,`Shot #${q.i+1} · ${dist(q.D)} · ring ${q.s.ring}${q.s.hit?'':' (miss)'} · X ${sg(q.ex)} / Y ${sg(q.ey)} mil`);
const dot=(x,y,q)=>q.s.hit?`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2" fill="${q.color}" stroke="#141b18" stroke-width="1.2"><title>${tip(q)}</title></circle>`:
 `<path d="M${(x-4).toFixed(1)} ${(y-4).toFixed(1)}l8 8m0-8l-8 8" stroke="${q.color}" stroke-width="2.2" fill="none"><title>${tip(q)}</title></path>`;

function side(P,W,H){
 const Dm=Math.max(...P.map(q=>q.D)),paths=P.map(q=>samples(q.D,q.h)),all=paths.flat().map(p=>p[1]),apex=paths.map(p=>p.reduce((b,v)=>v[1]>b[1]?v:b,[0,-1e9]));
 let hi=Math.max(...all,...P.map(q=>q.r))*1.18,lo=Math.min(0,...all,...P.map(q=>-q.r))*1.18;
 if(hi-lo<.5){hi=Math.max(hi,.25);lo=Math.min(lo,-.25)}
 const f=frame({W,H,x:[0,Dm*1.02],y:[lo,hi],xl:tr('Дистанція, м','Range, m'),yl:tr('Висота над лінією прицілювання, м','Height above line of sight, m'),r:30});
 let b=f.g+`<line class="sa-los" x1="${f.m.l}" x2="${f.m.l+f.pw}" y1="${f.sy(0)}" y2="${f.sy(0)}"/><text class="sa-t" x="${f.m.l+6}" y="${f.sy(0)+13}">${tr('лінія прицілювання','line of sight')}</text>`;
 P.forEach((q,k)=>{b+=`<path class="sa-line" d="${path(paths[k],f.sx,f.sy)}" stroke="${q.color}"/>${plate(f,q,f.sx(q.D))}`});
 const ap=nudge(P.map((q,k)=>({x:f.sx(apex[k][0]),y:f.sy(apex[k][1])-7,k})),50,11),en=nudge(P.map((q,k)=>({x:f.sx(q.D),y:f.sy(q.h(q.D)),k})).sort((a,b)=>a.y-b.y).reverse(),999,12);
 for(const a of ap){const q=P[a.k];b+=`<circle cx="${f.sx(apex[a.k][0]).toFixed(1)}" cy="${f.sy(apex[a.k][1]).toFixed(1)}" r="2" fill="${q.color}"/><text class="sa-t" x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" text-anchor="middle" fill="${q.color}">${apex[a.k][1].toFixed(apex[a.k][1]<10?1:0)} ${tr('м','m')}</text>`}
 for(const e of en){const q=P[e.k];b+=dot(f.sx(q.D),f.sy(q.h(q.D)),q)+`<text class="sa-t" x="${(f.sx(q.D)+8).toFixed(1)}" y="${e.y.toFixed(1)}" dominant-baseline="central" fill="${q.color}">#${q.i+1}</text>`}
 return svg(W,H,tr('Вигляд збоку: висота кулі над лінією прицілювання залежно від дистанції, з вершиною траєкторії та точками влучання','Side view: bullet height over the line of sight against range, with apex and impact points'),b);
}

function top(P,W,H){
 const Dm=Math.max(...P.map(q=>q.D)),act=P.map(q=>samples(q.D,q.lat)),exp=P.map(q=>samples(q.D,q.exp)),all=[...act,...exp].flat().map(p=>p[1]);
 let hi=Math.max(0,...all,...P.map(q=>q.r))*1.2,lo=Math.min(0,...all,...P.map(q=>-q.r))*1.2;
 if(hi-lo<.5){hi=Math.max(hi,.25);lo=Math.min(lo,-.25)}
 const f=frame({W,H,x:[0,Dm*1.02],y:[lo,hi],xl:tr('Дистанція, м','Range, m'),yl:tr('Бічне зміщення, м (+ праворуч)','Lateral, m (+ right)'),r:30});
 let b=f.g+`<line class="sa-los" x1="${f.m.l}" x2="${f.m.l+f.pw}" y1="${f.sy(0)}" y2="${f.sy(0)}"/>`;
 P.forEach((q,k)=>{b+=`<path class="sa-line sa-exp" d="${path(exp[k],f.sx,f.sy)}" stroke="${q.color}"/><path class="sa-line" d="${path(act[k],f.sx,f.sy)}" stroke="${q.color}"/>${plate(f,q,f.sx(q.D))}`});
 const en=nudge(P.map((q,k)=>({x:f.sx(q.D),y:f.sy(q.lat(q.D)),k})).sort((a,b)=>a.y-b.y).reverse(),999,12);
 for(const e of en){const q=P[e.k];b+=dot(f.sx(q.D),f.sy(q.lat(q.D)),q)+`<text class="sa-t" x="${(f.sx(q.D)+8).toFixed(1)}" y="${e.y.toFixed(1)}" dominant-baseline="central" fill="${q.color}">#${q.i+1}</text>`}
 return svg(W,H,tr('Вигляд зверху: бічне зміщення кулі; пунктир — очікуване від середнього вітру, суцільна — фактичне з поривом','Top view: lateral bullet path; dashed = expected from the mean wind, solid = actual with the gust'),b);
}

function velocity(P,W,H,M){
 const {B}=M,Dm=Math.max(...P.map(q=>q.D)),cis=[...new Set(P.map(q=>q.ci))],cals=cis.map(ci=>M.calibers[ci]),vmax=Math.max(...cals.map(c=>c.v0))*1.05,SOUND=B.sound;
 const f=frame({W,H,x:[0,Dm*1.02],y:[0,vmax],xl:tr('Дистанція, м','Range, m'),yl:tr('Швидкість, м/с','Velocity, m/s'),r:16});
 let b=f.g+(SOUND?`<rect class="sa-trans" x="${f.m.l}" y="${f.sy(SOUND*1.175).toFixed(1)}" width="${f.pw}" height="${(f.sy(SOUND*.88)-f.sy(SOUND*1.175)).toFixed(1)}"><title>${tr(`Трансзвукова зона ${Math.round(SOUND*.88)}–${Math.round(SOUND*1.175)} м/с`,`Transonic zone ${Math.round(SOUND*.88)}–${Math.round(SOUND*1.175)} m/s`)}</title></rect>`:'')+`${SOUND?`<line class="sa-sound" x1="${f.m.l}" x2="${f.m.l+f.pw}" y1="${f.sy(SOUND).toFixed(1)}" y2="${f.sy(SOUND).toFixed(1)}"/><text class="sa-t sa-warn" x="${f.m.l+6}" y="${(f.sy(SOUND)-5).toFixed(1)}">${tr(`звуковий бар’єр ${SOUND} м/с`,`sound barrier ${SOUND} m/s`)}</text>`:''}`;
 const lab=[];
 cals.forEach((c,k)=>{
  const nom=B.trajectory(cis[k],Dm,{dx:Dm/80,dt:.002});
  b+=`<path class="sa-vel" d="${path(samples(Dm,x=>B.at(nom,'v',x),40),f.sx,f.sy)}" stroke-dasharray="${k?'5 3':'none'}"/>`;
  lab.push({x:f.m.l+4,y:f.sy(c.v0)-8,t:c.name,a:'start',c:'var(--sniper-ink)'});
 });
 for(const q of P)lab.push({x:f.sx(q.D),y:f.sy(q.vD)-9,t:`#${q.i+1} · ${q.tof.toFixed(1)} ${tr('с','s')}`,a:q.D>Dm*.7?'end':'start',c:q.color,q});
 nudge(lab,70,12);
 for(const l of lab){if(l.q)b+=`<circle cx="${f.sx(l.q.D).toFixed(1)}" cy="${f.sy(l.q.vD).toFixed(1)}" r="4" fill="${l.q.color}" stroke="#141b18" stroke-width="1.2"><title>${tr(`Постріл #${l.q.i+1} · ${dist(l.q.D)} · ${l.q.vD.toFixed(0)} м/с · політ ${l.q.tof.toFixed(2)} с`,`Shot #${l.q.i+1} · ${dist(l.q.D)} · ${l.q.vD.toFixed(0)} m/s · flight ${l.q.tof.toFixed(2)} s`)}</title></circle>`;
  b+=`<text class="sa-t" x="${(l.q?f.sx(l.q.D)+(l.a==='end'?-7:7):l.x).toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="${l.a}" fill="${l.c}">${l.t}</text>`}
 return svg(W,H,tr('Швидкість кулі залежно від дистанції з позначками пострілів, звуковим бар’єром і часом польоту','Bullet velocity against range with shot markers, sound barrier and time of flight'),b);
}

function groupPlot(P,G,W){
 const H=Math.round(W*.72),maxP=Math.max(...G.pts.map(p=>Math.max(Math.abs(p[0]),Math.abs(p[1]))),.2),R=Math.max(.4,maxP*1.4),
  f=frame({W,H,x:[-R,R],y:[-R,R],eq:true,xl:tr('X, міл (+ праворуч)','X, mil (+ right)'),yl:tr('Y, міл (+ вгору)','Y, mil (+ up)'),r:16}),rp=v=>v/(2*R)*f.ph;
 let b=f.g+`<line class="sa-los" x1="${f.m.l}" x2="${f.m.l+f.pw}" y1="${f.sy(0)}" y2="${f.sy(0)}"/><line class="sa-los" x1="${f.sx(0)}" x2="${f.sx(0)}" y1="${f.m.t}" y2="${f.m.t+f.ph}"/>`;
 const tols=[...new Set(P.map(q=>q.s.p.di))].map(di=>[di,P.find(q=>q.s.p.di===di)]).map(([,q])=>[q.r/q.D*1000,q.D]);
 for(const [t,D] of tols)if(t<R*1.05)b+=`<circle class="sa-tol" cx="${f.sx(0)}" cy="${f.sy(0)}" r="${rp(t).toFixed(1)}"><title>${tr('Край плити','Plate edge')} ${dist(D)} · ${t.toFixed(2)} ${tr('міл','mil')}</title></circle><text class="sa-t" x="${f.sx(0).toFixed(1)}" y="${(f.sy(0)-rp(t)-3).toFixed(1)}" text-anchor="middle">${dist(D)}</text>`;
 const cx=f.sx(G.mx),cy=f.sy(G.my);
 b+=`<circle class="sa-cep" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rp(G.cep).toFixed(1)}"><title>CEP50 ${G.cep.toFixed(2)} ${tr('міл','mil')}</title></circle>`;
 if(G.n>1){const [a,c]=G.pair;b+=`<line class="sa-es" x1="${f.sx(G.pts[a][0]).toFixed(1)}" y1="${f.sy(G.pts[a][1]).toFixed(1)}" x2="${f.sx(G.pts[c][0]).toFixed(1)}" y2="${f.sy(G.pts[c][1]).toFixed(1)}"><title>ES ${G.es.toFixed(2)} ${tr('міл','mil')}</title></line>`}
 b+=`<path class="sa-mpi" d="M${cx-7} ${cy}h14M${cx} ${cy-7}v14"><title>MPI X ${sg(G.mx)} / Y ${sg(G.my)} ${tr('міл','mil')}</title></path>`;
 for(const q of P)b+=dot(f.sx(q.ex),f.sy(q.ey),q)+`<text class="sa-t" x="${(f.sx(q.ex)+7).toFixed(1)}" y="${(f.sy(q.ey)-6).toFixed(1)}" fill="${q.color}">${q.i+1}</text>`;
 return svg(W,H,tr('Група: усі влучання відносно точки прицілювання в міліанах, з центром групи, CEP50 і крайнім розкидом','Group: all impacts relative to the aim point in mil, with centre of group, CEP50 and extreme spread'),b);
}

function bars(G,W){
 const names=srcName(),rows=Object.entries(G.src).sort((a,b)=>b[1]-a[1]),max=Math.max(...rows.map(r=>r[1]),.01),lw=Math.round(W*.34),rh=24,H=rows.length*rh+8,bw=W-lw-52;
 const b=rows.map(([k,v],j)=>`<text class="sa-t sa-lbl" x="${lw-8}" y="${j*rh+rh/2+4}" text-anchor="end">${names[k]}</text><rect class="sa-bar${j?'':' is-top'}" x="${lw}" y="${j*rh+5}" width="${Math.max(2,v/max*bw).toFixed(1)}" height="${rh-10}" rx="3"><title>${names[k]} · ${v.toFixed(2)} ${tr('міл RMS','mil RMS')}</title></rect><text class="sa-t" x="${(lw+Math.max(2,v/max*bw)+6).toFixed(1)}" y="${j*rh+rh/2+4}">${v.toFixed(2)}</text>`).join('');
 return svg(W,H,tr('Середній внесок джерел розкиду, міл RMS','Average contribution of each error source, mil RMS'),b);
}

function spinNote(P){
 return`<p class="sa-note">${tr('Деривація + Коріоліс (завжди вправо, вже в таблиці): ','Spin drift + Coriolis (always right, already in the table): ')}${P.map(q=>`#${q.i+1} ${dist(q.D)} ${q.sc.toFixed(2)} ${tr('міл','mil')} (${q.spin.toFixed(2)} + ${q.cor.toFixed(2)})`).join(' · ')}</p>`;
}

function windRead(P){
 const R=P.filter(q=>q.hasRead);
 if(!R.length)return'';
 const rows=R.map(q=>`<tr><td><span class="sa-dot" style="background:${q.color}"></span>#${q.i+1}</td><td>${sg(q.gxR)}</td><td>${sg(q.px)}</td><td>${sg(q.gxR+q.px)}</td></tr>`).join('');
 return`<table class="sa-tbl" aria-label="${tr('Читання вітру','Wind reading')}"><thead><tr><th scope="col">#</th><th scope="col">${tr('Порив, міл','Gust, mil')}</th><th scope="col">${tr('Ваша корекція','Your correction')}</th><th scope="col">${tr('Залишок','Left over')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Whole analysis block. W = viewBox width of each chart; wide = the larger modal layout.
export function analysisHtml(shots,M,W=420,wide=false){
 const P=prepShots(shots,M);
 if(!P.length)return'';
 const G=groupStats(P),H=Math.round(W*.55),fig=(t,sub,body)=>`<figure class="sa-fig"><figcaption>${t}${sub?`<small>${sub}</small>`:''}</figcaption>${body}</figure>`,
  cell=(l,v)=>`<div><dt>${l}</dt><dd>${v}</dd></div>`,
  one=new Set(P.map(q=>q.D)).size===1,cm=v=>one?' · '+cmAt(v,P[0].D):''; // one distance per series: metric size at the target as a secondary label
 const legend=`<ul class="sa-legend">${P.map(q=>`<li><span class="sa-dot" style="background:${q.color}"></span>#${q.i+1} ${dist(q.D)} · ${q.s.ring}${q.s.hit?'':' ×'}</li>`).join('')}</ul>`;
 const stats=`<dl class="sniper-stats sa-stats">
  ${cell(tr('Крайній розкид (ES)','Extreme spread (ES)'),G.es.toFixed(2)+' '+tr('міл','mil')+' · ≈ '+(G.es*MOA).toFixed(1)+' MOA'+cm(G.es))}
  ${cell(tr('Середній радіус','Mean radius'),G.meanR.toFixed(2)+' '+tr('міл','mil')+cm(G.meanR))}
  ${cell('CEP50',G.cep.toFixed(2)+' '+tr('міл','mil')+cm(G.cep))}
  ${cell(tr('Центр групи (MPI)','Mean point of impact'),'X '+sg(G.mx)+' / Y '+sg(G.my))}
  ${cell(tr('Станд. відхилення X','Std dev X'),G.sdX.toFixed(2)+' '+tr('міл','mil'))}
  ${cell(tr('Станд. відхилення Y','Std dev Y'),G.sdY.toFixed(2)+' '+tr('міл','mil'))}</dl>`;
 const body=`${legend}<div class="sa-grid">
  ${fig(tr('Вигляд збоку','Side view'),tr('висота над лінією прицілювання','height over the line of sight'),side(P,W,H))}
  ${fig(tr('Вигляд зверху','Top view'),tr('суцільна — фактично, пунктир — очікувано від вітру','solid = actual, dashed = expected from wind'),top(P,W,H))}
  ${fig(tr('Швидкість кулі','Bullet velocity'),tr('звуковий бар’єр і час польоту','sound barrier and time of flight'),velocity(P,W,H,M))}
  ${G.n>1?fig(tr('Кучність','Group'),tr('міліани відносно точки прицілювання','mil relative to the aim point'),stats+groupPlot(P,G,W)):''}
  ${fig(tr('Джерела розкиду','Error sources'),tr('середній внесок, міл RMS','average contribution, mil RMS'),bars(G,W)+windRead(P)+spinNote(P))}
  </div><p class="sa-insight">${insight(P,G)}</p>`;
 return wide?body:`<section class="sa-sec" aria-label="${tr('Траєкторії','Trajectories')}"><div class="sa-head"><h3>${tr('Траєкторії','Trajectories')}</h3><button type="button" data-expand>${tr('Розгорнути','Expand')}</button></div>${body}</section>`;
}
