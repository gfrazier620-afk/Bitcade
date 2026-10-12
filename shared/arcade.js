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
  /** Save score if it beats the record. Returns true on a new record. */
  A.submit = s => {
    s = Math.floor(s);
    store.set('arcade:plays:' + A.id, (+store.get('arcade:plays:' + A.id) || 0) + 1);
    if (s > A.best()) { store.set('arcade:best:' + A.id, s); A.showBest(); return true; }
    return false;
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
  const kd = code => { if (!A.down.has(code)) { A.down.add(code); pressFns.forEach(f => f(code)); } };
  const ku = code => A.down.delete(code);
  A.press = kd; A.release = ku;
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  addEventListener('keydown', e => {
    A.unlock();
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
      if (!gpButtons.has(i)) { A.unlock(); if (overlayOpen() && (i === 0 || i === 9)) { gpSwallow.add(i); overlayGo(); } }
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
  let goFn = null;
  const overlayOpen = () => { const o = $('ov'); return o && !o.hidden; };
  const overlayGo = () => { const f = goFn; if (!f) return; A.hideOverlay(); f(); };
  A.overlay = ({ title, sub = '', big = '', btn = 'Play', onGo }) => {
    const o = $('ov');
    o.innerHTML = `<h2></h2>${big ? '<div class="big"></div>' : ''}${sub ? '<p></p>' : ''}<button class="go"></button>`;
    o.querySelector('h2').textContent = title;
    if (big) o.querySelector('.big').textContent = big;
    if (sub) o.querySelector('p').innerHTML = sub;
    const b = o.querySelector('.go'); b.textContent = btn;
    b.addEventListener('click', () => { A.unlock(); overlayGo(); });
    goFn = onGo; o.hidden = false;
  };
  A.hideOverlay = () => { const o = $('ov'); if (o) o.hidden = true; };
  A.overlayOpen = overlayOpen;

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
