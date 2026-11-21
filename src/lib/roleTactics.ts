import type { Player, Position } from '@/lib/game/types';
import { FOCUS_LABEL, SECTOR_OF, defaultRole, focusOptions, loadRoles, roleById, roleFit, roleOf, ROLES, type Fit, type Focus, type Role } from '@/lib/playerRoles';

// Mapa de Atuação e Foco (7v7). Usa as 19 funções que já existem e as 7 vagas fixas. Nada aqui muda overall,
// formação ou posições: o foco só complementa a função e o mapa mostra o comportamento que ela configura.

export const FOCUS_VERB: Record<Focus, string> = {
  def: 'prioriza as responsabilidades defensivas e fica mais perto da própria meta',
  bal: 'equilibra suas responsabilidades defensivas e ofensivas',
  off: 'prioriza as ações de ataque e avança mais',
  sup: 'procura oferecer opções de passe e ajudar na construção',
  free: 'ganha liberdade de movimentação e escolhe onde atuar',
};
export const focusFor = focusOptions;
export const defaultFocus = (_roleId: string): Focus => 'bal';
export const validFocus = (roleId: string, focus: unknown): Focus | undefined => (focusOptions(roleId).includes(focus as Focus) ? (focus as Focus) : undefined);
export const focusText = (role: Role, focus: Focus) => `Com o foco ${FOCUS_LABEL[focus]}, a função ${role.name} ${FOCUS_VERB[focus]}.`;

// Nomes das vagas em português (o campo do 7v7 sempre tem 1 GOL, 2 ZAG, 1 MC, PD, PE e 1 ATA)
export const SLOT_PT: Record<Position, string> = { GK: 'GOL', LB: 'ZAG', RB: 'ZAG', CM: 'MC', LF: 'PE', RF: 'PD', CF: 'ATA' };

// ---------- Mapa de Atuação ----------
// 5 colunas (esquerda → direita) x 5 linhas (0 = ataque, 4 = própria meta). Cada zona vale 0 (fora), 1 (menor atuação),
// 2 (secundária) ou 3 (maior atuação). O mapa é espelhado pela vaga: PD usa o lado direito e PE o esquerdo.
export type ActivityMap = number[][];
export const MAP_ROWS = 5;
export const MAP_COLS = 5;
// r: linha central (0 ataque … 4 meta) · l: quanto se afasta do centro rumo à lateral da própria vaga · sr/sc: espalhamento
type Profile = { r: number; l: number; sr: number; sc: number };
const PROFILE: Record<string, Profile> = {
  'gk-trad': { r: 4, l: 0, sr: 0.6, sc: 0.9 }, 'gk-build': { r: 3.7, l: 0, sr: 0.8, sc: 1 }, 'gk-libero': { r: 3.1, l: 0, sr: 1.3, sc: 1.2 },
  'df-build': { r: 3, l: 1.1, sr: 1.1, sc: 1 }, 'df-mark': { r: 3.4, l: 1.2, sr: 0.9, sc: 0.9 }, 'df-anti': { r: 2.8, l: 1.1, sr: 1.2, sc: 1 }, 'df-aggr': { r: 2.6, l: 1, sr: 1.3, sc: 1.1 },
  'mc-play': { r: 1.9, l: 0, sr: 1.1, sc: 1.3 }, 'mc-b2b': { r: 2, l: 0, sr: 1.9, sc: 1.3 }, 'mc-hold': { r: 2.9, l: 0, sr: 0.9, sc: 1.2 }, 'mc-inf': { r: 1.2, l: 0, sr: 1, sc: 1.1 },
  'wg-wide': { r: 1.1, l: 2, sr: 1.3, sc: 0.6 }, 'wg-inf': { r: 0.8, l: 1, sr: 1, sc: 1 }, 'wg-play': { r: 1.8, l: 1.6, sr: 1.2, sc: 0.9 }, 'wg-bal': { r: 1.2, l: 1.5, sr: 1.3, sc: 0.9 },
  'at-fin': { r: 0.3, l: 0, sr: 0.7, sc: 1 }, 'at-f9': { r: 1.1, l: 0, sr: 1.3, sc: 1.2 }, 'at-pivot': { r: 0.5, l: 0, sr: 0.8, sc: 0.9 }, 'at-mobile': { r: 0.7, l: 0, sr: 1.2, sc: 1.9 },
};
const SIDE: Record<Position, -1 | 0 | 1> = { GK: 0, LB: -1, RB: 1, CM: 0, LF: -1, RF: 1, CF: 0 };

