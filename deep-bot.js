import {launchPrices,overhead,embargoFee} from './deep-economy.js';

const surveyType=launchPrices.length-1;
const strikeLimit=8;
const massStrikeSize=6;
const cheapestStrike=Math.min(...launchPrices.slice(0,surveyType));
const surveyOnlyBudget=3;
const stockpileReserve=2*(overhead+embargoFee)+surveyOnlyBudget+cheapestStrike;

export function planDeepWave({credits,trust,stock,targets,sectorCount,firstSector,canStockpile,embargo=false}){
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

 // Budget for the survey wave, a mass launch and one recovery strike
 // without relying on a payout or an embargo ending.
 if(canStockpile&&trust>=60&&strikeCount>0&&strikeCount<massStrikeSize&&
    strikeBudget>=massStrikeSize*cheapestStrike+stockpileReserve&&remaining[surveyType]>0&&sectorCount>0){
  strikes.clear();
  spent=0;
  strikeCount=0;
 }

 // One returning dummy earns the survey payout. Spread backups over sectors.
 const nextStrikeCost=overhead+cheapestStrike;
 const surveyCeiling=affordable-nextStrikeCost-(embargo?embargoFee:0);
 const surveyBudget=Math.min(strikeCount?strikeBudget:surveyOnlyBudget,surveyCeiling);
 for(let offset=0;offset<sectorCount;offset++){
  if(remaining[surveyType]<=0||spent+launchPrices[surveyType]>surveyBudget)break;
  const sector=(firstSector+offset)%sectorCount;
  surveys[sector]={[surveyType]:1};
  remaining[surveyType]--;
  spent+=launchPrices[surveyType];
 }
 return {strikes,surveys};
}
