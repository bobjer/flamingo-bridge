import {watchRelease} from './release-notice.js';
import {createCoach} from './coach.js';
import {coalitionHelp} from './coach-help.js';
import {tr} from './language.js';
import {changeSide, languageButton, read, write, levelField, preferredLevel, rememberLevel} from './factions.js';
import {CFG, costs, openingBudget, retentionFor, offContractRate, newSeason, pickSponsor, purchase, launch, finishWave, nextWave, acceptDeal, declineDeal, evaluate, total, aaChance, cameraSubjects} from './coalition-rules.js';
import {units, unitHints, subjectName, fmtViews, sponsor, cameo, donorLines, ending, wavesWord, icon, chanceTitle} from './coalition-copy.js';
import {createStage} from './coalition-world.js';
import {signalAt,broadcastOverlay,drawBroadcast} from './broadcast-events.js';
import {replayViewer} from './coalition-replay.js';
import {createFeed} from './coalition-video.js';
import {showCoalitionBoard} from './coalition-leaderboard.js';
import {shareRun} from './coalition-share.js';
import {createMusic} from './chiptune.js';
import {planMoves, applyMove, chooseCamera} from './coalition-bot.js';

const saveKey = 'pop-coalition-v2';
const camNames = () => [tr('ДРОН 1','UAV 1'), tr('ДРОН 2','UAV 2'), tr('ДРОН 3','UAV 3'), tr('ДАЛЬНЯ КАМЕРА','FAR CAM'), tr('ПРЕС','PRESS')];
const camShort = () => [tr('Д1','U1'), tr('Д2','U2'), tr('Д3','U3'), tr('ДАЛ','FAR'), tr('ПРЕС','PRS')];
const baseLink = [88, 92, 81, 64, 100];
const mmss = sec => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
const stat = (label, value, cls = '') => '<div class="stat"><label>' + label + '</label><b' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</b></div>';
const button = (id, text, disabled = false, cls = '') => '<button type="button"' + (cls ? ' class="' + cls + '"' : '') + ' data-action="' + id + '"' + (disabled ? ' disabled' : '') + '>' + text + '</button>';
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text };
const setAttr = (el, name, value) => { if (el && el.getAttribute(name) !== value) el.setAttribute(name, value) };
const num = x => tr(String(x).replace('.', ','), String(x));
const tile = (label, value) => '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>';
const sign = n => (n > 0 ? '+' : '') + n;

