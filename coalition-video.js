// The analogue FPV look: a persistent layer (3D host, snow, scanlines, goggle mask) plus the Betaflight-style OSD
// and the random interference of a weak video link. coalition.js re-renders its HTML, so the layer is created once
// and re-attached into every new feed (`attach`), which keeps the WebGL canvas alive.
import {tr} from './language.js';

const THERMAL = 'grayscale(1) contrast(1.7) brightness(1.15) blur(.4px)';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
function seeded(seed) { // mulberry32
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 };
}
const mmss = sec => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text };

const MARKUP = `
<div class="feed-stage" data-stage></div>
<canvas class="feed-noise" width="320" height="180" aria-hidden="true"></canvas>
<div class="feed-scan" aria-hidden="true"></div>
<div class="feed-bar" aria-hidden="true"></div>
<div class="feed-frame" aria-hidden="true"></div>
<div class="osd" aria-hidden="true">
 <div class="osd-horizon" data-horizon><i></i><i></i></div>
 <div class="osd-ladder" data-ladder><b data-rung="-10"></b><b data-rung="10"></b></div>
 <i class="osd-cross"></i><i class="osd-corner tl"></i><i class="osd-corner tr"></i><i class="osd-corner bl"></i><i class="osd-corner br"></i>
 <div class="osd-tl"><div><i class="rec-dot"></i><span data-rec></span></div><small data-sub></small></div>
 <div class="osd-tr"><span class="sig"><i></i><i></i><i></i><i></i><i></i></span><span data-lq></span></div>
 <div class="osd-ml" data-drone><small>ALT</small><b data-alt></b></div>
 <div class="osd-mr" data-drone><small>SPD</small><b data-spd></b></div>
 <div class="osd-bat" data-drone><div><span data-volt></span><span class="bat"><i></i><i></i><i></i><i></i><i></i></span><span data-pct></span></div><small data-mah></small><b class="osd-warn" data-warn></b></div>
 <div class="osd-far" data-far><b data-far-title></b><small data-far-time></small></div>
 <div class="osd-locks"></div>
</div>`;

