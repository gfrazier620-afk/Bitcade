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
 *       names/{NAME} = { u: [uids], h: sha256 of the name's key, t }    player names, one owner each (shared/setup.js)
 *       nameproof/{uid} = { name, k }                                     the key, when another device joins a name
 *       profiles/{uid} = { name, n: initials, av: avatar, t }             what other players see
 * The config below only identifies the project. firestore.rules (published in the Firebase console) protects the data.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, limit, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js';

const app = initializeApp({
  apiKey: 'AIzaSyAPy1xQoxSHA64Efns07QCNw7ASNIWQpOQ',
  authDomain: 'bitcade-4fa25.firebaseapp.com',
  projectId: 'bitcade-4fa25',
  storageBucket: 'bitcade-4fa25.firebasestorage.app',
  messagingSenderId: '543242117072',
  appId: '1:543242117072:web:d95c092bebfd02333ba3d5'
});
const db = getFirestore(app);

let user = null, authLib = null;
const lib = () => authLib || (authLib = import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'));
/**
 * Sign in, only when needed. Whoever is signed in on this device stays signed in: an anonymous player (each device its
 * own), or a player linked to Google, the same on every device that signs in with that Google account.
 */
async function signIn() {
  if (user) return user;
  const { getAuth, signInAnonymously } = await lib(), auth = getAuth(app);
  await auth.authStateReady();
  user = auth.currentUser || (await signInAnonymously(auth)).user;
  return user;
}
/*
 * Google, for one player on every device (messages, friends, presence and challenges belong to the signed-in player).
 * Link on the device that has your friends; on another device the same Google account then signs in as that player.
 * Returns { state: 'ok', switched } (switched: this device became another device's player), or 'redirect' (the page is
 * going to Google and back; finishLink() completes it).
 */
export async function account() { const u = await signIn(), g = u.providerData.find(p => p.providerId === 'google.com'); return { google: !!g, email: g ? g.email || '' : '', uid: u.uid }; }
// a Google account that already has a player (another device's, or one made by signing in to the admin page):
// Firebase names it one of these ways depending on the project's settings
const IN_USE = /credential-already-in-use|email-already-in-use|account-exists-with-different-credential/;
let pending = null; // that Google account's sign-in, kept until the player says to switch
const taken = (A, e) => { pending = A.GoogleAuthProvider.credentialFromError(e); if (!pending) throw e; return { state: 'taken', email: (e.customData && e.customData.email) || '' }; };
export async function linkGoogle() {
  const A = await lib(), auth = A.getAuth(app), u = await signIn(), p = new A.GoogleAuthProvider();
  try { await A.linkWithPopup(u, p); }
  catch (e) {
    if (IN_USE.test(e.code || '')) return taken(A, e);
    if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(e.code || '')) { try { sessionStorage.setItem('bitcade:linking', '1'); } catch (x) {} await A.linkWithRedirect(u, p); return { state: 'redirect' }; }
    if (e.code !== 'auth/provider-already-linked') throw e;
  }
  user = auth.currentUser; return { state: 'ok', switched: false };
}
/** That Google account already had a player: make this device that player (what was only on this device stays behind). */
export async function switchToGoogle() {
  const A = await lib(), auth = A.getAuth(app); if (!pending) throw new Error('nothing to switch to');
  await A.signInWithCredential(auth, pending); pending = null; user = auth.currentUser; return { state: 'ok', switched: true };
}
export const pendingSwitch = () => !!pending;
/** After coming back from Google (linkWithRedirect): finish linking, or sign in as the player that Google account has. */
export async function finishLink() {
  const A = await lib(), auth = A.getAuth(app); await auth.authStateReady(); const was = auth.currentUser && auth.currentUser.uid;
  try { await A.getRedirectResult(auth); }
  catch (e) { if (IN_USE.test(e.code || '')) return taken(A, e); throw e; }
  user = auth.currentUser; return { switched: !!user && user.uid !== was };
}
/** Sign out on this device (a shared computer): the next visit is a new anonymous player here. */
export async function signOutHere() { const A = await lib(); await A.signOut(A.getAuth(app)); user = null; }

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

/* ---------- player names and profiles (shared/setup.js) ---------- */
/** Who has a name: null when it's free, else { u: [uids], h: its key's hash }. */
export async function nameOwner(name) { const d = await getDoc(doc(db, 'names', name)); return d.exists() ? { u: d.get('u') || [], h: d.get('h') || '' } : null; }
/**
 * Take a name (or join it from another device of the same player, proving the key) and publish the profile, in one
 * write. Returns 'ok', 'taken' (someone else's) or 'full' (10 devices on it already).
 */
export async function claimName(name, key, h, profile) {
  const u = await signIn(), ref = doc(db, 'names', name), cur = await getDoc(ref), b = writeBatch(db);
  const prof = { name, n: profile.n, av: profile.av, t: serverTimestamp() };
  if (!cur.exists()) b.set(ref, { u: [u.uid], h, t: serverTimestamp() });
  else if (!(cur.get('u') || []).includes(u.uid)) {
    if (cur.get('h') !== h) return 'taken';
    if ((cur.get('u') || []).length >= 10) return 'full';
    b.set(doc(db, 'nameproof', u.uid), { name, k: key });
    b.update(ref, { u: arrayUnion(u.uid) });
  }
  b.set(doc(db, 'profiles', u.uid), prof);
  await b.commit();
  return 'ok';
}
/** Let go of a name this device had (after a rename): the last device on it frees it for anyone. */
export async function releaseName(name) {
  const u = await signIn(), ref = doc(db, 'names', name), cur = await getDoc(ref);
  if (!cur.exists() || !(cur.get('u') || []).includes(u.uid)) return;
  if ((cur.get('u') || []).length <= 1) await deleteDoc(ref); else await updateDoc(ref, { u: arrayRemove(u.uid) });
}
/** Other players' profiles: { uid: { name, n, av } } for the ones that have one. */
export async function profiles(uids) {
  const out = {};
  await Promise.all([...new Set(uids)].filter(Boolean).map(async id => { try { const d = await getDoc(doc(db, 'profiles', id)); if (d.exists()) out[id] = { name: d.get('name'), n: d.get('n'), av: d.get('av'), t: d.get('t') && d.get('t').toMillis ? d.get('t').toMillis() : 0 }; } catch (e) {} }));
  return out;
}
/**
 * A player by their player name, for adding a friend: { uid, name, n, av }, or null. A name can be on several of the
 * player's devices; messages go to the one whose profile changed last.
 */
export async function findPlayer(name) {
  const o = await nameOwner(name); if (!o || !o.u.length) return null;
  const p = await profiles(o.u), best = o.u.filter(u => p[u] && p[u].name === name).sort((a, b) => p[b].t - p[a].t)[0];
  return best ? { uid: best, ...p[best] } : null;
}
/*
 * Presence (friends online, and friends on the arcade floor): presence/{uid} = { t, on (the page: a game's slug,
 * 'lobby' or 'floor'), fav (the game played most), name, n, av }. Written every 90 s while a page is showing, by
 * players who have friends; only mutual friends can read it (firestore.rules).
 */
export async function beat(on) {
  const g = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const name = g('arcade:name'), n = g('arcade:initials'), av = g('arcade:avatar');
  if (!/^[A-Z0-9]{3,12}$/.test(name) || !/^[A-Z]{3}$/.test(n) || !/^\d{1,2}(-\d{1,2}){5}$/.test(av)) return;
  let fav = '', most = 0; try { for (const k of Object.keys(localStorage)) if (k.startsWith('arcade:plays:') && +g(k) > most) { most = +g(k); fav = k.slice(13); } } catch (e) {}
  const u = await signIn();
  await setDoc(doc(db, 'presence', u.uid), { t: serverTimestamp(), on: String(on || 'lobby').slice(0, 40), fav: fav.slice(0, 40), name, n, av });
}
/**
 * The friends board for a game: the best score of each of these players (your friends and you) on the all-time board,
 * best first: [{ n, s, uid }]. Scores carry the uid that posted them, so this is one query (up to 30 players).
 */
export async function friendsTop(game, uids) {
  const ids = [...new Set(uids)].filter(Boolean).slice(0, 30); if (!ids.length) return [];
  const snap = await getDocs(query(collection(db, 'boards', game, 'scores'), where('uid', 'in', ids)));
  const best = {}; snap.docs.forEach(d => { const x = d.data(); if (!best[x.uid] || x.s > best[x.uid].s) best[x.uid] = { n: x.n, s: x.s, uid: x.uid }; });
  return Object.values(best).sort((a, b) => b.s - a.s).slice(0, 10);
}
/*
 * The live feed (the lobby's ticker): feed/{id} = { k: 'top' (a world top-3 score) | 'master' (a cabinet mastered) |
 * 'level' (every fifth level), g, n, name, s, r, lv, uid, t }. Only set kinds and fields, so nothing free-form shows.
 */
export async function feedPost(item) {
  const g = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const name = g('arcade:name'), n = g('arcade:initials'); if (!/^[A-Z0-9]{3,12}$/.test(name) || !/^[A-Z]{3}$/.test(n)) return;
  const u = await signIn();
  await setDoc(doc(collection(db, 'feed')), { k: item.k, g: String(item.g || '').slice(0, 40), n, name, s: Math.max(0, Math.floor(+item.s || 0)), r: Math.max(0, Math.floor(+item.r || 0)), lv: Math.max(0, Math.floor(+item.lv || 0)), uid: u.uid, t: serverTimestamp() });
}
export async function feed(n = 15) {
  const snap = await getDocs(query(collection(db, 'feed'), orderBy('t', 'desc'), limit(n)));
  return snap.docs.map(d => { const x = d.data(); return { ...x, t: x.t && x.t.toMillis ? x.t.toMillis() : 0 }; });
}
/** Friends' presence: { uid: { t (ms), on, fav, name, n, av } } for the ones that have any (and can be read). */
export async function presence(uids) {
  const out = {}; await signIn();
  await Promise.all([...new Set(uids)].filter(Boolean).slice(0, 40).map(async id => { try { const d = await getDoc(doc(db, 'presence', id)); if (d.exists()) { const x = d.data(); out[id] = { ...x, t: x.t && x.t.toMillis ? x.t.toMillis() : 0 }; } } catch (e) {} }));
  return out;
}
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
/** Add or remove a friend in a conversation that already exists (your own acceptance, acc). */
export async function setFriend(pair, on) { const u = await signIn(); await updateDoc(doc(db, 'dm', pair), { [`acc.${u.uid}`]: !!on }); }
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
