import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// Disputa de pênaltis interativa (estilo FIFA):
//  - Quando VOCÊ bate: toque/clique no gol para mirar, pare a barra de força na faixa verde.
//  - Quando o ADVERSÁRIO bate: escolha o canto para o goleiro pular.

type Side = 'user' | 'bot';
export type ShootoutKick = { side: Side; playerId: string; scored: boolean };
export type Shootout = { kicks: ShootoutKick[]; userGoals: number; botGoals: number; winner: Side };
type PenaltyTeam = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
type PenaltyPlayer = { id: string; name: string; overall: number; primary_position: string };
type Outcome = 'gol' | 'defesa' | 'fora' | 'trave';
type Phase = 'aim' | 'power' | 'dive' | 'flying' | 'done';
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
};
type Props = {
  club: PenaltyTeam;
  opponent: PenaltyTeam;
  userTeam: PenaltyPlayer[];
  botTeam: PenaltyPlayer[];
  onFinish: (result: Shootout) => void;
};

// Cena em um SVG 400 x 270
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

// Chance base de defesa conforme a relação entre o canto do chute e o canto do goleiro
function savePct(shot: Zone, keeper: Zone) {
  const dc = Math.abs(shot.col - keeper.col);
  const sameRow = shot.row === keeper.row;
  if (dc === 0) return sameRow ? 0.85 : 0.32;
  if (dc === 1) return sameRow ? 0.14 : 0.05;
  return 0;
}
function pickKeeperZone(): Zone {
  const r = Math.random();
  return { col: r < 0.36 ? 0 : r < 0.64 ? 1 : 2, row: Math.random() < 0.5 ? 0 : 1 };
}

