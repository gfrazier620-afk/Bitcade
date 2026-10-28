/*
 * Play activity for the admin page (admin.html): anonymous, so testers' play can be looked at, and it can be turned
 * off in Settings (arcade:track '0'). An ES module, loaded by arcade.js on every game page and by the lobby.
 *
 * Events wait in a queue in localStorage (bitcade:actq, never synced) and go up in one batch a few seconds later, or
 * on the next page if the tab closed first. shared/world.js writes them under the player's anonymous id:
 *   act/{uid} = { n: initials, dev: 'phone' | 'tablet' | 'desktop', lv, tix, first, last }
 *   act/{uid}/ev/{id} = { k: 'run', g: slug, s: score, ms: run length, d: daily, e: easy, at, t }
 *                     | { k: 'page', g: slug or 'lobby', ms: time on the page, play: time playing, runs, floor, at, t }
 * Only the admin's Google account can read them (firestore.rules); nothing else about a player is sent.
 */
const Q = 'bitcade:actq', MAX = 200;
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const on = () => get('arcade:track') !== '0';
const read = () => { try { const q = JSON.parse(get(Q)); return Array.isArray(q) ? q : []; } catch (e) { return []; } };
const write = q => set(Q, JSON.stringify(q.slice(-MAX)));

/** Queue one event ({ k, g, ... }); it goes up with the next batch. */
export function track(ev) {
  if (!on()) return;
  const q = read(); q.push({ ...ev, at: Date.now() }); write(q);
  clearTimeout(timer); timer = setTimeout(flush, 4000);
}
let timer = 0, busy = null;

function profile() {
  const ini = get('arcade:initials'), w = Math.min(screen.width, screen.height), coarse = matchMedia('(pointer: coarse)').matches;
  if (!get('bitcade:first')) set('bitcade:first', String(Date.now()));
  const p = { dev: coarse ? (w >= 700 ? 'tablet' : 'phone') : 'desktop', first: +get('bitcade:first') };
  if (/^[A-Z]{3}$/.test(ini || '')) p.n = ini;
  if (window.XP) p.lv = XP.info().level;
  if (window.TICKETS) p.tix = TICKETS.balance();
  return p;
}

/** Send what's queued (up to 100 at a time). Offline or blocked, it stays queued for next time. */
export function flush() {
  if (busy) return busy;
  if (!on()) { set(Q, '[]'); return Promise.resolve(); }
  const q = read(); if (!q.length) return Promise.resolve();
  const batch = q.slice(0, 100);
  busy = import('./world.js').then(w => w.logActivity(profile(), batch))
    .then(() => { write(read().slice(batch.length)); if (read().length) timer = setTimeout(flush, 1000); })
    .catch(() => {})
    .finally(() => { busy = null; });
  return busy;
}

/*
 * Time on a page, in pieces: a piece ends when the tab is hidden or closed, and becomes one 'page' event with how long
 * the page was open and anything the page adds (extra(): play time, runs, time on the floor). Pieces under 2 s are
 * dropped.
 */
export function pageTimer(g, extra) {
  let t0 = document.hidden ? 0 : Date.now();
  const end = () => {
    if (!t0) return; const ms = Date.now() - t0; t0 = 0;
    const x = extra ? extra() : {};
    if (ms >= 2000) { track({ k: 'page', g, ms, ...x }); flush(); }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) end(); else t0 = Date.now(); });
  addEventListener('pagehide', end);
  if (read().length) setTimeout(flush, 3000); // anything left from last time
}
