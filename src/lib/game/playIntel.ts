// Dynamic Play Intelligence — decisão e memória das jogadas na animação do campo (MatchPitch).
// O RESULTADO do lance (gol, defesa, chute) continua vindo do plano da simulação. Aqui só se decide COMO a jogada é montada:
// cada jogada pesa função, foco, personalidade, posição, contexto, memória recente e o que o adversário vem mostrando.
// Nada é proibido: a memória só diminui o peso do que se repetiu, e jogada que deu gol perde menos peso.
export type Side = 'user' | 'bot';
export type PlayKind =
  | 'central' | 'ponta' | 'lancamento' | 'tabela' | 'solo' | 'contra' | 'longe'
  | 'ultrapassagem' | 'triangulo' | 'infiltracao' | 'recomeco' | 'troca';
export const PLAY_KINDS: PlayKind[] = ['central', 'ponta', 'lancamento', 'tabela', 'solo', 'contra', 'longe', 'ultrapassagem', 'triangulo', 'infiltracao', 'recomeco', 'troca'];
export type Outcome = 'gol' | 'defesa' | 'finalização' | 'posse';
export type Style = { role: string; focus: string };
type Mult = Partial<Record<PlayKind, number>>;

type Rec = { kind: PlayKind; actor: string; out: Outcome; n: number };
type Opp = { tried: Partial<Record<PlayKind, number>>; failed: Partial<Record<PlayKind, number>> };
export type Intel = {
  n: number;
  plays: Record<Side, Rec[]>;
  seen: Record<Side, Opp>; // como o time (lado) se deu contra o adversário até agora
  passes: Record<string, number[]>; // "de>para" -> instantes (contador n) dos passes
  ambient: Record<Side, { kind: string; n: number }[]>;
  dribbles: Record<Side, { move: string; win: boolean }[]>; // dribles recentes e se deram certo
};
export const createIntel = (): Intel => ({
  n: 0,
  plays: { user: [], bot: [] },
  seen: { user: { tried: {}, failed: {} }, bot: { tried: {}, failed: {} } },
  passes: {},
  ambient: { user: [], bot: [] },
  dribbles: { user: [], bot: [] },
});

// Personalidade estável de cada atleta (não há atributos detalhados no banco; o nome gera uma tendência fixa, o overall ajusta)
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
export type Personality = { ousadia: number; criatividade: number; coletivo: number };
export function personalityOf(name: string, ovr: number): Personality {
  const skill = Math.max(-1, Math.min(1, (ovr - 80) / 12));
  return {
    ousadia: Math.max(0, Math.min(1, hash(`o:${name}`) * 0.8 + 0.1 + skill * 0.05)),
    criatividade: Math.max(0, Math.min(1, hash(`c:${name}`) * 0.7 + 0.1 + skill * 0.2)),
    coletivo: Math.max(0, Math.min(1, hash(`k:${name}`) * 0.8 + 0.1 - skill * 0.05)),
  };
}

