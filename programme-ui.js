import {cueSheet} from './wave-programme.js';
import {tr} from './language.js';

export const clock = seconds => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

export function programmeEditor(groups, names) {
  if (!groups.length) return '<small>'+tr('Додайте юніта на цю хвилю, щоб скласти розклад.','Buy a ready unit to start scheduling this wave.')+'</small>';
  const rows = cueSheet(groups).map(({id,count,gap,at}, i) => {
    const control=(action,label,disabled=false)=>'<button type="button" data-edit="'+action+'" data-index="'+i+'" '+(disabled?'disabled':'')+' aria-label="'+label+' · '+names[id]+'">'+label+'</button>';
    const options=Array.from({length:31},(_,n)=>'<option value="'+n+'" '+(n===gap?'selected':'')+'>'+n+' '+tr('с','s')+'</option>').join('');
    return '<li><div class="cue-line"><time>'+clock(at)+'</time><strong>'+names[id]+' ×'+count+'</strong><label>'+tr('Пауза','Wait')+' <select data-gap="'+i+'">'+options+'</select></label></div><div class="cue-controls">'+
      control('earlier',tr('Раніше','Earlier'),i===0)+control('later',tr('Пізніше','Later'),i===groups.length-1)+control('split',tr('Відділити 1','Split off 1'),count<2)+
      (groups.some((g,j)=>j!==i&&g.id===id)?control('merge',tr('Об’єднати','Merge')):'')+'</div></li>';
  });
  return '<div class="programme"><small>'+tr('Пауза рахується від старту попередньої групи. 0 с — одночасний вихід. Успішний дует різних юнітів дає +1 очко, до двох за хвилю.','The wait starts when the previous group launches. Use 0 s to launch together. A successful duet of different units earns +1 point, up to two per wave.')+'</small><ol class="c-cues">'+rows.join('')+'</ol></div>';
}

// Footer timeline nodes, one per cue. `state` ('done' or '') is applied to every node; the watch loop toggles them live.
export function cueTimeline(cues, names, state = '') {
  return cues.map(c => '<div class="node'+(state?' '+state:'')+'" data-at="'+c.at+'">'+clock(Math.floor(c.at))+' '+names[c.id]+' ×'+c.count+'</div>').join('');
}
