import { useEffect, useMemo, useRef, useState } from 'react';

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
type Props = {
  club: PitchTeam;
  opponent: PitchTeam;
  userTeam: PitchPlayer[];
  botTeam: PitchPlayer[];
  events: PitchEvent[];
  // Chamado no instante em que a bola entra no gol (para o placar subir só nessa hora)
  onGoal?: (id: number, side: Side) => void;
  // Muda quando começa o 2º tempo: limpa as jogadas em andamento e recomeça com a saída de bola
  restartKey?: number;
  // Cansaço: o campo SOMA o esforço de cada jogador em `effort` (corrida, condução com a bola, sprints e desarmes)
  // e LÊ de `slow` (0 a ~0,25) o quanto cada um está mais lento por estar cansado. As chaves são `user-CM`, `bot-LF`...
  workRef?: { current: { effort: Record<string, number>; slow: Record<string, number> } };
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

function toPoint(side: Side, f: number, g: number): Point {
  const ff = side === 'user' ? f : 1 - f;
  const gg = side === 'user' ? g : 1 - g;
  return { x: FX0 + ff * (FX1 - FX0), y: FY0 + gg * (FY1 - FY0) };
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
function choosePass(h: Slot, all: Slot[]): Slot | undefined {
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
      (pressure ? 0.2 : 0.9) * fwd + 0.7 * open - Math.abs(dd - 150) / 220 + Math.random() * 0.7 + (pressure && fwd < 0 ? 0.5 : 0);
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

export default function MatchPitch({ club, opponent, userTeam, botTeam, events, onGoal, restartKey, workRef }: Props) {
  const workRefLocal = useRef(workRef);
  workRefLocal.current = workRef;
  const onGoalRef = useRef(onGoal);
  onGoalRef.current = onGoal;
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
  const ballNode = useRef<SVGGElement | null>(null);
  const ringNode = useRef<SVGGElement | null>(null);
  const nameNode = useRef<SVGTextElement | null>(null);
  const liftNode = useRef<SVGGElement | null>(null);
  const spinNode = useRef<SVGGElement | null>(null);
  const spin = useRef({ angle: 0, x: MID_X, y: MID_Y });
  const trailNodes = useRef<(SVGCircleElement | null)[]>([]);
  const trailPts = useRef<Point[]>([]);
  const netNodes = useRef<Record<Side, SVGRectElement | null>>({ user: null, bot: null });
  const [caption, setCaption] = useState('Bola rolando');
  const [goalText, setGoalText] = useState('');

  const find = (key: string) => slotsRef.current.find((s) => s.key === key);

  // A rede balança quando a bola entra
  function flashNet(side: Side) {
    const node = netNodes.current[side];
    if (!node) return;
    node.setAttribute('fill', 'rgba(255,255,255,.65)');
    window.setTimeout(() => node.setAttribute('fill', 'rgba(255,255,255,.12)'), 750);
  }

  // Comemoração: o autor do gol sai correndo para o canto (na maioria das vezes) e o time vai atrás dele
  function startCelebration(side: Side, actorKey: string, label = 'GOL!') {
    const st = engine.current;
    const a = find(actorKey);
    const dir = dirOf(side);
    const goalX = dir > 0 ? FX1 : FX0;
    const run: Point | undefined =
      a && Math.random() < 0.6 ? { x: goalX - dir * 38, y: a.y < MID_Y ? FY0 + 34 : FY1 - 34 } : undefined;
    st.celebrate = { side, actor: actorKey, until: performance.now() + 2200, run };
    st.holder = null;
    st.overrides = {};
    const who = a?.name ?? '';
    setGoalText(`${label} ${who}`.trim());
    window.setTimeout(() => setGoalText(''), 2000);
  }

  // Drible: finta para o lado do marcador e acelera por fora. Pode dar certo ou o marcador desarma.
  function dribbleSteps(h: Slot, opp: Slot, ambient: boolean, forceWin: boolean): Step[] {
    const st = engine.current;
    const d = dirOf(h.side);
    let sg = opp.y >= h.y ? -1 : 1;
    if (h.y + sg * 40 < FY0 + 25 || h.y + sg * 40 > FY1 - 25) sg = -sg;
    const chance = clamp(0.58 + (h.ovr - opp.ovr) / 80, 0.3, 0.85);
    const win = forceWin || Math.random() < chance;
    const first: Step = {
      kind: 'carry',
      to: {
        x: clamp(opp.x - d * 6, FX0 + 20, FX1 - 20),
        y: clamp(opp.y + sg * 38, FY0 + 20, FY1 - 20),
      },
      dur: 340,
      ambient,
      dribble: true,
      caption: win ? `${h.name} dribla ${opp.name}` : `${h.name} tenta driblar ${opp.name}`,
      after: () => {
        const t = performance.now();
        if (win) {
          // O marcador fica para trás, desequilibrado
          st.overrides[opp.key] = { x: opp.x, y: opp.y, until: t + 1000, speed: 0.18 };
        } else {
          st.queue = [];
          st.active = null;
          st.holder = opp.key;
          st.poss = opp.side;
          st.overrides = {};
          st.ambientAt = t + 450;
          setCaption(`${opp.name} desarma ${h.name} no drible`);
        }
      },
    };
    if (!win) return [first];
    const second: Step = {
      kind: 'carry',
      to: {
        x: clamp(opp.x + d * 70, FX0 + 20, FX1 - 20),
        y: clamp(opp.y + sg * 26, FY0 + 20, FY1 - 20),
      },
      dur: 400,
      ambient,
      dribble: true,
    };
    return [first, second];
  }

  // Começa um passo da fila (passe, condução, chute ou recuperação)
  function startStep(step: Step, now: number) {
    const st = engine.current;
    const all = slotsRef.current;
    const holder = st.holder ? find(st.holder) : undefined;

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
      // Passes de rotina podem ser interceptados
      if (step.ambient && Math.random() < 0.1) {
        const near = nearestOpp(all, recv.side, lead);
        if (near.slot && near.d < 90) {
          dest = near.slot.key;
          st.overrides[near.slot.key] = { x: lead.x, y: lead.y, until: now + step.dur + 300, speed: 1.2 };
          caption = `${near.slot.name} intercepta o passe${holder ? ` de ${holder.name}` : ''}`;
        }
      }
    } else if (!caption && recv) {
      caption = `${recv.name} recupera a bola`;
    }

    if (caption) setCaption(caption);
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
    type Play = 'central' | 'ponta' | 'lancamento' | 'tabela' | 'solo' | 'contra' | 'longe';
    let play: Play;
    if (backlog > 4 && !critical) play = 'longe'; // jogada curta para não acumular fila
    else if (text.includes('cabece') || text.includes('voleio') || text.includes('bicicleta')) play = 'ponta';
    else if (text.includes('fora da área') || text.includes('de longe') || text.includes('arrisca')) play = 'longe';
    else if (text.includes('contra-ataque')) play = 'contra';
    else if (text.includes('cavadinha') || text.includes('chapéu')) play = 'solo';
    else {
      const table: [Play, number][] = [
        ['central', 3],
        ['ponta', 2.2],
        ['lancamento', 1.5],
        ['tabela', 2],
        ['solo', 2],
        ['contra', 1.4],
        ['longe', ev.type === 'gol' ? 1 : 2],
      ];
      let roll = Math.random() * table.reduce((sum, [, w]) => sum + w, 0);
      play = 'central';
      for (const [name, w] of table) {
        roll -= w;
        if (roll <= 0) {
          play = name;
          break;
        }
      }
    }
    if (play === 'ponta' && !wings.length) play = 'central';
    const partner =
      actorSlot.pos === 'CM'
        ? mine.find((s) => s.key !== actorKey && FORWARDS.includes(s.pos))
        : find(`${S}-CM`);
    if (play === 'tabela' && (!partner || partner.key === actorKey)) play = 'central';

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
                st.overrides[marker.key] = { x: marker.x, y: marker.y, until: performance.now() + 1000, speed: 0.18 };
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
      return [
        // A bola sai pela linha de fundo (fora do campo) antes de ser colocada no canto
        { kind: 'shot', to: { x: goalX + dir * 22, y: cy < MID_Y ? cy + 18 : cy - 18 }, dur: 420, caption: 'Defendeu e a bola sai pela linha de fundo: escanteio!', scripted: true, after: () => { st.poss = S; } },
        { kind: 'shot', to: corner, dur: quick ? 300 : 450, caption: `Escanteio para ${abbr}`, scripted: true, setup },
        { kind: 'wait', to: corner, dur: quick ? 600 : 1500, caption: `Escanteio para ${abbr}`, scripted: true, setup },
        { kind: 'pass', to: { slot: target.key }, dur: 760, arc: 18, caption: `${taker.name} cobra o escanteio`, scripted: true },
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
      if (!direct) {
        q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 760, arc: 18, caption: `${taker.name} cobra o escanteio` }));
      }
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
            if (useCorner) st.queue.unshift(...cornerSteps(backlog > 3));
            else if (outcome !== 'hold') {
              st.queue.unshift({
                kind: 'move',
                to: { slot: defenderKey() },
                dur: 700,
                caption: `${gk?.name ?? 'O goleiro'} espalma e a zaga afasta`,
                scripted: true,
              });
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
              st.queue.unshift({
                kind: 'move',
                to: { slot: defenderKey() },
                dur: 700,
                caption: 'Na trave! A zaga afasta o perigo',
                scripted: true,
              });
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
        q.push(mk({ kind: 'shot', to, dur: kind === 'over' ? 520 : 420, arc: kind === 'over' ? 26 : 0, caption: ev.text, after: tiroDeMeta }));
      }
    }
    st.queue.push(...q);
  }

  // Começo do 2º tempo: descarta o que sobrou do 1º e recomeça com a bola no centro (saída do outro time)
  const lastRestart = useRef(restartKey);
  useEffect(() => {
    if (restartKey === undefined || restartKey === lastRestart.current) return;
    lastRestart.current = restartKey;
    const st = engine.current;
    const now = performance.now();
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
    let last = performance.now();
    engine.current.ambientAt = last + 1200;
    engine.current.runAt = last + 1500;
    // Começa o jogo com a bola parada no meio e cada time na sua metade
    engine.current.holder = null;
    engine.current.ballX = MID_X;
    engine.current.ballY = MID_Y;
    engine.current.kickoff = { side: 'user', until: last + 1600, maxUntil: last + 1600 };

    const loop = (now: number) => {
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
      if (st.kickoff && now >= st.kickoff.until) {
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
        st.ballX += (holderNow.x + ux * 11 - st.ballX) * k;
        const wob = st.active && st.active.step.dribble ? Math.sin(now / 45) * 6 : 0;
        st.ballY += (holderNow.y + uy * 11 + 2 + wob - st.ballY) * k;
      };

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
        const p = Math.min(1, (now - start) / step.dur);
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
        lift = (step.arc ?? 0) * Math.sin(Math.PI * p);
        if (p >= 1) {
          st.active = null;
          if (dest) {
            st.holder = dest;
            st.poss = sideOf(dest);
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
          if (dfn && near.d < 30 && Math.random() < (0.9 * dt) / 1000) {
            // Quem tem overall maior leva vantagem; o marcador perto do gol do adversário chega mais atrasado
            const win = Math.random() < clamp(0.5 + (dfn.ovr - h.ovr) / 90, 0.25, 0.75);
            const dirH = dirOf(h.side);
            const slide = Math.random() < 0.25;
            st.tackleAt = now + 1000;
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
                  const t = performance.now();
                  st.overrides = {};
                  if (win) {
                    // A bola é do marcador: quem perdeu fica desequilibrado, quem ganhou sai jogando
                    st.holder = dfn.key;
                    st.poss = dfn.side;
                    st.overrides[h.key] = { x: h.x, y: h.y, until: t + 800, speed: 0.15 };
                    st.overrides[dfn.key] = {
                      x: clamp(dfn.x - dirH * 55, FX0 + 20, FX1 - 20),
                      y: clamp(dfn.y + rand(-30, 30), FY0 + 20, FY1 - 20),
                      until: t + 650,
                      speed: 1.2,
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
                    st.overrides[dfn.key] = { x: dfn.x, y: dfn.y, until: t + 900, speed: 0.18 };
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
          // Atacante perto do gol chuta em vez de passar, livre ou pressionado (o placar continua sendo decidido
          // pela simulação, então esses chutes de rotina terminam em defesa ou para fora, nunca em gol)
          const canShoot = FORWARDS.includes(h.pos) && toGoal < 240 && near.d > 26;
          if (canShoot && Math.random() < (pressure > 0.4 ? 0.6 : 0.9)) {
            const O = otherSide(h.side);
            const gk = get(`${O}-GK`);
            // Livre: quase sempre manda no gol. Pressionado: erra a maioria. Overall alto ajuda um pouco.
            const onTarget = clamp(lerp(0.9, 0.22, pressure) + (h.ovr - 75) * 0.004, 0.12, 0.96);
            if (gk && Math.random() < onTarget) {
              st.queue.push({
                kind: 'shot',
                to: { slot: gk.key },
                dur: 420,
                ambient: true,
                caption: `${h.name} chuta e ${gk.name} defende`,
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
              const r = choosePass(h, all);
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
          const off = clamp(Math.abs(st.ballX - goalLineX) * 0.1, 16, 52);
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
          const f = clamp(
            BASE[s.pos][0] + (prog - 0.5) * (inPoss ? 0.46 : 0.3) * SHAPE_FACTOR[s.pos] + (isFwd ? (inPoss ? 0.04 : -0.04) : 0),
            0.1,
            0.9,
          );
          const ballG = s.side === 'user' ? (st.ballY - FY0) / (FY1 - FY0) : 1 - (st.ballY - FY0) / (FY1 - FY0);
          const g0 = BASE[s.pos][1];
          const g = clamp(inPoss ? 0.5 + (g0 - 0.5) * 1.18 : g0 + (ballG - g0) * 0.22, 0.07, 0.93);
          const shape = toPoint(s.side, f, g);
          tx = shape.x + s.jx;
          ty = shape.y + s.jy;

          if (inPoss) {
            if (s.pos === 'CM' && holderSlot) {
              // Meio-campista oferece opção de passe atrás da bola, do lado com mais espaço
              tx = (tx + holderSlot.x - d * 55) / 2;
              ty = (ty + holderSlot.y + (Math.sign(MID_Y - holderSlot.y) || 1) * 46) / 2;
            }
          } else if (s.key === presserKey && presserDist < 260) {
            tx = ref.x - d * 16;
            ty = ref.y;
            speedMul = 1.12;
          } else {
            const m = get(`${otherSide(s.side)}-${MARK[s.pos]}`);
            if (m) {
              tx = lerp(tx, m.x - d * 28, 0.6);
              ty = lerp(ty, m.y, 0.6);
            }
            tx = lerp(tx, st.ballX, 0.12);
            ty = lerp(ty, st.ballY, 0.12);
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
        nodes.current[s.key]?.setAttribute('transform', `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`);
      });

      // Bola, anel dourado e nome de quem está com a bola
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
      const hs = st.holder ? get(st.holder) : undefined;
      if (ringNode.current) {
        ringNode.current.style.display = hs ? '' : 'none';
        if (hs) ringNode.current.setAttribute('transform', `translate(${hs.x.toFixed(1)} ${hs.y.toFixed(1)})`);
      }
      if (nameNode.current) {
        if (hs) {
          nameNode.current.setAttribute('x', clamp(hs.x, 60, W - 60).toFixed(1));
          nameNode.current.setAttribute('y', clamp(hs.y - 24, 16, H - 8).toFixed(1));
          if (nameNode.current.textContent !== hs.name) nameNode.current.textContent = hs.name;
        } else if (nameNode.current.textContent) {
          nameNode.current.textContent = '';
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineColor = 'rgba(255,255,255,.55)';
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,.12)',
        background: '#0a2417',
        margin: '0 0 16px',
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }} role="img" aria-label="Campo da partida">
        <rect x={0} y={0} width={W} height={H} fill="#0a2417" />
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={i} x={FX0 + i * 70} y={FY0} width={70} height={FY1 - FY0} fill={i % 2 ? '#10432a' : '#0e3a24'} />
        ))}
        <g fill="none" stroke={lineColor} strokeWidth={2}>
          <rect x={FX0} y={FY0} width={FX1 - FX0} height={FY1 - FY0} />
          <line x1={MID_X} y1={FY0} x2={MID_X} y2={FY1} />
          <circle cx={MID_X} cy={MID_Y} r={48} />
          <rect x={FX0} y={MID_Y - 90} width={92} height={180} />
          <rect x={FX1 - 92} y={MID_Y - 90} width={92} height={180} />
          <rect x={FX0} y={MID_Y - 42} width={36} height={84} />
          <rect x={FX1 - 36} y={MID_Y - 42} width={36} height={84} />
        </g>
        <circle cx={MID_X} cy={MID_Y} r={3} fill={lineColor} />
        <rect ref={(el: SVGRectElement | null) => { netNodes.current.bot = el; }} x={FX0 - 14} y={GOAL_TOP} width={14} height={GOAL_BOTTOM - GOAL_TOP} fill="rgba(255,255,255,.12)" stroke={lineColor} strokeWidth={2} />
        <rect ref={(el: SVGRectElement | null) => { netNodes.current.user = el; }} x={FX1} y={GOAL_TOP} width={14} height={GOAL_BOTTOM - GOAL_TOP} fill="rgba(255,255,255,.12)" stroke={lineColor} strokeWidth={2} />

        {slots.map((s) => {
          const team = s.side === 'user' ? club : opponent;
          return (
            <g key={s.key} ref={(el: SVGGElement | null) => { nodes.current[s.key] = el; }} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`}>
              <ellipse cy={13} rx={11} ry={4} fill="rgba(0,0,0,.35)" />
              <circle r={14} fill={team.primary_color} stroke={team.secondary_color} strokeWidth={3} />
              <text textAnchor="middle" dy={4.5} fontSize={13} fontWeight={700} fill={textOn(team.primary_color)} style={{ pointerEvents: 'none' }}>
                {s.name.slice(0, 1).toUpperCase()}
              </text>
            </g>
          );
        })}

        <g ref={ringNode} style={{ display: 'none' }}>
          <circle r={20} fill="none" stroke="#F5B800" strokeWidth={2.5} />
        </g>
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={`trail-${i}`} ref={(el: SVGCircleElement | null) => { trailNodes.current[i] = el; }} r={5.5 - i * 0.6} fill="#ffffff" opacity={0} />
        ))}
        <g ref={ballNode} transform={`translate(${MID_X} ${MID_Y})`}>
          <ellipse cy={6} rx={6.5} ry={2.6} fill="rgba(0,0,0,.4)" />
          <g ref={liftNode}>
            <defs>
              <clipPath id="ball-clip">
                <circle r={BALL_R} />
              </clipPath>
            </defs>
            <circle r={BALL_R} fill="#ffffff" />
            <g ref={spinNode} clipPath="url(#ball-clip)">
              <polygon points={BALL_CENTER} fill="#15181c" />
              {BALL_SEAMS.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#15181c" strokeWidth={0.9} />
              ))}
              {BALL_EDGES.map((points, i) => (
                <polygon key={i} points={points} fill="#15181c" />
              ))}
            </g>
            <circle r={BALL_R} fill="none" stroke="#15181c" strokeWidth={1.2} />
            
          </g>
        </g>
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

      <div style={{ position: 'absolute', top: 8, left: 10, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#fff', textShadow: '0 1px 3px #000' }}>
        {club.abbreviation} ▶
      </div>
      <div style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#fff', textShadow: '0 1px 3px #000' }}>
        ◀ {opponent.abbreviation}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          padding: '6px 10px',
          borderRadius: 8,
          background: 'rgba(0,0,0,.62)',
          color: '#fff',
          fontSize: 12,
          lineHeight: 1.3,
        }}
      >
        {caption}
      </div>
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
