import * as T from 'three';

// ---------- procedural textures ----------
function canvas(size,draw){
 const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);
 const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.ClampToEdgeWrapping;return t;
}
let seed=11;
const rnd=()=>(seed=seed*16807%2147483647)/2147483647;
// Billowy smoke puff: many soft blobs inside a round falloff.
const puffTex=canvas(128,(g,s)=>{
 for(let i=0;i<46;i++){
  const a=rnd()*Math.PI*2,r=rnd()*s*.27,x=s/2+Math.cos(a)*r,y=s/2+Math.sin(a)*r,R=s*(.1+rnd()*.17);
  const grad=g.createRadialGradient(x,y,0,x,y,R),v=200+rnd()*55|0;
  grad.addColorStop(0,`rgba(${v},${v},${v},${.16+rnd()*.14})`);grad.addColorStop(1,`rgba(${v},${v},${v},0)`);
  g.fillStyle=grad;g.fillRect(0,0,s,s);
 }
 g.globalCompositeOperation='destination-in';
 const fall=g.createRadialGradient(s/2,s/2,s*.18,s/2,s/2,s/2);
 fall.addColorStop(0,'rgba(0,0,0,1)');fall.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=fall;g.fillRect(0,0,s,s);
});
// Hot glow: bright core with long soft falloff.
const glowTex=canvas(64,(g,s)=>{
 const grad=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
 grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(.18,'rgba(255,255,255,.75)');
 grad.addColorStop(.45,'rgba(255,255,255,.22)');grad.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=grad;g.fillRect(0,0,s,s);
});
// Fireball: turbulent glow (puff structure over a hot core).
const fireTex=canvas(128,(g,s)=>{
 const core=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
 core.addColorStop(0,'rgba(255,255,255,.9)');core.addColorStop(.5,'rgba(255,255,255,.35)');core.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=core;g.fillRect(0,0,s,s);
 for(let i=0;i<30;i++){
  const a=rnd()*Math.PI*2,r=rnd()*s*.25,x=s/2+Math.cos(a)*r,y=s/2+Math.sin(a)*r,R=s*(.07+rnd()*.13);
  const grad=g.createRadialGradient(x,y,0,x,y,R);
  grad.addColorStop(0,'rgba(255,255,255,.35)');grad.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grad;g.fillRect(0,0,s,s);
 }
});
// Foam ring for water impacts.
const foamTex=canvas(256,(g,s)=>{
 const c=s/2;
 for(let i=0;i<900;i++){
  const a=rnd()*Math.PI*2,r=c*(.62+(rnd()+rnd()-1)*.2),x=c+Math.cos(a)*r,y=c+Math.sin(a)*r,R=2+rnd()*7;
  const grad=g.createRadialGradient(x,y,0,x,y,R);grad.addColorStop(0,'rgba(255,255,255,.5)');grad.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=grad;g.fillRect(x-R,y-R,R*2,R*2);
 }
});
// Oil slick: near-black film with a thin-film rainbow sheen and ragged edge.
export const oilTex=canvas(256,(g,s)=>{
 const c=s/2;
 for(let i=0;i<70;i++){
  const a=rnd()*Math.PI*2,r=rnd()*c*.5,x=c+Math.cos(a)*r,y=c+Math.sin(a)*r,R=c*(.18+rnd()*.32);
  const grad=g.createRadialGradient(x,y,0,x,y,R);grad.addColorStop(0,'rgba(14,10,12,.55)');grad.addColorStop(1,'rgba(14,10,12,0)');
  g.fillStyle=grad;g.fillRect(0,0,s,s);
 }
 g.globalCompositeOperation='lighter';
 for(let i=0;i<26;i++){
  const a0=rnd()*Math.PI*2,r=c*(.25+rnd()*.5),hue=(rnd()*360)|0;
  g.strokeStyle=`hsla(${hue},85%,55%,${.07+rnd()*.08})`;g.lineWidth=2+rnd()*6;
  g.beginPath();g.ellipse(c+(rnd()-.5)*30,c+(rnd()-.5)*30,r,r*(.7+rnd()*.3),a0,0,Math.PI*(1+rnd()));g.stroke();
 }
 g.globalCompositeOperation='destination-in';
 const fall=g.createRadialGradient(c,c,c*.35,c,c,c);fall.addColorStop(0,'rgba(0,0,0,1)');fall.addColorStop(1,'rgba(0,0,0,0)');
 g.fillStyle=fall;g.fillRect(0,0,s,s);
});
oilTex.colorSpace=T.SRGBColorSpace;

