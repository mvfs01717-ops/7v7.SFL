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
      title={player.alternate_positions.length ? `${player.name} · também joga de ${player.alternate_positions.join(', ')}` : `${player.name} · ${positionNames[player.primary_position]}`}
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
// Formato das cartas (modelo Gold Rare): topo em arco com ombros chanfrados, laterais retas e a base afunilando até uma ponta
export const SHIELD_CLIP = 'polygon(0.0% 13.5%, 14.6% 6.0%, 17.1% 5.3%, 19.5% 4.5%, 22.0% 3.9%, 24.5% 3.3%, 27.0% 2.7%, 29.5% 2.2%, 32.1% 1.7%, 34.6% 1.3%, 37.2% 1.0%, 39.7% 0.6%, 42.3% 0.4%, 44.9% 0.2%, 47.4% 0.1%, 50.0% 0.0%, 52.6% 0.1%, 55.1% 0.2%, 57.7% 0.4%, 60.3% 0.6%, 62.8% 1.0%, 65.4% 1.3%, 67.9% 1.7%, 70.5% 2.2%, 73.0% 2.7%, 75.5% 3.3%, 78.0% 3.9%, 80.5% 4.5%, 82.9% 5.3%, 85.4% 6.0%, 100.0% 13.5%, 100.0% 84.0%, 99.8% 85.2%, 99.2% 86.4%, 98.1% 87.5%, 96.7% 88.7%, 94.8% 89.7%, 92.6% 90.8%, 90.0% 91.9%, 87.0% 92.9%, 83.6% 93.8%, 79.9% 94.8%, 75.8% 95.7%, 71.3% 96.6%, 66.5% 97.5%, 61.3% 98.4%, 55.8% 99.2%, 50.0% 100.0%, 44.2% 99.2%, 38.7% 98.4%, 33.5% 97.5%, 28.7% 96.6%, 24.2% 95.7%, 20.1% 94.8%, 16.4% 93.8%, 13.0% 92.9%, 10.0% 91.9%, 7.4% 90.8%, 5.2% 89.7%, 3.3% 88.7%, 1.9% 87.5%, 0.8% 86.4%, 0.2% 85.2%, 0.0% 84.0%)';

