import { useEffect, useRef, type CSSProperties } from 'react';
import { colorForOverall, isFreeAgent } from '@/lib/game/helpers';
import { positionNames, type Player, type Team } from '@/lib/game/types';

function CardFace({
  player,
  selected,
  onClick,
  compact = false,
  fluid = false,
}: {
  player: Player;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  fluid?: boolean;
}) {
  // Se o jogador tem a imagem da carta, mostra ela dentro de uma moldura
  if (player.image_url) {
    const frames = {
      special: 'linear-gradient(160deg, #fff6c2, #c98a00)',
      gold: 'linear-gradient(160deg, #f7e39a, #a77a12)',
      silver: 'linear-gradient(160deg, #f4f6f8, #808b97)',
      bronze: 'linear-gradient(160deg, #f6c096, #8a4a22)',
    };
    const frame = selected ? 'linear-gradient(160deg, #ffffff, #f5b800)' : frames[colorForOverall(player.overall) as keyof typeof frames];
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        style={{
          position: 'relative',
          width: fluid ? '100%' : compact ? 150 : 176,
          aspectRatio: '0.74',
          padding: 0,
          border: 0,
          background: frame,
          clipPath: SHIELD_CLIP,
          cursor: onClick ? 'pointer' : 'default',
          transform: selected ? 'translateY(-4px)' : undefined,
          transition: 'transform .2s ease',
        }}
      >
        <span
          className={`cd-art ${colorForOverall(player.overall)}`}
          style={{
            position: 'absolute',
            inset: selected ? 5 : 3,
            clipPath: SHIELD_CLIP,
            display: 'grid',
            placeItems: 'center',
            padding: '5% 6% 13%',
            boxSizing: 'border-box',
          }}
        >
          <img
            src={player.image_url}
            alt={`${player.name}, overall ${player.overall}`}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        </span>
      </button>
    );
  }
  const tone = colorForOverall(player.overall);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`player-card ${tone} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}
    >
      <div className="card-top">
        <span>{player.overall}</span>
        <span className="card-position">{player.primary_position}</span>
      </div>
      <div className="player-avatar">{player.name.slice(0, 1).toUpperCase()}</div>
      <strong>{player.name}</strong>
      <small>{player.team && isFreeAgent(player.team) ? 'SEM CLUBE' : (player.team?.abbreviation ?? '7V7')}</small>
      <div className="card-alternates">
        {player.alternate_positions.length
          ? player.alternate_positions.join(' · ')
          : positionNames[player.primary_position]}
      </div>
    </button>
  );
}

// ---- Carta 3D: inclina com o mouse (PC) ou com o giroscópio (celular), com brilho deslizando na superfície ----
const MAX_TILT = 14;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Um único ouvinte de giroscópio para todas as cartas da tela (cada carta só se inscreve enquanto está visível)
const gyroSubs = new Set<(x: number, y: number) => void>();
let gyroStarted = false;
function onOrientation(event: DeviceOrientationEvent) {
  if (event.beta === null || event.gamma === null) return;
  // gamma: esquerda/direita; beta: frente/trás (~50° é o celular na mão, de leve inclinado)
  const y = clamp(event.gamma / 28, -1, 1);
  const x = clamp(-(event.beta - 50) / 28, -1, 1);
  gyroSubs.forEach((fn) => fn(x, y));
}
function startGyro() {
  if (gyroStarted || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
  gyroStarted = true;
  const api = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof api.requestPermission === 'function') {
    // iPhone: o sistema só deixa pedir permissão depois de um toque do jogador
    const ask = () => {
      api.requestPermission?.().then((answer) => {
        if (answer === 'granted') window.addEventListener('deviceorientation', onOrientation);
      }).catch(() => undefined);
    };
    window.addEventListener('pointerdown', ask, { once: true });
  } else window.addEventListener('deviceorientation', onOrientation);
}

export function Card(props: {
  player: Player;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  fluid?: boolean;
  // Desliga a inclinação 3D (ligada por padrão)
  tilt?: boolean;
}) {
  const { tilt = true, ...faceProps } = props;
  const ref = useRef<HTMLDivElement>(null);
  const hasImage = !!props.player.image_url;

  const setTilt = (el: HTMLElement, x: number, y: number, active: boolean) => {
    // x e y vão de -1 a 1 (x: cima/baixo, y: esquerda/direita)
    el.style.setProperty('--rx', `${(x * MAX_TILT).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(y * MAX_TILT).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${((y + 1) * 50).toFixed(1)}%`);
    el.style.setProperty('--my', `${((x + 1) * 50).toFixed(1)}%`);
    el.dataset.on = active ? '1' : '0';
  };

  useEffect(() => {
    const el = ref.current;
    if (!tilt || !el || typeof window === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    // Celular (sem mouse): usa o giroscópio, só enquanto a carta está na tela
    if (!window.matchMedia?.('(hover: none)').matches || !('IntersectionObserver' in window)) return undefined;
    startGyro();
    const follow = (x: number, y: number) => setTilt(el, x, y, true);
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) gyroSubs.add(follow);
      else gyroSubs.delete(follow);
    });
    watcher.observe(el);
    return () => {
      watcher.disconnect();
      gyroSubs.delete(follow);
    };
  }, [tilt]);

  if (!tilt) return <CardFace {...faceProps} />;

  const outer: CSSProperties = hasImage ? { width: props.fluid ? '100%' : props.compact ? 150 : 176 } : {};
  return (
    <div
      ref={ref}
      className="tilt-card"
      style={outer}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        const box = event.currentTarget.getBoundingClientRect();
        const px = clamp((event.clientX - box.left) / box.width, 0, 1) * 2 - 1;
        const py = clamp((event.clientY - box.top) / box.height, 0, 1) * 2 - 1;
        setTilt(event.currentTarget, -py, px, true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setTilt(event.currentTarget, 0, 0, false);
      }}
    >
      <div className="tilt-body">
        <CardFace {...faceProps} fluid={hasImage ? true : faceProps.fluid} />
        <i className="tilt-glare" aria-hidden="true" />
      </div>
    </div>
  );
}

export function LogoMark({ size = 40, variant = 'seven' }: { size?: number; uid?: string; variant?: 'seven' | 'full' }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="7v7 Brasil"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polygon points="66,66 446,66 386,446 126,446" fill="#F5B800" />
      {variant === 'full' ? (
        <g fill="#0B1016" transform="translate(256 255) scale(1.12) translate(-256 -255)">
          <polygon points="132,160 202,160 202,184 170,350 138,350 168,184 132,184" />
          <polygon points="214,160 242,160 256,288 270,160 298,160 282,350 230,350" />
          <polygon points="310,160 380,160 380,184 348,350 316,350 346,184 310,184" />
        </g>
      ) : (
        <polygon points="196,135 316,135 316,163 244,385 206,385 276,163 196,163" fill="#0B1016" />
      )}
    </svg>
  );
}

export function Badge({ team }: { team: Team }) {
  return (
    <div
      className="club-badge"
      style={{
        background: team.primary_color,
        borderColor: team.secondary_color,
        color: team.secondary_color === '#F4F4F0' ? '#11161c' : '#fff',
      }}
    >
      {team.abbreviation}
    </div>
  );
}

export function TeamMark({ team }: { team: Team }) {
  return (
    <div className="team-mark">
      <Badge team={team} />
      <span>{team.name}</span>
    </div>
  );
}

// Evita a rolagem para os lados no celular e deixa a tela inicial mais compacta
// Formato das cartas: escudo com topo reto, laterais retas e a parte de baixo afunilando até uma ponta
export const SHIELD_CLIP = 'polygon(0.0% 5.2%, 0.2% 3.9%, 0.9% 2.6%, 2.1% 1.5%, 3.5% 0.7%, 5.2% 0.2%, 7.0% 0.0%, 93.0% 0.0%, 94.8% 0.2%, 96.5% 0.7%, 97.9% 1.5%, 99.1% 2.6%, 99.8% 3.9%, 100.0% 5.2%, 100.0% 66.0%, 99.6% 69.5%, 98.2% 72.8%, 96.1% 76.1%, 93.3% 79.3%, 89.7% 82.3%, 85.5% 85.2%, 80.7% 88.1%, 75.4% 90.7%, 69.6% 93.3%, 63.4% 95.7%, 56.9% 97.9%, 50.0% 100.0%, 50.0% 100.0%, 43.1% 97.9%, 36.6% 95.7%, 30.4% 93.3%, 24.6% 90.7%, 19.3% 88.1%, 14.5% 85.2%, 10.3% 82.3%, 6.7% 79.3%, 3.9% 76.1%, 1.8% 72.8%, 0.4% 69.5%, 0.0% 66.0%)';

export const cardCss = `
.tilt-card { position: relative; width: 100%; perspective: 760px; --rx: 0deg; --ry: 0deg; --mx: 50%; --my: 50%; }
.tilt-body { position: relative; transform-style: preserve-3d; transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .5s cubic-bezier(.2,.8,.2,1), filter .3s ease; will-change: transform; }
.tilt-card[data-on='1'] .tilt-body { transition: transform .09s linear, filter .3s ease; filter: drop-shadow(0 14px 14px rgba(0,0,0,.45)); }
.tilt-glare { position: absolute; inset: 0; clip-path: var(--shield); pointer-events: none; z-index: 5; opacity: 0; transition: opacity .35s ease;
  background:
    radial-gradient(circle at var(--mx) var(--my), rgba(255,255,255,.55), rgba(255,255,255,0) 46%),
    linear-gradient(112deg, rgba(255,255,255,0) calc(var(--mx) - 22%), rgba(255,244,196,.5) var(--mx), rgba(255,255,255,0) calc(var(--mx) + 22%));
  mix-blend-mode: soft-light; }
.tilt-card[data-on='1'] .tilt-glare { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .tilt-body { transform: none !important; } .tilt-glare { display: none; } }

:root {
  --shield: ${SHIELD_CLIP};
  /* Fundo atrás do jogador: brilho central, anéis, faixas diagonais e sombra na base (original, estilo cartas de coleção) */
  --card-pat:
    radial-gradient(ellipse 70% 46% at 50% 34%, rgba(255,255,255,.62), rgba(255,255,255,0) 70%),
    repeating-radial-gradient(circle at 50% 36%, rgba(255,255,255,.16) 0 1.5px, rgba(255,255,255,0) 1.5px 15px),
    linear-gradient(118deg, rgba(255,255,255,0) 14%, rgba(255,255,255,.26) 14% 27%, rgba(255,255,255,0) 27% 100%),
    linear-gradient(118deg, rgba(255,255,255,0) 58%, rgba(255,255,255,.16) 58% 66%, rgba(255,255,255,0) 66% 100%),
    linear-gradient(0deg, rgba(0,0,0,.2), rgba(0,0,0,0) 38%);
}
.cd-art { --a: #f7dd8a; --b: #dfae38; --c: #bb8a1d; background: var(--card-pat), linear-gradient(165deg, var(--a), var(--b) 58%, var(--c)); }
.cd-art.special { --a: #fff0a6; --b: #f2c230; --c: #cf9a12; }
.cd-art.silver { --a: #f4f6f9; --b: #c3cad3; --c: #a3acb7; }
.cd-art.bronze { --a: #f4bb8f; --b: #d7864f; --c: #b66a38; }
button.player-card.player-card {
  --frame: linear-gradient(160deg, #e6e9ee, #8f98a4);
  --face: linear-gradient(165deg, #f4f6f9, #c3cad3 58%, #a3acb7);
  --ink: #1b2128;
  position: relative;
  container-type: inline-size;
  width: 100%;
  aspect-ratio: 0.74;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  clip-path: var(--shield);
  background: var(--frame);
  color: var(--ink);
  overflow: hidden;
  box-shadow: none;
  text-align: center;
  transition: transform .2s ease, filter .2s ease;
}
button.player-card.player-card::before,
button.player-card.player-card::after {
  content: '';
  position: absolute;
  inset: 3px;
  clip-path: var(--shield);
  pointer-events: none;
}
button.player-card.player-card::before { background: var(--card-pat), var(--face); }
button.player-card.player-card::after { background: linear-gradient(118deg, rgba(255,255,255,.4) 0, rgba(255,255,255,0) 40%, rgba(255,255,255,.12) 64%, rgba(255,255,255,0) 78%); }
button.player-card.player-card.gold { --frame: linear-gradient(160deg, #f7e39a, #a77a12); --face: linear-gradient(165deg, #f7dd8a, #dfae38 58%, #bb8a1d); --ink: #2b1d00; }
button.player-card.player-card.special { --frame: linear-gradient(160deg, #fff6c2, #c98a00); --face: linear-gradient(165deg, #fff0a6, #f2c230 52%, #cf9a12); --ink: #2b1d00; }
button.player-card.player-card.silver { --frame: linear-gradient(160deg, #f4f6f8, #808b97); }
button.player-card.player-card.bronze { --frame: linear-gradient(160deg, #f6c096, #8a4a22); --face: linear-gradient(165deg, #f4bb8f, #d7864f 58%, #b66a38); --ink: #2a1408; }
button.player-card.player-card:not(:disabled):hover { transform: translateY(-4px); filter: brightness(1.07); box-shadow: none; border-color: transparent; }
button.player-card.player-card.selected { --frame: linear-gradient(160deg, #ffffff, #f5b800); transform: translateY(-4px); filter: brightness(1.1); box-shadow: none; border-color: transparent; }
button.player-card.player-card.selected::before, button.player-card.player-card.selected::after { inset: 5px; }
button.player-card.player-card > * { position: absolute; z-index: 1; margin: 0; }
button.player-card.player-card .card-top {
  left: 14%;
  top: 9%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 1px;
  color: var(--ink);
  font-size: 26px;
  font-size: 22cqw;
  line-height: .9;
}
button.player-card.player-card .card-position { font-size: 12px; font-size: 11cqw; color: var(--ink); font-weight: 800; letter-spacing: .02em; }
button.player-card.player-card .player-avatar {
  left: 42%;
  top: 10%;
  width: 46%;
  height: auto;
  aspect-ratio: 1;
  background: rgba(255,255,255,.34);
  border: 2px solid rgba(0,0,0,.22);
  color: var(--ink);
  font-size: 30px;
  font-size: 26cqw;
}
button.player-card.player-card strong {
  left: 7%;
  right: 7%;
  top: 60%;
  padding-top: 2.5cqw;
  border-top: 1px solid rgba(0,0,0,.28);
  color: var(--ink);
  font-size: 11px;
  font-size: 10cqw;
  letter-spacing: .02em;
}
button.player-card.player-card small { left: 0; right: 0; top: 72%; color: var(--ink); opacity: .75; font-size: 8px; font-size: 8cqw; margin: 0; }
button.player-card.player-card .card-alternates { left: 8%; right: 8%; top: 81%; color: var(--ink); opacity: .6; font-size: 7px; font-size: 6.6cqw; margin: 0; }
`;
