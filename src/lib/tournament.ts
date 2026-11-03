import { supabase } from '@/lib/supabase';
import type { Room } from '@/lib/multiplayer';

export type TPlayer = { id: string; nick: string };
export type TMatch = { room_id?: string; winner_id?: string; score?: string; pens?: boolean };
export type Slot = 'm1' | 'm2' | 'm3';
export type Tournament = {
  id: string;
  code: string;
  host_id: string;
  mode: 'classic' | 'dice';
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  players: TPlayer[];
  seed: string[] | null;
  m1: TMatch;
  m2: TMatch;
  m3: TMatch;
  champion_nick: string | null;
};

function one(data: unknown): Tournament | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Tournament | null) ?? null;
}

export async function createTournament(nick: string, mode: 'classic' | 'dice') {
  const { data, error } = await supabase.rpc('create_tournament', { p_nick: nick, p_mode: mode });
  if (error) return { error: error.message };
  return { tournament: one(data) ?? undefined };
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

export async function startTournament(id: string) {
  const { data, error } = await supabase.rpc('start_tournament', { p_id: id });
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
  return (data as Tournament | null) ?? null;
}

// Quem joga cada partida. Semifinais vêm do sorteio; a final, dos vencedores.
export function slotPlayers(t: Tournament, slot: Slot): [TPlayer | null, TPlayer | null] {
  const find = (id?: string | null) => t.players.find((player) => player.id === id) ?? null;
  if (!t.seed) return [null, null];
  if (slot === 'm1') return [find(t.seed[0]), find(t.seed[1])];
  if (slot === 'm2') return [find(t.seed[2]), find(t.seed[3])];
  return [find(t.m1.winner_id), find(t.m2.winner_id)];
}

// Em qual partida o jogador está agora (null = eliminado, campeão ou fora do torneio)
export function currentSlot(t: Tournament, userId: string): Slot | null {
  if (!t.seed) return null;
  const index = t.seed.indexOf(userId);
  if (index < 0) return null;
  const semi: Slot = index < 2 ? 'm1' : 'm2';
  if (!t[semi].winner_id) return semi;
  if (t[semi].winner_id !== userId) return null;
  return t.m3.winner_id ? null : 'm3';
}

export function slotOfRoom(t: Tournament, roomId: string): Slot | null {
  return (['m1', 'm2', 'm3'] as Slot[]).find((slot) => t[slot].room_id === roomId) ?? null;
}

// Empate vira "pênaltis": decidido pelo código da sala, igual para os dois lados
export function decideWinner(room: Room, hostGoals: number, guestGoals: number) {
  if (hostGoals !== guestGoals) {
    return { winnerId: hostGoals > guestGoals ? room.host_id : (room.guest_id as string), pens: false };
  }
  const sum = room.id.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return { winnerId: sum % 2 === 0 ? room.host_id : (room.guest_id as string), pens: true };
}

export const SLOT_LABEL: Record<Slot, string> = { m1: 'Semifinal 1', m2: 'Semifinal 2', m3: 'Final' };
