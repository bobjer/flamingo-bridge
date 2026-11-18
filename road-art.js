import * as T from 'three';
export function roadArt(scene){
 const geo=new T.PlaneGeometry(3.8,2.2),puff=new T.IcosahedronGeometry(.34,1);
 function paint(patched){
  const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');
  if(patched){g.fillStyle='#26292d';g.fillRect(9,12,236,103);for(let i=0;i<900;i++){g.fillStyle=i%2?'#44484a':'#17191c';g.fillRect(10+Math.random()*233,13+Math.random()*99,2,1)}}
  else{const scorch=g.createRadialGradient(126,63,4,126,63,66);scorch.addColorStop(0,'#080707');scorch.addColorStop(.5,'#302321dd');scorch.addColorStop(1,'#30232100');g.fillStyle=scorch;g.fillRect(0,0,256,128);for(let i=0;i<9;i++){g.strokeStyle='#151313';g.lineWidth=i%2?3:6;g.beginPath();g.moveTo(125,64);for(let j=1;j<=6;j++){g.lineTo(125+Math.cos(i*.73)*19*j+Math.random()*15,64+Math.sin(i*.73)*8*j+Math.random()*8)}g.stroke()}}
  return new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false});
 }
 const cracks=paint(false),patch=paint(true),sites=new Map(),patches=[];
 function surface(point,mat){const m=new T.Mesh(geo,mat);m.rotation.x=-Math.PI/2;m.position.copy(point);m.position.z=T.MathUtils.clamp(point.z,-1.55,1.55);scene.add(m);return m}
 function impact(site,time){let art=sites.get(site);if(!art){art={m:surface(site.point,cracks),cloud:[]};sites.set(site,art)}
  art.start=time;for(let i=art.cloud.length;i<5;i++){const m=new T.Mesh(puff,new T.MeshBasicMaterial({color:0x656168,transparent:true,depthWrite:false}));scene.add(m);art.cloud.push(m)}}
 function repair(site,time){const m=surface(site.point,patch);m.position.y-=.014;patches.push({m,time});if(patches.length>60)patches.shift().m.removeFromParent()}
 function tick(active,time){for(const [site,a] of sites){if(!active.includes(site)){a.m.removeFromParent();for(const m of a.cloud){m.removeFromParent();m.material.dispose()}sites.delete(site);continue}
 a.m.scale.setScalar(Math.min(1.25,.95+site.loss*.04));a.cloud.forEach((m,i)=>{const age=time-a.start-i*.28;m.visible=age>=0&&age<7;if(m.visible){m.position.copy(site.point);m.position.x+=age*.27+Math.sin(i)*.2;m.position.y+=age*.9;m.scale.setScalar(.5+age*.65);m.material.opacity=.52*(1-age/7)}})}
 for(const p of patches)p.m.scale.x=Math.min(1,.1+Math.max(0,time-p.time)*2)}
 function reset(){tick([],0);for(const p of patches)p.m.removeFromParent();patches.length=0}
 return {impact,repair,tick,reset,patchedMeshes:()=>patches.map(p=>p.m)};
}
