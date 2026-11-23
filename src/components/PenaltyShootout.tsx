import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { stadiumCss } from '@/lib/game/stadiumCss';
import { fetchRoom, patchRoom, type NetChoice, type NetKick } from '@/lib/multiplayer';
import {
  STYLES,
  STYLE_INFO,
  accOf,
  botKeeper,
  botShooter,
  keeperReact,
  markerAt,
  markerPeriod,
  newPenHist,
  noteDive,
  noteShot,
  pressureOf,
  resolvePenalty,
  sanitizeKeeper,
  sanitizeShot,
  simulateKick,
  zoneAt,
  zonesFor,
  type KeeperChoice,
  type PMode,
  type POutcome,
  type PStyle,
  type ShotOut,
} from '@/lib/game/penalty';

// Disputa de pênaltis (inspirada no FC): câmera atrás do cobrador, mira, indicador de PRECISÃO (timing: vermelho, amarelo, verde)
// e indicador de FORÇA (tempo de botão) independentes, três estilos (Normal, Colocado, Cavadinha) e goleiro com controle próprio.
//  - Cobrador: mire (arraste/mouse/setas), escolha o estilo, aperte CHUTAR no momento certo do marcador (trava a precisão) e
//    mantenha pressionado para carregar a força; soltar chuta. Espaço faz o mesmo no teclado.
//  - Goleiro: desloque-se na linha (◀ ▶), escolha Antecipar (decide antes, alcance cheio) ou Reagir (lê a bola, chega mais tarde),
//    toque no ponto do gol para se atirar ou fique no centro. Ele não vê a mira do cobrador.
//  - Multiplayer (prop `net`): os dois escolhem ao mesmo tempo; o anfitrião valida as faixas, calcula o resultado e grava; as duas
//    telas tocam a mesma animação. Espectadores só assistem. Contra BOT, o BOT decide por conta própria (lib/game/penalty).
// Os jogadores são discos: toda a ação é deslocamento, giro e aceleração dos discos e da bola.

type Side = 'user' | 'bot';
export type ShootoutKick = { side: Side; playerId: string; scored: boolean };
export type Shootout = { kicks: ShootoutKick[]; userGoals: number; botGoals: number; winner: Side };
type PenaltyTeam = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
type PenaltyPlayer = { id: string; name: string; overall: number; primary_position: string; slot?: string };
const posOf = (player: PenaltyPlayer) => player.slot ?? player.primary_position;
type Outcome = POutcome;
type Phase = 'aim' | 'power' | 'dive' | 'wait' | 'flying' | 'done';
type Point = { x: number; y: number };
type KickPlan = {
  side: Side;
  playerId: string;
  outcome: Outcome;
  target: Point; // onde a bola chegou (0 a 1; fora disso = errou o gol)
  keeper: Point; // onde o goleiro estava quando a bola chegou
  start: number; // posição inicial do goleiro na linha (x, 0 a 1)
  dur: number;
  arc: number;
  curve: number;
  golaco?: boolean;
  reb?: boolean;
  style: PStyle;
  acc: number;
  pw: number;
  rm: number; // reação do goleiro (ms)
};
type Props = {
  club: PenaltyTeam;
  opponent: PenaltyTeam;
  userTeam: PenaltyPlayer[];
  botTeam: PenaltyPlayer[];
  onFinish: (result: Shootout) => void;
  // Multiplayer: sala, e se eu sou o anfitrião, o convidado ou só espectador (o anfitrião é o lado "user")
  net?: { roomId: string; role: 'host' | 'guest' | 'spectator' };
  onAbort?: () => void;
};
const NET_MS = 14000; // tempo que cada jogador tem para escolher
const NET_AUTO_MS = 21000; // o anfitrião escolhe pelo adversário que sumiu depois desse tempo
const CHARGE_MS = 1350; // tempo de botão até a força máxima

