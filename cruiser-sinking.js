// The hull lists for three seconds, then slips below the waterline.
export function cruiserSinking(fx) {
  const wrecks = [];
  function tick(dt) {
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const wreck = wrecks[i];
      wreck.age += dt;
      const t = Math.min(1, wreck.age / 3);
      wreck.mesh.rotation.z = -.65 * t;
      wreck.mesh.position.y = wreck.startY - 4 * t * t;
      if (t === 1) { wreck.mesh.removeFromParent(); wrecks.splice(i, 1) }
    }
  }
  return {
    start(mesh, elapsed = 0, quiet = false) {
      wrecks.push({mesh, startY: mesh.position.y, age: elapsed});
      if (!quiet) { fx.burst(mesh.position); fx.spill(mesh.position, 1.8, 60) }
    },
    tick,
    clear() { for (const wreck of wrecks) wreck.mesh.removeFromParent(); wrecks.length = 0 }
  };
}
