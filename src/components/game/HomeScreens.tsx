import { useEffect, useRef, useState } from 'react';
import { stadiumCss } from '@/lib/game/stadiumCss';
import { ArrowLeft, ArrowRight, CircleUserRound, Database, Download, Menu, Settings, Sparkles, Play, Shield, Swords, Trophy, Users, X, Zap } from 'lucide-react';
import { positionNames, type Player, type Team } from '@/lib/game/types';
import { Badge, Card, LogoMark, SHIELD_CLIP } from '@/components/game/Card';
import { useNewsUnseen } from '@/components/game/WhatsNew';
import { useLite } from '@/lib/settings';
import { HomeExtras, useDesktop } from '@/components/game/HomeExtras';

const headerCss = `
.topbar.hd { height: 68px; gap: 28px; position: sticky; top: 0; z-index: 30; border-bottom: 0;
  background: linear-gradient(180deg, rgba(3,5,9,.98), rgba(5,8,14,.9)); }
.topbar.hd::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(245,184,0,.7) 20%, rgba(245,184,0,.15) 55%, transparent); }
.hd .brand { gap: 10px; }
.hd .brand > span:last-child { line-height: 1; }
.hd .brand b { font-size: 26px; letter-spacing: 3px; }
.hd .brand small { display: block; margin-top: 3px; font-size: 8px; letter-spacing: 3px; color: #F5B800; font-weight: 800; }
.hd nav { display: flex; gap: 6px; margin-left: auto; }
.hd nav button { position: relative; padding: 10px 16px; font-size: 12px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; color: #aab1ba; border-radius: 6px; }
.hd nav button::after { content: ''; position: absolute; left: 16px; right: 16px; bottom: 3px; height: 2px; background: #F5B800; border-radius: 2px;
  transform: scaleX(0); transform-origin: left; transition: transform .25s cubic-bezier(.2,.8,.2,1); box-shadow: 0 0 10px rgba(245,184,0,.8); }
.hd nav button:hover, .hd nav button.on { color: #fff; }
.hd nav button:hover::after, .hd nav button.on::after { transform: scaleX(1); }
.hd .profile-button { gap: 10px; padding: 5px 14px 5px 5px; border-radius: 999px; border: 1px solid rgba(245,184,0,.45);
  background: linear-gradient(100deg, rgba(245,184,0,.18), rgba(255,255,255,.03)); color: #fff; font-size: 13px; font-weight: 800; letter-spacing: .5px; cursor: pointer; }
.hd .profile-button:hover { border-color: #F5B800; box-shadow: 0 0 18px rgba(245,184,0,.3); color: #fff; }
.hd .gear { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #fff; cursor: pointer; }
.hd .gear:hover { border-color: #F5B800; color: #F5B800; }
.hd .pv { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; font-size: 14px; color: #1a1200; text-transform: uppercase;
  background: radial-gradient(circle at 30% 25%, #ffe27a, #c48a00); }
.hd .pn { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hd .mobile-menu { width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #fff; place-items: center; }
.hd .m-menu { position: absolute; top: calc(100% + 8px); right: 12px; z-index: 50; min-width: 220px; display: grid; gap: 4px; padding: 8px; border-radius: 16px;
  background: rgba(10,15,24,.98); border: 1px solid rgba(245,184,0,.3); box-shadow: 0 18px 40px rgba(0,0,0,.65); animation: hmFade .2s ease both; }
.hd .m-menu button { display: flex; align-items: center; gap: 12px; padding: 13px 14px; border: 0; border-radius: 10px; background: transparent; color: #fff; font-weight: 800; letter-spacing: 1px; font-size: 13px; text-transform: uppercase; text-align: left; cursor: pointer; }
.hd .m-menu button.on, .hd .m-menu button:hover { background: rgba(245,184,0,.14); color: #F5B800; }
@media (min-width: 851px) { .hd .m-menu { display: none; } .hd .mobile-menu { display: none; } }
.hd .pc, .hd-nb { display: none; }
@media (min-width: 861px) {
  .topbar.hd { height: 76px; gap: 34px; background: linear-gradient(180deg, rgba(2,5,14,.98), rgba(5,9,22,.9)); }
  .topbar.hd::after { height: 2px; background: linear-gradient(90deg, rgba(245,184,0,0), rgba(245,184,0,.85) 14%, rgba(245,184,0,.2) 50%, rgba(245,184,0,.7) 86%, rgba(245,184,0,0)); box-shadow: 0 0 18px rgba(245,184,0,.35); }
  .hd .brand { position: relative; padding-right: 8px; }
  .hd .brand .logo-mark, .hd .brand svg { filter: drop-shadow(0 0 12px rgba(245,184,0,.55)); }
  .hd .brand b { font-size: 32px; letter-spacing: 5px; background: linear-gradient(180deg, #fff6c8, #F5B800 60%, #c98a00); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .hd .brand small { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 9px; letter-spacing: 3.4px; color: rgba(255,255,255,.7); }
  .hd .brand small::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(245,184,0,.7), transparent); }
  .hd nav { gap: 4px; }
  .hd nav button { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 4px 12px 4px 12px; font-size: 13px; letter-spacing: 2px; transition: color .2s, background .25s, box-shadow .25s; }
  .hd nav button::after { left: 20px; right: 20px; bottom: 5px; }
  .hd nav button:hover { background: rgba(255,255,255,.05); }
  .hd nav button.on { color: #ffe27a; background: linear-gradient(180deg, rgba(245,184,0,.16), rgba(245,184,0,.03)); box-shadow: inset 0 0 0 1px rgba(245,184,0,.28), 0 8px 24px -8px rgba(245,184,0,.45); }
  .hd-nb { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px; background: #22c55e; color: #04140a; font: 900 10px Inter, sans-serif; letter-spacing: 0; box-shadow: 0 0 10px rgba(34,197,94,.6); }
  .hd-nb.warn { background: #ef4444; color: #fff; box-shadow: 0 0 10px rgba(239,68,68,.65); }
  .hd .gear { width: 44px; height: 44px; border-radius: 4px 14px 4px 14px; background: linear-gradient(160deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); transition: transform .2s, border-color .2s, box-shadow .2s, color .2s; }
  .hd .gear:hover { transform: translateY(-2px); box-shadow: 0 8px 20px -6px rgba(245,184,0,.5); }
  .hd-ping::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 1px solid #F5B800; animation: hdPing 1.8s ease-out infinite; }
  @keyframes hdPing { from { transform: scale(.6); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }
  .hd .profile-button { padding: 5px 20px 5px 5px; gap: 12px; border-radius: 4px 20px 4px 20px; border-color: rgba(245,184,0,.5); background: linear-gradient(100deg, rgba(245,184,0,.2), rgba(255,255,255,.03)); box-shadow: inset 0 1px 0 rgba(255,255,255,.1); }
  .hd .pv { width: 40px; height: 40px; font-size: 20px; font-family: 'Bebas Neue', Inter, sans-serif; box-shadow: 0 0 0 2px #05091a, 0 0 0 3.5px rgba(245,184,0,.85), 0 0 16px rgba(245,184,0,.45); }
  .hd .pn { display: flex; flex-direction: column; line-height: 1.1; max-width: 150px; }
  .hd .pnn { overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
  .hd .pc { display: block; margin-top: 3px; font-size: 9px; font-weight: 800; letter-spacing: 2px; color: #F5B800; text-transform: uppercase; }
}
@media (min-width: 861px) and (max-width: 1279px) {
  .topbar.hd { gap: 14px; padding: 0 16px; }
  .hd .brand b { font-size: 26px; letter-spacing: 3px; }
  .hd .brand small { display: none; }
  .hd nav { gap: 0; }
  .hd nav button { padding: 10px 9px; font-size: 11px; letter-spacing: 1px; gap: 5px; }
  .hd nav button::after { left: 9px; right: 9px; }
  .hd .gear { width: 38px; height: 38px; }
  .hd .profile-button { gap: 8px; padding: 4px 12px 4px 4px; }
  .hd .pv { width: 34px; height: 34px; font-size: 17px; }
  .hd .pn { max-width: 96px; }
  .hd .pc { display: none; }
}
@media (max-width: 850px) { .hd nav { display: none; } .hd .mobile-menu { display: grid; margin-left: 0; } .hd .gear { margin-left: auto; } .hd .profile-button { margin-left: 0; } }
@media (max-width: 560px) { .topbar.hd { height: 58px; gap: 10px; padding: 0 12px; } .hd .brand b { font-size: 22px; } .hd .brand small { display: none; }
  .hd .profile-button { padding: 4px 10px 4px 4px; font-size: 12px; } .hd .pv { width: 28px; height: 28px; } .hd .pn { max-width: 80px; } }
`;

