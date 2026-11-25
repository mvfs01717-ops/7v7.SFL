import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveCam } from '@/components/game/LiveCam';
import { CSS as CT_CSS } from '@/components/game/CornerTaker';
import type { LiveSnap } from '@/components/MatchPitch';
import type { Cam, Proj } from '@/components/game/ReplayPlayer';
import type { Ambience } from '@/lib/game/ambience';
import {
  RPLAYS, cutRadius, landDist, playFor, restartLose, riskLabel, type LiveRestart, type RKind, type RPlay, type RestartChoice, type RestartReq,
} from '@/lib/game/restart';

// Lateral e tiro de meta com a câmera de jogo. Mira livre no campo (arrastar, setas ou clique), força e altura como controles reais,
// e no lateral o cobrador anda ao longo da linha e pode fintar. Os discos se movem durante a escolha e a mira define o disco que gira.
type Team = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
type Props = {
  req: RestartReq;
  live: { club: Team; opponent: Team; home: 'user' | 'bot'; ambience: Ambience; score: { user: number; bot: number } };
  seconds?: number;
  onDone: (c: RestartChoice) => void;
};
const FX0 = 20;
const FX1 = 720;
const FY0 = 10;
const FY1 = 430;
const MID_Y = 220;
const SW = 740;
const SH = 564;
const KICK_WIND = 560; // ms de preparação até o contato com a bola
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const peakOf = (h: number) => 4 + h * 0.45; // altura máxima da trajetória (cresce com a altura escolhida)
const PRESETS: Record<RKind, { id: RPlay; power: number; height: number }[]> = {
  lateral: [
    { id: 'tradicional', power: 55, height: 35 },
    { id: 'rapido', power: 60, height: 8 },
    { id: 'curto', power: 25, height: 10 },
    { id: 'longo', power: 92, height: 78 },
  ],
  tirometa: [
    { id: 'curto', power: 25, height: 10 },
    { id: 'medio', power: 58, height: 45 },
    { id: 'longo', power: 92, height: 80 },
  ],
};
const ABBR = (p: string) => p;

