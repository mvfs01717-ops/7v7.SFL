import { useEffect, useRef, useState } from 'react';
import { PENALTY_PREP_MS, slotOf } from '@/lib/game/helpers';
import { positions, type Player, type Position, type Team } from '@/lib/game/types';
import { SUBS_MAX, fitsSlot, staminaAt, substitutionGain, type FieldLite, type Tactic } from '@/lib/multiplayer';

// ---- Intervalo e transição para os pênaltis: usam o mesmo campo do MatchPitch (SVG 740 x 440, time do usuário à esquerda) ----
export const PF = { W: 740, H: 440, X0: 20, X1: 720, Y0: 10, Y1: 430, MX: 370, MY: 220 };

// Formação de saída de bola do MatchPitch (fração do campo; o time do usuário ataca para a direita)
export const PF_KICK: Record<Position, [number, number]> = {
  GK: [0.05, 0.5],
  LB: [0.2, 0.25],
  RB: [0.2, 0.75],
  CM: [0.3, 0.5],
  LF: [0.38, 0.2],
  RF: [0.38, 0.8],
  CF: [0.4, 0.5],
};

// Onde cada jogador fica na saída de bola do 2º tempo (o rival sai: o CF dele fica na bola, no centro).
// Tem que ser igual à formação do MatchPitch para a animação terminar exatamente onde o jogo recomeça.
export const pfKickSpot = (side: 'user' | 'bot', position: Position) => {
  if (side === 'bot' && position === 'CF') return { x: PF.MX + 12, y: PF.MY };
  const [f, g] = PF_KICK[position];
  return pfPoint(side, f, g);
};

export const pfPoint = (side: 'user' | 'bot', f: number, g: number) => ({
  x: PF.X0 + (side === 'user' ? f : 1 - f) * (PF.X1 - PF.X0),
  y: PF.Y0 + (side === 'user' ? g : 1 - g) * (PF.Y1 - PF.Y0),
});

export function pfTextOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160 ? '#111111' : '#ffffff';
}

// Gramado igual ao do MatchPitch
export function PitchField({ children }: { children?: React.ReactNode }) {
  const line = 'rgba(255,255,255,.55)';
  return (
    <svg viewBox={`0 0 ${PF.W} ${PF.H}`} style={{ display: 'block', width: '100%', height: '100%' }} aria-hidden="true">
      <rect x={0} y={0} width={PF.W} height={PF.H} fill="#0a2417" />
      {Array.from({ length: 10 }).map((_, i) => (
        <rect key={i} x={PF.X0 + i * 70} y={PF.Y0} width={70} height={PF.Y1 - PF.Y0} fill={i % 2 ? '#10432a' : '#0e3a24'} />
      ))}
      <g fill="none" stroke={line} strokeWidth={2}>
        <rect x={PF.X0} y={PF.Y0} width={PF.X1 - PF.X0} height={PF.Y1 - PF.Y0} />
        <line x1={PF.MX} y1={PF.Y0} x2={PF.MX} y2={PF.Y1} />
        <circle cx={PF.MX} cy={PF.MY} r={48} />
        <rect x={PF.X0} y={PF.MY - 90} width={92} height={180} />
        <rect x={PF.X1 - 92} y={PF.MY - 90} width={92} height={180} />
        <rect x={PF.X0} y={PF.MY - 42} width={36} height={84} />
        <rect x={PF.X1 - 36} y={PF.MY - 42} width={36} height={84} />
      </g>
      <circle cx={PF.MX} cy={PF.MY} r={3} fill={line} />
      <rect x={PF.X0 - 14} y={188} width={14} height={64} fill="rgba(255,255,255,.12)" stroke={line} strokeWidth={2} />
      <rect x={PF.X1} y={188} width={14} height={64} fill="rgba(255,255,255,.12)" stroke={line} strokeWidth={2} />
      {children}
    </svg>
  );
}

export const pitchOverlayStyle = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: '#0a2417',
} as const;

// Cor da barra de fôlego: verde (descansado), amarelo (cansando) e vermelho (exausto)
export const staminaColor = (value: number) => (value >= 65 ? '#22c55e' : value >= 45 ? '#F5B800' : '#ef4444');

