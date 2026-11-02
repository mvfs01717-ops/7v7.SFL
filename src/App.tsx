import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, ChevronDown, CircleUserRound, Crown, Database, Filter, Flame,
  Goal, LogIn, Menu, MessageCircle, Play, RefreshCw, Search, Send, Shield, SkipForward, Swords, Trophy, UserRound,
  Users, X, Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AdminScreen from '@/components/AdminScreen';
import MatchPitch from '@/components/MatchPitch';
import {
  createRoom, joinRoom, fetchRoom, patchRoom, listLiveRooms, generatePlan, recordResult, openRoomChat,
  type Room, type PlanItem, type ChatMessage,
} from '@/lib/multiplayer';

type Position = 'GK' | 'LB' | 'RB' | 'CM' | 'LF' | 'RF' | 'CF';
type Screen = 'home' | 'club' | 'draft' | 'match' | 'results' | 'leaderboard' | 'squad' | 'admin' | 'lobby';
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

// Evita a rolagem para os lados no celular e deixa a tela inicial mais compacta
const globalCss = `
html, body { max-width: 100%; overflow-x: hidden; overflow-x: clip; }
body { overscroll-behavior-x: none; }
.app-shell { max-width: 100vw; overflow-x: hidden; overflow-x: clip; }
@media (max-width: 720px) {
  .hero-actions { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
  .hero-actions { width: min(100%, 340px); margin-left: auto; margin-right: auto; }
  .hero-actions button { width: 100%; justify-content: center; }
  .hero p { font-size: 15px; }
  .hero { padding-bottom: 8px; }
}
`;

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
  const [userId, setUserId] = useState<string | null>(null);
  // Multiplayer
  const [room, setRoom] = useState<Room | null>(null);
  const [mpBusy, setMpBusy] = useState(false);
  const [mpError, setMpError] = useState('');
  const [mpNotice, setMpNotice] = useState('');
  const [spectating, setSpectating] = useState<{ host: string; guest: string } | null>(null);
  const planRef = useRef<{ minute: number; type: MatchEvent['type']; side: 'user' | 'bot' }[] | null>(null);
  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;
  const mpDraftRoom = useRef<string | null>(null);
  const mpPlanRoom = useRef<string | null>(null);
  const mpMatchRoom = useRef<string | null>(null);
  const mpRecorded = useRef<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatRef = useRef<ReturnType<typeof openRoomChat> | null>(null);
  // Cartas sorteadas para cada posição no draft clássico (ficam fixas até escolher)
  const drawRef = useRef<Partial<Record<Position, string[]>>>({});
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
        setUserId(null);
        setNickname('Visitante');
        return;
      }
      setUserId(user.id);
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

  const myRole: 'host' | 'guest' | null = room && userId ? (room.host_id === userId ? 'host' : 'guest') : null;
  const theirSquad = room ? (myRole === 'host' ? room.guest_squad : room.host_squad) : null;
  // Jogadores que o adversário já escolheu no draft multiplayer
  const blockedIds = new Set<string>(theirSquad ? Object.values(theirSquad) : []);

  function squadIds(source: Partial<Record<Position, Player>>) {
    const out: Record<string, string> = {};
    positions.forEach((position) => {
      const player = source[position];
      if (player) out[position] = player.id;
    });
    return out;
  }
  function squadPlayers(squad: Record<string, string> | null | undefined) {
    return positions
      .map((position) => players.find((player) => player.id === squad?.[position]))
      .filter(Boolean) as Player[];
  }
  // Envia as escolhas do draft para a sala (e marca como pronto no fim)
  function syncSquad(source: Partial<Record<Position, Player>>, ready = false) {
    if (!room || !myRole) return;
    const patch: Partial<Room> =
      myRole === 'host'
        ? { host_squad: squadIds(source), ...(ready ? { host_ready: true } : {}) }
        : { guest_squad: squadIds(source), ...(ready ? { guest_ready: true } : {}) };
    setRoom((current) => (current ? { ...current, ...patch } : current));
    void patchRoom(room.id, patch);
  }
  function sendChat(text: string) {
    if (!userId || !chatRef.current) return false;
    return chatRef.current.send({
      id: `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: userId,
      nick: nickname,
      text: text.slice(0, 200),
      at: Date.now(),
    });
  }
  function leaveRoom() {
    const current = roomRef.current;
    if (!current) return;
    if (current.status === 'waiting' || current.status === 'drafting') {
      void patchRoom(current.id, { status: 'cancelled' });
    }
    setRoom(null);
  }
  function openMultiplayer() {
    if (!userId) {
      setAuthMessage('Entre na sua conta para jogar o multiplayer.');
      setShowLogin(true);
      return;
    }
    setMpError('');
    navigate('lobby');
  }
  async function handleCreateRoom(teamId: string, roomMode: 'classic' | 'dice') {
    if (!userId) return;
    setMpBusy(true);
    setMpError('');
    const result = await createRoom(userId, nickname, teamId, roomMode);
    setMpBusy(false);
    if (result.error || !result.room) setMpError(result.error ?? 'Erro ao criar a sala.');
    else setRoom(result.room);
  }
  async function handleJoinRoom(code: string) {
    if (!userId) return;
    setMpBusy(true);
    setMpError('');
    const result = await joinRoom(code, userId, nickname, teams.map((team) => team.id));
    setMpBusy(false);
    if (result.error || !result.room) setMpError(result.error ?? 'Erro ao entrar na sala.');
    else setRoom(result.room);
  }
  function resumeMpDraft() {
    if (!room || !myRole) return;
    const team = teams.find((item) => item.id === (myRole === 'host' ? room.host_team_id : room.guest_team_id));
    if (!team) return;
    setSelectedClub(team);
    setMode(room.mode);
    navigate('draft');
  }
  // Assistir a partida de outras pessoas (sem entrar na sala). O anfitrião é o lado "user".
  function watchRoom(target: Room) {
    if (!target.plan || !target.plan.length) return;
    const team = teams.find((item) => item.id === target.host_team_id);
    if (!team) return;
    setSelectedClub(team);
    planRef.current = target.plan.map((item: PlanItem) => ({
      minute: item.minute,
      type: item.type,
      side: item.side === 'host' ? 'user' : 'bot',
    }));
    setSpectating({ host: target.host_nick, guest: target.guest_nick ?? 'Jogador' });
    beginMatch(squadPlayers(target.host_squad), squadPlayers(target.guest_squad));
  }
  // Sai do modo espectador quando sair da partida/resultado
  useEffect(() => {
    if (screen !== 'match' && screen !== 'results') setSpectating(null);
  }, [screen]);

  function beginMpMatch(current: Room) {
    const role = current.host_id === userId ? 'host' : 'guest';
    const mine = squadPlayers(role === 'host' ? current.host_squad : current.guest_squad);
    const theirs = squadPlayers(role === 'host' ? current.guest_squad : current.host_squad);
    const team = teams.find((item) => item.id === (role === 'host' ? current.host_team_id : current.guest_team_id));
    if (team) setSelectedClub(team);
    planRef.current = (current.plan ?? []).map((item: PlanItem) => ({
      minute: item.minute,
      type: item.type,
      side: item.side === role ? 'user' : 'bot',
    }));
    beginMatch(mine, theirs);
  }

  // Chat da sala: abre quando os dois jogadores estão na sala e fecha ao sair
  const chatActive = !!room?.id && !!room?.guest_id;
  useEffect(() => {
    if (!room?.id || !chatActive) return;
    setChatMessages([]);
    const chat = openRoomChat(room.id, (message) => {
      setChatMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message].slice(-100),
      );
    });
    chatRef.current = chat;
    return () => {
      chat.close();
      chatRef.current = null;
    };
  }, [room?.id, chatActive]);

  // Mantém a sala atualizada (tempo real + consulta a cada 2,5 s como reforço)
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    let alive = true;
    async function refresh() {
      const next = await fetchRoom(id);
      if (!alive || !next) return;
      setRoom((current) => (current && JSON.stringify(current) !== JSON.stringify(next) ? next : current));
    }
    const timer = window.setInterval(() => void refresh(), 2500);
    let channel: any = null;
    try {
      channel = supabase
        .channel(`room-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, () => {
          void refresh();
        })
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      alive = false;
      window.clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [room?.id]);

  // Reage às mudanças da sala: draft, início da partida, saída do adversário
  useEffect(() => {
    if (!room || !myRole) return;
    if (room.status === 'cancelled') {
      setRoom(null);
      setMpNotice('O adversário saiu da sala.');
      if (screen === 'lobby' || screen === 'draft') navigate('home', true);
      return;
    }
    if (room.status === 'drafting' && mpDraftRoom.current !== room.id) {
      mpDraftRoom.current = room.id;
      const team = teams.find((item) => item.id === (myRole === 'host' ? room.host_team_id : room.guest_team_id));
      if (team) {
        setSelectedClub(team);
        setMode(room.mode);
        drawRef.current = {};
        setDraft({});
        setDraftPosition('GK');
        navigate('draft');
      }
    }
    if (
      myRole === 'host' &&
      room.status === 'drafting' &&
      room.host_ready &&
      room.guest_ready &&
      mpPlanRoom.current !== room.id
    ) {
      mpPlanRoom.current = room.id;
      const plan = generatePlan(squadPlayers(room.host_squad), squadPlayers(room.guest_squad));
      void patchRoom(room.id, { plan, status: 'playing' });
    }
    if (room.status === 'playing' && room.plan && mpMatchRoom.current !== room.id) {
      mpMatchRoom.current = room.id;
      beginMpMatch(room);
    }
  }, [room, screen]);

  // No fim da partida multiplayer, salva o resultado no ranking (uma vez por sala)
  useEffect(() => {
    if (screen !== 'results' || !room || !room.plan || !userId) return;
    if (mpRecorded.current === room.id) return;
    mpRecorded.current = room.id;
    const goals = (side: 'host' | 'guest') =>
      room.plan!.filter((item) => item.type === 'gol' && item.side === side).length;
    void recordResult(room, goals('host'), goals('guest'));
  }, [screen, room]);

  // Ao voltar para o início, sai da sala
  useEffect(() => {
    if (screen === 'home' && room) leaveRoom();
  }, [screen, room]);

  function startClubChoice(next: 'classic' | 'dice' = 'classic') {
    setMode(next);
    navigate('club');
  }
  function chooseClub(team: Team) {
    setSelectedClub(team);
    drawRef.current = {};
    setDraft({});
    setDraftPosition('GK');
    navigate('draft');
  }
  function playersForPosition(position: Position) {
    const selectedIds = Object.values(draft)
      .filter(Boolean)
      .map((player) => (player as Player).id);
    const fits = players.filter(
      (player) => getPlayerPositions(player).includes(position) && !selectedIds.includes(player.id),
    );
    const free = fits.filter((player) => !blockedIds.has(player.id));
    const pool = free.length ? free : fits;
    // Sorteio: 3 cartas aleatórias por posição. Podem vir ótimas ou fracas, é questão de sorte.
    const wanted = Math.min(3, pool.length);
    let ids = (drawRef.current[position] ?? []).filter((id) => pool.some((player) => player.id === id));
    if (ids.length < wanted) {
      const rest = pool.filter((player) => !ids.includes(player.id));
      while (ids.length < wanted && rest.length) {
        const [taken] = rest.splice(Math.floor(Math.random() * rest.length), 1);
        ids = [...ids, taken.id];
      }
      drawRef.current[position] = ids;
    }
    return ids
      .map((id) => pool.find((player) => player.id === id))
      .filter(Boolean) as Player[];
  }
  function chooseDraftPlayer(player: Player) {
    const nextDraft = { ...draft, [draftPosition]: player };
    setDraft(nextDraft);
    syncSquad(nextDraft);
    const nextPosition = positions.find((position) => !nextDraft[position]);
    if (nextPosition) setDraftPosition(nextPosition);
    else finishDraft(nextDraft);
  }
  // Modo Dado: coloca o jogador escolhido na posição indicada
  function pickDicePlayer(player: Player, position: Position) {
    const nextDraft = { ...draft, [position]: player };
    setDraft(nextDraft);
    syncSquad(nextDraft);
    if (positions.every((item) => nextDraft[item])) finishDraft(nextDraft);
  }
  function finishDraft(finalDraft: Partial<Record<Position, Player>>) {
    if (room) {
      // Multiplayer: marca como pronto e espera o adversário
      syncSquad(finalDraft, true);
      navigate('lobby', true);
      return;
    }
    planRef.current = null;
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
    beginMatch(chosen, botPlayers);
  }
  function beginMatch(chosen: Player[], botPlayers: Player[]) {
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
    if (planRef.current) {
      const planned = planRef.current.find((item) => item.minute === next);
      if (planned) createEvent(next, planned);
    } else if (next % 4 === 0 || next % 7 === 0) createEvent(next);
  }

  function handleGoal(id: number, side: 'user' | 'bot') {
    if (shownRef.current.has(id)) return;
    shownRef.current.add(id);
    setShownGoalIds((current) => [...current, id]);
    setShownScore((current) => ({ ...current, [side]: current[side] + 1 }));
  }

  function createEvent(currentMinute: number, forced?: { type: MatchEvent['type']; side: MatchEvent['team'] }) {
    const userAttack = average(userTeam.filter((player) => ['LF', 'RF', 'CF'].includes(player.primary_position)));
    const botAttack = average(botTeam.filter((player) => ['LF', 'RF', 'CF'].includes(player.primary_position)));
    const userWins = userAttack + Math.random() * 20 >= botAttack + Math.random() * 20;
    const type: MatchEvent['type'] = forced
      ? forced.type
      : currentMinute % 11 === 0
        ? 'gol'
        : currentMinute % 5 === 0
          ? 'finalização'
          : currentMinute % 3 === 0
            ? 'defesa'
            : 'posse';
    const side: MatchEvent['team'] = forced ? forced.side : userWins ? 'user' : 'bot';
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
    if (planRef.current) {
      planRef.current.forEach((item) => {
        if (item.minute > minute) createEvent(item.minute, item);
      });
    } else {
      for (let i = minute; i < 90; i += 1) {
        if (i % 4 === 0 || i % 7 === 0) createEvent(i);
      }
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
      <style>{globalCss}</style>
      <Header
        nickname={nickname}
        isAdmin={isAdmin}
        onAdmin={() => navigate('admin')}
        onHome={reset}
        onLeaderboard={() => navigate('leaderboard')}
        onSquad={() => navigate('squad')}
        onLogin={() => setShowLogin(true)}
      />

      {mpNotice && (
        <div
          role="status"
          onClick={() => setMpNotice('')}
          style={{
            margin: '12px auto 0',
            maxWidth: 520,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #F5B800',
            background: 'rgba(245,184,0,.12)',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          {mpNotice} <small>(toque para fechar)</small>
        </div>
      )}

      {screen === 'lobby' && !userId && (
        <main className="flow-page">
          <div className="empty-state">
            <p>🔒 Entre na sua conta para jogar online.</p>
            <button className="gold-button" onClick={() => setShowLogin(true)}>
              Entrar ou criar conta
            </button>
          </div>
        </main>
      )}

      {screen === 'lobby' && !!userId && (
        <LobbyScreen
          teams={teams}
          room={room}
          myRole={myRole}
          busy={mpBusy}
          error={mpError}
          onBack={reset}
          onCreate={handleCreateRoom}
          onJoin={handleJoinRoom}
          onResume={resumeMpDraft}
          onWatch={watchRoom}
          onCancel={() => {
            leaveRoom();
            setMpError('');
          }}
          userId={userId}
          chatMessages={chatMessages}
          onSendChat={sendChat}
        />
      )}

      {screen === 'home' && (
        <Home
          isAdmin={isAdmin}
          onAdmin={() => navigate('admin')}
          onPlay={() => startClubChoice('classic')}
          onMultiplayer={openMultiplayer}
          loggedIn={!!userId}
          onLogin={() => setShowLogin(true)}
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
          blockedIds={blockedIds}
          onPick={pickDicePlayer}
          onBack={() => goBack('club')}
        />
      )}

      {screen === 'match' && spectating && (
        <div className="lobby-error" style={{ maxWidth: 560, margin: '8px auto', borderColor: '#F5B800', background: 'rgba(245,184,0,.1)', color: '#F5B800' }}>
          👁 Assistindo: {spectating.host} x {spectating.guest}
        </div>
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
          multiplayer={!!room}
          userId={userId}
          chatMessages={chatMessages}
          onSendChat={sendChat}
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
          onAgain={() => {
            if (spectating) {
              navigate('lobby', true);
            } else if (room) {
              leaveRoom();
              navigate('lobby', true);
            } else goBack('club');
          }}
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
          loggedIn={Boolean(userId)}
          onLogout={async () => {
            await supabase.auth.signOut();
            setIsAdmin(false);
            setUserId(null);
            setNickname('Visitante');
            setEmail('');
            setPassword('');
            setAuthMessage('');
            setShowLogin(false);
            if (screen === 'admin') reset();
          }}
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
        {isAdmin && <button onClick={onAdmin}>Admin</button>}
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
          {isAdmin && <button onClick={() => go(onAdmin)}>Admin</button>}
        </div>
      )}
    </header>
  );
}

function Home({
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

const lobbyCss = `
.lobby-page { width: 100%; max-width: 100vw; min-width: 0; box-sizing: border-box; overflow-x: clip; }
.lobby-wrap { width: min(560px, calc(100vw - 24px)); max-width: 100%; box-sizing: border-box; margin: 0 auto 28px; display: grid; gap: 16px; }
.lobby-wrap *, .lobby-card { box-sizing: border-box; }
.lobby-card { min-width: 0; }
.lobby-card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 20px; }
.lobby-step { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
.lobby-step b { flex: 0 0 34px; height: 34px; border-radius: 50%; background: #F5B800; color: #0B1016; display: grid; place-items: center; font-size: 16px; }
.lobby-step h3 { margin: 0 0 2px; font-size: 20px; letter-spacing: .5px; }
.lobby-step p { margin: 0; font-size: 14px; opacity: .7; }
.lobby-label { display: block; margin: 14px 0 8px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #F5B800; }
.lobby-clubs { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.lobby-club { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
.lobby-club { border-radius: 12px; border: 1px solid rgba(255,255,255,.12); }
.lobby-club { background: rgba(255,255,255,.03); color: inherit; }
.lobby-club { cursor: pointer; text-align: left; min-width: 0; }
.lobby-club i { flex: 0 0 30px; height: 30px; border-radius: 8px; }
.lobby-club i { background: var(--club, #444); display: grid; place-items: center; }
.lobby-club i { font-style: normal; font-size: 10px; font-weight: 900; color: #fff; }
.lobby-club span { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lobby-club.on { border-color: #F5B800; background: rgba(245,184,0,.14); box-shadow: 0 0 0 1px #F5B800 inset; }
.lobby-seg { display: grid; grid-template-columns: 1fr 1fr; padding: 4px; border-radius: 12px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.1); gap: 4px; }
.lobby-seg button { padding: 10px; border: 0; border-radius: 9px; background: transparent; color: inherit; font-weight: 700; cursor: pointer; }
.lobby-seg button.on { background: #F5B800; color: #0B1016; }
.lobby-main { width: 100%; margin-top: 18px; justify-content: center; }
.lobby-or { display: flex; align-items: center; gap: 12px; font-size: 12px; letter-spacing: 2px; opacity: .55; }
.lobby-or i { flex: 1; height: 1px; background: rgba(255,255,255,.2); }
.lobby-join { display: flex; gap: 10px; }
.lobby-join input { flex: 1; min-width: 0; font-size: 26px; font-weight: 800; }
.lobby-join input { letter-spacing: 10px; text-align: center; text-transform: uppercase; }
.lobby-join input { padding: 10px 12px; border-radius: 12px; outline: none; }
.lobby-join input { border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.4); color: #fff; }
.lobby-join input::placeholder { color: rgba(255,255,255,.25); }
.lobby-join input:focus { border-color: #F5B800; }
.lobby-error { padding: 10px 14px; border-radius: 10px; border: 1px solid #ff6b6b; background: rgba(255,107,107,.1); color: #ffb3b3; font-size: 14px; text-align: center; }
@media (max-width: 720px) {
.lobby-page .flow-heading p { display: none; }
.lobby-wrap { gap: 10px; margin-bottom: 20px; }
.lobby-card { padding: 14px; border-radius: 14px; }
.lobby-step { gap: 10px; margin-bottom: 10px; }
.lobby-step b { flex-basis: 28px; height: 28px; font-size: 14px; }
.lobby-step h3 { font-size: 17px; }
.lobby-step p { font-size: 12px; line-height: 1.3; }
.lobby-label { margin: 10px 0 6px; font-size: 10px; }
.lobby-clubs { grid-template-columns: 1fr 1fr; gap: 6px; }
.lobby-club { padding: 6px 8px; gap: 6px; border-radius: 10px; }
.lobby-club i { flex-basis: 24px; height: 24px; border-radius: 6px; font-size: 8px; }
.lobby-club span { font-size: 12px; }
.lobby-seg { padding: 3px; gap: 3px; }
.lobby-seg button { padding: 8px 4px; font-size: 13px; }
.lobby-main { margin-top: 12px; }
.lobby-or { font-size: 11px; gap: 8px; }
.lobby-join { gap: 8px; }
.lobby-join input { font-size: 22px; letter-spacing: 8px; padding: 8px 10px; }
.lobby-error { font-size: 13px; padding: 8px 12px; }
}
`;

function LiveMatches({ teams, onWatch }: { teams: Team[]; onWatch: (room: Room) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    async function load() {
      const list = await listLiveRooms();
      if (alive) {
        setRooms(list);
        setLoaded(true);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  const abbr = (id: string | null) => teams.find((team) => team.id === id)?.abbreviation ?? '';
  return (
    <section className="lobby-card">
      <div className="lobby-step">
        <b>3</b>
        <div>
          <h3>Assistir ao vivo</h3>
          <p>Veja as partidas que estão rolando agora. A lista atualiza sozinha.</p>
        </div>
      </div>
      {!loaded && <p style={{ margin: 0, opacity: 0.6, fontSize: 14 }}>Buscando partidas...</p>}
      {loaded && rooms.length === 0 && (
        <p style={{ margin: 0, opacity: 0.6, fontSize: 14 }}>Nenhuma partida em andamento no momento.</p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {rooms.map((item) => (
          <button
            key={item.id}
            className="lobby-club"
            style={{ justifyContent: 'space-between', width: '100%' }}
            onClick={() => onWatch(item)}
          >
            <span>
              {item.host_nick} ({abbr(item.host_team_id)}) x {item.guest_nick ?? 'Jogador'} ({abbr(item.guest_team_id)})
            </span>
            <b style={{ color: '#F5B800', fontSize: 12 }}>👁 ASSISTIR</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function LobbyScreen({
  teams,
  room,
  myRole,
  busy,
  error,
  onBack,
  onCreate,
  onJoin,
  onResume,
  onWatch,
  onCancel,
  userId,
  chatMessages,
  onSendChat,
}: {
  teams: Team[];
  room: Room | null;
  myRole: 'host' | 'guest' | null;
  busy: boolean;
  error: string;
  onBack: () => void;
  onCreate: (teamId: string, mode: 'classic' | 'dice') => void;
  onJoin: (code: string) => void;
  onResume: () => void;
  onWatch: (room: Room) => void;
  onCancel: () => void;
  userId: string | null;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => boolean;
}) {
  const [teamId, setTeamId] = useState('');
  const [roomMode, setRoomMode] = useState<'classic' | 'dice'>('classic');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const chosenTeam = teamId || teams[0]?.id || '';
  const myReady = room && myRole ? (myRole === 'host' ? room.host_ready : room.guest_ready) : false;
  const rivalName = room && myRole ? (myRole === 'host' ? room.guest_nick : room.host_nick) : null;

  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="flow-page lobby-page">
      <style>{lobbyCss}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="flow-heading">
        <div className="eyebrow">
          <Swords size={14} /> MULTIPLAYER
        </div>
        <h2>
          SALA DE <em>PARTIDA</em>
        </h2>
        <p>Jogue contra um amigo. Cada um faz o seu draft e a partida roda igual para os dois.</p>
      </div>

      {!room && (
        <div className="lobby-wrap">
          <section className="lobby-card">
            <div className="lobby-step">
              <b>1</b>
              <div>
                <h3>Criar sala</h3>
                <p>Escolha seu clube e o modo. Depois passe o código para seu amigo.</p>
              </div>
            </div>
            <span className="lobby-label">SEU CLUBE</span>
            <div className="lobby-clubs">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className={chosenTeam === team.id ? 'lobby-club on' : 'lobby-club'}
                  onClick={() => setTeamId(team.id)}
                  style={{ '--club': team.primary_color } as React.CSSProperties}
                >
                  <i>{team.abbreviation}</i>
                  <span>{team.name}</span>
                </button>
              ))}
            </div>
            <span className="lobby-label">MODO DO DRAFT</span>
            <div className="lobby-seg">
              <button
                type="button"
                className={roomMode === 'classic' ? 'on' : ''}
                onClick={() => setRoomMode('classic')}
              >
                Draft clássico
              </button>
              <button
                type="button"
                className={roomMode === 'dice' ? 'on' : ''}
                onClick={() => setRoomMode('dice')}
              >
                <span aria-hidden="true">🎲</span> Modo Dado
              </button>
            </div>
            <button
              className="gold-button large lobby-main"
              disabled={busy || !chosenTeam}
              onClick={() => onCreate(chosenTeam, roomMode)}
            >
              {busy ? 'Criando...' : 'Criar sala'}
            </button>
          </section>

          <div className="lobby-or">
            <i /> <span>OU</span> <i />
          </div>

          <section className="lobby-card">
            <div className="lobby-step">
              <b>2</b>
              <div>
                <h3>Entrar com código</h3>
                <p>Recebeu um código de um amigo? Digite aqui.</p>
              </div>
            </div>
            <div className="lobby-join">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 4))}
                placeholder="K7QX"
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
              />
              <button
                className="gold-button"
                disabled={busy || code.length < 4}
                onClick={() => onJoin(code)}
              >
                {busy ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </section>
          {error && <div className="lobby-error">{error}</div>}

          <div className="lobby-or">
            <i /> <span>OU</span> <i />
          </div>
          <LiveMatches teams={teams} onWatch={onWatch} />
        </div>
      )}

      {room && room.status === 'waiting' && (
        <div className="draft-picker" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <span className="eyebrow">CÓDIGO DA SALA</span>
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 12, margin: '10px 0', color: '#F5B800' }}>
            {room.code}
          </div>
          <button className="outline-button" onClick={() => void copyCode()}>
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
          <p style={{ margin: '16px 0', opacity: 0.8 }}>Aguardando seu amigo entrar na sala...</p>
          <button className="outline-button" onClick={onCancel}>
            Cancelar sala
          </button>
        </div>
      )}

      {room && room.status === 'drafting' && (
        <div className="draft-picker" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <span className="eyebrow">SALA {room.code}</span>
          <h3 style={{ margin: '8px 0' }}>Rival: {rivalName ?? 'Jogador'}</h3>
          {myReady ? (
            <p style={{ opacity: 0.85 }}>Seu draft está pronto. Aguardando o rival terminar o dele...</p>
          ) : (
            <>
              <p style={{ opacity: 0.85 }}>Monte seu time. A partida começa quando os dois terminarem.</p>
              <button className="gold-button" onClick={onResume}>
                Ir para o draft
              </button>
            </>
          )}
          <div style={{ marginTop: 14 }}>
            <button className="outline-button" onClick={onCancel}>
              Sair da sala
            </button>
          </div>
          <ChatBox messages={chatMessages} myId={userId} onSend={onSendChat} />
        </div>
      )}

      {room && room.status === 'playing' && (
        <div className="draft-picker" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <p>A partida está começando...</p>
        </div>
      )}
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
  blockedIds,
  onPick,
  onBack,
}: {
  club: Team;
  teams: Team[];
  players: Player[];
  selected: Partial<Record<Position, Player>>;
  blockedIds?: Set<string>;
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
  // No multiplayer, esconde quem o adversário já escolheu (se ainda sobrar opção)
  const avoid = blockedIds ?? new Set<string>();
  const hasFree = players.some(
    (player) => !pickedIds.has(player.id) && !avoid.has(player.id) && slotsFor(player).length > 0,
  );
  const squadOf = (team: Team) =>
    players.filter(
      (player) =>
        player.team_id === team.id && !pickedIds.has(player.id) && !(hasFree && avoid.has(player.id)),
    );
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
              {rolled && !cards.some((player) => slotsFor(player).length > 0) && (
                <button className="outline-button" style={{ marginTop: 8 }} onClick={() => setRolledId(null)}>
                  Sem cartas disponíveis, rolar de novo
                </button>
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

const chatCss = `
.mp-chat { width: min(560px, 100%); margin: 14px auto; text-align: left; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; overflow: hidden; }
.mp-chat-title { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #F5B800; border-bottom: 1px solid rgba(255,255,255,.08); }
.mp-chat-list { height: 150px; overflow-y: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
.mp-chat-empty { margin: auto; font-size: 13px; opacity: .55; text-align: center; }
.mp-msg { max-width: 85%; padding: 6px 10px; border-radius: 10px; font-size: 14px; line-height: 1.35; background: rgba(255,255,255,.08); align-self: flex-start; word-break: break-word; }
.mp-msg.mine { align-self: flex-end; background: rgba(245,184,0,.18); }
.mp-msg b { display: block; font-size: 11px; opacity: .65; margin-bottom: 2px; }
.mp-chat-form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(255,255,255,.08); }
.mp-chat-form input { flex: 1; min-width: 0; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.25); color: inherit; font-size: 14px; }
.mp-chat-form button { display: grid; place-items: center; width: 40px; border: 0; border-radius: 10px; background: #F5B800; color: #0B1016; cursor: pointer; }
.mp-chat-form button:disabled { opacity: .45; cursor: default; }
`;

// Chat do multiplayer: aparece na sala (draft) e durante a partida
function ChatBox({
  messages,
  myId,
  onSend,
}: {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => boolean;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function submit() {
    const clean = text.trim();
    if (!clean) return;
    if (onSend(clean)) setText('');
  }

  return (
    <section className="mp-chat">
      <style>{chatCss}</style>
      <div className="mp-chat-title">
        <MessageCircle size={14} /> CHAT DA SALA
      </div>
      <div className="mp-chat-list" ref={listRef}>
        {messages.length ? (
          messages.map((message) => (
            <div key={message.id} className={`mp-msg ${message.senderId === myId ? 'mine' : ''}`}>
              <b>{message.senderId === myId ? 'Você' : message.nick}</b>
              {message.text}
            </div>
          ))
        ) : (
          <div className="mp-chat-empty">Nenhuma mensagem ainda. Mande um oi pro rival!</div>
        )}
      </div>
      <div className="mp-chat-form">
        <input
          value={text}
          maxLength={200}
          placeholder="Digite uma mensagem..."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <button type="button" aria-label="Enviar mensagem" onClick={submit} disabled={!text.trim()}>
          <Send size={16} />
        </button>
      </div>
    </section>
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
  multiplayer,
  userId,
  chatMessages,
  onSendChat,
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
  multiplayer: boolean;
  userId: string | null;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => boolean;
}) {
  // O lance do gol só aparece no feed depois que a bola entrou na animação
  const feed = events.filter((event) => event.type !== 'gol' || shownGoalIds.includes(event.id));
  return (
    <main className="match-page">
      <div className="match-header">
        <div className="match-status">
          <span className="live-dot" /> AO VIVO · {minute}'
        </div>
        {!multiplayer && (
          <button className="skip-button" onClick={onSkip}>
            <SkipForward size={15} /> Pular partida
          </button>
        )}
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

      {multiplayer && <ChatBox messages={chatMessages} myId={userId} onSend={onSendChat} />}

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
  // Calculado uma vez por partida (não muda quando a tela é redesenhada)
  const ratings = useMemo(
    () => ({
      user: rateTeam(userTeam, score.user, score.bot, stats.userSaves, stats.userPossession),
      bot: rateTeam(botTeam, score.bot, score.user, stats.botSaves, stats.botPossession),
    }),
    [],
  );
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
          <RatingList players={userTeam} ratings={ratings.user} own />
          <RatingList players={botTeam} ratings={ratings.bot} />
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

type PlayerRating = { rating: number; goals: number; assists: number };

function pickWeighted(list: Player[], weight: (player: Player) => number) {
  const total = list.reduce((sum, player) => sum + weight(player), 0);
  let roll = Math.random() * total;
  for (const player of list) {
    roll -= weight(player);
    if (roll <= 0) return player;
  }
  return list[list.length - 1];
}

// Nota de cada jogador: depende do resultado, de gols, defesas e de um pouco de sorte
function rateTeam(
  team: Player[],
  goalsFor: number,
  goalsAgainst: number,
  saves: number,
  possession: number,
): Record<string, PlayerRating> {
  const out: Record<string, PlayerRating> = {};
  team.forEach((player) => {
    out[player.id] = { rating: 0, goals: 0, assists: 0 };
  });
  const attackers = team.filter((player) => ['LF', 'RF', 'CF'].includes(player.primary_position));
  const outfield = team.filter((player) => player.primary_position !== 'GK');
  for (let i = 0; i < goalsFor && outfield.length; i += 1) {
    const pool = attackers.length && Math.random() < 0.85 ? attackers : outfield;
    const scorer = pickWeighted(pool, (player) => player.overall);
    out[scorer.id].goals += 1;
    const others = outfield.filter((player) => player.id !== scorer.id);
    if (others.length && Math.random() < 0.75) {
      out[pickWeighted(others, (player) => player.overall).id].assists += 1;
    }
  }
  const result = goalsFor > goalsAgainst ? 0.4 : goalsFor < goalsAgainst ? -0.3 : 0;
  const cleanSheet = goalsAgainst === 0;
  team.forEach((player) => {
    const position = player.primary_position;
    let value = 6.1 + (player.overall - 70) / 25 + result;
    value += (Math.random() + Math.random() - 1) * 0.9;
    value += out[player.id].goals * 1.1 + out[player.id].assists * 0.5;
    if (position === 'GK') {
      value += saves * 0.3 - goalsAgainst * 0.35 + (cleanSheet ? 0.7 : 0);
    } else if (position === 'LB' || position === 'RB') {
      value += (cleanSheet ? 0.5 : 0) - goalsAgainst * 0.15;
    } else if (position === 'CM') {
      value += (possession - 50) / 40;
    }
    out[player.id].rating = Math.max(4.5, Math.min(10, Math.round(value * 10) / 10));
  });
  return out;
}

function RatingList({
  players,
  ratings,
  own = false,
}: {
  players: Player[];
  ratings: Record<string, PlayerRating>;
  own?: boolean;
}) {
  const bestId = players.reduce(
    (best, player) => ((ratings[player.id]?.rating ?? 0) > (ratings[best]?.rating ?? 0) ? player.id : best),
    players[0]?.id ?? '',
  );
  return (
    <div className="rating-list">
      <span className="rating-team">{own ? 'SEU TIME' : 'RIVAL'}</span>
      {players.map((player) => {
        const info = ratings[player.id] ?? { rating: 6, goals: 0, assists: 0 };
        return (
          <div key={player.id} className={player.id === bestId ? 'best-player' : ''}>
            <span>
              {player.id === bestId && <Crown size={13} />} {player.primary_position}
            </span>
            <b>
              {player.name}
              {info.goals > 0 && <small> ⚽{info.goals > 1 ? ` x${info.goals}` : ''}</small>}
              {info.assists > 0 && <small> 🅰️{info.assists > 1 ? ` x${info.assists}` : ''}</small>}
            </b>
            <strong>{info.rating.toFixed(1)}</strong>
          </div>
        );
      })}
    </div>
  );
}

type MatchRow = {
  id: string;
  host_id: string;
  guest_id: string;
  host_nick: string;
  guest_nick: string;
  host_goals: number;
  guest_goals: number;
  created_at: string;
};
type RankRow = { id: string; nick: string; games: number; wins: number; draws: number; losses: number };

const leaderboardCss = `
.lb-head, .lb-row { display: grid; grid-template-columns: 38px 1fr 40px 40px 40px 40px 62px; }
.lb-head, .lb-row { gap: 6px; align-items: center; padding: 12px 16px; }
.lb-head { font-size: 11px; letter-spacing: 1.2px; opacity: .6; }
.lb-head span:nth-child(n+3), .lb-row > :nth-child(n+3) { text-align: center; }
.lb-row { border-top: 1px solid rgba(255,255,255,.07); }
.lb-row b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-win { color: #4ade80; font-weight: 800; }
.lb-loss { color: #f87171; }
.lb-row.click { cursor: pointer; }
.lb-row.click:hover { background: rgba(245,184,0,.07); }
.lb-hist { max-height: 340px; overflow-y: auto; margin-top: 12px; }
.lb-hist div { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; }
.lb-hist div { padding: 9px 4px; border-top: 1px solid rgba(255,255,255,.08); font-size: 14px; }
.lb-hist small { opacity: .55; display: block; font-size: 11px; }
.lb-tag { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; }
.lb-tag { font-weight: 900; font-size: 12px; color: #0B1016; }
.lb-tag.w { background: #4ade80; }
.lb-tag.e { background: #cbd5e1; }
.lb-tag.d { background: #f87171; }
.lb-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; text-align: center; }
.lb-stats div { background: rgba(255,255,255,.05); border-radius: 10px; padding: 8px 0; }
.lb-stats b { display: block; font-size: 22px; }
.lb-stats span { font-size: 10px; letter-spacing: 1px; opacity: .6; }
.lb-recent { margin-top: 22px; }
.lb-recent h3 { margin: 0 0 8px; font-size: 14px; letter-spacing: 1.5px; opacity: .7; }
.lb-match { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; }
.lb-match { padding: 10px 16px; border-top: 1px solid rgba(255,255,255,.07); font-size: 14px; }
.lb-match b:first-child { text-align: right; }
.lb-score { padding: 3px 12px; border-radius: 8px; background: rgba(255,255,255,.08); font-weight: 800; }
@media (max-width: 560px) {
  .lb-head, .lb-row { grid-template-columns: 28px 1fr 32px 32px 32px 32px 50px; padding: 10px; gap: 4px; }
}
`;

function Leaderboard({ onBack }: { onBack: () => void }) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('match_results')
        .select('id,host_id,guest_id,host_nick,guest_nick,host_goals,guest_goals,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      setMatches((data ?? []) as MatchRow[]);
      setLoaded(true);
    })();
  }, []);

  const table = useMemo(() => {
    const map = new Map<string, RankRow>();
    const touch = (id: string, nick: string) => {
      const row = map.get(id) ?? { id, nick, games: 0, wins: 0, draws: 0, losses: 0 };
      map.set(id, row);
      return row;
    };
    matches.forEach((match) => {
      const host = touch(match.host_id, match.host_nick);
      const guest = touch(match.guest_id, match.guest_nick);
      host.games += 1;
      guest.games += 1;
      if (match.host_goals > match.guest_goals) {
        host.wins += 1;
        guest.losses += 1;
      } else if (match.host_goals < match.guest_goals) {
        guest.wins += 1;
        host.losses += 1;
      } else {
        host.draws += 1;
        guest.draws += 1;
      }
    });
    const pct = (row: RankRow) => (row.games ? (row.wins * 3 + row.draws) / (row.games * 3) : 0);
    return [...map.values()].sort((a, b) => b.wins - a.wins || pct(b) - pct(a) || a.losses - b.losses);
  }, [matches]);

  return (
    <main className="simple-page">
      <style>{leaderboardCss}</style>
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
        <p>Resultados das partidas multiplayer. Vitória vale 3 pontos e empate vale 1.</p>
      </div>
      <section className="leaderboard-panel">
        <div className="lb-head">
          <span>#</span>
          <span>JOGADOR</span>
          <span>J</span>
          <span>V</span>
          <span>E</span>
          <span>D</span>
          <span>APROV.</span>
        </div>
        {table.length ? (
          table.map((row, index) => (
            <div
              className="lb-row click"
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(row.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSelected(row.id);
              }}
            >
              <strong className={`rank rank-${index + 1}`}>{index + 1}</strong>
              <div className="rank-player">
                <span>{row.nick.slice(0, 1)}</span>
                <b>{row.nick}</b>
              </div>
              <span>{row.games}</span>
              <strong className="lb-win">{row.wins}</strong>
              <span>{row.draws}</span>
              <span className="lb-loss">{row.losses}</span>
              <span>{Math.round(((row.wins * 3 + row.draws) / (row.games * 3)) * 100)}%</span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            {loaded ? 'Nenhuma partida multiplayer foi jogada ainda.' : 'Carregando ranking...'}
          </div>
        )}
      </section>

      {selected && (() => {
        const person = table.find((row) => row.id === selected);
        if (!person) return null;
        const history = matches
          .filter((match) => match.host_id === selected || match.guest_id === selected)
          .map((match) => {
            const mine = match.host_id === selected;
            const gf = mine ? match.host_goals : match.guest_goals;
            const ga = mine ? match.guest_goals : match.host_goals;
            return {
              id: match.id,
              rival: mine ? match.guest_nick : match.host_nick,
              gf,
              ga,
              tag: gf > ga ? 'w' : gf < ga ? 'd' : 'e',
              date: new Date(match.created_at).toLocaleDateString('pt-BR'),
            };
          });
        return (
          <div className="modal-backdrop" onClick={() => setSelected(null)}>
            <div className="login-modal" onClick={(event) => event.stopPropagation()}>
              <button className="close-button" onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
              <div className="eyebrow">
                <Trophy size={14} /> HISTÓRICO
              </div>
              <h2>{person.nick}</h2>
              <div className="lb-stats">
                <div><b>{person.games}</b><span>JOGOS</span></div>
                <div><b className="lb-win">{person.wins}</b><span>VITÓRIAS</span></div>
                <div><b>{person.draws}</b><span>EMPATES</span></div>
                <div><b className="lb-loss">{person.losses}</b><span>DERROTAS</span></div>
              </div>
              <div className="lb-hist">
                {history.map((item) => (
                  <div key={item.id}>
                    <span className={`lb-tag ${item.tag}`}>
                      {item.tag === 'w' ? 'V' : item.tag === 'd' ? 'D' : 'E'}
                    </span>
                    <span>
                      vs <b>{item.rival}</b>
                      <small>{item.date}</small>
                    </span>
                    <strong>
                      {item.gf} × {item.ga}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {matches.length > 0 && (
        <section className="leaderboard-panel lb-recent">
          <h3 style={{ padding: '14px 16px 0' }}>ÚLTIMAS PARTIDAS</h3>
          {matches.slice(0, 8).map((match) => (
            <div className="lb-match" key={match.id}>
              <b className={match.host_goals > match.guest_goals ? 'lb-win' : ''}>{match.host_nick}</b>
              <span className="lb-score">
                {match.host_goals} × {match.guest_goals}
              </span>
              <b className={match.guest_goals > match.host_goals ? 'lb-win' : ''} style={{ textAlign: 'left' }}>
                {match.guest_nick}
              </b>
            </div>
          ))}
        </section>
      )}
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
  loggedIn,
  onLogout,
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
  loggedIn: boolean;
  onLogout: () => void | Promise<void>;
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
  if (loggedIn) {
    return (
      <div className="modal-backdrop">
        <div className="login-modal">
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
          <div className="eyebrow">
            <LogIn size={14} /> SUA CONTA
          </div>
          <h2>
            OLÁ, <em>{nickname.toUpperCase()}</em>
          </h2>
          <p>Você está conectado.</p>
          <div className="modal-actions">
            <button className="outline-button" onClick={onClose}>
              Fechar
            </button>
            <button className="gold-button" onClick={() => void onLogout()}>
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    );
  }
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
