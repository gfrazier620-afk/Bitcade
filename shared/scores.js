/*
 * The lobby's HIGH SCORES view (window.ScoresView): every cabinet in one list with your best and the world #1, and a tap
 * opens that game's top 10 (WORLD, TODAY for daily games, THIS WEEK for the tournament game, and THIS DEVICE).
 *   ScoresView.init({ el, games, paint, world: () => Promise<world.js module>, worldTop: slug => entry | undefined })
 *   ScoresView.render()      draw the list (call when the view opens)
 *   ScoresView.world(slug)   a world #1 has arrived for that game (or failed): update its row
 * World scores come from other players, so initials are checked before they're shown. Works offline: the world
 * columns just say so.
 */
(() => {
  let o = null, el = null, list = null, q = '', open = null, offline = false;
  const cache = {}; // `${slug}|${board}` → Promise<[{ n, s }]>
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const okName = n => /^[A-Z]{3}$/.test(n || '');
  const num = s => (+s || 0).toLocaleString();
  const mine = slug => { try { const t = JSON.parse(get('arcade:top:' + slug)); return Array.isArray(t) ? t : []; } catch (e) { return []; } };
  const best = slug => +get('arcade:best:' + slug) || 0;
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const isFeat = g => window.WEEKLY && WEEKLY.game() === g.slug;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function init(opts) {
    o = opts; el = opts.el;
    el.innerHTML = `<header class="sv-head"><h2 class="vh">HIGH SCORES</h2><p class="sv-sum" id="svSum"></p>
      <label class="sv-q"><span aria-hidden="true">⌕</span><input type="search" id="svQ" placeholder="FIND A GAME" aria-label="Find a game" autocomplete="off" spellcheck="false"></label></header>
      <div class="sv-cols" aria-hidden="true"><span>GAME</span><span>YOUR BEST</span><span>WORLD #1</span></div>
      <div class="sv-list" id="svList"></div>`;
    list = el.querySelector('#svList');
    el.querySelector('#svQ').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); filter(); });
    list.addEventListener('click', e => {
      const tab = e.target.closest('[data-board]'); if (tab) { showBoard(tab.closest('.sv-row'), tab.dataset.board); return; }
      const row = e.target.closest('.sv-top'); if (row) toggle(row.parentElement);
    });
  }

  /** World #1 cell for a game: initials and score, a crown when it's yours, or why there's nothing to show. */
  function worldCell(g) {
    const e = o.worldTop(g.slug), me = get('arcade:initials');
    if (e && okName(e.n)) return `<b class="${e.n === me ? 'me' : ''}">${e.n === me ? '♛ ' : ''}${e.n} ${num(e.s)}${g.label ? ' ' + g.label : ''}</b>`;
    return `<i>${offline ? 'OFFLINE' : e === null ? 'NO SCORES YET' : '…'}</i>`;
  }

  function render() {
    if (!el) return;
    const games = [...o.games].sort((a, b) => a.name.localeCompare(b.name));
    list.textContent = '';
    for (const g of games) {
      const row = document.createElement('div'); row.className = 'sv-row'; row.dataset.slug = g.slug; row.style.setProperty('--c', g.c);
      const b = best(g.slug);
      row.innerHTML = `<button type="button" class="sv-top" aria-expanded="false"><canvas width="12" height="8" aria-hidden="true"></canvas>
        <span class="sv-name">${esc(g.name)}${g.daily ? '<em>DAILY</em>' : ''}${isFeat(g) ? '<em class="wk">★ THIS WEEK</em>' : ''}</span>
        <span class="sv-mine">${b ? num(b) + (g.label ? ' ' + g.label : '') : '<i>—</i>'}</span><span class="sv-world">${worldCell(g)}</span><span class="sv-arrow" aria-hidden="true">›</span></button>`;
      o.paint(row.querySelector('canvas').getContext('2d'), g.px);
      list.append(row);
      if (open === g.slug) toggle(row, true);
    }
    summary(); filter();
  }
  function filter() { list.querySelectorAll('.sv-row').forEach(r => { const g = o.games.find(x => x.slug === r.dataset.slug); r.hidden = !!q && !g.name.toLowerCase().includes(q) && !(g.kind || '').toLowerCase().includes(q); }); }
  function summary() {
    const me = get('arcade:initials'), played = o.games.filter(g => best(g.slug)).length;
    const held = o.games.filter(g => { const e = o.worldTop(g.slug); return e && okName(me) && e.n === me; }).length;
    el.querySelector('#svSum').innerHTML = `YOU'VE SET SCORES IN <b>${played}</b> OF ${o.games.length} GAMES` + (held ? ` · <b class="me">♛ WORLD #1 IN ${held}</b>` : '') + '. TAP A GAME FOR ITS TOP 10.';
  }
  function world(slug, fail) {
    if (fail) offline = true;
    if (!el || el.hidden) return;
    const row = list.querySelector(`.sv-row[data-slug="${slug}"]`), g = o.games.find(x => x.slug === slug);
    if (row && g) row.querySelector('.sv-world').innerHTML = worldCell(g);
    summary();
  }

  function toggle(row, force) {
    const on = force !== undefined ? force : !row.classList.contains('open');
    list.querySelectorAll('.sv-row.open').forEach(r => { if (r !== row) { r.classList.remove('open'); r.querySelector('.sv-top').setAttribute('aria-expanded', 'false'); const d = r.querySelector('.sv-detail'); if (d) d.remove(); } });
    row.classList.toggle('open', on); row.querySelector('.sv-top').setAttribute('aria-expanded', String(on));
    const old = row.querySelector('.sv-detail'); if (old) old.remove();
    open = on ? row.dataset.slug : null;
    if (!on) return;
    const g = o.games.find(x => x.slug === row.dataset.slug);
    const boards = [['world', 'WORLD'], ...(g.daily ? [['today', 'TODAY']] : []), ...(isFeat(g) ? [['week', 'THIS WEEK']] : []), ['local', 'THIS DEVICE']];
    const d = document.createElement('div'); d.className = 'sv-detail';
    d.innerHTML = `<div class="sv-tabs">${boards.map(([k, l]) => `<button type="button" data-board="${k}">${l}</button>`).join('')}</div><div class="sv-table"></div>
      <a class="sv-play" href="games/${g.slug}/">PLAY ${esc(g.name.toUpperCase())} ▶</a>`;
    row.append(d);
    showBoard(row, 'world');
  }

  function showBoard(row, k) {
    const g = o.games.find(x => x.slug === row.dataset.slug), box = row.querySelector('.sv-table'); if (!box) return;
    row.querySelectorAll('[data-board]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.board === k)));
    const unit = g.label ? ' ' + g.label : '';
    const table = (rows, hi) => rows.length ? `<ol class="sv-ol">${rows.map((e, i) => `<li class="${i < 3 ? 'r' + (i + 1) : ''}${i === hi ? ' me' : ''}"><span>${['1ST', '2ND', '3RD'][i] || (i + 1) + 'TH'}</span><span>${okName(e.n) ? e.n : '???'}</span><b>${num(e.s)}${unit}</b></li>`).join('')}</ol>` : '';
    if (k === 'local') { const t = mine(g.slug); box.innerHTML = table(t, -1) || '<p class="sv-note">No scores on this device yet. Play to get on the board!</p>'; return; }
    const key = g.slug + '|' + k;
    box.innerHTML = '<p class="sv-note">Loading…</p>';
    if (!cache[key]) cache[key] = o.world().then(w => g.label ? w.topWins(10) : w.top(g.slug, 10, k === 'today' ? today() : null, k === 'week' ? WEEKLY.key() : null));
    cache[key].then(rows => {
      if (!row.contains(box) || row.querySelector(`[data-board="${k}"]`).getAttribute('aria-pressed') !== 'true') return;
      const me = get('arcade:initials');
      box.innerHTML = table(rows, rows.findIndex(e => okName(me) && e.n === me)) || `<p class="sv-note">No ${k === 'today' ? "scores today" : k === 'week' ? 'tournament scores this week' : 'world scores'} yet. Be the first!</p>`;
    }, () => { delete cache[key]; if (row.contains(box)) box.innerHTML = '<p class="sv-note">World scores are offline right now. THIS DEVICE still works.</p>'; });
  }

  window.ScoresView = { init, render, world };
})();
