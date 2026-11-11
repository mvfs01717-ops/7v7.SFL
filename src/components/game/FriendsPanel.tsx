import { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import type { FriendRow, FriendsApi, Invite } from '@/lib/friends';
import type { Room } from '@/lib/multiplayer';

const friendsCss = `
.fr { position: relative; min-width: 0; box-sizing: border-box; padding: 18px; border-radius: 6px 22px 6px 22px; border: 1px solid rgba(245,184,0,.22);
  background: linear-gradient(160deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); backdrop-filter: blur(10px); box-shadow: 0 20px 50px rgba(0,0,0,.4); color: #fff; }
.fr::before { content: ''; position: absolute; left: 0; right: 22px; top: 0; height: 2px; background: linear-gradient(90deg, #F5B800, transparent); }
.fr * { box-sizing: border-box; }
.fr-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.fr-head h3 { margin: 0; font-size: 20px; letter-spacing: .08em; font-style: italic; flex: 1; }
.fr-head small { font-size: 11px; font-weight: 800; letter-spacing: .1em; color: #4ade80; }
.fr-add { display: flex; gap: 8px; }
.fr-add input { flex: 1; min-width: 0; padding: 11px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.35); color: #fff; font-size: 14px; }
.fr-add input:focus { outline: none; border-color: #F5B800; }
.fr-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 14px; border: 0; border-radius: 10px; font-weight: 800; font-size: 13px; cursor: pointer; white-space: nowrap;
  background: linear-gradient(180deg, #ffe27a, #F5B800); color: #1a1200; }
.fr-btn:disabled { opacity: .5; cursor: default; }
.fr-btn.ghost { background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.18); }
.fr-btn.sent { background: rgba(74,222,128,.18); color: #86efac; border: 1px solid rgba(74,222,128,.5); }
.fr-msg { margin: 8px 0 0; font-size: 13px; }
.fr-msg.ok { color: #86efac; } .fr-msg.err { color: #fca5a5; }
.fr-label { display: block; margin: 14px 0 6px; font-size: 11px; font-weight: 800; letter-spacing: .14em; color: #F5B800; }
.fr-list { display: grid; gap: 6px; }
.fr-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.08); }
.fr-av { position: relative; width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center; font-weight: 900; color: #1a1200;
  background: radial-gradient(circle at 30% 25%, #ffe27a, #c48a00); }
.fr-av i { position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%; border: 2px solid #0a1020; background: #6b7280; }
.fr-av i.on { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
.fr-name { flex: 1; min-width: 0; line-height: 1.2; }
.fr-name b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-name small { font-size: 11px; opacity: .65; }
.fr-name small.on { color: #4ade80; opacity: 1; }
.fr-name small.live { color: #F5B800; opacity: 1; font-weight: 800; }
.fr-live { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 8px #ef4444; animation: frPulse 1.2s ease-in-out infinite; }
@keyframes frPulse { 50% { opacity: .35; } }
.fr-btn.watch { background: linear-gradient(180deg, #ef4444, #b91c1c); color: #fff; }
.fr-x { background: none; border: 0; color: rgba(255,255,255,.45); cursor: pointer; font-size: 15px; padding: 4px 6px; }
.fr-x:hover { color: #f87171; }
.fr-empty { margin: 4px 0 0; font-size: 13px; opacity: .65; }
.fr-hint { margin: 10px 0 0; font-size: 12px; opacity: .6; }
.fr-toast { position: fixed; z-index: 1200; top: 86px; right: 16px; width: min(340px, calc(100vw - 32px)); padding: 14px; border-radius: 6px 20px 6px 20px; border: 1px solid #F5B800;
  background: linear-gradient(160deg, rgba(14,22,42,.97), rgba(6,9,18,.97)); box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 30px rgba(245,184,0,.25); color: #fff; animation: frIn .4s cubic-bezier(.2,1.2,.4,1) both; }
.fr-toast span { font-size: 10px; font-weight: 900; letter-spacing: .16em; color: #F5B800; }
.fr-toast p { margin: 6px 0 12px; font-size: 15px; line-height: 1.35; }
.fr-toast div { display: flex; gap: 8px; }
@keyframes frIn { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
`;

export function FriendsPanel({
  friends,
  canInvite,
  sentIds,
  onInvite,
  hint,
  liveRooms,
  onWatch,
}: {
  friends: FriendsApi;
  // Convidar só funciona com sala criada (ou criando uma na hora)
  canInvite: boolean;
  sentIds: string[];
  onInvite: (friend: FriendRow) => void;
  hint?: string;
  // Partidas rolando agora: quem tem amigo jogando ganha o botão "Assistir"
  liveRooms?: Room[];
  onWatch?: (room: Room) => void;
}) {
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const accepted = friends.rows.filter((row) => row.status === 'accepted');
  const incoming = friends.rows.filter((row) => row.status === 'pending' && row.incoming);
  const outgoing = friends.rows.filter((row) => row.status === 'pending' && !row.incoming);
  const sorted = [...accepted].sort((a, b) => Number(friends.online.has(b.user_id)) - Number(friends.online.has(a.user_id)) || a.nickname.localeCompare(b.nickname));
  const onlineCount = accepted.filter((row) => friends.online.has(row.user_id)).length;

  async function add() {
    if (busy) return;
    setBusy(true);
    const result = await friends.addFriend(nick);
    setBusy(false);
    if (result.ok) {
      setMsg({ text: result.status === 'accepted' ? 'Vocês agora são amigos!' : 'Pedido enviado!', ok: true });
      setNick('');
    } else setMsg({ text: result.error ?? 'Não foi possível adicionar.', ok: false });
  }

  return (
    <section className="fr" aria-label="Amigos">
      <style>{friendsCss}</style>
      <div className="fr-head">
        <Users size={20} color="#F5B800" />
        <h3>AMIGOS</h3>
        {accepted.length > 0 && <small>{onlineCount} ONLINE</small>}
      </div>
      <form
        className="fr-add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input value={nick} onChange={(event) => { setNick(event.target.value.slice(0, 24)); setMsg(null); }} placeholder="Adicionar pelo apelido" autoComplete="off" />
        <button className="fr-btn" type="submit" disabled={busy || nick.trim().length < 2}>
          <UserPlus size={15} /> {busy ? '...' : 'Adicionar'}
        </button>
      </form>
      {msg && <p className={`fr-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}

      {incoming.length > 0 && (
        <>
          <span className="fr-label">PEDIDOS RECEBIDOS</span>
          <div className="fr-list">
            {incoming.map((row) => (
              <div key={row.friendship_id} className="fr-row">
                <div className="fr-av">{row.nickname.slice(0, 1).toUpperCase()}</div>
                <div className="fr-name">
                  <b>{row.nickname}</b>
                  <small>quer ser seu amigo</small>
                </div>
                <button className="fr-btn" onClick={() => void friends.accept(row)}>Aceitar</button>
                <button className="fr-btn ghost" onClick={() => void friends.remove(row)}>Recusar</button>
              </div>
            ))}
          </div>
        </>
      )}

      <span className="fr-label">SEUS AMIGOS</span>
      {sorted.length === 0 ? (
        <p className="fr-empty">{friends.loading ? 'Carregando...' : 'Você ainda não tem amigos adicionados. Digite o apelido de alguém acima.'}</p>
      ) : (
        <div className="fr-list">
          {sorted.map((row) => {
            const on = friends.online.has(row.user_id);
            const sent = sentIds.includes(row.user_id);
            const playing = liveRooms?.find((item) => item.host_id === row.user_id || item.guest_id === row.user_id);
            const versus = playing ? (playing.host_id === row.user_id ? playing.guest_nick : playing.host_nick) : null;
            return (
              <div key={row.friendship_id} className="fr-row">
                <div className="fr-av">
                  {row.nickname.slice(0, 1).toUpperCase()}
                  <i className={on ? 'on' : ''} />
                </div>
                <div className="fr-name">
                  <b>{row.nickname}</b>
                  {playing ? (
                    <small className="live"><span className="fr-live" />Jogando{versus ? ` contra ${versus}` : ' agora'}</small>
                  ) : (
                    <small className={on ? 'on' : ''}>{on ? 'Online' : 'Offline'}</small>
                  )}
                </div>
                {playing && onWatch && (
                  <button className="fr-btn watch" onClick={() => onWatch(playing)}>👁 Assistir</button>
                )}
                {on && !playing && (
                  <button className={`fr-btn ${sent ? 'sent' : ''}`} disabled={!canInvite || sent} onClick={() => onInvite(row)}>
                    {sent ? '✓ Convite enviado' : 'Convidar para jogar'}
                  </button>
                )}
                <button
                  className="fr-x"
                  title="Remover amigo"
                  aria-label={`Remover ${row.nickname}`}
                  onClick={() => {
                    if (window.confirm(`Remover ${row.nickname} dos amigos?`)) void friends.remove(row);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {outgoing.length > 0 && (
        <>
          <span className="fr-label">PEDIDOS ENVIADOS</span>
          <div className="fr-list">
            {outgoing.map((row) => (
              <div key={row.friendship_id} className="fr-row">
                <div className="fr-av">{row.nickname.slice(0, 1).toUpperCase()}</div>
                <div className="fr-name">
                  <b>{row.nickname}</b>
                  <small>aguardando resposta</small>
                </div>
                <button className="fr-btn ghost" onClick={() => void friends.remove(row)}>Cancelar</button>
              </div>
            ))}
          </div>
        </>
      )}
      {hint && <p className="fr-hint">{hint}</p>}
    </section>
  );
}

// Aviso de convite que aparece em qualquer tela
export function InviteToast({ invite, onAccept, onDecline }: { invite: Invite; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="fr-toast" role="alertdialog" aria-label="Convite para jogar">
      <style>{friendsCss}</style>
      <span>CONVITE PARA JOGAR</span>
      <p>
        <b>{invite.fromNick}</b> te chamou para uma partida {invite.mode === 'dice' ? 'no Modo Dado' : 'no draft clássico'}!
      </p>
      <div>
        <button className="fr-btn" onClick={onAccept}>Aceitar</button>
        <button className="fr-btn ghost" onClick={onDecline}>Recusar</button>
      </div>
    </div>
  );
}
