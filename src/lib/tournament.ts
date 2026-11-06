import { supabase } from '@/lib/supabase';
import type { Room } from '@/lib/multiplayer';

export type TPlayer = { id: string; nick: string };
export type TMatch = { room_id?: string; winner_id?: string; score?: string; pens?: boolean };
// q1/q2 só existem com 6 jogadores (quartas). Com 4 jogadores o torneio começa direto nas semis (m1/m2).
export type Slot = 'q1' | 'q2' | 'q3' | 'q4' | 'm1' | 'm2' | 'm3';
export type Tournament = {
  id: string;
  code: string;
  host_id: string;
  mode: 'classic' | 'dice';
  // Quantos jogadores o anfitrião escolheu ao criar (4 = semis + final, 6 = 2 quartas + semis + final, 8 = 4 quartas + semis + final)
  size: 4 | 6 | 8;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  players: TPlayer[];
  seed: string[] | null;
  q1: TMatch;
  q2: TMatch;
  q3: TMatch;
  q4: TMatch;
  m1: TMatch;
  m2: TMatch;
  m3: TMatch;
  champion_nick: string | null;
};

// q3/q4 só existem no banco depois da migração do torneio de 8: até lá, vêm vazias
function norm(row: Tournament | null): Tournament | null {
  if (!row) return null;
  return { ...row, q3: row.q3 ?? {}, q4: row.q4 ?? {} };
}

function one(data: unknown): Tournament | null {
  const row = Array.isArray(data) ? data[0] : data;
  return norm((row as Tournament | null) ?? null);
}

export async function createTournament(nick: string, mode: 'classic' | 'dice', size: 4 | 6 | 8 = 4) {
  const { data, error } = await supabase.rpc('create_tournament', { p_nick: nick, p_mode: mode, p_size: size });
  if (error) return { error: error.message };
  const created = one(data) ?? undefined;
  // Se o banco ainda não conhece o tamanho pedido, ele cria um torneio menor em silêncio (ex.: 8 vira 4).
  // Melhor avisar e desfazer do que deixar o anfitrião esperando numa sala do tamanho errado.
  if (created && created.size !== size) {
    await supabase.rpc('leave_tournament', { p_id: created.id });
    return { error: `O banco ainda não aceita torneio de ${size} jogadores (ele criou de ${created.size}). Atualize as funções do torneio no Supabase.` };
  }
  return { tournament: created };
}

export async function joinTournament(code: string, nick: string) {
  const clean = code.trim().toUpperCase();
  if (clean.length < 4) return { error: 'Digite o código de 4 letras do torneio.' };
  const { data, error } = await supabase.rpc('join_tournament', { p_code: clean, p_nick: nick });
  if (error) return { error: error.message };
  return { tournament: one(data) ?? undefined };
}

export async function leaveTournament(id: string) {
  await supabase.rpc('leave_tournament', { p_id: id });
}

// Sem `seed` o banco sorteia o chaveamento. Com `seed` (ids na ordem do chaveamento) o anfitrião monta o dele.
export async function startTournament(id: string, seed?: string[]) {
  const { data, error } = seed
    ? await supabase.rpc('start_tournament_seeded', { p_id: id, p_seed: seed })
    : await supabase.rpc('start_tournament', { p_id: id });
  if (error) return { error: error.message };
  return { tournament: one(data) ?? undefined };
}

export async function setTournamentMatch(id: string, slot: Slot, patch: TMatch) {
  const { data, error } = await supabase.rpc('tournament_set_match', { p_id: id, p_slot: slot, p_data: patch });
  if (error) return { error: error.message };
  return { tournament: one(data) ?? undefined };
}

export async function fetchTournament(id: string): Promise<Tournament | null> {
  const { data } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
  return norm((data as Tournament | null) ?? null);
}

// Como a ordem do chaveamento (seed) vira confrontos, para o anfitrião montar: cada grupo é uma partida (ou folga)
export function seedGroups(size: 4 | 6 | 8): { label: string; indexes: number[] }[] {
  if (size === 8) {
    return [
      { label: 'Quartas 1', indexes: [0, 1] },
      { label: 'Quartas 2', indexes: [2, 3] },
      { label: 'Quartas 3', indexes: [4, 5] },
      { label: 'Quartas 4', indexes: [6, 7] },
    ];
  }
  if (size === 6) {
    return [
      { label: 'Folga: vai direto à Semifinal 1', indexes: [0] },
      { label: 'Folga: vai direto à Semifinal 2', indexes: [1] },
      { label: 'Quartas 1', indexes: [2, 3] },
      { label: 'Quartas 2', indexes: [4, 5] },
    ];
  }
  return [
    { label: 'Semifinal 1', indexes: [0, 1] },
    { label: 'Semifinal 2', indexes: [2, 3] },
  ];
}

