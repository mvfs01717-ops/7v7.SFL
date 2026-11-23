// Football Intelligence 2.0: camada local (sem serviços externos) de percepção limitada, memória do adversário, aprendizado na partida,
// personalidade e motor de decisão por pontuação. Funções puras e baratas: rodam só quando um jogador decide (não a cada quadro).
// Nada aqui muda o desfecho do plano (gol/defesa/chute): só as escolhas de jogo corrido e a coreografia.
export type Side = 'user' | 'bot';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

// ---------- Personalidade (6 tendências estáveis por atleta; não trocam a função tática) ----------
export type Traits = { criativo: number; objetivo: number; conservador: number; agressivo: number; inteligente: number; imprevisivel: number };
export const TRAIT_LABEL: Record<keyof Traits, string> = { criativo: 'Criativo', objetivo: 'Objetivo', conservador: 'Conservador', agressivo: 'Agressivo', inteligente: 'Inteligente', imprevisivel: 'Imprevisível' };
export function traitsOf(name: string, ovr: number, base: { ousadia: number; criatividade: number; coletivo: number }, pos: string): Traits {
  const skill = clamp((ovr - 80) / 12, -1, 1);
  const def = pos === 'LB' || pos === 'RB' ? 0.12 : 0;
  return {
    criativo: clamp(base.criatividade, 0, 1),
    objetivo: clamp(base.ousadia * 0.55 + (1 - base.coletivo) * 0.45, 0, 1),
    conservador: clamp(1 - base.ousadia * 0.9 + def * 0.5, 0, 1),
    agressivo: clamp(hash(`a:${name}`) * 0.75 + 0.1 + def, 0, 1),
    inteligente: clamp(0.3 + skill * 0.3 + hash(`i:${name}`) * 0.4, 0, 1),
    imprevisivel: clamp(hash(`u:${name}`) * 0.85 + 0.05, 0, 1),
  };
}
export function mainTrait(t: Traits): keyof Traits {
  return (Object.keys(t) as (keyof Traits)[]).sort((a, b) => t[b] - t[a])[0];
}

// ---------- Percepção limitada ----------
// O jogador nunca sabe a posição exata de todo mundo: o erro cresce com a distância, a velocidade do alvo, a pressão, o cansaço
// e quando o alvo está atrás dele; um overall alto enxerga melhor.
export type Obs = { x: number; y: number; ovr: number; tired: number; face: number }; // face: +1 olha para +x, -1 para -x
export type Tgt = { x: number; y: number; vx: number; vy: number };
export function perceiveErr(o: Obs, t: Tgt, pressure: number): number {
  const d = Math.hypot(t.x - o.x, t.y - o.y);
  const behind = (t.x - o.x) * o.face < -10 ? 11 : 0;
  const sp = Math.hypot(t.vx, t.vy);
  return Math.max(2, 3 + d * 0.055 + behind + sp * 0.05 + pressure * 9 + o.tired * 8 - (o.ovr - 75) * 0.12);
}
// Posição percebida (com erro) e qualidade da leitura (0 a 1)
export function perceive(o: Obs, t: Tgt, pressure: number, rnd: () => number): { x: number; y: number; q: number } {
  const e = perceiveErr(o, t, pressure);
  const g = () => (rnd() + rnd() + rnd() - 1.5) * 0.8; // aproximação de gaussiana
  return { x: t.x + g() * e, y: t.y + g() * e, q: 1 / (1 + e / 22) };
}

// ---------- Memória do adversário ----------
// Contadores com decaimento (meia-vida ~45 s). A confiança só aparece depois de algumas repetições e nunca passa de 0,55: aprende aos poucos, não é perfeita.
export type MemKind = 'passL' | 'passC' | 'passR' | 'short' | 'long' | 'run' | 'shoot' | 'carryU' | 'carryD' | 'press';
type Cell = { n: number; at: number };
export type Memory = Record<Side, Record<string, Cell>>;
export const newMemory = (): Memory => ({ user: {}, bot: {} });
const HALF = 45000;
const decayed = (c: Cell | undefined, now: number) => (c ? c.n * Math.exp(-(now - c.at) / HALF * 0.693) : 0);
// `atk` é o time que FEZ a ação (o outro time é quem aprende)
export function memNote(m: Memory, atk: Side, kind: MemKind, key: string, now: number, w = 1) {
  const k = `${kind}:${key}`;
  const c = m[atk][k];
  m[atk][k] = { n: decayed(c, now) + w, at: now };
}
export function memConf(m: Memory, atk: Side, kind: MemKind, key: string, now: number): number {
  const n = decayed(m[atk][`${kind}:${key}`], now);
  return clamp((n - 2) * 0.14, 0, 0.55);
}
// Quão previsível é o time num conjunto de hábitos (ex.: lado preferido dos passes): parcela do mais usado, só com amostra mínima
export function memShare(m: Memory, atk: Side, kinds: MemKind[], key: string, now: number): { top: MemKind | null; share: number; n: number } {
  const vals = kinds.map((k) => decayed(m[atk][`${k}:${key}`], now));
  const n = vals.reduce((a, b) => a + b, 0);
  if (n < 4) return { top: null, share: 0, n };
  const i = vals.indexOf(Math.max(...vals));
  return { top: kinds[i], share: vals[i] / n, n };
}

