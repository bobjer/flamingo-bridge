// All positions are illustration coordinates on a fictional board.
export const cities=[
 ['Міднояр','Coppervale'],['Веретенів','Spindlewick'],['Тихолун','Stillmoon'],['Бурштинове Коло','Amber Ring'],
 ['Ліхтарів','Lanternwick'],['Сивограй','Ashchime'],['Кленокрай','Maple March'],['Парусин','Sailmere'],
 ['Вітрограддя','Windfold'],['Очеретів Ключ','Reed Key'],['Жароцвіт','Emberbloom'],['Дзвінська Брама','Bellgate']
];
export const points=[[20,18],[38,24],[62,15],[83,27],[18,45],[42,52],[65,44],[83,56],[22,76],[44,81],[63,71],[82,84]];
const origin=[7,48];
export const corridors=[
 [[12,36],[29,31],[52,34],[75,32]],
 [[14,50],[31,55],[54,51],[75,54]],
 [[12,65],[31,69],[53,65],[75,69]]
];
export function district([x,y]){
 const column=x<22?0:x<41?1:x<63?2:3;
 return (y<40?0:y<61?1:2)*4+column;
}
export function drawRoute(site,flagged){
 const end=points[site], preferred=Math.floor(site/4);
 const options=corridors.map((lane,row)=>{
  const stops=lane.filter(([x])=>x<end[0]);
  const warnings=stops.filter(p=>flagged.has(district(p))).length;
  return {score:warnings*10+Math.abs(row-preferred),path:[origin,...stops,end]};
 });
 return options.sort((a,b)=>a.score-b.score)[0].path;
}
// A cartographic arc for the board animation. Its bend is purely illustrative.
export function boardPath(site,type,flags){
 if(type!==4)return drawRoute(site,flags);
 const [x,y]=points[site],dx=x-origin[0],dy=y-origin[1];
 return Array.from({length:33},(_,step)=>{
  const t=step/32,bend=t*(1-t);
  return [origin[0]+dx*t+dy*.62*bend,origin[1]+dy*t-dx*.62*bend];
 });
}
export function travel(path,fraction){
 const lengths=path.slice(1).map(([x,y],i)=>Math.hypot(x-path[i][0],y-path[i][1]));
 const total=lengths.reduce((a,b)=>a+b,0);
 let remaining=Math.max(0,Math.min(1,fraction))*total;
 for(let i=0;i<lengths.length;i++){
  const [x,y]=path[i],dx=path[i+1][0]-x,dy=path[i+1][1]-y;
  if(remaining<=lengths[i]||i===lengths.length-1){
   const t=remaining/lengths[i];return {segment:i,x:x+t*dx,y:y+t*dy,angle:Math.atan2(dy,dx)*180/Math.PI,total};
  }
  remaining-=lengths[i];
 }
}
