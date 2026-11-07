export type Position = 'GK' | 'LB' | 'RB' | 'CM' | 'LF' | 'RF' | 'CF';

export type Screen = 'home' | 'club' | 'draft' | 'match' | 'results' | 'leaderboard' | 'squad' | 'admin' | 'lobby' | 'tournament' | 'profile';

export type Team = { id: string; name: string; abbreviation: string; primary_color: string; secondary_color: string };

export type Player = {
  id: string;
  name: string;
  overall: number;
  primary_position: Position;
  alternate_positions: Position[];
  team_id: string;
  image_url?: string | null;
  team?: Team;
  // Posição em que o jogador realmente jogou na partida (pode ser diferente da principal)
  slot?: Position;
  // Substituições: minuto em que entrou no jogo (0 = titular) e se joga fora de posição
  since?: number;
  oop?: boolean;
  // Fôlego já gasto por esforço até o intervalo (pontos) e ritmo de esforço (pontos por minuto)
  carried?: number;
  work?: number;
  // Capitão do time (dá bônus ao time e não pode ser substituído)
  captain?: boolean;
};

export type MatchEvent = {
  id: number;
  minute: number;
  type: 'posse' | 'finalização' | 'defesa' | 'gol';
  text: string;
  team: 'user' | 'bot';
  // Quem finalizou e quem deu o passe: a animação do campo usa isso para encenar a jogada certa
  actor?: string;
  assist?: string;
};

export type MatchStats = {
  userPossession: number;
  botPossession: number;
  userShots: number;
  botShots: number;
  userTarget: number;
  botTarget: number;
  userSaves: number;
  botSaves: number;
};

// Registro de cada gol da partida (autor, assistência e minuto), usado na tabela final
export type GoalRecord = { minute: number; scorerId: string; assistId?: string; side: 'user' | 'bot' };

export const positions: Position[] = ['GK', 'LB', 'RB', 'CM', 'LF', 'RF', 'CF'];

// Banco montado no draft (só contra o bot): 3 vagas, uma para cada setor
export type BenchSlot = 'BD' | 'BM' | 'BA';

export type DraftSlot = Position | BenchSlot;

export const BENCH_SLOTS: { id: BenchSlot; label: string; title: string; positions: Position[] }[] = [
  { id: 'BD', label: 'RES · DEF', title: 'Reserva de defesa', positions: ['LB', 'RB'] },
  { id: 'BM', label: 'RES · MEIO', title: 'Reserva de meio', positions: ['CM'] },
  { id: 'BA', label: 'RES · ATA', title: 'Reserva de ataque', positions: ['LF', 'RF', 'CF'] },
];

export const slotPositionsOf = (slot: DraftSlot): Position[] =>
  BENCH_SLOTS.find((item) => item.id === slot)?.positions ?? [slot as Position];

export const positionNames: Record<Position, string> = {
  GK: 'Goleiro',
  LB: 'Lateral-esquerdo',
  RB: 'Lateral-direito',
  CM: 'Meio-campista',
  LF: 'Atacante esquerdo',
  RF: 'Atacante direito',
  CF: 'Centroavante',
};

export const positionShort: Record<Position, string> = {
  GK: 'GK', LB: 'LB', RB: 'RB', CM: 'CM', LF: 'LF', RF: 'RF', CF: 'CF',
};

export const emptyStats: MatchStats = {
  userPossession: 50,
  botPossession: 50,
  userShots: 0,
  botShots: 0,
  userTarget: 0,
  botTarget: 0,
  userSaves: 0,
  botSaves: 0,
};
