import { useEffect, useRef, useState } from 'react';
import type { LiveSnap } from '@/components/MatchPitch';
import type { Ambience } from '@/lib/game/ambience';
import { useLite } from '@/lib/settings';
import { celebAt, useCosmetics } from '@/lib/cosmetics';
import { playPost } from '@/lib/sfx';

// Efeitos de estádio por cima do campo 2D: mascotes, bandeirões, telão com replay, fogos e fumaça colorida,
// neblina à noite, reflexo da chuva, poeira no chute e o "soco" de câmera no gol.
// (A câmera 3D tem a versão dela dessas mesmas coisas dentro do LiveCam.)

type Side = 'user' | 'bot';
type Team = { name: string; abbreviation: string; primary_color: string; secondary_color: string };
export type Burst = { side: Side; key: number } | null;

const W = 740;
const H = 440;
const STAND = 62;
const FX0 = 20;
const FY0 = 10;
const MID_X = 370;

export const fxCss = `
@media (max-width: 560px) { .fx-telao { display: none; } }
@keyframes fxSpark { 0% { transform: translate(0,0) scale(1); opacity: 1; } 70% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(.15); opacity: 0; } }
@keyframes fxSmoke { 0% { transform: translate(0,0) scale(.5); opacity: 0; } 15% { opacity: .5; } 100% { transform: translate(var(--sx), -46px) scale(2.6); opacity: 0; } }
@keyframes fxJump { 0%,100% { transform: translateY(0); } 35% { transform: translateY(-16px); } 60% { transform: translateY(-3px); } }
@keyframes fxBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes fxBanner { 0%,100% { transform: skewX(0deg) scaleX(1); } 50% { transform: skewX(-5deg) scaleX(.94); } }
@keyframes fxFog { 0% { transform: translateX(-60px); } 100% { transform: translateX(60px); } }
@keyframes fxShine { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes fxRing { 0% { transform: scale(.3); opacity: .95; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes fxPostShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-2.5px); } 40% { transform: translateX(2.5px); } 60% { transform: translateX(-1.5px); } 80% { transform: translateX(1px); } }
@keyframes fxLights { 0% { opacity: .72; } 7% { opacity: .5; } 11% { opacity: .8; } 19% { opacity: .46; } 27% { opacity: .74; } 36% { opacity: .38; } 48% { opacity: .55; } 62% { opacity: .24; } 78% { opacity: .1; } 100% { opacity: 0; } }
@keyframes fxLightsLite { 0% { opacity: .6; } 100% { opacity: 0; } }
@keyframes fxFlare { 0% { opacity: 0; transform: scale(.4); } 30% { opacity: 1; transform: scale(1.5); } 100% { opacity: .85; transform: scale(1); } }
@keyframes fxDust { 0% { transform: translate(0,0) scale(.4); opacity: .55; } 100% { transform: translate(var(--dx), -10px) scale(2.2); opacity: 0; } }
.fx-lights { animation: fxLights 6.5s linear both; }
.fx-lights.lite { animation: fxLightsLite 3s ease-out both; }
.fx-flare { transform-box: fill-box; transform-origin: 50% 50%; animation: fxFlare .9s ease-out both; }
.fx-ring { transform-box: fill-box; transform-origin: 50% 50%; animation: fxRing .7s ease-out both; }
.fx-postshake { animation: fxPostShake .45s linear 2; }
.fx-spark, .fx-smoke, .fx-dust { transform-box: fill-box; transform-origin: 50% 50%; animation-fill-mode: both; }
.fx-spark { animation: fxSpark var(--d, 1.5s) cubic-bezier(.15,.7,.3,1) var(--l, 0s); }
.fx-smoke { animation: fxSmoke var(--d, 2.6s) ease-out var(--l, 0s); }
.fx-dust { animation: fxDust .9s ease-out; }
.fx-jump { animation: fxJump .9s ease-in-out 3; }
.fx-bob { animation: fxBob 1.1s ease-in-out infinite; }
.fx-banner { transform-box: fill-box; transform-origin: 0 50%; animation: fxBanner 1.6s ease-in-out infinite; }
.fx-fog { animation: fxFog 14s ease-in-out infinite alternate; }
.fx-shine { animation: fxShine 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .fx-spark, .fx-smoke, .fx-dust, .fx-jump, .fx-bob, .fx-banner, .fx-fog, .fx-shine { animation: none !important; } }
`;