// ---------- GPU point-sprite particle layer ----------
const vertexShader=`
attribute float size;attribute vec4 tint;attribute float rot;
uniform float uScale;
varying vec4 vTint;varying float vRot;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){
 vTint=tint;vRot=rot;
 vec4 mvPosition=modelViewMatrix*vec4(position,1.);
 gl_PointSize=size*uScale/max(.1,-mvPosition.z);
 gl_Position=projectionMatrix*mvPosition;
 #include <logdepthbuf_vertex>
 #include <fog_vertex>
}`;
const fragmentShader=`
uniform sampler2D map;uniform float uLight;
varying vec4 vTint;varying float vRot;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
 #include <logdepthbuf_fragment>
 vec2 uv=gl_PointCoord-.5;float c=cos(vRot),s=sin(vRot);uv=mat2(c,-s,s,c)*uv+.5;
 vec4 tex=texture2D(map,clamp(uv,0.,1.));
 gl_FragColor=vec4(vTint.rgb*tex.rgb*uLight,vTint.a*tex.a);
 if(gl_FragColor.a<.003)discard;
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`;
const dpr=new T.Vector2(),hazeRef=new T.Color(0xa3c6e2);
function layer(scene,map,{additive=false,capacity=1800,lit=false,order=5}={}){
 const geo=new T.BufferGeometry(),pos=new Float32Array(capacity*3),tint=new Float32Array(capacity*4),size=new Float32Array(capacity),rot=new Float32Array(capacity);
 for(const [name,arr,n] of [['position',pos,3],['tint',tint,4],['size',size,1],['rot',rot,1]])geo.setAttribute(name,new T.BufferAttribute(arr,n).setUsage(T.DynamicDrawUsage));
 const mat=new T.ShaderMaterial({
  uniforms:{...T.UniformsUtils.clone(T.UniformsLib.fog),map:{value:map},uScale:{value:500},uLight:{value:1}},
  vertexShader,fragmentShader,transparent:true,depthWrite:false,fog:!additive,
  blending:additive?T.AdditiveBlending:T.NormalBlending
 });
 const points=new T.Points(geo,mat);points.frustumCulled=false;points.renderOrder=order;scene.add(points);
 points.onBeforeRender=(renderer,sc,camera)=>{
  renderer.getDrawingBufferSize(dpr);mat.uniforms.uScale.value=dpr.y*.5*camera.projectionMatrix.elements[5];
  // Smoke and spray take the scene's ambient light level (fog colour tracks the day cycle).
  if(lit&&sc.fog){const f=sc.fog.color,l=(f.r+f.g+f.b)/(hazeRef.r+hazeRef.g+hazeRef.b);mat.uniforms.uLight.value=.18+1.05*Math.min(1.2,l)}
 };
 const live=[];
 const col=new T.Color();
 return {
  live,
  emit(o){if(live.length>=capacity)return null;const p={age:0,rot:rnd()*6.28,spin:(rnd()-.5)*1.4,drag:0,gravity:0,alpha:1,fadeIn:.08,...o};live.push(p);return p},
  update(dt){
   let n=0;
   for(let i=live.length-1;i>=0;i--){
    const p=live[i];p.age+=dt;
    if(p.age>=p.life){live[i]=live[live.length-1];live.pop();continue}
    if(p.age<0)continue;
    const t=p.age/p.life;
    p.v.y-=p.gravity*dt;p.v.multiplyScalar(Math.max(0,1-p.drag*dt));p.pos.addScaledVector(p.v,dt);p.rot+=p.spin*dt;
    if(p.floor!=null&&p.pos.y<p.floor){p.pos.y=p.floor;p.v.y*=-.25;p.v.x*=.6;p.v.z*=.6}
    col.copy(p.c0);if(p.c1)col.lerp(p.c1,Math.min(1,t*(p.cRate??1)));
    const a=p.alpha*Math.min(1,t/p.fadeIn)*Math.pow(1-t,p.fadePow??1.4);
    const i3=n*3,i4=n*4;pos[i3]=p.pos.x;pos[i3+1]=p.pos.y;pos[i3+2]=p.pos.z;tint[i4]=col.r;tint[i4+1]=col.g;tint[i4+2]=col.b;tint[i4+3]=a;
    size[n]=p.s0+(p.s1-p.s0)*(1-Math.pow(1-t,p.grow??2));rot[n]=p.rot;n++;
   }
   geo.setDrawRange(0,n);points.visible=n>0;
   if(n)for(const k of ['position','tint','size','rot']){const at=geo.attributes[k];at.clearUpdateRanges();at.addUpdateRange(0,n*at.itemSize);at.needsUpdate=true}
  },
  reset(){live.length=0;geo.setDrawRange(0,0)}
 };
}

