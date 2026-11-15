import { useEffect, useRef } from 'react';
import type { LiveSnap } from '@/components/MatchPitch';
import { makeProj, type Cam, type Proj } from '@/components/game/ReplayPlayer';
import type { Ambience } from '@/lib/game/ambience';
import { mixHex, stadiumFor } from '@/lib/game/stadium';
import { fxCss, Mascot } from '@/components/game/StadiumFx';
import { useLite } from '@/lib/settings';
import { celebAt, useCosmetics } from '@/lib/cosmetics';
import { playPost } from '@/lib/sfx';

// Câmeras 3D ao vivo: lê as posições do campo (a mesma partida que roda na visão tática) e desenha em perspectiva.
// TV acompanha a bola pelo lado, "Jogada" vai atrás de quem ataca, "Atrás do gol" fica atrás da trave atacada
// e "Automática" faz o papel do diretor de TV, trocando de câmera conforme o lance.

type Side = 'user' | 'bot';
type Team = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
export type LiveMode = 'tatica' | 'auto' | 'tv' | 'ball' | 'goal';
type Real = Exclude<LiveMode, 'auto' | 'tatica'>;

export const LIVE_MODES: { key: LiveMode; label: string }[] = [
  { key: 'tatica', label: 'Tática' },
  { key: 'tv', label: 'TV' },
  { key: 'ball', label: 'Jogada' },
  { key: 'goal', label: 'Gol' },
  { key: 'auto', label: 'Auto' },
];
const NAMES: Record<Real, string> = { tv: 'CÂMERA DE TV', ball: 'CÂMERA NA JOGADA', goal: 'ATRÁS DO GOL' };

const W = 740;
const H = 564; // mesma proporção do campo 2D com as arquibancadas (440 + 2 x 62)
const FX0 = 20;
const FX1 = 720;
const FY0 = 10;
const FY1 = 430;
const MID_X = 370;
const MID_Y = 220;
const GOAL_HALF = 42;
const GOAL_H = 30;

function textOn(hex: string) {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.replace(/(.)/g, '$1$1') : v, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62 ? '#111' : '#fff';
}

