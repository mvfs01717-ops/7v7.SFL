import { supabase } from '@/lib/supabase';

// VAR automático. A decisão sai da própria partida (plano + quem finalizou), nunca de um clique do jogador.
//  - Gol do plano: com a chance configurada, vai para revisão e é CONFIRMADO (o placar do plano nunca muda,
//    então o resultado, os pênaltis e o ranking continuam certos).
//  - Chute para fora do plano: com chance menor, a jogada parece gol, é revisada e o gol é ANULADO por um motivo
//    ligado ao lance (impedimento, falta ou mão), escolhido pela posição de quem finalizou.
// A sorte de cada lance sai só do minuto, então os dois lados do multiplayer e quem assiste veem a mesma decisão.

export type VarConfig = {
  enabled: boolean;
  chance: number; // 0..1: chance de um gol do plano ir para revisão
  annulShare: number; // 0..1: das revisões, quantas terminam em gol anulado
  durationSec: number; // duração da animação "CHECKING GOAL"
};
export const DEFAULT_VAR: VarConfig = { enabled: true, chance: 0.3, annulShare: 0.25, durationSec: 5 };
export const VAR_LIMITS = { durationMin: 2, durationMax: 12, maxAnnulledPerMatch: 2 };

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export function cleanVar(raw: unknown): VarConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_VAR.enabled,
    chance: num(r.chance, DEFAULT_VAR.chance, 0, 1),
    annulShare: num(r.annulShare, DEFAULT_VAR.annulShare, 0, 0.9),
    durationSec: num(r.durationSec, DEFAULT_VAR.durationSec, VAR_LIMITS.durationMin, VAR_LIMITS.durationMax),
  };
}

let current: VarConfig = DEFAULT_VAR;
export const getVarConfig = () => current;

// Lê a configuração do banco (sem a tabela ou sem internet, fica o padrão)
export async function loadVarConfig(): Promise<VarConfig> {
  try {
    const { data, error } = await supabase.from('game_settings').select('value').eq('key', 'var').maybeSingle();
    if (!error && data) current = cleanVar((data as { value: unknown }).value);
  } catch {
    /* mantém a configuração atual */
  }
  return current;
}
export async function saveVarConfig(config: VarConfig): Promise<string | null> {
  const clean = cleanVar(config);
  const { error } = await supabase.from('game_settings').upsert({ key: 'var', value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return error.message;
  current = clean;
  return null;
}

export type VarVerdict = { outcome: 'confirmado' | 'anulado'; kind: 'impedimento' | 'falta' | 'mao'; reason: string };

// Número entre 0 e 1 que só depende da partida (seed) e do minuto: igual em todos os aparelhos que veem a mesma partida
export const seedOf = (key: string) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
};
const roll = (seed: number, minute: number, salt: number) => {
  let h = (seed ^ Math.imul(minute + 1, 2654435761) ^ Math.imul(salt, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const ATTACKERS = ['CF', 'LF', 'RF'];

// Qual conferência o VAR faz: depende de onde o finalizador joga (atacante vive no limite da defesa)
function pickKind(seed: number, minute: number, shooterPos: string): VarVerdict['kind'] {
  const r = roll(seed, minute, 3);
  if (ATTACKERS.includes(shooterPos)) return r < 0.6 ? 'impedimento' : r < 0.85 ? 'falta' : 'mao';
  return r < 0.5 ? 'falta' : r < 0.8 ? 'mao' : 'impedimento';
}
const CHECKED: Record<VarVerdict['kind'], (who: string) => string> = {
  impedimento: (who) => `Posição de ${who} conferida: sem impedimento`,
  falta: (who) => `Disputa de bola de ${who} conferida: sem falta`,
  mao: (who) => `Lance de ${who} conferido: sem toque de mão`,
};
const ANNULLED: Record<VarVerdict['kind'], (who: string) => string> = {
  impedimento: (who) => `Impedimento de ${who} no início da jogada`,
  falta: (who) => `Falta de ${who} na marcação antes do chute`,
  mao: (who) => `Mão na bola de ${who} na construção da jogada`,
};

// `planType`: tipo do lance no plano. `annulledSoFar`: gols anulados já mostrados nesta partida (limite por jogo).
export function varReview(args: { seed: number; minute: number; planType: string; shooterPos: string; shooter: string; annulledSoFar: number }, config: VarConfig = current): VarVerdict | null {
  if (!config.enabled || config.chance <= 0) return null;
  const { seed, minute, planType, shooterPos, shooter, annulledSoFar } = args;
  if (planType === 'gol') {
    if (roll(seed, minute, 1) >= config.chance) return null;
    const kind = pickKind(seed, minute, shooterPos);
    return { outcome: 'confirmado', kind, reason: CHECKED[kind](shooter) };
  }
  if (planType === 'finalização') {
    if (annulledSoFar >= VAR_LIMITS.maxAnnulledPerMatch || config.annulShare <= 0) return null;
    if (roll(seed, minute, 2) >= config.chance * config.annulShare) return null;
    const kind = pickKind(seed, minute, shooterPos);
    return { outcome: 'anulado', kind, reason: ANNULLED[kind](shooter) };
  }
  return null;
}

export type VarLogRow = { id: number; created_at: string; match_key: string; minute: number; side: string | null; home: string | null; away: string | null; scorer: string | null; outcome: 'confirmado' | 'anulado'; reason: string | null };

export async function logVarDecision(row: { matchKey: string; minute: number; side: string; home: string; away: string; scorer: string; outcome: 'confirmado' | 'anulado'; reason: string }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;
    await supabase.from('var_decisions').upsert(
      { match_key: row.matchKey, minute: row.minute, side: row.side, home: row.home, away: row.away, scorer: row.scorer, outcome: row.outcome, reason: row.reason, user_id: auth.user.id },
      { onConflict: 'match_key,minute,scorer', ignoreDuplicates: true },
    );
  } catch {
    /* histórico é opcional: nunca atrapalha a partida */
  }
}
