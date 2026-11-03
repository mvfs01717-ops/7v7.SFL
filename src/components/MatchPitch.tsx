import { useEffect, useMemo, useRef, useState } from 'react';

type Side = 'user' | 'bot';
type PitchPlayer = { id: string; name: string; overall?: number };
type PitchTeam = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
type PitchEvent = { id?: number; minute: number; type: 'posse' | 'finalização' | 'defesa' | 'gol'; text: string; team: Side };
type Props = {
  club: PitchTeam;
  opponent: PitchTeam;
  userTeam: PitchPlayer[];
  botTeam: PitchPlayer[];
  events: PitchEvent[];
  // Chamado no instante em que a bola entra no gol (para o placar subir só nessa hora)
  onGoal?: (id: number, side: Side) => void;
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
type Step = {
  kind: 'pass' | 'shot' | 'move' | 'carry';
  to: { slot: string } | Point;
  dur: number;
  critical?: boolean;
  scripted?: boolean;
  ambient?: boolean;
  dribble?: boolean;
  arrive?: boolean;
  caption?: string;
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
  celebrate: { side: Side; actor: string; until: number } | null;
  overrides: Record<string, Override>;
  kickoff: { side: Side; until: number; maxUntil: number } | null;
  lastKey: string;
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
const KICK: Record<Pos, [number, number]> = {
  GK: [0.05, 0.5],
  LB: [0.2, 0.25],
  RB: [0.2, 0.75],
  CM: [0.44, 0.5],
  LF: [0.38, 0.2],
  RF: [0.38, 0.8],
  CF: [0.36, 0.5],
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

export default function MatchPitch({ club, opponent, userTeam, botTeam, events, onGoal }: Props) {
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
  });
  const nodes = useRef<Record<string, SVGGElement | null>>({});
  const ballNode = useRef<SVGGElement | null>(null);
  const ringNode = useRef<SVGGElement | null>(null);
  const nameNode = useRef<SVGTextElement | null>(null);
  const [caption, setCaption] = useState('Bola rolando');
  const [goalText, setGoalText] = useState('');

  const find = (key: string) => slotsRef.current.find((s) => s.key === key);

  function startCelebration(side: Side, actorKey: string) {
    const st = engine.current;
    st.celebrate = { side, actor: actorKey, until: performance.now() + 2000 };
    st.holder = null;
    st.overrides = {};
    const who = find(actorKey)?.name ?? '';
    setGoalText(`GOL! ${who}`.trim());
    window.setTimeout(() => setGoalText(''), 1900);
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

    if (step.kind === 'carry') {
      if (!holder) return;
      const to = step.to as Point;
      st.active = { step, from: { x: st.ballX, y: st.ballY }, start: now, dest: null };
      st.overrides[holder.key] = { x: to.x, y: to.y, until: now + step.dur + 120, speed: step.dribble ? 1.3 : step.arrive ? 1.25 : 0.9 };
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

  // Transforma o lance gerado pela simulação em uma jogada: passe, condução e chute
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
    if (st.active && st.active.step.ambient) st.active = null;
    if (st.queue.filter((s) => !s.critical).length > 8) st.queue = st.queue.filter((s) => s.critical);

    const mk = (s: Step): Step => ({ ...s, scripted: true, critical });
    const q: Step[] = [];
    const holderSide = st.holder ? sideOf(st.holder) : null;
    if (holderSide !== S) q.push(mk({ kind: 'move', to: { slot: `${S}-CM` }, dur: 520 }));

    if (ev.type === 'posse') {
      st.runAt = 0; // o time que ficou com a bola começa a se movimentar já
      st.queue.push(...q);
      return;
    }

    // Quem aparece no texto do lance (o goleiro não conta como finalizador)
    const named = slotsRef.current
      .filter((s) => s.side === S && ev.text.includes(s.name))
      .sort((a, b) => b.name.length - a.name.length)[0];
    const actorKey = named && named.pos !== 'GK' ? named.key : `${S}-${pick(['CF', 'LF', 'RF'])}`;
    if (!actorKey.endsWith('-CM') && Math.random() < 0.55) q.push(mk({ kind: 'pass', to: { slot: `${S}-CM` }, dur: 520 }));
    q.push(mk({ kind: 'pass', to: { slot: actorKey }, dur: 560 }));
    const carryTo = { x: goalX - dir * rand(105, 135), y: MID_Y + rand(-55, 55) };
    // Só chuta depois de chegar perto do gol (espera o atacante chegar, com limite de tempo)
    q.push(mk({ kind: 'carry', to: carryTo, dur: 4200, arrive: true }));

    // Em parte das jogadas o atacante dribla um marcador antes de finalizar
    const actor = find(actorKey);
    const marker = find(`${O}-${pick(['LB', 'RB', 'CM'])}`);
    if (actor && marker && ev.type !== 'defesa' && Math.random() < 0.65) {
      const sg = carryTo.y >= MID_Y ? -1 : 1;
      // O marcador sai para encontrar o atacante na hora do drible
      st.overrides[marker.key] = {
        x: carryTo.x + dir * 34,
        y: carryTo.y - sg * 4,
        until: performance.now() + 3500,
        speed: 1,
      };
      const ghost = { ...marker, x: carryTo.x + dir * 34, y: carryTo.y - sg * 4 } as Slot;
      const hero = { ...actor, x: carryTo.x, y: carryTo.y } as Slot;
      dribbleSteps(hero, ghost, false, true).forEach((step, i) => {
        const base = mk(step);
        base.after = i === 0
          ? () => {
              st.overrides[marker.key] = { x: marker.x, y: marker.y, until: performance.now() + 1000, speed: 0.18 };
            }
          : undefined;
        q.push(base);
      });
    }

    if (ev.type === 'gol') {
      q.push(
        mk({
          kind: 'shot',
          to: { x: goalX + dir * 12, y: MID_Y + rand(-18, 18) },
          dur: 360,
          caption: ev.text,
          after: () => {
            startCelebration(S, actorKey);
            onGoalRef.current?.(ev.id ?? -1, S);
          },
        }),
      );
    } else if (ev.type === 'defesa') {
      q.push(mk({ kind: 'shot', to: { slot: `${O}-GK` }, dur: 420, caption: ev.text }));
    } else {
      const wideY = MID_Y + (Math.random() < 0.5 ? -1 : 1) * (GOAL_BOTTOM - MID_Y + rand(14, 40));
      q.push(
        mk({
          kind: 'shot',
          to: { x: goalX + dir * 8, y: wideY },
          dur: 420,
          caption: ev.text,
          after: () => {
            st.queue.unshift({ kind: 'move', to: { slot: `${O}-GK` }, dur: 800, caption: 'Tiro de meta', scripted: true });
          },
        }),
      );
    }
    st.queue.push(...q);
  }

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
          kickSide === s.side && s.pos === 'CM' ? { x: MID_X - dirOf(s.side) * 12, y: MID_Y } : s.kick;
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
        st.holder = `${st.kickoff.side}-CM`;
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
      if (st.active && st.active.step.kind !== 'carry') {
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

      // Desarme: quem está com a bola e é pressionado pode perdê-la (só em jogadas de rotina)
      const scriptedPending = st.queue.some((s) => s.scripted) || !!(st.active && st.active.step.scripted);
      if (!celebrating && !scriptedPending && st.holder && (!st.active || st.active.step.kind === 'carry') && !(st.active && st.active.step.dribble)) {
        const h = get(st.holder);
        if (h && h.pos !== 'GK') {
          const near = nearestOpp(all, h.side, h);
          if (near.slot && near.d < 21 && Math.random() < (0.4 * dt) / 1000) {
            st.active = null;
            st.holder = near.slot.key;
            st.poss = near.slot.side;
            st.overrides = {};
            st.ambientAt = now + 450;
            setCaption(`${near.slot.name} desarma ${h.name}`);
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
            const r = choosePass(h, all);
            if (r) st.queue.push({ kind: 'pass', to: { slot: r.key }, dur: passDur(dist(h, r)), ambient: true });
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
              speedMul = 0.2;
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
          if (kicking && s.pos === 'CM') {
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

        const maxV = s.maxSpeed * speedMul;
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
        <rect x={FX0 - 14} y={GOAL_TOP} width={14} height={GOAL_BOTTOM - GOAL_TOP} fill="rgba(255,255,255,.12)" stroke={lineColor} strokeWidth={2} />
        <rect x={FX1} y={GOAL_TOP} width={14} height={GOAL_BOTTOM - GOAL_TOP} fill="rgba(255,255,255,.12)" stroke={lineColor} strokeWidth={2} />

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
        <g ref={ballNode} transform={`translate(${MID_X} ${MID_Y})`}>
          <ellipse cy={5} rx={6} ry={2.5} fill="rgba(0,0,0,.4)" />
          <circle r={6.5} fill="#ffffff" stroke="#111111" strokeWidth={1.5} />
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