// Cada função puxa certas jogadas
const ROLE_MULT: Record<string, Mult> = {
  'gk-build': { recomeco: 1.3, central: 1.1 }, 'gk-libero': { lancamento: 1.2, contra: 1.15 },
  'df-build': { recomeco: 1.3, central: 1.15 }, 'df-aggr': { lancamento: 1.2, ultrapassagem: 1.25 }, 'df-anti': { recomeco: 1.1 },
  'mc-play': { triangulo: 1.35, central: 1.2, tabela: 1.15 }, 'mc-b2b': { central: 1.1, infiltracao: 1.15, ultrapassagem: 1.1 },
  'mc-hold': { recomeco: 1.35, central: 1.1, longe: 0.8 }, 'mc-inf': { infiltracao: 1.4, longe: 1.15, troca: 1.1 },
  'wg-wide': { ponta: 1.35, ultrapassagem: 1.3, solo: 1.05 }, 'wg-inf': { infiltracao: 1.35, solo: 1.2, troca: 1.2, ponta: 0.8 },
  'wg-play': { tabela: 1.25, triangulo: 1.25, troca: 1.1 }, 'wg-bal': { ponta: 1.1, ultrapassagem: 1.1 },
  'at-fin': { infiltracao: 1.25, longe: 1.1, contra: 1.1 }, 'at-f9': { tabela: 1.35, triangulo: 1.2, troca: 1.25, solo: 0.9 },
  'at-pivot': { tabela: 1.3, recomeco: 1.15, lancamento: 1.15 }, 'at-mobile': { infiltracao: 1.3, troca: 1.3, contra: 1.25 },
};
const FOCUS_MULT: Record<string, Mult> = {
  def: { recomeco: 1.3, central: 1.15, contra: 0.85, solo: 0.8, longe: 0.8 },
  off: { contra: 1.2, lancamento: 1.15, infiltracao: 1.2, longe: 1.15, solo: 1.15, recomeco: 0.75 },
  sup: { tabela: 1.2, triangulo: 1.2, ultrapassagem: 1.2 },
  free: { troca: 1.3, solo: 1.2, infiltracao: 1.2 },
};
const POS_MULT: Record<string, Mult> = {
  CF: { infiltracao: 1.15, tabela: 1.1, ponta: 0.7, ultrapassagem: 0.6 },
  CM: { triangulo: 1.15, central: 1.1, longe: 1.1, ultrapassagem: 0.6 },
  LF: { ponta: 1.1, ultrapassagem: 1.1, solo: 1.1 }, RF: { ponta: 1.1, ultrapassagem: 1.1, solo: 1.1 },
  LB: { ponta: 1.05, lancamento: 1.1 }, RB: { ponta: 1.05, lancamento: 1.1 },
};
const mul = (acc: Record<PlayKind, number>, m: Mult | undefined, power = 1) => {
  if (!m) return;
  (Object.keys(m) as PlayKind[]).forEach((k) => { acc[k] *= (m[k] as number) ** power; });
};
const ones = (): Record<PlayKind, number> => Object.fromEntries(PLAY_KINDS.map((k) => [k, 1])) as Record<PlayKind, number>;

export type PlayCtx = {
  side: Side;
  evType: Outcome;
  actor: { pos: string; name: string; ovr: number; style?: Style };
  team?: Partial<Record<string, Style>>; // função e foco de cada vaga do time que ataca
  can: Partial<Record<PlayKind, boolean>>; // quais jogadas têm gente suficiente para existir
  opp: { central: number; wide: number; line: number; pressure: number }; // defensores no corredor central e nas laterais, linha defensiva (0 = no próprio gol, 1 = alta) e pressão sobre a bola
  clipped?: boolean; // jogada curta para não acumular fila
};
const BASE: Record<PlayKind, number> = {
  central: 3, ponta: 2.2, lancamento: 1.5, tabela: 2, solo: 2, contra: 1.4, longe: 1.6,
  ultrapassagem: 1.5, triangulo: 1.6, infiltracao: 1.6, recomeco: 1, troca: 1,
};
const REPEAT_WINDOW = 8;
const decay = (age: number) => Math.exp(-age / 4);

// Quanto a jogada se repetiu (jogadas recentes do time pesam mais). Jogada que terminou em gol perde só metade do peso.
function repetition(intel: Intel, side: Side, kind: PlayKind, actor: string): { team: number; actor: number } {
  let team = 0, mine = 0;
  intel.plays[side].slice(-REPEAT_WINDOW).forEach((r) => {
    if (r.kind !== kind) return;
    const w = decay(intel.n - r.n) * (r.out === 'gol' ? 0.5 : 1);
    team += w;
    if (r.actor === actor) mine += w;
  });
  return { team, actor: mine };
}