// Fundo das cartas: ouro com riscos finos diagonais, facetas escuras com arestas luminosas, faixa do nome, moldura interna e brilhos (SVG esticado ao cartão)
const CARD_ART_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 135" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c8" stop-opacity=".42"/><stop offset=".5" stop-color="#fff3c8" stop-opacity="0"/><stop offset="1" stop-color="#5a3600" stop-opacity=".22"/></linearGradient><radialGradient id="r" cx=".3" cy=".2" r=".6"><stop offset="0" stop-color="#fffbe2" stop-opacity=".5"/><stop offset="1" stop-color="#fffbe2" stop-opacity="0"/></radialGradient><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset=".72" stop-color="#4a2c00" stop-opacity="0"/><stop offset="1" stop-color="#4a2c00" stop-opacity=".3"/></linearGradient></defs><rect width="100" height="135" fill="url(#g)"/><rect width="100" height="135" fill="url(#r)"/><line x1="35.7" y1="55.0" x2="73.1" y2="23.1" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.21"/><line x1="41.1" y1="60.9" x2="71.9" y2="29.3" stroke="#fff6d2" stroke-width="0.2" stroke-opacity="0.19"/><line x1="43.5" y1="82.8" x2="73.2" y2="59.0" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.49"/><line x1="53.9" y1="59.7" x2="67.5" y2="45.1" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.16"/><line x1="12.1" y1="28.3" x2="23.6" y2="18.5" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.35"/><line x1="12.6" y1="27.6" x2="29.8" y2="9.2" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.30"/><line x1="20.0" y1="91.8" x2="62.4" y2="61.9" stroke="#fff6d2" stroke-width="0.2" stroke-opacity="0.25"/><line x1="15.7" y1="32.3" x2="29.1" y2="22.4" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.18"/><line x1="21.2" y1="13.6" x2="32.8" y2="4.7" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.22"/><line x1="76.9" y1="47.5" x2="115.3" y2="13.6" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.34"/><line x1="12.9" y1="64.7" x2="32.6" y2="46.5" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.49"/><line x1="63.2" y1="17.9" x2="79.6" y2="1.2" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.31"/><line x1="38.8" y1="65.3" x2="55.1" y2="51.7" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.29"/><line x1="29.5" y1="41.2" x2="64.7" y2="3.4" stroke="#fff6d2" stroke-width="0.2" stroke-opacity="0.50"/><line x1="-3.2" y1="23.7" x2="37.3" y2="-8.6" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.16"/><line x1="8.2" y1="45.1" x2="19.4" y2="36.2" stroke="#fff6d2" stroke-width="0.2" stroke-opacity="0.28"/><line x1="1.7" y1="25.5" x2="27.8" y2="-2.3" stroke="#fff6d2" stroke-width="0.2" stroke-opacity="0.27"/><line x1="35.8" y1="88.6" x2="61.0" y2="68.2" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.21"/><line x1="8.9" y1="84.3" x2="41.6" y2="53.3" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.20"/><line x1="51.6" y1="54.5" x2="81.6" y2="27.9" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.36"/><line x1="32.9" y1="16.7" x2="45.8" y2="8.2" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.41"/><line x1="30.2" y1="43.3" x2="67.2" y2="12.2" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.47"/><line x1="82.9" y1="18.6" x2="108.4" y2="-1.1" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.24"/><line x1="77.6" y1="25.1" x2="88.2" y2="15.1" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.23"/><line x1="-0.8" y1="31.7" x2="27.7" y2="12.9" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.27"/><line x1="75.2" y1="90.4" x2="106.2" y2="66.7" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.35"/><line x1="78.1" y1="47.9" x2="98.4" y2="29.2" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.15"/><line x1="52.3" y1="48.5" x2="83.0" y2="20.3" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.17"/><line x1="44.1" y1="69.9" x2="82.8" y2="41.1" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.43"/><line x1="77.4" y1="37.6" x2="110.4" y2="14.9" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.48"/><line x1="-2.3" y1="50.0" x2="9.2" y2="41.1" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.35"/><line x1="49.8" y1="14.7" x2="81.9" y2="-6.2" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.40"/><line x1="30.0" y1="69.7" x2="57.3" y2="46.2" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.33"/><line x1="41.3" y1="34.1" x2="53.2" y2="21.4" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.32"/><line x1="50.3" y1="85.3" x2="66.5" y2="68.0" stroke="#fff6d2" stroke-width="0.2" stroke-opacity="0.19"/><line x1="50.1" y1="51.5" x2="81.6" y2="22.9" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.32"/><line x1="16.7" y1="42.0" x2="35.2" y2="27.5" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.46"/><line x1="29.6" y1="57.0" x2="48.0" y2="38.5" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.27"/><line x1="75.6" y1="11.4" x2="89.4" y2="2.4" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.18"/><line x1="37.4" y1="85.8" x2="71.5" y2="55.5" stroke="#fff6d2" stroke-width="0.26" stroke-opacity="0.38"/><line x1="59.5" y1="78.7" x2="87.3" y2="53.2" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.24"/><line x1="49.7" y1="65.0" x2="68.0" y2="48.4" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.37"/><line x1="31.5" y1="24.0" x2="62.9" y2="-5.7" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.43"/><line x1="83.6" y1="17.7" x2="97.6" y2="6.1" stroke="#fff6d2" stroke-width="0.2" stroke-opacity="0.49"/><line x1="56.6" y1="24.7" x2="79.5" y2="2.3" stroke="#fff6d2" stroke-width="0.12" stroke-opacity="0.41"/><line x1="43.1" y1="11.0" x2="61.4" y2="-2.3" stroke="#fff6d2" stroke-width="0.16" stroke-opacity="0.28"/><line x1="62.3" y1="82.5" x2="77.7" y2="71.8" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.20"/><line x1="6.0" y1="46.3" x2="35.5" y2="25.6" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.15"/><line x1="43.3" y1="80.3" x2="77.5" y2="56.7" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.16"/><line x1="50.4" y1="26.4" x2="81.9" y2="3.3" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.19"/><line x1="56.0" y1="27.1" x2="93.0" y2="1.9" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.24"/><line x1="40.6" y1="73.3" x2="62.1" y2="58.2" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.22"/><line x1="24.6" y1="16.6" x2="47.9" y2="-2.5" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.21"/><line x1="36.4" y1="12.3" x2="65.9" y2="-17.5" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.21"/><line x1="9.7" y1="36.8" x2="39.2" y2="8.0" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.12"/><line x1="38.9" y1="67.9" x2="72.8" y2="41.6" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.23"/><line x1="36.9" y1="85.9" x2="50.5" y2="73.1" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.17"/><line x1="19.7" y1="68.3" x2="47.7" y2="45.0" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.22"/><line x1="42.6" y1="34.9" x2="65.5" y2="18.4" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.23"/><line x1="12.7" y1="78.1" x2="48.8" y2="48.0" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.18"/><line x1="12.1" y1="52.9" x2="37.1" y2="32.8" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.10"/><line x1="77.4" y1="51.3" x2="100.6" y2="34.2" stroke="#7a4d08" stroke-width=".14" stroke-opacity="0.18"/><polygon points="10.4,85.9 97.9,24.5 97.9,38.4 29.9,87.4" fill="#6b4306" fill-opacity=".15"/><polygon points="71.5,43 86,10 99.5,20 99.5,38.4" fill="#4a2c00" fill-opacity=".36"/><polygon points="29.9,90.5 97.9,38.4 99.5,38.4 99.5,90.5" fill="#5a3500" fill-opacity=".3"/><polygon points="98,38.4 100,36 100,90.5 91.7,90.5" fill="#3a2200" fill-opacity=".22"/><line x1="10.4" y1="85.9" x2="97.9" y2="24.5" stroke="#fff1bd" stroke-width="0.5" stroke-opacity="0.8"/><line x1="29.9" y1="87.4" x2="97.9" y2="38.4" stroke="#fff1bd" stroke-width="0.55" stroke-opacity="0.9"/><line x1="71.5" y1="43" x2="86" y2="10" stroke="#fff1bd" stroke-width="0.45" stroke-opacity="0.8"/><line x1="86.8" y1="10" x2="99.4" y2="20" stroke="#fff1bd" stroke-width="0.4" stroke-opacity="0.8"/><line x1="98" y1="38.4" x2="91.7" y2="90.5" stroke="#fff1bd" stroke-width="0.5" stroke-opacity="0.8"/><line x1="97.9" y1="24.5" x2="86" y2="10" stroke="#fff1bd" stroke-width="0.25" stroke-opacity="0.5"/><circle cx="63.9" cy="73.9" r="0.2" fill="#ffe9a8" opacity="0.92"/><circle cx="61.7" cy="85.9" r="0.45" fill="#ffe9a8" opacity="0.58"/><circle cx="59.9" cy="80.4" r="0.45" fill="#ffe9a8" opacity="0.71"/><circle cx="78.4" cy="88.8" r="0.2" fill="#ffe9a8" opacity="0.55"/><circle cx="73.6" cy="71.2" r="0.28" fill="#ffe9a8" opacity="0.88"/><circle cx="72.2" cy="82.6" r="0.28" fill="#ffe9a8" opacity="0.91"/><circle cx="91.5" cy="48.1" r="0.28" fill="#ffe9a8" opacity="0.89"/><circle cx="59.1" cy="79.1" r="0.28" fill="#ffe9a8" opacity="0.55"/><circle cx="73.3" cy="79.5" r="0.2" fill="#ffe9a8" opacity="0.55"/><circle cx="77.1" cy="85.4" r="0.36" fill="#ffe9a8" opacity="0.51"/><circle cx="64.9" cy="77.4" r="0.28" fill="#ffe9a8" opacity="0.85"/><circle cx="82.6" cy="69.9" r="0.45" fill="#ffe9a8" opacity="0.52"/><circle cx="88.0" cy="89.5" r="0.2" fill="#ffe9a8" opacity="0.74"/><circle cx="55.7" cy="71.0" r="0.2" fill="#ffe9a8" opacity="0.87"/><circle cx="81.0" cy="59.1" r="0.28" fill="#ffe9a8" opacity="0.75"/><circle cx="88.1" cy="83.5" r="0.45" fill="#ffe9a8" opacity="0.73"/><circle cx="53.5" cy="77.6" r="0.36" fill="#ffe9a8" opacity="0.91"/><circle cx="81.4" cy="78.5" r="0.45" fill="#ffe9a8" opacity="0.52"/><circle cx="91.3" cy="89.5" r="0.2" fill="#ffe9a8" opacity="0.57"/><circle cx="95.2" cy="72.6" r="0.36" fill="#ffe9a8" opacity="0.56"/><circle cx="82.5" cy="71.7" r="0.2" fill="#ffe9a8" opacity="0.50"/><circle cx="47.3" cy="85.1" r="0.45" fill="#ffe9a8" opacity="0.93"/><circle cx="69.2" cy="89.7" r="0.45" fill="#ffe9a8" opacity="0.85"/><circle cx="94.2" cy="46.3" r="0.45" fill="#ffe9a8" opacity="0.94"/><circle cx="89.0" cy="66.2" r="0.2" fill="#ffe9a8" opacity="0.66"/><circle cx="66.6" cy="63.1" r="0.36" fill="#ffe9a8" opacity="0.73"/><circle cx="56.9" cy="84.7" r="0.45" fill="#ffe9a8" opacity="0.48"/><circle cx="98.2" cy="87.1" r="0.2" fill="#ffe9a8" opacity="0.85"/><circle cx="47.3" cy="77.3" r="0.2" fill="#ffe9a8" opacity="0.71"/><circle cx="94.7" cy="75.6" r="0.45" fill="#ffe9a8" opacity="0.52"/><circle cx="96.2" cy="50.7" r="0.2" fill="#ffe9a8" opacity="0.48"/><circle cx="89.4" cy="56.5" r="0.28" fill="#ffe9a8" opacity="0.51"/><circle cx="60.6" cy="72.7" r="0.45" fill="#ffe9a8" opacity="0.75"/><circle cx="74.1" cy="73.5" r="0.36" fill="#ffe9a8" opacity="0.84"/><circle cx="66.6" cy="89.9" r="0.36" fill="#ffe9a8" opacity="0.82"/><circle cx="91.6" cy="78.8" r="0.36" fill="#ffe9a8" opacity="0.59"/><circle cx="72.1" cy="75.7" r="0.28" fill="#ffe9a8" opacity="0.77"/><circle cx="47.2" cy="88.9" r="0.28" fill="#ffe9a8" opacity="0.89"/><circle cx="68.0" cy="70.8" r="0.36" fill="#ffe9a8" opacity="0.69"/><circle cx="90.0" cy="79.7" r="0.45" fill="#ffe9a8" opacity="0.85"/><circle cx="73.0" cy="78.0" r="0.28" fill="#ffe9a8" opacity="0.67"/><circle cx="81.6" cy="58.3" r="0.28" fill="#ffe9a8" opacity="0.63"/><circle cx="75.1" cy="89.4" r="0.36" fill="#ffe9a8" opacity="0.60"/><circle cx="82.4" cy="81.0" r="0.28" fill="#ffe9a8" opacity="0.66"/><circle cx="63.5" cy="73.6" r="0.36" fill="#ffe9a8" opacity="0.86"/><circle cx="92.8" cy="69.4" r="0.36" fill="#ffe9a8" opacity="0.70"/><circle cx="82.7" cy="55.1" r="0.28" fill="#ffe9a8" opacity="0.56"/><circle cx="92.5" cy="54.8" r="0.45" fill="#ffe9a8" opacity="0.73"/><circle cx="93.4" cy="86.9" r="0.36" fill="#ffe9a8" opacity="0.67"/><circle cx="85.4" cy="53.8" r="0.36" fill="#ffe9a8" opacity="0.56"/><circle cx="96.8" cy="75.9" r="0.28" fill="#ffe9a8" opacity="0.49"/><circle cx="76.7" cy="68.4" r="0.28" fill="#ffe9a8" opacity="0.82"/><circle cx="61.4" cy="82.4" r="0.2" fill="#ffe9a8" opacity="0.56"/><circle cx="88.1" cy="60.0" r="0.36" fill="#ffe9a8" opacity="0.84"/><circle cx="80.9" cy="84.8" r="0.2" fill="#ffe9a8" opacity="0.46"/><circle cx="86.3" cy="59.9" r="0.28" fill="#ffe9a8" opacity="0.69"/><circle cx="92.6" cy="55.6" r="0.45" fill="#ffe9a8" opacity="0.65"/><circle cx="53.3" cy="88.4" r="0.28" fill="#ffe9a8" opacity="0.70"/><circle cx="67.1" cy="75.5" r="0.2" fill="#ffe9a8" opacity="0.66"/><circle cx="87.0" cy="72.7" r="0.2" fill="#ffe9a8" opacity="0.85"/><rect x="0" y="90.5" width="100" height="15.5" fill="#fff0bc" fill-opacity=".2"/><polygon points="60,90.5 100,90.5 100,106 46,106" fill="#5a3500" fill-opacity=".16"/><line x1="0" y1="90.5" x2="100" y2="90.5" stroke="#fff4c8" stroke-width=".4" stroke-opacity=".85"/><line x1="0" y1="106" x2="100" y2="106" stroke="#fff4c8" stroke-width=".3" stroke-opacity=".6"/><line x1="0" y1="107.2" x2="100" y2="107.2" stroke="#7a4d08" stroke-width=".25" stroke-opacity=".3"/><polygon points="74,107 100,107 100,119 66,135 52,135" fill="#4a2c00" fill-opacity=".22"/><rect width="100" height="135" fill="url(#v)"/><path d="M1.90 20.10 L15.95 10.36 L18.30 9.38 L20.68 8.47 L23.07 7.61 L25.47 6.81 L27.89 6.08 L30.32 5.41 L32.76 4.81 L35.20 4.27 L37.66 3.80 L40.12 3.41 L42.58 3.08 L45.05 2.83 L47.53 2.66 L50.00 2.56 L52.47 2.66 L54.95 2.83 L57.42 3.08 L59.88 3.41 L62.34 3.80 L64.80 4.27 L67.24 4.81 L69.68 5.41 L72.11 6.08 L74.53 6.81 L76.93 7.61 L79.32 8.47 L81.70 9.38 L84.05 10.36 L98.10 20.10 L98.10 111.66 L97.90 113.22 L97.30 114.75 L96.30 116.24 L94.91 117.70 L93.14 119.12 L91.00 120.50 L88.48 121.85 L85.59 123.17 L82.35 124.44 L78.75 125.69 L74.80 126.90 L70.50 128.07 L65.87 129.22 L60.91 130.32 L55.61 131.40 L50.00 132.44 L44.39 131.40 L39.09 130.32 L34.13 129.22 L29.50 128.07 L25.20 126.90 L21.25 125.69 L17.65 124.44 L14.41 123.17 L11.52 121.85 L9.00 120.50 L6.86 119.12 L5.09 117.70 L3.70 116.24 L2.70 114.75 L2.10 113.22 L1.90 111.66 L1.90 20.10Z" fill="none" stroke="#fff3c2" stroke-opacity=".65" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M3.00 21.18 L16.72 11.66 L19.03 10.71 L21.35 9.82 L23.69 8.98 L26.03 8.20 L28.40 7.48 L30.77 6.83 L33.15 6.24 L35.54 5.71 L37.94 5.26 L40.34 4.87 L42.75 4.56 L45.17 4.31 L47.58 4.14 L50.00 4.05 L52.42 4.14 L54.83 4.31 L57.25 4.56 L59.66 4.87 L62.06 5.26 L64.46 5.71 L66.85 6.24 L69.23 6.83 L71.60 7.48 L73.97 8.20 L76.31 8.98 L78.65 9.82 L80.97 10.71 L83.28 11.66 L97.00 21.18 L97.00 110.65 L96.80 112.17 L96.21 113.67 L95.24 115.13 L93.89 116.55 L92.16 117.94 L90.06 119.29 L87.60 120.61 L84.78 121.89 L81.61 123.14 L78.09 124.36 L74.23 125.54 L70.03 126.69 L65.51 127.80 L60.66 128.89 L55.48 129.93 L50.00 130.95 L44.52 129.93 L39.34 128.89 L34.49 127.80 L29.97 126.69 L25.77 125.54 L21.91 124.36 L18.39 123.14 L15.22 121.89 L12.40 120.61 L9.94 119.29 L7.84 117.94 L6.11 116.55 L4.76 115.13 L3.79 113.67 L3.20 112.17 L3.00 110.65 L3.00 21.18Z" fill="none" stroke="#6b4306" stroke-opacity=".3" stroke-width=".8" vector-effect="non-scaling-stroke"/><path d="M18 58.3 L18.4 59.6 L19.7 60 L18.4 60.4 L18 61.7 L17.6 60.4 L16.3 60 L17.6 59.6 Z" fill="#fffbe6" opacity=".8"/><path d="M88 6.3 L88.4 7.6 L89.7 8 L88.4 8.4 L88 9.7 L87.6 8.4 L86.3 8 L87.6 7.6 Z" fill="#fffbe6" opacity=".8"/><path d="M78 98.3 L78.4 99.6 L79.7 100 L78.4 100.4 L78 101.7 L77.6 100.4 L76.3 100 L77.6 99.6 Z" fill="#fffbe6" opacity=".8"/><path d="M8 96.3 L8.4 97.6 L9.7 98 L8.4 98.4 L8 99.7 L7.6 98.4 L6.3 98 L7.6 97.6 Z" fill="#fffbe6" opacity=".8"/><path d="M44 16.3 L44.4 17.6 L45.7 18 L44.4 18.4 L44 19.7 L43.6 18.4 L42.3 18 L43.6 17.6 Z" fill="#fffbe6" opacity=".8"/></svg>';
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
  --card-pat: linear-gradient(0deg, rgba(96,62,8,.12), rgba(0,0,0,0) 30%);
}
/* o ouro vem do degradê de baixo; a arte por cima só põe luz e sombra */
.cd-art { --a: #efd896; --b: #dcb257; --c: #b98a2c; background: var(--card-art), var(--card-pat), linear-gradient(150deg, var(--a), var(--b) 52%, var(--c)); }
.cd-art.special { --a: #f9e9a8; --b: #ecc544; --c: #c18f14; }
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
button.player-card.player-card::after { background: linear-gradient(118deg, rgba(255,255,255,.28) 0, rgba(255,255,255,0) 34%, rgba(255,255,255,.08) 60%, rgba(255,255,255,0) 76%); }
button.player-card.player-card.gold { --frame: linear-gradient(150deg, #fff2bd, #cfa13c 34%, #7e5a12 62%, #f0d27e); --face: linear-gradient(150deg, #f1dc9c, #e3bd62 38%, #d3a443 70%, #b98a2c); --ink: #1c1300; }
button.player-card.player-card.special { --frame: linear-gradient(150deg, #fff6c8, #d9a920 34%, #8a600a 62%, #ffe27a); --face: linear-gradient(150deg, #f9e9a8, #efca4e 38%, #e0aa24 70%, #bf8e14); --ink: #1c1300; }
button.player-card.player-card.silver { --frame: linear-gradient(160deg, #f4f6f8, #808b97); }
button.player-card.player-card.bronze { --frame: linear-gradient(160deg, #f6c096, #8a4a22); --face: linear-gradient(165deg, #f4bb8f, #d7864f 58%, #b66a38); --ink: #2a1408; }
button.player-card.player-card:not(:disabled):hover { transform: translateY(-4px); filter: brightness(1.07); box-shadow: none; border-color: transparent; }
button.player-card.player-card.selected { --frame: linear-gradient(160deg, #ffffff, #f5b800); transform: translateY(-4px); filter: brightness(1.1); box-shadow: none; border-color: transparent; }
button.player-card.player-card.selected::before, button.player-card.player-card.selected::after { inset: 5px; }
button.player-card.player-card > * { position: absolute; z-index: 1; margin: 0; }
button.player-card.player-card .card-top {
  left: 11%;
  top: 11.5%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  color: var(--ink);
  font-family: 'Bebas Neue', Inter, sans-serif;
  font-weight: 400;
  font-size: 30px;
  font-size: 27cqw;
  line-height: .86;
  text-shadow: 0 1px 0 rgba(255,244,205,.45);
}
button.player-card.player-card .card-position { font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 14px; font-size: 13cqw; line-height: 1; color: var(--ink); letter-spacing: .03em; }
button.player-card.player-card strong {
  left: 0;
  right: 0;
  top: 67%;
  height: 11.5%;
  padding: 0 9%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  font-family: 'Bebas Neue', Inter, sans-serif;
  font-weight: 400;
  font-size: 13px;
  font-size: 13.5cqw;
  line-height: 1;
  letter-spacing: .04em;
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(255,244,205,.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
button.player-card.player-card .card-base { left: 0; right: 0; top: 80.5%; display: flex; align-items: center; justify-content: center; gap: 5cqw; }
button.player-card.player-card .card-flag { width: 14cqw; height: 9.8cqw; border-radius: 1.1cqw; box-shadow: 0 0 0 .6cqw rgba(100,66,8,.55), 0 1px 2px rgba(0,0,0,.3); }
button.player-card.player-card .card-crest { position: relative; width: 11cqw; height: 12.6cqw; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); display: grid; place-items: center; }
button.player-card.player-card .card-crest::before { content: ''; position: absolute; inset: .9cqw .9cqw 1cqw; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); background: var(--cr); }
button.player-card.player-card .card-crest i { position: relative; margin-top: -1.2cqw; font: 900 normal 3.9cqw/1 Inter, sans-serif; letter-spacing: 0; color: var(--ci); }
`;
