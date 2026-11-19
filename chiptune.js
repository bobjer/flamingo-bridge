// Original 8-bit oompah polka in 2/4, synthesised with Web Audio (no audio files).
// Square lead, triangle bass, noise snare. Two moods: "plan" (lazy) and "watch" (about twice as fast, syncopated).
// Nothing plays until the first user gesture. During NO SIGNAL the tape "chews": pitch drops and wobbles.
const key = 'pop-music-muted';
const store = {
 get() { try { return localStorage.getItem(key) === '1' } catch { return false } },
 set(v) { try { localStorage.setItem(key, v ? '1' : '0') } catch {} }
};
// Lead: one entry per eighth note. 0 = rest, -1 = hold the previous note. Two 8-bar parts (A then B).
const lead = [
 76,79,76,72, 76,-1,79,-1, 74,77,74,71, 72,-1,0,67,  77,81,77,74, 76,79,76,72, 74,71,74,77, 72,-1,-1,0,
 81,79,81,84, 74,77,81,77, 79,74,79,83, 84,-1,79,72, 81,76,81,84, 81,77,72,77, 79,77,76,74, 72,67,72,0
];
// Bass roots per bar (low, then the alternate fifth). Same chords for both parts' bars.
const C = [48, 43], G = [43, 50], F = [41, 48], Am = [45, 40], Dm = [50, 45];
const chords = [C,C,G,C,F,C,G,C, Am,Dm,G,C,Am,F,G,C];
const bpm = { plan: 92, watch: 184 };
const hz = m => 440 * 2 ** ((m - 69) / 12);

export function createMusic() {
 let ctx, master, tape, lfo, lfoGain, noise, timer, nextTime = 0, step = 0, mood = 'plan', glitch = false, muted = store.get(), armed = false;
 const listeners = new Set();

 function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = muted ? 0 : .16; master.connect(ctx.destination);
  // one shared detune source: every oscillator listens to it, so the whole tune can sag at once
  tape = ctx.createConstantSource(); tape.offset.value = 0; tape.start();
  lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; lfoGain = ctx.createGain(); lfoGain.gain.value = 0;
  lfo.connect(lfoGain); lfoGain.connect(tape.offset); lfo.start();
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buffer;
 }
 function tone(type, midi, when, length, volume) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type; osc.frequency.value = hz(midi); tape.connect(osc.detune);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(volume, when + .006);
  gain.gain.setValueAtTime(volume * .8, when + Math.max(.01, length - .04));
  gain.gain.linearRampToValueAtTime(0, when + length);
  osc.connect(gain); gain.connect(master); osc.start(when); osc.stop(when + length + .02);
 }
 function hit(when, length, volume, highpass) {
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = noise; filter.type = 'highpass'; filter.frequency.value = highpass;
  gain.gain.setValueAtTime(volume, when); gain.gain.exponentialRampToValueAtTime(.001, when + length);
  src.connect(filter); filter.connect(gain); gain.connect(master); src.start(when); src.stop(when + length + .02);
 }
 // One sixteenth note. Bars are 8 sixteenths long (2/4).
 function play(index, when, sixteenth) {
  const bar = Math.floor(index / 8) % 16, at = index % 8, chord = chords[bar], fast = mood === 'watch';
  if (at % 2 === 0) {
   const i = (bar * 4 + at / 2) % lead.length, note = lead[i];
   if (note > 0) {
    let eighths = 1; while (lead[(i + eighths) % lead.length] === -1 && eighths < 4) eighths++;
    tone('square', note, when, eighths * 2 * sixteenth * .94, .5);
   }
  }
  if (!fast) { // oompah: bass on the beat, snare on the off-beat
   if (at === 0) tone('triangle', chord[0], when, sixteenth * 3, .9);
   if (at === 4) { tone('triangle', chord[1], when, sixteenth * 3, .9); hit(when, .09, .34, 1800) }
   if (at === 2 || at === 6) hit(when, .025, .08, 7000);
  } else { // 3+3+2 syncopation with a nervous ghost snare
   if (at === 0 || at === 3 || at === 6) tone('triangle', chord[at === 3 ? 1 : 0], when, sixteenth * 2.5, .9);
   if (at === 4) hit(when, .08, .34, 1800);
   if (at === 7) hit(when, .03, .12, 3000);
   if (at === 2 || at === 5) hit(when, .02, .07, 8000);
  }
 }
 function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const scale = glitch ? 1.28 : 1; // the tape drags
  while (nextTime < ctx.currentTime + .15) {
   const sixteenth = 60 / bpm[mood] / 4 * scale;
   if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + .02;
   play(step, nextTime, sixteenth);
   nextTime += sixteenth; step++;
  }
 }
 function start() {
  if (!ctx) build();
  if (timer) return;
  nextTime = ctx.currentTime + .05;
  timer = setInterval(schedule, 25);
  ctx.resume().then(schedule).catch(() => {});
 }
 function sync() {
  if (!ctx) return;
  master.gain.setTargetAtTime(muted ? 0 : .16, ctx.currentTime, .03);
  if (document.hidden || muted) { ctx.suspend().catch(() => {}) } else if (armed) { ctx.resume().catch(() => {}) }
  listeners.forEach(fn => fn(muted));
 }
 document.addEventListener('visibilitychange', sync);

 return {
  // Call once; audio starts on the first pointer or key press (autoplay policy).
  arm() {
   if (armed) return;
   const go = () => { armed = true; removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); if (!muted && !document.hidden) start() };
   addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
  },
  setMood(next) { if (next in bpm) mood = next },
  setGlitch(on) {
   if (on === glitch) return; glitch = on;
   if (!ctx) return;
   const t = ctx.currentTime;
   tape.offset.cancelScheduledValues(t); lfoGain.gain.cancelScheduledValues(t);
   tape.offset.setTargetAtTime(on ? -600 : 0, t, on ? .15 : .25);
   lfoGain.gain.setTargetAtTime(on ? 90 : 0, t, .2);
  },
  toggle() {
   muted = !muted; store.set(muted); armed = true;
   if (!muted) { start(); if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {}) }
   sync(); return muted;
  },
  get muted() { return muted },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  destroy() { clearInterval(timer); timer = 0; ctx?.close().catch(() => {}); ctx = null }
 };
}
