import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Water} from 'three/addons/objects/Water.js';
import {Sky} from 'three/addons/objects/Sky.js';

const MIN_DIST = 14, MAX_DIST = 3500;

function concreteTexture() {
 const s = 256, c = document.createElement('canvas');
 c.width = c.height = s;
 const g = c.getContext('2d');
 g.fillStyle = '#bdb9b0';
 g.fillRect(0, 0, s, s);
 let seed = 7;
 const r = () => (seed = seed * 16807 % 2147483647) / 2147483647;
 for (let i = 0; i < 5200; i++) {
  const v = 150 + r() * 70;
  g.fillStyle = `rgba(${v},${v - 3},${v - 10},${.1 + r() * .18})`;
  g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
 }
 for (let i = 0; i < 40; i++) { // weathering streaks
  g.fillStyle = `rgba(70,66,60,${.03 + r() * .05})`;
  g.fillRect(r() * s, 0, 1 + r() * 4, s);
 }
 const t = new T.CanvasTexture(c);
 t.colorSpace = T.SRGBColorSpace;
 t.anisotropy = 4;
 return t;
}

// Tileable water normal map built from a sum of sine waves with analytic slopes.
function waterNormals(renderer) {
 const size = 256, data = new Uint8Array(size * size * 4);
 const waves = [[2, 1, 1], [3, 2, .8], [5, 3, .55], [7, 5, .4], [11, 4, .3], [4, 9, .3], [13, 8, .2], [17, 11, .15], [23, 15, .1], [19, 27, .08]];
 for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const u = x / size, v = y / size;
  let dx = 0, dy = 0;
  waves.forEach(([ku, kv, a], n) => {
   const ph = 2 * Math.PI * (ku * u + kv * v) + n * 1.7;
   const d = Math.cos(ph) * a * 2 * Math.PI / Math.hypot(ku, kv) / 45;
   dx += d * ku / Math.hypot(ku, kv);
   dy += d * kv / Math.hypot(ku, kv);
  });
  const len = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
  data[i] = (-dx / len * .5 + .5) * 255;
  data[i + 1] = (-dy / len * .5 + .5) * 255;
  data[i + 2] = (1 / len * .5 + .5) * 255;
  data[i + 3] = 255;
 }
 const tex = new T.DataTexture(data, size, size);
 tex.wrapS = tex.wrapT = T.RepeatWrapping;
 tex.magFilter = T.LinearFilter;
 tex.minFilter = T.LinearMipmapLinearFilter;
 tex.generateMipmaps = true;
 tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
 tex.needsUpdate = true;
 return tex;
}

