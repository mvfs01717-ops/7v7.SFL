import { useEffect, useState, type CSSProperties } from 'react';
import { SHOUT_INFO, SHOUT_MINUTES, SHOUTS_PER_MATCH, SWITCH_COST, TACTICS, TACTIC_INFO, type Shout } from '@/lib/game/coach';
import type { Tactic } from '@/lib/multiplayer';

// Banco de reservas do técnico: troca o estilo no meio do jogo e dá gritos à beira do campo (só contra o bot)
export function CoachPanel({ tactic, shoutsLeft, minute, activeUntil, activeShout, onTactic, onShout, delayNote }: { delayNote?: number; tactic: Tactic; shoutsLeft: number; minute: number; activeUntil: number; activeShout: Shout | null; onTactic: (t: Tactic) => void; onShout: (s: Shout) => void }) {
  const [open, setOpen] = useState<'tactic' | 'shout' | null>(null);
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const active = !!activeShout && minute < activeUntil;
  const info = TACTIC_INFO[tactic];
  const pill = (on: boolean): CSSProperties => ({ border: 0, cursor: 'pointer', padding: '6px 11px', borderRadius: 999, font: '800 11px Inter, sans-serif', background: on ? '#F5B800' : 'rgba(8,12,20,.85)', color: on ? '#111' : '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.4)' });
  return (
    <div style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 6 }}>
      {toast && <div role="status" style={{ marginBottom: 6, padding: '6px 11px', borderRadius: 10, background: 'rgba(8,12,20,.92)', border: '1px solid #F5B800', color: '#fff', font: '800 11px Inter, sans-serif', maxWidth: 260 }}>{toast}</div>}
      {open && (
        <div style={{ marginBottom: 6, width: open === 'tactic' ? 400 : 260, maxWidth: 'calc(100vw - 24px)', padding: 6, borderRadius: 12, background: 'rgba(8,12,20,.96)', border: '1px solid rgba(255,255,255,.2)', display: 'grid', gridTemplateColumns: open === 'tactic' ? '1fr 1fr' : '1fr', gap: 4 }}>
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
          {open === 'shout' &&
            (Object.keys(SHOUT_INFO) as Shout[]).map((s) => (
              <button
                key={s}
                disabled={shoutsLeft <= 0 || active}
                onClick={() => {
                  onShout(s);
                  setToast(`${SHOUT_INFO[s].toast}${delayNote ? ` (vale em ${delayNote}')` : ''}`);
                  setOpen(null);
                }}
                style={{ textAlign: 'left', cursor: shoutsLeft <= 0 || active ? 'not-allowed' : 'pointer', padding: '6px 8px', borderRadius: 8, border: '1px solid transparent', background: 'rgba(255,255,255,.07)', color: '#fff', opacity: shoutsLeft <= 0 || active ? 0.45 : 1 }}
              >
                <b style={{ font: '900 12px Inter, sans-serif' }}>{SHOUT_INFO[s].icon} {SHOUT_INFO[s].label}</b>
                <small style={{ display: 'block', font: '600 10px/1.25 Inter, sans-serif', opacity: 0.8 }}>{SHOUT_INFO[s].text}</small>
              </button>
            ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={pill(open === 'tactic')} onClick={() => setOpen(open === 'tactic' ? null : 'tactic')} aria-label="Trocar estilo de jogo">
          {info.icon} {info.label}
        </button>
        <button style={pill(open === 'shout' || active)} onClick={() => setOpen(open === 'shout' ? null : 'shout')} aria-label="Gritos do técnico">
          {active && activeShout ? `${SHOUT_INFO[activeShout].icon} até ${activeUntil}'` : `📣 Grito ×${shoutsLeft}/${SHOUTS_PER_MATCH}`}
        </button>
      </div>
      {open === 'shout' && active && <span style={{ display: 'none' }}>{SHOUT_MINUTES}</span>}
    </div>
  );
}
