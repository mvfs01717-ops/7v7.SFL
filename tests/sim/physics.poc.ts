import { SIM, makeWorld, steer, kick, step, snapshot, type World } from '../../src/lib/sim/physics';

let pass = 0, fail = 0;
const results: string[] = [];
function check(name: string, ok: boolean, info = '') {
  if (ok) pass++; else fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
}
const run = (w: World, secs: number) => { const n = Math.round(secs / SIM.DT); for (let i = 0; i < n; i++) step(w); };
const f = (x: number) => +x.toFixed(3);

// 1) determinismo: mesma entrada, mesmo estado
function scenario(): World {
  const w = makeWorld([{ id: 'a', x: 200, y: 200 }, { id: 'b', x: 260, y: 205 }, { id: 'c', x: 230, y: 240 }], { x: 205, y: 200 });
  steer(w.discs[0], 1, 0.2, 1);
  for (let i = 0; i < 30; i++) step(w);
  kick(w, 'a', 1, 0, 200, 40);
  for (let i = 0; i < 240; i++) step(w);
  return w;
}
const s1 = JSON.stringify(snapshot(scenario())), s2 = JSON.stringify(snapshot(scenario()));
check('determinismo: duas execuções idênticas', s1 === s2);

// 2) gravidade e queda: bola solta de altura 60 cai e para no chão
{
  const w = makeWorld([], { x: 100, y: 100 });
  w.ball.z = 60;
  run(w, 6);
  check('bola cai e assenta no chão', w.ball.z >= SIM.BALL_R - 1e-6 && w.ball.z < SIM.BALL_R + 0.5, `z=${f(w.ball.z)}`);
}

// 3) quique: bola solta de z=60 deve quicar (teve pelo menos um ponto de velocidade vertical positiva depois do impacto)
{
  const w = makeWorld([], { x: 100, y: 100 });
  w.ball.z = 60;
  let bounced = false, maxAfter = 0, hitGround = false;
  for (let i = 0; i < 60 * 3; i++) {
    const before = w.ball.vz;
    step(w);
    if (!hitGround && w.ball.z <= SIM.BALL_R + 1e-9 && before < 0) hitGround = true;
    else if (hitGround && w.ball.vz > 0 && w.ball.z > SIM.BALL_R + 0.5) { bounced = true; maxAfter = Math.max(maxAfter, w.ball.z); }
  }
  check('bola quica depois de bater no chão', hitGround && bounced, `altura do quique ${f(maxAfter)}`);
}

// 4) passe rasteiro vs elevado: altura máxima diferente, rasteiro não sobe
{
  const mk = (apex: number) => {
    const w = makeWorld([{ id: 'a', x: 200, y: 200 }], { x: 205, y: 200 });
    kick(w, 'a', 1, 0, 150, apex);
    let maxZ = 0;
    for (let i = 0; i < 60; i++) { step(w); maxZ = Math.max(maxZ, w.ball.z); }
    return maxZ;
  };
  const low = mk(0), high = mk(40);
  check('passe rasteiro não ganha altura', low < SIM.BALL_R + 1, `maxZ=${f(low)}`);
  check('passe elevado ganha altura de verdade', high > 30, `maxZ=${f(high)}`);
}

// 5) bola acima do disco passa por cima (sem colisão); abaixo bate
{
  const mkDisc = (z: number) => {
    const w = makeWorld([{ id: 'd', x: 300, y: 200 }], { x: 280, y: 200 });
    w.ball.z = z;
    w.ball.vx = 120;
    let hit = false;
    for (let i = 0; i < 60; i++) { step(w); if (w.contacts.includes('d')) hit = true; }
    return { hit, vx: w.ball.vx };
  };
  const low = mkDisc(SIM.BALL_R), high = mkDisc(SIM.DISC_H + 20);
  check('bola rasteira colide com o disco', low.hit);
  check('bola alta passa por cima do disco', !high.hit);
}

// 6) chute só funciona em contato: bola fora do alcance não é tocada
{
  const w = makeWorld([{ id: 'a', x: 200, y: 200 }], { x: 300, y: 200 });
  const ok = kick(w, 'a', 1, 0, 200, 0);
  check('chute sem contato não tem efeito', !ok && w.ball.vx === 0);
}

