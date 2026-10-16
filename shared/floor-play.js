/*
 * Things to do on the arcade floor, and its sounds (lobby only): window.FloorPlay(kit), called by shared/floor.js.
 *
 * - The jukebox plays any cabinet's theme (or the Bitcade theme) in the lobby; the choice is kept in bitcade:jukebox.
 * - The high-score wall lists every cabinet's world record and your best.
 * - The photo booth takes four shots of your arcade-goer in their outfit, as a strip you can save.
 * - The Mega Claw: three free goes a day (four with the prize counter's Claw Machine), for tickets.
 * - The snack bar hands you a soda.
 * - Sound: a crowd murmur, cabinets bleeping as you pass (louder when near, panned left or right), footsteps,
 *   a jingle when a cabinet notices you, cheers. Silent when SOUND is off (arcade:muted).
 */
window.FloorPlay = kit => {
  const { VW, VH, OUT } = kit;
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const pick = a => a[Math.random() * a.length | 0], rnd = (a, b) => a + Math.random() * (b - a);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

  /* ---------- sound ---------- */
  let ac = null, bus = null, nb = null, amb = null;
  function A() {
    if (get('arcade:muted') === '1') return null;
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.connect(ac.destination);
        bus = ac.createGain(); bus.gain.value = 0.8; bus.connect(comp);
        nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  const panTo = (node, pan) => { if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); return p; } return node; };
  function tone(f, dur, vol, { type = 'square', at = 0, f1 = f, pan = 0 } = {}) {
    if (!A()) return; const t = ac.currentTime + 0.01 + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f1 !== f) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    panTo(o.connect(g), pan).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(dur, vol, { type = 'lowpass', f = 800, f1 = f, q = 0.8, at = 0, pan = 0, attack = 0.005 } = {}) {
    if (!A()) return; const t = ac.currentTime + 0.01 + at, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; s.loop = true; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    panTo(s.connect(fl).connect(g), pan).connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
  const scaleOf = slug => { const h = hash(slug); return { base: 196 * Math.pow(2, (h % 12) / 12), type: ['square', 'triangle', 'sawtooth'][h % 3] }; };
  const note = (s, i) => s.base * Math.pow(2, PENTA[i % PENTA.length] / 12) * (i >= PENTA.length ? 2 : 1);
  const sound = {
    start() {
      if (!A() || amb) return;
      // the crowd: a murmur of filtered noise that swells and fades
      const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      s.buffer = nb; s.loop = true; fl.type = 'bandpass'; fl.frequency.value = 520; fl.Q.value = 0.6;
      g.gain.value = 0.0001; g.gain.setTargetAtTime(0.03, ac.currentTime, 0.8);
      lfo.frequency.value = 0.23; lg.gain.value = 0.012; lfo.connect(lg).connect(g.gain);
      s.connect(fl).connect(g).connect(bus); s.start(); lfo.start(); amb = { s, g, lfo };
    },
    stop() { if (!amb) return; const { s, g, lfo } = amb, t = ac.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.15); s.stop(t + 0.6); lfo.stop(t + 0.6); amb = null; },
    step(run) { hiss(run ? 0.05 : 0.04, run ? 0.07 : 0.04, { f: rnd(260, 420) }); },
    /** A cabinet notices you: three notes in its key. Other things: a chime. */
    notice(o) {
      if (o.kind !== 'cab') return tone(1320, 0.08, 0.025, { type: 'triangle' });
      const s = scaleOf(o.g.slug); [0, 2, 4].forEach((k, i) => tone(note(s, k + 3), 0.09, 0.035, { type: s.type, at: i * 0.07 }));
    },
    zone() { hiss(0.5, 0.025, { type: 'bandpass', f: 600, f1: 2400, attack: 0.25 }); },
    enter(c) { tone(220, 0.8, 0.04, { f1: 1760, type: 'square' }); tone(440, 0.8, 0.02, { f1: 3520, type: 'triangle', at: 0.05 }); hiss(0.8, 0.04, { type: 'highpass', f: 1500, f1: 6000, attack: 0.6 }); },
    react(x, yay) {
      const pan = (x - kit.me.x) / 300, d = Math.abs(x - kit.me.x); if (d > 600) return; const v = 1 - d / 600;
      if (yay) { hiss(0.6, 0.05 * v, { type: 'bandpass', f: 1300, q: 0.7, pan, attack: 0.05 }); tone(784, 0.1, 0.02 * v, { pan }); tone(1047, 0.14, 0.02 * v, { at: 0.1, pan }); }
      else tone(392, 0.4, 0.025 * v, { f1: 196, type: 'triangle', pan });
    },
    select() { tone(1046, 0.05, 0.03); },
    back() { tone(523, 0.08, 0.03, { f1: 392 }); },
    fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 0.04, { at: i * 0.08 })); },
    shutter() { hiss(0.08, 0.2, { type: 'highpass', f: 2500 }); hiss(0.05, 0.15, { type: 'bandpass', f: 1200, at: 0.09 }); },
    beep(hi) { tone(hi ? 1760 : 880, 0.1, 0.04); },
    motor() { tone(110, 0.12, 0.012, { type: 'sawtooth' }); },
    clank() { tone(620, 0.25, 0.04, { f1: 600, type: 'triangle' }); tone(1180, 0.18, 0.02, { type: 'triangle' }); hiss(0.08, 0.1, { f: 1400 }); },
    thud() { tone(140, 0.15, 0.08, { f1: 60, type: 'sine' }); },
    fizz() { hiss(0.9, 0.05, { type: 'highpass', f: 4000, attack: 0.02 }); tone(660, 0.06, 0.02, { type: 'triangle' }); }
  };
  /** Cabinets near you bleep and bloop, louder when close, from the side they're on; busier while someone plays. */
  function cabinetNoise(dt, s) {
    if (!ac || get('arcade:muted') === '1') return;
    for (const c of s.cabs) {
      const cx = c.x + c.w / 2, d = Math.hypot(cx - s.me.x, (c.base - s.me.y) * 1.3); if (d > 460) continue;
      const busy = c.user ? 2.4 : 0.55; if (Math.random() > dt * busy) continue;
      const sc = scaleOf(c.g.slug), v = 0.03 * Math.pow(1 - d / 460, 2), pan = (cx - s.me.x) / 320;
      const k = Math.random() * 8 | 0; tone(note(sc, k), rnd(0.05, 0.12), v, { type: sc.type, pan });
      if (Math.random() < 0.3) tone(note(sc, k + 2), 0.08, v * 0.8, { type: sc.type, pan, at: 0.08 });
    }
  }

  /* ---------- drawing helpers for the panels ---------- */
  function panel(x, title, c, w = 620, h = 460) {
    x.fillStyle = 'rgba(5,2,12,.72)'; x.fillRect(0, 0, VW, VH);
    const X = (VW - w) / 2, Y = (VH - h) / 2;
    x.fillStyle = OUT; x.fillRect(X - 4, Y - 4, w + 8, h + 8); x.fillStyle = '#140c24'; x.fillRect(X, Y, w, h);
    x.strokeStyle = c; x.lineWidth = 2; x.strokeRect(X + 6, Y + 6, w - 12, h - 12);
    kit.neon(x, title, VW / 2, Y + 34, 24, c);
    return { X, Y, w, h };
  }
  function hint(x, text, y) { x.font = '10px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(255,255,255,.55)'; x.fillText(text, VW / 2, y); }
  function button(x, label, cx, cy, c, on, w = 120) {
    x.font = '12px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = OUT; x.fillRect(cx - w / 2 - 2, cy - 16, w + 4, 32); x.fillStyle = on ? c : '#2a2054'; x.fillRect(cx - w / 2, cy - 14, w, 28);
    x.fillStyle = on ? '#140c24' : c; x.fillText(label, cx, cy + 1);
    return { x: cx - w / 2, y: cy - 14, w, h: 28 };
  }
  const inside = (b, px, py) => b && px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h;
  const isClose = c => c === 'Escape';
  const isUp = c => c === 'ArrowUp' || c === 'KeyW', isDown = c => c === 'ArrowDown' || c === 'KeyS', isLeft = c => c === 'ArrowLeft' || c === 'KeyA', isRight = c => c === 'ArrowRight' || c === 'KeyD';

  /* ---------- the jukebox ---------- */
  function jukebox() {
    const list = [{ slug: '', name: 'BITCADE THEME', c: '#ff4fa3' }, ...kit.cabs.map(c => ({ slug: c.g.slug, name: c.g.name.toUpperCase() + ' THEME', c: c.g.c }))];
    const cur = () => get('bitcade:jukebox') || '';
    let sel = Math.max(0, list.findIndex(l => l.slug === cur())), rows = [];
    const choose = () => { const l = list[sel]; kit.opt.onJukebox(l.slug); sound.select(); kit.say(`♪ ${l.name}`, 2.2); kit.refreshCard(); };
    return {
      name: 'jukebox',
      draw(x, t) {
        const { X, Y, w } = panel(x, 'JUKEBOX', '#ff4fd1');
        const top = Math.max(0, Math.min(list.length - 12, sel - 5)); rows = [];
        x.font = '12px Silkscreen, monospace'; x.textBaseline = 'middle';
        for (let i = 0; i < 12 && top + i < list.length; i++) {
          const k = top + i, l = list[k], y = Y + 76 + i * 26, on = k === sel, playing = l.slug === cur();
          if (on) { x.fillStyle = 'rgba(255,79,209,.22)'; x.fillRect(X + 24, y - 12, w - 48, 24); }
          x.fillStyle = l.c; x.fillRect(X + 34, y - 5, 10, 10);
          x.textAlign = 'left'; x.fillStyle = on ? '#fff' : '#cfc6e6'; x.fillText(l.name, X + 56, y + 1);
          if (playing) { x.textAlign = 'right'; x.fillStyle = '#ffd23d'; x.fillText('♪ PLAYING', X + w - 36, y + 1); for (let b = 0; b < 4; b++) { const hgt = 3 + Math.abs(Math.sin(t / 120 + b * 1.7)) * 9; x.fillRect(X + w - 140 + b * 5, y + 6 - hgt, 3, hgt); } }
          rows.push({ x: X + 24, y: y - 12, w: w - 48, h: 24, k });
        }
        hint(x, '↑↓ PICK · ENTER PLAY · ESC CLOSE · TAP A SONG', Y + 420);
      },
      key(c) {
        if (isUp(c)) { sel = (sel + list.length - 1) % list.length; sound.select(); }
        else if (isDown(c)) { sel = (sel + 1) % list.length; sound.select(); }
        else if (c === 'Enter') choose();
        else if (isClose(c)) { sound.back(); kit.close(); }
      },
      tap(px, py) { const r = rows.find(r => inside(r, px, py)); if (r) { sel = r.k; choose(); } else if (px < (VW - 620) / 2 || px > (VW + 620) / 2 || py < (VH - 460) / 2 || py > (VH + 460) / 2) kit.close(); }
    };
  }

  /* ---------- the high-score wall ---------- */
  function board() {
    return {
      name: 'board',
      draw(x) {
        const { X, Y, w } = panel(x, 'HIGH SCORES', '#5ee7ff', 700, 540);
        const rows = kit.boardRows(), half = Math.ceil(rows.length / 2);
        x.font = '10px Silkscreen, monospace'; x.textBaseline = 'middle';
        rows.forEach((r, i) => {
          const col = i < half ? 0 : 1, row = i % half, cx = X + 30 + col * (w / 2 - 10), y = Y + 74 + row * 33;
          x.textAlign = 'left'; x.fillStyle = r.c; x.fillText(r.name, cx, y, 170);
          x.textAlign = 'right'; x.fillStyle = r.world ? '#ffd23d' : '#e8e4f0'; x.fillText((r.world ? '★ ' : '') + r.text, cx + w / 2 - 50, y + 13);
          x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(cx, y + 22, w / 2 - 50, 1);
        });
        hint(x, '★ WORLD RECORD · ENTER OR ESC TO CLOSE', Y + 520);
      },
      key(c) { if (c === 'Enter' || isClose(c)) { sound.back(); kit.close(); } },
      tap() { kit.close(); }
    };
  }

  /* ---------- the photo booth ---------- */
  const SHOTS = [{ bg: '#ff4fa3', pose: '', dir: 'down' }, { bg: '#5ee7ff', pose: 'wave', dir: 'down' }, { bg: '#ffd23d', pose: 'cheer', dir: 'down' }, { bg: '#b48cff', pose: 'jump', dir: 'down' }];
  function photoFrame(x, i, X, Y, w, h, t) {
    const s = SHOTS[i]; x.fillStyle = s.bg; x.fillRect(X, Y, w, h);
    x.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 0; k < 6; k++) kit.star(x, X + ((k * 53 + i * 31) % w), Y + ((k * 37 + i * 17) % h), 4, 'rgba(255,255,255,.6)');
    x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip(); x.translate(X + w / 2, Y + h - 6); x.scale(h / 60, h / 60);
    kit.drawWalker(x, 0, 0, s.dir, 0, false, kit.look(), s.pose, kit.me.prop);
    x.restore();
  }
  function strip() {
    const c = document.createElement('canvas'); c.width = 220; c.height = 660; const x = c.getContext('2d');
    x.fillStyle = '#f4effd'; x.fillRect(0, 0, 220, 660);
    for (let i = 0; i < 4; i++) photoFrame(x, i, 14, 14 + i * 150, 192, 140);
    x.fillStyle = '#140c24'; x.font = '18px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BITCADE', 110, 625);
    x.font = '10px Silkscreen, monospace'; x.fillText(`${kit.initials() || 'PLAYER ONE'} · ${today()}`, 110, 646);
    return c;
  }
  function photobooth() {
    let st = 'ready', k = 0, t0 = 0, shot = 0, result = null, btns = [], sel = 0;
    const go = () => { st = 'count'; shot = 0; t0 = performance.now(); k = 0; };
    const act = i => {
      if (i === 0) { const a = document.createElement('a'); a.download = `bitcade-photo-${today()}.png`; a.href = result.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove(); sound.select(); kit.say('SAVED!', 1.6); }
      else if (i === 1) { go(); sound.select(); }
      else { sound.back(); kit.close(); }
    };
    return {
      name: 'booth',
      draw(x, t) {
        const { X, Y, w, h } = panel(x, 'PHOTO BOOTH', '#ff4fa3');
        if (st === 'ready') {
          photoFrame(x, 0, VW / 2 - 110, Y + 80, 220, 200, t);
          x.font = '12px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#f4effd'; x.fillText('FOUR SHOTS. STRIKE A POSE!', VW / 2, Y + 312);
          btns = [button(x, 'SNAP!', VW / 2, Y + 360, '#ff4fa3', true, 160)];
          hint(x, 'ENTER TO START · ESC TO LEAVE', Y + 420);
        } else if (st === 'count') {
          const el = (performance.now() - t0) / 1000, n = 3 - Math.floor(el / 0.7);
          photoFrame(x, shot, VW / 2 - 140, Y + 70, 280, 250, t);
          if (n > 0) { if (n !== k) { k = n; sound.beep(false); } kit.neon(x, String(n), VW / 2, Y + 360, 54, '#fff'); }
          else { sound.shutter(); kit.booth.flash = 1; shot++; t0 = performance.now(); k = 0; if (shot >= 4) { st = 'done'; result = strip(); sound.fanfare(); kit.say('LOOKING GOOD!', 2, true); mission({ type: 'photo' }); } }
          x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#f4effd'; x.fillText(`SHOT ${Math.min(4, shot + 1)} OF 4`, VW / 2, Y + 420);
          if (kit.booth.flash > 0) { x.fillStyle = `rgba(255,255,255,${kit.booth.flash})`; x.fillRect(X, Y, w, h); }
        } else {
          x.drawImage(result, VW / 2 - 250, Y + 56, 110, 330);
          x.font = '12px Silkscreen, monospace'; x.textAlign = 'left'; x.fillStyle = '#f4effd'; x.fillText('YOUR STRIP IS READY.', VW / 2 - 100, Y + 120); x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('SAVE IT, OR GO AGAIN.', VW / 2 - 100, Y + 144);
          btns = ['SAVE', 'AGAIN', 'DONE'].map((l, i) => button(x, l, VW / 2 - 10 + 60, Y + 210 + i * 46, '#ff4fa3', i === sel, 150));
          hint(x, '↑↓ CHOOSE · ENTER', Y + 420);
        }
      },
      key(c) {
        if (st === 'ready') { if (c === 'Enter') go(); else if (isClose(c)) { sound.back(); kit.close(); } }
        else if (st === 'done') { if (isUp(c)) sel = (sel + 2) % 3; else if (isDown(c)) sel = (sel + 1) % 3; else if (c === 'Enter') act(sel); else if (isClose(c)) act(2); }
      },
      tap(px, py) {
        if (st === 'ready') { if (inside(btns[0], px, py)) go(); else kit.close(); }
        else if (st === 'done') { const i = btns.findIndex(b => inside(b, px, py)); if (i >= 0) act(i); }
      }
    };
  }

  /* ---------- the Mega Claw ---------- */
  const goesToday = () => { let s = null; try { s = JSON.parse(get('bitcade:claw') || 'null'); } catch (e) {} const limit = 3 + (kit.owns('claw') ? 1 : 0); return Math.max(0, limit - (s && s.d === today() ? s.n : 0)); };
  const useGo = () => { let s = null; try { s = JSON.parse(get('bitcade:claw') || 'null'); } catch (e) {} const n = s && s.d === today() ? s.n + 1 : 1; set('bitcade:claw', JSON.stringify({ d: today(), n })); };
  const PRIZES = [[2, '#3dd6ff', 35], [5, '#3dff8f', 30], [10, '#b86bff', 20], [25, '#ff4f6d', 11], [50, '#ffd23d', 4]];
  function claw() {
    const BX = VW / 2 - 230, BY = 96, BW = 460, BH = 310, FLOOR = BY + BH - 14, CHUTE = BX + 80, gold = kit.owns('claw');
    const caps = [];
    for (let i = 0; i < 26; i++) {
      let r = Math.random() * 100, p = PRIZES[0]; for (const q of PRIZES) { if (r < q[2]) { p = q; break; } r -= q[2]; }
      const row = i < 14 ? 0 : 1, x = CHUTE + 26 + (row ? 18 : 0) + (i % 14) * 25 + rnd(-4, 4);
      caps.push({ x: Math.min(BX + BW - 22, x), y: FLOOR - 14 - row * 22 - rnd(0, 4), r: 13, v: p[0], c: p[1], vy: 0, held: false });
    }
    let st = goesToday() ? 'aim' : 'out', cx = BX + BW / 2, cy = BY + 26, aimT = 15, open = 1, got = null, target = null, slipAt = -1, won = 0, wonT = 0, motorT = 0, btns = [];
    const drop = () => { if (st !== 'aim') return; useGo(); st = 'drop'; target = null; sound.select(); kit.refreshCard(); };
    function pileTop(px) { let top = FLOOR; for (const c of caps) if (!c.held && Math.abs(c.x - px) < c.r + 4) top = Math.min(top, c.y - c.r); return top; }
    function update(dt) {
      if (st === 'aim') {
        let dir = (kit.held('ArrowLeft') || kit.held('KeyA') ? -1 : 0) + (kit.held('ArrowRight') || kit.held('KeyD') ? 1 : 0) + (padX || 0);
        if (target !== null && !dir) { const d = target - cx; dir = Math.abs(d) < 3 ? 0 : Math.sign(d); if (!dir) target = null; }
        if (dir) { cx = Math.max(BX + 30, Math.min(BX + BW - 30, cx + dir * 170 * dt)); if ((motorT -= dt) <= 0) { motorT = 0.12; sound.motor(); } }
        if ((aimT -= dt) <= 0) drop();
      } else if (st === 'drop') {
        cy += 190 * dt; if ((motorT -= dt) <= 0) { motorT = 0.12; sound.motor(); }
        if (cy + 22 >= pileTop(cx)) { st = 'grab'; open = 1; }
      } else if (st === 'grab') {
        open -= dt * 3;
        if (open <= 0) {
          open = 0; let best = null, bd = 99;
          for (const c of caps) { const d = Math.abs(c.x - cx); if (d < 18 && c.y - c.r < cy + 34 && d < bd) { best = c; bd = d; } }
          const chance = !best ? 0 : bd < 8 ? (gold ? 0.9 : 0.8) : (gold ? 0.6 : 0.45);
          if (best && Math.random() < chance) { got = best; got.held = true; sound.clank(); slipAt = Math.random() < (gold ? 0.1 : 0.18) ? rnd(0.2, 0.8) : -1; }
          else { got = null; sound.back(); }
          st = 'lift';
        }
      } else if (st === 'lift' || st === 'carry') {
        if (st === 'lift') { cy -= 150 * dt; if (cy <= BY + 26) { cy = BY + 26; st = got ? 'carry' : 'miss'; } }
        else { cx -= 170 * dt; if (cx <= CHUTE - 40) { cx = CHUTE - 40; st = 'release'; open = 0; } }
        if ((motorT -= dt) <= 0) { motorT = 0.12; sound.motor(); }
        if (got && slipAt >= 0) { const prog = st === 'lift' ? 0.3 : 0.3 + 0.7 * (1 - (cx - CHUTE) / Math.max(1, BW / 2)); if (prog > slipAt) { got.held = false; got.vy = 0; got = null; slipAt = -1; sound.back(); kit.say(pick(['NOOO!', 'SO CLOSE!', 'THE CLAW!']), 1.6); } }
      } else if (st === 'release') {
        open += dt * 3; if (open >= 1) { open = 1; if (got) { got.held = false; got.vy = 0; got.won = true; } st = 'fall'; }
      } else if (st === 'fall') {
        if (!got) st = 'miss';
        else { got.vy += 900 * dt; got.y += got.vy * dt; if (got.y > BY + BH + 40) { won = got.v; caps.splice(caps.indexOf(got), 1); got = null; wonT = 2.6; st = 'won'; TICKETS.add(won); kit.opt.onTickets && kit.opt.onTickets(); sound.fanfare(); kit.say(`+${won} TICKETS!`, 2.6, true); kit.refreshCard(); mission({ type: 'claw', won }); } }
      } else if (st === 'miss') { cx += ((BX + BW / 2) - cx) * Math.min(1, dt * 3); if (Math.abs(cx - (BX + BW / 2)) < 2) { st = goesToday() ? 'aim' : 'out'; aimT = 15; } }
      else if (st === 'won') { if ((wonT -= dt) <= 0) { st = goesToday() ? 'aim' : 'out'; aimT = 15; cx = BX + BW / 2; } }
      // loose capsules fall back onto the pile
      for (const c of caps) {
        if (c.held) { c.x = cx; c.y = cy + 34; continue; }
        if (c.won) continue;
        const floorAt = (() => { let top = FLOOR; for (const o of caps) if (o !== c && !o.held && !o.won && o.y > c.y && Math.abs(o.x - c.x) < c.r * 2 - 4) top = Math.min(top, o.y - o.r); return top; })();
        if (c.y + c.r < floorAt - 0.5) { c.vy += 900 * dt; c.y = Math.min(floorAt - c.r, c.y + c.vy * dt); if (c.y >= floorAt - c.r) { if (c.vy > 200) sound.thud(); c.vy = 0; } }
      }
    }
    let padX = 0;
    return {
      name: 'claw',
      held(ax) { padX = Math.abs(ax) > 0.3 ? Math.sign(ax) : 0; },
      draw(x, t, dt) {
        update(dt || 0.016);
        x.fillStyle = 'rgba(5,2,12,.75)'; x.fillRect(0, 0, VW, VH);
        // the cabinet round the glass
        x.fillStyle = OUT; x.fillRect(BX - 22, BY - 70, BW + 44, BH + 186); x.fillStyle = '#1f6a78'; x.fillRect(BX - 18, BY - 66, BW + 36, BH + 178);
        x.fillStyle = gold ? '#ffd23d' : '#3dd6ff'; x.fillRect(BX - 18, BY - 66, BW + 36, 46);
        x.font = '26px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText('MEGA CLAW', VW / 2, BY - 42);
        x.fillStyle = '#071820'; x.fillRect(BX, BY, BW, BH);
        // the chute
        x.fillStyle = '#04080c'; x.fillRect(BX, FLOOR - 40, CHUTE - BX, BY + BH - FLOOR + 40); x.fillStyle = '#c0c6d0'; x.fillRect(CHUTE - 4, FLOOR - 52, 6, BY + BH - FLOOR + 52);
        x.font = '9px Silkscreen, monospace'; x.fillStyle = '#ffd23d'; x.fillText('PRIZE', BX + (CHUTE - BX) / 2, FLOOR - 20); x.fillText('▼', BX + (CHUTE - BX) / 2, FLOOR - 6);
        // capsules
        for (const c of caps) {
          x.fillStyle = OUT; x.beginPath(); x.arc(c.x, c.y, c.r + 2, 0, 6.29); x.fill();
          x.fillStyle = c.c; x.beginPath(); x.arc(c.x, c.y, c.r, Math.PI, 0); x.fill(); x.fillStyle = '#e8e4f0'; x.beginPath(); x.arc(c.x, c.y, c.r, 0, Math.PI); x.fill();
          x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(c.x - 7, c.y - 9, 4, 3);
          x.font = '9px Silkscreen, monospace'; x.fillStyle = '#140c24'; x.fillText(String(c.v), c.x, c.y + 6);
        }
        // the claw
        x.fillStyle = '#c0c6d0'; x.fillRect(BX, BY + 6, BW, 6); x.fillRect(cx - 12, BY + 2, 24, 12); x.fillRect(cx - 1, BY + 12, 2, cy - BY - 6);
        const spread = 6 + open * 12, cc = gold ? '#ffd23d' : '#dfe3ea';
        x.fillStyle = OUT; x.fillRect(cx - 10, cy, 20, 8); x.fillStyle = cc; x.fillRect(cx - 9, cy + 1, 18, 6);
        x.strokeStyle = cc; x.lineWidth = 4; x.lineCap = 'round';
        [-1, 1].forEach(sd => { x.beginPath(); x.moveTo(cx + sd * 6, cy + 6); x.lineTo(cx + sd * spread, cy + 24); x.lineTo(cx + sd * (spread - 8), cy + 36); x.stroke(); });
        // glass glare
        x.fillStyle = 'rgba(255,255,255,.06)'; x.beginPath(); x.moveTo(BX + 40, BY); x.lineTo(BX + 120, BY); x.lineTo(BX + 40, BY + BH); x.lineTo(BX, BY + BH); x.fill();
        // the panel below: goes left, timer, buttons
        const left = goesToday();
        x.font = '12px Silkscreen, monospace'; x.textAlign = 'left'; x.fillStyle = '#e8e4f0'; x.fillText(`GOES LEFT TODAY: ${left}`, BX - 6, BY + BH + 28);
        x.textAlign = 'right'; x.fillStyle = '#ffd23d'; x.fillText(`TICKETS ${TICKETS.balance().toLocaleString()}`, BX + BW + 6, BY + BH + 28);
        btns = [];
        if (st === 'aim') {
          x.textAlign = 'center'; x.fillStyle = aimT < 4 ? '#ff4f6d' : '#5ee7ff'; x.fillText(`DROP IN ${Math.ceil(aimT)}`, VW / 2, BY + BH + 28);
          btns = [button(x, '◀', VW / 2 - 150, BY + BH + 62, '#5ee7ff', false, 70), button(x, 'DROP', VW / 2, BY + BH + 62, '#ff4f6d', true, 140), button(x, '▶', VW / 2 + 150, BY + BH + 62, '#5ee7ff', false, 70)];
          hint(x, '← → MOVE · ENTER DROP · TAP THE GLASS TO AIM · ESC LEAVE', BY + BH + 100);
        } else if (st === 'out') {
          kit.neon(x, 'COME BACK TOMORROW', VW / 2, BY + BH / 2 - 60, 22, '#ffd23d');
          hint(x, `${3 + (gold ? 1 : 0)} FREE GOES EVERY DAY · ESC TO LEAVE`, BY + BH + 62);
        } else if (st === 'won') kit.neon(x, `+${won} TICKETS!`, VW / 2, BY + 90, 34, '#ffd23d');
        else if (st === 'miss') kit.neon(x, 'MISSED!', VW / 2, BY + 90, 28, '#ff4f6d');
      },
      key(c) {
        if (c === 'Enter') drop();
        else if (isClose(c) && (st === 'aim' || st === 'out' || st === 'won' || st === 'miss')) { sound.back(); kit.close(); }
      },
      tap(px, py) {
        if (st === 'aim') {
          if (inside(btns[1], px, py)) return drop();
          if (inside(btns[0], px, py)) { target = Math.max(BX + 30, cx - 60); return; }
          if (inside(btns[2], px, py)) { target = Math.min(BX + BW - 30, cx + 60); return; }
          if (px > BX && px < BX + BW && py > BY && py < BY + BH) { target = Math.max(BX + 30, Math.min(BX + BW - 30, px)); return; }
        }
        if ((st === 'out' || st === 'aim') && (px < BX - 22 || px > BX + BW + 22 || py < BY - 70 || py > BY + BH + 80)) kit.close();
      }
    };
  }

  /* ---------- tickets from skee-ball and pinball: a few per game, at most 30 a day between them ---------- */
  const FLOOR_CAP = 30;
  function award(n) {
    let s = null; try { s = JSON.parse(get('bitcade:floortix') || 'null'); } catch (e) {}
    const used = s && s.d === today() ? s.n : 0, give = Math.max(0, Math.min(n, FLOOR_CAP - used));
    if (give) { set('bitcade:floortix', JSON.stringify({ d: today(), n: used + give })); TICKETS.add(give); kit.opt.onTickets && kit.opt.onTickets(); }
    return { give, capped: give < n };
  }
  const bestOf = k => +get(k) || 0;
  /** Daily missions (shared/badges.js): count something done on the floor, and say so when one's finished. */
  function mission(ev) {
    if (!window.MISSIONS) return; const r = MISSIONS.record(ev); if (!r.tickets) return;
    setTimeout(() => { kit.say(r.all ? `ALL 3 MISSIONS! +${r.tickets} TICKETS` : `MISSION DONE! +${r.tickets} TICKETS`, 3, true); sound.fanfare(); }, 900);
    kit.opt.onTickets && kit.opt.onTickets(); kit.opt.onMissions && kit.opt.onMissions();
  }
  function gameOver(x, score, best, res, c) {
    x.fillStyle = 'rgba(5,2,12,.78)'; x.fillRect(VW / 2 - 220, VH / 2 - 110, 440, 220); x.strokeStyle = c; x.lineWidth = 2; x.strokeRect(VW / 2 - 214, VH / 2 - 104, 428, 208);
    kit.neon(x, 'GAME OVER', VW / 2, VH / 2 - 62, 30, c);
    x.font = '14px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f4effd';
    x.fillText(`SCORE ${score.toLocaleString()}${score >= best && score ? '  ★ NEW BEST' : ''}`, VW / 2, VH / 2 - 14);
    x.fillStyle = '#ffd23d'; x.fillText(res.give ? `+${res.give} TICKETS` : res.capped ? 'TICKET LIMIT REACHED TODAY' : 'NO TICKETS THIS TIME', VW / 2, VH / 2 + 16);
    hint(x, 'ENTER OR TAP TO PLAY AGAIN · ESC TO LEAVE', VH / 2 + 64);
  }

  /* ---------- skee-ball: aim, hold to charge, let go to roll; nine balls ---------- */
  function skee(o) {
    const LX = VW / 2 - 110, LW = 220, CX = VW / 2, TOP = 40, CY = 130, RAMP = 250, BOT = 560;
    const RINGS = [[22, 50], [42, 40], [62, 30], [84, 20]], POCKETS = [[CX - 84, TOP + 26], [CX + 84, TOP + 26]], col = ['#ff4f6d', '#5ee7ff', '#ffd23d'][o.i % 3];
    let balls, score, aim, power, pdir, charging, ball, pops, over, res, best, touchId = null, padX = 0, padCharge = false;
    const reset = () => { balls = 9; score = 0; aim = 0; power = 0; pdir = 1; charging = false; ball = null; pops = []; over = false; res = null; best = bestOf('bitcade:skee:best'); };
    reset();
    const start = () => { if (ball || over) return; charging = true; power = 0; pdir = 1; };
    function roll() {
      if (!charging) return; charging = false; padCharge = false;
      const p = power, x0 = CX + aim * 92;
      let ly = RAMP - 20 - p * (RAMP - TOP - 30) * 1.05 + rnd(-10, 10), lx = x0 + rnd(-10, 10) * (0.6 + p);
      if (ly < TOP + 8) ly = TOP + 8 + rnd(10, 70); // off the back wall
      lx = Math.max(LX - 14, Math.min(LX + LW + 14, lx));
      ball = { x: x0, y: BOT - 22, phase: 'roll', p, lx, ly, t: 0, sx: x0 };
      sound.select();
    }
    function land() {
      const { lx, ly } = ball; let pts = 10;
      if (POCKETS.some(([px, py]) => Math.hypot(lx - px, ly - py) < 14)) pts = 100;
      else { const d = Math.hypot(lx - CX, ly - CY); for (const [r, v] of RINGS) if (d < r) { pts = v; break; } }
      score += pts; pops.push({ x: lx, y: ly, text: '+' + pts, t: 1 }); balls--;
      if (pts >= 50) sound.fanfare(); else sound.clank();
      if (!balls) setTimeout(() => {
        over = true; res = award(Math.floor(score / 100)); mission({ type: 'skee', score });
        if (score > best) { set('bitcade:skee:best', score); kit.say(`NEW SKEE-BALL BEST: ${score}!`, 2.6, true); }
      }, 500);
    }
    function update(dt) {
      const left = kit.held('ArrowLeft') || kit.held('KeyA'), right = kit.held('ArrowRight') || kit.held('KeyD');
      const dir = (right ? 1 : 0) - (left ? 1 : 0) + padX;
      if (!ball && !over && dir) aim = Math.max(-1, Math.min(1, aim + dir * dt * 1.4));
      if (charging) {
        power += pdir * dt * 1.25; if (power > 1) { power = 1; pdir = -1; } if (power < 0) { power = 0; pdir = 1; }
        if (touchId === null && !padCharge && !kit.held('Space') && !kit.held('Enter') && !kit.held('ArrowUp') && !kit.held('KeyW')) roll();
      }
      if (ball) {
        ball.t += dt;
        if (ball.phase === 'roll') { ball.y -= (420 + ball.p * 520) * dt; if (ball.y <= RAMP) { ball.y = RAMP; ball.phase = 'air'; ball.t = 0; sound.thud(); } }
        else if (ball.phase === 'air') { const k = Math.min(1, ball.t / 0.45); ball.x = ball.sx + (ball.lx - ball.sx) * k; ball.y = RAMP + (ball.ly - RAMP) * k; ball.h = Math.sin(k * Math.PI); if (k >= 1) { ball.phase = 'drop'; ball.t = 0; land(); } }
        else if (ball.t > 0.45) ball = null;
      }
      for (const p of pops) p.t -= dt; pops = pops.filter(p => p.t > 0);
    }
    return {
      name: 'skee',
      held(ax) { padX = Math.abs(ax) > 0.3 ? Math.sign(ax) : 0; },
      draw(x, t, dt) {
        update(dt || 0.016);
        x.fillStyle = 'rgba(5,2,12,.95)'; x.fillRect(0, 0, VW, VH);
        // the machine: target box, rings and pockets, the ramp, the lane
        x.fillStyle = OUT; x.fillRect(LX - 34, TOP - 26, LW + 68, BOT - TOP + 40); x.fillStyle = col; x.fillRect(LX - 30, TOP - 22, LW + 60, 18);
        x.font = '12px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = OUT; x.fillText('SKEE-BALL', CX, TOP - 13);
        x.fillStyle = '#1a1430'; x.fillRect(LX - 30, TOP - 4, LW + 60, RAMP - TOP - 12);
        [...RINGS].reverse().forEach(([r, v], i) => { x.fillStyle = ['#3a3060', '#4a3a80', '#5a4aa0', '#6a5ac0'][i]; x.beginPath(); x.arc(CX, CY, r, 0, 6.29); x.fill(); x.strokeStyle = col; x.lineWidth = 1.5; x.stroke(); });
        x.fillStyle = '#05040c'; x.beginPath(); x.arc(CX, CY, 12, 0, 6.29); x.fill();
        x.font = '10px Silkscreen, monospace'; x.fillStyle = '#fff';
        RINGS.forEach(([r, v], i) => { const inner = i ? RINGS[i - 1][0] : 12; x.fillText(String(v), CX, CY + (inner + r) / 2); });
        POCKETS.forEach(([px, py]) => { x.fillStyle = '#05040c'; x.beginPath(); x.arc(px, py, 13, 0, 6.29); x.fill(); x.strokeStyle = '#ffd23d'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#ffd23d'; x.fillText('100', px, py + 22); });
        x.font = '9px Silkscreen, monospace'; x.fillStyle = 'rgba(255,255,255,.5)'; x.fillText('10', LX - 6, RAMP - 30); x.fillText('10', LX + LW + 6, RAMP - 30);
        const rg = x.createLinearGradient(0, RAMP - 18, 0, RAMP + 4); rg.addColorStop(0, '#2a1a10'); rg.addColorStop(1, '#a0683a'); x.fillStyle = rg; x.fillRect(LX, RAMP - 18, LW, 22);
        x.fillStyle = '#7a4c2c'; x.fillRect(LX, RAMP + 4, LW, BOT - RAMP - 4);
        for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(LX, RAMP + 20 + i * 34, LW, 2); }
        x.fillStyle = '#c0c6d0'; x.fillRect(LX - 6, RAMP - 18, 6, BOT - RAMP + 18); x.fillRect(LX + LW, RAMP - 18, 6, BOT - RAMP + 18);
        // aim arrow and the ball waiting
        if (!ball && !over) {
          const ax = CX + aim * 92; x.strokeStyle = 'rgba(255,255,255,.35)'; x.setLineDash([4, 6]); x.beginPath(); x.moveTo(ax, BOT - 30); x.lineTo(ax, RAMP + 10); x.stroke(); x.setLineDash([]);
          x.fillStyle = OUT; x.beginPath(); x.arc(ax, BOT - 22, 10, 0, 6.29); x.fill(); x.fillStyle = '#c87a3a'; x.beginPath(); x.arc(ax, BOT - 22, 8, 0, 6.29); x.fill(); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(ax - 4, BOT - 27, 3, 3);
        }
        if (ball && ball.phase !== 'drop') {
          const r = 8 * (1 + (ball.h || 0) * 0.6);
          if (ball.phase === 'air') { x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(ball.x, ball.y + 4, 8, 4, 0, 0, 6.29); x.fill(); }
          const by = ball.y - (ball.h || 0) * 26;
          x.fillStyle = OUT; x.beginPath(); x.arc(ball.x, by, r + 2, 0, 6.29); x.fill(); x.fillStyle = '#c87a3a'; x.beginPath(); x.arc(ball.x, by, r, 0, 6.29); x.fill(); x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(ball.x - r / 2, by - r / 2, 3, 3);
        }
        for (const p of pops) { x.globalAlpha = Math.min(1, p.t * 2); kit.neon(x, p.text, p.x, p.y - (1 - p.t) * 30, 20, '#ffd23d'); x.globalAlpha = 1; }
        // the side: score, balls left, best; the power meter
        const SX = LX - 230; x.textAlign = 'left'; x.font = '12px Silkscreen, monospace'; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('SCORE', SX, 90); x.fillText('BALLS', SX, 170); x.fillText('BEST', SX, 250);
        kit.neon(x, String(score), SX + 60, 120, 28, col); x.textAlign = 'left';
        for (let i = 0; i < 9; i++) { x.fillStyle = i < balls ? '#c87a3a' : 'rgba(255,255,255,.12)'; x.beginPath(); x.arc(SX + 8 + (i % 5) * 20, 194 + Math.floor(i / 5) * 20, 7, 0, 6.29); x.fill(); }
        x.font = '14px Silkscreen, monospace'; x.fillStyle = '#ffd23d'; x.textAlign = 'left'; x.fillText(String(Math.max(best, 0)), SX, 278);
        const MX = LX + LW + 70; x.fillStyle = OUT; x.fillRect(MX - 2, 220, 28, 300); x.fillStyle = '#140c24'; x.fillRect(MX, 222, 24, 296);
        const pg = x.createLinearGradient(0, 518, 0, 222); pg.addColorStop(0, '#3dff8f'); pg.addColorStop(0.6, '#ffd23d'); pg.addColorStop(1, '#ff4f6d');
        x.fillStyle = pg; x.fillRect(MX, 518 - 296 * power, 24, 296 * power);
        x.font = '10px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('POWER', MX + 12, 208);
        hint(x, '← → AIM · HOLD ENTER (OR THE LANE), LET GO TO ROLL · ESC LEAVE', VH - 14);
        if (over) gameOver(x, score, best, res, col);
      },
      key(c, src) {
        if (isClose(c)) { if (charging) return; sound.back(); o.user = null; return kit.close(); }
        if (over) { if (c === 'Enter') reset(); return; }
        if (c === 'Enter' || c === 'ArrowUp' || c === 'KeyW') { if (src === 'pad') { if (charging) roll(); else { start(); padCharge = true; } } else start(); }
      },
      tap(px, py, id) {
        if (over) { reset(); return; }
        if (px > LX - 40 && px < LX + LW + 40 && py > RAMP && py < BOT + 10) { if (!ball) { aim = Math.max(-1, Math.min(1, (px - CX) / 92)); touchId = id; start(); } }
        else if (px < LX - 260 || px > LX + LW + 140) { o.user = null; kit.close(); }
      },
      untap(id) { if (id === touchId) { touchId = null; } }
    };
  }

  /* ---------- pinball: a small real table — plunger, flippers, bumpers, slingshots, rollover lanes; three balls ---------- */
  function pinball(o) {
    const K = 1.12, TW = 300, TH = 480, OX = VW / 2 - TW * K / 2, OY = 26, c = o.c, BR = 7, G = 620;
    const W = [ // walls: [x1, y1, x2, y2, kind]
      [12, 470, 12, 70], [12, 70, 70, 14], [70, 14, 230, 14], [230, 14, 288, 72], [288, 72, 288, 480], [262, 150, 262, 480],
      [12, 362, 74, 418], [262, 362, 200, 418],
      [44, 296, 44, 348], [44, 348, 76, 370], [44, 296, 76, 370, 'sling'],
      [230, 296, 230, 348], [230, 348, 198, 370], [230, 296, 198, 370, 'sling'],
      [68, 40, 68, 66], [116, 40, 116, 66], [160, 40, 160, 66], [206, 40, 206, 66]
    ];
    const BUMP = [[96, 142, 16], [180, 142, 16], [138, 206, 16]], LANES = [92, 138, 183];
    const FL = [{ px: 76, py: 424, len: 48, side: 1, a: 0.6, w: 0 }, { px: 198, py: 424, len: 48, side: -1, a: 0.6, w: 0 }];
    const REST = 0.6, UP = -0.45;
    let ball, balls, score, lit, over, res, best, flash = [0, 0, 0], plunge = 0, pdir = 1, pops = [], touches = {}, padX = 0;
    const reset = () => { balls = 3; score = 0; lit = [0, 0, 0]; over = false; res = null; best = bestOf('bitcade:pinball:best'); serve(); };
    const serve = () => { ball = { x: 275, y: 452, vx: 0, vy: 0, lane: true }; }, serveBack = () => { ball.x = 275; ball.y = 452; ball.vx = ball.vy = 0; ball.lane = true; };
    reset();
    const add = (n, x, y) => { score += n; if (n >= 100) pops.push({ x, y, text: '+' + n, t: 0.8 }); };
    function seg(ax, ay, bx, by, rad, e, kick) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, k = Math.max(0, Math.min(1, ((ball.x - ax) * dx + (ball.y - ay) * dy) / l2));
      const qx = ax + dx * k, qy = ay + dy * k, ex = ball.x - qx, ey = ball.y - qy, d = Math.hypot(ex, ey);
      if (d >= BR + rad || d === 0) return false;
      const nx = ex / d, ny = ey / d; ball.x = qx + nx * (BR + rad); ball.y = qy + ny * (BR + rad);
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) { ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny; if (kick) { ball.vx += nx * kick; ball.vy += ny * kick; } return true; }
      return false;
    }
    function flipper(f) {
      const ca = Math.cos(f.a), sa = Math.sin(f.a), tx = f.px + f.side * f.len * ca, ty = f.py + f.len * sa;
      const dx = tx - f.px, dy = ty - f.py, l2 = dx * dx + dy * dy, k = Math.max(0, Math.min(1, ((ball.x - f.px) * dx + (ball.y - f.py) * dy) / l2));
      const qx = f.px + dx * k, qy = f.py + dy * k, ex = ball.x - qx, ey = ball.y - qy, d = Math.hypot(ex, ey), R = BR + 5;
      if (d >= R || d === 0) return;
      const nx = ex / d, ny = ey / d, s = f.len * k;
      // the flipper's surface speed where the ball touches it
      const svx = f.w * s * (f.side > 0 ? -sa : sa), svy = f.w * s * ca;
      ball.x = qx + nx * R; ball.y = qy + ny * R;
      const rvx = ball.vx - svx, rvy = ball.vy - svy, vn = rvx * nx + rvy * ny;
      if (vn < 0) { ball.vx = svx + rvx - 1.35 * vn * nx; ball.vy = svy + rvy - 1.35 * vn * ny; }
    }
    function physics(dt) {
      const L = kit.held('ArrowLeft') || kit.held('KeyA') || kit.held('KeyZ') || padX < 0 || Object.values(touches).includes('L');
      const R = kit.held('ArrowRight') || kit.held('KeyD') || kit.held('Slash') || padX > 0 || Object.values(touches).includes('R');
      [[FL[0], L], [FL[1], R]].forEach(([f, held]) => {
        const target = held ? UP : REST, before = f.a;
        if (held && f.a > UP) { f.a = Math.max(UP, f.a - 22 * dt); if (before === REST) sound.thud(); }
        else if (!held && f.a < REST) f.a = Math.min(REST, f.a + 12 * dt);
        f.w = (f.a - before) / dt; void target;
      });
      if (!ball || ball.lane) return;
      ball.vy += G * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x > 262 && ball.y > 448 && ball.vy > -40) { serveBack(); return; } // rolled back down the plunger lane
      for (const w of W) if (seg(w[0], w[1], w[2], w[3], 2, w[4] ? 0.2 : 0.45, w[4] ? 260 : 0) && w[4]) { add(10); sound.clank(); }
      BUMP.forEach(([bx, by, r], i) => {
        const ex = ball.x - bx, ey = ball.y - by, d = Math.hypot(ex, ey);
        if (d < r + BR && d > 0) { const nx = ex / d, ny = ey / d; ball.x = bx + nx * (r + BR); ball.y = by + ny * (r + BR); const vn = ball.vx * nx + ball.vy * ny; ball.vx -= 2 * vn * nx; ball.vy -= 2 * vn * ny; ball.vx += nx * 330; ball.vy += ny * 330; flash[i] = 0.2; add(100, bx, by - 20); sound.beep(true); }
      });
      FL.forEach(flipper);
      LANES.forEach((lx, i) => { if (!lit[i] && Math.abs(ball.x - lx) < 14 && ball.y < 60 && ball.y > 30) { lit[i] = 1; add(50); sound.select(); if (lit.every(Boolean)) { lit = [0, 0, 0]; add(1000, 138, 90); sound.fanfare(); } } });
      const sp = Math.hypot(ball.vx, ball.vy); if (sp > 1100) { ball.vx *= 1100 / sp; ball.vy *= 1100 / sp; }
      if (ball.y > TH + 20) { // drained
        balls--; sound.back();
        if (balls > 0) serve();
        else { ball = null; over = true; res = award(Math.floor(score / 4000)); mission({ type: 'pinball', score }); if (score > best) { set('bitcade:pinball:best', score); kit.say(`NEW PINBALL BEST: ${score.toLocaleString()}!`, 2.6, true); } }
      }
    }
    function launch() { if (!ball || !ball.lane) return; ball.lane = false; ball.vy = -(760 + plunge * 440); ball.vx = 0; sound.clank(); }
    return {
      name: 'pinball',
      held(ax) { padX = Math.abs(ax) > 0.3 ? Math.sign(ax) : 0; },
      draw(x, t, dt) {
        dt = Math.min(0.033, dt || 0.016);
        if (ball && ball.lane) { plunge += pdir * dt * 1.4; if (plunge > 1) { plunge = 1; pdir = -1; } if (plunge < 0) { plunge = 0; pdir = 1; } }
        for (let i = 0; i < 8; i++) physics(dt / 8);
        flash = flash.map(f => Math.max(0, f - dt)); for (const p of pops) p.t -= dt; pops = pops.filter(p => p.t > 0);
        x.fillStyle = 'rgba(5,2,12,.95)'; x.fillRect(0, 0, VW, VH);
        x.save(); x.translate(OX, OY); x.scale(K, K);
        // the playfield
        x.fillStyle = OUT; x.fillRect(-8, -8, TW + 16, TH + 16);
        const pf = x.createLinearGradient(0, 0, 0, TH); pf.addColorStop(0, kit.shade(c, -0.55)); pf.addColorStop(1, kit.shade(c, -0.82)); x.fillStyle = pf; x.fillRect(0, 0, TW, TH);
        x.save(); x.globalAlpha = 0.12; x.font = '40px Bungee, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.translate(138, 300); x.rotate(-0.2); x.fillText(o.name, 0, 0); x.restore();
        LANES.forEach((lx, i) => { x.fillStyle = lit[i] ? '#ffd23d' : 'rgba(255,255,255,.15)'; x.beginPath(); x.arc(lx, 48, 5, 0, 6.29); x.fill(); });
        x.strokeStyle = '#e8e4f0'; x.lineCap = 'round';
        for (const w of W) { x.lineWidth = w[4] ? 5 : 4; x.strokeStyle = w[4] ? c : '#c0c6d0'; x.beginPath(); x.moveTo(w[0], w[1]); x.lineTo(w[2], w[3]); x.stroke(); }
        BUMP.forEach(([bx, by, r], i) => { x.fillStyle = OUT; x.beginPath(); x.arc(bx, by, r + 2, 0, 6.29); x.fill(); x.fillStyle = flash[i] ? '#fff' : c; x.beginPath(); x.arc(bx, by, r, 0, 6.29); x.fill(); x.fillStyle = kit.shade(c, -0.4); x.beginPath(); x.arc(bx, by, r * 0.55, 0, 6.29); x.fill(); x.fillStyle = '#fff'; x.font = '8px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('100', bx, by + 1); });
        FL.forEach(f => { const tx = f.px + f.side * f.len * Math.cos(f.a), ty = f.py + f.len * Math.sin(f.a); x.strokeStyle = OUT; x.lineWidth = 13; x.beginPath(); x.moveTo(f.px, f.py); x.lineTo(tx, ty); x.stroke(); x.strokeStyle = '#f4effd'; x.lineWidth = 9; x.stroke(); x.strokeStyle = c; x.lineWidth = 3; x.stroke(); });
        // the plunger lane and its spring
        x.fillStyle = '#05040c'; x.fillRect(264, 150, 22, TH - 150);
        const pull = ball && ball.lane ? plunge : 0; x.fillStyle = '#c0c6d0'; for (let i = 0; i < 5; i++) x.fillRect(268, 462 + pull * 12 + i * 3, 14, 1.5); x.fillStyle = c; x.fillRect(266, 460 + pull * 12, 18, 4);
        if (ball) { x.fillStyle = OUT; x.beginPath(); x.arc(ball.x, ball.y, BR + 1.5, 0, 6.29); x.fill(); const bg = x.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BR); bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#8a8ea0'); x.fillStyle = bg; x.beginPath(); x.arc(ball.x, ball.y, BR, 0, 6.29); x.fill(); }
        for (const p of pops) { x.globalAlpha = Math.min(1, p.t * 2); x.font = '12px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#ffd23d'; x.fillText(p.text, p.x, p.y - (0.8 - p.t) * 30); x.globalAlpha = 1; }
        x.restore();
        // the backglass beside the table: name, score, balls, best, plunger power
        const SX = OX - 210; kit.neon(x, o.name, SX + 90, 70, 22, c);
        x.textAlign = 'left'; x.font = '12px Silkscreen, monospace'; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('SCORE', SX, 120); x.fillText('BALL', SX, 200); x.fillText('BEST', SX, 260);
        x.font = '26px Silkscreen, monospace'; x.fillStyle = '#ff9a3d'; x.fillText(score.toLocaleString(), SX, 152);
        x.font = '16px Silkscreen, monospace'; x.fillStyle = '#f4effd'; x.fillText(over ? '-' : `${4 - balls} OF 3`, SX, 224); x.fillStyle = '#ffd23d'; x.fillText(best.toLocaleString(), SX, 284);
        if (ball && ball.lane) { const MX = OX + TW * K + 40; x.fillStyle = OUT; x.fillRect(MX - 2, 300, 28, 220); x.fillStyle = '#140c24'; x.fillRect(MX, 302, 24, 216); x.fillStyle = '#3dff8f'; x.fillRect(MX, 518 - 216 * plunge, 24, 216 * plunge); x.font = '10px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.7)'; x.fillText('LAUNCH', MX + 12, 288); }
        hint(x, ball && ball.lane ? 'ENTER OR TAP TO LAUNCH' : '← → FLIPPERS (OR Z AND /) · TAP LEFT OR RIGHT HALF · ESC LEAVE', VH - 12);
        if (over) gameOver(x, score, best, res, c);
      },
      key(c2) {
        if (isClose(c2)) { sound.back(); o.user = null; return kit.close(); }
        if (over) { if (c2 === 'Enter') reset(); return; }
        if (c2 === 'Enter' || c2 === 'ArrowDown' || c2 === 'KeyS') launch();
      },
      tap(px, py, id) {
        if (over) { reset(); return; }
        if (ball && ball.lane) return launch();
        touches[id] = px < VW / 2 ? 'L' : 'R';
      },
      untap(id) { delete touches[id]; }
    };
  }

  /* ---------- air hockey: you (bottom) against the house (top), first to 7 ---------- */
  function hockey() {
    const TW = 300, TH = 470, OX = VW / 2 - TW / 2, OY = 66, GOAL = 110, PR = 12, MR = 22, WIN_AT = 7;
    let puck, me, cpu, sMe, sCpu, over, res, msg, msgT, serveT, padX = 0, padY = 0, pointer = null;
    const reset = () => { sMe = 0; sCpu = 0; over = false; res = null; me = { x: TW / 2, y: TH - 70, vx: 0, vy: 0 }; cpu = { x: TW / 2, y: 70, vx: 0, vy: 0 }; serve(1); };
    const serve = toMe => { puck = { x: TW / 2, y: toMe ? TH / 2 + 50 : TH / 2 - 50, vx: 0, vy: 0 }; serveT = 0.8; };
    reset();
    function mallet(m, tx, ty, speed, dt, half) {
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), step = Math.min(d, speed * dt);
      const nx = d ? m.x + dx / d * step : m.x, ny = d ? m.y + dy / d * step : m.y;
      const cx = Math.max(MR, Math.min(TW - MR, nx)), cy = half === 'bottom' ? Math.max(TH / 2 + MR, Math.min(TH - MR, ny)) : Math.max(MR, Math.min(TH / 2 - MR, ny));
      m.vx = (cx - m.x) / dt; m.vy = (cy - m.y) / dt; m.x = cx; m.y = cy;
    }
    function strike(m) {
      const dx = puck.x - m.x, dy = puck.y - m.y, d = Math.hypot(dx, dy);
      if (d >= PR + MR || d === 0) return;
      const nx = dx / d, ny = dy / d; puck.x = m.x + nx * (PR + MR); puck.y = m.y + ny * (PR + MR);
      const rvx = puck.vx - m.vx, rvy = puck.vy - m.vy, vn = rvx * nx + rvy * ny;
      if (vn < 0) { puck.vx -= 1.9 * vn * nx; puck.vy -= 1.9 * vn * ny; puck.vx += m.vx * 0.35; puck.vy += m.vy * 0.35; sound.clank(); }
      const sp = Math.hypot(puck.vx, puck.vy); if (sp > 1100) { puck.vx *= 1100 / sp; puck.vy *= 1100 / sp; }
    }
    function step(dt) {
      if (over) return;
      if (msgT > 0) msgT -= dt;
      // you: the pointer, or the arrows / stick
      if (pointer) mallet(me, pointer.x, pointer.y, 1400, dt, 'bottom');
      else {
        const kx = (kit.held('ArrowRight') || kit.held('KeyD') ? 1 : 0) - (kit.held('ArrowLeft') || kit.held('KeyA') ? 1 : 0) + padX;
        const ky = (kit.held('ArrowDown') || kit.held('KeyS') ? 1 : 0) - (kit.held('ArrowUp') || kit.held('KeyW') ? 1 : 0) + padY;
        mallet(me, me.x + kx * 60, me.y + ky * 60, 460, dt, 'bottom');
      }
      // the house: chase the puck in its half, otherwise guard the goal
      const attack = puck.y < TH / 2 + 30 && (puck.vy < 120 || puck.y < TH / 2 - 40);
      const tx = attack ? puck.x : TW / 2 + (puck.x - TW / 2) * 0.4, ty = attack ? puck.y - 6 : 54;
      mallet(cpu, tx, ty, 330 + Math.min(sMe, 5) * 18, dt, 'top');
      if (serveT > 0) { serveT -= dt; return; }
      for (let i = 0; i < 4; i++) {
        const h = dt / 4; puck.x += puck.vx * h; puck.y += puck.vy * h;
        if (puck.x < PR) { puck.x = PR; puck.vx = Math.abs(puck.vx) * 0.9; sound.thud(); }
        if (puck.x > TW - PR) { puck.x = TW - PR; puck.vx = -Math.abs(puck.vx) * 0.9; sound.thud(); }
        const inMouth = Math.abs(puck.x - TW / 2) < GOAL / 2;
        if (puck.y < PR && !inMouth) { puck.y = PR; puck.vy = Math.abs(puck.vy) * 0.9; sound.thud(); }
        if (puck.y > TH - PR && !inMouth) { puck.y = TH - PR; puck.vy = -Math.abs(puck.vy) * 0.9; sound.thud(); }
        strike(me); strike(cpu);
      }
      puck.vx *= 1 - 0.25 * dt; puck.vy *= 1 - 0.25 * dt;
      if (puck.y < -PR) goal(true); else if (puck.y > TH + PR) goal(false);
    }
    function goal(mine) {
      if (mine) sMe++; else sCpu++;
      msg = mine ? 'GOAL!' : 'THEIR GOAL'; msgT = 1.2; if (mine) sound.fanfare(); else sound.back();
      if (sMe >= WIN_AT || sCpu >= WIN_AT) {
        over = true; const won = sMe > sCpu;
        res = won ? award(3) : { give: 0, capped: false };
        if (won) { set('bitcade:hockey:wins', (+get('bitcade:hockey:wins') || 0) + 1); kit.say('I WON AT AIR HOCKEY!', 2.6, true); }
        return;
      }
      serve(!mine);
    }
    const toTable = (px, py) => ({ x: px - OX, y: py - OY });
    return {
      name: 'hockey',
      held(ax, ay) { padX = Math.abs(ax) > 0.25 ? ax : 0; padY = Math.abs(ay || 0) > 0.25 ? ay : 0; },
      draw(x, t, dt) {
        step(Math.min(0.033, dt || 0.016));
        x.fillStyle = 'rgba(5,2,12,.95)'; x.fillRect(0, 0, VW, VH);
        x.save(); x.translate(OX, OY);
        x.fillStyle = OUT; x.fillRect(-14, -14, TW + 28, TH + 28); x.fillStyle = '#c8304a'; x.fillRect(-10, -10, TW + 20, TH + 20);
        x.fillStyle = '#e8f4ff'; x.fillRect(0, 0, TW, TH);
        x.fillStyle = 'rgba(80,140,220,.12)'; for (let i = 8; i < TW; i += 16) for (let j = 8; j < TH; j += 16) x.fillRect(i, j, 2, 2); // the air holes
        x.strokeStyle = '#ff4f6d'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, TH / 2); x.lineTo(TW, TH / 2); x.stroke();
        x.strokeStyle = '#5ee7ff'; x.beginPath(); x.arc(TW / 2, TH / 2, 40, 0, 6.29); x.stroke();
        x.beginPath(); x.arc(TW / 2, 0, GOAL / 2, 0, Math.PI); x.stroke(); x.beginPath(); x.arc(TW / 2, TH, GOAL / 2, Math.PI, 0); x.stroke();
        x.fillStyle = OUT; x.fillRect(TW / 2 - GOAL / 2, -10, GOAL, 10); x.fillRect(TW / 2 - GOAL / 2, TH, GOAL, 10);
        // puck and mallets
        x.fillStyle = 'rgba(0,0,0,.2)'; x.beginPath(); x.arc(puck.x + 2, puck.y + 3, PR, 0, 6.29); x.fill();
        x.fillStyle = OUT; x.beginPath(); x.arc(puck.x, puck.y, PR + 2, 0, 6.29); x.fill(); x.fillStyle = '#1a1a24'; x.beginPath(); x.arc(puck.x, puck.y, PR, 0, 6.29); x.fill(); x.fillStyle = '#4a4a5a'; x.beginPath(); x.arc(puck.x - 3, puck.y - 3, 4, 0, 6.29); x.fill();
        [[cpu, '#ff4f6d'], [me, '#3dd6ff']].forEach(([m, c]) => {
          x.fillStyle = 'rgba(0,0,0,.2)'; x.beginPath(); x.arc(m.x + 3, m.y + 4, MR, 0, 6.29); x.fill();
          x.fillStyle = OUT; x.beginPath(); x.arc(m.x, m.y, MR + 2, 0, 6.29); x.fill(); x.fillStyle = c; x.beginPath(); x.arc(m.x, m.y, MR, 0, 6.29); x.fill();
          x.fillStyle = kit.shade(c, -0.3); x.beginPath(); x.arc(m.x, m.y, MR * 0.55, 0, 6.29); x.fill(); x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(m.x - 6, m.y - 7, 4, 0, 6.29); x.fill();
        });
        x.restore();
        // the scoreboard beside the table
        const SX = OX - 190; kit.neon(x, 'AIR HOCKEY', SX + 80, 90, 20, '#5ee7ff');
        x.font = '12px Silkscreen, monospace'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('HOUSE', SX, 150); x.fillText('YOU', SX, 230);
        x.font = '40px Bungee, sans-serif'; x.fillStyle = '#ff4f6d'; x.fillText(String(sCpu), SX, 190); x.fillStyle = '#3dd6ff'; x.fillText(String(sMe), SX, 270);
        x.font = '10px Silkscreen, monospace'; x.fillStyle = '#ffd23d'; x.fillText(`FIRST TO ${WIN_AT} · WINS ${+get('bitcade:hockey:wins') || 0}`, SX, 316);
        if (msgT > 0 && !over) kit.neon(x, msg, VW / 2, OY + TH / 2, 30, msg === 'GOAL!' ? '#3dff8f' : '#ff4f6d');
        hint(x, 'MOVE: MOUSE, DRAG, ARROWS OR STICK · ESC LEAVE', VH - 12);
        if (over) {
          x.fillStyle = 'rgba(5,2,12,.8)'; x.fillRect(VW / 2 - 220, VH / 2 - 100, 440, 200); x.strokeStyle = '#5ee7ff'; x.lineWidth = 2; x.strokeRect(VW / 2 - 214, VH / 2 - 94, 428, 188);
          kit.neon(x, sMe > sCpu ? 'YOU WIN!' : 'THE HOUSE WINS', VW / 2, VH / 2 - 50, 28, sMe > sCpu ? '#3dff8f' : '#ff4f6d');
          x.font = '14px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#ffd23d'; x.fillText(`${sMe} - ${sCpu}${res.give ? ` · +${res.give} TICKETS` : res.capped ? ' · TICKET LIMIT REACHED TODAY' : ''}`, VW / 2, VH / 2);
          hint(x, 'ENTER OR TAP FOR A REMATCH · ESC TO LEAVE', VH / 2 + 50);
        }
      },
      key(c) { if (isClose(c)) { sound.back(); return kit.close(); } if (over && c === 'Enter') reset(); },
      tap(px, py) { if (over) return reset(); const p = toTable(px, py); if (p.x > -40 && p.x < TW + 40 && p.y > -40 && p.y < TH + 40) pointer = p; else kit.close(); },
      move(px, py, down) { const p = toTable(px, py); if (down || pointer) pointer = p; },
      untap() { pointer = null; }
    };
  }

  /* ---------- mini-golf: six holes; drag back from the ball and let go, or hold Enter for power ---------- */
  const HOLES = [
    { par: 2, start: [260, 330], cup: [260, 70], walls: [[180, 30, 340, 30], [340, 30, 340, 370], [340, 370, 180, 370], [180, 370, 180, 30]] },
    { par: 3, start: [120, 330], cup: [400, 80], shape: [[60, 370], [60, 30], [460, 30], [460, 150], [190, 150], [190, 370]], walls: [[60, 370, 60, 30], [60, 30, 460, 30], [460, 30, 460, 150], [460, 150, 190, 150], [190, 150, 190, 370], [190, 370, 60, 370]] },
    { par: 2, start: [260, 340], cup: [260, 60], bumpers: [[200, 200, 18], [320, 200, 18], [260, 140, 18], [260, 260, 14]], walls: [[140, 20, 380, 20], [380, 20, 380, 380], [380, 380, 140, 380], [140, 380, 140, 20]] },
    { par: 3, start: [90, 200], cup: [440, 200], spinner: { x: 265, y: 200, len: 70, speed: 1.6 }, walls: [[40, 120, 490, 120], [490, 120, 490, 280], [490, 280, 40, 280], [40, 280, 40, 120]] },
    { par: 3, start: [260, 350], cup: [260, 50], sand: [[160, 150, 200, 70]], bumpers: [[150, 240, 14], [370, 240, 14]], walls: [[100, 20, 420, 20], [420, 20, 420, 390], [420, 390, 100, 390], [100, 390, 100, 20], [100, 120, 200, 140], [420, 120, 320, 140]] },
    { par: 4, start: [80, 330], cup: [440, 70], walls: [[30, 380, 490, 380], [490, 380, 490, 20], [490, 20, 30, 20], [30, 20, 30, 380], [30, 260, 400, 260], [120, 140, 490, 140]], bumpers: [[300, 320, 12], [200, 200, 12]] }
  ];
  function golf() {
    const OX = VW / 2 - 270, OY = 92, BR = 6, CUP = 9;
    let hole, ball, strokes, card, aim, power, pdir, charging, drag, sunk, over, res, best, msg, msgT, padX = 0, spinA = 0, still = true;
    const reset = () => { card = []; best = +get('bitcade:golf:best') || 0; over = false; res = null; load(0); };
    function load(i) { hole = i; const h = HOLES[i]; ball = { x: h.start[0], y: h.start[1], vx: 0, vy: 0 }; strokes = 0; aim = -Math.PI / 2; power = 0; pdir = 1; charging = false; drag = null; sunk = false; msg = `HOLE ${i + 1} · PAR ${h.par}`; msgT = 1.6; }
    reset();
    const H = () => HOLES[hole];
    function seg(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, k = Math.max(0, Math.min(1, ((ball.x - ax) * dx + (ball.y - ay) * dy) / l2));
      const qx = ax + dx * k, qy = ay + dy * k, ex = ball.x - qx, ey = ball.y - qy, d = Math.hypot(ex, ey);
      if (d >= BR + 2 || d === 0) return; const nx = ex / d, ny = ey / d; ball.x = qx + nx * (BR + 2); ball.y = qy + ny * (BR + 2);
      const vn = ball.vx * nx + ball.vy * ny; if (vn < 0) { ball.vx -= 1.75 * vn * nx; ball.vy -= 1.75 * vn * ny; if (vn < -60) sound.thud(); }
    }
    function putt(p) {
      if (!still || sunk || over) return;
      const sp = 80 + p * 620; ball.vx = Math.cos(aim) * sp; ball.vy = Math.sin(aim) * sp; strokes++; still = false; charging = false; sound.clank();
    }
    function step(dt) {
      if (msgT > 0) msgT -= dt;
      const h = H(); if (h.spinner) spinA += h.spinner.speed * dt;
      if (over || sunk) return;
      if (still) {
        const turn = (kit.held('ArrowRight') || kit.held('KeyD') ? 1 : 0) - (kit.held('ArrowLeft') || kit.held('KeyA') ? 1 : 0) + padX;
        if (turn) aim += turn * dt * 2.2;
        if (charging) { power += pdir * dt * 1.1; if (power > 1) { power = 1; pdir = -1; } if (power < 0) { power = 0; pdir = 1; } if (charging === 'key' && !kit.held('Space') && !kit.held('Enter')) putt(power); }
        return;
      }
      for (let i = 0; i < 6; i++) {
        const s = dt / 6; ball.x += ball.vx * s; ball.y += ball.vy * s;
        for (const w of h.walls) seg(...w);
        for (const [bx, by, r] of h.bumpers || []) { const ex = ball.x - bx, ey = ball.y - by, d = Math.hypot(ex, ey); if (d < r + BR && d) { const nx = ex / d, ny = ey / d; ball.x = bx + nx * (r + BR); ball.y = by + ny * (r + BR); const vn = ball.vx * nx + ball.vy * ny; if (vn < 0) { ball.vx -= 2.2 * vn * nx; ball.vy -= 2.2 * vn * ny; sound.beep(true); } } }
        if (h.spinner) { const sp = h.spinner, ca = Math.cos(spinA) * sp.len, sa = Math.sin(spinA) * sp.len; seg(sp.x - ca, sp.y - sa, sp.x + ca, sp.y + sa); }
      }
      const inSand = (h.sand || []).some(([sx, sy, sw, sh]) => ball.x > sx && ball.x < sx + sw && ball.y > sy && ball.y < sy + sh);
      const f = inSand ? 3.2 : 0.9; ball.vx *= Math.max(0, 1 - f * dt); ball.vy *= Math.max(0, 1 - f * dt);
      let sp = Math.hypot(ball.vx, ball.vy); if (sp > 0) { const dec = Math.min(sp, 26 * dt); ball.vx -= ball.vx / sp * dec; ball.vy -= ball.vy / sp * dec; sp -= dec; }
      const dc = Math.hypot(ball.x - h.cup[0], ball.y - h.cup[1]);
      if (dc < CUP && sp < 330) { sunk = true; ball.x = h.cup[0]; ball.y = h.cup[1]; holeDone(); return; }
      if (dc < CUP + 4 && sp < 500) { ball.vx += (h.cup[0] - ball.x) * 6 * dt; ball.vy += (h.cup[1] - ball.y) * 6 * dt; } // the lip pulls it in
      if (sp < 6) { ball.vx = ball.vy = 0; still = true; if (strokes >= 8) { card.push(strokes + 1); msg = 'PICKED UP'; msgT = 1.4; setTimeout(next, 1200); still = false; sunk = true; } }
    }
    function holeDone() {
      card.push(strokes); const d = strokes - H().par;
      msg = strokes === 1 ? 'HOLE IN ONE!' : d <= -2 ? 'EAGLE!' : d === -1 ? 'BIRDIE!' : d === 0 ? 'PAR' : d === 1 ? 'BOGEY' : `+${d}`; msgT = 1.6;
      if (d < 0) sound.fanfare(); else sound.select();
      if (strokes === 1) kit.say('HOLE IN ONE!', 2.4, true);
      setTimeout(next, 1400);
    }
    function next() {
      if (hole + 1 < HOLES.length) return load(hole + 1);
      over = true; const total = card.reduce((a, b) => a + b, 0), par = HOLES.reduce((a, b) => a + b.par, 0);
      res = award(Math.max(1, Math.floor((par + 8 - total) / 2)));
      if (!best || total < best) { set('bitcade:golf:best', total); best = total; kit.say(`NEW GOLF BEST: ${total}!`, 2.6, true); }
    }
    const aimFromDrag = (px, py) => { const dx = drag.x - px, dy = drag.y - py, d = Math.hypot(dx, dy); if (d > 4) { aim = Math.atan2(dy, dx); power = Math.min(1, d / 160); } };
    return {
      name: 'golf',
      held(ax) { padX = Math.abs(ax) > 0.3 ? Math.sign(ax) : 0; },
      draw(x, t, dt) {
        step(Math.min(0.033, dt || 0.016));
        const h = H();
        x.fillStyle = 'rgba(5,2,12,.95)'; x.fillRect(0, 0, VW, VH);
        x.save(); x.translate(OX, OY);
        // the green: fill inside the walls (drawn as a felt rectangle under them), sand, bumpers, the spinner, the cup
        const xs = h.walls.flatMap(w => [w[0], w[2]]), ys = h.walls.flatMap(w => [w[1], w[3]]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const shape = h.shape || [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
        const outline = grow => { x.beginPath(); shape.forEach(([px, py], i) => { const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, gx = px + Math.sign(px - cx) * grow, gy = py + Math.sign(py - cy) * grow; i ? x.lineTo(gx, gy) : x.moveTo(gx, gy); }); x.closePath(); };
        outline(12); x.fillStyle = '#0a3a1a'; x.fill(); outline(0); x.fillStyle = '#2f9a48'; x.fill();
        x.save(); outline(0); x.clip(); x.fillStyle = 'rgba(255,255,255,.04)'; for (let i = minX; i < maxX; i += 24) x.fillRect(i, minY, 12, maxY - minY); x.restore();
        for (const [sx, sy, sw, sh] of h.sand || []) { x.fillStyle = '#e8c890'; x.beginPath(); x.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, 6.29); x.fill(); x.fillStyle = 'rgba(160,120,60,.3)'; for (let k = 0; k < 14; k++) x.fillRect(sx + 10 + (k * 37) % (sw - 20), sy + 8 + (k * 23) % (sh - 16), 2, 2); }
        x.fillStyle = OUT; x.beginPath(); x.arc(h.cup[0], h.cup[1], CUP + 2, 0, 6.29); x.fill(); x.fillStyle = '#05140a'; x.beginPath(); x.arc(h.cup[0], h.cup[1], CUP, 0, 6.29); x.fill();
        x.fillStyle = '#e8e4f0'; x.fillRect(h.cup[0] - 1, h.cup[1] - 34, 2, 34); x.fillStyle = '#ff4f6d'; x.beginPath(); x.moveTo(h.cup[0] + 1, h.cup[1] - 34); x.lineTo(h.cup[0] + 18, h.cup[1] - 28 + Math.sin(t / 200) * 2); x.lineTo(h.cup[0] + 1, h.cup[1] - 22); x.fill();
        x.lineCap = 'round';
        for (const w of h.walls) { x.strokeStyle = OUT; x.lineWidth = 10; x.beginPath(); x.moveTo(w[0], w[1]); x.lineTo(w[2], w[3]); x.stroke(); x.strokeStyle = '#c87a3a'; x.lineWidth = 6; x.stroke(); }
        for (const [bx, by, r] of h.bumpers || []) { x.fillStyle = OUT; x.beginPath(); x.arc(bx, by, r + 2, 0, 6.29); x.fill(); x.fillStyle = '#ff4fd1'; x.beginPath(); x.arc(bx, by, r, 0, 6.29); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(bx - r / 3, by - r / 3, r / 4, 0, 6.29); x.fill(); }
        if (h.spinner) { const sp = h.spinner, ca = Math.cos(spinA) * sp.len, sa = Math.sin(spinA) * sp.len; x.strokeStyle = OUT; x.lineWidth = 12; x.beginPath(); x.moveTo(sp.x - ca, sp.y - sa); x.lineTo(sp.x + ca, sp.y + sa); x.stroke(); x.strokeStyle = '#ffd23d'; x.lineWidth = 8; x.stroke(); x.fillStyle = OUT; x.beginPath(); x.arc(sp.x, sp.y, 7, 0, 6.29); x.fill(); x.fillStyle = '#c0c6d0'; x.beginPath(); x.arc(sp.x, sp.y, 5, 0, 6.29); x.fill(); }
        // the aim line and the ball
        if (still && !sunk && !over) {
          const len = 30 + power * 90; x.strokeStyle = 'rgba(255,255,255,.7)'; x.setLineDash([5, 5]); x.lineWidth = 2; x.beginPath(); x.moveTo(ball.x, ball.y); x.lineTo(ball.x + Math.cos(aim) * len, ball.y + Math.sin(aim) * len); x.stroke(); x.setLineDash([]);
        }
        if (!sunk || msgT > 1.2) { x.fillStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.arc(ball.x + 2, ball.y + 3, BR, 0, 6.29); x.fill(); x.fillStyle = OUT; x.beginPath(); x.arc(ball.x, ball.y, BR + 1.5, 0, 6.29); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(ball.x, ball.y, BR, 0, 6.29); x.fill(); }
        x.restore();
        // the scorecard along the top, the power meter
        kit.neon(x, 'MINI GOLF', VW / 2, 26, 20, '#3dff8f');
        x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
        HOLES.forEach((hh, i) => { const cx = VW / 2 - 165 + i * 66; x.fillStyle = i === hole && !over ? '#ffd23d' : 'rgba(255,255,255,.5)'; x.fillText(`${i + 1}·P${hh.par}`, cx, 54); x.fillStyle = '#fff'; x.fillText(card[i] !== undefined ? String(card[i]) : i === hole && !over ? String(strokes) : '-', cx, 72); });
        x.textAlign = 'left'; x.fillStyle = 'rgba(255,255,255,.55)'; x.fillText(`BEST ${best || '-'}`, 20, 54);
        if (still && !over) { const MX = VW - 54; x.fillStyle = OUT; x.fillRect(MX - 2, 200, 28, 240); x.fillStyle = '#140c24'; x.fillRect(MX, 202, 24, 236); x.fillStyle = power > 0.75 ? '#ff4f6d' : power > 0.4 ? '#ffd23d' : '#3dff8f'; x.fillRect(MX, 438 - 236 * power, 24, 236 * power); x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('POWER', MX + 12, 188); }
        if (msgT > 0) kit.neon(x, msg, VW / 2, VH / 2, 30, '#ffd23d');
        hint(x, 'DRAG BACK FROM THE BALL AND LET GO · OR ← → AIM, HOLD ENTER FOR POWER · ESC LEAVE', VH - 12);
        if (over) {
          const total = card.reduce((a, b) => a + b, 0), par = HOLES.reduce((a, b) => a + b.par, 0);
          x.fillStyle = 'rgba(5,2,12,.85)'; x.fillRect(VW / 2 - 220, VH / 2 - 100, 440, 200); x.strokeStyle = '#3dff8f'; x.lineWidth = 2; x.strokeRect(VW / 2 - 214, VH / 2 - 94, 428, 188);
          kit.neon(x, `${total} STROKES`, VW / 2, VH / 2 - 50, 28, '#3dff8f');
          x.font = '13px Silkscreen, monospace'; x.textAlign = 'center'; x.fillStyle = '#f4effd'; x.fillText(total < par ? `${par - total} UNDER PAR!` : total === par ? 'EVEN PAR' : `${total - par} OVER PAR`, VW / 2, VH / 2 - 10);
          x.fillStyle = '#ffd23d'; x.fillText(res.give ? `+${res.give} TICKETS` : res.capped ? 'TICKET LIMIT REACHED TODAY' : '', VW / 2, VH / 2 + 16);
          hint(x, 'ENTER OR TAP TO PLAY AGAIN · ESC TO LEAVE', VH / 2 + 60);
        }
      },
      key(c, src) {
        if (isClose(c)) { sound.back(); return kit.close(); }
        if (over) { if (c === 'Enter') reset(); return; }
        if (c === 'Enter' && still && !sunk) { if (src === 'pad') { if (charging) putt(power); else { charging = 'pad'; power = 0; pdir = 1; } } else if (!charging) { charging = 'key'; power = 0; pdir = 1; } }
      },
      tap(px, py) { if (over) return reset(); if (!still || sunk) return; drag = { x: px, y: py }; },
      move(px, py) { if (drag) aimFromDrag(px, py); },
      untap() { if (drag && still && power > 0.03) putt(power); drag = null; }
    };
  }

  /* ---------- the VIP room's records wall ---------- */
  function records() {
    const st = window.VIP ? VIP.status() : { badges: 0, mastered: 0, earned: 0 };
    let plays = 0; try { Object.keys(localStorage).filter(k => k.startsWith('arcade:plays:')).forEach(k => { plays += +localStorage.getItem(k) || 0; }); } catch (e) {}
    const rows = kit.cabs.filter(c => !c.vip).map(c => ({ n: c.g.name.toUpperCase(), b: kit.opt.info(c.g).best || 0, c: c.g.c, gold: kit.mastered.has(c.g.slug) })).sort((a, b) => b.b - a.b);
    return {
      name: 'records',
      draw(x) {
        const { X, Y, w } = panel(x, 'YOUR RECORDS', '#ffd23d', 720, 540);
        x.font = '11px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff6c2';
        x.fillText(`${st.badges} BADGES · ${st.mastered} MASTERED · ${plays.toLocaleString()} GAMES PLAYED · ${st.earned.toLocaleString()} TICKETS EARNED`, VW / 2, Y + 64);
        const half = Math.ceil(rows.length / 2);
        rows.forEach((r, i) => {
          const col = i < half ? 0 : 1, row = i % half, cx = X + 30 + col * (w / 2 - 10), y = Y + 96 + row * 30;
          x.textAlign = 'left'; x.fillStyle = r.c; x.fillText((r.gold ? '★ ' : '') + r.n, cx, y, 190);
          x.textAlign = 'right'; x.fillStyle = r.b ? '#fff6c2' : 'rgba(255,255,255,.3)'; x.fillText(r.b ? r.b.toLocaleString() : '—', cx + w / 2 - 50, y);
        });
        hint(x, '★ MASTERED · ENTER OR ESC TO CLOSE', Y + 520);
      },
      key(c) { if (c === 'Enter' || isClose(c)) { sound.back(); kit.close(); } },
      tap() { kit.close(); }
    };
  }

  /* ---------- using things ---------- */
  function use(o) {
    if (o.kind === 'jukebox') return kit.open(jukebox());
    if (o.kind === 'board') return kit.open(board());
    if (o.kind === 'booth') return kit.open(photobooth());
    if (o.kind === 'claw') return kit.open(claw());
    if (o.kind === 'records') return kit.open(records());
    if (o.kind === 'hockey') return kit.open(hockey());
    if (o.kind === 'golf') return kit.open(golf());
    if (o.kind === 'vipbar') { kit.staffSay('bartender', pick(['ONE GOLDEN SODA, SIR OR MADAM.', 'ON THE HOUSE, VIP.', 'SPARKLING GOLD. ENJOY.'])); kit.me.prop = 'gold'; kit.me.propT = 90; sound.fizz(); return; }
    if (o.kind === 'skee') { o.user = kit.me; return kit.open(skee(o)); }
    if (o.kind === 'pinball') { o.user = kit.me; return kit.open(pinball(o)); }
    if (o.kind === 'snack') { kit.staffSay('snack', pick(['ONE BITCOLA, COMING UP!', 'HERE YOU GO!', 'ON THE HOUSE!', 'STAY HYDRATED!'])); kit.me.prop = 'soda'; kit.me.propT = 60; sound.fizz(); }
  }
  function card(o) {
    const juke = get('bitcade:jukebox') || '', jg = juke && kit.cabs.find(c => c.g.slug === juke);
    if (o.kind === 'jukebox') return { title: 'JUKEBOX', sub: `NOW PLAYING: ${jg ? jg.g.name.toUpperCase() + ' THEME' : 'BITCADE THEME'} · pick any game's tune for the lobby`, btn: 'CHOOSE ▶', c: '#ff4fd1' };
    if (o.kind === 'board') return { title: 'HIGH-SCORE WALL', sub: 'World records for every cabinet, and your bests', btn: 'LOOK ▶', c: '#5ee7ff' };
    if (o.kind === 'booth') return { title: 'PHOTO BOOTH', sub: 'Four shots of you in your outfit, as a strip to save', btn: 'SNAP ▶', c: '#ff4fa3' };
    if (o.kind === 'claw') { const n = goesToday(); return { title: 'MEGA CLAW', sub: n ? `${n} FREE GO${n === 1 ? '' : 'ES'} LEFT TODAY · win 2 to 50 tickets` : 'NO GOES LEFT TODAY · come back tomorrow', btn: n ? 'PLAY ▶' : 'LOOK ▶', c: '#5ee7ff' }; }
    const left = () => { let t = null; try { t = JSON.parse(get('bitcade:floortix') || 'null'); } catch (e) {} return FLOOR_CAP - (t && t.d === today() ? t.n : 0); };
    if (o.kind === 'skee') return { title: 'SKEE-BALL', sub: `NINE BALLS · BEST ${bestOf('bitcade:skee:best')} · a ticket per 100 points (${left()} more today)`, btn: 'PLAY ▶', c: ['#ff4f6d', '#5ee7ff', '#ffd23d'][o.i % 3] };
    if (o.kind === 'pinball') return { title: `${o.name} PINBALL`, sub: `THREE BALLS · BEST ${bestOf('bitcade:pinball:best').toLocaleString()} · a ticket per 4,000 (${left()} more today)`, btn: 'PLAY ▶', c: o.c };
    if (o.kind === 'hockey') return { title: 'AIR HOCKEY', sub: `YOU AGAINST THE HOUSE · FIRST TO 7 · WINS ${+get('bitcade:hockey:wins') || 0} · 3 tickets a win (${left()} more today)`, btn: 'PLAY ▶', c: '#5ee7ff' };
    if (o.kind === 'golf') return { title: 'MINI GOLF', sub: `SIX HOLES, PAR ${HOLES.reduce((a, b) => a + b.par, 0)} · BEST ${+get('bitcade:golf:best') || '—'} · tickets for going under par (${left()} more today)`, btn: 'PLAY ▶', c: '#3dff8f' };
    if (o.kind === 'records') return { title: 'YOUR RECORDS', sub: 'Every best score you hold, your badges and your totals', btn: 'LOOK ▶', c: '#ffd23d' };
    if (o.kind === 'vipbar') return { title: 'GOLDEN SODA BAR', sub: 'VIPs drink gold. It tastes like winning.', btn: 'ORDER ▶', c: '#ffd23d' };
    if (o.kind === 'snack') return { title: 'SNACK BAR', sub: 'Free sodas. It’s that kind of arcade.', btn: 'GRAB ONE ▶', c: '#ffb03d' };
    return { title: o.kind.toUpperCase(), sub: '', btn: 'USE ▶', c: '#5ee7ff' };
  }
  return { sound, use, card, tick: (dt, now, s) => cabinetNoise(dt, s) };
};
