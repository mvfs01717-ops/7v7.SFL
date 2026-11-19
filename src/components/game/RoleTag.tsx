import type { Player } from '@/lib/game/types';
import { roleTag } from '@/lib/playerRoles';

// Função principal cadastrada pelo administrador: "Defensor ++ · Defender · ZAG"
export function RoleTag({ player }: { player: Player }) {
  const tag = roleTag(player);
  if (!tag) return null;
  return (
    <div className="rt" title={`${tag.name} ${tag.sym} · ${tag.style} · ${tag.sector}`}>
      <style>{roleTagCss}</style>
      <b>{tag.name}{tag.sym && <em>{tag.sym}</em>}</b>
      <span>{tag.style}</span>
      <i>{tag.sector}</i>
    </div>
  );
}

export const roleTagCss = `
.rt { display: flex; flex-direction: column; align-items: center; gap: 1px; margin-top: 8px; text-align: center; line-height: 1.15; }
.rt b { font-size: 11px; color: #fff; }
.rt b em { font-style: normal; margin-left: 4px; color: #37d67a; font-weight: 900; text-shadow: 0 0 8px rgba(55,214,122,.7); }
.rt span { font-size: 10px; opacity: .75; }
.rt i { font-style: normal; font-size: 9px; font-weight: 900; letter-spacing: 1px; color: #F5B800; }
`;
