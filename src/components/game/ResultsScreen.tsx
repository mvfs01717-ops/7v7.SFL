import { useMemo, useState } from 'react';
import { BarChart3, Crown, RefreshCw, Zap } from 'lucide-react';
import { type Shootout } from '@/components/PenaltyShootout';
import { slotOf } from '@/lib/game/helpers';
import { type GoalRecord, type MatchEvent, type MatchStats, type Player, type Team } from '@/lib/game/types';
import { Card, TeamMark } from '@/components/game/Card';
import { EventIcon } from '@/components/game/MatchScreen';
import { MatchMapPanel } from '@/components/game/MatchMapPanel';
import type { MatchMapData } from '@/lib/game/matchMap';
import { ReplayPlayer, type ClipData } from '@/components/game/ReplayPlayer';

const resultsCss = `
.rs { position: relative; isolation: isolate; --acc: #F5B800; }
.rs.rs-win { --acc: #4ade80; } .rs.rs-loss { --acc: #f87171; }
.rs::before { content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none; background:
  conic-gradient(from 198deg at 14% -8%, transparent 0 7%, rgba(255,246,200,.15) 9% 13%, transparent 15%),
  conic-gradient(from 162deg at 86% -8%, transparent 0 7%, rgba(255,246,200,.15) 9% 13%, transparent 15%),
  radial-gradient(80% 50% at 50% 0%, color-mix(in srgb, var(--acc) 22%, transparent), transparent 70%),
  linear-gradient(0deg, rgba(15,77,43,.45), transparent 26%),
  radial-gradient(120% 70% at 50% 0, #1b2a44 0, #0a1020 55%, #05070d 100%); }
.rs .result-banner { padding: 26px 0 4px; }
.rs .result-banner .eyebrow { justify-content: center; letter-spacing: 4px; color: var(--acc); }
.rs .result-banner h1 { font-style: italic; font-size: clamp(60px, 13vw, 118px); line-height: .9; margin: 10px 0 8px; color: var(--acc);
  text-shadow: 0 0 40px color-mix(in srgb, var(--acc) 55%, transparent), 0 6px 0 rgba(0,0,0,.35); animation: rsSlam .8s cubic-bezier(.2,1.4,.3,1) both; }
@keyframes rsSlam { 0% { opacity: 0; transform: scale(1.8); filter: blur(12px); } 100% { opacity: 1; transform: none; filter: none; } }
.rs .result-banner p { font-size: 14px; color: #b9c2cc; }
.rs .result-score { gap: 18px; border: 0; padding: 12px 22px; margin: 6px auto 22px; width: fit-content; max-width: 100%; border-radius: 6px 24px 6px 24px;
  background: linear-gradient(160deg, rgba(255,255,255,.1), rgba(255,255,255,.02)); border: 1px solid rgba(245,184,0,.3); backdrop-filter: blur(10px); box-shadow: 0 18px 44px rgba(0,0,0,.5); animation: rsRise .7s .2s both; }
.rs .result-score > strong { font-size: 76px; line-height: 1; font-style: italic; }
@keyframes rsRise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
.rs-conf { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.rs-conf i { position: absolute; top: -12px; width: 8px; height: 14px; border-radius: 2px; opacity: 0; animation: rsFall linear infinite; }
@keyframes rsFall { 0% { transform: translateY(0) rotate(0); opacity: 0; } 8% { opacity: 1; } 100% { transform: translateY(105vh) rotate(720deg); opacity: .9; } }
.rs-mvp { display: flex; align-items: center; gap: 22px; width: min(640px, 100%); margin: 0 auto 24px; padding: 18px 24px; border-radius: 6px 24px 6px 24px;
  border: 1px solid rgba(245,184,0,.45); background: linear-gradient(110deg, rgba(245,184,0,.22), rgba(255,255,255,.03)); box-shadow: 0 0 40px rgba(245,184,0,.15); animation: rsRise .7s .35s both; }
.rs-mvp-card { width: 104px; flex: none; filter: drop-shadow(0 14px 14px rgba(0,0,0,.6)); }
.rs-mvp h3 { margin: 4px 0 2px; font-size: 28px; font-style: italic; text-transform: uppercase; line-height: 1; }
.rs-mvp small { opacity: .7; }
.rs-mvp-r { margin-left: auto; text-align: center; font-size: 54px; font-weight: 900; font-style: italic; line-height: 1; color: #4ade80; text-shadow: 0 0 24px rgba(74,222,128,.5); }
.rs-mvp-r small { display: block; font-size: 10px; letter-spacing: 2px; font-style: normal; color: #aab; }
.rs .results-grid { gap: 18px; align-items: start; }
.rs .result-panel { border-radius: 6px 22px 6px 22px; border: 1px solid rgba(245,184,0,.2); position: relative;
  background: linear-gradient(160deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); backdrop-filter: blur(10px); box-shadow: 0 20px 50px rgba(0,0,0,.45); animation: rsRise .7s .45s both; }
.rs .result-panel::before { content: ''; position: absolute; left: 0; right: 22px; top: 0; height: 2px; background: linear-gradient(90deg, #F5B800, transparent); }
.rs .section-title h2 { font-style: italic; letter-spacing: 1px; }
.rs .result-bar { padding: 11px 0; }
.rs .result-bar > div:first-child { font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
.rs .result-bar b { font-size: 15px; }
.rs .result-bar > div:last-child { height: 9px; border-radius: 9px; overflow: hidden; background: #5c2a29; }
.rs .result-bar > div:last-child i { background: linear-gradient(90deg, #b98500, #ffd24a); box-shadow: 0 0 12px rgba(245,184,0,.6); }
.rs .rating-list > div { grid-template-columns: 44px 1fr 46px; padding: 8px 6px; font-size: 13px; border-radius: 8px; border-bottom: 1px solid rgba(255,255,255,.06); }
.rs .rating-list > div b { font-weight: 700; }
.rs .rating-team { font-size: 11px; letter-spacing: 2px; color: #F5B800; font-weight: 800; }
.rs .rating-list strong { justify-self: end; min-width: 42px; padding: 3px 0; text-align: center; border-radius: 8px; font-size: 14px; color: #0b1016; background: #94a3b8; }
.rs .rating-list strong.rt-hi { background: #4ade80; } .rs .rating-list strong.rt-mid { background: #F5B800; } .rs .rating-list strong.rt-lo { background: #f87171; }
.rs .rating-list > div.best-player { background: linear-gradient(90deg, rgba(74,222,128,.18), transparent); box-shadow: inset 3px 0 0 #4ade80; }
.rs .event-row.goal-event { background: linear-gradient(90deg, rgba(245,184,0,.14), transparent); }
.rs .result-actions { margin-top: 26px; gap: 14px; }
.rs .result-actions .gold-button { clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%); border: 0; padding: 18px 38px; font-size: 14px; letter-spacing: 3px; text-transform: uppercase;
  background: linear-gradient(180deg, #ffe27a, #F5B800 60%, #d99a00); box-shadow: 0 0 30px rgba(245,184,0,.35); }
.rs .result-actions .outline-button { border-radius: 4px; padding: 17px 28px; letter-spacing: 2px; text-transform: uppercase; }
@media (max-width: 560px) {
  .rs .result-score > strong { font-size: 54px; } .rs .result-score { padding: 10px 14px; gap: 10px; }
  .rs-mvp { gap: 12px; padding: 14px; } .rs-mvp-card { width: 78px; } .rs-mvp h3 { font-size: 20px; } .rs-mvp-r { font-size: 38px; }
  .rs .result-actions .gold-button, .rs .result-actions .outline-button { width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .rs *, .rs-conf i { animation: none !important; } }
`;

