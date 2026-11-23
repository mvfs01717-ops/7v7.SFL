// Sistema de pênaltis (lógica pura, sem tela): precisão por timing, força independente, três estilos de cobrança,
// compostura, goleiro com alcance e reação limitados, e os BOTs (cobrador e goleiro) que não conhecem a escolha do outro.
// Coordenadas do gol: x de 0 (trave esquerda) a 1 (direita); y de 0 (travessão) a 1 (chão). Fora de 0..1 = errou o gol.
export type PStyle = 'normal' | 'colocado' | 'cavadinha';
export type PMode = 'antecipar' | 'reagir';
export type POutcome = 'gol' | 'defesa' | 'fora' | 'trave';
export type PPoint = { x: number; y: number };
export const GOAL_W = 7.32; // metros
export const GOAL_H = 2.44;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export type Rnd = () => number;
const gauss = (r: Rnd) => (r() + r() + r() + r() - 2) * 1.2;

export const STYLE_INFO: Record<PStyle, { label: string; hint: string; powerCap: number; sigma: number; greenMul: number }> = {
  normal: { label: 'Normal', hint: 'Cobrança tradicional: força total, trajetória rasteira ou média.', powerCap: 1, sigma: 0.085, greenMul: 1 },
  colocado: { label: 'Colocado', hint: 'Mais controle e efeito (a bola curva), com força menor.', powerCap: 0.86, sigma: 0.058, greenMul: 0.88 },
  cavadinha: { label: 'Cavadinha', hint: 'Encobre o goleiro: lenta, vence quem se atira cedo, mas é difícil de acertar.', powerCap: 0.62, sigma: 0.08, greenMul: 0.8 },
};
export const STYLES: PStyle[] = ['normal', 'colocado', 'cavadinha'];

// ---------- Compostura e zonas do indicador de precisão ----------
// `skill` vem do overall do cobrador. A pressão (decisiva, morte súbita) estreita a zona verde, mas nunca a elimina.
export const skillOf = (ovr: number) => clamp((ovr - 75) / 60, -0.4, 0.45);
export type Zones = { green: number; yellow: number }; // meia largura (em 0..1 do indicador, centro em 0,5)
export function zonesFor(ovr: number, style: PStyle, pressure: number): Zones {
  const g = clamp((0.058 + skillOf(ovr) * 0.045 - pressure * 0.022) * STYLE_INFO[style].greenMul, 0.03, 0.11);
  return { green: g, yellow: g + 0.11 + skillOf(ovr) * 0.03 };
}
export type Zone = 'verde' | 'amarela' | 'vermelha';
export const zoneAt = (m: number, z: Zones): Zone => {
  const d = Math.abs(m - 0.5);
  return d <= z.green ? 'verde' : d <= z.yellow ? 'amarela' : 'vermelha';
};
// Precisão final (0 a 1) pela posição do marcador no instante do comando
export function accOf(m: number, z: Zones): number {
  const d = Math.abs(clamp(m, 0, 1) - 0.5);
  if (d <= z.green) return 0.9 + 0.1 * (1 - d / z.green);
  if (d <= z.yellow) return lerp(0.9, 0.5, (d - z.green) / (z.yellow - z.green));
  return lerp(0.5, 0.06, Math.min(1, (d - z.yellow) / (0.5 - z.yellow)));
}
// Posição do marcador do indicador (vai e volta) no tempo t (ms) desde o início da cobrança
export function markerAt(t: number, period: number, phase0: number): number {
  const u = (((t / period) + phase0) % 1 + 1) % 1;
  return u < 0.5 ? u * 2 : (1 - u) * 2;
}
export const markerPeriod = (ovr: number) => clamp(1150 + skillOf(ovr) * 300, 900, 1500); // craque tem o marcador um pouco mais lento

