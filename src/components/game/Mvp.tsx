import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player, Team } from '@/lib/game/types';
import { useLite } from '@/lib/settings';
import { playMvp } from '@/lib/sfx';

// Carta de MVP (visual próprio: moldura holográfica dourada) e a animação que revela o melhor em campo.

const shield = 'polygon(6% 0, 94% 0, 100% 5%, 100% 82%, 93% 90%, 50% 100%, 7% 90%, 0 82%, 0 5%)';

export const mvpCss = `
.mvc { container-type: inline-size; position: relative; width: 100%; aspect-ratio: .72; color: #f3dca0; filter: drop-shadow(0 16px 22px rgba(0,0,0,.65)); user-select: none; }
.mvc-frame { position: absolute; inset: 0; clip-path: ${shield}; background: linear-gradient(120deg, #7a5a1c, #e9cf86 22%, #fff3c4 34%, #a9812f 50%, #e9cf86 66%, #7a5a1c 84%, #e9cf86); background-size: 300% 300%; animation: mvcHolo 6s linear infinite; }
.mvc-body { position: absolute; inset: 1.6cqw; clip-path: ${shield}; overflow: hidden; background:
  linear-gradient(112deg, transparent 0 26%, rgba(205,160,60,.34) 27% 30.5%, transparent 31.5% 47%, rgba(205,160,60,.2) 48% 58%, transparent 59% 78%, rgba(205,160,60,.16) 79% 83%, transparent 84%),
  radial-gradient(95% 62% at 58% 30%, color-mix(in srgb, var(--mv, #8a6a20) 38%, #6b5018) 0, transparent 70%),
  linear-gradient(180deg, #17130b, #0a0a0c 55%, #050506); }
.mvc-shine { position: absolute; inset: -20% -60%; background: linear-gradient(105deg, transparent 43%, rgba(255,240,190,.35) 50%, transparent 57%); transform: translateX(-60%); animation: mvcShine 4s ease-in-out infinite; mix-blend-mode: soft-light; pointer-events: none; }
.mvc-av { position: absolute; right: -2cqw; top: 8cqw; width: 66cqw; aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; border-radius: 50% 50% 0 0 / 60% 60% 0 0; background: radial-gradient(circle at 50% 30%, rgba(255,236,170,.5), rgba(160,120,40,.22) 62%, transparent 72%); font: 900 62cqw/.9 'Bebas Neue', Inter, sans-serif; color: transparent; background-clip: padding-box; }
.mvc-av b { background: linear-gradient(180deg, #fff1bd 0%, #d9b45a 55%, #6d5116 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 6px rgba(0,0,0,.55)); }
.mvc-av img { width: 100%; height: 100%; object-fit: cover; object-position: top; -webkit-mask-image: linear-gradient(#000 70%, transparent); mask-image: linear-gradient(#000 70%, transparent); }
.mvc-l { position: absolute; left: 8.5cqw; top: 8cqw; display: grid; justify-items: center; gap: 2cqw; width: 18cqw; }
.mvc-ovr { font: 900 20cqw/.85 'Bebas Neue', Inter, sans-serif; color: #f6e2a4; text-shadow: 0 2px 0 rgba(0,0,0,.5); }
.mvc-pos { font: 900 7.4cqw/1 'Bebas Neue', Inter, sans-serif; letter-spacing: .06em; color: #f6e2a4; border-top: .5cqw solid rgba(246,226,164,.7); border-bottom: .5cqw solid rgba(246,226,164,.7); padding: 1cqw 0; width: 100%; text-align: center; }
.mvc-crest { width: 10cqw; aspect-ratio: 1; border-radius: 50%; box-shadow: 0 0 0 .8cqw rgba(246,226,164,.85), 0 0 0 1.4cqw rgba(0,0,0,.5); }
.mvc-emb { width: 11cqw; aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; border: .6cqw solid #f6e2a4; font-size: 6.4cqw; color: #f6e2a4; background: rgba(0,0,0,.35); }
.mvc-name { position: absolute; left: 5cqw; right: 5cqw; top: 66cqw; text-align: center; font: 900 11.5cqw/1 'Bebas Neue', Inter, sans-serif; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #f6e2a4; padding-bottom: 1.6cqw; border-bottom: .5cqw solid rgba(246,226,164,.55); text-shadow: 0 2px 0 rgba(0,0,0,.6); }
.mvc-stats { position: absolute; left: 8cqw; right: 8cqw; top: 82cqw; display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; font: 800 4.6cqw Inter, sans-serif; letter-spacing: .08em; color: rgba(246,226,164,.8); }
.mvc-stats span + span { border-left: .4cqw solid rgba(246,226,164,.3); }
.mvc-stats b { display: block; margin-top: .6cqw; font: 900 11cqw/1 'Bebas Neue', Inter, sans-serif; color: #fff2c4; letter-spacing: 0; }
.mvc-tag { position: absolute; left: 0; right: 0; bottom: 11cqw; text-align: center; font: 900 5cqw Inter, sans-serif; letter-spacing: .3em; color: rgba(246,226,164,.75); }
@keyframes mvcHolo { 0% { background-position: 0% 50%; } 100% { background-position: 300% 50%; } }
@keyframes mvcShine { 0%, 55% { transform: translateX(-60%); } 100% { transform: translateX(60%); } }
@media (prefers-reduced-motion: reduce) { .mvc-frame, .mvc-shine { animation: none; } }

.mvb { container-type: inline-size; position: absolute; inset: 0; clip-path: ${shield}; background: linear-gradient(120deg, #7a5a1c, #e9cf86 30%, #a9812f 60%, #e9cf86); }
.mvb-in { position: absolute; inset: 1.2cqw; clip-path: ${shield}; display: grid; place-items: center; background: radial-gradient(120% 90% at 50% 28%, #53c6df, #2a93b3 60%, #1e7090); }
.mvb-in::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,.18) 50%, transparent 62%); }
.mvb-logo { display: grid; place-items: center; width: 54cqw; aspect-ratio: 1; border-radius: 50%; border: 2.4cqw solid rgba(190,250,255,.75); box-shadow: 0 0 0 1.2cqw rgba(190,250,255,.25), inset 0 0 14cqw rgba(190,250,255,.25); font: 900 italic 26cqw/1 'Bebas Neue', Inter, sans-serif; color: #c9f8ff; text-shadow: 0 0 12px rgba(150,240,255,.9); }

.mv-back { position: fixed; inset: 0; z-index: 650; display: grid; place-items: center; overflow: hidden; cursor: pointer; background: radial-gradient(90% 70% at 50% 45%, #17203a, #090c18 70%, #04060c); animation: mvFade .5s ease-out both; }
.mv-rays { position: absolute; left: 50%; top: 46%; width: 190vmax; height: 190vmax; transform: translate(-50%, -50%); background: repeating-conic-gradient(from 0deg, rgba(255,226,122,.18) 0 5deg, transparent 5deg 15deg); -webkit-mask-image: radial-gradient(circle, #000 0, transparent 52%); mask-image: radial-gradient(circle, #000 0, transparent 52%); opacity: 0; animation: mvSpin 30s linear infinite, mvFade 1.4s 1.9s ease-out forwards; }
.mv-col { position: relative; display: grid; justify-items: center; gap: 12px; padding: 18px; width: min(100%, 420px); }
.mv-title { margin: 0; line-height: .85; text-align: center; font: 900 italic clamp(54px, 16vw, 92px) 'Bebas Neue', Inter, sans-serif; color: #ffe27a; letter-spacing: .04em; text-shadow: 0 0 36px rgba(245,184,0,.7), 0 5px 0 rgba(0,0,0,.45); opacity: 0; animation: mvSlam .7s 2s cubic-bezier(.2,1.4,.3,1) both; }
.mv-sub { margin: 0; font: 900 12px Inter, sans-serif; letter-spacing: .36em; color: #fff; text-align: center; opacity: 0; animation: mvFade .6s 2.5s both; }
.mv-stage { position: relative; width: min(56vw, 240px); perspective: 1000px; margin-top: 2px; opacity: 0; animation: mvFade .5s .1s both; }
.mv-flip { position: relative; transform-style: preserve-3d; animation: mvFlip 2.6s both; }
.mv-face { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.mv-face.bk { position: absolute; inset: 0; transform: rotateY(180deg); }
.mv-glint { position: absolute; left: 4%; bottom: 14%; width: 70%; aspect-ratio: 1; transform: translate(-50%, 50%); pointer-events: none; opacity: 0; animation: mvGlint 1s .85s ease-in-out both; }
.mv-glint::before, .mv-glint::after { content: ''; position: absolute; left: 50%; top: 50%; background: radial-gradient(closest-side, #fff, rgba(255,235,150,.9) 30%, transparent); transform: translate(-50%, -50%); border-radius: 50%; }
.mv-glint::before { width: 100%; height: 3%; }
.mv-glint::after { width: 3%; height: 60%; }
.mv-glint i { position: absolute; left: 50%; top: 50%; width: 14%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, #fff, rgba(255,230,140,.8) 40%, transparent 72%); }
.mv-ring { position: absolute; left: 50%; top: 50%; width: 100%; aspect-ratio: 1; border-radius: 50%; border: 3px solid rgba(255,226,122,.95); transform: translate(-50%, -50%) scale(.3); opacity: 0; animation: mvRing 1.1s 1.95s ease-out forwards; pointer-events: none; }
.mv-burst { position: absolute; left: 50%; top: 50%; width: 260%; aspect-ratio: 1; transform: translate(-50%, -50%) scale(.2); opacity: 0; border-radius: 50%; background: repeating-conic-gradient(from 0deg, rgba(255,240,170,.85) 0 3deg, transparent 3deg 12deg); -webkit-mask-image: radial-gradient(circle, #000 0, transparent 62%); mask-image: radial-gradient(circle, #000 0, transparent 62%); animation: mvBurst 1.2s 1.95s ease-out forwards; pointer-events: none; }
.mv-flash { position: absolute; inset: 0; background: #fff3c0; opacity: 0; animation: mvFlash .8s 1.95s ease-out forwards; pointer-events: none; }
.mv-spark { position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; border-radius: 50%; background: #ffe27a; box-shadow: 0 0 8px #F5B800; opacity: 0; animation: mvSpark 1.3s 1.95s ease-out forwards; }
.mv-conf { position: absolute; top: -14px; width: 8px; height: 14px; border-radius: 2px; opacity: 0; animation: mvFall linear infinite; }
.mv-who { text-align: center; opacity: 0; animation: mvFade .6s 2.8s both; }
.mv-who h2 { margin: 0; font: 900 28px/1 'Bebas Neue', Inter, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
.mv-who p { margin: 4px 0 0; font: 700 12px Inter, sans-serif; opacity: .75; }
.mv-btn { margin-top: 2px; padding: 11px 28px; border: 0; border-radius: 99px; font: 900 13px Inter, sans-serif; letter-spacing: .1em; background: #F5B800; color: #1a1200; cursor: pointer; opacity: 0; animation: mvFade .5s 3.2s both; }
.mv-skip, .mv-skip * { animation-duration: 0s !important; animation-delay: 0s !important; }
@keyframes mvFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes mvSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes mvSlam { 0% { opacity: 0; transform: scale(2.6); filter: blur(12px); } 100% { opacity: 1; transform: none; filter: none; } }
@keyframes mvFlip { 0% { transform: translateY(24px) scale(.82) rotateY(180deg); } 18% { transform: translateY(0) scale(1) rotateY(180deg); } 40% { transform: translateY(-4px) scale(1.02) rotateY(180deg); } 58% { transform: translateY(0) scale(1) rotateY(180deg); } 72% { transform: translateY(-14px) scale(1.14) rotateY(90deg); } 100% { transform: none; } }
@keyframes mvGlint { 0% { opacity: 0; transform: translate(-50%, 50%) scale(.2) rotate(0); } 45% { opacity: 1; transform: translate(-10%, 10%) scale(1) rotate(20deg); } 100% { opacity: 0; transform: translate(70%, -60%) scale(.6) rotate(45deg); } }
@keyframes mvRing { 0% { opacity: .95; transform: translate(-50%, -50%) scale(.4); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(2.8); } }
@keyframes mvBurst { 0% { opacity: .95; transform: translate(-50%, -50%) scale(.2) rotate(0); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1) rotate(25deg); } }
@keyframes mvFlash { 0% { opacity: .6; } 100% { opacity: 0; } }
@keyframes mvSpark { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.2); } }
@keyframes mvFall { 0% { transform: translateY(0) rotate(0); opacity: 0; } 8% { opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: .9; } }
@media (prefers-reduced-motion: reduce) { .mv-rays, .mv-title, .mv-sub, .mv-flip, .mv-glint, .mv-ring, .mv-burst, .mv-flash, .mv-spark, .mv-conf, .mv-who, .mv-btn, .mv-back { animation: none !important; opacity: 1; transform: none; } .mv-glint, .mv-ring, .mv-burst, .mv-flash, .mv-spark, .mv-conf, .mv-face.bk { display: none; } }
`;

