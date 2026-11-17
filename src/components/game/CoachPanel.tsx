import { useEffect, useState, type CSSProperties } from 'react';
import { SHOUT_COOLDOWN, SHOUT_INFO, SWITCH_COST, TACTICS, TACTIC_INFO, type Shout } from '@/lib/game/coach';
import type { Tactic } from '@/lib/multiplayer';

// Banco do técnico: troca o estilo no meio do jogo e dá ordens ao vivo (pressionar, recuar, pelas pontas), com tempo de espera entre elas
export function CoachPanel({ tactic, shoutsLeft, minute, activeUntil, activeShout, onTactic, onShout, delayNote, inline = false }: { inline?: boolean; delayNote?: number; tactic: Tactic; shoutsLeft: number; minute: number; activeUntil: number; activeShout: Shout | null; onTactic: (t: Tactic) => void; onShout: (s: Shout) => void }) {
  const [open, setOpen] = useState<'tactic' | null>(null);
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const active = !!activeShout && minute < activeUntil;
  const info = TACTIC_INFO[tactic];
  const pill = (on: boolean): CSSProperties => ({ border: 0, cursor: 'pointer', padding: inline ? '9px 14px' : '6px 11px', borderRadius: 999, font: inline ? '800 12px Inter, sans-serif' : '800 11px Inter, sans-serif', background: on ? '#F5B800' : 'rgba(8,12,20,.85)', color: on ? '#111' : '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.4)' });
  return (
    <div style={inline ? { position: 'relative', display: 'flex', flexDirection: 'column-reverse' } : { position: 'absolute', left: 8, bottom: 8, zIndex: 6 }}>
      {toast && <div role="status" style={{ marginBottom: 6, padding: '6px 11px', borderRadius: 10, background: 'rgba(8,12,20,.92)', border: '1px solid #F5B800', color: '#fff', font: '800 11px Inter, sans-serif', maxWidth: 260 }}>{toast}</div>}
      {open && (
        <div style={{ marginBottom: 6, width: inline ? '100%' : open === 'tactic' ? 400 : 260, maxWidth: 'calc(100vw - 24px)', padding: 6, borderRadius: 12, background: 'rgba(8,12,20,.96)', border: '1px solid rgba(255,255,255,.2)', display: 'grid', gridTemplateColumns: open === 'tactic' ? '1fr 1fr' : '1fr', gap: 4 }}>
          {open === 'tactic' && (
            <>
              <div style={{ gridColumn: '1 / -1', font: '700 10px Inter, sans-serif', opacity: 0.7, padding: '2px 6px' }}>Trocar o estilo custa {SWITCH_COST} pontos de fôlego do time.</div>
              {TACTICS.map((t) => (
                <button
                  key={t}
                  disabled={t === tactic}
                  onClick={() => {
                    onTactic(t);
                    setToast(`Novo estilo: ${TACTIC_INFO[t].label}${delayNote ? ` (entra em ${delayNote}')` : ''}`);
                    setOpen(null);
                  }}
                  style={{ textAlign: 'left', cursor: t === tactic ? 'default' : 'pointer', padding: '6px 8px', borderRadius: 8, border: t === tactic ? '1px solid #F5B800' : '1px solid transparent', background: 'rgba(255,255,255,.07)', color: '#fff', opacity: t === tactic ? 0.6 : 1 }}
                >
                  <b style={{ font: '900 12px Inter, sans-serif' }}>{TACTIC_INFO[t].icon} {TACTIC_INFO[t].label}</b>
                  <small style={{ display: 'block', font: '600 10px/1.25 Inter, sans-serif', opacity: 0.8 }}>{TACTIC_INFO[t].text}</small>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button style={pill(open === 'tactic')} onClick={() => setOpen(open === 'tactic' ? null : 'tactic')} aria-label="Trocar estilo de jogo">
          {info.icon} {info.label}
        </button>
        {(Object.keys(SHOUT_INFO) as Shout[]).map((k) => {
          const on = active && activeShout === k;
          const wait = !active && !!activeShout ? Math.max(0, activeUntil + SHOUT_COOLDOWN - minute) : 0;
          const blocked = shoutsLeft <= 0 || active || wait > 0;
          return (
            <button
              key={k}
              disabled={blocked}
              title={SHOUT_INFO[k].text}
              aria-label={`${SHOUT_INFO[k].label}: ${SHOUT_INFO[k].text}`}
              onClick={() => {
                onShout(k);
                setToast(`${SHOUT_INFO[k].toast}${delayNote ? ` (vale em ${delayNote}')` : ''}`);
                setOpen(null);
              }}
              style={{ ...pill(on), opacity: blocked && !on ? 0.45 : 1, cursor: blocked ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, position: 'relative', overflow: 'hidden' }}
            >
              {SHOUT_INFO[k].icon}
              {SHOUT_INFO[k].label}
              {on && <small style={{ font: '800 9px Inter, sans-serif' }}>até {activeUntil}&apos;</small>}
              {!on && wait > 0 && <small style={{ font: '800 9px Inter, sans-serif' }}>{Math.ceil(wait)}&apos;</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
