// Escanteio com execução manual (mira, força, efeito) e jogadas ensaiadas.
// Modelo puro e barato. As coordenadas da área são normalizadas: u = 0 é o lado do canto (primeira trave) e u = 1 o lado oposto (segunda trave);
// v = 0 é a linha de fundo e v = 1 a beira da região de ataque. O desfecho sai da execução (onde a bola cai, com que força e efeito) e da
// disputa naquele ponto; o resultado continua sendo um dos desfechos do plano (gol, defesa, finalização, posse).
export type CPlay = 'primeiro' | 'segundo' | 'central' | 'curto' | 'recuo' | 'distracao' | 'bloqueio';
export type CEffect = 'dentro' | 'fora' | 'direta' | 'alta' | 'rasteira';
export type COutcome = 'gol' | 'defesa' | 'finalização' | 'posse';
// ci = intensidade do efeito (0,2 a 1): quanto mais curva, mais a bola desvia no ar e mais difícil é a execução
export type CExec = { play: CPlay; side: 0 | 1; ax: number; ay: number; pw: number; fx: CEffect; ci?: number };
export const CURVE_PX = 38; // desvio lateral máximo (unidades do campo) da curva com intensidade 1
// Curva da bola: positivo = para o lado do gol (curva para dentro), negativo = para longe do gol (curva para fora)
export const curveMag = (e: Pick<CExec, 'fx' | 'ci'>): number => (e.fx === 'dentro' ? 1 : e.fx === 'fora' ? -1 : 0) * CURVE_PX * Math.max(0.2, Math.min(1, e.ci ?? 1));
// Desvio lateral (com sinal do motor de bola) para um trajeto de (fx,fy) a (tx,ty): o motor desvia no vetor (-dy, dx); `dir` é o sentido do gol no eixo x
export const curveOffset = (e: Pick<CExec, 'fx' | 'ci'>, fx0: number, fy0: number, tx: number, ty: number, dir: number): number => {
  const l = Math.hypot(tx - fx0, ty - fy0) || 1;
  const px = -(ty - fy0) / l;
  return curveMag(e) * (Math.sign(px * dir) || 1);
};
type Pt = { u: number; v: number };
type Rnd = () => number;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const PLAYS: CPlay[] = ['primeiro', 'segundo', 'central', 'curto', 'recuo', 'distracao', 'bloqueio'];
export const EFFECTS: CEffect[] = ['dentro', 'fora', 'direta', 'alta', 'rasteira'];
export const EFFECT_LABEL: Record<CEffect, string> = { dentro: 'Curva para dentro', fora: 'Curva para fora', direta: 'Trajetória direta', alta: 'Cruzamento alto', rasteira: 'Cruzamento rasteiro' };
export const PLAY_INFO: Record<CPlay, { label: string; text: string; icon: string; zone: Pt }> = {
  primeiro: { label: 'Primeiro poste', icon: '⇤', text: 'Um atacante ataca a primeira trave, outro busca a sobra e o resto ocupa a área.', zone: { u: 0.14, v: 0.2 } },
  segundo: { label: 'Segundo poste', icon: '⇥', text: 'Um jogador corre para a segunda trave, outro fica no centro e um terceiro espera o rebote.', zone: { u: 0.86, v: 0.2 } },
  central: { label: 'Jogada central', icon: '◎', text: 'Cada atacante ataca um espaço diferente no meio da área.', zone: { u: 0.5, v: 0.24 } },
  curto: { label: 'Escanteio curto', icon: '↔', text: 'Toque para uma companheira próxima, que cruza, devolve ou conduz.', zone: { u: 0.45, v: 0.28 } },
  recuo: { label: 'Recuo', icon: '↩', text: 'Bola para trás, fora da área, para finalizar ou levantar de novo.', zone: { u: 0.5, v: 0.9 } },
  distracao: { label: 'Distração', icon: '✦', text: 'Dois jogadores puxam a marcação e outro aproveita o espaço aberto.', zone: { u: 0.7, v: 0.3 } },
  bloqueio: { label: 'Bloqueio e infiltração', icon: '▣', text: 'Um jogador ocupa o marcador e outro corre por trás para receber.', zone: { u: 0.45, v: 0.22 } },
};

