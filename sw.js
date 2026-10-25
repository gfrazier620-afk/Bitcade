/*
 * Bitcade service worker: keeps a whole copy of the site (the lobby, every game, the fonts and the cabinet footage), so
 * it opens instantly and plays offline.
 *
 * - Site files come straight from that copy: no waiting on the network, even on a slow connection. Each deploy is a
 *   new VERSION (the deploy workflow stamps it with the commit), so a changed site means a new worker, which fetches
 *   the new copy in the background and then waits. Pages tell it to take over (a 'skip' message) when they're about
 *   to change screen anyway, or when the player taps UPDATE on the lobby's note, so old and new files never mix.
 * - Anything not in the copy comes from the network and is kept.
 * - The Firebase SDK (and Google Fonts, for pages from before the fonts lived here): cache first. Their URLs are versioned.
 * - Firestore and sign-in requests are left alone; the leaderboard already handles being offline.
 * - On localhost the network comes first, so edits show up while working on the site.
 *
 * Adding a game? Add its slug to GAMES. The smoke tests check that GAMES matches games/.
 */
const VERSION = 'bitcade-v40', RUNTIME = 'bitcade-runtime';
const GAMES = ['neon-noodle', 'wallbuster', 'star-siege', 'rock-rift', 'stackdown', 'back-alley-brawl', 'circuit-chase',
  'highrise-handyman', 'nitro-lane', 'volley-duel', 'crater-lander', 'sky-shield', 'hedge-hop', 'scaffold-scramble', 'swarm-strike', 'garden-gunner', 'cube-hopper',
  'light-trail', 'wing-duel', 'twin-blast', 'mole-patrol', 'turbo-tour', 'raptor-ridge', 'marsh-marksman', 'pixel-peaks', 'pop-lagoon', 'neon-steps', 'blast-brigade', 'dungeon-delve', 'lucky-line', 'rampart-rush', 'blip-sports'];
const FONTS = ['bungee-400', 'bungee-shade-400', 'rubik', 'silkscreen-400', 'russo-one-400', 'chakra-petch-400', 'chakra-petch-500', 'chakra-petch-600', 'chakra-petch-700', 'vt323-400'];
const SHELL = ['./', 'manifest.json', 'shared/fonts.css', ...FONTS.map(f => `shared/fonts/${f}.woff2`), 'shared/arcade.js', 'shared/arcade.css', 'shared/world.js', 'shared/badges.js', 'shared/chip.js', 'shared/boot.js', 'shared/prizes.js', 'shared/floor-play.js', 'shared/floor.js', 'shared/profile.js', 'shared/shelves.js', 'shared/pass.js', 'shared/settings.js', 'shared/couch.js', 'shared/story.js', 'shared/save.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', ...GAMES.map(g => `games/${g}/`),
  ...GAMES.flatMap(g => [1, 2].map(n => `icons/screens/${g}-${n}.webp`))]; // the lobby's cabinet footage

const DEV = location.hostname === 'localhost';

// cache: 'reload' skips the browser's HTTP cache, so the copy is the current one. The very first worker takes over
// straight away; later ones wait for a page to say 'skip' (see above).
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.registration.active ? null : self.skipWaiting()));
});
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(DEV ? networkFirst(req) : fromCopy(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' ||
    (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) e.respondWith(cacheFirst(req));
});

/** From this version's copy if it's there (query strings don't matter); otherwise the network, kept for next time. */
async function fromCopy(req) {
  const cache = await caches.open(VERSION), hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
/**
 * Fresh from the network, but answer from the cache if the network fails or takes more than 4 s (localhost only).
 * cache: 'no-cache' revalidates with the server instead of trusting the HTTP cache.
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
