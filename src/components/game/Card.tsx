import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { chemBadgeCss } from '@/components/game/ChemBadge';
import { GoldRail, SilverBack, playStyleCss, stylesOfPlayer } from '@/components/game/PlayStyleBadges';
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
          aspectRatio: '0.84',
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
      <CardArt />
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
  tilt?: boolean;
}) {
  const ps = stylesOfPlayer(props.player);
  const [flip, setFlip] = useState(false);
  if (!ps.gold.length && !ps.silver.length) return <PlainCard {...props} />;
  const hasSilver = ps.silver.length > 0;
  const flipMode = hasSilver && !props.onClick;
  return (
    <div className="ps-host" data-flip={flip ? '1' : '0'}>
      <div className="ps-flipper">
        <div className={`ps-front ${props.onClick ? '' : 'noclick'} ${flipMode ? 'flipmode' : ''}`} onClick={flipMode ? () => setFlip(true) : undefined}>
          <PlainCard {...props} />
        </div>
        {hasSilver && (
          <div className="ps-backface" aria-hidden={!flip}>
            <SilverBack list={ps.silver} name={props.player.name} onFlip={() => setFlip(false)} />
          </div>
        )}
      </div>
      {hasSilver && !flip && (
        <button type="button" className="ps-chip has-silver" data-n={ps.silver.length} aria-label="Ver PlayStyles de prata (virar a carta)" title="Virar a carta" onClick={(e) => { e.stopPropagation(); setFlip(true); }}>↻</button>
      )}
      {ps.gold.length > 0 && !flip && <GoldRail list={ps.gold} />}
    </div>
  );
}