// Pressão da cobrança: decisiva (acertar ou perder define) e morte súbita pesam mais
export function pressureOf(taken: { user: number; bot: number }, goals: { user: number; bot: number }, side: 'user' | 'bot'): number {
  const o = side === 'user' ? 'bot' : 'user';
  const left = Math.max(0, 5 - taken[side]);
  const leftO = Math.max(0, 5 - taken[o]);
  if (taken[side] >= 5) return goals[side] < goals[o] || taken[side] === taken[o] ? 1 : 0.7;
  const missDecides = goals[o] > goals[side] + left - 1 + (leftO > 0 ? 0 : 0) && goals[o] >= goals[side] + left;
  const scoreDecides = goals[side] + left > goals[o] + leftO && goals[side] + 1 > goals[o] + leftO;
  return missDecides ? 0.95 : scoreDecides ? 0.7 : clamp(0.25 + taken[side] * 0.08, 0.2, 0.6);
}

// ---------- Resolução da cobrança (física simplificada da bola e do goleiro) ----------
export type KeeperChoice = { x: number; y: number; mode: PMode; stay?: boolean; shuf?: number };
export type ShotIn = {
  shooterOvr: number;
  keeperOvr: number;
  aim: PPoint;
  pw: number; // força 0 a 1 (só pelo tempo que o botão ficou pressionado)
  acc: number; // precisão 0 a 1 (só pelo instante do comando)
  style: PStyle;
  keeper: KeeperChoice;
  pressure: number;
};
export type ShotOut = {
  outcome: POutcome;
  target: PPoint; // onde a bola chegou
  keeperEnd: PPoint; // onde o goleiro estava quando a bola chegou
  keeperDive: PPoint; // para onde ele se atirou
  start: PPoint; // posição inicial do goleiro na linha
  dur: number; // tempo de voo (ms)
  arc: number; // altura do arco (px de cena)
  curve: number; // efeito lateral (-1 a 1)
  golaco: boolean;
  reb: boolean;
  err: number; // erro de mira (fração do gol)
  speed: number; // força efetiva 0 a 1
  reach: number; // alcance do goleiro (m)
  miss: number; // distância final entre bola e goleiro (m)
};
export const keeperReach = (ovr: number) => 0.98 + (ovr - 75) * 0.016; // alcance (m) com o corpo e as mãos
export const keeperSpeed = (ovr: number) => 5.1 + (ovr - 75) * 0.1; // m/s no mergulho
export const keeperReact = (ovr: number) => clamp(215 - (ovr - 75) * 1.8, 140, 290); // ms para ler o chute (modo reagir)
export function flightMs(style: PStyle, speed: number): number {
  if (style === 'cavadinha') return 900 + (1 - speed) * 220;
  if (style === 'colocado') return 560 + (1 - speed) * 460;
  return 440 + (1 - speed) * 520;
}
export function resolvePenalty(i: ShotIn, rnd: Rnd = Math.random): ShotOut {
  const st = STYLE_INFO[i.style];
  const sk = skillOf(i.shooterOvr);
  const pw = clamp(i.pw, 0, 1);
  const acc = clamp(i.acc, 0, 1);
  const speed = clamp(pw * st.powerCap, 0.08, 1);
  // Erro de mira: cresce com timing ruim, com força exagerada e com a pressão; cai com a qualidade do cobrador
  const err = st.sigma * (1.9 - 1.5 * acc) * (1 + Math.max(0, pw - 0.8) * 1.7) * (1 + i.pressure * 0.22) * (1 - sk * 0.35);
  const ang = rnd() * Math.PI * 2;
  const rad = err * Math.sqrt(rnd());
  let bx = i.aim.x + Math.cos(ang) * rad;
  let by = i.aim.y + Math.sin(ang) * rad * 0.8;
  // Chute fraco perde direção (a bola morre no meio); em chute muito forte com timing ruim, vai por cima
  if (pw < 0.3 && i.style !== 'cavadinha') {
    bx = lerp(bx, 0.5, 0.55);
    by = lerp(by, 0.64, 0.5);
  }
  if (i.style === 'cavadinha') by = i.aim.y * 0.6 + 0.16 + (rnd() - 0.5) * 0.08 - Math.max(0, pw - 0.55) * 0.9 + Math.max(0, 0.18 - pw) * 1.4; // força demais passa do gol, de menos cai curto
  if (i.style !== 'cavadinha' && pw > 0.95 && acc < 0.62) by = -0.15 - rnd() * 0.15;
  const dur = flightMs(i.style, speed);
  // Goleiro: posição inicial na linha, mergulho e alcance. Antecipar = decide antes do chute (alcance cheio, mas pode errar o lado).
  // Reagir = lê a bola depois de um tempo de reação (menos tempo para chegar), mas vai para o lado certo.
  const x0 = 0.5 + clamp(i.keeper.shuf ?? 0, -0.2, 0.2);
  const vk = keeperSpeed(i.keeperOvr);
  const reach = keeperReach(i.keeperOvr);
  const dive: PPoint = i.keeper.stay
    ? { x: x0, y: 0.58 }
    : i.keeper.mode === 'reagir'
      ? { x: clamp(bx + (rnd() - 0.5) * 0.16, 0.03, 0.97), y: clamp(by + (rnd() - 0.5) * 0.2, 0.15, 0.9) }
      : { x: clamp(i.keeper.x, 0.03, 0.97), y: clamp(i.keeper.y, 0.15, 0.9) };
  const react = i.keeper.mode === 'reagir' && !i.keeper.stay ? keeperReact(i.keeperOvr) + 60 : 0;
  const T = Math.max(0, dur - react + (i.keeper.mode === 'antecipar' && !i.keeper.stay ? 70 : 0)) / 1000;
  const distM = Math.hypot((dive.x - x0) * GOAL_W, (dive.y - 0.58) * GOAL_H * 1.4);
  const travel = Math.min(distM, vk * T);
  const tt = distM > 0.001 ? travel / distM : 0;
  const kEnd: PPoint = { x: lerp(x0, dive.x, tt), y: lerp(0.58, dive.y, tt) };
  let outcome: POutcome;
  let reb = false;
  let golaco = false;
  const miss = Math.hypot((bx - kEnd.x) * GOAL_W, (by - kEnd.y) * GOAL_H * 1.4);
  const outsideX = bx < 0 || bx > 1;
  const outsideY = by < 0 || by > 1.02;
  if (outsideX || outsideY) outcome = 'fora';
  else if ((bx < 0.03 || bx > 0.97 || by < 0.045) && rnd() < 0.5) outcome = 'trave';
  else {
    let pSave = miss > reach ? 0 : 0.3 + 0.62 * (1 - miss / reach);
    pSave *= clamp(1.18 - speed * 0.5, 0.6, 1.1); // chute forte é mais difícil
    if (i.style === 'cavadinha' && i.keeper.stay && miss <= reach) pSave = Math.max(pSave, 0.9);
    outcome = rnd() < clamp(pSave, 0, 0.97) ? 'defesa' : 'gol';
    if (outcome === 'defesa') reb = speed > 0.78 && miss > reach * 0.55 && rnd() < 0.55;
    if (outcome === 'gol' && miss > reach && miss < reach * 1.9 && Math.abs(i.keeper.x - bx) < 0.28 && !i.keeper.stay) golaco = true; // foi para o lado certo e não alcançou
  }
  const arc = i.style === 'cavadinha' ? 46 : i.style === 'colocado' ? 12 : 8 + speed * 4;
  const curve = i.style === 'colocado' ? clamp((bx < 0.5 ? -1 : 1) * (0.55 + (1 - acc) * 0.2), -1, 1) : i.style === 'normal' ? (rnd() - 0.5) * 0.1 : 0;
  return { outcome, target: { x: bx, y: by }, keeperEnd: kEnd, keeperDive: dive, start: { x: x0, y: 0.58 }, dur, arc, curve, golaco, reb, err, speed, reach, miss };
}

