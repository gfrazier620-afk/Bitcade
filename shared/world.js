/*
 * World leaderboard on Firebase: Firestore Lite for reads and writes, plus anonymous auth for posting.
 * Loaded on demand by arcade.js and the lobby, so every page still works without it (offline, blocked, or down).
 *
 * Data: boards/{game}/scores/{id} = { n: 'ABC', s: 1234, uid, t }        all-time board
 *       daily/{game}/days/{YYYY-MM-DD}/scores/{id} = same shape          daily-challenge board
 *       weekly/{game}/weeks/{YYYY-MM-DD}/scores/{id} = same shape        weekly tournament board (the week's Monday, UTC)
 *       players/{uid} = { last }                                          post cooldown
 *       wins/{uid} = { n, s: total wins, t }                              Blip Sports world wins, +1 per win
 *       saves/{sha256 of a sync code} = { d: JSON, t }                    cloud save (shared/save.js)
 *       act/{uid} and act/{uid}/ev/{id}                                   play activity for admin.html (shared/activity.js)
 *       fb/{id} = { x: text, n, g, dev, uid, t }                          feedback from Settings
 *       err/{id} = { m, s, l, g, dev, ua, uid, t }                        errors caught on players' pages
 *       ch/{id} = { a: uid, an, g, s, t } and ch/{id}/res/{uid} = { n, s, t }   challenges and the scores against them
 *       dm/{uidA_uidB} = { m: [a, b], n: {uid: initials}, acc: {uid: true}, seen: {uid: t}, last }
 *         and dm/{pair}/m/{id} = { u, k: 'q' | 'x' | 'ch' | 'res', q, x, c, g, s, vs, t }      conversations (shared/inbox.js)
 *       bl/{uid} = { u: [blocked uids] }, rep/{id} = { by, other, pair, log, t }          blocks and reports
 * The config below only identifies the project. firestore.rules (published in the Firebase console) protects the data.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, limit, getDocs, getDoc, setDoc, updateDoc, doc, writeBatch, serverTimestamp, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js';

const app = initializeApp({
  apiKey: 'AIzaSyAPy1xQoxSHA64Efns07QCNw7ASNIWQpOQ',
  authDomain: 'bitcade-4fa25.firebaseapp.com',
  projectId: 'bitcade-4fa25',
  storageBucket: 'bitcade-4fa25.firebasestorage.app',
  messagingSenderId: '543242117072',
  appId: '1:543242117072:web:d95c092bebfd02333ba3d5'
});
const db = getFirestore(app);

let user = null;
/** Anonymous sign-in, only when posting. Firebase keeps the same anonymous player across visits. */
async function signIn() {
  if (user) return user;
  const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
  user = (await signInAnonymously(getAuth(app))).user;
  return user;
}

const board = (game, day, week) => week ? collection(db, 'weekly', game, 'weeks', week, 'scores')
  : day ? collection(db, 'daily', game, 'days', day, 'scores') : collection(db, 'boards', game, 'scores');

/**
 * Top n scores for a game, best first: [{ n, s }]. Pass day ('YYYY-MM-DD') for that day's daily-challenge board,
 * or week (its Monday, 'YYYY-MM-DD') for that week's tournament board.
 */
export async function top(game, n = 10, day = null, week = null) {
  const snap = await getDocs(query(board(game, day, week), orderBy('s', 'desc'), limit(n)));
  return snap.docs.map(d => ({ n: d.get('n'), s: d.get('s') }));
}

/**
 * Post a score to the all-time board (all), a daily board (day) and/or a tournament board (week), in one write.
 * The rules allow one post every 10 seconds per player, so callers queue and retry.
 */
