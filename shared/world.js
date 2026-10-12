/*
 * World leaderboard on Firebase: Firestore Lite for reads and writes, plus anonymous auth for posting.
 * Loaded on demand by arcade.js and the lobby, so every page still works without it (offline, blocked, or down).
 *
 * Data: boards/{game}/scores/{id} = { n: 'ABC', s: 1234, uid, t }        all-time board
 *       daily/{game}/days/{YYYY-MM-DD}/scores/{id} = same shape          daily-challenge board
 *       players/{uid} = { last }                                          post cooldown
 * The config below only identifies the project. firestore.rules (published in the Firebase console) protects the data.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-lite.js';

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

const board = (game, day) => day ? collection(db, 'daily', game, 'days', day, 'scores') : collection(db, 'boards', game, 'scores');

/** Top n scores for a game, best first: [{ n, s }]. Pass day ('YYYY-MM-DD') for that day's daily-challenge board. */
export async function top(game, n = 10, day = null) {
  const snap = await getDocs(query(board(game, day), orderBy('s', 'desc'), limit(n)));
  return snap.docs.map(d => ({ n: d.get('n'), s: d.get('s') }));
}

/**
 * Post a score to the all-time board (all) and/or a daily board (day), in one write.
 * The rules allow one post every 10 seconds per player, so callers queue and retry.
 */
export async function post(game, name, score, { all = true, day = null } = {}) {
  const u = await signIn();
  const b = writeBatch(db);
  b.set(doc(db, 'players', u.uid), { last: serverTimestamp() });
  const entry = () => ({ n: name, s: score, uid: u.uid, t: serverTimestamp() });
  if (all) b.set(doc(board(game)), entry());
  if (day) b.set(doc(board(game, day)), entry());
  await b.commit();
}
