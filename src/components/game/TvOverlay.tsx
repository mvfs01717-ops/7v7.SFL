import { useEffect, useRef, useState } from 'react';
import type { MatchEvent, Team } from '@/lib/game/types';

// Transmissão de TV sobre o campo: placar fixo no canto (siglas, cores, relógio) e faixa de lance
// que desliza de baixo quando sai gol, defesa ou finalização, com o nome de quem fez e de quem deu o passe.

const css = `
.tv-bug { position: absolute; left: 10px; top: 10px; z-index: 6; display: flex; align-items: stretch; font-weight: 900; font-size: 15px; border-radius: 6px; overflow: hidden;
  box-shadow: 0 6px 18px rgba(0,0,0,.55); pointer-events: none; background: rgba(8,12,20,.9); border: 1px solid rgba(255,255,255,.18); line-height: 1; color: #fff; }
.tv-bug .tv-t { display: flex; align-items: center; gap: 7px; padding: 7px 9px; letter-spacing: 1px; border-left: 5px solid var(--c); }
.tv-bug .tv-s { display: grid; place-items: center; min-width: 30px; padding: 0 6px; font-size: 20px; font-style: italic; background: rgba(255,255,255,.1); font-variant-numeric: tabular-nums; }
.tv-bug .tv-s.pop { animation: tvPop .9s ease; }
@keyframes tvPop { 0% { background: #F5B800; color: #111; transform: scale(1.35); } 100% { transform: none; } }
.tv-bug .tv-clock { display: grid; place-items: center; padding: 0 10px; background: #F5B800; color: #111; font-size: 14px; font-variant-numeric: tabular-nums; letter-spacing: .5px; }
.tv-bug .tv-clock.pause { background: #ef4444; color: #fff; }
.tv-press { position: absolute; left: 10px; top: 46px; z-index: 6; width: 188px; pointer-events: none; font-weight: 900; }
.tv-press .tv-pl { display: flex; justify-content: space-between; align-items: center; font-size: 9px; letter-spacing: 1.4px; color: rgba(255,255,255,.85); text-shadow: 0 1px 3px rgba(0,0,0,.8); margin-bottom: 3px; }
.tv-press .tv-pt { position: relative; height: 8px; border-radius: 99px; overflow: hidden; background: rgba(8,12,20,.9); border: 1px solid rgba(255,255,255,.2); box-shadow: 0 3px 10px rgba(0,0,0,.5); }
.tv-press .tv-pf { position: absolute; top: 0; bottom: 0; transition: width 1.2s cubic-bezier(.3,.8,.3,1); }
.tv-press .tv-pm { position: absolute; left: 50%; top: -1px; bottom: -1px; width: 2px; background: rgba(255,255,255,.7); }
.tv-l3 { position: absolute; left: 0; right: 0; bottom: 14px; z-index: 6; display: flex; justify-content: center; pointer-events: none; padding: 0 10px; }
.tv-l3 > div { display: flex; align-items: stretch; max-width: 100%; border-radius: 4px 16px 4px 16px; overflow: hidden; color: #fff; box-shadow: 0 10px 28px rgba(0,0,0,.6);
  animation: tvIn .45s cubic-bezier(.2,.9,.2,1) both; border: 1px solid rgba(255,255,255,.2); }
.tv-l3.out > div { animation: tvOut .4s ease-in both; }
@keyframes tvIn { from { transform: translateY(140%); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes tvOut { to { transform: translateY(140%); opacity: 0; } }
.tv-l3 .tv-tag { display: grid; place-items: center; padding: 0 16px; font-size: 20px; font-weight: 900; font-style: italic; letter-spacing: 1px; background: var(--k); color: #111; }
.tv-l3 .tv-txt { padding: 8px 16px 9px; background: rgba(8,12,20,.94); color: #fff; min-width: 0; }
.tv-l3 .tv-name { font-size: 20px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tv-l3 .tv-sub { font-size: 13px; opacity: .8; font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tv-l3 .tv-min { display: grid; place-items: center; padding: 0 13px; font-weight: 900; font-size: 16px; background: rgba(255,255,255,.14); color: #fff; }
@media (max-width: 560px) { .tv-press { width: 150px; top: 38px; } .tv-bug { font-size: 12px; } .tv-bug .tv-s { font-size: 16px; } .tv-l3 .tv-name { font-size: 15px; } .tv-l3 .tv-tag { font-size: 15px; padding: 0 10px; } }
@media (prefers-reduced-motion: reduce) { .tv-l3 > div, .tv-bug .tv-s.pop { animation: none; } }
`;

type Banner = { key: number; tag: string; color: string; name: string; sub: string; minute: number; out: boolean };

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(-1)[0] : name;
}

