import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveCam } from '@/components/game/LiveCam';
import { CSS as CT_CSS } from '@/components/game/CornerTaker';
import type { LiveSnap } from '@/components/MatchPitch';
import type { Cam, Proj } from '@/components/game/ReplayPlayer';
import type { Ambience } from '@/lib/game/ambience';
import { RPLAYS, loseChance, riskLabel, type RPlay, type RestartChoice, type RestartReq } from '@/lib/game/restart';

// Lateral e tiro de meta com a câmera de jogo (a mesma das câmeras 3D da partida): cobrador em primeiro plano, linha ciano até o receptor escolhido,
// jogadores (discos) no gramado ao fundo, comandos à direita e informações embaixo. Sem figuras humanas.
type Team = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
type Props = {
  req: RestartReq;
  live: { club: Team; opponent: Team; home: 'user' | 'bot'; ambience: Ambience; score: { user: number; bot: number } };
  seconds?: number;
  onDone: (c: RestartChoice) => void;
};
const FX0 = 20;
const FY0 = 10;
const FY1 = 430;
const MID_Y = 220;
const SW = 740;
const SH = 564;
const KICK_WIND = 560; // ms de preparação até o contato com a bola
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const PEAK: Record<RPlay, number> = { tradicional: 26, rapido: 18, curto: 5, longo: 48, medio: 30 };
const ABBR = (p: string) => p;

