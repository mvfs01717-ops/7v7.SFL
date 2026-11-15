// Técnico: troca de tática no meio do jogo e gritos à beira do campo (só contra o bot).
import { TACTICS, TACTIC_INFO, TACTIC_QUALITY, TACTIC_SHOTS, type Tactic } from '@/lib/multiplayer';
import type { PlanEntry } from '@/lib/game/helpers';

export { TACTICS, TACTIC_INFO };
export const SWITCH_COST = 3; // pontos de fôlego perdidos por todo o time ao mudar de estilo (o time se reorganiza)
export const SHOUTS_PER_MATCH = 3;
export const SHOUT_MINUTES = 6;

export type Shout = 'motivar' | 'acalmar' | 'atacar';
export const SHOUT_INFO: Record<Shout, { label: string; icon: string; text: string; toast: string }> = {
  motivar: { label: 'Motivar', icon: '📣', text: 'Time ganha gás e finaliza com mais pontaria por 6 min.', toast: 'O técnico motiva o time!' },
  acalmar: { label: 'Acalmar', icon: '🧊', text: 'Segura o jogo: o rival chega menos, mas você ataca menos por 6 min.', toast: 'O técnico pede calma e posse de bola.' },
  atacar: { label: 'Mandar atacar', icon: '🔥', text: 'Time vai pra cima por 6 min, mas deixa espaço atrás.', toast: 'O técnico manda o time atacar!' },
};

type RNG = () => number;
const entry = (e: PlanEntry, type: PlanEntry['type']): PlanEntry => ({ ...e, type, ...(type === 'posse' ? { shooter: undefined, keeper: undefined } : {}) });

// Muda o plano dali em diante conforme a diferença entre o estilo antigo e o novo
export function retuneForTactic(plan: PlanEntry[], from: number, oldT: Tactic, newT: Tactic, rng: RNG = Math.random): PlanEntry[] {
  const dOwn = TACTIC_SHOTS[newT].own - TACTIC_SHOTS[oldT].own;
  const dCon = TACTIC_SHOTS[newT].conceded - TACTIC_SHOTS[oldT].conceded;
  const dQ = TACTIC_QUALITY[newT] - TACTIC_QUALITY[oldT];
  return plan.map((e) => {
    if (e.minute <= from) return e;
    if (e.side === 'user') {
      if (dOwn > 0 && e.type === 'posse' && rng() < dOwn * 0.04) return entry(e, 'finalização');
      if (dOwn < 0 && e.type === 'finalização' && rng() < -dOwn * 0.05) return entry(e, 'posse');
      if (dQ > 0 && e.type === 'defesa' && rng() < dQ * 0.8) return entry(e, 'gol');
      if (dQ < 0 && e.type === 'gol' && rng() < -dQ * 0.8) return entry(e, 'defesa');
    } else {
      if (dCon > 0 && e.type === 'posse' && rng() < dCon * 0.04) return entry(e, 'finalização');
      if (dCon < 0 && e.type === 'finalização' && rng() < -dCon * 0.05) return entry(e, 'posse');
    }
    return e;
  });
}

// O grito vale só para os próximos SHOUT_MINUTES minutos do plano
export function applyShout(plan: PlanEntry[], from: number, shout: Shout, rng: RNG = Math.random): PlanEntry[] {
  return plan.map((e) => {
    if (e.minute <= from || e.minute > from + SHOUT_MINUTES) return e;
    if (shout === 'motivar') {
      if (e.side === 'user' && e.type === 'finalização' && rng() < 0.4) return entry(e, 'defesa');
      if (e.side === 'user' && e.type === 'defesa' && rng() < 0.08) return entry(e, 'gol');
    } else if (shout === 'acalmar') {
      if (e.side === 'bot' && e.type === 'finalização' && rng() < 0.4) return entry(e, 'posse');
      if (e.side === 'bot' && e.type === 'gol' && rng() < 0.12) return entry(e, 'defesa');
      if (e.side === 'user' && e.type === 'finalização' && rng() < 0.25) return entry(e, 'posse');
    } else {
      if (e.side === 'user' && e.type === 'posse' && rng() < 0.5) return entry(e, 'finalização');
      if (e.side === 'bot' && e.type === 'defesa' && rng() < 0.12) return entry(e, 'gol');
      if (e.side === 'bot' && e.type === 'posse' && rng() < 0.2) return entry(e, 'finalização');
    }
    return e;
  });
}
// Ajuste imediato de fôlego do grito (pontos; negativo recupera)
export const SHOUT_STAMINA: Record<Shout, number> = { motivar: -3, acalmar: -1, atacar: 2 };
