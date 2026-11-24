import './sniper-flight.css';

const sm=t=>(t=t<0?0:t>1?1:t,t*t*(3-2*t)),mix=(a,b,t)=>a+(b-a)*t,rnd=(a=0,b=1)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const sg=v=>{const r=Math.round(v*10)/10;return(r<0?'−':'+')+Math.abs(r).toFixed(1)};
const TAU=Math.PI*2;

const hit=o=>!!o.hit;
// Pure ballistic model + time schedule (no three.js). World: +z downrange, +y up, world x = -(lateral right) so a camera looking +z sees +lateral on screen right.
function modelOf(o){
 const D=o.distance,{k,v0}=o.caliber,g=o.gravity,R1=o.targetRadiusMil*D/1000,Y0=1.5,dur=o.duration||D/100,W=o.wind||{};
 const tOf=x=>(Math.exp(k*x)-1)/(k*v0),xOf=t=>Math.log(1+k*v0*t)/k,drop=x=>g*tOf(x)**2/2;
 const th=o.aimMil.y/1000+drop(100)/100;
 const wdir=(typeof W.east==='number'?Math.sign(W.east):W.east?1:-1)*(W.speed||0);
 const H0=x=>th*x-drop(x),L0=x=>o.aimMil.x/1000*x+wdir*(tOf(x)-x/v0);
 const ix=o.impactMil.x*D/1000,iy=o.impactMil.y*D/1000,TD=tOf(D),ay=(iy-H0(D))/D,ax=(ix-L0(D))/D;
 const P=(x,out={})=>{out.x=-(L0(x)+ax*x);out.y=Y0+H0(x)+ay*x;out.z=x;return out};
 const mound={a:Math.max(2.5,2*R1+2),b:3.5,h:3.5,cz:D+5};
 const hE=(x,z)=>{const u=(x/mound.a)**2+((z-mound.cz)/mound.b)**2;return u<1?mound.h*Math.sqrt(1-u):-1};
 let endX=D,kind='plate';
 if(!hit(o)){
  kind='air';endX=D+3;const q={};
  for(let x=1;x<D+60;x+=.25){P(x,q);if(q.y<=.02||(q.z>D&&hE(q.x,q.z)>0&&q.y<=hE(q.x,q.z))){endX=x;kind='dirt';break}}
 }
 const sEnd=tOf(endX)/TD,fz=[.25,.5,.75].map(f=>D*f),fsig=Math.max(15,D*.03);
 const prox=x=>Math.max(...fz.map(z=>Math.exp(-(((x-z)/fsig)**2))));
 // warp: slow-mo at launch and near each flag, then renormalised so muzzle->impact == duration exactly
 const warp=s=>(s<.04?.08+.92*sm(s/.04):1)*(1-.7*prox(xOf(Math.min(s,sEnd)*TD)));
 const N=2000,tab=new Float64Array(N+1);
 for(let i=0;i<N;i++)tab[i+1]=tab[i]+sEnd/N/warp((i+.5)/N*sEnd);
 const k2=dur/tab[N];for(let i=0;i<=N;i++)tab[i]*=k2;
 const sAt=t=>{if(t<=0)return 0;if(t>=dur)return sEnd;let a=0,b=N;while(b-a>1){const m=(a+b)>>1;tab[m]<=t?a=m:b=m}return(a+(t-tab[a])/(tab[b]-tab[a]))/N*sEnd};
 return{tOf,xOf,P,endX,kind,sEnd,TD,ix,iy,th,ay,ax,mound,fsig,sched:{total:dur,warp,sAt}};
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
 <section class="sf-score" hidden role="status"><div class="sf-ring">${o.ring}</div><div class="sf-label ${hit?'is-hit':'is-miss'}">${hit?tr('Влучання','Hit'):tr('Промах','Miss')}</div><p class="sf-off">${tr('Відхилення: ','Offset: ')}X ${sg(o.impactMil.x)} / Y ${sg(o.impactMil.y)} ${tr('міл','mil')}</p><button type="button" class="sf-go">${tr('Далі','Continue')}</button></section>`;
 host.append(root);
 const $=s=>root.querySelector(s),canvas=$('.sf-canvas'),hud=$('.sf-hud'),skipB=$('.sf-skip'),score=$('.sf-score'),goB=$('.sf-go');
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
 const skip=()=>{if(final)return;if(ctl)ctl.skip();else showFinal()};
 const onKey=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();final?close():skip()}
  else if(e.key===' '&&!final){e.preventDefault();e.stopImmediatePropagation();skip()}
  else if(e.key==='Tab'){e.preventDefault();(final?goB:skipB).focus()}
 };
 const onResize=()=>ctl?.resize();
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
 ctl.resize();
 if(reduced)ctl.skip();
 const loop=t=>{
  if(closed)return;
  const dt=Math.min(.1,last?(t-last)/1000:0);last=t;
  ctl.tick(dt);raf=requestAnimationFrame(loop);
 };
 raf=requestAnimationFrame(loop);
 return done;
}

function scene3d(T,o,root,canvas,onFinal,onHud){
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
 const D=o.distance,{k,v0}=o.caliber,g=o.gravity,R1=o.targetRadiusMil*D/1000,Y0=1.5;
 const dur=o.duration||D/100,W=o.wind||{},fl=W.flags||[1,1,1];
 const HS=clamp(D,600,1200); // scale for hills / fog so short ranges still get depth

 const M=modelOf(o),{tOf,xOf,P,endX,sEnd,TD,sched,ix,iy,th,ay,ax,mound,fsig}=M;let kind=M.kind;
 const E=P(endX,V());
 const woodD=Math.min(Math.hypot(E.x,E.z-D-.06),Math.hypot(Math.abs(E.x)-R1-.3,E.z-D-.25));
 if(kind==='dirt'&&woodD<.4&&E.y<Y0+R1+.2)kind='wood';

 // ---- renderer / scene ----
 const renderer=new T.WebGLRenderer({canvas,antialias:true,logarithmicDepthBuffer:true});
 if(!renderer.getContext())throw new Error('no gl');
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0xbfbc95);
 const scene=new T.Scene();scene.fog=new T.Fog(0xbfbc95,HS*.15,HS+D*.5+600);
 const cam=new T.PerspectiveCamera(50,1,.05,4500);
 const uS={value:600};
 const mats=[];
 const lam=(c,x={})=>{const m=new T.MeshLambertMaterial({color:c,...x});return m};
 const add=(par,geo,mat,x=0,y=0,z=0)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);par.add(m);return m};
 const tex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t};
 const glowTex=tex(64,64,(c,w)=>{const gr=c.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'#fff');gr.addColorStop(.3,'#ffd9a0cc');gr.addColorStop(1,'#ff8a3000');c.fillStyle=gr;c.fillRect(0,0,w,w)});

 // sky dome with vertical gradient
 const skyG=new T.SphereGeometry(3200,24,32),sp=skyG.attributes.position,sc=new Float32Array(sp.count*3),cA=new T.Color(0x354f52),cB=new T.Color(0xbfbc95),cc=new T.Color();
 for(let i=0;i<sp.count;i++){cc.copy(cB).lerp(cA,Math.pow(clamp(sp.getY(i)/3200*1.7,0,1),.8));cc.toArray(sc,i*3)}
 skyG.setAttribute('color',new T.BufferAttribute(sc,3));
 const sky=new T.Mesh(skyG,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide,fog:false,depthWrite:false}));sky.renderOrder=-1;scene.add(sky);

 scene.add(new T.HemisphereLight(0xdfe6d0,0x4a5a3e,1.5));
 const sun=new T.DirectionalLight(0xffd9a0,2.2);sun.position.set(-50,60,-80);scene.add(sun);

 // ground: flat-shaded tiles, low-frequency colour patches + tiled noise detail
 const gl=D+HS+400,gg=new T.PlaneGeometry(1400,gl,56,Math.round(gl/28)).toNonIndexed();gg.rotateX(-Math.PI/2);
 const gp=gg.attributes.position,gc=new Float32Array(gp.count*3),cG=new T.Color(0x4b5d3f),cY=new T.Color(0x6e7248),cR=new T.Color(0x7a6e4c);
 for(let i=0;i<gp.count;i+=3){
  const cx=(gp.getX(i)+gp.getX(i+1)+gp.getX(i+2))/3,cz=(gp.getZ(i)+gp.getZ(i+1)+gp.getZ(i+2))/3+gl/2-300;
  const n=Math.sin(cx*.021+cz*.013)+Math.sin(cx*.047-cz*.031)*.6+Math.sin(cz*.009+1)*.5;
  cc.copy(cG).lerp(cY,clamp(n*.35+.5,0,1));if(Math.abs(cx)<7)cc.lerp(cR,.3*(1-Math.abs(cx)/7));
  cc.multiplyScalar(.9+.2*Math.abs(Math.sin(i*12.9898)*43758.5453%1));for(let q=0;q<3;q++)cc.toArray(gc,(i+q)*3)}
 gg.setAttribute('color',new T.BufferAttribute(gc,3));
 const nTex=tex(128,128,(c,w,h)=>{c.fillStyle='#f0f0f0';c.fillRect(0,0,w,h);for(let i=0;i<260;i++){const x=Math.random()*w,y=Math.random()*h,r=rnd(2,9);c.fillStyle=`rgba(${Math.random()<.5?'60,70,40':'255,255,230'},${rnd(.04,.12)})`;for(const dx of[-w,0,w])for(const dy of[-h,0,h]){c.beginPath();c.arc(x+dx,y+dy,r,0,TAU);c.fill()}}});
 nTex.wrapS=nTex.wrapT=T.RepeatWrapping;nTex.repeat.set(1400/6,gl/6);
 add(scene,gg,lam(0xffffff,{vertexColors:true,map:nTex}),0,0,gl/2-300);
 // road
 const road=(w,col,y)=>{const m=add(scene,new T.PlaneGeometry(w,D+14).rotateX(-Math.PI/2),lam(col,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),0,y,(D+6)/2-8)};
 road(6,0x8d8057,.04);road(2.2,0x75724f,.06);
 // hills: low-poly ridges at far end and both sides
 const ridge=(col,len,h,seed,thick)=>{
  const s=new T.Shape(),n=Math.max(10,Math.round(len/70));s.moveTo(-len/2,-3);
  for(let i=0;i<=n;i++){const u=i/n;s.lineTo(-len/2+u*len,h*(.3+.7*Math.abs(Math.sin(u*9+seed)*.6+Math.sin(u*23+seed*2)*.4)))}
  s.lineTo(len/2,-3);s.closePath();
  const gm=new T.ExtrudeGeometry(s,{depth:thick,bevelEnabled:false});gm.translate(0,0,-thick/2);
  return new T.Mesh(gm,lam(col,{flatShading:true}));
 };
 [[0x83907b,1.1,110,1],[0x5a6e55,.65,60,2.3],[0x536145,.3,28,4.1]].forEach(([c,f,h,sd])=>{const r=ridge(c,HS*2.4,h*HS/1000,sd,40);r.position.set(0,0,D+30+f*HS);scene.add(r)});
 [[0x536145,.18,10,5],[0x5a6e55,.32,32,7],[0x83907b,.5,70,9]].forEach(([c,f,h,sd])=>[-1,1].forEach(sd2=>{
  const r=ridge(c,D+HS*1.6,h*HS/1000,sd+sd2,40);r.rotation.y=Math.PI/2;r.position.set(sd2*Math.max(90,f*HS),0,(D+HS*.8)/2-100);scene.add(r)}));

 // scattered bushes / rocks / grass tufts along the road, distance posts every 100 m
 {
  const fp=[.25,.5,.75].map((f,i)=>[i%2?4.5:-4.5,D*f]),o3=new T.Object3D();
  const scatter=(geo,n,y0,sMin,sMax,cols,flat)=>{
   const im=new T.InstancedMesh(geo,lam(0xffffff,{flatShading:true}),n);
   for(let i=0;i<n;i++){let x,z,t=0;do{x=(Math.random()<.5?-1:1)*(3.6+Math.pow(Math.random(),2)*(flat?10:16));z=rnd(6,D+6)}while(fp.some(p=>Math.hypot(x-p[0],z-p[1])<1.5)&&t++<9);
    const sc=rnd(sMin,sMax);o3.position.set(x,y0*sc,z);o3.rotation.set(0,rnd(0,TAU),0);o3.scale.set(sc*rnd(.8,1.3),sc*(flat?rnd(.5,.9):rnd(.8,1.2)),sc*rnd(.8,1.3));o3.updateMatrix();im.setMatrixAt(i,o3.matrix);
    im.setColorAt(i,cc.setHex(cols[i%cols.length]).multiplyScalar(rnd(.85,1.15)))}
   scene.add(im)};
  scatter(new T.IcosahedronGeometry(1,0),clamp(Math.round(D*.15),60,300),.45,.5,1.3,[0x4a5f3a,0x5a6e45,0x6b7a45,0x3f5236],false);
  scatter(new T.DodecahedronGeometry(1,0),clamp(Math.round(D*.1),40,200),.3,.2,.7,[0x76736a,0x5c5a52,0x8a8068],true);
  scatter(new T.ConeGeometry(.1,.45,5).translate(0,.22,0),clamp(Math.round(D*.3),150,500),0,.6,1.6,[0x8a8c52,0x6f7f45,0x9a9a5a],false);
  const postG=new T.BoxGeometry(.08,1.1,.08),postM=lam(0xe9ebda),signG=new T.PlaneGeometry(.5,.28).rotateY(Math.PI);
  for(let d=100;d<D;d+=100){
   add(scene,postG,postM,-3.6,.55,d);
   const t=tex(128,64,(c,w,h)=>{c.fillStyle='#e9ebda';c.fillRect(0,0,w,h);c.fillStyle='#141b18';c.font='bold 40px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(d),w/2,h/2+2)});
   add(scene,signG,new T.MeshBasicMaterial({map:t}),-3.6,1.15,d-.06);
  }
 }
 // ---- rifle muzzle ----
 const dark=lam(0x1c211d),steel=lam(0x2e3631);
 const rifle=new T.Group();rifle.position.set(0,Y0,0);rifle.rotation.order='YXZ';
 rifle.rotation.set(-(th+ay),-(o.aimMil.x/1000+ax),0);scene.add(rifle);
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

 // ---- wind flags ----
 const wd=W.east===0?0:(typeof W.east==='number'?Math.sign(W.east):W.east?1:-1);
 const flags=[.25,.5,.75].map((f,i)=>{
  const st=clamp(fl[i]||1,1,3),x=i%2?4.5:-4.5,z=D*f,grp=new T.Group();grp.position.set(x,0,z);scene.add(grp);
  add(grp,new T.CylinderGeometry(.03,.04,3.4,6),lam(0x292e22),0,1.7,0);
  const N=10,L=.7+.55*st,pos=new Float32Array((N+1)*6),idx=[];
  for(let j=0;j<N;j++){const a=j*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setIndex(idx);
  const m=add(grp,geo,lam(0xf5ad53,{side:T.DoubleSide}),0,3.3,0);m.frustumCulled=false;
  const upd=t=>{const A=.02+.05*st;for(let j=0;j<=N;j++){const u=j/N,px=-wd*L*u,py=-(1-(st-1)/2.2)*.35*u*u*L+A*.4*Math.sin(t*9-u*7+i)*u,pz=A*Math.sin(t*8-u*6+i)*u*L,w=.42*(1-.85*u);pos.set([px,py,pz,px,py-w,pz],j*6)}
   geo.attributes.position.needsUpdate=true;geo.computeVertexNormals()};
  upd(0);return{x,z,upd};
 });

 // ---- target, stand, berm ----
 const wood=lam(0x6b4a2f);
 const barY=Y0+R1+.12;
 [-1,1].forEach(s=>{add(scene,new T.BoxGeometry(.12,barY,.12),wood,s*(R1+.3),barY/2,D+.25);
  const br=add(scene,new T.BoxGeometry(.08,barY*.9,.08),wood,s*(R1+.3),barY*.45,D+1.1);br.rotation.x=.45});
 add(scene,new T.BoxGeometry(2*R1+.8,.12,.14),wood,0,barY,D+.25);
 add(scene,new T.BoxGeometry(.12,Y0,.12),lam(0x2b3025),0,Y0/2,D+.08);
 const mk=(a,h,b,cx,cz,seed)=>{
  const g0=new T.SphereGeometry(1,12,8),p=g0.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),j=1+.1*Math.sin(x*5+seed)*Math.cos(z*4+y*3);p.setXYZ(i,x*a*j,y*h*(.95+.05*j),z*b*j)}
  const ng=g0.toNonIndexed(),q=ng.attributes.position,col=new Float32Array(q.count*3),c1=new T.Color(0x5f4e36),c2=new T.Color(0x3f3325),c3=new T.Color(0x56603f);
  for(let i=0;i<q.count;i+=3){const cy=(q.getY(i)+q.getY(i+1)+q.getY(i+2))/3/h;cc.copy(c1).lerp(c2,Math.abs(Math.sin(i*5.7+seed)));if(cy>.55)cc.lerp(c3,.55);for(let t=0;t<3;t++)cc.toArray(col,(i+t)*3)}
  ng.setAttribute('color',new T.BufferAttribute(col,3));ng.computeVertexNormals();
  add(scene,ng,lam(0xffffff,{vertexColors:true,flatShading:true}),cx,0,cz)};
 mk(mound.a,mound.h,mound.b,0,mound.cz,1);mk(mound.a*.55,2.4,mound.b*.85,mound.a*1.05,mound.cz+1,2);mk(mound.a*.55,2.2,mound.b*.85,-mound.a*1.1,mound.cz+.5,3);
 const pl=new T.Group();pl.position.set(0,Y0+R1,D);scene.add(pl);
 const plTex=(tex(1024,1024,(c,w)=>{
  const r=w/2;c.translate(r,r);
  [[1,'#ded4a6'],[.76,'#3b4c45'],[.48,'#ded4a6'],[.23,'#d87249']].forEach(([f,col])=>{c.fillStyle=col;c.beginPath();c.arc(0,0,r*f,0,TAU);c.fill()});
  c.strokeStyle='#141b1888';c.lineWidth=3;
  for(let n=1;n<=10;n++){c.beginPath();c.arc(0,0,r*(11-n)/10,0,TAU);c.stroke()}
  c.font=`bold ${w*.03}px sans-serif`;c.textAlign='center';c.textBaseline='middle';
  for(let n=1;n<=9;n++){const f=(10.5-n)/10;c.fillStyle=f>.76||(f>.23&&f<=.48)||f<=.23?'#1b241f':'#e9ebda';
   [[1,0],[-1,0],[0,1],[0,-1]].forEach(([a,b])=>c.fillText(String(n),a*r*f,b*r*f))}
 }));
 add(pl,new T.CircleGeometry(R1,64).rotateY(Math.PI),new T.MeshLambertMaterial({map:plTex}),0,-R1,-.021);
 add(pl,new T.CylinderGeometry(R1,R1,.04,48).rotateX(Math.PI/2),lam(0x2b3025),0,-R1,0);
 // hit decal / off-target marker
 const hr=Math.max(.015,R1*.035);
 if(hit(o)){
  const d=add(pl,new T.CircleGeometry(hr,16),new T.MeshBasicMaterial({color:0x0b0f0c}),-ix,iy-R1,-.026);d.rotation.y=Math.PI;
  const rm=add(pl,new T.RingGeometry(hr,hr*1.6,16),new T.MeshBasicMaterial({color:0xcfd2c0,transparent:true,opacity:.75}),-ix,iy-R1,-.025);rm.rotation.y=Math.PI;
 }
 const ms=Math.max(.12,R1*.16);
 const marker=add(scene,new T.PlaneGeometry(ms,ms),new T.MeshBasicMaterial({map:tex(128,128,(c)=>{c.strokeStyle='#f5ad53';c.lineWidth=12;c.beginPath();c.arc(64,64,48,0,TAU);c.moveTo(34,34);c.lineTo(94,94);c.moveTo(94,34);c.lineTo(34,94);c.stroke()}),transparent:true,depthWrite:false}),E.x,Math.max(.1,E.y),Math.min(E.z,D-.1));
 marker.rotation.y=Math.PI;marker.visible=false;

 // ---- bullet ----
 const bul=new T.Group();scene.add(bul);
 const bGeo=new T.LatheGeometry([[0,0],[.0035,0],[.0043,.004],[.0043,.016],[.004,.021],[.003,.027],[.0016,.031],[0,.034]].map(p=>new T.Vector2(p[0],p[1])),8);
 bGeo.translate(0,-.017,0);bGeo.rotateX(Math.PI/2);
 const bMesh=add(bul,bGeo,new T.MeshPhongMaterial({color:0xc9893f,specular:0xffe2a0,shininess:80,flatShading:true}));
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
   const p=[-ix,Y0+iy,D-.03];
   for(let i=0;i<90;i++){const v=V(rnd(-.7,.7),rnd(-.5,.8),-rnd(.2,1)).normalize().multiplyScalar(rnd(3,14));sparks.add(p,v.toArray(),i%3?0xffe9a8:0xffb050,1,.05*sc2,rnd(.25,.7),{g:g})}
   for(let i=0;i<26;i++)addBox(p,[rnd(-3,3),rnd(-1,3),-rnd(1,4)],[rnd(.02,.05)*sc2,rnd(.02,.05)*sc2,.004],[0xded4a6,0x3b4c45,0xd87249][i%3],rnd(1.5,2.5));
   for(let i=0;i<36;i++){const a=i/36*TAU;dust.add([-ix,Y0+iy,D-.05],[Math.cos(a)*1.6,Math.sin(a)*1.6,-.2],0xb9b69a,.55,.1*sc2,1.3,{drag:1.2,grow:4})}
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
 const camP=V(),lookV=V(),B=V(),tmp=V(),vel=V(),cT=V(0,Y0,D);
 const startP=V(.9,1.8,-.9),chronoPt=V(0,Y0,6);
 const p1End=clamp(Math.max(.12,1.2/dur),.12,.4),p3Start=1-clamp(Math.max(.1,.9/dur),.1,.3);
 const rev=clamp(dur*.7,3,7);
 let s=0,tau=0,clock=0,phi=-.9,mode='flight',impT=0,jolt=-1,fired=false,fin=0,finShown=false,shown=false;
 const fromP=V(),fromL=V(),toP=V(),toL=V();
 const finalPose=()=>{
  const t=Math.tan(cam.fov*Math.PI/360),asp=cam.aspect;let minx=-R1,maxx=R1,miny=Y0-R1,maxy=Y0+R1;
  if(!hit(o)){const m=Math.max(.1,R1*.25);const my=Math.max(.1,E.y);minx=Math.min(minx,E.x-m);maxx=Math.max(maxx,E.x+m);miny=Math.min(miny,my-m);maxy=Math.max(maxy,my+m)}
  const cx=(minx+maxx)/2,cy=(miny+maxy)/2,hx=(maxx-minx)/2,hy=(maxy-miny)/2;
  const dist=Math.max(2,Math.max(hy/t,hx/(t*asp))*1.35);
  toP.set(cx,cy,D-dist);toL.set(cx,cy,D);
 };
 const setBullet=x=>{
  P(x,B);P(x+.4,tmp);vel.copy(tmp).sub(B).normalize();
  bul.position.copy(B);tmp.copy(B).add(vel);bul.lookAt(tmp);
  for(let i=0;i<TN;i++){P(Math.max(0,x-i*.25),tmp);tPos.set([tmp.x,tmp.y,tmp.z],i*3)}tg.attributes.position.needsUpdate=true;
 };
 const hide=()=>{bul.visible=trail.visible=false;flashL.intensity=0;flashS.scale.setScalar(0)};
 const toFinal=instant=>{
  hide();marker.visible=!hit(o);pl.rotation.x=0;finalPose();
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
  },
  skip(){if(mode!=='final'||fin<1){mode='final';toFinal(true)}},
  tick(dt){
   clock+=dt;
   flags.forEach(f=>f.upd(clock));
   if(mode==='flight'){
    if(!fired){fired=true;fire()}
    tau=Math.min(dur,tau+dt);s=sched.sAt(tau);
    const x=Math.min(xOf(s*TD),endX);
    setBullet(x);
    bMesh.rotation.z+=dt*45;
    if(!shown&&x>4.2){shown=true;lcd(Math.round(lcdAt)+' m/s')}
    onHud(x,v0*Math.exp(-k*x),tOf(x));
    let pf=flags[0];flags.forEach(f=>{if(Math.abs(B.z-f.z)<Math.abs(B.z-pf.z))pf=f});
    const dz=B.z-pf.z,prox=Math.exp(-((dz/fsig)**2)),prox2=Math.exp(-((dz/(2.2*fsig))**2));
    phi+=dt*(TAU/rev)*(1-.75*prox);
    {const tg2=B.x>pf.x?-.5:Math.PI+.5,d=((tg2-phi+Math.PI)%TAU+TAU)%TAU-Math.PI;phi+=d*Math.min(1,dt*3*prox2)}
    const r=(2.6+1.4*Math.sin(clock*.5))*(1-.3*prox),dy=.5+.9*Math.sin(clock*.37+1);
    camP.set(B.x+r*Math.cos(phi),Math.max(.5,B.y+dy),B.z+r*Math.sin(phi));
    if(s<p1End)camP.lerpVectors(startP,camP,sm(s/p1End));
    lookV.lerpVectors(chronoPt,B,sm(s/.03));
    if(prox2>.05){tmp.set(pf.x,3,pf.z);lookV.lerp(tmp,.5*prox)}
    const w3=sm((s-p3Start)/(1-p3Start));
    if(w3>0){toP.set(2+2*R1,1.7,D-(6+6*R1));camP.lerp(toP,w3);tmp.lerpVectors(B,cT,.55);lookV.lerp(tmp,w3)}
    if(tau>=dur){mode='impact';impT=0;hide();bul.visible=false;burst();if(kind==='plate')jolt=0}
   }else if(mode==='impact'){
    impT+=dt;camP.z+=dt*.3;
    if(impT>1.6)toFinal(false);
   }
   if(mode==='final'&&fin<1){
    fin=Math.min(1,fin+dt/1);const w=sm(fin);camP.lerpVectors(fromP,toP,w);lookV.lerpVectors(fromL,toL,w);
    if(fin>.5&&!finShown){finShown=true;onFinal()}
    if(fin>=1)pl.rotation.x=0;
   }
   const sd=mode==='impact'?dt*(.2+.8*sm(impT/1.5)):mode==='flight'?dt*sched.warp(s):dt;
   if(jolt>=0&&mode!=='final'){jolt+=sd;pl.rotation.x=-.18*Math.exp(-2.5*jolt)*Math.sin(11*jolt)}
   else if(mode==='final'&&fin>=1)pl.rotation.x=0;
   if(flashL.intensity>0){flashL.intensity=Math.max(0,flashL.intensity-dt*110);flashS.scale.setScalar(Math.max(0,flashS.scale.x-dt*14))}
   sparks.update(sd);dust.update(sd);boxUpd(sd);
   cam.position.copy(camP);cam.lookAt(lookV);sky.position.copy(camP);
   renderer.render(scene,cam);
  },
  dispose(){
   scene.traverse(m=>{m.geometry?.dispose();[].concat(m.material||[]).forEach(mt=>{mt.map?.dispose();mt.dispose()})});
   boxes.dispose();glowTex.dispose();lcdT.dispose();renderer.dispose();renderer.forceContextLoss();
  }
 };
 return ctl;
}
