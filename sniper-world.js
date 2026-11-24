// Shared 3D range world for the Sniper scope view and the bullet-flight replay.
// World: shooter at the origin, +z downrange, +y up, world x = -(lateral right) so a camera looking +z sees +lateral on screen right.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),rnd=(a=0,b=1)=>a+Math.random()*(b-a),TAU=Math.PI*2;
export const Y0=1.5;
export const moundOf=(D,R1)=>({a:Math.max(2.5,2*R1+2),b:3.5,h:3.5,cz:D+5});

/** Builds the range. Returns scene + handles; the caller owns the renderer and camera. */
export function buildWorld(T,{distance:D,wind:W={},targetRadiusM:R1}){
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),fl=W.flags||[1,1,1],HS=clamp(D,600,1200); // HS scales hills / fog so short ranges still get depth
 const scene=new T.Scene();scene.fog=new T.Fog(0xbfbc95,Math.max(150,D*.35),D*2.4+600); // scaled to the real distance: target is only ~13-29% hazed at 300-3000 m
 const cc=new T.Color(),mound=moundOf(D,R1);
 const lam=(c,x={})=>{const m=new T.MeshLambertMaterial({color:c,...x});return m};
 const add=(par,geo,mat,x=0,y=0,z=0)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);par.add(m);return m};
 const tex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t};
 // sky dome with vertical gradient
 const skyG=new T.SphereGeometry(3200,24,32),sp=skyG.attributes.position,sc=new Float32Array(sp.count*3),cA=new T.Color(0x354f52),cB=new T.Color(0xbfbc95);
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
   geo.computeBoundingBox();const ext=geo.boundingBox.max.y,im=new T.InstancedMesh(geo,lam(0xffffff,{flatShading:true}),n);
   for(let i=0;i<n;i++){let x,z,t=0;do{x=(Math.random()<.5?-1:1)*(3.6+Math.pow(Math.random(),2)*(flat?10:16));z=rnd(6,D+6)}while(fp.some(p=>Math.hypot(x-p[0],z-p[1])<1.5)&&t++<9);
    let sc=rnd(sMin,sMax),sy=sc*(flat?rnd(.5,.9):rnd(.8,1.2));if(z<60&&Math.abs(x)<6){const k=Math.min(1,1.2/(y0*sc+sy*ext));sc*=k;sy*=k} // keep near-shooter scatter <=1.2 m, clear of the sight line
    o3.position.set(x,y0*sc,z);o3.rotation.set(0,rnd(0,TAU),0);o3.scale.set(sc*rnd(.8,1.3),sy,sc*rnd(.8,1.3));o3.updateMatrix();im.setMatrixAt(i,o3.matrix);
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
 add(pl,new T.CircleGeometry(R1,64).rotateY(Math.PI),new T.MeshBasicMaterial({map:plTex,fog:false}),0,-R1,-.021);
 add(pl,new T.CylinderGeometry(R1,R1,.04,48).rotateX(Math.PI/2),lam(0x2b3025),0,-R1,0);
 // light backer board 5 cm behind the plate + high-visibility marker pole with flag (unfogged so they stay findable at long range)
 {const bs=4.4*R1,bt=.02,bz=.05+bt/2+.02,sD=Math.max(1,D/1000),ph=1.5*Math.max(1,D/1500),pw=.04*sD,top=R1*2.2;
  add(pl,new T.BoxGeometry(bs,bs,bt),new T.MeshBasicMaterial({color:0xe9e4cf,fog:false}),0,-R1,bz);
  const om=new T.MeshBasicMaterial({color:0xff8a1f,fog:false,side:T.DoubleSide});
  add(pl,new T.BoxGeometry(pw,ph,pw),om,0,-R1+top+ph/2,bz+bt/2+pw/2);
  add(pl,new T.PlaneGeometry(.5*sD,.3*sD),om,.25*sD+pw/2,-R1+top+ph-.15*sD,bz+bt/2+pw/2)}
 let clock=0;
 return{scene,sky,plate:pl,flags,mound,R1,HS,clearColor:0xbfbc95,targetCenter:V(0,Y0,D),lam,add,tex,
  update(dt){clock+=dt;for(const f of flags)f.upd(clock)},
  dispose(){scene.traverse(m=>{m.geometry?.dispose();[].concat(m.material||[]).forEach(mt=>{mt.map?.dispose();mt.dispose()})})}};
}