export function playWeights(intel: Intel, ctx: PlayCtx): Record<PlayKind, number> {
  const w = ones();
  const sty = ctx.actor.style;
  mul(w, ROLE_MULT[sty?.role ?? '']);
  mul(w, FOCUS_MULT[sty?.focus ?? '']);
  mul(w, POS_MULT[ctx.actor.pos]);
  // O resto do time também dá o tom (mais suave)
  Object.values(ctx.team ?? {}).forEach((s) => { if (s && s !== sty) mul(w, ROLE_MULT[s.role], 0.25); });
  const p = personalityOf(ctx.actor.name, ctx.actor.ovr);
  const o = 0.8 + 0.5 * p.ousadia, c = 0.8 + 0.5 * p.criatividade, k = 0.8 + 0.5 * p.coletivo;
  w.longe *= ctx.evType === 'gol' ? 0.6 : 1.2;
  w.solo *= o; w.longe *= o; w.lancamento *= o; w.contra *= (o + 1) / 2;
  w.infiltracao *= c; w.troca *= c; w.triangulo *= (c + k) / 2; w.ultrapassagem *= (c + k) / 2;
  w.tabela *= k; w.recomeco *= k; w.central *= (k + 1) / 2;
  if (ctx.actor.ovr >= 86) { w.solo *= 1.1; w.longe *= 1.1; }
  // Contexto: como o adversário está postado agora
  const { central, line, pressure } = ctx.opp;
  if (central >= 3) { w.central *= 0.7; w.ponta *= 1.3; w.ultrapassagem *= 1.3; w.longe *= 1.15; w.troca *= 1.1; }
  else if (central <= 1) { w.central *= 1.2; w.infiltracao *= 1.3; w.triangulo *= 1.1; }
  if (ctx.opp.wide >= 2) { w.ponta *= 0.85; w.central *= 1.1; }
  if (line > 0.62) { w.lancamento *= 1.3; w.contra *= 1.2; w.infiltracao *= 1.3; }
  else if (line < 0.4) { w.lancamento *= 0.8; w.tabela *= 1.1; w.triangulo *= 1.1; }
  if (pressure > 0.55) { w.tabela *= 1.3; w.triangulo *= 1.25; w.recomeco *= 1.2; w.solo *= 0.7; w.longe *= 0.85; }
  // Adaptação: o que não está funcionando contra esse adversário perde espaço e as alternativas ganham
  const seen = intel.seen[ctx.side];
  PLAY_KINDS.forEach((kind) => {
    const tried = seen.tried[kind] ?? 0, failed = seen.failed[kind] ?? 0;
    if (tried >= 2) {
      const rate = failed / tried;
      w[kind] *= rate >= 0.99 ? 0.7 : rate > 0.6 ? 0.85 : 1;
    }
  });
  const crossFail = (seen.failed.ponta ?? 0) + (seen.failed.ultrapassagem ?? 0), crossTry = (seen.tried.ponta ?? 0) + (seen.tried.ultrapassagem ?? 0);
  if (crossTry >= 2 && crossFail / crossTry > 0.7) { w.infiltracao *= 1.15; w.triangulo *= 1.1; w.central *= 1.05; }
  const midFail = (seen.failed.central ?? 0) + (seen.failed.triangulo ?? 0), midTry = (seen.tried.central ?? 0) + (seen.tried.triangulo ?? 0);
  if (midTry >= 2 && midFail / midTry > 0.7) { w.ponta *= 1.15; w.ultrapassagem *= 1.1; w.lancamento *= 1.1; }
  // Memória: repetição pesa menos, sem nunca zerar
  PLAY_KINDS.forEach((kind) => {
    const r = repetition(intel, ctx.side, kind, ctx.actor.name);
    w[kind] *= Math.max(0.4, 1 / (1 + 0.55 * r.team)) * Math.max(0.55, 1 / (1 + 0.35 * r.actor));
  });
  PLAY_KINDS.forEach((kind) => { w[kind] = ctx.can[kind] === false ? 0 : w[kind] * BASE[kind]; });
  if (ctx.clipped) { PLAY_KINDS.forEach((kind) => { if (kind !== 'longe') w[kind] = 0; }); w.longe = 1; }
  return w;
}

export function choosePlay(intel: Intel, ctx: PlayCtx, rnd: () => number = Math.random): PlayKind {
  const w = playWeights(intel, ctx);
  const total = PLAY_KINDS.reduce((s, k) => s + w[k], 0);
  if (total <= 0) return 'central';
  let roll = rnd() * total;
  for (const k of PLAY_KINDS) { roll -= w[k]; if (roll <= 0 && w[k] > 0) return k; }
  return 'central';
}

// Guarda o que foi tentado e como terminou (alimenta a memória e a adaptação)
export function recordPlay(intel: Intel, side: Side, kind: PlayKind, actor: string, out: Outcome) {
  intel.n += 1;
  intel.plays[side].push({ kind, actor, out, n: intel.n });
  if (intel.plays[side].length > 24) intel.plays[side].shift();
  const seen = intel.seen[side];
  seen.tried[kind] = (seen.tried[kind] ?? 0) + 1;
  if (out !== 'gol') seen.failed[kind] = (seen.failed[kind] ?? 0) + 1;
  // O aprendizado esquece devagar, para acompanhar a mudança do adversário durante a partida
  if ((seen.tried[kind] ?? 0) > 8) { seen.tried[kind] = Math.round((seen.tried[kind] ?? 0) * 0.75); seen.failed[kind] = Math.round((seen.failed[kind] ?? 0) * 0.75); }
}

