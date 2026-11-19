async function startGame(){
 try{
  await import('./hud.js');
  await import('./main.js');
 }catch(error){
  console.error('Game startup failed',error);
  window.dispatchEvent(new Event('game-load-failed'));
 }
}
startGame();
