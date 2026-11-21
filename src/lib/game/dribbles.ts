// Biblioteca de dribles (categoria DRIBLES da Dynamic Play Intelligence).
// Cada drible tem: o desenho do trajeto (onde o atleta vai), o movimento do corpo e da bola (animação) e a legenda.
// A ESCOLHA depende do contexto (pressão, espaço, marcador, função, foco, personalidade, memória) e muda a chance real
// do drible dar certo nos lances de jogo corrido (se falha, a bola muda de posse). Lances do plano continuam decididos pela simulação.
import { personalityOf, type Intel, type Side, type Style } from '@/lib/game/playIntel';

export type DribbleMove = 'finta' | 'pedalada' | 'corte' | 'caneta' | 'giro' | 'direcao' | 'protecao' | 'aceleracao' | 'curto' | 'velocidade';
export const DRIBBLE_MOVES: DribbleMove[] = ['finta', 'pedalada', 'corte', 'caneta', 'giro', 'direcao', 'protecao', 'aceleracao', 'curto', 'velocidade'];
type P = { x: number; y: number };
export type DribbleStepPlan = { to: P; dur: number; speed?: number; phase: 'fake' | 'burst' };

// Trajeto: sg = lado por onde passa o marcador, d = direção do ataque. Se o drible falha só o primeiro passo acontece.
export function dribbleGeometry(move: DribbleMove, h: P, opp: P, sg: number, d: number): DribbleStepPlan[] {
  switch (move) {
    case 'pedalada': return [{ to: { x: opp.x - d * 10, y: opp.y + sg * 34 }, dur: 430, phase: 'fake' }, { to: { x: opp.x + d * 75, y: opp.y + sg * 24 }, dur: 380, phase: 'burst' }];
    case 'corte': return [{ to: { x: opp.x - d * 18, y: opp.y - sg * 26 }, dur: 230, phase: 'fake' }, { to: { x: opp.x + d * 62, y: opp.y + sg * 34 }, dur: 330, phase: 'burst' }];
    case 'caneta': return [{ to: { x: opp.x - d * 8, y: opp.y + sg * 10 }, dur: 330, phase: 'fake' }, { to: { x: opp.x + d * 60, y: opp.y + sg * 18 }, dur: 420, phase: 'burst' }];
    case 'giro': return [{ to: { x: opp.x - d * 10, y: opp.y + sg * 20 }, dur: 460, phase: 'fake' }, { to: { x: opp.x + d * 66, y: opp.y + sg * 30 }, dur: 380, phase: 'burst' }];
    case 'direcao': return [{ to: { x: opp.x - d * 30, y: opp.y + sg * 46 }, dur: 380, phase: 'fake' }, { to: { x: opp.x + d * 80, y: opp.y - sg * 8 }, dur: 420, phase: 'burst' }];
    case 'protecao': return [{ to: { x: h.x + d * 22, y: h.y + sg * 8 }, dur: 760, phase: 'fake' }];
    case 'aceleracao': return [{ to: { x: opp.x + d * 10, y: opp.y + sg * 44 }, dur: 300, speed: 1.9, phase: 'burst' }, { to: { x: opp.x + d * 90, y: opp.y + sg * 30 }, dur: 280, speed: 1.9, phase: 'burst' }];
    case 'curto': return [{ to: { x: opp.x - d * 8, y: opp.y + sg * 22 }, dur: 220, phase: 'fake' }, { to: { x: opp.x + d * 20, y: opp.y + sg * 16 }, dur: 220, phase: 'fake' }, { to: { x: opp.x + d * 60, y: opp.y + sg * 24 }, dur: 300, phase: 'burst' }];
    case 'velocidade': return [{ to: { x: opp.x + d * 30, y: opp.y + sg * 50 }, dur: 380, speed: 2.1, phase: 'burst' }, { to: { x: opp.x + d * 140, y: opp.y + sg * 30 }, dur: 520, speed: 2.1, phase: 'burst' }];
    default: return [{ to: { x: opp.x - d * 6, y: opp.y + sg * 38 }, dur: 340, phase: 'fake' }, { to: { x: opp.x + d * 70, y: opp.y + sg * 26 }, dur: 400, phase: 'burst' }];
  }
}

