// Níveis de função do 7v7: Normal (0), + (1) e ++ (2). O nível vem do cadastro do administrador (players.role_mastery[função].lv).
// Funções puras. O nível NÃO mexe em atributo nenhum: ele muda o comportamento (onde o disco se coloca, como lê o jogo, o que escolhe),
// sempre atenuado por overall, personalidade, cansaço e pressão. Normal = o comportamento que o jogo já tinha; + e ++ somam camadas.
export type Lv = 0 | 1 | 2;
export type RP = { x: number; y: number; key: string; pos: string; ovr: number; vx?: number; vy?: number };
export type RC = {
  self: RP;
  d: 1 | -1; // direção do ataque (+1 = para a direita)
  own: boolean; // o time está com a bola
  ball: { x: number; y: number };
  holder?: RP; // quem está com a bola (de qualquer time)
  holderPressure: number; // 0 a 1: marcação sobre quem tem a bola
  holderControlling: boolean; // o portador acabou de receber e ainda está assentando a bola
  mates: RP[]; // companheiros de linha (sem o próprio)
  opps: RP[]; // adversários de linha
  markOpp?: RP; // adversário que este jogador marca
  coverMate: boolean; // há companheiro perto da bola para dar cobertura
  prog: number; // 0 a 1: quanto a bola avançou rumo ao gol adversário
  u: number; // urgência por placar e tempo (-1 a 1)
  mom: number; // momento da partida (-1 a 1)
  t: number; // segundos
  seed: number; // 0 a 1, fixo por jogador
  ous: number;
  cri: number;
  col: number;
  tired: number; // 0 a 1
  midY: number;
  ownGX: number; // x da linha do próprio gol
  oppGX: number;
  y0: number;
  y1: number;
  x0: number;
  x1: number;
};
export type Move = { x: number; y: number; w: number; speed?: number; tag: string };

const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const skillOf = (ovr: number) => cl((ovr - 55) / 40, 0, 1);
// Quanto do comportamento aparece: overall alto e descansado executa melhor, mas nunca 100%: o ++ não é infalível
const scaleOf = (c: RC) => (0.65 + 0.35 * skillOf(c.self.ovr)) * (1 - 0.35 * c.tired);

function freeSpot(c: RC, cx: number, cy: number, R: number): { x: number; y: number; gap: number } {
  let best = { x: cx, y: cy, gap: 0 };
  let bs = -1e9;
  for (let k = 0; k < 9; k += 1) {
    const a = (k * Math.PI) / 4;
    const px = cl(k === 8 ? cx : cx + Math.cos(a) * R, c.x0 + 12, c.x1 - 12);
    const py = cl(k === 8 ? cy : cy + Math.sin(a) * R, c.y0 + 12, c.y1 - 12);
    let m = 90;
    for (const o of c.opps) m = Math.min(m, Math.hypot(o.x - px, o.y - py));
    const s = m - 0.25 * Math.hypot(px - cx, py - cy);
    if (s > bs) {
      bs = s;
      best = { x: px, y: py, gap: m };
    }
  }
  return best;
}
// Linha defensiva do adversário (a posição do defensor mais recuado em direção ao gol dele) e da própria equipe
const oppLine = (c: RC): number => {
  if (!c.opps.length) return c.oppGX;
  return c.d > 0 ? Math.max(...c.opps.map((o) => o.x)) : Math.min(...c.opps.map((o) => o.x));
};
const nearestOppD = (c: RC, p: { x: number; y: number }) => c.opps.reduce((m, o) => Math.min(m, Math.hypot(o.x - p.x, o.y - p.y)), 999);
const nearestMateD = (c: RC, p: { x: number; y: number }) => c.mates.reduce((m, o) => Math.min(m, Math.hypot(o.x - p.x, o.y - p.y)), 999);
const sideSign = (c: RC) => (c.self.y < c.midY ? -1 : 1);

