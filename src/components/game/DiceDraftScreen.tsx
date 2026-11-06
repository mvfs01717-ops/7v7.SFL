import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { getPlayerPositions } from '@/lib/game/helpers';
import { positions, type Player, type Position, type Team } from '@/lib/game/types';
import { Card, TeamMark } from '@/components/game/Card';
import { DraftPitch } from '@/components/game/TeamSetup';

export const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Modo Dado: a cada escolha você rola um dado que sorteia de qual clube vêm as cartas
export function DiceDraftScreen({
  club,
  teams,
  players,
  selected,
  blockedIds,
  onPick,
  rerollsLeft,
  onUseReroll,
  onBack,
}: {
  club: Team;
  teams: Team[];
  players: Player[];
  selected: Partial<Record<Position, Player>>;
  blockedIds?: Set<string>;
  onPick: (player: Player, position: Position) => void;
  rerollsLeft: number;
  onUseReroll: () => void;
  onBack: () => void;
}) {
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(1);
  const [rolledId, setRolledId] = useState<string | null>(null);
  const [pending, setPending] = useState<Player | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const chosen = Object.values(selected).filter(Boolean) as Player[];
  const pickedIds = new Set(chosen.map((player) => player.id));
  const openPositions = positions.filter((position) => !selected[position]);
  const slotsFor = (player: Player) =>
    openPositions.filter((position) => getPlayerPositions(player).includes(position));
  // No multiplayer, esconde quem o adversário já escolheu (se ainda sobrar opção)
  const avoid = blockedIds ?? new Set<string>();
  const hasFree = players.some(
    (player) => !pickedIds.has(player.id) && !avoid.has(player.id) && slotsFor(player).length > 0,
  );
  const squadOf = (team: Team) =>
    players.filter(
      (player) =>
        player.team_id === team.id && !pickedIds.has(player.id) && !(hasFree && avoid.has(player.id)),
    );
  const rollable = teams.filter((team) => squadOf(team).some((player) => slotsFor(player).length > 0));
  const rolled = teams.find((team) => team.id === rolledId) ?? null;
  const cards = rolled ? squadOf(rolled) : [];

  // Com até 6 clubes, cada clube ocupa algumas faces do dado
  const legend =
    teams.length <= 6
      ? teams.map((team, index) => ({
          team,
          faces: [1, 2, 3, 4, 5, 6].filter((value) => (value - 1) % teams.length === index),
        }))
      : [];

  // `again`: troca única, rola de novo mesmo com um clube já sorteado (e tenta sair um clube diferente)
  function rollDice(again = false) {
    if (rolling || (rolled && !again) || !rollable.length) return;
    const others = again && rolled ? rollable.filter((team) => team.id !== rolled.id) : rollable;
    const options = others.length ? others : rollable;
    const target = options[Math.floor(Math.random() * options.length)];
    const index = teams.findIndex((team) => team.id === target.id);
    let finalFace = (index % 6) + 1;
    if (teams.length <= 6) {
      const faces = [1, 2, 3, 4, 5, 6].filter((value) => (value - 1) % teams.length === index);
      finalFace = faces[Math.floor(Math.random() * faces.length)];
    }
    setRolling(true);
    setPending(null);
    if (again) setRolledId(null);
    let ticks = 0;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      ticks += 1;
      if (ticks < 11) {
        setFace(1 + Math.floor(Math.random() * 6));
        return;
      }
      window.clearInterval(timer.current);
      setFace(finalFace);
      setRolling(false);
      setRolledId(target.id);
    }, 90);
  }

  function place(player: Player, position: Position) {
    setPending(null);
    setRolledId(null);
    onPick(player, position);
  }

  function pickCard(player: Player) {
    const slots = slotsFor(player);
    if (!slots.length) return;
    if (slots.length === 1) place(player, slots[0]);
    else setPending(player);
  }

  return (
    <main className="draft-page">
      <style>{`@keyframes dice-shake {
        0% { transform: rotate(0) translateY(0); }
        25% { transform: rotate(-18deg) translateY(-8px); }
        50% { transform: rotate(14deg) translateY(2px); }
        75% { transform: rotate(-10deg) translateY(-5px); }
        100% { transform: rotate(0) translateY(0); }
      }`}</style>
      <div className="draft-head">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={16} /> Clube
        </button>
        <div>
          <div className="eyebrow">ETAPA 02 / 03 · MODO DADO</div>
          <h2>
            DRAFT <em>{club.abbreviation}</em>
          </h2>
        </div>
        <div className="draft-progress">
          <strong>{chosen.length}</strong>
          <span>/ 7 jogadores</span>
        </div>
      </div>
      <div className="draft-layout">
        <section className="draft-picker">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
            <div
              aria-label={`Dado mostrando ${face}`}
              style={{
                width: 92,
                height: 92,
                borderRadius: 18,
                background: '#f4f4f0',
                padding: 12,
                boxSizing: 'border-box',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(3, 1fr)',
                boxShadow: '0 6px 0 #b9b9b0, 0 10px 24px rgba(0,0,0,.5)',
                animation: rolling ? 'dice-shake .45s infinite' : 'none',
                flexShrink: 0,
              }}
            >
              {Array.from({ length: 9 }).map((_, index) => (
                <span
                  key={index}
                  style={{
                    width: 16,
                    height: 16,
                    margin: 'auto',
                    borderRadius: '50%',
                    background: DIE_PIPS[face].includes(index) ? '#11161c' : 'transparent',
                  }}
                />
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <span className="eyebrow">{rolled ? 'O DADO SORTEOU' : 'SORTEIE O CLUBE'}</span>
              {rolled ? (
                <div style={{ marginTop: 6 }}>
                  <TeamMark team={rolled} />
                </div>
              ) : (
                <p style={{ margin: '6px 0 10px', opacity: 0.8 }}>
                  {rollable.length
                    ? 'Role o dado para sortear de qual clube vêm as cartas desta escolha.'
                    : 'Não há mais jogadores disponíveis para as posições que faltam.'}
                </p>
              )}
              {rolled && !cards.some((player) => slotsFor(player).length > 0) && (
                <button className="outline-button" style={{ marginTop: 8 }} onClick={() => setRolledId(null)}>
                  Sem cartas disponíveis, rolar de novo
                </button>
              )}
              {rolled && cards.some((player) => slotsFor(player).length > 0) && (
                <button
                  className="outline-button"
                  style={{ marginTop: 8 }}
                  disabled={rerollsLeft <= 0 || rolling}
                  onClick={() => {
                    onUseReroll();
                    rollDice(true);
                  }}
                >
                  🎲 {rerollsLeft > 0 ? 'Rolar de novo · 1 troca restante' : 'Troca já usada'}
                </button>
              )}
              {!rolled && (
                <button className="gold-button" onClick={() => rollDice()} disabled={rolling || !rollable.length}>
                  <span aria-hidden="true">🎲</span> {rolling ? 'Rolando...' : 'Rolar dado'}
                </button>
              )}
              {legend.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {legend.map((item) => (
                    <span key={item.team.id}>
                      {item.faces.join(', ')} → {item.team.abbreviation}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {rolled && (
            <>
              <div className="picker-heading">
                <div>
                  <span className="eyebrow">ESCOLHA UMA CARTA</span>
                  <h3>Elenco do {rolled.name}</h3>
                </div>
                <span>{cards.filter((player) => slotsFor(player).length > 0).length} disponíveis</span>
              </div>
              {pending && (
                <div className="empty-state" style={{ marginBottom: 14 }}>
                  <p style={{ margin: '0 0 10px' }}>Em qual posição {pending.name} vai jogar?</p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {slotsFor(pending).map((position) => (
                      <button key={position} className="gold-button" onClick={() => place(pending, position)}>
                        {position}
                      </button>
                    ))}
                    <button className="outline-button" onClick={() => setPending(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="cards-grid">
                {cards.map((player) => {
                  const ok = slotsFor(player).length > 0;
                  return (
                    <div key={player.id} style={{ opacity: ok ? 1 : 0.35, textAlign: 'center' }}>
                      <Card
                        player={player}
                        selected={pending?.id === player.id}
                        onClick={ok ? () => pickCard(player) : undefined}
                      />
                      {!ok && <small style={{ fontSize: 11 }}>Posição já preenchida</small>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
        <DraftPitch club={club} selected={selected} />
      </div>
    </main>
  );
}
