import { TACTICS, type Tactic } from '@/lib/multiplayer';

// Táticas personalizadas: estilo de jogo configurável. A formação e as posições NÃO entram aqui (são fixas no draft).
// Cada tática salva é convertida em uma das táticas que a partida já entende, então vale também no multiplayer.

export type Style = 'equilibrado' | 'posse' | 'contra' | 'pressao';
export type Defense = 'recuada' | 'equilibrada' | 'alta';
export type Build = 'curtos' | 'diretos' | 'rapidas';
export type Chance = 'posse' | 'movimentacao' | 'profundidade';

export type TacticProfile = { style: Style; defense: Defense; build: Build; chance: Chance };
export type TacticStore = { main: number; presets: (TacticProfile | null)[] };

export const DEFAULT_PROFILE: TacticProfile = { style: 'equilibrado', defense: 'equilibrada', build: 'curtos', chance: 'movimentacao' };
export const MAX_PRESETS = 3;
const KEY = 'sfl7v7.tactics.v1';

type Opt<T extends string> = { id: T; label: string; icon: string; text: string };
export const STYLE_OPTS: Opt<Style>[] = [
  { id: 'equilibrado', label: 'Equilibrado', icon: '⚖️', text: 'Sem extremos: o jogo segue o equilíbrio dos times.' },
  { id: 'posse', label: 'Posse de bola', icon: '🎯', text: 'Controla a bola e cansa menos o time.' },
  { id: 'contra', label: 'Contra-ataque', icon: '⚡', text: 'Poucos chutes, mas muito perigosos.' },
  { id: 'pressao', label: 'Pressão alta', icon: '🔥', text: 'Sufoca a saída do rival, mas cansa mais.' },
];
export const DEFENSE_OPTS: Opt<Defense>[] = [
  { id: 'recuada', label: 'Recuada', icon: '🛡️', text: 'Linha baixa: cede espaço e protege o gol.' },
  { id: 'equilibrada', label: 'Equilibrada', icon: '⚖️', text: 'Linha média, sem grandes riscos.' },
  { id: 'alta', label: 'Alta', icon: '⬆️', text: 'Linha adiantada: rouba cedo, deixa espaço atrás.' },
];
export const BUILD_OPTS: Opt<Build>[] = [
  { id: 'curtos', label: 'Passes curtos', icon: '🔗', text: 'Toques curtos para manter a bola.' },
  { id: 'diretos', label: 'Passes diretos', icon: '➡️', text: 'Bola rápida e vertical ao ataque.' },
  { id: 'rapidas', label: 'Transições rápidas', icon: '💨', text: 'Roubou, atacou: saídas em velocidade.' },
];
export const CHANCE_OPTS: Opt<Chance>[] = [
  { id: 'posse', label: 'Posse de bola', icon: '🎯', text: 'Paciência até abrir o espaço.' },
  { id: 'movimentacao', label: 'Movimentação', icon: '🔀', text: 'Troca de posições e infiltrações.' },
  { id: 'profundidade', label: 'Passes em profundidade', icon: '📐', text: 'Bola nas costas da defesa.' },
];

// Quanto cada tática "combina" com as outras três escolhas (o estilo pesa mais: 2 pontos contra 1)
const AFFINITY: Record<Tactic, { defense: Defense[]; build: Build[]; chance: Chance[] }> = {
  ofensiva: { defense: ['alta'], build: ['diretos', 'rapidas'], chance: ['profundidade'] },
  equilibrada: { defense: ['equilibrada'], build: ['curtos'], chance: ['movimentacao'] },
  defensiva: { defense: ['recuada'], build: ['curtos'], chance: ['posse'] },
  contra: { defense: ['recuada'], build: ['rapidas'], chance: ['profundidade'] },
  posse: { defense: ['equilibrada'], build: ['curtos'], chance: ['posse'] },
  pressao: { defense: ['alta'], build: ['rapidas'], chance: ['movimentacao'] },
};
const STYLE_TO_TACTIC: Record<Style, Tactic> = { equilibrado: 'equilibrada', posse: 'posse', contra: 'contra', pressao: 'pressao' };

export function deriveTactic(profile: TacticProfile): Tactic {
  const base = STYLE_TO_TACTIC[profile.style];
  let best: Tactic = base;
  let bestScore = -1;
  for (const tactic of [base, ...TACTICS.filter((item) => item !== base)]) {
    const a = AFFINITY[tactic];
    const score =
      (tactic === base ? 2 : 0) +
      (a.defense.includes(profile.defense) ? 1 : 0) +
      (a.build.includes(profile.build) ? 1 : 0) +
      (a.chance.includes(profile.chance) ? 1 : 0);
    if (score > bestScore) {
      best = tactic;
      bestScore = score;
    }
  }
  return best;
}

const valid = (value: unknown, list: { id: string }[]) => list.some((item) => item.id === value);
function clean(raw: any): TacticProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!valid(raw.style, STYLE_OPTS) || !valid(raw.defense, DEFENSE_OPTS) || !valid(raw.build, BUILD_OPTS) || !valid(raw.chance, CHANCE_OPTS)) return null;
  return { style: raw.style, defense: raw.defense, build: raw.build, chance: raw.chance };
}

export function loadTactics(): TacticStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    const presets: (TacticProfile | null)[] = Array.from({ length: MAX_PRESETS }, (_, index) => clean(parsed?.presets?.[index]));
    if (!presets[0]) presets[0] = { ...DEFAULT_PROFILE };
    const main = Number.isInteger(parsed?.main) && presets[parsed.main] ? parsed.main : 0;
    return { main, presets };
  } catch {
    return { main: 0, presets: [{ ...DEFAULT_PROFILE }, null, null] };
  }
}
export function saveTactics(store: TacticStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* sem armazenamento: a tática vale só nesta sessão */
  }
}
export function hasSavedTactics(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
export const presetName = (index: number) => (index === 0 ? 'Principal' : `Alternativa ${index}`);

export function describeProfile(profile: TacticProfile): string {
  const get = <T extends string>(list: { id: T; label: string }[], id: T) => list.find((item) => item.id === id)!.label.toLowerCase();
  return `Seu time joga ${get(STYLE_OPTS, profile.style)}, com defesa ${get(DEFENSE_OPTS, profile.defense)}, constrói com ${get(BUILD_OPTS, profile.build)} e cria chances por ${get(CHANCE_OPTS, profile.chance)}.`;
}