// ---------- Movimentação sem a bola ----------
export function roleMove(role: string, lv: Lv, c: RC): Move | null {
  if (lv === 0) return null;
  const sc = scaleOf(c);
  const h = c.holder && c.holder.key !== c.self.key ? c.holder : undefined;
  const mk = (x: number, y: number, w: number, tag: string, speed?: number): Move => ({ x: cl(x, c.x0 + 12, c.x1 - 12), y: cl(y, c.y0 + 12, c.y1 - 12), w: cl(w * sc, 0, 0.85), tag, speed });
  const ahead = (x: number, n: number) => x + c.d * n;
  const cyc = (period: number) => (c.t / period + c.seed) % 1;
  switch (role) {
    // ---- Goleiros ----
    case 'gk-trad': {
      if (c.own || !h || Math.abs(h.x - c.ownGX) > 260) return null;
      const y = c.midY + (h.y - c.midY) * 0.55;
      if (lv === 2 && Math.abs(h.x - c.ownGX) < 130 && nearestMateD(c, h) > 70) return mk(c.ownGX + c.d * 46, y, 0.8, 'sai-no-um-contra-um', 1.3);
      return mk(c.ownGX + c.d * 22, y, 0.7, 'fecha-o-angulo');
    }
    case 'gk-build': {
      if (!c.own) return null;
      const press = h ? nearestOppD(c, h) : 999;
      return mk(c.ownGX + c.d * (lv === 2 ? 44 : 32), c.midY + (h ? -Math.sign(h.y - c.midY) * (lv === 2 ? 60 : 36) : 0), lv === 2 ? 0.6 : 0.5, press < 90 ? 'oferece-linha-de-passe' : 'abre-para-trocar');
    }
    case 'gk-libero': {
      if (c.own) return lv === 2 ? mk(c.ownGX + c.d * 64, c.midY + (c.ball.y - c.midY) * 0.3, 0.5, 'sobe-com-a-linha') : null;
      const defs = c.mates.filter((m) => m.pos === 'LB' || m.pos === 'RB');
      const lineX = defs.length ? defs.reduce((a, m) => a + m.x, 0) / defs.length : c.ownGX + c.d * 120;
      const frac = lv === 2 ? 0.46 : 0.3;
      const off = Math.max(18, Math.min(98, Math.abs(lineX - c.ownGX) * frac));
      const x = c.ownGX + c.d * off;
      return mk(x, c.midY + (c.ball.y - c.midY) * 0.35, 0.75, lv === 2 ? 'coordena-com-a-linha' : 'cobre-as-costas');
    }
    // ---- Zagueiros ----
    case 'df-build': {
      if (c.own && h) {
        if (lv === 2 && c.prog < 0.55 && nearestOppD(c, h) > 110) return mk(ahead(c.ball.x, -22), c.self.y, 0.5, 'sobe-para-construir');
        const s = freeSpot(c, ahead(h.x, -45), h.y + (c.self.y - h.y) * 0.6, 60);
        return mk(s.x, s.y, 0.45, 'oferece-saida');
      }
      return lv === 2 ? mk(c.ownGX + c.d * 120, c.self.y, 0.35, 'recompoe-rapido') : null;
    }
    case 'df-mark': {
      const m = c.markOpp;
      if (c.own || !m) return null;
      const lead = lv === 2 ? 0.45 : 0;
      return mk(m.x + (m.vx ?? 0) * lead - c.d * 18, m.y + (m.vy ?? 0) * lead, lv === 2 ? 0.65 : 0.55, lv === 2 ? 'le-a-corrida' : 'gruda');
    }
    case 'df-anti': {
      if (c.own || !h) return null;
      // Receptor mais provável: adversário livre e mais adiantado que o portador
      let tgt: RP | undefined;
      let bs = -1e9;
      for (const o of c.opps) {
        if (o.key === h.key) continue;
        const adv = (o.x - h.x) * c.d * -1; // quão mais perto do gol do portador (ele ataca na direção contrária)
        const s = adv * 0.5 + Math.min(80, nearestOppD({ ...c, opps: c.mates } as RC, o)) * 0.4 - Math.hypot(o.x - h.x, o.y - h.y) * 0.25;
        if (s > bs) {
          bs = s;
          tgt = o;
        }
      }
      if (!tgt) return null;
      const f = lv === 2 ? 0.5 : 0.42;
      return mk(h.x + (tgt.x - h.x) * f, h.y + (tgt.y - h.y) * f, lv === 2 ? 0.6 : 0.5, lv === 2 ? 'escolhe-o-momento' : 'fecha-a-linha');
    }
    case 'df-aggr': {
      if (c.own || !h) return null;
      const dist = Math.hypot(h.x - c.self.x, h.y - c.self.y);
      if (lv === 1) return dist < 240 && c.coverMate ? mk(h.x - c.d * 12, h.y, 0.8, 'pressao-com-cobertura', 1.3) : null;
      // ++: só dá o bote no momento certo (portador assentando a bola ou cansado) e com cobertura
      if (dist < 300 && c.coverMate && (c.holderControlling || h.ovr < c.self.ovr - 4)) return mk(h.x - c.d * 10, h.y, 0.9, 'bote-na-hora-certa', 1.4);
      return null;
    }
    // ---- Meio-campistas ----
    case 'mc-play': {
      if (!c.own || !h) return null;
      if (lv === 2) {
        const pressed = nearestOppD(c, h) < 70;
        if (pressed) {
          const away = Math.sign(h.y - c.midY) || 1;
          return mk(ahead(h.x, -40), h.y - away * 70, 0.6, 'apoio-seguro');
        }
        if (Math.sin(c.t * 0.9 + c.seed * 6.28) > 0.65 && c.cri > 0.35) return mk(ahead(h.x, 50), c.midY - Math.sign(c.self.y - c.midY || 1) * 80, 0.5, 'isca-que-puxa-marcador');
        const s = freeSpot(c, ahead(h.x, 120), c.midY + (h.y - c.midY) * 0.4, 62);
        return mk(s.x, s.y, 0.6, 'manipula-o-espaco');
      }
      const s = freeSpot(c, ahead(h.x, 95), c.midY + (h.y - c.midY) * 0.4, 56);
      return s.gap > 38 ? mk(s.x, s.y, 0.5, 'espaco-entre-linhas') : null;
    }
    case 'mc-b2b': {
      if (c.own && h) {
        const tempo = c.mom * 0.5 + c.u * 0.5 + (c.prog - 0.5);
        const mateBehind = c.mates.some((m) => (m.x - c.self.x) * c.d < -60);
        if (lv === 2) {
          if (tempo < -0.12) return mk(c.ownGX + (c.ball.x - c.ownGX) * 0.4, c.midY + (c.ball.y - c.midY) * 0.4, 0.5, 'protege-o-espaco');
          if (tempo > 0.12 && c.prog > 0.45) return mk(c.oppGX - c.d * 105, c.midY + (c.self.y - c.midY) * 0.5, 0.6, 'chega-na-hora');
          return mk(ahead(h.x, -55), h.y + (Math.sign(c.midY - h.y) || 1) * 44, 0.4, 'apoia');
        }
        if (c.prog > 0.6 && mateBehind) return mk(c.oppGX - c.d * 108, c.midY + (c.self.y - c.midY) * 0.5, 0.5, 'chegada-sincronizada');
        return null;
      }
      return c.prog < 0.6 ? mk(c.ownGX + (c.ball.x - c.ownGX) * 0.45, c.midY + (c.ball.y - c.midY) * 0.4, lv === 2 ? 0.6 : 0.45, 'recomposicao') : null;
    }
    case 'mc-hold': {
      if (!c.own) {
        const defs = c.mates.filter((m) => m.pos === 'LB' || m.pos === 'RB');
        const lineX = defs.length ? defs.reduce((a, m) => a + m.x, 0) / defs.length : c.ownGX + c.d * 120;
        if (lv === 2 && h) {
          const threat = c.opps.filter((o) => o.key !== h.key).sort((a, b) => (b.x - a.x) * -c.d - 0 || 0)[0];
          if (threat) return mk(h.x + (threat.x - h.x) * 0.45, h.y + (threat.y - h.y) * 0.45, 0.55, 'fecha-o-corredor');
        }
        return mk(lineX + c.d * 70, c.midY + (c.ball.y - c.midY) * 0.5, 0.5, 'protege-a-frente-da-zaga');
      }
      if (!h) return null;
      return lv === 2 ? mk(ahead(h.x, -70), c.midY - Math.sign(h.y - c.midY || 1) * 60, 0.5, 'segura-atras-e-troca') : mk(ahead(h.x, -70), c.self.y, 0.4, 'segura-atras');
    }
    case 'mc-inf': {
      if (!c.own || !h || c.prog < 0.45) return null;
      if (lv === 2) {
        const phase = Math.floor(cyc(2.4) * 3);
        if (phase === 0) return mk(ahead(oppLine(c), 16), c.midY + (c.self.y - c.midY) * 0.6, 0.65, 'ataca-a-profundidade');
        if (phase === 1) return null; // segura: não revela a corrida
        return mk(c.oppGX - c.d * 70, c.midY - Math.sign(h.y - c.midY || 1) * 30, 0.6, 'chega-no-segundo-pau');
      }
      return Math.abs(h.y - c.midY) > 80 ? mk(c.oppGX - c.d * 78, c.midY - Math.sign(h.y - c.midY || 1) * 22, 0.55, 'chegada-de-tras') : null;
    }
    // ---- Pontas ----
    case 'wg-wide': {
      const wide = sideSign(c) < 0 ? c.y0 + 30 : c.y1 - 30;
      if (!c.own) return mk(c.ownGX + (c.ball.x - c.ownGX) * 0.3, c.self.y, lv === 2 ? 0.45 : 0.3, 'volta-pra-marcar');
      if (lv === 2 && h && c.prog > 0.4 && c.holderPressure < 0.5) return mk(ahead(oppLine(c), 10), wide, 0.55, 'ataca-nas-costas-do-lateral');
      return mk(ahead(c.ball.x, 40), wide, 0.5, 'abre-o-campo');
    }
    case 'wg-inf': {
      if (!c.own || !h) return null;
      const inside = c.midY + (c.self.y - c.midY) * 0.3;
      if (lv === 2) {
        const marker = c.opps.slice().sort((a, b) => Math.hypot(a.x - c.self.x, a.y - c.self.y) - Math.hypot(b.x - c.self.x, b.y - c.self.y))[0];
        if (marker && Math.abs(marker.y - c.midY) < Math.abs(c.self.y - c.midY) - 6) return mk(ahead(h.x, 55), sideSign(c) < 0 ? c.y0 + 34 : c.y1 - 34, 0.5, 'abre-quando-o-lateral-fecha');
      }
      return mk(ahead(h.x, 60), inside, 0.5, 'corta-para-dentro');
    }
    case 'wg-play': {
      if (!c.own || !h) return null;
      if (lv === 2 && Math.sin(c.t * 0.6 + c.seed * 6.28) > 0.5) return mk(ahead(h.x, 40), sideSign(c) < 0 ? c.y0 + 40 : c.y1 - 40, 0.45, 'alterna-por-fora');
      const s = freeSpot(c, h.x, c.midY + (c.self.y - c.midY) * 0.55, 66);
      return mk(s.x, s.y, 0.5, 'organiza-por-dentro');
    }
    case 'wg-bal': {
      if (!c.own) return lv === 2 ? mk(c.ownGX + (c.ball.x - c.ownGX) * 0.3, c.self.y, 0.4, 'recompoe') : null;
      if (!h) return null;
      const wideY = sideSign(c) < 0 ? c.y0 + 34 : c.y1 - 34;
      const insideY = c.midY + (c.self.y - c.midY) * 0.3;
      const wGap = nearestOppD(c, { x: ahead(h.x, 55), y: wideY });
      const iGap = nearestOppD(c, { x: ahead(h.x, 55), y: insideY });
      return iGap > wGap + 6 ? mk(ahead(h.x, 55), insideY, 0.5, 'entra-no-espaco') : mk(ahead(h.x, 55), wideY, 0.5, 'abre-no-espaco');
    }
    // ---- Atacantes ----
    case 'at-fin': {
      if (!c.own) return null;
      if (lv === 2) {
        if (h && Math.abs(h.y - c.midY) > 90 && c.prog > 0.45) return mk(c.oppGX - c.d * 55, c.midY - Math.sign(h.y - c.midY) * 40, 0.65, 'segundo-pau');
        if (nearestOppD(c, c.self) < 30) return mk(ahead(c.self.x, 20), c.self.y + (sideSign(c) || 1) * 36, 0.5, 'fuga-de-marcacao');
      }
      const s = freeSpot(c, c.oppGX - c.d * 74, c.midY + (c.self.y - c.midY) * 0.5, 58);
      return mk(s.x, s.y, 0.55, 'espaco-entre-zagueiros');
    }
    case 'at-f9': {
      if (!c.own || !h) return null;
      if (lv === 2) {
        const p = cyc(7);
        if (p < 0.45) return mk(ahead(c.ball.x, 38), c.midY, 0.55, 'recua-e-atrai-marcador');
        if (p < 0.75) return mk(ahead(oppLine(c), 14), c.midY + (c.self.y - c.midY) * 0.5, 0.65, 'infiltra-nas-costas');
        return mk(ahead(c.ball.x, 90), c.midY + sideSign(c) * 80, 0.5, 'abre-pelo-lado');
      }
      return mk(ahead(c.ball.x, 42), c.midY, 0.55, 'recua-e-atrai-marcador');
    }
    case 'at-pivot': {
      if (!c.own || !h) return null;
      const x = ahead(h.x, lv === 2 ? 52 : 62);
      return mk(x, h.y + (c.midY - h.y) * 0.5, lv === 2 ? 0.55 : 0.5, lv === 2 ? 'segura-e-devolve' : 'apoio-de-costas');
    }
    case 'at-mobile': {
      if (!c.own) return null;
      if (lv === 2) {
        const p = cyc(6);
        if (p < 0.5) return mk(c.oppGX - c.d * 120, c.midY - Math.sign(c.ball.y - c.midY || 1) * 90, 0.55, 'estica-o-lado-contrario');
        if (h && c.holderPressure < 0.5) return mk(ahead(oppLine(c), 12), c.midY + (c.self.y - c.midY) * 0.6, 0.6, 'corrida-diagonal-nas-costas');
        return null;
      }
      const s = freeSpot(c, c.oppGX - c.d * 100, c.self.y, 70);
      return mk(s.x, s.y, 0.5, 'busca-o-canal');
    }
    default:
      return null;
  }
}

