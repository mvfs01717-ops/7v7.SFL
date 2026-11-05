import { supabase } from '@/lib/supabase';

export type RoomStatus = 'waiting' | 'drafting' | 'playing' | 'finished' | 'cancelled';
export type Squad = Record<string, string>;
export type PlanItem = {
  minute: number;
  type: 'posse' | 'finalização' | 'defesa' | 'gol';
  side: 'host' | 'guest';
  // Só no item "meta" (minuto 0): hora em que a partida começou, para o modo espectador entrar ao vivo
  startedAt?: number;
  // Quem finalizou e quem defendeu (nomes). Só nos lances de finalização, defesa e gol.
  shooter?: string;
  keeper?: string;
};
// Disputa de pênaltis do multiplayer. Cada jogador grava SÓ na própria coluna (sem sobrescrever o outro):
//  - shootout_host:  { choices, kicks }  (o anfitrião também resolve cada cobrança e grava o resultado em `kicks`)
//  - shootout_guest: { choices }
export type NetChoice = { x?: number; y?: number; pw?: number; dive?: number };
export type NetKick = {
  shooter: 'host' | 'guest';
  playerId: string;
  outcome: 'gol' | 'defesa' | 'fora' | 'trave';
  tx: number;
  ty: number; // onde a bola chegou (0 a 1; fora disso = errou o gol)
  kx: number;
  ky: number; // para onde o goleiro pulou
  dur: number;
  arc: number;
  golaco: boolean;
};
export type NetShootout = { choices?: Record<string, NetChoice>; kicks?: NetKick[] };
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
  shootout_host?: NetShootout | null;
  shootout_guest?: NetShootout | null;
};
// Tática escolhida antes da partida. Fica guardada junto do time na sala (chave `_t` de host_squad/guest_squad),
// então não precisa de coluna nova no banco.
export type Tactic = 'ofensiva' | 'equilibrada' | 'defensiva';
export const TACTICS: Tactic[] = ['ofensiva', 'equilibrada', 'defensiva'];
export const TACTIC_INFO: Record<Tactic, { label: string; icon: string; text: string }> = {
  ofensiva: { label: 'Ofensiva', icon: '⚔️', text: 'Cria mais chances de gol, mas deixa o rival criar mais também.' },
  equilibrada: { label: 'Equilibrada', icon: '⚖️', text: 'Sem riscos: o jogo segue o equilíbrio normal dos times.' },
  defensiva: { label: 'Defensiva', icon: '🛡️', text: 'Cria menos chances, mas também segura mais o rival.' },
};
export function tacticOf(squad: Squad | null | undefined): Tactic {
  const value = squad?._t;
  return value === 'ofensiva' || value === 'defensiva' ? value : 'equilibrada';
}
// Quantos chutes a tática muda: `own` nos chutes do próprio time, `conceded` nos chutes que o rival ganha contra ela
const TACTIC_SHOTS: Record<Tactic, { own: number; conceded: number }> = {
  ofensiva: { own: 2, conceded: 2 },
  equilibrada: { own: 0, conceded: 0 },
  defensiva: { own: -2.5, conceded: -2 },
};

// `slot` é a posição em que o jogador foi escalado no draft (pode ser diferente da posição de origem)
type Lite = { primary_position: string; overall: number; name?: string; slot?: string };
const posOf = (player: Lite) => player.slot ?? player.primary_position;

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

function avgOf(squad: Lite[], positions: string[]) {
  const list = squad.filter((player) => positions.includes(posOf(player)));
  return list.length ? list.reduce((sum, player) => sum + player.overall, 0) / list.length : 70;
}

// Ataque: os atacantes pesam mais, o meio-campo ajuda a criar
function attackRating(squad: Lite[]) {
  return avgOf(squad, ['LF', 'RF', 'CF']) * 0.65 + avgOf(squad, ['CM']) * 0.35;
}

// Defesa: o goleiro é quem mais pesa, depois laterais e meio-campo
function defenseRating(squad: Lite[]) {
  return avgOf(squad, ['GK']) * 0.5 + avgOf(squad, ['LB', 'RB']) * 0.3 + avgOf(squad, ['CM']) * 0.2;
}

// Quem costuma finalizar (atacantes quase sempre, meio-campo às vezes, laterais raramente)
const SHOOTER_WEIGHT: Record<string, number> = { CF: 1, LF: 0.9, RF: 0.9, CM: 0.3, LB: 0.06, RB: 0.06 };
// Quanto maior, mais o overall decide quem finaliza (7 = um jogador 10 pontos melhor finaliza ~4x mais)
const SHOOTER_SPREAD = 7;

