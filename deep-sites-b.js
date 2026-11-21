// Deepstrike site models 6-11: Data centre, Port, Air defence, Factory, Substation, Launcher base.
// Contract: see deep-sites.js. Low-poly, shared geometries/materials, damage is absolute per severity.
import * as THREE from 'three';

function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function kit(seed,salt){
 const rng=mulberry32(((seed>>>0)^salt)>>>0);
 const group=new THREE.Group();
 const geos={
  box:new THREE.BoxGeometry(1,1,1),
  cyl:new THREE.CylinderGeometry(1,1,1,10),
  taper:new THREE.CylinderGeometry(.66,1,1,10),
  cone:new THREE.ConeGeometry(1,1,10),
  dome:new THREE.SphereGeometry(1,12,6,0,Math.PI*2,0,Math.PI/2)
 };
 const mats=new Map(),owned=[];
 const mat=(c,o)=>{const key=c+(o?JSON.stringify(o):'');let m=mats.get(key);if(!m){m=new THREE.MeshLambertMaterial({color:c,...(o||{})});mats.set(key,m)}return m};
 const own=(c,o)=>{const m=new THREE.MeshLambertMaterial({color:c,...(o||{})});owned.push(m);return m};
 const burnt=mat(0x1d1c1b);
 const put=(g,p,col,x,y,z,sx,sy,sz)=>{
  const m=new THREE.Mesh(geos[g],typeof col==='number'?mat(col):col);
  m.position.set(x,y+(g==='dome'?0:sy/2),z);m.scale.set(sx,sy,sz);m.userData.mat=m.material;p.add(m);return m;
 };
 const box=(p,c,x,y,z,w,h,d)=>put('box',p,c,x,y,z,w,h,d);
 const cyl=(p,c,x,y,z,r,h)=>put('cyl',p,c,x,y,z,r,h,r);
 const taper=(p,c,x,y,z,r,h)=>put('taper',p,c,x,y,z,r,h,r);
 const cone=(p,c,x,y,z,r,h)=>put('cone',p,c,x,y,z,r,h,r);
 const dome=(p,c,x,y,z,r,h)=>put('dome',p,c,x,y,z,r,h,r);
 // horizontal cylinder, y is its centre height; axis 'x' or 'z'
 const hcyl=(p,c,x,y,z,r,len,axis)=>{
  const m=put('cyl',p,c,x,0,z,r,len,r);m.position.y=y;
  if(axis==='x')m.rotation.z=Math.PI/2;else m.rotation.x=Math.PI/2;return m;
 };
 const piv=(p,x,y,z)=>{const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g};
 const scorch=m=>{m.material=burnt};
 const fence=(p,x0,x1,z0,z1,col,gap)=>{
  const w=x1-x0,d=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2;
  for(const y of [.9,2.1]){
   box(p,col,cx,y,z0,w,.12,.12);box(p,col,cx,y,z1,w,.12,.12);
   box(p,col,x0,y,cz,.12,.12,d);box(p,col,x1,y,cz,.12,.12,d);
  }
  for(let x=x0;x<=x1+.1;x+=11){box(p,col,x,0,z0,.3,2.6,.3);box(p,col,x,0,z1,.3,2.6,.3)}
  for(let z=z0;z<=z1+.1;z+=11){box(p,col,x0,0,z,.3,2.6,.3);box(p,col,x1,0,z,.3,2.6,.3)}
 };
 const V=(x,y,z)=>new THREE.Vector3(x,y,z);
 const finish=o=>({group,...o,dispose(){
  for(const g of Object.values(geos))g.dispose();
  for(const m of mats.values())m.dispose();
  for(const m of owned)m.dispose();
  if(group.parent)group.parent.remove(group);
 }});
 return {rng,group,mat,own,burnt,box,cyl,taper,cone,dome,hcyl,piv,scorch,fence,V,finish};
}