// ---------- old geometry pieces (rocket, crumbs) ----------
const hull=new T.CylinderGeometry(.14,.16,.95,10);
const cone=new T.ConeGeometry(.17,.4,10);
const spark=new T.IcosahedronGeometry(1,0);
const white=new T.MeshStandardMaterial({color:0xf2efe6,roughness:.35,metalness:.4});
const orange=new T.MeshStandardMaterial({color:0xd8551d,roughness:.5});
const flame=new T.MeshBasicMaterial({color:0xffe9a0,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false});
const crumbMaterial=new T.MeshStandardMaterial({color:0xe9ad65,roughness:.95});
const up=new T.Vector3(0,1,0);
const colorCache=new Map();
const C=(hex,mult=1)=>{const key=hex+'*'+mult;let c=colorCache.get(key);if(!c){c=new T.Color(hex).multiplyScalar(mult);colorCache.set(key,c)}return c};
const v3=(x,y,z)=>new T.Vector3(x,y,z);
const around=(s=1)=>v3((rnd()-.5)*2*s,(rnd()-.5)*2*s,(rnd()-.5)*2*s);

export function fireworks(scene){
 const flights=[],bursts=[],decals=[],flashes=[];
 const smoke=layer(scene,puffTex,{lit:true,order:5,capacity:1800});
 const spray=layer(scene,puffTex,{lit:true,order:6,capacity:1600});
 const fire=layer(scene,fireTex,{additive:true,order:7,capacity:900});
 const glow=layer(scene,glowTex,{additive:true,order:8,capacity:1400});
 // A small pool of point lights, created once so materials never recompile mid-game.
 const lights=Array.from({length:2},()=>{const l=new T.PointLight(0xff9a45,0,22,1.6);l.position.set(0,-50,0);scene.add(l);return l});
 let nextLight=0;
 function lightFlash(p,power){const l=lights[nextLight++%lights.length];l.position.copy(p);l.position.y+=.6;flashes.push({l,age:0,life:.55,power})}

 function smokeColumn(p,k,dark=.25){
  for(let i=0;i<Math.round(10*k);i++){
   const g=dark+rnd()*.18;
   smoke.emit({pos:p.clone().add(around(.5*k)),v:around(1.6*k).add(v3(0,1.4+rnd()*1.6,0)),drag:1.2,gravity:-.5,life:2.4+rnd()*2.2,
    s0:.6*k,s1:(3+rnd()*2.4)*k,grow:2.4,c0:C(0x2a201a,Math.round((1+g)*10)/10),c1:C(0x77726c,Math.round((.9+g)*10)/10),cRate:1.4,alpha:.62,fadeIn:.05,fadePow:1.6});
  }
 }
 function sparks(p,k,n=18,col=0xffd27a){
  for(let i=0;i<Math.round(n*k);i++){
   const v=around(1).normalize().multiplyScalar((4+rnd()*8)*Math.sqrt(k));v.y=Math.abs(v.y)*1.2+1;
   glow.emit({pos:p.clone(),v,gravity:9,drag:.6,life:.45+rnd()*.7,s0:.22*k,s1:.06,c0:C(col,6),c1:C(0xff4a10,3),alpha:1,fadeIn:.01,fadePow:.8});
  }
 }
 function explosion(p,k=1){
  p=p.clone();
  glow.emit({pos:p.clone(),v:v3(0,0,0),life:.14,s0:3.6*k,s1:5*k,c0:C(0xfff2d6,2.6),alpha:.8,fadeIn:.01,fadePow:1});
  for(let i=0;i<Math.round(12*k);i++){
   fire.emit({pos:p.clone().add(around(.35*k)),v:around(2.4*k).add(v3(0,1.3,0)),drag:3,gravity:-1.5,life:.45+rnd()*.45,
    s0:.7*k,s1:(1.7+rnd()*1.2)*k,grow:3,c0:C(0xffd890,3.2),c1:C(0xff4a10,1.5),cRate:1,alpha:.32,fadeIn:.02,fadePow:1.2});
  }
  sparks(p,k);
  for(let i=0;i<Math.round(8*k);i++){ // dark debris
   const v=around(1).normalize().multiplyScalar(3+rnd()*6);v.y=Math.abs(v.y)+2;
   smoke.emit({pos:p.clone(),v,gravity:11,drag:.3,life:.9+rnd()*.6,s0:.16,s1:.12,c0:C(0x15110e),alpha:1,fadeIn:.01,fadePow:.3,spin:8,floor:p.y>2.9&&Math.abs(p.z)<2.6?3.24:0});
  }
  smokeColumn(p,k);
  lightFlash(p,30*k);
  if(p.y<1.4)splash(v3(p.x,0,p.z),k*.8);
 }
 function splash(p,k=1){
  p=v3(p.x,.05,p.z);
  for(let i=0;i<Math.round(46*k);i++){ // spray column
   const a=rnd()*Math.PI*2,r=rnd()*1.6*k,up=6+rnd()*7*Math.sqrt(k);
   spray.emit({pos:p.clone().add(v3(Math.cos(a)*.3*k,0,Math.sin(a)*.3*k)),v:v3(Math.cos(a)*r,up*(1-r/(2.2*k)),Math.sin(a)*r),gravity:12,drag:.4,
    life:1+rnd()*.5,s0:.35*k,s1:(.9+rnd())*k,grow:1.5,c0:C(0xf3fbff,1.5),c1:C(0xc9e4ee,1.2),alpha:.75,fadeIn:.03,fadePow:1.8});
  }
  for(let i=0;i<Math.round(10*k);i++) // drifting mist
   spray.emit({pos:p.clone().add(around(.8*k)).setY(.4+rnd()*k),v:around(.8).add(v3(0,.6,0)),drag:1,life:1.8+rnd()*1.4,s0:1*k,s1:3.4*k,c0:C(0xffffff,1.4),alpha:.35,fadeIn:.15});
  ring(p,k,0);ring(p,k*.7,.25);ring(p,k*.5,.55);
 }
 const ringGeo=new T.PlaneGeometry(1,1);
 function ring(p,k,delay){
  const m=new T.Mesh(ringGeo,new T.MeshBasicMaterial({map:foamTex,transparent:true,depthWrite:false,opacity:0,color:new T.Color(1.3,1.35,1.35)}));
  m.rotation.x=-Math.PI/2;m.rotation.z=rnd()*6;m.position.set(p.x,.07,p.z);m.renderOrder=4;scene.add(m);
  decals.push({m,age:-delay,life:2.2,kind:'ring',k});
 }
 function spill(p,k=1,life=30){
  const m=new T.Mesh(ringGeo,new T.MeshBasicMaterial({map:oilTex,transparent:true,depthWrite:false,opacity:0}));
  m.rotation.x=-Math.PI/2;m.rotation.z=rnd()*6;m.position.set(p.x,.06+rnd()*.01,p.z);m.renderOrder=3;scene.add(m);
  decals.push({m,age:0,life,kind:'oil',k,stretch:.7+rnd()*.6});
 }
 function dust(p,k=1){
  for(let i=0;i<Math.round(12*k);i++)
   smoke.emit({pos:p.clone().add(around(.6*k)).setY(3.3+rnd()*.3),v:around(2.2*k).setY(.6+rnd()*1.2),drag:2,gravity:-.15,life:1.6+rnd()*1.4,
    s0:.7*k,s1:(2.6+rnd()*1.6)*k,c0:C(0xcfc3ae,1.3),c1:C(0xa59b8c,1.1),alpha:.55,fadeIn:.04});
 }
 // Damaged deck: steady smoke and a few embers from each wound.
 let smolderClock=0;
 function smolder(dt,points){
  smolderClock+=dt;
  if(smolderClock<.09)return;smolderClock=0;
  for(const {point,loss} of points){
   const k=Math.min(1.6,.6+loss/20);
   smoke.emit({pos:point.clone().add(around(.4)).setY(3.3),v:v3(.35+(rnd()-.5)*.3,1.2+rnd()*.8,(rnd()-.5)*.3),drag:.4,gravity:-.25,life:3+rnd()*2.5,
    s0:.4*k,s1:(2.6+rnd()*1.4)*k,c0:C(0x1d1916),c1:C(0x6d6a66),cRate:1.2,alpha:.5,fadeIn:.1,fadePow:1.5});
   if(rnd()<.35)glow.emit({pos:point.clone().add(around(.4)).setY(3.32),v:v3((rnd()-.5)*.6,1+rnd()*1.6,(rnd()-.5)*.6),drag:.5,gravity:-.4,life:.6+rnd()*.8,s0:.12,s1:.04,c0:C(0xffa040,5),alpha:1,fadeIn:.02,fadePow:.8});
   if(rnd()<.5)fire.emit({pos:point.clone().add(around(.25)).setY(3.36),v:v3(0,.8+rnd(),0),drag:1,life:.35+rnd()*.3,s0:.5*k,s1:.15,c0:C(0xffb050,2.6),c1:C(0x9a1e06),alpha:.6,fadeIn:.05});
  }
 }
 function tracer(from,to,night=0){
  const v=to.clone().sub(from).divideScalar(.11),n=3+Math.round(6*night);
  glow.emit({pos:from.clone(),v:v3(0,0,0),life:.07,s0:.9+night,s1:.6,c0:C(0xffd890,6),alpha:1,fadeIn:.01,fadePow:1}); // muzzle flash
  for(let i=0;i<n;i++)glow.emit({pos:from.clone().addScaledVector(v,-.012*i),v:v.clone(),life:.11+.04*night,s0:Math.max(.08,.28+.06*night-.035*i),s1:.16,c0:C(night>.5?0xffb070:0xffe7a8,Math.max(2,5+2*night-i*.5)),alpha:1,fadeIn:.01,fadePow:.5});
  setTimeout(()=>sparks(to,.35,6,0xfff0c0),110);
 }
 // Night anti-aircraft burst: a short string of glowing rounds arcing into the sky.
 function flak(from,dir,rounds=7){
  const speed=26+rnd()*8,d=dir.clone().normalize();
  for(let r=0;r<rounds;r++){
   const jitter=around(.035),v=d.clone().add(jitter).normalize().multiplyScalar(speed);
   const col=r%3===2?0xff5040:0xffb060;
   for(let k=0;k<7;k++)glow.emit({pos:from.clone().addScaledVector(v,-.007*k),v:v.clone(),gravity:6,drag:.05,life:1.5+rnd()*.4,s0:.75-.08*k,s1:.4,c0:C(col,Math.max(2,7-k)),alpha:1,fadeIn:.01,fadePow:.4,age:-r*.075});
  }
  glow.emit({pos:from.clone(),v:v3(0,0,0),life:.5,s0:1.2,s1:.4,c0:C(0xffc080,4),alpha:1,fadeIn:.01,fadePow:1.5});
  // a few rounds burst at altitude
  if(rnd()<.6){const at=from.clone().addScaledVector(d,speed*1.1).add(v3(0,-3,0));setTimeout(()=>{glow.emit({pos:at,v:v3(0,0,0),life:.22,s0:2.2,s1:2.8,c0:C(0xffd0a0,3),alpha:.9,fadeIn:.01,fadePow:1});smokeColumn(at,.35,.5)},1100)}
 }
 function feathers(p,color,n=10){
  for(let i=0;i<n;i++)
   smoke.emit({pos:p.clone().add(around(.3)),v:around(2.2).add(v3(0,1.2,0)),drag:2.2,gravity:1.2,life:2.2+rnd()*1.4,s0:.32,s1:.26,c0:C(color,1.6),alpha:.95,fadeIn:.01,fadePow:.6,spin:(rnd()-.5)*9});
 }
 // Wreckage: real meshes thrown by a blast (the cab door is the star of the shot).
 const chunks=[];
 const doorGeo=new T.BoxGeometry(.05,.46,.5),panelGeo=new T.BoxGeometry(.5,.05,.42),wheelGeo=new T.CylinderGeometry(.28,.28,.18,14);
 const doorMat=new T.MeshStandardMaterial({color:0xc99a2e,roughness:.45,metalness:.5}),glassMat=new T.MeshStandardMaterial({color:0x7aa6ad,roughness:.1,metalness:.6});
 const panelMat=new T.MeshStandardMaterial({color:0x4f6b8a,roughness:.6,metalness:.3}),tireMat=new T.MeshStandardMaterial({color:0x141414,roughness:.9});
 function throwCar(mesh,point){
  scene.add(mesh);
  const outward=mesh.position.clone().sub(point);outward.y=0;
  if(outward.lengthSq()<.1)outward.set(1,0,1);
  chunks.push({m:mesh,v:outward.normalize().multiplyScalar(2+rnd()*1.5).setY(8+rnd()*1.5),spin:around(4),age:0,life:7,smoke:0,burn:true,landed:false});
 }
 function wreck(p,dir=1){
  const door=new T.Group(),d=new T.Mesh(doorGeo,doorMat),w=new T.Mesh(new T.BoxGeometry(.052,.18,.38),glassMat);w.position.y=.1;door.add(d,w);
  const parts=[[door,v3(dir*2.2,8.5,3.4),v3(2.4,5.5,1.2)],
   [new T.Mesh(wheelGeo,tireMat),v3(-dir*3,6,-2.2),v3(6,1,3)],[new T.Mesh(wheelGeo,tireMat),v3(dir*1.2,7,-3.5),v3(-4,2,5)],
   [new T.Mesh(panelGeo,panelMat),v3(-dir*2,9,1.4),v3(3,6,-4)],[new T.Mesh(panelGeo,panelMat),v3(dir*3.5,5,-1),v3(-5,3,2)],[new T.Mesh(panelGeo,doorMat),v3(0,10,-.8),v3(4,-4,6)]];
  for(const [m,v,spin] of parts){m.position.copy(p).add(around(.25));m.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(m);
   chunks.push({m,v:v.add(around(.8)),spin,age:0,life:9,smoke:0,landed:false});}
 }
 // Aircraft breaks apart: detach parts of the model and throw them burning.
 function breakup(group,vel=v3(0,0,0)){
  group.updateMatrixWorld(true);
  const centre=group.getWorldPosition(v3(0,0,0));
  const kids=[...group.children].slice(1).filter(()=>rnd()<.7);
  for(const k of kids){
   scene.attach(k);const out=k.getWorldPosition(v3(0,0,0)).sub(centre);if(out.lengthSq()<1e-4)out.copy(around(1));out.normalize();
   chunks.push({m:k,v:vel.clone().add(out.multiplyScalar(3+rnd()*5)).add(v3(0,2+rnd()*3,0)),spin:around(7),age:0,life:10,smoke:0,landed:false,burn:rnd()<.65});
  }
  explosion(centre,1.9);sparks(centre,1.2,30,0xfff0c0);
 }
 // Fire and smoke streaming from a falling hulk.
 let trailClock=0;
 function burnTrail(p,dt,k=1){
  trailClock-=dt;if(trailClock>0)return;trailClock=.02;
  fire.emit({pos:p.clone().add(around(.2)),v:around(.6),drag:2,life:.35+rnd()*.3,s0:.9*k,s1:.3,c0:C(0xffd890,3),c1:C(0xff4a10,1.4),alpha:.5,fadeIn:.02});
  smoke.emit({pos:p.clone().add(around(.2)),v:around(.4).add(v3(0,.6,0)),drag:.8,gravity:-.3,life:2.2+rnd()*1.6,s0:.6*k,s1:(2.4+rnd())*k,c0:C(0x1e1915),c1:C(0x5f5b57),cRate:1.2,alpha:.6,fadeIn:.04});
 }
 // A standing fire with its own smoke column (per-site clock so many can burn at once).
 function blaze(site,dt){
  site.t=(site.t??0)-dt;if(site.t>0)return;site.t=.05;
  const k=site.k??1,p=site.p;
  fire.emit({pos:p.clone().add(around(.35*k)),v:around(.5).add(v3(0,1.1*k,0)),drag:2,life:.45+rnd()*.4,s0:1.1*k,s1:.35*k,c0:C(0xffd890,3),c1:C(0xff4a10,1.4),alpha:.55,fadeIn:.03});
  if(rnd()<.6)smoke.emit({pos:p.clone().add(v3(0,.9*k,0)).add(around(.3)),v:around(.3).add(v3(.25,1.1,0)),drag:.5,gravity:-.5,life:4+rnd()*3,s0:1*k,s1:(4+rnd()*2)*k,c0:C(0x1e1915),c1:C(0x55504b),cRate:1,alpha:.55,fadeIn:.06});
 }
 function kill(p,kind){
  const k=kind==='neptune'?2.4:.7;
  explosion(p,k);
  if(kind==='flamingo')feathers(p,0xff7fb0,14);
  else if(kind==='bird')feathers(p,0x8b8f96,10);
 }

 function scatter(point,crumbs){
  const count=crumbs?32:22;
  const cloud=new T.InstancedMesh(spark,crumbMaterial,count);
  cloud.frustumCulled=false;
  const bits=Array.from({length:count},()=>{
   const angle=Math.random()*Math.PI*2,speed=1+Math.random()*4;
   return {p:point.clone(),v:new T.Vector3(Math.cos(angle)*speed,2+Math.random()*5,Math.sin(angle)*speed),size:.08+Math.random()*(crumbs?.15:.28)};
  });
  scene.add(cloud);bursts.push({cloud,bits,crumbs,age:0});
 }
 function launch(source,target,damage){return launchAt(source.localToWorld(source.name==='cruiser'?new T.Vector3(1.86,.93,0):new T.Vector3(...source.userData.launchPoint)),target,damage)}
 function launchAt(origin,target,damage){
  const rocket=new T.Group();
  for(const [geometry,mat,y] of [[hull,white,0],[cone,orange,.64],[cone,flame,-.73]]){
   const piece=new T.Mesh(geometry,mat);piece.position.y=y;
   if(y<0){piece.rotation.z=Math.PI;piece.scale.y=1.8}rocket.add(piece);
  }
  rocket.position.copy(origin);scene.add(rocket);
  // launch blast
  glow.emit({pos:origin.clone(),v:v3(0,0,0),life:.18,s0:2.4,s1:3.2,c0:C(0xffd29a,4),alpha:1,fadeIn:.01,fadePow:1});
  for(let i=0;i<6;i++)smoke.emit({pos:origin.clone().add(around(.3)),v:around(1.6).setY(.4+rnd()),drag:1.6,gravity:-.3,life:1.6+rnd(),s0:.6,s1:2.2+rnd(),c0:C(0xe6e2dc,1.2),alpha:.55,fadeIn:.03});
  const f={rocket,origin,target,damage,age:0,trail:0,duration:T.MathUtils.clamp(origin.distanceTo(target.m.position)/20,.5,1.9)};flights.push(f);return f;
 }
 const marker=new T.Object3D(),tail=new T.Vector3();
 function tick(dt,enemies){
  for(let i=flights.length-1;i>=0;i--){
   const f=flights[i];f.age+=dt;const t=Math.min(1,f.age/f.duration);
   const pos=f.origin.clone().lerp(f.target.m.position,t);pos.y+=3*Math.sin(Math.PI*t);
   f.rocket.quaternion.setFromUnitVectors(up,pos.clone().sub(f.rocket.position).normalize());f.rocket.position.copy(pos);
   f.rocket.children[2].scale.set(.8+rnd()*.5,1.4+rnd()*.9,.8+rnd()*.5);
   tail.set(0,-.75,0).applyQuaternion(f.rocket.quaternion).add(pos);
   f.trail-=dt;
   if(f.trail<=0){f.trail=.018;
    smoke.emit({pos:tail.clone(),v:around(.25),drag:1.4,gravity:-.25,life:1.1+rnd()*.7,s0:.22,s1:.95+rnd()*.5,grow:2.5,c0:C(0xf4efe8,1.25),c1:C(0xb9b6b0),alpha:.5,fadeIn:.04,fadePow:1.7});
    glow.emit({pos:tail.clone(),v:v3(0,0,0),life:.09,s0:.75,s1:.3,c0:C(0xffc070,4),alpha:1,fadeIn:.01,fadePow:1});
   }
   if(t===1){
    if(f.filmContact&&!f.contactShown){f.atContact=true;continue}
    if(enemies.includes(f.target)&&f.target.hp>0){f.target.hp-=f.damage;if(!f.filmContact)explosion(pos,.75)}
    f.rocket.removeFromParent();flights.splice(i,1);
   }
  }
  for(let i=bursts.length-1;i>=0;i--){
   const b=bursts[i];b.age+=dt;const life=b.crumbs?1.45:.68;
   if(b.age>=life){b.cloud.removeFromParent();b.cloud.dispose();bursts.splice(i,1);continue}
   b.bits.forEach((bit,j)=>{
    bit.v.y-=dt*11;bit.p.addScaledVector(bit.v,dt);
    if(b.crumbs&&Math.abs(bit.p.z)<2.4&&bit.p.y<3.24){bit.p.y=3.24;bit.v.y=Math.abs(bit.v.y)*.32;bit.v.x*=.85;bit.v.z*=.85}
    marker.position.copy(bit.p);marker.rotation.set(b.age*3,j+b.age*4,0);
    marker.scale.setScalar(bit.size*Math.min(1,(life-b.age)*4));marker.updateMatrix();b.cloud.setMatrixAt(j,marker.matrix);
   });b.cloud.instanceMatrix.needsUpdate=true;
  }
  for(let i=decals.length-1;i>=0;i--){
   const d=decals[i];d.age+=dt;if(d.age<0)continue;
   const t=d.age/d.life;
   if(t>=1){d.m.removeFromParent();d.m.material.dispose();decals.splice(i,1);continue}
   if(d.kind==='ring'){const s=(1+9*(1-Math.pow(1-t,2.2)))*d.k;d.m.scale.set(s,s,1);d.m.material.opacity=.85*Math.min(1,t*10)*(1-t)}
   else{const s=(1.4+5.5*(1-Math.exp(-d.age/5)))*d.k;d.m.scale.set(s,s*d.stretch,1);d.m.rotation.z+=dt*.01;d.m.material.opacity=.9*Math.min(1,t*12)*Math.min(1,(1-t)*3)}
  }
  for(let i=chunks.length-1;i>=0;i--){
   const c=chunks[i],p=c.m.position;c.age+=dt;
   if(c.age>=c.life){c.m.removeFromParent();chunks.splice(i,1);continue}
   const deck=Math.abs(p.z)<2.6&&Math.abs(p.x)<40,floor=deck?3.3:-.4;
   if(!c.landed){
    c.v.y-=9.8*dt;p.addScaledVector(c.v,dt);c.m.rotation.x+=c.spin.x*dt;c.m.rotation.y+=c.spin.y*dt;c.m.rotation.z+=c.spin.z*dt;
    c.smoke-=dt;if(c.smoke<=0){c.smoke=.04;if(c.burn&&c.age<6)fire.emit({pos:p.clone(),v:around(.3),drag:2,life:.35+rnd()*.2,s0:.6,s1:.2,c0:C(0xffc070,3),c1:C(0xff4a10),alpha:.5,fadeIn:.02});smoke.emit({pos:p.clone(),v:around(.2),drag:1,gravity:-.3,life:1.6+rnd(),s0:.5,s1:1.5,grow:3,c0:C(0x2a2522),c1:C(0x6e6a66),alpha:.55,fadeIn:.03});
     if(c.age<(c.burn?5:1.2))glow.emit({pos:p.clone(),v:v3(0,0,0),life:.12,s0:.5,s1:.2,c0:C(0xffa040,4),alpha:1,fadeIn:.01,fadePow:1})}
    if(p.y<floor+.12&&c.v.y<0){
     if(deck&&Math.abs(c.v.y)>1.6){c.v.y*=-.32;c.v.x*=.55;c.v.z*=.55;c.spin.multiplyScalar(.5);sparks(p,.4,8);}
     else if(!deck){splash(v3(p.x,0,p.z),.45);c.landed=true;c.life=c.age+3;}
     else{p.y=floor+.03;c.landed=true;c.life=c.age+5}
    }
   }else if(p.y<.5){p.y-=dt*.25}
  }
  for(let i=flashes.length-1;i>=0;i--){
   const f=flashes[i];f.age+=dt;const t=f.age/f.life;
   if(t>=1){f.l.intensity=0;flashes.splice(i,1);continue}
   f.l.intensity=f.power*Math.pow(1-t,2.5)*(.85+rnd()*.3);
  }
  smoke.update(dt);spray.update(dt);fire.update(dt);glow.update(dt);
 }
 function reset(keepFlight){
  for(let i=flights.length-1;i>=0;i--){const f=flights[i];if(f===keepFlight)continue;f.rocket.removeFromParent();flights.splice(i,1)}
  for(const b of bursts){b.cloud.removeFromParent();b.cloud.dispose()}bursts.length=0;
 }
 // Full wipe for a new game: also clears lingering smoke, slicks and lights.
 function clear(){
  reset();for(const d of decals){d.m.removeFromParent();d.m.material.dispose()}decals.length=0;for(const c of chunks)c.m.removeFromParent();chunks.length=0;
  for(const f of flashes)f.l.intensity=0;flashes.length=0;smoke.reset();spray.reset();fire.reset();glow.reset();
 }
 return {launch,launchAt,tick,reset,clear,explosion,splash,spill,dust,smolder,tracer,flak,kill,feathers,wreck,throwCar,breakup,burnTrail,blaze,sparks,
  burst:p=>explosion(p,1.5),
  pendingDamage(target){return flights.reduce((sum,f)=>sum+(f.target===target?f.damage:0),0)},
  snapshot(enemies){return flights.filter(f=>enemies.includes(f.target)).map(f=>({origin:f.origin.toArray(),target:enemies.indexOf(f.target),damage:f.damage,age:f.age,duration:f.duration,position:f.rocket.position.toArray()}))},
  restore(saved,enemies){for(const item of saved){const f=launchAt(new T.Vector3(...item.origin),enemies[item.target],item.damage);f.age=item.age;f.duration=item.duration;f.rocket.position.fromArray(item.position)}},
  crumbs:p=>{const q=new T.Vector3(p.x,3.27,p.z);scatter(q,true);dust(q,.8)}};
}
