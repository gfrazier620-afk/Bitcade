/*
 * Chip: a tiny chiptune player for Bitcade, exposed as window.Chip.
 * Square-wave lead, triangle bass, pulse arpeggio and noise drums, scheduled a little ahead on the Web Audio clock.
 * The lobby has its own theme; every game gets a theme composed from its name, so it's the same tune every visit.
 * Music only plays once the browser allows sound (after a tap or key) and while SOUND and MUSIC are both on.
 */
(() => {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const on = () => store.get('arcade:music') !== '0' && store.get('arcade:muted') !== '1';
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  let ac = null, out = null, noise = null, song = null, timer = null, step = 0, nextT = 0, level = 0.5; // level: music volume
  const gainOf = () => Math.max(0.0001, level * (store.get('arcade:vol:music') == null ? 1 : +store.get('arcade:vol:music') / 100)); // times the player's music volume (shared/settings.js)

  /* ---------- voices ---------- */
  function tone(type, m, t, dur, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(hz(m), t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + dur * 0.65); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function drum(kind, t) {
    if (kind === 'k') {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.16); return;
    }
    if (!noise) { const n = ac.sampleRate * 0.3; noise = ac.createBuffer(1, n, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), snare = kind === 's', len = snare ? 0.13 : 0.035;
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = snare ? 1400 : 7000;
    g.gain.setValueAtTime(snare ? 0.07 : 0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + len + 0.02);
  }

  /* ---------- sequencer: 16 steps a bar ---------- */
  function play16(i, t) {
    const sp = 60 / song.bpm / 4, L = song.lead[i], B = song.bass[i], R = song.arp[i], D = song.drums[i];
    if (L) tone('square', L.m, t, L.len * sp * 0.92, 0.05);
    if (B) tone('triangle', B.m, t, B.len * sp, 0.13);
    if (R) tone('square', R.m, t, sp * 0.8, 0.014);
    if (D) drum(D, t);
  }
  function tick() {
    if (!song || !ac) return;
    const sp = 60 / song.bpm / 4;
    while (nextT < ac.currentTime + 0.12) { play16(step, nextT); step = (step + 1) % song.len; nextT += sp; }
  }
  function start() {
    if (!song || !on() || !ac || ac.state !== 'running' || timer) return;
    const t = ac.currentTime;
    out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(gainOf(), t + 0.4);
    step = 0; nextT = t + 0.05; timer = setInterval(tick, 25); tick();
  }
  function halt(fade) {
    if (timer) { clearInterval(timer); timer = null; }
    if (ac && out) { const t = ac.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + fade); }
  }
  function ensure() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination); } catch (e) { return; } }
    if (ac.state === 'suspended') ac.resume().then(start, () => {});
  }
  // browsers start sound on a tap or key; pick up a waiting tune then
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (song && on()) { ensure(); start(); } }, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend().catch(() => {}); else if (song && on()) ac.resume().catch(() => {}); });

  /* ---------- composing ---------- */
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = n => 12 * (+n.slice(-1) + 1) + NOTE[n[0]] + (n[1] === '#' ? 1 : 0);
  /** Build a song from bars of "E5:3 D5:1 -:2" (note:sixteenths, - is a rest), bass roots and arpeggio chords. */
  function written(bpm, leadBars, roots, chords) {
    const len = leadBars.length * 16, s = { bpm, len, lead: Array(len).fill(null), bass: Array(len).fill(null), arp: Array(len).fill(null), drums: Array(len).fill(null) };
    leadBars.forEach((bar, b) => { let at = b * 16; bar.trim().split(/\s+/).forEach(tok => { const [n, l] = tok.split(':'); if (n !== '-') s.lead[at] = { m: midi(n), len: +l }; at += +l; }); });
    for (let b = 0; b < leadBars.length; b++) {
      const root = midi(roots[b % roots.length]), ch = chords[b % chords.length].map(midi);
      [0, 12, 0, 12, 0, 12, 7, 12].forEach((o, k) => { s.bass[b * 16 + k * 2] = { m: root + o, len: 1.7 }; });
      for (let i = 0; i < 16; i++) s.arp[b * 16 + i] = { m: ch[[0, 1, 2, 1][i % 4]] + 12 };
      for (let i = 0; i < 16; i++) s.drums[b * 16 + i] = i % 8 === 0 ? 'k' : i % 8 === 4 ? 's' : i % 2 === 0 ? 'h' : null;
    }
    return s;
  }
  // The Bitcade theme: Am – F – C – G, synthwave-ish
  const LOBBY = written(116, [
    'E5:3 E5:1 D5:2 C5:2 A4:3 C5:1 D5:2 E5:2',
    'F5:3 E5:1 D5:2 C5:2 D5:4 A4:4',
    'G5:3 E5:1 C5:2 E5:2 G5:2 A5:2 G5:4',
    'D5:3 E5:1 D5:2 B4:2 G4:4 -:4',
    'E5:3 E5:1 D5:2 C5:2 A4:3 C5:1 D5:2 E5:2',
    'A5:3 G5:1 F5:2 E5:2 F5:4 C5:4',
    'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4',
    'D5:2 E5:2 G5:2 B5:2 A5:8'
  ], ['A2', 'F2', 'C3', 'G2'], [['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['C4', 'E4', 'G4'], ['G3', 'B3', 'D4']]);

  /** A theme for a game, composed from its name: key, mode, tempo, chords, bass, arpeggio and an 8-bar melody. */
  function compose(name) {
    let h = 2166136261; for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    let a = h >>> 0; const r = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pick = list => list[Math.floor(r() * list.length)];
    const minor = r() < 0.65, sc = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const deg = d => sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const root = 43 + Math.floor(r() * 8); // G2..D3
    const prog = pick(minor ? [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 4], [0, 5, 3, 4], [0, 3, 6, 4]] : [[0, 4, 5, 3], [0, 3, 4, 4], [0, 5, 3, 4], [0, 4, 3, 4]]);
    const bpm = 112 + Math.floor(r() * 40), len = 128;
    const s = { bpm, len, lead: Array(len).fill(null), bass: Array(len).fill(null), arp: Array(len).fill(null), drums: Array(len).fill(null) };
    const RHYTHMS = [[1,0,0,1,0,0,1,0,1,0,1,0,1,0,0,0], [1,0,1,0,1,0,0,1,0,0,1,0,1,0,1,0], [1,0,0,0,1,0,1,0,1,0,0,0,1,1,1,0], [1,1,0,1,0,0,1,0,1,0,0,1,0,0,1,0], [1,0,0,1,0,0,1,0,0,0,1,0,1,0,1,0]];
    const BASS = pick([[0,null,0,null,12,null,0,null,0,null,0,null,12,null,7,null], [0,null,null,0,null,null,0,null,0,null,null,0,null,null,12,null], [0,0,12,0,0,12,0,12,0,0,12,0,0,12,0,12]]);
    const ARP = pick([[0, 1, 2, 1], [0, 1, 2, 3], [3, 2, 1, 0], [0, 2, 1, 3]]), arpEvery = pick([1, 2]);
    // four bars of melody: wander the scale, land on chord tones on the beat, resolve home at the end
    // the melody wanders scale degrees 0–9 above a C4–B4 home note, so it never gets shrill
    const home = 60 + (((root - 60) % 12) + 12) % 12;
    let pos = 4; const motif = [];
    for (let b = 0; b < 4; b++) {
      const ch = prog[b], starts = pick(RHYTHMS).map((v, i) => v ? i : -1).filter(i => i >= 0), notes = [];
      starts.forEach((st, k) => {
        if (st % 4 === 0) { const tones = [ch - 7, ch - 5, ch - 3, ch, ch + 2, ch + 4, ch + 7, ch + 9, ch + 11].filter(d => d >= 0 && d <= 9); pos = tones.reduce((x, y) => Math.abs(y - pos) < Math.abs(x - pos) ? y : x); }
        else pos = Math.max(0, Math.min(9, pos + pick([-2, -1, -1, 1, 1, 2])));
        notes.push([st, pos, (k + 1 < starts.length ? starts[k + 1] : 16) - st]);
      });
      motif.push(notes);
    }
    for (let b = 0; b < 8; b++) {
      const src = motif[b % 4], ch = prog[b % 4];
      src.forEach(([st, d, l], k) => {
        let dd = d;
        if (b === 5 && st % 4) dd = Math.min(9, dd + 2); // second time round: a little variation
        if (b === 7 && k === src.length - 1) dd = 7; // and a cadence home
        s.lead[b * 16 + st] = { m: home + deg(dd), len: l };
      });
      const low = deg(ch) > 7 ? deg(ch) - 12 : deg(ch); // keep the bass within an octave of the key
      BASS.forEach((o, i) => { if (o != null) s.bass[b * 16 + i] = { m: root + low + o, len: 1.6 }; });
      for (let i = 0; i < 16; i += arpEvery) s.arp[b * 16 + i] = { m: root + 12 + low + deg([0, 2, 4, 7][ARP[(i / arpEvery) % 4]] + ch) - deg(ch) };
      for (let i = 0; i < 16; i++) s.drums[b * 16 + i] = i % 8 === 0 ? 'k' : i % 8 === 4 ? 's' : i % 2 === 0 ? 'h' : null;
    }
    return s;
  }
  const themes = {};

  window.Chip = {
    /** Play a song (Chip.lobby or Chip.theme(name)); it waits for a tap or key if the browser hasn't allowed sound yet. */
    play(s) { if (song === s && timer) return; halt(0.08); song = s; if (!on()) return; ensure(); start(); },
    /** Fade out and forget the song. */
    stop(fade = 0.4) { song = null; halt(fade); },
    /** Re-check the SOUND and MUSIC settings: start or stop to match. */
    refresh() { if (on() && song) { ensure(); start(); } else halt(0.25); },
    get enabled() { return store.get('arcade:music') !== '0'; },
    set enabled(v) { store.set('arcade:music', v ? '1' : '0'); this.refresh(); },
    get playing() { return !!timer; },
    get level() { return level; },
    /** Music volume, 0–1 (0.5 is full; games play it quieter so sound effects stay clear). */
    volume(v) { level = Math.max(0.0001, v); if (ac && out && timer) { const t = ac.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(gainOf(), t + 0.6); } },
    lobby: LOBBY,
    theme: name => themes[name] || (themes[name] = compose(name))
  };
})();
