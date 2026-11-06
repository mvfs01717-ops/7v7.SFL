import { useEffect, useRef, useState } from 'react';
import { LINEUP_REVEAL_MS, average, colorForOverall, groupAverage, slotOf } from '@/lib/game/helpers';
import { positions, type Player, type Position, type Team } from '@/lib/game/types';
import { TACTIC_INFO, type Tactic } from '@/lib/multiplayer';

// Animação de fim de draft: o overall do ataque e da defesa sobe até o valor final
export function TeamReveal({ club, squad, onDone }: { club: Team; squad: Partial<Record<Position, Player>>; onDone: () => void }) {
  const atk = groupAverage(squad, ['LF', 'RF', 'CF']);
  const def = groupAverage(squad, ['GK', 'LB', 'RB', 'CM']);
  const overall = average(Object.values(squad).filter(Boolean) as Player[]) || 0;
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
      setT(1);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const value = Math.min(1, (now - start) / 2600);
      setT(value);
      if (value < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Segue sozinho depois de alguns segundos, para não travar quem não clicar
  useEffect(() => {
    const timer = window.setTimeout(finish, 7000);
    return () => window.clearTimeout(timer);
  }, []);
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const atkP = ease(t / 0.55);
  const defP = ease((t - 0.3) / 0.55);
  const ovrP = ease((t - 0.6) / 0.4);
  const rows = [
    { label: 'ATAQUE', hint: 'LF · RF · CF', value: atk, progress: atkP, color: '#ef4444' },
    { label: 'DEFESA', hint: 'GK · LB · RB · CM', value: def, progress: defP, color: '#3b82f6' },
  ];
  return (
    <div
      role="dialog"
      aria-label="Overall do time"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(5,8,12,.92)',
        animation: 'tr-fade .35s ease-out',
      }}
    >
      <style>{`
        @keyframes tr-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tr-pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .tr-pop { animation: none !important } }
      `}</style>
      <div style={{ width: 'min(460px, 100%)', textAlign: 'center' }}>
        <div className="eyebrow">SEU TIME ESTÁ PRONTO</div>
        <h2 style={{ margin: '6px 0 22px' }}>
          {club.name.toUpperCase()}
        </h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {rows.map((row) => (
            <div key={row.label} style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, letterSpacing: 2, fontSize: 13 }}>
                  {row.label} <small style={{ opacity: 0.5, fontWeight: 600, letterSpacing: 1 }}>{row.hint}</small>
                </span>
                <strong style={{ fontSize: 44, lineHeight: 1, color: row.color, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(row.value * row.progress)}
                </strong>
              </div>
              <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,.1)', overflow: 'hidden', marginTop: 6 }}>
                <div
                  style={{
                    width: `${Math.min(100, row.value * row.progress)}%`,
                    height: '100%',
                    borderRadius: 6,
                    background: row.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div
          className="tr-pop"
          style={{
            marginTop: 26,
            opacity: ovrP,
            animation: ovrP > 0 ? 'tr-pop .5s ease-out' : undefined,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: '#F5B800' }}>OVERALL DO TIME</span>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(overall * ovrP)}
          </div>
        </div>
        <button className="gold-button large lobby-main" onClick={finish} style={{ opacity: t >= 1 ? 1 : 0.6 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}

// Animação antes da partida: o rival entra em campo, jogador por jogador, na formação (goleiro primeiro), e depois aparece o overall do time
export const REVEAL_SPOTS: Record<Position, [number, number]> = {
  GK: [50, 15],
  LB: [24, 34],
  RB: [76, 34],
  CM: [50, 52],
  LF: [22, 70],
  RF: [78, 70],
  CF: [50, 84],
};

export function RivalReveal({
  opponent,
  rivalName,
  rivalTactic,
  squad,
  onDone,
}: {
  opponent: Team;
  rivalName?: string;
  rivalTactic?: Tactic;
  squad: Player[];
  onDone: () => void;
}) {
  const ordered = positions.flatMap((position) => squad.filter((player) => slotOf(player) === position));
  const bySlot: Partial<Record<Position, Player>> = {};
  squad.forEach((player) => {
    bySlot[slotOf(player)] = player;
  });
  const atk = groupAverage(bySlot, ['LF', 'RF', 'CF']);
  const def = groupAverage(bySlot, ['GK', 'LB', 'RB', 'CM']);
  const overall = average(squad);
  const STEP = 600; // intervalo entre um jogador e o próximo
  const statsAt = ordered.length * STEP + 300;
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
      if (elapsed < statsAt + 2200) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Segue sozinho para a partida começar nos dois lados quase ao mesmo tempo
  useEffect(() => {
    const timer = window.setTimeout(finish, LINEUP_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const statP = ease((t - statsAt) / 1600);
  const ovrP = ease((t - statsAt - 700) / 1200);
  const tones = { special: '#F5B800', gold: '#d4a63a', silver: '#bcc3cd', bronze: '#b8743f' };
  const ready = t >= statsAt + 1800;
  const SIZE = 60;
  return (
    <div
      role="dialog"
      aria-label="Escalação do rival"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        overflowY: 'auto',
        display: 'grid',
        placeItems: 'center',
        padding: 12,
        background: 'rgba(5,8,12,.96)',
        animation: 'lr-fade .35s ease-out',
      }}
    >
      <style>{`
        @keyframes lr-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lr-spot { 0% { opacity: 0; transform: translateY(-26px) scale(.3) } 60% { opacity: 1; transform: translateY(2px) scale(1.15) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes lr-pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .lr-spot, .lr-pop { animation: none !important; opacity: 1 !important } }
      `}</style>
      <div style={{ width: 'min(400px, 100%)', textAlign: 'center' }}>
        <div className="eyebrow">{rivalName ? `SEU RIVAL · ${rivalName.toUpperCase()}` : 'SEU RIVAL'}</div>
        <h2 style={{ margin: '4px 0 4px' }}>{opponent.name.toUpperCase()}</h2>
        {rivalTactic && (
          <div style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: '#F5B800' }}>
            {TACTIC_INFO[rivalTactic].icon} TÁTICA {TACTIC_INFO[rivalTactic].label.toUpperCase()}
          </div>
        )}
        {/* Usa o mesmo campo do app (classes .pitch / .pitch-lines), então as cores acompanham o resto do jogo */}
        <div
          className="pitch"
          style={{ position: 'relative', width: '100%', height: 'auto', aspectRatio: '3 / 4', maxWidth: 'none', margin: 0, overflow: 'hidden' }}
        >
          <div className="pitch-lines">
            {/* círculo central e grande área de baixo, no mesmo traço das linhas do campo do jogo */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: '26%', aspectRatio: '1', transform: 'translate(-50%, -50%)', border: '1px solid #ffffff42', borderRadius: '50%' }} />
            <div style={{ position: 'absolute', left: '35%', bottom: 0, width: '30%', height: '16%', border: '1px solid #ffffff42' }} />
          </div>
          {ordered.map((player, index) => {
            const [x, y] = REVEAL_SPOTS[slotOf(player)];
            const color = tones[colorForOverall(player.overall) as keyof typeof tones];
            return (
              <div
                key={player.id}
                style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', width: 96 }}
              >
                <div
                  className="lr-spot"
                  style={{
                    display: 'grid',
                    justifyItems: 'center',
                    gap: 3,
                    opacity: 0,
                    animation: `lr-spot .5s ease-out ${index * STEP}ms forwards`,
                  }}
                >
                  <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
                    <div
                      style={{
                        width: SIZE,
                        height: SIZE,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: opponent.primary_color,
                        border: `2px solid ${color}`,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 900,
                        fontSize: 24,
                      }}
                    >
                      {player.image_url ? (
                        <img
                          src={player.image_url}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: '50% 22%',
                            transform: 'scale(1.7)',
                            transformOrigin: '50% 22%',
                          }}
                        />
                      ) : (
                        player.name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <b
                      style={{
                        position: 'absolute',
                        right: -8,
                        bottom: -4,
                        minWidth: 26,
                        textAlign: 'center',
                        padding: '1px 4px',
                        borderRadius: 8,
                        background: '#0B1016',
                        border: `1.5px solid ${color}`,
                        color,
                        fontSize: 13,
                        lineHeight: '18px',
                      }}
                    >
                      {player.overall}
                    </b>
                  </div>
                  <span
                    style={{
                      maxWidth: 96,
                      padding: '1px 7px',
                      borderRadius: 6,
                      background: 'rgba(0,0,0,.55)',
                      fontSize: 11,
                      fontWeight: 800,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ color: '#F5B800' }}>{slotOf(player)}</span> {player.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, opacity: statP > 0 ? 1 : 0 }}>
          {[
            { label: 'ATAQUE', value: atk, color: '#ef4444', progress: statP },
            { label: 'DEFESA', value: def, color: '#3b82f6', progress: statP },
            { label: 'OVERALL', value: overall, color: '#F5B800', progress: ovrP },
          ].map((row) => (
            <div key={row.label} className={row.label === 'OVERALL' ? 'lr-pop' : undefined} style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>{row.label}</span>
              <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.1, color: row.color, fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(row.value * row.progress)}
              </div>
            </div>
          ))}
        </div>
        <button className="gold-button large lobby-main" onClick={finish} style={{ opacity: ready ? 1 : 0.6, marginTop: 10 }}>
          Começar partida
        </button>
      </div>
    </div>
  );
}
