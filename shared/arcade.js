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
  /** Seeded random (0..1) from a string, so everyone gets the same sequence for the same key (e.g. 'stackdown:' + A.today()). */
  A.seeded = key => {
    let h = 1779033703 ^ key.length;
    for (let i = 0; i < key.length; i++) { h = Math.imul(h ^ key.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let a = h >>> 0;
    return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  };
  let lastResult = null; // read by the next A.overlay call, which shows initials entry and the table
  /** Save a finished game. Pass daily=true for a daily-challenge run. Returns true on a new record. */
  A.submit = (s, daily) => {
    s = Math.floor(s);
    store.set('arcade:plays:' + A.id, (+store.get('arcade:plays:' + A.id) || 0) + 1);
    const top = A.top(); // read before updating the best, which A.top() falls back to when there's no table yet
    const rec = s > A.best();
    if (rec) { store.set('arcade:best:' + A.id, s); A.showBest(); }
    let rank = -1;
    if (s > 0) { rank = top.findIndex(e => s > e.s); if (rank < 0 && top.length < 10) rank = top.length; }
    let day = null;
    if (daily) {
      const d = A.today(); let db = null; try { db = JSON.parse(store.get('arcade:daily:' + A.id)); } catch (e) {}
      if (!db || db.d !== d || s > db.s) { db = { d, s }; store.set('arcade:daily:' + A.id, JSON.stringify(db)); }
      day = db;
    }
    lastResult = { s, rank, top, day };
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
  const kd = code => { if (!A.down.has(code)) { A.down.add(code); if (entry) entryKey(code); else pressFns.forEach(f => f(code)); } };
  const ku = code => A.down.delete(code);
  A.press = kd; A.release = ku;
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  addEventListener('keydown', e => {
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
      const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
      if (x < -0.5) codes.add('ArrowLeft'); if (x > 0.5) codes.add('ArrowRight');
      if (y < -0.5) codes.add('ArrowUp'); if (y > 0.5) codes.add('ArrowDown');
    });
    buttons.forEach(i => {
      if (!gpButtons.has(i)) {
        A.unlock();
        if (overlayOpen() && (i === 0 || i === 9)) { gpSwallow.add(i); overlayGo(); }
        else if (overlayOpen() && i === 3 && altFn && !entry) { gpSwallow.add(i); overlayAlt(); } // Y = second overlay button
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
    cv.parentElement.style.setProperty('--ar', w / h);
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
  const overlayAlt = () => { const f = altFn; if (!f) return; A.hideOverlay(); f(); };
  /**
   * Show the overlay. alt: { btn, onGo } adds a second button (gamepad Y). scores: true lists the top 10 (title screens).
   * Called right after A.submit, it also asks for initials when the score made the top 10.
   */
  A.overlay = ({ title, sub = '', big = '', btn = 'Play', onGo, alt, scores }) => {
    const o = $('ov'), res = lastResult; lastResult = null;
    o.innerHTML = `<h2></h2>${big ? '<div class="big"></div>' : ''}${sub ? '<p></p>' : ''}<div class="hs"></div>` +
      `<div class="btns"><button class="go"></button>${alt ? '<button class="go2"></button>' : ''}</div>`;
    o.querySelector('h2').textContent = title;
    if (big) o.querySelector('.big').textContent = big;
    if (sub) o.querySelector('p').innerHTML = sub;
    o.querySelector('.go').addEventListener('click', () => { A.unlock(); overlayGo(); });
    if (alt) { const b2 = o.querySelector('.go2'); b2.textContent = alt.btn; b2.addEventListener('click', () => { A.unlock(); overlayAlt(); }); }
    const hs = o.querySelector('.hs');
    hs.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }); // keep focus off the ▲▼ buttons
    hs.addEventListener('click', e => {
      const b = e.target.closest('[data-slot]'); if (!b || !entry) return;
      entry.pos = +b.dataset.slot; if (b.dataset.dir) entryKey(b.dataset.dir); else renderHS();
    });
    goFn = onGo; altFn = alt ? alt.onGo : null; goLabel = btn; entry = null; shown = null;
    if (res) {
      shown = { top: res.top, hi: -1, day: res.day };
      if (res.rank >= 0) entry = { res, pos: 0, letters: [...(/^[A-Z]{3}$/.test(store.get('arcade:initials')) ? store.get('arcade:initials') : 'AAA')] };
    } else if (scores) shown = { top: A.top(), hi: -1, day: null };
    renderHS(); o.hidden = false;
  };
  A.hideOverlay = () => { const o = $('ov'); if (o) o.hidden = true; entry = null; };
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
    const { res } = entry, n = entry.letters.join('');
    const top = res.top.slice(); top.splice(res.rank, 0, { n, s: res.s }); top.length = Math.min(top.length, 10);
    store.set(topKey, JSON.stringify(top)); store.set('arcade:initials', n);
    shown = { top, hi: res.rank, day: shown && shown.day }; entry = null;
    A.jingle([784, 988, 1175], 0.06); renderHS();
    const go = $('ov').querySelector('.go'); if (go) go.focus();
  }
  function renderHS() {
    const o = $('ov'), hs = o && o.querySelector('.hs'); if (!hs) return;
    const go = o.querySelector('.go'), b2 = o.querySelector('.go2');
    go.textContent = entry ? 'Save' : goLabel; if (b2) b2.hidden = !!entry;
    if (entry) {
      const slots = entry.letters.map((ch, i) => `<div class="slot${i === entry.pos ? ' cur' : ''}">` +
        `<button tabindex="-1" data-slot="${i}" data-dir="ArrowUp" aria-label="Next letter">▲</button>` +
        `<button tabindex="-1" data-slot="${i}" class="ch">${ch}</button>` +
        `<button tabindex="-1" data-slot="${i}" data-dir="ArrowDown" aria-label="Previous letter">▼</button></div>`).join('');
      hs.innerHTML = `<div class="hs-head">RANK ${entry.res.rank + 1} · ENTER YOUR INITIALS</div><div class="ini">${slots}</div>` +
        `<div class="hs-hint">Type, or ↑↓ to change and ←→ to move</div>`;
      return;
    }
    if (!shown || !shown.top.length) { hs.innerHTML = shown && shown.day ? dayLine(shown.day) : ''; return; }
    const rows = shown.top.map((e, i) => `<div class="row${i === shown.hi ? ' me' : ''}"><span>${i + 1}</span>` +
      `<span>${/^[A-Z?]{3}$/.test(e.n) ? e.n : '???'}</span><span>${(+e.s || 0).toLocaleString()}</span></div>`).join('');
    hs.innerHTML = `<div class="hs-head">HIGH SCORES</div><div class="hs-table">${rows}</div>${shown.day ? dayLine(shown.day) : ''}`;
  }
  const dayLine = d => `<div class="hs-day">DAILY ${d.d} · TODAY'S BEST ${d.s.toLocaleString()}</div>`;

  /* ---------- misc ---------- */
  A.rnd = n => Math.floor(Math.random() * n);
  A.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  A.rand = (a, b) => a + Math.random() * (b - a);
  A.pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function init() {
    A.showBest();
    const m = $('mute');
    // Touch players need a way to pause; add a header button unless the pad already has one (shown on coarse pointers only).
    if (m && !document.querySelector('[data-k="KeyP"]')) {
      const p = document.createElement('button'); p.className = 'mute pause'; p.dataset.k = 'KeyP'; p.textContent = 'PAUSE'; m.before(p);
    }
    bindPads();
    if (m) {
      const label = () => { m.textContent = A.muted ? 'SOUND OFF' : 'SOUND ON'; m.setAttribute('aria-pressed', String(!A.muted)); };
      label(); m.addEventListener('click', () => { A.muted = !A.muted; store.set('arcade:muted', A.muted ? '1' : '0'); A.unlock(); label(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.Arcade = A;
})();