// ---------------------------------------------------------------- 6 Data centre
function b6(seed){
 const k=kit(seed,0xd47a0001),{rng,group,box,cyl,hcyl,piv,scorch,fence,V,own,mat}=k;
 box(group,0x34383a,0,-.3,0,94,.3,74);
 box(group,0x25282a,0,-.28,32,94,.05,6); // service road
 const blocks=[{x:-22,z:-20,w:40,d:20,h:8},{x:24,z:-20,w:36,d:20,h:8},{x:-8,z:6,w:52,d:16,h:7}];
 const parts=blocks.map((b,i)=>{
  const g=piv(group,b.x,0,b.z),wall=piv(g,0,0,0),roof=piv(g,0,b.h,0);
  box(wall,0x6c7176,0,0,0,b.w,b.h,b.d);
  box(roof,0x4c5156,0,0,0,b.w+.6,.4,b.d+.6);
  const glow=own(0x1b3550,{emissive:0x2f8cff,emissiveIntensity:1.3});
  for(const sy of [b.h*.62,b.h*.3])box(wall,glow,0,sy,b.d/2+.06,b.w*.82,.5,.1);
  box(wall,glow,b.w/2+.06,b.h*.5,0,.1,.5,b.d*.7);
  box(wall,0x2d3235,-b.w*.3,0,b.d/2+.05,4,3,.2); // service door
  const chillers=[];
  const cols=Math.floor(b.w/7),rows=2;
  for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
   const cg=piv(roof,(c-(cols-1)/2)*7,.4,(r-.5)*(b.d*.42));
   box(cg,0x9aa0a3,0,0,0,4.6,1.6,3.2);
   const fan=cyl(cg,0x2a2d2f,0,1.6,0,1.2,.25);
   chillers.push({cg,fan,r:rng(),dx:(rng()-.5)*30,dz:(rng()-.5)*26,rx:rng()*3,rz:rng()*3,gx:cg.position.x,gz:cg.position.z});
  }
  return {b,g,wall,roof,glow,chillers};
 });
 // diesel generators with exhaust
 const gens=[];
 for(let i=0;i<5;i++){
  const x=-34+i*9,g=piv(group,x,0,26);
  const body=box(g,0x5f6a5e,0,0,0,7,3.2,3.2);
  box(g,0x3b3f3d,-4.2,0,0,1.6,2.6,2.8);
  const ex=piv(g,2,3.2,0);cyl(ex,0x2e2f30,0,0,0,.35,3.4);cyl(ex,0x1c1c1c,0,3.4,0,.5,.3);
  gens.push({body,ex,g});
 }
 const tanks=[hcyl(group,0x7a7f73,-26,1.3,33,1.3,8,'x'),hcyl(group,0x7a7f73,-14,1.3,33,1.3,8,'x')];
 // yard fence and gate
 fence(group,-44,44,-34,36,0x777b7d);
 // substation corner
 const sub=piv(group,36,0,22),subT=[];
 for(let i=0;i<2;i++){const t=box(sub,0x6f7a6d,i*6-3,0,0,4,3,3.4);subT.push(t);cyl(sub,0xb8b2a2,i*6-3,3,0,.35,1.4)}
 for(const dx of [-6,6])box(sub,0x646a6d,dx,0,-6,.5,8,.5);
 box(sub,0x646a6d,0,8,-6,12.5,.4,.4);
 for(let i=-2;i<=2;i++)cyl(sub,0xa8b0a8,i*2.4,6.4,-6,.2,1.6);
 // cable tray / pipes between blocks
 box(group,0x555a5c,-2,3,-4,.6,.5,18);
 k.cooling=null;
 const dmgStrips=(i,v)=>{
  const p=parts[i];
  if(v===0){p.glow.emissive.setHex(0x000000);p.glow.color.setHex(0x14181b)}
  else p.glow.emissiveIntensity=v;
 };
 const collapse=(p,f,tilt)=>{
  p.wall.scale.y=f;p.roof.position.y=p.b.h*f;
  p.g.rotation.z=tilt;p.g.rotation.x=tilt*.6;
 };
 function applyDamage(s){
  if(s>=1){
   dmgStrips(2,0);dmgStrips(0,.8);dmgStrips(1,.8);
   scorch(gens[0].body);
   for(const c of parts.flatMap(p=>p.chillers))if(c.r<.25)blow(c);
  }
  if(s>=2){
   dmgStrips(1,0);
   collapse(parts[2],.6,.03);
   for(const c of parts.flatMap(p=>p.chillers))if(c.r<.75)blow(c);
   for(let i=0;i<3;i++)scorch(gens[i].body);
   gens[1].ex.rotation.z=.5;
  }
  if(s>=3){
   dmgStrips(0,0);
   collapse(parts[2],.35,.06);collapse(parts[1],.55,-.05);collapse(parts[0],.8,.03);
   for(const c of parts.flatMap(p=>p.chillers))blow(c);
   for(const g of gens){scorch(g.body);g.ex.rotation.z=.9}
   for(const t of subT)scorch(t);
   for(const t of tanks)scorch(t);
  }
 }
 function blow(c){
  c.cg.position.set(c.gx+c.dx,-c.cg.parent.position.y+.8,c.gz+c.dz);
  c.cg.rotation.set(c.rx,c.rz,c.rx*.5);scorch(c.fan);
 }
 return k.finish({radius:58,aim:V(-8,7.5,6),applyDamage,
  fireSpots:[V(-22,9,-20),V(-8,6,6),V(-18,3.5,26),V(24,9,-20),V(36,3.5,22)]});
}