// Mascote genérico (criação própria): bichinho redondo com orelhas, nas cores do clube. Desenhado com a base em (0,0).
export function Mascot({ team, flip = false }: { team: Team; flip?: boolean }) {
  return (
    <g transform={flip ? 'scale(-1 1)' : undefined}>
      <ellipse cx={0} cy={0} rx={11} ry={3} fill="rgba(0,0,0,.35)" />
      <circle cx={-7} cy={-27} r={4.2} fill={team.primary_color} stroke="rgba(0,0,0,.4)" strokeWidth={0.6} />
      <circle cx={7} cy={-27} r={4.2} fill={team.primary_color} stroke="rgba(0,0,0,.4)" strokeWidth={0.6} />
      <path d="M-9 -9 L-15 -17 M9 -9 L15 -17" stroke={team.primary_color} strokeWidth={4} strokeLinecap="round" />
      <ellipse cx={0} cy={-11} rx={10} ry={10.5} fill={team.primary_color} stroke="rgba(0,0,0,.4)" strokeWidth={0.7} />
      <ellipse cx={0} cy={-8} rx={6.2} ry={6.6} fill={team.secondary_color} opacity={0.92} />
      <circle cx={0} cy={-21} r={8.6} fill={team.primary_color} stroke="rgba(0,0,0,.4)" strokeWidth={0.7} />
      <circle cx={-3.2} cy={-22} r={2.4} fill="#fff" />
      <circle cx={3.2} cy={-22} r={2.4} fill="#fff" />
      <circle cx={-2.8} cy={-21.8} r={1.1} fill="#111" />
      <circle cx={3.6} cy={-21.8} r={1.1} fill="#111" />
      <path d="M-3 -17.5 Q0 -15 3 -17.5" stroke="#111" strokeWidth={0.9} fill="none" strokeLinecap="round" />
    </g>
  );
}

