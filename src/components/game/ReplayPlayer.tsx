import { useEffect, useRef } from 'react';

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
  const players = useRef<(SVGGElement | null)[]>([]);
  const ball = useRef<SVGGElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  useEffect(() => {
    const { frames } = data;
    if (!frames.length) return undefined;
    const t0 = frames[0][0];
    const dur = Math.max(1, frames[frames.length - 1][0] - t0);
    const start = performance.now();
    let doneAt = 0;
    let raf = 0;
    const loop = (now: number) => {
      const p = Math.min(dur, (now - start) * speed);
      let i = 0;
      while (i < frames.length - 2 && frames[i + 1][0] - t0 <= p) i += 1;
      const a = frames[i];
      const b = frames[i + 1] ?? a;
      const span = b[0] - a[0] || 1;
      let k = Math.min(1, Math.max(0, (p + t0 - a[0]) / span));
      // teleporte (bola reposta, saída de bola): não interpola
      if (Math.hypot(b[1] - a[1], b[2] - a[2]) > 170) k = 0;
      ball.current?.setAttribute('transform', `translate(${(a[1] + (b[1] - a[1]) * k).toFixed(1)} ${(a[2] + (b[2] - a[2]) * k).toFixed(1)})`);
      for (let n = 0; n < data.sides.length; n += 1) {
        const ax = a[3 + n * 2];
        const ay = a[4 + n * 2];
        const bx = b[3 + n * 2];
        const by = b[4 + n * 2];
        const j = Math.hypot(bx - ax, by - ay) > 170 ? 0 : k;
        players.current[n]?.setAttribute('transform', `translate(${(ax + (bx - ax) * j).toFixed(1)} ${(ay + (by - ay) * j).toFixed(1)})`);
      }
      if (bar.current) bar.current.style.width = `${((p / dur) * 100).toFixed(1)}%`;
      if (p >= dur) {
        if (!doneAt) doneAt = now;
        else if (now - doneAt > holdMs) {
          endRef.current?.();
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, speed, holdMs]);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <rect width={W} height={H} fill="#0b2d19" />
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={i} x={FX0 + i * 70} y={FY0} width={70} height={FY1 - FY0} fill={i % 2 ? '#14562f' : '#0f4425'} />
        ))}
        <g fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={3}>
          <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} />
          <line x1={MID_X} y1={FY0} x2={MID_X} y2={FY1} />
          <circle cx={MID_X} cy={MID_Y} r={48} />
          <rect x={FX0} y={MID_Y - 90} width={92} height={180} />
          <rect x={FX1 - 92} y={MID_Y - 90} width={92} height={180} />
        </g>
        {data.sides.map((side, n) => {
          const team = side === 'user' ? club : opponent;
          return (
            <g key={n} ref={(el: SVGGElement | null) => { players.current[n] = el; }}>
              {n === data.actor && <circle r={24} fill="rgba(245,184,0,.25)" stroke="#F5B800" strokeWidth={3.5} />}
              <circle r={15} fill={team.primary_color} stroke={team.secondary_color} strokeWidth={3.5} />
              <text textAnchor="middle" dy={5} fontSize={14} fontWeight={700} fill={textOn(team.primary_color)}>
                {data.letters[n]}
              </text>
            </g>
          );
        })}
        <g ref={ball}>
          <circle r={8} fill="#fff" stroke="#15181c" strokeWidth={2} />
        </g>
      </svg>
      <div style={{ height: 4, background: 'rgba(255,255,255,.15)' }}>
        <div ref={bar} style={{ height: '100%', width: 0, background: '#F5B800' }} />
      </div>
    </div>
  );
}
