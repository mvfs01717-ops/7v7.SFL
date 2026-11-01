import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, ChevronDown, CircleUserRound, Crown, Database, Filter, Flame,
  Goal, LogIn, Menu, Play, RefreshCw, Search, Shield, SkipForward, Swords, Trophy, UserRound,
  Users, X, Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AdminScreen from '@/components/AdminScreen';
import MatchPitch from '@/components/MatchPitch';

type Position = 'GK' | 'LB' | 'RB' | 'CM' | 'LF' | 'RF' | 'CF';
type Screen = 'home' | 'club' | 'draft' | 'match' | 'results' | 'leaderboard' | 'squad' | 'admin';
type Team = { id: string; name: string; abbreviation: string; primary_color: string; secondary_color: string };
type Player = {
  id: string;
  name: string;
  overall: number;
  primary_position: Position;
  alternate_positions: Position[];
  team_id: string;
  image_url?: string | null;
  team?: Team;
};
type MatchEvent = {
  id: number;
  minute: number;
  type: 'posse' | 'finalização' | 'defesa' | 'gol';
  text: string;
  team: 'user' | 'bot';
};
type MatchStats = {
  userPossession: number;
  botPossession: number;
  userShots: number;
  botShots: number;
  userTarget: number;
  botTarget: number;
  userSaves: number;
  botSaves: number;
};

const positions: Position[] = ['GK', 'LB', 'RB', 'CM', 'LF', 'RF', 'CF'];
const positionNames: Record<Position, string> = {
  GK: 'Goleiro',
  LB: 'Lateral-esquerdo',
  RB: 'Lateral-direito',
  CM: 'Meio-campista',
  LF: 'Atacante esquerdo',
  RF: 'Atacante direito',
  CF: 'Centroavante',
};
const positionShort: Record<Position, string> = {
  GK: 'GK', LB: 'LB', RB: 'RB', CM: 'CM', LF: 'LF', RF: 'RF', CF: 'CF',
};

const emptyStats: MatchStats = {
  userPossession: 50,
  botPossession: 50,
  userShots: 0,
  botShots: 0,
  userTarget: 0,
  botTarget: 0,
  userSaves: 0,
  botSaves: 0,
};

function average(players: Player[]) {
  return players.length
    ? Math.round(players.reduce((sum, player) => sum + player.overall, 0) / players.length)
    : 0;
}
function colorForOverall(overall: number) {
  return overall >= 90 ? 'special' : overall >= 75 ? 'gold' : overall >= 65 ? 'silver' : 'bronze';
}
function getPlayerPositions(player: Player) {
  return [player.primary_position, ...(player.alternate_positions ?? [])];
}

