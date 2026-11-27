import './sniper-flight.css';
import {buildWorld,moundOf,targetY} from './sniper-world.js';
import {ballistics as BAL,clockDir} from './sniper-ballistics.js';

const sm=t=>(t=t<0?0:t>1?1:t,t*t*(3-2*t)),mix=(a,b,t)=>a+(b-a)*t,rnd=(a=0,b=1)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const sg=v=>{const r=Math.round(v*10)/10;return(r<0?'−':'+')+Math.abs(r).toFixed(1)};
const TAU=Math.PI*2;

const hit=o=>!!o.hit;
// Path + time schedule (no three.js). The path is the shared G7 solver trajectory (o.path, or computed here from o.ci/aimMil/wind); the end is nudged by a linear angle so it lands exactly on the recorded impact.
// World: +z downrange, +y up, world x = -(lateral right) so a camera looking +z sees +lateral on screen right.
function modelOf(o){
 const D=o.distance,R1=o.targetRadiusMil*D/1000,Y0=1.5,Ty=targetY(R1),W=o.wind||{};
 const wv=clockDir(W.clock||9),wm=(W.flags||[0,0,0]).map(f=>f?BAL.world.flagMs[f-1]:0);
 const path=o.path||BAL.trajectory(o.ci??1,D,{elevMil:o.aimMil.y,windMil:o.aimMil.x,wind:{flags:wm,kx:wv.kx,kz:wv.kz},beyond:60});
 const tOf=x=>BAL.at(path,'t',x),xOf=t=>BAL.xAt(path,t),vOf=x=>BAL.at(path,'v',x),H0=x=>BAL.at(path,'y',x),L0=x=>BAL.at(path,'z',x);
 const th=Math.atan2(path.y[1]-path.y[0],path.step),ps=Math.atan2(path.z[1]-path.z[0],path.step);
 const ix=o.impactMil.x*D/1000,iy=o.impactMil.y*D/1000,TD=tOf(D),ay=(Ty-Y0+iy-H0(D))/D,ax=(ix-L0(D))/D;
 const P=(x,out={})=>{out.x=-(L0(x)+ax*x);out.y=Y0+H0(x)+ay*x;out.z=x;return out};
 const mound=moundOf(D,R1);
 const hE=(x,z)=>{const u=(x/mound.a)**2+((z-mound.cz)/mound.b)**2;return u<1?mound.h*Math.sqrt(1-u):-1};
 let endX=D,kind='plate';
 if(!hit(o)){
  kind='air';endX=D+3;const q={};
  for(let x=1;x<D+60;x+=.25){P(x,q);if(q.y<=.02||(q.z>D&&hE(q.x,q.z)>0&&q.y<=hE(q.x,q.z))){endX=x;kind='dirt';break}}
 }
 const sEnd=tOf(endX)/TD,fz=[.25,.5,.75].map(f=>D*f),fsig=Math.max(15,D*.03);
  // Uniform playback: ONE constant time scale (dur / real time of flight) for the whole muzzle->target flight, so the visible deceleration is only the real physics. No slow-mo, no warps.
 const dur=clamp(3*TD,2.5,8),total=dur*sEnd,sAt=t=>t<=0?0:t>=total?sEnd:t/dur;
 return{tOf,xOf,vOf,P,endX,kind,sEnd,TD,ix,iy,th,ps,ay,ax,mound,fsig,sched:{dur,total,sAt}};
}
/** Pure schedule helper: sAt(tau) = flight progress (1 = at target distance) after tau wall seconds; sAt(total) = impact. */
export function flightSchedule(o){const m=modelOf(o);return{total:m.sched.total,sEnd:m.sEnd,endX:m.endX,kind:m.kind,sAt:m.sched.sAt}}

