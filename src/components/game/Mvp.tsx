import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player, Team } from '@/lib/game/types';
import { useLite } from '@/lib/settings';
import { playMvp } from '@/lib/sfx';

// Carta de MVP (visual próprio: moldura holográfica dourada) e a animação que revela o melhor em campo.

const shield = 'polygon(0 5%, 5% 0, 36% 0, 40% 2.2%, 60% 2.2%, 64% 0, 95% 0, 100% 5%, 100% 81%, 91% 90%, 58% 97%, 50% 100%, 42% 97%, 9% 90%, 0 81%)';

const MVP_ART_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 139" preserveAspectRatio="none"><defs><linearGradient id="a" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f3d58a" stop-opacity="0"/><stop offset=".5" stop-color="#f3d58a" stop-opacity=".9"/><stop offset="1" stop-color="#f3d58a" stop-opacity="0"/></linearGradient><radialGradient id="b" cx=".62" cy=".3" r=".5"><stop offset="0" stop-color="#e9c46a" stop-opacity=".42"/><stop offset="1" stop-color="#e9c46a" stop-opacity="0"/></radialGradient><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c0" stop-opacity=".16"/><stop offset="1" stop-color="#fff2c0" stop-opacity="0"/></linearGradient></defs><rect width="100" height="139" fill="url(#b)"/><path d="M-5 118 C 25 96, 60 70, 105 20 L105 44 C 64 86, 28 112, -5 134 Z" fill="url(#c)"/><path d="M-5 60 C 22 44, 50 30, 105 -6 L105 8 C 56 40, 26 56, -5 72 Z" fill="url(#c)" opacity=".7"/><line x1="-10" y1="139" x2="68" y2="-8" stroke="url(#a)" stroke-width="0.22" stroke-opacity="0.8"/><line x1="4" y1="139" x2="82" y2="-8" stroke="url(#a)" stroke-width="0.5" stroke-opacity="0.9"/><line x1="14" y1="139" x2="92" y2="-8" stroke="url(#a)" stroke-width="0.2" stroke-opacity="0.6"/><line x1="48" y1="139" x2="126" y2="-8" stroke="url(#a)" stroke-width="0.2" stroke-opacity="0.55"/><line x1="70" y1="139" x2="148" y2="-8" stroke="url(#a)" stroke-width="0.35" stroke-opacity="0.8"/><line x1="82" y1="139" x2="160" y2="-8" stroke="url(#a)" stroke-width="0.2" stroke-opacity="0.6"/><line x1="96" y1="139" x2="174" y2="-8" stroke="url(#a)" stroke-width="0.45" stroke-opacity="0.9"/><line x1="108" y1="139" x2="186" y2="-8" stroke="url(#a)" stroke-width="0.2" stroke-opacity="0.5"/><g stroke="#e9c46a" stroke-opacity=".08" stroke-width=".22"><line x1="-40.0" y1="139" x2="38.0" y2="-8"/><line x1="-36.8" y1="139" x2="41.2" y2="-8"/><line x1="-33.6" y1="139" x2="44.4" y2="-8"/><line x1="-30.4" y1="139" x2="47.6" y2="-8"/><line x1="-27.2" y1="139" x2="50.8" y2="-8"/><line x1="-24.0" y1="139" x2="54.0" y2="-8"/><line x1="-20.8" y1="139" x2="57.2" y2="-8"/><line x1="-17.6" y1="139" x2="60.4" y2="-8"/><line x1="-14.4" y1="139" x2="63.6" y2="-8"/><line x1="-11.2" y1="139" x2="66.8" y2="-8"/><line x1="-8.0" y1="139" x2="70.0" y2="-8"/><line x1="-4.8" y1="139" x2="73.2" y2="-8"/><line x1="-1.6" y1="139" x2="76.4" y2="-8"/><line x1="1.6" y1="139" x2="79.6" y2="-8"/><line x1="4.8" y1="139" x2="82.8" y2="-8"/><line x1="8.0" y1="139" x2="86.0" y2="-8"/><line x1="11.2" y1="139" x2="89.2" y2="-8"/><line x1="14.4" y1="139" x2="92.4" y2="-8"/><line x1="17.6" y1="139" x2="95.6" y2="-8"/><line x1="20.8" y1="139" x2="98.8" y2="-8"/><line x1="24.0" y1="139" x2="102.0" y2="-8"/><line x1="27.2" y1="139" x2="105.2" y2="-8"/><line x1="30.4" y1="139" x2="108.4" y2="-8"/><line x1="33.6" y1="139" x2="111.6" y2="-8"/><line x1="36.8" y1="139" x2="114.8" y2="-8"/><line x1="40.0" y1="139" x2="118.0" y2="-8"/><line x1="43.2" y1="139" x2="121.2" y2="-8"/><line x1="46.4" y1="139" x2="124.4" y2="-8"/><line x1="49.6" y1="139" x2="127.6" y2="-8"/><line x1="52.8" y1="139" x2="130.8" y2="-8"/><line x1="56.0" y1="139" x2="134.0" y2="-8"/><line x1="59.2" y1="139" x2="137.2" y2="-8"/><line x1="62.4" y1="139" x2="140.4" y2="-8"/><line x1="65.6" y1="139" x2="143.6" y2="-8"/><line x1="68.8" y1="139" x2="146.8" y2="-8"/><line x1="72.0" y1="139" x2="150.0" y2="-8"/><line x1="75.2" y1="139" x2="153.2" y2="-8"/><line x1="78.4" y1="139" x2="156.4" y2="-8"/><line x1="81.6" y1="139" x2="159.6" y2="-8"/><line x1="84.8" y1="139" x2="162.8" y2="-8"/><line x1="88.0" y1="139" x2="166.0" y2="-8"/><line x1="91.2" y1="139" x2="169.2" y2="-8"/><line x1="94.4" y1="139" x2="172.4" y2="-8"/><line x1="97.6" y1="139" x2="175.6" y2="-8"/><line x1="100.8" y1="139" x2="178.8" y2="-8"/><line x1="104.0" y1="139" x2="182.0" y2="-8"/></g><circle cx="26.4" cy="67.1" r="0.32" fill="#fff3c4" opacity="0.76"/><circle cx="47.7" cy="71.4" r="0.4" fill="#fff3c4" opacity="0.36"/><circle cx="80.4" cy="34.1" r="0.25" fill="#fff3c4" opacity="0.44"/><circle cx="69.5" cy="66.8" r="0.4" fill="#fff3c4" opacity="0.56"/><circle cx="62.5" cy="21.5" r="0.4" fill="#fff3c4" opacity="0.42"/><circle cx="88.3" cy="49.2" r="0.25" fill="#fff3c4" opacity="0.65"/><circle cx="10.8" cy="92.0" r="0.4" fill="#fff3c4" opacity="0.37"/><circle cx="75.2" cy="99.5" r="0.32" fill="#fff3c4" opacity="0.56"/><circle cx="69.7" cy="105.9" r="0.4" fill="#fff3c4" opacity="0.70"/><circle cx="43.4" cy="88.5" r="0.4" fill="#fff3c4" opacity="0.55"/><circle cx="89.2" cy="105.9" r="0.25" fill="#fff3c4" opacity="0.37"/><circle cx="49.5" cy="33.9" r="0.4" fill="#fff3c4" opacity="0.55"/><circle cx="61.4" cy="38.9" r="0.4" fill="#fff3c4" opacity="0.73"/><circle cx="56.7" cy="66.0" r="0.32" fill="#fff3c4" opacity="0.61"/></svg>';
const MVP_ART = `url("data:image/svg+xml,${encodeURIComponent(MVP_ART_SVG)}") 0 0 / 100% 100% no-repeat`;

