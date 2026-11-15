import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Notificação de convite com o site fechado (Web Push).
// Fluxo: o aparelho se inscreve (chave pública VAPID) -> guardamos a inscrição no Supabase (função push_save) ->
// quando alguém convida, a Edge Function `send-invite-push` manda o aviso -> o service worker (public/sw.js) mostra.

const PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';

function keyBytes(base64: string) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!PUBLIC_KEY;
}

export type PushState = {
  supported: boolean;
  // iPhone/iPad só recebem aviso depois de "Adicionar à Tela de Início"
  needsInstall: boolean;
  permission: NotificationPermission | 'unsupported';
  enabled: boolean;
  busy: boolean;
  error: string;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

export function useInviteNotifications(userId: string | null): PushState {
  const supported = pushSupported();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

  useEffect(() => {
    if (!supported || !userId) {
      setEnabled(false);
      return;
    }
    let alive = true;
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => alive && setEnabled(!!sub && Notification.permission === 'granted'))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [supported, userId]);

  const enable = useCallback(async () => {
    if (!supported || !userId) return;
    setBusy(true);
    setError('');
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setError('Permissão negada. Libere as notificações nas configurações do navegador.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const json = sub.toJSON();
      const { error: rpcError } = await supabase.rpc('push_save', { p_endpoint: sub.endpoint, p_p256dh: json.keys?.p256dh ?? '', p_auth: json.keys?.auth ?? '' });
      if (rpcError) {
        setError('Não foi possível salvar. A migração de notificações já foi aplicada no Supabase?');
        return;
      }
      setEnabled(true);
    } catch {
      setError('Não foi possível ativar as notificações neste aparelho.');
    } finally {
      setBusy(false);
    }
  }, [supported, userId]);

  const disable = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.rpc('push_remove', { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEnabled(false);
    } catch {
      setError('Não foi possível desativar agora.');
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return { supported, needsInstall: ios && !standalone, permission, enabled, busy, error, enable, disable };
}

// Pede para o servidor avisar o amigo (a Edge Function confere a amizade e manda o push)
export async function pushInvite(to: string, code: string, mode: 'classic' | 'dice'): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-invite-push', { body: { to, code, mode } });
    return !error && Number((data as { sent?: number } | null)?.sent ?? 0) > 0;
  } catch {
    return false;
  }
}