export function Header({
  nickname,
  isAdmin,
  onAdmin,
  onHome,
  onLeaderboard,
  onSquad,
  onProfile,
  onFriends,
  onLogin,
  onSettings,
  onNews,
  loggedIn,
  active,
  friendsOnline = 0,
  friendsPending = false,
}: {
  nickname: string;
  isAdmin: boolean;
  onAdmin: () => void;
  onHome: () => void;
  onLeaderboard: () => void;
  onSquad: () => void;
  onProfile: () => void;
  onFriends: () => void;
  onLogin: () => void;
  onSettings?: () => void;
  onNews?: () => void;
  loggedIn: boolean;
  active: string;
  friendsOnline?: number;
  friendsPending?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const newsUnseen = useNewsUnseen();
  const go = (action: () => void) => {
    setMenuOpen(false);
    action();
  };
  const links: { key: string; label: string; icon: JSX.Element; run: () => void }[] = [
    { key: 'home', label: 'Início', icon: <Play size={16} />, run: onHome },
    { key: 'friends', label: 'Amigos', icon: <Users size={16} />, run: onFriends },
    { key: 'squad', label: 'Elenco', icon: <Database size={16} />, run: onSquad },
    { key: 'leaderboard', label: 'Classificação', icon: <Trophy size={16} />, run: onLeaderboard },
    { key: 'profile', label: 'Perfil', icon: <CircleUserRound size={16} />, run: onProfile },
  ];
  return (
    <header className="topbar hd">
      <style>{headerCss}</style>
      <button className="brand" onClick={onHome}>
        <LogoMark size={46} variant="full" />
        <span>
          <b>BRASIL</b>
          <small>ULTIMATE 7V7</small>
        </span>
      </button>
      <nav aria-label="Navegação">
        {links.map((l) => (
          <button key={l.key} className={active === l.key ? 'on' : ''} onClick={l.run}>
            {l.label}
            {l.key === 'friends' && (friendsPending || friendsOnline > 0) && (
              <i className={`hd-nb ${friendsPending ? 'warn' : ''}`}>{friendsPending ? '!' : friendsOnline}</i>
            )}
          </button>
        ))}
      </nav>
      {onNews && (
        <button className="gear" aria-label="O que há de novo" title="O que há de novo" onClick={onNews} style={{ position: 'relative' }}>
          <Sparkles size={18} />
          {newsUnseen && <i className="hd-ping" style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 99, background: '#F5B800' }} />}
        </button>
      )}
      {onSettings && (
        <button className="gear" aria-label="Configurações" title="Configurações" onClick={onSettings}>
          <Settings size={18} />
        </button>
      )}
      <button className="profile-button" onClick={loggedIn ? onProfile : onLogin}>
        <span className="pv">{(nickname || '?').slice(0, 1)}</span>
        <span className="pn">
          <span className="pnn">{loggedIn ? nickname : 'Entrar'}</span>
          <small className="pc">{loggedIn ? 'Conta ativa' : 'Convidado'}</small>
        </span>
      </button>
      <button
        className="mobile-menu"
        aria-label="Menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      {menuOpen && (
        <div className="m-menu">
          {links.map((l) => (
            <button key={l.key} className={active === l.key ? 'on' : ''} onClick={() => go(l.run)}>
              {l.icon} {l.label}
            </button>
          ))}
          {isAdmin && (
            <button onClick={() => go(onAdmin)}>
              <Shield size={16} /> Admin
            </button>
          )}
        </div>
      )}
    </header>
  );
}

