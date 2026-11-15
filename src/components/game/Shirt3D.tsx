import { useEffect, useState } from 'react';
import type { Player } from '@/lib/game/types';

// Camisa girando em 3D (frente com escudo genérico e costas com nome e número do jogador).
// Desenho próprio, nas cores do clube. Troca de jogador a cada volta.

type Team = { abbreviation: string; primary_color: string; secondary_color: string };

const NUMBERS: Record<string, number> = { GK: 1, LB: 3, RB: 2, CM: 8, LF: 11, RF: 7, CF: 9 };

function textOn(hex: string) {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.replace(/(.)/g, '$1$1') : v, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62 ? '#111' : '#fff';
}

const BODY = 'M70 12 Q100 30 130 12 L176 34 L196 84 L162 98 L156 86 L156 214 Q100 224 44 214 L44 86 L38 98 L4 84 L24 34 Z';

function Face({ team, back, name, num }: { team: Team; back: boolean; name: string; num: number }) {
  const a = team.primary_color;
  const b = team.secondary_color;
  const ink = textOn(a);
  return (
    <svg viewBox="0 0 200 230" width="100%" height="100%" aria-hidden="true">
      <defs>
        <clipPath id={`sh-c-${back ? 'b' : 'f'}`}>
          <path d={BODY} />
        </clipPath>
        <linearGradient id={`sh-g-${back ? 'b' : 'f'}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".28" />
          <stop offset=".35" stopColor="#fff" stopOpacity=".1" />
          <stop offset=".7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </linearGradient>
      </defs>
      <path d={BODY} fill={a} />
      <g clipPath={`url(#sh-c-${back ? 'b' : 'f'})`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={20 + i * 40} y={0} width={20} height={230} fill={b} opacity={0.16} />
        ))}
        <rect x={0} y={72} width={60} height={9} fill={b} opacity={0.9} transform="rotate(-28 20 80)" />
        <rect x={140} y={72} width={60} height={9} fill={b} opacity={0.9} transform="rotate(28 180 80)" />
        <rect x={0} y={0} width={200} height={230} fill={`url(#sh-g-${back ? 'b' : 'f'})`} />
      </g>
      <path d={BODY} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth={2} />
      {back ? (
        <>
          <path d="M70 12 Q100 24 130 12" fill="none" stroke={b} strokeWidth={5} strokeLinecap="round" />
          <text x={100} y={74} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight={900} fontSize={name.length > 9 ? 15 : 19} letterSpacing={1.5} fill={ink}>
            {name}
          </text>
          <text x={100} y={150} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight={900} fontSize={84} fill={ink} stroke={b} strokeWidth={2.4} style={{ paintOrder: 'stroke' }}>
            {num}
          </text>
        </>
      ) : (
        <>
          <path d="M70 12 Q100 44 130 12" fill={b} stroke="rgba(0,0,0,.3)" strokeWidth={1.4} />
          <path d="M70 12 Q100 38 130 12" fill={a} />
          <path d="M126 54 h30 v28 q0 14 -15 18 q-15 -4 -15 -18z" fill={b} stroke={ink} strokeWidth={1.6} opacity={0.95} />
          <text x={141} y={82} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight={900} fontSize={11} fill={textOn(b)}>
            {team.abbreviation.slice(0, 3)}
          </text>
        </>
      )}
    </svg>
  );
}

export function Shirt3D({ team, squad }: { team: Team; squad: Player[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (squad.length < 2) return undefined;
    const id = window.setInterval(() => setI((n) => (n + 1) % squad.length), 6000);
    return () => window.clearInterval(id);
  }, [squad.length]);
  const player = squad[i % Math.max(1, squad.length)];
  if (!player) return null;
  const surname = (player.name.trim().split(/\s+/).slice(-1)[0] || player.name).toUpperCase().slice(0, 11);
  const slot = (player as { slot?: string }).slot ?? player.primary_position;
  const num = NUMBERS[slot] ?? NUMBERS[player.primary_position] ?? 10;
  return (
    <div className="sh3-wrap" aria-hidden="true">
      <style>{`
        .sh3-wrap { margin-top: 14px; display: grid; place-items: center; perspective: 700px; height: 150px; }
        .sh3-spin { position: relative; width: 120px; height: 138px; transform-style: preserve-3d; animation: sh3-turn 6s linear infinite; }
        .sh3-shadow { filter: drop-shadow(0 10px 8px rgba(0,0,0,.45)); }
        .sh3-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .sh3-face.back { transform: rotateY(180deg); }
        @keyframes sh3-turn { from { transform: rotateY(0deg) rotateX(-6deg); } to { transform: rotateY(360deg) rotateX(-6deg); } }
        .sh3-cap { margin-top: -8px; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .08em; opacity: .75; }
        @media (prefers-reduced-motion: reduce) { .sh3-spin { animation: none; transform: rotateY(-20deg); } }
      `}</style>
      <div className="sh3-shadow">
      <div className="sh3-spin" key={player.id}>
        <div className="sh3-face"><Face team={team} back={false} name={surname} num={num} /></div>
        <div className="sh3-face back"><Face team={team} back name={surname} num={num} /></div>
      </div>
      </div>
      <div className="sh3-cap">{surname} · Nº {num}</div>
    </div>
  );
}
