/*
 * The player profile: a lobby view (★ PROFILE) with a player card (initials, rank, totals), the cloud save panel, a
 * trophy case with every cabinet's best, plays, time and badges, and the prizes collected. Lobby only.
 *
 * Profile.init({ el, games, paint, prices }) once; Profile.render() whenever the view is shown or progress changes.
 * Cloud save itself lives in shared/save.js (loaded on demand).
 */
window.Profile = (() => {
  let opt = null;
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const json = (k, d) => { try { const v = JSON.parse(get(k)); return v == null ? d : v; } catch (e) { return d; } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RANKS = [[0, 'ROOKIE'], [5, 'REGULAR'], [15, 'HIGH SCORER'], [30, 'ARCADE ACE'], [50, 'GRAND MASTER'], [66, 'LEGEND OF BITCADE']];
  const hm = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? `${h}H ${String(m).padStart(2, '0')}M` : m ? `${m}M` : s ? `${s}S` : '—'; };
  const ago = t => { if (!t) return 'never'; const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };
  const SAVE_URL = new URL('save.js', document.currentScript ? document.currentScript.src : location.href).href;
  const saveMod = () => import(SAVE_URL);

  function stats() {
    let plays = 0, tried = 0, got = 0, all = 0, time = 0;
    const rows = opt.games.map(g => {
      const best = +get('arcade:best:' + g.slug) || 0, p = +get('arcade:plays:' + g.slug) || 0, t = +get('arcade:time:' + g.slug) || 0;
      const top = json('arcade:top:' + g.slug, []), defs = (window.BADGES || {})[g.slug] || [], mine = json('arcade:badges:' + g.slug, []);
      plays += p; time += t; if (p || best) tried++; all += defs.length; got += defs.filter(b => mine.includes(b.id)).length;
      return { g, best, p, t, who: Array.isArray(top) && top[0] && /^[A-Z]{3}$/.test(top[0].n) && top[0].s === best ? top[0].n : '', badges: defs.map(b => ({ ...b, got: mine.includes(b.id) })) };
    });
    return { rows, plays, tried, got, all, time };
  }

  function render() {
    if (!opt) return;
    const st = stats(), ini = /^[A-Z]{3}$/.test(get('arcade:initials') || '') ? get('arcade:initials') : '';
    const rank = RANKS.filter(([n]) => st.got >= n).pop()[1], next = RANKS.find(([n]) => n > st.got);
    const prizes = window.Prizes ? Prizes.LIST.filter(p => Prizes.has(p.id)) : [];
    const el = opt.el;
    el.innerHTML = `
      <div class="pf-card">
        <div class="pf-id"><label class="pf-ini"><input id="pfIni" maxlength="3" autocomplete="off" spellcheck="false" placeholder="???" aria-label="Your initials" value="${esc(ini)}"></label>
          <div><div class="pf-rank">${rank}</div><div class="pf-next">${next ? `${next[0] - st.got} more badge${next[0] - st.got === 1 ? '' : 's'} to ${next[1]}` : 'Every badge in the arcade. Legendary.'}</div></div></div>
        <div class="pf-stats">
          <span>GAMES PLAYED<b>${st.plays.toLocaleString()}</b></span><span>CABINETS TRIED<b>${st.tried}/${st.rows.length}</b></span>
          <span>BADGES<b>${st.got}/${st.all}</b></span><span>TICKETS EARNED<b>${window.TICKETS ? TICKETS.earned().toLocaleString() : 0}</b></span>
          <span>PRIZES<b>${prizes.length}/${window.Prizes ? Prizes.LIST.length : 0}</b></span><span>PLAY TIME<b>${hm(st.time)}</b></span>
        </div>
      </div>
      <div class="pf-cloud" id="pfCloud"></div>
      <h3 class="pf-h">TROPHY CASE</h3>
      <div class="pf-grid">${st.rows.map((r, i) => `
        <a class="pf-game${r.badges.length && r.badges.every(b => b.got) ? ' gold' : ''}" href="games/${r.g.slug}/" style="--c:${r.g.c}">
          <canvas width="12" height="8" data-i="${i}"></canvas>
          <div class="pf-g"><b>${esc(r.g.name)}</b>
            <small>${r.g.label || 'BEST'} <i>${r.who ? r.who + ' ' : ''}${r.best ? r.best.toLocaleString() : '—'}</i> · PLAYED <i>${r.p}</i> · <i>${hm(r.t)}</i></small>
            <div class="pf-badges">${r.badges.map(b => `<span class="${b.got ? 'got' : ''}" title="${esc(b.desc)}">${b.got ? '★' : '☆'} ${esc(b.name)}</span>`).join('')}</div>
          </div>
        </a>`).join('')}</div>
      <h3 class="pf-h">PRIZE COLLECTION</h3>
      <div class="pf-prizes">${prizes.length ? prizes.map(p => `<span>${esc(p.name)}</span>`).join('') : '<em>Nothing yet. Win tickets in any game and trade them at the prize counter.</em>'}
        <button class="pf-btn" id="pfCounter">PRIZE COUNTER ▶</button></div>`;
    el.querySelectorAll('canvas[data-i]').forEach(c => opt.paint(c.getContext('2d'), st.rows[+c.dataset.i].g.px));
    const input = el.querySelector('#pfIni');
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      if (input.value.length === 3) { set('arcade:initials', input.value); input.classList.add('ok'); } else input.classList.remove('ok');
    });
    el.querySelector('#pfCounter').addEventListener('click', () => window.Prizes && Prizes.open());
    cloud();
  }

  /* ---------- cloud save panel ---------- */
  let busy = '', joinOpen = false, shown = false;
  async function cloud(msg) {
    const box = opt.el.querySelector('#pfCloud'); if (!box) return;
    const m = await saveMod().catch(() => null);
    if (!m) { box.innerHTML = '<b>CLOUD SAVE</b><p>Cloud save needs the internet. Try again when you’re online.</p>'; return; }
    const c = m.code();
    if (!c) {
      box.innerHTML = `<b>CLOUD SAVE · OFF</b>
        <p>Keep your scores, badges, tickets and prizes safe, and carry them to another phone or computer. No account needed: you get a code to type on the other device.</p>
        <div class="pf-row"><button class="pf-btn hot" id="pfOn" ${busy ? 'disabled' : ''}>${busy === 'on' ? 'TURNING ON…' : 'TURN ON CLOUD SAVE'}</button>
        <button class="pf-btn" id="pfHave">I HAVE A CODE</button></div>
        ${joinOpen ? `<div class="pf-row"><input id="pfCode" placeholder="XXXX-XXXX-XXXX" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Sync code"><button class="pf-btn hot" id="pfJoin" ${busy ? 'disabled' : ''}>${busy === 'join' ? 'JOINING…' : 'JOIN'}</button></div>` : ''}
        ${msg ? `<p class="pf-msg">${msg}</p>` : ''}`;
      box.querySelector('#pfOn').addEventListener('click', async () => {
        busy = 'on'; cloud();
        const r = await m.enable({ prices: opt.prices }); busy = ''; shown = true;
        if (r.state !== 'ok') { m.disable(); return cloud('Couldn’t reach the cloud. Check your connection and try again.'); }
        cloud();
      });
      box.querySelector('#pfHave').addEventListener('click', () => { joinOpen = !joinOpen; cloud(); });
      const join = box.querySelector('#pfJoin');
      if (join) {
        const input = box.querySelector('#pfCode'); input.focus();
        const go = async () => {
          if (!m.normalize(input.value)) return cloud('That doesn’t look like a code. It’s 12 letters and numbers, like K7QM-2XRT-9BHF.');
          busy = 'join'; cloud();
          const r = await m.join(input.value, { prices: opt.prices }); busy = '';
          if (r.state !== 'ok') return cloud('Couldn’t reach the cloud. Check your connection and try again.');
          joinOpen = false; if (opt.onSynced) opt.onSynced(true); render();
        };
        join.addEventListener('click', go); input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      }
      return;
    }
    box.innerHTML = `<b>CLOUD SAVE · ON</b>
      <div class="pf-row"><div class="pf-code">${shown ? esc(c) : esc(c.slice(0, 4)) + '-••••-••••'}</div>
        <button class="pf-btn" id="pfShow">${shown ? 'HIDE' : 'SHOW'}</button><button class="pf-btn" id="pfCopy">COPY</button></div>
      <p>Type this code on another device (★ PROFILE → I HAVE A CODE) to bring everything there. Keep it private: anyone with it can use your save.</p>
      <div class="pf-row"><button class="pf-btn hot" id="pfSync" ${busy ? 'disabled' : ''}>${busy === 'sync' ? 'SYNCING…' : 'SYNC NOW'}</button>
        <button class="pf-btn" id="pfOff">STOP ON THIS DEVICE</button><span class="pf-when">Last synced ${ago(m.lastSynced())}</span></div>
      ${msg ? `<p class="pf-msg">${msg}</p>` : ''}`;
    box.querySelector('#pfShow').addEventListener('click', () => { shown = !shown; cloud(); });
    box.querySelector('#pfCopy').addEventListener('click', () => { try { navigator.clipboard.writeText(c).then(() => cloud('Code copied.'), () => cloud('Copy failed: ' + c)); } catch (e) { cloud(c); } });
    box.querySelector('#pfSync').addEventListener('click', async () => {
      busy = 'sync'; cloud(); const r = await m.sync({ prices: opt.prices }); busy = '';
      if (r.state !== 'ok') return cloud('Couldn’t reach the cloud. Your progress is safe here; it’ll sync next time.');
      if (r.changed && opt.onSynced) opt.onSynced(true);
      render();
    });
    box.querySelector('#pfOff').addEventListener('click', () => {
      if (!confirm('Stop cloud save on this device? Your progress stays here and in the cloud; you can join again with the code.')) return;
      m.disable(); shown = false; cloud('Cloud save is off on this device.');
    });
  }

  return {
    init(o) { opt = o; },
    render,
    /** Sync quietly (the lobby calls this on load); resolves with save.js's result. */
    autoSync: () => saveMod().then(m => m.sync({ prices: opt && opt.prices })).catch(() => ({ state: 'offline' }))
  };
})();