// ---------- Aprendizado na partida (o jogador evita o que tem falhado) ----------
type Rec = { tries: number; fails: number; at: number };
export type Learn = Record<string, Rec>;
export const newLearn = (): Learn => ({});
const LHALF = 70000;
const lr = (l: Learn, k: string, now: number): Rec => {
  const r = l[k] ?? { tries: 0, fails: 0, at: now };
  const f = Math.exp(-(now - r.at) / LHALF * 0.693);
  return { tries: r.tries * f, fails: r.fails * f, at: now };
};
export function learnTry(l: Learn, who: string, kind: string, now: number) {
  const k = `${who}|${kind}`;
  const r = lr(l, k, now);
  r.tries += 1;
  l[k] = r;
}
export function learnFail(l: Learn, who: string, kind: string, now: number) {
  const k = `${who}|${kind}`;
  const r = lr(l, k, now);
  r.fails += 1;
  r.tries = Math.max(r.tries, r.fails);
  l[k] = r;
}
// Multiplicador de peso da opção: cai quando falha muito (>40%), sobe um pouco quando dá certo; só com 3+ tentativas
export function learnMul(l: Learn, who: string, kind: string, now: number): number {
  const rec = l[`${who}|${kind}`];
  if (!rec) return 1;
  const r = lr(l, `${who}|${kind}`, now);
  if (r.tries < 3) return 1;
  const rate = r.fails / r.tries;
  return clamp(1 - (rate - 0.4) * 1.1, 0.55, 1.2);
}

// ---------- Prioridades de decisão por função (as 19) ----------
export type Opt = 'dribble' | 'carry' | 'pass' | 'shield' | 'back';
const M = (o: Partial<Record<Opt, number>>) => o;
export const ROLE_DECISION: Record<string, Partial<Record<Opt, number>>> = {
  'gk-trad': M({ pass: 1.1, back: 0.7, dribble: 0.2, carry: 0.3 }), 'gk-build': M({ pass: 1.35, dribble: 0.2, carry: 0.4 }), 'gk-libero': M({ pass: 1.2, carry: 0.7, dribble: 0.3 }),
  'df-build': M({ pass: 1.3, carry: 1.1, dribble: 0.6, back: 1.1 }), 'df-mark': M({ pass: 1.15, dribble: 0.5, carry: 0.7, back: 1.2 }), 'df-anti': M({ pass: 1.15, dribble: 0.6, back: 1.1 }), 'df-aggr': M({ carry: 1.3, dribble: 0.9, pass: 0.95 }),
  'mc-play': M({ pass: 1.4, dribble: 0.8, carry: 0.9, shield: 1.1 }), 'mc-b2b': M({ carry: 1.3, pass: 1, dribble: 1 }), 'mc-hold': M({ pass: 1.25, back: 1.3, dribble: 0.5, shield: 1.2 }), 'mc-inf': M({ dribble: 1.3, carry: 1.2, pass: 0.9 }),
  'wg-wide': M({ carry: 1.35, dribble: 1.1, pass: 0.95 }), 'wg-inf': M({ dribble: 1.4, carry: 1.1, pass: 0.85 }), 'wg-play': M({ pass: 1.3, dribble: 0.9, shield: 1.1 }), 'wg-bal': M({ carry: 1.05, pass: 1.05 }),
  'at-fin': M({ dribble: 1.1, carry: 1.0, pass: 0.8, shield: 0.9 }), 'at-f9': M({ pass: 1.3, back: 1.2, dribble: 0.9 }), 'at-pivot': M({ shield: 1.6, back: 1.25, pass: 1.2, dribble: 0.6, carry: 0.6 }), 'at-mobile': M({ carry: 1.3, dribble: 1.2, pass: 0.9 }),
};

