import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_VAR, VAR_LIMITS, cleanVar, getVarConfig, loadVarConfig, saveVarConfig, type VarConfig, type VarLogRow } from '@/lib/var';
import { VarCheck } from '@/components/game/VarCheck';

const css = `
.vr-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin: 14px 0; }
.vr-box { padding: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); }
.vr-box label { display: block; font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; opacity: .85; }
.vr-box b.vr-val { display: block; margin: 4px 0 8px; font-size: 26px; color: #F5B800; }
.vr-box input[type=range] { width: 100%; accent-color: #F5B800; }
.vr-box p { margin: 8px 0 0; font-size: 12px; opacity: .65; line-height: 1.35; }
.vr-switch { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); cursor: pointer; }
.vr-switch input { width: 22px; height: 22px; accent-color: #4ade80; }
.vr-switch b { font-size: 15px; } .vr-switch span { display: block; font-size: 12px; opacity: .65; }
.vr-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.vr-msg { font-size: 13px; } .vr-msg.err { color: #ff9a9a; } .vr-msg.ok { color: #4ade80; }
.vr-log { margin-top: 18px; }
.vr-row { display: grid; grid-template-columns: 72px 1fr auto; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.07); font-size: 13px; }
.vr-row .min { font-weight: 800; color: #F5B800; }
.vr-row small { display: block; opacity: .65; font-size: 11px; }
.vr-pill { padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 900; letter-spacing: .5px; color: #0b1016; }
.vr-pill.ok { background: #4ade80; } .vr-pill.no { background: #f87171; }
@media (max-width: 560px) { .vr-row { grid-template-columns: 1fr auto; } .vr-row .min { grid-column: 1 / -1; } }
`;

