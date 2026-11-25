// Point-mass exterior ballistics with G7 drag, shared by the game, the table, the 3D flight and the analysis. Pure: no DOM, no three.js.
// Frame: x downrange, y up, z lateral (right = +). Bore at the origin, the sight line is the horizontal y = sightHeight.
// Air: ICAO standard sea level, 15 C: density 1.225 kg/m3, speed of sound 340.3 m/s. Game gravity is deliberately g = 10 m/s2.
// Drag: a = (pi/8)*rho*Cd_G7(M)*v_rel^2 / BC_SI along the air-relative velocity, BC_SI = BC_G7[lb/in2]*703.07 kg/m2.
// Spin drift (right-hand twist, always right): Litz approximation SD[in] = 1.25*(SG+1.2)*t^1.83, SG ~ 2.0. Empirical, fine for a game.
// Coriolis: latitude 48 N, range pointing North (Eotvos term 0), deflection to the right = Omega*sin(lat)*D*t.

export const AIR={rho:1.225,sound:340.3};
export const OMEGA=7.292e-5;
export const GUST_DT=.25; // spacing (s) of stored gust paths

// Standard G7 drag coefficient vs Mach (public JPG/BRL G7 table).
export const G7=[[0,.1198],[.05,.1197],[.1,.1196],[.15,.1194],[.2,.1193],[.25,.1194],[.3,.1194],[.35,.1194],[.4,.1193],[.45,.1193],[.5,.1194],[.55,.1193],[.6,.1194],[.65,.1197],
 [.7,.1202],[.725,.1207],[.75,.1215],[.775,.1226],[.8,.1242],[.825,.1266],[.85,.1306],[.875,.1368],[.9,.1464],[.925,.166],[.95,.2054],[.975,.2993],[1,.3803],[1.025,.4015],
 [1.05,.4043],[1.075,.4034],[1.1,.4014],[1.125,.3987],[1.15,.3955],[1.2,.3884],[1.25,.381],[1.3,.3732],[1.35,.3657],[1.4,.358],[1.45,.351],[1.5,.344],[1.55,.3376],[1.6,.3315],
 [1.65,.326],[1.7,.3209],[1.75,.316],[1.8,.3117],[1.85,.3078],[1.9,.3042],[1.95,.301],[2,.298],[2.05,.2951],[2.1,.2922],[2.15,.2892],[2.2,.2864],[2.25,.2835],[2.3,.2807],
 [2.35,.2779],[2.4,.2752],[2.45,.2725],[2.5,.2697],[2.55,.267],[2.6,.2643],[2.65,.2615],[2.7,.2588],[2.75,.2561],[2.8,.2533],[2.85,.2506],[2.9,.2479],[2.95,.2451],[3,.2424],
 [3.1,.2368],[3.2,.2313],[3.3,.2258],[3.4,.2205],[3.5,.2154],[3.6,.2106],[3.7,.206],[3.8,.2017],[3.9,.1975],[4,.1935],[4.2,.1861],[4.4,.1793],[4.6,.173],[4.8,.1672],[5,.1618]];
// Exact piecewise-linear lookup (reference) and the fast resampled one used in the integrator (all knots are multiples of 0.005 Mach, so they agree exactly).
export const g7Cd=m=>{
 if(m<=0)return G7[0][1];
 if(m>=5)return G7[G7.length-1][1];
 let a=0,b=G7.length-1;while(b-a>1){const k=(a+b)>>1;G7[k][0]<=m?a=k:b=k}
 return G7[a][1]+(G7[b][1]-G7[a][1])*(m-G7[a][0])/(G7[b][0]-G7[a][0]);
};
const CD_STEP=.005,CD=Float64Array.from({length:1001},(_,i)=>g7Cd(i*CD_STEP));
const cdFast=m=>{const u=m/CD_STEP,i=u|0;return i>=1000?CD[1000]:CD[i]+(CD[i+1]-CD[i])*(u-i)};

// bc7: G7 ballistic coefficient, lb/in2. dia/len/twist: informational (bullet diameter and length in inches, twist in inches per turn). sg: gyroscopic stability for spin drift.
export const CALIBERS=[
 {name:'.338 Lapua Mag',v0:830,bc7:.38,sg:2,dia:.338,len:1.72,twist:10}, // 300 gr
 {name:'.375 CheyTac',v0:915,bc7:.46,sg:2,dia:.375,len:1.95,twist:10}, // 350 gr
 {name:'.416 Barrett',v0:990,bc7:.5,sg:2,dia:.416,len:2.1,twist:14}, // 395 gr
 {name:'.50 BMG',v0:860,bc7:.52,sg:2,dia:.51,len:2.3,twist:15}, // 750 gr A-MAX
];

