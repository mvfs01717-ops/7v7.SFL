import { type MatchEvent, type Player, type Position } from '@/lib/game/types';

export function average(players: Player[]) {
  return players.length
    ? Math.round(players.reduce((sum, player) => sum + player.overall, 0) / players.length)
    : 0;
}

export function colorForOverall(overall: number) {
  return overall >= 90 ? 'special' : overall >= 75 ? 'gold' : overall >= 65 ? 'silver' : 'bronze';
}

export const slotOf = (player: Player): Position => player.slot ?? player.primary_position;

export function getPlayerPositions(player: Player) {
  return [player.primary_position, ...(player.alternate_positions ?? [])];
}

// Escolhe quem finaliza o lance. Gol favorece muito os atacantes de overall alto;
// finalização comum é mais equilibrada. `roll` vai de 0 a 1.
export function pickShooter(team: Player[], type: MatchEvent['type'], roll: number): Player | undefined {
  const attackers = team.filter((player) => ['LF', 'RF', 'CF'].includes(slotOf(player)));
  const pool = attackers.length ? attackers : team.filter((player) => slotOf(player) !== 'GK');
  if (!pool.length) return team[0];
  const power = type === 'gol' ? 6 : 2;
  const weights = pool.map((player) => Math.pow(Math.max(player.overall, 1) / 50, power));
  let left = roll * weights.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < pool.length; i += 1) {
    left -= weights[i];
    if (left <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Sorteio ponderado a partir de um número `roll` entre 0 e 1 (assim dá o mesmo resultado nos dois lados do multiplayer)
export function pickByRoll(list: Player[], weight: (player: Player) => number, roll: number): Player | undefined {
  if (!list.length) return undefined;
  let left = roll * list.reduce((sum, player) => sum + weight(player), 0);
  for (const player of list) {
    left -= weight(player);
    if (left <= 0) return player;
  }
  return list[list.length - 1];
}

// Chance de uma partida contra o bot terminar empatada e ir para os pênaltis (0.4 = 40%)
export const SHOOTOUT_CHANCE = 0.4;

// Tempo da animação da escalação do rival antes da bola rolar (o modo espectador desconta isso do relógio)
export const LINEUP_REVEAL_MS = 9000;

// Intervalo entre os tempos (animação dos jogadores saindo e voltando) e transição para os pênaltis
export const HALFTIME_MS = 6200;

// Intervalo com trocas: saída dos jogadores + placar (BREAK), painel de trocas (sem limite) e volta dos jogadores (RETURN)
export const HT_BREAK_MS = 4200;

export const HT_RETURN_MS = 4300;

export const HT_RETURN_NO_SUBS_MS = 3600;

export const PENALTY_PREP_MS = 4500;

// Cada minuto da partida (e cada minuto de acréscimo) dura 900 ms
export const MINUTE_MS = 900;

export type PlanEntry = {
  minute: number;
  type: MatchEvent['type'];
  side: 'user' | 'bot';
  // Nomes sorteados pelo anfitrião em generatePlan (iguais para os dois lados e para quem assiste)
  shooter?: string;
  keeper?: string;
};

// Ajusta o plano da partida para terminar empatado: tira gols de quem ganharia
// ou transforma um chute do outro time em gol, até os placares ficarem iguais.
export function forceDrawPlan(plan: PlanEntry[]): PlanEntry[] {
  const out = plan.map((item) => ({ ...item }));
  const count = (side: 'user' | 'bot') => out.filter((item) => item.type === 'gol' && item.side === side).length;
  let guard = 0;
  while (count('user') !== count('bot') && guard < 40) {
    guard += 1;
    const lead: 'user' | 'bot' = count('user') > count('bot') ? 'user' : 'bot';
    const trail: 'user' | 'bot' = lead === 'user' ? 'bot' : 'user';
    const lowerable = out.filter((item) => item.type === 'gol' && item.side === lead);
    const raisable = out.filter(
      (item) => item.side === trail && (item.type === 'defesa' || item.type === 'finalização'),
    );
    if (raisable.length && Math.random() < 0.5) {
      raisable[Math.floor(Math.random() * raisable.length)].type = 'gol';
    } else if (lowerable.length) {
      lowerable[Math.floor(Math.random() * lowerable.length)].type = 'defesa';
    }
  }
  return out;
}

// Média de overall de um grupo de posições do time
export function groupAverage(squad: Partial<Record<Position, Player>>, group: Position[]) {
  const list = group.map((position) => squad[position]).filter(Boolean) as Player[];
  return list.length ? Math.round(list.reduce((sum, player) => sum + player.overall, 0) / list.length) : 0;
}