function orderTakers(team: PenaltyPlayer[]) {
  return [
    ...team.filter((player) => player.primary_position !== 'GK').sort((a, b) => b.overall - a.overall),
    ...team.filter((player) => player.primary_position === 'GK'),
  ];
}
function keeperOf(team: PenaltyPlayer[]) {
  return team.find((player) => player.primary_position === 'GK') ?? team[0];
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

function buildResult(kicks: ShootoutKick[]): Shootout {
  const s = status(kicks);
  const winner: Side =
    s.goals.user === s.goals.bot ? (Math.random() < 0.5 ? 'user' : 'bot') : s.goals.user > s.goals.bot ? 'user' : 'bot';
  return { kicks, userGoals: s.goals.user, botGoals: s.goals.bot, winner };
}

export default function PenaltyShootout({ club, opponent, userTeam, botTeam, onFinish }: Props) {
  const takers = useMemo(() => ({ user: orderTakers(userTeam), bot: orderTakers(botTeam) }), [userTeam, botTeam]);
  const keepers = useMemo(() => ({ user: keeperOf(userTeam), bot: keeperOf(botTeam) }), [userTeam, botTeam]);

  const [kicks, setKicks] = useState<ShootoutKick[]>([]);
  const [phase, setPhase] = useState<Phase>('aim');
  const [aim, setAim] = useState<Point>({ x: 0.5, y: 0.5 });
  const [hover, setHover] = useState(-1);
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);

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
  const turn: Side = kicks.length % 2 === 0 ? 'user' : 'bot';
  const shooterFor = (side: Side, list: ShootoutKick[] = kicks): PenaltyPlayer | undefined => {
    const count = list.filter((kick) => kick.side === side).length;
    const arr = takers[side];
    return arr[count % Math.max(1, arr.length)];
  };
  const shooter = shooterFor(turn);
  const result = useMemo(() => (st.finished ? buildResult(kicks) : null), [kicks]);

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
    if (kicks.length % 2 === 0) {
      setAim({ x: 0.5, y: 0.5 });
      setPhase('aim');
    } else {
      setPhase('dive');
    }
  }, [kicks.length]);

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
        setFlash({ text: texts[plan.outcome][mine ? 0 : 1], good });
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
    setAim(p);
    if (down) {
      powerRef.current = 0;
      setPhase('power');
    }
  }

  // Você bate: a mira e a força definem onde a bola vai e se o goleiro pega
  function shootUser() {
    if (phase !== 'power') return;
    const player = shooterFor('user');
    const keeper = keepers.bot;
    if (!player) return;
    const pw = powerRef.current;
    const mira = aimRef.current;
    const skill = (player.overall - 75) / 100;
    const radius = clamp(0.1 + Math.abs(pw - 0.8) * 0.45 - skill * 0.15, 0.04, 0.4);
    const angle = rand(0, Math.PI * 2);
    const spread = radius * Math.sqrt(Math.random());
    let bx = mira.x + Math.cos(angle) * spread;
    let by = mira.y + Math.sin(angle) * spread * 0.9;
    if (pw < 0.32) {
      bx = lerp(bx, 0.5, 0.6); // chute fraco vai no meio
      by = lerp(by, 0.62, 0.5);
    }
    const keeperZone = pickKeeperZone();
    let outcome: Outcome | null = null;
    if (pw > 0.96) {
      by = -0.2 - Math.random() * 0.15; // chutou forte demais: por cima do gol
      outcome = 'fora';
    } else if (bx < 0 || bx > 1 || by < 0 || by > 1) {
      outcome = 'fora';
    } else if ((bx < 0.035 || bx > 0.965 || by < 0.05) && Math.random() < 0.5) {
      outcome = 'trave';
    }
    if (!outcome) {
      let pSave =
        savePct(zoneOf({ x: clamp(bx, 0, 1), y: clamp(by, 0, 1) }), keeperZone) +
        ((keeper?.overall ?? 75) - player.overall) / 300;
      pSave *= clamp(1.6 - pw * 0.9, 0.6, 1.4);
      if (Math.abs(bx - 0.5) < 0.17) pSave *= 1.6; // bola no meio do gol é mais fácil de pegar
      if (Math.abs(bx - 0.5) > 0.37 && (by < 0.22 || by > 0.78)) pSave *= 0.55; // cantinho
      if (pw < 0.4) pSave = Math.max(pSave, 0.55); // chute fraco é fácil de pegar
      outcome = Math.random() < clamp(pSave, 0, 0.95) ? 'defesa' : 'gol';
    }
    setPhase('flying');
    playKick({
      side: 'user',
      playerId: player.id,
      outcome,
      target: { x: bx, y: by },
      keeper: outcome === 'defesa' ? { x: bx, y: by } : zoneCenter(keeperZone),
      dur: 480 + (1 - pw) * 420,
      arc: 12,
    });
  }

  // O adversário bate: você escolhe o canto onde o goleiro pula
  function chooseDive(col: number, row: number) {
    if (phase !== 'dive') return;
    const player = shooterFor('bot');
    if (!player) return;
    const r = Math.random();
    const shotZone: Zone = { col: r < 0.4 ? 0 : r < 0.6 ? 1 : 2, row: Math.random() < 0.5 ? 0 : 1 };
    const center = zoneCenter(shotZone);
    let target: Point = { x: center.x + rand(-0.06, 0.06), y: center.y + rand(-0.08, 0.08) };
    const missChance = clamp(0.07 + (80 - player.overall) * 0.004, 0.03, 0.2);
    let outcome: Outcome;
    if (Math.random() < missChance) {
      if (Math.random() < 0.4) {
        outcome = 'trave';
        target = { x: shotZone.col === 0 ? 0.01 : shotZone.col === 2 ? 0.99 : 0.5, y: shotZone.col === 1 ? 0.02 : center.y };
      } else {
        outcome = 'fora';
        target = { x: shotZone.col === 0 ? -0.15 : shotZone.col === 2 ? 1.15 : 0.5, y: shotZone.col === 1 ? -0.25 : center.y };
      }
    } else {
      let pSave = savePct(shotZone, { col, row });
      if (pSave > 0) pSave = clamp(pSave + ((keepers.user?.overall ?? 75) - player.overall) / 300, 0.02, 0.95);
      outcome = Math.random() < pSave ? 'defesa' : 'gol';
    }
    setHover(-1);
    setPhase('flying');
    playKick({
      side: 'bot',
      playerId: player.id,
      outcome,
      target,
      keeper: outcome === 'defesa' ? target : zoneCenter({ col, row }),
      dur: rand(520, 640),
      arc: 14,
    });
  }

  // Resolve o que falta automaticamente
  function autoRest() {
    if (phase === 'flying' || phase === 'done') return;
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
    return (
      <span
        key={index}
        title={kick ? nameOf(kick) : ''}
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          fontWeight: 800,
          background: !kick ? 'rgba(255,255,255,.06)' : kick.scored ? '#22c55e' : '#ef4444',
          color: kick ? '#0B1016' : 'rgba(255,255,255,.35)',
        }}
      >
        {!kick ? '•' : kick.scored ? '✓' : '✕'}
      </span>
    );
  };
  const row = (team: PenaltyTeam, side: Side) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <b style={{ minWidth: 46 }}>{team.abbreviation}</b>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
        {Array.from({ length: slots }).map((_, index) => mark(side, index))}
      </div>
      <strong style={{ fontSize: 26, minWidth: 26, textAlign: 'right' }}>{st.goals[side]}</strong>
    </div>
  );

  const zoneRects = [0, 1].flatMap((r) => [0, 1, 2].map((c) => ({ c, r, i: r * 3 + c })));
  const headline =
    phase === 'done'
      ? result?.winner === 'user'
        ? 'Você venceu nos pênaltis!'
        : `${opponent.name} vence nos pênaltis`
      : turn === 'user'
        ? `Sua vez de bater: ${shooter?.name ?? ''}`
        : `${shooter?.name ?? 'O adversário'} vai bater. Defenda!`;
  const hint =
    phase === 'aim'
      ? 'Toque ou clique no gol para mirar.'
      : phase === 'power'
        ? 'Pare a barra na faixa verde para chutar com precisão!'
        : phase === 'dive'
          ? 'Toque no canto para onde o goleiro deve pular.'
          : '';

  return (
    <section
      style={{
        margin: '0 0 16px',
        padding: '16px 14px',
        borderRadius: 14,
        border: '1px solid rgba(245,184,0,.5)',
        background: 'rgba(0,0,0,.35)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <span className="eyebrow">EMPATE NO TEMPO NORMAL</span>
        <h2 style={{ margin: '4px 0 0' }}>
          DISPUTA DE <em>PÊNALTIS</em>
        </h2>
      </div>
      {row(club, 'user')}
      {row(opponent, 'bot')}
      <p style={{ margin: 0, textAlign: 'center', fontWeight: 700 }}>{headline}</p>

      <div style={{ position: 'relative', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 12, cursor: phase === 'aim' ? 'crosshair' : 'default' }}
          role="img"
          aria-label="Gol da cobrança de pênalti"
          onPointerMove={(event) => onScenePointer(event, false)}
          onPointerDown={(event) => onScenePointer(event, true)}
        >
          <defs>
            <linearGradient id="penSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#060b14" />
              <stop offset="1" stopColor="#16243a" />
            </linearGradient>
            <linearGradient id="penGrass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#14532d" />
              <stop offset="1" stopColor="#1f7a3f" />
            </linearGradient>
            <pattern id="penNet" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M8 0H0V8" stroke="rgba(255,255,255,.3)" strokeWidth="0.8" fill="none" />
            </pattern>
            <pattern id="penCrowd" width="10" height="9" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="2" fill="rgba(245,184,0,.35)" />
              <circle cx="8" cy="6" r="2" fill="rgba(255,255,255,.22)" />
            </pattern>
          </defs>
          <rect width={VW} height={GB} fill="url(#penSky)" />
          <rect width={VW} height={GT - 8} fill="url(#penCrowd)" opacity="0.7" />
          <rect y={GB} width={VW} height={VH - GB} fill="url(#penGrass)" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} y={GB + i * 25} width={VW} height={12} fill="rgba(0,0,0,.08)" />
          ))}
          <g stroke="rgba(255,255,255,.55)" strokeWidth="1.6" fill="none">
            <line x1="0" y1={GB} x2={VW} y2={GB} />
            <line x1="46" y1={GB} x2="8" y2={VH} />
            <line x1="354" y1={GB} x2="392" y2={VH} />
            <line x1="29" y1="214" x2="371" y2="214" />
          </g>
          <circle cx={SPOT.x} cy={SPOT.y} r="2.5" fill="#fff" />

          <rect x={GL} y={GT} width={GW} height={GH} fill="rgba(10,16,26,.55)" />
          <rect x={GL} y={GT} width={GW} height={GH} fill="url(#penNet)" />
          <rect ref={netRef} x={GL} y={GT} width={GW} height={GH} fill="#ffffff" style={{ opacity: 0, transition: 'opacity .4s' }} />

          <g ref={keeperRef} transform={`translate(${IDLE.x} ${IDLE.y})`}>
            <line x1="-8" y1="-16" x2="-21" y2="-30" stroke="#22c55e" strokeWidth="5" strokeLinecap="round" />
            <line x1="8" y1="-16" x2="21" y2="-30" stroke="#22c55e" strokeWidth="5" strokeLinecap="round" />
            <circle cx="-21" cy="-31" r="4" fill="#ffffff" />
            <circle cx="21" cy="-31" r="4" fill="#ffffff" />
            <rect x="-7" y="2" width="5" height="20" rx="2" fill="#334155" />
            <rect x="2" y="2" width="5" height="20" rx="2" fill="#334155" />
            <rect x="-9" y="-22" width="18" height="26" rx="4" fill="#22c55e" />
            <circle cx="0" cy="-29" r="6" fill="#f1c9a0" />
          </g>

          <g stroke="#f4f4f0" strokeWidth="6" strokeLinecap="square" fill="none">
            <line x1={GL} y1={GB} x2={GL} y2={GT} />
            <line x1={GL + GW} y1={GB} x2={GL + GW} y2={GT} />
            <line x1={GL - 3} y1={GT} x2={GL + GW + 3} y2={GT} />
          </g>

          <g ref={ballRef} transform={`translate(${SPOT.x} ${SPOT.y})`}>
            <ellipse cy="7" rx="7" ry="2.5" fill="rgba(0,0,0,.35)" />
            <circle r="7" fill="#ffffff" stroke="#0b1016" strokeWidth="1.2" />
            <polygon points="0,-3.2 3,-1 1.9,2.6 -1.9,2.6 -3,-1" fill="#0b1016" />
          </g>

          {(phase === 'aim' || phase === 'power') && (
            <g transform={`translate(${toSvg(aim).x.toFixed(1)} ${toSvg(aim).y.toFixed(1)})`} pointerEvents="none">
              <circle r="10" fill="rgba(245,184,0,.15)" stroke="#F5B800" strokeWidth="2" />
              <line x1="-15" y1="0" x2="-6" y2="0" stroke="#F5B800" strokeWidth="2" />
              <line x1="6" y1="0" x2="15" y2="0" stroke="#F5B800" strokeWidth="2" />
              <line x1="0" y1="-15" x2="0" y2="-6" stroke="#F5B800" strokeWidth="2" />
              <line x1="0" y1="6" x2="0" y2="15" stroke="#F5B800" strokeWidth="2" />
            </g>
          )}

          {phase === 'dive' &&
            zoneRects.map(({ c, r, i }) => (
              <rect
                key={i}
                x={GL + (c * GW) / 3}
                y={GT + (r * GH) / 2}
                width={GW / 3}
                height={GH / 2}
                fill={hover === i ? 'rgba(245,184,0,.32)' : 'rgba(255,255,255,.07)'}
                stroke="rgba(255,255,255,.45)"
                strokeWidth="1"
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(-1)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  chooseDive(c, r);
                }}
              />
            ))}
        </svg>

        {flash && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              fontFamily: "'Bebas Neue', 'Oswald', sans-serif",
              fontSize: 'clamp(30px, 8vw, 52px)',
              letterSpacing: 2,
              textAlign: 'center',
              color: flash.good ? '#22c55e' : '#f87171',
              textShadow: '0 2px 14px rgba(0,0,0,.9)',
            }}
          >
            {flash.text}
          </div>
        )}
      </div>

      {phase === 'power' && (
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 720,
              height: 20,
              borderRadius: 10,
              background: 'linear-gradient(90deg,#ef4444 0 35%,#facc15 35% 62%,#22c55e 62% 92%,#ef4444 92% 100%)',
              overflow: 'hidden',
            }}
          >
            <div
              ref={barRef}
              style={{ position: 'absolute', top: 0, bottom: 0, left: '0%', width: 5, marginLeft: -2, background: '#fff', boxShadow: '0 0 8px #000' }}
            />
          </div>
          <button className="gold-button large" onPointerDown={() => shootUser()}>
            ⚽ CHUTAR!
          </button>
        </div>
      )}

      {hint && <p style={{ margin: 0, textAlign: 'center', opacity: 0.8, fontSize: 14 }}>{hint}</p>}

      {phase === 'done' && result && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="gold-button large" onClick={() => onFinish(result)}>
            Ver resultado
          </button>
        </div>
      )}
      {phase !== 'done' && phase !== 'flying' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="outline-button" onClick={autoRest}>
            Simular o resto automaticamente
          </button>
        </div>
      )}
    </section>
  );
}
