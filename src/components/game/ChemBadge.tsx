// Indicador de entrosamento individual (0 a 3): pequeno, fundo escuro, detalhes em azul. Um por jogador, sem linhas entre jogadores.
import { useEffect, useState } from 'react';
import { ROLES_EVENT } from '@/lib/playerRoles';
import { chemTitle, type Chem } from '@/lib/game/chemistry';

export function ChemBadge({ chem, inside = false }: { chem: Chem; inside?: boolean }) {
  if (chem.empty) return null;
  const v = chem.value;
  return (
    <span className={`chem-b c${v}${inside ? ' in' : ''}`} title={chemTitle(chem)} role="img" aria-label={`Entrosamento ${v} de 3`}>
      <svg className="chem-ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 1.8 L21 7 V17 L12 22.2 L3 17 V7 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M13 6 L8.2 13 h3.6 l-.9 5 L16 11 h-3.8 z" fill="currentColor" />
      </svg>
      <b>{v}</b>
      <span className="chem-pips" aria-hidden="true">{[0, 1, 2].map((i) => <u key={i} className={i < v ? 'on' : ''} />)}</span>
    </span>
  );
}

// Reavalia o entrosamento quando a função ou a tática salva mudam (o elenco em si já recalcula a cada render)
export function useChemTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((x) => x + 1);
    window.addEventListener(ROLES_EVENT, bump);
    window.addEventListener('storage', bump);
    window.addEventListener('sfl-tactics-changed', bump);
    return () => {
      window.removeEventListener(ROLES_EVENT, bump);
      window.removeEventListener('storage', bump);
      window.removeEventListener('sfl-tactics-changed', bump);
    };
  }, []);
  return n;
}

export const chemBadgeCss = `
.chem-b { position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%); z-index: 6; display: inline-flex; align-items: center; gap: 3px; height: 17px; padding: 0 6px 0 4px; border-radius: 9px; white-space: nowrap; pointer-events: auto; color: #4da3ff;
  background: linear-gradient(180deg, #0d1a36, #060d1f); border: 1px solid rgba(77,163,255,.6); box-shadow: 0 0 8px rgba(60,140,255,.45), 0 2px 5px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.12); transition: color .35s, box-shadow .35s, border-color .35s; }
.chem-b .chem-ico { width: 12px; height: 12px; filter: drop-shadow(0 0 3px currentColor); }
.chem-b b { font: 800 12px/1 'Bebas Neue', Inter, sans-serif; color: #fff; letter-spacing: .02em; min-width: 7px; text-align: center; }
.chem-pips { display: inline-flex; gap: 1.5px; }
.chem-pips u { width: 0; height: 0; border-left: 2.5px solid transparent; border-right: 2.5px solid transparent; border-bottom: 5px solid rgba(255,255,255,.2); }
.chem-pips u.on { border-bottom-color: currentColor; filter: drop-shadow(0 0 2px currentColor); }
.chem-b.in { bottom: 4px; }
.chem-b.c0 { color: #7d8794; border-color: rgba(125,135,148,.45); box-shadow: 0 2px 5px rgba(0,0,0,.55); }
.chem-b.c1 { color: #4a86d6; }
.chem-b.c3 { color: #5cc4ff; border-color: rgba(92,196,255,.9); box-shadow: 0 0 12px rgba(70,170,255,.75), 0 2px 5px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.18); }
.dr-slot .dr-label.has-chem { transform: translate(-50%, 14px); }
`;
