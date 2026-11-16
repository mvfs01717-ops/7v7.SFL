import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player, Team } from '@/lib/game/types';
import { useLite } from '@/lib/settings';
import { playMvp } from '@/lib/sfx';

// Carta de MVP (visual próprio: moldura holográfica dourada) e a animação que revela o melhor em campo.

const cut = 'polygon(11% 0, 89% 0, 100% 6.5%, 100% 93.5%, 89% 100%, 11% 100%, 0 93.5%, 0 6.5%)';

export const mvpCss = `
.mvc { container-type: inline-size; position: relative; width: 100%; aspect-ratio: .68; color: #fff; filter: drop-shadow(0 16px 22px rgba(0,0,0,.6)); user-select: none; }
.mvc-frame { position: absolute; inset: 0; clip-path: ${cut}; background: linear-gradient(115deg, #ffe27a, #F5B800 18%, #fff6c8 32%, #b8860b 48%, #ffe27a 62%, #F5B800 78%, #fff6c8 92%); background-size: 320% 320%; animation: mvcHolo 5s linear infinite; }
.mvc-body { position: absolute; inset: 2.2cqw; clip-path: ${cut}; overflow: hidden; background: radial-gradient(120% 70% at 50% 24%, color-mix(in srgb, var(--mv, #1d2f8f) 75%, #000) 0, #0b1020 62%, #05070d 100%); }
.mvc-pat { position: absolute; inset: 0; background: repeating-linear-gradient(115deg, rgba(255,255,255,.06) 0 2cqw, transparent 2cqw 6cqw); }
.mvc-glow { position: absolute; left: 50%; top: 42%; width: 90%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, rgba(255,226,122,.55), rgba(245,184,0,0) 68%); }
.mvc-shine { position: absolute; inset: -20% -60%; background: linear-gradient(105deg, transparent 42%, rgba(255,255,255,.4) 50%, transparent 58%); transform: translateX(-60%); animation: mvcShine 3.4s ease-in-out infinite; mix-blend-mode: soft-light; pointer-events: none; }
.mvc-col { position: absolute; inset: 0; padding: 6.5cqw 7cqw 6cqw; display: flex; flex-direction: column; justify-content: space-between; }
.mvc-top { display: flex; justify-content: space-between; align-items: flex-start; }
.mvc-rate { line-height: .85; font: 900 italic 21cqw 'Bebas Neue', Inter, sans-serif; color: #ffe27a; text-shadow: 0 0 14px rgba(245,184,0,.6); }
.mvc-rate small { display: block; font: 800 5.6cqw Inter, sans-serif; font-style: normal; letter-spacing: .16em; color: #fff; opacity: .85; margin-top: 1.4cqw; }
.mvc-side { display: grid; justify-items: end; gap: 2.4cqw; }
.mvc-badge { padding: 1.8cqw 3.8cqw; border-radius: 99px; font: 900 6.4cqw Inter, sans-serif; letter-spacing: .1em; color: #1a1200; background: linear-gradient(180deg, #fff1b0, #F5B800); box-shadow: 0 0 14px rgba(245,184,0,.7); }
.mvc-pos { font: 900 7.4cqw 'Bebas Neue', Inter, sans-serif; letter-spacing: .08em; padding: .6cqw 2.6cqw; border: 1px solid rgba(255,226,122,.7); border-radius: 1.8cqw; color: #ffe27a; }
.mvc-av { position: relative; align-self: center; width: 46%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: radial-gradient(circle at 35% 30%, #fff8dc, #e8c867 60%, #b58b22); border: .9cqw solid rgba(255,255,255,.85); box-shadow: 0 0 0 1.6cqw rgba(245,184,0,.35), 0 8px 18px rgba(0,0,0,.5); font: 900 26cqw 'Bebas Neue', Inter, sans-serif; color: #2a1d00; }
.mvc-av img { width: 100%; height: 100%; object-fit: cover; }
.mvc-star { position: absolute; font-size: 6.5cqw; color: #ffe27a; animation: mvcTw 2.2s ease-in-out infinite; }
.mvc-who { text-align: center; }
.mvc-name { font: 900 11cqw/1 'Bebas Neue', Inter, sans-serif; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 0 rgba(0,0,0,.5); }
.mvc-team { margin-top: 1.4cqw; font: 800 5.4cqw Inter, sans-serif; letter-spacing: .16em; color: rgba(255,255,255,.75); }
.mvc-team i { display: inline-block; width: 3cqw; height: 3cqw; border-radius: 50%; margin-right: 1.8cqw; vertical-align: -.2cqw; box-shadow: 0 0 0 1px rgba(255,255,255,.7); }
.mvc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2cqw; border-top: 1px solid rgba(255,226,122,.4); padding-top: 2cqw; text-align: center; font: 800 4.8cqw Inter, sans-serif; letter-spacing: .06em; color: rgba(255,255,255,.8); }
.mvc-stats b { display: block; font: 900 9.5cqw 'Bebas Neue', Inter, sans-serif; color: #fff; line-height: 1; letter-spacing: 0; }
@keyframes mvcHolo { 0% { background-position: 0% 50%; } 100% { background-position: 320% 50%; } }
@keyframes mvcShine { 0%, 55% { transform: translateX(-60%); } 100% { transform: translateX(60%); } }
@keyframes mvcTw { 50% { opacity: .25; transform: scale(.6) rotate(25deg); } }
@media (prefers-reduced-motion: reduce) { .mvc-frame, .mvc-shine, .mvc-star { animation: none; } }

.mv-back { position: fixed; inset: 0; z-index: 650; display: grid; place-items: center; overflow: hidden; cursor: pointer; background: radial-gradient(90% 70% at 50% 40%, rgba(24,32,58,.96), rgba(3,5,10,.98)); animation: mvFade .5s ease-out both; }
.mv-rays { position: absolute; left: 50%; top: 42%; width: 190vmax; height: 190vmax; transform: translate(-50%, -50%); background: repeating-conic-gradient(from 0deg, rgba(255,226,122,.2) 0 5deg, transparent 5deg 15deg); -webkit-mask-image: radial-gradient(circle, #000 0, transparent 55%); mask-image: radial-gradient(circle, #000 0, transparent 55%); animation: mvSpin 26s linear infinite, mvFade 1.4s .3s ease-out both; }
.mv-col { position: relative; display: grid; justify-items: center; gap: 10px; padding: 18px; width: min(100%, 420px); }
.mv-title { margin: 0; line-height: .85; text-align: center; font: 900 italic clamp(70px, 22vw, 128px) 'Bebas Neue', Inter, sans-serif; color: #ffe27a; letter-spacing: .04em; text-shadow: 0 0 44px rgba(245,184,0,.75), 0 6px 0 rgba(0,0,0,.45); animation: mvSlam .75s .15s cubic-bezier(.2,1.4,.3,1) both; }
.mv-sub { margin: 0; font: 900 12px Inter, sans-serif; letter-spacing: .36em; color: #fff; opacity: .85; text-align: center; animation: mvFade .6s .7s both; }
.mv-stage { position: relative; width: min(52vw, 230px); perspective: 900px; margin-top: 4px; }
.mv-card { animation: mvFly 1.25s 1s cubic-bezier(.18,.9,.25,1.12) both; transform-style: preserve-3d; }
.mv-ring { position: absolute; left: 50%; top: 50%; width: 100%; aspect-ratio: 1; border-radius: 50%; border: 3px solid rgba(255,226,122,.9); transform: translate(-50%, -50%) scale(.2); opacity: 0; animation: mvRing 1s 2s ease-out both; pointer-events: none; }
.mv-flash { position: absolute; inset: 0; background: #fff6c8; opacity: 0; animation: mvFlash .7s 2s ease-out both; pointer-events: none; }
.mv-spark { position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; border-radius: 50%; background: #ffe27a; box-shadow: 0 0 8px #F5B800; opacity: 0; animation: mvSpark 1.3s 2s ease-out both; }
.mv-conf { position: absolute; top: -14px; width: 8px; height: 14px; border-radius: 2px; opacity: 0; animation: mvFall linear infinite; animation-delay: 2s; }
.mv-who { text-align: center; animation: mvFade .6s 2.4s both; }
.mv-who h2 { margin: 0; font: 900 28px/1 'Bebas Neue', Inter, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
.mv-who p { margin: 4px 0 0; font: 700 12px Inter, sans-serif; opacity: .75; }
.mv-btn { margin-top: 4px; padding: 11px 28px; border: 0; border-radius: 99px; font: 900 13px Inter, sans-serif; letter-spacing: .1em; background: #F5B800; color: #1a1200; cursor: pointer; animation: mvFade .5s 3s both; }
@keyframes mvFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes mvSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes mvSlam { 0% { opacity: 0; transform: scale(3.2); filter: blur(14px); } 100% { opacity: 1; transform: none; filter: none; } }
@keyframes mvFly { 0% { opacity: 0; transform: translateY(120px) scale(.35) rotateY(-540deg); } 60% { opacity: 1; } 100% { opacity: 1; transform: none; } }
@keyframes mvRing { 0% { opacity: .9; transform: translate(-50%, -50%) scale(.4); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(2.6); } }
@keyframes mvFlash { 0% { opacity: .55; } 100% { opacity: 0; } }
@keyframes mvSpark { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.2); } }
@keyframes mvFall { 0% { transform: translateY(0) rotate(0); opacity: 0; } 8% { opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: .9; } }
@media (prefers-reduced-motion: reduce) { .mv-rays, .mv-title, .mv-sub, .mv-card, .mv-ring, .mv-flash, .mv-spark, .mv-conf, .mv-who, .mv-btn, .mv-back { animation: none !important; opacity: 1; } .mv-ring, .mv-flash, .mv-spark, .mv-conf { display: none; } }
`;

