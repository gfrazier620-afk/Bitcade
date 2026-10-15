/*
 * Bitcade service worker: precaches the lobby and every game so the installed app plays offline.
 *
 * - Site files: network first (always fresh when online), falling back to the cache when offline or slow.
 * - Google Fonts and the Firebase SDK: cache first. Their URLs are versioned, so cached copies never go stale.
 * - Firestore and sign-in requests are left alone; the leaderboard already handles being offline.
 *
 * Adding a game? Add its slug to GAMES and bump VERSION. The smoke tests check that GAMES matches games/.
 */
const VERSION = 'bitcade-v20', RUNTIME = 'bitcade-runtime';
const GAMES = ['neon-noodle', 'wallbuster', 'star-siege', 'rock-rift', 'stackdown', 'back-alley-brawl', 'circuit-chase',
  'highrise-handyman', 'nitro-lane', 'volley-duel', 'crater-lander', 'sky-shield', 'hedge-hop', 'scaffold-scramble', 'swarm-strike', 'garden-gunner', 'cube-hopper',
  'light-trail', 'wing-duel', 'twin-blast', 'mole-patrol', 'turbo-tour', 'raptor-ridge', 'marsh-marksman', 'blip-sports'];
const SHELL = ['./', 'manifest.json', 'shared/arcade.js', 'shared/arcade.css', 'shared/world.js', 'shared/badges.js', 'shared/chip.js', 'shared/boot.js', 'shared/prizes.js', 'shared/floor-play.js', 'shared/floor.js', 'shared/profile.js', 'shared/save.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', ...GAMES.map(g => `games/${g}/`),
  ...GAMES.flatMap(g => [1, 2].map(n => `icons/screens/${g}-${n}.webp`))]; // the lobby's cabinet footage

// cache: 'reload' skips the browser's HTTP cache, so the offline copy is the current one
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' ||
    (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) e.respondWith(cacheFirst(req));
});

/**
 * Fresh from the network, but answer from the cache if the network fails or takes more than 4 s.
 * cache: 'no-cache' revalidates with the server instead of trusting the HTTP cache, which could otherwise mix
 * a new arcade.js with a stale arcade.css for a few minutes after a deploy.
 */
async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  const live = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(new Request(req, { cache: 'no-cache' }));
  const net = live.then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
  const slow = new Promise(r => setTimeout(r, 4000)).then(() => cache.match(req, { ignoreSearch: true }));
  try {
    const first = await Promise.race([net, slow]);
    if (first) return first;
    return await net; // slow but nothing cached: keep waiting for the network
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
