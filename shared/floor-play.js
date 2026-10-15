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
          else { sound.shutter(); kit.booth.flash = 1; shot++; t0 = performance.now(); k = 0; if (shot >= 4) { st = 'done'; result = strip(); sound.fanfare(); kit.say('LOOKING GOOD!', 2, true); } }
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
        else { got.vy += 900 * dt; got.y += got.vy * dt; if (got.y > BY + BH + 40) { won = got.v; caps.splice(caps.indexOf(got), 1); got = null; wonT = 2.6; st = 'won'; TICKETS.add(won); kit.opt.onTickets && kit.opt.onTickets(); sound.fanfare(); kit.say(`+${won} TICKETS!`, 2.6, true); kit.refreshCard(); } }
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

  /* ---------- using things ---------- */
  function use(o) {
    if (o.kind === 'jukebox') return kit.open(jukebox());
    if (o.kind === 'board') return kit.open(board());
    if (o.kind === 'booth') return kit.open(photobooth());
    if (o.kind === 'claw') return kit.open(claw());
    if (o.kind === 'snack') { kit.staffSay('snack', pick(['ONE BITCOLA, COMING UP!', 'HERE YOU GO!', 'ON THE HOUSE!', 'STAY HYDRATED!'])); kit.me.prop = 'soda'; kit.me.propT = 60; sound.fizz(); }
  }
  function card(o) {
    const juke = get('bitcade:jukebox') || '', jg = juke && kit.cabs.find(c => c.g.slug === juke);
    if (o.kind === 'jukebox') return { title: 'JUKEBOX', sub: `NOW PLAYING: ${jg ? jg.g.name.toUpperCase() + ' THEME' : 'BITCADE THEME'} · pick any game's tune for the lobby`, btn: 'CHOOSE ▶', c: '#ff4fd1' };
    if (o.kind === 'board') return { title: 'HIGH-SCORE WALL', sub: 'World records for every cabinet, and your bests', btn: 'LOOK ▶', c: '#5ee7ff' };
    if (o.kind === 'booth') return { title: 'PHOTO BOOTH', sub: 'Four shots of you in your outfit, as a strip to save', btn: 'SNAP ▶', c: '#ff4fa3' };
    if (o.kind === 'claw') { const n = goesToday(); return { title: 'MEGA CLAW', sub: n ? `${n} FREE GO${n === 1 ? '' : 'ES'} LEFT TODAY · win 2 to 50 tickets` : 'NO GOES LEFT TODAY · come back tomorrow', btn: n ? 'PLAY ▶' : 'LOOK ▶', c: '#5ee7ff' }; }
    if (o.kind === 'snack') return { title: 'SNACK BAR', sub: 'Free sodas. It’s that kind of arcade.', btn: 'GRAB ONE ▶', c: '#ffb03d' };
    return { title: o.kind.toUpperCase(), sub: '', btn: 'USE ▶', c: '#5ee7ff' };
  }
  return { sound, use, card, tick: (dt, now, s) => cabinetNoise(dt, s) };
};
