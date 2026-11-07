import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleUserRound, Database, Menu, Play, RefreshCw, Shield, Swords, Trophy, X, Zap } from 'lucide-react';
import { positionNames, type Player, type Team } from '@/lib/game/types';
import { Badge, Card, LogoMark } from '@/components/game/Card';

export function Header({
  nickname,
  isAdmin,
  onAdmin,
  onHome,
  onLeaderboard,
  onSquad,
  onLogin,
}: {
  nickname: string;
  isAdmin: boolean;
  onAdmin: () => void;
  onHome: () => void;
  onLeaderboard: () => void;
  onSquad: () => void;
  onLogin: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (action: () => void) => {
    setMenuOpen(false);
    action();
  };
  return (
    <header className="topbar" style={{ position: 'relative' }}>
      <style>{`
        .m-menu { position: absolute; top: 100%; right: 8px; z-index: 50; min-width: 200px; display: grid; gap: 4px; }
        .m-menu { padding: 8px; border-radius: 14px; background: #0d131a; border: 1px solid rgba(255,255,255,.14); }
        .m-menu { box-shadow: 0 14px 30px rgba(0,0,0,.6); }
        .m-menu button { padding: 12px 14px; border: 0; border-radius: 10px; background: transparent; }
        .m-menu button { color: #fff; font-weight: 700; text-align: left; font-size: 15px; cursor: pointer; }
        .m-menu button:hover { background: rgba(245,184,0,.12); }
        @media (min-width: 721px) { .m-menu { display: none; } }
      `}</style>
      <button className="brand" onClick={onHome}>
        <LogoMark size={52} variant="full" />
        <span>
          <b>BRASIL</b>
        </span>
      </button>
      <nav>
        <button onClick={onSquad}>Cartas</button>
        <button onClick={onLeaderboard}>Leaderboard</button>
      </nav>
      <button className="profile-button" onClick={onLogin}>
        <CircleUserRound size={17} /> {nickname}
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
          <button onClick={() => go(onHome)}>Início</button>
          <button onClick={() => go(onSquad)}>Cartas</button>
          <button onClick={() => go(onLeaderboard)}>Leaderboard</button>
        </div>
      )}
    </header>
  );
}

