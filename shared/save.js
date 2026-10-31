/*
 * Cloud save: keeps a player's progress (everything under arcade:* in localStorage) in Firestore, so it follows them to
 * another device. There are no accounts: turning it on makes a sync code like K7QM-2XRT-9BHF, and typing that code on
 * another device joins the same save. The save's id is a SHA-256 of the code (shared/world.js, firestore.rules).
 *
 * Every sync pulls the cloud copy, merges it with this device and pushes the result, so two devices can both play
 * offline and still end up with everything: best scores and play counts take the higher value, top-10 tables are
 * combined, badges and prizes are unioned, tickets add up what was earned and spent. Settings stay per device.
 * Resetting high scores (the lobby's settings) stamps arcade:scores:reset; a sync that meets an older copy drops that
 * copy's scores, so the reset reaches the cloud and every device on the save rather than being merged back.
 * Loaded on demand (an ES module) by the lobby and, after each game over, by shared/arcade.js.
 */
const CODE_KEY = 'bitcade:sync', WHEN_KEY = 'bitcade:synced'; // not arcade:*, so they never sync themselves
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
const LOCAL_ONLY = /^arcade:(outbox|muted|music|crt|easy|equip|shake|flash|buzz|track|name:ok)$|^arcade:(vol|keys):/; // per-device: queued posts, settings, and what this device last published of the profile

const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  keys: () => { try { return Object.keys(localStorage); } catch (e) { return []; } }
};