export async function playFlight(host,o){
 const tr=o.tr||((u,e)=>e),prev=document.activeElement,hit=!!o.hit;
 const root=document.createElement('div');
 root.className='sniper-flight';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
 root.setAttribute('aria-label',tr('Політ кулі','Bullet flight'));
 root.innerHTML=`<canvas class="sf-canvas" aria-hidden="true"></canvas>
 <div class="sf-hud" aria-hidden="true"><div><small>${tr('Дистанція','Distance')}</small><b data-d>0 ${tr('м','m')}</b></div><div><small>${tr('Швидкість','Velocity')}</small><b data-v>0 ${tr('м/с','m/s')}</b></div><div><small>${tr('Час','Time')}</small><b data-t>0.00 ${tr('с','s')}</b></div></div>
 <button type="button" class="sf-skip">${tr('Пропустити','Skip')}</button>
 <section class="sf-score" hidden role="status"><div class="sf-ring">${o.ring}</div><div class="sf-label ${hit?'is-hit':'is-miss'}">${hit?tr('Влучання','Hit'):tr('Промах','Miss')}</div><p class="sf-off">${tr('Відхилення: ','Offset: ')}X ${sg(o.impactMil.x)} / Y ${sg(o.impactMil.y)} ${tr('міл','mil')}</p>${o.note?`<p class="sf-note"></p>`:''}<button type="button" class="sf-go">${tr('Далі','Continue')}</button></section>`;
 host.append(root);
 const $=s=>root.querySelector(s),canvas=$('.sf-canvas'),hud=$('.sf-hud'),skipB=$('.sf-skip'),score=$('.sf-score'),goB=$('.sf-go'),noteP=$('.sf-note');if(noteP)noteP.textContent=o.note;
 const hd=$('[data-d]'),hv=$('[data-v]'),ht=$('[data-t]');
 let closed=false,final=false,ctl=null,raf=0,autoT=0,last=0,resolve;
 const done=new Promise(r=>resolve=r);
 const reduced=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);

 const close=()=>{
  if(closed)return;closed=true;cancelAnimationFrame(raf);clearTimeout(autoT);
  removeEventListener('keydown',onKey,true);removeEventListener('resize',onResize);
  try{ctl?.dispose()}catch{}
  root.remove();
  try{prev?.focus?.({preventScroll:true})}catch{}
  resolve();
 };
 const showFinal=()=>{
  if(final||closed)return;final=true;
  hud.hidden=true;skipB.hidden=true;score.hidden=false;goB.focus();
  if(o.autoClose>0)autoT=setTimeout(close,o.autoClose*1000);
 };
 const crash=err=>{console.error(err);cancelAnimationFrame(raf);showFinal()};
 const skip=()=>{if(final)return;if(ctl){try{ctl.skip()}catch(err){crash(err)}}else showFinal()};
 const onKey=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();final?close():skip()}
  else if(e.key===' '&&!final){e.preventDefault();e.stopImmediatePropagation();skip()}
  else if(e.key==='Tab'){e.preventDefault();(final?goB:skipB).focus()}
 };
 const onResize=()=>{try{ctl?.resize()}catch(err){crash(err)}};
 addEventListener('keydown',onKey,true);addEventListener('resize',onResize);
 skipB.onclick=skip;goB.onclick=close;skipB.focus();

 let T=null;
 try{T=await import('three')}catch{}
 if(closed)return done;
 if(T){
  try{ctl=scene3d(T,o,root,canvas,showFinal,(x,v,t)=>{hd.textContent=Math.round(x)+' '+tr('м','m');hv.textContent=Math.round(v)+' '+tr('м/с','m/s');ht.textContent=t.toFixed(2)+' '+tr('с','s')})}
  catch(e){try{ctl?.dispose()}catch{}ctl=null;console.warn('sniper-flight: WebGL unavailable',e)}
 }
 if(!ctl){root.classList.add('sf-nogl');canvas.remove();showFinal();return done}
 try{ctl.resize();if(reduced)ctl.skip()}catch(err){crash(err);return done}
 const loop=t=>{
  if(closed)return;
  const dt=Math.min(.05,last?(t-last)/1000:0);last=t;
  try{ctl.tick(dt)}catch(err){crash(err);return}
  raf=requestAnimationFrame(loop);
 };
 raf=requestAnimationFrame(loop);
 return done;
}