export function ResultsScreen({
  club,
  opponent,
  userTeam,
  botTeam,
  score,
  stats,
  goalLog,
  highlights,
  clips,
  matchMap,
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
  clips?: Record<number, ClipData>;
  matchMap?: MatchMapData | null;
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
  const isDraw = score.user === score.bot && !shootout;
  const mvp = useMemo(() => {
    let best: { player: Player; rating: number; info: PlayerRating } | null = null;
    [
      ...userTeam.map((player) => ({ player, info: ratings.user[player.id] })),
      ...botTeam.map((player) => ({ player, info: ratings.bot[player.id] })),
    ].forEach((entry) => {
      if (entry.info && (!best || entry.info.rating > best.rating)) best = { ...entry, rating: entry.info.rating };
    });
    return best as { player: Player; rating: number; info: PlayerRating } | null;
  }, [ratings, userTeam, botTeam]);
  const confetti = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({ l: (i * 37) % 100, d: (i * 0.41) % 5, t: 4 + ((i * 7) % 4), c: ['#F5B800', '#4ade80', '#fff', '#ffe27a'][i % 4] })),
    [],
  );
  return (
    <main className={`results-page rs ${userWon ? 'rs-win' : isDraw ? '' : 'rs-loss'}`}>
      <style>{resultsCss}</style>
      {userWon && (
        <div className="rs-conf" aria-hidden="true">
          {confetti.map((c, i) => (
            <i key={i} style={{ left: `${c.l}%`, background: c.c, animationDelay: `-${c.d}s`, animationDuration: `${c.t}s` }} />
          ))}
        </div>
      )}
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
      {mvp && (
        <div className="rs-mvp">
          <div className="rs-mvp-card">
            <Card player={mvp.player} fluid />
          </div>
          <div>
            <span className="eyebrow">MELHOR EM CAMPO</span>
            <h3>{mvp.player.name}</h3>
            <small>
              {mvp.info.goals} {mvp.info.goals === 1 ? 'gol' : 'gols'} · {mvp.info.assists} assist.
            </small>
          </div>
          <div className="rs-mvp-r">
            {mvp.rating.toFixed(1)}
            <small>NOTA</small>
          </div>
        </div>
      )}
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
      <MatchHighlights club={club} opponent={opponent} highlights={highlights} clips={clips} />
      <MatchMapPanel club={club} opponent={opponent} data={matchMap ?? null} />
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

export function MatchHighlights({
  club,
  opponent,
  highlights,
  clips = {},
}: {
  club: Team;
  opponent: Team;
  highlights: MatchEvent[];
  clips?: Record<number, ClipData>;
}) {
  const items = useMemo(() => pickHighlights(highlights), [highlights]);
  const playable = useMemo(() => items.filter((item) => clips[item.event.id]), [items, clips]);
  // Índice do lance que está tocando (null = parado); `all` encadeia os lances em sequência
  const [current, setCurrent] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const now = current !== null ? playable[current] : null;
  const clip = now ? clips[now.event.id] : null;
  const playId = (id: number, chain: boolean) => {
    const index = playable.findIndex((item) => item.event.id === id);
    if (index < 0) return;
    setAll(chain);
    setCurrent(index);
  };
  const next = () => {
    if (all && current !== null && current + 1 < playable.length) setCurrent(current + 1);
    else {
      setAll(false);
      setCurrent(null);
    }
  };
  return (
    <section className="result-panel" style={{ margin: '0 auto 18px', maxWidth: 1100 }}>
      <style>{highlightsCss}</style>
      <div className="section-title">
        <div>
          <span className="eyebrow">RESUMO DA PARTIDA</span>
          <h2>MELHORES MOMENTOS</h2>
        </div>
        <Zap color="#f5b800" />
      </div>
      {playable.length > 0 && (
        <div className="hl-tv">
          {clip && now ? (
            <>
              <div className="hl-top">
                <span className="hl-badge">
                  <i /> {now.event.minute}' · {now.tag}
                </span>
                <b>{clip.label}</b>
                <small>
                  {current! + 1}/{playable.length}
                </small>
              </div>
              <ReplayPlayer key={`${now.event.id}-${current}`} data={clip} club={club} opponent={opponent} speed={0.8} onEnd={next} />
              <div className="hl-ctrl">
                <button type="button" onClick={() => setCurrent((index) => (index !== null && index > 0 ? index - 1 : index))} disabled={current === 0}>
                  ◀ Anterior
                </button>
                <button type="button" onClick={() => { setAll(false); setCurrent(null); }}>
                  ■ Parar
                </button>
                <button type="button" onClick={next}>
                  Próximo ▶
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="hl-start cta-slant" onClick={() => playId(playable[0].event.id, true)}>
              ▶ Assistir melhores momentos
              <small>{playable.length} lances em câmera lenta</small>
            </button>
          )}
        </div>
      )}
      {items.map(({ event, tag }) => {
        const has = !!clips[event.id];
        const live = now?.event.id === event.id;
        return (
          <div
            key={event.id}
            className={`event-row ${event.type === 'gol' ? 'goal-event' : ''} ${has ? 'hl-row' : ''} ${live ? 'hl-live' : ''}`}
            style={{ alignItems: 'center', cursor: has ? 'pointer' : undefined }}
            onClick={has ? () => playId(event.id, false) : undefined}
          >
            <strong>{event.minute}'</strong>
            <span className={`event-icon ${event.type}`}>
              <EventIcon type={event.type} />
            </span>
            <p>
              <small style={{ opacity: 0.7 }}>{event.team === 'user' ? club.abbreviation : opponent.abbreviation} · </small>
              {event.text}
            </p>
            <b style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{has ? '▶ ' : ''}{tag}</b>
          </div>
        );
      })}
    </section>
  );
}

const highlightsCss = `
.hl-tv { margin: 4px 0 14px; border-radius: 14px; overflow: hidden; border: 2px solid #F5B800; background: #000; max-width: 760px; margin-left: auto; margin-right: auto; box-shadow: 0 16px 50px rgba(0,0,0,.6), 0 0 30px rgba(245,184,0,.25); }
.hl-top { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: linear-gradient(90deg, rgba(0,0,0,.95), rgba(25,18,0,.9)); color: #fff; font-size: 12px; }
.hl-top b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hl-badge { display: inline-flex; align-items: center; gap: 6px; font-family: 'Bebas Neue', sans-serif; font-size: 16px; letter-spacing: .1em; color: #F5B800; white-space: nowrap; }
.hl-badge i { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: hlRec 1s steps(2) infinite; }
.hl-ctrl { display: flex; gap: 8px; justify-content: center; padding: 8px; background: rgba(0,0,0,.85); }
.hl-ctrl button { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); color: #fff; border-radius: 99px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; }
.hl-ctrl button:disabled { opacity: .35; cursor: default; }
.hl-start { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%; border: 0; padding: 22px 12px; font-family: 'Bebas Neue', sans-serif; font-size: 26px; letter-spacing: .08em; cursor: pointer; border-radius: 0; }
.hl-start small { font-family: inherit; font-size: 12px; letter-spacing: .06em; opacity: .75; }
.hl-row:hover { background: rgba(245,184,0,.08); }
.hl-live { background: rgba(245,184,0,.16) !important; box-shadow: inset 3px 0 0 #F5B800; }
@keyframes hlRec { 50% { opacity: .15; } }
`;

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
            <strong className={info.rating >= 8 ? 'rt-hi' : info.rating >= 6.5 ? 'rt-mid' : info.rating < 6 ? 'rt-lo' : ''}>{info.rating.toFixed(1)}</strong>
          </div>
        );
      })}
    </div>
  );
}
