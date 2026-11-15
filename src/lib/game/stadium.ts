// Estádio de cada clube: o time da casa define o desenho do gramado, o mosaico da arquibancada e se o estádio tem cobertura.
// Tudo sai da sigla do clube, então o mesmo clube sempre joga no mesmo estádio. Os nomes são genéricos ("Arena X").

export type MowPattern = 'stripes' | 'wide' | 'bands' | 'checker' | 'diamond';
export type SeatPattern = 'stripes' | 'chevron' | 'blocks' | 'checker';
export type Stadium = { name: string; mow: MowPattern; seats: SeatPattern; roof: boolean; grassA: string; grassB: string };

const MOWS: MowPattern[] = ['stripes', 'wide', 'bands', 'checker', 'diamond'];
const SEATS: SeatPattern[] = ['stripes', 'chevron', 'blocks', 'checker'];
const GRASS: [string, string][] = [
  ['#0f4425', '#14562f'],
  ['#0e4a2a', '#176034'],
  ['#144a22', '#1d5c2c'],
  ['#0d3f2b', '#12533a'],
];

function hash(text: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function stadiumFor(team: { name: string; abbreviation: string }): Stadium {
  const key = team.abbreviation || team.name;
  const grass = GRASS[hash(key, 4) % GRASS.length];
  return {
    name: `Arena ${team.name}`,
    mow: MOWS[hash(key, 1) % MOWS.length],
    seats: SEATS[hash(key, 2) % SEATS.length],
    roof: hash(key, 3) % 3 !== 0,
    grassA: grass[0],
    grassB: grass[1],
  };
}

// Mistura duas cores #rrggbb (t = 0 devolve a, t = 1 devolve b)
export function mixHex(a: string, b: string, t = 0.5): string {
  const parse = (hex: string) => {
    const v = hex.replace('#', '');
    const n = parseInt(v.length === 3 ? v.replace(/(.)/g, '$1$1') : v, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}
