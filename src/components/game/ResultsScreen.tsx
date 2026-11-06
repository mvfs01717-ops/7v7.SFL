import { useMemo } from 'react';
import { BarChart3, Crown, RefreshCw, Zap } from 'lucide-react';
import { type Shootout } from '@/components/PenaltyShootout';
import { slotOf } from '@/lib/game/helpers';
import { type GoalRecord, type MatchEvent, type MatchStats, type Player, type Team } from '@/lib/game/types';
import { TeamMark } from '@/components/game/Card';
import { EventIcon } from '@/components/game/MatchScreen';

export function ResultsScreen({
  club,
  opponent,
  userTeam,
  botTeam,
  score,
  stats,
  goalLog,
  highlights,
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
  highlights: MatchEvent[];
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
      <MatchHighlights club={club} opponent={opponent} highlights={highlights} />
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

export function ResultBar({
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

// Melhores momentos: todos os gols, mais os lances de defesa e finalização mais bonitos (até 4), em ordem de minuto
export function pickHighlights(events: MatchEvent[]): { event: MatchEvent; tag: string; score: number }[] {
  const tagOf = (event: MatchEvent) => {
    if (event.type === 'gol') {
      if (/olímpico/i.test(event.text)) return 'GOL OLÍMPICO';
      if (/bicicleta/i.test(event.text)) return 'GOLAÇO DE BICICLETA';
      if (/voleio/i.test(event.text)) return 'GOLAÇO DE VOLEIO';
      if (/chapéu|cavadinha/i.test(event.text)) return 'GOL DE CLASSE';
      if (/escanteio|cabece/i.test(event.text)) return 'GOL DE CABEÇA';
      return 'GOL';
    }
    if (/trave/i.test(event.text)) return 'NA TRAVE';
    if (event.type === 'defesa') return /defesaça|voa no canto|ângulo/i.test(event.text) ? 'DEFESAÇA' : 'DEFESA';
    return 'QUASE';
  };
  const worth = (event: MatchEvent) => {
    if (event.type === 'gol') return 100;
    if (/trave/i.test(event.text)) return 4;
    if (/defesaça|voa no canto|ângulo/i.test(event.text)) return 4;
    if (event.type === 'defesa') return 2;
    return 1;
  };
  const goals = events.filter((event) => event.type === 'gol');
  const extras = events
    .filter((event) => event.type !== 'gol')
    .map((event) => ({ event, score: worth(event) + (event.minute > 80 ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score || a.event.minute - b.event.minute)
    .slice(0, 4)
    .map((item) => item.event);
  return [...goals, ...extras]
    .sort((a, b) => a.minute - b.minute || a.id - b.id)
    .map((event) => ({ event, tag: tagOf(event), score: worth(event) }));
}

export function MatchHighlights({ club, opponent, highlights }: { club: Team; opponent: Team; highlights: MatchEvent[] }) {
  const items = useMemo(() => pickHighlights(highlights), [highlights]);
  if (!items.length) return null;
  return (
    <section className="result-panel" style={{ margin: '0 auto 18px', maxWidth: 1100 }}>
      <div className="section-title">
        <div>
          <span className="eyebrow">RESUMO DA PARTIDA</span>
          <h2>MELHORES MOMENTOS</h2>
        </div>
        <Zap color="#f5b800" />
      </div>
      {items.map(({ event, tag }) => (
        <div
          key={event.id}
          className={`event-row ${event.type === 'gol' ? 'goal-event' : ''}`}
          style={{ alignItems: 'center' }}
        >
          <strong>{event.minute}'</strong>
          <span className={`event-icon ${event.type}`}>
            <EventIcon type={event.type} />
          </span>
          <p>
            <small style={{ opacity: 0.7 }}>{event.team === 'user' ? club.abbreviation : opponent.abbreviation} · </small>
            {event.text}
          </p>
          <b style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{tag}</b>
        </div>
      ))}
    </section>
  );
}

export type PlayerRating = { rating: number; goals: number; assists: number };

// Nota de cada jogador: depende do resultado, de gols, defesas e de um pouco de sorte
export function rateTeam(
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

export function RatingList({
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