function Card({
  player,
  selected,
  onClick,
  compact = false,
}: {
  player: Player;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  // Se o jogador tem a imagem da carta, mostra ela dentro de uma moldura
  if (player.image_url) {
    const frames = { special: '#F5B800', gold: '#d4a63a', silver: '#bcc3cd', bronze: '#b8743f' };
    const frame = frames[colorForOverall(player.overall) as keyof typeof frames];
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        style={{
          width: compact ? 150 : 176,
          aspectRatio: '0.62',
          padding: 6,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `2px solid ${frame}`,
          borderRadius: 14,
          background: 'linear-gradient(160deg, rgba(245,184,0,.16), rgba(10,14,20,.95) 60%)',
          boxShadow: selected ? `0 0 0 2px ${frame}, 0 0 20px rgba(245,184,0,.55)` : 'none',
          cursor: onClick ? 'pointer' : 'default',
          overflow: 'hidden',
        }}
      >
        <img
          src={player.image_url}
          alt={`${player.name}, overall ${player.overall}`}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </button>
    );
  }
  const tone = colorForOverall(player.overall);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`player-card ${tone} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}
    >
      <div className="card-top">
        <span>{player.overall}</span>
        <span className="card-position">{player.primary_position}</span>
      </div>
      <div className="player-avatar">{player.name.slice(0, 1).toUpperCase()}</div>
      <strong>{player.name}</strong>
      <small>{player.team?.abbreviation ?? '7V7'}</small>
      <div className="card-alternates">
        {player.alternate_positions.length
          ? player.alternate_positions.join(' · ')
          : positionNames[player.primary_position]}
      </div>
    </button>
  );
}

function LogoMark({ size = 40, variant = 'seven' }: { size?: number; uid?: string; variant?: 'seven' | 'full' }) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="7v7 Brasil"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polygon points="66,66 446,66 386,446 126,446" fill="#F5B800" />
      {variant === 'full' ? (
        <g fill="#0B1016" transform="translate(256 255) scale(1.12) translate(-256 -255)">
          <polygon points="132,160 202,160 202,184 170,350 138,350 168,184 132,184" />
          <polygon points="214,160 242,160 256,288 270,160 298,160 282,350 230,350" />
          <polygon points="310,160 380,160 380,184 348,350 316,350 346,184 310,184" />
        </g>
      ) : (
        <polygon points="196,135 316,135 316,163 244,385 206,385 276,163 196,163" fill="#0B1016" />
      )}
    </svg>
  );
}

function Badge({ team }: { team: Team }) {
  return (
    <div
      className="club-badge"
      style={{
        background: team.primary_color,
        borderColor: team.secondary_color,
        color: team.secondary_color === '#F4F4F0' ? '#11161c' : '#fff',
      }}
    >
      {team.abbreviation}
    </div>
  );
}

function TeamMark({ team }: { team: Team }) {
  return (
    <div className="team-mark">
      <Badge team={team} />
      <span>{team.name}</span>
    </div>
  );
}

function App() {
  const initialScreen: Screen = window.location.pathname === '/admin' ? 'admin' : 'home';
  const [screen, setScreenState] = useState<Screen>(initialScreen);
  const baseScreen = useRef<Screen>(initialScreen);
  const clubRef = useRef<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedClub, setSelectedClub] = useState<Team | null>(null);
  clubRef.current = selectedClub;
  const [draft, setDraft] = useState<Partial<Record<Position, Player>>>({});
  const [draftPosition, setDraftPosition] = useState<Position>('GK');
  const [mode, setMode] = useState<'classic' | 'dice'>('classic');
  const [botTeam, setBotTeam] = useState<Player[]>([]);
  const [userTeam, setUserTeam] = useState<Player[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [minute, setMinute] = useState(0);
  const [score, setScore] = useState({ user: 0, bot: 0 });
  const [stats, setStats] = useState<MatchStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState('Visitante');
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  // Placar mostrado na tela: só sobe quando a bola entra no gol na animação
  const [shownScore, setShownScore] = useState({ user: 0, bot: 0 });
  const [shownGoalIds, setShownGoalIds] = useState<number[]>([]);
  const [skipped, setSkipped] = useState(false);
  const eventSeq = useRef(0);
  const shownRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    void loadData();
  }, []);

  // Descobre se quem está logado é admin (só então o botão do painel aparece)
  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setNickname('Visitante');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('role,nickname')
        .eq('id', user.id)
        .maybeSingle();
      setIsAdmin(data?.role === 'admin');
      const meta = user.user_metadata?.nickname as string | undefined;
      const saved = (data?.nickname as string | undefined) || meta;
      setNickname(saved && saved.trim() ? saved.trim() : (user.email ?? 'Jogador').split('@')[0]);
    }
    void checkAdmin();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => void checkAdmin(), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Cada tela entra no histórico do navegador, então o botão voltar do celular
  // volta para a tela anterior do site em vez de sair do Chrome.
  useEffect(() => {
    window.history.replaceState({ screen: baseScreen.current, idx: 0 }, '');
    function onPop(event: PopStateEvent) {
      const target = (event.state?.screen as Screen | undefined) ?? 'home';
      if (target === 'match' || target === 'results') setScreenState('home');
      else if (target === 'draft' && !clubRef.current) setScreenState('club');
      else setScreenState(target);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(next: Screen, replace = false) {
    const idx = (window.history.state?.idx ?? 0) + (replace ? 0 : 1);
    const state = { screen: next, idx };
    if (replace) window.history.replaceState(state, '');
    else window.history.pushState(state, '');
    setScreenState(next);
  }
  function goBack(fallback: Screen = 'home') {
    if ((window.history.state?.idx ?? 0) > 0) window.history.back();
    else navigate(fallback, true);
  }
  function goHome() {
    const idx = window.history.state?.idx ?? 0;
    if (idx > 0 && baseScreen.current === 'home') window.history.go(-idx);
    else navigate('home', idx === 0);
  }

  async function loadData() {
    setLoading(true);
    setError('');
    const [teamResponse, playerResponse] = await Promise.all([
      supabase.from('teams').select('*').order('name'),
      supabase.from('players').select('*').order('overall', { ascending: false }),
    ]);
    if (teamResponse.error || playerResponse.error) {
      setError('Não foi possível carregar o elenco agora.');
      setLoading(false);
      return;
    }
    const loadedTeams = (teamResponse.data ?? []) as Team[];
    const loadedPlayers = (playerResponse.data ?? []) as Player[];
    const withTeam = loadedPlayers.map((player) => ({
      ...player,
      team: loadedTeams.find((item) => item.id === player.team_id),
    }));
    setTeams(loadedTeams);
    setPlayers(withTeam);
    setLoading(false);
  }

  function startClubChoice(next: 'classic' | 'dice' = 'classic') {
    setMode(next);
    navigate('club');
  }
  function chooseClub(team: Team) {
    setSelectedClub(team);
    setDraft({});
    setDraftPosition('GK');
    navigate('draft');
  }
  function playersForPosition(position: Position) {
    const selectedIds = Object.values(draft)
      .filter(Boolean)
      .map((player) => (player as Player).id);
    return players
      .filter((player) => getPlayerPositions(player).includes(position) && !selectedIds.includes(player.id))
      .slice(0, 5);
  }
  function chooseDraftPlayer(player: Player) {
    const nextDraft = { ...draft, [draftPosition]: player };
    setDraft(nextDraft);
    const nextPosition = positions.find((position) => !nextDraft[position]);
    if (nextPosition) setDraftPosition(nextPosition);
    else finishDraft(nextDraft);
  }
  // Modo Dado: coloca o jogador escolhido na posição indicada
  function pickDicePlayer(player: Player, position: Position) {
    const nextDraft = { ...draft, [position]: player };
    setDraft(nextDraft);
    if (positions.every((item) => nextDraft[item])) finishDraft(nextDraft);
  }
  function finishDraft(finalDraft: Partial<Record<Position, Player>>) {
    const chosen = positions.map((position) => finalDraft[position]).filter(Boolean) as Player[];
    const chosenIds = new Set(chosen.map((player) => player.id));
    const botClub = teams.find((team) => team.id !== selectedClub?.id);
    // O bot completa o time com os jogadores que sobraram. Prefere os do clube rival,
    // mas usa qualquer jogador livre se faltar (o draft mistura os dois clubes).
    const usedIds = new Set(chosenIds);
    const botPlayers: Player[] = [];
    positions.forEach((position) => {
      const free = players.filter((player) => !usedIds.has(player.id));
      const fits = free.filter((player) => getPlayerPositions(player).includes(position));
      const pool = fits.length ? fits : free;
      const choice = pool.find((player) => player.team_id === botClub?.id) ?? pool[0];
      if (choice) {
        usedIds.add(choice.id);
        botPlayers.push(choice);
      }
    });
    setUserTeam(chosen);
    setBotTeam(botPlayers);
    setMinute(0);
    setScore({ user: 0, bot: 0 });
    setEvents([]);
    setStats(emptyStats);
    setShownScore({ user: 0, bot: 0 });
    setShownGoalIds([]);
    setSkipped(false);
    eventSeq.current = 0;
    shownRef.current = new Set();
    navigate('match', true);
  }

  useEffect(() => {
    if (screen !== 'match' || minute >= 90 || skipped) return;
    const timer = window.setInterval(() => advanceMatch(), 900);
    return () => window.clearInterval(timer);
  }, [screen, minute, skipped]);

  // Depois dos 90 minutos, espera os gols aparecerem na animação antes de mostrar o resultado
  useEffect(() => {
    if (screen !== 'match' || minute < 90) return;
    const allShown = shownScore.user === score.user && shownScore.bot === score.bot;
    const wait = skipped ? 250 : allShown ? 2500 : 14000;
    const timer = window.setTimeout(() => navigate('results', true), wait);
    return () => window.clearTimeout(timer);
  }, [screen, minute, skipped, shownScore, score]);

  function advanceMatch() {
    const next = minute + 1;
    setMinute(next);
    if (next % 4 === 0 || next % 7 === 0) createEvent(next);
  }

  function handleGoal(id: number, side: 'user' | 'bot') {
    if (shownRef.current.has(id)) return;
    shownRef.current.add(id);
    setShownGoalIds((current) => [...current, id]);
    setShownScore((current) => ({ ...current, [side]: current[side] + 1 }));
  }

  function createEvent(currentMinute: number) {
    const userAttack = average(userTeam.filter((player) => ['LF', 'RF', 'CF'].includes(player.primary_position)));
    const botAttack = average(botTeam.filter((player) => ['LF', 'RF', 'CF'].includes(player.primary_position)));
    const userWins = userAttack + Math.random() * 20 >= botAttack + Math.random() * 20;
    const type: MatchEvent['type'] =
      currentMinute % 11 === 0
        ? 'gol'
        : currentMinute % 5 === 0
          ? 'finalização'
          : currentMinute % 3 === 0
            ? 'defesa'
            : 'posse';
    const side: MatchEvent['team'] = userWins ? 'user' : 'bot';
    const attackPlayer =
      (side === 'user' ? userTeam : botTeam).find((player) => ['LF', 'RF', 'CF'].includes(player.primary_position)) ??
      (side === 'user' ? userTeam[0] : botTeam[0]);
    const defensePlayer =
      (side === 'user' ? botTeam : userTeam).find((player) => player.primary_position === 'GK') ??
      (side === 'user' ? botTeam[0] : userTeam[0]);
    const club =
      side === 'user'
        ? selectedClub?.abbreviation
        : teams.find((team) => team.id !== selectedClub?.id)?.abbreviation;
    const text =
      type === 'gol'
        ? `${attackPlayer?.name} marca para ${club}. Que finalização!`
        : type === 'finalização'
          ? `${attackPlayer?.name} finaliza de primeira.`
          : type === 'defesa'
            ? `${defensePlayer?.name} faz uma defesa segura.`
            : `${club} organiza a posse no meio-campo.`;
    eventSeq.current += 1;
    const id = eventSeq.current;
    setEvents((current) => [{ id, minute: currentMinute, type, text, team: side }, ...current].slice(0, 18));
    setStats((current) => ({
      ...current,
      userPossession: Math.max(38, Math.min(62, current.userPossession + (side === 'user' ? 2 : -2))),
      botPossession: Math.max(38, Math.min(62, current.botPossession + (side === 'bot' ? 2 : -2))),
      userShots: current.userShots + (side === 'user' && type === 'finalização' ? 1 : 0),
      botShots: current.botShots + (side === 'bot' && type === 'finalização' ? 1 : 0),
      userTarget: current.userTarget + (side === 'user' && type === 'finalização' ? 1 : 0),
      botTarget: current.botTarget + (side === 'bot' && type === 'finalização' ? 1 : 0),
      userSaves: current.userSaves + (side === 'bot' && type === 'defesa' ? 1 : 0),
      botSaves: current.botSaves + (side === 'user' && type === 'defesa' ? 1 : 0),
    }));
    if (type === 'gol') setScore((current) => ({ ...current, [side]: current[side] + 1 }));
  }

  function skipMatch() {
    for (let i = minute; i < 90; i += 1) {
      if (i % 4 === 0 || i % 7 === 0) createEvent(i);
    }
    setSkipped(true);
    setMinute(90);
  }
  function reset() {
    setSelectedClub(null);
    setDraft({});
    goHome();
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <LogoMark size={76} variant="full" />
        <p>Carregando a federação...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="loading-screen">
        <Shield size={38} color="#f5b800" />
        <p>{error}</p>
        <button className="gold-button" onClick={() => void loadData()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const opponentTeam = selectedClub ? teams.find((team) => team.id !== selectedClub.id) : undefined;

  return (
    <div className="app-shell">
      <Header
        nickname={nickname}
        isAdmin={isAdmin}
        onAdmin={() => navigate('admin')}
        onHome={reset}
        onLeaderboard={() => navigate('leaderboard')}
        onSquad={() => navigate('squad')}
        onLogin={() => setShowLogin(true)}
      />

      {screen === 'home' && (
        <Home
          isAdmin={isAdmin}
          onAdmin={() => navigate('admin')}
          onPlay={() => startClubChoice('classic')}
          onLeaderboard={() => navigate('leaderboard')}
        />
      )}

      {screen === 'club' && <ClubChoice teams={teams} mode={mode} onMode={setMode} onBack={reset} onChoose={chooseClub} />}

      {screen === 'draft' && selectedClub && mode === 'classic' && (
        <DraftScreen
          club={selectedClub}
          positions={positions}
          currentPosition={draftPosition}
          selected={draft}
          options={playersForPosition(draftPosition)}
          onPosition={setDraftPosition}
          onChoose={chooseDraftPlayer}
          onBack={() => goBack('club')}
        />
      )}

      {screen === 'draft' && selectedClub && mode === 'dice' && (
        <DiceDraftScreen
          club={selectedClub}
          teams={teams}
          players={players}
          selected={draft}
          onPick={pickDicePlayer}
          onBack={() => goBack('club')}
        />
      )}

      {screen === 'match' && selectedClub && opponentTeam && (
        <MatchScreen
          club={selectedClub}
          opponent={opponentTeam}
          userTeam={userTeam}
          botTeam={botTeam}
          minute={minute}
          score={shownScore}
          events={events}
          shownGoalIds={shownGoalIds}
          onGoal={handleGoal}
          onSkip={skipMatch}
        />
      )}

      {screen === 'results' && selectedClub && opponentTeam && (
        <ResultsScreen
          club={selectedClub}
          opponent={opponentTeam}
          userTeam={userTeam}
          botTeam={botTeam}
          score={score}
          stats={stats}
          onAgain={() => goBack('club')}
          onHome={reset}
        />
      )}

      {screen === 'leaderboard' && <Leaderboard onBack={reset} />}
      {screen === 'squad' && <Squad players={players} teams={teams} onBack={reset} />}
      {screen === 'admin' && (
        <AdminScreen players={players} teams={teams} onBack={reset} onReload={loadData} />
      )}

      {showLogin && (
        <LoginModal
          email={email}
          password={password}
          nickname={nickname}
          message={authMessage}
          setEmail={setEmail}
          setPassword={setPassword}
          setNickname={setNickname}
          setMessage={setAuthMessage}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}

function Header({
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
  return (
    <header className="topbar">
      <button className="brand" onClick={onHome}>
        <LogoMark size={52} variant="full" />
        <span>
          <b>BRASIL</b>
        </span>
      </button>
      <nav>
        <button onClick={onSquad}>Cartas</button>
        <button onClick={onLeaderboard}>Leaderboard</button>
        {isAdmin && <button onClick={onAdmin}>Admin</button>}
      </nav>
      <button className="profile-button" onClick={onLogin}>
        <CircleUserRound size={17} /> {nickname}
      </button>
      <button className="mobile-menu">
        <Menu size={20} />
      </button>
    </header>
  );
}

function Home({
  isAdmin,
  onAdmin,
  onPlay,
  onLeaderboard,
}: {
  isAdmin: boolean;
  onAdmin: () => void;
  onPlay: () => void;
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
            disabled
            aria-disabled="true"
            title="Em breve"
            style={{ opacity: 0.65, cursor: 'not-allowed', pointerEvents: 'none' }}
          >
            <Swords size={17} /> Multiplayer <small>EM BREVE</small>
          </button>
        </div>
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

function Feature({
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

function ClubChoice({
  teams,
  mode,
  onMode,
  onBack,
  onChoose,
}: {
  teams: Team[];
  mode: 'classic' | 'dice';
  onMode: (mode: 'classic' | 'dice') => void;
  onBack: () => void;
  onChoose: (team: Team) => void;
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

function DraftScreen({
  club,
  positions: positionList,
  currentPosition,
  selected,
  options,
  onPosition,
  onChoose,
  onBack,
}: {
  club: Team;
  positions: Position[];
  currentPosition: Position;
  selected: Partial<Record<Position, Player>>;
  options: Player[];
  onPosition: (position: Position) => void;
  onChoose: (player: Player) => void;
  onBack: () => void;
}) {
  const chosen = Object.values(selected).filter(Boolean) as Player[];
  return (
    <main className="draft-page">
      <div className="draft-head">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} /> Clube
        </button>
        <div>
          <div className="eyebrow">ETAPA 02 / 03 · SEU ELENCO</div>
          <h2>
            DRAFT <em>{club.abbreviation}</em>
          </h2>
        </div>
        <div className="draft-progress">
          <strong>{chosen.length}</strong>
          <span>/ 7 jogadores</span>
        </div>
      </div>
      <div className="draft-layout">
        <section className="draft-picker">
          <div className="position-tabs">
            {positionList.map((position) => (
              <button
                key={position}
                className={currentPosition === position ? 'active' : selected[position] ? 'done' : ''}
                onClick={() => onPosition(position)}
              >
                <b>{position}</b>
                <small>{selected[position] ? '✓' : positionNames[position]}</small>
              </button>
            ))}
          </div>
          <div className="picker-heading">
            <div>
              <span className="eyebrow">ESCOLHA SUA CARTA</span>
              <h3>{positionNames[currentPosition]}</h3>
            </div>
            <span>{options.length} disponíveis</span>
          </div>
          <div className="cards-grid">
            {options.map((player) => (
              <Card key={player.id} player={player} onClick={() => onChoose(player)} />
            ))}
          </div>
          {!options.length && <div className="empty-state">Nenhuma carta disponível para esta posição.</div>}
        </section>
        <DraftPitch club={club} selected={selected} />
      </div>
    </main>
  );
}

const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Modo Dado: a cada escolha você rola um dado que sorteia de qual clube vêm as cartas
function DiceDraftScreen({
  club,
  teams,
  players,
  selected,
  onPick,
  onBack,
}: {
  club: Team;
  teams: Team[];
  players: Player[];
  selected: Partial<Record<Position, Player>>;
  onPick: (player: Player, position: Position) => void;
  onBack: () => void;
}) {
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(1);
  const [rolledId, setRolledId] = useState<string | null>(null);
  const [pending, setPending] = useState<Player | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const chosen = Object.values(selected).filter(Boolean) as Player[];
  const pickedIds = new Set(chosen.map((player) => player.id));
  const openPositions = positions.filter((position) => !selected[position]);
  const slotsFor = (player: Player) =>
    openPositions.filter((position) => getPlayerPositions(player).includes(position));
  const squadOf = (team: Team) =>
    players.filter((player) => player.team_id === team.id && !pickedIds.has(player.id));
  const rollable = teams.filter((team) => squadOf(team).some((player) => slotsFor(player).length > 0));
  const rolled = teams.find((team) => team.id === rolledId) ?? null;
  const cards = rolled ? squadOf(rolled) : [];

  // Com até 6 clubes, cada clube ocupa algumas faces do dado
  const legend =
    teams.length <= 6
      ? teams.map((team, index) => ({
          team,
          faces: [1, 2, 3, 4, 5, 6].filter((value) => (value - 1) % teams.length === index),
        }))
      : [];

  function rollDice() {
    if (rolling || rolled || !rollable.length) return;
    const target = rollable[Math.floor(Math.random() * rollable.length)];
    const index = teams.findIndex((team) => team.id === target.id);
    let finalFace = (index % 6) + 1;
    if (teams.length <= 6) {
      const faces = [1, 2, 3, 4, 5, 6].filter((value) => (value - 1) % teams.length === index);
      finalFace = faces[Math.floor(Math.random() * faces.length)];
    }
    setRolling(true);
    setPending(null);
    let ticks = 0;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      ticks += 1;
      if (ticks < 11) {
        setFace(1 + Math.floor(Math.random() * 6));
        return;
      }
      window.clearInterval(timer.current);
      setFace(finalFace);
      setRolling(false);
      setRolledId(target.id);
    }, 90);
  }

  function place(player: Player, position: Position) {
    setPending(null);
    setRolledId(null);
    onPick(player, position);
  }

  function pickCard(player: Player) {
    const slots = slotsFor(player);
    if (!slots.length) return;
    if (slots.length === 1) place(player, slots[0]);
    else setPending(player);
  }

  return (
    <main className="draft-page">
      <style>{`@keyframes dice-shake {
        0% { transform: rotate(0) translateY(0); }
        25% { transform: rotate(-18deg) translateY(-8px); }
        50% { transform: rotate(14deg) translateY(2px); }
        75% { transform: rotate(-10deg) translateY(-5px); }
        100% { transform: rotate(0) translateY(0); }
      }`}</style>
      <div className="draft-head">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} /> Clube
        </button>
        <div>
          <div className="eyebrow">ETAPA 02 / 03 · MODO DADO</div>
          <h2>
            DRAFT <em>{club.abbreviation}</em>
          </h2>
        </div>
        <div className="draft-progress">
          <strong>{chosen.length}</strong>
          <span>/ 7 jogadores</span>
        </div>
      </div>
      <div className="draft-layout">
        <section className="draft-picker">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
            <div
              aria-label={`Dado mostrando ${face}`}
              style={{
                width: 92,
                height: 92,
                borderRadius: 18,
                background: '#f4f4f0',
                padding: 12,
                boxSizing: 'border-box',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(3, 1fr)',
                boxShadow: '0 6px 0 #b9b9b0, 0 10px 24px rgba(0,0,0,.5)',
                animation: rolling ? 'dice-shake .45s infinite' : 'none',
                flexShrink: 0,
              }}
            >
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  style={{
                    width: 16,
                    height: 16,
                    margin: 'auto',
                    borderRadius: '50%',
                    background: DIE_PIPS[face].includes(index) ? '#11161c' : 'transparent',
                  }}
                />
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <span className="eyebrow">{rolled ? 'O DADO SORTEOU' : 'SORTEIE O CLUBE'}</span>
              {rolled ? (
                <div style={{ marginTop: 6 }}>
                  <TeamMark team={rolled} />
                </div>
              ) : (
                <p style={{ margin: '6px 0 10px', opacity: 0.8 }}>
                  {rollable.length
                    ? 'Role o dado para sortear de qual clube vêm as cartas desta escolha.'
                    : 'Não há mais jogadores disponíveis para as posições que faltam.'}
                </p>
              )}
              {!rolled && (
                <button className="gold-button" onClick={rollDice} disabled={rolling || !rollable.length}>
                  <span aria-hidden="true">🎲</span> {rolling ? 'Rolando...' : 'Rolar dado'}
                </button>
              )}
              {legend.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {legend.map((item) => (
                    <span key={item.team.id}>
                      {item.faces.join(', ')} → {item.team.abbreviation}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {rolled && (
            <>
              <div className="picker-heading">
                <div>
                  <span className="eyebrow">ESCOLHA UMA CARTA</span>
                  <h3>Elenco do {rolled.name}</h3>
                </div>
                <span>{cards.filter((player) => slotsFor(player).length > 0).length} disponíveis</span>
              </div>
              {pending && (
                <div className="empty-state" style={{ marginBottom: 14 }}>
                  <p style={{ margin: '0 0 10px' }}>Em qual posição {pending.name} vai jogar?</p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {slotsFor(pending).map((position) => (
                      <button key={position} className="gold-button" onClick={() => place(pending, position)}>
                        {position}
                      </button>
                    ))}
                    <button className="outline-button" onClick={() => setPending(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="cards-grid">
                {cards.map((player) => {
                  const ok = slotsFor(player).length > 0;
                  return (
                    <div key={player.id} style={{ opacity: ok ? 1 : 0.35, textAlign: 'center' }}>
                      <Card
                        player={player}
                        selected={pending?.id === player.id}
                        onClick={ok ? () => pickCard(player) : undefined}
                      />
                      {!ok && <small style={{ fontSize: 11 }}>Posição já preenchida</small>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
        <DraftPitch club={club} selected={selected} />
      </div>
    </main>
  );
}

function DraftPitch({ club, selected }: { club: Team; selected: Partial<Record<Position, Player>> }) {
  const spots: Record<Position, string> = {
    GK: 'spot-gk',
    LB: 'spot-lb',
    RB: 'spot-rb',
    CM: 'spot-cm',
    LF: 'spot-lf',
    RF: 'spot-rf',
    CF: 'spot-cf',
  };
  return (
    <aside className="pitch-wrap">
      <div className="pitch-label">
        <span>SEU TIME</span>
        <TeamMark team={club} />
      </div>
      <div className="pitch">
        <div className="pitch-lines" />
        {positions.map((position) => (
          <div key={position} className={`pitch-spot ${spots[position]}`}>
            {selected[position] ? (
              <>
                <span className="pitch-rating">{selected[position]?.overall}</span>
                <span className="pitch-avatar">{selected[position]?.name.slice(0, 1)}</span>
                <b>{selected[position]?.name}</b>
              </>
            ) : (
              <>
                <span className="plus">+</span>
                <b>{position}</b>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="pitch-average">
        OVERALL MÉDIO <strong>{average(Object.values(selected).filter(Boolean) as Player[]) || '—'}</strong>
      </div>
    </aside>
  );
}

function MatchScreen({
  club,
  opponent,
  userTeam,
  botTeam,
  minute,
  score,
  events,
  shownGoalIds,
  onGoal,
  onSkip,
}: {
  club: Team;
  opponent: Team;
  userTeam: Player[];
  botTeam: Player[];
  minute: number;
  score: { user: number; bot: number };
  events: MatchEvent[];
  shownGoalIds: number[];
  onGoal: (id: number, side: 'user' | 'bot') => void;
  onSkip: () => void;
}) {
  // O lance do gol só aparece no feed depois que a bola entrou na animação
  const feed = events.filter((event) => event.type !== 'gol' || shownGoalIds.includes(event.id));
  return (
    <main className="match-page">
      <div className="match-header">
        <div className="match-status">
          <span className="live-dot" /> AO VIVO · {minute}'
        </div>
        <button className="skip-button" onClick={onSkip}>
          <SkipForward size={15} /> Pular partida
        </button>
        <div className="scoreboard">
          <div>
            <TeamMark team={club} />
            <strong>{score.user}</strong>
          </div>
          <span>—</span>
          <div>
            <strong>{score.bot}</strong>
            <TeamMark team={opponent} />
          </div>
        </div>
        <div className="match-meta">
          <span>SIMULAÇÃO 7V7</span>
          <span>90 MINUTOS</span>
        </div>
      </div>

      <MatchPitch
        club={club}
        opponent={opponent}
        userTeam={userTeam}
        botTeam={botTeam}
        events={events}
        onGoal={onGoal}
      />

      <div className="match-columns">
        <section className="match-feed">
          <div className="section-title">
            <div>
              <span className="eyebrow">CENTRAL DE LANCES</span>
              <h2>
                ACONTECENDO <em>AGORA</em>
              </h2>
            </div>
            <span className="feed-live">● AO VIVO</span>
          </div>
          {feed.length ? (
            feed.map((event, index) => (
              <div
                key={`${event.minute}-${index}`}
                className={`event-row ${event.type === 'gol' ? 'goal-event' : ''}`}
              >
                <strong>{event.minute}'</strong>
                <span className={`event-icon ${event.type}`}>
                  <EventIcon type={event.type} />
                </span>
                <p>{event.text}</p>
                {event.type === 'gol' && <b>GOL</b>}
              </div>
            ))
          ) : (
            <div className="empty-feed">
              <RefreshCw size={23} />
              <p>A partida vai começar...</p>
            </div>
          )}
        </section>
        <aside className="match-side">
          <MiniStat label="POSSE DE BOLA" user={50} bot={50} />
          <MiniStat label="FINALIZAÇÕES" user={0} bot={0} />
          <div className="side-players">
            <span className="eyebrow">FORMAÇÕES</span>
            <h3>Seu elenco</h3>
            {userTeam.map((player) => (
              <div key={player.id}>
                <span>{player.primary_position}</span>
                <b>{player.name}</b>
                <strong>{player.overall}</strong>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

function EventIcon({ type }: { type: MatchEvent['type'] }) {
  return type === 'gol' ? (
    <Goal />
  ) : type === 'defesa' ? (
    <Shield />
  ) : type === 'finalização' ? (
    <Zap />
  ) : (
    <CircleUserRound />
  );
}

function MiniStat({ label, user, bot }: { label: string; user: number; bot: number }) {
  return (
    <div className="mini-stat">
      <div>
        <span>{label}</span>
        <b>
          {user}% <i>{bot}%</i>
        </b>
      </div>
      <div className="stat-bar">
        <i style={{ width: `${user}%` }} />
        <b style={{ width: `${bot}%` }} />
      </div>
    </div>
  );
}

function ResultsScreen({
  club,
  opponent,
  userTeam,
  botTeam,
  score,
  stats,
  onAgain,
  onHome,
}: {
  club: Team;
  opponent: Team;
  userTeam: Player[];
  botTeam: Player[];
  score: { user: number; bot: number };
  stats: MatchStats;
  onAgain: () => void;
  onHome: () => void;
}) {
  const userWon = score.user > score.bot;
  return (
    <main className="results-page">
      <div className={`result-banner ${userWon ? 'win' : 'loss'}`}>
        <span className="eyebrow">FIM DE JOGO</span>
        <h1>{userWon ? 'VITÓRIA!' : score.user === score.bot ? 'EMPATE' : 'FIM DE JOGO'}</h1>
        <p>{userWon ? 'Seu time jogou como uma verdadeira unidade.' : 'O próximo draft começa agora.'}</p>
      </div>
      <div className="result-score">
        <TeamMark team={club} />
        <strong>{score.user}</strong>
        <span>×</span>
        <strong>{score.bot}</strong>
        <TeamMark team={opponent} />
      </div>
      <div className="results-grid">
        <section className="result-panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">LEITURA DA PARTIDA</span>
              <h2>ESTATÍSTICAS</h2>
            </div>
            <BarChart3 />
          </div>
          <ResultBar label="Posse de bola" user={stats.userPossession} bot={stats.botPossession} suffix="%" />
          <ResultBar label="Finalizações" user={stats.userShots} bot={stats.botShots} />
          <ResultBar label="No alvo" user={stats.userTarget} bot={stats.botTarget} />
          <ResultBar label="Defesas" user={stats.userSaves} bot={stats.botSaves} />
        </section>
        <section className="result-panel ratings">
          <div className="section-title">
            <div>
              <span className="eyebrow">DESEMPENHO INDIVIDUAL</span>
              <h2>AVALIAÇÕES</h2>
            </div>
            <Crown color="#f5b800" />
          </div>
          <RatingList players={userTeam} own />
          <RatingList players={botTeam} />
        </section>
      </div>
      <div className="result-actions">
        <button className="gold-button" onClick={onAgain}>
          <RefreshCw size={16} /> Jogar novamente
        </button>
        <button className="outline-button" onClick={onHome}>
          Voltar ao início
        </button>
      </div>
    </main>
  );
}

function ResultBar({
  label,
  user,
  bot,
  suffix = '',
}: {
  label: string;
  user: number;
  bot: number;
  suffix?: string;
}) {
  const total = user + bot || 1;
  return (
    <div className="result-bar">
      <div>
        <span>{label}</span>
        <b>
          {user}
          {suffix}
          <i>
            {bot}
            {suffix}
          </i>
        </b>
      </div>
      <div>
        <i style={{ width: `${(user / total) * 100}%` }} />
        <b style={{ width: `${(bot / total) * 100}%` }} />
      </div>
    </div>
  );
}

function RatingList({ players, own = false }: { players: Player[]; own?: boolean }) {
  return (
    <div className="rating-list">
      <span className="rating-team">{own ? 'SEU TIME' : 'RIVAL'}</span>
      {players.map((player, index) => (
        <div key={player.id} className={index === 0 ? 'best-player' : ''}>
          <span>
            {index === 0 && <Crown size={13} />} {player.primary_position}
          </span>
          <b>{player.name}</b>
          <strong>{(6.5 + (player.overall - 75) / 20 + (index === 0 ? 0.8 : 0)).toFixed(1)}</strong>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<
    { profile_id: string; wins: number; losses: number; profiles?: { nickname: string }[] }[]
  >([]);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('leaderboard')
        .select('profile_id,wins,losses,profiles(nickname)')
        .order('wins', { ascending: false })
        .limit(20);
      setRows((data ?? []) as typeof rows);
    })();
  }, []);
  return (
    <main className="simple-page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="flow-heading">
        <div className="eyebrow">
          <Trophy size={14} /> RANKING GLOBAL
        </div>
        <h2>
          MAIORES <em>VENCEDORES</em>
        </h2>
        <p>Os nomes que estão deixando sua marca na Federação.</p>
      </div>
      <section className="leaderboard-panel">
        <div className="leaderboard-head">
          <span>#</span>
          <span>JOGADOR</span>
          <span>VITÓRIAS</span>
          <span>APROVEITAMENTO</span>
        </div>
        {rows.length ? (
          rows.map((row, index) => (
            <div className="leader-row" key={row.profile_id}>
              <strong className={`rank rank-${index + 1}`}>{index + 1}</strong>
              <div className="rank-player">
                <span>{(row.profiles?.[0]?.nickname ?? 'Jogador').slice(0, 1)}</span>
                <b>{row.profiles?.[0]?.nickname ?? 'Jogador'}</b>
              </div>
              <strong>{row.wins}</strong>
              <span>
                {row.wins + row.losses ? Math.round((row.wins / (row.wins + row.losses)) * 100) : 0}%
              </span>
            </div>
          ))
        ) : (
          <div className="empty-state">O ranking ainda está esperando seus primeiros campeões.</div>
        )}
      </section>
    </main>
  );
}

function Squad({ players, teams, onBack }: { players: Player[]; teams: Team[]; onBack: () => void }) {
  return (
    <main className="simple-page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="flow-heading">
        <div className="eyebrow">
          <Users size={14} /> ELENCOS OFICIAIS
        </div>
        <h2>
          AS CARTAS DO <em>7V7</em>
        </h2>
        <p>Conheça os jogadores disponíveis para os próximos drafts.</p>
      </div>
      {teams.map((team) => (
        <section className="squad-section" key={team.id}>
          <div className="squad-heading">
            <TeamMark team={team} />
            <span>{players.filter((player) => player.team_id === team.id).length} cartas</span>
          </div>
          <div className="squad-grid">
            {players
              .filter((player) => player.team_id === team.id)
              .map((player) => (
                <Card key={player.id} player={player} compact />
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function LoginModal({
  email,
  password,
  nickname,
  message,
  setEmail,
  setPassword,
  setNickname,
  setMessage,
  onClose,
}: {
  email: string;
  password: string;
  nickname: string;
  message: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setNickname: (value: string) => void;
  setMessage: (value: string) => void;
  onClose: () => void;
}) {
  const submit = async (signUp: boolean) => {
    setMessage('');
    const result = signUp
      ? await supabase.auth.signUp({ email, password, options: { data: { nickname } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setMessage('Confira seus dados e tente novamente.');
      return;
    }
    if (signUp && nickname.trim() && result.data.user) {
      // Garante o apelido também na tabela profiles (se a política permitir)
      await supabase
        .from('profiles')
        .update({ nickname: nickname.trim() })
        .eq('id', result.data.user.id);
    }
    setMessage(signUp ? 'Conta criada. Você já pode jogar.' : 'Login realizado.');
    onClose();
  };
  return (
    <div className="modal-backdrop">
      <div className="login-modal">
        <button className="close-button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="eyebrow">
          <LogIn size={14} /> ACESSO DO JOGADOR
        </div>
        <h2>
          ENTRE PARA <em>RANQUEAR</em>
        </h2>
        <p>Salve suas vitórias e acompanhe sua evolução.</p>
        <label>
          Apelido
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Seu apelido" />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@email.com"
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>
        {message && <div className="form-message">{message}</div>}
        <div className="modal-actions">
          <button className="gold-button" onClick={() => void submit(false)}>
            Entrar
          </button>
          <button className="outline-button" onClick={() => void submit(true)}>
            Criar conta
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