export async function post(game, name, score, { all = true, day = null, week = null } = {}) {
  const u = await signIn();
  const b = writeBatch(db);
  b.set(doc(db, 'players', u.uid), { last: serverTimestamp() });
  const entry = () => ({ n: name, s: score, uid: u.uid, t: serverTimestamp() });
  if (all) b.set(doc(board(game)), entry());
  if (day) b.set(doc(board(game, day)), entry());
  if (week) b.set(doc(board(game, null, week)), entry());
  await b.commit();
}

/** Play activity (shared/activity.js): the player's profile, merged, and a batch of events, in one write. */
export async function logActivity(profile, events) {
  const u = await signIn(), b = writeBatch(db);
  b.set(doc(db, 'act', u.uid), { ...profile, last: serverTimestamp() }, { merge: true });
  const KEYS = ['k', 'g', 'ms', 'play', 's', 'runs', 'd', 'e', 'floor', 'at'];
  for (const e of events) {
    const o = { t: serverTimestamp() };
    for (const k of KEYS) if (e[k] != null) o[k] = typeof e[k] === 'number' ? Math.round(e[k]) : e[k];
    b.set(doc(collection(db, 'act', u.uid, 'ev')), o);
  }
  await b.commit();
}

/** Feedback from Settings: what they wrote, which page they were on, and their device. */
export async function sendFeedback(o) {
  const u = await signIn(), d = { x: String(o.x).slice(0, 1000), g: String(o.g || 'lobby').slice(0, 40), dev: o.dev, uid: u.uid, t: serverTimestamp() };
  if (/^[A-Z]{3}$/.test(o.n || '')) d.n = o.n;
  await setDoc(doc(collection(db, 'fb')), d);
}
/** Errors caught on a page (shared/activity.js), with a short browser name. */
export async function sendErrors(list, dev) {
  const u = await signIn(), b = writeBatch(db), ua = navigator.userAgent;
  const br = (/(Edg|OPR|Firefox|CriOS|Chrome|Version)\/(\d+)/.exec(ua) || [, '?', ''])
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?';
  const name = ({ Edg: 'Edge', OPR: 'Opera', CriOS: 'Chrome', Version: 'Safari' })[br[1]] || br[1];
  for (const e of list.slice(0, 20)) b.set(doc(collection(db, 'err')), { m: String(e.m).slice(0, 300), s: String(e.s || '').slice(0, 200), l: +e.l || 0, g: String(e.g || '').slice(0, 40), dev, ua: `${name} ${br[2]} · ${os}`.slice(0, 60), uid: u.uid, t: serverTimestamp() });
  await b.commit();
}

/* ---------- challenges and messages (shared/inbox.js, and game over in shared/arcade.js) ---------- */
export async function myId() { return (await signIn()).uid; }
export const pairOf = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
/** A new challenge on a game: your initials and score. Returns its id (the link is the game's page with ?ch=id). */
export async function makeChallenge(g, s, an) {
  const u = await signIn(), ref = doc(collection(db, 'ch'));
  await setDoc(ref, { a: u.uid, an, g, s: Math.max(0, Math.floor(s)), t: serverTimestamp() }); return ref.id;
}
export async function getChallenge(id) { const d = await getDoc(doc(db, 'ch', id)); return d.exists() ? { id, ...d.data() } : null; }
/** Everyone's best against a challenge: [{ uid, n, s }]. */
export async function challengeResults(id) { const q = await getDocs(collection(db, 'ch', id, 'res')); return q.docs.map(d => ({ uid: d.id, ...d.data() })); }
export async function postResult(id, n, s) { const u = await signIn(); await setDoc(doc(db, 'ch', id, 'res', u.uid), { n, s: Math.max(0, Math.floor(s)), t: serverTimestamp() }); }
/**
 * Send a message to another player (msg: { k, q | x | c, g, s, vs }), starting the conversation if it's new.
 * accept: you played their challenge (once both have, free text unlocks). Returns the conversation's id.
 */
