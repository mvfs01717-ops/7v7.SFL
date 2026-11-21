import { useEffect, useMemo, useRef, useState } from 'react';
import { createMatchMap, recordMapPass, recordMapSample, type MatchMapData } from '@/lib/game/matchMap';
import type { Ambience } from '@/lib/game/ambience';
import { mixHex, stadiumFor } from '@/lib/game/stadium';
import { perfSample, useLite } from '@/lib/settings';
import { useCosmetics } from '@/lib/cosmetics';
import { newGaitState, stepGait, type GaitState } from '@/lib/game/locomotion';
import { axisTransform, newRing, poseOf, POSE_MS, type PoseKind, type Ring } from '@/lib/game/discFx';
import { animOn, animSpeed, countUse, forcedAnim } from '@/lib/game/animLibrary';
import { chooseCorner, cornerRead, momAdd, momValue, newCornerMem, newMomentum, type CornerKind, type CornerMem, type Momentum, ballAt, blockChance, counterRead, deflect, heatAdd, heatShift, logDecision, newHeat, pickWinner, secondBallRuns, urgency, type LaneHeat } from '@/lib/game/emergent';
import { chooseContact, chooseTackle, CONTACT_ID, laneCut, segPoint, type ContactPlan } from '@/lib/game/contact';
import { chooseDribble, dribbleBody, dribbleGeometry, moveFit, recordDribble, DRIBBLE_CAPTION, type DribbleCtx, type DribbleMove } from '@/lib/game/dribbles';
import { ambientChoice, choosePlay, createIntel, passBias, passTaste, recordPass, recordPlay, type Intel, type PlayKind, type Style } from '@/lib/game/playIntel';
import { ReplayPlayer, type ClipData } from '@/components/game/ReplayPlayer';

type Side = 'user' | 'bot';
type PitchPlayer = { id: string; name: string; overall?: number };
type PitchTeam = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
type PitchEvent = {
  id?: number;
  minute: number;
  type: 'posse' | 'finalização' | 'defesa' | 'gol';
  text: string;
  team: Side;
  // Quem finalizou e quem deu o passe (nomes). Opcionais: sem eles, o nome é procurado no texto do lance.
  actor?: string;
  assist?: string;
};
type Crowd = {
  mood: { user: 'idle' | 'hype' | 'sad' | 'tense'; bot: 'idle' | 'hype' | 'sad' | 'tense' };
  bubbles: { user: { text: string; mood: string; key: number } | null; bot: { text: string; mood: string; key: number } | null };
  noise: number;
  burst?: { side: Side; key: number } | null;
  wave?: { side: Side | 'all'; key: number } | null;
};
type Props = {
  // Posição de cada jogador conforme a função e o foco configurados (ver roleTactics.roleShape)
  shapes?: { user?: Partial<Record<Pos, { dDepth: number; dLat: number; follow: number }>>; bot?: Partial<Record<Pos, { dDepth: number; dLat: number; follow: number }>> };
  // Função e foco de cada vaga (decide o estilo das jogadas: ver lib/game/playIntel)
  styles?: { user?: Partial<Record<Pos, { role: string; focus: string }>>; bot?: Partial<Record<Pos, { role: string; focus: string }>> };
  // 0 a 1: encharcamento do gramado na chuva (cresce com o tempo molhado): poças maiores e mais, marcas de escorregão mais fortes e duradouras
  wet?: number;
  // 0 a 1: quanto as listras do corte do gramado já se apagaram (cresce com o desgaste do jogo)
  grassFade?: number;
  // Estado da torcida (arquibancadas em volta do campo)
  crowd?: Crowd;
  // Horário e clima: muda luz, sombras e, na chuva, poças, gotas e bola mais pesada
  ambience?: Ambience;
  // Quem joga em casa: define o estádio (gramado, mosaico, cobertura) e a torcida cheia; o visitante tem setor menor
  home?: Side;
  // Chamado com a gravação de cada lance importante (gol, defesa, chute perigoso) para os melhores momentos
  onClip?: (eventId: number, clip: ClipData) => void;
  // Posições ao vivo (jogadores, bola e altura da bola) para as câmeras 3D da partida
  liveRef?: { current: LiveSnap | null };
  // Mapa da partida: o campo grava nesta ref as posições e os passes (mapa de calor e rede de passes do resultado)
  mapRef?: { current: MatchMapData | null };
  club: PitchTeam;
  opponent: PitchTeam;
  userTeam: PitchPlayer[];
  botTeam: PitchPlayer[];
  events: PitchEvent[];
  // Chamado no instante em que a bola entra no gol (para o placar subir só nessa hora)
  onGoal?: (id: number, side: Side) => void;
  // Muda quando começa o 2º tempo: limpa as jogadas em andamento e recomeça com a saída de bola
  restartKey?: number;
  // Fim do 1º tempo: o App liga `endHalfRef` e o campo manda a bola para fora (lateral); `deadBallRef` fica true enquanto a bola está parada fora de jogo
  endHalfRef?: { current: boolean };
  // Jogada ensaiada em escolha: o campo inteiro congela (bola, jogadores e relógio das animações) até a decisão
  hold?: boolean;
  // Ordem ao vivo do técnico para o time do usuário: muda a linha e a largura do time (pressionar, recuar, pelas pontas)
  order?: 'pressionar' | 'recuar' | 'pontas' | null;
  // Legenda e balões da torcida saem de cima do campo: quem usa o campo mostra esses textos em outro lugar
  hideOverlays?: boolean;
  onCaption?: (text: string) => void;
  deadBallRef?: { current: boolean };
  // Cansaço: o campo SOMA o esforço de cada jogador em `effort` (corrida, condução com a bola, sprints e desarmes)
  // e LÊ de `slow` (0 a ~0,25) o quanto cada um está mais lento por estar cansado. As chaves são `user-CM`, `bot-LF`...
  workRef?: { current: { effort: Record<string, number>; slow: Record<string, number>; stamina?: Record<string, number> } };
};

const POSITIONS = ['GK', 'LB', 'RB', 'CM', 'LF', 'RF', 'CF'] as const;
type Pos = (typeof POSITIONS)[number];
type Point = { x: number; y: number };
type Slot = {
  key: string;
  side: Side;
  pos: Pos;
  name: string;
  ovr: number;
  base: Point;
  kick: Point;
  x: number;
  y: number;
  vx: number;
  vy: number;
  maxSpeed: number;
  jx: number;
  jy: number;
  jitterAt: number;
};
type Setup = { key: string; x: number; y: number; speed?: number };
type Step = {
  kind: 'pass' | 'shot' | 'move' | 'carry' | 'wait';
  to: { slot: string } | Point;
  dur: number;
  critical?: boolean;
  scripted?: boolean;
  ambient?: boolean;
  dribble?: boolean;
  // Finta (primeiro toque do drible) ou arrancada (segundo); guarda o lado e se o drible dá certo
  feint?: { phase: 'fake' | 'burst'; opp: string; sg: number; win: boolean; move?: DribbleMove };
  arrive?: boolean;
  caption?: string;
  // Altura da bola no meio do trajeto (passe/chute por cima), em pixels
  arc?: number;
  // Efeito: quanto a bola se desvia de lado no meio do trajeto, em pixels (com sinal). A bola faz uma curva até o destino.
  curve?: number;
  // Velocidade do condutor (só em passos de condução)
  speed?: number;
  // Movimentos combinados que começam junto com o passo (corrida do atacante, mergulho do goleiro...)
  setup?: Setup[];
  // Preparação do chute já feita (o disco recuou antes de a bola sair)
  prepped?: boolean;
  after?: () => void;
};
type Override = { x: number; y: number; until: number; speed?: number };
type Active = { step: Step; from: Point; start: number; lead?: Point; dest: string | null };
type Engine = {
  ballX: number;
  ballY: number;
  holder: string | null;
  poss: Side;
  queue: Step[];
  active: Active | null;
  ambientAt: number;
  runAt: number;
  celebrate: { side: Side; actor: string; until: number; run?: Point } | null;
  overrides: Record<string, Override>;
  kickoff: { side: Side; until: number; maxUntil: number } | null;
  lastKey: string;
  // Intervalo mínimo entre dois botes de desarme
  tackleAt: number;
};

// Campo em coordenadas de um SVG 740 x 440
const W = 740;
const H = 440;
const FX0 = 20;
const FX1 = 720;
const FY0 = 10;
const FY1 = 430;
const MID_X = 370;
const MID_Y = 220;
const GOAL_TOP = 188;
const GOAL_BOTTOM = 252;

// Posição base de cada jogador (o time do usuário ataca para a direita)
const BASE: Record<Pos, [number, number]> = {
  GK: [0.05, 0.5],
  LB: [0.22, 0.25],
  RB: [0.22, 0.75],
  CM: [0.42, 0.5],
  LF: [0.64, 0.22],
  RF: [0.64, 0.78],
  CF: [0.72, 0.5],
};
// Formação de saída de bola (início e depois de cada gol): cada time na sua metade
// (o CF do time que sai fica na bola, no centro; o CM fica logo atrás dele)
const KICK: Record<Pos, [number, number]> = {
  GK: [0.05, 0.5],
  LB: [0.2, 0.25],
  RB: [0.2, 0.75],
  CM: [0.3, 0.5],
  LF: [0.38, 0.2],
  RF: [0.38, 0.8],
  CF: [0.4, 0.5],
};
// Quanto cada posição acompanha o avanço e o recuo da bola
const SHAPE_FACTOR: Record<Pos, number> = { GK: 0, LB: 0.55, RB: 0.55, CM: 1, LF: 0.9, RF: 0.9, CF: 0.9 };
// Quem marca quem quando o time está sem a bola
const MARK: Record<Pos, Pos> = { GK: 'GK', LB: 'RF', RB: 'LF', CM: 'CF', LF: 'RB', RF: 'LB', CF: 'CM' };
const FORWARDS: Pos[] = ['LF', 'RF', 'CF'];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const dirOf = (side: Side) => (side === 'user' ? 1 : -1);
const otherSide = (side: Side): Side => (side === 'user' ? 'bot' : 'user');
const sideOf = (key: string) => key.split('-')[0] as Side;
const passDur = (d: number) => clamp(260 + d * 1.25, 320, 760);

// Arquibancadas em volta do campo (faixas acima e abaixo): metade do time da casa e metade do visitante
const STAND = 62;
type Fan = { x: number; y: number; body: string; skin: string; delay: number; dur: number; side: Side };
function buildFans(primary: Record<Side, string>, secondary: Record<Side, string>): Fan[] {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const skins = ['#f1c9a0', '#d9a066', '#a8714a', '#7a4b2a', '#f6d7b8'];
  const fans: Fan[] = [];
  for (const top of [true, false]) {
    for (let row = 0; row < 3; row += 1) {
      const count = 46 - row * 2;
      for (let i = 0; i < count; i += 1) {
        const x = 8 + ((i + (row % 2 ? 0.5 : 0)) * (W - 16)) / (count - 0.5) + (rnd() - 0.5) * 3;
        const side: Side = x < MID_X ? 'user' : 'bot';
        const y = top ? -17 - row * 15 : H + 13 + row * 15;
        const r = rnd();
        fans.push({
          x,
          y,
          side,
          body: r < 0.6 ? primary[side] : r < 0.88 ? secondary[side] : '#e5e7eb',
          skin: skins[Math.floor(rnd() * skins.length)],
          delay: rnd() * 1.4,
          dur: 0.75 + rnd() * 0.6,
        });
      }
    }
  }
  return fans;
}
// ---------- Replay do gol (estilo TV): janelinha com a jogada em câmera lenta ----------
type ReplayData = ClipData;

function GoalReplay({ data, club, opponent, onDone }: { data: ReplayData; club: PitchTeam; opponent: PitchTeam; onDone: () => void }) {
  return (
    <div className="pc-replay" role="dialog" aria-label="Replay do gol">
      <div className="pc-rp-top">
        <span className="pc-rp-badge">
          <i /> REPLAY
        </span>
        <b>{data.label}</b>
        <button type="button" onClick={onDone} aria-label="Fechar replay">
          ✕
        </button>
      </div>
      <ReplayPlayer data={data} club={club} opponent={opponent} onEnd={onDone} />
    </div>
  );
}

const crowdCss = `
.pc-fan { transform-box: fill-box; transform-origin: 50% 100%; }
/* Torcida parada: balança por grupo (poucas animações) em vez de uma por torcedor; por torcedor só em gol, tensão e ola */
.pc-fgrp { animation: pcBob calc(1.2s * var(--beat, 1)) ease-in-out infinite; }
.pc-half.hype .pc-fgrp, .pc-half.tense .pc-fgrp, .pc-half.sad .pc-fgrp, .pc-ola .pc-fgrp, .pc-lite .pc-fgrp { animation: none; }
.pc-arms { opacity: 0; }
.pc-half.hype .pc-fan { animation: pcJump .38s ease-in-out infinite; }
.pc-half.hype .pc-arms { opacity: 1; }
.pc-half.tense .pc-fan { animation: pcLean calc(var(--dur, 1.2s) * var(--beat, 1)) ease-in-out infinite; }
.pc-half.sad .pc-fan { animation: none; transform: translateY(2px) scaleY(.93); filter: saturate(.55) brightness(.8); }
.pc-glow { opacity: 0; transition: opacity .5s; }
.pc-half.hype .pc-glow { opacity: .55; animation: pcFlash .5s ease-in-out infinite alternate; }
.pc-flag { transform-box: fill-box; transform-origin: 0 100%; animation: pcWave 1.3s ease-in-out infinite; }
.pc-half.hype .pc-flag { animation-duration: .45s; }
.pc-bub { position: absolute; top: 6px; margin: 0; max-width: 44%; padding: 5px 10px; border-radius: 12px; font-size: clamp(10px, 1.7vw, 13px); font-weight: 800; line-height: 1.25; color: #f4f4f0; pointer-events: none;
  background: rgba(8,12,20,.78); border: 1px solid rgba(255,255,255,.2); backdrop-filter: blur(4px); animation: pcPop .35s cubic-bezier(.2,1.4,.4,1) both; }
.pc-bub.hype { background: linear-gradient(180deg, #ffe27a, #F5B800); color: #1a1200; border-color: #ffe27a; box-shadow: 0 0 20px rgba(245,184,0,.5); }
.pc-bub.sad { color: #cbd5e1; font-style: italic; }
.pc-bub.tense { border-color: rgba(245,184,0,.6); }
.pc-db { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); padding: 3px 10px; border-radius: 99px; font-size: 10px; font-weight: 900; letter-spacing: .1em; color: #F5B800; background: rgba(0,0,0,.6); border: 1px solid rgba(245,184,0,.35); pointer-events: none; font-variant-numeric: tabular-nums; }
.pc-replay { visibility: visible; position: absolute; right: 8px; bottom: 52px; width: min(46%, 380px); border-radius: 12px; overflow: hidden; border: 2px solid #F5B800; background: #000; box-shadow: 0 12px 40px rgba(0,0,0,.7), 0 0 26px rgba(245,184,0,.35); animation: pcRpIn .45s cubic-bezier(.2,1.2,.4,1) both; z-index: 5; }
.pc-rp-top { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: linear-gradient(90deg, rgba(0,0,0,.92), rgba(20,16,0,.85)); font-size: 11px; color: #fff; }
.pc-rp-top b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; letter-spacing: .04em; }
.pc-rp-top button { background: none; border: 0; color: rgba(255,255,255,.7); cursor: pointer; font-size: 13px; padding: 0 2px; }
.pc-rp-badge { display: inline-flex; align-items: center; gap: 5px; font-family: 'Bebas Neue', sans-serif; font-size: 14px; letter-spacing: .12em; color: #F5B800; }
.pc-rp-badge i { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: pcRec 1s steps(2) infinite; }
.pc-rp-bar { height: 4px; background: rgba(255,255,255,.15); }
.pc-rp-bar div { height: 100%; width: 0; background: #F5B800; }
@keyframes pcRec { 50% { opacity: .15; } }
/* Celular: o replay sai de cima do campo e fica no canto inferior da tela */
@media (max-width: 720px) { .pc-replay { position: fixed; left: 8px; right: auto; bottom: calc(14px + env(safe-area-inset-bottom)); width: min(54vw, 230px); z-index: 80; }
  .pc-replay .rp-ctl { padding: 4px; }
  .pc-replay .rp-ctl .sp, .pc-replay .rp-ctl button:not(:last-child) { display: none; }
  .pc-replay .rp-ctl button:last-child { width: 100%; } }
@keyframes pcRpIn { 0% { transform: translateY(20px) scale(.9); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes pcOla { 0%,100% { transform: none; } 35% { transform: translateY(-9px) scaleY(1.12); } }
.pc-ola .pc-fan { animation: pcOla 1.1s ease-in-out both !important; animation-delay: calc(var(--fx) * 1.5s) !important; }
.pc-ola .pc-arms { opacity: 1; }
.pc-ola.pc-ola-user .pc-half.pc-half-bot .pc-fan, .pc-ola.pc-ola-bot .pc-half.pc-half-user .pc-fan { animation: none !important; }
.pc-half.hype .pc-fan { animation-delay: calc(var(--fx) * .12s) !important; }
.pc-conf { transform-box: fill-box; transform-origin: 50% 50%; opacity: 0; animation: pcConf var(--cd, 1.8s) cubic-bezier(.2,.7,.4,1) var(--cl, 0s) both; }
@keyframes pcConf { 0% { opacity: 1; transform: translate(0,0) rotate(0); } 100% { opacity: 0; transform: translate(var(--cx), var(--cy)) rotate(var(--cr)); } }
.pc-flare { opacity: 0; animation: pcFlare 2.2s ease-out both; }
@keyframes pcFlare { 0% { opacity: .9; } 100% { opacity: 0; } }
.pc-lite .pc-fan, .pc-lite .pc-glow, .pc-lite .pc-flood, .pc-lite .pc-flag { animation: none !important; }
.pc-flood { animation: pcFlood 7s ease-in-out infinite alternate; }
@keyframes pcFlood { from { opacity: .82; } to { opacity: 1; } }
.pc-net-hit { animation: pcNet 1s cubic-bezier(.2,.8,.3,1) both; }
@keyframes pcNet { 0% { transform: scaleX(1) skewY(0); } 18% { transform: scaleX(1.85) skewY(7deg); } 38% { transform: scaleX(1.25) skewY(-5deg); } 60% { transform: scaleX(1.5) skewY(3deg); } 80% { transform: scaleX(1.12) skewY(-1.5deg); } 100% { transform: scaleX(1) skewY(0); } }
.pc-dust { opacity: 0; transform-box: fill-box; transform-origin: 50% 50%; }
/* Chuva: cada grupo de gotas anda um "degrau" (63px) e recomeça sem emenda, então são só 8 animações em vez de 80 */
@keyframes pcRain { from { transform: translate(0, 0); } to { transform: translate(-2.2px, 63px); } }
.pc-dropg { animation: pcRain var(--rd, .07s) linear var(--rl, 0s) infinite; }
@keyframes pcStrike { 0%, 93% { opacity: 0; } 94% { opacity: .38; } 95% { opacity: 0; } 96% { opacity: .24; } 97%, 100% { opacity: 0; } }
.pc-strike { opacity: 0; animation: pcStrike 17s linear infinite; }
@keyframes pcBob { 50% { transform: translateY(-1.4px); } }
@keyframes pcJump { 50% { transform: translateY(-6px); } }
@keyframes pcLean { 50% { transform: translateY(-3px) rotate(-3deg); } }
@keyframes pcWave { 50% { transform: skewY(-9deg) rotate(5deg); } }
@keyframes pcFlash { to { opacity: .22; } }
@keyframes pcPop { 0% { transform: scale(.6) translateY(-6px); opacity: 0; } 100% { transform: none; opacity: 1; } }
/* Celular: balões da torcida pequenos, de uma linha só, para não cobrirem o campo */
@media (max-width: 560px) { .pc-bub { top: 3px; max-width: 36%; padding: 2px 7px; border-radius: 9px; font-size: 9.5px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: none; } .pc-bub.hype { box-shadow: 0 0 8px rgba(245,184,0,.4); } .pc-db { display: none; } }
@media (prefers-reduced-motion: reduce) { .pc-replay, .pc-fan, .pc-flag, .pc-bub, .pc-glow, .pc-conf, .pc-flood, .pc-net-hit, .pc-dropg, .pc-strike { animation: none !important; } }
`;

function toPoint(side: Side, f: number, g: number): Point {
  const ff = side === 'user' ? f : 1 - f;
  const gg = side === 'user' ? g : 1 - g;
  return { x: FX0 + ff * (FX1 - FX0), y: FY0 + gg * (FY1 - FY0) };
}

// Uniformes das bolinhas: cada time ganha um desenho (listras, faixas, metades, diagonal ou liso) escolhido pela sigla,
// então os dois times não parecem só "vermelho e branco". O goleiro usa uma cor própria que não se confunde com os dois times.
type KitKind = 'stripes' | 'hoops' | 'halves' | 'sash' | 'solid';
const KIT_KINDS: KitKind[] = ['stripes', 'hoops', 'halves', 'sash', 'solid'];
function kitKind(abbr: string): KitKind {
  let h = 0;
  for (let i = 0; i < abbr.length; i += 1) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
  return KIT_KINDS[h % KIT_KINDS.length];
}
function rgbOf(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function colorGap(a: string, b: string) {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}
function keeperColor(a: string, b: string) {
  const options = ['#f2c90f', '#2fd67f', '#ff8a1f', '#c04dff', '#19c3e6'];
  return options.reduce((best, c) => (Math.min(colorGap(c, a), colorGap(c, b)) > Math.min(colorGap(best, a), colorGap(best, b)) ? c : best), options[0]);
}
function KitPattern({ kind, color }: { kind: KitKind; color: string }) {
  switch (kind) {
    case 'stripes':
      return (
        <>
          {[-10, -2, 6].map((x) => (
            <rect key={x} x={x} y={-13} width={4} height={26} fill={color} opacity={0.92} />
          ))}
        </>
      );
    case 'hoops':
      return (
        <>
          {[-10, -2, 6].map((y) => (
            <rect key={y} x={-13} y={y} width={26} height={4} fill={color} opacity={0.92} />
          ))}
        </>
      );
    case 'halves':
      return <rect x={0} y={-13} width={13} height={26} fill={color} opacity={0.92} />;
    case 'sash':
      return <polygon points="-13,-4 -4,-13 13,4 4,13" fill={color} opacity={0.92} />;
    default:
      return <path d="M-6 -12.3 Q0 -6 6 -12.3" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />;
  }
}

function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111111' : '#ffffff';
}

