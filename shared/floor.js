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
  // VW x VH is the box the panels (claw, skee-ball, emotes…) are drawn in; SW x SH is the whole view, as big as the canvas, at least the box
  const VW = 960, VH = 600, GW = 2880, GH = 1320, WALL = 170, OUT = '#0a0612', CELL = 16;
  let WW = GW, WH = GH, level = 0; // the floor you're on: 0 the ground floor, 1 the Loft (whose size is LOFT)
  const WALK = 150, RUN = 290;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let SW = 960, SH = 600, BX = 0, BY = 0, fitZoom = 1.6, PAL = {}, opt = null, cv = null, ctx = null, dpr = 1, running = false, raf = 0, last = 0, play = null;
  let objs = [], cabs = [], solids = [], blocked = null, bg = null, glowBg = null, bgKey = null, lights = [];
  let mastered = new Set(), near = null, shownNear, route = [], arriveAct = null, idlePing = 0, padWas = [], mode = null;
  let zoom = 1.6, baseZoom = 1.6, zoneName = '', zoneT = 0, chatT = 4, lastStep = 0;
  const cam = { x: 0, y: 0 };
  const me = { x: WW / 2, y: 930, vx: 0, vy: 0, dir: 'up', walk: 0, moving: false, run: false, pose: '', prop: null, propT: 0, entering: null, bubble: null, emote: null };
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
    { name: 'PRIZE CORNER', x: 1600, y: 620, w: 640, h: 700, c: '#ffd23d' },
    { name: 'VIP ROOM', x: 2240, y: 0, w: 640, h: 1320, c: '#ffd23d', vip: true }
  ];
  const zoneAt = (x, y) => zones().find(z => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);

  /* ---------- layout ---------- */
  const RACERS = ['turbo-tour', 'nitro-lane', 'light-trail'], GUNS = ['raptor-ridge', 'marsh-marksman'], TABLE = 'blip-sports', DANCE = 'neon-steps';
  const SIZE = { upright: [60, 104], racer: [104, 96], gun: [86, 108], table: [100, 46], dance: [104, 104] };
  function addCab(g, type, x, y) {
    const [w, h] = SIZE[type], c = { kind: 'cab', type, g, x, y, w, h, base: y + h, user: null };
    if (type === 'racer') {
      c.seat = [x + w / 2, y + 128]; c.spot = [x + w / 2, y + 154]; c.solid = [[x, y + h - 40, w, 40]];
      objs.push({ kind: 'seat', x: x + 30, y: y + 104, w: 44, h: 30, base: y + 134, cab: c, solid: [[x + 32, y + 112, 40, 22]] });
    } else if (type === 'table') { c.spot = [x + w / 2, y + 68]; c.solid = [[x, y + 12, w, 34]]; }
    else if (type === 'dance') { c.spot = [x + w / 2, y + h + 40]; c.solid = [[x, y + h - 40, w, 40]]; objs.push({ kind: 'dancepad', x: x + 8, y: y + h + 8, w: w - 16, h: 52, base: y + h + 8, cab: c }); }
    else { c.spot = [x + w / 2, c.base + 18]; c.solid = [[x, c.base - 42, w, 42]]; }
    c.screen = type === 'dance' ? [x + 16, y + 24, 72, 40] : type === 'racer' ? [x + 10, y + 20, 84, 46] : type === 'gun' ? [x + 9, y + 24, 68, 40] : type === 'table' ? [x + 38, y + 13, 24, 13] : [x + 8, y + 25, 44, 34];
    cabs.push(c); objs.push(c);
  }
  const FIXED = [
    { kind: 'snack', x: 40, y: 640, w: 270, h: 62, spot: [175, 724], solid: [[40, 662, 270, 40]] },
    { kind: 'jukebox', x: 468, y: 640, w: 66, h: 86, spot: [501, 746], solid: [[468, 690, 66, 36]] },
    { kind: 'sofa', x: 150, y: 776, w: 110, h: 44, solid: [[150, 788, 110, 32]], seats: [[180, 832], [232, 832]] },
    { kind: 'beanbag', x: 92, y: 884, w: 40, h: 30, solid: [[94, 896, 36, 18]], seats: [[112, 922]] },
    { kind: 'beanbag', x: 290, y: 884, w: 40, h: 30, solid: [[292, 896, 36, 18]], seats: [[310, 922]] },
    { kind: 'stairs', x: 700, y: 640, w: 160, h: 150, spot: [780, 812], solid: [[700, 700, 160, 90]] },
    { kind: 'arch', x: 1030, y: 1250, w: 176, h: 10, solid: [[1030, 1250, 10, 10], [1206, 1250, 10, 10]] },
    { kind: 'tyres', x: 528, y: 300, w: 38, h: 48, solid: [[528, 330, 38, 18]] }, { kind: 'tyres', x: 20, y: 300, w: 38, h: 48, solid: [[20, 330, 38, 18]] },
    { kind: 'lamp', x: 410, y: 772, w: 20, h: 84, solid: [[412, 846, 16, 10]] }, { kind: 'lamp', x: 30, y: 772, w: 20, h: 84, solid: [[32, 846, 16, 10]] },
    { kind: 'board', x: 1000, y: 648, w: 240, h: 150, spot: [1120, 820], solid: [[1004, 770, 232, 28]] },
    { kind: 'booth', x: 1400, y: 640, w: 104, h: 136, spot: [1452, 796], solid: [[1400, 716, 104, 60]] },
    { kind: 'shelf', x: 1830, y: 604, w: 300, h: 82, solid: [[1830, 650, 300, 36]] },
    { kind: 'counter', x: 1840, y: 712, w: 280, h: 72, spot: [1980, 806], solid: [[1840, 736, 280, 48]] },
    { kind: 'claw', x: 1690, y: 896, w: 96, h: 140, spot: [1738, 1058], solid: [[1690, 994, 96, 42]] },
    { kind: 'bench', x: 700, y: 950, w: 96, h: 30, solid: [[700, 958, 96, 22]], seats: [[724, 990], [772, 990]] },
    { kind: 'bench', x: 1444, y: 950, w: 96, h: 30, solid: [[1444, 958, 96, 22]], seats: [[1468, 990], [1516, 990]] },
    ...[0, 1, 2, 3].map(i => ({ kind: 'pinball', i, x: 48 + i * 82, y: 1080, w: 58, h: 104, npcSpot: [77 + i * 82, 1202], spot: [77 + i * 82, 1202], solid: [[48 + i * 82, 1140, 58, 44]], c: ['#b86bff', '#3dd6ff', '#ffb84d', '#3dff8f'][i], name: ['COSMIC METEOR', 'DEEP SEA DIVE', 'GOLD FEVER', 'TIKI TEMPLE'][i], theme: ['space', 'sea', 'gold', 'tiki'][i] })),
    ...[0, 1, 2].map(i => ({ kind: 'skee', i, x: 1870 + i * 80, y: 880, w: 64, h: 200, npcSpot: [1902 + i * 80, 1100], spot: [1902 + i * 80, 1100], solid: [[1870 + i * 80, 920, 64, 160]] })),
    { kind: 'hockey', x: 1700, y: 1150, w: 74, h: 112, spot: [1737, 1278], solid: [[1700, 1166, 74, 96]] },
    { kind: 'golf', x: 1296, y: 1100, w: 270, h: 150, spot: [1431, 1276], solid: [[1296, 1110, 270, 140]] },
    { kind: 'wheel', x: 1060, y: 868, w: 130, h: 150, spot: [1125, 1044], solid: [[1080, 990, 90, 28]] },
    { kind: 'hoops', x: 1836, y: 1128, w: 74, h: 124, spot: [1873, 1274], solid: [[1836, 1206, 74, 46]] },
    { kind: 'bop', x: 1954, y: 1150, w: 80, h: 100, spot: [1994, 1274], solid: [[1954, 1204, 80, 46]] },
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
    const dance = by(DANCE); if (dance) addCab(dance, 'dance', 860, 1100);
    const rest = games.filter(g => !RACERS.includes(g.slug) && !GUNS.includes(g.slug) && g.slug !== TABLE && g.slug !== DANCE), slots = [];
    for (let i = 0; i < 10; i++) slots.push([618 + i * 102, 116]);
    for (let i = 0; i < 5; i++) slots.push([640 + i * 94, 400]);
    for (let i = 0; i < 4; i++) slots.push([1244 + i * 94, 400]);
    slots.push([680, 1110], [762, 1110]); // the newest cabinets, by the entrance
    for (let i = 0; i < 5; i++) slots.push([60 + i * 98, 400]); // and below the raceway, if the arcade grows
    slots.push([2012, 116], [2110, 116], [1712, 400], [1806, 400], [1950, 400], [2044, 400]); // then the far end of the shooting gallery
    rest.forEach((g, i) => { if (i < slots.length) addCab(g, 'upright', ...slots[i]); }); // the rest go upstairs to the Loft
    loftGames = rest.slice(slots.length);
    FIXED.forEach(o => objs.push({ ...o, base: o.y + o.h }));
  }
  /*
   * The VIP room, east of the shooting gallery and the prize corner, through a roped door (VIP in shared/badges.js
   * says when it opens). Inside: the Hall of Masters (a gold cabinet for each game you've mastered, empty plinths
   * for the rest), the VIP prize counter, your records wall, a golden soda bar, velvet sofas and VIP regulars.
   */
  const VIPX = 2248, DOOR = { y0: 606, y1: 704 };
  const VWALL = [[2232, WALL, 16, DOOR.y0 - WALL], [2232, DOOR.y1, 16, GH - DOOR.y1]];
  let vipOpen = false, vipNew = false;
  function layoutVip() {
    objs = objs.filter(o => !o.vip); cabs = cabs.filter(c => !c.vip);
    vipOpen = !!(window.VIP && VIP.unlocked());
    objs.push({ kind: 'vipdoor', vip: true, x: 2224, y: DOOR.y0 - 6, w: 32, h: DOOR.y1 - DOOR.y0 + 12, base: DOOR.y1 + 6, spot: [2192, 650], solid: vipOpen ? [] : [[2228, DOOR.y0, 24, DOOR.y1 - DOOR.y0]] });
    const masters = cabs.filter(c => mastered.has(c.g.slug));
    for (let i = 0; i < 12; i++) {
      const x = 2276 + (i % 6) * 98, y = i < 6 ? 112 : 392;
      if (masters[i]) { const before = cabs.length; addCab(masters[i].g, 'upright', x, y); const c = cabs[before]; c.vip = true; c.hall = true; }
      else objs.push({ kind: 'plinth', vip: true, x, y: y + 40, w: 60, h: 64, base: y + 104, solid: [[x, y + 62, 60, 42]] });
    }
    objs.push(
      { kind: 'vipcounter', vip: true, x: 2440, y: 690, w: 240, h: 72, spot: [2560, 786], solid: [[2440, 714, 240, 48]] },
      { kind: 'records', vip: true, x: 2280, y: 960, w: 190, h: 140, spot: [2375, 1124], solid: [[2284, 1080, 182, 20]] },
      { kind: 'vipbar', vip: true, x: 2620, y: 1000, w: 220, h: 62, spot: [2730, 1086], solid: [[2620, 1022, 220, 40]] },
      { kind: 'sofa', vip: true, gold: true, x: 2300, y: 1210, w: 110, h: 44, solid: [[2300, 1222, 110, 32]], seats: [[2330, 1266], [2382, 1266]] },
      { kind: 'sofa', vip: true, gold: true, x: 2560, y: 1210, w: 110, h: 44, solid: [[2560, 1222, 110, 32]], seats: [[2590, 1266], [2642, 1266]] }
    );
    objs.forEach(o => { if (o.vip && o.base === undefined) o.base = o.y + o.h; });
  }
  /** Things you can walk up to and use. */
  const usable = () => objs.filter(o => o.spot);
  function buildSolids() {
    const all = objs.filter(o => o.kind !== 'decor' && (o.kind !== 'plant' || o.fixed));
    if (!level) for (const k of Object.keys(DECOR)) if (owns(k)) all.push({ kind: 'decor', id: k, ...DECOR[k], base: DECOR[k].y + DECOR[k].h, solid: [[DECOR[k].x, DECOR[k].y + DECOR[k].h * 0.55, DECOR[k].w, DECOR[k].h * 0.45]] });
    if (!level && owns('plants')) PLANTS.forEach(([px, py]) => all.push({ kind: 'plant', x: px, y: py, w: 26, h: 44, base: py + 44, solid: [[px + 4, py + 30, 18, 14]] }));
    objs = all;
    solids = [...objs.flatMap(o => o.solid || []), ...(level ? [] : VWALL)].map(([x, y, w, h]) => ({ x, y, w, h }));
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
    if (kind === 'starfield') {
      if (!glow) { const g = x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#060418'); g.addColorStop(1, '#120a30'); x.fillStyle = g; x.fillRect(0, y0, w, h); }
      for (let i = 0; i < w * h / 900; i++) { const px = r() * w, py = y0 + r() * h, big = r() < 0.12; x.fillStyle = big ? (glow ? '#fff6c2' : '#ffd23d') : glow ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.55)'; x.fillRect(px, py, big ? 2 : 1, big ? 2 : 1); }
      if (!glow) for (let i = 0; i < w * h / 160000; i++) { const px = r() * w, py = y0 + r() * h, rr = 30 + r() * 50, g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, ['rgba(180,100,255,.25)', 'rgba(80,180,255,.2)', 'rgba(255,100,200,.2)'][i % 3]); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); }
      return;
    }
    if (kind === 'racetrack') {
      if (glow) { x.fillStyle = 'rgba(255,255,255,.5)'; for (let j = 60; j < h; j += 160) for (let i = 0; i < w; i += 40) x.fillRect(i, y0 + j, 20, 3); return; }
      x.fillStyle = '#2a2a32'; x.fillRect(0, y0, w, h);
      for (let i = 0; i < w * h / 60; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.08)'; x.fillRect(r() * w, y0 + r() * h, 2, 2); }
      for (let j = 0; j < h; j += 160) { for (let i = 0; i < w; i += 24) { x.fillStyle = (i / 24) % 2 ? '#c8203a' : '#f4effd'; x.fillRect(i, y0 + j, 24, 10); } x.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < w; i += 40) x.fillRect(i, y0 + j + 60, 20, 3); }
      return;
    }
    if (kind === 'synthwave') {
      if (!glow) { const g = x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#1a0630'); g.addColorStop(1, '#3a0a4a'); x.fillStyle = g; x.fillRect(0, y0, w, h); }
      x.strokeStyle = glow ? 'rgba(255,79,163,.8)' : 'rgba(255,79,163,.55)'; x.lineWidth = 1.5;
      for (let i = 0; i <= w; i += 40) { x.beginPath(); x.moveTo(i + .5, y0); x.lineTo(i + .5, y0 + h); x.stroke(); }
      for (let j = 0; j <= h; j += 40) { x.beginPath(); x.moveTo(0, y0 + j + .5); x.lineTo(w, y0 + j + .5); x.stroke(); }
      if (!glow) for (let k = 0; k < Math.max(1, w / 900); k++) { const cx = 300 + k * 900, cy = y0 + 200 + (k % 2) * 500, R = 70; const sg = x.createLinearGradient(0, cy - R, 0, cy + R); sg.addColorStop(0, '#ffd23d'); sg.addColorStop(1, '#ff4fa3'); x.fillStyle = sg; x.beginPath(); x.arc(cx, cy, R, 0, 6.29); x.fill(); x.fillStyle = '#1a0630'; for (let s2 = 0; s2 < 5; s2++) x.fillRect(cx - R, cy + 10 + s2 * 12, R * 2, 3 + s2); }
      return;
    }
    if (kind === 'aurora') {
      if (!glow) { x.fillStyle = '#040c18'; x.fillRect(0, y0, w, h); }
      for (let band = 0; band < Math.ceil(h / 220); band++) { const by = y0 + Math.min(110, h * 0.25) + band * 220; [['#3dff8f', 0], ['#5ee7ff', 22], ['#b86bff', 44]].forEach(([c, off]) => { x.strokeStyle = c; x.globalAlpha = glow ? 0.6 : 0.3; x.lineWidth = 14; x.beginPath(); for (let i = 0; i <= w; i += 20) { const yy = by + off + Math.sin(i / 90 + band) * 24 + Math.sin(i / 37) * 6; i ? x.lineTo(i, yy) : x.moveTo(i, yy); } x.stroke(); }); }
      x.globalAlpha = 1; return;
    }
    if (kind === 'velvet') {
      if (!glow) { x.fillStyle = '#3a0812'; x.fillRect(0, y0, w, h); }
      x.strokeStyle = glow ? 'rgba(255,210,61,.45)' : 'rgba(255,210,61,.35)'; x.lineWidth = 1.5;
      for (let j = 0; j < h; j += 36) for (let i = 0; i < w; i += 36) { x.beginPath(); x.moveTo(i + 18, y0 + j + 4); x.lineTo(i + 32, y0 + j + 18); x.lineTo(i + 18, y0 + j + 32); x.lineTo(i + 4, y0 + j + 18); x.closePath(); x.stroke(); }
      return;
    }
    if (kind === 'circuit') { // Arcade Pass: a green board with gold traces
      if (!glow) { x.fillStyle = '#062a18'; x.fillRect(0, y0, w, h); }
      x.strokeStyle = glow ? 'rgba(255,220,90,.75)' : '#c8a040'; x.lineWidth = 2;
      for (let i = 0; i < w * h / 7000; i++) {
        let px = Math.round(r() * w / 16) * 16, py = y0 + Math.round(r() * h / 16) * 16; x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 4; k++) { const d = r() < 0.5, l = (2 + Math.floor(r() * 5)) * 16; if (d) px += r() < 0.5 ? l : -l; else py += r() < 0.5 ? l : -l; x.lineTo(px, py); }
        x.stroke(); x.fillStyle = glow ? 'rgba(255,240,160,.9)' : '#e8c860'; x.fillRect(px - 3, py - 3, 6, 6);
      }
      if (!glow) for (let i = 0; i < w * h / 40000; i++) { const px = r() * w, py = y0 + r() * h; x.fillStyle = '#16161e'; x.fillRect(px, py, 28, 18); x.fillStyle = '#8a8ea0'; for (let k = 0; k < 4; k++) { x.fillRect(px + 3 + k * 7, py - 3, 2, 3); x.fillRect(px + 3 + k * 7, py + 18, 2, 3); } }
      return;
    }
    if (kind === 'dancefloor') { // Arcade Pass: lit squares
      const C = ['#ff4fd1', '#22e0ff', '#ffd23d', '#3dff8f', '#8a3dff'];
      for (let j = 0; j < h; j += 40) for (let i = 0; i < w; i += 40) { const c = C[(i / 40 * 3 + j / 40 * 7) % 5]; if (glow) { if ((i / 40 + j / 40) % 3) continue; x.fillStyle = c; x.globalAlpha = 0.55; x.fillRect(i + 4, y0 + j + 4, 32, 32); x.globalAlpha = 1; } else { x.fillStyle = '#100a1c'; x.fillRect(i, y0 + j, 40, 40); x.fillStyle = c; x.globalAlpha = 0.45; x.fillRect(i + 3, y0 + j + 3, 34, 34); x.globalAlpha = 1; } }
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
    // the default: a dark arcade carpet, a ring, a plus, a triangle and a zigzag to each 96-unit tile (they glow under the blacklights)
    if (!glow) { x.fillStyle = 'rgba(255,255,255,.025)'; for (let j = 0; j < h; j += 12) for (let i = (j / 12) % 2 * 6; i < w; i += 12) x.fillRect(i, y0 + j, 1, 1); }
    x.lineWidth = 2; x.lineCap = 'round'; x.lineJoin = 'round';
    for (let j = 0; j < h; j += 96) for (let i = 0; i < w; i += 96) {
      const X = i, Y = y0 + j; x.globalAlpha = glow ? 0.2 : 0.2;
      x.strokeStyle = '#ff4fa3'; x.beginPath(); x.arc(X + 22, Y + 24, 4, 0, 6.29); x.stroke();
      x.strokeStyle = '#22e0ff'; x.beginPath(); x.moveTo(X + 72, Y + 18); x.lineTo(X + 72, Y + 28); x.moveTo(X + 67, Y + 23); x.lineTo(X + 77, Y + 23); x.stroke();
      x.strokeStyle = '#ffd23d'; x.beginPath(); x.moveTo(X + 18, Y + 78); x.lineTo(X + 28, Y + 78); x.lineTo(X + 23, Y + 70); x.closePath(); x.stroke();
      x.strokeStyle = '#7a5cff'; x.beginPath(); x.moveTo(X + 62, Y + 76); for (let k = 1; k <= 3; k++) x.lineTo(X + 62 + k * 5, Y + 76 + (k % 2 ? -4 : 0)); x.stroke();
    }
    x.globalAlpha = 1; x.lineCap = 'butt'; x.lineJoin = 'miter';
  }
  function neon(x, text, cx, cy, size, c) {
    x.font = `${size}px Bungee, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = c; x.shadowBlur = 18; x.fillStyle = c; x.fillText(text, cx, cy); x.shadowBlur = 6; x.fillStyle = '#fff'; x.globalAlpha = 0.7; x.fillText(text, cx, cy);
    x.globalAlpha = 1; x.shadowBlur = 0;
  }
  const WALL_SIGNS = [['BITCADE', 1120, 56, 40, '#ff4fa3'], ['RACEWAY', 290, 56, 28, '#ff7a3d'], ['SHOOTING GALLERY', 1950, 50, 22, '#7dd63d'], ['VIP ROOM', 2560, 46, 30, '#ffd23d']];
  function background() {
    if (level) return loftBackground();
    const eq = equip(), key = (eq.carpet || '') + (owns('sign') ? 's' : '');
    if (bg && key === bgKey) return;
    bgKey = key;
    bg = document.createElement('canvas'); bg.width = WW; bg.height = WH; const x = bg.getContext('2d');
    glowBg = document.createElement('canvas'); glowBg.width = WW; glowBg.height = WH; const gx = glowBg.getContext('2d');
    carpet(x, eq.carpet, WW, WH - WALL, WALL); carpet(gx, eq.carpet, WW, WH - WALL, WALL, true);
    // zone floors: asphalt in the raceway, diamond plate in the shooting gallery, a polished tile apron at the doors
    x.fillStyle = '#17161e'; x.fillRect(16, WALL, 564, 548 - WALL); gx.clearRect(16, WALL, 564, 548 - WALL);
    { let s2 = 11; const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 5200; i++) { x.fillStyle = r2() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.25)'; x.fillRect(16 + r2() * 564, WALL + r2() * (548 - WALL), 2, 2); } }
    for (let i = 40; i < 570; i += 46) { x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(i, 372, 24, 3); }
    x.fillStyle = '#14181a'; x.fillRect(1660, WALL, 572, 548 - WALL); gx.clearRect(1660, WALL, 572, 548 - WALL);
    for (let j = WALL + 6; j < 548; j += 18) for (let i = 1664 + ((j / 18) % 2) * 9; i < 2228; i += 18) { x.fillStyle = 'rgba(160,180,170,.12)'; x.fillRect(i, j, 6, 2); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(i, j + 2, 6, 1); }
    for (let j = WH - 150; j < WH - 24; j += 32) for (let i = 900; i < 1340; i += 32) { x.fillStyle = ((i + j) / 32) % 2 ? '#120e1e' : '#0c0916'; x.fillRect(i, j, 32, 32); x.fillStyle = 'rgba(94,231,255,.05)'; x.fillRect(i, j, 32, 1); }
    // the main aisle: a dark walkway right across the floor, with neon edges and lane dashes
    x.fillStyle = OUT; x.fillRect(16, 546, 2216, 58); x.fillStyle = '#0d0918'; x.fillRect(16, 549, 2216, 52); gx.clearRect(16, 546, 2216, 58);
    [x, gx].forEach(c => { c.fillStyle = 'rgba(255,79,163,.55)'; c.fillRect(16, 549, 2216, 2); c.fillStyle = 'rgba(94,231,255,.55)'; c.fillRect(16, 598, 2216, 2); });
    x.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 40; i < 2232; i += 60) x.fillRect(i, 574, 26, 2);
    // the way to the Loft: green chevrons from the doors to the escalator
    { const a0 = [1070, 1170], a1 = [850, 870], n = 8, rot = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
      for (let k = 0; k < n; k++) { const ax = a0[0] + (a1[0] - a0[0]) * k / (n - 1), ay = a0[1] + (a1[1] - a0[1]) * k / (n - 1); [x, gx].forEach(c => { c.save(); c.translate(ax, ay); c.rotate(rot); c.fillStyle = 'rgba(61,255,143,.45)'; c.beginPath(); c.moveTo(8, 0); c.lineTo(-6, -8); c.lineTo(-2, 0); c.lineTo(-6, 8); c.closePath(); c.fill(); c.restore(); }); } }
    x.font = '12px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = 'rgba(61,255,143,.6)'; x.fillText('▲ THE LOFT', 950, 880); gx.font = x.font; gx.textAlign = 'center'; gx.fillStyle = 'rgba(61,255,143,.8)'; gx.fillText('▲ THE LOFT', 950, 880);
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
    wallDepth(x, gx, 0, VIPX);
    SPOTS.forEach(([sx]) => { x.fillStyle = OUT; x.fillRect(sx - 10, 12, 20, 18); x.fillStyle = '#3a3450'; x.fillRect(sx - 8, 14, 16, 12); x.fillStyle = '#5a5470'; x.fillRect(sx - 8, 14, 16, 3); [x, gx].forEach(c => { c.fillStyle = '#fff6d8'; c.fillRect(sx - 5, 26, 10, 3); }); });
    WALL_SIGNS.forEach(([t, cx, cy, sz, c]) => neon(x, t, cx, cy, sz, c));
    if (owns('sign')) { neon(x, 'GAME ON', 760, 54, 20, '#22e0ff'); neon(x, 'HI-SCORE', 1480, 54, 20, '#ffd23d'); }
    // chequered flags by the raceway sign, the shooting gallery's target rail
    [[110, 36], [438, 36]].forEach(([fx, fy]) => { x.fillStyle = OUT; x.fillRect(fx - 2, fy - 2, 46, 34); for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#111'; x.fillRect(fx + i * 7, fy + j * 7.5, 7, 7.5); } });
    x.fillStyle = OUT; x.fillRect(1700, 96, 500, 6); x.fillStyle = '#c0c6d0'; x.fillRect(1700, 97, 500, 3);
    // side and front walls, the glass doors
    // the VIP room: black and gold diamonds, a gold-trimmed wall, the wall between with its doorway
    x.fillStyle = '#0c0812'; x.fillRect(VIPX, WALL, WW - VIPX, WH - WALL); gx.clearRect(VIPX, WALL, WW - VIPX, WH - WALL);
    for (let j = WALL; j < WH; j += 40) for (let i = VIPX; i < WW; i += 40) { const k = ((i - VIPX) / 40 + (j - WALL) / 40) % 2; x.fillStyle = k ? '#16101e' : '#0c0812'; x.beginPath(); x.moveTo(i + 20, j); x.lineTo(i + 40, j + 20); x.lineTo(i + 20, j + 40); x.lineTo(i, j + 20); x.fill(); }
    gx.strokeStyle = 'rgba(255,210,61,.16)'; x.strokeStyle = 'rgba(255,210,61,.09)'; [x, gx].forEach(c => { c.save(); c.beginPath(); c.rect(VIPX, WALL, WW - VIPX, WH - WALL); c.clip(); c.lineWidth = 1; for (let i = VIPX; i < WW + WH; i += 80) { c.beginPath(); c.moveTo(i, WALL); c.lineTo(i - (WH - WALL), WH); c.stroke(); } c.restore(); });
    x.save(); x.beginPath(); x.rect(VIPX, 0, WW - VIPX, WH); x.clip();
    const vg = x.createLinearGradient(0, 0, 0, WALL); vg.addColorStop(0, '#120a06'); vg.addColorStop(1, '#2a1a0a'); x.fillStyle = vg; x.fillRect(VIPX, 0, WW - VIPX, WALL);
    x.fillStyle = 'rgba(255,210,61,.08)'; for (let i = VIPX; i < WW; i += 64) x.fillRect(i, 0, 3, WALL);
    x.fillStyle = '#ffd23d'; x.fillRect(VIPX, WALL - 3, WW - VIPX, 2); neon(x, 'VIP ROOM', 2560, 46, 30, '#ffd23d'); x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#c8a050'; x.fillText('★ HALL OF MASTERS ★', 2560, 84);
    x.restore();
    for (const [wx, wy, ww, wh] of VWALL) { x.fillStyle = OUT; x.fillRect(wx - 2, wy, ww + 4, wh); x.fillStyle = '#2a1a0a'; x.fillRect(wx, wy, ww, wh); x.fillStyle = '#ffd23d'; x.fillRect(wx + ww / 2 - 1, wy, 2, wh); gx.fillStyle = '#ffd23d'; gx.fillRect(wx + ww / 2 - 1, wy, 2, wh); }
    x.fillStyle = '#0c0920'; x.fillRect(0, WALL, 16, WH - WALL); x.fillRect(WW - 16, WALL, 16, WH - WALL);
    x.fillStyle = '#0c0920'; x.fillRect(0, WH - 24, WW, 24); x.fillStyle = '#ff4fa3'; x.fillRect(0, WH - 25, WW, 2); gx.fillStyle = '#ff4fa3'; gx.fillRect(0, WH - 25, WW, 2);
    floorShade(x, 0, WW);
    x.fillStyle = OUT; x.fillRect(1052, WH - 26, 136, 26); x.fillStyle = 'rgba(94,231,255,.35)'; x.fillRect(1056, WH - 22, 62, 22); x.fillRect(1122, WH - 22, 62, 22);
    x.fillStyle = '#c0c6d0'; x.fillRect(1112, WH - 18, 3, 12); x.fillRect(1125, WH - 18, 3, 12);
  }


  /*
   * The Loft, upstairs: a second floor with its own objects, people and background, swapped in when you ride the
   * escalator in the entrance hall (`level` 1). New Arrivals (the cabinets that don't fit downstairs, so the newest)
   * and the Sky Deck (windows over Neon City, telescopes, sofas, and Ticket Tide, the coin pusher).
   */
  const LOFT = { w: 1920, h: 1180 };
  const LOFT_ZONES = [{ name: 'NEW ARRIVALS', x: 0, y: 0, w: 1120, h: LOFT.h, c: '#3dff8f' }, { name: 'SKY DECK', x: 1120, y: 0, w: LOFT.w - 1120, h: LOFT.h, c: '#5ee7ff' }];
  const LOFT_SLOTS = [...Array.from({ length: 8 }, (_, i) => [120 + i * 110, 430]), /* the row along the runner first */ ...Array.from({ length: 10 }, (_, i) => [70 + i * 96, 116]), ...Array.from({ length: 6 }, (_, i) => [380 + i * 110, 720])];
  const LOFT_LAMPS = [[300, 360], [760, 360], [300, 700], [760, 700], [560, 1000], [1300, 420], [1700, 420], [1500, 620], [1300, 900], [1700, 900], [1820, 640]];
  const zones = () => level ? LOFT_ZONES : ZONES;
  let loftGames = [];
  const saved = [null, { objs: [], cabs: [], solids: [], blocked: null, bg: null, glowBg: null, bgKey: null, people: [] }];
  /** Swap the floor in play: everything that belongs to one floor is put away and the other's comes out. */
  function swap(to) {
    if (to === level) return;
    saved[level] = { objs, cabs, solids, blocked, bg, glowBg, bgKey, people: npcs.splice(0) };
    const s = saved[to]; level = to;
    objs = s.objs; cabs = s.cabs; solids = s.solids; blocked = s.blocked; bg = s.bg; glowBg = s.glowBg; bgKey = s.bgKey; npcs.push(...s.people);
    WW = to ? LOFT.w : GW; WH = to ? LOFT.h : GH; MAP.h = MAP.w * WH / WW;
    near = null; shownNear = undefined; route = []; arriveAct = null;
  }
  function layoutLoft() {
    swap(1); objs = []; cabs = [];
    loftGames.forEach((g, i) => addCab(g, 'upright', ...LOFT_SLOTS[Math.min(i, LOFT_SLOTS.length - 1)]));
    objs.push(
      { kind: 'stairs', down: true, x: 120, y: 930, w: 160, h: 150, spot: [200, 1112], solid: [[120, 990, 160, 90]] },
      { kind: 'pusher', x: 1250, y: 560, w: 120, h: 150, spot: [1310, 730], npcSpot: [1310, 730], solid: [[1250, 650, 120, 60]] },
      { kind: 'scope', x: 1440, y: 196, w: 34, h: 64, spot: [1457, 284], solid: [[1444, 238, 26, 22]] },
      { kind: 'scope', x: 1760, y: 196, w: 34, h: 64, spot: [1777, 284], solid: [[1764, 238, 26, 22]] },
      { kind: 'sofa', x: 1480, y: 820, w: 110, h: 44, solid: [[1480, 832, 110, 32]], seats: [[1510, 876], [1562, 876]] },
      { kind: 'sofa', x: 1700, y: 820, w: 110, h: 44, solid: [[1700, 832, 110, 32]], seats: [[1730, 876], [1782, 876]] },
      { kind: 'beanbag', x: 1560, y: 1040, w: 40, h: 30, solid: [[1562, 1052, 36, 18]], seats: [[1580, 1078]] },
      ...[[1150, 1090], [1860, 1090], [40, 560], [1080, 560], [1150, 300], [1880, 400]].map(([px, py]) => ({ kind: 'plant', fixed: true, x: px, y: py, w: 26, h: 44, solid: [[px + 4, py + 30, 18, 14]] })));
    objs.forEach(o => { if (o.base === undefined) o.base = o.y + o.h; });
    buildSolids(); spawnLoftPeople(); swap(0);
  }
  function spawnLoftPeople() {
    for (let i = 0; i < 6; i++) {
      const z = pick(LOFT_ZONES); let px, py, k = 0;
      do { px = rnd(z.x + 40, z.x + z.w - 40); py = rnd(WALL + 60, z.y + z.h - 60); } while (hit(px, py) && k++ < 40);
      npcs.push({ loft: true, x: px, y: py, dir: 'down', walk: 0, moving: false, look: randomLook(), path: [], act: null, t: rnd(0, 3), pose: '', bubble: null, greetT: 0, speed: rnd(80, 110) });
    }
  }
  /** Ride the escalator: fade out, swap floors, arrive at the other end. */
  function ride(o) {
    if (me.ride) return; me.ride = { t: 0, to: o.down ? 0 : 1, done: false }; route = []; me.vx = me.vy = 0; keys.clear();
    if (play) play.sound.zone();
  }
  function goLevel(to) {
    swap(to); buildSolids();
    const s = objs.find(o => o.kind === 'stairs');
    me.x = s.spot[0]; me.y = s.spot[1]; me.dir = 'down'; pet.x = me.x + 20; pet.y = me.y; trail.length = 0; puffs.length = 0;
    zoneName = ''; if (running) snapCamera(); showCard();
  }
  function loftBackground() {
    const eq = equip(), key = 'loft' + (eq.carpet || '');
    if (bg && key === bgKey) return;
    bgKey = key;
    bg = document.createElement('canvas'); bg.width = WW; bg.height = WH; const x = bg.getContext('2d');
    glowBg = document.createElement('canvas'); glowBg.width = WW; glowBg.height = WH; const gx = glowBg.getContext('2d');
    carpet(x, eq.carpet, WW, WH - WALL, WALL); carpet(gx, eq.carpet, WW, WH - WALL, WALL, true);
    // the sky deck: dark wooden boards, a glowing edge
    x.fillStyle = '#1c1426'; x.fillRect(1120, WALL, WW - 1120, WH - WALL); gx.clearRect(1120, WALL, WW - 1120, WH - WALL);
    for (let y = WALL; y < WH; y += 22) { x.fillStyle = '#261c32'; x.fillRect(1120, y, WW - 1120, 2); for (let i = 1120 + ((y / 22) % 3) * 70; i < WW; i += 210) { x.fillStyle = '#140e1c'; x.fillRect(i, y, 2, 22); } }
    [x, gx].forEach(c => { c.fillStyle = '#5ee7ff'; c.fillRect(1118, WALL, 3, WH - WALL); });
    // the new arrivals runner, with green neon edges
    x.fillStyle = OUT; x.fillRect(46, 560, 1028, 120); x.fillStyle = '#12301e'; x.fillRect(50, 564, 1020, 112);
    [x, gx].forEach(c => { c.strokeStyle = '#3dff8f'; c.lineWidth = 2; c.strokeRect(58, 572, 1004, 96); });
    for (let i = 90; i < 1060; i += 60) { x.fillStyle = 'rgba(61,255,143,.35)'; x.beginPath(); x.moveTo(i, 608); x.lineTo(i + 18, 620); x.lineTo(i, 632); x.fill(); }
    // the back wall: panels and rail like downstairs, signs, and the big windows over the city
    const wg = x.createLinearGradient(0, 0, 0, WALL); wg.addColorStop(0, '#0e0a20'); wg.addColorStop(1, '#221a44'); x.fillStyle = wg; x.fillRect(0, 0, WW, WALL);
    x.fillStyle = 'rgba(255,255,255,.035)'; for (let i = 0; i < 1120; i += 48) x.fillRect(i, 0, 2, WALL);
    for (const [wx, ww] of [[1140, 230], [1400, 230], [1660, 240]]) {
      const sky = x.createLinearGradient(0, 14, 0, 150); sky.addColorStop(0, '#05041a'); sky.addColorStop(1, '#2a1650'); x.fillStyle = OUT; x.fillRect(wx - 4, 10, ww + 8, 148); x.fillStyle = sky; x.fillRect(wx, 14, ww, 140);
      for (let k = 0; k < 26; k++) { x.fillStyle = `rgba(255,255,255,${0.3 + (k % 3) * 0.25})`; x.fillRect(wx + (k * 53 + wx) % ww, 18 + (k * 29) % 70, 1 + (k % 4 === 0), 1 + (k % 4 === 0)); }
      for (let b = 0; b < 9; b++) { // the skyline, lit windows and all
        const bw = 18 + (b * 13 + wx) % 22, bh = 30 + (b * 37 + wx) % 70, bx = wx + b * (ww / 9), by = 154 - bh;
        x.fillStyle = '#0c0a1e'; x.fillRect(bx, by, bw, bh);
        for (let j = by + 5; j < 150; j += 8) for (let i = bx + 3; i < bx + bw - 3; i += 6) if (((i * 7 + j * 3 + b) % 5) < 2) { x.fillStyle = ['#ffd23d', '#5ee7ff', '#ff4fa3'][(i + j) % 3]; x.fillRect(i, j, 2, 3); gx.fillStyle = 'rgba(255,210,61,.5)'; gx.fillRect(i, j, 2, 3); }
      }
      x.fillStyle = OUT; x.fillRect(wx + ww / 2 - 2, 14, 4, 140); x.fillRect(wx, 82, ww, 4);
      [x, gx].forEach(c => { c.strokeStyle = '#5ee7ff'; c.lineWidth = 2; c.strokeRect(wx - 2, 12, ww + 4, 144); });
    }
    x.fillStyle = '#fff6d8'; x.beginPath(); x.arc(1820, 44, 16, 0, 6.29); x.fill(); x.fillStyle = '#2a1650'; x.beginPath(); x.arc(1828, 40, 14, 0, 6.29); x.fill(); // a crescent moon
    x.fillStyle = OUT; x.fillRect(0, WALL - 4, WW, 6); [x, gx].forEach(c => { c.fillStyle = '#3dff8f'; c.fillRect(0, WALL - 3, 1120, 2); c.fillStyle = '#5ee7ff'; c.fillRect(1120, WALL - 3, WW - 1120, 2); });
    wallDepth(x, gx, 0, 1120, '#3dff8f'); floorShade(x, 0, WW);
    x.font = '12px Silkscreen, monospace'; x.textAlign = 'center'; [x, gx].forEach(c => { c.fillStyle = 'rgba(61,255,143,.6)'; c.font = x.font; c.textAlign = 'center'; c.fillText('▼ GROUND FLOOR', 200, 900); });
    neon(x, 'THE LOFT', 560, 52, 38, '#3dff8f'); x.font = '12px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#8affb8'; x.fillText('★ NEW ARRIVALS ★', 560, 92);
    x.fillStyle = '#0c0920'; x.fillRect(0, WALL, 16, WH - WALL); x.fillRect(WW - 16, WALL, 16, WH - WALL);
    x.fillStyle = '#0c0920'; x.fillRect(0, WH - 24, WW, 24); [x, gx].forEach(c => { c.fillStyle = '#3dff8f'; c.fillRect(0, WH - 25, WW, 2); });
  }
  /** The escalator: moving steps between glass rails, and a sign saying where it goes. */
  function drawStairs(x, t, o) {
    const { x: X, y: Y, w, h } = o, s = (t / 40) % 14;
    paint(x, [[X, Y + 50, w, h - 50, '#2a2440'], [X + 8, Y + 6, 18, h - 10, '#8a94a8'], [X + w - 26, Y + 6, 18, h - 10, '#8a94a8']]);
    x.save(); x.beginPath(); x.rect(X + 30, Y + 14, w - 60, h - 20); x.clip();
    x.fillStyle = '#3a3450'; x.fillRect(X + 30, Y + 14, w - 60, h - 20);
    for (let k = -1; k < 12; k++) { const yy = Y + 14 + k * 14 + (o.down ? s : 14 - s); x.fillStyle = '#5a5470'; x.fillRect(X + 30, yy, w - 60, 10); x.fillStyle = '#ffd23d'; x.fillRect(X + 30, yy, w - 60, 2); }
    x.restore();
    x.fillStyle = 'rgba(160,230,255,.25)'; x.fillRect(X + 26, Y + 6, 4, h - 10); x.fillRect(X + w - 30, Y + 6, 4, h - 10);
    x.fillStyle = '#3dff8f'; x.fillRect(X + 12, Y + 2, 10, 4); x.fillRect(X + w - 22, Y + 2, 10, 4);
    const label = o.down ? '▼ GROUND FLOOR' : '▲ THE LOFT', sw = 132;
    x.fillStyle = OUT; x.fillRect(X + w / 2 - sw / 2 - 2, Y - 34, sw + 4, 26); x.fillStyle = 'rgba(10,6,18,.92)'; x.fillRect(X + w / 2 - sw / 2, Y - 32, sw, 22);
    neon(x, label, X + w / 2, Y - 21, 12, '#3dff8f');
  }
  /** Ticket Tide on the floor: a glass case of coins under a chasing-light marquee. */
  function drawPusher(x, t, o) {
    const { x: X, y: Y, w, h } = o;
    paint(x, [[X, Y + 20, w, h - 20, '#5a2a8a'], [X + 10, Y + 34, w - 20, 60, '#1a2a4a'], [X + 6, Y + 100, w - 12, 12, '#c8a040'], [X + 14, Y + 116, w - 28, 26, '#3a1a5a']]);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) { x.fillStyle = (i + j) % 4 ? '#d8a83a' : '#ffe680'; x.beginPath(); x.arc(X + 18 + i * 10 + (j % 2) * 5, Y + 62 + j * 9, 4, 0, 6.29); x.fill(); }
    const px = Math.sin(t / 400) * 6; x.fillStyle = '#8a94a8'; x.fillRect(X + 12, Y + 36, w - 24, 14 + px); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(X + 14, Y + 36, 8, 56);
    x.fillStyle = OUT; x.fillRect(X + w / 2 - 12, Y + 122, 24, 6);
    paint(x, [[X - 4, Y, w + 8, 24, '#2a1a3e']]); neon(x, 'TICKET TIDE', X + w / 2, Y + 12, 11, '#ffd23d');
    for (let i = 0; i < 8; i++) { x.fillStyle = Math.floor(t / 120 + i) % 3 === 0 ? '#fff6c2' : '#7a5a2a'; x.fillRect(X + 4 + i * (w - 12) / 7, Y + 24, 4, 4); }
  }
  /** A coin-op telescope pointed at the windows. */
  function drawScope(x, t, o) {
    const { x: X, y: Y } = o;
    paint(x, [[X + 14, Y + 30, 6, 30, '#6a6a7a'], [X + 6, Y + 56, 22, 6, '#4a4a5a'], [X + 2, Y + 8, 30, 18, '#c8a040'], [X - 4, Y + 12, 8, 10, '#8a6a2a']]);
    x.fillStyle = '#9ad8ff'; x.fillRect(X + 28, Y + 12, 4, 10);
  }

  /** The back wall's depth: pillars with lit caps every so often, sconces between them, a darker lower panel with a trim line. */
  function wallDepth(x, gx, x0, x1, trim = '#ff4fa3') {
    x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(x0, WALL - 52, x1 - x0, 48);
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(x0, WALL - 53, x1 - x0, 1);
    for (let px = x0 + 180; px < x1 - 40; px += 360) {
      const g = x.createLinearGradient(px - 11, 0, px + 11, 0); g.addColorStop(0, '#1a1434'); g.addColorStop(0.5, '#2e2656'); g.addColorStop(1, '#141028');
      x.fillStyle = OUT; x.fillRect(px - 13, 0, 26, WALL - 2); x.fillStyle = g; x.fillRect(px - 11, 0, 22, WALL - 4);
      x.fillStyle = '#3a3268'; x.fillRect(px - 14, WALL - 14, 28, 10); x.fillStyle = trim; x.fillRect(px - 11, 10, 22, 2); gx.fillStyle = trim; gx.fillRect(px - 11, 10, 22, 2);
      const sx = px + 180; if (sx > x1 - 30) continue; // a sconce washing light up the wall
      x.fillStyle = OUT; x.fillRect(sx - 7, 94, 14, 10); x.fillStyle = '#c0c6d0'; x.fillRect(sx - 5, 96, 10, 6);
      [x, gx].forEach(c => { const w = c.createRadialGradient(sx, 92, 0, sx, 92, 46); w.addColorStop(0, 'rgba(255,230,190,.35)'); w.addColorStop(1, 'rgba(255,230,190,0)'); c.fillStyle = w; c.fillRect(sx - 46, 46, 92, 60); });
    }
  }
  /** Soft shadow where the floor meets the walls, so the room has corners. */
  function floorShade(x, x0, x1) {
    let g = x.createLinearGradient(0, WALL, 0, WALL + 34); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(x0, WALL, x1 - x0, 34);
    g = x.createLinearGradient(0, WH - 58, 0, WH - 24); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)'); x.fillStyle = g; x.fillRect(x0, WH - 58, x1 - x0, 34);
    g = x.createLinearGradient(16, 0, 46, 0); g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(16, WALL, 30, WH - WALL);
    g = x.createLinearGradient(x1 - 46, 0, x1 - 16, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)'); x.fillStyle = g; x.fillRect(x1 - 46, WALL, 30, WH - WALL);
  }


  /* ---------- atmosphere: spotlight beams (and now and then a light show), moonlight upstairs, haze, dust in the light ---------- */
  const SPOTS = [[700, '#ffe8c8'], [940, '#ff9ad8'], [1300, '#9ae8ff'], [1540, '#ffe8c8']];
  let discoT = 25, cheered = false;
  function beams(x, t, dt) {
    x.globalCompositeOperation = 'lighter';
    if (level) {
      for (const [wx, ww] of [[1140, 230], [1400, 230], [1660, 240]]) {
        if (!visible(wx + ww / 2, 380, 320)) continue;
        const g = x.createLinearGradient(0, 158, 0, 640); g.addColorStop(0, 'rgba(154,216,255,.12)'); g.addColorStop(1, 'rgba(154,216,255,0)');
        x.fillStyle = g; x.beginPath(); x.moveTo(wx, 158); x.lineTo(wx + ww, 158); x.lineTo(wx + ww + 150, 640); x.lineTo(wx + 150, 640); x.fill();
      }
    } else {
      discoT -= dt; const show = discoT < 0; if (discoT < -7) { discoT = rnd(45, 75); cheered = false; }
      SPOTS.forEach(([sx, c], i) => {
        const tx = sx + (show ? Math.sin(t / 380 + i * 1.7) * 280 : Math.sin(t / 3200 + i * 2.1) * 90), ty = 430 + Math.cos(t / 2600 + i) * 70;
        if (!visible(tx, ty, 300) && !visible(sx, 60, 200)) return;
        const col = show ? ['#ff4fd1', '#22e0ff', '#ffd23d', '#3dff8f'][(i + Math.floor(t / 400)) % 4] : c;
        const g = x.createLinearGradient(sx, 30, tx, ty); g.addColorStop(0, rgba(col, show ? 0.24 : 0.13)); g.addColorStop(1, rgba(col, show ? 0.07 : 0.025));
        x.fillStyle = g; x.beginPath(); x.moveTo(sx - 6, 30); x.lineTo(sx + 6, 30); x.lineTo(tx + 64, ty); x.lineTo(tx - 64, ty); x.fill();
        const p = x.createRadialGradient(tx, ty, 0, tx, ty, 74); p.addColorStop(0, rgba(col, show ? 0.32 : 0.15)); p.addColorStop(1, rgba(col, 0));
        x.fillStyle = p; x.beginPath(); x.ellipse(tx, ty, 74, 34, 0, 0, 6.29); x.fill();
      });
      if (show && !cheered) { cheered = true; if (play) play.sound.react(me.x, true); npcs.forEach(n => { if (!n.vip && Math.random() < 0.5 && !n.path.length) { n.pose = 'cheer'; setTimeout(() => { if (n.pose === 'cheer') n.pose = ''; }, 1600); } }); }
    }
    x.globalCompositeOperation = 'source-over';
  }
  const motes = Array.from({ length: 48 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6.28, s: 0.4 + Math.random() * 0.8 }));
  function dust(x, t) { // world space, over whatever's in view
    const vw = SW / zoom, vh = SH / zoom, m2 = (v, n) => ((v % n) + n) % n;
    for (const m of motes) {
      const px = cam.x + m2(m.x * vw + Math.sin(t / 2400 + m.p) * 16, vw), py = cam.y + m2(m.y * vh - t / 1000 * 5 * m.s, vh);
      x.fillStyle = `rgba(255,240,220,${0.14 + 0.16 * Math.sin(t / 700 + m.p)})`; x.fillRect(px, py, 0.7 + m.s, 0.7 + m.s);
    }
  }
  let hazeCv = null;
  function haze(x, t) { // screen space: soft lilac clouds drifting slower than the floor
    if (!hazeCv) {
      hazeCv = document.createElement('canvas'); hazeCv.width = hazeCv.height = 256; const h = hazeCv.getContext('2d');
      for (let i = 0; i < 16; i++) { const px = Math.random() * 256, py = Math.random() * 256, r = 40 + Math.random() * 70; for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { const g = h.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, 'rgba(190,170,255,.5)'); g.addColorStop(1, 'rgba(190,170,255,0)'); h.fillStyle = g; h.fillRect(px + ox - r, py + oy - r, r * 2, r * 2); } }
    }
    const S = 768, m2 = (v, n) => ((v % n) + n) % n, ox = -m2(cam.x * zoom * 0.4 + t / 50, S), oy = -m2(cam.y * zoom * 0.4 + t / 140, S);
    x.save(); x.globalAlpha = 0.05; x.globalCompositeOperation = 'lighter';
    for (let j = oy; j < SH; j += S) for (let i = ox; i < SW; i += S) x.drawImage(hazeCv, i, j, S, S);
    x.restore();
  }


  /** The archway over the doors: two posts, a lit bar, chasing bulbs. */
  function drawArch(x, t, o) {
    const X = o.x, Y = o.base, w = o.w + 10, top = Y - 150;
    x.save(); if (me.x > X - 24 && me.x < X + w + 24 && me.y < Y && me.y > top) x.globalAlpha = 0.4; // see-through while you're behind it
    for (const px of [X, X + w - 10]) { paint(x, [[px, top + 20, 10, Y - top - 20, '#3a3268']]); x.fillStyle = '#5ee7ff'; x.fillRect(px + 4, top + 30, 2, Y - top - 40); }
    paint(x, [[X - 8, top, w + 16, 28, '#140c24']]);
    x.strokeStyle = '#ff4fa3'; x.lineWidth = 2; x.strokeRect(X - 4, top + 4, w + 8, 20);
    neon(x, 'WELCOME TO BITCADE', X + w / 2, top + 14, 12, '#ff4fa3');
    for (let i = 0; i < 14; i++) { x.fillStyle = Math.floor(t / 140 + i) % 3 === 0 ? '#fff6c2' : '#6a4a2a'; x.fillRect(X - 6 + i * (w + 12) / 13, top - 4, 3, 3); }
    x.restore();
  }
  /** A stack of racing tyres. */
  function drawTyres(x, o) {
    for (let k = 0; k < 3; k++) { const y = o.y + o.h - 12 - k * 11; x.fillStyle = OUT; x.beginPath(); x.ellipse(o.x + o.w / 2, y, o.w / 2 + 1, 8, 0, 0, 6.29); x.fill(); x.fillStyle = '#26262e'; x.beginPath(); x.ellipse(o.x + o.w / 2, y, o.w / 2 - 1, 6, 0, 0, 6.29); x.fill(); x.fillStyle = k === 1 ? '#c8203a' : '#f4effd'; x.fillRect(o.x + 4, y - 1, o.w - 8, 2); }
    x.fillStyle = '#0a0a10'; x.beginPath(); x.ellipse(o.x + o.w / 2, o.y + o.h - 34, 7, 3, 0, 0, 6.29); x.fill();
  }
  /** A standing lamp with a warm shade. */
  function drawLamp(x, t, o) {
    const cx = o.x + o.w / 2;
    paint(x, [[cx - 2, o.y + 20, 4, o.h - 26, '#8a6a4a'], [cx - 8, o.y + o.h - 6, 16, 5, '#5a4a3a']]);
    x.fillStyle = OUT; x.beginPath(); x.moveTo(cx - 13, o.y + 24); x.lineTo(cx + 13, o.y + 24); x.lineTo(cx + 8, o.y + 2); x.lineTo(cx - 8, o.y + 2); x.fill();
    x.fillStyle = '#ffb870'; x.beginPath(); x.moveTo(cx - 11, o.y + 22); x.lineTo(cx + 11, o.y + 22); x.lineTo(cx + 7, o.y + 4); x.lineTo(cx - 7, o.y + 4); x.fill();
    x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(cx - 6, o.y + 6, 3, 14);
  }
  const cabStyle = slug => [...slug].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 3;

  /* ---------- Halloween (window.EVENT): pumpkins, cobwebs, bats and orange light, and five ghosts a day to find ---------- */
  const HW = () => !!(window.EVENT && EVENT.on('halloween'));
  // jack-o'-lanterns, per floor: by the doors, along the main aisle, along the back wall
  const PUMPKINS = [
    [[1008, 1262], [1232, 1262], [200, 540], [620, 612], [1000, 540], [1420, 612], [1840, 540], [2180, 612], [70, 196], [700, 196], [1540, 196], [2190, 196]],
    [[300, 196], [700, 196], [1100, 196], [1500, 196], [1880, 196], [120, 1120]]
  ];
  function drawPumpkin(x, px, py, t, i) {
    if (!visible(px, py, 40)) return;
    const fl = 0.7 + 0.3 * Math.sin(t / 90 + i * 1.7) * Math.sin(t / 53 + i);
    x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(px, py, 12, 4, 0, 0, 6.29); x.fill();
    x.fillStyle = OUT; x.beginPath(); x.ellipse(px, py - 9, 13, 10.5, 0, 0, 6.29); x.fill();
    const g = x.createRadialGradient(px - 4, py - 13, 1, px, py - 9, 13); g.addColorStop(0, '#ffb04a'); g.addColorStop(1, '#c8500a');
    x.fillStyle = g; x.beginPath(); x.ellipse(px, py - 9, 11.5, 9, 0, 0, 6.29); x.fill();
    x.strokeStyle = 'rgba(110,36,0,.55)'; x.lineWidth = 1.2; [-5, 0, 5].forEach(o => { x.beginPath(); x.ellipse(px + o, py - 9, 3.5, 8.6, 0, 0, 6.29); x.stroke(); });
    paint(x, [[px - 1.5, py - 22, 3, 5, '#3a7a2a']]);
    x.fillStyle = `rgba(255,226,110,${fl})`; x.shadowColor = '#ffb04a'; x.shadowBlur = 8;
    x.beginPath(); x.moveTo(px - 7, py - 10); x.lineTo(px - 4, py - 15); x.lineTo(px - 1, py - 10); x.moveTo(px + 1, py - 10); x.lineTo(px + 4, py - 15); x.lineTo(px + 7, py - 10); x.fill();
    x.beginPath(); x.moveTo(px - 7, py - 6); for (let k = 0; k <= 6; k++) x.lineTo(px - 7 + k * 14 / 6, py - (k % 2 ? 2 : 5)); x.lineTo(px + 7, py - 6); x.fill();
    x.shadowBlur = 0;
  }
  function hwLights(L, t) {
    if (!HW()) return;
    PUMPKINS[level].forEach(([px, py], i) => L.push({ x: px, y: py - 8, r: 90, a: 0.55 + 0.25 * Math.sin(t / 90 + i * 1.7), c: '#ff8a2a' }));
  }
  /** A cobweb in a corner of the wall (sx, sy), spreading right (dir 1) or left (-1). */
  function web(x, sx, sy, dir, s = 70) {
    if (!visible(sx, sy, s + 20)) return;
    x.strokeStyle = 'rgba(230,230,250,.32)'; x.lineWidth = 1;
    const rays = [0, 0.25, 0.5, 0.78, 1].map(k => k * Math.PI / 2);
    x.beginPath(); rays.forEach(a => { x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * s * dir, sy + Math.sin(a) * s); }); x.stroke();
    for (let r = s * 0.25; r < s; r += s * 0.22) { x.beginPath(); rays.forEach((a, i) => { const px = sx + Math.cos(a) * r * dir, py = sy + Math.sin(a) * r; if (i) { const m = (a + rays[i - 1]) / 2, sag = r * 0.88; x.quadraticCurveTo(sx + Math.cos(m) * sag * dir, sy + Math.sin(m) * sag, px, py); } else x.moveTo(px, py); }); x.stroke(); }
    x.fillStyle = '#16101e'; x.beginPath(); x.arc(sx + s * 0.42 * dir, sy + s * 0.5, 3, 0, 6.29); x.fill(); // the spider
    x.strokeStyle = 'rgba(230,230,250,.4)'; x.beginPath(); x.moveTo(sx + s * 0.42 * dir, sy + s * 0.2); x.lineTo(sx + s * 0.42 * dir, sy + s * 0.5 - 3); x.stroke();
  }
  function hwFloor(x, t) {
    if (!HW()) return;
    if (level) { web(x, 0, 0, 1, 90); web(x, LOFT.w, 0, -1, 90); }
    else { web(x, 16, 0, 1, 90); web(x, VIPX, 0, -1, 90); [540, 1260, 1980].forEach(px => web(x, px + 13, 0, 1, 46)); }
    PUMPKINS[level].forEach(([px, py], i) => drawPumpkin(x, px, py, t, i));
  }
  /** A ghost: a sheet with a wavy hem, eyes and a glow, centred at (gx, gy). */
  function ghostShape(x, gx, gy, t, s = 1, a = 0.85) {
    x.save(); x.translate(gx, gy); x.scale(s, s); x.globalAlpha = a;
    const g = x.createRadialGradient(0, -8, 2, 0, -8, 28); g.addColorStop(0, 'rgba(200,220,255,.45)'); g.addColorStop(1, 'rgba(200,220,255,0)'); x.fillStyle = g; x.fillRect(-28, -36, 56, 56);
    const body = (k, c) => { x.fillStyle = c; x.beginPath(); x.arc(0, -12, 10 + k, Math.PI, 0); x.lineTo(10 + k, 4 + k); for (let i = 0; i < 4; i++) { const bx = 10 + k - (i + 0.5) * (20 + 2 * k) / 4; x.quadraticCurveTo(bx + 2.5, 4 + k + Math.sin(t / 120 + i) * 2.5 + 3, bx - (20 + 2 * k) / 8, 4 + k); } x.lineTo(-10 - k, -12); x.fill(); };
    body(1.5, OUT); body(0, '#f2f0ff');
    x.fillStyle = OUT; x.beginPath(); x.ellipse(-3.5, -13, 2, 3, 0, 0, 6.29); x.ellipse(3.5, -13, 2, 3, 0, 0, 6.29); x.fill();
    x.beginPath(); x.ellipse(0, -6, 2, 2.6, 0, 0, 6.29); x.fill();
    x.restore();
  }
  // five ghosts a day, hidden round the ground floor (the same places for everyone that day); found ones in bitcade:ghosts
  let ghosts = null;
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function ghostDay() {
    if (level || !HW()) return null;
    const d = dayKey(); if (ghosts && ghosts.d === d) return ghosts;
    let h = 2166136261; for (const ch of 'ghosts:' + d) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const r = () => { h += 0x6d2b79f5; let q = h; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
    const list = [];
    for (let tries = 0; list.length < 5 && tries < 600; tries++) {
      const gx = 60 + r() * (VIPX - 140), gy = WALL + 70 + r() * (WH - WALL - 160);
      if (hit(gx, gy, 16) || list.some(p => Math.hypot(p.x - gx, p.y - gy) < 340)) continue;
      list.push({ x: gx, y: gy, ph: r() * 6 });
    }
    let saved = null; try { saved = JSON.parse(localStorage.getItem('bitcade:ghosts')); } catch (e) {}
    const got = saved && saved.d === d && Array.isArray(saved.f) ? saved.f : [];
    list.forEach((g, i) => { g.got = got.includes(i); });
    ghosts = { d, list }; return ghosts;
  }
  function ghostStep(dt) {
    const gs = ghostDay(); if (!gs || me.entering) return;
    gs.list.forEach((g, i) => {
      if (g.goneT != null) g.goneT += dt;
      if (g.got) return;
      if (Math.hypot(me.x - g.x, me.y - (g.y + 10)) < 40) {
        g.got = true; g.goneT = 0;
        const f = gs.list.map((q, k) => q.got ? k : -1).filter(k => k >= 0);
        try { localStorage.setItem('bitcade:ghosts', JSON.stringify({ d: gs.d, f })); } catch (e) {}
        for (let k = 0; k < 8; k++) puffs.push({ x: g.x + rnd(-14, 14), y: g.y + rnd(-20, 6), t: 0.5 });
        if (play && play.ghost) play.ghost(f.length, f.length === 5);
      }
    });
  }
  function ghostDraws(list, x, t) {
    const gs = ghostDay(); if (!gs) return;
    for (const g of gs.list) {
      if (g.got && (g.goneT == null || g.goneT > 1)) continue;
      if (!visible(g.x, g.y, 60)) continue;
      const k = g.goneT != null ? g.goneT : 0, bob = Math.sin(t / 500 + g.ph) * 5;
      list.push([g.y + 10, () => ghostShape(x, g.x + Math.sin(t / 900 + g.ph) * 8, g.y - 26 + bob - k * 60, t + g.ph * 300, 1 + k * 0.4, (0.55 + 0.2 * Math.sin(t / 300 + g.ph)) * (1 - k))]);
    }
  }
  // bats now and then, across the top of the screen
  const bats = []; let batT = 4;
  function hwScreen(x, t, dt) {
    if (!HW()) return;
    x.fillStyle = 'rgba(255,110,20,.035)'; x.fillRect(0, 0, SW, SH); // a warm orange cast over everything
    if ((batT -= dt) <= 0) { batT = rnd(7, 13); const dir = Math.random() < 0.5 ? 1 : -1, y0 = rnd(30, SH * 0.3); for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) bats.push({ x: dir > 0 ? -30 - i * 26 : SW + 30 + i * 26, y: y0 + rnd(-20, 20), vx: dir * rnd(150, 210), ph: rnd(0, 6) }); }
    for (let i = bats.length - 1; i >= 0; i--) {
      const b = bats[i]; b.x += b.vx * dt; b.y += Math.sin(t / 200 + b.ph) * 0.6;
      if (b.x < -80 || b.x > SW + 80) { bats.splice(i, 1); continue; }
      const f = Math.sin(t / 60 + b.ph) * 6;
      x.fillStyle = '#0a0612'; x.beginPath(); x.moveTo(b.x, b.y); x.quadraticCurveTo(b.x - 8, b.y - 6 - f, b.x - 16, b.y - f); x.quadraticCurveTo(b.x - 9, b.y + 1, b.x, b.y + 3); x.quadraticCurveTo(b.x + 9, b.y + 1, b.x + 16, b.y - f); x.quadraticCurveTo(b.x + 8, b.y - 6 - f, b.x, b.y); x.fill();
      x.fillStyle = '#ff5a3a'; x.fillRect(b.x - 2, b.y - 1, 1.5, 1.5); x.fillRect(b.x + 0.5, b.y - 1, 1.5, 1.5);
    }
    const gs = ghostDay(); if (gs) { // how many found today, under the minimap
      const n = gs.list.filter(g => g.got).length;
      x.font = '9px Silkscreen, monospace'; x.textAlign = 'right'; x.textBaseline = 'middle'; x.fillStyle = n === 5 ? '#ffd23d' : '#ff9a3d';
      x.fillText(n === 5 ? '★ ALL 5 GHOSTS FOUND' : `👻 GHOSTS FOUND ${n}/5`, MAP.x + MAP.w + 4, MAP.y + MAP.h + 32);
    }
  }

  /* ---------- sprites ---------- */
  function drawCab(x, c, t) {
    const { g } = c, X = c.x, Y = c.y, w = c.w, h = c.h, gold = mastered.has(g.slug), col = gold ? '#ffd23d' : g.c, isNear = near === c;
    if (c.type === 'table') return drawTable(x, c, t);
    shadow(x, X + w / 2, Y + h, w * 0.62);
    if (isNear) { x.shadowColor = col; x.shadowBlur = 26; }
    if (c.type === 'racer') paint(x, [[X, Y + 14, w, h - 14, '#241c48'], [X - 2, Y, w + 4, 16, shade(col, -0.4)], [X + 4, Y + 70, w - 8, 22, '#3a3072']]);
    else if (c.type === 'dance') paint(x, [[X, Y + 16, w, h - 16, '#241c48'], [X - 2, Y, w + 4, 18, shade(col, -0.4)], [X - 10, Y + 30, 14, 60, '#1a1430'], [X + w - 4, Y + 30, 14, 60, '#1a1430']]);
    else { // uprights come in three looks, picked by name: classic, candy (pale, with a rounded top) and deluxe (chrome edges, marquee bulbs)
      const st = c.vip ? 0 : cabStyle(g.slug), candy = st === 1;
      if (candy) { x.fillStyle = OUT; x.beginPath(); x.ellipse(X + w / 2, Y + 3, w / 2 + 4, 11, 0, Math.PI, 0); x.fill(); x.fillStyle = shade(col, -0.15); x.beginPath(); x.ellipse(X + w / 2, Y + 3, w / 2 + 2, 9, 0, Math.PI, 0); x.fill(); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(X + 8, Y - 4, w - 16, 2); }
      paint(x, [[X, Y + 16, w, h - 16, candy ? '#c8bfe0' : '#241c48'], [X - 2, Y, w + 4, 18, shade(col, -0.4)], [X + 3, Y + 64, w - 6, 12, candy ? '#9a8fc0' : '#3a3072'], [X + w / 2 - 12, Y + 82, 24, 16, '#17122e', true]]);
      if (st === 2) { x.fillStyle = '#a8b2c8'; x.fillRect(X - 1, Y + 16, 3, h - 18); x.fillRect(X + w - 2, Y + 16, 3, h - 18); x.fillStyle = '#e8eef8'; x.fillRect(X - 1, Y + 16, 1, h - 18); for (let i = 0; i < 7; i++) { x.fillStyle = Math.floor(t / 180 + i) % 3 === 0 ? '#fff6c2' : '#7a6a3a'; x.fillRect(X + 2 + i * (w - 6) / 6, Y - 3, 3, 3); } }
    }
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(X + w - 5, Y + 18, 5, h - 18); // the side panel, in shadow
    x.fillStyle = col; x.fillRect(X + 1, Y + 3, w - 2, 11);                     // the lit marquee
    x.font = '7px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText(g.name.toUpperCase(), X + w / 2, Y + 9, w - 8);
    x.fillStyle = 'rgba(255,255,255,.45)'; x.fillRect(X + 4, Y + 3, w - 8, 1);
    x.fillStyle = col; x.fillRect(X, Y + 18, 3, h - 20); x.fillRect(X + w - 8, Y + 18, 3, h - 20); // side-art trim
    if (c.type === 'upright') { x.strokeStyle = rgba(col, 0.55); x.lineWidth = 2; for (let k = 0; k < 3; k++) { const yy = Y + 30 + k * 20; x.beginPath(); x.moveTo(X + w - 5, yy); x.lineTo(X + w - 2, yy + 5); x.lineTo(X + w - 5, yy + 10); x.stroke(); } }
    screen(x, c, t);
    if (c.type === 'dance') { // speakers thumping, a light bar
      const thump = (c.user || near === c) ? Math.abs(Math.sin(t / 120)) * 2 : 0;
      [[X - 3, Y + 46], [X + w + 3, Y + 46], [X - 3, Y + 74], [X + w + 3, Y + 74]].forEach(([sx, sy]) => { x.fillStyle = OUT; x.beginPath(); x.arc(sx, sy, 6 + thump, 0, 6.29); x.fill(); x.fillStyle = '#3a3060'; x.beginPath(); x.arc(sx, sy, 4 + thump, 0, 6.29); x.fill(); });
      for (let i = 0; i < 8; i++) { x.fillStyle = ['#ff4fd1', '#5ee7ff', '#3dff8f', '#ffd23d'][(i + Math.floor(t / 150)) % 4]; x.fillRect(X + 10 + i * 11, Y + 72, 8, 4); }
    } else if (c.type === 'racer') { // a dashboard and a steering wheel
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
    wizard: { top: '#4a2a9a', legs: '#4a2a9a', hair: '#e8e8f0', hat: 'wizard' },
    tux: { top: '#16161e', legs: '#16161e', hair: '#2a1a10', tux: true },
    goldsuit: { top: '#ffd23d', legs: '#c89a2a', hair: '#3a2414', hat: 'tophat', tux: true, bow: '#16161e' },
    varsity: { top: '#c8203a', legs: '#2a2a4a', hair: '#3a2414', sleeves: '#f4effd', letter: 'B' },
    skater: { top: '#5a7aaa', legs: '#3a3a4a', hair: '#c88a3a', hat: 'beanie', capC: '#ff9a3d', flannel: '#c8203a', board: true },
    captain: { top: '#2a3a8a', legs: '#16161e', hair: '#3a2414', cape: '#c8203a', badge: '#ffd23d', sleeves: '#ffd23d' },
    legend: { top: '#ffd23d', legs: '#c89a2a', hair: '#fff6c2', hat: 'halo', cape: '#ff4fd1', glow: true },
    pumpkin: { top: '#2a1a40', legs: '#16101e', hair: '#16101e', hat: 'pumpkin', cape: '#ff8a2a' }, // Halloween
    // Arcade Pass, Season 1
    neonrider: { top: '#ff4fd1', legs: '#16161e', hair: '#16161e', hat: 'helmet', visor: true, sleeves: '#22e0ff' },
    tracksuit: { top: '#3d6aff', legs: '#3d6aff', hair: '#3a2414', sleeves: '#f4effd', flannel: '#f4effd' },
    dj: { top: '#16161e', legs: '#2a2a4a', hair: '#3a2414', hat: 'phones', capC: '#3dff8f', glasses: true, sleeves: '#3dff8f', badge: '#ff4fd1' },
    phantom: { top: '#2a1a40', legs: '#16101e', hair: '#16101e', mask: true, cape: '#8a3dff', glow: true },
    starlight: { top: '#d8e0f0', legs: '#a8b0c8', hair: '#fff6c2', hat: 'halo', cape: '#3a5ab8', badge: '#ffd23d', glow: true }
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
    if (o.glow) { const g = x.createRadialGradient(0, -22, 2, 0, -22, 30); g.addColorStop(0, 'rgba(255,210,61,.55)'); g.addColorStop(1, 'rgba(255,210,61,0)'); x.fillStyle = g; x.fillRect(-30, -52, 60, 60); }
    if (o.cape) { const flap = moving ? Math.sin(walk * 2) * 2 : 0; x.fillStyle = OUT; x.beginPath(); x.moveTo(-8, -26); x.lineTo(8, -26); x.lineTo(10 + flap, dir === 'up' ? -4 : -8); x.lineTo(-10 - flap, dir === 'up' ? -4 : -8); x.fill(); x.fillStyle = o.cape; x.beginPath(); x.moveTo(-7, -25); x.lineTo(7, -25); x.lineTo(9 + flap, dir === 'up' ? -5 : -9); x.lineTo(-9 - flap, dir === 'up' ? -5 : -9); x.fill(); }
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
    if (o.letter && dir !== 'up') { x.fillStyle = '#f4effd'; x.font = 'bold 8px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.letter, side ? 1 : -3, -19); }
    if (o.sleeves && !side) { x.fillStyle = o.sleeves; x.fillRect(-11, -18, 4, 3); x.fillRect(7, -18, 4, 3); }
    if (o.flannel && dir !== 'up') { x.fillStyle = o.flannel; for (let i = -7; i < 8; i += 4) x.fillRect(i, -25, 2, 13); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(-8, -20, 16, 2); }
    if (o.board && dir === 'up') { paint(x, [[-7, -34, 14, 22, '#ff9a3d']]); x.fillStyle = OUT; x.fillRect(-6, -36, 3, 3); x.fillRect(3, -36, 3, 3); x.fillRect(-6, -12, 3, 3); x.fillRect(3, -12, 3, 3); }
    if (o.hat === 'beanie') { paint(x, [[-7, -45, 14, 7, o.capC || '#ff9a3d']]); x.fillStyle = '#fff'; x.fillRect(-2, -48, 4, 3); }
    if (o.badge && dir !== 'up') { x.fillStyle = o.badge; x.beginPath(); x.moveTo(side ? 2 : -4, -24); x.lineTo(side ? 5 : -1, -20); x.lineTo(side ? -1 : -7, -20); x.fill(); }
    if (o.hat === 'halo') { x.strokeStyle = '#fff6c2'; x.lineWidth = 2; x.shadowColor = '#ffd23d'; x.shadowBlur = 8; x.beginPath(); x.ellipse(0, -47, 8, 2.5, 0, 0, 6.29); x.stroke(); x.shadowBlur = 0; }
    if (o.tux && dir === 'down') { x.fillStyle = '#f4effd'; x.beginPath(); x.moveTo(-3, -26); x.lineTo(3, -26); x.lineTo(0, -16); x.fill(); x.fillStyle = o.bow || '#c8203a'; x.fillRect(-3, -26, 6, 3); }
    if (o.hat === 'pumpkin') { // a jack-o'-lantern for a head, face glowing
      x.fillStyle = OUT; x.beginPath(); x.ellipse(0, -34, 10.5, 9.5, 0, 0, 6.29); x.fill();
      const pg = x.createRadialGradient(-3, -38, 1, 0, -34, 10); pg.addColorStop(0, '#ffb04a'); pg.addColorStop(1, '#c8500a'); x.fillStyle = pg; x.beginPath(); x.ellipse(0, -34, 9, 8, 0, 0, 6.29); x.fill();
      x.strokeStyle = 'rgba(110,36,0,.55)'; x.lineWidth = 1; x.beginPath(); x.ellipse(0, -34, 3.5, 7.6, 0, 0, 6.29); x.stroke();
      paint(x, [[-1, -46, 2, 4, '#3a7a2a']]);
      if (dir !== 'up') { x.fillStyle = '#ffe26e'; const ex = side ? [2] : [-4, 3]; ex.forEach(e => { x.beginPath(); x.moveTo(e - 2, -35); x.lineTo(e, -39); x.lineTo(e + 2, -35); x.fill(); }); x.fillRect(side ? 0 : -4, -31, side ? 6 : 8, 2); }
    }
    if (o.hat === 'tophat') { paint(x, [[-7, -55, 14, 14, '#16161e'], [-10, -43, 20, 3, '#16161e']]); x.fillStyle = '#ffd23d'; x.fillRect(-7, -46, 14, 2); }
    if (prop === 'gold' && dir !== 'up') { const hx = side ? 4 : 8; paint(x, [[hx, -24, 6, 9, 'rgba(255,230,160,.6)']]); x.fillStyle = '#ffd23d'; x.fillRect(hx + 1, -20, 4, 4); }
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
    { x: 1980, y: 700, look: { top: '#ffd23d', legs: '#2a2a4a', hair: '#111111', skin: '#8a5634', hat: 'cap', capC: '#ff4f6d' }, name: 'prizes' },
    { x: 2214, y: 712, look: { top: '#16161e', legs: '#16161e', hair: '#111111', skin: '#6a3e22', glasses: true, tux: true }, name: 'bouncer', dir: 'right' },
    { x: 2730, y: 990, look: { top: '#f4effd', legs: '#16161e', hair: '#c88a3a', skin: '#ffd8b4', tux: true }, name: 'bartender' }];
  const MAIN_ZONES = ZONES.filter(z => !z.vip);
  function spawnPeople() {
    npcs.length = 0;
    for (let i = 0; i < 10; i++) {
      const z = pick(MAIN_ZONES); let px, py, k = 0;
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
    if (n.vip) return planVip(n);
    if (n.loft) return planLoft(n);
    if (r < 0.5) { const free = [...cabs, ...objs.filter(o => o.npcSpot)].filter(c => !c.vip && !c.user && near !== c && !(me.entering && me.entering.c === c)); const c = free.length && pick(free); if (c) { c.user = n; act = { type: 'play', obj: c, to: c.npcSpot || (c.type === 'racer' ? c.seat : c.spot), dur: rnd(10, 26) }; } }
    else if (r < 0.62 && feat) act = { type: 'watch', obj: feat, to: [feat.spot[0] + pick([-34, 34, -18, 18]), feat.spot[1] + rnd(14, 34)], dur: rnd(8, 16) };
    else if (r < 0.69 && cabs.some(c => c.user && c.user !== n && c.type !== 'table')) { const c = pick(cabs.filter(c => c.user && c.user !== n && c.type !== 'table')); act = { type: 'watch', obj: c, to: [c.spot[0] + pick([-30, 30, -18, 18]), c.spot[1] + rnd(16, 32)], dur: rnd(6, 12) }; } // a crowd gathers round a game in progress
    else if (r < 0.74) { const seats = objs.filter(o => o.seats && !o.vip).flatMap(o => o.seats).filter(s => !occupied.has(s.join())); if (seats.length) { const s = pick(seats); act = { type: 'sit', seat: s, to: s, dur: rnd(10, 22) }; } }
    else if (r < 0.8) act = { type: 'snack', to: [rnd(110, 250), 724], dur: rnd(3, 6) };
    else if (r < 0.86) act = { type: 'browse', to: [rnd(1880, 2080), 806], dur: rnd(4, 9) };
    else if (r < 0.9) { const claw = objs.find(o => o.kind === 'claw'); if (!claw.user) { claw.user = n; act = { type: 'claw', obj: claw, to: claw.spot, dur: rnd(6, 10) }; } }
    else if (r < 0.94) act = { type: 'watch', to: [rnd(1040, 1200), rnd(824, 860)], dur: rnd(4, 8) };
    if (!act) { const z = pick(MAIN_ZONES); act = { type: 'wander', to: [rnd(z.x + 40, z.x + z.w - 40), rnd(Math.max(WALL + 40, z.y + 40), z.y + z.h - 40)], dur: rnd(1, 3) }; }
    n.act = act; n.path = findPath(n.x, n.y, act.to[0], act.to[1]); n.t = act.dur;
  }
  /** VIP regulars: play the gold cabinets, sit on the velvet sofas, get golden sodas, wander the room. */
  function planVip(n) {
    const r = Math.random(), occupied = new Set(npcs.map(o => o.act && o.act.seat && o.act.seat.join())); let act = null;
    if (r < 0.4) { const free = cabs.filter(c => c.vip && !c.user && near !== c); if (free.length) { const c = pick(free); c.user = n; act = { type: 'play', obj: c, to: c.spot, dur: rnd(10, 24) }; } }
    else if (r < 0.7) { const seats = objs.filter(o => o.seats && o.vip).flatMap(o => o.seats).filter(s => !occupied.has(s.join())); if (seats.length) { const s = pick(seats); act = { type: 'sit', seat: s, to: s, dur: rnd(12, 24) }; } }
    else if (r < 0.82) act = { type: 'snack', gold: true, to: [rnd(2650, 2810), 1086], dur: rnd(3, 6) };
    if (!act) act = { type: 'wander', to: [rnd(2290, 2840), rnd(560, 1180)], dur: rnd(2, 4) };
    n.act = act; n.path = findPath(n.x, n.y, act.to[0], act.to[1]); n.t = act.dur;
  }
  /** Loft regulars: play the new arrivals or the coin pusher, sit on the sky deck, look out of the windows, wander. */
  function planLoft(n) {
    const r = Math.random(), occupied = new Set(npcs.map(o => o.act && o.act.seat && o.act.seat.join())); let act = null;
    if (r < 0.5) { const free = [...cabs, ...objs.filter(o => o.npcSpot)].filter(c => !c.user && near !== c && !(me.entering && me.entering.c === c)); const c = free.length && pick(free); if (c) { c.user = n; act = { type: 'play', obj: c, to: c.npcSpot || c.spot, dur: rnd(10, 26) }; } }
    else if (r < 0.66) { const seats = objs.filter(o => o.seats).flatMap(o => o.seats).filter(s => !occupied.has(s.join())); if (seats.length) { const s = pick(seats); act = { type: 'sit', seat: s, to: s, dur: rnd(10, 22) }; } }
    else if (r < 0.82) act = { type: 'watch', to: [rnd(1160, 1880), rnd(250, 300)], dur: rnd(4, 9) };
    if (!act) { const z = pick(LOFT_ZONES); act = { type: 'wander', to: [rnd(z.x + 40, z.x + z.w - 40), rnd(WALL + 60, z.y + z.h - 60)], dur: rnd(1, 3) }; }
    n.act = act; n.path = findPath(n.x, n.y, act.to[0], act.to[1]); n.t = act.dur;
  }
  function spawnVipPeople() {
    for (let i = npcs.length - 1; i >= 0; i--) if (npcs[i].vip) npcs.splice(i, 1);
    if (!vipOpen) return;
    const looks = [{ ...OUTFITS.tux, skin: pick(SKINS) }, { ...OUTFITS.goldsuit, skin: pick(SKINS) }, { top: '#c8203a', legs: '#16161e', hair: '#e8d090', skin: pick(SKINS), hat: 'bun', glasses: true }];
    looks.forEach(look => npcs.push({ vip: true, x: rnd(2300, 2820), y: rnd(600, 1150), dir: 'down', walk: 0, moving: false, look, path: [], act: null, t: rnd(0, 2), pose: '', bubble: null, greetT: 0, speed: rnd(70, 90) }));
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
    const pc = pick(cabs); if (!pc) return null; const g = pc.g, wr = opt.world && opt.world(g.slug), feat = opt.featured && cabs.find(c => c.g.slug === opt.featured);
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
    if (a && a.type === 'play' && a.obj.type === 'dance') { const k = Math.floor(t / 260 + n.x) % 4; n.pose = k === 1 ? 'cheer' : k === 3 ? 'wave' : ''; n.dir = k === 2 ? 'left' : 'up'; }
    else if (a && a.type === 'play') { n.pose = ''; if (Math.random() < dt * 0.08) { const yay = Math.random() < 0.5; say(n, pick(LINES.play)); if (yay) { n.pose = 'cheer'; setTimeout(() => { if (n.pose === 'cheer') n.pose = ''; }, 900); } if (play) play.sound.react(n.x, yay); } }
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
    if (a.type === 'snack') { n.prop = a.gold ? 'gold' : 'soda'; n.propT = rnd(30, 60); }
  }
  const initials = () => { try { const v = localStorage.getItem('arcade:initials'); return /^[A-Z]{3}$/.test(v || '') ? v : ''; } catch (e) { return ''; } };


  /* ---------- pets, footstep trails and emotes (prizes from the counter: slots pet, trail and emote) ---------- */
  const pet = { x: WW / 2 + 20, y: 950, dir: 'right', t: 0, hop: 0, moving: false };
  const FLYERS = ['ufo', 'phoenix', 'ghostpet'];
  function stepPet(dt) {
    const id = equip().pet; if (!id) return;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[me.dir] || [0, 1];
    const tx = me.x - v[0] * 28 + (v[1] ? 18 : 0), ty = me.y - v[1] * 24 + (v[0] ? 8 : 4), dx = tx - pet.x, dy = ty - pet.y, d = Math.hypot(dx, dy);
    if (d > 420) { pet.x = tx; pet.y = ty; } // left behind: catch up
    else if (d > 3) { const sp = Math.min(d * 4.5, me.run ? 330 : 230) * dt; pet.x += dx / d * sp; pet.y += dy / d * sp; if (Math.abs(dx) > 2) pet.dir = dx > 0 ? 'right' : 'left'; }
    pet.moving = d > 8; pet.t += dt; if (pet.hop > 0) pet.hop = Math.max(0, pet.hop - dt * 1.6);
  }
  /** A pet at its feet (px, py), facing right unless dir is 'left'. */
  function drawPet(x, id, px, py, dir, t, moving, hop) {
    const fly = FLYERS.includes(id), bob = fly ? Math.sin(t * 3) * 3 - 22 : moving ? -Math.abs(Math.sin(t * 12)) * 2 : 0, jump = Math.sin(hop * Math.PI) * 14;
    x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(px, py, fly ? 7 : 9, 3, 0, 0, 6.29); x.fill();
    x.save(); x.translate(Math.round(px), Math.round(py + bob - jump)); if (dir === 'left') x.scale(-1, 1);
    const leg = moving ? Math.sin(t * 14) * 2 : 0;
    if (id === 'robodog') {
      paint(x, [[-9 + leg, -5, 3, 5, '#6a7088'], [5 - leg, -5, 3, 5, '#6a7088'], [-9, -13, 18, 9, '#a8b0c8'], [5, -19, 10, 9, '#c0c6d8'], [6, -23, 3, 5, '#8a90a8']]);
      x.fillStyle = '#5ee7ff'; x.fillRect(11, -17, 3, 2); x.fillStyle = Math.floor(t * 2) % 2 ? '#ff4f6d' : '#5a1a24'; x.fillRect(6, -26, 2, 3);
      x.strokeStyle = '#8a90a8'; x.lineWidth = 2; x.beginPath(); x.moveTo(-9, -11); x.lineTo(-14, -15 + Math.sin(t * 16) * 3); x.stroke(); // the wagging tail
    } else if (id === 'pixelcat') {
      paint(x, [[-8 + leg, -5, 3, 5, '#d8701a'], [4 - leg, -5, 3, 5, '#d8701a'], [-8, -12, 15, 8, '#ff9a3d'], [4, -19, 9, 8, '#ffae5a']]);
      x.fillStyle = '#ff9a3d'; x.beginPath(); x.moveTo(4, -19); x.lineTo(6, -24); x.lineTo(8, -19); x.moveTo(9, -19); x.lineTo(11, -24); x.lineTo(13, -19); x.fill();
      x.fillStyle = '#3dff8f'; x.fillRect(9, -16, 2, 2); x.fillStyle = '#ffe0c0'; x.fillRect(-6, -8, 10, 2);
      x.strokeStyle = '#ff9a3d'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(-8, -10); x.quadraticCurveTo(-14, -12, -12, -20 + Math.sin(t * 3) * 2); x.stroke();
    } else if (id === 'slime') {
      const sq = 1 + Math.sin(t * (moving ? 12 : 4)) * 0.12; x.scale(1 / sq, sq);
      x.fillStyle = OUT; x.beginPath(); x.ellipse(0, -7, 11, 9, 0, Math.PI, 0); x.lineTo(11, 0); x.lineTo(-11, 0); x.fill();
      const g = x.createRadialGradient(-3, -11, 1, 0, -6, 11); g.addColorStop(0, '#c8ffb0'); g.addColorStop(1, '#3aa83a'); x.fillStyle = g; x.beginPath(); x.ellipse(0, -7, 9.5, 7.5, 0, Math.PI, 0); x.lineTo(9.5, -1); x.lineTo(-9.5, -1); x.fill();
      x.fillStyle = OUT; x.fillRect(-4, -9, 2, 3); x.fillRect(3, -9, 2, 3); x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(-6, -12, 3, 2);
    } else if (id === 'ufo') {
      x.globalCompositeOperation = 'lighter'; const bm = x.createLinearGradient(0, 0, 0, 24); bm.addColorStop(0, 'rgba(94,231,255,.45)'); bm.addColorStop(1, 'rgba(94,231,255,0)'); x.fillStyle = bm; x.beginPath(); x.moveTo(-5, 0); x.lineTo(5, 0); x.lineTo(11, 24); x.lineTo(-11, 24); x.fill(); x.globalCompositeOperation = 'source-over'; // the beam
      x.fillStyle = OUT; x.beginPath(); x.ellipse(0, -2, 14, 5, 0, 0, 6.29); x.fill(); x.fillStyle = '#c0c6d8'; x.beginPath(); x.ellipse(0, -2, 12.5, 4, 0, 0, 6.29); x.fill();
      x.fillStyle = '#5ee7ff'; x.beginPath(); x.ellipse(0, -5, 6, 5, 0, Math.PI, 0); x.fill(); x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(-3, -8, 2, 2);
      for (let i = 0; i < 4; i++) { x.fillStyle = Math.floor(t * 6 + i) % 4 === 0 ? '#ffd23d' : '#ff4fd1'; x.fillRect(-10 + i * 6, -2, 2, 2); }
    } else if (id === 'ghostpet') {
      ghostShape(x, 0, 2, t * 1000, 0.85, 0.85);
    } else if (id === 'phoenix') {
      const flap = Math.sin(t * 10) * 6, g = x.createRadialGradient(0, -6, 1, 0, -6, 22); g.addColorStop(0, 'rgba(255,170,60,.45)'); g.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = g; x.fillRect(-22, -28, 44, 44);
      x.fillStyle = '#ff5a1a'; x.beginPath(); x.moveTo(-6, -4); x.lineTo(-16, 2 + Math.sin(t * 8) * 2); x.lineTo(-12, -6); x.lineTo(-18, -8 + Math.sin(t * 7) * 2); x.lineTo(-6, -8); x.fill(); // tail flames
      x.fillStyle = '#ffd23d'; x.beginPath(); x.moveTo(-2, -8); x.lineTo(-10, -16 - flap); x.lineTo(4, -10); x.fill();
      paint(x, [[-6, -10, 12, 7, '#ffb03d'], [4, -14, 6, 6, '#ffd23d']]); x.fillStyle = OUT; x.fillRect(8, -12, 1.5, 1.5); x.fillStyle = '#ff7a3d'; x.fillRect(10, -11, 3, 2);
    }
    x.restore();
  }
  // footstep trails
  const trail = [];
  let trailT = 0, stepSide = 1;
  function stepTrail(dt, stepped) {
    for (const p of trail) { p.t -= dt; p.y += (p.vy || 0) * dt; p.x += (p.vx || 0) * dt; }
    for (let i = trail.length - 1; i >= 0; i--) if (trail[i].t <= 0) trail.splice(i, 1);
    const id = equip().trail; if (!id || !me.moving || me.entering) return;
    trailT -= dt;
    if (id === 'neonprint') { if (stepped) { stepSide = -stepSide; const side = me.dir === 'left' || me.dir === 'right' ? [0, stepSide * 3] : [stepSide * 4, 0]; trail.push({ k: id, x: me.x + side[0], y: me.y + side[1], t: 1.8, life: 1.8, c: stepSide > 0 ? '#5ee7ff' : '#ff4fd1', dir: me.dir }); } return; }
    if (trailT > 0) return;
    trailT = { sparkle: 0.05, bubbles: 0.09, rainbow: 0.025, flame: 0.03 }[id] || 0.05;
    const jx = rnd(-6, 6), jy = rnd(-3, 3);
    if (id === 'sparkle') trail.push({ k: id, x: me.x + jx, y: me.y + jy, t: 0.8, life: 0.8, c: pick(['#fff6c2', '#ffd23d', '#ffffff', '#5ee7ff']) });
    if (id === 'bubbles') trail.push({ k: id, x: me.x + jx, y: me.y - 4, vy: -24, vx: rnd(-6, 6), t: 1.3, life: 1.3, r: rnd(2, 4.5) });
    if (id === 'rainbow') trail.push({ k: id, x: me.x + jx * 0.4, y: me.y + jy * 0.4, t: 0.9, life: 0.9, c: `hsl(${(performance.now() / 4) % 360},95%,60%)` });
    if (id === 'flame') trail.push({ k: id, x: me.x + jx, y: me.y, vy: -36, t: 0.55, life: 0.55 });
  }
  function drawTrail(x) {
    for (const p of trail) {
      const a = Math.max(0, p.t / p.life);
      if (p.k === 'sparkle') { const r = 3 * a + 1; x.fillStyle = p.c; x.globalAlpha = a; x.beginPath(); x.moveTo(p.x, p.y - r * 2); x.lineTo(p.x + r * 0.5, p.y - r * 0.5); x.lineTo(p.x + r * 2, p.y); x.lineTo(p.x + r * 0.5, p.y + r * 0.5); x.lineTo(p.x, p.y + r * 2); x.lineTo(p.x - r * 0.5, p.y + r * 0.5); x.lineTo(p.x - r * 2, p.y); x.lineTo(p.x - r * 0.5, p.y - r * 0.5); x.fill(); }
      if (p.k === 'neonprint') { x.globalAlpha = a * 0.85; x.fillStyle = p.c; x.shadowColor = p.c; x.shadowBlur = 8; const side = p.dir === 'left' || p.dir === 'right'; x.beginPath(); x.ellipse(p.x, p.y, side ? 5 : 3, side ? 2.5 : 4.5, 0, 0, 6.29); x.fill(); x.shadowBlur = 0; }
      if (p.k === 'bubbles') { x.globalAlpha = a; x.strokeStyle = '#9ae8ff'; x.lineWidth = 1.2; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.29); x.stroke(); x.fillStyle = 'rgba(255,255,255,.7)'; x.fillRect(p.x - p.r * 0.4, p.y - p.r * 0.5, 1.5, 1.5); }
      if (p.k === 'rainbow') { x.globalAlpha = a * 0.9; x.fillStyle = p.c; x.beginPath(); x.arc(p.x, p.y, 3.5 * a + 1, 0, 6.29); x.fill(); }
      if (p.k === 'flame') { x.globalAlpha = a; const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7); g.addColorStop(0, '#fff6c2'); g.addColorStop(0.4, '#ffb03d'); g.addColorStop(1, 'rgba(255,74,26,0)'); x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, 7 * a + 2, 0, 6.29); x.fill(); }
    }
    x.globalAlpha = 1;
  }
  // emotes: wave and cheer for everyone; dance, spin, flex, robot and disco from the prize counter
  const EMOTES = { wave: ['WAVE', 2], cheer: ['CHEER', 2], dance: ['DANCE', 3.2], spin: ['SPIN', 1.6], flex: ['FLEX', 2.2], robot: ['ROBOT', 3], disco: ['DISCO', 3] };
  const myEmotes = () => ['wave', 'cheer', ...Object.keys(EMOTES).filter(id => id !== 'wave' && id !== 'cheer' && owns(id))];
  function startEmote(id) {
    if (!EMOTES[id] || me.entering) return;
    me.emote = { id, t: 0, dur: EMOTES[id][1] }; me.vx = me.vy = 0; route = []; pet.hop = 1;
    if (play) play.sound.fanfare && id !== 'wave' ? play.sound.fanfare() : play && play.sound.select();
    // the crowd likes it
    for (const n of npcs) if (Math.hypot(n.x - me.x, n.y - me.y) < 190 && Math.random() < 0.8) {
      n.dir = n.x < me.x ? 'right' : 'left'; n.pose = 'cheer'; setTimeout(() => { if (n.pose === 'cheer') n.pose = ''; }, 1400);
      if (Math.random() < 0.6) say(n, pick(id === 'wave' ? ['HEY!', 'HI THERE!', 'YO!'] : ['NICE MOVES!', 'WOOO!', 'GO GO GO!', 'HAHA, YES!', 'SHOW-OFF!', 'TEACH ME THAT!']), 2);
    }
  }
  /** How you look mid-emote: pose, facing, a hop and a size pulse. */
  function emoteLook(e) {
    const k = e.t;
    switch (e.id) {
      case 'wave': return { pose: Math.floor(k * 5) % 2 ? 'wave' : '', dir: 'down' };
      case 'cheer': return { pose: 'cheer', dir: 'down', lift: Math.abs(Math.sin(k * 7)) * 8 };
      case 'dance': { const f = Math.floor(k / 0.25) % 4; return { pose: ['cheer', '', 'wave', ''][f], dir: ['left', 'down', 'right', 'down'][f], lift: Math.abs(Math.sin(k * 12.6)) * 3 }; }
      case 'spin': return { pose: k > e.dur - 0.4 ? 'cheer' : '', dir: ['down', 'right', 'up', 'left'][Math.floor(k / 0.09) % 4], lift: Math.sin(k / e.dur * Math.PI) * 12 };
      case 'flex': return { pose: 'cheer', dir: 'down', scale: 1 + Math.abs(Math.sin(k * 6)) * 0.12 };
      case 'robot': { const f = Math.floor(k / 0.35) % 4; return { pose: f % 2 ? 'wave' : '', dir: ['left', 'down', 'right', 'down'][f] }; }
      case 'disco': return { pose: 'wave', dir: Math.floor(k / 0.5) % 2 ? 'left' : 'right', lift: Math.abs(Math.sin(k * 6.3)) * 2 };
    }
    return { pose: '' };
  }
  /** The emote picker: your emotes in a row; numbers, arrows and Enter, or a tap. */
  function emoteMenu() {
    const list = myEmotes(); let at = 0;
    const W2 = Math.min(VW - 40, list.length * 96 + 20), X0 = (VW - W2) / 2, Y0 = VH - 168;
    const slot = i => [X0 + 14 + i * 96, Y0 + 30, 86, 112];
    const pickIt = i => { if (!list[i]) return; mode = null; keys.clear(); startEmote(list[i]); showCard(); };
    return {
      name: 'emotes', allKeys: true,
      draw(x, t) {
        x.fillStyle = 'rgba(5,2,12,.82)'; x.fillRect(X0, Y0, W2, 158); x.strokeStyle = '#ff4fd1'; x.lineWidth = 2; x.strokeRect(X0 + 3, Y0 + 3, W2 - 6, 152);
        x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ff4fd1'; x.fillText('EMOTES · PICK ONE (MORE AT THE PRIZE COUNTER)', VW / 2, Y0 + 16);
        list.forEach((id, i) => {
          const [sx, sy, sw, sh] = slot(i), on = i === at; x.fillStyle = on ? '#2a1a4a' : '#140c24'; x.fillRect(sx, sy, sw, sh); x.strokeStyle = on ? '#ffd23d' : '#3a3060'; x.lineWidth = on ? 2 : 1; x.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
          const look = emoteLook({ id, t: (t / 1000) % EMOTES[id][1], dur: EMOTES[id][1] });
          x.save(); x.translate(sx + sw / 2, sy + 78 - (look.lift || 0)); x.scale(1.3 * (look.scale || 1), 1.3 * (look.scale || 1)); drawWalker(x, 0, 0, look.dir || 'down', 0, false, equip().outfit || '', look.pose); x.restore();
          x.fillStyle = on ? '#ffd23d' : '#f4effd'; x.fillText(EMOTES[id][0], sx + sw / 2, sy + 94); x.fillStyle = 'rgba(255,255,255,.4)'; x.fillText(String(i + 1), sx + 10, sy + 10);
        });
      },
      key(c) {
        if (c === 'Escape' || c === 'KeyE') { mode = null; keys.clear(); showCard(); return; }
        if (c === 'ArrowLeft' || c === 'KeyA') at = (at + list.length - 1) % list.length;
        if (c === 'ArrowRight' || c === 'KeyD') at = (at + 1) % list.length;
        if (c === 'Enter') pickIt(at);
        const n = /^(Digit|Numpad)([1-9])$/.exec(c); if (n) pickIt(+n[2] - 1);
      },
      tap(px, py) { const i = list.findIndex((_, i) => { const [sx, sy, sw, sh] = slot(i); return px > sx && px < sx + sw && py > sy && py < sy + sh; }); if (i >= 0) pickIt(i); else { mode = null; showCard(); } }
    };
  }
  function openEmotes() { if (mode || me.entering) return; mode = emoteMenu(); keys.clear(); route = []; me.vx = me.vy = 0; }
  const EMOTE_BTN = { x: 12, y: SH - 46, w: 96, h: 32 };
  function drawEmoteButton(x) {
    x.fillStyle = 'rgba(10,6,18,.75)'; x.fillRect(EMOTE_BTN.x, EMOTE_BTN.y, EMOTE_BTN.w, EMOTE_BTN.h); x.strokeStyle = '#ff4fd1'; x.lineWidth = 1.5; x.strokeRect(EMOTE_BTN.x + 0.5, EMOTE_BTN.y + 0.5, EMOTE_BTN.w - 1, EMOTE_BTN.h - 1);
    x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ff4fd1'; x.fillText('☺ EMOTE · E', EMOTE_BTN.x + EMOTE_BTN.w / 2, EMOTE_BTN.y + EMOTE_BTN.h / 2 + 1);
  }

  /* ---------- walking ---------- */
  function step(dt, t) {
    if (me.entering) { me.entering.t += dt; return; }
    if (me.ride) { const r = me.ride; r.t += dt; if (r.t >= 0.45 && !r.done) { r.done = true; goLevel(r.to); } if (r.t >= 0.9) me.ride = null; return; }
    let dx = 0, dy = 0;
    if (!mode) {
      if (keys.has('ArrowLeft') || keys.has('KeyA')) dx--; if (keys.has('ArrowRight') || keys.has('KeyD')) dx++;
      if (keys.has('ArrowUp') || keys.has('KeyW')) dy--; if (keys.has('ArrowDown') || keys.has('KeyS')) dy++;
    }
    const pad = padInput(); if (!mode) { dx += pad.x; dy += pad.y; }
    let running = keys.has('ShiftLeft') || keys.has('ShiftRight') || pad.run;
    if (dx || dy) { route = []; arriveAct = null; me.emote = null; } // walking off ends an emote
    if (me.emote && (me.emote.t += dt) >= me.emote.dur) me.emote = null;
    else if (route.length) { // walking to a tapped spot
      const [tx, ty] = route[0], ex = tx - me.x, ey = ty - me.y, d = Math.hypot(ex, ey);
      if (d < 5) { route.shift(); if (!route.length) { me.vx = me.vy = 0; if (arriveAct) { const f = arriveAct; arriveAct = null; f(); } } }
      else { dx = ex / d; dy = ey / d; running = running || me.autoRun; }
    }
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const top = running ? RUN : WALK, k = Math.min(1, dt * (l ? 12 : 16));
    me.vx += (dx * top - me.vx) * k; me.vy += (dy * top - me.vy) * k;
    const sp = Math.hypot(me.vx, me.vy); me.moving = sp > 12; me.run = running && sp > WALK + 20; let stepped = false;
    if (sp > 1) {
      const nx = me.x + me.vx * dt, ny = me.y + me.vy * dt; let moved = false;
      if (!hit(nx, me.y)) { me.x = nx; moved = true; } else me.vx = 0;
      if (!hit(me.x, ny)) { me.y = ny; moved = true; } else me.vy = 0;
      if (!moved && route.length) route.shift();
      if (me.moving) {
        const before = Math.sin(me.walk); me.walk += dt * sp / 13; const after = Math.sin(me.walk);
        if (Math.sign(before) !== Math.sign(after)) { stepped = true; if (play) play.sound.step(me.run); }
        if (me.run && Math.random() < dt * 14) puffs.push({ x: me.x - me.vx * 0.04 + rnd(-4, 4), y: me.y, t: 0.5 });
        if (l) me.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (me.dir !== me.lastDir) { if (me.lastDir) me.turnT = 0.14; me.lastDir = me.dir; }
        else if (route.length) me.dir = Math.abs(me.vx) > Math.abs(me.vy) ? (me.vx > 0 ? 'right' : 'left') : (me.vy > 0 ? 'down' : 'up');
      }
    }
    stepPet(dt); stepTrail(dt, stepped);
    if (me.emote && me.emote.id === 'disco' && Math.random() < dt * 20) trail.push({ k: 'sparkle', x: me.x + rnd(-16, 16), y: me.y - rnd(10, 46), t: 0.6, life: 0.6, c: pick(['#ff4fd1', '#5ee7ff', '#ffd23d', '#3dff8f']) });
    if (me.turnT > 0) me.turnT = Math.max(0, me.turnT - dt);
    if (me.propT > 0 && (me.propT -= dt) <= 0) me.prop = null;
    if (me.bubble && (me.bubble.t -= dt) <= 0) me.bubble = null;
    // what's here?
    near = null; let best = 30;
    for (const o of usable()) { const d = Math.hypot(me.x - o.spot[0], (me.y - o.spot[1]) * 1.4); if (d < best) { best = d; near = o; } }
    if (near !== shownNear) { shownNear = near; showCard(); if (near && play) play.sound.notice(near); }
    if (!level && vipOpen && vipNew && me.x > 2120 && Math.abs(me.y - 656) < 90) { // the first time through: a welcome
      vipNew = false; try { localStorage.setItem('bitcade:vipseen', '1'); } catch (e) {}
      const s = STAFF.find(s => s.name === 'bouncer'); say(s, 'WELCOME TO THE VIP ROOM!', 3.2); me.bubble = { text: 'WHOA!', t: 2, cheer: true };
      if (play) play.sound.fanfare && play.sound.fanfare();
    }
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
    if (o.kind === 'stairs') return ride(o);
    if (o.kind === 'counter' || o.kind === 'vipcounter') return opt.onCounter();
    if (o.kind === 'vipdoor') {
      const s = STAFF.find(s => s.name === 'bouncer');
      if (vipOpen) say(s, pick(['WELCOME BACK, VIP.', 'GO ON IN.', 'LOOKING SHARP.']), 2.4);
      else { const st = VIP.status(); say(s, `VIPS ONLY. ${st.badges}/${st.NEED.badges} BADGES.`, 3); }
      return;
    }
    if (play) play.use(o);
  }
  /** Step up to a cabinet (into the seat, for a racer) and dive into its screen, then open the game. */
  function enter(c) {
    if (c.user) { const n = c.user; say(n, pick(['ALL YOURS!', 'YOUR TURN'])); n.act = null; n.t = 0; c.user = null; }
    if (reduced) return opt.onPlay(c.g);
    me.x = c.type === 'racer' ? c.seat[0] : c.spot[0]; me.y = c.type === 'racer' ? c.seat[1] : c.spot[1];
    me.dir = 'up'; me.pose = c.type === 'racer' ? 'sit' : ''; me.vx = me.vy = 0; route = [];
    me.entering = { c, t: 0, done: false, z0: zoom, cx: cam.x + SW / zoom / 2, cy: cam.y + SH / zoom / 2 };
    if (play) play.sound.enter(c);
  }
  function showCard() {
    const card = opt.card; if (!card) return;
    if (!near) { card.innerHTML = level ? '<span class="fl-tip">The Loft: the newest cabinets, the Sky Deck and Ticket Tide. The escalator takes you back down.</span>' : '<span class="fl-tip">Walk up to a cabinet to play it. Explore: the raceway, the shooting gallery, the lounge, the claw… and take the escalator up to the Loft.</span>'; return; }
    card.innerHTML = '';
    const info = document.createElement('div'), b = document.createElement('b'), small = document.createElement('small'), go = document.createElement('button');
    let c = near.c || '#5ee7ff';
    if (near.kind === 'cab') {
      const g = near.g, i = opt.info(g); b.textContent = g.name; c = g.c;
      small.textContent = `${g.kind.toUpperCase()} · ${i.label} ${i.best ? i.best.toLocaleString() : '—'} · ★ ${i.got}/${i.all}${opt.featured === g.slug ? ' · THIS WEEK’S TOURNAMENT' : ''}`;
      go.textContent = 'PLAY ▶';
    } else if (near.kind === 'vipdoor') {
      const st = window.VIP ? VIP.status() : { badges: 0, mastered: 0, earned: 0, NEED: { badges: 30, mastered: 3, earned: 1500 } };
      b.textContent = vipOpen ? 'VIP ROOM · OPEN' : 'VIP ROOM · LOCKED'; c = '#ffd23d';
      small.textContent = vipOpen ? 'The Hall of Masters, VIP prizes, your records and golden sodas.' : `Get in with ${st.NEED.badges} badges (${st.badges}), or ${st.NEED.mastered} mastered cabinets (${st.mastered}), or ${st.NEED.earned.toLocaleString()} tickets earned (${st.earned.toLocaleString()}).`;
      go.textContent = vipOpen ? 'GO IN ▶' : 'ASK ▶';
    }
    else if (near.kind === 'vipcounter') { b.textContent = 'VIP PRIZE COUNTER'; small.textContent = `TICKETS ${TICKETS.balance().toLocaleString()} · VIP exclusives: tuxedo, golden suit, velvet carpet, platinum cabinets`; go.textContent = 'OPEN ▶'; c = '#ffd23d'; }
    else if (near.kind === 'stairs') { b.textContent = near.down ? 'ESCALATOR · GROUND FLOOR' : 'ESCALATOR · THE LOFT'; small.textContent = near.down ? 'Back down to the main floor, the raceway, the lounge and the prize corner' : `Upstairs: ${loftGames.length} new arrival${loftGames.length === 1 ? '' : 's'}, the Sky Deck and Ticket Tide, the coin pusher`; go.textContent = near.down ? 'GO DOWN ▼' : 'GO UP ▲'; c = '#3dff8f'; }
    else if (near.kind === 'counter') { b.textContent = 'PRIZE COUNTER'; small.textContent = `TICKETS ${TICKETS.balance().toLocaleString()} · cosmetics for every game and this floor`; go.textContent = 'OPEN ▶'; c = '#ffd23d'; }
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
        [0, 9, 1, 3, 12, 13, 14, 15].forEach(i => { if (b(i)) now[i] = true; });
      }
    } catch (e) {}
    const tapd = i => now[i] && !padWas[i];
    if (mode) {
      if (tapd(0) || tapd(9)) mode.key('Enter', 'pad'); if (tapd(1)) mode.key('Escape');
      if (tapd(12)) mode.key('ArrowUp'); if (tapd(13)) mode.key('ArrowDown'); if (tapd(14)) mode.key('ArrowLeft'); if (tapd(15)) mode.key('ArrowRight');
      if (mode && mode.held) mode.held(p.x, p.y);
    } else if (tapd(0) || tapd(9)) interact();
    else if (tapd(3)) openEmotes(); // Y: emotes
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
      else if (mode.allKeys && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); mode.key(e.code); } // games that use letter and number keys
      keys.add(e.code); return;
    }
    if (MOVE_KEYS.includes(e.code)) { e.preventDefault(); keys.add(e.code); }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.add(e.code);
    else if (e.code === 'KeyE' && !e.repeat) { e.preventDefault(); openEmotes(); }
    else if ((e.code === 'Enter' || e.code === 'Space') && !(e.target.closest && e.target.closest('button,a'))) { e.preventDefault(); if (!e.repeat) interact(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const MAP = { x: SW - 172, y: 10, w: 162, h: 162 * WH / WW };
  function tap(e) {
    if (off() || me.entering) return;
    const r = cv.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * SW, vy = (e.clientY - r.top) / r.height * SH;
    if (mode) return mode.tap(vx - BX, vy - BY, e.pointerId);
    if (vx > EMOTE_BTN.x && vx < EMOTE_BTN.x + EMOTE_BTN.w && vy > EMOTE_BTN.y && vy < EMOTE_BTN.y + EMOTE_BTN.h) return openEmotes();
    if (vx > MAP.x && vx < MAP.x + MAP.w && vy > MAP.y && vy < MAP.y + MAP.h) { const wx = (vx - MAP.x) / MAP.w * WW, wy = (vy - MAP.y) / MAP.h * WH; return walkTo(wx, Math.max(WALL + 24, wy)); }
    const x = cam.x + vx / zoom, y = cam.y + vy / zoom;
    const o = usable().find(o => x > o.x && x < o.x + o.w && y > o.y - (o.kind === 'counter' ? 110 : 0) && y < o.y + o.h);
    if (o) { if (near === o) return interact(); return goUse(o); }
    walkTo(x, y);
  }

  /* ---------- light ---------- */
  const lightCv = document.createElement('canvas'), lx = lightCv.getContext('2d'); lightCv.width = SW / 2; lightCv.height = SH / 2;
  const LAMPS = [[300, 470], [1120, 300], [1120, 590], [1940, 470], [340, 1020], [200, 1180], [1120, 1000], [1940, 1000], [1980, 1060], [780, 960], [1480, 960], [1120, 1240]];
  function collectLights(t) {
    const L = [];
    for (const c of cabs) { const [sx, sy, sw, sh] = c.screen; L.push({ x: sx + sw / 2, y: c.type === 'table' ? sy + 30 : c.base + 6, r: c.type === 'table' ? 90 : 120, a: 0.9, c: mastered.has(c.g.slug) ? '#ffd23d' : c.g.c }); }
    if (level) { // upstairs: lamps, the windows' moonlight, the coin pusher, the escalator, the sign
      LOFT_LAMPS.forEach(([x, y]) => L.push({ x, y, r: 230, a: 0.45 }));
      L.push({ x: 1520, y: 240, r: 360, a: 0.75, c: '#9ad8ff' }, { x: 1310, y: 640, r: 170, a: 0.95, c: '#ffd23d' }, { x: 200, y: 1010, r: 170, a: 0.85, c: '#3dff8f' }, { x: 560, y: 120, r: 300, a: 0.9, c: '#3dff8f' }, { x: 560, y: 620, r: 260, a: 0.6, c: '#3dff8f' });
      const feat = cabs.find(c => c.g.slug === opt.featured); if (feat) L.push({ x: feat.spot[0], y: feat.spot[1] - 10, r: 170, a: 1, c: '#ffd23d' });
      hwLights(L, t); L.push({ x: me.x, y: me.y - 16, r: 110, a: 0.5 }); return L;
    }
    L.push({ x: 780, y: 720, r: 170, a: 0.85, c: '#3dff8f' }, { x: 420, y: 800, r: 120, a: 0.9, c: '#ffb870' }, { x: 40, y: 800, r: 120, a: 0.9, c: '#ffb870' }, { x: 1120, y: 1120, r: 150, a: 0.7, c: '#ff4fa3' });
    const flick = Math.sin(t / 97) > 0.97 || Math.sin(t / 61) > 0.985 ? 0.25 : 1; // the raceway sign is on the blink
    const flick2 = Math.sin(t / 131 + 2) > 0.985 ? 0.3 : 1;
    WALL_SIGNS.forEach(([, x, y], i) => L.push({ x, y: y + 60, r: i ? 200 : 300, a: 0.9 * (i === 1 ? flick : i === 2 ? flick2 : 1), c: WALL_SIGNS[i][4] }));
    LAMPS.forEach(([x, y]) => L.push({ x, y, r: 230, a: 0.42 }));
    L.push({ x: 1980, y: 760, r: 220, a: 0.95, c: '#ffd23d' }, { x: 1738, y: 980, r: 150, a: 0.9, c: '#5ee7ff' }, { x: 501, y: 700, r: 140, a: 0.9, c: ['#ff4fd1', '#ffd23d', '#22e0ff', '#3dff8f'][Math.floor(t / 600) % 4] },
      { x: 1120, y: 740, r: 190, a: 0.95, c: '#5ee7ff' }, { x: 1452, y: 720, r: 120, a: 0.8 + (booth.flash > 0 ? 1 : 0), c: '#ff4fa3' }, { x: 175, y: 690, r: 190, a: 0.9, c: '#ffb03d' }, { x: 1120, y: WH - 40, r: 220, a: 0.7, c: '#5ee7ff' });
    const feat = cabs.find(c => c.g.slug === opt.featured); if (feat) L.push({ x: feat.spot[0], y: feat.spot[1] - 10, r: 170, a: 1, c: '#ffd23d' });
    [[2400, 560], [2720, 560], [2400, 980], [2720, 980], [2560, 300]].forEach(([x, y]) => L.push({ x, y, r: 250, a: 0.7, c: '#ffd23d' }));
    L.push({ x: 2240, y: 656, r: 120, a: 0.8, c: vipOpen ? '#ffd23d' : '#ff4f6d' }, { x: 2560, y: 760, r: 180, a: 0.9, c: '#ffd23d' });
    hwLights(L, t); L.push({ x: me.x, y: me.y - 16, r: 110, a: 0.5 });
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
  const visible = (x, y, m = 160) => x > cam.x - m && x < cam.x + SW / zoom + m && y > cam.y - m && y < cam.y + SH / zoom + m;
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
      const rf = x.createLinearGradient(0, c.base, 0, c.base + 34); rf.addColorStop(0, rgba(col, 0.26)); rf.addColorStop(1, rgba(col, 0)); x.fillStyle = rf; x.fillRect(c.x + 6, c.base, c.w - 12, 34);
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
    if (level) { hang('SKY DECK', 1500, 420, '#5ee7ff'); hang('NEW ARRIVALS', 560, 380, '#3dff8f'); hang('TICKET TIDE', 1310, 500, '#ffd23d', 14); }
    else [[2400, 560], [2720, 560], [2400, 980], [2720, 980]].forEach(([cx, cy]) => { // chandeliers
      if (!visible(cx, cy, 120)) return;
      x.strokeStyle = '#6a5020'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx, cy - 90); x.lineTo(cx, cy - 30); x.stroke();
      x.fillStyle = '#c89a2a'; x.fillRect(cx - 24, cy - 32, 48, 4);
      for (let i = 0; i < 5; i++) { const px = cx - 22 + i * 11, tw = 0.6 + 0.4 * Math.sin(t / 200 + i + cx); x.fillStyle = `rgba(255,240,180,${tw})`; x.beginPath(); x.arc(px, cy - 22, 3, 0, 6.29); x.fill(); x.fillStyle = 'rgba(220,240,255,.7)'; x.fillRect(px - 1, cy - 18, 2, 6); }
    });
    if (!level) { if (!vipOpen) hang('VIP', 2240, 560, '#ffd23d', 16); hang('LOUNGE', 330, 760, '#b48cff'); hang('SNACKS', 175, 606, '#ffb03d', 14); hang('PRIZES', 1980, 580, '#ffd23d', 20); }
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
    x.font = '5px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText(o.name, X + o.w / 2, Y + 10, o.w - 14);
    // a little picture on the backglass, one per theme
    const bx = X + o.w / 2, by = Y + 2;
    if (o.theme === 'space') { x.fillStyle = '#ffd23d'; x.beginPath(); x.arc(bx + 16, by - 4, 4, 0, 6.29); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.ellipse(bx + 16, by - 4, 7, 2, -0.3, 0, 6.29); x.stroke(); }
    if (o.theme === 'sea') { x.fillStyle = '#ff9a3d'; x.beginPath(); x.ellipse(bx + 14, by - 4, 5, 3, 0, 0, 6.29); x.fill(); x.beginPath(); x.moveTo(bx + 18, by - 4); x.lineTo(bx + 22, by - 7); x.lineTo(bx + 22, by - 1); x.fill(); }
    if (o.theme === 'gold') { x.fillStyle = '#ffd23d'; x.beginPath(); x.moveTo(bx + 10, by - 1); x.lineTo(bx + 14, by - 7); x.lineTo(bx + 20, by - 6); x.lineTo(bx + 22, by - 1); x.fill(); }
    if (o.theme === 'tiki') { paint(x, [[bx + 11, by - 9, 9, 10, '#8a5a2a']]); x.fillStyle = '#ffd23d'; x.fillRect(bx + 13, by - 6, 2, 2); x.fillRect(bx + 17, by - 6, 2, 2); x.fillStyle = OUT; x.fillRect(bx + 13, by - 2, 6, 1); }
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
  /** The dance machine's pad: four arrow panels that light up as someone dances on it. */
  function drawDancePad(x, t, o) {
    paint(x, [[o.x, o.y, o.w, o.h, '#2a2054']]);
    const busy = o.cab.user || (me.entering && me.entering.c === o.cab) || (me.emote && me.x > o.x && me.x < o.x + o.w && me.y > o.y - 10 && me.y < o.y + o.h + 10), cols = ['#ff4fd1', '#5ee7ff', '#3dff8f', '#ffd23d'], cw = (o.w - 12) / 3, ch = (o.h - 8) / 3;
    [[0, 1, 0], [1, 2, 1], [1, 0, 2], [2, 1, 3]].forEach(([cx, cy, k]) => { const on = busy && Math.floor(t / 230 + k * 1.7) % 4 === 0; x.fillStyle = on ? cols[k] : shade(cols[k], -0.6); x.fillRect(o.x + 4 + cx * (cw + 2), o.y + 3 + cy * (ch + 1), cw, ch); });
    x.fillStyle = '#16122e'; x.fillRect(o.x + 4 + cw + 2, o.y + 3 + ch + 1, cw, ch);
  }
  /** The air hockey table, seen from above: a white top with red rails and the two goals. */
  function drawHockey(x, t, o) {
    const isNear = near === o; shadow(x, o.x + o.w / 2, o.y + o.h, o.w * 0.7, 8);
    if (isNear) { x.shadowColor = '#5ee7ff'; x.shadowBlur = 22; }
    paint(x, [[o.x, o.y, o.w, o.h, '#c8304a'], [o.x + 6, o.y + 6, o.w - 12, o.h - 12, '#e8f4ff']]); x.shadowBlur = 0;
    x.fillStyle = '#ff4f6d'; x.fillRect(o.x + 6, o.y + o.h / 2 - 1, o.w - 12, 2); x.strokeStyle = '#5ee7ff'; x.lineWidth = 1.5; x.beginPath(); x.arc(o.x + o.w / 2, o.y + o.h / 2, 10, 0, 6.29); x.stroke();
    x.fillStyle = OUT; x.fillRect(o.x + o.w / 2 - 12, o.y + 3, 24, 4); x.fillRect(o.x + o.w / 2 - 12, o.y + o.h - 7, 24, 4);
    const px = o.x + o.w / 2 + Math.sin(t / 300) * 18, py = o.y + o.h / 2 + Math.cos(t / 410) * 30;
    x.fillStyle = '#1a1a24'; x.beginPath(); x.arc(px, py, 4, 0, 6.29); x.fill();
    [[o.y + 18, '#ff4f6d'], [o.y + o.h - 18, '#3dd6ff']].forEach(([my, c]) => { x.fillStyle = OUT; x.beginPath(); x.arc(o.x + o.w / 2, my, 7, 0, 6.29); x.fill(); x.fillStyle = c; x.beginPath(); x.arc(o.x + o.w / 2, my, 5.5, 0, 6.29); x.fill(); });
  }
  /** The hoop shooter: a cabinet with a ramp, a net cage and a backboard; a ball arcs in now and then. */
  function drawHoops(x, t, o) {
    const X = o.x, Y = o.y, isNear = near === o; shadow(x, X + o.w / 2, Y + o.h, o.w * 0.6);
    if (isNear) { x.shadowColor = '#ff7a3d'; x.shadowBlur = 20; }
    paint(x, [[X, Y + 56, o.w, o.h - 56, '#2a2054'], [X - 2, Y, o.w + 4, 14, '#ff7a3d'], [X + 6, Y + 14, o.w - 12, 44, '#e8f4ff']]); x.shadowBlur = 0;
    x.strokeStyle = '#ff4f6d'; x.lineWidth = 2; x.strokeRect(X + o.w / 2 - 10, Y + 26, 20, 16);
    x.fillStyle = OUT; x.fillRect(X + o.w / 2 - 14, Y + 44, 28, 4); x.fillStyle = '#ff7a3d'; x.fillRect(X + o.w / 2 - 13, Y + 45, 26, 2);
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 1; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(X + o.w / 2 - 12 + i * 6, Y + 48); x.lineTo(X + o.w / 2 - 8 + i * 4, Y + 58); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 6; i++) x.fillRect(X + 4 + i * 12, Y + 60, 2, 40); // the cage
    x.fillStyle = '#1a1438'; x.fillRect(X + 8, Y + 100, o.w - 16, 16); for (let i = 0; i < 4; i++) { x.fillStyle = OUT; x.beginPath(); x.arc(X + 16 + i * 14, Y + 108, 5.5, 0, 6.29); x.fill(); x.fillStyle = '#d8601a'; x.beginPath(); x.arc(X + 16 + i * 14, Y + 108, 4.2, 0, 6.29); x.fill(); }
    const k = (t % 2200) / 2200; if (k < 0.5) { const u = k / 0.5, bx = X + o.w / 2 + (1 - u) * 14, by = Y + 100 - u * 54 - Math.sin(u * Math.PI) * 16; x.fillStyle = OUT; x.beginPath(); x.arc(bx, by, 5, 0, 6.29); x.fill(); x.fillStyle = '#ff9a3d'; x.beginPath(); x.arc(bx, by, 3.8, 0, 6.29); x.fill(); }
    x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText('HOOPS', X + o.w / 2, Y + 7);
  }
  /** The ticket wheel: a big lit wheel on a stand, turning slowly. */
  function drawWheel(x, t, o) {
    const cx = o.x + o.w / 2, cy = o.y + 58, r = 54, isNear = near === o; shadow(x, cx, o.y + o.h, o.w * 0.5);
    paint(x, [[cx - 8, cy + 30, 16, o.h - 88, '#8a8ea0'], [cx - 40, o.y + o.h - 30, 80, 14, '#3a3072']]);
    if (isNear) { x.shadowColor = '#ffd23d'; x.shadowBlur = 24; }
    x.fillStyle = OUT; x.beginPath(); x.arc(cx, cy, r + 6, 0, 6.29); x.fill(); x.shadowBlur = 0; x.fillStyle = '#c89a2a'; x.beginPath(); x.arc(cx, cy, r + 3, 0, 6.29); x.fill();
    const a0 = t / 2600, cols = ['#ff4f6d', '#5ee7ff', '#ffd23d', '#b86bff', '#3dff8f', '#ff7a3d', '#ff4fd1', '#3d7bff'];
    for (let i = 0; i < 16; i++) { x.fillStyle = i === 15 ? '#ffd23d' : cols[i % 8]; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, a0 + i / 16 * 6.283, a0 + (i + 1) / 16 * 6.283); x.closePath(); x.fill(); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; x.fillStyle = Math.floor(t / 160 + i) % 2 ? '#fff6c2' : '#7a5a2a'; x.beginPath(); x.arc(cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10), 2.5, 0, 6.29); x.fill(); }
    x.fillStyle = OUT; x.beginPath(); x.arc(cx, cy, 9, 0, 6.29); x.fill(); x.fillStyle = '#ffd23d'; x.beginPath(); x.arc(cx, cy, 7, 0, 6.29); x.fill();
    x.fillStyle = OUT; x.beginPath(); x.moveTo(cx - 7, cy - r - 12); x.lineTo(cx + 7, cy - r - 12); x.lineTo(cx, cy - r + 4); x.fill(); x.fillStyle = '#ff4f6d'; x.beginPath(); x.moveTo(cx - 5, cy - r - 10); x.lineTo(cx + 5, cy - r - 10); x.lineTo(cx, cy - r + 1); x.fill();
    x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffd23d'; let spun = false; try { const d = new Date(); spun = localStorage.getItem('bitcade:wheel') === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; } catch (e) {}
    x.fillText(spun ? 'SPUN TODAY' : 'FREE SPIN!', cx, o.y + o.h - 23);
  }
  /** Bop-a-Bot: a squat cabinet with nine holes and a robot or two poking out. */
  function drawBop(x, t, o) {
    const X = o.x, Y = o.y, isNear = near === o; shadow(x, X + o.w / 2, Y + o.h, o.w * 0.6);
    if (isNear) { x.shadowColor = '#5ee7ff'; x.shadowBlur = 20; }
    paint(x, [[X, Y + 30, o.w, o.h - 30, '#3a2468'], [X - 2, Y, o.w + 4, 30, '#2a2054']]); x.shadowBlur = 0;
    x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#5ee7ff'; x.fillText('BOP-A-BOT', X + o.w / 2, Y + 10);
    for (let i = 0; i < 9; i++) {
      const hx = X + 16 + (i % 3) * 24, hy = Y + 40 + Math.floor(i / 3) * 18, up = Math.sin(t / 300 + i * 2.1) > 0.75;
      x.fillStyle = '#0a0418'; x.beginPath(); x.ellipse(hx, hy + 4, 8, 3.5, 0, 0, 6.29); x.fill();
      if (up) { paint(x, [[hx - 5, hy - 6, 10, 9, i === 4 ? '#ffd23d' : '#5ee7ff']]); x.fillStyle = '#3dff8f'; x.fillRect(hx - 3, hy - 3, 2, 2); x.fillRect(hx + 1, hy - 3, 2, 2); }
    }
    paint(x, [[X + o.w - 14, Y + 20, 6, 28, '#a8703a'], [X + o.w - 22, Y + 14, 22, 10, '#ff4f6d']]); // the mallet on its hook
  }
  /** The putting green: a little course with a flag, a windmill bar and a bunker. */
  function drawGolf(x, t, o) {
    const isNear = near === o; shadow(x, o.x + o.w / 2, o.y + o.h, o.w * 0.55, 10);
    if (isNear) { x.shadowColor = '#3dff8f'; x.shadowBlur = 22; }
    paint(x, [[o.x, o.y, o.w, o.h, '#c87a3a'], [o.x + 6, o.y + 6, o.w - 12, o.h - 12, '#2f9a48']]); x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,.05)'; for (let i = o.x + 6; i < o.x + o.w - 6; i += 20) x.fillRect(i, o.y + 6, 10, o.h - 12);
    x.fillStyle = '#e8c890'; x.beginPath(); x.ellipse(o.x + 70, o.y + 100, 34, 18, 0, 0, 6.29); x.fill();
    x.fillStyle = OUT; x.beginPath(); x.arc(o.x + o.w - 50, o.y + 40, 6, 0, 6.29); x.fill();
    x.fillStyle = '#e8e4f0'; x.fillRect(o.x + o.w - 51, o.y + 12, 2, 28); x.fillStyle = '#ff4f6d'; x.beginPath(); x.moveTo(o.x + o.w - 49, o.y + 12); x.lineTo(o.x + o.w - 34, o.y + 17 + Math.sin(t / 220) * 2); x.lineTo(o.x + o.w - 49, o.y + 22); x.fill();
    const a = t / 600, cx = o.x + o.w / 2, cy = o.y + o.h / 2; x.strokeStyle = OUT; x.lineWidth = 7; x.beginPath(); x.moveTo(cx - Math.cos(a) * 32, cy - Math.sin(a) * 32); x.lineTo(cx + Math.cos(a) * 32, cy + Math.sin(a) * 32); x.stroke(); x.strokeStyle = '#ffd23d'; x.lineWidth = 4; x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(o.x + 40, o.y + o.h - 30, 3.5, 0, 6.29); x.fill();
    x.font = '10px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff6c2'; x.fillText('MINI GOLF', cx, o.y + o.h - 14);
  }
  /** The doorway: gold posts, and while it's shut a velvet rope and a sign. */
  function drawVipDoor(x, t, o) {
    const cx = 2240, isNear = near === o;
    [DOOR.y0 - 4, DOOR.y1 - 4].forEach(py => { x.fillStyle = OUT; x.fillRect(cx - 7, py - 22, 14, 28); paint(x, [[cx - 5, py - 20, 10, 24, '#ffd23d']]); x.fillStyle = '#fff6c2'; x.beginPath(); x.arc(cx, py - 22, 5, 0, 6.29); x.fill(); });
    if (!vipOpen) {
      if (isNear) { x.shadowColor = '#ff4f6d'; x.shadowBlur = 16; }
      x.strokeStyle = OUT; x.lineWidth = 7; x.beginPath(); x.moveTo(cx, DOOR.y0 - 18); x.quadraticCurveTo(cx + 12, (DOOR.y0 + DOOR.y1) / 2, cx, DOOR.y1 - 22); x.stroke();
      x.strokeStyle = '#c8203a'; x.lineWidth = 4; x.stroke(); x.shadowBlur = 0;
      x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; paint(x, [[cx - 26, DOOR.y0 + 30, 22, 16, '#1a1020']]); x.fillStyle = '#ffd23d'; x.fillText('VIP', cx - 15, DOOR.y0 + 38);
    }
  }
  function drawPlinth(x, t, o) {
    shadow(x, o.x + 30, o.base, 34);
    paint(x, [[o.x + 6, o.y + 22, 48, 42, '#2a1a24'], [o.x, o.y + 14, 60, 10, '#3a2430']]);
    x.fillStyle = '#ffd23d'; x.fillRect(o.x + 6, o.y + 24, 48, 2);
    x.font = '16px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(255,210,61,.35)'; x.fillText('?', o.x + 30, o.y - 4 + Math.sin(t / 500 + o.x) * 2);
    x.font = '6px Silkscreen, monospace'; x.fillStyle = '#c8a050'; x.fillText('MASTER ONE', o.x + 30, o.y + 40); x.fillText('TO FILL ME', o.x + 30, o.y + 48);
  }
  function drawVipCounter(x, t, o) {
    const isNear = near === o;
    if (isNear) { x.shadowColor = '#ffd23d'; x.shadowBlur = 24; }
    paint(x, [[o.x, o.y + 18, o.w, o.h - 18, '#1a1020'], [o.x + 6, o.y + 2, o.w - 12, 18, 'rgba(255,230,160,.22)', true], [o.x - 2, o.y + 18, o.w + 4, 5, '#ffd23d']]);
    x.shadowBlur = 0;
    ['#ffd23d', '#e8ecf4', '#c8203a', '#ffd23d', '#9ad8ff', '#ffd23d'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(o.x + 26 + i * 38, o.y + 12, 5, 0, 6.29); x.fill(); x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(o.x + 24 + i * 38, o.y + 9, 2, 2); });
    x.font = '12px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffd23d'; x.fillText('VIP PRIZES', o.x + o.w / 2, o.y + 46);
  }
  /** Your records: a gold-framed board of your best runs. */
  function drawRecords(x, t, o) {
    const isNear = near === o;
    shadow(x, o.x + o.w / 2, o.y + o.h, o.w * 0.5, 7);
    paint(x, [[o.x + 20, o.y + 110, 8, 30, '#6a4a20'], [o.x + o.w - 28, o.y + 110, 8, 30, '#6a4a20']]);
    if (isNear) { x.shadowColor = '#ffd23d'; x.shadowBlur = 24; }
    paint(x, [[o.x, o.y, o.w, 116, '#c89a2a']]); x.shadowBlur = 0;
    x.fillStyle = '#120a06'; x.fillRect(o.x + 6, o.y + 6, o.w - 12, 104);
    x.font = '11px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffd23d'; x.fillText('YOUR RECORDS', o.x + o.w / 2, o.y + 18);
    const rows = cabs.filter(c => !c.vip).map(c => ({ n: c.g.name.toUpperCase(), b: opt.info(c.g).best || 0, c: c.g.c })).filter(r => r.b).sort((a, b) => b.b - a.b).slice(0, 5);
    x.font = '7px Silkscreen, monospace';
    if (!rows.length) { x.fillStyle = '#c8a050'; x.fillText('PLAY TO FILL THIS', o.x + o.w / 2, o.y + 60); }
    rows.forEach((r, i) => { const y = o.y + 36 + i * 15; x.textAlign = 'left'; x.fillStyle = r.c; x.fillText(r.n, o.x + 14, y, 110); x.textAlign = 'right'; x.fillStyle = '#fff6c2'; x.fillText(r.b.toLocaleString(), o.x + o.w - 14, y); });
  }
  /** The golden soda bar, with a fountain of gold and glasses on the shelf. */
  function drawVipBar(x, t, o) {
    const isNear = near === o;
    if (isNear) { x.shadowColor = '#ffd23d'; x.shadowBlur = 22; }
    paint(x, [[o.x, o.y + 14, o.w, o.h - 14, '#2a1a0a'], [o.x - 2, o.y + 10, o.w + 4, 7, '#ffd23d']]);
    x.shadowBlur = 0;
    paint(x, [[o.x + 20, o.y - 20, 44, 32, '#c0c6d0']]);
    for (let i = 0; i < 3; i++) { x.fillStyle = '#ffd23d'; x.fillRect(o.x + 27 + i * 12, o.y - 14, 6, 10); x.fillStyle = 'rgba(255,240,170,.8)'; x.fillRect(o.x + 29 + i * 12, o.y - 4 + ((t / 90 + i * 3) % 8), 2, 3); }
    for (let i = 0; i < 6; i++) { const gx = o.x + 90 + i * 20; paint(x, [[gx, o.y - 4, 8, 12, 'rgba(255,230,160,.45)']]); x.fillStyle = '#ffd23d'; x.fillRect(gx + 1, o.y + 2, 6, 5); }
    x.font = '9px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffd23d'; x.fillText('GOLDEN SODA', o.x + o.w / 2, o.y + 40);
  }
  function drawObj(x, o, t) {
    switch (o.kind) {
      case 'cab': return drawCab(x, o, t);
      case 'seat': return drawSeat(x, o);
      case 'snack': return drawSnack(x, t, o);
      case 'jukebox': return drawJukeboxBig(x, t, o);
      case 'sofa': return drawSofa(x, o.x, o.y, o.w, o.gold ? '#8a1a2a' : '#6a3aa8');
      case 'beanbag': return drawBeanbag(x, o);
      case 'board': return drawBoard(x, t, o);
      case 'booth': return drawBooth(x, t, o);
      case 'shelf': return drawShelf(x, t, o);
      case 'counter': return drawCounter(x, t, o.x, o.y, o.w, o.h);
      case 'claw': return drawBigClaw(x, t, o);
      case 'vipdoor': return drawVipDoor(x, t, o);
      case 'dancepad': return drawDancePad(x, t, o);
      case 'hockey': return drawHockey(x, t, o);
      case 'golf': return drawGolf(x, t, o);
      case 'hoops': return drawHoops(x, t, o);
      case 'wheel': return drawWheel(x, t, o);
      case 'bop': return drawBop(x, t, o);
      case 'plinth': return drawPlinth(x, t, o);
      case 'vipcounter': return drawVipCounter(x, t, o);
      case 'records': return drawRecords(x, t, o);
      case 'vipbar': return drawVipBar(x, t, o);
      case 'rail': return drawRail(x, t, o);
      case 'pinball': return drawPinball(x, t, o);
      case 'skee': return drawSkee(x, t, o);
      case 'bench': return drawBench(x, o);
      case 'plant': return drawPlant(x, o.x, o.y);
      case 'stairs': return drawStairs(x, t, o);
      case 'arch': return drawArch(x, t, o);
      case 'tyres': return drawTyres(x, o);
      case 'lamp': return drawLamp(x, t, o);
      case 'pusher': return drawPusher(x, t, o);
      case 'scope': return drawScope(x, t, o);
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
    camera(dt); ghostStep(dt);
    if (play) play.tick(dt, now, { me, cabs, npcs, cam, zoom, near });
    draw(now, dt);
    if (me.entering && me.entering.t > 0.8 && !me.entering.done) { me.entering.done = true; opt.onPlay(me.entering.c.g); }
    raf = requestAnimationFrame(frame);
  }
  function camera(dt) {
    baseZoom = fitZoom;
    if (me.entering) {
      const e = me.entering, k = Math.min(1, e.t / 0.8), ease = k * k * (3 - 2 * k), [sx, sy, sw, sh] = e.c.screen;
      zoom = e.z0 + (SW / (sw + 6) * 0.98 - e.z0) * ease;
      const cx = e.cx + (sx + sw / 2 - e.cx) * ease, cy = e.cy + (sy + sh / 2 - e.cy) * ease;
      cam.x = cx - SW / zoom / 2; cam.y = cy - SH / zoom / 2; return;
    }
    zoom += (baseZoom - zoom) * Math.min(1, dt * 4);
    const vw = SW / zoom, vh = SH / zoom, tx = me.x + me.vx * 0.35 - vw / 2, ty = me.y - 30 + me.vy * 0.3 - vh / 2;
    const k = Math.min(1, dt * 5);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.x = Math.max(0, Math.min(WW - vw, cam.x)); cam.y = Math.max(0, Math.min(WH - vh, cam.y));
  }
  function snapCamera() { const vw = SW / zoom, vh = SH / zoom; cam.x = Math.max(0, Math.min(WW - vw, me.x - vw / 2)); cam.y = Math.max(0, Math.min(WH - vh, me.y - 30 - vh / 2)); }
  function draw(t, dt) {
    const x = ctx; background();
    const L = collectLights(t); lightMap(L);
    const S = dpr * zoom, vw = SW / zoom, vh = SH / zoom;
    x.setTransform(S, 0, 0, S, -cam.x * S, -cam.y * S); x.imageSmoothingEnabled = false;
    const sx = Math.max(0, Math.floor(cam.x)), sy = Math.max(0, Math.floor(cam.y)), sw = Math.min(WW - sx, Math.ceil(vw) + 2), sh = Math.min(WH - sy, Math.ceil(vh) + 2);
    x.drawImage(bg, sx, sy, sw, sh, sx, sy, sw, sh);
    // the dark, then what glows on the floor through it: blacklight carpet, pools of cabinet light
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.globalAlpha = 0.6; x.imageSmoothingEnabled = true; x.drawImage(lightCv, 0, 0, SW, SH); x.globalAlpha = 1;
    x.setTransform(S, 0, 0, S, -cam.x * S, -cam.y * S); x.imageSmoothingEnabled = false;
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.5; x.drawImage(glowBg, sx, sy, sw, sh, sx, sy, sw, sh); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    pools(x, L); beams(x, t, dt || 0.016); hwFloor(x, t);
    if (!level) { if (owns('disco')) discoSpots(x, t); if (owns('strips')) drawStrips(x, t); drawTargets(x, t); }
    for (const p of puffs) { x.fillStyle = `rgba(200,190,230,${p.t})`; x.beginPath(); x.arc(p.x, p.y - (0.5 - p.t) * 10, 3 + (0.5 - p.t) * 8, 0, 6.29); x.fill(); }
    drawTrail(x);
    // everything standing, back to front
    const list = objs.filter(o => visible(o.x, o.y, 120)).map(o => [o.base, () => drawObj(x, o, t)]);
    if (!level) for (const s of STAFF) if (visible(s.x, s.y)) list.push([s.y, () => drawWalker(x, s.x, s.y, s.dir || 'down', 0, false, s.look, s.bubble && s.bubble.t > 2 ? 'wave' : '')]);
    for (const n of npcs) if (visible(n.x, n.y)) list.push([n.y, () => drawWalker(x, n.x, n.y, n.dir, n.walk, n.moving, n.look, n.pose, n.prop)]);
    const em = me.emote ? emoteLook(me.emote) : null;
    list.push([me.y, () => {
      if (me.turnT > 0 && !em) { const k = me.turnT / 0.14; x.save(); x.translate(me.x, me.y); x.scale(1 - k * 0.22, 1 + k * 0.08); x.translate(-me.x, -me.y); drawWalker(x, me.x, me.y, me.dir, me.walk, me.moving, equip().outfit || '', me.pose || (me.bubble && me.bubble.cheer ? 'cheer' : ''), me.prop); x.restore(); return; }
      if (!em) return drawWalker(x, me.x, me.y, me.dir, me.walk, me.moving, equip().outfit || '', me.pose || (me.bubble && me.bubble.cheer ? 'cheer' : ''), me.prop);
      const sc = em.scale || 1; x.save(); x.translate(me.x, me.y - (em.lift || 0)); x.scale(sc, sc); x.translate(-me.x, -me.y);
      drawWalker(x, me.x, me.y, em.dir || me.dir, 0, false, equip().outfit || '', em.pose, me.prop); x.restore();
    }]);
    if (equip().pet && !me.entering) list.push([pet.y + (FLYERS.includes(equip().pet) ? 30 : 0), () => drawPet(x, equip().pet, pet.x, pet.y, pet.dir, pet.t, pet.moving, pet.hop)]);
    ghostDraws(list, x, t);
    list.sort((a, b) => a[0] - b[0]).forEach(d => d[1]());
    // a lighter dark over everything, then the glows
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.globalAlpha = 0.34; x.imageSmoothingEnabled = true; x.drawImage(lightCv, 0, 0, SW, SH); x.globalAlpha = 1;
    x.setTransform(S, 0, 0, S, -cam.x * S, -cam.y * S);
    glows(x, t);
    if (!level && owns('disco')) drawDisco(x, t);
    overhead(x, t); dust(x, t);
    if (route.length && !mode) { const [tx, ty] = route[route.length - 1]; x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2; x.beginPath(); x.ellipse(tx, ty, 10 + Math.sin(t / 150), 4, 0, 0, 6.29); x.stroke(); }
    // on the screen: haze, speech bubbles, the area name, the minimap, whatever's open
    x.setTransform(dpr, 0, 0, dpr, 0, 0); haze(x, t); hwScreen(x, t, dt || 0.016);
    if (window.XP && !me.entering) { const lv = XP.info(); if (lv.level >= 3) { // the nameplate: level and initials over your head
      const ini = initials() || 'YOU', tx = `LV ${lv.level} · ${ini}`, nx = (me.x - cam.x) * zoom, ny = (me.y - 60 - cam.y) * zoom - (me.bubble ? 30 : 0);
      x.font = '9px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; const w = x.measureText(tx).width + 12;
      x.fillStyle = 'rgba(10,6,18,.75)'; x.fillRect(nx - w / 2, ny - 7, w, 14); x.strokeStyle = lv.level >= 30 ? '#ffd23d' : '#5ee7ff'; x.lineWidth = 1; x.strokeRect(nx - w / 2 + .5, ny - 6.5, w - 1, 13);
      x.fillStyle = lv.level >= 30 ? '#ffd23d' : '#fff'; x.fillText(tx, nx, ny + 1); } }
    for (const n of [...npcs, ...(level ? [] : STAFF), me]) if (n.bubble && visible(n.x, n.y, 0)) bubble(x, (n.x - cam.x) * zoom, (n.y - 50 - cam.y) * zoom, n.bubble.text, n === me);
    if (me.ride) { const r = me.ride, a = r.t < 0.45 ? r.t / 0.45 : Math.max(0, (0.9 - r.t) / 0.45); x.fillStyle = `rgba(5,2,12,${a})`; x.fillRect(0, 0, SW, SH); x.globalAlpha = a; neon(x, r.to ? 'GOING UP…' : 'GOING DOWN…', SW / 2, SH / 2, 30, '#3dff8f'); x.globalAlpha = 1; }
    if (me.entering) { const k = Math.min(1, me.entering.t / 0.8); x.fillStyle = `rgba(255,255,255,${Math.max(0, k - 0.75) * 2})`; x.fillRect(0, 0, SW, SH); return; }
    if (zoneT > 0 && zoneName) {
      const a = Math.min(1, zoneT * 2, (2.4 - zoneT) * 4), z = zones().find(z => z.name === zoneName);
      x.globalAlpha = a; x.font = '26px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = OUT; x.fillText(zoneName, SW / 2 + 3, SH - 37); x.shadowColor = z.c; x.shadowBlur = 16; x.fillStyle = z.c; x.fillText(zoneName, SW / 2, SH - 40); x.shadowBlur = 0; x.globalAlpha = 1;
    }
    minimap(x, t);
    if (!mode) drawEmoteButton(x);
    if (mode) { if (BX || BY) { x.fillStyle = 'rgba(5,2,12,.6)'; x.fillRect(0, 0, SW, SH); } x.translate(BX, BY); mode.draw(x, t, dt); }
  }
  function bubble(x, bx, by, text, mine) {
    x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(320, x.measureText(text).width + 16), h = 22, X = Math.max(4, Math.min(SW - w - 4, bx - w / 2)), Y = Math.max(4, by - h);
    x.fillStyle = OUT; x.fillRect(X - 2, Y - 2, w + 4, h + 4); x.fillStyle = mine ? '#ffd23d' : '#f4effd'; x.fillRect(X, Y, w, h);
    x.beginPath(); x.moveTo(bx - 5, Y + h); x.lineTo(bx + 5, Y + h); x.lineTo(bx, Y + h + 7); x.fill();
    x.fillStyle = '#140c24'; x.fillText(text, X + w / 2, Y + h / 2 + 1, w - 8);
  }
  function minimap(x, t) {
    const { x: mx, y: my, w, h } = MAP, k = w / WW;
    const zc = (zones().find(z => z.name === zoneName) || {}).c || '#5ee7ff';
    x.fillStyle = 'rgba(10,6,18,.78)'; x.fillRect(mx - 4, my - 4, w + 8, h + 8); x.strokeStyle = rgba(zc, 0.7); x.lineWidth = 2; x.strokeRect(mx - 4, my - 4, w + 8, h + 8);
    for (const z of zones()) { x.fillStyle = rgba(z.c, z.name === zoneName ? 0.22 : 0.09); x.fillRect(mx + z.x * k, my + Math.max(WALL, z.y) * k, z.w * k - 1, (z.y ? z.h : z.h - WALL) * k - 1); }
    for (const o of objs) { if (o.kind === 'plant' || o.kind === 'seat') continue; x.fillStyle = o.kind === 'cab' ? (mastered.has(o.g.slug) ? '#ffd23d' : o.g.c) : o.kind === 'counter' ? '#ffd23d' : o.kind === 'claw' ? '#5ee7ff' : 'rgba(255,255,255,.35)'; x.fillRect(mx + o.x * k, my + o.y * k, Math.max(2, o.w * k), Math.max(2, o.h * k)); }
    x.fillStyle = 'rgba(255,255,255,.55)'; for (const n of npcs) x.fillRect(mx + n.x * k - 1, my + n.y * k - 1, 2, 2);
    const vw = SW / zoom, vh = SH / zoom; x.strokeStyle = 'rgba(255,255,255,.4)'; x.strokeRect(mx + cam.x * k, my + cam.y * k, vw * k, vh * k);
    x.fillStyle = Math.floor(t / 300) % 2 ? '#fff' : '#ffd23d'; x.fillRect(mx + me.x * k - 2, my + me.y * k - 2, 4, 4);
    x.font = '9px Silkscreen, monospace'; const tab = level ? 'THE LOFT · 2F' : 'GROUND · 1F', tw = x.measureText(tab).width + 14;
    x.fillStyle = 'rgba(10,6,18,.85)'; x.fillRect(mx + w + 4 - tw, my + h + 4, tw, 15); x.strokeStyle = rgba(zc, 0.7); x.lineWidth = 2; x.strokeRect(mx + w + 4 - tw, my + h + 4, tw, 15);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = level ? '#3dff8f' : '#e8e4f0'; x.fillText(tab, mx + w + 4 - tw / 2, my + h + 12);
  }

  /**
   * Size the view to the canvas: the 960x600 box fits inside it and the view grows the other way (taller on a phone held
   * upright, wider on a wide window), and on a big canvas the panels and minimap stop growing at 1.2x. The zoom keeps people a comfortable size: closer in on small canvases, a little
   * more of the room on big ones. True when the size changed.
   */
  function fit() {
    const w = cv.clientWidth || 960, h = cv.clientHeight || 600, k = Math.min(w / VW, h / VH, 1.2), r = Math.min(2, window.devicePixelRatio || 1);
    const sw = Math.round(w / k), sh = Math.round(h / k), bw = Math.round(w * r), bh = Math.round(h * r);
    if (sw === SW && sh === SH && cv.width === bw && cv.height === bh) return false;
    SW = sw; SH = sh; BX = Math.round((SW - VW) / 2); BY = Math.round((SH - VH) / 2);
    cv.width = bw; cv.height = bh; dpr = bw / SW;
    lightCv.width = Math.ceil(SW / 2); lightCv.height = Math.ceil(SH / 2);
    MAP.x = SW - 172; EMOTE_BTN.y = SH - 46;
    fitZoom = Math.min(1.8, Math.max(0.93, Math.min(w, h * 1.6) / 600)) / k;
    return true;
  }

  /* ---------- the kit floor-play.js builds on ---------- */
  const kit = {
    VW, VH, OUT, shade, paint, rgba, star, neon, drawWalker, randomLook, icon, footage, owns,
    get opt() { return opt; }, get me() { return me; }, get cabs() { return cabs; }, get allCabs() { return [...cabs, ...((saved[1 - level] || {}).cabs || [])]; }, get level() { return level; }, get npcs() { return npcs; }, get mastered() { return mastered; },
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
      ctx = cv.getContext('2d'); fit();
      if (window.ResizeObserver) new ResizeObserver(() => { if (fit() && running) snapCamera(); }).observe(cv);
      cv.addEventListener('pointerdown', tap);
      cv.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); // no long-press menus: they cancel held touches (skee-ball, flippers)
      cv.addEventListener('contextmenu', e => e.preventDefault());
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => cv.addEventListener(ev, e => { if (mode && mode.untap) mode.untap(e.pointerId); }));
      cv.addEventListener('pointermove', e => { if (!mode || !mode.move) return; const r = cv.getBoundingClientRect(); mode.move((e.clientX - r.left) / r.width * SW - BX, (e.clientY - r.top) / r.height * SH - BY, e.buttons > 0); });
      play = window.FloorPlay ? window.FloorPlay(kit) : null;
      if (window.Prizes) Prizes.onChange(() => { bgKey = null; buildSolids(); showCard(); });
      if (document.fonts) { document.fonts.ready.then(() => { bgKey = null; }); document.fonts.addEventListener('loadingdone', () => { bgKey = null; }); } // the neon signs use Bungee
      buildSolids(); spawnPeople(); layoutLoft(); [...cabs, ...saved[1].cabs].forEach(c => footage(c.g.slug));
    },
    start() {
      if (running) return; running = true;
      const upstairs = level; if (upstairs) swap(0); // the VIP room is downstairs
      mastered = new Set([...cabs, ...saved[1].cabs].filter(c => { const i = opt.info(c.g); return i.all && i.got === i.all; }).map(c => c.g.slug));
      const wasOpen = vipOpen; layoutVip(); if (vipOpen !== wasOpen || !npcs.some(n => n.vip) !== !vipOpen) spawnVipPeople();
      try { vipNew = vipOpen && localStorage.getItem('bitcade:vipseen') !== '1'; } catch (e) {}
      const bouncer = STAFF.find(s => s.name === 'bouncer'); bouncer.y = vipOpen ? 590 : 712;
      buildSolids(); bgKey = null; if (upstairs) { swap(1); buildSolids(); bgKey = null; } shownNear = undefined; me.entering = null; me.ride = null; me.pose = ''; mode = null;
      fit(); zoom = baseZoom = fitZoom; snapCamera();
      npcs.forEach(n => { if (!n.act) n.t = rnd(0, 2); });
      last = performance.now(); raf = requestAnimationFrame(frame);
      if (play) play.sound.start();
    },
    stop() { running = false; cancelAnimationFrame(raf); keys.clear(); route = []; mode = null; if (play) play.sound.stop(); },
    /** Test and debug hook: where the walker is, what it's standing at, and what's open. */
    state: () => ({ x: me.x, y: me.y, near: near && (near.kind === 'cab' ? near.g.slug : near.kind), mode: mode ? mode.name : null, people: npcs.length, zone: zoneName, level, loft: loftGames.map(g => g.slug), ghosts: (ghostDay() || { list: [] }).list.map(g => ({ x: g.x, y: g.y, got: g.got })) }),
    /** Put the walker in front of a cabinet (by slug) or a thing ('counter', 'claw', 'jukebox', 'board', 'booth', 'snack', 'stairs', 'pusher'), upstairs or down. */
    goTo(what) {
      if (Array.isArray(what)) { me.x = what[0]; me.y = what[1]; route = []; if (running) snapCamera(); return; }
      const other = saved[1 - level], there = other && (other.cabs.find(c => c.g.slug === what && !c.vip) || other.objs.find(o => o.kind === what && o.spot));
      if (there && !cabs.find(c => c.g.slug === what && !c.vip) && !objs.find(o => o.kind === what && o.spot)) { swap(1 - level); buildSolids(); } // it's on the other floor
      const o = cabs.find(c => c.g.slug === what && !c.vip) || objs.find(o => o.kind === what && o.spot);
      if (o) { me.x = o.spot[0]; me.y = o.spot[1]; me.vx = me.vy = 0; route = []; }
      me.dir = 'up'; if (running) snapCamera();
    },
    interact,
    /** Prize-counter previews for the floor's own prizes; false for the others. */
    preview(p, x, w, h) {
      const t = performance.now();
      if (p.slot === 'outfit') { x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); x.save(); x.scale(1.3, 1.3); drawWalker(x, w / 2 / 1.3, (h - 6) / 1.3, 'down', 0, false, p.id); x.restore(); return true; }
      if (p.slot === 'carpet') { carpet(x, p.id, w, h); return true; }
      if (p.slot === 'pet') { x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); x.save(); x.scale(2, 2); drawPet(x, p.id, w / 4, h / 2 - 6 + (FLYERS.includes(p.id) ? 10 : 0), 'right', t / 1000, false, 0); x.restore(); return true; }
      if (p.slot === 'emote') { x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); const em = emoteLook({ id: p.id, t: (t / 1000) % EMOTES[p.id][1], dur: EMOTES[p.id][1] }); x.save(); x.translate(w / 2, h - 5 - (em.lift || 0) * 0.5); x.scale(0.95 * (em.scale || 1), 0.95 * (em.scale || 1)); drawWalker(x, 0, 0, em.dir || 'down', 0, false, equip().outfit || '', em.pose); x.restore(); return true; }
      if (p.slot === 'trail') {
        x.fillStyle = '#140c24'; x.fillRect(0, 0, w, h); const c = { sparkle: '#ffd23d', neonprint: '#5ee7ff', bubbles: '#9ae8ff', rainbow: '#ff4fd1', flame: '#ff8a3d' }[p.id] || '#fff';
        for (let i = 0; i < 9; i++) { const px = 10 + i * (w - 20) / 8, py = h - 14 - Math.sin(i * 0.7) * 10, a = (i + 1) / 9; x.globalAlpha = a; x.fillStyle = p.id === 'rainbow' ? `hsl(${i * 40},95%,60%)` : i % 2 && p.id === 'neonprint' ? '#ff4fd1' : c;
          if (p.id === 'bubbles') { x.strokeStyle = c; x.beginPath(); x.arc(px, py - i * 2, 3, 0, 6.29); x.stroke(); } else { x.beginPath(); x.arc(px, py, p.id === 'neonprint' ? 3 : 2 + a * 2, 0, 6.29); x.fill(); } }
        x.globalAlpha = 1; drawWalker(x, w - 14, h - 8, 'right', t / 120, true, equip().outfit || ''); return true;
      }
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
