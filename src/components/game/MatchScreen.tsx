import { CircleUserRound, Goal, RefreshCw, Shield, SkipForward, Zap } from 'lucide-react';
import MatchPitch from '@/components/MatchPitch';
import PenaltyShootout, { type Shootout } from '@/components/PenaltyShootout';
import { slotOf } from '@/lib/game/helpers';
import { type MatchEvent, type MatchStats, type Player, type Position, type Team } from '@/lib/game/types';
import { SUBS_WINDOW_SEC, effortLoss, staminaAt, type ChatMessage, type Tactic } from '@/lib/multiplayer';
import { TeamMark } from '@/components/game/Card';
import { ChatBox, ChatToast } from '@/components/game/Chat';
import { HalftimeBreak, PenaltyPrep, SubstitutionPanel, staminaColor } from '@/components/game/Halftime';

export function MatchScreen({
  club,
  opponent,
  userTeam,
  botTeam,
  minute,
  extra,
  pause,
  restartKey,
  penaltyPrep,
  score,
  events,
  shownGoalIds,
  onGoal,
  onSkip,
  stats,
  penaltyPhase,
  onShootoutFinish,
  canSkip,
  bench,
  workRef,
  tactic,
  staminaOn,
  subsLog,
  onSubs,
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
  extra: number;
  pause: 'halftime' | 'break' | 'subs' | 'return' | null;
  restartKey: number;
  penaltyPrep: boolean;
  score: { user: number; bot: number };
  events: MatchEvent[];
  shownGoalIds: number[];
  onGoal: (id: number, side: 'user' | 'bot') => void;
  onSkip: () => void;
  stats: MatchStats;
  penaltyPhase: boolean;
  onShootoutFinish: (result: Shootout) => void;
  canSkip: boolean;
  bench: Player[];
  workRef: { current: { effort: Record<string, number>; slow: Record<string, number> } };
  tactic: Tactic;
  staminaOn: boolean;
  subsLog: { user: string[]; bot: string[] };
  onSubs: (choices: { slot: Position; inId: string }[]) => void;
  multiplayer: boolean;
  net?: { roomId: string; role: 'host' | 'guest' | 'spectator' };
  onAbort?: () => void;
  userId: string | null;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => boolean;
}) {
  // O lance do gol só aparece no feed depois que a bola entrou na animação
  const feed = events.filter((event) => event.type !== 'gol' || shownGoalIds.includes(event.id));
  // Fôlego atual de cada jogador (só quando o fôlego está ligado)
  const staminaOf = (player: Player) =>
    staminaOn
      ? staminaAt(
          slotOf(player),
          Math.min(minute, 90),
          tactic,
          player.since ?? 0,
          (player.carried ?? 0) + effortLoss(workRef.current.effort[`user-${slotOf(player)}`] ?? 0),
        )
      : 100;
  const staminaList = userTeam.map((player) => ({ player, value: staminaOf(player) }));
  const staminaAvg = staminaList.length ? staminaList.reduce((sum, item) => sum + item.value, 0) / staminaList.length : 100;
  return (
    <main className="match-page">
      <div className="match-header">
        <div className="match-status">
          <span className="live-dot" />{' '}
          {pause === 'halftime' || pause === 'break' || pause === 'return' ? 'INTERVALO' : pause === 'subs' ? 'INTERVALO · TROCAS' : `AO VIVO · ${minute}${extra > 0 ? `+${extra}` : ''}'`}
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
        <div style={{ position: 'relative', minHeight: pause === 'subs' ? 620 : undefined }}>
          <MatchPitch
            club={club}
            opponent={opponent}
            userTeam={userTeam}
            botTeam={botTeam}
            events={events}
            onGoal={onGoal}
            restartKey={restartKey}
            workRef={staminaOn ? workRef : undefined}
          />
          {(pause === 'halftime' || pause === 'break' || pause === 'return') && (
            <HalftimeBreak
              phase={pause === 'halftime' ? 'full' : pause === 'break' ? 'out' : 'in'}
              club={club}
              opponent={opponent}
              userTeam={userTeam}
              botTeam={botTeam}
              score={score}
              subsLog={subsLog}
            />
          )}
          {pause === 'subs' && (
            <SubstitutionPanel club={club} userTeam={userTeam} bench={bench} tactic={tactic} minute={minute} onConfirm={onSubs} limitSec={multiplayer ? SUBS_WINDOW_SEC : undefined} />
          )}
          {penaltyPrep && <PenaltyPrep club={club} opponent={opponent} score={score} />}
        </div>
      )}

      {staminaOn && !penaltyPhase && (
        <section className="stamina-panel" aria-label="Fôlego do time">
          <style>{`
            .stamina-panel { margin: 12px 0 4px; padding: 12px 12px 14px; border-radius: 14px; background: rgba(15,22,30,.92); border: 1px solid rgba(255,255,255,.12); }
            .stamina-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
            .stamina-head strong { font-size: 13px; letter-spacing: .14em; }
            .stamina-head b { font-size: 22px; font-variant-numeric: tabular-nums; }
            .stamina-grid { display: grid; gap: 8px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
            @media (min-width: 700px) { .stamina-grid { grid-template-columns: repeat(7, minmax(0, 1fr)); } }
            .stamina-tile { padding: 8px 8px 9px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); min-width: 0; }
            .stamina-tile.tired { border-color: #F5B80088; }
            .stamina-tile.empty { border-color: #ef4444; animation: stamina-pulse 1.1s ease-in-out infinite; }
            @keyframes stamina-pulse { 50% { box-shadow: 0 0 0 3px rgba(239,68,68,.35); } }
            .stamina-tile small { display: block; font-size: 10px; font-weight: 800; letter-spacing: .08em; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .stamina-tile b { display: block; font-size: 22px; line-height: 1.15; font-variant-numeric: tabular-nums; }
            .stamina-bar { height: 8px; border-radius: 5px; background: rgba(255,255,255,.12); overflow: hidden; margin-top: 4px; }
            .stamina-bar i { display: block; height: 100%; border-radius: 5px; transition: width .6s linear, background .6s; }
            @media (prefers-reduced-motion: reduce) { .stamina-tile.empty { animation: none; } }
          `}</style>
          <div className="stamina-head">
            <strong>⚡ FÔLEGO DO TIME</strong>
            <b style={{ color: staminaColor(staminaAvg) }}>{Math.round(staminaAvg)}%</b>
          </div>
          <div className="stamina-grid">
            {staminaList.map(({ player, value }) => (
              <div key={player.id} className={`stamina-tile ${value < 45 ? 'empty' : value < 65 ? 'tired' : ''}`} title={`${player.name}: fôlego ${Math.round(value)}%`}>
                <small>
                  {slotOf(player)} · {player.name.split(' ').slice(-1)[0]}
                  {player.captain ? ' ©' : ''}
                </small>
                <b style={{ color: staminaColor(value) }}>{Math.round(value)}%</b>
                <div className="stamina-bar">
                  <i style={{ width: `${value}%`, background: staminaColor(value) }} />
                </div>
                {value < 45 && <small style={{ color: '#fca5a5', marginTop: 3 }}>EXAUSTO</small>}
                {value >= 45 && value < 65 && <small style={{ color: '#F5B800', marginTop: 3 }}>CANSANDO</small>}
              </div>
            ))}
          </div>
        </section>
      )}

      {multiplayer && <ChatToast messages={chatMessages} myId={userId} />}
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
            {userTeam.map((player) => {
              const stamina = staminaOf(player);
              return (
                <div key={player.id}>
                  <span>{slotOf(player)}</span>
                  <b>
                    {player.name}
                    {player.captain ? <small style={{ color: '#F5B800' }}> ©</small> : null}
                    {player.since ? <small style={{ opacity: 0.6 }}> ↑{player.since}'</small> : null}
                    {staminaOn && (
                      <span
                        title={`Fôlego ${Math.round(stamina)}%`}
                        style={{ display: 'block', height: 7, marginTop: 4, borderRadius: 4, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}
                      >
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${stamina}%`,
                            background: staminaColor(stamina),
                            transition: 'width .6s linear',
                          }}
                        />
                      </span>
                    )}
                  </b>
                  <strong>
                    {player.overall}
                    {staminaOn && <small style={{ display: 'block', fontSize: 11, color: staminaColor(stamina) }}>{Math.round(stamina)}%</small>}
                  </strong>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </main>
  );
}

export function EventIcon({ type }: { type: MatchEvent['type'] }) {
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

export function MiniStat({ label, user, bot, suffix = '' }: { label: string; user: number; bot: number; suffix?: string }) {
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