// Sorteia o finalizador: jogador melhor tem mais chance, o pior atacante quase nunca aparece
function pickShooter(squad: Lite[]): Lite | undefined {
  const pool = squad.filter((player) => (SHOOTER_WEIGHT[posOf(player)] ?? 0) > 0);
  const weights = pool.map(
    (player) => SHOOTER_WEIGHT[posOf(player)] * Math.exp((player.overall - 80) / SHOOTER_SPREAD),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!pool.length || total <= 0) return undefined;
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

const keeperOf = (squad: Lite[]) => squad.find((player) => posOf(player) === 'GK');

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
// Quanto cada ponto de vantagem (ataque contra a defesa do rival) vale na chance de a partida pender para um lado
const GOAL_PER_EDGE = 0.06;
// Quanto cada ponto de vantagem (ataque contra a defesa do rival) vale em chutes a mais
const SHOTS_PER_EDGE = 0.15;
// Duelo atacante x goleiro: cada ponto de overall a mais do atacante (ou do goleiro) muda a chance de gol em 0,5 ponto percentual
const DUEL_PER_POINT = 0.005;

// Zebra: chance mínima de o time mais fraco vencer (0,30 = 30%). Em jogos parelhos não muda nada;
// quando um time é muito melhor, parte das vitórias dele vira vitória do azarão até chegar nesse mínimo.
const ZEBRA_CHANCE = 0.3;
// Quanto cada ponto de overall de diferença pesa na chance natural do azarão (calibrado pela simulação)
const UPSET_SLOPE = 0.133;

type Shot = { side: 'host' | 'guest'; shooter?: Lite; keeper?: Lite; outcome: 'gol' | 'defesa' | 'fora' };

// O anfitrião sorteia a partida inteira uma vez. Os dois lados reproduzem a mesma lista.
// A partida é feita de chutes: o ataque de um time contra a defesa do rival define quantas chances ele cria,
// e cada chute é um duelo entre o finalizador (sorteado, melhor overall aparece mais) e o goleiro do rival.
// Atacante muito melhor que o goleiro faz mais gols; goleiro muito melhor defende mais.
// A partida nunca termina empatada, e tem entre 3 e 7 gols no total.
// `drawChance` (0 a 1): chance de a partida terminar empatada e ir para os pênaltis. Com 0 nunca empata.
export function generatePlan(
  hostSquad: Lite[],
  guestSquad: Lite[],
  drawChance = 0,
  tactics: { host?: Tactic; guest?: Tactic } = {},
): PlanItem[] {
  const hostTactic = tactics.host ?? 'equilibrada';
  const guestTactic = tactics.guest ?? 'equilibrada';
  const edgeHost = attackRating(hostSquad) - defenseRating(guestSquad);
  const edgeGuest = attackRating(guestSquad) - defenseRating(hostSquad);
  const hostChance = clampNum(0.5 + (edgeHost - edgeGuest) * (GOAL_PER_EDGE / 6), 0.2, 0.8);

  // Um chute: quem bate, quem defende e o desfecho do duelo
  const takeShot = (side: Shot['side']): Shot => {
    const shooter = pickShooter(side === 'host' ? hostSquad : guestSquad);
    const keeper = keeperOf(side === 'host' ? guestSquad : hostSquad);
    const skill = shooter?.overall ?? 75;
    const keeperSkill = keeper?.overall ?? 75;
    // Chutar no gol: atacante melhor erra menos
    const onTarget = Math.random() < clampNum(0.6 + (skill - 78) * 0.002, 0.4, 0.8);
    if (!onTarget) return { side, shooter, keeper, outcome: 'fora' };
    // No gol: atacante melhor que o goleiro marca mais; goleiro melhor que o atacante defende mais
    const pGoal = clampNum(0.36 + (skill - keeperSkill) * DUEL_PER_POINT, 0.1, 0.75);
    return { side, shooter, keeper, outcome: Math.random() < pGoal ? 'gol' : 'defesa' };
  };
  // A tática mexe na quantidade de chutes: a própria (cria mais/menos) e a do rival (cede mais/menos)
  const shotCount = (edge: number, own: Tactic, rival: Tactic) =>
    Math.max(
      3,
      Math.round(
        clampNum(9 + edge * SHOTS_PER_EDGE, 5, 14) +
          TACTIC_SHOTS[own].own +
          TACTIC_SHOTS[rival].conceded +
          (Math.random() * 3 - 1.5),
      ),
    );
  const shots: Shot[] = [];
  for (let i = shotCount(edgeHost, hostTactic, guestTactic); i > 0; i -= 1) shots.push(takeShot('host'));
  for (let i = shotCount(edgeGuest, guestTactic, hostTactic); i > 0; i -= 1) shots.push(takeShot('guest'));

  const goalsOf = (side: Shot['side']) => shots.filter((shot) => shot.side === side && shot.outcome === 'gol').length;
  // Transforma um chute do lado em gol (prefere uma defesa; se não houver chute, cria um)
  const addGoal = (side: Shot['side']) => {
    const mine = shots.filter((shot) => shot.side === side && shot.outcome !== 'gol');
    const saved = mine.filter((shot) => shot.outcome === 'defesa');
    const pool = saved.length ? saved : mine;
    if (pool.length) pool[Math.floor(Math.random() * pool.length)].outcome = 'gol';
    else shots.push({ ...takeShot(side), outcome: 'gol' });
  };
  // Transforma um gol do lado em defesa do goleiro
  const removeGoal = (side: Shot['side']) => {
    const goals = shots.filter((shot) => shot.side === side && shot.outcome === 'gol');
    if (goals.length) goals[Math.floor(Math.random() * goals.length)].outcome = 'defesa';
  };

  while (goalsOf('host') + goalsOf('guest') > MAX_GOALS) {
    // Corta do lado que fez mais; em empate sorteia, para não prejudicar sempre o mesmo time
    const h = goalsOf('host');
    const g = goalsOf('guest');
    removeGoal(h > g || (h === g && Math.random() < 0.5) ? 'host' : 'guest');
  }
  while (goalsOf('host') + goalsOf('guest') < MIN_GOALS) {
    addGoal(Math.random() < hostChance ? 'host' : 'guest');
  }
  // Às vezes a partida termina empatada (vai para os pênaltis): iguala os gols, com pelo menos 1 de cada lado
  if (drawChance > 0 && Math.random() < drawChance) {
    const level = Math.max(1, Math.min(goalsOf('host'), goalsOf('guest')));
    while (goalsOf('host') > level) removeGoal('host');
    while (goalsOf('guest') > level) removeGoal('guest');
    while (goalsOf('host') < level) addGoal('host');
    while (goalsOf('guest') < level) addGoal('guest');
  } else {
    if (goalsOf('host') === goalsOf('guest')) {
      // Sem empate: o gol que desempata vai, na maioria das vezes, para o time mais forte
      addGoal(Math.random() < hostChance ? 'host' : 'guest');
    }
    // Zebra: se o favorito ganhou, às vezes o azarão vence no lugar, para ele ter ao menos ZEBRA_CHANCE de vitória
    const gap = Math.abs(edgeHost - edgeGuest) / 2; // diferença aproximada de overall entre os times
    const natural = 1 / (1 + Math.exp(UPSET_SLOPE * gap)); // chance que o azarão já tem
    const flip = Math.max(0, (ZEBRA_CHANCE - natural) / (1 - natural));
    const favorite: Shot['side'] = edgeHost >= edgeGuest ? 'host' : 'guest';
    const underdog: Shot['side'] = favorite === 'host' ? 'guest' : 'host';
    if (goalsOf(favorite) > goalsOf(underdog) && Math.random() < flip) {
      for (let guard = 0; guard < 30 && goalsOf(underdog) <= goalsOf(favorite); guard += 1) {
        if (goalsOf('host') + goalsOf('guest') < MAX_GOALS) addGoal(underdog);
        else removeGoal(favorite);
      }
    }
  }

  const slots: number[] = [];
  for (let minute = 1; minute <= 90; minute += 1) {
    if (minute % 4 === 0 || minute % 7 === 0) slots.push(minute);
  }
  const goals = shuffled(shots.filter((shot) => shot.outcome === 'gol'));
  const goalMinutes = pickGoalMinutes(goals.length, slots);
  const free = shuffled(slots.filter((minute) => !goalMinutes.includes(minute)));
  // Os outros chutes ocupam minutos livres; sobram alguns só de posse de bola
  const others = shuffled(shots.filter((shot) => shot.outcome !== 'gol')).slice(0, Math.max(0, free.length - 6));

  const itemOf = (minute: number, shot: Shot): PlanItem => {
    const item: PlanItem = {
      minute,
      type: shot.outcome === 'gol' ? 'gol' : shot.outcome === 'defesa' ? 'defesa' : 'finalização',
      side: shot.side,
    };
    if (shot.shooter?.name) item.shooter = shot.shooter.name;
    if (shot.keeper?.name) item.keeper = shot.keeper.name;
    return item;
  };

  // Item "meta" no minuto 0: nunca é um lance, só guarda a hora de início da partida
  const plan: PlanItem[] = [{ minute: 0, type: 'posse', side: 'host', startedAt: Date.now() }];
  goals.forEach((shot, i) => plan.push(itemOf(goalMinutes[i], shot)));
  others.forEach((shot, i) => plan.push(itemOf(free[i], shot)));
  free.slice(others.length).forEach((minute) => {
    plan.push({ minute, type: 'posse', side: Math.random() < hostChance ? 'host' : 'guest' });
  });
  return plan.sort((a, b) => a.minute - b.minute);
}

// Salva o resultado da partida no ranking. Os dois lados tentam; só o primeiro grava (room_id é único).
// Se a partida foi decidida nos pênaltis, `shootoutWinner` recebe +1 gol no registro para contar como vitória normal.
export async function recordResult(
  room: Room,
  hostGoals: number,
  guestGoals: number,
  shootoutWinner?: 'host' | 'guest',
) {
  if (!room.guest_id) return;
  if (shootoutWinner === 'host') hostGoals += 1;
  if (shootoutWinner === 'guest') guestGoals += 1;
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
