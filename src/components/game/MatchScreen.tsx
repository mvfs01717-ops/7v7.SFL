import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleUserRound, Goal, RefreshCw, Shield, SkipForward, Zap } from 'lucide-react';
import MatchPitch, { type LiveSnap } from '@/components/MatchPitch';
import { StadiumFx } from '@/components/game/StadiumFx';
import { LiveCam, LIVE_MODES, type LiveMode } from '@/components/game/LiveCam';
import type { ClipData } from '@/components/game/ReplayPlayer';
import type { MatchMapData } from '@/lib/game/matchMap';
import { useCrowd } from '@/components/game/useCrowd';
import { useWatchers } from '@/lib/friends';
import PenaltyShootout, { type Shootout } from '@/components/PenaltyShootout';
import { average, slotOf } from '@/lib/game/helpers';
import { type MatchEvent, type MatchStats, type Player, type Position, type Team } from '@/lib/game/types';
import { SUBS_WINDOW_SEC, effortLoss, setWetFrom, staminaAt, type ChatMessage, type Tactic } from '@/lib/multiplayer';
import { TeamMark } from '@/components/game/Card';
import { ChatBox, ChatToast } from '@/components/game/Chat';
import { pickKits } from '@/lib/game/kit';
import { CoachPanel } from '@/components/game/CoachPanel';
import type { Shout } from '@/lib/game/coach';
import { HalftimeBreak, PenaltyPrep, SetPiecePrep, SubstitutionPanel, staminaColor, type SetPieceInfo } from '@/components/game/Halftime';
import { SET_TITLE, type SetKind, type SetOption } from '@/lib/game/setpiece';
import { ambienceLabel, pickAmbience, weatherAt, wetFromOf, type Ambience } from '@/lib/game/ambience';
import { stadiumFor } from '@/lib/game/stadium';
import { TvOverlay } from '@/components/game/TvOverlay';
import { stadiumCss } from '@/lib/game/stadiumCss';

const matchCss = `
.mt .match-header { background: linear-gradient(160deg, rgba(255,255,255,.1), rgba(255,255,255,.02)); border: 1px solid rgba(245,184,0,.3); border-radius: 6px 26px 6px 26px;
  backdrop-filter: blur(12px); box-shadow: 0 20px 50px rgba(0,0,0,.5); padding: 14px 22px 12px; margin-bottom: 14px; overflow: hidden; }
.mt .match-header::before { content: ''; position: absolute; left: 0; right: 26px; top: 0; height: 2px; background: linear-gradient(90deg, #F5B800, transparent); }
.mt .match-status { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; border-radius: 999px; font-size: 11px; letter-spacing: 2.5px; color: #fff; background: rgba(239,68,68,.9); box-shadow: 0 0 18px rgba(239,68,68,.5); }
.mt .live-dot { background: #fff; box-shadow: 0 0 0 0 rgba(255,255,255,.8); margin: 0; animation: mtPing 1.4s infinite; }
@keyframes mtPing { 70% { box-shadow: 0 0 0 7px rgba(255,255,255,0); } 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); } }
.mt .scoreboard { gap: 18px; margin: 12px 0 6px; }
.mt .scoreboard strong { font-family: inherit; font-style: italic; font-weight: 900; font-size: 64px; line-height: 1; min-width: 44px; text-align: center; text-shadow: 0 0 24px rgba(245,184,0,.35); }
.mt .scoreboard > span { color: #F5B800; font-size: 28px; font-weight: 900; }
.mt .scoreboard .team-mark span { font-weight: 800; letter-spacing: .5px; }
.mt .match-meta { letter-spacing: 3px; font-size: 10px; opacity: .65; }
.mt .match-meta .mt-eye { opacity: 1; color: #F5B800; font-weight: 800; }
.mt .match-meta .mt-spec { opacity: 1; color: #fff; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: rgba(245,184,0,.22); border: 1px solid rgba(245,184,0,.6); }
.mt .skip-button { border-radius: 999px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; padding: 8px 14px; font-weight: 800; letter-spacing: .5px; }
.mt .skip-button:hover { border-color: #F5B800; color: #F5B800; }
.mt .match-feed, .mt .match-side { border-radius: 6px 22px 6px 22px; border: 1px solid rgba(245,184,0,.2); position: relative;
  background: linear-gradient(160deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); backdrop-filter: blur(10px); box-shadow: 0 20px 50px rgba(0,0,0,.45); }
.mt .match-feed::before { content: ''; position: absolute; left: 0; right: 22px; top: 0; height: 2px; background: linear-gradient(90deg, #F5B800, transparent); }
.mt .section-title h2 { font-style: italic; }
.mt .match-columns { align-items: start; }
.mt .feed-live { white-space: nowrap; flex: none; color: #fff; background: rgba(239,68,68,.9); padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; }
.mt .event-row.goal-event { background: linear-gradient(90deg, rgba(245,184,0,.18), transparent); box-shadow: inset 3px 0 0 #F5B800; }
.mt .event-row p { font-size: 13px; color: #e1e5ea; }
.mt .mini-stat .stat-bar { height: 8px; border-radius: 8px; overflow: hidden; }
.mt .mini-stat .stat-bar i { background: linear-gradient(90deg, #b98500, #ffd24a); box-shadow: 0 0 10px rgba(245,184,0,.5); }
.mt .stamina-panel { border-radius: 6px 22px 6px 22px !important; border-color: rgba(245,184,0,.25) !important; background: linear-gradient(160deg, rgba(255,255,255,.08), rgba(255,255,255,.02)) !important; backdrop-filter: blur(10px); }
@media (max-width: 560px) { .mt .scoreboard strong { font-size: 48px; } .mt .scoreboard { gap: 8px; } }
`;