// ---------- Passe ----------
// Bônus de escolha por função e nível (vertical, seguro, curto). Soma no peso do candidato, dentro da escala que o jogo já usa.
export type PassAdj = { vert: number; safe: number; short: number };
const PASS: Record<string, [PassAdj, PassAdj]> = {
  'mc-play': [{ vert: 0.22, safe: 0, short: 0 }, { vert: 0.42, safe: 0, short: 0 }],
  'df-build': [{ vert: 0.12, safe: 0.05, short: 0 }, { vert: 0.24, safe: 0, short: 0 }],
  'gk-build': [{ vert: 0.08, safe: 0.1, short: 0 }, { vert: 0.22, safe: 0.04, short: 0 }],
  'wg-play': [{ vert: 0.12, safe: 0, short: 0.06 }, { vert: 0.24, safe: 0, short: 0.1 }],
  'mc-hold': [{ vert: 0, safe: 0.2, short: 0.08 }, { vert: 0.1, safe: 0.24, short: 0.12 }],
  'at-pivot': [{ vert: 0, safe: 0.18, short: 0.14 }, { vert: 0.06, safe: 0.1, short: 0.3 }],
  'at-f9': [{ vert: 0.1, safe: 0, short: 0.1 }, { vert: 0.2, safe: 0, short: 0.14 }],
  'mc-b2b': [{ vert: 0.06, safe: 0.04, short: 0 }, { vert: 0.12, safe: 0.08, short: 0 }],
};
export function passAdj(role: string, lv: Lv): PassAdj {
  if (lv === 0) return { vert: 0, safe: 0, short: 0 };
  const p = PASS[role];
  return p ? p[lv - 1] : { vert: 0.03 * lv, safe: 0, short: 0 };
}
// Multiplicador do risco de erro de passe e de domínio: consistência cresce com o nível, mas nunca zera o erro
const CONS: Record<string, number> = { 'mc-play': 0.14, 'df-build': 0.14, 'gk-build': 0.14, 'wg-play': 0.12, 'at-pivot': 0.12, 'mc-hold': 0.12 };
export const errMul = (role: string, lv: Lv): number => 1 - (CONS[role] ?? 0.08) * lv;