export async function sendMsg(other, otherN, myN, msg, { accept = false } = {}) {
  const u = await signIn(), pair = pairOf(u.uid, other), ref = doc(db, 'dm', pair);
  const cur = await getDoc(ref), b = writeBatch(db);
  if (!cur.exists()) b.set(ref, { m: [u.uid, other].sort(), n: { [u.uid]: myN, [other]: otherN }, acc: accept ? { [u.uid]: true } : {}, seen: { [u.uid]: serverTimestamp() }, last: serverTimestamp() });
  else { const up = { last: serverTimestamp(), [`seen.${u.uid}`]: serverTimestamp() }; if (myN) up[`n.${u.uid}`] = myN; if (accept) up[`acc.${u.uid}`] = true; b.update(ref, up); }
  b.set(doc(collection(db, 'dm', pair, 'm')), { ...msg, u: u.uid, t: serverTimestamp() });
  await b.commit(); return pair;
}
/** Your conversations, newest first: [{ id, m, n, acc, seen, last }] (times in ms). */
export async function conversations() {
  const u = await signIn(), q = await getDocs(query(collection(db, 'dm'), where('m', 'array-contains', u.uid), limit(60)));
  const ms = v => v && v.toMillis ? v.toMillis() : 0;
  return q.docs.map(d => { const x = d.data(); return { id: d.id, m: x.m, n: x.n || {}, acc: x.acc || {}, seen: Object.fromEntries(Object.entries(x.seen || {}).map(([k, v]) => [k, ms(v)])), last: ms(x.last) }; }).sort((a, b) => b.last - a.last);
}
export async function messages(pair) {
  const q = await getDocs(query(collection(db, 'dm', pair, 'm'), orderBy('t', 'desc'), limit(60)));
  return q.docs.map(d => { const x = d.data(); return { id: d.id, ...x, t: x.t && x.t.toMillis ? x.t.toMillis() : Date.now() }; }).reverse();
}
export async function markSeen(pair) { const u = await signIn(); await updateDoc(doc(db, 'dm', pair), { [`seen.${u.uid}`]: serverTimestamp() }); }
export async function blocked() { const u = await signIn(), d = await getDoc(doc(db, 'bl', u.uid)); return d.exists() ? d.get('u') || [] : []; }
export async function block(other) { const u = await signIn(); await setDoc(doc(db, 'bl', u.uid), { u: arrayUnion(other) }, { merge: true }); }
export async function unblock(other) { const u = await signIn(), list = (await blocked()).filter(x => x !== other); await setDoc(doc(db, 'bl', u.uid), { u: list }); }
export async function report(other, pair, log) { const u = await signIn(); await setDoc(doc(collection(db, 'rep')), { by: u.uid, other, pair, log: String(log).slice(0, 5000), t: serverTimestamp() }); }

/** World wins board (Blip Sports): players with the most wins, best first: [{ n, s }]. */
export async function topWins(n = 10) {
  const snap = await getDocs(query(collection(db, 'wins'), orderBy('s', 'desc'), limit(n)));
  return snap.docs.map(d => ({ n: d.get('n'), s: d.get('s') }));
}

/** Add one win to this player's world total. The rules allow +1 per minute, so callers queue and retry. */
export async function addWin(name) {
  const u = await signIn(), ref = doc(db, 'wins', u.uid), cur = await getDoc(ref);
  await setDoc(ref, { n: name, s: (cur.exists() ? cur.get('s') : 0) + 1, t: serverTimestamp() });
}

/*
 * Cloud saves (shared/save.js): saves/{id} = { d: progress as JSON, t }. The id is a SHA-256 of the player's sync code,
 * so only someone with the code can find the save. Rules allow fetching one by id, never listing them.
 */
export async function loadSave(id) {
  const snap = await getDoc(doc(db, 'saves', id));
  return snap.exists() ? snap.get('d') : null;
}
export async function storeSave(id, data) {
  await signIn();
  await setDoc(doc(db, 'saves', id), { d: data, t: serverTimestamp() });
}
