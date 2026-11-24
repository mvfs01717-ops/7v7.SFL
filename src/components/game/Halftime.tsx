import { useEffect, useRef, useState } from 'react';
import { PENALTY_PREP_MS, slotOf } from '@/lib/game/helpers';
import { positions, type Player, type Position, type Team } from '@/lib/game/types';
import { Card, cardCss } from '@/components/game/Card';
import { ChemBadge } from '@/components/game/ChemBadge';
import { chemOf, posPt } from '@/lib/game/chemistry';
import { loadRoles } from '@/lib/playerRoles';
import { FIELD_SPOTS, DraftField, draftCss } from '@/components/game/DraftScreen';
import type { ComponentProps } from 'react';
import CornerTaker from '@/components/game/CornerTaker';
import type { CExec } from '@/lib/game/corner';
import { setPieceOdds, SET_OPTIONS, SET_TITLE, type SetKind, type SetOption } from '@/lib/game/setpiece';
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
  const starterSlotView = (slot: Position, index: number) => {
    const player = starterAt(slot);
    if (!player) return null;
    const stamina = staminaAt(slot, minute, tactic, player.since ?? 0, player.carried ?? 0);
    const reserve = bench.find((item) => item.id === picks[slot]);
    const locked = slot === 'GK' || !!player.captain;
    const active = selected === slot;
    const shown = reserve ?? player;
    // Entrosamento de quem vai estar em campo (já com as trocas escolhidas)
    const lineupNow: Partial<Record<Position, Player>> = {};
    userTeam.forEach((p) => { const s = slotOf(p); lineupNow[s] = bench.find((item) => item.id === picks[s]) ?? p; });
    const chem = chemOf(slot, lineupNow, { club, tactic, saved: loadRoles() });
    return (
      <div
        key={slot}
        className={`dr-slot filled ht-slot ${active ? 'sel' : ''} ${selected && !locked && !active ? 'target' : ''} ${reserve ? 'ht-in' : ''} ${locked ? 'ht-lock' : 'swappable'}`}
        style={{ left: `${FIELD_SPOTS[slot].x}%`, top: `${FIELD_SPOTS[slot].y}%`, '--i': index } as React.CSSProperties}
        aria-label={`${slot}: ${shown.name}`}
      >
        <span className="dr-glow">
          <Card player={shown} fluid onClick={() => toggleStarter(slot)} />
        </span>
        <ChemBadge chem={chem} inside />
        <i className="dr-label">{reserve ? `${posPt(slot)} · ENTRA` : locked ? `${posPt(slot)} · ${slot === 'GK' ? 'GOLEIRO' : 'CAPITÃO ©'}` : posPt(slot)}</i>
        <span className="ht-stam" title="Fôlego">
          <i style={{ width: `${reserve ? 100 : stamina}%`, background: reserve ? '#22c55e' : staminaColor(stamina) }} />
        </span>
        <b className="ht-pct" style={{ color: reserve ? '#22c55e' : staminaColor(stamina) }}>
          {reserve ? sign(gainOf(slot, reserve)) : `${Math.round(stamina)}%`}
        </b>
      </div>
    );
  };
  return (
    <div role="dialog" aria-label="Substituições" className="ht-panel">
      <style>{cardCss}</style>
      <style>{draftCss}</style>
      <style>{subsCss}</style>
      <div className="ht-head">
        <div>
          <span className="eyebrow">INTERVALO · {club.abbreviation}</span>
          <h3>SUBSTITUIÇÕES</h3>
        </div>
        <b className="ht-count">
          {limitSec ? `⏱ ${left}s · ` : ''}
          {made}/{SUBS_MAX} trocas
        </b>
      </div>
      <p className="ht-hint">
        {selected
          ? `Agora toque no reserva que entra no lugar de ${starterAt(selected)?.name ?? selected}.`
          : `Toque em quem sai e depois no reserva que entra. A barra mostra o fôlego aos ${minute}'. Reserva fora de posição perde 5.`}
      </p>
      <div className="dr-field ht-field">
        <DraftField />
        {positions.map((slot, index) => starterSlotView(slot, index))}
      </div>
      <div className="dr-bench">
        <span className="eyebrow" style={{ justifyContent: 'center' }}>
          BANCO · {bench.length - used.length} disponíveis
        </span>
        {bench.length === 0 && <p style={{ opacity: 0.7 }}>Sem reservas disponíveis.</p>}
        <div className="dr-bench-row">
          {bench.map((reserve, index) => {
            const taken = used.includes(reserve.id);
            const outSlot = taken ? (Object.keys(picks) as Position[]).find((k) => picks[k] === reserve.id) : undefined;
            const outgoing = outSlot ? starterAt(outSlot) : undefined;
            const shownOnBench = outgoing ?? reserve;
            const gain = selected ? gainOf(selected, reserve) : null;
            const fits = selected ? fitsSlot(lite(reserve), selected) : true;
            return (
              <div
                key={reserve.id}
                className={`dr-slot filled ht-res ${selected && !taken ? 'target swappable' : ''} ${taken ? 'ht-taken' : ''}`}
                style={{ '--i': index } as React.CSSProperties}
              >
                <span className="dr-glow">
                  <Card
                    player={shownOnBench}
                    fluid
                    onClick={() => {
                      if (outSlot && !sent) {
                        setPicks((current) => {
                          const next = { ...current };
                          delete next[outSlot];
                          return next;
                        });
                        setSelected(null);
                      } else chooseReserve(reserve);
                    }}
                  />
                </span>
                <i className={`dr-label ${selected && !taken && !fits ? 'oop' : ''}`}>
                  {taken ? `SAIU · ${outSlot ?? ''}` : selected && !fits ? 'FORA −5' : reserve.primary_position}
                </i>
                {selected && !taken && gain !== null && (
                  <b className="ht-pct" style={{ color: gainColor(gain) }}>
                    {sign(gain)} no 2º tempo
                  </b>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="ht-actions">
        {sent && <b style={{ alignSelf: 'center', color: '#22c55e' }}>✅ Trocas enviadas. Esperando o adversário...</b>}
        {made > 0 && !sent && (
          <button type="button" className="outline-button" onClick={() => setPicks({})}>
            Desfazer trocas
          </button>
        )}
        <button type="button" className="gold-button cta-slant" disabled={sent} onClick={send} style={{ padding: '14px 26px' }}>
          {made ? `Confirmar ${made} ${made === 1 ? 'troca' : 'trocas'} e voltar` : 'Seguir sem trocas'}
        </button>
      </div>
    </div>
  );
}

const subsCss = `
.ht-panel { position: fixed; inset: 0; z-index: 90; overflow: auto; padding: 16px 12px 28px;
  background: radial-gradient(120% 60% at 50% 0, rgba(255,246,200,.1), transparent 60%), linear-gradient(180deg, #0b1d33, #07110c 70%); }
.ht-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; flex-wrap: wrap; max-width: 560px; margin: 0 auto; }
.ht-head h3 { margin: 2px 0 0; font-size: 30px; font-style: italic; letter-spacing: 2px; }
.ht-count { padding: 6px 14px; border-radius: 999px; background: rgba(245,184,0,.16); border: 1px solid rgba(245,184,0,.5); color: #F5B800; font-size: 13px; }
.ht-hint { max-width: 560px; margin: 8px auto 12px; font-size: 12.5px; line-height: 1.45; opacity: .8; text-align: center; }
.ht-field { width: min(100%, 480px); aspect-ratio: .74; animation: none; margin-bottom: 14px; }
.ht-slot .ht-stam, .ht-res .ht-stam { display: block; height: 5px; margin: 3px 4px 0; border-radius: 4px; background: rgba(255,255,255,.18); overflow: hidden; }
.ht-stam i { display: block; height: 100%; border-radius: 4px; }
.ht-pct { display: block; margin-top: 1px; text-align: center; font-size: 11px; text-shadow: 0 1px 3px #000; }
.ht-slot.ht-lock .dr-glow { filter: grayscale(.45) brightness(.85); }
.ht-slot.ht-in .dr-glow { filter: drop-shadow(0 0 12px #22c55e); }
.ht-slot.ht-in .dr-label { background: #14532d; color: #bbf7d0; }
.ht-res.ht-taken { opacity: .6; filter: grayscale(.5); }
.ht-actions { display: flex; gap: 10px; justify-content: center; margin-top: 34px; flex-wrap: wrap; }
.ht-panel .dr-bench-row { padding-bottom: 8px; }
.ht-slot, .ht-res { animation-delay: calc(var(--i) * 40ms) !important; }
`;

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

// Bola parada: o jogador escolhe a jogada ensaiada antes do escanteio ou da falta (só contra o bot)
// Dados para ajudar na escolha: quem cobra e as chances reais de cada jogada (iguais às do sorteio do jogo)
export type SetPieceInfo = { taker?: string; takerOvr: number; atk: number; def: number; odds: boolean; keeper?: string; keeperOvr?: number; oppColor?: string };

type SPProps = { kind: SetKind; minute: number; club: { abbreviation: string; primary_color: string }; onPick: (option: SetOption) => void; onCorner?: (exec: CExec) => void; live?: ComponentProps<typeof CornerTaker>['live']; floating?: boolean; info?: SetPieceInfo | null };
// Escanteio com controle manual (mira, força, efeito e jogada ensaiada); falta e demais bolas paradas seguem o menu de sempre
export function SetPiecePrep(props: SPProps) {
  const { kind, minute, club, onCorner, floating = false, info, live } = props;
  if (kind === 'escanteio' && onCorner && live) {
    return <CornerTaker minute={minute} club={club} opponentColor={info?.oppColor} taker={info?.taker} takerOvr={info?.takerOvr ?? 75} keeper={info?.keeper} keeperOvr={info?.keeperOvr} floating={floating} onDone={onCorner} live={live} />;
  }
  return <SetPieceMenu {...props} />;
}
function SetPieceMenu({ kind, minute, club, onPick, floating = false, info }: SPProps) {
  const total = floating ? 8 : 12;
  const [left, setLeft] = useState(total);
  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) onPick('cruzamento');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  const riskColor = { baixo: '#3ddc84', médio: '#F5B800', alto: '#ff6a4f' } as const;
  const oddsOf = (id: SetOption) => (info?.odds ? setPieceOdds(kind, id, info.atk, info.def, info.takerOvr) : null);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const bestId = info?.odds ? SET_OPTIONS[kind].reduce((best, o) => ((oddsOf(o.id)?.gol ?? 0) > (oddsOf(best.id)?.gol ?? 0) ? o : best), SET_OPTIONS[kind][0]).id : null;
  if (floating) {
    // Multiplayer: não pausa o jogo, aparece por cima do campo com tempo curto
    return (
      <div role="dialog" aria-label="Jogada ensaiada" style={{ position: 'absolute', left: '50%', bottom: 52, transform: 'translateX(-50%)', zIndex: 8, width: 'min(94%, 480px)', padding: 8, borderRadius: 14, background: 'rgba(4,8,16,.93)', border: '1px solid #F5B800', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, font: '900 11px Inter, sans-serif', letterSpacing: '.8px' }}>
          <span style={{ color: '#F5B800' }}>{SET_TITLE[kind]} · {minute}'</span>
          <span>{Math.max(0, left)} s</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {SET_OPTIONS[kind].map((o) => (
            <button key={o.id} onClick={() => onPick(o.id)} title={o.text} style={{ cursor: 'pointer', padding: '8px 4px', borderRadius: 10, border: '1px solid rgba(255,255,255,.22)', background: 'rgba(255,255,255,.08)', color: '#fff', display: 'grid', justifyItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 20 }}>{o.icon}</span>
              <b style={{ font: '900 11px Inter, sans-serif' }}>{o.label}</b>
              <small style={{ font: '800 9px Inter, sans-serif', color: riskColor[o.risk], textTransform: 'uppercase' }}>risco {o.risk}</small>
              {oddsOf(o.id) && <small style={{ font: '800 9px Inter, sans-serif', opacity: 0.85 }}>⚽ {pct(oddsOf(o.id)!.gol)}</small>}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 6, height: 3, borderRadius: 3, background: 'rgba(255,255,255,.15)', overflow: 'hidden' }}>
          <div style={{ width: `${(Math.max(0, left) / total) * 100}%`, height: '100%', background: '#F5B800', transition: 'width 1s linear' }} />
        </div>
      </div>
    );
  }
  // Jogo parado: folha fixa na parte de baixo da tela (cabe em qualquer celular, com rolagem se precisar)
  return (
    <div role="dialog" aria-label="Jogada ensaiada" className="spp-back">
      <style>{`
        .spp-back { position: fixed; inset: 0; z-index: 520; display: grid; align-items: end; justify-items: center; background: rgba(4,8,16,.72); padding: 0 10px calc(10px + env(safe-area-inset-bottom)); overflow: hidden; }
        @media (min-width: 760px) { .spp-back { align-items: center; } }
        .spp-box { width: min(100%, 480px); max-height: calc(100dvh - 20px); overflow-y: auto; background: #0e1522; border: 1px solid rgba(245,184,0,.55); border-radius: 16px; padding: 12px; color: #fff; box-shadow: 0 -10px 40px rgba(0,0,0,.55); }
        .spp-opt { width: 100%; display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 10px; text-align: left; cursor: pointer; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.07); color: #fff; }
        .spp-opt:active { background: rgba(245,184,0,.18); }
        .spp-opt b { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font: 900 15px Inter, sans-serif; }
        .spp-opt b em { font: 900 10px Inter, sans-serif; letter-spacing: .6px; font-style: normal; text-transform: uppercase; }
        .spp-odds { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 5px; font: 800 11px Inter, sans-serif; }
        .spp-odds i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: -4px; }
        .spp-best { font: 900 9px Inter, sans-serif; letter-spacing: .6px; font-style: normal; padding: 2px 6px; border-radius: 6px; background: #F5B800; color: #1a1200; }
        .spp-opt small { display: block; margin-top: 2px; font: 600 12px/1.3 Inter, sans-serif; opacity: .8; }
      `}</style>
      <div className="spp-box">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ font: '900 11px Inter, sans-serif', letterSpacing: '1.4px', color: '#F5B800' }}>{minute}' · {club.abbreviation} · JOGO PARADO</div>
          <div style={{ font: '900 21px Inter, sans-serif', letterSpacing: '.5px' }}>{SET_TITLE[kind]}</div>
          <div style={{ font: '700 12px Inter, sans-serif', opacity: 0.85 }}>
            {info?.taker ? <>Cobrador: <b style={{ color: '#F5B800' }}>{info.taker}</b> · {info.takerOvr}</> : 'Escolha a jogada ensaiada'}
          </div>
          {info?.taker && <div style={{ font: '600 11px Inter, sans-serif', opacity: 0.65, marginTop: 1 }}>Escolha a jogada ensaiada</div>}
        </div>
        <div style={{ display: 'grid', gap: 7 }}>
          {SET_OPTIONS[kind].map((o) => (
            <button key={o.id} className="spp-opt" onClick={() => onPick(o.id)}>
              <span style={{ fontSize: 26, textAlign: 'center' }}>{o.icon}</span>
              <span>
                <b>
                  {o.label}
                  <em style={{ color: riskColor[o.risk] }}>risco {o.risk}</em>
                </b>
                <small>{o.text}</small>
                {oddsOf(o.id) && (
                  <span className="spp-odds">
                    <i style={{ background: '#3ddc84' }} />⚽ gol {pct(oddsOf(o.id)!.gol)}
                    <i style={{ background: '#F5B800' }} />chega ao gol {pct(oddsOf(o.id)!.gol + oddsOf(o.id)!.defesa + oddsOf(o.id)!.finalização)}
                    {o.id === bestId && <em className="spp-best">MAIOR CHANCE DE GOL</em>}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10, height: 4, borderRadius: 4, background: 'rgba(255,255,255,.15)', overflow: 'hidden' }}>
          <div style={{ width: `${(Math.max(0, left) / total) * 100}%`, height: '100%', background: '#F5B800', transition: 'width 1s linear' }} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 4, font: '700 11px Inter, sans-serif', opacity: 0.7 }}>Sem escolha em {Math.max(0, left)} s, o time cruza na área</div>
      </div>
    </div>
  );
}
