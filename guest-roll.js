export function pickGuest(wave, seen, random = Math.random) {
  if (wave < 3) return '';
  if (wave >= 5 && !seen.includes('trump')) return 'trump';
  if (wave >= 6 && !seen.includes('musk')) return 'musk';
  const roll = random();
  return roll < .20 ? 'trump' : roll < .45 ? 'musk' : '';
}
