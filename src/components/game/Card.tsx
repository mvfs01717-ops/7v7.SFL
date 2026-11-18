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
export const SHIELD_CLIP = 'polygon(0.0% 14.3%, 13.5% 7.0%, 16.7% 5.9%, 20.1% 4.9%, 23.6% 3.9%, 27.1% 3.0%, 30.8% 2.3%, 34.6% 1.6%, 38.4% 1.0%, 42.2% 0.6%, 46.1% 0.2%, 50.0% 0.0%, 53.9% 0.2%, 57.8% 0.6%, 61.6% 1.0%, 65.4% 1.6%, 69.2% 2.3%, 72.9% 3.0%, 76.4% 3.9%, 79.9% 4.9%, 83.3% 5.9%, 86.5% 7.0%, 100.0% 14.3%, 100.0% 88.5%, 99.9% 89.5%, 99.6% 90.3%, 99.2% 91.0%, 98.5% 91.6%, 97.6% 92.1%, 96.5% 92.6%, 91.6% 93.7%, 86.7% 94.7%, 81.8% 95.6%, 77.0% 96.5%, 72.3% 97.2%, 67.7% 97.9%, 63.1% 98.6%, 58.6% 99.1%, 54.3% 99.6%, 50.0% 100.0%, 45.7% 99.6%, 41.4% 99.1%, 36.9% 98.6%, 32.3% 97.9%, 27.7% 97.2%, 23.0% 96.5%, 18.2% 95.6%, 13.3% 94.7%, 8.4% 93.7%, 3.5% 92.6%, 2.4% 92.1%, 1.5% 91.6%, 0.8% 91.0%, 0.4% 90.3%, 0.1% 89.5%, 0.0% 88.5%)';

