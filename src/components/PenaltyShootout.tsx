import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { stadiumCss } from '@/lib/game/stadiumCss';
import { fetchRoom, patchRoom, type NetChoice, type NetKick } from '@/lib/multiplayer';

// Disputa de pênaltis interativa (estilo FIFA):
//  - Quando VOCÊ bate: toque/clique no gol para mirar, pare a barra de força na faixa verde.
//  - Quando o ADVERSÁRIO bate: escolha o canto para o goleiro pular.
//  - No multiplayer (prop `net`): os dois jogam ao mesmo tempo, um bate e o outro defende; o anfitrião resolve
//    cada cobrança e as duas telas mostram a mesma animação. Espectadores só assistem.

type Side = 'user' | 'bot';
export type ShootoutKick = { side: Side; playerId: string; scored: boolean };
export type Shootout = { kicks: ShootoutKick[]; userGoals: number; botGoals: number; winner: Side };
type PenaltyTeam = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
type PenaltyPlayer = { id: string; name: string; overall: number; primary_position: string; slot?: string };
const posOf = (player: PenaltyPlayer) => player.slot ?? player.primary_position;
type Outcome = 'gol' | 'defesa' | 'fora' | 'trave';
type Phase = 'aim' | 'power' | 'dive' | 'wait' | 'flying' | 'done';
type Point = { x: number; y: number };
type Zone = { col: number; row: number };
type KickPlan = {
  side: Side;
  playerId: string;
  outcome: Outcome;
  target: Point; // posição da bola no gol (0 a 1; fora disso = errou o gol)
  keeper: Point; // para onde o goleiro pula (0 a 1)
  dur: number;
  arc: number;
  golaco?: boolean; // gol no ângulo: o goleiro pulou para o lado certo, mas não alcançou
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
const NET_MS = 12000; // tempo que cada jogador tem para escolher
const NET_AUTO_MS = 19000; // o anfitrião escolhe pelo adversário que sumiu depois desse tempo

// Cena em um SVG 400 x 270
const pkCss = `
.pk { padding: 20px 18px 18px; margin: 0 0 16px; display: grid; gap: 14px; overflow: hidden; }
.pk-head { text-align: center; }
.pk-head .eyebrow { display: inline-block; font-size: 11px; letter-spacing: 4px; color: #F5B800; padding: 4px 12px; border: 1px solid rgba(245,184,0,.4); border-radius: 99px; background: rgba(245,184,0,.08); }
.pk-head h2 { margin: 8px 0 0; font-size: clamp(30px, 6vw, 46px); line-height: 1; font-style: italic; letter-spacing: .06em; }
.pk-head h2 em { color: #F5B800; font-style: italic; text-shadow: 0 0 24px rgba(245,184,0,.45); }
.pk-board { display: grid; gap: 8px; padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,.38); border: 1px solid rgba(255,255,255,.08); }
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
.pk-stage { position: relative; max-width: 760px; width: 100%; margin: 0 auto; border-radius: 16px; overflow: hidden; border: 1px solid rgba(245,184,0,.3); box-shadow: 0 24px 60px rgba(0,0,0,.55), 0 0 0 4px rgba(0,0,0,.25); }
.pk-stage svg { display: block; width: 100%; height: auto; }
.pk-flash { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; font-family: 'Bebas Neue','Oswald',sans-serif; font-style: italic; font-size: clamp(40px, 11vw, 78px); letter-spacing: 4px; text-align: center; text-shadow: 0 4px 24px rgba(0,0,0,.9); animation: pkPop .55s cubic-bezier(.2,1.4,.4,1) both; }
.pk-flash.good { color: #4ade80; text-shadow: 0 0 30px rgba(34,197,94,.8), 0 4px 18px rgba(0,0,0,.9); }
.pk-flash.bad { color: #f87171; }
.pk-power { display: grid; gap: 12px; justify-items: center; }
.pk-bar { position: relative; width: 100%; max-width: 760px; height: 26px; border-radius: 13px; overflow: hidden; border: 2px solid rgba(255,255,255,.25); box-shadow: 0 0 0 4px rgba(0,0,0,.35), inset 0 2px 6px rgba(0,0,0,.5);
  background: linear-gradient(90deg,#ef4444 0 35%,#facc15 35% 62%,#22c55e 62% 92%,#ef4444 92% 100%); }
.pk-bar::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,.35), transparent 55%); pointer-events: none; }
.pk-cursor { position: absolute; top: -2px; bottom: -2px; left: 0; width: 6px; margin-left: -3px; background: #fff; border-radius: 3px; box-shadow: 0 0 12px #fff, 0 0 4px #000; z-index: 2; }
.pk-hint { margin: 0; text-align: center; font-size: 14px; color: rgba(255,255,255,.75); }
.pk-timer { margin: 0; justify-self: center; font-family: 'Bebas Neue',sans-serif; font-size: 26px; letter-spacing: .1em; padding: 2px 16px; border-radius: 99px; background: rgba(0,0,0,.4); border: 1px solid currentColor; }
.pk-btn { padding: 14px 40px; font-family: 'Bebas Neue',sans-serif; font-size: 22px; cursor: pointer; touch-action: manipulation; }
.pk-ghost { background: transparent; color: rgba(255,255,255,.8); border: 1px solid rgba(255,255,255,.25); border-radius: 99px; padding: 9px 22px; cursor: pointer; font-size: 14px; }
.pk-ghost:hover { border-color: #F5B800; color: #F5B800; }
.pk-end { display: flex; justify-content: center; }
.pk-gone { display: grid; gap: 8px; justify-items: center; color: #f87171; font-weight: 700; }
@keyframes pkPulse { 50% { box-shadow: 0 0 0 4px rgba(245,184,0,.25); } }
@keyframes pkPop { 0% { transform: scale(.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@media (max-width: 600px) { .pk { padding: 14px 10px; } .pk-dot { width: 22px; height: 22px; font-size: 11px; } .pk-score { font-size: 32px; } .pk-abbr { font-size: 20px; min-width: 42px; } }
`;

const VW = 400;
const VH = 270;
const GL = 70; // trave esquerda
const GW = 260; // largura do gol
const GT = 44; // travessão
const GH = 118; // altura do gol
const GB = GT + GH; // linha do gol
const SPOT: Point = { x: 200, y: 240 };
const IDLE: Point = { x: 200, y: GB - 26 };
const COLS = [0.17, 0.5, 0.83];
const ROWS = [0.3, 0.7];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const toSvg = (p: Point): Point => ({ x: GL + p.x * GW, y: GT + p.y * GH });
const zoneOf = (p: Point): Zone => ({ col: p.x < 1 / 3 ? 0 : p.x < 2 / 3 ? 1 : 2, row: p.y < 0.5 ? 0 : 1 });
const zoneCenter = (z: Zone): Point => ({ x: COLS[z.col], y: ROWS[z.row] });

// Chance base de defesa conforme o lado do chute e o lado para onde o goleiro pulou
function savePct(shot: Zone, keeper: Zone) {
  const dc = Math.abs(shot.col - keeper.col);
  if (dc === 0) return 0.9;
  if (dc === 1) return 0.1;
  return 0;
}
function pickKeeperZone(): Zone {
  const r = Math.random();
  return { col: r < 0.36 ? 0 : r < 0.64 ? 1 : 2, row: Math.random() < 0.5 ? 0 : 1 };
}

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

// Resolve uma cobrança: a mira e a força de quem bate, contra o lado para onde o goleiro pulou.
function resolveShot(
  player: PenaltyPlayer,
  keeper: PenaltyPlayer | undefined,
  mira: Point,
  pw: number,
  keeperZone: Zone,
): Pick<KickPlan, 'outcome' | 'target' | 'keeper' | 'dur' | 'arc' | 'golaco'> {
  const skill = (player.overall - 75) / 100;
  const radius = clamp(0.1 + Math.abs(pw - 0.8) * 0.45 - skill * 0.15, 0.04, 0.4);
  const spreadAngle = rand(0, Math.PI * 2);
  const spread = radius * Math.sqrt(Math.random());
  let bx = mira.x + Math.cos(spreadAngle) * spread;
  let by = mira.y + Math.sin(spreadAngle) * spread * 0.9;
  if (pw < 0.32) {
    bx = lerp(bx, 0.5, 0.6); // chute fraco vai no meio
    by = lerp(by, 0.62, 0.5);
  }
  let outcome: Outcome | null = null;
  if (pw > 0.96) {
    by = -0.2 - Math.random() * 0.15; // chutou forte demais: por cima do gol
    outcome = 'fora';
  } else if (bx < 0 || bx > 1 || by < 0 || by > 1) {
    outcome = 'fora';
  } else if ((bx < 0.035 || bx > 0.965 || by < 0.05) && Math.random() < 0.5) {
    outcome = 'trave';
  }
  let golaco = false;
  if (!outcome) {
    let pSave =
      savePct(zoneOf({ x: clamp(bx, 0, 1), y: clamp(by, 0, 1) }), keeperZone) +
      ((keeper?.overall ?? 75) - player.overall) / 300;
    pSave *= clamp(1.6 - pw * 0.9, 0.6, 1.4);
    if (Math.abs(bx - 0.5) < 0.17) pSave *= 1.6; // bola no meio do gol é mais fácil de pegar
    if (Math.abs(bx - 0.5) > 0.37 && (by < 0.22 || by > 0.78)) pSave *= 0.55; // cantinho
    if (pw < 0.4) pSave = Math.max(pSave, 0.55); // chute fraco é fácil de pegar
    outcome = Math.random() < clamp(pSave, 0, 0.95) ? 'defesa' : 'gol';
    if (outcome === 'gol') {
      const shotCol = zoneOf({ x: clamp(bx, 0, 1), y: clamp(by, 0, 1) }).col;
      if (shotCol === keeperZone.col) {
        // O goleiro foi para o lado certo, mas a bola entrou no ângulo, fora do alcance dele
        golaco = true;
        bx = shotCol === 0 ? 0.05 : shotCol === 2 ? 0.95 : 0.5;
        by = by < 0.5 ? 0.06 : 0.94;
      }
    }
  }
  return {
    outcome,
    target: { x: bx, y: by },
    keeper: outcome === 'defesa' ? { x: bx, y: by } : zoneCenter(keeperZone),
    dur: 480 + (1 - pw) * 420,
    arc: 12,
    golaco,
  };
}

export default function PenaltyShootout({ club, opponent, userTeam, botTeam, onFinish, net, onAbort }: Props) {
  const takers = useMemo(() => ({ user: orderTakers(userTeam), bot: orderTakers(botTeam) }), [userTeam, botTeam]);
  const keepers = useMemo(() => ({ user: keeperOf(userTeam), bot: keeperOf(botTeam) }), [userTeam, botTeam]);

  const [kicks, setKicks] = useState<ShootoutKick[]>([]);
  const [phase, setPhase] = useState<Phase>('aim');
  const [aim, setAim] = useState<Point>({ x: 0.5, y: 0.5 });
  const [hover, setHover] = useState(-1); // lado sob o dedo/mouse na hora de defender (0, 1 ou 2)
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);

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
  const aimed = useRef(false);
  const [left, setLeft] = useState<number | null>(null);
  const [netGone, setNetGone] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const ballRef = useRef<SVGGElement | null>(null);
  const keeperRef = useRef<SVGGElement | null>(null);
  const netRef = useRef<SVGRectElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const powerRef = useRef(0);
  const aimRef = useRef<Point>(aim);
  aimRef.current = aim;
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
  const result = useMemo(() => (st.finished ? buildResult(kicks, net ? hostSide : undefined) : null), [kicks]);

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

  function resetScene() {
    ballRef.current?.setAttribute('transform', `translate(${SPOT.x} ${SPOT.y})`);
    keeperRef.current?.setAttribute('transform', `translate(${IDLE.x} ${IDLE.y})`);
    if (netRef.current) netRef.current.style.opacity = '0';
  }

  // A cada cobrança nova: volta a cena ao início e libera a vez de quem bate
  useEffect(() => {
    resetScene();
    setFlash(null);
    setHover(-1);
    if (status(kicks).finished) {
      setPhase('done');
      return;
    }
    if (net && (spectator || remoteRef.current.length > kicks.length)) {
      setPhase('wait'); // espectador, ou a cobrança já foi resolvida: só assiste
      return;
    }
    deadline.current = Date.now() + NET_MS;
    aimed.current = false;
    if (turnOf(kicks.length) === 'user') {
      setAim({ x: 0.5, y: 0.5 });
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
    setHover(-1);
    setPhase('flying');
    playKick({
      side: sideOfRole(nk.shooter),
      playerId: nk.playerId,
      outcome: nk.outcome,
      target: { x: nk.tx, y: nk.ty },
      keeper: { x: nk.kx, y: nk.ky },
      dur: nk.dur,
      arc: nk.arc,
      golaco: nk.golaco,
    });
  }, [remote, kicks.length, phase]);

  // Envia a minha escolha (mira e força, ou lado do goleiro) para a sala
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

  // Só o anfitrião resolve: quando as duas escolhas chegam (ou o tempo do adversário acaba), sorteia o desfecho
  function tryResolve() {
    if (!net || net.role !== 'host') return;
    const list = remoteRef.current;
    const index = list.length;
    const played = list.map(netToKick);
    if (status(played).finished) return;
    if (kickStart.current.index !== index) kickStart.current = { index, at: Date.now() };
    const shooterRole: 'host' | 'guest' = index % 2 === 0 ? 'host' : 'guest';
    const shotChoice = (shooterRole === 'host' ? myChoices.current : theirChoices.current)[String(index)];
    const diveChoice = (shooterRole === 'host' ? theirChoices.current : myChoices.current)[String(index)];
    let shot = shotChoice && typeof shotChoice.pw === 'number' ? shotChoice : null;
    let dive = diveChoice && typeof diveChoice.dive === 'number' ? diveChoice.dive : null;
    if (!shot || dive === null) {
      if (Date.now() - kickStart.current.at < NET_AUTO_MS) return;
      if (!shot) shot = { x: rand(0.25, 0.75), y: rand(0.3, 0.7), pw: 0.75 };
      if (dive === null) dive = Math.floor(Math.random() * 3);
    }
    const shooterSide = sideOfRole(shooterRole);
    const player = shooterFor(shooterSide, played);
    if (!player) return;
    const plan = resolveShot(
      player,
      keepers[otherSide(shooterSide)],
      { x: clamp(shot.x ?? 0.5, 0.02, 0.98), y: clamp(shot.y ?? 0.5, 0.03, 0.97) },
      clamp(shot.pw ?? 0.75, 0, 1),
      { col: clamp(Math.round(dive), 0, 2), row: Math.random() < 0.5 ? 0 : 1 },
    );
    const nk: NetKick = {
      shooter: shooterRole,
      playerId: player.id,
      outcome: plan.outcome,
      tx: plan.target.x,
      ty: plan.target.y,
      kx: plan.keeper.x,
      ky: plan.keeper.y,
      dur: plan.dur,
      arc: plan.arc,
      golaco: !!plan.golaco,
    };
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
      if (phase === 'dive') chooseDive(Math.floor(Math.random() * 3));
      else {
        if (!aimed.current) aimRef.current = { x: rand(0.25, 0.75), y: rand(0.3, 0.7) };
        if (phase === 'aim') powerRef.current = 0.75;
        shootUser(true);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, kicks.length]);

  // Barra de força: vai e volta; o jogador para na faixa verde
  useEffect(() => {
    if (phase !== 'power') return;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const t = ((now - t0) / 1250) % 1;
      const v = t < 0.5 ? t * 2 : (1 - t) * 2;
      powerRef.current = v;
      if (barRef.current) barRef.current.style.left = `${(v * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        shootUser();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase]);

  function tween(dur: number, step: (t: number) => void, done?: () => void) {
    const start = performance.now();
    const loop = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      step(t);
      if (t < 1) rafRef.current = requestAnimationFrame(loop);
      else done?.();
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  // Anima a bola, o goleiro e o desfecho da cobrança; depois registra o resultado
  function playKick(plan: KickPlan) {
    const target = toSvg(plan.target);
    const dive = toSvg({ x: clamp(plan.keeper.x, 0.08, 0.92), y: clamp(plan.keeper.y, 0.2, 0.85) });
    const rot = clamp(((dive.x - IDLE.x) / (GW / 2)) * 65, -70, 70);
    const scored = plan.outcome === 'gol';
    tween(
      plan.dur,
      (t) => {
        const e = 1 - Math.pow(1 - t, 2);
        const bx = lerp(SPOT.x, target.x, e);
        const by = lerp(SPOT.y, target.y, e) - Math.sin(Math.PI * e) * plan.arc;
        ballRef.current?.setAttribute(
          'transform',
          `translate(${bx.toFixed(1)} ${by.toFixed(1)}) scale(${lerp(1, 0.55, e).toFixed(2)})`,
        );
        const kt = clamp((t * plan.dur - 110) / (plan.dur * 0.85), 0, 1);
        const ke = 1 - Math.pow(1 - kt, 2);
        keeperRef.current?.setAttribute(
          'transform',
          `translate(${lerp(IDLE.x, dive.x, ke).toFixed(1)} ${lerp(IDLE.y, dive.y, ke).toFixed(1)}) rotate(${(rot * ke).toFixed(1)})`,
        );
      },
      () => {
        const mine = plan.side === 'user';
        const texts: Record<Outcome, [string, string]> = {
          gol: ['GOOOL!', 'Gol do adversário!'],
          defesa: ['O goleiro defendeu!', 'DEFENDEU!'],
          fora: ['Pra fora!', 'Ele isolou!'],
          trave: ['NA TRAVE!', 'Bateu na trave!'],
        };
        const good = mine ? scored : !scored;
        setFlash({
          text: plan.golaco ? (mine ? 'GOLAÇO NO ÂNGULO!' : 'Golaço no ângulo!') : texts[plan.outcome][mine ? 0 : 1],
          good,
        });
        if (scored && netRef.current) {
          netRef.current.style.opacity = '0.5';
          later(() => {
            if (netRef.current) netRef.current.style.opacity = '0';
          }, 450);
        }
        if (plan.outcome === 'defesa' || plan.outcome === 'trave') {
          const dir = target.x < IDLE.x ? -1 : 1;
          const to = { x: target.x + dir * (plan.outcome === 'trave' ? -16 : 22), y: target.y + 30 };
          tween(380, (t) => {
            ballRef.current?.setAttribute(
              'transform',
              `translate(${lerp(target.x, to.x, t).toFixed(1)} ${(lerp(target.y, to.y, t) - Math.sin(Math.PI * t) * 10).toFixed(1)}) scale(0.55)`,
            );
          });
        }
        later(() => {
          setKicks((prev) => [...prev, { side: plan.side, playerId: plan.playerId, scored }]);
        }, 1800);
      },
    );
  }

  // Posição do toque/clique convertida para o gol (0 a 1)
  function pointerToGoal(event: ReactPointerEvent<SVGSVGElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * VW;
    const y = ((event.clientY - box.top) / box.height) * VH;
    return { x: clamp((x - GL) / GW, 0.02, 0.98), y: clamp((y - GT) / GH, 0.03, 0.97) };
  }
  function onScenePointer(event: ReactPointerEvent<SVGSVGElement>, down: boolean) {
    if (phase !== 'aim') return;
    const p = pointerToGoal(event);
    aimed.current = true;
    setAim(p);
    if (down) {
      powerRef.current = 0;
      setPhase('power');
    }
  }

  // Você bate: a mira e a força definem onde a bola vai e se o goleiro pega
  function shootUser(force = false) {
    if (phase !== 'power' && !force) return;
    const mira = aimRef.current;
    const pw = powerRef.current;
    if (net) {
      // Multiplayer: só envia a minha escolha; o anfitrião resolve e as duas telas animam juntas
      submitChoice(kicks.length, { x: mira.x, y: mira.y, pw });
      setPhase('wait');
      return;
    }
    const player = shooterFor('user');
    if (!player) return;
    const keeperZone = pickKeeperZone();
    const plan = resolveShot(player, keepers.bot, mira, pw, keeperZone);
    setPhase('flying');
    playKick({ side: 'user', playerId: player.id, ...plan });
  }

  // O adversário bate: você escolhe o canto onde o goleiro pula
  function chooseDive(col: number) {
    if (phase !== 'dive') return;
    if (net) {
      submitChoice(kicks.length, { dive: col });
      setHover(-1);
      setPhase('wait');
      return;
    }
    const player = shooterFor('bot');
    if (!player) return;
    const r = Math.random();
    const shotZone: Zone = { col: r < 0.4 ? 0 : r < 0.6 ? 1 : 2, row: Math.random() < 0.5 ? 0 : 1 };
    const center = zoneCenter(shotZone);
    let target: Point = { x: center.x + rand(-0.06, 0.06), y: center.y + rand(-0.08, 0.08) };
    const missChance = clamp(0.07 + (80 - player.overall) * 0.004, 0.03, 0.2);
    let outcome: Outcome;
    let golaco = false;
    if (Math.random() < missChance) {
      if (Math.random() < 0.4) {
        outcome = 'trave';
        target = { x: shotZone.col === 0 ? 0.01 : shotZone.col === 2 ? 0.99 : 0.5, y: shotZone.col === 1 ? 0.02 : center.y };
      } else {
        outcome = 'fora';
        target = { x: shotZone.col === 0 ? -0.15 : shotZone.col === 2 ? 1.15 : 0.5, y: shotZone.col === 1 ? -0.25 : center.y };
      }
    } else {
      let pSave = savePct(shotZone, { col, row: 1 });
      if (pSave > 0) pSave = clamp(pSave + ((keepers.user?.overall ?? 75) - player.overall) / 300, 0.02, 0.95);
      outcome = Math.random() < pSave ? 'defesa' : 'gol';
      if (outcome === 'gol' && shotZone.col === col) {
        // Você pulou para o lado certo, mas ele chutou no ângulo
        golaco = true;
        target = { x: col === 0 ? 0.05 : col === 2 ? 0.95 : 0.5, y: target.y < 0.5 ? 0.06 : 0.94 };
      }
    }
    setHover(-1);
    setPhase('flying');
    playKick({
      side: 'bot',
      playerId: player.id,
      outcome,
      target,
      keeper: outcome === 'defesa' ? target : zoneCenter({ col, row: 1 }),
      dur: rand(520, 640),
      arc: 14,
      golaco,
    });
  }

  // Resolve o que falta automaticamente
  function autoRest() {
    if (net || phase === 'flying' || phase === 'done') return;
    cancelAnimationFrame(rafRef.current);
    const list = [...kicks];
    while (!status(list).finished && list.length < 60) {
      const side: Side = list.length % 2 === 0 ? 'user' : 'bot';
      const other: Side = side === 'user' ? 'bot' : 'user';
      const player = shooterFor(side, list);
      if (!player) break;
      const chance = clamp(0.74 + (player.overall - (keepers[other]?.overall ?? 75)) / 150, 0.55, 0.9);
      list.push({ side, playerId: player.id, scored: Math.random() < chance });
    }
    setKicks(list);
  }

  const nameOf = (kick: ShootoutKick) =>
    (kick.side === 'user' ? userTeam : botTeam).find((player) => player.id === kick.playerId)?.name ?? 'Jogador';

  const slots = Math.max(5, Math.ceil(kicks.length / 2));
  const mark = (side: Side, index: number) => {
    const kick = kicks.filter((item) => item.side === side)[index];
    const isNext = !kick && phase !== 'done' && turn === side && kicks.filter((item) => item.side === side).length === index;
    return (
      <span
        key={index}
        title={kick ? nameOf(kick) : ''}
        className={`pk-dot ${kick ? (kick.scored ? 'g' : 'm') : ''} ${isNext ? 'n' : ''}`}
      >
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
      ? 'Toque ou clique no gol para mirar.'
      : phase === 'power'
        ? 'Pare a barra na faixa verde para chutar com precisão!'
        : phase === 'dive'
          ? 'Toque no lado para onde o goleiro deve pular: esquerda, meio ou direita.'
          : phase === 'wait' && net && !spectator
            ? 'Escolha enviada. Aguardando o adversário…'
            : phase === 'wait' && spectator
              ? 'Você está assistindo a disputa.'
              : '';

  const myTurnToKick = !spectator && turn === 'user' && phase !== 'done';
  const keeperTurn = !spectator && turn !== 'user' && phase !== 'done';
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

      <div className="pk-stage">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ cursor: phase === 'aim' ? 'crosshair' : 'default', touchAction: 'manipulation' }}
          role="img"
          aria-label="Gol da cobrança de pênalti"
          onPointerMove={(event) => onScenePointer(event, false)}
          onPointerDown={(event) => onScenePointer(event, true)}
        >
          <defs>
            <linearGradient id="penSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#03060d" />
              <stop offset="1" stopColor="#1a2a46" />
            </linearGradient>
            <linearGradient id="penGrass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0f4a28" />
              <stop offset="1" stopColor="#23904a" />
            </linearGradient>
            <linearGradient id="penPost" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#c9ccd1" />
              <stop offset=".5" stopColor="#ffffff" />
              <stop offset="1" stopColor="#b4b8be" />
            </linearGradient>
            <radialGradient id="penLight" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="rgba(255,246,200,.55)" />
              <stop offset="1" stopColor="rgba(255,246,200,0)" />
            </radialGradient>
            <radialGradient id="penSpot" cx=".5" cy=".55" r=".6">
              <stop offset="0" stopColor="rgba(255,255,255,.18)" />
              <stop offset="1" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <radialGradient id="penVig" cx=".5" cy=".5" r=".75">
              <stop offset=".6" stopColor="rgba(0,0,0,0)" />
              <stop offset="1" stopColor="rgba(0,0,0,.55)" />
            </radialGradient>
            <pattern id="penNet" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M8 0H0V8" stroke="rgba(255,255,255,.34)" strokeWidth="0.8" fill="none" />
            </pattern>
            <pattern id="penCrowd" width="10" height="9" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="2" fill="rgba(245,184,0,.32)" />
              <circle cx="8" cy="6" r="2" fill="rgba(255,255,255,.2)" />
              <circle cx="6" cy="1" r="1.2" fill="rgba(59,130,246,.3)" />
            </pattern>
          </defs>
          <rect width={VW} height={GB} fill="url(#penSky)" />
          <rect width={VW} height={GT - 8} fill="url(#penCrowd)" opacity="0.75" />
          <rect y={GT - 10} width={VW} height={4} fill="rgba(0,0,0,.45)" />
          <circle cx="40" cy="6" r="60" fill="url(#penLight)" />
          <circle cx="360" cy="6" r="60" fill="url(#penLight)" />
          <rect y={GB} width={VW} height={VH - GB} fill="url(#penGrass)" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} y={GB + i * 21} width={VW} height={10} fill="rgba(0,0,0,.09)" />
          ))}
          <g stroke="rgba(255,255,255,.6)" strokeWidth="1.6" fill="none">
            <line x1="0" y1={GB} x2={VW} y2={GB} />
            <line x1="46" y1={GB} x2="8" y2={VH} />
            <line x1="354" y1={GB} x2="392" y2={VH} />
            <line x1="29" y1="214" x2="371" y2="214" />
            <path d="M150 214 A52 36 0 0 0 250 214" opacity=".55" />
          </g>
          <ellipse cx={SPOT.x} cy="215" rx="150" ry="55" fill="url(#penSpot)" />
          <circle cx={SPOT.x} cy={SPOT.y} r="2.5" fill="#fff" />

          <rect x={GL} y={GT} width={GW} height={GH} fill="rgba(6,10,18,.62)" />
          <rect x={GL} y={GT} width={GW} height={GH} fill="url(#penNet)" />
          <rect ref={netRef} x={GL} y={GT} width={GW} height={GH} fill="#ffffff" style={{ opacity: 0, transition: 'opacity .4s' }} />

          <g ref={keeperRef} transform={`translate(${IDLE.x} ${IDLE.y})`}>
            <ellipse cy="24" rx="16" ry="3" fill="rgba(0,0,0,.35)" />
            <line x1="-8" y1="-16" x2="-21" y2="-30" stroke="#16a34a" strokeWidth="5" strokeLinecap="round" />
            <line x1="8" y1="-16" x2="21" y2="-30" stroke="#16a34a" strokeWidth="5" strokeLinecap="round" />
            <circle cx="-21" cy="-31" r="4.5" fill="#fde047" stroke="#a16207" strokeWidth="1" />
            <circle cx="21" cy="-31" r="4.5" fill="#fde047" stroke="#a16207" strokeWidth="1" />
            <rect x="-7" y="2" width="5" height="20" rx="2" fill="#1e293b" />
            <rect x="2" y="2" width="5" height="20" rx="2" fill="#1e293b" />
            <rect x="-9" y="-22" width="18" height="26" rx="4" fill="#22c55e" />
            <rect x="-9" y="-22" width="18" height="9" rx="4" fill="rgba(255,255,255,.22)" />
            <circle cx="0" cy="-29" r="6" fill="#f1c9a0" />
            <path d="M-6 -30 Q0 -38 6 -30 Q0 -33 -6 -30Z" fill="#2b1b10" />
          </g>

          <g stroke="url(#penPost)" strokeWidth="6" strokeLinecap="square" fill="none">
            <line x1={GL} y1={GB} x2={GL} y2={GT} />
            <line x1={GL + GW} y1={GB} x2={GL + GW} y2={GT} />
            <line x1={GL - 3} y1={GT} x2={GL + GW + 3} y2={GT} />
          </g>

          <g ref={ballRef} transform={`translate(${SPOT.x} ${SPOT.y})`}>
            <ellipse cy="7" rx="7" ry="2.5" fill="rgba(0,0,0,.4)" />
            <circle r="7" fill="#ffffff" stroke="#0b1016" strokeWidth="1.2" />
            <polygon points="0,-3.2 3,-1 1.9,2.6 -1.9,2.6 -3,-1" fill="#0b1016" />
            <circle cx="-2.4" cy="-2.6" r="1.8" fill="rgba(255,255,255,.9)" />
          </g>

          <rect width={VW} height={VH} fill="url(#penVig)" pointerEvents="none" />

          {(phase === 'aim' || phase === 'power') && (
            <g transform={`translate(${toSvg(aim).x.toFixed(1)} ${toSvg(aim).y.toFixed(1)})`} pointerEvents="none">
              <circle r="11" fill="rgba(245,184,0,.18)" stroke="#F5B800" strokeWidth="2" />
              <circle r="2" fill="#F5B800" />
              <line x1="-17" y1="0" x2="-7" y2="0" stroke="#F5B800" strokeWidth="2" />
              <line x1="7" y1="0" x2="17" y2="0" stroke="#F5B800" strokeWidth="2" />
              <line x1="0" y1="-17" x2="0" y2="-7" stroke="#F5B800" strokeWidth="2" />
              <line x1="0" y1="7" x2="0" y2="17" stroke="#F5B800" strokeWidth="2" />
            </g>
          )}

          {phase === 'dive' &&
            ['ESQUERDA', 'MEIO', 'DIREITA'].map((label, c) => (
              <g key={label}>
                <rect
                  x={GL + (c * GW) / 3}
                  y={GT}
                  width={GW / 3}
                  height={GH}
                  fill={hover === c ? 'rgba(245,184,0,.34)' : 'rgba(255,255,255,.07)'}
                  stroke="rgba(255,255,255,.5)"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={() => setHover(c)}
                  onPointerLeave={() => setHover(-1)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    chooseDive(c);
                  }}
                />
                <text
                  x={GL + (c * GW) / 3 + GW / 6}
                  y={GT + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="rgba(255,255,255,.9)"
                  pointerEvents="none"
                >
                  {c === 0 ? '◀ ' : ''}
                  {label}
                  {c === 2 ? ' ▶' : ''}
                </text>
              </g>
            ))}
        </svg>

        {flash && (
          <div key={flash.text} className={`pk-flash ${flash.good ? 'good' : 'bad'}`}>
            {flash.text}
          </div>
        )}
      </div>

      {phase === 'power' && (
        <div className="pk-power">
          <div className="pk-bar">
            <div ref={barRef} className="pk-cursor" />
          </div>
          <button className="cta-slant pk-btn" onPointerDown={() => shootUser()}>
            ⚽ Chutar!
          </button>
        </div>
      )}

      {hint && <p className="pk-hint">{hint}</p>}
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