export function LiveCam({ liveRef, mode, club, opponent, home, ambience, burst, score, grassFade = 0 }: { grassFade?: number; liveRef: { current: LiveSnap | null }; mode: Exclude<LiveMode, 'tatica'>; club: Team; opponent: Team; home: Side; ambience: Ambience; burst: { side: Side; key: number } | null; score: { user: number; bot: number } }) {
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const lite = useLite();
  const cos = useCosmetics();
  const celebG = useRef<SVGGElement | null>(null);
  const celebTokG = useRef<SVGGElement | null>(null);
  const celebShadowG = useRef<SVGEllipseElement | null>(null);
  const celebArmsG = useRef<SVGPathElement | null>(null);
  const celebCircle = useRef<SVGCircleElement | null>(null);
  const celebText = useRef<SVGTextElement | null>(null);
  const cosRef = useRef(cos);
  cosRef.current = cos;
  const burstRef = useRef(burst);
  burstRef.current = burst;
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const liteRef = useRef(lite);
  liteRef.current = lite;
  const flagNodes = useRef<(SVGPathElement | null)[]>([]);
  const poleNodes = useRef<(SVGPathElement | null)[]>([]);
  const telFrame = useRef<SVGPathElement | null>(null);
  const telText = useRef<SVGTextElement | null>(null);
  const telSub = useRef<SVGTextElement | null>(null);
  const telReplay = useRef<SVGPathElement | null>(null);
  const mascotNodes = useRef<(SVGGElement | null)[]>([]);
  const sparkNodes = useRef<(SVGCircleElement | null)[]>([]);
  const smokeNodes = useRef<(SVGCircleElement | null)[]>([]);
  const homeTeam = home === 'user' ? club : opponent;
  const arena = stadiumFor(homeTeam);
  const rain = ambience.weather === 'rain';
  const night = ambience.time === 'night';

  const stripes = useRef<(SVGPathElement | null)[]>([]);
  const lineNodes = useRef<(SVGPathElement | null)[]>([]);
  const goalNodes = useRef<(SVGPathElement | null)[]>([]);
  const netNodes = useRef<(SVGPathElement | null)[]>([]);
  const layer = useRef<SVGGElement | null>(null);
  const actors = useRef<(SVGGElement | null)[]>([]);
  const shadows = useRef<(SVGEllipseElement | null)[]>([]);
  const tokens = useRef<(SVGGElement | null)[]>([]);
  const rings = useRef<(SVGEllipseElement | null)[]>([]);
  const trail = useRef<SVGPathElement | null>(null);
  const camLabel = useRef<HTMLSpanElement | null>(null);
  const order = useRef('');
  const count = liveRef.current?.sides.length ?? 14;

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    let cam: Cam | null = null;
    let lastKind: Real | '' = '';
    let lastCut = 0;
    let dir = 1;
    let sbx = MID_X;
    let sby = MID_Y;
    let bz = 0;
    const hist: [number, number, number][] = [];
    const buf: { t: number; x: number; y: number; h: number; side: Side; letter: string; hx: number; hy: number }[] = [];
    let celeb: { at: number; kind: string; sx: number; sy: number; d: number } | null = null;
    let bufAt = 0;
    let seenKey = burstRef.current?.key ?? 0;
    let goalAt = -1e9;
    let postAt = -1e9;
    let postX = FX1;
    const onPost = (e: Event) => {
      const d = (e as CustomEvent<{ x: number }>).detail;
      if (!d) return;
      postAt = performance.now();
      postX = d.x;
      playPost();
    };
    window.addEventListener('pitch-post', onPost);
    let goalHome = false;
    let goalSide: Side = 'user';
    let replayPts: [number, number][] = [];
    let telMode = '';
    type Spark = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; col: string };
    const sparks: Spark[] = [];
    const puffs: { x: number; y: number; z: number; life: number; col: string }[] = [];
    const rnd = (n: number) => Math.sin(n * 91.7 + goalAt * 0.013) * 0.5 + 0.5;

    const target = (kind: Real): Cam => {
      const goalX = dir > 0 ? FX1 : FX0;
      if (kind === 'tv') return { x: sbx * 0.8 + MID_X * 0.2, y: FY1 + 250, z: 165, tx: sbx * 0.85 + MID_X * 0.15, ty: MID_Y + 30, tz: 0, f: 590 };
      if (kind === 'ball') return { x: sbx - dir * 270, y: sby + (MID_Y - sby) * 0.3, z: 125, tx: sbx + dir * 120, ty: sby + (MID_Y - sby) * 0.25, tz: 4, f: 500 };
      return { x: goalX + dir * 200, y: MID_Y + 35, z: 95, tx: goalX - dir * 230, ty: MID_Y - 5, tz: 10, f: 600 };
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const snap = liveRef.current;
      const dtMs = Math.min(64, now - prev);
      prev = now;
      if (!snap) return;
      const bx = snap.ball[0];
      const by = snap.ball[1];
      sbx += (bx - sbx) * Math.min(1, dtMs / 380);
      sby += (by - sby) * Math.min(1, dtMs / 380);
      bz += (snap.ball[2] - bz) * Math.min(1, dtMs / 90);
      // quem ataca: o time com a bola (o usuário ataca para a direita, o adversário para a esquerda)
      if (snap.holder >= 0) dir = snap.sides[snap.holder] === 'user' ? 1 : -1;
      const goalX = dir > 0 ? FX1 : FX0;
      const toGoal = Math.abs(goalX - bx);

      // diretor de TV: bola longe do gol = TV; ataque = na jogada; perto da área = atrás do gol (com tempo mínimo entre cortes)
      let kind: Real;
      if (modeRef.current === 'auto') {
        const want: Real = toGoal < 175 ? 'goal' : toGoal < 380 ? 'ball' : 'tv';
        kind = lastKind && lastKind !== want && now - lastCut < 2200 ? lastKind : want;
      } else kind = modeRef.current as Real;
      if (kind !== lastKind) {
        lastKind = kind;
        lastCut = now;
        if (camLabel.current) camLabel.current.textContent = NAMES[kind];
        cam = null; // corte seco
      }
      const goalCam = target(kind);
      if (!cam) cam = goalCam;
      else {
        const m = Math.min(1, dtMs / (kind === 'goal' ? 600 : 260));
        for (const key of Object.keys(goalCam) as (keyof Cam)[]) cam[key] += (goalCam[key] - cam[key]) * m;
      }
      // soco de câmera no gol: zoom e tremor que morrem rápido
      const gAge = now - goalAt;
      const pAge = now - postAt;
      const pAmp = pAge < 700 && !liteRef.current ? Math.exp(-pAge / 220) * 0.4 : 0;
      const amp = Math.max(gAge < 1500 && !liteRef.current ? Math.exp(-gAge / 420) : 0, pAmp);
      const cc: Cam = amp > 0.01 ? { ...cam, x: cam.x + Math.sin(gAge * 0.09) * 4 * amp, z: cam.z + Math.cos(gAge * 0.11) * 3 * amp, f: cam.f * (1 + 0.14 * amp) } : cam;
      const proj: Proj = makeProj(cc, H);
      const tilt = Math.max(0.28, Math.min(0.95, Math.abs(cc.tz - cc.z) / Math.hypot(cc.tx - cc.x, cc.ty - cc.y, cc.tz - cc.z)));

      const path = (pts: [number, number, number][], close = false) => {
        let d = '';
        let open = false;
        for (const [x, y, z] of pts) {
          const q = proj(x, y, z);
          if (q.d < 25) {
            open = false;
            continue;
          }
          d += `${open ? 'L' : 'M'}${q.sx.toFixed(1)} ${q.sy.toFixed(1)}`;
          open = true;
        }
        return close && d ? `${d}Z` : d;
      };
      for (let n = 0; n < 10; n += 1) {
        const x0 = FX0 + n * 70;
        stripes.current[n]?.setAttribute('d', path([[x0, FY0, 0], [x0 + 70, FY0, 0], [x0 + 70, FY1, 0], [x0, FY1, 0]], true));
      }
      const circle: [number, number, number][] = Array.from({ length: 41 }, (_, n) => [MID_X + 48 * Math.cos((n / 40) * Math.PI * 2), MID_Y + 48 * Math.sin((n / 40) * Math.PI * 2), 0]);
      const lines: [number, number, number][][] = [
        [[FX0, FY0, 0], [FX1, FY0, 0], [FX1, FY1, 0], [FX0, FY1, 0], [FX0, FY0, 0]],
        [[MID_X, FY0, 0], [MID_X, FY1, 0]],
        circle,
        [[FX0, MID_Y - 90, 0], [FX0 + 92, MID_Y - 90, 0], [FX0 + 92, MID_Y + 90, 0], [FX0, MID_Y + 90, 0]],
        [[FX1, MID_Y - 90, 0], [FX1 - 92, MID_Y - 90, 0], [FX1 - 92, MID_Y + 90, 0], [FX1, MID_Y + 90, 0]],
      ];
      lines.forEach((pts, n) => lineNodes.current[n]?.setAttribute('d', path(pts)));
      [FX0, FX1].forEach((gx, n) => {
        const out = n === 0 ? -1 : 1;
        const wob = Math.abs(gx - postX) < 5 && pAge < 900 && !liteRef.current ? Math.sin(pAge * 0.09) * 3.2 * Math.exp(-pAge / 280) : 0;
        goalNodes.current[n]?.setAttribute('d', path([[gx, MID_Y - GOAL_HALF + wob, 0], [gx, MID_Y - GOAL_HALF + wob, GOAL_H], [gx, MID_Y + GOAL_HALF + wob, GOAL_H], [gx, MID_Y + GOAL_HALF + wob, 0]]));
        netNodes.current[n]?.setAttribute(
          'd',
          path([[gx, MID_Y - GOAL_HALF, GOAL_H], [gx + out * 26, MID_Y - GOAL_HALF, GOAL_H * 0.7], [gx + out * 26, MID_Y + GOAL_HALF, GOAL_H * 0.7], [gx, MID_Y + GOAL_HALF, GOAL_H], [gx, MID_Y - GOAL_HALF, GOAL_H], [gx + out * 26, MID_Y - GOAL_HALF, 0], [gx + out * 26, MID_Y + GOAL_HALF, 0], [gx, MID_Y + GOAL_HALF, 0]]),
        );
      });

      // ---- estádio: gol novo, trajetória da bola, fogos ----
      const bk = burstRef.current;
      if (bk && bk.key !== seenKey) {
        seenKey = bk.key;
        goalAt = now;
        goalSide = bk.side;
        goalHome = bk.side === home;
        const scorer = [...buf].reverse().find((p) => p.h >= 0 && p.side === bk.side && now - p.t < 3000);
        if (scorer) {
          celeb = { at: now, kind: bk.side === 'user' ? cosRef.current.celeb.id : 'corrida', sx: Math.min(700, Math.max(40, scorer.hx)), sy: Math.min(410, Math.max(30, scorer.hy)), d: bk.side === 'user' ? 1 : -1 };
          const team = bk.side === 'user' ? club : opponent;
          celebCircle.current?.setAttribute('fill', team.primary_color);
          celebCircle.current?.setAttribute('stroke', team.secondary_color);
          if (celebText.current) {
            celebText.current.textContent = scorer.letter;
            celebText.current.setAttribute('fill', textOn(team.primary_color));
          }
        }
        replayPts = buf.filter((p) => now - p.t < 3600).map((p) => [p.x, p.y]);
        sparks.length = 0;
        puffs.length = 0;
        if (goalHome) {
          const cols = [homeTeam.primary_color, homeTeam.secondary_color, '#ffffff', '#ffd54a'];
          const shells = liteRef.current ? 2 : 4;
          for (let sh = 0; sh < shells; sh += 1) {
            const cx = 120 + rnd(sh + 1) * 500;
            for (let i = 0; i < 16; i += 1) {
              const a = (i / 16) * Math.PI * 2;
              const sp = 38 + rnd(i + sh * 7) * 24;
              sparks.push({ x: cx, y: FY0 - 36, z: 80, vx: Math.cos(a) * sp, vy: 0, vz: Math.sin(a) * sp, life: -sh * 0.3, col: cols[(i + sh) % cols.length] });
            }
          }
          for (let i = 0; i < 6; i += 1) puffs.push({ x: 90 + i * 110, y: FY0 - 28, z: 12, life: -i * 0.12, col: i % 2 ? homeTeam.secondary_color : homeTeam.primary_color });
        }
      }
      if (now - bufAt > 60) {
        bufAt = now;
        const hi = snap.holder;
        buf.push({ t: now, x: bx, y: by, h: hi, side: hi >= 0 ? snap.sides[hi] : 'user', letter: hi >= 0 ? snap.letters[hi] : '', hx: hi >= 0 ? snap.pts[hi * 2] : bx, hy: hi >= 0 ? snap.pts[hi * 2 + 1] : by });
        while (buf.length && now - buf[0].t > 4200) buf.shift();
      }
      const dts = dtMs / 1000;
      for (let n = 0; n < sparkNodes.current.length; n += 1) {
        const node = sparkNodes.current[n];
        const sp = sparks[n];
        if (!node) continue;
        if (!sp || sp.life > 1.5) {
          node.setAttribute('display', 'none');
          continue;
        }
        sp.life += dts;
        if (sp.life < 0) {
          node.setAttribute('display', 'none');
          continue;
        }
        sp.x += sp.vx * dts;
        sp.z += sp.vz * dts;
        sp.vz -= 55 * dts;
        sp.vx *= 0.985;
        const q = proj(sp.x, sp.y, sp.z);
        if (q.d < 25) {
          node.setAttribute('display', 'none');
          continue;
        }
        node.setAttribute('display', 'inline');
        node.setAttribute('cx', q.sx.toFixed(1));
        node.setAttribute('cy', q.sy.toFixed(1));
        node.setAttribute('r', Math.max(0.8, 3.6 * q.s * (1 - sp.life / 1.7)).toFixed(1));
        node.setAttribute('fill', sp.col);
        node.setAttribute('opacity', Math.max(0, 1 - sp.life / 1.5).toFixed(2));
      }
      for (let n = 0; n < smokeNodes.current.length; n += 1) {
        const node = smokeNodes.current[n];
        const pf = puffs[n];
        if (!node) continue;
        if (!pf || pf.life > 2.6) {
          node.setAttribute('display', 'none');
          continue;
        }
        pf.life += dts;
        if (pf.life < 0) continue;
        const q = proj(pf.x, pf.y, pf.z + pf.life * 22);
        if (q.d < 25) {
          node.setAttribute('display', 'none');
          continue;
        }
        node.setAttribute('display', 'inline');
        node.setAttribute('cx', q.sx.toFixed(1));
        node.setAttribute('cy', q.sy.toFixed(1));
        node.setAttribute('r', (14 * q.s * (0.6 + pf.life * 0.9)).toFixed(1));
        node.setAttribute('fill', pf.col);
        node.setAttribute('opacity', (Math.max(0, 0.5 - pf.life / 5.2)).toFixed(2));
      }

      // ---- comemoração do autor do gol ----
      {
        const g = celebG.current;
        const ct = celeb ? (now - celeb.at) / 1000 : 99;
        if (g) {
          if (!celeb || ct > 3.2) g.setAttribute('display', 'none');
          else {
            const m = celebAt(celeb.kind, ct, celeb.sx, celeb.sy, celeb.d);
            const gp = proj(m.x, m.y, 0);
            const bp2 = proj(m.x, m.y, 14 + m.lift);
            if (gp.d < 30) g.setAttribute('display', 'none');
            else {
              const ts = Math.min(gp.s, 1.7);
              g.setAttribute('display', 'inline');
              celebShadowG.current?.setAttribute('transform', `translate(${gp.sx.toFixed(1)} ${gp.sy.toFixed(1)})`);
              celebShadowG.current?.setAttribute('rx', (15 * ts).toFixed(1));
              celebShadowG.current?.setAttribute('ry', (15 * ts * tilt * 0.55).toFixed(1));
              celebTokG.current?.setAttribute('transform', `translate(${bp2.sx.toFixed(1)} ${bp2.sy.toFixed(1)}) rotate(${m.rot.toFixed(1)}) scale(${(ts * m.sx).toFixed(3)} ${(ts * m.sy).toFixed(3)})`);
              celebArmsG.current?.setAttribute('display', m.arms ? 'inline' : 'none');
            }
          }
        }
      }

      // ---- bandeirões ----
      for (let n = 0; n < 6; n += 1) {
        const fx = FX0 + 60 + n * 118;
        const fy = FY0 - 24;
        const w = Math.sin(now / 320 + n * 1.3) * 7;
        poleNodes.current[n]?.setAttribute('d', path([[fx, fy, 0], [fx, fy, 56]]));
        flagNodes.current[n]?.setAttribute('d', path([[fx, fy, 56], [fx + 34, fy + w, 54], [fx + 34, fy + w * 0.8, 34], [fx, fy, 36]], true));
      }

      // ---- mascotes ----
      [FX0 + 34, FX1 - 34].forEach((mx, n) => {
        const g = proj(mx, FY0 - 6, 0);
        const node = mascotNodes.current[n];
        if (!node) return;
        if (g.d < 30) {
          node.setAttribute('display', 'none');
          return;
        }
        const jump = goalHome && gAge < 3200 ? Math.abs(Math.sin(gAge / 150)) * 16 : Math.sin(now / 520 + n) * 1.2;
        const sc = Math.min(g.s, 1.9) * 0.95;
        node.setAttribute('display', 'inline');
        node.setAttribute('transform', `translate(${g.sx.toFixed(1)} ${(g.sy - jump * sc).toFixed(1)}) scale(${sc.toFixed(3)} ${sc.toFixed(3)})`);
      });

      // ---- telão ----
      {
        const x0 = MID_X - 90;
        const x1 = MID_X + 90;
        const ty = FY0 - 36;
        const tl = proj(x0, ty, 96);
        const tr = proj(x1, ty, 96);
        const bl = proj(x0, ty, 46);
        const br = proj(x1, ty, 46);
        const ok = tl.d > 30 && tr.d > 30 && bl.d > 30 && br.d > 30;
        telFrame.current?.setAttribute('display', ok ? 'inline' : 'none');
        telText.current?.setAttribute('display', ok ? 'inline' : 'none');
        telSub.current?.setAttribute('display', ok ? 'inline' : 'none');
        telReplay.current?.setAttribute('display', ok ? 'inline' : 'none');
        if (ok) {
          telFrame.current?.setAttribute('d', `M${tl.sx.toFixed(1)} ${tl.sy.toFixed(1)}L${tr.sx.toFixed(1)} ${tr.sy.toFixed(1)}L${br.sx.toFixed(1)} ${br.sy.toFixed(1)}L${bl.sx.toFixed(1)} ${bl.sy.toFixed(1)}Z`);
          const cx = (tl.sx + tr.sx + bl.sx + br.sx) / 4;
          const cy = (tl.sy + tr.sy + bl.sy + br.sy) / 4;
          const wpx = Math.abs(tr.sx - tl.sx);
          const mode = gAge < 3200 ? 'goal' : gAge < 7000 && replayPts.length > 4 ? 'replay' : 'score';
          const sc = scoreRef.current;
          const txt = mode === 'goal' ? 'GOOOL!' : mode === 'replay' ? '' : `${club.abbreviation} ${sc.user} - ${sc.bot} ${opponent.abbreviation}`;
          if (telMode !== mode + txt) {
            telMode = mode + txt;
            if (telText.current) telText.current.textContent = txt;
            if (telSub.current) telSub.current.textContent = mode === 'replay' ? '● REPLAY' : '';
            telFrame.current?.setAttribute('fill', mode === 'goal' ? (goalSide === 'user' ? club : opponent).primary_color : '#05080f');
          }
          telText.current?.setAttribute('x', cx.toFixed(1));
          telText.current?.setAttribute('y', (cy + wpx * 0.045).toFixed(1));
          telText.current?.setAttribute('font-size', Math.max(5, wpx * (mode === 'goal' ? 0.2 : 0.1)).toFixed(1));
          telSub.current?.setAttribute('x', (tl.sx + wpx * 0.04).toFixed(1));
          telSub.current?.setAttribute('y', (tl.sy + wpx * 0.075).toFixed(1));
          telSub.current?.setAttribute('font-size', Math.max(4, wpx * 0.055).toFixed(1));
          if (mode === 'replay') {
            const upto = Math.max(2, Math.floor(((gAge - 3200) / 3800) * replayPts.length));
            let d = '';
            replayPts.slice(0, upto).forEach(([px, py], i) => {
              const u = (px - FX0) / 700;
              const v = (py - FY0) / 420;
              const sx = (tl.sx * (1 - u) + tr.sx * u) * (1 - v) + (bl.sx * (1 - u) + br.sx * u) * v;
              const sy = (tl.sy * (1 - u) + tr.sy * u) * (1 - v) + (bl.sy * (1 - u) + br.sy * u) * v;
              d += `${i ? 'L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
            });
            telReplay.current?.setAttribute('d', d);
            telReplay.current?.setAttribute('stroke-width', Math.max(1, wpx * 0.012).toFixed(1));
          } else telReplay.current?.setAttribute('d', '');
        }
      }

      const depths: { key: number; d: number }[] = [];
      const total = snap.sides.length;
      for (let n = 0; n < total; n += 1) {
        const x = snap.pts[n * 2];
        const y = snap.pts[n * 2 + 1];
        const g = proj(x, y, 0);
        const body = proj(x, y, 14);
        const visible = g.d > 30;
        actors.current[n]?.setAttribute('display', visible ? 'inline' : 'none');
        if (!visible) continue;
        const ts = Math.min(g.s, 1.7);
        const rx = 15 * ts;
        shadows.current[n]?.setAttribute('transform', `translate(${g.sx.toFixed(1)} ${g.sy.toFixed(1)})`);
        shadows.current[n]?.setAttribute('rx', (rx * 0.95).toFixed(1));
        shadows.current[n]?.setAttribute('ry', (rx * 0.95 * tilt * 0.55).toFixed(1));
        const ring = rings.current[n];
        if (ring) {
          const has = n === snap.holder;
          ring.setAttribute('display', has ? 'inline' : 'none');
          if (has) {
            ring.setAttribute('transform', `translate(${g.sx.toFixed(1)} ${g.sy.toFixed(1)})`);
            ring.setAttribute('rx', (24 * ts).toFixed(1));
            ring.setAttribute('ry', (24 * ts * tilt * 0.6).toFixed(1));
          }
        }
        tokens.current[n]?.setAttribute('transform', `translate(${body.sx.toFixed(1)} ${body.sy.toFixed(1)}) scale(${ts.toFixed(3)})`);
        depths.push({ key: n, d: g.d });
      }
      const zb = 6 + bz;
      const bg = proj(bx, by, 0);
      const bp = proj(bx, by, zb);
      const ballKey = total;
      const bv = bg.d > 30;
      actors.current[ballKey]?.setAttribute('display', bv ? 'inline' : 'none');
      if (bv) {
        shadows.current[ballKey]?.setAttribute('transform', `translate(${(bg.sx + bz * 0.25 * bg.s).toFixed(1)} ${bg.sy.toFixed(1)})`);
        shadows.current[ballKey]?.setAttribute('rx', (8 * bg.s * Math.max(0.4, 1 - bz / 90)).toFixed(1));
        shadows.current[ballKey]?.setAttribute('ry', (8 * bg.s * Math.max(0.4, 1 - bz / 90) * tilt * 0.55).toFixed(1));
        tokens.current[ballKey]?.setAttribute('transform', `translate(${bp.sx.toFixed(1)} ${bp.sy.toFixed(1)}) scale(${Math.min(bp.s, 2.4).toFixed(3)})`);
        depths.push({ key: ballKey, d: bg.d });
      }
      hist.push([bx, by, zb]);
      if (hist.length > 18) hist.shift();
      trail.current?.setAttribute('d', path(hist));
      trail.current?.setAttribute('stroke-width', Math.max(1.5, 4 * bg.s).toFixed(1));

      depths.sort((m, n) => n.d - m.d);
      const sig = depths.map((e) => e.key).join(',');
      if (sig !== order.current && layer.current) {
        order.current = sig;
        depths.forEach((e) => {
          const node = actors.current[e.key];
          if (node) layer.current!.appendChild(node);
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pitch-post', onPost);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapNow = liveRef.current;
  const sides = snapNow?.sides ?? [];
  const letters = snapNow?.letters ?? [];
  const tint = ambience.time === 'night' ? { c: '#0a1a5a', o: 0.1 } : ambience.time === 'afternoon' ? { c: '#ff9a3c', o: 0.15 } : { c: '#fff6d0', o: 0.06 };

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 4 }}>
      <style>{fxCss}</style>
      <style>{`
        .lc-cam { position: absolute; left: 10px; bottom: 44px; z-index: 2; padding: 5px 10px; border-radius: 4px; background: rgba(8,12,20,.85); border-left: 4px solid #F5B800; color: #fff; font: 900 11px/1 Inter, sans-serif; letter-spacing: 1.2px; pointer-events: none; }
      `}</style>
      <span className="lc-cam" ref={camLabel}>CÂMERA DE TV</span>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <defs>
          <linearGradient id="lc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#04070f" />
            <stop offset="100%" stopColor="#0a1c33" />
          </linearGradient>
          <pattern id="lc-crowd" width="26" height="16" patternUnits="userSpaceOnUse">
            <rect width="26" height="16" fill="#0a1424" />
            <circle cx="4" cy="5" r="2.2" fill={homeTeam.primary_color} opacity=".75" />
            <circle cx="13" cy="10" r="2.2" fill={homeTeam.secondary_color} opacity=".6" />
            <circle cx="21" cy="4" r="2.2" fill="#e8e8e8" opacity=".5" />
            <circle cx="9" cy="14" r="2" fill={homeTeam.primary_color} opacity=".5" />
            <circle cx="22" cy="13" r="2" fill="#F5B800" opacity=".4" />
          </pattern>
          <radialGradient id="lc-vig" cx="50%" cy="50%" r="75%">
            <stop offset="55%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
          </radialGradient>
          <linearGradient id="lc-wet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity={0} />
            <stop offset="45%" stopColor="#cfe7ff" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <filter id="lc-soft" x="-30%" y="-80%" width="160%" height="260%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#lc-sky)" />
        <rect y={H * 0.5} width={W} height={H * 0.5} fill="#0b2d19" />
        <rect width={W} height={H * 0.46} fill="url(#lc-crowd)" opacity={0.8} />
        <rect width={W} height={H * 0.46} fill="url(#lc-sky)" opacity={0.5} />
        {Array.from({ length: 10 }).map((_, i) => (
          <path key={i} ref={(el: SVGPathElement | null) => { stripes.current[i] = el; }} fill={mixHex(i % 2 ? arena.grassB : arena.grassA, mixHex(arena.grassA, arena.grassB), Math.min(0.7, grassFade))} stroke={mixHex(i % 2 ? arena.grassB : arena.grassA, mixHex(arena.grassA, arena.grassB), Math.min(0.7, grassFade))} strokeWidth={0.6} />
        ))}
        <g fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={2.2} strokeLinejoin="round">
          {Array.from({ length: 5 }).map((_, i) => (
            <path key={i} ref={(el: SVGPathElement | null) => { lineNodes.current[i] = el; }} />
          ))}
        </g>
        {[0, 1].map((n) => (
          <path key={`n${n}`} ref={(el: SVGPathElement | null) => { netNodes.current[n] = el; }} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.35)" strokeWidth={0.8} />
        ))}
        {[0, 1].map((n) => (
          <path key={`g${n}`} ref={(el: SVGPathElement | null) => { goalNodes.current[n] = el; }} fill="none" stroke="#f4f4f4" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <g ref={(el: SVGGElement | null) => { mascotNodes.current[0] = el; }}><Mascot team={homeTeam} /></g>
        <g ref={(el: SVGGElement | null) => { mascotNodes.current[1] = el; }}><Mascot team={homeTeam} flip /></g>
        {Array.from({ length: 6 }).map((_, i) => (
          <g key={`fl${i}`}>
            <path ref={(el: SVGPathElement | null) => { poleNodes.current[i] = el; }} fill="none" stroke="#d1d5db" strokeWidth={1.6} />
            <path ref={(el: SVGPathElement | null) => { flagNodes.current[i] = el; }} fill={i % 3 === 1 ? homeTeam.secondary_color : homeTeam.primary_color} stroke="rgba(255,255,255,.7)" strokeWidth={0.8} />
          </g>
        ))}
        <path ref={telFrame} fill="#05080f" stroke="#3a4558" strokeWidth={2.2} />
        <path ref={telReplay} fill="none" stroke="#ffe27a" strokeLinecap="round" strokeLinejoin="round" />
        <text ref={telText} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight={900} fill="#fff" />
        <text ref={telSub} fontFamily="Inter, sans-serif" fontWeight={900} fill="#ff5a4f" />
        <g ref={celebG} display="none">
          <ellipse ref={celebShadowG} rx={15} ry={6} fill="rgba(0,0,0,.4)" filter="url(#lc-soft)" />
          <g ref={celebTokG}>
            <path ref={celebArmsG} d="M-13 -2 L-22 -14 M13 -2 L22 -14" stroke="#f1d3b0" strokeWidth={3.4} strokeLinecap="round" fill="none" display="none" />
            <circle ref={celebCircle} r={15} fill={club.primary_color} stroke={club.secondary_color} strokeWidth={3.5} />
            <text ref={celebText} textAnchor="middle" dy={5} fontSize={14} fontWeight={800} fill="#fff" />
          </g>
        </g>
        <path ref={trail} fill="none" stroke="rgba(255,226,122,.7)" strokeLinecap="round" strokeLinejoin="round" />
        <g ref={layer}>
          {Array.from({ length: Math.max(count, sides.length) }).map((_, n) => {
            const team = (sides[n] ?? (n < 7 ? 'user' : 'bot')) === 'user' ? club : opponent;
            return (
              <g key={n} ref={(el: SVGGElement | null) => { actors.current[n] = el; }}>
                <ellipse ref={(el) => { rings.current[n] = el; }} rx={24} ry={12} fill="rgba(245,184,0,.22)" stroke="#F5B800" strokeWidth={2.4} display="none" />
                <ellipse ref={(el) => { shadows.current[n] = el; }} rx={15} ry={6} fill="rgba(0,0,0,.4)" filter="url(#lc-soft)" />
                <g ref={(el) => { tokens.current[n] = el; }}>
                  <circle r={15} fill={team.primary_color} stroke={team.secondary_color} strokeWidth={3.5} />
                  <text textAnchor="middle" dy={5} fontSize={14} fontWeight={800} fill={textOn(team.primary_color)} stroke={textOn(team.primary_color) === '#fff' ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.6)'} strokeWidth={2} style={{ paintOrder: 'stroke' }}>
                    {letters[n] ?? ''}
                  </text>
                </g>
              </g>
            );
          })}
          <g ref={(el: SVGGElement | null) => { actors.current[Math.max(count, sides.length)] = el; }}>
            <ellipse ref={(el) => { shadows.current[Math.max(count, sides.length)] = el; }} rx={8} ry={3} fill="rgba(0,0,0,.45)" filter="url(#lc-soft)" />
            <g ref={(el) => { tokens.current[Math.max(count, sides.length)] = el; }}>
              <circle r={7} fill={cos.ball.base} stroke={cos.ball.ink} strokeWidth={2} />
            </g>
          </g>
        </g>
        {night && !lite && (
          <g style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
            {[{ y: H * 0.5, o: 0.12 }, { y: H * 0.64, o: 0.09 }, { y: H * 0.8, o: 0.1 }].map((f, i) => (
              <ellipse key={i} className="fx-fog" cx={W / 2} cy={f.y} rx={470} ry={38} fill="#cfdcf0" opacity={f.o} style={{ filter: 'blur(16px)', animationDelay: `${-i * 4}s`, animationDuration: `${14 + i * 3}s` }} />
            ))}
          </g>
        )}
        {rain && !lite && (
          <g style={{ pointerEvents: 'none' }}>
            <rect y={H * 0.46} width={W} height={H * 0.54} fill="url(#lc-wet)" />
            {[90, 230, 370, 510, 650].map((x, i) => (
              <ellipse key={x} className="fx-shine" cx={x} cy={H * 0.58 + (i % 2) * 40} rx={8} ry={46} fill="#e3f1ff" opacity={0.16} style={{ filter: 'blur(5px)', animationDelay: `${-i * 0.7}s` }} />
            ))}
          </g>
        )}
        {Array.from({ length: 64 }).map((_, i) => (
          <circle key={`sp${i}`} ref={(el: SVGCircleElement | null) => { sparkNodes.current[i] = el; }} display="none" r={2} />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <circle key={`sm${i}`} ref={(el: SVGCircleElement | null) => { smokeNodes.current[i] = el; }} display="none" r={10} style={{ filter: 'blur(5px)' }} />
        ))}
        <rect width={W} height={H} fill={tint.c} opacity={tint.o} style={{ pointerEvents: 'none' }} />
        {rain && <rect width={W} height={H} fill="#0b1d2a" opacity={0.2} style={{ pointerEvents: 'none' }} />}
        {rain && (
          <g style={{ pointerEvents: 'none' }} stroke="#d6e8f5" strokeWidth={1} strokeLinecap="round">
            {Array.from({ length: 40 }).map((_, i) => {
              const x = ((i * 97) % 760) - 10;
              return <line key={i} className="pc-drop" x1={x} y1={0} x2={x - 3} y2={13} opacity={0.3} style={{ ['--rd' as string]: `${(0.55 + ((i * 7) % 10) / 25).toFixed(2)}s`, ['--rl' as string]: `${(-(i % 9) / 9).toFixed(2)}s` }} />;
            })}
          </g>
        )}
        {night && <rect className={`fx-lights ${lite ? 'lite' : ''}`} width={W} height={H} fill="#02050c" style={{ pointerEvents: 'none' }} />}
        <rect width={W} height={H} fill="url(#lc-vig)" style={{ pointerEvents: 'none' }} />
      </svg>
    </div>
  );
}
