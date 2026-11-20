import {tr} from './language.js';

export function signalAt(r, cam, time) {
 if (!r) return 'live';
 if (cam === 4) return 'press';
 if (cam === 3) return 'live';
 if (r.cameraLoss?.camera === cam && time >= r.cameraLoss.at) return 'down';
 if (r.ew?.marker === cam && time >= r.ew.at && time < r.ew.at+r.ew.dur) return 'jam';
 if (r.musk && time >= r.musk.from && time < r.musk.from+r.musk.dur) return 'dark';
 return 'live';
}

export function broadcastOverlay() {
 return '<div class="broadcast-overlay" aria-hidden="true"><span class="camera-projectile" hidden><svg viewBox="0 0 100 100"><path fill="#ff9833" d="m10 10 43 25-20 18z"/><path fill="#aeafb0" stroke="#3d4854" stroke-width="2" d="m24 36 15-3 25 14 10 27-27-11-14-24-12 7z"/><ellipse fill="#ecdebf" stroke="#8f7862" cx="63" cy="61" rx="10" ry="9"/></svg></span><span class="satellite-pass" hidden>🛰 '+tr('Супутник над об’єктом','Satellite overhead')+'</span><span class="signal-slate" hidden></span></div>';
}
export function drawBroadcast(el, report, cam, time, signal) {
 if (!el) return;
 const pass = report?.partnerPass, loss = report?.cameraLoss;
 el.children[1].hidden = !(pass && time >= pass.from && time <= pass.to);
 const progress = loss?.camera === cam ? 1+(time-loss.at)/1100 : -1;
 const projectile = el.firstElementChild;
 projectile.hidden = !(signal === 'live' && progress >= 0 && progress < 1);
 if (!projectile.hidden) {
   projectile.style.left = (47-24*(1-progress))+'%'; projectile.style.top = (48-32*(1-progress))+'%';
   projectile.style.transform = 'translate(-50%,-50%) scale('+(.06+4.8*progress**3)+')';
 }
 const slate = el.lastElementChild;
 slate.hidden = signal === 'live';
 if(!slate.hidden) slate.textContent = signal === 'down' ? tr('Дрон збито · зв’язок втрачено','Drone down · signal lost') : signal === 'press' ? tr('Пресконференція','Press briefing') : tr('Немає сигналу','No signal');
}