export function TvOverlay({
  club,
  opponent,
  score,
  minute,
  extra,
  paused,
  events,
  shownGoalIds,
}: {
  club: Team;
  opponent: Team;
  score: { user: number; bot: number };
  minute: number;
  extra: number;
  paused: boolean;
  events: MatchEvent[];
  shownGoalIds: number[];
}) {
  const [banner, setBanner] = useState<Banner | null>(null);
  // Pressão: quem criou mais perigo nos últimos ~10 minutos (gol pesa mais, depois defesa/finalização; o passado vai pesando menos)
  const weight: Record<string, number> = { gol: 4, defesa: 2.2, 'finalização': 2, posse: 0.6 };
  let pu = 1;
  let pb = 1;
  for (const e of events) {
    const w = (weight[e.type] ?? 0) * Math.exp(-Math.max(0, minute - e.minute) / 9);
    if (e.team === 'user') pu += w;
    else pb += w;
  }
  const share = pu / (pu + pb);
  const lead = share > 0.6 ? club.abbreviation : share < 0.4 ? opponent.abbreviation : '';
  // Lances que já existiam ao abrir a tela (ex.: quem entra assistindo) não geram faixa
  const seen = useRef<Set<number> | null>(null);
  const timers = useRef<number[]>([]);
  const [pop, setPop] = useState<{ user: number; bot: number }>({ user: 0, bot: 0 });
  const prevScore = useRef(score);

  useEffect(() => {
    if (score.user !== prevScore.current.user) setPop((p) => ({ ...p, user: p.user + 1 }));
    if (score.bot !== prevScore.current.bot) setPop((p) => ({ ...p, bot: p.bot + 1 }));
    prevScore.current = score;
  }, [score.user, score.bot]);

  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(events.map((e) => e.id));
      return;
    }
    const ready = events.filter((e) => !seen.current!.has(e.id) && (e.type !== 'gol' || shownGoalIds.includes(e.id)) && e.type !== 'posse');
    if (!ready.length) return;
    ready.forEach((e) => seen.current!.add(e.id));
    // O mais importante do lote: gol > defesa > finalização
    const rank = (t: string) => (t === 'gol' ? 3 : t === 'defesa' ? 2 : 1);
    const ev = [...ready].sort((a, b) => rank(b.type) - rank(a.type))[0];
    const goal = ev.type === 'gol';
    const tag = goal ? 'GOL!' : ev.type === 'defesa' ? (/defesaça|voa no canto|ângulo/i.test(ev.text) ? 'DEFESAÇA' : 'DEFESA') : /trave/i.test(ev.text) ? 'NA TRAVE' : 'CHANCE';
    const team = ev.team === 'user' ? club : opponent;
    const name = ev.actor ? ev.actor : team.name;
    const sub = goal && ev.assist ? `Assistência: ${lastName(ev.assist)} · ${team.name}` : team.name;
    // Finalização comum não atropela uma faixa de gol/defesa que ainda está na tela
    if (!goal && ev.type === 'finalização' && banner && !banner.out && banner.tag !== 'CHANCE') return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const key = ev.id;
    setBanner({ key, tag, color: goal ? '#F5B800' : ev.type === 'defesa' ? '#4ade80' : '#e5e7eb', name, sub, minute: ev.minute, out: false });
    timers.current.push(window.setTimeout(() => setBanner((b) => (b && b.key === key ? { ...b, out: true } : b)), goal ? 5200 : 3600));
    timers.current.push(window.setTimeout(() => setBanner((b) => (b && b.key === key ? null : b)), goal ? 5700 : 4100));
  }, [events, shownGoalIds]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  return (
    <>
      <style>{css}</style>
      <div className="tv-bug" aria-label={`${club.name} ${score.user} a ${score.bot} ${opponent.name}`}>
        <div className="tv-t" style={{ ['--c' as string]: club.primary_color }}>{club.abbreviation}</div>
        <div key={`u${pop.user}`} className={`tv-s ${pop.user ? 'pop' : ''}`}>{score.user}</div>
        <div key={`b${pop.bot}`} className={`tv-s ${pop.bot ? 'pop' : ''}`}>{score.bot}</div>
        <div className="tv-t" style={{ ['--c' as string]: opponent.primary_color }}>{opponent.abbreviation}</div>
        <div className={`tv-clock ${paused ? 'pause' : ''}`}>{paused ? 'INT' : `${minute}${extra > 0 ? `+${extra}` : ''}'`}</div>
      </div>
      <div className="tv-press" aria-label={`Pressão: ${Math.round(share * 100)}% ${club.abbreviation}`}>
        <div className="tv-pl">
          <span>PRESSÃO</span>
          <span>{lead ? `${lead} DOMINA` : 'EQUILIBRADO'}</span>
        </div>
        <div className="tv-pt">
          <div className="tv-pf" style={{ left: 0, width: `${(share * 100).toFixed(1)}%`, background: club.primary_color }} />
          <div className="tv-pf" style={{ right: 0, width: `${((1 - share) * 100).toFixed(1)}%`, background: opponent.primary_color }} />
          <div className="tv-pm" />
        </div>
      </div>
      {banner && (
        <div className={`tv-l3 ${banner.out ? 'out' : ''}`} key={banner.key} style={{ ['--k' as string]: banner.color }}>
          <div>
            <div className="tv-tag">{banner.tag}</div>
            <div className="tv-txt">
              <div className="tv-name">{banner.name}</div>
              <div className="tv-sub">{banner.sub}</div>
            </div>
            <div className="tv-min">{banner.minute}'</div>
          </div>
        </div>
      )}
    </>
  );
}
