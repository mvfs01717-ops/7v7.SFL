import { supabase } from '@/lib/supabase';

export type RoomStatus = 'waiting' | 'drafting' | 'playing' | 'finished' | 'cancelled';
export type Squad = Record<string, string>;
export type PlanItem = {
  minute: number;
  type: 'posse' | 'finalização' | 'defesa' | 'gol';
  side: 'host' | 'guest';
  // Só no item "meta" (minuto 0): hora em que a partida começou, para o modo espectador entrar ao vivo
  startedAt?: number;
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

// Procura a sala pelo código (sem entrar), para o convidado escolher o clube antes
export async function lookupRoom(code: string, userId: string): Promise<{ room?: Room; error?: string }> {
  const clean = code.trim().toUpperCase();
  if (clean.length < 4) return { error: 'Digite o código de 4 letras da sala.' };
  const { data, error } = await supabase.from('rooms').select('*').eq('code', clean).maybeSingle();
  if (error) return { error: error.message };
  const found = data as Room | null;
  if (!found || found.status !== 'waiting' || found.guest_id) {
    return { error: 'Sala não encontrada ou já ocupada.' };
  }
  if (found.host_id === userId) return { error: 'Essa sala é sua. Passe o código para um amigo.' };
  return { room: found };
}

export async function joinRoom(
  code: string,
  userId: string,
  nick: string,
  teamId: string,
): Promise<{ room?: Room; error?: string }> {
  const lookup = await lookupRoom(code, userId);
  if (lookup.error || !lookup.room) return { error: lookup.error };
  const found = lookup.room;
  if (!teamId || teamId === found.host_team_id) {
    return { error: 'Esse clube já é do anfitrião. Escolha outro.' };
  }
  const { data: joined, error: joinError } = await supabase
    .from('rooms')
    .update({ guest_id: userId, guest_nick: nick, guest_team_id: teamId, status: 'drafting' })
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

// A partida dura ~81 s (90 min x 900 ms). Passou de 3 min, ficou esquecida no banco e não está mais rolando.
const MATCH_MAX_AGE_MS = 3 * 60 * 1000;

export function isRoomLive(room: Room) {
  if (room.status !== 'playing' || !room.guest_id || !room.plan || room.plan.length === 0) return false;
  const startedAt = room.plan.find((item) => item.startedAt)?.startedAt;
  // Partidas antigas não têm hora de início: usa a data de criação da sala, se existir
  const created = (room as Room & { created_at?: string }).created_at;
  const since = startedAt ?? (created ? new Date(created).getTime() : null);
  if (since === null) return false;
  return Date.now() - since < MATCH_MAX_AGE_MS;
}

// Partidas que estão rolando agora (para a galera assistir)
export async function listLiveRooms(): Promise<Room[]> {
  let data: unknown[] | null = null;
  const ordered = await supabase
    .from('rooms')
    .select('*')
    .eq('status', 'playing')
    .order('created_at', { ascending: false })
    .limit(30);
  if (!ordered.error) {
    data = ordered.data;
  } else {
    // Se a tabela não tiver created_at, busca sem ordenar
    const plain = await supabase.from('rooms').select('*').eq('status', 'playing').limit(30);
    if (plain.error) return [];
    data = plain.data;
  }
  return ((data ?? []) as Room[])
    .filter(isRoomLive)
    .slice(0, 12);
}

export async function patchRoom(id: string, patch: Partial<Room>) {
  const { error } = await supabase.from('rooms').update(patch).eq('id', id);
  return error ? error.message : '';
}

const clampNum = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Força de um time: o ataque pesa mais, mas meio-campo, laterais e goleiro também contam
function teamStrength(squad: Lite[]) {
  const avg = (positions: string[]) => {
    const list = squad.filter((player) => positions.includes(player.primary_position));
    return list.length ? list.reduce((sum, player) => sum + player.overall, 0) / list.length : 70;
  };
  return avg(['LF', 'RF', 'CF']) * 0.45 + avg(['CM']) * 0.2 + avg(['LB', 'RB']) * 0.2 + avg(['GK']) * 0.15;
}

// Número aleatório de gols (distribuição de Poisson): média `lambda`
function poisson(lambda: number) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > limit);
  return k - 1;
}

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Escolhe os minutos dos gols, com um intervalo mínimo entre eles para a animação dar conta
function pickGoalMinutes(count: number, slots: number[]): number[] {
  for (const gap of [8, 6, 4]) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const chosen: number[] = [];
      for (const minute of shuffled(slots)) {
        if (chosen.every((other) => Math.abs(other - minute) >= gap)) chosen.push(minute);
        if (chosen.length === count) return chosen.sort((a, b) => a - b);
      }
    }
  }
  const step = slots.length / count;
  return Array.from({ length: count }, (_, i) => slots[Math.floor(i * step)]);
}