const homeCss = `
.hm { position: relative; min-height: calc(100vh - 78px); overflow: hidden; isolation: isolate; color: #fff; }
.hm-bg { position: absolute; inset: 0; z-index: -1; background:
  radial-gradient(120% 70% at 50% 0%, #1b2a44 0%, #0a1020 55%, #05070d 100%); }
.hm-beam { position: absolute; top: -12%; width: 38%; height: 120%; transform-origin: 50% 0; mix-blend-mode: screen; filter: blur(10px);
  background: linear-gradient(180deg, rgba(255,246,200,.55), rgba(255,246,200,.08) 55%, transparent 80%);
  clip-path: polygon(46% 0, 54% 0, 100% 100%, 0 100%); opacity: .55; animation: hmSway 9s ease-in-out infinite alternate; }
.hm-beam.b1 { left: -6%; --r: -18deg; } .hm-beam.b2 { left: 18%; --r: -6deg; animation-delay: -3s; }
.hm-beam.b3 { right: 18%; --r: 6deg; animation-delay: -5s; } .hm-beam.b4 { right: -6%; --r: 18deg; animation-delay: -7s; }
@keyframes hmSway { from { transform: rotate(calc(var(--r) - 5deg)); opacity: .35; } to { transform: rotate(calc(var(--r) + 5deg)); opacity: .7; } }
.hm-crowd { position: absolute; left: 0; right: 0; bottom: 30%; height: 22%; opacity: .5; filter: blur(1.2px);
  background:
   radial-gradient(circle, rgba(255,255,255,.55) 0 1.2px, transparent 1.6px) 0 0 / 14px 11px,
   radial-gradient(circle, rgba(245,184,0,.5) 0 1px, transparent 1.5px) 7px 5px / 19px 13px;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 60%, transparent); mask-image: linear-gradient(180deg, transparent, #000 60%, transparent);
  animation: hmCrowd 3.5s ease-in-out infinite alternate; }
@keyframes hmCrowd { from { opacity: .3; } to { opacity: .6; } }
.hm-pitch { position: absolute; left: -20%; right: -20%; bottom: -8%; height: 46%; transform: perspective(500px) rotateX(58deg); transform-origin: 50% 100%;
  background: repeating-linear-gradient(90deg, #0f4d2b 0 8%, #12582f 8% 16%); opacity: .75;
  -webkit-mask-image: linear-gradient(0deg, #000 30%, transparent); mask-image: linear-gradient(0deg, #000 30%, transparent); }
.hm-pitch::after { content: ''; position: absolute; inset: 8% 14%; border: 2px solid rgba(255,255,255,.28); border-radius: 4px; }
.hm-vignette { position: absolute; inset: 0; background: radial-gradient(90% 90% at 50% 45%, transparent 40%, rgba(0,0,0,.65)); pointer-events: none; }

.hm-wrap > * { min-width: 0; }
.hm-wrap { display: grid; grid-template-columns: 270px 1fr; gap: 28px; max-width: 1180px; margin: 0 auto; padding: 28px 20px 40px; align-items: stretch; }
.hm-side { display: grid; gap: 8px; align-content: start; animation: hmSlide .6s cubic-bezier(.2,.8,.2,1) both; }
@keyframes hmSlide { from { opacity: 0; transform: translateX(-26px); } to { opacity: 1; transform: none; } }
.hm-item { position: relative; display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 6px 16px 6px 16px; border: 1px solid rgba(255,255,255,.1);
  background: linear-gradient(100deg, rgba(255,255,255,.07), rgba(255,255,255,.02)); color: #fff; text-align: left; cursor: pointer; backdrop-filter: blur(6px);
  transition: transform .25s cubic-bezier(.2,.8,.2,1), background .25s, border-color .25s, box-shadow .25s; animation: hmSlide .6s cubic-bezier(.2,.8,.2,1) both; }
.hm-item:nth-child(2) { animation-delay: .05s; } .hm-item:nth-child(3) { animation-delay: .1s; } .hm-item:nth-child(4) { animation-delay: .15s; }
.hm-item:nth-child(5) { animation-delay: .2s; } .hm-item:nth-child(6) { animation-delay: .25s; }
.hm-item svg { flex: none; opacity: .85; }
.hm-item b { display: block; font-size: 15px; letter-spacing: 1.6px; font-weight: 900; text-transform: uppercase; }
.hm-item small { display: block; font-size: 11px; opacity: .6; margin-top: 2px; }
.hm-item.on, .hm-item:hover, .hm-item:focus-visible { transform: translateX(8px); outline: none; border-color: rgba(245,184,0,.75);
  background: linear-gradient(100deg, rgba(245,184,0,.28), rgba(245,184,0,.05)); box-shadow: 0 10px 28px rgba(0,0,0,.45), inset 3px 0 0 #F5B800; }
.hm-item.on svg, .hm-item:hover svg { color: #F5B800; opacity: 1; }
.hm-badge { margin-left: auto; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 900; letter-spacing: .8px; background: #ef4444; color: #fff; white-space: nowrap; }
.hm-badge.gold { background: #F5B800; color: #1a1200; }
.hm-dot { position: absolute; top: 9px; right: 9px; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 0 rgba(239,68,68,.7); animation: hmPing 1.6s infinite; }
@keyframes hmPing { 70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }

.hm-banner { position: relative; min-height: 460px; border-radius: 22px; overflow: hidden; padding: 38px 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center;
  border: 1px solid rgba(255,255,255,.14); background: linear-gradient(120deg, rgba(10,16,32,.78), rgba(245,184,0,.1)); backdrop-filter: blur(4px);
  box-shadow: 0 30px 70px rgba(0,0,0,.55); animation: hmRise .7s cubic-bezier(.2,.8,.2,1) both; perspective: 900px; }
@keyframes hmRise { from { opacity: 0; transform: translateY(24px) scale(.98); } to { opacity: 1; transform: none; } }
.hm-banner::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.1) 48%, transparent 60%); transform: translateX(-120%); animation: hmShine 6s 1.2s infinite; }
@keyframes hmShine { to { transform: translateX(120%); } }
.hm-copy { position: relative; z-index: 2; }
.hm-copy > * { animation: hmFade .45s ease both; }
@keyframes hmFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.hm-eyebrow { font-size: 12px; font-weight: 900; letter-spacing: 3px; color: #F5B800; }
.hm-title { margin: 8px 0 10px; font-size: clamp(44px, 6vw, 76px); line-height: .92; font-weight: 900; font-style: italic; letter-spacing: -1px; text-transform: uppercase; }
.hm-title em { color: #F5B800; font-style: italic; }
.hm-text { max-width: 420px; margin: 0 0 22px; font-size: 16px; line-height: 1.5; opacity: .82; }
.hm-cta { display: inline-flex; align-items: center; gap: 12px; padding: 18px 40px; border: 0; cursor: pointer; font-weight: 900; font-size: 20px; letter-spacing: 3px; text-transform: uppercase;
  color: #1a1200; background: linear-gradient(180deg, #ffe27a, #F5B800 60%, #d99a00); clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  box-shadow: 0 0 40px rgba(245,184,0,.45); transition: transform .2s, filter .2s; animation: hmFade .45s ease both, hmGlow 2.4s 1s ease-in-out infinite; }
.hm-cta:hover { transform: translateY(-3px) scale(1.04); filter: brightness(1.1); }
@keyframes hmGlow { 50% { filter: drop-shadow(0 0 18px rgba(245,184,0,.7)); } }
.hm-hint { margin-top: 14px; font-size: 13px; opacity: .75; }
.hm-hint button { background: none; border: 0; color: #F5B800; font-weight: 800; cursor: pointer; padding: 0; text-decoration: underline; }

.hm-hero { position: relative; z-index: 1; display: grid; place-items: center; min-height: 340px; padding-bottom: 28px; }
.hm-halo { position: absolute; width: 78%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, rgba(245,184,0,.5), transparent 68%); filter: blur(8px); animation: hmHalo 4s ease-in-out infinite alternate; }
@keyframes hmHalo { from { transform: scale(.9); opacity: .6; } to { transform: scale(1.08); opacity: 1; } }
.hm-tilt { position: relative; width: min(100%, 250px); transform-style: preserve-3d; transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .15s ease-out; }
.hm-float { animation: hmFloat 5s ease-in-out infinite; transform-style: preserve-3d; }
@keyframes hmFloat { 50% { transform: translateY(-12px); } }
.hm-float > * { filter: drop-shadow(0 28px 22px rgba(0,0,0,.65)) drop-shadow(0 0 22px rgba(245,184,0,.35)); }
.hm-capn { }
.hm-cap { position: absolute; left: 0; right: 0; bottom: -30px; text-align: center; font-size: 11px; font-weight: 900; letter-spacing: 2px; color: #F5B800; text-shadow: 0 2px 8px #000; }

.hm-spark { position: absolute; bottom: -10px; border-radius: 50%; background: #ffd24a; box-shadow: 0 0 8px 2px rgba(255,200,40,.8); opacity: 0; animation: hmSpark linear infinite; }
@keyframes hmSpark { 0% { transform: translate(0,0); opacity: 0; } 12% { opacity: .9; } 100% { transform: translate(40px,-95vh); opacity: 0; } }
.hm-flash { position: absolute; inset: 0; z-index: 5; pointer-events: none; background: radial-gradient(circle at 50% 40%, #fff 0, rgba(255,230,140,.9) 25%, transparent 70%); opacity: 0; animation: hmFlash 1.1s .1s ease-out both; }
@keyframes hmFlash { 0% { opacity: 1; } 100% { opacity: 0; } }
.hm-title { animation: hmSlam .75s cubic-bezier(.2,1.4,.3,1) both !important; }
@keyframes hmSlam { 0% { opacity: 0; transform: scale(1.7) translateY(-14px); filter: blur(10px); } 100% { opacity: 1; transform: none; filter: none; } }
.hm-mark { position: absolute; z-index: 0; right: -4%; top: 50%; transform: translateY(-52%); font-size: clamp(180px, 26vw, 360px); line-height: 1; font-weight: 900; font-style: italic; letter-spacing: -8px;
  color: transparent; -webkit-text-stroke: 2px rgba(245,184,0,.22); text-shadow: 0 0 60px rgba(245,184,0,.12); animation: hmDrift 8s ease-in-out infinite alternate; pointer-events: none; user-select: none; }
@keyframes hmDrift { from { transform: translate(-14px,-52%); } to { transform: translate(14px,-52%); } }
.hm-fan { position: relative; width: 100%; aspect-ratio: .74; margin: 0 auto; transform-style: preserve-3d; }
.hm-fc { position: absolute; inset: 0; transition: transform .8s cubic-bezier(.2,.8,.2,1), opacity .8s, filter .8s; }
.hm-fc.c { z-index: 3; transform: translateZ(40px) scale(1.12); }
.hm-fc.l { z-index: 1; transform: translateX(-56%) translateZ(-60px) rotate(-9deg) scale(.76); opacity: .7; filter: brightness(.55) saturate(.8); }
.hm-fc.r { z-index: 1; transform: translateX(56%) translateZ(-60px) rotate(9deg) scale(.76); opacity: .7; filter: brightness(.55) saturate(.8); }
.hm-fc.x { z-index: 0; transform: translateZ(-120px) scale(.5); opacity: 0; }
.hm-fc:not(.c) .hm-float { animation: none; }
.hm-tilt { width: min(100%, 200px); }
.hm-cap { bottom: -34px; font-size: 13px; }
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
  .hm-hero { padding-bottom: 44px; }
  .hm-cap b { font-size: 20px; }
  .hm-halo { width: 150%; }
  .hm-capn { display: none; }
  .hm-cap { bottom: -36px; font-size: 11px; letter-spacing: 1.5px; }
  .hm-eyebrow { font-size: 10px; letter-spacing: 2.5px; }
  .hm-title { font-size: 46px; margin: 6px 0 8px; }
  .hm-text { font-size: 13.5px; line-height: 1.45; margin: 0 auto 16px; max-width: 300px; }
  .hm-cta { width: 100%; justify-content: center; padding: 16px 20px; font-size: 18px; letter-spacing: 2.5px; }
  .hm-hint { font-size: 12px; margin-top: 12px; }
  .hm-side { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; animation: none; }
  .hm-item { flex-direction: column; justify-content: center; gap: 6px; padding: 14px 4px 12px; min-width: 0; text-align: center; border-radius: 16px; min-height: 84px;
    background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); }
  .hm-item svg { width: 26px; height: 26px; }
  .hm-item b { font-size: 11px; letter-spacing: .8px; }
  .hm-item small { display: none; }
  .hm-item.on { transform: none; border-color: #F5B800; box-shadow: 0 0 0 1px #F5B800, 0 8px 22px rgba(245,184,0,.25); background: linear-gradient(180deg, rgba(245,184,0,.32), rgba(245,184,0,.06)); }
  .hm-item:hover { transform: none; }
  .hm-item.on svg { color: #F5B800; }
  .hm-badge { position: absolute; top: -7px; left: 50%; right: auto; transform: translateX(-50%); margin: 0; font-size: 9px; padding: 2px 7px; }
  .hm-dot { top: 8px; right: 10px; }
}
@media (prefers-reduced-motion: reduce) { .hm *, .hm *::before, .hm-leave { animation: none !important; transition: none !important; } }
`;

