/*
 * The arcade floor: a lobby view where you walk an arcade-goer round a big, dark, neon-lit arcade. Lobby only.
 *
 * The arcade is bigger than the screen and the camera follows you. It has areas: the Raceway (sit-down racers), the
 * main floor (two rows of upright cabinets), the Shooting Gallery (light-gun cabinets), the Lounge (Blip Sports on a
 * coffee table, a sofa, the snack bar and the jukebox), the entrance (the high-score wall and the photo booth) and the
 * Prize Corner (the prize counter and the Mega Claw). Cabinets light the floor in their colours and play their games'
 * footage; other arcade-goers wander about, play, sit, cheer and talk.
 *
 * Walk with the arrows / WASD / a controller (Shift or B to run), or tap where to go (the minimap too). Stand at a
 * cabinet and press Enter (A, or the card's button) to play it: you step up and the camera dives into the screen.
 * The jukebox, high-score wall, photo booth, claw and snack bar are in shared/floor-play.js (window.FloorPlay), which
 * also makes the floor's sounds. Sprites use the house style: dark outline pass, then fills lit from above.
 *
 * Floor.init({ canvas, card, games, pal, featured, info, world, onPlay, onCounter, onJukebox, onTickets }) once, then
 * Floor.start() / Floor.stop() as the view is shown or hidden. Floor.preview(prize, ctx, w, h) draws prize previews.
 */
