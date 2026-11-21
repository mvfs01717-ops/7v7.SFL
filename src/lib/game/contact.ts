// Contato com a bola e defesa (discos vistos de cima). Funções puras: decidem O QUE acontece; o MatchPitch executa e aplica a consequência.
// Nada aqui muda o desfecho do plano (gol/defesa/chute): só a coreografia de rotina e as chances do jogo corrido.
export type ContactKind = 'dominio' | 'amortecimento' | 'orientado' | 'primeira' | 'erro' | 'protecao' | 'aereo';
export const CONTACT_ID: Record<ContactKind, string> = {
  dominio: 'fx.touch',
  amortecimento: 'dom.amortecimento',
  orientado: 'dom.orientado',
  primeira: 'dom.primeira',
  erro: 'dom.erro',
  protecao: 'dom.protecao',
  aereo: 'dom.aereo',
};

export type ContactCtx = {
  dur: number; // duração do passe (ms): quanto menor, mais forte chega
  arc: number; // altura do passe (0 = rasteiro)
  ambient: boolean; // passe de rotina (o plano nunca perde a bola)
  ovr: number; // overall de quem recebe
  oppD: number; // distância do marcador mais perto
  spaceSide: number; // -1 ou 1: lado (em relação à direção da bola) com mais espaço livre
  spaceOpen: boolean; // existe espaço de verdade para dirigir a bola
  canShoot: boolean; // perto do gol, atacante
  mateAhead: boolean; // há companheiro livre à frente
  tired?: number; // fadiga de quem recebe (0 a 1)
};
export type ContactPlan = {
  kind: ContactKind;
  fwd: number; // sobra da bola ao longo da direção do passe (px)
  lat: number; // desvio lateral da bola (px, positivo = spaceSide)
  settle: number; // quanto tempo a bola leva para assentar (ms)
  hold: number; // tempo até o jogador decidir de novo (ms)
  loose: boolean; // a bola escapa e o jogador precisa recuperar
  steer: number; // 0 ou 1: o disco sai levando a bola para o espaço (domínio orientado)
};

export const CONTACT_KINDS: ContactKind[] = ['dominio', 'amortecimento', 'orientado', 'primeira', 'erro', 'protecao', 'aereo'];

export function chooseContact(c: ContactCtx, rnd: () => number, on: (k: ContactKind) => boolean = () => true): ContactPlan {
  const force = Math.max(0.4, Math.min(1.5, 520 / c.dur)); // força do passe
  const pressured = c.oppD < 62;
  const skill = Math.max(0, Math.min(1, (c.ovr - 55) / 40));
  const w: Partial<Record<ContactKind, number>> = { dominio: 1 };
  if (c.arc >= 12) w.aereo = 3.2;
  else {
    if (force > 1.08) w.amortecimento = 1.6 + (force - 1.08) * 3;
    if (c.spaceOpen && pressured) w.orientado = 1.4 + skill * 1.2;
    else if (c.spaceOpen) w.orientado = 0.5 + skill * 0.6;
    if (c.ambient && skill > 0.3 && (c.canShoot || c.mateAhead)) w.primeira = (pressured ? 1.4 : 0.6) * (0.5 + skill);
    if (pressured) w.protecao = 0.8 + (1 - skill) * 0.4;
    // Erro de domínio: passe forte, marcador colado, jogador de overall baixo. Só em jogo corrido.
    if (c.ambient && force > 1 && pressured) w.erro = 0.25 + (1 - skill) * 0.9 + (c.tired ?? 0) * 0.9;
    if (c.ambient && (c.tired ?? 0) > 0.5 && !pressured && force > 1) w.erro = (w.erro ?? 0) + 0.3;
  }
  let tot = 0;
  const list: [ContactKind, number][] = [];
  for (const k of CONTACT_KINDS) {
    const x = w[k];
    if (x && (k === 'dominio' || on(k))) {
      list.push([k, x]);
      tot += x;
    }
  }
  let r = rnd() * tot;
  let kind: ContactKind = 'dominio';
  for (const [k, x] of list) {
    r -= x;
    if (r <= 0) {
      kind = k;
      break;
    }
  }
  const base = { fwd: 0, lat: 0, settle: 260, hold: 0, loose: false, steer: 0 };
  switch (kind) {
    case 'amortecimento': // a bola chega rápida: passa do disco e vai perdendo velocidade até assentar
      return { kind, ...base, fwd: 12 + 14 * Math.min(1.4, force), settle: 420, hold: 380 + (1 - skill) * 220 + (c.tired ?? 0) * 260 };
    case 'orientado': // o primeiro toque já leva a bola para o espaço livre
      return { kind, ...base, fwd: 8, lat: 15 * c.spaceSide, settle: 300, hold: 110, steer: 1 };
    case 'primeira': // toque único: a bola nem assenta e a decisão vem na hora
      return { kind, ...base, fwd: 6, settle: 120, hold: 30 };
    case 'erro': // domínio errado: a bola escapa e o jogador corre atrás dela
      return { kind, ...base, fwd: 34 + 20 * (1 - skill), lat: (rnd() < 0.5 ? -1 : 1) * (10 + 14 * rnd()), settle: 650, hold: 1150, loose: true };
    case 'protecao': // com o marcador colado, o corpo fica entre a bola e ele
      return { kind, ...base, fwd: 0, settle: 520, hold: 260 };
    case 'aereo': // bola vinda do alto: a bola cai, quica e só então é dominada
      return { kind, ...base, fwd: 16, settle: 520, hold: 330 + (1 - skill) * 160 };
    default:
      return { kind, ...base, hold: 0 };
  }
}

