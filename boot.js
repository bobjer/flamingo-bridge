import {chooseSide,addSideChoice,preferredLevel} from './factions.js';
async function startGame(){
 try{
  if(await chooseSide()==='coalition'){
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
startGame();
