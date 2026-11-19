import * as T from 'three';

// Night searchlights: volumetric-looking beams that sweep the sky and lock onto flying targets.
const LENGTH = 70;
const vertexShader = `
varying float vAlong;varying vec3 vNormalV;varying vec3 vViewPos;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){
 vAlong=uv.y;
 vec4 mv=modelViewMatrix*vec4(position,1.);
 vViewPos=mv.xyz;vNormalV=normalize(normalMatrix*normal);
 gl_Position=projectionMatrix*mv;
 #include <logdepthbuf_vertex>
}`;
const fragmentShader = `
uniform vec3 color;uniform float strength;
varying float vAlong;varying vec3 vNormalV;varying vec3 vViewPos;
#include <common>
#include <logdepthbuf_pars_fragment>
void main(){
 #include <logdepthbuf_fragment>
 float facing=abs(dot(normalize(vNormalV),normalize(-vViewPos)));
 float edge=pow(facing,1.8);                       // soft cone edges
 float fall=pow(1.-vAlong,1.7)*smoothstep(0.,.04,vAlong); // fades with distance
 gl_FragColor=vec4(color*strength*edge*fall,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function searchlights(scene) {
 const geo = new T.CylinderGeometry(5.5, .22, LENGTH, 28, 1, true);
 geo.translate(0, LENGTH / 2, 0);
 // CylinderGeometry uv.y runs top(1)->bottom(0); flip so 0 is at the lamp
 const uv = geo.attributes.uv;
 for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
 const lampGeo = new T.SphereGeometry(.22, 12, 8), up = new T.Vector3(0, 1, 0);
 const posts = [[-34, 1.2, -6], [-17, 4.2, 3.2], [16, 4.2, -3.2], [33, 1.2, 6], [-6, 1.2, 14], [8, 1.2, -15]];
 const lights = posts.map(([x, y, z], i) => {
  const material = new T.ShaderMaterial({
   uniforms: {color: {value: new T.Color(0xfff1d6)}, strength: {value: 0}},
   vertexShader, fragmentShader, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending
  });
  const beam = new T.Mesh(geo, material);beam.frustumCulled = false;beam.renderOrder = 9;beam.position.set(x, y, z);
  const lamp = new T.Mesh(lampGeo, new T.MeshBasicMaterial({color: 0xfff4dc, toneMapped: false, transparent: true}));
  lamp.position.set(x, y, z);
  scene.add(beam, lamp);
  return {beam, lamp, material, base: new T.Vector3(x, y, z), phase: i * 1.7, speed: .18 + (i % 3) * .07,
   dir: new T.Vector3(0, 1, 0), target: null, retarget: 0};
 });
 const want = new T.Vector3(), tmp = new T.Vector3();
 let last = 0;
 return {
  // night: 0..1, targets: array of {m, hp}
  update(now, night, targets = []) {
   const dt = last ? Math.min(.1, (now - last) / 1000) : 0;last = now;
   const on = T.MathUtils.smoothstep(night, .25, .7);
   for (const l of lights) {
    l.beam.visible = l.lamp.visible = on > .01;
    if (!l.beam.visible) continue;
    l.retarget -= dt;
    if (l.retarget <= 0) {
     l.retarget = 2 + Math.random() * 3;
     const flying = targets.filter(t => t.hp > 0 && t.m.position.y > 3);
     l.target = flying.length && Math.random() < .55 ? flying[Math.floor(Math.random() * flying.length)] : null;
    }
    if (l.target && !(l.target.hp > 0 && targets.includes(l.target))) l.target = null;
    if (l.target) want.copy(l.target.m.position).sub(l.base).normalize();
    else {
     const t = now * .001 * l.speed + l.phase;
     want.set(Math.sin(t) * .55, .75 + .2 * Math.sin(t * .7 + 1), Math.cos(t * .8) * .55).normalize();
    }
    l.dir.lerp(want, Math.min(1, dt * (l.target ? 3.5 : 1.2))).normalize();
    l.beam.quaternion.setFromUnitVectors(up, l.dir);
    const flicker = .96 + Math.sin(now * .013 + l.phase * 5) * .04;
    l.material.uniforms.strength.value = .45 * on * flicker * (l.target ? 1.35 : 1);
    l.lamp.material.opacity = on;
    tmp.copy(l.dir).multiplyScalar(.15);l.lamp.position.copy(l.base).add(tmp);
   }
  }
 };
}