// ---------------------------------------------------------------- 7 Port
function b7(seed){
 const k=kit(seed,0xd47a0007),{rng,group,box,cyl,cone,hcyl,piv,scorch,own,V}=k;
 box(group,0x4a4d4c,0,-.8,-15,100,.8,40);
 box(group,0x585b5c,0,-4,5.7,100,3.4,1.4);
 const water=own(0x2f4a5c,{transparent:true,opacity:.86});
 box(group,water,0,-5,24,134,3.8,38);
 for(let i=0;i<11;i++)cyl(group,0xc8b45a,-45+i*9,0,3.6,.5,1.1);
 // cranes
 const cranes=[-16,16].map(x=>{
  const p=piv(group,x,0,1);
  for(const sx of [-4,4])for(const sz of [-3.2,3.2])box(p,0xc8702e,sx,0,sz,.9,18,.9);
  for(const sz of [-3.2,3.2])box(p,0xb0602a,0,18,sz,9,1,1);
  for(const sx of [-4,4])box(p,0xb0602a,sx,18,0,1,1,7.4);
  for(const sz of [-3.2,3.2])for(const sy of [6,12]){const d=box(p,0x8a5428,0,sy,sz,9,.5,.5);d.rotation.z=.08}
  const boom=piv(p,0,19.2,0);
  box(boom,0xd07a30,0,0,10,1.6,1.5,38);
  box(boom,0x8d5a30,0,0,-12,2.4,2.2,6);
  const trolley=box(boom,0x2c2f31,0,-1.8,18,2.6,1.8,3);
  box(boom,0x2c2f31,0,-6,18,.2,4.4,.2);
  return {p,boom,trolley,x};
 });
 // ship
 const ship=piv(group,0,0,16);
 box(ship,0x5b3a36,0,-3.5,0,56,6,11);
 const bow=box(ship,0x5b3a36,28,-3.5,0,7.8,6,7.8);bow.rotation.y=Math.PI/4;
 box(ship,0x2f3436,0,2.5,0,55,.3,10.6);
 box(ship,0xc9c7bf,-19,2.8,0,12,6,9);
 box(ship,0xd9d6cc,-19,8.8,0,7,3.6,7.4);
 cyl(ship,0xd4742c,-22,8.8,0,1.5,5);cyl(ship,0x222,-22,13.8,0,1.55,.5);
 cyl(ship,0x9a9a92,12,2.8,0,.2,12);
 const deckBoxes=[];
 const pal=[0xa8483a,0x3f6b82,0xb99a3c,0x5b7a4e,0x8a6a4e,0x6a6f78];
 for(let c=0;c<4;c++)for(let r=0;r<2;r++)for(let l=0;l<2;l++){
  if(rng()<.15)continue;
  deckBoxes.push(box(ship,pal[(rng()*6)|0],-6+c*6.6,2.8+l*2.6,(r-.5)*3,6.2,2.5,2.5));
 }
 // container yard
 const conts=[];
 for(let i=0;i<7;i++)for(let j=0;j<3;j++){
  const h=1+((rng()*3)|0),col=pal[(rng()*6)|0];
  for(let l=0;l<h;l++){
   const m=box(group,col,-40+i*8.6,l*2.6,-27+j*7.2+(l?0:0),6.6,2.55,2.5);
   conts.push({m,x:m.position.x,y:m.position.y,z:m.position.z,r:rng(),dx:(rng()-.5)*26,dz:(rng()-.1)*16,ry:rng()*3,rx:(rng()-.5)*.7});
  }
 }
 // warehouse
 const wh=piv(group,36,0,-22);
 const whBody=box(wh,0x8a867a,0,0,0,16,7,20);
 const roofL=piv(wh,-8,7,0),roofR=piv(wh,8,7,0);
 const sl=box(roofL,0x4f5558,4.4,0,0,9,.4,21);sl.rotation.z=-.0;
 roofL.rotation.z=.28;roofR.rotation.z=-.28;
 const sr=box(roofR,0x4f5558,-4.4,0,0,9,.4,21);
 const roofLm=sl,roofRm=sr;
 box(wh,0xd8a050,0,0,10.05,5,4,.2);
 box(group,0x3a3d3e,36,-.2,-6,16,.2,10);
 const burnConts=()=>{conts.forEach((c,i)=>{if(i%5===0)scorch(c.m)})};
 function pose(c,f){
  c.m.position.set(c.x+c.dx*f,.5+Math.min(c.y,0)+1.25,Math.min(c.z+c.dz*f,3));
  c.m.rotation.set(c.rx,c.ry,c.rx*.4);
 }
 function applyDamage(s){
  if(s>=1){
   cranes[0].boom.rotation.x=-.08;cranes[0].trolley.position.z=22;
   conts.forEach(c=>{if(c.r<.12)pose(c,.25)});
   ship.rotation.z=.07;
   roofL.rotation.z=.5;
  }
  if(s>=2){
   cranes[0].p.rotation.x=.25;cranes[0].boom.rotation.x=.35;
   cranes[1].p.rotation.z=.07;cranes[1].boom.rotation.x=-.12;
   conts.forEach(c=>{if(c.r<.5)pose(c,1)});
   ship.rotation.z=.25;ship.position.y=-1.6;
   roofL.rotation.z=.9;roofR.rotation.z=-.5;
   burnConts();
  }
  if(s>=3){
   cranes[0].p.rotation.x=1.25;cranes[0].p.position.y=-1.5;
   cranes[1].p.rotation.z=.55;cranes[1].p.position.y=-1;cranes[1].boom.rotation.x=.4;
   conts.forEach(c=>{if(c.r<.85)pose(c,1.2)});
   ship.rotation.z=.5;ship.position.y=-3.6;
   deckBoxes.forEach((m,i)=>{m.position.y-=i%2?0:.6;m.rotation.z=.5});
   whBody.scale.y=3;whBody.position.y=1.5;roofL.position.y=3.5;roofR.position.y=3.5;roofL.rotation.z=1.2;roofR.rotation.z=-.9;
   scorch(whBody);scorch(roofLm);
  }
 }
 return k.finish({radius:62,aim:V(0,6,10),applyDamage,
  fireSpots:[V(-19,9,16),V(-16,18,1),V(-20,3,-18),V(36,5,-22),V(10,4,-12)]});
}