// ---------- Memória da disputa (os BOTs aprendem hábitos do adversário, mas não adivinham) ----------
export type PenHist = { shotCol: [number, number, number]; diveCol: [number, number, number]; lobs: number; kicks: number; dives: number };
export const newPenHist = (): PenHist => ({ shotCol: [0, 0, 0], diveCol: [0, 0, 0], lobs: 0, kicks: 0, dives: 0 });
const colOf = (x: number) => (x < 1 / 3 ? 0 : x < 2 / 3 ? 1 : 2);
export function noteShot(h: PenHist, target: PPoint, style: PStyle) {
  h.shotCol[colOf(clamp(target.x, 0, 1))] += 1;
  h.kicks += 1;
  if (style === 'cavadinha') h.lobs += 1;
}
export function noteDive(h: PenHist, dive: PPoint, stay?: boolean) {
  h.diveCol[stay ? 1 : colOf(clamp(dive.x, 0, 1))] += 1;
  h.dives += 1;
}
const pick = (w: number[], r: Rnd) => {
  const s = w.reduce((a, b) => a + b, 0);
  let x = r() * s;
  for (let i = 0; i < w.length; i += 1) {
    x -= w[i];
    if (x <= 0) return i;
  }
  return w.length - 1;
};

// ---------- BOT cobrador: escolhe estilo, direção, força e "executa" o timing ----------
export type BotShot = { style: PStyle; aim: PPoint; pw: number; m: number; acc: number };
// `oppDives` = histórico do goleiro adversário (para onde ele costuma se atirar)
export function botShooter(ovr: number, keeperOvr: number, pressure: number, oppDives: PenHist, rnd: Rnd = Math.random): BotShot {
  const sk = skillOf(ovr);
  // Estilo: cavadinha é rara, mais tentada por craque tranquilo ou contra goleiro que sempre se atira cedo
  const lobBias = (oppDives.dives >= 2 && oppDives.diveCol[1] / Math.max(1, oppDives.dives) < 0.15 ? 0.07 : 0) + Math.max(0, sk) * 0.08 - pressure * 0.06;
  const style = STYLES[pick([0.6 - lobBias, 0.32, clamp(0.05 + lobBias, 0.01, 0.2)], rnd)];
  // Direção: tende ao lado oposto ao que o goleiro mais se atirou, com acaso suficiente para não virar padrão
  const dv = oppDives.diveCol;
  const wCol = [1 + dv[2] * 0.35, 0.28 + (oppDives.dives >= 2 ? dv[0] + dv[2] === 0 ? 0.25 : 0 : 0), 1 + dv[0] * 0.35];
  const col = pick(wCol, rnd);
  // Quem arrisca o canto (mais comum com pressão baixa e craque confiante) chega perto do poste e do travessão: às vezes bate na trave ou vai para fora
  const edge = clamp(0.35 + sk * 0.5 - pressure * 0.15, 0.1, 0.7) * (rnd() < 0.45 ? 1 : 0);
  const ax = (col === 0 ? 0.1 + rnd() * 0.12 - edge * 0.17 : col === 1 ? 0.42 + rnd() * 0.16 : 0.78 + rnd() * 0.12 + edge * 0.17);
  const row = rnd();
  const ay = style === 'cavadinha' ? 0.3 + rnd() * 0.15 : row < 0.62 ? 0.72 + rnd() * 0.2 + edge * 0.06 : 0.14 + rnd() * 0.2 - edge * 0.2;
  const aim = { x: style === 'cavadinha' ? 0.5 + (rnd() - 0.5) * 0.2 : ax, y: ay };
  const pwTarget = style === 'cavadinha' ? 0.5 + rnd() * 0.1 : style === 'colocado' ? 0.7 + rnd() * 0.22 : 0.66 + rnd() * 0.28 + sk * 0.1;
  // Timing simulado: onde o bot "apertaria" no marcador (a precisão é só do timing; a força só da duração)
  const sigma = clamp(0.09 - sk * 0.035 + pressure * 0.035, 0.045, 0.16);
  const m = clamp(0.5 + gauss(rnd) * sigma * 1.4, 0, 1);
  const z = zonesFor(ovr, style, pressure);
  void keeperOvr;
  return { style, aim, pw: clamp(pwTarget, 0.3, 0.98), m, acc: accOf(m, z) };
}

