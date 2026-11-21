// Biblioteca de dribles dos discos (Dynamic Play Intelligence).
// Cada drible é uma SEQUÊNCIA de deslocamentos reais do disco (preparação/engano → mudança de direção → saída), com controle da bola
// (a bola sempre acompanha o disco, só se afasta poucos pixels) e uma reação do marcador. A ESCOLHA depende do contexto
// (posição do defensor, espaço, pressão, atributos, função, foco, personalidade, memória) e muda a chance real do drible nos lances
// do jogo corrido: se falha, o marcador fica com a bola. Lances do plano (gols/defesas) continuam decididos pela simulação.
import { personalityOf, type Intel, type Side, type Style } from '@/lib/game/playIntel';

export type DribbleMove =
  | 'finta' | 'pedalada' | 'corte' | 'caneta' | 'giro' | 'direcao' | 'protecao' | 'aceleracao' | 'curto' | 'velocidade'
  | 'corteDentro' | 'corteFora' | 'mudRitmo' | 'giro180' | 'puxada' | 'zigzag'
  | 'pedaladaDupla' | 'elastico' | 'elasticoReverso' | 'fintaChute' | 'fintaPasse' | 'corteExplosivo' | 'sequencia';
export const DRIBBLE_MOVES: DribbleMove[] = [
  'finta', 'pedalada', 'corte', 'caneta', 'giro', 'direcao', 'protecao', 'aceleracao', 'curto', 'velocidade',
  'corteDentro', 'corteFora', 'mudRitmo', 'giro180', 'puxada', 'zigzag',
  'pedaladaDupla', 'elastico', 'elasticoReverso', 'fintaChute', 'fintaPasse', 'corteExplosivo', 'sequencia',
];
type P = { x: number; y: number };
// sg: multiplicador do lado do corpo neste passo (-1 = inclina para o lado contrário); bite: para onde o marcador "morde" a finta (deslocamento real)
export type DribbleStepPlan = { to: P; dur: number; speed?: number; phase: 'fake' | 'burst'; sg?: number; bite?: P };