// Adversário de fora do goleiro mais próximo de um ponto
function nearestOpp(all: Slot[], mySide: Side, p: Point) {
  let best: Slot | undefined;
  let bd = Infinity;
  for (const o of all) {
    if (o.side === mySide || o.pos === 'GK') continue;
    const d = dist(o, p);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return { slot: best, d: bd };
}

// Marcador logo à frente de quem está com a bola (candidato a drible)
function aheadOpp(all: Slot[], h: Slot): Slot | undefined {
  const d = dirOf(h.side);
  let best: Slot | undefined;
  let bd = Infinity;
  for (const o of all) {
    if (o.side === h.side || o.pos === 'GK') continue;
    const ahead = (o.x - h.x) * d;
    if (ahead < 22 || ahead > 110 || Math.abs(o.y - h.y) > 34) continue;
    const dd = dist(o, h);
    if (dd < bd) {
      bd = dd;
      best = o;
    }
  }
  return best;
}

// Escolhe para quem passar: prefere quem está à frente e livre, mas passa para trás sob pressão
function choosePass(h: Slot, all: Slot[], bias?: (r: Slot, fwd: number) => number): Slot | undefined {
  const d = dirOf(h.side);
  const pressure = nearestOpp(all, h.side, h).d < 40;
  const deep = (h.x - (d > 0 ? FX0 : FX1)) * d < 220;
  let best: Slot | undefined;
  let bestScore = -Infinity;
  for (const r of all) {
    if (r.side !== h.side || r.key === h.key) continue;
    if (r.pos === 'GK' && (h.pos === 'GK' || !(deep && Math.random() < 0.25))) continue;
    const dd = dist(h, r);
    if (dd < 45) continue;
    const fwd = ((r.x - h.x) * d) / 100;
    const open = Math.min(1, nearestOpp(all, h.side, r).d / 80);
    const score =
      (pressure ? 0.2 : 0.9) * fwd + 0.7 * open - Math.abs(dd - 150) / 220 + Math.random() * 0.7 + (pressure && fwd < 0 ? 0.5 : 0) + (bias ? bias(r, fwd) : 0);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

// Desenho da bola: pentágono preto no centro, costuras e gomos pretos nas bordas (gira conforme a bola anda)
const BALL_R = 7.5;
const pentagon = (cx: number, cy: number, r: number, rot: number) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = ((rot + i * 72) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
const BALL_CENTER = pentagon(0, 0, 2.5, -90);
const BALL_SEAMS = Array.from({ length: 5 }, (_, i) => {
  const a = ((-90 + i * 72) * Math.PI) / 180;
  return { x1: 2.5 * Math.cos(a), y1: 2.5 * Math.sin(a), x2: 4.7 * Math.cos(a), y2: 4.7 * Math.sin(a) };
});
const BALL_EDGES = Array.from({ length: 5 }, (_, i) => {
  const a = -90 + 36 + i * 72;
  const rad = (a * Math.PI) / 180;
  return pentagon(8.6 * Math.cos(rad), 8.6 * Math.sin(rad), 2.9, a + 180);
});

// Desgaste do gramado: o campo é dividido em quadradinhos de 24 px; cada segundo que um jogador passa num quadradinho
// deixa a terra aparecer um pouco mais. Gols, meio-campo e corredores dos lados ficam gastos no fim do jogo.
const WEAR_CELL = 24;
const WEAR_COLS = Math.ceil((FX1 - FX0) / WEAR_CELL);
const WEAR_ROWS = Math.ceil((FY1 - FY0) / WEAR_CELL);
const WEAR_PER_SEC = 0.0311; // desgaste ganho por segundo de pisada (calibrado para quadradinhos de 24 px; era 0.07 com 16 px)
const WEAR_FULL_TOTAL = 1000; // pisadas totais (em segundos de jogador) para o campo chegar no "jogo inteiro"
// Cada quadradinho tem um jeito próprio (posição, tamanho, giro e "resistência" do gramado) para o desgaste não parecer uma grade.
// Primeiro o gramado afina e amarela; só depois, nos pontos mais fracos, a terra aparece em manchas.
const wrand = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const WEAR_CELLS = Array.from({ length: WEAR_COLS * WEAR_ROWS }, (_, i) => {
  const col = i % WEAR_COLS;
  const row = Math.floor(i / WEAR_COLS);
  const patch = 0.5 + 0.5 * Math.sin(col * 0.55 + Math.sin(row * 0.7) * 1.6) * Math.cos(row * 0.62 + Math.cos(col * 0.4) * 1.4);
  const px = FX0 + col * WEAR_CELL + WEAR_CELL / 2;
  const py = FY0 + row * WEAR_CELL + WEAR_CELL / 2;
  const g = (dx: number, dy: number, sx: number, sy: number) => Math.exp(-((dx / sx) ** 2) - ((dy / sy) ** 2));
  // Onde o gramado realmente sofre: perto dos gols e no meio. Os cantos e as pontas do campo quase não gastam.
  const goalmouth = Math.max(g(px - FX0, py - MID_Y, 95, 80), g(px - FX1, py - MID_Y, 95, 80));
  const centre = g(px - MID_X, py - MID_Y, 85, 70);
  const corner = Math.max(g(px - FX0, py - FY0, 80, 60), g(px - FX1, py - FY0, 80, 60), g(px - FX0, py - FY1, 80, 60), g(px - FX1, py - FY1, 80, 60));
  const touch = Math.max(0, (0.3 + 0.9 * goalmouth + 0.55 * centre) * (1 - 0.9 * corner));
  return {
    touch,
    cx: FX0 + col * WEAR_CELL + WEAR_CELL / 2 + (wrand(i, 1) - 0.5) * WEAR_CELL * 0.7,
    cy: FY0 + row * WEAR_CELL + WEAR_CELL / 2 + (wrand(i, 2) - 0.5) * WEAR_CELL * 0.7,
    rx: WEAR_CELL * (0.6 + wrand(i, 3) * 0.55),
    ry: WEAR_CELL * (0.5 + wrand(i, 4) * 0.45),
    rot: wrand(i, 5) * 180,
    thr: 0.2 + patch * 0.3 + wrand(i, 6) * 0.2,
  };
});

const MARK_POOL = 56;
const DUST_POOL = 18;

export type LiveSnap = {
  ball: [number, number, number]; // x, y, altura
  pts: number[]; // x1,y1,x2,y2,... na mesma ordem de `sides`
  sides: Side[];
  letters: string[];
  keys: string[];
  holder: number; // índice de quem está com a bola (-1 = ninguém)
  frozen: boolean; // intervalo/pausa
  // Desarme em andamento: índices de quem dá o bote e de quem é desarmado, esticada do marcador e giro/pulo do outro
  fx: { def: number; hold: number; stretch: number; hrot: number; hsc: number } | null;
};

export default function MatchPitch({ wet = 0.3, grassFade = 0, liveRef, home = 'user', ambience, crowd, onClip, mapRef, club, opponent, userTeam, botTeam, events, onGoal, restartKey, workRef, endHalfRef, deadBallRef, hold = false, hideOverlays = false, onCaption, order = null, shapes, styles }: Props) {
  const holdRef = useRef(false);
  holdRef.current = hold;
  const orderRef = useRef<Props['order']>(null);
  const shapesRef = useRef<Props['shapes']>(undefined);
  shapesRef.current = shapes;
  const stylesRef = useRef<Props['styles']>(undefined);
  stylesRef.current = styles;
  // Memória de jogadas e leitura do adversário: dura a partida inteira
  const intelRef = useRef<Intel>(createIntel());
  orderRef.current = order;
  // Tempo do campo: igual ao relógio do navegador, menos o tempo que ficou congelado
  const heldTotal = useRef(0);
  const heldSince = useRef(0);
  const tnow = () => (heldSince.current || performance.now()) - heldTotal.current;
  // Modo otimizado (Configurações): menos efeitos para o campo rodar leve em celulares
  const lite = useLite();
  const { ball: ballSkin } = useCosmetics();
  const liteRef = useRef(lite);
  liteRef.current = lite;
  const soft = lite ? undefined : 'url(#pc-soft)';
  const workRefLocal = useRef(workRef);
  workRefLocal.current = workRef;
  const onGoalRef = useRef(onGoal);
  onGoalRef.current = onGoal;
  const clipTimers = useRef<number[]>([]);
  const liveRefRef = useRef(liveRef);
  liveRefRef.current = liveRef;
  const mapRefRef = useRef(mapRef);
  mapRefRef.current = mapRef;
  const lastMapAt = useRef(0);
  const wear = useRef({ heat: new Float32Array(WEAR_COLS * WEAR_ROWS), shown: new Float32Array(WEAR_COLS * WEAR_ROWS), shownB: new Float32Array(WEAR_COLS * WEAR_ROWS), total: 0, at: 0 });
  const wearNodes = useRef<(SVGEllipseElement | null)[]>([]);
  const wearDirt = useRef<(SVGEllipseElement | null)[]>([]);
  const wearLines = useRef<SVGGElement | null>(null);
  const wearSpots = useRef<SVGGElement | null>(null);
  // Os 700+ elementos do desgaste só são criados uma vez (o React não precisa conferir de novo a cada atualização)
  const wearCells = useMemo(
    () => lite ? null : (
      <>
        {WEAR_CELLS.map((c, i) => (
          <ellipse
            key={`t${i}`}
            ref={(el: SVGEllipseElement | null) => {
              wearNodes.current[i] = el;
            }}
            cx={c.cx}
            cy={c.cy}
            rx={c.rx}
            ry={c.ry}
            transform={`rotate(${c.rot.toFixed(0)} ${c.cx.toFixed(1)} ${c.cy.toFixed(1)})`}
            fill="url(#pc-thin)"
            opacity={0}
          />
        ))}
        {WEAR_CELLS.map((c, i) => (
          <ellipse
            key={`d${i}`}
            ref={(el: SVGEllipseElement | null) => {
              wearDirt.current[i] = el;
            }}
            cx={c.cx}
            cy={c.cy}
            rx={c.rx * 0.8}
            ry={c.ry * 0.8}
            transform={`rotate(${c.rot.toFixed(0)} ${c.cx.toFixed(1)} ${c.cy.toFixed(1)})`}
            fill="url(#pc-wear)"
            opacity={0}
          />
        ))}
      </>
    ),
    [lite],
  );
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;
  const slots = useMemo<Slot[]>(() => {
    const build = (side: Side, list: PitchPlayer[]): Slot[] =>
      POSITIONS.map((pos, i) => {
        const player = list[i];
        const base = toPoint(side, BASE[pos][0], BASE[pos][1]);
        const kick = toPoint(side, KICK[pos][0], KICK[pos][1]);
        return {
          key: `${side}-${pos}`,
          side,
          pos,
          name: player?.name ?? pos,
          ovr: player?.overall ?? 75,
          base,
          kick,
          x: side === 'user' && pos === 'CM' ? MID_X - 12 : kick.x,
          y: side === 'user' && pos === 'CM' ? MID_Y : kick.y,
          vx: 0,
          vy: 0,
          maxSpeed: rand(105, 135),
          jx: 0,
          jy: 0,
          jitterAt: 0,
        };
      });
    return [...build('user', userTeam), ...build('bot', botTeam)];
  }, [userTeam, botTeam]);

  const slotsRef = useRef<Slot[]>(slots);
  slotsRef.current = slots;

  const engine = useRef<Engine>({
    ballX: MID_X,
    ballY: MID_Y,
    holder: 'user-CM',
    poss: 'user',
    queue: [],
    active: null,
    ambientAt: 0,
    runAt: 0,
    celebrate: null,
    overrides: {},
    kickoff: null,
    lastKey: '',
    tackleAt: 0,
  });
  const nodes = useRef<Record<string, SVGGElement | null>>({});
  // Passada: chuteiras alternando e marcha de cada jogador (ver lib/game/locomotion)
  const fxNodes = useRef<Record<string, SVGGElement | null>>({});
  const poseRef = useRef<Record<string, { kind: PoseKind; t0: number; ang: number; pow: number }>>({});
  const ringNodes = useRef<(SVGCircleElement | null)[]>([]);
  const ringsRef = useRef<Ring[]>(Array.from({ length: 6 }, newRing));
  const ringNext = useRef(0);
  const gaitRef = useRef<Record<string, GaitState>>({});
  const ballNode = useRef<SVGGElement | null>(null);
  const ringNode = useRef<SVGGElement | null>(null);
  // Barra de fôlego em cima de cada jogador: aparece com a bola ou quando está muito cansado
  const staminaBars = useRef<Record<string, { box: SVGGElement | null; fill: SVGRectElement | null }>>({});
  const nameNode = useRef<SVGTextElement | null>(null);
  const liftNode = useRef<SVGGElement | null>(null);
  const spinNode = useRef<SVGGElement | null>(null);
  const ballShadow = useRef<SVGEllipseElement | null>(null);
  const bounce = useRef({ start: 0, h: 0 });
  // Marcas de chuteira e poeira: elementos reaproveitados (pool) para não criar nada durante o jogo
  const markNodes = useRef<(SVGPathElement | null)[]>([]);
  const markData = useRef<{ born: number; base: number }[]>(Array.from({ length: MARK_POOL }, () => ({ born: 0, base: 0 })));
  const markNext = useRef(0);
  const markFade = useRef(0);
  const dustNodes = useRef<(SVGCircleElement | null)[]>([]);
  const dustData = useRef<{ born: number; x: number; y: number; dx: number; dy: number; on: boolean }[]>(
    Array.from({ length: DUST_POOL }, () => ({ born: 0, x: 0, y: 0, dx: 0, dy: 0, on: false })),
  );
  const dustNext = useRef(0);
  const motion = useRef<Record<string, { x: number; y: number; vx: number; vy: number; hx: number; hy: number; hAt: number; cool: number }>>({});
  const slideRef = useRef<Record<string, { until: number; fx: number; fy: number }>>({});
  // Contato com a bola: controle em andamento (sobra da bola que assenta), bola solta após erro de domínio e proteção da posse
  const ctlRef = useRef<Record<string, { t0: number; plan: ContactPlan; ang: number; side: number }>>({});
  const looseRef = useRef<{ key: string; vx: number; vy: number; until: number } | null>(null);
  const shieldRef = useRef<Record<string, number>>({});
  const coverUse = useRef<Record<string, number>>({});
  // Jogabilidade emergente: segunda bola, contra-ataque, placar/tempo e leitura de região
  const sbRef = useRef<{ vx: number; vy: number; t0: number; until: number; from: Side | null; cap: string; runs: ReturnType<typeof secondBallRuns> } | null>(null);
  const counterRef = useRef<{ side: Side; until: number } | null>(null);
  const heatRef = useRef<Record<Side, LaneHeat>>({ user: newHeat(), bot: newHeat() });
  const cautiousRef = useRef<Record<Side, { n: number; at: number }>>({ user: { n: 0, at: 0 }, bot: { n: 0, at: 0 } });
  const sitRef = useRef({ minute: 0, user: 0, bot: 0 });
  const momRef = useRef<Momentum>(newMomentum());
  const momEl = useRef<HTMLDivElement>(null);
  const momNext = useRef(0);
  const momTalk = useRef(0);
  const cornerMem = useRef<Record<Side, CornerMem>>({ user: newCornerMem(), bot: newCornerMem() });
  const urgRef = useRef<Record<Side, { u: number; at: number }>>({ user: { u: 0, at: 0 }, bot: { u: 0, at: 0 } });
  const adaptLog = useRef<Record<Side, number>>({ user: 0, bot: 0 });
  sitRef.current = { minute: events[0]?.minute ?? 0, user: events.filter((e) => e.type === 'gol' && e.team === 'user').length, bot: events.filter((e) => e.type === 'gol' && e.team === 'bot').length };
  // Animação do desarme: o marcador estica no chão (carrinho) ou dá o bote, a bota aparece, o impacto pisca e o desarmado tropeça
  const tackleFx = useRef<{ def: string; hold: string; t0: number; span: number; slide: boolean; win: boolean; ax: number; ay: number; contact: number } | null>(null);
  const dribFx = useRef<{ key: string; opp: string; t0: number; dur: number; sg: number; win: boolean; phase: 'fake' | 'burst'; dx: number; move: DribbleMove } | null>(null);
  const tkSnap = useRef<{ def: string; hold: string; stretch: number; hrot: number; hsc: number } | null>(null);
  const bootNode = useRef<SVGGElement | null>(null);
  const impactNode = useRef<SVGCircleElement | null>(null);
  const spin = useRef({ angle: 0, x: MID_X, y: MID_Y });
  const trailNodes = useRef<(SVGCircleElement | null)[]>([]);
  const trailPts = useRef<Point[]>([]);
  const netNodes = useRef<Record<Side, SVGRectElement | null>>({ user: null, bot: null });
  const homeTeam = home === 'user' ? club : opponent;
  const arena = useMemo(() => stadiumFor(homeTeam), [homeTeam.abbreviation, homeTeam.name]);
  const amb: Ambience = ambience ?? { time: 'night', weather: 'clear' };
  const rain = amb.weather === 'rain';
  const rainRef = useRef(rain);
  rainRef.current = rain;
  const wetRef = useRef(wet);
  wetRef.current = wet;
  // Poças fixas (mesmas em todos os aparelhos da sala): espalhadas pelo campo, longe das linhas de fundo
  const puddles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        x: FX0 + 90 + wrand(i, 21) * (FX1 - FX0 - 180),
        y: FY0 + 40 + wrand(i, 22) * (FY1 - FY0 - 80),
        rx: 14 + wrand(i, 23) * 20,
        ry: 5 + wrand(i, 24) * 7,
      })),
    [],
  );
  const puddlesRef = useRef(puddles);
  puddlesRef.current = puddles;
  const [olaOn, setOlaOn] = useState<null | 'user' | 'bot' | 'all'>(null);
  const [burstOn, setBurstOn] = useState<{ side: Side; key: number } | null>(null);
  const waveKey = crowd?.wave?.key;
  const burstKey = crowd?.burst?.key;
  useEffect(() => {
    if (!crowd?.wave) return undefined;
    setOlaOn(crowd.wave.side);
    const t = window.setTimeout(() => setOlaOn(null), 2900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveKey]);
  useEffect(() => {
    if (!crowd?.burst) return undefined;
    setBurstOn(crowd.burst);
    const t = window.setTimeout(() => setBurstOn(null), 3200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey]);
  const netMesh = useRef<Record<Side, SVGGElement | null>>({ user: null, bot: null });
  const [caption, setCaption] = useState('Bola rolando');
  const onCaptionRef = useRef(onCaption);
  onCaptionRef.current = onCaption;
  useEffect(() => {
    onCaptionRef.current?.(caption);
  }, [caption]);
  const [goalText, setGoalText] = useState('');
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const rec = useRef<{ last: number; frames: number[][]; pending: ReplayData | null; timers: number[]; seq: number }>({ last: 0, frames: [], pending: null, timers: [], seq: 0 });

  const find = (key: string) => slotsRef.current.find((s) => s.key === key);

  // A rede balança quando a bola entra
  function flashNet(side: Side) {
    const node = netNodes.current[side];
    if (!node) return;
    node.setAttribute('fill', 'rgba(255,255,255,.65)');
    window.setTimeout(() => node.setAttribute('fill', 'rgba(255,255,255,.12)'), 750);
    // A rede estufa com o impacto da bola e balança até acalmar
    const mesh = netMesh.current[side];
    if (mesh) {
      mesh.classList.remove('pc-net-hit');
      void (mesh as unknown as HTMLElement).getBoundingClientRect();
      mesh.classList.add('pc-net-hit');
    }
    // Poeira de comemoração/torcida cuida do resto; aqui só o gol
  }

  // Grava o lance (últimos ~6,8 s) um instante depois de acontecer e entrega para os melhores momentos
  function captureClip(eventId: number | undefined, kind: 'gol' | 'defesa' | 'quase', label: string, actorKey: string, delay = 450) {
    if (eventId === undefined || !onClipRef.current) return;
    const timer = window.setTimeout(() => {
      const endT = tnow();
      const frames = rec.current.frames.filter((f) => f[0] >= endT - 6800).map((f) => f.map((v, i) => (i === 0 ? v : Math.round(v * 10) / 10)));
      if (frames.length < 20) return;
      onClipRef.current?.(eventId, {
        frames,
        sides: slotsRef.current.map((x) => x.side),
        letters: slotsRef.current.map((x) => x.name.slice(0, 1).toUpperCase()),
        actor: slotsRef.current.findIndex((x) => x.key === actorKey),
        label,
        id: eventId,
        kind,
      });
    }, delay);
    clipTimers.current.push(timer);
  }

  // Comemoração: o autor do gol sai correndo para o canto (na maioria das vezes) e o time vai atrás dele
  function startCelebration(side: Side, actorKey: string, label = 'GOL!') {
    const st = engine.current;
    const a = find(actorKey);
    const dir = dirOf(side);
    const goalX = dir > 0 ? FX1 : FX0;
    const run: Point | undefined =
      a && Math.random() < 0.6 ? { x: goalX - dir * 38, y: a.y < MID_Y ? FY0 + 34 : FY1 - 34 } : undefined;
    st.celebrate = { side, actor: actorKey, until: tnow() + 2200, run };
    st.holder = null;
    st.overrides = {};
    const who = a?.name ?? '';
    setGoalText(`${label} ${who}`.trim());
    window.setTimeout(() => setGoalText(''), 2000);
    // Replay: guarda os últimos segundos gravados (com 0,6 s depois do gol) e mostra a janelinha depois da comemoração
    const r = rec.current;
    r.timers.forEach((t) => window.clearTimeout(t));
    r.timers = [];
    r.seq += 1;
    const id = r.seq;
    const actorIndex = slotsRef.current.findIndex((x) => x.key === actorKey);
    const caption = `${label} ${a?.name ?? ''}`.trim();
    r.timers.push(
      window.setTimeout(() => {
        const endT = tnow();
        const frames = r.frames.filter((f) => f[0] >= endT - 6800);
        if (frames.length < 20) return;
        r.pending = {
          frames,
          sides: slotsRef.current.map((x) => x.side),
          letters: slotsRef.current.map((x) => x.name.slice(0, 1).toUpperCase()),
          actor: actorIndex,
          label: caption,
          id,
        };
      }, 600),
      window.setTimeout(() => {
        if (r.pending && r.pending.id === id) setReplay(r.pending);
      }, 2600),
    );
  }

  // Drible: finta para o lado do marcador e acelera por fora. Pode dar certo ou o marcador desarma.
  function dribbleSteps(h: Slot, opp: Slot, ambient: boolean, forceWin: boolean, forcedMove?: DribbleMove): Step[] {
    const st = engine.current;
    const all = slotsRef.current;
    const d = dirOf(h.side);
    let sg = opp.y >= h.y ? -1 : 1;
    if (h.y + sg * 40 < FY0 + 25 || h.y + sg * 40 > FY1 - 25) sg = -sg;
    // Escolha do drible conforme a situação (pressão, espaço livre, marcador, função, foco, personalidade e memória)
    const gap = dist(h, opp);
    const ahead: Point = { x: opp.x + d * 90, y: opp.y + sg * 30 };
    const ctx: DribbleCtx = {
      side: h.side,
      holder: { name: h.name, ovr: h.ovr, pos: h.pos, style: stylesRef.current?.[h.side]?.[h.pos] as Style | undefined },
      opp: { ovr: opp.ovr },
      pressure: clamp((95 - gap) / 60, 0, 1),
      gap,
      space: clamp(nearestOpp(all, h.side, ahead).d / 100, 0, 1),
      toGoal: Math.abs((d > 0 ? FX1 : FX0) - h.x),
      wide: Math.abs(h.y - MID_Y) > 85,
      sgIn: sg === (MID_Y - h.y >= 0 ? 1 : -1),
      // Caneta: o espaço atrás do marcador precisa estar livre de outros adversários
      behind: clamp(
        Math.min(99, ...all.filter((s) => s.side !== h.side && s.key !== opp.key).map((s) => dist(s, { x: opp.x + d * 55, y: opp.y }))) / 80,
        0,
        1,
      ),
      lane: all.some((m) => m.side === h.side && m.key !== h.key && m.pos !== 'GK' && (m.x - h.x) * d > 20 && dist(m, h) < 280 && nearestOpp(all, h.side, m).d > 45),
      canShoot: Math.abs((d > 0 ? FX1 : FX0) - h.x) < 260 && Math.abs(h.y - MID_Y) < 150,
    };
    const forcedId = forcedAnim();
    const testMove = forcedId && forcedId.startsWith('dri.') ? (forcedId.slice(4) as DribbleMove) : undefined;
    const move = forcedMove ?? testMove ?? chooseDribble(intelRef.current, ctx, Math.random, (m) => animOn(`dri.${m}`));
    countUse(`dri.${move}`);
    const pace = animSpeed(`dri.${move}`);
    const chance = clamp(0.58 + (h.ovr - opp.ovr) / 80 + moveFit(move, ctx) - fatigueOf(h.key) * 0.1 + fatigueOf(opp.key) * 0.06, 0.3, 0.88);
    const win = forceWin || Math.random() < chance;
    recordDribble(intelRef.current, h.side, move, win);
    const plan = dribbleGeometry(move, h, opp, sg, d);
    const steps: Step[] = [];
    (win ? plan : plan.slice(0, 1)).forEach((p, i) => {
      steps.push({
        kind: 'carry',
        to: { x: clamp(p.to.x, FX0 + 20, FX1 - 20), y: clamp(p.to.y, FY0 + 20, FY1 - 20) },
        dur: Math.round(p.dur / pace),
        ambient,
        dribble: true,
        speed: p.speed,
        feint: { phase: p.phase, opp: opp.key, sg: sg * (p.sg ?? 1), win, move },
        caption: i === 0 ? (win ? DRIBBLE_CAPTION[move].win(h.name, opp.name) : DRIBBLE_CAPTION[move].lose(h.name, opp.name)) : undefined,
        after:
          i === 0
            ? () => {
                const t = tnow();
                if (win) {
                  // O marcador "morde" a finta (vai para onde o drible mostrou) ou fica para trás, desequilibrado
                  const bite = plan[0].bite;
                  st.overrides[opp.key] = bite
                    ? { x: clamp(opp.x + bite.x, FX0 + 20, FX1 - 20), y: clamp(opp.y + bite.y, FY0 + 20, FY1 - 20), until: t + 750, speed: 1.3 }
                    : { x: opp.x, y: opp.y, until: t + 1000, speed: 0.18 };
                } else {
                  st.queue = [];
                  st.active = null;
                  st.holder = opp.key;
                  st.poss = opp.side;
                  st.overrides = {};
                  st.ambientAt = t + 450;
                  setCaption(`${opp.name} desarma ${h.name} no drible`);
                }
              }
            : undefined,
      });
    });
    return steps;
  }

  // Efeitos de disco: pose do jogador (recuo, avanço, amortecimento) e anel/clarão de impacto
  const POSE_ID: Record<PoseKind, string> = { wind: 'fx.shot', shot: 'fx.shot', pass: 'fx.pass', touch: 'fx.touch', save: 'fx.save' };
  function pose(key: string, kind: PoseKind, ang: number, pow: number) {
    if (!animOn(POSE_ID[kind])) return;
    if (kind !== 'wind') countUse(POSE_ID[kind]);
    poseRef.current[key] = { kind, t0: tnow(), ang, pow };
  }
  function ringAt(x: number, y: number, color: string, flash: boolean, r1 = 30, dur = 380, id = 'fx.shot') {
    if (liteRef.current || !animOn(id)) return;
    const rg = ringsRef.current[ringNext.current % ringsRef.current.length];
    ringNext.current += 1;
    Object.assign(rg, { on: true, born: tnow(), x, y, r0: flash ? 10 : 13, r1, dur, color, flash });
  }

  // Fadiga (0 a 1) de um jogador: vem do fôlego calculado no App (slow vai de 0 a 0,2). Cansado erra mais, reage mais devagar e perde disputas.
  function fatigueOf(key: string): number {
    if (!animOn('ia.fadiga')) return 0;
    return clamp((workRefLocal.current?.current.slow[key] ?? 0) / 0.2, 0, 1);
  }
  // Momento da partida: soma pressão (finalizações, recuperações, bolas ganhas) e posse com o campo ganho
  function pushMom(side: Side, v: number) {
    if (!animOn('ia.momento')) return;
    momAdd(momRef.current, side, v, tnow());
  }

  // Urgência da equipe pelo placar e tempo (gradual) e cautela por passes interceptados; recalculada no máximo a cada segundo
  function urgOf(side: Side, now: number): number {
    const c = urgRef.current[side];
    if (now - c.at < 1000) return c.u;
    const sit = sitRef.current;
    const ck = cautiousRef.current[side];
    const caut = Math.min(0.3, ck.n * 0.1 * Math.exp(-(now - ck.at) / 25000));
    const u = clamp(urgency(sit.minute, sit[side], sit[otherSide(side)], caut) + (animOn('ia.momento') ? momValue(momRef.current, side, now) * 0.15 : 0), -1, 1);
    if (Math.abs(u - c.u) > 0.25 && Math.abs(u) > 0.3) logDecision(side === 'user' ? club.abbreviation : opponent.abbreviation, u > 0 ? 'urgência' : 'cautela', `min ${sit.minute}, placar ${sit.user}x${sit.bot}: ${u > 0 ? 'precisa atacar' : 'protege o resultado'} (${u.toFixed(2)})`);
    c.u = u;
    c.at = now;
    return u;
  }

  // Segunda bola: a bola sobra solta (rebote, bloqueio, disputa) e quem chegar primeiro fica com ela
  function launchSB(x: number, y: number, vx: number, vy: number, from: Side | null, cap: string) {
    const st = engine.current;
    const all = slotsRef.current;
    const now = tnow();
    st.active = null;
    st.holder = null;
    if (!animOn('ia.segundabola')) {
      // Desligada no painel: o jogador mais perto da bola fica com ela na hora (sem disputa)
      const bp = { x, y };
      const w = all.filter((a) => a.pos !== 'GK').sort((a, b) => dist(a, bp) - dist(b, bp))[0];
      if (w) {
        st.holder = w.key;
        st.poss = w.side;
      }
      return;
    }
    st.ballX = clamp(x, FX0 + 8, FX1 - 8);
    st.ballY = clamp(y, FY0 + 8, FY1 - 8);
    const runs = secondBallRuns(
      { x: st.ballX, y: st.ballY, vx, vy },
      all.map((s) => ({ key: s.key, x: s.x, y: s.y, maxSpeed: s.maxSpeed, ovr: s.ovr, side: s.side, gk: s.pos === 'GK' })),
      { x0: FX0 + 10, x1: FX1 - 10, y0: FY0 + 10, y1: FY1 - 10 },
      (k) => workRefLocal.current?.current.slow[k] ?? 0,
    );
    st.overrides = {};
    runs.slice(0, 5).forEach((r, i) => {
      if (r.eta < 9 || i < 2) st.overrides[r.key] = { x: r.ix, y: r.iy, until: now + 2300, speed: 1.55 };
    });
    sbRef.current = { vx, vy, t0: now, until: now + 2600, from, cap, runs };
    st.ambientAt = now + 2700;
    if (cap) setCaption(cap);
    countUse('ia.segundabola');
    const top = runs.slice(0, 3).map((r) => `${find(r.key)?.name ?? r.key} ${r.eta < 9 ? r.eta.toFixed(2) + 's' : '—'}`).join(', ');
    logDecision('bola solta', 'segunda bola', `${cap || 'sobra'} → chegam: ${top}`);
  }

  // Contato com a bola: escolhe como o jogador domina (amortece, orienta, de primeira, erra...) e aplica a consequência no jogo
  function contactOn(rc: Slot, step: Step, ang: number, now: number) {
    const st = engine.current;
    if (liteRef.current || st.kickoff) return;
    const all = slotsRef.current;
    const d = dirOf(rc.side);
    const near = nearestOpp(all, rc.side, rc);
    const toGoal = Math.abs((d > 0 ? FX1 : FX0) - rc.x);
    // Lado com mais espaço, em relação à direção da bola (positivo = à direita de quem olha na direção da bola)
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const free = (sg: number) => {
      const px = rc.x + nx * sg * 50;
      const py = rc.y + ny * sg * 50;
      if (px < FX0 + 14 || px > FX1 - 14 || py < FY0 + 14 || py > FY1 - 14) return -1;
      return nearestOpp(all, rc.side, { x: px, y: py }).d;
    };
    const fa = free(1);
    const fb = free(-1);
    const spaceSide = fa >= fb ? 1 : -1;
    const mates = all.filter((x) => x.side === rc.side && x.key !== rc.key && x.pos !== 'GK');
    const plan = chooseContact(
      {
        dur: step.dur,
        arc: step.arc ?? 0,
        ambient: !!step.ambient && !step.scripted,
        ovr: rc.ovr,
        oppD: near.d,
        spaceSide,
        spaceOpen: Math.max(fa, fb) > 62,
        canShoot: FORWARDS.includes(rc.pos) && toGoal < 240 && near.d > 26,
        mateAhead: mates.some((x) => (x.x - rc.x) * d > 40 && nearestOpp(all, rc.side, x).d > 55),
        tired: fatigueOf(rc.key),
      },
      Math.random,
      (k) => animOn(CONTACT_ID[k]),
    );
    if (plan.kind === 'dominio') {
      st.ambientAt = Math.max(st.ambientAt, now + 60);
      return;
    }
    countUse(CONTACT_ID[plan.kind]);
    ctlRef.current[rc.key] = { t0: tnow(), plan, ang, side: spaceSide };
    // A decisão seguinte só vem depois do controle (primeira = quase na hora)
    st.ambientAt = now + plan.hold;
    const sp = animSpeed(CONTACT_ID[plan.kind]);
    if (plan.kind === 'orientado') {
      // O toque leva a bola e o disco para o espaço livre
      st.overrides[rc.key] = { x: clamp(rc.x + nx * spaceSide * 48 + Math.cos(ang) * 14, FX0 + 24, FX1 - 24), y: clamp(rc.y + ny * spaceSide * 48 + Math.sin(ang) * 14, FY0 + 24, FY1 - 24), until: now + 420, speed: 1.2 * sp };
      ringAt(rc.x, rc.y, 'rgba(160,230,255,.85)', false, 26, 320, CONTACT_ID.orientado);
      setCaption(`${rc.name} domina orientado para o espaço`);
    } else if (plan.kind === 'amortecimento') {
      ringAt(rc.x, rc.y, 'rgba(255,255,255,.7)', false, 30, 420, CONTACT_ID.amortecimento);
    } else if (plan.kind === 'primeira') {
      ringAt(rc.x, rc.y, 'rgba(255,240,170,.9)', true, 22, 220, CONTACT_ID.primeira);
      setCaption(`${rc.name} de primeira`);
    } else if (plan.kind === 'aereo') {
      ringAt(rc.x, rc.y, 'rgba(255,255,255,.55)', false, 34, 480, CONTACT_ID.aereo);
      setCaption(`${rc.name} domina a bola que vinha do alto`);
    } else if (plan.kind === 'protecao') {
      shieldRef.current[rc.key] = now + 900;
      ringAt(rc.x, rc.y, 'rgba(255,200,120,.8)', false, 28, 380, CONTACT_ID.protecao);
    } else if (plan.kind === 'erro') {
      // A bola escapa para frente e para o lado; o jogador corre atrás. Se um adversário chegar antes, rouba.
      const sgn = plan.lat < 0 ? -1 : 1;
      const v = 150 + 60 * Math.random();
      looseRef.current = { key: rc.key, vx: Math.cos(ang) * v + nx * sgn * 70, vy: Math.sin(ang) * v + ny * sgn * 70, until: now + 1100 };
      setCaption(`${rc.name} perde o tempo da bola no domínio`);
    }
  }

  // Começa um passo da fila (passe, condução, chute ou recuperação)
  function startStep(step: Step, now: number) {
    const st = engine.current;
    sbRef.current = null;
    const all = slotsRef.current;
    const holder = st.holder ? find(st.holder) : undefined;

    // Chute: o disco se prepara (recua e comprime) antes de a bola sair
    if (step.kind === 'shot' && holder && !step.prepped && holder.pos !== 'GK' && !liteRef.current && animOn('fx.shot')) {
      const aim = 'slot' in step.to ? find(step.to.slot) : (step.to as Point);
      const ang = aim ? Math.atan2(aim.y - holder.y, aim.x - holder.x) : 0;
      const pow = clamp(560 / step.dur, 0.6, 1.4);
      pose(holder.key, 'wind', ang, pow);
      st.queue.unshift({ ...step, prepped: true });
      st.active = { step: { kind: 'wait', to: { x: holder.x, y: holder.y }, dur: 150, scripted: step.scripted, critical: step.critical }, from: { x: st.ballX, y: st.ballY }, start: now, dest: null };
      return;
    }

    // Movimentos combinados com o passo (corridas, mergulho do goleiro...)
    step.setup?.forEach((m) => {
      st.overrides[m.key] = { x: m.x, y: m.y, until: now + step.dur + 250, speed: m.speed ?? 1.1 };
    });

    if (step.kind === 'wait') {
      // Pausa curta: a bola fica parada (ou com quem a tem) enquanto os jogadores se posicionam
      st.active = { step, from: { x: st.ballX, y: st.ballY }, start: now, dest: null };
      if (step.caption) setCaption(step.caption);
      return;
    }

    if (step.kind === 'carry') {
      if (!holder) return;
      const to = step.to as Point;
      st.active = { step, from: { x: st.ballX, y: st.ballY }, start: now, dest: null };
      st.overrides[holder.key] = {
        x: to.x,
        y: to.y,
        until: now + step.dur + 120,
        speed: step.speed ?? (step.dribble ? 1.3 : step.arrive ? 1.25 : 0.9),
      };
      if (step.caption) setCaption(step.caption);
      dribFx.current = step.feint ? { key: holder.key, opp: step.feint.opp, t0: now, dur: step.dur, sg: step.feint.sg, win: step.feint.win, phase: step.feint.phase, dx: dirOf(holder.side), move: step.feint.move ?? 'finta' } : null;
      return;
    }

    let dest: string | null = 'slot' in step.to ? step.to.slot : null;
    const recv = dest ? find(dest) : undefined;
    let lead: Point | undefined;
    let caption = step.caption;

    if (step.kind === 'pass' && recv) {
      if (holder && holder.key === recv.key) return; // já está com a bola
      const t = (step.dur / 1000) * 0.9;
      lead = {
        x: clamp(recv.x + recv.vx * t, FX0 + 10, FX1 - 10),
        y: clamp(recv.y + recv.vy * t, FY0 + 10, FY1 - 10),
      };
      st.overrides[recv.key] = { x: lead.x, y: lead.y, until: now + step.dur + 300, speed: 1.15 };
      if (!caption && holder) caption = `Passe de ${holder.name} para ${recv.name}`;
      // Erro de passe: pressão, distância, força, overall e cansaço fazem a bola sair com direção errada (nunca nos lances do plano)
      if (step.ambient && !step.scripted && holder && animOn('ia.passeerrado')) {
        const nearH = nearestOpp(all, holder.side, holder);
        const dd = dist(holder, lead);
        const f = fatigueOf(holder.key);
        const pr = clamp(0.012 + clamp((70 - nearH.d) / 70, 0, 1) * 0.09 + (dd > 230 ? 0.04 : 0) + (step.dur < 420 ? 0.03 : 0) + (76 - holder.ovr) * 0.0025 + f * 0.08, 0.01, 0.28);
        if (Math.random() < pr) {
          const ang0 = Math.atan2(lead.y - holder.y, lead.x - holder.x);
          const off = Math.tan((Math.random() < 0.5 ? -1 : 1) * rand(0.12, 0.42)) * dd;
          lead = { x: clamp(lead.x - Math.sin(ang0) * off, FX0 + 10, FX1 - 10), y: clamp(lead.y + Math.cos(ang0) * off, FY0 + 10, FY1 - 10) };
          st.overrides[recv.key] = { x: lead.x, y: lead.y, until: now + step.dur + 300, speed: 1.3 };
          countUse('ia.passeerrado');
          logDecision(holder.name, 'passe errado', `${(pr * 100).toFixed(0)}% de risco (pressão ${nearH.d.toFixed(0)} px, fadiga ${(f * 100).toFixed(0)}%), desvio ${Math.abs(off).toFixed(0)} px`);
          if (Math.abs(off) > 38) {
            const origAfter = step.after;
            const lx = lead.x;
            const ly = lead.y;
            const hs = holder.side;
            const hn = holder.name;
            step = { ...step, after: () => { origAfter?.(); launchSB(lx, ly, Math.cos(ang0) * 70, Math.sin(ang0) * 70, hs, `${hn} passa mal e a bola fica sem dono`); } };
            dest = null;
            caption = `${hn} erra o passe`;
          } else {
            caption = `${recv.name} se estica para alcançar o passe de ${holder.name}`;
          }
        }
      }
      // Passes de rotina podem ser interceptados por quem fecha a linha de passe (perto do trajeto, não só do destino)
      if (dest && step.ambient && !step.scripted && holder) {
        let best: { slot: Slot; p: number; x: number; y: number; t: number } | null = null;
        for (const o of all) {
          if (o.side === recv.side || o.pos === 'GK') continue;
          const sg = segPoint(o.x, o.y, holder.x, holder.y, lead.x, lead.y);
          const p = laneCut(sg.d, sg.t, step.dur, o.ovr);
          if (p > 0 && (!best || p > best.p)) best = { slot: o, p, x: sg.x, y: sg.y, t: sg.t };
        }
        if (best && Math.random() < best.p) {
          dest = best.slot.key;
          lead = { x: best.x, y: best.y };
          step = { ...step, dur: Math.max(200, step.dur * best.t), arc: 0 };
          st.overrides[best.slot.key] = { x: best.x, y: best.y, until: now + step.dur + 300, speed: 1.4 };
          delete st.overrides[recv.key];
          caption = `${best.slot.name} fecha a linha de passe e intercepta${holder ? ` o passe de ${holder.name}` : ''}`;
          countUse('def.linha');
          pushMom(best.slot.side, 1);
          const ck = cautiousRef.current[recv.side];
          ck.n = ck.n * Math.exp(-(now - ck.at) / 25000) + 1;
          ck.at = now;
          logDecision(best.slot.name, 'interceptação', `fechou a linha de passe de ${holder.name} (chance ${(best.p * 100).toFixed(0)}%)`);
        }
      }
    } else if (!caption && recv) {
      caption = `${recv.name} recupera a bola`;
    }

    // Mapa da partida: conta o passe (só entre companheiros e quando não foi interceptado)
    if (step.kind === 'pass' && recv && holder && holder.side === recv.side && holder.key !== recv.key && dest === recv.key && mapRefRef.current) {
      mapRefRef.current.current ??= createMatchMap();
      recordMapPass(mapRefRef.current.current, holder.key, recv.key);
    }
    if (caption) setCaption(caption);
    // Contato com a bola: impulso do disco e clarão/anel conforme a força
    if (holder && (step.kind === 'pass' || step.kind === 'shot')) {
      const tgt = lead ?? ('slot' in step.to ? find(step.to.slot) : (step.to as Point));
      if (tgt) {
        const ang = Math.atan2(tgt.y - holder.y, tgt.x - holder.x);
        const pow = clamp(560 / step.dur, 0.5, 1.4);
        pose(holder.key, step.kind, ang, pow);
        if (step.kind === 'shot') ringAt(holder.x + Math.cos(ang) * 12, holder.y + Math.sin(ang) * 12, '#fff3b0', true, 22 + 10 * pow, 260);
        else if (step.dur < 520) ringAt(holder.x, holder.y, 'rgba(255,255,255,.8)', false, 24, 300, 'fx.pass');
      }
    }
    st.active = { step, from: { x: st.ballX, y: st.ballY }, start: now, lead, dest };
    st.holder = null;
  }

  // Transforma o lance gerado pela simulação em uma jogada. Cada lance sorteia um estilo de jogada
  // (pelo meio, pela ponta com cruzamento, lançamento, tabela, drible, contra-ataque ou chute de longe)
  // e o desfecho segue o que a narração diz (gol de canto, cavadinha, trave, por cima, escanteio...).
  function scheduleEvent(ev: PitchEvent) {
    const st = engine.current;
    const S = ev.team;
    const O = otherSide(S);
    const dir = dirOf(S);
    const goalX = dir > 0 ? FX1 : FX0;
    const critical = ev.type === 'gol';
    const scriptedBusy = st.queue.some((s) => s.scripted) || !!(st.active && st.active.step.scripted);
    if (ev.type !== 'posse') pushMom(S, ev.type === 'gol' ? 5 : ev.type === 'finalização' ? 2.4 : 1.8);

    // Lance de posse não interrompe uma jogada que já está acontecendo
    if (ev.type === 'posse' && scriptedBusy) return;
    st.queue = st.queue.filter((s) => s.scripted);
    // Um gol passa na frente: lances sem gol que ainda esperavam na fila (defesa, chute para fora) são descartados,
    // senão o gol demora para aparecer e o tempo pode acabar antes da bola entrar
    if (critical) st.queue = st.queue.filter((s) => s.critical);
    if (st.active && st.active.step.ambient) st.active = null;
    if (st.queue.filter((s) => !s.critical).length > 8) st.queue = st.queue.filter((s) => s.critical);

    const mk = (s: Step): Step => ({ ...s, scripted: true, critical });
    const holderSide = st.holder ? sideOf(st.holder) : null;
    const heldBy = st.holder ? find(st.holder) : undefined;
    // Troca de posse com motivo: o jogador mais próximo do time que vai atacar vai na bola e desarma (em vez de a bola ser entregue)
    const turnover = (toKey: string): Step[] => {
      const victim = heldBy;
      const thief = victim
        ? slotsRef.current
            .filter((s) => s.side === S && s.pos !== 'GK')
            .sort((a, b) => dist(a, victim) - dist(b, victim))[0]
        : undefined;
      if (!victim && st.active) {
        // A bola está no ar (passe do outro time): o jogador mais perto dela intercepta
        const ball: Point = { x: st.ballX, y: st.ballY };
        const catcher = slotsRef.current
          .filter((s) => s.side === S && s.pos !== 'GK')
          .sort((a, b) => dist(a, ball) - dist(b, ball))[0];
        if (catcher) {
          const steps: Step[] = [
            mk({
              kind: 'move',
              to: { slot: catcher.key },
              dur: clamp((dist(catcher, ball) / (catcher.maxSpeed * 2)) * 1000, 420, 1100),
              caption: `${catcher.name} intercepta o passe`,
              setup: [{ key: catcher.key, x: ball.x, y: ball.y, speed: 2 }],
            }),
          ];
          if (catcher.key !== toKey) steps.push(mk({ kind: 'pass', to: { slot: toKey }, dur: 480 }));
          return steps;
        }
      }
      if (!victim || !thief || victim.side === S || victim.pos === 'GK') return [mk({ kind: 'move', to: { slot: toKey }, dur: 520 })];
      const dur = clamp((dist(thief, victim) / (thief.maxSpeed * 2.4)) * 1000, 380, 1500);
      const steps: Step[] = [
        mk({
          kind: 'wait',
          to: { x: victim.x, y: victim.y },
          dur,
          caption: `${thief.name} desarma ${victim.name}`,
          setup: [{ key: thief.key, x: victim.x, y: victim.y, speed: 2.4 }],
          after: () => {
            st.holder = thief.key;
            st.poss = S;
          },
        }),
      ];
      if (thief.key !== toKey) steps.push(mk({ kind: 'pass', to: { slot: toKey }, dur: 480 }));
      return steps;
    };
    if (ev.type === 'posse') {
      if (holderSide !== S) st.queue.push(...turnover(`${S}-CM`));
      st.runAt = 0; // o time que ficou com a bola começa a se movimentar já
      return;
    }

    const text = ev.text.toLowerCase();
    const all = slotsRef.current;
    // Bola parada: escanteio cobrado e gol olímpico (a narração diz qual)
    type SetPiece = 'escanteio' | 'olimpico';
    const special: SetPiece | null = text.includes('olímpico')
      ? 'olimpico'
      : text.includes('escanteio cobrado')
        ? 'escanteio'
        : null;
    const mine = all.filter((s) => s.side === S && s.pos !== 'GK');

    // Quem finaliza: o nome que veio com o lance ou, na falta dele, o primeiro nome que aparece no texto
    let actor: Slot | undefined = ev.actor ? mine.find((s) => s.name === ev.actor) : undefined;
    if (!actor) {
      let bestIdx = Infinity;
      for (const s of mine) {
        const idx = ev.text.indexOf(s.name);
        if (idx >= 0 && (idx < bestIdx || (idx === bestIdx && s.name.length > (actor ? actor.name.length : 0)))) {
          bestIdx = idx;
          actor = s;
        }
      }
    }
    const actorSlot: Slot = actor ?? (find(`${S}-${pick(FORWARDS)}`) as Slot);
    const actorKey = actorSlot.key;
    const actorName = actorSlot.name;
    const passer = ev.assist ? mine.find((s) => s.name === ev.assist && s.key !== actorKey) : undefined;
    const isWing = (s: Slot) => s.pos === 'LF' || s.pos === 'RF' || s.pos === 'LB' || s.pos === 'RB';
    const wings = mine.filter((s) => s.key !== actorKey && isWing(s));
    const backlog = st.queue.length + (st.active && st.active.step.scripted ? 1 : 0);

    // Estilo da jogada: a narração manda quando cita o tipo de finalização; senão, sorteio ponderado
    type Play = PlayKind;
    const intel = intelRef.current;
    const teamStyles = stylesRef.current?.[S] as Partial<Record<string, Style>> | undefined;
    // Partner / apoio (usados também para saber quais jogadas têm gente suficiente)
    const cmSlot = find(`${S}-CM`);
    const sideOfSlot = (s: Slot) => (s.base.y < MID_Y ? 0 : 1);
    const overlapPair = (() => {
      const cutters = mine.filter((s) => (s.pos === 'LF' || s.pos === 'RF') && s.key !== passer?.key);
      for (const c of cutters.sort(() => Math.random() - 0.5)) {
        const over = mine.find((s) => (s.pos === 'LB' || s.pos === 'RB') && sideOfSlot(s) === sideOfSlot(c) && s.key !== actorKey);
        if (over) return { cutter: c, over };
      }
      return undefined;
    })();
    const triThird = mine.find((s) => s.key !== actorKey && s.pos !== 'CM' && (FORWARDS.includes(s.pos) || isWing(s)));
    const swapMate = mine.filter((s) => s.key !== actorKey && FORWARDS.includes(s.pos)).sort((x, y) => Math.abs(y.base.y - actorSlot.base.y) - Math.abs(x.base.y - actorSlot.base.y))[0];
    const restartBack = mine.find((s) => (s.pos === 'LB' || s.pos === 'RB') && s.key !== actorKey);
    const partner =
      actorSlot.pos === 'CM'
        ? mine.find((s) => s.key !== actorKey && FORWARDS.includes(s.pos))
        : find(`${S}-CM`);
    let play: Play;
    if (backlog > 4 && !critical) play = 'longe'; // jogada curta para não acumular fila
    else if (text.includes('cabece') || text.includes('voleio') || text.includes('bicicleta')) play = 'ponta';
    else if (text.includes('fora da área') || text.includes('de longe') || text.includes('arrisca')) play = 'longe';
    else if (text.includes('contra-ataque')) play = 'contra';
    else if (text.includes('cavadinha') || text.includes('chapéu')) play = 'solo';
    else {
      // Leitura do adversário: quantos defensores no meio, quantos abertos, altura da linha e pressão sobre a bola
      const defenders = all.filter((s) => s.side === O && s.pos !== 'GK' && Math.abs(s.x - goalX) < 300);
      const refPt: Point = heldBy ?? { x: st.ballX, y: st.ballY };
      const backsX = all.filter((s) => s.side === O && (s.pos === 'LB' || s.pos === 'RB')).map((s) => Math.abs(s.x - goalX));
      const backsAvg = backsX.length ? backsX.reduce((n, v) => n + v, 0) / backsX.length : 150;
      const style = teamStyles?.[actorSlot.pos];
      play = choosePlay(intel, {
        side: S,
        evType: ev.type,
        actor: { pos: actorSlot.pos, name: actorName, ovr: actorSlot.ovr, style },
        team: teamStyles,
        can: {
          ponta: wings.length > 0,
          tabela: !!partner && partner.key !== actorKey,
          ultrapassagem: !!overlapPair && !!cmSlot,
          triangulo: !!cmSlot && actorSlot.pos !== 'CM' && !!triThird,
          troca: !!swapMate,
          recomeco: !!restartBack && !!cmSlot,
          infiltracao: actorSlot.pos !== 'GK',
        },
        opp: {
          central: defenders.filter((s) => Math.abs(s.y - MID_Y) < 75).length,
          wide: defenders.filter((s) => Math.abs(s.y - MID_Y) >= 110).length,
          line: clamp((backsAvg / 700 - 0.15) / 0.4, 0, 1),
          pressure: clamp((95 - nearestOpp(all, S, refPt).d) / 60, 0, 1),
        },
      });
    }
    if (play === 'ponta' && !wings.length) play = 'central';
    if (play === 'tabela' && (!partner || partner.key === actorKey)) play = 'central';
    if (!special) recordPlay(intel, S, play, actorName, ev.type);

    const near = (d: number): Point => ({ x: goalX - dir * d, y: MID_Y + rand(-55, 55) });
    const run = (key: string, p: Point, speed = 1.4): Setup => ({ key, x: p.x, y: p.y, speed });
    const waitStep = (dur: number, setup?: Setup[], caption?: string): Step =>
      mk({ kind: 'wait', to: { x: MID_X, y: MID_Y }, dur, setup, caption });
    const q: Step[] = [];

    // Quem inicia a jogada
    const backs = mine.filter((s) => s.pos === 'LB' || s.pos === 'RB');
    const starter: Slot | undefined =
      play === 'contra'
        ? pick(backs.length ? backs : mine)
        : play === 'lancamento'
          ? Math.random() < 0.3
            ? find(`${S}-GK`)
            : pick(backs.length ? backs : mine)
          : find(`${S}-CM`);
    const starterKey = starter?.key ?? `${S}-CM`;
    // Quem já está com a bola perto do gol (ou o time já está no ataque) não volta para o meio para começar a jogada
    const advanced = !special && !!heldBy && heldBy.side === S && heldBy.pos !== 'GK' && Math.abs(goalX - heldBy.x) < 270;
    if (!special && !advanced) {
      if (holderSide !== S) q.push(...turnover(starterKey));
      else if (starterKey !== st.holder && starterKey !== `${S}-CM`) q.push(mk({ kind: 'pass', to: { slot: starterKey }, dur: 480 }));
    }

    // Condução até um ponto; às vezes o atacante ainda dribla um marcador antes de finalizar
    const carryTo = (at: Point, dur: number, speed: number | undefined, dribble: boolean) => {
      const marker = dribble ? find(`${O}-${pick<Pos>(['LB', 'RB', 'CM'])}`) : undefined;
      const sg = at.y >= MID_Y ? -1 : 1;
      q.push(
        mk({
          kind: 'carry',
          to: at,
          dur,
          arrive: true,
          speed,
          // O marcador sai para encontrar o atacante na hora do drible
          setup: marker ? [{ key: marker.key, x: at.x + dir * 34, y: at.y - sg * 4, speed: 1 }] : undefined,
        }),
      );
      if (!marker) return;
      const ghost = { ...marker, x: at.x + dir * 34, y: at.y - sg * 4 } as Slot;
      const hero = { ...actorSlot, x: at.x, y: at.y } as Slot;
      dribbleSteps(hero, ghost, false, true).forEach((step, i) => {
        const base = mk(step);
        base.after =
          i === 0
            ? () => {
                st.overrides[marker.key] = { x: marker.x, y: marker.y, until: tnow() + 1000, speed: 0.18 };
              }
            : undefined;
        q.push(base);
      });
    };
    const canDribble = ev.type !== 'defesa';

    if (advanced && heldBy) {
      // Finaliza com o que já tem: toca para o finalizador (se não for ele) e só avança se ainda estiver longe
      if (heldBy.key !== actorKey) {
        q.push(
          mk({
            kind: 'pass',
            to: { slot: actorKey },
            dur: 520,
            caption: passer && heldBy.key === passer.key ? `Passe de ${passer.name} para ${actorName}` : undefined,
          }),
        );
      }
      const gap = Math.abs(goalX - (heldBy.key === actorKey ? heldBy.x : actorSlot.x));
      if (gap > 130) carryTo(near(rand(85, 115)), 1900, 1.3, canDribble && Math.random() < 0.35);
    } else if (special) {
      // A bola parada é montada mais abaixo, junto do desfecho
    } else if (play === 'central') {
      const via = passer ?? find(`${S}-CM`);
      if (via && via.key !== actorKey && via.key !== starterKey && (passer || Math.random() < 0.55)) {
        q.push(mk({ kind: 'pass', to: { slot: via.key }, dur: 520 }));
      }
      q.push(
        mk({
          kind: 'pass',
          to: { slot: actorKey },
          dur: 560,
          caption: passer && via?.key === passer.key ? `Passe de ${passer.name} para ${actorName}` : undefined,
        }),
      );
      carryTo(near(rand(105, 135)), 4200, undefined, canDribble && Math.random() < 0.65);
    } else if (play === 'ponta') {
      const crosser = passer && isWing(passer) ? passer : pick(wings);
      q.push(mk({ kind: 'pass', to: { slot: crosser.key }, dur: 560 }));
      const byline: Point = { x: goalX - dir * rand(60, 90), y: crosser.base.y < MID_Y ? FY0 + 42 : FY1 - 42 };
      q.push(mk({ kind: 'carry', to: byline, dur: 3800, arrive: true, caption: `${crosser.name} avança pela ponta` }));
      q.push(waitStep(420, [run(actorKey, { x: goalX - dir * rand(70, 95), y: MID_Y + rand(-18, 18) }, 1.5)]));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 720, arc: 16, caption: `${crosser.name} cruza para ${actorName}` }));
    } else if (play === 'lancamento') {
      const from = starter ?? actorSlot;
      q.push(waitStep(450, [run(actorKey, { x: goalX - dir * rand(150, 190), y: MID_Y + rand(-70, 70) }, 1.5)]));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 900, arc: 18, caption: `Lançamento de ${from.name} para ${actorName}` }));
      carryTo(near(rand(70, 100)), 3200, 1.4, canDribble && Math.random() < 0.5);
    } else if (play === 'tabela' && partner) {
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 520 }));
      q.push(mk({ kind: 'pass', to: { slot: partner.key }, dur: 380, caption: `${actorName} toca para ${partner.name}` }));
      q.push(waitStep(300, [run(actorKey, { x: goalX - dir * rand(130, 170), y: MID_Y + rand(-55, 55) }, 1.6)]));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 460, caption: `Tabela! ${partner.name} devolve para ${actorName}` }));
      carryTo(near(rand(80, 105)), 3200, 1.3, false);
    } else if (play === 'ultrapassagem' && overlapPair) {
      // O ponta traz a bola para dentro, o lateral do mesmo lado ultrapassa por fora e cruza
      const { cutter, over } = overlapPair;
      const edgeY = cutter.base.y < MID_Y ? FY0 + 42 : FY1 - 42;
      q.push(mk({ kind: 'pass', to: { slot: cutter.key }, dur: 560 }));
      q.push(mk({ kind: 'carry', to: { x: goalX - dir * rand(170, 200), y: edgeY + (edgeY < MID_Y ? 1 : -1) * rand(60, 90) }, dur: 1800, arrive: true, caption: `${cutter.name} puxa para dentro` }));
      q.push(waitStep(380, [run(over.key, { x: goalX - dir * rand(95, 120), y: edgeY }, 1.8)], `${over.name} ultrapassa ${cutter.name}`));
      q.push(mk({ kind: 'pass', to: { slot: over.key }, dur: 460 }));
      q.push(mk({ kind: 'carry', to: { x: goalX - dir * rand(60, 85), y: edgeY }, dur: 1500, arrive: true }));
      q.push(waitStep(380, [run(actorKey, { x: goalX - dir * rand(70, 95), y: MID_Y + rand(-18, 18) }, 1.5)]));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 700, arc: 16, caption: `${over.name} cruza para ${actorName}` }));
    } else if (play === 'triangulo' && cmSlot && triThird) {
      // Triangulação entre o meio, um companheiro e o finalizador, que aparece livre
      q.push(mk({ kind: 'pass', to: { slot: triThird.key }, dur: 420, caption: `Triangulação: ${cmSlot.name} toca para ${triThird.name}` }));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 400 }));
      q.push(mk({ kind: 'pass', to: { slot: cmSlot.key }, dur: 380 }));
      q.push(waitStep(300, [run(actorKey, { x: goalX - dir * rand(120, 160), y: MID_Y + rand(-60, 60) }, 1.7)]));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 520, arc: 6, caption: `${cmSlot.name} acha ${actorName} na saída da triangulação` }));
      carryTo(near(rand(80, 105)), 2800, 1.3, false);
    } else if (play === 'infiltracao') {
      // O finalizador se infiltra entre os zagueiros e recebe em profundidade
      q.push(waitStep(420, [run(actorKey, { x: goalX - dir * rand(110, 140), y: MID_Y + rand(-60, 60) }, 1.9)], `${actorName} se infiltra entre os zagueiros`));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 760, arc: 8, caption: `${starter?.name ?? 'O meio'} acha ${actorName} em profundidade` }));
      carryTo(near(rand(75, 100)), 2600, 1.5, canDribble && Math.random() < 0.3);
    } else if (play === 'recomeco' && restartBack && cmSlot) {
      // Sem espaço à frente: recua, reorganiza e reconstrói a jogada por outro caminho
      q.push(mk({ kind: 'pass', to: { slot: restartBack.key }, dur: 480, caption: `${cmSlot.name} recua para ${restartBack.name} e reorganiza a jogada` }));
      if (cmSlot.key !== actorKey) q.push(mk({ kind: 'pass', to: { slot: cmSlot.key }, dur: 460 }));
      q.push(waitStep(300, [run(actorKey, { x: goalX - dir * rand(150, 190), y: MID_Y + rand(-70, 70) }, 1.5)], 'Nova construção'));
      if (cmSlot.key !== actorKey) q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 600 }));
      carryTo(near(rand(100, 130)), 3200, undefined, canDribble && Math.random() < 0.5);
    } else if (play === 'troca' && swapMate) {
      // Troca de posição momentânea: os dois atacantes cruzam e confundem a marcação
      q.push(waitStep(480, [run(actorKey, { x: swapMate.x, y: swapMate.y }, 1.4), run(swapMate.key, { x: actorSlot.x, y: actorSlot.y }, 1.4)], `${actorName} e ${swapMate.name} trocam de posição`));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 600 }));
      carryTo(near(rand(95, 125)), 3200, undefined, canDribble && Math.random() < 0.5);
    } else if (play === 'solo') {
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 560 }));
      carryTo(near(rand(150, 190)), 3600, undefined, ev.type !== 'defesa' || Math.random() < 0.5);
      if (Math.random() < 0.4) carryTo(near(rand(95, 120)), 2600, undefined, true);
    } else if (play === 'contra') {
      q.push(waitStep(300, [run(actorKey, { x: goalX - dir * rand(200, 250), y: MID_Y + rand(-80, 80) }, 1.7)], 'Contra-ataque!'));
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 820, arc: 16, caption: `${starter?.name ?? 'A defesa'} lança o contra-ataque` }));
      carryTo(near(rand(85, 115)), 3000, 1.8, false);
    } else {
      // Chute de longe
      q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 560 }));
      q.push(mk({ kind: 'carry', to: near(rand(190, 230)), dur: 2600, arrive: true }));
    }

    // Desfecho do lance
    const gkKey = `${O}-GK`;
    const gk = find(gkKey);
    const gkX = gk ? gk.x : goalX - dir * 24;
    const header = play === 'ponta' || special === 'escanteio';
    const abbrOf = S === 'user' ? club.abbreviation : opponent.abbreviation;
    const tiroDeMeta = (): void => {
      st.queue.unshift({ kind: 'move', to: { slot: gkKey }, dur: 800, caption: 'Tiro de meta', scripted: true });
    };
    const defenderKey = () => `${O}-${pick<Pos>(['LB', 'RB', 'CM'])}`;

    // Cobrança de escanteio com variações (na área, toque curto, primeira trave). A escolha foge do que já foi usado e o adversário
    // só se prepara para uma variação que já viu duas vezes. O desfecho do lance continua sendo o do plano.
    const cornerDeliver = (taker: Slot, targetSlot: Slot, corner: Point, cy: number, setup: Setup[], wrap: (st: Step) => Step): { steps: Step[]; kind: CornerKind } => {
      const mem = cornerMem.current[S];
      const kind = chooseCorner(mem, Math.random, (k) => animOn(`ia.escanteio.${k}`));
      const seen = cornerRead(mem, kind);
      mem[kind] += 1;
      countUse(`ia.escanteio.${kind}`);
      const defenders = all.filter((x) => x.side === O && x.pos !== 'GK').sort((a, b) => dist(a, corner) - dist(b, corner));
      const put = (key: string, p: Point) => setup.push({ key, x: p.x, y: p.y, speed: 1.9 });
      const abbr = S === 'user' ? club.abbreviation : opponent.abbreviation;
      let steps: Step[];
      if (kind === 'curto') {
        const mate = mine.find((x) => x.key !== taker.key && x.key !== targetSlot.key && x.pos !== 'GK');
        if (!mate) {
          steps = [wrap({ kind: 'pass', to: { slot: targetSlot.key }, dur: 760, arc: 18, caption: `${taker.name} cobra o escanteio` })];
        } else {
          const sp: Point = { x: corner.x - dir * 50, y: cy < MID_Y ? cy + 46 : cy - 46 };
          put(mate.key, sp);
          if (seen && defenders[0]) put(defenders[0].key, { x: sp.x + dir * 22, y: sp.y + (cy < MID_Y ? -10 : 10) });
          steps = [
            wrap({ kind: 'pass', to: { slot: mate.key }, dur: 400, caption: `Escanteio curto: ${taker.name} toca para ${mate.name}${seen && defenders[0] ? `, mas ${defenders[0].name} já espera o toque curto` : ''}` }),
            wrap({ kind: 'wait', to: { x: sp.x, y: sp.y }, dur: 260 }),
            wrap({ kind: 'pass', to: { slot: targetSlot.key }, dur: 660, arc: 16, caption: `${mate.name} levanta na área` }),
          ];
        }
      } else if (kind === 'primeira') {
        const p1: Point = { x: goalX - dir * 34, y: MID_Y + (cy < MID_Y ? -26 : 26) };
        put(targetSlot.key, p1);
        if (seen && defenders[0]) put(defenders[0].key, { x: p1.x - dir * 6, y: p1.y + (cy < MID_Y ? 12 : -12) });
        steps = [wrap({ kind: 'pass', to: { slot: targetSlot.key }, dur: 600, arc: 12, caption: `${taker.name} cobra rasteiro na primeira trave${seen && defenders[0] ? `, onde ${defenders[0].name} já esperava` : ''}` })];
      } else {
        if (seen && defenders[0]) put(defenders[0].key, { x: goalX - dir * 62, y: MID_Y + (targetSlot.y > MID_Y ? 14 : -14) });
        steps = [wrap({ kind: 'pass', to: { slot: targetSlot.key }, dur: 760, arc: 18, caption: `${taker.name} cobra o escanteio${seen && defenders[0] ? ` e ${defenders[0].name} já marca o homem da área` : ''}` })];
      }
      logDecision(abbr, `escanteio: ${kind}`, `${taker.name} cobra${seen ? ' (adversário já viu essa variação)' : ''}`);
      return { steps, kind };
    };

    // Escanteio: o goleiro espalma para fora, o time cobra e a bola entra na área
    const cornerSteps = (quick = false): Step[] => {
      const cy = Math.random() < 0.5 ? FY0 + 6 : FY1 - 6;
      const corner: Point = { x: goalX - dir * 5, y: cy };
      const taker = mine.find((s) => s.key !== actorKey && (s.pos === 'LF' || s.pos === 'RF')) ?? mine.find((s) => s.key !== actorKey) ?? actorSlot;
      const target = mine.find((s) => s.pos === 'CF' && s.key !== taker.key) ?? actorSlot;
      const box = (d: number, dy: number): Point => ({ x: goalX - dir * d, y: MID_Y + dy });
      const setup: Setup[] = [{ key: taker.key, x: corner.x - dir * 8, y: cy < MID_Y ? cy + 6 : cy - 6, speed: 2 }];
      mine.forEach((s) => {
        if (s.key === taker.key) return;
        const p = s.key === target.key ? box(rand(55, 80), rand(-16, 16)) : box(rand(95, 135), rand(-48, 48));
        setup.push({ key: s.key, x: p.x, y: p.y, speed: 1.5 });
      });
      all.filter((s) => s.side === O && s.pos !== 'GK').forEach((s) => {
        const p = box(rand(40, 90), rand(-42, 42));
        setup.push({ key: s.key, x: p.x, y: p.y, speed: 1.5 });
      });
      const abbr = S === 'user' ? club.abbreviation : opponent.abbreviation;
      const dl = cornerDeliver(taker, target, corner, cy, setup, (x) => ({ ...x, scripted: true }));
      return [
        // A bola sai pela linha de fundo (fora do campo) antes de ser colocada no canto
        { kind: 'shot', to: { x: goalX + dir * 22, y: cy < MID_Y ? cy + 18 : cy - 18 }, dur: 420, caption: 'Defendeu e a bola sai pela linha de fundo: escanteio!', scripted: true, after: () => { st.poss = S; } },
        { kind: 'shot', to: corner, dur: quick ? 300 : 450, caption: `Escanteio para ${abbr}`, scripted: true, setup },
        { kind: 'wait', to: corner, dur: quick ? 600 : 1500, caption: `Escanteio para ${abbr}`, scripted: true, setup },
        ...dl.steps,
      ];
    };

    // Montagem da bola parada: bola na marca, barreira ou cobrador posicionado, time na área
    const boxSpot = (d: number, dy: number): Point => ({ x: goalX - dir * d, y: MID_Y + dy });
    let cornerY = MID_Y; // de que canto sai o escanteio (usado na curva do gol olímpico)
    if (special === 'escanteio' || special === 'olimpico') {
      const cy = Math.random() < 0.5 ? FY0 + 6 : FY1 - 6;
      cornerY = cy;
      const corner: Point = { x: goalX - dir * 5, y: cy };
      const direct = special === 'olimpico';
      const taker = direct
        ? actorSlot
        : (passer && passer.key !== actorKey ? passer : undefined) ??
          mine.find((s) => s.key !== actorKey && (s.pos === 'LF' || s.pos === 'RF')) ??
          mine.find((s) => s.key !== actorKey) ??
          actorSlot;
      const setup: Setup[] = [{ key: taker.key, x: corner.x - dir * 8, y: cy < MID_Y ? cy + 6 : cy - 6, speed: 2 }];
      mine.forEach((s) => {
        if (s.key === taker.key) return;
        const p = s.key === actorKey ? boxSpot(rand(55, 80), rand(-16, 16)) : boxSpot(rand(95, 135), rand(-48, 48));
        setup.push({ key: s.key, x: p.x, y: p.y, speed: 1.5 });
      });
      all.filter((s) => s.side === O && s.pos !== 'GK').forEach((s) => {
        const p = boxSpot(rand(40, 90), rand(-42, 42));
        setup.push({ key: s.key, x: p.x, y: p.y, speed: 1.5 });
      });
      const dl = direct ? null : cornerDeliver(taker, actorSlot, corner, cy, setup, mk);
      // Antes do escanteio a bola precisa sair: o time chega pela ponta, cruza e a zaga desvia pela linha de fundo
      const maker =
        wings.find((w) => w.key !== taker.key) ?? mine.find((s) => s.key !== actorKey && s.key !== taker.key) ?? actorSlot;
      const clearer = find(`${O}-${pick<Pos>(['LB', 'RB'])}`);
      if (holderSide !== S) q.push(mk({ kind: 'move', to: { slot: `${S}-CM` }, dur: 520 }));
      q.push(mk({ kind: 'pass', to: { slot: maker.key }, dur: 560 }));
      q.push(
        mk({
          kind: 'carry',
          to: { x: goalX - dir * rand(60, 85), y: cy < MID_Y ? FY0 + 42 : FY1 - 42 },
          dur: 3000,
          arrive: true,
          caption: `${maker.name} avança pela ponta`,
        }),
      );
      // O cruzamento chega na área e quem põe a bola para fora é a ZAGA (o time adversário toca por último),
      // por isso o escanteio é de quem atacava. Antes a bola saía direto do pé de quem cruzava.
      const outSpot: Point = { x: goalX + dir * 22, y: cy < MID_Y ? cy + 18 : cy - 18 };
      const clearerSpot: Point = { x: goalX - dir * 34, y: cy < MID_Y ? cy + 42 : cy - 42 };
      if (clearer) {
        q.push(
          mk({
            kind: 'shot',
            to: { slot: clearer.key },
            dur: 420,
            arc: 10,
            caption: `${maker.name} cruza para a área`,
            setup: [{ key: clearer.key, x: clearerSpot.x, y: clearerSpot.y, speed: 2.2 }],
          }),
        );
        q.push(
          mk({
            kind: 'shot',
            to: outSpot,
            dur: 380,
            caption: `${clearer.name} afasta de qualquer jeito e a bola sai pela linha de fundo: escanteio!`,
          }),
        );
      } else {
        q.push(mk({ kind: 'shot', to: outSpot, dur: 460, arc: 10, caption: 'A zaga desvia pela linha de fundo: escanteio!' }));
      }
      q.push(mk({ kind: 'shot', to: corner, dur: 450, caption: `Escanteio para ${abbrOf}`, setup, after: () => { st.poss = S; } }));
      q.push(waitStep(1500, setup, direct ? `${taker.name} vai cobrar o escanteio direto` : `${taker.name} se prepara para o escanteio`));
      if (dl) q.push(...dl.steps);
    }

    if (ev.type === 'gol') {
      const style =
        special === 'olimpico'
          ? 'olimpico'
          : text.includes('voleio') || text.includes('bicicleta')
            ? 'voleio'
            : text.includes('cavadinha') || text.includes('chapéu')
              ? 'cavadinha'
              : play === 'longe'
                ? 'longe'
                : Math.random() < 0.55
                  ? 'canto'
                  : 'meio';
      const gy =
        style === 'canto' || style === 'olimpico'
          ? Math.random() < 0.5
            ? GOAL_TOP + 9
            : GOAL_BOTTOM - 9
          : MID_Y + rand(-20, 20);
      // Rebote: o goleiro defende, a bola sobra na área e o atacante empurra para a rede
      if (text.includes('rebote') && !special) {
        const spot: Point = { x: goalX - dir * 20, y: MID_Y + rand(-28, 28) };
        q.push(
          mk({
            kind: 'shot',
            to: spot,
            dur: 380,
            caption: `${gk?.name ?? 'O goleiro'} defende, mas a bola sobra na área!`,
            setup: gk ? [{ key: gkKey, x: gkX, y: MID_Y + rand(-30, 30), speed: 2.2 }] : undefined,
          }),
        );
        q.push(waitStep(300, [run(actorKey, { x: spot.x - dir * 12, y: spot.y }, 1.8)]));
      }
      const label =
        special === 'olimpico'
          ? 'GOL OLÍMPICO!'
          : text.includes('bicicleta')
            ? 'GOL DE PLACA!'
            : text.includes('voleio')
              ? 'VOLEIO ESPETACULAR!'
              : text.includes('chapéu')
                ? 'QUE CHAPÉU!'
                : header
                  ? 'GOL DE CABEÇA!'
                  : 'GOL!';
      // O goleiro pula para o lado errado ou chega atrasado
      const diveY = gy >= MID_Y ? MID_Y - rand(10, 24) : MID_Y + rand(10, 24);
      q.push(
        mk({
          kind: 'shot',
          to: { x: goalX + dir * 12, y: gy },
          dur:
            style === 'olimpico'
              ? 900
              : style === 'longe'
                ? 520
                : style === 'cavadinha'
                  ? 600
                  : style === 'voleio'
                    ? 300
                    : header
                      ? 320
                      : 360,
          arc:
            style === 'olimpico' ? 22 : style === 'cavadinha' ? 14 : style === 'longe' ? 8 : style === 'voleio' ? 6 : 0,
          // Gol olímpico: a bola sai do canto, faz a curva para dentro do campo e morre no gol
          curve: style === 'olimpico' ? 85 * dir * Math.sign(gy - cornerY) : undefined,
          caption: ev.text,
          setup: gk ? [{ key: gkKey, x: gkX, y: diveY, speed: 2.2 }] : undefined,
          after: () => {
            startCelebration(S, actorKey, label);
            captureClip(ev.id, 'gol', `${label} ${find(actorKey)?.name ?? ''}`.trim(), actorKey, 650);
            flashNet(S);
            onGoalRef.current?.(ev.id ?? -1, S);
          },
        }),
      );
    } else if (ev.type === 'defesa') {
      const outcome: 'corner' | 'hold' | 'rebound' = text.includes('escanteio')
        ? 'corner'
        : text.includes('domina') || text.includes('segura')
          ? 'hold'
          : pick<'corner' | 'hold' | 'rebound'>(['hold', 'hold', 'rebound', 'corner']);
      // A narração diz escanteio: ele sempre acontece (mais rápido quando a fila de lances está cheia)
      const useCorner = outcome === 'corner';
      q.push(
        mk({
          kind: 'shot',
          to: { slot: gkKey },
          dur: header ? 360 : 420,
          arc: Math.random() < 0.2 ? 6 : 0,
          caption: ev.text,
          setup: gk ? [{ key: gkKey, x: gkX, y: MID_Y + rand(-38, 38), speed: 2.2 }] : undefined,
          after: () => {
            captureClip(ev.id, 'defesa', ev.text, actorKey, 500);
            if (useCorner) st.queue.unshift(...cornerSteps(backlog > 3));
            else if (outcome !== 'hold') {
              if (gk) {
                // Rebote: a bola sobra na entrada da área, para o lado, e vira disputa de segunda bola
                const a = Math.atan2(0, -dir) + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 1.0);
                const v = rand(230, 340);
                launchSB(gk.x - dir * 14, gk.y, Math.cos(a) * v, Math.sin(a) * v, S, `${gk.name} espalma e a bola sobra na entrada da área`);
              } else {
                st.queue.unshift({ kind: 'move', to: { slot: defenderKey() }, dur: 700, caption: 'O goleiro espalma e a zaga afasta', scripted: true });
              }
            }
          },
        }),
      );
    } else {
      // Finalização que não dá em gol: trave, rente à trave, por cima ou para fora
      const kind: 'post' | 'rente' | 'over' | 'wide' = text.includes('bola na trave')
        ? 'post'
        : text.includes('rente')
          ? 'rente'
          : text.includes('por cima') || text.includes('isola')
            ? 'over'
            : 'wide';
      const side = Math.random() < 0.5 ? -1 : 1;
      if (kind === 'post') {
        q.push(
          mk({
            kind: 'shot',
            to: { x: goalX, y: side < 0 ? GOAL_TOP : GOAL_BOTTOM },
            dur: 380,
            caption: ev.text,
            after: () => {
              // Avisa o resto da tela (som, trave balançando, tremor de câmera)
              window.dispatchEvent(new CustomEvent('pitch-post', { detail: { x: goalX, y: side < 0 ? GOAL_TOP : GOAL_BOTTOM } }));
              captureClip(ev.id, 'quase', ev.text, actorKey, 400);
              {
                // A bola volta da trave para o campo (ângulo oposto ao do chute): segunda bola
                const a = Math.atan2(0, -dir) + side * rand(0.2, 0.9);
                const v = rand(260, 380);
                launchSB(goalX - dir * 10, side < 0 ? GOAL_TOP + 8 : GOAL_BOTTOM - 8, Math.cos(a) * v, Math.sin(a) * v, S, 'Na trave! A bola volta e vira segunda bola');
              }
            },
          }),
        );
      } else {
        const to: Point =
          kind === 'over'
            ? { x: goalX + dir * 55, y: MID_Y + rand(-34, 34) }
            : kind === 'rente'
              ? { x: goalX + dir * 8, y: side < 0 ? GOAL_TOP - 12 : GOAL_BOTTOM + 12 }
              : { x: goalX + dir * 8, y: MID_Y + side * (GOAL_BOTTOM - MID_Y + rand(14, 40)) };
        q.push(mk({ kind: 'shot', to, dur: kind === 'over' ? 520 : 420, arc: kind === 'over' ? 26 : 0, caption: ev.text, after: () => { captureClip(ev.id, 'quase', ev.text, actorKey, 400); tiroDeMeta(); } }));
      }
    }
    st.queue.push(...q);
  }

  // Começo do 2º tempo: descarta o que sobrou do 1º e recomeça com a bola no centro (saída do outro time)
  const lastRestart = useRef(restartKey);
  useEffect(() => {
    if (restartKey === undefined || restartKey === lastRestart.current) return;
    lastRestart.current = restartKey;
    if (deadBallRef) deadBallRef.current = false;
    rec.current.timers.forEach((t) => window.clearTimeout(t));
    rec.current.timers = [];
    rec.current.pending = null;
    setReplay(null);
    const st = engine.current;
    const now = tnow();
    st.queue = [];
    st.active = null;
    st.celebrate = null;
    st.overrides = {};
    st.holder = null;
    st.ballX = MID_X;
    st.ballY = MID_Y;
    st.poss = 'bot';
    st.kickoff = { side: 'bot', until: now + 900, maxUntil: now + 5000 };
    // Todo mundo já aparece na formação de saída de bola (igual ao fim da animação do intervalo), sem correr de outro lugar
    slotsRef.current.forEach((s) => {
      const spot = s.side === 'bot' && s.pos === 'CF' ? { x: MID_X - dirOf('bot') * 12, y: MID_Y } : s.kick;
      s.x = spot.x;
      s.y = spot.y;
      s.vx = 0;
      s.vy = 0;
    });
    setGoalText('');
    setCaption('Começa o 2º tempo');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartKey]);

  const latest = events[0];
  const latestKey = latest ? `${latest.minute}|${latest.type}|${latest.team}|${latest.text}` : '';
  useEffect(() => {
    if (!latest || engine.current.lastKey === latestKey) return;
    engine.current.lastKey = latestKey;
    scheduleEvent(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestKey]);

  // Loop de animação: move bolinhas e bola direto no SVG, sem re-renderizar o React
  useEffect(() => {
    let raf = 0;
    let last = tnow();
    engine.current.ambientAt = last + 1200;
    engine.current.runAt = last + 1500;
    // Começa o jogo com a bola parada no meio e cada time na sua metade
    engine.current.holder = null;
    engine.current.ballX = MID_X;
    engine.current.ballY = MID_Y;
    engine.current.kickoff = { side: 'user', until: last + 1600, maxUntil: last + 1600 };

    const loop = (ts: number) => {
      // Congelado: não anda nada e o relógio do campo não corre
      if (holdRef.current) {
        if (!heldSince.current) heldSince.current = ts;
        raf = requestAnimationFrame(loop);
        return;
      }
      if (heldSince.current) {
        heldTotal.current += ts - heldSince.current;
        heldSince.current = 0;
      }
      const now = ts - heldTotal.current;
      perfSample(now - last);
      const dt = Math.min(64, now - last);
      last = now;
      const st = engine.current;
      const all = slotsRef.current;
      const get = (key: string) => all.find((s) => s.key === key);

      // Fim da comemoração: bola ao centro, quem sofreu o gol sai jogando
      if (st.celebrate && now >= st.celebrate.until) {
        const other = otherSide(st.celebrate.side);
        st.celebrate = null;
        st.overrides = {};
        st.active = null;
        st.holder = null;
        st.ballX = MID_X;
        st.ballY = MID_Y;
        st.poss = other;
        // Reinício: bola parada no centro e todo mundo volta para sua metade
        st.kickoff = { side: other, until: now + 1200, maxUntil: now + 6000 };
        setCaption('Bola ao centro');
      }
      if (st.kickoff && now >= st.kickoff.until) {
        // Só recomeça quando todo mundo chegou no seu lugar (ou depois de no máximo 6 segundos)
        const kickSide = st.kickoff.side;
        const spotOf = (s: Slot): Point =>
          kickSide === s.side && s.pos === 'CF' ? { x: MID_X - dirOf(s.side) * 12, y: MID_Y } : s.kick;
        const slotsNow = slotsRef.current;
        const arrived = slotsNow.every((s) => dist(s, spotOf(s)) < 16);
        if (arrived || now >= st.kickoff.maxUntil) {
          slotsNow.forEach((s) => {
            const spot = spotOf(s);
            s.x = spot.x;
            s.y = spot.y;
            s.vx = 0;
            s.vy = 0;
          });
          st.kickoff.until = 0;
        }
      }
      // `until` só vira 0 quando todo mundo já chegou no seu lugar (bloco acima): só então a bola rola.
      // Antes, esta checagem também disparava com `until` no passado e soltava a bola com o time ainda voltando.
      if (st.kickoff && st.kickoff.until === 0) {
        st.holder = `${st.kickoff.side}-CF`;
        st.poss = st.kickoff.side;
        st.kickoff = null;
        st.ambientAt = now + 500;
        st.runAt = now + 1500;
        setCaption('Bola rolando');
      }
      const celebrating = !!st.celebrate;
      const kickoffOn = !!st.kickoff;

      // Limpa ordens de movimento vencidas
      for (const key of Object.keys(st.overrides)) {
        if (st.overrides[key].until < now) delete st.overrides[key];
      }

      // Começa o próximo passo da fila
      if (!st.active && st.queue.length && !celebrating && !kickoffOn) {
        startStep(st.queue.shift() as Step, now);
      }

      const holderNow = st.holder ? get(st.holder) : undefined;
      const followHolder = () => {
        if (!holderNow) return;
        const sp = Math.hypot(holderNow.vx, holderNow.vy);
        const ux = sp > 12 ? holderNow.vx / sp : dirOf(holderNow.side);
        const uy = sp > 12 ? holderNow.vy / sp : 0;
        const k = 1 - Math.exp(-dt / 60);
        const gs = gaitRef.current[holderNow.key];
        const touch = st.active && st.active.step.kind === 'carry' && !st.active.step.dribble && sp > 20 ? Math.max(0, Math.sin(gs && !liteRef.current ? gs.phase : now / 120)) * (gs && gs.gait === 'sprint' ? 8 : 5) : 0;
        const df = dribFx.current;
        const bfx = st.active && st.active.step.dribble && df ? dribbleBody(df.move, df.phase, clamp((now - df.t0) / df.dur, 0, 1), df.sg) : null;
        // Bola solta após erro de domínio: rola com atrito, o jogador corre atrás; adversário que chegar antes rouba
        const lo = looseRef.current;
        if (lo) {
          if (lo.key !== holderNow.key || now > lo.until || st.queue.length) looseRef.current = null;
          else {
            const fr = Math.exp(-dt / 330);
            lo.vx *= fr;
            lo.vy *= fr;
            st.ballX = clamp(st.ballX + (lo.vx * dt) / 1000, FX0 + 6, FX1 - 6);
            st.ballY = clamp(st.ballY + (lo.vy * dt) / 1000, FY0 + 6, FY1 - 6);
            st.overrides[holderNow.key] = { x: st.ballX, y: st.ballY, until: now + 140, speed: 1.6 };
            const thief = nearestOpp(all, holderNow.side, { x: st.ballX, y: st.ballY });
            if (thief.slot && thief.d < 15 && thief.d < dist(holderNow, { x: st.ballX, y: st.ballY }) - 4) {
              st.holder = thief.slot.key;
              st.poss = thief.slot.side;
              st.ambientAt = now + 450;
              looseRef.current = null;
              delete ctlRef.current[holderNow.key];
              countUse('def.recupera');
              setCaption(`${thief.slot.name} aproveita o erro de domínio de ${holderNow.name} e rouba a bola`);
              return;
            }
            if (dist(holderNow, { x: st.ballX, y: st.ballY }) < 14) {
              looseRef.current = null;
              delete st.overrides[holderNow.key];
              st.ambientAt = now + 220;
              countUse('dom.recupera');
              setCaption(`${holderNow.name} se recupera e controla a bola`);
            }
            return;
          }
        }
        // Controle em andamento: a sobra da bola (amortecimento, orientado...) diminui até a bola assentar
        const cc = ctlRef.current[holderNow.key];
        let cfx = 0;
        let cfy = 0;
        if (cc) {
          const pr = (tnow() - cc.t0) / cc.plan.settle;
          if (pr >= 1) delete ctlRef.current[holderNow.key];
          else {
            const dec = Math.pow(1 - pr, 2);
            const nxl = -Math.sin(cc.ang);
            const nyl = Math.cos(cc.ang);
            const lat = cc.plan.lat * dec;
            cfx = Math.cos(cc.ang) * cc.plan.fwd * dec + nxl * lat;
            cfy = Math.sin(cc.ang) * cc.plan.fwd * dec + nyl * lat;
          }
        }
        // Proteção da posse: a bola fica do lado oposto ao marcador
        let sfx = 0;
        let sfy = 0;
        if ((shieldRef.current[holderNow.key] ?? 0) > now) {
          const o = nearestOpp(all, holderNow.side, holderNow);
          if (o.slot && o.d < 70) {
            const ax = holderNow.x - o.slot.x;
            const ay = holderNow.y - o.slot.y;
            const al = Math.hypot(ax, ay) || 1;
            sfx = (ax / al) * 9;
            sfy = (ay / al) * 9;
          }
        }
        st.ballX += (holderNow.x + ux * (11 + touch) + cfx + sfx + (bfx ? bfx.ballFwd * dirOf(holderNow.side) : 0) - st.ballX) * k;
        const wob = st.active && st.active.step.dribble ? (df && df.phase === 'fake' ? df.sg * Math.sin(clamp((now - df.t0) / df.dur, 0, 1) * Math.PI * 2) * 9 : Math.sin(now / 45) * 6) : 0;
        st.ballY += (holderNow.y + uy * 11 + 2 + wob + cfy + sfy + (bfx ? bfx.ballLat : 0) - st.ballY) * k;
      };

      // Momento da partida: a cada segundo, posse com campo ganho soma pressão; a barra do campo e a narração acompanham
      if (now >= momNext.current) {
        momNext.current = now + 1000;
        if (!celebrating && !kickoffOn && animOn('ia.momento')) {
          const ps = st.holder ? sideOf(st.holder) : st.poss;
          const prog = ps === 'user' ? (st.ballX - FX0) / (FX1 - FX0) : (FX1 - st.ballX) / (FX1 - FX0);
          pushMom(ps, 0.25 + 0.6 * clamp(prog, 0, 1));
        }
        const mu = momValue(momRef.current, 'user', now);
        if (momEl.current) {
          momEl.current.style.setProperty('--m', String(clamp(0.5 + mu * 0.5, 0.05, 0.95)));
          momEl.current.style.opacity = animOn('ia.momento') ? '1' : '0';
        }
        if (animOn('ia.momento') && Math.abs(mu) > 0.42 && now - momTalk.current > 45000) {
          momTalk.current = now;
          const top: Side = mu > 0 ? 'user' : 'bot';
          countUse('ia.momento');
          logDecision(top === 'user' ? club.abbreviation : opponent.abbreviation, 'momento', `time por cima (${Math.abs(mu).toFixed(2)})`);
          setCaption(`${top === 'user' ? club.name : opponent.name} está por cima e pressiona`);
        }
      }

      // Segunda bola: a bola solta rola com atrito e quica nas bordas; quem chega primeiro (ou ganha a disputa) fica com ela
      const sbs = sbRef.current;
      if (sbs && (st.holder || st.active || celebrating || kickoffOn)) sbRef.current = null;
      else if (sbs) {
        const fr = Math.exp(-dt / 420);
        sbs.vx *= fr;
        sbs.vy *= fr;
        st.ballX += (sbs.vx * dt) / 1000;
        st.ballY += (sbs.vy * dt) / 1000;
        if (st.ballX < FX0 + 6 || st.ballX > FX1 - 6) {
          sbs.vx *= -0.45;
          st.ballX = clamp(st.ballX, FX0 + 6, FX1 - 6);
        }
        if (st.ballY < FY0 + 6 || st.ballY > FY1 - 6) {
          sbs.vy *= -0.45;
          st.ballY = clamp(st.ballY, FY0 + 6, FY1 - 6);
        }
        const bp: Point = { x: st.ballX, y: st.ballY };
        const spd = Math.hypot(sbs.vx, sbs.vy);
        const reach = all.filter((x) => x.pos !== 'GK' && dist(x, bp) < 13 && spd < 260 && now - sbs.t0 > 120);
        const timeout = now > sbs.until;
        if (reach.length || timeout) {
          const pool = reach.length ? reach : [all.filter((x) => x.pos !== 'GK').sort((a, b) => dist(a, bp) - dist(b, bp))[0]];
          const runs = sbs.runs.filter((r) => pool.some((x) => x.key === r.key));
          const pw = runs.length >= 2 ? pickWinner(runs.map((r) => ({ ...r, eta: 0 })), (k) => get(k)?.ovr ?? 70, Math.random) : null;
          const win = pw ? get(pw.winner.key) : pool[0];
          const contestN = pool.filter((x) => x.side !== win?.side).length > 0 ? pool.length : 1;
          if (win) {
            st.holder = win.key;
            st.poss = win.side;
            sbRef.current = null;
            st.overrides = {};
            st.ambientAt = now + 180 + (contestN > 1 ? 220 : 0);
            const ang = Math.atan2(sbs.vy, sbs.vx);
            pose(win.key, 'touch', ang, 1);
            if (contestN > 1) {
              pool.filter((x) => x.key !== win.key).forEach((x) => pose(x.key, 'touch', Math.atan2(win.y - x.y, win.x - x.x), 0.9));
              ringAt(win.x, win.y, 'rgba(255,190,110,.9)', true, 30, 340, 'ia.segundabola');
            }
            const turnover = !!sbs.from && sbs.from !== win.side;
            if (turnover) counterRef.current = { side: win.side, until: now + 3500 };
            pushMom(win.side, 0.7);
            const cap = contestN >= 3 ? `Disputa a três pela segunda bola: ${win.name} sai com ela` : contestN === 2 ? `${win.name} vence a disputa da segunda bola` : `${win.name} chega primeiro na segunda bola`;
            setCaption(cap);
            logDecision(win.name, 'ganha a segunda bola', `${contestN > 1 ? contestN + ' discos disputaram' : 'chegou primeiro'}${turnover ? ' (posse trocou)' : ''}`);
          }
        }
      }

      // Move a bola
      let lift = 0; // altura da bola (passes e chutes por cima)
      if (st.active && st.active.step.kind === 'wait') {
        // Pausa: a bola fica parada (ou com quem a tem) enquanto os jogadores se posicionam
        followHolder();
        if (now - st.active.start >= st.active.step.dur) {
          const done = st.active.step;
          st.active = null;
          done.after?.();
        }
      } else if (st.active && st.active.step.kind !== 'carry') {
        const { step, from, start, lead, dest } = st.active;
        const p = Math.min(1, (now - start) / (step.dur * (rainRef.current ? 1.15 : 1)));
        const e = step.kind === 'shot' ? p : 1 - Math.pow(1 - p, 2);
        let tx = from.x;
        let ty = from.y;
        if (lead) {
          tx = lead.x;
          ty = lead.y;
        } else if ('slot' in step.to) {
          const target = get(step.to.slot);
          if (target) {
            tx = target.x;
            ty = target.y;
          }
        } else {
          tx = step.to.x;
          ty = step.to.y;
        }
        st.ballX = from.x + (tx - from.x) * e;
        st.ballY = from.y + (ty - from.y) * e;
        if (step.curve) {
          // Curva: desvia a bola para o lado, perpendicular ao trajeto, e volta ao destino (efeito)
          const cdx = tx - from.x;
          const cdy = ty - from.y;
          const clen = Math.hypot(cdx, cdy) || 1;
          const off = step.curve * Math.sin(Math.PI * e);
          st.ballX += (-cdy / clen) * off;
          st.ballY += (cdx / clen) * off;
        }
        lift = (step.arc ?? 0) * (rainRef.current ? 0.8 : 1) * Math.sin(Math.PI * p);
        if (p >= 1) {
          // Bolas que vieram por cima quicam duas ou três vezes, cada vez menos
          if ((step.arc ?? 0) >= 12) bounce.current = { start: now, h: Math.min(16, (step.arc ?? 0) * (rainRef.current ? 0.12 : 0.32)) };
          st.active = null;
          if (dest) {
            if (st.poss !== sideOf(dest) && !step.scripted) counterRef.current = { side: sideOf(dest), until: now + 3500 };
            st.holder = dest;
            st.poss = sideOf(dest);
            // Domínio: o disco amortece a bola (e o goleiro faz o impacto da defesa)
            const rc = get(dest);
            if (rc && step.kind !== 'wait') {
              const ang = Math.atan2(ty - from.y, tx - from.x);
              const pow = clamp(520 / step.dur, 0.5, 1.4);
              if (rc.pos === 'GK' && step.kind === 'shot') {
                pose(dest, 'save', ang, 1);
                ringAt(rc.x, rc.y, '#9be7ff', true, 34, 420, 'fx.save');
              } else {
                pose(dest, 'touch', ang, pow);
                if (step.kind === 'shot') ringAt(rc.x, rc.y, 'rgba(255,255,255,.9)', false, 26, 320, 'fx.touch');
                else if (step.kind === 'pass') contactOn(rc, step, ang, now);
              }
            }
          }
          step.after?.();
        }
      } else if (st.active) {
        // Condução: a bola acompanha o jogador
        followHolder();
        const cs = st.active.step;
        const target = 'x' in cs.to ? cs.to : null;
        const hh = st.holder ? get(st.holder) : undefined;
        const arrived = !!(cs.arrive && target && hh && dist(hh, target) < 18);
        if (arrived || now - st.active.start >= cs.dur) {
          const done = st.active.step;
          st.active = null;
          done.after?.();
        }
      } else {
        followHolder();
      }

      // Desarme: o marcador colado dá o bote (corre até o jogador) e o resultado depende do overall dos dois.
      // Só em jogadas de rotina: lances do plano (gols, defesas) não são interrompidos.
      const scriptedPending = st.queue.some((s) => s.scripted) || !!(st.active && st.active.step.scripted);
      if (
        !celebrating &&
        !kickoffOn &&
        !scriptedPending &&
        st.holder &&
        now >= st.tackleAt &&
        (!st.active || st.active.step.kind === 'carry') &&
        !(st.active && st.active.step.dribble)
      ) {
        const h = get(st.holder);
        if (h && h.pos !== 'GK') {
          const near = nearestOpp(all, h.side, h);
          const dfn = near.slot;
          // Marcador colado: o portador protege a bola com o corpo (ela passa para o lado oposto ao marcador)
          if (dfn && near.d < 46 && (shieldRef.current[h.key] ?? 0) < now - 1500 && animOn(CONTACT_ID.protecao) && Math.random() < (0.8 * dt) / 1000) {
            shieldRef.current[h.key] = now + 900;
            countUse(CONTACT_ID.protecao);
            ringAt(h.x, h.y, 'rgba(255,200,120,.8)', false, 28, 380, CONTACT_ID.protecao);
          }
          if (dfn && near.d < 30 && Math.random() < (0.9 * dt) / 1000) {
            // Escolha do desarme pelo contexto: de onde o marcador vem, velocidade da bola, equilíbrio de forças, cobertura e proteção
            const hs = Math.hypot(h.vx, h.vy);
            const hux = hs > 8 ? h.vx / hs : dirOf(h.side);
            const huy = hs > 8 ? h.vy / hs : 0;
            const helpers = all.filter((x) => x.side === dfn.side && x.key !== dfn.key && x.pos !== 'GK' && dist(x, h) < 75).length;
            const tk = chooseTackle(
              { tiredD: fatigueOf(dfn.key), tiredH: fatigueOf(h.key), ovrD: dfn.ovr, ovrH: h.ovr, hRatio: hs / h.maxSpeed, behind: (dfn.x - h.x) * hux + (dfn.y - h.y) * huy < -4, helpers, shielding: (shieldRef.current[h.key] ?? 0) > now },
              Math.random,
              (k) => animOn(`def.${k}`),
            );
            countUse(`def.${tk.kind}`);
            // Quem tem overall maior leva vantagem; carrinho bem encaixado e cobertura ajudam, proteção da posse atrapalha
            const base = clamp(0.5 + (dfn.ovr - h.ovr) / 90, 0.25, 0.75);
            const win = Math.random() < clamp(tk.kind === 'disputa' ? 0.5 + (base - 0.5) * 0.5 + tk.winMod : base + tk.winMod, 0.15, 0.85);
            const dirH = dirOf(h.side);
            const slide = tk.kind === 'carrinho';
            const dispute = tk.kind === 'disputa';
            st.tackleAt = now + 1000;
            {
              const ddx = h.x - dfn.x;
              const ddy = h.y - dfn.y;
              const dd = Math.hypot(ddx, ddy) || 1;
              tackleFx.current = { def: dfn.key, hold: h.key, t0: now, span: slide ? 330 : 260, slide, win, ax: ddx / dd, ay: ddy / dd, contact: 0 };
            }
            if (slide) slideRef.current[dfn.key] = { until: now + 360, fx: dfn.x, fy: dfn.y };
            // Desarme cansa: quem dá o bote gasta mais, quem perde a bola também
            const ledger = workRefLocal.current?.current.effort;
            if (ledger) {
              ledger[dfn.key] = (ledger[dfn.key] ?? 0) + (slide ? 60 : 35);
              ledger[h.key] = (ledger[h.key] ?? 0) + 15;
            }
            st.queue = [];
            st.overrides = {};
            st.active = {
              step: {
                kind: 'wait',
                to: { x: h.x, y: h.y },
                dur: slide ? 330 : 260,
                ambient: true,
                setup: [{ key: dfn.key, x: h.x, y: h.y, speed: slide ? 3 : 2.3 }],
                after: () => {
                  const t = tnow();
                  st.overrides = {};
                  if (tackleFx.current) tackleFx.current.contact = t;
                  if (dispute) {
                    // Disputa de ombro: os dois discos se empurram no contato
                    const ang = Math.atan2(h.y - dfn.y, h.x - dfn.x);
                    pose(dfn.key, 'touch', ang, 1.3);
                    pose(h.key, 'touch', ang + Math.PI, 1.3);
                    ringAt((h.x + dfn.x) / 2, (h.y + dfn.y) / 2, 'rgba(255,190,110,.9)', true, 30, 360, 'def.disputa');
                    if (Math.random() < 0.4) {
                      // A disputa rebenta a bola: ela escapa solta entre os dois
                      const a = ang + (Math.random() < 0.5 ? 1 : -1) * rand(1.2, 1.9);
                      const v = rand(130, 210);
                      launchSB((h.x + dfn.x) / 2, (h.y + dfn.y) / 2, Math.cos(a) * v, Math.sin(a) * v, h.side, 'A disputa deixa a bola solta');
                      return;
                    }
                    if (win) setCaption(`${dfn.name} ganha a disputa de ombro com ${h.name}`);
                  }
                  // Quem ganha a bola faz ela pular para longe do desarmado
                  if (win) bounce.current = { start: t, h: slide ? 11 : 7 };
                  if (win) {
                    // A bola é do marcador: quem perdeu fica desequilibrado, quem ganhou sai jogando
                    st.holder = dfn.key;
                    st.poss = dfn.side;
                    counterRef.current = { side: dfn.side, until: now + 4200 };
                    pushMom(dfn.side, 1);
                    st.overrides[h.key] = { x: h.x, y: h.y, until: t + 800, speed: 0.15 };
                    st.overrides[dfn.key] = {
                      x: clamp(dfn.x - dirH * 55, FX0 + 20, FX1 - 20),
                      y: clamp(dfn.y + rand(-30, 30), FY0 + 20, FY1 - 20),
                      until: t + 650,
                      speed: slide ? 0.55 : 1.2,
                    };
                    st.ambientAt = t + 500;
                    setCaption(
                      pick([
                        `${dfn.name} desarma ${h.name}`,
                        `${dfn.name} chega firme e rouba a bola de ${h.name}`,
                        `${dfn.name} dá o bote certo em ${h.name}`,
                        slide ? `Carrinho de ${dfn.name}! A bola é dele` : `${dfn.name} antecipa e leva a bola`,
                        `${dfn.name} faz o desarme e sai jogando`,
                      ]),
                    );
                  } else {
                    // O jogador escapa e o marcador fica para trás
                    st.overrides[dfn.key] = { x: dfn.x, y: dfn.y, until: t + (slide ? 1250 : 900), speed: 0.18 };
                    st.overrides[h.key] = {
                      x: clamp(h.x + dirH * 70, FX0 + 20, FX1 - 20),
                      y: clamp(h.y + rand(-26, 26), FY0 + 20, FY1 - 20),
                      until: t + 650,
                      speed: 1.35,
                    };
                    st.ambientAt = t + 350;
                    setCaption(
                      pick([
                        `${h.name} escapa do bote de ${dfn.name}`,
                        `${h.name} passa por ${dfn.name} no corpo`,
                        `${dfn.name} chega atrasado em ${h.name}`,
                        slide ? `${dfn.name} vai no carrinho, mas ${h.name} pula e segue` : `${h.name} protege a bola de ${dfn.name}`,
                      ]),
                    );
                  }
                },
              },
              from: { x: st.ballX, y: st.ballY },
              start: now,
              dest: null,
            };
            // O marcador começa o bote já (o passo 'wait' só começa os movimentos combinados ao iniciar pela fila)
            st.overrides[dfn.key] = { x: h.x, y: h.y, until: now + 500, speed: slide ? 3 : 2.3 };
          }
        }
      }

      // Decisão do jogador com a bola: conduzir ou passar
      if (!st.active && !st.queue.length && st.holder && !celebrating && now >= st.ambientAt) {
        const h = get(st.holder);
        if (h) {
          const d = dirOf(h.side);
          const goalX = d > 0 ? FX1 : FX0;
          const toGoal = Math.abs(goalX - h.x);
          const near = nearestOpp(all, h.side, h);
          // Pressão do zagueiro: 0 = atacante livre (zagueiro a 95 ou mais), 1 = marcador colado (35 ou menos)
          const pressure = clamp((95 - near.d) / 60, 0, 1);
          const uu = urgOf(h.side, now);
          heatAdd(heatRef.current[h.side], h.y, FY0, FY1, now);
          // Contra-ataque: logo após recuperar a bola o jogador lê espaço nas costas, adversários perto, companheiro livre e passe vertical
          let ctr: { mode: 'vertical' | 'conducao'; r?: Slot } | null = null;
          const cs0 = counterRef.current;
          if (cs0 && cs0.side === h.side && animOn('ia.contra')) {
            counterRef.current = null;
            if (now < cs0.until && h.pos !== 'GK') {
              const matesC = all.filter((x) => x.side === h.side && x.key !== h.key && x.pos !== 'GK');
              const ahead = matesC.filter((x) => (x.x - h.x) * d > 45 && nearestOpp(all, h.side, x).d > 55);
              const tgt = ahead.sort((a, b) => (b.x - a.x) * d)[0];
              const lane = !!tgt && !all.some((o) => o.side !== h.side && o.pos !== 'GK' && segPoint(o.x, o.y, h.x, h.y, tgt.x, tgt.y).d < 26);
              const ahOpp = all.filter((o) => o.side !== h.side && o.pos !== 'GK' && (o.x - h.x) * d > 20);
              const room = ahOpp.length ? Math.min(...ahOpp.map((o) => ((o.x - h.x) * d) - Math.abs(o.y - h.y) * 0.4)) : 400;
              const cr = counterRead(
                { behindSpace: ahOpp.length, nearOpp: all.filter((o) => o.side !== h.side && o.pos !== 'GK' && dist(o, h) < 95).length, mateAhead: !!tgt, laneOpen: lane, carryRoom: room, urgency: uu },
                Math.random,
              );
              logDecision(h.name, `contra-ataque: ${cr.mode}`, cr.why);
              if (cr.mode === 'vertical' && tgt) ctr = { mode: 'vertical', r: tgt };
              else if (cr.mode === 'conducao') ctr = { mode: 'conducao' };
            }
          }
          // Atacante perto do gol chuta em vez de passar, livre ou pressionado (o placar continua sendo decidido
          // pela simulação, então esses chutes de rotina terminam em defesa ou para fora, nunca em gol)
          const canShoot = FORWARDS.includes(h.pos) && toGoal < 240 && near.d > 26;
          // Lateral: a bola sai pela linha lateral e o outro time repõe com as mãos. No fim do 1º tempo o App pede uma para o apito.
          const wantHalfEnd = !!endHalfRef?.current && !deadBallRef?.current;
          const throwInNow = h.pos !== 'GK' && ((toGoal > 90 && toGoal < FX1 - FX0 - 90 && Math.random() < 0.06) || wantHalfEnd);
          let amb: ReturnType<typeof ambientChoice> = null;
          const decideAmbient = () => {
            if (canShoot && toGoal < 170) return null;
            const mates = all.filter((x) => x.side === h.side && x.key !== h.key && x.pos !== 'GK');
            const fwdOf = (x: Slot) => (x.x - h.x) * d;
            const mates2 = all.filter((x) => x.side === h.side && x.key !== h.key && x.pos !== 'GK');
            const ac = ambientChoice(intelRef.current, {
              side: h.side,
              holder: { pos: h.pos, name: h.name, ovr: h.ovr, style: stylesRef.current?.[h.side]?.[h.pos] as Style | undefined },
              pressure,
              toGoal,
              wide: Math.abs(h.y - MID_Y) > 85,
              forwardOpen: mates.some((x) => fwdOf(x) > 40 && nearestOpp(all, h.side, x).d > 55),
              centralJam: all.filter((x) => x.side !== h.side && x.pos !== 'GK' && Math.abs(x.y - MID_Y) < 80 && Math.abs(x.x - h.x) < 130).length >= 3,
              farSideFree: mates.some((x) => (x.y < MID_Y) !== (h.y < MID_Y) && fwdOf(x) > -40 && nearestOpp(all, h.side, x).d > 70),
              hasOverlapper: mates.some((x) => fwdOf(x) < -15 && (x.y < MID_Y) === (h.y < MID_Y) && dist(x, h) < 260),
              hasBackOption: mates.some((x) => fwdOf(x) < -20 && ['LB', 'RB', 'CM'].includes(x.pos) && dist(x, h) < 300),
            });
            // Placar e tempo: quem precisa do resultado evita recuar a bola; quem protege o resultado segura mais
            if (ac === 'recomeco' && uu > 0.3 && Math.random() < 0.6) return null;
            if (ac === null && uu < -0.3 && Math.random() < 0.3 && mates2.some((x) => (x.x - h.x) * d < -20 && ['LB', 'RB', 'CM'].includes(x.pos) && dist(x, h) < 300)) return 'recomeco' as typeof ac;
            return ac;
          };
          if (ctr && !throwInNow) {
            countUse('ia.contra');
            pushMom(h.side, 1.2);
            const runners = all.filter((x) => x.side === h.side && x.key !== h.key && x.pos !== 'GK' && FORWARDS.includes(x.pos) && x.key !== ctr?.r?.key).slice(0, 2);
            runners.forEach((x, i) => {
              st.overrides[x.key] = { x: clamp(h.x + d * rand(140, 210), FX0 + 40, FX1 - 40), y: clamp(MID_Y + (i === 0 ? -1 : 1) * rand(50, 110), FY0 + 30, FY1 - 30), until: now + 1500, speed: 1.5 };
            });
            if (ctr.mode === 'vertical' && ctr.r) {
              recordPass(intelRef.current, h.key, ctr.r.key);
              st.queue.push({ kind: 'pass', to: { slot: ctr.r.key }, dur: passDur(dist(h, ctr.r)) - 40, ambient: true, arc: 6, caption: `Contra-ataque: ${h.name} lança ${ctr.r.name} nas costas da defesa` });
            } else {
              st.queue.push({ kind: 'carry', to: { x: clamp(h.x + d * rand(120, 170), FX0 + 30, FX1 - 30), y: clamp(h.y + clamp((MID_Y - h.y) * 0.35, -45, 45), FY0 + 30, FY1 - 30) }, dur: 900, speed: 1.35, ambient: true, caption: `Contra-ataque: ${h.name} sai conduzindo` });
            }
          } else if (throwInNow) {
            const S = h.side;
            const O = otherSide(S);
            const d0 = dirOf(S);
            const lineY = h.y < MID_Y ? FY0 : FY1;
            const inward = lineY === FY0 ? 1 : -1;
            const lineX = clamp(h.x + d0 * rand(40, 120), FX0 + 70, FX1 - 70);
            const spot: Point = { x: lineX, y: lineY };
            const abbr = O === 'user' ? club.abbreviation : opponent.abbreviation;
            const mates = all.filter((x) => x.side === O && x.pos !== 'GK').sort((a, b) => dist(a, spot) - dist(b, spot));
            const taker = mates[0];
            const receiver = mates[1];
            if (taker && receiver) {
              const setup: Setup[] = [
                { key: taker.key, x: lineX, y: lineY + inward * 2, speed: 2.4 },
                { key: receiver.key, x: lineX - d0 * 45, y: lineY + inward * 62, speed: 1.8 },
              ];
              if (mates[2]) setup.push({ key: mates[2].key, x: lineX + d0 * 70, y: lineY + inward * 110, speed: 1.6 });
              all
                .filter((x) => x.side === S && x.pos !== 'GK')
                .sort((a, b) => dist(a, spot) - dist(b, spot))
                .slice(0, 2)
                .forEach((x, i) => setup.push({ key: x.key, x: lineX + (i === 0 ? -d0 * 38 : d0 * 30), y: lineY + inward * (i === 0 ? 70 : 100), speed: 1.8 }));
              const markDead = () => {
                if (deadBallRef) {
                  deadBallRef.current = true;
                  window.setTimeout(() => {
                    if (deadBallRef) deadBallRef.current = false;
                  }, 2800);
                }
              };
              st.queue.push(
                {
                  kind: 'shot',
                  to: { x: lineX, y: lineY - inward * 9 },
                  dur: 520,
                  ambient: true,
                  caption: wantHalfEnd ? 'A bola sai pela lateral' : `${h.name} perde a bola e ela sai pela lateral`,
                  after: () => {
                    st.poss = O;
                    markDead();
                  },
                },
                { kind: 'shot', to: spot, dur: 340, ambient: true, caption: `Lateral para ${abbr}`, setup },
                { kind: 'wait', to: spot, dur: 1100, ambient: true, caption: `Lateral para ${abbr}`, setup },
                {
                  kind: 'pass',
                  to: { slot: receiver.key },
                  dur: 560,
                  ambient: true,
                  arc: 14,
                  caption: `${taker.name} faz a reposição lateral`,
                  after: () => {
                    if (deadBallRef) deadBallRef.current = false;
                  },
                },
              );
            }
          } else if (canShoot && Math.random() < clamp((pressure > 0.4 ? 0.6 : 0.9) + uu * 0.08, 0.4, 0.97)) {
            const O = otherSide(h.side);
            const gk = get(`${O}-GK`);
            // Livre: quase sempre manda no gol. Pressionado: erra a maioria. Overall alto ajuda um pouco.
            const onTarget = clamp(lerp(0.9, 0.22, pressure) + (h.ovr - 75) * 0.004, 0.12, 0.96);
            // Bloqueio: defensor perto da linha do chute (e não colado no chutador) pode travar a bola; ela sobra solta
            let blk: { o: Slot; x: number; y: number; t: number; p: number } | null = null;
            for (const o of all) {
              if (o.side === h.side || o.pos === 'GK') continue;
              const sg = segPoint(o.x, o.y, h.x, h.y, goalX, MID_Y);
              const p = blockChance(sg.d, sg.t, o.ovr, pressure);
              if (p > 0 && (!blk || p > blk.p)) blk = { o, x: sg.x, y: sg.y, t: sg.t, p };
            }
            if (blk && animOn('ia.bloqueio') && Math.random() < blk.p) {
              const b = blk;
              const sp = rand(190, 300);
              st.queue.push({
                kind: 'shot',
                to: { x: b.x, y: b.y },
                dur: Math.max(160, 420 * b.t),
                ambient: true,
                caption: `${b.o.name} bloqueia o chute de ${h.name}`,
                setup: [{ key: b.o.key, x: b.x, y: b.y, speed: 2.4 }],
                after: () => {
                  const v = deflect(h, b.o, { x: goalX, y: MID_Y }, Math.random, sp);
                  countUse('ia.bloqueio');
                  logDecision(b.o.name, 'bloqueio', `bloqueou chute de ${h.name} (chance ${(b.p * 100).toFixed(0)}%)`);
                  pose(b.o.key, 'save', Math.atan2(v.vy, v.vx), 1);
                  ringAt(b.x, b.y, '#9be7ff', true, 30, 360, 'ia.bloqueio');
                  launchSB(b.x, b.y, v.vx, v.vy, h.side, `${b.o.name} bloqueia e a bola sobra solta`);
                },
              });
            } else if (gk && Math.random() < onTarget) {
              st.queue.push({
                kind: 'shot',
                to: { slot: gk.key },
                dur: 420,
                ambient: true,
                caption: `${h.name} chuta e ${gk.name} defende`,
                // Defesa com rebote: chute forte contra goleiro de overall menor devolve a bola para a entrada da área
                after: () => {
                  if (Math.random() < clamp(0.22 + (h.ovr - gk.ovr) / 160, 0.08, 0.4)) {
                    const a = Math.atan2(0, -d) + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 1.0);
                    const v = rand(210, 320);
                    launchSB(gk.x - d * 14, gk.y, Math.cos(a) * v, Math.sin(a) * v, h.side, `${gk.name} defende, mas a bola sobra`);
                  }
                },
              });
            } else {
              const wideY = MID_Y + (Math.random() < 0.5 ? -1 : 1) * (GOAL_BOTTOM - MID_Y + rand(10, 38));
              st.queue.push({
                kind: 'shot',
                to: { x: goalX + d * 8, y: wideY },
                dur: 420,
                ambient: true,
                caption:
                  pressure > 0.4 && near.slot
                    ? `${h.name} chuta pressionado por ${near.slot.name} e manda para fora`
                    : `${h.name} chuta para fora`,
                after: () => {
                  st.queue.unshift({ kind: 'move', to: { slot: `${O}-GK` }, dur: 800, caption: 'Tiro de meta' });
                },
              });
            }
          } else if (h.pos !== 'GK' && (amb = decideAmbient()) !== null) {
            // Decisão de jogo corrido: recomeçar a construção, ultrapassar ou inverter o jogo (ver lib/game/playIntel)
            const mates = all.filter((s) => s.side === h.side && s.key !== h.key && s.pos !== 'GK');
            if (amb === 'recomeco') {
              const back = mates.filter((s) => (s.x - h.x) * d < -20 && ['LB', 'RB', 'CM'].includes(s.pos)).sort((a, b) => dist(a, h) - dist(b, h))[0];
              if (back) {
                recordPass(intelRef.current, h.key, back.key);
                st.queue.push({ kind: 'pass', to: { slot: back.key }, dur: passDur(dist(h, back)), ambient: true, caption: `${h.name} recua para ${back.name} e reorganiza a jogada` });
              }
            } else if (amb === 'inversao') {
              const far = mates.filter((s) => (s.y < MID_Y) !== (h.y < MID_Y) && (s.x - h.x) * d > -40).sort((a, b) => nearestOpp(all, h.side, b).d - nearestOpp(all, h.side, a).d)[0];
              if (far) {
                recordPass(intelRef.current, h.key, far.key);
                st.queue.push({ kind: 'pass', to: { slot: far.key }, dur: passDur(dist(h, far)) + 140, ambient: true, arc: 16, caption: `${h.name} inverte o jogo para ${far.name}` });
              }
            } else {
              const over = mates.filter((s) => (s.x - h.x) * d < -15 && (s.y < MID_Y) === (h.y < MID_Y) && dist(s, h) < 260).sort((a, b) => dist(a, h) - dist(b, h))[0];
              if (over) {
                const outward = h.y < MID_Y ? -1 : 1;
                recordPass(intelRef.current, h.key, over.key);
                st.queue.push({
                  kind: 'carry',
                  to: { x: clamp(h.x + d * rand(40, 70), FX0 + 30, FX1 - 30), y: clamp(h.y - outward * rand(18, 34), FY0 + 30, FY1 - 30) },
                  dur: 900,
                  ambient: true,
                  setup: [{ key: over.key, x: clamp(h.x + d * rand(90, 130), FX0 + 30, FX1 - 30), y: clamp(h.y + outward * rand(6, 22), FY0 + 25, FY1 - 25), speed: 1.8 }],
                  caption: `${over.name} ultrapassa ${h.name}`,
                });
                st.queue.push({ kind: 'pass', to: { slot: over.key }, dur: 480, ambient: true });
              }
            }
          } else if (
            h.pos !== 'GK' &&
            toGoal > 70 &&
            aheadOpp(all, h) &&
            Math.random() < 0.6
          ) {
            const opp = aheadOpp(all, h) as Slot;
            st.queue.push(...dribbleSteps(h, opp, true, false));
          } else if (h.pos !== 'GK' && toGoal > 190 && near.d > 42 && Math.random() < 0.55) {
            st.queue.push({
              kind: 'carry',
              to: {
                x: clamp(h.x + d * rand(45, 95), FX0 + 30, FX1 - 30),
                y: clamp(h.y + clamp((MID_Y - h.y) * 0.3, -40, 40) + rand(-28, 28), FY0 + 30, FY1 - 30),
              },
              dur: rand(750, 1400),
              ambient: true,
            });
          } else {
            // Cruzamento: quem está aberto perto da área levanta a bola para o centroavante
            const cf = all.find((s) => s.side === h.side && s.pos === 'CF' && s.key !== h.key);
            const cross =
              !!cf && ['LF', 'RF', 'LB', 'RB'].includes(h.pos) && toGoal < 240 && toGoal > 40 && Math.abs(h.y - MID_Y) > 95 && Math.random() < 0.55;
            if (cross && cf) {
              st.queue.push({ kind: 'pass', to: { slot: cf.key }, dur: 640, ambient: true, arc: 12, caption: `${h.name} cruza para ${cf.name}` });
            } else {
              const hStyle = stylesRef.current?.[h.side]?.[h.pos] as Style | undefined;
              const r = choosePass(h, all, (cand, fwd) => passBias(intelRef.current, h.key, cand.key) + passTaste({ name: h.name, ovr: h.ovr, style: hStyle }, fwd) + uu * clamp(fwd, -1.5, 1.5) * 0.35);
              if (r) recordPass(intelRef.current, h.key, r.key);
              if (r) {
                const dd = dist(h, r);
                const long = dd > 230;
                const through = !long && (r.x - h.x) * d > 120 && nearestOpp(all, h.side, r).d > 60;
                st.queue.push({
                  kind: 'pass',
                  to: { slot: r.key },
                  dur: passDur(dd) + (long ? 140 : 0),
                  ambient: true,
                  arc: long ? 16 : through ? 8 : 0,
                  caption:
                    long && Math.abs(r.y - h.y) > 170
                      ? `${h.name} inverte o jogo para ${r.name}`
                      : through
                        ? `${h.name} lança ${r.name} em profundidade`
                        : undefined,
                });
              }
            }
          }
        }
        st.ambientAt = now + rand(120, 420);
      }

      // Corridas sem a bola: atacantes e laterais aparecem em espaços à frente
      if (!celebrating && st.holder && now >= st.runAt) {
        const h = get(st.holder);
        if (h) {
          const d = dirOf(h.side);
          const goalX = d > 0 ? FX1 : FX0;
          const cands = all.filter((s) => s.side === h.side && s.key !== h.key && s.pos !== 'GK');
          const n = Math.random() < 0.4 ? 2 : 1;
          for (let k = 0; k < n && cands.length; k += 1) {
            const pool = cands.filter((c) => FORWARDS.includes(c.pos));
            const r = Math.random() < 0.75 && pool.length ? pick(pool) : pick(cands);
            cands.splice(cands.indexOf(r), 1);
            const rawX = h.x + d * rand(70, 150);
            const tx = d > 0 ? Math.min(rawX, goalX - 70) : Math.max(rawX, goalX + 70);
            st.overrides[r.key] = {
              x: clamp(tx, FX0 + 30, FX1 - 30),
              y: clamp(r.y + rand(-70, 70), FY0 + 25, FY1 - 25),
              until: now + rand(1100, 1800),
              speed: 1.1,
            };
          }
        }
        st.runAt = now + rand(1300, 2400);
      }

      // Quem pressiona a bola: o defensor mais perto de quem a tem
      const holderSlot = st.holder ? get(st.holder) : undefined;
      const possSide: Side = holderSlot ? holderSlot.side : st.poss;
      const ref: Point = holderSlot ?? { x: st.ballX, y: st.ballY };
      let presserKey = '';
      let presserDist = Infinity;
      for (const s of all) {
        if (s.side === possSide || s.pos === 'GK') continue;
        const dd = dist(s, ref);
        if (dd < presserDist) {
          presserDist = dd;
          presserKey = s.key;
        }
      }

      // Cobertura: o segundo defensor mais perto fica atrás do que pressiona, do lado do centro (pressão coordenada)
      let coverKey = '';
      if (holderSlot && presserKey && presserDist < 240) {
        let cd = Infinity;
        for (const s of all) {
          if (s.side === possSide || s.pos === 'GK' || s.key === presserKey) continue;
          const dd = dist(s, ref);
          if (dd < cd && dd < 300) {
            cd = dd;
            coverKey = s.key;
          }
        }
      }
      // Adaptação: o time que defende desloca a marcação para a região por onde o adversário vem construindo (só o que já viu)
      const adaptShift = holderSlot && animOn('ia.adapta') ? heatShift(heatRef.current[possSide], now) : 0;
      if (Math.abs(adaptShift) > 0.35 && now - adaptLog.current[otherSide(possSide)] > 12000) {
        adaptLog.current[otherSide(possSide)] = now;
        countUse('ia.adapta');
        logDecision(otherSide(possSide) === 'user' ? club.abbreviation : opponent.abbreviation, 'adaptação', `adversário insiste pelo ${adaptShift < 0 ? 'lado de cima' : adaptShift > 0 ? 'lado de baixo' : 'centro'}: marcação desloca (${adaptShift.toFixed(2)})`);
      }
      const urgSide: Record<Side, number> = { user: urgOf('user', now), bot: urgOf('bot', now) };
      // Decide para onde cada jogador quer ir e se move com velocidade e aceleração
      all.forEach((s, i) => {
        const d = dirOf(s.side);
        const ov = st.overrides[s.key];
        const c = st.celebrate;
        let tx = s.x;
        let ty = s.y;
        let speedMul = 0.8;

        if (now > s.jitterAt) {
          s.jx = rand(-9, 9);
          s.jy = rand(-9, 9);
          s.jitterAt = now + rand(700, 1500);
        }

        if (c && s.side === c.side && s.pos !== 'GK') {
          const a = get(c.actor);
          if (a) {
            if (a.key === s.key) {
              if (c.run) {
                tx = c.run.x;
                ty = c.run.y;
                speedMul = 1.25;
              } else speedMul = 0.2;
            } else {
              tx = a.x + Math.cos(i * 2.1) * 34;
              ty = a.y + Math.sin(i * 2.1) * 34;
              speedMul = 1.1;
            }
          }
        } else if (st.kickoff) {
          // Formação de saída de bola: cada um volta para o seu lugar; o time que sai tem o CM no centro
          const kicking = st.kickoff.side === s.side;
          tx = s.kick.x;
          ty = s.kick.y;
          if (kicking && s.pos === 'CF') {
            tx = MID_X - d * 12;
            ty = MID_Y;
          }
          speedMul = 3;
        } else if (ov && ov.until > now) {
          tx = ov.x;
          ty = ov.y;
          speedMul = ov.speed ?? 1;
        } else if (s.pos === 'GK') {
          // Goleiro fica entre a bola e o gol e sai um pouco quando a bola chega perto
          const goalLineX = d > 0 ? FX0 : FX1;
          // Goleiro líbero (função/foco) sai mais da área; o tradicional fica colado na linha
          const gk = shapesRef.current?.[s.side]?.GK;
          const off = clamp(Math.abs(st.ballX - goalLineX) * 0.1 * (gk?.follow ?? 1) + (gk ? gk.dDepth * (FX1 - FX0) : 0), 16, gk ? 96 : 52);
          tx = goalLineX + d * off;
          ty = MID_Y + clamp((st.ballY - MID_Y) * 0.38, -46, 46);
          speedMul = 0.9;
        } else if (st.holder === s.key) {
          tx = s.x + d * 14;
          speedMul = 0.5;
        } else {
          const inPoss = possSide === s.side;
          const prog = d > 0 ? (st.ballX - FX0) / (FX1 - FX0) : (FX1 - st.ballX) / (FX1 - FX0);
          const isFwd = FORWARDS.includes(s.pos);
          // Ordem do técnico (só no time do usuário): sobe a linha, fecha atrás ou abre o time nas pontas
          const ord = s.side === 'user' ? orderRef.current : null;
          const wide = s.pos === 'LB' || s.pos === 'RB' || s.pos === 'LF' || s.pos === 'RF';
          const ordDepth = (ord === 'pressionar' ? 0.09 : ord === 'recuar' ? -0.12 : ord === 'pontas' && isFwd && inPoss ? 0.03 : 0) + urgSide[s.side] * (isFwd ? 0.05 : 0.025);
          // Função e foco: o mapa de atuação mexe na altura, na largura e em quanto o jogador acompanha a bola
          const rs = shapesRef.current?.[s.side]?.[s.pos];
          const f = clamp(
            BASE[s.pos][0] + (rs?.dDepth ?? 0) + (prog - 0.5) * (inPoss ? 0.46 : 0.3) * SHAPE_FACTOR[s.pos] * (rs?.follow ?? 1) + (isFwd ? (inPoss ? 0.04 : -0.04) : 0) + ordDepth,
            0.1,
            0.9,
          );
          const ballG = s.side === 'user' ? (st.ballY - FY0) / (FY1 - FY0) : 1 - (st.ballY - FY0) / (FY1 - FY0);
          const g0 = clamp(BASE[s.pos][1] + (rs?.dLat ?? 0), 0.05, 0.95);
          let g = clamp(inPoss ? 0.5 + (g0 - 0.5) * 1.18 : g0 + (ballG - g0) * 0.22, 0.07, 0.93);
          if (ord === 'pontas' && wide) g = clamp(0.5 + (g - 0.5) * 1.45, 0.04, 0.96);
          else if (ord === 'pontas' && s.pos === 'CM') g = clamp(0.5 + (g - 0.5) * 0.6, 0.2, 0.8);
          else if (ord === 'recuar') g = 0.5 + (g - 0.5) * 0.72;
          const shape = toPoint(s.side, f, g);
          tx = shape.x + s.jx;
          ty = shape.y + s.jy;

          if (inPoss) {
            if (s.pos === 'CM' && holderSlot) {
              // Meio-campista oferece opção de passe atrás da bola, do lado com mais espaço
              tx = (tx + holderSlot.x - d * 55) / 2;
              ty = (ty + holderSlot.y + (Math.sign(MID_Y - holderSlot.y) || 1) * 46) / 2;
            }
          } else if (s.key === presserKey && presserDist < (ord === 'pressionar' ? 420 : 260)) {
            tx = ref.x - d * 16;
            ty = ref.y;
            speedMul = ord === 'pressionar' ? 1.28 : 1.12;
          } else if (s.key === coverKey && holderSlot && animOn('def.cobertura')) {
            // Cobertura defensiva: atrás do companheiro que pressiona, fechando o lado do gol
            tx = ref.x - d * 62;
            ty = ref.y + (MID_Y - ref.y) * 0.35;
            speedMul = 1.05;
            if (gaitRef.current[s.key]?.gait !== 'parado' && now - (coverUse.current[s.key] ?? 0) > 2500) {
              coverUse.current[s.key] = now;
              countUse('def.cobertura');
            }
          } else {
            const m = get(`${otherSide(s.side)}-${MARK[s.pos]}`);
            if (m) {
              tx = lerp(tx, m.x - d * 28, 0.6);
              ty = lerp(ty, m.y, 0.6);
              // Fechamento da linha de passe: o marcador se coloca entre a bola e o jogador que marca
              if (holderSlot && m.key !== holderSlot.key && animOn('def.linha')) {
                const dm = dist(holderSlot, m);
                if (dm > 70 && dm < 340) {
                  tx = lerp(tx, lerp(holderSlot.x, m.x, 0.58) - d * 6, 0.5);
                  ty = lerp(ty, lerp(holderSlot.y, m.y, 0.58), 0.5);
                }
              }
            }
            tx = lerp(tx, st.ballX, 0.12);
            ty = lerp(ty, st.ballY, 0.12);
            if (adaptShift) ty = clamp(ty + adaptShift * 48, FY0 + 20, FY1 - 20);
            // Proteção da área e recuo: com a bola perto do gol, a defesa fecha o centro e recua
            const ownGX = d > 0 ? FX0 : FX1;
            if ((s.pos === 'LB' || s.pos === 'RB' || s.pos === 'CM') && Math.abs(st.ballX - ownGX) < 240 && animOn('def.area')) {
              tx = lerp(tx, ownGX + d * 92, 0.4);
              ty = lerp(ty, MID_Y + (st.ballY - MID_Y) * 0.4, 0.4);
            }
          }
        }

        // Cansado corre menos (App calcula `slow` pelo fôlego)
        const tired = workRefLocal.current?.current.slow[s.key] ?? 0;
        const maxV = s.maxSpeed * speedMul * (1 - tired);
        const dx = tx - s.x;
        const dy = ty - s.y;
        const dd = Math.hypot(dx, dy);
        const want = Math.min(maxV, dd * 2.8);
        const wvx = dd > 0.5 ? (dx / dd) * want : 0;
        const wvy = dd > 0.5 ? (dy / dd) * want : 0;
        const a = 1 - Math.exp(-dt / 130);
        s.vx += (wvx - s.vx) * a;
        s.vy += (wvy - s.vy) * a;
        s.x += (s.vx * dt) / 1000;
        s.y += (s.vy * dt) / 1000;
        // Esforço: distância corrida (sprint conta o dobro, conduzir a bola conta 1,5x). Não conta saída de bola nem comemoração.
        const ledger = workRefLocal.current?.current.effort;
        if (ledger && !st.kickoff && !celebrating) {
          const speed = Math.hypot(s.vx, s.vy);
          const weight = (speed > s.maxSpeed * 0.75 ? 2 : 1) * (st.holder === s.key ? 1.5 : 1);
          ledger[s.key] = (ledger[s.key] ?? 0) + ((speed * dt) / 1000) * weight;
        }
      });

      // Evita que as bolinhas fiquem uma em cima da outra
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          const a = all[i];
          const b = all[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < 27 && d > 0.01) {
            const push = (27 - d) / 2;
            a.x -= (dx / d) * push;
            a.y -= (dy / d) * push;
            b.x += (dx / d) * push;
            b.y += (dy / d) * push;
          }
        }
      }
      all.forEach((s) => {
        s.x = clamp(s.x, FX0 + 8, FX1 - 8);
        s.y = clamp(s.y, FY0 + 8, FY1 - 8);
        // Movimento do disco: marcha pelo ritmo, direção e giro; o disco estica ao longo da corrida, deixa rastro e mostra a direção.
        // Chute, passe, domínio e defesa aplicam uma pose curta (recuo, avanço, amortecimento) no eixo da bola.
        let tf = '';
        if (!liteRef.current && !st.kickoff) {
          const gs = (gaitRef.current[s.key] = gaitRef.current[s.key] ?? newGaitState());
          const defending = st.poss !== s.side && s.pos !== 'GK';
          const r = stepGait(gs, { vx: s.vx, vy: s.vy, maxSpeed: s.maxSpeed, dt, now, watch: defending ? { x: st.ballX, y: st.ballY, px: s.x, py: s.y } : undefined, speedMul: animSpeed(`loc.${gs.gait}`) }, (g) => animOn(`loc.${g}`));
          if (r.changed) countUse(`loc.${r.gait}`);
          const pz = poseRef.current[s.key];
          const pp = pz ? poseOf(pz.kind, now - pz.t0, pz.pow) : null;
          if (pz && !pp) delete poseRef.current[s.key];
          const bob = 1 + r.fx.bob * Math.abs(Math.sin(gs.phase));
          tf = pp && pz ? axisTransform(s.x, s.y, pz.ang, pp.dx, pp.sa, pp.sp) : axisTransform(s.x, s.y, gs.head, 0, r.fx.sx * bob, r.fx.sy * bob);
          const fg = fxNodes.current[s.key];
          if (fg) {
            const holding = st.holder === s.key;
            const showChev = holding ? gs.ratio > 0.08 : r.gait === 'arrancada' || r.gait === 'direcao';
            const tr = r.fx.trail * Math.min(1, gs.ratio * 1.1);
            fg.setAttribute('opacity', tr > 0.05 || showChev ? '1' : '0');
            if (tr > 0.05 || showChev) {
              const ux = Math.cos(gs.head), uy = Math.sin(gs.head);
              const g1 = fg.children[0] as SVGElement | undefined, g2 = fg.children[1] as SVGElement | undefined, chev = fg.children[2] as SVGElement | undefined;
              g1?.setAttribute('cx', (-ux * 9).toFixed(1)); g1?.setAttribute('cy', (-uy * 9).toFixed(1)); g1?.setAttribute('opacity', (0.26 * tr).toFixed(2));
              g2?.setAttribute('cx', (-ux * 18).toFixed(1)); g2?.setAttribute('cy', (-uy * 18).toFixed(1)); g2?.setAttribute('opacity', (0.14 * tr).toFixed(2));
              chev?.setAttribute('transform', `rotate(${((gs.head * 180) / Math.PI).toFixed(0)})`);
              chev?.setAttribute('opacity', showChev ? (holding ? '0.7' : '0.9') : '0');
            }
          }
        }
        nodes.current[s.key]?.setAttribute('transform', tf || `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`);
      });

      // Animação do desarme (carrinho ou bote em pé)
      {
        const fx = tackleFx.current;
        const hideFx = () => {
          bootNode.current?.setAttribute('display', 'none');
          impactNode.current?.setAttribute('display', 'none');
          tkSnap.current = null;
        };
        if (!fx) {
          if (tkSnap.current) hideFx();
        } else {
          const age = now - fx.t0;
          const post = fx.contact ? now - fx.contact : -1;
          const tail = fx.slide ? 560 : 380;
          if (post >= tail || (!fx.contact && age > fx.span + 900)) {
            tackleFx.current = null;
            hideFx();
          } else {
            const dEl = all.find((x) => x.key === fx.def);
            const hEl = all.find((x) => x.key === fx.hold);
            if (dEl && hEl) {
              const a = clamp(age / fx.span, 0, 1);
              const b = post < 0 ? 0 : clamp(post / tail, 0, 1);
              const ease = (u: number) => u * u * (3 - 2 * u);
              const peak = fx.slide ? 0.42 : 0.1;
              let stretch: number;
              if (post < 0) stretch = fx.slide ? peak * ease(clamp((a - 0.35) / 0.65, 0, 1)) : peak * a;
              else stretch = fx.slide ? (b < 0.55 ? peak : peak * (1 - ease((b - 0.55) / 0.45))) : peak * (1 - b);
              const angDeg = (Math.atan2(fx.ay, fx.ax) * 180) / Math.PI;
              const lean = stretch * (fx.slide ? 9 : 4);
              nodes.current[dEl.key]?.setAttribute(
                'transform',
                `translate(${(dEl.x + fx.ax * lean).toFixed(1)} ${(dEl.y + fx.ay * lean).toFixed(1)}) rotate(${angDeg.toFixed(1)}) scale(${(1 + stretch).toFixed(3)} ${(1 - stretch * 0.5).toFixed(3)}) rotate(${(-angDeg).toFixed(1)})`,
              );
              // Quem foi desarmado tropeça e perde o equilíbrio; quem escapou dá um pulinho por cima
              let hrot = 0;
              let hsc = 1;
              let knock = 0;
              if (post >= 0) {
                if (fx.win) {
                  hrot = Math.sin(b * Math.PI * 2.4) * (fx.slide ? 26 : 13) * (1 - b);
                  hsc = 1 + 0.1 * Math.sin(b * Math.PI);
                  knock = Math.sin(Math.min(1, b * 1.4) * Math.PI) * (fx.slide ? 7 : 4);
                } else {
                  hsc = 1 + 0.3 * Math.sin(clamp(b / 0.7, 0, 1) * Math.PI);
                  hrot = -8 * Math.sin(b * Math.PI);
                }
                nodes.current[hEl.key]?.setAttribute(
                  'transform',
                  `translate(${(hEl.x + fx.ax * knock).toFixed(1)} ${(hEl.y + fx.ay * knock).toFixed(1)}) rotate(${hrot.toFixed(1)}) scale(${hsc.toFixed(3)})`,
                );
              }
              // Bota esticada em direção à bola
              const reach = post < 0 ? clamp((a - 0.5) * 2, 0, 1) : clamp(1 - b / 0.5, 0, 1);
              if (reach > 0.02) {
                const off = 13 + reach * (fx.slide ? 12 : 8);
                bootNode.current?.setAttribute('transform', `translate(${(dEl.x + fx.ax * off).toFixed(1)} ${(dEl.y + fx.ay * off).toFixed(1)}) rotate(${angDeg.toFixed(1)})`);
                bootNode.current?.setAttribute('display', 'inline');
              } else bootNode.current?.setAttribute('display', 'none');
              // Pisca do impacto
              const im = impactNode.current;
              if (im && !liteRef.current && post >= 0 && b < 0.4) {
                const u = b / 0.4;
                im.setAttribute('cx', ((dEl.x + hEl.x) / 2).toFixed(1));
                im.setAttribute('cy', ((dEl.y + hEl.y) / 2).toFixed(1));
                im.setAttribute('r', (5 + u * 20).toFixed(1));
                im.setAttribute('opacity', (0.8 * (1 - u)).toFixed(2));
                im.setAttribute('display', 'inline');
              } else im?.setAttribute('display', 'none');
              tkSnap.current = { def: fx.def, hold: fx.hold, stretch, hrot, hsc };
            }
          }
        }
      }

      // Finta e arrancada do drible: corpo balança, marcador cai no engano; condução tem leve balanço de passada
      {
        const df = dribFx.current;
        const carrying = st.active && st.active.step.kind === 'carry' && !tackleFx.current;
        if (df && !(st.active && st.active.step.dribble)) dribFx.current = null;
        if (df && carrying && st.active && st.active.step.dribble) {
          const cEl = all.find((x) => x.key === df.key);
          const oEl = all.find((x) => x.key === df.opp);
          const pr = clamp((now - df.t0) / df.dur, 0, 1);
          if (cEl) {
            const fx = dribbleBody(df.move, df.phase, pr, df.sg);
            const { rot, sx, sy, shift } = fx;
            nodes.current[cEl.key]?.setAttribute('transform', `translate(${cEl.x.toFixed(1)} ${(cEl.y + shift).toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`);
            if (!liteRef.current && df.phase === 'burst' && pr < 0.6 && Math.random() < 0.5) {
              const i = markNext.current % MARK_POOL;
              markNext.current += 1;
              const node = markNodes.current[i];
              if (node) {
                node.setAttribute('d', `M${(cEl.x - df.dx * 14).toFixed(1)} ${(cEl.y + 11).toFixed(1)} L${cEl.x.toFixed(1)} ${(cEl.y + 11).toFixed(1)}`);
                node.setAttribute('stroke-width', '3.2');
                markData.current[i] = { born: now, base: 0.32 };
              }
            }
          }
          if (oEl) {
            // Marcador vai para o lado errado e fica desequilibrado; se o drible falha, ele dá o bote
            const fakePhase = df.phase === 'fake';
            const sway = df.win ? (fakePhase ? Math.sin(pr * Math.PI) * 16 * df.sg : 16 * df.sg * (1 - pr) + Math.sin(pr * Math.PI * 3) * 4) : -Math.sin(pr * Math.PI) * 6 * df.sg;
            const dip = df.win ? 1 + 0.1 * (fakePhase ? Math.sin(pr * Math.PI) : 1 - pr) : 1;
            const bite = df.win && fakePhase ? df.sg * Math.sin(pr * Math.PI) * 5 : 0;
            const swayK = dribbleBody(df.move, df.phase, pr, df.sg).oppSway;
            nodes.current[oEl.key]?.setAttribute('transform', `translate(${oEl.x.toFixed(1)} ${(oEl.y + bite * swayK).toFixed(1)}) rotate(${(sway * swayK).toFixed(1)}) scale(${dip.toFixed(3)})`);
          }
          tkSnap.current = cEl && oEl ? { def: df.opp, hold: df.key, stretch: 0, hrot: dribbleBody(df.move, df.phase, pr, df.sg).rot, hsc: 1 + 0.12 * Math.sin(pr * Math.PI) } : null;
        } else if (!tackleFx.current && tkSnap.current && tkSnap.current.stretch === 0) {
          tkSnap.current = null;
        } else if (carrying && st.holder && !(st.active && st.active.step.dribble)) {
          // Condução normal: o corpo balança de leve a cada passada
          const hEl = all.find((x) => x.key === st.holder);
          if (hEl && Math.hypot(hEl.vx, hEl.vy) > 20) {
            const ph = now / 120 + hEl.x * 0.05;
            nodes.current[hEl.key]?.setAttribute('transform', `translate(${hEl.x.toFixed(1)} ${(hEl.y + Math.sin(ph * 2) * 0.9).toFixed(1)}) rotate(${(Math.sin(ph) * 4).toFixed(1)}) scale(${(1 + Math.abs(Math.sin(ph)) * 0.035).toFixed(3)})`);
          }
        }
      }

      // Marcas de chuteira e poeira: curvas fechadas e carrinhos arranham o gramado; onde ele já está gasto, sobe poeira
      if (!liteRef.current) {
        const live = !(endHalfRef && endHalfRef.current) && !(deadBallRef && deadBallRef.current);
        const worn = (px: number, py: number) => {
          const cx = Math.floor((px - FX0) / WEAR_CELL);
          const cy = Math.floor((py - FY0) / WEAR_CELL);
          if (cx < 0 || cy < 0 || cx >= WEAR_COLS || cy >= WEAR_ROWS) return 0;
          const ix = cy * WEAR_COLS + cx;
          return wear.current.heat[ix] * WEAR_PER_SEC * WEAR_CELLS[ix].touch;
        };
        const puff = (px: number, py: number, vx: number, vy: number, count: number) => {
          const soaked = rainRef.current && puddlesRef.current.some((q, qi) => (qi < 8 || wetRef.current > 0.55) && Math.abs(q.x - px) < q.rx * (1 + wetRef.current * 0.6) + 8 && Math.abs(q.y - py) < q.ry * (1 + wetRef.current * 0.6) + 10);
          if (worn(px, py) < 0.18 && !soaked) return;
          for (let k = 0; k < count; k += 1) {
            const d = dustData.current[dustNext.current % DUST_POOL];
            dustNext.current += 1;
            d.on = true;
            d.born = now + k * 40;
            d.x = px + (Math.random() - 0.5) * 8;
            d.y = py + 8 + (Math.random() - 0.5) * 4;
            d.dx = -vx * 0.01 + (Math.random() - 0.5) * 1.4;
            d.dy = -vy * 0.006 + (Math.random() - 0.5) * 0.8;
          }
        };
        const mark = (d: string, width: number, base: number) => {
          const i = markNext.current % MARK_POOL;
          markNext.current += 1;
          const node = markNodes.current[i];
          if (!node) return;
          node.setAttribute('d', d);
          const soak = rainRef.current ? wetRef.current : 0;
          node.setAttribute('stroke-width', (width * (1 + soak * 0.55)).toFixed(1));
          markData.current[i] = { born: now, base: Math.min(0.95, base * (1 + soak * 0.9)) };
        };
        const mo = motion.current;
        for (const x of all) {
          let m = mo[x.key];
          if (!m) m = mo[x.key] = { x: x.x, y: x.y, vx: 0, vy: 0, hx: 0, hy: 0, hAt: now, cool: 0 };
          if (dt > 0) {
            let ivx = ((x.x - m.x) / dt) * 1000;
            let ivy = ((x.y - m.y) / dt) * 1000;
            if (Math.hypot(ivx, ivy) > 700) {
              ivx = 0;
              ivy = 0; // teleporte (reposicionamento), não corrida
            }
            m.vx += (ivx - m.vx) * 0.25;
            m.vy += (ivy - m.vy) * 0.25;
          }
          m.x = x.x;
          m.y = x.y;
          if (live && now - m.hAt >= 160) {
            const sp = Math.hypot(m.vx, m.vy);
            const hsp = Math.hypot(m.hx, m.hy);
            if (sp > 85 && hsp > 85 && now > m.cool && (m.vx * m.hx + m.vy * m.hy) / (sp * hsp) < 0.25) {
              const bx = x.x - (m.hx / hsp) * 10;
              const by = x.y - (m.hy / hsp) * 10;
              const ex = x.x + (m.vx / sp) * 7;
              const ey = x.y + (m.vy / sp) * 7;
              mark(`M${bx.toFixed(1)} ${(by + 10).toFixed(1)} Q${x.x.toFixed(1)} ${(x.y + 12).toFixed(1)} ${ex.toFixed(1)} ${(ey + 10).toFixed(1)}`, 2.4, 0.42);
              puff(x.x, x.y, m.vx, m.vy, 2);
              m.cool = now + 700;
            }
            m.hx = m.vx;
            m.hy = m.vy;
            m.hAt = now;
          }
          const sl = slideRef.current[x.key];
          if (sl && now >= sl.until) {
            delete slideRef.current[x.key];
            mark(`M${sl.fx.toFixed(1)} ${(sl.fy + 11).toFixed(1)} L${x.x.toFixed(1)} ${(x.y + 11).toFixed(1)}`, 4.6, 0.5);
            puff(sl.fx, sl.fy, 0, 0, 2);
            puff(x.x, x.y, m.vx, m.vy, 3);
          }
        }
        // Atualiza o desenho: as marcas desbotam em ~45 s e a poeira sobe e some em ~0,9 s
        if (now - markFade.current >= 250) {
          markFade.current = now;
          markData.current.forEach((d, i) => {
            if (!d.base) return;
            const age = now - d.born;
            const life = 45000 + (rainRef.current ? wetRef.current * 30000 : 0);
            const op = age > life ? 0 : d.base * (1 - age / life);
            markNodes.current[i]?.setAttribute('opacity', op.toFixed(3));
            if (!op) d.base = 0;
          });
        }
        dustData.current.forEach((d, i) => {
          const node = dustNodes.current[i];
          if (!node || !d.on) return;
          const a = (now - d.born) / 900;
          if (a < 0) return;
          if (a >= 1) {
            d.on = false;
            node.setAttribute('display', 'none');
            return;
          }
          node.setAttribute('display', 'inline');
          node.setAttribute('cx', (d.x + d.dx * a * 10).toFixed(1));
          node.setAttribute('cy', (d.y + d.dy * a * 10 - a * 6).toFixed(1));
          node.setAttribute('r', (3 + a * 8).toFixed(1));
          node.setAttribute('opacity', (0.42 * (1 - a) * (1 - a * 0.3)).toFixed(3));
        });
      }
      // Bola, anel dourado e nome de quem está com a bola
      if (lift === 0 && bounce.current.h > 0) {
        const t = (now - bounce.current.start) / 1000;
        const hops = [0.34, 0.21, 0.13];
        let acc = 0;
        let value = 0;
        let alive = false;
        for (let i = 0; i < hops.length; i += 1) {
          if (t < acc + hops[i]) {
            const u = (t - acc) / hops[i];
            value = bounce.current.h * Math.pow(0.36, i) * 4 * u * (1 - u);
            alive = true;
            break;
          }
          acc += hops[i];
        }
        if (alive) lift = value;
        else bounce.current.h = 0;
      }
      // A sombra fica no chão: quanto mais alta a bola, menor, mais clara e mais deslocada
      ballShadow.current?.setAttribute('transform', `translate(${(lift * 0.45).toFixed(1)} 0) scale(${Math.max(0.55, 1 - lift / 55).toFixed(2)} 1)`);
      ballShadow.current?.setAttribute('opacity', Math.max(0.35, 1 - lift / 40).toFixed(2));
      ballNode.current?.setAttribute('transform', `translate(${st.ballX.toFixed(1)} ${st.ballY.toFixed(1)})`);
      // A bola gira conforme rola: o ângulo avança com a distância percorrida (~8° por pixel) para o lado em que ela anda
      const sp = spin.current;
      const travelled = Math.hypot(st.ballX - sp.x, st.ballY - sp.y);
      if (travelled < 60) sp.angle += (st.ballX - sp.x >= 0 ? 1 : -1) * travelled * 8;
      sp.x = st.ballX;
      sp.y = st.ballY;
      spinNode.current?.setAttribute('transform', `rotate(${(sp.angle % 360).toFixed(1)})`);
      liftNode.current?.setAttribute('transform', `translate(0 ${(-lift).toFixed(1)}) scale(${(1 + lift / 50).toFixed(2)})`);
      // Rastro da bola quando ela anda rápido (chutes e passes)
      const pts = trailPts.current;
      pts.push({ x: st.ballX, y: st.ballY - lift });
      if (pts.length > 14) pts.shift();
      // Mapa da partida: amostra a posição de todos os jogadores a cada 0,2 s (fora do intervalo)
      if (mapRefRef.current && now - lastMapAt.current >= 200 && !(endHalfRef && endHalfRef.current)) {
        lastMapAt.current = now;
        mapRefRef.current.current ??= createMatchMap();
        recordMapSample(
          mapRefRef.current.current,
          all.map((x) => ({ key: x.key, side: x.side, pos: x.pos, name: x.name, x: x.x, y: x.y })),
          { x0: FX0, x1: FX1, y0: FY0, y1: FY1 },
        );
      }
      // Desgaste do gramado: soma o tempo que cada jogador passa em cada quadradinho e atualiza o desenho ~2x por segundo
      if (!(endHalfRef && endHalfRef.current) && !(deadBallRef && deadBallRef.current)) {
        const w = wear.current;
        const secs = dt / 1000;
        for (const x of all) {
          const cx = Math.floor((x.x - FX0) / WEAR_CELL);
          const cy = Math.floor((x.y - FY0) / WEAR_CELL);
          if (cx < 0 || cy < 0 || cx >= WEAR_COLS || cy >= WEAR_ROWS) continue;
          w.heat[cy * WEAR_COLS + cx] += secs;
          w.total += secs;
        }
      }
      if (now - wear.current.at >= 500) {
        const w = wear.current;
        w.at = now;
        for (let i = 0; i < w.heat.length; i += 1) {
          const wearLevel = w.heat[i] * WEAR_PER_SEC * WEAR_CELLS[i].touch;
          const thin = Math.min(0.5, wearLevel * 0.8);
          const dirt = Math.max(0, Math.min(0.55, (wearLevel - WEAR_CELLS[i].thr) * 0.9));
          if (Math.abs(thin - w.shown[i]) >= 0.012) {
            w.shown[i] = thin;
            wearNodes.current[i]?.setAttribute('opacity', thin.toFixed(3));
          }
          if (Math.abs(dirt - w.shownB[i]) >= 0.012) {
            w.shownB[i] = dirt;
            wearDirt.current[i]?.setAttribute('opacity', dirt.toFixed(3));
          }
        }
        const progress = Math.min(1, w.total / WEAR_FULL_TOTAL);
        // As linhas brancas desbotam e as marcas de pênalti/meio ganham terra
        wearLines.current?.setAttribute('opacity', (1 - 0.3 * progress).toFixed(3));
        wearSpots.current?.setAttribute('opacity', (progress * 0.75).toFixed(3));
      }
      // Câmeras 3D da partida: entrega as posições deste quadro (reaproveita o mesmo objeto, sem criar lixo)
      if (liveRefRef.current) {
        let snap = liveRefRef.current.current;
        if (!snap || snap.sides.length !== all.length) {
          snap = liveRefRef.current.current = {
            ball: [0, 0, 0],
            pts: new Array<number>(all.length * 2).fill(0),
            sides: all.map((x) => x.side),
            letters: slotsRef.current.map((x) => x.name.slice(0, 1).toUpperCase()),
            keys: all.map((x) => x.key),
            holder: -1,
            frozen: false,
            fx: null,
          };
        }
        snap.ball[0] = st.ballX;
        snap.ball[1] = st.ballY;
        snap.ball[2] = lift;
        for (let n = 0; n < all.length; n += 1) {
          snap.pts[n * 2] = all[n].x;
          snap.pts[n * 2 + 1] = all[n].y;
        }
        snap.holder = st.holder ? snap.keys.indexOf(st.holder) : -1;
        snap.frozen = !!(endHalfRef && endHalfRef.current);
        const tk = tkSnap.current;
        snap.fx = tk ? { def: snap.keys.indexOf(tk.def), hold: snap.keys.indexOf(tk.hold), stretch: tk.stretch, hrot: tk.hrot, hsc: tk.hsc } : null;
        if (snap.fx && (snap.fx.def < 0 || snap.fx.hold < 0)) snap.fx = null;
      }
      // Grava a jogada (≈25 quadros por segundo, últimos 7 s) para o replay do gol
      const rc = rec.current;
      if (now - rc.last >= 40) {
        rc.last = now;
        const frame = new Array<number>(3 + all.length * 2);
        frame[0] = now;
        frame[1] = st.ballX;
        frame[2] = st.ballY - lift;
        for (let n = 0; n < all.length; n += 1) {
          frame[3 + n * 2] = all[n].x;
          frame[4 + n * 2] = all[n].y;
        }
        rc.frames.push(frame);
        while (rc.frames.length && rc.frames[0][0] < now - 7200) rc.frames.shift();
      }
      // Anéis e clarões de impacto (chute, passe forte, defesa)
      ringsRef.current.forEach((rg, i) => {
        const node = ringNodes.current[i];
        if (!node || !rg.on) return;
        const a = (now - rg.born) / rg.dur;
        if (a >= 1) { rg.on = false; node.setAttribute('opacity', '0'); return; }
        const rr = rg.r0 + (rg.r1 - rg.r0) * (1 - Math.pow(1 - a, 2));
        node.setAttribute('cx', rg.x.toFixed(1));
        node.setAttribute('cy', rg.y.toFixed(1));
        node.setAttribute('r', rr.toFixed(1));
        node.setAttribute('fill', rg.flash ? rg.color : 'none');
        node.setAttribute('stroke', rg.flash ? 'none' : rg.color);
        node.setAttribute('opacity', ((rg.flash ? 0.55 : 0.8) * (1 - a)).toFixed(2));
      });
      const prev = pts[pts.length - 2];
      const ballSpeed = prev && dt > 0 ? Math.hypot(st.ballX - prev.x, st.ballY - lift - prev.y) / dt : 0;
      for (let i = 0; i < 5; i += 1) {
        const node = trailNodes.current[i];
        if (!node) continue;
        const pt = pts[pts.length - 1 - (i + 1) * 2];
        if (pt && ballSpeed > 0.28) {
          node.setAttribute('cx', pt.x.toFixed(1));
          node.setAttribute('cy', pt.y.toFixed(1));
          node.setAttribute('opacity', (0.34 - i * 0.06).toFixed(2));
        } else node.setAttribute('opacity', '0');
      }
      // Barra de fôlego: só quando o app informa o fôlego (partida contra o bot); aparece em quem está com a bola ou muito cansado
      const staminaNow = workRefLocal.current?.current.stamina;
      if (staminaNow) {
        for (const x of all) {
          const bar = staminaBars.current[x.key];
          const value = staminaNow[x.key];
          if (!bar?.box || !bar.fill || value === undefined) continue;
          const show = st.holder === x.key || value < 45;
          bar.box.setAttribute('opacity', show ? '1' : '0');
          if (show) {
            bar.fill.setAttribute('width', (22 * Math.max(0.04, Math.min(1, value / 100))).toFixed(1));
            bar.fill.setAttribute('fill', value > 60 ? '#4ade80' : value > 35 ? '#facc15' : '#ef4444');
          }
        }
      }
      const hs = st.holder ? get(st.holder) : undefined;
      if (ringNode.current) {
        ringNode.current.style.display = hs ? '' : 'none';
        if (hs) ringNode.current.setAttribute('transform', `translate(${hs.x.toFixed(1)} ${hs.y.toFixed(1)})`);
      }
      if (nameNode.current) {
        if (hs) {
          nameNode.current.setAttribute('x', clamp(hs.x, 60, W - 60).toFixed(1));
          nameNode.current.setAttribute('y', clamp(hs.y - 33, 16, H - 8).toFixed(1));
          if (nameNode.current.textContent !== hs.name) nameNode.current.textContent = hs.name;
        } else if (nameNode.current.textContent) {
          nameNode.current.textContent = '';
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      rec.current.timers.forEach((t) => window.clearTimeout(t));
      clipTimers.current.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineColor = 'rgba(255,255,255,.55)';
  const fans = useMemo(
    () => buildFans({ user: club.primary_color, bot: opponent.primary_color }, { user: club.secondary_color, bot: opponent.secondary_color }),
    [club.primary_color, club.secondary_color, opponent.primary_color, opponent.secondary_color],
  );
  const half = (side: Side) => `pc-half pc-half-${side} ${crowd?.mood[side] ?? 'idle'}`;
  const standGeo = (top: boolean) => ({ y: top ? -STAND : H, h: STAND });
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 22,
        border: '1px solid rgba(245,184,0,.35)',
        background: '#0a2417',
        margin: '0 0 16px',
        boxShadow: '0 24px 60px rgba(0,0,0,.6), 0 0 0 4px rgba(255,255,255,.04), 0 0 40px rgba(34,197,94,.12)',
      }}
    >
      <style>{crowdCss}</style>
      <svg viewBox={`0 ${-STAND} ${W} ${H + STAND * 2}`} className={`${olaOn ? `pc-ola pc-ola-${olaOn}` : ''} ${lite ? 'pc-lite' : ''}`.trim() || undefined} style={{ display: 'block', width: '100%', height: 'auto', ['--beat' as string]: (1.35 - ((crowd?.noise ?? 55) / 100) * 0.75).toFixed(2) }} role="img" aria-label="Campo da partida">
        <defs>
          <pattern id="pc-mesh" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0 H4 M0 0 V4" stroke="#ffffff" strokeWidth={0.5} opacity={0.55} fill="none" />
          </pattern>
          <radialGradient id="pc-sh"><stop offset="0" stopColor="#000" stopOpacity="1" /><stop offset=".55" stopColor="#000" stopOpacity=".7" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
          <filter id="pc-soft" x="-30%" y="-80%" width="160%" height="260%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
          <filter id="pc-blur8" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <linearGradient id="pc-flood-x" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000" stopOpacity={0.3} />
            <stop offset="30%" stopColor="#000" stopOpacity={0.06} />
            <stop offset="50%" stopColor="#fff" stopOpacity={0.1} />
            <stop offset="70%" stopColor="#000" stopOpacity={0.06} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.3} />
          </linearGradient>
          <radialGradient id="pc-flood-c" cx="50%" cy="48%" r="60%">
            <stop offset="0%" stopColor="#fffbe6" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#fffbe6" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="pc-thin">
            <stop offset="0%" stopColor="#8a9a3c" stopOpacity={0.85} />
            <stop offset="60%" stopColor="#7b8a36" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#6f7d33" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="pc-wear">
            <stop offset="0%" stopColor="#5a4729" stopOpacity={0.95} />
            <stop offset="55%" stopColor="#4c3d24" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#43361f" stopOpacity={0} />
          </radialGradient>
          <pattern id="pc-grain" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
            <rect width="6" height="6" fill="none" />
            <rect width="1.2" height="6" fill="#ffffff" opacity="0.05" />
            <rect x="3.6" width="0.8" height="6" fill="#000000" opacity="0.06" />
          </pattern>
          <radialGradient id="pitch-vig" cx="50%" cy="50%" r="75%">
            <stop offset="55%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.5} />
          </radialGradient>
          <linearGradient id="pitch-light" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.1} />
            <stop offset="45%" stopColor="#ffffff" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.18} />
          </linearGradient>
          <linearGradient id="pc-tier" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0f1a" />
            <stop offset="100%" stopColor="#1b263b" />
          </linearGradient>
          <linearGradient id="pc-tier-b" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#0a0f1a" />
            <stop offset="100%" stopColor="#1b263b" />
          </linearGradient>
          <pattern id="pc-seat" width="24" height="16" patternUnits="userSpaceOnUse">
            <rect width="24" height="16" fill={homeTeam.primary_color} />
            {arena.seats === 'stripes' && <rect x="12" width="12" height="16" fill={homeTeam.secondary_color} />}
            {arena.seats === 'chevron' && <path d="M0 4 L12 12 L24 4 L24 8 L12 16 L0 8 Z" fill={homeTeam.secondary_color} />}
            {arena.seats === 'blocks' && <rect x="12" y="8" width="12" height="8" fill="#000" opacity={0.35} />}
            {arena.seats === 'blocks' && <rect x="0" y="0" width="12" height="8" fill="#000" opacity={0.35} />}
            {arena.seats === 'checker' && <rect x="0" y="0" width="6" height="8" fill={homeTeam.secondary_color} />}
            {arena.seats === 'checker' && <rect x="12" y="0" width="6" height="8" fill={homeTeam.secondary_color} />}
            {arena.seats === 'checker' && <rect x="6" y="8" width="6" height="8" fill={homeTeam.secondary_color} />}
            {arena.seats === 'checker' && <rect x="18" y="8" width="6" height="8" fill={homeTeam.secondary_color} />}
          </pattern>
          <pattern id="pc-mow-d" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform={`rotate(45) translate(${FX0} ${FY0})`}>
            <rect width="64" height="64" fill={arena.grassA} />
            <rect width="32" height="32" fill={arena.grassB} />
            <rect x="32" y="32" width="32" height="32" fill={arena.grassB} />
          </pattern>
          <linearGradient id="pc-roof-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#000" stopOpacity={0} />
          </linearGradient>
          <clipPath id="tok-clip">
            <circle r={12.3} />
          </clipPath>
          <linearGradient id="tok-shade" x1="0" y1="0" x2="0.55" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.12} />
            <stop offset="50%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.42} />
          </linearGradient>
          <radialGradient id="kit-gloss" cx="35%" cy="28%" r="70%">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.5} />
            <stop offset="55%" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect x={0} y={-STAND} width={W} height={H + STAND * 2} fill="#07190f" />
        {[true, false].map((top) => {
          const g = standGeo(top);
          return <rect key={`tier-${top}`} x={0} y={g.y} width={W} height={g.h} fill={top ? 'url(#pc-tier)' : 'url(#pc-tier-b)'} />;
        })}
        {/* mosaico do time da casa, setor visitante mais escuro e cobertura do estádio */}
        {[true, false].map((top) => {
          const g = standGeo(top);
          const x0 = home === 'user' ? 0 : MID_X;
          const x1 = home === 'user' ? MID_X : 0;
          return (
            <g key={`seats-${top}`} style={{ pointerEvents: 'none' }}>
              <rect x={x0} y={g.y} width={MID_X} height={g.h} fill="url(#pc-seat)" opacity={0.5} />
              <rect x={x1} y={g.y} width={MID_X} height={g.h} fill="#000" opacity={0.22} />
              {arena.roof && (
                <>
                  <rect x={0} y={top ? g.y : g.y + g.h - 28} width={W} height={28} fill={top ? 'url(#pc-roof-shade)' : 'url(#pc-roof-shade)'} transform={top ? undefined : `rotate(180 ${W / 2} ${g.y + g.h - 14})`} />
                  <rect x={0} y={top ? g.y : g.y + g.h - 7} width={W} height={7} fill="#0b0f16" />
                  <rect x={0} y={top ? g.y + 6 : g.y + g.h - 9} width={W} height={2} fill={homeTeam.primary_color} opacity={0.9} />
                  {Array.from({ length: 14 }).map((_, i) => (
                    <circle key={i} cx={26 + i * 52.5} cy={top ? g.y + 3.5 : g.y + g.h - 3.5} r={2} fill={amb.time === 'night' ? '#fff6c8' : '#9aa3b2'} opacity={amb.time === 'night' ? 0.95 : 0.6} />
                  ))}
                </>
              )}
            </g>
          );
        })}
        {/* placas de publicidade na borda do campo */}
        {[true, false].map((top) => (
          <g key={`ads-${top}`}>
            <rect x={0} y={top ? -2 : H - 8} width={W / 2} height={10} fill={club.primary_color} opacity={0.9} />
            <rect x={W / 2} y={top ? -2 : H - 8} width={W / 2} height={10} fill={opponent.primary_color} opacity={0.9} />
            {[0.12, 0.34].map((f) => (
              <text key={f} x={W * f} y={top ? 6 : H} fontSize={8} fontWeight={800} letterSpacing={2} textAnchor="middle" fill={textOn(club.primary_color)}>
                {club.abbreviation} · {club.abbreviation}
              </text>
            ))}
            {[0.66, 0.88].map((f) => (
              <text key={f} x={W * f} y={top ? 6 : H} fontSize={8} fontWeight={800} letterSpacing={2} textAnchor="middle" fill={textOn(opponent.primary_color)}>
                {opponent.abbreviation} · {opponent.abbreviation}
              </text>
            ))}
          </g>
        ))}
        {(['user', 'bot'] as Side[]).map((side) => {
          const team = side === 'user' ? club : opponent;
          return (
            <g key={`crowd-${side}`} className={half(side)}>
              {[true, false].map((top) => (
                <rect key={`glow-${top}`} className="pc-glow" x={side === 'user' ? 0 : MID_X} y={top ? -STAND : H} width={MID_X} height={STAND} fill={team.primary_color} />
              ))}
              {(() => {
                const list = fans.filter((f, idx) => f.side === side && (side === home || idx % 2 === 0) && (!lite || idx % 2 === 1 || side !== home));
                const groups: (typeof list)[] = [];
                for (let n = 0; n < list.length; n += 16) groups.push(list.slice(n, n + 16));
                return groups.map((grp, gi) => (
                  <g key={gi} className="pc-fgrp" style={{ animationDelay: `${-((gi * 0.37) % 1.2).toFixed(2)}s` }}>
                    {grp.map((f, i) => (
                      <g key={i} className="pc-fan" style={{ animationDelay: `${f.delay}s`, ['--dur' as string]: `${f.dur}s`, ['--fx' as string]: (f.x / W).toFixed(3) }}>
                        <rect x={f.x - 4.6} y={f.y + 3} width={9.2} height={10} rx={3} fill={f.body} stroke="rgba(0,0,0,.35)" strokeWidth={0.4} />
                        <circle cx={f.x} cy={f.y} r={4} fill={f.skin} />
                        <path className="pc-arms" d={`M${f.x - 4.4} ${f.y + 7} l-3 -8 M${f.x + 4.4} ${f.y + 7} l3 -8`} stroke={f.skin} strokeWidth={1.8} strokeLinecap="round" />
                      </g>
                    ))}
                  </g>
                ));
              })()}
              {[0.2, 0.5, 0.8].map((f, i) => {
                const fx = (side === 'user' ? 0 : MID_X) + MID_X * f;
                return (
                  <g key={`flag-${i}`} className="pc-flag" style={{ animationDelay: `${i * 0.3}s` }}>
                    <line x1={fx} y1={-46} x2={fx} y2={-8} stroke="#d1d5db" strokeWidth={1.2} />
                    <path d={`M${fx} -46 h20 l-5 6 l5 6 h-20z`} fill={i === 1 ? team.secondary_color : team.primary_color} stroke="rgba(255,255,255,.75)" strokeWidth={0.6} />
                  </g>
                );
              })}
            </g>
          );
        })}
        {burstOn && (
          <g key={burstOn.key} style={{ pointerEvents: 'none' }}>
            {[true, false].map((top) =>
              Array.from({ length: lite ? 10 : 30 }).map((_, i) => {
                const team = burstOn.side === 'user' ? club : opponent;
                const r = (k: number) => wrand(i + (top ? 0 : 50), k + burstOn.key);
                const x0 = (burstOn.side === 'user' ? 0 : MID_X) + 20 + r(1) * (MID_X - 40);
                const y0 = top ? -STAND + 8 + r(2) * (STAND - 18) : H + 8 + r(2) * (STAND - 18);
                const colors = [team.primary_color, team.secondary_color, '#ffffff', '#F5B800'];
                return (
                  <rect
                    key={`${top}-${i}`}
                    className="pc-conf"
                    x={x0}
                    y={y0}
                    width={2.4 + r(3) * 2}
                    height={4 + r(4) * 3}
                    fill={colors[Math.floor(r(5) * colors.length)]}
                    style={{
                      ['--cx' as string]: `${((r(6) - 0.5) * 70).toFixed(0)}px`,
                      ['--cy' as string]: `${(top ? 14 + r(7) * 50 : -14 - r(7) * 50).toFixed(0)}px`,
                      ['--cr' as string]: `${((r(8) - 0.5) * 900).toFixed(0)}deg`,
                      ['--cd' as string]: `${(1.5 + r(9) * 1.3).toFixed(2)}s`,
                      ['--cl' as string]: `${(r(10) * 0.35).toFixed(2)}s`,
                    }}
                  />
                );
              }),
            )}
            {[0.18, 0.5, 0.82].map((f, i) => {
              const fx = (burstOn.side === 'user' ? 0 : MID_X) + MID_X * f;
              return [true, false].map((top) => (
                <circle key={`fl-${i}-${top}`} className="pc-flare" cx={fx} cy={top ? -STAND * 0.45 : H + STAND * 0.45} r={26} fill="#ff5a2e" opacity={0} filter="url(#pc-blur8)" style={{ animationDelay: `${i * 0.12}s` }} />
              ));
            })}
          </g>
        )}
        {arena.mow === 'diamond' ? (
          <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} fill="url(#pc-mow-d)" />
        ) : arena.mow === 'bands' ? (
          Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={FX0} y={FY0 + (i * (FY1 - FY0)) / 8} width={FX1 - FX0} height={(FY1 - FY0) / 8 + 0.5} fill={i % 2 ? arena.grassB : arena.grassA} />
          ))
        ) : arena.mow === 'checker' ? (
          Array.from({ length: 60 }).map((_, i) => {
            const cx = i % 10;
            const cy = Math.floor(i / 10);
            return <rect key={i} x={FX0 + cx * 70} y={FY0 + (cy * (FY1 - FY0)) / 6} width={70.5} height={(FY1 - FY0) / 6 + 0.5} fill={(cx + cy) % 2 ? arena.grassB : arena.grassA} />;
          })
        ) : (
          Array.from({ length: arena.mow === 'wide' ? 6 : 10 }).map((_, i) => {
            const n = arena.mow === 'wide' ? 6 : 10;
            const w = (FX1 - FX0) / n;
            return <rect key={i} x={FX0 + i * w} y={FY0} width={w + 0.5} height={FY1 - FY0} fill={i % 2 ? arena.grassB : arena.grassA} />;
          })
        )}
        {grassFade > 0.01 && <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} fill={mixHex(arena.grassA, arena.grassB)} opacity={Math.min(0.7, grassFade)} />}
        <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} fill="url(#pc-grain)" />
        <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} fill="url(#pitch-light)" />
        <g className="pc-flood" style={{ pointerEvents: 'none', ...(amb.time === 'night' ? {} : { display: 'none' }) }}>
          <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} fill="url(#pc-flood-x)" />
          <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} fill="url(#pc-flood-c)" />
        </g>
        <g style={{ pointerEvents: 'none' }}>{wearCells}</g>
        <g ref={wearSpots} opacity={0} style={{ pointerEvents: 'none' }}>
          {[FX0 + 66, FX1 - 66, MID_X].map((cx) => (
            <ellipse key={cx} cx={cx} cy={MID_Y} rx={9} ry={7} fill="#7a5c2e" opacity={0.7} />
          ))}
          {[FX0, FX1].map((gx) => (
            <ellipse key={`gm-${gx}`} cx={gx + (gx === FX0 ? 20 : -20)} cy={MID_Y} rx={22} ry={34} fill="#6f5429" opacity={0.35} />
          ))}
        </g>
        {!lite && <g style={{ pointerEvents: 'none' }} fill="none" stroke="#d6eaa0" strokeLinecap="round">
          {Array.from({ length: MARK_POOL }).map((_, i) => (
            <path key={i} ref={(el: SVGPathElement | null) => { markNodes.current[i] = el; }} d="M0 0" opacity={0} />
          ))}
        </g>}
        <g ref={wearLines} fill="none" stroke={lineColor} strokeWidth={2}>
          <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} />
          <line x1={MID_X} y1={FY0} x2={MID_X} y2={FY1} />
          <circle cx={MID_X} cy={MID_Y} r={48} />
          <rect x={FX0} y={MID_Y - 90} width={92} height={180} />
          <rect x={FX1 - 92} y={MID_Y - 90} width={92} height={180} />
          <rect x={FX0} y={MID_Y - 42} width={36} height={84} />
          <rect x={FX1 - 36} y={MID_Y - 42} width={36} height={84} />
        </g>
        <circle cx={MID_X} cy={MID_Y} r={3} fill={lineColor} />
        <circle cx={FX0 + 66} cy={MID_Y} r={2.2} fill={lineColor} />
        <circle cx={FX1 - 66} cy={MID_Y} r={2.2} fill={lineColor} />
        {puddles.length > 0 && rain && (
          <g style={{ pointerEvents: 'none' }}>
            {puddles.map((q, i) => {
              if (i >= 8 && wet <= 0.55) return null;
              const g = 1 + wet * 0.6;
              const rx = q.rx * g;
              const ry = q.ry * g;
              return (
                <g key={i}>
                  <ellipse cx={q.x} cy={q.y} rx={rx} ry={ry} fill={`rgba(50,84,112,${(0.45 + wet * 0.35).toFixed(2)})`} />
                  <ellipse cx={q.x - rx * 0.25} cy={q.y - ry * 0.3} rx={rx * 0.55} ry={ry * 0.35} fill={`rgba(225,240,252,${(0.28 + wet * 0.3).toFixed(2)})`} />
                  <ellipse cx={q.x} cy={q.y} rx={rx} ry={ry} fill="none" stroke={`rgba(205,228,247,${(0.4 + wet * 0.4).toFixed(2)})`} strokeWidth={0.8 + wet * 0.8} />
                </g>
              );
            })}
          </g>
        )}
        <rect
          x={0}
          y={-STAND}
          width={W}
          height={H + STAND * 2}
          fill={amb.time === 'night' ? '#0a1a5a' : amb.time === 'afternoon' ? '#ff9a3c' : '#fff6d0'}
          opacity={amb.time === 'night' ? 0.1 : amb.time === 'afternoon' ? 0.15 : 0.06}
          style={{ pointerEvents: 'none' }}
        />
        {rain && <rect x={0} y={-STAND} width={W} height={H + STAND * 2} fill="#0b1d2a" opacity={0.2} style={{ pointerEvents: 'none' }} />}
        <rect x={0} y={-STAND} width={W} height={H + STAND * 2} fill="url(#pitch-vig)" style={{ pointerEvents: 'none' }} />
        <g ref={(el: SVGGElement | null) => { netMesh.current.bot = el; }} style={{ transformBox: 'fill-box', transformOrigin: '100% 50%', pointerEvents: 'none' }}>
          <rect ref={(el: SVGRectElement | null) => { netNodes.current.bot = el; }} x={FX0 - 14} y={GOAL_TOP} width={14} height={GOAL_BOTTOM - GOAL_TOP} fill="rgba(255,255,255,.12)" stroke={lineColor} strokeWidth={2} />
          <rect x={FX0 - 14} y={GOAL_TOP} width={14} height={GOAL_BOTTOM - GOAL_TOP} fill="url(#pc-mesh)" />
        </g>
        <g ref={(el: SVGGElement | null) => { netMesh.current.user = el; }} style={{ transformBox: 'fill-box', transformOrigin: '0% 50%', pointerEvents: 'none' }}>
          <rect ref={(el: SVGRectElement | null) => { netNodes.current.user = el; }} x={FX1} y={GOAL_TOP} width={14} height={GOAL_BOTTOM - GOAL_TOP} fill="rgba(255,255,255,.12)" stroke={lineColor} strokeWidth={2} />
          <rect x={FX1} y={GOAL_TOP} width={14} height={GOAL_BOTTOM - GOAL_TOP} fill="url(#pc-mesh)" />
        </g>

        {slots.map((s) => {
          const team = s.side === 'user' ? club : opponent;
          return (
            <g key={s.key} ref={(el: SVGGElement | null) => { nodes.current[s.key] = el; }} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`}>
              {amb.time === 'night' && <ellipse cx={-9} cy={11} rx={lite ? 13 : 17} ry={lite ? 4.2 : 6} fill={lite ? 'rgba(0,0,0,.14)' : 'url(#pc-sh)'} fillOpacity={lite ? 1 : 0.14} />}
              {amb.time === 'night' && <ellipse cx={6} cy={12.5} rx={lite ? 14 : 18} ry={lite ? 4.6 : 6.4} fill={lite ? 'rgba(0,0,0,.34)' : 'url(#pc-sh)'} fillOpacity={lite ? 1 : 0.34} transform="rotate(8 6 12.5)" />}
              {amb.time === 'day' && <ellipse cx={1} cy={13} rx={lite ? 11 : 14.5} ry={lite ? 3.6 : 5.2} fill={lite ? (rain ? 'rgba(0,0,0,.14)' : 'rgba(0,0,0,.3)') : 'url(#pc-sh)'} fillOpacity={lite ? 1 : rain ? 0.14 : 0.3} />}
              {amb.time === 'afternoon' && <ellipse cx={15} cy={12} rx={lite ? 23 : 28} ry={lite ? 3.8 : 5.2} fill={lite ? (rain ? 'rgba(0,0,0,.14)' : 'rgba(0,0,0,.3)') : 'url(#pc-sh)'} fillOpacity={lite ? 1 : rain ? 0.14 : 0.3} transform="rotate(5 15 12)" />}
              {!lite && (
                <g ref={(el: SVGGElement | null) => { fxNodes.current[s.key] = el; }} opacity={0} style={{ pointerEvents: 'none' }}>
                  <circle r={12} fill={s.pos === 'GK' ? '#101418' : team.primary_color} opacity={0} />
                  <circle r={10} fill={s.pos === 'GK' ? '#101418' : team.primary_color} opacity={0} />
                  <path d="M17 -4.5 L22.5 0 L17 4.5" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0} />
                </g>
              )}
              {(() => {
                const keeper = s.pos === 'GK';
                const base = keeper ? keeperColor(club.primary_color, opponent.primary_color) : team.primary_color;
                const ink = textOn(base);
                return (
                  <>
                    <circle r={14.6} fill={keeper ? '#101418' : team.secondary_color} stroke="rgba(0,0,0,.45)" strokeWidth={0.9} />
                    <g clipPath="url(#tok-clip)">
                      <rect x={-13} y={-13} width={26} height={26} fill={base} />
                      {keeper ? <rect x={-13} y={5} width={26} height={8} fill="#101418" opacity={0.28} /> : <KitPattern kind={kitKind(team.abbreviation)} color={team.secondary_color} />}
                      <rect x={-13} y={-13} width={26} height={26} fill="url(#tok-shade)" style={{ pointerEvents: 'none' }} />
                    </g>
                    <circle r={12.3} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={0.8} />
                    <circle r={12.5} fill="url(#kit-gloss)" style={{ pointerEvents: 'none' }} />
                    <text
                      textAnchor="middle"
                      dy={4.6}
                      fontSize={13}
                      fontWeight={800}
                      fill={ink}
                      stroke={ink === '#ffffff' ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.7)'}
                      strokeWidth={2.6}
                      strokeLinejoin="round"
                      style={{ pointerEvents: 'none', paintOrder: 'stroke' }}
                    >
                      {s.name.slice(0, 1).toUpperCase()}
                    </text>
                  </>
                );
              })()}
              <g
                ref={(el: SVGGElement | null) => {
                  staminaBars.current[s.key] = { ...(staminaBars.current[s.key] ?? { fill: null }), box: el };
                }}
                transform="translate(0 -27)"
                opacity={0}
                style={{ pointerEvents: 'none', transition: 'opacity .25s ease' }}
              >
                <rect x={-12} y={-0.8} width={24} height={4.6} rx={2.3} fill="rgba(0,0,0,.6)" />
                <rect
                  ref={(el: SVGRectElement | null) => {
                    staminaBars.current[s.key] = { ...(staminaBars.current[s.key] ?? { box: null }), fill: el };
                  }}
                  x={-11}
                  y={0.4}
                  width={22}
                  height={2.2}
                  rx={1.1}
                  fill="#4ade80"
                />
              </g>
            </g>
          );
        })}

        {!lite && <g style={{ pointerEvents: 'none' }} fill={rain ? '#dcecf7' : '#cdb98f'} filter={soft}>
          {Array.from({ length: DUST_POOL }).map((_, i) => (
            <circle key={i} ref={(el: SVGCircleElement | null) => { dustNodes.current[i] = el; }} r={4} cx={0} cy={0} display="none" opacity={0} />
          ))}
        </g>}
        <g ref={bootNode} display="none" style={{ pointerEvents: 'none' }}>
          <g transform="scale(1.55)">
            <rect x={-3} y={-2.8} width={11} height={5.6} rx={2.8} fill="#f1f1f1" stroke="rgba(0,0,0,.4)" strokeWidth={0.6} />
            <rect x={6} y={-3.6} width={8} height={7.2} rx={3.4} fill="#14181f" stroke="#F5B800" strokeWidth={0.8} />
          </g>
        </g>
        <circle ref={impactNode} display="none" r={6} fill="none" stroke="#ffffff" strokeWidth={2.2} style={{ pointerEvents: 'none' }} />
        <g ref={ringNode} style={{ display: 'none' }}>
          <circle r={20} fill="none" stroke="#F5B800" strokeWidth={2.5} />
        </g>
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={`trail-${i}`} ref={(el: SVGCircleElement | null) => { trailNodes.current[i] = el; }} r={5.5 - i * 0.6} fill="#ffffff" opacity={0} />
        ))}
        {!lite && (
          <g style={{ pointerEvents: 'none' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <circle key={`ring-${i}`} ref={(el: SVGCircleElement | null) => { ringNodes.current[i] = el; }} r={12} fill="none" stroke="#fff" strokeWidth={2} opacity={0} />
            ))}
          </g>
        )}
        <g ref={ballNode} transform={`translate(${MID_X} ${MID_Y})`}>
          <ellipse ref={ballShadow} cx={amb.time === 'afternoon' ? 5 : 1.5} cy={6.5} rx={lite ? 6.5 : 8.5} ry={lite ? 2.6 : 3.6} fill={lite ? 'rgba(0,0,0,.42)' : 'url(#pc-sh)'} fillOpacity={lite ? 1 : 0.42} />
          <g ref={liftNode}>
            <defs>
              <clipPath id="ball-clip">
                <circle r={BALL_R} />
              </clipPath>
            </defs>
            <circle r={BALL_R} fill={ballSkin.base} />
            <g ref={spinNode} clipPath="url(#ball-clip)">
              <polygon points={BALL_CENTER} fill={ballSkin.ink} />
              {BALL_SEAMS.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={ballSkin.ink} strokeWidth={0.9} />
              ))}
              {BALL_EDGES.map((points, i) => (
                <polygon key={i} points={points} fill={ballSkin.ink} />
              ))}
            </g>
            <circle r={BALL_R} fill="none" stroke={ballSkin.ink} strokeWidth={1.2} />
            
          </g>
        </g>
        {rain && (
          <g style={{ pointerEvents: 'none' }} stroke="#d6e8f5" strokeWidth={1} strokeLinecap="round">
            {Array.from({ length: lite ? 3 : 8 }).map((_, gi) => (
              <g key={gi} className="pc-dropg" style={{ ['--rd' as string]: `${(0.055 + wrand(gi, 34) * 0.04).toFixed(3)}s`, ['--rl' as string]: `${(-wrand(gi, 35) * 0.06).toFixed(3)}s` }}>
                {Array.from({ length: 10 }).map((__, j) => {
                  const i = gi * 10 + j;
                  const x = wrand(i, 31) * (W + 40);
                  const y = -STAND - 63 + j * 63 + wrand(i, 36) * 40;
                  return <line key={j} x1={x} y1={y} x2={x - 3} y2={y + 11 + wrand(i, 32) * 6} opacity={0.2 + wrand(i, 33) * 0.3} />;
                })}
              </g>
            ))}
          </g>
        )}
        {rain && !lite && <rect className="pc-strike" x={0} y={-STAND} width={W} height={H + STAND * 2} fill="#eaf3ff" style={{ pointerEvents: 'none' }} />}
        <text
          ref={nameNode}
          textAnchor="middle"
          fontSize={14}
          fontWeight={700}
          fill="#ffffff"
          stroke="#000000"
          strokeWidth={3}
          style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
        />
      </svg>

      {!hideOverlays && (
        <>
      {crowd?.bubbles.user && (
        <p key={crowd.bubbles.user.key} className={`pc-bub ${crowd.bubbles.user.mood}`} style={{ left: 8 }}>
          {crowd.bubbles.user.text}
        </p>
      )}
      {crowd?.bubbles.bot && (
        <p key={crowd.bubbles.bot.key} className={`pc-bub ${crowd.bubbles.bot.mood}`} style={{ right: 8, textAlign: 'right' }}>
          {crowd.bubbles.bot.text}
        </p>
      )}
        </>
      )}
      {!hideOverlays && (
        <div ref={momEl} className="pc-mom" aria-hidden="true" style={{ position: 'absolute', left: 10, right: 10, top: 2, height: 3, borderRadius: 3, background: 'rgba(0,0,0,.35)', opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <i style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${club.primary_color} calc(var(--m, .5) * 100%), ${opponent.primary_color} calc(var(--m, .5) * 100%))`, opacity: 0.9, transition: 'all .8s ease' }} />
        </div>
      )}
      {replay && <GoalReplay key={`replay-${replay.id}`} data={replay} club={club} opponent={opponent} onDone={() => setReplay(null)} />}
      {crowd && !hideOverlays && <span className="pc-db">🔊 {Math.round(68 + crowd.noise * 0.5)} dB</span>}
      {!hideOverlays && (
      <div
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          padding: '6px 10px',
          borderRadius: 10,
          background: 'linear-gradient(90deg, rgba(0,0,0,.75), rgba(0,0,0,.5))',
          borderLeft: '3px solid #F5B800',
          backdropFilter: 'blur(6px)',
          color: '#fff',
          fontSize: 12,
          lineHeight: 1.3,
        }}
      >
        {caption}
      </div>
      )}
      {goalText && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontFamily: "'Bebas Neue', 'Oswald', sans-serif",
            fontSize: 44,
            letterSpacing: 2,
            color: '#22c55e',
            textShadow: '0 2px 12px rgba(0,0,0,.8)',
            textAlign: 'center',
            padding: '0 12px',
          }}
        >
          {goalText}
        </div>
      )}
    </section>
  );
}
