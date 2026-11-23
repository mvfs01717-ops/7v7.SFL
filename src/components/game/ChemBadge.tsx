// Indicador de entrosamento individual (0 a 3): pequeno, fundo escuro, detalhes em azul. Um por jogador, sem linhas entre jogadores.
import { useEffect, useState } from 'react';
import { ROLES_EVENT } from '@/lib/playerRoles';
import { chemTitle, type Chem } from '@/lib/game/chemistry';

export function ChemBadge({ chem, inside = false }: { chem: Chem; inside?: boolean }) {
  if (chem.empty) return null;
  const v = chem.value;
  // Três losangos (um por ponto de entrosamento): acesos em ciano conforme o nível
  const D = 'M0 -4.3 L4.3 0 L0 4.3 L-4.3 0 Z';
  return (
    <span className={`chem-b c${v}${inside ? ' in' : ''}`} title={chemTitle(chem)} role="img" aria-label={`Entrosamento ${v} de 3`}>
      <svg className="chem-ico" viewBox="-12 -12 24 24" aria-hidden="true">
        <path className={v >= 1 ? 'on' : ''} transform="translate(0 -6)" d={D} />
        <path className={v >= 2 ? 'on' : ''} transform="translate(-6 3.5)" d={D} />
        <path className={v >= 3 ? 'on' : ''} transform="translate(6 3.5)" d={D} />
      </svg>
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
/* Tamanho sempre proporcional a largura da card (o selo ocupa ~23% dela) */
.chem-b { position: absolute; left: -5%; bottom: -3%; z-index: 6; width: 23%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; color: #4fd6ff; pointer-events: auto; box-sizing: border-box;
  background: radial-gradient(circle at 35% 28%, #15305f, #050d22 72%); border: 1px solid rgba(79,214,255,.35); box-shadow: 0 0 5px rgba(60,160,255,.5), 0 1px 3px rgba(0,0,0,.65), inset 0 1px 1px rgba(255,255,255,.18); transition: box-shadow .35s; }
.chem-b .chem-ico { width: 72%; height: 72%; }
.chem-b .chem-ico path { fill: rgba(120,150,190,.28); transition: fill .3s, filter .3s; }
.chem-b .chem-ico path.on { fill: currentColor; filter: drop-shadow(0 0 1.5px currentColor); }
.chem-b.in { left: 3%; bottom: 3%; }
.chem-b.c0 { box-shadow: 0 1px 3px rgba(0,0,0,.65); border-color: rgba(125,135,148,.35); }
.chem-b.c3 { box-shadow: 0 0 7px rgba(70,190,255,.85), 0 1px 3px rgba(0,0,0,.65), inset 0 1px 1px rgba(255,255,255,.25); }
`;
