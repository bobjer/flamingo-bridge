// Shared 3D range world for the Sniper scope view and the bullet-flight replay.
// World: shooter at the origin, +z downrange, +y up, world x = -(lateral right) so a camera looking +z sees +lateral on screen right.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),rnd=(a=0,b=1)=>a+Math.random()*(b-a),TAU=Math.PI*2;
import {WORLDS} from './sniper-ballistics.js';
export const Y0=1.5;
export const targetY=R1=>Math.max(Y0,1.1*R1+.3); // plate centre height: backer (2.2x plate) bottom edge stays >=0.3 m above ground
export const moundOf=(D,R1)=>({a:Math.max(2.5,2.4*R1+2),b:3.5,h:Math.max(3.5,targetY(R1)+1.1*R1+.5),cz:D+5});

/** Builds the range. Returns scene + handles; the caller owns the renderer and camera. */
export function buildWorld(T,{distance:D,wind:W={},targetRadiusM:R1,ring10:f10=.1,world:wid='earth'}){
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),fl=W.flags||[1,1,1],HS=clamp(D,600,1200); // HS scales hills / fog so short ranges still get depth
 const WD=WORLDS[wid]||WORLDS.earth,airless=!WD.rho,mars=WD.id==='mars',merc=WD.id==='mercury',moon=WD.id==='moon';
 // Per-world look: sky gradient (top, horizon), fog [colour, near, far] or null, light, ground / ridge / road / mound colours, noise-texture blotch tint.
 const PAL={
  earth:{top:0x354f52,hor:0xbfbc95,fog:[0xbfbc95,Math.max(150,D*.35),D*2.4+600],hemi:[0xdfe6d0,0x4a5a3e,1.5],sun:[0xffd9a0,2.2],g:[0x4b5d3f,0x6e7248,0x7a6e4c],ridge:[0x83907b,0x5a6e55,0x536145],road:[0x8d8057,0x75724f],mound:[0x5f4e36,0x3f3325,0x56603f],tint:'60,70,40'},
  moon:{top:0x000000,hor:0x000000,fog:null,hemi:[0xa8a8a8,0x3c3c3c,.9],sun:[0xffffff,3.2],g:[0x8d8b86,0x6f6d69,0x7d7b76],ridge:[0x8a8884,0x6c6a66,0x5a5855],road:[0x76746f,0x65635f],mound:[0x77756f,0x5a5855,0x6a6864],tint:'70,70,68'},
  mercury:{top:0x000000,hor:0x000000,fog:null,hemi:[0x8c8680,0x2a2623,.7],sun:[0xfff4e0,3.8],g:[0x5f5a55,0x4a4643,0x55504b],ridge:[0x6a645e,0x4e4a46,0x3f3b38],road:[0x4f4a46,0x433f3c],mound:[0x5a5550,0x3e3a37,0x4b4743],tint:'40,36,34'},
  mars:{top:0xc98f6a,hor:0xe8c39e,fog:[0xe0b590,Math.max(120,D*.25),D*1.8+500],hemi:[0xf0d0b0,0x6a3a22,1.4],sun:[0xffe0c0,2],g:[0xa5532b,0x8c4422,0xb8744a],ridge:[0x9a5a3a,0x7d4a30,0x6a3b25],road:[0xb8744a,0x9a5a38],mound:[0x9a5232,0x6e3a22,0xa8643c],tint:'110,50,28'},
 }[WD.id];
 const scene=new T.Scene();scene.fog=PAL.fog?new T.Fog(PAL.fog[0],PAL.fog[1],PAL.fog[2]):null; // scaled to the real distance: target is only ~13-29% hazed at 300-3000 m
 const cc=new T.Color(),mound=moundOf(D,R1),Ty=targetY(R1);
 const lam=(c,x={})=>{const m=new T.MeshLambertMaterial({color:c,...x});return m};
 const add=(par,geo,mat,x=0,y=0,z=0)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);par.add(m);return m};
 const tex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t};
 // sky dome with vertical gradient
 const skyG=new T.SphereGeometry(3200,24,32),sp=skyG.attributes.position,sc=new Float32Array(sp.count*3),cA=new T.Color(PAL.top),cB=new T.Color(PAL.hor);
 for(let i=0;i<sp.count;i++){cc.copy(cB).lerp(cA,Math.pow(clamp(sp.getY(i)/3200*1.7,0,1),.8));cc.toArray(sc,i*3)}
 skyG.setAttribute('color',new T.BufferAttribute(sc,3));
 const sky=new T.Mesh(skyG,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide,fog:false,depthWrite:false}));sky.renderOrder=-1;scene.add(sky);
 if(airless){ // black sky: stars (children of the sky so they follow the camera) and the Earth disc (Moon) or a huge Sun (Mercury)
  const ns=5200,sp2=new Float32Array(ns*3),sc2=new Float32Array(ns*3),R=3000;
  for(let i=0;i<ns;i++){
   const az=(i<4000?rnd(-.62,.62):rnd(-Math.PI,Math.PI))+(i<4000?0:0),el=i<4000?rnd(0,.62):Math.acos(rnd(0,1))*.98,b=rnd(.35,1)**1.6;
   sp2.set([-Math.sin(az)*Math.cos(el)*R,Math.sin(el)*R,Math.cos(az)*Math.cos(el)*R],i*3);cc.setRGB(b,b,b*(.9+.1*Math.random())).toArray(sc2,i*3);
  }
  const stg=new T.BufferGeometry();stg.setAttribute('position',new T.BufferAttribute(sp2,3));stg.setAttribute('color',new T.BufferAttribute(sc2,3));
  const stars=new T.Points(stg,new T.PointsMaterial({size:1.9,sizeAttenuation:false,vertexColors:true,fog:false,depthWrite:false}));stars.renderOrder=-1;stars.frustumCulled=false;sky.add(stars);
  const spr=(map,add2,sz,az,el)=>{const m=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false,fog:false,blending:add2?T.AdditiveBlending:T.NormalBlending}));
   m.position.set(-Math.sin(az)*Math.cos(el)*R,Math.sin(el)*R,Math.cos(az)*Math.cos(el)*R);m.scale.set(sz,sz,1);m.renderOrder=-1;sky.add(m);return m};
  if(moon){ // Earth, ~2.5 deg, just above the horizon
   const et=tex(256,256,(c,w)=>{const r=w/2;c.translate(r,r);c.save();c.beginPath();c.arc(0,0,r*.96,0,TAU);c.clip();
    const gr=c.createRadialGradient(-r*.3,-r*.3,r*.1,0,0,r);gr.addColorStop(0,'#5d9be0');gr.addColorStop(.7,'#2a5db0');gr.addColorStop(1,'#10285a');c.fillStyle=gr;c.fillRect(-r,-r,w,w);
    c.fillStyle='#4f8a4a99';for(const [x,y,q] of [[-.3,-.1,.28],[.25,.3,.22],[.35,-.3,.16]]){c.beginPath();c.ellipse(x*r,y*r,q*r,q*r*.7,x,0,TAU);c.fill()}
    c.strokeStyle='#ffffffcc';c.lineWidth=r*.07;c.lineCap='round';for(let i=0;i<9;i++){c.beginPath();c.arc(rnd(-.5,.5)*r,rnd(-.6,.6)*r,rnd(.15,.45)*r,rnd(0,TAU),rnd(0,TAU)+1.6);c.stroke()}
    c.fillStyle='rgba(0,0,10,.55)';c.beginPath();c.arc(r*.55,r*.1,r*1.05,0,TAU);c.fill();c.restore();
    const hg=c.createRadialGradient(0,0,r*.9,0,0,r);hg.addColorStop(0,'#9cc8ff55');hg.addColorStop(1,'#9cc8ff00');c.fillStyle=hg;c.fillRect(-r,-r,w,w)});
   spr(et,false,3000*Math.tan(2.6*Math.PI/180),-.012,.056);
  }else{ // Mercury: the Sun at ~1.3 deg (2.5x the Earth view), white-hot core in a wide glow
   const gt=tex(256,256,(c,w)=>{const gr=c.createRadialGradient(128,128,0,128,128,128);gr.addColorStop(0,'#ffffff');gr.addColorStop(.17,'#ffffff');gr.addColorStop(.21,'#fff4d0f0');gr.addColorStop(.32,'#ffd78a66');gr.addColorStop(.6,'#ffb04a1c');gr.addColorStop(1,'#ff9a3000');c.fillStyle=gr;c.fillRect(0,0,w,w)});
   const sunDeg=1.33;spr(gt,true,3000*Math.tan(sunDeg*Math.PI/180)/.2,-.03,.067);
  }
 }

 scene.add(new T.HemisphereLight(PAL.hemi[0],PAL.hemi[1],PAL.hemi[2]));
 const sun=new T.DirectionalLight(PAL.sun[0],PAL.sun[1]);sun.position.set(-50,60,-80);scene.add(sun);
 // ground: flat-shaded tiles, low-frequency colour patches + tiled noise detail
 const gl=D+HS+400,gg=new T.PlaneGeometry(1400,gl,56,Math.round(gl/28)).toNonIndexed();gg.rotateX(-Math.PI/2);
 const gp=gg.attributes.position,gc=new Float32Array(gp.count*3),cG=new T.Color(PAL.g[0]),cY=new T.Color(PAL.g[1]),cR=new T.Color(PAL.g[2]);
 for(let i=0;i<gp.count;i+=3){
  const cx=(gp.getX(i)+gp.getX(i+1)+gp.getX(i+2))/3,cz=(gp.getZ(i)+gp.getZ(i+1)+gp.getZ(i+2))/3+gl/2-300;
  const n=Math.sin(cx*.021+cz*.013)+Math.sin(cx*.047-cz*.031)*.6+Math.sin(cz*.009+1)*.5;
  cc.copy(cG).lerp(cY,clamp(n*.35+.5,0,1));if(Math.abs(cx)<7)cc.lerp(cR,.3*(1-Math.abs(cx)/7));
  cc.multiplyScalar(.9+.2*Math.abs(Math.sin(i*12.9898)*43758.5453%1));for(let q=0;q<3;q++)cc.toArray(gc,(i+q)*3)}
 gg.setAttribute('color',new T.BufferAttribute(gc,3));
 const nTex=tex(128,128,(c,w,h)=>{c.fillStyle='#f0f0f0';c.fillRect(0,0,w,h);for(let i=0;i<260;i++){const x=Math.random()*w,y=Math.random()*h,r=rnd(2,9);c.fillStyle=`rgba(${Math.random()<.5?PAL.tint:'255,255,230'},${rnd(.04,.12)})`;for(const dx of[-w,0,w])for(const dy of[-h,0,h]){c.beginPath();c.arc(x+dx,y+dy,r,0,TAU);c.fill()}}});
 nTex.wrapS=nTex.wrapT=T.RepeatWrapping;nTex.repeat.set(1400/6,gl/6);
 add(scene,gg,lam(0xffffff,{vertexColors:true,map:nTex}),0,0,gl/2-300);
 // road
 const road=(w,col,y)=>{const m=add(scene,new T.PlaneGeometry(w,D+14).rotateX(-Math.PI/2),lam(col,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),0,y,(D+6)/2-8)};
 road(6,PAL.road[0],.04);road(2.2,PAL.road[1],.06);
 // hills: low-poly ridges at far end and both sides
 const flat=mars||merc; // Mars mesas and Mercury scarps: flat-topped, steep-sided; the Moon: low rounded rises
 const ridge=(col,len,h,seed,thick)=>{
  const s=new T.Shape(),n=Math.max(10,Math.round(len/70)),hk=moon?.55:merc?.5:1;s.moveTo(-len/2,-3);
  for(let i=0;i<=n;i++){const u=i/n;let f=.3+.7*Math.abs(Math.sin(u*9+seed)*.6+Math.sin(u*23+seed*2)*.4);if(flat)f=Math.min(f,.62)*1.1;s.lineTo(-len/2+u*len,h*hk*f)}
  s.lineTo(len/2,-3);s.closePath();
  const gm=new T.ExtrudeGeometry(s,{depth:thick,bevelEnabled:false});gm.translate(0,0,-thick/2);
  return new T.Mesh(gm,lam(col,{flatShading:true}));
 };
 [[PAL.ridge[0],1.1,110,1],[PAL.ridge[1],.65,60,2.3],[PAL.ridge[2],.3,28,4.1]].forEach(([c,f,h,sd])=>{const r=ridge(c,HS*2.4,h*HS/1000,sd,40);r.position.set(0,0,D+30+f*HS);scene.add(r)});
 [[PAL.ridge[2],.18,10,5],[PAL.ridge[1],.32,32,7],[PAL.ridge[0],.5,70,9]].forEach(([c,f,h,sd])=>[-1,1].forEach(sd2=>{
  const r=ridge(c,D+HS*1.6,h*HS/1000,sd+sd2,40);r.rotation.y=Math.PI/2;r.position.set(sd2*Math.max(90,f*HS),0,(D+HS*.8)/2-100);scene.add(r)}));
 // scattered bushes / rocks / grass tufts along the road, distance posts every 100 m
 {
  const fp=[.25,.5,.75].map((f,i)=>[i%2?4.5:-4.5,D*f]),o3=new T.Object3D();
  const scatter=(geo,n,y0,sMin,sMax,cols,flat)=>{
   geo.computeBoundingBox();const ext=geo.boundingBox.max.y,im=new T.InstancedMesh(geo,lam(0xffffff,{flatShading:true}),n);
   for(let i=0;i<n;i++){let x,z,t=0;do{x=(Math.random()<.5?-1:1)*(3.6+Math.pow(Math.random(),2)*(flat?10:16));z=rnd(6,D+6)}while(fp.some(p=>Math.hypot(x-p[0],z-p[1])<1.5)&&t++<9);
    let sc=rnd(sMin,sMax),sy=sc*(flat?rnd(.5,.9):rnd(.8,1.2));if(z<60&&Math.abs(x)<6){const k=Math.min(1,1.2/(y0*sc+sy*ext));sc*=k;sy*=k} // keep near-shooter scatter <=1.2 m, clear of the sight line
    o3.position.set(x,y0*sc,z);o3.rotation.set(0,rnd(0,TAU),0);o3.scale.set(sc*rnd(.8,1.3),sy,sc*rnd(.8,1.3));o3.updateMatrix();im.setMatrixAt(i,o3.matrix);
    im.setColorAt(i,cc.setHex(cols[i%cols.length]).multiplyScalar(rnd(.85,1.15)))}
   scene.add(im)};
  if(!airless&&!mars)scatter(new T.IcosahedronGeometry(1,0),clamp(Math.round(D*.15),60,300),.45,.5,1.3,[0x4a5f3a,0x5a6e45,0x6b7a45,0x3f5236],false);
  scatter(new T.DodecahedronGeometry(1,0),clamp(Math.round(D*.1),40,200)*(airless||mars?2:1),.3,.2,.7,mars?[0x8a4a2e,0x6e3a24,0xa8643c]:merc?[0x6a645e,0x4a4643,0x57524d]:airless?[0x9a9893,0x7a7873,0x6a6864]:[0x76736a,0x5c5a52,0x8a8068],true);
  if(mars||merc)scatter(new T.DodecahedronGeometry(1,0),clamp(Math.round(D*.03),12,60),.4,.9,2.4,mars?[0x7d4630,0x93543a]:[0x5a554f,0x4a4642],true); // boulders
  if(!airless&&!mars)scatter(new T.ConeGeometry(.1,.45,5).translate(0,.22,0),clamp(Math.round(D*.3),150,500),0,.6,1.6,[0x8a8c52,0x6f7f45,0x9a9a5a],false);
  if(airless){ // craters: dark floor disc with a lighter raised rim
   const nc=Math.round(clamp(D*(merc?.14:.07),40,merc?420:210)),rMax=merc?12:6,floor=new T.InstancedMesh(new T.CircleGeometry(1,20).rotateX(-Math.PI/2),new T.MeshLambertMaterial({color:merc?0x2f2b29:0x55534f,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),nc),
    rim=new T.InstancedMesh(new T.RingGeometry(.86,1.18,24).rotateX(-Math.PI/2),new T.MeshLambertMaterial({color:merc?0x7a736c:0xa8a6a1,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),nc);
   for(let i=0;i<nc;i++){const r=(.8+Math.pow(Math.random(),2.2)*rMax)*rnd(.8,1.2),x=(Math.random()<.5?-1:1)*(r+5+Math.pow(Math.random(),1.6)*(merc?70:50)),z=rnd(8,D+60);
    o3.position.set(x,.07,z);o3.rotation.set(0,0,0);o3.scale.set(r,1,r*rnd(.85,1));o3.updateMatrix();floor.setMatrixAt(i,o3.matrix);rim.setMatrixAt(i,o3.matrix)}
   scene.add(floor,rim);
  }
  const postG=new T.BoxGeometry(.08,1.1,.08),postM=lam(0xe9ebda),signG=new T.PlaneGeometry(.5,.28).rotateY(Math.PI);
  for(let d=100;d<D;d+=100){
   add(scene,postG,postM,-3.6,.55,d);
   const t=tex(128,64,(c,w,h)=>{c.fillStyle='#e9ebda';c.fillRect(0,0,w,h);c.fillStyle='#141b18';c.font='bold 40px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(d),w/2,h/2+2)});
   add(scene,signG,new T.MeshBasicMaterial({map:t}),-3.6,1.15,d-.06);
  }
 }
 // ---- wind flags ----
 const wd=W.east===0?0:(typeof W.east==='number'?Math.sign(W.east):W.east?1:-1);
 const flags=[.25,.5,.75].map((f,i)=>{
  const st=clamp(fl[i]||1,1,3),x=i%2?4.5:-4.5,z=D*f,grp=new T.Group();grp.position.set(x,0,z);scene.add(grp);
  add(grp,new T.CylinderGeometry(.03,.04,3.4,6),lam(0x292e22),0,1.7,0);
  const N=10,pos=new Float32Array((N+1)*6),idx=[],base=WD.flagMs[st-1]; // base: mean flag speed, m/s (Earth: 1/2/3 marks = 2/4/6)
  for(let j=0;j<N;j++){const a=j*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setIndex(idx);
  const m=add(grp,geo,lam(0xf5ad53,{side:T.DoubleSide}),0,3.3,0);m.frustumCulled=false;
  const q={x,z,gust:(Array.isArray(W.gust)?W.gust[i]:W.gust)||0,ph:i,last:0}; // W.gust: number or one value per flag
  // effective speed = mean + shared gust; droop angle from the pole 25° at 1 m/s, +13° per m/s, saturating near 88°, flap frequency and cloth length grow with speed
  q.base=base;
  if(airless){ // no air: a rigid horizontal rod holds the cloth out, like the Apollo flags; nothing moves
   const d=wd||1,L=1.1;
   add(grp,new T.CylinderGeometry(.015,.015,L,6).rotateZ(Math.PI/2),lam(0xb8bcc0),-d*L/2,3.3,0);
   q.upd=()=>{if(q.set)return;q.set=1;for(let j=0;j<=N;j++){const px=-d*L*j/N;pos.set([px,0,0,px,-.72,0],j*6)}geo.attributes.position.needsUpdate=true;geo.computeVertexNormals()};
   q.upd(0);return q;
  }
  q.upd=t=>{const dt=Math.min(.2,Math.max(0,t-q.last));q.last=t;
   if(mars){ // thin air: strong wind holds the cloth almost straight and level; only a small ripple. Strength shows in the cloth length, not the droop.
    const s=Math.max(.3,base+q.gust),th=(s<4?25+16*(s-1):86+3*(1-Math.exp(-(s-4)/4)))*Math.PI/180,L=.9+.03*s,A=.006+.0012*s;
    q.ph+=dt*(1.5+.12*s);
    const sn=Math.sin(th),cs=Math.cos(th);
    for(let j=0;j<=N;j++){const u=j/N,px=-wd*L*u*sn,py=-L*u*cs-.03*u*u*L+A*.4*Math.sin(q.ph-u*7)*u,pz=A*Math.sin(q.ph*.89-u*6)*u*L,w=.42*(1-.5*u);pos.set([px,py,pz,px,py-w,pz],j*6)}
    geo.attributes.position.needsUpdate=true;geo.computeVertexNormals();return;
   }
   const s=Math.max(.3,base+q.gust),th=(s<5.5?25+13*(s-1):84+4*(1-Math.exp(-(s-5.5)/2)))*Math.PI/180,L=.7+.275*s,A=.02+.025*s;
   q.ph+=dt*(2+1.7*s);
   const sn=Math.sin(th),cs=Math.cos(th);
   for(let j=0;j<=N;j++){const u=j/N,px=-wd*L*u*sn,py=-L*u*cs-.12*u*u*L+A*.4*Math.sin(q.ph-u*7)*u,pz=A*Math.sin(q.ph*.89-u*6)*u*L,w=.42*(1-.85*u);pos.set([px,py,pz,px,py-w,pz],j*6)}
   geo.attributes.position.needsUpdate=true;geo.computeVertexNormals()};
  q.upd(0);return q;
 });

 // ---- Mars: blowing dust, streaks and specks drifting with the local wind (density, length and opacity grow with the speed) ----
 let dustUpd=()=>{};
 if(mars){
  const NS=420,NP=520,XR=48,sx=new Float32Array(NS),sy=new Float32Array(NS),sz=new Float32Array(NS),sl=new Float32Array(NS),lp=new Float32Array(NS*6),
   px=new Float32Array(NP),py=new Float32Array(NP),pz=new Float32Array(NP),pp=new Float32Array(NP*3);
  for(let i=0;i<NS;i++){sx[i]=rnd(-XR,XR);sy[i]=rnd(.3,9);sz[i]=4+(D+30)*Math.pow(Math.random(),1.5);sl[i]=rnd(.6,1.4)}
  for(let i=0;i<NP;i++){px[i]=rnd(-XR,XR);py[i]=rnd(.2,7);pz[i]=rnd(3,Math.min(D,320))}
  const lg=new T.BufferGeometry();lg.setAttribute('position',new T.BufferAttribute(lp,3));lg.frustumCulled=false;
  const lm=new T.LineBasicMaterial({color:0xf2d3ae,transparent:true,opacity:.4,depthWrite:false}),streaks=new T.LineSegments(lg,lm);streaks.frustumCulled=false;scene.add(streaks);
  const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(pp,3));
  const pm=new T.PointsMaterial({color:0xf0d0a8,size:2.2,sizeAttenuation:false,transparent:true,opacity:.35,depthWrite:false}),specks=new T.Points(pg,pm);specks.frustumCulled=false;scene.add(specks);
  const spd=z=>{const u=z/D,a=flags[0].base+flags[0].gust,b=flags[1].base+flags[1].gust,c=flags[2].base+flags[2].gust;return Math.max(0,u<=.25?a:u<=.5?a+(b-a)*(u-.25)/.25:u<=.75?b+(c-b)*(u-.5)/.25:c)};
  dustUpd=dt=>{
   const avg=(spd(D*.25)+spd(D*.5)+spd(D*.75))/3,k=clamp(avg/25,.1,1),nS=Math.round(NS*clamp(.2+k,.2,1)),dirx=-(wd||1);
   lm.opacity=.15+.4*k;pm.opacity=.15+.3*k;
   for(let i=0;i<nS;i++){
    const v=spd(sz[i]);sx[i]+=dirx*v*dt;if(sx[i]>XR)sx[i]-=2*XR;else if(sx[i]<-XR)sx[i]+=2*XR;
    const len=clamp(v*.05*(1+sz[i]/150),.25,9)*sl[i];lp.set([sx[i],sy[i],sz[i],sx[i]-dirx*len,sy[i]-len*.03,sz[i]],i*6);
   }
   lg.setDrawRange(0,nS*2);lg.attributes.position.needsUpdate=true;
   for(let i=0;i<NP;i++){const v=spd(pz[i]);px[i]+=dirx*v*dt*.9;if(px[i]>XR)px[i]-=2*XR;else if(px[i]<-XR)px[i]+=2*XR;pp.set([px[i],py[i],pz[i]],i*3)}
   pg.attributes.position.needsUpdate=true;
  };
  dustUpd(0);
 }
 // ---- target, stand, berm ----
 const wood=lam(0x6b4a2f);
 const barY=Ty+R1+.12;
 [-1,1].forEach(s=>{add(scene,new T.BoxGeometry(.12,barY,.12),wood,s*(R1+.3),barY/2,D+.25);
  const br=add(scene,new T.BoxGeometry(.08,barY*.9,.08),wood,s*(R1+.3),barY*.45,D+1.1);br.rotation.x=.45});
 add(scene,new T.BoxGeometry(2*R1+.8,.12,.14),wood,0,barY,D+.25);
 add(scene,new T.BoxGeometry(.12,Ty,.12),lam(0x2b3025),0,Ty/2,D+.08);
 const mk=(a,h,b,cx,cz,seed)=>{
  const g0=new T.SphereGeometry(1,12,8),p=g0.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),j=1+.1*Math.sin(x*5+seed)*Math.cos(z*4+y*3);p.setXYZ(i,x*a*j,y*h*(.95+.05*j),z*b*j)}
  const ng=g0.toNonIndexed(),q=ng.attributes.position,col=new Float32Array(q.count*3),c1=new T.Color(PAL.mound[0]),c2=new T.Color(PAL.mound[1]),c3=new T.Color(PAL.mound[2]);
  for(let i=0;i<q.count;i+=3){const cy=(q.getY(i)+q.getY(i+1)+q.getY(i+2))/3/h;cc.copy(c1).lerp(c2,Math.abs(Math.sin(i*5.7+seed)));if(cy>.55)cc.lerp(c3,.55);for(let t=0;t<3;t++)cc.toArray(col,(i+t)*3)}
  ng.setAttribute('color',new T.BufferAttribute(col,3));ng.computeVertexNormals();
  add(scene,ng,lam(0xffffff,{vertexColors:true,flatShading:true}),cx,0,cz)};
 mk(mound.a,mound.h,mound.b,0,mound.cz,1);mk(mound.a*.55,2.4,mound.b*.85,mound.a*1.05,mound.cz+1,2);mk(mound.a*.55,2.2,mound.b*.85,-mound.a*1.1,mound.cz+.5,3);
 const pl=new T.Group();pl.position.set(0,Ty+R1,D);scene.add(pl);
 const plTex=(tex(1024,1024,(c,w)=>{
  const r=w/2;c.translate(r,r);
  [[1,'#ded4a6'],[.76,'#3b4c45'],[.48,'#ded4a6'],[.23,'#d87249']].forEach(([f,col])=>{c.fillStyle=col;c.beginPath();c.arc(0,0,r*f,0,TAU);c.fill()});
  c.strokeStyle='#141b1888';c.lineWidth=3;
  const out=n=>f10+(1-f10)*(10-n)/9; // outer edge of ring n as a fraction of the plate radius (10-ring is a disc)
  for(let n=1;n<=10;n++){c.beginPath();c.arc(0,0,r*out(n),0,TAU);c.stroke()}
  c.font=`bold ${w*.03}px sans-serif`;c.textAlign='center';c.textBaseline='middle';
  for(let n=1;n<=9;n++){const f=(out(n)+out(n+1))/2;c.fillStyle=f>.76||(f>.23&&f<=.48)||f<=.23?'#1b241f':'#e9ebda';
   [[1,0],[-1,0],[0,1],[0,-1]].forEach(([a,b])=>c.fillText(String(n),a*r*f,b*r*f))}
 }));
 add(pl,new T.CircleGeometry(R1,64).rotateY(Math.PI),new T.MeshBasicMaterial({map:plTex,fog:false}),0,-R1,-.021);
 add(pl,new T.CylinderGeometry(R1,R1,.04,48).rotateX(Math.PI/2),lam(0x2b3025),0,-R1,0);
 // light backer board 5 cm behind the plate + high-visibility marker pole with flag (unfogged so they stay findable at long range)
 {const bs=4.4*R1,bt=.02,bz=.05+bt/2+.02,sD=Math.max(1,D/1000),ph=1.5*Math.max(1,D/1500),pw=.04*sD,top=R1*2.2;
  add(pl,new T.BoxGeometry(bs,bs,bt),new T.MeshBasicMaterial({color:0xe9e4cf,fog:false}),0,-R1,bz);
  const om=new T.MeshBasicMaterial({color:0xff8a1f,fog:false,side:T.DoubleSide});
  add(pl,new T.BoxGeometry(pw,ph,pw),om,0,-R1+top+ph/2,bz+bt/2+pw/2);
  add(pl,new T.PlaneGeometry(.5*sD,.3*sD),om,.25*sD+pw/2,-R1+top+ph-.15*sD,bz+bt/2+pw/2)}
 // ---- impact effects (real-time scope view): bullet holes persist, flash / swing / dust are short ----
 const fx=[],glowTex=tex(64,64,(c,w)=>{const gr=c.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'#fff');gr.addColorStop(.35,'#ffd9a0cc');gr.addColorStop(1,'#ff8a3000');c.fillStyle=gr;c.fillRect(0,0,w,w)}),
  puffTex=tex(64,64,(c,w)=>{const gr=c.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'#cfc6aecc');gr.addColorStop(.6,'#b8b09a77');gr.addColorStop(1,'#b8b09a00');c.fillStyle=gr;c.fillRect(0,0,w,w)}),
  holeMat=new T.MeshBasicMaterial({color:0x090c0a,fog:false,polygonOffset:true,polygonOffsetFactor:-2}),holeR=Math.max(.012,D*.00008);
 let swingT=9;
 const burst=(map,add,x,y,z,size,life,grow)=>{
  const sp=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthWrite:false,fog:false,blending:add?T.AdditiveBlending:T.NormalBlending}));
  sp.position.set(x,y,z);sp.scale.set(size,size,1);scene.add(sp);fx.push({sp,age:0,life,size,grow});
 };
 const addHole=h=>{const m=new T.Mesh(new T.CircleGeometry(holeR,12).rotateY(Math.PI),holeMat);m.position.set(-h.lat,h.dy-R1,-.03);pl.add(m)};
 // h: {hit, lat (m, + right), dy (m above the plate centre), still}
 const addImpact=h=>{
  const y=Ty+h.dy;
  if(h.hit){addHole(h);if(!h.still){burst(glowTex,true,-h.lat,y,D-.15,Math.max(.4,D*.0008),.3,1.2);swingT=0}}
  else if(!h.still){ // dust where the bullet lands: ground short of the plane when low, else the berm face, clamped to the berm
   const onBerm=y>.1&&Math.abs(h.lat)<mound.a*.9,py=onBerm?Math.min(y,mound.h-.5):.08,pz=onBerm?mound.cz-mound.b*.8:D-2;
   burst(puffTex,false,-h.lat,py,pz,Math.max(.8,D*.0012),1.3,3.2);
  }
 };
 let clock=0;
 return{scene,sky,plate:pl,flags,mound,R1,HS,clearColor:0xbfbc95,targetCenter:V(0,Ty,D),lam,add,tex,
  update(dt){clock+=dt;for(const f of flags)f.upd(clock);dustUpd(dt);
   if(swingT<3){swingT+=dt;pl.rotation.x=.03*Math.sin(swingT*16)*Math.exp(-swingT*4)}else if(pl.rotation.x)pl.rotation.x=0;
   for(let i=fx.length-1;i>=0;i--){const e=fx[i];e.age+=dt;const u=e.age/e.life;
    if(u>=1){scene.remove(e.sp);e.sp.material.dispose();fx.splice(i,1);continue}
    const sc=e.size*(1+e.grow*u);e.sp.scale.set(sc,sc,1);e.sp.material.opacity=(1-u)**1.5}},
  addImpact,addHole,
  setWind(g){flags.forEach((f,i)=>{f.gust=g[i]??g[0]??0})}, // gust per flag, m/s added to the mean flag speed
  dispose(){scene.traverse(m=>{m.geometry?.dispose();[].concat(m.material||[]).forEach(mt=>{mt.map?.dispose();mt.dispose()})})}};
}
