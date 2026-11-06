import { useState } from 'react';
import { ArrowLeft, ArrowRight, CircleUserRound, Database, Menu, Play, RefreshCw, Shield, Swords, Trophy, X, Zap } from 'lucide-react';
import { type Team } from '@/lib/game/types';
import { Badge, LogoMark } from '@/components/game/Card';

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

export function Home({
  isAdmin,
  onAdmin,
  onPlay,
  onMultiplayer,
  loggedIn,
  onLogin,
  onLeaderboard,
}: {
  isAdmin: boolean;
  onAdmin: () => void;
  onPlay: () => void;
  onMultiplayer: () => void;
  loggedIn: boolean;
  onLogin: () => void;
  onLeaderboard: () => void;
}) {
  return (
    <main className="home-page">
      <div className="hero-glow" />
      <section className="hero">
        <div className="eyebrow">
          <Zap size={14} fill="currentColor" /> FEDERAÇÃO BRASILEIRA FS 7V7
        </div>
        <h1>
          MONTE. SIMULE.
          <br />
          <em>CONQUISTE.</em>
        </h1>
        <p>Escolha suas cartas, monte um time equilibrado e viva a intensidade do futebol 7 contra 7.</p>
        <div className="hero-actions">
          <button className="gold-button large" onClick={onPlay}>
            <Play size={17} fill="currentColor" /> Jogar vs Bots
          </button>
          <button
            className="outline-button large"
            onClick={onMultiplayer}
            disabled={!loggedIn}
            aria-disabled={!loggedIn}
            title={loggedIn ? undefined : 'Entre na sua conta para jogar online'}
            style={loggedIn ? undefined : { opacity: 0.6, cursor: 'not-allowed' }}
          >
            <Swords size={17} /> Multiplayer <small>{loggedIn ? 'NOVO' : 'PRECISA DE CONTA'}</small>
          </button>
        </div>
        {!loggedIn && (
          <p style={{ margin: '12px 0 0', fontSize: 14, opacity: 0.85 }}>
            🔒 O multiplayer é só para quem tem conta.{' '}
            <button className="text-button" onClick={onLogin} style={{ display: 'inline', padding: 0 }}>
              Entrar ou criar conta
            </button>
          </p>
        )}
        {isAdmin && (
          <button className="outline-button" onClick={onAdmin} style={{ marginTop: 14 }}>
            <Shield size={16} /> Painel Admin: editar e adicionar jogadores
          </button>
        )}
      </section>
      <section className="feature-row">
        <Feature
          icon={<Database />}
          number="01"
          title="DRAFT ESTRATÉGICO"
          text="Escolha uma carta para cada posição. Nenhum jogador se repete."
        />
        <Feature
          icon={<RefreshCw />}
          number="02"
          title="SIMULAÇÃO VIVA"
          text="Acompanhe cada posse, finalização, defesa e gol em tempo real."
        />
        <Feature
          icon={<Trophy />}
          number="03"
          title="SUBA NO RANKING"
          text="Vença partidas, prove seu valor e se torne o maior vencedor."
        />
      </section>
      <div className="home-footer">
        <span>
          FLU <i /> SAN
        </span>
        <b>JOGO OFICIAL DA FEDERAÇÃO</b>
        <span>
          7V7 <i /> BRASIL
        </span>
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