// ---------- Defesa ----------
// Antecipação: multiplicador da chance de cortar o passe, bônus por padrão repetido (só o ++ lê o que já viu) e cobertura quando falha
export type Anticip = { cut: number; read: number; cover: boolean };
const ANT: Record<string, [Anticip, Anticip]> = {
  'df-anti': [{ cut: 1.35, read: 0, cover: false }, { cut: 1.7, read: 0.06, cover: true }],
  'mc-hold': [{ cut: 1.15, read: 0, cover: false }, { cut: 1.35, read: 0.03, cover: true }],
  'df-mark': [{ cut: 1.05, read: 0, cover: false }, { cut: 1.15, read: 0, cover: false }],
  'gk-libero': [{ cut: 1.1, read: 0, cover: false }, { cut: 1.25, read: 0.02, cover: true }],
};
export function anticip(role: string, lv: Lv): Anticip {
  if (lv === 0) return { cut: 1, read: 0, cover: false };
  return ANT[role]?.[lv - 1] ?? { cut: 1 + 0.04 * lv, read: 0, cover: false };
}
// Goleiro líbero: chance de cortar com a saída da área um passe nas costas da defesa
export const sweepChance = (lv: Lv): number => (lv === 0 ? 0 : lv === 1 ? 0.1 : 0.2);
// Pequeno ajuste de desarme por função/nível (marcador e volante são melhores no bote; nunca decisivo)
const TK: Record<string, number> = { 'df-mark': 0.02, 'df-aggr': 0.02, 'mc-hold': 0.015, 'df-anti': 0.01 };
export const tackleMod = (role: string, lv: Lv): number => (TK[role] ?? 0.005) * lv;
// Drible: pontas e atacantes de movimento ganham um pouco de leitura de espaço
const DR: Record<string, number> = { 'wg-inf': 0.02, 'at-mobile': 0.015, 'wg-bal': 0.012, 'mc-inf': 0.012, 'wg-wide': 0.01 };
export const dribbleMod = (role: string, lv: Lv): number => (DR[role] ?? 0) * lv;
// Goleiro tradicional/construtor: segura melhor a bola (menos rebote) e fecha melhor o ângulo
export const gkHold = (role: string, lv: Lv): { rebound: number; onTarget: number } => {
  if (lv === 0) return { rebound: 1, onTarget: 0 };
  if (role === 'gk-trad') return lv === 1 ? { rebound: 0.75, onTarget: -0.02 } : { rebound: 0.55, onTarget: -0.04 };
  if (role === 'gk-libero') return lv === 1 ? { rebound: 0.92, onTarget: -0.01 } : { rebound: 0.85, onTarget: -0.02 };
  return lv === 1 ? { rebound: 0.95, onTarget: 0 } : { rebound: 0.9, onTarget: -0.01 };
};