export function startCoalition() {
 let s = read(saveKey);
 if (s?.version !== 2 || !s.offer || (s.phase === 'watch' && !s.report)) s = newSeason(Math.random, preferredLevel());
 s.difficulty ??= 'normal';
 const canPickLevel = () => s.phase === 'plan' && s.wave === 1 && !total(s);
 // Older arcade saves have three unit slots. Keep their wave, purchases and recorded outcomes.
 for(const field of ['stock','bought'])s[field]=costs.map((_,i)=>s[field]?.[i] ?? 0);
 if (s.phase === 'watch') s.live ??= { resolved: [], pressMs: 0, stamps: 0 };
 let elapsed = s.phase === 'watch' ? s.elapsed || 0 : 0, previous = 0, paused = s.phase === 'watch', frame = 0, jit = 0, sharing = '';
 const root = document.createElement('section');
 root.className = 'coalition'; document.body.classList.add('playing-coalition'); document.body.append(root);
 const music = createMusic(); music.arm();
 const save = () => { s.elapsed = elapsed; return write(saveKey, s) };
 window.addEventListener('pagehide', save);
 const zones = () => cameraSubjects(s).map(subjectName);
 const orbitalName = () => tr('СУПУТНИК','SATELLITE');
 const camTab = () => [...zones().map((z, i) => (i + 1) + ' · ' + z.toUpperCase()), s.offer.orbital ? orbitalName() : tr('ДАЛЬНЯ','FAR'), tr('ПРЕС','PRESS')];
 const camRec = () => [...zones().map((z, i) => camNames()[i] + ' · ' + z.toUpperCase()), s.offer.orbital ? orbitalName() : tr('ДАЛЬНЯ','FAR CAM'), tr('ПРЕС-КОНФЕРЕНЦІЯ','PRESS BRIEFING')];
 const marketLine = () => {
  if (!s.offer.reach) return '';
  const name = s.offer.spotlight ? tr('Прайм-тайм','Prime time') : s.market === 'local' ? tr('Місцевий ефір','Local broadcast') : s.market === 'network' ? tr('Мережа каналів','Network syndication') : tr('Національний ефір','National broadcast');
  return name+' · '+tr('аудиторія ×','audience ×')+num(s.offer.reach.toFixed(2))+' · '+tr('гонорар ×','fee ×')+num(s.offer.fee.toFixed(2));
 };
 const wave = () => tr('Хвиля ', 'Wave ') + s.wave;
 const watching = () => s.phase === 'watch' && s.report;
 const pressActive = () => { const p = watching() && s.report.press; return !!p && elapsed >= p.at && elapsed < p.at + p.dur };
 const frozen = () => { const c = watching() && s.report.committee; return !!c && elapsed >= c.at && s.live.stamps < 3 };

 /* ---------- persistent 3D view: created once, re-attached into every new feed after render() ---------- */
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 let autoOn = false;
 const auto = { stage: '', t: 0, queue: null, launch: false, stampAt: 0, holdUntil: 0 };
 const feedLayer = createFeed();
 let stage = null, waveKey = '', prevView = 0, firstFrame = false;
 let drawnCam = -1, holdShotUntil = 0;
 const player = replayViewer(feedLayer.host, () => stage, rewind => { if (rewind) waveKey = ''; auto.t = performance.now()+2500 });
 let finale = 0;
 let pickedWave = 0;
 const coach = createCoach({isAuto:()=>autoOn && s.phase!=='over',help:coalitionHelp,suggest:coalitionSuggestion,idleMessage:()=>s.phase==='report'?tr('Ефір завершено. Перегляньте повтор або натисніть «Наступна хвиля».','Broadcast complete. Watch the replay or choose Next wave.'):null});
 const lessonGoal = 3;
 const lessonReady = () => (s.lessonBridgeShots ?? 0) >= lessonGoal && !s.lessonBridgeDone;
 function coalitionSuggestion(){
  const progress = ' (' + (s.lessonBridgeShots ?? 0) + '/' + lessonGoal + ')';
  if(finale) return ['.c-feed','Навчальний фінал: камера пише обвал. Після кадру повернемося до звіту.','Training finale: the camera is rolling as the bridge falls. Your report follows.'];
  if(['report','over'].includes(s.phase) && lessonReady() && stage)
   return [null,'Три кадри мосту знято! Покажіть обвал у фіналі навчального ефіру.','Three bridge hits on film! Roll the collapse for the finale of your training broadcast.',startFinale];
  if(s.phase==='over') return ['[data-action="fresh"]','Сезон закінчено. Почніть новий ефір, щоб знову пройти навчання.','The season is over. Start another broadcast to try the lesson again.'];
  if(s.phase==='report') return ['[data-action="next"]',s.lessonBridgeDone?'Фінал знято! Можете продовжити свою партію.':'Відкрийте наступну хвилю. Для навчального фіналу зберіть три кадри влучань у міст.'+progress,s.lessonBridgeDone?'Finale filmed! You can keep playing this run.':'Open the next wave. Collect three shots of the bridge taking damage for the training finale.'+progress];
  if(s.phase==='plan'){
   if(s.deal==='pending') return ['[data-action="nodeal"]','Відхиліть паузу в контракті, щоб провести ефір цієї хвилі.','Decline the deal to keep this wave on air.'];
   if(pickedWave!==s.wave && !total(s)) return ['[data-offer]','Оберіть одну картку спонсора. Її умови визначають виплату за відео.','Pick a sponsor card. Its terms decide how much your footage earns.'];
   if(!total(s)) return ['.c-plus:not(:disabled)','Додайте учасника до ефіру кнопкою +1.','Add a unit to the broadcast with +1.'];
   if(s.lessonBridgeDone) return ['[data-action="attack"]','Навчання пройдено. Запускайте наступний ефір, коли будете готові.','Lesson complete. Launch the next broadcast when you are ready.'];
   return ['[data-action="attack"]','Натисніть «Пуск». Навчальна ціль — зняти три влучання в міст і показати його обвал.'+progress,'Press Launch. Film three bridge hits across your broadcasts to unlock the collapse.'+progress];
  }
  if(paused) return ['[data-action="pause"]','Продовжіть ефір, щоб камери знову запрацювали.','Resume the broadcast to bring the cameras back.'];
  if(frozen()) return ['[data-stamp]:not(.done)','Зберіть три печатки. Ефір продовжиться після останньої.','Collect all three stamps to restart the broadcast.'];
  const signal='.feed-cams button[data-link="live"][data-warn="true"]';
  if(lessonReady()) return ['.c-score','Є три кадри! Дочекайтеся звіту й натисніть «Показати фінал».','Three shots recorded! Wait for the report, then choose Roll finale.'];
  const tab=[...root.querySelectorAll(signal)].find(el=>['arch','pier','hole'].includes(cameraSubjects(s)[Number(el.dataset.cam)]));
  if(tab) return [signal+'[data-cam="'+tab.dataset.cam+'"]','Блимає камера '+(Number(tab.dataset.cam)+1)+'. Відкрийте її й потримайте до появи суми.','Camera '+(Number(tab.dataset.cam)+1)+' is flashing. Keep it open until the payment appears.'];
  return ['.feed-cams button[data-cam="3"]','Увімкніть загальний план, поки немає підказки від камери мосту. Він теж зараховує зняті влучання.'+progress,'Use the wide feed while you wait for a bridge camera to flash. Wide shots also count.'+progress];
 }
 function startFinale(){
  if(!stage || !lessonReady() || !['report','over'].includes(s.phase) || finale)return;
  finale=6.5;stage.lessonFinale(true);root.classList.add('coach-finale');root.querySelector('.c-feed')?.scrollIntoView({block:'nearest'});
 }
 function endFinale(completed){
  finale=0;stage.lessonFinale(false);root.classList.remove('coach-finale');
  if(completed && s.report){s.lessonBridgeDone=true;save()}coach.sync();
 }
 const realStart = performance.now();

 /* ---------- link state of each camera ---------- */
 function linkState(cam) {
  return signalAt(watching() && s.report,cam,elapsed);
 }
 // 0-100: baseline per camera, collapsing 1.5 s before an EW window, zero when jammed or blacked out
 function linkQuality(cam) {
  const st = linkState(cam);
  if (st === 'jam' || st === 'dark' || st === 'down') return 0;
  if (cam >= 3) return baseLink[cam] === 100 ? 100 : baseLink[cam] + jit * .4;
  let q = baseLink[cam] + jit;
  const r = watching() && s.report, ew = r && r.ew;
  if (ew && ew.marker === cam && elapsed >= ew.at - 1500 && elapsed < ew.at) q *= Math.pow(1 - (elapsed - (ew.at - 1500)) / 1500, 1.3);
  return Math.max(0, Math.min(100, q));
 }
 const lostText = state => state === 'down' ? tr('Дрон збито','Camera drone down') : state === 'jam' ? tr('РЕБ · ЦЕЙ МАРКЕР ВИДНО ТІЛЬКИ З ДАЛЬНЬОЇ КАМЕРИ', 'EW · THIS MARKER IS ONLY VISIBLE ON THE FAR CAM')
  : state === 'dark' ? tr('ПРОШИВКУ ОНОВЛЕНО · «Ви ж просили свободу слова»', 'FIRMWARE UPDATED · “You did ask for free speech”')
  : state === 'press' ? tr('ПРЕС-КОНФЕРЕНЦІЯ · ПЕРЕГЛЯДИ РОСТУТЬ, ВЛУЧАННЯ НЕ ЗНІМАЮТЬСЯ', 'PRESS BRIEFING · VIEWS GROW, HITS ARE NOT FILMED') : '';

 /* ---------- live score and popups ---------- */
 const queued = [];
 function ticker(text, cls) {
  const box = root.querySelector('[data-ticker]'); if (!box) return;
  const el = document.createElement('div'); el.className = cls; el.textContent = text; box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 2600);
 }
 function pop(text, cls, sub = '') {
  const box = root.querySelector('[data-pop]'); if (!box) return;
  const el = document.createElement('div'); el.className = 'pop ' + cls;
  el.innerHTML = '<b>' + text + '</b>' + (sub ? '<span>' + sub + '</span>' : '');
  box.append(el);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => el.remove(), 1700);
 }
 let pendingFrame = null;
 function recordDroneFrame(cam) {
  const shot = pendingFrame;
  pendingFrame = null;
  if (!shot || shot.report !== s.report || shot.cam !== cam || linkState(cam) !== 'live') return;
  const image = feedLayer.still(stage.glCanvas);
  if (image) (s.report.stills ??= {})[cam] = {image, time: shot.time};
 }
 const liveScore = () => watching() ? evaluate(s, s.captures, elapsed, { pressMs: s.live.pressMs }) : null;
 function resolveImpacts() {
  const r = s.report, L = s.live;
  for (let i = 0; i < r.flights.length; i++) {
   const f = r.flights[i];
   if (L.resolved[i] || f.impact > elapsed) continue;
   L.resolved[i] = true;
   const where = subjectName(f.extra ?? cameraSubjects(s)[f.marker]), big = s.cam === 3 || s.cam === f.marker;
   const say = (text, cls, sub) => big ? pop(text, cls, sub) : ticker(where + ' · ' + text, cls);
   if (f.noScene) { ticker(tr('Усі об’єкти цієї хвилі вже вибули','No active objects left this wave'),'shot'); continue }
   if (!f.success && !f.intercepted) { say(tr('МИМО','MISSED'), 'shot', where); continue }
   let kind = 'none';
   const state = linkState(s.cam);
   if (f.success && !f.decree) {
     if (s.cam === 3) kind = 'far';
     else if (s.cam < 3 && state === 'live') {
       const otherInShot = drawnCam === s.cam && stage?.project(f.marker);
       if (s.cam === f.marker || otherInShot?.half >= 9) kind = 'drone';
     }
     (r.filmLog ??= {})[i] = {camera:s.cam,state};
     if (kind !== 'none') holdShotUntil = Math.max(holdShotUntil,performance.now()+(cameraSubjects(s)[f.marker]==='cruiser' && !f.extra ? 3100 : 900));
   }
   s.captures[i] = kind;
   if (coach.enabled && !autoOn && (kind === 'drone' || kind === 'far') && ['arch','pier','hole'].includes(cameraSubjects(s)[f.marker])) {
    s.lessonBridgeShots = Math.min(lessonGoal, (s.lessonBridgeShots ?? 0) + 1);
   }
   if (kind === 'drone' && !r.stills?.[s.cam]) pendingFrame = {report:r, cam:s.cam, time:f.impact};
   const score = evaluate(s, s.captures, f.impact);
   const pay = score.payNow[i];
   const payout = score.orderHit === i ? tr('Передзамовлення','Preorder')+' · '+productionText(r.orderOffer) : (r.sponsor === 'conference' ? tr('Аванс','Advance') : tr('Виплата','Payout')) + ' +' + pay;
   if (f.intercepted) { say(tr('ЗБИТО','SHOT DOWN') + (pay ? ' · ' + payout : ''), 'shot', where); continue }
   const hit = score.hits.find(h => h.i === i);
   if (f.decree) say(tr('СКАСОВАНО УКАЗОМ','CANCELLED BY DECREE'), 'decree', where);
   else if (kind === 'drone') say(tr('ЗНЯТО','FILMED') + ' · ' + payout, 'ok', hit.combo >= 1 ? tr('КОМБО ×','COMBO ×') + (hit.combo + 1) : where);
   else if (kind === 'far') say(tr('ЗАРЕВО','GLOW') + ' · ' + payout, 'far', where);
   else say(tr('ВЛУЧАННЯ · ','HIT · ') + where, 'none', ['down','jam','dark'].includes(state) ? tr('Втрачено зв’язок','Signal lost') : tr('Поза кадром','Off camera'));
  }
 }

 // Everything dynamic about the feed lives here, so switching camera never needs render().
 function refreshFeed() {
  const feed = root.querySelector('.c-feed'); if (!feed) return;
  if (s.cam === 4 && !pressActive()) selectFeed(3);
  const cam = s.cam, state = linkState(cam), now = watching();
  drawBroadcast(feed.querySelector('.broadcast-overlay'),now && s.report,cam,elapsed,state);
  setAttr(feed, 'data-cam', String(cam)); setAttr(feed, 'data-state', state); setAttr(feed, 'data-frozen', String(now && frozen()));
  feed.classList.toggle('cam-far', cam >= 3);
  const air = [0, 0, 0], warn = [false, false, false];
  if (now) s.report.flights.forEach((f, i) => { if (!s.live.resolved[i] && f.start <= elapsed && f.impact > elapsed) { air[f.marker]++; if (f.impact - elapsed <= 1500) warn[f.marker] = true } });
  for (const b of feed.querySelectorAll('button[data-cam]')) {
   const c = Number(b.dataset.cam);
   setAttr(b, 'aria-pressed', String(c === cam)); setAttr(b, 'data-link', linkState(c));
   const n = c < 3 ? air[c] : c === 3 ? air[0] + air[1] + air[2] : 0, w = c < 3 ? warn[c] : c === 3 ? warn.some(Boolean) : false;
   setAttr(b, 'data-warn', String(w && c !== cam));
   setText(b.querySelector('[data-air]'), c === 4 || !now ? '' : '▲' + n);
   if (c === 4) b.hidden = !pressActive();
   setAttr(b, 'aria-label', (c === 3 && s.offer.orbital ? orbitalName() : camNames()[c]) + (c < 3 ? ' · ' + zones()[c] : '') + (c === 4 ? '' : ', ' + tr('у повітрі ', 'in the air ') + n));
  }
  setText(feed.querySelector('[data-lost]'), lostText(state));
  const e = liveScore();
  setText(feed.querySelector('[data-views]'), fmtViews(e ? e.views : s.views));
  setText(feed.querySelector('[data-combo]'), '×' + (e ? e.combo : s.bestCombo));
  const viral = feed.querySelector('[data-viral]'); if (viral) viral.hidden = !(e && e.viral);
  music.setGlitch(now && !paused && (state === 'jam' || state === 'dark'));
 }
 function selectFeed(n) {
  s.cam = n;
  if (watching()) {
    const cuts = s.report.cuts ??= [];
    if (cuts.at(-1)?.time === elapsed) cuts.pop();
    if (cuts.at(-1)?.camera !== n) cuts.push({time:elapsed,camera:n});
  }
 }
 function setCam(n) {
  if (n === s.cam || (n === 4 ? !pressActive() : ![0, 1, 2, 3].includes(n))) return;
  if (s.phase === 'watch' && paused) return;
  selectFeed(n); save(); refreshFeed();
 }

 /* ---------- copy ---------- */
 const phaseWord = () => ({ plan: tr('ПЛАНУВАННЯ','PLANNING'), watch: paused ? tr('ПАУЗА','PAUSED') : tr('ЕФІР','ON AIR'), report: tr('ЗВІТ','REPORT'), over: tr('КІНЕЦЬ','GAME OVER') })[s.phase];
 const aaPct = () => Math.round(100 * aaChance(s.wave));
 const rebateText = r => tr('Оптимізація закупівлі','Procurement optimisation')+' · '+(r.items ?? [r]).map(item=>units()[item.type]+' ×'+item.n).join(' + ');

 /* ---------- markup ---------- */
 const autoText = () => autoOn ? [tr('✋ Грати самому','✋ Take over'), '✋'] : [tr('Автогра','Autoplay'), tr('▶ АВТО','▶ AUTO')];
 function autoButton() {
  const [full, short] = autoText();
  return '<button type="button" class="c-sides c-auto' + (autoOn ? ' on' : '') + '" data-action="auto" aria-pressed="' + autoOn + '" title="' + tr('Звітність передано підряднику. Відкат — за домовленістю.','Reporting outsourced to a contractor. Kickback negotiable.') + '"' + (s.phase === 'over' ? ' disabled' : '') + '><span class="full">' + full + '</span><span class="short" aria-hidden="true">' + short + '</span></button>';
 }
 function header() {
  const muted = music.muted;
  return '<header class="top"><div class="top-left"><img src="/coalition-koala.svg" width="30" height="30" alt=""><span class="label">' + tr('ШТАБ КОАЛІЦІЇ · ВІДДІЛ ЗВІТНОСТІ','COALITION HQ · REPORTING DEPARTMENT') + '</span></div>' +
   '<div class="top-title"><strong>' + tr('СЕЗОН ХЛОПКІВ','POP SEASON') + '</strong><span>' + tr('КОАЛІЦІЯ ОХОЧИХ','COALITION OF THE WILLING') + '</span></div>' +
   '<div class="top-status">' + languageButton() + '<button type="button" class="c-sides c-quiet" data-action="quiet" aria-pressed="' + muted + '" aria-label="' + tr('Тихий режим','Quiet mode') + '"><span class="full">' + tr('Тихий режим','Quiet mode') + '</span><span class="short" aria-hidden="true">' + '♪' + '</span></button>' +
   autoButton() + '<button type="button" class="c-sides" data-coach-toggle aria-pressed="' + coach.enabled + '">' + tr('Навчання','Coach') + '</button><span class="label">' + tr('РЕЖИМ','MODE') + '</span><span class="chip"><i class="dot" aria-hidden="true"></i><span>' + phaseWord() + '</span></span>' + button('sides', tr('Спочатку','Start over'), false, 'c-sides') + '</div></header>';
 }
 function left() {
  const tired = Math.round((1 - s.fatigue) * 100);
  const cut = num(Math.round(1000 * (1 - retentionFor(s))) / 10);
  return '<aside class="col c-left" aria-label="' + tr('Штаб','HQ') + '">' +
   '<section class="panel br"><div class="label">' + tr('ПОТОЧНА ФАЗА','CURRENT PHASE') + '</div><div class="phase-row"><b class="big" aria-hidden="true">' + String(s.wave).padStart(2, '0') + '</b><div><h1>' + tr('Нема відео — <i>не було</i>','No video — <i>no happened</i>') + '</h1><div class="c-phase">● ' + phaseWord() + '</div></div></div></section>' +
   '<section class="panel br"><div class="label">' + tr('ЗВЕДЕННЯ','SUMMARY') + '</div>' +
    stat(tr('Бюджет','Budget'), s.funds, 'c-accent') + (s.offer.reach ? '<small class="c-tired">'+marketLine()+'</small>' : '') + '<div class="c-views"><label>' + tr('Перегляди','Views') + '</label><b class="big">' + fmtViews(s.views) + '</b></div>' +
    stat(tr('Найкраще комбо','Best combo'), '×' + s.bestCombo) + stat(tr('Імовірність збиття на ППО','Anti-air kill chance'), aaPct() + '%') +
    (s.production ? stat(tr('У виробництві','In production'), productionText(s.production)) : '') + (s.ious.length ? stat(tr('Конференція винна','Conference owes'), s.ious.reduce((a, x) => a + x.amount, 0)) : '') + '</section>' +
   '<section class="panel br"><div class="label">' + tr('ВТОМА ДОНОРІВ','DONOR FATIGUE') + '</div>' +
    '<progress max="100" value="' + Math.round(s.fatigue * 100) + '" aria-label="' + tr('Поточний множник виплат','Current payout multiplier') + '"></progress>' +
    '<small class="c-tired">' + tr('Донори втомились на ' + tired + '%','Donors are ' + tired + '% tired') + ' · ' + tr('виплати ×','payouts ×') + num(s.fatigue.toFixed(2)) + '</small></section>' +
   '<section class="panel br brief"><div class="label">' + tr('ІНСТРУКТАЖ','BRIEFING') + '</div>' +
    '<details><summary>' + tr('Як це працює','How it works') + '</summary><p>' + tr('Спонсори платять за кадр. Камера дрона зі зв’язком записує влучання у своєму кадрі. Дальня камера дає 50% за паляницю й 30% за решту, з урахуванням умов спонсора. Ігровий повтор доступний завжди. За пропущений кадр можуть заплатити партнери, якщо його зняв супутник або надійшов витік.','Sponsors pay for footage. A connected drone records hits in its frame. The far camera gives 50% for Palianytsia and 30% for other units, subject to sponsor terms. Game replays are always available. Satellite footage or a later leak can earn funding for an off-camera hit.') + '</p><p>' + tr('Кожне наступне влучання, зняте дроном, дає +25% переглядів. Промах камери скидає комбо.','Each next hit filmed by a drone adds +25% views. A missed camera resets the combo.') + '</p><p>' + tr('«Автогра» віддає ефір підряднику: він купує зграю й перемикає дрони. Забіг позначається в лідерборді.','“Autoplay” outsources the broadcast to a contractor who buys the flock and switches drones. The run is marked on the leaderboard.') + '</p></details>' +
    '<details><summary>' + tr('Камери','Cameras') + '</summary><p>' + tr('Три камери висвітлюють три сюжети хвилі. Назву сюжету видно на вкладці. Іноді на четвертій камері доступний супутниковий проліт за тарифом дальньої камери. На вкладці «▲N» — скільки юнітів летить до маркера; за 1,5 с до удару вона блимає. Клавіші 1–4 (5 — пресконференція).','Three cameras cover three stories each wave. Each tab names its story. Occasionally the fourth tab receives a satellite pass at the far-camera rate. “▲N” on a tab is how many units are heading to that marker; it blinks 1.5 s before impact. Keys 1–4 (5 is the press tab).') + '</p></details>' +
    '<details><summary>' + tr('Гарнізон і втома','Garrison and fatigue') + '</summary><p>' + tr('Над маркерами видно значки ППО. Шанс збиття 8% + 4,5% за хвилю, максимум 70%; Малюків збивають вдвічі рідше. На цій складності ставки за наступну хвилю падають на ' + cut + '%. Базова ставка за контрактний кадр — ' + CFG.hitContract + ', за інший — ' + offContractRate(s.difficulty) + '.','Anti-air icons sit above covered markers. Kill chance is 8% + 4.5% per wave, capped at 70%; Maliuk is hit half as often. At this difficulty rates fall by ' + cut + '% each wave. Base rates are ' + CFG.hitContract + ' for a contract shot and ' + offContractRate(s.difficulty) + ' for other footage.') + '</p></details>' +
    '<details><summary>' + tr('Юніти','Units') + '</summary><p>' + units().map((n, i) => n + ' ' + costs[i] + ' — ' + unitHints()[i]).join('; ') + '.</p></details></section></aside>';
 }
 const unitList = list => list.map(([n, i]) => n + ' ×' + i).join(' → ');
 const legacyTitles = () => ({span:tr('Проліт упав · камера з човна','Span down · boat camera'),hole:tr('Діра в асфальті · відеореєстратор','Road crater · dashcam'),train:tr('Поїзд полетів · камера рибалки','Airborne train · angler’s camera')});
 function playThumb(key, title, src) {
   return '<button type="button" class="c-play-thumb" data-film="'+key+'" aria-label="'+tr('Відтворити: ','Play: ')+title+'"><img loading="lazy" src="'+src+'" alt=""><span aria-hidden="true">▶</span></button>';
 }
 const poster = subject => '/replay-'+subject+'.jpg';
 function droneReel() {
   const r = s.report;
   if (!r?.flights) return '';
   const tiles = r.flights.flatMap((f,i) => {
     if (f.noScene || f.decree) return [];
     const capture = s.captures[i] ?? 'none', cam = r.filmLog?.[i]?.camera ?? f.marker;
     const title = subjectName(f.extra ?? cameraSubjects(s)[f.marker]), still = r.stills?.[cam];
     const src = still?.time === f.impact && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(still.image) ? still.image : poster(cameraSubjects(s)[f.marker]);
     const lost = ['jam','dark','down'].includes(r.filmLog?.[i]?.state);
     const label = f.intercepted ? tr('Збито · повтор','Shot down · replay') : !f.success ? tr('Промах · повтор','Miss · replay') : capture==='drone' ? 'DVR '+(cam+1) : capture==='far' ? camNames()[3] : lost ? tr('Без зв’язку · повтор','Signal lost · replay') : tr('Поза кадром · повтор','Off camera · replay');
     const redirect = f.originalMarker != null ? zones()[f.originalMarker]+' → ' : '';
     return ['<figure>'+playThumb('hit-'+i,title,src)+'<figcaption>'+label+' · '+mmss(Math.floor(f.impact/1000))+'<b>'+redirect+title+'</b></figcaption></figure>'];
   });
   for (const i of r.partnerShots ?? []) {
     const f = r.flights[i], title = subjectName(f.extra ?? cameraSubjects(s)[f.marker]);
     tiles.push('<figure>'+playThumb('sat-'+i,title,poster(cameraSubjects(s)[f.marker]))+'<figcaption>'+tr('Супутник від партнерів','Partner satellite')+' · '+mmss(Math.floor(f.impact/1000))+'<b>'+title+'</b></figcaption></figure>');
   }
   if(r.cameraLoss) tiles.push('<figure>'+playThumb('loss-0',tr('Останній кадр дрона','Last drone transmission'),poster(cameraSubjects(s)[r.cameraLoss.camera]))+'<figcaption>'+tr('Дрон збито','Camera drone down')+' · '+mmss(Math.floor(r.cameraLoss.at/1000))+'</figcaption></figure>');
   return '<button type="button" class="wave-replay" data-film="wave-0">▶ '+tr('Повтор хвилі','Replay wave')+'</button><div class="c-stills">'+tiles.join('')+'</div>';

 }
 function leakReel() {
   return (s.report?.leaks ?? []).map((l,i) => {
     const subject = l.film?.subjects[l.film.marker], title = subject ? subjectName(l.film.subject ?? subject) : legacyTitles()[l.clip];
     if (!title) return '';
     return '<figure class="c-leak">'+playThumb('leak-'+i,title,subject?poster(subject):'/leak-'+l.clip+'.svg')+'<figcaption><small>'+tr('ВИТІК З ТОГО БОКУ · ХВИЛЯ ','LEAKED FOOTAGE · WAVE ')+l.source+'</small><strong>'+title+'</strong><span>+'+fmtViews(l.views)+' '+tr('переглядів','views')+(l.funding?' · +'+l.funding+' '+tr('до бюджету','funding'):'')+'</span></figcaption></figure>';
   }).join('');
 }
 function openFilm(b) {
   const [kind,id] = b.dataset.film.split('-'), r = s.report;
   if(kind === 'wave' || kind === 'loss') {
     if(!r?.flights || (kind==='loss' && !r.cameraLoss)) return;
     player.show(b,kind==='wave'?wave():tr('Останній кадр дрона','Last drone transmission'),{...r,aa:s.aa,subjects:cameraSubjects(s),whole:kind==='wave',camera:r.cameraLoss?.camera ?? 3,time:r.cameraLoss?.at ?? 0,orbital:s.offer.orbital,showSignal:true});
   } else if(kind === 'leak') {
     const l = r?.leaks?.[id]; if(!l) return;
     if(l.film) player.show(b,subjectName(l.film.subject ?? l.film.subjects[l.film.marker]),{...l.film,reverse:true});
     else if(Object.hasOwn(legacyTitles(),l.clip)) player.show(b,legacyTitles()[l.clip],null,l.clip);
   } else {
     const f = r?.flights?.[id]; if(!f || f.noScene || f.decree) return;
     const camera = kind==='sat' || s.captures[id]==='far' ? 3 : s.captures[id]==='drone' ? (r.filmLog?.[id]?.camera ?? f.marker) : f.marker;
     player.show(b,subjectName(f.extra ?? cameraSubjects(s)[f.marker]),{...r,aa:s.aa,subjects:cameraSubjects(s),time:f.impact,marker:f.marker,camera,satelliteSubject:kind==='sat'?f.marker:undefined,orbital:kind==='sat' || camera===3 && s.offer.orbital});
   }
 }
 function chanceCard() {
  const c = s.report?.chance;
  if (!c) return '';
  const effect = c.fee === 1
    ? tr('Інтерес спонсорів +','Sponsor interest +')+c.points+tr(' в. п.',' pp')
    : tr('Гонорар наступної хвилі ','Next wave’s fee ')+sign(Math.round((c.fee-1)*100))+'%';
  return '<aside class="c-chance"><small>'+tr('КАРТКА «ШАНС»','CHANCE CARD')+'</small><strong>'+chanceTitle(c.id)+'</strong><span>'+effect+'</span></aside>';
 }
 function productionText(order) {
  const country = [tr('Данія','Denmark'),tr('Польща','Poland'),tr('Норвегія','Norway')][order.country];
  return country+' · '+units()[order.type]+' ×'+order.remaining;
 }
 function productionReport(r) {
  const deal = r.signedOrder, d = r.delivery;
  return (deal ? '<p class="c-good">'+tr('За кадр спонсор оплатив виробництво','Sponsor prepaid production for the footage')+' · '+productionText(deal)+' · '+deal.turns+tr(' хвиль',' waves')+'</p>' : '') +
   (d ? '<p>'+tr('Поставка','Delivery')+' · '+units()[d.type]+' +'+d.delivered+
    (d.lost ? tr(' · зникло при закупівлі: ',' · lost to corruption: ')+d.lost : '')+
    tr(' · залишилось поставити: ',' · still on order: ')+d.remaining+'</p>' : '');
 }
 function reportCard() {
  const r = s.report, x = r.result;
  if (r.skipped) return '<section class="c-card" data-tone="report" role="dialog" aria-labelledby="c-title"><div class="c-kicker">' + tr('КАМЕО · ТРАМП · ХВИЛЯ ','CAMEO · TRUMP · WAVE ') + r.wave + '</div><h2 id="c-title">' + tr('Угоду підписано','Deal signed') + '</h2>' +
   '<dl class="c-stats">' + tile(tr('Гроші','Money'), sign(x.money)) + tile(tr('Перегляди','Views'), fmtViews(x.views)) + tile(tr('Втома','Fatigue'), '×' + num((s.fatigue).toFixed(2))) + '</dl>' +
   '<p>' + tr('Угоду підписано. Війну завершено. У понеділок продовжимо.','Deal signed. War ended. We resume on Monday.') + '</p>' +
   productionReport(r) + leakReel() + '<button type="button" data-action="next">' + tr('Наступна хвиля →','Next wave →') + '</button></section>';
  const lines = donorLines(r, s).map(l => '<p class="c-line">' + l + '</p>');
  lines.unshift(productionReport(r));
  if (r.reserveReleased) lines.unshift('<p class="c-good">'+tr('Фінансування згорнуто. У касі ','Funding withdrawn. Budget: ')+s.funds+tr('. На наступну хвилю зі складу видано ракет: ','. Reserve missiles available next wave: ')+r.reserveReleased+'.</p>');
  if (r.newSponsor) lines.unshift('<p class="c-good">'+tr('Новий спонсор: ','New sponsor: ')+sponsor(r.newSponsor).name+tr(' · аванс +',' · advance +')+r.advance+'</p>');
  if (r.sponsor === 'defence') lines.push('<p>' + tr('Оборонний концерн: освоєно ' + r.units + ' юнітів.','Defence Concern: ' + r.units + ' units absorbed.') + '</p>');
  if (x.viral) lines.push('<p class="c-good">' + tr('Вірусно, бо нічого не видно: перегляди ×2.','Viral because nothing was visible: views ×2.') + '</p>');
  if (r.decree) lines.push('<p>' + tr('Трамп образився: одне влучання скасовано указом.','Trump took offence: one hit was cancelled by decree.') + '</p>');
  if (s.offer.spotlight) lines.push('<p>'+marketLine()+'</p>');
  if ((s.offer.chanceFee ?? 1)!==1) lines.push('<p>'+tr('Картка «Шанс» · гонорар цієї хвилі ','Chance card · this wave’s fee ')+sign(Math.round(100*(s.offer.chanceFee-1)))+'%</p>');
  if (r.partnerFunding) lines.push('<p class="c-good">'+tr('Супутник від партнерів · фінансування +','Partner satellite · funding +')+r.partnerFunding+'</p>');
  if (r.rebate) lines.push('<p>' + rebateText(r.rebate) + '</p>');
  if (x.pressMs) lines.push('<p>' + tr('Пресконференція: перегляди є, відео немає.','Press briefing: the views are there, the footage is not.') + '</p>');
  if (x.iou.paid) lines.push('<p class="c-good">' + tr('Конференція партнерів виплатила ' + x.iou.paid + '.','The Partners’ Conference paid ' + x.iou.paid + '.') + '</p>');
  if (x.iou.postponed) lines.push('<p>' + tr('Конференція партнерів: «перенесено на наступний рік» (' + x.iou.postponed + ').','Partners’ Conference: “postponed to next year” (' + x.iou.postponed + ').') + '</p>');
  if (r.sponsor === 'conference') lines.push('<p>' + tr('Конференція виплатить через дві хвилі. Може бути.','The conference pays in two waves. Maybe.') + '</p>');
  return '<section class="c-card" data-tone="report" role="dialog" aria-labelledby="c-title"><div class="c-kicker">' + tr('ЗВІТ ДОНОРУ · ХВИЛЯ ','DONOR REPORT · WAVE ') + r.wave + '</div><h2 id="c-title">' + tr('Звіт донору','Donor report') + '</h2><small>' + sponsor(r.sponsor).name + '</small>' + chanceCard() + leakReel() +
   '<dl class="c-stats">' + tile(tr('Знято','Filmed'), (x.filmed + x.far) + '/' + x.hits) + tile(tr('Не знято','Not filmed'), x.none) + tile(tr('Збито','Shot down'), x.shot) + '</dl>' +
   '<dl class="c-stats c-stats-2">' + tile(tr('Гроші','Money'), sign(x.money)) + tile(tr('Перегляди','Views'), fmtViews(x.views)) + tile(tr('Комбо','Combo'), '×' + x.combo) + '</dl>' +
   lines.join('') + droneReel() + '<button type="button" data-action="next">' + tr('Наступна хвиля →','Next wave →') + '</button></section>';
 }
 function overCard() {
  return '<section class="c-card" data-tone="lost" role="dialog" aria-labelledby="c-title"><div class="c-kicker">' + tr('ЗВІТ ДОНОРУ · ПІДСУМОК','DONOR REPORT · FINAL') + '</div><h2 id="c-title">' + tr('Спонсори згорнули програму','The sponsors pulled out') + '</h2><p>'+tr('Виплата за хвилю: ','Wave payout: ')+s.report.result.money+tr('. У касі ','. Budget: ')+s.funds+tr(', найдешевша ракета коштує ',', cheapest missile: ')+Math.min(...costs)+tr('. Склад порожній. Нового авансу немає.','. No missiles in stock and no new advance.')+'</p>' + chanceCard() + droneReel() + leakReel() +
   '<dl class="c-stats c-stats-over">' + tile(tr('Перегляди','Views'), fmtViews(s.views)) + tile(tr('Хвиль','Waves'), s.wave) + tile(tr('Комбо','Combo'), '×' + s.bestCombo) + '</dl>' +
   '<p class="c-line">' + wavesWord(s.wave) + tr('. ', '. ') + tr(fmtViews(s.views) + ' переглядів. 0 змін. ', fmtViews(s.views) + ' views. 0 changes. ') + ending(s) + '</p>' +
   (s.assisted ? '<p class="c-note">' + tr('Забіг з автогрою','Run with autoplay') + '</p>' : '') +
   levelField(preferredLevel(), true) + '<div class="c-actions"><button type="button" class="c-ghost" data-action="share">' + tr('Поділитися','Share') + '</button><button type="button" data-action="fresh">' + tr('Ще раз','Play again') + '</button></div>' +
   '<small class="c-share-status" role="status">' + sharing + '</small></section>';
 }
 function trumpCard() {
  const c = cameo.trump(), gain = Math.round(CFG.trumpPay * s.fatigue);
  return '<section class="c-card c-trump" data-tone="lost" role="dialog" aria-modal="true" aria-labelledby="c-title"><div class="c-kicker">' + tr('КАМЕО · ТРАМП','CAMEO · TRUMP') + '</div><h2 id="c-title">«' + c.title + '»</h2>' +
   '<p>' + tr('Пропусти хвилю й отримай +' + gain + '. Втома донорів зросте вдвічі. «Угоду підписано. Війну завершено. У понеділок продовжимо.»','Skip the wave and take +' + gain + '. Donor fatigue doubles. “Deal signed. War ended. We resume on Monday.”') + '</p>' +
   '<p class="c-note">' + tr('Відмовишся — він образиться: одне влучання буде «скасовано указом».','Decline and he takes offence: one hit will be “cancelled by decree”.') + '</p>' +
   '<div class="c-actions"><button type="button" data-action="deal">' + tr('Підписати +' + gain,'Sign +' + gain) + '</button><button type="button" class="c-ghost" data-action="nodeal">' + tr('Відмовитись','Decline') + '</button></div></section>';
 }
 function feed() {
  const names = camNames();
  const card = s.phase === 'over' ? overCard() : s.phase === 'report' ? reportCard() : s.phase === 'plan' && s.deal === 'pending' ? trumpCard() : '';
  const watch = s.phase === 'watch';
  return '<section class="c-feed br br-accent" data-cam="' + s.cam + '" data-state="live" data-frozen="false" data-mode="' + s.phase + '" aria-label="' + tr('Відеоканал дрона','Drone video feed') + '">' +
   '<div class="feed-slot"></div>' + broadcastOverlay() +
   '<div class="hud hud-score c-score"><span><small>' + (watch ? tr('ПЕРЕГЛЯДИ ХВИЛІ','WAVE VIEWS') : tr('ПЕРЕГЛЯДИ','VIEWS')) + '</small><b data-views>0</b></span><span class="c-combo"><small>' + (watch ? tr('КОМБО','COMBO') : tr('НАЙКР. КОМБО','BEST COMBO')) + '</small><b data-combo>×0</b></span><span class="c-viral" data-viral hidden>' + tr('ВІРУСНО ×2','VIRAL ×2') + '</span></div>' +
   '<div class="feed-lost" role="status"><div class="feed-plate"><b data-plate>' + tr('NO SIGNAL','NO SIGNAL') + '</b><span data-lost></span></div></div>' +
   '<div class="c-committee" role="group" aria-label="' + tr('Погодження з комітетом','Committee approval') + '"><p>' + tr('ПОГОДЖЕННЯ З КОМІТЕТОМ · атака замерзла. Поставте 3 печатки.','COMMITTEE APPROVAL · the attack is frozen. Apply 3 stamps.') + '</p><div>' +
    [0, 1, 2].map(i => { const d = s.live && i < s.live.stamps; return '<button type="button" data-stamp="' + i + '"' + (d ? ' class="done" disabled' : '') + '>' + (d ? tr('ПОГОДЖЕНО','APPROVED') : tr('ПЕЧАТКА','STAMP')) + '</button>' }).join('') + '</div></div>' +
   '<div class="feed-ticker" data-ticker aria-hidden="true"></div><div class="feed-pop" data-pop role="status" aria-live="polite"></div>' +
   '<nav class="feed-cams" aria-label="' + tr('Камери','Cameras') + '">' + names.map((n, i) => '<button type="button" data-cam="' + i + '" data-link="live" data-warn="false" aria-pressed="' + (s.cam === i) + '" aria-keyshortcuts="' + (i + 1) + '"' + (i === 4 ? ' hidden' : '') + '><span class="full">' + camTab()[i] + '</span><span class="short">' + (i === 3 && s.offer.orbital ? tr('СУП','SAT') : camShort()[i]) + '</span><b class="air" data-air></b></button>').join('') + '</nav>' +
   card + '</section>';
 }
 function arcade() {
  const status = wave() + ' · ' + tr('Бюджет','Budget') + ' ' + s.funds + ' · ' + tr('Перегляди','Views') + ' ' + fmtViews(s.views);
  const sp = sponsor(s.offer.cards[s.offer.pick].id), contract = zones()[s.offer.cards[s.offer.pick].marker];
  const copy = { plan: tr('Оберіть спонсора, купіть зграю і тисніть ПУСК. В ефірі перемикайте дрони: нема відео — не було.','Pick a sponsor, buy a flock and hit LAUNCH. On air, switch drones: no video, no happened.'),
   watch: tr('Контракт: ' + contract + ' · ' + sp.name + '. Тримайте відкритим дрон того маркера, куди летить зграя.','Contract: ' + contract + ' · ' + sp.name + '. Keep the drone of the target marker open.'),
   report: tr('Звіт донору готовий. Далі.','The donor report is ready. Next.'),
   over: tr('Спонсори згорнули програму.','The sponsors pulled out.') }[s.phase];
  const acts = s.phase === 'watch' ? button('pause', paused ? tr('Продовжити','Resume') : tr('Пауза','Pause'), false, 'c-act c-ghost') : '';
  return '<section class="arcade"><div class="arcade-status"><span>' + status + '</span></div><div class="arcade-order"><p role="status">' + copy + '</p>' + (acts ? '<div class="c-acts">' + acts + '</div>' : '') + '</div></section>';
 }
 function sponsorCards(interactive) {
  return s.offer.cards.map((c, i) => {
   const sp = sponsor(c.id), chosen = i === s.offer.pick;
   if (!interactive && !chosen) return '';
   const body = '<b>' + sp.name + '</b><span class="c-contract">' + tr('Контракт: ','Contract: ') + zones()[c.marker] + (s.aa[c.marker] ? ' · ' + tr('ППО','AA') : '') + '</span><small>' + sp.rule + '</small><em>«' + sp.quote + '»</em>';
   return interactive ? '<button type="button" class="c-sponsor" data-offer="' + i + '" aria-pressed="' + chosen + '">' + body + '</button>' : '<div class="c-sponsor" aria-current="true">' + body + '</div>';
  }).join('');
 }
 function right() {
  const names = units(), planning = s.phase === 'plan', locked = !planning || s.deal === 'pending';
  const buy = names.map((name, i) => '<div class="c-buy"><i class="c-badge">' + icon(i) + '</i><div class="c-name"><b>' + name + '</b><small>' + tr('У зграї ','In flock ') + '<span class="c-owned">' + s.stock[i] + '</span></small></div>' +
   '<button type="button" class="c-minus" data-action="undo-' + i + '" aria-label="' + tr('Скасувати покупку: ','Undo purchase: ') + name + '"' + (locked || !s.bought[i] ? ' disabled' : '') + '>−</button>' +
   '<button type="button" class="c-plus" data-action="buy-' + i + '" aria-label="' + tr('Купити ','Buy ') + name + ' ' + costs[i] + '"' + (locked || s.funds < costs[i] || s.stock[i] >= CFG.cap ? ' disabled' : '') + '>+1 · ' + costs[i] + '</button><small class="c-hint">' + unitHints()[i] + '</small></div>').join('');
  const cta = { plan: button('attack', tr('ПУСК','LAUNCH') + ' · ' + total(s) + ' →', locked || !total(s), 'c-start'), watch: button('x', tr('В ЕФІРІ…','ON AIR…'), true, 'c-start'),
   report: button('next', tr('Наступна хвиля →','Next wave →'), false, 'c-start'), over: button('fresh', tr('Ще раз →','Play again →'), false, 'c-start') }[s.phase];
  return '<aside class="col c-right" aria-label="' + tr('Арсенал','Arsenal') + '">' + (canPickLevel() ? levelField(s.difficulty) : '') +
   '<section class="panel br"><div class="label">' + (planning ? tr('СПОНСОР · ОБЕРІТЬ ОДНОГО','SPONSOR · PICK ONE') : tr('СПОНСОР','SPONSOR')) + '</div><div class="c-cards">' + sponsorCards(planning && !locked) + '</div></section>' +
   '<section class="panel br"><div class="label">' + tr('ЗГРАЯ','FLOCK') + '</div><div class="c-list">' + buy + '</div></section>' + cta + '</aside>';
 }
 // Footer timeline: the flock as it will fly, one node per wave of the same unit.
 function groups() {
  const names = units(), out = [];
  const flights = s.phase !== 'plan' && s.report?.flights;
  if (flights) { for (const f of flights) { const g = out.at(-1); if (g && g.type === f.type) g.count++; else out.push({ type: f.type, count: 1, at: f.start / 1000 }) } }
  else s.stock.forEach((n, type) => { if (n) out.push({ type, count: n, at: 0 }) });
  return out.map(g => '<div class="node' + (s.phase === 'watch' ? '' : ' done') + '" data-at="' + g.at + '">' + names[g.type] + ' ×' + g.count + '</div>').join('');
 }
 function footer() {
  const planning = s.phase === 'plan', watch = s.phase === 'watch';
  const hints = planning ? '<span>◎ ' + tr('Спонсор → зграя → ПУСК','Sponsor → flock → LAUNCH') + '</span><span>' + tr('1–4 — камери','1–4 — cameras') + '</span>' : watch ? '<span>' + tr('1–4 — камера · ▲N — що летить','1–4 — camera · ▲N — what is flying') + '</span>' : '';
  return '<footer class="strip"><button type="button" class="c-pause" data-action="pause" aria-label="' + (paused ? tr('Продовжити','Resume') : tr('Пауза','Pause')) + '"' + (watch ? '' : ' disabled') + '>' + (paused ? '▶' : 'Ⅱ') + '</button>' +
   '<div class="timeline" aria-label="' + tr('Зграя','Flock') + '">' + groups() + '</div><div class="hints">' + hints + '</div><b class="big c-clock" role="timer">' + mmss(Math.floor(elapsed / 1000)) + '</b></footer>';
 }
 function focusKey() {
  const a = document.activeElement;
  if (!a || !root.contains(a)) return null;
  for (const k of ['data-action', 'data-offer', 'data-language']) if (a.hasAttribute(k)) return '[' + k + '="' + a.getAttribute(k) + '"]';
  return null;
 }
 function render() {
  const scrolls = [...root.querySelectorAll('.col')].map(c => c.scrollTop), key = focusKey(), hadCard = !!root.querySelector('.c-card');
  root.dataset.phase = s.phase;
  s.cam = [0, 1, 2, 3, 4].includes(s.cam) ? s.cam : 0;
  if (s.cam === 4 && !pressActive()) s.cam = 3;
  root.innerHTML = header() + '<div class="c-main">' + left() + '<div class="c-play">' + feed() + arcade() + '</div>' + right() + '</div>' + footer();
  const card = root.querySelector('.c-card');
  if (card) {
    const actions = card.querySelector(':scope > .c-actions, :scope > [data-action="next"]');
    const body = document.createElement('div'); body.className = 'c-card-body';
    const replay = card.querySelector('.wave-replay');
    if (replay && actions) {
      const footer = document.createElement('div'); footer.className = 'c-actions replay-actions';
      replay.classList.add('c-ghost'); footer.append(replay);
      if (actions.matches('.c-actions')) { footer.append(...actions.children); actions.remove() }
      else footer.append(actions);
      body.append(...card.children); card.append(body,footer);
    } else {
      body.append(...[...card.children].filter(el => el !== actions)); card.prepend(body);
    }
  }
  feedLayer.attach(root.querySelector('.feed-slot'));
  root.querySelectorAll('.col').forEach((c, i) => { c.scrollTop = scrolls[i] || 0 });
  if (key) root.querySelector(key + ':not(:disabled)')?.focus({ preventScroll: true });
  else if (!hadCard) (root.querySelector('.c-card [data-action="next"],.c-card [data-action="fresh"]') ?? root.querySelector('.c-card button'))?.focus({ preventScroll: true });
  music.setMood(watching() && !paused ? 'watch' : 'plan');
  if (watching()) paint(); else { jit = 0; refreshFeed(); music.setGlitch(false) }
  if (reduced.matches) feedLayer.drawNoiseOnce();
  if (s.phase === 'over') showCoalitionBoard(root.querySelector('.c-card-body'), { id: s.views > 0 ? s.runId : '', submitted: s.submitted, waves: s.wave, views: s.views, combo: s.bestCombo, assisted: !!s.assisted }, () => { s.submitted = true; save() });
  while (queued.length) pop(...queued.shift());
 }
 function paint() {
  const second = Math.floor(elapsed / 1000), clockEl = root.querySelector('.c-clock');
  if (clockEl && clockEl.dataset.second !== String(second)) {
   clockEl.dataset.second = String(second); clockEl.textContent = mmss(second);
   jit = Math.round((Math.random() - .5) * 10);
   const nodes = [...root.querySelectorAll('.node')], next = nodes.findIndex(n => Number(n.dataset.at) * 1000 > elapsed);
   nodes.forEach((node, i) => { node.classList.toggle('done', next === -1 || i < next - 0); node.classList.toggle('now', i === (next === -1 ? -1 : next)) });
  }
  refreshFeed();
 }
 function settle() {
  cancelAnimationFrame(frame);
  finishWave(s, s.captures, { pressMs: s.live.pressMs });
  elapsed = previous = 0; save(); render();
 }
 function watchRate() { return autoOn ? Math.min(.6, coach.rate()) : 1 }
 function tick(now) {
  if (s.phase !== 'watch' || paused) return;
  if (document.querySelector('.faction-picker:modal')) { previous=now; frame=requestAnimationFrame(tick); return }
  const dt = previous ? Math.min(100, now - previous) : 0; previous = now;
  const r = s.report, c = r.committee;
  if (!frozen()) {
   elapsed += dt * watchRate();
   if (c && s.live.stamps < 3 && elapsed >= c.at) elapsed = c.at;
   if (s.cam === 4 && pressActive()) s.live.pressMs += dt * watchRate();
  }
  if (r.partnerPass && !s.live.partnerNotified && elapsed >= r.partnerPass.from && elapsed <= r.partnerPass.to) {
    ticker(tr('Супутник від партнерів · запис','Partner satellite · recording'),'ok'); s.live.partnerNotified = true;
  }
  resolveImpacts();
  if (elapsed >= r.duration && !frozen()) { settle(); return }
  paint(); frame = requestAnimationFrame(tick);
 }
 function attack() {
  if (!launch(s)) return false;
  paused = false; previous = elapsed = 0; jit = 0;
  if (s.report.rebate) queued.push([rebateText(s.report.rebate), 'decree', tr('Відкат','Kickback')]);
  if (s.report.musk) queued.push([cameo.musk().title, 'none', cameo.musk().line]);
  frame = requestAnimationFrame(tick);
  return true;
 }
 /* ---------- autoplay: shared plan bot plus a human-paced camera director ---------- */
 function refreshAuto() {
  const b = root.querySelector('.c-auto'); if (!b) return;
  const [full, short] = autoText();
  b.classList.toggle('on', autoOn); setAttr(b, 'aria-pressed', String(autoOn)); b.disabled = s.phase === 'over';
  setText(b.querySelector('.full'), full); setText(b.querySelector('.short'), short);
 }
 function toggleAuto() {
  if (s.phase === 'over') return;
  autoOn = !autoOn; auto.stage = '';
  if (autoOn) s.assisted = true;
  save(); refreshAuto();
 }
 function autoStep(now) {
  if (!autoOn || document.hidden || coach.slowing) return;
  if (s.phase === 'over') { autoOn = false; refreshAuto(); return }
  if (s.phase === 'watch' && paused) return;
  if (s.phase === 'report') return;
  if (auto.stage !== s.phase) { Object.assign(auto, { stage: s.phase, t: now + (s.phase === 'plan' ? 1800 : 0), queue: null, launch: false, stampAt: 0, holdUntil: 0 }) }
  if (s.phase === 'plan') {
   if (now < auto.t) return;
   if (auto.launch) { if (attack()) { save(); render(); coach.explain(()=>tr('Запускаю ефір: склад хвилі зібрано, тепер обиратиму камеру.','Starting the broadcast. The lineup is ready, so I can switch to directing.')) } auto.t = now + 500; return }
   auto.queue ??= planMoves(s, Math.random);
   const m = auto.queue.shift();
   if (!m) { auto.launch = true; auto.t = now + 2600; return }
   const done=applyMove(s, m); save(); render();
   if(done) coach.explain(()=>{
    if(m.do==='pick')return tr('Обираю контракт «','Choosing “')+sponsor(s.offer.cards[m.i].id).name+tr('»: бот порівняв умови двох карток.','”: its terms scored higher for this broadcast.');
    if(m.do==='buy')return tr('Додаю до хвилі: ','Adding to the lineup: ')+units()[m.id]+tr('. Ціна — ','. Cost: ')+costs[m.id]+tr('. Після покупки лишилось ','. Budget left: ')+s.funds+'.';
    return m.do==='deal'?tr('Приймаю угоду: бюджет малий, тому беру виплату за паузу.','Taking the deal: cash is low, so I accept a paid break.'):tr('Відмовляюся від угоди: бюджету вистачає на наступний ефір.','Declining the deal: there is enough money to keep broadcasting.');
   });
   if (m.do === 'deal' || m.do === 'nodeal') { auto.queue = null; auto.t = now + 800 } else { auto.t = now + (m.do === 'buy' ? 1150 : 2000); if (!auto.queue.length) { auto.launch = true; auto.t = now + 2600 } }
  } else if (s.phase === 'watch' && s.report) {
   if (frozen()) { if (now >= auto.stampAt) { const b = root.querySelector('[data-stamp]:not(.done)'); if (b) { b.click(); coach.explain(()=>tr('Ставлю печатку. Після третьої ефір продовжиться.','Stamping the form. Three stamps let the broadcast continue.')); auto.stampAt = now + 350 } } return }
   if (now < auto.t || (now < auto.holdUntil && linkState(s.cam)==='live')) return;
   const loss = s.report.cameraLoss;
   if(loss?.camera === s.cam && elapsed >= loss.at-1100 && elapsed < loss.at+700) return;
   auto.t = now + 500;
   const tabs = Array.from(root.querySelectorAll('.feed-cams button:not([hidden])'), button => ({
    id: Number(button.dataset.cam), link: button.dataset.link,
    warn: button.dataset.warn === 'true', air: Number(button.querySelector('[data-air]').textContent.slice(1))
   }));
   const next = chooseCamera(tabs, s.cam, now < auto.holdUntil);
   if (next !== s.cam) {
    setCam(next);
    coach.explain(()=>next===4?tr('Відкриваю пресконференцію, щоб зібрати перегляди.','Switching to the press feed to collect views.'):next===3?tr('Обираю загальний план: зараз немає кращого сигналу з подією.','Taking the wide shot while the drone feeds are quiet.'):tr('Перемикаюся на камеру ','Switching to camera ')+(next+1)+tr(': її індикатор показав рух у кадрі.',' because its tab shows activity.'));
    auto.holdUntil = now + 2400;
   }
  }
 }
 function pause() { if (s.phase === 'watch' && !paused) { paused = true; cancelAnimationFrame(frame); previous = 0; save(); render() } }
 document.addEventListener('visibilitychange', () => { if (document.hidden) pause() });
 window.addEventListener('blur', pause);
 document.addEventListener('keydown', e => {
  if (player.open || e.ctrlKey || e.metaKey || e.altKey || !/^[1-5]$/.test(e.key) || !root.isConnected) return;
  if (e.target.closest?.('select,input,textarea,[contenteditable]')) return;
  setCam(Number(e.key) - 1);
 });
 async function share() {
  sharing = tr('Малюємо картку…', 'Drawing the card…'); setText(root.querySelector('.c-share-status'), sharing);
  try {
   const far = s.cam >= 3, result = await shareRun(s, { image: stage ? stage.snapshot() : null, label: camRec()[s.cam], thermal: far, assisted: !!s.assisted });
   sharing = result === 'downloaded' ? tr('Картку збережено як PNG','Card saved as PNG') : result === 'shared' ? tr('Готово','Done') : '';
  } catch { sharing = tr('Не вдалося намалювати картку','Could not draw the card') }
  setText(root.querySelector('.c-share-status'), sharing);
 }
 root.onchange = e => {
  if (!e.target.matches('[data-level-pick]')) return;
  const level = e.target.value;
  rememberLevel(level);
  if (canPickLevel()) { s.difficulty = level; s.funds = openingBudget[level]; save(); render() }
 };
 root.onclick = e => {
  const thumb = e.target.closest('[data-film]'); if (thumb) { openFilm(thumb); return }
  const cam = e.target.closest('button[data-cam]');
  if (cam) { setCam(Number(cam.dataset.cam)); return }
  const stamp = e.target.closest('[data-stamp]');
  if (stamp) {
   if (s.phase !== 'watch' || !frozen()) return;
   s.live.stamps++; stamp.classList.add('done'); stamp.disabled = true; stamp.textContent = tr('ПОГОДЖЕНО','APPROVED');
   if (s.live.stamps >= 3) { pop(tr('ПОГОДЖЕНО','APPROVED'), 'ok', tr('комітет дозволив продовжити','the committee allows it to continue')); refreshFeed() }
   save(); return;
  }
  if (e.target.closest('[data-language]')) { document.querySelector('.lang').click(); return }
  const offer = e.target.closest('[data-offer]');
  if (offer) { pickedWave=s.wave; pickSponsor(s, Number(offer.dataset.offer)); save(); render(); return }
  const el = e.target.closest('[data-action]'); if (!el) return;
  const [action, key] = el.dataset.action.split('-'), id = Number(key);
  if (action === 'sides') { save(); changeSide(); return }
  if (action === 'quiet') { const muted = music.toggle(); el.setAttribute('aria-pressed', String(muted)); return }
  if (action === 'share') { share(); return }
  if (action === 'auto') { toggleAuto(); return }
  if (action === 'attack') attack();
  if (action === 'pause') { if (!paused) { pause(); return } paused = false; previous = 0; frame = requestAnimationFrame(tick) }
  if (action === 'next') nextWave(s);
  if (action === 'deal') acceptDeal(s);
  if (action === 'nodeal') declineDeal(s);
  if (action === 'fresh' && s.phase === 'over') { pickedWave=0; const c = s.cam; s = newSeason(Math.random, preferredLevel()); s.cam = c; elapsed = 0; sharing = ''; waveKey = ''; feedLayer.reset() }
  if (action === 'buy') purchase(s, id, 1);
  if (action === 'undo') purchase(s, id, -1);
  save(); render();
 };
 /* ---------- the 3D loop: one rAF for the whole coalition, paused while the tab is hidden ---------- */
 function view(now) {
  requestAnimationFrame(view);
  if (document.hidden || document.querySelector('.faction-picker:modal')) { prevView = 0; return }
  const dt = prevView ? Math.min(.1, (now - prevView) / 1000) : 0; prevView = now;
  if (player.open) { player.tick(dt); return }
  if(finale){
   if(!coach.enabled || autoOn || !['report','over'].includes(s.phase)){endFinale(false)}
   else {stage.renderLesson(dt);finale-=dt;if(finale<=0)endFinale(true);return}
  }
  const filmFirst = !!pendingFrame && !!stage;
  if (!filmFirst && now >= holdShotUntil) autoStep(now);
  if (!stage) return;
  const key = s.wave + ':' + cameraSubjects(s).join() + ':' + (s.aa || []).map(Number).join('');
  if (key !== waveKey) { waveKey = key; stage.resetWave(); stage.setBroadcast(cameraSubjects(s), s.aa) }
  const cam = s.cam === 4 ? 3 : s.cam, state = linkState(s.cam), quality = linkQuality(s.cam);
  const live = watching(), report = s.phase === 'watch' || s.phase === 'report' ? s.report : null;
  const orbital = !!s.offer.orbital && s.cam === 3;
  stage.step({ orbital, dt: live && paused ? 0 : dt * watchRate(), real: (now - realStart) / 1000, elapsed: s.phase === 'watch' ? elapsed : (report?.duration ?? 0), report, cam });
  feedLayer.pre({ orbital, now, cam, state, quality });
  if ((!feedLayer.frozen || filmFirst || now < holdShotUntil) && state === 'live') { stage.render(); drawnCam=cam; if (filmFirst) recordDroneFrame(s.cam) }
  else if (state === 'press') stage.render();
  if (filmFirst) { pendingFrame = null; if(now >= holdShotUntil) autoStep(now) }
  feedLayer.post({ orbital, now, dt, cam, state, quality, watching: !!live, paused, stage, gl: stage.glCanvas, show: true,
   contract: s.offer ? s.offer.cards[s.offer.pick].marker : -1, names: camRec(), zones: zones() });
  if (!firstFrame) { firstFrame = true; window.dispatchEvent(new Event('game-ready')) }
 }
 document.addEventListener('siege-language', render); save(); render();
 try {
  stage = createStage(feedLayer.host);
  stage.setMaxPixelRatio(matchMedia('(pointer:coarse)').matches || innerWidth <= 900 ? 1.25 : 1.6);
 } catch (error) {
  console.error('Coalition 3D view failed', error); stage = null;
  window.dispatchEvent(new Event('game-ready'));
 }
 watchRelease(() => {
  autoOn = false;
  pause();
  if (!save()) { refreshAuto(); return false }
  location.reload();
  return true;
 }, () => true);
 requestAnimationFrame(view);
}
