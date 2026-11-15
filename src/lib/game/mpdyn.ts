// Mudanças ao vivo no multiplayer (troca de estilo, gritos do técnico e jogadas ensaiadas).
// Cada jogador grava seus pedidos na própria coluna da sala (chave `_a`); quem decide o resultado é SÓ o anfitrião,
// que altera os lances futuros do plano e grava de volta. Assim os dois lados (e quem assiste) veem exatamente o mesmo jogo.
import type { PlanItem, Squad, Tactic } from '@/lib/multiplayer';
import { applyShout, retuneForTactic, type Shout } from '@/lib/game/coach';
import { pickSetPieceMinutes, type SetKind } from '@/lib/game/setpiece';
import type { PlanEntry } from '@/lib/game/helpers';

export type Req = { id: string; k: 'tac' | 'shout' | 'sp'; v: string; m: number; e: number };

// O anfitrião só mexe em lances que estão a mais de MP_LEAD minutos de jogo à frente (a internet precisa de tempo para chegar)
export const MP_LEAD = 8;
// Estilo e grito entram em vigor MP_DELAY minutos de jogo depois do pedido (para os dois lados mostrarem a mesma coisa)
export const MP_DELAY = 9;
// A escolha da jogada ensaiada abre MP_SP_OPEN minutos antes da bola parada e fecha MP_LEAD antes
export const MP_SP_OPEN = 18;

export function decodeReqs(squad: Squad | null | undefined): Req[] {
  try {
    const list = JSON.parse(squad?._a ?? '[]') as Req[];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string' && (r.k === 'tac' || r.k === 'shout' || r.k === 'sp')) : [];
  } catch {
    return [];
  }
}
export const encodeReqs = (list: Req[]) => JSON.stringify(list.slice(-30));

// Sorteio com semente (mesmo resultado em todos os aparelhos para a mesma sala)
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bolas paradas de cada lado nesta sala (3 para cada), iguais para todos
export function mpSetPieces(roomId: string): { host: { m: number; kind: SetKind }[]; guest: { m: number; kind: SetKind }[] } {
  const rng = seeded(`sp:${roomId}`);
  const { user, bot } = pickSetPieceMinutes([], 3, 3, rng);
  const kind = (side: string, m: number): SetKind => (seeded(`k:${roomId}:${side}:${m}`)() < 0.55 ? 'escanteio' : 'falta');
  return { host: user.map((m) => ({ m, kind: kind('host', m) })), guest: bot.map((m) => ({ m, kind: kind('guest', m) })) };
}

const other = (side: 'host' | 'guest') => (side === 'host' ? 'guest' : 'host');
function viaEntries(items: PlanItem[], own: 'host' | 'guest', fn: (entries: PlanEntry[]) => PlanEntry[]): PlanItem[] {
  const entries = items.map((i) => ({ ...i, side: i.side === own ? 'user' : 'bot' })) as unknown as PlanEntry[];
  return fn(entries).map((e) => ({ ...e, side: e.side === 'user' ? own : other(own) })) as unknown as PlanItem[];
}
export const retuneItems = (items: PlanItem[], from: number, own: 'host' | 'guest', oldT: Tactic, newT: Tactic, rng: () => number) => viaEntries(items, own, (e) => retuneForTactic(e, from, oldT, newT, rng));
export const shoutItems = (items: PlanItem[], from: number, own: 'host' | 'guest', shout: Shout, rng: () => number) => viaEntries(items, own, (e) => applyShout(e, from, shout, rng));
