import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, ChevronDown, CircleUserRound, Crown, Database, Filter, Flame,
  Goal, LogIn, Menu, MessageCircle, Play, RefreshCw, Search, Send, Shield, SkipForward, Swords, Trophy, UserRound,
  Users, X, Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AdminScreen from '@/components/AdminScreen';
import MatchPitch from '@/components/MatchPitch';
import PenaltyShootout, { type Shootout } from '@/components/PenaltyShootout';
import {
  createRoom, joinRoom, fetchRoom, patchRoom, listLiveRooms, isRoomLive, lookupRoom, generatePlan, recordResult, openRoomChat,
  type Room, type PlanItem, type ChatMessage,
} from '@/lib/multiplayer';
import {
  createTournament, joinTournament, leaveTournament, startTournament, setTournamentMatch, fetchTournament,
  slotPlayers, currentSlot, slotOfRoom, slotsFor, decideWinner, SLOT_LABEL,
  type Tournament, type Slot, type TPlayer,
} from '@/lib/tournament';

type Position = 'GK' | 'LB' | 'RB' | 'CM' | 'LF' | 'RF' | 'CF';
type Screen = 'home' | 'club' | 'draft' | 'match' | 'results' | 'leaderboard' | 'squad' | 'admin' | 'lobby' | 'tournament';
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
  // Posição em que o jogador realmente jogou na partida (pode ser diferente da principal)
  slot?: Position;
};
type MatchEvent = {
  id: number;
  minute: number;
  type: 'posse' | 'finalização' | 'defesa' | 'gol';
  text: string;
  team: 'user' | 'bot';
  // Quem finalizou e quem deu o passe: a animação do campo usa isso para encenar a jogada certa
  actor?: string;
  assist?: string;
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

// Registro de cada gol da partida (autor, assistência e minuto), usado na tabela final
type GoalRecord = { minute: number; scorerId: string; assistId?: string; side: 'user' | 'bot' };

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
const slotOf = (player: Player): Position => player.slot ?? player.primary_position;
function getPlayerPositions(player: Player) {
  return [player.primary_position, ...(player.alternate_positions ?? [])];
}

// Escolhe quem finaliza o lance. Gol favorece muito os atacantes de overall alto;
// finalização comum é mais equilibrada. `roll` vai de 0 a 1.
function pickShooter(team: Player[], type: MatchEvent['type'], roll: number): Player | undefined {
  const attackers = team.filter((player) => ['LF', 'RF', 'CF'].includes(slotOf(player)));
  const pool = attackers.length ? attackers : team.filter((player) => slotOf(player) !== 'GK');
  if (!pool.length) return team[0];
  const power = type === 'gol' ? 6 : 2;
  const weights = pool.map((player) => Math.pow(Math.max(player.overall, 1) / 50, power));
  let left = roll * weights.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < pool.length; i += 1) {
    left -= weights[i];
    if (left <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Sorteio ponderado a partir de um número `roll` entre 0 e 1 (assim dá o mesmo resultado nos dois lados do multiplayer)
function pickByRoll(list: Player[], weight: (player: Player) => number, roll: number): Player | undefined {
  if (!list.length) return undefined;
  let left = roll * list.reduce((sum, player) => sum + weight(player), 0);
  for (const player of list) {
    left -= weight(player);
    if (left <= 0) return player;
  }
  return list[list.length - 1];
}

// Chance de uma partida contra o bot terminar empatada e ir para os pênaltis (0.4 = 40%)
const SHOOTOUT_CHANCE = 0.4;
// Tempo da animação da escalação do rival antes da bola rolar (o modo espectador desconta isso do relógio)
const LINEUP_REVEAL_MS = 9000;

type PlanEntry = {
  minute: number;
  type: MatchEvent['type'];
  side: 'user' | 'bot';
  // Nomes sorteados pelo anfitrião em generatePlan (iguais para os dois lados e para quem assiste)
  shooter?: string;
  keeper?: string;
};

// Ajusta o plano da partida para terminar empatado: tira gols de quem ganharia
// ou transforma um chute do outro time em gol, até os placares ficarem iguais.
function forceDrawPlan(plan: PlanEntry[]): PlanEntry[] {
  const out = plan.map((item) => ({ ...item }));
  const count = (side: 'user' | 'bot') => out.filter((item) => item.type === 'gol' && item.side === side).length;
  let guard = 0;
  while (count('user') !== count('bot') && guard < 40) {
    guard += 1;
    const lead: 'user' | 'bot' = count('user') > count('bot') ? 'user' : 'bot';
    const trail: 'user' | 'bot' = lead === 'user' ? 'bot' : 'user';
    const lowerable = out.filter((item) => item.type === 'gol' && item.side === lead);
    const raisable = out.filter(
      (item) => item.side === trail && (item.type === 'defesa' || item.type === 'finalização'),
    );
    if (raisable.length && Math.random() < 0.5) {
      raisable[Math.floor(Math.random() * raisable.length)].type = 'gol';
    } else if (lowerable.length) {
      lowerable[Math.floor(Math.random() * lowerable.length)].type = 'defesa';
    }
  }
  return out;
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
  // Multiplayer: depois de escolher os 7, revisa e ajusta as posições antes de confirmar
  const [reviewing, setReviewing] = useState(false);
  // Animação com o overall de ataque e defesa do time, mostrada quando o time fica pronto
  const [reveal, setReveal] = useState<{ squad: Partial<Record<Position, Player>>; next: () => void } | null>(null);
  // Animação da escalação do rival, mostrada antes de a partida começar
  const [lineupReveal, setLineupReveal] = useState<{ squad: Player[]; team?: Team; name?: string } | null>(null);
  const [mode, setMode] = useState<'classic' | 'dice'>('classic');
  const [botTeam, setBotTeam] = useState<Player[]>([]);
  const [userTeam, setUserTeam] = useState<Player[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [minute, setMinute] = useState(0);
  const [score, setScore] = useState({ user: 0, bot: 0 });
  const [stats, setStats] = useState<MatchStats>(emptyStats);
  const [goalLog, setGoalLog] = useState<GoalRecord[]>([]);
  const [shootout, setShootout] = useState<Shootout | null>(null);
  // Botão de teste: força a próxima partida contra o bot a terminar empatada (vai para os pênaltis)
  const [forceShootout, setForceShootout] = useState(false);
  const [penaltyPhase, setPenaltyPhase] = useState(false);
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
  const [spectating, setSpectating] = useState<{ host: string; guest: string; roomId: string } | null>(null);
  const planRef = useRef<PlanEntry[] | null>(null);
  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;
  const mpDraftRoom = useRef<string | null>(null);
  const mpPlanRoom = useRef<string | null>(null);
  const mpMatchRoom = useRef<string | null>(null);
  const mpRecorded = useRef<string | null>(null);
  const mpResetKey = useRef<string | null>(null);
  // O rival saiu da sala enquanto estávamos na tela de resultado
  const [rivalLeft, setRivalLeft] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // Torneio de 4 jogadores (duas semifinais + final, cada partida é uma sala normal)
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const tournamentRef = useRef<Tournament | null>(null);
  tournamentRef.current = tournament;
  const [tBusy, setTBusy] = useState(false);
  const [tError, setTError] = useState('');
  // Sala da minha partida do torneio (quando eu ainda não estou nela)
  const [slotRoom, setSlotRoom] = useState<Room | null>(null);
  const chatRef = useRef<ReturnType<typeof openRoomChat> | null>(null);
  // Guarda a sala dos pênaltis: se o rival sair, a sala some do estado mas a disputa continua em modo online
  const shootoutNetRef = useRef<{ roomId: string; role: 'host' | 'guest' | 'spectator' } | null>(null);
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
    return positions.flatMap((position) => {
      const found = players.find((player) => player.id === squad?.[position]);
      return found ? [{ ...found, slot: position }] : [];
    }) as Player[];
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
    if (current.status === 'waiting' || current.status === 'drafting' || current.status === 'finished') {
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
  function openTournament() {
    if (!userId) {
      setAuthMessage('Entre na sua conta para jogar o torneio.');
      setShowLogin(true);
      return;
    }
    setTError('');
    navigate('tournament');
  }
  async function handleCreateTournament(tMode: 'classic' | 'dice', tSize: 4 | 6 | 8) {
    if (!userId) return;
    setTBusy(true);
    setTError('');
    const result = await createTournament(nickname, tMode, tSize);
    setTBusy(false);
    if (result.error || !result.tournament) setTError(result.error ?? 'Erro ao criar o torneio.');
    else setTournament(result.tournament);
  }
  async function handleJoinTournament(code: string) {
    if (!userId) return;
    setTBusy(true);
    setTError('');
    const result = await joinTournament(code, nickname);
    setTBusy(false);
    if (result.error || !result.tournament) setTError(result.error ?? 'Erro ao entrar no torneio.');
    else setTournament(result.tournament);
  }
  async function handleStartTournament() {
    const current = tournamentRef.current;
    if (!current) return;
    setTBusy(true);
    setTError('');
    const result = await startTournament(current.id);
    setTBusy(false);
    if (result.error || !result.tournament) setTError(result.error ?? 'Não foi possível começar o torneio.');
    else setTournament(result.tournament);
  }
  function handleLeaveTournament() {
    const current = tournamentRef.current;
    if (current && current.status === 'waiting') void leaveTournament(current.id);
    if (roomRef.current) leaveRoom();
    setTournament(null);
    setSlotRoom(null);
    setTError('');
  }
  // Primeiro jogador da partida cria a sala e registra no torneio; o rival entra pelo código dela
  async function handleTournamentCreateMatch(teamId: string) {
    const current = tournamentRef.current;
    if (!userId || !current) return;
    const slot = currentSlot(current, userId);
    if (!slot) return;
    setTBusy(true);
    setTError('');
    const created = await createRoom(userId, nickname, teamId, current.mode);
    if (created.error || !created.room) {
      setTBusy(false);
      setTError(created.error ?? 'Erro ao criar a partida.');
      return;
    }
    setRoom(created.room);
    const registered = await setTournamentMatch(current.id, slot, { room_id: created.room.id });
    setTBusy(false);
    if (registered.error) setTError(registered.error);
    else if (registered.tournament) setTournament(registered.tournament);
  }
  async function handleTournamentJoinMatch(teamId: string) {
    if (!userId || !slotRoom) return;
    setTBusy(true);
    setTError('');
    const result = await joinRoom(slotRoom.code, userId, nickname, teamId);
    setTBusy(false);
    if (result.error || !result.room) setTError(result.error ?? 'Erro ao entrar na partida.');
    else setRoom(result.room);
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
  async function handleJoinRoom(code: string, teamId: string) {
    if (!userId) return;
    setMpBusy(true);
    setMpError('');
    const result = await joinRoom(code, userId, nickname, teamId);
    setMpBusy(false);
    if (result.error || !result.room) setMpError(result.error ?? 'Erro ao entrar na sala.');
    else setRoom(result.room);
  }
  // Revanche: marca que quer jogar de novo (1/2). Quando os dois marcam, o anfitrião reabre o draft na mesma sala.
  // Reaproveita as flags de "pronto": depois da partida, pronto = false significa "quero revanche".
  function requestRematch() {
    if (!room || !myRole || room.status === 'cancelled') return;
    const patch: Partial<Room> = myRole === 'host' ? { host_ready: false } : { guest_ready: false };
    setRoom((current) => (current ? { ...current, ...patch } : current));
    void patchRoom(room.id, patch);
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
  // Entra na partida no minuto em que ela está agora (tempo real), não do começo.
  async function watchRoom(listed: Room) {
    const target = (await fetchRoom(listed.id)) ?? listed;
    if (!isRoomLive(target)) {
      setMpNotice('Essa partida já terminou. Atualize a lista.');
      return;
    }
    const team = teams.find((item) => item.id === target.host_team_id);
    if (!team) return;
    setSelectedClub(team);
    const startedAt = target.plan.find((item) => item.startedAt)?.startedAt;
    // Cada minuto da partida dura 900 ms. Sem hora de início (partida antiga), começa do zero.
    const liveMinute = startedAt ? Math.max(0, Math.min(90, Math.floor((Date.now() - startedAt - LINEUP_REVEAL_MS) / 900))) : 0;
    spectateFrom.current = liveMinute;
    planRef.current = target.plan
      .filter((item: PlanItem) => item.minute > 0)
      .map((item: PlanItem) => ({
        minute: item.minute,
        type: item.type,
        side: item.side === 'host' ? 'user' : 'bot',
        shooter: item.shooter,
        keeper: item.keeper,
      }));
    setSpectating({ host: target.host_nick, guest: target.guest_nick ?? 'Jogador', roomId: target.id });
    beginMatch(squadPlayers(target.host_squad), squadPlayers(target.guest_squad), null);
  }
  // Ao entrar como espectador, reconstrói o que já aconteceu até o minuto atual
  const spectateFrom = useRef<number | null>(null);
  useEffect(() => {
    if (screen !== 'match' || spectateFrom.current === null || !userTeam.length || !botTeam.length) return;
    const target = spectateFrom.current;
    spectateFrom.current = null;
    (planRef.current ?? [])
      .filter((item) => item.minute <= target)
      .forEach((item) => {
        createEvent(item.minute, item);
        // Gols que já aconteceram entram direto no placar, sem esperar a animação
        if (item.type === 'gol') handleGoal(eventSeq.current, item.side);
      });
    setMinute(target);
  }, [screen, userTeam, botTeam]);
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
      shooter: item.shooter,
      keeper: item.keeper,
    }));
    const rivalTeam = teams.find((item) => item.id === (role === 'host' ? current.guest_team_id : current.host_team_id));
    beginMatch(mine, theirs, { team: rivalTeam, name: (role === 'host' ? current.guest_nick : current.host_nick) ?? undefined });
  }

  useEffect(() => {
    if (room?.id) setRivalLeft(false);
  }, [room?.id]);

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
      const inTournament = !!tournamentRef.current;
      if (!inTournament) setMpNotice('O adversário saiu da sala.');
      if (screen === 'results') setRivalLeft(true);
      if (screen === 'lobby' || screen === 'draft') navigate(inTournament ? 'tournament' : 'home', true);
      return;
    }
    // Revanche: os dois apertaram "Jogar novamente" → o anfitrião reabre o draft na mesma sala
    if (myRole === 'host' && room.status === 'finished' && room.plan && !room.host_ready && !room.guest_ready) {
      const key = `${room.id}:${room.plan.find((item) => item.startedAt)?.startedAt ?? room.plan.length}`;
      if (mpResetKey.current !== key) {
        mpResetKey.current = key;
        const fresh: Partial<Room> = {
          status: 'drafting',
          plan: null,
          host_squad: {},
          guest_squad: {},
          host_ready: false,
          guest_ready: false,
          shootout_host: null,
          shootout_guest: null,
        };
        setRoom((current) => (current ? { ...current, ...fresh } : current));
        void patchRoom(room.id, fresh);
      }
    }
    // A sala voltou para o draft depois de uma partida: libera os controles para um novo jogo
    if (room.status === 'drafting' && mpMatchRoom.current === room.id) {
      mpMatchRoom.current = null;
      mpPlanRoom.current = null;
      mpRecorded.current = null;
      mpDraftRoom.current = null;
    }
    if (room.status === 'drafting' && mpDraftRoom.current !== room.id) {
      mpDraftRoom.current = room.id;
      const team = teams.find((item) => item.id === (myRole === 'host' ? room.host_team_id : room.guest_team_id));
      if (team) {
        setSelectedClub(team);
        setMode(room.mode);
        drawRef.current = {};
        setDraft({});
        setReviewing(false);
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
      const plan = generatePlan(squadPlayers(room.host_squad), squadPlayers(room.guest_squad), SHOOTOUT_CHANCE);
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
    // Se foi para os pênaltis, o vencedor da disputa ganha +1 gol no registro (conta como vitória normal)
    const shootoutWinner: 'host' | 'guest' | undefined =
      shootout && myRole ? (shootout.winner === 'user' ? myRole : myRole === 'host' ? 'guest' : 'host') : undefined;
    void recordResult(room, goals('host'), goals('guest'), shootoutWinner);
    // Partida de torneio: os dois lados calculam o mesmo vencedor e gravam (a gravação repetida não muda nada)
    const currentTournament = tournamentRef.current;
    const slot = currentTournament ? slotOfRoom(currentTournament, room.id) : null;
    if (currentTournament && slot && !currentTournament[slot].winner_id) {
      const hostGoals = goals('host');
      const guestGoals = goals('guest');
      const tId = currentTournament.id;
      const roomSnapshot = room;
      const localShootoutWinner = shootoutWinner;
      // Vencedor dos pênaltis pelas cobranças gravadas na sala (fonte única, igual para os dois lados)
      const winnerFromKicks = (source: Room | null): 'host' | 'guest' | undefined => {
        const kicks = source?.shootout_host?.kicks;
        if (!kicks || !kicks.length) return undefined;
        const hostPens = kicks.filter((kick) => kick.shooter === 'host' && kick.outcome === 'gol').length;
        const guestPens = kicks.filter((kick) => kick.shooter === 'guest' && kick.outcome === 'gol').length;
        if (hostPens === guestPens) return undefined;
        return hostPens > guestPens ? 'host' : 'guest';
      };
      const save = (winnerSide: 'host' | 'guest' | null, pens: boolean) => {
        const base = decideWinner(roomSnapshot, hostGoals, guestGoals);
        const winnerId = winnerSide
          ? winnerSide === 'host'
            ? roomSnapshot.host_id
            : (roomSnapshot.guest_id as string)
          : base.winnerId;
        void setTournamentMatch(tId, slot, {
          room_id: roomSnapshot.id,
          winner_id: winnerId,
          score: `${hostGoals}x${guestGoals}`,
          pens,
        }).then((result) => {
          if (result.tournament) setTournament(result.tournament);
        });
        if (pens) {
          setMpNotice(winnerId === userId ? 'Empate! Você avançou nos pênaltis.' : 'Empate! Seu rival avançou nos pênaltis.');
        }
      };
      if (hostGoals !== guestGoals) {
        save(hostGoals > guestGoals ? 'host' : 'guest', false);
      } else {
        // Empate no tempo normal: quem decide é a disputa de pênaltis. As cobranças gravadas na sala
        // mandam; só se não existirem usa o resultado jogado nesta tela, e por último o desempate fixo.
        void (async () => {
          let side = winnerFromKicks(roomSnapshot);
          for (let attempt = 0; !side && attempt < 4; attempt += 1) {
            if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 1000));
            side = winnerFromKicks(await fetchRoom(roomSnapshot.id));
          }
          save(side ?? localShootoutWinner ?? null, true);
        })();
      }
    }
  }, [screen, room]);

  // Mantém o torneio atualizado (tempo real + consulta a cada 2,5 s como reforço)
  useEffect(() => {
    if (!tournament?.id) return;
    const id = tournament.id;
    let alive = true;
    async function refresh() {
      const next = await fetchTournament(id);
      if (!alive) return;
      if (!next) return;
      if (next.status === 'cancelled') {
        setTournament(null);
        setSlotRoom(null);
        setMpNotice('O torneio foi cancelado.');
        if (screen === 'tournament') navigate('home', true);
        return;
      }
      setTournament((current) => (current && JSON.stringify(current) !== JSON.stringify(next) ? next : current));
    }
    const timer = window.setInterval(() => void refresh(), 2500);
    let channel: any = null;
    try {
      channel = supabase
        .channel(`tournament-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${id}` }, () => {
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
  }, [tournament?.id, screen]);

  // Minha partida do torneio: procura a sala que o outro jogador criou para eu poder entrar
  const mySlot: Slot | null = tournament && userId ? currentSlot(tournament, userId) : null;
  const mySlotRoomId = tournament && mySlot ? tournament[mySlot].room_id : undefined;
  const inRoom = !!room;
  useEffect(() => {
    if (!mySlotRoomId || inRoom) {
      setSlotRoom(null);
      return;
    }
    let alive = true;
    async function load() {
      const found = await fetchRoom(mySlotRoomId as string);
      if (alive) setSlotRoom(found);
    }
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [mySlotRoomId, inRoom]);

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
        setReviewing(false);
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
    else finishOrReview(nextDraft);
  }
  // No multiplayer o jogador pode ajustar as posições antes de confirmar; no solo segue direto
  function finishOrReview(finalDraft: Partial<Record<Position, Player>>) {
    if (room) setReviewing(true);
    else setReveal({ squad: finalDraft, next: () => finishDraft(finalDraft) });
  }
  // Troca dois jogadores de posição (só se os dois têm aptidão na posição do outro)
  function swapDraft(a: Position, b: Position) {
    const first = draft[a];
    const second = draft[b];
    if (!first || !second || a === b) return;
    if (!getPlayerPositions(first).includes(b) || !getPlayerPositions(second).includes(a)) return;
    const nextDraft = { ...draft, [a]: second, [b]: first };
    setDraft(nextDraft);
    syncSquad(nextDraft);
  }
  function confirmSquad() {
    const finalDraft = draft;
    setReviewing(false);
    setReveal({ squad: finalDraft, next: () => finishDraft(finalDraft) });
  }
  // Modo Dado: coloca o jogador escolhido na posição indicada
  function pickDicePlayer(player: Player, position: Position) {
    const nextDraft = { ...draft, [position]: player };
    setDraft(nextDraft);
    syncSquad(nextDraft);
    if (positions.every((item) => nextDraft[item])) finishOrReview(nextDraft);
  }
  function finishDraft(finalDraft: Partial<Record<Position, Player>>) {
    if (room) {
      // Multiplayer: marca como pronto e espera o adversário
      syncSquad(finalDraft, true);
      navigate('lobby', true);
      return;
    }
    const chosen = positions.flatMap((position) => {
      const picked = finalDraft[position];
      return picked ? [{ ...picked, slot: position }] : [];
    }) as Player[];
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
        botPlayers.push({ ...choice, slot: position });
      }
    });
    // Contra o bot também usa o plano da partida: time mais forte faz mais gols e não há empate.
    // O jogador (anfitrião do plano) é o lado "user".
    const basePlan: PlanEntry[] = generatePlan(chosen, botPlayers)
      .filter((item) => item.minute > 0)
      .map((item) => ({
        minute: item.minute,
        type: item.type,
        side: (item.side === 'host' ? 'user' : 'bot') as 'user' | 'bot',
        shooter: item.shooter,
        keeper: item.keeper,
      }));
    // De vez em quando a partida termina empatada e vai para os pênaltis
    planRef.current = forceShootout || Math.random() < SHOOTOUT_CHANCE ? forceDrawPlan(basePlan) : basePlan;
    beginMatch(chosen, botPlayers, { team: botClub });
  }
  function beginMatch(chosen: Player[], botPlayers: Player[], rivalInfo?: { team?: Team; name?: string } | null) {
    setLineupReveal(rivalInfo ? { squad: botPlayers, ...rivalInfo } : null);
    setUserTeam(chosen);
    setBotTeam(botPlayers);
    setMinute(0);
    setScore({ user: 0, bot: 0 });
    setEvents([]);
    setStats(emptyStats);
    setGoalLog([]);
    setShootout(null);
    setPenaltyPhase(false);
    setShownScore({ user: 0, bot: 0 });
    setShownGoalIds([]);
    setSkipped(false);
    eventSeq.current = 0;
    shownRef.current = new Set();
    navigate('match', true);
  }

  useEffect(() => {
    if (screen !== 'match' || minute >= 90 || skipped || lineupReveal) return;
    const timer = window.setInterval(() => advanceMatch(), 900);
    return () => window.clearInterval(timer);
  }, [screen, minute, skipped, lineupReveal]);

  // Depois dos 90 minutos, espera os gols aparecerem na animação antes de mostrar o resultado
  const goesToShootout = score.user === score.bot;
  useEffect(() => {
    if (screen !== 'match' || minute < 90) return;
    if (goesToShootout && (penaltyPhase || shootout)) return; // pênaltis em andamento
    const allShown = shownScore.user === score.user && shownScore.bot === score.bot;
    const wait = skipped ? 250 : allShown ? 2500 : 14000;
    const timer = window.setTimeout(() => {
      if (goesToShootout) setPenaltyPhase(true);
      else navigate('results', true);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [screen, minute, skipped, shownScore, score, penaltyPhase, shootout]);

  // Fim da disputa de pênaltis jogada pelo usuário: guarda o resultado e mostra a tela final
  function finishShootout(result: Shootout) {
    setShootout(result);
    setPenaltyPhase(false);
    navigate('results', true);
  }

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

  function createEvent(currentMinute: number, forced?: PlanEntry) {
    const userAttack = average(userTeam.filter((player) => ['LF', 'RF', 'CF'].includes(slotOf(player))));
    const botAttack = average(botTeam.filter((player) => ['LF', 'RF', 'CF'].includes(slotOf(player))));
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
    // Quem finaliza: sorteio ponderado pelo overall. No multiplayer/espectador o sorteio sai do minuto
    // (igual nos dois lados); no modo solo é aleatório.
    const shooterRoll =
      roomRef.current || spectating
        ? Math.abs(Math.sin(currentMinute * 12.9898 + 78.233) * 43758.5453) % 1
        : Math.random();
    const attackSquad = side === 'user' ? userTeam : botTeam;
    const defenseSquad = side === 'user' ? botTeam : userTeam;
    // Se o plano já diz quem finalizou/defendeu, usa esses nomes (assim o lance é igual para todo mundo).
    // Sem nome no plano (partida antiga), cai no sorteio de antes.
    const attackPlayer =
      (forced?.shooter ? attackSquad.find((player) => player.name === forced.shooter) : undefined) ??
      pickShooter(attackSquad, type, shooterRoll);
    const defensePlayer =
      (forced?.keeper ? defenseSquad.find((player) => player.name === forced.keeper) : undefined) ??
      defenseSquad.find((player) => slotOf(player) === 'GK') ??
      defenseSquad[0];
    const club =
      side === 'user'
        ? selectedClub?.abbreviation
        : teams.find((team) => team.id !== selectedClub?.id)?.abbreviation;
    // Sorteio de variações da narração. No multiplayer/espectador sai do minuto (igual nos dois lados);
    // no modo solo é aleatório.
    const shared = !!roomRef.current || !!spectating;
    const roll = (salt: number) =>
      shared ? Math.abs(Math.sin(currentMinute * 12.9898 + salt * 78.233) * 43758.5453) % 1 : Math.random();
    const choose = <T,>(list: T[], salt: number): T => list[Math.floor(roll(salt) * list.length) % list.length];
    // Assistência sorteada na hora do gol (igual nos dois lados do multiplayer)
    let assist: Player | undefined;
    if (type === 'gol' && attackPlayer) {
      const mates = attackSquad.filter((player) => player.id !== attackPlayer.id && slotOf(player) !== 'GK');
      const assistRoll = Math.abs(Math.sin(currentMinute * 39.3468 + 11.135) * 24634.6345) % 1;
      assist = assistRoll < 0.75 ? pickByRoll(mates, (player) => player.overall, assistRoll / 0.75) : undefined;
    }
    const shooterName = attackPlayer?.name ?? 'O atacante';
    const keeperName = defensePlayer?.name ?? 'O goleiro';
    const middle = pickByRoll(
      attackSquad.filter((player) => ['CM', 'LB', 'RB'].includes(slotOf(player))),
      () => 1,
      roll(5),
    );
    const mate = pickByRoll(
      attackSquad.filter((player) => player.id !== middle?.id && slotOf(player) !== 'GK'),
      () => 1,
      roll(6),
    );
    const goalTexts = [
      `${shooterName} bate colocado, no canto, e marca para ${club}!`,
      `${shooterName} chuta forte de fora da área e a bola explode na rede!`,
      `${shooterName} sobe mais que a zaga e cabeceia para o gol de ${club}!`,
      `${shooterName} bate de primeira, sem chance para ${keeperName}!`,
      `${shooterName} limpa a marcação e finaliza com categoria: gol de ${club}!`,
      `Contra-ataque fulminante e ${shooterName} guarda para ${club}!`,
      `${shooterName} aproveita o rebote e empurra para o fundo da rede!`,
      `${shooterName} dá uma cavadinha em cima de ${keeperName} e marca!`,
      `${shooterName} chuta cruzado, a bola passa por ${keeperName} e é gol!`,
    ];
    const goalText = assist
      ? `${choose(goalTexts, 1)} Passe de ${assist.name}.`
      : `${choose(goalTexts, 1)} Jogada individual.`;
    const shotTexts = [
      `${shooterName} finaliza de primeira, mas a bola passa por cima do gol.`,
      `${shooterName} bate cruzado e a bola sai rente à trave.`,
      `${shooterName} arrisca de longe e isola.`,
      `${shooterName} chuta torto e a bola vai pela linha de fundo.`,
      `Bola na trave! ${shooterName} quase abre o placar para ${club}.`,
      `${shooterName} cabeceia, mas sem direção.`,
      `${shooterName} fica de frente para o gol e chuta para fora.`,
    ];
    const saveTexts = [
      `${keeperName} espalma o chute de ${shooterName} para escanteio!`,
      `${keeperName} voa no canto e tira a bola do ângulo!`,
      `${keeperName} sai bem do gol e fecha o ângulo de ${shooterName}.`,
      `Defesaça de ${keeperName} no chute à queima-roupa de ${shooterName}!`,
      `${keeperName} faz a defesa segura e domina a bola.`,
      `${keeperName} cresce na hora certa e impede o gol de ${shooterName}.`,
    ];
    const possessionTexts = [
      `${club} organiza a posse no meio-campo.`,
      `${middle?.name ?? club} toca para ${mate?.name ?? 'o companheiro'} e ${club} trabalha a bola.`,
      `${club} acelera pela ponta, mas a defesa se recompõe.`,
      `${mate?.name ?? club} tenta o lançamento, a zaga corta.`,
      `Jogo disputado no meio: ${middle?.name ?? club} segura a bola para ${club}.`,
      `${club} troca passes e espera o espaço para atacar.`,
      `${middle?.name ?? club} arma o contra-ataque de ${club}.`,
      `Bola longa de ${middle?.name ?? club}, mas ${mate?.name ?? 'o atacante'} não alcança.`,
    ];
    const text =
      type === 'gol'
        ? goalText
        : type === 'finalização'
          ? choose(shotTexts, 2)
          : type === 'defesa'
            ? choose(saveTexts, 3)
            : choose(possessionTexts, 4);
    eventSeq.current += 1;
    const id = eventSeq.current;
    setEvents((current) =>
      [{ id, minute: currentMinute, type, text, team: side, actor: attackPlayer?.name, assist: assist?.name }, ...current].slice(0, 18),
    );
    // Toda finalização, defesa ou gol é um chute do time que ataca.
    // No alvo = defesa do goleiro ou gol. "Finalização" simples é o chute que sai para fora.
    const isShot = type === 'finalização' || type === 'defesa' || type === 'gol';
    const isOnTarget = type === 'defesa' || type === 'gol';
    setStats((current) => {
      const userPossession = Math.max(38, Math.min(62, current.userPossession + (side === 'user' ? 2 : -2)));
      return {
        ...current,
        userPossession,
        botPossession: 100 - userPossession,
        userShots: current.userShots + (side === 'user' && isShot ? 1 : 0),
        botShots: current.botShots + (side === 'bot' && isShot ? 1 : 0),
        userTarget: current.userTarget + (side === 'user' && isOnTarget ? 1 : 0),
        botTarget: current.botTarget + (side === 'bot' && isOnTarget ? 1 : 0),
        // A defesa é do goleiro do time que NÃO está atacando
        userSaves: current.userSaves + (side === 'bot' && type === 'defesa' ? 1 : 0),
        botSaves: current.botSaves + (side === 'user' && type === 'defesa' ? 1 : 0),
      };
    });
    if (type === 'gol') {
      setScore((current) => ({ ...current, [side]: current[side] + 1 }));
      if (attackPlayer) {
        setGoalLog((current) => [
          ...current,
          { minute: currentMinute, scorerId: attackPlayer.id, assistId: assist?.id, side },
        ]);
      }
    }
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
  // Depois da partida, a revanche só vale enquanto a sala está jogando/encerrada
  const rematchActive = !!room && (room.status === 'finished' || room.status === 'playing');
  function reset() {
    setSelectedClub(null);
    setDraft({});
        setReviewing(false);
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
  const inTournamentMatch = !!room && !!tournament && !!slotOfRoom(tournament, room.id);
  // Pênaltis no multiplayer: os dois jogam ao vivo (um bate, o outro defende); espectador só assiste
  const liveNet: { roomId: string; role: 'host' | 'guest' | 'spectator' } | undefined = spectating
    ? { roomId: spectating.roomId, role: 'spectator' }
    : room && myRole
      ? { roomId: room.id, role: myRole }
      : undefined;
  if (!penaltyPhase) shootoutNetRef.current = null;
  else if (liveNet) shootoutNetRef.current = liveNet;
  const shootoutNet = liveNet ?? (penaltyPhase ? shootoutNetRef.current ?? undefined : undefined);
  // O adversário saiu no meio da disputa
  function abortShootout() {
    setPenaltyPhase(false);
    if (spectating) {
      navigate(tournamentRef.current ? 'tournament' : 'lobby', true);
      return;
    }
    leaveRoom();
    navigate(tournamentRef.current ? 'tournament' : 'lobby', true);
  }

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
          onTournament={openTournament}
          onCancel={() => {
            leaveRoom();
            setMpError('');
          }}
          userId={userId}
          chatMessages={chatMessages}
          onSendChat={sendChat}
        />
      )}

      {screen === 'tournament' && !!userId && (
        <TournamentScreen
          teams={teams}
          userId={userId}
          tournament={tournament}
          mySlot={mySlot}
          slotRoom={slotRoom}
          room={room}
          busy={tBusy}
          error={tError}
          onBack={reset}
          onCreate={handleCreateTournament}
          onJoin={handleJoinTournament}
          onStart={handleStartTournament}
          onLeave={handleLeaveTournament}
          onCreateMatch={handleTournamentCreateMatch}
          onJoinMatch={handleTournamentJoinMatch}
          onCancelMatch={() => leaveRoom()}
          onWatch={watchRoom}
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

      {screen === 'club' && (
        <ClubChoice
          teams={teams}
          mode={mode}
          onMode={setMode}
          onBack={reset}
          onChoose={chooseClub}
          showTestTools={isAdmin || window.location.search.includes('teste')}
          forceShootout={forceShootout}
          onForceShootout={setForceShootout}
        />
      )}

      {lineupReveal && screen === 'match' && (lineupReveal.team ?? opponentTeam) && (
        <RivalReveal
          opponent={(lineupReveal.team ?? opponentTeam) as Team}
          rivalName={lineupReveal.name}
          squad={lineupReveal.squad}
          onDone={() => setLineupReveal(null)}
        />
      )}

      {reveal && selectedClub && (
        <TeamReveal
          club={selectedClub}
          squad={reveal.squad}
          onDone={() => {
            const next = reveal.next;
            setReveal(null);
            next();
          }}
        />
      )}

      {screen === 'draft' && selectedClub && reviewing && !!room && (
        <PositionEditor club={selectedClub} selected={draft} onSwap={swapDraft} onConfirm={confirmSquad} />
      )}

      {screen === 'draft' && selectedClub && !reviewing && mode === 'classic' && (
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

      {screen === 'draft' && selectedClub && !reviewing && mode === 'dice' && (
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
          stats={stats}
          penaltyPhase={penaltyPhase}
          onShootoutFinish={finishShootout}
          canSkip={!room && !spectating}
          multiplayer={!!room}
          net={shootoutNet}
          onAbort={abortShootout}
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
          goalLog={goalLog}
          shootout={shootout}
          againLabel={inTournamentMatch ? 'Voltar ao torneio' : undefined}
          onAgain={() => {
            if (spectating) {
              navigate(tournamentRef.current ? 'tournament' : 'lobby', true);
            } else if (inTournamentMatch) {
              leaveRoom();
              navigate('tournament', true);
            } else if (room && !rivalLeft && room.status !== 'cancelled') {
              requestRematch();
            } else if (room || rivalLeft) {
              leaveRoom();
              navigate('lobby', true);
            } else goBack('club');
          }}
          rematch={{
            enabled: !!room && !spectating && !inTournamentMatch,
            left: rivalLeft && !inTournamentMatch,
            mine: rematchActive && !!myRole && (myRole === 'host' ? !room?.host_ready : !room?.guest_ready),
            rival: rematchActive && !!myRole && (myRole === 'host' ? !room?.guest_ready : !room?.host_ready),
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
  showTestTools,
  forceShootout,
  onForceShootout,
}: {
  teams: Team[];
  mode: 'classic' | 'dice';
  onMode: (mode: 'classic' | 'dice') => void;
  onBack: () => void;
  onChoose: (team: Team) => void;
  showTestTools: boolean;
  forceShootout: boolean;
  onForceShootout: (value: boolean) => void;
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
@keyframes lb-spin { to { transform: rotate(360deg); } }
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
  const [reloading, setReloading] = useState(false);
  const alive = useRef(true);
  async function load() {
    const list = await listLiveRooms();
    if (alive.current) {
      setRooms(list);
      setLoaded(true);
    }
  }
  async function reload() {
    setReloading(true);
    await load();
    if (alive.current) setReloading(false);
  }
  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      alive.current = false;
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
          <p>Veja as partidas que estão rolando agora. Você entra no minuto atual do jogo.</p>
        </div>
        <button
          type="button"
          className="outline-button"
          onClick={() => void reload()}
          disabled={reloading}
          aria-label="Recarregar partidas"
          style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} style={reloading ? { animation: 'lb-spin .8s linear infinite' } : undefined} />
          {reloading ? 'Buscando...' : 'Recarregar'}
        </button>
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
  onTournament,
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
  onJoin: (code: string, teamId: string) => void;
  onResume: () => void;
  onWatch: (room: Room) => void;
  onTournament: () => void;
  onCancel: () => void;
  userId: string | null;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => boolean;
}) {
  const [teamId, setTeamId] = useState('');
  const [roomMode, setRoomMode] = useState<'classic' | 'dice'>('classic');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  // Convidado: depois de digitar o código, escolhe o clube antes de entrar
  const [found, setFound] = useState<Room | null>(null);
  const [joinTeamId, setJoinTeamId] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookError, setLookError] = useState('');
  const chosenTeam = teamId || teams[0]?.id || '';
  const joinTeams = found ? teams.filter((team) => team.id !== found.host_team_id) : [];
  const chosenJoinTeam = joinTeams.some((team) => team.id === joinTeamId) ? joinTeamId : joinTeams[0]?.id || '';

  async function findRoom() {
    if (!userId) return;
    setLooking(true);
    setLookError('');
    const result = await lookupRoom(code, userId);
    setLooking(false);
    if (result.error || !result.room) {
      setLookError(result.error ?? 'Sala não encontrada.');
      return;
    }
    setFound(result.room);
    setJoinTeamId('');
  }
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
            {!found ? (
              <div className="lobby-join">
                <input
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.toUpperCase().slice(0, 4));
                    setLookError('');
                  }}
                  placeholder="K7QX"
                  maxLength={4}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <button
                  className="gold-button"
                  disabled={looking || code.length < 4}
                  onClick={() => void findRoom()}
                >
                  {looking ? 'Buscando...' : 'Entrar'}
                </button>
              </div>
            ) : (
              <>
                <span className="lobby-label">
                  SALA {found.code} · ANFITRIÃO: {found.host_nick.toUpperCase()}
                </span>
                <span className="lobby-label" style={{ marginTop: 0 }}>SEU CLUBE</span>
                <div className="lobby-clubs">
                  {joinTeams.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      className={chosenJoinTeam === team.id ? 'lobby-club on' : 'lobby-club'}
                      onClick={() => setJoinTeamId(team.id)}
                      style={{ '--club': team.primary_color } as React.CSSProperties}
                    >
                      <i>{team.abbreviation}</i>
                      <span>{team.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="gold-button large lobby-main"
                  disabled={busy || !chosenJoinTeam}
                  onClick={() => onJoin(found.code, chosenJoinTeam)}
                >
                  {busy ? 'Entrando...' : 'Entrar na sala'}
                </button>
                <button
                  className="outline-button lobby-main"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setFound(null);
                    setLookError('');
                  }}
                >
                  Trocar código
                </button>
              </>
            )}
          </section>
          {(error || lookError) && <div className="lobby-error">{lookError || error}</div>}

          <div className="lobby-or">
            <i /> <span>OU</span> <i />
          </div>
          <section className="lobby-card">
            <div className="lobby-step">
              <b>
                <Trophy size={16} />
              </b>
              <div>
                <h3>Torneio de 4, 6 ou 8 jogadores</h3>
                <p>Mata-mata até a final. Quem ganhar a final é o campeão.</p>
              </div>
            </div>
            <button className="gold-button large lobby-main" onClick={onTournament}>
              Abrir torneio
            </button>
          </section>

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

function ClubPicker({
  teams,
  value,
  onChange,
  exclude,
}: {
  teams: Team[];
  value: string;
  onChange: (id: string) => void;
  exclude?: string | null;
}) {
  return (
    <div className="lobby-clubs">
      {teams
        .filter((team) => team.id !== exclude)
        .map((team) => (
          <button
            key={team.id}
            type="button"
            className={value === team.id ? 'lobby-club on' : 'lobby-club'}
            onClick={() => onChange(team.id)}
            style={{ '--club': team.primary_color } as React.CSSProperties}
          >
            <i>{team.abbreviation}</i>
            <span>{team.name}</span>
          </button>
        ))}
    </div>
  );
}

// Chaveamento em árvore: rodadas da esquerda para a direita, linhas ligando cada confronto e a taça no fim
function TournamentBracket({ tournament: t, userId }: { tournament: Tournament; userId: string }) {
  const six = t.seed?.length === 6;
  const eight = t.seed?.length === 8;
  const gold = '#F5B800';
  const BW = 124; // largura da caixa
  const BH = 28; // altura da caixa
  const COL = 170; // distância entre colunas
  const TOP = 34; // espaço para o título das colunas

  const mid = (list: number[]) => list.filter((_, i) => i % 2 === 0).map((y, i) => (y + list[i * 2 + 1]) / 2);
  // Com 8 jogadores as posições são calculadas: cada vencedor fica no meio das duas caixas de onde veio
  const eightQuartYs = Array.from({ length: 8 }, (_, i) => 20 + i * 38 + TOP);
  const eightSemiYs = mid(eightQuartYs);
  const eightFinalYs = mid(eightSemiYs);
  const semiYs = [20, 60, 130, 170].map((y) => y + TOP);
  const finalYs = eight ? eightFinalYs : [40, 150].map((y) => y + TOP);
  const quartYs = [40, 80, 150, 190].map((y) => y + TOP);
  const champY = eight ? mid(eightFinalYs)[0] : 95 + TOP;

  type Round = { label: string; slots: Slot[]; ys: number[] };
  const rounds: Round[] = eight
    ? [
        { label: 'QUARTAS', slots: ['q1', 'q2', 'q3', 'q4'], ys: eightQuartYs },
        { label: 'SEMIFINAIS', slots: ['m1', 'm2'], ys: eightSemiYs },
        { label: 'FINAL', slots: ['m3'], ys: eightFinalYs },
      ]
    : six
    ? [
        { label: 'QUARTAS', slots: ['q1', 'q2'], ys: quartYs },
        { label: 'SEMIFINAIS', slots: ['m1', 'm2'], ys: semiYs },
        { label: 'FINAL', slots: ['m3'], ys: finalYs },
      ]
    : [
        { label: 'SEMIFINAIS', slots: ['m1', 'm2'], ys: semiYs },
        { label: 'FINAL', slots: ['m3'], ys: finalYs },
      ];
  // Ligações de uma rodada para a próxima: caixas de origem (par) e índice da caixa de destino
  const edgesAfter = (index: number): { from: [number, number]; to: number; slot: Slot }[] => {
    const next = rounds[index + 1];
    if (!next) return [{ from: [0, 1], to: 0, slot: 'm3' }];
    if (eight && index === 0) {
      return [
        { from: [0, 1], to: 0, slot: 'q1' },
        { from: [2, 3], to: 1, slot: 'q2' },
        { from: [4, 5], to: 2, slot: 'q3' },
        { from: [6, 7], to: 3, slot: 'q4' },
      ];
    }
    if (six && index === 0) {
      return [
        { from: [0, 1], to: 1, slot: 'q1' },
        { from: [2, 3], to: 3, slot: 'q2' },
      ];
    }
    return [
      { from: [0, 1], to: 0, slot: rounds[index].slots[0] },
      { from: [2, 3], to: 1, slot: rounds[index].slots[1] },
    ];
  };

  const champX = rounds.length * COL;
  const width = champX + BW + 16;
  const height = eight ? eightQuartYs[7] + BH / 2 + 24 : 240;
  const champion = t.players.find((player) => player.id === t.m3.winner_id) ?? null;
  const finalists = slotPlayers(t, 'm3');
  const runnerUp = t.m3.winner_id ? (finalists.find((player) => player && player.id !== t.m3.winner_id) ?? null) : null;

  const cut = (text: string) => (text.length > 14 ? `${text.slice(0, 13)}…` : text);
  const line = 'rgba(255,255,255,.32)';

  function box(x: number, y: number, player: TPlayer | null, state: 'win' | 'lose' | null, key: string, tag?: string) {
    const mine = !!player && player.id === userId;
    return (
      <g key={key} opacity={state === 'lose' ? 0.5 : 1}>
        <rect
          x={x}
          y={y - BH / 2}
          width={BW}
          height={BH}
          rx={7}
          fill={mine ? 'rgba(245,184,0,.16)' : 'rgba(255,255,255,.07)'}
          stroke={mine || state === 'win' ? gold : 'rgba(255,255,255,.28)'}
          strokeWidth={mine || state === 'win' ? 1.6 : 1}
        />
        <text
          x={x + 9}
          y={y}
          dominantBaseline="central"
          fontSize={13}
          fontWeight={state === 'win' || mine ? 800 : 500}
          fill={state === 'win' ? gold : 'currentColor'}
          fontStyle={player ? 'normal' : 'italic'}
          opacity={player ? 1 : 0.5}
        >
          {player ? cut(player.nick) : 'A definir'}
        </text>
        {tag && (
          <text x={x + BW - 7} y={y} dominantBaseline="central" textAnchor="end" fontSize={9} opacity={0.6} fill="currentColor">
            {tag}
          </text>
        )}
      </g>
    );
  }

  const stateOf = (slot: Slot, player: TPlayer | null): 'win' | 'lose' | null => {
    const winner = t[slot].winner_id;
    if (!winner || !player) return null;
    return winner === player.id ? 'win' : 'lose';
  };

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Chaveamento do torneio"
        style={{ display: 'block', margin: '0 auto', maxWidth: 'none' }}
      >
        {/* títulos das colunas */}
        {rounds.map((round, index) => (
          <text key={round.label} x={index * COL + BW / 2} y={14} textAnchor="middle" fontSize={10} letterSpacing={1.5} fill={gold} opacity={0.85}>
            {round.label}
          </text>
        ))}
        <text x={champX + BW / 2} y={14} textAnchor="middle" fontSize={10} letterSpacing={1.5} fill={gold} opacity={0.85}>
          CAMPEÃO
        </text>

        {/* linhas */}
        {rounds.map((round, index) =>
          edgesAfter(index).map((edge) => {
            const xr = index * COL + BW;
            const xe = xr + 20;
            const xl = (index + 1) * COL;
            const y1 = round.ys[edge.from[0]];
            const y2 = round.ys[edge.from[1]];
            const yt = rounds[index + 1] ? rounds[index + 1].ys[edge.to] : champY;
            const match = t[edge.slot];
            return (
              <g key={`${index}-${edge.slot}`}>
                <path d={`M${xr} ${y1}H${xe}V${y2}H${xr}M${xe} ${yt}H${xl}`} fill="none" stroke={line} strokeWidth={1.3} />
                {match.score && (
                  <text x={xe + 4} y={yt - 4} fontSize={10} fontWeight={700} fill={gold}>
                    {match.score}
                  </text>
                )}
                {match.pens && (
                  <text x={xe + 4} y={yt + 11} fontSize={9} fill="currentColor" opacity={0.7}>
                    pên.
                  </text>
                )}
              </g>
            );
          }),
        )}

        {/* caixas dos jogadores */}
        {rounds.map((round, index) => {
          const pairs = round.slots.flatMap((slot) => slotPlayers(t, slot).map((player) => ({ slot, player })));
          return pairs.map((entry, i) => {
            // Com 6 jogadores, quem tem folga já aparece direto nas semifinais
            const bye = six && round.slots[0] === 'm1' && (i === 0 || i === 2);
            return box(index * COL, round.ys[i], entry.player, stateOf(entry.slot, entry.player), `${index}-${i}`, bye ? 'folga' : undefined);
          });
        })}

        {/* taça */}
        <g transform={`translate(${champX + BW / 2} 0)`}>
          <rect x={-24} y={champY - 40} width={48} height={8} rx={2} fill="#3a3f47" />
          <rect x={-6} y={champY - 56} width={12} height={17} fill="#d9a400" />
          <path
            d={`M-28 ${champY - 106}H28C28 ${champY - 76} 14 ${champY - 58} 0 ${champY - 58}C-14 ${champY - 58} -28 ${champY - 76} -28 ${champY - 106}Z`}
            fill={gold}
            stroke="#b78a00"
            strokeWidth={1.5}
          />
          <path
            d={`M-28 ${champY - 98}C-48 ${champY - 98} -48 ${champY - 74} -20 ${champY - 72}M28 ${champY - 98}C48 ${champY - 98} 48 ${champY - 74} 20 ${champY - 72}`}
            fill="none"
            stroke="#d9a400"
            strokeWidth={4.5}
            strokeLinecap="round"
          />
          <ellipse cx={-12} cy={champY - 88} rx={4} ry={11} fill="#fff" opacity={0.35} />
        </g>
        {box(champX, champY, champion, champion ? 'win' : null, 'champion')}

        {/* 2º lugar */}
        <text x={champX + BW / 2} y={champY + 36} textAnchor="middle" fontSize={10} letterSpacing={1.5} fill="#c9ced6" opacity={0.85}>
          2º LUGAR
        </text>
        <g opacity={runnerUp ? 1 : 0.8}>
          <rect
            x={champX}
            y={champY + 44}
            width={BW}
            height={BH}
            rx={7}
            fill={runnerUp && runnerUp.id === userId ? 'rgba(201,206,214,.2)' : 'rgba(201,206,214,.1)'}
            stroke="#c9ced6"
            strokeWidth={1.2}
          />
          <text
            x={champX + 9}
            y={champY + 44 + BH / 2}
            dominantBaseline="central"
            fontSize={13}
            fontWeight={runnerUp ? 700 : 500}
            fontStyle={runnerUp ? 'normal' : 'italic'}
            fill="currentColor"
            opacity={runnerUp ? 1 : 0.5}
          >
            {runnerUp ? cut(runnerUp.nick) : 'A definir'}
          </text>
        </g>
      </svg>
    </div>
  );
}

function TournamentScreen({
  teams,
  userId,
  tournament,
  mySlot,
  slotRoom,
  room,
  busy,
  error,
  onBack,
  onCreate,
  onJoin,
  onStart,
  onLeave,
  onCreateMatch,
  onJoinMatch,
  onCancelMatch,
  onWatch,
}: {
  teams: Team[];
  userId: string;
  tournament: Tournament | null;
  mySlot: Slot | null;
  slotRoom: Room | null;
  room: Room | null;
  busy: boolean;
  error: string;
  onBack: () => void;
  onCreate: (mode: 'classic' | 'dice', size: 4 | 6 | 8) => void;
  onJoin: (code: string) => void;
  onStart: () => void;
  onLeave: () => void;
  onCreateMatch: (teamId: string) => void;
  onJoinMatch: (teamId: string) => void;
  onCancelMatch: () => void;
  onWatch: (room: Room) => void;
}) {
  const [tMode, setTMode] = useState<'classic' | 'dice'>('classic');
  const [tSize, setTSize] = useState<4 | 6 | 8>(4);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [teamId, setTeamId] = useState('');

  async function copyCode() {
    if (!tournament) return;
    try {
      await navigator.clipboard.writeText(tournament.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const gold = '#F5B800';
  const isHost = !!tournament && tournament.host_id === userId;
  const canStart = !!tournament && tournament.players.length === tournament.size;
  const nickOf = (id?: string | null) => tournament?.players.find((player) => player.id === id)?.nick ?? null;

  // Dados da minha partida atual
  const pair = tournament && mySlot ? slotPlayers(tournament, mySlot) : null;
  const iAmFirst = !!pair && pair[0]?.id === userId;
  const rival = pair ? (pair[0]?.id === userId ? pair[1] : pair[0]) : null;
  const match = tournament && mySlot ? tournament[mySlot] : null;
  const roomOpen = !!slotRoom && slotRoom.status === 'waiting' && !slotRoom.guest_id;
  const joinExclude = slotRoom?.host_team_id ?? null;
  const pickable = teams.filter((team) => team.id !== joinExclude);
  const chosenTeam = pickable.some((team) => team.id === teamId) ? teamId : pickable[0]?.id || '';

  return (
    <main className="flow-page lobby-page">
      <style>{lobbyCss}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="flow-heading">
        <div className="eyebrow">
          <Trophy size={14} /> TORNEIO
        </div>
        <h2>
          COPA <em>7V7</em>
        </h2>
        <p>Mata-mata com 4, 6 ou 8 jogadores, cada partida é um multiplayer normal. O campeão leva a taça.</p>
      </div>

      {!tournament && (
        <div className="lobby-wrap">
          <section className="lobby-card">
            <div className="lobby-step">
              <b>1</b>
              <div>
                <h3>Criar torneio</h3>
                <p>Escolha o tamanho e o modo do draft. Depois passe o código para mais {tSize - 1} amigos.</p>
              </div>
            </div>
            <span className="lobby-label">QUANTOS JOGADORES</span>
            <div className="lobby-seg" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <button type="button" className={tSize === 4 ? 'on' : ''} onClick={() => setTSize(4)}>
                4 jogadores
              </button>
              <button type="button" className={tSize === 6 ? 'on' : ''} onClick={() => setTSize(6)}>
                6 jogadores
              </button>
              <button type="button" className={tSize === 8 ? 'on' : ''} onClick={() => setTSize(8)}>
                8 jogadores
              </button>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.7 }}>
              {tSize === 4
                ? 'Duas semifinais e a final (3 partidas).'
                : tSize === 6
                  ? 'Duas quartas, duas semifinais e a final (5 partidas). Dois jogadores começam direto na semi.'
                  : 'Quatro quartas, duas semifinais e a final (7 partidas).'}
            </p>
            <span className="lobby-label">MODO DO DRAFT</span>
            <div className="lobby-seg">
              <button type="button" className={tMode === 'classic' ? 'on' : ''} onClick={() => setTMode('classic')}>
                Draft clássico
              </button>
              <button type="button" className={tMode === 'dice' ? 'on' : ''} onClick={() => setTMode('dice')}>
                <span aria-hidden="true">🎲</span> Modo Dado
              </button>
            </div>
            <button className="gold-button large lobby-main" disabled={busy} onClick={() => onCreate(tMode, tSize)}>
              {busy ? 'Criando...' : 'Criar torneio'}
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
                <p>Recebeu o código de um torneio? Digite aqui.</p>
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
              <button className="gold-button" disabled={busy || code.length < 4} onClick={() => onJoin(code)}>
                {busy ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </section>
          {error && <div className="lobby-error">{error}</div>}
        </div>
      )}

      {tournament && tournament.status === 'waiting' && (
        <div className="draft-picker" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <span className="eyebrow">CÓDIGO DO TORNEIO</span>
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 12, margin: '10px 0', color: gold }}>
            {tournament.code}
          </div>
          <button className="outline-button" onClick={() => void copyCode()}>
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
          <div style={{ margin: '18px 0', display: 'grid', gap: 6 }}>
            <span className="lobby-label" style={{ margin: 0 }}>JOGADORES ({tournament.players.length}/{tournament.size})</span>
            {tournament.players.map((player) => (
              <div key={player.id} style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,.05)' }}>
                {player.nick}
                {player.id === tournament.host_id ? ' · anfitrião' : ''}
                {player.id === userId ? ' (você)' : ''}
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              className="gold-button large lobby-main"
              disabled={busy || !canStart}
              onClick={onStart}
            >
              {busy
                ? 'Começando...'
                : canStart
                  ? `Começar torneio (${tournament.players.length} jogadores)`
                  : `Esperando jogadores (${tournament.players.length}/${tournament.size})`}
            </button>
          ) : (
            <p style={{ opacity: 0.8 }}>Aguardando o anfitrião começar o torneio...</p>
          )}
          {error && <div className="lobby-error" style={{ marginTop: 10 }}>{error}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="outline-button" onClick={onLeave}>
              {isHost ? 'Cancelar torneio' : 'Sair do torneio'}
            </button>
          </div>
        </div>
      )}

      {tournament && tournament.status !== 'waiting' && (
        <div style={{ maxWidth: 760, margin: '0 auto 14px' }}>
          <TournamentBracket tournament={tournament} userId={userId} />
        </div>
      )}

      {tournament && tournament.status !== 'waiting' && (
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gap: 12 }}>
          {tournament.status === 'finished' && (
            <div
              style={{
                textAlign: 'center',
                padding: '18px 14px',
                borderRadius: 14,
                border: `1px solid ${gold}`,
                background: 'rgba(245,184,0,.12)',
              }}
            >
              <Crown color={gold} />
              <h3 style={{ margin: '6px 0 0' }}>
                {tournament.champion_nick ? `${tournament.champion_nick} é o campeão!` : 'Torneio encerrado'}
              </h3>
              {tournament.m3.winner_id === userId && <p style={{ margin: '6px 0 0' }}>A taça é sua. 🏆</p>}
            </div>
          )}

          {tournament.status === 'playing' && !mySlot && (
            <p style={{ textAlign: 'center', opacity: 0.85 }}>
              {nickOf(userId) && tournament.seed?.includes(userId)
                ? 'Você foi eliminado. Acompanhe o resto do torneio por aqui.'
                : 'Você não está jogando este torneio.'}
            </p>
          )}

          {tournament.status === 'playing' && mySlot && pair && (
            <section className="lobby-card" style={{ textAlign: 'center' }}>
              <span className="eyebrow">SUA PARTIDA · {SLOT_LABEL[mySlot].toUpperCase()}</span>
              {!pair[0] || !pair[1] ? (
                <p style={{ margin: '12px 0 0', opacity: 0.85 }}>Aguardando o jogo anterior do chaveamento terminar...</p>
              ) : (
                <>
                  <h3 style={{ margin: '8px 0' }}>Rival: {rival?.nick ?? 'Jogador'}</h3>

                  {room ? (
                    <>
                      <p style={{ opacity: 0.85 }}>
                        {room.status === 'waiting'
                          ? 'Sala criada. Aguardando seu rival entrar...'
                          : 'Partida em andamento...'}
                      </p>
                      {room.status === 'waiting' && (
                        <button className="outline-button" onClick={onCancelMatch}>
                          Cancelar sala
                        </button>
                      )}
                    </>
                  ) : iAmFirst ? (
                    <>
                      <p style={{ opacity: 0.85 }}>
                        {match?.room_id ? 'Sua sala anterior não está mais ativa. ' : ''}
                        Escolha seu clube e crie a partida. Seu rival entra automaticamente.
                      </p>
                      <span className="lobby-label">SEU CLUBE</span>
                      <ClubPicker teams={teams} value={chosenTeam} onChange={setTeamId} />
                      <button
                        className="gold-button large lobby-main"
                        disabled={busy || !chosenTeam}
                        onClick={() => onCreateMatch(chosenTeam)}
                      >
                        {busy ? 'Criando...' : 'Criar minha partida'}
                      </button>
                    </>
                  ) : roomOpen ? (
                    <>
                      <p style={{ opacity: 0.85 }}>{pair[0]?.nick} já criou a sala. Escolha seu clube e entre.</p>
                      <span className="lobby-label">SEU CLUBE</span>
                      <ClubPicker teams={teams} value={chosenTeam} onChange={setTeamId} exclude={joinExclude} />
                      <button
                        className="gold-button large lobby-main"
                        disabled={busy || !chosenTeam}
                        onClick={() => onJoinMatch(chosenTeam)}
                      >
                        {busy ? 'Entrando...' : 'Entrar na partida'}
                      </button>
                    </>
                  ) : (
                    <p style={{ opacity: 0.85 }}>Aguardando {pair[0]?.nick} criar a sala da partida...</p>
                  )}
                </>
              )}
              {error && <div className="lobby-error" style={{ marginTop: 10 }}>{error}</div>}
            </section>
          )}

          {tournament.status === 'playing' && !room && (
            <TournamentLive tournament={tournament} exclude={mySlot} onWatch={onWatch} />
          )}

          <div style={{ textAlign: 'center' }}>
            <button className="outline-button" onClick={onLeave}>
              Sair do torneio
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// Partidas do torneio que estão rolando agora: qualquer um do torneio pode assistir ao vivo
function TournamentLive({
  tournament: t,
  exclude,
  onWatch,
}: {
  tournament: Tournament;
  exclude: Slot | null;
  onWatch: (room: Room) => void;
}) {
  const [live, setLive] = useState<{ slot: Slot; room: Room }[]>([]);
  const open = slotsFor(t)
    .filter((slot) => slot !== exclude && t[slot].room_id && !t[slot].winner_id)
    .map((slot) => ({ slot, roomId: t[slot].room_id as string }));
  const key = JSON.stringify(open);
  useEffect(() => {
    let alive = true;
    async function load() {
      const found = await Promise.all(
        open.map(async (item) => ({ slot: item.slot, room: await fetchRoom(item.roomId) })),
      );
      if (!alive) return;
      setLive(
        found.filter((item): item is { slot: Slot; room: Room } => !!item.room && isRoomLive(item.room)),
      );
    }
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [key]);
  return (
    <section className="lobby-card">
      <span className="lobby-label" style={{ margin: '0 0 8px' }}>ASSISTIR AO VIVO</span>
      {live.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.6, fontSize: 14 }}>Nenhuma partida do torneio rolando agora.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {live.map((item) => (
            <button
              key={item.slot}
              className="lobby-club"
              style={{ justifyContent: 'space-between', width: '100%' }}
              onClick={() => onWatch(item.room)}
            >
              <span>
                {SLOT_LABEL[item.slot]}: {item.room.host_nick} x {item.room.guest_nick ?? 'Jogador'}
              </span>
              <b style={{ color: '#F5B800', fontSize: 12 }}>👁 ASSISTIR</b>
            </button>
          ))}
        </div>
      )}
    </section>
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

// Média de overall de um grupo de posições do time
function groupAverage(squad: Partial<Record<Position, Player>>, group: Position[]) {
  const list = group.map((position) => squad[position]).filter(Boolean) as Player[];
  return list.length ? Math.round(list.reduce((sum, player) => sum + player.overall, 0) / list.length) : 0;
}

// Animação de fim de draft: o overall do ataque e da defesa sobe até o valor final
function TeamReveal({ club, squad, onDone }: { club: Team; squad: Partial<Record<Position, Player>>; onDone: () => void }) {
  const atk = groupAverage(squad, ['LF', 'RF', 'CF']);
  const def = groupAverage(squad, ['GK', 'LB', 'RB', 'CM']);
  const overall = average(Object.values(squad).filter(Boolean) as Player[]) || 0;
  const [t, setT] = useState(0);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  useEffect(() => {
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      setT(1);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const value = Math.min(1, (now - start) / 2600);
      setT(value);
      if (value < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Segue sozinho depois de alguns segundos, para não travar quem não clicar
  useEffect(() => {
    const timer = window.setTimeout(finish, 7000);
    return () => window.clearTimeout(timer);
  }, []);
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const atkP = ease(t / 0.55);
  const defP = ease((t - 0.3) / 0.55);
  const ovrP = ease((t - 0.6) / 0.4);
  const rows = [
    { label: 'ATAQUE', hint: 'LF · RF · CF', value: atk, progress: atkP, color: '#ef4444' },
    { label: 'DEFESA', hint: 'GK · LB · RB · CM', value: def, progress: defP, color: '#3b82f6' },
  ];
  return (
    <div
      role="dialog"
      aria-label="Overall do time"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(5,8,12,.92)',
        animation: 'tr-fade .35s ease-out',
      }}
    >
      <style>{`
        @keyframes tr-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tr-pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .tr-pop { animation: none !important } }
      `}</style>
      <div style={{ width: 'min(460px, 100%)', textAlign: 'center' }}>
        <div className="eyebrow">SEU TIME ESTÁ PRONTO</div>
        <h2 style={{ margin: '6px 0 22px' }}>
          {club.name.toUpperCase()}
        </h2>
        <div style={{ display: 'grid', gap: 16 }}>
          {rows.map((row) => (
            <div key={row.label} style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, letterSpacing: 2, fontSize: 13 }}>
                  {row.label} <small style={{ opacity: 0.5, fontWeight: 600, letterSpacing: 1 }}>{row.hint}</small>
                </span>
                <strong style={{ fontSize: 44, lineHeight: 1, color: row.color, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(row.value * row.progress)}
                </strong>
              </div>
              <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,.1)', overflow: 'hidden', marginTop: 6 }}>
                <div
                  style={{
                    width: `${Math.min(100, row.value * row.progress)}%`,
                    height: '100%',
                    borderRadius: 6,
                    background: row.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div
          className="tr-pop"
          style={{
            marginTop: 26,
            opacity: ovrP,
            animation: ovrP > 0 ? 'tr-pop .5s ease-out' : undefined,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: '#F5B800' }}>OVERALL DO TIME</span>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(overall * ovrP)}
          </div>
        </div>
        <button className="gold-button large lobby-main" onClick={finish} style={{ opacity: t >= 1 ? 1 : 0.6 }}>
          Continuar
        </button>
      </div>
    </div>
  );
}

// Animação antes da partida: a escalação do rival entra jogador por jogador (posição e overall), depois o overall do time
function RivalReveal({
  opponent,
  rivalName,
  squad,
  onDone,
}: {
  opponent: Team;
  rivalName?: string;
  squad: Player[];
  onDone: () => void;
}) {
  const ordered = positions.flatMap((position) => squad.filter((player) => slotOf(player) === position));
  const bySlot: Partial<Record<Position, Player>> = {};
  squad.forEach((player) => {
    bySlot[slotOf(player)] = player;
  });
  const atk = groupAverage(bySlot, ['LF', 'RF', 'CF']);
  const def = groupAverage(bySlot, ['GK', 'LB', 'RB', 'CM']);
  const overall = average(squad);
  const STEP = 380; // intervalo entre um jogador e o próximo
  const statsAt = ordered.length * STEP + 500;
  const [t, setT] = useState(0);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  useEffect(() => {
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      setT(1e6);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      setT(elapsed);
      if (elapsed < statsAt + 2200) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Segue sozinho para a partida começar nos dois lados quase ao mesmo tempo
  useEffect(() => {
    const timer = window.setTimeout(finish, LINEUP_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const statP = ease((t - statsAt) / 1600);
  const ovrP = ease((t - statsAt - 700) / 1200);
  const tones = { special: '#F5B800', gold: '#d4a63a', silver: '#bcc3cd', bronze: '#b8743f' };
  const ready = t >= statsAt + 1800;
  return (
    <div
      role="dialog"
      aria-label="Escalação do rival"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        overflowY: 'auto',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(5,8,12,.94)',
        animation: 'lr-fade .35s ease-out',
      }}
    >
      <style>{`
        @keyframes lr-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lr-in { from { opacity: 0; transform: translateX(-40px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes lr-pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .lr-row, .lr-pop { animation: none !important; opacity: 1 !important } }
      `}</style>
      <div style={{ width: 'min(460px, 100%)', textAlign: 'center' }}>
        <div className="eyebrow">{rivalName ? `SEU RIVAL · ${rivalName.toUpperCase()}` : 'SEU RIVAL'}</div>
        <h2 style={{ margin: '6px 0 16px' }}>{opponent.name.toUpperCase()}</h2>
        <div style={{ display: 'grid', gap: 6, textAlign: 'left' }}>
          {ordered.map((player, index) => {
            const color = tones[colorForOverall(player.overall) as keyof typeof tones];
            return (
              <div
                key={player.id}
                className="lr-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: `1px solid ${color}`,
                  background: 'linear-gradient(90deg, rgba(255,255,255,.07), rgba(255,255,255,.02))',
                  opacity: 0,
                  animation: `lr-in .35s ease-out ${index * STEP}ms forwards`,
                }}
              >
                <b
                  style={{
                    flex: '0 0 44px',
                    textAlign: 'center',
                    padding: '5px 0',
                    borderRadius: 8,
                    background: '#F5B800',
                    color: '#0B1016',
                    fontSize: 14,
                  }}
                >
                  {slotOf(player)}
                </b>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player.name}
                  </span>
                  <small style={{ opacity: 0.6, fontSize: 11 }}>{getPlayerPositions(player).join(' · ')}</small>
                </span>
                <strong style={{ fontSize: 26, color, fontVariantNumeric: 'tabular-nums' }}>{player.overall}</strong>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 18, display: 'grid', gap: 10, opacity: statP > 0 ? 1 : 0 }}>
          {[
            { label: 'ATAQUE', value: atk, color: '#ef4444' },
            { label: 'DEFESA', value: def, color: '#3b82f6' },
          ].map((row) => (
            <div key={row.label} style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, letterSpacing: 2, fontSize: 12 }}>{row.label}</span>
                <strong style={{ fontSize: 30, lineHeight: 1, color: row.color, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(row.value * statP)}
                </strong>
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,.1)', overflow: 'hidden', marginTop: 4 }}>
                <div style={{ width: `${Math.min(100, row.value * statP)}%`, height: '100%', borderRadius: 6, background: row.color }} />
              </div>
            </div>
          ))}
        </div>
        <div
          className="lr-pop"
          style={{ marginTop: 14, opacity: ovrP, animation: ovrP > 0 ? 'lr-pop .5s ease-out' : undefined }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: '#F5B800' }}>OVERALL DO RIVAL</span>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(overall * ovrP)}
          </div>
        </div>
        <button className="gold-button large lobby-main" onClick={finish} style={{ opacity: ready ? 1 : 0.6 }}>
          Começar partida
        </button>
      </div>
    </div>
  );
}

// Multiplayer: ajusta em que posição cada jogador joga, usando a posição principal ou as secundárias dele
function PositionEditor({
  club,
  selected,
  onSwap,
  onConfirm,
}: {
  club: Team;
  selected: Partial<Record<Position, Player>>;
  onSwap: (a: Position, b: Position) => void;
  onConfirm: () => void;
}) {
  const [from, setFrom] = useState<Position | null>(null);
  const canSwap = (a: Position, b: Position) => {
    const first = selected[a];
    const second = selected[b];
    return !!first && !!second && a !== b && getPlayerPositions(first).includes(b) && getPlayerPositions(second).includes(a);
  };
  const anyMove = positions.some((a) => positions.some((b) => canSwap(a, b)));

  function tap(position: Position) {
    if (from === null) {
      setFrom(position);
      return;
    }
    if (from === position) {
      setFrom(null);
      return;
    }
    if (canSwap(from, position)) {
      onSwap(from, position);
      setFrom(null);
      return;
    }
    setFrom(position);
  }

  return (
    <main className="draft-page">
      <div className="draft-head">
        <div>
          <div className="eyebrow">ÚLTIMA ETAPA · AJUSTE SEU TIME</div>
          <h2>
            POSIÇÕES <em>{club.abbreviation}</em>
          </h2>
        </div>
        <div className="draft-progress">
          <strong>7</strong>
          <span>/ 7 jogadores</span>
        </div>
      </div>
      <div className="draft-layout">
        <section className="draft-picker">
          <p style={{ margin: '0 0 12px', opacity: 0.8, fontSize: 14 }}>
            Toque em um jogador e depois em outro para trocar de posição. Só dá para trocar quando os dois têm aptidão
            na posição um do outro (principal ou secundária).
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {positions.map((position) => {
              const player = selected[position];
              if (!player) return null;
              const isFrom = from === position;
              const target = from !== null && !isFrom && canSwap(from, position);
              const blocked = from !== null && !isFrom && !target;
              const outOfPlace = player.primary_position !== position;
              return (
                <button
                  key={position}
                  type="button"
                  onClick={() => tap(position)}
                  aria-pressed={isFrom}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    textAlign: 'left',
                    color: 'inherit',
                    cursor: 'pointer',
                    background: isFrom ? 'rgba(245,184,0,.16)' : target ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${isFrom ? '#F5B800' : target ? '#22c55e' : 'rgba(255,255,255,.12)'}`,
                    opacity: blocked ? 0.45 : 1,
                  }}
                >
                  <b
                    style={{
                      flex: '0 0 44px',
                      textAlign: 'center',
                      padding: '6px 0',
                      borderRadius: 8,
                      background: '#F5B800',
                      color: '#0B1016',
                      fontSize: 14,
                    }}
                  >
                    {position}
                  </b>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.name}
                    </span>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {getPlayerPositions(player).map((item, index) => (
                        <small
                          key={item}
                          style={{
                            padding: '1px 6px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: item === position ? 'rgba(245,184,0,.25)' : 'rgba(255,255,255,.08)',
                            border: index === 0 ? '1px solid rgba(255,255,255,.35)' : '1px solid transparent',
                          }}
                          title={index === 0 ? 'Posição principal' : 'Posição secundária'}
                        >
                          {item}
                        </small>
                      ))}
                      {outOfPlace && <small style={{ fontSize: 11, opacity: 0.7 }}>jogando de secundária</small>}
                    </span>
                  </span>
                  <strong style={{ fontSize: 20 }}>{player.overall}</strong>
                </button>
              );
            })}
          </div>
          {!anyMove && (
            <div className="empty-state" style={{ marginTop: 12 }}>
              Nenhum jogador do seu time tem aptidão para trocar de posição.
            </div>
          )}
          <button className="gold-button large lobby-main" onClick={onConfirm}>
            Confirmar time
          </button>
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
  stats,
  penaltyPhase,
  onShootoutFinish,
  canSkip,
  multiplayer,
  net,
  onAbort,
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
  stats: MatchStats;
  penaltyPhase: boolean;
  onShootoutFinish: (result: Shootout) => void;
  canSkip: boolean;
  multiplayer: boolean;
  net?: { roomId: string; role: 'host' | 'guest' | 'spectator' };
  onAbort?: () => void;
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
        {canSkip && (
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

      {penaltyPhase ? (
        <PenaltyShootout
          club={club}
          opponent={opponent}
          userTeam={userTeam}
          botTeam={botTeam}
          onFinish={onShootoutFinish}
          net={net}
          onAbort={onAbort}
        />
      ) : (
        <MatchPitch
          club={club}
          opponent={opponent}
          userTeam={userTeam}
          botTeam={botTeam}
          events={events}
          onGoal={onGoal}
        />
      )}

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
          <MiniStat label="POSSE DE BOLA" user={stats.userPossession} bot={stats.botPossession} suffix="%" />
          <MiniStat label="FINALIZAÇÕES" user={stats.userShots} bot={stats.botShots} />
          <MiniStat label="NO ALVO" user={stats.userTarget} bot={stats.botTarget} />
          <div className="side-players">
            <span className="eyebrow">FORMAÇÕES</span>
            <h3>Seu elenco</h3>
            {userTeam.map((player) => (
              <div key={player.id}>
                <span>{slotOf(player)}</span>
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

function MiniStat({ label, user, bot, suffix = '' }: { label: string; user: number; bot: number; suffix?: string }) {
  const total = user + bot;
  const userWidth = total ? (user / total) * 100 : 50;
  return (
    <div className="mini-stat">
      <div>
        <span>{label}</span>
        <b>
          {user}
          {suffix} <i>{bot}{suffix}</i>
        </b>
      </div>
      <div className="stat-bar">
        <i style={{ width: `${userWidth}%` }} />
        <b style={{ width: `${100 - userWidth}%` }} />
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
  goalLog,
  shootout,
  onAgain,
  againLabel,
  rematch,
  onHome,
}: {
  club: Team;
  opponent: Team;
  userTeam: Player[];
  botTeam: Player[];
  score: { user: number; bot: number };
  stats: MatchStats;
  goalLog: GoalRecord[];
  shootout: Shootout | null;
  onAgain: () => void;
  againLabel?: string;
  rematch: { enabled: boolean; left: boolean; mine: boolean; rival: boolean };
  onHome: () => void;
}) {
  const rematchCount = (rematch.mine ? 1 : 0) + (rematch.rival ? 1 : 0);
  const userWon = score.user > score.bot || (score.user === score.bot && shootout?.winner === 'user');
  // Calculado uma vez por partida (não muda quando a tela é redesenhada)
  const ratings = useMemo(
    () => ({
      user: rateTeam(userTeam, score.user, score.bot, stats.userSaves, stats.userPossession, goalLog.filter((g) => g.side === 'user')),
      bot: rateTeam(botTeam, score.bot, score.user, stats.botSaves, stats.botPossession, goalLog.filter((g) => g.side === 'bot')),
    }),
    [],
  );
  return (
    <main className="results-page">
      <div className={`result-banner ${userWon ? 'win' : 'loss'}`}>
        <span className="eyebrow">FIM DE JOGO</span>
        <h1>{userWon ? 'VITÓRIA!' : score.user === score.bot && !shootout ? 'EMPATE' : 'DERROTA'}</h1>
        <p>
          {shootout
            ? userWon
              ? 'Sangue frio nos pênaltis. A vaga é sua!'
              : 'Faltou pouco nos pênaltis. O próximo draft começa agora.'
            : userWon
              ? 'Seu time jogou como uma verdadeira unidade.'
              : 'O próximo draft começa agora.'}
        </p>
      </div>
      <div className="result-score">
        <TeamMark team={club} />
        <strong>{score.user}</strong>
        <span>×</span>
        <strong>{score.bot}</strong>
        <TeamMark team={opponent} />
      </div>
      {shootout && (
        <div
          style={{
            margin: '-4px auto 18px',
            padding: '14px 16px',
            maxWidth: 560,
            borderRadius: 14,
            border: '1px solid rgba(245,184,0,.45)',
            background: 'rgba(245,184,0,.06)',
            display: 'grid',
            gap: 10,
          }}
        >
          <span className="eyebrow" style={{ textAlign: 'center' }}>
            DISPUTA DE PÊNALTIS
          </span>
          {(
            [
              ['user', club, shootout.userGoals],
              ['bot', opponent, shootout.botGoals],
            ] as const
          ).map(([side, team, goals]) => (
            <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <b style={{ minWidth: 46 }}>{team.abbreviation}</b>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                {shootout.kicks
                  .filter((kick) => kick.side === side)
                  .map((kick, index) => (
                    <span
                      key={index}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                        background: kick.scored ? '#22c55e' : '#ef4444',
                        color: '#0B1016',
                      }}
                    >
                      {kick.scored ? '✓' : '✕'}
                    </span>
                  ))}
              </div>
              <strong
                style={{ fontSize: 28, minWidth: 28, textAlign: 'right', color: shootout.winner === side ? '#F5B800' : undefined }}
              >
                {goals}
              </strong>
            </div>
          ))}
          <p style={{ margin: 0, textAlign: 'center', fontSize: 14, opacity: 0.85 }}>
            {shootout.winner === 'user' ? club.name : opponent.name} vence nos pênaltis por{' '}
            {Math.max(shootout.userGoals, shootout.botGoals)} × {Math.min(shootout.userGoals, shootout.botGoals)}
          </p>
        </div>
      )}
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
          {goalLog.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <span className="eyebrow">GOLS DA PARTIDA</span>
              {goalLog.map((goal, index) => {
                const squad = goal.side === 'user' ? userTeam : botTeam;
                const scorer = squad.find((player) => player.id === goal.scorerId);
                const assist = squad.find((player) => player.id === goal.assistId);
                return (
                  <div
                    key={`${goal.minute}-${index}`}
                    style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 14 }}
                  >
                    <strong style={{ minWidth: 34 }}>{goal.minute}'</strong>
                    <span style={{ flex: 1 }}>
                      ⚽ {scorer?.name ?? 'Gol'}
                      {assist && <small style={{ opacity: 0.6 }}> · assist. {assist.name}</small>}
                    </span>
                    <small style={{ opacity: 0.7 }}>{goal.side === 'user' ? club.abbreviation : opponent.abbreviation}</small>
                  </div>
                );
              })}
            </div>
          )}
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
      {(rematch.left || (rematch.enabled && rematchCount > 0)) && (
        <p style={{ textAlign: 'center', margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: rematch.left ? '#ffb3b3' : '#F5B800' }}>
          {rematch.left
            ? 'O rival saiu da sala.'
            : rematch.mine
              ? `Revanche ${rematchCount}/2 · esperando o rival aceitar...`
              : `O rival quer jogar de novo · ${rematchCount}/2`}
        </p>
      )}
      <div className="result-actions">
        <style>{'@keyframes rm-spin { to { transform: rotate(360deg); } }'}</style>
        <button
          className="gold-button"
          onClick={onAgain}
          disabled={rematch.enabled && rematch.mine}
          style={rematch.enabled && rematch.mine ? { opacity: 0.75, cursor: 'default' } : undefined}
        >
          <RefreshCw
            size={16}
            style={rematch.enabled && rematch.mine ? { animation: 'rm-spin 1.2s linear infinite' } : undefined}
          />{' '}
          {againLabel
            ? againLabel
            : rematch.left
            ? 'Novo jogo'
            : rematch.enabled && rematch.mine
              ? `Aguardando rival (${rematchCount}/2)`
              : rematch.enabled && rematchCount > 0
                ? `Jogar novamente (${rematchCount}/2)`
                : 'Jogar novamente'}
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

// Nota de cada jogador: depende do resultado, de gols, defesas e de um pouco de sorte
function rateTeam(
  team: Player[],
  goalsFor: number,
  goalsAgainst: number,
  saves: number,
  possession: number,
  goals: GoalRecord[],
): Record<string, PlayerRating> {
  const out: Record<string, PlayerRating> = {};
  team.forEach((player) => {
    out[player.id] = { rating: 0, goals: 0, assists: 0 };
  });
  // Gols e assistências são os que realmente aconteceram na partida (mesmos nomes do feed)
  goals.forEach((goal) => {
    if (out[goal.scorerId]) out[goal.scorerId].goals += 1;
    if (goal.assistId && out[goal.assistId]) out[goal.assistId].assists += 1;
  });
  const result = goalsFor > goalsAgainst ? 0.4 : goalsFor < goalsAgainst ? -0.3 : 0;
  const cleanSheet = goalsAgainst === 0;
  team.forEach((player) => {
    const position = slotOf(player);
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
              {player.id === bestId && <Crown size={13} />} {slotOf(player)}
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
