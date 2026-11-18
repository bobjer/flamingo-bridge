import * as T from 'three';

const hull=new T.CylinderGeometry(.14,.16,.95,10);
const cone=new T.ConeGeometry(.17,.4,10);
const spark=new T.IcosahedronGeometry(1,0);
const white=new T.MeshBasicMaterial({color:0xfff6dd});
const orange=new T.MeshBasicMaterial({color:0xff8023});
const flame=new T.MeshBasicMaterial({color:0xffdb64});
const crumbMaterial=new T.MeshStandardMaterial({color:0xe9ad65,roughness:.95});
const flashMaterial=new T.MeshBasicMaterial({color:0xffac38});
const up=new T.Vector3(0,1,0);

export function fireworks(scene){
 const flights=[],bursts=[];
 function scatter(point,crumbs){
  const count=crumbs?32:22;
  const cloud=new T.InstancedMesh(spark,crumbs?crumbMaterial:flashMaterial,count);
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
  const f={rocket,origin,target,damage,age:0,duration:T.MathUtils.clamp(origin.distanceTo(target.m.position)/20,.5,1.9)};flights.push(f);return f;
 }
 const marker=new T.Object3D();
 function tick(dt,enemies){
  for(let i=flights.length-1;i>=0;i--){
   const f=flights[i];f.age+=dt;const t=Math.min(1,f.age/f.duration);
   const pos=f.origin.clone().lerp(f.target.m.position,t);pos.y+=3*Math.sin(Math.PI*t);
   f.rocket.quaternion.setFromUnitVectors(up,pos.clone().sub(f.rocket.position).normalize());f.rocket.position.copy(pos);
   if(t===1){
    if(enemies.includes(f.target)&&f.target.hp>0){f.target.hp-=f.damage;scatter(pos,false)}
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
 }
 function reset(){for(const f of flights)f.rocket.removeFromParent();for(const b of bursts){b.cloud.removeFromParent();b.cloud.dispose()}flights.length=bursts.length=0}
 return {launch,launchAt,tick,reset,burst:p=>scatter(p,false),
  pendingDamage(target){return flights.reduce((sum,f)=>sum+(f.target===target?f.damage:0),0)},
  snapshot(enemies){return flights.filter(f=>enemies.includes(f.target)).map(f=>({origin:f.origin.toArray(),target:enemies.indexOf(f.target),damage:f.damage,age:f.age,duration:f.duration,position:f.rocket.position.toArray()}))},
  restore(saved,enemies){for(const item of saved){const f=launchAt(new T.Vector3(...item.origin),enemies[item.target],item.damage);f.age=item.age;f.duration=item.duration;f.rocket.position.fromArray(item.position)}},
  crumbs:p=>scatter(new T.Vector3(p.x,3.27,p.z),true)};
}
