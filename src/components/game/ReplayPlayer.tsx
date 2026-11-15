import { useEffect, useRef, useState } from 'react';

// Toca uma jogada gravada pelo campo (posições de jogadores e bola quadro a quadro).
// Usado no replay do gol durante a partida e nos melhores momentos da tela de resultado.

type Side = 'user' | 'bot';
export type ClipTeam = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
export type ClipData = {
  frames: number[][]; // [tempo, bolaX, bolaY, x1, y1, x2, y2, ...]
  sides: Side[];
  letters: string[];
  actor: number;
  label: string;
  id: number;
  minute?: number;
  kind?: 'gol' | 'defesa' | 'quase';
};

const W = 740;
const H = 440;
const FX0 = 20;
const FX1 = 720;
const FY0 = 10;
const FY1 = 430;
const MID_X = 370;
const MID_Y = 220;

function textOn(hex: string) {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.replace(/(.)/g, '$1$1') : v, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#111' : '#fff';
}

// ---------- Câmeras ----------
// Projeção em perspectiva simples: o campo (x,y) fica no chão e a altura z sobe. Cada câmera tem posição, alvo e zoom.
export type Cam = { x: number; y: number; z: number; tx: number; ty: number; tz: number; f: number };
type CamMode = 'auto' | 'tv' | 'ball' | 'goal' | 'tatica';
export type Proj = (x: number, y: number, z: number) => { sx: number; sy: number; s: number; d: number };

const MODES: { key: CamMode; label: string }[] = [
  { key: 'auto', label: 'Automática' },
  { key: 'tv', label: 'TV' },
  { key: 'ball', label: 'Na jogada' },
  { key: 'goal', label: 'Atrás do gol' },
  { key: 'tatica', label: 'Tática' },
];
const CAM_NAME: Record<Exclude<CamMode, 'auto'>, string> = { tv: 'CÂMERA DE TV', ball: 'CÂMERA NA JOGADA', goal: 'ATRÁS DO GOL', tatica: 'VISÃO TÁTICA' };
const SPEEDS = [0.25, 0.5, 1];

