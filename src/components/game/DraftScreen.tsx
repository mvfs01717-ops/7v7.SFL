import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BENCH_SLOTS, positionNames, type BenchSlot, type DraftSlot, type Player, type Position, type Team } from '@/lib/game/types';
import { Card, LogoMark, cardCss } from '@/components/game/Card';

// ---------- Draft estilo campo: o campo aparece com as cartas escondidas e cada posição revela 3 cartas ----------
export const FIELD_SPOTS: Record<Position, { x: number; y: number }> = {
  GK: { x: 50, y: 83 },
  LB: { x: 20, y: 65 },
  RB: { x: 80, y: 65 },
  CM: { x: 50, y: 49 },
  LF: { x: 20, y: 30 },
  RF: { x: 80, y: 30 },
  CF: { x: 50, y: 14 },
};

export const draftCss = `
.dr-page { position: relative; }
.dr-stage { transition: transform .5s cubic-bezier(.2,.8,.2,1), filter .5s ease; }
.dr-page.dr-open .dr-stage { transform: scale(1.035); filter: blur(4px) brightness(.6); }
.dr-field {
  position: relative;
  width: min(100%, 540px);
  margin: 0 auto;
  aspect-ratio: 0.9;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #42815d;
  background: repeating-linear-gradient(180deg, #15432d 0 12.5%, #123a27 12.5% 25%);
  animation: dr-field-in .8s ease-out both;
}
.dr-field > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.dr-slot {
  position: absolute;
  width: 19%;
  transform: translate(-50%, -50%);
  animation: dr-slot-in .55s cubic-bezier(.2,.8,.2,1) both;
  animation-delay: calc(.45s + var(--i) * .1s);
  outline: none;
}
.dr-slot[role="button"] { cursor: pointer; }
.dr-slot.filled { cursor: default; }
.dr-slot:focus-visible .dr-glow { filter: drop-shadow(0 0 8px #fff); }
.dr-glow { display: block; filter: drop-shadow(0 4px 6px rgba(0,0,0,.45)); }
.dr-slot.next .dr-glow { animation: dr-pulse 1.5s ease-in-out infinite; }
.dr-slot:not(.filled):hover .dr-glow { filter: drop-shadow(0 0 12px rgba(245,184,0,.9)); transform: translateY(-3px); }
.dr-glow { transition: transform .2s ease, filter .2s ease; }
.dr-empty {
  position: relative;
  aspect-ratio: 0.74;
  clip-path: var(--shield);
  background: linear-gradient(160deg, #f7e39a, #a77a12);
  display: grid;
  place-items: center;
}
.dr-empty::before { content: ''; position: absolute; inset: 3px; clip-path: var(--shield); background: linear-gradient(165deg, #1a222b, #0a0e13); }
.dr-logo { position: relative; display: block; width: 58%; margin-top: -8%; opacity: .95; filter: drop-shadow(0 0 6px rgba(245,184,0,.35)); }
.dr-logo svg { width: 100% !important; height: auto !important; }
.dr-label {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translate(-50%, 4px);
  white-space: nowrap;
  font-style: normal;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .08em;
  padding: 2px 7px;
  border-radius: 99px;
  background: rgba(5,8,12,.78);
  color: #F5B800;
}
.dr-slot.filled .dr-label { color: #e8e6df; }
.dr-slot.swappable { cursor: pointer; }
.dr-slot.swappable:hover .dr-glow { transform: translateY(-3px); }
.dr-slot.sel { z-index: 3; }
.dr-slot.sel .dr-glow { transform: scale(1.12); filter: drop-shadow(0 0 14px #F5B800) drop-shadow(0 0 4px #fff); }
.dr-slot.target .dr-glow { animation: dr-pulse 1.3s ease-in-out infinite; }
.dr-label.oop { background: #7f1d1d; color: #fecaca; }
.dr-reveal { animation: dr-reveal .95s cubic-bezier(.2,.85,.25,1) both; }
.dr-reveal-glow { animation: dr-flash 1.5s ease-out both; }
.dr-bench { width: min(100%, 540px); margin: 22px auto 0; text-align: center; }
.dr-bench-row { display: flex; justify-content: center; gap: 4%; margin-top: 8px; padding-bottom: 20px; }
.dr-bench .dr-slot { position: relative; transform: none; width: min(26%, 118px); animation-delay: calc(1.2s + var(--i) * .1s); }
.dr-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 16px;
  overflow-y: auto;
  background: rgba(4,7,10,.72);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: dr-blur-in .45s ease-out both;
}
.dr-overlay.closing { animation: dr-blur-out .3s ease-in both; }
.dr-sheet { width: min(560px, 100%); text-align: center; animation: dr-zoom .5s cubic-bezier(.2,.8,.2,1) both; }
.dr-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0 14px; perspective: 1000px; }
.dr-cardwrap {
  display: block;
  animation: dr-flash 1.5s ease-out both;
  animation-delay: calc(var(--i) * .18s + .75s);
  transition: transform .2s ease, filter .2s ease;
}
.dr-cardwrap:hover { transform: translateY(-6px) scale(1.03); filter: drop-shadow(0 0 14px rgba(245,184,0,.9)); }
.dr-flip {
  position: relative;
  aspect-ratio: 0.74;
  transform-style: preserve-3d;
  animation: dr-flipin .95s cubic-bezier(.2,.85,.25,1) both;
  animation-delay: calc(var(--i) * .18s + .12s);
}
.dr-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.dr-back { transform: rotateY(180deg); }
.dr-backcard {
  width: 100%;
  height: 100%;
  clip-path: var(--shield);
  background: linear-gradient(160deg, #f7e39a, #a77a12);
  display: grid;
  place-items: center;
  position: relative;
}
.dr-backcard::before { content: ''; position: absolute; inset: 3px; clip-path: var(--shield); background: linear-gradient(165deg, #1a222b, #0a0e13); }
.dr-backcard > * { position: relative; }
.dr-cardwrap.chosen { animation: dr-choose .55s ease-in-out both; z-index: 2; }
.dr-cardwrap.other { animation: dr-out .45s ease-in both; pointer-events: none; }
.dr-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.dr-confirm { display: grid; justify-items: center; gap: 8px; margin: 8px auto 30px; }
.dr-confirm .gold-button.ready { animation: dr-pulse 1.4s ease-in-out infinite; }
@keyframes dr-field-in { from { opacity: 0; transform: scale(1.06); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes dr-slot-in { from { opacity: 0; transform: translate(-50%, -50%) scale(.55); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
.dr-bench .dr-slot { animation-name: dr-slot-in-flat; }
@keyframes dr-slot-in-flat { from { opacity: 0; transform: scale(.55); } to { opacity: 1; transform: none; } }
@keyframes dr-pulse { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(245,184,0,0)); } 50% { transform: scale(1.07); filter: drop-shadow(0 0 12px rgba(245,184,0,.95)); } }
@keyframes dr-reveal {
  0% { opacity: 0; transform: perspective(600px) rotateY(-100deg) scale(.55); }
  55% { opacity: 1; transform: perspective(600px) rotateY(10deg) scale(1.14); }
  100% { opacity: 1; transform: perspective(600px) rotateY(0) scale(1); }
}
@keyframes dr-flash { 0% { filter: drop-shadow(0 0 0 rgba(245,184,0,0)); } 35% { filter: drop-shadow(0 0 18px rgba(255,214,90,1)); } 100% { filter: drop-shadow(0 4px 8px rgba(0,0,0,.5)); } }
@keyframes dr-blur-in { from { background: rgba(4,7,10,0); backdrop-filter: blur(0); -webkit-backdrop-filter: blur(0); } to { background: rgba(4,7,10,.72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); } }
@keyframes dr-blur-out { to { opacity: 0; } }
@keyframes dr-zoom { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
@keyframes dr-flipin {
  0% { opacity: 0; transform: translateY(70px) rotateY(180deg) scale(.7); }
  25% { opacity: 1; }
  100% { opacity: 1; transform: translateY(0) rotateY(0) scale(1); }
}
@keyframes dr-choose { 0% { transform: scale(1); } 45% { transform: scale(1.14); filter: drop-shadow(0 0 22px rgba(255,214,90,1)); } 100% { transform: scale(1.08); filter: drop-shadow(0 0 16px rgba(255,214,90,.9)); } }
@keyframes dr-out { to { opacity: 0; transform: translateY(24px) scale(.85); } }
@media (prefers-reduced-motion: reduce) {
  .dr-field, .dr-slot, .dr-reveal, .dr-reveal-glow, .dr-overlay, .dr-sheet, .dr-cardwrap, .dr-flip, .dr-slot.next .dr-glow, .dr-confirm .gold-button.ready { animation-duration: .01ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
  .dr-page.dr-open .dr-stage { transform: none; }
}
`;

