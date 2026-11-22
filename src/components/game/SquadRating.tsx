import { useEffect, useRef, useState } from 'react';
import { type BenchSlot, BENCH_SLOTS, type Player, type Position, type Team } from '@/lib/game/types';
import { Badge } from '@/components/game/Card';
import { TacticalSettings } from '@/components/game/TacticalSettings';
import { deriveTactic, loadTactics, presetName } from '@/lib/tacticsProfile';
import { TACTIC_INFO } from '@/lib/multiplayer';
import { ROLES_EVENT, loadRoles, roleOf, roleTag } from '@/lib/playerRoles';

// Painel de avaliação do elenco (inspirado na tela de gestão do Ultimate Team).
// Tudo vem dos jogadores já escolhidos no draft: nada é fixo ou inventado.
// Entrosamento é só visual (não muda o resultado da partida): até 3 pontos por jogador.

export const SQUAD_LINKS: [Position, Position][] = [
  ['GK', 'LB'], ['GK', 'RB'], ['LB', 'CM'], ['RB', 'CM'], ['CM', 'LF'], ['CM', 'RF'], ['CM', 'CF'], ['LF', 'CF'], ['RF', 'CF'],
];
const SPOTS: Record<Position, { x: number; y: number }> = {
  GK: { x: 50, y: 83 }, LB: { x: 20, y: 65 }, RB: { x: 80, y: 65 }, CM: { x: 50, y: 49 }, LF: { x: 20, y: 30 }, RF: { x: 80, y: 30 }, CF: { x: 50, y: 14 },
};
const fits = (player: Player, position: Position) =>
  player.primary_position === position || (player.alternate_positions ?? []).includes(position);

export function squadStats(club: Team, positionList: Position[], selected: Partial<Record<Position, Player>>) {
  const rows = positionList.map((position) => {
    const player = selected[position];
    if (!player) return { position, player: undefined, rating: 0, natural: false, sameClub: false, linked: 0, chem: 0 };
    const natural = fits(player, position);
    const sameClub = player.team_id === club.id;
    const linked = SQUAD_LINKS.filter(([a, b]) => (a === position || b === position) && selected[a] && selected[b] && selected[a]!.team_id === selected[b]!.team_id).length;
    const chem = (natural ? 1 : 0) + (sameClub ? 1 : 0) + (linked > 0 ? 1 : 0);
    return { position, player, rating: player.overall - (natural ? 0 : 5), natural, sameClub, linked, chem };
  });
  const filled = rows.filter((row) => row.player);
  const avg = filled.length ? filled.reduce((sum, row) => sum + row.rating, 0) / filled.length : 0;
  // 60 ou menos = 1 estrela; 90 ou mais = 5 estrelas (meia estrela de passo)
  const stars = filled.length ? Math.round(Math.min(5, Math.max(1, 1 + (avg - 60) / 7.5)) * 2) / 2 : 0;
  const chem = rows.reduce((sum, row) => sum + row.chem, 0);
  const links = SQUAD_LINKS.filter(([a, b]) => selected[a] && selected[b] && selected[a]!.team_id === selected[b]!.team_id);
  return { rows, avg: Math.round(avg), stars, chem, chemMax: positionList.length * 3, links, count: filled.length };
}

function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 600);
      const next = Math.round(start + (value - start) * (1 - Math.pow(1 - k, 3)));
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

const STAR = 'M12 1.8l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6 5.7 21.2l1.5-7.1L1.8 9.2 9 8.4z';
function Stars({ value }: { value: number }) {
  return (
    <div className="sq-stars" role="img" aria-label={`${value} de 5 estrelas`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, value - index));
        return (
          <svg key={index} viewBox="0 0 24 24" style={{ '--d': `${index * 70}ms` } as React.CSSProperties} className={fill > 0 ? 'on' : ''}>
            <defs>
              <linearGradient id={`sqs${index}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff2b0" /><stop offset=".55" stopColor="#f5b800" /><stop offset="1" stopColor="#c98a00" />
              </linearGradient>
              <clipPath id={`sqc${index}`}><rect x="0" y="0" width={24 * fill} height="24" /></clipPath>
            </defs>
            <path d={STAR} fill="rgba(255,255,255,.14)" />
            <path d={STAR} fill={`url(#sqs${index})`} clipPath={`url(#sqc${index})`} />
          </svg>
        );
      })}
    </div>
  );
}