export function createFeed() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const el = document.createElement('div'); el.className = 'feed-layer'; el.innerHTML = MARKUP;
  const q = s => el.querySelector(s);
  const stage = q('[data-stage]'), noise = q('.feed-noise'), bar = q('.feed-bar'), osd = q('.osd');
  const horizon = q('[data-horizon]'), ladder = q('[data-ladder]');
  const sigBars = [...el.querySelectorAll('.sig i')], batSegs = [...el.querySelectorAll('.bat i')];
  const tear = document.createElement('canvas'); tear.className = 'feed-tear'; tear.setAttribute('aria-hidden', 'true'); tear.hidden = true; stage.append(tear);
  const tearCtx = tear.getContext('2d');
  const locks = [0, 1, 2].map(i => {
    const d = document.createElement('div'); d.className = 'osd-lock'; d.hidden = true;
    d.innerHTML = '<span class="osd-lock-tag"><b data-t></b><em data-c></em></span><span class="osd-lock-d" data-d></span>';
    q('.osd-locks').append(d); return d;
  });
  const dias = Array.from({ length: 12 }, () => { const d = document.createElement('i'); d.className = 'osd-dia'; d.hidden = true; q('.osd-locks').append(d); return d });

  // interference scheduler, one seeded stream per drone
  const rng = [1, 2, 3].map(n => seeded(n * 7919 + 13));
  const nextAt = [0, 1, 2].map(() => 0), current = [null, null, null];
  const batt = [100, 100, 100];
  let burstUntil = 0, lastNow = 0, startedAt = 0, noiseAt = 0, lastCam = -1, frozen = false;
  const size = { w: 0, h: 0 };
  new ResizeObserver(() => { size.w = el.clientWidth; size.h = el.clientHeight }).observe(el);

  function drawNoise() {
    const ctx = noise.getContext('2d'), img = drawNoise.img ??= new ImageData(320, 180), px = drawNoise.px ??= new Uint32Array(img.data.buffer);
    for (let i = 0; i < px.length; i++) { const v = Math.random() * 256 | 0; px[i] = 0xff000000 | v << 16 | v << 8 | v }
    ctx.putImageData(img, 0, 0);
    for (let n = 1 + Math.floor(Math.random() * 3); n > 0; n--) { ctx.fillStyle = 'rgba(255,255,255,' + (.04 + Math.random() * .06).toFixed(3) + ')'; ctx.fillRect(0, Math.random() * 176, 320, 2 + Math.random() * 4) }
  }
  drawNoise();

  function pick(r, bad) { // weights: more tearing and snow when the link is bad
    const w = [['snow', 1.2 + bad], ['tear', 1.3 + 2.5 * bad], ['roll', .9], ['bleed', 1], ['freeze', .8], ['pump', 1]];
    let total = w.reduce((a, [, k]) => a + k, 0), x = r() * total;
    for (const [type, k] of w) { if ((x -= k) < 0) return type }
    return 'snow';
  }
  function schedule(cam, now, quality) {
    const r = rng[cam], bad = clamp((90 - quality) / 70, 0, 1);
    if (current[cam] && now < current[cam].until) return current[cam];
    current[cam] = null;
    if (!nextAt[cam]) nextAt[cam] = now + 1500 + r() * 4500;
    if (now < nextAt[cam]) return null;
    const type = pick(r, bad), dur = (80 + r() * 520) * (1 + .6 * bad), e = { type, from: now, until: now + dur, dur, amp: .4 + r() * .4 + .2 * bad, hue: (r() < .5 ? -1 : 1) * (12 + r() * 12), seed: r() * 100, off: .25 + r() * .35 };
    nextAt[cam] = e.until + (1500 + r() * 4500) * (1 - .82 * bad);
    current[cam] = e;
    return e;
  }

  function sizeTear(gl) {
    const w = Math.min(960, gl.width), h = Math.max(1, Math.round(gl.height * w / Math.max(1, gl.width)));
    if (tear.width !== w || tear.height !== h) { tear.width = w; tear.height = h }
  }
  function drawTear(gl, e, now) {
    sizeTear(gl); const W = tear.width, H = tear.height, g = tearCtx;
    try {
      if (e.type === 'tear') {
        g.drawImage(gl, 0, 0, W, H);
        const bands = 3 + Math.floor(((e.seed + Math.floor(now / 70)) * 7.13) % 6), step = Math.floor(now / 70);
        for (let b = 0; b < bands; b++) {
          const rr = seeded(step * 31 + b * 17 + Math.floor(e.seed * 100));
          const y = rr() * H, h = H * (.02 + rr() * .1), dx = (rr() - .5) * W * (.05 + .16 * e.amp);
          g.drawImage(gl, 0, y * gl.height / H, gl.width, h * gl.height / H, dx, y, W, h);
          g.fillStyle = rr() < .5 ? 'rgba(255,255,255,' + (.1 + rr() * .2) + ')' : 'rgba(0,0,0,' + (.2 + rr() * .3) + ')'; g.fillRect(0, y + h * rr(), W, 1 + rr() * 2);
        }
      } else { // roll: the picture jumps and slides back, black sync bar at the seam
        const k = clamp((now - e.from) / e.dur, 0, 1), off = Math.round(H * e.off * (1 - k) ** 2 * (Math.floor(k * 6) % 2 ? 1 : .92)) % H;
        g.drawImage(gl, 0, off, W, H); g.drawImage(gl, 0, off - H, W, H);
        g.fillStyle = '#000'; g.fillRect(0, off - H * .025, W, H * .05);
      }
    } catch { return false }
    return true;
  }

  const FAR_NAME = () => 'CAM-F · ZOOM ×12 · WHITE-HOT', FAR_SHORT = 'CAM-F · ×12';
  return {
    el,
    // the 3D host the renderer lives in
    host: stage,
    // put the persistent layer into a freshly rendered feed, replacing its placeholder
    attach(slot) { if (slot) slot.replaceWith(el) },
    // true while the picture is held (freeze interference): coalition.js skips the 3D render
    get frozen() { return frozen },
    cut(now) { burstUntil = now + 120 },
    drawNoiseOnce: drawNoise,
    // Called every frame, before the 3D render. c: {now, cam, state, quality, watching, paused, stage}
    pre(c) {
      const now = c.now, cam = c.cam, drone = cam < 3, dt = lastNow ? Math.min(.1, (now - lastNow) / 1000) : 0; lastNow = now;
      if (!startedAt) startedAt = now;
      if (cam !== lastCam) { if (lastCam !== -1) burstUntil = now + 120; lastCam = cam }
      const dead = c.state === 'jam' || c.state === 'dark';
      const e = drone && !dead && !reduced.matches ? schedule(cam, now, c.quality) : null;
      if (!e) { for (let i = 0; i < 3; i++) if (current[i] && now >= current[i].until) current[i] = null }
      const bad = drone ? clamp((90 - c.quality) / 70, 0, 1) : 0;
      frozen = !!e && e.type === 'freeze';
      // snow
      let snow = drone ? .08 : .15;
      if (dead) snow = .9;
      else {
        snow += bad * .42;
        if (e?.type === 'snow') snow = Math.max(snow, e.amp * (.6 + .4 * Math.sin((now - e.from) / 25)));
        if (now < burstUntil && !c.orbital) snow = .85;
        if (c.orbital) snow = .055;
        if (e?.type === 'freeze') snow = Math.max(snow, .14);
      }
      noise.style.opacity = snow.toFixed(3);
      if (!reduced.matches && now - noiseAt > 50) { noiseAt = now; drawNoise() }
      // colour and brightness
      let filter = c.orbital ? 'grayscale(1) contrast(1.45) brightness(1.12)' : drone ? '' : THERMAL;
      if (e?.type === 'bleed') filter += ' saturate(2) hue-rotate(' + e.hue.toFixed(0) + 'deg) contrast(1.3)';
      let band = -1;
      if (e?.type === 'pump') {
        filter += ' brightness(' + (1 + .35 * Math.sin((now - e.from) / 38 + e.seed)).toFixed(2) + ')';
        band = clamp((now - e.from) / e.dur, 0, 1) * 130 - 15;
      }
      if (stage.style.filter !== filter.trim()) stage.style.filter = filter.trim();
      bar.style.transform = band >= 0 ? 'translateY(' + band.toFixed(1) + '%)' : '';
      bar.style.opacity = band >= 0 ? '1' : '0';
      stage.style.transform = e?.type === 'tear' ? 'translateX(' + ((Math.sin(now / 17 + e.seed) * 4 * e.amp) | 0) + 'px)' : '';
      this.event = e;
      return e;
    },
    // After the 3D render of this frame: tearing and rolling copy the fresh canvas into the overlay.
    post(c) {
      const e = this.event, gl = c.gl;
      if (e && (e.type === 'tear' || e.type === 'roll') && gl && !frozen) { tear.hidden = !drawTear(gl, e, c.now) }
      else if (!tear.hidden) tear.hidden = true;
      if (!c.show) return;
      this.osd(c);
    },
    // Betaflight-style on-screen display
    osd(c) {
      const { cam, state, quality, now, stage: st } = c, drone = cam < 3, far = !drone, dead = state === 'jam' || state === 'dark';
      const tel = st?.telemetry?.(), dt = c.dt;
      osd.dataset.mode = far ? 'far' : 'drone';
      const blink = reduced.matches || Math.floor(now / 380) % 2 === 0;
      // battery: cosmetic, drains while on air, recharges between waves
      if (c.watching && !c.paused) { for (let i = 0; i < 3; i++) batt[i] = Math.max(0, batt[i] - dt * (i === cam ? 2.4 : .6)) }
      else if (!c.watching) { for (let i = 0; i < 3; i++) batt[i] = Math.min(100, batt[i] + dt * 25) }
      const pct = drone ? Math.round(batt[cam]) : 100;
      // header lines
      setText(q('[data-rec]'), c.orbital ? c.names[3] : far ? FAR_SHORT : c.names[cam]);
      const flight = mmss((now - startedAt) / 1000);
      const sats = dead ? 2 : Math.round(clamp(6 + quality * .07 + Math.sin(now / 5000 + cam) * 1.2, 3, 13));
      setText(q('[data-sub]'), c.orbital ? 'MONO · ORBIT' : far ? 'WHITE-HOT' : 'T ' + flight + ' · SAT ' + sats);
      setText(q('[data-lq]'), (far ? 'LINK ' : 'LQ ') + Math.round(quality));
      sigBars.forEach((b, i) => b.classList.toggle('on', quality > i * 20 + 8));
      osd.classList.toggle('dead', dead);
      if (dead) { locks.forEach(l => { l.hidden = true }); dias.forEach(d => { d.hidden = true }); return }
      // altitude, speed, battery
      if (tel) {
        setText(q('[data-alt]'), far ? '' : Math.round(tel.pos.y) + ' M');
        const spd = Math.max(0, tel.vel.length() * 3.6 + 2.2 + 1.4 * Math.sin(now / 410) + 0.9 * Math.sin(now / 130 + cam));
        setText(q('[data-spd]'), far ? '' : Math.round(spd) + ' KM/H');
        const volt = 13.2 + 3.6 * pct / 100 - (c.watching ? .12 : 0) + Math.sin(now / 900) * .03;
        setText(q('[data-volt]'), volt.toFixed(1) + 'V');
        setText(q('[data-pct]'), pct + '%');
        setText(q('[data-mah]'), Math.round((100 - pct) * 15) + ' MAH');
        batSegs.forEach((b, i) => b.classList.toggle('on', pct > i * 20));
        const w = pct < 8 ? tr('ПРИЗЕМЛЯЙСЯ', 'LAND NOW') : pct < 20 ? tr('НИЗЬКИЙ ЗАРЯД', 'LOW BAT') : '';
        const warn = q('[data-warn]'); setText(warn, w); warn.style.visibility = w && !blink ? 'hidden' : '';
        q('.osd-bat').dataset.low = w ? '1' : '0';
        // artificial horizon follows the drone roll; the ladder follows pitch
        const pxPerDeg = (size.h || 400) / Math.max(8, tel.fov);
        if (drone) {
          horizon.style.transform = 'translateY(' + (tel.pitch * pxPerDeg).toFixed(1) + 'px) rotate(' + tel.roll.toFixed(2) + 'deg)';
          ladder.style.transform = 'translateY(' + (tel.pitch * pxPerDeg).toFixed(1) + 'px) rotate(' + tel.roll.toFixed(2) + 'deg)';
          ladder.querySelectorAll('[data-rung]').forEach(b => { const d = Number(b.dataset.rung); b.style.top = 'calc(50% + ' + (-d * pxPerDeg).toFixed(1) + 'px)'; if (!b.textContent) b.textContent = String(Math.abs(d)) });
        }
        setText(q('[data-far-title]'), c.orbital ? tr('ОРБІТАЛЬНИЙ ПРОЛІТ','ORBITAL PASS') : FAR_NAME());
        setText(q('[data-far-time]'), new Date().toLocaleTimeString('en-GB') + ' · ' + tel.fov.toFixed(0) + '° FOV');
      }
      // lock boxes and incoming diamonds
      const shown = c.orbital ? [] : far ? [0, 1, 2] : [cam];
      locks.forEach((l, i) => {
        const p = shown.includes(i) ? st.project(i) : null;
        l.hidden = !p;
        if (!p) return;
        const half = far ? clamp(p.half, 11, 36) : clamp(p.half, 22, 120);
        l.style.width = l.style.height = (half * 2).toFixed(0) + 'px';
        l.style.transform = 'translate(' + (p.x - half).toFixed(1) + 'px,' + (p.y - half).toFixed(1) + 'px)';
        const hot = c.contract === i;
        l.classList.toggle('hot', hot);
        setText(l.querySelector('[data-t]'), far ? c.zones[i].toUpperCase() : tr('ЦІЛЬ · ', 'TARGET · ') + c.zones[i].toUpperCase());
        setText(l.querySelector('[data-c]'), hot ? tr('КОНТРАКТ', 'CONTRACT') : '');
        setText(l.querySelector('[data-d]'), far ? '' : 'D ' + Math.round(p.dist) + ' M');
      });
      const inc = st && !c.orbital ? st.incoming() : [];
      dias.forEach((d, i) => {
        const a = inc[i]; d.hidden = !a;
        if (a) d.style.transform = 'translate(' + (a.x - 8).toFixed(1) + 'px,' + (a.y - 8).toFixed(1) + 'px) rotate(45deg)';
        if (a) d.classList.toggle('hot', a.marker === c.contract);
      });
    },
    // reduced-motion and language changes only need a fresh static grain
    reset() { burstUntil = 0; current.fill(null); nextAt.fill(0); frozen = false },
    battery: () => batt
  };
}