export function activityMap(slot: Position, roleId: string, focus: Focus): ActivityMap {
  const base = PROFILE[roleId] ?? PROFILE[defaultRole(slot).id];
  let { r, sr, sc } = base;
  const { l } = base;
  if (focus === 'def') { r += 0.6; sr *= 0.9; }
  else if (focus === 'off') { r -= 0.6; }
  else if (focus === 'sup') { r += 0.3; sr *= 1.05; sc *= 1.1; }
  else if (focus === 'free') { sr *= 1.3; sc *= 1.3; }
  const isGk = SECTOR_OF[slot] === 'GK';
  r = isGk ? Math.min(4.2, r) : Math.max(0, Math.min(4, r));
  const center = 2 + SIDE[slot] * l;
  const grid: ActivityMap = [];
  let top = 0;
  for (let row = 0; row < MAP_ROWS; row += 1) {
    const line: number[] = [];
    for (let col = 0; col < MAP_COLS; col += 1) {
      const v = Math.exp(-((row - r) ** 2 / (2 * sr * sr) + (col - center) ** 2 / (2 * sc * sc)));
      const level = v >= 0.6 ? 3 : v >= 0.3 ? 2 : v >= 0.12 ? 1 : 0;
      top = Math.max(top, level);
      line.push(level);
    }
    grid.push(line);
  }
  if (top < 3) {
    // garante pelo menos uma zona principal (a mais perto do centro do perfil)
    const row = Math.round(r), col = Math.round(center);
    grid[Math.max(0, Math.min(4, row))][Math.max(0, Math.min(4, col))] = 3;
  }
  return grid;
}

// Como o mapa muda a posição do jogador no campo da partida (MatchPitch): quanto avança/recua (fração do campo),
// quanto abre para o lado (fração da largura) e o quanto acompanha a bola. Só existe quando a função/foco foge do padrão.
export type Shape = { dDepth: number; dLat: number; follow: number };
function mapStats(map: ActivityMap) {
  let w = 0, rows = 0, cols = 0;
  map.forEach((line, row) => line.forEach((level, col) => { const k = level * level; w += k; rows += k * row; cols += k * col; }));
  const r = rows / (w || 1), c = cols / (w || 1);
  let varR = 0;
  map.forEach((line, row) => line.forEach((level) => { varR += level * level * (row - r) ** 2; }));
  return { row: r, col: c, spread: Math.sqrt(varR / (w || 1)) };
}
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function roleShape(slot: Position, roleId: string, focus: Focus): Shape | null {
  const def = defaultRole(slot);
  const a = mapStats(activityMap(slot, roleId, focus)), b = mapStats(activityMap(slot, def.id, 'bal'));
  const shape: Shape = {
    dDepth: clampN((b.row - a.row) * 0.05, -0.12, 0.12),
    dLat: clampN((a.col - b.col) * 0.07, -0.18, 0.18),
    follow: clampN(1 + (a.spread - b.spread) * 0.35, 0.6, 1.5),
  };
  return Math.abs(shape.dDepth) < 0.003 && Math.abs(shape.dLat) < 0.003 && Math.abs(shape.follow - 1) < 0.01 ? null : shape;
}
export function shapesOf(choices: { slot: Position; role: string; focus: Focus }[]): Partial<Record<Position, Shape>> {
  const out: Partial<Record<Position, Shape>> = {};
  choices.forEach((c) => { const sh = roleShape(c.slot, c.role, c.focus); if (sh) out[c.slot] = sh; });
  return out;
}

