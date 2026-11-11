import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Lista de amigos: pedidos, online e convites para jogar.
// - Amizades ficam na tabela `friendships` (ver supabase/migrations/20261109200000_friends.sql), sempre via funções RPC.
// - "Online" usa o Presence do Supabase Realtime (canal único com todos os jogadores logados).
// - Convite usa o canal "broadcast" `inbox-<id do amigo>`: não precisa de tabela e só chega para quem está online.

export type FriendRow = {
  friendship_id: string;
  user_id: string;
  nickname: string;
  status: 'pending' | 'accepted';
  incoming: boolean;
};

export type Invite = {
  fromId: string;
  fromNick: string;
  code: string;
  mode: 'classic' | 'dice';
  at: number;
};

export const INVITE_TTL_MS = 90_000;

export type FriendsApi = {
  rows: FriendRow[];
  online: Set<string>;
  invite: Invite | null;
  loading: boolean;
  refresh: () => Promise<void>;
  addFriend: (nick: string) => Promise<{ ok: boolean; error?: string; status?: 'pending' | 'accepted' }>;
  accept: (row: FriendRow) => Promise<void>;
  remove: (row: FriendRow) => Promise<void>;
  sendInvite: (friendId: string, code: string, mode: 'classic' | 'dice') => Promise<boolean>;
  dismissInvite: () => void;
};

// Manda um aviso curto para a caixa de entrada de outro jogador (canal temporário)
function ping(userId: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = supabase.channel(`inbox-${userId}`, { config: { broadcast: { self: false, ack: true } } });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.setTimeout(() => void supabase.removeChannel(channel), 400);
      resolve(ok);
    };
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const result = await channel.send({ type: 'broadcast', event, payload });
        finish(result === 'ok');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') finish(false);
    });
    window.setTimeout(() => finish(false), 6000);
  });
}

export function useFriends(userId: string | null, nickname: string): FriendsApi {
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(false);
  const rowsRef = useRef<FriendRow[]>([]);
  rowsRef.current = rows;
  const nickRef = useRef(nickname);
  nickRef.current = nickname;

  const refresh = useCallback(async () => {
    if (!userId) {
      setRows([]);
      return;
    }
    const { data, error } = await supabase.rpc('friends_list');
    // Se a migração ainda não foi aplicada, a função não existe: a lista só fica vazia
    if (!error && Array.isArray(data)) setRows(data as FriendRow[]);
  }, [userId]);

  // Carrega e atualiza a lista de tempos em tempos
  useEffect(() => {
    if (!userId) {
      setRows([]);
      setOnline(new Set());
      setInvite(null);
      return undefined;
    }
    setLoading(true);
    void refresh().finally(() => setLoading(false));
    const timer = window.setInterval(() => void refresh(), 25_000);
    return () => window.clearInterval(timer);
  }, [userId, refresh]);

  // Quem está online
  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase.channel('7v7-online', { config: { presence: { key: userId } } });
    channel
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ nick: nickRef.current, at: Date.now() });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Caixa de entrada: convites e avisos de pedido de amizade
  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase.channel(`inbox-${userId}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'invite' }, ({ payload }) => {
        const data = payload as Invite;
        if (data && data.code && data.fromId && data.fromId !== userId) setInvite({ ...data, at: Date.now() });
      })
      .on('broadcast', { event: 'friends' }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // O convite some sozinho depois de um tempo
  useEffect(() => {
    if (!invite) return undefined;
    const left = INVITE_TTL_MS - (Date.now() - invite.at);
    const timer = window.setTimeout(() => setInvite(null), Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [invite]);

  const addFriend: FriendsApi['addFriend'] = async (nick) => {
    const clean = nick.trim();
    if (clean.length < 2) return { ok: false, error: 'Digite o apelido do jogador.' };
    const { data, error } = await supabase.rpc('friends_send_request', { p_nick: clean });
    if (error) return { ok: false, error: 'Não foi possível enviar o pedido. A migração de amigos já foi aplicada no Supabase?' };
    const result = data as { ok: boolean; error?: string; status?: 'pending' | 'accepted'; to?: string };
    if (result.ok) {
      await refresh();
      if (result.to) void ping(result.to, 'friends', {});
    }
    return { ok: result.ok, error: result.error, status: result.status };
  };

  const accept: FriendsApi['accept'] = async (row) => {
    await supabase.rpc('friends_accept', { p_id: row.friendship_id });
    await refresh();
    void ping(row.user_id, 'friends', {});
  };

  const remove: FriendsApi['remove'] = async (row) => {
    await supabase.rpc('friends_remove', { p_id: row.friendship_id });
    await refresh();
    void ping(row.user_id, 'friends', {});
  };

  const sendInvite: FriendsApi['sendInvite'] = async (friendId, code, mode) => {
    if (!userId) return false;
    return ping(friendId, 'invite', { fromId: userId, fromNick: nickRef.current, code, mode, at: Date.now() });
  };

  return { rows, online, invite, loading, refresh, addFriend, accept, remove, sendInvite, dismissInvite: () => setInvite(null) };
}

// Quantas pessoas estão assistindo uma partida agora. Todo mundo que está na partida (jogadores e espectadores)
// entra no mesmo canal de presença `watch-<sala>`; só quem entra como "spectator" conta.
export function useWatchers(roomId: string | null | undefined, role: 'host' | 'guest' | 'spectator' | null | undefined): number {
  const [count, setCount] = useState(0);
  const keyRef = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  useEffect(() => {
    if (!roomId || !role) {
      setCount(0);
      return undefined;
    }
    const channel = supabase.channel(`watch-${roomId}`, { config: { presence: { key: keyRef.current } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, { role?: string }[]>;
        setCount(Object.values(state).filter((metas) => metas.some((meta) => meta.role === 'spectator')).length);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ role, at: Date.now() });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, role]);
  return count;
}
