// Jogabilidade emergente (discos vistos de cima): segunda bola, bloqueio/rebote, contra-ataque, placar e tempo, adaptação por região e registro de decisões.
// Funções puras e baratas (rodam em decisões, não a cada quadro). O desfecho do plano (gol/defesa/chute) nunca é alterado por aqui.
export type Pt = { x: number; y: number };
export type Side = 'user' | 'bot';

// ---------- Placar e tempo ----------
// Urgência de -1 (proteger o resultado) a +1 (precisa atacar). Gradual: só pesa de verdade no fim e com diferença no placar.
export function urgency(minute: number, mine: number, theirs: number, cautious = 0): number {
  const t = Math.max(0, Math.min(1, minute / 90));
  const late = t < 0.55 ? 0.15 : 0.15 + ((t - 0.55) / 0.45) * 0.85;
  const diff = theirs - mine; // positivo = perdendo
  let u = 0;
  if (diff > 0) u = Math.min(1, 0.35 * diff) * late * 1.4;
  else if (diff < 0) u = -Math.min(1, 0.3 * -diff) * late * 1.1;
  else u = t > 0.8 ? 0.12 : 0; // empate no fim: um pouco de risco
  return Math.max(-1, Math.min(1, u - cautious));
}

// ---------- Segunda bola ----------
export type SBCand = { key: string; x: number; y: number; maxSpeed: number; ovr: number; side: Side; gk: boolean; bonus?: number };
export type SBRun = { key: string; side: Side; eta: number; ix: number; iy: number };
const TAU_BALL = 0.42; // atrito: a velocidade cai com e^(-t/τ)

export const ballAt = (b: Pt & { vx: number; vy: number }, t: number): Pt => {
  const k = TAU_BALL * (1 - Math.exp(-t / TAU_BALL));
  return { x: b.x + b.vx * k, y: b.y + b.vy * k };
};
export const ballStop = (b: Pt & { vx: number; vy: number }): Pt => ballAt(b, 6);

// Para cada jogador: em quanto tempo ele alcança a bola (tempo de reação + corrida até o ponto onde a bola vai estar)
export function secondBallRuns(ball: Pt & { vx: number; vy: number }, cands: SBCand[], bounds: { x0: number; x1: number; y0: number; y1: number }, tired: (k: string) => number = () => 0): SBRun[] {
  const runs: SBRun[] = [];
  for (const c of cands) {
    if (c.gk) continue;
    const react = Math.max(0.04, 0.1 + (100 - Math.min(99, c.ovr)) * 0.004 - (c.bonus ?? 0)); // overall alto reage antes
    const v = c.maxSpeed * 1.25 * (1 - tired(c.key));
    let found = false;
    for (let t = 0.1; t <= 3.2; t += 0.1) {
      const p = ballAt(ball, t);
      if (p.x < bounds.x0 || p.x > bounds.x1 || p.y < bounds.y0 || p.y > bounds.y1) continue;
      const need = Math.hypot(c.x - p.x, c.y - p.y);
      if (need <= v * Math.max(0, t - react) + 11) {
        runs.push({ key: c.key, side: c.side, eta: t, ix: p.x, iy: p.y });
        found = true;
        break;
      }
    }
    if (!found) {
      const p = ballStop(ball);
      runs.push({ key: c.key, side: c.side, eta: 9, ix: Math.max(bounds.x0, Math.min(bounds.x1, p.x)), iy: Math.max(bounds.y0, Math.min(bounds.y1, p.y)) });
    }
  }
  return runs.sort((a, b) => a.eta - b.eta);
}

// Disputa: quem chega até ~0,22 s do primeiro entra na briga; o vencedor sai do overall, da vantagem de chegada e de um pouco de acaso
export function pickWinner(runs: SBRun[], ovr: (k: string) => number, rnd: () => number): { winner: SBRun; contest: SBRun[] } {
  const first = runs[0];
  const contest = runs.filter((r) => r.eta - first.eta < 0.22 && r.eta < 9).slice(0, 3);
  if (contest.length < 2) return { winner: first, contest: [first] };
  const w = contest.map((r) => Math.max(0.2, 1 + (ovr(r.key) - 75) / 40 - (r.eta - first.eta) * 3));
  let x = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < contest.length; i += 1) {
    x -= w[i];
    if (x <= 0) return { winner: contest[i], contest };
  }
  return { winner: contest[0], contest };
}

// ---------- Bloqueio de chute ----------
// Defensor perto da linha do chute (e não colado no chutador) pode bloquear; devolve a chance
export function blockChance(d: number, t: number, ovr: number, shooterPressure: number): number {
  if (d > 24 || t < 0.18 || t > 0.85) return 0;
  const close = (24 - d) / 24;
  return Math.max(0, Math.min(0.55, 0.12 + close * 0.3 + shooterPressure * 0.1 + (ovr - 72) * 0.003));
}
// Direção da sobra após o bloqueio: reflete a bola em relação à superfície do disco (ângulo do contato) com um desvio pequeno
export function deflect(shot: Pt, def: Pt, to: Pt, rnd: () => number, speed: number): { vx: number; vy: number } {
  const ix = to.x - shot.x;
  const iy = to.y - shot.y;
  const il = Math.hypot(ix, iy) || 1;
  let nx = def.x - shot.x;
  let ny = def.y - shot.y;
  // normal da superfície: do centro do defensor para o ponto de contato (aprox. contra o chute, com desvio lateral)
  const off = (rnd() - 0.5) * 1.2;
  const a = Math.atan2(-iy, -ix) + off;
  nx = Math.cos(a);
  ny = Math.sin(a);
  const dot = (ix / il) * nx + (iy / il) * ny;
  const rx = ix / il - 2 * dot * nx;
  const ry = iy / il - 2 * dot * ny;
  const rl = Math.hypot(rx, ry) || 1;
  return { vx: (rx / rl) * speed, vy: (ry / rl) * speed };
}

