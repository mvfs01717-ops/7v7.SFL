import { ArrowLeft, Users } from 'lucide-react';
import { FriendsPanel } from '@/components/game/FriendsPanel';
import { useLiveRooms } from '@/components/game/LobbyScreen';
import type { FriendRow, FriendsApi } from '@/lib/friends';
import type { Room } from '@/lib/multiplayer';

const css = `
.fs-page { position: relative; width: 100%; max-width: 100vw; box-sizing: border-box; overflow-x: clip; }
.fs-page .flow-heading h2 { font-style: italic; font-size: clamp(42px, 7vw, 68px); }
.fs-page .flow-heading .eyebrow { justify-content: center; letter-spacing: 3px; }
.fs-page .flow-heading p { display: none; }
.fs-wrap { display: grid; gap: 16px; width: min(760px, 100%); margin: 0 auto; align-items: start; }
.fs-tip { display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-radius: 12px; background: rgba(245,184,0,.1); border: 1px solid rgba(245,184,0,.35); font-size: 13px; line-height: 1.45; }
.fs-tip b { color: #F5B800; }
.fs-tip span { font-size: 22px; }
.fs-card { padding: 20px; border-radius: 6px 20px 6px 20px; background: linear-gradient(160deg, rgba(14,22,48,.78), rgba(8,13,30,.78)); border: 1px solid color-mix(in srgb, var(--ac, #F5B800) 30%, transparent); backdrop-filter: blur(10px); }
.fs-card h3 { margin: 0 0 4px; font-size: 18px; letter-spacing: 1px; text-transform: uppercase; }
.fs-card > p { margin: 0 0 14px; font-size: 13px; opacity: .7; }
.fs-error { margin-top: 12px; padding: 10px 14px; border-radius: 10px; border: 1px solid #ff6b6b; background: rgba(255,107,107,.1); color: #ffb3b3; font-size: 14px; text-align: center; }
.fs-wrap .fr { background: linear-gradient(160deg, rgba(14,22,48,.86), rgba(8,13,30,.86)); backdrop-filter: blur(10px); }
`;

// Tela própria de amigos: adicionar pelo apelido, ver quem está online, convidar para jogar e assistir a partida deles ao vivo
// Tela própria de amigos: adicionar pelo apelido, ver quem está online, convidar para jogar e assistir a partida deles ao vivo
export default function FriendsScreen({
  friends,
  busy,
  error,
  onBack,
  onInvite,
  onWatch,
}: {
  friends: FriendsApi;
  busy: boolean;
  error: string;
  onBack: () => void;
  // Leva você para o Multiplayer com o amigo já escolhido (lá você define clube e modo)
  onInvite: (friend: FriendRow) => void;
  onWatch: (room: Room) => void;
}) {
  const live = useLiveRooms(true);

  return (
    <main className="flow-page fs-page">
      <style>{css}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="flow-heading">
        <div className="eyebrow">
          <Users size={14} /> AMIGOS
        </div>
        <h2>
          SEUS <em>AMIGOS</em>
        </h2>
        <p>Adicione amigos, veja quem está online e convide para jogar.</p>
      </div>

      <div className="fs-wrap">
        <div className="fs-tip">
          <span aria-hidden="true">🎮</span>
          <div>
            Toque em <b>Convidar para jogar</b> ao lado de um amigo. Você escolhe o clube e o modo na tela de <b>Multiplayer</b>, e o convite chega para ele assim que a sala for criada.
          </div>
        </div>
        {busy && <div className="fs-busy">Avisando seu amigo...</div>}
        {error && <div className="fs-error">{error}</div>}
        <FriendsPanel
          friends={friends}
          canInvite={!busy}
          sentIds={[]}
          onInvite={onInvite}
          liveRooms={live.rooms}
          onWatch={onWatch}
        />
      </div>
    </main>
  );
}