export const mvpCss = `
.mvc { container-type: inline-size; position: relative; width: 100%; aspect-ratio: .72; color: #f3dca0; filter: drop-shadow(0 16px 22px rgba(0,0,0,.65)); user-select: none; }
.mvc-frame { position: absolute; inset: 0; clip-path: ${shield}; background: linear-gradient(120deg, #6a4c14, #e9cf86 20%, #fff3c4 32%, #a9812f 48%, #e9cf86 64%, #6a4c14 82%, #e9cf86); background-size: 300% 300%; animation: mvcHolo 6s linear infinite; }
.mvc-body { position: absolute; inset: 1.5cqw; clip-path: ${shield}; background: #0b0a08; }
.mvc-ring { position: absolute; inset: 3.4cqw; clip-path: ${shield}; background: linear-gradient(160deg, #f3dd9a, #8a6820 55%, #d9b45a); }
.mvc-core { position: absolute; inset: 3.9cqw; clip-path: ${shield}; overflow: hidden; background: ${MVP_ART}, radial-gradient(90% 60% at 62% 28%, color-mix(in srgb, var(--mv, #8a6a20) 22%, #1a1408), transparent 75%), linear-gradient(170deg, #1c1810, #0c0b09 50%, #050505); }
.mvc-top { position: absolute; left: 0; right: 0; top: 4cqw; text-align: center; font: 900 3.4cqw Inter, sans-serif; letter-spacing: .34em; padding-left: .34em; color: #e9cf86; }
.mvc-rate { position: absolute; left: 7cqw; top: 11cqw; font: 900 21cqw/.85 'Bebas Neue', Inter, sans-serif; letter-spacing: -.01em; background: linear-gradient(180deg, #fff6cc 0%, #ecc968 52%, #a07a22 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 2px 2px rgba(0,0,0,.7)); }
.mvc-meta { position: absolute; left: 7cqw; top: 34cqw; width: 22cqw; display: flex; flex-direction: column; align-items: center; gap: 1.6cqw; font: 900 6.4cqw/1 'Bebas Neue', Inter, sans-serif; letter-spacing: .06em; color: #f6e2a4; }
.mvc-meta::before, .mvc-meta::after { content: ''; width: 14cqw; height: .5cqw; background: linear-gradient(90deg, transparent, rgba(233,207,134,.8), transparent); }
.mvc-meta span { display: flex; align-items: center; gap: 1.6cqw; font-size: 5.4cqw; }
.mvc-meta i { width: 4cqw; height: 4cqw; border-radius: 50%; box-shadow: 0 0 0 .5cqw rgba(246,226,164,.85); }
.mvc-hero { position: absolute; left: 42cqw; top: 14cqw; width: 44cqw; aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; background: radial-gradient(circle at 50% 38%, rgba(255,236,170,.30), rgba(255,236,170,0) 68%); }
.mvc-hero::before { content: ''; position: absolute; inset: 3cqw; border-radius: 50%; border: .6cqw solid rgba(233,207,134,.55); box-shadow: inset 0 0 6cqw rgba(233,196,106,.25), 0 0 8cqw rgba(233,196,106,.28); }
.mvc-hero b { font: 900 italic 27cqw/1 'Bebas Neue', Inter, sans-serif; background: linear-gradient(180deg, #fff6cc, #d9b45a 60%, #8a6a20); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 4px rgba(0,0,0,.7)); }
.mvc-star { position: absolute; left: 50%; top: -3.4cqw; transform: translateX(-50%); font-size: 8cqw; line-height: 1; color: #ffe27a; text-shadow: 0 0 10px rgba(255,200,80,.9); }
.mvc-name { position: absolute; left: 6cqw; right: 6cqw; top: 79cqw; text-align: center; font: 900 12.5cqw/1 'Bebas Neue', Inter, sans-serif; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: linear-gradient(180deg, #fff6cc, #e9cf86 60%, #b58d33); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 2px 0 rgba(0,0,0,.65)); }
.mvc-stats { position: absolute; left: 12cqw; right: 12cqw; top: 95cqw; display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; font: 800 3.3cqw Inter, sans-serif; letter-spacing: .14em; color: rgba(233,207,134,.85); border-top: .5cqw solid; border-image: linear-gradient(90deg, transparent, rgba(233,207,134,.8), transparent) 1; padding-top: 2cqw; }
.mvc-stats span + span { border-left: .4cqw solid rgba(233,207,134,.28); }
.mvc-stats b { display: block; margin-top: .6cqw; font: 900 10cqw/1 'Bebas Neue', Inter, sans-serif; color: #fff2c4; letter-spacing: 0; }
.mvc-shine { position: absolute; inset: -20% -60%; background: linear-gradient(105deg, transparent 43%, rgba(255,240,190,.3) 50%, transparent 57%); transform: translateX(-60%); animation: mvcShine 4s ease-in-out infinite; mix-blend-mode: soft-light; pointer-events: none; }
@keyframes mvcShine { 0%, 55% { transform: translateX(-60%); } 100% { transform: translateX(60%); } }
@media (prefers-reduced-motion: reduce) { .mvc-frame, .mvc-shine { animation: none; } }

.mvb { container-type: inline-size; position: absolute; inset: 0; clip-path: ${shield}; background: linear-gradient(120deg, #7a5a1c, #e9cf86 30%, #a9812f 60%, #e9cf86); }
.mvb-in { position: absolute; inset: 1.2cqw; clip-path: ${shield}; display: grid; place-items: center; background: radial-gradient(120% 90% at 50% 28%, #53c6df, #2a93b3 60%, #1e7090); }
.mvb-in::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,.18) 50%, transparent 62%); }
.mvb-logo { display: grid; place-items: center; width: 54cqw; aspect-ratio: 1; border-radius: 50%; border: 2.4cqw solid rgba(190,250,255,.75); box-shadow: 0 0 0 1.2cqw rgba(190,250,255,.25), inset 0 0 14cqw rgba(190,250,255,.25); font: 900 italic 26cqw/1 'Bebas Neue', Inter, sans-serif; color: #c9f8ff; text-shadow: 0 0 12px rgba(150,240,255,.9); }

.mv-back { position: fixed; inset: 0; z-index: 650; display: grid; place-items: center; overflow: hidden; cursor: pointer; background: radial-gradient(90% 70% at 50% 45%, #17203a, #090c18 70%, #04060c); animation: mvFade .5s ease-out both; }
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
.mv-burst { position: absolute; left: 50%; top: 50%; width: 260%; aspect-ratio: 1; transform: translate(-50%, -50%) scale(.2); opacity: 0; border-radius: 50%; background: radial-gradient(circle, rgba(255,246,196,.95), rgba(255,214,110,.35) 34%, transparent 62%); animation: mvBurst 1.2s 1.95s ease-out forwards; pointer-events: none; }
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
@media (prefers-reduced-motion: reduce) { .mv-title, .mv-sub, .mv-flip, .mv-glint, .mv-ring, .mv-burst, .mv-flash, .mv-spark, .mv-conf, .mv-who, .mv-btn, .mv-back { animation: none !important; opacity: 1; transform: none; } .mv-glint, .mv-ring, .mv-burst, .mv-flash, .mv-spark, .mv-conf, .mv-face.bk { display: none; } }
`;

type Info = { player: Player; team: Pick<Team, 'abbreviation' | 'primary_color'>; rating: number; goals: number; assists: number };

export function MvpCard({ player, team, rating, goals, assists }: Info) {
  return (
    <div className="mvc" style={{ ['--mv' as string]: team.primary_color }} aria-label={`MVP: ${player.name}, nota ${rating.toFixed(1)}`}>
      <style>{mvpCss}</style>
      <div className="mvc-frame" />
      <div className="mvc-body" />
      <div className="mvc-ring" />
      <div className="mvc-core">
        <div className="mvc-top">MVP DA PARTIDA</div>
        <div className="mvc-rate">{rating.toFixed(1)}</div>
        <div className="mvc-meta">
          {player.primary_position}
          <span>
            <i style={{ background: team.primary_color }} />
            {team.abbreviation}
          </span>
        </div>
        <div className="mvc-hero">
          <b>{player.name.trim().charAt(0).toUpperCase()}</b>
          <div className="mvc-star">★</div>
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
            OVERALL<b>{player.overall}</b>
          </span>
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