// ---------- Contra-ataque ----------
export type CounterIn = {
  behindSpace: number; // adversários que ainda estão à frente da bola, em direção ao gol (menos = mais espaço atrás da defesa)
  nearOpp: number; // adversários a menos de 95 px do portador
  mateAhead: boolean; // companheiro livre à frente
  laneOpen: boolean; // passe vertical possível
  carryRoom: number; // espaço livre à frente (px) para conduzir
  urgency: number;
};
export type CounterMode = 'vertical' | 'conducao' | 'manter';
export function counterRead(c: CounterIn, rnd: () => number): { mode: CounterMode; why: string } {
  if (c.nearOpp >= 3) return { mode: 'manter', why: 'muitos adversários perto: mantém a posse' };
  const space = c.behindSpace <= 2 ? 1 : c.behindSpace <= 3 ? 0.5 : 0.15;
  const eager = space + (c.urgency > 0 ? c.urgency * 0.3 : c.urgency * 0.4) - c.nearOpp * 0.15;
  if (c.laneOpen && c.mateAhead && eager + rnd() * 0.4 > 0.75) return { mode: 'vertical', why: 'espaço nas costas e passe vertical livre' };
  if (c.carryRoom > 110 && c.nearOpp <= 1 && eager + rnd() * 0.4 > 0.6) return { mode: 'conducao', why: 'campo livre à frente: conduz' };
  return { mode: 'manter', why: 'sem espaço claro: segura e reorganiza' };
}

// ---------- Leitura de região (adaptação) ----------
// Calor por faixa (esquerda/centro/direita no eixo do campo) de onde o adversário constrói; decai com o tempo.
export type LaneHeat = { l: number; c: number; r: number; at: number };
export const newHeat = (): LaneHeat => ({ l: 0, c: 0, r: 0, at: 0 });
export function heatAdd(h: LaneHeat, y: number, y0: number, y1: number, now: number) {
  const f = Math.exp(-(now - h.at) / 22000);
  h.l *= f;
  h.c *= f;
  h.r *= f;
  h.at = now;
  const g = (y - y0) / (y1 - y0);
  if (g < 0.34) h.l += 1;
  else if (g > 0.66) h.r += 1;
  else h.c += 1;
}
// Quanto deslocar a marcação (em fração do campo, -1 a 1 no sentido y) para a faixa mais usada; só depois de amostra mínima
export function heatShift(h: LaneHeat, now: number): number {
  const f = Math.exp(-(now - h.at) / 22000);
  const l = h.l * f;
  const c = h.c * f;
  const r = h.r * f;
  const tot = l + c + r;
  if (tot < 4) return 0;
  const top = Math.max(l, c, r);
  if (top / tot < 0.5) return 0;
  const dir = top === l ? -1 : top === r ? 1 : 0;
  return dir * Math.min(1, (top / tot - 0.5) * 2.2);
}

// ---------- Momento da partida ----------
// Pontos de pressão por time, com decaimento (meia-vida ~40 s de jogo). Valor de -1 (adversário por cima) a 1 (time por cima).
export type Momentum = { user: number; bot: number; at: number };
export const newMomentum = (): Momentum => ({ user: 0, bot: 0, at: 0 });
export function momAdd(m: Momentum, side: Side, v: number, now: number) {
  const f = Math.exp(-(now - m.at) / 58000);
  m.user *= f;
  m.bot *= f;
  m.at = now;
  m[side] += v;
}
export function momValue(m: Momentum, side: Side, now: number): number {
  const f = Math.exp(-(now - m.at) / 58000);
  const a = m[side] * f;
  const b = m[side === 'user' ? 'bot' : 'user'] * f;
  return (a - b) / (a + b + 3);
}

// ---------- Escanteios ----------
export type CornerKind = 'area' | 'curto' | 'primeira';
export const CORNER_KINDS: CornerKind[] = ['area', 'curto', 'primeira'];
export type CornerMem = Record<CornerKind, number>;
export const newCornerMem = (): CornerMem => ({ area: 0, curto: 0, primeira: 0 });
// Variedade: quanto mais uma variação foi usada, menos ela é escolhida; só as variações ligadas entram
export function chooseCorner(mem: CornerMem, rnd: () => number, on: (k: CornerKind) => boolean = () => true): CornerKind {
  const list = CORNER_KINDS.filter((k) => k === 'area' || on(k));
  const w = list.map((k) => (k === 'area' ? 1.3 : 1) / (1 + mem[k] * 0.7));
  let x = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i += 1) {
    x -= w[i];
    if (x <= 0) return list[i];
  }
  return 'area';
}
// O adversário só reage a uma variação que já viu duas vezes ou mais
export const cornerRead = (mem: CornerMem, k: CornerKind): boolean => mem[k] >= 2;

// ---------- Registro de decisões ----------
// Fica em memória e é espelhado no armazenamento do aparelho (no máximo a cada 3 s) para o painel ADM ler depois da partida.
export type DecisionLog = { t: number; who: string; kind: string; why: string };
const KEY = 'sfl7v7.dbg.log';
const LOG: DecisionLog[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
export function logDecision(who: string, kind: string, why: string) {
  LOG.push({ t: Date.now(), who, kind, why });
  if (LOG.length > 80) LOG.shift();
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(LOG));
    } catch {
      /* sem armazenamento: só memória */
    }
  }, 3000);
}
export function readDecisions(): DecisionLog[] {
  if (LOG.length) return LOG.slice().reverse();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DecisionLog[]).slice().reverse() : [];
  } catch {
    return [];
  }
}
export function clearDecisions() {
  LOG.length = 0;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
}