// Substituições no intervalo (só contra o bot): escolhe quem sai, quem entra e vê o ganho de cada troca.
// Fica por cima do campo e o relógio da partida fica parado até confirmar.
export function SubstitutionPanel({
  club,
  userTeam,
  bench,
  tactic,
  minute,
  onConfirm,
  limitSec,
}: {
  club: Team;
  userTeam: Player[];
  bench: Player[];
  tactic: Tactic;
  minute: number;
  onConfirm: (choices: { slot: Position; inId: string }[]) => void;
  // Multiplayer: tempo (em segundos) para decidir. Ao acabar, envia as trocas que estiverem marcadas.
  limitSec?: number;
}) {
  const [picks, setPicks] = useState<Partial<Record<Position, string>>>({});
  const [selected, setSelected] = useState<Position | null>(null);
  const [sent, setSent] = useState(false);
  const [left, setLeft] = useState(limitSec ?? 0);
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const sentRef = useRef(false);
  function send() {
    if (sentRef.current) return;
    sentRef.current = true;
    if (limitSec) setSent(true);
    onConfirm((Object.entries(picksRef.current) as [Position, string][]).map(([slot, inId]) => ({ slot, inId })));
  }
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!limitSec) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, limitSec - Math.floor((Date.now() - startedAt) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        sendRef.current();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [limitSec]);
  const used = Object.values(picks) as string[];
  const made = used.length;
  const lite = (player: Player) => ({
    primary_position: player.primary_position,
    overall: player.overall,
    name: player.name,
    alts: player.alternate_positions ?? [],
  });
  const starterAt = (slot: Position) => userTeam.find((player) => slotOf(player) === slot);
  const gainOf = (slot: Position, reserve: Player) => {
    const out = starterAt(slot);
    return out ? Math.round(substitutionGain(out as FieldLite, lite(reserve), tactic) * 10) / 10 : 0;
  };
  function toggleStarter(slot: Position) {
    if (sent) return;
    if (picks[slot]) {
      setPicks((current) => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
      setSelected(null);
      return;
    }
    if (slot === 'GK' || starterAt(slot)?.captain) return;
    setSelected((current) => (current === slot ? null : slot));
  }
  function chooseReserve(reserve: Player) {
    if (sent || !selected || used.includes(reserve.id)) return;
    if (!picks[selected] && made >= SUBS_MAX) return;
    setPicks((current) => ({ ...current, [selected]: reserve.id }));
    setSelected(null);
  }
  const sign = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  const gainColor = (value: number) => (value > 0.4 ? '#22c55e' : value < -0.4 ? '#ef4444' : '#cbd5e1');
  return (
    <div
      role="dialog"
      aria-label="Substituições"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        overflow: 'auto',
        padding: 14,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,.12)',
        background: 'linear-gradient(180deg,#0a2417,#0b1710)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">INTERVALO · {club.abbreviation}</span>
          <h3 style={{ margin: '2px 0 0', fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2 }}>
            SUBSTITUIÇÕES
          </h3>
        </div>
        <b style={{ color: '#F5B800' }}>
          {limitSec ? `⏱ ${left}s · ` : ''}
          {made}/{SUBS_MAX} trocas
        </b>
      </div>
      <p style={{ margin: '4px 0 10px', fontSize: 13, opacity: 0.8 }}>
        A barra mostra o fôlego aos {minute}', já descontado o esforço de cada um em campo (corridas, condução, desarmes). Quem está cansado rende menos e corre mais devagar no 2º tempo. Toque em quem sai e depois no reserva que entra.
        Reserva fora de posição perde 5 pontos.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
        <section>
          <span className="eyebrow">EM CAMPO</span>
          {positions.map((slot) => {
            const player = starterAt(slot);
            if (!player) return null;
            const stamina = staminaAt(slot, minute, tactic, player.since ?? 0, player.carried ?? 0);
            const reserve = bench.find((item) => item.id === picks[slot]);
            const active = selected === slot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => toggleStarter(slot)}
                disabled={slot === 'GK' || !!player.captain}
                aria-pressed={active || !!reserve}
                style={{
                  display: 'block',
                  width: '100%',
                  margin: '6px 0 0',
                  padding: '8px 10px',
                  textAlign: 'left',
                  color: 'inherit',
                  cursor: slot === 'GK' || player.captain ? 'default' : 'pointer',
                  borderRadius: 10,
                  border: `1px solid ${active ? '#F5B800' : reserve ? '#22c55e' : 'rgba(255,255,255,.14)'}`,
                  background: active ? 'rgba(245,184,0,.12)' : 'rgba(255,255,255,.04)',
                  opacity: slot === 'GK' || player.captain ? 0.7 : 1,
                }}
              >
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <b style={{ minWidth: 28, color: '#F5B800' }}>{slot}</b>
                  <span style={{ flex: 1, textDecoration: reserve ? 'line-through' : undefined, opacity: reserve ? 0.6 : 1 }}>
                    {player.name}
                    {player.captain ? <b style={{ color: '#F5B800' }}> ©</b> : null}
                  </span>
                  <strong>{player.overall}</strong>
                  <small style={{ minWidth: 34, textAlign: 'right', color: staminaColor(stamina) }}>{Math.round(stamina)}%</small>
                </span>
                <span style={{ display: 'block', height: 5, marginTop: 5, borderRadius: 3, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${stamina}%`, background: staminaColor(stamina) }} />
                </span>
                {reserve && (
                  <span style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 13 }}>
                    <span style={{ color: '#22c55e' }}>➜ {reserve.name}</span>
                    <strong>{reserve.overall}</strong>
                    <small style={{ marginLeft: 'auto', color: gainColor(gainOf(slot, reserve)) }}>
                      {sign(gainOf(slot, reserve))} no 2º tempo
                    </small>
                  </span>
                )}
                {slot === 'GK' && <small style={{ opacity: 0.6 }}>Goleiro não é substituído</small>}
                {player.captain && <small style={{ opacity: 0.6 }}>Capitão fica em campo</small>}
              </button>
            );
          })}
        </section>
        <section>
          <span className="eyebrow">BANCO</span>
          {bench.length === 0 && <p style={{ opacity: 0.7 }}>Sem reservas disponíveis.</p>}
          {bench.map((reserve) => {
            const taken = used.includes(reserve.id);
            const gain = selected ? gainOf(selected, reserve) : null;
            const fits = selected ? fitsSlot(lite(reserve), selected) : true;
            const blocked = taken || !selected || (!picks[selected] && made >= SUBS_MAX);
            return (
              <button
                key={reserve.id}
                type="button"
                onClick={() => chooseReserve(reserve)}
                disabled={blocked}
                style={{
                  display: 'block',
                  width: '100%',
                  margin: '6px 0 0',
                  padding: '8px 10px',
                  textAlign: 'left',
                  color: 'inherit',
                  cursor: blocked ? 'default' : 'pointer',
                  borderRadius: 10,
                  border: `1px solid ${taken ? '#22c55e' : 'rgba(255,255,255,.14)'}`,
                  background: 'rgba(255,255,255,.04)',
                  opacity: taken ? 0.5 : blocked ? 0.75 : 1,
                }}
              >
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <b style={{ minWidth: 28, color: '#F5B800' }}>{reserve.primary_position}</b>
                  <span style={{ flex: 1 }}>{reserve.name}</span>
                  <strong>{reserve.overall}</strong>
                  <small style={{ minWidth: 34, textAlign: 'right', color: '#22c55e' }}>100%</small>
                </span>
                <small style={{ display: 'block', marginTop: 3, opacity: 0.75 }}>
                  {[reserve.primary_position, ...(reserve.alternate_positions ?? [])].join(' · ')}
                  {taken ? ' · já escolhido' : ''}
                  {selected && !taken && !fits ? ' · fora de posição (−5)' : ''}
                  {selected && !taken && gain !== null ? ` · ${sign(gain)} no 2º tempo` : ''}
                </small>
              </button>
            );
          })}
        </section>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
        {sent && (
          <b style={{ alignSelf: 'center', color: '#22c55e' }}>✅ Trocas enviadas. Esperando o adversário...</b>
        )}
        {made > 0 && !sent && (
          <button type="button" className="outline-button" onClick={() => setPicks({})}>
            Desfazer trocas
          </button>
        )}
        <button type="button" className="gold-button" disabled={sent} onClick={send}>
          {made ? `Confirmar ${made} ${made === 1 ? 'troca' : 'trocas'} e voltar para o jogo` : 'Seguir sem trocas'}
        </button>
      </div>
    </div>
  );
}

// Intervalo: os jogadores saem do campo pelo túnel, aparece o placar e eles voltam para o 2º tempo.
// Cobre o campo da partida enquanto dura (HALFTIME_MS); o relógio do jogo fica parado.
export function HalftimeBreak({
  phase,
  club,
  opponent,
  userTeam,
  botTeam,
  score,
  subsLog,
}: {
  // full: tudo de uma vez | out: jogadores saem e aparece o placar | in: jogadores voltam e começa o 2º tempo
  phase: 'full' | 'out' | 'in';
  club: Team;
  opponent: Team;
  userTeam: Player[];
  botTeam: Player[];
  score: { user: number; bot: number };
  subsLog: { user: string[]; bot: string[] };
}) {
  const OUT = 1300; // quanto cada jogador leva para sair (e para voltar)
  const BACK_AT = 4200; // (full) quando os jogadores começam a voltar
  const hasSubs = subsLog.user.length > 0 || subsLog.bot.length > 0;
  const dot = (player: Player | undefined, position: Position, side: 'user' | 'bot', index: number) => {
    const team = side === 'user' ? club : opponent;
    // O campo do jogo recomeça na formação de saída de bola: é nela que os jogadores voltam
    const { x, y } = pfKickSpot(side, position);
    // Túnel: embaixo, no meio do campo
    const dx = PF.MX + (index % 7) * 7 - 21 - x;
    const dy = PF.H + 40 - y;
    const delay = (side === 'user' ? 0 : 7) * 40 + index * 40;
    const animation =
      phase === 'out'
        ? `ht-out ${OUT}ms ease-in ${delay}ms forwards`
        : phase === 'in'
          ? `ht-in ${OUT}ms ease-out ${delay}ms both`
          : `ht-out ${OUT}ms ease-in ${delay}ms forwards, ht-in ${OUT}ms ease-out ${BACK_AT + delay}ms forwards`;
    return (
      <g key={`${side}-${position}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
        <g
          className="ht-p"
          style={{ '--dx': `${dx.toFixed(0)}px`, '--dy': `${dy.toFixed(0)}px`, animation } as React.CSSProperties}
        >
          <ellipse cy={13} rx={11} ry={4} fill="rgba(0,0,0,.35)" />
          <circle r={14} fill={team.primary_color} stroke={team.secondary_color} strokeWidth={3} />
          <text textAnchor="middle" dy={4.5} fontSize={13} fontWeight={700} fill={pfTextOn(team.primary_color)}>
            {(player?.name ?? position).slice(0, 1).toUpperCase()}
          </text>
        </g>
      </g>
    );
  };
  const banner = (cls: string, text: string, delay: number, length: number) => (
    <div
      className={cls}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        textAlign: 'center',
        opacity: 0,
        animation: `ht-fade ${length}ms ease-in-out ${delay}ms forwards`,
        pointerEvents: 'none',
      }}
    >
      <b
        style={{
          display: 'inline-block',
          padding: '8px 18px',
          background: 'rgba(5,8,12,.78)',
          borderRadius: 8,
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 30,
          letterSpacing: 3,
          color: '#F5B800',
        }}
      >
        {text}
      </b>
    </div>
  );
  const cardStyle = (animation: string) =>
    ({
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(300px, 86%)',
      padding: '16px 18px',
      textAlign: 'center',
      background: 'rgba(5,8,12,.88)',
      border: '1px solid #F5B800',
      borderRadius: 10,
      opacity: 0,
      animation,
    }) as React.CSSProperties;
  const subsLines = (
    <div style={{ margin: '6px 0 8px', fontSize: 12, lineHeight: 1.5, textAlign: 'left' }}>
      {subsLog.user.map((line) => (
        <div key={`u-${line}`}>
          <b style={{ color: '#F5B800' }}>{club.abbreviation}</b> · {line}
        </div>
      ))}
      {subsLog.bot.map((line) => (
        <div key={`b-${line}`}>
          <b style={{ color: '#F5B800' }}>{opponent.abbreviation}</b> · {line}
        </div>
      ))}
    </div>
  );
  const scoreLine = (
    <div style={{ margin: '6px 0', fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, lineHeight: 1 }}>
      {club.abbreviation} {score.user} — {score.bot} {opponent.abbreviation}
    </div>
  );
  return (
    <div role="status" aria-label="Intervalo" style={pitchOverlayStyle}>
      <style>{`
        @keyframes ht-out { 0% { transform: translate(0, 0); opacity: 1 } 75% { opacity: 1 } 100% { transform: translate(var(--dx), var(--dy)); opacity: 0 } }
        @keyframes ht-in { 0% { transform: translate(var(--dx), var(--dy)); opacity: 0 } 25% { opacity: 1 } 100% { transform: translate(0, 0); opacity: 1 } }
        @keyframes ht-fade { 0% { opacity: 0 } 15% { opacity: 1 } 85% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes ht-show { 0% { opacity: 0 } 100% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .ht-p, .ht-a, .ht-c { display: none !important }
          .ht-card { animation: none !important; opacity: 1 !important }
        }
      `}</style>
      <PitchField>
        {positions.map((position, index) => dot(userTeam[index], position, 'user', index))}
        {positions.map((position, index) => dot(botTeam[index], position, 'bot', index))}
      </PitchField>
      {phase !== 'in' && banner('ht-a', 'FIM DO 1º TEMPO', 200, 1900)}
      {phase === 'full' && (
        <div className="ht-card" style={cardStyle('ht-fade 2600ms ease-in-out 1900ms forwards')}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#F5B800' }}>INTERVALO</div>
          {scoreLine}
          <small style={{ opacity: 0.7 }}>Os times voltam já já para o 2º tempo</small>
        </div>
      )}
      {phase === 'out' && (
        <div className="ht-card" style={cardStyle('ht-show 700ms ease-out 1900ms forwards')}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#F5B800' }}>INTERVALO</div>
          {scoreLine}
          <small style={{ opacity: 0.7 }}>Prepare as substituições do 2º tempo</small>
        </div>
      )}
      {phase === 'in' && hasSubs && (
        <div className="ht-card" style={cardStyle('ht-fade 2400ms ease-in-out 150ms forwards')}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#F5B800' }}>SUBSTITUIÇÕES</div>
          {subsLines}
        </div>
      )}
      {phase !== 'out' && banner('ht-c', 'COMEÇA O 2º TEMPO', phase === 'full' ? 4500 : hasSubs ? 2500 : 1900, 1600)}
    </div>
  );
}

