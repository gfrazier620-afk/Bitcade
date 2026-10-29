/*
 * Your character (window.Avatar): the arcade-goer you are on the walkable floor, built from the same parts as the
 * floor's people (shared/floor.js drawWalker), and drawn standing on its own here for the profile setup, the profile
 * card, messages and the admin console. Loaded by the lobby, by shared/setup.js and by admin.html.
 *
 * Kept as a short string in arcade:avatar (and in profiles/{uid}.av for other players to see): one number per part,
 * 'skin-style-hair-shirt-pants-extra', each an index into the lists below. Prize-counter outfits are worn over it on
 * the floor (keeping your skin).
 */
window.Avatar = (() => {
  const OUT = '#0a0612';
  const PARTS = [
    ['SKIN', ['#f0c090', '#e0a878', '#c08050', '#8a5634', '#ffd8b4', '#6a3e22']],
    ['HAIR', ['short', 'cap', 'bun', 'mohawk', 'beanie', 'headband', 'headphones', 'long']],
    ['HAIR COLOUR', ['#3a2414', '#1a1418', '#7a4a24', '#d8a050', '#f4effd', '#ff4fa3', '#3de0ff', '#8a5cff', '#3dff8f', '#ff7a3d']],
    ['SHIRT', ['#3d8bff', '#ff4f6d', '#3dff8f', '#ffd23d', '#b45cff', '#ff9a3d', '#22e0ff', '#f4effd', '#2a2a3a', '#ff5ac8']],
    ['PANTS', ['#2a2a4a', '#3a5ab8', '#1a1a24', '#6a4a2a', '#4a6a3a', '#8a8aa8']],
    ['EXTRA', ['none', 'glasses', 'shades', 'visor', 'mask']]
  ];
  const HAT = { short: '', cap: 'cap', bun: 'bun', mohawk: 'mohawk', beanie: 'beanie', headband: 'band', headphones: 'phones', long: 'long' };
  const get = () => { try { return localStorage.getItem('arcade:avatar') || ''; } catch (e) { return ''; } };

  /** A string → one index per part (bad or missing parts become 0). */
  function parse(s) {
    const v = String(s || '').split('-').map(n => parseInt(n, 10));
    return PARTS.map((p, i) => (v[i] >= 0 && v[i] < p[1].length ? v[i] : 0));
  }
  const str = v => v.join('-');
  const valid = s => /^\d{1,2}(-\d{1,2}){5}$/.test(s || '');
  function random() { return str(PARTS.map(p => Math.floor(Math.random() * p[1].length))); }

  /** The look drawWalker takes: { skin, hair, hat, capC, top, legs, glasses, shades, visor, mask, long }. */
  function look(s = get()) {
    const v = parse(s), style = PARTS[1][1][v[1]], extra = PARTS[5][1][v[5]];
    return { skin: PARTS[0][1][v[0]], hat: HAT[style] || '', long: style === 'long', hair: PARTS[2][1][v[2]], top: PARTS[3][1][v[3]], legs: PARTS[4][1][v[4]],
      capC: PARTS[3][1][(v[3] + 3) % PARTS[3][1].length], glasses: extra === 'glasses', shades: extra === 'shades', visor: extra === 'visor', mask: extra === 'mask' };
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = c => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function paint(x, list) {
    x.fillStyle = OUT; for (const q of list) x.fillRect(q[0] - 2, q[1] - 2, q[2] + 4, q[3] + 4);
    for (const [px, py, w, h, c, flat] of list) {
      x.fillStyle = c; x.fillRect(px, py, w, h);
      if (flat || w < 5 || h < 5 || c[0] !== '#') continue;
      const e = Math.max(1, Math.round(Math.min(w, h) * 0.22));
      x.fillStyle = shade(c, 0.3); x.fillRect(px, py, w, e); x.fillStyle = shade(c, -0.28); x.fillRect(px, py + h - e, w, e);
    }
  }
  /** The character facing you, feet at (0, 0), about 50 units tall. pose: '' or 'wave'. */
  function body(x, o, pose = '', t = 0) {
    const legs = [[-6, -12, 5, 12, o.legs], [1, -12, 5, 12, o.legs]];
    const wave = pose === 'wave', armR = wave ? [8, -41 + Math.round(Math.sin(t * 8)), 4, 13] : [7, -25, 4, 11];
    const parts = [...legs, [-11, -25, 4, 11, o.top], [...armR, o.top], [-8, -26, 16, 15, o.top], [-6, -38, 12, 12, o.skin]];
    if (o.long) parts.push([-8, -38, 3, 13, o.hair, true], [5, -38, 3, 13, o.hair, true]);
    parts.push([-7, -40, 14, 5, o.hair, true]);
    if (wave) parts.push([8, -44 + Math.round(Math.sin(t * 8)), 4, 4, o.skin]);
    paint(x, parts);
    x.fillStyle = OUT; x.fillRect(-4, -33, 2, 3); x.fillRect(2, -33, 2, 3);
    x.fillStyle = '#c0604a'; x.fillRect(-1, -29, 3, 1);
    if (o.glasses) { x.strokeStyle = '#111'; x.lineWidth = 1; x.strokeRect(-5.5, -34.5, 4, 4); x.strokeRect(1.5, -34.5, 4, 4); }
    if (o.shades) { x.fillStyle = '#111'; x.fillRect(-5, -34, 10, 3); }
    if (o.visor) { x.fillStyle = OUT; x.fillRect(-5, -35, 10, 4); x.fillStyle = '#22e0ff'; x.fillRect(-4, -34, 8, 2); }
    if (o.mask) { x.fillStyle = '#1a1a24'; x.fillRect(-6, -31, 12, 5); }
    if (o.hat === 'cap') paint(x, [[-7, -44, 14, 6, o.capC], [-6, -39, 12, 2, shade(o.capC, -0.15), true]]);
    if (o.hat === 'mohawk') { paint(x, [[-2, -48, 4, 9, o.hair]]); x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(-1, -47, 1, 6); }
    if (o.hat === 'band') { x.fillStyle = '#ff2a3a'; x.fillRect(-7, -38, 14, 3); x.fillRect(6, -38, 4, 2); x.fillRect(8, -36, 3, 2); }
    if (o.hat === 'bun') paint(x, [[-3, -46, 7, 6, o.hair]]);
    if (o.hat === 'phones') { x.fillStyle = OUT; x.fillRect(-8, -43, 16, 2); paint(x, [[-9, -36, 3, 6, '#ff4f6d'], [6, -36, 3, 6, '#ff4f6d']]); }
    if (o.hat === 'beanie') { paint(x, [[-7, -45, 14, 7, o.capC]]); x.fillStyle = '#fff'; x.fillRect(-2, -48, 4, 3); }
  }
  /**
   * Draw it into a canvas (sized for its CSS box and the screen's pixel ratio). full: the whole character on a floor
   * spot; otherwise a head-and-shoulders portrait for small spots (lists, messages).
   */
  function draw(cv, s = get(), { full = false, pose = '', t = 0, bg = null } = {}) {
    const r = Math.min(3, window.devicePixelRatio || 1), w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    if (cv.width !== Math.round(w * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
    const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, cv.width, cv.height); }
    x.imageSmoothingEnabled = false;
    const o = look(s);
    if (full) {
      const k = cv.height / 64;
      x.setTransform(k, 0, 0, k, cv.width / 2, cv.height - 6 * k);
      x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.ellipse(0, 0, 13, 4, 0, 0, 6.29); x.fill();
      body(x, o, pose, t);
    } else {
      const k = cv.height / 32; // from just above the hair to the chest
      x.setTransform(k, 0, 0, k, cv.width / 2, cv.height + 15 * k);
      body(x, o, '', t);
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** A small portrait <canvas> to drop into a list (size in CSS pixels). */
  function el(s, size = 28, cls = 'av') {
    const c = document.createElement('canvas'); c.className = cls; c.style.width = c.style.height = size + 'px'; c.width = c.height = size;
    c.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(() => draw(c, s));
    return c;
  }
  /** Fill every <canvas data-av="..."> inside root with that portrait (for markup built as strings). */
  function fill(root = document) { root.querySelectorAll('canvas[data-av]').forEach(c => draw(c, c.dataset.av, { full: c.hasAttribute('data-full') })); }

  return { PARTS, parse, str, valid, random, look, draw, el, fill, get };
})();