// Ornstein-Uhlenbeck path: exact discrete update, n steps of dt from g0, stationary sigma, time constant tau. rng returns N(0,1).
export function ouPath(g0,sigma,tau,dt,n,rng){
 const a=Math.exp(-dt/tau),s=sigma*Math.sqrt(1-a*a),out=[g0];
 for(let i=1;i<n;i++)out.push(out[i-1]*a+s*rng());
 return out;
}
export const pathFn=(gp,dt)=>t=>{ // linear interpolation of a sampled path, clamped at the ends
 const u=Math.max(0,t)/dt,i=Math.min(gp.length-2,u|0);
 return gp.length<2?(gp[0]||0):gp[i]+(gp[i+1]-gp[i])*Math.min(1,u-i);
};

export function makeBallistics({gravity=10,sightHeight=.05,zeroRange=100,latitude=48,calibers=CALIBERS,distances=[300,500,1000,2000,3000]}={}){
 const K=Math.PI/8*AIR.rho,invSnd=1/AIR.sound,spin0=1.25*.0254,corK=OMEGA*Math.sin(latitude*Math.PI/180),A=new Float64Array(3);
 const spinM=(c,t)=>spin0*(c.sg+1.2)*t**1.83; // spin drift, metres, to the right
 const corM=(x,t)=>corK*x*t; // Coriolis deflection, metres, to the right
 // Core RK4 integrator to x = xStop. wf(x,t) = lateral wind speed (m/s, right +) or null. rec = {step,arr:{x,y,z,v,t}} records samples every step metres.
 function integrate(ci,theta,psi,dv0,wf,xStop,dt,rec){
  const c=calibers[ci],kk=K/(c.bc7*703.07),sp=c.v0+dv0,ct=Math.cos(theta);
  let x=0,y=0,z=0,vx=sp*ct*Math.cos(psi),vy=sp*Math.sin(theta),vz=sp*ct*Math.sin(psi),t=0,ns=0;
  const acc=(xx,tt,ux,uy,uz)=>{
   const rz=uz-(wf?wf(xx,tt):0),vr=Math.sqrt(ux*ux+uy*uy+rz*rz),k=kk*cdFast(vr*invSnd)*vr;
   A[0]=-k*ux;A[1]=-k*uy-gravity;A[2]=-k*rz;
  };
  const put=(i,f,px,py,pz,pvx,pvy,pvz,pt)=>{
   const a=rec.arr;
   a.x[i]=px+(x-px)*f;a.y[i]=py+(y-py)*f;a.z[i]=pz+(z-pz)*f;a.t[i]=pt+(t-pt)*f;
   a.v[i]=Math.hypot(pvx+(vx-pvx)*f,pvy+(vy-pvy)*f,pvz+(vz-pvz)*f);
  };
  if(rec){const a=rec.arr;a.x[0]=0;a.y[0]=0;a.z[0]=0;a.t[0]=0;a.v[0]=sp;ns=1}
  for(let it=0;x<xStop-1e-9&&it<200000&&vx>1;it++){
   const h=Math.min(dt,(xStop-x)/vx),px=x,py=y,pz=z,pvx=vx,pvy=vy,pvz=vz,pt=t;
   acc(x,t,vx,vy,vz);const a1x=A[0],a1y=A[1],a1z=A[2];
   const h2=h/2;
   acc(x+vx*h2,t+h2,vx+a1x*h2,vy+a1y*h2,vz+a1z*h2);const a2x=A[0],a2y=A[1],a2z=A[2],v2x=vx+a1x*h2,v2y=vy+a1y*h2,v2z=vz+a1z*h2;
   acc(x+v2x*h2,t+h2,vx+a2x*h2,vy+a2y*h2,vz+a2z*h2);const a3x=A[0],a3y=A[1],a3z=A[2],v3x=vx+a2x*h2,v3y=vy+a2y*h2,v3z=vz+a2z*h2;
   acc(x+v3x*h,t+h,vx+a3x*h,vy+a3y*h,vz+a3z*h);const a4x=A[0],a4y=A[1],a4z=A[2],v4x=vx+a3x*h,v4y=vy+a3y*h,v4z=vz+a3z*h;
   x+=h/6*(pvx+2*v2x+2*v3x+v4x);y+=h/6*(pvy+2*v2y+2*v3y+v4y);z+=h/6*(pvz+2*v2z+2*v3z+v4z);
   vx+=h/6*(a1x+2*a2x+2*a3x+a4x);vy+=h/6*(a1y+2*a2y+2*a3y+a4y);vz+=h/6*(a1z+2*a2z+2*a3z+a4z);t+=h;
   if(rec){const n=rec.n;while(ns<n&&ns*rec.step<=x+1e-9){put(ns,x>px?Math.min(1,(ns*rec.step-px)/(x-px)):1,px,py,pz,pvx,pvy,pvz,pt);ns++}}
  }
  return{x,y,z,vx,vy,vz,t,v:Math.hypot(vx,vy,vz)};
 }
 const TD=.002; // table / solver step; trajectories for shots use 1 ms
 // Bore angle (rad) at which the trajectory crosses the sight line y = sightHeight at range R (secant on the exact integration).
 function solveAngle(ci,R,guess,dt=TD){
  const f=th=>integrate(ci,th,0,0,null,R,dt).y-sightHeight;
  let a=guess??sightHeight/R+gravity*R/(2*calibers[ci].v0**2),fa=f(a),b=a+.0005,fb=f(b);
  for(let i=0;i<12&&Math.abs(fb)>1e-8;i++){
   const d=(fb-fa)/(b-a);if(!d)break;
   const c=b-fb/d;a=b;fa=fb;b=c;fb=f(b);
  }
  return b;
 }
 const zeros=calibers.map((c,ci)=>solveAngle(ci,zeroRange));
 const prof=(D,f)=>{const a=D*.25,b=D*.5,c=D*.75;return x=>x<=a?f[0]:x<=b?f[0]+(f[1]-f[0])*(x-a)/(b-a):x<=c?f[1]+(f[2]-f[1])*(x-b)/(c-b):f[2]};
 const mkWind=(D,w)=>{
  if(!w)return null;
  if(w.fn)return w.fn;
  const p=prof(D,w.flags||[0,0,0]),g=w.gust,r=w.res||0;
  return g?(x,t)=>p(x)+r+g(t):(x,t)=>p(x)+r;
 };
 const cache=new Map();
 function table(ci,D){
  const key=ci+'|'+D;let T=cache.get(key);if(T)return T;
  const th=solveAngle(ci,D,zeros[ci]+ (D>zeroRange?.0005*D/1000:0)),base=integrate(ci,th,0,0,null,D,TD),c=calibers[ci];
  const sens=[0,1,2].map(i=>{const f=[0,0,0];f[i]=1;return integrate(ci,th,0,0,mkWind(D,{flags:f}),D,TD).z/D*1000});
  const drift1=sens[0]+sens[1]+sens[2],weights=sens.map(s=>s/drift1);
  const dvy=(integrate(ci,th,0,1,null,D,TD).y-base.y)/D*1000; // mil per +1 m/s of muzzle velocity
  const spin=spinM(c,base.t)/D*1000,coriolis=1000*corK*base.t;
  T={elev:(th-zeros[ci])*1000,theta:th,drift1,sens,weights,spin,coriolis,sc:spin+coriolis,tof:base.t,vImpact:base.v,mach:base.v*invSnd,dvy,D};
  cache.set(key,T);return T;
 }
 // Full trajectory. opts: elevMil / windMil = turret dial plus any angular error (mil, from the zero), dv0, wind {flags:[3 signed m/s],gust:t=>m/s,res} or {fn:(x,t)=>m/s},
 // spinOn / coriolisOn (default true), beyond (extra metres to sample past D), dx (sample spacing), dt.
 function trajectory(ci,D,opts={}){
  const {elevMil=0,windMil=0,dv0=0,spinOn=true,coriolisOn=true,beyond=0,dx=5,dt=.001,wind=null}=opts,c=calibers[ci];
  const th=zeros[ci]+elevMil/1000,psi=windMil/1000,n=Math.round(D/dx),step=D/n,N=n+Math.ceil(beyond/step)+1;
  const arr={x:new Float64Array(N),y:new Float64Array(N),z:new Float64Array(N),v:new Float64Array(N),t:new Float64Array(N)};
  const end=integrate(ci,th,psi,dv0,mkWind(D,wind),(N-1)*step,dt,{step,n:N,arr});
  for(let i=0;i<N;i++)arr.x[i]=i*step;
  for(let i=0;i<N;i++){ // empirical add-ons: spin drift and Coriolis, both to the right
   if(spinOn)arr.z[i]+=spinM(c,arr.t[i]);
   if(coriolisOn)arr.z[i]+=corM(arr.x[i],arr.t[i]);
  }
  const iD=n;
  return{...arr,n:N,step,iD,D,sight:sightHeight,
   impact:{x:arr.z[iD]/D*1000,y:(arr.y[iD]-sightHeight)/D*1000},tof:arr.t[iD],vImpact:arr.v[iD],mach:arr.v[iD]*invSnd,end,
   spinMil:spinOn?spinM(c,arr.t[iD])/D*1000:0,corMil:coriolisOn?corM(D,arr.t[iD])/D*1000:0};
 }
 // Interpolated lookup of a sampled trajectory at range x: ballistics.at(path,'y',x).
 const at=(p,key,x)=>{const a=p[key],u=Math.max(0,Math.min(p.n-1,x/p.step)),i=Math.min(p.n-2,u|0);return a[i]+(a[i+1]-a[i])*(u-i)};
 // Inverse: range at flight time t.
 const xAt=(p,t)=>{const a=p.t;let lo=0,hi=p.n-1;if(t<=0)return 0;if(t>=a[hi])return p.x[hi];while(hi-lo>1){const m=(lo+hi)>>1;a[m]<=t?lo=m:hi=m}return p.x[lo]+(t-a[lo])/(a[hi]-a[lo])*(p.x[hi]-p.x[lo])};
 const api={calibers,gravity,sightHeight,zeroRange,latitude,rho:AIR.rho,sound:AIR.sound,distances,zero:ci=>zeros[ci]*1000,table,trajectory,at,xAt,integrate,prof,mkWind};
 for(let ci=0;ci<calibers.length;ci++)for(const D of distances)table(ci,D);
 return api;
}

export const ballistics=makeBallistics();