type Info = { player: Player; team: Pick<Team, 'abbreviation' | 'primary_color'>; rating: number; goals: number; assists: number };

export function MvpCard({ player, team, rating, goals, assists }: Info) {
  return (
    <div className="mvc" style={{ ['--mv' as string]: team.primary_color }} aria-label={`MVP: ${player.name}, nota ${rating.toFixed(1)}`}>
      <style>{mvpCss}</style>
      <div className="mvc-frame" />
      <div className="mvc-body">
        <div className="mvc-pat" />
        <div className="mvc-glow" />
        <span className="mvc-star" style={{ left: '10%', top: '50%' }}>✦</span>
        <span className="mvc-star" style={{ right: '9%', top: '40%', animationDelay: '.7s' }}>✦</span>
        <span className="mvc-star" style={{ right: '13%', top: '58%', animationDelay: '1.4s', fontSize: '4.6cqw' }}>✦</span>
        <div className="mvc-col">
          <div className="mvc-top">
            <div className="mvc-rate">
              {rating.toFixed(1)}
              <small>NOTA</small>
            </div>
            <div className="mvc-side">
              <div className="mvc-badge">★ MVP</div>
              <div className="mvc-pos">{player.primary_position}</div>
            </div>
          </div>
          <div className="mvc-av">{player.image_url ? <img src={player.image_url} alt="" /> : player.name.slice(0, 1).toUpperCase()}</div>
          <div className="mvc-who">
            <div className="mvc-name">{player.name}</div>
            <div className="mvc-team">
              <i style={{ background: team.primary_color }} />
              {team.abbreviation}
            </div>
          </div>
          <div className="mvc-stats">
            <span>
              <b>{goals}</b>GOLS
            </span>
            <span>
              <b>{assists}</b>ASSIST.
            </span>
            <span>
              <b>{player.overall}</b>OVERALL
            </span>
          </div>
        </div>
        <div className="mvc-shine" />
      </div>
    </div>
  );
}

