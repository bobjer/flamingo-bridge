import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {extname} from 'node:path';
const types={'.jpg':'image/jpeg','.svg':'image/svg+xml','.js':'text/javascript','.css':'text/css','.html':'text/html'};
const assets={};
for(const path of await readdir('dist',{recursive:true})){
 const type=types[extname(path)];
 if(type)assets['/'+path]=[type,(await readFile('dist/'+path)).toString('base64')];
}
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js',(await readFile('records-worker.js','utf8'))+
 '\nconst assets='+JSON.stringify(assets)+';\n'+
 `export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/records')return records(request,env.DB);
 const asset=assets[path==='/'?'/index.html':/^\\/en\\/?$/.test(path)?'/en.html':path];
 if(!Array.isArray(asset))return new Response('Not found',{status:404});
 return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0)),{headers:{'content-type':asset[0]}});
 }};`);
