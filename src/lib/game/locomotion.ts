// Locomoção (categoria MOVIMENTAÇÃO da biblioteca de animações).
// O jogador do 7v7 é um disco visto de cima, sem esqueleto. A passada é desenhada por duas chuteiras que alternam na frente e atrás do disco,
// com ritmo preso à DISTÂNCIA percorrida (não desliza no gramado), amplitude e postura que mudam com a marcha.
export type Gait = 'parado' | 'caminhada' | 'leve' | 'corrida' | 'sprint' | 'arrancada' | 'freada' | 'direcao' | 'lateral' | 'costas';
export const GAITS: Gait[] = ['parado', 'caminhada', 'leve', 'corrida', 'sprint', 'arrancada', 'freada', 'direcao', 'lateral', 'costas'];

export type GaitIn = {
  ratio: number; // velocidade / velocidade máxima do jogador (0 a 1+)
  accel: number; // variação da razão por segundo (positiva = acelerando)
  turn: number; // giro da direção do movimento, rad/s
  rel: number; // ângulo entre a direção do movimento e para onde o corpo olha (rad, 0 a π)
  prev?: Gait;
  heldMs?: number; // há quanto tempo está na marcha atual
};

// Marchas de ação (arrancada, freada, mudança de direção) duram pouco e interrompem a de ritmo
export function classifyGait(i: GaitIn, enabled: (g: Gait) => boolean = () => true): Gait {
  const pick = (g: Gait, fallback: Gait): Gait => (enabled(g) ? g : fallback);
  let base: Gait;
  if (i.ratio < 0.06) base = 'parado';
  else if (i.ratio < 0.3) base = 'caminhada';
  else if (i.ratio < 0.58) base = 'leve';
  else if (i.ratio < 0.82) base = 'corrida';
  else base = 'sprint';
  if (base === 'parado') return pick('parado', 'caminhada');
  if (i.rel > 2.2 && i.ratio < 0.7) return pick('costas', pick(base, 'corrida'));
  if (i.rel > 0.95 && i.ratio < 0.8) return pick('lateral', pick(base, 'corrida'));
  if (i.accel > 2.4 && i.ratio < 0.8) return pick('arrancada', pick(base, 'corrida'));
  if (i.accel < -2.6 && i.ratio > 0.25) return pick('freada', pick(base, 'corrida'));
  if (i.turn > 3.4 && i.ratio > 0.3) return pick('direcao', pick(base, 'corrida'));
  return pick(base, 'corrida');
}

export type GaitFx = { amp: number; rate: number; sx: number; sy: number; bob: number; lift: number };
// amp: abertura da passada (px); rate: radianos de passada por pixel andado; sx/sy: postura do corpo; bob: balanço vertical; lift: afastamento lateral dos pés
export function gaitFx(g: Gait, ratio: number, speedMul = 1): GaitFx {
  const r = Math.min(1.2, Math.max(0, ratio));
  switch (g) {
    case 'caminhada': return { amp: 4 + 3 * r, rate: 0.2 * speedMul, sx: 1, sy: 1, bob: 0.01, lift: 0 };
    case 'leve': return { amp: 7 + 4 * r, rate: 0.16 * speedMul, sx: 1, sy: 1, bob: 0.018, lift: 0 };
    case 'corrida': return { amp: 9 + 5 * r, rate: 0.14 * speedMul, sx: 1.02, sy: 0.99, bob: 0.026, lift: 0 };
    case 'sprint': return { amp: 13 + 4 * r, rate: 0.12 * speedMul, sx: 1.08, sy: 0.95, bob: 0.034, lift: 0 };
    case 'arrancada': return { amp: 12, rate: 0.17 * speedMul, sx: 1.1, sy: 0.94, bob: 0.03, lift: 0 };
    case 'freada': return { amp: 6, rate: 0.26 * speedMul, sx: 0.93, sy: 1.07, bob: 0.01, lift: 2 };
    case 'direcao': return { amp: 8, rate: 0.2 * speedMul, sx: 0.96, sy: 1.05, bob: 0.02, lift: 3 };
    case 'lateral': return { amp: 6, rate: 0.22 * speedMul, sx: 0.97, sy: 1.04, bob: 0.014, lift: 4 };
    case 'costas': return { amp: 5, rate: 0.22 * speedMul, sx: 0.98, sy: 1.02, bob: 0.012, lift: 2 };
    default: return { amp: 0, rate: 0, sx: 1, sy: 1, bob: 0.004, lift: 0 };
  }
}

const TAU = Math.PI * 2;
export const angDiff = (a: number, b: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

// Estado de passada de um jogador (um por jogador, reaproveitado a cada quadro)
export type GaitState = { phase: number; face: number; head: number; ratio: number; gait: Gait; since: number; flash: Gait | null; flashUntil: number };
export const newGaitState = (): GaitState => ({ phase: Math.random() * TAU, face: 0, head: 0, ratio: 0, gait: 'parado', since: 0, flash: null, flashUntil: 0 });

// Atualiza a passada: devolve a marcha atual e os efeitos do corpo. Para onde o corpo olha: quem defende acompanha a bola quando vai devagar;
// os demais olham para onde correm. Isso é o que separa corrida de frente, lateral e de costas.
export function stepGait(
  s: GaitState,
  q: { vx: number; vy: number; maxSpeed: number; dt: number; now: number; watch?: { x: number; y: number; px: number; py: number }; speedMul?: number },
  enabled: (g: Gait) => boolean,
): { gait: Gait; fx: GaitFx; changed: boolean } {
  const speed = Math.hypot(q.vx, q.vy);
  const ratio = speed / q.maxSpeed;
  const dts = Math.max(0.001, q.dt / 1000);
  const accel = (ratio - s.ratio) / dts;
  const head = speed > 8 ? Math.atan2(q.vy, q.vx) : s.head;
  const turn = speed > 8 ? Math.abs(angDiff(s.head, head)) / dts : 0;
  let faceTarget = head;
  if (q.watch && ratio < 0.8) faceTarget = Math.atan2(q.watch.y - q.watch.py, q.watch.x - q.watch.px);
  if (speed <= 8 && !q.watch) faceTarget = s.face;
  s.face += angDiff(s.face, faceTarget) * (1 - Math.exp(-q.dt / 140));
  const rel = Math.abs(angDiff(s.face, head));
  const lowSpeed = ratio < 0.06;
  let gait = classifyGait({ ratio, accel: Math.max(-6, Math.min(6, accel)), turn, rel: lowSpeed ? 0 : rel }, enabled);
  // Marchas de ação seguram por um instante para a leitura ser visível, depois voltam ao ritmo
  if (gait === 'arrancada' || gait === 'freada' || gait === 'direcao') { s.flash = gait; s.flashUntil = q.now + 260; }
  else if (s.flash && q.now < s.flashUntil && enabled(s.flash)) gait = s.flash;
  const fx = gaitFx(gait, ratio, q.speedMul ?? 1);
  s.phase = (s.phase + speed * dts * fx.rate * 1.6) % (TAU * 50);
  s.head = head;
  s.ratio += (ratio - s.ratio) * (1 - Math.exp(-q.dt / 90));
  const changed = gait !== s.gait;
  if (changed) { s.gait = gait; s.since = q.now; }
  return { gait, fx, changed };
}
