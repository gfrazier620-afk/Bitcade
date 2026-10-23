/*
 * The Arcade Pass in the lobby (lobby only): a strip under the level strip (season, tier, rewards waiting) and the
 * pass screen, a track of 50 tiers with the free reward over the pass reward on each. Rewards are claimed here, and
 * prizes go to the prize counter to wear. The rules (seasons, tiers, rewards) are window.PASS in shared/badges.js.
 */
window.PassView = (() => {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let strip = null, box = null, lastFocus = null, onChange = () => {}, opts = {};
  const days = ms => Math.max(0, Math.ceil(ms / 864e5));
  const prizeOf = r => r.t === 'prize' && window.Prizes ? Prizes.LIST.find(p => p.id === r.id) : null;
  const label = r => r.t === 'tix' ? `${r.n} TICKETS` : (prizeOf(r) || { name: r.id }).name;
  function sound(fs) {
    try { if (localStorage.getItem('arcade:muted') === '1') return; } catch (e) {}
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(), t = ac.currentTime;
      fs.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.04, t + i * 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.12); o.connect(g).connect(ac.destination); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.14); });
    } catch (e) {}
  }
  /** A small picture of a reward: tickets, or the prize itself. */
  function icon(r, c) {
    const x = c.getContext('2d'), w = c.width, h = c.height; x.clearRect(0, 0, w, h);
    if (r.t === 'tix') {
      x.save(); x.translate(w / 2, h / 2); x.rotate(-0.15);
      x.fillStyle = '#0a0612'; x.fillRect(-25, -14, 50, 28); x.fillStyle = '#ffd23d'; x.fillRect(-23, -12, 46, 24); x.fillStyle = '#c89a2a'; x.fillRect(-23, 6, 46, 6);
      x.fillStyle = '#0a0612'; x.beginPath(); x.arc(-23, 0, 4, 0, 6.29); x.arc(23, 0, 4, 0, 6.29); x.fill(); x.font = '10px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(r.n, 0, -2); x.restore(); return;
    }
    const p = prizeOf(r); if (!p) return;
    if (window.Floor && Floor.preview && Floor.preview(p, x, w, h)) return;
    if (!p.sw) { x.fillStyle = '#2a2148'; x.fillRect(w / 2 - 14, 8, 28, h - 16); return; } // an outfit or carpet before the floor has loaded
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, p.sw[0]); g.addColorStop(1, p.sw[1]);
    if (p.slot === 'tint') { x.fillStyle = '#05040c'; x.fillRect(4, 4, w - 8, h - 8); x.fillStyle = g; x.fillRect(9, 9, w - 18, h - 18); x.fillStyle = 'rgba(0,0,0,.3)'; for (let i = 9; i < h - 9; i += 3) x.fillRect(9, i, w - 18, 1); }
    else { x.fillStyle = g; x.fillRect(w / 2 - 20, 4, 40, h - 8); x.fillStyle = '#05040c'; x.fillRect(w / 2 - 13, 12, 26, 18); x.fillStyle = p.sw[0]; x.fillRect(w / 2 - 13, 34, 26, 3); }
  }
  /** The strip under the level strip. */
  function renderStrip() {
    if (!strip) return;
    const se = window.PASS && PASS.season();
    if (!se) { strip.hidden = true; return; }
    strip.hidden = false;
    const xp = PASS.xp(se), t = PASS.tier(se), into = t >= PASS.TIERS ? PASS.STEP : xp % PASS.STEP, ready = PASS.ready(se).length;
    strip.innerHTML = `<div class="ps-badge">✦</div><div class="ps-what"><b>ARCADE PASS</b><small>SEASON 1 · ${se.name} · ENDS IN ${days(PASS.left(se))} DAYS</small></div>
      <div class="ps-tier"><small>TIER</small>${t}<i>/${PASS.TIERS}</i></div><div class="ps-bar"><i><b style="width:${Math.round(into / PASS.STEP * 100)}%"></b></i><span>${t >= PASS.TIERS ? 'EVERY TIER DONE!' : `${into} / ${PASS.STEP} XP TO TIER ${t + 1}`}</span></div>
      <span class="ps-go${ready ? ' hot' : ''}">${ready ? `${ready} TO CLAIM ▶` : 'OPEN ▶'}</span>`;
  }
  function build() {
    box = el('div', 'ps'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Arcade Pass');
    box.addEventListener('click', e => {
      if (e.target === box || e.target.closest('.ps-x')) return close();
      const c = e.target.closest('[data-claim]'); if (c) { if (PASS.claim(c.dataset.claim)) { sound([784, 988, 1319, 1568]); changed(); } return; }
      if (e.target.closest('.ps-all')) { const got = PASS.claimAll(); if (got.length) { sound([523, 659, 784, 1047, 1319, 1568]); changed(); } return; }
      if (e.target.closest('.ps-buy')) { const n = box.querySelector('.ps-soon'); if (n) { n.hidden = false; sound([392, 523]); } }
    });
    addEventListener('keydown', e => { if (e.key === 'Escape' && box && !box.hidden) { e.stopPropagation(); close(); } }, true);
    document.body.append(box);
  }
  function changed() { render(); renderStrip(); onChange(); const b = box.querySelector('.ps-x'); if (b) b.focus({ preventScroll: true }); }
  function render() {
    const se = PASS.season(); if (!se) { box.innerHTML = '<div class="ps-panel"><p>No season is running right now. The next one starts soon.</p><button class="ps-x" aria-label="Close">✕</button></div>'; return; }
    const t = PASS.tier(se), own = PASS.owned(se), got = PASS.got(se), ready = PASS.ready(se), keep = box.querySelector('.ps-track') ? box.querySelector('.ps-track').scrollLeft : null;
    const passTix = Object.values(se.pass).reduce((n, r) => n + (r.t === 'tix' ? r.n : 0), 0), passPrizes = Object.values(se.pass).filter(r => r.t === 'prize').length;
    box.innerHTML = `<div class="ps-panel"><div class="ps-head"><div><div class="ps-title">✦ ARCADE PASS</div><div class="ps-sub">SEASON 1 · ${se.name} · ENDS IN ${days(PASS.left(se))} DAYS</div></div>
      <div class="ps-lv"><small>TIER</small><b>${t}</b><span>/ ${PASS.TIERS}</span></div><button class="ps-x" aria-label="Close">✕</button></div>
      <p class="ps-how">Every bit of XP you earn (games, badges, missions, story mode, the arcade floor) climbs the pass: ${PASS.STEP} XP a tier. Rewards wait here until you claim them.</p>` +
      (own ? '<div class="ps-own">★ YOU HAVE THE PASS · every reward on both tracks is yours as you climb</div>'
        : `<div class="ps-cta"><div><b>THE PASS TRACK</b><span>${passPrizes} pass-only prizes (a diamond cabinet, outfits, tints, a dance floor) and ${passTix.toLocaleString()} tickets</span></div><button class="ps-buy">GET THE PASS</button><p class="ps-soon" hidden>Coming soon: the pass goes on sale when Bitcade opens up to players. Everything you climb now counts, and anything you've unlocked will be waiting.</p></div>`) +
      `<div class="ps-claimbar"><span>${ready.length ? `${ready.length} REWARD${ready.length === 1 ? '' : 'S'} READY` : 'NOTHING TO CLAIM RIGHT NOW'}</span>${ready.length ? '<button class="ps-all">CLAIM ALL</button>' : ''}</div>
      <div class="ps-rows"><div class="ps-lab"><b>FREE</b></div><div class="ps-lab pass"><b>PASS</b></div></div><div class="ps-track"></div>
      <p class="ps-foot">Prizes you claim are in the prize counter, ready to wear.</p></div>`;
    const track = box.querySelector('.ps-track');
    for (let i = 1; i <= PASS.TIERS; i++) {
      const col = el('div', 'ps-col' + (i <= t ? ' reached' : '') + (i === t + 1 ? ' next' : ''));
      col.append(el('div', 'ps-num', String(i)));
      [['free', 'f', se.free[i]], ['pass', 'p', se.pass[i]]].forEach(([track2, k, r]) => {
        const cell = el(r ? 'button' : 'div', 'ps-cell ' + track2);
        if (!r) { cell.classList.add('none'); col.append(cell); return; }
        const key = k + i, claimed = got.includes(key), can = ready.some(x => x.key === key), locked = track2 === 'pass' && !own;
        cell.type = 'button'; if (can) cell.dataset.claim = key; else cell.disabled = true;
        if (claimed) cell.classList.add('got'); if (can) cell.classList.add('ready'); if (locked) cell.classList.add('locked'); if (r.t === 'prize') cell.classList.add('prize');
        const cv = el('canvas'); cv.width = 64; cv.height = 44; icon(r, cv);
        cell.append(cv, el('span', null, label(r)), el('em', null, claimed ? '✓ CLAIMED' : can ? 'CLAIM' : locked ? '🔒 PASS' : `TIER ${i}`));
        cell.setAttribute('aria-label', `Tier ${i} ${track2}: ${label(r)}${claimed ? ', claimed' : can ? ', ready to claim' : ''}`);
        col.append(cell);
      });
      track.append(col);
    }
    requestAnimationFrame(() => { track.scrollLeft = keep != null ? keep : Math.max(0, (t - 1) * 104); });
  }
  function open() {
    if (!window.PASS) return; if (!box) build();
    lastFocus = document.activeElement; box.hidden = false; document.documentElement.classList.add('pc-open');
    if (!window.Floor && opts.before) Promise.resolve(opts.before()).then(() => { if (box && !box.hidden) render(); }, () => {}); // outfit and carpet pictures come from the floor
    render(); const b = box.querySelector('.ps-all') || box.querySelector('.ps-x'); if (b) b.focus();
  }
  function close() { if (!box || box.hidden) return; box.hidden = true; document.documentElement.classList.remove('pc-open'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  /** Hook up the lobby strip; opts.onChange runs after a claim (tickets and prizes changed). */
  function init(stripEl, o = {}) {
    strip = stripEl; opts = o; onChange = o.onChange || onChange;
    strip.addEventListener('click', open);
    strip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    if (window.PASS) PASS.onChange(renderStrip);
    renderStrip();
  }
  return { init, open, close, render: renderStrip, isOpen: () => !!box && !box.hidden };
})();
