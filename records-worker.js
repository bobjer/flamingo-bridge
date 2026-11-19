// A board is a difficulty, optionally tagged with the date of a daily raid: normal:2026-11-19.
const board = /^(easy|normal|hard)(?::(\d{4}-\d{2}-\d{2}))?$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reply = (data,status=200) => Response.json(data,{status,headers:{'cache-control':'no-store'}});
export async function records(request, db) {
 const url=new URL(request.url), difficulty=url.searchParams.get('difficulty');
 const tag=board.exec(difficulty??'');
 if(!tag)return reply({},400);
 if(request.method==='POST'){
  if(request.headers.get('origin')!==url.origin)return reply({},403);
  // daily boards only take fresh runs: today or the last two days, to cover time zones and long sessions
  if(tag[2]){const age=(Date.now()-Date.parse(tag[2]+'T00:00:00Z'))/864e5;if(!(age>-1.2&&age<3))return reply({},400)}
  let row; try{row=await request.json()}catch{return reply({},400)}
  const name=typeof row?.name==='string'?row.name.trim():'';
  if(!name||name.length>24||/[\u0000-\u001f\u007f]/u.test(name)||!uuid.test(row.id)||
     ![row.wave,row.score].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e7)||row.wave<1)return reply({},400);
  await db.prepare('INSERT INTO records (id,name,difficulty,wave,score,assisted) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(row.id,name,difficulty,row.wave,row.score,Number(row.assisted===true)).run();
 }else if(request.method!=='GET')return reply({},405);
 const {results}=await db.prepare('SELECT name,wave,score,assisted FROM records WHERE difficulty=? ORDER BY wave DESC,score DESC,rowid LIMIT 10').bind(difficulty).all();
 return reply(results);
}

// Coalition arcade leaderboard: its own table, ranked by views.
export async function coalitionRecords(request, db) {
 const url=new URL(request.url);
 if(request.method==='POST'){
  if(request.headers.get('origin')!==url.origin)return reply({},403);
  let row; try{row=await request.json()}catch{return reply({},400)}
  const name=typeof row?.name==='string'?row.name.trim():'';
  if(!name||name.length>24||/[\u0000-\u001f\u007f]/u.test(name)||!uuid.test(row.id)||
     ![row.waves,row.views,row.combo].every(n=>Number.isSafeInteger(n)&&n>=0)||row.waves<1||row.waves>1e4||row.combo>1e5||row.views>1e12||row.views>row.waves*1e9||(row.assisted!==undefined&&typeof row.assisted!=='boolean'))return reply({},400);
  await db.prepare('INSERT INTO coalition_records (id,name,waves,views,combo,assisted) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(row.id,name,row.waves,row.views,row.combo,row.assisted?1:0).run();
 }else if(request.method!=='GET')return reply({},405);
 const {results}=await db.prepare('SELECT name,waves,views,combo,assisted FROM coalition_records ORDER BY views DESC,waves DESC,rowid LIMIT 10').all();
 return reply(results.map(r=>({...r,assisted:!!r.assisted})));
}
