import { LineupShow } from '@/components/game/LineupShow';
import { LINEUP_REVEAL_MS } from '@/lib/game/helpers';
import { positions, type Player, type Position, type Team } from '@/lib/game/types';
import type { Tactic } from '@/lib/multiplayer';

// Fim do draft: apresentação do seu time (palco com os jogadores entrando, campo, reservas, tática e overall)
export function TeamReveal({
  club,
  squad,
  bench,
  tactic,
  onDone,
}: {
  club: Team;
  squad: Partial<Record<Position, Player>>;
  bench?: Player[];
  tactic?: Tactic;
  onDone: () => void;
}) {
  const lineup = positions.flatMap((position) => (squad[position] ? [{ ...(squad[position] as Player), slot: position }] : []));
  return (
    <LineupShow
      team={club}
      squad={lineup}
      bench={bench}
      tactic={tactic}
      eyebrow="SEU TIME ESTÁ PRONTO"
      cta="Continuar"
      autoMs={11000}
      onDone={onDone}
    />
  );
}

// Antes da partida: apresentação do rival. Dura no máximo LINEUP_REVEAL_MS, que o relógio da partida já desconta,
// então os dois lados começam quase juntos.
export function RivalReveal({
  opponent,
  rivalName,
  rivalTactic,
  squad,
  bench,
  onDone,
}: {
  opponent: Team;
  rivalName?: string;
  rivalTactic?: Tactic;
  squad: Player[];
  bench?: Player[];
  onDone: () => void;
}) {
  return (
    <LineupShow
      team={opponent}
      squad={squad}
      bench={bench}
      tactic={rivalTactic}
      eyebrow={rivalName ? `SEU RIVAL · ${rivalName.toUpperCase()}` : 'SEU RIVAL'}
      cta="Começar partida"
      autoMs={LINEUP_REVEAL_MS}
      onDone={onDone}
    />
  );
}
