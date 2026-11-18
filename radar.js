// A schematic of the fictional arena, aligned with the player's camera.
export function arenaRadar(canvas){
 const ctx=canvas.getContext('2d');
 const size=160,center=size/2,radius=72,extent=34;
 const scale=Math.min(window.devicePixelRatio||1,2);
 canvas.width=canvas.height=Math.round(size*scale);
 ctx.scale(canvas.width/size,canvas.height/size);
 const tint='#9ce9ad';
 function circle(x,y,r,fill){
  ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);
  if(fill)ctx.fill();else ctx.stroke();
 }
 return function draw(attackers,clock,heading){
  ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(center,center);
  ctx.fillStyle='rgba(7,29,27,.76)';circle(0,0,radius+4,true);
  ctx.strokeStyle='rgba(147,220,166,.46)';ctx.lineWidth=1;
  for(const r of [24,48,72])circle(0,0,r,false);
  ctx.strokeStyle='rgba(147,220,166,.28)';
  ctx.beginPath();ctx.moveTo(-radius,0);ctx.lineTo(radius,0);ctx.moveTo(0,-radius);ctx.lineTo(0,radius);ctx.stroke();
  const angle=clock*1.7;
  for(let i=0;i<14;i++){
   ctx.fillStyle='rgba(107,242,151,'+(.008+i*.003)+')';
   ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,radius,angle-(14-i)*.045,angle-(13-i)*.045);ctx.fill();
  }
  ctx.strokeStyle='#73c894';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(angle)*radius,Math.sin(angle)*radius);ctx.stroke();
  ctx.fillStyle='#fff2c5';ctx.fillRect(-2,-2,4,4);
  const sin=Math.sin(heading),cos=Math.cos(heading);
  for(const e of attackers){
   if(e.hp<=0)continue;
   const p=e.m.position;
   const x=(p.x*cos-p.z*sin)*radius/extent,y=(p.x*sin+p.z*cos)*radius/extent;
   if(Math.hypot(x,y)>radius)continue;
   ctx.fillStyle=tint;ctx.shadowColor=tint;ctx.shadowBlur=5;
   circle(x,y,e.k==='neptune'?4:2.5,true);
  }
  ctx.restore();
 };
}