type Info = { player: Player; team: Pick<Team, 'abbreviation' | 'primary_color'>; rating: number; goals: number; assists: number };

export function MvpCard({ player, team, rating, goals, assists }: Info) {
  return (
    <div className="mvc" style={{ ['--mv' as string]: team.primary_color }} aria-label={`MVP: ${player.name}, nota ${rating.toFixed(1)}`}>
      <style>{mvpCss}</style>
      <div className="mvc-frame" />
      <div className="mvc-body">
        <div className="mvc-av">{player.image_url ? <img src={player.image_url} alt="" /> : <b>{player.name.slice(0, 1).toUpperCase()}</b>}</div>
        <div className="mvc-l">
          <div className="mvc-ovr">{player.overall}</div>
          <div className="mvc-pos">{player.primary_position}</div>
          <div className="mvc-crest" style={{ background: team.primary_color }} />
          <div className="mvc-emb">★</div>
        </div>
        <div className="mvc-name">{player.name}</div>
        <div className="mvc-stats">
          <span>
            GOLS<b>{goals}</b>
          </span>
          <span>
            ASSIST.<b>{assists}</b>
          </span>
          <span>
            NOTA<b>{rating.toFixed(1)}</b>
          </span>
        </div>
        <div className="mvc-tag">
          MVP · {team.abbreviation}
        </div>
        <div className="mvc-shine" />
      </div>
    </div>
  );
}