// Posições dos 5 jogadores de campo que não cobram: [início, fim]. Índices: 0 centroavante, 1 ponta, 2 meia, 3 zagueiro, 4 zagueiro.
export const PLAY_RUNS: Record<CPlay, [Pt, Pt][]> = {
  primeiro: [[{ u: 0.4, v: 0.5 }, { u: 0.14, v: 0.17 }], [{ u: 0.55, v: 0.6 }, { u: 0.36, v: 0.3 }], [{ u: 0.65, v: 0.6 }, { u: 0.6, v: 0.34 }], [{ u: 0.8, v: 0.55 }, { u: 0.82, v: 0.3 }], [{ u: 0.5, v: 0.8 }, { u: 0.5, v: 0.72 }]],
  segundo: [[{ u: 0.5, v: 0.5 }, { u: 0.88, v: 0.18 }], [{ u: 0.4, v: 0.55 }, { u: 0.5, v: 0.22 }], [{ u: 0.6, v: 0.7 }, { u: 0.7, v: 0.46 }], [{ u: 0.3, v: 0.6 }, { u: 0.3, v: 0.34 }], [{ u: 0.5, v: 0.8 }, { u: 0.5, v: 0.74 }]],
  central: [[{ u: 0.5, v: 0.55 }, { u: 0.45, v: 0.2 }], [{ u: 0.3, v: 0.6 }, { u: 0.28, v: 0.32 }], [{ u: 0.65, v: 0.65 }, { u: 0.62, v: 0.3 }], [{ u: 0.8, v: 0.6 }, { u: 0.76, v: 0.46 }], [{ u: 0.5, v: 0.85 }, { u: 0.5, v: 0.7 }]],
  curto: [[{ u: 0.5, v: 0.5 }, { u: 0.45, v: 0.24 }], [{ u: 0.12, v: 0.8 }, { u: 0.12, v: 0.8 }], [{ u: 0.6, v: 0.6 }, { u: 0.62, v: 0.34 }], [{ u: 0.8, v: 0.6 }, { u: 0.8, v: 0.3 }], [{ u: 0.4, v: 0.85 }, { u: 0.4, v: 0.7 }]],
  recuo: [[{ u: 0.5, v: 0.5 }, { u: 0.4, v: 0.2 }], [{ u: 0.3, v: 0.6 }, { u: 0.25, v: 0.3 }], [{ u: 0.5, v: 1.0 }, { u: 0.5, v: 0.92 }], [{ u: 0.7, v: 0.6 }, { u: 0.72, v: 0.3 }], [{ u: 0.6, v: 0.8 }, { u: 0.62, v: 0.55 }]],
  distracao: [[{ u: 0.5, v: 0.5 }, { u: 0.12, v: 0.2 }], [{ u: 0.4, v: 0.55 }, { u: 0.2, v: 0.32 }], [{ u: 0.7, v: 0.7 }, { u: 0.7, v: 0.3 }], [{ u: 0.85, v: 0.6 }, { u: 0.85, v: 0.36 }], [{ u: 0.5, v: 0.85 }, { u: 0.5, v: 0.7 }]],
  bloqueio: [[{ u: 0.6, v: 0.7 }, { u: 0.45, v: 0.2 }], [{ u: 0.4, v: 0.5 }, { u: 0.36, v: 0.26 }], [{ u: 0.7, v: 0.6 }, { u: 0.68, v: 0.36 }], [{ u: 0.85, v: 0.55 }, { u: 0.82, v: 0.3 }], [{ u: 0.5, v: 0.85 }, { u: 0.5, v: 0.7 }]],
};
const DEF_BASE: Pt[] = [{ u: 0.2, v: 0.18 }, { u: 0.4, v: 0.22 }, { u: 0.62, v: 0.22 }, { u: 0.82, v: 0.2 }, { u: 0.5, v: 0.46 }];

