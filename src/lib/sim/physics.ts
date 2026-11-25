// Núcleo de física do 7v7 (fase 1, prova de conceito). Módulo puro: sem DOM, sem Math.random, sem React.
// Mesmas entradas e mesmo passo de tempo dão exatamente o mesmo estado (requisito para o multiplayer).
// Unidades: unidades do campo do 7v7 (700 x 420); ~6,5 unidades por metro. Altura (z) em unidades.

export const SIM = {
  DT: 1 / 60, // passo fixo
  G: 64, // gravidade (9,81 m/s² convertidos para unidades)
  BALL_R: 4, // raio da bola
  DISC_R: 12, // raio físico do disco (não muda com a câmera)
  DISC_H: 16, // altura do disco: bola acima disso passa por cima dele
  DISC_VMAX: 110, // velocidade máxima do disco
  DISC_ACC: 180, // aceleração com comando (0 a 110 em ~0,6 s)
  DISC_FRICT: 90, // atrito passivo sem comando: inércia, o disco desliza até parar. Menor que a aceleração, para que um jogador consiga empurrar outro disco
  DISC_TURN: 9, // velocidade de giro da orientação (rad/s, aproximado)
  BALL_E_GROUND: 0.55, // quique (restituição) no chão
  BALL_E_DISC: 0.65, // batida bola-disco
  DISC_E: 0.6, // batida disco-disco
  ROLL_DECEL: 60, // desaceleração constante da bola rolando no chão (unid/s²)
  AIR: 0.02, // arrasto do ar (1/s)
};

export type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number };
export type Disc = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  h: number; // orientação (rad), segue a direção do movimento
  wx: number; // comando atual: direção desejada (vetor, não normalizado)
  wy: number;
  wp: number; // potência do comando, 0 a 1
};
export type World = { t: number; ball: Ball; discs: Disc[]; contacts: string[] };

export function makeWorld(discs: Array<{ id: string; x: number; y: number }>, ball: { x: number; y: number }): World {
  return {
    t: 0,
    ball: { x: ball.x, y: ball.y, z: SIM.BALL_R, vx: 0, vy: 0, vz: 0 },
    discs: discs.map((d) => ({ id: d.id, x: d.x, y: d.y, vx: 0, vy: 0, h: 0, wx: 0, wy: 0, wp: 0 })),
    contacts: [],
  };
}

// Comando do jogador: direção e potência. O disco acelera até a velocidade máxima e freia sem comando (inércia).
export function steer(d: Disc, dx: number, dy: number, power: number) {
  d.wx = dx;
  d.wy = dy;
  d.wp = Math.max(0, Math.min(1, power));
}

// Chute ou passe a partir de um disco em contato com a bola. `apex` é a altura máxima da trajetória (0 = rasteiro).
// Só funciona se a bola estiver ao alcance do disco: sem contato, nada acontece.
export function kick(w: World, discId: string, dx: number, dy: number, speed: number, apex: number): boolean {
  const d = w.discs.find((x) => x.id === discId);
  if (!d) return false;
  const reach = SIM.DISC_R + SIM.BALL_R + 4;
  if (Math.hypot(w.ball.x - d.x, w.ball.y - d.y) > reach || w.ball.z > SIM.DISC_H) return false;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  w.ball.vx = ux * speed + d.vx * 0.5;
  w.ball.vy = uy * speed + d.vy * 0.5;
  w.ball.vz = apex > 0 ? Math.sqrt(2 * SIM.G * apex) : 0;
  if (apex <= 0) w.ball.z = SIM.BALL_R;
  return true;
}

export function step(w: World, dt = SIM.DT) {
  // 1) discos: aceleração em direção ao comando, inércia e orientação
  for (const d of w.discs) {
    const wl = Math.hypot(d.wx, d.wy);
    let tx = 0;
    let ty = 0;
    let acc = SIM.DISC_FRICT;
    if (wl > 1e-6 && d.wp > 0) {
      tx = (d.wx / wl) * SIM.DISC_VMAX * d.wp;
      ty = (d.wy / wl) * SIM.DISC_VMAX * d.wp;
      acc = SIM.DISC_ACC;
    }
    const ex = tx - d.vx;
    const ey = ty - d.vy;
    const el = Math.hypot(ex, ey);
    const maxDv = acc * dt;
    if (el > maxDv) {
      d.vx += (ex / el) * maxDv;
      d.vy += (ey / el) * maxDv;
    } else {
      d.vx = tx;
      d.vy = ty;
    }
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const sp = Math.hypot(d.vx, d.vy);
    if (sp > 4) {
      // gira suavemente em direção ao movimento
      let dh = Math.atan2(d.vy, d.vx) - d.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      d.h += Math.max(-SIM.DISC_TURN * dt, Math.min(SIM.DISC_TURN * dt, dh));
    }
  }

  // 2) bola: gravidade, quique, rolagem e arrasto
  const b = w.ball;
  b.vz -= SIM.G * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  if (b.z <= SIM.BALL_R) {
    b.z = SIM.BALL_R;
    if (b.vz < 0) {
      b.vz = -b.vz * SIM.BALL_E_GROUND;
      if (b.vz < 8) b.vz = 0; // pequenos quiques param
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - SIM.ROLL_DECEL * dt) / sp;
      b.vx *= ns;
      b.vy *= ns;
    }
  } else {
    const f = Math.exp(-SIM.AIR * dt);
    b.vx *= f;
    b.vy *= f;
  }

  // 3) colisão bola-disco: só quando a bola está abaixo da altura do disco
  w.contacts = [];
  for (const d of w.discs) {
    const nx0 = b.x - d.x;
    const ny0 = b.y - d.y;
    const dist = Math.hypot(nx0, ny0);
    const minD = SIM.DISC_R + SIM.BALL_R;
    if (dist >= minD || b.z > SIM.DISC_H) continue;
    const nx = dist > 1e-6 ? nx0 / dist : 1;
    const ny = dist > 1e-6 ? ny0 / dist : 0;
    b.x = d.x + nx * minD;
    b.y = d.y + ny * minD;
    const rvx = b.vx - d.vx;
    const rvy = b.vy - d.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const j = -(1 + SIM.BALL_E_DISC) * vn;
      b.vx += j * nx;
      b.vy += j * ny;
    }
    w.contacts.push(d.id);
  }

  // 4) colisão disco-disco: separação e troca da velocidade normal (massas iguais)
  for (let i = 0; i < w.discs.length; i += 1) {
    for (let j = i + 1; j < w.discs.length; j += 1) {
      const a = w.discs[i];
      const c = w.discs[j];
      const nx0 = c.x - a.x;
      const ny0 = c.y - a.y;
      const dist = Math.hypot(nx0, ny0);
      const minD = SIM.DISC_R * 2;
      if (dist >= minD) continue;
      const nx = dist > 1e-6 ? nx0 / dist : 1;
      const ny = dist > 1e-6 ? ny0 / dist : 0;
      const push = (minD - dist) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      c.x += nx * push;
      c.y += ny * push;
      const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (vn < 0) {
        const k = (1 + SIM.DISC_E) * vn / 2;
        a.vx += k * nx;
        a.vy += k * ny;
        c.vx -= k * nx;
        c.vy -= k * ny;
      }
    }
  }
  w.t += dt;
}

export function snapshot(w: World) {
  return {
    t: +w.t.toFixed(4),
    ball: [w.ball.x, w.ball.y, w.ball.z, w.ball.vx, w.ball.vy, w.ball.vz],
    discs: w.discs.map((d) => [d.id, d.x, d.y, d.vx, d.vy, d.h]),
  };
}
