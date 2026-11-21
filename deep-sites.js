// Unique 3D base model per Deepstrike site, indexed like `names` in deepstrike.js:
// 0 Oil works, 1 Power station, 2 Depot, 3 Market, 4 Airfield, 5 Jammer,
// 6 Data centre, 7 Port, 8 Air defence, 9 Factory, 10 Substation, 11 Launcher.
//
// Every builder has the signature (seed:number) => SiteModel:
//  {
//    group: THREE.Group,          // origin at ground level, site centred on x/z = 0, about 90 x 70 units
//    radius: number,              // footprint radius, used to frame cameras
//    aim: THREE.Vector3,          // point the drone dives onto
//    fireSpots: THREE.Vector3[],  // where flames/smoke should burn after a hit, most important first
//    applyDamage(severity),       // severity 1|2|3 mutates meshes (collapse, tilt, scorch); idempotent per call order 1<2<3
//    dispose()                    // free geometries/materials created by the builder
//  }
import {builders as first} from './deep-sites-a.js';
import {builders as second} from './deep-sites-b.js';

const builders = [...first, ...second];
export const siteCount = builders.length;

// Site geometry and the parts affected at each level stay fixed across waves.
export const siteLayoutSeed = index => Math.imul(index + 1, 2654435761) >>> 0;
export const siteDamageLevel = damage => Math.min(3, Math.max(0, Math.ceil(damage / 28)));
export function buildSite(index, seed = 1) {
  return builders[index % builders.length](seed);
}
