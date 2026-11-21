import * as T from 'three';
export function ditching(scene){
 const ball=new T.IcosahedronGeometry(1,1),ring=new T.RingGeometry(.85,1,48),bits=[];
 const smoke=new T.MeshBasicMaterial({color:0x494b51}),spray=new T.MeshBasicMaterial({color:0xd9f7ff});
 const foam=new T.MeshBasicMaterial({color:0xbceef4,transparent:true,opacity:.8,side:T.DoubleSide});
 function emit(geo,mat,p,v,life,kind){const m=new T.Mesh(geo,mat);m.position.copy(p);scene.add(m);bits.push({m,v,life,age:0,kind});return m}
 function wake(p){emit(ball,smoke,p,new T.Vector3(-.2,1,.2),1.35,'smoke').scale.setScalar(.26)}
 function splash(p){
  for(let i=0;i<32;i++){const a=i*2.4,s=2+Math.random()*4;
   emit(ball,spray,p,new T.Vector3(s*Math.cos(a),3+Math.random()*6,s*Math.sin(a)),1.15,'drop').scale.set(.12,.32,.12)}
  const m=emit(ring,foam,p,new T.Vector3(),1.6,'ring');m.rotation.x=-Math.PI/2;
 }
 function tick(dt){
  for(let i=bits.length-1;i>=0;i--){const b=bits[i];b.age+=dt;
   if(b.age>=b.life){b.m.removeFromParent();bits.splice(i,1);continue}
   if(b.kind==='drop')b.v.y-=12*dt;
   if(b.kind==='ring'){b.m.scale.setScalar(.5+4*b.age);foam.opacity=.8*(1-b.age/b.life)}
   if(b.kind==='smoke')b.m.scale.setScalar(.2+.75*Math.sin(Math.PI*b.age/b.life));
   b.m.position.addScaledVector(b.v,dt);
  }
 }
 function reset(){for(const b of bits)b.m.removeFromParent();bits.length=0}
 return {wake,splash,tick,reset};
}
