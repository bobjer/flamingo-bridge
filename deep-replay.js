import * as THREE from 'three';
import {tr} from './language.js';
import {buildSite} from './deep-sites.js';

// Cinematic 3D replay of one Deepstrike site strike. Everything is a pure function of
// the timeline position u (seconds) and the seed, so a report always replays identically.
const W=960,H=540,DUR=9.6,START=1,ESTAB=2.6;
const game='flamingo-bridge.rustyperch5.chatgpt.site';
const formats=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'];
const mono='600 15px ui-monospace,Menlo,Consolas,monospace';
const FORM=[[0,0],[-6,1.5],[6,1.5],[-12,3],[12,3]];
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>(x=clamp(x))*x*(3-2*x);
const lerp=(a,b,t)=>a+(b-a)*t;
function random(seed){
 seed>>>=0;
 return ()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296};
}
const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let renderer;
function getRenderer(){
 if(renderer)return renderer;
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
 renderer.setPixelRatio(1);renderer.setSize(W,H,false);
 return renderer;
}
function puffTexture(){
 const c=document.createElement('canvas');c.width=c.height=96;
 const g=c.getContext('2d');
 const grad=g.createRadialGradient(48,48,0,48,48,48);
 grad.addColorStop(0,'rgba(255,255,255,.95)');grad.addColorStop(.35,'rgba(255,255,255,.45)');grad.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=grad;g.fillRect(0,0,96,96);
 return new THREE.CanvasTexture(c);
}
function groundTexture(rng){
 const palettes=[['#4a5236','#566040','#3d4530'],['#6b6249','#776d52','#5a523d'],['#8a7c5c','#968766','#76694c'],['#3d3a32','#49453b','#322f28']];
 const p=palettes[Math.floor(rng()*palettes.length)],c=document.createElement('canvas');c.width=c.height=256;
 const g=c.getContext('2d');g.fillStyle=p[0];g.fillRect(0,0,256,256);
 for(let i=0;i<520;i++){g.fillStyle=p[1+(i&1)];g.globalAlpha=.25+rng()*.4;g.fillRect(rng()*256,rng()*256,2+rng()*16,2+rng()*10)}
 g.globalAlpha=1;
 const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(70,70);tex.colorSpace=THREE.SRGBColorSpace;
 return tex;
}
function droneGeometry(){
 const wing=new THREE.Shape();wing.moveTo(0,-2.5);wing.lineTo(2.2,1.5);wing.lineTo(-2.2,1.5);wing.closePath();
 const wingGeo=new THREE.ShapeGeometry(wing);wingGeo.rotateX(-Math.PI/2);
 const body=new THREE.CylinderGeometry(.3,.3,4.2,6);body.rotateX(Math.PI/2);
 const fin=new THREE.BoxGeometry(.12,.9,1);fin.translate(0,.45,-1.5);
 return {wingGeo,body,fin};
}

