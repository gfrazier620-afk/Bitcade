/*
 * The prize counter: spend tickets (window.TICKETS, from shared/badges.js) on cosmetics. Lobby only.
 *
 * - tint: a one-colour phosphor look for every game screen (body.tint-<id>, applied by shared/arcade.js)
 * - skin: a cabinet finish for every game page (body.skin-<id>)
 * - outfit and carpet: your arcade-goer and the carpet on the arcade floor (shared/floor.js)
 * - pet and trail: a pet that follows you on the floor, and a trail behind your feet (one of each worn)
 * - emote: moves for the floor's emote picker (E); owning one is enough
 * - decor: things for the arcade floor; everything bought is on show
 *
 * arcade:prizes holds the ids bought, arcade:equip the one worn per slot: { tint, skin, outfit, carpet }.
 * Prizes with pass: '<season>' come only from the Arcade Pass (window.PASS in shared/badges.js), free: true on its free track.
 */
window.Prizes = (() => {
  const LIST = [
    { id: 'amber', slot: 'tint', name: 'Amber Phosphor', price: 60, desc: 'Every game screen in warm one-colour amber.', sw: ['#ffb02e', '#3a1e00'] },
    { id: 'green', slot: 'tint', name: 'Green Phosphor', price: 60, desc: 'The classic green terminal glow.', sw: ['#5aff6a', '#002a08'] },
    { id: 'ice', slot: 'tint', name: 'Ice Monitor', price: 60, desc: 'Cool blue, like an old radar screen.', sw: ['#7ad8ff', '#001a2e'] },
    { id: 'sunset', slot: 'tint', name: 'Sunset Glow', price: 80, desc: 'Full colour, warmed up like a faded tube.', sw: ['#ff9a5a', '#4a1830'] },
    { id: 'noir', slot: 'tint', name: 'Noir', price: 60, desc: 'Black and white, hard contrast. Very detective.', sw: ['#f0f0f0', '#101010'] },
    { id: 'film', slot: 'tint', name: 'Old Film', price: 70, desc: 'Brown and faded, like a 1920s reel.', sw: ['#e8c890', '#3a2410'] },
    { id: 'pocket', slot: 'tint', name: 'Pocket LCD', price: 90, desc: 'Olive-green dots, like a 1989 handheld.', sw: ['#c4cf8a', '#2a3a18'] },
    { id: 'vapor', slot: 'tint', name: 'Vaporwave', price: 110, desc: 'Every colour pushed pink and teal.', sw: ['#ff7bf0', '#3ae0e0'] },
    { id: 'wood', slot: 'skin', name: 'Walnut Cabinet', price: 90, desc: 'Woodgrain sides on every cabinet.', sw: ['#6b4020', '#3a2010'] },
    { id: 'neon', slot: 'skin', name: 'Neon Trim', price: 100, desc: 'Pink and cyan tubes around every cabinet.', sw: ['#ff4fd1', '#22e0ff'] },
    { id: 'chrome', slot: 'skin', name: 'Chrome Cabinet', price: 140, desc: 'Polished chrome, straight out of a diner.', sw: ['#e8ecf4', '#6a6e7c'] },
    { id: 'gold', slot: 'skin', name: 'Gold Cabinet', price: 250, desc: 'For champions. Solid gold (not really).', sw: ['#ffd23d', '#a07010'] },
    { id: 'retro', slot: 'skin', name: 'Beige 80s Plastic', price: 110, desc: 'Cream plastic, like the first home computers.', sw: ['#e8dcc0', '#a89878'] },
    { id: 'carbon', slot: 'skin', name: 'Carbon Fibre', price: 160, desc: 'A woven black weave, race-car light.', sw: ['#3a3a48', '#121218'] },
    { id: 'holo', slot: 'skin', name: 'Holographic', price: 320, desc: 'A rainbow sheen that never stops moving.', sw: ['#ff9ad8', '#9ad8ff'] },
    { id: 'platinum', slot: 'skin', vip: true, name: 'Platinum Cabinet', price: 380, desc: 'Brushed platinum with an icy edge. VIP only.', sw: ['#f4f8ff', '#8a9ab8'] },
    { id: 'tux', slot: 'outfit', vip: true, name: 'Tuxedo', price: 250, desc: 'Black tie for the VIP room.' },
    { id: 'goldsuit', slot: 'outfit', vip: true, name: 'Golden Suit', price: 400, desc: 'A gold suit and a top hat. Subtle.' },
    { id: 'velvet', slot: 'carpet', vip: true, name: 'Royal Velvet', price: 220, desc: 'Deep red velvet with gold diamonds.' },
    { id: 'varsity', slot: 'outfit', level: 6, name: 'Varsity Jacket', price: 0, desc: 'A letterman jacket with a big B. Reach level 6.' },
    { id: 'starfield', slot: 'carpet', level: 10, name: 'Starfield', price: 0, desc: 'Deep space underfoot, twinkling. Reach level 10.' },
    { id: 'skater', slot: 'outfit', level: 14, name: 'Skater', price: 0, desc: 'Beanie, flannel and a board on your back. Reach level 14.' },
    { id: 'racetrack', slot: 'carpet', level: 18, name: 'Race Track', price: 0, desc: 'Asphalt, kerbs and a chequered line. Reach level 18.' },
    { id: 'captain', slot: 'outfit', level: 24, name: 'Space Captain', price: 0, desc: 'A starship captain\'s uniform and cape. Reach level 24.' },
    { id: 'synthwave', slot: 'carpet', level: 32, name: 'Synthwave Sunset', price: 0, desc: 'A neon sun setting over a pink grid. Reach level 32.' },
    { id: 'aurora', slot: 'carpet', level: 40, name: 'Aurora', price: 0, desc: 'Northern lights rippling across the floor. Reach level 40.' },
    { id: 'legend', slot: 'outfit', level: 50, name: 'Bitcade Legend', price: 0, desc: 'A glowing gold suit and a crown of light. Reach level 50.' },
    { id: 'synth', slot: 'skin', pass: 's1', name: 'Synthwave Cabinet', price: 0, desc: 'Purple to sunset orange, with a chrome trim.', sw: ['#ff7a3d', '#6a2ab8'] },
    { id: 'neonrider', slot: 'outfit', pass: 's1', name: 'Neon Rider', price: 0, desc: 'A pink race suit and a mirrored helmet.' },
    { id: 'cyber', slot: 'tint', pass: 's1', free: true, name: 'Cyber Teal', price: 0, desc: 'Every screen in teal and hot pink.', sw: ['#3ae0d0', '#ff4fa3'] },
    { id: 'infrared', slot: 'tint', pass: 's1', name: 'Infrared', price: 0, desc: 'A heat camera: hot reds and yellows.', sw: ['#ffd23d', '#c8203a'] },
    { id: 'dancefloor', slot: 'carpet', pass: 's1', name: 'Dance Floor', price: 0, desc: 'Lit squares in every colour.' },
    { id: 'tracksuit', slot: 'outfit', pass: 's1', free: true, name: 'Retro Tracksuit', price: 0, desc: 'Blue with white stripes, very 1986.' },
    { id: 'midnight', slot: 'skin', pass: 's1', name: 'Midnight Chrome', price: 0, desc: 'Deep blue chrome with stars in the paint.', sw: ['#3a5ab8', '#0a1030'] },
    { id: 'dj', slot: 'outfit', pass: 's1', name: 'Night DJ', price: 0, desc: 'Shades, a glowing jacket and a cap on backwards.' },
    { id: 'prism', slot: 'tint', pass: 's1', name: 'Prism', price: 0, desc: 'Colours that slowly turn round the rainbow.', sw: ['#ff4fd1', '#3dff8f'] },
    { id: 'phantom', slot: 'outfit', pass: 's1', name: 'Phantom', price: 0, desc: 'A violet cape, a mask and a ghostly glow.' },
    { id: 'arcadered', slot: 'skin', pass: 's1', free: true, name: 'Classic Red', price: 0, desc: 'Glossy red sides, like the cabinets of old.', sw: ['#ff4f4f', '#7a1018'] },
    { id: 'magma', slot: 'skin', pass: 's1', name: 'Magma Cabinet', price: 0, desc: 'Molten rock that glows and flows.', sw: ['#ffb03d', '#8a1a08'] },
    { id: 'starlight', slot: 'outfit', pass: 's1', name: 'Starlight', price: 0, desc: 'A silver suit, a starry cape and a halo.' },
    { id: 'circuit', slot: 'carpet', pass: 's1', free: true, name: 'Circuit Board', price: 0, desc: 'Green board and gold traces that glow.' },
    { id: 'diamond', slot: 'skin', pass: 's1', name: 'Diamond Cabinet', price: 0, desc: 'Ice-white facets that catch the light. The top of Season 1.', sw: ['#ffffff', '#7ad8ff'] },
    { id: 'robodog', slot: 'pet', name: 'Robo-Dog', price: 150, desc: 'A loyal little robot that wags and follows you everywhere.' },
    { id: 'pixelcat', slot: 'pet', name: 'Pixel Cat', price: 150, desc: 'An orange cat who decided you\'re alright.' },
    { id: 'slime', slot: 'pet', name: 'Pet Slime', price: 100, desc: 'A friendly slime that boings along behind you.' },
    { id: 'ufo', slot: 'pet', name: 'Mini UFO', price: 220, desc: 'A tiny saucer hovering at your shoulder, beam on.' },
    { id: 'phoenix', slot: 'pet', vip: true, name: 'Golden Phoenix', price: 450, desc: 'A blazing gold bird. VIP only.' },
    { id: 'sparkle', slot: 'trail', name: 'Sparkle Steps', price: 60, desc: 'Little stars wherever you walk.' },
    { id: 'neonprint', slot: 'trail', name: 'Neon Footprints', price: 80, desc: 'Glowing pink and blue prints that fade behind you.' },
    { id: 'bubbles', slot: 'trail', name: 'Bubble Trail', price: 70, desc: 'Bubbles float up as you go.' },
    { id: 'rainbow', slot: 'trail', name: 'Rainbow Dash', price: 120, desc: 'A streak of every colour.' },
    { id: 'flame', slot: 'trail', name: 'Hot Steps', price: 160, desc: 'You\'re on fire. Literally, at the feet.' },
    { id: 'dance', slot: 'emote', name: 'Dance', price: 40, desc: 'A move for the dance floor (or the Neon Steps pad).' },
    { id: 'spin', slot: 'emote', name: 'Spin', price: 50, desc: 'A leaping spin with a finish.' },
    { id: 'flex', slot: 'emote', name: 'Flex', price: 60, desc: 'Show the arcade those high-score muscles.' },
    { id: 'robot', slot: 'emote', name: 'The Robot', price: 80, desc: 'Stiff, precise, very cool.' },
    { id: 'disco', slot: 'emote', name: 'Disco', price: 100, desc: 'Point to the sky, with sparkles.' },
    { id: 'cap', slot: 'outfit', name: 'Cap and Hoodie', price: 30, desc: 'Your arcade-goer, ready for a long session.' },
    { id: 'shades', slot: 'outfit', name: 'Cool Shades', price: 50, desc: 'Leather jacket, dark glasses, no fear.' },
    { id: 'astro', slot: 'outfit', name: 'Astronaut Suit', price: 120, desc: 'Fresh back from a lunar landing.' },
    { id: 'crown', slot: 'outfit', name: 'High-Score Crown', price: 200, desc: 'Royal robes for the top of the table.' },
    { id: 'punk', slot: 'outfit', name: 'Punk', price: 80, desc: 'A pink mohawk and a leather jacket.' },
    { id: 'ninja', slot: 'outfit', name: 'Ninja', price: 100, desc: 'All black, a red headband, silent steps.' },
    { id: 'robot', slot: 'outfit', name: 'Robot', price: 140, desc: 'Chrome plating, a visor and an antenna.' },
    { id: 'wizard', slot: 'outfit', name: 'Wizard', price: 180, desc: 'A starry hat and a long purple robe.' },
    { id: 'cosmic', slot: 'carpet', name: 'Cosmic Carpet', price: 50, desc: 'Planets and rings, the true arcade carpet.' },
    { id: 'checker', slot: 'carpet', name: 'Checkerboard Floor', price: 70, desc: 'Black and white tiles, diner style.' },
    { id: 'lava', slot: 'carpet', name: 'Lava Swirl', price: 80, desc: 'Red and orange swirls. Do not touch.' },
    { id: 'grid', slot: 'carpet', name: 'Neon Grid', price: 100, desc: 'A glowing cyan grid, straight out of the future.' },
    { id: 'plants', slot: 'decor', name: 'Potted Palms', price: 25, desc: 'A little green by the walls.' },
    { id: 'sign', slot: 'decor', name: 'GAME ON Sign', price: 60, desc: 'More neon for the back wall.' },
    { id: 'jukebox', slot: 'decor', name: 'Jukebox', price: 80, desc: 'Bubbling lights and chrome for the lounge jukebox.' },
    { id: 'claw', slot: 'decor', name: 'Claw Machine', price: 110, desc: 'A gold claw for the Mega Claw: a better grip, and a fourth free go every day.' },
    { id: 'disco', slot: 'decor', name: 'Disco Ball', price: 150, desc: 'Spinning light spots across the floor.' },
    { id: 'gumball', slot: 'decor', name: 'Gumball Machine', price: 50, desc: 'A glass globe of gumballs. One ticket a go.' },
    { id: 'strips', slot: 'decor', name: 'Neon Floor Strips', price: 90, desc: 'Chasing lights down the aisles.' },
    { id: 'sofa', slot: 'decor', name: 'Lounge Sofa', price: 100, desc: 'Somewhere to sit between high scores.' },
    { id: 'redeem', slot: 'decor', name: 'Ticket Machine', price: 130, desc: 'A redemption machine that eats tickets.' },
    { id: 'trophies', slot: 'decor', name: 'Trophy Case', price: 220, desc: 'Gold cups for every cabinet you master.' }
  ];
  const SLOTS = [['tint', 'SCREEN TINTS · every game'], ['skin', 'CABINET FINISHES · every game'], ['outfit', 'OUTFITS · arcade floor'], ['pet', 'PETS · they follow you round the arcade floor'], ['trail', 'FOOTSTEP TRAILS · arcade floor'], ['emote', 'EMOTES · press E on the arcade floor (wave and cheer are free)'], ['carpet', 'CARPETS · arcade floor'], ['decor', 'DECORATIONS · arcade floor']];
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const json = (k, d) => { try { const v = JSON.parse(get(k)); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
  const owned = () => { const o = json('arcade:prizes', []); return Array.isArray(o) ? o : []; };
  const equipped = () => json('arcade:equip', {});
  const has = id => owned().includes(id);
  const fns = [];
  const changed = () => fns.forEach(f => f());
  function buy(id) {
    const p = LIST.find(x => x.id === id);
    if (!p || has(id) || p.level || p.pass || (p.vip && !(window.VIP && VIP.unlocked())) || !TICKETS.spend(p.price)) return false;
    set('arcade:prizes', JSON.stringify([...owned(), id]));
    if (p.slot !== 'decor' && p.slot !== 'emote') wear(id);
    changed(); return true;
  }
  /** Wear a prize in its slot, or take it off if it's already worn. */
  function wear(id) {
    const p = LIST.find(x => x.id === id); if (!p || p.slot === 'decor' || p.slot === 'emote' || !has(id)) return;
    const eq = equipped(); eq[p.slot] = eq[p.slot] === id ? null : id;
    set('arcade:equip', JSON.stringify(eq)); changed();
  }

  /** The pass tier a prize comes at. */
  const passTier = p => { const se = window.PASS && PASS.SEASONS.find(s => s.id === p.pass); if (!se) return '?'; const tr = p.free ? se.free : se.pass; return Object.keys(tr).find(k => tr[k].t === 'prize' && tr[k].id === p.id) || '?'; };

  /* ---------- the counter screen ---------- */
  let box = null, lastFocus = null;
  function sound(fs) {
    if (get('arcade:muted') === '1') return;
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(), t = ac.currentTime;
      fs.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.04, t + i * 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.1); o.connect(g).connect(ac.destination); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.12); });
    } catch (e) {}
  }
  function preview(p, c) {
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height);
    if (window.Floor && Floor.preview(p, x, c.width, c.height)) return;
    if (!p.sw) return; // outfits and carpets are drawn by the floor (shared/floor.js)
    const g = x.createLinearGradient(0, 0, c.width, c.height); g.addColorStop(0, p.sw[0]); g.addColorStop(1, p.sw[1]);
    if (p.id === 'holo' || p.id === 'prism' || p.id === 'diamond') { const hg = x.createLinearGradient(0, 0, c.width, c.height); ['#ff9ad8', '#9ad8ff', '#c8ffb0', '#ffe89a', '#ff9ad8'].forEach((cc, i) => hg.addColorStop(i / 4, cc)); x.fillStyle = hg; x.fillRect(c.width / 2 - 22, 4, 44, c.height - 8); x.fillStyle = '#05040c'; x.fillRect(c.width / 2 - 15, 14, 30, 22); return; }
    if (p.slot === 'tint') { // a little screen in that phosphor
      x.fillStyle = '#05040c'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = g; x.fillRect(8, 8, c.width - 16, c.height - 16);
      x.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 8; i < c.height - 8; i += 3) x.fillRect(8, i, c.width - 16, 1);
      x.fillStyle = p.sw[1]; x.fillRect(c.width / 2 - 10, c.height / 2 - 4, 20, 8);
    } else { // a cabinet frame in that finish
      x.fillStyle = g; x.fillRect(c.width / 2 - 22, 4, 44, c.height - 8); x.fillStyle = '#05040c'; x.fillRect(c.width / 2 - 15, 14, 30, 22);
      x.fillStyle = p.sw[0]; x.fillRect(c.width / 2 - 15, 40, 30, 4);
    }
  }
  function render() {
    if (!box) return;
    const eq = equipped(), bal = TICKETS.balance();
    box.querySelector('.pc-bal b').textContent = bal.toLocaleString();
    box.querySelectorAll('.pc-item').forEach(el => {
      const p = LIST.find(x => x.id === el.dataset.id), own = has(p.id), on = eq[p.slot] === p.id, btn = el.querySelector('button');
      el.classList.toggle('own', own); el.classList.toggle('on', on);
      const locked = p.vip && !(window.VIP && VIP.unlocked());
      if (!own && p.level) { btn.textContent = `LEVEL ${p.level}`; btn.disabled = true; }
      else if (!own && p.pass) { const t = passTier(p); btn.textContent = `${p.free ? 'FREE' : 'PASS'} · TIER ${t}`; btn.disabled = true; }
      else if (!own && locked) { btn.textContent = 'VIP ONLY'; btn.disabled = true; }
      else if (!own) { btn.textContent = bal >= p.price ? `BUY · ${p.price}` : `NEED ${p.price}`; btn.disabled = bal < p.price; }
      else if (p.slot === 'decor') { btn.textContent = 'ON THE FLOOR'; btn.disabled = true; }
      else if (p.slot === 'emote') { btn.textContent = 'YOURS · PRESS E'; btn.disabled = true; }
      else { btn.textContent = on ? 'WEARING ✓' : 'WEAR'; btn.disabled = false; }
    });
  }
  function build() {
    box = document.createElement('div'); box.className = 'pc'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Prize counter');
    box.innerHTML = `<div class="pc-panel"><div class="pc-head"><div><div class="pc-title">PRIZE COUNTER</div>
      <div class="pc-how">Win tickets in every game: a few per game, more for a top-10 score or a new record, 10 per badge, and double on the weekly tournament game.</div></div>
      <div class="pc-bal">TICKETS <b>0</b></div><button class="pc-x" aria-label="Close">✕</button></div><div class="pc-body"></div></div>`;
    const body = box.querySelector('.pc-body');
    [...SLOTS, ['vip', '★ VIP EXCLUSIVES · unlock the VIP room on the arcade floor'], ['level', '▲ LEVEL REWARDS · free when you reach the level'], ['pass', '✦ ARCADE PASS · Season 1 rewards']].forEach(([slot, label]) => {
      const h = document.createElement('h3'); h.textContent = label; body.append(h);
      const row = document.createElement('div'); row.className = 'pc-row'; body.append(row);
      LIST.filter(p => slot === 'vip' ? p.vip : slot === 'level' ? p.level : slot === 'pass' ? p.pass : p.slot === slot && !p.vip && !p.level && !p.pass).forEach(p => {
        const el = document.createElement('div'); el.className = 'pc-item'; el.dataset.id = p.id;
        el.innerHTML = '<canvas width="96" height="64"></canvas><b></b><small></small><button></button>';
        el.querySelector('b').textContent = p.name; el.querySelector('small').textContent = p.desc;
        preview(p, el.querySelector('canvas'));
        el.querySelector('button').addEventListener('click', () => {
          if (!has(p.id)) { if (buy(p.id)) sound([784, 988, 1319, 1568]); else sound([220]); }
          else { wear(p.id); sound([659]); }
          render();
        });
        row.append(el);
      });
    });
    box.addEventListener('click', e => { if (e.target === box || e.target.closest('.pc-x')) close(); });
    box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.body.append(box);
  }
  function open() {
    if (!box) build();
    lastFocus = document.activeElement; box.hidden = false; document.documentElement.classList.add('pc-open');
    render(); box.querySelector('.pc-x').focus();
  }
  function close() {
    if (!box || box.hidden) return;
    box.hidden = true; document.documentElement.classList.remove('pc-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  return { LIST, owned, equipped, has, buy, wear, open, close, isOpen: () => !!box && !box.hidden, onChange: fn => fns.push(fn) };
})();