// Quais partidas existem nesse torneio (4 jogadores: semis + final; 6 jogadores: quartas + semis + final)
export function slotsFor(t: Tournament): Slot[] {
  if (t.seed && t.seed.length === 8) return ['q1', 'q2', 'q3', 'q4', 'm1', 'm2', 'm3'];
  if (t.seed && t.seed.length === 6) return ['q1', 'q2', 'm1', 'm2', 'm3'];
  return ['m1', 'm2', 'm3'];
}

// Quem joga cada partida.
// 4 jogadores: semis vêm do sorteio. 6 jogadores: os 2 primeiros do sorteio ganham folga e entram direto
// nas semis; os outros 4 jogam as quartas. A final é sempre dos vencedores das semis.
export function slotPlayers(t: Tournament, slot: Slot): [TPlayer | null, TPlayer | null] {
  const find = (id?: string | null) => t.players.find((player) => player.id === id) ?? null;
  if (!t.seed) return [null, null];
  const six = t.seed.length === 6;
  // 8 jogadores: quatro quartas (sorteio 0x1, 2x3, 4x5, 6x7); as semis são os vencedores das quartas
  if (t.seed.length === 8) {
    if (slot === 'q1') return [find(t.seed[0]), find(t.seed[1])];
    if (slot === 'q2') return [find(t.seed[2]), find(t.seed[3])];
    if (slot === 'q3') return [find(t.seed[4]), find(t.seed[5])];
    if (slot === 'q4') return [find(t.seed[6]), find(t.seed[7])];
    if (slot === 'm1') return [find(t.q1.winner_id), find(t.q2.winner_id)];
    if (slot === 'm2') return [find(t.q3.winner_id), find(t.q4.winner_id)];
    return [find(t.m1.winner_id), find(t.m2.winner_id)];
  }
  if (slot === 'q1') return six ? [find(t.seed[2]), find(t.seed[3])] : [null, null];
  if (slot === 'q2') return six ? [find(t.seed[4]), find(t.seed[5])] : [null, null];
  if (slot === 'q3' || slot === 'q4') return [null, null];
  if (slot === 'm1') return six ? [find(t.seed[0]), find(t.q1.winner_id)] : [find(t.seed[0]), find(t.seed[1])];
  if (slot === 'm2') return six ? [find(t.seed[1]), find(t.q2.winner_id)] : [find(t.seed[2]), find(t.seed[3])];
  return [find(t.m1.winner_id), find(t.m2.winner_id)];
}

// Em qual partida o jogador está agora (null = eliminado, campeão ou fora do torneio).
// É a primeira partida, na ordem do chaveamento, em que ele aparece e que ainda não tem vencedor.
export function currentSlot(t: Tournament, userId: string): Slot | null {
  if (!t.seed || !t.seed.includes(userId)) return null;
  return (
    slotsFor(t).find(
      (slot) => !t[slot].winner_id && slotPlayers(t, slot).some((player) => player?.id === userId),
    ) ?? null
  );
}

export function slotOfRoom(t: Tournament, roomId: string): Slot | null {
  return slotsFor(t).find((slot) => t[slot].room_id === roomId) ?? null;
}

// Empate vira "pênaltis": decidido pelo código da sala, igual para os dois lados
export function decideWinner(room: Room, hostGoals: number, guestGoals: number) {
  if (hostGoals !== guestGoals) {
    return { winnerId: hostGoals > guestGoals ? room.host_id : (room.guest_id as string), pens: false };
  }
  const sum = room.id.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return { winnerId: sum % 2 === 0 ? room.host_id : (room.guest_id as string), pens: true };
}

export const SLOT_LABEL: Record<Slot, string> = {
  q1: 'Quartas 1',
  q2: 'Quartas 2',
  q3: 'Quartas 3',
  q4: 'Quartas 4',
  m1: 'Semifinal 1',
  m2: 'Semifinal 2',
  m3: 'Final',
};