// ---------- Efeitos na simulação ----------
// Cada função (e foco) mexe um pouco em: chutes que o time cria (own), chutes que cede (conc), perigo do chute (q),
// perigo dos chutes contra o time (qa) e quanto o jogador finaliza (sw). Tudo é medido contra a função padrão da vaga
// com foco equilibrado: quem não mexe em nada joga exatamente como antes.
type Fx = { own: number; conc: number; q: number; qa: number; sw: number };
const Z: Fx = { own: 0, conc: 0, q: 0, qa: 0, sw: 1 };
const f = (p: Partial<Fx>): Fx => ({ ...Z, ...p });
const ROLE_FX: Record<string, Fx> = {
  'gk-trad': f({}), 'gk-build': f({ own: 0.25, conc: 0.1 }), 'gk-libero': f({ own: 0.1, conc: -0.25, qa: 0.02 }),
  'df-build': f({ own: 0.3, conc: 0.05 }), 'df-mark': f({ conc: -0.3, qa: -0.01 }), 'df-anti': f({ own: 0.1, conc: -0.25 }), 'df-aggr': f({ own: 0.2, conc: -0.35, qa: 0.015 }),
  'mc-play': f({ own: 0.45, q: 0.01, sw: 0.9 }), 'mc-b2b': f({ own: 0.2, conc: -0.2 }), 'mc-hold': f({ own: -0.2, conc: -0.4 }), 'mc-inf': f({ own: 0.35, conc: 0.15, q: 0.012, sw: 1.6 }),
  'wg-wide': f({ own: 0.25, q: -0.005 }), 'wg-inf': f({ own: 0.2, q: 0.015, sw: 1.25 }), 'wg-play': f({ own: 0.3, sw: 0.8 }), 'wg-bal': f({ own: 0.2, q: 0.005 }),
  'at-fin': f({ q: 0.015, sw: 1.2 }), 'at-f9': f({ own: 0.35, q: -0.01, sw: 0.85 }), 'at-pivot': f({ own: 0.15, sw: 0.95 }), 'at-mobile': f({ own: 0.25, q: 0.005, sw: 1.1 }),
};
const FOCUS_FX: Record<Focus, Fx> = {
  def: f({ own: -0.2, conc: -0.25, q: -0.005 }), bal: f({}), off: f({ own: 0.25, conc: 0.25, q: 0.005 }),
  sup: f({ own: 0.12 }), free: f({ own: 0.1, conc: 0.1, sw: 1.1 }),
};
const combine = (roleId: string, focus: Focus): Fx => {
  const r = ROLE_FX[roleId] ?? Z, g = FOCUS_FX[focus];
  return { own: r.own + g.own, conc: r.conc + g.conc, q: r.q + g.q, qa: r.qa + g.qa, sw: r.sw * g.sw };
};
export const FIT_MULT: Record<Fit, number> = { ideal: 1, compativel: 0.8, alternativa: 0.5 };

// Efeito líquido de uma escolha numa vaga (contra o padrão da vaga), já reduzido se o jogador não é da função
export function roleDelta(slot: Position, roleId: string, focus: Focus, fit: Fit): Fx {
  const def = defaultRole(slot);
  const a = combine(roleId, focus), b = combine(def.id, defaultFocus(def.id));
  const m = FIT_MULT[fit];
  return { own: (a.own - b.own) * m, conc: (a.conc - b.conc) * m, q: (a.q - b.q) * m, qa: (a.qa - b.qa) * m, sw: 1 + (a.sw / b.sw - 1) * m };
}

export type TeamFx = { own: number; conc: number; q: number; qa: number; shooter: Record<string, number> };
export const NEUTRAL_FX: TeamFx = { own: 0, conc: 0, q: 0, qa: 0, shooter: {} };
const cap = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

export type RoleChoice = { slot: Position; role: string; focus: Focus; fit: Fit };
export function teamFx(choices: RoleChoice[]): TeamFx {
  const out: TeamFx = { own: 0, conc: 0, q: 0, qa: 0, shooter: {} };
  choices.forEach((c) => {
    const d = roleDelta(c.slot, c.role, c.focus, c.fit);
    out.own += d.own; out.conc += d.conc; out.q += d.q; out.qa += d.qa;
    if (Math.abs(d.sw - 1) > 1e-6) out.shooter[c.slot] = d.sw;
  });
  return { own: cap(out.own, 1.5), conc: cap(out.conc, 1.5), q: cap(out.q, 0.04), qa: cap(out.qa, 0.03), shooter: out.shooter };
}

