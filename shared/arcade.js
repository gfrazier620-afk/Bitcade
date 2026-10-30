/* Arcade kit: high scores, sound, keyboard + touch input, canvas sizing, fixed-step loop, overlay. */
(() => {
  const A = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  A.store = store;
  /* Errors on this page, for the admin page (shared/activity.js sends them; off with the same switch as play activity). */
  const errSeen = new Set();
  const errQ = (m, s, l) => {
    try {
      if (store.get('arcade:track') === '0' || !m || /^Script error\.?$|ResizeObserver loop/.test(m)) return;
      if (s && !String(s).startsWith(location.origin)) return; // browser extensions and other sites
      const k = m + '|' + s + '|' + l; if (errSeen.has(k) || errSeen.size > 8) return; errSeen.add(k);
      const q = JSON.parse(store.get('bitcade:errq') || '[]');
      q.push({ m: String(m).slice(0, 300), s: String(s || '').replace(location.origin, '').slice(0, 200), l: +l || 0, g: (document.body && document.body.dataset.game) || 'game', at: Date.now() });
      store.set('bitcade:errq', JSON.stringify(q.slice(-20)));
    } catch (e) {}
  };
  addEventListener('error', e => errQ(e.message, e.filename, e.lineno));
  addEventListener('unhandledrejection', e => { const r = e.reason; errQ('Unhandled promise: ' + (r && (r.message || r)), r && r.stack ? (/https?:[^\s)]+/.exec(r.stack) || [''])[0].replace(/:\d+:\d+$/, '') : '', 0); });
  const $ = id => document.getElementById(id);

  /* ---------- scores ---------- */
  A.id = document.body.dataset.game || 'game';
  A.best = () => +store.get('arcade:best:' + A.id) || 0;
  A.setScore = n => { const e = $('score'); if (e) e.textContent = n; };
  A.showBest = () => { const e = $('best'); if (e) e.textContent = A.best(); };
  /** Top-10 table: [{ n: 'ABC', s: 1234 }], best first. An old single best score seeds it as '???'. */
  const topKey = 'arcade:top:' + A.id;
  A.top = () => {
    let t = null; try { t = JSON.parse(store.get(topKey)); } catch (e) {}
    if (Array.isArray(t)) return t;
    const b = A.best(); return b > 0 ? [{ n: '???', s: b }] : [];
  };
  /** Local date as YYYY-MM-DD, for daily challenges. */
  A.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  /** The weekly tournament (shared/badges.js): is this page's game the featured one this week, and the week's id. */
  const WK = window.WEEKLY;
  A.featured = () => !!WK && WK.game() === A.id;
  A.week = () => WK ? WK.key() : null;
  /** Seeded random (0..1) from a string, so everyone gets the same sequence for the same key (e.g. 'stackdown:' + A.today()). */
  A.seeded = key => {
    let h = 1779033703 ^ key.length;
    for (let i = 0; i < key.length; i++) { h = Math.imul(h ^ key.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let a = h >>> 0;
    return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  };
  /* ---------- world leaderboard (shared/world.js, Firebase, loaded on demand) ---------- */
  const KIT_URL = document.currentScript ? document.currentScript.src : location.href;
  let worldMod = null;
  /** The world module, imported the first time it's needed. Rejects when offline or blocked; callers fall back to local. */
  A.world = () => worldMod || (worldMod = import(new URL('world.js', KIT_URL).href).catch(e => { worldMod = null; throw e; }));
  // Scores waiting to post. Kept in localStorage so games played offline post later. The server allows
  // one post per player every 10 s, so the queue sends one at a time and retries a few times.
  // Entry: { id, g: game, n: initials, s: score, all: post to the all-time board, d: daily date or null, w: tournament week or null }.
  const outbox = () => { try { const q = JSON.parse(store.get('arcade:outbox')); return Array.isArray(q) ? q : []; } catch (e) { return []; } };
  const saveOutbox = q => store.set('arcade:outbox', JSON.stringify(q));
  let flushing = false;
  function flush() {
    const q = outbox(); if (flushing || !q.length) return;
    flushing = true; const e = q[0];
    A.world().then(w => e.k === 'win' ? w.addWin(e.n) : w.post(e.g, e.n, e.s, { all: e.all !== false, day: e.d || null, week: e.w || null })).then(() => {
      saveOutbox(outbox().filter(x => x.id !== e.id)); flushing = false;
      if (e.g === A.id && shown && overlayOpen()) loadWorld();
      if (outbox().length) setTimeout(flush, 11000);
    }, () => {
      saveOutbox(outbox().map(x => x.id === e.id ? { ...x, tries: (x.tries || 0) + 1 } : x).filter(x => (x.tries || 0) < 6));
      flushing = false; if (outbox().length) setTimeout(flush, 15000);
    });
  }
  addEventListener('online', flush);
  const queuePost = (n, s, all, d, w) => {
    if (A.id === 'game' || (!all && !d && !w)) return;
    saveOutbox([...outbox(), { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), g: A.id, n, s, all, d, w }]); flush();
  };
  /** Count one more win on the world wins board (Blip Sports). The server allows one per player per minute. */
  A.postWin = n => { if (!/^[A-Z]{3}$/.test(n)) return; saveOutbox([...outbox(), { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), k: 'win', n }]); flush(); };

  /* ---------- badges (definitions in shared/badges.js, loaded before this script) ---------- */
  const badgeKey = 'arcade:badges:' + A.id;
  A.badgeList = () => (window.BADGES && window.BADGES[A.id]) || [];
  let gotCache = null; // games may call A.badge every frame, so the unlocked list is read from storage once
  A.badgesGot = () => {
    if (!gotCache) { try { const b = JSON.parse(store.get(badgeKey)); gotCache = Array.isArray(b) ? b : []; } catch (e) { gotCache = []; } }
    return gotCache;
  };
  /** Unlock a badge once, with a toast and a jingle. Unknown ids are ignored. */
  A.badge = id => {
    if (A.demo || runEasy) return;
    const got = A.badgesGot();
    if (got.includes(id)) return;
    const def = A.badgeList().find(b => b.id === id);
    if (!def) return;
    gotCache = [...got, id]; store.set(badgeKey, JSON.stringify(gotCache));
    setTimeout(() => A.mission({ type: 'badge', id }), 0); // weekly missions count badges
    if (window.TICKETS) TICKETS.add(10);
    A.gainXP(50, 'badge');
    toast(`★ BADGE · ${def.name} · +10 TICKETS`); A.jingle([659, 880, 1175, 1568], 0.07, 'triangle');
    if (mastered()) { // the last badge: this cabinet turns gold
      setTimeout(() => { toast('★ CABINET MASTERED · GOLD MARQUEE UNLOCKED'); A.jingle([523, 659, 784, 1047, 1319, 1568], 0.08, 'square'); A.flash('#ffd23d', 0.3); }, 900);
      setMastered();
    }
    if (shown && overlayOpen()) renderHS();
  };
  /** Every badge for this game earned: the cabinet is mastered and goes gold (body.mastered, styled in arcade.css). */
  const mastered = () => A.badgeList().length > 0 && A.badgeList().every(b => A.badgesGot().includes(b.id));
  function setMastered() {
    document.body.classList.add('mastered');
    const strip = document.querySelector('.bezel-top');
    if (strip && !strip.querySelector('.plaque')) { const pl = document.createElement('span'); pl.className = 'plaque'; pl.textContent = '★ MASTERED ★'; strip.querySelector('.sc') ? strip.querySelector('.sc').after(pl) : strip.prepend(pl); }
  }
  /**
   * A short message at the top of the screen, one at a time: more wait their turn (a repeat of one already waiting is
   * dropped), so they never stack. Styled inline so pages without arcade.css (Blip Sports) get it too.
   */
  const toastQ = []; let toastOn = false;
  function toast(text) { if (toastQ.includes(text)) return; toastQ.push(text); if (!toastOn) nextToast(); }
  function nextToast() {
    const text = toastQ.shift(); toastOn = text != null; if (!toastOn) return;
    const t = document.createElement('div');
    t.className = 'arcade-toast'; t.textContent = text; t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;left:50%;top:64px;transform:translate(-50%,-12px);z-index:50;padding:9px 16px;border-radius:10px;' +
      'background:#1f1940;border:1px solid #ffd23d;color:#ffd23d;font:13px Silkscreen,ui-monospace,monospace;letter-spacing:.04em;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.5);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap';
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translate(-50%,0)'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => { t.remove(); nextToast(); }, 300); }, toastQ.length ? 2000 : 2600);
  }
  A.toast = toast;


  /*
   * Challenges (the messages are in the lobby, shared/inbox.js). ?ch=<id> on a game page loads one: someone's score on
   * this game. The title screen says so; your best against it goes back to them as a result message (which counts as
   * accepting it: once two players have each played the other's challenge they can chat freely); game over says who's
   * ahead. Any scoring run can start a challenge (a link to send) or, against a challenger, challenge them back.
   */
  const world = () => A.world();
  A.chal = null;
  const ini = () => { const n = store.get('arcade:initials'); return /^[A-Z]{3}$/.test(n || '') ? n : ''; };
  const chalBanner = () => A.chal ? `<div class="chal">${A.chal.mine ? `⚔ YOUR CHALLENGE · ${A.chal.s.toLocaleString()} TO BEAT` : `⚔ ${A.chal.who} CHALLENGES YOU · BEAT ${A.chal.s.toLocaleString()}`}</div>` : '';
  function loadChallenge() {
    let id = null; try { id = new URLSearchParams(location.search).get('ch') || sessionStorage.getItem('bitcade:chal:' + A.id); } catch (e) {}
    if (!id || !/^[A-Za-z0-9]{10,40}$/.test(id)) return;
    world().then(w => Promise.all([w.getChallenge(id), w.myId(), w]).then(([c, me]) => {
      if (!c || c.g !== A.id || !/^[A-Z]{3}$/.test(c.an)) return;
      A.chal = { id, a: c.a, an: c.an, who: c.an, s: +c.s || 0, mine: c.a === me };
      w.profiles([c.a]).then(p => { const nm = p[c.a] && p[c.a].name; if (A.chal && /^[A-Z0-9]{3,12}$/.test(nm || '')) { A.chal.who = nm; const b = document.querySelector('#ov .chal'); if (b && !A.chal.mine) b.outerHTML = chalBanner(); } }).catch(() => {}); // their player name, for initials others share
      try { sessionStorage.setItem('bitcade:chal:' + A.id, id); } catch (e) {}
      const o = $('ov'); if (o && !o.hidden && o.classList.contains('title') && !o.querySelector('.chal')) o.insertAdjacentHTML('afterbegin', chalBanner());
    })).catch(() => {});
  }
  /** Your score against the challenge: when it beats your last one, it goes to the challenger with a message. */
  function chalSend(r) {
    const c = A.chal, n = ini(); if (!c || c.mine || !r || r.easy || !n) return;
    const key = 'bitcade:chalbest:' + c.id, prev = store.get(key);
    if (prev != null && r.s <= +prev) return; store.set(key, String(r.s));
    world().then(w => w.postResult(c.id, n, r.s).then(() => w.sendMsg(c.a, c.an, n, { k: 'res', c: c.id, g: A.id, s: r.s, vs: c.s }, { accept: true })).then(() => store.set('bitcade:dm', '1'))).catch(() => {});
  }
  /** A new challenge with this score: a link to send (share sheet or clipboard), or straight to someone as a message. */
  async function chalMake(s, btn, to) {
    const n = ini(); if (!n) { btn.textContent = 'SAVE YOUR INITIALS FIRST (PROFILE)'; return; }
    btn.disabled = true; btn.textContent = 'MAKING IT…';
    try {
      const w = await world(), id = await w.makeChallenge(A.id, s, n);
      try { const l = JSON.parse(store.get('bitcade:chs') || '[]'); l.unshift({ id, g: A.id, s, t: Date.now() }); store.set('bitcade:chs', JSON.stringify(l.slice(0, 30))); } catch (e) {}
      store.set('bitcade:dm', '1');
      if (to) { await w.sendMsg(to.a, to.an, n, { k: 'ch', c: id, g: A.id, s }); btn.textContent = `SENT TO ${to.an} ✓`; return; }
      const url = `${location.origin}${location.pathname}?ch=${id}`, text = `${n} scored ${s.toLocaleString()} on ${document.title} at Bitcade. Can you beat it?`;
      try { if (navigator.share) { await navigator.share({ title: 'Bitcade challenge', text, url }); btn.textContent = 'CHALLENGE SENT ✓'; return; } } catch (e) { if (e.name === 'AbortError') { btn.textContent = '⚔ CHALLENGE A FRIEND'; btn.disabled = false; return; } }
      try { await navigator.clipboard.writeText(`${text} ${url}`); btn.textContent = 'LINK COPIED · SEND IT TO A FRIEND'; } catch (e) { prompt('Copy your challenge link:', `${text} ${url}`); btn.textContent = '⚔ CHALLENGE A FRIEND'; }
    } catch (e) { btn.textContent = 'OFFLINE · TRY AGAIN'; btn.disabled = false; }
  }

  /** Share a score: the share sheet where there is one, otherwise copy to the clipboard. */
  async function shareScore(s, day, btn) {
    const url = location.origin + location.pathname;
    const text = `I scored ${s.toLocaleString()} on ${document.title}${day ? ` in the daily challenge (${day})` : ''} at Bitcade. Can you beat it?`;
    try { if (navigator.share) { await navigator.share({ title: 'Bitcade', text, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text} ${url}`); btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Share score'; }, 2000); }
    catch (e) { prompt('Copy your score:', `${text} ${url}`); }
  }

  // Online boards shown in score tables: all-time ('world'), today's for daily challenges ('today') and this week's
  // when the game is the featured tournament game ('week').
  const boards = { world: { state: 'idle', list: [] }, today: { state: 'idle', list: [] }, week: { state: 'idle', list: [] } }; // state: idle | loading | ok | off
  let hsTab = 'world', lastSaved = null, dailyDay = null; // dailyDay: date of the TODAY tab, or null when it isn't shown
  function loadWorld() {
    const want = onlineTabs();
    want.forEach(k => { if (boards[k].state !== 'ok' || k !== 'world') boards[k].state = 'loading'; });
    renderHS();
    A.world().then(w => want.forEach(k => w.top(A.id, 10, k === 'today' ? dailyDay : null, k === 'week' ? A.week() : null)
      .then(t => { boards[k] = { state: 'ok', list: t }; renderHS(); }, () => { boards[k].state = 'off'; renderHS(); })),
    () => { want.forEach(k => boards[k].state = 'off'); renderHS(); });
  }

  /*
   * Easy mode (the EASY header button, arcade:easy): games run at 70% speed and give extra lives where they have them.
   * A run that had easy mode on at any point counts for nothing: no scores, tables, daily or weekly boards, world
   * posts, badges or tickets. runEasy is set when a run starts from the title or game-over screen, and by any tick
   * played in easy mode, so switching it on mid-run (from the pause screen) taints that run too.
   */
  A.easy = store.get('arcade:easy') === '1';
  let runEasy = false;
  let lastResult = null; // read by the next A.overlay call, which shows initials entry and the table
  /**
   * Save a finished game. Pass daily=true for a daily-challenge run. Returns true on a new record.
   * On the week's featured game, a run that beats this device's best this week also goes to the tournament board.
   */
  A.submit = (s, daily) => {
    s = Math.floor(s);
    if (A.demo) return false;
    try { const r = JSON.parse(store.get('bitcade:recent') || '[]').filter(x => x !== A.id); r.unshift(A.id); store.set('bitcade:recent', JSON.stringify(r.slice(0, 12))); } catch (e) {} // the lobby's Continue playing shelf
    track({ k: 'run', g: A.id, s, ms: runT ? Date.now() - runT : 0, d: !!daily, e: !!runEasy }); runT = 0;
    if (runEasy) { lastResult = { s, rank: -1, top: A.top(), day: null, week: null, tix: 0, easy: true }; return false; }
    store.set('arcade:plays:' + A.id, (+store.get('arcade:plays:' + A.id) || 0) + 1);
    const top = A.top(); // read before updating the best, which A.top() falls back to when there's no table yet
    const prevBest = A.best(), rec = s > prevBest;
    if (rec) { store.set('arcade:best:' + A.id, s); A.showBest(); }
    let rank = -1;
    if (s > 0) { rank = top.findIndex(e => s > e.s); if (rank < 0 && top.length < 10) rank = top.length; }
    let day = null;
    if (daily) {
      const d = A.today(); let db = null; try { db = JSON.parse(store.get('arcade:daily:' + A.id)); } catch (e) {}
      const improved = s > 0 && (!db || db.d !== d || s > db.s);
      if (improved) { db = { d, s }; store.set('arcade:daily:' + A.id, JSON.stringify(db)); }
      day = { ...(db && db.d === d ? db : { d, s }), improved }; // improved: today's best on this device, so it goes to the daily board
    }
    let week = null;
    if (A.featured()) {
      const w = A.week(); let wb = null; try { wb = JSON.parse(store.get('arcade:week:' + A.id)); } catch (e) {}
      const improved = s > 0 && (!wb || wb.w !== w || s > wb.s);
      if (improved) { wb = { w, s }; store.set('arcade:week:' + A.id, JSON.stringify(wb)); }
      week = { ...(wb && wb.w === w ? wb : { w, s }), improved };
    }
    // Tickets for the prize counter: 1 for a scoring game, +3 for the top 10 (+2 more for a new #1), +5 for beating
    // an earlier record, +2 for a daily run, all doubled on the weekly tournament game.
    let tix = 0;
    if (s > 0) {
      tix = 1 + (rank >= 0 ? 3 : 0) + (rank === 0 && top.length ? 2 : 0) + (rec && prevBest > 0 ? 5 : 0) + (daily ? 2 : 0);
      if (A.featured()) tix *= 2;
      if (window.TICKETS) TICKETS.add(tix); else tix = 0;
    }
    gather = []; // level-ups, pass tiers and missions from this run go on the game-over screen, not in toasts
    let xp = null;
    if (window.XP) { let n = 10 + (rank >= 0 ? 10 : 0) + (rec && prevBest > 0 ? 15 : 0) + (daily ? 5 : 0); if (A.featured()) n *= 2; xp = A.gainXP(n, 'run', true); }
    lastResult = { s, rank, top, day, week, tix, xp };
    try { A.mission({ type: 'run', slug: A.id, score: s, daily: !!daily }); } finally { lastResult.notes = gather; gather = null; }
    setTimeout(msgCheck, 3500); // game over: a good moment to mention new messages
    if (A.chal && !A.chal.mine) { lastResult.chal = { an: A.chal.who || A.chal.an, vs: A.chal.s }; chalSend(lastResult); }
    return rec;
  };
  /*
   * While A.submit runs, `gather` collects what the run earned besides tickets and XP (a level-up, a pass tier, missions
   * done), and the game-over screen shows them in one row (`notes`, see A.overlay). Outside a submit they're toasts.
   */
  let gather = null;
  const noteOne = (k, text) => { const i = gather.findIndex(x => x.k === k && k !== 'ms'); if (i >= 0) gather.splice(i, 1); gather.push({ k, text }); };
  /** Add XP (shared/badges.js); a level-up gets a toast and fanfare, or a place on the game-over screen during a submit. */
  A.gainXP = (n, why, quiet) => {
    if (!window.XP || A.demo || runEasy || !n) return null;
    const r = XP.add(n, why);
    if (r.up && gather) noteOne('lv', `▲ LEVEL ${r.after.level}${r.newTitle ? ' · ' + r.newTitle : ''}${r.unlocked.length ? ' · NEW PRIZE' : ''}`);
    else if (r.up) setTimeout(() => {
      toast(`▲ LEVEL ${r.after.level}${r.newTitle ? ' · ' + r.newTitle : ''}${r.unlocked.length ? ' · NEW PRIZE UNLOCKED' : ''}`);
      A.jingle([523, 659, 784, 1047, 1319, 1047, 1319, 1568], 0.07, 'square'); A.flash('#5ee7ff', 0.25);
    }, quiet ? 1400 : 1100);
    return r;
  };
  // the same XP climbs the Arcade Pass (shared/badges.js): a toast for each new tier
  if (window.PASS) PASS.onChange(r => { if (r.after > r.before && gather) noteOne('pass', `✦ PASS TIER ${r.after}${PASS.ready().length ? ' · REWARD WAITING' : ''}`); else if (r.after > r.before) setTimeout(() => { toast(`✦ ARCADE PASS · TIER ${r.after}${PASS.ready().length ? ' · REWARD WAITING IN THE LOBBY' : ''}`); A.jingle([659, 988, 1319], 0.07, 'triangle'); }, 2000); });
  /** Report to the daily missions (shared/badges.js); a toast for each one finished. */
  A.mission = ev => {
    if (!window.MISSIONS || A.demo || runEasy) return;
    const r = MISSIONS.record(ev);
    const wd = r.wdone || [], xp = MISSIONS.xpFor ? MISSIONS.xpFor(r) : r.done.length * 30 + (r.all ? 50 : 0);
    if (xp) A.gainXP(xp, 'mission');
    if (gather) {
      if (r.done.length) noteOne('ms', `✓ ${r.done.length > 1 ? r.done.length + ' MISSIONS' : 'MISSION'} DONE · +${r.done.length * MISSIONS.REWARD} TICKETS`); if (r.all) noteOne('all', `★ ALL 3 MISSIONS · +${MISSIONS.BONUS} BONUS`);
      if (wd.length) noteOne('wms', `✓ WEEKLY MISSION${wd.length > 1 ? 'S' : ''} DONE · +${wd.length * MISSIONS.WREWARD} TICKETS`); if (r.wall) noteOne('wall', `★ ALL 3 WEEKLY · +${MISSIONS.WBONUS} BONUS`);
      return;
    }
    const say = [...r.done.map(m => [`✓ MISSION · ${MISSIONS.text(m)} · +${MISSIONS.REWARD} TICKETS`, 0]), ...(r.all ? [[`★ ALL 3 DAILY MISSIONS · +${MISSIONS.BONUS} BONUS TICKETS`, 1]] : []),
      ...wd.map(m => [`✓ WEEKLY MISSION · ${MISSIONS.text(m)} · +${MISSIONS.WREWARD} TICKETS`, 1]), ...(r.wall ? [[`★ ALL 3 WEEKLY MISSIONS · +${MISSIONS.WBONUS} BONUS TICKETS`, 1]] : [])];
    say.forEach(([t, big], i) => setTimeout(() => { toast(t); A.jingle(big ? [523, 659, 784, 1047, 1319, 1568] : [784, 988, 1319], big ? 0.08 : 0.07, 'square'); }, 400 + i * 900));
  };

  /* ---------- sound ---------- */
  let ac = null;
  A.muted = store.get('arcade:muted') === '1';
  /*
   * Sound effects go through one bus: a compressor (so stacked sounds never clip) with a short echo send, like a
   * cabinet speaker in a room. Square waves are softened and thickened; long noises become filtered explosions
   * with a bass thump, short ones crisp hits.
   */
  let bus = null, echo = null, noiseBuf = null;
  const sfxVol = () => store.get('arcade:vol:sfx') == null ? 1 : Math.max(0, Math.min(1, +store.get('arcade:vol:sfx') / 100)); // shared/settings.js
  function buildBus() {
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(ac.destination);
    bus = ac.createGain(); bus.gain.value = sfxVol(); bus.connect(comp);
    const dl = ac.createDelay(0.3), fb = ac.createGain(), wet = ac.createGain(), lp = ac.createBiquadFilter();
    dl.delayTime.value = 0.085; fb.gain.value = 0.22; wet.gain.value = 0.16; lp.type = 'lowpass'; lp.frequency.value = 2400;
    echo = ac.createGain(); echo.connect(dl); dl.connect(lp).connect(fb).connect(dl); lp.connect(wet).connect(comp);
    const n = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, n, ac.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  }
  const out = node => { node.connect(bus); node.connect(echo); };
  A.unlock = () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); buildBus(); } catch (e) {} }
    if (ac && ac.state === 'suspended') ac.resume();
  };
  A.tone = (f, d = 0.06, type = 'square', v = 0.04, when = 0, slideTo) => {
    if (A.muted || !ac || A.demo) return;
    const t = ac.currentTime + when, g = ac.createGain(), oscs = [ac.createOscillator()], thick = type === 'square' || type === 'sawtooth';
    if (thick) { const o2 = ac.createOscillator(); o2.detune.value = 9; oscs.push(o2); }
    oscs.forEach(o => { o.type = type; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d); });
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let node = g;
    if (thick) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; g.connect(lp); node = lp; }
    oscs.forEach((o, i) => { const k = ac.createGain(); k.gain.value = i ? 0.45 : 1; o.connect(k).connect(g); o.start(t); o.stop(t + d + 0.03); });
    out(node);
  };
  A.noise = (d = 0.2, v = 0.06, when = 0) => {
    if (A.muted || !ac || A.demo) return;
    const t = ac.currentTime + when, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true;
    if (d >= 0.25) { f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(260, t + d); } // a rumbling blast
    else { f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.6; }                                                        // a crisp hit
    g.gain.setValueAtTime(v * 1.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f).connect(g); out(g); src.start(t, Math.random()); src.stop(t + d + 0.05);
    if (d >= 0.3) thump(Math.min(0.12, v * 1.6), t);
  };
  /** A sub-bass thump: the low end of explosions and heavy hits. */
  function thump(v = 0.08, t) {
    if (A.muted || !ac || A.demo) return;
    if (t == null) t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.45);
  }
  let thumpAt = 0;
  /** The coin drop when a run starts: two bright chimes, a metallic clink and the mechanism clunking. */
  A.coin = () => {
    if (A.muted || !ac) return;
    A.tone(988, 0.07, 'square', 0.045); A.tone(1319, 0.22, 'square', 0.045, 0.07); A.tone(2637, 0.05, 'triangle', 0.03, 0.02);
    A.noise(0.04, 0.05, 0.16); A.tone(140, 0.08, 'triangle', 0.06, 0.17, 70);
  };
  /** Named effects for games: A.sfx('pickup' | 'powerup' | 'hurt' | 'boom' | 'laser' | 'jump' | 'select'). */
  const SFX = {
    pickup: () => A.jingle([880, 1175, 1568], 0.045, 'triangle', 0.045),
    powerup: () => { A.tone(300, 0.35, 'square', 0.035, 0, 1200); A.jingle([1568, 2093], 0.06, 'triangle', 0.03); },
    hurt: () => { A.tone(420, 0.35, 'sawtooth', 0.05, 0, 80); A.noise(0.18, 0.05); },
    boom: () => { A.noise(0.6, 0.09); },
    laser: () => A.tone(1500, 0.09, 'square', 0.025, 0, 260),
    jump: () => A.tone(300, 0.12, 'square', 0.03, 0, 760),
    select: () => A.tone(660, 0.03, 'square', 0.03)
  };
  A.sfx = name => { const f = SFX[name]; if (f) f(); };
  A.jingle = (notes, step = 0.1, type = 'square', v = 0.045) => notes.forEach((f, i) => f && A.tone(f, step * 0.9, type, v, i * step));

  /* ---------- input ---------- */
  A.down = new Set();
  const pressFns = [];
  A.onPress = fn => pressFns.push(fn);
  A.held = (...codes) => codes.some(c => A.down.has(c));
  // While initials entry is open, presses (keys, pad buttons, gamepad) go to it instead of the game.
  // On a score table, ←/→ switch between the World and This device tabs.
  const kd = code => {
    if (A.down.has(code)) return;
    A.down.add(code);
    if (settingsOpen()) { window.Settings.pad(code); return; } // a controller working the settings panel
    if (A.keyHook && A.keyHook(code)) return; // a page's own screen (shared/story.js) takes the press
    if (entry) entryKey(code);
    else if (shown && overlayOpen() && (code === 'ArrowLeft' || code === 'ArrowRight')) {
      const t = tabs(), i = t.indexOf(hsTab); hsTab = t[(i + (code === 'ArrowRight' ? 1 : t.length - 1)) % t.length]; renderHS();
    }
    else pressFns.forEach(f => f(code));
  };
  const ku = code => A.down.delete(code);
  A.press = kd; A.release = ku;
  // keys of the player's own (shared/settings.js): your key → the game's key; the usual keys keep working
  let keymap = {};
  const loadKeys = () => { try { const m = JSON.parse(store.get('arcade:keys:' + A.id)); keymap = m && typeof m === 'object' ? m : {}; } catch (e) { keymap = {}; } };
  loadKeys();
  const settingsOpen = () => !!(window.Settings && Settings.isOpen());
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('[data-keys-native]')) return; // forms and pickers that need their own keys
    A.unlock();
    const code = keymap[e.code] || e.code;
    if (entry && overlayOpen() && !e.repeat) {
      if (/^Key[A-Z]$/.test(e.code)) { e.preventDefault(); entry.letters[entry.pos] = e.code[3]; entry.pos = Math.min(2, entry.pos + 1); A.tone(660, 0.03); renderHS(); return; }
      if (e.code === 'Backspace') { e.preventDefault(); entry.pos = Math.max(0, entry.pos - 1); renderHS(); return; }
    }
    if (e.code === 'Backspace' && homeShown() && !e.repeat) { e.preventDefault(); goHome(); return; }
    if (overlayOpen() && (code === 'Enter' || code === 'Space')) {
      if (e.target.closest && e.target.closest('a,button:not(.go)')) return;
      e.preventDefault(); if (!e.repeat) overlayGo(); return;
    }
    if (GAME_KEYS.has(code) || code !== e.code) e.preventDefault();
    if (e.repeat) return;
    kd(code);
  });
  addEventListener('keyup', e => ku(keymap[e.code] || e.code));
  addEventListener('blur', () => { A.down.clear(); gpHeld.clear(); });
  function bindPads() {
    document.querySelectorAll('[data-k]').forEach(b => {
      const code = b.dataset.k;
      const on = e => { e.preventDefault(); A.unlock(); b.classList.add('on'); kd(code); };
      const off = () => { b.classList.remove('on'); ku(code); };
      // Touch pointers are captured by the first button by default; release it so a thumb can slide between buttons.
      b.addEventListener('pointerdown', e => { if (b.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId); on(e); });
      b.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse' && e.buttons) on(e); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, off));
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
  }
  /** Swipe on an element → fn('up'|'down'|'left'|'right'); taps → fn('tap'). */
  A.swipe = (el, fn) => {
    let sx, sy, st;
    el.addEventListener('pointerdown', e => { A.unlock(); sx = e.clientX; sy = e.clientY; st = performance.now(); });
    el.addEventListener('pointerup', e => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.hypot(dx, dy) < 18) { if (performance.now() - st < 300) fn('tap'); return; }
      fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
  };

  /* ---------- gamepad ---------- */
  // Standard mapping: d-pad and left stick → arrows, A → Space, Start → pause. A page adds or overrides
  // buttons with body data-pad="0:KeyK 2:KeyJ" (button index:key code). Buttons feed the same press/held path as keys.
  const padMap = { 0: 'Space', 9: 'KeyP', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
  // Sticks: the left stick acts as the arrows unless body data-sticks says otherwise, e.g. data-sticks="wasd arrows"
  // (twin-stick: left moves with WASD, right aims with the arrows).
  const KEYSETS = { arrows: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], wasd: ['KeyA', 'KeyD', 'KeyW', 'KeyS'] };
  const [leftKeys, rightKeys] = (document.body.dataset.sticks || 'arrows').split(/\s+/).map(k => KEYSETS[k]);
  (document.body.dataset.pad || '').split(/\s+/).forEach(p => { const [i, code] = p.split(':'); if (code) padMap[i] = code; });
  let gpHeld = new Set(), gpButtons = new Set(), gpPolling = false;
  const gpSwallow = new Set(); // A/Start presses that went to the overlay; ignored until released
  const getPads = () => { try { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean); } catch (e) { return []; } };
  function pollPads() {
    const pads = getPads();
    if (!pads.length) { gpPolling = false; gpHeld.forEach(ku); gpHeld.clear(); gpButtons.clear(); return; }
    const codes = new Set(), buttons = new Set();
    pads.forEach(gp => {
      gp.buttons.forEach((b, i) => { if (b.pressed) buttons.add(i); });
      const stick = (keys, x, y) => { if (!keys) return; if (x < -0.5) codes.add(keys[0]); if (x > 0.5) codes.add(keys[1]); if (y < -0.5) codes.add(keys[2]); if (y > 0.5) codes.add(keys[3]); };
      stick(leftKeys, gp.axes[0] || 0, gp.axes[1] || 0);
      stick(rightKeys, gp.axes[2] || 0, gp.axes[3] || 0);
    });
    if (A.demo && (buttons.size || codes.size)) { endDemo(); gpButtons = buttons; buttons.forEach(i => gpSwallow.add(i)); requestAnimationFrame(pollPads); return; }
    buttons.forEach(i => {
      if (!gpButtons.has(i)) {
        A.unlock();
        if (settingsOpen()) { gpSwallow.add(i); if (i === 0) Settings.pad('Space'); else if (i === 1 || i === 9) Settings.pad('Back'); }
        else if (A.padHook && A.padHook(i)) gpSwallow.add(i);
        else if (overlayOpen() && (i === 0 || i === 9)) { gpSwallow.add(i); overlayGo(); }
        else if (i === 8 && homeShown()) { gpSwallow.add(i); goHome(); } // Back / Select = HOME
        else if (overlayOpen() && i === 3 && altFn && !entry) { gpSwallow.add(i); overlayAlt(); } // Y = second overlay button
        else if (overlayOpen() && i === 2 && alt2Fn && !entry) { gpSwallow.add(i); overlayAlt2(); } // X = third
      }
      if (!gpSwallow.has(i) && padMap[i]) codes.add(padMap[i]);
    });
    gpSwallow.forEach(i => { if (!buttons.has(i)) gpSwallow.delete(i); });
    gpButtons = buttons;
    codes.forEach(c => { if (!gpHeld.has(c)) kd(c); });
    gpHeld.forEach(c => { if (!codes.has(c)) ku(c); });
    gpHeld = codes;
    requestAnimationFrame(pollPads);
  }
  const startPads = () => { if (!gpPolling) { gpPolling = true; requestAnimationFrame(pollPads); } };
  addEventListener('gamepadconnected', startPads);
  if (getPads().length) startPads();

  /* ---------- canvas + loop ---------- */
  A.canvas = (cv, w, h) => {
    const ctx = cv.getContext('2d');
    const fit = () => { const d = Math.min(window.devicePixelRatio || 1, 2); cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    fit(); addEventListener('resize', fit);
    cv.parentElement.style.setProperty('--ar', w / h); document.documentElement.style.setProperty('--ar', w / h);
    A.W = w; A.H = h; fxCtx = ctx;
    return ctx;
  };
  /** Pointer position in canvas units. */
  A.pointer = (cv, e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * A.W, y: (e.clientY - r.top) / r.height * A.H }; };
  A.loop = (update, draw) => {
    let last = performance.now(), acc = 0; const dt = 1 / 60;
    const f = t => {
      acc += Math.min(0.1, (t - last) / 1000) * (A.easy && !A.demo ? 0.7 : 1); last = t;
      while (acc >= dt) {
        if (A.demo) demoTick(dt); else if (!overlayOpen()) { playT += dt; sessPlay += dt; if (A.easy) runEasy = true; }
        fxUpdate(dt);
        if (stopT > 0) stopT -= dt; else update(dt); // hit-pause freezes the game, not the effects
        acc -= dt;
      }
      fxDraw(t, draw); requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  };

  /*
   * Game feel, shared by every game (all in canvas units, all optional):
   *   A.shake(px, s)          shake the screen          A.hitstop(s)        freeze the game for a moment
   *   A.burst(x, y, opts)     particles: { n, color | colors, speed, life, size, gravity, kind: 'spark' | 'debris' | 'smoke' }
   *   A.pop(x, y, text, c)    a score that floats up    A.ring(x, y, c, r)  a shockwave ring
   *   A.flash(c, s)           a full-screen flash
   * The loop draws them on top of the game, inside the shake. Reduced-motion players get no shake and soft flashes.
   */
  let fxCtx = null, stopT = 0, shakeA = 0, shakeT = 0, shakeD = 1, flashC = null, flashT = 0, flashD = 1, fx = [];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the player's settings (shared/settings.js): how much screens shake and flash, and a buzz on phones for big hits
  const shakeK = () => { const v = store.get('arcade:shake'); return v == null ? 1 : +v; }, flashK = () => { const v = store.get('arcade:flash'); return v == null ? 1 : +v; };
  const coarse = matchMedia('(pointer: coarse)').matches;
  A.shake = (px = 6, s = 0.3) => {
    if (px >= 5 && ac && performance.now() - thumpAt > 120) { thumpAt = performance.now(); thump(Math.min(0.14, px / 80)); } // big shakes get bass, even with motion reduced
    if (px >= 5 && coarse && !A.demo && store.get('arcade:buzz') !== '0' && navigator.vibrate) try { navigator.vibrate(Math.min(70, px * 5)); } catch (e) {}
    px *= shakeK(); if (calm || !px) return; if (px >= (shakeT > 0 ? shakeA * shakeT / shakeD : 0)) { shakeA = px; shakeT = shakeD = s; }
  };
  A.hitstop = (s = 0.05) => { stopT = Math.max(stopT, s); };
  A.flash = (c = '#fff', s = 0.15) => { flashC = c; flashT = flashD = s; };
  A.burst = (x, y, o = {}) => {
    const n = o.n || 14, cols = o.colors || [o.color || '#fff'], kind = o.kind || 'spark', sp = o.speed || 220;
    for (let i = 0; i < n && fx.length < 600; i++) {
      const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 1.2) : Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.8), life = (o.life || 0.6) * (0.6 + Math.random() * 0.6);
      fx.push({ k: kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'smoke' ? 30 : 0), t: life, life, c: cols[i % cols.length],
        s: (o.size || (kind === 'smoke' ? 10 : kind === 'debris' ? 4 : 2.5)) * (0.7 + Math.random() * 0.6), g: o.gravity != null ? o.gravity : kind === 'debris' ? 520 : kind === 'smoke' ? -20 : 0, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
    }
  };
  A.pop = (x, y, text, c = '#fff6c2') => { fx.push({ k: 'pop', x, y, vy: -46, vx: 0, t: 0.9, life: 0.9, c, text: String(text), g: 0 }); };
  A.ring = (x, y, c = '#fff', r = 60) => { fx.push({ k: 'ring', x, y, vx: 0, vy: 0, t: 0.35, life: 0.35, c, s: r, g: 0 }); };
  function fxUpdate(dt) {
    if (shakeT > 0) shakeT -= dt; if (flashT > 0) flashT -= dt;
    for (const p of fx) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; if (p.k !== 'pop') { p.vx *= p.k === 'smoke' ? 0.96 : 0.985; } if (p.r != null) p.r += p.vr * dt; p.t -= dt; }
    if (fx.length) fx = fx.filter(p => p.t > 0);
  }
  function fxDraw(t, draw) {
    const c = fxCtx;
    if (!c) return draw(t);
    const k = shakeT > 0 ? shakeA * (shakeT / shakeD) : 0;
    c.save();
    if (k) { c.fillStyle = '#000'; c.fillRect(0, 0, A.W, A.H); c.translate((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k); }
    draw(t);
    for (const p of fx) {
      const a = Math.max(0, Math.min(1, p.t / p.life * 1.6));
      c.globalAlpha = a;
      if (p.k === 'pop') { c.font = '13px Silkscreen, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#0a0612'; c.fillText(p.text, p.x + 1, p.y + 1); c.fillStyle = p.c; c.fillText(p.text, p.x, p.y); }
      else if (p.k === 'ring') { const q = 1 - p.t / p.life; c.strokeStyle = p.c; c.lineWidth = 3 * (1 - q) + 1; c.beginPath(); c.arc(p.x, p.y, p.s * (0.2 + q), 0, 6.29); c.stroke(); }
      else if (p.k === 'smoke') { c.globalAlpha = a * 0.35; c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.s * (1.6 - p.t / p.life), 0, 6.29); c.fill(); }
      else if (p.k === 'debris') { c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = '#0a0612'; c.fillRect(-p.s / 2 - 1, -p.s / 2 - 1, p.s + 2, p.s + 2); c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); c.restore(); }
      else { c.fillStyle = p.c; c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    }
    c.globalAlpha = 1;
    c.restore();
    if (flashT > 0) { c.globalAlpha = Math.max(0, flashT / flashD) * (calm ? 0.2 : 0.55) * flashK(); c.fillStyle = flashC; c.fillRect(0, 0, A.W, A.H); c.globalAlpha = 1; }
  }
  // Play time per game (arcade:time:<slug>, seconds) for the lobby's profile page: game time with no screen up.
  let playT = 0, sessPlay = 0, runT = 0, runs = 0; // sessPlay and runs: this piece of the visit, for shared/activity.js
  /* Play activity for admin.html (shared/activity.js, anonymous, off with arcade:track '0'): each run, and time on the page. */
  let act = null;
  const track = ev => { if (act) act.track(ev); else if (store.get('arcade:track') !== '0' && A.id !== 'game') import(new URL('activity.js', KIT_URL).href).then(m => { act = m; m.track(ev); }).catch(() => {}); };
  addEventListener('load', () => { if (store.get('arcade:track') === '0' || A.id === 'game') return;
    import(new URL('activity.js', KIT_URL).href).then(m => { act = m; m.pageTimer(A.id, () => { const x = { play: Math.round(sessPlay * 1000), runs }; sessPlay = 0; runs = 0; return x; }); }).catch(() => {}); });
  /* The player profile (shared/setup.js): a new player makes one before playing; after that each page only checks it's published. */
  const setupJs = () => new Promise((ok, no) => { if (window.Setup) return ok(window.Setup); const s = document.createElement('script'); s.src = new URL('setup.js', KIT_URL).href; s.onload = () => ok(window.Setup); s.onerror = no; document.head.append(s); });
  addEventListener('load', () => { if (A.id === 'game') return;
    let skip = false; try { skip = sessionStorage.getItem('bitcade:nosetup') === '1'; } catch (e) {} // the smoke tests
    if (!skip && (!/^[A-Z0-9]{3,12}$/.test(store.get('arcade:name') || '') || !/^[A-Z]{3}$/.test(store.get('arcade:initials') || '') || !store.get('arcade:avatar'))) setupJs().then(S => S.open({ required: true })).catch(() => {});
    else setTimeout(() => setupJs().then(S => S.check()).catch(() => {}), 4000); });
  /*
   * New messages (shared/inbox.js has the conversations): for a player who has any (bitcade:dm, set by the lobby's
   * messages and by challenges), a game page looks every couple of minutes while a title, pause or game-over screen is
   * up, never mid-run, and shows a notice to tap that opens the conversation in the lobby. bitcade:dmnote is the newest
   * message already announced, so each one is announced once.
   */
  let msgBusy = false;
  function msgCheck() {
    if (msgBusy || A.id === 'game' || A.demo || document.hidden || !overlayOpen() || store.get('bitcade:dm') !== '1') return;
    msgBusy = true;
    world().then(w => Promise.all([w.conversations(), w.myId(), w.blocked(), w])).then(async ([cs, me, bl, w]) => {
      const said = +store.get('bitcade:dmnote') || 0, them = c => c.m.find(x => x !== me);
      const fresh = cs.filter(c => !bl.includes(them(c)) && c.last > (c.seen[me] || 0) + 1000 && c.last > said);
      if (!fresh.length) return;
      store.set('bitcade:dmnote', String(Math.max(...fresh.map(c => c.last))));
      const c = fresh[0], o = them(c), p = (await w.profiles([o]).catch(() => ({})))[o];
      msgNote((p && p.name) || c.n[o] || 'A PLAYER', fresh.length - 1, new URL(`../../?chat=${encodeURIComponent(o)}&cn=${c.n[o] || ''}`, location.href).href);
    }).catch(() => {}).then(() => { msgBusy = false; });
  }
  function msgNote(who, more, href) {
    const old = document.querySelector('.msg-note'); if (old) old.remove();
    const b = document.createElement('button');
    b.className = 'msg-note'; b.type = 'button'; b.setAttribute('role', 'status');
    b.textContent = `✉ ${who}${more ? ` +${more}` : ''} SENT YOU A MESSAGE · OPEN`;
    b.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translate(-50%,12px);z-index:51;max-width:calc(100vw - 24px);overflow:hidden;text-overflow:ellipsis;' +
      'padding:10px 16px;border-radius:12px;background:#1f1940;border:1px solid #ff8a9a;color:#ff8a9a;font:12px Silkscreen,ui-monospace,monospace;letter-spacing:.04em;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.5);opacity:0;transition:opacity .25s,transform .25s;white-space:nowrap;cursor:pointer';
    b.addEventListener('click', () => A.crtOff(href));
    document.body.appendChild(b); A.tone(880, 0.06, 'triangle', 0.03); A.tone(1175, 0.08, 'triangle', 0.03, 0.08);
    requestAnimationFrame(() => { b.style.opacity = '1'; b.style.transform = 'translate(-50%,0)'; });
    setTimeout(() => { b.style.opacity = '0'; setTimeout(() => b.remove(), 300); }, 12000);
  }
  addEventListener('load', () => { setTimeout(msgCheck, 6000); setInterval(msgCheck, 120000); });
  const saveTime = () => { if (playT >= 1 && A.id !== 'game') { store.set('arcade:time:' + A.id, Math.round((+store.get('arcade:time:' + A.id) || 0) + playT)); playT = 0; } };
  setInterval(saveTime, 10000); addEventListener('pagehide', saveTime);
  const hideFns = [];
  A.onHide = fn => hideFns.push(fn);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { A.down.clear(); gpHeld.clear(); saveTime(); hideFns.forEach(f => f()); } });

  /* ---------- overlay ---------- */
  let goFn = null, altFn = null, goLabel = '', entry = null, shown = null; // shown: { top, hi, day } for the table
  const overlayOpen = () => { const o = $('ov'); return o && !o.hidden; };
  const startsRun = () => !!shown; // title and game-over screens list scores; the pause screen doesn't
  // HOME on every overlay but the title screen (game over, pause, between stages): back to the lobby, CRT off first
  const homeShown = () => overlayOpen() && !entry && !!$('ov').querySelector('.home');
  const goHome = () => A.crtOff(new URL('../../', location.href).href);
  const overlayGo = () => { if (entry) return saveEntry(); const f = goFn; if (!f) return; if (startsRun()) { runEasy = A.easy; A.coin(); runT = Date.now(); runs++; } A.hideOverlay(); f(); };
  const music = () => window.Chip; // shared/chip.js, when the page loads it
  /** Start a run from a page's own screen (shared/story.js) the way the overlay does: easy mode is noted, a coin drops. */
  A.startRun = () => { runEasy = A.easy; A.coin(); runT = Date.now(); runs++; };
  A.runEasy = () => runEasy;
  const overlayAlt = () => { const f = altFn; if (!f) return; if (startsRun()) { runEasy = A.easy; A.coin(); runT = Date.now(); runs++; } A.hideOverlay(); f(); };
  let alt2Fn = null;
  const overlayAlt2 = () => { const f = alt2Fn; if (!f) return; if (startsRun()) { runEasy = A.easy; A.coin(); runT = Date.now(); runs++; } A.hideOverlay(); f(); };
  /**
   * Show the overlay. alt: { btn, onGo } adds a second button (gamepad Y), alt2 a third (gamepad X). scores: true lists the top 10 (title screens),
   * and daily: true adds today's daily-challenge board to it. Called right after A.submit, it also asks for initials
   * when the score made the top 10 or is the player's best daily run today.
   */
  A.overlay = args => {
    if (A.demo) return endDemo(); // the demo ran into a pause or game-over screen: back to the title instead
    const { title, sub = '', big = '', btn = 'Play', onGo, alt, alt2, scores, daily } = args;
    const o = $('ov'), res = lastResult; lastResult = null;
    const canShare = res && res.s > 0 && !res.easy, isTitle = scores && !res;
    if (isTitle) titleArgs = args;
    o.classList.toggle('title', !!isTitle);
    clearInterval(contT);
    o.innerHTML = (isTitle ? chalBanner() : '') + (isTitle && A.featured() ? `<div class="weekly">★ WEEKLY TOURNAMENT · ENDS IN ${WK.leftText()}</div>` : '') + `<h2></h2>${big ? '<div class="big"></div>' : ''}${sub ? '<p></p>' : ''}` +
      (res && res.chal && !res.easy ? `<div class="chal${res.s > res.chal.vs ? ' win' : ''}">${res.s > res.chal.vs ? `⚔ YOU BEAT ${res.chal.an}! ${res.s.toLocaleString()} TO ${res.chal.vs.toLocaleString()}` : `⚔ ${res.chal.an} STILL LEADS · ${res.chal.vs.toLocaleString()} TO BEAT`}</div>` : '') +
      (res && res.easy ? '<div class="tix easy">EASY MODE · SCORE NOT RECORDED</div>' : isTitle && A.easy ? '<div class="tix easy">EASY MODE ON · SCORES WON\u2019T COUNT</div>' : '') +
      (res && (res.tix || res.xp) ? '<div class="rsum">' +
        (res.tix ? `<div class="tix">+${res.tix} TICKETS${A.featured() ? ' · DOUBLE THIS WEEK' : ''} · ${TICKETS.balance()} TOTAL</div>` : '') +
        (res.xp ? `<div class="xpbar"><span>LV ${res.xp.after.level}</span><i><b style="width:${res.xp.up ? 0 : Math.round(res.xp.before.pct * 100)}%"></b></i><em>+${res.xp.gained} XP${res.xp.up ? ' · LEVEL UP!' : ''}</em></div>` : '') +
        ((res.notes || []).length ? `<div class="notes">${res.notes.map(n => `<span class="note ${n.k}"></span>`).join('')}</div>` : '') + '</div>' : '') + `<div class="hs"></div>` +
      (isTitle ? '<div class="push">PUSH START</div>' : '') + (res ? '<div class="cont" hidden></div>' : '') +
      `<div class="btns"><button class="go"></button>${alt ? '<button class="go2"></button>' : ''}${alt2 ? '<button class="go2 go3"></button>' : ''}${isTitle ? '' : '<button class="go2 home" title="Back to the arcade (Backspace)">⌂ HOME</button>'}</div>` +
      (canShare ? '<button class="share">Share score</button>' : '') +
      (canShare ? `<div class="chal-btns"><button class="share chal-go">⚔ CHALLENGE A FRIEND</button>${A.chal && !A.chal.mine ? `<button class="share chal-back">⚔ CHALLENGE ${A.chal.who || A.chal.an} BACK</button><button class="share chal-msg">✉ MESSAGE ${A.chal.an}</button>` : ''}</div>` : '') +
      (res ? '<button class="share fbk">✎ Feedback</button>' : '') + (isTitle ? '<div class="credit">FREE PLAY · CREDIT 99</div>' : '');
    const xb = o.querySelector('.xpbar b'); if (xb && res && res.xp) requestAnimationFrame(() => requestAnimationFrame(() => { xb.style.width = Math.round(res.xp.after.pct * 100) + '%'; }));
    if (res && res.notes && res.notes.length) {
      o.querySelectorAll('.note').forEach((el, i) => { el.textContent = res.notes[i].text; });
      const has = k => res.notes.some(n => n.k === k); // one fanfare for the lot: the biggest thing that happened
      setTimeout(() => { if (has('lv')) { A.jingle([523, 659, 784, 1047, 1319, 1047, 1319, 1568], 0.07, 'square'); A.flash('#5ee7ff', 0.25); } else if (has('ms') || has('all')) A.jingle([784, 988, 1319], 0.07, 'square'); else A.jingle([659, 988, 1319], 0.07, 'triangle'); }, 700);
    }
    if (canShare) { const sb = o.querySelector('.share'); sb.addEventListener('click', () => shareScore(res.s, res.day && res.day.d, sb)); }
    if (canShare) {
      o.querySelector('.chal-go').addEventListener('click', e => chalMake(res.s, e.currentTarget));
      const cb = o.querySelector('.chal-back'), cm = o.querySelector('.chal-msg'), c = A.chal;
      if (cb) cb.addEventListener('click', e => chalMake(res.s, e.currentTarget, c));
      if (cm) cm.addEventListener('click', () => A.crtOff(new URL(`../../?chat=${encodeURIComponent(c.a)}&cn=${c.an}`, location.href).href));
    }
    const fbk = o.querySelector('.fbk'); if (fbk) fbk.addEventListener('click', () => A.openSettings && A.openSettings({ feedback: true }));
    o.querySelector('h2').textContent = title;
    if (isTitle && A.id !== 'game') { const lc = document.createElement('canvas'); lc.className = 'logo'; lc.setAttribute('aria-hidden', 'true'); o.querySelector('h2').before(lc); o.querySelector('h2').classList.add('sr'); startLogo(lc, title); }
    if (big) o.querySelector('.big').textContent = big;
    if (sub) o.querySelector('p').innerHTML = sub;
    o.querySelector('.go').addEventListener('click', () => { A.unlock(); overlayGo(); });
    if (alt) { const b2 = o.querySelector('.go2'); b2.textContent = alt.btn; b2.addEventListener('click', () => { A.unlock(); overlayAlt(); }); }
    if (alt2) { const b3 = o.querySelector('.go3'); b3.textContent = alt2.btn; b3.addEventListener('click', () => { A.unlock(); overlayAlt2(); }); }
    const hb = o.querySelector('.home'); if (hb) hb.addEventListener('click', goHome);
    const hs = o.querySelector('.hs');
    hs.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }); // keep focus off the ▲▼ buttons
    hs.addEventListener('click', e => {
      const tab = e.target.closest('[data-tab]'); if (tab) { hsTab = tab.dataset.tab; renderHS(); return; }
      const b = e.target.closest('[data-slot]'); if (!b || !entry) return;
      entry.pos = +b.dataset.slot; if (b.dataset.dir) entryKey(b.dataset.dir); else renderHS();
    });
    goFn = onGo; altFn = alt ? alt.onGo : null; alt2Fn = alt2 ? alt2.onGo : null; goLabel = btn; entry = null; shown = null; lastSaved = null;
    dailyDay = res && res.day ? res.day.d : daily ? A.today() : null;
    if (res) {
      shown = { top: res.top, hi: -1, day: res.day, week: res.week };
      if (res.rank >= 0 || (res.day && res.day.improved) || (res.week && res.week.improved) || (res.chal && !res.easy && !ini())) entry = { res, pos: 0, letters: [...(/^[A-Z]{3}$/.test(store.get('arcade:initials')) ? store.get('arcade:initials') : 'AAA')] };
    } else if (scores) shown = { top: A.top(), hi: -1, day: null };
    if (res && res.day) hsTab = 'today'; else if (res && res.week) hsTab = 'week'; else if (!tabs().includes(hsTab)) hsTab = 'world';
    renderHS(); o.hidden = false;
    if (res && !entry) startContinue();
    if (shown) loadWorld();
    if (res && !res.easy) cloudSync();
    armDemo(isTitle);
    // the game's theme plays from the title screen right through the game: full volume on screens like this, quieter in play
    if (music()) { music().play(music().theme(A.id)); music().volume(0.5); }
  };
  A.hideOverlay = () => { const o = $('ov'); if (o) o.hidden = true; entry = null; clearInterval(contT); clearTimeout(demoT); if (music()) music().volume(0.3); };
  /** Game over, arcade style: CONTINUE? counts down 9 to 0 with a beep each second (starting a new game any time). */
  let contT = 0;
  function startContinue() {
    const c = $('ov') && $('ov').querySelector('.cont'); if (!c) return;
    let n = 9; c.hidden = false; c.classList.remove('done'); c.textContent = 'CONTINUE? 9';
    clearInterval(contT);
    contT = setInterval(() => {
      if (!c.isConnected || !overlayOpen()) return clearInterval(contT);
      n--;
      if (n < 0) { clearInterval(contT); c.textContent = 'THANKS FOR PLAYING'; c.classList.add('done'); afterThanks(); return; }
      c.textContent = 'CONTINUE? ' + n; A.tone(n ? 880 : 440, 0.07, 'square', 0.03);
    }, 1000);
  }
  A.overlayOpen = overlayOpen;

  /*
   * Title logos: the game's name drawn as an animated logo on its title screen, in one of five styles picked per game
   * (block: chunky extruded letters; neon: glowing tubes; chrome: polished metal with a coloured side; pixel: stepped
   * pixel type; retro: a synthwave sunset fill with cut lines). A light sweeps across and sparkles twinkle.
   */
  const LOGOS = {
    'neon-noodle': ['neon'], wallbuster: ['block'], 'star-siege': ['pixel'], 'rock-rift': ['chrome'], stackdown: ['retro'],
    'back-alley-brawl': ['block', -0.16], 'circuit-chase': ['neon'], 'highrise-handyman': ['block'], 'nitro-lane': ['chrome', -0.22],
    'volley-duel': ['neon'], 'crater-lander': ['chrome'], 'sky-shield': ['retro'], 'hedge-hop': ['block'], 'scaffold-scramble': ['block'],
    'swarm-strike': ['pixel'], 'garden-gunner': ['block'], 'cube-hopper': ['retro'], 'light-trail': ['neon', -0.12], 'wing-duel': ['chrome'],
    'twin-blast': ['neon'], 'mole-patrol': ['block'], 'turbo-tour': ['chrome', -0.22], 'raptor-ridge': ['block', -0.08], 'marsh-marksman': ['retro'],
    'pixel-peaks': ['block'], 'pop-lagoon': ['retro'], 'neon-steps': ['neon', -0.1],
    'blast-brigade': ['block', -0.14], 'dungeon-delve': ['pixel'], 'lucky-line': ['retro'], 'rampart-rush': ['chrome'],
    'sky-squadron': ['chrome', -0.14], 'street-sweepers': ['block', -0.12], 'gem-cascade': ['neon'], 'knockout-kings': ['block', -0.1],
    'tank-tactics': ['block', -0.1], 'skyline-smash': ['block', -0.08], 'depth-charge': ['neon'], 'jungle-drop': ['retro'], 'bomb-squad': ['chrome'], 'paper-route': ['retro'], 'soda-slinger': ['neon'], 'pipe-panic': ['pixel'], 'boulder-bash': ['block'], 'ten-pin-blitz': ['retro', -0.12], 'field-day': ['chrome', -0.14]
  };
  const tint = (hex, k) => {
    let h = hex.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join('');
    const n = parseInt(h, 16), f = c => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };
  function startLogo(cv, text) {
    const [style, skew = 0] = LOGOS[A.id] || ['block'], col = (getComputedStyle(document.body).getPropertyValue('--game') || '#5ee7ff').trim();
    const pixel = style === 'pixel', font = s2 => pixel ? `${s2}px Silkscreen, monospace` : `${s2}px Bungee, sans-serif`;
    const S = 2, W2 = 560 * S, x = cv.getContext('2d'), L = document.createElement('canvas'); // L: the letters' face layer, reused
    let lines = [text], size = 0;
    const layout = () => { // the biggest size that fits, on one line or split over two
      for (const ls of [[text], splitTwo(text)]) { let sz = (pixel ? 96 : 84) * S; x.font = font(sz); while (sz > 20 && Math.max(...ls.map(l => x.measureText(l).width)) > W2 - 60 * S) { sz -= 2 * S; x.font = font(sz); } if (sz >= 54 * S || ls.length === 2) { lines = ls; size = sz; if (sz >= 54 * S) break; } }
      const lh = size * (pixel ? 0.95 : 1.05); cv.width = W2; cv.height = Math.round(lh * lines.length + 40 * S);
    };
    const splitTwo = t => { const w = t.split(' '); if (w.length < 2) return [t]; let best = [t], bd = 1e9; for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), d = Math.abs(a.length - b.length); if (d < bd) { bd = d; best = [a, b]; } } return best; };
    const sparks = Array.from({ length: 5 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 3000 }));
    let raf = 0, laidFont = '';
    const draw = t => {
      if (!cv.isConnected) return cancelAnimationFrame(raf);
      if (!overlayOpen() || document.hidden) { raf = requestAnimationFrame(draw); return; }
      const fontState = document.fonts && document.fonts.check(font(40)) ? 'ok' : 'wait';
      if (fontState !== laidFont) { laidFont = fontState; layout(); }
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
      const lh = size * (pixel ? 0.95 : 1.05), top = 20 * S + size * 0.82;
      x.font = font(size); x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.lineJoin = 'round';
      x.setTransform(1, 0, skew, 1, -skew * cv.height / 2, 0);
      lines.forEach((ln, i) => drawLine(x, ln, W2 / 2, top + i * lh, t));
      // sparkles on the letters
      x.setTransform(1, 0, 0, 1, 0, 0);
      for (const sp of sparks) { const k = ((t + sp.p) % 3000) / 3000; if (k > 0.25) continue; const a = Math.sin(k / 0.25 * Math.PI), sx = W2 * (0.18 + sp.x * 0.64), sy = 20 * S + sp.y * (cv.height - 40 * S), r = 14 * S * a;
        x.fillStyle = `rgba(255,255,255,${a})`; x.beginPath(); x.moveTo(sx, sy - r); x.lineTo(sx + r * 0.2, sy - r * 0.2); x.lineTo(sx + r, sy); x.lineTo(sx + r * 0.2, sy + r * 0.2); x.lineTo(sx, sy + r); x.lineTo(sx - r * 0.2, sy + r * 0.2); x.lineTo(sx - r, sy); x.lineTo(sx - r * 0.2, sy - r * 0.2); x.fill();
        if (k > 0.24) { sp.x = Math.random(); sp.y = Math.random(); } }
      raf = requestAnimationFrame(draw);
    };
    // one line of the logo, in this game's style
    function drawLine(x, ln, cx, y, t) {
      const w = x.measureText(ln).width, faceGrad = stops => { const g = x.createLinearGradient(0, y - size * 0.8, 0, y + size * 0.05); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
      const sweep = () => { // a band of light that slides across the face
        const k = ((t / 2600) % 1) * 1.6 - 0.3, sx = cx - w / 2 + w * k;
        x.save(); x.globalCompositeOperation = 'source-atop'; const g = x.createLinearGradient(sx - 60 * S, 0, sx + 60 * S, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(sx - 60 * S, y - size, 120 * S, size * 1.2); x.restore();
      };
      // the face goes on its own layer so the sweep only lights the letters
      const face = (fill, extra) => { if (L.width !== cv.width || L.height !== cv.height) { L.width = cv.width; L.height = cv.height; } const lx = L.getContext('2d'); lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, L.width, L.height); lx.setTransform(x.getTransform()); lx.font = x.font; lx.textAlign = 'center'; lx.fillStyle = fill; lx.fillText(ln, cx, y); if (extra) extra(lx); const keep = x; x = lx; sweep(); x = keep; x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(L, 0, 0); x.restore(); };
      if (style === 'neon') {
        const flick = Math.sin(t / 47) > 0.985 ? 0.5 : 1;
        x.globalAlpha = flick; x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = 30 * S; x.lineWidth = 7 * S; x.strokeText(ln, cx, y); x.shadowBlur = 14 * S; x.strokeText(ln, cx, y);
        x.shadowBlur = 0; x.strokeStyle = '#fff'; x.lineWidth = 2.4 * S; x.strokeText(ln, cx, y); x.globalAlpha = 1;
        return;
      }
      const depth = (pixel ? 9 : 10) * S, step = pixel ? 1.5 * S : 1 * S;
      const side = style === 'chrome' ? tint(col, -0.35) : style === 'retro' ? '#4a1a6a' : pixel ? '#ff5edb' : tint(col, -0.6);
      x.fillStyle = '#0a0612'; for (let d = depth + 3 * S; d > 0; d -= step) x.fillText(ln, cx + d * 0.45, y + d); // drop and outline under the extrusion
      for (let d = depth; d > 0; d -= step) { x.fillStyle = d === depth ? tint(side, -0.3) : side; x.fillText(ln, cx + d * 0.45, y + d); }
      x.strokeStyle = '#0a0612'; x.lineWidth = (pixel ? 14 : 12) * S; x.strokeText(ln, cx, y);
      if (style === 'block') face(faceGrad([[0, tint(col, 0.65)], [0.45, col], [1, tint(col, -0.3)]]), lx => { lx.strokeStyle = 'rgba(255,255,255,.55)'; lx.lineWidth = 1.5 * S; lx.strokeText(ln, cx, y - 2 * S); });
      else if (style === 'chrome') face(faceGrad([[0, '#ffffff'], [0.42, '#c8ccd8'], [0.5, '#4a4e60'], [0.56, '#8a8ea0'], [1, '#f0f2f8']]), lx => { lx.strokeStyle = tint(col, 0.2); lx.lineWidth = 2 * S; lx.strokeText(ln, cx, y); });
      else if (style === 'pixel') face(faceGrad([[0, tint(col, 0.55)], [0.5, tint(col, 0.55)], [0.5, col], [1, tint(col, -0.2)]]));
      else if (style === 'retro') face(faceGrad([[0, '#fff6a8'], [0.35, '#ffd23d'], [0.6, '#ff8a3d'], [1, '#ff4fa3']]), lx => {
        lx.save(); lx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 4; i++) lx.fillRect(0, y - size * 0.32 + i * size * 0.09, cv.width, (1 + i) * S); lx.restore();
        lx.strokeStyle = '#fff'; lx.lineWidth = 1.5 * S; lx.strokeText(ln, cx, y);
      });
    }
    layout(); raf = requestAnimationFrame(draw);
  }
  /** Cloud save (shared/save.js), when the player has turned it on: sync a few seconds after each game over. */
  let syncT = 0;
  function cloudSync() {
    if (!store.get('bitcade:sync') || A.id === 'game') return;
    clearTimeout(syncT); syncT = setTimeout(() => { saveTime(); import(new URL('save.js', KIT_URL).href).then(m => m.sync()).catch(() => {}); }, 3000);
  }

  /*
   * Attract-mode demos. A game registers A.attract({ start, stop, bot }): start() begins a game, stop() puts it back
   * in its title state, and bot(dt) returns the key codes to hold this tick ('!Code' taps a key: pressed now, released
   * next tick). Left alone on the title screen for a while, the game plays itself (silently, scoring nothing) with a
   * DEMO banner, then returns to the title. Any key, tap, click or controller button ends it straight away.
   * Game-over screens drift back to the title once CONTINUE? runs out, like a real cabinet.
   */
  const DEMO_WAIT = (+new URLSearchParams(location.search).get('demo') || 12) * 1000, DEMO_LEN = 32000; // ?demo=2 for testing
  let demoCfg = null, titleArgs = null, demoT = 0, demoUntil = 0, demoHeld = new Set(), demoTaps = [];
  A.demo = false;
  A.attract = cfg => { demoCfg = cfg; if (titleArgs && overlayOpen()) armDemo(true); };
  function armDemo(isTitle) { clearTimeout(demoT); if (isTitle && demoCfg) demoT = setTimeout(startDemo, DEMO_WAIT); }
  function startDemo() {
    if (!demoCfg || !overlayOpen() || entry || document.hidden) return;
    A.hideOverlay(); A.demo = true; demoUntil = performance.now() + DEMO_LEN; demoHeld = new Set(); demoTaps = [];
    const scr = document.querySelector('.screen'); if (scr && !$('demoTag')) { const d = document.createElement('div'); d.id = 'demoTag'; d.className = 'demo-tag'; d.textContent = 'DEMO · PRESS START'; scr.append(d); }
    try { demoCfg.start(); } catch (e) { endDemo(); }
  }
  function demoTick(dt) {
    if (performance.now() > demoUntil) return endDemo();
    demoTaps.forEach(c => { A.down.delete(c); }); demoTaps = [];
    let want = []; try { want = demoCfg.bot(dt) || []; } catch (e) { want = []; }
    const hold = new Set(want.filter(c => c[0] !== '!'));
    demoHeld.forEach(c => { if (!hold.has(c)) ku(c); });
    hold.forEach(c => { if (!demoHeld.has(c)) kd(c); });
    demoHeld = hold;
    want.filter(c => c[0] === '!').forEach(c => { const code = c.slice(1); A.down.delete(code); kd(code); demoTaps.push(code); });
  }
  function endDemo() {
    if (!A.demo) return;
    A.demo = false; demoHeld.forEach(ku); demoHeld.clear(); demoTaps.forEach(ku); demoTaps = []; A.down.clear();
    const tag = $('demoTag'); if (tag) tag.remove();
    try { demoCfg.stop(); } catch (e) {}
    A.setScore(0); lastResult = null;
    if (titleArgs) A.overlay(titleArgs);
  }
  function afterThanks() {
    if (!demoCfg || !titleArgs) return;
    const o = $('ov'); clearTimeout(demoT);
    demoT = setTimeout(() => { if (overlayOpen() && !entry && o.querySelector('.cont.done')) { try { demoCfg.stop(); } catch (e) {} A.setScore(0); A.overlay(titleArgs); } }, 4000);
  }
  // A real key, tap or click ends a demo (and doesn't reach the game); so does any controller input (in pollPads).
  addEventListener('keydown', e => { if (A.demo && e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); endDemo(); } }, true);
  addEventListener('pointerdown', e => { if (A.demo && e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); endDemo(); } }, true);
  ['keydown', 'pointerdown', 'pointermove'].forEach(ev => addEventListener(ev, e => { if (!A.demo && e.isTrusted && titleArgs && overlayOpen() && demoT && shown && !entry && titleShown()) armDemo(true); }, { passive: true }));
  const titleShown = () => !!$('ov').querySelector('.push');

  /* ---------- initials + top-10 table ---------- */
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function entryKey(code) {
    const L = entry.letters, i = LETTERS.indexOf(L[entry.pos]);
    if (code === 'ArrowUp') L[entry.pos] = LETTERS[(i + 1) % 26];
    else if (code === 'ArrowDown') L[entry.pos] = LETTERS[(i + 25) % 26];
    else if (code === 'ArrowLeft') entry.pos = Math.max(0, entry.pos - 1);
    else if (code === 'ArrowRight') entry.pos = Math.min(2, entry.pos + 1);
    else return;
    A.tone(660, 0.03); renderHS();
  }
  function saveEntry() {
    const { res } = entry, n = entry.letters.join(''), placed = res.rank >= 0;
    const top = res.top.slice(); if (placed) { top.splice(res.rank, 0, { n, s: res.s }); top.length = Math.min(top.length, 10); store.set(topKey, JSON.stringify(top)); }
    store.set('arcade:initials', n);
    if (res.chal) chalSend(res); // a challenge run waiting for initials to sign it
    shown = { top, hi: res.rank, day: shown && shown.day, week: shown && shown.week }; entry = null; lastSaved = { n, s: res.s };
    A.jingle([784, 988, 1175], 0.06); renderHS(); startContinue(); cloudSync();
    queuePost(n, res.s, placed, res.day && res.day.improved ? res.day.d : null, res.week && res.week.improved ? res.week.w : null);
    const go = $('ov').querySelector('.go'); if (go) go.focus();
  }
  function renderHS() {
    const o = $('ov'), hs = o && o.querySelector('.hs'); if (!hs) return;
    const go = o.querySelector('.go');
    go.textContent = entry ? 'Save' : goLabel; o.querySelectorAll('.go2').forEach(b => { b.hidden = !!entry; });
    const wk = o.querySelector('.weekly'); if (wk) wk.hidden = !!entry;
    o.querySelectorAll('.share,.chal-btns').forEach(b => { b.hidden = !!entry; });
    if (entry) {
      const slots = entry.letters.map((ch, i) => `<div class="slot${i === entry.pos ? ' cur' : ''}">` +
        `<button tabindex="-1" data-slot="${i}" data-dir="ArrowUp" aria-label="Next letter">▲</button>` +
        `<button tabindex="-1" data-slot="${i}" class="ch">${ch}</button>` +
        `<button tabindex="-1" data-slot="${i}" data-dir="ArrowDown" aria-label="Previous letter">▼</button></div>`).join('');
      const r = entry.res, head = r.rank >= 0 ? `RANK ${r.rank + 1}` : r.day && r.day.improved ? `TODAY'S BEST` : r.week && r.week.improved ? `THIS WEEK'S BEST` : 'CHALLENGE';
      hs.innerHTML = `<div class="hs-head">${head} · ENTER YOUR INITIALS</div><div class="ini">${slots}</div>` +
        `<div class="hs-hint">Type, or ↑↓ to change and ←→ to move</div>`;
      return;
    }
    if (!shown) { hs.innerHTML = ''; return; }
    const LABEL = { world: 'WORLD', today: 'TODAY', week: 'THIS WEEK', local: 'THIS DEVICE', badges: `BADGES ${A.badgesGot().length}/${A.badgeList().length}` };
    const tab = id => `<button tabindex="-1" data-tab="${id}"${hsTab === id ? ' class="on"' : ''}>${LABEL[id]}</button>`;
    const note = t => `<div class="hs-note">${t}</div>`;
    const local = shown.top.length ? table(shown.top, shown.hi) : note('No scores on this device yet');
    let body;
    if (hsTab === 'local') body = local;
    else if (hsTab === 'badges') {
      const got = A.badgesGot();
      body = `<div class="hs-badges">${A.badgeList().map(b => `<div class="badge${got.includes(b.id) ? ' got' : ''}">` +
        `<span>${got.includes(b.id) ? '★' : '☆'}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join('')}</div>`;
    } else {
      const b = boards[hsTab], what = hsTab === 'today' ? `today's daily scores` : hsTab === 'week' ? `tournament scores this week` : 'world scores';
      if (b.state === 'ok') body = b.list.length ? table(b.list, lastSaved ? b.list.findIndex(e => e.n === lastSaved.n && e.s === lastSaved.s) : -1) : note(`No ${what} yet. Be the first!`);
      else if (b.state === 'off') body = note(`${what[0].toUpperCase() + what.slice(1)} are offline · showing this device`) + local;
      else body = note(`Loading ${what}…`);
    }
    hs.innerHTML = `<div class="hs-tabs">${tabs().map(tab).join('')}</div>${body}${shown.day ? dayLine(shown.day) : ''}${shown.week ? weekLine(shown.week) : ''}`;
  }
  const onlineTabs = () => ['world', ...(dailyDay ? ['today'] : []), ...(A.featured() ? ['week'] : [])];
  const tabs = () => [...onlineTabs(), 'local', ...(A.badgeList().length ? ['badges'] : [])];
  // Names are checked against 3 capital letters before display: world scores come from other players.
  const ORD = ['1ST', '2ND', '3RD'];
  const table = (list, hi) => `<div class="hs-table">${list.map((e, i) => `<div class="row${i < 3 ? ' r' + (i + 1) : ''}${i === hi ? ' me' : ''}"><span>${ORD[i] || (i + 1) + 'TH'}</span>` +
    `<span>${/^[A-Z?]{3}$/.test(e.n) ? e.n : '???'}</span><span>${(+e.s || 0).toLocaleString()}</span></div>`).join('')}</div>`;
  const weekLine = w => `<div class="hs-day">TOURNAMENT · YOUR BEST THIS WEEK ${w.s.toLocaleString()}</div>`;
  const dayLine = d => `<div class="hs-day">DAILY ${d.d} · TODAY'S BEST ${d.s.toLocaleString()}</div>`;

  /* ---------- misc ---------- */
  A.rnd = n => Math.floor(Math.random() * n);
  A.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  A.rand = (a, b) => a + Math.random() * (b - a);
  A.pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- the cabinet: lit marquee, bezel with a 1UP / HI-SCORE strip, control panel ---------- */
  function buildCabinet() {
    const screen = document.querySelector('.stage > .screen'), h1 = document.querySelector('.bar h1'); if (!screen || !h1) return;
    const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
    const cab = el('cabinet'), marquee = el('marquee', '<span></span>'), bezel = el('bezel'), strip = el('bezel-top'), panel = el('cpanel', '<div class="stick" aria-hidden="true"></div><div class="card"></div><div class="cp-buttons" aria-hidden="true"><i></i><i></i></div>');
    marquee.firstChild.textContent = h1.textContent;
    const sc = document.querySelector('.bar .sc');
    if (sc) { sc.querySelectorAll('span').forEach((s, i) => { s.firstChild.textContent = i ? 'HI-SCORE' : '1UP'; }); strip.append(sc); }
    strip.insertAdjacentHTML('beforeend', '<span class="freeplay">FREE PLAY</span>');
    screen.before(cab); bezel.append(strip, screen);
    const help = document.querySelector('.stage > .help'); if (help) panel.querySelector('.card').append(help);
    cab.append(marquee, bezel, panel);
    cab.insertAdjacentHTML('afterend', '<p class="turn-hint" aria-hidden="true">⟳ TURN YOUR PHONE SIDEWAYS FOR A BIGGER SCREEN</p>'); // phones held upright, wide games
    document.body.classList.add('cab-on');
    fitScreen();
    ['resize', 'orientationchange'].forEach(e => addEventListener(e, fitScreen));
    if (window.visualViewport) visualViewport.addEventListener('resize', fitScreen);
    if (document.fonts) document.fonts.ready.then(fitScreen);
    setTimeout(fitScreen, 300);
  }
  /*
   * Phones and narrow windows: size the screen to the space really left once the header, marquee, score strip and
   * touch pad are laid out (each game's pad is different), so nothing spills off the bottom. A phone held sideways
   * gets body.phone-land: no marquee, the header floating in the corners, and the pad's two halves either side of the
   * screen. Wide windows are measured the same way (the CSS fit is the fallback before this runs).
   */
  function fitScreen() {
    const body = document.body, screen = document.querySelector('.cab-on .screen'), stage = document.querySelector('.stage'), cab = document.querySelector('.cabinet');
    if (!screen || !stage || !cab) return;
    const vv = window.visualViewport, vw = vv ? vv.width : innerWidth, vh = vv ? vv.height : innerHeight;
    const phone = matchMedia('(pointer:coarse)').matches, land = phone && vw > vh && vh < 560;
    body.classList.toggle('phone-land', land);
    const ar = A.W && A.H ? A.W / A.H : 1, cs = getComputedStyle(stage), bs = getComputedStyle(body), bar = document.querySelector('.bar');
    // everything in the stage except the screen, plus the header and the safe areas
    let used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), n = 0;
    for (const el of stage.children) {
      const st = getComputedStyle(el); if (st.display === 'none' || st.position === 'fixed' || st.position === 'absolute' || el.classList.contains('turn-hint')) continue;
      used += el.offsetHeight + parseFloat(st.marginTop) + parseFloat(st.marginBottom); n++;
    }
    used += Math.max(0, n - 1) * (parseFloat(cs.rowGap) || 0) - screen.offsetHeight;
    used += (bar && !land ? bar.offsetHeight : 0) + parseFloat(bs.paddingTop) + parseFloat(bs.paddingBottom) + 4;
    const frameW = cab.offsetWidth - screen.offsetWidth, padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    let maxW = vw - frameW - padX;
    if (land) { const sides = [...document.querySelectorAll('.pad > *, .bar > .back, .bar > .toggles')].reduce((m, el) => Math.max(m, el.offsetWidth), 0); if (sides) maxW = Math.min(maxW, vw - 2 * (sides + 14) - frameW); }
    const sw = Math.floor(Math.max(120, Math.min(maxW, (vh - used - 6) * ar)));
    body.style.setProperty('--sw', sw + 'px');
    body.classList.toggle('wide-game', ar > 1.15);
  }

  /*
   * BIG SCREEN (the ⛶ header button): no marquee or control panel, so the game's screen gets the whole window, and the
   * browser goes full screen where it can. The layout is remembered (arcade:big); full screen itself needs a press each time.
   */
  function bigButton(before) {
    const fsOK = !!(document.documentElement.requestFullscreen && document.fullscreenEnabled);
    if (!fsOK && matchMedia('(pointer:coarse)').matches) return; // a phone without full screen (iPhone) already gets the slim cabinet
    const b = document.createElement('button'); b.className = 'mute big-btn'; b.type = 'button';
    const set = on => {
      document.body.classList.toggle('big', on); b.textContent = '⛶'; b.title = on ? 'Back to the cabinet' : 'Big screen';
      b.setAttribute('aria-label', b.title); b.setAttribute('aria-pressed', String(on)); store.set('arcade:big', on ? '1' : '0'); fitScreen();
    };
    set(store.get('arcade:big') === '1');
    b.addEventListener('click', () => {
      const on = !document.body.classList.contains('big'); set(on); b.blur();
      try {
        if (on && fsOK && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } catch (e) {}
    });
    let wasFull = false; // leaving full screen (Esc) goes back to the cabinet too
    document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) wasFull = true; else if (wasFull) { wasFull = false; set(false); } setTimeout(fitScreen, 60); });
    before.before(b);
  }

  /*
   * Screen transitions, like an old CRT. Arriving from the lobby (which sets bitcade:enter as it powers off), the
   * screen powers on: a line of light opens out from the middle, with a flash. Going back to the lobby powers it
   * off: the picture collapses to a line, then a dot. Inline styles, so Blip Sports (no arcade.css) gets them too.
   */
  const calmCRT = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function crtLayer() {
    const o = document.createElement('div'); o.className = 'crt-fx';
    o.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden';
    o.innerHTML = '<i></i><i></i><b></b><s></s>';
    const [top, bot] = o.querySelectorAll('i'), line = o.querySelector('b'), glow = o.querySelector('s');
    top.style.cssText = 'position:absolute;left:0;right:0;top:0;height:50%;background:#000';
    bot.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:50%;background:#000';
    line.style.cssText = 'position:absolute;left:50%;top:50%;width:100%;height:3px;margin-top:-1.5px;transform:translateX(-50%);background:#fff;box-shadow:0 0 18px 4px rgba(190,230,255,.9)';
    glow.style.cssText = 'position:absolute;inset:0;background:#d8f0ff;opacity:0';
    document.body.append(o); return { o, top, bot, line, glow };
  }
  function crtOn() {
    const L = crtLayer();
    if (calmCRT) { L.o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => L.o.remove(); return; }
    L.line.animate([{ width: '0%', opacity: 1 }, { width: '100%', opacity: 1 }], { duration: 170, easing: 'ease-out', fill: 'forwards' });
    L.top.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-101%)' }], { duration: 300, delay: 170, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    L.bot.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(101%)' }], { duration: 300, delay: 170, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    L.line.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay: 230, fill: 'forwards' });
    L.glow.animate([{ opacity: 0 }, { opacity: 0.45 }, { opacity: 0 }], { duration: 380, delay: 170, fill: 'forwards' }).onfinish = () => L.o.remove();
  }
  /** Power the screen off, then go to href. */
  let swReg = null;
  /*
   * The screen warms up like an old set: a moment of static with the game's name, fading into the picture once the
   * fonts are in (at least 0.35 s, at most 2 s). Reduced motion skips it.
   */
  function warmUp() {
    const scr = document.querySelector('.screen'); if (!scr || calmCRT) return;
    const w = document.createElement('div'); w.className = 'warm'; w.setAttribute('aria-hidden', 'true');
    const c = document.createElement('canvas'); c.width = 128; c.height = 80; const b = document.createElement('b'); b.textContent = (document.querySelector('.bar h1') || {}).textContent || '';
    const sm = document.createElement('small'); sm.textContent = 'TUNING IN'; w.append(c, b, sm); scr.append(w);
    const x = c.getContext('2d'), img = x.createImageData(c.width, c.height); let live = true;
    (function frame() { if (!live) return; const d = img.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 200 | 0; d[i] = v * 0.8; d[i + 1] = v * 0.85; d[i + 2] = v; d[i + 3] = 255; } x.putImageData(img, 0, 0); requestAnimationFrame(frame); })();
    const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('20px Bungee'), document.fonts.load('12px Silkscreen')]).catch(() => {}) : null;
    Promise.race([Promise.all([fonts, new Promise(r => setTimeout(r, 350))]), new Promise(r => setTimeout(r, 2000))])
      .then(() => { w.classList.add('off'); setTimeout(() => { live = false; w.remove(); }, 500); });
  }
  A.crtOff = href => {
    try { sessionStorage.setItem('bitcade:enter', '1'); } catch (e) {} // so the lobby powers on when it loads
    if (swReg && swReg.waiting) swReg.waiting.postMessage('skip'); // a new version of the site takes over at this screen change
    A.tone(1200, 0.3, 'sine', 0.035, 0, 60);
    if (calmCRT) { const L = crtLayer(); L.line.remove(); L.top.style.height = L.bot.style.height = '51%'; L.o.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' }).onfinish = () => { location.href = href; }; return; }
    const L = crtLayer();
    L.line.style.opacity = '0';
    L.top.animate([{ transform: 'translateY(-101%)' }, { transform: 'translateY(0)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    L.bot.animate([{ transform: 'translateY(101%)' }, { transform: 'translateY(0)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    L.line.animate([{ opacity: 0, width: '100%' }, { opacity: 1, width: '100%', offset: 0.35 }, { opacity: 1, width: '1%', height: '3px', offset: 0.8 }, { opacity: 0, width: '0.5%', height: '3px' }], { duration: 420, delay: 160, fill: 'forwards' })
      .onfinish = () => { location.href = href; };
  };
  addEventListener('pageshow', e => { if (e.persisted) document.querySelectorAll('.crt-fx').forEach(o => o.remove()); }); // back from the lobby, out of the page cache
  function init() {
    try { if (sessionStorage.getItem('bitcade:enter')) { sessionStorage.removeItem('bitcade:enter'); crtOn(); } } catch (e) {}
    document.addEventListener('click', e => { // the back link (◀ BITCADE) powers the screen off first
      const a = e.target.closest && e.target.closest('a[href="../../"]'); if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault(); A.crtOff(a.href);
    });
    A.showBest();
    buildCabinet();
    if (mastered()) setMastered();
    loadChallenge();
    if (window.EVENT && EVENT.on('halloween')) document.body.classList.add('ev-halloween'); // a pumpkin by FREE PLAY
    const m = $('mute');
    // Touch players need a way to pause; add a header button unless the pad already has one (shown on coarse pointers only).
    if (m && !document.querySelector('[data-k="KeyP"]')) {
      const p = document.createElement('button'); p.className = 'mute pause'; p.dataset.k = 'KeyP'; p.textContent = 'PAUSE'; m.before(p);
    }
    bindPads();
    // Prizes from the lobby's prize counter (shared/prizes.js): a screen tint and a cabinet finish, as body classes.
    try { const eq = JSON.parse(store.get('arcade:equip')) || {}; ['tint', 'skin'].forEach(k => { if (/^[a-z]+$/.test(eq[k] || '')) document.body.classList.add(`${k}-${eq[k]}`); }); } catch (e) {}
    if (outbox().length) flush(); // scores saved while offline
    // Offline play: the service worker (sw.js, at the site root) caches the lobby and every game.
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../sw.js', KIT_URL).href).then(r => { swReg = r; }).catch(() => {});
    warmUp();
    // CRT has three settings: LITE (the default: faint scanlines and glow), FULL and OFF. Stored as 'lite' | '1' | '0'.
    const crtSet = () => { const v = store.get('arcade:crt'), mode = ['lite', '1', '0'].includes(v) ? v : 'lite'; document.body.classList.toggle('crt', mode === '1'); document.body.classList.toggle('crt-lite', mode === 'lite'); };
    crtSet();
    if (m) {
      // the header keeps PAUSE (touch) and one SETTINGS button (shared/settings.js, loaded here); an EASY tag shows while easy mode is on
      m.id = 'settings'; m.className = 'mute set-btn'; m.textContent = '⚙ SETTINGS'; m.setAttribute('aria-haspopup', 'dialog');
      const tag = document.createElement('span'); tag.className = 'easy-tag'; tag.textContent = 'EASY'; tag.title = 'Easy mode is on: scores, badges and tickets don\u2019t count';
      const easySet = () => { tag.hidden = !A.easy; document.body.classList.toggle('easy-on', A.easy); };
      easySet();
      const group = document.createElement('div'); group.className = 'toggles'; m.before(group);
      [document.querySelector('.bar .pause'), tag, m].filter(Boolean).forEach(b => group.append(b));
      bigButton(m);
      const controls = () => { const seen = new Set(), out = []; document.querySelectorAll('.pad [data-k], .bar .pause').forEach(b => { const c = b.dataset.k; if (seen.has(c)) return; seen.add(c); out.push({ code: c, label: c === 'KeyP' ? 'Pause' : (t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())((b.getAttribute('aria-label') || b.textContent || c).trim()) }); }); if (!seen.has('KeyP')) out.push({ code: 'KeyP', label: 'Pause' }); return out; };
      const openSettings = (extra = {}) => {
        A.unlock();
        if (!overlayOpen() && !document.querySelector('.story:not([hidden])') && !A.demo) { kd('KeyP'); ku('KeyP'); } // pause a run first
        const go = () => Settings.open({ slug: A.id, controls: controls(), ...extra });
        if (window.Settings) return go();
        const s = document.createElement('script'); s.src = new URL('settings.js', KIT_URL).href; s.onload = () => { hookSettings(); go(); }; document.head.append(s);
      };
      m.addEventListener('click', () => openSettings()); A.openSettings = openSettings;
      let hooked = false;
      const hookSettings = () => { if (hooked || !window.Settings) return; hooked = true; Settings.onChange(k => {
        if (k === 'arcade:muted') { A.muted = store.get('arcade:muted') === '1'; if (music()) music().refresh(); }
        if (k === 'arcade:music' && music()) music().refresh();
        if (k === 'arcade:vol:sfx' && bus) bus.gain.value = sfxVol();
        if (k === 'arcade:vol:music' && music()) music().volume(music().level);
        if (k === 'arcade:crt') crtSet();
        if (k === 'arcade:easy') { A.easy = store.get('arcade:easy') === '1'; if (A.easy && !overlayOpen()) runEasy = true; easySet(); if (titleArgs && overlayOpen() && titleShown()) A.overlay(titleArgs); } // redraw the title's EASY MODE note
        if (k && k.startsWith('arcade:keys:')) loadKeys();
        if (k !== 'close') A.tone(880, 0.03, 'square', 0.025);
      }); };
      if (window.Settings) hookSettings();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.Arcade = A;
})();
