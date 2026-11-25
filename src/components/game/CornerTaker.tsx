import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LiveCam } from '@/components/game/LiveCam';
import type { LiveSnap } from '@/components/MatchPitch';
import type { Cam, Proj } from '@/components/game/ReplayPlayer';
import type { Ambience } from '@/lib/game/ambience';
import { EFFECTS, EFFECT_LABEL, PLAYS, PLAY_INFO, PLAY_RUNS, cornerSide, idealPower, predictLand, type CEffect, type CExec, type CPlay } from '@/lib/game/corner';

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
const DEF_BASE = [{ u: 0.16, v: 0.12 }, { u: 0.36, v: 0.3 }, { u: 0.6, v: 0.16 }, { u: 0.84, v: 0.34 }, { u: 0.5, v: 0.62 }];

export default function CornerTaker({ minute, club, opponentColor = '#c8102e', taker, takerOvr, keeper, keeperOvr, floating = false, seconds, onDone, live }: Props) {
  const side = useMemo(() => cornerSide(minute), [minute]);
  const total = seconds ?? (floating ? 14 : 20);
  const [left, setLeft] = useState(total);
  const [play, setPlay] = useState<CPlay>('central');
  const [fx, setFx] = useState<CEffect>('direta');
  const [aim, setAim] = useState(() => ({ ...PLAY_INFO.central.zone }));
  const [pw, setPw] = useState(0);
  const [charging, setCharging] = useState(false);
  const done = useRef(false);
  const cur = useRef({ play, fx, aim, pw });
  cur.current = { play, fx, aim, pw };
  const chargeStart = useRef(0);

  const finish = (power: number) => {
    if (done.current) return;
    done.current = true;
    const c = cur.current;
    onDone({ play: c.play, side, ax: c.aim.u, ay: c.aim.v, pw: Math.min(1, Math.max(0.05, power)), fx: c.fx });
  };
  // Tempo esgotado: executa o que está montado, com força um pouco abaixo da ideal (quem não decide perde qualidade)
  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) finish(Math.max(0.2, idealPower({ u: cur.current.aim.u, v: cur.current.aim.v }, cur.current.fx) - 0.12));
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
  const release = () => {
    if (!charging) return;
    setCharging(false);
    finish(Math.max(0.05, cur.current.pw));
  };
  const startCharge = () => {
    if (done.current) return;
    setPw(0);
    cur.current.pw = 0;
    setCharging(true);
  };

  // Teclado: setas movem a mira, 1 a 7 escolhem a jogada, E troca o efeito, Espaço (segurar) carrega a força
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (done.current) return;
      const step = 0.04;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setAim((a) => ({ u: Math.min(1, Math.max(0, a.u + dx * (side === 0 ? -1 : 1))), v: Math.min(1, Math.max(0.02, a.v + dy)) }));
      } else if (/^[1-7]$/.test(e.key)) pickPlay(PLAYS[Number(e.key) - 1]);
      else if (e.key === 'e' || e.key === 'E') setFx((f) => EFFECTS[(EFFECTS.indexOf(f) + 1) % EFFECTS.length]);
      else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        startCharge();
      }
    };
    const up = (e: KeyboardEvent) => {
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
  camRef.current = { x: FX1 + 66, y: cornerY + sgn * 92, z: 74, tx: 664, ty: MID_Y + sgn * 4, tz: 0, f: 540 };
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
  const st = useRef({ play, fx, aim, pw, side, recv: 0 });
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const pred = predictLand({ play, side, ax: aim.u, ay: aim.v, pw: pw || idealPower(aim, fx), fx });
  const recvIdx = runs.reduce((best, [, b], k) => (Math.hypot(b.u - pred.u, b.v - pred.v) < Math.hypot(runs[best][1].u - pred.u, runs[best][1].v - pred.v) ? k : best), 0);
  st.current = { play, fx, aim, pw, side, recv: recvIdx };
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
      put(0, bx0 + ((cm.x - bx0) / cl) * 22, by0 + ((cm.y - by0) / cl) * 22);
      sn.ball[0] = FX1 - 3;
      sn.ball[1] = cy - sg * 4;
      // prévia: ao escolher a jogada os atacantes correm até o destino e voltam (a cada ~5 s)
      const t = ((now - previewAt.current) % 5200) / 1000;
      const k = t < 1.5 ? easeIO(t / 1.5) : t < 2.7 ? 1 : t < 3.9 ? 1 - easeIO((t - 2.7) / 1.2) : 0;
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
  const olExec = useRef<SVGGElement>(null);
  const olVal = useRef<SVGTextElement>(null);
  const olTriL = useRef<SVGPolygonElement>(null);
  const olTriR = useRef<SVGPolygonElement>(null);
  const homRef = useRef<number[] | null>(null);
  const onFrame = (proj: Proj, snap: LiveSnap, tilt: number) => {
    const c = st.current;
    const sg = c.side === 0 ? -1 : 1;
    const cy = c.side === 0 ? FY0 : FY1;
    const ball = { x: FX1 - 3, y: cy - sg * 4 };
    const pr = predictLand({ play: c.play, side: c.side, ax: c.aim.u, ay: c.aim.v, pw: c.pw || idealPower(c.aim, c.fx), fx: c.fx });
    const dst = toField(c.side, pr.u, pr.v);
    const peak = c.fx === 'alta' ? 62 : c.fx === 'rasteira' ? 3 : c.fx === 'direta' ? 20 : 32;
    const bend = (c.fx === 'dentro' ? -1 : c.fx === 'fora' ? 1 : 0) * 34 * sg;
    let d = '';
    for (let n = 0; n <= 24; n += 1) {
      const tt = n / 24;
      const x = ball.x + (dst.x - ball.x) * tt + bend * Math.sin(Math.PI * tt) * 0.9;
      const y = ball.y + (dst.y - ball.y) * tt + bend * Math.sin(Math.PI * tt) * 0.35;
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
    // marcador de execução: destaque laranja no gramado ao redor da bola (acompanha a perspectiva)
    const er = Math.min(34, Math.max(20, 12 * gb.s));
    olExec.current?.setAttribute('transform', `translate(${gb.sx.toFixed(1)} ${gb.sy.toFixed(1)}) scale(${(er * 1.25).toFixed(1)} ${(er * Math.max(0.34, tilt * 0.9)).toFixed(1)})`);
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
    olTriL.current?.setAttribute('points', `${(gb.sx - er * 1.05).toFixed(1)},${gb.sy.toFixed(1)} ${(gb.sx - er * 1.05 - tw).toFixed(1)},${(gb.sy - tw * 0.7).toFixed(1)} ${(gb.sx - er * 1.05 - tw).toFixed(1)},${(gb.sy + tw * 0.7).toFixed(1)}`);
    olTriR.current?.setAttribute('points', `${(gb.sx + er * 1.05).toFixed(1)},${gb.sy.toFixed(1)} ${(gb.sx + er * 1.05 + tw).toFixed(1)},${(gb.sy - tw * 0.7).toFixed(1)} ${(gb.sx + er * 1.05 + tw).toFixed(1)},${(gb.sy + tw * 0.7).toFixed(1)}`);
    const dirV = Math.round((c.aim.u - 0.5) * 100);
    const depV = Math.round(c.aim.v * 100);
    if (olVal.current) olVal.current.textContent = `DIREÇÃO ${dirV > 0 ? '+' : ''}${dirV}  ·  ALCANCE ${depV}`;
    olVal.current?.setAttribute('x', (gb.sx - er * 1.05 - tw - 10).toFixed(1));
    olVal.current?.setAttribute('y', (gb.sy + 12).toFixed(1));
    olFx.current?.setAttribute('x', (gb.sx - er * 1.05 - tw - 10).toFixed(1));
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
  const aimFromPointer = (e: React.PointerEvent) => {
    const r = ovRef.current?.getBoundingClientRect();
    const hm = homRef.current;
    if (!r || !hm) return;
    const p = applyH(hm, ((e.clientX - r.left) / r.width) * SW, ((e.clientY - r.top) / r.height) * SH);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const a = fromField(side, p.x, p.y);
    setAim(a);
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
      <div className="ct-box">
        <div className="ct-main">
          <div className="ct-stage">
            <LiveCam liveRef={snapRef} mode="corner" camOverride={camRef} onFrame={onFrame} club={live.club} opponent={live.opponent} home={live.home} ambience={live.ambience} burst={null} score={live.score} />
            <svg
              ref={ovRef}
              className="ct-ov"
              viewBox={`0 0 ${SW} ${SH}`}
              onPointerDown={(e) => { (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId); aimFromPointer(e); }}
              onPointerMove={(e) => { if (e.buttons) aimFromPointer(e); }}
            >
              <defs>
                <linearGradient id="ct-beam" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38d6f0" /></linearGradient>
              </defs>
              <g ref={olExec}>
                <ellipse rx="1" ry="1" fill="rgba(255,140,40,.30)" stroke="rgba(255,170,70,.9)" strokeWidth="0.06" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }}>
                  <animate attributeName="rx" values="0.92;1.08;0.92" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="ry" values="0.92;1.08;0.92" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.75;1;0.75" dur="1.8s" repeatCount="indefinite" />
                </ellipse>
                <ellipse rx="0.22" ry="0.22" fill="none" stroke="#fff" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.5 }} />
              </g>
              <line ref={olBeam} stroke="#38d6f0" strokeWidth="3" strokeLinecap="round" opacity="0.9" style={{ filter: 'drop-shadow(0 0 4px rgba(56,214,240,.9))' }} />
              <polygon ref={olTriL} fill="#facc15" opacity="0.9" />
              <polygon ref={olTriR} fill="#facc15" opacity="0.9" />
              <path ref={olLine} fill="none" stroke="#38d6f0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" style={{ filter: 'drop-shadow(0 0 3px rgba(56,214,240,.7))' }} />
              <ellipse ref={olRing} fill="rgba(56,214,240,.12)" stroke="#38d6f0" strokeWidth="1.6" />
              <ellipse ref={olAim} fill="none" stroke="#fff" strokeWidth="1.8" strokeDasharray="4 3" opacity="0.9" />
              {tri(olTaker, '#38bdf8', taker ?? 'Cobrador')}
              {tri(olRecv, '#22d3ee', `Receptor`)}
              <text ref={olFx} textAnchor="end" fontSize="13" fontWeight="800" fill="#fff" stroke="rgba(0,0,0,.65)" strokeWidth="3" paintOrder="stroke" fontFamily="Inter, sans-serif" letterSpacing=".6">{CROSS_LABEL[fx].toUpperCase()}</text>
              <text ref={olVal} textAnchor="end" fontSize="11" fontWeight="800" fill="#facc15" stroke="rgba(0,0,0,.7)" strokeWidth="3" paintOrder="stroke" fontFamily="Inter, sans-serif" letterSpacing=".5" />
            </svg>
          </div>

          <div className="ct-ui">
            <div className="ct-score"><b>{club.abbreviation}</b><span>ESCANTEIO · {minute}'</span><em>{Math.max(0, left)} s</em></div>
            <div className="ct-legend ct-pn">
              <div><kbd>←↑↓→</kbd><span>Mirar</span></div>
              <div><kbd>E</kbd><span>Efeito</span></div>
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
