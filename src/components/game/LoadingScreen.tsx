import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/game/Card';
import { stadiumCss } from '@/lib/game/stadiumCss';

const TIPS = [
  'O capitão dá +2 de overall e um bônus para o time inteiro.',
  'Jogador fora de posição perde 5 de overall.',
  'Troque os cansados no intervalo: fôlego baixo rende menos.',
  'Monte o banco: são até 2 trocas no intervalo.',
  'A tática do rival só aparece na apresentação.',
];

const css = `
.ld { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 24px; color: #fff; overflow: hidden; }
.ld-wrap { display: grid; justify-items: center; gap: 22px; width: min(340px, 100%); text-align: center; }
.ld-logo { position: relative; padding: 14px; animation: ldIn .8s cubic-bezier(.2,1.2,.3,1) both; }
.ld-logo::before { content: ''; position: absolute; inset: -30%; border-radius: 50%; background: radial-gradient(circle, rgba(245,184,0,.5), transparent 65%); animation: ldPulse 2.2s ease-in-out infinite; }
.ld-logo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,.55) 50%, transparent 62%); transform: translateX(-130%); animation: ldShine 2.6s .6s infinite; mix-blend-mode: overlay; pointer-events: none; }
.ld-logo > * { position: relative; z-index: 1; filter: drop-shadow(0 12px 18px rgba(0,0,0,.6)); }
@keyframes ldIn { from { opacity: 0; transform: scale(1.6); filter: blur(10px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes ldPulse { 50% { transform: scale(1.18); opacity: .6; } }
@keyframes ldShine { to { transform: translateX(130%); } }
.ld-title { font-size: 12px; font-weight: 900; letter-spacing: 5px; color: #F5B800; }
.ld-bar { position: relative; width: 100%; height: 6px; border-radius: 6px; overflow: hidden; background: rgba(255,255,255,.12); }
.ld-bar i { position: absolute; top: 0; bottom: 0; width: 40%; border-radius: 6px; background: linear-gradient(90deg, transparent, #F5B800, #fff2a8); box-shadow: 0 0 14px rgba(245,184,0,.8); animation: ldRun 1.3s cubic-bezier(.5,0,.5,1) infinite; }
@keyframes ldRun { from { left: -40%; } to { left: 100%; } }
.ld-tip { min-height: 38px; font-size: 13px; line-height: 1.45; color: #b9c2cc; animation: ldTip .5s ease both; }
.ld-tip b { display: block; margin-bottom: 2px; font-size: 10px; letter-spacing: 3px; color: #F5B800; }
@keyframes ldTip { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.ld-err { font-size: 15px; line-height: 1.4; max-width: 300px; }
@media (prefers-reduced-motion: reduce) { .ld *, .ld *::before, .ld *::after { animation: none !important; } }
`;

export function LoadingScreen({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (error) return;
    const id = window.setInterval(() => setTip((value) => (value + 1) % TIPS.length), 3200);
    return () => window.clearInterval(id);
  }, [error]);
  return (
    <div className="ld stadium-bg" role="status" aria-live="polite">
      <style>{stadiumCss}</style>
      <style>{css}</style>
      <div className="ld-wrap">
        <div className="ld-logo">
          <LogoMark size={96} variant="full" />
        </div>
        {error ? (
          <>
            <p className="ld-err">{error}</p>
            <button className="gold-button cta-slant" style={{ padding: '14px 30px' }} onClick={onRetry}>
              Tentar novamente
            </button>
          </>
        ) : (
          <>
            <div className="ld-title">CARREGANDO A FEDERAÇÃO</div>
            <div className="ld-bar" aria-hidden="true">
              <i />
            </div>
            <div className="ld-tip" key={tip}>
              <b>DICA</b>
              {TIPS[tip]}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
