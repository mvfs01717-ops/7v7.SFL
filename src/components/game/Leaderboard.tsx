import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Trophy, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type MatchRow = {
  id: string;
  host_id: string;
  guest_id: string;
  host_nick: string;
  guest_nick: string;
  host_goals: number;
  guest_goals: number;
  created_at: string;
};

export type RankRow = { id: string; nick: string; games: number; wins: number; draws: number; losses: number };

export const leaderboardCss = `
.lb-head, .lb-row { display: grid; grid-template-columns: 38px 1fr 40px 40px 40px 40px 62px; }
.lb-head, .lb-row { gap: 6px; align-items: center; padding: 12px 16px; }
.lb-head { font-size: 11px; letter-spacing: 1.2px; opacity: .6; }
.lb-head span:nth-child(n+3), .lb-row > :nth-child(n+3) { text-align: center; }
.lb-row { border-top: 1px solid rgba(255,255,255,.07); }
.lb-row b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-win { color: #4ade80; font-weight: 800; }
.lb-loss { color: #f87171; }
.lb-row.click { cursor: pointer; }
.lb-row.click:hover { background: rgba(245,184,0,.07); }
.lb-hist { max-height: 340px; overflow-y: auto; margin-top: 12px; }
.lb-hist div { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; }
.lb-hist div { padding: 9px 4px; border-top: 1px solid rgba(255,255,255,.08); font-size: 14px; }
.lb-hist small { opacity: .55; display: block; font-size: 11px; }
.lb-tag { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; }
.lb-tag { font-weight: 900; font-size: 12px; color: #0B1016; }
.lb-tag.w { background: #4ade80; }
.lb-tag.e { background: #cbd5e1; }
.lb-tag.d { background: #f87171; }
.lb-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; text-align: center; }
.lb-stats div { background: rgba(255,255,255,.05); border-radius: 10px; padding: 8px 0; }
.lb-stats b { display: block; font-size: 22px; }
.lb-stats span { font-size: 10px; letter-spacing: 1px; opacity: .6; }
.lb-recent { margin-top: 22px; }
.lb-recent h3 { margin: 0 0 8px; font-size: 14px; letter-spacing: 1.5px; opacity: .7; }
.lb-match { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; }
.lb-match { padding: 10px 16px; border-top: 1px solid rgba(255,255,255,.07); font-size: 14px; }
.lb-match b:first-child { text-align: right; }
.lb-score { padding: 3px 12px; border-radius: 8px; background: rgba(255,255,255,.08); font-weight: 800; }
@media (max-width: 560px) {
  .lb-head, .lb-row { grid-template-columns: 28px 1fr 32px 32px 32px 32px 50px; padding: 10px; gap: 4px; }
}
`;

