/*
 * The player profile setup (window.Setup): every new player makes one before playing, on the lobby or on whichever
 * game page they land on first (a challenge link, say). It asks for:
 *   - a player name, 3–12 letters or numbers, that only one player can have (names/{NAME} in Firestore, first come
 *     first served). Messages, challenges and the admin console show it, so two players with the same initials can
 *     be told apart.
 *   - initials for the score boards, which anyone can share, arcade style.
 *   - a character (shared/avatar.js), who you are on the arcade floor.
 * Kept in arcade:name, arcade:initials and arcade:avatar (cloud save carries them to your other devices), with a
 * random key for the name (arcade:namekey): a second device proves the name is yours by its key, so it can join it.
 *
 * Offline, the profile is made anyway and the name is claimed once there's a connection (check(), run on every
 * page); if someone else got it first by then, the setup comes back to pick another. arcade:name:ok (per device)
 * remembers what was last published, so check() only touches Firebase when something changed. Editing it later
 * (EDIT PROFILE on the profile card) frees the old name.
 *
 * The smoke tests set sessionStorage bitcade:nosetup, so pages open straight to the game; their own profile tests don't.
 */
window.Setup = (() => {
  const BASE = document.currentScript ? document.currentScript.src : location.href;
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const del = k => { try { localStorage.removeItem(k); } catch (e) {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // the same short list as the messages' filter (shared/inbox.js), plus names that would look official
  const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'fag', 'nigg', 'slut', 'whore', 'asshole', 'bastard', 'retard', 'rape', 'cock', 'wank', 'twat', 'kys', 'sex', 'porn', 'nazi', 'hitler', 'kkk'];
  const RESERVED = ['ADMIN', 'BITCADE', 'MOD', 'MODERATOR', 'SYSTEM', 'STAFF', 'OWNER', 'SUPPORT', 'OFFICIAL', 'GUEST', 'PLAYER', 'NULL', 'UNDEFINED'];
  const rude = s => BAD.some(b => s.toLowerCase().includes(b));
  const NAME = /^[A-Z0-9]{3,12}$/, INI = /^[A-Z]{3}$/;
  const name = () => NAME.test(get('arcade:name') || '') ? get('arcade:name') : '';

  let w = null;
  const world = () => w ? Promise.resolve(w) : import(new URL('world.js', BASE).href).then(m => (w = m));
  const avatarReady = () => window.Avatar ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = new URL('avatar.js', BASE).href; s.onload = ok; s.onerror = no; document.head.append(s); });
  async function sha(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  const newKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

  /** Does this player still need to make a profile? */
  const skip = () => { try { return sessionStorage.getItem('bitcade:nosetup') === '1'; } catch (e) { return false; } };
  const need = () => !skip() && (!(window.SAFE && SAFE.answered()) || !name() || !INI.test(get('arcade:initials') || '') || !(window.Avatar ? Avatar.valid(get('arcade:avatar')) : /^\d/.test(get('arcade:avatar') || '')));

  /** Why a name can't be used, or ''. */
  function nameProblem(n) {
    if (n.length < 3) return 'At least 3 letters or numbers.';
    if (!NAME.test(n)) return 'Letters and numbers only.';
    if (rude(n) || RESERVED.includes(n)) return 'Pick a different name.';
    return '';
  }

  /**
   * Publish the profile when it changed since last time: claim the name (or join it from this player's other device)
   * and free the old one after a rename. Resolves 'same', 'ok', 'taken' or 'offline'. When the name turns out to be
   * someone else's, the setup opens again (unless quiet).
   */
  let checking = null;
  function check({ quiet = false } = {}) {
    if (checking) return checking;
    const n = name(), ini = get('arcade:initials'), av = get('arcade:avatar');
    if (!n || !INI.test(ini || '') || !av) return Promise.resolve('none');
    const kid = !!(window.SAFE && SAFE.on()), sig = `${n}|${ini}|${av}${kid ? '|safe' : ''}`, done = get('arcade:name:ok') || '';
    if (sig === done) return Promise.resolve('same');
    checking = (async () => {
      try {
        let key = get('arcade:namekey'); if (!key) { key = newKey(); set('arcade:namekey', key); }
        const m = await world(), r = await m.claimName(n, key, await sha(key), { n: ini, av, hidden: kid });
        if (r === 'ok') {
          const old = done.split('|')[0]; set('arcade:name:ok', sig);
          if (old && old !== n) m.releaseName(old).catch(() => {});
          return 'ok';
        }
        if (!quiet) open({ required: true, taken: n });
        return 'taken';
      } catch (e) { return 'offline'; }
      finally { checking = null; }
    })();
    return checking;
  }

  const CSS = `
.su{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));background:rgba(8,5,18,.86);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow-y:auto;font:15px/1.4 "Rubik",system-ui,sans-serif;color:#f4effd;-webkit-user-select:none;user-select:none}
.su *{box-sizing:border-box}
.su-box{width:min(720px,100%);background:linear-gradient(180deg,#221a44,#16112e);border:2px solid #4a3c8a;border-radius:18px;box-shadow:0 0 0 1px #0a0612,0 30px 80px rgba(0,0,0,.6),0 0 40px rgba(255,79,163,.18);padding:20px 22px 22px;display:grid;grid-template-columns:220px minmax(0,1fr);gap:8px 22px;margin:auto}
.su-head{grid-column:1/-1;text-align:center;margin-bottom:6px}
.su-head h2{margin:0;font:400 26px/1.1 "Bungee",system-ui,sans-serif;background:linear-gradient(180deg,#ffe36a,#ff7a3d 50%,#ff3d9a);-webkit-background-clip:text;background-clip:text;color:transparent}
.su-head p{margin:6px 0 0;color:#b9b0dc;font-size:14px}
.su-me{display:flex;flex-direction:column;align-items:center;gap:10px}
.su-stage{width:200px;height:230px;border-radius:14px;background:radial-gradient(ellipse at 50% 85%,rgba(255,79,163,.28),transparent 60%),repeating-linear-gradient(90deg,#1c1638 0 24px,#211a42 24px 48px);border:2px solid #3a2f6e;display:block}
.su-tag{font:400 16px "Bungee",sans-serif;letter-spacing:.04em;min-height:20px;text-align:center;word-break:break-all}
.su-tag small{display:block;font:11px "Silkscreen",monospace;color:#ffd23d;letter-spacing:.1em}
.su-parts{display:flex;flex-direction:column;gap:6px;width:100%}
.su-row{display:grid;grid-template-columns:34px minmax(0,1fr) 34px;align-items:center;gap:6px}
.su-row button{height:32px;border-radius:8px;border:1px solid #4a3c8a;background:#1a1436;color:#f4effd;font:14px system-ui;cursor:pointer}
.su-row button:hover{border-color:#5ee7ff;color:#5ee7ff}
.su-row span{display:flex;align-items:center;justify-content:center;gap:6px;font:10px "Silkscreen",monospace;letter-spacing:.08em;color:#b9b0dc;text-align:center}
.su-row i{width:14px;height:14px;border-radius:4px;border:1px solid #0a0612;flex:none}
.su-rand{height:34px;border-radius:9px;border:1px dashed #6a5cb0;background:none;color:#f4effd;font:11px "Silkscreen",monospace;letter-spacing:.1em;cursor:pointer;width:100%}
.su-rand:hover{border-color:#ffd23d;color:#ffd23d}
.su-form{display:flex;flex-direction:column;gap:14px;justify-content:center}
.su-field label{display:block;font:11px "Silkscreen",monospace;letter-spacing:.12em;color:#5ee7ff;margin-bottom:6px}
.su-field input{width:100%;height:50px;border-radius:10px;border:2px solid #4a3c8a;background:#0e0a20;color:#f4effd;font:400 22px "Bungee",sans-serif;letter-spacing:.08em;padding:0 14px;text-transform:uppercase;-webkit-user-select:text;user-select:text;outline:none}
.su-field input:focus{border-color:#5ee7ff;box-shadow:0 0 0 3px rgba(94,231,255,.2)}
.su-field input.ini{width:120px;text-align:center;letter-spacing:.3em}
.su-hint{margin:6px 0 0;font-size:13px;color:#a39bc4;min-height:18px}
.su-hint.ok{color:#3dff8f}.su-hint.bad{color:#ff6a8a}.su-hint.wait{color:#ffd23d}
.su-age{width:100%;height:46px;padding:0 12px;border-radius:12px;border:2px solid #3a2f5a;background:#120e26;color:#f4effd;font:16px Rubik,sans-serif}
.su-go{height:54px;border-radius:12px;border:0;background:linear-gradient(180deg,#ffe36a,#ff7a3d);color:#2a0f10;font:400 18px "Bungee",sans-serif;letter-spacing:.04em;cursor:pointer;box-shadow:0 4px 0 #a8401a,0 10px 24px rgba(255,122,61,.3)}
.su-go:disabled{filter:grayscale(.7) brightness(.7);cursor:default}
.su-go:not(:disabled):active{transform:translateY(2px);box-shadow:0 2px 0 #a8401a}
.su-cancel{background:none;border:0;color:#a39bc4;font:11px "Silkscreen",monospace;letter-spacing:.1em;cursor:pointer;padding:6px}
.su-err{color:#ff6a8a;font-size:14px;text-align:center;margin:0}
@media (max-width:640px){
  .su{place-items:start center}
  .su-box{grid-template-columns:1fr;padding:16px 14px 18px;gap:10px;border-radius:14px}
  .su-head h2{font-size:21px}
  .su-me{display:grid;grid-template-columns:120px minmax(0,1fr);align-items:start;gap:4px 10px}
  .su-stage{width:120px;height:150px;grid-row:span 2}
  .su-tag{grid-column:1;order:3;font-size:13px}
  .su-parts{gap:4px}.su-row{grid-template-columns:30px minmax(0,1fr) 30px}.su-row button{height:28px}
  .su-field input{height:46px;font-size:19px}
}
@media (prefers-reduced-motion:reduce){.su-go:active{transform:none}}`;

  let box = null, raf = 0, opts = {}, av = '', status = { name: '', state: '' }, lookT = 0, myKeyHash = null, myUid = null;
  const $ = s => box.querySelector(s);

  /**
   * Show the setup. required: no way out until it's done (new players). taken: the name someone else got first.
   * onDone(): after saving.
   */
  async function open(o = {}) {
    await avatarReady().catch(() => {});
    if (box && !box.hidden) return;
    opts = o;
    if (!document.getElementById('su-css')) { const st = document.createElement('style'); st.id = 'su-css'; st.textContent = CSS; document.head.append(st); }
    const editing = !o.required && !need();
    av = window.Avatar && Avatar.valid(get('arcade:avatar')) ? get('arcade:avatar') : (window.Avatar ? Avatar.random() : '0-0-0-0-0-0');
    box = document.createElement('div'); box.className = 'su'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Your player profile');
    box.setAttribute('data-keys-native', '');
    box.innerHTML = `<form class="su-box" novalidate>
      <div class="su-head"><h2>${editing ? 'EDIT PROFILE' : name() && !(window.SAFE && SAFE.answered()) ? 'ONE QUICK QUESTION' : 'WELCOME TO BITCADE'}</h2><p>${editing ? 'Change your look, name or initials.' : name() && !(window.SAFE && SAFE.answered()) ? 'What year were you born? It keeps chat safe for younger players. Everything else is already filled in.' : 'Make your player before you play: a look, a name that’s only yours, and initials for the score boards.'}</p></div>
      <div class="su-me"><canvas class="su-stage" width="200" height="230" aria-hidden="true"></canvas><div class="su-tag"></div>
        <div class="su-parts">${(window.Avatar ? Avatar.PARTS : []).map((p, i) => `<div class="su-row" data-part="${i}"><button type="button" data-d="-1" aria-label="Previous ${p[0].toLowerCase()}">◀</button><span></span><button type="button" data-d="1" aria-label="Next ${p[0].toLowerCase()}">▶</button></div>`).join('')}
        <button type="button" class="su-rand">🎲 SURPRISE ME</button></div></div>
      <div class="su-form">
        <div class="su-field"><label for="suName">PLAYER NAME</label><input id="suName" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="NAME" value="${esc(name() || '')}"><p class="su-hint" id="suNameHint">3–12 letters or numbers. Only you can have it.</p></div>
        <div class="su-field"><label for="suIni">INITIALS</label><input id="suIni" class="ini" maxlength="3" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="AAA" value="${esc(INI.test(get('arcade:initials') || '') ? get('arcade:initials') : '')}"><p class="su-hint">For the score boards, arcade style. Other players can have the same ones.</p></div>
        ${o.taken ? `<p class="su-err">Someone else got the name ${esc(o.taken)} first. Please pick another.</p>` : '<p class="su-err" id="suErr" hidden></p>'}
        ${window.SAFE && SAFE.answered() ? '' : `<div class="su-field"><label for="suAge">BIRTH YEAR</label><select id="suAge" class="su-age"><option value="">Choose…</option>${Array.from({ length: 90 }, (_, i) => new Date().getFullYear() - 3 - i).map(y => `<option value="${y}">${y}</option>`).join('')}</select><p class="su-hint">So we can keep chat safe. We only keep whether you're under 13, never the year.</p></div>`}
        <button class="su-go" type="submit">${editing ? 'SAVE' : 'ENTER THE ARCADE ▶'}</button>
        ${o.required || !editing ? '' : '<button type="button" class="su-cancel">CANCEL</button>'}
      </div></form>`;
    document.body.append(box);
    const nm = $('#suName'), ini = $('#suIni');
    let iniTouched = !!ini.value;
    nm.addEventListener('input', () => {
      const v = nm.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); if (v !== nm.value) nm.value = v;
      if (!iniTouched) ini.value = v.replace(/[0-9]/g, '').slice(0, 3);
      checkName(); tag();
    });
    ini.addEventListener('input', () => { iniTouched = true; const v = ini.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); if (v !== ini.value) ini.value = v; tag(); });
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-d]');
      if (b) { const i = +b.closest('[data-part]').dataset.part, v = Avatar.parse(av), n = Avatar.PARTS[i][1].length; v[i] = (v[i] + +b.dataset.d + n) % n; av = Avatar.str(v); parts(); lookT = 0; }
      if (e.target.closest('.su-rand')) { av = Avatar.random(); parts(); lookT = 0; }
      if (e.target.closest('.su-cancel')) close();
    });
    box.addEventListener('keydown', e => { if (e.key === 'Escape' && !opts.required && !need()) { e.preventDefault(); close(); } e.stopPropagation(); });
    box.querySelector('form').addEventListener('submit', e => { e.preventDefault(); save(); });
    parts(); tag(); if (nm.value) checkName();
    const t0 = performance.now();
    const frame = t => { if (!box || box.hidden) return; lookT += 1 / 60; if (window.Avatar) Avatar.draw($('.su-stage'), av, { full: true, pose: lookT < 1.2 ? 'wave' : '', t: (t - t0) / 1000 }); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    setTimeout(() => (nm.value ? ini : nm).focus({ preventScroll: true }), 60);
  }
  function close() { cancelAnimationFrame(raf); if (box) box.remove(); box = null; }
  function parts() {
    if (!window.Avatar) return;
    const v = Avatar.parse(av);
    box.querySelectorAll('[data-part]').forEach(r => {
      const i = +r.dataset.part, [label, list] = Avatar.PARTS[i], val = list[v[i]];
      r.querySelector('span').innerHTML = val[0] === '#' ? `${label} <i style="background:${val}"></i>` : `${label}: ${esc(String(val).toUpperCase())}`;
    });
  }
  function tag() { const n = $('#suName').value, i = $('#suIni').value; $('.su-tag').innerHTML = n ? `${esc(n)}${i ? `<small>${esc(i)}</small>` : ''}` : ''; }

  let nameT = 0;
  function hint(text, cls) { const h = $('#suNameHint'); h.textContent = text; h.className = 'su-hint' + (cls ? ' ' + cls : ''); }
  function checkName() {
    clearTimeout(nameT);
    const n = $('#suName').value, bad = nameProblem(n);
    status = { name: n, state: bad ? 'bad' : 'wait' };
    if (!n) return hint('3–12 letters or numbers. Only you can have it.');
    if (bad) return hint(bad, 'bad');
    hint('Checking…', 'wait');
    nameT = setTimeout(async () => {
      try {
        const m = await world(), owner = await m.nameOwner(n);
        if ($('#suName') && $('#suName').value !== n) return;
        let mine = false;
        if (owner) {
          myUid = myUid || await m.myId().catch(() => null);
          if (myUid && owner.u.includes(myUid)) mine = true;
          else if (get('arcade:namekey') && n === name()) { myKeyHash = myKeyHash || await sha(get('arcade:namekey')); mine = owner.h === myKeyHash; }
        }
        status = { name: n, state: !owner || mine ? 'free' : 'taken' };
        if (!box) return;
        if (status.state === 'taken') hint(`${n} is taken. Try another.`, 'bad'); else hint(mine ? `${n} is yours.` : `${n} is free!`, 'ok');
      } catch (e) {
        status = { name: n, state: 'offline' };
        if (box) hint('Can’t check names right now. It will be checked once you’re online.', 'wait');
      }
    }, 450);
  }

  async function save() {
    const n = $('#suName').value, ini = $('#suIni').value, err = $('#suErr') || $('.su-err');
    const say = t => { if (err) { err.textContent = t; err.hidden = false; } };
    const bad = nameProblem(n);
    if (bad) { $('#suName').focus(); return say(bad); }
    if (!INI.test(ini)) { $('#suIni').focus(); return say('Initials are three letters.'); }
    if (rude(ini)) { $('#suIni').focus(); return say('Pick different initials.'); }
    if (status.name === n && status.state === 'taken') { $('#suName').focus(); return say(`${n} is taken. Try another.`); }
    const ageEl = $('#suAge'); if (ageEl && !ageEl.value) { ageEl.focus(); return say('Pick your birth year.'); }
    if (ageEl) SAFE.set(new Date().getFullYear() - +ageEl.value >= 14 ? '13+' : 'u13'); // only the band is kept; born 13 years ago might still be 12, so that's Safe mode too
    const go = $('.su-go'); go.disabled = true; go.textContent = 'SAVING…';
    const prev = ['arcade:name', 'arcade:initials', 'arcade:avatar', 'arcade:namekey'].map(k => [k, get(k)]);
    if (n !== name()) set('arcade:namekey', newKey()); // a new name gets a new key
    set('arcade:name', n); set('arcade:initials', ini); set('arcade:avatar', av);
    const r = await check({ quiet: true });
    if (r === 'taken') { for (const [k, v] of prev) v == null ? del(k) : set(k, v); go.disabled = false; go.textContent = 'TRY AGAIN'; status = { name: n, state: 'taken' }; hint(`${n} was just taken. Try another.`, 'bad'); $('#suName').focus(); return say(`Someone else has ${n}. Please pick another.`); }
    close();
    try { window.dispatchEvent(new CustomEvent('bitcade:profile')); } catch (e) {}
    if (opts.onDone) opts.onDone();
  }

  return { need, open, check, isOpen: () => !!box };
})();