// 7) disco acelera e responde ao controle; tem inércia (não para na hora)
{
  const w = makeWorld([{ id: 'a', x: 100, y: 100 }], { x: 0, y: 0 });
  steer(w.discs[0], 1, 0, 1);
  step(w);
  const v1 = w.discs[0].vx;
  run(w, 2);
  const v2 = w.discs[0].vx;
  check('disco começa parado e acelera (inércia)', v1 > 0 && v1 < SIM.DISC_VMAX * 0.5, `v após 1 quadro=${f(v1)}`);
  check('disco atinge velocidade máxima', Math.abs(v2 - SIM.DISC_VMAX) < 1, `v=${f(v2)}`);
  steer(w.discs[0], 0, 0, 0);
  run(w, 0.2);
  const v02 = w.discs[0].vx;
  run(w, 0.5);
  const v07 = w.discs[0].vx;
  run(w, 2);
  check('disco desliza sem comando (inércia, não para na hora)', v02 > 80 && v07 > 0 && v07 < v02 && w.discs[0].vx === 0, `0,2s=${f(v02)} 0,7s=${f(v07)} 2,7s=${f(w.discs[0].vx)}`);
}

// 8) orientação segue o movimento
{
  const w = makeWorld([{ id: 'a', x: 100, y: 100 }], { x: 0, y: 0 });
  steer(w.discs[0], 0, 1, 1);
  run(w, 1.5);
  check('orientação gira para o movimento (para cima = π/2)', Math.abs(w.discs[0].h - Math.PI / 2) < 0.15, `h=${f(w.discs[0].h)}`);
}

// 9) colisão disco-disco: separação, sem sobreposição, troca de momento
{
  const w = makeWorld([{ id: 'a', x: 100, y: 200 }, { id: 'b', x: 140, y: 200 }], { x: 0, y: 0 });
  steer(w.discs[0], 1, 0, 1);
  let maxOverlap = 0;
  for (let i = 0; i < 120; i++) {
    step(w);
    const d = Math.hypot(w.discs[1].x - w.discs[0].x, w.discs[1].y - w.discs[0].y);
    maxOverlap = Math.max(maxOverlap, SIM.DISC_R * 2 - d);
  }
  check('discos não se sobrepõem', maxOverlap < 0.5, `sobreposição máx=${f(maxOverlap)}`);
  check('disco parado é empurrado pelo que bate nele', w.discs[1].vx > 20, `vb=${f(w.discs[1].vx)}`);
}

// 10) chute mais forte chega mais longe e mais rápido que o passe
{
  const dist = (speed: number, apex: number) => {
    const w = makeWorld([{ id: 'a', x: 200, y: 200 }], { x: 205, y: 200 });
    kick(w, 'a', 1, 0, speed, apex);
    run(w, 1.5);
    return w.ball.x - 205;
  };
  check('chute (mais rápido) vai mais longe que passe', dist(240, 0) > dist(120, 0), `chute=${f(dist(240, 0))} passe=${f(dist(120, 0))}`);
}

// 11) disco em movimento transfere velocidade pra bola (kick com disco correndo)
{
  const w = makeWorld([{ id: 'a', x: 200, y: 200 }], { x: 205, y: 200 });
  w.discs[0].vx = 100;
  kick(w, 'a', 1, 0, 0.0001, 0);
  check('chute herda parte da velocidade do disco', w.ball.vx > 40, `vx=${f(w.ball.vx)}`);
}

// 12) bola perde velocidade rolando (não fica rolando para sempre)
{
  const w = makeWorld([], { x: 100, y: 100 });
  w.ball.vx = 100; w.ball.z = SIM.BALL_R;
  run(w, 1);
  const a1 = w.ball.vx;
  run(w, 3);
  check('bola rolando perde velocidade e para', a1 < 100 && a1 > 30 && w.ball.vx === 0, `1s=${f(a1)} 4s=${f(w.ball.vx)}`);
}

console.log(results.join('\n'));
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
