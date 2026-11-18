import * as T from 'three';

export function railTraffic(world,extent){
 const cars=[];
 const geometry=new T.BoxGeometry();
 const paints=[0x323940,0xd19946,0x336c70,0xbfcbd0,0x202e39].map(color=>new T.MeshStandardMaterial({color}));
 for(let i=0;i<7;i++){
  const car=new T.Group();
  function box(x,y,z,w,h,d,paint){
   const m=new T.Mesh(geometry,paints[paint]);m.position.set(x,y,z);m.scale.set(w,h,d);car.add(m);
  }
  box(0,.32,0,3.9,.32,1.32,0);
  box(0,.85,0,3.7,.93,1.3,i===0?1:2);
  if(i===0){box(1.12,1.42,0,1.1,.57,1.32,1);box(1.15,1.47,0,1,.25,1.34,4)}
  else{box(0,1.14,0,3.32,.29,1.32,4);box(0,1.37,0,3.82,.13,1.39,3)}
  for(const x of [-1.25,1.25])box(x,.13,0,.66,.26,1.34,0);
  world.scene.add(car);cars.push(car);
 }
 return clock=>{
  const distance=clock*6.8+extent,leg=extent*2+cars.length*4.2;
  const direction=Math.floor(distance/leg)%2?-1:1;
  const lead=distance%leg-extent;
  cars.forEach((car,i)=>{
   const x=direction*(lead-i*4.2);
   car.visible=Math.abs(x)<=extent;
   car.position.set(x,world.deckTop(x)+.08,-6);
   car.rotation.y=direction===1?0:Math.PI;
  });
 };
}
