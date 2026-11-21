// Coarse fictional board sectors; the public sighting is a snapshot.
export const patrolSectors=[[46,14],[73,23],[50,58],[87,67],[52,82]];
export function partnerTurn(previous,wave,random=Math.random){
 const count=patrolSectors.length;
 let sector=previous?.sector??Math.floor(random()*count);
 if(previous&&random()<.3)sector=(sector+1+Math.floor(random()*(count-1)))%count;
 const blocked=!previous?.blocked&&random()<.12;
 let seen=previous?.seen??null;
 if(!blocked&&random()<.72)seen={sector,wave};
 return {sector,blocked,seen};
}
