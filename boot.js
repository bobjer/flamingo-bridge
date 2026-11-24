import {watchRelease} from './release-notice.js';
import {chooseSide,addSideChoice,preferredLevel} from './factions.js';
async function startGame(){
 try{
  if(new URLSearchParams(location.search).get('demo')==='refinery'){
   await import('./deepstrike.css');
   const {appendReport}=await import('./deep-reports.js');
   const main=document.createElement('main');main.className='deep-board refinery-demo';
   document.body.append(main);appendReport(main,{i:0,hit:true,source:1,fire:true,fireSeed:3567013,demo:true,previous:0,impact:64,damage:64},1,'Міднояр · Нафтокомбінат');
   window.dispatchEvent(new Event('game-ready'));return;
  }
  const side=await chooseSide();
  if(side==='sniper'){
   const {startSniper}=await import('./sniper.js');
   startSniper();
  }else if(side==='deepstrike'){
   const {startDeepstrike}=await import('./deepstrike.js');
   startDeepstrike();
  }else if(side==='coalition'){
   const {startCoalition}=await import('./coalition.js');
   startCoalition();
  }else{
   document.querySelector('#difficulty').value = preferredLevel();
   await import('./hud.js');
   await import('./main.js');
   addSideChoice();
  }
 }catch(error){
  console.error('Game startup failed',error);
  window.dispatchEvent(new Event('game-load-failed'));
 }
}
startGame().then(watchRelease);