const Flag = () => (
  <svg className="sq-flag" viewBox="0 0 20 14" aria-label="Brasil"><title>Brasil</title>
    <rect width="20" height="14" fill="#1ea64a" /><path d="M10 1.6l7.6 5.4L10 12.4 2.4 7z" fill="#f7d618" /><circle cx="10" cy="7" r="2.8" fill="#1d3f9b" />
  </svg>
);

export function formationLabel(positionList: Position[]) {
  const n = (list: Position[]) => positionList.filter((p) => list.includes(p)).length;
  return [n(['LB', 'RB']), n(['CM']), n(['LF', 'RF', 'CF'])].join('-').replace(/^/, `${n(['GK'])}-`);
}

export function SquadLinksLayer({ links }: { links: [Position, Position][] }) {
  return (
    <svg className="sq-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {links.map(([a, b]) => (
        <line key={a + b} x1={SPOTS[a].x} y1={SPOTS[a].y} x2={SPOTS[b].x} y2={SPOTS[b].y} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function useRoles() {
  const [saved, setSaved] = useState(() => loadRoles());
  useEffect(() => {
    const refresh = () => setSaved(loadRoles());
    window.addEventListener(ROLES_EVENT, refresh);
    return () => window.removeEventListener(ROLES_EVENT, refresh);
  }, []);
  return saved;
}

export function SquadRatingPanel({ club, stats, squad }: { club: Team; stats: ReturnType<typeof squadStats>; squad?: Partial<Record<Position, Player>> }) {
  const avg = useCountUp(stats.avg);
  const [tacticsOpen, setTacticsOpen] = useState(false);
  const tacticStore = loadTactics();
  const mainPreset = tacticStore.presets[tacticStore.main] ?? tacticStore.presets[0]!;
  const pct = stats.chemMax ? Math.round((stats.chem / stats.chemMax) * 100) : 0;
  const level = pct >= 75 ? 'Excelente' : pct >= 50 ? 'Boa' : pct >= 25 ? 'Em formação' : 'Baixa';
  const groups = new Map<string, { team?: Team; n: number }>();
  Object.values(squad ?? {}).forEach((p) => {
    if (!p) return;
    const g = groups.get(p.team_id) ?? { team: p.team ?? (p.team_id === club.id ? club : undefined), n: 0 };
    g.n += 1;
    groups.set(p.team_id, g);
  });
  const clubs = [...groups.values()].sort((x, y) => y.n - x.n);
  const pips = (n: number) => <span className="fc-pips">{[0, 1, 2].map((i) => <u key={i} className={i < n ? 'on' : ''} />)}</span>;
  return (
    <section className="sq-rate fc-rate" aria-label="Avaliação do elenco">
      <div className="fc-head">
        <Badge team={club} />
        <div className="fc-info">
          <b className="fc-name">{club.name}</b>
          <Stars value={stats.stars} />
          <div className="fc-rating">Overall <strong key={stats.avg}>{stats.count ? avg : '--'}</strong></div>
        </div>
      </div>
      <div className="fc-mgmt">Gestão do elenco</div>
      <div className="fc-chem" title={level}>Entrosamento total <b>{stats.chem}/{stats.chemMax}</b></div>
      <div className="fc-list" role="list" aria-label="Nacionalidades e clubes">
        <div className="fc-row" role="listitem"><Flag />{pips(Math.min(3, stats.count))}<i className="fc-dia" /></div>
        {clubs.map((g, i) => (
          <div className="fc-row" role="listitem" key={g.team?.id ?? i} title={g.team?.name}>
            {g.team ? <span className="fc-mini"><Badge team={g.team} /></span> : <span className="fc-mini" />}
            {pips(Math.min(3, g.n))}<i className="fc-dia" />
          </div>
        ))}
      </div>
      <button type="button" className="fc-tactic" onClick={() => setTacticsOpen(true)} aria-label="Configurações táticas">
        <span>⚙ Táticas</span>
        <b>{presetName(tacticStore.main)} · {TACTIC_INFO[deriveTactic(mainPreset)].label}</b>
      </button>
      {tacticsOpen && <TacticalSettings onClose={() => setTacticsOpen(false)} squad={squad} />}
    </section>
  );
}

export function SquadListPanel({ stats, bench, withBench }: { stats: ReturnType<typeof squadStats>; bench: Partial<Record<BenchSlot, Player>>; withBench: boolean }) {
  const saved = useRoles();
  return (
    <section className="sq-panel sq-list" aria-label="Jogadores do elenco">
      <div className="sq-list-h"><b>TITULARES</b><span>{stats.count}/{stats.rows.length}</span></div>
      {stats.rows.map((row) => (
        <div key={row.position} className={`sq-row ${row.player ? '' : 'empty'}`} >
          <i className="sq-pos">{row.position}</i>
          {row.player ? (
            <>
              <span className="sq-name">{row.player.name}{!row.natural && <em title="Fora da posição: −5">fora</em>}<small className="sq-role">{roleOf(row.position, row.player, saved).role.icon} {roleOf(row.position, row.player, saved).role.name}{(() => { const tag = roleTag(row.player); return tag ? <span className="sq-mastery"> · {tag.name} <em>{tag.sym}</em></span> : null; })()}</small></span>
              <Flag />
              <b className="sq-ovr-s">{row.player.overall}</b>
              <span className="sq-pips" title={`Entrosamento ${row.chem}/3`}>{[0, 1, 2].map((n) => <u key={n} className={n < row.chem ? 'on' : ''} />)}</span>
            </>
          ) : (
            <span className="sq-name">Vago</span>
          )}
        </div>
      ))}
      {withBench && (
        <>
          <div className="sq-list-h sq-bench-h"><b>BANCO</b><span>{BENCH_SLOTS.filter((slot) => bench[slot.id]).length}/{BENCH_SLOTS.length}</span></div>
          {BENCH_SLOTS.map((slot) => {
            const player = bench[slot.id];
            return (
              <div key={slot.id} className={`sq-row ${player ? '' : 'empty'}`}>
                <i className="sq-pos">RES</i>
                <span className="sq-name">{player ? player.name : 'Vago'}</span>
                {player && <><Flag /><b className="sq-ovr-s">{player.overall}</b></>}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

export const squadRatingCss = `
.sq-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.sq-center { min-width: 0; }
.sq-formation { display: flex; justify-content: center; align-items: baseline; gap: 10px; margin: 0 0 10px; }
.sq-formation small { font-size: 10px; letter-spacing: 3px; opacity: .65; }
.sq-formation b { font-family: 'Bebas Neue', Inter, sans-serif; font-size: 34px; line-height: 1; letter-spacing: 3px; color: #fff; text-shadow: 0 0 18px rgba(245,184,0,.45); }
.sq-panel { text-align: left; color: #fff; border-radius: 14px; padding: 14px; background: linear-gradient(160deg, rgba(14,30,66,.92), rgba(7,14,34,.94)); border: 1px solid rgba(245,184,0,.28); box-shadow: 0 10px 30px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08); backdrop-filter: blur(6px); }
.fc-rate { text-align: left; color: #fff; min-width: 0; }
.fc-head { display: flex; align-items: center; gap: 10px; }
.fc-head .club-badge { flex: none; width: 46px; height: 46px; font-size: 16px; }
.fc-info { min-width: 0; }
.fc-name { display: block; font-size: 17px; line-height: 1.1; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fc-info .sq-stars { gap: 2px; margin: 3px 0; }
.fc-info .sq-stars svg { width: 15px; height: 15px; }
.fc-rating { font-size: 14px; opacity: .92; }
.fc-rating strong { font-size: 18px; margin-left: 6px; color: #F5B800; font-weight: 800; animation: sq-pop .5s cubic-bezier(.2,.9,.3,1.3); display: inline-block; }
.fc-mgmt { margin: 10px 0 2px; padding-left: 2px; font-size: 14px; font-weight: 600; opacity: .95; }
.fc-chem { font-size: 12px; opacity: .9; padding-left: 2px; }
.fc-chem b { margin-left: 8px; font-size: 13px; }
.fc-list { margin-top: 10px; border-radius: 10px; background: rgba(7,14,34,.72); border: 1px solid rgba(255,255,255,.1); max-height: 232px; overflow-y: auto; scrollbar-width: thin; }
.fc-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.07); }
.fc-row:last-child { border-bottom: 0; }
.fc-row .sq-flag { width: 22px; height: 15px; }
.fc-mini { flex: none; width: 22px; height: 22px; display: grid; place-items: center; }
.fc-mini .club-badge { width: 22px; height: 22px; font-size: 7px; border-width: 1px; }
.fc-pips { display: flex; gap: 3px; flex: 1; }
.fc-pips u { width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 8px solid rgba(255,255,255,.2); }
.fc-pips u.on { border-bottom-color: #3b8bff; filter: drop-shadow(0 0 3px rgba(59,139,255,.8)); }
.fc-dia { flex: none; width: 8px; height: 8px; transform: rotate(45deg); background: #3b8bff; box-shadow: 0 0 5px rgba(59,139,255,.8); }
.fc-tactic { width: 100%; margin-top: 10px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 7px 10px; border-radius: 10px; cursor: pointer; color: #fff; border: 1px solid rgba(245,184,0,.4); background: rgba(245,184,0,.08); font-size: 11px; font-weight: 800; }
.fc-tactic:hover { background: rgba(245,184,0,.18); }
.fc-tactic span { color: #F5B800; letter-spacing: 1px; text-transform: uppercase; }
.fc-tactic b { font-size: 10px; font-weight: 600; opacity: .85; text-align: left; }
.sq-team { display: flex; align-items: center; gap: 12px; }
.sq-team .club-badge { width: 46px; height: 46px; font-size: 17px; }
.sq-team small { display: block; font-size: 9px; letter-spacing: 2.5px; color: #F5B800; font-weight: 800; }
.sq-team b { display: block; font-size: 18px; line-height: 1.15; }
.sq-score { display: flex; align-items: center; gap: 16px; margin: 14px 0 12px; padding: 12px 0; border-top: 1px solid rgba(255,255,255,.1); border-bottom: 1px solid rgba(255,255,255,.1); }
.sq-ovr strong { display: block; font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 64px; line-height: .85; color: #F5B800; text-shadow: 0 0 22px rgba(245,184,0,.5); animation: sq-pop .5s cubic-bezier(.2,.9,.3,1.3); }
.sq-ovr span { display: block; margin-top: 4px; font-size: 9px; letter-spacing: 1.5px; opacity: .7; text-transform: uppercase; }
.sq-starbox { min-width: 0; }
.sq-starbox > span { display: block; margin-top: 6px; font-size: 11px; opacity: .8; }
.sq-stars { display: flex; gap: 3px; }
.sq-stars svg { width: 26px; height: 26px; overflow: visible; }
.sq-stars svg.on { filter: drop-shadow(0 0 5px rgba(245,184,0,.75)); animation: sq-star .6s var(--d, 0ms) cubic-bezier(.2,.9,.3,1.4) both; }
.sq-chem-h { display: flex; justify-content: space-between; align-items: baseline; font-size: 10px; letter-spacing: 2px; font-weight: 800; opacity: .9; }
.sq-chem-h b { font-size: 12px; letter-spacing: 0; }
.sq-chem-h em { font-style: normal; font-size: 20px; color: #F5B800; font-family: 'Bebas Neue', Inter, sans-serif; margin-right: 1px; }
.sq-bar { height: 10px; margin: 6px 0; border-radius: 99px; background: rgba(255,255,255,.1); overflow: hidden; }
.sq-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #c98a00, #F5B800 60%, #fff2b0); box-shadow: 0 0 12px rgba(245,184,0,.6); transition: width .7s cubic-bezier(.2,.8,.2,1); }
.sq-chem-f { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; opacity: .75; }
.sq-tactic { width: 100%; margin-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; cursor: pointer; color: #fff; border: 1px solid rgba(245,184,0,.4); background: rgba(245,184,0,.08); font-size: 11px; letter-spacing: 1.5px; font-weight: 800; transition: all .2s; }
.sq-tactic:hover { background: rgba(245,184,0,.18); }
.sq-tactic span { color: #F5B800; }
.sq-tactic b { font-size: 11px; letter-spacing: 0; text-align: right; }
.sq-list-h { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 2.5px; color: #F5B800; margin-bottom: 8px; }
.sq-list-h span { opacity: .75; letter-spacing: 1px; color: #fff; }
.sq-bench-h { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.1); }
.sq-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 13px; }
.sq-row.empty { opacity: .4; }
.sq-row.click { cursor: pointer; transition: background .2s; }
.sq-row.click:hover { background: rgba(245,184,0,.08); }
.sq-mastery { color: #fff; font-weight: 700; } .sq-mastery em { font-style: normal; color: #37d67a; font-weight: 900; }
.sq-role { display: block; margin-top: 1px; font-size: 10.5px; font-weight: 600; color: #F5B800; opacity: .9; overflow: hidden; text-overflow: ellipsis; }
.sq-pos { flex: none; width: 34px; text-align: center; font-style: normal; font-weight: 900; font-size: 11px; padding: 3px 0; border-radius: 6px; background: rgba(245,184,0,.16); color: #F5B800; }
.sq-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.sq-name em { font-style: normal; margin-left: 6px; font-size: 9px; color: #ff9a6b; text-transform: uppercase; }
.sq-flag { flex: none; width: 20px; height: 14px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
.sq-ovr-s { flex: none; min-width: 24px; text-align: right; font-size: 15px; }
.sq-pips { flex: none; display: flex; gap: 3px; }
.sq-pips u { width: 7px; height: 7px; transform: rotate(45deg); background: rgba(255,255,255,.16); transition: background .4s, box-shadow .4s; }
.sq-pips u.on { background: #F5B800; box-shadow: 0 0 6px rgba(245,184,0,.8); }
.sq-links { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.sq-links line { stroke: #F5B800; stroke-width: 2; stroke-opacity: .85; stroke-linecap: round; filter: drop-shadow(0 0 4px rgba(245,184,0,.9)); stroke-dasharray: 6 5; animation: sq-flow 1.2s linear infinite; }
@keyframes sq-pop { from { transform: scale(.7); opacity: .3; } to { transform: none; opacity: 1; } }
@keyframes sq-star { from { transform: scale(0) rotate(-40deg); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes sq-flow { to { stroke-dashoffset: -22; } }
@media (min-width: 1000px) {
  .sq-layout { grid-template-columns: 290px minmax(0, 540px) 290px; justify-content: center; gap: 22px; }
  .sq-rate { position: sticky; top: 90px; }
  .sq-list { order: 3; }
}
@media (max-width: 999px) {
  .sq-layout { grid-template-columns: 104px minmax(0, 1fr); gap: 8px; }
  .sq-rate { grid-column: 1; grid-row: 1; position: relative; align-self: start; z-index: 1; }
  .sq-center { grid-column: 2; grid-row: 1; }
  .sq-list { grid-column: 1 / -1; grid-row: 2; }
  .fc-head { flex-direction: column; align-items: flex-start; gap: 4px; }
  .fc-head .club-badge { width: 34px; height: 34px; font-size: 12px; }
  .fc-name { font-size: 12px; white-space: normal; }
  .fc-info { width: 100%; }
  .fc-info .sq-stars { gap: 1px; } .fc-info .sq-stars svg { width: 11px; height: 11px; }
  .fc-rating { font-size: 11px; } .fc-rating strong { font-size: 15px; margin-left: 4px; }
  .fc-mgmt { font-size: 11px; margin-top: 8px; }
  .fc-chem { font-size: 10px; } .fc-chem b { display: block; margin: 0; font-size: 12px; }
  .fc-list { max-height: 190px; } .fc-row { gap: 5px; padding: 5px 5px; }
  .fc-row .sq-flag { width: 18px; height: 12px; } .fc-mini, .fc-mini .club-badge { width: 18px; height: 18px; font-size: 6px; }
  .fc-pips { gap: 2px; } .fc-pips u { border-left-width: 3px; border-right-width: 3px; border-bottom-width: 6px; } .fc-dia { width: 6px; height: 6px; }
  .fc-tactic { padding: 6px 6px; font-size: 10px; } .fc-tactic b { font-size: 9px; }
}
@media (max-width: 420px) { .sq-score { gap: 12px; } .sq-formation b { font-size: 28px; } }
@media (prefers-reduced-motion: reduce) { .sq-ovr strong, .sq-stars svg.on, .sq-links line { animation: none; } .sq-bar i { transition: none; } }
`;
