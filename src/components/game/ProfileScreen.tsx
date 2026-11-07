import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleUserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string;
  host_id: string;
  guest_id: string;
  host_nick: string;
  guest_nick: string;
  host_goals: number;
  guest_goals: number;
  created_at: string;
};

const css = `
.pf { max-width: 760px; margin: 0 auto; padding: 8px 16px 40px; }
.pf-hero { display: flex; gap: 18px; align-items: center; padding: 20px; border-radius: 20px; margin-bottom: 14px;
  background: linear-gradient(135deg, rgba(245,184,0,.16), rgba(255,255,255,.04)); border: 1px solid rgba(245,184,0,.3); }
.pf-avatar { width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; flex: none;
  background: radial-gradient(circle at 30% 25%, #ffe27a, #b9830a); color: #1a1200; box-shadow: 0 8px 24px rgba(245,184,0,.35); }
.pf-name { font-size: 26px; font-weight: 900; letter-spacing: .5px; word-break: break-word; }
.pf-lv { font-size: 12px; font-weight: 800; letter-spacing: 2px; color: #F5B800; }
.pf-bar { height: 8px; border-radius: 8px; background: rgba(255,255,255,.1); overflow: hidden; margin-top: 8px; }
.pf-bar i { display: block; height: 100%; background: linear-gradient(90deg, #F5B800, #fff2a8); border-radius: 8px; }
.pf-xp { font-size: 11px; opacity: .65; margin-top: 4px; }
.pf-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
.pf-stat { padding: 14px 8px; border-radius: 14px; text-align: center; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.09); }
.pf-stat b { display: block; font-size: 26px; }
.pf-stat span { font-size: 10px; letter-spacing: 1.2px; opacity: .6; }
.pf-stat.w b { color: #4ade80; } .pf-stat.l b { color: #f87171; } .pf-stat.d b { color: #cbd5e1; }
.pf h3 { margin: 18px 0 8px; font-size: 13px; letter-spacing: 1.5px; opacity: .7; }
.pf-form { display: flex; gap: 6px; }
.pf-form span { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; font-weight: 900; font-size: 13px; color: #07110a; }
.pf-m { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; padding: 10px 6px; border-top: 1px solid rgba(255,255,255,.07); font-size: 14px; }
.pf-m b:first-child { text-align: right; }
.pf-sc { padding: 3px 12px; border-radius: 8px; background: rgba(255,255,255,.08); font-weight: 800; }
@media (max-width: 520px) { .pf-grid { grid-template-columns: repeat(2, 1fr); } .pf-name { font-size: 21px; } }
`;

export function levelFor(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  const base = 40 * (level - 1) ** 2;
  const next = 40 * level ** 2;
  return { level, base, next, pct: Math.min(100, ((xp - base) / (next - base)) * 100) };
}

export function ProfileScreen({
  nickname,
  userId,
  onBack,
}: {
  nickname: string;
  userId: string | null;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from('match_results')
        .select('id,host_id,guest_id,host_nick,guest_nick,host_goals,guest_goals,created_at')
        .or(`host_id.eq.${userId},guest_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(300);
      setRows((data ?? []) as Row[]);
      setLoaded(true);
    })();
  }, [userId]);

  const s = useMemo(() => {
    let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
    const form: ('V' | 'E' | 'D')[] = [];
    const recent = rows.map((m) => {
      const host = m.host_id === userId;
      const mine = host ? m.host_goals : m.guest_goals;
      const theirs = host ? m.guest_goals : m.host_goals;
      gf += mine;
      ga += theirs;
      const r = mine > theirs ? 'V' : mine < theirs ? 'D' : 'E';
      if (r === 'V') wins += 1;
      else if (r === 'D') losses += 1;
      else draws += 1;
      if (form.length < 5) form.push(r);
      return { id: m.id, a: host ? m.host_nick : m.guest_nick, b: host ? m.guest_nick : m.host_nick, mine, theirs };
    });
    const games = rows.length;
    const xp = games * 10 + wins * 20 + draws * 5;
    return { wins, draws, losses, gf, ga, games, xp, form, recent: recent.slice(0, 8), rate: games ? Math.round((wins / games) * 100) : 0 };
  }, [rows, userId]);

  const lv = levelFor(s.xp);
  const color = { V: '#4ade80', E: '#cbd5e1', D: '#f87171' };

  return (
    <main className="simple-page">
      <style>{css}</style>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Voltar
      </button>
      <div className="pf">
        <div className="pf-hero">
          <div className="pf-avatar"><CircleUserRound size={44} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pf-lv">NÍVEL {lv.level}</div>
            <div className="pf-name">{nickname}</div>
            <div className="pf-bar"><i style={{ width: `${lv.pct}%` }} /></div>
            <div className="pf-xp">{s.xp} / {lv.next} XP</div>
          </div>
        </div>
        {!userId ? (
          <p style={{ opacity: 0.8 }}>Entre na sua conta para acompanhar vitórias, derrotas e nível.</p>
        ) : !loaded ? (
          <p style={{ opacity: 0.7 }}>Carregando estatísticas...</p>
        ) : (
          <>
            <div className="pf-grid">
              <div className="pf-stat w"><b>{s.wins}</b><span>VITÓRIAS</span></div>
              <div className="pf-stat d"><b>{s.draws}</b><span>EMPATES</span></div>
              <div className="pf-stat l"><b>{s.losses}</b><span>DERROTAS</span></div>
              <div className="pf-stat"><b>{s.rate}%</b><span>APROVEITAMENTO</span></div>
              <div className="pf-stat"><b>{s.games}</b><span>PARTIDAS</span></div>
              <div className="pf-stat"><b>{s.gf}</b><span>GOLS PRÓ</span></div>
              <div className="pf-stat"><b>{s.ga}</b><span>GOLS CONTRA</span></div>
              <div className="pf-stat"><b>{s.gf - s.ga > 0 ? '+' : ''}{s.gf - s.ga}</b><span>SALDO</span></div>
            </div>
            {s.form.length > 0 && (
              <>
                <h3>ÚLTIMOS JOGOS</h3>
                <div className="pf-form">
                  {s.form.map((r, i) => (
                    <span key={i} style={{ background: color[r] }}>{r}</span>
                  ))}
                </div>
                <h3>PARTIDAS RECENTES</h3>
                {s.recent.map((m) => (
                  <div className="pf-m" key={m.id}>
                    <b>{m.a}</b>
                    <span className="pf-sc">{m.mine} x {m.theirs}</span>
                    <b>{m.b}</b>
                  </div>
                ))}
              </>
            )}
            {s.games === 0 && <p style={{ opacity: 0.75 }}>Nenhuma partida multiplayer ainda. Jogue online para subir de nível!</p>}
          </>
        )}
      </div>
    </main>
  );
}
