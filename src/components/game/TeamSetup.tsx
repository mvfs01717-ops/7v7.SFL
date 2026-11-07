import { useState } from 'react';
import { average, getPlayerPositions } from '@/lib/game/helpers';
import { positions, type Player, type Position, type Team } from '@/lib/game/types';
import { CAPTAIN_SELF_BONUS, SUBS_MAX, TACTICS, TACTIC_INFO, captainTeamBonus, type Tactic } from '@/lib/multiplayer';
import { TeamMark } from '@/components/game/Card';

// Escolha do banco depois do draft (só contra o bot): o jogador monta os 3 reservas que podem entrar no intervalo
export function BenchPicker({ candidates, onConfirm }: { candidates: Player[]; onConfirm: (bench: Player[]) => void }) {
  const BENCH_SIZE = 3;
  const need = Math.min(BENCH_SIZE, candidates.length);
  const [picked, setPicked] = useState<string[]>([]);
  const groups: { title: string; positions: Position[] }[] = [
    { title: 'DEFESA', positions: ['LB', 'RB'] },
    { title: 'MEIO', positions: ['CM'] },
    { title: 'ATAQUE', positions: ['LF', 'RF', 'CF'] },
  ];
  const seen = new Set<string>();
  const sections = groups.map((group) => ({
    ...group,
    list: candidates.filter((player) => {
      if (seen.has(player.id) || !getPlayerPositions(player).some((position) => group.positions.includes(position))) return false;
      seen.add(player.id);
      return true;
    }),
  }));
  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length < need ? [...current, id] : current));
  const randomBench = () =>
    setPicked([...candidates].sort(() => Math.random() - 0.5).slice(0, need).map((player) => player.id));
  return (
    <div
      role="dialog"
      aria-label="Escolha o banco"
      style={{ position: 'fixed', inset: 0, zIndex: 80, overflowY: 'auto', display: 'grid', placeItems: 'start center', padding: 16, background: 'rgba(5,8,12,.96)' }}
    >
      <div style={{ width: 'min(560px, 100%)', textAlign: 'center', margin: 'auto' }}>
        <div className="eyebrow">ANTES DA PARTIDA</div>
        <h2 style={{ margin: '6px 0 4px' }}>ESCOLHA O BANCO</h2>
        <p style={{ margin: '0 0 6px', fontSize: 13, opacity: 0.8 }}>
          Escolha {need} reservas. No intervalo você pode trocar até {SUBS_MAX} jogadores por eles. Reserva chega com o fôlego cheio, mas
          fora da posição dele perde 5 pontos.
        </p>
        <b style={{ color: '#F5B800' }}>
          {picked.length}/{need} escolhidos
        </b>
        {sections.map((section) =>
          section.list.length ? (
            <div key={section.title} style={{ marginTop: 14, textAlign: 'left' }}>
              <div className="eyebrow">{section.title}</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                {section.list.map((player) => {
                  const on = picked.includes(player.id);
                  const full = !on && picked.length >= need;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => toggle(player.id)}
                      disabled={full}
                      aria-pressed={on}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1px solid ${on ? '#F5B800' : '#343d47'}`,
                        background: on ? '#19180f' : '#10161d',
                        color: '#f4f4f0',
                        textAlign: 'left',
                        opacity: full ? 0.45 : 1,
                      }}
                    >
                      <b style={{ minWidth: 30, color: '#F5B800' }}>{player.primary_position}</b>
                      <span style={{ flex: 1 }}>
                        {player.name}
                        <small style={{ display: 'block', opacity: 0.7 }}>{getPlayerPositions(player).join(' · ')}</small>
                      </span>
                      <strong>{player.overall}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null,
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className="outline-button" onClick={randomBench}>
            Sortear para mim
          </button>
          <button
            type="button"
            className="gold-button large"
            disabled={picked.length < need}
            onClick={() => onConfirm(candidates.filter((player) => picked.includes(player.id)))}
          >
            Confirmar banco
          </button>
        </div>
      </div>
    </div>
  );
}

export const setupCss = `
.tc { display: grid; gap: 16px; text-align: left; }
.tc-h { display: flex; align-items: baseline; gap: 10px; margin: 0 0 8px; }
.tc-h b { font-size: 12px; letter-spacing: 3px; color: #F5B800; font-weight: 900; }
.tc-h span { font-size: 12px; opacity: .65; }
.tc-tactics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.tc-t { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 10px 12px; text-align: center; border-radius: 6px 16px 6px 16px; cursor: pointer; color: #f4f4f0;
  border: 1px solid rgba(255,255,255,.14); background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); transition: transform .2s, border-color .2s, box-shadow .2s; }
.tc-t:hover { transform: translateY(-2px); }
.tc-t .ic { font-size: 30px; line-height: 1; }
.tc-t b { font-size: 14px; letter-spacing: 1.5px; text-transform: uppercase; }
.tc-t small { font-size: 11px; line-height: 1.3; opacity: .7; }
.tc-t.on { border-color: #F5B800; background: linear-gradient(180deg, rgba(245,184,0,.3), rgba(245,184,0,.05)); box-shadow: 0 0 0 1px #F5B800, 0 8px 24px rgba(245,184,0,.25); }
.tc-t.on b { color: #F5B800; }
.tc-caps { display: flex; flex-wrap: wrap; gap: 8px; }
.tc-c { display: flex; align-items: center; gap: 8px; padding: 8px 12px 8px 8px; border-radius: 999px; cursor: pointer; color: #f4f4f0; min-width: 0;
  border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); transition: transform .2s, border-color .2s, box-shadow .2s; }
.tc-c:hover { transform: translateY(-2px); }
.tc-c i { font-style: normal; flex: none; min-width: 30px; text-align: center; padding: 5px 0; border-radius: 999px; background: #F5B800; color: #1a1200; font-weight: 900; font-size: 11px; }
.tc-c span { font-weight: 800; font-size: 13px; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-c strong { font-size: 14px; opacity: .85; }
.tc-c.on { border-color: #F5B800; background: linear-gradient(90deg, rgba(245,184,0,.32), rgba(245,184,0,.06)); box-shadow: 0 0 0 1px #F5B800, 0 0 18px rgba(245,184,0,.3); }
.tc-c.on span::after { content: ' ©'; color: #F5B800; }
.tc-info { font-size: 12px; line-height: 1.5; opacity: .8; padding: 10px 12px; border-radius: 10px; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.1); }
.tc-info b { color: #F5B800; }
@media (max-width: 560px) { .tc-t { padding: 12px 6px 10px; } .tc-t small { font-size: 10px; } .tc-t .ic { font-size: 26px; } .tc-c span { max-width: 84px; } }
`;

export function bestCaptainId(squad: Partial<Record<Position, Player>>): string {
  const members = positions.flatMap((position) => (squad[position] ? [squad[position] as Player] : []));
  return [...members].sort((a, b) => b.overall - a.overall)[0]?.id ?? '';
}

// Tática + capitão (usado dentro da escalação e no fallback do Modo Dado)
export function TacticCaptainPanel({
  squad,
  tactic,
  captain,
  onTactic,
  onCaptain,
}: {
  squad: Partial<Record<Position, Player>>;
  tactic: Tactic;
  captain: string;
  onTactic: (tactic: Tactic) => void;
  onCaptain: (id: string) => void;
}) {
  const members = positions.flatMap((position) => (squad[position] ? [{ position, player: squad[position] as Player }] : []));
  const chosenCaptain = members.find((member) => member.player.id === captain)?.player;
  return (
    <div className="tc">
      <style>{setupCss}</style>
      <div>
        <div className="tc-h">
          <b>TÁTICA</b>
          <span>O rival só descobre a sua na apresentação.</span>
        </div>
        <div className="tc-tactics">
          {TACTICS.map((item) => {
            const info = TACTIC_INFO[item];
            return (
              <button key={item} type="button" className={`tc-t ${tactic === item ? 'on' : ''}`} aria-pressed={tactic === item} onClick={() => onTactic(item)}>
                <span className="ic" aria-hidden="true">{info.icon}</span>
                <b>{info.label}</b>
                <small>{info.text}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="tc-h">
          <b>CAPITÃO</b>
          <span>{chosenCaptain ? `${chosenCaptain.name}: +${CAPTAIN_SELF_BONUS} nele · +${String(captainTeamBonus(chosenCaptain.overall)).replace('.', ',')} no time` : 'Escolha quem leva a braçadeira.'}</span>
        </div>
        <div className="tc-caps">
          {members.map(({ position, player }) => (
            <button key={player.id} type="button" className={`tc-c ${captain === player.id ? 'on' : ''}`} aria-pressed={captain === player.id} onClick={() => onCaptain(player.id)}>
              <i>{position}</i>
              <span>{player.name}</span>
              <strong>{player.overall}</strong>
            </button>
          ))}
        </div>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, opacity: 0.7, cursor: 'pointer' }}>Como funciona o capitão?</summary>
          <div className="tc-info" style={{ marginTop: 6 }}>
            O capitão rende <b>+{CAPTAIN_SELF_BONUS} de overall</b> e dá um bônus a todos os companheiros: <b>+0,5</b> se ele tem menos de 80,
            <b> +1</b> se tem 80 ou mais e <b>+1,5</b> se tem 90 ou mais. O bônus vale no cálculo da partida, não muda o número da carta. Ele fica em
            campo o jogo todo e não pode ser substituído no intervalo. O bot também escolhe o melhor jogador dele.
          </div>
        </details>
      </div>
    </div>
  );
}

// Fallback (Modo Dado): tática e capitão em tela própria
export function TacticPicker({
  squad,
  onPick,
}: {
  squad: Partial<Record<Position, Player>>;
  onPick: (tactic: Tactic, captain: string) => void;
}) {
  const [chosen, setChosen] = useState<Tactic>('equilibrada');
  const [captain, setCaptain] = useState<string>(bestCaptainId(squad));
  return (
    <div
      role="dialog"
      aria-label="Escolha a tática"
      style={{ position: 'fixed', inset: 0, zIndex: 80, overflowY: 'auto', display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(5,8,12,.97)' }}
    >
      <div style={{ width: 'min(560px, 100%)' }}>
        <div className="eyebrow" style={{ justifyContent: 'center' }}>ANTES DA PARTIDA</div>
        <h2 style={{ margin: '6px 0 16px', textAlign: 'center', fontStyle: 'italic' }}>TÁTICA E CAPITÃO</h2>
        <TacticCaptainPanel squad={squad} tactic={chosen} captain={captain} onTactic={setChosen} onCaptain={setCaptain} />
        <button className="gold-button large lobby-main" style={{ marginTop: 18 }} onClick={() => onPick(chosen, captain)}>
          Confirmar
        </button>
      </div>
    </div>
  );
}

// Multiplayer: ajusta em que posição cada jogador joga, usando a posição principal ou as secundárias dele
export function PositionEditor({
  club,
  selected,
  onSwap,
  onConfirm,
}: {
  club: Team;
  selected: Partial<Record<Position, Player>>;
  onSwap: (a: Position, b: Position) => void;
  onConfirm: () => void;
}) {
  const [from, setFrom] = useState<Position | null>(null);
  const canSwap = (a: Position, b: Position) => {
    const first = selected[a];
    const second = selected[b];
    return !!first && !!second && a !== b;
  };
  const anyMove = positions.some((a) => positions.some((b) => canSwap(a, b)));

  function tap(position: Position) {
    if (from === null) {
      setFrom(position);
      return;
    }
    if (from === position) {
      setFrom(null);
      return;
    }
    if (canSwap(from, position)) {
      onSwap(from, position);
      setFrom(null);
      return;
    }
    setFrom(position);
  }

  return (
    <main className="draft-page">
      <div className="draft-head">
        <div>
          <div className="eyebrow">ÚLTIMA ETAPA · AJUSTE SEU TIME</div>
          <h2>
            POSIÇÕES <em>{club.abbreviation}</em>
          </h2>
        </div>
        <div className="draft-progress">
          <strong>7</strong>
          <span>/ 7 jogadores</span>
        </div>
      </div>
      <div className="draft-layout">
        <section className="draft-picker">
          <p style={{ margin: '0 0 12px', opacity: 0.8, fontSize: 14 }}>
            Toque em um jogador e depois em outro para trocar de posição. Fora da posição de origem (principal ou
            secundária) o jogador perde 5 de overall.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {positions.map((position) => {
              const player = selected[position];
              if (!player) return null;
              const isFrom = from === position;
              const target = from !== null && !isFrom && canSwap(from, position);
              const blocked = from !== null && !isFrom && !target;
              const outOfPlace = player.primary_position !== position;
              return (
                <button
                  key={position}
                  type="button"
                  onClick={() => tap(position)}
                  aria-pressed={isFrom}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    textAlign: 'left',
                    color: 'inherit',
                    cursor: 'pointer',
                    background: isFrom ? 'rgba(245,184,0,.16)' : target ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${isFrom ? '#F5B800' : target ? '#22c55e' : 'rgba(255,255,255,.12)'}`,
                    opacity: blocked ? 0.45 : 1,
                  }}
                >
                  <b
                    style={{
                      flex: '0 0 44px',
                      textAlign: 'center',
                      padding: '6px 0',
                      borderRadius: 8,
                      background: '#F5B800',
                      color: '#0B1016',
                      fontSize: 14,
                    }}
                  >
                    {position}
                  </b>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.name}
                    </span>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {getPlayerPositions(player).map((item, index) => (
                        <small
                          key={item}
                          style={{
                            padding: '1px 6px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: item === position ? 'rgba(245,184,0,.25)' : 'rgba(255,255,255,.08)',
                            border: index === 0 ? '1px solid rgba(255,255,255,.35)' : '1px solid transparent',
                          }}
                          title={index === 0 ? 'Posição principal' : 'Posição secundária'}
                        >
                          {item}
                        </small>
                      ))}
                      {outOfPlace && <small style={{ fontSize: 11, opacity: 0.7 }}>jogando de secundária</small>}
                    </span>
                  </span>
                  <strong style={{ fontSize: 20 }}>{player.overall}</strong>
                </button>
              );
            })}
          </div>
          {!anyMove && (
            <div className="empty-state" style={{ marginTop: 12 }}>
              Nenhum jogador do seu time tem aptidão para trocar de posição.
            </div>
          )}
          <button className="gold-button large lobby-main" onClick={onConfirm}>
            Confirmar time
          </button>
        </section>
        <DraftPitch club={club} selected={selected} />
      </div>
    </main>
  );
}

export function DraftPitch({ club, selected }: { club: Team; selected: Partial<Record<Position, Player>> }) {
  const spots: Record<Position, string> = {
    GK: 'spot-gk',
    LB: 'spot-lb',
    RB: 'spot-rb',
    CM: 'spot-cm',
    LF: 'spot-lf',
    RF: 'spot-rf',
    CF: 'spot-cf',
  };
  return (
    <aside className="pitch-wrap">
      <div className="pitch-label">
        <span>SEU TIME</span>
        <TeamMark team={club} />
      </div>
      <div className="pitch">
        <div className="pitch-lines" />
        {positions.map((position) => (
          <div key={position} className={`pitch-spot ${spots[position]}`}>
            {selected[position] ? (
              <>
                <span className="pitch-rating">{selected[position]?.overall}</span>
                <span className="pitch-avatar">{selected[position]?.name.slice(0, 1)}</span>
                <b>{selected[position]?.name}</b>
              </>
            ) : (
              <>
                <span className="plus">+</span>
                <b>{position}</b>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="pitch-average">
        OVERALL MÉDIO <strong>{average(Object.values(selected).filter(Boolean) as Player[]) || '—'}</strong>
      </div>
    </aside>
  );
}
