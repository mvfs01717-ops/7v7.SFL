// Passes e domínio (categorias PASSES e DOMÍNIO da biblioteca de movimentos).
// Os atletas do campo são fichas circulares vistas de cima (sem membros). A "animação" é o gesto da ficha:
// preparação, golpe e acompanhamento no passe; amortecimento, giro e proteção no domínio. Tudo sincronizado com a bola.
// A escolha do passe muda a velocidade, o arco, o efeito e o risco de interceptação; a do domínio muda o tempo até o
// próximo lance e a chance de a bola quicar longe (domínio ruim).
import { personalityOf, type Intel, type Side, type Style } from '@/lib/game/playIntel';

export type PassType = 'curto' | 'rasteiro' | 'forte' | 'primeira' | 'trivela' | 'calcanhar' | 'lancamento' | 'cobertura' | 'emergencia';
export const PASS_TYPES: PassType[] = ['curto', 'rasteiro', 'forte', 'primeira', 'trivela', 'calcanhar', 'lancamento', 'cobertura', 'emergencia'];
export type PassSpec = { type: PassType; durK: number; arc: number; curve: number; risk: number; windup: number; lunge: number; label?: (a: string, b: string) => string };

const SPEC: Record<PassType, Omit<PassSpec, 'type' | 'curve'>> = {
  curto: { durK: 1, arc: 0, risk: 0.9, windup: 2.2, lunge: 3.2 },
  rasteiro: { durK: 0.95, arc: 0, risk: 0.85, windup: 2.6, lunge: 3.6 },
  forte: { durK: 0.72, arc: 0, risk: 0.65, windup: 4.6, lunge: 6.8, label: (a, b) => `${a} bate firme para ${b}` },
  primeira: { durK: 0.8, arc: 0, risk: 0.9, windup: 0.8, lunge: 3.2, label: (a, b) => `${a} toca de primeira para ${b}` },
  trivela: { durK: 1.05, arc: 6, risk: 1.15, windup: 3.4, lunge: 5, label: (a, b) => `${a} acha ${b} de trivela` },
  calcanhar: { durK: 1, arc: 0, risk: 1.35, windup: 1.2, lunge: 4, label: (a, b) => `${a} toca de calcanhar para ${b}` },
  lancamento: { durK: 1.1, arc: 16, risk: 1.25, windup: 4.4, lunge: 6.2 },
  cobertura: { durK: 1.08, arc: 11, risk: 1, windup: 3, lunge: 4.6, label: (a, b) => `${a} serve ${b} por cobertura` },
  emergencia: { durK: 0.85, arc: 0, risk: 1.3, windup: 0.6, lunge: 4.8, label: (a) => `${a} se livra da bola sob pressão` },
};

export type PassCtx = {
  side: Side;
  dist: number;
  pressure: number; // 0 a 1 sobre quem passa
  recvOpen: number; // 0 a 1: receptor livre
  forward: number; // -1 (para trás) a 1 (para frente)
  oneTouch: boolean; // quem passa dominou de primeira (vai tocar sem controlar)
  holder: { name: string; ovr: number; style?: Style };
};

const ROLE: Record<string, Partial<Record<PassType, number>>> = {
  'mc-play': { curto: 1.2, primeira: 1.3, trivela: 1.3, cobertura: 1.3 }, 'mc-hold': { rasteiro: 1.3, curto: 1.2, forte: 0.7 },
  'mc-inf': { cobertura: 1.3, calcanhar: 1.4 }, 'mc-b2b': { forte: 1.1 },
  'gk-build': { rasteiro: 1.4, curto: 1.2 }, 'gk-libero': { lancamento: 1.3 },
  'df-build': { rasteiro: 1.3, curto: 1.1 }, 'df-aggr': { forte: 1.2, lancamento: 1.3 },
  'wg-play': { primeira: 1.2, trivela: 1.2 }, 'wg-inf': { calcanhar: 1.3, cobertura: 1.2 },
  'at-pivot': { primeira: 1.4, calcanhar: 1.2 }, 'at-f9': { primeira: 1.3, cobertura: 1.2 },
};