const homeCss = `
.hm { position: relative; min-height: calc(100vh - 78px); overflow: hidden; isolation: isolate; color: #fff; }
.hm-bg { position: absolute; inset: 0; z-index: -1; overflow: hidden; }
.hm-shade { position: absolute; inset: 0; pointer-events: none; background:
  linear-gradient(90deg, rgba(3,7,20,.66) 0%, rgba(3,7,20,.3) 42%, rgba(3,7,20,.08) 100%),
  linear-gradient(180deg, rgba(4,10,30,.36) 0%, rgba(4,10,30,.18) 38%, rgba(3,6,16,.62) 100%),
  rgba(8,20,60,.18); }
.hm-vignette { position: absolute; inset: 0; background: radial-gradient(90% 90% at 50% 45%, transparent 40%, rgba(0,0,0,.65)); pointer-events: none; }

.hm-wrap > * { min-width: 0; }
.hm-wrap { display: grid; grid-template-columns: clamp(292px, 21vw, 380px) 1fr; gap: clamp(28px, 2.4vw, 48px); max-width: min(1680px, 100%); margin: 0 auto; padding: clamp(28px, 3vw, 48px) clamp(20px, 4vw, 72px) 48px; align-items: stretch; }
.hm-side { display: grid; gap: 8px; align-content: start; animation: hmSlide .6s cubic-bezier(.2,.8,.2,1) both; }
@keyframes hmSlide { from { opacity: 0; transform: translateX(-26px); } to { opacity: 1; transform: none; } }
.hm-item { position: relative; display: flex; align-items: center; gap: 14px; padding: clamp(10px, 1.1vh, 16px) 16px; border-radius: 6px 16px 6px 16px; border: 1px solid rgba(255,255,255,.1);
  background: linear-gradient(100deg, rgba(255,255,255,.07), rgba(255,255,255,.02)); color: #fff; text-align: left; cursor: pointer;
  transition: transform .25s cubic-bezier(.2,.8,.2,1), background .25s, border-color .25s, box-shadow .25s; animation: hmSlide .6s cubic-bezier(.2,.8,.2,1) both; }
.hm-item:nth-child(2) { animation-delay: .05s; } .hm-item:nth-child(3) { animation-delay: .1s; } .hm-item:nth-child(4) { animation-delay: .15s; }
.hm-item:nth-child(5) { animation-delay: .2s; } .hm-item:nth-child(6) { animation-delay: .25s; } .hm-item:nth-child(7) { animation-delay: .3s; }
.hm-item::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0;
  background: linear-gradient(105deg, transparent 30%, rgba(255,226,122,.28) 50%, transparent 70%); transform: translateX(-100%); }
.hm-item:hover::before, .hm-item.on::before { opacity: 1; animation: hmSweep .9s ease-out both; }
@keyframes hmSweep { to { transform: translateX(100%); } }
.hm-item::after { content: '›'; position: absolute; right: 14px; top: 50%; transform: translate(-8px, -52%); font-size: 26px; font-weight: 900; color: #F5B800; opacity: 0; transition: opacity .25s, transform .25s; }
.hm-item.on::after, .hm-item:hover::after { opacity: 1; transform: translate(0, -52%); }
.hm-ico { flex: none; position: relative; width: clamp(42px, 2.5vw, 48px); height: clamp(42px, 2.5vw, 48px); display: grid; place-items: center; border-radius: 12px; color: #fff;
  background: linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.04)); border: 1px solid rgba(255,255,255,.16); box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 6px 14px rgba(0,0,0,.35);
  transition: transform .3s cubic-bezier(.2,1.4,.4,1), background .25s, color .25s, box-shadow .25s; }
.hm-item.on .hm-ico, .hm-item:hover .hm-ico { color: #1a1200; background: linear-gradient(160deg, #ffe27a, #F5B800 60%, #d99a00); border-color: #ffe27a; transform: scale(1.1) rotate(-6deg);
  box-shadow: 0 0 22px rgba(245,184,0,.6), 0 6px 14px rgba(0,0,0,.4); }
.hm-item svg { flex: none; opacity: .95; }
.hm-item b { display: block; font-size: clamp(15px, 1.05vw, 18px); letter-spacing: 1.6px; font-weight: 900; text-transform: uppercase; }
.hm-item small { display: block; font-size: clamp(11px, .8vw, 13px); opacity: .6; margin-top: 2px; }
.hm-item:hover { transform: translateX(6px); }
.hm-item.on, .hm-item:focus-visible { transform: translateX(10px); outline: none; border-color: #F5B800; overflow: hidden;
  background: linear-gradient(100deg, rgba(245,184,0,.3), rgba(245,184,0,.06)); box-shadow: 0 0 0 1.5px #F5B800, 0 12px 30px rgba(0,0,0,.5), 0 0 26px rgba(245,184,0,.28), inset 4px 0 0 #F5B800; }
.hm-item.on b, .hm-item:hover b { color: #ffe27a; }
.hm-item:has(.hm-badge)::after { display: none; }
.hm-badge { margin-left: auto; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 900; letter-spacing: .8px; background: #ef4444; color: #fff; white-space: nowrap; }
.hm-badge.gold { background: #F5B800; color: #1a1200; }
.hm-ios { position: fixed; inset: 0; z-index: 400; background: rgba(3,6,12,.88); display: grid; place-items: center; padding: 16px; }
.hm-ios > div { width: min(420px, 100%); background: #0f1622; border: 1px solid rgba(245,184,0,.5); border-radius: 16px; padding: 22px; box-shadow: 0 24px 70px rgba(0,0,0,.6); }
.hm-ios h3 { margin: 0 0 12px; font-size: 20px; font-weight: 900; color: #F5B800; }
.hm-ios ol { margin: 0 0 16px; padding-left: 20px; display: grid; gap: 9px; line-height: 1.4; color: rgba(255,255,255,.9); }
.hm-ios button { width: 100%; padding: 12px; border: 0; border-radius: 999px; background: #F5B800; color: #1a1200; font-weight: 900; cursor: pointer; }
.hm-dot { position: absolute; top: 9px; right: 9px; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 0 rgba(239,68,68,.7); animation: hmPing 1.6s infinite; }
@keyframes hmPing { 70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }

.hm-banner { position: relative; min-height: clamp(460px, calc(100vh - 170px), 820px); border-radius: 22px; overflow: hidden; padding: clamp(44px, 4vw, 72px) clamp(48px, 5vw, 96px); display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr); gap: 56px; align-items: center;
  border: 1px solid rgba(255,255,255,.14); background: linear-gradient(120deg, rgba(10,16,32,.78), rgba(245,184,0,.1)); 
  box-shadow: 0 30px 70px rgba(0,0,0,.55); animation: hmRise .7s cubic-bezier(.2,.8,.2,1) both; perspective: 900px; }
@keyframes hmRise { from { opacity: 0; transform: translateY(24px) scale(.98); } to { opacity: 1; transform: none; } }
.hm-banner::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.1) 48%, transparent 60%); transform: translateX(-120%); animation: hmShine 6s 1.2s infinite; }
@keyframes hmShine { to { transform: translateX(120%); } }
.hm-copy { position: relative; z-index: 2; }
.hm-copy > * { animation: hmFade .45s ease both; }
@keyframes hmFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.hm-eyebrow { font-size: 12px; font-weight: 900; letter-spacing: 3px; color: #F5B800; }
.hm-title { margin: 8px 0 10px; font-size: clamp(44px, 6.2vw, 120px); line-height: .92; font-weight: 900; font-style: italic; letter-spacing: -1px; text-transform: uppercase; }
.hm-title em { color: #F5B800; font-style: italic; }
.hm-text { max-width: clamp(400px, 30vw, 560px); margin: 0 0 34px; font-size: clamp(16px, 1.15vw, 20px); line-height: 1.6; opacity: .82; }
.hm-cta-wrap { display: inline-block; position: relative; isolation: isolate; animation: hmFade .45s ease both; }
.hm-cta-wrap::before { content: ''; position: absolute; z-index: -1; inset: -16px -26px; border-radius: 50%; background: radial-gradient(closest-side, rgba(245,184,0,.55), rgba(245,184,0,0)); opacity: .55; animation: hmGlow 2.4s 1s ease-in-out infinite; pointer-events: none; will-change: opacity; }
.hm-cta-wrap::after { content: ''; position: absolute; z-index: -1; left: 6%; right: 6%; bottom: -10px; height: 22px; border-radius: 50%; background: radial-gradient(closest-side, rgba(0,0,0,.55), rgba(0,0,0,0)); pointer-events: none; }
.hm-cta { position: relative; overflow: hidden; display: inline-flex; align-items: center; gap: 14px; padding: 22px 48px 22px 44px; border: 0; cursor: pointer; font-weight: 900; font-size: 24px; letter-spacing: 2.5px; white-space: nowrap; text-transform: uppercase;
  color: #1a1200; background: linear-gradient(180deg, #fff0a8, #F5B800 55%, #d99a00); clip-path: polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%);
  transition: transform .22s cubic-bezier(.2,1.4,.4,1), filter .2s; }
.hm-cta::before { content: ''; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.75) 50%, transparent 70%); transform: translateX(-120%); animation: hmCtaShine 3.2s 1.2s ease-in-out infinite; }
.hm-cta svg { transition: transform .22s; }
.hm-cta:hover { transform: translateY(-3px) scale(1.05); filter: brightness(1.08); }
.hm-cta:hover svg { transform: translateX(6px); }
.hm-cta:active { transform: scale(.98); }
@keyframes hmCtaShine { 0% { transform: translateX(-120%); } 40%, 100% { transform: translateX(120%); } }
@keyframes hmGlow { 50% { opacity: 1; } }
.hm-sub { margin-top: 12px; font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; opacity: .6; }
.hm-hint { margin-top: 14px; font-size: 13px; opacity: .75; }
.hm-hint button { background: none; border: 0; color: #F5B800; font-weight: 800; cursor: pointer; padding: 0; text-decoration: underline; }

.hm-hero { position: relative; z-index: 1; display: grid; place-items: center; min-height: clamp(360px, 40vh, 600px); padding: 0 0 36px; }
.hm-halo { position: absolute; width: 78%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, rgba(245,184,0,.5), transparent 68%); animation: hmHalo 4s ease-in-out infinite alternate; will-change: transform, opacity; }
@keyframes hmHalo { from { transform: scale(.9); opacity: .6; } to { transform: scale(1.08); opacity: 1; } }
.hm-tilt { position: relative; width: min(100%, clamp(250px, 20vw, 400px)); transform-style: preserve-3d; transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .15s ease-out; }
.hm-float { position: relative; animation: hmFloat 5.2s ease-in-out infinite; transform-style: preserve-3d; }
@keyframes hmFloat { 0%, 100% { transform: translateY(0) rotate(-.6deg); } 50% { transform: translateY(-14px) rotate(.6deg); } }
.hm-float { will-change: transform; }
/* brilho dourado passando pela superfície da carta (recortado no formato do escudo) */
.hm-shine { position: absolute; inset: 0; pointer-events: none; opacity: 0; mix-blend-mode: screen;
  background: linear-gradient(112deg, transparent 38%, rgba(255,214,90,.0) 42%, rgba(255,226,122,.75) 50%, rgba(255,214,90,.0) 58%, transparent 62%); background-size: 280% 100%; background-position: 160% 0; }
.hm-fc.c .hm-shine { opacity: 1; animation: hmShineCard 4.4s ease-in-out infinite; }
@keyframes hmShineCard { 0% { background-position: 160% 0; } 45%, 100% { background-position: -60% 0; } }
/* sombra no chão: some e fica difusa quando a carta sobe, volta nítida quando ela desce */
.hm-ground { position: absolute; left: 50%; bottom: -26px; width: 78%; height: 26px; transform: translateX(-50%); border-radius: 50%; z-index: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(0,0,0,.75) 0, rgba(0,0,0,.35) 45%, transparent 72%); animation: hmGround 5.2s ease-in-out infinite; }
@keyframes hmGround { 0%, 100% { transform: translateX(-50%) scale(1); opacity: .95; } 50% { transform: translateX(-50%) scale(.78); opacity: .55; } }
.hm-capn { display: none; }
.hm-cap { position: absolute; left: -40px; right: -40px; bottom: -30px; text-align: center; font-size: 11px; font-weight: 900; letter-spacing: 2px; color: #F5B800; text-shadow: 0 2px 8px #000; }

.hm-spark { position: absolute; bottom: -10px; border-radius: 50%; background: #ffd24a; box-shadow: 0 0 8px 2px rgba(255,200,40,.8); opacity: 0; animation: hmSpark linear infinite; }
@keyframes hmSpark { 0% { transform: translate(0,0); opacity: 0; } 12% { opacity: .9; } 100% { transform: translate(40px,-95vh); opacity: 0; } }
.hm-flash { position: absolute; inset: 0; z-index: 5; pointer-events: none; background: radial-gradient(circle at 50% 40%, #fff 0, rgba(255,230,140,.9) 25%, transparent 70%); opacity: 0; animation: hmFlash 1.1s .1s ease-out both; }
@keyframes hmFlash { 0% { opacity: 1; } 100% { opacity: 0; } }
.hm-title { animation: hmSlam .75s cubic-bezier(.2,1.4,.3,1) both !important; }
@keyframes hmSlam { 0% { opacity: 0; transform: scale(1.7) translateY(-14px); filter: blur(10px); } 100% { opacity: 1; transform: none; filter: none; } }
.hm-mark { position: absolute; z-index: 0; right: -4%; top: 50%; transform: translateY(-52%); font-size: clamp(180px, 26vw, 360px); line-height: 1; font-weight: 900; font-style: italic; letter-spacing: -8px;
  color: transparent; -webkit-text-stroke: 2px rgba(245,184,0,.22); text-shadow: 0 0 60px rgba(245,184,0,.12); animation: hmDrift 8s ease-in-out infinite alternate; pointer-events: none; user-select: none; will-change: transform; }
@keyframes hmDrift { from { transform: translate(-14px,-52%); } to { transform: translate(14px,-52%); } }
.hm-fan { position: relative; width: 100%; aspect-ratio: .74; margin: 0 auto; transform-style: preserve-3d; }
.hm-fc { position: absolute; inset: 0; transition: transform .8s cubic-bezier(.2,.8,.2,1), opacity .8s, filter .8s; }
.hm-fc.c { z-index: 3; transform: translateZ(40px) scale(1.12); }
.hm-fc.l { z-index: 1; transform: translateX(-50%) translateZ(-60px) rotate(-9deg) scale(.76); opacity: .7; filter: brightness(.55) saturate(.8); }
.hm-fc.r { z-index: 1; transform: translateX(50%) translateZ(-60px) rotate(9deg) scale(.76); opacity: .7; filter: brightness(.55) saturate(.8); }
.hm-fc.x { z-index: 0; transform: translateZ(-120px) scale(.5); opacity: 0; }
.hm-fc:not(.c) .hm-float { animation: none; }
.hm-tilt { width: min(100%, 190px); }
.hm-cap { bottom: -40px; font-size: 13px; }
.hm-cap b { font-size: 24px; margin-right: 6px; color: #fff; vertical-align: -2px; }
.hm-cap { animation: hmFade .5s ease both; white-space: nowrap; }

.hm-leave { position: fixed; inset: 0; z-index: 999; pointer-events: all; background: radial-gradient(circle at 50% 50%, #fff6c2, #F5B800 40%, #05070d 100%); animation: hmLeave .34s ease-in both; }
@keyframes hmLeave { from { opacity: 0; transform: scale(1.3); } to { opacity: 1; transform: scale(1); } }

@media (max-width: 860px) {
  .hm { min-height: 0; }
  .hm-wrap { grid-template-columns: minmax(0, 1fr); gap: 14px; padding: 10px 12px 24px; }
  .hm-banner { grid-template-columns: minmax(0, 1fr); gap: 0; padding: 18px 16px 20px; min-height: 0; order: -1; text-align: center; border-radius: 26px;
    background: radial-gradient(90% 60% at 50% 18%, rgba(245,184,0,.22), transparent 70%), linear-gradient(180deg, rgba(14,22,42,.85), rgba(6,9,18,.92)); }
  .hm-hero { min-height: 0; order: -1; padding: 6px 0 30px; }
  .hm-tilt { width: 120px; margin: 0 auto; }
  .hm-mark { font-size: 200px; right: -8%; }
  .hm-hero { padding: 30px 0 46px; }
  .hm-cap b { font-size: 20px; }
  .hm-halo { width: 150%; }
  .hm-capn { display: none; }
  .hm-cap { left: -30px; right: -30px; bottom: -36px; font-size: 11px; letter-spacing: 1.5px; }
  .hm-eyebrow { font-size: 10px; letter-spacing: 2.5px; }
  .hm-title { font-size: 46px; margin: 6px 0 8px; }
  .hm-text { font-size: 13.5px; line-height: 1.45; margin: 0 auto 16px; max-width: 300px; }
  .hm-cta-wrap { display: block; }
  .hm-cta { width: 100%; justify-content: center; padding: 20px 20px; font-size: 21px; letter-spacing: 3px; }
  .hm-sub { margin-top: 10px; font-size: 11px; }
  .hm-ico { width: 38px; height: 38px; border-radius: 11px; }
  .hm-item::after { display: none; }
  .hm-item.on { overflow: visible; }
  .hm-text { margin-bottom: 22px; }
  .hm-hint { font-size: 12px; margin-top: 12px; }
  .hm-side { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; animation: none; }
  .hm-item { flex-direction: column; justify-content: center; gap: 6px; padding: 14px 4px 12px; min-width: 0; text-align: center; border-radius: 16px; min-height: 84px;
    background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); }
  .hm-item svg { width: 26px; height: 26px; }
  .hm-item b { font-size: 11px; letter-spacing: .8px; }
  .hm-item small { display: none; }
  .hm-item.on { transform: none; border-color: #F5B800; box-shadow: 0 0 0 1px #F5B800, 0 8px 22px rgba(245,184,0,.25); background: linear-gradient(180deg, rgba(245,184,0,.32), rgba(245,184,0,.06)); }
  .hm-item:hover { transform: none; }
  .hm-item:last-of-type:nth-of-type(3n + 1) { grid-column: 1 / -1; flex-direction: row; min-height: 64px; gap: 10px; }
  .hm-item:last-of-type:nth-of-type(3n + 1) small { display: none; }
  .hm-item.on svg { color: #F5B800; }
  .hm-badge { position: absolute; top: -7px; left: 50%; right: auto; transform: translateX(-50%); margin: 0; font-size: 9px; padding: 2px 7px; }
  .hm-dot { top: 8px; right: 10px; }
}

/* ===== DESKTOP (≥ 861px): visual cinematográfico inspirado no FC 27. O celular não usa nada daqui. ===== */
.hm-fx, .hm-beam, .hm-streaks, .hm-floor, .hm-sep { display: none; }
@media (min-width: 861px) {
  .hm-fx { display: block; position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .hm-fx::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(-62deg, rgba(255,255,255,.022) 0 1px, transparent 1px 6px); }
  .hm-fx::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 46%; background: radial-gradient(80% 100% at 50% 100%, rgba(34,170,92,.2), transparent 72%), linear-gradient(0deg, rgba(2,6,16,.55), transparent 60%); }
  .hm-cone { position: absolute; top: -8%; height: 112%; width: 64vw; transform: translateX(-50%); mix-blend-mode: screen; opacity: .55; will-change: opacity; animation: hmCone 9s ease-in-out infinite alternate; }
  .hm-cone.c1 { left: 8%;  background: conic-gradient(from 150deg at 50% 0, transparent 0, rgba(165,205,255,.26) 12deg, transparent 26deg, transparent 360deg); }
  .hm-cone.c2 { left: 27%; background: conic-gradient(from 160deg at 50% 0, transparent 0, rgba(190,220,255,.34) 12deg, transparent 26deg, transparent 360deg); animation-delay: -3s; }
  .hm-cone.c3 { left: 73%; background: conic-gradient(from 174deg at 50% 0, transparent 0, rgba(190,220,255,.34) 12deg, transparent 26deg, transparent 360deg); animation-delay: -5s; }
  .hm-cone.c4 { left: 92%; background: conic-gradient(from 184deg at 50% 0, transparent 0, rgba(165,205,255,.26) 12deg, transparent 26deg, transparent 360deg); animation-delay: -1s; }
  @keyframes hmCone { from { opacity: .35; } to { opacity: .7; } }
  .hm-flare { position: absolute; top: 4%; width: 220px; height: 220px; margin: -110px 0 0 -110px; border-radius: 50%; background: radial-gradient(closest-side, rgba(255,255,255,.55), rgba(190,220,255,.18) 40%, transparent); mix-blend-mode: screen; }
  .hm-flare.f1 { left: 27%; } .hm-flare.f2 { left: 73%; }
  .hm-haze { position: absolute; left: 0; right: 0; top: 38%; height: 34%; background: linear-gradient(180deg, transparent, rgba(80,130,225,.13) 50%, transparent); }
  .hm-grain { position: absolute; inset: 0; opacity: .08; mix-blend-mode: overlay; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .hm-vignette { background: radial-gradient(95% 95% at 50% 42%, transparent 38%, rgba(0,0,0,.72)); }

  .hm-wrap { grid-template-columns: clamp(300px, 21.5vw, 400px) 1fr; padding-bottom: 36px; }
  .hm-side { gap: 7px; }
  .hm-item { padding-left: 18px; border-radius: 4px 16px 4px 16px; border-color: rgba(255,255,255,.08); background: linear-gradient(100deg, rgba(14,24,48,.74), rgba(6,10,22,.62));
    box-shadow: 0 6px 18px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05); }
  .hm-item svg { stroke-width: 1.9; }
  .hm-item:hover { border-color: rgba(245,184,0,.42); background: linear-gradient(100deg, rgba(245,184,0,.12), rgba(8,14,30,.7)); }
  .hm-item.on, .hm-item:focus-visible { border-color: rgba(245,184,0,.6); background: linear-gradient(100deg, rgba(245,184,0,.3), rgba(245,184,0,.08) 55%, rgba(6,10,22,.62));
    box-shadow: inset 4px 0 0 #F5B800, 0 0 0 1px rgba(245,184,0,.3), 0 16px 36px rgba(0,0,0,.55), -14px 0 44px -10px rgba(245,184,0,.5); }
  .hm-item.on .hm-ico::after { content: ''; position: absolute; inset: -6px; border-radius: 16px; border: 1px solid rgba(245,184,0,.55); animation: hmRing 2.2s ease-out infinite; pointer-events: none; }
  @keyframes hmRing { from { transform: scale(.88); opacity: .9; } to { transform: scale(1.18); opacity: 0; } }
  .hm-item.on .hm-ico { background: linear-gradient(160deg, #fff0a0, #F5B800 55%, #c98a00); }
  .hm-item.on small { opacity: .85; color: #ffe9a8; }
  .hm-sep { display: flex; align-items: center; gap: 12px; margin: 10px 4px 2px; font: 800 10px Inter, sans-serif; letter-spacing: 3.5px; color: rgba(255,255,255,.42); }
  .hm-sep::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(245,184,0,.45), transparent); }
  .hm-item.sec { padding-top: 8px; padding-bottom: 8px; gap: 12px; }
  .hm-item.sec .hm-ico { width: 34px; height: 34px; border-radius: 9px; }
  .hm-item.sec svg { width: 18px; height: 18px; }
  .hm-item.sec b { font-size: 12.5px; letter-spacing: 1.4px; }
  .hm-item.sec small { display: none; }

  .hm-banner { border: 1px solid rgba(245,184,0,.2); border-radius: 6px 40px 6px 40px; padding-left: clamp(52px, 5.4vw, 104px);
    background: linear-gradient(112deg, rgba(5,10,26,.9) 0%, rgba(8,16,38,.72) 50%, rgba(44,32,6,.5) 100%);
    box-shadow: 0 44px 100px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.09), inset 0 0 140px rgba(0,0,0,.4); }
  .hm-banner::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
    background: radial-gradient(52% 85% at 77% 44%, rgba(245,184,0,.2), transparent 70%), linear-gradient(180deg, rgba(255,255,255,.05), transparent 26%); }
  .hm-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 12.5px; letter-spacing: 4px; }
  .hm-eyebrow::after { content: ''; width: 72px; height: 1px; background: linear-gradient(90deg, #F5B800, transparent); margin-left: 8px; }
  .hm-copy { container-type: inline-size; }
  .hm-title { font-family: 'Bebas Neue', Inter, sans-serif; font-style: normal; font-weight: 400; font-size: min(clamp(64px, 7.2vw, 150px), 22cqw); line-height: .84; letter-spacing: .02em; margin: 12px 0 18px; text-shadow: 0 8px 36px rgba(0,0,0,.65); }
  .hm-title em { font-style: normal; background: linear-gradient(180deg, #fff4b0 0%, #F5B800 52%, #c98a00 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 26px rgba(245,184,0,.4)); }
  .hm-text { font-size: clamp(16px, 1.1vw, 19px); line-height: 1.65; opacity: .78; max-width: clamp(380px, 28vw, 520px); margin-bottom: 38px; }
  .hm-cta { gap: 18px; padding: 16px 20px 16px 52px; font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 34px; letter-spacing: 5px; clip-path: polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%);
    background: linear-gradient(180deg, #fff6bf 0%, #ffd84a 34%, #F5B800 62%, #cf9200 100%); box-shadow: inset 0 2px 0 rgba(255,255,255,.75), inset 0 -4px 0 rgba(120,70,0,.4); }
  .hm-cta svg { width: 46px; height: 46px; padding: 9px; border-radius: 50%; background: #1a1200; color: #ffd84a; box-shadow: 0 0 0 3px rgba(26,18,0,.25); }
  .hm-cta-wrap { margin-top: 2px; }
  .hm-sub { font-size: 12px; letter-spacing: 3px; opacity: .55; }

  .hm-hero { min-height: clamp(420px, 48vh, 680px); }
  .hm-tilt { width: min(100%, clamp(250px, 19vw, 380px)); }
  .hm-mark { -webkit-text-stroke: 2px rgba(245,184,0,.13); }
  .hm-halo { width: 92%; background: radial-gradient(circle, rgba(245,184,0,.46), rgba(245,184,0,.1) 45%, transparent 68%); }
  .hm-beam { display: block; position: absolute; z-index: 0; top: -22%; left: 50%; width: 150%; height: 128%; transform: translateX(-50%); pointer-events: none; mix-blend-mode: screen;
    background: conic-gradient(from 163deg at 50% 0, transparent 0, rgba(255,238,175,.34) 17deg, transparent 34deg, transparent 360deg); -webkit-mask-image: linear-gradient(180deg, #000 10%, transparent 82%); mask-image: linear-gradient(180deg, #000 10%, transparent 82%); }
  .hm-streaks { display: block; position: absolute; z-index: 0; inset: -14% -34%; pointer-events: none;
    background: repeating-linear-gradient(-64deg, transparent 0 58px, rgba(245,184,0,.2) 58px 59px, transparent 59px 138px), repeating-linear-gradient(-64deg, transparent 0 170px, rgba(255,230,140,.26) 170px 172px, transparent 172px 340px);
    -webkit-mask-image: radial-gradient(closest-side, #000 28%, transparent 100%); mask-image: radial-gradient(closest-side, #000 28%, transparent 100%); }
  .hm-floor { display: block; position: absolute; z-index: 0; left: 50%; bottom: 14px; width: 96%; height: 70px; transform: translateX(-50%); pointer-events: none; background: radial-gradient(closest-side, rgba(245,184,0,.34), transparent); }
  .hm-cap { color: #ffe27a; letter-spacing: 3px; font-size: 13px; }
  .hm-cap b { font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 34px; letter-spacing: 1px; vertical-align: -5px; }
}
.hm-lite .hm-cone, .hm-lite .hm-item.on .hm-ico::after, .hm-lite .hd-ping::after { animation: none !important; }
/* Modo otimizado: sem animações contínuas no menu */
.hm-lite .hm-banner::before, .hm-lite .hm-cta::before, .hm-lite .hm-cta-wrap::before, .hm-lite .hm-mark, .hm-lite .hm-halo, .hm-lite .hm-float, .hm-lite .hm-ground, .hm-lite .hm-spark, .hm-lite .hm-fc.c .hm-shine, .hm-lite .hm-dot { animation: none !important; }
.hm-lite .hm-spark { display: none; }
@media (prefers-reduced-motion: reduce) { .hm *, .hm *::before, .hm-leave { animation: none !important; transition: none !important; } }
`;

