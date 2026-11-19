import * as T from 'three';
import {oilTex} from './effects.js';

export const DAY_SECONDS = 120;

export function tankerTraffic(scene) {
 const steel = new T.MeshStandardMaterial({color:0x303b42});
 const deck = new T.MeshStandardMaterial({color:0xab5340});
 const white = new T.MeshStandardMaterial({color:0xeae2cf});
 const tanks = [-3.2, 5.4, -6.3, 2.1].map((lane,index) => {
  const ship = new T.Group();
  function box(x,y,z,w,h,l,material) {
   const mesh = new T.Mesh(new T.BoxGeometry(w,h,l),material);
   mesh.position.set(x,y,z); ship.add(mesh);
  }
  box(0,.22,0,1.85,.55,6,steel);
  box(0,.54,0,1.78,.12,5.9,deck);
  box(0,.89,-2.15,1.45,.63,1,white);
  box(0,1.3,-2.15,1.52,.19,.92,steel);
  box(.42,1.46,-2.55,.26,.64,.27,deck);
  box(0,.69,.4,.13,.16,3.9,white);
  for(const z of [-.85,.5,1.85])box(0,.65,z,1.45,.14,.35,deck);
  ship.position.x=lane; ship.rotation.y=(index%2)*Math.PI; scene.add(ship);
  return ship;
 });
 const slicks=[];
 const outline=new T.Shape();
 for(let i=0;i<=72;i++){
  const a=i*Math.PI/36,r=1+.11*Math.sin(3*a)+.08*Math.cos(7*a);
  const x=r*Math.cos(a),y=r*Math.sin(a);
  if(i===0)outline.moveTo(x,y);else outline.lineTo(x,y);
 }
 const geometry=new T.ShapeGeometry(outline),uv=geometry.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*.42+.5,uv.getY(i)*.42+.5);
 function add(x,z,start){
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({map:oilTex,color:0xc8bcc8,transparent:true,depthWrite:false,side:T.DoubleSide}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.095,z);mesh.renderOrder=4;
  scene.add(mesh);slicks.push({mesh,start});
 }
 function remove(i){
  const [{mesh}]=slicks.splice(i,1);mesh.removeFromParent();mesh.material.dispose();
 }
 return {
  move(clock){
   tanks.forEach((ship,i)=>{
    const progress=clock*1.18+i*13+20;
    ship.userData.trip=Math.floor(progress/52);
    ship.visible=ship.userData.trip!==ship.userData.lostTrip;
    ship.position.z=((progress%52)-26)*(i%2?-1:1);
   });
  },
  near(p,margin=3){return tanks.find(s=>s.visible&&Math.abs(s.position.x-p.x)<1.35+margin&&Math.abs(s.position.z-p.z)<3.4+margin)??null},
  collide(p,time){
   const ship=tanks.find(s=>s.visible&&Math.abs(s.position.x-p.x)<1.35&&Math.abs(s.position.z-p.z)<3.4);
   if(!ship)return false;
   ship.userData.lostTrip=ship.userData.trip;ship.visible=false;
   add(p.x,p.z,time);return true;
  },
  draw(time){
   for(let i=slicks.length-1;i>=0;i--){
    const {mesh,start}=slicks[i],age=Math.max(0,time-start);
    if(age>=2*DAY_SECONDS){remove(i);continue}
    const spread=1-Math.exp(-age/13);
    mesh.scale.set(1.2+spread*3.1,1+spread*4.7,1);
    mesh.material.opacity=.83*(1-age/(2*DAY_SECONDS));
   }
  },
  snapshot(){return slicks.map(({mesh,start})=>[mesh.position.x,mesh.position.z,start])},
  losses(){return tanks.map(s=>s.userData.lostTrip??null)},
  restore(rows=[],losses=[]){
   tanks.forEach((s,i)=>{s.userData.lostTrip=losses[i]??-1;s.visible=s.userData.trip!==s.userData.lostTrip});
   while(slicks.length)remove(slicks.length-1);
   for(const row of rows)if(Array.isArray(row)&&row.length===3&&row.every(Number.isFinite))add(...row);
  }
 };
}
