/* Bitcade boot effects (lobby only): window.Boot.
   - Boot.sound: the boot's own sound effects (power-on, disk chatter, the flight's swell, the logo hit, coin, doors).
     It starts on the first key, tap or button (a browser rule) and stays silent when SOUND is off (arcade:muted).
   - Boot.flight(canvas): the synthwave flight over the neon grid toward the sun, between two rows of glowing cabinets
     (the lobby sets Boot.games = { list, pal } so the cabinets show each game's colour and pixel icon). */
(() => {
  /* ---------- sound ---------- */
  const muted = () => { try { return localStorage.getItem('arcade:muted') === '1'; } catch (e) { return false; } };
  let ac = null, bus = null, noiseBuf = null, swellNodes = null, humNodes = null;
  function ctx() {
    if (muted()) return null;
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ac.destination);
        bus = ac.createGain(); bus.gain.value = 0.75; bus.connect(comp);
        // a short room echo, so hits ring out like they're in a big arcade
        const d = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain(); d.delayTime.value = 0.14; fb.gain.value = 0.3; wet.gain.value = 0.2;
        bus.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(comp);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  function env(g, t0, dur, vol, attack) {
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function osc(type, f0, f1, t0, dur, vol, attack = 0.005, dest = bus) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, dur, vol, attack); o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05); return o;
  }
  function noise(t0, dur, vol, { type = 'lowpass', f0 = 1000, f1 = f0, q = 0.8, pan = 0, attack = 0.005 } = {}) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t0); if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain(); env(g, t0, dur, vol, attack);
    let node = s.connect(fl).connect(g);
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(bus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }
  /** Wrap an effect: it only plays with sound allowed, starting a hair from now. */
  const fx = fn => (...a) => { if (!ctx()) return; try { fn(ac.currentTime + 0.01, ...a); } catch (e) {} };
  function stopSwell(fade) {
    if (!swellNodes) return; const t = ac.currentTime, { g, os } = swellNodes; swellNodes = null;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    os.forEach(o => o.stop(t + fade + 0.05));
  }

  const sound = {
    /** Power switch: a thunk, the tube's degauss and a faint high whine. */
    power: fx(t => {
      noise(t, 0.04, 0.35, { type: 'highpass', f0: 2500 });
      osc('sine', 110, 32, t, 0.55, 0.7);
      osc('sawtooth', 62, 58, t + 0.05, 1.1, 0.05, 0.02);
      osc('sine', 48, 48, t + 0.05, 1.0, 0.25, 0.02);
      osc('sine', 9400, 9200, t + 0.1, 1.6, 0.012, 0.2);
    }),
    /** The tube's hum while the BIOS checks run. */
    hum: on => {
      if (!ctx()) return; const t = ac.currentTime;
      if (on && !humNodes) {
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.5); g.connect(bus);
        const os = [[60, 'triangle', 1], [120, 'sine', 0.5], [180, 'sine', 0.2]].map(([f, type, v]) => { const o = ac.createOscillator(), og = ac.createGain(); o.type = type; o.frequency.value = f; og.gain.value = v; o.connect(og).connect(g); o.start(); return o; });
        humNodes = { g, os };
      } else if (!on && humNodes) {
        const { g, os } = humNodes; humNodes = null;
        g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); os.forEach(o => o.stop(t + 0.7));
      }
    },
    /** Disk chatter: a few clicky seeks. */
    disk: fx((t, n = 3) => { for (let i = 0; i < n; i++) noise(t + i * (0.03 + Math.random() * 0.05), 0.012 + Math.random() * 0.012, 0.18 + Math.random() * 0.15, { type: 'bandpass', f0: 1800 + Math.random() * 2400, q: 3 }); }),
    tick: fx(t => osc('square', 1900, 1900, t, 0.018, 0.02)),
    ok: fx(t => osc('square', 1400, 1400, t, 0.04, 0.025)),
    /** The single power-on self-test beep. */
    beep: fx(t => osc('square', 1000, 1000, t, 0.16, 0.06, 0.003)),
    /** The flight: a detuned synth chord opening up over dur seconds, with a rising wind. */
    swell: fx((t, dur) => {
      stopSwell(0.1);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + dur); g.connect(bus);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(160, t); lp.frequency.exponentialRampToValueAtTime(3200, t + dur); lp.connect(g);
      const os = [];
      [55, 110, 164.8, 220, 261.6, 329.6].forEach(f => [-6, 6].forEach(c => {
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = c;
        const og = ac.createGain(); og.gain.value = f < 60 ? 0.5 : 0.22; o.connect(og).connect(lp); o.start(t); os.push(o);
      }));
      swellNodes = { g, os };
      noise(t, dur + 0.1, 0.16, { type: 'bandpass', f0: 300, f1: 5000, q: 1.2, attack: dur * 0.9 });
    }),
    /** A cabinet whooshing past on one side (pan -1 left, 1 right). */
    whoosh: fx((t, pan) => noise(t, 0.42, 0.13, { type: 'bandpass', f0: 1400, f1: 260, q: 1.6, pan: pan * 0.7, attack: 0.16 })),
    /** The logo lands: a kick, a crack, thunder and a big chord. */
    slam: fx(t => {
      stopSwell(1.6);
      osc('sine', 170, 36, t, 0.7, 0.9, 0.002);
      osc('sine', 55, 50, t, 1.4, 0.45, 0.01);
      noise(t, 0.3, 0.6, { type: 'highpass', f0: 1800 });
      noise(t + 0.02, 2.4, 0.5, { type: 'lowpass', f0: 1100, f1: 90, attack: 0.03 });
      [220, 277.2, 329.6, 440, 554.4].forEach(f => {
        const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(500, t + 1.8);
        env(g, t, 1.9, 0.05, 0.004); o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + 2);
      });
    }),
    /** The chrome shine sweeping the logo. */
    shine: fx(t => { osc('sine', 2400, 4800, t, 0.35, 0.035, 0.05); osc('sine', 3600, 7000, t + 0.08, 0.3, 0.02, 0.05); }),
    /** A coin drops in: it bounces on the lip twice and the mechanism takes it. */
    coin: fx((t, at = 0.9) => {
      [0, 0.1].forEach((d, i) => { osc('sine', 2637, 2637, t + at + d, 0.14, 0.12 - i * 0.04); osc('sine', 3951, 3951, t + at + d, 0.1, 0.07 - i * 0.02); });
      noise(t + at + 0.2, 0.12, 0.45, { type: 'lowpass', f0: 700 });
      osc('sine', 150, 60, t + at + 0.2, 0.16, 0.5);
    }),
    /** The credit counter ticks up. */
    credit: fx(t => { osc('square', 1319, 1319, t, 0.08, 0.05); osc('square', 1760, 1760, t + 0.09, 0.16, 0.05); }),
    /** The doors roll shut and clang. */
    doorsClose: fx((t, at = 0.38) => {
      noise(t, at + 0.05, 0.22, { type: 'bandpass', f0: 250, f1: 900, q: 1.4, attack: at * 0.8 });
      [183, 431, 697, 1123, 1607].forEach((f, i) => osc('sine', f, f * 0.99, t + at, 0.9 - i * 0.1, 0.1 - i * 0.012));
      noise(t + at, 0.25, 0.6, { type: 'lowpass', f0: 500 });
      osc('sine', 130, 40, t + at, 0.35, 0.8);
    }),
    /** One letter of the neon sign buzzes on. */
    letter: fx((t, i = 0) => {
      osc('sawtooth', 120, 120, t, 0.09, 0.05); osc('sawtooth', 120, 120, t + 0.12, 0.14, 0.04);
      osc('sine', 880 * Math.pow(2, i / 7), 880 * Math.pow(2, i / 7), t + 0.11, 0.25, 0.05);
    }),
    /** The doors open: an air hiss and a rising fanfare. */
    doorsOpen: fx(t => {
      noise(t, 0.8, 0.22, { type: 'highpass', f0: 3500, attack: 0.04 });
      osc('sine', 90, 45, t, 0.4, 0.5);
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => osc('square', f, f, t + 0.05 + i * 0.055, 0.22, 0.045));
    }),
    /** Let a scheduled swell or hum go quiet (leaving the boot early). */
    hush() { if (!ac) return; stopSwell(0.3); sound.hum(false); }
  };

  /* ---------- the flight ---------- */
  const GS = 100, FAR = 5200, SPACE = 300, X = 290, CD = 52, CW = 62, CH = 150, CAMH = 62;
  function flight(cv) {
    const c = cv.getContext('2d'), sunCv = document.createElement('canvas'), sc = sunCv.getContext('2d');
    const games = (window.Boot.games && window.Boot.games.list) || [], pal = (window.Boot.games && window.Boot.games.pal) || {};
    let W = 0, H = 0, dpr = 1, raf = 0, last = 0, t = 0, camZ = 0, camX = 0, speed = 0, phase = 'idle';
    let rise = 0, flash = 0, shake = 0, bolts = [], boltT = 0, passed = 0, fog = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random() * 0.62, s: Math.random() < 0.15 ? 2 : 1, p: Math.random() * 6, c: ['#ffffff', '#ffffff', '#5ee7ff', '#ff7bf0', '#ffe36a'][Math.random() * 5 | 0] }));
    const streaks = Array.from({ length: 46 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), l: rnd(0.04, 0.14) }));
    const ridge = (n, seed) => { const r = []; let s = seed; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280; for (let i = 0; i <= n; i++) r.push(Math.pow(R(), 1.6)); r[0] = r[n] = 0; return r; };
    const far = ridge(28, 7), near = ridge(18, 31);
    const api = { onPass: null };

    function resize() {
      dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    const f = () => Math.max(W * 0.75, H * 0.62), hy = () => H * 0.56;
    const P = (x, y, z) => { const dz = z - camZ, k = f() / dz; return [W / 2 + (x - camX) * k, hy() + (CAMH - y) * k]; };
    const quad = (a, b, d, e) => { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]); c.closePath(); };

    function drawSky() {
      const h = hy(), g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05011a'); g.addColorStop(0.55, '#1d0640'); g.addColorStop(1, flash > 0 ? '#ff7bf0' : '#5a0f6a');
      c.fillStyle = g; c.fillRect(-60, -60, W + 120, h + 60);
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * 2.2 + s.p * 7);
        c.globalAlpha = tw * Math.min(1, 0.35 + rise); c.fillStyle = s.c; c.fillRect(s.x * W - (camX * 0.02), s.y * h, s.s, s.s);
      }
      c.globalAlpha = 1;
      // the sun: a striped disc rising behind the mountains, its stripes sliding down
      const R = Math.min(W, H) * 0.27, sy = h + R * 0.75 - rise * R * 1.05, sx = W / 2 - camX * 0.05;
      const glow = c.createRadialGradient(sx, sy, R * 0.6, sx, sy, R * 2.1);
      glow.addColorStop(0, 'rgba(255,61,154,.5)'); glow.addColorStop(1, 'rgba(255,61,154,0)');
      c.fillStyle = glow; c.fillRect(sx - R * 2.2, sy - R * 2.2, R * 4.4, R * 4.4);
      const sz = Math.ceil(R * 2 * dpr) + 2;
      if (sunCv.width !== sz) { sunCv.width = sunCv.height = sz; }
      sc.setTransform(dpr, 0, 0, dpr, 0, 0); sc.clearRect(0, 0, R * 2 + 2, R * 2 + 2);
      const sg = sc.createLinearGradient(0, 0, 0, R * 2); sg.addColorStop(0, '#fff3a0'); sg.addColorStop(0.35, '#ffd23d'); sg.addColorStop(0.62, '#ff7a3d'); sg.addColorStop(1, '#ff3d9a');
      sc.fillStyle = sg; sc.beginPath(); sc.arc(R, R, R, 0, Math.PI * 2); sc.fill();
      sc.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 10; i++) { const k = (i + (t * 0.35) % 1) / 10, y = R * (0.45 + k * 1.55), th = 1 + k * 13; sc.fillRect(0, y, R * 2, th); }
      sc.globalCompositeOperation = 'source-over';
      c.drawImage(sunCv, 0, 0, sz, sz, sx - R, sy - R, sz / dpr, sz / dpr);
      // two mountain ridges, wireframe-lit along the top
      [[far, 0.2, 0.18, '#12042a', '#5ee7ff', 0.01], [near, 0.12, 0.3, '#0c0220', '#ff3d9a', 0.03]].forEach(([r, hk, wk, fill, edge, par]) => {
        const n = r.length - 1, span = W * 1.5, x0 = W / 2 - span / 2 - camX * par;
        c.beginPath(); c.moveTo(x0, h + 1);
        r.forEach((v, i) => { const x = x0 + span * i / n; const side = Math.abs(i / n - 0.5) * 2; c.lineTo(x, h - v * H * hk * (0.25 + side * 0.9)); });
        c.lineTo(x0 + span, h + 1); c.closePath(); c.fillStyle = fill; c.fill();
        c.strokeStyle = edge; c.globalAlpha = 0.75; c.lineWidth = 1.5; c.stroke(); c.globalAlpha = 1;
      });
    }

    function drawGround() {
      const h = hy(), g = c.createLinearGradient(0, h, 0, H);
      g.addColorStop(0, '#2c0a4c'); g.addColorStop(1, '#06021a'); c.fillStyle = g; c.fillRect(-60, h, W + 120, H - h + 60);
      const zNear = CAMH * f() / (H + 40 - h);
      c.beginPath();
      for (let k = Math.floor((camZ + zNear) / GS) + 1; k * GS - camZ < FAR; k++) { const y = P(0, 0, k * GS)[1]; c.moveTo(-60, y); c.lineTo(W + 60, y); }
      for (let x = -3000; x <= 3000; x += GS) { const a = P(x, 0, camZ + zNear), b = P(x, 0, camZ + FAR); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      c.strokeStyle = '#ff3d9a'; c.globalAlpha = 0.22; c.lineWidth = 5; c.stroke(); c.globalAlpha = 0.95; c.lineWidth = 1.4; c.stroke(); c.globalAlpha = 1;
      // the road down the middle: dark, cyan edges, dashes rushing by
      const r = 128, a0 = P(-r, 0, camZ + zNear), a1 = P(r, 0, camZ + zNear), b1 = P(r, 0, camZ + FAR), b0 = P(-r, 0, camZ + FAR);
      quad(a0, a1, b1, b0); c.fillStyle = 'rgba(6,1,18,.88)'; c.fill();
      c.beginPath(); c.moveTo(a0[0], a0[1]); c.lineTo(b0[0], b0[1]); c.moveTo(a1[0], a1[1]); c.lineTo(b1[0], b1[1]);
      c.strokeStyle = '#5ee7ff'; c.globalAlpha = 0.25; c.lineWidth = 6; c.stroke(); c.globalAlpha = 1; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#ffe36a';
      for (let k = Math.floor((camZ + zNear) / 240) + 1; k * 240 - camZ < FAR * 0.6; k++) {
        const z = k * 240; quad(P(-5, 0, z), P(5, 0, z), P(5, 0, z + 110), P(-5, 0, z + 110)); c.globalAlpha = Math.max(0, 1 - (z - camZ) / (FAR * 0.6)); c.fill();
      }
      c.globalAlpha = 1;
      // fog along the horizon
      const fg = c.createLinearGradient(0, h - 2, 0, h + H * 0.08); fg.addColorStop(0, 'rgba(255,61,154,.55)'); fg.addColorStop(1, 'rgba(255,61,154,0)');
      c.fillStyle = fg; c.fillRect(-60, h - 2, W + 120, H * 0.08 + 2);
    }

    /** One cabinet: a box at the road's edge whose face (marquee, screen with the game's icon, buttons) looks across the road. */
    function cabinet(g, side, zc) {
      const dz = zc - camZ; if (dz + CW < 30 || dz > FAR * 0.8) return;
      const zn = Math.max(zc, camZ + 30), zf = zc + CW, x = side * X, xo = side * (X + CD), col = g.c || '#ff3d9a';
      c.globalAlpha = Math.max(0, Math.min(1, 1.25 - dz / (FAR * 0.8)));
      // glow pooled on the ground
      const pool = P(side * (X - 36), 0, zc + CW / 2), pk = f() / Math.max(40, zc + CW / 2 - camZ);
      const pg = c.createRadialGradient(pool[0], pool[1], 0, pool[0], pool[1], 90 * pk);
      pg.addColorStop(0, col + '66'); pg.addColorStop(1, col + '00'); c.fillStyle = pg;
      c.beginPath(); c.ellipse(pool[0], pool[1], 90 * pk, 26 * pk, 0, 0, Math.PI * 2); c.fill();
      // the near end of the box
      quad(P(x, 0, zn), P(xo, 0, zn), P(xo, CH, zn), P(x, CH, zn)); c.fillStyle = '#0d0518'; c.fill();
      c.strokeStyle = col; c.lineWidth = 1.2; c.stroke();
      // side art: a swoosh of the game's colour down the side panel
      const xs = t2 => side * (X + CD * t2);
      quad(P(xs(0.15), 22, zn), P(xs(0.5), 22, zn), P(xs(0.85), CH - 30, zn), P(xs(0.5), CH - 30, zn)); c.fillStyle = col + '55'; c.fill();
      quad(P(xs(0.3), 22, zn), P(xs(0.42), 22, zn), P(xs(0.77), CH - 30, zn), P(xs(0.65), CH - 30, zn)); c.fillStyle = col; c.fill();
      // the face
      const face = (y0, y1, z0, z1) => side > 0 ? quad(P(x, y0, z0), P(x, y0, z1), P(x, y1, z1), P(x, y1, z0)) : quad(P(x, y0, z1), P(x, y0, z0), P(x, y1, z0), P(x, y1, z1));
      face(0, CH, zn, zf); c.fillStyle = '#1a0b2e'; c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
      const zi0 = Math.max(zn, zc + 6), zi1 = zf - 6;
      if (zi1 > zi0) {
        face(CH - 24, CH - 5, zi0, zi1); c.fillStyle = col; c.fill(); // marquee
        face(48, 56, zi0, zi1); c.fillStyle = '#2d1a4c'; c.fill(); // control panel
        face(16, 32, zc + CW * 0.35, zc + CW * 0.65); c.fillStyle = '#ff8a3d'; if (zc + CW * 0.35 > camZ + 30) c.fill(); // coin door
        // the screen, with the game's icon (two frames, alternating)
        const s0 = Math.max(zn, zc + 9), s1 = zf - 9, y0 = 64, y1 = 118;
        if (s1 > s0) {
          face(y0, y1, s0, s1); c.fillStyle = '#05020c'; c.fill();
          const px = (Math.floor(t * 2) % 2 && g.px2) || g.px;
          if (px && dz < 2600 && zc + 9 > camZ + 30) {
            for (let j = 0; j < 8; j++) for (let i = 0; i < 12; i++) {
              const ch = px[j][i], pcol = pal[ch]; if (!pcol) continue;
              // read left to right as seen from the road
              const a = side > 0 ? 11 - i : i, za = zc + 9 + (CW - 18) * a / 12, zb = za + (CW - 18) / 12;
              const ya = y1 - 4 - (y1 - y0 - 8) * j / 8, yb = ya - (y1 - y0 - 8) / 8;
              quad(P(x, ya, za), P(x, ya, zb), P(x, yb, zb), P(x, yb, za)); c.fillStyle = pcol; c.fill();
            }
          }
          face(y0, y1, s0, s1); c.fillStyle = col + '22'; c.fill();
        }
      }
      c.globalAlpha = 1;
    }

    function drawCabinets() {
      const n = games.length; if (!n) return;
      const k0 = Math.floor((camZ - SPACE) / SPACE), k1 = Math.ceil((camZ + FAR * 0.8) / SPACE);
      for (let k = k1; k >= k0; k--) {
        const gi = ((k % n) + n) % n;
        cabinet(games[(gi * 2) % n], -1, k * SPACE);
        cabinet(games[(gi * 2 + 1) % n], 1, k * SPACE + SPACE / 2);
      }
      // a whoosh as each one goes by
      const p = Math.floor((camZ - CW) / (SPACE / 2));
      if (p !== passed) { if (p > passed && speed > 700 && api.onPass) api.onPass(p % 2 ? 1 : -1); passed = p; }
    }

    function drawStreaks() {
      const k = Math.min(1, Math.max(0, (speed - 1100) / 1800)); if (k <= 0) return;
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; const cx = W / 2, cy = hy(), M = Math.hypot(W, H) * 0.7;
      for (const s of streaks) {
        s.r += speed / 9000 * (1 / 60) * 6; if (s.r > 1) { s.r = 0.05; s.a = Math.random() * Math.PI * 2; }
        const r0 = s.r * M, r1 = (s.r + s.l) * M;
        c.globalAlpha = k * 0.55 * s.r; c.beginPath(); c.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0 * 0.6); c.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1 * 0.6); c.stroke();
      }
      c.globalAlpha = 1;
    }

    function makeBolt(x0) {
      const pts = [[x0, -10]]; let x = x0, y = -10; const yEnd = hy() - 4;
      while (y < yEnd) { y += rnd(14, 34); x += rnd(-26, 26); pts.push([x, Math.min(y, yEnd)]); }
      const branches = [1, 2].map(() => { const at = pts[3 + (Math.random() * (pts.length - 5) | 0)] || pts[1]; const b = [at.slice()]; let bx = at[0], by = at[1]; const dir = Math.random() < 0.5 ? -1 : 1; for (let i = 0; i < 5; i++) { bx += dir * rnd(10, 30); by += rnd(10, 26); b.push([bx, by]); } return b; });
      return [pts, ...branches];
    }
    function drawBolts() {
      if (boltT <= 0 || (Math.floor(boltT * 28) % 3 === 1)) return;
      c.lineJoin = 'round';
      for (const bolt of bolts) for (const [i, line] of bolt.entries()) {
        c.beginPath(); line.forEach(([x, y], j) => j ? c.lineTo(x, y) : c.moveTo(x, y));
        c.strokeStyle = '#5ee7ff'; c.globalAlpha = 0.35; c.lineWidth = i ? 6 : 12; c.stroke();
        c.strokeStyle = '#ffffff'; c.globalAlpha = 1; c.lineWidth = i ? 1.5 : 3; c.stroke();
      }
      c.globalAlpha = 1;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now; t += dt;
      if (phase === 'fly') { const k = Math.min(1, t / 3); speed = 900 + 2600 * Math.pow(1 - k, 1.6); rise = Math.min(1, t / 2.8); }
      else if (phase === 'cruise') { speed += (240 - speed) * Math.min(1, dt * 1.2); rise = Math.min(1, rise + dt); }
      camZ += speed * dt; camX = Math.sin(t * 0.45) * 36;
      flash = Math.max(0, flash - dt * 2.2); shake = Math.max(0, shake - dt * 40); boltT -= dt;
      draw();
    }
    function draw() {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.save();
      const roll = Math.sin(t * 0.6) * 0.012 + (phase === 'fly' ? Math.sin(t * 1.7) * 0.01 : 0);
      c.translate(W / 2 + (Math.random() - 0.5) * shake, H / 2 + (Math.random() - 0.5) * shake); c.rotate(roll); c.translate(-W / 2, -H / 2);
      drawSky(); drawBolts(); drawGround(); drawCabinets(); drawStreaks();
      c.restore();
      if (flash > 0) { c.fillStyle = '#ffffff'; c.globalAlpha = Math.min(1, flash); c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    }

    addEventListener('resize', () => { if (phase !== 'idle') { resize(); if (!raf) draw(); } });
    return Object.assign(api, {
      /** Fly in fast from below the sunrise, slowing toward the horizon. */
      start() { resize(); phase = 'fly'; t = 0; last = 0; camZ = 0; passed = 0; rise = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
      /** The logo lands: lightning, a white flash and a jolt, then cruise. */
      slam() { phase = 'cruise'; flash = 1.1; shake = 22; boltT = 0.45; bolts = [makeBolt(W * rnd(0.18, 0.36)), makeBolt(W * rnd(0.64, 0.82))]; rise = Math.max(rise, 0.9); },
      /** Just cruise (attract mode), sun up. */
      cruise() { resize(); phase = 'cruise'; speed = 240; rise = 1; last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
      /** One still frame (reduced motion). */
      still() { resize(); phase = 'still'; rise = 1; speed = 0; t = 1; draw(); },
      stop() { cancelAnimationFrame(raf); raf = 0; phase = 'idle'; }
    });
  }

  window.Boot = { sound, flight, games: null };
})();