export function CardBack() {
  return (
    <div className="mvb" aria-hidden="true">
      <div className="mvb-in">
        <div className="mvb-logo">7V7</div>
      </div>
    </div>
  );
}

// Tela cheia, no estilo de abertura de pacote: a carta aparece virada, um brilho de lente passa pela borda,
// ela vira com uma explosão de luz dourada e a nota sobe até o valor final. Tocar uma vez pula; tocar de novo fecha.
export function MvpReveal({ onClose, mine, ...info }: Info & { mine: boolean; onClose: () => void }) {
  const lite = useLite();
  const [shown, setShown] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [done, setDone] = useState(false);
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
    () => Array.from({ length: lite ? 10 : 26 }, (_, i) => ({ l: (i * 37) % 100, d: (i * 0.37) % 4, t: 3.6 + ((i * 7) % 4), c: ['#F5B800', '#ffe27a', '#fff', '#4ade80'][i % 4] })),
    [lite],
  );
  const skip = () => {
    setSkipped(true);
    setDone(true);
    setShown(info.rating);
  };
  const press = () => (done ? closeRef.current() : skip());
  useEffect(() => {
    playMvp();
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const from = 2300;
    const span = 900;
    const tick = (now: number) => {
      const u = Math.min(1, Math.max(0, (now - t0 - from) / span));
      setShown(info.rating * (1 - Math.pow(1 - u, 3)));
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    if (reduced) {
      setShown(info.rating);
      setDone(true);
    } else raf = requestAnimationFrame(tick);
    const doneTimer = window.setTimeout(() => setDone(true), 3300);
    const auto = window.setTimeout(() => closeRef.current(), 14000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      else if (e.key === 'Enter' || e.key === ' ') press();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(doneTimer);
      window.clearTimeout(auto);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`mv-back ${skipped ? 'mv-skip' : ''}`} role="dialog" aria-label="MVP da partida" onClick={press}>
      <style>{mvpCss}</style>
      <div className="mv-rays" />
      {conf.map((c, i) => (
        <i key={i} className="mv-conf" style={{ left: `${c.l}%`, background: c.c, animationDelay: `${2 + c.d}s`, animationDuration: `${c.t}s` }} />
      ))}
      <div className="mv-col">
        <h1 className="mv-title">MVP</h1>
        <p className="mv-sub">DA PARTIDA</p>
        <div className="mv-stage">
          <div className="mv-flip">
            <div className="mv-face">
              <MvpCard {...info} rating={shown} />
            </div>
            <div className="mv-face bk">
              <CardBack />
            </div>
          </div>
          <div className="mv-glint">
            <i />
          </div>
          <div className="mv-burst" />
          <div className="mv-ring" />
          {sparks.map((s, i) => (
            <i key={i} className="mv-spark" style={{ ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` }} />
          ))}
        </div>
        <div className="mv-who">
          <h2>{info.player.name}</h2>
          <p>
            {mine ? 'Craque do seu time' : 'MVP do adversário'} · {info.goals} {info.goals === 1 ? 'gol' : 'gols'} · {info.assists} assist.
          </p>
        </div>
        <button type="button" className="mv-btn" onClick={(e) => { e.stopPropagation(); closeRef.current(); }}>
          CONTINUAR
        </button>
      </div>
      <div className="mv-flash" />
    </div>
  );
}