// Fundo das cartas: ouro com riscos finos diagonais, facetas escuras com arestas luminosas, faixa do nome, moldura interna e brilhos (SVG esticado ao cartão)
const CARD_ART_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 135" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c8" stop-opacity=".30"/><stop offset=".5" stop-color="#fff3c8" stop-opacity="0"/><stop offset="1" stop-color="#5a3600" stop-opacity=".14"/></linearGradient><linearGradient id="bd" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#b88f3a" stop-opacity=".4"/><stop offset=".6" stop-color="#7a5418" stop-opacity=".6"/><stop offset="1" stop-color="#4a3009" stop-opacity=".72"/></linearGradient><linearGradient id="tr" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#8a6420" stop-opacity=".45"/><stop offset="1" stop-color="#5a3c0c" stop-opacity=".7"/></linearGradient><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset=".8" stop-color="#4a2c00" stop-opacity="0"/><stop offset="1" stop-color="#4a2c00" stop-opacity=".22"/></linearGradient></defs><rect width="100" height="135" fill="url(#g)"/><line x1="31.49" y1="23.88" x2="49.82" y2="2.94" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.28"/><line x1="6.10" y1="50.64" x2="11.94" y2="44.84" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.23"/><line x1="53.19" y1="16.99" x2="72.38" y2="1.39" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.35"/><line x1="38.45" y1="85.84" x2="44.91" y2="80.39" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.30"/><line x1="52.20" y1="55.41" x2="70.52" y2="38.87" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.35"/><line x1="61.58" y1="40.51" x2="77.72" y2="22.01" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.37"/><line x1="47.97" y1="52.47" x2="70.55" y2="30.30" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.28"/><line x1="24.29" y1="26.05" x2="45.37" y2="2.06" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.33"/><line x1="84.14" y1="67.31" x2="96.63" y2="57.29" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.33"/><line x1="16.32" y1="38.23" x2="42.22" y2="12.36" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.42"/><line x1="55.29" y1="78.27" x2="67.86" y2="66.98" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.35"/><line x1="44.13" y1="75.61" x2="70.53" y2="49.77" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.17"/><line x1="67.56" y1="61.13" x2="96.63" y2="36.29" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.40"/><line x1="85.28" y1="38.60" x2="111.04" y2="12.21" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.32"/><line x1="21.40" y1="34.13" x2="42.84" y2="12.52" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.18"/><line x1="43.46" y1="53.80" x2="69.90" y2="31.19" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.40"/><line x1="94.77" y1="63.80" x2="107.82" y2="49.78" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.21"/><line x1="22.71" y1="30.07" x2="39.02" y2="14.80" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.25"/><line x1="14.47" y1="52.68" x2="32.79" y2="33.65" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.39"/><line x1="49.79" y1="58.91" x2="68.59" y2="37.29" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.29"/><line x1="38.20" y1="48.70" x2="51.58" y2="34.09" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.30"/><line x1="11.06" y1="57.65" x2="18.52" y2="50.61" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.48"/><line x1="59.18" y1="17.83" x2="68.74" y2="8.11" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.48"/><line x1="58.08" y1="48.15" x2="65.74" y2="40.69" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.32"/><line x1="30.35" y1="23.37" x2="53.31" y2="3.11" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.44"/><line x1="15.98" y1="14.29" x2="42.76" y2="-11.39" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.39"/><line x1="87.87" y1="69.46" x2="99.97" y2="58.37" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.39"/><line x1="25.50" y1="40.08" x2="34.74" y2="32.03" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.37"/><line x1="59.13" y1="71.74" x2="80.22" y2="48.76" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.44"/><line x1="71.22" y1="29.57" x2="87.62" y2="12.78" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.50"/><line x1="76.02" y1="48.00" x2="85.64" y2="39.06" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.31"/><line x1="90.05" y1="86.72" x2="116.18" y2="60.05" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.19"/><line x1="45.46" y1="37.91" x2="62.72" y2="24.09" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.32"/><line x1="62.92" y1="72.58" x2="70.09" y2="66.06" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.42"/><line x1="72.20" y1="48.44" x2="81.74" y2="40.18" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.18"/><line x1="90.93" y1="66.74" x2="107.13" y2="52.46" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.40"/><line x1="16.80" y1="22.09" x2="25.84" y2="14.61" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.36"/><line x1="57.47" y1="48.16" x2="82.22" y2="20.78" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.16"/><line x1="76.90" y1="67.08" x2="84.59" y2="60.32" stroke="#fff2c4" stroke-width="0.16" stroke-opacity="0.30"/><line x1="83.82" y1="74.57" x2="93.24" y2="64.53" stroke="#fff2c4" stroke-width="0.2" stroke-opacity="0.33"/><line x1="73.50" y1="37.02" x2="91.87" y2="21.40" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.47"/><line x1="34.35" y1="46.95" x2="53.85" y2="30.82" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.44"/><line x1="84.43" y1="22.37" x2="92.95" y2="14.15" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.42"/><line x1="58.68" y1="70.81" x2="66.60" y2="62.00" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.34"/><line x1="31.69" y1="51.46" x2="50.19" y2="35.42" stroke="#fff2c4" stroke-width="0.12" stroke-opacity="0.46"/><line x1="5.99" y1="26.91" x2="11.57" y2="20.60" stroke="#fff2c4" stroke-width="0.26" stroke-opacity="0.35"/><line x1="68.88" y1="81.59" x2="81.62" y2="69.77" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.16"/><line x1="46.60" y1="66.45" x2="59.33" y2="54.26" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.16"/><line x1="85.19" y1="66.89" x2="106.41" y2="49.61" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.13"/><line x1="50.86" y1="83.71" x2="68.81" y2="63.70" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.11"/><line x1="40.30" y1="23.71" x2="48.71" y2="14.10" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.18"/><line x1="71.03" y1="80.52" x2="78.95" y2="73.47" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.18"/><line x1="13.41" y1="79.55" x2="33.70" y2="57.65" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.21"/><line x1="36.36" y1="52.29" x2="59.25" y2="32.81" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.12"/><line x1="39.35" y1="54.24" x2="49.53" y2="43.15" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.14"/><line x1="65.47" y1="20.05" x2="79.70" y2="5.94" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.10"/><line x1="30.36" y1="61.70" x2="42.97" y2="47.25" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.22"/><line x1="71.43" y1="85.67" x2="77.96" y2="78.74" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.10"/><line x1="70.58" y1="37.34" x2="77.72" y2="30.22" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.21"/><line x1="74.18" y1="36.53" x2="82.25" y2="29.89" stroke="#8a5a0c" stroke-width="0.14" stroke-opacity="0.17"/><polygon points="6.18,89.47 71.91,42.70 100.00,21.78 100.00,37.16 97.75,37.16 26.40,89.47" fill="url(#bd)" fill-opacity="1" /><polygon points="86.52,9.48 100.00,19.32 100.00,21.78 71.91,42.70" fill="url(#tr)" fill-opacity="1" /><polygon points="26.40,89.47 97.75,37.16 87.08,89.47" fill="#7a5516" fill-opacity="0.34" /><polygon points="97.75,37.16 100.00,37.16 100.00,89.47 87.08,89.47" fill="#2c1c06" fill-opacity="0.62" /><line x1="6.18" y1="89.47" x2="71.91" y2="42.70" stroke="#fff1bd" stroke-width="0.4" stroke-opacity="0.45"/><line x1="71.91" y1="42.70" x2="100.00" y2="21.78" stroke="#fff1bd" stroke-width="0.55" stroke-opacity="0.9"/><line x1="71.91" y1="42.70" x2="86.52" y2="9.48" stroke="#fff1bd" stroke-width="0.5" stroke-opacity="0.9"/><line x1="26.40" y1="87.62" x2="97.75" y2="37.16" stroke="#fff1bd" stroke-width="0.6" stroke-opacity="0.95"/><line x1="97.75" y1="37.16" x2="87.08" y2="89.47" stroke="#fff1bd" stroke-width="0.55" stroke-opacity="0.9"/><line x1="86.52" y1="9.48" x2="100.00" y2="19.32" stroke="#fff1bd" stroke-width="0.3" stroke-opacity="0.5"/><line x1="9.55" y1="89.47" x2="52.25" y2="60.55" stroke="#fff1bd" stroke-width="0.18" stroke-opacity="0.35"/><circle cx="88.2" cy="62.9" r="0.45" fill="#ffd978" opacity="0.91"/><circle cx="81.5" cy="55.0" r="0.28" fill="#ffd978" opacity="0.59"/><circle cx="84.4" cy="89.2" r="0.2" fill="#ffd978" opacity="0.82"/><circle cx="63.0" cy="86.3" r="0.45" fill="#ffd978" opacity="0.78"/><circle cx="89.5" cy="76.3" r="0.36" fill="#ffd978" opacity="0.94"/><circle cx="72.8" cy="83.6" r="0.2" fill="#ffd978" opacity="0.49"/><circle cx="86.8" cy="83.2" r="0.36" fill="#ffd978" opacity="0.75"/><circle cx="89.5" cy="51.4" r="0.36" fill="#ffd978" opacity="0.64"/><circle cx="63.0" cy="65.3" r="0.2" fill="#ffd978" opacity="0.50"/><circle cx="85.3" cy="47.9" r="0.45" fill="#ffd978" opacity="0.46"/><circle cx="79.2" cy="72.1" r="0.45" fill="#ffd978" opacity="0.82"/><circle cx="85.0" cy="47.6" r="0.2" fill="#ffd978" opacity="0.86"/><circle cx="77.2" cy="52.0" r="0.28" fill="#ffd978" opacity="0.77"/><circle cx="87.2" cy="52.3" r="0.28" fill="#ffd978" opacity="0.82"/><circle cx="76.6" cy="78.1" r="0.28" fill="#ffd978" opacity="0.49"/><circle cx="80.5" cy="55.7" r="0.2" fill="#ffd978" opacity="0.69"/><circle cx="63.7" cy="88.1" r="0.28" fill="#ffd978" opacity="0.79"/><circle cx="62.3" cy="63.5" r="0.28" fill="#ffd978" opacity="0.61"/><circle cx="80.7" cy="53.6" r="0.36" fill="#ffd978" opacity="0.89"/><circle cx="52.6" cy="81.7" r="0.36" fill="#ffd978" opacity="0.87"/><circle cx="90.8" cy="54.9" r="0.45" fill="#ffd978" opacity="0.65"/><circle cx="81.3" cy="82.4" r="0.2" fill="#ffd978" opacity="0.87"/><circle cx="50.6" cy="86.3" r="0.36" fill="#ffd978" opacity="0.67"/><circle cx="63.5" cy="73.4" r="0.28" fill="#ffd978" opacity="0.49"/><circle cx="64.6" cy="80.3" r="0.45" fill="#ffd978" opacity="0.90"/><circle cx="50.1" cy="87.9" r="0.28" fill="#ffd978" opacity="0.50"/><circle cx="90.5" cy="59.6" r="0.45" fill="#ffd978" opacity="0.93"/><circle cx="87.3" cy="83.3" r="0.2" fill="#ffd978" opacity="0.66"/><circle cx="66.4" cy="63.6" r="0.2" fill="#ffd978" opacity="0.56"/><circle cx="87.2" cy="84.4" r="0.2" fill="#ffd978" opacity="0.45"/><circle cx="93.5" cy="50.2" r="0.2" fill="#ffd978" opacity="0.46"/><circle cx="89.6" cy="64.0" r="0.28" fill="#ffd978" opacity="0.46"/><circle cx="58.9" cy="72.4" r="0.28" fill="#ffd978" opacity="0.70"/><circle cx="76.0" cy="61.3" r="0.45" fill="#ffd978" opacity="0.91"/><circle cx="84.0" cy="76.8" r="0.28" fill="#ffd978" opacity="0.70"/><circle cx="45.1" cy="78.1" r="0.45" fill="#ffd978" opacity="0.56"/><circle cx="75.4" cy="87.0" r="0.45" fill="#ffd978" opacity="0.48"/><circle cx="59.1" cy="75.4" r="0.45" fill="#ffd978" opacity="0.90"/><circle cx="92.7" cy="56.9" r="0.45" fill="#ffd978" opacity="0.47"/><circle cx="75.3" cy="59.3" r="0.36" fill="#ffd978" opacity="0.67"/><circle cx="89.7" cy="68.1" r="0.45" fill="#ffd978" opacity="0.63"/><circle cx="85.6" cy="80.8" r="0.2" fill="#ffd978" opacity="0.80"/><circle cx="80.1" cy="63.9" r="0.28" fill="#ffd978" opacity="0.86"/><circle cx="92.0" cy="53.4" r="0.36" fill="#ffd978" opacity="0.63"/><circle cx="53.9" cy="87.2" r="0.36" fill="#ffd978" opacity="0.91"/><circle cx="84.5" cy="86.9" r="0.28" fill="#ffd978" opacity="0.50"/><circle cx="83.1" cy="69.8" r="0.45" fill="#ffd978" opacity="0.83"/><circle cx="78.3" cy="62.6" r="0.45" fill="#ffd978" opacity="0.68"/><circle cx="90.1" cy="52.3" r="0.2" fill="#ffd978" opacity="0.84"/><circle cx="50.4" cy="85.0" r="0.2" fill="#ffd978" opacity="0.65"/><circle cx="91.6" cy="42.8" r="0.2" fill="#ffd978" opacity="0.48"/><circle cx="71.2" cy="81.1" r="0.2" fill="#ffd978" opacity="0.64"/><circle cx="88.5" cy="62.7" r="0.2" fill="#ffd978" opacity="0.50"/><circle cx="70.9" cy="71.0" r="0.36" fill="#ffd978" opacity="0.62"/><circle cx="85.4" cy="60.7" r="0.36" fill="#ffd978" opacity="0.49"/><circle cx="83.9" cy="73.1" r="0.2" fill="#ffd978" opacity="0.78"/><circle cx="80.6" cy="83.8" r="0.2" fill="#ffd978" opacity="0.88"/><circle cx="44.9" cy="76.2" r="0.2" fill="#ffd978" opacity="0.67"/><circle cx="55.8" cy="78.4" r="0.2" fill="#ffd978" opacity="0.73"/><circle cx="73.8" cy="85.1" r="0.36" fill="#ffd978" opacity="0.82"/><circle cx="51.7" cy="81.6" r="0.45" fill="#ffd978" opacity="0.61"/><circle cx="71.6" cy="71.8" r="0.28" fill="#ffd978" opacity="0.77"/><circle cx="87.8" cy="71.0" r="0.28" fill="#ffd978" opacity="0.86"/><circle cx="58.1" cy="66.0" r="0.2" fill="#ffd978" opacity="0.52"/><circle cx="75.8" cy="73.3" r="0.45" fill="#ffd978" opacity="0.75"/><circle cx="67.9" cy="71.3" r="0.45" fill="#ffd978" opacity="0.60"/><circle cx="86.5" cy="80.3" r="0.2" fill="#ffd978" opacity="0.51"/><circle cx="60.8" cy="65.7" r="0.28" fill="#ffd978" opacity="0.49"/><circle cx="79.8" cy="78.7" r="0.2" fill="#ffd978" opacity="0.83"/><circle cx="90.3" cy="72.6" r="0.2" fill="#ffd978" opacity="0.88"/><circle cx="90.4" cy="54.2" r="0.28" fill="#ffd978" opacity="0.58"/><circle cx="70.6" cy="70.8" r="0.36" fill="#ffd978" opacity="0.47"/><circle cx="90.4" cy="49.1" r="0.2" fill="#ffd978" opacity="0.83"/><circle cx="90.4" cy="53.1" r="0.45" fill="#ffd978" opacity="0.82"/><circle cx="79.8" cy="77.2" r="0.36" fill="#ffd978" opacity="0.76"/><circle cx="72.7" cy="63.9" r="0.28" fill="#ffd978" opacity="0.80"/><circle cx="90.2" cy="69.8" r="0.45" fill="#ffd978" opacity="0.57"/><circle cx="90.9" cy="43.0" r="0.45" fill="#ffd978" opacity="0.54"/><circle cx="42.4" cy="85.2" r="0.28" fill="#ffd978" opacity="0.52"/><circle cx="87.1" cy="77.1" r="0.45" fill="#ffd978" opacity="0.54"/><rect x="0" y="89.47" width="100" height="16.00" fill="#ffe9a0" fill-opacity=".22"/><polygon points="0.00,105.46 17.98,90.08 34.27,90.08 17.42,105.46" fill="#5a3a08" fill-opacity="0.3" /><polygon points="67.98,105.46 84.83,90.08 100.00,90.08 100.00,105.46" fill="#5a3a08" fill-opacity="0.34" /><line x1="0.00" y1="89.47" x2="100.00" y2="89.47" stroke="#fff4c8" stroke-width="0.5" stroke-opacity="0.95"/><line x1="0.00" y1="105.46" x2="100.00" y2="105.46" stroke="#fff4c8" stroke-width="0.4" stroke-opacity="0.8"/><line x1="0.00" y1="106.33" x2="100.00" y2="106.33" stroke="#7a4d08" stroke-width="0.25" stroke-opacity="0.3"/><polygon points="50.56,135.00 67.98,123.31 84.83,106.33 100.00,106.33 100.00,118.39 67.98,135.00" fill="#3a2306" fill-opacity="0.4" /><line x1="50.56" y1="134.38" x2="85.96" y2="106.33" stroke="#fff1bd" stroke-width="0.3" stroke-opacity="0.5"/><rect width="100" height="135" fill="url(#v)"/><path d="M1.75 21.09 L14.78 11.58 L17.89 10.14 L21.13 8.79 L24.48 7.55 L27.94 6.42 L31.48 5.40 L35.10 4.52 L38.77 3.78 L42.49 3.18 L46.24 2.74 L50.00 2.46 L53.76 2.74 L57.51 3.18 L61.23 3.78 L64.90 4.52 L68.52 5.40 L72.06 6.42 L75.52 7.55 L78.87 8.79 L82.11 10.14 L85.22 11.58 L98.25 21.09 L98.25 117.75 L98.17 119.01 L97.91 120.06 L97.47 120.96 L96.82 121.74 L95.96 122.43 L94.87 123.09 L90.11 124.49 L85.39 125.80 L80.71 127.00 L76.09 128.12 L71.53 129.13 L67.05 130.05 L62.64 130.87 L58.33 131.59 L54.11 132.21 L50.00 132.73 L45.89 132.21 L41.67 131.59 L37.36 130.87 L32.95 130.05 L28.47 129.13 L23.91 128.12 L19.29 127.00 L14.61 125.80 L9.89 124.49 L5.13 123.09 L4.04 122.43 L3.18 121.74 L2.53 120.96 L2.09 120.06 L1.83 119.01 L1.75 117.75Z" fill="none" stroke="#fff3c2" stroke-opacity=".7" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M2.75 22.10 L15.51 12.79 L18.55 11.38 L21.73 10.06 L25.01 8.84 L28.40 7.74 L31.87 6.75 L35.41 5.88 L39.01 5.15 L42.65 4.57 L46.32 4.14 L50.00 3.86 L53.68 4.14 L57.35 4.57 L60.99 5.15 L64.59 5.88 L68.13 6.75 L71.60 7.74 L74.99 8.84 L78.27 10.06 L81.45 11.38 L84.49 12.79 L97.25 22.10 L97.25 116.76 L97.17 117.99 L96.92 119.03 L96.48 119.91 L95.85 120.67 L95.01 121.35 L93.94 122.00 L89.28 123.37 L84.66 124.64 L80.08 125.83 L75.55 126.92 L71.09 127.91 L66.69 128.81 L62.38 129.61 L58.15 130.32 L54.02 130.93 L50.00 131.44 L45.98 130.93 L41.85 130.32 L37.62 129.61 L33.31 128.81 L28.91 127.91 L24.45 126.92 L19.92 125.83 L15.34 124.64 L10.72 123.37 L6.06 122.00 L4.99 121.35 L4.15 120.67 L3.52 119.91 L3.08 119.03 L2.83 117.99 L2.75 116.76Z" fill="none" stroke="#6b4306" stroke-opacity=".28" stroke-width=".8" vector-effect="non-scaling-stroke"/></svg>';
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
.cd-art { --a: #ecc66e; --b: #e3b353; --c: #d4a243; background: var(--card-art), var(--card-pat), linear-gradient(150deg, var(--a), var(--b) 52%, var(--c)); }
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
  inset: 1.9cqw;
  clip-path: var(--shield);
  pointer-events: none;
}
button.player-card.player-card::before { background: var(--card-art), var(--card-pat), var(--face); }
button.player-card.player-card::after { background: linear-gradient(118deg, rgba(255,255,255,.28) 0, rgba(255,255,255,0) 34%, rgba(255,255,255,.08) 60%, rgba(255,255,255,0) 76%); }
button.player-card.player-card.gold { --frame: linear-gradient(150deg, #fff6c9, #f0cf72 32%, #b98a28 62%, #fbe49a); --face: linear-gradient(150deg, #ecc66e, #e3b353 45%, #dba84a 75%, #cf9f43); --ink: #1c1300; }
button.player-card.player-card.special { --frame: linear-gradient(150deg, #fff6c8, #d9a920 34%, #8a600a 62%, #ffe27a); --face: linear-gradient(150deg, #f9e9a8, #efca4e 38%, #e0aa24 70%, #bf8e14); --ink: #1c1300; }
button.player-card.player-card.silver { --frame: linear-gradient(160deg, #f4f6f8, #808b97); }
button.player-card.player-card.bronze { --frame: linear-gradient(160deg, #f6c096, #8a4a22); --face: linear-gradient(165deg, #f4bb8f, #d7864f 58%, #b66a38); --ink: #2a1408; }
button.player-card.player-card:not(:disabled):hover { transform: translateY(-4px); filter: brightness(1.07); box-shadow: none; border-color: transparent; }
button.player-card.player-card.selected { --frame: linear-gradient(160deg, #ffffff, #f5b800); transform: translateY(-4px); filter: brightness(1.1); box-shadow: none; border-color: transparent; }
button.player-card.player-card.selected::before, button.player-card.player-card.selected::after { inset: 5px; }
button.player-card.player-card > * { position: absolute; z-index: 1; margin: 0; }
button.player-card.player-card .card-top {
  left: 0;
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
  font-size: 27cqw;
  line-height: .86;
  text-shadow: 0 1px 0 rgba(255,244,205,.45);
  -webkit-text-stroke: .9cqw var(--ink);
}
button.player-card.player-card .card-position { font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 14px; font-size: 15cqw; line-height: 1; color: var(--ink); letter-spacing: .02em; -webkit-text-stroke: .5cqw var(--ink); }
button.player-card.player-card strong {
  left: 0;
  right: 0;
  top: 66.3%;
  height: 11.8%;
  padding: 0 9%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  font-family: 'Bebas Neue', Inter, sans-serif;
  font-weight: 400;
  font-size: 13px;
  font-size: 14cqw;
  line-height: 1;
  letter-spacing: .03em;
  -webkit-text-stroke: .5cqw var(--ink);
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(255,244,205,.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
button.player-card.player-card .card-base { left: 0; right: 0; top: 81%; display: flex; align-items: center; justify-content: center; gap: 6.5cqw; }
button.player-card.player-card .card-flag { width: 16cqw; height: 11.8cqw; border-radius: .8cqw; box-shadow: 0 0 0 .6cqw rgba(100,66,8,.55), 0 1px 2px rgba(0,0,0,.3); }
button.player-card.player-card .card-crest { position: relative; width: 14cqw; height: 15.5cqw; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); display: grid; place-items: center; }
button.player-card.player-card .card-crest::before { content: ''; position: absolute; inset: .9cqw .9cqw 1cqw; clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); background: var(--cr); }
button.player-card.player-card .card-crest i { position: relative; margin-top: -1.2cqw; font: 900 normal 4.6cqw/1 Inter, sans-serif; letter-spacing: 0; color: var(--ci); }
`;
