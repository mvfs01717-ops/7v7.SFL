import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/game/Card';
import { MvpCard } from '@/components/game/Mvp';
import { newsHighlights } from '@/components/game/WhatsNew';
import { useMvpLog } from '@/lib/mvpLog';
import { positionNames, type Player } from '@/lib/game/types';

// Seções abaixo do banner (só desktop). Tudo vem de dados reais: o registro de MVPs deste aparelho, as partidas e torneios do banco,
// os melhores overalls do jogo e as novidades da versão. Seção sem dados some em vez de mostrar números inventados.

type Match = { id: string; host_id: string; guest_id: string; host_nick: string; guest_nick: string; host_goals: number; guest_goals: number; created_at: string };
type Tourney = { id: string; code: string; mode: string; size: number; status: string; players: { id: string; nick: string }[] | null; champion_nick: string | null };

export function useDesktop() {
  const q = '(min-width: 861px)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const fn = () => setOn(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, []);
  return on;
}

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
};

export const homeExtrasCss = `
.hx { max-width: min(1680px, 100%); margin: 0 auto; padding: 0 clamp(20px, 4vw, 72px) 64px; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 20px; position: relative; z-index: 1; }
.hx-p { position: relative; min-width: 0; padding: 20px 22px 22px; border-radius: 6px 20px 6px 20px; border: 1px solid rgba(255,255,255,.09);
  background: linear-gradient(165deg, rgba(14,24,48,.74), rgba(5,9,20,.82)); box-shadow: 0 22px 50px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.05); animation: hxIn .6s cubic-bezier(.2,.8,.2,1) both; }
.hx-p::before { content: ''; position: absolute; left: 0; top: 0; width: 46%; height: 2px; background: linear-gradient(90deg, #F5B800, rgba(245,184,0,0)); }
.hx-p:nth-child(2) { animation-delay: .06s; } .hx-p:nth-child(3) { animation-delay: .12s; } .hx-p:nth-child(4) { animation-delay: .18s; } .hx-p:nth-child(5) { animation-delay: .24s; } .hx-p:nth-child(6) { animation-delay: .3s; }
@keyframes hxIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
.s7 { grid-column: span 7; } .s5 { grid-column: span 5; } .s6 { grid-column: span 6; } .s12 { grid-column: span 12; }
.hx-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.hx-h h2 { margin: 0; font-size: 15px; letter-spacing: 3px; font-weight: 900; text-transform: uppercase; display: flex; align-items: center; gap: 10px; }
.hx-h h2 i { width: 4px; height: 18px; background: linear-gradient(180deg, #ffe27a, #d99a00); border-radius: 2px; box-shadow: 0 0 10px rgba(245,184,0,.7); }
.hx-link { border: 0; background: none; color: #F5B800; font: 800 12px Inter, sans-serif; letter-spacing: 1.4px; text-transform: uppercase; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; }
.hx-link:hover { color: #ffe27a; } .hx-link svg { transition: transform .2s; } .hx-link:hover svg { transform: translateX(4px); }
.hx-cards { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.hx-card { width: 138px; text-align: center; transition: transform .3s cubic-bezier(.2,.8,.2,1); }
.hx-card:hover { transform: translateY(-8px); }
.hx-card small { display: block; margin-top: 8px; font: 700 11px/1.3 Inter, sans-serif; color: rgba(255,255,255,.62); letter-spacing: .4px; }
.hx-card b { display: block; margin-top: 8px; font: 900 12px Inter, sans-serif; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hx-card.dc { width: 118px; }
.hx-empty { margin: 0; padding: 26px 8px; text-align: center; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.55); border: 1px dashed rgba(255,255,255,.14); border-radius: 12px; }
.hx-rank { display: grid; gap: 4px; }
.hx-rank li { list-style: none; display: grid; grid-template-columns: 30px 1fr auto auto; gap: 12px; align-items: center; padding: 9px 12px; border-radius: 10px; background: rgba(255,255,255,.04); font-size: 14px; }
.hx-rank li:first-child { background: linear-gradient(100deg, rgba(245,184,0,.2), rgba(245,184,0,.04)); box-shadow: inset 3px 0 0 #F5B800; }
.hx-rank .n { font: 900 italic 20px 'Bebas Neue', Inter, sans-serif; color: #F5B800; }
.hx-rank b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hx-rank em { font-style: normal; font-size: 12px; opacity: .6; } .hx-rank strong { color: #4ade80; font-weight: 900; }
.hx-list { display: grid; gap: 4px; margin: 0; padding: 0; }
.hx-m { list-style: none; display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 14px; align-items: center; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,.04); font-size: 14px; }
.hx-m b:first-child { text-align: right; } .hx-m b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hx-sc { padding: 3px 14px; border-radius: 8px; background: rgba(0,0,0,.4); border: 1px solid rgba(245,184,0,.3); font: 900 italic 18px 'Bebas Neue', Inter, sans-serif; letter-spacing: 1px; color: #ffe27a; }
.hx-m small { font-size: 11px; opacity: .5; }
.hx-t { list-style: none; display: flex; align-items: center; gap: 14px; padding: 11px 12px; border-radius: 10px; background: rgba(255,255,255,.04); }
.hx-t .tag { flex: none; padding: 4px 9px; border-radius: 99px; font: 900 10px Inter, sans-serif; letter-spacing: 1px; background: rgba(255,255,255,.1); }
.hx-t .tag.live { background: #ef4444; } .hx-t .tag.wait { background: #F5B800; color: #1a1200; } .hx-t .tag.done { background: rgba(74,222,128,.2); color: #4ade80; }
.hx-t div { min-width: 0; flex: 1; } .hx-t b { display: block; font-size: 14px; } .hx-t small { display: block; font-size: 12px; opacity: .6; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hx-news { display: grid; gap: 10px; margin: 0; padding: 0; }
.hx-news li { list-style: none; display: flex; gap: 14px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,.04); border-left: 3px solid #F5B800; }
.hx-news .ic { font-size: 22px; line-height: 1; } .hx-news b { display: block; font-size: 14px; } .hx-news p { margin: 3px 0 0; font-size: 12.5px; line-height: 1.45; opacity: .68; }
.hx-news small { display: block; font: 800 9px Inter, sans-serif; letter-spacing: 1.6px; color: #F5B800; margin-bottom: 3px; }
@media (max-width: 1180px) { .s7, .s5, .s6 { grid-column: span 12; } }
@media (max-width: 860px) {
  .hx { display: flex; flex-direction: column; gap: 12px; padding: 0 12px 22px; }
  .hx-p { padding: 16px 14px; border-radius: 6px 18px 6px 18px; animation: none; box-shadow: 0 14px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05); }
  .hx-h { margin-bottom: 12px; } .hx-h h2 { font-size: 13px; letter-spacing: 2.4px; }
  .hx-cards { flex-wrap: nowrap; overflow-x: auto; gap: 12px; margin: 0 -14px; padding: 2px 14px 8px; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .hx-cards::-webkit-scrollbar { display: none; }
  .hx-card { flex: none; width: 132px; scroll-snap-align: start; } .hx-card.dc { width: 112px; }
  .hx-card:hover { transform: none; }
  .hx-rank li { gap: 10px; padding: 10px; }
  .hx-m { grid-template-columns: 1fr auto 1fr; gap: 8px; font-size: 13px; } .hx-m small { grid-column: 1 / -1; text-align: center; }
  .hx-news li { padding: 11px 12px; }
}
@media (prefers-reduced-motion: reduce) { .hx-p { animation: none; } }
`;

