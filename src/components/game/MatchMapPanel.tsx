import { useMemo, useState } from 'react';
import { MAP_COLS, MAP_ROWS, type MapSlot, type MatchMapData } from '@/lib/game/matchMap';
import type { Team } from '@/lib/game/types';

// Mapa da partida: mapa de calor (onde cada jogador mais esteve) e rede de passes (quem passou para quem).
// Os dois times são mostrados atacando para a direita.

const W = 740;
const H = 440;
const X0 = 20;
const X1 = 720;
const Y0 = 10;
const Y1 = 430;

type Tab = 'heat' | 'passes';
type Side = 'user' | 'bot';

function PitchLines() {
  return (
    <g>
      {Array.from({ length: 10 }).map((_, i) => (
        <rect key={i} x={X0 + i * 70} y={Y0} width={70} height={Y1 - Y0} fill={i % 2 ? '#14562f' : '#0f4425'} />
      ))}
      <g fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={2.5}>
        <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} />
        <line x1={370} y1={Y0} x2={370} y2={Y1} />
        <circle cx={370} cy={220} r={48} />
        <rect x={X0} y={130} width={92} height={180} />
        <rect x={X1 - 92} y={130} width={92} height={180} />
      </g>
    </g>
  );
}

const heatColor = (t: number) => {
  // azul -> verde -> amarelo -> vermelho
  const stops = [
    [0, [30, 90, 255]],
    [0.35, [40, 220, 170]],
    [0.65, [255, 220, 40]],
    [1, [255, 60, 40]],
  ] as const;
  for (let i = 1; i < stops.length; i += 1) {
    if (t <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const k = (t - a) / (b - a);
      return `rgb(${ca.map((v, n) => Math.round(v + (cb[n] - v) * k)).join(',')})`;
    }
  }
  return 'rgb(255,60,40)';
};

