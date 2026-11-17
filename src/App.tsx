import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminScreen from '@/components/AdminScreen';
import { type Shootout } from '@/components/PenaltyShootout';
import StadiumBackdrop, { type BackdropCamera } from '@/components/game/StadiumBackdrop';
import { globalCss } from '@/lib/game/globalCss';
import { isFreeAgent, HALFTIME_MS, HT_BREAK_MS, HT_RETURN_MS, HT_RETURN_NO_SUBS_MS, LINEUP_REVEAL_MS, MINUTE_MS, PENALTY_PREP_MS, SHOOTOUT_CHANCE, average, forceDrawPlan, getPlayerPositions, pickByRoll, pickShooter, slotOf, type PlanEntry } from '@/lib/game/helpers';
import { BENCH_SLOTS, emptyStats, positions, slotPositionsOf, type BenchSlot, type DraftSlot, type GoalRecord, type MatchEvent, type MatchStats, type Player, type Position, type Screen, type Team } from '@/lib/game/types';
import { BENCH_KEYS, SUBS_MAX, SUBS_WINDOW_SEC, autoSubstitutions, encodeSubs, hasBench, subsDecided, subsOf, createRoom, effortLoss, fetchRoom, pingRoom, fitsSlot, generatePlan, isRoomLive, listLiveRooms, joinRoom, openRoomChat, patchRoom, recordResult, reshapeSecondHalf, setWetFrom, saveActiveRoom, clearActiveRoom, loadActiveRoom, slowdown, staminaAt, tacticOf, TACTIC_INFO, type ChatMessage, type FieldLite, type PlanItem, type Room, type Tactic } from '@/lib/multiplayer';
import { supabase } from '@/lib/supabase';
import { WhatsNew } from '@/components/game/WhatsNew';
import { SettingsPanel } from '@/components/game/SettingsPanel';
import { useBattery, useLite, usePerfMode } from '@/lib/settings';
import { loadDataCache, saveDataCache, useInstall, useOnline, useUpdateAvailable } from '@/lib/pwa';
import { createTournament, currentSlot, decideWinner, fetchTournament, joinTournament, leaveTournament, setTournamentMatch, slotOfRoom, startTournament, type Slot, type Tournament } from '@/lib/tournament';
import { cardCss } from '@/components/game/Card';
import { DiceDraftScreen } from '@/components/game/DiceDraftScreen';
import { DraftScreen } from '@/components/game/DraftScreen';
import { ClubChoice, Header, Home } from '@/components/game/HomeScreens';
import { LoadingScreen } from '@/components/game/LoadingScreen';
import { Leaderboard } from '@/components/game/Leaderboard';
import { ProfileScreen } from '@/components/game/ProfileScreen';
import { LobbyScreen } from '@/components/game/LobbyScreen';
import { LoginModal } from '@/components/game/LoginModal';
import { MatchScreen } from '@/components/game/MatchScreen';
import { ResultsScreen } from '@/components/game/ResultsScreen';
import { InviteToast } from '@/components/game/FriendsPanel';
import { useFriends, type FriendRow } from '@/lib/friends';
import FriendsScreen from '@/components/game/FriendsScreen';
import type { ClipData } from '@/components/game/ReplayPlayer';
import type { MatchMapData } from '@/lib/game/matchMap';
import { RivalReveal, TeamReveal } from '@/components/game/Reveals';
import { Squad } from '@/components/game/SquadScreen';
import { addProgress } from '@/lib/cosmetics';
import { pickAmbience, wetFromOf, type Ambience } from '@/lib/game/ambience';
import { MP_DELAY, MP_LEAD, MP_SP_OPEN, decodeReqs, encodeReqs, mpSetPieces, retuneItems, seeded, shoutItems, type Req } from '@/lib/game/mpdyn';
import { SHOUTS_PER_MATCH, SHOUT_COOLDOWN, SHOUT_MINUTES, SHOUT_STAMINA, SWITCH_COST, applyShout, retuneForTactic, type Shout } from '@/lib/game/coach';
import { SHOUT_INFO } from '@/lib/game/coach';
import { pickSetPieceMinutes, rollSetPiece, setPieceText, SET_OPTIONS, type SetKind, type SetOption } from '@/lib/game/setpiece';
import { BenchPicker, PositionEditor, TacticPicker } from '@/components/game/TeamSetup';
import { TournamentScreen } from '@/components/game/TournamentScreen';