const MIN_GOALS = 3;
const MAX_GOALS = 7;

// O anfitrião sorteia a partida inteira uma vez. Os dois lados reproduzem a mesma lista.
// Time mais forte faz mais gols e ganha com mais frequência; a partida nunca termina empatada.
export function generatePlan(hostSquad: Lite[], guestSquad: Lite[]): PlanItem[] {
  const diff = teamStrength(hostSquad) - teamStrength(guestSquad);
  const hostChance = clampNum(0.5 + diff * 0.04, 0.2, 0.8);

  let hostGoals = poisson(clampNum(2.4 + diff * 0.12, 0.8, 5));
  let guestGoals = poisson(clampNum(2.4 - diff * 0.12, 0.8, 5));
  while (hostGoals + guestGoals > MAX_GOALS) {
    if (hostGoals >= guestGoals) hostGoals -= 1;
    else guestGoals -= 1;
  }
  while (hostGoals + guestGoals < MIN_GOALS) {
    if (Math.random() < hostChance) hostGoals += 1;
    else guestGoals += 1;
  }
  // Sem empate: o gol que desempata vai, na maioria das vezes, para o time mais forte
  if (hostGoals === guestGoals) {
    if (Math.random() < hostChance) hostGoals += 1;
    else guestGoals += 1;
  }

  const slots: number[] = [];
  for (let minute = 1; minute <= 90; minute += 1) {
    if (minute % 4 === 0 || minute % 7 === 0) slots.push(minute);
  }
  const goalMinutes = pickGoalMinutes(hostGoals + guestGoals, slots);
  const goalSides = shuffled<PlanItem['side']>([
    ...Array.from({ length: hostGoals }, () => 'host' as const),
    ...Array.from({ length: guestGoals }, () => 'guest' as const),
  ]);

  // Item "meta" no minuto 0: nunca é um lance, só guarda a hora de início da partida
  const plan: PlanItem[] = [{ minute: 0, type: 'posse', side: 'host', startedAt: Date.now() }];
  slots.forEach((minute) => {
    const goalIndex = goalMinutes.indexOf(minute);
    if (goalIndex >= 0) {
      plan.push({ minute, type: 'gol', side: goalSides[goalIndex] });
      return;
    }
    const type: PlanItem['type'] = minute % 5 === 0 ? 'finalização' : minute % 3 === 0 ? 'defesa' : 'posse';
    plan.push({ minute, type, side: Math.random() < hostChance ? 'host' : 'guest' });
  });
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
  // Só encerra se ainda estiver jogando: numa revanche a sala já pode ter voltado para o draft
  await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id).eq('status', 'playing');
}

// ---------- Chat da sala ----------
// Usa o canal "broadcast" do Supabase Realtime: não precisa de tabela nova.
// As mensagens valem só durante a sala (não ficam salvas no banco).
export type ChatMessage = {
  id: string;
  senderId: string;
  nick: string;
  text: string;
  at: number;
};

export function openRoomChat(roomId: string, onMessage: (message: ChatMessage) => void) {
  const channel = supabase.channel(`chat-${roomId}`, { config: { broadcast: { self: true } } });
  let ready = false;
  channel
    .on('broadcast', { event: 'msg' }, ({ payload }) => onMessage(payload as ChatMessage))
    .subscribe((status) => {
      ready = status === 'SUBSCRIBED';
    });
  return {
    send(message: ChatMessage) {
      if (!ready) return false;
      void channel.send({ type: 'broadcast', event: 'msg', payload: message });
      return true;
    },
    close() {
      void supabase.removeChannel(channel);
    },
  };
}
