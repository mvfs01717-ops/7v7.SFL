// Lateral e tiro de meta interativos: o que o jogador escolhe (receptor, jogada) e a consequência na simulação.
// O desfecho de gols continua vindo do plano; aqui só se decide quem recebe a reposição e se o adversário corta.
export type RKind = 'lateral' | 'tirometa';
export type RPlay = 'tradicional' | 'rapido' | 'curto' | 'longo' | 'medio';
export type RPlayer = { key: string; name: string; pos: string; ovr: number; side: 'user' | 'bot'; x: number; y: number };
// live: distâncias medidas na cena no momento da confirmação (receptor ao cobrador/bola e ao defensor mais próximo), usadas no risco
// live: medidas na cena no momento da confirmação. lane = distância do defensor mais próximo à trajetória da bola (quem pode interceptar); cut = esse defensor
export type RestartChoice = { target: string; play: RPlay; live?: { d: number; lane: number; cut?: string } };
export type RestartReq = {
  kind: RKind;
  minute: number;
  // posições já no quadro da câmera (time do usuário atacando para a direita)
  players: RPlayer[];
  taker: string;
  ball: { x: number; y: number };
  candidates: string[];
  resolve: (c: RestartChoice) => void;
};

export const RPLAYS: Record<RKind, { id: RPlay; label: string; text: string }[]> = {
  lateral: [
    { id: 'tradicional', label: 'Lateral Tradicional', text: 'Arremesso comum para o companheiro escolhido.' },
    { id: 'rapido', label: 'Lateral Rápido', text: 'Cobra sem esperar o time se organizar: o companheiro recebe mais livre da marcação que está se ajeitando, mas o arremesso é menos preciso.' },
    { id: 'curto', label: 'Passe Curto', text: 'Toque curto e seguro: quase não perde a bola, mas só vale para quem está perto.' },
    { id: 'longo', label: 'Arremesso Longo', text: 'Arremesso forte para longe: chega ao ataque, mas o adversário corta com mais frequência.' },
  ],
  tirometa: [
    { id: 'curto', label: 'Curto', text: 'Passe rasteiro e seguro para a defesa, com pouco risco.' },
    { id: 'medio', label: 'Médio', text: 'Passe de média distância para o meio-campo.' },
    { id: 'longo', label: 'Longo', text: 'Chutão para o ataque: a bola chega longe, mas a disputa é arriscada.' },
  ],
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Chance de o adversário cortar a reposição. `oppD` = distância do marcador mais próximo ao receptor, `d` = distância da bola ao receptor.
export function loseChance(kind: RKind, play: RPlay, d: number, oppD: number, takerOvr: number, recvOvr: number): number {
  const base: Record<RPlay, number> = kind === 'lateral'
    ? { tradicional: 0.08, rapido: 0.1, curto: 0.035, longo: 0.3, medio: 0.15 }
    : { curto: 0.06, medio: 0.17, longo: 0.36, tradicional: 0.1, rapido: 0.1 };
  let p = base[play] + (d / 320) * 0.22;
  if (play === 'rapido') p -= oppD < 90 ? 0.04 : 0; // marcação desorganizada
  p += oppD < 38 ? 0.2 : oppD < 62 ? 0.1 : oppD < 90 ? 0.03 : -0.03;
  p -= (takerOvr - 75) * 0.003 + (recvOvr - 75) * 0.0025;
  if (play === 'curto' && d > 150) p += 0.2; // curto demais para longe vira passe ruim
  return clamp(p, 0.02, 0.75);
}

export function riskLabel(p: number): { t: string; c: string } {
  return p < 0.12 ? { t: 'BAIXO', c: '#2ee66b' } : p < 0.28 ? { t: 'MÉDIO', c: '#facc15' } : { t: 'ALTO', c: '#f87171' };
}
