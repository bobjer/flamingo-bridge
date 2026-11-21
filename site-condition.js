// Conditions track confirmed game reports. Repairs begin after two quiet waves.
export function advanceConditions(sites,reports,wave,random=Math.random){
 const hits=new Set();
 for(const report of reports){
  if(!report.hit)continue;
  hits.add(report.i);
  const previous=sites[report.i]?.damage??0;
  const impact=10+Math.floor(random()*76);
  const damage=Math.min(100,previous+impact);
  sites[report.i]={damage,lastHit:wave};
  Object.assign(report,{previous,damage,impact});
 }
 const repairs=[];
 for(const [id,site] of Object.entries(sites)){
  if(!site.damage||hits.has(+id)||wave-site.lastHit<2)continue;
  const previous=site.damage;
  site.damage=Math.max(0,previous-10-Math.floor(random()*17));
  repairs.push({i:+id,previous,damage:site.damage});
 }
 return repairs;
}