export default function RestartTaker({ req, live, seconds = 20, onDone }: Props) {
  const lateral = req.kind === 'lateral';
  const plays = RPLAYS[req.kind];
  const presets = PRESETS[req.kind];
  const [left, setLeft] = useState(seconds);
  const taker = req.players.find((p) => p.key === req.taker) ?? req.players[0];
  const cands = useMemo(() => req.candidates.map((k) => req.players.find((p) => p.key === k)!).filter(Boolean).sort((a, b) => Math.hypot(a.x - req.ball.x, a.y - req.ball.y) - Math.hypot(b.x - req.ball.x, b.y - req.ball.y)), [req]);
  const done = useRef(false);
  const sg = req.ball.y < MID_Y ? -1 : 1; // lado da linha lateral
  const inward = lateral ? -sg : 1; // sentido do campo a partir da linha
  const gkSide = req.ball.x < (FX0 + FX1) / 2 ? 1 : -1; // o gol do goleiro fica para o lado oposto ao meio do campo
  const goalX = gkSide === 1 ? FX0 : FX1;
  const order = useMemo(() => [...req.players.filter((p) => p.side === 'user'), ...req.players.filter((p) => p.side === 'bot')], [req]);
  const ti = order.findIndex((p) => p.key === req.taker);

  // ---------- controles: força, altura, mira e posição do cobrador ----------
  const start = presets.find((p) => p.id === (lateral ? 'tradicional' : 'medio')) ?? presets[0];
  // força inicial: a que alcança o companheiro mais próximo (a mira começa nele), para o padrão não deixar a bola solta
  const startAim = cands[0] ? { x: cands[0].x, y: cands[0].y } : { x: req.ball.x, y: req.ball.y + inward * 100 };
  const startFrom = { x: req.ball.x, y: lateral ? req.ball.y - sg * 3 : req.ball.y };
  const startPower = clamp(Math.round((Math.hypot(startAim.x - startFrom.x, startAim.y - startFrom.y) - 40) / 2.4), 0, 100);
  const [power, setPower] = useState(startPower);
  const [height, setHeight] = useState(start.height);
  const pw = useRef({ power, height });
  pw.current = { power, height };
  const play = playFor(req.kind, power, height);
  const info = plays.find((p) => p.id === play) ?? plays[0];
  // ponto de cobrança: lateral anda ao longo da linha; tiro de meta é sempre do goleiro
  const sp = useRef({ x: req.ball.x, y: req.ball.y }); // posição atual (inércia)
  const spotT = useRef(req.ball.x); // posição pedida pelo usuário (lateral)
  const [spotX, setSpotX] = useState(req.ball.x);
  const launch = (): { x: number; y: number } => ({ x: sp.current.x, y: lateral ? req.ball.y - sg * 3 : req.ball.y });
  // mira livre: ponto do campo escolhido pelo usuário (inicia no companheiro mais próximo, sem travar nele)
  const aim = useRef<{ x: number; y: number }>(startAim);
  const [recvName, setRecvName] = useState('');

  // destino do lançamento: a direção da mira e o alcance da força (o ponto de chegada pode ficar antes ou depois da mira)
  const landOf = (from: { x: number; y: number }, to: { x: number; y: number }, power: number) => {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    const l = Math.hypot(dx, dy);
    if (l < 1) { dx = lateral ? 0 : gkSide; dy = lateral ? inward : 0; }
    const ux = l < 1 ? dx / Math.hypot(dx, dy) : dx / l;
    const uy = l < 1 ? dy / Math.hypot(dx, dy) : dy / l;
    const D = landDist(power);
    return { x: clamp(from.x + ux * D, FX0 + 6, FX1 - 6), y: clamp(from.y + uy * D, FY0 + 6, FY1 - 6) };
  };

  // medidas ao vivo (as mesmas usadas no risco e no resultado)
  const liveNow = (): (LiveRestart & { land: { x: number; y: number } }) | null => {
    const sn = snapRef.current;
    if (!sn || ti < 0) return null;
    const from = launch();
    const land = landOf(from, aim.current, pw.current.power);
    const vx = land.x - from.x;
    const vy = land.y - from.y;
    const len2 = vx * vx + vy * vy || 1;
    let lane = 99;
    let cut: string | undefined;
    order.forEach((p, n) => {
      if (p.side === taker.side || p.pos === 'GK') return;
      const px = sn.pts[n * 2];
      const py = sn.pts[n * 2 + 1];
      const t = clamp(((px - from.x) * vx + (py - from.y) * vy) / len2, 0, 1);
      const dd = Math.hypot(px - (from.x + vx * t), py - (from.y + vy * t));
      if (dd < lane) { lane = dd; cut = p.key; }
    });
    // só corta quem está perto o bastante da trajetória; a altura define essa distância
    if (lane > cutRadius(pw.current.height)) { lane = 99; cut = undefined; }
    let recvKey: string | undefined;
    let recvD = 999;
    order.forEach((p, n) => {
      if (p.side !== taker.side || n === ti || p.pos === 'GK') return;
      const dd = Math.hypot(sn.pts[n * 2] - land.x, sn.pts[n * 2 + 1] - land.y);
      if (dd < recvD) { recvD = dd; recvKey = p.key; }
    });
    return { d: Math.hypot(land.x - from.x, land.y - from.y), lane, cut, recvKey, recvD, land };
  };

  const snapRef = useRef<LiveSnap | null>(null);
  const kickWind = useRef(KICK_WIND);
  const [kicking, setKicking] = useState(false);
  const kick = useRef<{ t0: number; play: RPlay; land: { x: number; y: number }; dur: number } | null>(null);
  const go = () => {
    if (done.current) return;
    done.current = true;
    const lv = liveNow();
    const from = launch();
    const land = lv?.land ?? landOf(from, aim.current, pw.current.power);
    // a jogada vem dos valores atuais (o atalho de teclado guarda esta função da primeira renderização)
    const cur = playFor(req.kind, pw.current.power, pw.current.height);
    const choice: RestartChoice = {
      target: lv?.recvKey ?? cands[0]?.key ?? '',
      play: cur,
      live: lv ? { d: lv.d, lane: lv.lane, cut: lv.cut, recvKey: lv.recvKey, recvD: lv.recvD, land } : undefined,
    };
    if (lv?.cut) nearestOpp.current = lv.cut; // quem corta a bola é quem pressiona durante o voo
    // batida: o cobrador recua, ganha embalo e toca na bola; a bola voa até o ponto de chegada escolhido
    const dist = Math.hypot(land.x - from.x, land.y - from.y);
    const dur = Math.min(1500, Math.max(450, (cur === 'rapido' ? 0.6 : 1) * (dist / (cur === 'longo' ? 0.42 : 0.3))));
    const wind = cur === 'rapido' ? 160 : KICK_WIND;
    kick.current = { t0: performance.now(), play: cur, land, dur };
    kickWind.current = wind;
    setKicking(true);
    window.setTimeout(() => onDone(choice), wind + dur + 300);
  };
  const nearestOpp = useRef('');
  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  // ---------- mira e comandos ----------
  const moveAim = (dx: number, dy: number) => {
    if (done.current) return;
    aim.current = { x: clamp(aim.current.x + dx, FX0 + 6, FX1 - 6), y: clamp(aim.current.y + dy, FY0 + 6, FY1 - 6) };
  };
  // Q: próximo companheiro (a mira vai para ele, mas a escolha continua livre)
  const cycle = () => {
    if (!cands.length) return;
    const near = cands.findIndex((c) => Math.hypot(c.x - aim.current.x, c.y - aim.current.y) < 30);
    const c = cands[(near + 1 + cands.length) % cands.length];
    aim.current = { x: c.x, y: c.y };
  };
  const setPreset = (p: { power: number; height: number }) => { setPower(p.power); setHeight(p.height); };
  // finta de lateral: o cobrador dribla para o lado oposto ao marcador mais próximo, e o marcador é empurrado para trás por um tempo
  const dodge = useRef<{ key: string; nx: number; ny: number; wx: number; t0: number } | null>(null);
  const feintCd = useRef(0);
  const feint = () => {
    if (!lateral || done.current || kick.current) return;
    const now = performance.now();
    if (now < feintCd.current) return;
    const sn = snapRef.current;
    if (!sn) return;
    const from = launch();
    feintCd.current = now + 1400;
    // o cobrador dribla na linha; o defensor mais perto da trajetória do passe (quem poderia cortar) é empurrado para fora dela
    const aimV = aim.current;
    const vx = aimV.x - from.x;
    const vy = aimV.y - from.y;
    const L = Math.hypot(vx, vy) || 1;
    const ux = vx / L;
    const uy = vy / L;
    let key = '';
    let bd = Infinity;
    let side = 1;
    order.forEach((p, n) => {
      if (p.side === taker.side || p.pos === 'GK') return;
      const px = sn.pts[n * 2] - from.x;
      const py = sn.pts[n * 2 + 1] - from.y;
      const t = clamp((px * ux + py * uy) / L, 0, 1);
      const dd = Math.hypot(px - ux * L * t, py - uy * L * t);
      if (dd < bd) { bd = dd; key = p.key; side = px * -uy + py * ux >= 0 ? 1 : -1; }
    });
    // a finta não muda o ponto de lançamento: só empurra o defensor que poderia cortar (o efeito é medido na confirmação)
    const pnx = side * -uy;
    const pny = side * ux;
    const wx = from.x >= (sn.pts[order.findIndex((p) => p.key === key) * 2] ?? from.x) ? 1 : -1;
    if (key && bd <= 60) dodge.current = { key, nx: pnx, ny: pny, wx, t0: now };
  };

  // Q/setas/arrastar e clique: a mira é o ponto no gramado sob o ponteiro
  const projRef = useRef<Proj | null>(null);
  const unproject = (sx: number, sy: number): { x: number; y: number } | null => {
    const pr = projRef.current;
    if (!pr) return null;
    let x = aim.current.x;
    let y = aim.current.y;
    for (let it = 0; it < 14; it += 1) {
      const q = pr(x, y, 0);
      const ex = q.sx - sx;
      const ey = q.sy - sy;
      if (Math.abs(ex) + Math.abs(ey) < 0.5) break;
      const qx = pr(x + 1, y, 0);
      const qy = pr(x, y + 1, 0);
      const a = qx.sx - q.sx;
      const b = qy.sx - q.sx;
      const c = qx.sy - q.sy;
      const d = qy.sy - q.sy;
      const det = a * d - b * c;
      if (Math.abs(det) < 1e-9) break;
      x -= (d * ex - b * ey) / det;
      y -= (-c * ex + a * ey) / det;
    }
    return { x: clamp(x, FX0 + 6, FX1 - 6), y: clamp(y, FY0 + 6, FY1 - 6) };
  };
  const ovRef = useRef<SVGSVGElement>(null);
  const aimFrom = (e: React.PointerEvent) => {
    const r = ovRef.current?.getBoundingClientRect();
    if (!r || done.current) return;
    const p = unproject(((e.clientX - r.left) / r.width) * SW, ((e.clientY - r.top) / r.height) * SH);
    if (p) aim.current = p;
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (done.current) return;
      const step = 12;
      if (e.key === 'ArrowLeft') { e.preventDefault(); moveAim(-step, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveAim(step, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveAim(0, -step); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveAim(0, step); }
      else if (e.key === 'q' || e.key === 'Q' || e.key === 'Tab') { e.preventDefault(); cycle(); }
      else if (e.key === 'z' || e.key === 'Z') setPower((v) => clamp(v - 6, 0, 100));
      else if (e.key === 'x' || e.key === 'X') setPower((v) => clamp(v + 6, 0, 100));
      else if (e.key === 's' || e.key === 'S') setHeight((v) => clamp(v - 8, 0, 100));
      else if (e.key === 'w' || e.key === 'W') setHeight((v) => clamp(v + 8, 0, 100));
      else if (e.key === 'a' || e.key === 'A') { if (lateral) spotT.current = clamp(spotT.current - 8, FX0 + 40, FX1 - 40); }
      else if (e.key === 'd' || e.key === 'D') { if (lateral) spotT.current = clamp(spotT.current + 8, FX0 + 40, FX1 - 40); }
      else if (e.key === 'f' || e.key === 'F') feint();
      else if (/^[1-5]$/.test(e.key) && presets[Number(e.key) - 1]) setPreset(presets[Number(e.key) - 1]);
      else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); go(); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- câmera ----------
  const camFor = (bx: number): Cam => (lateral
    ? { x: bx - 20, y: req.ball.y - inward * 110, z: 140, tx: bx + 6, ty: req.ball.y + inward * 100, tz: 0, f: 500 }
    : { x: goalX - gkSide * 120, y: MID_Y, z: 120, tx: goalX + gkSide * 100, ty: MID_Y - 50, tz: 0, f: 420 });
  const camRef = useRef<Cam | null>(null);
  camRef.current = camFor(lateral ? sp.current.x : req.ball.x);

  // ---------- disco do cobrador, bola e demais discos ----------
  const baseRef = useRef<number[]>(order.flatMap((p) => [p.x, p.y]));
  if (!snapRef.current) {
    snapRef.current = {
      ball: [req.ball.x, req.ball.y, lateral ? 18 : 8],
      pts: order.flatMap((p) => [p.x, p.y]),
      sides: order.map((p) => p.side),
      letters: order.map(() => ''),
      keys: order.map((p) => p.key),
      holder: ti,
      frozen: false,
      fx: null,
    };
  }

  // Batida e reação: o disco recua, acelera, toca na bola e a bola voa até o ponto de chegada escolhido
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const kk = kick.current;
      if (!kk) return;
      const sn = snapRef.current!;
      const tx0 = sp.current.x;
      const ty0 = lateral ? req.ball.y - sg * 3 : req.ball.y;
      const tpx = kk.land.x;
      const tpy = kk.land.y;
      const e = now - kk.t0;
      const wind = kickWind.current;
      const dx = tpx - tx0;
      const dy = tpy - ty0;
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l;
      const uy = dy / l;
      let back = 0;
      if (e < wind * 0.55) back = 14 * easeIO(e / (wind * 0.55));
      else if (e < wind) { const q = (e - wind * 0.55) / (wind * 0.45); back = 14 - 20 * q * q; }
      else back = -6 + 3 * Math.min(1, (e - wind) / 300);
      sn.pts[ti * 2] = tx0 - ux * back;
      sn.pts[ti * 2 + 1] = ty0 - uy * back;
      const bx0 = tx0 + ux * 10;
      const by0 = ty0 + uy * 10;
      if (e < wind) {
        sn.ball[0] = bx0; sn.ball[1] = by0; sn.ball[2] = lateral ? 18 : 0;
      } else {
        const t = Math.min(1, (e - wind) / kk.dur);
        const te = 1 - Math.pow(1 - t, 1.3);
        sn.ball[0] = bx0 + (tpx - bx0) * te;
        sn.ball[1] = by0 + (tpy - by0) * te;
        sn.ball[2] = (lateral ? 18 : 3) * (1 - te) + (6 + peakOf(pw.current.height)) * Math.sin(Math.PI * te);
        const cm = camRef.current!;
        cm.tx += (sn.ball[0] - cm.tx) * 0.04;
        cm.ty += (sn.ball[1] - cm.ty) * 0.04;
        // o defensor que corta aperta a marcação enquanto a bola viaja
        const oi = order.findIndex((p) => p.key === nearestOpp.current);
        if (oi >= 0) {
          const ox = sn.pts[oi * 2];
          const oy = sn.pts[oi * 2 + 1];
          sn.pts[oi * 2] = ox + (tpx - ox) * 0.03;
          sn.pts[oi * 2 + 1] = oy + (tpy - oy) * 0.03;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escolha: o cobrador anda ao longo da linha, bola à frente na direção da mira, os companheiros se abrem e os defensores marcam
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (kick.current) return;
      const sn = snapRef.current!;
      const base = baseRef.current;
      // cobrador: segue a posição pedida com inércia
      const s = sp.current;
      s.x += (spotT.current - s.x) * 0.18;
      if (lateral) s.y = req.ball.y;
      const from = launch();
      base[ti * 2] = from.x;
      base[ti * 2 + 1] = from.y;
      sn.pts[ti * 2] = from.x;
      sn.pts[ti * 2 + 1] = from.y;
      const ex = aim.current.x - from.x;
      const ey = aim.current.y - from.y;
      const el = Math.hypot(ex, ey) || 1;
      sn.ball[0] = from.x + (ex / el) * 10;
      sn.ball[1] = from.y + (ey / el) * 10;
      sn.ball[2] = lateral ? 18 : 0;
      // finta: o cobrador faz um drible curto para o lado e volta; é só animação (a jogada é medida na posição de origem)
      const fdg = dodge.current;
      if (fdg && now - fdg.t0 < 320) sn.pts[ti * 2] += fdg.wx * Math.sin(Math.PI * ((now - fdg.t0) / 320)) * 12;
      const t = (now - t0) / 1000;
      const ramp = easeIO(Math.min(1, (now - t0) / 1600));
      const dg = dodge.current;
      const dodgeK = dg ? Math.max(0, 1 - (now - dg.t0) / 5000) : 0;
      let markN = -1;
      let markD = Infinity;
      order.forEach((p, n) => {
        if (n === ti || p.side === taker.side || p.pos === 'GK') return;
        const d = Math.hypot(base[n * 2] - from.x, base[n * 2 + 1] - from.y);
        if (d < markD) { markD = d; markN = n; }
      });
      if (!kick.current) nearestOpp.current = markN >= 0 ? order[markN].key : '';
      const awayX = (bx: number, by: number) => {
        let ax = 0;
        let ay = 0;
        order.forEach((q, m) => {
          if (q.side === taker.side || q.pos === 'GK') return;
          const dx = bx - base[m * 2];
          const dy = by - base[m * 2 + 1];
          const d = Math.hypot(dx, dy) || 1;
          const w = Math.max(0, 1 - d / 120);
          ax += (dx / d) * w;
          ay += (dy / d) * w;
        });
        return [ax, ay] as const;
      };
      order.forEach((p, n) => {
        if (n === ti) return;
        const bx = base[n * 2];
        const by = base[n * 2 + 1];
        const wob = p.side === taker.side ? 4 : 2.5;
        let x = bx + wob * Math.sin(t * 0.9 + n * 1.7);
        let y = by + wob * Math.cos(t * 0.7 + n * 2.3);
        if (p.pos === 'GK') {
          sn.pts[n * 2] = clamp(x, FX0 + 10, FX1 - 10);
          sn.pts[n * 2 + 1] = clamp(y, FY0 + 10, FY1 - 10);
          return;
        }
        if (p.side === taker.side) {
          const [ax, ay] = awayX(bx, by);
          const l = Math.hypot(ax, ay) || 1;
          x += (ax / l) * 12 * ramp;
          y += (ay / l) * 12 * ramp;
        } else {
          const dx = from.x - bx;
          const dy = from.y - by;
          const d = Math.hypot(dx, dy) || 1;
          const want = n === markN ? Math.max(0, d - 34) : Math.max(0, d - 70) * 0.35;
          x += (dx / d) * want * ramp;
          y += (dy / d) * want * ramp;
          if (dg && p.key === dg.key) {
            // marcador driblado: empurrado para fora da linha do passe; o efeito passa com o tempo
            x += dg.nx * 26 * dodgeK;
            y += dg.ny * 26 * dodgeK;
          }
        }
        sn.pts[n * 2] = clamp(x, FX0 + 10, FX1 - 10);
        sn.pts[n * 2 + 1] = clamp(y, FY0 + 10, FY1 - 10);
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // medidas ao vivo: risco mostrado na tela e receptor sugerido (4 vezes por segundo)
  const [lr, setLr] = useState<(LiveRestart & { land: { x: number; y: number } }) | null>(null);
  useEffect(() => {
    const tick = () => {
      if (kick.current) return;
      const lv = liveNow();
      setLr(lv);
      setSpotX(sp.current.x);
      setRecvName(lv?.recvKey ? order.find((p) => p.key === lv.recvKey)?.name ?? '' : '');
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [power, height]);

  const onFrame = (proj: Proj, snap: LiveSnap, tilt: number) => {
    projRef.current = proj;
    order.forEach((p, n) => {
      const q = proj(snap.pts[n * 2], snap.pts[n * 2 + 1], 8);
      scr.current[p.key] = { x: q.sx, y: q.sy };
    });
    const from = launch();
    const land = landOf(from, aim.current, pw.current.power);
    const peak = peakOf(pw.current.height);
    let d = '';
    if (!kick.current) {
      for (let n = 0; n <= 24; n += 1) {
        const t = n / 24;
        const q = proj(from.x + (land.x - from.x) * t, from.y + (land.y - from.y) * t, (lateral ? 18 : 3) + (6 + peak) * Math.sin(Math.PI * t) * (n === 24 ? 0 : 1));
        if (q.d < 20) continue;
        d += `${d ? 'L' : 'M'}${q.sx.toFixed(1)} ${q.sy.toFixed(1)}`;
      }
    }
    olLine.current?.setAttribute('d', d);
    // ponto de chegada: anel no gramado; a mira fica no ponto escolhido
    const g = proj(land.x, land.y, 0);
    const rr = Math.min(24, 13 * g.s);
    olRing.current?.setAttribute('cx', g.sx.toFixed(1));
    olRing.current?.setAttribute('cy', g.sy.toFixed(1));
    olRing.current?.setAttribute('rx', rr.toFixed(1));
    olRing.current?.setAttribute('ry', (rr * tilt * 0.55).toFixed(1));
    const am = proj(aim.current.x, aim.current.y, 40);
    olRecv.current?.setAttribute('transform', `translate(${am.sx.toFixed(1)} ${am.sy.toFixed(1)}) scale(${Math.min(1.5, Math.max(0.6, am.s * 0.55)).toFixed(2)})`);
    // disco do cobrador: gira suavemente para a direção da mira (o lançamento)
    const tg = proj(from.x, from.y, 9);
    const tr = proj(aim.current.x, aim.current.y, 9);
    const want = Math.atan2(tr.sy - tg.sy, tr.sx - tg.sx);
    if (orient.current === null) orient.current = want;
    let dA = want - orient.current;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    orient.current += dA * 0.2;
    olOrient.current?.setAttribute('transform', `translate(${tg.sx.toFixed(1)} ${tg.sy.toFixed(1)}) rotate(${((orient.current * 180) / Math.PI).toFixed(1)}) scale(${Math.min(1.6, Math.max(0.6, tg.s * 0.6)).toFixed(2)})`);
    const mark = (el: SVGGElement | null, idx: number) => {
      if (!el) return;
      const q = proj(snap.pts[idx * 2], snap.pts[idx * 2 + 1], 46);
      el.setAttribute('transform', `translate(${q.sx.toFixed(1)} ${q.sy.toFixed(1)}) scale(${Math.min(1.5, Math.max(0.6, q.s * 0.55)).toFixed(2)})`);
    };
    mark(olTaker.current, ti);
  };
  const scr = useRef<Record<string, { x: number; y: number }>>({});
  const olLine = useRef<SVGPathElement>(null);
  const olRing = useRef<SVGEllipseElement>(null);
  const olTaker = useRef<SVGGElement>(null);
  const olOrient = useRef<SVGGElement>(null);
  const orient = useRef<number | null>(null); // ângulo atual (tela), suavizado para girar gradualmente
  const olRecv = useRef<SVGGElement>(null);

  // risco mostrado: com as medidas ao vivo (o mesmo cálculo do resultado)
  const recvOvr = lr?.recvKey ? order.find((p) => p.key === lr.recvKey)?.ovr ?? 75 : 75;
  const pLose = lr
    ? restartLose(req.kind, play, lr, taker.ovr, recvOvr)
    : restartLose(req.kind, play, { d: landDist(power), lane: 99, recvD: 0 }, taker.ovr, recvOvr);
  const risk = riskLabel(pLose);
  const gkOpp = req.players.find((p) => p.side !== taker.side && p.pos === 'GK');
  const tri = (el: React.RefObject<SVGGElement>, color: string) => (
    <g ref={el}>
      <path d="M-7 -8 L7 -8 L0 3 Z" fill={color} stroke="rgba(0,0,0,.55)" strokeWidth="1" />
    </g>
  );
  const hLabel = height < 25 ? 'Rasteiro' : height < 60 ? 'Médio' : 'Alto';
  const finishing = kicking;

  return (
    <div className="ct-wrap rt-wrap" role="dialog" aria-label={lateral ? 'Lateral' : 'Tiro de meta'}>
      <style>{CT_CSS}{RT_CSS}</style>
      <div className={`ct-box${kicking ? ' ct-kicking' : ''}`}>
        <div className="ct-main">
          <div className="ct-stage">
            <LiveCam liveRef={snapRef} mode="corner" camOverride={camRef} onFrame={onFrame} club={live.club} opponent={live.opponent} home={live.home} ambience={live.ambience} burst={null} score={live.score} />
            <svg ref={ovRef} className="ct-ov" viewBox={`0 0 ${SW} ${SH}`} onPointerDown={(e) => { aimFrom(e); }} onPointerMove={(e) => { if (e.buttons) aimFrom(e); }}>
              <path ref={olLine} fill="none" stroke="#38d6f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" style={{ filter: 'drop-shadow(0 0 3px rgba(56,214,240,.7))' }} />
              <ellipse ref={olRing} fill="rgba(56,214,240,.12)" stroke="#38d6f0" strokeWidth="1.6" />
              <g ref={olOrient}>
                <path d="M4 -4 L16 0 L4 4 Z" fill="#facc15" stroke="rgba(0,0,0,.6)" strokeWidth="1" />
              </g>
              {tri(olTaker, '#38bdf8')}
              {tri(olRecv, '#22d3ee')}
            </svg>
          </div>
          <div className="ct-ui">
            <div className="ct-score"><b>{live.club.abbreviation}</b><span>{lateral ? 'LATERAL' : 'TIRO DE META'}</span><em>{Math.max(0, left)} s</em></div>
            <div className="ct-legend ct-pn">
              <div><kbd>Arrastar</kbd><span>Mirar no campo</span></div>
              <div><kbd>Z X</kbd><span>Força</span></div>
              <div><kbd>S W</kbd><span>Altura</span></div>
              {lateral && <div><kbd>A D</kbd><span>Posição na linha</span></div>}
              {lateral && <div><kbd>F</kbd><span>Finta</span></div>}
              <div><kbd>Q</kbd><span>Ir ao companheiro</span></div>
              <div><kbd>1–{presets.length}</kbd><span>Predefinições</span></div>
            </div>
            <div className="ct-tac ct-pn">
              <h4>{lateral ? 'PREDEFINIÇÕES DE LATERAL' : 'PREDEFINIÇÕES DE TIRO DE META'}</h4>
              {presets.map((p, k) => {
                const pl = plays.find((x) => x.id === p.id)!;
                return (
                  <button key={p.id} type="button" className={p.id === play ? 'on' : ''} onClick={() => setPreset(p)} title={pl.text}>
                    <i>{p.id === play ? '▸' : ''}</i>
                    <span>{pl.label}</span>
                    <small>{k + 1}</small>
                  </button>
                );
              })}
            </div>
            <div className="ct-power rt-go">
              <div className="rt-sl">
                <label><span>FORÇA</span><b>{power}%</b></label>
                <input type="range" min={0} max={100} value={power} onChange={(e) => setPower(Number(e.target.value))} disabled={finishing} />
              </div>
              <div className="rt-sl">
                <label><span>ALTURA</span><b>{hLabel}</b></label>
                <input type="range" min={0} max={100} value={height} onChange={(e) => setHeight(Number(e.target.value))} disabled={finishing} />
              </div>
              {lateral && (
                <div className="rt-sl">
                  <label><span>POSIÇÃO NA LINHA</span><b>{Math.round(spotX)}</b></label>
                  <input type="range" min={FX0 + 40} max={FX1 - 40} value={spotX} onChange={(e) => { spotT.current = Number(e.target.value); setSpotX(Number(e.target.value)); }} disabled={finishing} />
                </div>
              )}
              <div className="ct-pt"><span>RISCO DE PERDER A BOLA</span><b style={{ color: risk.c }}>{risk.t}</b></div>
              {lateral && <button type="button" className="rt-feint" onClick={feint} disabled={finishing}>FINTA (F)</button>}
              <button type="button" className="ct-go" onClick={() => go()}>{lateral ? 'COBRAR LATERAL' : 'COBRAR TIRO DE META'}</button>
            </div>
            <div className="ct-bar-l"><i>{ABBR(taker.pos)}</i><b>{taker.name}</b><em>{taker.ovr}</em></div>
            <div className="ct-bar-r"><b>{recvName || gkOpp?.name || ''}</b><em>{lr?.recvKey ? recvOvr : ''}</em></div>
          </div>
        </div>
        <div className="ct-desc"><b>{info.label}:</b> {info.text}</div>
      </div>
    </div>
  );
}

const RT_CSS = `
.rt-wrap .ct-legend { top: 6%; }
.rt-wrap .ct-bar-r { width: 28%; }
.rt-wrap .rt-go { left: auto; right: 10px; bottom: 46px; transform: none; width: min(250px, 34%); }
.rt-wrap .ct-tac { left: 10px; right: auto; top: 27%; bottom: auto; width: 170px; }
.rt-sl { display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px; }
.rt-sl label { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: .04em; opacity: .85; }
.rt-sl label b { font-weight: 800; }
.rt-sl input { width: 100%; accent-color: #38bdf8; }
.rt-feint { margin: 4px 0; padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(56,189,248,.5); background: rgba(56,189,248,.12); color: #e0f2fe; font-weight: 800; font-size: 11px; }
.rt-feint:disabled { opacity: .5; }
@media (max-width: 760px), (max-height: 520px) { .rt-wrap .ct-legend { display: none; } }
`;