export function mountStrikeReplay(host,{site=0,seed=1,hit=true,hits=1,impact,wave=1,placeLabel=''}={}){
 const reduced=window.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
 const count=hit?clamp(Math.round(hits)||1,1,5):1+(seed&1);
 const severity=impact===undefined?2:clamp(Math.ceil(impact/28),1,3);
 const rng=random((Math.imul(seed>>>0,2654435761)^Math.imul(site+1,40503))>>>0);
 const night=rng(),wind=rng()*6.283,approachAngle=rng()*6.283,bank=(rng()-.5)*1.4,orbitDir=rng()>.5?1:-1;
 const caption=tr('Хвиля '+wave+' · '+placeLabel+' · '+(hit?'влучань: '+(Math.round(hits)||1):'перехоплено'),'Wave '+wave+' · '+placeLabel+' · '+(hit?'hits: '+(Math.round(hits)||1):'intercepted'))+' #PopSeason';
 const place=placeLabel;

 const root=document.createElement('div');root.className='dr-replay';
 root.innerHTML='<div class="dr-screen"><canvas width="'+W+'" height="'+H+'"></canvas></div>'+
  '<div class="dr-ctrl"><button type="button" class="dr-btn dr-play"></button><div class="dr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div>'+
  '<div class="dr-export"><button type="button" class="dr-btn" data-prepare></button><a class="dr-btn" download hidden></a><button type="button" class="dr-btn" data-share hidden></button></div>'+
  '<video class="dr-preview" controls playsinline hidden></video>'+
  '<div class="dr-share"><button type="button" class="dr-btn" data-copy></button><a class="dr-btn" target="_blank" rel="noopener noreferrer">X</a><a class="dr-btn" target="_blank" rel="noopener noreferrer">Telegram</a><a class="dr-btn" target="_blank" rel="noopener noreferrer">Facebook</a></div>'+
  '<small class="dr-status" role="status"></small>';
 host.append(root);
 const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');
 const playBtn=root.querySelector('.dr-play'),bar=root.querySelector('.dr-bar'),fill=bar.firstChild;
 const prepare=root.querySelector('[data-prepare]'),download=root.querySelector('a[download]'),share=root.querySelector('[data-share]');
 const preview=root.querySelector('.dr-preview'),status=root.querySelector('.dr-status'),copy=root.querySelector('[data-copy]');
 const [linkX,linkTg,linkFb]=root.querySelectorAll('.dr-share a');
 const origin=location.origin,enc=encodeURIComponent;
 canvas.setAttribute('role','img');
 canvas.setAttribute('aria-label',tr('3D-реконструкція удару: ','3D strike reconstruction: ')+place);
 linkX.href='https://twitter.com/intent/tweet?text='+enc(caption)+'&url='+enc(origin);
 linkTg.href='https://t.me/share/url?url='+enc(origin)+'&text='+enc(caption);
 linkFb.href='https://www.facebook.com/sharer/sharer.php?u='+enc(origin);
 for(const a of [linkX,linkTg,linkFb])a.setAttribute('aria-label',tr('Поділитися: ','Share on ')+a.textContent);
 copy.textContent=tr('Копіювати підпис','Copy caption');
 download.textContent=tr('Зберегти відео','Save video');share.textContent=tr('Поділитися','Share');
 prepare.textContent=tr('Підготувати відео','Prepare video');
 const setPlay=()=>{playBtn.textContent=playing?'❚❚ '+tr('Пауза','Pause'):u>=DUR?'⟳ '+tr('Повтор','Replay'):'▶ '+tr('Відтворити','Play')};

 // ---- state --------------------------------------------------------------
 let u=0,playing=false,atPoster=false,frameId=0,lastTs=0,disposed=false,recording=null,built=null,damaged=false,observer,fileUrl,file;
 const supportsRecord=!!(window.MediaRecorder&&HTMLCanvasElement.prototype.captureStream);
 if(!supportsRecord){prepare.disabled=true;status.textContent=tr('Браузер не підтримує запис відео.','This browser does not support video recording.')}

 // ---- timeline constants -------------------------------------------------
 // Arrival times (hit) or interception times (miss), in effect time.
 const IT=5.2,arrival=Array.from({length:count},(_,i)=>IT+i*.12);
 const pathP=(i,t)=>clamp((t-START)/(arrival[i]-START))**1.35;
 const interceptT=arrival.map((a,i)=>START+(a-START)*.72**(1/1.35)+i*.2);
 const ET=hit?IT:interceptT[0];
 const CUT=hit?IT:ET+.8;
 const warp=x=>x<=ET?x:ET+(x-ET<.8?(x-ET)*.35:.28+(x-ET-.8));
 const phaseOf=x=>x<ESTAB?tr('СПОСТЕРЕЖЕННЯ','OVERWATCH'):x<CUT?tr('ЗАХІД НА ЦІЛЬ','APPROACH'):x<CUT+2.2?(hit?tr('ВЛУЧАННЯ','IMPACT'):tr('ПЕРЕХОПЛЕНО','INTERCEPTED')):hit?tr('ОЦІНКА НАСЛІДКІВ','ASSESSMENT'):tr('ЦІЛЬ ЦІЛА','TARGET INTACT');

 // ---- scene (built lazily) ----------------------------------------------
 function build(){
  const gl=getRenderer(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(46,W/H,.3,1700);
  const owned=[],own=o=>(owned.push(o),o);
  const horizon=new THREE.Color().lerpColors(new THREE.Color('#c58a62'),new THREE.Color('#2a2a42'),night);
  const zenith=new THREE.Color().lerpColors(new THREE.Color('#4d5f86'),new THREE.Color('#05070f'),night);
  scene.fog=new THREE.FogExp2(horizon,.0034);scene.background=horizon.clone();
  // sky dome with a vertical gradient, stars on the darker evenings
  const skyGeo=own(new THREE.SphereGeometry(1100,20,12)),pos=skyGeo.attributes.position,cols=[];
  for(let i=0;i<pos.count;i++){const k=clamp(pos.getY(i)/700);const c=horizon.clone().lerp(zenith,Math.sqrt(k));cols.push(c.r,c.g,c.b)}
  skyGeo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
  const skyMat=own(new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false}));
  const sky=new THREE.Mesh(skyGeo,skyMat);sky.renderOrder=-2;scene.add(sky);
  if(night>.35){
   const sp=[],r2=random(seed^0x5bd1);
   for(let i=0;i<140;i++){const a=r2()*6.283,e=.15+r2()*1.2;sp.push(Math.cos(a)*Math.cos(e)*1000,Math.sin(e)*1000,Math.sin(a)*Math.cos(e)*1000)}
   const sg=own(new THREE.BufferGeometry());sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
   const sm=own(new THREE.PointsMaterial({color:0xdfe6ff,size:2.4,sizeAttenuation:false,fog:false,transparent:true,opacity:(night-.35)*1.2,depthWrite:false}));
   scene.add(new THREE.Points(sg,sm));
  }
  scene.add(new THREE.HemisphereLight(new THREE.Color().lerpColors(new THREE.Color('#ffd9b8'),new THREE.Color('#7d8dc2'),night),0x4a3d30,lerp(1.5,.8,night)));
  const sun=new THREE.DirectionalLight(new THREE.Color().lerpColors(new THREE.Color('#ffb47a'),new THREE.Color('#8fa0d8'),night),lerp(1.5,.55,night));
  sun.position.set(Math.cos(wind)*80,38,Math.sin(wind)*80);scene.add(sun);
  // terrain disc with a scattering of low-poly trees
  const gTex=own(groundTexture(rng));
  const ground=new THREE.Mesh(own(new THREE.CircleGeometry(760,48)),own(new THREE.MeshLambertMaterial({map:gTex})));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.15;scene.add(ground);
  const treeGeo=own(new THREE.ConeGeometry(1,1,6)),treeMats=[0x2e3a26,0x39452c,0x2a3022].map(c=>own(new THREE.MeshLambertMaterial({color:c}))),tr2=random(seed^0xa11ce);
  for(let i=0;i<54;i++){
   const a=tr2()*6.283,d=80+Math.pow(tr2(),.7)*420,h=5+tr2()*9,m=new THREE.Mesh(treeGeo,treeMats[i%3]);
   m.scale.set(2.4+tr2()*3,h,2.4+tr2()*3);m.position.set(Math.cos(a)*d,h/2,Math.sin(a)*d);scene.add(m);
  }
  const model={cur:buildSite(site,seed)};scene.add(model.cur.group);
  // lights
  const fireLight=new THREE.PointLight(0xff7a2a,0,160);scene.add(fireLight);
  const flashLight=new THREE.PointLight(0xfff0d0,0,260);scene.add(flashLight);
  // sprite pools
  const puff=own(puffTexture());
  const spriteOf=(blend,color=0xffffff)=>{
   const m=own(new THREE.SpriteMaterial({map:puff,transparent:true,depthWrite:false,blending:blend,color,opacity:0}));
   const s=new THREE.Sprite(m);s.visible=false;scene.add(s);return s;
  };
  const smoke=Array.from({length:56},()=>({s:spriteOf(THREE.NormalBlending),spot:Math.floor(rng()*4),ph:rng(),ang:rng()*6.283,r:rng(),speed:.7+rng()*.6,sz:.7+rng()*.7,h:rng()}));
  const flames=Array.from({length:28},()=>({s:spriteOf(THREE.AdditiveBlending),spot:Math.floor(rng()*4),ph:rng(),ox:rng()-.5,oz:rng()-.5,speed:.8+rng()*.8,sz:.7+rng()*.6}));
  const balls=Array.from({length:16},(_,k)=>({s:spriteOf(THREE.AdditiveBlending),dir:new THREE.Vector3(rng()-.5,rng()*.9+.1,rng()-.5).normalize(),sp:6+rng()*18,sz:.7+rng()*.8,burst:k}));
  const trails=Array.from({length:count},()=>Array.from({length:6},()=>spriteOf(THREE.NormalBlending)));
  const flash=spriteOf(THREE.AdditiveBlending);
  // drones
  const dg=droneGeometry(),droneMat=own(new THREE.MeshLambertMaterial({color:0x3a3f44,side:THREE.DoubleSide})),ledMat=own(new THREE.SpriteMaterial({map:puff,color:0xff4a3a,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  owned.push(dg.wingGeo,dg.body,dg.fin);
  const drones=Array.from({length:count},()=>{
   const g=new THREE.Group(),m=new THREE.Group();
   m.add(new THREE.Mesh(dg.wingGeo,droneMat),new THREE.Mesh(dg.body,droneMat),new THREE.Mesh(dg.fin,droneMat));
   const led=new THREE.Sprite(ledMat);led.scale.setScalar(1.2);led.position.set(0,.5,-2);m.add(led);
   m.scale.setScalar(1.7);g.add(m);g.visible=false;scene.add(g);return {g,m};
  });
  // shockwave, debris, embers
  const ringMat=own(new THREE.MeshBasicMaterial({color:0xffd7a0,transparent:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false,opacity:0}));
  const ring=new THREE.Mesh(own(new THREE.RingGeometry(.9,1,56)),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=.4;ring.visible=false;scene.add(ring);
  const debrisGeo=own(new THREE.BoxGeometry(1,1,1)),debrisMats=[0x2a2724,0x4a4640,0x6a6358].map(c=>own(new THREE.MeshLambertMaterial({color:c}))),dr=random(seed^0xdeb);
  const debris=Array.from({length:hit?36:10},(_,i)=>{
   const m=new THREE.Mesh(debrisGeo,debrisMats[i%3]),a=dr()*6.283,sp=8+dr()*22;
   m.visible=false;scene.add(m);
   return {m,vx:Math.cos(a)*sp*(hit?1:.4),vz:Math.sin(a)*sp*(hit?1:.4),vy:hit?16+dr()*30:2+dr()*8,sc:.4+dr()*(hit?1.5:.6),spin:[dr()*6,dr()*6,dr()*6],lag:dr()*.12};
  });
  const emberGeo=own(new THREE.BufferGeometry()),EM=40,emberPos=new Float32Array(EM*3),er=random(seed^0xe3b);
  emberGeo.setAttribute('position',new THREE.BufferAttribute(emberPos,3));
  const embers=Array.from({length:EM},()=>({spot:Math.floor(er()*4),ph:er(),ang:er()*6.283,r:er()*7,sp:.5+er()*.8}));
  const emberMat=own(new THREE.PointsMaterial({map:puff,color:0xffa04a,size:2.2,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));
  const emberPts=new THREE.Points(emberGeo,emberMat);emberPts.frustumCulled=false;emberPts.visible=false;scene.add(emberPts);
  return {gl,scene,camera,owned,model,fireLight,flashLight,smoke,flames,balls,trails,flash,drones,ring,ringMat,debris,embers,emberGeo,emberPos,emberPts,emberMat,puff};
 }

 // ---- drone path ----------------------------------------------------------
 const v1=new THREE.Vector3(),v2=new THREE.Vector3(),v3=new THREE.Vector3(),side=new THREE.Vector3();
 const cr=Math.cos,sn=Math.sin,P0=new THREE.Vector3(cr(approachAngle)*340,88,sn(approachAngle)*340),P1=new THREE.Vector3(cr(approachAngle+bank)*150,100,sn(approachAngle+bank)*150),P2=new THREE.Vector3();
 // Writes the drone position into out and its heading into tan; returns false once it is gone.
 function dronePose(i,t,out,tan){
  const A=arrival[i],p=hit?pathP(i,Math.min(t,A)):pathP(i,Math.min(t,interceptT[i]));
  const q=1-p;
  out.set(q*q*P0.x+2*q*p*P1.x+p*p*P2.x,q*q*P0.y+2*q*p*P1.y+p*p*P2.y,q*q*P0.z+2*q*p*P1.z+p*p*P2.z);
  tan.set(2*q*(P1.x-P0.x)+2*p*(P2.x-P1.x),2*q*(P1.y-P0.y)+2*p*(P2.y-P1.y),2*q*(P1.z-P0.z)+2*p*(P2.z-P1.z)).normalize();
  if(i){
   side.set(-tan.z,0,tan.x).normalize();
   const k=(1-.65*p),f=FORM[i];
   out.x+=side.x*f[0]*k;out.z+=side.z*f[0]*k;out.y+=f[1]*k;
  }
  if(!hit&&t>interceptT[i]){
   const f=t-interceptT[i];
   out.addScaledVector(tan,f*26).y-=.5*28*f*f;
   tan.y-=f*.9;tan.normalize();
   return out.y>.2;
  }
  return hit?t<A+.001:true;
 }

 // ---- per-frame world update ----------------------------------------------
 function updateWorld(s,t){
  const {model}=s,spots=model.cur.fireSpots?.length?model.cur.fireSpots:[model.cur.aim];
  const aim=model.cur.aim,since=t-IT,g=hit?smooth(since/3.5):0;
  if(!damaged&&hit&&t>=IT){model.cur.applyDamage?.(severity);damaged=true}
  if(damaged&&t<IT){ // seeking backwards: rebuild a pristine site
   s.scene.remove(model.cur.group);model.cur.dispose?.();model.cur=buildSite(site,seed);s.scene.add(model.cur.group);damaged=false;
  }
  // drones, trails
  s.drones.forEach((d,i)=>{
   const alive=t>=START&&dronePose(i,t,v1,v2);
   d.g.visible=alive&&!(fpv&&i===0);
   if(alive){
    d.g.position.copy(v1);d.g.lookAt(v1.x+v2.x,v1.y+v2.y,v1.z+v2.z);
    d.m.rotation.z=!hit&&t>interceptT[i]?(t-interceptT[i])*6:0;
   }
   s.trails[i].forEach((sp,k)=>{
    const tt=t-(k+1)*.07,ok=alive&&tt>=START&&dronePose(i,tt,v1,v3);
    sp.visible=ok;
    if(ok){
     sp.position.copy(v1);const fallen=!hit&&t>interceptT[i];
     sp.scale.setScalar((fallen?4.5:2.2)*(1+k*.35));sp.material.color.setScalar(fallen?.14:.8);sp.material.opacity=(fallen?.7:.38)*(1-k/6);
    }
   });
  });
  // bursts
  const bursts=hit?arrival.map((a,i)=>({t:a,p:i?spots[i%spots.length]:aim,sc:i?.5:1})):interceptT.map((a,i)=>({t:a,p:dronePosAt(i,a),sc:.55}));
  s.balls.forEach((b,k)=>{
   const bu=bursts[b.burst%bursts.length],age=(t-bu.t)/1.3,sp=b.s;
   sp.visible=age>0&&age<1;
   if(sp.visible){
    sp.position.copy(bu.p).addScaledVector(b.dir,b.sp*bu.sc*Math.sqrt(age)*1.5);
    sp.scale.setScalar((7+age*26)*b.sz*bu.sc*(hit?1:.8));
    sp.material.color.setHSL(.02+.1*(1-age),1,lerp(.62,.2,age));sp.material.opacity=(1-age)*.9;
   }
  });
  const fl=t>=ET?Math.exp(-(t-ET)*(hit?6:9)):0;
  s.flash.visible=fl>.02;
  if(s.flash.visible){s.flash.position.copy(hit?aim:bursts[0].p).y+=hit?4:0;s.flash.scale.setScalar((hit?90:30)*(.5+fl));s.flash.material.opacity=fl}
  s.flashLight.position.copy(hit?aim:bursts[0].p).y+=hit?24:0;s.flashLight.intensity=fl*(hit?14000:3500);
  flashAmount=fl*(hit?.95:.3);
  // shockwave
  s.ring.visible=hit&&since>0&&since<1.6;
  if(s.ring.visible){s.ring.position.x=aim.x;s.ring.position.z=aim.z;s.ring.scale.setScalar(2+since*(70+severity*12));s.ringMat.opacity=.8*Math.exp(-since*1.9)}
  // debris
  const o=hit?aim:bursts[0].p;
  s.debris.forEach(d=>{
   const a=t-ET-d.lag;
   d.m.visible=a>0&&(hit||bursts[0].p.y>.2);
   if(d.m.visible){
    const f=Math.min(a,6),y=Math.max(.2,o.y+d.vy*f-20*f*f);
    d.m.position.set(o.x+d.vx*f,hit?y:Math.max(.2,o.y-12*f*f),o.z+d.vz*f);
    d.m.scale.setScalar(d.sc);d.m.rotation.set(d.spin[0]*f,d.spin[1]*f,d.spin[2]*f);
   }
  });
  // fire, smoke, embers
  s.fireLight.position.copy(spots[0]).y+=7;
  s.fireLight.intensity=hit?g*(1300+260*Math.sin(t*17)+120*Math.sin(t*41)):0;
  const sw=Math.cos(wind),sz=Math.sin(wind);
  s.smoke.forEach(p=>{
   const live=hit&&since>0,sp=p.s;sp.visible=live;
   if(!live)return;
   const a=(since*.09*p.speed+p.ph)%1,pt=spots[p.spot%spots.length];
   sp.position.set(pt.x+sw*a**1.5*60+cr(p.ang)*p.r*(2+a*9),pt.y+3+a*(30+p.h*30),pt.z+sz*a**1.5*60+sn(p.ang)*p.r*(2+a*9));
   sp.scale.setScalar((3+a*22)*(.4+g*.8)*p.sz);
   sp.material.color.setScalar(.1+a*.2);sp.material.opacity=clamp(a*7)*(1-a)*.8*g;
  });
  s.flames.forEach(p=>{
   const live=hit&&since>.3,sp=p.s;sp.visible=live;
   if(!live)return;
   const a=(t*p.speed*1.7+p.ph)%1,pt=spots[p.spot%spots.length],fl2=.8+.2*Math.sin(t*23+p.ph*40);
   sp.position.set(pt.x+p.ox*6*(1-a),pt.y+1+a*9*p.sz,pt.z+p.oz*6*(1-a));
   sp.scale.setScalar((5+severity)*(1-a*.7)*p.sz*(.4+g*.7)*fl2);
   sp.material.color.setHSL(.04+.07*(1-a),1,.55);sp.material.opacity=(1-a)*.85*g;
  });
  s.emberPts.visible=hit&&since>.2;s.emberMat.opacity=g;
  if(s.emberPts.visible){
   s.embers.forEach((p,k)=>{
    const a=(since*.22*p.sp+p.ph)%1,pt=spots[p.spot%spots.length];
    s.emberPos[k*3]=pt.x+cr(p.ang)*p.r*(1+a*3)+sw*a*30;s.emberPos[k*3+1]=pt.y+a*45;s.emberPos[k*3+2]=pt.z+sn(p.ang)*p.r*(1+a*3)+sz*a*30;
   });
   s.emberGeo.attributes.position.needsUpdate=true;
  }
 }
 // position of drone i at time t without disturbing the scratch vectors used elsewhere
 const tmpPos=[];
 function dronePosAt(i,t){const out=tmpPos[i]??=new THREE.Vector3(),tan=new THREE.Vector3();dronePose(i,Math.min(t,interceptT[i]+.001),out,tan);return out}

 // ---- cameras --------------------------------------------------------------
 let fpv=false,flashAmount=0;
 function shake(x,amp){
  if(reduced||amp<=0)return [0,0,0];
  return [Math.sin(x*37.1)*amp,Math.sin(x*29.7+1.3)*amp,Math.sin(x*43.3+2.1)*amp*.6];
 }
 function placeCamera(s,x,t){
  const cam=s.camera,site0=s.model.cur,rad=site0.radius||45,aim=site0.aim,focus=(site0.fireSpots?.[0]??aim);
  fpv=false;
  if(x<ESTAB){
   const k=x/ESTAB,a=approachAngle+Math.PI*.7+orbitDir*(.15+x*.17),d=rad*2.5+34-k*14,h=lerp(58,30,smooth(k));
   cam.position.set(cr(a)*d,h,sn(a)*d);cam.lookAt(0,7,0);cam.fov=46;
  }else if(x<CUT){
   const lastDrone=Math.min(t,hit?arrival[0]:interceptT[0]);
   const chase=x<CUT-1.1;
   dronePose(0,lastDrone,v1,v2);
   if(chase){
    const behind=dronePosAt(0,Math.max(START,lastDrone-.45));
    const sh=shake(x,.12+(x-ESTAB)*.05);
    cam.position.set(behind.x+sh[0]-v2.x*6,behind.y+3+sh[1],behind.z+sh[2]-v2.z*6);
    cam.lookAt(v1);cam.fov=lerp(46,56,smooth((x-ESTAB)/(CUT-1.1-ESTAB)));
   }else{
    fpv=true;
    const sh=shake(x,.25+(x-CUT+1.1)*.45);
    cam.position.set(v1.x+v2.x*1.5+sh[0],v1.y+v2.y*1.5+sh[1],v1.z+v2.z*1.5+sh[2]);
    cam.lookAt(v1.x+v2.x*60,v1.y+v2.y*60,v1.z+v2.z*60);cam.fov=68;
    cam.rotation.z+=reduced?0:Math.sin(x*9)*.025;
   }
  }else if(x<CUT+2.2){
   const k=x-CUT,a=approachAngle+orbitDir*(2.2+k*.1),d=rad*1.9+24;
   const sh=shake(x,Math.max(0,1.1-k)*.9);
   cam.position.set(cr(a)*d+sh[0],5+k*.6+sh[1],sn(a)*d+sh[2]);cam.lookAt(focus.x,focus.y+11,focus.z);cam.fov=50;
  }else{
   const k=(x-CUT-2.2)/(DUR-CUT-2.2),a=approachAngle-orbitDir*(1.1+k*.18),d=lerp(rad*1.7+30,rad*.95+16,smooth(k));
   cam.position.set(cr(a)*d,lerp(20,10,smooth(k)),sn(a)*d);cam.lookAt(focus.x,focus.y+(hit?14:6),focus.z);cam.fov=lerp(48,40,k);
  }
  cam.updateProjectionMatrix();
 }

 // ---- 2D overlay -----------------------------------------------------------
 let fx;
 function fxLayer(){
  fx=document.createElement('canvas');fx.width=W;fx.height=H;
  const g=fx.getContext('2d');
  const v=g.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,H*.95);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.62)');
  g.fillStyle=v;g.fillRect(0,0,W,H);
  g.fillStyle='rgba(0,0,0,.14)';for(let y=0;y<H;y+=3)g.fillRect(0,y,W,1);
 }
 function overlay(x,t){
  const g=ctx,nr=random(Math.floor(x*30)+seed);
  g.drawImage(fx,0,0);
  // grain and a faint colour-fringe tear
  for(let i=0;i<50;i++){g.fillStyle='rgba(255,255,255,'+(.03+nr()*.06)+')';g.fillRect(nr()*W,nr()*H,1+nr()*2,1)}
  if(nr()<.18){const y=nr()*H;g.fillStyle='rgba(255,40,40,.07)';g.fillRect(0,y,W,3);g.fillStyle='rgba(60,120,255,.07)';g.fillRect(0,y+3,W,2)}
  const lost=!hit&&x>=ET&&x<CUT+.2;
  if(lost){for(let i=0;i<380;i++){const v=Math.floor(nr()*255);g.fillStyle='rgb('+v+','+v+','+v+')';g.fillRect(nr()*W,nr()*H,2+nr()*14,1+nr()*2)}}
  if(flashAmount>.01){g.fillStyle='rgba(255,246,225,'+Math.min(.92,flashAmount)+')';g.fillRect(0,0,W,H)}
  // OSD
  g.font=mono;g.textBaseline='top';g.textAlign='left';
  g.shadowColor='rgba(0,0,0,.85)';g.shadowBlur=4;
  g.fillStyle=Math.floor(x*2)%2?'#ff3b30':'#8a1d18';g.beginPath();g.arc(30,31,6,0,6.283);g.fill();
  g.fillStyle='#fff';g.fillText('REC',44,23);
  const head=tr('ПОЛІГОН','TARGET')+' · '+place+' · '+tr('ХВ. ','W')+wave;
  g.fillStyle='#ffd59a';
  let label=head;while(label.length>8&&g.measureText(label).width>W-300)label=label.slice(0,-2);
  g.fillText(label===head?label:label+'…',92,23);
  g.textAlign='right';g.fillStyle='#fff';
  const sec=Math.min(x,DUR);g.fillText(String(Math.floor(sec/60)).padStart(2,'0')+':'+String(Math.floor(sec%60)).padStart(2,'0')+':'+String(Math.floor((sec%1)*30)).padStart(2,'0'),W-24,23);
  g.textAlign='left';g.fillStyle='#cfe6d4';
  const alt=built?Math.round(Math.max(0,built.camera.position.y)):0;
  g.fillText('GRID '+(30+(seed%60))+'-'+(10+(site*7+seed%13))+'  ALT '+String(alt).padStart(3,'0')+' M  SPD '+(fpv||x>ESTAB&&x<CUT?(168+Math.round(Math.sin(x*3)*6)):'000'),24,H-66);
  g.shadowBlur=0;
  if(fpv&&!lost){
   const cx=W/2,cy=H/2;g.strokeStyle='rgba(255,255,255,.8)';g.lineWidth=1.5;
   for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){g.beginPath();g.moveTo(cx+sx*70,cy+sy*40);g.lineTo(cx+sx*70,cy+sy*70);g.moveTo(cx+sx*70,cy+sy*70);g.lineTo(cx+sx*40,cy+sy*70);g.stroke()}
   g.beginPath();g.moveTo(cx-12,cy);g.lineTo(cx+12,cy);g.moveTo(cx,cy-12);g.lineTo(cx,cy+12);g.stroke();
   const rng2=Math.round(Math.max(0,(arrival[0]-t)*95));g.fillStyle='#ffd59a';g.textAlign='center';g.fillText('RNG '+String(rng2).padStart(3,'0')+' M',cx,cy+82);
  }
  if(lost){g.textAlign='center';g.fillStyle='#ff6a5c';g.font='700 26px ui-monospace,Menlo,monospace';g.fillText(tr('СИГНАЛ ВТРАЧЕНО','SIGNAL LOST'),W/2,H/2-14)}
  // caption stripe + watermark
  g.fillStyle='rgba(8,10,12,.78)';g.fillRect(0,H-40,W,40);g.fillStyle='#f0a030';g.fillRect(0,H-40,W,2);
  g.font=mono;g.textAlign='left';g.fillStyle='#fff';g.fillText(phaseOf(x),24,H-27);
  g.font='600 13px sans-serif';g.textAlign='right';g.fillStyle='rgba(255,255,255,.9)';g.fillText(game,W-16,H-26);
  g.textAlign='left';
 }

 // ---- render -----------------------------------------------------------------
 function render(x){
  u=clamp(x,0,DUR);
  if(!built){
   try{built=build();fxLayer()}catch(e){fail(e);return}
  }
  const s=built,t=warp(u);
  P2.copy(s.model.cur.aim);
  updateWorld(s,t);
  placeCamera(s,u,t);
  s.gl.setSize(W,H,false);s.gl.render(s.scene,s.camera);
  ctx.drawImage(s.gl.domElement,0,0,W,H);
  overlay(u,t);
  const pct=Math.round(u/DUR*100);
  if(String(pct)!==bar.getAttribute('aria-valuenow')){bar.setAttribute('aria-valuenow',pct)}
  fill.style.width=(u/DUR*100)+'%';
 }
 function fail(e){
  console.warn('strike replay unavailable',e);
  playBtn.disabled=prepare.disabled=true;
  status.textContent=tr('Для 3D-повтору потрібен WebGL.','WebGL is required for the 3D replay.');
 }
 const poster=()=>{atPoster=true;render(hit?CUT+1.3:2.2)};

 // ---- playback -----------------------------------------------------------------
 function tick(now){
  if(disposed||!playing)return;
  const dt=Math.min(.1,(now-lastTs)/1000);lastTs=now;
  render(u+dt);
  if(u>=DUR){finish();return}
  frameId=requestAnimationFrame(tick);
 }
 function startPlayback(from=0){
  cancelAnimationFrame(frameId);
  atPoster=false;playing=true;lastTs=performance.now();setPlay();
  render(from);
  frameId=requestAnimationFrame(tick);
 }
 function finish(){
  playing=false;setPlay();
  if(recording){const rec=recording;setTimeout(()=>{if(rec.recorder.state==='recording')rec.recorder.stop()},350)}
 }
 playBtn.onclick=()=>{
  if(recording)return;
  if(playing){playing=false;cancelAnimationFrame(frameId);setPlay();return}
  startPlayback(atPoster||u>=DUR?0:u);
 };
 setPlay();

 // ---- recording ------------------------------------------------------------------
 function resetFile(){
  if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=null;file=null;
  preview.hidden=download.hidden=share.hidden=true;preview.removeAttribute('src');download.removeAttribute('href');
 }
 function endRecording(ok){
  const rec=recording;recording=null;
  rec?.stream.getTracks().forEach(t=>t.stop());
  playBtn.disabled=false;prepare.disabled=!supportsRecord;prepare.hidden=ok;
  if(!ok)status.textContent=tr('Не вдалося записати відео. Спробуйте ще раз.','Recording failed. Try again.');
 }
 prepare.onclick=()=>{
  if(!supportsRecord||recording)return;
  resetFile();
  let stream,recorder;
  try{
   stream=canvas.captureStream(30);
   const type=formats.find(f=>MediaRecorder.isTypeSupported(f));
   recorder=new MediaRecorder(stream,{...(type?{mimeType:type}:{}),videoBitsPerSecond:5000000});
  }catch{stream?.getTracks().forEach(t=>t.stop());status.textContent=tr('Не вдалося записати відео. Спробуйте ще раз.','Recording failed. Try again.');return}
  const chunks=[];
  recording={recorder,stream};
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onerror=()=>{if(recording?.recorder===recorder)endRecording(false)};
  recorder.onstop=()=>{
   if(recording?.recorder!==recorder)return;
   if(!chunks.length){endRecording(false);return}
   const mime=recorder.mimeType.split(';')[0],ext=mime.includes('mp4')?'mp4':'webm';
   file=new File(chunks,'pop-season-strike-w'+wave+'.'+ext,{type:mime});fileUrl=URL.createObjectURL(file);
   endRecording(true);
   preview.src=fileUrl+'#t=0.01';preview.hidden=false;
   download.href=fileUrl;download.download=file.name;download.hidden=false;
   share.hidden=!navigator.canShare?.({files:[file]});
   status.textContent='';poster();
  };
  prepare.disabled=playBtn.disabled=true;
  status.textContent=tr('Записуємо повтор у реальному часі… тримайте вкладку відкритою.','Recording the replay in real time… keep this tab open.');
  recorder.start(250);startPlayback(0);
 };
 share.onclick=async()=>{
  try{await navigator.share({files:[file],title:tr('Pop Season · удар','Pop Season · strike'),text:caption})}
  catch(e){if(e.name!=='AbortError')status.textContent=tr('Завантажте файл, щоб опублікувати його.','Download the file to publish it.')}
 };
 copy.onclick=async()=>{
  try{await navigator.clipboard.writeText(caption+' '+origin);status.textContent=tr('Підпис скопійовано.','Caption copied.')}
  catch{status.textContent=caption}
 };

 // ---- lazy start ----------------------------------------------------------------
 const kick=()=>{if(!disposed&&!built)poster()};
 if('IntersectionObserver' in window){
  observer=new IntersectionObserver(e=>{if(e.some(x=>x.isIntersecting)){observer.disconnect();kick()}},{rootMargin:'200px'});
  observer.observe(root);
 }else kick();

 return ()=>{
  disposed=true;cancelAnimationFrame(frameId);observer?.disconnect();
  if(recording){try{if(recording.recorder.state==='recording')recording.recorder.stop()}catch{}recording.stream.getTracks().forEach(t=>t.stop());recording=null}
  if(fileUrl)URL.revokeObjectURL(fileUrl);
  if(built){
   const {scene,owned,model}=built;
   model.cur.dispose?.();
   scene.traverse(o=>{if(o.material&&!owned.includes(o.material))o.material.dispose?.()});
   for(const o of owned)o.dispose?.();
   scene.clear();built=null;
  }
  root.remove();
 };
}