// Trajeto: sg = lado por onde o atacante escapa do marcador, d = direção do ataque. Se o drible falha só o primeiro passo acontece.
export function dribbleGeometry(move: DribbleMove, h: P, opp: P, sg: number, d: number): DribbleStepPlan[] {
  const at = (dx: number, dy: number): P => ({ x: opp.x + d * dx, y: opp.y + sg * dy });
  switch (move) {
    case 'pedalada': return [{ to: at(-10, 34), dur: 430, phase: 'fake' }, { to: at(75, 24), dur: 380, phase: 'burst' }];
    case 'pedaladaDupla': return [{ to: at(-14, 30), dur: 330, phase: 'fake' }, { to: at(-6, 38), dur: 330, phase: 'fake', sg: -1 }, { to: at(78, 26), dur: 340, phase: 'burst' }];
    case 'corte': return [{ to: at(-18, -26), dur: 230, phase: 'fake' }, { to: at(62, 34), dur: 330, phase: 'burst' }];
    case 'corteDentro': return [{ to: at(-16, -16), dur: 220, phase: 'fake', bite: { x: 0, y: -sg * 8 } }, { to: at(58, 42), dur: 330, phase: 'burst' }];
    case 'corteFora': return [{ to: at(-16, -16), dur: 220, phase: 'fake', bite: { x: 0, y: -sg * 8 } }, { to: at(56, 44), dur: 330, phase: 'burst' }];
    case 'corteExplosivo': return [{ to: at(-16, 12), dur: 170, phase: 'fake' }, { to: at(78, 46), dur: 260, speed: 2.4, phase: 'burst' }];
    case 'caneta': return [{ to: at(-8, 10), dur: 330, phase: 'fake' }, { to: at(60, 18), dur: 420, phase: 'burst' }];
    case 'giro': return [{ to: at(-10, 20), dur: 460, phase: 'fake' }, { to: at(66, 30), dur: 380, phase: 'burst' }]; // giro de 360°
    case 'giro180': return [{ to: { x: h.x - d * 20, y: h.y + sg * 30 }, dur: 450, phase: 'fake' }, { to: { x: h.x - d * 52, y: h.y + sg * 52 }, dur: 380, phase: 'burst' }];
    case 'direcao': return [{ to: at(-30, 46), dur: 380, phase: 'fake' }, { to: at(80, -8), dur: 420, phase: 'burst' }]; // finta de direção
    case 'puxada': return [{ to: { x: h.x - d * 26, y: h.y }, dur: 270, phase: 'fake', bite: { x: -d * 22, y: 0 } }, { to: at(26, 44), dur: 360, phase: 'burst' }];
    case 'zigzag': return [{ to: at(-30, 38), dur: 260, phase: 'fake' }, { to: at(-12, -34), dur: 280, phase: 'fake', sg: -1 }, { to: at(72, -38), dur: 320, phase: 'burst' }];
    case 'sequencia': return [{ to: at(-26, 30), dur: 190, phase: 'fake' }, { to: at(-30, -26), dur: 190, phase: 'fake', sg: -1 }, { to: at(-20, 34), dur: 190, phase: 'fake' }, { to: at(72, 30), dur: 300, phase: 'burst' }];
    case 'mudRitmo': return [{ to: at(-42, 8), dur: 520, speed: 0.55, phase: 'fake' }, { to: at(95, 34), dur: 300, speed: 2.2, phase: 'burst' }];
    case 'elastico': return [{ to: at(-22, -30), dur: 200, phase: 'fake', sg: -1, bite: { x: 0, y: -sg * 14 } }, { to: at(24, 40), dur: 230, speed: 2, phase: 'burst' }];
    case 'elasticoReverso': return [{ to: at(-22, 34), dur: 200, phase: 'fake', bite: { x: 0, y: sg * 14 } }, { to: at(30, -34), dur: 240, speed: 2, phase: 'burst', sg: -1 }];
    case 'fintaChute': return [{ to: { x: h.x - d * 8, y: h.y }, dur: 280, phase: 'fake', bite: { x: -d * 20, y: 0 } }, { to: at(-6, 40), dur: 240, phase: 'fake' }, { to: at(66, 30), dur: 300, phase: 'burst' }];
    case 'fintaPasse': return [{ to: { x: h.x + d * 8, y: h.y - sg * 20 }, dur: 280, phase: 'fake', sg: -1, bite: { x: 0, y: -sg * 18 } }, { to: at(-4, 42), dur: 250, phase: 'fake' }, { to: at(66, 30), dur: 300, phase: 'burst' }];
    case 'protecao': return [{ to: { x: h.x + d * 22, y: h.y + sg * 8 }, dur: 760, phase: 'fake' }];
    case 'aceleracao': return [{ to: at(10, 44), dur: 300, speed: 1.9, phase: 'burst' }, { to: at(90, 30), dur: 280, speed: 1.9, phase: 'burst' }];
    case 'curto': return [{ to: at(-8, 22), dur: 220, phase: 'fake' }, { to: at(20, 16), dur: 220, phase: 'fake' }, { to: at(60, 24), dur: 300, phase: 'burst' }];
    case 'velocidade': return [{ to: at(30, 50), dur: 380, speed: 2.1, phase: 'burst' }, { to: at(140, 30), dur: 520, speed: 2.1, phase: 'burst' }];
    default: return [{ to: at(-6, 38), dur: 340, phase: 'fake' }, { to: at(70, 26), dur: 400, phase: 'burst' }]; // finta de corpo
  }
}