// Tela cheia: "MVP" bate na tela, a carta voa girando, explode em brilho e a nota sobe até o valor final
export function MvpReveal({ onClose, mine, ...info }: Info & { mine: boolean; onClose: () => void }) {
  const lite = useLite();
  const [shown, setShown] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const sparks = useMemo(
    () =>
      Array.from({ length: lite ? 12 : 26 }, (_, i) => {
        const a = (i / (lite ? 12 : 26)) * Math.PI * 2 + (i % 3) * 0.2;
        const r = 120 + ((i * 53) % 110);
        return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
      }),
    [lite],
  );
  const conf = useMemo(
    () => Array.from({ length: lite ? 10 : 28 }, (_, i) => ({ l: (i * 37) % 100, d: (i * 0.37) % 4, t: 3.6 + ((i * 7) % 4), c: ['#F5B800', '#ffe27a', '#fff', '#4ade80'][i % 4] })),
    [lite],
  );
  useEffect(() => {
    playMvp();
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const from = 2200;
    const span = 1100;
    const tick = (now: number) => {
      const u = Math.min(1, Math.max(0, (now - t0 - from) / span));
      setShown(info.rating * (1 - Math.pow(1 - u, 3)));
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    if (reduced) setShown(info.rating);
    else raf = requestAnimationFrame(tick);
    const auto = window.setTimeout(() => closeRef.current(), 12000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(auto);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="mv-back" role="dialog" aria-label="MVP da partida" onClick={onClose}>
      <style>{mvpCss}</style>
      <div className="mv-rays" />
      {conf.map((c, i) => (
        <i key={i} className="mv-conf" style={{ left: `${c.l}%`, background: c.c, animationDelay: `${2 + c.d}s`, animationDuration: `${c.t}s` }} />
      ))}
      <div className="mv-col">
        <h1 className="mv-title">MVP</h1>
        <p className="mv-sub">DA PARTIDA</p>
        <div className="mv-stage">
          <div className="mv-ring" />
          {sparks.map((s, i) => (
            <i key={i} className="mv-spark" style={{ ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` }} />
          ))}
          <div className="mv-card">
            <MvpCard {...info} rating={shown} />
          </div>
        </div>
        <div className="mv-who">
          <h2>{info.player.name}</h2>
          <p>
            {mine ? 'Craque do seu time' : 'MVP do adversário'} · {info.goals} {info.goals === 1 ? 'gol' : 'gols'} · {info.assists} assist.
          </p>
        </div>
        <button type="button" className="mv-btn" onClick={onClose}>
          CONTINUAR
        </button>
      </div>
    </div>
  );
}
