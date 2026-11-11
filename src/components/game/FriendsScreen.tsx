import { useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { FriendsPanel } from '@/components/game/FriendsPanel';
import { useLiveRooms } from '@/components/game/LobbyScreen';
import type { FriendRow, FriendsApi } from '@/lib/friends';
import type { Room } from '@/lib/multiplayer';
import type { Team } from '@/lib/game/types';

const css = `
.fs-page { position: relative; width: 100%; max-width: 100vw; box-sizing: border-box; overflow-x: clip; }
.fs-page .flow-heading h2 { font-style: italic; font-size: clamp(42px, 7vw, 68px); }
.fs-page .flow-heading .eyebrow { justify-content: center; letter-spacing: 3px; }
.fs-page .flow-heading p { display: none; }
.fs-wrap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 18px; max-width: 1040px; margin: 0 auto; align-items: start; }
.fs-card { padding: 20px; border-radius: 6px 20px 6px 20px; background: linear-gradient(160deg, rgba(14,22,48,.78), rgba(8,13,30,.78)); border: 1px solid color-mix(in srgb, var(--ac, #F5B800) 30%, transparent); backdrop-filter: blur(10px); }
.fs-card h3 { margin: 0 0 4px; font-size: 18px; letter-spacing: 1px; text-transform: uppercase; }
.fs-card > p { margin: 0 0 14px; font-size: 13px; opacity: .7; }
.fs-label { display: block; margin: 14px 0 8px; font-size: 11px; font-weight: 800; letter-spacing: 2px; opacity: .65; }
.fs-clubs { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.fs-club { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #fff; font-weight: 700; font-size: 12px; cursor: pointer; text-align: left; }
.fs-club i { font-style: normal; flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; font-size: 10px; font-weight: 900; background: var(--club); border: 2px solid rgba(255,255,255,.75); }
.fs-club span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-club.on { border-color: var(--ac, #F5B800); box-shadow: 0 0 0 1px var(--ac, #F5B800); background: color-mix(in srgb, var(--ac, #F5B800) 18%, transparent); }
.fs-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.fs-seg button { padding: 11px 8px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; }
.fs-seg button.on { border-color: var(--ac, #F5B800); background: color-mix(in srgb, var(--ac, #F5B800) 22%, transparent); }
.fs-error { margin-top: 12px; padding: 10px 14px; border-radius: 10px; border: 1px solid #ff6b6b; background: rgba(255,107,107,.1); color: #ffb3b3; font-size: 14px; text-align: center; }
.fs-busy { margin-top: 12px; font-size: 13px; opacity: .8; text-align: center; }
.fs-wrap .fr { background: linear-gradient(160deg, rgba(14,22,48,.86), rgba(8,13,30,.86)); backdrop-filter: blur(10px); }
@media (max-width: 820px) { .fs-wrap { grid-template-columns: minmax(0, 1fr); } }
`;

// Tela própria de amigos: adicionar pelo apelido, ver quem está online, convidar para jogar e assistir a partida deles ao vivo
export default function FriendsScreen({
  teams,
  friends,
  busy,
  error,
  onBack,
  onInvite,
  onWatch,
}: {
  teams: Team[];
  friends: FriendsApi;
  busy: boolean;
  error: string;
  onBack: () => void;
  // Cria a sala com o clube e o modo escolhidos e avisa o amigo
  onInvite: (friend: FriendRow, teamId: string, mode: 'classic' | 'dice') => void;
  onWatch: (room: Room) => void;
}) {
  const [teamId, setTeamId] = useState('');
  const [mode, setMode] = useState<'classic' | 'dice'>('classic');
  const live = useLiveRooms(true);
  const chosen = teamId || teams[0]?.id || '';

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
        <section className="fs-card">
          <h3>Convidar para jogar</h3>
          <p>Escolha seu clube e o modo. Ao convidar um amigo, a sala é criada e ele recebe o aviso dentro do jogo.</p>
          <span className="fs-label">SEU CLUBE</span>
          <div className="fs-clubs">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={chosen === team.id ? 'fs-club on' : 'fs-club'}
                onClick={() => setTeamId(team.id)}
                style={{ '--club': team.primary_color } as React.CSSProperties}
              >
                <i>{team.abbreviation}</i>
                <span>{team.name}</span>
              </button>
            ))}
          </div>
          <span className="fs-label">MODO DO DRAFT</span>
          <div className="fs-seg">
            <button type="button" className={mode === 'classic' ? 'on' : ''} onClick={() => setMode('classic')}>
              Draft clássico
            </button>
            <button type="button" className={mode === 'dice' ? 'on' : ''} onClick={() => setMode('dice')}>
              <span aria-hidden="true">🎲</span> Modo Dado
            </button>
          </div>
          {busy && <div className="fs-busy">Criando a sala e avisando seu amigo...</div>}
          {error && <div className="fs-error">{error}</div>}
        </section>

        <FriendsPanel
          friends={friends}
          canInvite={!busy && !!chosen}
          sentIds={[]}
          onInvite={(friend) => onInvite(friend, chosen, mode)}
          liveRooms={live.rooms}
          onWatch={onWatch}
        />
      </div>
    </main>
  );
}
