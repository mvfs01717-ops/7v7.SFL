// Bola parada com jogada ensaiada (só contra o bot): antes do escanteio ou da falta o jogador escolhe a jogada.
// Cada jogada tem seu risco e sua recompensa; o resultado sai de um sorteio que leva em conta o ataque, a defesa e o cobrador.

export type SetKind = 'escanteio' | 'falta';
export type SetOption = 'cruzamento' | 'curto' | 'direto';
export type SetOutcome = 'gol' | 'defesa' | 'finalização' | 'posse';

export const SET_TITLE: Record<SetKind, string> = { escanteio: 'ESCANTEIO A FAVOR', falta: 'FALTA A FAVOR' };

export const SET_OPTIONS: Record<SetKind, { id: SetOption; label: string; icon: string; text: string; risk: 'baixo' | 'médio' | 'alto' }[]> = {
  escanteio: [
    { id: 'cruzamento', label: 'Bola na área', icon: '🎯', text: 'Cruzamento fechado para os atacantes subirem de cabeça.', risk: 'médio' },
    { id: 'curto', label: 'Toque curto', icon: '↔️', text: 'Troca de passes na ponta para abrir espaço e chutar com calma.', risk: 'baixo' },
    { id: 'direto', label: 'Direto pro gol', icon: '🚀', text: 'Tenta o gol olímpico. Quase nunca entra, mas é um golaço.', risk: 'alto' },
  ],
  falta: [
    { id: 'cruzamento', label: 'Bola na área', icon: '🎯', text: 'Levanta na área para a zaga se atrapalhar.', risk: 'médio' },
    { id: 'curto', label: 'Toque curto', icon: '↔️', text: 'Toca para o lado e finge a cobrança para abrir o ângulo.', risk: 'baixo' },
    { id: 'direto', label: 'Chute direto', icon: '🔥', text: 'Bate por cima da barreira. Rende mais com um bom cobrador.', risk: 'alto' },
  ],
};

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

// Chance de cada resultado. atk/def: média de overall do ataque de quem cobra e da defesa (zaga + goleiro) de quem marca.
export function setPieceOdds(kind: SetKind, option: SetOption, atk: number, def: number, taker: number) {
  const edge = clamp((atk - def) / 100, -0.2, 0.2);
  let g: number;
  let d: number;
  let f: number;
  if (kind === 'escanteio') {
    if (option === 'cruzamento') [g, d, f] = [0.2, 0.22, 0.28];
    else if (option === 'curto') [g, d, f] = [0.14, 0.3, 0.26];
    else [g, d, f] = [0.05, 0.1, 0.55];
  } else if (option === 'cruzamento') [g, d, f] = [0.17, 0.23, 0.3];
  else if (option === 'curto') [g, d, f] = [0.12, 0.28, 0.3];
  else [g, d, f] = [0.22 + clamp((taker - 75) / 200, -0.08, 0.1), 0.34, 0.3];
  g = clamp(g + edge * (option === 'direto' ? 0.25 : 0.5), 0.02, 0.45);
  const rest = 0.96 - g;
  const scale = Math.min(1, rest / (d + f));
  return { gol: g, defesa: d * scale, finalização: f * scale };
}

export function rollSetPiece(kind: SetKind, option: SetOption, atk: number, def: number, taker: number, roll: number): SetOutcome {
  const o = setPieceOdds(kind, option, atk, def, taker);
  if (roll < o.gol) return 'gol';
  if (roll < o.gol + o.defesa) return 'defesa';
  if (roll < o.gol + o.defesa + o.finalização) return 'finalização';
  return 'posse';
}

type Names = { shooter: string; keeper: string; club: string; taker: string };
export function setPieceText(kind: SetKind, option: SetOption, outcome: SetOutcome, n: Names): string {
  const where = kind === 'escanteio' ? 'Escanteio' : 'Falta';
  if (option === 'cruzamento') {
    if (outcome === 'gol') return `${where} cobrado por ${n.taker} direto na área, ${n.shooter} sobe mais que todo mundo e cabeceia para o gol de ${n.club}!`;
    if (outcome === 'defesa') return `${where}: ${n.taker} levanta a bola, ${n.shooter} cabeceia firme e ${n.keeper} espalma!`;
    if (outcome === 'finalização') return `${where}: bola na área, ${n.shooter} cabeceia, mas a bola passa por cima do gol.`;
    return `${where} cobrado na área, mas a zaga afasta de cabeça.`;
  }
  if (option === 'curto') {
    if (outcome === 'gol') return `${where} em jogada ensaiada: ${n.taker} toca curto, ${n.shooter} recebe na entrada da área e bate no canto. Gol de ${n.club}!`;
    if (outcome === 'defesa') return `${where} em jogada ensaiada: ${n.shooter} bate colocado e ${n.keeper} faz a defesa.`;
    if (outcome === 'finalização') return `${where} em toque curto: ${n.shooter} finaliza e a bola sai ao lado da trave.`;
    return `${where} em toque curto, mas a marcação fecha o espaço e o time recomeça a jogada.`;
  }
  if (kind === 'escanteio') {
    if (outcome === 'gol') return `Gol olímpico! ${n.taker} cobra o escanteio direto e a bola entra no ângulo!`;
    if (outcome === 'defesa') return `${n.taker} tenta o gol olímpico e ${n.keeper} salva quase em cima da linha!`;
    if (outcome === 'finalização') return `${n.taker} tenta o gol olímpico, mas a bola sai pela linha de fundo.`;
    return `${n.taker} cobra o escanteio fechado, mas a bola morre nas mãos da defesa.`;
  }
  if (outcome === 'gol') return `${n.shooter} bate a falta por cima da barreira e é gol de ${n.club}!`;
  if (outcome === 'defesa') return `${n.shooter} cobra a falta com força e ${n.keeper} voa para espalmar!`;
  if (outcome === 'finalização') return `${n.shooter} cobra a falta, a bola bate na barreira e sai.`;
  return `${n.shooter} bate a falta, mas a barreira se mexe e o time perde a bola.`;
}

// Sorteia os minutos das bolas paradas: longe dos lances do plano e do intervalo, com espaço entre elas.
export function pickSetPieceMinutes(taken: number[], userCount = 3, botCount = 2, rng: () => number = Math.random): { user: number[]; bot: number[] } {
  const used = new Set<number>();
  taken.forEach((m) => {
    used.add(m - 1);
    used.add(m);
    used.add(m + 1);
  });
  const chosen: number[] = [];
  const pick = (lo: number, hi: number) => {
    for (let tries = 0; tries < 40; tries += 1) {
      const m = lo + Math.floor(rng() * (hi - lo + 1));
      if (used.has(m) || chosen.some((c) => Math.abs(c - m) < 5)) continue;
      chosen.push(m);
      return m;
    }
    return null;
  };
  const user: number[] = [];
  const bot: number[] = [];
  for (let i = 0; i < userCount; i += 1) {
    const m = i === 0 ? pick(8, 42) : pick(50, 86);
    if (m) user.push(m);
  }
  for (let i = 0; i < botCount; i += 1) {
    const m = i === 0 ? pick(8, 42) : pick(50, 86);
    if (m) bot.push(m);
  }
  return { user: user.sort((a, b) => a - b), bot: bot.sort((a, b) => a - b) };
}