// ---------- BOT goleiro: não vê a mira; usa o histórico do cobrador e do contexto ----------
export function botKeeper(shooterOvr: number, keeperOvr: number, oppShots: PenHist, rnd: Rnd = Math.random): KeeperChoice {
  void shooterOvr;
  const sh = oppShots.shotCol;
  const n = oppShots.kicks;
  // sem dados: laterais igualmente prováveis; com dados: um pouco mais para o lado que o time adversário mais usou
  const w = [1 + sh[0] * 0.3, 0.2, 1 + sh[2] * 0.3];
  const col = pick(w, rnd);
  const stay = rnd() < (0.08 + (n >= 3 && sh[1] / n > 0.3 ? 0.18 : 0) + (oppShots.lobs > 0 ? 0.12 : 0));
  const lowBias = rnd() < 0.62;
  const x = col === 0 ? 0.12 + rnd() * 0.12 : col === 1 ? 0.45 + rnd() * 0.1 : 0.76 + rnd() * 0.12;
  const y = lowBias ? 0.68 + rnd() * 0.2 : 0.3 + rnd() * 0.2;
  const reactP = clamp(0.28 + (oppShots.lobs > 0 ? 0.25 : 0) + skillOf(keeperOvr) * 0.2, 0.15, 0.6);
  return { x, y, mode: rnd() < reactP ? 'reagir' : 'antecipar', stay, shuf: (rnd() - 0.5) * 0.14 };
}

