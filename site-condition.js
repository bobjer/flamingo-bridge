// Conditions track confirmed game reports. Repairs begin after two quiet waves.
export function boardImpact(multiplier=1,random=Math.random){
 return Math.round((10+Math.floor(random()*76))*multiplier);
}
export function advanceConditions(sites,reports,wave,random=Math.random,multiplier=1){
 const hits=new Set();
 for(const report of reports){
  const previous=sites[report.i]?.damage??0;
  report.siteDamageBefore=previous;
  if(!report.hit)continue;
  hits.add(report.i);
  const impact=boardImpact(multiplier,random);
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
