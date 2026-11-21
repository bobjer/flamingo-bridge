import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';
const release=randomUUID();
export default defineConfig({
 define:{__GAME_RELEASE__:JSON.stringify(release)},
 plugins:[{name:'game-release',generateBundle(){for(const name of ['LICENSE','NOTICE']) this.emitFile({type:'asset',fileName:name.toLowerCase()+'.txt',source:readFileSync(new URL('./'+name,import.meta.url),'utf8')});this.emitFile({type:'asset',fileName:'release.txt',source:release})}}],
 build:{rolldownOptions:{input:{uk:'index.html',en:'en.html'}}}
});