type HomeKey = 'play' | 'multi' | 'friends' | 'tour' | 'squad' | 'rank' | 'profile';

export function Home({
  isAdmin,
  onAdmin,
  onPlay,
  onMultiplayer,
  onTournament,
  onSquad,
  onProfile,
  onFriends,
  friendsOnline = 0,
  friendsPending = false,
  loggedIn,
  onLogin,
  onLeaderboard,
  nickname,
  featured,
  liveRooms = 0,
  offline = false,
  install,
  onSettings,
  onNews,
}: {
  isAdmin: boolean;
  onAdmin: () => void;
  onPlay: () => void;
  onMultiplayer: () => void;
  onTournament: () => void;
  onSquad: () => void;
  onProfile: () => void;
  onFriends: () => void;
  friendsOnline?: number;
  friendsPending?: boolean;
  loggedIn: boolean;
  onLogin: () => void;
  onLeaderboard: () => void;
  nickname: string;
  featured: Player[];
  liveRooms?: number;
  // Sem internet: só o que roda no aparelho (draft contra o bot e elenco) fica ativo
  onSettings?: () => void;
  onNews?: () => void;
  offline?: boolean;
  install?: { canInstall: boolean; needsIosSteps: boolean; install: () => Promise<void> };
}) {
  const lite = useLite();
  const desktop = useDesktop();
  const [sel, setSel] = useState<HomeKey>('play');
  const [iosHelp, setIosHelp] = useState(false);
  const newsUnseen = useNewsUnseen();
  const [leaving, setLeaving] = useState(false);
  const [idx, setIdx] = useState(0);
  const current = featured.length ? featured[idx % featured.length] : null;
  useEffect(() => {
    if (featured.length < 2) return;
    const id = window.setInterval(() => setIdx((v) => v + 1), 4200);
    return () => window.clearInterval(id);
  }, [featured.length]);
  const timer = useRef<number | null>(null);
  const bannerRef = useRef<HTMLElement | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const items: {
    key: HomeKey; label: string; sub: string; icon: JSX.Element; title: JSX.Element; text: string; cta: string;
    run: () => void; badge?: string; gold?: boolean; dot?: boolean;
  }[] = [
    { key: 'play', label: 'Jogar', sub: 'Draft contra o bot', icon: <Play size={22} />, run: onPlay, cta: 'Jogar agora',
      title: <>MONTE.<br /><em>CONQUISTE.</em></>, text: 'Escolha suas cartas, monte o time ideal e viva a intensidade do 7 contra 7.' },
    { key: 'multi', label: 'Multiplayer', sub: loggedIn ? 'Jogue online' : 'Precisa de conta', icon: <Swords size={22} />,
      run: loggedIn ? onMultiplayer : onLogin, cta: loggedIn ? 'Entrar em partidas' : 'Entrar na conta',
      badge: liveRooms > 0 ? `${liveRooms} AO VIVO` : loggedIn ? undefined : '🔒', dot: liveRooms > 0,
      title: <>FRENTE A<br /><em>FRENTE.</em></>, text: 'Crie uma sala, convide um amigo ou assista às partidas que estão rolando agora.' },
    { key: 'friends', label: 'Amigos', sub: loggedIn ? 'Convide e assista' : 'Precisa de conta', icon: <Users size={22} />,
      run: loggedIn ? onFriends : onLogin, cta: loggedIn ? 'Abrir amigos' : 'Entrar na conta',
      badge: friendsOnline > 0 ? `${friendsOnline} ONLINE` : loggedIn ? undefined : '🔒', dot: friendsOnline > 0 || friendsPending,
      title: <>JOGUE COM<br /><em>QUEM CURTE.</em></>, text: 'Adicione amigos pelo apelido, veja quem está online, convide para jogar ou assista à partida deles ao vivo.' },
    { key: 'tour', label: 'Torneios', sub: 'Competições e confrontos', icon: <Trophy size={22} />, run: onTournament, cta: 'Ver torneios',
      badge: loggedIn ? undefined : '🔒',
      title: <>RUMO À<br /><em>TAÇA.</em></>, text: 'Participe de competições, acompanhe seus próximos confrontos e dispute o título.' },
    { key: 'squad', label: 'Elenco', sub: 'Cartas, posições e overall', icon: <Database size={22} />, run: onSquad, cta: 'Abrir elenco',
      title: <>SUAS<br /><em>CARTAS.</em></>, text: 'Veja todos os jogadores, suas posições e o overall de cada carta.' },
    { key: 'rank', label: 'Classificação', sub: 'Melhores jogadores', icon: <Shield size={22} />, run: onLeaderboard, cta: 'Ver ranking',
      title: <>TOPO DO<br /><em>RANKING.</em></>, text: 'Os maiores vencedores do multiplayer. Vitória vale 3 pontos, empate vale 1.' },
    { key: 'profile', label: 'Perfil', sub: loggedIn ? nickname : 'Nível e estatísticas', icon: <CircleUserRound size={22} />, run: onProfile, cta: 'Ver meu perfil',
      dot: !loggedIn,
      title: <>SUA<br /><em>CARREIRA.</em></>, text: 'Nível, vitórias, derrotas e o seu histórico de partidas.' },
  ];
  if (offline) {
    for (const item of items) {
      if (item.key === 'multi' || item.key === 'friends' || item.key === 'tour' || item.key === 'rank' || item.key === 'profile') {
        item.sub = 'Precisa de internet';
        item.badge = '📡';
        item.dot = false;
        item.run = () => undefined;
        item.cta = 'Indisponível offline';
      }
    }
  }
  const cur = items.find((i) => i.key === sel) ?? items[0];

  const go = (run: () => void) => {
    if (leaving) return;
    setLeaving(true);
    timer.current = window.setTimeout(() => {
      run();
      setLeaving(false);
    }, 320);
  };

  const tilt = (e: React.MouseEvent<HTMLElement>) => {
    const el = bannerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(x * 22).toFixed(1)}deg`);
    el.style.setProperty('--rx', `${(-y * 18).toFixed(1)}deg`);
  };
  const untilt = () => {
    bannerRef.current?.style.setProperty('--ry', '0deg');
    bannerRef.current?.style.setProperty('--rx', '0deg');
  };

  return (
    <main className={`hm ${lite ? 'hm-lite' : ''}`}>
      <style>{homeCss}</style>
      <div className="hm-bg" aria-hidden="true">
        <div className="hm-shade" />
        <div className="hm-fx">
          <i className="hm-cone c1" />
          <i className="hm-cone c2" />
          <i className="hm-cone c3" />
          <i className="hm-cone c4" />
          <i className="hm-flare f1" />
          <i className="hm-flare f2" />
          <i className="hm-haze" />
          <i className="hm-grain" />
        </div>
        <div className="hm-vignette" />
      </div>
      <div className="hm-flash" aria-hidden="true" />
      {leaving && <div className="hm-leave" aria-hidden="true" />}
      <div className="hm-wrap">
        <nav className="hm-side" aria-label="Menu principal">
          {items.map((item) => (
            <button
              key={item.key}
              className={`hm-item ${sel === item.key ? 'on' : ''}`}
              onMouseEnter={() => setSel(item.key)}
              onFocus={() => setSel(item.key)}
              onClick={() => {
                setSel(item.key);
                go(item.run);
              }}
            >
              <span className="hm-ico">{item.icon}</span>
              <span>
                <b>{item.label}</b>
                <small>{item.sub}</small>
              </span>
              {item.badge && <span className={`hm-badge ${item.badge.includes('AO VIVO') ? '' : 'gold'}`}>{item.badge}</span>}
              {!item.badge && item.dot && <i className="hm-dot" />}
            </button>
          ))}
          <div className="hm-sep" aria-hidden="true">MAIS</div>
          {install && (install.canInstall || install.needsIosSteps) && (
            <button className="hm-item sec" onClick={() => (install.canInstall ? void install.install() : setIosHelp(true))}>
              <span className="hm-ico"><Download size={22} /></span>
              <span>
                <b>Instalar app</b>
                <small>Ícone na tela inicial</small>
              </span>
              <span className="hm-badge gold">GRÁTIS</span>
            </button>
          )}
          {onNews && (
            <button className="hm-item sec" onClick={onNews}>
              <span className="hm-ico"><Sparkles size={22} /></span>
              <span>
                <b>O que há de novo</b>
                <small>Novidades desta versão</small>
              </span>
              {newsUnseen && <span className="hm-badge gold">NOVO</span>}
            </button>
          )}
          {onSettings && (
            <button className="hm-item sec" onClick={onSettings}>
              <span className="hm-ico"><Settings size={22} /></span>
              <span>
                <b>Configurações</b>
                <small>Desempenho e notificações</small>
              </span>
            </button>
          )}
          {isAdmin && (
            <button className="hm-item sec" onClick={onAdmin}>
              <span className="hm-ico"><Shield size={22} /></span>
              <span>
                <b>Admin</b>
                <small>Editar jogadores</small>
              </span>
            </button>
          )}
        </nav>

        <section
          className="hm-banner"
          ref={bannerRef}
          onMouseMove={tilt}
          onMouseLeave={untilt}
        >
          <div className="hm-copy" key={cur.key}>
            <div className="hm-eyebrow">
              <Zap size={13} fill="currentColor" style={{ verticalAlign: -2 }} /> 7V7 BRASIL · ULTIMATE
            </div>
            <h1 className="hm-title">{cur.title}</h1>
            <p className="hm-text">{cur.text}</p>
            <div className="hm-cta-wrap">
              <button className="hm-cta" onClick={() => go(cur.run)}>
                {cur.cta} <ArrowRight size={28} />
              </button>
            </div>
            <div className="hm-sub">{cur.sub}</div>
            {!loggedIn && (
              <div className="hm-hint">
                🔒 Multiplayer e torneios pedem conta. <button onClick={onLogin}>Entrar ou criar conta</button>
              </div>
            )}
          </div>
          <div className="hm-hero">
            <div className="hm-mark" aria-hidden="true">7V7</div>
            <i className="hm-beam" aria-hidden="true" />
            <i className="hm-streaks" aria-hidden="true" />
            <div className="hm-halo" />
            <i className="hm-floor" aria-hidden="true" />
            <div className="hm-tilt">
              {featured.length > 0 ? (
                <div className="hm-fan">
                  {featured.map((pl, i) => {
                    const n = featured.length;
                    const off = (i - idx + n) % n;
                    const pos = off === 0 ? 'c' : off === 1 ? 'r' : off === n - 1 ? 'l' : 'x';
                    return (
                      <div className={`hm-fc ${pos}`} key={pl.id}>
                        <div className="hm-float">
                          <Card player={pl} fluid />
                          <i className="hm-shine" style={{ clipPath: SHIELD_CLIP }} />
                        </div>
                      </div>
                    );
                  })}
                  <i className="hm-ground" />
                </div>
              ) : (
                <LogoMark size={190} variant="full" />
              )}
              {current && (
                <div className="hm-cap" key={current.id}>
                  <b>{current.overall}</b> {current.name.toUpperCase()}
                  <span className="hm-capn"> · {positionNames[current.primary_position] ?? current.primary_position}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      {desktop && <HomeExtras featured={featured} loggedIn={loggedIn} offline={offline} onLeaderboard={onLeaderboard} onTournament={onTournament} onNews={onNews} />}
      {iosHelp && (
        <div className="hm-ios" role="dialog" aria-label="Como instalar no iPhone" onClick={() => setIosHelp(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <h3>Instalar no iPhone / iPad</h3>
            <ol>
              <li>Abra este site no <b>Safari</b>.</li>
              <li>Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
              <li>Escolha <b>Adicionar à Tela de Início</b>.</li>
              <li>Pronto: o 7v7 abre em tela cheia, e dá para jogar contra o bot sem internet.</li>
            </ol>
            <button onClick={() => setIosHelp(false)}>Entendi</button>
          </div>
        </div>
      )}
    </main>
  );
}

export function Feature({
  icon,
  number,
  title,
  text,
}: {
  icon: JSX.Element;
  number: string;
  title: string;
  text: string;
}) {
  return (
    <article className="feature">
      <div className="feature-number">{number}</div>
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

const clubCss = `
.cc { max-width: 980px; }
.cc .flow-heading { margin: 22px auto 22px; }
.cc .flow-heading .eyebrow { justify-content: center; letter-spacing: 4px; }
.cc .flow-heading h2 { font-style: italic; font-size: clamp(42px, 7vw, 68px); }
.cc-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 0 auto 22px; max-width: 760px; }
.cc-box { padding: 14px 16px 16px; }
.cc-box > b { display: block; margin-bottom: 8px; font-size: 11px; letter-spacing: 2.5px; color: #F5B800; font-weight: 900; }
.cc-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.1); }
.cc-seg button { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 11px 6px; border: 0; border-radius: 9px; background: transparent; color: #cfd6de; font-weight: 800; font-size: 13px; cursor: pointer; transition: background .2s, color .2s; }
.cc-seg button:hover { color: #fff; }
.cc-seg button.on { background: linear-gradient(180deg, #ffe27a, #F5B800); color: #1a1200; box-shadow: 0 4px 14px rgba(245,184,0,.35); }
.cc-test { display: flex; justify-content: center; margin: -8px 0 18px; }
.cc-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.cc-club { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 12px 18px; text-align: center; color: #fff; cursor: pointer;
  border-radius: 6px 22px 6px 22px; border: 1px solid rgba(255,255,255,.14);
  background: linear-gradient(180deg, color-mix(in srgb, var(--club) 45%, #0a1020), #0a1020 90%);
  transition: transform .3s cubic-bezier(.2,.8,.2,1), border-color .25s, box-shadow .3s; animation: ccIn .6s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i) * 60ms); }
.cc-club::before { content: ''; position: absolute; inset: 0; background: radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, var(--club) 70%, transparent), transparent 70%); opacity: .55; transition: opacity .3s; }
.cc-club::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.18) 50%, transparent 60%); transform: translateX(-130%); transition: transform .7s; }
.cc-club:hover { transform: translateY(-6px) scale(1.03); border-color: #F5B800; box-shadow: 0 18px 40px rgba(0,0,0,.55), 0 0 28px color-mix(in srgb, var(--club) 60%, transparent); }
.cc-club:hover::before { opacity: 1; } .cc-club:hover::after { transform: translateX(130%); }
.cc-club > * { position: relative; z-index: 1; }
.cc-club .cc-badge { transform: scale(1.35); margin: 8px 0 6px; filter: drop-shadow(0 8px 10px rgba(0,0,0,.55)); }
.cc-club h3 { margin: 0; font-size: 20px; font-style: italic; text-transform: uppercase; letter-spacing: .5px; line-height: 1.05; }
.cc-club p { margin: 0; font-size: 10px; letter-spacing: 2px; font-weight: 800; color: #F5B800; opacity: 0; transform: translateY(6px); transition: opacity .25s, transform .25s; }
.cc-club:hover p { opacity: 1; transform: none; }
@keyframes ccIn { from { opacity: 0; transform: translateY(22px) scale(.95); } to { opacity: 1; transform: none; } }
.cc-vs { display: flex; align-items: center; gap: 14px; justify-content: center; margin: 26px 0 8px; font-size: 11px; letter-spacing: 2px; opacity: .6; font-weight: 800; }
.cc-vs i { flex: 1; max-width: 120px; height: 1px; background: rgba(255,255,255,.25); } .cc-vs strong { color: #F5B800; font-size: 18px; font-style: italic; }
@media (max-width: 860px) { .cc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cc-opts { grid-template-columns: 1fr; } }
@media (max-width: 420px) { .cc-club { padding: 18px 8px 14px; } .cc-club h3 { font-size: 17px; } .cc-vs span { font-size: 9px; } }
@media (prefers-reduced-motion: reduce) { .cc-club, .cc-club::after { animation: none !important; transition: none !important; } }
`;

export function ClubChoice({
  teams,
  mode,
  onMode,
  onBack,
  onChoose,
  showTestTools,
  forceShootout,
  onForceShootout,
  botLevel,
  onBotLevel,
}: {
  teams: Team[];
  mode: 'classic' | 'dice';
  onMode: (mode: 'classic' | 'dice') => void;
  onBack: () => void;
  onChoose: (team: Team) => void;
  showTestTools: boolean;
  forceShootout: boolean;
  onForceShootout: (value: boolean) => void;
  botLevel: 1 | 3 | 5;
  onBotLevel: (value: 1 | 3 | 5) => void;
}) {
  return (
    <main className="flow-page cc">
      <style>{stadiumCss}</style>
      <style>{clubCss}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="flow-heading">
        <div className="eyebrow">ETAPA 01 / 03</div>
        <h2>
          ESCOLHA SEU <em>CLUBE</em>
        </h2>
        <p>Suas cores. Sua identidade. O rival será controlado pelo bot.</p>
      </div>
      <div className="cc-opts">
        <div className="cc-box glass-card">
          <b>MODO DO DRAFT</b>
          <div className="cc-seg">
            <button className={mode === 'classic' ? 'on' : ''} onClick={() => onMode('classic')}>
              Draft clássico
            </button>
            <button className={mode === 'dice' ? 'on' : ''} onClick={() => onMode('dice')}>
              <span aria-hidden="true">🎲</span> Modo Dado
            </button>
          </div>
        </div>
        <div className="cc-box glass-card">
          <b>DIFICULDADE DO BOT</b>
          <div className="cc-seg">
            {([[1, 'Fácil'], [3, 'Normal'], [5, 'Difícil']] as const).map(([level, label]) => (
              <button key={level} className={botLevel === level ? 'on' : ''} onClick={() => onBotLevel(level)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {showTestTools && (
        <div className="cc-test">
          <button className={forceShootout ? 'gold-button' : 'outline-button'} onClick={() => onForceShootout(!forceShootout)}>
            <span aria-hidden="true">🧪</span> Teste: forçar pênaltis contra o bot {forceShootout ? '(LIGADO)' : '(desligado)'}
          </button>
        </div>
      )}
      <div className="cc-grid">
        {teams.map((team, index) => (
          <button
            className="cc-club"
            key={team.id}
            onClick={() => onChoose(team)}
            style={{ '--club': team.primary_color, '--i': index } as React.CSSProperties}
          >
            <span className="cc-badge">
              <Badge team={team} />
            </span>
            <h3>{team.name}</h3>
            <p>REPRESENTAR ›</p>
          </button>
        ))}
      </div>
      <div className="cc-vs">
        <span>VOCÊ ESCOLHE</span>
        <i /> <strong>VS</strong> <i />
        <span>O BOT JOGA PELO RIVAL</span>
      </div>
    </main>
  );
}