// ---------- Memória (a defesa reconhece jogadas que já viu, aos poucos) ----------
export type CornerHist = Record<CPlay, number>;
export const newCornerHist = (): CornerHist => ({ primeiro: 0, segundo: 0, central: 0, curto: 0, recuo: 0, distracao: 0, bloqueio: 0 });
// confiança (0 a 0,7) com que a defesa já espera a jogada
export const recognition = (h: CornerHist, p: CPlay) => clamp((h[p] - 1) * 0.3, 0, 0.7);

// ---------- Execução ----------
export type CornerIn = { exec: CExec; takerOvr: number; atkAvg: number; defAvg: number; keeperOvr: number; pressure: number; seen: number };
export type CornerOut = {
  outcome: COutcome;
  land: Pt; // onde a bola caiu
  err: number;
  keeperOut: boolean; // o goleiro saiu do gol
  keeperWon: boolean;
  headed: boolean; // houve disputa aérea
  rebound: boolean;
  p: { gol: number; defesa: number; finalização: number; posse: number };
};
// Distância que a bola precisa percorrer do canto (u = 0, v = 0) até a mira, e a força ideal para ela
const REACH = (a: Pt) => Math.hypot(a.u * 0.9, a.v * 0.8 + 0.1);
export const idealPower = (a: Pt, fx: CEffect) => clamp(0.28 + REACH(a) * 0.62 + (fx === 'rasteira' ? 0.06 : fx === 'alta' ? -0.04 : 0), 0.2, 0.95);

const pwShift = (d: number) => (Math.abs(d) < 0.14 ? 0 : (d - Math.sign(d) * 0.14) * 0.5);

export function landing(i: CornerIn, rnd: Rnd): { land: Pt; err: number } {
  const e = i.exec;
  const sk = clamp((i.takerOvr - 80) / 12, -1, 1);
  const aim: Pt = { u: clamp(e.ax, 0, 1), v: clamp(e.ay, 0, 1) };
  // força: abaixo do ideal a bola cai curta, acima passa do alvo
  const dPow = e.pw - idealPower(aim, e.fx);
  let u = aim.u;
  let v = aim.v;
  v += pwShift(dPow); // só passa/fica curta se a força estiver bem errada
  // efeito: a bola vai para onde foi mirada; o efeito muda a curva e só deixa um desvio mínimo na queda
  if (e.fx === 'dentro') v -= 0.012;
  else if (e.fx === 'fora') v += 0.012;
  else if (e.fx === 'alta') v += 0.01;
  const ci = Math.max(0.2, Math.min(1, e.ci ?? 1));
  const fxHard = e.fx === 'direta' ? 0.9 : e.fx === 'rasteira' ? 0.95 : e.fx === 'alta' ? 1.05 : 0.9 + 0.3 * ci;
  const err = (0.028 + Math.abs(dPow) * 0.12 + Math.max(0, e.pw - 0.85) * 0.2) * fxHard * (1 + i.pressure * 0.3) * (1 - sk * 0.28);
  const g = () => (rnd() + rnd() + rnd() - 1.5) * 0.8;
  return { land: { u: clamp(u + g() * err, 0, 1), v: clamp(v + g() * err, 0.02, 1.05) }, err };
}

const w = (ovr: number) => 0.55 + clamp((ovr - 70) / 30, 0, 1) * 0.9;
const dens = (a: Pt, b: Pt, s = 0.017) => Math.exp(-((a.u - b.u) ** 2 + (a.v - b.v) ** 2) / s);