// Vai junto do time na sala (`_r`): "SLOT.função.foco.compat" separados por vírgula (a sala só guarda texto)
const FIT_CODE: Record<Fit, string> = { ideal: 'i', compativel: 'c', alternativa: 'a' };
const FIT_FROM: Record<string, Fit> = { i: 'ideal', c: 'compativel', a: 'alternativa' };
export function encodeRoles(choices: RoleChoice[]): string {
  return choices.map((c) => `${c.slot}.${c.role}.${c.focus}.${FIT_CODE[c.fit]}`).join(',');
}
const SLOTS: Position[] = ['GK', 'LB', 'RB', 'CM', 'LF', 'RF', 'CF'];
export function decodeRoles(raw: string | undefined | null): RoleChoice[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: RoleChoice[] = [];
  raw.split(',').forEach((part) => {
    const [slot, role, focus, fit] = part.split('.');
    const r = roleById(role);
    if (!SLOTS.includes(slot as Position) || !r || r.sector !== SECTOR_OF[slot as Position] || seen.has(slot)) return;
    seen.add(slot);
    out.push({ slot: slot as Position, role, focus: validFocus(role, focus) ?? defaultFocus(role), fit: FIT_FROM[fit] ?? 'compativel' });
  });
  return out;
}

// Função + foco de uma vaga: o que o jogador salvou; sem escolha, o foco cadastrado pelo administrador para a função
// (players.role_mastery[função].focus); sem nada, equilibrado (ver playerRoles.roleOf).
export const choiceOf = (slot: Position, player: Player | undefined, saved = loadRoles()) => roleOf(slot, player, saved);
// Escolhas do time inteiro (para a simulação e para mandar junto do time na sala)
export const teamChoices = (squad: Partial<Record<Position, Player>>, saved = loadRoles()): RoleChoice[] =>
  choicesOf(squad, (slot, player) => choiceOf(slot, player, saved));

// Lê a função e o foco salvos de cada vaga (ver playerRoles.roleOf / focusOf) e monta as escolhas do time
export function choicesOf(squad: Partial<Record<Position, Player>>, pick: (slot: Position, player: Player) => { role: Role; focus: Focus }): RoleChoice[] {
  const out: RoleChoice[] = [];
  SLOTS.forEach((slot) => {
    const player = squad[slot];
    if (!player) return;
    const { role, focus } = pick(slot, player);
    out.push({ slot, role: role.id, focus, fit: roleFit(player, slot, role) });
  });
  return out;
}

// Prós e contras mostrados no painel (derivados dos efeitos reais, nada decorativo)
export function describeFx(slot: Position, roleId: string, focus: Focus, fit: Fit): { ok: boolean; text: string }[] {
  const d = roleDelta(slot, roleId, focus, fit);
  const list: { ok: boolean; text: string }[] = [];
  if (d.own >= 0.15) list.push({ ok: true, text: 'Ajuda a criar chances de gol' });
  if (d.own <= -0.15) list.push({ ok: false, text: 'Cria menos chances de gol' });
  if (d.conc <= -0.15) list.push({ ok: true, text: 'Protege melhor contra o rival' });
  if (d.conc >= 0.15) list.push({ ok: false, text: 'Cede mais chances ao rival' });
  if (d.q >= 0.008) list.push({ ok: true, text: 'Chutes mais perigosos' });
  if (d.q <= -0.008) list.push({ ok: false, text: 'Chutes menos incisivos' });
  if (d.qa >= 0.01) list.push({ ok: false, text: 'Arrisca falhas na defesa' });
  if (d.sw >= 1.15) list.push({ ok: true, text: 'Finaliza mais' });
  if (d.sw <= 0.88) list.push({ ok: true, text: 'Finaliza menos e distribui mais' });
  if (fit === 'alternativa') list.push({ ok: false, text: 'Fora da especialidade do jogador (efeito reduzido)' });
  if (!list.length) list.push({ ok: true, text: 'Comportamento padrão da posição' });
  return list;
}

// Função e foco de cada vaga (a inteligência das jogadas lê isso para decidir como o time joga)
export const stylesOf = (choices: { slot: Position; role: string; focus: Focus }[]): Partial<Record<Position, { role: string; focus: string }>> =>
  Object.fromEntries(choices.map((c) => [c.slot, { role: c.role, focus: c.focus }])) as Partial<Record<Position, { role: string; focus: string }>>;