// Passes: a mesma dupla repetindo o toque vai perdendo preferência (nunca é proibida)
export function passBias(intel: Intel, from: string, to: string): number {
  const list = intel.passes[`${from}>${to}`] ?? [];
  let rep = 0;
  list.forEach((t) => { rep += decay(intel.n - t); });
  return -0.45 * Math.min(2.2, rep);
}
export function recordPass(intel: Intel, from: string, to: string) {
  intel.n += 0.35;
  const key = `${from}>${to}`;
  (intel.passes[key] = intel.passes[key] ?? []).push(intel.n);
  if (intel.passes[key].length > 6) intel.passes[key].shift();
}

// Decisões de jogo corrido (entre os lances do plano): quem está com a bola escolhe recomeçar, ultrapassar ou inverter
export type AmbientKind = 'recomeco' | 'ultrapassagem' | 'inversao';
export type AmbientCtx = {
  side: Side;
  holder: { pos: string; name: string; ovr: number; style?: Style };
  pressure: number; // 0 a 1
  toGoal: number; // distância até o gol
  wide: boolean; // está aberto no campo
  forwardOpen: boolean; // existe opção de passe à frente e livre
  centralJam: boolean; // meio congestionado
  farSideFree: boolean; // o lado oposto está livre
  hasOverlapper: boolean; // companheiro do mesmo lado atrás da bola
  hasBackOption: boolean;
};
export function ambientChoice(intel: Intel, ctx: AmbientCtx, rnd: () => number = Math.random): AmbientKind | null {
  const p = personalityOf(ctx.holder.name, ctx.holder.ovr);
  const f = ctx.holder.style?.focus ?? 'bal', r = ctx.holder.style?.role ?? '';
  const recent = (kind: string) => intel.ambient[ctx.side].slice(-5).reduce((s, a) => s + (a.kind === kind ? decay(intel.n - a.n) : 0), 0);
  const cand: [AmbientKind, number][] = [];
  if (ctx.hasBackOption && ctx.pressure > 0.5 && !ctx.forwardOpen) {
    cand.push(['recomeco', 0.5 * (0.7 + p.coletivo) * (f === 'def' ? 1.3 : f === 'off' ? 0.7 : 1) * (r === 'mc-hold' || r === 'df-build' ? 1.3 : 1)]);
  }
  if (ctx.wide && ctx.hasOverlapper && ctx.toGoal > 140 && ctx.toGoal < 420 && ctx.pressure < 0.8) {
    cand.push(['ultrapassagem', 0.22 * (0.7 + p.criatividade * 0.6) * (f === 'sup' ? 1.4 : 1) * (r === 'wg-wide' || r === 'df-aggr' ? 1.3 : 1)]);
  }
  if (ctx.centralJam && ctx.farSideFree && ctx.toGoal > 100) {
    cand.push(['inversao', 0.4 * (0.7 + p.criatividade * 0.6)]);
  }
  if (!cand.length) return null;
  const weighted = cand.map(([k, v]) => [k, Math.min(0.85, v / (1 + 0.6 * recent(k)))] as [AmbientKind, number]);
  for (const [k, v] of weighted) {
    if (rnd() < v) { intel.n += 0.5; intel.ambient[ctx.side].push({ kind: k, n: intel.n }); if (intel.ambient[ctx.side].length > 10) intel.ambient[ctx.side].shift(); return k; }
  }
  return null;
}

// Quanto uma preferência de passe vale para esse jogador (função, foco, personalidade). Entra na nota do passe.
export function passTaste(holder: { name: string; ovr: number; style?: Style }, forward: number): number {
  const p = personalityOf(holder.name, holder.ovr);
  const f = holder.style?.focus ?? 'bal';
  let t = (p.ousadia - 0.5) * 0.5 * forward - (p.coletivo - 0.5) * 0.25 * Math.max(0, forward);
  if (f === 'off') t += 0.25 * forward;
  if (f === 'def') t -= 0.25 * forward;
  if (holder.style?.role === 'mc-play' || holder.style?.role === 'wg-play') t += 0.1;
  return t;
}