export function cornerProbs(i: CornerIn, land: Pt, keeperOut: boolean, keeperWon: boolean) {
  const e = i.exec;
  const runs = PLAY_RUNS[e.play];
  const rec = recognition({ primeiro: 0, segundo: 0, central: 0, curto: 0, recuo: 0, distracao: 0, bloqueio: 0, [e.play]: i.seen } as CornerHist, e.play);
  // atacantes no destino das corridas (a mira precisa conversar com o movimento)
  let att = 0;
  runs.forEach(([, end], k) => {
    const bonus = k === 0 ? 1.15 : 1;
    att += dens(end, land) * w(i.atkAvg) * bonus;
  });
  // defensores: marcação da base; jogadas conhecidas deslocam a marcação para o destino dos atacantes
  let def = 0;
  DEF_BASE.forEach((d, k) => {
    const to = runs[k]?.[1] ?? d;
    let pos: Pt = { u: d.u + (to.u - d.u) * rec, v: d.v + (to.v - d.v) * rec };
    if (e.play === 'distracao') pos = { u: pos.u + (0.14 - pos.u) * 0.22 * (k < 2 ? 1 : 0.4) * (1 - rec), v: pos.v }; // parte da marcação é atraída
    if (e.play === 'bloqueio' && k === 1) pos = { u: pos.u, v: pos.v + 0.18 }; // um marcador fica preso no bloqueio
    def += dens(pos, land) * w(i.defAvg);
  });
  def *= 1 + rec * 0.45; // marcação já alerta
  if (e.play === 'curto') def *= 0.82; // a marcação sai para o toque curto
  if (e.fx === 'alta') def *= 1.12;
  if (e.fx === 'rasteira') def *= 0.95;
  if (e.play === 'recuo' && land.v > 0.7) def += 0.3 * w(i.defAvg); // a marcação sai para fechar o chute de fora da área
  let a = att;
  if (keeperOut && !keeperWon) a *= 1.25; // goleiro saiu e não chegou
  const pWin = clamp(a / (a + def * 1.05 + 0.1), 0.04, 0.9);
  const depth = clamp(1 - land.v / 0.7, 0, 1);
  const centre = 1 - Math.abs(land.u - 0.5) * 0.6;
  const quality = (e.play === 'recuo' && land.v > 0.7 ? 0.5 : 0.4 + 0.5 * depth) * (0.65 + 0.35 * centre) * (e.fx === 'rasteira' ? 1.03 : 1);
  const onTarget = clamp(quality, 0.12, 0.85);
  const saveP = clamp(0.5 + (i.keeperOvr - 78) * 0.01 - (e.fx === 'dentro' ? 0.05 * (e.ci ?? 1) : 0), 0.35, 0.72);
  let gol = pWin * onTarget * (1 - saveP) * 1.05;
  let defesa = pWin * onTarget * saveP * 0.7;
  let fin = pWin * (1 - onTarget) * 0.85 + pWin * onTarget * 0.18;
  const maxG = 0.42;
  gol = Math.min(gol, maxG);
  if (keeperOut && keeperWon) { gol *= 0.2; defesa *= 0.4; fin *= 0.3; }
  const posse = Math.max(0.04, 1 - gol - defesa - fin);
  const s = gol + defesa + fin + posse;
  return { gol: gol / s, defesa: defesa / s, finalização: fin / s, posse: posse / s };
}

