/*
 * The prize counter: spend tickets (window.TICKETS, from shared/badges.js) on cosmetics. Lobby only.
 *
 * - tint: a one-colour phosphor look for every game screen (body.tint-<id>, applied by shared/arcade.js)
 * - skin: a cabinet finish for every game page (body.skin-<id>)
 * - outfit and carpet: your arcade-goer and the carpet on the arcade floor (shared/floor.js)
 * - decor: things for the arcade floor; everything bought is on show
 *
 * arcade:prizes holds the ids bought, arcade:equip the one worn per slot: { tint, skin, outfit, carpet }.
 */
window.Prizes = (() => {
  const LIST = [
    { id: 'amber', slot: 'tint', name: 'Amber Phosphor', price: 60, desc: 'Every game screen in warm one-colour amber.', sw: ['#ffb02e', '#3a1e00'] },
    { id: 'green', slot: 'tint', name: 'Green Phosphor', price: 60, desc: 'The classic green terminal glow.', sw: ['#5aff6a', '#002a08'] },
    { id: 'ice', slot: 'tint', name: 'Ice Monitor', price: 60, desc: 'Cool blue, like an old radar screen.', sw: ['#7ad8ff', '#001a2e'] },
    { id: 'sunset', slot: 'tint', name: 'Sunset Glow', price: 80, desc: 'Full colour, warmed up like a faded tube.', sw: ['#ff9a5a', '#4a1830'] },
    { id: 'wood', slot: 'skin', name: 'Walnut Cabinet', price: 90, desc: 'Woodgrain sides on every cabinet.', sw: ['#6b4020', '#3a2010'] },
    { id: 'neon', slot: 'skin', name: 'Neon Trim', price: 100, desc: 'Pink and cyan tubes around every cabinet.', sw: ['#ff4fd1', '#22e0ff'] },
    { id: 'chrome', slot: 'skin', name: 'Chrome Cabinet', price: 140, desc: 'Polished chrome, straight out of a diner.', sw: ['#e8ecf4', '#6a6e7c'] },
    { id: 'gold', slot: 'skin', name: 'Gold Cabinet', price: 250, desc: 'For champions. Solid gold (not really).', sw: ['#ffd23d', '#a07010'] },
    { id: 'cap', slot: 'outfit', name: 'Cap and Hoodie', price: 30, desc: 'Your arcade-goer, ready for a long session.' },
    { id: 'shades', slot: 'outfit', name: 'Cool Shades', price: 50, desc: 'Leather jacket, dark glasses, no fear.' },
    { id: 'astro', slot: 'outfit', name: 'Astronaut Suit', price: 120, desc: 'Fresh back from a lunar landing.' },
    { id: 'crown', slot: 'outfit', name: 'High-Score Crown', price: 200, desc: 'Royal robes for the top of the table.' },
    { id: 'cosmic', slot: 'carpet', name: 'Cosmic Carpet', price: 50, desc: 'Planets and rings, the true arcade carpet.' },
    { id: 'checker', slot: 'carpet', name: 'Checkerboard Floor', price: 70, desc: 'Black and white tiles, diner style.' },
    { id: 'plants', slot: 'decor', name: 'Potted Palms', price: 25, desc: 'A little green by the walls.' },
    { id: 'sign', slot: 'decor', name: 'GAME ON Sign', price: 60, desc: 'More neon for the back wall.' },
    { id: 'jukebox', slot: 'decor', name: 'Jukebox', price: 80, desc: 'Bubbling lights in the corner.' },
    { id: 'claw', slot: 'decor', name: 'Claw Machine', price: 110, desc: 'Full of prizes nobody ever wins.' },
    { id: 'disco', slot: 'decor', name: 'Disco Ball', price: 150, desc: 'Spinning light spots across the floor.' }
  ];
  const SLOTS = [['tint', 'SCREEN TINTS · every game'], ['skin', 'CABINET FINISHES · every game'], ['outfit', 'OUTFITS · arcade floor'], ['carpet', 'CARPETS · arcade floor'], ['decor', 'DECORATIONS · arcade floor']];
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
    if (!p || has(id) || !TICKETS.spend(p.price)) return false;
    set('arcade:prizes', JSON.stringify([...owned(), id]));
    if (p.slot !== 'decor') wear(id);
    changed(); return true;
  }
  /** Wear a prize in its slot, or take it off if it's already worn. */
  function wear(id) {
    const p = LIST.find(x => x.id === id); if (!p || p.slot === 'decor' || !has(id)) return;
    const eq = equipped(); eq[p.slot] = eq[p.slot] === id ? null : id;
    set('arcade:equip', JSON.stringify(eq)); changed();
  }

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
    const g = x.createLinearGradient(0, 0, c.width, c.height); g.addColorStop(0, p.sw[0]); g.addColorStop(1, p.sw[1]);
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
      if (!own) { btn.textContent = bal >= p.price ? `BUY · ${p.price}` : `NEED ${p.price}`; btn.disabled = bal < p.price; }
      else if (p.slot === 'decor') { btn.textContent = 'ON THE FLOOR'; btn.disabled = true; }
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
    SLOTS.forEach(([slot, label]) => {
      const h = document.createElement('h3'); h.textContent = label; body.append(h);
      const row = document.createElement('div'); row.className = 'pc-row'; body.append(row);
      LIST.filter(p => p.slot === slot).forEach(p => {
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