export function makeProj(cam: Cam, screenH: number = H): Proj {
  const fx = cam.tx - cam.x;
  const fy = cam.ty - cam.y;
  const fz = cam.tz - cam.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f = [fx / fl, fy / fl, fz / fl];
  // direita = f x cima(0,0,1) ; cima da tela = direita x f
  let r = [f[1], -f[0], 0];
  const rl = Math.hypot(r[0], r[1]) || 1;
  r = [r[0] / rl, r[1] / rl, 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return (x, y, z) => {
    const vx = x - cam.x;
    const vy = y - cam.y;
    const vz = z - cam.z;
    const d = vx * f[0] + vy * f[1] + vz * f[2];
    const k = cam.f / Math.max(d, 8);
    return { sx: W / 2 + (vx * r[0] + vy * r[1] + vz * r[2]) * k, sy: screenH / 2 - (vx * u[0] + vy * u[1] + vz * u[2]) * k, s: k, d };
  };
}
export const orthoProj: Proj = (x, y, z) => ({ sx: x, sy: y - z * 0.6, s: 1, d: 1000 - y });

export function ReplayPlayer({
  data,
  club,
  opponent,
  speed = 0.7,
  holdMs = 900,
  onEnd,
}: {
  data: ClipData;
  club: ClipTeam;
  opponent: ClipTeam;
  speed?: number;
  holdMs?: number;
  onEnd?: () => void;
}) {
  const isGoal = data.kind === 'gol' || (!data.kind && /gol/i.test(data.label));
  // Replay de gol já começa em câmera lenta; defesas e quase-gols usam a velocidade pedida
  const [mode, setMode] = useState<CamMode>('auto');
  const [rate, setRate] = useState<number>(isGoal ? 0.5 : Math.min(1, speed));
  const [run, setRun] = useState(0);
  const [ended, setEnded] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const touched = useRef(false);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const stripes = useRef<(SVGPathElement | null)[]>([]);
  const lineNodes = useRef<(SVGPathElement | null)[]>([]);
  const goalNodes = useRef<(SVGPathElement | null)[]>([]);
  const netNodes = useRef<(SVGPathElement | null)[]>([]);
  const layer = useRef<SVGGElement | null>(null);
  const actors = useRef<(SVGGElement | null)[]>([]); // jogadores 0..n-1, bola = n
  const parts = useRef<{ ring: SVGEllipseElement | null; shadow: SVGEllipseElement | null; token: SVGGElement | null }[]>([]);
  const ballParts = useRef<{ shadow: SVGEllipseElement | null; token: SVGGElement | null }>({ shadow: null, token: null });
  const trail = useRef<SVGPathElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const camLabel = useRef<HTMLSpanElement | null>(null);
  const order = useRef('');

  useEffect(() => {
    const { frames } = data;
    if (!frames.length) return undefined;
    setEnded(false);
    const t0 = frames[0][0];
    const dur = Math.max(1, frames[frames.length - 1][0] - t0);
    const last = frames[frames.length - 1];
    const dir = last[1] >= MID_X ? 1 : -1; // lado do gol atacado
    const goalX = dir > 0 ? FX1 : FX0;
    const GOAL_HALF = 42;
    const GOAL_H = 30;
    let p = 0;
    let prev = performance.now();
    let doneAt = 0;
    let raf = 0;
    let sbx = frames[0][1];
    let sby = frames[0][2];
    let cam: Cam | null = null;
    let lastKind = '';
    const hist: [number, number, number][] = [];
    let bz = 0;
    let pbx = frames[0][1];
    let pby = frames[0][2];

    const target = (kind: Exclude<CamMode, 'auto' | 'tatica'>): Cam => {
      if (kind === 'tv') return { x: sbx * 0.8 + MID_X * 0.2, y: FY1 + 250, z: 165, tx: sbx * 0.85 + MID_X * 0.15, ty: MID_Y + 30, tz: 0, f: 590 };
      if (kind === 'ball') return { x: sbx - dir * 270, y: sby + (MID_Y - sby) * 0.3, z: 125, tx: sbx + dir * 120, ty: sby + (MID_Y - sby) * 0.25, tz: 4, f: 500 };
      return { x: goalX + dir * 200, y: MID_Y + 35, z: 95, tx: goalX - dir * 230, ty: MID_Y - 5, tz: 10, f: 600 };
    };

    const loop = (now: number) => {
      const dtMs = Math.min(64, now - prev);
      prev = now;
      const prog = p / dur;
      // Nos instantes finais do gol o tempo desacelera mais ainda
      const slowTail = isGoal && prog > 0.8 && prog < 1 ? 0.5 : 1;
      if (p < dur) p = Math.min(dur, p + dtMs * rateRef.current * slowTail);
      let i = 0;
      while (i < frames.length - 2 && frames[i + 1][0] - t0 <= p) i += 1;
      const a = frames[i];
      const b = frames[i + 1] ?? a;
      const span = b[0] - a[0] || 1;
      let k = Math.min(1, Math.max(0, (p + t0 - a[0]) / span));
      if (Math.hypot(b[1] - a[1], b[2] - a[2]) > 170) k = 0; // teleporte: não interpola
      const bx = a[1] + (b[1] - a[1]) * k;
      const by = a[2] + (b[2] - a[2]) * k;
      // Altura da bola: sobe nos chutes e passes rápidos e desce quando ela rola devagar
      const speedPx = (Math.hypot(bx - pbx, by - pby) / Math.max(1, dtMs)) * 1000 / Math.max(0.2, rateRef.current * slowTail);
      pbx = bx;
      pby = by;
      bz += (Math.min(36, Math.max(0, speedPx - 90) / 11) - bz) * Math.min(1, dtMs / 140);

      sbx += (bx - sbx) * Math.min(1, dtMs / 380);
      sby += (by - sby) * Math.min(1, dtMs / 380);

      // escolhe a câmera
      let kind: Exclude<CamMode, 'auto'> = modeRef.current === 'auto' ? (prog < 0.42 ? 'tv' : prog < 0.8 ? 'ball' : 'goal') : modeRef.current;
      if (kind !== lastKind) {
        lastKind = kind;
        if (camLabel.current) camLabel.current.textContent = CAM_NAME[kind];
        cam = null; // corte seco, como na TV
      }
      let proj: Proj = orthoProj;
      let ortho = kind === 'tatica';
      if (!ortho) {
        const goal = target(kind as Exclude<CamMode, 'auto' | 'tatica'>);
        if (!cam) cam = goal;
        else {
          const m = Math.min(1, dtMs / (kind === 'goal' ? 600 : 260));
          for (const key of Object.keys(goal) as (keyof Cam)[]) cam[key] += (goal[key] - cam[key]) * m;
        }
        proj = makeProj(cam);
      }
      const tilt = ortho ? 1 : Math.max(0.28, Math.min(0.95, Math.abs(cam!.tz - cam!.z) / Math.hypot(cam!.tx - cam!.x, cam!.ty - cam!.y, cam!.tz - cam!.z)));

      // caminha por segmentos desenhando só o que está na frente da câmera
      const path = (pts: [number, number, number][], close = false) => {
        let d = '';
        let open = false;
        for (const [x, y, z] of pts) {
          const q = proj(x, y, z);
          if (!ortho && q.d < 25) {
            open = false;
            continue;
          }
          d += `${open ? 'L' : 'M'}${q.sx.toFixed(1)} ${q.sy.toFixed(1)}`;
          open = true;
        }
        return close && d ? `${d}Z` : d;
      };
      const quad = (x0: number, x1: number) => path([[x0, FY0, 0], [x1, FY0, 0], [x1, FY1, 0], [x0, FY1, 0]], true);
      for (let n = 0; n < 10; n += 1) stripes.current[n]?.setAttribute('d', quad(FX0 + n * 70, FX0 + n * 70 + 70));
      const circle: [number, number, number][] = Array.from({ length: 41 }, (_, n) => [MID_X + 48 * Math.cos((n / 40) * Math.PI * 2), MID_Y + 48 * Math.sin((n / 40) * Math.PI * 2), 0]);
      const lines: [number, number, number][][] = [
        [[FX0, FY0, 0], [FX1, FY0, 0], [FX1, FY1, 0], [FX0, FY1, 0], [FX0, FY0, 0]],
        [[MID_X, FY0, 0], [MID_X, FY1, 0]],
        circle,
        [[FX0, MID_Y - 90, 0], [FX0 + 92, MID_Y - 90, 0], [FX0 + 92, MID_Y + 90, 0], [FX0, MID_Y + 90, 0]],
        [[FX1, MID_Y - 90, 0], [FX1 - 92, MID_Y - 90, 0], [FX1 - 92, MID_Y + 90, 0], [FX1, MID_Y + 90, 0]],
      ];
      lines.forEach((pts, n) => lineNodes.current[n]?.setAttribute('d', path(pts)));
      // traves e redes (0 = esquerda, 1 = direita)
      [FX0, FX1].forEach((gx, n) => {
        const out = n === 0 ? -1 : 1;
        goalNodes.current[n]?.setAttribute('d', path([[gx, MID_Y - GOAL_HALF, 0], [gx, MID_Y - GOAL_HALF, GOAL_H], [gx, MID_Y + GOAL_HALF, GOAL_H], [gx, MID_Y + GOAL_HALF, 0]]));
        netNodes.current[n]?.setAttribute(
          'd',
          path([[gx, MID_Y - GOAL_HALF, GOAL_H], [gx + out * 26, MID_Y - GOAL_HALF, GOAL_H * 0.7], [gx + out * 26, MID_Y + GOAL_HALF, GOAL_H * 0.7], [gx, MID_Y + GOAL_HALF, GOAL_H], [gx, MID_Y - GOAL_HALF, GOAL_H], [gx + out * 26, MID_Y - GOAL_HALF, 0], [gx + out * 26, MID_Y + GOAL_HALF, 0], [gx, MID_Y + GOAL_HALF, 0]], false),
        );
      });

      // jogadores e bola
      const depths: { key: number; d: number }[] = [];
      for (let n = 0; n < data.sides.length; n += 1) {
        const ax = a[3 + n * 2];
        const ay = a[4 + n * 2];
        const cx = b[3 + n * 2];
        const cy = b[4 + n * 2];
        const j = Math.hypot(cx - ax, cy - ay) > 170 ? 0 : k;
        const x = ax + (cx - ax) * j;
        const y = ay + (cy - ay) * j;
        const g = proj(x, y, 0);
        const body = proj(x, y, 14);
        const part = parts.current[n];
        const visible = ortho || g.d > 30;
        actors.current[n]?.setAttribute('display', visible ? 'inline' : 'none');
        if (!visible) continue;
        const ts = Math.min(g.s, 1.7);
        const rx = 15 * ts;
        part?.shadow?.setAttribute('transform', `translate(${g.sx.toFixed(1)} ${g.sy.toFixed(1)})`);
        part?.shadow?.setAttribute('rx', (rx * 0.95).toFixed(1));
        part?.shadow?.setAttribute('ry', (rx * 0.95 * tilt * 0.55).toFixed(1));
        part?.ring?.setAttribute('transform', `translate(${g.sx.toFixed(1)} ${g.sy.toFixed(1)})`);
        part?.ring?.setAttribute('rx', (24 * ts).toFixed(1));
        part?.ring?.setAttribute('ry', (24 * ts * tilt * 0.6).toFixed(1));
        part?.token?.setAttribute('transform', `translate(${body.sx.toFixed(1)} ${(ortho ? g.sy : body.sy).toFixed(1)}) scale(${ts.toFixed(3)})`);
        depths.push({ key: n, d: g.d });
      }
      const zb = ortho ? 0 : 6 + bz;
      const bg = proj(bx, by, 0);
      const bp = proj(bx, by, zb);
      const bv = ortho || bg.d > 30;
      actors.current[data.sides.length]?.setAttribute('display', bv ? 'inline' : 'none');
      if (bv) {
        ballParts.current.shadow?.setAttribute('transform', `translate(${(bg.sx + (ortho ? 0 : bz * 0.25 * bg.s)).toFixed(1)} ${bg.sy.toFixed(1)})`);
        ballParts.current.shadow?.setAttribute('rx', (8 * bg.s * (1 - bz / 90)).toFixed(1));
        ballParts.current.shadow?.setAttribute('ry', (8 * bg.s * (1 - bz / 90) * tilt * 0.55).toFixed(1));
        ballParts.current.token?.setAttribute('transform', `translate(${bp.sx.toFixed(1)} ${bp.sy.toFixed(1)}) scale(${Math.min(bp.s, 2.4).toFixed(3)})`);
        depths.push({ key: data.sides.length, d: bg.d });
      }
      // trilha da bola
      hist.push([bx, by, zb]);
      if (hist.length > 22) hist.shift();
      trail.current?.setAttribute('d', path(hist));
      trail.current?.setAttribute('stroke-width', Math.max(1.5, 4 * bg.s).toFixed(1));

      // quem está mais longe é desenhado primeiro
      depths.sort((m, n) => n.d - m.d);
      const sig = depths.map((e) => e.key).join(',');
      if (sig !== order.current && layer.current) {
        order.current = sig;
        depths.forEach((e) => {
          const node = actors.current[e.key];
          if (node) layer.current!.appendChild(node);
        });
      }

      if (bar.current) bar.current.style.width = `${((p / dur) * 100).toFixed(1)}%`;
      if (p >= dur) {
        if (!doneAt) {
          doneAt = now;
          setEnded(true);
        } else if (now - doneAt > holdMs && !touched.current) {
          endRef.current?.();
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, holdMs, run, isGoal]);

  const pick = <T,>(set: (value: T) => void, value: T) => {
    touched.current = true; // quem mexe nos controles quer ver com calma: não fecha sozinho
    set(value);
  };

  return (
    <div className="rp">
      <style>{`
        .rp-top { position: relative; }
        .rp-cam { position: absolute; left: 10px; top: 10px; z-index: 2; padding: 5px 10px; border-radius: 4px; background: rgba(8,12,20,.85); border-left: 4px solid #F5B800; color: #fff; font: 900 11px/1 Inter, sans-serif; letter-spacing: 1.2px; pointer-events: none; }
        .rp-end { position: absolute; right: 12px; top: 10px; z-index: 2; padding: 6px 12px; border-radius: 4px; background: #F5B800; color: #111; font: 900 13px/1 Inter, sans-serif; letter-spacing: 1px; pointer-events: none; animation: rpPop .5s cubic-bezier(.2,.9,.2,1) both; }
        @keyframes rpPop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
        .rp-ctl { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 4px 2px; align-items: center; }
        .rp-ctl .sp { flex: 1; }
        .rp-ctl button { padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.07); color: #fff; font-weight: 800; font-size: 12px; cursor: pointer; }
        .rp-ctl button.on { background: #F5B800; border-color: #F5B800; color: #1a1200; }
      `}</style>
      <div className="rp-top">
        <span className="rp-cam" ref={camLabel}>CÂMERA DE TV</span>
        {ended && isGoal && <span className="rp-end">GOOOL!</span>}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
          <defs>
            <linearGradient id="rp-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#04070f" />
              <stop offset="100%" stopColor="#0a1c33" />
            </linearGradient>
            <pattern id="rp-crowd" width="26" height="16" patternUnits="userSpaceOnUse">
              <rect width="26" height="16" fill="#0a1424" />
              <circle cx="4" cy="5" r="2.2" fill="#c8102e" opacity=".7" />
              <circle cx="13" cy="10" r="2.2" fill="#e8e8e8" opacity=".55" />
              <circle cx="21" cy="4" r="2.2" fill="#2d7ff0" opacity=".6" />
              <circle cx="9" cy="14" r="2" fill="#F5B800" opacity=".5" />
              <circle cx="22" cy="13" r="2" fill="#eee" opacity=".45" />
            </pattern>
            <radialGradient id="rp-vig" cx="50%" cy="50%" r="75%">
              <stop offset="55%" stopColor="#000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
            </radialGradient>
            <filter id="rp-soft" x="-30%" y="-80%" width="160%" height="260%">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
          </defs>
          <rect width={W} height={H} fill="url(#rp-sky)" />
          <rect y={H * 0.5} width={W} height={H * 0.5} fill="#0b2d19" />
          <g display={mode === 'tatica' ? 'none' : 'inline'}>
            <rect width={W} height={H * 0.46} fill="url(#rp-crowd)" opacity={0.75} />
            <rect width={W} height={H * 0.46} fill="url(#rp-sky)" opacity={0.55} />
          </g>
          {Array.from({ length: 10 }).map((_, i) => (
            <path key={i} ref={(el: SVGPathElement | null) => { stripes.current[i] = el; }} fill={i % 2 ? '#14562f' : '#0f4425'} stroke={i % 2 ? '#14562f' : '#0f4425'} strokeWidth={0.6} />
          ))}
          <g fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={2.2} strokeLinejoin="round">
            {Array.from({ length: 5 }).map((_, i) => (
              <path key={i} ref={(el: SVGPathElement | null) => { lineNodes.current[i] = el; }} />
            ))}
          </g>
          {[0, 1].map((n) => (
            <path key={`net${n}`} ref={(el: SVGPathElement | null) => { netNodes.current[n] = el; }} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.35)" strokeWidth={0.8} />
          ))}
          {[0, 1].map((n) => (
            <path key={`g${n}`} ref={(el: SVGPathElement | null) => { goalNodes.current[n] = el; }} fill="none" stroke="#f4f4f4" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <path ref={trail} fill="none" stroke="rgba(255,226,122,.7)" strokeLinecap="round" strokeLinejoin="round" />
          <g ref={layer}>
            {data.sides.map((side, n) => {
              const team = side === 'user' ? club : opponent;
              return (
                <g key={n} ref={(el: SVGGElement | null) => { actors.current[n] = el; if (!parts.current[n]) parts.current[n] = { ring: null, shadow: null, token: null }; }}>
                  {n === data.actor && <ellipse ref={(el) => { parts.current[n] = { ...(parts.current[n] ?? { shadow: null, token: null }), ring: el } as never; }} rx={24} ry={12} fill="rgba(245,184,0,.22)" stroke="#F5B800" strokeWidth={2.4} />}
                  <ellipse ref={(el) => { parts.current[n] = { ...(parts.current[n] ?? { ring: null, token: null }), shadow: el } as never; }} rx={15} ry={6} fill="rgba(0,0,0,.4)" filter="url(#rp-soft)" />
                  <g ref={(el) => { parts.current[n] = { ...(parts.current[n] ?? { ring: null, shadow: null }), token: el } as never; }}>
                    <circle r={15} fill={team.primary_color} stroke={team.secondary_color} strokeWidth={3.5} />
                    <circle r={15} fill="url(#rp-vig)" opacity={0.0} />
                    <text textAnchor="middle" dy={5} fontSize={14} fontWeight={800} fill={textOn(team.primary_color)} stroke={textOn(team.primary_color) === '#fff' ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.6)'} strokeWidth={2} style={{ paintOrder: 'stroke' }}>
                      {data.letters[n]}
                    </text>
                  </g>
                </g>
              );
            })}
            <g ref={(el: SVGGElement | null) => { actors.current[data.sides.length] = el; }}>
              <ellipse ref={(el) => { ballParts.current.shadow = el; }} rx={8} ry={3} fill="rgba(0,0,0,.45)" filter="url(#rp-soft)" />
              <g ref={(el) => { ballParts.current.token = el; }}>
                <circle r={7} fill="#fff" stroke="#15181c" strokeWidth={2} />
              </g>
            </g>
          </g>
          <rect width={W} height={H} fill="url(#rp-vig)" style={{ pointerEvents: 'none' }} />
        </svg>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,.15)' }}>
        <div ref={bar} style={{ height: '100%', width: 0, background: '#F5B800' }} />
      </div>
      <div className="rp-ctl">
        {MODES.map((m) => (
          <button key={m.key} type="button" className={mode === m.key ? 'on' : ''} onClick={() => pick(setMode, m.key)}>
            {m.label}
          </button>
        ))}
        <span className="sp" />
        {SPEEDS.map((v) => (
          <button key={v} type="button" className={rate === v ? 'on' : ''} onClick={() => pick(setRate, v)}>
            {v === 1 ? '1×' : `${v}×`}
          </button>
        ))}
        <button type="button" onClick={() => { touched.current = true; order.current = ''; setRun((n) => n + 1); }}>
          ↻ Rever
        </button>
      </div>
    </div>
  );
}