function scene3d(T,o,root,canvas,onFinal,onHud){
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
 const D=o.distance,{v0}=o.caliber,g=o.gravity,R1=o.targetRadiusMil*D/1000,Y0=1.5,Ty=targetY(R1);
 const W=o.wind||{},cc=new T.Color();

 const M=modelOf(o),{tOf,xOf,vOf,P,endX,sEnd,TD,sched,ix,iy,th,ps,ay,ax,mound,fsig}=M,dur=sched.total;let kind=M.kind;
 const E=P(endX,V());
 const C=V(-ix,Math.max(.1,Ty+iy),D); // bullet's crossing of the target plane: used for final framing + marker; E (ground/berm) only for debris
 const woodD=Math.min(Math.hypot(E.x,E.z-D-.06),Math.hypot(Math.abs(E.x)-R1-.3,E.z-D-.25));
 if(kind==='dirt'&&woodD<.4&&E.y<Ty+R1+.2)kind='wood';

 // ---- renderer / scene ----
 const renderer=new T.WebGLRenderer({canvas,antialias:true,logarithmicDepthBuffer:true});
 if(!renderer.getContext())throw new Error('no gl');
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
 const world=buildWorld(T,{distance:D,wind:W,targetRadiusM:R1,ring10:o.ring10,world:o.world}),{scene,sky,plate:pl,flags,lam,add,tex}=world;
 renderer.setClearColor(world.clearColor);
 const cam=new T.PerspectiveCamera(50,1,.05,4500);
 const uS={value:600};
 const glowTex=tex(64,64,(c,w)=>{const gr=c.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'#fff');gr.addColorStop(.3,'#ffd9a0cc');gr.addColorStop(1,'#ff8a3000');c.fillStyle=gr;c.fillRect(0,0,w,w)});


 // ---- rifle muzzle ----
 const dark=lam(0x1c211d),steel=lam(0x2e3631);
 const rifle=new T.Group();rifle.position.set(0,Y0,0);rifle.rotation.order='YXZ';
 rifle.rotation.set(-(th+ay),-(ps+ax),0);scene.add(rifle);
 const cylZ=(r,len,m,x,y,z)=>add(rifle,new T.CylinderGeometry(r,r,len,12).rotateX(Math.PI/2),m,x,y,z);
 cylZ(.014,1.1,steel,0,0,-.55);cylZ(.024,.14,dark,0,0,-.07);
 [-.03,-.07,-.11].forEach(z=>cylZ(.026,.012,lam(0x4a544d),0,0,z));
 add(rifle,new T.BoxGeometry(.07,.07,.55),dark,0,-.05,-.6);add(rifle,new T.BoxGeometry(.08,.1,.35),dark,0,-.02,-1.2);
 cylZ(.03,.35,dark,0,.09,-1.15);add(rifle,new T.BoxGeometry(.06,.14,.45),lam(0x3a2f24),0,-.08,-1.6);

 // ---- chronograph ----
 const chrono=new T.Group();chrono.position.set(0,0,4);scene.add(chrono);
 const metal=lam(0x3b4540);
 [[.5,.0],[-.25,.43],[-.25,-.43]].forEach(([x,z])=>{
  const dv=V(x,-1.3,z),m=add(chrono,new T.CylinderGeometry(.015,.015,dv.length(),6),metal,x/2,1.3-.65,z/2);m.quaternion.setFromUnitVectors(V(0,1,0),dv.normalize());
 });
 add(chrono,new T.BoxGeometry(.06,.06,.8),metal,0,1.33,0);
 [-.3,.3].forEach(z=>{[-.12,.12].forEach(x=>add(chrono,new T.BoxGeometry(.03,.3,.03),dark,x,1.48,z));add(chrono,new T.BoxGeometry(.27,.03,.03),dark,0,1.34,z)});
 add(chrono,new T.BoxGeometry(.64,.34,.06),dark,.52,1.44,0);
 const lcdC=document.createElement('canvas');lcdC.width=256;lcdC.height=128;
 const lcdT=new T.CanvasTexture(lcdC);lcdT.colorSpace=T.SRGBColorSpace;
 const lcd=(txt)=>{const c=lcdC.getContext('2d');c.fillStyle='#1b2a1f';c.fillRect(0,0,256,128);c.fillStyle='#d6d69a';c.textAlign='center';c.font='bold 22px monospace';
  c.fillText(String(o.caliber.name||'').slice(0,18),128,38);c.font='bold 44px monospace';c.fillText(txt,128,96);lcdT.needsUpdate=true};
 lcd('-- '+'m/s');
 const lcdM=add(chrono,new T.PlaneGeometry(.56,.28),new T.MeshBasicMaterial({map:lcdT}),.52,1.44,-.035);lcdM.rotation.y=Math.PI-.18;
 const lcdAt=o.caliber.v0;

 // hit decal / off-target marker
 const hr=Math.max(.015,R1*.035);
 if(hit(o)){
  const d=add(pl,new T.CircleGeometry(hr,16),new T.MeshBasicMaterial({color:0x0b0f0c}),-ix,iy-R1,-.026);d.rotation.y=Math.PI;
  const rm=add(pl,new T.RingGeometry(hr,hr*1.6,16),new T.MeshBasicMaterial({color:0xcfd2c0,transparent:true,opacity:.75}),-ix,iy-R1,-.025);rm.rotation.y=Math.PI;
 }
 for(const h of o.holes||[]){ // earlier hits of this series
  const e=add(pl,new T.CircleGeometry(hr,16),new T.MeshBasicMaterial({color:0x0b0f0c}),-h.lat,h.dy-R1,-.026);e.rotation.y=Math.PI;
 }
 const ms=Math.max(.24,R1*.32);
 const marker=add(scene,new T.PlaneGeometry(ms,ms),new T.MeshBasicMaterial({map:tex(128,128,(c)=>{c.beginPath();c.arc(64,64,48,0,TAU);c.moveTo(34,34);c.lineTo(94,94);c.moveTo(94,34);c.lineTo(34,94);c.lineJoin=c.lineCap='round';c.strokeStyle='#10130f';c.lineWidth=22;c.stroke();c.strokeStyle='#ff8a1f';c.lineWidth=11;c.stroke()}),transparent:true,depthWrite:false}),C.x,C.y,D-.1);
 marker.rotation.y=Math.PI;marker.visible=false;

 // ---- bullet ----
 const bul=new T.Group();scene.add(bul);
 const bGeo=new T.LatheGeometry([[0,0],[.0035,0],[.0043,.004],[.0043,.016],[.004,.021],[.003,.027],[.0016,.031],[0,.034]].map(p=>new T.Vector2(p[0],p[1])),28);
 bGeo.translate(0,-.017,0);bGeo.rotateX(Math.PI/2);
 // jacket texture: dark copper with 6 bright helical rifling engravings on the bearing surface (profile points 2..3 = v 2/7..3/7)
 const rifTex=tex(512,512,(c,w,h)=>{
  c.fillStyle='#8a5526';c.fillRect(0,0,w,h);
  const y0=h*(1-3/7),y1=h*(1-2/7);c.fillStyle='#a3652d';c.fillRect(0,y0,w,y1-y0);
  c.lineCap='round';
  for(let n=0;n<6;n++)for(const dx of[-w,0,w]){
   const xa=n/6*w+dx;c.strokeStyle='#ffe0a6';c.lineWidth=7;c.beginPath();c.moveTo(xa,y1);c.lineTo(xa+w*.3,y0);c.stroke();
   c.strokeStyle='#ffffffaa';c.lineWidth=2;c.beginPath();c.moveTo(xa-1,y1);c.lineTo(xa+w*.3-1,y0);c.stroke()}
 });
 rifTex.wrapS=T.RepeatWrapping;
 const bMesh=add(bul,bGeo,new T.MeshPhongMaterial({map:rifTex,specular:0xffe2a0,shininess:90}));
 bMesh.scale.setScalar(5);
 const glow=new T.Sprite(new T.SpriteMaterial({map:glowTex,blending:T.AdditiveBlending,transparent:true,depthWrite:false,opacity:.7}));glow.scale.setScalar(.45);bul.add(glow);
 const TN=24,tPos=new Float32Array(TN*3),tCol=new Float32Array(TN*3);
 for(let i=0;i<TN;i++){const f=Math.pow(1-i/(TN-1),2);tCol.set([1*f,.62*f,.28*f],i*3)}
 const tg=new T.BufferGeometry();tg.setAttribute('position',new T.BufferAttribute(tPos,3));tg.setAttribute('color',new T.BufferAttribute(tCol,3));
 const trail=new T.Line(tg,new T.LineBasicMaterial({vertexColors:true,blending:T.AdditiveBlending,transparent:true,depthWrite:false,fog:false}));trail.frustumCulled=false;scene.add(trail);

 // ---- particles ----
 const mkPts=(N,additive)=>{
  const pos=new Float32Array(N*3),col=new Float32Array(N*4),size=new Float32Array(N),vel=new Float32Array(N*3),life=new Float32Array(N).fill(0),age=new Float32Array(N),a0=new Float32Array(N),s0=new Float32Array(N),gr=new Float32Array(N),dr=new Float32Array(N),gw=new Float32Array(N);
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('col',new T.BufferAttribute(col,4));geo.setAttribute('size',new T.BufferAttribute(size,1));
  const mat=new T.ShaderMaterial({uniforms:{uS},transparent:true,depthWrite:false,blending:additive?T.AdditiveBlending:T.NormalBlending,
   vertexShader:`#include <common>
#include <logdepthbuf_pars_vertex>
attribute float size;attribute vec4 col;varying vec4 vC;uniform float uS;
void main(){vC=col;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*uS/max(.1,-mv.z);gl_Position=projectionMatrix*mv;
#include <logdepthbuf_vertex>
}`,
   fragmentShader:`#include <common>
#include <logdepthbuf_pars_fragment>
varying vec4 vC;
void main(){
#include <logdepthbuf_fragment>
float a=smoothstep(1.,.2,length(gl_PointCoord-.5)*2.)*vC.a;if(a<.003)discard;gl_FragColor=vec4(vC.rgb,a);
#include <colorspace_fragment>
}`});
  const mesh=new T.Points(geo,mat);mesh.frustumCulled=false;scene.add(mesh);let n=0;
  const c=new T.Color();
  return{mesh,
   add(p,v,hex,a,s,l,o2={}){const i=n++%N;pos.set(p,i*3);vel.set(v,i*3);c.setHex(hex);col.set([c.r,c.g,c.b,a],i*4);a0[i]=a;s0[i]=s;size[i]=s;life[i]=l;age[i]=0;gr[i]=o2.g||0;dr[i]=o2.drag||0;gw[i]=o2.grow||0},
   update(dt){for(let i=0;i<N;i++){if(life[i]<=0)continue;age[i]+=dt;const u=age[i]/life[i];
     if(u>=1){life[i]=0;size[i]=0;col[i*4+3]=0;continue}
     const f=Math.exp(-dr[i]*dt);vel[i*3]*=f;vel[i*3+1]=vel[i*3+1]*f-gr[i]*dt;vel[i*3+2]*=f;
     for(let q=0;q<3;q++)pos[i*3+q]+=vel[i*3+q]*dt;
     if(pos[i*3+1]<0){pos[i*3+1]=0;vel[i*3+1]*=-.3}
     size[i]=s0[i]*(1+gw[i]*u);col[i*4+3]=a0[i]*(1-u)}
    geo.attributes.position.needsUpdate=geo.attributes.col.needsUpdate=geo.attributes.size.needsUpdate=true},
   clear(){life.fill(0);size.fill(0);col.fill(0);geo.attributes.size.needsUpdate=geo.attributes.col.needsUpdate=true}};
 };
 const sparks=mkPts(420,true),dust=mkPts(560,false);
 const BN=200,boxes=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshLambertMaterial(),BN);boxes.frustumCulled=false;
 boxes.instanceMatrix.setUsage(T.DynamicDrawUsage);
 const bp=new Float32Array(BN*3),bv=new Float32Array(BN*3),br=new Float32Array(BN*3),bw=new Float32Array(BN*3),bsz=new Float32Array(BN*3),bl=new Float32Array(BN),ba=new Float32Array(BN);
 const dm=new T.Object3D();let bn=0;
 for(let i=0;i<BN;i++){boxes.setColorAt(i,cc.setHex(0xffffff));dm.scale.setScalar(0);dm.updateMatrix();boxes.setMatrixAt(i,dm.matrix)}
 scene.add(boxes);
 const addBox=(p,v,s,hex,l)=>{const i=bn++%BN;bp.set(p,i*3);bv.set(v,i*3);br.set([rnd(0,TAU),rnd(0,TAU),rnd(0,TAU)],i*3);bw.set([rnd(-12,12),rnd(-12,12),rnd(-12,12)],i*3);bsz.set(s,i*3);bl[i]=l;ba[i]=0;boxes.setColorAt(i,cc.setHex(hex));boxes.instanceColor.needsUpdate=true};
 const boxUpd=dt=>{for(let i=0;i<BN;i++){if(bl[i]<=0)continue;ba[i]+=dt;
   if(ba[i]>=bl[i]){bl[i]=0;dm.scale.setScalar(0);dm.updateMatrix();boxes.setMatrixAt(i,dm.matrix);continue}
   const rest=bp[i*3+1]<=bsz[i*3+1]*.5&&Math.abs(bv[i*3+1])<.5;
   if(!rest){bv[i*3+1]-=g*dt;for(let q=0;q<3;q++){bp[i*3+q]+=bv[i*3+q]*dt;br[i*3+q]+=bw[i*3+q]*dt}
    if(bp[i*3+1]<bsz[i*3+1]*.5){bp[i*3+1]=bsz[i*3+1]*.5;bv[i*3+1]*=-.3;bv[i*3]*=.6;bv[i*3+2]*=.6;for(let q=0;q<3;q++)bw[i*3+q]*=.5}}
   const f=Math.min(1,(bl[i]-ba[i])/.5);dm.position.set(bp[i*3],bp[i*3+1],bp[i*3+2]);dm.rotation.set(br[i*3],br[i*3+1],br[i*3+2]);dm.scale.set(bsz[i*3]*f,bsz[i*3+1]*f,bsz[i*3+2]*f);dm.updateMatrix();boxes.setMatrixAt(i,dm.matrix)}
  boxes.instanceMatrix.needsUpdate=true};
 const flashL=new T.PointLight(0xffc880,0,30,2);flashL.position.set(0,Y0,.4);scene.add(flashL);
 const flashS=new T.Sprite(new T.SpriteMaterial({map:glowTex,blending:T.AdditiveBlending,transparent:true,depthWrite:false,fog:false}));flashS.position.set(0,Y0,.35);flashS.scale.setScalar(0);scene.add(flashS);

 // ---- events ----
 const fire=()=>{
  flashL.intensity=14;flashS.scale.setScalar(1.6);
  for(let i=0;i<16;i++)dust.add([rnd(-.1,.1),Y0+rnd(-.1,.1),rnd(0,.5)],[rnd(-1,1),rnd(0,.8),rnd(.5,3)],0xb8b6a8,.5,rnd(.3,.6),rnd(1.8,3),{drag:1,grow:3});
 };
 const burst=()=>{
  const sc2=Math.max(1,R1*2);
  if(kind==='plate'){
   const p=[-ix,Ty+iy,D-.03];
   for(let i=0;i<90;i++){const v=V(rnd(-.7,.7),rnd(-.5,.8),-rnd(.2,1)).normalize().multiplyScalar(rnd(3,14));sparks.add(p,v.toArray(),i%3?0xffe9a8:0xffb050,1,.05*sc2,rnd(.25,.7),{g:g})}
   for(let i=0;i<26;i++)addBox(p,[rnd(-3,3),rnd(-1,3),-rnd(1,4)],[rnd(.02,.05)*sc2,rnd(.02,.05)*sc2,.004],[0xded4a6,0x3b4c45,0xd87249][i%3],rnd(1.5,2.5));
   for(let i=0;i<36;i++){const a=i/36*TAU;dust.add([-ix,Ty+iy,D-.05],[Math.cos(a)*1.6,Math.sin(a)*1.6,-.2],0xb9b69a,.55,.1*sc2,1.3,{drag:1.2,grow:4})}
  }else if(kind!=='air'){
   const n=E.y<=.03?V(0,1,0):V(E.x/mound.a**2,E.y/mound.h**2,(E.z-mound.cz)/mound.b**2).normalize(),wd2=kind==='wood',p=E.toArray();
   const cl=wd2?8:36,sp2=wd2?40:14;
   for(let i=0;i<cl;i++){const s=rnd(.05,.14);addBox(p,V(rnd(-3,3),rnd(1.5,6),rnd(-4,1)).add(n.clone().multiplyScalar(rnd(1,4))).toArray(),[s,s,s],[0x5b4a33,0x6b5a3c,0x433725][i%3],rnd(2,3.5))}
   for(let i=0;i<sp2;i++)addBox(p,[rnd(-5,5),rnd(1,7),rnd(-6,2)],[.015,.015,rnd(.15,.4)],i%2?0x8a6038:0xb48a55,rnd(2,3.5));
   for(let i=0;i<(wd2?40:70);i++)dust.add(p,[rnd(-2,2),rnd(.5,3),rnd(-2.5,1)],0x9b8f6a,.6,rnd(.3,.7),rnd(1.2,2.2),{drag:1.5,grow:3,g:-.3});
   for(let i=0;i<20;i++)sparks.add(p,[rnd(-2,2),rnd(1,5),rnd(-3,1)],0xd2b27a,.7,.03,rnd(.3,.6),{g:g});
  }
 };

 // ---- camera / state ----
 const camP=V(),lookV=V(),B=V(),tmp=V(),vel=V(),swT=.8; // swT: camera-only move from the front close-up to the chase position (the bullet's time scale never changes)
 let edgeDir=null,s=0,tau=0,clock=0,roll=0,mode='flight',impT=0,jolt=-1,fired=false,fin=0,finShown=false,shown=false;
 const fromP=V(),fromL=V(),toP=V(),toL=V();
 const arrow=document.createElement('div');arrow.className='sf-edge';arrow.hidden=true;arrow.textContent='\u27A4';root.append(arrow);
 // free (not covered by the score card) part of the canvas: fx/fy = fraction of width/height, ox/oy = its centre in NDC
 let fr={fx:1,fy:1,ox:0,oy:0};
 const freeArea=()=>{
  const w=root.clientWidth||innerWidth,h=root.clientHeight||innerHeight;fr={fx:1,fy:1,ox:0,oy:0};
  if(root.classList.contains('sf-nogl'))return;
  const card=root.querySelector('.sf-score'),ch=card?.offsetHeight||210;
  if(w<=560){const top=Math.max(h*.35,h-64-ch-8);fr={fx:1,fy:top/h,ox:0,oy:1-top/h}}
  else{const left=Math.min(w*.6,Math.min(300,w-24)+24),fw=w-left;fr={fx:fw/w,fy:1,ox:(left+fw/2)/w*2-1,oy:0}}
 };
 const finalPose=()=>{
  freeArea();
  const t=Math.tan(cam.fov*Math.PI/360),asp=cam.aspect;
  const far=!hit(o)&&Math.hypot(C.x,C.y-Ty)>R1*14;
  const frame=withMarker=>{
   let minx=-R1,maxx=R1,miny=Ty-R1,maxy=Ty+R1;edgeDir=null;
   if(withMarker){
    const m=Math.max(.1,R1*.25);
    // plate + marker bounding box (marker centre +- margin); a very distant crossing is not framed, an edge arrow points to it instead
    if(!far){minx=Math.min(minx,C.x-m);maxx=Math.max(maxx,C.x+m);miny=Math.min(miny,C.y-m);maxy=Math.max(maxy,C.y+m)}
   }
   const cx=(minx+maxx)/2,cy=(miny+maxy)/2,hx=(maxx-minx)/2,hy=(maxy-miny)/2;
   // margin 1.35; cap distance so the plate (R1 radius) never drops below ~15% of the frame height
   const dMax=Math.max(2,R1/(.15*t)),dist=clamp(Math.max(hy/(t*fr.fy),hx/(t*asp*fr.fx))*1.35,2,dMax);
   const sx=cx+fr.ox*dist*t*asp,sy=cy-fr.oy*dist*t; // content centre lands on the free area's centre
   toP.set(sx,sy,D-dist);toL.set(sx,sy,D);
   if(!hit(o)){ // marker outside the frame: arrow toward it, in screen space (world x is mirrored: screen-right = -x)
    const ex=C.x-cx,ey=C.y-cy;
    if(!withMarker||far||Math.abs(ex)>dist*t*asp*fr.fx*.88||Math.abs(ey)>dist*t*fr.fy*.88)edgeDir=Math.atan2(-ey,-ex);
   }
   // plate centre (0,Ty,D) projected through the pose (camera looks +z): must be inside the frustum
   return Math.abs(sx)<dist*t*asp&&Math.abs(Ty-sy)<dist*t;
  };
  if(!frame(true))frame(false);
 };
 const placeArrow=()=>{
  if(edgeDir===null||!(mode==='final'&&fin>.5)){arrow.hidden=true;return}
  const w=root.clientWidth||innerWidth,h=root.clientHeight||innerHeight,cs=Math.cos(edgeDir),sn=Math.sin(edgeDir),mx=w*(1+fr.ox)/2,my=h*(1-fr.oy)/2,k=Math.min((w*fr.fx/2-44)/Math.max(1e-3,Math.abs(cs)),(h*fr.fy/2-44)/Math.max(1e-3,Math.abs(sn))); // arrow rides the free area's edge, never over the card
  arrow.hidden=false;arrow.style.transform=`translate(${mx+cs*k}px,${my+sn*k}px) translate(-50%,-50%) rotate(${edgeDir}rad)`;
 };
 const setBullet=x=>{
  P(x,B);P(x+.4,tmp);vel.copy(tmp).sub(B).normalize();
  bul.position.copy(B);tmp.copy(B).add(vel);bul.lookAt(tmp);
  for(let i=0;i<TN;i++){P(Math.max(0,x-i*.25),tmp);tPos.set([tmp.x,tmp.y,tmp.z],i*3)}tg.attributes.position.needsUpdate=true;
 };
 const hide=()=>{bul.visible=trail.visible=false;flashL.intensity=0;flashS.scale.setScalar(0)};
 const toFinal=instant=>{
  hide();roll=0;marker.visible=!hit(o);pl.rotation.x=0;finalPose();
  if(instant){sparks.clear();dust.clear();camP.copy(toP);lookV.copy(toL);fin=1;mode='final';onFinal()}
  else{fromP.copy(camP);fromL.copy(lookV);fin=0;mode='final'}
 };
 setBullet(0);

 const ctl={
  resize(){
   const w=root.clientWidth||innerWidth,h=root.clientHeight||innerHeight;
   renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();
   uS.value=h*renderer.getPixelRatio()/(2*Math.tan(cam.fov*Math.PI/360));
   if(mode==='final'&&fin>=1){finalPose();camP.copy(toP);lookV.copy(toL)}
   placeArrow();
  },
  skip(){if(mode!=='final'||fin<1){mode='final';toFinal(true)}},
  tick(dt){
   clock+=dt;
   world.update(dt);
   if(mode==='flight'){
    if(!fired){fired=true;fire()}
    tau=Math.min(dur,tau+dt);s=sched.sAt(tau);
    const x=Math.min(xOf(s*TD),endX);
    setBullet(x);
    bMesh.rotation.z+=dt*mix(9.5,45,sm(clamp((tau-swT)/1.0,0,1))); // ~1.5 rev/s while the grooves are shown, then full spin
    if(!shown&&x>4.2){shown=true;lcd(Math.round(lcdAt)+' m/s')}
    onHud(x,vOf(x),tOf(x));
    // front-quarter close-up swings round to a chase cam behind the bullet (swT = slow-mo swing, then ease out to chase distance)
    // chase: ~1.4 m behind, 0.3 m above, <=0.25 m sideways, looking 8 m down the flight line so the 5x bullet sits low-centre; camera is slaved to B (no lag)
    const p=sm(clamp(tau/swT,0,1)),c=p,az=mix(.55,Math.PI-.06,p),R=mix(.55,1.4,c),sway=Math.sin(clock*.9);
    camP.set(B.x+R*Math.sin(az)+c*(.1+.04*sway),Math.max(.4,B.y+mix(.1,.3,c)+.015*c*Math.sin(clock*.6)),B.z+R*Math.cos(az));
    lookV.copy(B).addScaledVector(vel,8*c);roll=.012*c*Math.sin(clock*.8);glow.scale.setScalar(mix(.1,.45,c));
    if(tau>=dur){mode='impact';impT=0;hide();bul.visible=false;burst();if(kind==='plate')jolt=0}
   }else if(mode==='impact'){
    impT+=dt;camP.z+=dt*.3;
    if(impT>1)toFinal(false);
   }
   if(mode==='final'&&fin<1){
    fin=Math.min(1,fin+dt/.8);const w=sm(fin);camP.lerpVectors(fromP,toP,w);lookV.lerpVectors(fromL,toL,w);
    if(fin>.5&&!finShown){finShown=true;onFinal()}
    if(fin>=1)pl.rotation.x=0;
   }
   const sd=mode==='impact'?dt*.4:dt;
   if(jolt>=0&&mode!=='final'){jolt+=sd;pl.rotation.x=-.18*Math.exp(-2.5*jolt)*Math.sin(11*jolt)}
   else if(mode==='final'&&fin>=1)pl.rotation.x=0;
   if(flashL.intensity>0){flashL.intensity=Math.max(0,flashL.intensity-dt*110);flashS.scale.setScalar(Math.max(0,flashS.scale.x-dt*14))}
   sparks.update(sd);dust.update(sd);boxUpd(sd);
   if(mode==='final')placeArrow();
   cam.position.copy(camP);cam.lookAt(lookV);if(roll)cam.rotateZ(roll);sky.position.copy(camP);
   renderer.render(scene,cam);
  },
  dispose(){
   arrow.remove();world.dispose();
   boxes.dispose();glowTex.dispose();lcdT.dispose();renderer.dispose();renderer.forceContextLoss();
  }
 };
 return ctl;
}
