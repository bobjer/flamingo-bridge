import * as T from 'three';

// Soft, layered billboards leave the water and the distant shores clear.
export function archSmoke(scene) {
 const size=128, pixels=new Uint8Array(size*size*4);
 const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.54;return n-Math.floor(n)};
 function noise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y);
  const sx=T.MathUtils.smoothstep(x-ix,0,1),sy=T.MathUtils.smoothstep(y-iy,0,1);
  return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),sx),
   T.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),sx),sy);
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(x+y*size)*4,r=Math.hypot(2*x/size-1,2*y/size-1);
  const density=.5*noise(x/28,y/28)+.32*noise(x/13,y/13)+.18*noise(x/6,y/6);
  const shade=150+105*T.MathUtils.clamp(density+.32*(1-y/size),0,1);
  pixels.fill(shade,i,i+3);
  pixels[i+3]=255*(1-T.MathUtils.smoothstep(r,.34,1))*T.MathUtils.smoothstep(density,.19,.78);
 }
 const map=new T.DataTexture(pixels,size,size);
 map.magFilter=map.minFilter=T.LinearFilter;map.needsUpdate=true;
 const group=new T.Group();scene.add(group);
 const puffs=Array.from({length:48},(_,i)=>{
  const phase=i*2.39996;
  const material=new T.SpriteMaterial({map,transparent:true,depthWrite:false,rotation:phase});
  const sprite=new T.Sprite(material);group.add(sprite);
  return {sprite,phase,x:Math.cos(phase)*(5+i%8),z:-2+Math.sin(phase)*(2+i%5),y:2+i%8};
 });
 let strength=0,previous=null;
 return function draw(time,active,day,camera){
  if(previous!==null&&time<previous)strength=0;
  const dt=previous===null?0:Math.max(0,time-previous);previous=time;
  strength=T.MathUtils.clamp(strength+(active?dt/2.2:-dt/3.4),0,1);
  group.visible=strength>0;if(!group.visible)return;
  const angle=Math.atan2(camera.position.z,camera.position.x);
  for(const {sprite,phase,x,y,z} of puffs){
   const drift=time*.33+phase,pearl=.5+.5*Math.sin(angle+phase*.43+time*.16);
   sprite.position.set(x+Math.sin(drift)*1.4,y+1.3*Math.sin(drift*.7)+1.1*strength,z+.65*Math.cos(drift));
   const width=(11+3*Math.cos(phase))*(.74+.26*strength);
   sprite.scale.set(width,width*.82,1);
   sprite.material.color.setHSL(.49+.31*pearl,.15+.12*pearl,.64+.15*day+.09*pearl);
   sprite.material.opacity=.46*strength;
  }
 };
}