export const DRIBBLE_CAPTION: Record<DribbleMove, { win: (a: string, b: string) => string; lose: (a: string, b: string) => string }> = {
  finta: { win: (a, b) => `${a} dribla ${b}`, lose: (a, b) => `${a} tenta driblar ${b}` },
  pedalada: { win: (a, b) => `${a} pedala e deixa ${b} para trás`, lose: (a, b) => `${a} pedala, mas ${b} não cai na finta` },
  corte: { win: (a, b) => `${a} faz o corte seco em ${b}`, lose: (a, b) => `${a} tenta o corte seco e ${b} acompanha` },
  caneta: { win: (a, b) => `Caneta! ${a} passa a bola entre as pernas de ${b}`, lose: (a, b) => `${a} tenta a caneta em ${b}, mas não dá` },
  giro: { win: (a, b) => `${a} gira sobre ${b} e escapa`, lose: (a, b) => `${a} tenta girar e ${b} chega junto` },
  direcao: { win: (a, b) => `${a} muda de direção e passa por ${b}`, lose: (a, b) => `${a} muda de direção, mas ${b} fecha o caminho` },
  protecao: { win: (a, b) => `${a} protege a bola de ${b} com o corpo`, lose: (a, b) => `${a} é desarmado por ${b} ao tentar proteger a bola` },
  aceleracao: { win: (a, b) => `${a} acelera e ganha de ${b} na corrida`, lose: (a, b) => `${a} acelera, mas ${b} segura a corrida` },
  curto: { win: (a, b) => `${a} faz o drible curto em ${b}`, lose: (a, b) => `${a} tenta o drible curto e ${b} rouba a bola` },
  velocidade: { win: (a, b) => `${a} sai em velocidade e deixa ${b} parado`, lose: (a, b) => `${a} sai em velocidade, mas ${b} alcança` },
};

// Corpo e bola durante o drible. pr: 0 a 1 do passo, phase: finta (fake) ou arrancada (burst), sg: lado
export type BodyFx = { rot: number; sx: number; sy: number; shift: number; ballFwd: number; ballLat: number; oppSway: number };
export function dribbleBody(move: DribbleMove, phase: 'fake' | 'burst', pr: number, sg: number): BodyFx {
  const s = Math.sin(pr * Math.PI), two = Math.sin(pr * Math.PI * 2);
  const out: BodyFx = { rot: 0, sx: 1, sy: 1, shift: 0, ballFwd: 0, ballLat: 0, oppSway: 1 };
  const burst = () => { out.rot = sg * s * 8; out.sx = 1 + 0.2 * s; out.sy = 1 - 0.1 * s; };
  if (phase === 'burst') {
    burst();
    if (move === 'corte') { out.rot = sg * s * 14; out.sx = 1 + 0.15 * s; }
    if (move === 'caneta') out.ballFwd = 26 * (1 - pr);
    if (move === 'aceleracao' || move === 'velocidade') { out.rot = sg * s * 4; out.sx = 1 + 0.26 * s; out.sy = 1 - 0.13 * s; }
    if (move === 'direcao') out.rot = -sg * s * 12;
    return out;
  }
  switch (move) {
    case 'pedalada': out.rot = sg * Math.sin(pr * Math.PI * 4) * 14; out.sy = 1 + 0.12 * Math.abs(Math.sin(pr * Math.PI * 4)); out.sx = 1 - 0.06 * s; out.shift = -sg * s * 4; break;
    case 'corte': out.rot = -sg * s * 18; out.shift = -sg * s * 8; out.sy = 1 + 0.08 * s; break;
    case 'caneta': out.rot = sg * s * 6; out.sy = 1 + 0.06 * s; out.ballFwd = 26 * Math.sin((pr * Math.PI) / 2); break;
    case 'giro': out.rot = sg * pr * 360; out.sx = 1 - 0.08 * s; out.sy = 1 + 0.06 * s; break;
    case 'direcao': out.rot = -sg * s * 12; out.shift = sg * s * 5; break;
    case 'protecao': out.rot = sg * 10 * s; out.sx = 1 + 0.1 * s; out.sy = 1 - 0.06 * s; out.ballLat = -sg * 7 * s; out.oppSway = 0.15; break;
    case 'curto': out.rot = sg * Math.sin(pr * Math.PI * 6) * 9; out.sy = 1 + 0.08 * Math.abs(Math.sin(pr * Math.PI * 6)); break;
    default: out.rot = -sg * two * 22; out.sy = 1 + 0.14 * s; out.sx = 1 - 0.08 * s; out.shift = -sg * s * 6;
  }
  return out;
}

export type DribbleCtx = {
  side: Side;
  holder: { name: string; ovr: number; pos: string; style?: Style };
  opp: { ovr: number };
  pressure: number; // 0 a 1
  gap: number; // distância até o marcador
  space: number; // espaço livre à frente (0 a 1)
  toGoal: number;
  wide: boolean;
};

// Quão bem o drible combina com a situação (-0.1 a +0.1 na chance de dar certo; também pesa na escolha)
export function moveFit(move: DribbleMove, c: DribbleCtx): number {
  const edge = (c.holder.ovr - c.opp.ovr) / 20;
  switch (move) {
    case 'aceleracao': return 0.1 * c.space - 0.04 * c.pressure;
    case 'velocidade': return c.toGoal > 200 ? 0.11 * c.space - 0.05 * c.pressure : -0.05;
    case 'protecao': return 0.1 * c.pressure + (c.gap < 36 ? 0.03 : -0.02);
    case 'giro': return c.gap < 40 ? 0.06 * c.pressure + 0.02 : -0.05;
    case 'pedalada': return 0.05 * edge - 0.03 * c.pressure + 0.02;
    case 'caneta': return 0.06 * edge - 0.1 + (c.gap < 50 ? 0.04 : -0.03);
    case 'corte': return c.wide ? 0.07 : -0.01;
    case 'curto': return c.gap < 55 ? 0.05 : 0;
    case 'direcao': return 0.03 * (1 - c.space) + 0.02;
    default: return 0;
  }
}