export function choosePassType(intel: Intel, c: PassCtx, rnd: () => number = Math.random): PassSpec {
  const p = personalityOf(c.holder.name, c.holder.ovr);
  const skilled = c.holder.ovr >= 82;
  const w: Record<PassType, number> = { curto: 0, rasteiro: 0, forte: 0, primeira: 0, trivela: 0, calcanhar: 0, lancamento: 0, cobertura: 0, emergencia: 0 };
  if (c.dist < 170) w.curto = 3;
  if (c.dist >= 90 && c.dist < 300) w.rasteiro = 2;
  if (c.dist > 110 && c.pressure < 0.5 && c.recvOpen > 0.5) w.forte = 1 + p.ousadia;
  if (c.oneTouch) w.primeira = 3.5;
  if (c.dist > 170 && skilled) w.trivela = 0.5 + p.criatividade * 1.2;
  if (c.pressure > 0.5 && c.forward < -0.3 && c.dist < 130 && c.holder.ovr >= 84 && p.criatividade > 0.55) w.calcanhar = 0.5;
  if (c.dist > 230 && c.forward > 0.5) w.lancamento = 2;
  if (c.forward > 0.4 && c.dist > 120 && c.dist < 270 && c.recvOpen > 0.4) w.cobertura = 0.5 + p.criatividade * 0.6;
  if (c.pressure > 0.8 && c.forward < 0.25) w.emergencia = 2.5;
  const role = ROLE[c.holder.style?.role ?? ''] ?? {};
  const focus = c.holder.style?.focus;
  const log = intel.passTypes[c.side].slice(-8);
  PASS_TYPES.forEach((t) => {
    let v = w[t] * (role[t] ?? 1);
    if (focus === 'off' && (t === 'forte' || t === 'lancamento' || t === 'cobertura')) v *= 1.2;
    if (focus === 'def' && (t === 'curto' || t === 'rasteiro')) v *= 1.2;
    if (c.holder.ovr < 76 && (t === 'trivela' || t === 'calcanhar' || t === 'cobertura')) v *= 0.4;
    // Memória curta: o mesmo tipo seguido perde peso (sem zerar)
    let rep = 0;
    log.forEach((r, i) => { if (r.type === t) rep += Math.exp(-(log.length - 1 - i) / 3); });
    w[t] = v * Math.max(0.5, 1 / (1 + 0.4 * rep));
  });
  const total = PASS_TYPES.reduce((s, t) => s + w[t], 0);
  let type: PassType = c.dist < 170 ? 'curto' : 'rasteiro';
  if (total > 0) {
    let roll = rnd() * total;
    for (const t of PASS_TYPES) { roll -= w[t]; if (roll <= 0 && w[t] > 0) { type = t; break; } }
  }
  const curve = type === 'trivela' ? (rnd() < 0.5 ? -1 : 1) * (10 + rnd() * 6) : 0;
  intel.passTypes[c.side].push({ type, n: intel.n });
  if (intel.passTypes[c.side].length > 16) intel.passTypes[c.side].shift();
  return { type, curve, ...SPEC[type] };
}

// Gesto do passador: preparação (recua e inclina), golpe (avança na direção do passe) e acompanhamento
export type Gesture = { tx: number; ty: number; rot: number; sx: number; sy: number };
export const KICK_MS = 360;
export function kickBody(spec: PassSpec, pr: number, ang: number, sg: number): Gesture {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let amt: number;
  if (pr < 0.4) amt = -(pr / 0.4) * spec.windup;
  else if (pr < 0.6) amt = -spec.windup + ((pr - 0.4) / 0.2) * (spec.windup + spec.lunge);
  else amt = spec.lunge * (1 - (pr - 0.6) / 0.4);
  const strike = pr >= 0.4 && pr < 0.7 ? 1 : 0;
  const g: Gesture = { tx: ux * amt, ty: uy * amt, rot: 0, sx: 1, sy: 1 };
  const e = Math.sin(pr * Math.PI);
  switch (spec.type) {
    case 'forte': case 'lancamento': g.rot = sg * (pr < 0.4 ? -8 * (pr / 0.4) : 10 * e); g.sx = 1 + 0.1 * strike; break;
    case 'trivela': g.rot = -sg * 14 * e; break;
    case 'calcanhar': g.rot = sg * 28 * Math.sin(pr * Math.PI * 1.5); g.tx *= -0.6; g.ty *= -0.6; break;
    case 'cobertura': g.rot = sg * -9 * e; g.sy = 1 + 0.08 * e; break;
    case 'emergencia': g.rot = sg * 12 * Math.sin(pr * Math.PI * 2); break;
    case 'primeira': g.sx = 1 + 0.05 * e; break;
    default: g.rot = sg * 4 * e;
  }
  return g;
}

// ---------- Domínio ----------
export type TrapType = 'interno' | 'externo' | 'sola' | 'peito' | 'coxa' | 'orientado' | 'giro' | 'protecao' | 'primeira' | 'costas' | 'aceleracao';
export const TRAP_TYPES: TrapType[] = ['interno', 'externo', 'sola', 'peito', 'coxa', 'orientado', 'giro', 'protecao', 'primeira', 'costas', 'aceleracao'];
export type TrapCtx = {
  side: Side;
  holder: { name: string; ovr: number; style?: Style };
  strength: number; // 0 a 1: força do passe que chegou (passe rápido = 1)
  arc: number; // altura do passe
  pressure: number; // 0 a 1
  space: number; // espaço livre à frente (0 a 1)
  nextIsPass: boolean; // o próximo gesto é um passe imediato (tabela)
  backToGoal: boolean; // de costas para o gol do adversário, com marcador atrás
  forward: number; // quanto a bola veio de trás (-1 vem de frente do receptor, 1 vem de trás)
};
export type TrapSpec = { type: TrapType; quality: number; delay: number; pop: boolean; label?: (a: string) => string };
const TRAP_LABEL: Partial<Record<TrapType, (a: string) => string>> = {
  peito: (a) => `${a} domina no peito`, coxa: (a) => `${a} amortece na coxa`, sola: (a) => `${a} para a bola com a sola`,
  giro: (a) => `${a} domina e gira`, protecao: (a) => `${a} protege a bola no primeiro toque`, costas: (a) => `${a} domina de costas para o gol`,
  aceleracao: (a) => `${a} domina e já sai acelerando`,
};

