// Share card: a 1080x1350 PNG drawn on a canvas in the bridge-HUD style.
import {tr} from './language.js';
import {fmtViews, caption} from './coalition-copy.js';

const W = 1080, H = 1350, ACCENT = '#ff9a1f', MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace', DISPLAY = '"Space Grotesk", "Arial Narrow", Arial, sans-serif';
const FRAME = { x: 40, y: 150, w: 1000, h: 450 };

function wrap(ctx, text, maxWidth) {
 const words = text.split(/\s+/), rows = []; let row = '';
 for (const word of words) {
  const next = row ? row + ' ' + word : word;
  if (ctx.measureText(next).width > maxWidth && row) { rows.push(row); row = word } else row = next;
 }
 if (row) rows.push(row);
 return rows;
}
function brackets(ctx, x, y, w, h, size = 36) {
 ctx.strokeStyle = ACCENT; ctx.lineWidth = 4; ctx.beginPath();
 for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.moveTo(cx + dx * size, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * size) }
 ctx.stroke();
}
// The 3D canvas snapshot (data URL) from world.snapshot().
async function frameImage(url) {
 if (!url) return null;
 try { const img = new Image(); img.src = url; await img.decode(); return img } catch { return null }
}

export async function drawShareCard(s, shot = {}) {
 await document.fonts?.ready;
 const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
 const ctx = canvas.getContext('2d');
 ctx.fillStyle = '#070b10'; ctx.fillRect(0, 0, W, H);
 ctx.strokeStyle = 'rgba(125,143,161,.08)'; ctx.lineWidth = 1;
 for (let x = 0; x < W; x += 54) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
 for (let y = 0; y < H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
 // header
 ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
 ctx.fillStyle = '#d9e1e8'; ctx.font = '700 54px ' + DISPLAY; ctx.fillText(tr('СЕЗОН ХЛОПКІВ', 'POP SEASON'), 40, 88);
 ctx.fillStyle = '#6f7f8f'; ctx.font = '500 24px ' + MONO; ctx.fillText(tr('КОАЛІЦІЯ ОХОЧИХ', 'COALITION OF THE WILLING'), 40, 124);
 // the feed
 ctx.save(); ctx.beginPath(); ctx.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h); ctx.clip();
 ctx.fillStyle = '#0a141c'; ctx.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
 const img = await frameImage(shot.image);
 if (img) { // cover-fit the 3D frame into the card
  const k = Math.max(FRAME.w / img.width, FRAME.h / img.height), w = img.width * k, h = img.height * k;
  ctx.filter = shot.thermal ? 'grayscale(1) contrast(1.7) brightness(1.15)' : 'saturate(.85) contrast(1.12)';
  ctx.drawImage(img, FRAME.x + (FRAME.w - w) / 2, FRAME.y + (FRAME.h - h) / 2, w, h); ctx.filter = 'none';
 }
 for (let y = FRAME.y; y < FRAME.y + FRAME.h; y += 4) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(FRAME.x, y, FRAME.w, 1.5) }
 const vignette = ctx.createRadialGradient(FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h / 2, FRAME.h * .35, FRAME.x + FRAME.w / 2, FRAME.y + FRAME.h / 2, FRAME.w * .6);
 vignette.addColorStop(0, 'rgba(4,8,12,0)'); vignette.addColorStop(1, 'rgba(4,8,12,.7)');
 ctx.fillStyle = vignette; ctx.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
 ctx.restore();
 // OSD
 const osd = (text, x, y, align = 'left') => {
  ctx.font = '500 24px ' + MONO; const width = ctx.measureText(text).width + 28;
  const left = align === 'left' ? x : x - width;
  ctx.fillStyle = 'rgba(7,11,16,.72)'; ctx.fillRect(left, y, width, 44); ctx.strokeStyle = 'rgba(125,143,161,.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(left, y, width, 44);
  ctx.fillStyle = '#d9e1e8'; ctx.textAlign = 'left'; ctx.fillText(text, left + 14, y + 31);
  return left;
 };
 const left = osd('   ' + (shot.label || tr('ДАЛЬНЯ КАМЕРА', 'FAR CAM')), FRAME.x + 24, FRAME.y + 24);
 ctx.fillStyle = '#ff3b30'; ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(left + 24, FRAME.y + 46, 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
 osd(shot.thermal ? 'WHITE-HOT' : 'REC · LQ 88', FRAME.x + FRAME.w - 24, FRAME.y + 24, 'right');
 osd('45°18′N 36°30′E', FRAME.x + 24, FRAME.y + FRAME.h - 68);
 if (shot.assisted) osd(tr('АВТОГРА', 'AUTOPLAY'), FRAME.x + FRAME.w - 24, FRAME.y + FRAME.h - 68, 'right');
 ctx.strokeStyle = 'rgba(42,56,70,1)'; ctx.lineWidth = 2; ctx.strokeRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
 brackets(ctx, FRAME.x, FRAME.y, FRAME.w, FRAME.h);
 // the big number
 ctx.textAlign = 'center';
 ctx.fillStyle = '#6f7f8f'; ctx.font = '500 30px ' + MONO; ctx.fillText(tr('ПЕРЕГЛЯДІВ', 'VIEWS'), W / 2, 680);
 ctx.fillStyle = ACCENT; ctx.shadowColor = 'rgba(255,154,31,.45)'; ctx.shadowBlur = 40;
 let size = 230; const text = fmtViews(s.views);
 ctx.font = '700 ' + size + 'px ' + MONO; while (ctx.measureText(text).width > W - 120 && size > 80) { size -= 10; ctx.font = '700 ' + size + 'px ' + MONO }
 ctx.fillText(text, W / 2, 870); ctx.shadowBlur = 0;
 // stats
 const tiles = [[tr('ХВИЛЬ', 'WAVES'), String(s.wave)], [tr('КОМБО', 'COMBO'), '×' + s.bestCombo], [tr('ВТОМА ДОНОРІВ', 'DONOR FATIGUE'), Math.round((1 - s.fatigue) * 100) + '%']];
 tiles.forEach(([label, value], i) => {
  const x = 40 + i * 340, w = 320;
  ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(x, 920, w, 150); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 2; ctx.strokeRect(x, 920, w, 150);
  ctx.fillStyle = '#6f7f8f'; ctx.font = '500 22px ' + MONO; ctx.fillText(label, x + w / 2, 962);
  ctx.fillStyle = '#d9e1e8'; ctx.font = '700 70px ' + MONO; ctx.fillText(value, x + w / 2, 1042);
 });
 // caption
 ctx.fillStyle = '#d9e1e8'; ctx.font = '600 42px ' + DISPLAY;
 wrap(ctx, caption(s), W - 140).slice(0, 4).forEach((row, i) => ctx.fillText(row, W / 2, 1140 + i * 54));
 // footer
 ctx.fillStyle = '#6f7f8f'; ctx.font = '500 22px ' + MONO;
 ctx.fillText('POP SEASON · ' + tr('КОАЛІЦІЯ ОХОЧИХ', 'COALITION OF THE WILLING') + ' · ' + location.host, W / 2, 1316);
 ctx.fillStyle = ACCENT; ctx.fillRect(W / 2 - 120, 1286, 240, 3);
 return canvas;
}

// Native share sheet with the PNG when the browser can, otherwise a plain download.
export async function shareRun(s, shot) {
 const canvas = await drawShareCard(s, shot);
 const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
 if (!blob) throw Error('no image');
 const file = new File([blob], 'pop-season-coalition.png', { type: 'image/png' });
 const text = caption(s);
 if (navigator.canShare?.({ files: [file] })) {
  try { await navigator.share({ files: [file], title: tr('Сезон хлопків', 'Pop Season'), text }); return 'shared' }
  catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
 }
 const link = document.createElement('a');
 link.href = URL.createObjectURL(blob); link.download = file.name; document.body.append(link); link.click(); link.remove();
 setTimeout(() => URL.revokeObjectURL(link.href), 4000);
 return 'downloaded';
}
