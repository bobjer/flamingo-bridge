import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Water} from 'three/addons/objects/Water.js';
import {Sky} from 'three/addons/objects/Sky.js';
export function landscape(view){
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));view.prepend(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color(0xffd6c4);scene.fog=new T.FogExp2(0xfbc9bd,.009);
 const camera=new T.PerspectiveCamera(42,1,.15,350);camera.position.set(22,15,30);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,5,0);controls.enablePan=false;controls.enableDamping=true;controls.minDistance=14;controls.maxDistance=59;controls.maxPolarAngle=Math.PI*.478;
 scene.add(new T.HemisphereLight(0xffeee5,0x9ba9b1,2));const sun=new T.DirectionalLight(0xffdfb2,2.2);sun.position.set(-16,24,14);scene.add(sun);
 let seed=39;function rand(){seed=(seed*16807)%2147483647;return seed/2147483647}
 const parts=new Map();function solid(geo,color,x,y,z,q){geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x,y,z),q||new T.Quaternion(),new T.Vector3(1,1,1)));if(!parts.has(color))parts.set(color,[]);parts.get(color).push(geo.index?geo.toNonIndexed():geo)}
 function box(c,x,y,z,w,h,d){solid(new T.BoxGeometry(w,h,d),c,x,y,z)}
 function beam(c,a,b,w){const dir=new T.Vector3(...b).sub(new T.Vector3(...a));solid(new T.BoxGeometry(w,dir.length(),w),c,...a.map((v,i)=>(v+b[i])/2),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize()))}
 const white=0xf1ddd0,shadow=0xb89591,rail=0xf5e3cc;
 box(0x605e62,0,2.9,0,110,.52,4.8);for(let x=-53;x<54;x+=2.8)box(rail,x,3.17,0,1.3,.015,.08);
 for(const z of [-2.35,2.35]){box(shadow,0,3.58,z,110,.12,.12);for(let x=-54;x<55;x+=2)box(white,x,3.38,z,.09,.55,.09)}
 for(const x of [-48,-40,-32,-24,-18,-12,12,18,24,32,40,48]){box(0x989696,x,1.25,0,1.25,3,4.6);box(0xbcb4a4,x,.12,0,2.3,.75,5.6)}
 function arch(x){return 3.25+7.3*(1-(x/12)**2)}
 for(let x=-12;x<12;x+=1.5){for(const z of [-2.2,2.2]){
 beam(white,[x,arch(x),z],[x+1.5,arch(x+1.5),z],.35);
 beam(shadow,[x,arch(x)-.65,z],[x+1.5,arch(x+1.5)-.65,z],.16);
 beam(white,[x,3.2,z],[x,arch(x),z],.12);
 beam(white,[x,arch(x)-.65,z],[x+1.5,arch(x+1.5),z],.12)}
 beam(white,[x,arch(x),-2.2],[x,arch(x),2.2],.22);beam(shadow,[x,arch(x),-2.2],[x+1.5,arch(x+1.5),2.2],.13)}
 // Low coastal bluffs leave the middle of the span open to shipping.
 for(const side of [-1,1]){
  const bluff=new T.SphereGeometry(1,64,22);
  bluff.scale(30,2.4,20);
  solid(bluff,0x736e50,side*46,-.45,1);
 }
 for(let i=0;i<48;i++){const a=i*.39,r=85+rand()*27;
  const hill=new T.SphereGeometry(1,24,12);hill.scale(13+rand()*16,2+rand()*5,10);
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
 const water=new Water(new T.PlaneGeometry(410,410),{textureWidth:512,textureHeight:512,waterNormals:normals,sunDirection:skySun,sunColor:0xffecce,waterColor:0x254f53,distortionScale:2.8});
 water.rotation.x=-Math.PI/2;water.material.uniforms.size.value=6;scene.add(water);
 for(const [color,geos] of parts){scene.add(new T.Mesh(mergeGeometries(geos),new T.MeshStandardMaterial({color,flatShading:true})));geos.forEach(g=>g.dispose())}
 new ResizeObserver(()=>{renderer.setSize(view.clientWidth,view.clientHeight,false);camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix()}).observe(view);
 function zoom(f){let off=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(off.setLength(T.MathUtils.clamp(off.length()*f,14,59)))}
 const ray=new T.Raycaster();
 function pick(event,groups){
  const r=renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new T.Vector2(2*(event.clientX-r.left)/r.width-1,1-2*(event.clientY-r.top)/r.height),camera);
  let hit=ray.intersectObjects(groups,true)[0]?.object;
  while(hit&&!groups.includes(hit))hit=hit.parent;
  return hit;
 }
 return {scene,zoom,pick,draw(){water.material.uniforms.time.value=performance.now()*.00035;controls.update();renderer.render(scene,camera)}}
}
