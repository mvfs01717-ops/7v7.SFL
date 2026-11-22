// Emblema de PlayStyle no formato da referência (FC): gema de topo reto com ombros e ponta embaixo, borda escura fina, acabamento metálico e símbolo escuro centralizado.
// O mesmo símbolo vale para ouro e prata; só muda o acabamento. Nenhum indicador de nível aparece no emblema.
import { useId } from 'react';
import type { PsTier } from '@/lib/game/playStyles';

const S = 'fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor" stroke="none"';
const ball = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${S}/><path d="M${cx} ${cy - r * 0.45} l${r * 0.43} ${r * 0.32} l-${r * 0.16} ${r * 0.5} h-${r * 0.54} l-${r * 0.16} -${r * 0.5} z" ${F}/>`;
const shield = `<path d="M12 2.5 L20 5.5 V12 Q20 18.5 12 21.8 Q4 18.5 4 12 V5.5 Z" ${S}/>`;
const bolt = `<path d="M13.5 2 L5 13.5 h6 l-1.2 8.5 L19 10 h-6.2 z" ${F}/>`;
const eye = `<path d="M2 12 Q12 3.5 22 12 Q12 20.5 2 12 Z" ${S}/>`;
const hand = `<rect x="5" y="3.5" width="2.8" height="9" rx="1.4" ${F}/><rect x="8.6" y="2" width="2.8" height="10" rx="1.4" ${F}/><rect x="12.2" y="2" width="2.8" height="10" rx="1.4" ${F}/><rect x="15.8" y="3.5" width="2.8" height="9" rx="1.4" ${F}/><path d="M4.5 11 h14.2 v3 Q18.7 21.5 11.6 21.5 Q4.5 21.5 4.5 14 Z" ${F}/><path d="M4.6 12 L1.6 8.8" ${S}/>`;

// Símbolos 24x24 (um por PlayStyle)
export const GLYPH: Record<string, string> = {
  finalizacaoPrecisa: `<circle cx="12" cy="12" r="8" ${S}/><circle cx="12" cy="12" r="2.6" ${F}/><path d="M12 1.5v5 M12 17.5v5 M1.5 12h5 M17.5 12h5" ${S}/>`,
  chutePotente: `${ball(16, 12, 5.8)}<path d="M2.5 8.5h6 M1.5 12h6 M2.5 15.5h6" ${S}/>`,
  primeiroToque: `${ball(12, 9, 5.2)}<path d="M4.5 18.5 Q12 23.5 19.5 18.5" ${S}/>`,
  passeCirurgico: `<path d="M3.5 20 Q6 6 16.5 7.2" ${S}/><path d="M13.5 3.6 L17.2 7.2 L13.2 10.2" ${S}/><circle cx="19.5" cy="5" r="2.4" ${F}/><circle cx="4" cy="20" r="1.8" ${F}/>`,
  visaoDeJogo: `${eye}<circle cx="12" cy="12" r="3.4" ${F}/>`,
  driblador: `<path d="M3.5 20 L9 8.5 L14 17.5 L19 6.5" ${S}/><circle cx="19.5" cy="5" r="2.8" ${F}/>`,
  arranqueExplosivo: bolt,
  bolaColocada: `<path d="M3 20.5 Q5 5 15 8" ${S}/><circle cx="18" cy="8.5" r="4" ${S}/><circle cx="18" cy="8.5" r="1.3" ${F}/>`,
  cabeceador: `<circle cx="12" cy="5" r="3" ${F}/><path d="M5.5 22 V18.5 a6.5 6.5 0 0 1 13 0 V22" ${S}/>`,
  pivoTecnico: `${shield}<circle cx="12" cy="12" r="3.3" ${F}/>`,
  desarmePreciso: `${shield}<path d="M8.8 9.3 L15.2 15.7 M15.2 9.3 L8.8 15.7" ${S}/>`,
  interceptador: `${shield}<path d="M7.5 12 h8 M12.8 8.8 L16 12 L12.8 15.2" ${S}/>`,
  bloqueador: `<rect x="3" y="4" width="18" height="16" rx="1.5" ${S}/><path d="M3 9.3h18 M3 14.7h18 M12 4v5.3 M7.5 9.3v5.4 M16.5 9.3v5.4 M12 14.7V20" ${S}/>`,
  marcacaoIntensa: `<circle cx="8" cy="12" r="4.6" ${S}/><circle cx="16.5" cy="12" r="4.6" ${F}/>`,
  recuperador: `<path d="M20 12 a8 8 0 1 1 -2.6 -5.9" ${S}/><path d="M18.5 1.8 V7 h-5.2" ${S}/><circle cx="12" cy="12" r="2.2" ${F}/>`,
  leituraDefensiva: `${shield}<path d="M7.2 12 Q12 7.5 16.8 12 Q12 16.5 7.2 12 Z" ${S}/><circle cx="12" cy="12" r="1.6" ${F}/>`,
  dominanciaAerea: `<path d="M3 18.5 L3.8 7 L9 12.2 L12 4.8 L15 12.2 L20.2 7 L21 18.5 Z" ${F}/><rect x="3" y="19.8" width="18" height="2.2" rx="1" ${F}/>`,
  perseguidor: `<path d="M3.5 6.5 L9.5 12 L3.5 17.5 M11.5 6.5 L17.5 12 L11.5 17.5" ${S}/><circle cx="21" cy="12" r="1.7" ${F}/>`,
  desmarcacaoInteligente: `<circle cx="6" cy="18" r="3.2" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2"/><path d="M9 15 L19.5 4.5 M13.5 4.2 H19.8 V10.5" ${S}/>`,
  infiltracao: `<path d="M13.5 2.5 V21.5" ${S} stroke-dasharray="2.6 2.6"/><path d="M2.5 12 H20 M15.8 7.8 L20 12 L15.8 16.2" ${S}/>`,
  mobilidade: `<path d="M12 2.5 V21.5 M2.5 12 H21.5 M9.3 5.2 L12 2.5 L14.7 5.2 M9.3 18.8 L12 21.5 L14.7 18.8 M5.2 9.3 L2.5 12 L5.2 14.7 M18.8 9.3 L21.5 12 L18.8 14.7" ${S}/>`,
  apoioConstante: `<path d="M12 12 L4.5 5.5 M12 12 L19.5 5.5 M12 12 V19.5" ${S}/><circle cx="12" cy="12" r="3.2" ${F}/><circle cx="4.5" cy="5.5" r="2.2" ${F}/><circle cx="19.5" cy="5.5" r="2.2" ${F}/><circle cx="12" cy="20" r="2.2" ${F}/>`,
  contraAtaque: `<path d="M3.5 20 Q3.5 8 12 8 H19 M15.2 4 L19.2 8 L15.2 12" ${S}/><path d="M3.5 20 L3.5 16" ${S}/>`,
  equilibrioTatico: `<path d="M12 3.5 V20 M5 6.8 H19 M7.5 20.5 H16.5" ${S}/><path d="M5 6.8 L2.2 13.8 H7.8 Z M19 6.8 L16.2 13.8 H21.8 Z" ${S}/>`,
  criadorDeEspaco: `<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.6"/><circle cx="12" cy="12" r="2.8" ${F}/>`,
  antecipacao: `<circle cx="12" cy="12" r="8.6" ${S}/><path d="M12 6.8 V12 L15.8 14.2" ${S}/>`,
  instintoGoleador: `<path d="M12 2.2 L14.8 8.6 L21.6 9.2 L16.4 13.7 L18 20.4 L12 16.9 L6 20.4 L7.6 13.7 L2.4 9.2 L9.2 8.6 Z" ${F}/>`,
  maestro: `<path d="M12 12 C9.5 6.5 3 6.5 3 12 C3 17.5 9.5 17.5 12 12 C14.5 6.5 21 6.5 21 12 C21 17.5 14.5 17.5 12 12 Z" ${S} stroke-width="2.6"/>`,
  muralha: `<path d="M3.5 21.5 V8 H7 V11 H9.8 V8 H14.2 V11 H17 V8 H20.5 V21.5 Z" ${F}/>`,
  decisivo: `<circle cx="12" cy="6.2" r="3.6" ${F}/><path d="M8.2 19.5 L10 11.2 H14 L15.8 19.5 Z" ${F}/><rect x="5.8" y="19.5" width="12.4" height="2.6" rx="1.2" ${F}/>`,
  gkReflexo: hand,
  gkColocado: `<path d="M2.5 20 V6 H21.5 V20" ${S}/><circle cx="17" cy="10.5" r="3.2" ${S}/><circle cx="17" cy="10.5" r="1.2" ${F}/>`,
  gkPotente: `${ball(11, 12, 5)}<path d="M1.8 8.6h3.6 M1.8 12h3 M1.8 15.4h3.6" ${S}/><rect x="19" y="4" width="3" height="16" rx="1.5" ${F}/>`,
  gkSaida: `<path d="M4 3.5 H20 V10 H4 Z" ${S}/><path d="M12 10.5 V21.5 M7.8 17.3 L12 21.5 L16.2 17.3" ${S}/>`,
  gkArea: `<rect x="2.5" y="4.5" width="19" height="15" rx="1" ${S}/><rect x="7.8" y="4.5" width="8.4" height="6" ${S}/><circle cx="12" cy="15" r="1.6" ${F}/>`,
  gkDistribuicao: `<circle cx="5" cy="18.5" r="2.6" ${F}/><path d="M5 18.5 L18.5 5.5 M5 18.5 L20.5 12 M5 18.5 L15.5 20" ${S}/><circle cx="18.8" cy="5.2" r="1.8" ${F}/><circle cx="20.6" cy="12" r="1.8" ${F}/><circle cx="16" cy="20.2" r="1.8" ${F}/>`,
  gkReposicao: `<circle cx="12" cy="12" r="9.2" ${S}/><path d="M13 5.5 L8.5 12.6 h4 l-1.2 5.7 L16 11 h-4.2 z" ${F}/>`,
  gkLeitura: `${eye}<circle cx="12" cy="12" r="3.6" ${S}/><circle cx="12" cy="12" r="1.2" ${F}/>`,
  gkUmContraUm: `<circle cx="5.5" cy="12" r="3.4" ${F}/><circle cx="18.5" cy="12" r="3.4" ${S}/><path d="M10.5 12 H13.5" ${S}/><path d="M12 5 V8.2 M12 15.8 V19" ${S}/>`,
};