export function DraftField() {
  const line = 'rgba(255,255,255,.32)';
  return (
    <svg viewBox="0 0 100 114" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke={line} strokeWidth={0.5} vectorEffect="non-scaling-stroke">
        <rect x={4} y={4} width={92} height={106} vectorEffect="non-scaling-stroke" />
        <line x1={4} y1={57} x2={96} y2={57} vectorEffect="non-scaling-stroke" />
        <circle cx={50} cy={57} r={10} vectorEffect="non-scaling-stroke" />
        <rect x={25} y={4} width={50} height={17} vectorEffect="non-scaling-stroke" />
        <rect x={37} y={4} width={26} height={7} vectorEffect="non-scaling-stroke" />
        <rect x={25} y={93} width={50} height={17} vectorEffect="non-scaling-stroke" />
        <rect x={37} y={103} width={26} height={7} vectorEffect="non-scaling-stroke" />
      </g>
      <circle cx={50} cy={57} r={0.8} fill={line} />
    </svg>
  );
}

// Janela com as 3 cartas da posição: elas viram, sobem e brilham uma a uma; a escolhida pulsa e as outras saem
export function DraftPicker({
  title,
  subtitle,
  options,
  rerollsLeft,
  onReroll,
  onChoose,
  onClose,
}: {
  title: string;
  subtitle: string;
  options: Player[];
  rerollsLeft: number;
  onReroll: () => void;
  onChoose: (player: Player) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !chosen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chosen, onClose]);
  function pick(player: Player) {
    if (chosen) return;
    setChosen(player.id);
    timers.current.push(window.setTimeout(() => setClosing(true), 600));
    timers.current.push(window.setTimeout(() => onChoose(player), 880));
  }
  return (
    <div className={`dr-overlay ${closing ? 'closing' : ''}`} role="dialog" aria-label={title}>
      <div className="dr-sheet">
        <div className="eyebrow" style={{ justifyContent: 'center' }}>
          ESCOLHA SUA CARTA
        </div>
        <h2 style={{ margin: '6px 0 2px' }}>{title}</h2>
        <small style={{ opacity: 0.7 }}>{subtitle}</small>
        <div className="dr-cards">
          {options.map((player, index) => (
            <div
              key={player.id}
              className={`dr-cardwrap ${chosen === player.id ? 'chosen' : chosen ? 'other' : ''}`}
              style={{ '--i': index } as React.CSSProperties}
            >
              <div className="dr-flip" style={{ '--i': index } as React.CSSProperties}>
                <div className="dr-face dr-front">
                  <Card player={player} fluid onClick={() => pick(player)} />
                </div>
                <div className="dr-face dr-back" aria-hidden="true">
                  <div className="dr-backcard">
                    <span className="dr-logo"><LogoMark size={64} variant="full" /></span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {!options.length && <div className="empty-state">Nenhuma carta disponível para esta posição.</div>}
        <div className="dr-actions">
          <button
            type="button"
            className="outline-button"
            onClick={onReroll}
            disabled={rerollsLeft <= 0 || options.length === 0 || !!chosen}
            title="Sorteia 3 cartas novas para esta posição. Só dá para usar uma vez no draft."
          >
            🔄 {rerollsLeft > 0 ? 'Trocar cartas · 1 troca restante' : 'Troca já usada'}
          </button>
          <button type="button" className="outline-button" onClick={onClose} disabled={!!chosen}>
            Voltar ao campo
          </button>
        </div>
      </div>
    </div>
  );
}

export function DraftScreen({
  club,
  positions: positionList,
  selected,
  bench,
  withBench,
  optionsFor,
  onChoose,
  rerollsLeft,
  onReroll,
  onSwap,
  onConfirm,
  onBack,
}: {
  club: Team;
  positions: Position[];
  selected: Partial<Record<Position, Player>>;
  bench: Partial<Record<BenchSlot, Player>>;
  withBench: boolean;
  optionsFor: (slot: DraftSlot) => Player[];
  onChoose: (slot: DraftSlot, player: Player) => void;
  rerollsLeft: number;
  onReroll: (slot: DraftSlot) => void;
  onSwap: (a: DraftSlot, b: DraftSlot) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const [open, setOpen] = useState<DraftSlot | null>(null);
  // Posição escolhida para trocar com outra (toque em um jogador, depois em outro)
  const [swapFrom, setSwapFrom] = useState<DraftSlot | null>(null);
  const fits = (player: Player, position: Position) =>
    player.primary_position === position || (player.alternate_positions ?? []).includes(position);
  function tapFilled(position: DraftSlot) {
    if (swapFrom === null) setSwapFrom(position);
    else if (swapFrom === position) setSwapFrom(null);
    else {
      onSwap(swapFrom, position);
      setSwapFrom(null);
    }
  }
  const startersFilled = positionList.filter((position) => selected[position]).length;
  const benchFilled = BENCH_SLOTS.filter((slot) => bench[slot.id]).length;
  const total = positionList.length + (withBench ? BENCH_SLOTS.length : 0);
  const filled = startersFilled + (withBench ? benchFilled : 0);
  const ready = filled === total;
  // Sugere a próxima posição vazia (a que pulsa)
  const nextSlot: DraftSlot | undefined =
    positionList.find((position) => !selected[position]) ?? (withBench ? BENCH_SLOTS.find((slot) => !bench[slot.id])?.id : undefined);
  const openLabel = open
    ? BENCH_SLOTS.find((slot) => slot.id === open)?.title ?? positionNames[open as Position]
    : '';
  const openHint = open
    ? BENCH_SLOTS.find((slot) => slot.id === open)
      ? `Reserva · aceita ${BENCH_SLOTS.find((slot) => slot.id === open)!.positions.join(', ')}`
      : `${open} · ${filled}/${total} escolhidos`
    : '';
  const slotView = (slot: DraftSlot, label: string, index: number, style?: React.CSSProperties) => {
    const player = (BENCH_SLOTS.some((item) => item.id === slot) ? bench[slot as BenchSlot] : selected[slot as Position]) as
      | Player
      | undefined;
    const isStarter = !BENCH_SLOTS.some((item) => item.id === slot);
    // Jogador já escolhido (titular ou reserva): toque para trocar de lugar com outro, inclusive titular ↔ banco
    const swappable = !!player;
    const outOfPlace = swappable && isStarter && !fits(player as Player, slot as Position);
    const selectedForSwap = swappable && swapFrom === slot;
    const act = () => {
      if (swappable) tapFilled(slot);
      else if (!player) setOpen(slot);
    };
    return (
      <div
        key={slot}
        className={`dr-slot ${player ? 'filled' : ''} ${swappable ? 'swappable' : ''} ${selectedForSwap ? 'sel' : ''} ${
          swapFrom !== null && swappable && !selectedForSwap ? 'target' : ''
        } ${!player && nextSlot === slot ? 'next' : ''}`}
        style={{ ...style, '--i': index } as React.CSSProperties}
        role={player ? undefined : 'button'}
        tabIndex={player ? -1 : 0}
        aria-label={player ? `${label}: ${player.name}` : `Revelar cartas: ${label}`}
        onClick={player ? undefined : act}
        onKeyDown={(event) => {
          if (!player && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            act();
          }
        }}
      >
        {player ? (
          <span className="dr-glow dr-reveal-glow" key={player.id}>
            <span className="dr-reveal" style={{ display: 'block' }}>
              {/* O próprio card é o botão: no titular, tocar escolhe/troca de posição */}
              <Card player={player} fluid onClick={swappable ? act : undefined} />
            </span>
          </span>
        ) : (
          <span className="dr-glow">
            <span className="dr-empty">
              <span className="dr-logo"><LogoMark size={64} variant="full" /></span>
            </span>
          </span>
        )}
        <i className={`dr-label ${outOfPlace ? 'oop' : ''}`}>{outOfPlace ? `${label} · FORA −5` : label}</i>
      </div>
    );
  };
  return (
    <main className={`draft-page dr-page ${open ? 'dr-open' : ''}`}>
      <style>{cardCss}</style>
      <style>{draftCss}</style>
      <div className="dr-stage">
        <div className="draft-head">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={16} /> Clube
          </button>
          <div>
            <div className="eyebrow">ETAPA 02 / 03 · SEU ELENCO</div>
            <h2>
              DRAFT <em>{club.abbreviation}</em>
            </h2>
          </div>
          <div className="draft-progress">
            <strong>{filled}</strong>
            <span>/ {total} jogadores</span>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.75, margin: '0 0 14px' }}>
          Toque em uma posição para revelar 3 cartas e escolher uma.{withBench ? ' Depois monte o banco.' : ''}
          {startersFilled + benchFilled >= 2 && (
            <>
              <br />
              <b style={{ color: '#F5B800' }}>Mudar escalação:</b> toque em um jogador e depois em outro para trocar de lugar
              {withBench ? ' (também com o banco)' : ''}. Fora da posição de origem o jogador perde 5 de overall.
            </>
          )}
        </p>
        <div className="dr-field">
          <DraftField />
          {positionList.map((position, index) =>
            slotView(position, position, index, { left: `${FIELD_SPOTS[position].x}%`, top: `${FIELD_SPOTS[position].y}%` }),
          )}
        </div>
        {withBench && (
          <div className="dr-bench">
            <span className="eyebrow" style={{ justifyContent: 'center' }}>
              BANCO · {benchFilled}/{BENCH_SLOTS.length}
            </span>
            <div className="dr-bench-row">
              {BENCH_SLOTS.map((slot, index) => slotView(slot.id, slot.label, index))}
            </div>
          </div>
        )}
        <div className="dr-confirm">
          <button type="button" className={`gold-button large ${ready ? 'ready' : ''}`} disabled={!ready} onClick={onConfirm}>
            {ready ? 'Confirmar escalação' : `Faltam ${total - filled} para completar`}
          </button>
        </div>
      </div>
      {open && (
        <DraftPicker
          key={open}
          title={openLabel}
          subtitle={openHint}
          options={optionsFor(open)}
          rerollsLeft={rerollsLeft}
          onReroll={() => onReroll(open)}
          onChoose={(player) => {
            setOpen(null);
            onChoose(open, player);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </main>
  );
}
