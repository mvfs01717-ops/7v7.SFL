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
      <strong>{player.name}</strong>
      <div className="card-base" aria-label={player.team && isFreeAgent(player.team) ? 'Sem clube' : (player.team?.abbreviation ?? '7V7')}>
        <svg className="card-flag" viewBox="0 0 20 14" aria-hidden="true">
          <rect width="20" height="14" fill="#009c3b" />
          <path d="M10 1.6 18.2 7 10 12.4 1.8 7Z" fill="#ffdf00" />
          <circle cx="10" cy="7" r="3.2" fill="#002776" />
        </svg>
        {!(player.team && isFreeAgent(player.team)) && (
          <span className="card-crest" style={{ background: player.team?.secondary_color ?? '#F4F4F0', ['--cr' as string]: player.team?.primary_color ?? '#11161c', ['--ci' as string]: player.team?.secondary_color === '#F4F4F0' ? '#11161c' : '#fff' }}>
            <i>{player.team?.abbreviation ?? '7V7'}</i>
          </span>
        )}
      </div>
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

// Fundo das cartas: faixas de "cetim" diagonais com hachuras finas, linhas de luz curvas, brilho atrás do rosto e faíscas (SVG esticado ao cartão)
const CARD_ART_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 135" preserveAspectRatio="none"><defs><radialGradient id="b" cx=".56" cy=".3" r=".55"><stop offset="0" stop-color="#fffbe0" stop-opacity=".78"/><stop offset=".55" stop-color="#ffeaa0" stop-opacity=".25"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient><linearGradient id="r" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fff2b0" stop-opacity="0"/><stop offset=".45" stop-color="#fff6c8" stop-opacity="1"/><stop offset="1" stop-color="#ffe9a0" stop-opacity=".15"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4a00" stop-opacity=".0"/><stop offset="1" stop-color="#7a4a00" stop-opacity=".3"/></linearGradient><pattern id="h" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-58)"><rect width="1.5" height=".34" fill="#fff6cf"/></pattern><pattern id="g" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-58)"><rect y=".9" width="1.5" height=".22" fill="#8a5400"/></pattern><radialGradient id="v" cx=".5" cy=".42" r=".75"><stop offset=".55" stop-color="#8a5200" stop-opacity="0"/><stop offset="1" stop-color="#8a5200" stop-opacity=".34"/></radialGradient></defs><rect width="100" height="135" fill="url(#b)"/><path d="M-6 94 C 22 80, 52 72, 106 36 L106 56 C 62 84, 28 99, -6 112 Z" transform="translate(0 3.2)" fill="url(#s)" opacity=".9"/><path d="M-6 116 C 26 104, 60 92, 106 66 L106 78 C 66 98, 30 116, -6 128 Z" transform="translate(0 3.2)" fill="url(#s)" opacity=".9"/><path d="M30 -6 C 62 8, 86 26, 106 16 L106 40 C 84 44, 56 30, 22 8 Z" transform="translate(0 3.2)" fill="url(#s)" opacity=".9"/><path d="M-6 94 C 22 80, 52 72, 106 36 L106 56 C 62 84, 28 99, -6 112 Z" fill="url(#r)" opacity="0.55"/><path d="M-6 94 C 22 80, 52 72, 106 36 L106 56 C 62 84, 28 99, -6 112 Z" fill="url(#h)" opacity="0.5"/><path d="M-6 94 C 22 80, 52 72, 106 36 L106 56 C 62 84, 28 99, -6 112 Z" fill="url(#g)" opacity="0.28"/><path d="M-6 116 C 26 104, 60 92, 106 66 L106 78 C 66 98, 30 116, -6 128 Z" fill="url(#r)" opacity="0.38"/><path d="M-6 116 C 26 104, 60 92, 106 66 L106 78 C 66 98, 30 116, -6 128 Z" fill="url(#h)" opacity="0.35"/><path d="M-6 116 C 26 104, 60 92, 106 66 L106 78 C 66 98, 30 116, -6 128 Z" fill="url(#g)" opacity="0.19"/><path d="M30 -6 C 62 8, 86 26, 106 16 L106 40 C 84 44, 56 30, 22 8 Z" fill="url(#r)" opacity="0.42"/><path d="M30 -6 C 62 8, 86 26, 106 16 L106 40 C 84 44, 56 30, 22 8 Z" fill="url(#h)" opacity="0.55"/><path d="M30 -6 C 62 8, 86 26, 106 16 L106 40 C 84 44, 56 30, 22 8 Z" fill="url(#g)" opacity="0.30"/><path d="M-6 28 C 10 36, 22 34, 34 44 L34 56 C 18 50, 4 54, -6 46 Z" fill="url(#r)" opacity="0.22"/><path d="M-6 28 C 10 36, 22 34, 34 44 L34 56 C 18 50, 4 54, -6 46 Z" fill="url(#h)" opacity="0.3"/><path d="M-6 28 C 10 36, 22 34, 34 44 L34 56 C 18 50, 4 54, -6 46 Z" fill="url(#g)" opacity="0.17"/><path d="M-6 94.0 C 26 78.0, 58 64.0, 106 30.0" fill="none" stroke="#fff7d0" stroke-width="0.18" stroke-opacity="0.50"/><path d="M-6 101.2 C 26 85.2, 58 71.2, 106 37.2" fill="none" stroke="#fff7d0" stroke-width="0.26" stroke-opacity="0.46"/><path d="M-6 108.4 C 26 92.4, 58 78.4, 106 44.4" fill="none" stroke="#fff7d0" stroke-width="0.34" stroke-opacity="0.42"/><path d="M-6 115.6 C 26 99.6, 58 85.6, 106 51.6" fill="none" stroke="#fff7d0" stroke-width="0.18" stroke-opacity="0.38"/><path d="M-6 122.8 C 26 106.8, 58 92.8, 106 58.8" fill="none" stroke="#fff7d0" stroke-width="0.26" stroke-opacity="0.34"/><path d="M-6 130.0 C 26 114.0, 58 100.0, 106 66.0" fill="none" stroke="#fff7d0" stroke-width="0.34" stroke-opacity="0.30"/><path d="M-6 137.2 C 26 121.2, 58 107.2, 106 73.2" fill="none" stroke="#fff7d0" stroke-width="0.18" stroke-opacity="0.26"/><path d="M28 -2 C 60 8, 84 26, 106 14" fill="none" stroke="#fff7d0" stroke-width="0.2" stroke-opacity=".42"/><path d="M28 4 C 60 14, 84 32, 106 20" fill="none" stroke="#fff7d0" stroke-width="0.2" stroke-opacity=".42"/><path d="M28 10 C 60 20, 84 38, 106 26" fill="none" stroke="#fff7d0" stroke-width="0.2" stroke-opacity=".42"/><path d="M28 16 C 60 26, 84 44, 106 32" fill="none" stroke="#fff7d0" stroke-width="0.2" stroke-opacity=".42"/><path d="M-6 94 C 22 80, 52 72, 106 36" fill="none" stroke="#fffbe6" stroke-width=".7" stroke-opacity=".8"/><path d="M30 -6 C 62 8, 86 26, 106 16" fill="none" stroke="#fffbe6" stroke-width=".6" stroke-opacity=".7"/><rect width="100" height="135" fill="url(#v)"/><circle cx="33.4" cy="21.9" r="0.28" fill="#fff8d6" opacity="0.48"/><circle cx="53.4" cy="48.7" r="0.28" fill="#fff8d6" opacity="0.86"/><circle cx="23.2" cy="13.7" r="0.55" fill="#fff8d6" opacity="0.48"/><circle cx="11.5" cy="56.1" r="0.28" fill="#fff8d6" opacity="0.88"/><circle cx="62.3" cy="75.9" r="0.28" fill="#fff8d6" opacity="0.71"/><circle cx="40.3" cy="125.0" r="0.28" fill="#fff8d6" opacity="0.70"/><circle cx="15.5" cy="55.4" r="0.28" fill="#fff8d6" opacity="0.71"/><circle cx="55.7" cy="88.3" r="0.28" fill="#fff8d6" opacity="0.71"/><circle cx="63.1" cy="49.5" r="0.28" fill="#fff8d6" opacity="0.70"/><circle cx="61.2" cy="65.1" r="0.55" fill="#fff8d6" opacity="0.80"/><circle cx="46.8" cy="118.4" r="0.42" fill="#fff8d6" opacity="0.58"/><circle cx="77.7" cy="90.4" r="0.34" fill="#fff8d6" opacity="0.49"/><circle cx="31.2" cy="64.9" r="0.42" fill="#fff8d6" opacity="0.78"/><circle cx="30.1" cy="125.5" r="0.28" fill="#fff8d6" opacity="0.68"/><circle cx="18.5" cy="45.8" r="0.55" fill="#fff8d6" opacity="0.64"/><circle cx="93.4" cy="12.7" r="0.42" fill="#fff8d6" opacity="0.60"/><circle cx="35.9" cy="65.1" r="0.55" fill="#fff8d6" opacity="0.48"/><circle cx="11.8" cy="36.7" r="0.28" fill="#fff8d6" opacity="0.48"/><circle cx="68.9" cy="83.9" r="0.55" fill="#fff8d6" opacity="0.58"/><circle cx="39.3" cy="86.6" r="0.28" fill="#fff8d6" opacity="0.87"/><circle cx="36.4" cy="79.4" r="0.55" fill="#fff8d6" opacity="0.48"/><circle cx="75.2" cy="19.2" r="0.34" fill="#fff8d6" opacity="0.63"/><path d="M14 16.4 L14.35 17.65 L15.6 18 L14.35 18.35 L14 19.6 L13.65 18.35 L12.4 18 L13.65 17.65 Z" fill="#fffbe6" opacity=".85"/><path d="M88 10.4 L88.35 11.65 L89.6 12 L88.35 12.35 L88 13.6 L87.65 12.35 L86.4 12 L87.65 11.65 Z" fill="#fffbe6" opacity=".85"/><path d="M80 102.4 L80.35 103.65 L81.6 104 L80.35 104.35 L80 105.6 L79.65 104.35 L78.4 104 L79.65 103.65 Z" fill="#fffbe6" opacity=".85"/><path d="M10 94.4 L10.35 95.65 L11.6 96 L10.35 96.35 L10 97.6 L9.65 96.35 L8.4 96 L9.65 95.65 Z" fill="#fffbe6" opacity=".85"/></svg>';
const CARD_ART = `url("data:image/svg+xml,${encodeURIComponent(CARD_ART_SVG)}") 0 0 / 100% 100% no-repeat`;

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
  /* Fundo atrás do jogador (ouro polido, no estilo das cartas oficiais de coleção): arte em SVG + luz suave e sombra na base */
  --card-art: ${CARD_ART};
  --card-pat:
    radial-gradient(ellipse 60% 40% at 56% 28%, rgba(255,247,222,.42), rgba(255,247,222,0) 72%),
    linear-gradient(0deg, rgba(96,62,8,.3), rgba(0,0,0,0) 36%);
}
.cd-art { --a: #f7e8bd; --b: #e9c875; --c: #b98a2e; background: var(--card-art), var(--card-pat), linear-gradient(165deg, var(--a), var(--b) 56%, var(--c)); }
.cd-art.special { --a: #fbeeb4; --b: #efcb55; --c: #c4921a; }
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
button.player-card.player-card::before { background: var(--card-art), var(--card-pat), var(--face); }
button.player-card.player-card::after { background: linear-gradient(118deg, rgba(255,255,255,.4) 0, rgba(255,255,255,0) 40%, rgba(255,255,255,.12) 64%, rgba(255,255,255,0) 78%); }
button.player-card.player-card.gold { --frame: linear-gradient(160deg, #f6df9c, #8c6516 52%, #d9b255 78%, #7d5810); --face: linear-gradient(165deg, #f8ebc4, #efd48f 28%, #e6c066 56%, #c99a3a 82%, #a87a20); --ink: #2b1d00; }
button.player-card.player-card.special { --frame: linear-gradient(160deg, #fff3b8, #a97a0a 55%, #e7c24a); --face: linear-gradient(165deg, #fbeeb4, #f2d060 36%, #e3b030 70%, #bf8e14); --ink: #2b1d00; }
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
button.player-card.player-card strong {
  left: 0;
  right: 0;
  top: 57%;
  padding: 2.4cqw 6%;
  background: linear-gradient(180deg, rgba(110,72,10,.14), rgba(110,72,10,.3));
  border-top: 1px solid rgba(100,66,8,.5);
  border-bottom: 1px solid rgba(255,244,205,.6);
  color: var(--ink);
  font-family: 'Bebas Neue', Inter, sans-serif;
  font-weight: 400;
  font-size: 12px;
  font-size: 12.5cqw;
  line-height: 1;
  letter-spacing: .04em;
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(255,244,205,.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
button.player-card.player-card .card-base { left: 0; right: 0; top: 71%; display: flex; align-items: center; justify-content: center; gap: 5cqw; }
button.player-card.player-card .card-flag { width: 14cqw; height: 9.8cqw; border-radius: 1.1cqw; box-shadow: 0 0 0 .6cqw rgba(100,66,8,.55), 0 1px 2px rgba(0,0,0,.3); }
button.player-card.player-card .card-crest { position: relative; width: 11cqw; height: 12.6cqw; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); display: grid; place-items: center; }
button.player-card.player-card .card-crest::before { content: ''; position: absolute; inset: .9cqw .9cqw 1cqw; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); background: var(--cr); }
button.player-card.player-card .card-crest i { position: relative; margin-top: -1.2cqw; font: 900 normal 3.9cqw/1 Inter, sans-serif; letter-spacing: 0; color: var(--ci); }
button.player-card.player-card .card-alternates { left: 8%; right: 8%; top: 84.5%; color: var(--ink); opacity: .62; font-size: 6px; font-size: 6.2cqw; font-weight: 700; margin: 0; }
`;
