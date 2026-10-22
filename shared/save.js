/*
 * Cloud save: keeps a player's progress (everything under arcade:* in localStorage) in Firestore, so it follows them to
 * another device. There are no accounts: turning it on makes a sync code like K7QM-2XRT-9BHF, and typing that code on
 * another device joins the same save. The save's id is a SHA-256 of the code (shared/world.js, firestore.rules).
 *
 * Every sync pulls the cloud copy, merges it with this device and pushes the result, so two devices can both play
 * offline and still end up with everything: best scores and play counts take the higher value, top-10 tables are
 * combined, badges and prizes are unioned, tickets add up what was earned and spent. Settings stay per device.
 * Loaded on demand (an ES module) by the lobby and, after each game over, by shared/arcade.js.
 */
const CODE_KEY = 'bitcade:sync', WHEN_KEY = 'bitcade:synced'; // not arcade:*, so they never sync themselves
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
const LOCAL_ONLY = /^arcade:(outbox|muted|music|crt|easy|equip)$/; // per-device: queued posts, and settings

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
export function merge(a, b, prices, joining) {
  const out = { ...b, ...a };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (x == null || y == null) continue;
    if (joining && (/^arcade:(plays|time):/.test(k) || k === 'arcade:tickets:earned' || k === 'arcade:tickets:spent' || k === 'arcade:xp')) out[k] = String((+x || 0) + (+y || 0));
    else if (/^arcade:(best|plays|time):/.test(k) || k === 'arcade:tickets:earned' || k === 'arcade:tickets:spent' || k === 'arcade:xp') out[k] = String(Math.max(+x || 0, +y || 0));
    else if (/^arcade:top:/.test(k)) {
      const seen = new Set(), all = [...json(x, []), ...json(y, [])].filter(e => e && typeof e.s === 'number').sort((p, q) => q.s - p.s)
        .filter(e => { const id = e.n + ':' + e.s; if (seen.has(id)) return false; seen.add(id); return true; });
      out[k] = JSON.stringify(all.slice(0, 10));
    } else if (/^arcade:badges:/.test(k) || k === 'arcade:prizes') out[k] = JSON.stringify([...new Set([...json(x, []), ...json(y, [])])]);
    else if (/^arcade:(daily|week):/.test(k)) {
      const p = json(x, {}), q = json(y, {}), f = k.includes(':daily:') ? 'd' : 'w';
      out[k] = JSON.stringify(p[f] === q[f] ? (p.s >= q.s ? p : q) : (String(p[f]) > String(q[f]) ? p : q));
    }
    // anything else (initials, the cached ticket balance): this device's value
  }
  if (prices) out['arcade:tickets:spent'] = String(json(out['arcade:prizes'], []).reduce((t, id) => t + (prices[id] || 0), 0));
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
