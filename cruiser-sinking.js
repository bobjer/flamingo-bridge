import * as T from 'three';

// A destroyed cruiser: guns, bridge and mast fly off, the hull snaps in two amidships,
// both halves burn, drift apart, list and slip under. Everything runs on an `age` advanced by tick(dt).
const CUT_X = .05;          // local x of the break
const SHUDDER_END = .4;     // halves stay together and tremble until the secondary blast
const END = 7.5;            // everything is gone by now
const WATER_Y = 0;          // world waterline
const BOW_DIVE = 1.2;       // final bow pitch (rotation.z) in the last second
const rnd = () => Math.random();
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x) };

export function cruiserSinking(fx) {
  const wrecks = [];
  const tmpPos = new T.Vector3(), tmpQuat = new T.Quaternion(), tmpScale = new T.Vector3();

  function makeHalf(sign, pivot, ship, hull, cloned) {
    // sign +1: bow (x >= cut), -1: stern. Children are re-parented relative to the cut plane.
    const inner = new T.Group(); inner.rotation.order = 'ZXY'; pivot.add(inner);
    for (const child of hull) {
      const cutLocal = (CUT_X - child.position.x) / child.scale.x;
      let keep = null;
      if (Math.abs(cutLocal) >= 1) {
        // the oval lies wholly on one side of the cut (child centre left/right of the plane)
        if ((sign > 0) === (cutLocal < 0)) keep = child.clone(false);
        else continue;
        keep.geometry = child.geometry; keep.material = child.material;
      } else {
        const g = child.geometry.clone(), pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setX(i, sign > 0 ? Math.max(pos.getX(i), cutLocal) : Math.min(pos.getX(i), cutLocal));
        pos.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
        cloned.push(g);
        keep = new T.Mesh(g, child.material);
        keep.position.copy(child.position); keep.quaternion.copy(child.quaternion); keep.scale.copy(child.scale);
      }
      keep.castShadow = child.castShadow; keep.receiveShadow = child.receiveShadow;
      keep.position.x -= CUT_X;
      inner.add(keep);
    }
    // glowing cut face
    const geo = new T.CircleGeometry(1, 20).rotateY(Math.PI / 2);
    const mat = new T.MeshBasicMaterial({color: 0xff6a20, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false});
    const disc = new T.Mesh(geo, mat);
    disc.scale.set(1, .46, .72); disc.position.set(sign * .015, .17, 0); disc.renderOrder = 9;
    inner.add(disc);
    return {sign, pivot, inner, disc, discGeo: geo, discMat: mat, site: {p: new T.Vector3(), k: 1.1, t: 0}, under: false, ref: new T.Vector3(sign * 1.3, .45, 0)};
  }

  function pose(w) {
    const t = w.age;
    const shake = .03 * (1 - ease((t - SHUDDER_END) / .5));
    const sep = 1.1 * ease((t - .4) / 3), vee = ease((t - .4) / 3.5), roll = ease(t / 6);
    const dive = ease(t - (END - 1));
    for (const h of w.halves) {
      const bow = h.sign > 0;
      const drop = bow ? 5.4 * Math.pow(clamp01((t - .8) / 6.7), 2) : 5.6 * Math.pow(clamp01((t - .4) / 6.6), 2);
      h.pivot.position.copy(w.base).addScaledVector(w.dir, h.sign * sep).add(tmpPos.set((rnd() - .5) * 2 * shake, (rnd() - .5) * 2 * shake - drop, (rnd() - .5) * 2 * shake));
      h.inner.rotation.z = bow ? .45 * vee + (BOW_DIVE - .45) * dive : -.35 * vee;
      h.inner.rotation.x = bow ? .6 * roll : -.9 * roll;
      h.pivot.updateMatrixWorld(true);
    }
  }

  function finish(w) {
    for (const h of w.halves) {
      h.pivot.removeFromParent();
      h.discGeo.dispose(); h.discMat.dispose();
    }
    for (const g of w.cloned) g.dispose();
    w.halves.length = 0; w.cloned.length = 0;
  }

  function tick(dt) {
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const w = wrecks[i];
      w.age += dt;
      const t = w.age;
      if (t >= END) {
        for (const h of w.halves) {
          const p = h.pivot.position;
          fx.splash(tmpPos.set(p.x, 0, p.z), 1.2);
          if (rnd() < .7) fx.splash(tmpPos.set(p.x + (rnd() - .5) * 1.6, 0, p.z + (rnd() - .5) * 1.6), 1.2);
        }
        fx.spill(w.base, 1.4, 45);
        finish(w); wrecks.splice(i, 1); continue;
      }
      pose(w);
      if (!w.boom && t >= SHUDDER_END) {
        w.boom = true;
        const cut = tmpPos.copy(w.base).add(new T.Vector3(0, .4, 0));
        fx.explosion(cut, 1.5);
        fx.splash(w.base.clone().addScaledVector(w.dir, 1), 1.1);
        fx.splash(w.base.clone().addScaledVector(w.dir, -1), 1.1);
      }
      w.smokeClock -= dt;
      for (const h of w.halves) {
        const ref = h.inner.localToWorld(h.ref.clone());
        if (!h.under && ref.y < WATER_Y) {
          h.under = true;
          fx.splash(tmpPos.set(ref.x, 0, ref.z), 1.5);
          fx.sparks(ref, .5, 10, 0xfff0c0);
          fx.spill(ref, 1, 40);
        }
        if (h.under) { h.disc.visible = false; continue }
        const glow = 1 - t / 3;
        h.disc.visible = glow > 0;
        if (glow > 0) h.discMat.opacity = glow * (.8 + .2 * rnd());
        h.site.p.copy(ref);
        const edge = h.inner.localToWorld(tmpPos.set(0, .3, 0));
        fx.burnTrail(edge, dt, 1.2, h.site);
        fx.blaze(h.site, dt);
        if (w.smokeClock <= 0 && rnd() < .5) { fx.smokeColumn(ref, .5); w.smokeClock = .35 }
      }
      if (w.smokeClock <= 0) w.smokeClock = .35;
    }
  }

  return {
    start(mesh, elapsed = 0, quiet = false) {
      mesh.updateWorldMatrix(true, false);
      mesh.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);
      const origin = tmpPos.clone(), quat = tmpQuat.clone(), scl = tmpScale.clone();
      if (elapsed >= END) { mesh.removeFromParent(); return }
      const centre = mesh.localToWorld(new T.Vector3(0, .5, 0));
      const base = mesh.localToWorld(new T.Vector3(CUT_X, 0, 0));
      const dir = new T.Vector3(1, 0, 0).applyQuaternion(quat).setY(0).normalize();
      const kids = [...mesh.children], hull = kids.slice(0, 2), parts = kids.slice(2);

      // t = 0: blast, then guns / bridge / mast fly off as burning debris
      if (!quiet && elapsed < .4) {
        fx.explosion(centre, 2.4); fx.sparks(centre, 1.4, 30, 0xfff0c0); fx.smokeColumn(centre, 1.4);
        fx.spill(origin, 1.8, 60);
      }
      if (elapsed < 2) {
        for (const part of parts) {
          const out = part.getWorldPosition(new T.Vector3()).sub(centre); out.y = 0;
          if (out.lengthSq() < .05) out.set(rnd() - .5, 0, rnd() - .5);
          out.normalize().multiplyScalar(3 + rnd() * 4).setY(5 + rnd() * 4);
          fx.piece(part, out, {burn: rnd() < .7 && !quiet, life: Math.max(1.5, 9 - elapsed)});
        }
      } else for (const part of parts) part.removeFromParent();

      // the two halves, pivoting about the break
      const w = {age: elapsed, base, dir, halves: [], cloned: [], quiet, boom: elapsed >= SHUDDER_END, smokeClock: 0};
      for (const sign of [1, -1]) {
        const pivot = new T.Group();
        pivot.position.copy(base); pivot.quaternion.copy(quat); pivot.scale.copy(scl);
        const h = makeHalf(sign, pivot, mesh, hull, w.cloned);
        w.halves.push(h);
      }
      // halves live in the topmost ancestor (the scene), where world transforms are valid
      let scene = mesh.parent;
      while (scene?.parent) scene = scene.parent;
      mesh.removeFromParent();
      // without a parent the halves have nowhere to live: nothing more to animate
      if (!scene) { finish(w); return }
      for (const h of w.halves) scene.add(h.pivot);
      pose(w);
      for (const h of w.halves) {
        if (h.inner.localToWorld(h.ref.clone()).y < WATER_Y) { h.under = true; h.disc.visible = false }
      }
      wrecks.push(w);
    },
    tick,
    clear() { for (const w of wrecks) finish(w); wrecks.length = 0 }
  };
}
