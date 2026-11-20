import {tr} from './language.js';
import './coach.css';

const key = 'pop-coach-enabled';
export function createCoach({isAuto, help, suggest, idleMessage}) {
  let enabled = false;
  try { enabled = localStorage.getItem(key) === '1' } catch {}
  let until = 0, notice = null, following = false, tip = null, highlighted = null, lastMode;
  const layer = document.createElement('div');
  layer.className = 'coach-layer';
  layer.innerHTML = '<aside class="coach-card"><p role="status"></p><button type="button" class="coach-next"></button></aside><div class="coach-tooltip" role="tooltip" id="coach-tip" hidden></div>';
  const card = layer.querySelector('aside'), line = card.querySelector('p'), next = card.querySelector('button'), tooltip = layer.lastElementChild;
  const pins = new Map();
  let timer;
  function showTip(pin, copy) {
    tip = pin; tooltip.hidden = false; tooltip.textContent = copy;
    pin.setAttribute('aria-describedby', tooltip.id);
    const r = pin.getBoundingClientRect();
    tooltip.style.left = Math.max(6, Math.min(innerWidth - tooltip.offsetWidth - 6, r.left)) + 'px';
    tooltip.style.top = (r.bottom + tooltip.offsetHeight + 8 < innerHeight ? r.bottom + 4 : Math.max(4,r.top - tooltip.offsetHeight - 4)) + 'px';
  }
  function closeTip() { tip?.removeAttribute('aria-describedby'); tip = null; tooltip.hidden = true }
  function sync() {
    const auto = isAuto();
    if (auto !== lastMode) { following = false; notice = null; until = 0; closeTip(); lastMode = auto }
    for (const toggle of document.querySelectorAll('[data-coach-toggle]')) {
      toggle.setAttribute('aria-pressed', String(enabled));
      const label=tr('Навчання','Coach');
      if(toggle.textContent!==label)toggle.textContent=label;
    }
    if (!enabled) { layer.remove(); return }
    const parent = document.querySelector('dialog:modal') || document.body;
    if (layer.parentElement !== parent) parent.append(layer);
    card.hidden = !!document.querySelector('#score-board:modal,#restart:modal,.c-replay:modal,.faction-picker:modal');
    const now = performance.now();
    const step = !auto && following ? suggest() : null;
    const text = auto ? (notice && now < until ? notice() : idleMessage?.() || tr('Автогра · чекаю наступного рішення.','Autoplay · waiting for the next decision.')) : step ? tr(step[1],step[2]) : '';
    if (line.textContent !== text) line.textContent = text;
    line.hidden = !text;
    next.hidden = auto;
    const nextLabel = step?.[3] ? tr('Показати фінал','Roll finale') : tr('Наступний крок','Next step');
    if (next.textContent !== nextLabel) next.textContent = nextLabel;
    const hot = step?.[0] ? document.querySelector(step[0]) : null;
    if (hot !== highlighted) { highlighted?.classList.remove('coach-highlight'); hot?.classList.add('coach-highlight'); highlighted = hot }
    const used = new Set();
    if (!auto) for (const [selector, uk, en] of help) for(const el of parent.querySelectorAll(selector)) {
      if (!el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 10 || r.top > innerHeight-10 || r.right < 10 || r.left > innerWidth-10) continue;
      const front = document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,r.left+r.width/2)),Math.min(innerHeight-1,Math.max(0,r.top+r.height/2)));
      if (!el.contains(front) && !layer.contains(front)) continue;
      used.add(el);
      let pin = pins.get(el);
      if (!pin) {
        pin = document.createElement('button'); pin.type = 'button'; pin.className = 'coach-pin'; pin.textContent = '?';
        const open = ()=>showTip(pin,tr(uk,en));
        pin.onmouseenter = open; pin.onfocus = open; pin.onclick = open;
        pin.onmouseleave = ()=>{ if (document.activeElement !== pin && tip===pin) closeTip() };
        pin.onblur = ()=>{ if(tip===pin) closeTip() };
        pins.set(el,pin); layer.append(pin);
      }
      pin.setAttribute('aria-label',tr(uk,en));
      pin.style.left = Math.max(1,Math.min(innerWidth-24,r.right-13))+'px';
      pin.style.top = Math.max(1,Math.min(innerHeight-24,r.top-10))+'px';
    }
    for (const [sel,pin] of pins) if (!used.has(sel)) { if(tip===pin)closeTip();pin.remove();pins.delete(sel) }
  }
  function activate(on) {
    enabled = on; following = false; until = 0; notice = null;
    closeTip(); highlighted?.classList.remove('coach-highlight'); highlighted=null;
    clearInterval(timer); if(on) timer=setInterval(sync,250);
    sync();
  }
  document.addEventListener('click',e=>{
    if (e.target.closest('[data-coach-toggle]')) {
      activate(!enabled); try { localStorage.setItem(key,enabled?'1':'0') } catch {}
    } else if (!layer.contains(e.target)) closeTip();
  });
  next.onclick = ()=>{
    const current = following ? suggest() : null;
    if(current?.[3]){current[3]();sync();return}
    following = true; sync();
    const el=highlighted;
    if (!el) return;
    const drawer=document.querySelector('#game-drawer:modal');
    if(drawer && !drawer.contains(el))drawer.close();
    const panel=el.closest('#arsenal-panel,#hq-panel');
    if (panel && document.body.classList.contains('phone-game') && (!drawer || panel.closest('.sheet-pane')?.hidden)) {
      document.dispatchEvent(new CustomEvent('game-sheet',{detail:panel.id==='hq-panel'?'hq':'arsenal'}));
    } else if(panel?.hidden) document.querySelector('.panel-toggles [aria-controls="'+panel.id+'"]')?.click();
    el.scrollIntoView({block:'nearest',inline:'nearest'});sync();
  };
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTip()});
  document.addEventListener('siege-language',sync);
  activate(enabled);
  return {
    sync, get enabled(){return enabled},
    get slowing(){return enabled && isAuto() && performance.now()<until},
    rate(){return this.slowing ? .3 : 1},
    explain(message){
      if (!enabled || !isAuto()) return;
      sync(); notice=message; until=performance.now()+2400; sync();
    }
  };
}
