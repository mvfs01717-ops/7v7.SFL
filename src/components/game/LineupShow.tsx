import { useEffect, useRef, useState } from 'react';
import { Card, cardCss } from '@/components/game/Card';
import { DraftField, FIELD_SPOTS } from '@/components/game/DraftScreen';
import { average, groupAverage, slotOf } from '@/lib/game/helpers';
import { positionNames, type Player, type Position, type Team } from '@/lib/game/types';
import { TACTIC_INFO, type Tactic } from '@/lib/multiplayer';

// Apresentação da escalação (inspirada nas aberturas de partida do FIFA/FC):
// os jogadores entram no centro do palco por linha (goleiro, laterais, meio, alas, centroavante)
// e depois voam para a posição no campo, enquanto o painel mostra o time, a tática e os reservas.
const STAGES: Position[][] = [['GK'], ['LB', 'RB'], ['CM'], ['LF', 'RF'], ['CF']];
const STAGE_START = 300; // quando o 1º grupo entra
const STAGE_STEP = 950; // intervalo entre um grupo e o próximo
const STAGE_LEN = 1000; // quanto cada grupo fica no palco
const SETTLE_AT = STAGE_START + STAGES.length * STAGE_STEP; // todos voam para o campo
const STATS_AT = SETTLE_AT + 600; // ataque / defesa / overall sobem