// ---------------------------------------------------------------- 8 Air defence
function b8(seed){
 const k=kit(seed,0xd47a0008),{rng,group,box,cyl,dome,hcyl,piv,scorch,own,V}=k;
 box(group,0x3e4136,0,-.3,0,94,.3,74);
 // radar pad and dome
 cyl(group,0x7e7f78,-26,0,-12,11,.4);
 const radar=piv(group,-26,.4,-12);
 cyl(radar,0x9a9a90,0,0,0,5,3);
 const radomeM=dome(radar,0xdedbd0,0,3,0,5.6,5.6);
 // sandbag ring
 const bags=[];
 for(let i=0;i<22;i++){
  const a=i/22*Math.PI*2;
  if(i===5)continue;
  const m=box(group,0xa8996e,-26+Math.cos(a)*13,0,-12+Math.sin(a)*13,4.2,1.4,1.6);
  m.rotation.y=-a+Math.PI/2;bags.push(m);
 }
 // rotating antenna
 const ant=piv(group,-4,0,-20);
 box(ant,0x6f7378,0,0,0,5,.6,5);
 cyl(ant,0x555a5e,0,.6,0,.7,6);
 const dishP=piv(ant,0,6.6,0);
 dishP.rotation.y=.6;
 const dish=box(dishP,0xaeb0a8,0,-2.6,0,12,5.4,.5);
 box(dishP,0x555a5e,0,-.2,1.2,.5,.5,3);
 box(dishP,0xd89a3a,0,-3,0,.8,.8,.8).position.z=2.6;
 // launcher trucks
 const trucks=[];
 const nx=[-26,-8,10,28];
 for(let i=0;i<4;i++){
  const g=piv(group,nx[i],0,16);g.rotation.y=(rng()-.5)*.25;
  const body=[
   box(g,0x56604a,0,.9,0,12,1.3,3.4),
   box(g,0x4a5340,4.8,2.2,0,3,2.6,3.2),
   box(g,0x2c3032,4.8,3.2,1.65,2,.9,.1)
  ];
  for(const x of [-3.5,0,3.5,6])for(const z of [-1.8,1.8])body.push(hcyl(g,0x25282a,x-.3,.9,z,.9,.6,'z'));
  const lp=piv(g,-4,2.4,0);lp.rotation.z=.95;
  const tubes=[];
  for(let a=0;a<2;a++)for(let b=0;b<2;b++){
   const tp=piv(lp,0,(a-.5)*1.5,(b-.5)*1.5);
   box(tp,0x5d6652,4.6,-.5,0,9,1.2,1.2);
   box(tp,0xd89a3a,9.2,-.4,0,.5,1,1);
   tubes.push(tp);
  }
  trucks.push({g,body,lp,tubes,ry:(rng()-.5)});
 }
 // command container
 const cmd=piv(group,12,0,-14);
 const cmdBody=box(cmd,0x5a6256,0,.6,0,10,3.2,3.4);
 box(cmd,0x2e3234,-3,.6,1.75,1.8,2.4,.1);
 box(cmd,0x9a9a90,3,3.8,0,2,.3,2);
 cyl(cmd,0x777,4.5,3.8,1,.12,4);
 // camouflage nets
 const netMat=own(0x4b5a3c,{transparent:true,opacity:.78}),netMat2=own(0x6a6a44,{transparent:true,opacity:.78});
 const burnNet=own(0x1b1a18,{transparent:true,opacity:.8});
 const nets=[[12,-14,0],[-8,16,1],[10,16,0]].map(([x,z,t],i)=>{
  const p=piv(group,x,0,z);
  for(const dx of [-7,7])for(const dz of [-4.5,4.5])box(p,0x4a4035,dx,0,dz,.25,5,.25);
  const m=box(p,i%2?netMat2:netMat,0,5,0,15.5,.25,10);
  return {p,m};
 });
 // lattice mast
 const mast=piv(group,34,0,-12);
 box(mast,0x77797a,0,0,0,2,.8,2);
 for(const [dx,dz] of [[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]])box(mast,0xb0b0a8,dx,0,dz,.15,13,.15);
 for(let i=1;i<6;i++)box(mast,0xb0b0a8,0,i*2.2,0,1.2,.1,1.2);
 const mastTop=piv(mast,0,13,0);
 for(const [dx,dz] of [[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]])box(mastTop,0xc8573a,dx,0,dz,.15,12,.15);
 box(mastTop,0xc8573a,0,12,0,4,.2,.2);cyl(mastTop,0x222,0,12,0,.15,3);
 for(const a of [0,2.1,4.2]){const gl=box(group,0x555,34+Math.cos(a)*6,0,-12+Math.sin(a)*6,.1,14,.1);gl.rotation.set(Math.sin(a)*.4,0,-Math.cos(a)*.4)}
 // supply tent / stores
 const crates=[];
 for(let i=0;i<6;i++)crates.push(box(group,0x65603f,26+(i%3)*3.2,0,12-(i/3|0)*3,2.6,1.8,2.4));
 box(group,0x464a40,-36,-.2,18,9,.1,14);
 function applyDamage(s){
  if(s>=1){
   trucks[0].lp.rotation.z=.5;scorch(trucks[0].body[0]);
   radar.rotation.z=.1;
   dishP.rotation.x=.2;
   mast.rotation.z=.04;
   nets[1].m.material=burnNet;
  }
  if(s>=2){
   trucks[0].lp.rotation.z=.1;trucks[1].lp.rotation.z=.18;trucks[2].lp.rotation.z=.5;
   trucks.forEach((t,i)=>{if(i<2)t.body.forEach(scorch)});
   radar.rotation.z=.55;radar.rotation.x=.2;scorch(radomeM);
   ant.rotation.z=.3;dishP.rotation.x=.6;
   mast.rotation.z=.05;mastTop.rotation.z=.6;
   nets.forEach((n,i)=>{if(i<2){n.m.material=burnNet;n.m.position.y=4.3;n.m.rotation.z=.12}});
   bags.forEach((b,i)=>{if(i%3===0)scorch(b)});
  }
  if(s>=3){
   trucks.forEach((t,i)=>{t.lp.rotation.z=.04+i*.03;t.lp.rotation.y=(t.ry)*.5;t.body.forEach(scorch);t.tubes.forEach((tp,j)=>{tp.rotation.y=(j-1.5)*.1})});
   radar.rotation.z=1.45;radar.rotation.x=.3;radar.position.y=1.8;
   ant.rotation.z=1.4;ant.position.y=.6;
   mastTop.rotation.z=1.4;mastTop.position.y=11;mast.rotation.z=.25;
   nets.forEach(n=>{n.m.material=burnNet;n.m.position.y=2.6;n.m.rotation.z=.3;n.m.scale.y=.4});
   scorch(cmdBody);cmd.rotation.z=.04;
   crates.forEach((c,i)=>{if(i%2===0)scorch(c)});
  }
 }
 return k.finish({radius:58,aim:V(-26,5,-12),applyDamage,
  fireSpots:[V(-26,4,-12),V(10,3,16),V(12,4,-14),V(-8,4,16),V(-4,8,-20)]});
}