export function MatchMapPanel({ club, opponent, data }: { club: Team; opponent: Team; data: MatchMapData | null }) {
  const [tab, setTab] = useState<Tab>('heat');
  const [side, setSide] = useState<Side>('user');
  const [pick, setPick] = useState<string>('all');

  const team = side === 'user' ? club : opponent;
  const slots = useMemo(
    () => Object.values(data?.slots ?? {}).filter((slot) => slot.side === side && slot.n > 0),
    [data, side],
  );

  const grid = useMemo(() => {
    const sum = new Array<number>(MAP_ROWS * MAP_COLS).fill(0);
    const chosen = pick === 'all' ? slots : slots.filter((slot) => slot.key === pick);
    chosen.forEach((slot) => slot.grid.forEach((v, i) => { sum[i] += v; }));
    const max = Math.max(1, ...sum);
    return { sum, max };
  }, [slots, pick]);

  const nodes = useMemo(() => {
    const touch: Record<string, number> = {};
    Object.entries(data?.passes ?? {}).forEach(([id, count]) => {
      const [from, to] = id.split('>');
      if (!from.startsWith(side)) return;
      touch[from] = (touch[from] ?? 0) + count;
      touch[to] = (touch[to] ?? 0) + count;
    });
    return slots.map((slot: MapSlot) => ({
      slot,
      x: X0 + (slot.sx / slot.n) * (X1 - X0),
      y: Y0 + (slot.sy / slot.n) * (Y1 - Y0),
      touches: touch[slot.key] ?? 0,
    }));
  }, [data, slots, side]);

  const links = useMemo(() => {
    const pair: Record<string, { a: string; b: string; count: number }> = {};
    Object.entries(data?.passes ?? {}).forEach(([id, count]) => {
      const [from, to] = id.split('>');
      if (!from.startsWith(side)) return;
      const key = [from, to].sort().join('~');
      pair[key] = pair[key] ? { ...pair[key], count: pair[key].count + count } : { a: from, b: to, count };
    });
    return Object.values(pair).sort((x, y) => y.count - x.count);
  }, [data, side]);

  const totalPasses = links.reduce((sum, item) => sum + item.count, 0);
  const best = links[0];
  const busiest = [...nodes].sort((x, y) => y.touches - x.touches)[0];
  const nameOf = (key: string) => data?.slots[key]?.name ?? key;
  const maxLink = Math.max(1, best?.count ?? 1);

  if (!data || data.samples < 25) return null;

  return (
    <section className="result-panel mm" style={{ margin: '0 auto 18px', maxWidth: 1100 }}>
      <style>{mapCss}</style>
      <div className="section-title">
        <div>
          <span className="eyebrow">ANÁLISE DA PARTIDA</span>
          <h2>MAPA DA PARTIDA</h2>
        </div>
      </div>
      <div className="mm-bar">
        <div className="mm-seg">
          <button className={tab === 'heat' ? 'on' : ''} onClick={() => setTab('heat')}>Mapa de calor</button>
          <button className={tab === 'passes' ? 'on' : ''} onClick={() => setTab('passes')}>Rede de passes</button>
        </div>
        <div className="mm-seg">
          {([['user', club], ['bot', opponent]] as [Side, Team][]).map(([key, item]) => (
            <button
              key={key}
              className={side === key ? 'on' : ''}
              onClick={() => { setSide(key); setPick('all'); }}
              style={side === key ? { boxShadow: `inset 0 -3px 0 ${item.primary_color}` } : undefined}
            >
              {item.abbreviation}
            </button>
          ))}
        </div>
      </div>

      <div className="mm-stage">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tab === 'heat' ? 'Mapa de calor' : 'Rede de passes'}>
          <defs>
            <filter id="mm-blur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="13" />
            </filter>
          </defs>
          <rect width={W} height={H} fill="#0b2d19" />
          <PitchLines />
          {tab === 'heat' && (
            <g filter="url(#mm-blur)" style={{ mixBlendMode: 'screen' }}>
              {grid.sum.map((v, i) => {
                if (v <= 0) return null;
                const t = Math.pow(v / grid.max, 0.6);
                const col = i % MAP_COLS;
                const row = Math.floor(i / MAP_COLS);
                return (
                  <rect
                    key={i}
                    x={X0 + (col * (X1 - X0)) / MAP_COLS - 1}
                    y={Y0 + (row * (Y1 - Y0)) / MAP_ROWS - 1}
                    width={(X1 - X0) / MAP_COLS + 2}
                    height={(Y1 - Y0) / MAP_ROWS + 2}
                    fill={heatColor(t)}
                    opacity={0.25 + t * 0.7}
                  />
                );
              })}
            </g>
          )}
          {tab === 'passes' && (
            <g>
              {links.slice(0, 14).map((link) => {
                const a = nodes.find((n) => n.slot.key === link.a);
                const b = nodes.find((n) => n.slot.key === link.b);
                if (!a || !b) return null;
                const w = 1.5 + (link.count / maxLink) * 9;
                return (
                  <g key={`${link.a}-${link.b}`}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={team.primary_color === '#15191F' ? '#fff' : '#ffe27a'} strokeWidth={w} strokeLinecap="round" opacity={0.25 + (link.count / maxLink) * 0.6} />
                    {link.count >= 3 && (
                      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff" stroke="rgba(0,0,0,.7)" strokeWidth={3} paintOrder="stroke">
                        {link.count}
                      </text>
                    )}
                  </g>
                );
              })}
              {nodes.map((node) => {
                const maxT = Math.max(1, ...nodes.map((n) => n.touches));
                const r = 15 + (node.touches / maxT) * 11;
                return (
                  <g key={node.slot.key} transform={`translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})`}>
                    <circle r={r} fill={team.primary_color} stroke={team.secondary_color} strokeWidth={3.5} />
                    <text textAnchor="middle" dy={5} fontSize={13} fontWeight={800} fill="#fff" stroke="rgba(0,0,0,.55)" strokeWidth={2.5} paintOrder="stroke">
                      {node.slot.pos}
                    </text>
                    <text textAnchor="middle" y={r + 15} fontSize={12} fontWeight={700} fill="#fff" stroke="rgba(0,0,0,.8)" strokeWidth={3} paintOrder="stroke">
                      {node.slot.name.split(' ')[0].slice(0, 12)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        <span className="mm-dir">ATAQUE ➜</span>
      </div>

      {tab === 'heat' && (
        <div className="mm-chips">
          <button className={pick === 'all' ? 'on' : ''} onClick={() => setPick('all')}>Time todo</button>
          {[...slots]
            .sort((a, b) => ['GK', 'LB', 'RB', 'CM', 'LF', 'RF', 'CF'].indexOf(a.pos) - ['GK', 'LB', 'RB', 'CM', 'LF', 'RF', 'CF'].indexOf(b.pos))
            .map((slot) => (
              <button key={slot.key} className={pick === slot.key ? 'on' : ''} onClick={() => setPick(slot.key)}>
                {slot.pos} · {slot.name.split(' ')[0]}
              </button>
            ))}
        </div>
      )}
      {tab === 'passes' && (
        <div className="mm-facts">
          <div><b>{totalPasses}</b><span>passes trocados</span></div>
          {best && (
            <div>
              <b>{nameOf(best.a).split(' ')[0]} ↔ {nameOf(best.b).split(' ')[0]}</b>
              <span>dupla que mais trocou passes ({best.count})</span>
            </div>
          )}
          {busiest && busiest.touches > 0 && (
            <div>
              <b>{busiest.slot.name.split(' ')[0]}</b>
              <span>mais participou do jogo ({busiest.touches} passes)</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const mapCss = `
.mm-bar { display: flex; gap: 10px; justify-content: space-between; flex-wrap: wrap; margin-bottom: 12px; }
.mm-seg { display: inline-flex; padding: 3px; border-radius: 12px; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.1); }
.mm-seg button { border: 0; background: transparent; color: #cfd6de; font-weight: 800; font-size: 13px; padding: 8px 14px; border-radius: 9px; cursor: pointer; }
.mm-seg button.on { background: linear-gradient(180deg, #ffe27a, #F5B800); color: #1a1200; }
.mm-stage { position: relative; max-width: 780px; margin: 0 auto; border-radius: 14px; overflow: hidden; border: 1px solid rgba(245,184,0,.3); box-shadow: 0 16px 44px rgba(0,0,0,.5); }
.mm-stage svg { display: block; width: 100%; height: auto; }
.mm-dir { position: absolute; right: 10px; bottom: 8px; font-size: 10px; font-weight: 900; letter-spacing: .16em; color: rgba(255,255,255,.75); text-shadow: 0 1px 4px #000; }
.mm-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 12px; }
.mm-chips button { border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #fff; border-radius: 99px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }
.mm-chips button.on { background: #F5B800; color: #1a1200; border-color: #F5B800; }
.mm-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-top: 12px; }
.mm-facts div { padding: 12px 14px; border-radius: 12px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1); }
.mm-facts b { display: block; font-size: 20px; color: #F5B800; line-height: 1.1; }
.mm-facts span { font-size: 12px; opacity: .75; }
`;