export default function RestartTaker({ req, live, seconds = 20, onDone }: Props) {
  const lateral = req.kind === 'lateral';
  const plays = RPLAYS[req.kind];
  const [left, setLeft] = useState(seconds);
  const taker = req.players.find((p) => p.key === req.taker) ?? req.players[0];
  const cands = useMemo(() => req.candidates.map((k) => req.players.find((p) => p.key === k)!).filter(Boolean).sort((a, b) => Math.hypot(a.x - req.ball.x, a.y - req.ball.y) - Math.hypot(b.x - req.ball.x, b.y - req.ball.y)), [req]);
  const [target, setTarget] = useState(cands[0]?.key ?? '');
  const [play, setPlay] = useState<RPlay>(lateral ? 'tradicional' : 'curto');
  const done = useRef(false);
  const cur = useRef({ target, play });
  cur.current = { target, play };
  const scr = useRef<Record<string, { x: number; y: number }>>({});

  const [kicking, setKicking] = useState(false);
  const kick = useRef<{ t0: number; play: RPlay; target: string; dur: number } | null>(null);
  const go = (over?: Partial<{ play: RPlay }>) => {
    if (done.current) return;
    done.current = true;
    const choice = { target: cur.current.target, play: over?.play ?? cur.current.play };
    // Batida: o cobrador recua, ganha embalo e toca na bola; só então a bola voa até o receptor escolhido. Depois a jogada segue na partida.
    const tp = req.players.find((p) => p.key === choice.target);
    const dist = tp ? Math.hypot(tp.x - req.ball.x, tp.y - req.ball.y) : 80;
    const dur = Math.min(1500, Math.max(450, (choice.play === 'rapido' ? 0.6 : 1) * (dist / (choice.play === 'longo' ? 0.42 : 0.3))));
    const wind = choice.play === 'rapido' ? 160 : KICK_WIND;
    kick.current = { t0: performance.now(), play: choice.play, target: choice.target, dur };
    kickWind.current = wind;
    setKicking(true);
    window.setTimeout(() => onDone(choice), wind + dur + 300);
  };
  const kickWind = useRef(KICK_WIND);
  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  // mudar direção: o receptor mais próximo na direção da seta (em relação à tela)
  const turn = (dx: number, dy: number) => {
    const me = scr.current[cur.current.target];
    if (!me) return;
    let best: string | null = null;
    let bs = Infinity;
    for (const c of cands) {
      if (c.key === cur.current.target) continue;
      const q = scr.current[c.key];
      if (!q) continue;
      const vx = q.x - me.x;
      const vy = q.y - me.y;
      const len = Math.hypot(vx, vy) || 1;
      const cos = (vx * dx + vy * dy) / len;
      if (cos < 0.35) continue;
      const score = len * (2 - cos);
      if (score < bs) { bs = score; best = c.key; }
    }
    if (best) setTarget(best);
  };
  const cycle = () => {
    const i = cands.findIndex((c) => c.key === cur.current.target);
    setTarget(cands[(i + 1) % cands.length].key);
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (done.current) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); turn(1, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); turn(0, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); turn(0, 1); }
      else if (e.key === 'q' || e.key === 'Q' || e.key === 'Tab') { e.preventDefault(); cycle(); }
      else if (/^[1-4]$/.test(e.key) && plays[Number(e.key) - 1]) setPlay(plays[Number(e.key) - 1].id);
      else if (e.key === 'r' || e.key === 'R') { if (lateral) go({ play: 'rapido' }); }
      else if (e.key === 'l' || e.key === 'L') { if (!lateral) go({ play: 'longo' }); }
      else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); go(); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- câmera e discos ----------
  const sg = req.ball.y < MID_Y ? -1 : 1; // lado da linha lateral
  const camRef = useRef<Cam | null>(null);
  // câmera de gameplay: atrás/ao lado do cobrador, olhando para dentro do campo com ~23° de inclinação (horizonte alto, gramado ocupando a tela)
  const aimCam = (cx: number, cy: number, z: number, px: number, py: number, f: number): Cam => {
    const l = Math.hypot(px - cx, py - cy) || 1;
    return { x: cx, y: cy, z, tx: cx + ((px - cx) / l) * z * 2.4, ty: cy + ((py - cy) / l) * z * 2.4, tz: 0, f };
  };
  camRef.current = lateral
    ? aimCam(req.ball.x - 60, req.ball.y - sg * 6, 34, req.ball.x + 120, req.ball.y - sg * 50, 360)
    : aimCam(FX0 - 8, MID_Y + 30, 34, FX0 + 260, MID_Y - 34, 360);
  const order = useMemo(() => [...req.players.filter((p) => p.side === 'user'), ...req.players.filter((p) => p.side === 'bot')], [req]);
  const snapRef = useRef<LiveSnap | null>(null);
  if (!snapRef.current) {
    snapRef.current = {
      ball: [req.ball.x, req.ball.y, 8],
      pts: order.flatMap((p) => [p.x, p.y]),
      sides: order.map((p) => p.side),
      letters: order.map(() => ''),
      keys: order.map((p) => p.key),
      holder: order.findIndex((p) => p.key === req.taker),
      frozen: false,
      fx: null,
    };
  }
  // cobrador no ponto da cobrança, bola logo à frente dele (na direção do receptor)
  const tgtP = req.players.find((p) => p.key === target);
  useEffect(() => {
    const sn = snapRef.current!;
    const ti = order.findIndex((p) => p.key === req.taker);
    const tx = lateral ? req.ball.x : req.ball.x;
    const ty = lateral ? req.ball.y - sg * 3 : req.ball.y;
    sn.pts[ti * 2] = tx;
    sn.pts[ti * 2 + 1] = ty;
    const dx = (tgtP?.x ?? tx + 50) - tx;
    const dy = (tgtP?.y ?? ty) - ty;
    const l = Math.hypot(dx, dy) || 1;
    sn.ball[0] = tx + (dx / l) * 10;
    sn.ball[1] = ty + (dy / l) * 10;
    sn.ball[2] = lateral ? 18 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Batida e reação: roda só depois de confirmar. O disco recua, acelera, toca na bola e a bola voa até o receptor (arco pela altura da jogada)
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const kk = kick.current;
      if (!kk) return;
      const sn = snapRef.current!;
      const ti = order.findIndex((p) => p.key === req.taker);
      const tp = req.players.find((p) => p.key === kk.target);
      if (!tp) return;
      const e = now - kk.t0;
      const wind = kickWind.current;
      const tx0 = req.ball.x;
      const ty0 = lateral ? req.ball.y - sg * 3 : req.ball.y;
      const dx = tp.x - tx0;
      const dy = tp.y - ty0;
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l;
      const uy = dy / l;
      // posição do cobrador: recua do lado oposto ao alvo, acelera e passa pela bola
      let back = 0;
      if (e < wind * 0.55) back = 14 * easeIO(e / (wind * 0.55));
      else if (e < wind) { const q = (e - wind * 0.55) / (wind * 0.45); back = 14 - 20 * q * q; }
      else back = -6 + 3 * Math.min(1, (e - wind) / 300);
      sn.pts[ti * 2] = tx0 - ux * back;
      sn.pts[ti * 2 + 1] = ty0 - uy * back;
      const bx0 = tx0 + ux * 10;
      const by0 = ty0 + uy * 10;
      const cm = camRef.current!;
      if (e < wind) {
        // a bola fica à frente do cobrador até o contato
        sn.ball[0] = bx0; sn.ball[1] = by0; sn.ball[2] = lateral ? 18 : 0;
      } else {
        const t = Math.min(1, (e - wind) / kk.dur);
        const te = 1 - Math.pow(1 - t, 1.3);
        sn.ball[0] = bx0 + (tp.x - bx0) * te;
        sn.ball[1] = by0 + (tp.y - by0) * te;
        sn.ball[2] = (lateral ? 18 : 3) * (1 - te) + (6 + PEAK[kk.play]) * Math.sin(Math.PI * te);
        cm.tx += (sn.ball[0] - cm.tx) * 0.04;
        cm.ty += (sn.ball[1] - cm.ty) * 0.04;
        // o adversário mais próximo do receptor aperta a marcação enquanto a bola viaja
        const oi = order.findIndex((p) => p.side !== taker.side && p.pos !== 'GK' && p.key === nearestOpp.current);
        if (oi >= 0) {
          const ox = sn.pts[oi * 2];
          const oy = sn.pts[oi * 2 + 1];
          sn.pts[oi * 2] = ox + (tp.x - ox) * 0.03;
          sn.pts[oi * 2 + 1] = oy + (tp.y - oy) * 0.03;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nearestOpp = useRef('');
  const olLine = useRef<SVGPathElement>(null);
  const olRing = useRef<SVGEllipseElement>(null);
  const olTaker = useRef<SVGGElement>(null);
  const olRecv = useRef<SVGGElement>(null);
  const olName = useRef<SVGTextElement>(null);
  const stR = useRef({ target, play });
  stR.current = { target, play };
  const onFrame = (proj: Proj, snap: LiveSnap, tilt: number) => {
    const c = stR.current;
    order.forEach((p, n) => {
      const q = proj(snap.pts[n * 2], snap.pts[n * 2 + 1], 8);
      scr.current[p.key] = { x: q.sx, y: q.sy };
    });
    const ti = order.findIndex((p) => p.key === req.taker);
    const ri = order.findIndex((p) => p.key === c.target);
    if (ri < 0) return;
    const bx = snap.ball[0];
    const by = snap.ball[1];
    const rx = snap.pts[ri * 2];
    const ry = snap.pts[ri * 2 + 1];
    const peak = PEAK[c.play];
    let d = '';
    for (let n = 0; n <= 24; n += 1) {
      const t = n / 24;
      const q = proj(bx + (rx - bx) * t, by + (ry - by) * t, (lateral ? 18 : 3) + (6 + peak) * Math.sin(Math.PI * t) * (n === 24 ? 0 : 1));
      if (q.d < 20) continue;
      d += `${d ? 'L' : 'M'}${q.sx.toFixed(1)} ${q.sy.toFixed(1)}`;
    }
    olLine.current?.setAttribute('d', d);
    const g = proj(rx, ry, 0);
    const rr = Math.min(24, 13 * g.s);
    olRing.current?.setAttribute('cx', g.sx.toFixed(1));
    olRing.current?.setAttribute('cy', g.sy.toFixed(1));
    olRing.current?.setAttribute('rx', rr.toFixed(1));
    olRing.current?.setAttribute('ry', (rr * tilt * 0.55).toFixed(1));
    const mark = (el: SVGGElement | null, idx: number) => {
      if (!el) return;
      const q = proj(snap.pts[idx * 2], snap.pts[idx * 2 + 1], 46);
      el.setAttribute('transform', `translate(${q.sx.toFixed(1)} ${q.sy.toFixed(1)}) scale(${Math.min(1.5, Math.max(0.6, q.s * 0.55)).toFixed(2)})`);
    };
    mark(olTaker.current, ti);
    mark(olRecv.current, ri);
  };
  const ovRef = useRef<SVGSVGElement>(null);
  const pick = (e: React.PointerEvent) => {
    const r = ovRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * SW;
    const y = ((e.clientY - r.top) / r.height) * SH;
    let best: string | null = null;
    let bd = 46;
    for (const c of cands) {
      const q = scr.current[c.key];
      if (!q) continue;
      const dd = Math.hypot(q.x - x, q.y - y);
      if (dd < bd) { bd = dd; best = c.key; }
    }
    if (best) setTarget(best);
  };

  const rcv = cands.find((c) => c.key === target);
  const opp = req.players.filter((p) => p.side !== taker.side && p.pos !== 'GK');
  const oppD = rcv ? Math.min(...opp.map((o) => Math.hypot(o.x - rcv.x, o.y - rcv.y))) : 99;
  const pLose = rcv ? loseChance(req.kind, play, Math.hypot(rcv.x - req.ball.x, rcv.y - req.ball.y), oppD, taker.ovr, rcv.ovr) : 0;
  const risk = riskLabel(pLose);
  if (rcv && !kick.current) nearestOpp.current = [...opp].sort((a, b) => Math.hypot(a.x - rcv.x, a.y - rcv.y) - Math.hypot(b.x - rcv.x, b.y - rcv.y))[0]?.key ?? '';
  const info = plays.find((p) => p.id === play)!;
  const gkOpp = req.players.find((p) => p.side !== taker.side && p.pos === 'GK');
  const tri = (el: React.RefObject<SVGGElement>, color: string) => (
    <g ref={el}>
      <path d="M-7 -8 L7 -8 L0 3 Z" fill={color} stroke="rgba(0,0,0,.55)" strokeWidth="1" />
    </g>
  );

  return (
    <div className="ct-wrap rt-wrap" role="dialog" aria-label={lateral ? 'Lateral' : 'Tiro de meta'}>
      <style>{CT_CSS}{RT_CSS}</style>
      <div className={`ct-box${kicking ? ' ct-kicking' : ''}`}>
        <div className="ct-main">
          <div className="ct-stage">
            <LiveCam liveRef={snapRef} mode="corner" camOverride={camRef} onFrame={onFrame} club={live.club} opponent={live.opponent} home={live.home} ambience={live.ambience} burst={null} score={live.score} />
            <svg ref={ovRef} className="ct-ov" viewBox={`0 0 ${SW} ${SH}`} onPointerDown={pick}>
              <path ref={olLine} fill="none" stroke="#38d6f0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" style={{ filter: 'drop-shadow(0 0 3px rgba(56,214,240,.7))' }} />
              <ellipse ref={olRing} fill="rgba(56,214,240,.12)" stroke="#38d6f0" strokeWidth="1.6" />
              {tri(olTaker, '#38bdf8')}
              {tri(olRecv, '#22d3ee')}
            </svg>
          </div>
          <div className="ct-ui">
            <div className="ct-score"><b>{live.club.abbreviation}</b><span>{lateral ? 'LATERAL' : 'TIRO DE META'}</span><em>{Math.max(0, left)} s</em></div>
            <div className="ct-legend ct-pn">
              <div><kbd>Q</kbd><span>Trocar receptor</span></div>
              <div><kbd>←↑↓→</kbd><span>Mudar direção</span></div>
              <div><kbd>{lateral ? 'R' : 'L'}</kbd><span>{lateral ? 'Cobrança rápida' : 'Chute longo'}</span></div>
              <div><kbd>1–{plays.length}</kbd><span>Escolher jogada</span></div>
            </div>
            <div className="ct-tac ct-pn">
              <h4>{lateral ? 'JOGADAS DE LATERAL' : 'JOGADAS DE TIRO DE META'}</h4>
              {plays.map((p, k) => (
                <button key={p.id} type="button" className={p.id === play ? 'on' : ''} onClick={() => setPlay(p.id)} title={p.text}>
                  <i>{p.id === play ? '▸' : ''}</i>
                  <span>{p.label}</span>
                  <small>{k + 1}</small>
                </button>
              ))}
            </div>
            <div className="ct-power rt-go">
              <div className="ct-pt"><span>RISCO DE PERDER A BOLA</span><b style={{ color: risk.c }}>{risk.t}</b></div>
              <button type="button" className="ct-go" onClick={() => go()}>{lateral ? 'COBRAR LATERAL' : 'COBRAR TIRO DE META'}</button>
            </div>
            <div className="ct-bar-l"><i>{ABBR(taker.pos)}</i><b>{taker.name}</b><em>{taker.ovr}</em></div>
            <div className="ct-bar-r"><b>{rcv ? `${rcv.name}` : gkOpp?.name ?? ''}</b><em>{rcv?.ovr ?? ''}</em></div>
          </div>
        </div>
        <div className="ct-desc"><b>{info.label}:</b> {info.text}</div>
      </div>
    </div>
  );
}

const RT_CSS = `
.rt-wrap .ct-legend { top: 6%; }
.rt-wrap .ct-tac { top: 27%; bottom: auto; }
.rt-wrap .ct-bar-r { width: 28%; }
.rt-wrap .rt-go { bottom: 46px; }
@media (max-width: 760px), (max-height: 520px) { .rt-wrap .ct-legend { display: none; } }
`;