// Cobrança completa entre dois BOTs (usada na simulação automática e em BOT contra BOT)
export function simulateKick(shooterOvr: number, keeperOvr: number, pressure: number, shooterHist: PenHist, keeperHist: PenHist, rnd: Rnd = Math.random) {
  const s = botShooter(shooterOvr, keeperOvr, pressure, keeperHist, rnd);
  const k = botKeeper(shooterOvr, keeperOvr, shooterHist, rnd);
  const r = resolvePenalty({ shooterOvr, keeperOvr, aim: s.aim, pw: s.pw, acc: s.acc, style: s.style, keeper: k, pressure }, rnd);
  noteShot(shooterHist, r.target, s.style);
  noteDive(keeperHist, r.keeperDive, k.stay);
  return { shot: s, keeper: k, result: r };
}

// Validação do que chega pela rede (o anfitrião não confia em números fora de faixa)
export function sanitizeShot(c: { x?: number; y?: number; pw?: number; m?: number; style?: string }): { aim: PPoint; pw: number; m: number; style: PStyle } | null {
  if (typeof c.pw !== 'number' || typeof c.m !== 'number' || !Number.isFinite(c.pw) || !Number.isFinite(c.m)) return null;
  const style = (STYLES as string[]).includes(c.style ?? '') ? (c.style as PStyle) : 'normal';
  return { aim: { x: clamp(Number(c.x ?? 0.5), 0.02, 0.98), y: clamp(Number(c.y ?? 0.5), 0.04, 0.96) }, pw: clamp(c.pw, 0, 1), m: clamp(c.m, 0, 1), style };
}
export function sanitizeKeeper(c: { dx?: number; dy?: number; mode?: string; stay?: boolean; shuf?: number }): KeeperChoice | null {
  if (typeof c.dx !== 'number' && !c.stay) return null;
  return { x: clamp(Number(c.dx ?? 0.5), 0.03, 0.97), y: clamp(Number(c.dy ?? 0.6), 0.15, 0.9), mode: c.mode === 'reagir' ? 'reagir' : 'antecipar', stay: !!c.stay, shuf: clamp(Number(c.shuf ?? 0), -0.2, 0.2) };
}
