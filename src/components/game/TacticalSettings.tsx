import { useEffect, useState } from 'react';
import { TACTIC_INFO, TACTIC_QUALITY, TACTIC_SHOTS, type Tactic } from '@/lib/multiplayer';
import {
  BUILD_OPTS, CHANCE_OPTS, DEFENSE_OPTS, MAX_PRESETS, STYLE_OPTS, DEFAULT_PROFILE, deriveTactic, describeProfile, loadTactics, presetName, saveTactics,
  type TacticProfile, type TacticStore,
} from '@/lib/tacticsProfile';

function Group<T extends string>({ title, hint, options, value, onChange }: { title: string; hint: string; options: { id: T; label: string; icon: string; text: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="ts-group">
      <div className="ts-gh"><b>{title}</b><span>{hint}</span></div>
      <div className={`ts-opts ${options.length === 4 ? 'n4' : ''}`} role="radiogroup" aria-label={title} style={{ '--n': options.length } as React.CSSProperties}>
        {options.map((option) => (
          <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={`ts-opt ${value === option.id ? 'on' : ''}`} onClick={() => onChange(option.id)}>
            <span className="ts-ic" aria-hidden="true">{option.icon}</span>
            <b>{option.label}</b>
            <small>{option.text}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

const meter = (value: number, min: number, max: number) => `${Math.round(((value - min) / (max - min)) * 100)}%`;

// TACTICAL SETTINGS: só o estilo de jogo. Formação, posições e jogadores ficam travados (vêm do draft).
export function TacticalSettings({ onClose, onUse }: { onClose: () => void; onUse?: (tactic: Tactic) => void }) {
  const [store, setStore] = useState<TacticStore>(() => loadTactics());
  const [tab, setTab] = useState(store.main);
  const [saved, setSaved] = useState(false);
  const profile = store.presets[tab] ?? DEFAULT_PROFILE;
  const tactic = deriveTactic(profile);
  const info = TACTIC_INFO[tactic];
  const shots = TACTIC_SHOTS[tactic];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (patch: Partial<TacticProfile>) => {
    setSaved(false);
    setStore((current) => {
      const presets = [...current.presets];
      presets[tab] = { ...(presets[tab] ?? DEFAULT_PROFILE), ...patch };
      return { ...current, presets };
    });
  };
  const createAlt = (index: number) => {
    setSaved(false);
    setStore((current) => {
      const presets = [...current.presets];
      presets[index] = { ...(current.presets[tab] ?? DEFAULT_PROFILE) };
      return { ...current, presets };
    });
    setTab(index);
  };
  const removeAlt = (index: number) => {
    setSaved(false);
    setStore((current) => {
      const presets = [...current.presets];
      presets[index] = null;
      return { main: current.main === index ? 0 : current.main, presets };
    });
    setTab(0);
  };
  const makeMain = () => {
    setSaved(false);
    setStore((current) => ({ ...current, main: tab }));
  };
  const save = () => {
    saveTactics(store);
    setSaved(true);
  };

  return (
    <div className="ts-overlay" role="dialog" aria-modal="true" aria-label="Tactical Settings">
      <style>{tacticalCss}</style>
      <div className="ts-wrap">
        <header className="ts-head">
          <div>
            <small>ESTILO DE JOGO</small>
            <h2>TACTICAL <em>SETTINGS</em></h2>
          </div>
          <button type="button" className="ts-x" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="ts-lock">🔒 Formação, posições e jogadores são fixos no draft. Aqui você muda só o estilo de jogo.</div>
        <div className="ts-tabs" role="tablist">
          {Array.from({ length: MAX_PRESETS }, (_, index) => {
            const exists = !!store.presets[index];
            return exists ? (
              <button key={index} type="button" role="tab" aria-selected={tab === index} className={`ts-tab ${tab === index ? 'on' : ''}`} onClick={() => setTab(index)}>
                {store.main === index && <i aria-label="principal">★</i>}
                {presetName(index)}
              </button>
            ) : (
              <button key={index} type="button" className="ts-tab add" onClick={() => createAlt(index)}>+ {presetName(index)}</button>
            );
          })}
        </div>
        <div className="ts-body">
          <div className="ts-settings" key={tab}>
            <Group title="ESTILO DE JOGO" hint="Define a identidade do time." options={STYLE_OPTS} value={profile.style} onChange={(style) => update({ style })} />
            <Group title="ABORDAGEM DEFENSIVA" hint="Onde o time marca." options={DEFENSE_OPTS} value={profile.defense} onChange={(defense) => update({ defense })} />
            <Group title="CONSTRUÇÃO OFENSIVA" hint="Como a bola chega ao ataque." options={BUILD_OPTS} value={profile.build} onChange={(build) => update({ build })} />
            <Group title="CRIAÇÃO DE OPORTUNIDADES" hint="Como o time abre a defesa." options={CHANCE_OPTS} value={profile.chance} onChange={(chance) => update({ chance })} />
          </div>
          <aside className="ts-summary">
            <small>RESUMO DA ESTRATÉGIA · {presetName(tab).toUpperCase()}</small>
            <p key={describeProfile(profile)}>{describeProfile(profile)}</p>
            <div className="ts-effect">
              <span className="ts-ic big" aria-hidden="true">{info.icon}</span>
              <div><small>EFEITO NA PARTIDA</small><b>{info.label}</b></div>
            </div>
            <p className="ts-etext">{info.text}</p>
            <div className="ts-meters">
              <div><span>Chances criadas</span><i><u style={{ width: meter(shots.own, -3, 2.5) }} /></i></div>
              <div><span>Chances cedidas</span><i><u className="bad" style={{ width: meter(shots.conceded, -2.5, 2.5) }} /></i></div>
              <div><span>Perigo do chute</span><i><u style={{ width: meter(TACTIC_QUALITY[tactic], -0.04, 0.08) }} /></i></div>
            </div>
            <div className="ts-actions">
              {store.main !== tab && <button type="button" className="outline-button" onClick={makeMain}>★ Definir como principal</button>}
              {tab > 0 && <button type="button" className="outline-button danger" onClick={() => removeAlt(tab)}>Excluir alternativa</button>}
              <button type="button" className={`gold-button large ${saved ? 'done' : ''}`} onClick={save}>{saved ? '✓ Salvo' : 'Salvar táticas'}</button>
              {onUse && (
                <button type="button" className="gold-button large" onClick={() => { saveTactics(store); onUse(tactic); onClose(); }}>Usar esta tática na partida</button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export const tacticalCss = `
.ts-overlay { position: fixed; inset: 0; z-index: 90; overflow-y: auto; color: #fff; padding: 16px; background: radial-gradient(120% 80% at 50% 0%, #10244f 0, #070d1f 55%, #03050c 100%); animation: ts-in .35s ease-out; }
.ts-wrap { width: min(1080px, 100%); margin: 0 auto; padding-bottom: 40px; }
.ts-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.ts-head small { font-size: 10px; letter-spacing: 4px; color: #F5B800; font-weight: 800; }
.ts-head h2 { margin: 4px 0 0; font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 46px; line-height: .95; letter-spacing: 2px; font-style: italic; }
.ts-head h2 em { color: #F5B800; font-style: italic; }
.ts-x { width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.06); color: #fff; font-size: 16px; cursor: pointer; flex: none; }
.ts-lock { margin: 12px 0; padding: 9px 12px; font-size: 12px; border-radius: 10px; background: rgba(245,184,0,.08); border: 1px solid rgba(245,184,0,.28); color: #f3e3a8; }
.ts-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.ts-tab { padding: 10px 16px; border-radius: 999px; font-weight: 800; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; color: #fff; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.05); transition: all .25s; }
.ts-tab i { font-style: normal; color: #F5B800; margin-right: 6px; }
.ts-tab.on { border-color: #F5B800; background: linear-gradient(180deg, rgba(245,184,0,.35), rgba(245,184,0,.08)); box-shadow: 0 0 0 1px #F5B800, 0 0 22px rgba(245,184,0,.3); }
.ts-tab.add { border-style: dashed; opacity: .7; }
.ts-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
.ts-settings { display: grid; gap: 14px; animation: ts-in .3s ease-out; }
.ts-group { padding: 14px; border-radius: 14px; background: linear-gradient(160deg, rgba(14,30,66,.9), rgba(7,14,34,.92)); border: 1px solid rgba(255,255,255,.1); }
.ts-gh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin-bottom: 10px; }
.ts-gh b { font-size: 11px; letter-spacing: 3px; color: #F5B800; font-weight: 900; }
.ts-gh span { font-size: 11px; opacity: .6; }
.ts-opts { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 8px; }
.ts-opt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 6px 10px; text-align: center; color: #fff; cursor: pointer; border-radius: 6px 16px 6px 16px; border: 1px solid rgba(255,255,255,.14); background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02)); transition: transform .25s, border-color .25s, background .25s, box-shadow .25s; }
.ts-opt:hover { transform: translateY(-2px); }
.ts-ic { font-size: 26px; line-height: 1; transition: transform .3s; }
.ts-ic.big { font-size: 34px; }
.ts-opt b { font-size: 12px; letter-spacing: .8px; text-transform: uppercase; }
.ts-opt small { font-size: 10.5px; line-height: 1.3; opacity: .68; }
.ts-opt.on { border-color: #F5B800; background: linear-gradient(180deg, rgba(245,184,0,.32), rgba(245,184,0,.05)); box-shadow: 0 0 0 1px #F5B800, 0 8px 26px rgba(245,184,0,.25); }
.ts-opt.on b { color: #F5B800; }
.ts-opt.on .ts-ic { transform: scale(1.18); filter: drop-shadow(0 0 8px rgba(245,184,0,.8)); }
.ts-opt.on::after { content: '✓'; position: absolute; top: 5px; right: 8px; font-size: 11px; font-weight: 900; color: #F5B800; animation: ts-pop .3s ease-out; }
.ts-summary { padding: 16px; border-radius: 14px; background: linear-gradient(160deg, rgba(14,30,66,.95), rgba(7,14,34,.96)); border: 1px solid rgba(245,184,0,.35); box-shadow: 0 10px 30px rgba(0,0,0,.4); }
.ts-summary > small { font-size: 10px; letter-spacing: 2.5px; color: #F5B800; font-weight: 800; }
.ts-summary p { margin: 8px 0 12px; font-size: 14px; line-height: 1.5; animation: ts-in .35s ease-out; }
.ts-effect { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.1); }
.ts-effect small { display: block; font-size: 9px; letter-spacing: 2px; opacity: .65; }
.ts-effect b { font-size: 18px; color: #F5B800; }
.ts-summary .ts-etext { font-size: 12px; opacity: .8; margin: 8px 0 12px; }
.ts-meters { display: grid; gap: 8px; }
.ts-meters div { display: grid; grid-template-columns: 110px 1fr; align-items: center; gap: 10px; font-size: 11px; }
.ts-meters i { display: block; height: 8px; border-radius: 99px; background: rgba(255,255,255,.1); overflow: hidden; }
.ts-meters u { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #c98a00, #F5B800, #fff2b0); transition: width .6s cubic-bezier(.2,.8,.2,1); }
.ts-meters u.bad { background: linear-gradient(90deg, #5aa0ff, #ff9a6b); }
.ts-actions { display: grid; gap: 8px; margin-top: 16px; }
.ts-actions .outline-button.danger { color: #ff9a8a; border-color: rgba(255,120,100,.5); }
.ts-actions .gold-button.done { filter: saturate(.8) brightness(1.1); }
@keyframes ts-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes ts-pop { from { transform: scale(0); } to { transform: scale(1); } }
@media (min-width: 900px) { .ts-body { grid-template-columns: minmax(0, 1fr) 340px; } .ts-summary { position: sticky; top: 16px; } }
@media (max-width: 560px) {
  .ts-opts.n4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ts-head h2 { font-size: 36px; }
  .ts-opt { padding: 10px 4px 8px; border-radius: 4px 12px 4px 12px; }
  .ts-opt small { font-size: 9.5px; }
  .ts-opt b { font-size: 10.5px; letter-spacing: .3px; }
  .ts-ic { font-size: 22px; }
  .ts-meters div { grid-template-columns: 96px 1fr; }
}
@media (prefers-reduced-motion: reduce) { .ts-overlay, .ts-settings, .ts-summary p, .ts-opt, .ts-ic, .ts-meters u { animation: none; transition: none; } }
`;