// ---------------------------------------------------------------- 9 Factory
function b9(seed){
 const k=kit(seed,0xd47a0009),{rng,group,box,cyl,taper,cone,hcyl,piv,scorch,own,V}=k;
 box(group,0x3b3d3a,0,-.3,0,94,.3,74);
 // saw-tooth halls
 const halls=[{x:-24,z:-16,w:38,d:24,n:6},{x:-24,z:14,w:38,d:20,n:6}].map((h,hi)=>{
  const g=piv(group,h.x,0,h.z);
  const wallM=box(g,0x7b7568,0,0,0,h.w,7,h.d);
  const teeth=[];
  const tw=h.w/h.n;
  for(let i=0;i<h.n;i++){
   const t=piv(g,-h.w/2+i*tw,7,0);
   const slope=box(t,0x56595a,tw/2,0,0,tw*1.02,.35,h.d+.4);slope.rotation.z=.4;slope.position.y=1.0;
   const glass=box(t,0x9fb3b8,tw*.96,.2,0,.25,2.4,h.d*.95);
   teeth.push({t,glass,slope,r:rng()});
  }
  box(g,0xb8964e,0,0,h.d/2+.05,8,4,.2);
  return {g,wallM,teeth};
 });
 // chimneys
 const chim=[[18,-26,30],[26,-26,22],[34,-26,16]].map(([x,z,h],i)=>{
  const p=piv(group,x,0,z),cut=h*.6;
  taper(p,0x8a5a46,0,0,0,2.2,cut);
  const up=piv(p,0,cut,0);
  taper(up,0x8a5a46,0,0,0,2.2*(1-.34*(cut/h)),h-cut);
  cyl(up,0xd8cfc0,0,(h-cut)*.55,0,2.0*.7,1.2);
  cyl(up,0xb0452f,0,h-cut-1.2,0,1.7*.7,1.2);
  return {p,up,h};
 });
 // silos
 const silos=[];
 for(let i=0;i<4;i++){
  const g=piv(group,30+(i%2)*8,0,2+(i>>1)*9);
  const h=14+(i%3)*2;
  const body=cyl(g,0xaeb0a6,0,0,0,3.3,h),capm=cone(g,0x8e9187,0,h,0,3.4,2.2);
  silos.push({g,body,cap:capm,h});
 }
 // pipe gantry
 const pipes=piv(group,0,0,3);
 const pgParts=[];
 for(let i=0;i<7;i++)box(pipes,0x4d5052,-2+i*5.4,0,0,.5,7,.5);
 for(const [y,c] of [[6.3,0xb0452f],[7.2,0x9aa0a2],[8,0x6c7378]])pgParts.push(hcyl(pipes,c,14,y,(y-6.3)*.5,.3,31,'x'));
 box(pipes,0x4d5052,14,6,0,32,.3,1.4);
 // loading dock + trucks
 const dockB=box(group,0x6e6a60,26,0,27,34,5,7);
 box(group,0x3a3d3e,26,5,27,35,.3,8);
 for(let i=0;i<4;i++)box(group,0x2a2d2f,12+i*8,0,23.4,5,3,.2);
 const trucks=[];
 for(let i=0;i<3;i++){
  const g=piv(group,10+i*13,0,32);
  const bd=[box(g,[0xc8cdd0,0xb8452f,0xd8b050][i],0,.5,0,8,3.2,3),box(g,0x2e3a46,4.8,.5,0,2.2,2.4,3)];
  hcyl(g,0x222,-2,.6,1.6,.6,.5,'z');hcyl(g,0x222,3,.6,1.6,.6,.5,'z');
  trucks.push({g,bd});
 }
 // storage yard
 const crates=[];
 for(let i=0;i<8;i++)for(let j=0;j<2;j++){
  const m=box(group,[0x8a6f4a,0x6a7058,0x8f8a7c][(i+j)%3],-42+i*5.2,0,31+j*3.4,4,1.8+((i+j)%3)*.8,2.8);
  crates.push({m,r:rng()});
 }
 function applyDamage(s){
  if(s>=1){
   halls[0].teeth.forEach(t=>{if(t.r<.35){t.t.rotation.z=.1;t.t.position.y=6.2}});
   scorch(chim[1].p.children[0]);
   scorch(trucks[0].bd[0]);
  }
  if(s>=2){
   halls[0].teeth.forEach(t=>{t.t.rotation.z=.15+t.r*.3;t.t.position.y=5-t.r*2;});
   halls[1].teeth.forEach(t=>{if(t.r<.5){t.t.rotation.z=-.2;t.t.position.y=5}});
   halls[0].wallM.scale.y=5;halls[0].wallM.position.y=2.5;
   chim[0].up.rotation.z=.55;chim[0].up.position.y=chim[0].h*.6-.6;
   silos[0].body.scale.y=silos[0].h*.55;silos[0].body.position.y=silos[0].h*.275;silos[0].cap.position.y=silos[0].h*.55+1.1;silos[0].g.rotation.z=.1;
   scorch(silos[0].body);
   trucks.forEach(t=>scorch(t.bd[0]));
  }
  if(s>=3){
   halls.forEach(h=>{h.teeth.forEach(t=>{t.t.rotation.z=.25+t.r*.5;t.t.position.y=2.4+t.r*1.4;scorch(t.slope)});h.wallM.scale.y=3.6;h.wallM.position.y=1.8;scorch(h.wallM)});
   chim[0].up.rotation.z=1.5;chim[0].up.position.set(8,chim[0].h*.6-3,0);
   chim[1].up.rotation.z=-.7;chim[1].up.position.y=chim[1].h*.6-.8;
   chim[2].p.rotation.z=.2;
   silos.forEach((si,i)=>{
    const f=i%2?.4:.5;si.body.scale.y=si.h*f;si.body.position.y=si.h*f/2;si.cap.position.y=si.h*f+1.1;si.g.rotation.z=.08+i*.05;scorch(si.body);
   });
   pgParts.forEach((p,i)=>{p.rotation.z=Math.PI/2+.1*i;p.position.y-=i*1.4});
   scorch(dockB);
   crates.forEach(c=>{if(c.r<.5)scorch(c.m)});
  }
 }
 return k.finish({radius:60,aim:V(-24,8,-16),applyDamage,
  fireSpots:[V(-24,8,-16),V(-24,7,14),V(18,18,-26),V(32,8,4),V(22,5,27)]});
}

