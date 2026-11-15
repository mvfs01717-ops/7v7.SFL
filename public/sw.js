/* Service worker do 7v7 Brasil.
   - O "casco" do app (HTML, JS, CSS, fontes, imagens) fica guardado para abrir sem internet.
   - Supabase (login, banco, tempo real) NUNCA passa por aqui: segue direto para a rede.
   - Sem internet dá para jogar contra o bot com os dados da última vez que o app abriu online.
   Para forçar todo mundo a baixar tudo de novo, mude o número de VERSION. */
const VERSION = 'v3';
const SHELL = `7v7-shell-${VERSION}`;
const ASSETS = `7v7-assets-${VERSION}`;
const IMAGES = `7v7-images-${VERSION}`;
const MAX_IMAGES = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const base = ['/', '/manifest.webmanifest', '/logo.svg', '/icon-192.png', '/icon-512.png', '/stadium-night.jpg'];
      await Promise.all(base.map((url) => cache.add(url).catch(() => undefined)));
      // Lê o index.html para guardar já os arquivos com hash (JS e CSS) e o app abrir offline logo após instalar
      try {
        const html = await (await fetch('/', { cache: 'reload' })).text();
        const found = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        const assets = await caches.open(ASSETS);
        await Promise.all(found.map((url) => assets.add(url).catch(() => undefined)));
      } catch {
        /* sem rede na instalação: o cache é preenchido conforme o uso */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS, IMAGES]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('7v7-') && !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// Notificação de convite (Web Push): mostra o aviso e, ao tocar, abre o app já com o convite
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    (async () => {
      // Se o jogo está aberto e visível, o aviso dentro do app já aparece: não duplica
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === 'visible')) return;
      await self.registration.showNotification(data.title || '7v7 Brasil', {
        body: data.body || 'Você recebeu um convite.',
        icon: '/icon-192.png',
        badge: '/favicon-48.png',
        tag: 'invite',
        renotify: true,
        requireInteraction: true,
        data: { url: data.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => 'focus' in w);
      if (open) {
        // App já aberto em outra aba/janela: leva para o convite
        await open.focus();
        if ('navigate' in open) return open.navigate(url);
        return undefined;
      }
      return self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((key) => cache.delete(key)));
}

// Responde do cache na hora e atualiza em segundo plano
async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      // status 0 = resposta "opaca" de outro domínio (fotos dos jogadores): vale guardar
      if (response && (response.ok || response.status === 0)) {
        void cache.put(request, response.clone()).then(() => (limit ? trim(cacheName, limit) : undefined));
      }
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) void cache.put(request, response.clone());
  return response;
}

// Páginas: tenta a rede (versão nova); se demorar ou estiver offline, abre a última guardada
async function navigation(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4500)),
    ]);
    if (response && response.ok) void cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match('/')) || (await cache.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Nunca interceptar o Supabase nem qualquer API/websocket: login, banco e tempo real precisam da rede de verdade
  if (/supabase\.(co|in)$/.test(url.hostname) || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/realtime/')) return;
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS)); // nomes com hash: nunca mudam
    return;
  }
  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, IMAGES, MAX_IMAGES));
    return;
  }
  if (request.destination === 'font' || request.destination === 'style' || (sameOrigin && /\.(?:js|css|svg|png|jpg|webp|webmanifest|woff2?)$/.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(request, SHELL));
  }
});