export function landscape(view) {
 const renderer = new T.WebGLRenderer({antialias: true, logarithmicDepthBuffer: true});
 renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
 renderer.toneMapping = T.ACESFilmicToneMapping;
 renderer.toneMappingExposure = .42;
 renderer.shadowMap.enabled = true;
 renderer.shadowMap.type = T.PCFSoftShadowMap;
 view.prepend(renderer.domElement);

 const hazeColor = new T.Color(0xa3c6e2);
 const scene = new T.Scene();
 scene.background = hazeColor;
 scene.fog = new T.FogExp2(hazeColor, .0035);

 const camera = new T.PerspectiveCamera(42, 1, .15, 60000);
 camera.position.set(40, 20, 52);
 // Pan is off and the target is fixed: the bridge is always in the centre of the view.
 const controls = new OrbitControls(camera, renderer.domElement);
 controls.target.set(0, 5, 0);
 controls.enablePan = false;
 controls.enableDamping = true;
 controls.minDistance = MIN_DIST;
 controls.maxDistance = MAX_DIST;
 controls.zoomSpeed = 2.4;
 controls.maxPolarAngle = Math.PI * .478;

 // Sun: high, warm, behind the default camera so the white steel is fully lit.
 const skySun = new T.Vector3(.45, .6, .66).normalize();
 const sky = new Sky();
 sky.scale.setScalar(45000); // used only to light the scene (environment map)
 const su = sky.material.uniforms;
 su.sunPosition.value.copy(skySun);
 su.turbidity.value = .6;
 su.rayleigh.value = 3;
 su.mieCoefficient.value = .0015;
 su.mieDirectionalG.value = .85;
 const pmrem = new T.PMREMGenerator(renderer);
 scene.environment = pmrem.fromScene(sky).texture;
 scene.environmentIntensity = .9;
 pmrem.dispose();

// Visible sky: clear photographic gradient, deep blue at the zenith, pale haze at the horizon.
 const domeGeo = new T.SphereGeometry(30000, 48, 24), domeCol = [], zen = new T.Color(0x2a67b4), mid = new T.Color(0x5d9ad0), hor = hazeColor.clone();
 const pos = domeGeo.attributes.position;
 for (let i = 0; i < pos.count; i++) {
  const h = Math.max(0, pos.getY(i) / 30000), c = h < .22 ? hor.clone().lerp(mid, h / .22) : mid.clone().lerp(zen, Math.min(1, (h - .22) / .6));
  domeCol.push(c.r, c.g, c.b);
 }
 domeGeo.setAttribute('color', new T.Float32BufferAttribute(domeCol, 3));
 const dome = new T.Mesh(domeGeo, new T.MeshBasicMaterial({vertexColors: true, side: T.BackSide, fog: false, toneMapped: false, depthWrite: false}));
 dome.renderOrder = -1;
 scene.add(dome);

  scene.add(new T.HemisphereLight(0xdcebff, 0x6f8f9c, .55));
 const sun = new T.DirectionalLight(0xfff0dc, 3);
 sun.position.copy(skySun).multiplyScalar(70);
 sun.castShadow = true;
 sun.shadow.mapSize.set(2048, 2048);
 const sc = sun.shadow.camera;
 sc.left = -68; sc.right = 68; sc.top = 34; sc.bottom = -34; sc.near = 5; sc.far = 190;
 sun.shadow.bias = -.0004;
 sun.shadow.normalBias = .06;
 scene.add(sun);

 let seed = 39;
 const rand = () => (seed = seed * 16807 % 2147483647) / 2147483647;

 const concrete = concreteTexture();
 const palette = {
  white: {color: 0xf6f7f4, roughness: .38, metalness: .08},
  shade: {color: 0xcdd4d8, roughness: .45, metalness: .1},
  line: {color: 0xfbf8ee, roughness: .6},
  asphalt: {color: 0x3a3c40, roughness: .93},
  railbed: {color: 0x6f7377, roughness: .9},
  concrete: {color: 0xffffff, roughness: .96, map: concrete},
  concreteDark: {color: 0xd4d0c8, roughness: .98, map: concrete},
  steel: {color: 0x8c9296, roughness: .5, metalness: .7},
  sleeper: {color: 0x5b5651, roughness: .95},
  fender: {color: 0xe9e7e0, roughness: .85, map: concrete},
  sand: {color: 0x9a8a60, roughness: 1},
  grass: {color: 0x5a6a3c, roughness: 1},
  haze: {color: 0x55705f, roughness: 1},
  lamp: {color: 0xdfe4e6, roughness: .4, metalness: .4}
 };
 const scenery = new Map(), steel = new Map();
 let parts = scenery;
 const Q = new T.Quaternion(), ONE = new T.Vector3(1, 1, 1);
 function solid(geo, key, x, y, z, q) {
  geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), q || Q, ONE));
  if (!parts.has(key)) parts.set(key, []);
  parts.get(key).push(geo.index ? geo.toNonIndexed() : geo);
 }
 const box = (c, x, y, z, w, h, d) => solid(new T.BoxGeometry(w, h, d), c, x, y, z);
 const UP = new T.Vector3(0, 1, 0);
 function beam(c, a, b, w) { // round steel tube between two points
  const dir = new T.Vector3(...b).sub(new T.Vector3(...a));
  solid(new T.CylinderGeometry(w / 2, w / 2, dir.length(), 7), c, ...a.map((v, i) => (v + b[i]) / 2), new T.Quaternion().setFromUnitVectors(UP, dir.normalize()));
 }
 function column(c, x, y, z, wTop, wBot, h, d) { // tapered square pier column
  const g = new T.CylinderGeometry(wTop * .7071, wBot * .7071, h, 4);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, d / wTop);
  solid(g, c, x, y, z);
 }
 const piers = [-48, -40, -32, -24, -18, -12, 12, 18, 24, 32, 40, 48];

 // --- road deck ---
 box('asphalt', 0, 2.9, 0, 110, .52, 4.8);
 box('shade', 0, 2.55, 0, 110, .22, 4.9);
 for (let x = -53; x < 54; x += 2.8) box('line', x, 3.17, 0, 1.3, .015, .08);
 for (const z of [-1.95, 1.95]) box('line', 0, 3.17, z, 110, .015, .06);
 for (const z of [-2.35, 2.35]) {
  box('shade', 0, 3.58, z, 110, .1, .1);
  box('shade', 0, 3.38, z, 110, .05, .05);
  for (let x = -54; x < 55; x += 2) box('white', x, 3.38, z, .08, .55, .08);
 }
 // lamp posts along the approaches and between arch spans
 for (let x = -54; x <= 54; x += 9) for (const z of [-2.3, 2.3]) {
  if (Math.abs(x) < 13) continue;
  beam('lamp', [x, 3.2, z], [x, 6.2, z], .1);
  beam('lamp', [x, 6.2, z], [x, 6.35, z - Math.sign(z) * .55], .07);
 }
 // piers: two tapered columns, cap, footing and round ice-breaker fenders
 for (const x of piers) {
  for (const z of [-1.4, 1.4]) column('concrete', x, 1.35, z, .85, 1.2, 2.9, 1.4);
  box('concreteDark', x, 2.5, 0, 1.5, .4, 5.4);
  box('concrete', x, .08, 0, 2.5, .8, 5.8);
  for (const z of [-3.1, 3.1]) solid(new T.CylinderGeometry(.55, .55, .8, 14), 'fender', x, .06, z);
 }
 for (const x of [-12, 12]) for (const z of [-3.5, 3.5]) solid(new T.CylinderGeometry(.8, .8, .9, 18), 'fender', x + (x < 0 ? -1.2 : 1.2), .06, z);

 // --- arch (steel) ---
 parts = steel;
 const arch = x => 3.25 + 7.3 * (1 - (x / 12) ** 2);
 for (let x = -12; x < 12; x += 1.5) {
  for (const z of [-2.2, 2.2]) {
   const x2 = x + 1.5;
   beam('white', [x, arch(x), z], [x2, arch(x2), z], .42);
   beam('shade', [x, arch(x) - .65, z], [x2, arch(x2) - .65, z], .2);
   beam('white', [x, 3.2, z], [x, arch(x) - .65, z], .1); // hanger
   beam('white', [x, arch(x) - .65, z], [x2, arch(x2), z], .13);
   beam('white', [x, arch(x), z], [x2, arch(x2) - .65, z], .1);
  }
  beam('white', [x, arch(x), -2.2], [x, arch(x), 2.2], .22);
  beam('shade', [x, arch(x), -2.2], [x + 1.5, arch(x + 1.5), 2.2], .13);
 }
 for (const z of [-2.2, 2.2]) {
  box('white', 0, 3.1, z, 24, .42, .3); // tie girder
  for (const x of [-12, 12]) box('white', x, 3.7, z, 1.1, 1.4, .8);
 }

 // --- second (railway) deck ---
 parts = scenery;
 box('railbed', 0, 2.85, -6, 110, .52, 3.6);
 box('shade', 0, 2.52, -6, 110, .22, 3.7);
 for (const z of [-6.62, -5.38]) box('steel', 0, 3.18, z, 110, .13, .1);
 for (let x = -54; x < 55; x += .65) box('sleeper', x, 3.12, -6, .15, .09, 1.65);
 for (const x of piers) {
  for (const z of [-6.9, -5.1]) column('concrete', x, 1.3, z, .8, 1.1, 2.9, 1.1);
  box('concreteDark', x, 2.45, -6, 1.4, .4, 4.1);
  box('concrete', x, .08, -6, 2.4, .8, 4.6);
 }

 // --- coast ---
 for (const side of [-1, 1]) {
  const bluff = new T.SphereGeometry(1, 48, 20);
  bluff.scale(30, 2.4, 20);
  solid(bluff, 'sand', side * 46, -.45, 1);
  const turf = new T.SphereGeometry(1, 40, 14);
  turf.scale(24, 1.1, 14);
  solid(turf, 'grass', side * 48, .55, 1);
 }
 for (let i = 0; i < 26; i++) { // low far shoreline, hazed by fog
  const side = i % 2 ? 1 : -1, hill = new T.SphereGeometry(1, 20, 8);
  hill.scale(30 + rand() * 60, .5 + rand() * 1.2, 12 + rand() * 12);
  solid(hill, 'haze', side * (95 + rand() * 260), -.5, (rand() - .5) * 120);
 }

 for (const [collection, parent] of [[scenery, scene], [steel, null]]) {
  for (const [key, geos] of collection) {
   const m = new T.Mesh(mergeGeometries(geos), new T.MeshStandardMaterial(palette[key]));
   m.castShadow = m.receiveShadow = true;
   (parent || (collection.group ??= new T.Group())).add(m);
   geos.forEach(g => g.dispose());
  }
 }
 const span = steel.group;
 scene.add(span);
 const railway = span.clone();
 railway.scale.set(.98, 1.05, .78);
 railway.position.z = -6;
 scene.add(railway);

 // --- water ---
 const water = new Water(new T.PlaneGeometry(60000, 60000), {
  textureWidth: 512, textureHeight: 512,
  waterNormals: waterNormals(renderer),
  sunDirection: skySun, sunColor: 0xb9a98a,
  waterColor: 0x0a7088, distortionScale: 2.4, fog: true
 });
 water.rotation.x = -Math.PI / 2;
 water.material.uniforms.size.value = 14;
 scene.add(water);

 // --- life on the water: red buoys and a small yellow sailboat ---
 const buoyGeo = new T.CylinderGeometry(.16, .22, .45, 8), buoyMat = new T.MeshStandardMaterial({color: 0xc8231c, roughness: .5});
 for (let i = 0; i < 14; i++) {
  const b = new T.Mesh(buoyGeo, buoyMat);
  b.position.set((rand() - .5) * 110, .05, (rand() < .5 ? -1 : 1) * (14 + rand() * 40));
  scene.add(b);
 }
 const boat = new T.Group();
 const hull = new T.Mesh(new T.BoxGeometry(1.8, .35, .6), new T.MeshStandardMaterial({color: 0xf2b21a, roughness: .5}));
 const sail = new T.Mesh(new T.PlaneGeometry(.9, 1.6), new T.MeshStandardMaterial({color: 0xfafafa, side: T.DoubleSide, roughness: .8}));
 sail.position.set(.1, 1.1, 0);
 boat.add(hull, sail);
 boat.position.set(19, .1, 26);
 boat.rotation.y = .5;
 scene.add(boat);
 boat.traverse(o => { if (o.isMesh) o.castShadow = true; });

 new ResizeObserver(() => {
  renderer.setSize(view.clientWidth, view.clientHeight, false);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
 }).observe(view);

 function zoom(f) {
  const off = camera.position.clone().sub(controls.target);
  camera.position.copy(controls.target).add(off.setLength(T.MathUtils.clamp(off.length() * f, MIN_DIST, MAX_DIST)));
 }
 const ray = new T.Raycaster();
 function aim(event) {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new T.Vector2(2 * (event.clientX - r.left) / r.width - 1, 1 - 2 * (event.clientY - r.top) / r.height), camera);
 }
 function pick(event, groups) {
  aim(event);
  let hit = ray.intersectObjects(groups, true)[0]?.object;
  while (hit && !groups.includes(hit)) hit = hit.parent;
  return hit;
 }
 let collapse = false, prevDist = camera.position.distanceTo(controls.target);
 return {
  scene, zoom, pick,
  waterPoint(event) { aim(event); return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3()); },
  setHits(hits) {
   collapse = hits >= 3;
   if (!hits) { span.position.y = 0; span.rotation.z = 0; }
   span.scale.y = 1 - .035 * hits;
  },
  draw() {
   if (collapse) {
    span.position.y = T.MathUtils.lerp(span.position.y, -6.5, .045);
    span.rotation.z = T.MathUtils.lerp(span.rotation.z, -.26, .045);
   }
   const dist = camera.position.distanceTo(controls.target);
   // any zoom-out (buttons, wheel, trackpad pinch) also tilts the camera toward straight-down, like climbing to orbit
   if (dist > prevDist + .01 && dist > 120) {
    const off = camera.position.clone().sub(controls.target).normalize().lerp(UP, Math.min(.12, (dist - prevDist) / dist * 1.5)).normalize();
    camera.position.copy(controls.target).addScaledVector(off, dist);
   }
   prevDist = dist;
   // thick haze up close, almost none from high orbit so the whole sea is visible
   scene.fog.density = .0035 / (1 + (dist / 45) ** 2.2);
   boat.position.y = .08 + Math.sin(performance.now() * .0012) * .04;
   boat.rotation.z = Math.sin(performance.now() * .0009) * .05;
   water.material.uniforms.time.value = performance.now() * .00035;
   controls.update();
   renderer.render(scene, camera);
  }
 };
}