// ---------------------------------------------------------------- 10 Substation
function b10(seed){
 const k=kit(seed,0xd47a000a),{rng,group,box,cyl,piv,scorch,fence,V}=k;
 box(group,0x4c4b46,0,-.3,0,94,.3,74);
 box(group,0x6a675d,0,-.25,0,70,.1,54); // gravel pad
 // portal gantries
 const gantries=[-22,-4,14].map((z,i)=>{
  const g=piv(group,-4,0,z);
  for(const dx of [-26,26])box(g,0x8a8d90,dx,0,0,.9,16,.9);
  const beam=piv(g,0,14,0);
  box(beam,0x8a8d90,0,0,0,53,.8,.8);
  box(beam,0xd8a432,0,1.1,0,53,.2,.4);
  for(const dx of [-26,-13,0,13,26])for(const dz of [-.3,.3])box(g,0x757a7c,dx,0,dz,.2,.2,.2);
  for(let b=0;b<6;b++){const br=box(beam,0x757a7c,-20+b*8,-5.5,0,.15,5.5,.15);br.rotation.z=.5*(b%2?1:-1)}
  return {g,beam,r:rng()};
 });
 // transformers
 const trafos=[];
 let ti=0;
 for(const z of [4,24])for(const x of [-30,-12,6]){
  const t=piv(group,x,0,z+(ti%2)*1.5);
  const body=box(t,0x6f786c,0,.8,0,7,4.2,4.4);
  box(t,0x4c524a,0,0,0,8,.8,5.2);
  const fins=[];
  for(let f=0;f<5;f++){fins.push(box(t,0x59604f,-2.4+f*1.2,1,2.5,.5,3.6,.5));fins.push(box(t,0x59604f,-2.4+f*1.2,1,-2.5,.5,3.6,.5))}
  const bush=[];
  for(let b=0;b<3;b++){
   bush.push(cyl(t,0xb4b09c,-2+b*2,5,0,.4,2.2));
  }
  cyl(t,0x9a9a8e,3.6,4.9,0,.9,1.2);
  trafos.push({t,body,fins,bush,r:rng()});ti++;
 }
 // insulator posts
 const posts=[];
 for(let i=0;i<14;i++){
  const x=-34+i*5.2,g=piv(group,x,0,-9);
  box(g,0x6f7376,0,0,0,.5,2,.5);
  const ins=cyl(g,0xc8c0a8,0,2,0,.35,3.6);
  box(g,0x555a5c,0,5.6,0,1.6,.3,.3);
  posts.push({g,ins,r:rng()});
 }
 // control house
 const house=piv(group,36,0,-20);
 const houseBody=box(house,0x8c8a7e,0,0,0,12,5,9);
 box(house,0x4a4d4f,0,5,0,12.6,.4,9.6);
 box(house,0x2d3032,-3,0,4.55,1.8,3,.15);
 box(house,0x3f4a52,3,2.2,4.55,3,1.2,.15);
 box(house,0xd8a432,0,5.4,0,1,2,.2);
 fence(group,-44,44,-33,33,0x70757a);
 // incoming pylons
 const pylons=[-26,-4,18].map(z=>{
  const p=piv(group,-52,0,z);
  for(const [dx,dz] of [[-1.4,-1.4],[1.4,-1.4],[-1.4,1.4],[1.4,1.4]]){const l=box(p,0x7a7f84,dx,0,dz,.25,10,.25);l.rotation.z=-dx*.07;l.rotation.x=dz*.07}
  box(p,0x7a7f84,0,9.5,0,.5,12,.5);
  for(const y of [11,15,19]){box(p,0x7a7f84,0,y,0,10-(y-11)*.2,.3,.3)}
  for(const dx of [-4.6,4.6])for(const y of [11,15,19])cyl(p,0xc8c0a8,dx,y-1,0,.2,1);
  return p;
 });
 for(const dy of [0,4]){for(const dz of [-4.6,4.6]){const w=box(group,0x1e1e1e,-52+dz*0,0,0,.05,.05,.05);w.visible=false}}
 function applyDamage(s){
  if(s>=1){
   trafos.forEach(t=>{if(t.r<.35){scorch(t.body);t.fins.forEach(scorch)}});
   gantries[0].beam.rotation.z=.04;
   posts.forEach(p=>{if(p.r<.2)p.g.rotation.z=.2});
  }
  if(s>=2){
   trafos.forEach(t=>{if(t.r<.75){scorch(t.body);t.fins.forEach(scorch);t.bush.forEach(scorch)}});
   gantries[0].beam.rotation.z=.1;gantries[0].beam.position.y=12.6;
   gantries[1].beam.rotation.z=-.05;gantries[1].beam.position.y=13.4;
   gantries[1].g.rotation.z=.04;
   posts.forEach(p=>{if(p.r<.5){p.g.rotation.z=(p.r-.25)*2;p.g.rotation.x=.15}});
   pylons[0].rotation.x=.2;
  }
  if(s>=3){
   trafos.forEach(t=>{scorch(t.body);t.fins.forEach(scorch);t.bush.forEach(scorch);t.t.rotation.z=(t.r-.5)*.12});
   gantries.forEach((g,i)=>{g.beam.rotation.z=.12+i*.08;g.beam.position.y=11+i;g.g.rotation.z=.06+i*.04});
   posts.forEach(p=>{p.g.rotation.z=(p.r-.5)*1.4;p.g.position.y=-.2});
   pylons[0].rotation.x=1.45;pylons[0].position.y=1;
   pylons[1].rotation.x=-.25;
   scorch(houseBody);house.rotation.z=.03;
  }
 }
 return k.finish({radius:60,aim:V(-12,4,14),applyDamage,
  fireSpots:[V(-12,4,4),V(-30,4,25),V(6,4,25),V(-4,14,-4),V(36,6,-20)]});
}

