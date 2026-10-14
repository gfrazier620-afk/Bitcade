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
 * The config below only identifies the project. firestore.rules (published in the Firebase console) protects the data.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, collection, query, orderBy, limit, getDocs, getDoc, setDoc, doc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js';

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
