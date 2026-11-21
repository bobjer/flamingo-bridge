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
  let row; try{row=await readSmallJson(request)}catch(status){return reply({},Number.isInteger(status)?status:400)}
  const name=typeof row?.name==='string'?row.name.trim():'';
  if(!name||name.length>24||/[\u0000-\u001f\u007f]/u.test(name)||!uuid.test(row.id)||
     ![row.wave,row.score].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e7)||row.wave<1||(row.assisted!==undefined&&typeof row.assisted!=='boolean'))return reply({},400);
  const verified=await verifiedFinish(request,db,row.id,difficulty,row.wave,row.score,row.assisted);
  if(verified!==200)return reply({},verified);
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
  let row; try{row=await readSmallJson(request)}catch(status){return reply({},Number.isInteger(status)?status:400)}
  const name=typeof row?.name==='string'?row.name.trim():'';
  if(!name||name.length>24||/[\u0000-\u001f\u007f]/u.test(name)||!uuid.test(row.id)||
     ![row.waves,row.views,row.combo].every(n=>Number.isSafeInteger(n)&&n>=0)||row.waves<1||row.waves>1e4||row.combo>1e5||row.views>1e12||row.views>row.waves*1e9||(row.assisted!==undefined&&typeof row.assisted!=='boolean'))return reply({},400);
  const verified=await verifiedFinish(request,db,row.id,'coalition',row.waves,row.views,row.assisted);
  if(verified!==200)return reply({},verified);
  await db.prepare('INSERT INTO coalition_records (id,name,waves,views,combo,assisted) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(row.id,name,row.waves,row.views,row.combo,row.assisted?1:0).run();
 }else if(request.method!=='GET')return reply({},405);
 const {results}=await db.prepare('SELECT name,waves,views,combo,assisted FROM coalition_records ORDER BY views DESC,waves DESC,rowid LIMIT 10').all();
 return reply(results.map(r=>({...r,assisted:!!r.assisted})));
}

async function readSmallJson(request) {
 if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw 415;
 if (Number(request.headers.get('content-length')) > 2048) throw 413;
 const reader = request.body?.getReader();
 if (!reader) throw 400;
 const bytes = new Uint8Array(2048);
 let size = 0;
 for (;;) {
  const {done,value} = await reader.read();
  if (done) break;
  if (size + value.length > bytes.length) { await reader.cancel(); throw 413 }
  bytes.set(value,size); size += value.length;
 }
 try { return JSON.parse(new TextDecoder().decode(bytes.subarray(0,size))) } catch { throw 400 }
}

// Use the edge-supplied address, never a caller-provided forwarding chain.
// A new bucket has a new digest; no plaintext network addresses are stored.
async function withinQuota(request, db, kind, limit) {
 const bucket = Math.floor(Date.now()/600000);
 const address = request.headers.get('cf-connecting-ip') || 'unknown';
 const bytes = new TextEncoder().encode([bucket,kind,address].join('|'));
 const key = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 const result = await db.prepare('INSERT INTO ranked_limits(key,bucket,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<?').bind(key,bucket,limit).run();
 if (Math.random()<.01) {
  await db.batch([db.prepare('DELETE FROM ranked_limits WHERE bucket<?').bind(bucket-1),
   db.prepare('DELETE FROM ranked_runs WHERE updated<?').bind(Date.now()-30*86400000)]);
 }
 return result.meta.changes === 1;
}

const waveAllowance = (boardName,wave) => boardName==='coalition' ? 50000000 : 200+20*wave;
export async function rankedWave(request,db) {
 if(request.method!=='POST')return reply({},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({},403);
 let row; try{row=await readSmallJson(request)}catch(status){return reply({},Number.isInteger(status)?status:400)}
 if (!row || !uuid.test(row.id) || !(row.board==='coalition'||board.test(row.board)) ||
   !Number.isSafeInteger(row.wave)||row.wave<1||row.wave>10000||!Number.isSafeInteger(row.score)||row.score<0||typeof row.assisted!=='boolean') return reply({},400);
 if (!await withinQuota(request,db,'progress',300)) return reply({},429);
 const now=Date.now();
 if(row.wave===1 && row.score===0){
  if(!await withinQuota(request,db,'start',40))return reply({},429);
  await db.prepare('INSERT OR IGNORE INTO ranked_runs VALUES(?,?,1,0,?,?,?)').bind(row.id,row.board,+row.assisted,now,now).run();
 }
 // Only a sequential wave can advance the score. Same-wave retries preserve its baseline.
 const changed=await db.prepare(`UPDATE ranked_runs SET
  score=CASE WHEN wave<? THEN ? ELSE score END, wave=?, assisted=MAX(assisted,?),updated=?
  WHERE id=? AND board=? AND (wave=? OR (wave=? AND ? BETWEEN score AND score+? AND ?-started >= (? - 2)*1000))`)
  .bind(row.wave,row.score,row.wave,+row.assisted,now,row.id,row.board,row.wave,row.wave-1,row.score,waveAllowance(row.board,row.wave),now,row.wave).run();
 return reply({},changed.meta.changes?200:403);
}

async function verifiedFinish(request,db,id,boardName,wave,score,assisted) {
 if(!await withinQuota(request,db,'finish',20))return 429;
 const run=await db.prepare('SELECT wave,score,assisted,started FROM ranked_runs WHERE id=? AND board=?').bind(id,boardName).first();
 if(!run||wave!==run.wave||score<run.score||score-run.score>waveAllowance(boardName,wave)||
    Date.now()-run.started<Math.max(1,wave-2)*1000||(run.assisted&&!assisted))return 403;
 return 200;
}