// O goleiro lê a trajetória com erro (não sabe a mira): sai se a bola cai perto, é alta ou curva para dentro e ele acha que alcança
export function keeperDecision(i: CornerIn, land: Pt, rnd: Rnd): { out: boolean; won: boolean } {
  const e = i.exec;
  const g = (rnd() + rnd() + rnd() - 1.5) * 0.8;
  const est = { u: land.u + g * 0.14, v: land.v + g * 0.12 };
  const reach = 0.2 + (i.keeperOvr - 75) * 0.005 + (e.fx === 'alta' ? 0.04 : 0) - (e.fx === 'rasteira' ? 0.07 : 0) - (e.fx === 'dentro' ? 0.03 * (e.ci ?? 1) : 0);
  const near = est.v < reach + 0.06 && est.u > 0.12 && est.u < 0.88;
  const crowd = PLAY_RUNS[e.play].filter(([, end]) => dens(end, est) > 0.25).length;
  const out = near && crowd <= 2 && rnd() < clamp(0.45 + (i.keeperOvr - 75) * 0.012, 0.2, 0.85);
  if (!out) return { out: false, won: false };
  const truly = land.v < reach + 0.02 && land.u > 0.1 && land.u < 0.9;
  const won = truly && rnd() < clamp(0.6 + (i.keeperOvr - 75) * 0.015 - i.pressure * 0.1 - crowd * 0.1, 0.2, 0.9);
  return { out: true, won };
}

export function resolveCorner(i: CornerIn, rnd: Rnd = Math.random): CornerOut {
  const { land, err } = landing(i, rnd);
  const k = keeperDecision(i, land, rnd);
  const p = cornerProbs(i, land, k.out, k.won);
  const r = rnd();
  const outcome: COutcome = r < p.gol ? 'gol' : r < p.gol + p.defesa ? 'defesa' : r < p.gol + p.defesa + p.finalização ? 'finalização' : 'posse';
  return { outcome, land, err, keeperOut: k.out, keeperWon: k.won, headed: outcome !== 'posse' || !k.won, rebound: outcome === 'defesa' && i.exec.fx === 'rasteira' && rnd() < 0.4, p };
}

// ---------- Bot cobrador: escolhe jogada, mira, força e efeito; varia e foge do que já usou ----------
export function botCorner(takerOvr: number, used: CornerHist, defSeen: CornerHist, side: 0 | 1, rnd: Rnd = Math.random): CExec {
  const wts = PLAYS.map((p) => Math.max(0.25, 1.4 - used[p] * 0.45 - recognition(defSeen, p) * 0.9) * (p === 'recuo' || p === 'curto' ? 0.8 : 1));
  let r = rnd() * wts.reduce((a, b) => a + b, 0);
  let play: CPlay = 'central';
  for (let k = 0; k < PLAYS.length; k += 1) { r -= wts[k]; if (r <= 0) { play = PLAYS[k]; break; } }
  const fxW: Record<CEffect, number> = { dentro: 1.2, fora: 0.8, direta: 0.9, alta: 1, rasteira: 0.7 };
  const fxs = EFFECTS.filter((f) => !(play === 'recuo' && f === 'alta'));
  let rr = rnd() * fxs.reduce((a, f) => a + fxW[f], 0);
  let fx: CEffect = 'dentro';
  for (const f of fxs) { rr -= fxW[f]; if (rr <= 0) { fx = f; break; } }
  const z = PLAY_INFO[play].zone;
  const sk = clamp((takerOvr - 80) / 12, -1, 1);
  const jitter = 0.07 - sk * 0.02;
  const aim = { u: clamp(z.u + (rnd() - 0.5) * 0.2, 0.05, 0.95), v: clamp(z.v + (rnd() - 0.5) * 0.14, 0.08, 0.98) };
  // erro de leitura da força: o bot "segura o botão" quase no tempo certo
  const pw = clamp(idealPower(aim, fx) + (rnd() + rnd() - 1) * jitter * 2, 0.15, 1);
  return { play, side, ax: aim.u, ay: aim.v, pw, fx, ci: fx === 'dentro' || fx === 'fora' ? clamp(0.45 + rnd() * 0.55, 0.2, 1) : undefined };
}

