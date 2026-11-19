import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VarVerdict } from '@/lib/var';

const STEPS: Record<VarVerdict['kind'], string> = {
  impedimento: 'Conferindo a posição dos jogadores',
  falta: 'Conferindo o contato na disputa de bola',
  mao: 'Conferindo possível toque de mão',
};
export const DECISION_MS = 2400;

export const varCheckCss = `
.var-ov { position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center; padding: 16px; background: rgba(2,6,14,.82); backdrop-filter: blur(6px); animation: var-in .25s ease-out both; }
.var-card { width: min(520px, 100%); text-align: center; color: #fff; }
.var-badge { display: inline-block; padding: 4px 14px; border-radius: 6px; font: 900 18px/1 'Bebas Neue', Inter, sans-serif; letter-spacing: 6px; color: #0b1220; background: #fff; box-shadow: 0 0 22px rgba(255,255,255,.4); }
.var-title { margin: 14px 0 4px; font: 400 clamp(38px, 11vw, 62px)/.95 'Bebas Neue', Inter, sans-serif; letter-spacing: 4px; text-shadow: 0 0 28px rgba(80,170,255,.7); }
.var-dots i { display: inline-block; width: 7px; height: 7px; margin: 0 3px; border-radius: 50%; background: #5ab4ff; animation: var-dot 1.1s infinite; }
.var-dots i:nth-child(2) { animation-delay: .18s; } .var-dots i:nth-child(3) { animation-delay: .36s; }
.var-sub { margin: 6px 0 0; font-size: 14px; opacity: .85; }
.var-sub b { color: #F5B800; }
.var-step { margin: 2px 0 14px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #8fd0ff; }
.var-screen { position: relative; margin: 0 auto; width: 100%; aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; border: 1px solid rgba(90,180,255,.5); background: #0b2a1c; box-shadow: 0 0 30px rgba(90,180,255,.25), inset 0 0 40px rgba(0,0,0,.5); }
.var-screen svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.var-scan { position: absolute; top: 0; bottom: 0; width: 14%; left: -14%; background: linear-gradient(90deg, transparent, rgba(90,180,255,.45), transparent); animation: var-scan 1.8s ease-in-out infinite; }
.var-ofl { animation: var-ofl 2.2s ease-in-out infinite alternate; }
.var-p { animation: var-blink 1s ease-in-out infinite alternate; }
.var-bar { height: 5px; margin: 14px auto 0; width: 100%; border-radius: 99px; background: rgba(255,255,255,.12); overflow: hidden; }
.var-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #2d8cff, #8fd0ff); animation: var-fill linear forwards; }
.var-result { animation: var-stamp .5s cubic-bezier(.2,1.5,.3,1) both; }
.var-result h2 { margin: 0; font: 400 clamp(44px, 13vw, 76px)/.95 'Bebas Neue', Inter, sans-serif; letter-spacing: 4px; }
.var-result.ok h2 { color: #4ade80; text-shadow: 0 0 34px rgba(74,222,128,.7); }
.var-result.no h2 { color: #f87171; text-shadow: 0 0 34px rgba(248,113,113,.7); }
.var-ico { width: 84px; height: 84px; margin: 16px auto 6px; display: block; }
.var-reason { margin: 10px auto 0; max-width: 440px; font-size: 15px; line-height: 1.35; opacity: .95; }
.var-score { margin: 8px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; opacity: .7; }
@keyframes var-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes var-dot { 0%, 100% { opacity: .25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-4px); } }
@keyframes var-scan { from { left: -14%; } to { left: 100%; } }
@keyframes var-ofl { from { transform: translateX(-26px); } to { transform: translateX(26px); } }
@keyframes var-blink { from { opacity: .55; } to { opacity: 1; } }
@keyframes var-fill { to { width: 100%; } }
@keyframes var-stamp { from { transform: scale(2.2); opacity: 0; filter: blur(8px); } to { transform: none; opacity: 1; filter: none; } }
@media (prefers-reduced-motion: reduce) { .var-ov *, .var-ov { animation-duration: .01s !important; animation-iteration-count: 1 !important; } .var-bar i { width: 100%; } }
`;

