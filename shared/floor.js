/*
 * The arcade floor: an optional lobby view where you walk an arcade-goer between the cabinets. Lobby only.
 *
 * Walk with the arrows / WASD / a controller, or tap where to go. Stand at a cabinet and press Enter (A, or the card's
 * PLAY button) to play it; stand at the prize counter to open it. The outfit, carpet and decorations come from the
 * prize counter (shared/prizes.js). Sprites use the house style: dark outline pass, then fills lit from above.
 *
 * Floor.init({ canvas, card, games, featured, info, onPlay, onCounter }) once, then Floor.start() / Floor.stop()
 * as the view is shown or hidden. Floor.preview(prize, ctx, w, h) draws prize-counter previews.
 */
window.Floor = (() => {
  const W = 960, H = 600, OUT = '#0a0612', WALL = 150, SPEED = 170;
  const CW = 56, CH = 92; // a cabinet's footprint
  let PAL = {}; // the lobby's icon palette, passed to init
  let cv = null, ctx = null, opt = null, cabs = [], solids = [], running = false, raf = 0, last = 0, bg = null, bgKey = '';
  let mastered = new Set(), near = null, shownNear = undefined, route = [], arriveAct = null, idlePing = 0, padWas = false;
  const me = { x: 480, y: 540, dir: 'up', walk: 0, moving: false };
  const keys = new Set();

  /** Lighten (k > 0) or darken (k < 0) a #rrggbb colour. */
  function shade(hex, k) {
    let h = hex.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join('');
    const n = parseInt(h, 16), f = c => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  /** Boxes [x, y, w, h, colour, flat]: one dark outline pass, then fills lit from above (flat ones skip the shading). */
  function paint(x, list) {
    x.fillStyle = OUT; for (const q of list) x.fillRect(q[0] - 2, q[1] - 2, q[2] + 4, q[3] + 4);
    for (const [px, py, w, h, c, flat] of list) {
      x.fillStyle = c; x.fillRect(px, py, w, h);
      if (flat || w < 5 || h < 5) continue;
      const e = Math.max(1, Math.round(Math.min(w, h) * 0.22));
      x.fillStyle = shade(c, 0.3); x.fillRect(px, py, w, e);
      x.fillStyle = shade(c, -0.32); x.fillRect(px, py + h - e, w, e);
    }
  }
  const equip = () => (window.Prizes ? Prizes.equipped() : {});
  const owns = id => !!(window.Prizes && Prizes.has(id));

  /* ---------- layout: two rows of cabinets (the front row split by a centre aisle), the prize counter, decor ---------- */
  const COUNTER = { x: 742, y: 470, w: 178, h: 70 };
  const DECOR = { redeem: { x: 684, y: 470, w: 48, h: 74 }, gumball: { x: 236, y: 500, w: 30, h: 56 }, sofa: { x: 566, y: 518, w: 100, h: 42 }, trophies: { x: 290, y: 478, w: 64, h: 80 },
    jukebox: { x: 40, y: 486, w: 60, h: 74 }, claw: { x: 132, y: 474, w: 68, h: 86 }, plantL: { x: 22, y: 160, w: 26, h: 44 }, plantR: { x: 912, y: 160, w: 26, h: 44 } };
  const ROW1 = 62, ROW2 = 272, GAP = 70;
  const gaps = []; // x positions where you can cross the front row
  function layout(games) {
    const n1 = Math.ceil(games.length / 2), n2 = games.length - n1, left2 = Math.ceil(n2 / 2);
    const w1 = n1 * CW + (n1 - 1) * 16, x1 = (W - w1) / 2;
    const w2 = n2 * CW + (n2 - 2) * 16 + GAP, x2 = (W - w2) / 2;
    cabs = games.map((g, i) => {
      if (i < n1) return { g, x: x1 + i * (CW + 16), y: ROW1 };
      const j = i - n1, x = x2 + j * (CW + 16) + (j >= left2 ? GAP - 16 : 0);
      return { g, x, y: ROW2 };
    });
    const rowEnd = cabs[cabs.length - 1];
    gaps.length = 0; gaps.push(Math.max(30, x2 / 2), x2 + left2 * (CW + 16) - 16 + GAP / 2, Math.min(W - 30, (rowEnd.x + CW + W) / 2));
  }
  const base = c => c.y + CH;
  function buildSolids() {
    solids = cabs.map(c => ({ x: c.x, y: c.y + 54, w: CW, h: CH - 54 }));
    solids.push({ x: COUNTER.x, y: COUNTER.y + 20, w: COUNTER.w, h: COUNTER.h - 20 });
    if (owns('jukebox')) solids.push({ ...DECOR.jukebox, y: DECOR.jukebox.y + 40, h: DECOR.jukebox.h - 40 });
    if (owns('claw')) solids.push({ ...DECOR.claw, y: DECOR.claw.y + 50, h: DECOR.claw.h - 50 });
    for (const k of ['redeem', 'gumball', 'sofa', 'trophies']) if (owns(k)) { const d = DECOR[k]; solids.push({ x: d.x, y: d.y + d.h * 0.55, w: d.w, h: d.h * 0.45 }); }
  }
  const hit = (x, y) => x < 14 || x > W - 14 || y < WALL + 8 || y > H - 4 || solids.some(s => x + 9 > s.x && x - 9 < s.x + s.w && y > s.y && y - 6 < s.y + s.h);

  /* ---------- background: wall, signs and carpet (redrawn when the carpet or decor changes) ---------- */
  function carpet(x, kind, w, h, y0 = 0) {
    if (kind === 'grid') {
      x.fillStyle = '#04060e'; x.fillRect(0, y0, w, h);
      x.strokeStyle = 'rgba(34,224,255,.55)'; x.lineWidth = 1.5; x.shadowColor = '#22e0ff'; x.shadowBlur = 6;
      for (let i = 0; i <= w; i += 32) { x.beginPath(); x.moveTo(i + 0.5, y0); x.lineTo(i + 0.5, y0 + h); x.stroke(); }
      for (let j = 0; j <= h; j += 32) { x.beginPath(); x.moveTo(0, y0 + j + 0.5); x.lineTo(w, y0 + j + 0.5); x.stroke(); }
      x.shadowBlur = 0; return;
    }
    if (kind === 'lava') {
      x.fillStyle = '#2a0808'; x.fillRect(0, y0, w, h);
      let s2 = 5; const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 26; i++) { const px = r2() * w, py = y0 + r2() * h, rr = 14 + r2() * 26, g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, '#ffb03d'); g.addColorStop(0.45, '#ff4a1a'); g.addColorStop(1, 'rgba(120,10,10,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(px, py, rr * 1.6, rr * 0.7, r2() * 3, 0, 6.29); x.fill(); }
      return;
    }
    if (kind === 'checker') {
      for (let j = 0; j < h; j += 24) for (let i = 0; i < w; i += 24) { x.fillStyle = ((i + j) / 24) % 2 ? '#e8e4f0' : '#141020'; x.fillRect(i, y0 + j, 24, 24); }
      return;
    }
    x.fillStyle = kind === 'cosmic' ? '#0c0a2a' : '#140c24'; x.fillRect(0, y0, w, h);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    if (kind === 'cosmic') {
      for (let i = 0; i < 70; i++) { x.fillStyle = ['#ffd23d', '#ff4fd1', '#22e0ff', '#fff'][i % 4]; x.fillRect(Math.round(r() * w), Math.round(y0 + r() * h), 2, 2); }
      for (let i = 0; i < 14; i++) {
        const px = r() * w, py = y0 + r() * h, rad = 6 + r() * 8, c = ['#ff7a3d', '#3dd6ff', '#b86bff', '#3dff8f'][i % 4];
        x.fillStyle = c; x.beginPath(); x.arc(px, py, rad, 0, 6.29); x.fill();
        x.strokeStyle = '#ffd23d'; x.lineWidth = 2; x.beginPath(); x.ellipse(px, py, rad * 1.9, rad * 0.5, -0.4, 0, 6.29); x.stroke();
      }
      return;
    }
    // the default: dark carpet with neon squiggles and triangles
    for (let i = 0; i < 60; i++) {
      const px = r() * w, py = y0 + r() * h, c = ['#ff4fa3', '#22e0ff', '#ffd23d', '#7a5cff'][i % 4];
      x.strokeStyle = c; x.globalAlpha = 0.55; x.lineWidth = 2; x.beginPath();
      if (i % 3) { x.moveTo(px, py); for (let k = 1; k <= 4; k++) x.lineTo(px + k * 6, py + (k % 2 ? -5 : 5)); }
      else { x.moveTo(px, py); x.lineTo(px + 10, py); x.lineTo(px + 5, py - 8); x.closePath(); }
      x.stroke();
    }
    x.globalAlpha = 1;
  }
  function neon(x, text, cx, cy, size, c) {
    x.font = `${size}px Bungee, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = c; x.shadowBlur = 18; x.fillStyle = c; x.fillText(text, cx, cy); x.shadowBlur = 6; x.fillStyle = '#fff'; x.globalAlpha = 0.7; x.fillText(text, cx, cy);
    x.globalAlpha = 1; x.shadowBlur = 0;
  }
  function background() {
    const eq = equip(), key = (eq.carpet || '') + (owns('sign') ? 's' : '');
    if (bg && key === bgKey) return bg;
    bgKey = key; bg = document.createElement('canvas'); bg.width = W; bg.height = H; const x = bg.getContext('2d');
    carpet(x, eq.carpet, W, H - WALL, WALL);
    // back wall: dark panels with a chair rail
    const g = x.createLinearGradient(0, 0, 0, WALL); g.addColorStop(0, '#120e26'); g.addColorStop(1, '#221a44'); x.fillStyle = g; x.fillRect(0, 0, W, WALL);
    x.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < W; i += 48) x.fillRect(i, 0, 2, WALL);
    x.fillStyle = OUT; x.fillRect(0, WALL - 4, W, 6); x.fillStyle = '#ff4fa3'; x.fillRect(0, WALL - 3, W, 2);
    neon(x, 'BITCADE', W / 2, 30, 30, '#ff4fa3');
    if (owns('sign')) { neon(x, 'GAME ON', 150, 30, 20, '#22e0ff'); neon(x, 'HI-SCORE', W - 150, 30, 20, '#ffd23d'); }
    // side walls
    x.fillStyle = '#0c0920'; x.fillRect(0, WALL, 10, H - WALL); x.fillRect(W - 10, WALL, 10, H - WALL);
    // door mat by the entrance
    x.fillStyle = OUT; x.fillRect(436, H - 18, 88, 18); x.fillStyle = '#3a2a5a'; x.fillRect(438, H - 16, 84, 16);
    x.font = '9px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#9a8ac0'; x.fillText('WELCOME', 480, H - 6);
    return bg;
  }

  /* ---------- sprites ---------- */
  const icon = (x, px, ox, oy, k) => px.forEach((row, j) => [...row].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(ox + i * k, oy + j * k, k, k); } }));
  function drawCab(x, c, t) {
    const { g } = c, X = Math.round(c.x), Y = Math.round(c.y), gold = mastered.has(g.slug), col = gold ? '#ffd23d' : g.c, isNear = near === c, feat = opt.featured === g.slug;
    x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.ellipse(X + CW / 2, Y + CH, CW * 0.62, 7, 0, 0, 6.29); x.fill();
    if (isNear) { x.shadowColor = col; x.shadowBlur = 22; }
    paint(x, [[X, Y + 14, CW, CH - 14, '#211b42'], [X - 2, Y, CW + 4, 16, shade(col, -0.35)], [X + 4, Y + 58, CW - 8, 10, '#322a5e'], [X + 6, Y + 70, CW - 12, 20, '#17122e', true]]);
    x.shadowBlur = 0;
    // lit marquee, side-art stripes, screen with the cabinet's icon, controls, coin door
    x.fillStyle = col; x.globalAlpha = 0.85 + Math.sin(t / 300 + c.x) * 0.1; x.fillRect(X + 1, Y + 3, CW - 2, 10); x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(X + 6, Y + 6, CW - 12, 2);
    x.fillStyle = col; x.fillRect(X, Y + 16, 3, CH - 18); x.fillRect(X + CW - 3, Y + 16, 3, CH - 18);
    if (gold) { const s2 = ((t / 1800 + c.x / 400) % 1.4) - 0.2; x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(X + 1 + s2 * (CW - 4), Y + 3, 3, 10); star(x, X + CW - 7, Y + 24, 4, '#ffd23d'); }
    x.fillStyle = '#05040c'; x.fillRect(X + 6, Y + 20, CW - 12, 34);
    icon(x, Math.floor((t + c.x * 7) / 520) % 2 ? g.px2 : g.px, X + 10, Y + 25, 3);
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(X + 6, Y + 20, CW - 12, 6);
    x.fillStyle = OUT; x.fillRect(X + 13, Y + 59, 4, 5); x.fillStyle = '#ff4f6d'; x.fillRect(X + 12, Y + 57, 6, 4);
    x.fillStyle = col; x.fillRect(X + 30, Y + 61, 5, 4); x.fillStyle = '#ffe36a'; x.fillRect(X + 39, Y + 61, 5, 4);
    x.fillStyle = '#ff9a3d'; x.fillRect(X + 18, Y + 76, 6, 3); x.fillRect(X + 32, Y + 76, 6, 3);
    if (feat) { // this week's tournament game: a gold star and a spotlight
      x.fillStyle = 'rgba(255,210,61,.10)'; x.beginPath(); x.moveTo(X + CW / 2 - 6, Y - 40); x.lineTo(X + CW / 2 + 6, Y - 40); x.lineTo(X + CW + 14, Y + CH); x.lineTo(X - 14, Y + CH); x.fill();
      star(x, X + CW / 2, Y - 14 + Math.sin(t / 250) * 3, 9, '#ffd23d');
    }
  }
  function star(x, cx, cy, r, c) {
    x.fillStyle = OUT; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.5 + 2 : r + 2; x.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); } x.fill();
    x.fillStyle = c; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.5 : r; x.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); } x.fill();
  }
  const OUTFITS = {
    '': { top: '#3d8bff', legs: '#2a2a4a', hair: '#3a2414' },
    cap: { top: '#ff4f6d', legs: '#2a3a5a', hair: '#3a2414', hat: 'cap' },
    shades: { top: '#2a2630', legs: '#1a1a24', hair: '#111', glasses: true },
    astro: { top: '#e8ecf4', legs: '#c8ccd8', hair: '#3a2414', hat: 'helmet' },
    crown: { top: '#8a3dff', legs: '#5a2aa0', hair: '#c88a3a', hat: 'crown' },
    punk: { top: '#2a2630', legs: '#3d5ab8', hair: '#ff4fa3', hat: 'mohawk' },
    ninja: { top: '#1a1a24', legs: '#1a1a24', hair: '#1a1a24', hat: 'band', mask: true },
    robot: { top: '#c0c6d0', legs: '#8a8ea0', hair: '#c0c6d0', hat: 'antenna', visor: true },
    wizard: { top: '#4a2a9a', legs: '#4a2a9a', hair: '#e8e8f0', hat: 'wizard' }
  };
  /** The arcade-goer, feet at (fx, fy). */
  function drawWalker(x, fx, fy, dir, walk, moving, outfit) {
    const o = OUTFITS[outfit] || OUTFITS[''], X = Math.round(fx), Y = Math.round(fy), s = moving && Math.sin(walk) > 0 ? 1 : 0, skin = '#f0c090';
    x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(X, Y, 11, 4, 0, 0, 6.29); x.fill();
    const side = dir === 'left' || dir === 'right';
    x.save(); x.translate(X, Y); if (dir === 'left') x.scale(-1, 1);
    const parts = side
      ? [[-4 + s * 2, -12, 5, 12, o.legs], [-1 - s * 2, -12, 5, 12, shade(o.legs, -0.15)], [-6, -26, 12, 15, o.top], [-6, -38, 12, 12, skin], [-7, -40, 12, 6, o.hair, true], [-8, -36, 4, 6, o.hair, true]]
      : [[-6, -12, 5, 12 - s, o.legs], [1, -12, 5, 11 + s, o.legs], [-8, -26, 16, 15, o.top], [-6, -38, 12, 12, skin], [-7, -40, 14, dir === 'up' ? 11 : 5, o.hair, true]];
    if (!side) parts.splice(2, 0, [-11, -25 + (moving ? s : 0), 4, 11, o.top], [7, -25 + (moving ? 1 - s : 0), 4, 11, o.top]);
    paint(x, parts);
    if (dir === 'down') { x.fillStyle = OUT; x.fillRect(-4, -33, 2, 3); x.fillRect(2, -33, 2, 3); if (o.glasses) { x.fillStyle = '#111'; x.fillRect(-5, -34, 10, 3); } x.fillStyle = '#c0604a'; x.fillRect(-1, -29, 3, 1); }
    if (side) { x.fillStyle = OUT; x.fillRect(3, -33, 2, 3); if (o.glasses) { x.fillStyle = '#111'; x.fillRect(1, -34, 6, 3); } }
    if (o.hat === 'cap') { paint(x, [[-7, -44, 14, 6, '#ffd23d'], side ? [5, -40, 6, 2, '#e0b020', true] : [-6, -39, 12, 2, '#e0b020', true]]); }
    if (o.hat === 'crown') { paint(x, [[-6, -45, 12, 5, '#ffd23d']]); x.fillStyle = '#ffd23d'; x.fillRect(-6, -48, 2, 3); x.fillRect(-1, -49, 2, 4); x.fillRect(4, -48, 2, 3); x.fillStyle = '#ff4f6d'; x.fillRect(-1, -44, 2, 2); }
    if (o.hat === 'mohawk') { paint(x, [[-2, -48, 4, 9, '#ff4fa3']]); x.fillStyle = '#ffb0d8'; x.fillRect(-1, -47, 1, 6); }
    if (o.hat === 'band') { x.fillStyle = '#ff2a3a'; x.fillRect(-7, -38, 14, 3); if (dir !== 'up') { x.fillStyle = '#ff2a3a'; x.fillRect(side ? -9 : 6, -38, 4, 2); x.fillRect(side ? -11 : 8, -36, 3, 2); } }
    if (o.mask && dir !== 'up') { x.fillStyle = '#1a1a24'; x.fillRect(-6, -31, 12, 5); }
    if (o.visor && dir !== 'up') { x.fillStyle = '#0a0612'; x.fillRect(-5, -35, 10, 4); x.fillStyle = '#22e0ff'; x.fillRect(-4, -34, 8, 2); }
    if (o.hat === 'antenna') { x.fillStyle = OUT; x.fillRect(-1, -48, 2, 9); x.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff4f6d' : '#3dff8f'; x.fillRect(-2, -50, 4, 3); }
    if (o.hat === 'wizard') { x.fillStyle = OUT; x.beginPath(); x.moveTo(-10, -38); x.lineTo(2, -62); x.lineTo(10, -38); x.fill(); x.fillStyle = '#4a2a9a'; x.beginPath(); x.moveTo(-8, -39); x.lineTo(2, -59); x.lineTo(8, -39); x.fill(); x.fillStyle = '#ffd23d'; x.fillRect(-1, -50, 2, 2); x.fillRect(3, -45, 2, 2); x.fillStyle = '#5a3aba'; x.fillRect(-10, -40, 20, 3);
      if (dir === 'down') { x.fillStyle = '#e8e8f0'; x.beginPath(); x.moveTo(-5, -28); x.lineTo(5, -28); x.lineTo(0, -18); x.fill(); } }
    if (o.hat === 'helmet') { x.strokeStyle = OUT; x.lineWidth = 3; x.beginPath(); x.arc(0, -33, 11, 0, 6.29); x.stroke(); x.fillStyle = 'rgba(160,220,255,.35)'; x.beginPath(); x.arc(0, -33, 10, 0, 6.29); x.fill(); x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(-6, -40, 4, 2); }
    x.restore();
  }
  function drawCounter(x, t) {
    const { x: X, y: Y, w, h } = COUNTER, isNear = near === 'counter';
    if (isNear) { x.shadowColor = '#ffd23d'; x.shadowBlur = 22; }
    paint(x, [[X, Y + 18, w, h - 18, '#3a2a5e'], [X + 6, Y + 2, w - 12, 18, 'rgba(160,220,255,.25)', true], [X - 2, Y + 18, w + 4, 6, '#ffd23d']]);
    x.shadowBlur = 0;
    // prizes on show in the glass case
    const bits = ['#ff4f6d', '#3dff8f', '#22e0ff', '#ffd23d', '#b86bff', '#ff9a3d'];
    for (let i = 0; i < 9; i++) { x.fillStyle = bits[i % bits.length]; x.fillRect(X + 12 + i * 18, Y + 8 + (i % 2) * 3, 8, 8); }
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(X + 8, Y + 4, w - 16, 2);
    // a ticket roll and the sign
    x.fillStyle = '#ffd23d'; x.fillRect(X + w - 30, Y + 30, 18, 16); x.fillStyle = '#c8960a'; for (let i = 0; i < 3; i++) x.fillRect(X + w - 30, Y + 34 + i * 4, 18, 1);
    x.font = '14px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = OUT; x.fillRect(X + 30, Y - 26, w - 60, 20); x.fillStyle = '#2a1a4a'; x.fillRect(X + 32, Y - 24, w - 64, 16);
    x.shadowColor = '#ffd23d'; x.shadowBlur = 10; x.fillStyle = Math.floor(t / 600) % 4 ? '#ffd23d' : '#fff6c2'; x.fillText('PRIZES', X + w / 2, Y - 16); x.shadowBlur = 0;
  }
  function drawJukebox(x, t, X = DECOR.jukebox.x, Y = DECOR.jukebox.y) {
    paint(x, [[X, Y + 12, 60, 62, '#8a2a3a'], [X + 6, Y, 48, 18, '#a03a4a']]);
    const hue = Math.floor(t / 150);
    for (let i = 0; i < 5; i++) { x.fillStyle = ['#ffd23d', '#ff4fd1', '#22e0ff', '#3dff8f', '#ff9a3d'][(i + hue) % 5]; x.fillRect(X + 6 + i * 10, Y + 22, 7, 22); }
    x.fillStyle = '#ffd23d'; x.fillRect(X + 10, Y + 52, 40, 4); x.fillStyle = OUT; x.fillRect(X + 18, Y + 60, 24, 8);
  }
  function drawClaw(x, t, X = DECOR.claw.x, Y = DECOR.claw.y) {
    paint(x, [[X, Y + 54, 68, 32, '#2f8a9a'], [X, Y, 68, 10, '#3dd6ff']]);
    x.fillStyle = OUT; x.fillRect(X - 2, Y + 8, 4, 48); x.fillRect(X + 66, Y + 8, 4, 48);
    x.fillStyle = 'rgba(160,230,255,.18)'; x.fillRect(X + 2, Y + 10, 64, 44);
    const bits = ['#ff4f6d', '#ffd23d', '#3dff8f', '#b86bff', '#ff9a3d', '#22e0ff'];
    for (let i = 0; i < 8; i++) { x.fillStyle = bits[i % 6]; x.beginPath(); x.arc(X + 10 + i * 7, Y + 48 - (i % 3) * 4, 5, 0, 6.29); x.fill(); }
    const cx = X + 34 + Math.sin(t / 900) * 22; x.fillStyle = '#c0c6d0'; x.fillRect(cx - 1, Y + 10, 2, 16); x.fillRect(cx - 6, Y + 26, 12, 3); x.fillRect(cx - 6, Y + 26, 2, 7); x.fillRect(cx + 4, Y + 26, 2, 7);
    x.fillStyle = '#ffd23d'; x.fillRect(X + 26, Y + 62, 16, 4); x.fillStyle = OUT; x.fillRect(X + 28, Y + 72, 12, 8);
  }
  /** A ticket redemption machine: a tall outlined cabinet with a slot, a counter display and tickets spilling out. */
  function drawRedeem(x, t, X = DECOR.redeem.x, Y = DECOR.redeem.y) {
    paint(x, [[X, Y + 10, 48, 64, '#c8304a'], [X + 4, Y, 40, 14, '#ffd23d']]);
    x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#3a1a00'; x.fillText('TICKETS', X + 24, Y + 10);
    x.fillStyle = OUT; x.fillRect(X + 8, Y + 20, 32, 12); x.fillStyle = '#3dff8f'; x.font = '9px Silkscreen, monospace'; x.fillText(String(Math.floor(t / 90) % 1000).padStart(3, '0'), X + 24, Y + 30);
    x.fillStyle = OUT; x.fillRect(X + 14, Y + 40, 20, 4);
    const k = (t / 1400) % 1; x.fillStyle = '#ffd23d'; for (let i = 0; i < 4; i++) x.fillRect(X + 18 + Math.sin(i + k * 6) * 2, Y + 46 + i * 5 + k * 3, 12, 3);
  }
  /** A gumball machine: an outlined glass globe of colours on a red stand. */
  function drawGumball(x, X = DECOR.gumball.x, Y = DECOR.gumball.y) {
    paint(x, [[X + 6, Y + 30, 18, 26, '#d82a3a'], [X + 10, Y + 38, 10, 6, '#c0c6d0']]);
    x.fillStyle = OUT; x.beginPath(); x.arc(X + 15, Y + 17, 16, 0, 6.29); x.fill();
    x.fillStyle = 'rgba(200,230,255,.3)'; x.beginPath(); x.arc(X + 15, Y + 17, 14, 0, 6.29); x.fill();
    ['#ff4f6d', '#ffd23d', '#3dff8f', '#22e0ff', '#b86bff', '#ff9a3d'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(X + 7 + (i % 3) * 8, Y + 14 + Math.floor(i / 3) * 8, 3.5, 0, 6.29); x.fill(); });
    x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(X + 7, Y + 6, 4, 3); x.fillStyle = '#d82a3a'; x.fillRect(X + 11, Y - 1, 8, 4);
  }
  /** A lounge sofa: an outlined, cushioned couch. */
  function drawSofa(x, X = DECOR.sofa.x, Y = DECOR.sofa.y) {
    paint(x, [[X, Y, 100, 22, '#6a3aa8'], [X - 6, Y + 8, 12, 32, '#5a2a98'], [X + 94, Y + 8, 12, 32, '#5a2a98'], [X + 4, Y + 20, 44, 16, '#8a5ac8'], [X + 52, Y + 20, 44, 16, '#8a5ac8']]);
    x.fillStyle = '#3a1a68'; x.fillRect(X + 2, Y + 38, 4, 4); x.fillRect(X + 94, Y + 38, 4, 4);
  }
  /** A trophy case: a glass cabinet of gold cups, one lit for each mastered cabinet (at least one shows). */
  function drawTrophies(x, t, X = DECOR.trophies.x, Y = DECOR.trophies.y) {
    paint(x, [[X, Y, 64, 80, '#4a3020']]);
    x.fillStyle = 'rgba(160,220,255,.16)'; x.fillRect(X + 4, Y + 4, 56, 62); x.fillStyle = '#6a4a30'; x.fillRect(X + 4, Y + 34, 56, 3);
    const n = Math.max(1, Math.min(8, mastered.size));
    for (let i = 0; i < 8; i++) { const cx = X + 11 + (i % 4) * 14, cy = Y + 30 + Math.floor(i / 4) * 30, on = i < n;
      x.fillStyle = on ? '#ffd23d' : 'rgba(255,255,255,.1)'; x.fillRect(cx - 4, cy - 14, 8, 6); x.fillRect(cx - 1, cy - 8, 2, 5); x.fillRect(cx - 3, cy - 3, 6, 2);
      if (on && (Math.floor(t / 400) + i) % 5 === 0) { x.fillStyle = '#fff'; x.fillRect(cx - 3, cy - 13, 2, 2); } }
    x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(X + 6, Y + 6, 3, 58);
  }
  /** Neon strips along the aisle edges, with lights chasing along them. */
  function drawStrips(x, t) {
    for (const y of [ROW1 + CH + 8, ROW2 - 12, ROW2 + CH + 8]) {
      x.fillStyle = 'rgba(255,79,163,.18)'; x.fillRect(20, y - 2, W - 40, 4);
      x.fillStyle = '#ff4fa3'; x.fillRect(20, y - 0.5, W - 40, 1);
      for (let i = 0; i < 12; i++) { const px = 20 + (((t / 6 + i * 80) % (W - 40)) + (W - 40)) % (W - 40); x.fillStyle = i % 2 ? '#22e0ff' : '#fff'; x.shadowColor = '#22e0ff'; x.shadowBlur = 8; x.fillRect(px, y - 1.5, 6, 3); }
      x.shadowBlur = 0;
    }
  }
  function drawPlant(x, X, Y) {
    paint(x, [[X + 4, Y + 28, 18, 16, '#b8603a']]);
    x.fillStyle = '#2f9a48'; [[-6, 6], [4, 0], [14, 4], [20, 12], [-8, 16], [8, 10]].forEach(([dx, dy]) => { x.beginPath(); x.ellipse(X + 9 + dx, Y + 14 + dy, 9, 4, dx * 0.06, 0, 6.29); x.fill(); });
    x.fillStyle = '#5ad870'; x.fillRect(X + 10, Y + 6, 3, 22);
  }
  function drawDisco(x, t) {
    x.strokeStyle = '#555'; x.lineWidth = 1; x.beginPath(); x.moveTo(480, 0); x.lineTo(480, 186); x.stroke();
    x.fillStyle = OUT; x.beginPath(); x.arc(480, 200, 16, 0, 6.29); x.fill();
    for (let j = -3; j < 3; j++) for (let i = -3; i < 3; i++) { if (i * i + j * j > 10) continue; x.fillStyle = (i + j + Math.floor(t / 120)) % 3 ? '#c0c6d0' : '#fff'; x.fillRect(480 + i * 5, 200 + j * 5, 4, 4); }
  }
  function discoSpots(x, t) {
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const a = t / 2600 + i * 0.9, r = 120 + (i % 4) * 90, px = 480 + Math.cos(a) * r * 1.6, py = 380 + Math.sin(a) * r * 0.45;
      x.fillStyle = ['rgba(255,79,209,.24)', 'rgba(34,224,255,.24)', 'rgba(255,210,61,.24)'][i % 3]; x.beginPath(); x.ellipse(px, py, 18, 8, 0, 0, 6.29); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }

  /* ---------- walking ---------- */
  function step(dt) {
    let dx = 0, dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx--; if (keys.has('ArrowRight') || keys.has('KeyD')) dx++;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy--; if (keys.has('ArrowDown') || keys.has('KeyS')) dy++;
    const pad = padInput(); dx += pad.x; dy += pad.y;
    if (dx || dy) { route = []; arriveAct = null; }
    else if (route.length) { // walking to a tapped spot
      const [tx, ty] = route[0], ex = tx - me.x, ey = ty - me.y, d = Math.hypot(ex, ey);
      if (d < 4) { route.shift(); if (!route.length) { if (arriveAct) { const f = arriveAct; arriveAct = null; me.dir = 'up'; f(); } } }
      else { dx = ex / d; dy = ey / d; }
    }
    const l = Math.hypot(dx, dy);
    me.moving = l > 0.1;
    if (me.moving) {
      dx /= Math.max(1, l); dy /= Math.max(1, l);
      const nx = me.x + dx * SPEED * dt, ny = me.y + dy * SPEED * dt;
      let moved = false;
      if (!hit(nx, me.y)) { me.x = nx; moved = true; }
      if (!hit(me.x, ny)) { me.y = ny; moved = true; }
      if (!moved && route.length) route.shift(); // stuck: give up on that waypoint
      me.walk += dt * 12;
      me.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    near = null;
    for (const c of cabs) if (Math.abs(me.x - (c.x + CW / 2)) < 26 && me.y > base(c) && me.y < base(c) + 34) near = c;
    if (me.x > COUNTER.x + 10 && me.x < COUNTER.x + COUNTER.w - 10 && me.y > COUNTER.y + COUNTER.h && me.y < COUNTER.y + COUNTER.h + 36) near = 'counter';
    if (near !== shownNear) { shownNear = near; showCard(); }
  }
  const band = y => y < ROW2 + 40 ? 'upper' : 'lower';
  /** Walk to (tx, ty), going round the front row through the nearest gap when it's in the way. */
  function walkTo(tx, ty, act) {
    route = [];
    if (band(me.y) !== band(ty)) {
      const gx = gaps.reduce((b, g) => Math.abs(g - (me.x + tx) / 2) < Math.abs(b - (me.x + tx) / 2) ? g : b, gaps[0]);
      const from = band(me.y) === 'upper' ? ROW2 - 30 : ROW2 + CH + 24, to = band(me.y) === 'upper' ? ROW2 + CH + 24 : ROW2 - 30;
      route.push([gx, from], [gx, to]);
    }
    route.push([tx, ty]); arriveAct = act || null;
  }
  function interact() {
    if (!near) return;
    if (near === 'counter') opt.onCounter(); else opt.onPlay(near.g);
  }
  function showCard() {
    const card = opt.card; if (!card) return;
    if (!near) { card.innerHTML = '<span class="fl-tip">Walk up to a cabinet to play it, or to the prize counter.</span>'; return; }
    card.innerHTML = '';
    const info = document.createElement('div'), b = document.createElement('b'), small = document.createElement('small'), go = document.createElement('button');
    if (near === 'counter') { b.textContent = 'PRIZE COUNTER'; small.textContent = `TICKETS ${TICKETS.balance().toLocaleString()} · cosmetics for every game and this floor`; go.textContent = 'OPEN ▶'; card.style.setProperty('--c', '#ffd23d'); }
    else {
      const g = near.g, i = opt.info(g); b.textContent = g.name;
      small.textContent = `${g.kind.toUpperCase()} · ${i.label} ${i.best ? i.best.toLocaleString() : '—'} · ★ ${i.got}/${i.all}${opt.featured === g.slug ? ' · THIS WEEK’S TOURNAMENT' : ''}`;
      go.textContent = 'PLAY ▶'; card.style.setProperty('--c', g.c);
    }
    go.addEventListener('click', interact); info.append(b, small); card.append(info, go);
  }

  /* ---------- input ---------- */
  function padInput() {
    let p = { x: 0, y: 0 }, pressed = false;
    try {
      for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
        if (!gp) continue;
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = i => gp.buttons[i] && gp.buttons[i].pressed;
        p.x += (Math.abs(ax) > 0.4 ? ax : 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0); p.y += (Math.abs(ay) > 0.4 ? ay : 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
        if (b(0) || b(9)) pressed = true;
      }
    } catch (e) {}
    if (pressed && !padWas) interact();
    padWas = pressed;
    if ((p.x || p.y || pressed) && performance.now() - idlePing > 1000) { idlePing = performance.now(); dispatchEvent(new Event('pointermove')); } // keeps attract mode away
    return p;
  }
  const blocked = () => !running || (window.Prizes && Prizes.isOpen()) || document.documentElement.classList.contains('booting');
  const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
  addEventListener('keydown', e => {
    if (blocked() || (e.target.closest && e.target.closest('input,textarea,select'))) return;
    if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); keys.add(e.code); }
    else if ((e.code === 'Enter' || e.code === 'Space') && !(e.target.closest && e.target.closest('button,a'))) { e.preventDefault(); if (!e.repeat) interact(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  function tap(e) {
    if (blocked()) return;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    const c = cabs.find(c => x > c.x && x < c.x + CW && y > c.y && y < c.y + CH);
    if (c) return walkTo(c.x + CW / 2, base(c) + 16);
    if (x > COUNTER.x && x < COUNTER.x + COUNTER.w && y > COUNTER.y - 30 && y < COUNTER.y + COUNTER.h) return walkTo(COUNTER.x + COUNTER.w / 2, COUNTER.y + COUNTER.h + 16, () => opt.onCounter());
    walkTo(Math.max(20, Math.min(W - 20, x)), Math.max(WALL + 14, Math.min(H - 8, y)));
  }

  /* ---------- loop ---------- */
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt); draw(now);
    raf = requestAnimationFrame(frame);
  }
  function draw(t) {
    const x = ctx; x.drawImage(background(), 0, 0);
    if (owns('disco')) discoSpots(x, t);
    if (owns('strips')) drawStrips(x, t);
    const eq = equip(), list = cabs.map(c => [base(c), () => drawCab(x, c, t)]);
    if (owns('redeem')) list.push([DECOR.redeem.y + DECOR.redeem.h, () => drawRedeem(x, t)]);
    if (owns('gumball')) list.push([DECOR.gumball.y + DECOR.gumball.h, () => drawGumball(x)]);
    if (owns('sofa')) list.push([DECOR.sofa.y + DECOR.sofa.h, () => drawSofa(x)]);
    if (owns('trophies')) list.push([DECOR.trophies.y + DECOR.trophies.h, () => drawTrophies(x, t)]);
    list.push([COUNTER.y + COUNTER.h, () => drawCounter(x, t)]);
    if (owns('jukebox')) list.push([DECOR.jukebox.y + DECOR.jukebox.h, () => drawJukebox(x, t)]);
    if (owns('claw')) list.push([DECOR.claw.y + DECOR.claw.h, () => drawClaw(x, t)]);
    if (owns('plants')) { list.push([DECOR.plantL.y + 44, () => drawPlant(x, DECOR.plantL.x, DECOR.plantL.y)]); list.push([DECOR.plantR.y + 44, () => drawPlant(x, DECOR.plantR.x, DECOR.plantR.y)]); }
    list.push([me.y, () => drawWalker(x, me.x, me.y, me.dir, me.walk, me.moving, eq.outfit || '')]);
    list.sort((a, b) => a[0] - b[0]).forEach(d => d[1]());
    if (owns('disco')) drawDisco(x, t);
    if (route.length) { const [tx, ty] = route[route.length - 1]; x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 2; x.beginPath(); x.ellipse(tx, ty, 10, 4, 0, 0, 6.29); x.stroke(); }
  }

  return {
    init(o) {
      opt = o; cv = o.canvas; PAL = o.pal || {}; layout(o.games);
      const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr;
      ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
      cv.addEventListener('pointerdown', tap);
      if (window.Prizes) Prizes.onChange(() => { bgKey = null; buildSolids(); showCard(); });
      if (document.fonts) { document.fonts.ready.then(() => { bgKey = null; }); document.fonts.addEventListener('loadingdone', () => { bgKey = null; }); } // the neon signs use Bungee
    },
    start() { if (running) return; running = true; mastered = new Set(cabs.filter(c => { const i = opt.info(c.g); return i.all && i.got === i.all; }).map(c => c.g.slug)); buildSolids(); bgKey = null; shownNear = undefined; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); keys.clear(); route = []; },
    /** Test and debug hook: where the walker is, and what it's standing at. */
    state: () => ({ x: me.x, y: me.y, near: near && (near === 'counter' ? 'counter' : near.g.slug) }),
    /** Put the walker in front of a cabinet (by slug) or the counter. */
    goTo(what) { const c = cabs.find(c => c.g.slug === what); if (c) { me.x = c.x + CW / 2; me.y = base(c) + 16; } else if (what === 'counter') { me.x = COUNTER.x + COUNTER.w / 2; me.y = COUNTER.y + COUNTER.h + 16; } me.dir = 'up'; },
    interact,
    /** Prize-counter previews for the floor's own prizes; false for the others. */
    preview(p, x, w, h) {
      const t = performance.now();
      if (p.slot === 'outfit') { x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); x.save(); x.scale(1.3, 1.3); drawWalker(x, w / 2 / 1.3, (h - 6) / 1.3, 'down', 0, false, p.id); x.restore(); return true; }
      if (p.slot === 'carpet') { carpet(x, p.id, w, h); return true; }
      if (p.slot !== 'decor') return false;
      x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); x.save();
      if (p.id === 'plants') { x.translate(w / 2 - 13, 10); drawPlant(x, 0, 0); }
      else if (p.id === 'jukebox') { x.translate(w / 2 - 22, 4); x.scale(0.75, 0.75); drawJukebox(x, t, 0, 0); }
      else if (p.id === 'claw') { x.translate(w / 2 - 22, 2); x.scale(0.68, 0.68); drawClaw(x, t, 0, 0); }
      else if (p.id === 'disco') { x.translate(w / 2 - 480, -168); drawDisco(x, t); }
      else if (p.id === 'sign') { x.fillStyle = '#120e26'; x.fillRect(0, 0, w, h); neon(x, 'GAME ON', w / 2, h / 2, 16, '#22e0ff'); }
      else if (p.id === 'redeem') { x.translate(w / 2 - 18, 3); x.scale(0.75, 0.75); drawRedeem(x, t, 0, 0); }
      else if (p.id === 'gumball') { x.translate(w / 2 - 15, 4); drawGumball(x, 0, 0); }
      else if (p.id === 'sofa') { x.translate(w / 2 - 40, 14); x.scale(0.8, 0.8); drawSofa(x, 0, 0); }
      else if (p.id === 'trophies') { x.translate(w / 2 - 24, 2); x.scale(0.75, 0.75); drawTrophies(x, t, 0, 0); }
      else if (p.id === 'strips') { x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); x.translate(-20, 0); for (const y of [h / 3, h * 2 / 3]) { x.fillStyle = '#ff4fa3'; x.fillRect(20, y, w, 2); for (let i = 0; i < 4; i++) { x.fillStyle = '#22e0ff'; x.fillRect(20 + ((t / 6 + i * 30) % w), y - 1, 6, 4); } } }
      x.restore(); return true;
    }
  };
})();
