import {signalAt,broadcastOverlay,drawBroadcast} from './broadcast-events.js';
import {tr} from './language.js';

// The viewer only reads the wave script. Playback never runs the scoring or purchase loop.
export function replayViewer(host, getStage, restoreReport) {
 const dialog = document.createElement('dialog');
 dialog.className = 'c-replay';
 dialog.setAttribute('aria-labelledby','replay-title');
 dialog.innerHTML = '<header><strong id="replay-title"></strong><button type="button" data-close></button></header><div class="replay-screen"></div><div class="replay-controls"><button type="button" data-play></button><input type="range" min="0" step="10"><output></output></div>';
 document.body.append(dialog);
 const screen = dialog.querySelector('.replay-screen'), controls = dialog.lastElementChild;
 const play = controls.querySelector('button'), seek = controls.querySelector('input'), clock = controls.querySelector('output');
 const placeholder = document.createComment('live camera');
 let film = null, from = 0, length = 0, position = 0, running = false, fresh = false, trigger;
 function reset() {
   const stage = getStage();
   stage.resetWave(); stage.setBroadcast(film.subjects,film.aa,film.archStart);
   fresh = true;
 }
 function labels() {
   play.textContent = running ? tr('Пауза','Pause') : position >= length ? tr('Ще раз','Replay') : tr('Грати','Play');
   clock.value = (position/1000).toFixed(1) + ' / ' + (length/1000).toFixed(1) + tr(' с',' s');
 }
 play.onclick = () => {
   if (position >= length) { position = 0; reset() }
   running = !running; labels();
 };
 seek.oninput = () => { position = Number(seek.value); reset(); labels() };
 dialog.querySelector('[data-close]').onclick = () => dialog.close();
 dialog.onclick = e => { if (e.target === dialog) {
   const r = dialog.getBoundingClientRect();
   if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
 } };
 dialog.onclose = () => {
   const video = screen.querySelector('video'); if (video) video.pause();
   if (film) { placeholder.replaceWith(host) }
   restoreReport(!!film);
   film = null; running = false; screen.replaceChildren();
   trigger?.focus({preventScroll:true});
 };
 return {
   get open() { return dialog.open },
   show(button, title, script, legacy) {
     if (dialog.open) return;
     trigger = button; film = script;
     screen.classList.toggle('witness-window', !!film?.reverse && film.wave % 2 === 0);
     dialog.querySelector('strong').textContent = title;
     dialog.querySelector('[data-close]').textContent = tr('Закрити','Close');
     controls.hidden = !film;
     if (film && getStage()) {
       host.before(placeholder); screen.append(host); screen.insertAdjacentHTML('beforeend',broadcastOverlay());
       from = film.whole ? 0 : Math.max(0,film.time-1600); length = film.whole ? film.duration : film.time+3400-from; position = 0; running = true;
       seek.max = length; seek.value = '0'; seek.setAttribute('aria-label',tr('Час запису','Playback position'));
       reset(); labels();
     } else if (legacy) {
       const video = document.createElement('video');
       video.controls = video.playsInline = video.muted = true;
       video.src = '/leak-'+legacy+'.mp4'; screen.append(video); video.play().catch(()=>{});
     } else {
       film = null; controls.hidden = true; screen.textContent = tr('Для 3D-повтору потрібен WebGL.','3D replay needs WebGL.');
     }
     dialog.showModal();
   },
   tick(dt) {
     if (!film || (!running && !fresh)) return;
     if (running) position = Math.min(length,position+dt*1000);
     const elapsed = from+position, stage = getStage();
     const cam = film.whole ? (film.cuts?.findLast(c=>c.time<=elapsed)?.camera ?? 3) : film.camera ?? film.marker;
     const state = film.showSignal ? signalAt(film,cam,elapsed) : 'live';
     drawBroadcast(screen.querySelector('.broadcast-overlay'),film,cam,elapsed,state);
     stage.step({dt:fresh?0:dt,elapsed,real:elapsed/1000,report:film,cam:Math.min(3,cam),orbital:film.orbital,reverse:film.reverse,satelliteSubject:film.satelliteSubject});
     stage.render(); fresh=false; seek.value=position;
     if(position>=length) running=false;
     labels();
   }
 };
}
