export function beginDiplomacy(wave,embargoThrough=0,random=Math.random){
 return {talks:wave>embargoThrough&&random()<.2,embargoThrough};
}
export function recordLaunch(policy,wave,targets,random=Math.random){
 if(policy.talks&&targets.has(0)&&random()<.6)policy.embargoThrough=wave+2;
}
export function deliveryChance(unit,wave,policy){
 if(!unit.partner)return 1;
 if(wave>policy.embargoThrough)return .7;
 return unit.restrictedChance;
}
