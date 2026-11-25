import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LiveCam } from '@/components/game/LiveCam';
import type { LiveSnap } from '@/components/MatchPitch';
import type { Cam, Proj } from '@/components/game/ReplayPlayer';
import type { Ambience } from '@/lib/game/ambience';
import { EFFECTS, EFFECT_LABEL, curveOffset, PLAYS, PLAY_INFO, PLAY_RUNS, cornerSide, idealPower, predictLand, type CEffect, type CExec, type CPlay } from '@/lib/game/corner';

// Tela do cobrador de escanteio (inspirada no FC): mira no gramado, linha ciano da bola até o ponto de queda, efeito escrito embaixo da bola,
// barra de força, menu de jogadas ensaiadas com prévia discreta das corridas e legenda de comandos. Tudo com discos, sem figuras humanas.
type Props = {
  minute: number;
  club: { abbreviation: string; primary_color: string; secondary_color?: string };
  opponentColor?: string;
  taker?: string;
  takerOvr: number;
  keeper?: string;
  keeperOvr?: number;
  floating?: boolean;
  seconds?: number;
  onDone: (exec: CExec) => void;
  // Câmera de jogo (a mesma das câmeras 3D da partida): times, ambiente e placar
  live: { club: Team; opponent: Team; home: 'user' | 'bot'; ambience: Ambience; score: { user: number; bot: number } };
};
type Team = { name: string; abbreviation: string; primary_color: string; secondary_color: string };

// Campo do jogo (mesmas medidas da câmera 3D): gol do usuário atacando para a direita
const CROSS_LABEL: Record<string, string> = { dentro: 'Cruzamento com curva para dentro', fora: 'Cruzamento com curva para fora', direta: 'Cruzamento direto', alta: 'Cruzamento por cobertura', rasteira: 'Cruzamento rasteiro' };
const FX1 = 720;
const FY0 = 10;
const FY1 = 430;
const MID_Y = 220;
const SW = 740;
const SH = 564;
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// (u, v) da área -> campo (mesma conversão que o campo usa para posicionar os discos do escanteio)
const toField = (side: 0 | 1, u: number, v: number) => ({ x: FX1 - (28 + clampN(v, 0, 1.05) * 115), y: clampN(MID_Y + (side === 0 ? -1 : 1) * (1 - 2 * u) * 46, FY0 + 18, FY1 - 18) });
const fromField = (side: 0 | 1, x: number, y: number) => ({ u: clampN((1 - (y - MID_Y) / ((side === 0 ? -1 : 1) * 46)) / 2, 0, 1), v: clampN((FX1 - x - 28) / 115, 0.02, 1) });
const AREA_SECS = 6; // janela de organização antes do cruzamento
const KICK_CONTACT = 760; // ms entre confirmar e o contato com a bola (recuo + aproximação)
const DEF_BASE = [{ u: 0.16, v: 0.12 }, { u: 0.36, v: 0.3 }, { u: 0.6, v: 0.16 }, { u: 0.84, v: 0.34 }, { u: 0.5, v: 0.62 }];