const pkCss = `
.pk { padding: 20px 18px 18px; margin: 0 0 16px; display: grid; gap: 12px; overflow: hidden; }
.pk-head { text-align: center; }
.pk-head .eyebrow { display: inline-block; font-size: 11px; letter-spacing: 4px; color: #F5B800; padding: 4px 12px; border: 1px solid rgba(245,184,0,.4); border-radius: 99px; background: rgba(245,184,0,.08); }
.pk-head h2 { margin: 8px 0 0; font-size: clamp(30px, 6vw, 46px); line-height: 1; font-style: italic; letter-spacing: .06em; }
.pk-head h2 em { color: #F5B800; font-style: italic; text-shadow: 0 0 24px rgba(245,184,0,.45); }
.pk-board { display: grid; gap: 8px; padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,.38); border: 1px solid rgba(255,255,255,.08); max-width: 880px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.pk-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 6px 8px; border-radius: 8px; border-left: 4px solid var(--c, #F5B800); transition: background .3s, box-shadow .3s; }
.pk-row.on { background: linear-gradient(90deg, rgba(245,184,0,.16), transparent); box-shadow: inset 0 0 0 1px rgba(245,184,0,.25); }
.pk-abbr { font-family: 'Bebas Neue', sans-serif; font-size: 24px; letter-spacing: .08em; min-width: 52px; }
.pk-dots { display: flex; gap: 6px; flex-wrap: wrap; }
.pk-dot { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 900; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); color: rgba(255,255,255,.3); }
.pk-dot.g { background: radial-gradient(circle at 35% 30%, #4ade80, #16a34a); color: #04210f; border-color: #86efac; box-shadow: 0 0 12px rgba(34,197,94,.55); }
.pk-dot.m { background: radial-gradient(circle at 35% 30%, #f87171, #b91c1c); color: #2a0505; border-color: #fca5a5; }
.pk-dot.n { border-color: rgba(245,184,0,.7); animation: pkPulse 1s ease-in-out infinite; }
.pk-score { font-family: 'Bebas Neue', sans-serif; font-size: 40px; line-height: 1; min-width: 34px; text-align: right; font-style: italic; }
.pk-msg { margin: 0; text-align: center; font-weight: 800; font-size: 17px; letter-spacing: .02em; padding: 8px 14px; border-radius: 99px; background: rgba(255,255,255,.06); justify-self: center; }
.pk-msg.me { color: #1a1200; background: linear-gradient(180deg, #ffe27a, #F5B800); box-shadow: 0 0 24px rgba(245,184,0,.35); }
.pk-msg.def { color: #fff; background: linear-gradient(180deg, #3b82f6, #1d4ed8); box-shadow: 0 0 24px rgba(59,130,246,.35); }
.pk-wrap { position: relative; max-width: 880px; width: 100%; margin: 0 auto; container-type: inline-size; display: grid; gap: 10px; }
.pk-stage { position: relative; width: 100%; border-radius: 16px; overflow: hidden; border: 1px solid rgba(245,184,0,.3); box-shadow: 0 24px 60px rgba(0,0,0,.55), 0 0 0 4px rgba(0,0,0,.25); }
.pk-stage svg { display: block; width: 100%; height: auto; user-select: none; -webkit-user-select: none; }
.pk-flash { position: absolute; left: 0; right: 0; top: 30%; display: flex; flex-direction: column; align-items: center; pointer-events: none; font-family: 'Bebas Neue','Oswald',sans-serif; font-style: italic; font-size: clamp(34px, 9cqw, 72px); letter-spacing: 4px; text-align: center; text-shadow: 0 4px 24px rgba(0,0,0,.9); animation: pkPop .55s cubic-bezier(.2,1.4,.4,1) both; }
.pk-flash small { font-family: Inter, system-ui, sans-serif; font-style: normal; font-size: clamp(12px, 2.4cqw, 16px); letter-spacing: .04em; font-weight: 700; margin-top: 4px; color: #fff; opacity: .9; }
.pk-flash.good { color: #4ade80; text-shadow: 0 0 30px rgba(34,197,94,.8), 0 4px 18px rgba(0,0,0,.9); }
.pk-flash.bad { color: #f87171; }
.pk-ctl { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; align-items: start; }
.pk-panel { background: rgba(7,11,18,.88); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.4); color: #fff; backdrop-filter: blur(3px); }
.pk-panel h4 { margin: 2px 4px 6px; font-size: 12px; letter-spacing: .08em; font-weight: 800; color: #fff; text-transform: uppercase; }
.pk-opt { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; border: 0; border-radius: 7px; background: transparent; color: rgba(255,255,255,.92); font: 600 14px Inter, system-ui, sans-serif; cursor: pointer; text-align: left; touch-action: manipulation; }
.pk-opt svg { width: 20px; height: 20px; flex: none; }
.pk-opt.on { background: #c9dcff; color: #0b1a33; }
.pk-opt:disabled { opacity: .5; cursor: default; }
.pk-force { padding: 8px 12px 10px; }
.pk-force b { display: block; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
.pk-force .v { font-family: 'Bebas Neue', sans-serif; font-size: 36px; line-height: 1; letter-spacing: .02em; }
.pk-fbar { height: 10px; border-radius: 3px; background: rgba(255,255,255,.14); overflow: hidden; border: 1px solid rgba(255,255,255,.3); margin-top: 4px; }
.pk-fbar i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, #16a34a, #4ade80); }
.pk-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pk-who { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 10px; padding: 8px 12px; background: rgba(7,11,18,.88); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; border-top: 3px solid var(--c, #3b82f6); font-weight: 800; font-size: 16px; }
.pk-who.k { justify-items: end; grid-template-columns: 1fr auto; }
.pk-who small { display: block; font-weight: 600; font-size: 11px; opacity: .7; letter-spacing: .06em; }
.pk-who .bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,.15); margin-top: 4px; overflow: hidden; min-width: 90px; }
.pk-who .bar i { display: block; height: 100%; background: var(--c, #3b82f6); }
.pk-num { font-family: 'Bebas Neue', sans-serif; font-size: 26px; opacity: .9; }
.pk-shoot { display: grid; gap: 6px; justify-items: center; }
.pk-btn { padding: 14px 40px; font-family: 'Bebas Neue',sans-serif; font-size: 22px; cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; }
.pk-small { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.pk-chip { background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.2); border-radius: 99px; padding: 8px 16px; font: 700 13px Inter, system-ui, sans-serif; cursor: pointer; touch-action: manipulation; }
.pk-chip.on { background: #c9dcff; color: #0b1a33; border-color: #c9dcff; }
.pk-hint { margin: 0; text-align: center; font-size: 14px; color: rgba(255,255,255,.75); }
.pk-timer { margin: 0; justify-self: center; font-family: 'Bebas Neue',sans-serif; font-size: 26px; letter-spacing: .1em; padding: 2px 16px; border-radius: 99px; background: rgba(0,0,0,.4); border: 1px solid currentColor; }
.pk-ghost { background: transparent; color: rgba(255,255,255,.8); border: 1px solid rgba(255,255,255,.25); border-radius: 99px; padding: 9px 22px; cursor: pointer; font-size: 14px; }
.pk-ghost:hover { border-color: #F5B800; color: #F5B800; }
.pk-end { display: flex; justify-content: center; }
.pk-gone { display: grid; gap: 8px; justify-items: center; color: #f87171; font-weight: 700; }
.pk-keys { margin: 0; text-align: center; font-size: 12px; color: rgba(255,255,255,.5); }
.pk-hud, .pk-legend { display: none; }
@container (min-width: 700px) {
  .pk-hud { position: absolute; left: 2.5%; top: 3%; display: grid; grid-template-columns: auto auto; gap: 2px 14px; align-items: center; padding: 8px 14px; background: rgba(7,11,18,.82); border-radius: 8px; border-bottom: 2px solid #3b82f6; pointer-events: none; }
  .pk-hud b { font: 900 16px Inter, system-ui, sans-serif; letter-spacing: .06em; }
  .pk-hud i { font: italic 400 26px 'Bebas Neue', sans-serif; text-align: right; }
  .pk-legend { position: absolute; right: 2%; top: 3%; display: grid; gap: 5px; padding: 7px 10px; background: rgba(7,11,18,.82); border-radius: 8px; font: 600 11.5px Inter, system-ui, sans-serif; color: #fff; pointer-events: none; }
  .pk-legend kbd { display: inline-block; min-width: 20px; padding: 1px 6px; margin-right: 6px; border-radius: 99px; background: #fff; color: #0b1a33; font: 800 11px Inter, system-ui, sans-serif; text-align: center; }
  .pk-ctl { display: contents; }
  .pk-ctl .pk-panel.a { position: absolute; left: 2.5%; top: 34%; width: 19%; min-width: 150px; }
  .pk-ctl .pk-panel.b { position: absolute; right: 3%; top: 56%; width: 24%; min-width: 170px; }
}
@keyframes pkPulse { 50% { box-shadow: 0 0 0 4px rgba(245,184,0,.25); } }
@keyframes pkPop { 0% { transform: scale(.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@media (max-width: 600px) { .pk { padding: 14px 10px; } .pk-dot { width: 22px; height: 22px; font-size: 11px; } .pk-score { font-size: 32px; } .pk-abbr { font-size: 20px; min-width: 42px; } .pk-ctl { grid-template-columns: 1fr; } .pk-info { grid-template-columns: 1fr; } }
`;

// Cena em um SVG 480 x 294: câmera atrás do cobrador, gol ao fundo
const VW = 480;
const VH = 294; // folga embaixo para o rótulo PRECISÃO não ser cortado
const GL = 140; // trave esquerda
const GW = 200; // largura do gol
const GT = 34; // travessão
const GH = 68; // altura do gol
const GB = GT + GH; // linha do gol
const BALL0: Point = { x: 240, y: 214 };
const KICK0: Point = { x: 168, y: 226 };
const KEEP_Y = GB + 3;
const GK_STAND = 0.58;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const toSvg = (p: Point): Point => ({ x: GL + p.x * GW, y: GT + p.y * GH });
// Posição do disco do goleiro (coordenadas do gol -> cena): se atira para cima, o disco "sobe" e cresce
const keeperAt = (x: number, y: number) => {
  const lift = Math.max(0, GK_STAND - y);
  return { x: GL + x * GW, y: KEEP_Y - lift * GH * 0.75, s: 1 + lift * 0.55 };
};
const numberOf = (player: PenaltyPlayer | undefined) => {
  if (!player) return 0;
  if (posOf(player) === 'GK') return 1;
  let h = 7;
  for (let i = 0; i < player.name.length; i += 1) h = (h * 31 + player.name.charCodeAt(i)) % 97;
  return 2 + (h % 28);
};
const hexLum = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0.3;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

function orderTakers(team: PenaltyPlayer[]) {
  return [
    ...team.filter((player) => posOf(player) !== 'GK').sort((a, b) => b.overall - a.overall),
    ...team.filter((player) => posOf(player) === 'GK'),
  ];
}
function keeperOf(team: PenaltyPlayer[]) {
  return team.find((player) => posOf(player) === 'GK') ?? team[0];
}

// Situação da disputa: 5 cobranças para cada lado e depois morte súbita
function status(kicks: ShootoutKick[]) {
  const taken = { user: 0, bot: 0 };
  const goals = { user: 0, bot: 0 };
  kicks.forEach((kick) => {
    taken[kick.side] += 1;
    if (kick.scored) goals[kick.side] += 1;
  });
  const leftUser = Math.max(0, 5 - taken.user);
  const leftBot = Math.max(0, 5 - taken.bot);
  let finished = false;
  if (taken.user <= 5 && taken.bot <= 5) {
    finished = goals.user > goals.bot + leftBot || goals.bot > goals.user + leftUser;
  }
  if (!finished && taken.user === taken.bot && taken.user >= 5 && goals.user !== goals.bot) finished = true;
  if (!finished && kicks.length >= 40 && taken.user === taken.bot) finished = true;
  return { taken, goals, finished };
}

function buildResult(kicks: ShootoutKick[], tieWinner?: Side): Shootout {
  const s = status(kicks);
  const winner: Side =
    s.goals.user === s.goals.bot
      ? (tieWinner ?? (Math.random() < 0.5 ? 'user' : 'bot'))
      : s.goals.user > s.goals.bot
        ? 'user'
        : 'bot';
  return { kicks, userGoals: s.goals.user, botGoals: s.goals.bot, winner };
}

