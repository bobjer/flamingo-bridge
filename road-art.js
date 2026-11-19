import * as T from 'three';
export function roadArt(scene){
 const geo=new T.PlaneGeometry(3.8,2.2),puff=new T.IcosahedronGeometry(.34,1);
 function paint(patched){
  const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');
  if(patched){g.fillStyle='#26292d';g.fillRect(9,12,236,103);for(let i=0;i<900;i++){g.fillStyle=i%2?'#44484a':'#17191c';g.fillRect(10+Math.random()*233,13+Math.random()*99,2,1)}}
  else{const scorch=g.createRadialGradient(126,63,4,126,63,66);scorch.addColorStop(0,'#080707');scorch.addColorStop(.5,'#302321dd');scorch.addColorStop(1,'#30232100');g.fillStyle=scorch;g.fillRect(0,0,256,128);for(let i=0;i<9;i++){g.strokeStyle='#151313';g.lineWidth=i%2?3:6;g.beginPath();g.moveTo(125,64);for(let j=1;j<=6;j++){g.lineTo(125+Math.cos(i*.73)*19*j+Math.random()*15,64+Math.sin(i*.73)*8*j+Math.random()*8)}g.stroke()}}
  return new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false});
 }
 const cube=new T.BoxGeometry(1,1,1),helmet=new T.SphereGeometry(.13,8,6);
 const paints=[0xe86e24,0xffe4a8,0x364558,0xffc22e,0x423b39].map(color=>new T.MeshStandardMaterial({color}));
 const wallVertices=[];
 function edge(i,y){
  const a=i%18*Math.PI/9,r=1+.13*Math.sin((i%18)*7.2);
  return [1.45*r*Math.cos(a),y,.82*r*Math.sin(a)];
 }
 for(let i=0;i<18;i++){
  wallVertices.push(...edge(i,-.06),...edge(i+1,-.06),...edge(i,-.78),
   ...edge(i+1,-.06),...edge(i+1,-.78),...edge(i,-.78));
 }
 const walls=new T.BufferGeometry();walls.setAttribute('position',new T.Float32BufferAttribute(wallVertices,3));walls.computeVertexNormals();
 const concrete=new T.MeshStandardMaterial({color:0x504d49,side:T.DoubleSide});
 function worksite(point){
  const group=new T.Group(),arms=[];group.add(new T.Mesh(walls,concrete));
  function part(parent,x,y,z,w,h,d,color){
   const m=new T.Mesh(cube,paints[color]);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;
  }
  for(const x of [-2.5,2.5]){
   part(group,x,.49,0,.13,.27,3.8,0);
   for(const z of [-1.5,-.5,.5,1.5])part(group,x,.49,z,.15,.28,.4,1);
   for(const z of [-1.4,1.4])part(group,x,.21,z,.13,.42,.18,4);
  }
  for(const side of [-1,1]){
   const person=new T.Group();person.position.set(side*1.75,0,side*.55);person.rotation.y=side>0?Math.PI:0;group.add(person);
   for(const z of [-.1,.1])part(person,0,.18,z,.14,.36,.13,2);
   part(person,0,.49,0,.24,.32,.35,0);part(person,0,.48,0,.25,.06,.36,1);
   const hat=new T.Mesh(helmet,paints[3]);hat.position.y=.75;person.add(hat);
   const arm=new T.Group();arm.position.set(-.1,.58,0);person.add(arm);
   part(arm,-.16,0,0,.36,.1,.12,0);part(arm,-.34,-.14,0,.055,.52,.06,4);arms.push(arm);
  }
  group.position.copy(point);scene.add(group);return {group,arms};
 }
 const patch=paint(true),sites=new Map(),patches=[];
 function surface(point,mat){const m=new T.Mesh(geo,mat);m.rotation.x=-Math.PI/2;m.position.copy(point);m.position.z=T.MathUtils.clamp(point.z,-1.55,1.55);scene.add(m);return m}
 function impact(site,time){let art=sites.get(site);if(!art){for(let i=patches.length-1;i>=0;i--)if(patches[i].m.position.distanceTo(site.point)<3){patches[i].m.removeFromParent();patches.splice(i,1)}
   art={...worksite(site.point),cloud:[]};sites.set(site,art)}
  art.start=time;for(let i=art.cloud.length;i<5;i++){const m=new T.Mesh(puff,new T.MeshBasicMaterial({color:0x656168,transparent:true,depthWrite:false}));scene.add(m);art.cloud.push(m)}}
 function repair(site,time){if(site.loss>0)return;const m=surface(site.point,patch);m.position.y-=.014;patches.push({m,time});if(patches.length>60)patches.shift().m.removeFromParent()}
 function tick(active,time){for(const [site,a] of sites){if(!active.includes(site)){a.group.removeFromParent();for(const m of a.cloud){m.removeFromParent();m.material.dispose()}sites.delete(site);continue}
 a.arms.forEach((arm,i)=>arm.rotation.z=.35+.5*Math.sin(time*4+i*2));a.cloud.forEach((m,i)=>{const age=time-a.start-i*.28;m.visible=age>=0&&age<7;if(m.visible){m.position.copy(site.point);m.position.x+=age*.27+Math.sin(i)*.2;m.position.y+=age*.9;m.scale.setScalar(.5+age*.65);m.material.opacity=.52*(1-age/7)}})}
 for(const p of patches)p.m.scale.x=Math.min(1,.1+Math.max(0,time-p.time)*2)}
 function reset(){tick([],0);for(const p of patches)p.m.removeFromParent();patches.length=0}
 return {impact,repair,tick,reset,patchedMeshes:()=>patches.map(p=>p.m)};
}