type Cap = { win: (a: string, b: string) => string; lose: (a: string, b: string) => string };
const cap = (win: string, lose: string): Cap => ({ win: (a, b) => win.replace('{a}', a).replace('{b}', b), lose: (a, b) => lose.replace('{a}', a).replace('{b}', b) });
export const DRIBBLE_CAPTION: Record<DribbleMove, Cap> = {
  finta: cap('{a} dribla {b}', '{a} tenta driblar {b}'),
  pedalada: cap('{a} pedala e deixa {b} para trás', '{a} pedala, mas {b} não cai na finta'),
  corte: cap('{a} faz o corte seco em {b}', '{a} tenta o corte seco e {b} acompanha'),
  caneta: cap('Caneta! {a} passa a bola entre as pernas de {b}', '{a} tenta a caneta em {b}, mas não dá'),
  giro: cap('{a} dá o giro de 360° sobre {b} e escapa', '{a} tenta girar e {b} chega junto'),
  direcao: cap('{a} finge a direção e passa por {b}', '{a} finge a direção, mas {b} fecha o caminho'),
  protecao: cap('{a} protege a bola de {b} com o corpo', '{a} é desarmado por {b} ao tentar proteger a bola'),
  aceleracao: cap('{a} acelera e ganha de {b} na corrida', '{a} acelera, mas {b} segura a corrida'),
  curto: cap('{a} faz o drible curto em {b}', '{a} tenta o drible curto e {b} rouba a bola'),
  velocidade: cap('{a} sai em velocidade e deixa {b} parado', '{a} sai em velocidade, mas {b} alcança'),
  corteDentro: cap('{a} corta para dentro e passa por {b}', '{a} tenta cortar para dentro e {b} fecha'),
  corteFora: cap('{a} corta para fora e escapa de {b}', '{a} tenta cortar para fora e {b} acompanha'),
  mudRitmo: cap('{a} para, muda o ritmo e deixa {b} para trás', '{a} muda o ritmo, mas {b} não se deixa enganar'),
  giro180: cap('{a} gira 180° e escapa da pressão de {b}', '{a} gira, mas {b} rouba a bola'),
  puxada: cap('{a} puxa a bola para trás e {b} passa direto', '{a} puxa a bola para trás, mas {b} chega junto'),
  zigzag: cap('{a} faz o zigue-zague e passa por {b}', '{a} tenta o zigue-zague e {b} acompanha'),
  pedaladaDupla: cap('{a} dá a pedalada dupla e {b} cai no engano', '{a} tenta a pedalada dupla, mas {b} não cai'),
  elastico: cap('Elástico! {a} engana {b} com a inversão', '{a} tenta o elástico e {b} lê o movimento'),
  elasticoReverso: cap('Elástico reverso! {a} passa por {b}', '{a} tenta o elástico reverso, mas {b} acompanha'),
  fintaChute: cap('{a} finge o chute e {b} se joga na bola', '{a} finge o chute, mas {b} não se mexe e rouba'),
  fintaPasse: cap('{a} finge o passe e {b} escorrega para o lado', '{a} finge o passe, mas {b} não cai'),
  corteExplosivo: cap('{a} corta com explosão e deixa {b} parado', '{a} tenta o corte explosivo, mas {b} chega junto'),
  sequencia: cap('{a} muda de direção três vezes e passa por {b}', '{a} se enrola nas mudanças de direção e {b} rouba'),
};

