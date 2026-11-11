import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Swords } from 'lucide-react';
import { type Team } from '@/lib/game/types';
import { listLiveRooms, lookupRoom, type ChatMessage, type Room } from '@/lib/multiplayer';
import { ChatBox } from '@/components/game/Chat';
import { FriendsPanel } from '@/components/game/FriendsPanel';
import type { FriendRow, FriendsApi } from '@/lib/friends';

export const lobbyCss = `
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

.lobby-page { position: relative; isolation: isolate; }
.lobby-page::before { content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none; background:
  conic-gradient(from 198deg at 14% -8%, transparent 0 7%, rgba(255,246,200,.17) 9% 13%, transparent 15%),
  conic-gradient(from 162deg at 86% -8%, transparent 0 7%, rgba(255,246,200,.17) 9% 13%, transparent 15%),
  linear-gradient(0deg, rgba(15,77,43,.5), transparent 28%),
  radial-gradient(120% 70% at 50% 0, #1b2a44 0, #0a1020 55%, #05070d 100%); }
.lobby-page .flow-heading h2 { font-style: italic; font-size: clamp(42px, 7vw, 68px); }
.lobby-page .flow-heading .eyebrow { justify-content: center; letter-spacing: 3px; }
.lobby-card { position: relative; border-radius: 6px 22px 6px 22px; border-color: rgba(245,184,0,.22);
  background: linear-gradient(160deg, rgba(255,255,255,.09), rgba(255,255,255,.02)); backdrop-filter: blur(10px); box-shadow: 0 20px 50px rgba(0,0,0,.45); }
.lobby-card::before { content: ''; position: absolute; left: 0; right: 22px; top: 0; height: 2px; background: linear-gradient(90deg, #F5B800, transparent); }
.lobby-step b { box-shadow: 0 0 16px rgba(245,184,0,.5); }
.lobby-step h3 { text-transform: uppercase; letter-spacing: 1.5px; }
.lobby-club { transition: transform .2s, border-color .2s, box-shadow .2s; }
.lobby-club:hover { transform: translateY(-2px); border-color: rgba(245,184,0,.6); }
.lobby-club.on { box-shadow: 0 0 0 1px #F5B800 inset, 0 0 22px rgba(245,184,0,.3); }
.lobby-club i { box-shadow: 0 0 12px color-mix(in srgb, var(--club, #444) 70%, transparent); }
.gold-button.large.lobby-main { clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%); border: 0; padding: 16px 20px; font-size: 15px; letter-spacing: 3px; text-transform: uppercase;
  background: linear-gradient(180deg, #ffe27a, #F5B800 60%, #d99a00); box-shadow: 0 0 30px rgba(245,184,0,.35); }
.gold-button.large.lobby-main:disabled { filter: grayscale(.6); opacity: .6; }
.lobby-seg button.on { background: linear-gradient(180deg, #ffe27a, #F5B800); }
.lobby-join input { font-size: 32px; }
@media (min-width: 900px) {
  .lobby-wrap { width: min(1040px, calc(100vw - 48px)); max-width: none; grid-template-columns: 1.25fr 1fr; align-items: start; gap: 18px; }
  .lobby-wrap > .lobby-or { display: none; }
  .lobby-wrap > .lobby-full { grid-column: 1 / -1; }
}
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

// Lista de partidas rolando agora; atualiza sozinha enquanto `enabled`
export function useLiveRooms(enabled = true) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloading, setReloading] = useState(false);
  const alive = useRef(true);
  const load = useCallback(async () => {
    const list = await listLiveRooms();
    if (alive.current) {
      setRooms(list);
      setLoaded(true);
    }
  }, []);
  const reload = useCallback(async () => {
    setReloading(true);
    await load();
    if (alive.current) setReloading(false);
  }, [load]);
  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [enabled, load]);
  return { rooms, loaded, reloading, reload };
}

export function LiveMatches({
  teams,
  onWatch,
  live,
  friendIds,
}: {
  teams: Team[];
  onWatch: (room: Room) => void;
  live: ReturnType<typeof useLiveRooms>;
  // Partidas de amigos aparecem primeiro, com destaque
  friendIds?: Set<string>;
}) {
  const { loaded, reloading } = live;
  const reload = live.reload;
  const isFriendRoom = (item: Room) => !!friendIds && (friendIds.has(item.host_id) || (!!item.guest_id && friendIds.has(item.guest_id)));
  const rooms = [...live.rooms].sort((a, b) => Number(isFriendRoom(b)) - Number(isFriendRoom(a)));
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
              {isFriendRoom(item) && <b style={{ color: '#4ade80', marginRight: 6 }}>★ AMIGO</b>}
              {item.host_nick} ({abbr(item.host_team_id)}) x {item.guest_nick ?? 'Jogador'} ({abbr(item.guest_team_id)})
            </span>
            <b style={{ color: '#F5B800', fontSize: 12 }}>👁 ASSISTIR</b>
          </button>
        ))}
      </div>
    </section>
  );
}

export function LobbyScreen({
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
  friends,
  inviteCode,
  onInviteUsed,
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
  onCancel: () => void;
  userId: string | null;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => boolean;
  friends?: FriendsApi;
  // Código vindo de um convite aceito: a sala é procurada sozinha
  inviteCode?: string | null;
  onInviteUsed?: () => void;
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
  // Convites: amigos que já receberam o convite desta sala e amigo na fila (sala sendo criada)
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [queued, setQueued] = useState<FriendRow | null>(null);
  // Partidas ao vivo (compartilhadas entre "Amigos" e "Assistir ao vivo"); só busca quando a tela de entrada está aberta
  const live = useLiveRooms(!room);
  const friendIds = useMemo(() => new Set((friends?.rows ?? []).filter((row) => row.status === 'accepted').map((row) => row.user_id)), [friends?.rows]);
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
  async function sendInviteTo(friend: FriendRow, target: Room) {
    if (!friends) return;
    const ok = await friends.sendInvite(friend.user_id, target.code, target.mode);
    if (ok) setSentIds((list) => (list.includes(friend.user_id) ? list : [...list, friend.user_id]));
    else setLookError(`Não foi possível avisar ${friend.nickname}. Passe o código ${target.code} para ele.`);
  }
  function inviteFriend(friend: FriendRow) {
    if (room && myRole === 'host' && room.status === 'waiting') void sendInviteTo(friend, room);
    else if (!room) {
      // Cria a sala com o clube e o modo escolhidos e convida assim que ela existir
      setQueued(friend);
      onCreate(chosenTeam, roomMode);
    }
  }
  useEffect(() => {
    if (queued && room && myRole === 'host' && room.status === 'waiting') {
      void sendInviteTo(queued, room);
      setQueued(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, room?.code, room?.status, myRole]);
  useEffect(() => {
    if (!room) setSentIds([]);
  }, [room]);
  // Convite aceito: procura a sala e deixa o convidado escolher o clube
  useEffect(() => {
    if (!inviteCode || !userId) return;
    if (room) {
      setLookError('Saia da sala atual para aceitar o convite.');
      onInviteUsed?.();
      return;
    }
    let cancelled = false;
    setCode(inviteCode);
    setLooking(true);
    setLookError('');
    void lookupRoom(inviteCode, userId).then((result) => {
      if (cancelled) return;
      setLooking(false);
      if (result.error || !result.room) setLookError(result.error ?? 'Essa sala não está mais disponível.');
      else {
        setFound(result.room);
        setJoinTeamId('');
      }
      onInviteUsed?.();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode, userId]);
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
          {(error || lookError) && <div className="lobby-error lobby-full">{lookError || error}</div>}

          {friends && !!userId && (
            <div className="lobby-full">
              <FriendsPanel
                friends={friends}
                canInvite
                sentIds={sentIds}
                onInvite={inviteFriend}
                hint="Ao convidar, a sala é criada com o clube e o modo escolhidos acima. O amigo recebe o aviso dentro do jogo."
                liveRooms={live.rooms}
                onWatch={onWatch}
              />
            </div>
          )}

          <div className="lobby-full">
            <LiveMatches teams={teams} onWatch={onWatch} live={live} friendIds={friendIds} />
          </div>
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
          {friends && !!userId && (
            <div style={{ marginTop: 20, textAlign: 'left' }}>
              <FriendsPanel friends={friends} canInvite sentIds={sentIds} onInvite={inviteFriend} />
            </div>
          )}
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

export function ClubPicker({
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
