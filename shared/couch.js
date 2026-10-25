/*
 * Couch mode for the lobby (lobby only): get round every page with the arrow keys or a controller, like a console
 * menu. Arrows (d-pad, left stick) move the highlight to the nearest thing that way; Enter or A picks it; Escape or B
 * closes whatever's open; Y (or F) pins the highlighted cabinet to Favorites; LB and RB switch between CABINETS, WALK
 * THE ARCADE and PROFILE; Start opens settings. Inside an open panel (prize counter, pass, settings) it stays inside it.
 * Each move clicks, each pick chimes (with SOUND on).
 *   Couch.init({ active: () => bool, views: [buttons], onSettings })
 */
window.Couch = (() => {
  let opts = { active: () => true, views: [], onSettings: null }, ac = null;
  const muted = () => { try { return localStorage.getItem('arcade:muted') === '1'; } catch (e) { return false; } };
  function blip(f, d = 0.04, v = 0.03) {
    if (muted()) return;
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.03); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.05);
    } catch (e) {}
  }
  /** The open panel (dialog) if there is one: moves stay inside it. */
  const scope = () => [...document.querySelectorAll('.set:not([hidden]),.ps:not([hidden]),.pc:not([hidden])')].pop() || document;
  const SEL = 'a[href],button:not([disabled]),input:not([type=hidden]),select,[tabindex="0"]';
  function candidates() {
    const root = scope();
    return [...root.querySelectorAll(SEL)].filter(el => {
      if (el.closest('[hidden],.boot') || el.classList.contains('fav') || el.closest('.nudge,.hero-nav,.hero-dots')) return false; // pin with Y instead; scroll arrows aren't stops
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
      const track = el.closest('.hero-track'); if (track) { const t = track.getBoundingClientRect(); if (r.left < t.left - 4 || r.right > t.right + 4) return false; } // only the banner slide that's showing
      const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
  }
  function move(dx, dy) {
    const all = candidates(); if (!all.length) return;
    const cur = document.activeElement && all.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { // start from whatever's in view near the top
      const inPage = all.filter(el => !el.closest('.music-btn') && getComputedStyle(el).position !== 'fixed');
      const first = inPage.find(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }) || inPage[0] || all[0];
      return pick(first);
    }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bd = 1e9;
    for (const el of all) {
      if (el === cur || cur.contains(el) || el.contains(cur)) continue;
      const r = el.getBoundingClientRect(), bx = r.left + r.width / 2, by = r.top + r.height / 2;
      // how far along the way we're going (edge to edge, so wide things count as close), and how far off to the side
      const along = dx ? (dx > 0 ? r.left - a.right : a.left - r.right) : (dy > 0 ? r.top - a.bottom : a.top - r.bottom);
      const centre = dx ? (bx - ax) * dx : (by - ay) * dy; if (centre <= 4) continue;
      const side = dx ? Math.max(0, Math.max(r.top, a.top) < Math.min(r.bottom, a.bottom) ? 0 : Math.abs(by - ay)) : Math.max(0, Math.max(r.left, a.left) < Math.min(r.right, a.right) ? 0 : Math.abs(bx - ax));
      const d = Math.max(0, along) + side * 2.4 + Math.abs(centre) * 0.05; if (d < bd) { bd = d; best = el; }
    }
    if (best) pick(best); else blip(160, 0.05, 0.02);
  }
  function pick(el) {
    el.focus({ preventScroll: true });
    const r = el.getBoundingClientRect(), pad = 90;
    if (r.top < pad || r.bottom > innerHeight - pad) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const row = el.closest('.row,.hero-track,.ps-track,.gchips'); if (row && row.scrollWidth > row.clientWidth) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (el.closest('.hero-track')) { const s = el.closest('.hero-slide'); if (s) s.focus({ preventScroll: true }); }
    document.documentElement.classList.add('couch');
    blip(660);
  }
  function choose() {
    const el = document.activeElement; if (!el || el === document.body) return move(0, 1);
    blip(880, 0.06, 0.035);
    if (el.matches('select')) { try { el.showPicker(); } catch (e) { el.focus(); } return; }
    if (el.matches('input:not([type=range]):not([type=checkbox])')) { el.focus(); return; }
    el.click();
  }
  function back() {
    const s = scope(); if (s === document) return false;
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    blip(330); return true;
  }
  function favorite() { const el = document.activeElement, b = el && el.matches('a.cab,a.tile') && el.querySelector('.fav'); if (b) { b.click(); blip(1320, 0.05); } }
  function view(d) { const v = opts.views.filter(b => b && !b.hidden); if (!v.length) return; const i = v.findIndex(b => b.getAttribute('aria-pressed') === 'true'); const n = v[(i + d + v.length) % v.length]; n.click(); n.focus(); blip(520); }

  /* ---------- keys ---------- */
  addEventListener('keydown', e => {
    if (!opts.active() || e.defaultPrevented) return;
    const t = e.target, typing = t.closest && t.closest('input:not([type=range]),textarea');
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (dir) {
      if (typing && dir[0]) return; // left and right edit the text
      if (t.matches && t.matches('input[type=range]') && dir[0]) return; // and nudge sliders
      e.preventDefault(); if (dir[0] && t.closest && t.closest('.hero-slide') && window.Couch.hero) return window.Couch.hero(dir[0]); move(...dir); return;
    }
    if (e.key === 'Escape' && !typing) { document.documentElement.classList.add('couch'); return; }
    if ((e.key === 'f' || e.key === 'F') && !typing && document.activeElement && document.activeElement.matches('a.cab,a.tile')) { e.preventDefault(); favorite(); }
  });
  addEventListener('pointerdown', () => document.documentElement.classList.remove('couch'), { passive: true });

  /* ---------- controllers: buttons on press, the d-pad and stick with repeat when held ---------- */
  let was = [], held = null, heldT = 0;
  function poll(now) {
    requestAnimationFrame(poll);
    let pads = []; try { pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean); } catch (e) {}
    if (!pads.length) { was = []; return; }
    const on = []; let sx = 0, sy = 0;
    for (const gp of pads) { (gp.buttons || []).forEach((b, i) => { if (b && b.pressed) on[i] = true; }); const ax = gp.axes || []; sx += ax[0] || 0; sy += ax[1] || 0; }
    const tap = i => on[i] && !was[i]; was = on;
    if (!opts.active()) { held = null; return; }
    const dir = on[14] || sx < -0.55 ? 'l' : on[15] || sx > 0.55 ? 'r' : on[12] || sy < -0.55 ? 'u' : on[13] || sy > 0.55 ? 'd' : null;
    const go = () => move(...{ l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] }[dir]);
    if (!dir) held = null;
    else if (dir !== held) { held = dir; heldT = now + 380; go(); } // a press moves once; holding repeats after a beat
    else if (now >= heldT) { heldT = now + 130; go(); }
    if (tap(0)) choose();
    if (tap(1)) back();
    if (tap(3)) favorite();
    if (tap(4)) view(-1); if (tap(5)) view(1);
    if (tap(9) && opts.onSettings && scope() === document) { opts.onSettings(); blip(520); }
    if (on.length) dispatchEvent(new Event('pointermove')); // a controller in use keeps attract mode away
  }
  addEventListener('gamepadconnected', () => document.documentElement.classList.add('couch'));
  requestAnimationFrame(poll);
  return { init: o => { opts = Object.assign(opts, o); }, move, choose, back };
})();
