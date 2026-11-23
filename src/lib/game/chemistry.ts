// Entrosamento individual (0 a 3 por jogador), inspirado no FC. Sem linhas entre jogadores: cada um tem o seu valor.
// Fatores (pesos somam 1): posição natural, função na vaga, estilo tático do time, clube em comum com a vaga e com quem joga ao lado, e complemento entre funções.
// É um indicador do elenco (não muda o overall nem o resultado da partida).
import { roleFit, roleOf, ROLES, type Role } from '@/lib/playerRoles';
import type { Tactic } from '@/lib/multiplayer';
import type { Player, Position, Team } from '@/lib/game/types';

// Quem joga "ao lado" de quem na formação (mesmos vizinhos de antes, só que sem desenhar ligação)
export const SQUAD_LINKS: [Position, Position][] = [
  ['GK', 'LB'], ['GK', 'RB'], ['LB', 'CM'], ['RB', 'CM'], ['CM', 'LF'], ['CM', 'RF'], ['CM', 'CF'], ['LF', 'CF'], ['RF', 'CF'],
];
export const neighborsOf = (position: Position): Position[] =>
  SQUAD_LINKS.flatMap(([a, b]) => (a === position ? [b] : b === position ? [a] : []));

const fits = (player: Player, position: Position) => player.primary_position === position || (player.alternate_positions ?? []).includes(position);

// Tom de cada função: ataca, defende, constrói (posse) ou equilibra
type Tone = 'att' | 'def' | 'build' | 'bal';
const TONE: Record<string, Tone> = {
  'gk-trad': 'def', 'gk-build': 'build', 'gk-libero': 'build',
  'df-build': 'build', 'df-mark': 'def', 'df-anti': 'def', 'df-aggr': 'def',
  'mc-play': 'build', 'mc-b2b': 'bal', 'mc-hold': 'def', 'mc-inf': 'att',
  'wg-wide': 'att', 'wg-inf': 'att', 'wg-play': 'build', 'wg-bal': 'bal',
  'at-fin': 'att', 'at-f9': 'build', 'at-pivot': 'build', 'at-mobile': 'att',
};
// Tom que cada tática favorece (a lista tem o principal primeiro)
const TACTIC_TONE: Record<Tactic, Tone[]> = {
  ofensiva: ['att', 'build'], contra: ['att', 'def'], posse: ['build', 'bal'], defensiva: ['def', 'bal'], pressao: ['def', 'att'], equilibrada: ['bal', 'build', 'def', 'att'],
};
const toneFit = (role: Role, tactic: Tactic): number => {
  const list = TACTIC_TONE[tactic] ?? TACTIC_TONE.equilibrada;
  const i = list.indexOf(TONE[role.id] ?? 'bal');
  return i === 0 ? 1 : i > 0 ? 0.75 : 0.35;
};
// Funções que se complementam (uma abre espaço ou serve a outra) e funções que brigam pelo mesmo espaço
const COMPLEMENT: [string, string][] = [
  ['gk-build', 'df-build'], ['df-build', 'mc-play'], ['mc-hold', 'mc-inf'], ['mc-hold', 'df-aggr'], ['mc-play', 'wg-wide'], ['mc-play', 'at-fin'],
  ['mc-inf', 'at-pivot'], ['wg-wide', 'at-fin'], ['wg-inf', 'at-pivot'], ['wg-wide', 'at-pivot'], ['at-f9', 'wg-inf'], ['at-mobile', 'mc-play'], ['at-mobile', 'wg-wide'], ['df-mark', 'mc-hold'], ['mc-b2b', 'at-fin'], ['wg-bal', 'at-fin'],
];
const CLASH: [string, string][] = [['at-f9', 'mc-play'], ['at-f9', 'wg-play'], ['mc-inf', 'at-mobile'], ['gk-libero', 'df-aggr'], ['mc-play', 'wg-play'], ['at-pivot', 'at-f9']];
const pairHas = (list: [string, string][], a: string, b: string) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

export type ChemPart = { key: 'pos' | 'role' | 'tactic' | 'club' | 'mates'; label: string; v: number; w: number; note: string };
export type Chem = { value: 0 | 1 | 2 | 3; score: number; parts: ChemPart[]; empty?: boolean };
export type ChemCtx = { club: Team; tactic: Tactic; saved?: Parameters<typeof roleOf>[2] };

// Entrosamento de um jogador na vaga. `selected` é o time titular atual.
export function chemOf(position: Position, selected: Partial<Record<Position, Player>>, ctx: ChemCtx): Chem {
  const player = selected[position];
  if (!player) return { value: 0, score: 0, parts: [], empty: true };
  const { role } = roleOf(position, player, ctx.saved);
  const natural = fits(player, position);
  const fitRole = roleFit(player, position, role);
  const nb = neighborsOf(position).map((p) => ({ p, pl: selected[p] })).filter((x): x is { p: Position; pl: Player } => !!x.pl);
  const sameNb = nb.filter((x) => x.pl.team_id === player.team_id).length;
  const sameClub = player.team_id === ctx.club.id;
  const clubV = Math.min(1, (sameClub ? 0.45 : 0) + (nb.length ? (sameNb / nb.length) * 0.55 + (sameNb > 0 ? 0.1 : 0) : 0));
  let mates = 0.5;
  let matesNote = 'sem vizinhos definidos';
  if (nb.length) {
    const ids = nb.map((x) => roleOf(x.p, x.pl, ctx.saved).role.id);
    const good = ids.filter((id) => pairHas(COMPLEMENT, role.id, id)).length;
    const bad = ids.filter((id) => pairHas(CLASH, role.id, id)).length;
    mates = Math.max(0, Math.min(1, 0.45 + Math.min(2, good) * 0.28 - Math.min(2, bad) * 0.3));
    matesNote = good && !bad ? 'funções que se completam' : bad ? 'funções disputando o mesmo espaço' : 'funções neutras entre si';
  }
  const parts: ChemPart[] = [
    { key: 'pos', label: 'Posição', v: natural ? 1 : 0, w: 0.3, note: natural ? 'joga na posição' : 'fora da posição' },
    { key: 'role', label: 'Função', v: fitRole === 'ideal' ? 1 : fitRole === 'compativel' ? 0.65 : 0.3, w: 0.12, note: fitRole === 'ideal' ? 'função ideal' : fitRole === 'compativel' ? 'função compatível' : 'função alternativa' },
    { key: 'tactic', label: 'Tática', v: toneFit(role, ctx.tactic), w: 0.13, note: 'combina com o estilo do time' },
    { key: 'club', label: 'Clube', v: clubV, w: 0.3, note: sameClub ? 'do seu clube' : 'clube diferente' },
    { key: 'mates', label: 'Companheiros', v: mates, w: 0.15, note: matesNote },
  ];
  const score = parts.reduce((s, x) => s + x.v * x.w, 0);
  return { value: Math.max(0, Math.min(3, Math.round(score * 3))) as 0 | 1 | 2 | 3, score, parts };
}
export const chemTitle = (c: Chem): string =>
  c.empty ? '' : `Entrosamento ${c.value}/3\n` + c.parts.map((x) => `${x.label}: ${Math.round(x.v * 100)}% (${x.note})`).join('\n');
