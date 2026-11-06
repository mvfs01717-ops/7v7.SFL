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

// Escolha da tática depois do draft (o rival só descobre a sua na animação da escalação)
export function TacticPicker({
  squad,
  onPick,
}: {
  squad: Partial<Record<Position, Player>>;
  onPick: (tactic: Tactic, captain: string) => void;
}) {
  const [chosen, setChosen] = useState<Tactic>('equilibrada');
  const members = positions.flatMap((position) => (squad[position] ? [{ position, player: squad[position] as Player }] : []));
  // Por padrão o capitão é o jogador de maior overall
  const [captain, setCaptain] = useState<string>(
    [...members].sort((a, b) => b.player.overall - a.player.overall)[0]?.player.id ?? '',
  );
  const bonusFor = (player: Player) => captainTeamBonus(player.overall);
  return (
    <div
      role="dialog"
      aria-label="Escolha a tática"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        overflowY: 'auto',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(5,8,12,.96)',
      }}
    >
      <div style={{ width: 'min(460px, 100%)', textAlign: 'center' }}>
        <div className="eyebrow">ANTES DA PARTIDA</div>
        <h2 style={{ margin: '6px 0 4px' }}>ESCOLHA A TÁTICA</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, opacity: 0.7 }}>O rival não vê a sua escolha até a bola rolar.</p>
        <div style={{ display: 'grid', gap: 10, textAlign: 'left' }}>
          {TACTICS.map((tactic) => {
            const info = TACTIC_INFO[tactic];
            const on = chosen === tactic;
            return (
              <button
                key={tactic}
                type="button"
                onClick={() => setChosen(tactic)}
                aria-pressed={on}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  borderRadius: 8,
                  border: `1px solid ${on ? '#F5B800' : '#343d47'}`,
                  background: on ? '#19180f' : '#10161d',
                  color: '#f4f4f0',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 28 }} aria-hidden="true">{info.icon}</span>
                <span style={{ flex: 1 }}>
                  <b style={{ display: 'block', fontSize: 15, color: on ? '#F5B800' : undefined }}>{info.label}</b>
                  <small style={{ opacity: 0.75, fontSize: 12 }}>{info.text}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 22, textAlign: 'left' }}>
          <div className="eyebrow" style={{ textAlign: 'center' }}>BRAÇADEIRA</div>
          <h2 style={{ margin: '6px 0 4px', textAlign: 'center' }}>ESCOLHA O CAPITÃO</h2>
          <div
            style={{
              margin: '0 0 12px',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #343d47',
              background: '#10161d',
              fontSize: 12,
              lineHeight: 1.55,
              opacity: 0.9,
            }}
          >
            <b style={{ color: '#F5B800' }}>Como funciona:</b> o capitão rende <b>+{CAPTAIN_SELF_BONUS} de overall</b> e lidera o time,
            dando um bônus a todos os companheiros: <b>+0,5</b> se ele tem menos de 80 de overall, <b>+1</b> se tem 80 ou mais e <b>+1,5</b> se
            tem 90 ou mais. O bônus vale no cálculo da partida (chances de gol e duelos), não muda o número da carta. O capitão fica em campo
            o jogo todo e não pode ser substituído no intervalo. O bot também escolhe o melhor jogador dele como capitão.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {members.map(({ position, player }) => {
              const on = captain === player.id;
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setCaptain(player.id)}
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
                  }}
                >
                  <b style={{ minWidth: 30, color: '#F5B800' }}>{position}</b>
                  <span style={{ flex: 1 }}>
                    {player.name}
                    {on && <b style={{ color: '#F5B800' }}> ©</b>}
                  </span>
                  <strong>{player.overall}</strong>
                  <small style={{ minWidth: 92, textAlign: 'right', opacity: 0.8 }}>
                    +{CAPTAIN_SELF_BONUS} ele · +{String(bonusFor(player)).replace(".", ",")} time
                  </small>
                </button>
              );
            })}
          </div>
        </div>
        <button
          className="gold-button large lobby-main"
          style={{ marginTop: 16 }}
          onClick={() => onPick(chosen, captain)}
        >
          Confirmar tática e capitão
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
    return !!first && !!second && a !== b && getPlayerPositions(first).includes(b) && getPlayerPositions(second).includes(a);
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
            Toque em um jogador e depois em outro para trocar de posição. Só dá para trocar quando os dois têm aptidão
            na posição um do outro (principal ou secundária).
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
