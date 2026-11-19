import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TACTIC_DRAIN, TACTIC_INFO, TACTIC_QUALITY, TACTIC_SHOTS, type Tactic } from '@/lib/multiplayer';
import { positionNames, type Player, type Position } from '@/lib/game/types';
import {
  BUILD_OPTS, CHANCE_OPTS, DEFENSE_OPTS, MAX_PRESETS, STYLE_OPTS, DEFAULT_PROFILE, deriveTactic, describeProfile, loadTactics, presetName, saveTactics,
  type TacticProfile, type TacticStore,
} from '@/lib/tacticsProfile';
import { FIT_LABEL, FIT_TEXT, SECTOR_LABEL, SECTOR_OF, loadRoles, roleById, roleFit, roleOf, rolesFor, saveRole } from '@/lib/playerRoles';

type Key = 'style' | 'defense' | 'build' | 'chance';
type Opt = { id: string; label: string; icon: string; text: string };
const ROWS: { key: Key; title: string; hint: string; options: Opt[] }[] = [
  { key: 'style', title: 'Estilo de jogo', hint: 'Define a identidade do time. É a escolha que mais pesa na partida.', options: STYLE_OPTS },
  { key: 'defense', title: 'Abordagem defensiva', hint: 'Define até onde o time recua e onde ele marca.', options: DEFENSE_OPTS },
  { key: 'build', title: 'Construção ofensiva', hint: 'Define como a bola sai da defesa até o ataque.', options: BUILD_OPTS },
  { key: 'chance', title: 'Criação de oportunidades', hint: 'Define como o time abre a defesa do rival.', options: CHANCE_OPTS },
];
const SPOTS: Record<Position, { x: number; y: number }> = {
  GK: { x: 50, y: 86 }, LB: { x: 18, y: 68 }, RB: { x: 82, y: 68 }, CM: { x: 50, y: 52 }, LF: { x: 18, y: 32 }, RF: { x: 82, y: 32 }, CF: { x: 50, y: 14 },
};
const ORDER: Position[] = ['GK', 'LB', 'RB', 'CM', 'LF', 'RF', 'CF'];
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const nameOf = (list: Opt[], id: string) => list.find((item) => item.id === id)!;

