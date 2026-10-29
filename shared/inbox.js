/*
 * Messages (lobby only): window.Inbox, the ✉ button in the top bar. Conversations start from challenges (shared/arcade.js
 * on game over): playing someone's challenge sends them your result, and anyone can send a challenge straight to a
 * player they've played. Everyone can use quick chat (QUICK); free text unlocks between two players who've each played
 * the other's challenge (acc in the conversation), goes through a word filter, and either player can block or report
 * (a report sends the last messages to the admin page). Firestore has no live updates in the Lite SDK, so an open
 * conversation checks for new messages every few seconds. The data and rules: shared/world.js, firestore.rules.
 */
window.Inbox = (() => {
  const QUICK = ['GG!', 'Nice score!', 'Rematch?', 'Beat that! 😎', 'So close!', 'Too easy 😏', 'You’re on! ⚔', 'Good luck!', 'Thanks!', '👍', '😂', '🔥'];
  // a short list of words that never belong in a kids' arcade; anything containing one is starred out
  const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'fag', 'nigg', 'slut', 'whore', 'asshole', 'bastard', 'retard', 'rape', 'cock', 'wank', 'twat', 'kys'];
  const clean = s => String(s).replace(/[\p{L}\p{N}]+/gu, w => BAD.some(b => w.toLowerCase().includes(b)) ? '*'.repeat(w.length) : w);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const name = g => String(g || '').split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
  const when = ms => { const d = Date.now() - ms; return d < 6e4 ? 'now' : d < 36e5 ? `${Math.floor(d / 6e4)}m` : d < 864e5 ? `${Math.floor(d / 36e5)}h` : `${Math.floor(d / 864e5)}d`; };
  let o = null, box = null, w = null, me = null, convos = [], blockedList = [], cur = null, msgs = [], poll = 0, busy = false;
  const world = () => w ? Promise.resolve(w) : import('./world.js').then(m => (w = m)); // relative to this script, not the page
  const ini = () => { const n = get('arcade:initials'); return /^[A-Z]{3}$/.test(n || '') ? n : ''; };
  const other = c => c.m.find(x => x !== me);
  const friends = c => !!(c && c.acc[c.m[0]] && c.acc[c.m[1]]);
  const unread = c => c.last > (c.seen[me] || 0) + 1000;
  // other players' profiles (profiles/{uid}: player name and character), so two players with the same initials differ
  const profs = {};
  const them = c => { const p = profs[other(c)]; return p && p.name ? p.name : c.n[other(c)] || '???'; };
  const face = uid => { const p = profs[uid]; return p && p.av && window.Avatar ? `<canvas class="ib-av" data-av="${esc(p.av)}"></canvas>` : '<i class="ib-av"></i>'; };
  async function learn(uids) {
    const want = [...new Set(uids)].filter(u => u && !(u in profs)); if (!want.length) return;
    const got = await w.profiles(want).catch(() => ({})); for (const u of want) profs[u] = got[u] || null;
  }

  /** opts: { btn, dot, play(href) } */
  function init(opts) {
    o = opts;
    o.btn.addEventListener('click', () => open());
    refresh();
    setInterval(() => { if (!document.hidden && (!box || box.hidden)) refresh(); }, 60000);
  }
  /** Look for new messages (the dot on the ✉ button). */
  async function refresh() {
    try { const m = await world(); me = me || await m.myId(); [convos, blockedList] = await Promise.all([m.conversations(), m.blocked()]); await learn(convos.map(other)); }
    catch (e) { return false; }
    o.dot.hidden = !convos.some(c => !blockedList.includes(other(c)) && unread(c));
    return true;
  }

  function build() {
    box = document.createElement('div'); box.className = 'ib'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Messages');
    box.innerHTML = '<div class="ib-panel"><div class="ib-head"><button class="ib-back" aria-label="Back" hidden>‹</button><b class="ib-title">✉ MESSAGES</b><span class="ib-tools"></span><button class="ib-x" aria-label="Close">✕</button></div><div class="ib-body"></div><div class="ib-foot"></div></div>';
    box.addEventListener('click', e => {
      if (e.target === box || e.target.closest('.ib-x')) return close();
      if (e.target.closest('.ib-back')) return list();
      const row = e.target.closest('[data-convo]'); if (row) return talk(convos.find(c => c.id === row.dataset.convo));
      const q = e.target.closest('[data-q]'); if (q) return send({ k: 'q', q: +q.dataset.q });
      if (e.target.closest('.ib-send')) return sendText();
      const play = e.target.closest('[data-play]'); if (play) { close(); return o.play(play.dataset.play); }
      if (e.target.closest('.ib-block')) return blockToggle();
      if (e.target.closest('.ib-report')) return reportIt(e.target.closest('.ib-report'));
      const ch = e.target.closest('[data-chal]'); if (ch) return showResults(ch);
    });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('ib-text')) { e.preventDefault(); sendText(); } });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) { e.preventDefault(); e.stopImmediatePropagation(); if (cur) list(); else close(); } }, true);
    box.setAttribute('data-keys-native', '');
    document.body.append(box);
  }
  /** Open the panel: the list, or straight into a conversation with a player (uid; cn: their initials, for a new one). */
  async function open(uid, cn) {
    if (!box) build();
    box.hidden = false; document.documentElement.classList.add('ib-open'); box.querySelector('.ib-x').focus();
    body('<p class="ib-note">Loading…</p>'); foot('');
    if (!(await refresh())) { body('<p class="ib-note">Messages need a connection. Try again in a moment.</p>'); return; }
    if (uid && uid !== me) {
      await learn([uid]);
      const c = convos.find(c => other(c) === uid) || { id: w.pairOf(me, uid), m: [me, uid].sort(), n: { [uid]: /^[A-Z]{3}$/.test(cn || '') ? cn : '???' }, acc: {}, seen: {}, last: 0, fresh: true };
      return talk(c);
    }
    list();
  }
  function close() { if (!box) return; box.hidden = true; document.documentElement.classList.remove('ib-open'); clearInterval(poll); cur = null; refresh(); }
  const body = h => { box.querySelector('.ib-body').innerHTML = h; };
  const foot = h => { box.querySelector('.ib-foot').innerHTML = h; };
  const head = (title, back, tools = '') => { box.querySelector('.ib-title').textContent = title; box.querySelector('.ib-back').hidden = !back; box.querySelector('.ib-tools').innerHTML = tools; };

  function list() {
    cur = null; clearInterval(poll); head('✉ MESSAGES', false);
    const shown = convos.filter(c => !blockedList.includes(other(c)));
    const sent = (() => { try { return JSON.parse(get('bitcade:chs') || '[]'); } catch (e) { return []; } })().slice(0, 8);
    body((shown.length ? shown.map(c => `<button class="ib-row${unread(c) ? ' new' : ''}" data-convo="${esc(c.id)}">${face(other(c))}<span class="ib-ini">${esc(them(c))}${profs[other(c)] && c.n[other(c)] ? ` <small>${esc(c.n[other(c)])}</small>` : ''}</span><span class="ib-sub">${friends(c) ? '<em class="fr">★ FRIENDS</em>' : '<em>CHALLENGE RIVALS</em>'}</span><span class="ib-when">${c.last ? when(c.last) : ''}</span>${unread(c) ? '<i class="ib-dot"></i>' : ''}</button>`).join('')
      : '<p class="ib-note">No messages yet. Finish a game and press <b>⚔ CHALLENGE A FRIEND</b> to send someone a link. When they play it, their result shows up here and you can chat.</p>') +
      (sent.length ? `<h4>CHALLENGES YOU SENT</h4>${sent.map(c => `<button class="ib-row ib-sent" data-chal="${esc(c.id)}"><span class="ib-ini">⚔</span><span class="ib-sub">${esc(name(c.g))} · YOUR ${(+c.s || 0).toLocaleString()}</span><span class="ib-when">${when(c.t)}</span></button><div class="ib-res" data-for="${esc(c.id)}" hidden></div>`).join('')}` : ''));
    foot('');
    if (window.Avatar) Avatar.fill(box);
  }
  async function showResults(btn) {
    const id = btn.dataset.chal, out = box.querySelector(`.ib-res[data-for="${id}"]`); if (!out) return;
    if (!out.hidden) { out.hidden = true; return; }
    out.hidden = false; out.textContent = 'Loading…';
    try {
      const r = (await w.challengeResults(id)).filter(x => /^[A-Z]{3}$/.test(x.n)).sort((a, b) => b.s - a.s);
      out.innerHTML = r.length ? r.map(x => `<div><span>${esc(x.n)}</span><b>${(+x.s || 0).toLocaleString()}</b></div>`).join('') : '<p class="ib-note">Nobody has played it yet.</p>';
    } catch (e) { out.textContent = 'Couldn’t load. Try again.'; }
  }

  async function talk(c) {
    if (!c) return;
    cur = c; const who = them(c);
    head(who, true, `<button class="ib-tool ib-block">${blockedList.includes(other(c)) ? 'UNBLOCK' : 'BLOCK'}</button><button class="ib-tool ib-report">REPORT</button>`);
    body('<p class="ib-note">Loading…</p>'); drawFoot();
    await load();
    clearInterval(poll); poll = setInterval(() => { if (!document.hidden && cur === c) load(); }, 5000);
  }
  async function load() {
    const c = cur; if (!c) return;
    try { msgs = c.fresh ? [] : await w.messages(c.id); } catch (e) { msgs = []; }
    if (cur !== c) return;
    const fresh = await w.conversations().catch(() => null); if (fresh) { convos = fresh; const n = convos.find(x => x.id === c.id); if (n) { Object.assign(c, n, { fresh: false }); } }
    draw();
    if (!c.fresh && unread(c)) w.markSeen(c.id).then(() => { c.seen[me] = Date.now(); }).catch(() => {});
  }
  function draw() {
    const c = cur, el = box.querySelector('.ib-body'), atEnd = el.scrollTop + el.clientHeight > el.scrollHeight - 30, who = them(c);
    const card = m => {
      const mine = m.u === me;
      if (m.k === 'ch') return `<div class="ib-card ${mine ? 'me' : ''}"><b>⚔ ${mine ? 'YOU CHALLENGED ' + esc(who) : esc(who) + ' CHALLENGES YOU'}</b><span>${esc(name(m.g))} · ${(+m.s || 0).toLocaleString()} TO BEAT</span>${mine ? '' : `<button class="ib-play" data-play="games/${esc(m.g)}/?ch=${esc(m.c)}">PLAY IT ▶</button>`}</div>`;
      if (m.k === 'res') { const win = m.s > m.vs; return `<div class="ib-card res ${mine ? 'me' : ''}${win ? ' win' : ''}"><b>${mine ? 'YOU' : esc(who)} SCORED ${(+m.s || 0).toLocaleString()}</b><span>${esc(name(m.g))} · against ${(+m.vs || 0).toLocaleString()} · ${win ? (mine ? 'YOU WON ★' : esc(who) + ' WON') : (mine ? 'NOT YET' : 'YOU’RE STILL AHEAD')}</span>${mine ? '' : `<button class="ib-play" data-play="games/${esc(m.g)}/">PLAY ${esc(name(m.g).toUpperCase())} ▶</button>`}</div>`; }
      const text = m.k === 'q' ? QUICK[m.q] || '…' : clean(m.x || '');
      return `<div class="ib-msg ${mine ? 'me' : ''}"><span>${esc(text)}</span><small>${when(m.t)}</small></div>`;
    };
    el.innerHTML = msgs.length ? msgs.map(card).join('') : `<p class="ib-note">Say hi to ${esc(who)}!</p>`;
    if (atEnd || el.dataset.first !== c.id) { el.scrollTop = el.scrollHeight; el.dataset.first = c.id; }
    drawFoot();
  }
  function drawFoot() {
    const c = cur; if (!c) return;
    if (blockedList.includes(other(c))) { foot('<p class="ib-note">You’ve blocked this player. Unblock them to send messages.</p>'); return; }
    const keep = box.querySelector('.ib-text'), val = keep ? keep.value : '';
    foot(`<div class="ib-quick">${QUICK.map((t, i) => `<button data-q="${i}">${esc(t)}</button>`).join('')}</div>` +
      (friends(c) ? `<div class="ib-type"><input class="ib-text" maxlength="200" placeholder="Message ${esc(them(c))}…" autocomplete="off"><button class="ib-send">SEND</button></div>`
        : '<p class="ib-note small">Free chat unlocks once you’ve both played each other’s challenge.</p>'));
    const t = box.querySelector('.ib-text'); if (t && val) { t.value = val; }
  }
  async function send(msg) {
    const c = cur; if (!c || busy) return;
    const my = ini(); if (!my) { foot('<p class="ib-note">Set your initials on your PROFILE first, so they know who you are.</p>'); return; }
    busy = true;
    try { await w.sendMsg(other(c), c.n[other(c)] || '???', my, msg); c.fresh = false; await load(); }
    catch (e) { foot('<p class="ib-note">Couldn’t send. Wait a second and try again.</p>'); setTimeout(drawFoot, 2500); }
    busy = false;
  }
  function sendText() {
    const t = box.querySelector('.ib-text'); if (!t) return;
    const x = clean(t.value.trim()).slice(0, 200); if (!x) return;
    t.value = ''; send({ k: 'x', x });
  }
  async function blockToggle() {
    const c = cur, id = other(c), was = blockedList.includes(id);
    try { if (was) await w.unblock(id); else await w.block(id); blockedList = was ? blockedList.filter(x => x !== id) : [...blockedList, id]; } catch (e) { return; }
    if (was) talk(c); else list();
  }
  async function reportIt(btn) {
    const c = cur, who = them(c);
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'TAP AGAIN TO REPORT'; setTimeout(() => { btn.dataset.armed = ''; btn.textContent = 'REPORT'; }, 4000); return; }
    const log = msgs.slice(-30).map(m => `[${new Date(m.t).toISOString().slice(0, 16)}] ${m.u === me ? 'ME' : who}: ${m.k === 'x' ? m.x : m.k === 'q' ? QUICK[m.q] : m.k + ' ' + m.g + ' ' + m.s}`).join('\n');
    try { await w.report(other(c), c.id, log); btn.textContent = 'REPORTED ✓'; } catch (e) { btn.textContent = 'OFFLINE'; }
  }
  return { init, open, close, isOpen: () => !!box && !box.hidden, QUICK, clean };
})();
