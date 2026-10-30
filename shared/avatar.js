/*
 * Your character (window.Avatar): drawn standing on its own for the profile setup, the profile card, messages and the
 * admin console (a rounded, shaded portrait), and as the little arcade-goer you are on the walkable floor
 * (shared/floor.js drawWalker, from look()). Loaded by the lobby, by shared/setup.js and by admin.html.
 *
 * Kept as a short string in arcade:avatar (and in profiles/{uid}.av for other players to see): six numbers,
 * 'skin-style-hair-shirt-pants-extra', each an index into the lists below. The body (male or female) rides in the
 * skin number (female adds 10), so the string keeps the shape the Firestore rules expect and older characters still
 * read as they were. PARTS lists seven parts for the setup screen: BODY first, then the six. Prize-counter outfits
 * are worn over it on the floor (keeping your skin).
 */
window.Avatar = (() => {
  const OUT = '#0a0612';
  const PARTS = [
    ['BODY', ['male', 'female']],
    ['SKIN', ['#f0c090', '#e0a878', '#c08050', '#8a5634', '#ffd8b4', '#6a3e22']],
    ['HAIR', ['short', 'cap', 'bun', 'mohawk', 'beanie', 'headband', 'headphones', 'long']],
    ['HAIR COLOUR', ['#3a2414', '#1a1418', '#7a4a24', '#d8a050', '#f4effd', '#ff4fa3', '#3de0ff', '#8a5cff', '#3dff8f', '#ff7a3d']],
    ['SHIRT', ['#3d8bff', '#ff4f6d', '#3dff8f', '#ffd23d', '#b45cff', '#ff9a3d', '#22e0ff', '#f4effd', '#2a2a3a', '#ff5ac8']],
    ['PANTS', ['#2a2a4a', '#3a5ab8', '#1a1a24', '#6a4a2a', '#4a6a3a', '#8a8aa8']],
    ['EXTRA', ['none', 'glasses', 'shades', 'visor', 'mask']]
  ];
  const HAT = { short: '', cap: 'cap', bun: 'bun', mohawk: 'mohawk', beanie: 'beanie', headband: 'band', headphones: 'phones', long: 'long' };
  const get = () => { try { return localStorage.getItem('arcade:avatar') || ''; } catch (e) { return ''; } };

  /** A string → one index per part, BODY first (bad or missing parts become 0). */
  function parse(s) {
    const n = String(s || '').split('-').map(x => parseInt(x, 10)), sk = n[0] >= 0 ? n[0] : 0;
    const v = [Math.floor(sk / 10), sk % 10, ...n.slice(1)];
    return PARTS.map((p, i) => (v[i] >= 0 && v[i] < p[1].length ? v[i] : 0));
  }
  const str = v => [v[0] * 10 + v[1], ...v.slice(2)].join('-');
  const valid = s => /^\d{1,2}(-\d{1,2}){5}$/.test(s || '');
  function random() { return str(PARTS.map(p => Math.floor(Math.random() * p[1].length))); }
  const pick = (v, i) => PARTS[i][1][v[i]];

  /** The look drawWalker takes: { skin, hair, hat, capC, top, legs, glasses, shades, visor, mask, long, fem }. */
  function look(s = get()) {
    const v = parse(s), style = pick(v, 2), extra = pick(v, 6);
    return { fem: v[0] === 1, skin: pick(v, 1), hat: HAT[style] || '', long: style === 'long', hair: pick(v, 3), top: pick(v, 4), legs: pick(v, 5),
      capC: PARTS[4][1][(v[4] + 3) % PARTS[4][1].length], glasses: extra === 'glasses', shades: extra === 'shades', visor: extra === 'visor', mask: extra === 'mask' };
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = c => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  /*
   * One shape in the house style: a dark outline, the fill, then light from above (a soft highlight at the top and
   * shade at the bottom, clipped to the shape). path(x) traces it; top and bottom are its y range for the light.
   */
  function shape(x, path, c, top, bottom, line = 2.4) {
    x.beginPath(); path(x); x.lineJoin = 'round'; x.strokeStyle = OUT; x.lineWidth = line; x.stroke();
    x.fillStyle = c; x.fill();
    x.save(); x.clip(); const g = x.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(0.35, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
    x.fillStyle = g; x.fillRect(-40, top, 80, bottom - top); x.restore();
  }
  const rr = (x, l, t, w, h, r) => { x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); };

  /** The character facing you, feet at (0, 0), about 64 units tall. pose: '' or 'wave'. */
  function body(x, o, pose = '', t = 0) {
    const fem = o.fem, bob = Math.sin(t * 2.2) * 0.6, HY = -45 + bob; // the head's centre
    const wave = pose === 'wave', sw = fem ? 10.5 : 12.5; // half the shoulders
    // shoes and legs
    for (const k of [-1, 1]) { shape(x, p => rr(p, k * 4.6 - 4, -3.5, 8, 4, 2), '#1e1a26', -4, 0, 2); shape(x, p => rr(p, k * 4 - 3.6, -17, 7.2, 14.5, 2.4), o.legs, -17, -2); }
    // the back of long hair, behind the head and shoulders
    if (o.long) shape(x, p => { p.moveTo(-12, HY - 4); p.quadraticCurveTo(-15, HY + 14, -12, HY + 22); p.lineTo(12, HY + 22); p.quadraticCurveTo(15, HY + 14, 12, HY - 4); p.closePath(); }, o.hair, HY - 4, HY + 22);
    // arms (the right one waves)
    const armY = -33 + bob * 0.5, wy = Math.sin(t * 9) * 3;
    shape(x, p => rr(p, -sw - 4.6, armY, 6, 16, 3), o.top, armY, armY + 16);
    shape(x, p => { p.arc(-sw - 1.6, armY + 17, 3.2, 0, 6.29); }, o.skin, armY + 14, armY + 20, 2);
    if (wave) { shape(x, p => { p.save(); p.translate(sw + 1.6, armY + 2); p.rotate(-2.5 + wy * 0.05); rr(p, -3, 0, 6, 15, 3); p.restore(); }, o.top, armY - 14, armY + 4); shape(x, p => { p.arc(sw + 8.5, armY - 13 + wy, 3.3, 0, 6.29); }, o.skin, armY - 17, armY - 9, 2); }
    else { shape(x, p => rr(p, sw - 1.4, armY, 6, 16, 3), o.top, armY, armY + 16); shape(x, p => { p.arc(sw + 1.6, armY + 17, 3.2, 0, 6.29); }, o.skin, armY + 14, armY + 20, 2); }
    // the shirt: broad shoulders, or a narrower waist
    shape(x, p => { p.moveTo(-sw, armY + 1); p.quadraticCurveTo(-sw, armY - 2, -sw + 4, armY - 2); p.lineTo(sw - 4, armY - 2); p.quadraticCurveTo(sw, armY - 2, sw, armY + 1);
      if (fem) { p.quadraticCurveTo(sw - 3, armY + 9, sw - 1, -15); p.lineTo(-sw + 1, -15); p.quadraticCurveTo(-sw + 3, armY + 9, -sw, armY + 1); } else { p.lineTo(sw - 1, -15); p.lineTo(-sw + 1, -15); } p.closePath(); }, o.top, armY - 2, -15);
    x.fillStyle = shade(o.top, -0.25); x.beginPath(); x.moveTo(-3.5, armY - 2); x.lineTo(0, armY + 3.5); x.lineTo(3.5, armY - 2); x.fill(); // the collar
    x.fillStyle = shade(o.legs, -0.2); x.fillRect(-sw + 1.5, -16.5, sw * 2 - 3, 2); // a belt
    // neck, ears, head
    x.fillStyle = shade(o.skin, -0.18); x.fillRect(-3, HY + 8, 6, 5);
    for (const k of [-1, 1]) shape(x, p => p.ellipse(k * 11, HY + 1, 2.6, 3.4, 0, 0, 6.29), o.skin, HY - 3, HY + 5, 2);
    shape(x, p => { if (fem) p.ellipse(0, HY, 10.6, 11.6, 0, 0, 6.29); else rr(p, -10.8, HY - 11.6, 21.6, 22.4, 8.5); }, o.skin, HY - 12, HY + 12);
    // the face
    const ex = fem ? 4.4 : 4.6, ey = HY + 1;
    for (const k of [-1, 1]) {
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(k * ex, ey, fem ? 2.7 : 2.4, fem ? 3.1 : 2.7, 0, 0, 6.29); x.fill();
      x.fillStyle = '#2a1a22'; x.beginPath(); x.arc(k * ex + 0.3, ey + 0.4, fem ? 1.8 : 1.6, 0, 6.29); x.fill();
      x.fillStyle = '#fff'; x.fillRect(k * ex + 0.6, ey - 0.8, 0.9, 0.9);
      x.strokeStyle = shade(o.hair === '#f4effd' ? '#8a7a6a' : o.hair, -0.2); x.lineWidth = fem ? 0.9 : 1.5; x.beginPath(); // brows: arched, or straight
      if (fem) { x.moveTo(k * ex - 2.4, ey - 4); x.quadraticCurveTo(k * ex, ey - 5.6, k * ex + 2.4, ey - 4.3); } else { x.moveTo(k * ex - 2.4, ey - 4.2); x.lineTo(k * ex + 2.4, ey - 4.4); } x.stroke();
      if (fem) { x.strokeStyle = '#2a1a22'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(k * (ex + 2.4), ey - 1.6); x.lineTo(k * (ex + 3.6), ey - 2.8); x.moveTo(k * (ex + 1.6), ey - 2.6); x.lineTo(k * (ex + 2.4), ey - 3.9); x.stroke(); } // lashes
      x.fillStyle = fem ? 'rgba(255,110,140,.3)' : 'rgba(200,90,70,.14)'; x.beginPath(); x.ellipse(k * 6.8, ey + 4.2, 2.2, 1.3, 0, 0, 6.29); x.fill(); // cheeks
    }
    x.fillStyle = shade(o.skin, -0.22); x.fillRect(-0.6, ey + 2.2, 1.4, 2); // the nose
    x.strokeStyle = fem ? '#c8405a' : '#8a3a2a'; x.lineWidth = fem ? 1.4 : 1.1; x.beginPath(); x.arc(0, ey + 4.6, 2.6, 0.25, Math.PI - 0.25); x.stroke(); // a smile
    // hair and hats
    const hair = o.hair, hx = HY - 11.6;
    const fringe = (len = 6) => shape(x, p => { p.moveTo(-11.4, HY + 1); p.quadraticCurveTo(-12.6, hx - 3, 0, hx - 3.4); p.quadraticCurveTo(12.6, hx - 3, 11.4, HY + 1); p.quadraticCurveTo(9, hx + len - 2, 4, hx + len); p.quadraticCurveTo(0, hx + len - 3, -4, hx + len - 1); p.quadraticCurveTo(-9, hx + len - 1, -11.4, HY + 1); p.closePath(); }, hair, hx - 3, hx + len);
    // the hair itself (a mohawk, a bob for women's short styles, or a fringe), then any hat on top
    if (o.hat === 'mohawk') { x.fillStyle = shade(o.skin, -0.12); x.beginPath(); x.ellipse(0, hx + 3, 10, 4, 0, Math.PI, 0); x.fill(); shape(x, p => { p.moveTo(-3.2, hx + 3); for (let k = 0; k < 5; k++) { p.lineTo(-3.2 + k * 1.6 + 0.8, hx - 9 + (k % 2) * 4); } p.lineTo(3.2, hx + 3); p.closePath(); }, hair, hx - 9, hx + 3); }
    else if (fem && !o.long && o.hat !== 'bun') shape(x, p => { p.moveTo(-12.4, HY + 8); p.quadraticCurveTo(-14, hx - 2, 0, hx - 3.6); p.quadraticCurveTo(14, hx - 2, 12.4, HY + 8); p.lineTo(9.6, HY + 8); p.quadraticCurveTo(10, HY - 4, 4, hx + 5); p.quadraticCurveTo(-2, hx + 7.5, -9.6, HY - 2); p.lineTo(-9.6, HY + 8); p.closePath(); }, hair, hx - 4, HY + 8);
    else fringe(o.long ? 7 : 5);
    if (o.hat === 'cap') { shape(x, p => { p.moveTo(-11.6, HY - 2); p.quadraticCurveTo(-11.6, hx - 3.6, 0, hx - 3.6); p.quadraticCurveTo(11.6, hx - 3.6, 11.6, HY - 2); p.closePath(); }, o.capC, hx - 4, HY - 2); shape(x, p => p.ellipse(0, HY - 2.4, 13.4, 2.6, 0, 0, 6.29), shade(o.capC, -0.15), HY - 5, HY, 2); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, hx + 2, 1.8, 0, 6.29); x.fill(); }
    else if (o.hat === 'beanie') { shape(x, p => { p.moveTo(-11.6, HY - 1); p.quadraticCurveTo(-11.6, hx - 5, 0, hx - 5); p.quadraticCurveTo(11.6, hx - 5, 11.6, HY - 1); p.closePath(); }, o.capC, hx - 5, HY); shape(x, p => rr(p, -12, HY - 4.4, 24, 5, 2), shade(o.capC, -0.12), HY - 5, HY + 1, 2); shape(x, p => p.arc(0, hx - 6.5, 3, 0, 6.29), '#fff', hx - 10, hx - 3, 2); }

    if (o.hat === 'bun') shape(x, p => p.arc(0, hx - 6, 5, 0, 6.29), hair, hx - 11, hx - 1);
    if (o.hat === 'band') { shape(x, p => rr(p, -11.8, hx + 3, 23.6, 3.4, 1.4), '#ff2a3a', hx + 3, hx + 6.4, 1.8); x.fillStyle = '#ff2a3a'; x.fillRect(10, hx + 4, 5, 2); x.fillRect(12, hx + 6, 3, 3); }
    if (o.hat === 'phones') { x.strokeStyle = OUT; x.lineWidth = 3.4; x.beginPath(); x.arc(0, HY - 1, 13, Math.PI * 1.08, Math.PI * 1.92); x.stroke(); x.strokeStyle = '#5a5a6a'; x.lineWidth = 1.6; x.stroke(); for (const k of [-1, 1]) shape(x, p => rr(p, k * 12.6 - 3, HY - 4, 6, 9, 2.4), '#ff4f6d', HY - 4, HY + 5, 2); }
    // extras
    if (o.glasses) { x.strokeStyle = '#1a1418'; x.lineWidth = 1.1; for (const k of [-1, 1]) { x.beginPath(); x.arc(k * ex, ey, 3.6, 0, 6.29); x.stroke(); } x.beginPath(); x.moveTo(-ex + 3.6, ey); x.lineTo(ex - 3.6, ey); x.stroke(); }
    if (o.shades) { for (const k of [-1, 1]) shape(x, p => rr(p, k * ex - 4, ey - 2.6, 8, 5, 2), '#16141c', ey - 3, ey + 3, 1.6); x.fillStyle = OUT; x.fillRect(-1, ey - 1.6, 2, 1.2); x.fillStyle = 'rgba(255,255,255,.45)'; x.fillRect(-ex - 2.4, ey - 1.6, 2, 1); x.fillRect(ex - 2.4, ey - 1.6, 2, 1); }
    if (o.visor) { shape(x, p => rr(p, -10.4, ey - 3.2, 20.8, 5.6, 2.6), '#22e0ff', ey - 3, ey + 3, 1.8); x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(-7, ey - 2, 5, 1.2); }
    if (o.mask) shape(x, p => { p.moveTo(-10.6, ey + 2); p.lineTo(10.6, ey + 2); p.quadraticCurveTo(10.4, HY + 11, 0, HY + 11.6); p.quadraticCurveTo(-10.4, HY + 11, -10.6, ey + 2); p.closePath(); }, '#2a2a3a', ey + 2, HY + 12, 1.8);
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
    x.imageSmoothingEnabled = true;
    const o = look(s);
    if (full) {
      const k = cv.height / 74;
      x.setTransform(k, 0, 0, k, cv.width / 2, cv.height - 5 * k);
      x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(0, 0, 15, 3.6, 0, 0, 6.29); x.fill();
      body(x, o, pose, t);
    } else {
      const k = cv.height / 44; // from just above a bun to the chest
      x.setTransform(k, 0, 0, k, cv.width / 2, cv.height + 23 * k);
      body(x, o, '', 0);
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