// ---------- Motor de decisão do portador ----------
export type DecideCtx = {
  pressure: number; // 0 a 1
  nearD: number; // distância do adversário mais perto (px)
  toGoal: number;
  room: number; // espaço livre à frente (px)
  canDribble: boolean; // há adversário à frente para driblar
  passQ: number; // qualidade percebida da melhor opção de passe (0 a 1)
  backOpen: boolean;
  urgency: number; // -1 (proteger resultado) a +1 (precisa atacar)
  tired: number;
  vision: number; // 0 a 1: leitura média do ambiente (percepção)
  role?: string;
  traits: Traits;
  learn: Partial<Record<Opt, number>>; // multiplicadores aprendidos
  oppPress: number; // confiança de que o adversário pressiona forte (memória)
  shieldStreak: number; // quantas vezes seguidas já protegeu a bola
};
export type Decision = { opt: Opt; why: string; w: Record<Opt, number> };
export function decide(c: DecideCtx, rnd: () => number = Math.random): Decision {
  const t = c.traits;
  const w: Record<Opt, number> = { pass: 0, dribble: 0, carry: 0, shield: 0, back: 0 };
  // passar é sempre possível; vale mais quando a opção é boa e quando o adversário pressiona forte (toque rápido)
  w.pass = 0.9 + c.passQ * 1.3 + t.objetivo * 0.2 + c.oppPress * 0.8;
  if (c.canDribble) w.dribble = (0.35 + (1 - c.pressure) * 0.35 + t.criativo * 0.75 + t.objetivo * 0.15) * (1 - c.tired * 0.5);
  if (c.room > 100 && c.nearD > 42) w.carry = (0.45 + Math.min(1, c.room / 380) * 0.8 + t.objetivo * 0.35 - t.conservador * 0.3 + t.agressivo * 0.1) * (1 - c.tired * 0.4);
  if (c.pressure > 0.4 && c.shieldStreak < 2) w.shield = 0.15 + c.pressure * 0.9 + (1 - c.passQ) * 0.9 + t.conservador * 0.35 - c.oppPress * 0.4;
  if (c.backOpen && c.pressure > 0.25) w.back = 0.15 + c.pressure * 0.6 + t.conservador * 0.5 + (1 - c.passQ) * 0.3;
  // placar e tempo: perdendo = arrisca (frente), vencendo = valoriza a posse
  const u = c.urgency;
  w.dribble *= 1 + 0.35 * u;
  w.carry *= 1 + 0.35 * u;
  w.pass *= 1 + 0.1 * u;
  w.shield *= 1 - 0.35 * u;
  w.back *= 1 - 0.5 * u;
  // função: prioridades próprias
  const rd = (c.role && ROLE_DECISION[c.role]) || {};
  (Object.keys(w) as Opt[]).forEach((k) => {
    w[k] *= rd[k] ?? 1;
    w[k] *= c.learn[k] ?? 1;
  });
  // imprevisível varia mais; quem lê bem o jogo (visão) erra menos a escolha
  const noise = 0.12 + t.imprevisivel * 0.5 - c.vision * 0.08;
  (Object.keys(w) as Opt[]).forEach((k) => {
    if (w[k] > 0) w[k] = Math.max(0.01, w[k] * (1 + (rnd() - 0.5) * 2 * noise));
  });
  const keys = (Object.keys(w) as Opt[]).filter((k) => w[k] > 0);
  const pw = keys.map((k) => w[k] ** 1.5);
  let r = rnd() * pw.reduce((a, b) => a + b, 0);
  let opt: Opt = 'pass';
  for (let i = 0; i < keys.length; i += 1) {
    r -= pw[i];
    if (r <= 0) { opt = keys[i]; break; }
  }
  const why: Record<Opt, string> = {
    pass: c.pressure > 0.5 ? 'toque rápido sob pressão' : 'melhor opção de passe',
    dribble: t.criativo > 0.6 ? 'tenta algo diferente (criativo)' : 'encara o marcador',
    carry: c.room > 200 ? 'espaço livre à frente: conduz' : 'avança com a bola',
    shield: 'sem opção boa e pressionado: protege a bola',
    back: 'recua para reorganizar',
  };
  return { opt, why: why[opt], w };
}

// ---------- Coordenação: dois jogadores não disputam o mesmo espaço ----------
// Quem está mais longe da bola abre para o lado livre. `held` evita oscilar (o deslocamento vale por um tempo).
export function clashDy(me: { x: number; y: number; prio: number }, mates: { x: number; y: number; prio: number }[], yMin: number, yMax: number): number {
  for (const m of mates) {
    if (Math.hypot(me.x - m.x, me.y - m.y) < 46 && m.prio <= me.prio) {
      const dir = me.y >= m.y ? 1 : -1;
      const want = me.y + dir * 52;
      return clamp(want, yMin, yMax) - me.y;
    }
  }
  return 0;
}
