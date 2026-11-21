import {tr} from './language.js';
import {languageButton} from './factions.js';
export function coalitionHeader(controls){
  return '<header class="top"><div class="top-left"><img src="/coalition-koala.svg" width="30" height="30" alt=""><span class="label">' + tr('ШТАБ КОАЛІЦІЇ · ВІДДІЛ ЗВІТНОСТІ','COALITION HQ · REPORTING DEPARTMENT') + '</span></div>' +
   '<div class="top-title"><strong>' + tr('СЕЗОН ХЛОПКІВ','POP SEASON') + '</strong><span>' + tr('КОАЛІЦІЯ ОХОЧИХ','COALITION OF THE WILLING') + '</span></div>' +
   '<div class="top-status">' + languageButton() + controls + '</div></header>';
}
