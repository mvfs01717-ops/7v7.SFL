import { useCallback, useEffect, useState } from 'react';

// PWA: registro do service worker, botão "Instalar app" e aviso de conexão.

// Aviso de versão nova: o service worker novo termina de instalar enquanto a página ainda roda o código antigo.
let updateReady = false;
const updateListeners = new Set<() => void>();
function markUpdate() {
  if (updateReady) return;
  updateReady = true;
  updateListeners.forEach((fn) => fn());
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // já tinha um controlador: qualquer worker novo significa versão nova (na primeira instalação não avisa)
        const watch = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if ((worker.state === 'installed' || worker.state === 'activated') && navigator.serviceWorker.controller) markUpdate();
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) markUpdate();
        reg.addEventListener('updatefound', () => watch(reg.installing));
        const check = () => void reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        window.setInterval(check, 30 * 60 * 1000);
      })
      .catch(() => undefined);
  });
}

export function useUpdateAvailable() {
  const [ready, setReady] = useState(updateReady);
  useEffect(() => {
    const fn = () => setReady(true);
    updateListeners.add(fn);
    if (updateReady) setReady(true);
    return () => {
      updateListeners.delete(fn);
    };
  }, []);
  const apply = useCallback(() => {
    // recarrega já com a versão nova (o worker novo assume sozinho: o sw.js usa skipWaiting)
    navigator.serviceWorker?.getRegistration().then((reg) => reg?.waiting?.postMessage('skipWaiting')).catch(() => undefined).finally(() => window.location.reload());
  }, []);
  return { ready, apply };
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export type InstallApi = {
  // Chrome/Edge/Android: dá para instalar com um toque
  canInstall: boolean;
  // iPhone/iPad (Safari): não existe botão automático, só o passo a passo manual
  needsIosSteps: boolean;
  installed: boolean;
  install: () => Promise<void>;
};

export function useInstall(): InstallApi {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => (typeof window === 'undefined' ? false : isStandalone()));
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') setInstalled(true);
    setEvent(null);
  }, [event]);
  return { canInstall: !!event && !installed, needsIosSteps: !installed && !event && typeof window !== 'undefined' && isIos(), installed, install };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

// Cópia local dos times e jogadores: é o que permite jogar contra o bot sem internet
const DATA_KEY = '7v7-data-v1';
export function saveDataCache(teams: unknown[], players: unknown[]) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify({ at: Date.now(), teams, players }));
  } catch {
    /* sem espaço ou bloqueado: o app continua normal, só não abre offline */
  }
}
export function loadDataCache<T, P>(): { teams: T[]; players: P[]; at: number } | null {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { teams?: T[]; players?: P[]; at?: number };
    if (!Array.isArray(data.teams) || !Array.isArray(data.players) || !data.teams.length || !data.players.length) return null;
    return { teams: data.teams, players: data.players, at: data.at ?? 0 };
  } catch {
    return null;
  }
}
