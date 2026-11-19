import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Player, Position } from '@/lib/game/types';
import { positionNames } from '@/lib/game/types';
import { FIT_LABEL, FIT_TEXT, ROLES_EVENT, SECTOR_LABEL, SECTOR_OF, loadRoles, roleFit, roleOf, rolesFor, saveRole } from '@/lib/playerRoles';

export function useRoles() {
  const [saved, setSaved] = useState(() => loadRoles());
  useEffect(() => {
    const refresh = () => setSaved(loadRoles());
    window.addEventListener(ROLES_EVENT, refresh);
    return () => window.removeEventListener(ROLES_EVENT, refresh);
  }, []);
  return saved;
}

// Seletor de função do jogador: só mostra funções do setor da vaga (nenhuma função incompatível com a posição)
export function RolePicker({ slot, player, onClose }: { slot: Position; player: Player; onClose: () => void }) {
  const saved = useRoles();
  const current = roleOf(slot, player, saved);
  const [picked, setPicked] = useState(current.role.id);
  const roles = rolesFor(slot);
  const chosen = roles.find((role) => role.id === picked) ?? roles[0];
  const fit = roleFit(player, slot, chosen);
  const dirty = picked !== current.role.id || !current.custom;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="rp-overlay" role="dialog" aria-modal="true" aria-label={`Função de ${player.name}`} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <style>{rolesCss}</style>
      <div className="rp-sheet">
        <header className="rp-head">
          <div>
            <small>FUNÇÃO · {SECTOR_LABEL[SECTOR_OF[slot]].toUpperCase()}</small>
            <h3>{player.name}</h3>
            <span>{positionNames[slot]} · Overall {player.overall}</span>
          </div>
          <button type="button" className="rp-x" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="rp-grid" role="radiogroup" aria-label="Funções disponíveis">
          {roles.map((role) => {
            const roleFitValue = roleFit(player, slot, role);
            return (
              <button key={role.id} type="button" role="radio" aria-checked={picked === role.id} className={`rp-card ${picked === role.id ? 'on' : ''}`} onClick={() => setPicked(role.id)}>
                <span className="rp-ic" aria-hidden="true">{role.icon}</span>
                <b>{role.name}</b>
                <small>{role.text}</small>
                <em className={`rp-fit ${roleFitValue}`}>{FIT_LABEL[roleFitValue]}</em>
              </button>
            );
          })}
        </div>
        <div className="rp-detail" key={chosen.id}>
          <div><small>FINALIDADE TÁTICA</small><b>{chosen.icon} {chosen.goal}</b></div>
          <div><small>COMPATIBILIDADE</small><b className={`rp-fit-t ${fit}`}>{FIT_LABEL[fit]}</b><span>{FIT_TEXT[fit]}</span></div>
        </div>
        <p className="rp-note">A compatibilidade usa as posições do jogador (principal e alternativas). A função não muda o overall.</p>
        <div className="rp-actions">
          <button type="button" className="rp-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="rp-btn" disabled={!dirty} onClick={() => { saveRole(slot, player, picked); onClose(); }}>{dirty ? 'Salvar função' : '✓ Função salva'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const rolesCss = `
.rp-overlay { position: fixed; inset: 0; z-index: 95; display: grid; place-items: center; padding: 14px; overflow-y: auto; background: rgba(3,6,14,.86); backdrop-filter: blur(4px); animation: rp-in .25s ease-out; }
.rp-sheet { width: min(720px, 100%); padding: 18px; color: #fff; border-radius: 18px; background: linear-gradient(160deg, #101f45, #060c1d); border: 1px solid rgba(245,184,0,.35); box-shadow: 0 30px 80px rgba(0,0,0,.6); }
.rp-head { display: flex; justify-content: space-between; gap: 10px; }
.rp-head small { font-size: 10px; letter-spacing: 3px; color: #F5B800; font-weight: 800; }
.rp-head h3 { margin: 4px 0 2px; font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 34px; letter-spacing: 1px; line-height: 1; }
.rp-head span { font-size: 12px; opacity: .7; }
.rp-x { width: 36px; height: 36px; border-radius: 50%; flex: none; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.06); color: #fff; cursor: pointer; }
.rp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
.rp-card { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px; text-align: left; color: #fff; cursor: pointer; border-radius: 6px 16px 6px 16px; border: 1px solid rgba(255,255,255,.14); background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02)); transition: transform .25s, border-color .25s, background .25s, box-shadow .25s; }
.rp-card:hover { transform: translateY(-2px); }
.rp-ic { font-size: 26px; line-height: 1; transition: transform .3s; }
.rp-card b { font-size: 13px; letter-spacing: .3px; }
.rp-card small { font-size: 11px; line-height: 1.35; opacity: .72; }
.rp-card.on { border-color: #F5B800; background: linear-gradient(180deg, rgba(245,184,0,.32), rgba(245,184,0,.05)); box-shadow: 0 0 0 1px #F5B800, 0 8px 26px rgba(245,184,0,.25); }
.rp-card.on b { color: #F5B800; }
.rp-card.on .rp-ic { transform: scale(1.2); filter: drop-shadow(0 0 8px rgba(245,184,0,.8)); }
.rp-card.on::after { content: '✓'; position: absolute; top: 8px; right: 12px; font-weight: 900; color: #F5B800; animation: rp-pop .3s ease-out; }
.rp-fit { margin-top: 4px; font-style: normal; font-size: 9.5px; font-weight: 900; letter-spacing: .6px; text-transform: uppercase; padding: 3px 7px; border-radius: 99px; }
.rp-fit.ideal { background: rgba(55,214,122,.18); color: #37d67a; }
.rp-fit.compativel { background: rgba(245,184,0,.18); color: #F5B800; }
.rp-fit.alternativa { background: rgba(255,255,255,.1); color: #c7cfdd; }
.rp-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; border-radius: 12px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1); animation: rp-in .25s ease-out; }
.rp-detail small { display: block; font-size: 9px; letter-spacing: 2px; opacity: .6; margin-bottom: 4px; }
.rp-detail b { display: block; font-size: 13px; }
.rp-detail span { display: block; margin-top: 3px; font-size: 11px; opacity: .72; line-height: 1.35; }
.rp-fit-t.ideal { color: #37d67a; } .rp-fit-t.compativel { color: #F5B800; } .rp-fit-t.alternativa { color: #c7cfdd; }
.rp-note { margin: 10px 0 0; font-size: 11px; opacity: .55; }
.rp-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.rp-btn { padding: 12px 20px; border-radius: 10px; font-weight: 800; font-size: 13px; border: 0; cursor: pointer; color: #1a1200; background: linear-gradient(180deg, #ffd24d, #F5B800); }
.rp-btn.ghost { background: none; color: #fff; border: 1px solid rgba(255,255,255,.3); }
.rp-btn:disabled { opacity: .45; cursor: default; }
@keyframes rp-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes rp-pop { from { transform: scale(0); } to { transform: scale(1); } }
@media (max-width: 520px) { .rp-grid { grid-template-columns: 1fr; } .rp-detail { grid-template-columns: 1fr; } .rp-card { flex-direction: row; flex-wrap: wrap; align-items: center; } .rp-card small { flex-basis: 100%; } }
@media (prefers-reduced-motion: reduce) { .rp-overlay, .rp-detail, .rp-card, .rp-ic { animation: none; transition: none; } }
`;
