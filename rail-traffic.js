import * as T from 'three';

// Military freight on the rail deck (z = -6). A rail strike derails it: wagons pile off the bridge into the
// strait one after another, the tanks and guns they carry tumble out and sink.
const SPEED = 6.8, PITCH = 4.2, RAIL_Z = -6;

export function railTraffic(world, extent) {
 const cars = [];
 const geometry = new T.BoxGeometry(), barrel = new T.CylinderGeometry(.06, .07, 1, 8), wheel = new T.CylinderGeometry(.2, .2, .16, 12);
 const mat = c => new T.MeshStandardMaterial({color: c, roughness: .75});
 const paints = [0x323940, 0xd19946, 0x336c70, 0xbfcbd0, 0x202e39, 0x4c5a3a, 0x5d6650, 0x2b2f26].map(mat);
 const box = (parent, x, y, z, w, h, d, paint) => {
  const m = new T.Mesh(geometry, paints[paint]); m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = true; parent.add(m); return m;
 };
 function tank() {
  const g = new T.Group();
  box(g, 0, .2, 0, 1.75, .34, 1.02, 5);           // hull
  box(g, -.05, .12, .56, 1.7, .22, .12, 7); box(g, -.05, .12, -.56, 1.7, .22, .12, 7); // tracks
  box(g, -.1, .5, 0, .78, .28, .72, 6);            // turret
  const gun = new T.Mesh(barrel, paints[7]); gun.rotation.z = Math.PI / 2; gun.scale.y = 1.2; gun.position.set(.78, .52, 0); g.add(gun);
  return g;
 }
 function howitzer() {
  const g = new T.Group();
  box(g, -.15, .18, 0, 1.1, .16, .7, 6);
  for (const z of [-.42, .42]) { const w = new T.Mesh(wheel, paints[7]); w.rotation.x = Math.PI / 2; w.position.set(-.1, .2, z); g.add(w); }
  box(g, -.85, .12, .18, .9, .08, .08, 5); box(g, -.85, .12, -.18, .9, .08, .08, 5); // trails
  box(g, .05, .42, 0, .5, .3, .34, 5);
  const gun = new T.Mesh(barrel, paints[7]); gun.scale.y = 1.7; gun.rotation.z = Math.PI / 2 - .35; gun.position.set(.7, .7, 0); g.add(gun);
  return g;
 }
 for (let i = 0; i < 8; i++) {
  const car = new T.Group(), kind = i === 0 ? 'loco' : i % 3 === 0 ? 'box' : 'flat';
  box(car, 0, .32, 0, 3.9, .32, 1.32, 0);
  for (const x of [-1.25, 1.25]) box(car, x, .13, 0, .66, .26, 1.34, 0);
  const cargo = [];
  if (kind === 'loco') { box(car, 0, .85, 0, 3.7, .93, 1.3, 1); box(car, 1.12, 1.42, 0, 1.1, .57, 1.32, 1); box(car, 1.15, 1.47, 0, 1, .25, 1.34, 4); }
  else if (kind === 'box') { box(car, 0, .85, 0, 3.7, .93, 1.3, 2); box(car, 0, 1.14, 0, 3.32, .29, 1.32, 4); box(car, 0, 1.37, 0, 3.82, .13, 1.39, 3); }
  else {
   box(car, 0, .52, 0, 3.8, .08, 1.36, 4);
   const load = i % 2 ? [tank()] : [howitzer(), howitzer()];
   load.forEach((g, k) => { g.position.set(load.length > 1 ? (k ? .95 : -.95) : 0, .56, 0); g.scale.setScalar(load.length > 1 ? .9 : 1); car.add(g); cargo.push(g); });
  }
  car.userData = {cargo, home: cargo.map(g => [g.position.clone(), g.quaternion.clone(), g.scale.clone()])};
  world.scene.add(car); cars.push(car);
 }
 const leg = extent * 2 + cars.length * PITCH;
 let offset = 0, last = null, wreck = null, fx = null, onSplash = null;
 const distanceAt = clock => (clock + offset) * SPEED + extent;
 function layout(clock) {
  const distance = distanceAt(clock), direction = Math.floor(distance / leg) % 2 ? -1 : 1, lead = distance % leg - extent;
  return cars.map((_, i) => ({x: direction * (lead - i * PITCH), direction}));
 }
 function place(clock) {
  layout(clock).forEach(({x, direction}, i) => {
   const car = cars[i];
   car.visible = Math.abs(x) <= extent;
   car.position.set(x, world.deckTop(x) + .08, RAIL_Z);
   car.rotation.set(0, direction === 1 ? 0 : Math.PI, 0);
  });
 }
 const rnd = (a, b) => a + Math.random() * (b - a);
 function body(m, v, spin, delay) { return {m, v, spin, delay, wet: false, bubble: 0}; }
 function stepBody(b, dt) {
  const p = b.m.position;
  if (!b.wet) {
   b.v.y -= 9.8 * dt;
   p.addScaledVector(b.v, dt);
   b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
   if (p.y < .1) {
    b.wet = true; fx?.splash(new T.Vector3(p.x, 0, p.z), b.big ? 1.6 : .8);
    if (b.big && b.focus && onSplash) { onSplash(); onSplash = null; }
    b.v.multiplyScalar(.18); b.v.y = -.5; b.spin.multiplyScalar(.15);
   }
  } else {
   // sink: slow, a little drift and roll, bubbles on the surface
   b.v.multiplyScalar(Math.exp(-dt * 1.5)); b.v.y = Math.max(b.v.y - dt * .4, -.9);
   p.addScaledVector(b.v, dt);
   b.m.rotation.x += b.spin.x * dt; b.m.rotation.z += b.spin.z * dt;
   b.bubble -= dt;
   if (b.bubble <= 0 && p.y > -3) { b.bubble = rnd(.35, .8); fx?.splash(new T.Vector3(p.x + rnd(-.4, .4), 0, p.z + rnd(-.4, .4)), .25); }
   if (p.y < -4.5) b.m.visible = false;
  }
 }
 function derail(point, effects, splashed) {
  if (wreck) return false;
  fx = effects; onSplash = splashed ?? null;
  const near = cars.filter(c => c.visible && Math.abs(c.position.x - point.x) < 26);
  if (!near.length) return false;
  const direction = Math.cos(cars[0].rotation.y) > 0 ? 1 : -1, focusCar = move.nearest(point.x);
  const bodies = [];
  for (const car of cars) {
   if (!car.visible) continue;
   const dx = car.position.x - point.x, ahead = dx * direction, dist = Math.abs(dx);
   // cars past the blast are thrown off at once; the rest keep rolling into the gap and follow
   const delay = ahead >= -1 ? 0 : Math.min(2.2, dist / SPEED * .9);
   const kick = Math.exp(-Math.max(0, ahead) / 7);
   const v = new T.Vector3(direction * SPEED * rnd(.35, .6), rnd(2, 3.2) + 4 * kick, -rnd(2.4, 4.2) - 2 * kick);
   const b = body(car, v, new T.Vector3(-rnd(.6, 1.6), rnd(-.5, .5), rnd(-.8, .8) * direction), delay);
   b.big = true; b.focus = car === focusCar; b.v0 = new T.Vector3(direction * SPEED, 0, 0); bodies.push(b);
   // the cargo is chained down badly: it comes loose mid-air
   for (const g of car.userData.cargo) {
    const loose = body(g, null, new T.Vector3(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3)), 0);
    loose.parentBody = b; loose.release = delay + rnd(.25, .7); bodies.push(loose);
   }
  }
  wreck = {bodies, done: false};
  return true;
 }
 function stepWreck(dt) {
  let alive = false;
  for (const b of wreck.bodies) {
   if (b.parentBody) {
    if (b.release > 0) { b.release -= dt; if (b.release <= 0) { world.scene.attach(b.m); b.v = b.parentBody.v.clone().add(new T.Vector3(rnd(-1.5, 1.5), rnd(1.5, 3.5), rnd(-2.5, .5))); } else { alive = true; continue; } }
   } else if (b.delay > 0) { b.delay -= dt; b.m.position.x += b.v0.x * dt; alive = true; continue; }
   stepBody(b, dt);
   if (b.m.visible) alive = true;
  }
  return alive;
 }
 function restore() {
  for (const car of cars) {
   car.userData.cargo.forEach((g, k) => { const [p, q, s] = car.userData.home[k]; car.add(g); g.position.copy(p); g.quaternion.copy(q); g.scale.copy(s); g.visible = true; });
   car.visible = true;
  }
  wreck = null;
 }
 function move(clock) {
  const dt = last == null ? 0 : Math.max(0, Math.min(.1, clock - last)); last = clock;
  if (wreck) {
   if (!wreck.done && !stepWreck(dt)) wreck.done = true;
   // bring a fresh train back only when its scheduled position is off the map, so nothing pops in
   if (wreck.done && layout(clock).every(({x}) => Math.abs(x) > extent)) restore(); else return;
  }
  place(clock);
 }
 // Will any car pass x within `within` seconds?
 move.coming = (x, clock, within = 1.1) => !wreck && [0, within * .5, within].some(t => layout(clock + t).some(c => Math.abs(c.x - x) < 1.6 && Math.abs(c.x) <= extent));
 // Re-time an off-screen train so it reaches x in about `eta` seconds (keeps its current direction).
 move.summon = (x, clock, eta = 22) => {
  if (wreck || layout(clock).some(c => Math.abs(c.x) < 90)) return false;
  const distance = distanceAt(clock), n = Math.floor(distance / leg), direction = n % 2 ? -1 : 1;
  const lead = direction * x + 2 * PITCH; // third wagon lines up with x
  const target = n * leg + lead + extent - eta * SPEED;
  if (target < n * leg) return false;
  offset += (target - distance) / SPEED; return true;
 };
 move.derail = derail;
 move.nearest = x => cars.filter(c => c.visible).sort((a, b) => Math.abs(a.position.x - x) - Math.abs(b.position.x - x))[0] ?? null;
 move.wrecked = () => !!wreck;
 move.reset = () => { if (wreck) restore(); offset = 0; };
 return move;
}
