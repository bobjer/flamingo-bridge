const difficulties = new Set(['easy', 'normal', 'hard']);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reply = (data,status=200) => Response.json(data,{status,headers:{'cache-control':'no-store'}});
export async function records(request, db) {
 const url=new URL(request.url), difficulty=url.searchParams.get('difficulty');
 if(!difficulties.has(difficulty))return reply({},400);
 if(request.method==='POST'){
  if(request.headers.get('origin')!==url.origin)return reply({},403);
  let row; try{row=await request.json()}catch{return reply({},400)}
  const name=typeof row?.name==='string'?row.name.trim():'';
  if(!name||name.length>24||/[\u0000-\u001f\u007f]/u.test(name)||!uuid.test(row.id)||
     ![row.wave,row.score].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e7)||row.wave<1)return reply({},400);
  await db.prepare('INSERT INTO records VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(row.id,name,difficulty,row.wave,row.score).run();
 }else if(request.method!=='GET')return reply({},405);
 const {results}=await db.prepare('SELECT name,wave,score FROM records WHERE difficulty=? ORDER BY wave DESC,score DESC,rowid LIMIT 10').bind(difficulty).all();
 return reply(results);
}
