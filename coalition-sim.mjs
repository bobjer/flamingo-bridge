// Balance bot for coalition arcade v2. Plays the real rules from coalition-rules.js.
// Usage: node coalition-sim.mjs [runs]
import {openingBudget, CFG, newSeason, launch, finishWave, nextWave} from './coalition-rules.js';
import {planMoves, applyMove} from './coalition-bot.js';

// small seeded PRNG so a table is reproducible
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

function bot(s, q, random) {
  for (const m of planMoves(s, random, q)) applyMove(s, m);
  if (!launch(s, random)) return false;
  const r = s.report, captures = [];
  r.flights.forEach((f, i) => {
    if (!f.success || f.decree) return;
    const jam = r.ew && r.ew.marker === f.marker && f.impact >= r.ew.at && f.impact < r.ew.at + r.ew.dur;
    const dark = r.musk && f.impact >= r.musk.from && f.impact < r.musk.from + r.musk.dur;
    const blocked = jam || dark || (r.cameraLoss?.camera === f.marker && f.impact >= r.cameraLoss.at);
    // skill q means: right camera at the right time. Blocked drones can only be answered with the far camera.
    captures[i] = random() < q ? (blocked ? 'far' : 'drone') : random() < .5 ? 'far' : 'none';
  });
  finishWave(s, captures, {}, random);
  return true;
}

export function play(q, random, difficulty = 'normal') {
  const s = newSeason(random, difficulty);
  while (s.phase !== 'over' && s.wave < 200) {
    if (s.deal === 'pending') { for (const m of planMoves(s, random)) applyMove(s, m); continue }
    if (s.phase === 'plan') bot(s, q, random);
    if (s.phase === 'report') nextWave(s, random);
  }
  return { waves: s.wave, views: s.views, combo: s.bestCombo };
}

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1e3) + 'K';
if (process.argv[1].endsWith('coalition-sim.mjs')) {
  const runs = Number(process.argv[2]) || 2000;
  console.log('| difficulty | q | waves p10 / median / p90 | median views | median best combo |');
  console.log('|---|---|---|---|---|');
  for (const difficulty of Object.keys(openingBudget)) for (const q of [.3, .5, .7, .9]) {
    const res = Array.from({ length: runs }, (_, i) => play(q, rng(20260101 + i), difficulty));
    const w = res.map(r => r.waves).sort((a, b) => a - b), v = res.map(r => r.views).sort((a, b) => a - b), c = res.map(r => r.combo).sort((a, b) => a - b);
    console.log('| ' + difficulty + ' | ' + q + ' | ' + pct(w, .1) + ' / ' + pct(w, .5) + ' / ' + pct(w, .9) + ' | ' + fmt(pct(v, .5)) + ' | ' + pct(c, .5) + ' |');
  }
  console.log('CFG', JSON.stringify({ stipend: CFG.stipend, hitContract: CFG.hitContract, hitOther: CFG.hitOther, far: CFG.far, fatigue: CFG.fatigue, aa: [CFG.aaBase, CFG.aaStep, CFG.aaMax], success: CFG.success }));
}