const ROLE: Record<string, Partial<Record<DribbleMove, number>>> = {
  'wg-wide': { aceleracao: 1.4, velocidade: 1.4, corte: 1.4 }, 'wg-inf': { direcao: 1.3, caneta: 1.2, pedalada: 1.2, corte: 1.1 },
  'wg-play': { curto: 1.2, direcao: 1.1 }, 'wg-bal': { aceleracao: 1.1, corte: 1.1 },
  'at-pivot': { protecao: 1.7, giro: 1.4 }, 'at-f9': { curto: 1.2, giro: 1.2 }, 'at-mobile': { velocidade: 1.3, direcao: 1.3, aceleracao: 1.2 }, 'at-fin': { protecao: 1.1, giro: 1.1 },
  'mc-hold': { protecao: 1.4, curto: 1.1, caneta: 0.5, velocidade: 0.6 }, 'mc-play': { curto: 1.3, giro: 1.2, direcao: 1.1 }, 'mc-b2b': { aceleracao: 1.2, velocidade: 1.2 }, 'mc-inf': { direcao: 1.2, caneta: 1.2 },
  'df-build': { protecao: 1.2, curto: 1.1 }, 'df-aggr': { velocidade: 1.2 },
};
const REPEAT = 6;

export function chooseDribble(intel: Intel, c: DribbleCtx, rnd: () => number = Math.random): DribbleMove {
  const p = personalityOf(c.holder.name, c.holder.ovr);
  const base: Record<DribbleMove, number> = { finta: 2, pedalada: 1.1, corte: 1, caneta: 0.35, giro: 0.9, direcao: 1.2, protecao: 0.8, aceleracao: 1.2, curto: 1.2, velocidade: 0.9 };
  const w = { ...base } as Record<DribbleMove, number>;
  const roleMult = ROLE[c.holder.style?.role ?? ''] ?? {};
  const focus = c.holder.style?.focus;
  const log = intel.dribbles[c.side].slice(-REPEAT);
  DRIBBLE_MOVES.forEach((m) => {
    let v = w[m] * (roleMult[m] ?? 1);
    // Personalidade e overall: atleta criativo e técnico arrisca mais o drible de efeito
    if (m === 'pedalada' || m === 'caneta' || m === 'giro') v *= 0.75 + 0.6 * p.criatividade + (c.holder.ovr >= 85 ? 0.15 : 0);
    if (m === 'aceleracao' || m === 'velocidade' || m === 'corte') v *= 0.8 + 0.5 * p.ousadia;
    if (m === 'protecao' || m === 'curto') v *= 0.8 + 0.5 * p.coletivo;
    if (focus === 'off' && (m === 'aceleracao' || m === 'velocidade' || m === 'caneta' || m === 'pedalada')) v *= 1.2;
    if (focus === 'def' && (m === 'protecao' || m === 'curto')) v *= 1.3;
    if (focus === 'free') v *= m === 'finta' ? 0.9 : 1.15;
    // Situação: o que combina com espaço, pressão e marcador
    const fit = moveFit(m, c);
    v *= Math.max(0.2, 1 + fit * 6);
    if (m === 'velocidade' && c.space < 0.4) v *= 0.3;
    if (m === 'aceleracao' && c.space < 0.25) v *= 0.4;
    if (m === 'protecao' && c.pressure < 0.35) v *= 0.4;
    if (c.pressure > 0.7 && (m === 'caneta' || m === 'pedalada')) v *= 0.6;
    // Memória: o que o time acabou de usar pesa menos (nunca zera); o que deu certo contra esse adversário pesa mais
    let rep = 0, ok = 0, bad = 0;
    log.forEach((r, i) => { if (r.move === m) { rep += Math.exp(-(log.length - 1 - i) / 2.5); if (r.win) ok += 1; else bad += 1; } });
    v *= Math.max(0.45, 1 / (1 + 0.5 * rep));
    if (ok > bad) v *= 1.1;
    if (bad >= 2 && ok === 0) v *= 0.7;
    w[m] = v;
  });
  const total = DRIBBLE_MOVES.reduce((s, m) => s + w[m], 0);
  let roll = rnd() * total;
  for (const m of DRIBBLE_MOVES) { roll -= w[m]; if (roll <= 0) return m; }
  return 'finta';
}
export function recordDribble(intel: Intel, side: Side, move: DribbleMove, win: boolean) {
  intel.dribbles[side].push({ move, win });
  if (intel.dribbles[side].length > 16) intel.dribbles[side].shift();
}
