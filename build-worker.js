import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {extname} from 'node:path';
const types={'.txt':'text/plain','.jpg':'image/jpeg','.mp4':'video/mp4','.svg':'image/svg+xml','.js':'text/javascript','.css':'text/css','.html':'text/html'};
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
 if(path==='/api/coalition-records')return coalitionRecords(request,env.DB);
 const asset=assets[path==='/'?'/index.html':/^\\/en\\/?$/.test(path)?'/en.html':path];
 if(!Array.isArray(asset))return new Response('Not found',{status:404});
 if(asset[0]==='video/mp4'){
  const bytes=Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0)), length=bytes.length;
  const headers={'content-type':'video/mp4','accept-ranges':'bytes','cache-control':'public, max-age=3600'};
  const range=/^bytes=(\\d*)-(\\d*)$/.exec(request.headers.get('range')||'');
  if(range && (range[1] || range[2])){
   const start=range[1]?Number(range[1]):Math.max(0,length-Number(range[2]));
   const end=range[1] && range[2]?Math.min(length-1,Number(range[2])):length-1;
   if(start>end)return new Response(null,{status:416,headers:{...headers,'content-range':'bytes */'+length}});
   return new Response(request.method==='HEAD'?null:bytes.subarray(start,end+1),{status:206,headers:{...headers,'content-range':'bytes '+start+'-'+end+'/'+length,'content-length':String(end-start+1)}});
  }
  return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'content-length':String(length)}});
 }
 return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0)),{headers:{'content-type':asset[0],'cache-control':(path==='/release.txt'||asset[0]==='text/html')?'no-store':'public, max-age=3600'}});
 }};`);
