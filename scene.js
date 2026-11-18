import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Water} from 'three/addons/objects/Water.js';
import {Sky} from 'three/addons/objects/Sky.js';
export function landscape(view){
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));view.prepend(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color(0xffd6c4);scene.fog=new T.FogExp2(0xb8d3e4,.005);
 const camera=new T.PerspectiveCamera(42,1,.15,350);camera.position.set(27,17,36);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,5,0);controls.enablePan=false;controls.enableDamping=true;controls.minDistance=14;controls.maxDistance=80;controls.maxPolarAngle=Math.PI*.478;
 scene.add(new T.HemisphereLight(0xffeee5,0x9ba9b1,2));const sun=new T.DirectionalLight(0xffdfb2,2.2);sun.position.set(-16,24,14);scene.add(sun);
 let seed=39;function rand(){seed=(seed*16807)%2147483647;return seed/2147483647}
 const scenery=new Map(),steel=new Map();let parts=scenery;function solid(geo,color,x,y,z,q){geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x,y,z),q||new T.Quaternion(),new T.Vector3(1,1,1)));if(!parts.has(color))parts.set(color,[]);parts.get(color).push(geo.index?geo.toNonIndexed():geo)}
 function box(c,x,y,z,w,h,d){solid(new T.BoxGeometry(w,h,d),c,x,y,z)}
 function beam(c,a,b,w){const dir=new T.Vector3(...b).sub(new T.Vector3(...a));solid(new T.BoxGeometry(w,dir.length(),w),c,...a.map((v,i)=>(v+b[i])/2),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize()))}
 const white=0xf5f5ee,shadow=0xb4bdc2,rail=0xf5e3cc;
 box(0x605e62,0,2.9,0,110,.52,4.8);for(let x=-53;x<54;x+=2.8)box(rail,x,3.17,0,1.3,.015,.08);
 for(const z of [-2.35,2.35]){box(shadow,0,3.58,z,110,.12,.12);for(let x=-54;x<55;x+=2)box(white,x,3.38,z,.09,.55,.09)}
 for(const x of [-48,-40,-32,-24,-18,-12,12,18,24,32,40,48]){box(0x989696,x,1.25,0,1.25,3,4.6);box(0xbcb4a4,x,.12,0,2.3,.75,5.6)}
 parts=steel;
 function arch(x){return 3.25+7.3*(1-(x/12)**2)}
 for(let x=-12;x<12;x+=1.5){for(const z of [-2.2,2.2]){
 beam(white,[x,arch(x),z],[x+1.5,arch(x+1.5),z],.35);
 beam(shadow,[x,arch(x)-.65,z],[x+1.5,arch(x+1.5)-.65,z],.16);
 beam(white,[x,3.2,z],[x,arch(x),z],.12);
 beam(white,[x,arch(x)-.65,z],[x+1.5,arch(x+1.5),z],.12)}
 beam(white,[x,arch(x),-2.2],[x,arch(x),2.2],.22);beam(shadow,[x,arch(x),-2.2],[x+1.5,arch(x+1.5),2.2],.13)}
 parts=scenery;
 // The second deck carries a narrow rail line.
 box(0x7d8387,0,2.85,-6,110,.52,3.6);
 for(const z of [-6.62,-5.38])box(0x9b9690,0,3.18,z,110,.13,.1);
 for(let x=-54;x<55;x+=.65)box(0x625e59,x,3.12,-6,.15,.09,1.65);
 for(const x of [-48,-40,-32,-24,-18,-12,12,18,24,32,40,48])box(0xa09e97,x,1.3,-6,1.25,3,3.3);
 // Low coastal bluffs leave the middle of the span open to shipping.
 for(const side of [-1,1]){
  const bluff=new T.SphereGeometry(1,64,22);
  bluff.scale(30,2.4,20);
  solid(bluff,0x736e50,side*46,-.45,1);
 }
 for(let i=0;i<48;i++){const a=i*.39,r=85+rand()*27;
  const hill=new T.SphereGeometry(1,24,12);hill.scale(13+rand()*16,.6+rand()*1.5,10);
  solid(hill,0x747e73,Math.cos(a)*r,-.6,Math.sin(a)*r);
 }
 const sky=new Sky();sky.scale.setScalar(240);scene.add(sky);
 const skySun=new T.Vector3(-.86,.35,-.35).normalize();
 const su=sky.material.uniforms;su.sunPosition.value.copy(skySun);su.turbidity.value=3;su.rayleigh.value=1.2;
 renderer.toneMapping=T.ACESFilmicToneMapping;
 const size=128,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x*Math.PI*2/size,v=y*Math.PI*2/size,i=(y*size+x)*4;
  data[i]=128+45*Math.cos(3*u+Math.sin(v)*2)+23*Math.cos(11*u+4*v);
  data[i+1]=128+50*Math.sin(5*v+Math.cos(u)*2)+21*Math.sin(7*v-3*u);
  data[i+2]=235;data[i+3]=255;
 }
 const normals=new T.DataTexture(data,size,size);normals.wrapS=normals.wrapT=T.RepeatWrapping;normals.magFilter=T.LinearFilter;normals.minFilter=T.LinearFilter;normals.needsUpdate=true;
 const water=new Water(new T.PlaneGeometry(410,410),{textureWidth:512,textureHeight:512,waterNormals:normals,sunDirection:skySun,sunColor:0xffecce,waterColor:0x12647b,distortionScale:2.8});
 water.rotation.x=-Math.PI/2;water.material.uniforms.size.value=6;scene.add(water);
 const span=new T.Group();scene.add(span);
 for(const [collection,parent] of [[scenery,scene],[steel,span]]){
  for(const [color,geos] of collection){parent.add(new T.Mesh(mergeGeometries(geos),new T.MeshStandardMaterial({color,flatShading:true})));geos.forEach(g=>g.dispose())}
 }
 const railway=span.clone();railway.scale.set(.98,1.05,.78);railway.position.z=-6;scene.add(railway);
 let collapse=false;
 new ResizeObserver(()=>{renderer.setSize(view.clientWidth,view.clientHeight,false);camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix()}).observe(view);
 function zoom(f){let off=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(off.setLength(T.MathUtils.clamp(off.length()*f,14,80)))}
 const ray=new T.Raycaster();
 function aim(event){
  const r=renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new T.Vector2(2*(event.clientX-r.left)/r.width-1,1-2*(event.clientY-r.top)/r.height),camera);
 }
 function pick(event,groups){aim(event);
  let hit=ray.intersectObjects(groups,true)[0]?.object;
  while(hit&&!groups.includes(hit))hit=hit.parent;
  return hit;
 }
 return {scene,zoom,pick,waterPoint(event){aim(event);return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),new T.Vector3())},
 setHits(hits){collapse=hits>=3;if(!hits){span.position.y=0;span.rotation.z=0}span.scale.y=1-.035*hits},
 draw(){if(collapse){span.position.y=T.MathUtils.lerp(span.position.y,-6.5,.045);span.rotation.z=T.MathUtils.lerp(span.rotation.z,-.26,.045)}water.material.uniforms.time.value=performance.now()*.00035;controls.update();renderer.render(scene,camera)}}
}