// ---------- Textos (ADM e interface) ----------
export const LV_LABEL: Record<Lv, string> = { 0: 'Normal', 1: '+', 2: '++' };
export const LV_TEXT: Record<string, [string, string, string]> = {
  'gk-trad': ['Fica na linha e defende.', 'Fecha melhor o ângulo e segura mais a bola (menos rebote).', 'Lê o atacante, fecha o ângulo e sai no um contra um com critério; rebote bem menor.'],
  'gk-build': ['Participa da saída com passes curtos.', 'Oferece linha de passe e prefere o passe seguro ou vertical.', 'Muda de lado para abrir a saída e acha o passe vertical com mais frequência.'],
  'gk-libero': ['Sai da área para cortar bola longa.', 'Avalia as bolas nas costas da defesa: posição mais atrás da linha e saída para cortar (10%).', 'Coordena a profundidade com a linha defensiva, sobe junto no ataque e corta mais (20%).'],
  'df-build': ['Sai jogando com qualidade.', 'Oferece saída pelo meio-espaço e lança mais vertical.', 'Sobe para construir quando há espaço e recompõe rápido quando perde a bola.'],
  'df-mark': ['Gruda no atacante rival.', 'Marca mais colado e ganha um pouco mais nos desarmes.', 'Lê a corrida do marcado e já se coloca no caminho dela.'],
  'df-anti': ['Lê o jogo e corta o passe.', 'Fecha a linha de passe mais cedo (corta ~35% mais).', 'Escolhe o momento, lê padrões de passe repetidos (corta ~70% mais) e prepara a cobertura se falhar.'],
  'df-aggr': ['Sai da linha para pressionar.', 'Pressiona com cobertura: só sai se há companheiro atrás.', 'Dá o bote na hora certa (portador assentando a bola ou mais fraco) e só com cobertura.'],
  'mc-play': ['Organiza e procura o passe que quebra a defesa.', 'Procura espaço entre as linhas e passa mais vertical.', 'Manipula o espaço (isca, apoio seguro sob pressão) e cria passes difíceis.'],
  'mc-b2b': ['Corre de uma área à outra.', 'Chega ao ataque sincronizado, com alguém atrás para cobrir, e recompõe.', 'Lê o ritmo (placar, momento, avanço): chega, apoia ou protege o espaço.'],
  'mc-hold': ['Protege a defesa.', 'Fica à frente da zaga e segura a bola atrás com passe seguro.', 'Fecha o corredor do atacante mais perigoso, corta mais passes e dá a troca segura.'],
  'mc-inf': ['Chega de trás para dentro da área.', 'Chega de trás quando a bola está na ponta, no segundo pau.', 'Alterna corrida nas costas, espera e chegada no segundo pau: menos previsível.'],
  'wg-wide': ['Abre o campo e cruza.', 'Mantém a largura e volta para marcar.', 'Ataca as costas do lateral quando o portador não está pressionado.'],
  'wg-inf': ['Corta para dentro.', 'Corta para dentro ao receber e dribla um pouco melhor.', 'Abre quando o lateral fecha por dentro: escolhe o lado livre.'],
  'wg-play': ['Organiza pelos lados.', 'Entra por dentro e organiza em espaço livre.', 'Alterna entre organizar por dentro e abrir por fora, e passa mais vertical.'],
  'wg-bal': ['Alterna entre abrir e entrar.', 'Escolhe entrar ou abrir pelo espaço livre.', 'Mesma leitura e ainda recompõe ao perder a bola.'],
  'at-fin': ['Fica na área para finalizar.', 'Procura o espaço entre os zagueiros.', 'Ataca o segundo pau quando a bola está na ponta e foge da marcação colada.'],
  'at-f9': ['Recua para participar da construção.', 'Recua entre as linhas e puxa o zagueiro para fora.', 'Alterna recuo, infiltração nas costas e abertura pelo lado para desorganizar a marcação.'],
  'at-pivot': ['Segura a bola de costas.', 'Dá apoio de costas e devolve de primeira.', 'Segura e devolve para o companheiro que chega (passe curto mais frequente).'],
  'at-mobile': ['Se movimenta pelos lados.', 'Procura os canais entre os defensores.', 'Alterna esticar o lado contrário e corrida diagonal nas costas.'],
};