const whenText = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Painel ADM · VAR: liga/desliga, frequência, duração da animação e histórico das decisões
export function VarAdmin() {
  const [cfg, setCfg] = useState<VarConfig>(getVarConfig());
  const [saved, setSaved] = useState<VarConfig>(getVarConfig());
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<'confirmado' | 'anulado' | null>(null);
  const [rows, setRows] = useState<VarLogRow[]>([]);
  const [logState, setLogState] = useState<'loading' | 'ok' | 'missing' | string>('loading');
  const [filter, setFilter] = useState<'all' | 'confirmado' | 'anulado'>('all');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadVarConfig().then((value) => {
      if (!alive) return;
      setCfg(value);
      setSaved(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setLogState('loading');
    void (async () => {
      const { data, error } = await supabase.from('var_decisions').select('*').order('created_at', { ascending: false }).limit(200);
      if (!alive) return;
      if (error) {
        setLogState(/does not exist|schema cache|relation/i.test(error.message) ? 'missing' : error.message);
        return;
      }
      setRows((data ?? []) as VarLogRow[]);
      setLogState('ok');
    })();
    return () => {
      alive = false;
    };
  }, [tick]);

  const dirty = JSON.stringify(cleanVar(cfg)) !== JSON.stringify(saved);
  async function save() {
    setSaving(true);
    const error = await saveVarConfig(cfg);
    setSaving(false);
    if (error) {
      setMsg({ text: /does not exist|schema cache|relation/i.test(error) ? 'Rode a migração 20261119120000_var_system.sql no Supabase antes de salvar.' : `Não foi possível salvar: ${error}`, err: true });
      return;
    }
    const clean = cleanVar(cfg);
    setCfg(clean);
    setSaved(clean);
    setMsg({ text: 'Configuração salva. Vale a partir da próxima partida.' });
  }
  const set = (patch: Partial<VarConfig>) => setCfg((current) => ({ ...current, ...patch }));
  const shown = rows.filter((row) => filter === 'all' || row.outcome === filter);
  const total = rows.length;
  const annulled = rows.filter((row) => row.outcome === 'anulado').length;

  return (
    <section className="ad-card">
      <style>{css}</style>
      <label className="vr-switch">
        <input type="checkbox" checked={cfg.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
        <div>
          <b>VAR {cfg.enabled ? 'ativado' : 'desativado'}</b>
          <span>Quando desativado, nenhum lance é revisado e as partidas funcionam como antes.</span>
        </div>
      </label>
      <div className="vr-grid">
        <div className="vr-box">
          <label htmlFor="var-chance">Frequência de revisão</label>
          <b className="vr-val">{Math.round(cfg.chance * 100)}%</b>
          <input id="var-chance" type="range" min={0} max={100} step={5} value={Math.round(cfg.chance * 100)} onChange={(event) => set({ chance: Number(event.target.value) / 100 })} disabled={!cfg.enabled} />
          <p>Chance de um gol da partida ir para o VAR. O VAR não aparece em todos os gols.</p>
        </div>
        <div className="vr-box">
          <label htmlFor="var-annul">Revisões que anulam</label>
          <b className="vr-val">{Math.round(cfg.annulShare * 100)}%</b>
          <input id="var-annul" type="range" min={0} max={90} step={5} value={Math.round(cfg.annulShare * 100)} onChange={(event) => set({ annulShare: Number(event.target.value) / 100 })} disabled={!cfg.enabled} />
          <p>Gol anulado só acontece por um motivo do lance (impedimento, falta ou mão), no máximo {VAR_LIMITS.maxAnnulledPerMatch} por partida. O placar final do jogo não muda.</p>
        </div>
        <div className="vr-box">
          <label htmlFor="var-dur">Duração da animação</label>
          <b className="vr-val">{cfg.durationSec.toString().replace('.', ',')} s</b>
          <input id="var-dur" type="range" min={VAR_LIMITS.durationMin} max={VAR_LIMITS.durationMax} step={0.5} value={cfg.durationSec} onChange={(event) => set({ durationSec: Number(event.target.value) })} disabled={!cfg.enabled} />
          <p>Tempo da tela "CHECKING GOAL" até a decisão aparecer.</p>
        </div>
      </div>
      <div className="vr-actions">
        <button className="ad-btn on" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? 'Salvando...' : 'Salvar configuração'}
        </button>
        <button className="ad-btn" onClick={() => setCfg(DEFAULT_VAR)} disabled={saving}>Restaurar padrão</button>
        <button className="ad-btn" onClick={() => setPreview('confirmado')}>Testar: confirmado</button>
        <button className="ad-btn" onClick={() => setPreview('anulado')}>Testar: anulado</button>
        {msg && <span className={`vr-msg ${msg.err ? 'err' : 'ok'}`} role="status">{msg.text}</span>}
      </div>

      <div className="vr-log">
        <div className="ad-hist-bar">
          <button className={filter === 'all' ? 'ad-btn on' : 'ad-btn'} onClick={() => setFilter('all')}>Tudo</button>
          <button className={filter === 'confirmado' ? 'ad-btn on' : 'ad-btn'} onClick={() => setFilter('confirmado')}>Confirmados</button>
          <button className={filter === 'anulado' ? 'ad-btn on' : 'ad-btn'} onClick={() => setFilter('anulado')}>Anulados</button>
          <button className="ad-btn" onClick={() => setTick((value) => value + 1)}>Atualizar</button>
          {logState === 'ok' && <span>{total} decisões · {annulled} anuladas</span>}
        </div>
        {logState === 'missing' ? (
          <div className="ad-empty">O VAR ainda não foi ativado no banco. Rode a migração <b>20261119120000_var_system.sql</b> no Supabase (SQL Editor) e volte aqui.</div>
        ) : logState === 'loading' && !rows.length ? (
          <div className="ad-empty">Carregando...</div>
        ) : logState !== 'ok' && logState !== 'loading' ? (
          <div className="ad-empty">Erro ao carregar o histórico: {logState}</div>
        ) : !shown.length ? (
          <div className="ad-empty">Nenhuma decisão registrada ainda.</div>
        ) : (
          shown.map((row) => (
            <div className="vr-row" key={row.id}>
              <span className="min">{row.minute}'</span>
              <div>
                <b>{row.scorer ?? '—'}</b> <small>{row.home} × {row.away} · {whenText(row.created_at)}</small>
                <small>{row.reason}</small>
              </div>
              <span className={`vr-pill ${row.outcome === 'confirmado' ? 'ok' : 'no'}`}>{row.outcome === 'confirmado' ? 'CONFIRMADO' : 'ANULADO'}</span>
            </div>
          ))
        )}
      </div>
      {preview && (
        <VarCheck
          verdict={{ outcome: preview, kind: 'impedimento', reason: preview === 'confirmado' ? 'Posição de Carreras conferida: sem impedimento' : 'Impedimento de Carreras no início da jogada' }}
          scorer="Carreras"
          minute={67}
          club="FCB"
          seconds={Math.min(cfg.durationSec, 4)}
          onDecision={() => undefined}
          onDone={() => setPreview(null)}
        />
      )}
    </section>
  );
}