const css = `
.ls-root { position: fixed; inset: 0; z-index: 80; overflow-y: auto; background: #04070b; color: #f4f4f0; animation: ls-fade .4s ease-out both; }
@keyframes ls-fade { from { opacity: 0 } to { opacity: 1 } }
.ls-bg { position: fixed; inset: 0; pointer-events: none; overflow: hidden;
  background:
    radial-gradient(ellipse 70% 38% at 50% 100%, rgba(34,120,70,.45), transparent 70%),
    radial-gradient(ellipse 90% 60% at 50% 0%, rgba(40,52,74,.55), transparent 70%),
    linear-gradient(180deg, #05080d, #070d12 60%, #08140e); }
.ls-bg::before { content: ''; position: absolute; left: 0; right: 0; top: 4%; height: 26px; opacity: .85;
  background: radial-gradient(circle, #fff 0 1.6px, transparent 2.4px) 0 0 / 26px 26px;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent); mask-image: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent); }
.ls-beam { position: absolute; top: -10%; width: 36%; height: 120%; filter: blur(14px); opacity: .5; transform-origin: 50% 0;
  background: linear-gradient(180deg, rgba(255,240,200,.55), rgba(255,240,200,0) 75%); clip-path: polygon(46% 0, 54% 0, 100% 100%, 0 100%); }
.ls-beam.a { left: 4%; animation: ls-sweep-a 7s ease-in-out infinite alternate; }
.ls-beam.b { right: 4%; animation: ls-sweep-b 7s ease-in-out infinite alternate; }
@keyframes ls-sweep-a { from { transform: rotate(-12deg) } to { transform: rotate(10deg) } }
@keyframes ls-sweep-b { from { transform: rotate(12deg) } to { transform: rotate(-10deg) } }
.ls-grid { position: relative; z-index: 1; min-height: 100%; display: grid; gap: 14px; align-items: center; justify-content: center; padding: 16px; grid-template-columns: minmax(0, 560px); }
@media (min-width: 820px) { .ls-grid { grid-template-columns: minmax(0, 600px) 280px; gap: 26px; } }
.ls-pitch { position: relative; width: 100%; aspect-ratio: 0.9; border-radius: 16px; overflow: hidden;
  border: 1px solid rgba(255,255,255,.12); background: rgba(8,22,14,.55); box-shadow: 0 24px 60px rgba(0,0,0,.55); }
.ls-pitch > svg { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .55; }
.ls-stage { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.ls-group { grid-area: 1 / 1; width: 100%; display: flex; gap: 4%; justify-content: center; align-items: flex-end; opacity: 0;
  animation: ls-stage ${STAGE_LEN}ms cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d); }
@keyframes ls-stage {
  0% { opacity: 0; transform: translateY(46px) scale(.7); filter: blur(6px) }
  22% { opacity: 1; transform: translateY(0) scale(1.04); filter: blur(0) }
  34% { transform: scale(1) }
  78% { opacity: 1; transform: scale(1.02); filter: blur(0) }
  100% { opacity: 0; transform: translateY(-30px) scale(.9); filter: blur(4px) }
}
.ls-big { position: relative; width: min(46%, 190px); filter: drop-shadow(0 0 22px rgba(245,184,0,.45)); }
.ls-group.row .ls-big { width: min(34%, 160px); }
.ls-tag { position: absolute; left: 50%; top: -22px; transform: translateX(-50%); white-space: nowrap; font-size: 11px; font-weight: 900; letter-spacing: .16em; color: #F5B800; text-shadow: 0 2px 6px #000; }
.ls-spot { position: absolute; width: 19%; left: var(--x); top: var(--y); transform: translate(-50%, -50%); opacity: 0;
  animation: ls-fly .75s cubic-bezier(.2,.85,.25,1) both; animation-delay: calc(${SETTLE_AT}ms + var(--i) * 90ms); filter: drop-shadow(0 6px 8px rgba(0,0,0,.5)); }
@keyframes ls-fly {
  0% { opacity: 0; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(2.1) }
  35% { opacity: 1 }
  100% { opacity: 1; left: var(--x); top: var(--y); transform: translate(-50%, -50%) scale(1) }
}
.ls-spot i { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 4px); font-style: normal; font-size: 9px; font-weight: 800; letter-spacing: .08em; padding: 2px 7px; border-radius: 99px; background: rgba(5,8,12,.8); color: #F5B800; white-space: nowrap; }
.ls-panel { position: relative; border-radius: 14px; padding: 18px 18px 16px; overflow: hidden; box-shadow: 0 24px 50px rgba(0,0,0,.5);
  background: linear-gradient(160deg, var(--c1), var(--c2)); animation: ls-panel .7s cubic-bezier(.2,.8,.2,1) both; animation-delay: .15s; }
.ls-panel::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.45)); pointer-events: none; }
.ls-panel > * { position: relative; z-index: 1; }
@keyframes ls-panel { from { opacity: 0; transform: translateX(40px) } to { opacity: 1; transform: none } }
@media (max-width: 819px) { @keyframes ls-panel { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } } }
.ls-abbr { font-size: 54px; font-weight: 900; line-height: .95; letter-spacing: .01em; }
.ls-rule { height: 3px; width: 54px; background: #fff; margin: 12px 0; opacity: .85; }
.ls-subs { display: grid; gap: 5px; margin-top: 8px; font-size: 13px; }
.ls-subs div { display: grid; grid-template-columns: 34px 1fr auto; gap: 8px; align-items: baseline; }
.ls-subs b { opacity: .7; font-weight: 800; }
.ls-subs em { font-style: normal; font-weight: 900; }
.ls-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; text-align: center; }
.ls-stats span { font-size: 10px; font-weight: 800; letter-spacing: .14em; opacity: .85; }
.ls-stats strong { display: block; font-size: 30px; line-height: 1.1; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  .ls-root, .ls-panel, .ls-beam { animation: none !important; }
  .ls-stage { display: none; }
  .ls-spot { animation: none !important; opacity: 1 !important; }
}
`;