// TACTICAL SETTINGS (modelo "Edit Tactic"): só o estilo de jogo. Formação, posições e jogadores são fixos (vêm do draft).
export function TacticalSettings({ onClose, onUse, squad }: { onClose: () => void; onUse?: (tactic: Tactic) => void; squad?: Partial<Record<Position, Player>> }) {
  const [saved, setSaved] = useState<TacticStore>(() => loadTactics());
  const [store, setStore] = useState<TacticStore>(saved);
  const [tab, setTab] = useState(saved.main);
  const [focus, setFocus] = useState<Key>('defense');
  const [note, setNote] = useState('');
  const [view, setView] = useState<'tactics' | 'roles'>('tactics');
  const filled = ORDER.filter((position) => squad?.[position]);
  const [roleSlot, setRoleSlot] = useState<Position>(filled[0] ?? 'GK');
  const [pendingRoles, setPendingRoles] = useState<Partial<Record<Position, string>>>({});
  const savedRoles = loadRoles();
  const roleIdOf = (position: Position) => pendingRoles[position] ?? roleOf(position, squad?.[position], savedRoles).role.id;
  const profile = store.presets[tab] ?? DEFAULT_PROFILE;
  const tactic = deriveTactic(profile);
  const info = TACTIC_INFO[tactic];
  const dirty = JSON.stringify(store) !== JSON.stringify(saved) || Object.keys(pendingRoles).length > 0;
  const persistRoles = () => {
    (Object.entries(pendingRoles) as [Position, string][]).forEach(([position, id]) => squad?.[position] && saveRole(position, squad[position]!, id));
    setPendingRoles({});
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const edit = (next: (current: TacticStore) => TacticStore) => {
    setNote('');
    setStore(next);
  };
  const cycle = (key: Key, dir: 1 | -1) => {
    const options = ROWS.find((row) => row.key === key)!.options;
    const index = options.findIndex((item) => item.id === profile[key]);
    const id = options[(index + dir + options.length) % options.length].id;
    edit((current) => {
      const presets = [...current.presets];
      presets[tab] = { ...(presets[tab] ?? DEFAULT_PROFILE), [key]: id } as TacticProfile;
      return { ...current, presets };
    });
  };
  const createAlt = (index: number) => {
    edit((current) => {
      const presets = [...current.presets];
      presets[index] = { ...(current.presets[tab] ?? DEFAULT_PROFILE) };
      return { ...current, presets };
    });
    setTab(index);
  };
  const removeAlt = () => {
    edit((current) => {
      const presets = [...current.presets];
      presets[tab] = null;
      return { main: current.main === tab ? 0 : current.main, presets };
    });
    setTab(0);
  };
  const save = () => {
    saveTactics(store);
    persistRoles();
    setSaved(store);
    setNote('Alterações salvas');
  };
  const discard = () => {
    setStore(saved);
    setPendingRoles({});
    if (!saved.presets[tab]) setTab(saved.main);
    setNote('Alterações descartadas');
  };

  const own = TACTIC_SHOTS[tactic].own;
  const conceded = TACTIC_SHOTS[tactic].conceded;
  const axes = {
    atk: clamp01((own + 3) / 5.5),
    def: clamp01((2.5 - conceded) / 5),
    fol: clamp01((1.45 - TACTIC_DRAIN[tactic]) / 0.6),
    per: clamp01((TACTIC_QUALITY[tactic] + 0.04) / 0.12),
  };
  const R = 38;
  const pt = (angle: number, value: number) => `${50 + Math.sin(angle) * R * value},${50 - Math.cos(angle) * R * value}`;
  const radar = [pt(0, axes.atk), pt(Math.PI / 2, axes.def), pt(Math.PI, axes.fol), pt((3 * Math.PI) / 2, axes.per)].join(' ');
  const checks: { ok: boolean; text: string }[] = [
    own >= 1.5 ? { ok: true, text: 'Cria muitas chances de gol' } : own < 0 ? { ok: false, text: 'Cria poucas chances de gol' } : { ok: true, text: 'Criação de chances estável' },
    conceded <= -1 ? { ok: true, text: 'Segura bem o rival' } : conceded > 0 ? { ok: false, text: 'Cede mais chances ao rival' } : { ok: true, text: 'Defesa sem sustos' },
    TACTIC_DRAIN[tactic] > 1.2 ? { ok: false, text: 'O time cansa bem mais rápido' } : TACTIC_DRAIN[tactic] < 1 ? { ok: true, text: 'O time cansa pouco' } : { ok: true, text: 'Desgaste normal do time' },
    TACTIC_QUALITY[tactic] > 0.03 ? { ok: true, text: 'Chutes muito perigosos' } : TACTIC_QUALITY[tactic] < 0 ? { ok: false, text: 'Chutes menos incisivos' } : { ok: true, text: 'Perigo do chute normal' },
  ];

  return createPortal(
    <div className="ts-overlay" role="dialog" aria-modal="true" aria-label="Tactical Settings">
      <style>{tacticalCss}</style>
      <div className="ts-wrap">
        <nav className="ts-nav">
          <div className="ts-views" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'tactics'} className={view === 'tactics' ? 'on' : ''} onClick={() => setView('tactics')}>Team Tactics</button>
            <button type="button" role="tab" aria-selected={view === 'roles'} className={view === 'roles' ? 'on' : ''} onClick={() => setView('roles')}>Player Roles</button>
          </div>
          <div className="ts-tabs" role="tablist" hidden={view === 'roles'}>
            {Array.from({ length: MAX_PRESETS }, (_, index) =>
              store.presets[index] ? (
                <button key={index} type="button" role="tab" aria-selected={tab === index} className={`ts-tab ${tab === index ? 'on' : ''}`} onClick={() => setTab(index)}>{presetName(index)}</button>
              ) : (
                <button key={index} type="button" className="ts-tab add" onClick={() => createAlt(index)}>+ {presetName(index)}</button>
              ),
            )}
          </div>
          <button type="button" className="ts-x" onClick={onClose} aria-label="Fechar">✕</button>
        </nav>
        <div className="ts-main">
          <section className="ts-left">
            {view === 'roles' ? (
              <div className="ts-roles">
                <h2>FUNÇÕES DOS JOGADORES</h2>
                {!filled.length ? (
                  <p className="ts-empty">Escolha jogadores no draft para definir as funções deles.</p>
                ) : (
                  <>
                    <div className="ts-meta"><span>Toque em um jogador no campo ou aqui:</span></div>
                    <div className="ts-pickers">
                      {filled.map((position) => (
                        <button key={position} type="button" className={roleSlot === position ? 'on' : ''} onClick={() => setRoleSlot(position)}>{position}</button>
                      ))}
                    </div>
                    {(() => {
                      const slot = filled.includes(roleSlot) ? roleSlot : filled[0];
                      const player = squad![slot]!;
                      const currentId = roleIdOf(slot);
                      const current = roleById(currentId)!;
                      const fit = roleFit(player, slot, current);
                      return (
                        <div className="ts-rolebox" key={slot}>
                          <div className="ts-rhead"><b>{player.name}</b><span>{SECTOR_LABEL[SECTOR_OF[slot]]} · {slot} · Overall {player.overall}</span></div>
                          <div className="ts-rlist" role="radiogroup" aria-label="Funções disponíveis">
                            {rolesFor(slot).map((role) => {
                              const roleFitValue = roleFit(player, slot, role);
                              return (
                                <button key={role.id} type="button" role="radio" aria-checked={currentId === role.id} className={`ts-role ${currentId === role.id ? 'on' : ''}`} onClick={() => setPendingRoles((c) => ({ ...c, [slot]: role.id }))}>
                                  <span className="ic" aria-hidden="true">{role.icon}</span>
                                  <span className="tx"><b>{role.name}</b><small>{role.text}</small></span>
                                  <em className={`fit ${roleFitValue}`}>{FIT_LABEL[roleFitValue]}</em>
                                </button>
                              );
                            })}
                          </div>
                          <div className="ts-rdetail" key={currentId}>
                            <div><small>FINALIDADE TÁTICA</small><b>{current.icon} {current.goal}</b></div>
                            <div><small>COMPATIBILIDADE</small><b className={`fit-t ${fit}`}>{FIT_LABEL[fit]}</b><span>{FIT_TEXT[fit]}</span></div>
                          </div>
                          <p className="ts-rnote">Baseada nas posições do jogador (principal e alternativas). A função não muda o overall.</p>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            ) : (
              <>
            <h2>{tab === 0 ? 'TÁTICA PRINCIPAL' : presetName(tab).toUpperCase()}</h2>
            <div className="ts-meta">
              {store.main === tab ? (
                <span className="ts-active">● Ativa</span>
              ) : (
                <button type="button" className="ts-link" onClick={() => edit((current) => ({ ...current, main: tab }))}>Definir como principal</button>
              )}
              {tab > 0 && <button type="button" className="ts-link bad" onClick={removeAlt}>Excluir</button>}
            </div>
            <div className="ts-rows">
              <div className="ts-row static"><span>Predefinição</span><b>{info.label}</b></div>
              <div className="ts-row static locked" title="A formação é fixa no draft"><span>Formação</span><b>🔒 1-2-1-3 FIXA</b></div>
              {ROWS.map((row) => {
                const option = nameOf(row.options, profile[row.key]);
                const index = row.options.findIndex((item) => item.id === option.id);
                return focus === row.key ? (
                  <div key={row.key} className="ts-focus">
                    <div className="ts-ft">
                      <b>{row.title}</b>
                      <div className="ts-sel">
                        <button type="button" aria-label="Anterior" onClick={() => cycle(row.key, -1)}>◀</button>
                        <span key={option.id}>{option.label}</span>
                        <button type="button" aria-label="Próxima" onClick={() => cycle(row.key, 1)}>▶</button>
                      </div>
                    </div>
                    <p>{row.hint}</p>
                    <p className="ts-opt-text"><span aria-hidden="true">{option.icon}</span> {option.text}</p>
                    <div className="ts-slider" role="radiogroup" aria-label={row.title}>
                      <i className="ts-fill" style={{ width: `${(index / (row.options.length - 1)) * 100}%` }} />
                      {row.options.map((item, i) => (
                        <button key={item.id} type="button" role="radio" aria-checked={i === index} className={`ts-dot ${i <= index ? 'on' : ''}`} style={{ left: `${(i / (row.options.length - 1)) * 100}%` }} onClick={() => edit((current) => {
                          const presets = [...current.presets];
                          presets[tab] = { ...(presets[tab] ?? DEFAULT_PROFILE), [row.key]: item.id } as TacticProfile;
                          return { ...current, presets };
                        })}><em>{item.label}</em></button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button key={row.key} type="button" className="ts-row" onClick={() => setFocus(row.key)}>
                    <span>{row.title}</span><b>{option.label}</b>
                  </button>
                );
              })}
            </div>
              </>
            )}
            <div className="ts-save">
              <button type="button" className="ts-savebtn" disabled={!dirty} onClick={save}>● Salvar alterações</button>
              <button type="button" className="ts-ghost" disabled={!dirty} onClick={discard}>Descartar</button>
              {onUse && <button type="button" className="ts-savebtn use" onClick={() => { saveTactics(store); persistRoles(); onUse(tactic); onClose(); }}>Usar na partida</button>}
              <span className="ts-note" key={note}>{note}</span>
            </div>
          </section>
          <section className="ts-right">
            <div className="ts-viewh">{view === 'roles' ? <><b>Funções no campo</b><span>A formação é fixa: você só escolhe como cada jogador atua.</span></> : <><b>{info.icon} {info.label}</b><span>{describeProfile(profile)}</span></>}</div>
            <div className="ts-pitch" aria-label="Formação fixa 1-2-1-3">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon points="19,0 81,0 100,100 0,100" className="ts-turf" />
                <g className="ts-lines">
                  <polygon points="19,0 81,0 100,100 0,100" />
                  <line x1="9.5" y1="50" x2="90.5" y2="50" />
                  <polygon points="36,0 64,0 67,17 33,17" />
                  <polygon points="24,100 76,100 72,82 28,82" />
                  <ellipse cx="50" cy="50" rx="11" ry="7" />
                </g>
              </svg>
              {ORDER.map((position) => {
                const spot = SPOTS[position];
                const scale = 0.62 + 0.38 * (spot.y / 100);
                const player = squad?.[position];
                return (
                  <div
                    key={position}
                    className={`ts-plate ${view === 'roles' && player ? 'pick' : ''} ${view === 'roles' && roleSlot === position ? 'sel' : ''}`}
                    style={{ left: `${50 + (spot.x - 50) * scale}%`, top: `${spot.y}%` }}
                    role={view === 'roles' && player ? 'button' : undefined}
                    tabIndex={view === 'roles' && player ? 0 : undefined}
                    onClick={() => view === 'roles' && player && setRoleSlot(position)}
                    onKeyDown={(event) => event.key === 'Enter' && view === 'roles' && player && setRoleSlot(position)}
                  >
                    <b>{player ? player.name : positionNames[position]}</b>
                    <span>{player ? `${position} · ${player.overall}` : position}</span>
                    {view === 'roles' && player && <i>{roleById(roleIdOf(position))!.icon} {roleById(roleIdOf(position))!.name}</i>}
                  </div>
                );
              })}
              <small className="ts-fixed">🔒 Posições fixas</small>
            </div>
            <div className="ts-analysis" hidden={view === 'roles'}>
              <ul>
                {checks.map((check) => (
                  <li key={check.text} className={check.ok ? 'ok' : 'warn'}><i aria-hidden="true">{check.ok ? '✓' : '!'}</i>{check.text}</li>
                ))}
              </ul>
              <div className="ts-radar">
                <small>Análise tática</small>
                <svg viewBox="-12 -10 124 120" role="img" aria-label="Análise tática do estilo escolhido">
                  <polygon points="50,12 88,50 50,88 12,50" className="ts-ring" />
                  <polygon points="50,31 69,50 50,69 31,50" className="ts-ring" />
                  <line x1="50" y1="12" x2="50" y2="88" className="ts-ring" /><line x1="12" y1="50" x2="88" y2="50" className="ts-ring" />
                  <polygon points={radar} className="ts-shape" />
                  <text x="50" y="6" textAnchor="middle">ATQ</text><text x="98" y="53" textAnchor="middle">DEF</text>
                  <text x="50" y="104" textAnchor="middle">FÔL</text><text x="2" y="53" textAnchor="middle">PER</text>
                </svg>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const tacticalCss = `
.ts-overlay { position: fixed; inset: 0; z-index: 90; overflow-y: auto; color: #fff; padding: 14px; background: radial-gradient(90% 70% at 20% 0%, rgba(58,98,170,.45) 0, rgba(11,20,44,.96) 55%, #04070f 100%); animation: ts-in .35s ease-out; }
.ts-wrap { width: min(1120px, 100%); margin: 0 auto; padding-bottom: 36px; }
.ts-nav { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,.12); }
.ts-nav > b { font-size: 15px; letter-spacing: .5px; padding-right: 14px; border-right: 1px solid rgba(255,255,255,.2); }
.ts-tabs { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
.ts-tab { padding: 8px 12px; font-size: 13px; font-weight: 700; color: rgba(255,255,255,.65); background: none; border: 0; border-bottom: 2px solid transparent; cursor: pointer; transition: color .2s, border-color .2s; }
.ts-tab.on { color: #fff; border-bottom-color: #F5B800; }
.ts-tab.add { font-weight: 600; opacity: .55; }
.ts-x { width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.06); color: #fff; cursor: pointer; margin-left: auto; }
.ts-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; margin-top: 18px; }
.ts-left h2 { margin: 0; font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 44px; line-height: 1; letter-spacing: 1.5px; }
.ts-meta { display: flex; gap: 14px; align-items: center; margin: 6px 0 14px; font-size: 12px; }
.ts-active { color: #37d67a; font-weight: 700; }
.ts-link { background: none; border: 0; padding: 0; color: #F5B800; cursor: pointer; font-size: 12px; text-decoration: underline; }
.ts-link.bad { color: #ff9a8a; }
.ts-rows { display: grid; }
.ts-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 8px; font-size: 14px; text-align: left; color: #fff; background: none; border: 0; border-bottom: 1px solid rgba(255,255,255,.14); cursor: pointer; transition: background .2s; }
.ts-row:hover { background: rgba(255,255,255,.05); }
.ts-row span { opacity: .9; }
.ts-row b { font-size: 12px; letter-spacing: 1px; text-transform: uppercase; text-align: right; }
.ts-row.static { cursor: default; }
.ts-row.static:hover { background: none; }
.ts-row.locked { opacity: .6; }
.ts-focus { margin: 6px 0; padding: 14px 16px 22px; border-radius: 14px; border: 1px solid rgba(255,255,255,.28); background: linear-gradient(160deg, rgba(120,150,210,.28), rgba(30,44,86,.55)); box-shadow: 0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.18); animation: ts-in .3s ease-out; }
.ts-ft { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.ts-ft > b { font-size: 16px; }
.ts-sel { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
.ts-sel button { width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.08); color: #fff; font-size: 11px; cursor: pointer; transition: background .2s, transform .2s; }
.ts-sel button:hover { background: rgba(245,184,0,.3); transform: scale(1.08); }
.ts-sel span { min-width: 96px; text-align: center; animation: ts-in .25s ease-out; }
.ts-focus p { margin: 8px 0 0; font-size: 12px; line-height: 1.45; opacity: .78; }
.ts-focus .ts-opt-text { opacity: 1; color: #F5B800; font-weight: 700; }
.ts-slider { position: relative; height: 6px; margin: 22px 14px 26px; border-radius: 99px; background: rgba(255,255,255,.2); }
.ts-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #c98a00, #F5B800); box-shadow: 0 0 12px rgba(245,184,0,.6); transition: width .35s cubic-bezier(.2,.8,.2,1); }
.ts-dot { position: absolute; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; padding: 0; border-radius: 50%; border: 2px solid rgba(255,255,255,.6); background: #172447; cursor: pointer; transition: all .3s; }
.ts-dot.on { border-color: #F5B800; background: #F5B800; box-shadow: 0 0 10px rgba(245,184,0,.8); }
.ts-dot[aria-checked="true"] { transform: scale(1.25); background: #fff; }
.ts-dot em { color: #fff; position: absolute; top: 22px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 9.5px; font-weight: 700; white-space: nowrap; opacity: .7; }
.ts-dot:first-of-type em { transform: none; left: -4px; } .ts-dot:last-of-type em { transform: none; left: auto; right: -4px; }
.ts-save { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 22px; }
.ts-savebtn { padding: 12px 20px; border-radius: 10px; font-weight: 800; font-size: 13px; color: #10162a; border: 0; cursor: pointer; background: linear-gradient(180deg, #fff, #cfd8ee); box-shadow: 0 0 22px rgba(190,210,255,.35); transition: opacity .2s, transform .2s; }
.ts-savebtn.use { background: linear-gradient(180deg, #ffd24d, #F5B800); box-shadow: 0 0 22px rgba(245,184,0,.4); }
.ts-savebtn:disabled { opacity: .35; box-shadow: none; cursor: default; }
.ts-savebtn:not(:disabled):hover { transform: translateY(-2px); }
.ts-ghost { background: none; border: 1px solid rgba(255,255,255,.3); color: #fff; padding: 11px 16px; border-radius: 10px; font-size: 12px; cursor: pointer; }
.ts-ghost:disabled { opacity: .35; cursor: default; }
.ts-note { font-size: 12px; color: #37d67a; animation: ts-in .3s ease-out; }
.ts-viewh { text-align: center; margin-bottom: 10px; }
.ts-viewh b { display: block; font-size: 20px; }
.ts-viewh span { display: block; margin-top: 4px; font-size: 12px; opacity: .72; line-height: 1.4; }
.ts-pitch { position: relative; width: 100%; aspect-ratio: 1.35; }
.ts-pitch svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.ts-turf { fill: rgba(20,60,50,.45); }
.ts-lines * { fill: none; stroke: rgba(255,255,255,.5); stroke-width: 1; vector-effect: non-scaling-stroke; }
.ts-plate { position: absolute; transform: translate(-50%, -50%); min-width: 74px; max-width: 24%; padding: 6px 8px 8px; text-align: center; background: rgba(8,12,22,.88); border: 1px solid rgba(255,255,255,.18); clip-path: polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%); transition: transform .3s; }
.ts-plate b { display: block; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ts-plate span { display: block; margin-top: 2px; font-size: 10px; color: #F5B800; font-weight: 800; }
.ts-fixed { position: absolute; right: 4px; bottom: 4px; font-size: 10px; opacity: .6; }
.ts-analysis { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; align-items: center; margin-top: 14px; }
.ts-analysis ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; font-size: 12px; flex: 1; min-width: 200px; }
.ts-analysis li { display: flex; gap: 8px; align-items: center; }
.ts-analysis li i { font-style: normal; font-weight: 900; width: 16px; text-align: center; }
.ts-analysis li.ok i { color: #37d67a; } .ts-analysis li.warn i { color: #F5B800; }
.ts-radar { width: 150px; text-align: center; }
.ts-radar small { display: block; font-size: 11px; opacity: .75; margin-bottom: 2px; }
.ts-radar svg { width: 100%; }
.ts-ring { fill: none; stroke: rgba(255,255,255,.28); stroke-width: .8; }
.ts-shape { fill: rgba(245,184,0,.35); stroke: #F5B800; stroke-width: 1.4; transition: all .5s; }
.ts-radar text { fill: #fff; font-size: 8px; font-weight: 700; }

.ts-views { display: flex; gap: 4px; padding-right: 14px; border-right: 1px solid rgba(255,255,255,.2); }
.ts-views button { background: none; border: 0; color: rgba(255,255,255,.6); font-size: 14px; font-weight: 800; padding: 8px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
.ts-views button.on { color: #fff; border-bottom-color: #F5B800; }
.ts-roles h2 { margin: 0 0 8px; font-family: 'Bebas Neue', Inter, sans-serif; font-weight: 400; font-size: 36px; letter-spacing: 1.5px; }
.ts-empty { opacity: .7; font-size: 13px; }
.ts-pickers { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.ts-pickers button { padding: 7px 12px; border-radius: 99px; font-size: 11px; font-weight: 900; color: #fff; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.05); cursor: pointer; transition: all .2s; }
.ts-pickers button.on { border-color: #F5B800; background: rgba(245,184,0,.25); color: #F5B800; }
.ts-rhead { margin-bottom: 8px; } .ts-rhead b { display: block; font-size: 18px; } .ts-rhead span { font-size: 12px; opacity: .7; }
.ts-rlist { display: grid; gap: 8px; }
.ts-role { display: flex; align-items: center; gap: 10px; padding: 10px 12px; text-align: left; color: #fff; cursor: pointer; border-radius: 12px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.05); transition: all .25s; }
.ts-role:hover { background: rgba(255,255,255,.09); }
.ts-role .ic { font-size: 24px; flex: none; transition: transform .3s; }
.ts-role .tx { flex: 1; min-width: 0; } .ts-role .tx b { display: block; font-size: 13px; } .ts-role .tx small { display: block; font-size: 11px; opacity: .7; line-height: 1.3; margin-top: 2px; }
.ts-role .fit { flex: none; font-style: normal; font-size: 9px; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; padding: 3px 7px; border-radius: 99px; }
.fit.ideal { background: rgba(55,214,122,.18); color: #37d67a; } .fit.compativel { background: rgba(245,184,0,.18); color: #F5B800; } .fit.alternativa { background: rgba(255,255,255,.1); color: #c7cfdd; }
.ts-role.on { border-color: #F5B800; background: linear-gradient(160deg, rgba(120,150,210,.3), rgba(245,184,0,.14)); box-shadow: 0 0 0 1px #F5B800, 0 8px 22px rgba(245,184,0,.2); }
.ts-role.on .ic { transform: scale(1.18); filter: drop-shadow(0 0 8px rgba(245,184,0,.8)); }
.ts-rdetail { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; padding: 12px; border-radius: 12px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1); animation: ts-in .25s ease-out; }
.ts-rdetail small { display: block; font-size: 9px; letter-spacing: 2px; opacity: .6; margin-bottom: 4px; } .ts-rdetail b { display: block; font-size: 13px; } .ts-rdetail span { display: block; margin-top: 3px; font-size: 11px; opacity: .72; }
.fit-t.ideal { color: #37d67a; } .fit-t.compativel { color: #F5B800; } .fit-t.alternativa { color: #c7cfdd; }
.ts-rnote { margin: 8px 0 0; font-size: 11px; opacity: .55; }
.ts-plate i { display: block; margin-top: 2px; font-style: normal; font-size: 9px; font-weight: 700; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ts-plate.pick { cursor: pointer; } .ts-plate.pick:hover { transform: translate(-50%, -54%); }
.ts-plate.sel { border-color: #F5B800; box-shadow: 0 0 14px rgba(245,184,0,.55); background: rgba(40,30,4,.92); }
@media (max-width: 560px) { .ts-rdetail { grid-template-columns: 1fr; } .ts-role .fit { display: none; } .ts-plate i { display: none; } .ts-nav > .ts-views { border-right: 0; } }
.ts-tabs[hidden], .ts-analysis[hidden] { display: none; }
@keyframes ts-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (min-width: 900px) { .ts-main { grid-template-columns: 400px minmax(0, 1fr); } }
@media (max-width: 560px) {
  .ts-left h2 { font-size: 36px; }
  .ts-plate { min-width: 58px; padding: 4px 4px 7px; } .ts-plate b { font-size: 9.5px; } .ts-plate span { font-size: 9px; }
  .ts-sel span { min-width: 80px; }
}
@media (prefers-reduced-motion: reduce) { .ts-overlay, .ts-focus, .ts-sel span, .ts-note, .ts-fill, .ts-shape, .ts-dot { animation: none; transition: none; } }
`;