const seeded = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Dá a "chave" do gol (para reiniciar fogos, soco de câmera etc.)
export function useGoalFx(burst: Burst, home: Side) {
  const key = burst?.key ?? 0;
  const [last, setLast] = useState<{ side: Side; key: number; at: number } | null>(null);
  useEffect(() => {
    if (!burst) return;
    setLast({ side: burst.side, key: burst.key, at: performance.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { last, homeGoal: !!last && last.side === home };
}

export function Fireworks({ club, home, k, count = 4 }: { club: Team; home: Team; k: number; count?: number }) {
  void club;
  const cols = [home.primary_color, home.secondary_color, '#ffffff', '#ffd54a'];
  return (
    <g key={k}>
      {Array.from({ length: count }).map((_, s) => {
        const cx = 90 + seeded(s, k) * (W - 180);
        const cy = -34 + seeded(s, k + 9) * 18;
        return (
          <g key={s}>
            {Array.from({ length: 16 }).map((__, i) => {
              const a = (i / 16) * Math.PI * 2 + seeded(s, i) * 0.3;
              const r = 34 + seeded(i, s + k) * 22;
              return <circle key={i} className="fx-spark" cx={cx} cy={cy} r={1.9} fill={cols[(i + s) % cols.length]} style={{ ['--dx' as string]: `${(Math.cos(a) * r).toFixed(1)}px`, ['--dy' as string]: `${(Math.sin(a) * r + 14).toFixed(1)}px`, ['--d' as string]: '1.5s', ['--l' as string]: `${(s * 0.32).toFixed(2)}s` }} />;
            })}
          </g>
        );
      })}
      {Array.from({ length: 6 }).map((_, i) => (
        <circle key={`m${i}`} className="fx-smoke" cx={70 + i * 120} cy={-6} r={16} fill={i % 2 ? home.secondary_color : home.primary_color} opacity={0.5} style={{ filter: 'blur(5px)', ['--sx' as string]: `${((i % 3) - 1) * 14}px`, ['--l' as string]: `${(i * 0.15).toFixed(2)}s` }} />
      ))}
    </g>
  );
}

export function StadiumFx({ liveRef, club, opponent, home, ambience, burst, score, wrapRef }: { liveRef: { current: LiveSnap | null }; club: Team; opponent: Team; home: Side; ambience: Ambience; burst: Burst; score: { user: number; bot: number }; wrapRef: { current: HTMLElement | null } }) {
  const lite = useLite();
  const homeTeam = home === 'user' ? club : opponent;
  const { last, homeGoal } = useGoalFx(burst, home);
  const cos = useCosmetics();
  const cosRef = useRef(cos);
  cosRef.current = cos;
  const liteRef = useRef(lite);
  liteRef.current = lite;
  const buf = useRef<{ t: number; x: number; y: number; h: number; side: Side; letter: string; hx: number; hy: number }[]>([]);
  const celebRef = useRef<{ at: number; kind: string; sx: number; sy: number; d: number; side: Side; letter: string } | null>(null);
  const celebNode = useRef<SVGGElement | null>(null);
  const celebTok = useRef<SVGGElement | null>(null);
  const celebArms = useRef<SVGPathElement | null>(null);
  const celebShadow = useRef<SVGEllipseElement | null>(null);
  const trailNodes = useRef<(SVGCircleElement | null)[]>([]);
  const trailData = useRef<{ born: number }[]>(Array.from({ length: 36 }, () => ({ born: -1e9 })));
  const trailNext = useRef(0);
  const prevPts = useRef<{ t: number; pts: number[] } | null>(null);
  const lastDrop = useRef<number[]>([]);
  const [replay, setReplay] = useState<{ pts: [number, number][]; key: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [post, setPost] = useState<{ x: number; y: number; key: number } | null>(null);
  // Bola na trave: som, trave balançando (anel + tremor) e uma tremidinha na tela
  useEffect(() => {
    const onPost = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number }>).detail;
      if (!d) return;
      setPost({ x: d.x, y: d.y, key: Date.now() });
      playPost();
      const el = wrapRef.current;
      if (el && !liteRef.current && typeof el.animate === 'function') {
        el.style.transformOrigin = d.x > 370 ? '100% 50%' : '0% 50%';
        el.animate(
          [
            { transform: 'translate(0,0) scale(1)' },
            { transform: 'translate(-2px,1px) scale(1.012)', offset: 0.15 },
            { transform: 'translate(2px,-1px) scale(1.012)', offset: 0.3 },
            { transform: 'translate(-1px,1px) scale(1.008)', offset: 0.5 },
            { transform: 'translate(0,0) scale(1)' },
          ],
          { duration: 520, easing: 'ease-out' },
        );
      }
    };
    window.addEventListener('pitch-post', onPost);
    return () => window.removeEventListener('pitch-post', onPost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dust, setDust] = useState<{ x: number; y: number; key: number } | null>(null);

  // guarda ~4s da trajetória da bola para o telão e a poeira do chute
  useEffect(() => {
    let raf = 0;
    let lastAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = liveRef.current;
      if (!s || now - lastAt < 60) return;
      const dtp = now - lastAt;
      lastAt = now;
      const hi = s.holder;
      buf.current.push({ t: now, x: s.ball[0], y: s.ball[1], h: hi, side: hi >= 0 ? s.sides[hi] : 'user', letter: hi >= 0 ? s.letters[hi] : '', hx: hi >= 0 ? s.pts[hi * 2] : s.ball[0], hy: hi >= 0 ? s.pts[hi * 2 + 1] : s.ball[1] });
      while (buf.current.length && now - buf.current[0].t > 4200) buf.current.shift();
      // rastro colorido da chuteira dos seus jogadores em velocidade
      const pp = prevPts.current;
      if (pp && !liteRef.current && cosRef.current.boots.id !== 'preta' && !s.frozen) {
        for (let n = 0; n < s.sides.length; n += 1) {
          if (s.sides[n] !== 'user') continue;
          const dx = s.pts[n * 2] - pp.pts[n * 2];
          const dy = s.pts[n * 2 + 1] - pp.pts[n * 2 + 1];
          const sp = (Math.hypot(dx, dy) / Math.max(1, dtp)) * 1000;
          if (sp > 130 && sp < 700 && now - (lastDrop.current[n] ?? 0) > 120) {
            lastDrop.current[n] = now;
            const i = trailNext.current % 36;
            trailNext.current += 1;
            const node = trailNodes.current[i];
            if (node) {
              node.setAttribute('cx', (s.pts[n * 2] - dx * 0.6).toFixed(1));
              node.setAttribute('cy', (s.pts[n * 2 + 1] + 11 - dy * 0.6).toFixed(1));
              node.setAttribute('fill', cosRef.current.boots.color);
              trailData.current[i].born = now;
            }
          }
        }
      }
      prevPts.current = { t: now, pts: s.pts.slice() };
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [liveRef]);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      for (let i = 0; i < 36; i += 1) {
        const node = trailNodes.current[i];
        if (!node) continue;
        const a = (now - trailData.current[i].born) / 700;
        if (a < 0 || a > 1) {
          node.setAttribute('opacity', '0');
          continue;
        }
        node.setAttribute('opacity', (0.75 * (1 - a)).toFixed(2));
        node.setAttribute('r', (2.6 + a * 1.4).toFixed(1));
      }
      const c = celebRef.current;
      const g = celebNode.current;
      if (!g) return;
      const t = c ? (now - c.at) / 1000 : 99;
      if (!c || t > 3.2) {
        g.setAttribute('display', 'none');
        return;
      }
      const m = celebAt(c.kind, t, c.sx, c.sy, c.d);
      g.setAttribute('display', 'inline');
      g.setAttribute('transform', `translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})`);
      celebShadow.current?.setAttribute('opacity', (0.4 - m.lift * 0.02).toFixed(2));
      celebTok.current?.setAttribute('transform', `translate(0 ${(-m.lift).toFixed(1)}) rotate(${m.rot.toFixed(1)}) scale(${m.sx.toFixed(3)} ${m.sy.toFixed(3)})`);
      celebArms.current?.setAttribute('display', m.arms ? 'inline' : 'none');
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!last) return;
    const now = performance.now();
    // quem fez o gol: o último com a bola do lado que marcou
    const scorer = [...buf.current].reverse().find((p) => p.h >= 0 && p.side === last.side && now - p.t < 3000);
    if (scorer) {
      const d = last.side === 'user' ? 1 : -1;
      celebRef.current = { at: now, kind: last.side === 'user' ? cosRef.current.celeb.id : 'corrida', sx: Math.min(700, Math.max(40, scorer.hx)), sy: Math.min(410, Math.max(30, scorer.hy)), d, side: last.side, letter: scorer.letter };
      if (celebTok.current && celebRef.current) {
        const team = last.side === 'user' ? club : opponent;
        celebTok.current.querySelector('circle')?.setAttribute('fill', team.primary_color);
        celebTok.current.querySelector('circle')?.setAttribute('stroke', team.secondary_color);
        const tx = celebTok.current.querySelector('text');
        if (tx) {
          tx.textContent = scorer.letter;
          tx.setAttribute('fill', team.primary_color === '#ffffff' ? '#111' : '#fff');
        }
      }
    }
    const b = buf.current;
    const pts = b.filter((p) => now - p.t < 3600).map((p) => [p.x, p.y] as [number, number]);
    if (pts.length > 4) setReplay({ pts, key: last.key });
    const strike = b.find((p) => now - p.t < 900) ?? b[b.length - 1];
    if (strike) setDust({ x: strike.x, y: strike.y, key: last.key });
    // soco de câmera no gol (zoom + tremor), sem remontar o campo
    const el = wrapRef.current;
    if (el && !lite && typeof el.animate === 'function') {
      const side = last.side === 'user' ? '100% 50%' : '0% 50%';
      el.style.transformOrigin = side;
      el.animate(
        [
          { transform: 'scale(1) translate(0,0)' },
          { transform: 'scale(1.06) translate(-2px,1px)', offset: 0.12 },
          { transform: 'scale(1.06) translate(2px,-2px)', offset: 0.24 },
          { transform: 'scale(1.05) translate(-1px,1px)', offset: 0.38 },
          { transform: 'scale(1.04) translate(0,0)', offset: 0.6 },
          { transform: 'scale(1) translate(0,0)' },
        ],
        { duration: 1500, easing: 'ease-out' },
      );
    }
    const id = window.setInterval(() => setTick((n) => n + 1), 100);
    const stop = window.setTimeout(() => window.clearInterval(id), 7200);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.key]);

  const age = last ? performance.now() - last.at : 99999;
  void tick;
  const mode = age < 3200 ? 'goal' : age < 7000 && replay ? 'replay' : 'score';
  const telX = MID_X - 78;
  const telY = -58;
  const telW = 156;
  const telH = 38;
  let rp: string | null = null;
  if (mode === 'replay' && replay) {
    const upto = Math.max(2, Math.floor(((age - 3200) / 3800) * replay.pts.length));
    rp = replay.pts
      .slice(0, upto)
      .map(([x, y], i) => `${i ? 'L' : 'M'}${(telX + 6 + ((x - FX0) / 700) * (telW - 12)).toFixed(1)} ${(telY + 5 + ((y - FY0) / 420) * (telH - 10)).toFixed(1)}`)
      .join('');
  }
  const bannerPairs = [-1, 1];

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
      <style>{fxCss}</style>
      <svg viewBox={`0 ${-STAND} ${W} ${H + STAND * 2}`} style={{ display: 'block', width: '100%', height: 'auto' }} aria-hidden="true">
        <defs>
          <linearGradient id="fx-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity={0} />
            <stop offset="45%" stopColor="#cfe7ff" stopOpacity={0.14} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fx-tel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1830" />
            <stop offset="100%" stopColor="#05080f" />
          </linearGradient>
        </defs>

        {/* refletores acendendo aos poucos antes do jogo noturno */}
        {ambience.time === 'night' && (
          <g style={{ pointerEvents: 'none' }}>
            <rect className={`fx-lights ${lite ? 'lite' : ''}`} x={0} y={-STAND} width={W} height={H + STAND * 2} fill="#02050c" />
            {!lite &&
              [60, 190, 550, 680].flatMap((x, i) =>
                [-50, 488].map((y, j) => (
                  <g key={`fl${i}${j}`} className="fx-flare" style={{ animationDelay: `${(0.4 + i * 0.75 + j * 0.3).toFixed(2)}s` }}>
                    <circle cx={x} cy={y} r={11} fill="#fff6d0" opacity={0.28} style={{ filter: 'blur(4px)' }} />
                    <circle cx={x} cy={y} r={3.2} fill="#fffbe8" />
                  </g>
                )),
              )}
          </g>
        )}

        {/* bandeirões grandes da torcida da casa */}
        {bannerPairs.map((d) =>
          [0, 1].map((i) => {
            const bx = (home === 'user' ? 0 : MID_X) + (i ? 250 : 80) + (d > 0 ? 20 : 0);
            const bw = 46;
            return (
              <g key={`b${d}${i}`} className="fx-banner" style={{ animationDelay: `${(i + (d > 0 ? 1 : 0)) * 0.4}s` }}>
                <line x1={bx} y1={d < 0 ? -58 : 436} x2={bx} y2={d < 0 ? -10 : 484} stroke="#d1d5db" strokeWidth={1.6} />
                <rect x={bx} y={d < 0 ? -58 : 436} width={bw} height={20} fill={homeTeam.primary_color} stroke="rgba(255,255,255,.7)" strokeWidth={0.8} />
                <rect x={bx} y={d < 0 ? -50 : 444} width={bw} height={4} fill={homeTeam.secondary_color} />
                <circle cx={bx + bw / 2} cy={d < 0 ? -48 : 446} r={3.2} fill="#fff" opacity={0.85} />
              </g>
            );
          }),
        )}

        {/* mascotes */}
        {[{ x: 52, f: false }, { x: 688, f: true }].map((m, i) => (
          <g key={i} transform={`translate(${m.x} -2)`}>
            <g className={homeGoal && age < 3200 ? 'fx-jump' : 'fx-bob'} style={{ animationDelay: `${i * 0.4}s` }}>
              <Mascot team={homeTeam} flip={m.f} />
            </g>
          </g>
        ))}

        {/* telão (no celular fica escondido: o placar da TV já está por cima dele) */}
        <g className="fx-telao">
          <rect x={telX - 3} y={telY - 3} width={telW + 6} height={telH + 6} rx={4} fill="#1a1f2b" stroke="#3a4558" strokeWidth={1} />
          <rect x={telX} y={telY} width={telW} height={telH} rx={2} fill="url(#fx-tel)" />
          {mode === 'score' && (
            <g fontFamily="Inter, sans-serif" fontWeight={900} textAnchor="middle" fill="#fff">
              <text x={telX + 34} y={telY + 24} fontSize={14} fill={club.primary_color === '#000000' ? '#fff' : club.primary_color} stroke="#fff" strokeWidth={0.4}>{club.abbreviation}</text>
              <text x={MID_X} y={telY + 25} fontSize={19}>{score.user} - {score.bot}</text>
              <text x={telX + telW - 34} y={telY + 24} fontSize={14} fill={opponent.primary_color} stroke="#fff" strokeWidth={0.4}>{opponent.abbreviation}</text>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <circle key={n} cx={telX + 12 + n * 19} cy={telY + 33} r={1.6} fill={n % 2 ? homeTeam.primary_color : homeTeam.secondary_color} opacity={0.7} />
              ))}
            </g>
          )}
          {mode === 'goal' && last && (
            <g fontFamily="Inter, sans-serif" fontWeight={900} textAnchor="middle">
              <rect x={telX} y={telY} width={telW} height={telH} rx={2} fill={(last.side === 'user' ? club : opponent).primary_color} opacity={0.28} />
              <text x={MID_X} y={telY + 25} fontSize={22} fill="#fff" stroke="rgba(0,0,0,.5)" strokeWidth={2} style={{ paintOrder: 'stroke' }}>GOOOL!</text>
              <text x={MID_X} y={telY + 35} fontSize={7} fill="#F5B800">{(last.side === 'user' ? club : opponent).abbreviation}</text>
            </g>
          )}
          {mode === 'replay' && (
            <g>
              <rect x={telX + 6} y={telY + 5} width={telW - 12} height={telH - 10} fill="#0e3d1f" stroke="rgba(255,255,255,.45)" strokeWidth={0.6} />
              <line x1={MID_X} y1={telY + 5} x2={MID_X} y2={telY + telH - 5} stroke="rgba(255,255,255,.35)" strokeWidth={0.5} />
              {rp && <path d={rp} fill="none" stroke="#ffe27a" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />}
              <text x={telX + 9} y={telY + 12} fontSize={6.5} fontWeight={900} fill="#ff5a4f" fontFamily="Inter, sans-serif">● REPLAY</text>
            </g>
          )}
        </g>

        {/* neblina nos jogos noturnos */}
        {ambience.time === 'night' && !lite && (
          <g style={{ mixBlendMode: 'screen' }}>
            {[{ y: 60, o: 0.1 }, { y: 210, o: 0.08 }, { y: 350, o: 0.1 }].map((f, i) => (
              <ellipse key={i} className="fx-fog" cx={W / 2} cy={f.y} rx={440} ry={34} fill="#cfdcf0" opacity={f.o} style={{ filter: 'blur(14px)', animationDelay: `${-i * 4}s`, animationDuration: `${14 + i * 3}s` }} />
            ))}
          </g>
        )}

        {/* reflexo da chuva no gramado molhado */}
        {ambience.weather === 'rain' && !lite && (
          <g>
            <rect x={FX0} y={FY0} width={700} height={420} fill="url(#fx-sheen)" />
            {[110, 260, 370, 480, 630].map((x, i) => (
              <ellipse key={x} className="fx-shine" cx={x} cy={FY0 + 120 + (i % 2) * 90} rx={7} ry={70} fill="#e3f1ff" opacity={0.17} style={{ filter: 'blur(5px)', animationDelay: `${-i * 0.7}s` }} />
            ))}
          </g>
        )}

        {/* trave balançando */}
        {post && (
          <g key={post.key} className="fx-postshake">
            <line x1={post.x} y1={post.y - 6} x2={post.x} y2={post.y + 6} stroke="#fff" strokeWidth={4} strokeLinecap="round" />
            <circle className="fx-ring" cx={post.x} cy={post.y} r={9} fill="none" stroke="#fff" strokeWidth={2} />
            <circle className="fx-ring" cx={post.x} cy={post.y} r={9} fill="none" stroke="#ffe27a" strokeWidth={1.2} style={{ animationDelay: '.12s' }} />
          </g>
        )}

        {/* poeira do chute */}
        {dust && !lite && (
          <g key={dust.key}>
            {[0, 1, 2, 3, 4].map((n) => (
              <circle key={n} className="fx-dust" cx={dust.x + (n - 2) * 3} cy={dust.y + 3} r={4 + (n % 2) * 2} fill="#c9b48a" style={{ ['--dx' as string]: `${(n - 2) * 9}px`, animationDelay: `${n * 0.04}s` }} />
            ))}
          </g>
        )}

        {/* rastro da chuteira */}
        {Array.from({ length: 36 }).map((_, i) => (
          <circle key={`bt${i}`} ref={(el: SVGCircleElement | null) => { trailNodes.current[i] = el; }} r={3} opacity={0} />
        ))}

        {/* comemoração do autor do gol */}
        <g ref={celebNode} display="none">
          <ellipse ref={celebShadow} cx={0} cy={11} rx={14} ry={4.5} fill="#000" opacity={0.4} />
          <g ref={celebTok}>
            <path ref={celebArms} d="M-13 -2 L-22 -14 M13 -2 L22 -14" stroke="#f1d3b0" strokeWidth={3.4} strokeLinecap="round" fill="none" display="none" />
            <circle r={15} fill={club.primary_color} stroke={club.secondary_color} strokeWidth={3.5} />
            <text textAnchor="middle" dy={5} fontSize={14} fontWeight={800} fill="#fff" fontFamily="Inter, sans-serif" />
          </g>
        </g>

        {/* fogos e fumaça colorida quando o time da casa marca */}
        {homeGoal && last && <Fireworks club={club} home={homeTeam} k={last.key} count={lite ? 2 : 4} />}
      </svg>
    </div>
  );
}
