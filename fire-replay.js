import * as THREE from 'three';
import {tr} from './language.js';

function sequence(seed){
 return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
}
function cloudTexture(rng){
 const c=document.createElement('canvas');c.width=c.height=128;
 const g=c.getContext('2d');
 for(let i=0;i<140;i++){
  const angle=rng()*Math.PI*2,d=rng()*32,x=64+Math.cos(angle)*d,y=64+Math.sin(angle)*d,r=12+rng()*16;
  const grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,'rgba(255,255,255,.25)');grad.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=grad;g.fillRect(x-r,y-r,2*r,2*r);
 }
 return new THREE.CanvasTexture(c);
}
let renderer;
export function mountFireReplay(host,seed,{frame:photo,hit=true,burning=true,showClips=true,allViews=false,impact}={}){
 const rng=sequence(seed),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,4/3,.2,1300);
 const dusk=rng(),sky=new THREE.Color().lerpColors(new THREE.Color('#858fa1'),new THREE.Color('#272538'),dusk);
 scene.background=sky;scene.fog=new THREE.FogExp2(sky,.0019);
 scene.add(new THREE.HemisphereLight(0xe0e3eb,0x66513e,1.45));
 const sun=new THREE.DirectionalLight(0xffddbd,1.2);sun.position.set(-50,55,40);scene.add(sun);
 const box=new THREE.BoxGeometry(),tank=new THREE.CylinderGeometry(1,1,1,24),colors=new Map();
 function mesh(geo,color,x,y,z,w,h,d){
  if(!colors.has(color))colors.set(color,new THREE.MeshLambertMaterial({color}));
  const m=new THREE.Mesh(geo,colors.get(color));m.position.set(x,y,z);m.scale.set(w,h,d);scene.add(m);return m;
 }
 mesh(box,0x333a32,0,-1,0,1800,2,1800);
 const damageRng=sequence(seed^0xad37ab11);
 const target=Math.floor(damageRng()*9),severity=impact===undefined?1+Math.floor(damageRng()*3):Math.min(3,Math.ceil(impact/28));
 const tx=(target%3-1)*28,tz=(Math.floor(target/3)-1)*21;
 mesh(box,0x747668,0,-.08,0,106,.3,76);
 mesh(box,0x999487,0,.09,39,145,.12,5);
 let shell,lid;
 for(let i=0;i<9;i++){
  const x=(i%3-1)*28,z=(Math.floor(i/3)-1)*21;
  const wall=mesh(tank,0xa8afa7,x,5,z,7,10,7),roof=mesh(tank,0xcacbc0,x,10.15,z,7.2,.45,7.2);
  mesh(tank,0x797f74,x,2,z,7.05,.32,7.05);
  if(i===target){shell=wall;lid=roof}
 }
 // The striped water tower is a permanent landmark on the north-east corner.
 const towerX=41,towerZ=-27;
 for(const dx of [-2,2])for(const dz of [-2,2])mesh(box,0x6e6555,towerX+dx,9,towerZ+dz,.7,18,.7);
 mesh(tank,0xc26b47,towerX,20,towerZ,4.7,6,4.7);
 mesh(tank,0xece0bc,towerX,20.2,towerZ,4.73,1.5,4.73);
 mesh(tank,0x776e5c,towerX,23.3,towerZ,4.9,.65,4.9);
 const surroundings=sequence(68421);
 for(let i=0;i<55;i++){
  const a=surroundings()*6.283,r=225+surroundings()*100,h=3+surroundings()*7;
  mesh(box,0x515451,Math.cos(a)*r,h/2,Math.sin(a)*r,7+surroundings()*8,h,8+surroundings()*10);
 }
 const texture=cloudTexture(rng),wind=rng()*6.283,drift=12+rng()*23;
 const particles=Array.from({length:105},()=>{
  const mat=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false});
  const sprite=new THREE.Sprite(mat);scene.add(sprite);
  return {sprite,phase:rng(),spread:rng()*6.283,r:rng(),speed:.7+rng()*.5};
 });
 const fireLight=new THREE.PointLight(0xff7822,950,130);fireLight.position.set(tx,13,tz);scene.add(fireLight);
 const cams=Array.from({length:allViews?3:2+Number(rng()>.5)},(_,i)=>{
  const a=.4+i*2.1+rng()*.45,r=120+rng()*20;
  return {x:r*Math.cos(a),z:r*Math.sin(a),y:[12,21,36][i]+rng()*3,phase:rng()*6};
 });
 const titles=[['З узбіччя','From the roadside'],['Зі схилу','From the hillside'],['З верхнього поверху','From upstairs']];
 function updateSmoke(t){
  for(const {sprite,phase,spread,r,speed} of particles){
   const age=(phase+t*.065*speed)%1,h=age*93,swirl=spread+age*2;
   sprite.position.set(tx+Math.cos(wind)*drift*age**1.6+Math.cos(swirl)*r*(3+age*16),8+h*(.56+.14*severity),tz+Math.sin(wind)*drift*age**1.6+Math.sin(swirl)*r*(3+age*16));
   sprite.scale.setScalar((5+age*24)*(.72+.16*severity));
   sprite.material.color.set(age<.105?(age<.045?0xffd55a:0xfc7128):0x323037);
   sprite.material.opacity=Math.min(1,(1-age)*4);
  }
  fireLight.intensity=950+130*Math.sin(t*5);
 }
 function draw(canvas,cam,t){
  updateSmoke(t);
  renderer.setSize(canvas.width,canvas.height,false);
  camera.position.set(cam.x+Math.sin(t*1.4+cam.phase)*.35,cam.y,cam.z);
  camera.lookAt(6+Math.sin(t*.9+cam.phase)*.8,21+Math.cos(t*1.3)*.45,0);
  renderer.render(scene,camera);canvas.getContext('2d').drawImage(renderer.domElement,0,0);
 }
 try{
  if(!renderer){renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setSize(288,512,false)}
 }catch{host.textContent=tr('Для 3D-повтору потрібен WebGL.','WebGL is required for the 3D replay.');return}
 const overhead=new THREE.OrthographicCamera(-64,64,46,-46,.1,600);
 overhead.position.set(12,170,48);overhead.lookAt(0,0,0);
 const sheet=photo?.getContext('2d');
 function overheadFrame(x,label){
  renderer.setSize(480,345,false);renderer.render(scene,overhead);
  sheet.drawImage(renderer.domElement,x,0);sheet.fillStyle='#172126';sheet.fillRect(x+8,8,112,38);
  sheet.fillStyle='white';sheet.font='bold 20px system-ui';sheet.fillText(label,x+16,34);
 }
 for(const p of particles)p.sprite.visible=false;
 fireLight.intensity=0;
 if(photo){photo.width=960;photo.height=345;overheadFrame(0,tr('ДО','BEFORE'))}
 if(hit){
  lid.material=new THREE.MeshLambertMaterial({color:[0x675d51,0x49423c,0x2c2826][severity-1]});
  lid.rotation.z=.09*severity;lid.position.y-=severity*.7;
  shell.material=new THREE.MeshLambertMaterial({color:[0x838278,0x726b60,0x5c574f][severity-1]});
  shell.scale.y-=severity*.6;shell.position.y=shell.scale.y/2;
 }
 for(const p of particles)p.sprite.visible=burning;
 if(burning)updateSmoke(0);
 if(photo){for(const p of particles)p.sprite.material.opacity*=.42;overheadFrame(480,tr('ПІСЛЯ','AFTER'));sheet.fillStyle='#ddd3bf';sheet.fillRect(479,0,2,345)}
 let frame,disposed=false;
 const stop=()=>{cancelAnimationFrame(frame);for(const b of host.querySelectorAll('button'))b.disabled=false};
 if(showClips)cams.forEach((cam,i)=>{
  const fig=document.createElement('figure'),canvas=document.createElement('canvas'),button=document.createElement('button');
  canvas.width=480;canvas.height=360;canvas.setAttribute('aria-label',tr(...titles[i]));
  button.textContent='▶ '+tr(...titles[i]);fig.append(canvas,button);host.append(fig);draw(canvas,cam,0);
  button.onclick=()=>{stop();button.disabled=true;const start=performance.now();
   function tick(now){if(disposed)return;const t=Math.min(6,(now-start)/1000);draw(canvas,cam,t);if(t<6)frame=requestAnimationFrame(tick);else stop()}
   frame=requestAnimationFrame(tick);
  };
 });
 return ()=>{disposed=true;stop();if(hit){lid.material.dispose();shell.material.dispose()}box.dispose();tank.dispose();texture.dispose();for(const m of colors.values())m.dispose();for(const p of particles)p.sprite.material.dispose()};
}