type HomeKey = 'play' | 'multi' | 'tour' | 'squad' | 'rank' | 'profile';

export function Home({
  isAdmin,
  onAdmin,
  onPlay,
  onMultiplayer,
  onTournament,
  onSquad,
  onProfile,
  loggedIn,
  onLogin,
  onLeaderboard,
  nickname,
  featured,
  liveRooms = 0,
}: {
  isAdmin: boolean;
  onAdmin: () => void;
  onPlay: () => void;
  onMultiplayer: () => void;
  onTournament: () => void;
  onSquad: () => void;
  onProfile: () => void;
  loggedIn: boolean;
  onLogin: () => void;
  onLeaderboard: () => void;
  nickname: string;
  featured: Player[];
  liveRooms?: number;
}) {
  const [sel, setSel] = useState<HomeKey>('play');
  const [leaving, setLeaving] = useState(false);
  const [idx, setIdx] = useState(0);
  const current = featured.length ? featured[idx % featured.length] : null;
  const sparks = useMemo(
    () => Array.from({ length: 22 }, (_, i) => ({ l: (i * 47) % 100, d: (i * 0.73) % 7, t: 6 + ((i * 13) % 7), s: 2 + (i % 3) })),
    [],
  );
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
    { key: 'multi', label: 'Multiplayer', sub: loggedIn ? 'Enfrente outros jogadores' : 'Entre para jogar online', icon: <Swords size={22} />,
      run: loggedIn ? onMultiplayer : onLogin, cta: loggedIn ? 'Entrar em partidas' : 'Entrar na conta',
      badge: liveRooms > 0 ? `${liveRooms} AO VIVO` : loggedIn ? undefined : '🔒', dot: liveRooms > 0,
      title: <>FRENTE A<br /><em>FRENTE.</em></>, text: 'Crie uma sala, convide um amigo ou assista às partidas que estão rolando agora.' },
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
    <main className="hm">
      <style>{homeCss}</style>
      <div className="hm-bg" aria-hidden="true">
        <i className="hm-beam b1" /><i className="hm-beam b2" /><i className="hm-beam b3" /><i className="hm-beam b4" />
        <div className="hm-crowd" />
        <div className="hm-pitch" />
        {sparks.map((k, i) => (
          <i key={i} className="hm-spark" style={{ left: `${k.l}%`, width: k.s, height: k.s, animationDelay: `-${k.d}s`, animationDuration: `${k.t}s` }} />
        ))}
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
              {item.icon}
              <span>
                <b>{item.label}</b>
                <small>{item.sub}</small>
              </span>
              {item.badge && <span className={`hm-badge ${item.badge.includes('AO VIVO') ? '' : 'gold'}`}>{item.badge}</span>}
              {!item.badge && item.dot && <i className="hm-dot" />}
            </button>
          ))}
          {isAdmin && (
            <button className="hm-item" onClick={onAdmin}>
              <Shield size={22} />
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
            <button className="hm-cta" onClick={() => go(cur.run)}>
              {cur.cta} <ArrowRight size={22} />
            </button>
            {!loggedIn && (
              <div className="hm-hint">
                🔒 Multiplayer e torneios pedem conta. <button onClick={onLogin}>Entrar ou criar conta</button>
              </div>
            )}
          </div>
          <div className="hm-hero">
            <div className="hm-mark" aria-hidden="true">7V7</div>
            <div className="hm-halo" />
            <div className="hm-tilt">
              {featured.length > 0 ? (
                <div className="hm-fan">
                  {featured.map((pl, i) => {
                    const n = featured.length;
                    const off = (i - idx + n) % n;
                    const pos = off === 0 ? 'c' : off === 1 ? 'r' : off === n - 1 ? 'l' : 'x';
                    return (
                      <div className={`hm-fc ${pos}`} key={pl.id}>
                        <div className="hm-float"><Card player={pl} fluid /></div>
                      </div>
                    );
                  })}
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
    <main className="flow-page">
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
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', margin: '0 0 20px' }}>
        <button
          className={mode === 'classic' ? 'gold-button' : 'outline-button'}
          onClick={() => onMode('classic')}
        >
          Draft clássico
        </button>
        <button
          className={mode === 'dice' ? 'gold-button' : 'outline-button'}
          onClick={() => onMode('dice')}
        >
          <span aria-hidden="true">🎲</span> Modo Dado
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', margin: '0 0 20px' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: '#F5B800' }}>BOT</span>
        {([[1, 'Fácil'], [3, 'Normal'], [5, 'Difícil']] as const).map(([level, label]) => (
          <button
            key={level}
            className={botLevel === level ? 'gold-button' : 'outline-button'}
            onClick={() => onBotLevel(level)}
          >
            {label}
          </button>
        ))}
      </div>
      {showTestTools && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '-6px 0 20px' }}>
          <button
            className={forceShootout ? 'gold-button' : 'outline-button'}
            onClick={() => onForceShootout(!forceShootout)}
          >
            <span aria-hidden="true">🧪</span> Teste: forçar pênaltis contra o bot {forceShootout ? '(LIGADO)' : '(desligado)'}
          </button>
        </div>
      )}
      <div className="club-grid">
        {teams.map((team) => (
          <button
            className="club-card"
            key={team.id}
            onClick={() => onChoose(team)}
            style={{ '--club': team.primary_color } as React.CSSProperties}
          >
            <div className="club-card-bg" />
            <Badge team={team} />
            <div>
              <h3>{team.name}</h3>
              <p>Representar este clube</p>
            </div>
            <ArrowRight />
          </button>
        ))}
      </div>
      <div className="versus-line">
        <span>VOCÊ ESCOLHE</span>
        <i /> <strong>VS</strong> <i />
        <span>O BOT JOGA PELO RIVAL</span>
      </div>
    </main>
  );
}
