import * as T from 'three';

// Churning water after something big goes under: bubbles, foam, ripples and slow whirlpools.
// Age-driven (tick(dt)); several runs may overlap. `elapsed` lets a replay join part-way through.
const rnd = () => Math.random();
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

export function waterTurmoil(fx) {
  const runs = [];
  const tmp = new T.Vector3();

  function spot(r, radius) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * radius;
    return tmp.set(r.p.x + Math.cos(a) * d, 0, r.p.z + Math.sin(a) * d);
  }

  function whirl(r, at, scale, offset) {
    const a = rnd() * Math.PI * 2, rem = r.delay + r.duration + 1.5 - at;
    if (rem <= .2) return;
    tmp.set(r.p.x + Math.cos(a) * offset, 0, r.p.z + Math.sin(a) * offset);
    fx.whirl(tmp, scale, rem);
  }

  function tick(dt) {
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      r.age += dt;
      const end = r.delay + r.duration;
      if (r.age >= end) { runs.splice(i, 1); continue }
      if (r.age < r.delay) continue;
      const u = (r.age - r.delay) / r.duration;
      const e = u > .7 ? clamp01(1 - (u - .7) / .3) : 1;   // eases down over the last 30%
      const sc = r.radius / 2.5;
      if (!r.whirl1) { r.whirl1 = true; if (!r.quiet || r.age - dt <= r.delay) whirl(r, r.age, sc * r.intensity, 0) }
      if (!r.whirl2 && u >= .35) { r.whirl2 = true; if (!r.quiet || u - dt / r.duration <= .35) whirl(r, r.age, sc * r.intensity * .7, r.radius * .5) }
      r.tB -= dt; r.tF -= dt; r.tR -= dt;
      while (r.tB <= 0) { r.tB += .18; if (rnd() < e) fx.bubbles(spot(r, r.radius), r.intensity * e) }
      while (r.tF <= 0) { r.tF += .45; if (rnd() < e) fx.foam(spot(r, r.radius * .6), r.intensity * e) }
      while (r.tR <= 0) { r.tR += .9; if (u < .8) fx.ripple(r.p, sc) }
    }
  }

  return {
    start(point, opts = {}) {
      const {radius = 2.5, duration = 5, intensity = 1, delay = 0, elapsed = 0, quiet = false} = opts;
      if (elapsed >= delay + duration) return;
      const r = {p: new T.Vector3(point.x, 0, point.z), radius, duration, intensity, delay, quiet, age: elapsed,
        tB: 0, tF: 0, tR: 0, whirl1: false, whirl2: false};
      if (elapsed > delay) {   // joined late: whirlpools only when still due, and spawn the remaining one at its current stage
        r.whirl1 = true; whirl(r, elapsed, radius / 2.5 * intensity, 0);
        if ((elapsed - delay) / duration >= .35) { r.whirl2 = true; whirl(r, elapsed, radius / 2.5 * intensity * .7, radius * .5) }
        r.tB = rnd() * .18; r.tF = rnd() * .45; r.tR = rnd() * .9;
      }
      runs.push(r);
    },
    tick,
    clear() { runs.length = 0 }
  };
}