export function chooseTrap(c: TrapCtx, rnd: () => number = Math.random): TrapSpec {
  const air = c.arc >= 12, low = c.arc >= 7 && !air;
  const w: Record<TrapType, number> = { interno: 3, externo: 0.7, sola: 0.6, peito: 0, coxa: 0, orientado: 1.2, giro: 0, protecao: 0, primeira: 0, costas: 0, aceleracao: 0 };
  const p = personalityOf(c.holder.name, c.holder.ovr);
  if (air) { w.peito = 3; w.coxa = 1.2; w.interno = 0.3; w.sola = 0; w.externo = 0.2; }
  if (low) { w.coxa = 2.2; w.peito = 0.6; }
  if (c.nextIsPass) w.primeira = 4;
  if (c.pressure > 0.55) { w.protecao = 2.2; w.sola += 0.6; if (c.space > 0.45) w.giro = 1.5 + p.criatividade; }
  if (c.backToGoal) { w.costas = 3; w.protecao += 1; }
  if (c.space > 0.65 && c.pressure < 0.4 && !air) w.aceleracao = 1.5 + p.ousadia;
  if (c.strength > 0.7) { w.sola += 0.8; w.interno += 0.5; }
  const role = c.holder.style?.role ?? '';
  if (role === 'at-pivot' || role === 'mc-hold') { w.protecao *= 1.4; w.costas *= 1.3; }
  if (role === 'wg-inf' || role === 'mc-inf') { w.giro *= 1.3; w.externo *= 1.4; }
  if (role === 'wg-wide' || role === 'at-mobile') w.aceleracao *= 1.3;
  if (c.holder.ovr < 76) { w.giro *= 0.5; w.externo *= 0.5; }
  const total = TRAP_TYPES.reduce((s, t) => s + w[t], 0);
  let type: TrapType = 'interno';
  let roll = rnd() * total;
  for (const t of TRAP_TYPES) { roll -= w[t]; if (roll <= 0 && w[t] > 0) { type = t; break; } }
  // Qualidade do primeiro toque: habilidade, força do passe, bola aérea mal dominada, pressão e adequação do gesto
  const fits = (air && (type === 'peito' || type === 'coxa')) || (!air && type !== 'peito') ? 0.04 : -0.1;
  const q = Math.max(0.1, Math.min(0.97, 0.62 + (c.holder.ovr - 75) / 60 - c.strength * 0.14 - c.pressure * 0.12 + fits - (type === 'giro' ? 0.06 : 0) - (type === 'externo' ? 0.04 : 0)));
  const pop = rnd() > q + 0.22 && type !== 'primeira';
  const quick = type === 'giro' || type === 'aceleracao' || type === 'primeira';
  const delay = pop ? 480 : quick ? 120 : type === 'protecao' || type === 'sola' ? 300 : 190;
  return { type, quality: q, delay, pop, label: TRAP_LABEL[type] };
}

export const TRAP_MS = 380;
export function trapBody(type: TrapType, pr: number, ang: number, sg: number): Gesture {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const e = Math.sin(pr * Math.PI);
  const g: Gesture = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 };
  switch (type) {
    case 'sola': g.tx = ux * 2.5 * e; g.ty = uy * 2.5 * e; g.sy = 1 - 0.1 * e; g.rot = sg * 5 * e; break;
    case 'peito': g.sy = 1 + 0.18 * e; g.sx = 1 - 0.08 * e; g.tx = -ux * 2 * e; g.ty = -uy * 2 * e; break;
    case 'coxa': g.sy = 1 + 0.1 * e; g.rot = sg * -7 * e; break;
    case 'giro': g.rot = sg * pr * 200; g.sx = 1 + 0.08 * e; break;
    case 'protecao': g.rot = sg * 12 * e; g.sx = 1 + 0.12 * e; g.sy = 1 - 0.07 * e; break;
    case 'costas': g.rot = sg * 8 * e; g.tx = ux * 2 * e; g.ty = uy * 2 * e; g.sx = 1 + 0.1 * e; break;
    case 'aceleracao': g.tx = ux * -1.5 * Math.min(1, pr * 3) * (1 - pr); g.ty = uy * -1.5 * Math.min(1, pr * 3) * (1 - pr); g.sx = 1 + 0.2 * e; g.sy = 1 - 0.1 * e; break;
    case 'orientado': g.rot = sg * 9 * e; break;
    case 'externo': g.rot = -sg * 10 * e; g.tx = -uy * 2 * e * sg; g.ty = ux * 2 * e * sg; break;
    case 'primeira': g.sx = 1 + 0.04 * e; break;
    default: g.sx = 1 + 0.1 * e; g.sy = 1 - 0.05 * e;
  }
  return g;
}