// Corpo e bola durante o drible. pr: 0 a 1 do passo, phase: engano (fake) ou saída (burst), sg: lado (já com o sinal do passo)
export type BodyFx = { rot: number; sx: number; sy: number; shift: number; ballFwd: number; ballLat: number; oppSway: number };
export function dribbleBody(move: DribbleMove, phase: 'fake' | 'burst', pr: number, sg: number): BodyFx {
  const s = Math.sin(pr * Math.PI), two = Math.sin(pr * Math.PI * 2);
  const out: BodyFx = { rot: 0, sx: 1, sy: 1, shift: 0, ballFwd: 0, ballLat: 0, oppSway: 1 };
  if (phase === 'burst') {
    out.rot = sg * s * 8; out.sx = 1 + 0.2 * s; out.sy = 1 - 0.1 * s;
    switch (move) {
      case 'corte': case 'corteDentro': case 'corteFora': out.rot = sg * s * 14; out.sx = 1 + 0.15 * s; break;
      case 'caneta': out.ballFwd = 26 * (1 - pr); break;
      case 'aceleracao': case 'velocidade': out.rot = sg * s * 4; out.sx = 1 + 0.26 * s; out.sy = 1 - 0.13 * s; break;
      case 'direcao': out.rot = -sg * s * 12; break;
      case 'mudRitmo': out.sx = 1 + 0.3 * s; out.sy = 1 - 0.14 * s; out.rot = sg * s * 3; break;
      case 'corteExplosivo': out.sx = 1 + 0.32 * s; out.sy = 1 - 0.15 * s; break;
      case 'elastico': case 'elasticoReverso': out.sx = 1 + 0.24 * s; out.rot = sg * s * 16; out.ballFwd = 8 * (1 - pr); break;
      case 'puxada': out.rot = sg * s * 10; break;
      default: break;
    }
    return out;
  }
  switch (move) {
    case 'pedalada': out.rot = sg * two * 14; out.sy = 1 + 0.1 * Math.abs(two); out.sx = 1 - 0.06 * s; out.shift = -sg * s * 4; out.ballLat = sg * two * 4; break;
    case 'pedaladaDupla': out.rot = sg * two * 15; out.sy = 1 + 0.12 * Math.abs(two); out.sx = 1 - 0.07 * s; out.ballLat = sg * two * 5; break;
    case 'corte': case 'corteDentro': case 'corteFora': out.rot = -sg * s * 18; out.shift = -sg * s * 8; out.sy = 1 + 0.08 * s; break;
    case 'caneta': out.rot = sg * s * 6; out.sy = 1 + 0.06 * s; out.ballFwd = 26 * Math.sin((pr * Math.PI) / 2); break;
    case 'giro': out.rot = sg * pr * 360; out.sx = 1 - 0.08 * s; out.sy = 1 + 0.06 * s; break;
    case 'giro180': out.rot = sg * pr * 180; out.sx = 1 - 0.06 * s; out.sy = 1 + 0.05 * s; out.ballLat = -sg * 6 * s; break;
    case 'direcao': out.rot = -sg * s * 12; out.shift = sg * s * 5; break;
    case 'protecao': out.rot = sg * 10 * s; out.sx = 1 + 0.1 * s; out.sy = 1 - 0.06 * s; out.ballLat = -sg * 7 * s; out.oppSway = 0.15; break;
    case 'curto': out.rot = sg * Math.sin(pr * Math.PI * 6) * 9; out.sy = 1 + 0.08 * Math.abs(Math.sin(pr * Math.PI * 6)); break;
    case 'puxada': out.sx = 1 - 0.1 * s; out.sy = 1 + 0.06 * s; out.ballFwd = -12 * s; break;
    case 'zigzag': out.rot = sg * s * 16; out.shift = sg * s * 5; break;
    case 'sequencia': out.rot = sg * s * 14; out.sx = 1 - 0.05 * s; break;
    case 'mudRitmo': out.sx = 1 - 0.05 * s; out.sy = 1 + 0.04 * s; break;
    case 'elastico': case 'elasticoReverso': out.rot = sg * s * 12; out.ballLat = sg * 11 * s; break; // a bola se estica para o lado do engano
    case 'fintaChute': out.sx = 1 - 0.12 * s; out.sy = 1 + 0.08 * s; out.ballFwd = -6 * s; out.rot = 0; break; // preparação do chute: comprime e recua
    case 'fintaPasse': out.rot = sg * s * 10; out.ballLat = sg * 8 * s; break;
    case 'corteExplosivo': out.sx = 1 - 0.12 * s; out.sy = 1 + 0.1 * s; break; // apoio antes da explosão
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
  sgIn: boolean; // o lado de escape do atacante é para dentro do campo (o marcador está do lado de fora)
  behind: number; // espaço livre atrás do marcador, entre os adversários (0 a 1): condição da caneta
  lane: boolean; // existe companheiro livre à frente (finta de passe tem sentido)
  canShoot: boolean; // perto do gol e de frente (finta de chute tem sentido)
};

// Exigência técnica: quem tem overall abaixo disso prefere movimentos simples e erra mais quando tenta
export const MIN_OVR: Record<DribbleMove, number> = {
  finta: 0, protecao: 0, aceleracao: 0, curto: 0, corteDentro: 0, corteFora: 0, corte: 70, direcao: 70, puxada: 72, mudRitmo: 74, velocidade: 74, giro180: 76, zigzag: 76,
  pedalada: 78, fintaPasse: 76, fintaChute: 78, sequencia: 80, giro: 80, corteExplosivo: 80, caneta: 80, pedaladaDupla: 83, elastico: 82, elasticoReverso: 85,
};

// Condições que o drible exige da situação para fazer sentido (se não valem, ele nem entra na escolha)
export function viable(move: DribbleMove, c: DribbleCtx): boolean {
  switch (move) {
    case 'caneta': return c.behind > 0.55 && c.gap > 16 && c.gap < 60; // só com espaço real atrás do marcador, entre os adversários
    case 'fintaChute': return c.canShoot && c.gap < 75;
    case 'fintaPasse': return c.lane && c.gap < 75;
    case 'corteDentro': return c.sgIn && c.gap < 70;
    case 'corteFora': return !c.sgIn && c.gap < 70;
    case 'velocidade': return c.space >= 0.4 && c.toGoal > 160;
    case 'aceleracao': return c.space >= 0.25;
    case 'giro180': return c.pressure > 0.45;
    case 'protecao': return c.pressure >= 0.35;
    case 'puxada': case 'zigzag': case 'sequencia': case 'pedaladaDupla': case 'elastico': case 'elasticoReverso': case 'corteExplosivo': return c.gap < 80;
    default: return true;
  }
}

// Quão bem o drible combina com a situação (entra na chance real de dar certo)
export function moveFit(move: DribbleMove, c: DribbleCtx): number {
  const edge = (c.holder.ovr - c.opp.ovr) / 20;
  const skillGap = Math.min(0, (c.holder.ovr - MIN_OVR[move]) / 60); // tentar acima do nível custa chance
  let f = 0;
  switch (move) {
    case 'aceleracao': f = 0.1 * c.space - 0.04 * c.pressure; break;
    case 'velocidade': f = c.toGoal > 200 ? 0.11 * c.space - 0.05 * c.pressure : -0.05; break;
    case 'protecao': f = 0.1 * c.pressure + (c.gap < 36 ? 0.03 : -0.02); break;
    case 'giro': f = c.gap < 40 ? 0.06 * c.pressure + 0.02 : -0.05; break;
    case 'giro180': f = 0.09 * c.pressure + 0.02; break;
    case 'pedalada': f = 0.05 * edge - 0.03 * c.pressure + 0.02; break;
    case 'pedaladaDupla': f = 0.06 * edge - 0.04 * c.pressure + 0.03; break;
    case 'caneta': f = 0.06 * edge - 0.1 + (c.gap < 50 ? 0.04 : -0.03) + 0.1 * (c.behind - 0.55); break;
    case 'corte': f = c.wide ? 0.07 : -0.01; break;
    case 'corteDentro': f = 0.06 + 0.03 * c.space; break;
    case 'corteFora': f = c.wide ? 0.06 : 0.02; break;
    case 'corteExplosivo': f = 0.07 * c.space + 0.03 * edge; break;
    case 'curto': f = c.gap < 55 ? 0.05 : 0; break;
    case 'direcao': f = 0.03 * (1 - c.space) + 0.02; break;
    case 'mudRitmo': f = 0.07 * c.space - 0.03 * c.pressure; break;
    case 'puxada': f = c.gap < 45 ? 0.05 : -0.01; break;
    case 'zigzag': f = 0.04 * c.space + 0.02; break;
    case 'sequencia': f = 0.05 * (1 - c.space) - 0.02 * c.pressure + 0.02; break;
    case 'elastico': case 'elasticoReverso': f = 0.07 * edge + 0.03 - 0.03 * c.pressure; break;
    case 'fintaChute': f = 0.08 + 0.02 * edge; break;
    case 'fintaPasse': f = 0.06 + 0.02 * edge; break;
    default: f = 0;
  }
  return f + skillGap * 0.4;
}

const ROLE: Record<string, Partial<Record<DribbleMove, number>>> = {
  'wg-wide': { aceleracao: 1.4, velocidade: 1.4, corte: 1.4, corteFora: 1.4, corteExplosivo: 1.3, mudRitmo: 1.2 },
  'wg-inf': { direcao: 1.3, caneta: 1.2, pedalada: 1.2, pedaladaDupla: 1.2, corteDentro: 1.5, corte: 1.1, elastico: 1.3, zigzag: 1.2 },
  'wg-play': { curto: 1.2, direcao: 1.1, fintaPasse: 1.4, sequencia: 1.1 },
  'wg-bal': { aceleracao: 1.1, corte: 1.1, corteDentro: 1.1 },
  'at-pivot': { protecao: 1.7, giro: 1.4, giro180: 1.6, puxada: 1.2 },
  'at-f9': { curto: 1.2, giro: 1.2, fintaChute: 1.3, fintaPasse: 1.2, puxada: 1.2 },
  'at-mobile': { velocidade: 1.3, direcao: 1.3, aceleracao: 1.2, corteExplosivo: 1.3, mudRitmo: 1.3, zigzag: 1.2 },
  'at-fin': { protecao: 1.1, giro: 1.1, fintaChute: 1.5, corteDentro: 1.3 },
  'mc-hold': { protecao: 1.4, curto: 1.1, caneta: 0.5, velocidade: 0.6, giro180: 1.3, puxada: 1.2, elastico: 0.5, elasticoReverso: 0.5 },
  'mc-play': { curto: 1.3, giro: 1.2, direcao: 1.1, fintaPasse: 1.4, mudRitmo: 1.2, giro180: 1.2 },
  'mc-b2b': { aceleracao: 1.2, velocidade: 1.2, mudRitmo: 1.1 },
  'mc-inf': { direcao: 1.2, caneta: 1.2, sequencia: 1.2, elasticoReverso: 1.2 },
  'df-build': { protecao: 1.2, curto: 1.1, giro180: 1.2 },
  'df-aggr': { velocidade: 1.2 },
};
const REPEAT = 6;
const SIMPLE: DribbleMove[] = ['finta', 'protecao', 'aceleracao', 'curto', 'corteDentro', 'corteFora'];

export function chooseDribble(intel: Intel, c: DribbleCtx, rnd: () => number = Math.random, allowed: (m: DribbleMove) => boolean = () => true): DribbleMove {
  const p = personalityOf(c.holder.name, c.holder.ovr);
  const base: Record<DribbleMove, number> = {
    finta: 2, pedalada: 1.1, corte: 1, caneta: 0.35, giro: 0.7, direcao: 1.1, protecao: 0.8, aceleracao: 1.2, curto: 1.2, velocidade: 0.9,
    corteDentro: 1, corteFora: 0.9, mudRitmo: 0.8, giro180: 0.6, puxada: 0.6, zigzag: 0.7,
    pedaladaDupla: 0.5, elastico: 0.5, elasticoReverso: 0.4, fintaChute: 0.6, fintaPasse: 0.6, corteExplosivo: 0.7, sequencia: 0.5,
  };
  const w = { ...base } as Record<DribbleMove, number>;
  const roleMult = ROLE[c.holder.style?.role ?? ''] ?? {};
  const focus = c.holder.style?.focus;
  const log = intel.dribbles[c.side].slice(-REPEAT);
  DRIBBLE_MOVES.forEach((m) => {
    if (!viable(m, c)) { w[m] = 0; return; }
    let v = w[m] * (roleMult[m] ?? 1);
    // Habilidade: movimento difícil quase só sai com overall à altura; quem é menos técnico prefere o simples e seguro
    const skill = 1 / (1 + Math.exp(-(c.holder.ovr - MIN_OVR[m]) / 3.5));
    v *= Math.max(0.06, skill);
    if (c.holder.ovr < 76 && SIMPLE.includes(m)) v *= 1.5;
    if (c.holder.ovr >= 86 && !SIMPLE.includes(m)) v *= 1.2;
    // Personalidade
    if (['pedalada', 'pedaladaDupla', 'caneta', 'giro', 'elastico', 'elasticoReverso', 'sequencia', 'fintaPasse'].includes(m)) v *= 0.75 + 0.6 * p.criatividade;
    if (['aceleracao', 'velocidade', 'corte', 'corteExplosivo', 'corteDentro', 'corteFora', 'mudRitmo', 'fintaChute'].includes(m)) v *= 0.8 + 0.5 * p.ousadia;
    if (['protecao', 'curto', 'puxada', 'giro180'].includes(m)) v *= 0.8 + 0.5 * p.coletivo;
    if (focus === 'off' && ['aceleracao', 'velocidade', 'caneta', 'pedalada', 'corteExplosivo', 'elastico', 'fintaChute'].includes(m)) v *= 1.2;
    if (focus === 'def' && ['protecao', 'curto', 'puxada', 'giro180'].includes(m)) v *= 1.3;
    if (focus === 'free') v *= m === 'finta' ? 0.9 : 1.15;
    // Situação
    v *= Math.max(0.2, 1 + moveFit(m, c) * 6);
    if (c.pressure > 0.7 && ['caneta', 'pedalada', 'pedaladaDupla', 'elastico', 'elasticoReverso'].includes(m)) v *= 0.6;
    // Memória: o que o time acabou de usar pesa menos (nunca zera); o que deu certo contra esse adversário pesa mais
    let rep = 0, ok = 0, bad = 0;
    log.forEach((r, i) => { if (r.move === m) { rep += Math.exp(-(log.length - 1 - i) / 2.5); if (r.win) ok += 1; else bad += 1; } });
    v *= Math.max(0.45, 1 / (1 + 0.5 * rep));
    if (ok > bad) v *= 1.1;
    if (bad >= 2 && ok === 0) v *= 0.7;
    w[m] = allowed(m) ? v : 0;
  });
  const total = DRIBBLE_MOVES.reduce((s, m) => s + w[m], 0);
  if (total <= 0) return allowed('finta') ? 'finta' : DRIBBLE_MOVES.find((m) => allowed(m)) ?? 'finta';
  let roll = rnd() * total;
  for (const m of DRIBBLE_MOVES) { roll -= w[m]; if (roll <= 0 && w[m] > 0) return m; }
  return 'finta';
}
export function recordDribble(intel: Intel, side: Side, move: DribbleMove, win: boolean) {
  intel.dribbles[side].push({ move, win });
  if (intel.dribbles[side].length > 16) intel.dribbles[side].shift();
}
