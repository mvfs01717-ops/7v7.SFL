import { useEffect, useState, type CSSProperties } from 'react';
import { SWITCH_COST, TACTIC_INFO, type Shout } from '@/lib/game/coach';
import type { Tactic } from '@/lib/multiplayer';

// Banco do técnico: troca o estilo no meio do jogo e dá ordens ao vivo (pressionar, recuar, pelas pontas), com tempo de espera entre elas
export function CoachPanel({ tactic, shoutsLeft, minute, activeUntil, activeShout, onTactic, onShout, delayNote, inline = false }: { inline?: boolean; delayNote?: number; tactic: Tactic; shoutsLeft: number; minute: number; activeUntil: number; activeShout: Shout | null; onTactic: (t: Tactic) => void; onShout: (s: Shout) => void }) {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);
  void [shoutsLeft, minute, activeUntil, activeShout, onShout]; // ordens ao vivo ficaram fora da tela; a lógica continua em coach.ts
  const info = TACTIC_INFO[tactic];
  const pill = (on: boolean): CSSProperties => ({ border: 0, cursor: 'pointer', padding: inline ? '9px 14px' : '6px 11px', borderRadius: 999, font: inline ? '800 12px Inter, sans-serif' : '800 11px Inter, sans-serif', background: on ? '#F5B800' : 'rgba(8,12,20,.85)', color: on ? '#111' : '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.4)' });
  const three: Tactic[] = ['defensiva', 'equilibrada', 'ofensiva'];
  const short: Record<string, string> = { defensiva: 'Defensivo', equilibrada: 'Equilibrado', ofensiva: 'Ofensivo' };
  const cur = three.includes(tactic) ? tactic : null; // estilos especiais (contra-ataque, posse, pressão) vêm da escalação: nenhum dos três fica marcado
  return (
    <div style={inline ? { position: 'relative', display: 'flex', flexDirection: 'column-reverse', gap: 6 } : { position: 'absolute', left: 8, bottom: 8, zIndex: 6 }}>
      {toast && <div role="status" style={{ marginBottom: 6, padding: '6px 11px', borderRadius: 10, background: 'rgba(8,12,20,.92)', border: '1px solid #F5B800', color: '#fff', font: '800 11px Inter, sans-serif', maxWidth: 260 }}>{toast}</div>}
      <div style={{ font: '600 11px/1.3 Inter, sans-serif', color: 'rgba(255,255,255,.75)', padding: '0 4px', maxWidth: inline ? undefined : 300 }}>
        <b style={{ color: '#fff' }}>{info.icon} {info.label}:</b> {info.text}
      </div>
      <div role="group" aria-label="Estilo de jogo" style={{ display: 'flex', gap: 4 }}>
        {three.map((t) => {
          const on = cur === t;
          return (
            <button
              key={t}
              disabled={on}
              aria-pressed={on}
              onClick={() => {
                onTactic(t);
                setToast(`Novo estilo: ${TACTIC_INFO[t].label}${delayNote ? ` (entra em ${delayNote}')` : ''}. Trocar custa ${SWITCH_COST} pontos de fôlego.`);
              }}
              style={{ ...pill(on), flex: inline ? 1 : undefined, cursor: on ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, font: inline ? '900 14px Inter, sans-serif' : '900 12px Inter, sans-serif', padding: inline ? '12px 8px' : '7px 12px' }}
            >
              <span aria-hidden>{TACTIC_INFO[t].icon}</span>
              {short[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