export function HomeExtras({ featured, loggedIn, offline, onLeaderboard, onTournament, onNews }: { featured: Player[]; loggedIn: boolean; offline: boolean; onLeaderboard: () => void; onTournament: () => void; onNews?: () => void }) {
  const mvps = useMvpLog();
  const [matches, setMatches] = useState<Match[]>([]);
  const [tours, setTours] = useState<Tourney[]>([]);
  useEffect(() => {
    if (offline) return undefined;
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.from('match_results').select('id,host_id,guest_id,host_nick,guest_nick,host_goals,guest_goals,created_at').order('created_at', { ascending: false }).limit(300);
        if (alive && data) setMatches(data as Match[]);
      } catch {
        /* sem internet ou sem permissão: a seção some */
      }
      if (!loggedIn) return;
      try {
        const { data, error } = await supabase.from('tournaments').select('id,code,mode,size,status,players,champion_nick').limit(30);
        if (alive && !error && data) setTours((data as Tourney[]).filter((t) => t.status !== 'cancelled'));
      } catch {
        /* idem */
      }
    })();
    return () => {
      alive = false;
    };
  }, [offline, loggedIn]);

  const table = useMemo(() => {
    const map = new Map<string, { id: string; nick: string; games: number; wins: number; draws: number }>();
    const touch = (id: string, nick: string) => {
      const row = map.get(id) ?? { id, nick, games: 0, wins: 0, draws: 0 };
      map.set(id, row);
      return row;
    };
    matches.forEach((m) => {
      const h = touch(m.host_id, m.host_nick);
      const g = touch(m.guest_id, m.guest_nick);
      h.games += 1;
      g.games += 1;
      if (m.host_goals > m.guest_goals) h.wins += 1;
      else if (m.host_goals < m.guest_goals) g.wins += 1;
      else {
        h.draws += 1;
        g.draws += 1;
      }
    });
    const pct = (r: { wins: number; draws: number; games: number }) => (r.games ? (r.wins * 3 + r.draws) / (r.games * 3) : 0);
    return [...map.values()].sort((a, b) => b.wins - a.wins || pct(b) - pct(a)).slice(0, 5);
  }, [matches]);

  const live = tours.filter((t) => t.status === 'playing' || t.status === 'waiting');
  const champs = tours.filter((t) => t.status === 'finished' && t.champion_nick);
  const news = newsHighlights(3);

  return (
    <section className="hx" aria-label="Destaques do 7v7">
      <style>{homeExtrasCss}</style>

      <div className={`hx-p ${table.length > 0 ? 's7' : 's12'}`}>
        <div className="hx-h">
          <h2><i />MVPs recentes</h2>
        </div>
        {mvps.length ? (
          <div className="hx-cards">
            {mvps.slice(0, 4).map((m) => (
              <div className="hx-card" key={m.key}>
                <MvpCard player={m.player} team={m.team} rating={m.rating} goals={m.goals} assists={m.assists} />
                <small>{positionNames[m.player.primary_position] ?? m.player.primary_position} · {m.goals}G {m.assists}A</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="hx-empty">Termine uma partida e o MVP dela fica guardado aqui, com a carta e a nota.</p>
        )}
      </div>

      {table.length > 0 && (
        <div className="hx-p s5">
          <div className="hx-h">
            <h2><i />Classificação</h2>
            <button className="hx-link" onClick={onLeaderboard}>Ver tudo <ArrowRight size={14} /></button>
          </div>
          <ol className="hx-rank" style={{ margin: 0, padding: 0 }}>
            {table.map((r, i) => (
              <li key={r.id}>
                <span className="n">{i + 1}</span>
                <b>{r.nick}</b>
                <em>{r.games} j</em>
                <strong>{r.wins} V</strong>
              </li>
            ))}
          </ol>
        </div>
      )}

      {featured.length > 0 && (
        <div className={`hx-p ${live.length > 0 || champs.length > 0 ? 's7' : 's12'}`}>
          <div className="hx-h">
            <h2><i />Jogadores em destaque</h2>
          </div>
          <div className="hx-cards">
            {featured.slice(0, 5).map((p) => (
              <div className="hx-card dc" key={p.id}>
                <Card player={p} fluid />
                <b>{p.name}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {(live.length > 0 || champs.length > 0) && (
        <div className="hx-p s5">
          <div className="hx-h">
            <h2><i />Torneios</h2>
            <button className="hx-link" onClick={onTournament}>Abrir <ArrowRight size={14} /></button>
          </div>
          <ul className="hx-list">
            {live.slice(0, 3).map((t) => (
              <li className="hx-t" key={t.id}>
                <span className={`tag ${t.status === 'playing' ? 'live' : 'wait'}`}>{t.status === 'playing' ? 'AO VIVO' : 'ABERTO'}</span>
                <div>
                  <b>Torneio {t.code}</b>
                  <small>{(t.players ?? []).length}/{t.size} jogadores · {t.mode === 'dice' ? 'Dados' : 'Clássico'}</small>
                </div>
              </li>
            ))}
            {champs.slice(0, 3).map((t) => (
              <li className="hx-t" key={t.id}>
                <span className="tag done"><Trophy size={11} style={{ verticalAlign: -1 }} /> CAMPEÃO</span>
                <div>
                  <b>{t.champion_nick}</b>
                  <small>Torneio {t.code} · {t.size} jogadores</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {matches.length > 0 && (
        <div className="hx-p s6">
          <div className="hx-h">
            <h2><i />Últimos resultados</h2>
          </div>
          <ul className="hx-list">
            {matches.slice(0, 5).map((m) => (
              <li className="hx-m" key={m.id}>
                <b>{m.host_nick}</b>
                <span className="hx-sc">{m.host_goals} - {m.guest_goals}</span>
                <b>{m.guest_nick}</b>
                <small>{ago(m.created_at)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`hx-p ${matches.length > 0 ? 's6' : 's12'}`}>
        <div className="hx-h">
          <h2><i />Novidades</h2>
          {onNews && <button className="hx-link" onClick={onNews}>Ver tudo <ArrowRight size={14} /></button>}
        </div>
        <ul className="hx-news">
          {news.map((n) => (
            <li key={n.label}>
              <span className="ic">{n.icon}</span>
              <div>
                <small>{n.group}</small>
                <b>{n.label}</b>
                <p>{n.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