function planOf(side: Side, playerId: string, r: ShotOut, style: PStyle, acc: number, pw: number, keeperOvrReact: number, mode: PMode): KickPlan {
  return {
    side,
    playerId,
    outcome: r.outcome,
    target: r.target,
    keeper: r.keeperEnd,
    start: r.start.x,
    dur: r.dur,
    arc: r.arc,
    curve: r.curve,
    golaco: r.golaco,
    reb: r.reb,
    style,
    acc,
    pw,
    rm: mode === 'reagir' ? keeperOvrReact : 0,
  };
}

// Disco visto de cima com leve inclinação (sem corpo humano): sombra, borda grossa, tampa com faixa e número
function Disc({ x = 0, y = 0, r = 16, color, color2, label, scale = 1, spinRef }: { x?: number; y?: number; r?: number; color: string; color2: string; label: string; scale?: number; spinRef?: RefObject<SVGGElement | null> }) {
  const dark = hexLum(color) < 0.5;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})`}>
      <ellipse cy={r * 0.72} rx={r * 1.05} ry={r * 0.34} fill="rgba(0,0,0,.4)" />
      <ellipse cy={r * 0.22} rx={r} ry={r * 0.6} fill={color2} />
      <ellipse cy={0} rx={r} ry={r * 0.6} fill={color} stroke="rgba(255,255,255,.55)" strokeWidth="0.8" />
      <g ref={spinRef}>
        <ellipse rx={r * 0.78} ry={r * 0.46} fill="none" stroke={color2} strokeWidth={r * 0.16} strokeDasharray={`${r * 1.4} ${r * 0.9}`} opacity=".9" />
      </g>
      <text y={r * 0.2} textAnchor="middle" fontSize={r * 0.78} fontWeight="900" fontFamily="'Bebas Neue',Inter,sans-serif" fill={dark ? '#fff' : '#0b1a33'} stroke={dark ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.4)'} strokeWidth="0.4">
        {label}
      </text>
    </g>
  );
}
const ICON: Record<PStyle, JSX.Element> = {
  normal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
    </svg>
  ),
  colocado: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 20c0-8 4-12 12-12" />
      <path d="M13 3l5 5-5 5" />
    </svg>
  ),
  cavadinha: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 19c2-9 7-13 9-13s7 4 9 13" />
      <circle cx="12" cy="14" r="2.2" />
    </svg>
  ),
};

export default function PenaltyShootout({ club, opponent, userTeam, botTeam, onFinish, net, onAbort }: Props) {
  const takers = useMemo(() => ({ user: orderTakers(userTeam), bot: orderTakers(botTeam) }), [userTeam, botTeam]);
  const keepers = useMemo(() => ({ user: keeperOf(userTeam), bot: keeperOf(botTeam) }), [userTeam, botTeam]);
  const teams = { user: club, bot: opponent };

  const [kicks, setKicks] = useState<ShootoutKick[]>([]);
  const [phase, setPhase] = useState<Phase>('aim');
  const [aim, setAim] = useState<Point>({ x: 0.5, y: 0.6 });
  const [style, setStyle] = useState<PStyle>('normal');
  const [kmode, setKmode] = useState<PMode>('antecipar');
  const [shuf, setShuf] = useState(0);
  const [hoverDive, setHoverDive] = useState<Point | null>(null);
  const [flash, setFlash] = useState<{ text: string; sub: string; good: boolean } | null>(null);

  // ----- Multiplayer -----
  const spectator = net?.role === 'spectator';
  const hostSide: Side = net?.role === 'guest' ? 'bot' : 'user'; // quem bate primeiro
  const otherSide = (side: Side): Side => (side === 'user' ? 'bot' : 'user');
  const turnOf = (index: number): Side => (index % 2 === 0 ? hostSide : otherSide(hostSide));
  const sideOfRole = (role: 'host' | 'guest'): Side => ((role === 'host') === (hostSide === 'user') ? 'user' : 'bot');
  const [remote, setRemote] = useState<NetKick[]>([]); // cobranças já resolvidas (gravadas pelo anfitrião)
  const remoteRef = useRef<NetKick[]>([]);
  const myChoices = useRef<Record<string, NetChoice>>({});
  const theirChoices = useRef<Record<string, NetChoice>>({});
  const netLoaded = useRef(false);
  const kickStart = useRef({ index: -1, at: 0 });
  const deadline = useRef(0);
  const [left, setLeft] = useState<number | null>(null);
  const [netGone, setNetGone] = useState(false);

  // Memória da disputa para os BOTs (para onde chutam e para onde se atiram)
  const hist = useRef({ shots: { user: newPenHist(), bot: newPenHist() }, dives: { user: newPenHist(), bot: newPenHist() } });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const ballRef = useRef<SVGGElement | null>(null);
  const keeperRef = useRef<SVGGElement | null>(null);
  const keeperSpin = useRef<SVGGElement | null>(null);
  const kickerRef = useRef<SVGGElement | null>(null);
  const kickerSpin = useRef<SVGGElement | null>(null);
  const netRef = useRef<SVGRectElement | null>(null);
  const markRef = useRef<SVGGElement | null>(null);
  const accRef = useRef<SVGTextElement | null>(null);
  const fbarRef = useRef<HTMLElement | null>(null);
  const fvalRef = useRef<HTMLSpanElement | null>(null);
  const aimRef = useRef<Point>(aim);
  aimRef.current = aim;
  const styleRef = useRef<PStyle>(style);
  styleRef.current = style;
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const mk = useRef({ t0: 0, phase0: 0, period: 1200, lock: null as number | null, press: 0 });
  const rafRef = useRef(0);
  const timers = useRef<number[]>([]);

  const st = status(kicks);
  const turn: Side = turnOf(kicks.length);
  const shooterFor = (side: Side, list: ShootoutKick[] = kicks): PenaltyPlayer | undefined => {
    const count = list.filter((kick) => kick.side === side).length;
    const arr = takers[side];
    return arr[count % Math.max(1, arr.length)];
  };
  const shooter = shooterFor(turn);
  const gk = keepers[otherSide(turn)];
  const result = useMemo(() => (st.finished ? buildResult(kicks, net ? hostSide : undefined) : null), [kicks]);
  const myTurnToKick = !spectator && turn === 'user' && phase !== 'done';
  const keeperTurn = !spectator && turn !== 'user' && phase !== 'done';
  const pressNow = pressureOf(st.taken, st.goals, turn);
  const zones = zonesFor(shooter?.overall ?? 75, style, pressNow);
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      timers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  const keeperHome = (x = 0.5) => keeperAt(x, GK_STAND);
  function setKeeperPos(x: number, y: number, k: number, spin: number) {
    const p = keeperAt(x, y);
    keeperRef.current?.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(p.s * (1 + 0.12 * k)).toFixed(3)} ${p.s.toFixed(3)})`);
    keeperSpin.current?.setAttribute('transform', `rotate(${spin.toFixed(1)})`);
  }
  function resetScene() {
    ballRef.current?.setAttribute('transform', `translate(${BALL0.x} ${BALL0.y})`);
    setKeeperPos(0.5, GK_STAND, 0, 0);
    kickerRef.current?.setAttribute('transform', `translate(${KICK0.x} ${KICK0.y})`);
    kickerSpin.current?.setAttribute('transform', 'rotate(0)');
    if (netRef.current) netRef.current.style.opacity = '0';
  }

  // A cada cobrança nova: volta a cena ao início e libera a vez de quem bate
  useEffect(() => {
    resetScene();
    setFlash(null);
    setHoverDive(null);
    setShuf(0);
    if (status(kicks).finished) {
      setPhase('done');
      return;
    }
    if (net && (spectator || remoteRef.current.length > kicks.length)) {
      setPhase('wait'); // espectador, ou a cobrança já foi resolvida: só assiste
      return;
    }
    deadline.current = Date.now() + NET_MS;
    const kicker = shooterFor(turnOf(kicks.length));
    mk.current = { t0: performance.now(), phase0: Math.random(), period: markerPeriod(kicker?.overall ?? 75), lock: null, press: 0 };
    if (turnOf(kicks.length) === 'user') {
      setAim({ x: 0.5, y: 0.62 });
      setPhase('aim');
    } else {
      setPhase('dive');
    }
  }, [kicks.length]);

  // Multiplayer: busca a sala a cada segundo (escolhas do adversário e cobranças resolvidas)
  useEffect(() => {
    if (!net) return;
    let alive = true;
    async function pull() {
      const room = await fetchRoom(net!.roomId);
      if (!alive || !room) return;
      if (room.status === 'cancelled') setNetGone(true);
      const host = room.shootout_host ?? {};
      const guest = room.shootout_guest ?? {};
      if (net!.role === 'host') theirChoices.current = guest.choices ?? {};
      if (net!.role === 'guest') theirChoices.current = host.choices ?? {};
      if (!netLoaded.current) {
        netLoaded.current = true;
        if (net!.role === 'host') myChoices.current = host.choices ?? {};
        if (net!.role === 'guest') myChoices.current = guest.choices ?? {};
        const saved = host.kicks ?? [];
        if (saved.length > 1) {
          // Entrou no meio da disputa: pula o que já passou e só anima a última cobrança
          setKicks(saved.slice(0, -1).map(netToKick));
        }
      }
      const incoming = host.kicks ?? [];
      if (net!.role !== 'host' && incoming.length > remoteRef.current.length) {
        remoteRef.current = incoming;
        setRemote(incoming);
      } else if (net!.role === 'host' && remoteRef.current.length === 0 && incoming.length > 0) {
        remoteRef.current = incoming;
        setRemote(incoming);
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [net?.roomId, net?.role]);

  function netToKick(nk: NetKick): ShootoutKick {
    return { side: sideOfRole(nk.shooter), playerId: nk.playerId, scored: nk.outcome === 'gol' };
  }

  // Quando a cobrança já foi resolvida, as duas telas (e os espectadores) tocam a mesma animação
  useEffect(() => {
    if (!net || phase === 'flying' || phase === 'done') return;
    if (remote.length <= kicks.length || status(kicks).finished) return;
    const nk = remote[kicks.length];
    cancelAnimationFrame(rafRef.current);
    setHoverDive(null);
    setPhase('flying');
    playKick({
      side: sideOfRole(nk.shooter),
      playerId: nk.playerId,
      outcome: nk.outcome,
      target: { x: nk.tx, y: nk.ty },
      keeper: { x: nk.kx, y: nk.ky },
      start: nk.sx ?? 0.5,
      dur: clamp(nk.dur, 300, 1400),
      arc: clamp(nk.arc, 0, 60),
      curve: nk.cv ?? 0,
      golaco: nk.golaco,
      reb: nk.reb,
      style: (STYLES as string[]).includes(nk.st ?? '') ? (nk.st as PStyle) : 'normal',
      acc: nk.acc ?? 0.7,
      pw: nk.pw ?? 0.75,
      rm: nk.rm ?? 0,
    });
  }, [remote, kicks.length, phase]);

  // Envia a minha escolha (cobrador: mira, força, precisão, estilo; goleiro: mergulho, modo, posição) para a sala
  function submitChoice(index: number, choice: NetChoice) {
    if (!net || net.role === 'spectator') return;
    myChoices.current = { ...myChoices.current, [String(index)]: choice };
    if (net.role === 'host') writeHost();
    else void patchRoom(net.roomId, { shootout_guest: { choices: myChoices.current } });
  }
  function writeHost() {
    if (!net) return;
    void patchRoom(net.roomId, { shootout_host: { choices: myChoices.current, kicks: remoteRef.current } });
  }

  // Só o anfitrião resolve: valida as faixas, calcula a precisão pela posição do marcador e a física, e grava o resultado
  function tryResolve() {
    if (!net || net.role !== 'host') return;
    const list = remoteRef.current;
    const index = list.length;
    const played = list.map(netToKick);
    const ps = status(played);
    if (ps.finished) return;
    if (kickStart.current.index !== index) kickStart.current = { index, at: Date.now() };
    const shooterRole: 'host' | 'guest' = index % 2 === 0 ? 'host' : 'guest';
    const shotChoice = (shooterRole === 'host' ? myChoices.current : theirChoices.current)[String(index)];
    const diveChoice = (shooterRole === 'host' ? theirChoices.current : myChoices.current)[String(index)];
    let shot = shotChoice ? sanitizeShot(shotChoice) : null;
    let dive: KeeperChoice | null = null;
    if (diveChoice) {
      dive = sanitizeKeeper(diveChoice);
      if (!dive && typeof diveChoice.dive === 'number') dive = { x: [0.17, 0.5, 0.83][clamp(Math.round(diveChoice.dive), 0, 2)], y: 0.68, mode: 'antecipar' }; // formato antigo (coluna)
    }
    if (!shot || !dive) {
      if (Date.now() - kickStart.current.at < NET_AUTO_MS) return;
      if (!shot) shot = { aim: { x: rand(0.25, 0.75), y: rand(0.3, 0.7) }, pw: 0.72, m: clamp(0.5 + rand(-0.25, 0.25), 0, 1), style: 'normal' };
      if (!dive) dive = botKeeper(75, 75, newPenHist());
    }
    const shooterSide = sideOfRole(shooterRole);
    const player = shooterFor(shooterSide, played);
    if (!player) return;
    const kOvr = keepers[otherSide(shooterSide)]?.overall ?? 75;
    const pr = pressureOf(ps.taken, ps.goals, shooterSide);
    const acc = accOf(shot.m, zonesFor(player.overall, shot.style, pr));
    const r = resolvePenalty({ shooterOvr: player.overall, keeperOvr: kOvr, aim: shot.aim, pw: shot.pw, acc, style: shot.style, keeper: dive, pressure: pr });
    const nk: NetKick = {
      shooter: shooterRole,
      playerId: player.id,
      outcome: r.outcome,
      tx: r.target.x,
      ty: r.target.y,
      kx: r.keeperEnd.x,
      ky: r.keeperEnd.y,
      dur: r.dur,
      arc: r.arc,
      golaco: r.golaco,
      st: shot.style,
      acc,
      pw: shot.pw,
      sx: r.start.x,
      cv: r.curve,
      reb: r.reb,
      rm: dive.mode === 'reagir' && !dive.stay ? keeperReact(kOvr) + 60 : 0,
    };
    noteShot(hist.current.shots[shooterSide], r.target, shot.style);
    noteDive(hist.current.dives[otherSide(shooterSide)], r.keeperDive, dive.stay);
    remoteRef.current = [...list, nk];
    setRemote(remoteRef.current);
    writeHost();
  }
  const resolveRef = useRef(tryResolve);
  resolveRef.current = tryResolve;
  useEffect(() => {
    if (!net || net.role !== 'host') return;
    const id = window.setInterval(() => resolveRef.current(), 400);
    return () => window.clearInterval(id);
  }, [net?.role]);

  // Contagem regressiva da minha escolha; ao zerar, o jogo escolhe por mim
  useEffect(() => {
    if (!net || spectator || (phase !== 'aim' && phase !== 'power' && phase !== 'dive')) {
      setLeft(null);
      return;
    }
    const id = window.setInterval(() => {
      const secs = Math.ceil((deadline.current - Date.now()) / 1000);
      setLeft(Math.max(0, secs));
      if (secs > 0) return;
      window.clearInterval(id);
      if (phaseRef.current === 'dive') {
        const c = botKeeper(75, 75, newPenHist());
        commitRef.current({ dx: c.x, dy: c.y, stay: c.stay });
      } else if (phaseRef.current === 'power') releaseRef.current();
      else {
        pressRef.current();
        releaseRef.current(0.72);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, kicks.length]);

  // Marcador de precisão (vai e volta sem parar até o comando) e barra de força (cresce enquanto o botão está pressionado).
  // Os dois são independentes: o primeiro só guarda o instante do comando, o segundo só o tempo de botão.
  useEffect(() => {
    if (phase !== 'aim' && phase !== 'power') return;
    let raf = 0;
    const loop = (now: number) => {
      const m = mk.current;
      const pos = m.lock ?? markerAt(now - m.t0, m.period, m.phase0);
      const z = zonesRef.current;
      const a = accOf(pos, z);
      if (markRef.current) {
        const ang = Math.PI * pos;
        markRef.current.setAttribute('transform', `translate(${(KICK0.x - RING.rx * Math.cos(ang)).toFixed(1)} ${(KICK0.y + RING.ry * Math.sin(ang)).toFixed(1)})`);
        const col = zoneAt(pos, z) === 'verde' ? '#22c55e' : zoneAt(pos, z) === 'amarela' ? '#facc15' : '#ef4444';
        markRef.current.setAttribute('fill', col);
      }
      if (accRef.current) accRef.current.textContent = `${Math.round(a * 100)}%`;
      const pw = phaseRef.current === 'power' ? clamp((now - m.press) / CHARGE_MS, 0, 1) : 0;
      if (fbarRef.current) fbarRef.current.style.width = `${(pw * 100).toFixed(0)}%`;
      if (fvalRef.current) fvalRef.current.textContent = `${Math.round(pw * 100)}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase === 'aim' || phase === 'power', kicks.length]);

  // ---- Comandos do cobrador ----
  function pressShoot() {
    if (phaseRef.current !== 'aim') return;
    const m = mk.current;
    m.lock = markerAt(performance.now() - m.t0, m.period, m.phase0); // trava a PRECISÃO neste instante
    m.press = performance.now();
    setPhase('power');
    phaseRef.current = 'power';
  }
  function releaseShoot(forcePw?: number) {
    if (phaseRef.current !== 'power') return;
    const m = mk.current;
    const pw = forcePw ?? clamp((performance.now() - m.press) / CHARGE_MS, 0, 1); // a FORÇA vem só do tempo de botão
    fire(m.lock ?? 0.5, pw);
  }
  const pressRef = useRef(pressShoot);
  pressRef.current = pressShoot;
  const releaseRef = useRef(releaseShoot);
  releaseRef.current = releaseShoot;

  // Você bate: precisão (timing) e força (botão) definem onde a bola vai e se o goleiro pega
  function fire(m: number, pw: number) {
    const mira = aimRef.current;
    const stl = styleRef.current;
    if (net) {
      // Multiplayer: só envia a minha escolha; o anfitrião valida, resolve e as duas telas animam juntas
      submitChoice(kicks.length, { x: mira.x, y: mira.y, pw, m, style: stl });
      setPhase('wait');
      phaseRef.current = 'wait';
      return;
    }
    const player = shooterFor('user');
    if (!player) return;
    const pr = pressureOf(st.taken, st.goals, 'user');
    const kOvr = keepers.bot?.overall ?? 75;
    const acc = accOf(m, zonesFor(player.overall, stl, pr));
    const kc = botKeeper(player.overall, kOvr, hist.current.shots.user);
    const r = resolvePenalty({ shooterOvr: player.overall, keeperOvr: kOvr, aim: mira, pw, acc, style: stl, keeper: kc, pressure: pr });
    noteShot(hist.current.shots.user, r.target, stl);
    noteDive(hist.current.dives.bot, r.keeperDive, kc.stay);
    setPhase('flying');
    phaseRef.current = 'flying';
    playKick(planOf('user', player.id, r, stl, acc, pw, kc.mode === 'reagir' && !kc.stay ? keeperReact(kOvr) + 60 : 0, 'reagir'));
  }

  // ---- Comandos do goleiro: o adversário bate e você escolhe onde se atirar (sem ver a mira) ----
  function commitDive(c: { dx: number; dy: number; stay?: boolean }) {
    if (phaseRef.current !== 'dive') return;
    const mine: KeeperChoice = { x: clamp(c.dx, 0.03, 0.97), y: clamp(c.dy, 0.15, 0.9), mode: kmode, stay: !!c.stay, shuf };
    if (net) {
      submitChoice(kicks.length, { dx: mine.x, dy: mine.y, mode: mine.mode, stay: mine.stay, shuf: mine.shuf });
      setHoverDive(null);
      setPhase('wait');
      phaseRef.current = 'wait';
      return;
    }
    const player = shooterFor('bot');
    if (!player) return;
    const kOvr = keepers.user?.overall ?? 75;
    const pr = pressureOf(st.taken, st.goals, 'bot');
    const bs = botShooter(player.overall, kOvr, pr, hist.current.dives.user);
    const r = resolvePenalty({ shooterOvr: player.overall, keeperOvr: kOvr, aim: bs.aim, pw: bs.pw, acc: bs.acc, style: bs.style, keeper: mine, pressure: pr });
    noteShot(hist.current.shots.bot, r.target, bs.style);
    noteDive(hist.current.dives.user, r.keeperDive, mine.stay);
    setHoverDive(null);
    setPhase('flying');
    phaseRef.current = 'flying';
    playKick(planOf('bot', player.id, r, bs.style, bs.acc, bs.pw, mine.mode === 'reagir' && !mine.stay ? keeperReact(kOvr) + 60 : 0, 'reagir'));
  }
  const commitRef = useRef(commitDive);
  commitRef.current = commitDive;

  // Teclado e soltar do botão (em qualquer lugar da tela)
  useEffect(() => {
    if (spectator) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const ph = phaseRef.current;
      if (ph === 'aim' || ph === 'power') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (!e.repeat) pressRef.current();
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          setAim((a) => ({ ...a, x: clamp(a.x - 0.035, 0.02, 0.98) }));
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          setAim((a) => ({ ...a, x: clamp(a.x + 0.035, 0.02, 0.98) }));
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          setAim((a) => ({ ...a, y: clamp(a.y - 0.04, 0.04, 0.96) }));
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          setAim((a) => ({ ...a, y: clamp(a.y + 0.04, 0.04, 0.96) }));
        } else if (ph === 'aim' && e.code === 'Digit1') setStyle('normal');
        else if (ph === 'aim' && e.code === 'Digit2') setStyle('colocado');
        else if (ph === 'aim' && e.code === 'Digit3') setStyle('cavadinha');
      } else if (ph === 'dive') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          setShuf((v) => clamp(v - 0.06, -0.2, 0.2));
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          setShuf((v) => clamp(v + 0.06, -0.2, 0.2));
        } else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          commitRef.current({ dx: 0.5, dy: 0.6, stay: true });
        } else if (e.code === 'Digit1') setKmode('antecipar');
        else if (e.code === 'Digit2') setKmode('reagir');
      }
    };
    const onUp = (e: Event) => {
      if (e instanceof KeyboardEvent && e.code !== 'Space' && e.code !== 'Enter') return;
      releaseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [spectator]);

  // O goleiro, durante a escolha, se desloca na linha (só visual até confirmar)
  useEffect(() => {
    if (phase === 'dive') setKeeperPos(0.5 + shuf, GK_STAND, 0, 0);
  }, [shuf, phase]);

  function tween(dur: number, step: (t: number, elapsed: number) => void, done?: () => void) {
    const start = performance.now();
    const loop = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      step(t, now - start);
      if (t < 1) rafRef.current = requestAnimationFrame(loop);
      else done?.();
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  // Anima o disco do cobrador, a bola (trajetória, arco, efeito), o goleiro e o desfecho; depois registra o resultado
  function playKick(plan: KickPlan) {
    const RUN = 200; // o disco arranca e acelera contra a bola antes dela sair
    const total = RUN + plan.dur + 80;
    const kEnd = keeperAt(plan.keeper.x, plan.keeper.y);
    let end = toSvg(plan.target);
    if (plan.outcome === 'defesa') end = { x: kEnd.x, y: kEnd.y - 10 * kEnd.s }; // a bola para no disco do goleiro: nunca o atravessa
    const kStartAt = RUN + plan.rm;
    const kDur = Math.max(120, plan.dur * 0.9 - plan.rm);
    const dirK = plan.keeper.x < plan.start ? -1 : 1;
    const stopAt = { x: BALL0.x - 26, y: BALL0.y + 3 };
    tween(
      total,
      (_, el) => {
        // disco do cobrador: acelera até a bola, gira e freia
        const rt = clamp(el / RUN, 0, 1);
        const re = rt * rt * (3 - 2 * rt);
        const slow = clamp((el - RUN) / 220, 0, 1);
        kickerRef.current?.setAttribute('transform', `translate(${lerp(KICK0.x, stopAt.x, re) + slow * 4} ${lerp(KICK0.y, stopAt.y, re)}) scale(${(1 + 0.08 * Math.sin(Math.PI * rt)).toFixed(3)})`);
        kickerSpin.current?.setAttribute('transform', `rotate(${(re * 300).toFixed(0)})`);
        // bola
        const bt = clamp((el - RUN) / plan.dur, 0, 1);
        const e = 1 - Math.pow(1 - bt, plan.style === 'cavadinha' ? 1.6 : 2);
        const bx = lerp(BALL0.x, end.x, e) + Math.sin(Math.PI * e) * plan.curve * 22;
        const by = lerp(BALL0.y, end.y, e) - Math.sin(Math.PI * e) * plan.arc;
        ballRef.current?.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${(e * 540).toFixed(0)}) scale(${lerp(1, 0.5, e).toFixed(3)})`);
        // goleiro: sai depois da reação (modo reagir), acelera e gira no mergulho
        const kt = clamp((el - kStartAt) / kDur, 0, 1);
        const ke = 1 - Math.pow(1 - kt, 2);
        const x = lerp(plan.start, plan.keeper.x, ke);
        const y = lerp(GK_STAND, plan.keeper.y, ke);
        setKeeperPos(x, y, ke, dirK * ke * 320);
      },
      () => {
        const mine = plan.side === 'user';
        const scored = plan.outcome === 'gol';
        const texts: Record<Outcome, [string, string]> = {
          gol: ['GOOOL!', 'Gol do adversário!'],
          defesa: ['O goleiro defendeu!', 'DEFENDEU!'],
          fora: ['Pra fora!', 'Ele isolou!'],
          trave: ['NA TRAVE!', 'Bateu na trave!'],
        };
        const good = mine ? scored : !scored;
        setFlash({
          text: plan.golaco ? (mine ? 'GOLAÇO NO ÂNGULO!' : 'Golaço no ângulo!') : texts[plan.outcome][mine ? 0 : 1],
          sub: `${STYLE_INFO[plan.style].label} · Precisão ${Math.round(plan.acc * 100)}% · Força ${Math.round(plan.pw * 100)}%${plan.reb ? ' · rebote' : ''}`,
          good,
        });
        if (scored && netRef.current) {
          netRef.current.style.opacity = '0.5';
          later(() => {
            if (netRef.current) netRef.current.style.opacity = '0';
          }, 450);
        }
        if (plan.outcome === 'defesa' || plan.outcome === 'trave') {
          const dir = end.x < GL + GW / 2 ? -1 : 1;
          const far = plan.outcome === 'trave' ? 16 : plan.reb ? 46 : 20;
          const to = { x: end.x + dir * (plan.outcome === 'trave' ? -far : far), y: Math.min(GB + 34, end.y + (plan.reb ? 52 : 26)) };
          tween(380, (t) => {
            ballRef.current?.setAttribute('transform', `translate(${lerp(end.x, to.x, t).toFixed(1)} ${(lerp(end.y, to.y, t) - Math.sin(Math.PI * t) * 10).toFixed(1)}) rotate(${(540 + t * 200).toFixed(0)}) scale(0.5)`);
          });
        }
        later(() => {
          setKicks((prev) => [...prev, { side: plan.side, playerId: plan.playerId, scored }]);
        }, 1800);
      },
    );
  }

  // Ponteiro sobre a cena: mira (cobrador) ou ponto do mergulho (goleiro)
  function pointerToGoal(event: ReactPointerEvent<SVGSVGElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * VW;
    const y = ((event.clientY - box.top) / box.height) * VH;
    return { x: clamp((x - GL) / GW, 0.02, 0.98), y: clamp((y - GT) / GH, 0.04, 0.96) };
  }
  function onScenePointer(event: ReactPointerEvent<SVGSVGElement>, down: boolean) {
    const ph = phaseRef.current;
    if (ph === 'aim' || ph === 'power') {
      if (event.pointerType !== 'mouse' && !down && event.buttons === 0) return;
      setAim(pointerToGoal(event));
    } else if (ph === 'dive') {
      const p = pointerToGoal(event);
      if (down) commitDive({ dx: p.x, dy: p.y });
      else if (event.pointerType === 'mouse') setHoverDive(p);
    }
  }

  // Resolve o que falta automaticamente (BOT contra BOT: os dois lados decidem sozinhos, com memória e pressão)
  function autoRest() {
    if (net || phase === 'flying' || phase === 'done') return;
    cancelAnimationFrame(rafRef.current);
    const list = [...kicks];
    while (!status(list).finished && list.length < 60) {
      const side: Side = list.length % 2 === 0 ? 'user' : 'bot';
      const other: Side = side === 'user' ? 'bot' : 'user';
      const player = shooterFor(side, list);
      if (!player) break;
      const ps = status(list);
      const k = simulateKick(player.overall, keepers[other]?.overall ?? 75, pressureOf(ps.taken, ps.goals, side), hist.current.shots[side], hist.current.dives[other]);
      list.push({ side, playerId: player.id, scored: k.result.outcome === 'gol' });
    }
    setKicks(list);
  }

  const nameOf = (kick: ShootoutKick) => (kick.side === 'user' ? userTeam : botTeam).find((player) => player.id === kick.playerId)?.name ?? 'Jogador';

  const slots = Math.max(5, Math.ceil(kicks.length / 2));
  const mark = (side: Side, index: number) => {
    const kick = kicks.filter((item) => item.side === side)[index];
    const isNext = !kick && phase !== 'done' && turn === side && kicks.filter((item) => item.side === side).length === index;
    return (
      <span key={index} title={kick ? nameOf(kick) : ''} className={`pk-dot ${kick ? (kick.scored ? 'g' : 'm') : ''} ${isNext ? 'n' : ''}`}>
        {!kick ? '•' : kick.scored ? '✓' : '✕'}
      </span>
    );
  };
  const row = (team: PenaltyTeam, side: Side) => (
    <div className={`pk-row ${phase !== 'done' && turn === side ? 'on' : ''}`} style={{ ['--c' as string]: team.primary_color }}>
      <b className="pk-abbr">{team.abbreviation}</b>
      <div className="pk-dots">{Array.from({ length: slots }).map((_, index) => mark(side, index))}</div>
      <strong className="pk-score">{st.goals[side]}</strong>
    </div>
  );

  const headline =
    phase === 'done'
      ? result?.winner === 'user'
        ? spectator
          ? `${club.name} vence nos pênaltis`
          : 'Você venceu nos pênaltis!'
        : `${opponent.name} vence nos pênaltis`
      : spectator
        ? `${(turn === 'user' ? club : opponent).abbreviation}: ${shooter?.name ?? ''} vai bater`
        : turn === 'user'
          ? `Sua vez de bater: ${shooter?.name ?? ''}`
          : `${shooter?.name ?? 'O adversário'} vai bater. Defenda!`;
  const hint =
    phase === 'aim'
      ? 'Mire no gol, escolha o tipo de chute e aperte CHUTAR quando o marcador estiver no verde.'
      : phase === 'power'
        ? 'Precisão travada. Mantenha pressionado para a força e solte para chutar.'
        : phase === 'dive'
          ? 'Desloque-se (◀ ▶), escolha Antecipar ou Reagir e toque no gol para se atirar, ou fique no centro.'
          : phase === 'wait' && net && !spectator
            ? 'Escolha enviada. Aguardando o adversário…'
            : phase === 'wait' && spectator
              ? 'Você está assistindo a disputa.'
              : '';

  // Cores dos discos: o cobrador no corpo da cor principal; o goleiro na cor secundária do outro time (para não se confundirem)
  const kTeam = teams[turn];
  const gTeam = teams[otherSide(turn)];
  const aimPt = toSvg(aim);
  const ringPath = (a: number, b: number) => {
    const pt = (m: number) => ({ x: KICK0.x - RING.rx * Math.cos(Math.PI * m), y: KICK0.y + RING.ry * Math.sin(Math.PI * m) });
    const p0 = pt(a);
    const p1 = pt(b);
    return `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A${RING.rx} ${RING.ry} 0 0 0 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  };
  const showRing = myTurnToKick && (phase === 'aim' || phase === 'power');
  const ovrBar = (n?: number) => `${clamp(((n ?? 70) - 50) * 2, 8, 100)}%`;

  return (
    <section className="pk glass-card">
      <style>{stadiumCss}</style>
      <style>{pkCss}</style>
      <div className="pk-head">
        <span className="eyebrow">EMPATE NO TEMPO NORMAL</span>
        <h2>
          DISPUTA DE <em>PÊNALTIS</em>
        </h2>
      </div>
      <div className="pk-board">
        {row(club, 'user')}
        {row(opponent, 'bot')}
      </div>
      <p className={`pk-msg ${myTurnToKick ? 'me' : keeperTurn ? 'def' : ''}`}>{headline}</p>

      <div className="pk-wrap">
        <div className="pk-sc" style={{ position: 'relative', display: 'grid', gap: 10 }}>
          <div className="pk-stage">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VW} ${VH}`}
              style={{ cursor: phase === 'aim' ? 'crosshair' : phase === 'dive' ? 'pointer' : 'default', touchAction: phase === 'aim' || phase === 'power' || phase === 'dive' ? 'none' : 'manipulation' }}
              role="img"
              aria-label="Cobrança de pênalti vista de trás do cobrador"
              onPointerMove={(event) => onScenePointer(event, false)}
              onPointerDown={(event) => onScenePointer(event, true)}
              onPointerLeave={() => setHoverDive(null)}
            >
              <defs>
                <linearGradient id="penSky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#03060d" />
                  <stop offset="1" stopColor="#14264a" />
                </linearGradient>
                <linearGradient id="penGrass" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0e4a28" />
                  <stop offset="1" stopColor="#2a9a50" />
                </linearGradient>
                <linearGradient id="penPost" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#c9ccd1" />
                  <stop offset=".5" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#b4b8be" />
                </linearGradient>
                <linearGradient id="penBoard" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#0a2a8a" />
                  <stop offset=".5" stopColor="#1e4fd8" />
                  <stop offset="1" stopColor="#0a2a8a" />
                </linearGradient>
                <radialGradient id="penLight" cx=".5" cy=".5" r=".5">
                  <stop offset="0" stopColor="rgba(255,246,200,.55)" />
                  <stop offset="1" stopColor="rgba(255,246,200,0)" />
                </radialGradient>
                <radialGradient id="penVig" cx=".5" cy=".5" r=".75">
                  <stop offset=".62" stopColor="rgba(0,0,0,0)" />
                  <stop offset="1" stopColor="rgba(0,0,0,.55)" />
                </radialGradient>
                <pattern id="penNet" width="6" height="6" patternUnits="userSpaceOnUse">
                  <path d="M6 0H0V6" stroke="rgba(255,255,255,.34)" strokeWidth="0.7" fill="none" />
                </pattern>
                <pattern id="penCrowd" width="9" height="8" patternUnits="userSpaceOnUse">
                  <circle cx="3" cy="3" r="2" fill="rgba(245,184,0,.3)" />
                  <circle cx="7" cy="6" r="2" fill="rgba(255,255,255,.2)" />
                  <circle cx="6" cy="1" r="1.2" fill="rgba(59,130,246,.35)" />
                </pattern>
              </defs>
              <rect width={VW} height={GB + 6} fill="url(#penSky)" />
              <rect width={VW} height={GB - 24} fill="url(#penCrowd)" opacity="0.8" />
              <circle cx="60" cy="0" r="80" fill="url(#penLight)" />
              <circle cx="420" cy="0" r="80" fill="url(#penLight)" />
              <rect y={GB - 22} width={VW} height={28} fill="url(#penBoard)" />
              {[0, 1, 2].map((i) => (
                <path key={i} d={`M${20 + i * 180} ${GB - 22} l22 0 l-14 28 l-22 0z`} fill="rgba(255,255,255,.14)" />
              ))}
              <text x="95" y={GB - 3} fontSize="19" fontWeight="900" fontStyle="italic" fontFamily="'Bebas Neue',Inter,sans-serif" fill="#fff" opacity=".92">7v7</text>
              <text x="372" y={GB - 3} fontSize="19" fontWeight="900" fontStyle="italic" fontFamily="'Bebas Neue',Inter,sans-serif" fill="#fff" opacity=".92">7v7</text>
              <rect y={GB + 6} width={VW} height={VH - GB - 6} fill="url(#penGrass)" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <rect key={i} y={GB + 6 + i * 24} width={VW} height={12 + i * 2} fill="rgba(0,0,0,.08)" />
              ))}
              <g stroke="rgba(255,255,255,.7)" strokeWidth="1.5" fill="none">
                <line x1="0" y1={GB + 6} x2={VW} y2={GB + 6} />
                <line x1="30" y1="150" x2="450" y2="150" />
                <line x1="30" y1="150" x2="-30" y2={VH} />
                <line x1="450" y1="150" x2="510" y2={VH} />
                <line x1="0" y1="262" x2={VW} y2="262" opacity=".4" />
                <path d="M170 150 A70 26 0 0 0 310 150" opacity=".5" />
              </g>
              <ellipse cx={BALL0.x} cy={BALL0.y + 4} rx="22" ry="5" fill="rgba(255,255,255,.12)" />

              <rect x={GL} y={GT} width={GW} height={GH} fill="rgba(6,10,18,.55)" />
              <rect x={GL} y={GT} width={GW} height={GH} fill="url(#penNet)" />
              <rect ref={netRef} x={GL} y={GT} width={GW} height={GH} fill="#ffffff" style={{ opacity: 0, transition: 'opacity .4s' }} />

              <g ref={keeperRef} transform={`translate(${keeperHome(0.5 + shuf).x.toFixed(1)} ${keeperHome(0.5 + shuf).y.toFixed(1)}) scale(1)`}>
                <Disc r={15} color={gTeam.secondary_color || '#1d4ed8'} color2={gTeam.primary_color || '#0b1a33'} label="1" spinRef={keeperSpin} />
              </g>

              {/* traves e travessão (cor sólida: gradiente em linha reta sem largura não é desenhado pelo SVG) */}
              <g stroke="rgba(0,0,0,.35)" strokeWidth="6" strokeLinecap="square" fill="none" transform="translate(1.5 2)">
                <line x1={GL} y1={GB} x2={GL} y2={GT} />
                <line x1={GL + GW} y1={GB} x2={GL + GW} y2={GT} />
                <line x1={GL - 2} y1={GT} x2={GL + GW + 2} y2={GT} />
              </g>
              <g stroke="#f4f6fa" strokeWidth="4.2" strokeLinecap="square" fill="none">
                <line x1={GL} y1={GB} x2={GL} y2={GT} />
                <line x1={GL + GW} y1={GB} x2={GL + GW} y2={GT} />
                <line x1={GL - 2} y1={GT} x2={GL + GW + 2} y2={GT} />
              </g>

              {/* disco do cobrador, na frente da bola (câmera atrás dele) */}
              <g ref={kickerRef} transform={`translate(${KICK0.x} ${KICK0.y})`}>
                <Disc r={27} color={kTeam.primary_color || '#1d4ed8'} color2={kTeam.secondary_color || '#fff'} label={String(numberOf(shooter))} spinRef={kickerSpin} />
              </g>

              {/* anel de precisão: vermelho (ruim), amarelo (médio), verde (ideal); o marcador percorre o anel */}
              {showRing && (
                <g pointerEvents="none">
                  <path d={ringPath(0, 1)} fill="none" stroke="#ef4444" strokeWidth="4.5" strokeLinecap="round" opacity=".9" />
                  <path d={ringPath(0.5 - zones.yellow, 0.5 + zones.yellow)} fill="none" stroke="#facc15" strokeWidth="4.5" strokeLinecap="butt" />
                  <path d={ringPath(0.5 - zones.green, 0.5 + zones.green)} fill="none" stroke="#22c55e" strokeWidth="5" strokeLinecap="butt" />
                  <g ref={markRef} transform={`translate(${KICK0.x} ${KICK0.y + RING.ry})`} fill="#22c55e">
                    <circle r="5.2" stroke="#fff" strokeWidth="1.6" />
                  </g>
                  <text x={KICK0.x} y={KICK0.y + RING.ry + 15} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" letterSpacing=".6" fontFamily="Inter,sans-serif">PRECISÃO</text>
                  <text ref={accRef} x={KICK0.x} y={KICK0.y + RING.ry + 27} textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff" fontFamily="'Bebas Neue',Inter,sans-serif">--</text>
                </g>
              )}

              {/* guia da mira: faixa de luz da bola até o ponto escolhido (só ajuda a ver a direção; não altera o chute) */}
              {showRing && phase === 'aim' && (
                <g pointerEvents="none">
                  <line x1={BALL0.x} y1={BALL0.y - 6} x2={aimPt.x} y2={aimPt.y} stroke="rgba(255,255,255,.18)" strokeWidth="7" strokeLinecap="round" />
                  <line x1={BALL0.x} y1={BALL0.y - 6} x2={aimPt.x} y2={aimPt.y} stroke="rgba(255,255,255,.55)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 5" />
                </g>
              )}
              {showRing && (
                <polygon points={`${KICK0.x - 7},${KICK0.y - 52} ${KICK0.x + 7},${KICK0.y - 52} ${KICK0.x},${KICK0.y - 41}`} fill="#38bdf8" stroke="#fff" strokeWidth="1.2" pointerEvents="none" />
              )}
              {keeperTurn && phase === 'dive' && (
                <polygon points={`${keeperHome(0.5 + shuf).x - 6},${keeperHome(0.5 + shuf).y - 30} ${keeperHome(0.5 + shuf).x + 6},${keeperHome(0.5 + shuf).y - 30} ${keeperHome(0.5 + shuf).x},${keeperHome(0.5 + shuf).y - 20}`} fill="#F5B800" stroke="#fff" strokeWidth="1.2" pointerEvents="none" />
              )}
              <g ref={ballRef} transform={`translate(${BALL0.x} ${BALL0.y})`}>
                <ellipse cy="9" rx="9" ry="3" fill="rgba(0,0,0,.4)" />
                <circle r="9" fill="#ffffff" stroke="#0b1016" strokeWidth="1.2" />
                <polygon points="0,-4 4,-1.2 2.4,3.4 -2.4,3.4 -4,-1.2" fill="#0b1016" />
                <circle cx="-3" cy="-3.2" r="2.2" fill="rgba(255,255,255,.9)" />
              </g>

              <rect width={VW} height={VH} fill="url(#penVig)" pointerEvents="none" />

              {(phase === 'aim' || phase === 'power') && myTurnToKick && (
                <g transform={`translate(${aimPt.x.toFixed(1)} ${aimPt.y.toFixed(1)})`} pointerEvents="none">
                  <circle r="10" fill="rgba(255,255,255,.12)" stroke="#fff" strokeWidth="1.6" opacity=".9" />
                  <circle r="5.2" fill="none" stroke="#fff" strokeWidth="1" opacity=".8" />
                  <circle r="1.6" fill="#fff" />
                </g>
              )}
              {phase === 'dive' && hoverDive && (
                <g transform={`translate(${toSvg(hoverDive).x.toFixed(1)} ${toSvg(hoverDive).y.toFixed(1)})`} pointerEvents="none">
                  <circle r="11" fill="rgba(245,184,0,.2)" stroke="#F5B800" strokeWidth="1.8" />
                  <path d="M-5 0H5M0 -5V5" stroke="#F5B800" strokeWidth="1.4" />
                </g>
              )}
            </svg>
            {/* placar e comandos dentro da cena (telas largas; no celular ficam nos painéis abaixo) */}
            <div className="pk-hud" aria-hidden="true">
              <b>{club.abbreviation}</b><i>{st.goals.user}</i>
              <b>{opponent.abbreviation}</b><i>{st.goals.bot}</i>
            </div>
            {!spectator && phase !== 'done' && (
              <div className="pk-legend" aria-hidden="true">
                {turn === 'user' ? (
                  <>
                    <span><kbd>←↑↓→</kbd> Mirar</span>
                    <span><kbd>1 2 3</kbd> Tipo de chute</span>
                    <span><kbd>Espaço</kbd> Chutar (segure = força)</span>
                  </>
                ) : (
                  <>
                    <span><kbd>◀ ▶</kbd> Posição na linha</span>
                    <span><kbd>1 2</kbd> Antecipar / Reagir</span>
                    <span><kbd>Toque</kbd> Ponto do salto</span>
                  </>
                )}
              </div>
            )}
            {flash && (
              <div key={flash.text + kicks.length} className={`pk-flash ${flash.good ? 'good' : 'bad'}`}>
                {flash.text}
                <small>{flash.sub}</small>
              </div>
            )}
          </div>

          {/* painéis: tipo de chute e força (cobrador) ou modo e posição (goleiro) */}
          {!spectator && phase !== 'done' && (
            <div className="pk-ctl">
              {turn === 'user' ? (
                <>
                  <div className="pk-panel a">
                    <h4>Tipo de chute</h4>
                    {STYLES.map((s, i) => (
                      <button key={s} type="button" className={`pk-opt ${style === s ? 'on' : ''}`} disabled={phase !== 'aim'} title={STYLE_INFO[s].hint} onClick={() => setStyle(s)}>
                        {ICON[s]}
                        {STYLE_INFO[s].label}
                        <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>{i + 1}</span>
                      </button>
                    ))}
                  </div>
                  <div className="pk-panel b pk-force">
                    <b>Força do chute</b>
                    <span className="v" ref={fvalRef}>0%</span>
                    <div className="pk-fbar">
                      <i ref={fbarRef as React.RefObject<HTMLElement & HTMLDivElement> as never} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="pk-panel a">
                    <h4>Goleiro</h4>
                    <button type="button" className={`pk-opt ${kmode === 'antecipar' ? 'on' : ''}`} disabled={phase !== 'dive'} title="Decide antes do chute: alcance cheio, mas pode errar o lado." onClick={() => setKmode('antecipar')}>
                      Antecipar<span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>1</span>
                    </button>
                    <button type="button" className={`pk-opt ${kmode === 'reagir' ? 'on' : ''}`} disabled={phase !== 'dive'} title="Lê a bola e vai para o lado certo, mas chega mais tarde." onClick={() => setKmode('reagir')}>
                      Reagir<span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>2</span>
                    </button>
                  </div>
                  <div className="pk-panel b">
                    <h4>Posição na linha</h4>
                    <div className="pk-small">
                      <button type="button" className="pk-chip" disabled={phase !== 'dive'} onClick={() => setShuf((v) => clamp(v - 0.06, -0.2, 0.2))}>◀</button>
                      <button type="button" className="pk-chip" disabled={phase !== 'dive'} onClick={() => commitDive({ dx: 0.5, dy: 0.6, stay: true })}>Ficar no centro</button>
                      <button type="button" className="pk-chip" disabled={phase !== 'dive'} onClick={() => setShuf((v) => clamp(v + 0.06, -0.2, 0.2))}>▶</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="pk-info">
          <div className="pk-who" style={{ ['--c' as string]: kTeam.primary_color }}>
            <span className="pk-num">{numberOf(shooter)}</span>
            <span>
              {shooter?.name ?? ''}
              <small>COBRADOR · OVR {shooter?.overall ?? '--'}</small>
              <span className="bar"><i style={{ width: ovrBar(shooter?.overall) }} /></span>
            </span>
          </div>
          <div className="pk-who k" style={{ ['--c' as string]: gTeam.primary_color }}>
            <span>
              {gk?.name ?? ''}
              <small>GOLEIRO · OVR {gk?.overall ?? '--'}</small>
              <span className="bar"><i style={{ width: ovrBar(gk?.overall) }} /></span>
            </span>
            <span className="pk-num">1</span>
          </div>
        </div>
      </div>

      {(phase === 'aim' || phase === 'power') && myTurnToKick && (
        <div className="pk-shoot">
          <button
            className="cta-slant pk-btn"
            onPointerDown={(event) => {
              event.preventDefault();
              pressShoot();
            }}
          >
            {phase === 'power' ? '⚽ Segure… solte para chutar' : '⚽ CHUTAR'}
          </button>
        </div>
      )}
      {hint && <p className="pk-hint">{hint}</p>}
      {!spectator && phase !== 'done' && <p className="pk-keys">Teclado: ←↑↓→ mira · Espaço chuta (segure para a força) · 1 2 3 tipo de chute</p>}
      {net && left !== null && (
        <p className="pk-timer" style={{ color: left <= 3 ? '#f87171' : '#F5B800' }}>
          ⏱ {left}s
        </p>
      )}
      {netGone && phase !== 'done' && (
        <div className="pk-gone">
          <p style={{ margin: 0 }}>O adversário saiu da sala.</p>
          <button className="pk-ghost" onClick={() => onAbort?.()}>
            Voltar ao início
          </button>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="pk-end">
          <button className="cta-slant pk-btn" onClick={() => onFinish(result)}>
            Ver resultado
          </button>
        </div>
      )}
      {!net && phase !== 'done' && phase !== 'flying' && (
        <div className="pk-end">
          <button className="pk-ghost" onClick={autoRest}>
            Simular o resto automaticamente
          </button>
        </div>
      )}
    </section>
  );
}
const RING = { rx: 46, ry: 25 };
