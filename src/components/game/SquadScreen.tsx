import { ArrowLeft, Users } from 'lucide-react';
import { type Player, type Team } from '@/lib/game/types';
import { Card, TeamMark } from '@/components/game/Card';
import { isFreeAgent } from '@/lib/game/helpers';

export function Squad({ players, teams, onBack }: { players: Player[]; teams: Team[]; onBack: () => void }) {
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
            {isFreeAgent(team) ? (
              <div className="team-mark">
                <span>Jogadores sem clube</span>
              </div>
            ) : (
              <TeamMark team={team} />
            )}
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