export function Leaderboard({ onBack }: { onBack: () => void }) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('match_results')
        .select('id,host_id,guest_id,host_nick,guest_nick,host_goals,guest_goals,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      setMatches((data ?? []) as MatchRow[]);
      setLoaded(true);
    })();
  }, []);

  const table = useMemo(() => {
    const map = new Map<string, RankRow>();
    const touch = (id: string, nick: string) => {
      const row = map.get(id) ?? { id, nick, games: 0, wins: 0, draws: 0, losses: 0 };
      map.set(id, row);
      return row;
    };
    matches.forEach((match) => {
      const host = touch(match.host_id, match.host_nick);
      const guest = touch(match.guest_id, match.guest_nick);
      host.games += 1;
      guest.games += 1;
      if (match.host_goals > match.guest_goals) {
        host.wins += 1;
        guest.losses += 1;
      } else if (match.host_goals < match.guest_goals) {
        guest.wins += 1;
        host.losses += 1;
      } else {
        host.draws += 1;
        guest.draws += 1;
      }
    });
    const pct = (row: RankRow) => (row.games ? (row.wins * 3 + row.draws) / (row.games * 3) : 0);
    return [...map.values()].sort((a, b) => b.wins - a.wins || pct(b) - pct(a) || a.losses - b.losses);
  }, [matches]);

  return (
    <main className="simple-page">
      <style>{leaderboardCss}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="flow-heading">
        <div className="eyebrow">
          <Trophy size={14} /> RANKING GLOBAL
        </div>
        <h2>
          MAIORES <em>VENCEDORES</em>
        </h2>
        <p>Resultados das partidas multiplayer. Vitória vale 3 pontos e empate vale 1.</p>
      </div>
      <section className="leaderboard-panel">
        <div className="lb-head">
          <span>#</span>
          <span>JOGADOR</span>
          <span>J</span>
          <span>V</span>
          <span>E</span>
          <span>D</span>
          <span>APROV.</span>
        </div>
        {table.length ? (
          table.map((row, index) => (
            <div
              className="lb-row click"
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(row.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSelected(row.id);
              }}
            >
              <strong className={`rank rank-${index + 1}`}>{index + 1}</strong>
              <div className="rank-player">
                <span>{row.nick.slice(0, 1)}</span>
                <b>{row.nick}</b>
              </div>
              <span>{row.games}</span>
              <strong className="lb-win">{row.wins}</strong>
              <span>{row.draws}</span>
              <span className="lb-loss">{row.losses}</span>
              <span>{Math.round(((row.wins * 3 + row.draws) / (row.games * 3)) * 100)}%</span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            {loaded ? 'Nenhuma partida multiplayer foi jogada ainda.' : 'Carregando ranking...'}
          </div>
        )}
      </section>

      {selected && (() => {
        const person = table.find((row) => row.id === selected);
        if (!person) return null;
        const history = matches
          .filter((match) => match.host_id === selected || match.guest_id === selected)
          .map((match) => {
            const mine = match.host_id === selected;
            const gf = mine ? match.host_goals : match.guest_goals;
            const ga = mine ? match.guest_goals : match.host_goals;
            return {
              id: match.id,
              rival: mine ? match.guest_nick : match.host_nick,
              gf,
              ga,
              tag: gf > ga ? 'w' : gf < ga ? 'd' : 'e',
              date: new Date(match.created_at).toLocaleDateString('pt-BR'),
            };
          });
        return (
          <div className="modal-backdrop" onClick={() => setSelected(null)}>
            <div className="login-modal" onClick={(event) => event.stopPropagation()}>
              <button className="close-button" onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
              <div className="eyebrow">
                <Trophy size={14} /> HISTÓRICO
              </div>
              <h2>{person.nick}</h2>
              <div className="lb-stats">
                <div><b>{person.games}</b><span>JOGOS</span></div>
                <div><b className="lb-win">{person.wins}</b><span>VITÓRIAS</span></div>
                <div><b>{person.draws}</b><span>EMPATES</span></div>
                <div><b className="lb-loss">{person.losses}</b><span>DERROTAS</span></div>
              </div>
              <div className="lb-hist">
                {history.map((item) => (
                  <div key={item.id}>
                    <span className={`lb-tag ${item.tag}`}>
                      {item.tag === 'w' ? 'V' : item.tag === 'd' ? 'D' : 'E'}
                    </span>
                    <span>
                      vs <b>{item.rival}</b>
                      <small>{item.date}</small>
                    </span>
                    <strong>
                      {item.gf} × {item.ga}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {matches.length > 0 && (
        <section className="leaderboard-panel lb-recent">
          <h3 style={{ padding: '14px 16px 0' }}>ÚLTIMAS PARTIDAS</h3>
          {matches.slice(0, 8).map((match) => (
            <div className="lb-match" key={match.id}>
              <b className={match.host_goals > match.guest_goals ? 'lb-win' : ''}>{match.host_nick}</b>
              <span className="lb-score">
                {match.host_goals} × {match.guest_goals}
              </span>
              <b className={match.guest_goals > match.host_goals ? 'lb-win' : ''} style={{ textAlign: 'left' }}>
                {match.guest_nick}
              </b>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
