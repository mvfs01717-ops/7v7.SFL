// Apresentação dos PlayStyles na carta: ouro ao lado da carta (sempre visível) e prata no verso (vira ao tocar).
import { useState } from 'react';
import { PS_BY_ID, PS_LV_LABEL, cleanStyles, type PsDef, type PsTier } from '@/lib/game/playStyles';
import type { Player } from '@/lib/game/types';

export type CardStyle = { def: PsDef; lv: 0 | 1 | 2; tier: PsTier };
export function stylesOfPlayer(p: Player): { gold: CardStyle[]; silver: CardStyle[] } {
  const clean = cleanStyles(p.play_styles, p.primary_position === 'GK');
  const gold: CardStyle[] = [];
  const silver: CardStyle[] = [];
  for (const [id, e] of Object.entries(clean)) {
    const def = PS_BY_ID[id];
    if (!def) continue;
    (e.tier === 'gold' ? gold : silver).push({ def, lv: e.lv, tier: e.tier });
  }
  return { gold, silver };
}
// Ícones oficiais do 7v7 (public/playstyles): um losango dourado e um prateado por estilo
export const psIconUrl = (id: string, tier: PsTier): string => `${import.meta.env.BASE_URL}playstyles/${id}-${tier}.png`;
export function PsIcon({ id, tier, size = 24 }: { id: string; tier: PsTier; size?: number }) {
  return <img className="ps-ico" src={psIconUrl(id, tier)} width={size} height={size} alt="" draggable={false} />;
}
const lvTag = (lv: number) => (lv === 0 ? '' : PS_LV_LABEL[lv]);

// Faixa dourada: coluna de medalhões ao lado da carta
export function GoldRail({ list }: { list: CardStyle[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const cur = list.find((s) => s.def.id === open);
  return (
    <div className="ps-rail" onPointerLeave={() => setOpen(null)}>
      {list.map((s) => (
        <button
          key={s.def.id}
          type="button"
          className={`ps-gold lv${s.lv}`}
          aria-label={`${s.def.name} ${lvTag(s.lv)}`}
          aria-expanded={open === s.def.id}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(s.def.id)}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(open === s.def.id ? null : s.def.id);
          }}
        >
          <PsIcon id={s.def.id} tier="gold" size={42} />
          {s.lv > 0 && <b>{lvTag(s.lv)}</b>}
        </button>
      ))}
      {cur && (
        <div className="ps-pop" role="tooltip">
          <strong>{cur.def.name} <em>{PS_LV_LABEL[cur.lv]}</em></strong>
          <span>{cur.def.lv[cur.lv]}</span>
        </div>
      )}
    </div>
  );
}