export function LineupShow({
  team,
  squad,
  bench = [],
  tactic,
  eyebrow,
  cta,
  autoMs,
  onDone,
}: {
  team: Team;
  squad: Player[];
  bench?: Player[];
  tactic?: Tactic;
  eyebrow: string;
  cta: string;
  autoMs: number;
  onDone: () => void;
}) {
  const bySlot: Partial<Record<Position, Player>> = {};
  squad.forEach((player) => {
    bySlot[slotOf(player)] = player;
  });
  const atk = groupAverage(bySlot, ['LF', 'RF', 'CF']);
  const def = groupAverage(bySlot, ['GK', 'LB', 'RB', 'CM']);
  const overall = average(squad) || 0;
  const [t, setT] = useState(0);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  useEffect(() => {
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      setT(1e6);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      setT(elapsed);
      if (elapsed < STATS_AT + 2400) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Segue sozinho depois de um tempo, para não travar quem não clicar (e manter os dois lados da partida juntos)
  useEffect(() => {
    const timer = window.setTimeout(finish, autoMs);
    return () => window.clearTimeout(timer);
  }, []);
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const statP = ease((t - STATS_AT) / 1500);
  const ovrP = ease((t - STATS_AT - 600) / 1200);
  const ready = t >= STATS_AT + 1700;
  const colors = { '--c1': team.primary_color || '#7a1018', '--c2': team.secondary_color || '#2a0508' } as React.CSSProperties;
  let order = 0;
  return (
    <div className="ls-root" role="dialog" aria-label={eyebrow}>
      <style>{cardCss}</style>
      <style>{css}</style>
      <div className="ls-bg" aria-hidden="true">
        <span className="ls-beam a" />
        <span className="ls-beam b" />
      </div>
      <div className="ls-grid">
        <div className="ls-pitch">
          <DraftField />
          <div className="ls-stage" aria-hidden="true">
            {STAGES.map((group, index) => {
              const list = group.map((position) => bySlot[position]).filter(Boolean) as Player[];
              return (
                <div
                  key={group.join('')}
                  className={`ls-group ${group.length > 1 ? 'row' : ''}`}
                  style={{ '--d': `${STAGE_START + index * STAGE_STEP}ms` } as React.CSSProperties}
                >
                  {list.map((player) => (
                    <div className="ls-big" key={player.id}>
                      <span className="ls-tag">{positionNames[slotOf(player)].toUpperCase()}</span>
                      <Card player={player} fluid />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {STAGES.flat().map((position) => {
            const player = bySlot[position];
            if (!player) return null;
            const i = order++;
            return (
              <div
                key={player.id}
                className="ls-spot"
                style={{ '--x': `${FIELD_SPOTS[position].x}%`, '--y': `${FIELD_SPOTS[position].y}%`, '--i': i } as React.CSSProperties}
              >
                <Card player={player} fluid />
                <i>{position}</i>
              </div>
            );
          })}
        </div>
        <aside className="ls-panel" style={colors}>
          <div className="eyebrow" style={{ color: '#fff', opacity: 0.85 }}>
            {eyebrow}
          </div>
          <div className="ls-abbr">{team.abbreviation}</div>
          <small style={{ opacity: 0.85, fontWeight: 700, letterSpacing: '.04em' }}>{team.name.toUpperCase()}</small>
          <div className="ls-rule" />
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em' }}>
            2-1-2-1
            {tactic && (
              <span style={{ marginLeft: 10, color: '#fde68a' }}>
                {TACTIC_INFO[tactic].icon} {TACTIC_INFO[tactic].label.toUpperCase()}
              </span>
            )}
          </div>
          {bench.length > 0 && (
            <>
              <div style={{ marginTop: 16, fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>RESERVAS</div>
              <div className="ls-rule" style={{ margin: '6px 0 8px', width: 38 }} />
              <div className="ls-subs">
                {bench.map((player) => (
                  <div key={player.id}>
                    <b>{player.primary_position}</b>
                    <span>{player.name}</span>
                    <em>{player.overall}</em>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="ls-stats" style={{ opacity: statP > 0 ? 1 : 0, transition: 'opacity .3s' }}>
            {[
              { label: 'ATAQUE', value: atk, progress: statP },
              { label: 'DEFESA', value: def, progress: statP },
              { label: 'OVERALL', value: overall, progress: ovrP },
            ].map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{Math.round(row.value * row.progress)}</strong>
              </div>
            ))}
          </div>
          <button
            className="gold-button large lobby-main"
            onClick={finish}
            style={{ opacity: ready ? 1 : 0.6, marginTop: 16, width: '100%' }}
          >
            {cta}
          </button>
        </aside>
      </div>
    </div>
  );
}