// Fim do tempo normal empatado: transição antes da disputa de pênaltis (dura PENALTY_PREP_MS)
export function PenaltyPrep({ club, opponent, score }: { club: Team; opponent: Team; score: { user: number; bot: number } }) {
  return (
    <div role="status" aria-label="Vai para os pênaltis" style={pitchOverlayStyle}>
      <style>{`
        @keyframes pp-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pp-ball { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-18px) } }
        @keyframes pp-bar { from { width: 0 } to { width: 100% } }
        @media (prefers-reduced-motion: reduce) { .pp-ball, .pp-in { animation: none !important; opacity: 1 !important } }
      `}</style>
      <PitchField />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16 }}>
        <div
          style={{
            textAlign: 'center',
            padding: '18px 22px',
            background: 'rgba(5,8,12,.85)',
            border: '1px solid #F5B800',
            borderRadius: 10,
            width: 'min(340px, 100%)',
          }}
        >
          <div
            className="pp-in"
            style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#F5B800', animation: 'pp-in .4s ease-out both' }}
          >
            FIM DO TEMPO NORMAL
          </div>
          <div
            className="pp-in"
            style={{ margin: '6px 0', fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, lineHeight: 1, animation: 'pp-in .4s ease-out .3s both' }}
          >
            {club.abbreviation} {score.user} — {score.bot} {opponent.abbreviation}
          </div>
          <div
            className="pp-in"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2, animation: 'pp-in .4s ease-out .9s both' }}
          >
            EMPATE! VAI PARA OS PÊNALTIS
          </div>
          <div
            className="pp-ball"
            style={{ fontSize: 30, margin: '8px 0', animation: 'pp-ball .7s ease-in-out infinite' }}
            aria-hidden="true"
          >
            ⚽
          </div>
          <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,.14)', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#F5B800', animation: `pp-bar ${PENALTY_PREP_MS}ms linear forwards` }} />
          </div>
          <small style={{ display: 'block', marginTop: 6, opacity: 0.7 }}>Preparando a disputa...</small>
        </div>
      </div>
    </div>
  );
}