const PAL = {
  gold: { rim: '#3d2800', hi: '#fff6c4', a: '#fff0a8', b: '#f2bf30', c: '#b9810d', ink: '#2c1b00', glow: 'rgba(255,205,70,.55)' },
  silver: { rim: '#232a33', hi: '#ffffff', a: '#ffffff', b: '#cdd4de', c: '#7f8998', ink: '#1b222b', glow: 'rgba(255,255,255,.45)' },
} as const;

// Gema: topo reto, ombros, ponta embaixo (viewBox 100 x 100)
const GEM = 'M24 5 H76 L96 28 V50 L50 96 L4 50 V28 Z';
const GEM_IN = 'M26.5 10.5 H73.5 L90.5 29.5 V48.5 L50 89.5 L9.5 48.5 V29.5 Z';

export function PsEmblem({ id, tier, size = 34, fluid = false }: { id: string; tier: PsTier; size?: number; fluid?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const p = PAL[tier];
  const g = GLYPH[id] ?? '';
  return (
    <svg className={`ps-emb ${tier}`} width={fluid ? '100%' : size} height={fluid ? undefined : size} viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false" style={{ ...(fluid ? { width: '100%', height: 'auto' } : {}), filter: `drop-shadow(0 0 ${size * 0.12}px ${p.glow}) drop-shadow(0 ${size * 0.05}px ${size * 0.07}px rgba(0,0,0,.45))` }}>
      <defs>
        <linearGradient id={`f${uid}`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={p.a} />
          <stop offset="0.45" stopColor={p.b} />
          <stop offset="1" stopColor={p.c} />
        </linearGradient>
        <linearGradient id={`s${uid}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={p.hi} stopOpacity="0.95" />
          <stop offset="0.5" stopColor={p.hi} stopOpacity="0.05" />
          <stop offset="1" stopColor={p.hi} stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <path d={GEM} fill={`url(#f${uid})`} stroke={p.rim} strokeWidth="6" strokeLinejoin="round" />
      <path d={GEM_IN} fill="none" stroke={`url(#s${uid})`} strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M27 11.5 H73 L85 26 H15 Z" fill={p.hi} opacity="0.22" />
      <g transform="translate(24.5 14.5) scale(2.1)" color={p.ink} dangerouslySetInnerHTML={{ __html: g }} />
    </svg>
  );
}
