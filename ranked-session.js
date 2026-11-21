// Serialize checkpoints so finishing a short wave cannot overtake its registration.
let pending = Promise.resolve(), last = '';
export function checkpoint(id, board, wave, score, assisted) {
 if (!id || !wave) return;
 const key = JSON.stringify([id,board,wave,!!assisted]);
 if (key === last) return;
 last = key;
 pending = pending.then(async () => {
  const response = await fetch('/api/ranked-wave', {method:'POST', headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id, board, wave, score, assisted:!!assisted})});
  if (!response.ok) throw Error();
 }).catch(() => { if (last === key) last = '' });
}
export function checkpointsSent() { return pending }