window.Floor = (() => {
  const VW = 960, VH = 600, WW = 2240, WH = 1320, WALL = 170, OUT = '#0a0612', CELL = 16;
  const WALK = 150, RUN = 290;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let PAL = {}, opt = null, cv = null, ctx = null, dpr = 1, running = false, raf = 0, last = 0, play = null;
  let objs = [], cabs = [], solids = [], blocked = null, bg = null, glowBg = null, bgKey = null, lights = [];
  let mastered = new Set(), near = null, shownNear, route = [], arriveAct = null, idlePing = 0, padWas = [], mode = null;
  let zoom = 1.6, baseZoom = 1.6, zoneName = '', zoneT = 0, chatT = 4, lastStep = 0;
  const cam = { x: 0, y: 0 };
  const me = { x: WW / 2, y: 930, vx: 0, vy: 0, dir: 'up', walk: 0, moving: false, run: false, pose: '', prop: null, propT: 0, entering: null, bubble: null };
  const keys = new Set(), npcs = [], shots = {};
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];

  /** Lighten (k > 0) or darken (k < 0) a #rrggbb colour. */
  function shade(hex, k) {
    let h = hex.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join('');
    const n = parseInt(h, 16), f = c => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  /** Boxes [x, y, w, h, colour, flat]: one dark outline pass, then fills lit from above (flat ones skip the shading). */
  function paint(x, list) {
    x.fillStyle = OUT; for (const q of list) x.fillRect(q[0] - 2, q[1] - 2, q[2] + 4, q[3] + 4);
    for (const [px, py, w, h, c, flat] of list) {
      x.fillStyle = c; x.fillRect(px, py, w, h);
      if (flat || w < 5 || h < 5 || c[0] !== '#') continue;
      const e = Math.max(1, Math.round(Math.min(w, h) * 0.22));
      x.fillStyle = shade(c, 0.3); x.fillRect(px, py, w, e);
      x.fillStyle = shade(c, -0.32); x.fillRect(px, py + h - e, w, e);
    }
  }
  const shadow = (x, cx, cy, rx, ry = 7) => { x.fillStyle = 'rgba(0,0,0,.5)'; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.29); x.fill(); };
  const equip = () => (window.Prizes ? Prizes.equipped() : {});
  const owns = id => !!(window.Prizes && Prizes.has(id));
  const icon = (x, px, ox, oy, k) => px.forEach((row, j) => [...row].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(ox + i * k, oy + j * k, k, k); } }));
  function footage(slug) {
    if (!shots[slug]) shots[slug] = [1, 2].map(n => { const im = new Image(); im.src = `icons/screens/${slug}-${n}.webp`; return im; });
    return shots[slug];
  }

  /* ---------- the areas ---------- */
  const ZONES = [
    { name: 'RACEWAY', x: 0, y: 0, w: 586, h: 620, c: '#ff7a3d' },
    { name: 'MAIN FLOOR', x: 586, y: 0, w: 1068, h: 620, c: '#ff4fa3' },
    { name: 'SHOOTING GALLERY', x: 1654, y: 0, w: 586, h: 620, c: '#7dd63d' },
    { name: 'LOUNGE', x: 0, y: 620, w: 640, h: 700, c: '#b48cff' },
    { name: 'ENTRANCE', x: 640, y: 620, w: 960, h: 700, c: '#5ee7ff' },
    { name: 'PRIZE CORNER', x: 1600, y: 620, w: 640, h: 700, c: '#ffd23d' }
  ];
  const zoneAt = (x, y) => ZONES.find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);

  /* ---------- layout ---------- */
  const RACERS = ['turbo-tour', 'nitro-lane', 'light-trail'], GUNS = ['raptor-ridge', 'marsh-marksman'], TABLE = 'blip-sports';
  const SIZE = { upright: [60, 104], racer: [104, 96], gun: [86, 108], table: [100, 46] };
  function addCab(g, type, x, y) {
    const [w, h] = SIZE[type], c = { kind: 'cab', type, g, x, y, w, h, base: y + h, user: null };
    if (type === 'racer') {
      c.seat = [x + w / 2, y + 128]; c.spot = [x + w / 2, y + 154]; c.solid = [[x, y + h - 40, w, 40]];
      objs.push({ kind: 'seat', x: x + 30, y: y + 104, w: 44, h: 30, base: y + 134, cab: c, solid: [[x + 32, y + 112, 40, 22]] });
    } else if (type === 'table') { c.spot = [x + w / 2, y + 68]; c.solid = [[x, y + 12, w, 34]]; }
    else { c.spot = [x + w / 2, c.base + 18]; c.solid = [[x, c.base - 42, w, 42]]; }
    c.screen = type === 'racer' ? [x + 10, y + 20, 84, 46] : type === 'gun' ? [x + 9, y + 24, 68, 40] : type === 'table' ? [x + 38, y + 13, 24, 13] : [x + 8, y + 25, 44, 34];
    cabs.push(c); objs.push(c);
  }
  const FIXED = [
    { kind: 'snack', x: 40, y: 640, w: 270, h: 62, spot: [175, 724], solid: [[40, 662, 270, 40]] },
    { kind: 'jukebox', x: 468, y: 640, w: 66, h: 86, spot: [501, 746], solid: [[468, 690, 66, 36]] },
    { kind: 'sofa', x: 150, y: 776, w: 110, h: 44, solid: [[150, 788, 110, 32]], seats: [[180, 832], [232, 832]] },
    { kind: 'beanbag', x: 92, y: 884, w: 40, h: 30, solid: [[94, 896, 36, 18]], seats: [[112, 922]] },
    { kind: 'beanbag', x: 290, y: 884, w: 40, h: 30, solid: [[292, 896, 36, 18]], seats: [[310, 922]] },
    { kind: 'board', x: 1000, y: 648, w: 240, h: 150, spot: [1120, 820], solid: [[1004, 770, 232, 28]] },
    { kind: 'booth', x: 1400, y: 640, w: 104, h: 136, spot: [1452, 796], solid: [[1400, 716, 104, 60]] },
    { kind: 'shelf', x: 1830, y: 604, w: 300, h: 82, solid: [[1830, 650, 300, 36]] },
    { kind: 'counter', x: 1840, y: 712, w: 280, h: 72, spot: [1980, 806], solid: [[1840, 736, 280, 48]] },
    { kind: 'claw', x: 1690, y: 896, w: 96, h: 140, spot: [1738, 1058], solid: [[1690, 994, 96, 42]] },
    { kind: 'bench', x: 700, y: 950, w: 96, h: 30, solid: [[700, 958, 96, 22]], seats: [[724, 990], [772, 990]] },
    { kind: 'bench', x: 1444, y: 950, w: 96, h: 30, solid: [[1444, 958, 96, 22]], seats: [[1468, 990], [1516, 990]] },
    ...[0, 1, 2, 3].map(i => ({ kind: 'pinball', i, x: 48 + i * 82, y: 1080, w: 58, h: 104, npcSpot: [77 + i * 82, 1202], solid: [[48 + i * 82, 1140, 58, 44]], c: ['#ff4f6d', '#5ee7ff', '#ffd23d', '#3dff8f'][i], name: ['METEOR', 'DEEP SEA', 'GOLD RUSH', 'JUNGLE'][i] })),
    ...[0, 1, 2].map(i => ({ kind: 'skee', i, x: 1870 + i * 80, y: 880, w: 64, h: 200, npcSpot: [1902 + i * 80, 1100], solid: [[1870 + i * 80, 920, 64, 160]] })),
    { kind: 'rail', x: 580, y: 196, w: 12, h: 230, solid: [[580, 196, 12, 230]] },
    { kind: 'rail', x: 1648, y: 196, w: 12, h: 230, solid: [[1648, 196, 12, 230]] }
  ];
  const DECOR = { redeem: { x: 2150, y: 900, w: 48, h: 74 }, gumball: { x: 2140, y: 1150, w: 30, h: 56 }, trophies: { x: 400, y: 1096, w: 64, h: 80 }, sofa: { x: 486, y: 1210, w: 100, h: 42 } };
  const PLANTS = [[548, 572], [1622, 572], [30, 1250], [2180, 1250], [606, 1236], [1600, 1236], [2190, 560], [24, 560]];
  function layout(games) {
    objs = []; cabs = [];
    const by = s => games.find(g => g.slug === s);
    RACERS.map(by).filter(Boolean).forEach((g, i) => addCab(g, 'racer', 52 + i * 172, 112));
    GUNS.map(by).filter(Boolean).forEach((g, i) => addCab(g, 'gun', 1712 + i * 150, 116));
    const blip = by(TABLE); if (blip) addCab(blip, 'table', 160, 880);
    const rest = games.filter(g => !RACERS.includes(g.slug) && !GUNS.includes(g.slug) && g.slug !== TABLE), slots = [];
    for (let i = 0; i < 10; i++) slots.push([618 + i * 102, 116]);
    for (let i = 0; i < 5; i++) slots.push([640 + i * 94, 400]);
    for (let i = 0; i < 4; i++) slots.push([1244 + i * 94, 400]);
    for (let i = 0; i < 12; i++) slots.push([1260 + (i % 4) * 82, 1100 + Math.floor(i / 4) * 150]); // if the arcade grows
    rest.forEach((g, i) => addCab(g, 'upright', ...slots[Math.min(i, slots.length - 1)]));
    FIXED.forEach(o => objs.push({ ...o, base: o.y + o.h }));
  }
  /** Things you can walk up to and use. */
  const usable = () => objs.filter(o => o.spot);
  function buildSolids() {
    const all = objs.filter(o => o.kind !== 'decor' && o.kind !== 'plant');
    for (const k of Object.keys(DECOR)) if (owns(k)) all.push({ kind: 'decor', id: k, ...DECOR[k], base: DECOR[k].y + DECOR[k].h, solid: [[DECOR[k].x, DECOR[k].y + DECOR[k].h * 0.55, DECOR[k].w, DECOR[k].h * 0.45]] });
    if (owns('plants')) PLANTS.forEach(([px, py]) => all.push({ kind: 'plant', x: px, y: py, w: 26, h: 44, base: py + 44, solid: [[px + 4, py + 30, 18, 14]] }));
    objs = all;
    solids = objs.flatMap(o => o.solid || []).map(([x, y, w, h]) => ({ x, y, w, h }));
    const C = Math.ceil(WW / CELL), R = Math.ceil(WH / CELL); blocked = new Uint8Array(C * R);
    for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) blocked[j * C + i] = hit(i * CELL + CELL / 2, j * CELL + CELL / 2, 11) ? 1 : 0;
  }
  const hit = (x, y, r = 9) => x < 18 + r || x > WW - 18 - r || y < WALL + 12 || y > WH - 30 || solids.some(s => x + r > s.x && x - r < s.x + s.w && y > s.y && y - 6 < s.y + s.h);

  /* ---------- finding a way round: A* on a 16-unit grid, then straightened ---------- */
  function findPath(sx, sy, tx, ty) {
    const C = Math.ceil(WW / CELL), R = Math.ceil(WH / CELL), N = C * R;
    const cell = (x, y) => Math.max(0, Math.min(R - 1, Math.floor(y / CELL))) * C + Math.max(0, Math.min(C - 1, Math.floor(x / CELL)));
    const free = k => !blocked[k];
    let s = cell(sx, sy), t = cell(tx, ty);
    const nearestFree = k => { if (free(k)) return k; const ci = k % C, cj = (k / C) | 0; for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < C && j < R && free(j * C + i)) return j * C + i; } return k; };
    s = nearestFree(s); t = nearestFree(t);
    const g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), done = new Uint8Array(N), heap = [];
    const h = k => { const dx = Math.abs(k % C - t % C), dy = Math.abs(((k / C) | 0) - ((t / C) | 0)); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
    const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    g[s] = 0; push(s, h(s));
    let found = false, steps = 0;
    while (heap.length && steps++ < 20000) {
      const k = pop(); if (done[k]) continue; done[k] = 1; if (k === t) { found = true; break; }
      const ci = k % C, cj = (k / C) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= C || j >= R) continue;
        const n = j * C + i; if (!free(n) || done[n]) continue;
        if (di && dj && (!free(cj * C + i) || !free(j * C + ci))) continue; // no cutting corners
        const ng = g[k] + (di && dj ? 1.414 : 1); if (ng < g[n]) { g[n] = ng; from[n] = k; push(n, ng + h(n)); }
      }
    }
    if (!found) return [[tx, ty]];
    const cells = []; for (let k = t; k !== -1; k = from[k]) cells.push([(k % C) * CELL + CELL / 2, ((k / C) | 0) * CELL + CELL / 2]);
    cells.reverse(); if (!hit(tx, ty)) cells[cells.length - 1] = [tx, ty];
    // straighten: from each point, jump to the furthest one in plain sight
    const clear = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / 6); for (let i = 1; i < n; i++) if (hit(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)) return false; return true; };
    const out = []; let at = [sx, sy], i = 0;
    while (i < cells.length) { let j = cells.length - 1; while (j > i && !clear(at, cells[j])) j--; out.push(cells[j]); at = cells[j]; i = j + 1; }
    return out;
  }

  /* ---------- the room: carpet, walls, signs (drawn once to big offscreen canvases) ---------- */
  function carpet(x, kind, w, h, y0 = 0, glow = false) {
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    if (kind === 'grid') {
      if (!glow) { x.fillStyle = '#04060e'; x.fillRect(0, y0, w, h); }
      x.strokeStyle = glow ? 'rgba(34,224,255,.8)' : 'rgba(34,224,255,.45)'; x.lineWidth = 1.5;
      for (let i = 0; i <= w; i += 32) { x.beginPath(); x.moveTo(i + 0.5, y0); x.lineTo(i + 0.5, y0 + h); x.stroke(); }
      for (let j = 0; j <= h; j += 32) { x.beginPath(); x.moveTo(0, y0 + j + 0.5); x.lineTo(w, y0 + j + 0.5); x.stroke(); }
      return;
    }
    if (kind === 'lava') {
      if (!glow) { x.fillStyle = '#2a0808'; x.fillRect(0, y0, w, h); }
      const n = Math.round(w * h / 9000);
      for (let i = 0; i < n; i++) { const px = r() * w, py = y0 + r() * h, rr = 14 + r() * 26, g = x.createRadialGradient(px, py, 0, px, py, rr * 1.6); g.addColorStop(0, glow ? 'rgba(255,170,60,.8)' : '#ffb03d'); g.addColorStop(0.45, glow ? 'rgba(255,74,26,.4)' : '#ff4a1a'); g.addColorStop(1, 'rgba(120,10,10,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(px, py, rr * 1.6, rr * 0.7, r() * 3, 0, 6.29); x.fill(); }
      return;
    }
    if (kind === 'checker') {
      if (glow) return;
      for (let j = 0; j < h; j += 24) for (let i = 0; i < w; i += 24) { x.fillStyle = ((i + j) / 24) % 2 ? '#e8e4f0' : '#141020'; x.fillRect(i, y0 + j, 24, 24); }
      return;
    }
    if (!glow) { x.fillStyle = kind === 'cosmic' ? '#0c0a2a' : '#140c24'; x.fillRect(0, y0, w, h); }
    const n = w * h / 300000;
    if (kind === 'cosmic') {
      for (let i = 0; i < 70 * n; i++) { x.fillStyle = ['#ffd23d', '#ff4fd1', '#22e0ff', '#fff'][i % 4]; x.fillRect(Math.round(r() * w), Math.round(y0 + r() * h), 2, 2); }
      for (let i = 0; i < 14 * n; i++) {
        const px = r() * w, py = y0 + r() * h, rad = 6 + r() * 8, c = ['#ff7a3d', '#3dd6ff', '#b86bff', '#3dff8f'][i % 4];
        x.fillStyle = c; x.beginPath(); x.arc(px, py, rad, 0, 6.29); x.fill();
        x.strokeStyle = '#ffd23d'; x.lineWidth = 2; x.beginPath(); x.ellipse(px, py, rad * 1.9, rad * 0.5, -0.4, 0, 6.29); x.stroke();
      }
      return;
    }
    // the default: dark carpet with neon squiggles and triangles (they glow under the blacklights)
    for (let i = 0; i < 60 * n; i++) {
      const px = r() * w, py = y0 + r() * h, c = ['#ff4fa3', '#22e0ff', '#ffd23d', '#7a5cff'][i % 4];
      x.strokeStyle = c; x.globalAlpha = glow ? 0.9 : 0.55; x.lineWidth = 2; x.beginPath();
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
  const WALL_SIGNS = [['BITCADE', 1120, 56, 40, '#ff4fa3'], ['RACEWAY', 290, 56, 28, '#ff7a3d'], ['SHOOTING GALLERY', 1950, 50, 22, '#7dd63d']];
  function background() {
    const eq = equip(), key = (eq.carpet || '') + (owns('sign') ? 's' : '');
    if (bg && key === bgKey) return;
    bgKey = key;
    bg = document.createElement('canvas'); bg.width = WW; bg.height = WH; const x = bg.getContext('2d');
    glowBg = document.createElement('canvas'); glowBg.width = WW; glowBg.height = WH; const gx = glowBg.getContext('2d');
    carpet(x, eq.carpet, WW, WH - WALL, WALL); carpet(gx, eq.carpet, WW, WH - WALL, WALL, true);
    // area rugs: the raceway's chequered strip, the lounge rug, the prize corner's gold-edged mat, the entrance runner
    for (let i = 0; i < 520; i += 12) for (let j = 0; j < 36; j += 12) { x.fillStyle = ((i + j) / 12) % 2 ? '#e8e4f0' : '#141020'; x.fillRect(40 + i, 278 + j, 12, 12); }
    x.fillStyle = OUT; x.beginPath(); x.ellipse(210, 890, 196, 112, 0, 0, 6.29); x.fill();
    x.fillStyle = '#3a1e5c'; x.beginPath(); x.ellipse(210, 890, 190, 106, 0, 0, 6.29); x.fill();
    x.strokeStyle = '#b48cff'; x.lineWidth = 3; x.beginPath(); x.ellipse(210, 890, 170, 92, 0, 0, 6.29); x.stroke();
    gx.strokeStyle = '#b48cff'; gx.lineWidth = 3; gx.beginPath(); gx.ellipse(210, 890, 170, 92, 0, 0, 6.29); gx.stroke();
    x.fillStyle = OUT; x.fillRect(1676, 836, 528, 292); x.fillStyle = '#2a1a3e'; x.fillRect(1680, 840, 520, 284); x.strokeStyle = '#ffd23d'; x.lineWidth = 2; x.strokeRect(1688, 848, 504, 268);
    gx.strokeStyle = '#ffd23d'; gx.lineWidth = 2; gx.strokeRect(1688, 848, 504, 268);
    x.fillStyle = OUT; x.fillRect(1072, 1090, 96, WH - 1090); x.fillStyle = '#2a2054'; x.fillRect(1076, 1090, 88, WH - 1090);
    x.fillStyle = OUT; x.beginPath(); x.ellipse(1120, 1010, 136, 76, 0, 0, 6.29); x.fill(); x.fillStyle = '#1e1640'; x.beginPath(); x.ellipse(1120, 1010, 130, 72, 0, 0, 6.29); x.fill();
    [x, gx].forEach(c => { c.strokeStyle = '#ff4fa3'; c.lineWidth = 3; c.beginPath(); c.ellipse(1120, 1010, 118, 64, 0, 0, 6.29); c.stroke(); c.strokeStyle = '#5ee7ff'; c.lineWidth = 2; c.beginPath(); c.ellipse(1120, 1010, 108, 57, 0, 0, 6.29); c.stroke(); });
    neon(x, 'BITCADE', 1120, 1012, 34, '#ff4fa3'); gx.font = '34px Bungee, sans-serif'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillStyle = 'rgba(255,79,163,.7)'; gx.fillText('BITCADE', 1120, 1012);
    for (let y = 1110; y < WH - 30; y += 40) { gx.fillStyle = '#5ee7ff'; gx.fillRect(1118, y, 4, 14); x.fillStyle = '#5ee7ff'; x.fillRect(1118, y, 4, 14); }
    // back wall: dark panels, a neon chair rail, the area signs
    const wg = x.createLinearGradient(0, 0, 0, WALL); wg.addColorStop(0, '#0e0a20'); wg.addColorStop(1, '#221a44'); x.fillStyle = wg; x.fillRect(0, 0, WW, WALL);
    x.fillStyle = 'rgba(255,255,255,.035)'; for (let i = 0; i < WW; i += 48) x.fillRect(i, 0, 2, WALL);
    x.fillStyle = OUT; x.fillRect(0, WALL - 4, WW, 6); x.fillStyle = '#ff4fa3'; x.fillRect(0, WALL - 3, WW, 2); gx.fillStyle = '#ff4fa3'; gx.fillRect(0, WALL - 3, WW, 2);
    WALL_SIGNS.forEach(([t, cx, cy, sz, c]) => neon(x, t, cx, cy, sz, c));
    if (owns('sign')) { neon(x, 'GAME ON', 760, 54, 20, '#22e0ff'); neon(x, 'HI-SCORE', 1480, 54, 20, '#ffd23d'); }
    // chequered flags by the raceway sign, the shooting gallery's target rail
    [[110, 36], [438, 36]].forEach(([fx, fy]) => { x.fillStyle = OUT; x.fillRect(fx - 2, fy - 2, 46, 34); for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#111'; x.fillRect(fx + i * 7, fy + j * 7.5, 7, 7.5); } });
    x.fillStyle = OUT; x.fillRect(1700, 96, 500, 6); x.fillStyle = '#c0c6d0'; x.fillRect(1700, 97, 500, 3);
    // side and front walls, the glass doors
    x.fillStyle = '#0c0920'; x.fillRect(0, WALL, 16, WH - WALL); x.fillRect(WW - 16, WALL, 16, WH - WALL);
    x.fillStyle = '#0c0920'; x.fillRect(0, WH - 24, WW, 24); x.fillStyle = '#ff4fa3'; x.fillRect(0, WH - 25, WW, 2); gx.fillStyle = '#ff4fa3'; gx.fillRect(0, WH - 25, WW, 2);
    x.fillStyle = OUT; x.fillRect(1052, WH - 26, 136, 26); x.fillStyle = 'rgba(94,231,255,.35)'; x.fillRect(1056, WH - 22, 62, 22); x.fillRect(1122, WH - 22, 62, 22);
    x.fillStyle = '#c0c6d0'; x.fillRect(1112, WH - 18, 3, 12); x.fillRect(1125, WH - 18, 3, 12);
  }

  /* ---------- sprites ---------- */
  function drawCab(x, c, t) {
    const { g } = c, X = c.x, Y = c.y, w = c.w, h = c.h, gold = mastered.has(g.slug), col = gold ? '#ffd23d' : g.c, isNear = near === c;
    if (c.type === 'table') return drawTable(x, c, t);
    shadow(x, X + w / 2, Y + h, w * 0.62);
    if (isNear) { x.shadowColor = col; x.shadowBlur = 26; }
    if (c.type === 'racer') paint(x, [[X, Y + 14, w, h - 14, '#241c48'], [X - 2, Y, w + 4, 16, shade(col, -0.4)], [X + 4, Y + 70, w - 8, 22, '#3a3072']]);
    else paint(x, [[X, Y + 16, w, h - 16, '#241c48'], [X - 2, Y, w + 4, 18, shade(col, -0.4)], [X + 3, Y + 64, w - 6, 12, '#3a3072'], [X + w / 2 - 12, Y + 82, 24, 16, '#17122e', true]]);
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(X + w - 5, Y + 18, 5, h - 18); // the side panel, in shadow
    x.fillStyle = col; x.fillRect(X + 1, Y + 3, w - 2, 11);                     // the lit marquee
    x.font = '7px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText(g.name.toUpperCase(), X + w / 2, Y + 9, w - 8);
    x.fillStyle = 'rgba(255,255,255,.45)'; x.fillRect(X + 4, Y + 3, w - 8, 1);
    x.fillStyle = col; x.fillRect(X, Y + 18, 3, h - 20); x.fillRect(X + w - 8, Y + 18, 3, h - 20); // side-art trim
    screen(x, c, t);
    if (c.type === 'racer') { // a dashboard and a steering wheel
      x.fillStyle = OUT; x.beginPath(); x.arc(X + w / 2, Y + 82, 12, 0, 6.29); x.fill();
      x.strokeStyle = '#c0c6d0'; x.lineWidth = 3; x.beginPath(); x.arc(X + w / 2, Y + 82, 9, 0, 6.29); x.stroke();
      x.fillStyle = col; x.fillRect(X + w / 2 - 2, Y + 80, 4, 4);
      x.fillStyle = '#3dff8f'; x.fillRect(X + 12, Y + 76, 10, 4); x.fillStyle = '#ffd23d'; x.fillRect(X + w - 22, Y + 76, 10, 4);
      for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#fff' : '#111'; x.fillRect(X + 4, Y + 20 + i * 8, 4, 8); x.fillRect(X + w - 12, Y + 20 + i * 8, 4, 8); }
    } else if (c.type === 'gun') { // two light guns in their holsters
      [[X + 10, '#ff8a3d', 1], [X + w - 32, '#5ee7ff', -1]].forEach(([gx, gc]) => {
        paint(x, [[gx, Y + 67, 22, 6, gc], [gx + 4, Y + 72, 6, 9, shade(gc, -0.25)]]);
        x.fillStyle = OUT; x.fillRect(gx + 18, Y + 68, 3, 3);
      });
      x.font = '6px Silkscreen, monospace'; x.fillStyle = '#ff4f6d'; x.fillText('LIGHT GUN', X + w / 2, Y + 90);
      x.strokeStyle = '#ff4f6d'; x.lineWidth = 1.5; x.beginPath(); x.arc(X + w / 2, Y + 99, 4, 0, 6.29); x.stroke(); x.fillStyle = '#ff4f6d'; x.fillRect(X + w / 2 - 1, Y + 98, 2, 2);
    } else { // a joystick and three buttons, coin slots
      x.fillStyle = OUT; x.fillRect(X + 12, Y + 66, 3, 6); x.fillStyle = '#ff4f6d'; x.beginPath(); x.arc(X + 13.5, Y + 65.5, 3.4, 0, 6.29); x.fill();
      ['#ffd23d', col, '#5ee7ff'].forEach((b, i) => { x.fillStyle = b; x.fillRect(X + 24 + i * 8, Y + 68, 5, 4); });
      x.fillStyle = '#ff9a3d'; x.fillRect(X + w / 2 - 8, Y + 87, 5, 3); x.fillRect(X + w / 2 + 3, Y + 87, 5, 3);
    }
    if (gold) { const s2 = ((t / 1800 + c.x / 400) % 1.4) - 0.2; x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(X + 1 + s2 * (w - 4), Y + 3, 3, 11); star(x, X + w - 9, Y + 26, 4, '#ffd23d'); }
    if (opt.featured === g.slug) star(x, X + w / 2, Y - 16 + Math.sin(t / 250) * 3, 10, '#ffd23d');
  }
  /** The cabinet's screen: its game's footage (two frames, faster while someone plays), with scanlines and glare. */
  function screen(x, c, t) {
    const [sx, sy, sw, sh] = c.screen, busy = c.user || (me.entering && me.entering.c === c), ims = footage(c.g.slug);
    const im = ims[Math.floor((t + c.x * 13) / (busy ? 160 : 600)) % 2];
    x.fillStyle = OUT; x.fillRect(sx - 2, sy - 2, sw + 4, sh + 4); x.fillStyle = '#05040c'; x.fillRect(sx, sy, sw, sh);
    if (im.complete && im.naturalWidth) { x.imageSmoothingEnabled = true; x.drawImage(im, sx, sy, sw, sh); x.imageSmoothingEnabled = false; }
    else icon(x, c.g.px, sx + (sw - 36) / 2, sy + (sh - 24) / 2, 3);
    x.fillStyle = 'rgba(0,0,0,.2)'; for (let j = 1; j < sh; j += 3) x.fillRect(sx, sy + j, sw, 1);
    x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(sx, sy, sw, sh * 0.3);
  }
  /** Blip Sports: the LED handheld on a coffee table, with snacks. */
  function drawTable(x, c, t) {
    const X = c.x, Y = c.y, w = c.w, isNear = near === c;
    shadow(x, X + w / 2, Y + 46, w * 0.6, 8);
    if (isNear) { x.shadowColor = c.g.c; x.shadowBlur = 22; }
    paint(x, [[X, Y + 8, w, 26, '#7a4c2c'], [X + 4, Y + 34, 8, 12, '#4a2c18'], [X + w - 12, Y + 34, 8, 12, '#4a2c18']]);
    x.shadowBlur = 0;
    paint(x, [[X + 34, Y + 9, 32, 21, '#c8304a']]);
    x.fillStyle = '#16070a'; x.fillRect(X + 38, Y + 13, 24, 13);
    for (let i = 0; i < 6; i++) { const on = (Math.floor(t / 220) + i * 3) % 7 < 2; x.fillStyle = on ? '#ff3a3a' : '#4a1010'; x.fillRect(X + 40 + (i % 3) * 7, Y + 15 + Math.floor(i / 3) * 6, 3, 3); }
    x.fillStyle = '#ffd23d'; x.fillRect(X + 40, Y + 27, 3, 2); x.fillRect(X + 57, Y + 27, 3, 2);
    // a bowl of chips and two cans
    x.fillStyle = OUT; x.beginPath(); x.ellipse(X + 16, Y + 18, 11, 6, 0, 0, 6.29); x.fill(); x.fillStyle = '#ffd23d'; x.beginPath(); x.ellipse(X + 16, Y + 17, 9, 4, 0, 0, 6.29); x.fill();
    paint(x, [[X + 76, Y + 10, 7, 11, '#ff4f6d'], [X + 87, Y + 14, 7, 11, '#3dd6ff']]);
  }
  function drawSeat(x, s) {
    paint(x, [[s.x, s.y + 8, 44, 22, '#c8304a'], [s.x + 4, s.y, 36, 12, '#a02838']]);
    x.fillStyle = '#ffd23d'; x.fillRect(s.x + 20, s.y + 1, 4, 28);
  }
  function star(x, cx, cy, r, c) {
    x.fillStyle = OUT; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.5 + 2 : r + 2; x.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); } x.fill();
    x.fillStyle = c; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * 0.5 : r; x.lineTo(cx + Math.cos(a) * k, cy + Math.sin(a) * k); } x.fill();
  }

  /* ---------- people ---------- */
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
  const SKINS = ['#f0c090', '#e0a878', '#c08050', '#8a5634', '#ffd8b4', '#6a3e22'];
  /**
   * An arcade-goer, feet at (fx, fy). look is an outfit id or { top, legs, hair, skin, hat, ... }.
   * pose: '' standing/walking, 'cheer' (both arms up), 'wave', 'sit', 'jump'; prop: 'soda' in hand.
   */
  function drawWalker(x, fx, fy, dir, walk, moving, look, pose = '', prop = null) {
    const o = typeof look === 'string' ? (OUTFITS[look] || OUTFITS['']) : look, skin = o.skin || SKINS[0];
    const ph = Math.sin(walk), s = moving ? (ph > 0 ? 1 : -1) * Math.min(1, Math.abs(ph) * 2) : 0, bob = moving ? Math.abs(Math.cos(walk)) * 1.2 : 0;
    const lift = pose === 'jump' ? 9 : 0, sit = pose === 'sit' ? 5 : 0;
    x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.ellipse(fx, fy, lift ? 8 : 11, lift ? 3 : 4, 0, 0, 6.29); x.fill();
    const side = dir === 'left' || dir === 'right';
    x.save(); x.translate(Math.round(fx), Math.round(fy - bob - lift + sit)); if (dir === 'left') x.scale(-1, 1);
    let parts;
    const legH = sit ? 7 : 12;
    if (side) {
      parts = [[-4 + s * 3, -legH, 5, legH, o.legs], [-1 - s * 3, -legH, 5, legH, shade(o.legs, -0.15)], [-6, -26 + (12 - legH) * 0, 12, 15, o.top], [-6, -38, 12, 12, skin], [-7, -40, 12, 6, o.hair, true], [-8, -36, 4, 6, o.hair, true]];
      if (pose === 'cheer' || pose === 'wave') parts.push([-1, -42, 4, 13, o.top]); else parts.push([-2 - s * 3, -25, 4, 10, shade(o.top, -0.1)]);
    } else {
      const l1 = moving ? Math.max(0, s) * 2 : 0, l2 = moving ? Math.max(0, -s) * 2 : 0;
      parts = [[-6, -legH, 5, legH - l1, o.legs], [1, -legH, 5, legH - l2, o.legs]];
      const armL = pose === 'cheer' ? [-12, -41, 4, 13] : [-11, -25 + (moving ? s : 0), 4, 11], armR = pose === 'cheer' || pose === 'wave' ? [8, -41, 4, 13] : [7, -25 - (moving ? s : 0), 4, 11];
      parts.push([...armL, o.top], [...armR, o.top], [-8, -26, 16, 15, o.top], [-6, -38, 12, 12, skin], [-7, -40, 14, dir === 'up' ? 11 : 5, o.hair, true]);
      if (pose === 'cheer') parts.push([-12, -44, 4, 4, skin], [8, -44, 4, 4, skin]); else if (pose === 'wave') parts.push([8, -44, 4, 4, skin]);
    }
    paint(x, parts);
    if (dir === 'down') { x.fillStyle = OUT; x.fillRect(-4, -33, 2, 3); x.fillRect(2, -33, 2, 3); if (o.glasses) { x.fillStyle = '#111'; x.fillRect(-5, -34, 10, 3); } x.fillStyle = pose === 'cheer' ? OUT : '#c0604a'; x.fillRect(-1, -29, 3, pose === 'cheer' ? 2 : 1); }
    if (side) { x.fillStyle = OUT; x.fillRect(3, -33, 2, 3); if (o.glasses) { x.fillStyle = '#111'; x.fillRect(1, -34, 6, 3); } }
    if (o.hat === 'cap') paint(x, [[-7, -44, 14, 6, o.capC || '#ffd23d'], side ? [5, -40, 6, 2, shade(o.capC || '#ffd23d', -0.15), true] : [-6, -39, 12, 2, shade(o.capC || '#ffd23d', -0.15), true]]);
    if (o.hat === 'crown') { paint(x, [[-6, -45, 12, 5, '#ffd23d']]); x.fillStyle = '#ffd23d'; x.fillRect(-6, -48, 2, 3); x.fillRect(-1, -49, 2, 4); x.fillRect(4, -48, 2, 3); x.fillStyle = '#ff4f6d'; x.fillRect(-1, -44, 2, 2); }
    if (o.hat === 'mohawk') { paint(x, [[-2, -48, 4, 9, o.hair]]); x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(-1, -47, 1, 6); }
    if (o.hat === 'band') { x.fillStyle = '#ff2a3a'; x.fillRect(-7, -38, 14, 3); if (dir !== 'up') { x.fillRect(side ? -9 : 6, -38, 4, 2); x.fillRect(side ? -11 : 8, -36, 3, 2); } }
    if (o.hat === 'bun') { paint(x, [[-3, -46, 7, 6, o.hair]]); }
    if (o.hat === 'phones') { x.fillStyle = OUT; x.fillRect(-8, -43, 16, 2); paint(x, [[-9, -36, 3, 6, '#ff4f6d'], [6, -36, 3, 6, '#ff4f6d']]); }
    if (o.mask && dir !== 'up') { x.fillStyle = '#1a1a24'; x.fillRect(-6, -31, 12, 5); }
    if (o.visor && dir !== 'up') { x.fillStyle = OUT; x.fillRect(-5, -35, 10, 4); x.fillStyle = '#22e0ff'; x.fillRect(-4, -34, 8, 2); }
    if (o.hat === 'antenna') { x.fillStyle = OUT; x.fillRect(-1, -48, 2, 9); x.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff4f6d' : '#3dff8f'; x.fillRect(-2, -50, 4, 3); }
    if (o.hat === 'wizard') { x.fillStyle = OUT; x.beginPath(); x.moveTo(-10, -38); x.lineTo(2, -62); x.lineTo(10, -38); x.fill(); x.fillStyle = '#4a2a9a'; x.beginPath(); x.moveTo(-8, -39); x.lineTo(2, -59); x.lineTo(8, -39); x.fill(); x.fillStyle = '#ffd23d'; x.fillRect(-1, -50, 2, 2); x.fillRect(3, -45, 2, 2); x.fillStyle = '#5a3aba'; x.fillRect(-10, -40, 20, 3);
      if (dir === 'down') { x.fillStyle = '#e8e8f0'; x.beginPath(); x.moveTo(-5, -28); x.lineTo(5, -28); x.lineTo(0, -18); x.fill(); } }
    if (o.hat === 'helmet') { x.strokeStyle = OUT; x.lineWidth = 3; x.beginPath(); x.arc(0, -33, 11, 0, 6.29); x.stroke(); x.fillStyle = 'rgba(160,220,255,.35)'; x.beginPath(); x.arc(0, -33, 10, 0, 6.29); x.fill(); x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(-6, -40, 4, 2); }
    if (prop === 'soda' && dir !== 'up') { const hx = side ? 4 : 8; paint(x, [[hx, -24, 6, 9, '#ff4f6d']]); x.fillStyle = '#fff'; x.fillRect(hx + 1, -21, 4, 2); x.fillStyle = '#e8e8f0'; x.fillRect(hx + 3, -29, 1, 5); }
    x.restore();
  }
  /** Random arcade-goers: a few outfits from the prize counter, the rest made up. */
  function randomLook() {
    if (Math.random() < 0.18) { const id = pick(['cap', 'shades', 'punk', 'ninja', 'robot', 'astro']); return { ...OUTFITS[id], skin: pick(SKINS) }; }
    return {
      top: pick(['#ff4f6d', '#3dd6ff', '#ffd23d', '#3dff8f', '#b86bff', '#ff9a3d', '#e8e8f0', '#2a2630', '#ff4fd1', '#4f6bff']),
      legs: pick(['#2a2a4a', '#3d5ab8', '#1a1a24', '#5a4a3a', '#6a6a7a']),
      hair: pick(['#3a2414', '#111111', '#c88a3a', '#e8d090', '#8a3a1a', '#ff4fa3', '#5ee7ff', '#e8e8f0']),
      skin: pick(SKINS), hat: pick(['', '', '', 'cap', 'bun', 'phones']), capC: pick(['#ffd23d', '#ff4f6d', '#3dd6ff', '#3dff8f']), glasses: Math.random() < 0.15
    };
  }

  /* ---------- other people: they wander, play, sit, watch the tournament and talk ---------- */
  const STAFF = [{ x: 175, y: 652, look: { top: '#ff4f6d', legs: '#2a2a4a', hair: '#3a2414', skin: '#e0a878', hat: 'cap', capC: '#fff' }, name: 'snack' },
    { x: 1980, y: 700, look: { top: '#ffd23d', legs: '#2a2a4a', hair: '#111111', skin: '#8a5634', hat: 'cap', capC: '#ff4f6d' }, name: 'prizes' }];
  function spawnPeople() {
    npcs.length = 0;
    for (let i = 0; i < 10; i++) {
      const z = pick(ZONES); let px, py, k = 0;
      do { px = rnd(z.x + 40, z.x + z.w - 40); py = rnd(Math.max(WALL + 40, z.y + 40), z.y + z.h - 40); } while (hit(px, py) && k++ < 40);
      npcs.push({ x: px, y: py, dir: 'down', walk: 0, moving: false, look: randomLook(), path: [], act: null, t: rnd(0, 3), pose: '', bubble: null, greetT: 0, speed: rnd(80, 110) });
    }
  }
  /** Choose what someone does next: play a free cabinet, watch the tournament, sit down, get a snack, browse prizes... */
  function plan(n) {
    if (n.act && n.act.obj && n.act.obj.user === n) n.act.obj.user = null;
    n.pose = ''; const r = Math.random(), feat = cabs.find(c => c.g.slug === opt.featured);
    const occupied = new Set(npcs.map(o => o.act && o.act.seat && o.act.seat.join()));
    let act = null;
    if (r < 0.5) { const free = [...cabs, ...objs.filter(o => o.npcSpot)].filter(c => !c.user && near !== c && !(me.entering && me.entering.c === c)); const c = free.length && pick(free); if (c) { c.user = n; act = { type: 'play', obj: c, to: c.npcSpot || (c.type === 'racer' ? c.seat : c.spot), dur: rnd(10, 26) }; } }
    else if (r < 0.62 && feat) act = { type: 'watch', obj: feat, to: [feat.spot[0] + pick([-34, 34, -18, 18]), feat.spot[1] + rnd(14, 34)], dur: rnd(8, 16) };
    else if (r < 0.74) { const seats = objs.filter(o => o.seats).flatMap(o => o.seats).filter(s => !occupied.has(s.join())); if (seats.length) { const s = pick(seats); act = { type: 'sit', seat: s, to: s, dur: rnd(10, 22) }; } }
    else if (r < 0.8) act = { type: 'snack', to: [rnd(110, 250), 724], dur: rnd(3, 6) };
    else if (r < 0.86) act = { type: 'browse', to: [rnd(1880, 2080), 806], dur: rnd(4, 9) };
    else if (r < 0.9) { const claw = objs.find(o => o.kind === 'claw'); if (!claw.user) { claw.user = n; act = { type: 'claw', obj: claw, to: claw.spot, dur: rnd(6, 10) }; } }
    else if (r < 0.94) act = { type: 'watch', to: [rnd(1040, 1200), rnd(824, 860)], dur: rnd(4, 8) };
    if (!act) { const z = pick(ZONES); act = { type: 'wander', to: [rnd(z.x + 40, z.x + z.w - 40), rnd(Math.max(WALL + 40, z.y + 40), z.y + z.h - 40)], dur: rnd(1, 3) }; }
    n.act = act; n.path = findPath(n.x, n.y, act.to[0], act.to[1]); n.t = act.dur;
  }
  const LINES = {
    play: ['ONE MORE GO!', 'COME ON...', 'SO CLOSE!', 'NOOOO', 'YES! YES!', 'NEW HIGH SCORE!', 'HOW?!', 'THIS LEVEL...', 'BOSS FIGHT!', 'EXTRA LIFE!'],
    watch: ['GO GO GO!', 'WHOA', 'NICE MOVE', 'MY TURN NEXT', 'HE\'S GOOD'],
    sit: ['BEST ARCADE EVER', 'SNACK BREAK', 'MY THUMBS HURT', 'WHO WANTS BLIP SPORTS?', 'THIS SOFA IS COMFY'],
    snack: ['ONE BITCOLA PLEASE', 'EXTRA BUTTER!', 'NACHOS!'],
    browse: ['I WANT THAT CROWN', 'HOW MANY TICKETS?', 'SO MANY PRIZES'],
    claw: ['THE CLAW IS RIGGED', 'ALMOST HAD IT!', 'COME ON CLAW...'],
    wander: ['THIS PLACE IS SICK', 'WHERE\'S THE RACEWAY?', 'FREE PLAY? NO WAY', 'LOVE THE CARPET']
  };
  function chatter() {
    const g = pick(cabs).g, wr = opt.world && opt.world(g.slug), feat = opt.featured && cabs.find(c => c.g.slug === opt.featured);
    const r = Math.random();
    if (wr && r < 0.3) return `${wr.n} HAS ${(+wr.s).toLocaleString()} ON ${g.name.toUpperCase()}?!`;
    if (feat && r < 0.42) return `TOURNAMENT\'S ON ${feat.g.name.toUpperCase()}!`;
    if (r < 0.5) { const i = opt.info(g); if (i.best) return `SOMEONE GOT ${i.best.toLocaleString()} ON ${g.name.toUpperCase()}`; }
    return null;
  }
  function say(who, text, dur = 2.6) { who.bubble = { text, t: dur }; }
  function npcStep(n, dt, t) {
    if (n.bubble && (n.bubble.t -= dt) <= 0) n.bubble = null;
    if (n.prop && (n.propT -= dt) <= 0) n.prop = null;
    if (n.path.length) {
      const [tx, ty] = n.path[0], ex = tx - n.x, ey = ty - n.y, d = Math.hypot(ex, ey);
      if (d < 3) { n.path.shift(); if (!n.path.length) arrive(n); }
      else { const v = Math.min(d, n.speed * dt); n.x += ex / d * v; n.y += ey / d * v; n.moving = true; n.walk += dt * 10; n.dir = Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : (ey > 0 ? 'down' : 'up'); }
      return;
    }
    n.moving = false; n.t -= dt;
    const a = n.act;
    if (a && a.type === 'play') { n.pose = ''; if (Math.random() < dt * 0.08) { const yay = Math.random() < 0.5; say(n, pick(LINES.play)); if (yay) { n.pose = 'cheer'; setTimeout(() => { if (n.pose === 'cheer') n.pose = ''; }, 900); } if (play) play.sound.react(n.x, yay); } }
    else if (a && a.type === 'watch' && a.obj && Math.random() < dt * 0.5) n.pose = n.pose === 'cheer' ? '' : (Math.random() < 0.3 ? 'cheer' : '');
    else if (a && Math.random() < dt * 0.02) say(n, pick(LINES[a.type] || LINES.wander));
    // greet the player now and then
    if (Math.hypot(n.x - me.x, n.y - me.y) < 70 && t > n.greetT && Math.random() < 0.5 && !n.bubble) {
      n.greetT = t + 45000; const ini = initials();
      say(n, pick([`HEY ${ini || 'PLAYER ONE'}!`, 'NICE OUTFIT', `${ini || 'YO'}! WANT A GO?`, 'HI!']));
      if (a && a.type !== 'play' && a.type !== 'sit') { n.dir = me.x < n.x ? 'left' : 'right'; n.pose = 'wave'; setTimeout(() => { if (n.pose === 'wave') n.pose = ''; }, 1200); }
    }
    // someone wants the cabinet they're on
    if (a && a.type === 'play' && near === a.obj && Math.hypot(me.x - a.obj.spot[0], me.y - a.obj.spot[1]) < 40) { say(n, pick(['ALL YOURS!', 'YOUR TURN', 'GOOD LUCK!'])); a.obj.user = null; n.act = null; n.t = 0; }
    if (n.t <= 0) plan(n);
  }
  function arrive(n) {
    const a = n.act; n.pose = ''; if (!a) return;
    if (a.type === 'play' || a.type === 'claw' || a.type === 'browse' || a.type === 'snack' || a.type === 'watch') n.dir = 'up';
    if (a.type === 'watch' && a.obj) n.dir = 'up';
    if (a.type === 'sit') { n.dir = 'down'; n.pose = 'sit'; }
    if (a.type === 'play' && a.obj.type === 'racer') n.pose = 'sit';
    if (a.type === 'play' && a.obj.type === 'table') n.dir = 'up';
    if (a.type === 'snack') { n.prop = 'soda'; n.propT = rnd(30, 60); }
  }
  const initials = () => { try { const v = localStorage.getItem('arcade:initials'); return /^[A-Z]{3}$/.test(v || '') ? v : ''; } catch (e) { return ''; } };

  /* ---------- walking ---------- */
  function step(dt, t) {
    if (me.entering) { me.entering.t += dt; return; }
    let dx = 0, dy = 0;
    if (!mode) {
      if (keys.has('ArrowLeft') || keys.has('KeyA')) dx--; if (keys.has('ArrowRight') || keys.has('KeyD')) dx++;
      if (keys.has('ArrowUp') || keys.has('KeyW')) dy--; if (keys.has('ArrowDown') || keys.has('KeyS')) dy++;
    }
    const pad = padInput(); if (!mode) { dx += pad.x; dy += pad.y; }
    let running = keys.has('ShiftLeft') || keys.has('ShiftRight') || pad.run;
    if (dx || dy) { route = []; arriveAct = null; }
    else if (route.length) { // walking to a tapped spot
      const [tx, ty] = route[0], ex = tx - me.x, ey = ty - me.y, d = Math.hypot(ex, ey);
      if (d < 5) { route.shift(); if (!route.length) { me.vx = me.vy = 0; if (arriveAct) { const f = arriveAct; arriveAct = null; f(); } } }
      else { dx = ex / d; dy = ey / d; running = running || me.autoRun; }
    }
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const top = running ? RUN : WALK, k = Math.min(1, dt * (l ? 12 : 16));
    me.vx += (dx * top - me.vx) * k; me.vy += (dy * top - me.vy) * k;
    const sp = Math.hypot(me.vx, me.vy); me.moving = sp > 12; me.run = running && sp > WALK + 20;
    if (sp > 1) {
      const nx = me.x + me.vx * dt, ny = me.y + me.vy * dt; let moved = false;
      if (!hit(nx, me.y)) { me.x = nx; moved = true; } else me.vx = 0;
      if (!hit(me.x, ny)) { me.y = ny; moved = true; } else me.vy = 0;
      if (!moved && route.length) route.shift();
      if (me.moving) {
        const before = Math.sin(me.walk); me.walk += dt * sp / 13; const after = Math.sin(me.walk);
        if (Math.sign(before) !== Math.sign(after) && play) play.sound.step(me.run);
        if (me.run && Math.random() < dt * 14) puffs.push({ x: me.x - me.vx * 0.04 + rnd(-4, 4), y: me.y, t: 0.5 });
        if (l) me.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        else if (route.length) me.dir = Math.abs(me.vx) > Math.abs(me.vy) ? (me.vx > 0 ? 'right' : 'left') : (me.vy > 0 ? 'down' : 'up');
      }
    }
    if (me.propT > 0 && (me.propT -= dt) <= 0) me.prop = null;
    if (me.bubble && (me.bubble.t -= dt) <= 0) me.bubble = null;
    // what's here?
    near = null; let best = 30;
    for (const o of usable()) { const d = Math.hypot(me.x - o.spot[0], (me.y - o.spot[1]) * 1.4); if (d < best) { best = d; near = o; } }
    if (near !== shownNear) { shownNear = near; showCard(); if (near && play) play.sound.notice(near); }
    const z = zoneAt(me.x, me.y); if (z && z.name !== zoneName) { zoneName = z.name; zoneT = 2.4; if (play && t > 1500) play.sound.zone(); }
  }
  const puffs = [];
  /** Walk to (tx, ty) round whatever's in the way, then maybe do something. Long trips run. */
  function walkTo(tx, ty, act) {
    route = findPath(me.x, me.y, tx, ty); arriveAct = act || null;
    me.autoRun = Math.hypot(tx - me.x, ty - me.y) > 320;
  }
  function goUse(o) { walkTo(o.spot[0], o.spot[1], () => { me.dir = 'up'; interact(); }); }
  function interact() {
    if (mode || me.entering) return;
    if (!near) return;
    const o = near;
    if (o.kind === 'cab') return enter(o);
    if (o.kind === 'counter') return opt.onCounter();
    if (play) play.use(o);
  }
  /** Step up to a cabinet (into the seat, for a racer) and dive into its screen, then open the game. */
  function enter(c) {
    if (c.user) { const n = c.user; say(n, pick(['ALL YOURS!', 'YOUR TURN'])); n.act = null; n.t = 0; c.user = null; }
    if (reduced) return opt.onPlay(c.g);
    me.x = c.type === 'racer' ? c.seat[0] : c.spot[0]; me.y = c.type === 'racer' ? c.seat[1] : c.spot[1];
    me.dir = 'up'; me.pose = c.type === 'racer' ? 'sit' : ''; me.vx = me.vy = 0; route = [];
    me.entering = { c, t: 0, done: false, z0: zoom, cx: cam.x + VW / zoom / 2, cy: cam.y + VH / zoom / 2 };
    if (play) play.sound.enter(c);
  }
  function showCard() {
    const card = opt.card; if (!card) return;
    if (!near) { card.innerHTML = '<span class="fl-tip">Walk up to a cabinet to play it. Explore: the raceway, the shooting gallery, the lounge, the claw…</span>'; return; }
    card.innerHTML = '';
    const info = document.createElement('div'), b = document.createElement('b'), small = document.createElement('small'), go = document.createElement('button');
    let c = near.c || '#5ee7ff';
    if (near.kind === 'cab') {
      const g = near.g, i = opt.info(g); b.textContent = g.name; c = g.c;
      small.textContent = `${g.kind.toUpperCase()} · ${i.label} ${i.best ? i.best.toLocaleString() : '—'} · ★ ${i.got}/${i.all}${opt.featured === g.slug ? ' · THIS WEEK’S TOURNAMENT' : ''}`;
      go.textContent = 'PLAY ▶';
    } else if (near.kind === 'counter') { b.textContent = 'PRIZE COUNTER'; small.textContent = `TICKETS ${TICKETS.balance().toLocaleString()} · cosmetics for every game and this floor`; go.textContent = 'OPEN ▶'; c = '#ffd23d'; }
    else if (play) { const k = play.card(near); b.textContent = k.title; small.textContent = k.sub; go.textContent = k.btn; c = k.c; }
    card.style.setProperty('--c', c);
    go.addEventListener('click', interact); info.append(b, small); card.append(info, go);
  }

  /* ---------- input ---------- */
  function padInput() {
    const p = { x: 0, y: 0, run: false }; const now = [];
    try {
      for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
        if (!gp) continue;
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = i => gp.buttons[i] && gp.buttons[i].pressed;
        p.x += (Math.abs(ax) > 0.4 ? ax : 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0); p.y += (Math.abs(ay) > 0.4 ? ay : 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
        if (b(1) || b(2)) p.run = true;
        [0, 9, 1, 12, 13, 14, 15].forEach(i => { if (b(i)) now[i] = true; });
      }
    } catch (e) {}
    const tapd = i => now[i] && !padWas[i];
    if (mode) {
      if (tapd(0) || tapd(9)) mode.key('Enter'); if (tapd(1)) mode.key('Escape');
      if (tapd(12)) mode.key('ArrowUp'); if (tapd(13)) mode.key('ArrowDown'); if (tapd(14)) mode.key('ArrowLeft'); if (tapd(15)) mode.key('ArrowRight');
      if (mode && mode.held) mode.held(p.x);
    } else if (tapd(0) || tapd(9)) interact();
    padWas = now;
    if ((p.x || p.y || now.length) && performance.now() - idlePing > 1000) { idlePing = performance.now(); dispatchEvent(new Event('pointermove')); } // keeps attract mode away
    return p;
  }
  const off = () => !running || (window.Prizes && Prizes.isOpen()) || document.documentElement.classList.contains('booting');
  const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
  addEventListener('keydown', e => {
    if (off() || (e.target.closest && e.target.closest('input,textarea,select'))) return;
    if (mode) {
      if ([...MOVE_KEYS, 'Enter', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); if (!e.repeat || e.code.startsWith('Arrow')) mode.key(e.code === 'Space' ? 'Enter' : e.code); }
      keys.add(e.code); return;
    }
    if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); keys.add(e.code); }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.add(e.code);
    else if ((e.code === 'Enter' || e.code === 'Space') && !(e.target.closest && e.target.closest('button,a'))) { e.preventDefault(); if (!e.repeat) interact(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const MAP = { x: VW - 172, y: 10, w: 162, h: 162 * WH / WW };
  function tap(e) {
    if (off() || me.entering) return;
    const r = cv.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * VW, vy = (e.clientY - r.top) / r.height * VH;
    if (mode) return mode.tap(vx, vy);
    if (vx > MAP.x && vx < MAP.x + MAP.w && vy > MAP.y && vy < MAP.y + MAP.h) { const wx = (vx - MAP.x) / MAP.w * WW, wy = (vy - MAP.y) / MAP.h * WH; return walkTo(wx, Math.max(WALL + 24, wy)); }
    const x = cam.x + vx / zoom, y = cam.y + vy / zoom;
    const o = usable().find(o => x > o.x && x < o.x + o.w && y > o.y - (o.kind === 'counter' ? 110 : 0) && y < o.y + o.h);
    if (o) { if (near === o) return interact(); return goUse(o); }
    walkTo(x, y);
  }

  /* ---------- light ---------- */
  const lightCv = document.createElement('canvas'), lx = lightCv.getContext('2d'); lightCv.width = VW / 2; lightCv.height = VH / 2;
  const LAMPS = [[300, 470], [1120, 300], [1120, 590], [1940, 470], [340, 1020], [200, 1180], [1120, 1000], [1940, 1000], [1980, 1060], [780, 960], [1480, 960], [1120, 1240]];
  function collectLights(t) {
    const L = [];
    for (const c of cabs) { const [sx, sy, sw, sh] = c.screen; L.push({ x: sx + sw / 2, y: c.type === 'table' ? sy + 30 : c.base + 6, r: c.type === 'table' ? 90 : 120, a: 0.9, c: mastered.has(c.g.slug) ? '#ffd23d' : c.g.c }); }
    const flick = Math.sin(t / 97) > 0.97 || Math.sin(t / 61) > 0.985 ? 0.25 : 1; // the raceway sign is on the blink
    WALL_SIGNS.forEach(([, x, y], i) => L.push({ x, y: y + 60, r: i ? 200 : 300, a: 0.9 * (i === 1 ? flick : 1), c: WALL_SIGNS[i][4] }));
    LAMPS.forEach(([x, y]) => L.push({ x, y, r: 230, a: 0.42 }));
    L.push({ x: 1980, y: 760, r: 220, a: 0.95, c: '#ffd23d' }, { x: 1738, y: 980, r: 150, a: 0.9, c: '#5ee7ff' }, { x: 501, y: 700, r: 140, a: 0.9, c: ['#ff4fd1', '#ffd23d', '#22e0ff', '#3dff8f'][Math.floor(t / 600) % 4] },
      { x: 1120, y: 740, r: 190, a: 0.95, c: '#5ee7ff' }, { x: 1452, y: 720, r: 120, a: 0.8 + (booth.flash > 0 ? 1 : 0), c: '#ff4fa3' }, { x: 175, y: 690, r: 190, a: 0.9, c: '#ffb03d' }, { x: 1120, y: WH - 40, r: 220, a: 0.7, c: '#5ee7ff' });
    const feat = cabs.find(c => c.g.slug === opt.featured); if (feat) L.push({ x: feat.spot[0], y: feat.spot[1] - 10, r: 170, a: 1, c: '#ffd23d' });
    L.push({ x: me.x, y: me.y - 16, r: 110, a: 0.5 });
    return L;
  }
  const booth = { flash: 0 };
  function lightMap(L) {
    lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, lightCv.width, lightCv.height);
    lx.fillStyle = '#05010f'; lx.fillRect(0, 0, lightCv.width, lightCv.height);
    lx.globalCompositeOperation = 'destination-out';
    for (const l of L) {
      const vx = (l.x - cam.x) * zoom / 2, vy = (l.y - cam.y) * zoom / 2, r = l.r * zoom / 2;
      if (vx < -r || vy < -r || vx > lightCv.width + r || vy > lightCv.height + r) continue;
      const g = lx.createRadialGradient(vx, vy, 0, vx, vy, r); g.addColorStop(0, `rgba(0,0,0,${Math.min(1, l.a)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = g; lx.fillRect(vx - r, vy - r, r * 2, r * 2);
    }
    lx.globalCompositeOperation = 'source-over';
  }
  const visible = (x, y, m = 160) => x > cam.x - m && x < cam.x + VW / zoom + m && y > cam.y - m && y < cam.y + VH / zoom + m;
  function pools(x, L) {
    x.globalCompositeOperation = 'lighter';
    for (const l of L) {
      if (!l.c || !visible(l.x, l.y, l.r)) continue;
      const g = x.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.8); g.addColorStop(0, rgba(l.c, 0.26)); g.addColorStop(1, rgba(l.c, 0));
      x.fillStyle = g; x.beginPath(); x.ellipse(l.x, l.y, l.r * 0.8, l.r * 0.55, 0, 0, 6.29); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }
  /** Things that glow through the dark: marquees, screens, signs. */
  function glows(x, t) {
    x.globalCompositeOperation = 'lighter';
    for (const c of cabs) {
      if (!visible(c.x, c.y)) continue; const col = mastered.has(c.g.slug) ? '#ffd23d' : c.g.c, [sx, sy, sw, sh] = c.screen;
      const g1 = x.createRadialGradient(c.x + c.w / 2, c.y + 8, 0, c.x + c.w / 2, c.y + 8, c.w * 0.8); g1.addColorStop(0, rgba(col, 0.45)); g1.addColorStop(1, rgba(col, 0));
      x.fillStyle = g1; x.fillRect(c.x - c.w * 0.3, c.y - c.w * 0.8 + 8, c.w * 1.6, c.w * 1.6);
      const g2 = x.createRadialGradient(sx + sw / 2, sy + sh / 2, 0, sx + sw / 2, sy + sh / 2, sw); g2.addColorStop(0, 'rgba(160,200,255,.16)'); g2.addColorStop(1, 'rgba(160,200,255,0)');
      x.fillStyle = g2; x.fillRect(sx - sw / 2, sy - sw + sh / 2, sw * 2, sw * 2);
    }
    x.globalCompositeOperation = 'source-over';
  }
  /** Signs hung from the ceiling over the lower areas, and the tournament spotlight. */
  function overhead(x, t) {
    const hang = (text, cx, cy, c, size = 18) => {
      if (!visible(cx, cy, 300)) return;
      x.font = `${size}px Bungee, sans-serif`; const w = x.measureText(text).width + 28;
      x.fillStyle = OUT; x.fillRect(cx - w / 2 + 10, cy - 40, 2, 26); x.fillRect(cx + w / 2 - 12, cy - 40, 2, 26);
      x.fillStyle = 'rgba(10,6,18,.85)'; x.fillRect(cx - w / 2, cy - 16, w, 30); x.strokeStyle = c; x.lineWidth = 2; x.strokeRect(cx - w / 2, cy - 16, w, 30);
      neon(x, text, cx, cy, size, c);
    };
    hang('LOUNGE', 330, 760, '#b48cff'); hang('SNACKS', 175, 606, '#ffb03d', 14); hang('PRIZES', 1980, 580, '#ffd23d', 20);
    const feat = cabs.find(c => c.g.slug === opt.featured);
    if (feat && visible(feat.x, feat.y, 200)) {
      const cx = feat.x + feat.w / 2; x.globalCompositeOperation = 'lighter';
      const g = x.createLinearGradient(0, feat.y - 120, 0, feat.spot[1] + 30); g.addColorStop(0, 'rgba(255,210,61,.0)'); g.addColorStop(0.3, 'rgba(255,210,61,.16)'); g.addColorStop(1, 'rgba(255,210,61,.05)');
      x.fillStyle = g; x.beginPath(); x.moveTo(cx - 10, feat.y - 120); x.lineTo(cx + 10, feat.y - 120); x.lineTo(cx + 70, feat.spot[1] + 30); x.lineTo(cx - 70, feat.spot[1] + 30); x.fill();
      x.globalCompositeOperation = 'source-over';
      x.font = '9px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#ffd23d'; x.fillText('★ TOURNAMENT ★', cx, feat.y - 34 + Math.sin(t / 300) * 2);
    }
  }

  /* ---------- decor from the prize counter (also used by the counter's previews) ---------- */
  function drawCounter(x, t, X = 1840, Y = 712, w = 280, h = 72) {
    const isNear = near && near.kind === 'counter';
    if (isNear) { x.shadowColor = '#ffd23d'; x.shadowBlur = 24; }
    paint(x, [[X, Y + 18, w, h - 18, '#3a2a5e'], [X + 6, Y + 2, w - 12, 18, 'rgba(160,220,255,.25)', true], [X - 2, Y + 18, w + 4, 6, '#ffd23d']]);
    x.shadowBlur = 0;
    const bits = ['#ff4f6d', '#3dff8f', '#22e0ff', '#ffd23d', '#b86bff', '#ff9a3d'];
    for (let i = 0; i < Math.floor((w - 24) / 18); i++) { x.fillStyle = bits[i % bits.length]; x.fillRect(X + 12 + i * 18, Y + 8 + (i % 2) * 3, 8, 8); }
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(X + 8, Y + 4, w - 16, 2);
    x.fillStyle = '#ffd23d'; x.fillRect(X + w - 30, Y + 30, 18, 16); x.fillStyle = '#c8960a'; for (let i = 0; i < 3; i++) x.fillRect(X + w - 30, Y + 34 + i * 4, 18, 1);
    x.fillStyle = OUT; x.fillRect(X + 20, Y + 32, 40, 24); x.fillStyle = '#3dff8f'; x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(TICKETS.balance().toLocaleString(), X + 40, Y + 44, 36);
  }
  /** Shelves of plush prizes behind the counter. */
  function drawShelf(x, t, o) {
    paint(x, [[o.x, o.y, o.w, o.h - 10, '#4a3020']]);
    x.fillStyle = '#6a4a30'; x.fillRect(o.x + 4, o.y + 34, o.w - 8, 4); x.fillRect(o.x + 4, o.y + o.h - 16, o.w - 8, 4);
    const cols = ['#ff4f6d', '#3dd6ff', '#ffd23d', '#3dff8f', '#b86bff', '#ff9a3d', '#ff4fd1'];
    for (let i = 0; i < 13; i++) { const px = o.x + 16 + i * 21, py = o.y + 30, c = cols[i % cols.length]; paint(x, [[px - 7, py - 16, 14, 14, c]]); x.fillStyle = OUT; x.fillRect(px - 4, py - 11, 2, 2); x.fillRect(px + 2, py - 11, 2, 2); x.fillStyle = c; x.fillRect(px - 7, py - 19, 4, 4); x.fillRect(px + 3, py - 19, 4, 4); }
    for (let i = 0; i < 9; i++) { const px = o.x + 22 + i * 30, py = o.y + o.h - 18; paint(x, [[px - 9, py - 16, 18, 16, cols[(i + 3) % cols.length]]]); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(px - 6, py - 13, 4, 2); }
  }
  function drawJukebox(x, t, X = 0, Y = 0, deluxe = false) {
    paint(x, [[X, Y + 12, 60, 62, '#8a2a3a'], [X + 6, Y, 48, 18, '#a03a4a']]);
    const hue = Math.floor(t / 150);
    for (let i = 0; i < 5; i++) { x.fillStyle = ['#ffd23d', '#ff4fd1', '#22e0ff', '#3dff8f', '#ff9a3d'][(i + hue) % 5]; x.fillRect(X + 6 + i * 10, Y + 22, 7, 22); }
    if (deluxe) for (let i = 0; i < 6; i++) { const by = Y + 44 - ((t / 14 + i * 11) % 22); x.fillStyle = 'rgba(255,255,255,.75)'; x.fillRect(X + 8 + (i % 5) * 10, by, 3, 3); }
    x.fillStyle = '#ffd23d'; x.fillRect(X + 10, Y + 52, 40, 4); x.fillStyle = OUT; x.fillRect(X + 18, Y + 60, 24, 8);
  }
  function drawClaw(x, t, X = 0, Y = 0) {
    paint(x, [[X, Y + 54, 68, 32, '#2f8a9a'], [X, Y, 68, 10, '#3dd6ff']]);
    x.fillStyle = OUT; x.fillRect(X - 2, Y + 8, 4, 48); x.fillRect(X + 66, Y + 8, 4, 48);
    x.fillStyle = 'rgba(160,230,255,.18)'; x.fillRect(X + 2, Y + 10, 64, 44);
    const bits = ['#ff4f6d', '#ffd23d', '#3dff8f', '#b86bff', '#ff9a3d', '#22e0ff'];
    for (let i = 0; i < 8; i++) { x.fillStyle = bits[i % 6]; x.beginPath(); x.arc(X + 10 + i * 7, Y + 48 - (i % 3) * 4, 5, 0, 6.29); x.fill(); }
    const cx = X + 34 + Math.sin(t / 900) * 22; x.fillStyle = '#c0c6d0'; x.fillRect(cx - 1, Y + 10, 2, 16); x.fillRect(cx - 6, Y + 26, 12, 3); x.fillRect(cx - 6, Y + 26, 2, 7); x.fillRect(cx + 4, Y + 26, 2, 7);
    x.fillStyle = '#ffd23d'; x.fillRect(X + 26, Y + 62, 16, 4); x.fillStyle = OUT; x.fillRect(X + 28, Y + 72, 12, 8);
  }
  function drawRedeem(x, t, X = 0, Y = 0) {
    paint(x, [[X, Y + 10, 48, 64, '#c8304a'], [X + 4, Y, 40, 14, '#ffd23d']]);
    x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#3a1a00'; x.fillText('TICKETS', X + 24, Y + 10);
    x.fillStyle = OUT; x.fillRect(X + 8, Y + 20, 32, 12); x.fillStyle = '#3dff8f'; x.font = '9px Silkscreen, monospace'; x.fillText(String(Math.floor(t / 90) % 1000).padStart(3, '0'), X + 24, Y + 30);
    x.fillStyle = OUT; x.fillRect(X + 14, Y + 40, 20, 4);
    const k = (t / 1400) % 1; x.fillStyle = '#ffd23d'; for (let i = 0; i < 4; i++) x.fillRect(X + 18 + Math.sin(i + k * 6) * 2, Y + 46 + i * 5 + k * 3, 12, 3);
  }
  function drawGumball(x, X = 0, Y = 0) {
    paint(x, [[X + 6, Y + 30, 18, 26, '#d82a3a'], [X + 10, Y + 38, 10, 6, '#c0c6d0']]);
    x.fillStyle = OUT; x.beginPath(); x.arc(X + 15, Y + 17, 16, 0, 6.29); x.fill();
    x.fillStyle = 'rgba(200,230,255,.3)'; x.beginPath(); x.arc(X + 15, Y + 17, 14, 0, 6.29); x.fill();
    ['#ff4f6d', '#ffd23d', '#3dff8f', '#22e0ff', '#b86bff', '#ff9a3d'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(X + 7 + (i % 3) * 8, Y + 14 + Math.floor(i / 3) * 8, 3.5, 0, 6.29); x.fill(); });
    x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(X + 7, Y + 6, 4, 3); x.fillStyle = '#d82a3a'; x.fillRect(X + 11, Y - 1, 8, 4);
  }
  function drawSofa(x, X = 0, Y = 0, w = 100, c = '#6a3aa8') {
    paint(x, [[X, Y, w, 22, c], [X - 6, Y + 8, 12, 32, shade(c, -0.12)], [X + w - 6, Y + 8, 12, 32, shade(c, -0.12)], [X + 4, Y + 20, w / 2 - 6, 16, shade(c, 0.2)], [X + w / 2 + 2, Y + 20, w / 2 - 6, 16, shade(c, 0.2)]]);
  }
  function drawTrophies(x, t, X = 0, Y = 0) {
    paint(x, [[X, Y, 64, 80, '#4a3020']]);
    x.fillStyle = 'rgba(160,220,255,.16)'; x.fillRect(X + 4, Y + 4, 56, 62); x.fillStyle = '#6a4a30'; x.fillRect(X + 4, Y + 34, 56, 3);
    const n = Math.max(1, Math.min(8, mastered.size));
    for (let i = 0; i < 8; i++) { const cx = X + 11 + (i % 4) * 14, cy = Y + 30 + Math.floor(i / 4) * 30, on = i < n;
      x.fillStyle = on ? '#ffd23d' : 'rgba(255,255,255,.1)'; x.fillRect(cx - 4, cy - 14, 8, 6); x.fillRect(cx - 1, cy - 8, 2, 5); x.fillRect(cx - 3, cy - 3, 6, 2);
      if (on && (Math.floor(t / 400) + i) % 5 === 0) { x.fillStyle = '#fff'; x.fillRect(cx - 3, cy - 13, 2, 2); } }
    x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(X + 6, Y + 6, 3, 58);
  }
  function drawStrips(x, t) {
    for (const y of [244, 548]) {
      x.fillStyle = 'rgba(255,79,163,.18)'; x.fillRect(606, y - 2, 1030, 4);
      x.fillStyle = '#ff4fa3'; x.fillRect(606, y - 0.5, 1030, 1);
      for (let i = 0; i < 14; i++) { const px = 606 + (((t / 6 + i * 74) % 1030) + 1030) % 1030; x.fillStyle = i % 2 ? '#22e0ff' : '#fff'; x.fillRect(px, y - 1.5, 6, 3); }
    }
  }
  function drawPlant(x, X, Y) {
    paint(x, [[X + 4, Y + 28, 18, 16, '#b8603a']]);
    x.fillStyle = '#2f9a48'; [[-6, 6], [4, 0], [14, 4], [20, 12], [-8, 16], [8, 10]].forEach(([dx, dy]) => { x.beginPath(); x.ellipse(X + 9 + dx, Y + 14 + dy, 9, 4, dx * 0.06, 0, 6.29); x.fill(); });
    x.fillStyle = '#5ad870'; x.fillRect(X + 10, Y + 6, 3, 22);
  }
  function drawDisco(x, t, X = 1120, Y = 980) {
    x.strokeStyle = '#555'; x.lineWidth = 1; x.beginPath(); x.moveTo(X, Y - 200); x.lineTo(X, Y - 14); x.stroke();
    x.fillStyle = OUT; x.beginPath(); x.arc(X, Y, 16, 0, 6.29); x.fill();
    for (let j = -3; j < 3; j++) for (let i = -3; i < 3; i++) { if (i * i + j * j > 10) continue; x.fillStyle = (i + j + Math.floor(t / 120)) % 3 ? '#c0c6d0' : '#fff'; x.fillRect(X + i * 5, Y + j * 5, 4, 4); }
  }
  function discoSpots(x, t) {
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const a = t / 2600 + i * 0.9, r = 80 + (i % 5) * 70, px = 1120 + Math.cos(a) * r * 1.5, py = 1040 + Math.sin(a) * r * 0.5;
      x.fillStyle = ['rgba(255,79,209,.3)', 'rgba(34,224,255,.3)', 'rgba(255,210,61,.3)'][i % 3]; x.beginPath(); x.ellipse(px, py, 18, 8, 0, 0, 6.29); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }
  /** The snack bar: a counter with a popcorn machine, a soda fountain and a hot-dog roller. */
  function drawSnack(x, t, o) {
    const isNear = near === o;
    if (isNear) { x.shadowColor = '#ffb03d'; x.shadowBlur = 22; }
    paint(x, [[o.x, o.y + 14, o.w, o.h - 14, '#c8304a'], [o.x - 2, o.y + 10, o.w + 4, 8, '#e8e4f0']]);
    x.shadowBlur = 0;
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#e8e4f0' : '#c8304a'; x.fillRect(o.x + i * 30, o.y + 22, 30, 6); }
    // popcorn machine
    paint(x, [[o.x + 16, o.y - 22, 44, 34, 'rgba(255,240,180,.35)'], [o.x + 14, o.y - 28, 48, 8, '#c8304a']]);
    for (let i = 0; i < 18; i++) { const px = o.x + 20 + (i * 7) % 36, py = o.y + 4 - Math.floor(i / 5) * 5 - ((Math.floor(t / 150) + i) % 9 === 0 ? 6 : 0); x.fillStyle = '#fff6c2'; x.fillRect(px, py, 4, 4); }
    // soda fountain
    paint(x, [[o.x + 110, o.y - 18, 56, 30, '#c0c6d0']]);
    ['#ff4f6d', '#3dff8f', '#ffd23d', '#3dd6ff'].forEach((c, i) => { x.fillStyle = c; x.fillRect(o.x + 116 + i * 12, o.y - 12, 8, 10); x.fillStyle = OUT; x.fillRect(o.x + 119 + i * 12, o.y - 1, 2, 5); });
    // hot dogs rolling
    paint(x, [[o.x + 196, o.y - 4, 58, 14, '#8a8ea0']]);
    for (let i = 0; i < 5; i++) { x.fillStyle = '#c8603a'; x.fillRect(o.x + 200 + i * 10, o.y - 2 + (Math.floor(t / 300 + i) % 2), 7, 9); }
  }
  /** The jukebox (the prize counter's Jukebox makes it a deluxe one with bubbles). */
  function drawJukeboxBig(x, t, o) {
    const isNear = near === o;
    if (isNear) { x.shadowColor = '#ff4fd1'; x.shadowBlur = 22; }
    x.save(); x.translate(o.x, o.y); x.scale(1.1, 1.16); drawJukebox(x, t, 0, 0, owns('jukebox')); x.restore();
    x.shadowBlur = 0;
    x.font = '7px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffd23d'; x.fillText('JUKEBOX', o.x + 33, o.y + 9);
  }
  /** The high-score wall: an LED board on legs showing world records, a few at a time. */
  function drawBoard(x, t, o) {
    const isNear = near === o;
    shadow(x, o.x + o.w / 2, o.y + o.h, o.w * 0.5, 8);
    paint(x, [[o.x + 20, o.y + 110, 10, 40, '#3a3a4a'], [o.x + o.w - 30, o.y + 110, 10, 40, '#3a3a4a']]);
    if (isNear) { x.shadowColor = '#5ee7ff'; x.shadowBlur = 26; }
    paint(x, [[o.x, o.y, o.w, 116, '#1a1430']]);
    x.shadowBlur = 0;
    x.fillStyle = '#05040c'; x.fillRect(o.x + 6, o.y + 6, o.w - 12, 104);
    x.textBaseline = 'middle'; x.textAlign = 'center'; x.font = '13px Bungee, sans-serif'; x.fillStyle = '#5ee7ff'; x.fillText('HIGH SCORES', o.x + o.w / 2, o.y + 18);
    const rows = boardRows(), page = Math.floor(t / 3200) % Math.max(1, Math.ceil(rows.length / 4));
    x.font = '8px Silkscreen, monospace';
    rows.slice(page * 4, page * 4 + 4).forEach((r, i) => {
      const y = o.y + 40 + i * 17; x.textAlign = 'left'; x.fillStyle = r.c; x.fillText(r.name, o.x + 14, y, 120);
      x.textAlign = 'right'; x.fillStyle = r.world ? '#ffd23d' : '#e8e4f0'; x.fillText(r.text, o.x + o.w - 14, y);
    });
    x.fillStyle = 'rgba(255,255,255,.05)'; for (let j = o.y + 6; j < o.y + 110; j += 3) x.fillRect(o.x + 6, j, o.w - 12, 1);
  }
  function boardRows() {
    return cabs.map(c => { const w = opt.world && opt.world(c.g.slug), i = opt.info(c.g); return { name: c.g.name.toUpperCase(), c: c.g.c, world: !!w, text: w ? `${w.n} ${(+w.s).toLocaleString()}` : i.best ? `YOU ${i.best.toLocaleString()}` : '---' }; });
  }
  /** The photo booth: a box with a curtain and a lit sign. */
  function drawBooth(x, t, o) {
    const isNear = near === o;
    shadow(x, o.x + o.w / 2, o.y + o.h, o.w * 0.55, 8);
    if (isNear) { x.shadowColor = '#ff4fa3'; x.shadowBlur = 24; }
    paint(x, [[o.x, o.y + 16, o.w, o.h - 16, '#2a2054'], [o.x - 2, o.y, o.w + 4, 20, '#ff4fa3']]);
    x.shadowBlur = 0;
    x.font = '12px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText('PHOTO', o.x + o.w / 2, o.y + 10);
    // the curtain, swaying, over the right half; a sample strip on the left
    x.fillStyle = OUT; x.fillRect(o.x + 50, o.y + 24, 48, o.h - 30);
    for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#c8304a' : '#a02838'; x.fillRect(o.x + 52 + i * 8 + Math.sin(t / 700 + i) * 1.2, o.y + 26, 8, o.h - 34); }
    paint(x, [[o.x + 12, o.y + 30, 26, 62, '#e8e4f0']]);
    ['#ff4fa3', '#5ee7ff', '#ffd23d'].forEach((c, i) => { x.fillStyle = c; x.fillRect(o.x + 15, o.y + 33 + i * 20, 20, 17); x.fillStyle = OUT; x.fillRect(o.x + 22, o.y + 38 + i * 20, 6, 6); });
    if (booth.flash > 0) { x.fillStyle = `rgba(255,255,255,${booth.flash})`; x.fillRect(o.x + 50, o.y + 24, 48, o.h - 30); }
  }
  function drawBigClaw(x, t, o) {
    const isNear = near === o, gold = owns('claw');
    shadow(x, o.x + o.w / 2, o.y + o.h, o.w * 0.6, 8);
    if (isNear) { x.shadowColor = '#5ee7ff'; x.shadowBlur = 24; }
    paint(x, [[o.x, o.y + 96, o.w, 44, '#2f8a9a'], [o.x - 2, o.y, o.w + 4, 18, gold ? '#ffd23d' : '#3dd6ff']]);
    x.shadowBlur = 0;
    x.font = '9px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText('MEGA CLAW', o.x + o.w / 2, o.y + 10);
    x.fillStyle = OUT; x.fillRect(o.x - 2, o.y + 16, 4, 82); x.fillRect(o.x + o.w - 2, o.y + 16, 4, 82);
    x.fillStyle = 'rgba(160,230,255,.14)'; x.fillRect(o.x + 2, o.y + 18, o.w - 4, 78);
    const bits = ['#ff4f6d', '#ffd23d', '#3dff8f', '#b86bff', '#ff9a3d', '#22e0ff'];
    for (let i = 0; i < 14; i++) { const px = o.x + 10 + (i % 7) * 12, py = o.y + 90 - Math.floor(i / 7) * 9 - (i % 3) * 2; x.fillStyle = OUT; x.beginPath(); x.arc(px, py, 6.5, 0, 6.29); x.fill(); x.fillStyle = bits[i % 6]; x.beginPath(); x.arc(px, py, 5, 0, 6.29); x.fill(); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(px - 3, py - 3, 2, 2); }
    const busy = o.user || mode, cx = o.x + o.w / 2 + Math.sin(t / (busy ? 400 : 1100)) * 30, cy = o.y + 30 + (busy ? Math.max(0, Math.sin(t / 700)) * 30 : 0);
    x.fillStyle = '#c0c6d0'; x.fillRect(cx - 1, o.y + 18, 2, cy - o.y - 18); x.fillStyle = gold ? '#ffd23d' : '#c0c6d0'; x.fillRect(cx - 7, cy, 14, 3); x.fillRect(cx - 7, cy, 2, 9); x.fillRect(cx + 5, cy, 2, 9);
    x.fillStyle = '#ffd23d'; x.fillRect(o.x + o.w / 2 - 10, o.y + 108, 20, 4); x.fillStyle = OUT; x.fillRect(o.x + 12, o.y + 116, 18, 16);
    x.fillStyle = '#ff4f6d'; x.beginPath(); x.arc(o.x + o.w - 22, o.y + 112, 5, 0, 6.29); x.fill();
  }
  function drawRail(x, t, o) {
    paint(x, [[o.x, o.y, o.w, o.h, '#3a3060']]);
    x.fillStyle = '#ff4fa3'; x.fillRect(o.x + 4, o.y + 2, 4, o.h - 4);
    for (let i = 0; i < 3; i++) { const py = o.y + ((t / 10 + i * 80) % o.h); x.fillStyle = '#fff'; x.fillRect(o.x + 4, py, 4, 6); }
  }
  /** The shooting gallery's moving targets along their rail. */
  function drawTargets(x, t) {
    if (!visible(1950, 100, 400)) return;
    for (let i = 0; i < 7; i++) {
      const px = 1700 + ((t / 22 + i * 72) % 500), up = Math.floor(t / 1600 + i) % 4 !== 0;
      if (!up) continue;
      x.fillStyle = OUT; x.fillRect(px - 1, 86, 2, 12);
      if (i % 2) { paint(x, [[px - 8, 74, 16, 12, '#ffd23d']]); x.fillStyle = '#ff9a3d'; x.fillRect(px + 8, 78, 4, 3); x.fillStyle = OUT; x.fillRect(px + 3, 77, 2, 2); } // a duck
      else { x.fillStyle = OUT; x.beginPath(); x.arc(px, 80, 9, 0, 6.29); x.fill(); ['#ff4f6d', '#fff', '#ff4f6d'].forEach((c, k) => { x.fillStyle = c; x.beginPath(); x.arc(px, 80, 7 - k * 2.4, 0, 6.29); x.fill(); }); }
    }
  }
  function drawBeanbag(x, o) {
    x.fillStyle = OUT; x.beginPath(); x.ellipse(o.x + 20, o.y + 18, 22, 15, 0, 0, 6.29); x.fill();
    x.fillStyle = o.x < 200 ? '#3dd6ff' : '#ff9a3d'; x.beginPath(); x.ellipse(o.x + 20, o.y + 18, 20, 13, 0, 0, 6.29); x.fill();
    x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.ellipse(o.x + 14, o.y + 12, 8, 4, -0.3, 0, 6.29); x.fill();
  }
  /** A pinball machine: backglass with a score, a playfield with blinking bumpers, flippers, a ball in play. */
  function drawPinball(x, t, o) {
    const X = o.x, Y = o.y, busy = !!o.user;
    shadow(x, X + o.w / 2, Y + o.h, o.w * 0.62);
    paint(x, [[X, Y + 30, o.w, o.h - 30, '#241c48'], [X + 4, Y, o.w - 8, 32, '#1a1430'], [X + 4, Y + o.h - 8, 8, 8, '#3a3060', true], [X + o.w - 12, Y + o.h - 8, 8, 8, '#3a3060', true]]);
    x.fillStyle = o.c; x.fillRect(X + 7, Y + 3, o.w - 14, 13);
    x.font = '6px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText(o.name, X + o.w / 2, Y + 10, o.w - 16);
    x.fillStyle = '#05040c'; x.fillRect(X + 9, Y + 18, o.w - 18, 10); x.fillStyle = '#ff9a3d'; x.font = '7px Silkscreen, monospace'; x.fillText(String(busy ? Math.floor(t / 37) % 100000 * 10 : 0).padStart(6, '0'), X + o.w / 2, Y + 23);
    const pf = x.createLinearGradient(0, Y + 34, 0, Y + o.h - 4); pf.addColorStop(0, shade(o.c, -0.55)); pf.addColorStop(1, shade(o.c, -0.75));
    x.fillStyle = pf; x.fillRect(X + 4, Y + 34, o.w - 8, o.h - 40);
    [[0.3, 0.25], [0.7, 0.25], [0.5, 0.42]].forEach(([bx, by], i) => { const on = busy && (Math.floor(t / 140) + i) % 3 === 0; x.fillStyle = OUT; x.beginPath(); x.arc(X + o.w * bx, Y + 34 + (o.h - 40) * by, 6, 0, 6.29); x.fill(); x.fillStyle = on ? '#fff' : o.c; x.beginPath(); x.arc(X + o.w * bx, Y + 34 + (o.h - 40) * by, 4.5, 0, 6.29); x.fill(); });
    const flip = busy && Math.sin(t / 90 + o.i) > 0.6 ? -0.5 : 0.35;
    x.strokeStyle = '#e8e4f0'; x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(X + 14, Y + o.h - 16); x.lineTo(X + 14 + Math.cos(flip) * 14, Y + o.h - 16 + Math.sin(flip) * 14); x.stroke();
    x.beginPath(); x.moveTo(X + o.w - 14, Y + o.h - 16); x.lineTo(X + o.w - 14 - Math.cos(flip) * 14, Y + o.h - 16 + Math.sin(flip) * 14); x.stroke();
    if (busy) { const bx = X + o.w / 2 + Math.sin(t / 260 + o.i) * (o.w / 2 - 12), by = Y + 40 + (Math.sin(t / 410 + o.i * 2) * 0.5 + 0.5) * (o.h - 60); x.fillStyle = '#e8ecf4'; x.beginPath(); x.arc(bx, by, 2.6, 0, 6.29); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(X + 4, Y + 34, 6, o.h - 40);
  }
  /** A skee-ball lane: a wooden ramp up to the target rings, with a score sign, and balls rolling up while someone plays. */
  function drawSkee(x, t, o) {
    const X = o.x, Y = o.y, cols = ['#ff4f6d', '#5ee7ff', '#ffd23d'];
    shadow(x, X + o.w / 2, Y + o.h, o.w * 0.6);
    paint(x, [[X, Y + 20, o.w, o.h - 20, '#7a4c2c'], [X - 2, Y, o.w + 4, 22, cols[o.i]]]);
    x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText(o.user ? String(Math.floor(t / 900) % 9 * 50 + 100) : 'SKEE', X + o.w / 2, Y + 11);
    x.fillStyle = '#5a3420'; x.fillRect(X + 6, Y + 70, o.w - 12, o.h - 80);
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(X + 6, Y + 84 + i * 18, o.w - 12, 2); }
    x.fillStyle = OUT; x.fillRect(X + 4, Y + 24, o.w - 8, 44);
    [[22, '#3a3060'], [16, '#4a3a80'], [10, '#5a4aa0'], [5, '#05040c']].forEach(([r, c]) => { x.fillStyle = c; x.beginPath(); x.ellipse(X + o.w / 2, Y + 48, r * 1.2, r * 0.8, 0, 0, 6.29); x.fill(); });
    x.fillStyle = '#05040c'; x.beginPath(); x.arc(X + 12, Y + 32, 4, 0, 6.29); x.fill(); x.beginPath(); x.arc(X + o.w - 12, Y + 32, 4, 0, 6.29); x.fill();
    for (let i = 0; i < 3; i++) { x.fillStyle = OUT; x.beginPath(); x.arc(X + 16 + i * 16, Y + o.h - 10, 5.5, 0, 6.29); x.fill(); x.fillStyle = '#c87a3a'; x.beginPath(); x.arc(X + 16 + i * 16, Y + o.h - 10, 4.2, 0, 6.29); x.fill(); }
    if (o.user) { const k = ((t + o.i * 300) % 1400) / 1400, by = Y + o.h - 20 - k * (o.h - 70), bx = X + o.w / 2 + Math.sin(k * 3 + o.i) * 8; x.fillStyle = OUT; x.beginPath(); x.arc(bx, by, 5.5 - k * 2, 0, 6.29); x.fill(); x.fillStyle = '#c87a3a'; x.beginPath(); x.arc(bx, by, 4.2 - k * 2, 0, 6.29); x.fill(); }
  }
  function drawBench(x, o) {
    paint(x, [[o.x, o.y, o.w, 14, '#5a4aa0'], [o.x + 6, o.y + 14, 8, 14, '#3a3060'], [o.x + o.w - 14, o.y + 14, 8, 14, '#3a3060']]);
    x.fillStyle = 'rgba(255,255,255,.15)'; for (let i = 0; i < 4; i++) x.fillRect(o.x + 4 + i * 23, o.y + 3, 18, 2);
  }
  function drawObj(x, o, t) {
    switch (o.kind) {
      case 'cab': return drawCab(x, o, t);
      case 'seat': return drawSeat(x, o);
      case 'snack': return drawSnack(x, t, o);
      case 'jukebox': return drawJukeboxBig(x, t, o);
      case 'sofa': return drawSofa(x, o.x, o.y, o.w, '#6a3aa8');
      case 'beanbag': return drawBeanbag(x, o);
      case 'board': return drawBoard(x, t, o);
      case 'booth': return drawBooth(x, t, o);
      case 'shelf': return drawShelf(x, t, o);
      case 'counter': return drawCounter(x, t, o.x, o.y, o.w, o.h);
      case 'claw': return drawBigClaw(x, t, o);
      case 'rail': return drawRail(x, t, o);
      case 'pinball': return drawPinball(x, t, o);
      case 'skee': return drawSkee(x, t, o);
      case 'bench': return drawBench(x, o);
      case 'plant': return drawPlant(x, o.x, o.y);
      case 'decor':
        if (o.id === 'redeem') return drawRedeem(x, t, o.x, o.y);
        if (o.id === 'gumball') return drawGumball(x, o.x, o.y);
        if (o.id === 'trophies') return drawTrophies(x, t, o.x, o.y);
        if (o.id === 'sofa') return drawSofa(x, o.x, o.y, 100, '#c8304a');
    }
  }

  /* ---------- the loop ---------- */
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt, now);
    for (const n of npcs) npcStep(n, dt, now);
    if ((chatT -= dt) <= 0) { // someone nearby says something about the scores
      chatT = rnd(5, 9); const vis = npcs.filter(n => !n.bubble && visible(n.x, n.y, -40)); const line = chatter();
      if (vis.length && line) say(pick(vis), line, 3.4);
    }
    for (const s of STAFF) if (s.bubble && (s.bubble.t -= dt) <= 0) s.bubble = null;
    for (let i = puffs.length - 1; i >= 0; i--) if ((puffs[i].t -= dt) <= 0) puffs.splice(i, 1);
    if (booth.flash > 0) booth.flash = Math.max(0, booth.flash - dt * 3);
    if (zoneT > 0) zoneT -= dt;
    camera(dt);
    if (play) play.tick(dt, now, { me, cabs, npcs, cam, zoom, near });
    draw(now, dt);
    if (me.entering && me.entering.t > 0.8 && !me.entering.done) { me.entering.done = true; opt.onPlay(me.entering.c.g); }
    raf = requestAnimationFrame(frame);
  }
  function camera(dt) {
    baseZoom = cv.clientWidth && cv.clientWidth < 700 ? 2.3 : 1.6;
    if (me.entering) {
      const e = me.entering, k = Math.min(1, e.t / 0.8), ease = k * k * (3 - 2 * k), [sx, sy, sw, sh] = e.c.screen;
      zoom = e.z0 + (VW / (sw + 6) * 0.98 - e.z0) * ease;
      const cx = e.cx + (sx + sw / 2 - e.cx) * ease, cy = e.cy + (sy + sh / 2 - e.cy) * ease;
      cam.x = cx - VW / zoom / 2; cam.y = cy - VH / zoom / 2; return;
    }
    zoom += (baseZoom - zoom) * Math.min(1, dt * 4);
    const vw = VW / zoom, vh = VH / zoom, tx = me.x + me.vx * 0.35 - vw / 2, ty = me.y - 30 + me.vy * 0.3 - vh / 2;
    const k = Math.min(1, dt * 5);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.x = Math.max(0, Math.min(WW - vw, cam.x)); cam.y = Math.max(0, Math.min(WH - vh, cam.y));
  }
  function snapCamera() { const vw = VW / zoom, vh = VH / zoom; cam.x = Math.max(0, Math.min(WW - vw, me.x - vw / 2)); cam.y = Math.max(0, Math.min(WH - vh, me.y - 30 - vh / 2)); }
  function draw(t, dt) {
    const x = ctx; background();
    const L = collectLights(t); lightMap(L);
    const S = dpr * zoom, vw = VW / zoom, vh = VH / zoom;
    x.setTransform(S, 0, 0, S, -cam.x * S, -cam.y * S); x.imageSmoothingEnabled = false;
    const sx = Math.max(0, Math.floor(cam.x)), sy = Math.max(0, Math.floor(cam.y)), sw = Math.min(WW - sx, Math.ceil(vw) + 2), sh = Math.min(WH - sy, Math.ceil(vh) + 2);
    x.drawImage(bg, sx, sy, sw, sh, sx, sy, sw, sh);
    // the dark, then what glows on the floor through it: blacklight carpet, pools of cabinet light
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.globalAlpha = 0.6; x.imageSmoothingEnabled = true; x.drawImage(lightCv, 0, 0, VW, VH); x.globalAlpha = 1;
    x.setTransform(S, 0, 0, S, -cam.x * S, -cam.y * S); x.imageSmoothingEnabled = false;
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.5; x.drawImage(glowBg, sx, sy, sw, sh, sx, sy, sw, sh); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    pools(x, L);
    if (owns('disco')) discoSpots(x, t);
    if (owns('strips')) drawStrips(x, t);
    drawTargets(x, t);
    for (const p of puffs) { x.fillStyle = `rgba(200,190,230,${p.t})`; x.beginPath(); x.arc(p.x, p.y - (0.5 - p.t) * 10, 3 + (0.5 - p.t) * 8, 0, 6.29); x.fill(); }
    // everything standing, back to front
    const list = objs.filter(o => visible(o.x, o.y, 120)).map(o => [o.base, () => drawObj(x, o, t)]);
    for (const s of STAFF) if (visible(s.x, s.y)) list.push([s.y, () => drawWalker(x, s.x, s.y, 'down', 0, false, s.look, s.bubble && s.bubble.t > 2 ? 'wave' : '')]);
    for (const n of npcs) if (visible(n.x, n.y)) list.push([n.y, () => drawWalker(x, n.x, n.y, n.dir, n.walk, n.moving, n.look, n.pose, n.prop)]);
    list.push([me.y, () => drawWalker(x, me.x, me.y, me.dir, me.walk, me.moving, equip().outfit || '', me.pose || (me.bubble && me.bubble.cheer ? 'cheer' : ''), me.prop)]);
    list.sort((a, b) => a[0] - b[0]).forEach(d => d[1]());
    // a lighter dark over everything, then the glows
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.globalAlpha = 0.34; x.imageSmoothingEnabled = true; x.drawImage(lightCv, 0, 0, VW, VH); x.globalAlpha = 1;
    x.setTransform(S, 0, 0, S, -cam.x * S, -cam.y * S);
    glows(x, t);
    if (owns('disco')) drawDisco(x, t);
    overhead(x, t);
    if (route.length && !mode) { const [tx, ty] = route[route.length - 1]; x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2; x.beginPath(); x.ellipse(tx, ty, 10 + Math.sin(t / 150), 4, 0, 0, 6.29); x.stroke(); }
    // on the screen: speech bubbles, the area name, the minimap, whatever's open
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const n of [...npcs, ...STAFF, me]) if (n.bubble && visible(n.x, n.y, 0)) bubble(x, (n.x - cam.x) * zoom, (n.y - 50 - cam.y) * zoom, n.bubble.text, n === me);
    if (me.entering) { const k = Math.min(1, me.entering.t / 0.8); x.fillStyle = `rgba(255,255,255,${Math.max(0, k - 0.75) * 2})`; x.fillRect(0, 0, VW, VH); return; }
    if (zoneT > 0 && zoneName) {
      const a = Math.min(1, zoneT * 2, (2.4 - zoneT) * 4), z = ZONES.find(z => z.name === zoneName);
      x.globalAlpha = a; x.font = '26px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = OUT; x.fillText(zoneName, VW / 2 + 3, VH - 37); x.shadowColor = z.c; x.shadowBlur = 16; x.fillStyle = z.c; x.fillText(zoneName, VW / 2, VH - 40); x.shadowBlur = 0; x.globalAlpha = 1;
    }
    minimap(x, t);
    if (mode) mode.draw(x, t, dt);
  }
  function bubble(x, bx, by, text, mine) {
    x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(320, x.measureText(text).width + 16), h = 22, X = Math.max(4, Math.min(VW - w - 4, bx - w / 2)), Y = Math.max(4, by - h);
    x.fillStyle = OUT; x.fillRect(X - 2, Y - 2, w + 4, h + 4); x.fillStyle = mine ? '#ffd23d' : '#f4effd'; x.fillRect(X, Y, w, h);
    x.beginPath(); x.moveTo(bx - 5, Y + h); x.lineTo(bx + 5, Y + h); x.lineTo(bx, Y + h + 7); x.fill();
    x.fillStyle = '#140c24'; x.fillText(text, X + w / 2, Y + h / 2 + 1, w - 8);
  }
  function minimap(x, t) {
    const { x: mx, y: my, w, h } = MAP, k = w / WW;
    x.fillStyle = 'rgba(10,6,18,.6)'; x.fillRect(mx - 3, my - 3, w + 6, h + 6); x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; x.strokeRect(mx - 3.5, my - 3.5, w + 7, h + 7);
    for (const z of ZONES) { x.fillStyle = rgba(z.c, z.name === zoneName ? 0.22 : 0.09); x.fillRect(mx + z.x * k, my + Math.max(WALL, z.y) * k, z.w * k - 1, (z.y ? z.h : z.h - WALL) * k - 1); }
    for (const o of objs) { if (o.kind === 'plant' || o.kind === 'seat') continue; x.fillStyle = o.kind === 'cab' ? (mastered.has(o.g.slug) ? '#ffd23d' : o.g.c) : o.kind === 'counter' ? '#ffd23d' : o.kind === 'claw' ? '#5ee7ff' : 'rgba(255,255,255,.35)'; x.fillRect(mx + o.x * k, my + o.y * k, Math.max(2, o.w * k), Math.max(2, o.h * k)); }
    x.fillStyle = 'rgba(255,255,255,.55)'; for (const n of npcs) x.fillRect(mx + n.x * k - 1, my + n.y * k - 1, 2, 2);
    const vw = VW / zoom, vh = VH / zoom; x.strokeStyle = 'rgba(255,255,255,.4)'; x.strokeRect(mx + cam.x * k, my + cam.y * k, vw * k, vh * k);
    x.fillStyle = Math.floor(t / 300) % 2 ? '#fff' : '#ffd23d'; x.fillRect(mx + me.x * k - 2, my + me.y * k - 2, 4, 4);
  }

  /* ---------- the kit floor-play.js builds on ---------- */
  const kit = {
    VW, VH, OUT, shade, paint, rgba, star, neon, drawWalker, randomLook, icon, footage, owns,
    get opt() { return opt; }, get me() { return me; }, get cabs() { return cabs; }, get npcs() { return npcs; }, get mastered() { return mastered; },
    look: () => equip().outfit || '', initials, booth, held: c => keys.has(c), say: (text, dur, cheer) => { me.bubble = { text, t: dur || 2.4, cheer }; },
    staffSay: (who, text) => { const s = STAFF.find(s => s.name === who); if (s) say(s, text, 2.6); },
    open: m => { mode = m; keys.clear(); route = []; me.vx = me.vy = 0; showCard(); },
    close: () => { mode = null; keys.clear(); showCard(); },
    refreshCard: () => { shownNear = undefined; },
    boardRows
  };

  return {
    init(o) {
      opt = o; cv = o.canvas; PAL = o.pal || {}; layout(o.games);
      dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = VW * dpr; cv.height = VH * dpr;
      ctx = cv.getContext('2d');
      cv.addEventListener('pointerdown', tap);
      play = window.FloorPlay ? window.FloorPlay(kit) : null;
      if (window.Prizes) Prizes.onChange(() => { bgKey = null; buildSolids(); showCard(); });
      if (document.fonts) { document.fonts.ready.then(() => { bgKey = null; }); document.fonts.addEventListener('loadingdone', () => { bgKey = null; }); } // the neon signs use Bungee
      buildSolids(); spawnPeople(); cabs.forEach(c => footage(c.g.slug));
    },
    start() {
      if (running) return; running = true;
      mastered = new Set(cabs.filter(c => { const i = opt.info(c.g); return i.all && i.got === i.all; }).map(c => c.g.slug));
      buildSolids(); bgKey = null; shownNear = undefined; me.entering = null; me.pose = ''; mode = null;
      zoom = baseZoom = cv.clientWidth && cv.clientWidth < 700 ? 2.3 : 1.6; snapCamera();
      npcs.forEach(n => { if (!n.act) n.t = rnd(0, 2); });
      last = performance.now(); raf = requestAnimationFrame(frame);
      if (play) play.sound.start();
    },
    stop() { running = false; cancelAnimationFrame(raf); keys.clear(); route = []; mode = null; if (play) play.sound.stop(); },
    /** Test and debug hook: where the walker is, what it's standing at, and what's open. */
    state: () => ({ x: me.x, y: me.y, near: near && (near.kind === 'cab' ? near.g.slug : near.kind), mode: mode ? mode.name : null, people: npcs.length, zone: zoneName }),
    /** Put the walker in front of a cabinet (by slug) or a thing ('counter', 'claw', 'jukebox', 'board', 'booth', 'snack'). */
    goTo(what) {
      const o = cabs.find(c => c.g.slug === what) || objs.find(o => o.kind === what && o.spot);
      if (o) { me.x = o.spot[0]; me.y = o.spot[1]; me.vx = me.vy = 0; route = []; }
      me.dir = 'up'; if (running) snapCamera();
    },
    interact,
    /** Prize-counter previews for the floor's own prizes; false for the others. */
    preview(p, x, w, h) {
      const t = performance.now();
      if (p.slot === 'outfit') { x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); x.save(); x.scale(1.3, 1.3); drawWalker(x, w / 2 / 1.3, (h - 6) / 1.3, 'down', 0, false, p.id); x.restore(); return true; }
      if (p.slot === 'carpet') { carpet(x, p.id, w, h); return true; }
      if (p.slot !== 'decor') return false;
      x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); x.save();
      if (p.id === 'plants') { x.translate(w / 2 - 13, 10); drawPlant(x, 0, 0); }
      else if (p.id === 'jukebox') { x.translate(w / 2 - 22, 4); x.scale(0.75, 0.75); drawJukebox(x, t, 0, 0, true); }
      else if (p.id === 'claw') { x.translate(w / 2 - 22, 2); x.scale(0.68, 0.68); drawClaw(x, t, 0, 0); }
      else if (p.id === 'disco') { drawDisco(x, t, w / 2, 32); }
      else if (p.id === 'sign') { x.fillStyle = '#120e26'; x.fillRect(0, 0, w, h); neon(x, 'GAME ON', w / 2, h / 2, 16, '#22e0ff'); }
      else if (p.id === 'redeem') { x.translate(w / 2 - 18, 3); x.scale(0.75, 0.75); drawRedeem(x, t, 0, 0); }
      else if (p.id === 'gumball') { x.translate(w / 2 - 15, 4); drawGumball(x, 0, 0); }
      else if (p.id === 'sofa') { x.translate(w / 2 - 40, 14); x.scale(0.8, 0.8); drawSofa(x, 0, 0, 100, '#c8304a'); }
      else if (p.id === 'trophies') { x.translate(w / 2 - 24, 2); x.scale(0.75, 0.75); drawTrophies(x, t, 0, 0); }
      else if (p.id === 'strips') { x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); for (const y of [h / 3, h * 2 / 3]) { x.fillStyle = '#ff4fa3'; x.fillRect(0, y, w, 2); for (let i = 0; i < 4; i++) { x.fillStyle = '#22e0ff'; x.fillRect((t / 6 + i * 30) % w, y - 1, 6, 4); } } }
      x.restore(); return true;
    }
  };
})();