// ---------- Análise tática do time ----------
// Tudo sai das escolhas reais: o mapa de atuação de cada vaga somado (onde o time joga) e os efeitos da simulação (teamFx).
// A nota é medida contra o time com as funções padrão: sem mexer em nada, todos os eixos ficam no meio.
export type TeamAxes = { atq: number; def: number; amp: number; pro: number; arm: number; res: number };
export const AXIS_LABEL: Record<keyof TeamAxes, string> = { atq: 'ATQ', def: 'DEF', amp: 'AMP', pro: 'PRO', arm: 'ARM', res: 'RES' };
const AXIS_ORDER: (keyof TeamAxes)[] = ['atq', 'def', 'amp', 'pro', 'arm', 'res'];

function rawAxes(choices: RoleChoice[], fx: TeamFx): TeamAxes {
  const w = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(0) as number[]);
  choices.forEach((c) => activityMap(c.slot, c.role, c.focus).forEach((line, r) => line.forEach((level, col) => { w[r][col] += level; })));
  let total = 0, front = 0, back = 0, wide = 0, core = 0, rows = 0;
  w.forEach((line, r) => line.forEach((v, col) => {
    total += v; rows += v * r;
    if (r <= 1) front += v;
    if (r >= 3) back += v;
    if (col === 0 || col === MAP_COLS - 1) wide += v;
    if (r >= 1 && r <= 3 && col >= 1 && col <= 3) core += v;
  }));
  const t = total || 1, mean = rows / t;
  let varR = 0;
  w.forEach((line, r) => line.forEach((v) => { varR += v * (r - mean) ** 2; }));
  const fitAvg = choices.length ? choices.reduce((s, c) => s + FIT_MULT[c.fit], 0) / choices.length : 1;
  return {
    atq: front / t + 0.12 * fx.own + 3 * fx.q,
    def: back / t - 0.12 * fx.conc - 3 * fx.qa,
    amp: wide / t,
    pro: Math.sqrt(varR / t) * 0.25,
    arm: core / t + 0.05 * fx.own,
    res: fitAvg * 0.5 - 0.1 * fx.conc - 2 * fx.qa,
  };
}

export function teamAnalysis(choices: RoleChoice[]): { axes: TeamAxes; good: string[]; warn: string[] } {
  const base = choices.map((c) => { const d = defaultRole(c.slot); return { slot: c.slot, role: d.id, focus: defaultFocus(d.id), fit: 'ideal' as Fit }; });
  const now = rawAxes(choices, teamFx(choices)), ref = rawAxes(base, NEUTRAL_FX);
  const GAIN: TeamAxes = { atq: 2, def: 2, amp: 2.5, pro: 3, arm: 2, res: 1.2 };
  const axes = {} as TeamAxes;
  AXIS_ORDER.forEach((k) => { axes[k] = Math.max(0.08, Math.min(1, 0.55 + (now[k] - ref[k]) * GAIN[k])); });
  const GOOD: Record<keyof TeamAxes, string> = {
    atq: 'Muitas opções de ataque', def: 'Defesa bem protegida', amp: 'Ocupa bem a largura do campo',
    pro: 'Funções ao longo do comprimento', arm: 'Armação sólida', res: 'Time resistente e bem encaixado',
  };
  const BAD: Record<keyof TeamAxes, string> = {
    atq: 'Falta de opções de ataque', def: 'Defesa fácil de sobrecarregar', amp: 'Abordagem muito estreita',
    pro: 'Time muito junto, pouca profundidade', arm: 'Pouca armação no meio', res: 'Pouca resistência a contra-ataques',
  };
  const by = (sign: 1 | -1) => AXIS_ORDER.filter((k) => (axes[k] - 0.55) * sign >= 0.1).sort((a, b) => (axes[b] - axes[a]) * sign);
  const good = by(1).slice(0, 3).map((k) => GOOD[k]);
  const warn = by(-1).slice(0, 3).map((k) => BAD[k]);
  if (!good.length && !warn.length && choices.length) good.push('Equilíbrio padrão do time');
  return { axes, good, warn };
}
export { ROLES };