// ---------- Codificação (vai na sala do multiplayer e no plano) e validação ----------
export function encodeExec(e: CExec): string {
  return `cx1:${e.play}:${e.side}:${e.ax.toFixed(2)}:${e.ay.toFixed(2)}:${e.pw.toFixed(2)}:${e.fx}${e.ci === undefined ? '' : `:${e.ci.toFixed(2)}`}`;
}
export function decodeExec(s: string | undefined | null): CExec | null {
  if (!s || !s.startsWith('cx1:')) return null;
  const [, play, side, ax, ay, pw, fx, ci] = s.split(':');
  if (!(PLAYS as string[]).includes(play) || !(EFFECTS as string[]).includes(fx)) return null;
  const n = [ax, ay, pw].map(Number);
  if (n.some((v) => !Number.isFinite(v))) return null;
  return { play: play as CPlay, side: side === '1' ? 1 : 0, ax: clamp(n[0], 0, 1), ay: clamp(n[1], 0.02, 1), pw: clamp(n[2], 0.05, 1), fx: fx as CEffect, ci: ci !== undefined && Number.isFinite(Number(ci)) ? clamp(Number(ci), 0.2, 1) : undefined };
}
// Lado do canto igual para os dois lados do jogo (sai do minuto)
export const cornerSide = (minute: number, salt = 0): 0 | 1 => ((Math.imul(minute + 7 + salt, 2654435761) >>> 8) & 1) as 0 | 1;
export function defaultExec(side: 0 | 1): CExec {
  const p = PLAY_INFO.central.zone;
  return { play: 'central', side, ax: p.u, ay: p.v, pw: idealPower(p, 'direta'), fx: 'direta' };
}

// Ponto de queda previsto (sem o erro aleatório): é o que a mira mostra enquanto a força carrega
export function predictLand(e: CExec): { u: number; v: number } {
  const aim = { u: clamp(e.ax, 0, 1), v: clamp(e.ay, 0, 1) };
  const dPow = e.pw - idealPower(aim, e.fx);
  let v = aim.v + pwShift(dPow);
  const u = aim.u;
  if (e.fx === 'dentro') v -= 0.012;
  else if (e.fx === 'fora') v += 0.012;
  else if (e.fx === 'alta') v += 0.01;
  return { u: clamp(u, 0, 1), v: clamp(v, 0.02, 1.05) };
}

// Narração: sempre começa com "Escanteio cobrado por" (é por esse trecho que o campo reconhece a bola parada)
export function cornerText(e: CExec, outcome: COutcome, n: { taker: string; shooter: string; keeper: string; club: string }, o?: Pick<CornerOut, 'keeperOut' | 'keeperWon' | 'rebound'>): string {
  const how: Record<CEffect, string> = { dentro: 'com curva para dentro', fora: 'com curva para fora', direta: 'direto', alta: 'alto', rasteira: 'rasteiro' };
  const lead = `Escanteio cobrado por ${n.taker} ${how[e.fx]}`;
  const plays: Record<CPlay, string> = { primeiro: 'na primeira trave', segundo: 'na segunda trave', central: 'no meio da área', curto: 'depois de um toque curto', recuo: 'em jogada de recuo, para fora da área', distracao: 'em jogada de distração', bloqueio: 'em jogada de bloqueio e infiltração' };
  if (o?.keeperOut && o.keeperWon && outcome !== 'gol') return `${lead}, ${plays[e.play]}: ${n.keeper} sai do gol e fica com a bola!`;
  if (outcome === 'gol') return `${lead}, ${plays[e.play]}: ${n.shooter} aparece livre e marca para ${n.club}!`;
  if (outcome === 'defesa') return `${lead}, ${plays[e.play]}: ${n.shooter} finaliza e ${n.keeper} defende${o?.rebound ? ', mas a bola sobra na área' : ''}!`;
  if (outcome === 'finalização') return `${lead}, ${plays[e.play]}: ${n.shooter} finaliza e a bola passa perto do gol.`;
  return `${lead}, ${plays[e.play]}: a marcação antecipa e afasta o perigo.`;
}