function PlainCard(props: {
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
export const SHIELD_CLIP = 'polygon(4.1% 13.9%, 6.0% 13.1%, 8.0% 12.0%, 10.0% 10.8%, 12.0% 9.5%, 13.8% 8.1%, 15.5% 6.7%, 16.9% 5.3%, 18.0% 4.1%, 20.0% 3.9%, 22.0% 3.7%, 24.1% 3.3%, 26.2% 3.0%, 28.4% 2.6%, 30.6% 2.2%, 32.9% 1.8%, 35.2% 1.4%, 37.6% 1.1%, 40.0% 0.8%, 42.4% 0.5%, 44.9% 0.3%, 47.4% 0.1%, 50.0% 0.0%, 52.6% 0.1%, 55.1% 0.3%, 57.6% 0.5%, 60.0% 0.8%, 62.4% 1.1%, 64.8% 1.4%, 67.1% 1.8%, 69.4% 2.2%, 71.6% 2.6%, 73.8% 3.0%, 75.9% 3.3%, 78.0% 3.7%, 80.0% 3.9%, 82.0% 4.1%, 83.1% 5.3%, 84.5% 6.7%, 86.2% 8.1%, 88.0% 9.5%, 90.0% 10.8%, 92.0% 12.0%, 94.0% 13.1%, 95.9% 13.9%, 95.9% 28.9%, 97.6% 30.7%, 98.5% 35.7%, 99.8% 38.5%, 99.8% 85.4%, 98.9% 86.8%, 97.4% 87.2%, 95.9% 89.5%, 94.5% 89.6%, 93.7% 90.1%, 92.7% 90.6%, 91.6% 91.1%, 90.2% 91.5%, 87.3% 92.2%, 84.4% 92.8%, 81.4% 93.5%, 78.4% 94.1%, 75.3% 94.7%, 72.3% 95.4%, 69.3% 96.0%, 66.4% 96.6%, 63.4% 97.1%, 60.6% 97.7%, 57.8% 98.2%, 55.1% 98.7%, 52.5% 99.2%, 50.0% 99.7%, 47.5% 99.2%, 44.9% 98.7%, 42.2% 98.2%, 39.4% 97.7%, 36.6% 97.1%, 33.6% 96.6%, 30.7% 96.0%, 27.7% 95.4%, 24.7% 94.7%, 21.6% 94.1%, 18.6% 93.5%, 15.6% 92.8%, 12.7% 92.2%, 8.4% 91.1%, 7.3% 90.6%, 6.3% 90.1%, 5.5% 89.6%, 4.1% 89.5%, 2.6% 87.2%, 1.1% 86.8%, 0.2% 85.4%, 0.2% 38.5%, 1.5% 35.7%, 2.4% 30.7%, 4.1% 28.9%)';

// Fundo das cartas: ouro com riscos finos diagonais, facetas escuras com arestas luminosas, faixa do nome, moldura interna e brilhos (SVG esticado ao cartão)

// Molde novo (reconstruído da carta de referência): corpo arqueado + trilhos laterais; tudo em coordenadas de um viewBox 100x135
const CARD_TEX_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 135" preserveAspectRatio="none"><defs><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.5" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .22  0 0 0 0 .02  0 0 0 -2.2 1.15"/></filter><filter id="n2" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .7  0 0 0 -3 1.35"/></filter></defs><g transform="rotate(-40 50 67)"><rect x="-40" y="-40" width="180" height="215" filter="url(#n)" opacity=".24"/></g><rect width="100" height="135" filter="url(#n2)" opacity=".12"/><line x1="60.4" y1="69.4" x2="83.1" y2="49.3" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.44"/><line x1="74.6" y1="30.0" x2="79.9" y2="23.5" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.31"/><line x1="25.5" y1="53.6" x2="40.6" y2="34.3" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.29"/><line x1="19.5" y1="79.5" x2="32.8" y2="66.8" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.20"/><line x1="59.9" y1="20.2" x2="64.8" y2="15.7" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.42"/><line x1="91.7" y1="23.4" x2="99.5" y2="14.5" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.34"/><line x1="65.5" y1="26.5" x2="90.5" y2="1.9" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.25"/><line x1="36.1" y1="23.4" x2="43.2" y2="14.5" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.44"/><line x1="57.0" y1="57.8" x2="74.9" y2="35.4" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.44"/><line x1="47.2" y1="35.4" x2="62.3" y2="20.6" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.24"/><line x1="89.7" y1="86.0" x2="101.6" y2="73.0" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.28"/><line x1="56.3" y1="10.8" x2="61.5" y2="4.5" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.19"/><line x1="25.4" y1="75.6" x2="39.7" y2="60.6" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.42"/><line x1="12.6" y1="70.0" x2="35.1" y2="49.3" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.30"/><line x1="93.4" y1="26.8" x2="108.3" y2="10.1" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.27"/><line x1="88.3" y1="53.7" x2="99.1" y2="41.5" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.43"/><line x1="60.7" y1="67.8" x2="71.8" y2="56.0" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.18"/><line x1="58.3" y1="84.0" x2="63.8" y2="78.7" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.44"/><line x1="44.9" y1="43.8" x2="51.0" y2="38.3" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.43"/><line x1="33.6" y1="26.7" x2="58.9" y2="0.5" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.37"/><line x1="75.7" y1="18.6" x2="88.5" y2="3.1" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.25"/><line x1="44.6" y1="90.0" x2="68.7" y2="68.9" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.49"/><line x1="66.5" y1="35.5" x2="76.8" y2="24.5" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.19"/><line x1="78.9" y1="52.6" x2="87.8" y2="44.7" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.21"/><line x1="48.2" y1="51.3" x2="64.3" y2="34.4" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.43"/><line x1="74.5" y1="65.7" x2="93.7" y2="47.3" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.35"/><line x1="64.6" y1="76.9" x2="75.5" y2="67.3" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.48"/><line x1="34.1" y1="24.4" x2="56.4" y2="0.6" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.26"/><line x1="28.0" y1="33.2" x2="43.5" y2="17.9" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.27"/><line x1="62.3" y1="69.1" x2="83.7" y2="45.2" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.45"/><line x1="66.4" y1="88.2" x2="91.1" y2="62.3" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.22"/><line x1="36.2" y1="78.4" x2="45.9" y2="66.3" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.21"/><line x1="75.0" y1="56.6" x2="93.2" y2="36.7" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.40"/><line x1="5.1" y1="22.9" x2="19.3" y2="8.8" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.42"/><line x1="19.3" y1="67.6" x2="46.5" y2="43.8" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.17"/><line x1="15.0" y1="35.5" x2="22.9" y2="26.0" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.30"/><line x1="35.2" y1="63.1" x2="41.0" y2="56.2" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.15"/><line x1="40.2" y1="32.4" x2="52.5" y2="17.3" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.49"/><line x1="53.6" y1="34.2" x2="64.4" y2="22.8" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.49"/><line x1="78.5" y1="43.6" x2="100.6" y2="21.5" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.31"/><line x1="17.1" y1="40.7" x2="30.9" y2="24.3" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.36"/><line x1="35.2" y1="81.6" x2="39.5" y2="76.2" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.26"/><line x1="83.9" y1="55.2" x2="98.5" y2="42.4" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.25"/><line x1="92.8" y1="40.5" x2="119.1" y2="16.8" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.41"/><line x1="30.5" y1="30.2" x2="35.9" y2="25.4" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.32"/><line x1="29.2" y1="48.2" x2="36.5" y2="40.9" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.24"/><line x1="6.3" y1="21.0" x2="19.1" y2="7.4" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.24"/><line x1="46.6" y1="13.0" x2="62.3" y2="-1.4" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.25"/><line x1="59.0" y1="48.1" x2="77.4" y2="29.4" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.16"/><line x1="14.3" y1="32.7" x2="34.0" y2="12.7" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.31"/><line x1="36.1" y1="69.7" x2="51.6" y2="50.1" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.34"/><line x1="66.2" y1="18.7" x2="84.1" y2="-2.6" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.42"/><line x1="42.3" y1="56.1" x2="62.1" y2="36.2" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.45"/><line x1="80.6" y1="48.1" x2="100.2" y2="29.2" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.31"/><line x1="72.9" y1="34.4" x2="77.8" y2="29.7" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.38"/><line x1="46.4" y1="35.0" x2="54.8" y2="26.8" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.49"/><line x1="52.5" y1="44.1" x2="67.1" y2="25.7" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.24"/><line x1="10.5" y1="15.1" x2="34.1" y2="-11.4" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.49"/><line x1="95.2" y1="66.2" x2="101.2" y2="60.7" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.37"/><line x1="79.1" y1="19.0" x2="104.2" y2="-2.9" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.20"/><line x1="59.2" y1="43.2" x2="67.4" y2="35.0" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.34"/><line x1="63.8" y1="69.7" x2="74.4" y2="58.8" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.41"/><line x1="84.1" y1="20.8" x2="97.3" y2="5.9" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.32"/><line x1="89.7" y1="40.0" x2="95.6" y2="34.2" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.35"/><line x1="65.5" y1="33.3" x2="90.0" y2="8.0" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.24"/><line x1="53.8" y1="30.4" x2="74.1" y2="9.1" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.43"/><line x1="82.7" y1="46.4" x2="94.6" y2="31.9" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.38"/><line x1="10.5" y1="63.5" x2="16.6" y2="56.1" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.23"/><line x1="83.9" y1="48.5" x2="95.9" y2="37.3" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.34"/><line x1="38.3" y1="77.9" x2="62.3" y2="51.9" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.41"/><line x1="10.4" y1="83.0" x2="24.5" y2="66.3" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.27"/><line x1="24.4" y1="36.7" x2="41.4" y2="17.7" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.28"/><line x1="69.6" y1="38.8" x2="80.7" y2="27.7" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.33"/><line x1="57.6" y1="55.9" x2="77.3" y2="34.3" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.16"/><line x1="19.9" y1="25.7" x2="35.8" y2="11.6" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.15"/><line x1="46.2" y1="81.3" x2="63.5" y2="62.4" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.31"/><line x1="20.4" y1="62.4" x2="26.8" y2="56.4" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.20"/><line x1="26.2" y1="32.3" x2="33.9" y2="23.5" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.16"/><line x1="85.7" y1="37.6" x2="105.4" y2="15.3" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.39"/><line x1="65.1" y1="47.8" x2="87.8" y2="20.1" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.25"/><line x1="65.2" y1="68.4" x2="72.8" y2="59.4" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.35"/><line x1="63.5" y1="59.5" x2="87.9" y2="35.7" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.21"/><line x1="36.1" y1="15.4" x2="61.3" y2="-11.5" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.21"/><line x1="21.9" y1="13.6" x2="39.9" y2="-3.8" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.15"/><line x1="8.2" y1="72.4" x2="20.3" y2="57.2" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.48"/><line x1="69.1" y1="29.0" x2="88.9" y2="4.5" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.17"/><line x1="25.2" y1="14.1" x2="37.1" y2="-0.8" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.44"/><line x1="43.9" y1="61.3" x2="68.5" y2="39.6" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.21"/><line x1="49.8" y1="42.3" x2="64.3" y2="24.2" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.43"/><line x1="10.6" y1="88.9" x2="18.0" y2="79.7" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.37"/><line x1="43.5" y1="38.7" x2="57.6" y2="25.3" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.40"/><line x1="87.3" y1="34.7" x2="102.0" y2="21.0" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.34"/><line x1="15.4" y1="48.7" x2="35.5" y2="25.6" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.26"/><line x1="14.6" y1="16.6" x2="23.6" y2="5.5" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.49"/><line x1="64.4" y1="32.2" x2="78.6" y2="15.6" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.43"/><line x1="84.5" y1="80.9" x2="90.9" y2="74.8" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.41"/><line x1="54.2" y1="81.8" x2="73.2" y2="63.6" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.30"/><line x1="78.4" y1="62.5" x2="103.8" y2="37.9" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.24"/><line x1="77.9" y1="40.7" x2="84.7" y2="32.2" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.20"/><line x1="48.8" y1="35.9" x2="54.1" y2="30.4" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.16"/><line x1="7.3" y1="20.5" x2="20.1" y2="8.8" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.23"/><line x1="42.4" y1="39.1" x2="52.9" y2="25.7" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.40"/><line x1="11.4" y1="52.5" x2="19.9" y2="44.3" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.42"/><line x1="42.9" y1="44.4" x2="54.4" y2="32.1" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.31"/><line x1="42.9" y1="45.4" x2="64.9" y2="25.7" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.49"/><line x1="57.9" y1="18.4" x2="79.2" y2="-4.8" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.22"/><line x1="2.7" y1="82.8" x2="12.6" y2="73.2" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.29"/><line x1="22.6" y1="32.3" x2="31.5" y2="23.1" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.42"/><line x1="75.4" y1="39.4" x2="98.0" y2="18.3" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.37"/><line x1="39.8" y1="21.5" x2="61.7" y2="-1.7" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.18"/><line x1="38.2" y1="71.9" x2="47.8" y2="63.3" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.21"/><line x1="70.3" y1="51.5" x2="82.3" y2="39.0" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.11"/><line x1="20.4" y1="67.1" x2="26.8" y2="60.7" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.19"/><line x1="75.5" y1="17.9" x2="90.9" y2="2.3" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.17"/><line x1="47.5" y1="56.5" x2="62.7" y2="40.2" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.21"/><line x1="54.5" y1="85.3" x2="66.8" y2="70.0" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.12"/><line x1="39.9" y1="87.0" x2="45.1" y2="82.1" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.13"/><line x1="28.3" y1="18.3" x2="45.2" y2="1.2" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.22"/><line x1="87.0" y1="46.7" x2="104.9" y2="24.0" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.23"/><line x1="23.6" y1="19.0" x2="30.0" y2="13.4" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.14"/><line x1="34.1" y1="75.4" x2="53.5" y2="55.8" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.18"/><line x1="45.9" y1="23.0" x2="52.2" y2="15.9" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.21"/><line x1="40.6" y1="87.8" x2="55.3" y2="71.5" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.21"/><line x1="50.0" y1="31.5" x2="64.6" y2="15.0" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.15"/><line x1="78.2" y1="81.9" x2="94.6" y2="67.5" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.13"/><line x1="11.6" y1="37.9" x2="29.3" y2="21.2" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.11"/><line x1="87.8" y1="21.9" x2="98.2" y2="9.5" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.19"/><line x1="53.7" y1="62.5" x2="68.3" y2="47.3" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.16"/><line x1="23.3" y1="51.9" x2="36.5" y2="36.5" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.16"/><line x1="10.1" y1="81.9" x2="19.8" y2="71.5" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.12"/><line x1="29.1" y1="57.2" x2="42.3" y2="42.9" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.15"/><line x1="11.8" y1="74.3" x2="20.8" y2="63.1" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.23"/><line x1="14.9" y1="54.6" x2="20.4" y2="48.1" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.17"/><line x1="37.0" y1="82.8" x2="55.8" y2="63.9" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.21"/><line x1="77.9" y1="16.4" x2="91.9" y2="-0.8" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.15"/><line x1="35.6" y1="72.4" x2="48.9" y2="57.9" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.15"/><line x1="71.6" y1="29.8" x2="90.2" y2="10.5" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.18"/><line x1="80.5" y1="80.5" x2="91.3" y2="70.4" stroke="#7a4d08" stroke-width="0.14" stroke-opacity="0.13"/><circle cx="78.4" cy="50.4" r="0.28" fill="#ffe08a" opacity="0.63"/><circle cx="47.7" cy="73.2" r="0.36" fill="#ffe08a" opacity="0.94"/><circle cx="66.6" cy="61.9" r="0.45" fill="#ffe08a" opacity="0.88"/><circle cx="82.4" cy="47.7" r="0.2" fill="#ffe08a" opacity="0.61"/><circle cx="57.0" cy="78.7" r="0.2" fill="#ffe08a" opacity="0.60"/><circle cx="78.2" cy="64.9" r="0.45" fill="#ffe08a" opacity="0.56"/><circle cx="72.0" cy="59.1" r="0.45" fill="#ffe08a" opacity="0.75"/><circle cx="47.7" cy="73.2" r="0.2" fill="#ffe08a" opacity="0.85"/><circle cx="43.5" cy="86.2" r="0.45" fill="#ffe08a" opacity="0.52"/><circle cx="82.4" cy="59.0" r="0.45" fill="#ffe08a" opacity="0.66"/><circle cx="63.1" cy="68.4" r="0.45" fill="#ffe08a" opacity="0.52"/><circle cx="86.4" cy="59.0" r="0.36" fill="#ffe08a" opacity="0.72"/><circle cx="80.7" cy="75.0" r="0.45" fill="#ffe08a" opacity="0.91"/><circle cx="83.5" cy="69.7" r="0.36" fill="#ffe08a" opacity="0.75"/><circle cx="70.1" cy="70.6" r="0.2" fill="#ffe08a" opacity="0.82"/><circle cx="76.5" cy="69.6" r="0.45" fill="#ffe08a" opacity="0.64"/><circle cx="51.4" cy="83.6" r="0.45" fill="#ffe08a" opacity="0.71"/><circle cx="49.3" cy="86.9" r="0.2" fill="#ffe08a" opacity="0.57"/><circle cx="59.7" cy="66.0" r="0.28" fill="#ffe08a" opacity="0.56"/><circle cx="62.9" cy="74.3" r="0.36" fill="#ffe08a" opacity="0.91"/><circle cx="66.7" cy="73.1" r="0.36" fill="#ffe08a" opacity="0.88"/><circle cx="86.7" cy="53.7" r="0.2" fill="#ffe08a" opacity="0.93"/><circle cx="84.0" cy="69.2" r="0.45" fill="#ffe08a" opacity="0.58"/><circle cx="53.5" cy="78.1" r="0.36" fill="#ffe08a" opacity="0.90"/><circle cx="72.5" cy="74.0" r="0.36" fill="#ffe08a" opacity="0.93"/><circle cx="66.4" cy="88.2" r="0.28" fill="#ffe08a" opacity="0.90"/><circle cx="84.7" cy="72.0" r="0.36" fill="#ffe08a" opacity="0.63"/><circle cx="78.0" cy="53.3" r="0.2" fill="#ffe08a" opacity="0.56"/><circle cx="70.6" cy="82.5" r="0.45" fill="#ffe08a" opacity="0.55"/><circle cx="79.2" cy="57.2" r="0.45" fill="#ffe08a" opacity="0.89"/><circle cx="55.7" cy="78.4" r="0.28" fill="#ffe08a" opacity="0.84"/><circle cx="89.9" cy="56.0" r="0.36" fill="#ffe08a" opacity="0.69"/><circle cx="83.6" cy="73.7" r="0.36" fill="#ffe08a" opacity="0.82"/><circle cx="70.2" cy="79.6" r="0.45" fill="#ffe08a" opacity="0.79"/><circle cx="65.7" cy="64.3" r="0.36" fill="#ffe08a" opacity="0.52"/><circle cx="65.5" cy="64.1" r="0.28" fill="#ffe08a" opacity="0.58"/><circle cx="73.3" cy="60.3" r="0.45" fill="#ffe08a" opacity="0.79"/><circle cx="68.3" cy="77.0" r="0.45" fill="#ffe08a" opacity="0.76"/><circle cx="75.3" cy="70.6" r="0.28" fill="#ffe08a" opacity="0.51"/><circle cx="77.1" cy="59.8" r="0.2" fill="#ffe08a" opacity="0.90"/><circle cx="84.9" cy="74.1" r="0.28" fill="#ffe08a" opacity="0.91"/><circle cx="80.9" cy="61.1" r="0.45" fill="#ffe08a" opacity="0.83"/><circle cx="76.3" cy="83.0" r="0.28" fill="#ffe08a" opacity="0.66"/><circle cx="53.0" cy="85.8" r="0.28" fill="#ffe08a" opacity="0.67"/><circle cx="55.6" cy="83.9" r="0.45" fill="#ffe08a" opacity="0.90"/><circle cx="53.2" cy="88.0" r="0.45" fill="#ffe08a" opacity="0.69"/><circle cx="59.8" cy="80.9" r="0.36" fill="#ffe08a" opacity="0.55"/><circle cx="64.2" cy="78.6" r="0.2" fill="#ffe08a" opacity="0.80"/><circle cx="77.2" cy="60.7" r="0.2" fill="#ffe08a" opacity="0.64"/><circle cx="71.8" cy="85.4" r="0.2" fill="#ffe08a" opacity="0.72"/><circle cx="86.1" cy="51.4" r="0.45" fill="#ffe08a" opacity="0.63"/><circle cx="73.8" cy="52.7" r="0.2" fill="#ffe08a" opacity="0.77"/><circle cx="85.6" cy="58.2" r="0.36" fill="#ffe08a" opacity="0.54"/><circle cx="85.1" cy="56.8" r="0.45" fill="#ffe08a" opacity="0.82"/><circle cx="86.7" cy="55.9" r="0.36" fill="#ffe08a" opacity="0.73"/><circle cx="86.3" cy="60.9" r="0.45" fill="#ffe08a" opacity="0.92"/><circle cx="84.3" cy="45.2" r="0.36" fill="#ffe08a" opacity="0.67"/><circle cx="77.0" cy="63.1" r="0.28" fill="#ffe08a" opacity="0.94"/><circle cx="54.3" cy="82.0" r="0.28" fill="#ffe08a" opacity="0.72"/><circle cx="80.3" cy="53.3" r="0.36" fill="#ffe08a" opacity="0.64"/><circle cx="79.4" cy="63.7" r="0.2" fill="#ffe08a" opacity="0.83"/><circle cx="77.2" cy="85.2" r="0.45" fill="#ffe08a" opacity="0.80"/><circle cx="56.4" cy="72.3" r="0.28" fill="#ffe08a" opacity="0.59"/><circle cx="88.6" cy="46.6" r="0.45" fill="#ffe08a" opacity="0.60"/><circle cx="73.9" cy="72.0" r="0.2" fill="#ffe08a" opacity="0.64"/><circle cx="39.6" cy="86.0" r="0.45" fill="#ffe08a" opacity="0.58"/><circle cx="49.7" cy="72.0" r="0.2" fill="#ffe08a" opacity="0.78"/><circle cx="73.4" cy="75.9" r="0.2" fill="#ffe08a" opacity="0.85"/><circle cx="73.1" cy="56.9" r="0.36" fill="#ffe08a" opacity="0.69"/><circle cx="81.8" cy="73.8" r="0.45" fill="#ffe08a" opacity="0.82"/><circle cx="75.9" cy="75.1" r="0.2" fill="#ffe08a" opacity="0.63"/><circle cx="62.2" cy="82.2" r="0.45" fill="#ffe08a" opacity="0.72"/><circle cx="62.8" cy="71.5" r="0.28" fill="#ffe08a" opacity="0.65"/><circle cx="76.2" cy="87.3" r="0.45" fill="#ffe08a" opacity="0.79"/><circle cx="81.5" cy="81.1" r="0.45" fill="#ffe08a" opacity="0.70"/><circle cx="64.6" cy="77.6" r="0.28" fill="#ffe08a" opacity="0.94"/><circle cx="44.9" cy="86.0" r="0.36" fill="#ffe08a" opacity="0.60"/><circle cx="73.5" cy="62.4" r="0.45" fill="#ffe08a" opacity="0.90"/><circle cx="79.5" cy="86.6" r="0.28" fill="#ffe08a" opacity="0.95"/><circle cx="73.4" cy="82.9" r="0.36" fill="#ffe08a" opacity="0.84"/><circle cx="66.0" cy="83.3" r="0.28" fill="#ffe08a" opacity="0.52"/><circle cx="87.0" cy="61.5" r="0.36" fill="#ffe08a" opacity="0.88"/><circle cx="64.9" cy="59.9" r="0.2" fill="#ffe08a" opacity="0.50"/><circle cx="64.6" cy="62.9" r="0.45" fill="#ffe08a" opacity="0.54"/><circle cx="68.4" cy="72.0" r="0.45" fill="#ffe08a" opacity="0.74"/><circle cx="73.8" cy="73.5" r="0.36" fill="#ffe08a" opacity="0.59"/><circle cx="87.7" cy="53.4" r="0.45" fill="#ffe08a" opacity="0.72"/><circle cx="86.7" cy="69.0" r="0.45" fill="#ffe08a" opacity="0.52"/><circle cx="62.9" cy="79.0" r="0.28" fill="#ffe08a" opacity="0.89"/><circle cx="62.4" cy="83.9" r="0.45" fill="#ffe08a" opacity="0.65"/><circle cx="72.7" cy="85.0" r="0.2" fill="#ffe08a" opacity="0.83"/><circle cx="76.1" cy="85.4" r="0.2" fill="#ffe08a" opacity="0.54"/><circle cx="62.7" cy="73.9" r="0.45" fill="#ffe08a" opacity="0.70"/><circle cx="80.8" cy="86.1" r="0.2" fill="#ffe08a" opacity="0.86"/><circle cx="73.7" cy="58.3" r="0.2" fill="#ffe08a" opacity="0.82"/><circle cx="70.0" cy="75.4" r="0.45" fill="#ffe08a" opacity="0.63"/><circle cx="70.5" cy="76.7" r="0.36" fill="#ffe08a" opacity="0.64"/><circle cx="57.9" cy="72.3" r="0.36" fill="#ffe08a" opacity="0.94"/><circle cx="63.2" cy="61.4" r="0.36" fill="#ffe08a" opacity="0.64"/><circle cx="80.6" cy="71.4" r="0.2" fill="#ffe08a" opacity="0.72"/><circle cx="87.6" cy="44.1" r="0.28" fill="#ffe08a" opacity="0.84"/><circle cx="78.9" cy="51.3" r="0.2" fill="#ffe08a" opacity="0.62"/><circle cx="69.8" cy="85.1" r="0.45" fill="#ffe08a" opacity="0.51"/><circle cx="68.8" cy="63.1" r="0.45" fill="#ffe08a" opacity="0.87"/><circle cx="78.4" cy="73.9" r="0.2" fill="#ffe08a" opacity="0.92"/><circle cx="77.7" cy="74.4" r="0.45" fill="#ffe08a" opacity="0.92"/><circle cx="84.3" cy="48.0" r="0.45" fill="#ffe08a" opacity="0.70"/><circle cx="83.5" cy="59.4" r="0.28" fill="#ffe08a" opacity="0.94"/><circle cx="87.6" cy="69.7" r="0.36" fill="#ffe08a" opacity="0.93"/><circle cx="67.0" cy="73.7" r="0.2" fill="#ffe08a" opacity="0.86"/><circle cx="68.0" cy="71.9" r="0.2" fill="#ffe08a" opacity="0.87"/><circle cx="89.4" cy="48.4" r="0.36" fill="#ffe08a" opacity="0.58"/><circle cx="65.6" cy="74.4" r="0.28" fill="#ffe08a" opacity="0.66"/><circle cx="83.5" cy="88.3" r="0.28" fill="#ffe08a" opacity="0.84"/><circle cx="91.4" cy="46.8" r="0.36" fill="#ffe08a" opacity="0.62"/><circle cx="61.7" cy="83.9" r="0.28" fill="#ffe08a" opacity="0.62"/><circle cx="75.8" cy="61.7" r="0.36" fill="#ffe08a" opacity="0.65"/><circle cx="86.5" cy="75.5" r="0.36" fill="#ffe08a" opacity="0.81"/><circle cx="80.8" cy="63.2" r="0.2" fill="#ffe08a" opacity="0.77"/><circle cx="42.1" cy="77.1" r="0.28" fill="#ffe08a" opacity="0.67"/><circle cx="54.5" cy="81.1" r="0.28" fill="#ffe08a" opacity="0.63"/><circle cx="69.2" cy="59.6" r="0.36" fill="#ffe08a" opacity="0.58"/><circle cx="65.8" cy="65.0" r="0.45" fill="#ffe08a" opacity="0.72"/><circle cx="42.4" cy="83.8" r="0.28" fill="#ffe08a" opacity="0.58"/><circle cx="83.9" cy="84.6" r="0.45" fill="#ffe08a" opacity="0.92"/><circle cx="76.3" cy="62.2" r="0.36" fill="#ffe08a" opacity="0.72"/><circle cx="89.4" cy="48.0" r="0.36" fill="#ffe08a" opacity="0.69"/><circle cx="79.1" cy="78.8" r="0.45" fill="#ffe08a" opacity="0.87"/><circle cx="68.6" cy="62.7" r="0.28" fill="#ffe08a" opacity="0.71"/><circle cx="86.6" cy="52.9" r="0.45" fill="#ffe08a" opacity="0.60"/><circle cx="84.6" cy="85.5" r="0.2" fill="#ffe08a" opacity="0.94"/><circle cx="55.6" cy="73.5" r="0.45" fill="#ffe08a" opacity="0.76"/><circle cx="53.6" cy="78.6" r="0.45" fill="#ffe08a" opacity="0.88"/><circle cx="53.8" cy="83.1" r="0.2" fill="#ffe08a" opacity="0.82"/><circle cx="78.5" cy="57.5" r="0.36" fill="#ffe08a" opacity="0.68"/><circle cx="86.3" cy="44.8" r="0.2" fill="#ffe08a" opacity="0.54"/><circle cx="59.5" cy="66.9" r="0.36" fill="#ffe08a" opacity="0.68"/><circle cx="50.1" cy="83.5" r="0.45" fill="#ffe08a" opacity="0.85"/><circle cx="42.2" cy="80.8" r="0.28" fill="#ffe08a" opacity="0.85"/><circle cx="37.2" cy="82.3" r="0.36" fill="#ffe08a" opacity="0.92"/><circle cx="83.8" cy="64.7" r="0.28" fill="#ffe08a" opacity="0.60"/><circle cx="82.0" cy="47.7" r="0.36" fill="#ffe08a" opacity="0.74"/><circle cx="76.9" cy="75.8" r="0.45" fill="#ffe08a" opacity="0.90"/><circle cx="84.8" cy="48.5" r="0.28" fill="#ffe08a" opacity="0.87"/><circle cx="83.4" cy="60.5" r="0.28" fill="#ffe08a" opacity="0.55"/><circle cx="75.3" cy="60.1" r="0.28" fill="#ffe08a" opacity="0.85"/><circle cx="80.3" cy="68.2" r="0.2" fill="#ffe08a" opacity="0.71"/><circle cx="80.1" cy="63.4" r="0.45" fill="#ffe08a" opacity="0.79"/><circle cx="54.1" cy="74.6" r="0.36" fill="#ffe08a" opacity="0.75"/><circle cx="79.0" cy="55.1" r="0.2" fill="#ffe08a" opacity="0.57"/><circle cx="88.6" cy="51.3" r="0.28" fill="#ffe08a" opacity="0.61"/><circle cx="91.7" cy="43.5" r="0.45" fill="#ffe08a" opacity="0.63"/><circle cx="54.7" cy="70.5" r="0.28" fill="#ffe08a" opacity="0.86"/><circle cx="85.3" cy="48.5" r="0.28" fill="#ffe08a" opacity="0.78"/><circle cx="63.9" cy="80.3" r="0.28" fill="#ffe08a" opacity="0.84"/><circle cx="81.0" cy="86.7" r="0.28" fill="#ffe08a" opacity="0.72"/><circle cx="75.3" cy="65.3" r="0.36" fill="#ffe08a" opacity="0.74"/><circle cx="63.8" cy="67.9" r="0.28" fill="#ffe08a" opacity="0.82"/><circle cx="72.9" cy="58.8" r="0.36" fill="#ffe08a" opacity="0.71"/><circle cx="81.7" cy="87.8" r="0.28" fill="#ffe08a" opacity="0.85"/><circle cx="59.4" cy="71.6" r="0.28" fill="#ffe08a" opacity="0.71"/><circle cx="57.5" cy="74.3" r="0.2" fill="#ffe08a" opacity="0.75"/><circle cx="45.2" cy="86.4" r="0.36" fill="#ffe08a" opacity="0.81"/><circle cx="83.2" cy="63.9" r="0.45" fill="#ffe08a" opacity="0.73"/><circle cx="54.4" cy="80.0" r="0.28" fill="#ffe08a" opacity="0.51"/><circle cx="88.6" cy="50.3" r="0.45" fill="#ffe08a" opacity="0.94"/><circle cx="60.9" cy="77.7" r="0.2" fill="#ffe08a" opacity="0.88"/><circle cx="76.8" cy="60.3" r="0.36" fill="#ffe08a" opacity="0.69"/><circle cx="78.0" cy="73.7" r="0.45" fill="#ffe08a" opacity="0.85"/><circle cx="66.1" cy="69.8" r="0.2" fill="#ffe08a" opacity="0.78"/><circle cx="76.7" cy="53.5" r="0.45" fill="#ffe08a" opacity="0.55"/><circle cx="82.8" cy="59.7" r="0.28" fill="#ffe08a" opacity="0.94"/><circle cx="85.7" cy="58.1" r="0.45" fill="#ffe08a" opacity="0.54"/><circle cx="68.4" cy="86.5" r="0.36" fill="#ffe08a" opacity="0.93"/><circle cx="55.8" cy="88.1" r="0.28" fill="#ffe08a" opacity="0.83"/><circle cx="60.2" cy="80.5" r="0.45" fill="#ffe08a" opacity="0.61"/><circle cx="86.2" cy="76.2" r="0.2" fill="#ffe08a" opacity="0.74"/><circle cx="51.4" cy="84.2" r="0.28" fill="#ffe08a" opacity="0.72"/><circle cx="53.8" cy="70.7" r="0.2" fill="#ffe08a" opacity="0.61"/><circle cx="80.5" cy="50.1" r="0.2" fill="#ffe08a" opacity="0.52"/><circle cx="67.1" cy="59.9" r="0.2" fill="#ffe08a" opacity="0.60"/><circle cx="87.5" cy="67.4" r="0.2" fill="#ffe08a" opacity="0.53"/><circle cx="83.2" cy="72.3" r="0.36" fill="#ffe08a" opacity="0.73"/><circle cx="61.2" cy="87.3" r="0.45" fill="#ffe08a" opacity="0.64"/><circle cx="84.2" cy="68.4" r="0.36" fill="#ffe08a" opacity="0.56"/><circle cx="88.3" cy="63.5" r="0.28" fill="#ffe08a" opacity="0.87"/><circle cx="78.5" cy="83.4" r="0.45" fill="#ffe08a" opacity="0.64"/><circle cx="83.9" cy="54.6" r="0.45" fill="#ffe08a" opacity="0.80"/><circle cx="67.2" cy="75.5" r="0.2" fill="#ffe08a" opacity="0.82"/><circle cx="71.9" cy="56.2" r="0.45" fill="#ffe08a" opacity="0.93"/><circle cx="74.6" cy="86.5" r="0.28" fill="#ffe08a" opacity="0.71"/><circle cx="75.9" cy="62.4" r="0.28" fill="#ffe08a" opacity="0.75"/><circle cx="79.5" cy="64.3" r="0.2" fill="#ffe08a" opacity="0.76"/><circle cx="51.5" cy="76.4" r="0.45" fill="#ffe08a" opacity="0.89"/><circle cx="82.5" cy="62.5" r="0.28" fill="#ffe08a" opacity="0.59"/><circle cx="52.1" cy="87.2" r="0.36" fill="#ffe08a" opacity="0.65"/><circle cx="86.4" cy="50.9" r="0.2" fill="#ffe08a" opacity="0.68"/><circle cx="66.8" cy="82.7" r="0.2" fill="#ffe08a" opacity="0.56"/><circle cx="66.6" cy="67.0" r="0.2" fill="#ffe08a" opacity="0.87"/><circle cx="86.9" cy="63.1" r="0.28" fill="#ffe08a" opacity="0.50"/><path d="M9.8 61.3 l.4 1.3 1.3 .4 -1.3 .4 -.4 1.3 -.4 -1.3 -1.3 -.4 1.3 -.4z" fill="#fffbe6" opacity=".8"/><path d="M76.8 20.7 l.4 1.3 1.3 .4 -1.3 .4 -.4 1.3 -.4 -1.3 -1.3 -.4 1.3 -.4z" fill="#fffbe6" opacity=".8"/><path d="M66.5 113.0 l.4 1.3 1.3 .4 -1.3 .4 -.4 1.3 -.4 -1.3 -1.3 -.4 1.3 -.4z" fill="#fffbe6" opacity=".8"/><path d="M21.1 121.6 l.4 1.3 1.3 .4 -1.3 .4 -.4 1.3 -.4 -1.3 -1.3 -.4 1.3 -.4z" fill="#fffbe6" opacity=".8"/></svg>';
const CARD_TEX = `data:image/svg+xml,${encodeURIComponent(CARD_TEX_SVG)}`;
const CARD_FACETS = '<polygon points="9.79,89.47 70.10,42.70 95.88,21.78 95.88,37.16 93.81,37.16 28.35,89.47" fill="url(#BD)"/><polygon points="83.51,9.48 95.88,19.32 95.88,21.78 70.10,42.70" fill="url(#TR)"/><polygon points="28.35,89.47 93.81,37.16 84.02,89.47" style="fill:var(--dk)" fill-opacity=".42"/><polygon points="93.81,37.16 97.42,37.16 97.42,89.47 84.02,89.47" style="fill:var(--dk)" fill-opacity=".72"/><rect x="0" y="89.47" width="100" height="16.00" fill="#ffe9a0" fill-opacity=".14"/><polygon points="4.12,105.46 20.62,90.08 35.57,90.08 20.10,105.46" style="fill:var(--dk)" fill-opacity=".30"/><polygon points="66.49,105.46 81.96,90.08 97.42,90.08 97.42,105.46" style="fill:var(--dk)" fill-opacity=".36"/><polygon points="50.52,135.62 66.49,123.31 81.96,106.33 97.42,106.33 97.42,118.39 66.49,135.62" style="fill:var(--dk)" fill-opacity=".42"/><line x1="9.79" y1="89.47" x2="70.10" y2="42.70" class="lt" stroke-width="0.4" stroke-opacity="0.5"/><line x1="70.10" y1="42.70" x2="95.88" y2="21.78" class="lt" stroke-width="0.6" stroke-opacity="0.95"/><line x1="83.51" y1="9.48" x2="70.10" y2="42.70" class="lt" stroke-width="0.55" stroke-opacity="0.95"/><line x1="28.35" y1="87.62" x2="93.81" y2="37.16" class="lt" stroke-width="0.65" stroke-opacity="1"/><line x1="93.81" y1="37.16" x2="84.02" y2="89.47" class="lt" stroke-width="0.6" stroke-opacity="0.95"/><line x1="21.13" y1="89.47" x2="95.88" y2="29.54" class="lt" stroke-width="0.22" stroke-opacity="0.4"/><line x1="37.63" y1="89.47" x2="95.88" y2="42.70" class="lt" stroke-width="0.15" stroke-opacity="0.3"/><line x1="12.89" y1="89.47" x2="52.06" y2="60.55" class="lt" stroke-width="0.18" stroke-opacity="0.4"/><line x1="4.12" y1="89.47" x2="95.88" y2="89.47" class="lt" stroke-width="0.55" stroke-opacity="1"/><line x1="4.12" y1="105.46" x2="95.88" y2="105.46" class="lt" stroke-width="0.45" stroke-opacity="0.85"/><line x1="4.12" y1="106.57" x2="95.88" y2="106.57" class="dl" stroke-width="0.25" stroke-opacity="0.35"/><line x1="50.52" y1="134.38" x2="82.99" y2="106.33" class="lt" stroke-width="0.3" stroke-opacity="0.55"/>';
const D_BODY = 'M4.12 18.71 L6.01 17.65 L8.00 16.25 L10.00 14.60 L11.95 12.79 L13.80 10.90 L15.46 9.01 L16.89 7.22 L18.00 5.60 L19.96 5.30 L21.98 4.93 L24.05 4.50 L26.18 4.02 L28.36 3.51 L30.59 2.99 L32.88 2.46 L35.20 1.95 L37.57 1.47 L39.98 1.03 L42.43 0.65 L44.92 0.34 L47.44 0.12 L50.00 0.00 L52.56 0.12 L55.08 0.34 L57.57 0.65 L60.02 1.03 L62.43 1.47 L64.80 1.95 L67.12 2.46 L69.41 2.99 L71.64 3.51 L73.82 4.02 L75.95 4.50 L78.02 4.93 L80.04 5.30 L82.00 5.60 L83.11 7.22 L84.54 9.01 L86.20 10.90 L88.05 12.79 L90.00 14.60 L92.00 16.25 L93.99 17.65 L95.88 18.71 L95.88 18.71 L95.88 18.71 L95.88 117.16 L95.79 118.22 L95.54 119.19 L95.12 120.09 L94.51 120.91 L93.72 121.66 L92.74 122.35 L91.57 122.98 L90.21 123.56 L87.31 124.45 L84.35 125.33 L81.37 126.20 L78.36 127.06 L75.34 127.91 L72.33 128.74 L69.33 129.55 L66.37 130.35 L63.45 131.12 L60.59 131.88 L57.80 132.60 L55.09 133.31 L52.49 133.98 L50.00 134.63 L47.51 133.98 L44.91 133.31 L42.20 132.60 L39.41 131.88 L36.55 131.12 L33.63 130.35 L30.67 129.55 L27.67 128.74 L24.66 127.91 L21.64 127.06 L18.63 126.20 L15.65 125.33 L12.69 124.45 L8.43 122.98 L7.26 122.35 L6.28 121.66 L5.49 120.91 L4.88 120.09 L4.46 119.19 L4.21 118.22 L4.12 117.16Z';
const D_IN1 = 'M6.39 20.20 L8.19 19.21 L10.08 17.90 L11.98 16.36 L13.84 14.66 L15.59 12.90 L17.17 11.13 L18.53 9.46 L19.58 7.94 L21.45 7.66 L23.36 7.32 L25.34 6.91 L27.36 6.47 L29.43 5.99 L31.56 5.50 L33.72 5.01 L35.93 4.53 L38.19 4.08 L40.48 3.67 L42.81 3.32 L45.17 3.03 L47.57 2.82 L50.00 2.71 L52.43 2.82 L54.83 3.03 L57.19 3.32 L59.52 3.67 L61.81 4.08 L64.07 4.53 L66.28 5.01 L68.44 5.50 L70.57 5.99 L72.64 6.47 L74.66 6.91 L76.64 7.32 L78.55 7.66 L80.42 7.94 L81.47 9.46 L82.83 11.13 L84.41 12.90 L86.16 14.66 L88.02 16.36 L89.92 17.90 L91.81 19.21 L93.61 20.20 L93.61 20.20 L93.61 20.20 L93.61 117.03 L93.56 117.69 L93.45 118.11 L93.26 118.51 L92.94 118.94 L92.43 119.42 L91.70 119.94 L90.73 120.46 L89.54 120.96 L86.75 121.82 L83.81 122.70 L80.83 123.57 L77.83 124.43 L74.83 125.27 L71.82 126.10 L68.83 126.91 L65.87 127.71 L62.96 128.48 L60.10 129.23 L57.31 129.96 L54.61 130.66 L52.01 131.34 L50.00 131.86 L47.99 131.34 L45.39 130.66 L42.69 129.96 L39.90 129.23 L37.04 128.48 L34.13 127.71 L31.17 126.91 L28.18 126.10 L25.17 125.27 L22.17 124.43 L19.17 123.57 L16.19 122.70 L13.29 121.83 L9.21 120.43 L8.30 119.94 L7.57 119.42 L7.06 118.94 L6.74 118.51 L6.55 118.11 L6.44 117.69 L6.39 117.03Z';
const D_IN2 = 'M7.84 21.15 L9.58 20.20 L11.40 18.95 L13.24 17.48 L15.04 15.86 L16.73 14.17 L18.26 12.48 L19.57 10.88 L20.60 9.43 L22.40 9.17 L24.25 8.83 L26.16 8.45 L28.11 8.02 L30.12 7.57 L32.17 7.10 L34.26 6.63 L36.40 6.17 L38.58 5.74 L40.79 5.35 L43.05 5.01 L45.33 4.74 L47.65 4.54 L50.00 4.43 L52.35 4.54 L54.67 4.74 L56.95 5.01 L59.21 5.35 L61.42 5.74 L63.60 6.17 L65.74 6.63 L67.83 7.10 L69.88 7.57 L71.89 8.02 L73.84 8.45 L75.75 8.83 L77.60 9.17 L79.40 9.43 L80.43 10.88 L81.74 12.48 L83.27 14.17 L84.96 15.86 L86.76 17.48 L88.60 18.95 L90.42 20.20 L92.16 21.15 L92.16 21.15 L92.16 21.15 L92.16 116.95 L92.13 117.35 L92.11 117.43 L92.08 117.50 L91.94 117.69 L91.61 118.00 L91.03 118.41 L90.19 118.86 L89.12 119.31 L86.39 120.15 L83.46 121.03 L80.49 121.90 L77.50 122.75 L74.50 123.60 L71.50 124.42 L68.51 125.23 L65.56 126.03 L62.64 126.80 L59.79 127.55 L57.01 128.28 L54.30 128.98 L51.70 129.65 L50.00 130.10 L48.30 129.65 L45.70 128.98 L42.99 128.28 L40.21 127.55 L37.36 126.80 L34.44 126.03 L31.49 125.23 L28.50 124.42 L25.50 123.60 L22.50 122.75 L19.51 121.90 L16.54 121.03 L13.66 120.17 L9.71 118.81 L8.97 118.41 L8.39 118.00 L8.06 117.69 L7.92 117.50 L7.89 117.43 L7.87 117.35 L7.84 116.95Z';
const D_IN3 = 'M5.80 19.78 L7.62 18.77 L9.53 17.44 L11.46 15.87 L13.35 14.14 L15.12 12.34 L16.73 10.55 L18.10 8.84 L19.17 7.30 L21.06 7.02 L23.00 6.66 L25.00 6.25 L27.05 5.79 L29.15 5.31 L31.30 4.81 L33.50 4.31 L35.74 3.83 L38.03 3.37 L40.35 2.95 L42.71 2.59 L45.11 2.30 L47.54 2.08 L50.00 1.97 L52.46 2.08 L54.89 2.30 L57.29 2.59 L59.65 2.95 L61.97 3.37 L64.26 3.83 L66.50 4.31 L68.70 4.81 L70.85 5.31 L72.95 5.79 L75.00 6.25 L77.00 6.66 L78.94 7.02 L80.83 7.30 L81.90 8.84 L83.27 10.55 L84.88 12.34 L86.65 14.14 L88.54 15.87 L90.47 17.44 L92.38 18.77 L94.20 19.78 L94.23 19.79 L94.23 117.06 L94.17 117.83 L94.02 118.41 L93.76 118.94 L93.37 119.48 L92.78 120.03 L91.98 120.60 L90.96 121.15 L89.72 121.67 L86.90 122.54 L83.96 123.42 L80.98 124.29 L77.98 125.15 L74.97 125.99 L71.96 126.82 L68.97 127.63 L66.01 128.43 L63.09 129.20 L60.23 129.95 L57.45 130.68 L54.74 131.38 L52.14 132.06 L50.00 132.62 L47.86 132.06 L45.26 131.38 L42.55 130.68 L39.77 129.95 L36.91 129.20 L33.99 128.43 L31.03 127.63 L28.04 126.82 L25.03 125.99 L22.02 125.15 L19.02 124.29 L16.04 123.42 L13.12 122.55 L9.00 121.12 L8.02 120.60 L7.22 120.03 L6.63 119.48 L6.24 118.94 L5.98 118.41 L5.83 117.83 L5.77 117.06Z';
const D_RAILS = ["M0.21 51.93 L1.55 48.24 L2.16 48.24 L2.16 115.31 L1.13 117.16 L0.21 115.31Z", "M2.37 41.47 L4.12 39.01 L4.12 120.85 L2.58 117.77Z", "M99.79 51.93 L98.45 48.24 L97.84 48.24 L97.84 115.31 L98.87 117.16 L99.79 115.31Z", "M97.63 41.47 L95.88 39.01 L95.88 120.85 L97.42 117.77Z"];

function CardArt() {
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  const st = (v: string) => ({ stopColor: `var(${v})` });
  const facets = CARD_FACETS.replace(/#(BD|TR)\)/g, `#${u}$1)`);
  return (
    <svg className="card-art" viewBox="0 0 100 135" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${u}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={st('--f1')} /><stop offset=".16" style={st('--f2')} /><stop offset=".34" style={st('--f3')} /><stop offset=".5" style={st('--f4')} /><stop offset=".68" style={st('--f5')} /><stop offset=".84" style={st('--f1')} /><stop offset="1" style={st('--f2')} />
        </linearGradient>
        <linearGradient id={`${u}r`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={st('--f3')} /><stop offset=".5" style={st('--f2')} /><stop offset="1" style={st('--f5')} />
        </linearGradient>
        <linearGradient id={`${u}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={st('--m1')} /><stop offset=".35" style={st('--m2')} /><stop offset=".62" style={st('--m3')} /><stop offset="1" style={st('--m4')} />
        </linearGradient>
        <linearGradient id={`${u}BD`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={st('--m2')} stopOpacity=".5" /><stop offset=".6" style={st('--dk')} stopOpacity=".62" /><stop offset="1" style={st('--dk')} stopOpacity=".92" />
        </linearGradient>
        <linearGradient id={`${u}TR`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={st('--dk')} stopOpacity=".55" /><stop offset="1" style={st('--dk')} stopOpacity=".9" />
        </linearGradient>
        <linearGradient id={`${u}sh`} gradientUnits="userSpaceOnUse" x1="0" y1="110" x2="100" y2="10">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".22" stopColor="#fff6cf" stopOpacity=".38" /><stop offset=".3" stopColor="#fff" stopOpacity="0" /><stop offset=".55" stopColor="#fff0b8" stopOpacity=".28" /><stop offset=".63" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${u}c`}><path d={D_IN1} /></clipPath>
      </defs>
      {D_RAILS.map((d, i) => <path key={i} d={d} fill={`url(#${u}r)`} style={{ stroke: 'var(--lt)' }} strokeOpacity=".75" strokeWidth=".9" vectorEffect="non-scaling-stroke" />)}
      <path d={D_BODY} fill={`url(#${u}f)`} style={{ stroke: 'var(--lt)' }} strokeOpacity=".95" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
      <path d={D_IN3} fill="none" style={{ stroke: 'var(--dl)' }} strokeOpacity=".35" strokeWidth=".8" vectorEffect="non-scaling-stroke" />
      <g clipPath={`url(#${u}c)`}>
        <rect width="100" height="135" fill={`url(#${u}m)`} />
        <image href={CARD_TEX} width="100" height="135" preserveAspectRatio="none" />
        <rect width="100" height="135" fill={`url(#${u}sh)`} />
        <g dangerouslySetInnerHTML={{ __html: facets }} />
      </g>
      <path d={D_IN1} fill="none" style={{ stroke: 'var(--lt)' }} strokeOpacity=".95" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d={D_IN2} fill="none" style={{ stroke: 'var(--lt)' }} strokeOpacity=".4" strokeWidth=".7" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const cardCss = playStyleCss + chemBadgeCss + `
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
  --card-art: url("${CARD_TEX}") 0 0 / 100% 100% no-repeat;
}
/* o ouro vem do degradê de baixo; a arte por cima só põe luz e sombra */
.cd-art { --a: #f3dc98; --b: #e8bd5e; --c: #cc9428; background: var(--card-art), linear-gradient(150deg, var(--a), var(--b) 52%, var(--c)); }
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
  aspect-ratio: 0.84;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  clip-path: var(--shield);
  background: transparent;
  color: var(--ink);
  overflow: hidden;
  box-shadow: none;
  text-align: center;
  transition: transform .2s ease, filter .2s ease;
}
button.player-card.player-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  clip-path: var(--shield);
  pointer-events: none;
  background: linear-gradient(118deg, rgba(255,255,255,.2) 0, rgba(255,255,255,0) 30%, rgba(255,255,255,.06) 58%, rgba(255,255,255,0) 74%);
}
.card-art .lt { stroke: var(--lt); }
.card-art .dl { stroke: var(--dl); }
button.player-card.player-card > svg.card-art { inset: 0; width: 100%; height: 100%; z-index: 0; display: block; pointer-events: none; }
button.player-card.player-card.gold { --f1:#ffeaa6; --f2:#f2c04a; --f3:#8a560a; --f4:#ffd45e; --f5:#b57c14; --m1:#f1cb66; --m2:#e3aa30; --m3:#d29a22; --m4:#b47a12; --dk:#3d2504; --lt:#ffe8a2; --dl:#6a3f04; --ink:#1c1300; }
button.player-card.player-card.special { --f1:#fffbd0; --f2:#ffe27a; --f3:#a8780c; --f4:#fff0a0; --f5:#d9a920; --m1:#f9e9a8; --m2:#f2cf58; --m3:#e6b02a; --m4:#c99414; --dk:#4a2f04; --lt:#fff6c8; --dl:#7a4d04; --ink:#1c1300; }
button.player-card.player-card.silver { --f1:#ffffff; --f2:#e4e8ee; --f3:#7d8895; --f4:#f6f8fb; --f5:#a3acb7; --m1:#f4f6f9; --m2:#dde2e8; --m3:#c3cad3; --m4:#a3acb7; --dk:#27303a; --lt:#ffffff; --dl:#4d5864; --ink:#1b2128; }
button.player-card.player-card.bronze { --f1:#ffe6cf; --f2:#f6c096; --f3:#7a3f1a; --f4:#ffd2ac; --f5:#b8693a; --m1:#f4bb8f; --m2:#e19c68; --m3:#d7864f; --m4:#b66a38; --dk:#361a08; --lt:#ffe6cf; --dl:#6a3414; --ink:#2a1408; }
button.player-card.player-card:not(:disabled):hover { transform: translateY(-4px); filter: brightness(1.07); box-shadow: none; border-color: transparent; }
button.player-card.player-card.selected { --f1:#ffffff; --f2:#fff3b0; --f3:#f5b800; --f4:#ffffff; --f5:#f5b800; transform: translateY(-4px); filter: brightness(1.1); box-shadow: none; border-color: transparent; }
button.player-card.player-card > * { position: absolute; z-index: 1; margin: 0; }
button.player-card.player-card .card-top {
  left: 2.4%;
  width: 41%;
  top: 13.5%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  color: var(--ink);
  font-family: 'Bebas Neue', Inter, sans-serif;
  font-weight: 400;
  font-size: 30px;
  font-size: 22.02cqw;
  line-height: .86;
  text-shadow: 0 1px 0 rgba(255,244,205,.45);
  -webkit-text-stroke: 0.79cqw var(--ink);
}
button.player-card.player-card .card-position { font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 14px; font-size: 12.33cqw; line-height: 1; color: var(--ink); letter-spacing: .02em; -webkit-text-stroke: 0.44cqw var(--ink); }
button.player-card.player-card strong {
  left: 0;
  right: 0;
  top: 66.3%;
  height: 11.8%;
  padding: 0 7%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  font-family: 'Bebas Neue', Inter, sans-serif;
  font-weight: 400;
  font-size: 13px;
  font-size: 11.45cqw;
  line-height: 1;
  letter-spacing: .03em;
  -webkit-text-stroke: 0.44cqw var(--ink);
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(255,244,205,.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
button.player-card.player-card .card-base { left: 0; right: 0; top: 81%; display: flex; align-items: center; justify-content: center; gap: 5.46cqw; }
button.player-card.player-card .card-flag { width: 13.04cqw; height: 9.60cqw; border-radius: 0.70cqw; box-shadow: 0 0 0 0.53cqw rgba(100,66,8,.55), 0 1px 2px rgba(0,0,0,.3); }
button.player-card.player-card .card-crest { position: relative; width: 11.45cqw; height: 12.60cqw; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); display: grid; place-items: center; }
button.player-card.player-card .card-crest::before { content: ''; position: absolute; inset: 0.79cqw 0.79cqw 0.88cqw; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); background: var(--cr); }
button.player-card.player-card .card-crest i { position: relative; margin-top: -1.06cqw; font: 900 normal 4.05cqw/1 Inter, sans-serif; letter-spacing: 0; color: var(--ci); }
`;