// Tela do VAR: "CHECKING GOAL" com animação de análise e, ao fim da contagem, a decisão (já definida pela simulação).
export function VarCheck({ verdict, scorer, minute, club, seconds, onDecision, onDone }: {
  verdict: VarVerdict;
  scorer: string;
  minute: number;
  club?: string;
  seconds: number;
  onDecision: () => void;
  onDone: () => void;
}) {
  const [decided, setDecided] = useState(false);
  const decisionRef = useRef(onDecision);
  const doneRef = useRef(onDone);
  decisionRef.current = onDecision;
  doneRef.current = onDone;
  useEffect(() => {
    const first = window.setTimeout(() => {
      setDecided(true);
      decisionRef.current();
    }, seconds * 1000);
    const second = window.setTimeout(() => doneRef.current(), seconds * 1000 + DECISION_MS);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [seconds]);
  const ok = verdict.outcome === 'confirmado';
  return createPortal(
    <div className="var-ov" role="alertdialog" aria-live="assertive" aria-label={decided ? (ok ? 'Gol confirmado' : 'Gol anulado') : 'Checking goal'}>
      <style>{varCheckCss}</style>
      <div className="var-card">
        <span className="var-badge">VAR</span>
        {!decided ? (
          <>
            <h2 className="var-title">CHECKING GOAL</h2>
            <div className="var-dots" aria-hidden="true"><i /><i /><i /></div>
            <p className="var-sub">Lance de <b>{scorer}</b>{club ? ` · ${club}` : ''} · {minute}'</p>
            <p className="var-step">{STEPS[verdict.kind]}</p>
            <div className="var-screen" aria-hidden="true">
              <svg viewBox="0 0 160 90" preserveAspectRatio="none">
                <rect width="160" height="90" fill="#0f3a26" />
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={i * 20} width="10" height="90" fill="rgba(255,255,255,.03)" />)}
                <g fill="none" stroke="rgba(255,255,255,.5)" strokeWidth=".7">
                  <rect x="4" y="4" width="152" height="82" />
                  <line x1="80" y1="4" x2="80" y2="86" />
                  <circle cx="80" cy="45" r="11" />
                  <rect x="4" y="25" width="22" height="40" /><rect x="134" y="25" width="22" height="40" />
                </g>
                <g className="var-ofl"><line x1="116" y1="4" x2="116" y2="86" stroke="#ffd24a" strokeWidth="1" strokeDasharray="3 2" /></g>
                {[[100, 30], [108, 52], [121, 40], [112, 66]].map(([x, y], i) => <circle key={`d${i}`} className="var-p" cx={x} cy={y} r="3" fill="#ff6b6b" style={{ animationDelay: `${i * 0.15}s` }} />)}
                {[[118, 46], [96, 22], [90, 58]].map(([x, y], i) => <circle key={`a${i}`} className="var-p" cx={x} cy={y} r="3" fill="#5ab4ff" style={{ animationDelay: `${i * 0.2}s` }} />)}
              </svg>
              <div className="var-scan" />
            </div>
            <div className="var-bar"><i style={{ animationDuration: `${seconds}s` }} /></div>
          </>
        ) : (
          <div className={`var-result ${ok ? 'ok' : 'no'}`}>
            <svg className="var-ico" viewBox="0 0 24 24" fill="none" stroke={ok ? '#4ade80' : '#f87171'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              {ok ? <path d="M7 12.5l3.2 3.2L17 9" /> : <path d="M8 8l8 8M16 8l-8 8" />}
            </svg>
            <h2>{ok ? 'GOL CONFIRMADO' : 'GOL ANULADO'}</h2>
            <p className="var-reason">{verdict.reason}</p>
            <p className="var-score">{scorer} · {minute}'</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
