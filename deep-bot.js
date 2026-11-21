import {launchPrices,overhead} from './deep-economy.js';

const surveyType=launchPrices.length-1;
const strikeLimit=8;

export function planDeepWave({credits,stock,targets,sectorCount,firstSector}){
 const remaining=[...stock];
 const strikes=new Map();
 const surveys={};
 const affordable=credits-overhead;
 const strikeBudget=affordable-Math.min(15,Math.floor(credits/5));
 let spent=0,strikeCount=0;

 // Cover several sites before adding extra aircraft to any one group.
 for(let pass=0;pass<3&&strikeCount<strikeLimit;pass++){
  for(const {id,types,groupSize} of targets){
   if(strikeCount>=strikeLimit)break;
   if(pass>=groupSize||pass>0&&!strikes.has(id))continue;
   const budget=strikeCount===0?affordable:strikeBudget;
   const type=types.find(id=>remaining[id]>0&&spent+launchPrices[id]<=budget);
   if(type===undefined)continue;
   const row=strikes.get(id)??{};
   row[type]=(row[type]??0)+1;
   strikes.set(id,row);
   remaining[type]--;
   spent+=launchPrices[type];
   strikeCount++;
  }
 }

 // One returning dummy earns the survey payout. Spread backups over sectors.
 const surveyBudget=strikeCount?strikeBudget:Math.min(affordable,3);
 for(let offset=0;offset<sectorCount;offset++){
  if(remaining[surveyType]<=0||spent+launchPrices[surveyType]>surveyBudget)break;
  const sector=(firstSector+offset)%sectorCount;
  surveys[sector]={[surveyType]:1};
  remaining[surveyType]--;
  spent+=launchPrices[surveyType];
 }
 return {strikes,surveys};
}
