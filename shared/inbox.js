/*
 * Messages (lobby only): window.Inbox, the ✉ button in the top bar. Conversations start from challenges (shared/arcade.js
 * on game over): playing someone's challenge sends them your result, and anyone can send a challenge straight to a
 * player they've played. Or from FRIENDS: find a player by their player name and add them, which sends a friend request
 * ('f') and marks your side of the conversation accepted (acc); they add you back from the request. Everyone can use
 * quick chat (QUICK); free text unlocks once both sides have accepted (friends, or each played the other's challenge),
 * goes through a word filter, and either player can unfriend, block or report (a report sends the last messages to the
 * admin page). Firestore has no live updates in the Lite SDK, so an open
 * conversation checks for new messages every few seconds. The data and rules: shared/world.js, firestore.rules.
 */
window.Inbox = (() => {
  const QUICK = ['GG!', 'Nice score!', 'Rematch?', 'Beat that! 😎', 'So close!', 'Too easy 😏', 'You’re on! ⚔', 'Good luck!', 'Thanks!', '👍', '😂', '🔥',
    // the Sticker Pack prize: anyone can see these, only owners can send them
    '👾 GAME ON', '🏆 CHAMP', '💯', '🚀 TO THE MOON', '😤 ONE MORE GO', '🤝 RESPECT', '🎯 BULLSEYE', '😱 NO WAY', '🍕 PIZZA BREAK', '🕹️ PLAY ME', '👑 BOW DOWN', '💤 TOO EASY'];
  const quickN = () => window.PERKS && PERKS.own('stickers') ? QUICK.length : 12;
  // a short list of words that never belong in a kids' arcade; anything containing one is starred out
  const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'fag', 'nigg', 'slut', 'whore', 'asshole', 'bastard', 'retard', 'rape', 'cock', 'wank', 'twat', 'kys'];
  const clean = s => String(s).replace(/[\p{L}\p{N}]+/gu, w => BAD.some(b => w.toLowerCase().includes(b)) ? '*'.repeat(w.length) : w);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const name = g => String(g || '').split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
  const when = ms => { const d = Date.now() - ms; return d < 6e4 ? 'now' : d < 36e5 ? `${Math.floor(d / 6e4)}m` : d < 864e5 ? `${Math.floor(d / 36e5)}h` : `${Math.floor(d / 864e5)}d`; };
  let o = null, box = null, w = null, me = null, convos = [], blockedList = [], cur = null, msgs = [], poll = 0, busy = false, tab = 'msgs';
  const world = () => w ? Promise.resolve(w) : import('./world.js').then(m => (w = m)); // relative to this script, not the page
  const ini = () => { const n = get('arcade:initials'); return /^[A-Z]{3}$/.test(n || '') ? n : ''; };
  const other = c => c.m.find(x => x !== me);
  const friends = c => !!(c && c.acc[c.m[0]] && c.acc[c.m[1]]);
  const unread = c => c.last > (c.seen[me] || 0) + 1000;
  const safe = () => !!(window.SAFE && SAFE.on()); // under 13 (or not answered): quick chat only, no friends by name
  const asked = c => !!(c.acc[other(c)] && !c.acc[me]); // they've added you; you haven't added them back
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  // other players' profiles (profiles/{uid}: player name and character), so two players with the same initials differ
  const profs = {}, pres = {}; // profiles, and friends' presence (online in the last 3 minutes, and where)
  const online = uid => { const p = pres[uid]; return p && Date.now() - p.t < 180e3 ? p : null; };
  const where = p => p.on === 'lobby' ? 'IN THE LOBBY' : p.on === 'floor' ? 'ON THE ARCADE FLOOR' : 'PLAYING ' + String(p.on).split('-').join(' ').toUpperCase();
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
    const beat = () => { if (!document.hidden && get('bitcade:dm') === '1') world().then(m => m.beat(o.where ? o.where() : 'lobby')).catch(() => {}); };
    setTimeout(beat, 4000); setInterval(beat, 90000);
  }
  /** Look for new messages (the dot on the ✉ button). */
  async function refresh() {
    try { const m = await world(); me = me || await m.myId(); [convos, blockedList] = await Promise.all([m.conversations(), m.blocked()]); await learn(convos.map(other)); }
    catch (e) { return false; }
    if (convos.length) set('bitcade:dm', '1'); // game pages check for new messages only for players who have some
    // mutual friends: kept for the game pages' FRIENDS score tab and the arcade floor; and who's online
    const fr = convos.filter(c => friends(c) && !blockedList.includes(other(c)));
    set('bitcade:friends', JSON.stringify(fr.map(c => { const u = other(c), p = profs[u] || {}; return { uid: u, n: c.n[u] || '', name: p.name || '', av: p.av || '' }; })));
    if (fr.length) { const got = await w.presence(fr.map(other)).catch(() => ({})); Object.assign(pres, got); if (onFriends) onFriends(); }
    o.dot.hidden = !convos.some(c => !blockedList.includes(other(c)) && unread(c));
    return true;
  }

  function build() {
    box = document.createElement('div'); box.className = 'ib'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Messages');
    box.innerHTML = '<div class="ib-panel"><div class="ib-head"><button class="ib-back" aria-label="Back" hidden>‹</button><b class="ib-title">✉ MESSAGES</b><span class="ib-tools"></span><button class="ib-x" aria-label="Close">✕</button></div><div class="ib-body"></div><div class="ib-foot"></div></div>';
    // On a phone, tapping a button by the keyboard closes the keyboard first; the panel jumps and the click lands on the
    // backdrop. So the backdrop only closes the panel for a tap that started on it; otherwise the button pressed wins.
    let downOn = null;
    box.addEventListener('pointerdown', e => { downOn = e.target; }, true);
    box.addEventListener('click', e => {
      if (e.target === box) { const inside = downOn && downOn !== box && box.contains(downOn), b = inside && downOn.isConnected && downOn.closest('button'); downOn = null; if (b) b.click(); else if (!inside) close(); return; }
      if (e.target.closest('.ib-x')) return close();
      if (e.target.closest('.ib-back')) return list();
      const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; return list(); }
      if (e.target.closest('.ib-findgo')) return find();
      const af = e.target.closest('[data-addf]'); if (af) return addFriend(af.dataset.addf, af.dataset.n, af);
      const ac = e.target.closest('[data-addc]'); if (ac) { const c = convos.find(x => x.id === ac.dataset.addc) || cur; return c && addFriend(other(c), c.n[other(c)], ac); }
      if (e.target.closest('.ib-unf')) return unfriend(e.target.closest('.ib-unf'));
      const row = e.target.closest('[data-convo]'); if (row) return talk(convos.find(c => c.id === row.dataset.convo));
      const q = e.target.closest('[data-q]'); if (q) return send({ k: 'q', q: +q.dataset.q });
      if (e.target.closest('.ib-send')) return sendText();
      const play = e.target.closest('[data-play]'); if (play) { close(); return o.play(play.dataset.play); }
      if (e.target.closest('.ib-block')) return blockToggle();
      if (e.target.closest('.ib-report')) return reportIt(e.target.closest('.ib-report'));
      const ch = e.target.closest('[data-chal]'); if (ch) return showResults(ch);
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.classList.contains('ib-text')) { e.preventDefault(); sendText(); }
      if (e.key === 'Enter' && e.target.classList.contains('ib-name')) { e.preventDefault(); find(); }
    });
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

  const tabs = shown => { const n = shown.filter(asked).length;
    return `<div class="ib-tabs" role="tablist"><button data-tab="msgs" role="tab" aria-selected="${tab === 'msgs'}">MESSAGES</button><button data-tab="fr" role="tab" aria-selected="${tab === 'fr'}">FRIENDS${n ? ` <i>${n}</i>` : ''}</button></div>`; };
  const row = (c, extra = '') => `<div class="ib-frow"><button class="ib-row${unread(c) ? ' new' : ''}" data-convo="${esc(c.id)}"><span class="ib-face">${face(other(c))}${online(other(c)) ? '<i class="ib-on" title="Online now"></i>' : ''}</span><span class="ib-ini">${esc(them(c))}${profs[other(c)] && c.n[other(c)] ? ` <small>${esc(c.n[other(c)])}</small>` : ''}</span><span class="ib-sub">${extra}</span>${unread(c) ? '<i class="ib-dot"></i>' : ''}</button></div>`;
  function list() {
    cur = null; clearInterval(poll); head('✉ MESSAGES', false);
    const shown = convos.filter(c => !blockedList.includes(other(c)));
    if (tab === 'fr') return friendsList(shown);
    const sent = (() => { try { return JSON.parse(get('bitcade:chs') || '[]'); } catch (e) { return []; } })().slice(0, 8);
    body(tabs(shown) + (shown.length ? shown.map(c => row(c, `${friends(c) ? '<em class="fr">★ FRIENDS</em>' : asked(c) ? '<em class="ask">WANTS TO BE FRIENDS</em>' : c.acc[me] ? '<em>REQUEST SENT</em>' : '<em>CHALLENGE RIVALS</em>'}</span><span class="ib-when">${c.last ? when(c.last) : ''}`)).join('')
      : '<p class="ib-note">No messages yet. Add friends by their player name on the <b>FRIENDS</b> tab, or finish a game and press <b>⚔ CHALLENGE A FRIEND</b> to send someone a link.</p>') +
      (sent.length ? `<h4>CHALLENGES YOU SENT</h4>${sent.map(c => `<button class="ib-row ib-sent" data-chal="${esc(c.id)}"><span class="ib-ini">⚔</span><span class="ib-sub">${esc(name(c.g))} · YOUR ${(+c.s || 0).toLocaleString()}</span><span class="ib-when">${when(c.t)}</span></button><div class="ib-res" data-for="${esc(c.id)}" hidden></div>`).join('')}` : ''));
    foot('');
    if (window.Avatar) Avatar.fill(box);
  }
  /** FRIENDS: find a player by name, requests waiting for you, your friends, and requests you've sent. */
  function friendsList(shown) {
    const inc = shown.filter(asked), fr = shown.filter(friends), out = shown.filter(c => c.acc[me] && !c.acc[other(c)]);
    const sec = (title, l, extra) => l.length ? `<h4>${title}</h4>${l.map(c => row(c, extra(c))).join('')}` : '';
    body(tabs(shown) +
      (safe() ? '<p class="ib-note">Finding and adding friends by name is for players 13 and up. You can still play challenges and send quick chat.</p>' : '<div class="ib-find"><input class="ib-name" maxlength="12" placeholder="PLAYER NAME" aria-label="Player name" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="ib-findgo">FIND</button></div><div class="ib-found"></div>') +
      (inc.length && !safe() ? `<h4>WANT TO BE FRIENDS</h4>${inc.map(c => `<div class="ib-frow">${row(c, '<em class="ask">ADDED YOU</em>')}<button class="ib-add" data-addc="${esc(c.id)}">ADD BACK</button></div>`).join('')}` : '') +
      sec(`FRIENDS · ${fr.length}${fr.some(c => online(other(c))) ? ` · ${fr.filter(c => online(other(c))).length} ONLINE` : ''}`, fr.sort((a, b) => !!online(other(b)) - !!online(other(a))), c => online(other(c)) ? `<em class="on">● ${where(online(other(c)))}</em>` : '<em class="fr">★ FRIENDS</em>') +
      sec('REQUESTS SENT', out, () => '<em>WAITING FOR THEM</em>') +
      (inc.length || fr.length || out.length ? '' : '<p class="ib-note">Add friends by their player name. Once you’ve added each other you can chat freely.</p>'));
    foot('');
    if (window.Avatar) Avatar.fill(box);
  }
  async function find() {
    const inp = box.querySelector('.ib-name'), out = box.querySelector('.ib-found'); if (!inp || !out) return;
    const nm = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); inp.value = nm;
    const note = t => { out.innerHTML = `<p class="ib-note small">${t}</p>`; };
    if (!/^[A-Z0-9]{3,12}$/.test(nm)) return note('Player names are 3 to 12 letters or numbers.');
    if (nm === get('arcade:name')) return note('That’s you!');
    note('Looking…');
    let p = null; try { p = await w.findPlayer(nm); } catch (e) { return note('Couldn’t look just now. Try again.'); }
    if (!p) return note(`No player called ${esc(nm)}.`);
    if (p.uid === me) return note('That’s you!');
    profs[p.uid] = p;
    const c = convos.find(x => other(x) === p.uid);
    const act = c && friends(c) ? `<button class="ib-add" data-convo="${esc(c.id)}">MESSAGE</button>` : c && c.acc[me] ? '<span class="ib-sub"><em>REQUEST SENT</em></span>'
      : `<button class="ib-add" data-addf="${esc(p.uid)}" data-n="${esc(p.n || '')}">${c && asked(c) ? 'ADD BACK' : '＋ ADD FRIEND'}</button>`;
    out.innerHTML = `<div class="ib-who">${face(p.uid)}<span class="ib-ini">${esc(p.name)} <small>${esc(p.n || '')}</small></span>${act}</div>`;
    if (window.Avatar) Avatar.fill(out);
  }
  /** Add a friend: a friend request message, and your side of the conversation accepted. */
  async function addFriend(uid, theirN, btn) {
    if (busy || !uid || uid === me || safe()) return;
    const my = ini(); if (!my) { if (btn) btn.textContent = 'SET YOUR INITIALS FIRST'; return; }
    busy = true; if (btn) { btn.disabled = true; btn.textContent = 'ADDING…'; }
    try {
      await w.sendMsg(uid, /^[A-Z]{3}$/.test(theirN || '') ? theirN : '???', my, { k: 'f' }, { accept: true });
      set('bitcade:dm', '1'); await refresh(); busy = false;
      const c = convos.find(x => other(x) === uid);
      if (cur && c) { cur = null; talk(c); } else list();
    } catch (e) { busy = false; if (btn) { btn.disabled = false; btn.textContent = 'OFFLINE · TRY AGAIN'; } }
  }
  async function unfriend(btn) {
    const c = cur; if (!c) return;
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'TAP AGAIN'; setTimeout(() => { btn.dataset.armed = ''; btn.textContent = 'UNFRIEND'; }, 4000); return; }
    try { await w.setFriend(c.id, false); c.acc[me] = false; await refresh(); talk(convos.find(x => x.id === c.id) || c); } catch (e) { btn.textContent = 'OFFLINE'; }
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
    head(who, true, (safe() ? '' : c.acc[me] ? '<button class="ib-tool ib-unf">UNFRIEND</button>' : `<button class="ib-tool ib-add2" data-addc="${esc(c.id)}">＋ FRIEND</button>`) + `<button class="ib-tool ib-block">${blockedList.includes(other(c)) ? 'UNBLOCK' : 'BLOCK'}</button><button class="ib-tool ib-report">REPORT</button>`);
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
    const fFrom = new Set();
    const card = m => {
      const mine = m.u === me;
      if (m.k === 'f') { // a friend request; the second one, from the other side, makes them friends
        const both = fFrom.has(mine ? other(c) : me); fFrom.add(m.u);
        if (both) return `<div class="ib-card fr ${mine ? 'me' : ''}"><b>★ ${mine ? 'YOU ADDED ' + esc(who) + ' BACK' : esc(who) + ' ADDED YOU BACK'}</b><span>You’re friends now. Free chat is unlocked.</span></div>`;
        return `<div class="ib-card fr ${mine ? 'me' : ''}"><b>★ ${mine ? 'YOU SENT ' + esc(who) + ' A FRIEND REQUEST' : esc(who) + ' WANTS TO BE FRIENDS'}</b>${!mine && asked(c) && !safe() ? `<button class="ib-play" data-addc="${esc(c.id)}">ADD BACK</button>` : ''}</div>`;
      }
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
    foot(`<div class="ib-quick">${QUICK.slice(0, quickN()).map((t, i) => `<button data-q="${i}"${i >= 12 ? ' class="stk"' : ''}>${esc(t)}</button>`).join('')}</div>` +
      (friends(c) && !safe() ? `<div class="ib-type"><input class="ib-text" maxlength="200" placeholder="Message ${esc(them(c))}…" autocomplete="off"><button class="ib-send">SEND</button></div>`
        : safe() ? '<p class="ib-note small">Quick chat only. Typing messages is for players 13 and up.</p>' : `<p class="ib-note small">Free chat unlocks once you’re friends: ${c.acc[me] ? `waiting for ${esc(them(c))} to add you back.` : 'tap ＋ FRIEND above, and they add you back.'}</p>`));
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
  /** Friends online right now, for the lobby's ticker: [{ uid, name, on }]. */
  const onlineNow = () => Object.keys(pres).filter(u => online(u)).map(u => ({ uid: u, name: pres[u].name || (profs[u] || {}).name || '', on: pres[u].on, where: where(pres[u]) }));
  /** Friends for the arcade floor: [{ uid, name, av, fav, online }] (presence carries the favourite cabinet). */
  const forFloor = () => { let fr = []; try { fr = JSON.parse(get('bitcade:friends')) || []; } catch (e) {} return fr.map(f => { const p = pres[f.uid] || {}; return { uid: f.uid, name: p.name || f.name, av: p.av || f.av, fav: p.fav || '', online: !!online(f.uid) }; }).filter(f => f.name); };
  let onFriends = null;
  return { init, open, close, isOpen: () => !!box && !box.hidden, QUICK, clean, onlineNow, forFloor, onFriends: fn => { onFriends = fn; } };
})();
