import { supabase } from '@/lib/supabase';

export type RoomStatus = 'waiting' | 'drafting' | 'playing' | 'finished' | 'cancelled';
export type Squad = Record<string, string>;
export type PlanItem = {
  minute: number;
  type: 'posse' | 'finalização' | 'defesa' | 'gol';
  side: 'host' | 'guest';
};
export type Room = {
  id: string;
  code: string;
  host_id: string;
  guest_id: string | null;
  host_nick: string;
  guest_nick: string | null;
  host_team_id: string | null;
  guest_team_id: string | null;
  mode: 'classic' | 'dice';
  host_squad: Squad;
  guest_squad: Squad;
  host_ready: boolean;
  guest_ready: boolean;
  plan: PlanItem[] | null;
  status: RoomStatus;
};
type Lite = { primary_position: string; overall: number };

// Sem letras parecidas (0/O, 1/I) para o código ser fácil de ditar
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i += 1) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

export async function createRoom(
  userId: string,
  nick: string,
  teamId: string,
  mode: 'classic' | 'dice',
): Promise<{ room?: Room; error?: string }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase
      .from('rooms')
      .insert({ code: makeCode(), host_id: userId, host_nick: nick, host_team_id: teamId, mode })
      .select()
      .single();
    if (!error && data) return { room: data as Room };
    if (error && error.code !== '23505') return { error: error.message };
  }
  return { error: 'Não foi possível gerar um código de sala. Tente de novo.' };
}

export async function joinRoom(
  code: string,
  userId: string,
  nick: string,
  teamIds: string[],
): Promise<{ room?: Room; error?: string }> {
  const clean = code.trim().toUpperCase();
  if (clean.length < 4) return { error: 'Digite o código de 4 letras da sala.' };
  const { data, error } = await supabase.from('rooms').select('*').eq('code', clean).maybeSingle();
  if (error) return { error: error.message };
  const found = data as Room | null;
  if (!found || found.status !== 'waiting' || found.guest_id) {
    return { error: 'Sala não encontrada ou já ocupada.' };
  }
  if (found.host_id === userId) return { error: 'Essa sala é sua. Passe o código para um amigo.' };
  const guestTeam = teamIds.find((id) => id !== found.host_team_id) ?? teamIds[0];
  const { data: joined, error: joinError } = await supabase
    .from('rooms')
    .update({ guest_id: userId, guest_nick: nick, guest_team_id: guestTeam, status: 'drafting' })
    .eq('id', found.id)
    .is('guest_id', null)
    .select()
    .maybeSingle();
  if (joinError) return { error: joinError.message };
  if (!joined) return { error: 'Alguém entrou nessa sala antes de você.' };
  return { room: joined as Room };
}

export async function fetchRoom(id: string): Promise<Room | null> {
  const { data } = await supabase.from('rooms').select('*').eq('id', id).maybeSingle();
  return (data as Room | null) ?? null;
}

export async function patchRoom(id: string, patch: Partial<Room>) {
  const { error } = await supabase.from('rooms').update(patch).eq('id', id);
  return error ? error.message : '';
}

function attackAverage(squad: Lite[]) {
  const attackers = squad.filter((player) => ['LF', 'RF', 'CF'].includes(player.primary_position));
  if (!attackers.length) return 70;
  return attackers.reduce((sum, player) => sum + player.overall, 0) / attackers.length;
}

// O anfitrião sorteia a partida inteira uma vez. Os dois lados reproduzem a mesma lista.
export function generatePlan(hostSquad: Lite[], guestSquad: Lite[]): PlanItem[] {
  const hostAttack = attackAverage(hostSquad);
  const guestAttack = attackAverage(guestSquad);
  const plan: PlanItem[] = [];
  for (let minute = 1; minute <= 90; minute += 1) {
    if (minute % 4 !== 0 && minute % 7 !== 0) continue;
    const hostWins = hostAttack + Math.random() * 20 >= guestAttack + Math.random() * 20;
    const type: PlanItem['type'] =
      minute % 11 === 0 ? 'gol' : minute % 5 === 0 ? 'finalização' : minute % 3 === 0 ? 'defesa' : 'posse';
    plan.push({ minute, type, side: hostWins ? 'host' : 'guest' });
  }
  return plan;
}

// Salva o resultado da partida no ranking. Os dois lados tentam; só o primeiro grava (room_id é único).
export async function recordResult(room: Room, hostGoals: number, guestGoals: number) {
  if (!room.guest_id) return;
  const { error } = await supabase.from('match_results').insert({
    room_id: room.id,
    host_id: room.host_id,
    guest_id: room.guest_id,
    host_nick: room.host_nick,
    guest_nick: room.guest_nick ?? 'Jogador',
    host_goals: hostGoals,
    guest_goals: guestGoals,
  });
  if (error && error.code !== '23505') console.warn('Não foi possível salvar o resultado:', error.message);
  await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id);
}