// ---------------------------------------------------------------- 11 Launcher base
function b11(seed){
 const k=kit(seed,0xd47a000b),{rng,group,box,cyl,cone,hcyl,piv,scorch,own,V}=k;
 box(group,0x3d3f35,0,-.3,0,96,.3,76);
 box(group,0x8d8a80,0,-.25,0,42,.3,28); // concrete pad
 for(let i=-1;i<=1;i+=2)box(group,0xc8b45a,i*10,.06,0,.4,.05,24);
 // TELs
 const tels=[-9,9].map((z,i)=>{
  const g=piv(group,-4,0,z*.9);
  const body=[
   box(g,0x59634d,0,.9,0,14,1.4,3.6),
   box(g,0x4a5340,6,2.3,0,3.2,2.8,3.4),
   box(g,0x2c3032,6,3.4,1.75,2.2,1,.1),
   box(g,0x4a5340,-1,2.3,0,6,.4,3.8)
  ];
  for(const x of [-5.5,-2,1.5,5.2])for(const zz of [-1.9,1.9])body.push(hcyl(g,0x25282a,x,.95,zz,.95,.7,'z'));
  const hinge=piv(g,-6.4,2.8,0);hinge.rotation.z=1.2;
  const mis=box(hinge,0x6b6e5e,6.3,-1.2,0,12.6,2.4,2.4);
  const nose=cone(hinge,0xc8533a,0,0,0,1.2,3);nose.rotation.z=-Math.PI/2;nose.position.set(14,0,0);
  box(hinge,0xd89a3a,12,-1.2,0,.4,2.5,2.5);
  return {g,body,hinge,mis,nose,z:z*.9};
 });
 // support trucks
 const supports=[];
 for(let i=0;i<3;i++){
  const g=piv(group,24+i*0,0,-22+i*10.5);g.rotation.y=(rng()-.5)*.3;
  const bd=[box(g,[0x5a6150,0x6b6a54,0x4f5a50][i],-1,.8,0,9,3.2,3.2),box(g,0x464c3c,4.2,.8,0,2.8,2.4,3.2)];
  for(const x of [-3.5,-.5,3.8])for(const z of [-1.8,1.8])bd.push(hcyl(g,0x232628,x,.9,z,.9,.6,'z'));
  supports.push({g,bd});
 }
 // camouflaged shelter
 const shelter=piv(group,-30,0,-20);
 const shBody=box(shelter,0x5c6648,0,0,0,18,5,11);
 const shRoof1=box(shelter,0x4a5a3c,0,5,0,18.6,.5,11.6);
 const shNet=box(shelter,0x76704a,0,5.5,0,16,.2,10);
 const shBlot=[];
 for(let i=0;i<6;i++)shBlot.push(box(shelter,[0x7a7048,0x3f4a34,0x5b5f40][i%3],-6+i*2.4,5.55,(i%2?2:-2),3,.15,3));
 box(shelter,0x2c3032,9.05,0,0,.2,3.6,5);
 // fuel point
 const fuel=piv(group,-32,0,22),fuelT=[];
 for(let i=0;i<3;i++)fuelT.push(hcyl(fuel,0x7d806f,0,1.5,(i-1)*3.6,1.4,8,'x'));
 box(fuel,0x56594e,0,0,0,10,.3,13);
 box(fuel,0xc8533a,5.5,0,0,.8,2,.8);
 // berm ring
 const berms=[];
 const bm=(x,z,w,d,ry)=>{const m=box(group,0x5e5a43,x,0,z,w,2.6,d);m.rotation.y=ry||0;berms.push(m)};
 bm(0,-35,76,4);bm(0,35,76,4);
 bm(-46,-8,4,52);bm(46,0,4,60);
 bm(-42,-31,10,4,.7);bm(42,-31,10,4,-.7);bm(-42,31,10,4,-.7);bm(42,31,10,4,.7);
 const tick=[];
 for(let i=0;i<8;i++)tick.push(box(group,0x6b6e5e,-30+i*8.5,0,-27+(i%2)*1.2,4.5,.8,1));
 function applyDamage(s){
  if(s>=1){
   tels[0].hinge.rotation.z=.8;
   scorch(supports[0].bd[0]);
   shRoof1.scale.y=1;shBlot.forEach((b,i)=>{if(i%2)scorch(b)});
  }
  if(s>=2){
   tels[0].hinge.rotation.z=.12;tels[0].hinge.rotation.y=.25;
   tels[1].hinge.rotation.z=.55;
   tels[0].body.forEach(scorch);
   supports.forEach(t=>t.bd.forEach(scorch));
   shBody.scale.y=2.5;shBody.position.y=1.25;shRoof1.position.y=2.6;shNet.position.y=3.1;shelter.rotation.z=.08;
   shBlot.forEach(b=>{b.position.y=3.15});
   fuelT.forEach((t,i)=>{if(i===1)scorch(t)});
  }
  if(s>=3){
   tels.forEach((t,i)=>{
    t.hinge.position.set(-2+i*4,.5,(i?-1:1)*5.5);
    t.hinge.rotation.set(0,(i?-.5:.6),.06);
    t.hinge.position.y=1.2;
    t.body.forEach(scorch);
   });
   scorch(shBody);scorch(shRoof1);scorch(shNet);shBody.scale.y=1.2;shBody.position.y=.6;shRoof1.position.y=1.3;shNet.position.y=1.8;shelter.rotation.z=.12;shelter.rotation.x=.05;
   shBlot.forEach(b=>{b.position.y=1.9;scorch(b)});
   fuelT.forEach(scorch);
   berms.forEach((b,i)=>{if(i%3===0)scorch(b)});
  }
 }
 return k.finish({radius:60,aim:V(-4,7,-8),applyDamage,
  fireSpots:[V(4,6,-8),V(4,6,8),V(-30,3,-20),V(24,2,-12),V(-32,2,22)]});
}

export const builders=[b6,b7,b8,b9,b10,b11];
