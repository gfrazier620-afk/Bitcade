/* Arcade kit: high scores, sound, keyboard + touch input, canvas sizing, fixed-step loop, overlay. */
(() => {
  const A = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  A.store = store;
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
    const got = A.badgesGot();
    if (got.includes(id)) return;
    const def = A.badgeList().find(b => b.id === id);
    if (!def) return;
    gotCache = [...got, id]; store.set(badgeKey, JSON.stringify(gotCache));
    if (window.TICKETS) TICKETS.add(10);
    toast(`★ BADGE · ${def.name} · +10 TICKETS`); A.jingle([659, 880, 1175, 1568], 0.07, 'triangle');
    if (shown && overlayOpen()) renderHS();
  };
  /** A short message at the top of the screen. Styled inline so pages without arcade.css (Blip Sports) get it too. */
  function toast(text) {
    const n = document.querySelectorAll('.arcade-toast').length, t = document.createElement('div');
    t.className = 'arcade-toast'; t.textContent = text; t.setAttribute('role', 'status');
    t.style.cssText = `position:fixed;left:50%;top:${64 + n * 46}px;transform:translate(-50%,-12px);z-index:50;padding:9px 16px;border-radius:10px;` +
      'background:#1f1940;border:1px solid #ffd23d;color:#ffd23d;font:13px Silkscreen,ui-monospace,monospace;letter-spacing:.04em;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.5);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap';
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translate(-50%,0)'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2600);
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

  let lastResult = null; // read by the next A.overlay call, which shows initials entry and the table
  /**
   * Save a finished game. Pass daily=true for a daily-challenge run. Returns true on a new record.
   * On the week's featured game, a run that beats this device's best this week also goes to the tournament board.
   */
  A.submit = (s, daily) => {
    s = Math.floor(s);
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
    lastResult = { s, rank, top, day, week, tix };
    return rec;
  };

  /* ---------- sound ---------- */
  let ac = null;
  A.muted = store.get('arcade:muted') === '1';
  A.unlock = () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ac && ac.state === 'suspended') ac.resume();
  };
  A.tone = (f, d = 0.06, type = 'square', v = 0.04, when = 0, slideTo) => {
    if (A.muted || !ac) return;
    const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.03);
  };
  A.noise = (d = 0.2, v = 0.06, when = 0) => {
    if (A.muted || !ac) return;
    const len = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = v;
    s.connect(g).connect(ac.destination); s.start(ac.currentTime + when);
  };
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
    if (entry) entryKey(code);
    else if (shown && overlayOpen() && (code === 'ArrowLeft' || code === 'ArrowRight')) {
      const t = tabs(), i = t.indexOf(hsTab); hsTab = t[(i + (code === 'ArrowRight' ? 1 : t.length - 1)) % t.length]; renderHS();
    }
    else pressFns.forEach(f => f(code));
  };
  const ku = code => A.down.delete(code);
  A.press = kd; A.release = ku;
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('[data-keys-native]')) return; // forms and pickers that need their own keys
    A.unlock();
    if (entry && overlayOpen() && !e.repeat) {
      if (/^Key[A-Z]$/.test(e.code)) { e.preventDefault(); entry.letters[entry.pos] = e.code[3]; entry.pos = Math.min(2, entry.pos + 1); A.tone(660, 0.03); renderHS(); return; }
      if (e.code === 'Backspace') { e.preventDefault(); entry.pos = Math.max(0, entry.pos - 1); renderHS(); return; }
    }
    if (overlayOpen() && (e.code === 'Enter' || e.code === 'Space')) {
      if (e.target.closest && e.target.closest('a,button:not(.go)')) return;
      e.preventDefault(); if (!e.repeat) overlayGo(); return;
    }
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    kd(e.code);
  });
  addEventListener('keyup', e => ku(e.code));
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
    buttons.forEach(i => {
      if (!gpButtons.has(i)) {
        A.unlock();
        if (overlayOpen() && (i === 0 || i === 9)) { gpSwallow.add(i); overlayGo(); }
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
    A.W = w; A.H = h;
    return ctx;
  };
  /** Pointer position in canvas units. */
  A.pointer = (cv, e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * A.W, y: (e.clientY - r.top) / r.height * A.H }; };
  A.loop = (update, draw) => {
    let last = performance.now(), acc = 0; const dt = 1 / 60;
    const f = t => {
      acc += Math.min(0.1, (t - last) / 1000); last = t;
      while (acc >= dt) { update(dt); acc -= dt; }
      draw(t); requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  };
  const hideFns = [];
  A.onHide = fn => hideFns.push(fn);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { A.down.clear(); gpHeld.clear(); hideFns.forEach(f => f()); } });

  /* ---------- overlay ---------- */
  let goFn = null, altFn = null, goLabel = '', entry = null, shown = null; // shown: { top, hi, day } for the table
  const overlayOpen = () => { const o = $('ov'); return o && !o.hidden; };
  const overlayGo = () => { if (entry) return saveEntry(); const f = goFn; if (!f) return; A.hideOverlay(); f(); };
  const music = () => window.Chip; // shared/chip.js, when the page loads it
  const overlayAlt = () => { const f = altFn; if (!f) return; A.hideOverlay(); f(); };
  let alt2Fn = null;
  const overlayAlt2 = () => { const f = alt2Fn; if (!f) return; A.hideOverlay(); f(); };
  /**
   * Show the overlay. alt: { btn, onGo } adds a second button (gamepad Y), alt2 a third (gamepad X). scores: true lists the top 10 (title screens),
   * and daily: true adds today's daily-challenge board to it. Called right after A.submit, it also asks for initials
   * when the score made the top 10 or is the player's best daily run today.
   */
  A.overlay = ({ title, sub = '', big = '', btn = 'Play', onGo, alt, alt2, scores, daily }) => {
    const o = $('ov'), res = lastResult; lastResult = null;
    const canShare = res && res.s > 0, isTitle = scores && !res;
    clearInterval(contT);
    o.innerHTML = (isTitle && A.featured() ? `<div class="weekly">★ WEEKLY TOURNAMENT · ENDS IN ${WK.leftText()}</div>` : '') + `<h2></h2>${big ? '<div class="big"></div>' : ''}${sub ? '<p></p>' : ''}` +
      (res && res.tix ? `<div class="tix">+${res.tix} TICKETS${A.featured() ? ' · DOUBLE THIS WEEK' : ''} · ${TICKETS.balance()} TOTAL</div>` : '') + `<div class="hs"></div>` +
      (isTitle ? '<div class="push">PUSH START</div>' : '') + (res ? '<div class="cont" hidden></div>' : '') +
      `<div class="btns"><button class="go"></button>${alt ? '<button class="go2"></button>' : ''}${alt2 ? '<button class="go2 go3"></button>' : ''}</div>` +
      (canShare ? '<button class="share">Share score</button>' : '') + (isTitle ? '<div class="credit">FREE PLAY · CREDIT 99</div>' : '');
    if (canShare) { const sb = o.querySelector('.share'); sb.addEventListener('click', () => shareScore(res.s, res.day && res.day.d, sb)); }
    o.querySelector('h2').textContent = title;
    if (big) o.querySelector('.big').textContent = big;
    if (sub) o.querySelector('p').innerHTML = sub;
    o.querySelector('.go').addEventListener('click', () => { A.unlock(); overlayGo(); });
    if (alt) { const b2 = o.querySelector('.go2'); b2.textContent = alt.btn; b2.addEventListener('click', () => { A.unlock(); overlayAlt(); }); }
    if (alt2) { const b3 = o.querySelector('.go3'); b3.textContent = alt2.btn; b3.addEventListener('click', () => { A.unlock(); overlayAlt2(); }); }
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
      if (res.rank >= 0 || (res.day && res.day.improved) || (res.week && res.week.improved)) entry = { res, pos: 0, letters: [...(/^[A-Z]{3}$/.test(store.get('arcade:initials')) ? store.get('arcade:initials') : 'AAA')] };
    } else if (scores) shown = { top: A.top(), hi: -1, day: null };
    if (res && res.day) hsTab = 'today'; else if (res && res.week) hsTab = 'week'; else if (!tabs().includes(hsTab)) hsTab = 'world';
    renderHS(); o.hidden = false;
    if (res && !entry) startContinue();
    if (shown) loadWorld();
    // the game's theme plays from the title screen right through the game: full volume on screens like this, quieter in play
    if (music()) { music().play(music().theme(A.id)); music().volume(0.5); }
  };
  A.hideOverlay = () => { const o = $('ov'); if (o) o.hidden = true; entry = null; clearInterval(contT); if (music()) music().volume(0.3); };
  /** Game over, arcade style: CONTINUE? counts down 9 to 0 with a beep each second (starting a new game any time). */
  let contT = 0;
  function startContinue() {
    const c = $('ov') && $('ov').querySelector('.cont'); if (!c) return;
    let n = 9; c.hidden = false; c.classList.remove('done'); c.textContent = 'CONTINUE? 9';
    clearInterval(contT);
    contT = setInterval(() => {
      if (!c.isConnected || !overlayOpen()) return clearInterval(contT);
      n--;
      if (n < 0) { clearInterval(contT); c.textContent = 'THANKS FOR PLAYING'; c.classList.add('done'); return; }
      c.textContent = 'CONTINUE? ' + n; A.tone(n ? 880 : 440, 0.07, 'square', 0.03);
    }, 1000);
  }
  A.overlayOpen = overlayOpen;

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
    shown = { top, hi: res.rank, day: shown && shown.day, week: shown && shown.week }; entry = null; lastSaved = { n, s: res.s };
    A.jingle([784, 988, 1175], 0.06); renderHS(); startContinue();
    queuePost(n, res.s, placed, res.day && res.day.improved ? res.day.d : null, res.week && res.week.improved ? res.week.w : null);
    const go = $('ov').querySelector('.go'); if (go) go.focus();
  }
  function renderHS() {
    const o = $('ov'), hs = o && o.querySelector('.hs'); if (!hs) return;
    const go = o.querySelector('.go');
    go.textContent = entry ? 'Save' : goLabel; o.querySelectorAll('.go2').forEach(b => { b.hidden = !!entry; });
    const wk = o.querySelector('.weekly'); if (wk) wk.hidden = !!entry;
    const sb = o.querySelector('.share'); if (sb) sb.hidden = !!entry;
    if (entry) {
      const slots = entry.letters.map((ch, i) => `<div class="slot${i === entry.pos ? ' cur' : ''}">` +
        `<button tabindex="-1" data-slot="${i}" data-dir="ArrowUp" aria-label="Next letter">▲</button>` +
        `<button tabindex="-1" data-slot="${i}" class="ch">${ch}</button>` +
        `<button tabindex="-1" data-slot="${i}" data-dir="ArrowDown" aria-label="Previous letter">▼</button></div>`).join('');
      const r = entry.res, head = r.rank >= 0 ? `RANK ${r.rank + 1}` : r.day && r.day.improved ? `TODAY'S BEST` : `THIS WEEK'S BEST`;
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
    document.body.classList.add('cab-on');
  }

  function init() {
    A.showBest();
    buildCabinet();
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
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../sw.js', KIT_URL).href).catch(() => {});
    if (m) {
      const label = () => { m.textContent = A.muted ? 'SOUND OFF' : 'SOUND ON'; m.setAttribute('aria-pressed', String(!A.muted)); };
      label(); m.addEventListener('click', () => { A.muted = !A.muted; store.set('arcade:muted', A.muted ? '1' : '0'); A.unlock(); label(); if (music()) music().refresh(); });
      // MUSIC and CRT (scanline look) buttons, both remembered
      const toggle = (id, text, isOn, flip) => {
        const b = document.createElement('button'); b.className = 'mute'; b.id = id;
        const set = () => { b.textContent = `${text} ${isOn() ? 'ON' : 'OFF'}`; b.setAttribute('aria-pressed', String(isOn())); };
        b.addEventListener('click', () => { flip(); set(); }); set(); return b;
      };
      // CRT has three settings: LITE (the default: faint scanlines and glow), FULL and OFF. Stored as 'lite' | '1' | '0'.
      const CRT = ['lite', '1', '0'], CRT_LABEL = { lite: 'CRT LITE', 1: 'CRT FULL', 0: 'CRT OFF' };
      const crtMode = () => CRT.includes(store.get('arcade:crt')) ? store.get('arcade:crt') : 'lite';
      const crt = document.createElement('button'); crt.className = 'mute'; crt.id = 'crt';
      const crtSet = () => { const mode = crtMode(); document.body.classList.toggle('crt', mode === '1'); document.body.classList.toggle('crt-lite', mode === 'lite'); crt.textContent = CRT_LABEL[mode]; crt.setAttribute('aria-pressed', String(mode !== '0')); };
      crt.addEventListener('click', () => { store.set('arcade:crt', CRT[(CRT.indexOf(crtMode()) + 1) % CRT.length]); crtSet(); });
      crtSet(); m.after(crt);
      if (music()) m.after(toggle('music', 'MUSIC', () => music().enabled, () => { music().enabled = !music().enabled; }));
      // keep the header buttons together, so they wrap as one row on narrow screens
      const group = document.createElement('div'); group.className = 'toggles'; m.before(group);
      [document.querySelector('.bar .pause'), m, $('music'), crt].filter(Boolean).forEach(b => group.append(b));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.Arcade = A;
})();