// Verso da carta: lista dos PlayStyles de prata
export function SilverBack({ list, name, onFlip }: { list: CardStyle[]; name: string; onFlip: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="ps-back" onClick={onFlip}>
      <div className="ps-back-title">PLAYSTYLES</div>
      <div className="ps-back-name">{name}</div>
      <ul>
        {list.map((s) => (
          <li key={s.def.id}>
            <button
              type="button"
              title={`${s.def.name}: ${s.def.lv[s.lv]}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(open === s.def.id ? null : s.def.id);
              }}
            >
              <i aria-hidden="true"><PsIcon id={s.def.id} tier="silver" size={26} /></i>
              <span>{s.def.name}</span>
              {s.lv > 0 && <b>{lvTag(s.lv)}</b>}
            </button>
            {open === s.def.id && <small>{s.def.lv[s.lv]}</small>}
          </li>
        ))}
      </ul>
      {!list.length && <p>Sem PlayStyles de prata.</p>}
      <div className="ps-back-hint">toque para voltar</div>
    </div>
  );
}

export const playStyleCss = `
.ps-host { position: relative; }
.ps-flipper { display: grid; transform-style: preserve-3d; transition: transform .62s cubic-bezier(.3,.7,.2,1); }
.ps-host[data-flip='1'] .ps-flipper { transform: rotateY(180deg); }
.ps-front, .ps-backface { grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden; min-width: 0; }
.ps-backface { transform: rotateY(180deg); }
.ps-host[data-flip='0'] .ps-backface { pointer-events: none; }
.ps-host[data-flip='1'] .ps-front { pointer-events: none; }
.ps-front.noclick button { pointer-events: none; }
.ps-front.flipmode { cursor: pointer; }
.ps-chip { position: absolute; left: 4px; bottom: 4px; z-index: 7; width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,.55); background: linear-gradient(160deg,#dfe5ee,#8f98a4); color: #1b2128; font-size: 15px; line-height: 1; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.45); display: grid; place-items: center; padding: 0; }
.ps-chip:active { transform: scale(.92); }
.ps-chip.has-silver::after { content: attr(data-n); position: absolute; top: -5px; right: -5px; min-width: 14px; height: 14px; border-radius: 7px; background: #1b2128; color: #dfe5ee; font-size: 9px; font-weight: 800; display: grid; place-items: center; }
.ps-back { clip-path: var(--shield); height: 100%; box-sizing: border-box; padding: 17% 13% 14%; display: flex; flex-direction: column; gap: 4px; color: #1b2128; cursor: pointer; font-family: inherit;
  background: radial-gradient(circle at 30% 18%, rgba(255,255,255,.75), rgba(255,255,255,0) 55%), linear-gradient(165deg, #f4f6f9, #c3cad3 55%, #8f98a4); overflow: hidden; container-type: inline-size; }
.ps-back-title { font-size: 11px; letter-spacing: .22em; font-weight: 800; text-align: center; opacity: .75; }
.ps-back-name { text-align: center; font-weight: 800; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid rgba(27,33,40,.25); padding-bottom: 3px; }
.ps-back ul { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; overflow: auto; min-height: 0; }
.ps-back li button { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 4px; width: 100%; background: rgba(255,255,255,.45); border: 1px solid rgba(27,33,40,.18); border-radius: 7px; padding: 3px 4px; color: inherit; font: inherit; font-size: 10.5px; font-weight: 700; text-align: left; cursor: pointer; }
.ps-back li button i { font-style: normal; display: grid; place-items: center; height: 24px; }
.ps-ico { display: block; pointer-events: none; user-select: none; }
.ps-back li button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-back li button b { font-size: 9px; background: #1b2128; color: #e6e9ee; border-radius: 6px; padding: 0 5px; }
.ps-back li small { display: block; font-size: 10px; line-height: 1.25; padding: 2px 4px 0; opacity: .85; }
.ps-back p { text-align: center; font-size: 11px; opacity: .7; margin: 8px 0; }
.ps-back-hint { margin-top: auto; text-align: center; font-size: 9px; opacity: .55; letter-spacing: .08em; }
/* Ouro: medalhões ao lado da carta */
.ps-rail { position: absolute; top: 12%; left: calc(100% - 20px); z-index: 8; display: flex; flex-direction: column; gap: 4px; }
.ps-gold { position: relative; width: 42px; height: 42px; display: grid; place-items: center; padding: 0; cursor: pointer; background: none; border: 0; filter: drop-shadow(0 0 7px rgba(255,200,60,.8)) drop-shadow(0 3px 4px rgba(0,0,0,.55)); animation: psGlow 2.8s ease-in-out infinite; }
.ps-gold b { position: absolute; right: -4px; bottom: 0; font-size: 9px; background: #3a2800; color: #ffe38a; border-radius: 6px; padding: 0 4px; border: 1px solid #ffd84d; }
.ps-gold.lv2 { filter: drop-shadow(0 0 11px rgba(255,214,80,1)) drop-shadow(0 3px 4px rgba(0,0,0,.55)); }
@keyframes psGlow { 50% { filter: brightness(1.18); } }
.ps-pop { position: absolute; right: calc(100% - 4px); top: 0; width: 170px; background: rgba(20,16,6,.96); color: #fff3c4; border: 1px solid #ffd84d; border-radius: 9px; padding: 7px 9px; font-size: 11px; line-height: 1.3; display: flex; flex-direction: column; gap: 3px; box-shadow: 0 6px 16px rgba(0,0,0,.5); z-index: 9; }
.ps-pop em { font-style: normal; color: #ffd84d; }
@media (prefers-reduced-motion: reduce) { .ps-flipper { transition: none; } .ps-gold { animation: none; } }
`;