/** A new random code, XXXX-XXXX-XXXX (about 59 bits). */
export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = [...b].map(x => ALPHABET[x % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
/** Tidy a typed code (any case, spaces or dashes); null if it can't be one. */
export function normalize(code) {
  const s = String(code || '').toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 12 || [...s].some(c => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export const code = () => store.get(CODE_KEY);
export const lastSynced = () => +store.get(WHEN_KEY) || 0;
async function idFor(c) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bitcade:' + c));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** This device's progress: every arcade:* key that isn't per-device. */
export function snapshot() {
  const o = {};
  for (const k of store.keys()) if (k.startsWith('arcade:') && !LOCAL_ONLY.test(k)) o[k] = store.get(k);
  return o;
}
const json = (v, d) => { try { const x = JSON.parse(v); return x == null ? d : x; } catch (e) { return d; } };
/**
 * Combine two snapshots. Counters take the higher value, except when a device first joins a save (joining): then the
 * two histories are separate, so play counts, play time and tickets earned add up. prices (prize id → tickets), when
 * given, sets tickets spent exactly from the combined prize list (tickets are only ever spent on prizes).
 */
/** Two story saves (shared/story.js) combined: numbers take the higher, lists join, objects merge field by field. */
function deepMax(p, q) {
  if (Array.isArray(p) || Array.isArray(q)) return [...new Set([...(Array.isArray(p) ? p : []), ...(Array.isArray(q) ? q : [])])];
  if (typeof p === 'number' || typeof q === 'number') return Math.max(+p || 0, +q || 0);
  if (!p || typeof p !== 'object') return q; if (!q || typeof q !== 'object') return p;
  const o = { ...q, ...p }; for (const k of Object.keys(o)) if (k in p && k in q) o[k] = deepMax(p[k], q[k]); return o;
}
const RESET = 'arcade:scores:reset', SCORES = /^arcade:(best|plays|top|daily|week):/;
const dropScores = o => Object.fromEntries(Object.entries(o).filter(([k]) => !SCORES.test(k)));
/*
 * Daily or weekly missions from two devices (f: the date or week field). The newer day or week wins; on the same one,
 * each mission keeps the furthest progress from either side and counts as done if it's done on either (one swapped on
 * one device only: the side that's further along), and the all-three bonus is collected if either collected it.
 */
function mergeMissions(x, y, f) {
  const p = json(x, {}), q = json(y, {});
  if (!Array.isArray(p.list)) return y; if (!Array.isArray(q.list)) return x;
  if (p[f] !== q[f]) return String(p[f]) > String(q[f]) ? x : y;
  const list = p.list.map((a, i) => {
    const b = q.list[i]; if (!b) return a;
    if (a.kind !== b.kind || a.game !== b.game || a.n !== b.n) return b.done && !a.done || (!a.done && (b.prog || 0) > (a.prog || 0)) ? b : a;
    const seen = [...new Set([...(a.seen || []), ...(b.seen || [])])];
    return { ...a, seen, prog: Math.max(a.prog || 0, b.prog || 0, /variety/.test(a.kind) ? seen.length : 0), done: !!(a.done || b.done) };
  });
  return JSON.stringify({ ...p, list, bonus: !!(p.bonus || q.bonus) });
}
export function merge(a, b, prices, joining) {
  // a high-score reset: the side that hasn't seen the newest one loses its scores (not when a device first joins:
  // its scores are its own history, not ones from before that reset)
  const ra = +a[RESET] || 0, rb = +b[RESET] || 0;
  if (ra !== rb && !joining) { if (ra < rb) a = dropScores(a); else b = dropScores(b); }
  const out = { ...b, ...a };
  // joining a save: the save's player (name, its key, initials, character) is who this is, on this device too
  if (joining && b['arcade:name'] && b['arcade:namekey']) for (const k of ['arcade:name', 'arcade:namekey', 'arcade:initials', 'arcade:avatar']) if (b[k] != null) out[k] = b[k];
  if (ra || rb) out[RESET] = String(Math.max(ra, rb));
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (x == null || y == null) continue;
    if (joining && (/^arcade:(plays|time|pass:xp):/.test(k) || k === 'arcade:tickets:earned' || k === 'arcade:tickets:spent' || k === 'arcade:xp')) out[k] = String((+x || 0) + (+y || 0));
    else if (/^arcade:(best|plays|time|pass:xp|pass:own):/.test(k) || k === 'arcade:tickets:earned' || k === 'arcade:tickets:spent' || k === 'arcade:xp') out[k] = String(Math.max(+x || 0, +y || 0));
    else if (/^arcade:top:/.test(k)) {
      const seen = new Set(), all = [...json(x, []), ...json(y, [])].filter(e => e && typeof e.s === 'number').sort((p, q) => q.s - p.s)
        .filter(e => { const id = e.n + ':' + e.s; if (seen.has(id)) return false; seen.add(id); return true; });
      out[k] = JSON.stringify(all.slice(0, 10));
    } else if (/^arcade:(badges|pass:got):/.test(k) || k === 'arcade:prizes') out[k] = JSON.stringify([...new Set([...json(x, []), ...json(y, [])])]);
    else if (k === 'arcade:boostbuys') { const seen = new Set(); out[k] = JSON.stringify([...json(x, []), ...json(y, [])].filter(e => e && e.k && !seen.has(e.k) && seen.add(e.k))); } // every boost bought, on any device
    else if (/^arcade:(daily|week):/.test(k)) {
      const p = json(x, {}), q = json(y, {}), f = k.includes(':daily:') ? 'd' : 'w';
      out[k] = JSON.stringify(p[f] === q[f] ? (p.s >= q.s ? p : q) : (String(p[f]) > String(q[f]) ? p : q));
    }
    else if (/^arcade:story:/.test(k)) out[k] = JSON.stringify(deepMax(json(x, {}), json(y, {}))); // story progress: the furthest of each
    else if (k === 'arcade:streak') { const p = json(x, {}), q = json(y, {}); out[k] = JSON.stringify(String(p.d) > String(q.d) || (p.d === q.d && (+p.n || 0) >= (+q.n || 0)) ? p : q); }
    else if (k === 'arcade:missions' || k === 'arcade:wmissions') out[k] = mergeMissions(x, y, k === 'arcade:missions' ? 'd' : 'w');
    else if (joining && /^arcade:(name|namekey|initials|avatar)$/.test(k) && b['arcade:name'] && b['arcade:namekey']) out[k] = y; // the save's player (above)
    // anything else (initials, the cached ticket balance): this device's value
  }
  if (prices) out['arcade:tickets:spent'] = String(json(out['arcade:prizes'], []).reduce((t, id) => t + (prices[id] || 0), 0) + json(out['arcade:boostbuys'], []).reduce((t, e) => t + (+e.p || 0), 0));
  if (out['arcade:tickets:earned'] != null) out['arcade:tickets'] = String(Math.max(0, (+out['arcade:tickets:earned'] || 0) - (+out['arcade:tickets:spent'] || 0)));
  return out;
}

let running = null;
/**
 * Pull, merge, push. Resolves { state: 'off' | 'ok' | 'offline', changed } where changed means this device got
 * something new from the cloud. One sync at a time.
 */
export function sync({ prices, joining } = {}) {
  if (running) return running;
  const c = code(); if (!c) return Promise.resolve({ state: 'off', changed: false });
  running = (async () => {
    try {
      const [w, id] = await Promise.all([import('./world.js'), idFor(c)]);
      const remote = json(await w.loadSave(id), {}), local = snapshot(), merged = merge(local, remote, prices, joining);
      let changed = false;
      for (const [k, v] of Object.entries(merged)) if (store.get(k) !== v) { store.set(k, v); changed = true; }
      for (const k of Object.keys(local)) if (!(k in merged)) { store.del(k); changed = true; } // scores wiped by a reset on another device
      await w.storeSave(id, JSON.stringify(merged));
      store.set(WHEN_KEY, String(Date.now()));
      return { state: 'ok', changed };
    } catch (e) { return { state: 'offline', changed: false, error: e && e.message }; }
    finally { running = null; }
  })();
  return running;
}
/** Turn cloud save on with a new code (and upload this device's progress). */
export async function enable(opts) { const c = newCode(); store.set(CODE_KEY, c); const r = await sync(opts); return { code: c, ...r }; }
/** Join an existing save from another device; the two are merged. */
export async function join(typed, opts) {
  const c = normalize(typed); if (!c) return { state: 'bad' };
  const prev = code(); store.set(CODE_KEY, c);
  const r = await sync({ ...opts, joining: c !== prev });
  if (r.state !== 'ok') { if (prev) store.set(CODE_KEY, prev); else store.del(CODE_KEY); }
  return { code: c, ...r };
}
/** Stop syncing on this device (the cloud copy and this device's progress both stay). */
export function disable() { store.del(CODE_KEY); store.del(WHEN_KEY); }