// Tela de celular: botões de câmera e do técnico saem de cima do campo e ficam numa barra logo abaixo
function useNarrow(max = 560) {
  const query = `(max-width: ${max}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

export function MatchScreen({
  club: clubProp,
  opponent: opponentProp,
  userTeam,
  botTeam,
  minute,
  ambience: ambienceProp,
  extra,
  pause,
  setPiece,
  rivalNote,
  onSetPiece,
  coach,
  restartKey,
  penaltyPrep,
  score,
  events,
  shownGoalIds,
  onGoal,
  onClip,
  mapRef,
  onSkip,
  stats,
  penaltyPhase,
  onShootoutFinish,
  canSkip,
  bench,
  workRef,
  endHalfRef,
  deadBallRef,
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
  pause: 'halftime' | 'break' | 'subs' | 'return' | 'setpiece' | null;
  setPiece?: { kind: SetKind; minute: number; floating?: boolean } | null;
  rivalNote?: string;
  onSetPiece?: (option: SetOption) => void;
  coach?: { delayNote?: number; shoutsLeft: number; activeUntil: number; activeShout: Shout | null; onTactic: (t: Tactic) => void; onShout: (s: Shout) => void };
  restartKey: number;
  penaltyPrep: boolean;
  score: { user: number; bot: number };
  events: MatchEvent[];
  shownGoalIds: number[];
  onGoal: (id: number, side: 'user' | 'bot') => void;
  onClip?: (eventId: number, clip: ClipData) => void;
  mapRef?: { current: MatchMapData | null };
  onSkip: () => void;
  stats: MatchStats;
  penaltyPhase: boolean;
  onShootoutFinish: (result: Shootout) => void;
  canSkip: boolean;
  bench: Player[];
  workRef: { current: { effort: Record<string, number>; slow: Record<string, number>; stamina?: Record<string, number> } };
  endHalfRef: { current: boolean };
  deadBallRef: { current: boolean };
  tactic: Tactic;
  staminaOn: boolean;
  subsLog: { user: string[]; bot: string[] };
  onSubs: (choices: { slot: Position; inId: string }[]) => void;
  multiplayer: boolean;
  net?: { roomId: string; role: 'host' | 'guest' | 'spectator' };
  ambience?: Ambience;
  onAbort?: () => void;
  userId: string | null;
  chatMessages: ChatMessage[];
  onSendChat: (text: string) => boolean;
}) {
  const watchers = useWatchers(net?.roomId, net?.role);
  // Horário e clima da partida (no multiplayer vêm do código da sala, então todo mundo vê o mesmo)
  // Quem joga em casa: no multiplayer é o anfitrião (o convidado vê o adversário como dono da casa); contra o bot é você
  const homeSide: 'user' | 'bot' = net?.role === 'guest' ? 'bot' : 'user';
  // Camisa reserva: se as cores se parecem demais, o visitante joga com outra camisa (só nesta tela de jogo)
  const kits = useMemo(() => pickKits(clubProp, opponentProp, homeSide), [clubProp, opponentProp, homeSide]);
  const club = kits.club;
  const opponent = kits.opponent;
  const [kitToast, setKitToast] = useState(!!kits.away);
  useEffect(() => {
    if (!kitToast) return undefined;
    const id = window.setTimeout(() => setKitToast(false), 5000);
    return () => window.clearTimeout(id);
  }, [kitToast]);
  const homeTeam = homeSide === 'user' ? club : opponent;
  const baseAmbience = useMemo(() => ambienceProp ?? pickAmbience(net?.roomId), [ambienceProp, net?.roomId]);
  // O gramado molhado muda o cansaço (igual nos dois lados): informa o minuto em que a chuva começa
  setWetFrom(wetFromOf(baseAmbience));
  const rainNow = weatherAt(baseAmbience, minute);
  const ambience = useMemo<Ambience>(() => ({ ...baseAmbience, weather: rainNow }), [baseAmbience, rainNow]);
  const [rainToast, setRainToast] = useState(false);
  const wasRain = useRef(rainNow);
  useEffect(() => {
    if (!wasRain.current && rainNow === 'rain') {
      setRainToast(true);
      const id = window.setTimeout(() => setRainToast(false), 5000);
      wasRain.current = true;
      return () => window.clearTimeout(id);
    }
    wasRain.current = rainNow === 'rain';
    return undefined;
  }, [rainNow]);
  // Câmeras ao vivo (3D): a escolha fica salva no aparelho
  const liveRef = useRef<LiveSnap | null>(null);
  const narrow = useNarrow();
  const [feedCaption, setFeedCaption] = useState('Bola rolando');
  const spInfo = useMemo<SetPieceInfo | null>(() => {
    if (!setPiece) return null;
    const taker = [...userTeam.filter((p) => ['CM', 'LF', 'RF'].includes(slotOf(p)))].sort((a, b) => b.overall - a.overall)[0];
    return {
      taker: taker?.name,
      takerOvr: taker?.overall ?? 75,
      atk: average(userTeam.filter((p) => ['LF', 'RF', 'CF'].includes(slotOf(p)))),
      def: average(botTeam.filter((p) => ['LB', 'RB', 'GK'].includes(slotOf(p)))),
      odds: !multiplayer,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPiece?.minute, setPiece?.kind, multiplayer]);
  const [cam, setCam] = useState<LiveMode>(() => {
    try {
      const v = localStorage.getItem('7v7-cam') as LiveMode | null;
      return v && LIVE_MODES.some((m) => m.key === v) ? v : 'tatica';
    } catch {
      return 'tatica';
    }
  });
  const pitchWrapRef = useRef<HTMLDivElement | null>(null);
  const pickCam = (m: LiveMode) => {
    setCam(m);
    try {
      localStorage.setItem('7v7-cam', m);
    } catch {
      /* sem armazenamento */
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const m = LIVE_MODES[Number(e.key) - 1];
      if (m) pickCam(m.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const crowd = useCrowd({ club, opponent, events, shownGoalIds, score, minute, pause, active: !penaltyPhase && !penaltyPrep, squads: { user: userTeam, bot: botTeam } });
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
    <main className="match-page mt stadium-bg">
      <style>{stadiumCss}</style>
      <style>{matchCss}</style>
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
          {net?.role === 'spectator' ? <span className="mt-spec">👁 VOCÊ ESTÁ ASSISTINDO</span> : <span>SIMULAÇÃO 7V7</span>}
          <span>90 MINUTOS</span>
          <span>{stadiumFor(homeTeam).name.toUpperCase()}</span>
          <span>{ambienceLabel(baseAmbience, minute).toUpperCase()}</span>
          {watchers > 0 && <span className="mt-eye">👁 {watchers} ASSISTINDO</span>}
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
        <>
        <div style={{ position: 'relative', minHeight: pause === 'subs' ? 620 : undefined }}>
          <div ref={pitchWrapRef} style={{ visibility: cam === 'tatica' ? 'visible' : 'hidden' }}>
          <MatchPitch
            wet={Math.min(1, 0.3 + Math.max(0, minute - wetFromOf(baseAmbience)) / 65)}
            grassFade={Math.min(1, Math.max(0, (minute - 35) / 55)) * 0.7}
            liveRef={liveRef}
            home={homeSide}
            ambience={ambience}
            crowd={crowd}
            onClip={onClip}
            mapRef={mapRef}
            club={club}
            opponent={opponent}
            userTeam={userTeam}
            botTeam={botTeam}
            events={events}
            onGoal={onGoal}
            restartKey={restartKey}
            workRef={staminaOn ? workRef : undefined}
            endHalfRef={endHalfRef}
            deadBallRef={deadBallRef}
            hold={pause === 'setpiece'}
            hideOverlays
            onCaption={setFeedCaption}
          />
          </div>
          {cam === 'tatica' && <StadiumFx liveRef={liveRef} club={club} opponent={opponent} home={homeSide} ambience={ambience} burst={crowd.burst} score={score} wrapRef={pitchWrapRef} />}
          {cam !== 'tatica' && <LiveCam grassFade={Math.min(1, Math.max(0, (minute - 35) / 55)) * 0.7} liveRef={liveRef} mode={cam} club={club} opponent={opponent} home={homeSide} ambience={ambience} burst={crowd.burst} score={score} />}
          {!narrow && (
            <div style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 6, display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'rgba(8,12,20,.8)' }}>
            {LIVE_MODES.map((m, i) => (
              <button
                key={m.key}
                onClick={() => pickCam(m.key)}
                title={`Tecla ${i + 1}`}
                style={{ border: 0, cursor: 'pointer', padding: '4px 9px', borderRadius: 999, font: '800 10px Inter, sans-serif', background: cam === m.key ? '#F5B800' : 'transparent', color: cam === m.key ? '#111' : '#fff' }}
              >
                {m.label}
              </button>
            ))}
            </div>
          )}
          {kitToast && kits.away && (
            <div role="status" style={{ position: 'absolute', left: '50%', top: 40, transform: 'translateX(-50%)', zIndex: 7, padding: '6px 14px', borderRadius: 999, background: 'rgba(8,12,20,.92)', border: '1px solid #F5B800', color: '#fff', font: '900 11px Inter, sans-serif', letterSpacing: '.5px' }}>
              👕 {(kits.away === 'user' ? club : opponent).abbreviation} JOGA DE CAMISA RESERVA (CORES PARECIDAS)
            </div>
          )}
          {rainToast && (
            <div role="status" style={{ position: 'absolute', left: '50%', top: 70, transform: 'translateX(-50%)', zIndex: 7, padding: '7px 14px', borderRadius: 999, background: 'rgba(10,22,40,.92)', border: '1px solid #7fb8e8', color: '#fff', font: '900 12px Inter, sans-serif', letterSpacing: '.5px' }}>
              🌧 COMEÇOU A CHOVER · BOLA PESADA E TIME CANSA MAIS
            </div>
          )}
          <TvOverlay club={club} opponent={opponent} score={score} minute={minute} extra={extra} paused={!!pause} events={events} shownGoalIds={shownGoalIds} />
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
          {!narrow && coach && !pause && !penaltyPhase && !penaltyPrep && minute < 90 && <CoachPanel tactic={tactic} minute={minute} shoutsLeft={coach.shoutsLeft} activeUntil={coach.activeUntil} activeShout={coach.activeShout} onTactic={coach.onTactic} onShout={coach.onShout} delayNote={coach.delayNote} />}
          {(pause === 'setpiece' || setPiece?.floating) && setPiece && onSetPiece && <SetPiecePrep key={setPiece.minute} kind={setPiece.kind} minute={setPiece.minute} club={club} floating={!!setPiece.floating} onPick={onSetPiece} info={spInfo} />}
          {rivalNote && (
            <div role="status" style={{ position: 'absolute', left: 8, top: 70, zIndex: 7, padding: '6px 12px', borderRadius: 10, background: 'rgba(8,12,20,.92)', border: '1px solid #ff6a4f', color: '#fff', font: '800 11px Inter, sans-serif' }}>
              {rivalNote}
            </div>
          )}
          {penaltyPrep && <PenaltyPrep club={club} opponent={opponent} score={score} />}
        </div>
        <div className="ms-feed" aria-label="Narração do lance">
          <style>{`
            .ms-feed { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; margin: 6px 0 0; min-height: 34px; padding: 6px 10px; border-radius: 10px; background: rgba(10,16,26,.8); border-left: 3px solid #F5B800; color: #fff; font: 700 12.5px/1.3 Inter, sans-serif; }
            .ms-feed .ms-cap { flex: 1 1 220px; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .ms-feed .ms-chips { display: flex; gap: 6px; flex: 0 1 auto; flex-wrap: wrap; }
            .ms-feed .ms-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 3px 9px; border-radius: 999px; font: 800 11px/1.25 Inter, sans-serif; background: rgba(255,255,255,.1); color: #f4f4f0; animation: msChip .3s ease-out both; }
            .ms-feed .ms-chip i { width: 7px; height: 7px; border-radius: 50%; flex: none; }
            .ms-feed .ms-chip.hype { background: #F5B800; color: #1a1200; }
            .ms-feed .ms-chip.sad { color: #cbd5e1; font-style: italic; }
            @keyframes msChip { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
            @media (max-width: 560px) { .ms-feed { min-height: 58px; align-content: center; font-size: 12px; } .ms-feed .ms-chip { font-size: 10.5px; } }
            @media (prefers-reduced-motion: reduce) { .ms-feed .ms-chip { animation: none; } }
          `}</style>
          <span className="ms-cap">{pause === 'setpiece' && setPiece ? `${SET_TITLE[setPiece.kind]} · escolha a jogada` : feedCaption}</span>
          {(crowd.bubbles.user || crowd.bubbles.bot) && (
            <span className="ms-chips">
              {crowd.bubbles.user && (
                <span key={crowd.bubbles.user.key} className={`ms-chip ${crowd.bubbles.user.mood}`}>
                  <i style={{ background: club.primary_color }} />
                  {crowd.bubbles.user.text}
                </span>
              )}
              {crowd.bubbles.bot && (
                <span key={crowd.bubbles.bot.key} className={`ms-chip ${crowd.bubbles.bot.mood}`}>
                  <i style={{ background: opponent.primary_color }} />
                  {crowd.bubbles.bot.text}
                </span>
              )}
            </span>
          )}
        </div>
        {narrow && (
          <div className="ms-bar" role="toolbar" aria-label="Câmera e técnico">
            <style>{`
              .ms-bar { display: grid; gap: 8px; margin: 8px 0 0; }
              .ms-cams { display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 4px; scrollbar-width: none; }
              .ms-cams::-webkit-scrollbar { display: none; }
              .ms-cams button { flex: none; border: 1px solid rgba(255,255,255,.18); cursor: pointer; padding: 9px 14px; border-radius: 999px; font: 800 12px Inter, sans-serif; background: rgba(8,12,20,.85); color: #fff; }
              .ms-cams button.on { background: #F5B800; color: #111; border-color: #F5B800; }
            `}</style>
            <div className="ms-cams">
              {LIVE_MODES.map((m) => (
                <button key={m.key} className={cam === m.key ? 'on' : ''} onClick={() => pickCam(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
            {coach && !pause && !penaltyPhase && !penaltyPrep && minute < 90 && <CoachPanel inline tactic={tactic} minute={minute} shoutsLeft={coach.shoutsLeft} activeUntil={coach.activeUntil} activeShout={coach.activeShout} onTactic={coach.onTactic} onShout={coach.onShout} delayNote={coach.delayNote} />}
          </div>
        )}
        </>
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
