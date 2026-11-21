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
 return '<div class="broadcast-overlay" aria-hidden="true"><span class="camera-projectile" hidden><svg viewBox="0 0 100 100" overflow="visible"><defs><linearGradient id="rk-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#e9e4d8"/><stop offset="1" stop-color="#a9a396"/></linearGradient><linearGradient id="rk-nose" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a45"/><stop offset=".5" stop-color="#e2481f"/><stop offset="1" stop-color="#8f2410"/></linearGradient><radialGradient id="rk-glow"><stop offset="0" stop-color="#fff6d8"/><stop offset=".4" stop-color="#ffb347" stop-opacity=".85"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></radialGradient><linearGradient id="rk-plume" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fff4d0"/><stop offset=".35" stop-color="#ffb040"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></linearGradient></defs><g transform="rotate(32 50 50)"><ellipse cx="38" cy="50" rx="16" ry="14" fill="url(#rk-glow)"/><path d="M38 43Q10 46-14 50Q10 54 38 57Z" fill="url(#rk-plume)" opacity=".9"/><path d="M38 46.5Q20 48 6 50Q20 52 38 53.5Z" fill="#fff6dc"/><path d="M40 42L52 42L36 24L30 24Z" fill="#c23a1a"/><path d="M40 58L52 58L36 76L30 76Z" fill="#8f2a14"/><rect x="38" y="42" width="34" height="16" rx="2.5" fill="url(#rk-body)"/><rect x="46" y="42" width="5" height="16" fill="#23272f"/><rect x="51" y="42" width="2" height="16" fill="#e2481f"/><rect x="63.8" y="42" width="2.2" height="16" fill="#b8321a"/><rect x="66" y="42" width="2.2" height="16" fill="#1d2026"/><path d="M40 44.2H70" stroke="#fff" stroke-width="1.2" opacity=".7" stroke-linecap="round"/><path d="M72 42C84 42 93 46 99 50C93 54 84 58 72 58Z" fill="url(#rk-nose)"/><path d="M74 44.5C82 44.5 89 47 94 49.2" stroke="#fff" stroke-width="1.4" opacity=".55" fill="none" stroke-linecap="round"/><path d="M78 42L74 35L71 35L72 42Z" fill="#e2481f"/><path d="M78 58L74 65L71 65L72 58Z" fill="#8f2410"/><rect x="35" y="43" width="4" height="14" rx="1" fill="#2a2d33"/><ellipse cx="35" cy="50" rx="1.6" ry="6" fill="#ffd890"/></g></svg></span><span class="satellite-pass" hidden>🛰 '+tr('Супутник над об’єктом','Satellite overhead')+'</span><span class="signal-slate" hidden></span></div>';
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
   const footage = el.parentElement?.querySelector('.feed-stage') || (el.parentElement?.matches?.('.feed-stage') ? el.parentElement : null);
   const look = ('drop-shadow(-3px -2px 3px #ffc873) '+(footage?.style.filter||'')).trim();
   if (projectile.style.filter !== look) projectile.style.filter = look;
 }
 const slate = el.lastElementChild;
 slate.hidden = signal === 'live';
 if(!slate.hidden) slate.textContent = signal === 'down' ? tr('Дрон збито · зв’язок втрачено','Drone down · signal lost') : signal === 'press' ? tr('Пресконференція','Press briefing') : tr('Немає сигналу','No signal');
}
