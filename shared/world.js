/*
 * World leaderboard on Firebase: Firestore Lite for reads and writes, plus anonymous auth for posting.
 * Loaded on demand by arcade.js and the lobby, so every page still works without it (offline, blocked, or down).
 *
 * Data: boards/{game}/scores/{id} = { n: 'ABC', s: 1234, uid, t }   and   players/{uid} = { last }  (post cooldown)
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

/** Top n scores for a game, best first: [{ n, s }]. */
export async function top(game, n = 10) {
  const snap = await getDocs(query(collection(db, 'boards', game, 'scores'), orderBy('s', 'desc'), limit(n)));
  return snap.docs.map(d => ({ n: d.get('n'), s: d.get('s') }));
}

/** Post a score. The rules allow one post every 10 seconds per player, so callers queue and retry. */
export async function post(game, name, score) {
  const u = await signIn();
  const b = writeBatch(db);
  b.set(doc(db, 'players', u.uid), { last: serverTimestamp() });
  b.set(doc(collection(db, 'boards', game, 'scores')), { n: name, s: score, uid: u.uid, t: serverTimestamp() });
  await b.commit();
}