export default function CornerTaker({ minute, club, opponentColor = '#c8102e', taker, takerOvr, keeper, keeperOvr, floating = false, seconds, onDone, live }: Props) {
  const side = useMemo(() => cornerSide(minute), [minute]);
  const total = seconds ?? (floating ? 14 : 20);
  const [left, setLeft] = useState(total);
  const [play, setPlay] = useState<CPlay>('central');
  const [fx, setFx] = useState<CEffect>('direta');
  const [ci, setCi] = useState(0.7); // intensidade do efeito (curva)
  const [kicking, setKicking] = useState(false);
  // Etapa 2 (organização): depois da mira e da força, câmera voltada para a área e controle manual de um atacante
  const [phase, setPhase] = useState<'aim' | 'area'>('aim');
  const phaseRef = useRef<'aim' | 'area' | 'kick'>('aim');
  const [areaLeft, setAreaLeft] = useState(AREA_SECS);
  const [selA, setSelA] = useState(0);
  const selRef = useRef(0);
  selRef.current = selA;
  const power0 = useRef(0.5);
  const keysDown = useRef(new Set<string>());
  const sim = useRef<{ atk: { x: number; y: number; vx: number; vy: number }[]; def: { x: number; y: number }[]; t0: number; last: number; moveTo: { x: number; y: number } | null; marked: number } | null>(null);
  const kick = useRef<{ t0: number; dst: { x: number; y: number }; exec: CExec; dur: number } | null>(null);
  const [aim, setAim] = useState(() => ({ ...PLAY_INFO.central.zone }));
  const [pw, setPw] = useState(0);
  const [charging, setCharging] = useState(false);
  const done = useRef(false);
  const cur = useRef({ play, fx, aim, pw, ci });
  cur.current = { play, fx, aim, pw, ci };
  const chargeStart = useRef(0);

  const finish = (power: number, cp?: CExec['cp']) => {
    if (done.current) return;
    done.current = true;
    if (phaseRef.current === 'area') phaseRef.current = 'kick';
    keysDown.current.clear();
    const c = cur.current;
    const exec: CExec = { play: c.play, side, ax: c.aim.u, ay: c.aim.v, pw: Math.min(1, Math.max(0.05, power)), fx: c.fx, ci: c.fx === 'dentro' || c.fx === 'fora' ? c.ci : undefined, cp };
    if (floating) { onDone(exec); return; } // multiplayer: o relógio da sala não espera a animação
    // Batida: o disco recua, ganha embalo, toca na bola e a bola sai na curva escolhida; a câmera acompanha. Só então a cobrança segue para a partida.
    const pr = predictLand(exec);
    const dst = toField(side, pr.u, pr.v);
    const dur = clampN(1000 - exec.pw * 520, 460, 1000) * 1.25;
    kick.current = { t0: performance.now(), dst, exec, dur };
    setKicking(true);
    window.setTimeout(() => onDone(exec), KICK_CONTACT + dur + 350);
  };
  // Tempo esgotado: executa o que está montado, com força um pouco abaixo da ideal (quem não decide perde qualidade)
  useEffect(() => {
    const id = window.setInterval(() => { if (phaseRef.current === 'aim') setLeft((n) => n - 1); }, 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0 && phaseRef.current === 'aim') finish(Math.max(0.2, idealPower({ u: cur.current.aim.u, v: cur.current.aim.v }, cur.current.fx) - 0.12));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  // Força: sobe enquanto o botão está pressionado (0 a 100% em ~1,3 s); soltar executa a cobrança
  useEffect(() => {
    if (!charging) return;
    let raf = 0;
    const t0 = performance.now();
    chargeStart.current = t0;
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0) / 1300);
      setPw(v);
      cur.current.pw = v;
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charging]);
  useEffect(() => {
    if (phase !== 'area') return undefined;
    const id = window.setInterval(() => setAreaLeft((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (phase === 'area' && areaLeft <= 0) doKick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaLeft, phase]);
  const release = () => {
    if (!charging) return;
    setCharging(false);
    const pw1 = Math.max(0.05, cur.current.pw);
    if (floating || cur.current.play === 'curto') finish(pw1); // multiplayer e cobrança curta: sem etapa de controle da área
    else startArea(pw1);
  };
  // Posições do jogo da área no campo; os atacantes saem da base da jogada e a marcação começa em zona
  const startArea = (power: number) => {
    if (done.current || phaseRef.current !== 'aim') return;
    power0.current = power;
    const rs0 = PLAY_RUNS[cur.current.play];
    const sd = cur.current.aim;
    sim.current = {
      atk: rs0.map(([a]) => { const p = toField(side, a.u, a.v); return { x: p.x, y: p.y, vx: 0, vy: 0 }; }),
      def: [...DEF_BASE, { u: 0.5, v: 0.62 }].map((d) => toField(side, d.u, d.v)),
      t0: performance.now(), last: performance.now(), moveTo: null, marked: 99,
    };
    // começa controlando quem corre para mais perto do ponto mirado
    const pp = predictLand({ play: cur.current.play, side, ax: sd.u, ay: sd.v, pw: power, fx: cur.current.fx });
    let best = 0;
    rs0.forEach(([, b], k) => { if (Math.hypot(b.u - pp.u, b.v - pp.v) < Math.hypot(rs0[best][1].u - pp.u, rs0[best][1].v - pp.v)) best = k; });
    setSelA(best);
    phaseRef.current = 'area';
    setPhase('area');
    setAreaLeft(AREA_SECS);
  };
  const doKick = () => {
    if (phaseRef.current !== 'area' || done.current) return;
    const sm = sim.current;
    const k = selRef.current;
    let cp: CExec['cp'];
    if (sm) {
      const a = sm.atk[k];
      const uv = fromField(side, a.x, a.y);
      const free = Math.max(0, Math.min(1, (sm.marked - 8) / 26));
      cp = { k, u: uv.u, v: uv.v, free };
    }
    finish(power0.current, cp);
  };
  const startCharge = () => {
    if (done.current || phaseRef.current !== 'aim') return;
    setPw(0);
    cur.current.pw = 0;
    setCharging(true);
  };

  // Teclado: setas movem a mira, 1 a 7 escolhem a jogada, E troca o efeito, Espaço (segurar) carrega a força
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (done.current) return;
      if (phaseRef.current === 'area') {
        // Etapa 2: setas/WASD movem o atacante, Tab troca, Shift protege o espaço, Espaço/Enter manda o cruzamento
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'Shift'].includes(k)) { e.preventDefault(); keysDown.current.add(k); if (sim.current) sim.current.moveTo = null; }
        else if (k === 'Tab' || k === 'q') { e.preventDefault(); setSelA((v) => (v + 1) % PLAY_RUNS[cur.current.play].length); }
        else if ((k === ' ' || k === 'Enter') && !e.repeat) { e.preventDefault(); doKick(); }
        return;
      }
      const step = 0.04;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setAim((a) => ({ u: Math.min(1, Math.max(0, a.u + dx * (side === 0 ? -1 : 1))), v: Math.min(1, Math.max(0.02, a.v + dy)) }));
      } else if (/^[1-7]$/.test(e.key)) pickPlay(PLAYS[Number(e.key) - 1]);
      else if (e.key === 'z' || e.key === 'Z') setCi((v) => Math.max(0.2, +(v - 0.1).toFixed(2)));
      else if (e.key === 'x' || e.key === 'X') setCi((v) => Math.min(1, +(v + 0.1).toFixed(2)));
      else if (e.key === 'e' || e.key === 'E') setFx((f) => EFFECTS[(EFFECTS.indexOf(f) + 1) % EFFECTS.length]);
      else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        startCharge();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (e.key === ' ' || e.key === 'Enter') release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charging, side]);

  function pickPlay(p: CPlay) {
    setPlay(p);
    setAim({ ...PLAY_INFO[p].zone });
    if (p === 'recuo' && fx === 'alta') setFx('direta');
  }
  // ---------- Apresentação: câmera de jogo (LiveCam) perto da bandeirinha, atrás do cobrador ----------
  const sgn = side === 0 ? -1 : 1;
  const cornerY = side === 0 ? FY0 : FY1;
  const runs = PLAY_RUNS[play];
  const camRef = useRef<Cam | null>(null);
  if (!camRef.current) camRef.current = { x: FX1 + 66, y: cornerY + sgn * 92, z: 74, tx: 664, ty: MID_Y + sgn * 4, tz: 0, f: 540 };
  // discos do escanteio no campo (gravados direto na estrutura que a câmera lê)
  const snapRef = useRef<LiveSnap | null>(null);
  if (!snapRef.current) {
    snapRef.current = {
      ball: [FX1 - 3, cornerY - sgn * 4, 0],
      pts: new Array(28).fill(0),
      sides: [...Array(7).fill('user'), ...Array(7).fill('bot')],
      letters: new Array(14).fill(''),
      keys: Array.from({ length: 14 }, (_, n) => `c${n}`),
      holder: 0,
      frozen: false,
      fx: null,
    };
  }
  const st = useRef({ play, fx, aim, pw, side, recv: 0, ci });
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const pred = predictLand({ play, side, ax: aim.u, ay: aim.v, pw: pw || idealPower(aim, fx), fx });
  const recvIdx = runs.reduce((best, [, b], k) => (Math.hypot(b.u - pred.u, b.v - pred.v) < Math.hypot(runs[best][1].u - pred.u, runs[best][1].v - pred.v) ? k : best), 0);
  st.current = { play, fx, aim, pw, side, recv: phase === 'area' ? selA : recvIdx, ci };
  const previewAt = useRef(performance.now());
  useEffect(() => {
    previewAt.current = performance.now();
  }, [play]);

  // Posições: cobrador junto à bandeirinha, atacantes nas posições iniciais da jogada (com uma prévia suave do movimento ao trocar de jogada), defesa em zona
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const sn = snapRef.current!;
      const c = st.current;
      const rs = runsRef.current;
      const put = (n: number, x: number, y: number) => {
        sn.pts[n * 2] = x;
        sn.pts[n * 2 + 1] = y;
      };
      const sg = c.side === 0 ? -1 : 1;
      const cy = c.side === 0 ? FY0 : FY1;
      // cobrador logo atrás da bola, do lado da câmera
      const cm = camRef.current!;
      const bx0 = FX1 - 3;
      const by0 = cy - sg * 4;
      const cl = Math.hypot(cm.x - bx0, cm.y - by0) || 1;
      const ux = (cm.x - bx0) / cl;
      const uy = (cm.y - by0) / cl;
      const kk = kick.current;
      let takerD = 22;
      let bxp = FX1 - 3;
      let byp = cy - sg * 4;
      let bzp = 0;
      let runK = -1; // progresso das corridas dos atacantes durante a batida (0 a 1)
      if (kk) {
        const e = now - kk.t0;
        if (e < 520) takerD = 22 + 20 * easeIO(e / 520); // recua para pegar embalo
        else if (e < KICK_CONTACT) { const q = (e - 520) / (KICK_CONTACT - 520); takerD = 42 - 36 * q * q; } // acelera até a bola
        else takerD = 6 - 4 * Math.min(1, (e - KICK_CONTACT) / 400); // passa pela bola e segue o movimento
        if (e >= KICK_CONTACT) {
          const t = Math.min(1, (e - KICK_CONTACT) / kk.dur);
          const te = 1 - Math.pow(1 - t, 1.35);
          const cOff = curveOffset({ fx: kk.exec.fx, ci: kk.exec.ci }, bxp, byp, kk.dst.x, kk.dst.y, 1);
          const dl = Math.hypot(kk.dst.x - bxp, kk.dst.y - byp) || 1;
          const sn2 = Math.sin(Math.PI * te);
          const arc = kk.exec.fx === 'alta' ? 36 : kk.exec.fx === 'rasteira' ? 3 : kk.exec.fx === 'direta' ? 14 : 24;
          bxp += (kk.dst.x - bxp) * te - ((kk.dst.y - by0) / dl) * cOff * sn2;
          byp += (kk.dst.y - byp) * te + ((kk.dst.x - bx0) / dl) * cOff * sn2;
          bzp = arc * sn2;
          // a câmera acompanha a bola com suavidade
          cm.tx += (bxp - cm.tx) * 0.035;
          cm.ty += (byp - cm.ty) * 0.035;
          cm.x += (FX1 + 40 - cm.x) * 0.012;
        } else if (e < 520) {
          // pequeno ajuste de enquadramento na preparação: aproxima um pouco da bola
          cm.f += (560 - cm.f) * 0.03;
        }
        runK = Math.min(1, e / (KICK_CONTACT + kk.dur * 0.6));
      }
      put(0, bx0 + ux * takerD, by0 + uy * takerD);
      sn.ball[0] = bxp;
      sn.ball[1] = byp;
      sn.ball[2] = bzp;
      const sm = sim.current;
      if (sm && (phaseRef.current === 'area' || kick.current)) {
        // ---- Etapa 2: o usuário conduz um atacante; os outros temporizam a corrida da jogada; a marcação acompanha com atraso ----
        const dt = Math.min(0.05, (now - sm.last) / 1000);
        sm.last = now;
        const ts = (now - sm.t0) / 1000;
        const fwd = { x: cm.tx - cm.x, y: cm.ty - cm.y };
        const fl = Math.hypot(fwd.x, fwd.y) || 1;
        const fx0 = fwd.x / fl;
        const fy0 = fwd.y / fl;
        const rx0 = -fy0; // direita da tela no campo
        const ry0 = fx0;
        const kd = keysDown.current;
        const inX = (kd.has('ArrowRight') || kd.has('d') ? 1 : 0) - (kd.has('ArrowLeft') || kd.has('a') ? 1 : 0);
        const inY = (kd.has('ArrowUp') || kd.has('w') ? 1 : 0) - (kd.has('ArrowDown') || kd.has('s') ? 1 : 0);
        const protect = kd.has('Shift');
        const sel = selRef.current;
        const BX0 = FX1 - 28 - 126;
        const BX1 = FX1 - 22;
        const clampBox = (p: { x: number; y: number }) => { p.x = clampN(p.x, BX0, BX1); p.y = clampN(p.y, MID_Y - 74, MID_Y + 74); };
        sm.atk.forEach((a, n) => {
          let vx = 0;
          let vy = 0;
          if (n === sel) {
            let dx = rx0 * inX + fx0 * inY;
            let dy = ry0 * inX + fy0 * inY;
            if (!inX && !inY && sm.moveTo) {
              const mx = sm.moveTo.x - a.x;
              const my = sm.moveTo.y - a.y;
              const ml = Math.hypot(mx, my);
              if (ml > 2) { dx = mx / ml; dy = my / ml; } else sm.moveTo = null;
            }
            const dl = Math.hypot(dx, dy);
            if (dl > 0) { dx /= dl; dy /= dl; }
            const slow = (protect ? 0.55 : 1) * (sm.marked < 11 ? 0.78 : 1); // marcado em cima perde velocidade
            vx = dx * 44 * slow;
            vy = dy * 44 * slow;
          } else {
            // atacantes do BOT: esperam, depois correm ao destino da jogada em tempos diferentes
            const [pa, pb] = rs[n];
            const A = toField(c.side, pa.u, pa.v);
            const B = toField(c.side, pb.u, pb.v);
            const kk2 = easeIO(clampN((ts - 0.5 - n * 0.45) / 2.4, 0, 1));
            const tx = A.x + (B.x - A.x) * kk2;
            const ty = A.y + (B.y - A.y) * kk2;
            vx = (tx - a.x) * 6;
            vy = (ty - a.y) * 6;
          }
          a.vx += (vx - a.vx) * Math.min(1, dt * 9);
          a.vy += (vy - a.vy) * Math.min(1, dt * 9);
          a.x += a.vx * dt;
          a.y += a.vy * dt;
          clampBox(a);
        });
        // marcação: cada defensor persegue seu atacante, mirando um pouco atrás do movimento (quem muda de direção escapa)
        let nearest = 99;
        sm.def.forEach((d, n) => {
          const t = sm.atk[n % sm.atk.length];
          const prot = protect && n % sm.atk.length === sel;
          const tx = t.x - t.vx * 0.32 + 6;
          const ty = t.y - t.vy * 0.32;
          let ddx = tx - d.x;
          let ddy = ty - d.y;
          const dl = Math.hypot(ddx, ddy) || 1;
          const sp = Math.min(dl * 4, 33);
          const minD = prot ? 15 : 3; // proteger o espaço mantém o marcador a distância
          if (dl > minD) { d.x += (ddx / dl) * sp * dt; d.y += (ddy / dl) * sp * dt; }
          ddx = d.x - t.x;
          ddy = d.y - t.y;
          const dd = Math.hypot(ddx, ddy);
          if (prot && dd < 15 && dd > 0) { d.x = t.x + (ddx / dd) * 15; d.y = t.y + (ddy / dd) * 15; }
          if (n % sm.atk.length === sel || n === sel) nearest = Math.min(nearest, dd);
          clampBox(d);
        });
        sm.marked = nearest;
        sm.atk.forEach((a, n) => put(1 + n, a.x, a.y));
        sm.def.forEach((d, n) => put(7 + n, d.x, d.y));
        // câmera voltada para a área, com transição suave
        const ct2 = { x: FX1 + 46, y: cy + sg * 78, z: 66, tx: 648, ty: MID_Y + sg * 2, f: 410 };
        if (!kick.current) {
          cm.x += (ct2.x - cm.x) * 0.04; cm.y += (ct2.y - cm.y) * 0.04; cm.z += (ct2.z - cm.z) * 0.04;
          cm.tx += (ct2.tx - cm.tx) * 0.04; cm.ty += (ct2.ty - cm.ty) * 0.04; cm.f += (ct2.f - cm.f) * 0.04;
        }
        put(6, 40, MID_Y);
        put(13, FX1 - 6, MID_Y);
        return;
      }
      // prévia: ao escolher a jogada os atacantes correm até o destino e voltam (a cada ~5 s)
      const t = ((now - previewAt.current) % 5200) / 1000;
      const k = runK >= 0 ? easeIO(runK) : t < 1.5 ? easeIO(t / 1.5) : t < 2.7 ? 1 : t < 3.9 ? 1 - easeIO((t - 2.7) / 1.2) : 0;
      rs.forEach(([a, b], n) => {
        const pa = toField(c.side, a.u, a.v);
        const pb = toField(c.side, b.u, b.v);
        put(1 + n, pa.x + (pb.x - pa.x) * k, pa.y + (pb.y - pa.y) * k);
      });
      put(6, 40, MID_Y);
      DEF_BASE.forEach((d, n) => {
        const p = toField(c.side, d.u, d.v);
        put(7 + n, p.x, p.y);
      });
      const p6 = toField(c.side, 0.5, 0.62);
      put(12, p6.x, p6.y);
      put(13, FX1 - 6, MID_Y);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Sobreposições na tela (linha de mira, destino, marcadores): atualizadas a cada quadro da câmera, sem re-renderizar
  const olLine = useRef<SVGPathElement>(null);
  const olRing = useRef<SVGEllipseElement>(null);
  const olAim = useRef<SVGEllipseElement>(null);
  const olTaker = useRef<SVGGElement>(null);
  const olRecv = useRef<SVGGElement>(null);
  const olFx = useRef<SVGTextElement>(null);
  const olBeam = useRef<SVGLineElement>(null);
  const olExec = useRef<SVGEllipseElement>(null);
  const olPuck = useRef<SVGGElement>(null);
  const olHandle = useRef<SVGGElement>(null);
  const dial = useRef<{ x: number; y: number; R: number; k: number; gx: number; gy: number; hx: number; hy: number } | null>(null);
  const mode = useRef<'aim' | 'fx' | 'dir'>('aim');
  const olVal = useRef<SVGTextElement>(null);
  const olRetP = useRef<SVGPathElement>(null);
  const olRetM = useRef<SVGRectElement>(null);
  const olRetT = useRef<SVGPolygonElement>(null);
  const olRetR = useRef<SVGPolygonElement>(null);
  const homRef = useRef<number[] | null>(null);
  const onFrame = (proj: Proj, snap: LiveSnap, tilt: number) => {
    const c = st.current;
    const sg = c.side === 0 ? -1 : 1;
    const cy = c.side === 0 ? FY0 : FY1;
    const ball = { x: FX1 - 3, y: cy - sg * 4 };
    const pr = predictLand({ play: c.play, side: c.side, ax: c.aim.u, ay: c.aim.v, pw: c.pw || idealPower(c.aim, c.fx), fx: c.fx });
    const dst = toField(c.side, pr.u, pr.v);
    const peak = c.fx === 'alta' ? 62 : c.fx === 'rasteira' ? 3 : c.fx === 'direta' ? 20 : 32;
    const cOff = curveOffset({ fx: c.fx, ci: c.ci }, ball.x, ball.y, dst.x, dst.y, 1);
    const cl0 = Math.hypot(dst.x - ball.x, dst.y - ball.y) || 1;
    const pX = -(dst.y - ball.y) / cl0;
    const pY = (dst.x - ball.x) / cl0;
    let d = '';
    for (let n = 0; n <= 24; n += 1) {
      const tt = n / 24;
      const x = ball.x + (dst.x - ball.x) * tt + pX * cOff * Math.sin(Math.PI * tt);
      const y = ball.y + (dst.y - ball.y) * tt + pY * cOff * Math.sin(Math.PI * tt);
      const z = 4 + peak * Math.sin(Math.PI * tt);
      const q = proj(x, y, z);
      if (q.d < 25) continue;
      d += `${d ? 'L' : 'M'}${q.sx.toFixed(1)} ${q.sy.toFixed(1)}`;
    }
    olLine.current?.setAttribute('d', d);
    const g = proj(dst.x, dst.y, 0);
    const rx = Math.min(22, 11 * g.s);
    olRing.current?.setAttribute('cx', g.sx.toFixed(1));
    olRing.current?.setAttribute('cy', g.sy.toFixed(1));
    olRing.current?.setAttribute('rx', rx.toFixed(1));
    olRing.current?.setAttribute('ry', (rx * tilt * 0.55).toFixed(1));
    const am = toField(c.side, c.aim.u, c.aim.v);
    const ga = proj(am.x, am.y, 0);
    const rxa = Math.min(28, 14 * ga.s);
    olAim.current?.setAttribute('cx', ga.sx.toFixed(1));
    olAim.current?.setAttribute('cy', ga.sy.toFixed(1));
    olAim.current?.setAttribute('rx', rxa.toFixed(1));
    olAim.current?.setAttribute('ry', (rxa * tilt * 0.55).toFixed(1));
    const mark = (el: SVGGElement | null, idx: number) => {
      if (!el) return;
      const q = proj(snap.pts[idx * 2], snap.pts[idx * 2 + 1], 44);
      el.setAttribute('transform', `translate(${q.sx.toFixed(1)} ${q.sy.toFixed(1)}) scale(${Math.min(1.5, Math.max(0.6, q.s * 0.55)).toFixed(2)})`);
    };
    mark(olTaker.current, 0);
    mark(olRecv.current, 1 + c.recv);
    const gb = proj(ball.x, ball.y, 0);
    // Controle de direção e efeito ao redor da bola (anel laranja): o disco branco define a curva e a altura; a alça ciano gira a direção
    const er = Math.min(40, Math.max(26, 14 * gb.s));
    const R = er * 1.3;
    const k = Math.max(0.4, tilt * 0.95);
    const gw = proj(ball.x + 30, ball.y, 0);
    let gxs = (gw.sx - gb.sx) / R;
    let gys = (gw.sy - gb.sy) / (R * k);
    const gl = Math.hypot(gxs, gys);
    if (gl < 1e-3) { gxs = 0; gys = 1; } else { gxs /= gl; gys /= gl; }
    const gd0 = proj(dst.x, dst.y, 0);
    const th = Math.atan2(gd0.sy - gb.sy, gd0.sx - gb.sx);
    dial.current = { x: gb.sx, y: gb.sy, R, k, gx: gxs, gy: gys, hx: gb.sx + Math.cos(th) * R, hy: gb.sy + Math.sin(th) * R * k };
    olExec.current?.setAttribute('cx', gb.sx.toFixed(1));
    olExec.current?.setAttribute('cy', gb.sy.toFixed(1));
    olExec.current?.setAttribute('rx', R.toFixed(1));
    olExec.current?.setAttribute('ry', (R * k).toFixed(1));
    // eixo da altura: perpendicular à curva, apontando para cima na tela
    let lx = gys;
    let ly = -gxs;
    if (ly > 0 || (Math.abs(ly) < 1e-3 && lx < 0)) { lx = -lx; ly = -ly; }
    const cc = c.fx === 'dentro' ? c.ci : c.fx === 'fora' ? -c.ci : 0;
    const ll = c.fx === 'alta' ? 0.8 : c.fx === 'rasteira' ? -0.8 : 0;
    const pnx = cc * gxs + ll * lx;
    const pny = cc * gys + ll * ly;
    olPuck.current?.setAttribute('transform', `translate(${(gb.sx + pnx * R).toFixed(1)} ${(gb.sy + pny * R * k).toFixed(1)})`);
    olHandle.current?.setAttribute('transform', `translate(${dial.current.hx.toFixed(1)} ${dial.current.hy.toFixed(1)}) rotate(${((th * 180) / Math.PI + 90).toFixed(1)})`);
    Object.assign(dial.current, { lx, ly });
    // feixe de mira: sai da bola em direção ao destino (vertical na tela, como na referência), com a inclinação real da mira
    const gd = proj(dst.x, dst.y, 0);
    const bx = gd.sx - gb.sx;
    const by = gd.sy - gb.sy;
    const bl = Math.hypot(bx, by) || 1;
    const len = Math.min(150, 90 * gb.s + 30);
    olBeam.current?.setAttribute('x1', gb.sx.toFixed(1));
    olBeam.current?.setAttribute('y1', (gb.sy - 4).toFixed(1));
    olBeam.current?.setAttribute('x2', (gb.sx + (bx / bl) * len).toFixed(1));
    olBeam.current?.setAttribute('y2', (gb.sy + (by / bl) * len).toFixed(1));
    // setas de ajuste fino ao lado da bola e valores
    const tw = 6;
    const dirV = Math.round((c.aim.u - 0.5) * 100);
    const depV = Math.round(c.aim.v * 100);
    if (olVal.current) olVal.current.textContent = `DIREÇÃO ${dirV > 0 ? '+' : ''}${dirV}  ·  ALCANCE ${depV}${c.fx === 'dentro' || c.fx === 'fora' ? `  ·  EFEITO ${Math.round(c.ci * 100)}%` : ''}`;
    // retículo quadrado de precisão ao redor da bola: 4 cantos + marcadores que deslizam com a mira (altura/alcance na lateral, direção embaixo)
    {
      const S = Math.min(26, Math.max(15, 11 * gb.s));
      const bx2 = gb.sx;
      const by2 = gb.sy - S * 0.55;
      const L = S * 0.42;
      olRetP.current?.setAttribute('d', `M${bx2 - S} ${by2 - S + L} V${by2 - S} H${bx2 - S + L} M${bx2 + S - L} ${by2 - S} H${bx2 + S} V${by2 - S + L} M${bx2 + S} ${by2 + S - L} V${by2 + S} H${bx2 + S - L} M${bx2 - S + L} ${by2 + S} H${bx2 - S} V${by2 + S - L}`);
      const depK = Math.min(1, Math.max(0, c.aim.v)); // alcance: marcador esquerdo sobe/desce
      olRetM.current?.setAttribute('x', (bx2 - S - 9).toFixed(1));
      olRetM.current?.setAttribute('y', (by2 + S * 0.7 - depK * S * 1.4 - 3.5).toFixed(1));
      const dK = (c.aim.u - 0.5) * 2 * (c.side === 0 ? -1 : 1); // direção: triângulo inferior desliza para os lados
      const tx3 = bx2 + dK * S * 0.8;
      olRetT.current?.setAttribute('points', `${tx3.toFixed(1)},${(by2 + S + 4).toFixed(1)} ${(tx3 - 4.5).toFixed(1)},${(by2 + S + 11).toFixed(1)} ${(tx3 + 4.5).toFixed(1)},${(by2 + S + 11).toFixed(1)}`);
      olRetR.current?.setAttribute('points', `${(bx2 + S + 4).toFixed(1)},${by2.toFixed(1)} ${(bx2 + S + 11).toFixed(1)},${(by2 - 4.5).toFixed(1)} ${(bx2 + S + 11).toFixed(1)},${(by2 + 4.5).toFixed(1)}`);
    }
    // rótulos à esquerda da bola, sempre dentro da cena
    const endX = gb.sx - R - 14;
    const w1 = olFx.current?.getComputedTextLength?.() ?? 0;
    const w2 = olVal.current?.getComputedTextLength?.() ?? 0;
    olVal.current?.setAttribute('x', Math.max(14, endX - w2).toFixed(1));
    olVal.current?.setAttribute('y', (gb.sy + 12).toFixed(1));
    olFx.current?.setAttribute('x', Math.max(14, endX - w1).toFixed(1));
    olFx.current?.setAttribute('y', (gb.sy - 4).toFixed(1));
    // homografia tela -> campo (para mirar tocando/arrastando no gramado)
    const f = [[560, 70], [720, 70], [720, 370], [560, 370]];
    const sc = f.map(([x, y]) => {
      const q = proj(x, y, 0);
      return [q.sx, q.sy];
    });
    homRef.current = homography(sc, f);
  };
  const ovRef = useRef<SVGSVGElement>(null);
  const svgPt = (e: React.PointerEvent) => {
    const r = ovRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: ((e.clientX - r.left) / r.width) * SW, y: ((e.clientY - r.top) / r.height) * SH };
  };
  const aimFromPointer = (e: React.PointerEvent) => {
    const q = svgPt(e);
    const hm = homRef.current;
    if (!q || !hm) return;
    const p = applyH(hm, q.x, q.y);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (mode.current === 'dir') {
      // alça de direção: gira a mira em volta da bola mantendo o alcance
      const cy0 = side === 0 ? FY0 : FY1;
      const bx = FX1 - 3;
      const by = cy0 - (side === 0 ? -1 : 1) * 4;
      const cur0 = toField(side, cur.current.aim.u, cur.current.aim.v);
      const L = Math.hypot(cur0.x - bx, cur0.y - by) || 1;
      const l2 = Math.hypot(p.x - bx, p.y - by) || 1;
      setAim(fromField(side, bx + ((p.x - bx) / l2) * L, by + ((p.y - by) / l2) * L));
      return;
    }
    setAim(fromField(side, p.x, p.y));
  };
  // Controle de efeito: o disco branco dentro do anel. Um eixo é a curva (para dentro / para fora, com intensidade), o outro é a altura (alta / rasteira)
  const fxFromPointer = (e: React.PointerEvent) => {
    const q = svgPt(e);
    const d = dial.current as (typeof dial.current & { lx: number; ly: number }) | null;
    if (!q || !d) return;
    let nx = (q.x - d.x) / d.R;
    let ny = (q.y - d.y) / (d.R * d.k);
    const nl = Math.hypot(nx, ny);
    if (nl > 1) { nx /= nl; ny /= nl; }
    const c = nx * d.gx + ny * d.gy;
    const l = nx * d.lx + ny * d.ly;
    if (Math.abs(l) > 0.5 && Math.abs(l) > Math.abs(c)) setFx(l > 0 ? (cur.current.play === 'recuo' ? 'direta' : 'alta') : 'rasteira');
    else if (Math.abs(c) < 0.18) setFx('direta');
    else { setFx(c > 0 ? 'dentro' : 'fora'); setCi(Math.min(1, Math.max(0.2, +Math.abs(c).toFixed(2)))); }
  };
  const areaMove = (e: React.PointerEvent) => {
    const q = svgPt(e);
    const hm = homRef.current;
    if (!q || !hm || !sim.current) return;
    const p = applyH(hm, q.x, q.y);
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) sim.current.moveTo = { x: clampN(p.x, FX1 - 154, FX1 - 22), y: clampN(p.y, MID_Y - 74, MID_Y + 74) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (done.current) return;
    if (phaseRef.current === 'area') { (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId); areaMove(e); return; }
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
    const q = svgPt(e);
    const d = dial.current;
    mode.current = 'aim';
    if (q && d) {
      if (Math.hypot(q.x - d.hx, q.y - d.hy) < 18) mode.current = 'dir';
      else if (Math.hypot((q.x - d.x) / d.R, (q.y - d.y) / (d.R * d.k)) < 1.15) mode.current = 'fx';
    }
    if (mode.current === 'fx') fxFromPointer(e);
    else aimFromPointer(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!e.buttons) return;
    if (phaseRef.current === 'area') { areaMove(e); return; }
    if (mode.current === 'fx') fxFromPointer(e);
    else aimFromPointer(e);
  };

  const idealP = idealPower(aim, fx);
  const info = PLAY_INFO[play];
  const tri = (el: React.RefObject<SVGGElement>, color: string, label: string) => (
    <g ref={el}>
      <text y="-14" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" stroke="rgba(0,0,0,.6)" strokeWidth="2.5" paintOrder="stroke" fontFamily="Inter, sans-serif">{label}</text>
      <path d="M-7 -8 L7 -8 L0 3 Z" fill={color} stroke="rgba(0,0,0,.55)" strokeWidth="1" />
    </g>
  );

  return (
    <div className={`ct-wrap${floating ? ' ct-float' : ''}`} role="dialog" aria-label="Cobrança de escanteio">
      <style>{CSS}</style>
      <div className={`ct-box${kicking ? ' ct-kicking' : ''}${phase === 'area' ? ' ct-area-on' : ''}`}>
        <div className="ct-main">
          <div className="ct-stage">
            <LiveCam liveRef={snapRef} mode="corner" camOverride={camRef} onFrame={onFrame} club={live.club} opponent={live.opponent} home={live.home} ambience={live.ambience} burst={null} score={live.score} />
            <svg
              ref={ovRef}
              className="ct-ov"
              viewBox={`0 0 ${SW} ${SH}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
            >
              <defs>
                <linearGradient id="ct-beam" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38d6f0" /></linearGradient>
              </defs>
              <g className="ct-aimui">
              <path ref={olRetP} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="square" opacity="0.95" />
              <rect ref={olRetM} width="7" height="7" fill="none" stroke="#fff" strokeWidth="1.6" />
              <polygon ref={olRetT} fill="#facc15" />
              <polygon ref={olRetR} fill="#facc15" />
              <ellipse ref={olExec} fill="rgba(255,140,40,.26)" stroke="rgba(255,170,70,.95)" strokeWidth="2.2" style={{ cursor: 'pointer' }}>
                <animate attributeName="opacity" values="0.78;1;0.78" dur="1.8s" repeatCount="indefinite" />
              </ellipse>
              <line ref={olBeam} stroke="#38d6f0" strokeWidth="3" strokeLinecap="round" opacity="0.9" style={{ filter: 'drop-shadow(0 0 4px rgba(56,214,240,.9))' }} />
              </g>
              <g className="ct-aimui">
              <g ref={olHandle} style={{ cursor: 'grab' }}>
                <circle r="11" fill="rgba(56,214,240,.18)" />
                <path d="M-6 4 L0 -7 L6 4 Z" fill="#38d6f0" stroke="rgba(0,0,0,.6)" strokeWidth="1" />
              </g>
              <g ref={olPuck} style={{ cursor: 'grab' }}>
                <circle r="8" fill="#fff" stroke="#38d6f0" strokeWidth="2.5" style={{ filter: 'drop-shadow(0 0 4px rgba(56,214,240,.9))' }} />
                <circle r="2.4" fill="#f59e0b" />
              </g>
              </g>
              <path ref={olLine} fill="none" stroke="#38d6f0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" style={{ filter: 'drop-shadow(0 0 3px rgba(56,214,240,.7))' }} />
              <ellipse ref={olRing} fill="rgba(56,214,240,.12)" stroke="#38d6f0" strokeWidth="1.6" />
              <ellipse ref={olAim} fill="none" stroke="#fff" strokeWidth="1.8" strokeDasharray="4 3" opacity="0.9" />
              {tri(olTaker, '#38bdf8', taker ?? 'Cobrador')}
              {tri(olRecv, '#22d3ee', `Receptor`)}
              <text ref={olFx} className="ct-aimui" textAnchor="start" fontSize="13" fontWeight="800" fill="#fff" stroke="rgba(0,0,0,.65)" strokeWidth="3" paintOrder="stroke" fontFamily="Inter, sans-serif" letterSpacing=".6">{CROSS_LABEL[fx].toUpperCase()}</text>
              <text ref={olVal} className="ct-aimui" textAnchor="start" fontSize="11" fontWeight="800" fill="#facc15" stroke="rgba(0,0,0,.7)" strokeWidth="3" paintOrder="stroke" fontFamily="Inter, sans-serif" letterSpacing=".5" />
            </svg>
          </div>

          <div className="ct-ui">
            <div className="ct-score"><b>{club.abbreviation}</b><span>ESCANTEIO · {minute}'</span><em>{Math.max(0, left)} s</em></div>
            <div className="ct-legend ct-pn">
              <div><kbd>←↑↓→</kbd><span>Mirar</span></div>
              <div><kbd>E</kbd><span>Efeito</span></div>
              <div><kbd>Z X</kbd><span>Intensidade da curva</span></div>
              <div><kbd>◉</kbd><span>Arraste o disco: efeito</span></div>
              <div><kbd>1–7</kbd><span>Jogada</span></div>
              <div><kbd>␣</kbd><span>Cruzar (segure = força)</span></div>
            </div>
            <div className="ct-left ct-pn">
              <h4>EFEITO</h4>
              {EFFECTS.map((f) => (
                <button key={f} type="button" className={f === fx ? 'on' : ''} onClick={() => setFx(f)}>{EFFECT_LABEL[f]}</button>
              ))}
            </div>
            <div className="ct-tac ct-pn">
              <h4>JOGADAS ENSAIADAS</h4>
              {PLAYS.map((p, k) => (
                <button key={p} type="button" className={p === play ? 'on' : ''} onClick={() => pickPlay(p)} title={PLAY_INFO[p].text}>
                  <i>{PLAY_INFO[p].icon}</i>
                  <span>{PLAY_INFO[p].label}</span>
                  <small>{k + 1}</small>
                </button>
              ))}
            </div>
            {phase === 'area' && !kicking && (
              <div className="ct-area ct-pn">
                <div className="ct-at"><b>ORGANIZAÇÃO</b><em>{Math.max(0, areaLeft)} s</em></div>
                <p>Conduza o atacante até o espaço da bola. <kbd>WASD</kbd>/<kbd>↑↓←→</kbd> ou toque no gramado · <kbd>Tab</kbd> troca · <kbd>Shift</kbd> protege · <kbd>␣</kbd> bate</p>
                <div className="ct-ab">
                  <button type="button" onClick={() => setSelA((v) => (v + 1) % runs.length)}>Trocar atacante</button>
                  <button type="button" onPointerDown={() => keysDown.current.add('Shift')} onPointerUp={() => keysDown.current.delete('Shift')} onPointerLeave={() => keysDown.current.delete('Shift')}>Proteger espaço</button>
                  <button type="button" className="go" onClick={doKick}>Cruzar agora</button>
                </div>
              </div>
            )}
            <div className="ct-power">
              <div className="ct-pt"><span>FORÇA</span><b>{Math.round(pw * 100)}%</b></div>
              <div className="ct-bar" aria-label="Força">
                <i style={{ width: `${pw * 100}%` }} />
                <u style={{ left: `${idealP * 100}%` }} title="Força que alcança a mira" />
              </div>
              <button
                type="button"
                className={`ct-go${charging ? ' hold' : ''}`}
                onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId); startCharge(); }}
                onPointerUp={release}
                onPointerCancel={release}
                onContextMenu={(e) => e.preventDefault()}
              >
                {charging ? 'SOLTE PARA CRUZAR' : 'SEGURE: CRUZAR'}
              </button>
            </div>
            <div className="ct-bar-l"><i>{club.abbreviation}</i><b>{taker ?? 'Cobrador'}</b><em>{takerOvr}</em></div>
            <div className="ct-bar-r"><b>{keeper ?? 'Goleiro'}</b><em>{keeperOvr ?? ''}</em></div>
          </div>
        </div>
        <div className="ct-desc"><b>{info.label}:</b> {info.text}</div>
      </div>
    </div>
  );
}

const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------- homografia (4 pontos) ----------
function homography(src: number[][], dst: number[][]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-9;
    for (let k = c; k <= n; k += 1) M[c][k] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return [...M.map((r) => r[n]), 1];
}
function applyH(h: number[], x: number, y: number) {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}
function invertH(h: number[]): number[] | null {
  const [a, b, c, d, e, f, g, i, j] = h;
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (Math.abs(det) < 1e-12) return null;
  return [(e * j - f * i) / det, (c * i - b * j) / det, (b * f - c * e) / det, (f * g - d * j) / det, (a * j - c * g) / det, (c * d - a * f) / det, (d * i - e * g) / det, (b * g - a * i) / det, (a * e - b * d) / det];
}

export const CSS = `
.ct-wrap { color: #fff; font-family: Inter, system-ui, sans-serif; }
.ct-wrap:not(.ct-float) { position: fixed; inset: 0; z-index: 520; display: grid; align-items: center; justify-items: center; background: rgba(2,5,10,.92); padding: 6px; overflow-y: auto; }
.ct-float { position: absolute; left: 50%; bottom: 46px; transform: translateX(-50%); z-index: 8; width: min(96%, 640px); }
.ct-box { width: min(100%, calc((100vh - 56px) * 1.31), 1120px); }
.ct-main { position: relative; border-radius: 10px; overflow: hidden; background: #060b14; }
.ct-stage { position: relative; width: 100%; aspect-ratio: 740 / 564; overflow: hidden; touch-action: none; user-select: none; }
.ct-ov, .ct-left, .ct-tac, .ct-legend, .ct-power, .ct-desc { transition: opacity .35s; }
.ct-kicking .ct-ov, .ct-kicking .ct-left, .ct-kicking .ct-tac, .ct-kicking .ct-legend, .ct-kicking .ct-power, .ct-kicking .ct-desc { opacity: 0; pointer-events: none; }
.ct-area-on .ct-aimui, .ct-area-on .ct-left, .ct-area-on .ct-tac, .ct-area-on .ct-power, .ct-area-on .ct-legend, .ct-area-on .ct-desc { display: none; }
.ct-area { position: absolute; left: 50%; bottom: 44px; transform: translateX(-50%); width: min(430px, 70%); padding: 8px 11px; }
.ct-area .ct-at { display: flex; justify-content: space-between; font: 900 11px Inter, sans-serif; letter-spacing: .8px; } .ct-area .ct-at em { font-style: normal; color: #38bdf8; }
.ct-area p { margin: 4px 0 7px; font: 600 10.5px/1.45 Inter, sans-serif; opacity: .85; } .ct-area kbd { background: #f2f5fa; color: #0b1320; border-radius: 4px; padding: 0 4px; font: 800 9.5px Inter, sans-serif; }
.ct-ab { display: flex; gap: 6px; } .ct-ab button { flex: 1; cursor: pointer; border: 0; border-radius: 5px; padding: 8px 6px; background: rgba(255,255,255,.12); color: #fff; font: 800 10.5px Inter, sans-serif; touch-action: none; } .ct-ab button.go { background: #38bdf8; color: #04222a; }
.ct-ov { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 6; cursor: crosshair; touch-action: none; }
.ct-ui { position: absolute; inset: 0; pointer-events: none; z-index: 8; }
.ct-ui > * { pointer-events: auto; }
.ct-pn { background: rgba(6,11,20,.7); border-radius: 5px; padding: 7px 9px; }
.ct-pn h4 { margin: 0 0 4px; font: 800 10px Inter, sans-serif; letter-spacing: .7px; color: #dbe7f8; opacity: .85; }
.ct-score { position: absolute; left: 10px; top: 8px; display: flex; align-items: center; gap: 9px; padding: 5px 10px; border-radius: 5px; background: rgba(6,11,20,.8); border-left: 3px solid #38bdf8; font: 800 11px Inter, sans-serif; }
.ct-score b { font-size: 13px; } .ct-score span { opacity: .8; letter-spacing: .4px; } .ct-score em { font-style: normal; color: #38bdf8; }
.ct-legend { position: absolute; right: 10px; top: 36%; width: 168px; display: grid; gap: 4px; }
.ct-legend div { display: grid; grid-template-columns: 50px 1fr; align-items: center; gap: 7px; font: 700 10.5px Inter, sans-serif; }
.ct-legend kbd { text-align: center; font: 800 9.5px Inter, sans-serif; background: #f2f5fa; color: #0b1320; border-radius: 99px; padding: 2px 3px; }
.ct-left { position: absolute; left: 10px; top: 28%; width: 138px; }
.ct-left button { display: block; width: 100%; text-align: left; cursor: pointer; border: 0; background: transparent; color: #cfe0f7; font: 700 11px Inter, sans-serif; padding: 5px 7px; border-radius: 4px; }
.ct-left button.on { background: #dbe7ff; color: #0b1320; }
.ct-tac { position: absolute; right: 10px; bottom: 50px; width: 188px; }
.ct-tac button { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 5px; width: 100%; text-align: left; cursor: pointer; border: 0; background: transparent; color: #cfe0f7; font: 700 10.5px Inter, sans-serif; padding: 3px 5px; border-radius: 4px; }
.ct-tac button i { font-style: normal; text-align: center; font-size: 12px; }
.ct-tac button small { opacity: .45; font-size: 8.5px; }
.ct-tac button.on { background: #dbe7ff; color: #0b1320; }
.ct-power { position: absolute; left: 50%; bottom: 46px; transform: translateX(-50%); width: min(230px, 32%); padding: 6px 8px; border-radius: 5px; background: rgba(6,11,20,.76); display: grid; gap: 4px; }
.ct-pt { display: flex; justify-content: space-between; align-items: baseline; font: 800 10px Inter, sans-serif; letter-spacing: .6px; } .ct-pt b { font-size: 15px; }
.ct-bar { height: 6px; border-radius: 2px; background: rgba(255,255,255,.16); position: relative; overflow: hidden; }
.ct-bar > i { position: absolute; left: 0; top: 0; bottom: 0; background: #2ee66b; }
.ct-bar > u { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; opacity: .75; }
.ct-go { cursor: pointer; user-select: none; touch-action: none; padding: 8px 10px; border-radius: 5px; border: 0; background: #38bdf8; color: #04222a; font: 900 11px Inter, sans-serif; letter-spacing: .5px; }
.ct-go.hold { background: #2ee66b; }
.ct-bar-l, .ct-bar-r { position: absolute; bottom: 8px; display: flex; align-items: center; gap: 9px; height: 30px; padding: 0 11px; background: rgba(6,11,20,.8); font: 800 12px Inter, sans-serif; }
.ct-bar-l { left: 10px; width: 30%; border-top: 3px solid #38bdf8; } .ct-bar-l i { font-style: normal; font-size: 10px; opacity: .7; } .ct-bar-l em, .ct-bar-r em { font-style: normal; margin-left: auto; opacity: .85; }
.ct-bar-r { right: 10px; width: 24%; border-top: 3px solid #2ee66b; }
.ct-desc { margin-top: 6px; font: 600 11.5px/1.4 Inter, sans-serif; opacity: .8; padding: 0 3px; } .ct-desc b { color: #38bdf8; }
@media (max-width: 760px), (max-height: 520px) {
  .ct-box { width: min(100%, 760px); }
  .ct-ui { position: static; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 6px; pointer-events: auto; background: #060b14; }
  .ct-ui > * { position: static !important; width: auto !important; transform: none !important; }
  .ct-score { grid-column: 1 / -1; order: -1; padding: 4px 8px; } .ct-legend { display: none; }
  .ct-power { grid-column: 1 / -1; order: 1; } .ct-left { order: 2; } .ct-tac { order: 3; } .ct-bar-l { order: 4; } .ct-bar-r { order: 5; }
  .ct-bar-l, .ct-bar-r { height: 28px; font-size: 11px; } .ct-go { padding: 12px; }
}
.ct-float .ct-box { width: 100%; }
.ct-float .ct-main { border: 1px solid rgba(56,189,248,.4); }
.ct-float .ct-ui { position: static; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 6px; background: #060b14; pointer-events: auto; }
.ct-float .ct-ui > * { position: static !important; width: auto !important; transform: none !important; }
.ct-float .ct-legend, .ct-float .ct-bar-l, .ct-float .ct-bar-r, .ct-float .ct-desc { display: none; }
.ct-float .ct-score { grid-column: 1 / -1; order: -1; } .ct-float .ct-power { grid-column: 1 / -1; order: 1; } .ct-float .ct-left { order: 2; } .ct-float .ct-tac { order: 3; }
`;
