// Indicador de entrosamento individual (0 a 3): pequeno, fundo escuro, detalhes em azul. Um por jogador, sem linhas entre jogadores.
import { useEffect, useState } from 'react';
import { ROLES_EVENT } from '@/lib/playerRoles';
import { chemTitle, type Chem } from '@/lib/game/chemistry';

export function ChemBadge({ chem, inside = false }: { chem: Chem; inside?: boolean }) {
  if (chem.empty) return null;
  const v = chem.value;
  return (
    <span className={`chem-b c${v}${inside ? ' in' : ''}`} title={chemTitle(chem)} role="img" aria-label={`Entrosamento ${v} de 3`}>
      <i className="chem-ring" aria-hidden="true" />
      <svg className="chem-ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 L20.5 7 V17 L12 22 L3.5 17 V7 Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M13.2 6.2 L8.4 13 h3.6 l-.9 4.8 L15.8 11 h-3.7 z" fill="currentColor" />
      </svg>
      <b>{v}</b>
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
.chem-b { position: absolute; left: -4%; bottom: 4%; z-index: 6; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: #4da3ff; pointer-events: auto;
  background: radial-gradient(circle at 35% 28%, #1d3a72, #07112a 70%); box-shadow: 0 0 9px rgba(60,140,255,.55), 0 2px 5px rgba(0,0,0,.6), inset 0 1px 1px rgba(255,255,255,.25); transition: color .35s, box-shadow .35s; }
.chem-ring { position: absolute; inset: 0; border-radius: 50%; padding: 2px; box-sizing: border-box;
  background: conic-gradient(from -60deg, var(--l1, rgba(255,255,255,.16)) 0 105deg, transparent 105deg 120deg, var(--l2, rgba(255,255,255,.16)) 120deg 225deg, transparent 225deg 240deg, var(--l3, rgba(255,255,255,.16)) 240deg 345deg, transparent 345deg 360deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); }
.chem-b.c1 { --l1: currentColor; } .chem-b.c2 { --l1: currentColor; --l2: currentColor; } .chem-b.c3 { --l1: currentColor; --l2: currentColor; --l3: currentColor; }
.chem-b .chem-ico { width: 13px; height: 13px; margin-top: -3px; filter: drop-shadow(0 0 3px currentColor); }
.chem-b b { position: absolute; left: 0; right: 0; bottom: 2px; text-align: center; font: 800 8px/1 Inter, sans-serif; color: #fff; text-shadow: 0 0 3px #000; }
.chem-b.in { left: 2px; bottom: 6px; }
.chem-b.c0 { color: #7d8794; box-shadow: 0 2px 5px rgba(0,0,0,.6), inset 0 1px 1px rgba(255,255,255,.15); }
.chem-b.c1 { color: #4a86d6; }
.chem-b.c3 { color: #5cc4ff; box-shadow: 0 0 13px rgba(70,170,255,.85), 0 2px 5px rgba(0,0,0,.6), inset 0 1px 1px rgba(255,255,255,.3); }
@media (max-width: 520px) { .chem-b { width: 22px; height: 22px; } .chem-b .chem-ico { width: 11px; height: 11px; } .chem-b b { font-size: 7px; bottom: 1px; } }
`;