// Linha de passe: a bola pode ser cortada por quem está perto do trajeto, não só perto do destino
export function segPoint(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number; x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { d: Math.hypot(px - x, py - y), t, x, y };
}
// Chance de corte: sobe quando o marcador está colado na linha e longe da bola (tempo de chegar); passe lento e longo é mais fácil de cortar
export function laneCut(d: number, t: number, dur: number, ovr: number): number {
  if (d > 46 || t < 0.12 || t > 0.9) return 0;
  const close = (46 - d) / 46;
  const slow = Math.max(0, Math.min(1, (dur - 380) / 500));
  return Math.max(0, Math.min(0.42, 0.05 + close * 0.22 + slow * 0.1 + (ovr - 70) * 0.002));
}

export type TackleKind = 'carrinho' | 'emPe' | 'disputa';
export type TackleCtx = {
  ovrD: number;
  ovrH: number;
  hRatio: number; // velocidade de quem tem a bola / máxima
  behind: boolean; // o marcador vem por trás ou de lado
  tiredD?: number; // fadiga do marcador (0 a 1)
  tiredH?: number; // fadiga de quem tem a bola
  helpers: number; // outros defensores a até 75px (pressão coordenada)
  shielding: boolean; // quem tem a bola está se protegendo
};
export function chooseTackle(c: TackleCtx, rnd: () => number, on: (k: TackleKind) => boolean = () => true): { kind: TackleKind; winMod: number } {
  const w: Record<TackleKind, number> = { emPe: 1.6, carrinho: 0.2, disputa: 0 };
  if (c.behind) w.carrinho += 0.55;
  if (c.hRatio > 0.7) w.carrinho += 0.35;
  if (Math.abs(c.ovrD - c.ovrH) <= 7 && c.hRatio < 0.4) w.disputa = 1.5;
  if (c.shielding) w.disputa += 0.6;
  if (!on('carrinho')) w.carrinho = 0;
  if (!on('disputa')) w.disputa = 0;
  const tot = w.emPe + w.carrinho + w.disputa;
  let r = rnd() * tot;
  let kind: TackleKind = 'emPe';
  for (const k of ['carrinho', 'disputa', 'emPe'] as TackleKind[]) {
    r -= w[k];
    if (r <= 0) {
      kind = k;
      break;
    }
  }
  // Consequência real: carrinho bem encaixado (por trás, bola veloz) funciona; mal encaixado é arriscado.
  let winMod = 0;
  if (kind === 'carrinho') winMod = c.behind && c.hRatio > 0.55 ? 0.05 : -0.08;
  if (kind === 'disputa') winMod = 0; // a disputa aproxima a chance de 50%
  winMod += Math.min(2, c.helpers) * 0.04; // quem tem cobertura por perto desarma mais
  winMod += (c.tiredH ?? 0) * 0.07 - (c.tiredD ?? 0) * 0.09; // cansaço pesa mais em quem dá o bote
  if (c.shielding) winMod -= 0.1; // quem protege a bola é mais difícil de desarmar
  return { kind, winMod };
}
