import { useSyncExternalStore } from 'react';

// Itens de coleção: bolas, chuteiras e comemorações de gol. Desbloqueiam com o seu progresso (jogos, vitórias, gols),
// que fica guardado só neste aparelho, assim como a escolha. Visual criado para o jogo (sem marcas reais).

export type Progress = { games: number; wins: number; goals: number };
type Sel = { ball: string; boots: string; celeb: string };
type Req = { stat: keyof Progress; n: number };

export type BallSkin = { id: string; label: string; base: string; ink: string; req?: Req };
export type BootSkin = { id: string; label: string; color: string; glow: string; req?: Req };
export type Celebration = { id: string; label: string; icon: string; text: string; req?: Req };

export const BALLS: BallSkin[] = [
  { id: 'classica', label: 'Clássica', base: '#ffffff', ink: '#15181c' },
  { id: 'laranja', label: 'Laranja', base: '#ff9a3c', ink: '#3a1a00', req: { stat: 'games', n: 3 } },
  { id: 'neon', label: 'Neon', base: '#d4ff3a', ink: '#1b3b00', req: { stat: 'wins', n: 3 } },
  { id: 'noite', label: 'Noite', base: '#1b2a4a', ink: '#7fd0ff', req: { stat: 'games', n: 10 } },
  { id: 'ouro', label: 'Dourada', base: '#f6d04a', ink: '#6a4a00', req: { stat: 'goals', n: 12 } },
  { id: 'fogo', label: 'Fogo', base: '#e8402a', ink: '#ffe27a', req: { stat: 'goals', n: 30 } },
];
export const BOOTS: BootSkin[] = [
  { id: 'preta', label: 'Pretas', color: '#20242b', glow: '#9aa4b2' },
  { id: 'branca', label: 'Brancas', color: '#f2f2f2', glow: '#ffffff', req: { stat: 'games', n: 2 } },
  { id: 'laranja', label: 'Laranja', color: '#ff7a1a', glow: '#ffb066', req: { stat: 'wins', n: 2 } },
  { id: 'rosa', label: 'Rosa', color: '#ff4fa3', glow: '#ff9fd0', req: { stat: 'games', n: 8 } },
  { id: 'neon', label: 'Neon', color: '#b6ff2e', glow: '#e4ff9a', req: { stat: 'goals', n: 8 } },
  { id: 'ouro', label: 'Douradas', color: '#f5b800', glow: '#ffe27a', req: { stat: 'goals', n: 20 } },
];
export const CELEBRATIONS: Celebration[] = [
  { id: 'corrida', label: 'Corrida', icon: '🏃', text: 'Corre até a bandeirinha de escanteio de braços abertos.' },
  { id: 'joelhos', label: 'De joelhos', icon: '🧎', text: 'Desliza de joelhos pelo gramado.', req: { stat: 'goals', n: 3 } },
  { id: 'danca', label: 'Dancinha', icon: '🕺', text: 'Fica no lugar e dança com a torcida.', req: { stat: 'goals', n: 8 } },
];

const PKEY = '7v7-prog';
const SKEY = '7v7-cos';
const listeners = new Set<() => void>();
const empty: Progress = { games: 0, wins: 0, goals: 0 };
const defSel: Sel = { ball: 'classica', boots: 'preta', celeb: 'corrida' };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } : fallback;
  } catch {
    return fallback;
  }
}
let progress: Progress = typeof window === 'undefined' ? empty : readJson(PKEY, empty);
let sel: Sel = typeof window === 'undefined' ? defSel : readJson(SKEY, defSel);
let snapshot = { progress, sel };

function emit() {
  snapshot = { progress, sel };
  listeners.forEach((fn) => fn());
}

export const unlocked = (req: Req | undefined, p: Progress = progress) => !req || p[req.stat] >= req.n;
export const reqText = (req: Req) => `${req.n} ${req.stat === 'games' ? (req.n === 1 ? 'jogo' : 'jogos') : req.stat === 'wins' ? (req.n === 1 ? 'vitória' : 'vitórias') : req.n === 1 ? 'gol' : 'gols'}`;

export function addProgress(add: Partial<Progress>) {
  progress = { games: progress.games + (add.games ?? 0), wins: progress.wins + (add.wins ?? 0), goals: progress.goals + (add.goals ?? 0) };
  try {
    localStorage.setItem(PKEY, JSON.stringify(progress));
  } catch {
    /* sem armazenamento */
  }
  emit();
}

export function choose(kind: keyof Sel, id: string) {
  sel = { ...sel, [kind]: id };
  try {
    localStorage.setItem(SKEY, JSON.stringify(sel));
  } catch {
    /* sem armazenamento */
  }
  emit();
}

export function useCosmetics() {
  const snap = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snapshot,
    () => snapshot,
  );
  const ball = BALLS.find((b) => b.id === snap.sel.ball && unlocked(b.req, snap.progress)) ?? BALLS[0];
  const boots = BOOTS.find((b) => b.id === snap.sel.boots && unlocked(b.req, snap.progress)) ?? BOOTS[0];
  const celeb = CELEBRATIONS.find((c) => c.id === snap.sel.celeb && unlocked(c.req, snap.progress)) ?? CELEBRATIONS[0];
  return { ball, boots, celeb, progress: snap.progress, sel: snap.sel };
}

// Movimento da comemoração em campo. t = segundos desde o gol; (sx, sy) onde o autor estava; d = +1 ataca a direita, -1 a esquerda.
// Devolve a posição, o "pulo" (altura em px), escala/inclinação e se os braços ficam levantados.
export function celebAt(kind: string, t: number, sx: number, sy: number, d: number) {
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const flagX = d > 0 ? 706 : 34;
  const flagY = sy < 220 ? 24 : 416;
  if (kind === 'joelhos') {
    const k = ease(t / 1.1);
    return { x: sx + d * 62 * k, y: sy, lift: 0, sx: t > 0.25 ? 1.22 : 1, sy: t > 0.25 ? 0.78 : 1, rot: d * (t > 0.25 ? 12 : 0), arms: t > 1.1, dust: t > 0.2 && t < 1.15 };
  }
  if (kind === 'danca') {
    return { x: sx + Math.sin(t * 5) * 6, y: sy, lift: Math.abs(Math.sin(t * 9)) * 7, sx: 1 + Math.sin(t * 18) * 0.06, sy: 1, rot: Math.sin(t * 12) * 22, arms: true, dust: false };
  }
  const k = ease(t / 1.5);
  return { x: sx + (flagX - d * 18 - sx) * k, y: sy + (flagY - sy) * k, lift: t > 1.5 ? Math.abs(Math.sin((t - 1.5) * 8)) * 6 : Math.abs(Math.sin(t * 9)) * 3, sx: 1, sy: 1, rot: 0, arms: true, dust: false };
}
