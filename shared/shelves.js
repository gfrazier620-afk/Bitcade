/*
 * The lobby's cabinets page (lobby only): shelves, search, genre chips, sorting, favorites and the big/small grid.
 *
 * The page opens on shelves: sideways rows for Continue playing (bitcade:recent, kept by shared/arcade.js on every
 * run), Favorites (bitcade:favs), New arrivals (each cabinet's `added` date), Not tried yet, and one row per genre
 * (each cabinet's `genre`, space-separated ids from GENRES). SEE ALL on a shelf, a chip, a search or a sort opens the
 * full grid (#floor, the lobby's .cab cards) filtered and sorted. The search, chip and sort last for the visit
 * (sessionStorage bitcade:cabs); the grid size is remembered (bitcade:cabsize: 'big' or 'small', small by default on
 * phones). A ★ on any cabinet or tile pins it to Favorites.
 */
(() => {
  const GENRES = [
    ['shooter', 'Shooters'], ['racing', 'Racing'], ['puzzle', 'Puzzle'], ['action', 'Action'], ['platform', 'Platformers'],
    ['adventure', 'Adventure'], ['sports', 'Sports'], ['strategy', 'Strategy'], ['fighting', 'Fighters'], ['rhythm', 'Rhythm'],
    ['2p', '2-Player']
  ];
  const SORTS = [['featured', 'FEATURED'], ['az', 'A–Z'], ['new', 'NEWEST'], ['played', 'MOST PLAYED'], ['unplayed', 'NOT TRIED FIRST']];
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const json = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const label = id => (GENRES.find(g => g[0] === id) || [id, id])[1];

  let games = [], paint = null, st = { chip: 'home', q: '', sort: 'featured' };
  let root, grid, shelvesEl, head, chipsEl, qIn, sortIn;

  const favs = () => json(get('bitcade:favs'), []);
  const isFav = slug => favs().includes(slug);
  const plays = g => +get('arcade:plays:' + g.slug) || 0;
  const time = g => +get('arcade:time:' + g.slug) || 0;
  const tried = g => plays(g) > 0 || time(g) > 0 || (+get('arcade:best:' + g.slug) || 0) > 0;
  const genres = g => String(g.genre || '').split(/\s+/).filter(Boolean);
  const newest = () => games.reduce((m, g) => g.added > m ? g.added : m, '');
  // "NEW" for the latest batch of cabinets (added in the week before the newest one), for three weeks
  const isNew = g => g.added && (Date.parse(newest()) - Date.parse(g.added)) / 864e5 < 7 && (Date.now() - Date.parse(g.added)) / 864e5 < 21;
  function recent() {
    const r = json(get('bitcade:recent'), []).map(s => games.find(g => g.slug === s)).filter(Boolean);
    const rest = games.filter(g => !r.includes(g) && tried(g)).sort((a, b) => time(b) - time(a) || plays(b) - plays(a));
    return r.concat(rest).slice(0, 12);
  }
  function sorted(list, how) {
    const i = g => games.indexOf(g);
    const by = {
      featured: (a, b) => i(a) - i(b),
      az: (a, b) => a.name.localeCompare(b.name),
      new: (a, b) => (b.added || '').localeCompare(a.added || '') || i(b) - i(a),
      played: (a, b) => plays(b) - plays(a) || time(b) - time(a) || i(a) - i(b),
      unplayed: (a, b) => tried(a) - tried(b) || i(a) - i(b)
    }[how] || ((a, b) => i(a) - i(b));
    return list.slice().sort(by);
  }
  const matches = (g, q) => !q || [g.name, g.kind, g.blurb, ...genres(g).map(label)].join(' ').toLowerCase().includes(q.toLowerCase());
  function inChip(g, chip) {
    if (chip === 'home' || chip === 'all') return true;
    if (chip === 'fav') return isFav(g.slug);
    if (chip === 'daily') return !!g.daily;
    return genres(g).includes(chip);
  }

  function favBtn(g) {
    const b = el('button', 'fav'); b.type = 'button'; b.dataset.fav = g.slug;
    paintFav(b, isFav(g.slug), g.name); return b;
  }
  function paintFav(b, on, name) { b.textContent = on ? '★' : '☆'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', (on ? 'Unpin ' : 'Pin ') + name + (on ? ' from' : ' to') + ' favorites'); b.title = on ? 'Favorite' : 'Add to favorites'; }

  /** A small cabinet for a shelf: the footage, the name, its kind and your best. */
  function tile(g, i) {
    const a = el('a', 'tile'); a.href = `games/${g.slug}/`; a.style.setProperty('--c', g.c);
    if (g.el && g.el.classList.contains('gold')) a.classList.add('gold');
    if (g.el && g.el.classList.contains('feat')) a.classList.add('feat');
    const scr = el('div', 't-scr'); scr.style.setProperty('--d', `${-(i * 0.61 % 3.4).toFixed(2)}s`);
    const cv = el('canvas'); cv.width = 12; cv.height = 8; if (paint) paint(cv.getContext('2d'), g.px); scr.append(cv);
    [1, 2].forEach(n => { const img = el('img', n === 2 ? 'shot two' : 'shot'); img.alt = ''; img.loading = 'lazy'; img.src = `icons/screens/${g.slug}-${n}.webp`; img.addEventListener('error', () => img.remove()); scr.append(img); });
    if (isNew(g)) scr.append(el('b', 'new', 'NEW'));
    scr.append(favBtn(g));
    const best = +get('arcade:best:' + g.slug) || 0;
    a.append(scr, el('b', 't-name', g.name), el('span', 't-kind', `${g.kind.toUpperCase()}${best ? ' · ' + (g.label || 'BEST') + ' ' + best.toLocaleString() : ''}`));
    return a;
  }
  function shelf(id, title, list, seeAll) {
    const s = el('section', 'shelf'); s.dataset.shelf = id;
    const h = el('header');
    const t = el('h3'); t.append(el('span', null, title), el('small', null, String(list.length)));
    h.append(t);
    if (seeAll) { const b = el('button', 'see', 'SEE ALL ›'); b.type = 'button'; b.addEventListener('click', () => { Object.assign(st, { q: '' }, seeAll); qIn.value = ''; render(true); }); h.append(b); }
    const wrap = el('div', 'rowwrap'), row = el('div', 'row');
    list.forEach((g, i) => row.append(tile(g, i)));
    const prev = el('button', 'nudge prev', '‹'), next = el('button', 'nudge next', '›');
    prev.type = next.type = 'button'; prev.tabIndex = next.tabIndex = -1; prev.setAttribute('aria-hidden', 'true'); next.setAttribute('aria-hidden', 'true');
    const step = d => row.scrollBy({ left: d * row.clientWidth * 0.85, behavior: 'smooth' });
    prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
    const ends = () => { prev.hidden = row.scrollLeft < 8; next.hidden = row.scrollLeft + row.clientWidth > row.scrollWidth - 8; };
    row.addEventListener('scroll', ends, { passive: true }); requestAnimationFrame(ends);
    wrap.append(prev, row, next); s.append(h, wrap);
    return s;
  }
  function renderShelves() {
    const keep = {}; shelvesEl.querySelectorAll('.shelf').forEach(s => { keep[s.dataset.shelf] = s.querySelector('.row').scrollLeft; });
    shelvesEl.textContent = '';
    const add = (...a) => { if (a[2].length) shelvesEl.append(shelf(...a)); };
    add('recent', '▶ Continue playing', recent(), { chip: 'all', sort: 'played' });
    const f = favs().map(s => games.find(g => g.slug === s)).filter(Boolean);
    add('fav', '★ Favorites', f, { chip: 'fav', sort: 'featured' });
    add('new', '✦ New arrivals', sorted(games, 'new').slice(0, 10), { chip: 'all', sort: 'new' });
    const fresh = games.filter(g => !tried(g));
    if (fresh.length < games.length) add('untried', '? Not tried yet', fresh, { chip: 'all', sort: 'unplayed' });
    add('daily', '◆ Daily challenges', games.filter(g => g.daily), { chip: 'daily', sort: 'featured' });
    GENRES.forEach(([id, name]) => { const l = games.filter(g => genres(g).includes(id)); if (l.length > 1) add(id, name, l, { chip: id, sort: 'featured' }); }); // a genre of one is a chip, not a shelf
    shelvesEl.querySelectorAll('.shelf').forEach(s => { if (keep[s.dataset.shelf]) s.querySelector('.row').scrollLeft = keep[s.dataset.shelf]; });
  }
  function renderChips() {
    chipsEl.textContent = '';
    const chip = (id, text, n) => {
      const b = el('button', 'gchip'); b.type = 'button'; b.dataset.chip = id; b.setAttribute('aria-pressed', String(st.chip === id));
      b.append(el('span', null, text)); if (n != null) b.append(el('small', null, String(n)));
      b.addEventListener('click', () => { st.chip = id; if (id === 'home') { st.q = ''; qIn.value = ''; st.sort = 'featured'; } render(id !== 'home'); });
      chipsEl.append(b);
    };
    chip('home', '▤ SHELVES'); chip('all', 'ALL', games.length); chip('fav', '★ FAVORITES', favs().filter(s => games.some(g => g.slug === s)).length);
    chip('daily', 'DAILY', games.filter(g => g.daily).length);
    GENRES.forEach(([id, name]) => { const n = games.filter(g => genres(g).includes(id)).length; if (n) chip(id, name.toUpperCase(), n); });
  }
  function render(jump) {
    const home = st.chip === 'home' && !st.q && st.sort === 'featured';
    if (st.chip === 'home' && !home) st.chip = 'all';
    sortIn.value = st.sort;
    renderChips();
    shelvesEl.hidden = !home; grid.hidden = home; head.hidden = home;
    if (home) renderShelves();
    else {
      const list = sorted(games.filter(g => inChip(g, st.chip) && matches(g, st.q)), st.sort);
      games.forEach(g => { g.el.hidden = !list.includes(g); });
      list.forEach(g => grid.append(g.el));
      const name = st.chip === 'all' ? 'All cabinets' : st.chip === 'fav' ? '★ Favorites' : st.chip === 'daily' ? 'Daily challenges' : label(st.chip);
      head.textContent = '';
      const h = el('h3'); h.append(el('span', null, name), el('small', null, st.q ? `${list.length} MATCH “${st.q}”` : `${list.length} CABINET${list.length === 1 ? '' : 'S'}`));
      const back = el('button', 'see', '‹ SHELVES'); back.type = 'button'; back.addEventListener('click', () => { Object.assign(st, { chip: 'home', q: '', sort: 'featured' }); qIn.value = ''; render(true); });
      head.append(h, back);
      if (!list.length) head.append(el('p', 'empty', st.chip === 'fav' && !st.q ? 'Nothing pinned yet. Tap ☆ on any cabinet to add it here.' : 'No cabinets match that. Try another word, or ALL.'));
    }
    try { sessionStorage.setItem('bitcade:cabs', JSON.stringify(st)); } catch (e) {}
    if (jump) { const r = root.getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * 0.6) root.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  }
  function setSize(s) {
    grid.classList.toggle('small', s === 'small');
    root.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === s)));
  }

  /** Builds the page around #floor. games: the lobby's GAMES (each with its .cab card as g.el); paint(ctx, px) draws a pixel icon. */
  function init(opts) {
    games = opts.games; paint = opts.paint;
    grid = document.getElementById('floor'); root = document.getElementById('cabs');
    shelvesEl = document.getElementById('shelves'); head = document.getElementById('gridHead'); chipsEl = document.getElementById('cabChips');
    qIn = document.getElementById('cabQ'); sortIn = document.getElementById('cabSort');
    qIn.placeholder = `SEARCH ${games.length} CABINETS`;
    SORTS.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sortIn.append(o); });
    games.forEach(g => { if (g.el) g.el.querySelector('.cab-screen').append(favBtn(g)); });
    const saved = json((() => { try { return sessionStorage.getItem('bitcade:cabs'); } catch (e) { return null; } })(), null);
    if (saved && typeof saved === 'object') { st = Object.assign(st, saved); qIn.value = st.q || ''; }
    if (st.chip !== 'home' && st.chip !== 'all' && st.chip !== 'fav' && st.chip !== 'daily' && !GENRES.some(g => g[0] === st.chip)) st.chip = 'home';
    qIn.addEventListener('input', () => { st.q = qIn.value.trim(); render(false); });
    qIn.addEventListener('keydown', e => { if (e.key === 'Escape') { qIn.value = ''; st.q = ''; render(false); qIn.blur(); } });
    sortIn.addEventListener('change', () => { st.sort = sortIn.value; render(true); });
    root.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => { set('bitcade:cabsize', b.dataset.size); setSize(b.dataset.size); }));
    setSize(get('bitcade:cabsize') || (matchMedia('(max-width: 640px)').matches ? 'small' : 'big'));
    // ★: pin or unpin, without opening the cabinet
    root.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-fav]'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const slug = b.dataset.fav, f = favs(), on = !f.includes(slug);
      set('bitcade:favs', JSON.stringify(on ? [slug, ...f] : f.filter(s => s !== slug)));
      const g = games.find(x => x.slug === slug);
      root.querySelectorAll(`[data-fav="${slug}"]`).forEach(x => paintFav(x, on, g.name));
      if (on) { b.animate([{ transform: 'scale(1.7) rotate(-20deg)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,1.6,.4,1)' }); }
      render(false);
    }, true);
    // "/" jumps to the search box
    addEventListener('keydown', e => {
      if (e.key !== '/' || (root.hidden && !window.Lobby) || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
      e.preventDefault(); if (window.Lobby) Lobby.openSearch(); else qIn.focus();
    });
    render(false);
  }
  window.Shelves = { init, GENRES, render: () => render(false) };
})();
