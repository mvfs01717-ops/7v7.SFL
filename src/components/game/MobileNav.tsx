// Navegação inferior do celular (estilo jogos mobile). No computador fica escondida (display: none).
import { CircleUserRound, Database, Play, Trophy, Users } from 'lucide-react';

const css = `
.mnav { display: none; }
@media (max-width: 860px) {
  .mnav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: linear-gradient(180deg, rgba(7,13,30,.97), rgba(2,4,12,.99)); border-top: 1px solid rgba(245,184,0,.3); box-shadow: 0 -12px 32px rgba(0,0,0,.55); }
  .mnav::before { content: ''; position: absolute; left: 12%; right: 12%; top: -1px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,226,122,.9), transparent); }
  .mnav button { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 56px; border: 0; background: none; color: rgba(255,255,255,.55);
    font: 800 10px Inter, sans-serif; letter-spacing: .9px; text-transform: uppercase; -webkit-tap-highlight-color: transparent; transition: color .2s; }
  .mnav .mn-ic { display: grid; place-items: center; width: 46px; height: 30px; border-radius: 15px; transition: background .25s, transform .25s cubic-bezier(.2,1.4,.4,1), box-shadow .25s; }
  .mnav button:active .mn-ic { transform: scale(.9); }
  .mnav button.on { color: #ffe27a; }
  .mnav button.on .mn-ic { background: linear-gradient(160deg, #ffe27a, #F5B800 60%, #d99a00); color: #1a1200; box-shadow: 0 0 18px rgba(245,184,0,.5), 0 4px 10px rgba(0,0,0,.4); transform: translateY(-2px); }
  .mnav button.on::before { content: ''; position: absolute; top: -7px; left: 50%; width: 26px; height: 3px; margin-left: -13px; border-radius: 0 0 4px 4px; background: #F5B800; box-shadow: 0 0 12px 2px rgba(245,184,0,.8); }
  .mnav .mn-nb { position: absolute; top: 5px; left: 50%; margin-left: 8px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 99px; display: grid; place-items: center; background: #22c55e; color: #04140a; font: 900 9px Inter, sans-serif; letter-spacing: 0; box-shadow: 0 0 8px rgba(34,197,94,.6); }
  .mnav .mn-nb.warn { background: #ef4444; color: #fff; }
  .app-shell.mnav-on { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
  .app-shell.mnav-on .hd .mobile-menu, .app-shell.mnav-on .hd .m-menu { display: none; }
}
`;

export default function MobileNav({
  active, onHome, onSquad, onFriends, onLeaderboard, onProfile, friendsOnline = 0, friendsPending = false,
}: {
  active: string; onHome: () => void; onSquad: () => void; onFriends: () => void; onLeaderboard: () => void; onProfile: () => void; friendsOnline?: number; friendsPending?: boolean;
}) {
  const tabs = [
    { key: 'home', label: 'Início', icon: <Play size={20} />, run: onHome },
    { key: 'squad', label: 'Elenco', icon: <Database size={20} />, run: onSquad },
    { key: 'friends', label: 'Amigos', icon: <Users size={20} />, run: onFriends },
    { key: 'leaderboard', label: 'Ranking', icon: <Trophy size={20} />, run: onLeaderboard },
    { key: 'profile', label: 'Perfil', icon: <CircleUserRound size={20} />, run: onProfile },
  ];
  return (
    <nav className="mnav" aria-label="Navegação principal">
      <style>{css}</style>
      {tabs.map((t) => (
        <button key={t.key} className={active === t.key ? 'on' : ''} aria-current={active === t.key ? 'page' : undefined} onClick={t.run}>
          <span className="mn-ic">{t.icon}</span>
          {t.label}
          {t.key === 'friends' && (friendsPending || friendsOnline > 0) && <i className={`mn-nb ${friendsPending ? 'warn' : ''}`}>{friendsPending ? '!' : friendsOnline}</i>}
        </button>
      ))}
    </nav>
  );
}
