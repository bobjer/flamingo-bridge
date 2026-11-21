// Board-game credits. Production sets availability; the invoice is paid at launch.
export const launchPrices=[8,12,14,10,12,11,1];
export const overhead=5;
export const openingFunds=100;
export const openingTrust=75;
export const dealAdvance=10;
export const dealTrustCost=16;
export const minimumLaunch=stock=>Math.min(...launchPrices.map((price,id)=>stock[id]>0?overhead+price:Infinity));
export function waveCost(counts){
 return counts.some(Boolean)?counts.reduce((cost,n,i)=>cost+n*launchPrices[i],overhead):0;
}
export function settleWave(trust,reports,surveyReturns,deal,embargo){
 const confirmed=reports.filter(r=>r.hit);
 const gross=confirmed.reduce((total,r)=>total+(r.source===1?36:30)+10*((r.hits??1)-1),0);
 const payout=deal?dealAdvance:Math.round(gross*(.5+trust/200))+(surveyReturns>0?3:0);
 const trustChange=deal?-dealTrustCost:confirmed.length?5:surveyReturns>0?-4:-12;
 const nextTrust=Math.min(100,Math.max(0,trust+trustChange));
 return {payout,trust:nextTrust,trustChange:nextTrust-trust,embargoFee:embargo?4:0,confirmed:confirmed.length,deal};
}