function App() {
  const initialScreen: Screen = window.location.pathname === '/admin' ? 'admin' : 'home';
  const [screen, setScreenState] = useState<Screen>(initialScreen);
  const baseScreen = useRef<Screen>(initialScreen);
  const clubRef = useRef<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  // "Free Agent" não é clube: guarda os jogadores sem time. Fica fora da escolha de clube, do adversário, do lobby e do torneio.
  const clubs = teams.filter((team) => !isFreeAgent(team));
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedClub, setSelectedClub] = useState<Team | null>(null);
  clubRef.current = selectedClub;
  const [draft, setDraft] = useState<Partial<Record<Position, Player>>>({});
  const [benchDraft, setBenchDraft] = useState<Partial<Record<BenchSlot, Player>>>({});
  // Cópia síncrona do banco do draft: o envio para a sala (syncSquad) precisa do valor mais recente
  const benchDraftRef = useRef<Partial<Record<BenchSlot, Player>>>({});
  benchDraftRef.current = benchDraft;
  // Multiplayer: depois de escolher os 7, revisa e ajusta as posições antes de confirmar
  const [reviewing, setReviewing] = useState(false);
  // Animação com o overall de ataque e defesa do time, mostrada quando o time fica pronto
  const [reveal, setReveal] = useState<{ squad: Partial<Record<Position, Player>>; bench: Player[]; tactic: Tactic; next: () => void } | null>(null);
  // Animação da escalação do rival, mostrada antes de a partida começar
  const matchMapRef = useRef<MatchMapData | null>(null);
  const [lineupReveal, setLineupReveal] = useState<{ squad: Player[]; bench?: Player[]; team?: Team; name?: string; tactic?: Tactic } | null>(null);
  // Escolha da tática depois do draft: `next` continua o fluxo com a tática escolhida
  // Escolha do banco de reservas (só contra o bot): candidatos sorteados entre quem sobrou, e a escolha feita
  const [benchStep, setBenchStep] = useState<{ candidates: Player[]; next: () => void } | null>(null);
  const benchRef = useRef<Player[] | null>(null);
  const [tacticStep, setTacticStep] = useState<{ squad: Partial<Record<Position, Player>>; next: (tactic: Tactic, captain: string) => void } | null>(null);
  const [mode, setMode] = useState<'classic' | 'dice'>('classic');
  const [botTeam, setBotTeam] = useState<Player[]>([]);
  const [userTeam, setUserTeam] = useState<Player[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [minute, setMinute] = useState(0);
  // Acréscimos: minutos extras já corridos no fim do 1º (45+n) ou do 2º tempo (90+n)
  const [extra, setExtra] = useState(0);
  // 'halftime' enquanto a animação do intervalo está na tela
  const [pause, setPause] = useState<'halftime' | 'break' | 'subs' | 'return' | 'setpiece' | null>(null);
  // Bolas paradas com jogada ensaiada (só contra o bot): minutos sorteados no apito inicial
  const setPieces = useRef<{ user: number[]; bot: number[] } | null>(null);
  // Técnico (só contra o bot): gritos restantes e o grito em vigor
  const [coach, setCoach] = useState<{ shouts: number; until: number; shout: Shout | null }>({ shouts: SHOUTS_PER_MATCH, until: 0, shout: null });
  const [setPiece, setSetPiece] = useState<{ kind: SetKind; minute: number; floating?: boolean } | null>(null);
  // Cansaço e substituições (só contra o bot): reservas, táticas da partida, quem saiu e o resumo das trocas
  const [userBench, setUserBench] = useState<Player[]>([]);
  const [botBench, setBotBench] = useState<Player[]>([]);
  const [matchTactics, setMatchTactics] = useState<{ user: Tactic; bot: Tactic }>({ user: 'equilibrada', bot: 'equilibrada' });
  const [leftUser, setLeftUser] = useState<Player[]>([]);
  const [leftBot, setLeftBot] = useState<Player[]>([]);
  const [subsLog, setSubsLog] = useState<{ user: string[]; bot: string[] }>({ user: [], bot: [] });
  // O campo soma o esforço de cada jogador (`effort`) e lê o quanto cada um está lento por cansaço (`slow`)
  const workRef = useRef<{ effort: Record<string, number>; slow: Record<string, number>; stamina?: Record<string, number> }>({ effort: {}, slow: {} });
  const [score, setScore] = useState({ user: 0, bot: 0 });
  const [stats, setStats] = useState<MatchStats>(emptyStats);
  const [goalLog, setGoalLog] = useState<GoalRecord[]>([]);
  // Todos os lances da partida (menos posse de bola), para o resumo "Melhores momentos" da tela final
  const [highlights, setHighlights] = useState<MatchEvent[]>([]);
  const [clips, setClips] = useState<Record<number, ClipData>>({});
  const handleClip = useCallback((eventId: number, clip: ClipData) => setClips((current) => ({ ...current, [eventId]: clip })), []);
  const [shootout, setShootout] = useState<Shootout | null>(null);
  // Botão de teste: força a próxima partida contra o bot a terminar empatada (vai para os pênaltis)
  const [forceShootout, setForceShootout] = useState(false);
  // Dificuldade do bot: quantas cartas ele sorteia por posição no draft (mais cartas = time mais forte)
  const [botLevel, setBotLevel] = useState<1 | 3 | 5>(3);
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
  const friends = useFriends(userId, nickname);
  // Convite aceito: a tela do multiplayer procura a sala sozinha
  const [inviteCode, setInviteCode] = useState<string | null>(null);
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
  const drawRef = useRef<Partial<Record<DraftSlot, string[]>>>({});
  // Trocas de cartas do draft: só 1 por draft (reembaralha as 3 cartas da posição, ou rola o dado de novo)
  const [rerolls, setRerolls] = useState(1);
  // Placar mostrado na tela: só sobe quando a bola entra no gol na animação
  const [shownScore, setShownScore] = useState({ user: 0, bot: 0 });
  const [shownGoalIds, setShownGoalIds] = useState<number[]>([]);
  const [skipped, setSkipped] = useState(false);
  const eventSeq = useRef(0);
  const halftimeDone = useRef(false);
  // Tempo de espera fixo antes do intervalo quando saiu gol no fim do 1º tempo (para a jogada terminar na animação)
  const halftimeWait = useRef(0);
  // Fim do 1º tempo: o apito só toca com a bola fora de jogo (lateral). endHalf pede a bola fora; deadBall diz que ela está fora.
  const endHalfRef = useRef(false);
  const deadBallRef = useRef(false);
  const eventsRef = useRef<MatchEvent[]>([]);
  // Muda quando o 2º tempo começa: o campo recomeça com a saída de bola
  const [restartKey, setRestartKey] = useState(0);
  const shownRef = useRef<Set<number>>(new Set());

  const online = useOnline();
  const update = useUpdateAvailable();
  // Tempo da partida contra o bot (sorteado no apito inicial, para o sorteio do jogo e a tela usarem o mesmo)
  const [botAmb, setBotAmb] = useState<Ambience | undefined>(undefined);
  const perfMode = usePerfMode();
  const liteNow = useLite();
  const battery = useBattery();
  const [batteryNote, setBatteryNote] = useState(false);
  const batteryWarned = useRef(false);
  // Bateria baixa no modo automático: avisa uma vez que os efeitos foram reduzidos
  useEffect(() => {
    if (battery.low && perfMode === 'auto' && !batteryWarned.current) {
      batteryWarned.current = true;
      setBatteryNote(true);
      const id = window.setTimeout(() => setBatteryNote(false), 6000);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [battery.low, perfMode]);
  const [showSettings, setShowSettings] = useState(false);
  const [showNews, setShowNews] = useState(false);
  // Amigo escolhido na tela de Amigos para receber o convite quando a sala for criada no Multiplayer
  const [inviteTarget, setInviteTarget] = useState<FriendRow | null>(null);
  const install = useInstall();
  // true quando os times e jogadores vieram da cópia guardada no aparelho (sem internet)
  const [usingCache, setUsingCache] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  // Voltou a internet depois de abrir offline: baixa os dados atuais
  useEffect(() => {
    if (online && usingCache) void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

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
    const onBack = () => void checkAdmin();
    window.addEventListener('online', onBack);
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => void checkAdmin(), 0);
    });
    return () => {
      window.removeEventListener('online', onBack);
      sub.subscription.unsubscribe();
    };
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
    let teamResponse;
    let playerResponse;
    try {
      [teamResponse, playerResponse] = await Promise.all([
        supabase.from('teams').select('*').order('name'),
        supabase.from('players').select('*').order('overall', { ascending: false }),
      ]);
    } catch {
      teamResponse = { data: null, error: new Error('offline') };
      playerResponse = { data: null, error: new Error('offline') };
    }
    if (teamResponse.error || playerResponse.error) {
      // Sem internet (ou banco fora do ar): usa a cópia da última vez que o app abriu online, para jogar contra o bot
      const cached = loadDataCache<Team, Player>();
      if (cached) {
        setTeams(cached.teams);
        setPlayers(cached.players.map((player) => ({ ...player, team: cached.teams.find((item) => item.id === player.team_id) })));
        setUsingCache(true);
        setLoading(false);
        return;
      }
      setError('Não foi possível carregar o elenco agora.');
      setLoading(false);
      return;
    }
    const loadedTeams = (teamResponse.data ?? []) as Team[];
    const loadedPlayers = (playerResponse.data ?? []) as Player[];
    saveDataCache(loadedTeams, loadedPlayers);
    setUsingCache(false);
    const withTeam = loadedPlayers.map((player) => ({
      ...player,
      team: loadedTeams.find((item) => item.id === player.team_id),
    }));
    setTeams(loadedTeams);
    setPlayers(withTeam);
    setLoading(false);
  }

  const featuredPlayers = useMemo(() => {
    const byOverall = (a: Player, b: Player) => b.overall - a.overall;
    const withImg = players.filter((p) => p.image_url).sort(byOverall);
    const rest = players.filter((p) => !p.image_url).sort(byOverall);
    return [...withImg, ...rest].slice(0, 5);
  }, [players]);
  const [liveRoomCount, setLiveRoomCount] = useState(0);
  useEffect(() => {
    if (screen !== 'home' || !userId) return;
    let alive = true;
    void listLiveRooms().then((rooms) => alive && setLiveRoomCount(rooms.length)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [screen, userId]);
  const myRole: 'host' | 'guest' | null = room && userId ? (room.host_id === userId ? 'host' : 'guest') : null;
  const theirSquad = room ? (myRole === 'host' ? room.guest_squad : room.host_squad) : null;
  // Jogadores que o adversário já escolheu no draft multiplayer
  const blockedIds = new Set<string>(theirSquad ? Object.values(theirSquad) : []);

  function squadIds(source: Partial<Record<Position, Player>>, tactic?: Tactic, captain?: string) {
    const out: Record<string, string> = {};
    // A tática vai junto do time (chave `_t`), assim o anfitrião lê os dois lados ao gerar a partida
    if (tactic) out._t = tactic;
    // O capitão também vai junto do time (chave `_c` = id do jogador)
    if (captain) out._c = captain;
    positions.forEach((position) => {
      const player = source[position];
      if (player) out[position] = player.id;
    });
    // O banco também vai junto (chaves BD/BM/BA): o rival não pode repetir esses jogadores e as trocas do intervalo usam eles
    BENCH_SLOTS.forEach((slot) => {
      const reserve = benchDraftRef.current[slot.id];
      if (reserve) out[slot.id] = reserve.id;
    });
    return out;
  }
  // Reservas da escalação: os do draft (ou os escolhidos no modo dado)
  function currentBench(): Player[] {
    if (benchRef.current?.length) return benchRef.current;
    return BENCH_SLOTS.flatMap((slot) => (benchDraftRef.current[slot.id] ? [benchDraftRef.current[slot.id] as Player] : []));
  }
  function benchOfSquad(squad: Record<string, string> | null | undefined) {
    return BENCH_KEYS.flatMap((key) => {
      const found = players.find((player) => player.id === squad?.[key]);
      return found ? [found] : [];
    });
  }
  function squadPlayers(squad: Record<string, string> | null | undefined) {
    return positions.flatMap((position) => {
      const found = players.find((player) => player.id === squad?.[position]);
      return found ? [{ ...found, slot: position, captain: !!squad?._c && squad._c === found.id }] : [];
    }) as Player[];
  }
  // Envia as escolhas do draft para a sala (e marca como pronto no fim)
  function syncSquad(source: Partial<Record<Position, Player>>, ready = false, tactic?: Tactic, captain?: string) {
    if (!room || !myRole) return;
    const patch: Partial<Room> =
      myRole === 'host'
        ? { host_squad: squadIds(source, tactic, captain), ...(ready ? { host_ready: true } : {}) }
        : { guest_squad: squadIds(source, tactic, captain), ...(ready ? { guest_ready: true } : {}) };
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
  function openFriends() {
    if (!userId) {
      setAuthMessage('Entre na sua conta para usar a lista de amigos.');
      setShowLogin(true);
      return;
    }
    setMpError('');
    navigate('friends');
  }
  // Convidar um amigo: com sala aberta avisa na hora; sem sala, leva para o Multiplayer com o amigo já escolhido
  async function handleInviteFriend(friend: FriendRow) {
    if (!userId) return;
    setMpError('');
    if (room) {
      if (myRole === 'host' && room.status === 'waiting') {
        const sent = await friends.sendInvite(friend.user_id, room.code, room.mode);
        if (sent) navigate('lobby');
        else setMpError(`Não foi possível avisar ${friend.nickname}. Passe o código ${room.code} para ele.`);
      } else setMpError('Saia da sala atual para convidar um amigo.');
      return;
    }
    setInviteTarget(friend);
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
  async function handleStartTournament(seed?: string[]) {
    const current = tournamentRef.current;
    if (!current) return;
    setTBusy(true);
    setTError('');
    const result = await startTournament(current.id, seed);
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
    if (result.error || !result.room) {
      setMpBusy(false);
      setMpError(result.error ?? 'Erro ao criar a sala.');
      return;
    }
    setRoom(result.room);
    if (inviteTarget) {
      const sent = await friends.sendInvite(inviteTarget.user_id, result.room.code, result.room.mode);
      if (!sent) setMpError(`Não foi possível avisar ${inviteTarget.nickname}. Passe o código ${result.room.code} para ele.`);
      setInviteTarget(null);
    }
    setMpBusy(false);
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
    planRef.current = target.plan
      .filter((item: PlanItem) => item.minute > 0)
      .map((item: PlanItem) => ({
        minute: item.minute,
        type: item.type,
        side: item.side === 'host' ? 'user' : 'bot',
        shooter: item.shooter,
        keeper: item.keeper,
      }));
    // Sem hora de início (partida antiga), começa do zero. O relógio conta os acréscimos e o intervalo.
    const clock = startedAt ? liveClock(Date.now() - startedAt - LINEUP_REVEAL_MS) : { minute: 0, extra: 0, pause: false };
    spectateFrom.current = clock.minute;
    spectateClock.current = clock;
    // Se os times têm banco, o intervalo espera as trocas dos jogadores (o plano do 2º tempo muda)
    spectateWaitHt.current = (hasBench(target.host_squad) || hasBench(target.guest_squad)) && !target.plan.some((item) => item.ht);
    setSpectating({ host: target.host_nick, guest: target.guest_nick ?? 'Jogador', roomId: target.id });
    beginMatch(squadPlayers(target.host_squad), squadPlayers(target.guest_squad), null);
  }
  // Ao entrar como espectador, reconstrói o que já aconteceu até o minuto atual
  const spectateFrom = useRef<number | null>(null);
  const spectateClock = useRef<{ minute: number; extra: number; pause: boolean } | null>(null);
  const spectateWaitHt = useRef(false);
  // true enquanto o app reconstrói uma partida já em andamento (espectador ou volta ao jogo): não conta gols de novo no progresso
  const catchingUp = useRef(false);
  // Acréscimos de cada tempo: 1 minuto + 1 por gol do tempo (máx. 4 no 1º e 6 no 2º). Sai do plano, igual para todos.
  function stoppageFor(half: 1 | 2) {
    const goals = (planRef.current ?? []).filter(
      (item) => item.type === 'gol' && (half === 1 ? item.minute <= 45 : item.minute > 45),
    ).length;
    return half === 1 ? Math.min(4, 1 + goals) : Math.min(6, 2 + goals);
  }
  // Gol nos minutos finais do 1º tempo: o apito espera 8 ticks (~7 s) a mais para a jogada terminar na animação.
  // Sai do plano, então é igual para os dois lados e para quem assiste ao vivo.
  function holdTicksFor() {
    const late = (planRef.current ?? []).some((item) => item.type === 'gol' && item.minute >= 38 && item.minute <= 45);
    return late ? 8 : 0;
  }
  // Onde a partida está agora, a partir de quanto tempo passou desde o apito inicial (usado por quem assiste ao vivo)
  function liveClock(elapsed: number) {
    let t = Math.max(0, elapsed);
    const s1 = stoppageFor(1);
    const s2 = stoppageFor(2);
    if (t < 45 * MINUTE_MS) return { minute: Math.floor(t / MINUTE_MS), extra: 0, pause: false };
    t -= 45 * MINUTE_MS;
    const window1 = (s1 + holdTicksFor() + 1) * MINUTE_MS;
    if (t < window1) return { minute: 45, extra: Math.min(s1, Math.floor(t / MINUTE_MS)), pause: false };
    t -= window1;
    if (t < HALFTIME_MS) return { minute: 45, extra: 0, pause: true };
    t -= HALFTIME_MS;
    if (t < 45 * MINUTE_MS) return { minute: 45 + Math.floor(t / MINUTE_MS), extra: 0, pause: false };
    t -= 45 * MINUTE_MS;
    return { minute: 90, extra: Math.min(s2, Math.floor(t / MINUTE_MS)), pause: false };
  }
  useEffect(() => {
    if (screen !== 'match' || spectateFrom.current === null || !userTeam.length || !botTeam.length) return;
    const target = spectateFrom.current;
    spectateFrom.current = null;
    catchingUp.current = true;
    (planRef.current ?? [])
      .filter((item) => item.minute <= target)
      .forEach((item) => {
        createEvent(item.minute, item);
        // Gols que já aconteceram entram direto no placar, sem esperar a animação
        if (item.type === 'gol') handleGoal(eventSeq.current, item.side);
      });
    catchingUp.current = false;
    setMinute(target);
    const clock = spectateClock.current;
    spectateClock.current = null;
    if (clock) {
      setExtra(clock.extra);
      setPause(clock.pause ? 'halftime' : null);
      halftimeDone.current = clock.pause || clock.minute > 45;
    }
  }, [screen, userTeam, botTeam]);
  // Sai do modo espectador quando sair da partida/resultado
  useEffect(() => {
    if (screen !== 'match' && screen !== 'results') setSpectating(null);
  }, [screen]);

  // Voltar à sala depois de recarregar a página / queda longa de internet
  const [resumeRoom, setResumeRoom] = useState<Room | null>(null);
  const resumeChecked = useRef(false);
  function resumeMpRoom(target: Room) {
    setResumeRoom(null);
    if (target.status === 'playing' && target.plan && isRoomLive(target)) {
      mpMatchRoom.current = target.id;
      setRoom(target);
      beginMpMatch(target);
      setLineupReveal(null);
      // Entra no minuto em que a partida está agora (mesma reconstrução de quem assiste ao vivo)
      const startedAt = target.plan.find((item) => item.startedAt)?.startedAt;
      const clock = startedAt ? liveClock(Date.now() - startedAt - LINEUP_REVEAL_MS) : { minute: 0, extra: 0, pause: false };
      spectateFrom.current = clock.minute;
      spectateClock.current = clock;
      return;
    }
    setRoom(target);
    if (target.status === 'waiting') navigate('lobby');
  }
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
      spk: item.spk,
      spo: item.spo,
    }));
    const rivalTeam = teams.find((item) => item.id === (role === 'host' ? current.guest_team_id : current.host_team_id));
    const mySquad = role === 'host' ? current.host_squad : current.guest_squad;
    const rivalSquad = role === 'host' ? current.guest_squad : current.host_squad;
    beginMatch(
      mine,
      theirs,
      {
        team: rivalTeam,
        name: (role === 'host' ? current.guest_nick : current.host_nick) ?? undefined,
        tactic: tacticOf(rivalSquad),
      },
      {
        userBench: benchOfSquad(mySquad),
        botBench: benchOfSquad(rivalSquad),
        tactics: { user: tacticOf(mySquad), bot: tacticOf(rivalSquad) },
      },
    );
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

  // Guarda a sala atual neste aparelho enquanto a partida está viva; apaga quando ela acaba ou você sai de propósito
  const hadRoom = useRef(false);
  useEffect(() => {
    if (room && (room.status === 'waiting' || room.status === 'drafting' || room.status === 'playing')) {
      hadRoom.current = true;
      saveActiveRoom(room.id);
    } else if (hadRoom.current && (!room || room.status === 'finished' || room.status === 'cancelled')) {
      hadRoom.current = false;
      clearActiveRoom();
    }
  }, [room?.id, room?.status]);
  // Ao abrir o app logado, procura uma sala sua que ainda está rolando e oferece voltar
  useEffect(() => {
    if (resumeChecked.current || !userId || !teams.length || room || spectating) return;
    resumeChecked.current = true;
    const id = loadActiveRoom();
    if (!id) return;
    void fetchRoom(id).then((found) => {
      const mine = !!found && (found.host_id === userId || found.guest_id === userId);
      const alive = !!found && (found.status === 'waiting' || found.status === 'drafting' || (found.status === 'playing' && isRoomLive(found)));
      if (found && mine && alive) setResumeRoom(found);
      else clearActiveRoom();
    });
  }, [userId, teams.length]);

  const failsRef = useRef(0);
  const [link, setLink] = useState<'ok' | 'lost' | 'back'>('ok');
  // Mantém a sala atualizada (tempo real + consulta a cada 2,5 s como reforço)
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    let alive = true;
    async function refresh() {
      const res = await pingRoom(id);
      if (!alive) return;
      // Conexão com a sala: 2 falhas seguidas = caiu; a próxima que der certo = voltou
      if (!res.ok) {
        failsRef.current += 1;
        if (failsRef.current >= 2) setLink('lost');
        return;
      }
      failsRef.current = 0;
      setLink((cur) => {
        if (cur === 'lost') {
          window.setTimeout(() => setLink((c) => (c === 'back' ? 'ok' : c)), 2600);
          return 'back';
        }
        return cur;
      });
      const next = res.room;
      if (!next) return;
      setRoom((current) => (current && JSON.stringify(current) !== JSON.stringify(next) ? next : current));
    }
    failsRef.current = 0;
    setLink('ok');
    const timer = window.setInterval(() => void refresh(), 2500);
    const onBack = () => void refresh();
    const onOff = () => {
      failsRef.current = 2;
      setLink('lost');
    };
    window.addEventListener('offline', onOff);
    window.addEventListener('online', onBack);
    document.addEventListener('visibilitychange', onBack);
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
      window.removeEventListener('online', onBack);
      window.removeEventListener('offline', onOff);
      document.removeEventListener('visibilitychange', onBack);
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
        setRerolls(1);
        setDraft({});
        setReviewing(false);
        setBenchDraft({});
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
      setWetFrom(wetFromOf(pickAmbience(room.id)));
      const plan = generatePlan(squadPlayers(room.host_squad), squadPlayers(room.guest_squad), SHOOTOUT_CHANCE, {
        host: tacticOf(room.host_squad),
        guest: tacticOf(room.guest_squad),
      });
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
    setRerolls(1);
    setDraft({});
        setReviewing(false);
    setBenchDraft({});
    navigate('draft');
  }
  function candidatePool(slot: DraftSlot) {
    const selectedIds = [...Object.values(draft), ...Object.values(benchDraft)]
      .filter(Boolean)
      .map((player) => (player as Player).id);
    const accepted = slotPositionsOf(slot);
    const fits = players.filter(
      (player) => getPlayerPositions(player).some((position) => accepted.includes(position)) && !selectedIds.includes(player.id),
    );
    const free = fits.filter((player) => !blockedIds.has(player.id));
    return free.length ? free : fits;
  }
  // Troca única: sorteia 3 cartas novas para a posição aberta (evita repetir as anteriores se der)
  function rerollDraft(slot: DraftSlot) {
    if (rerolls <= 0) return;
    const pool = candidatePool(slot);
    const old = drawRef.current[slot] ?? [];
    const fresh = pool.filter((player) => !old.includes(player.id));
    const source = fresh.length >= Math.min(3, pool.length) ? fresh : pool;
    const rest = [...source];
    const ids: string[] = [];
    while (ids.length < Math.min(3, source.length) && rest.length) {
      ids.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0].id);
    }
    drawRef.current[slot] = ids;
    setRerolls(0);
  }
  function playersForPosition(slot: DraftSlot) {
    const pool = candidatePool(slot);
    // Sorteio: 3 cartas aleatórias por posição. Podem vir ótimas ou fracas, é questão de sorte.
    const wanted = Math.min(3, pool.length);
    let ids = (drawRef.current[slot] ?? []).filter((id) => pool.some((player) => player.id === id));
    if (ids.length < wanted) {
      const rest = pool.filter((player) => !ids.includes(player.id));
      while (ids.length < wanted && rest.length) {
        const [taken] = rest.splice(Math.floor(Math.random() * rest.length), 1);
        ids = [...ids, taken.id];
      }
      drawRef.current[slot] = ids;
    }
    return ids
      .map((id) => pool.find((player) => player.id === id))
      .filter(Boolean) as Player[];
  }
  // Escolhe a carta de uma posição (ou vaga do banco). A escalação só segue quando o jogador confirma.
  function chooseDraftPlayer(slot: DraftSlot, player: Player) {
    if (BENCH_SLOTS.some((item) => item.id === slot)) {
      benchDraftRef.current = { ...benchDraftRef.current, [slot]: player };
      setBenchDraft(benchDraftRef.current);
      syncSquad(draft);
      return;
    }
    const nextDraft = { ...draft, [slot]: player };
    setDraft(nextDraft);
    syncSquad(nextDraft);
  }
  function confirmDraft() {
    if (!positions.every((position) => draft[position])) return;
    if (room) {
      confirmSquad();
      return;
    }
    const benchPlayers = BENCH_SLOTS.flatMap((slot) => (benchDraft[slot.id] ? [benchDraft[slot.id] as Player] : []));
    finishOrReview(draft, benchPlayers);
  }

  // No multiplayer o jogador pode ajustar as posições antes de confirmar; no solo segue direto
  function finishOrReview(finalDraft: Partial<Record<Position, Player>>, draftedBench?: Player[]) {
    if (room) {
      setReviewing(true);
      return;
    }
    const goTactic = () =>
      setTacticStep({
        squad: finalDraft,
        next: (tactic, captain) => setReveal({ squad: finalDraft, bench: currentBench(), tactic, next: () => finishDraft(finalDraft, tactic, captain) }),
      });
    // Banco já montado no draft: segue direto para a tática
    if (draftedBench && draftedBench.length >= BENCH_SLOTS.length) {
      benchRef.current = draftedBench;
      goTactic();
      return;
    }
    // Modo Dado: o banco é escolhido aqui, entre 4 candidatos por setor sobrados do draft
    const taken = new Set(positions.flatMap((position) => (finalDraft[position] ? [finalDraft[position]!.id] : [])));
    const free = players.filter((player) => !taken.has(player.id));
    const shuffled = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);
    const seen = new Set<string>();
    const candidates = ([['LB', 'RB'], ['CM'], ['LF', 'RF', 'CF']] as Position[][]).flatMap((group) =>
      shuffled(free.filter((player) => getPlayerPositions(player).some((position) => group.includes(position))))
        .filter((player) => !seen.has(player.id))
        .slice(0, 4)
        .map((player) => {
          seen.add(player.id);
          return player;
        }),
    );
    benchRef.current = null;
    if (candidates.length < 3) goTactic();
    else setBenchStep({ candidates, next: goTactic });
  }
  // Troca dois jogadores de posição. Fora da posição de origem o jogador rende menos (−5 de overall)
  // Também troca titular ↔ reserva (o reserva vira titular na posição e o titular vai para o banco)
  function swapDraft(a: DraftSlot, b: DraftSlot) {
    if (a === b) return;
    const isBench = (slot: DraftSlot): slot is BenchSlot => BENCH_SLOTS.some((item) => item.id === slot);
    const get = (slot: DraftSlot) => (isBench(slot) ? benchDraftRef.current[slot] : draft[slot as Position]);
    const first = get(a);
    const second = get(b);
    if (!first || !second) return;
    const nextDraft = { ...draft };
    const nextBench = { ...benchDraftRef.current };
    const put = (slot: DraftSlot, player: Player) => {
      if (isBench(slot)) nextBench[slot] = player;
      else nextDraft[slot as Position] = player;
    };
    put(a, second);
    put(b, first);
    benchDraftRef.current = nextBench;
    setBenchDraft(nextBench);
    setDraft(nextDraft);
    syncSquad(nextDraft);
  }
  function confirmSquad() {
    const finalDraft = draft;
    setReviewing(false);
    setTacticStep({
      squad: finalDraft,
      next: (tactic, captain) => setReveal({ squad: finalDraft, bench: currentBench(), tactic, next: () => finishDraft(finalDraft, tactic, captain) }),
    });
  }
  // Modo Dado: coloca o jogador escolhido na posição indicada
  function pickDicePlayer(player: Player, position: Position) {
    const nextDraft = { ...draft, [position]: player };
    setDraft(nextDraft);
    syncSquad(nextDraft);
    if (positions.every((item) => nextDraft[item])) finishOrReview(nextDraft);
  }
  function finishDraft(finalDraft: Partial<Record<Position, Player>>, tactic: Tactic = 'equilibrada', captain?: string) {
    if (room) {
      // Multiplayer: marca como pronto (com a tática) e espera o adversário
      syncSquad(finalDraft, true, tactic, captain);
      navigate('lobby', true);
      return;
    }
    const chosen = positions.flatMap((position) => {
      const picked = finalDraft[position];
      return picked ? [{ ...picked, slot: position, captain: picked.id === captain }] : [];
    }) as Player[];
    const chosenIds = new Set(chosen.map((player) => player.id));
    const botClub = clubs.find((team) => team.id !== selectedClub?.id);
    // O bot completa o time com os jogadores que sobraram. Prefere os do clube rival,
    // mas usa qualquer jogador livre se faltar (o draft mistura os dois clubes).
    // O banco escolhido pelo jogador também não pode ser sorteado para o bot
    const usedIds = new Set([...chosenIds, ...(benchRef.current ?? []).map((player) => player.id)]);
    const botPlayers: Player[] = [];
    positions.forEach((position) => {
      const free = players.filter((player) => !usedIds.has(player.id));
      const fits = free.filter((player) => getPlayerPositions(player).includes(position));
      const base = fits.length ? fits : free;
      const rivalFits = base.filter((player) => player.team_id === botClub?.id);
      const pool = rivalFits.length ? rivalFits : base;
      // O bot drafta como o jogador: sorteia algumas cartas (1 fácil, 3 normal, 5 difícil) e fica com a melhor
      const left = [...pool];
      const drawn: Player[] = [];
      while (drawn.length < botLevel && left.length) {
        drawn.push(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
      }
      const choice = drawn.sort((a, b) => b.overall - a.overall)[0];
      if (choice) {
        usedIds.add(choice.id);
        botPlayers.push({ ...choice, slot: position });
      }
    });
    // O bot também escolhe um capitão: o melhor jogador dele
    const botCaptain = [...botPlayers].sort((a, b) => b.overall - a.overall)[0];
    botPlayers.forEach((player) => {
      player.captain = player.id === botCaptain?.id;
    });
    // Banco de reservas (1 defensor, 1 meio-campista e 1 atacante para cada lado), sorteados entre quem sobrou
    const benchGroups: Position[][] = [['LB', 'RB'], ['CM'], ['LF', 'RF', 'CF']];
    const pickBench = (): Player[] =>
      benchGroups.flatMap((group) => {
        const options = players.filter(
          (player) => !usedIds.has(player.id) && getPlayerPositions(player).some((position) => group.includes(position)),
        );
        if (!options.length) return [];
        const picked = options[Math.floor(Math.random() * options.length)];
        usedIds.add(picked.id);
        return [picked];
      });
    const userBenchPlayers = benchRef.current?.length ? benchRef.current : pickBench();
    benchRef.current = null;
    const botBenchPlayers = pickBench();
    // Contra o bot também usa o plano da partida: time mais forte faz mais gols e não há empate.
    // O jogador (anfitrião do plano) é o lado "user".
    // O bot escolhe uma tática ao acaso (mais equilibrada que as outras)
    const botRoll = Math.random();
    const botTactic: Tactic = botRoll < 0.18 ? 'ofensiva' : botRoll < 0.36 ? 'defensiva' : botRoll < 0.5 ? 'contra' : botRoll < 0.64 ? 'posse' : botRoll < 0.78 ? 'pressao' : 'equilibrada';
    const matchAmb = pickAmbience();
    setBotAmb(matchAmb);
    setWetFrom(wetFromOf(matchAmb));
    const basePlan: PlanEntry[] = generatePlan(chosen, botPlayers, 0, { host: tactic, guest: botTactic })
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
    setCoach({ shouts: SHOUTS_PER_MATCH, until: 0, shout: null });
    setPieces.current = pickSetPieceMinutes((planRef.current ?? []).map((item) => item.minute));
    setSetPiece(null);
    beginMatch(chosen, botPlayers, { team: botClub, tactic: botTactic }, {
      userBench: userBenchPlayers,
      botBench: botBenchPlayers,
      tactics: { user: tactic, bot: botTactic },
    });
  }
  function beginMatch(
    chosen: Player[],
    botPlayers: Player[],
    rivalInfo?: { team?: Team; name?: string; tactic?: Tactic } | null,
    extras?: { userBench: Player[]; botBench: Player[]; tactics: { user: Tactic; bot: Tactic } },
  ) {
    setUserBench(extras?.userBench ?? []);
    setBotBench(extras?.botBench ?? []);
    setMatchTactics(extras?.tactics ?? { user: 'equilibrada', bot: 'equilibrada' });
    setLeftUser([]);
    setLeftBot([]);
    setSubsLog({ user: [], bot: [] });
    workRef.current = { effort: {}, slow: {} };
    setLineupReveal(rivalInfo ? { squad: botPlayers, bench: extras?.botBench, ...rivalInfo } : null);
    matchMapRef.current = null;
    setUserTeam(chosen);
    setBotTeam(botPlayers);
    setMinute(0);
    setExtra(0);
    setPause(null);
    halftimeDone.current = false;
    halftimeWait.current = 0;
    endHalfRef.current = false;
    deadBallRef.current = false;
    setScore({ user: 0, bot: 0 });
    setEvents([]);
    setStats(emptyStats);
    setGoalLog([]);
    setHighlights([]);
    setClips({});
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
    if (screen !== 'match' || skipped || lineupReveal || pause) return;
    if (minute >= 90 && extra >= stoppageFor(2)) return;
    const timer = window.setInterval(() => advanceMatch(), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, [screen, minute, extra, pause, skipped, lineupReveal]);

  // Intervalo: 'halftime' (sem trocas) dura HALFTIME_MS. Com trocas: 'break' (jogadores saem e aparece o placar) -> 'subs'
  // (painel, sem limite de tempo) -> 'return' (jogadores voltam, trocas aparecem e começa o 2º tempo)
  useEffect(() => {
    if (pause !== 'halftime' && pause !== 'break' && pause !== 'return') return;
    if (pause === 'halftime' && spectating && spectateWaitHt.current) return;
    const hadSubs = subsLog.user.length > 0 || subsLog.bot.length > 0;
    const ms = pause === 'halftime' ? HALFTIME_MS : pause === 'break' ? HT_BREAK_MS : hadSubs ? HT_RETURN_MS : HT_RETURN_NO_SUBS_MS;
    const timer = window.setTimeout(() => {
      if (pause === 'break') {
        setPause('subs');
        return;
      }
      setPause(null);
      setRestartKey((key) => key + 1);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [pause]);

  // Espectador: no intervalo, espera o anfitrião gravar o 2º tempo refeito (depois das trocas) e continua
  useEffect(() => {
    if (!spectating || pause !== 'halftime' || !spectateWaitHt.current) return;
    let alive = true;
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      const latest = await fetchRoom(spectating.roomId);
      if (!alive) return;
      const done = !!latest?.plan?.some((item) => item.ht);
      if (!done && Date.now() - startedAt < (SUBS_WINDOW_SEC + 25) * 1000) return;
      if (done && latest?.plan) planRef.current = itemsToPlan(latest.plan, 'host');
      spectateWaitHt.current = false;
      setPause(null);
      setRestartKey((key) => key + 1);
    }, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pause, spectating]);

  // Depois dos 90 minutos, espera os gols aparecerem na animação antes de mostrar o resultado
  const goesToShootout = score.user === score.bot;
  useEffect(() => {
    if (screen !== 'match' || minute < 90) return;
    if (!skipped && extra < stoppageFor(2)) return; // ainda nos acréscimos
    if (goesToShootout && (penaltyPhase || shootout)) return; // pênaltis em andamento
    const allShown = shownScore.user === score.user && shownScore.bot === score.bot;
    // Empate: mostra a transição "vai para os pênaltis" antes de a disputa começar
    // Gol ainda sem entrar na animação: espera até 30 s (a jogada mais lenta leva uns 9 s, com fila de lances chega a ~20 s)
    const wait = skipped ? 250 : allShown ? (goesToShootout ? PENALTY_PREP_MS : 2500) : 30000;
    const timer = window.setTimeout(() => {
      // Passou do limite sem a bola entrar: confirma os gols que faltam para o placar ficar certo
      eventsRef.current.forEach((event) => {
        if (event.type === 'gol' && !shownRef.current.has(event.id)) handleGoal(event.id, event.team);
      });
      if (goesToShootout) setPenaltyPhase(true);
      else navigate('results', true);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [screen, minute, extra, skipped, shownScore, score, penaltyPhase, shootout]);
  eventsRef.current = events;
  // Progresso para desbloquear bolas, chuteiras e comemorações (conta uma vez por partida jogada, fora espectador)
  useEffect(() => {
    if (screen !== 'results' || spectating) return;
    addProgress({ games: 1, wins: shownScore.user > shownScore.bot ? 1 : 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
  // Cansaço (só contra o bot): jogador exausto fica mais lento no campo
  if (!spectating && screen === 'match') {
    const slowMap: Record<string, number> = {};
    const staminaMap: Record<string, number> = {};
    (['user', 'bot'] as const).forEach((side) => {
      (side === 'user' ? userTeam : botTeam).forEach((player) => {
        const key = `${side}-${slotOf(player)}`;
        const stamina = staminaAt(
          slotOf(player),
          Math.min(minute, 90),
          side === 'user' ? matchTactics.user : matchTactics.bot,
          player.since ?? 0,
          (player.carried ?? 0) + effortLoss(workRef.current.effort[key] ?? 0),
        );
        slowMap[key] = slowdown(stamina);
        staminaMap[key] = stamina;
      });
    });
    workRef.current.slow = slowMap;
    workRef.current.stamina = staminaMap;
  }
  const penaltyPrep =
    screen === 'match' &&
    minute >= 90 &&
    extra >= stoppageFor(2) &&
    goesToShootout &&
    !penaltyPhase &&
    !shootout &&
    !skipped &&
    shownScore.user === score.user &&
    shownScore.bot === score.bot;

  // Fim da disputa de pênaltis jogada pelo usuário: guarda o resultado e mostra a tela final
  function finishShootout(result: Shootout) {
    setShootout(result);
    setPenaltyPhase(false);
    navigate('results', true);
  }

  function advanceMatch() {
    // Fim do 1º tempo: corre o acréscimo (45+1, 45+2...) e depois vem o intervalo
    if (minute === 45 && !halftimeDone.current) {
      if (extra < stoppageFor(1)) {
        setExtra(extra + 1);
        return;
      }
      // Gol no fim do tempo: segura o apito por um tempo fixo para a jogada terminar
      if (halftimeWait.current < holdTicksFor()) {
        halftimeWait.current += 1;
        return;
      }
      // O apito só toca quando a bola sai (lateral): pede ao campo e espera até ~9 s. Quem assiste ao vivo não espera (segue o relógio do anfitrião).
      if (!spectating && !skipped) {
        endHalfRef.current = true;
        if (!deadBallRef.current && halftimeWait.current < holdTicksFor() + 10) {
          halftimeWait.current += 1;
          return;
        }
      }
      endHalfRef.current = false;
      // Se a bola ainda não entrou, o gol é confirmado agora (o intervalo cobre o campo)
      eventsRef.current.forEach((event) => {
        if (event.type === 'gol' && !shownRef.current.has(event.id)) handleGoal(event.id, event.team);
      });
      halftimeDone.current = true;
      setExtra(0);
      // Contra o bot dá para fazer trocas antes de o 2º tempo começar
      const liveRoom = roomRef.current;
      const canSub =
        !spectating && (liveRoom ? hasBench(liveRoom.host_squad) || hasBench(liveRoom.guest_squad) : userBench.length > 0);
      if (canSub) {
        // Guarda o esforço do 1º tempo em cada jogador (fôlego já gasto e ritmo por minuto) e zera o contador do campo
        const effort = workRef.current.effort;
        const capture = (team: Player[], side: 'user' | 'bot') =>
          team.map((player) => {
            const loss = effortLoss(effort[`${side}-${slotOf(player)}`] ?? 0);
            return { ...player, carried: (player.carried ?? 0) + loss, work: loss / 45 };
          });
        setUserTeam(capture(userTeam, 'user'));
        setBotTeam(capture(botTeam, 'bot'));
        Object.keys(effort).forEach((key) => {
          effort[key] = 0;
        });
      }
      setPause(canSub ? 'break' : 'halftime');
      return;
    }
    // Fim do 2º tempo: só corre o acréscimo (90+1, 90+2...)
    if (minute >= 90) {
      if (extra < stoppageFor(2)) setExtra(extra + 1);
      return;
    }
    const next = minute + 1;
    setMinute(next);
    // Bola parada: o bot cobra sozinho; nas suas, o jogo para e você escolhe a jogada
    if (!roomRef.current && !spectating && setPieces.current) {
      const sp = setPieces.current;
      if (sp.bot.includes(next)) {
        sp.bot = sp.bot.filter((m) => m !== next);
        const opts = SET_OPTIONS.falta;
        resolveSetPiece(next, 'bot', Math.random() < 0.5 ? 'escanteio' : 'falta', opts[Math.floor(Math.random() * opts.length)].id);
        return;
      }
      if (sp.user.includes(next)) {
        sp.user = sp.user.filter((m) => m !== next);
        const kind: SetKind = Math.random() < 0.55 ? 'escanteio' : 'falta';
        if (skipped) resolveSetPiece(next, 'user', kind, 'cruzamento');
        else {
          setSetPiece({ kind, minute: next });
          setPause('setpiece');
        }
        return;
      }
    }
    if (planRef.current) {
      const planned = planRef.current.find((item) => item.minute === next);
      if (planned) createEvent(next, planned);
    } else if (next % 4 === 0 || next % 7 === 0) createEvent(next);
  }

  // Troca de estilo no meio do jogo: o fôlego já gasto fica como estava e a troca custa um pouco
  function changeTactic(next: Tactic) {
    if (roomRef.current || spectating || next === matchTactics.user) return;
    const old = matchTactics.user;
    const at = Math.min(minute, 90);
    setUserTeam((current) =>
      current.map((player) => {
        const at2 = (t: Tactic) => staminaAt(slotOf(player), at, t, player.since ?? 0, player.carried ?? 0);
        return { ...player, carried: (player.carried ?? 0) + (at2(next) - at2(old)) + SWITCH_COST };
      }),
    );
    if (planRef.current) planRef.current = retuneForTactic(planRef.current, minute, old, next);
    setMatchTactics((current) => ({ ...current, user: next }));
  }
  function callShout(kind: Shout) {
    if (roomRef.current || spectating || coach.shouts <= 0 || minute < coach.until + (coach.shout ? SHOUT_COOLDOWN : 0)) return;
    if (planRef.current) planRef.current = applyShout(planRef.current, minute, kind);
    setUserTeam((current) => current.map((player) => ({ ...player, carried: Math.max(0, (player.carried ?? 0) + SHOUT_STAMINA[kind]) })));
    setCoach({ shouts: coach.shouts - 1, until: minute + SHOUT_MINUTES, shout: kind });
  }

  function resolveSetPiece(at: number, side: 'user' | 'bot', kind: SetKind, option: SetOption) {
    const atkSquad = side === 'user' ? userTeam : botTeam;
    const defSquad = side === 'user' ? botTeam : userTeam;
    const atk = average(atkSquad.filter((player) => ['LF', 'RF', 'CF'].includes(slotOf(player))));
    const def = average(defSquad.filter((player) => ['LB', 'RB', 'GK'].includes(slotOf(player))));
    const takerPlayer = [...atkSquad.filter((player) => ['CM', 'LF', 'RF'].includes(slotOf(player)))].sort((a, b) => b.overall - a.overall)[0];
    const outcome = rollSetPiece(kind, option, atk, def, takerPlayer?.overall ?? 75, Math.random());
    createEvent(at, { minute: at, type: outcome, side } as PlanEntry, { kind, option });
    setSetPiece(null);
    setPause((current) => (current === 'setpiece' ? null : current));
  }

  function handleGoal(id: number, side: 'user' | 'bot') {
    if (shownRef.current.has(id)) return;
    shownRef.current.add(id);
    setShownGoalIds((current) => [...current, id]);
    setShownScore((current) => ({ ...current, [side]: current[side] + 1 }));
    if (side === 'user' && !spectating && !catchingUp.current) addProgress({ goals: 1 });
  }

  function createEvent(currentMinute: number, forced?: PlanEntry, setPieceInfo?: { kind: SetKind; option: SetOption }) {
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
        : clubs.find((team) => team.id !== selectedClub?.id)?.abbreviation;
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
    // Gols especiais (escanteio, voleio, bicicleta, chapéu, olímpico): cerca de 30% dos gols. O mesmo sorteio sai nos dois lados do multiplayer.
    const specialGoalTexts = [
      `Escanteio cobrado na área e ${shooterName} sobe mais alto e cabeceia para o gol de ${club}!`,
      `Escanteio cobrado, bola na cabeça de ${shooterName} e é gol de ${club}!`,
      `${shooterName} acerta um voleio espetacular e é um golaço de ${club}!`,
      `${shooterName} dá uma bicicleta incrível e marca um gol de placa!`,
      `${shooterName} encobre ${keeperName} com um chapéu e marca!`,
      `Gol olímpico! ${shooterName} cobra o escanteio direto e a bola entra!`,
    ];
    const pickedGoal =
      roll(8) < 0.3 ? choose(specialGoalTexts, 10) : choose(goalTexts, 1);
    // Gol olímpico não tem assistência
    if (/olímpico/i.test(pickedGoal)) assist = undefined;
    const goalText = /olímpico/i.test(pickedGoal)
      ? pickedGoal
      : assist
        ? `${pickedGoal} Passe de ${assist.name}.`
        : /^Escanteio cobrado/.test(pickedGoal)
          ? pickedGoal
          : `${pickedGoal} Jogada individual.`;
    const shotTexts = [
      `${shooterName} finaliza de primeira, mas a bola passa por cima do gol.`,
      `${shooterName} bate cruzado e a bola sai rente à trave.`,
      `${shooterName} arrisca de longe e isola.`,
      `${shooterName} chuta torto e a bola vai pela linha de fundo.`,
      `Bola na trave! ${shooterName} quase marca para ${club}.`,
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
    const baseText =
      type === 'gol'
        ? goalText
        : type === 'finalização'
          ? choose(shotTexts, 2)
          : type === 'defesa'
            ? choose(saveTexts, 3)
            : choose(possessionTexts, 4);
    const spInfo = setPieceInfo ?? (forced?.spk && forced.spo ? { kind: forced.spk, option: forced.spo } : undefined);
    const text = spInfo
      ? setPieceText(spInfo.kind, spInfo.option, type, {
          shooter: shooterName,
          keeper: keeperName,
          club: club ?? 'o time',
          taker: middle?.name ?? mate?.name ?? shooterName,
        })
      : baseText;
    eventSeq.current += 1;
    const id = eventSeq.current;
    setEvents((current) =>
      [{ id, minute: currentMinute, type, text, team: side, actor: attackPlayer?.name, assist: assist?.name }, ...current].slice(0, 18),
    );
    if (type !== 'posse') {
      setHighlights((current) =>
        current.some((item) => item.id === id)
          ? current
          : [...current, { id, minute: currentMinute, type, text, team: side, actor: attackPlayer?.name, assist: assist?.name }],
      );
    }
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

  // ---- Trocas do intervalo ----
  const liteOf = (player: Player) => ({
    primary_position: player.primary_position,
    overall: player.overall,
    name: player.name,
    alts: player.alternate_positions ?? [],
  });
  // Troca quem sai pelo reserva em cada posição indicada (GK e capitão nunca saem)
  function swapTeam(team: Player[], bench: Player[], picks: { slot: string; inId: string }[]) {
    const left: Player[] = [];
    const lines: string[] = [];
    const usedIn = new Set<string>();
    const next = team.map((player) => {
      const pick = picks.find((item) => item.slot === slotOf(player));
      const reserve = pick ? bench.find((item) => item.id === pick.inId && !usedIn.has(item.id)) : undefined;
      if (!reserve || slotOf(player) === 'GK' || player.captain) return player;
      usedIn.add(reserve.id);
      left.push(player);
      lines.push(`${player.name} ➜ ${reserve.name}`);
      return {
        ...reserve,
        slot: slotOf(player),
        since: minute,
        oop: !fitsSlot(liteOf(reserve), slotOf(player)),
        carried: 0,
        work: player.work ?? 0,
        captain: false,
      };
    });
    return { next, left, lines };
  }
  const planToItems = (entries: PlanEntry[]): PlanItem[] =>
    entries.map((entry) => ({
      minute: entry.minute,
      type: entry.type,
      side: entry.side === 'user' ? 'host' : 'guest',
      shooter: entry.shooter,
      keeper: entry.keeper,
    }));
  const itemsToPlan = (items: PlanItem[], role: 'host' | 'guest'): PlanEntry[] =>
    items
      .filter((item) => item.minute > 0)
      .map((item) => ({
        minute: item.minute,
        type: item.type,
        side: (item.side === role ? 'user' : 'bot') as 'user' | 'bot',
        shooter: item.shooter,
        keeper: item.keeper,
        spk: item.spk,
        spo: item.spo,
      }));

  // Confirma as trocas do intervalo. Contra o bot: o bot também troca (os mais cansados) e o 2º tempo do plano é refeito.
  // No multiplayer só envia as trocas para a sala; o anfitrião refaz o 2º tempo quando os dois decidem.
  function confirmSubs(choices: { slot: Position; inId: string }[]) {
    if (roomRef.current) {
      sendMpSubs(choices);
      return;
    }
    const botPicks = autoSubstitutions(botTeam as FieldLite[], botBench.map(liteOf), matchTactics.bot).flatMap((pick) => {
      const out = botTeam.find((player) => player.name === pick.out);
      const reserve = botBench.find((player) => player.name === pick.in);
      return out && reserve ? [{ slot: slotOf(out), inId: reserve.id }] : [];
    });
    const mine = swapTeam(userTeam, userBench, choices.slice(0, SUBS_MAX));
    const rival = swapTeam(botTeam, botBench, botPicks);
    if (planRef.current) {
      const reshaped = reshapeSecondHalf(
        planToItems(planRef.current),
        { lineup: mine.next as FieldLite[], tactic: matchTactics.user },
        { lineup: rival.next as FieldLite[], tactic: matchTactics.bot },
        { host: userTeam, guest: botTeam },
      );
      planRef.current = itemsToPlan(reshaped, 'host');
    }
    setUserTeam(mine.next);
    setBotTeam(rival.next);
    setUserBench((current) => current.filter((player) => !choices.some((pick) => pick.inId === player.id)));
    setLeftUser((current) => [...current, ...mine.left]);
    setLeftBot((current) => [...current, ...rival.left]);
    setSubsLog({ user: mine.lines, bot: rival.lines });
    setPause('return');
  }

  // Multiplayer: grava as minhas trocas na sala (junto do meu time) e marca que já decidi
  function sendMpSubs(choices: { slot: Position; inId: string }[]) {
    const current = roomRef.current;
    if (!current || !myRole) return;
    const own = (myRole === 'host' ? current.host_squad : current.guest_squad) ?? {};
    const next = { ...own, _s: encodeSubs(choices.slice(0, SUBS_MAX)), _d: '1' };
    const patch: Partial<Room> = myRole === 'host' ? { host_squad: next } : { guest_squad: next };
    setRoom((room) => (room ? { ...room, ...patch } : room));
    void patchRoom(current.id, patch);
  }
  // Anfitrião: com as trocas dos dois lados, refaz o 2º tempo do plano e grava o resultado (com o carimbo `ht`)
  // junto das trocas usadas, para os dois lados aplicarem exatamente a mesma coisa.
  const mpReshapeKey = useRef<string | null>(null);
  const mpAppliedKey = useRef<string | null>(null);
  const matchKeyOf = (current: Room) => `${current.id}:${current.plan?.find((item) => item.startedAt)?.startedAt ?? 0}`;
  function reshapeMpPlan() {
    const current = roomRef.current;
    if (!current || !current.plan || myRole !== 'host') return;
    if (current.plan.some((item) => item.ht)) return;
    const key = matchKeyOf(current);
    if (mpReshapeKey.current === key) return;
    mpReshapeKey.current = key;
    const hostSubs = subsOf(current.host_squad);
    const guestSubs = subsOf(current.guest_squad);
    const mine = swapTeam(userTeam, userBench, hostSubs);
    const rival = swapTeam(botTeam, botBench, guestSubs);
    // Só conta como troca o que realmente entrou em campo (id inválido é ignorado)
    const used = (team: ReturnType<typeof swapTeam>, picks: { slot: string; inId: string }[]) =>
      picks.filter((pick) => team.next.some((player) => player.id === pick.inId));
    const reshaped =
      mine.left.length || rival.left.length
        ? reshapeSecondHalf(
            current.plan,
            { lineup: mine.next as FieldLite[], tactic: matchTactics.user },
            { lineup: rival.next as FieldLite[], tactic: matchTactics.bot },
            { host: userTeam, guest: botTeam },
          )
        : current.plan;
    // Bolas paradas já resolvidas para o 2º tempo não podem sumir quando o plano é refeito
    const keepSp = current.plan.filter((item) => item.spk && item.minute > 45);
    const reshapedKept = keepSp.length
      ? [...reshaped.filter((item) => !keepSp.some((kept) => kept.minute === item.minute && item.minute > 0)), ...keepSp].sort((a, b) => a.minute - b.minute)
      : reshaped;
    const stamp = {
      ht: Date.now(),
      sh: encodeSubs(used(mine, hostSubs)),
      sg: encodeSubs(used(rival, guestSubs)),
    };
    const withStamp = reshapedKept.some((item) => item.minute === 0)
      ? reshapedKept.map((item) => (item.minute === 0 ? { ...item, ...stamp } : item))
      : [{ minute: 0, type: 'posse' as const, side: 'host' as const, ...stamp }, ...reshapedKept];
    setRoom((room) => (room ? { ...room, plan: withStamp } : room));
    void patchRoom(current.id, { plan: withStamp });
  }
  const reshapeMpPlanRef = useRef(reshapeMpPlan);
  reshapeMpPlanRef.current = reshapeMpPlan;
  // Aplica no meu lado as trocas que o anfitrião gravou no plano
  function applyMpSubs(current: Room) {
    if (!current.plan || !myRole) return;
    const key = matchKeyOf(current);
    if (mpAppliedKey.current === key) return;
    const meta = current.plan.find((item) => item.ht);
    if (!meta) return;
    mpAppliedKey.current = key;
    const hostPicks = subsOf({ _s: meta.sh ?? '[]' });
    const guestPicks = subsOf({ _s: meta.sg ?? '[]' });
    const mine = swapTeam(userTeam, userBench, myRole === 'host' ? hostPicks : guestPicks);
    const rival = swapTeam(botTeam, botBench, myRole === 'host' ? guestPicks : hostPicks);
    planRef.current = itemsToPlan(current.plan, myRole);
    setUserTeam(mine.next);
    setBotTeam(rival.next);
    setUserBench((list) => list.filter((player) => !mine.next.some((item) => item.id === player.id)));
    setBotBench((list) => list.filter((player) => !rival.next.some((item) => item.id === player.id)));
    setLeftUser((list) => [...list, ...mine.left]);
    setLeftBot((list) => [...list, ...rival.left]);
    setSubsLog({ user: mine.lines, bot: rival.lines });
    setPause('return');
  }
  // Durante a janela de trocas do multiplayer: o anfitrião refaz o plano quando os dois decidem (ou o tempo acaba),
  // e quem está esperando aplica o resultado. Se o anfitrião sumir, o convidado segue sem trocas.
  useEffect(() => {
    if (!room || !myRole || pause !== 'subs') return;
    if (room.plan?.some((item) => item.ht)) {
      applyMpSubs(room);
      return;
    }
    if (myRole === 'host' && subsDecided(room.host_squad) && subsDecided(room.guest_squad)) {
      reshapeMpPlanRef.current();
    }
  }, [room, pause]);
  useEffect(() => {
    if (!room || !myRole || pause !== 'subs') return;
    const timer = window.setTimeout(
      () => {
        if (myRole === 'host') reshapeMpPlanRef.current();
        else setPause('return');
      },
      (SUBS_WINDOW_SEC + (myRole === 'host' ? 12 : 45)) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [pause]);

  // ===== Multiplayer: tudo que existe contra o bot (estilo no meio do jogo, gritos, jogada ensaiada) =====
  // O anfitrião decide e grava no plano; cada lado só grava pedidos na própria coluna (`_a`).
  const minuteNowRef = useRef(0);
  minuteNowRef.current = minute;
  const matchTacticsRef = useRef(matchTactics);
  matchTacticsRef.current = matchTactics;
  const mpTac = useRef<{ host: Tactic; guest: Tactic } | null>(null);
  const mpSpDone = useRef<Set<string>>(new Set());
  const dynShown = useRef<Set<string>>(new Set());
  const dvSeen = useRef('');
  const [rivalNote, setRivalNote] = useState('');
  function mpSend(partial: Omit<Req, 'id'>) {
    const cur = roomRef.current;
    if (!cur || !myRole) return;
    const own = myRole === 'host' ? cur.host_squad : cur.guest_squad;
    const list = decodeReqs(own);
    const req: Req = { ...partial, id: `${Date.now().toString(36)}${list.length}` };
    const next = { ...own, _a: encodeReqs([...list, req]) };
    const patch: Partial<Room> = myRole === 'host' ? { host_squad: next } : { guest_squad: next };
    setRoom((r) => (r ? { ...r, ...patch } : r));
    void patchRoom(cur.id, patch);
  }
  function mpNames(side: 'host' | 'guest', seed: string) {
    const rng = seeded(seed);
    const atk = side === 'host' ? userTeam : botTeam; // quem decide é o anfitrião: userTeam = time dele
    const def = side === 'host' ? botTeam : userTeam;
    const pool = atk.filter((player) => ['LF', 'RF', 'CF', 'CM'].includes(slotOf(player)));
    const list = pool.length ? pool : atk;
    return { shooter: list[Math.floor(rng() * list.length)]?.name, keeper: def.find((player) => slotOf(player) === 'GK')?.name };
  }
  // Anfitrião: aplica os pedidos novos no plano (lances futuros) e resolve as bolas paradas na hora
  function hostApplyDynamics() {
    const cur = roomRef.current;
    if (!cur || myRole !== 'host' || !cur.plan || cur.status !== 'playing') return;
    const meta = cur.plan.find((item) => item.startedAt);
    if (!meta) return;
    const nowMin = minuteNowRef.current;
    const applied = new Set((meta.ap ?? '').split(',').filter(Boolean));
    const fresh: string[] = [];
    let items = cur.plan;
    if (!mpTac.current) mpTac.current = { host: tacticOf(cur.host_squad), guest: tacticOf(cur.guest_squad) };
    const all = [
      ...decodeReqs(cur.host_squad).map((r) => ({ who: 'host' as const, r })),
      ...decodeReqs(cur.guest_squad).map((r) => ({ who: 'guest' as const, r })),
    ].sort((a, b) => a.r.e - b.r.e);
    for (const { who, r } of all) {
      if (r.k === 'sp') continue;
      const key = `${who}:${r.id}`;
      if (applied.has(key)) continue;
      const from = Math.max(r.e, nowMin + MP_LEAD) - 1;
      const rng = seeded(`${cur.id}:${key}`);
      if (r.k === 'tac') {
        items = retuneItems(items, from, who, mpTac.current[who], r.v as Tactic, rng);
        mpTac.current = { ...mpTac.current, [who]: r.v as Tactic };
      } else items = shoutItems(items, from, who, r.v as Shout, rng);
      fresh.push(key);
    }
    const sets = mpSetPieces(cur.id);
    for (const who of ['host', 'guest'] as const) {
      for (const sp of sets[who]) {
        const key = `sp:${who}:${sp.m}`;
        if (applied.has(key) || fresh.includes(key)) continue;
        if (nowMin < sp.m - MP_LEAD) continue;
        fresh.push(key);
        if (nowMin > sp.m - 3) continue; // tarde demais para os dois lados verem: a bola parada passa em branco
        const req = decodeReqs(who === 'host' ? cur.host_squad : cur.guest_squad).find((r) => r.k === 'sp' && r.m === sp.m);
        const option = (req?.v === 'curto' || req?.v === 'direto' ? req.v : 'cruzamento') as SetOption;
        const atkTeam = who === 'host' ? userTeam : botTeam;
        const defTeam = who === 'host' ? botTeam : userTeam;
        const atk = average(atkTeam.filter((player) => ['LF', 'RF', 'CF'].includes(slotOf(player))));
        const def = average(defTeam.filter((player) => ['LB', 'RB', 'GK'].includes(slotOf(player))));
        const taker = [...atkTeam.filter((player) => ['CM', 'LF', 'RF'].includes(slotOf(player)))].sort((a, b) => b.overall - a.overall)[0];
        const outcome = rollSetPiece(sp.kind, option, atk, def, taker?.overall ?? 75, seeded(`${cur.id}:${key}:r`)());
        let minuteAt = sp.m;
        while (items.some((item) => item.minute === minuteAt && item.minute > 0) && minuteAt < 89) minuteAt += 1;
        if (items.some((item) => item.minute === minuteAt && item.minute > 0)) continue;
        const names = mpNames(who, `${cur.id}:${key}:n`);
        items = [...items, { minute: minuteAt, type: outcome, side: who, shooter: names.shooter, keeper: names.keeper, spk: sp.kind, spo: option }].sort((a, b) => a.minute - b.minute);
      }
    }
    if (!fresh.length) return;
    // lances que mudaram de tipo ganham nomes (iguais para todos)
    items = items.map((item) => {
      if (item.minute <= 0 || item.type === 'posse' || (item.shooter && item.keeper)) return item;
      const names = mpNames(item.side, `${cur.id}:${item.minute}:${item.side}:n`);
      return { ...item, shooter: item.shooter ?? names.shooter, keeper: item.keeper ?? names.keeper };
    });
    const ap = [...applied, ...fresh].slice(-80).join(',');
    const dv = (meta.dv ?? 0) + 1;
    items = items.map((item) => (item.startedAt ? { ...item, ap, dv } : item));
    setRoom((r) => (r ? { ...r, plan: items } : r));
    void patchRoom(cur.id, { plan: items });
  }
  useEffect(() => {
    if (screen === 'match' && myRole === 'host') hostApplyDynamics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, room?.host_squad, room?.guest_squad, screen]);
  // Todos (inclusive quem assiste): quando o anfitrião grava mudanças, passa a jogar o plano novo
  useEffect(() => {
    if (!room || !room.plan || room.status !== 'playing' || screen !== 'match') return;
    const meta = room.plan.find((item) => item.startedAt);
    if (!meta?.dv) return;
    const key = `${matchKeyOf(room)}:${meta.dv}`;
    if (dvSeen.current === key) return;
    if (room.plan.some((item) => item.ht) && mpAppliedKey.current !== matchKeyOf(room)) return; // espera as trocas do intervalo
    dvSeen.current = key;
    planRef.current = itemsToPlan(room.plan, myRole ?? 'host');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, screen]);
  // Os dois lados mostram o estilo novo e o grito na mesma hora de jogo (fôlego e avisos)
  useEffect(() => {
    if (!room || !myRole || screen !== 'match' || spectating) return;
    const prefix = matchKeyOf(room);
    for (const who of ['host', 'guest'] as const) {
      const mine = who === myRole;
      for (const r of decodeReqs(who === 'host' ? room.host_squad : room.guest_squad)) {
        if (r.k === 'sp' || minute < r.e) continue;
        const key = `${prefix}:${who}:${r.id}`;
        if (dynShown.current.has(key)) continue;
        dynShown.current.add(key);
        const setTeam = mine ? setUserTeam : setBotTeam;
        if (r.k === 'tac') {
          const side = mine ? 'user' : 'bot';
          const old = matchTacticsRef.current[side];
          const next = r.v as Tactic;
          const at = Math.min(minute, 90);
          setTeam((current) =>
            current.map((player) => {
              const st = (t: Tactic) => staminaAt(slotOf(player), at, t, player.since ?? 0, player.carried ?? 0);
              return { ...player, carried: (player.carried ?? 0) + (st(next) - st(old)) + SWITCH_COST };
            }),
          );
          matchTacticsRef.current = { ...matchTacticsRef.current, [side]: next };
          setMatchTactics((current) => ({ ...current, [side]: next }));
          if (!mine) setRivalNote(`${TACTIC_INFO[next].icon} Rival mudou para ${TACTIC_INFO[next].label}`);
        } else {
          const shout = r.v as Shout;
          if (!SHOUT_INFO[shout]) return;
          setTeam((current) => current.map((player) => ({ ...player, carried: Math.max(0, (player.carried ?? 0) + SHOUT_STAMINA[shout]) })));
          if (!mine) setRivalNote(`${SHOUT_INFO[shout].icon} Técnico rival: ${SHOUT_INFO[shout].label}`);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, room?.host_squad, room?.guest_squad, screen]);
  useEffect(() => {
    if (!rivalNote) return undefined;
    const id = window.setTimeout(() => setRivalNote(''), 4500);
    return () => window.clearTimeout(id);
  }, [rivalNote]);
  // Minha jogada ensaiada: abre antes da bola parada (sem pausar o jogo) e fecha quando o anfitrião precisa resolver
  useEffect(() => {
    if (!room || !myRole || screen !== 'match' || spectating || pause) return;
    const mine = mpSetPieces(room.id)[myRole];
    const open = mine.find((sp) => minute >= sp.m - MP_SP_OPEN && minute < sp.m - MP_LEAD && !mpSpDone.current.has(`${room.id}:${sp.m}`));
    setSetPiece((current) => {
      if (open) return current && current.minute === open.m ? current : { kind: open.kind, minute: open.m, floating: true };
      return current?.floating ? null : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, room?.id, screen, pause]);
  function mpPickSetPiece(option: SetOption) {
    const cur = roomRef.current;
    if (!cur || !setPiece) return;
    mpSpDone.current.add(`${cur.id}:${setPiece.minute}`);
    mpSend({ k: 'sp', v: option, m: setPiece.minute, e: setPiece.minute });
    setSetPiece(null);
  }
  const myReqs = room && myRole ? decodeReqs(myRole === 'host' ? room.host_squad : room.guest_squad) : [];
  const myShouts = myReqs.filter((r) => r.k === 'shout');
  const lastShout = myShouts[myShouts.length - 1];

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
    halftimeDone.current = true;
    setPause(null);
    setExtra(stoppageFor(2));
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

  if (loading) return <LoadingScreen />;
  if (error) return <LoadingScreen error={error} onRetry={() => void loadData()} />;

  const opponentTeam = selectedClub ? clubs.find((team) => team.id !== selectedClub.id) : undefined;
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

  // Acento do fundo: multiplayer (lobby, torneio, qualquer sala) violeta; jogo contra o bot verde; menus dourado
  const theme = screen === 'lobby' || screen === 'tournament' || screen === 'friends' || !!room || spectating ? 'mp' : screen === 'draft' || screen === 'match' || screen === 'results' ? 'draft' : 'home';
  // Câmera do fundo do estádio: cada tela olha para um lugar (Home: campo; multiplayer: arquibancada...)
  const camera: BackdropCamera =
    screen === 'home' ? 'wide' : screen === 'club' ? 'left' : screen === 'lobby' || screen === 'tournament' ? 'stands' : screen === 'leaderboard' || screen === 'profile' || screen === 'squad' || screen === 'friends' ? 'right' : null;
  return (
    <div className="app-shell" data-theme={theme} data-lite={liteNow ? '1' : '0'}>
      <StadiumBackdrop camera={camera} />
      <style>{globalCss}</style>
      <style>{cardCss}</style>
      {!online && (
        <div
          role="status"
          style={{ position: 'fixed', top: 'max(8px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 500, padding: '7px 16px', borderRadius: 999, background: 'rgba(15,20,30,.94)', border: '1px solid #F5B800', color: '#F5B800', font: '800 12px Inter, sans-serif', letterSpacing: '.6px', boxShadow: '0 6px 20px rgba(0,0,0,.5)', whiteSpace: 'nowrap', pointerEvents: 'none' }}
        >
          {room || spectating ? '📡 SEM INTERNET · RECONECTANDO À PARTIDA…' : '📡 SEM INTERNET · JOGUE CONTRA O BOT'}
        </div>
      )}
      {resumeRoom && !room && (
        <div
          role="status"
          style={{ position: 'fixed', left: '50%', top: 'max(8px, env(safe-area-inset-top))', transform: 'translateX(-50%)', zIndex: 650, display: 'flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100vw - 24px)', padding: '9px 10px 9px 16px', borderRadius: 999, background: 'rgba(15,22,36,.97)', border: '1px solid #3ddc84', color: '#fff', font: '800 12px Inter, sans-serif', boxShadow: '0 8px 28px rgba(0,0,0,.5)' }}
        >
          <span>🔌 Você ainda tem uma partida em andamento</span>
          <button onClick={() => resumeMpRoom(resumeRoom)} style={{ border: 0, cursor: 'pointer', padding: '7px 12px', borderRadius: 999, background: '#3ddc84', color: '#06210f', font: '900 12px Inter, sans-serif', whiteSpace: 'nowrap' }}>
            Voltar
          </button>
          <button
            onClick={() => {
              clearActiveRoom();
              setResumeRoom(null);
            }}
            aria-label="Dispensar"
            style={{ border: 0, cursor: 'pointer', padding: '7px 9px', borderRadius: 999, background: 'transparent', color: '#9fb0c8', font: '900 12px Inter, sans-serif' }}
          >
            ✕
          </button>
        </div>
      )}
      {(room || spectating) && link !== 'ok' && online !== undefined && (
        <div
          role="status"
          style={{ position: 'fixed', top: 'max(8px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 520, padding: '7px 16px', borderRadius: 999, background: link === 'lost' ? 'rgba(120,40,10,.96)' : 'rgba(10,80,40,.96)', border: `1px solid ${link === 'lost' ? '#ffb066' : '#3ddc84'}`, color: '#fff', font: '900 12px Inter, sans-serif', letterSpacing: '.5px' }}
        >
          {link === 'lost' ? '📡 CONEXÃO PERDIDA · TENTANDO VOLTAR À PARTIDA…' : '✅ RECONECTADO · A PARTIDA SEGUE DE ONDE ESTAVA'}
        </div>
      )}
      {batteryNote && (
        <div role="status" style={{ position: 'fixed', top: 'max(8px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 510, padding: '7px 16px', borderRadius: 999, background: 'rgba(40,30,6,.96)', border: '1px solid #F5B800', color: '#fff', font: '900 12px Inter, sans-serif', letterSpacing: '.4px' }}>
          🔋 BATERIA BAIXA · EFEITOS REDUZIDOS PARA ECONOMIZAR
        </div>
      )}
      {update.ready && (
        <div
          role="status"
          style={{ position: 'fixed', left: '50%', bottom: 'max(14px, env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 600, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 'calc(100vw - 24px)', padding: '9px 10px 9px 16px', borderRadius: 999, background: 'rgba(15,22,36,.96)', border: '1px solid #F5B800', color: '#fff', font: '800 12px Inter, sans-serif', boxShadow: '0 8px 28px rgba(0,0,0,.5)' }}
        >
          <span>{screen === 'match' || !!room ? '🔄 Versão nova pronta. Atualize quando acabar a partida.' : '🔄 Versão nova disponível'}</span>
          <button
            onClick={() => {
              if ((screen === 'match' || !!room) && !window.confirm('Atualizar agora vai sair da partida. Continuar?')) return;
              update.apply();
            }}
            style={{ border: 0, cursor: 'pointer', padding: '7px 12px', borderRadius: 999, background: '#F5B800', color: '#111', font: '900 12px Inter, sans-serif', whiteSpace: 'nowrap' }}
          >
            Atualizar agora
          </button>
        </div>
      )}
      {showNews && <WhatsNew onClose={() => setShowNews(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} userId={userId} install={install} onLogin={() => setShowLogin(true)} />}
      <Header
        onSettings={() => setShowSettings(true)}
        onNews={() => setShowNews(true)}
        nickname={nickname}
        isAdmin={isAdmin}
        onAdmin={() => navigate('admin')}
        onHome={reset}
        onLeaderboard={() => navigate('leaderboard')}
        onSquad={() => navigate('squad')}
        onProfile={() => navigate('profile')}
        onFriends={openFriends}
        onLogin={() => setShowLogin(true)}
        loggedIn={!!userId}
        active={screen}
        friendsOnline={friends.rows.filter((row) => row.status === 'accepted' && friends.online.has(row.user_id)).length}
        friendsPending={friends.rows.some((row) => row.status === 'pending' && row.incoming)}
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
          teams={clubs}
          room={room}
          myRole={myRole}
          busy={mpBusy}
          error={mpError}
          onBack={() => {
            setInviteTarget(null);
            reset();
          }}
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
          friends={friends}
          inviteCode={inviteCode}
          onInviteUsed={() => setInviteCode(null)}
          inviteTarget={inviteTarget}
          onClearTarget={() => setInviteTarget(null)}
        />
      )}

      {screen === 'tournament' && !!userId && (
        <TournamentScreen
          teams={clubs}
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
          onTournament={openTournament}
          onSquad={() => navigate('squad')}
          onProfile={() => navigate('profile')}
          onFriends={openFriends}
          friendsOnline={friends.rows.filter((row) => row.status === 'accepted' && friends.online.has(row.user_id)).length}
          friendsPending={friends.rows.some((row) => row.status === 'pending' && row.incoming)}
          loggedIn={!!userId}
          onLogin={() => setShowLogin(true)}
          onLeaderboard={() => navigate('leaderboard')}
          nickname={nickname}
          featured={featuredPlayers}
          liveRooms={liveRoomCount}
          offline={!online}
          install={install}
          onSettings={() => setShowSettings(true)}
          onNews={() => setShowNews(true)}
        />
      )}

      {screen === 'club' && (
        <ClubChoice
          teams={clubs}
          mode={mode}
          onMode={setMode}
          onBack={reset}
          onChoose={chooseClub}
          showTestTools={isAdmin || window.location.search.includes('teste')}
          forceShootout={forceShootout}
          onForceShootout={setForceShootout}
          botLevel={botLevel}
          onBotLevel={setBotLevel}
        />
      )}

      {benchStep && (
        <BenchPicker
          candidates={benchStep.candidates}
          onConfirm={(bench) => {
            const step = benchStep;
            benchRef.current = bench;
            setBenchStep(null);
            step.next();
          }}
        />
      )}

      {tacticStep && (
        <TacticPicker
          squad={tacticStep.squad}
          onPick={(tactic, captain) => {
            const step = tacticStep;
            setTacticStep(null);
            step.next(tactic, captain);
          }}
        />
      )}

      {lineupReveal && screen === 'match' && (lineupReveal.team ?? opponentTeam) && (
        <RivalReveal
          opponent={(lineupReveal.team ?? opponentTeam) as Team}
          rivalName={lineupReveal.name}
          rivalTactic={lineupReveal.tactic}
          squad={lineupReveal.squad}
          bench={lineupReveal.bench}
          onDone={() => setLineupReveal(null)}
        />
      )}

      {reveal && selectedClub && (
        <TeamReveal
          club={selectedClub}
          squad={reveal.squad}
          bench={reveal.bench}
          tactic={reveal.tactic}
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
          selected={draft}
          bench={benchDraft}
          withBench
          optionsFor={playersForPosition}
          onChoose={chooseDraftPlayer}
          rerollsLeft={rerolls}
          onReroll={rerollDraft}
          onSwap={swapDraft}
          onConfirm={confirmDraft}
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
          rerollsLeft={rerolls}
          onUseReroll={() => setRerolls(0)}
          onBack={() => goBack('club')}
        />
      )}

      {screen === 'match' && spectating && (
        <div className="lobby-error" style={{ maxWidth: 560, margin: '8px auto', borderColor: '#F5B800', background: 'rgba(245,184,0,.1)', color: '#F5B800' }}>
          👁 Assistindo: {spectating.host} x {spectating.guest}
        </div>
      )}

      {screen === 'match' && selectedClub && opponentTeam && !lineupReveal && (
        <MatchScreen
          club={selectedClub}
          opponent={opponentTeam}
          userTeam={userTeam}
          botTeam={botTeam}
          minute={minute}
          extra={extra}
          pause={pause}
          restartKey={restartKey}
          penaltyPrep={penaltyPrep}
          score={shownScore}
          events={events}
          shownGoalIds={shownGoalIds}
          ambience={liveNet ? undefined : botAmb}
          setPiece={setPiece}
          rivalNote={rivalNote}
          coach={
            spectating
              ? undefined
              : room
                ? {
                    shoutsLeft: SHOUTS_PER_MATCH - myShouts.length,
                    activeUntil: lastShout ? lastShout.e + SHOUT_MINUTES : 0,
                    activeShout: lastShout ? (lastShout.v as Shout) : null,
                    delayNote: MP_DELAY,
                    onTactic: (t: Tactic) => mpSend({ k: 'tac', v: t, m: minute, e: minute + MP_DELAY }),
                    onShout: (shout: Shout) => {
                      if (myShouts.length >= SHOUTS_PER_MATCH || (lastShout && minute < lastShout.e + SHOUT_MINUTES + SHOUT_COOLDOWN)) return;
                      mpSend({ k: 'shout', v: shout, m: minute, e: minute + MP_DELAY });
                    },
                  }
                : { shoutsLeft: coach.shouts, activeUntil: coach.until, activeShout: coach.shout, onTactic: changeTactic, onShout: callShout }
          }
          onSetPiece={(option) => (room ? mpPickSetPiece(option) : setPiece && resolveSetPiece(setPiece.minute, 'user', setPiece.kind, option))}
          onGoal={handleGoal}
          onClip={handleClip}
          mapRef={matchMapRef}
          onSkip={skipMatch}
          stats={stats}
          penaltyPhase={penaltyPhase}
          onShootoutFinish={finishShootout}
          canSkip={!room && !spectating}
          bench={userBench}
          workRef={workRef}
          endHalfRef={endHalfRef}
          deadBallRef={deadBallRef}
          tactic={matchTactics.user}
          staminaOn={!spectating}
          subsLog={subsLog}
          onSubs={confirmSubs}
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
          userTeam={[...userTeam, ...leftUser]}
          botTeam={[...botTeam, ...leftBot]}
          score={score}
          stats={stats}
          goalLog={goalLog}
          highlights={highlights}
          clips={clips}
          matchMap={matchMapRef.current}
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
      {screen === 'friends' && !!userId && (
        <FriendsScreen
          friends={friends}
          busy={mpBusy}
          error={mpError}
          onBack={reset}
          onInvite={(friend) => void handleInviteFriend(friend)}
          onWatch={watchRoom}
        />
      )}
      {screen === 'profile' && <ProfileScreen nickname={nickname} userId={userId} onBack={reset} />}
      {screen === 'squad' && <Squad players={players} teams={teams} onBack={reset} />}
      {screen === 'admin' && (
        <AdminScreen players={players} teams={teams} onBack={reset} onReload={loadData} />
      )}

      {friends.invite && !!userId && screen !== 'match' && screen !== 'draft' && (
        <InviteToast
          invite={friends.invite}
          onDecline={friends.dismissInvite}
          onAccept={() => {
            setInviteCode(friends.invite?.code ?? null);
            friends.dismissInvite();
            navigate('lobby');
          }}
        />
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

export default App;
