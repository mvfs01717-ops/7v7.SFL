// Camisa reserva automática: se as cores dos dois times são parecidas demais, o visitante troca de camisa.
type KitTeam = { name: string; abbreviation: string; primary_color: string; secondary_color: string };

function rgb(hex: string): [number, number, number] {
  const v = (hex || '#888888').replace('#', '');
  const n = parseInt(v.length === 3 ? v.replace(/(.)/g, '$1$1') : v.padEnd(6, '8').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Distância de cor "redmean" (barata e boa o bastante para camisas): ~0 igual, > 200 bem diferente
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
export const SIMILAR_BELOW = 150;

export function pickKits<T extends KitTeam>(club: T, opponent: T, home: 'user' | 'bot') {
  if (colorDistance(club.primary_color, opponent.primary_color) >= SIMILAR_BELOW) return { club, opponent, away: null as 'user' | 'bot' | null };
  const awaySide = home === 'user' ? 'bot' : 'user';
  const homeTeam = home === 'user' ? club : opponent;
  const away = awaySide === 'user' ? club : opponent;
  const asAlt = (team: T): T => {
    // 1) camisa com as cores trocadas
    if (colorDistance(team.secondary_color, homeTeam.primary_color) >= SIMILAR_BELOW) return { ...team, primary_color: team.secondary_color, secondary_color: team.primary_color };
    // 2) camisa branca ou preta (a que mais contrasta com a do mandante), mantendo a cor do time como detalhe
    const candidates = ['#f4f4f4', '#15181c'];
    const best = candidates.sort((x, y) => colorDistance(y, homeTeam.primary_color) - colorDistance(x, homeTeam.primary_color))[0];
    return { ...team, primary_color: best, secondary_color: team.primary_color };
  };
  const swapped = asAlt(away);
  return awaySide === 'user' ? { club: swapped, opponent, away: awaySide as 'user' | 'bot' | null } : { club, opponent: swapped, away: awaySide as 'user' | 'bot' | null };
}
