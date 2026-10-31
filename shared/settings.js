/*
 * Settings: one panel for every game and the lobby. Audio (sound and music, each with a volume), display (the CRT
 * look, screen shake, flashes, vibration on phones), easy mode and, in games, controls: any of the game's buttons can
 * get a key of your own as well as its usual one. Everything stays on this device (cloud save leaves it alone):
 *   arcade:muted, arcade:music ('0' off), arcade:vol:sfx and arcade:vol:music (0–100), arcade:crt ('lite' | '1' | '0'),
 *   arcade:shake ('1' | '0.5' | '0'), arcade:flash ('1' | '0.4'), arcade:buzz ('0' off), arcade:easy,
 *   arcade:keys:<slug> ({ "KeyK": "Space" }: your key → the game's key), arcade:track ('0': no play activity, shared/activity.js).
 * Pages listen with Settings.onChange(key => …) and read values with Settings.get(key). The lobby also passes
 * onResetScores, which adds a DATA section with a high-score reset (tap twice; it says whether the cloud save goes too).
 */
window.Settings = (() => {
  const BASE = document.currentScript ? document.currentScript.src : location.href; // for world.js (feedback)
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) {} };
  const fns = [];
  const changed = k => fns.forEach(f => { try { f(k); } catch (e) {} });
  const DEF = { 'arcade:vol:sfx': '100', 'arcade:vol:music': '100', 'arcade:crt': 'lite', 'arcade:shake': '1', 'arcade:flash': '1', 'arcade:buzz': '1', 'arcade:music': '1', 'arcade:muted': '0', 'arcade:easy': '0', 'arcade:track': '1' };
  const val = k => { const v = get(k); return v == null ? DEF[k] : v; };
  let box = null, opts = {}, waiting = null, lastFocus = null, armed = false, wiping = false, armT = 0, fbOpen = false, fbText = '', fbMsg = '', fbBusy = false;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** A readable name for a key code. */
  const keyName = c => ({ Space: 'SPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'ENTER', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Backspace: 'BKSP', Tab: 'TAB', Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\' }[c] || c.replace(/^Key|^Digit|^Numpad/, m => m === 'Numpad' ? 'NUM ' : '').toUpperCase());
  const keysKey = () => 'arcade:keys:' + (opts.slug || 'game');
  const keymap = () => { try { const m = JSON.parse(get(keysKey())); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } };

  const seg = (k, choices) => `<div class="set-seg" role="radiogroup" data-key="${k}">${choices.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${val(k) === v}">${t}</button>`).join('')}</div>`;
  const sw = (k, on, id) => `<button type="button" class="set-sw" role="switch" data-sw="${k}" ${id ? `id="${id}"` : ''} aria-checked="${on}"><i></i><span>${on ? 'ON' : 'OFF'}</span></button>`;
  const slider = (k, label) => `<input type="range" class="set-vol" min="0" max="100" step="5" data-vol="${k}" value="${val(k)}" aria-label="${label}">`;

  function render() {
    const soundOn = val('arcade:muted') !== '1', musicOn = val('arcade:music') !== '0', easy = val('arcade:easy') === '1', canBuzz = 'vibrate' in navigator && matchMedia('(pointer: coarse)').matches;
    const map = keymap(), acts = opts.controls || [];
    box.querySelector('.set-body').innerHTML = `
      <h3>AUDIO</h3>
      <div class="set-row"><label>Sound effects</label>${sw('sound', soundOn, 'setSound')}${slider('arcade:vol:sfx', 'Sound effects volume')}</div>
      <div class="set-row"><label>Music</label>${sw('music', musicOn, 'setMusic')}${slider('arcade:vol:music', 'Music volume')}</div>
      <h3>DISPLAY</h3>
      <div class="set-row"><label>CRT look<small>scanlines and glow</small></label>${seg('arcade:crt', [['lite', 'LITE'], ['1', 'FULL'], ['0', 'OFF']])}</div>
      <div class="set-row"><label>Screen shake</label>${seg('arcade:shake', [['1', 'FULL'], ['0.5', 'SOFT'], ['0', 'OFF']])}</div>
      <div class="set-row"><label>Flashes<small>softer for comfort</small></label>${seg('arcade:flash', [['1', 'FULL'], ['0.4', 'SOFT']])}</div>
      ${canBuzz ? `<div class="set-row"><label>Vibration<small>on big hits</small></label>${sw('buzz', val('arcade:buzz') !== '0')}</div>` : ''}
      <h3>GAMEPLAY</h3>
      <div class="set-row"><label>Easy mode<small>slower, more lives; scores, badges and tickets don't count</small></label>${sw('easy', easy, 'setEasy')}</div>
      <div class="set-row"><label>Share play activity<small>anonymous: which games you play, for how long, your scores, and any errors, to help improve Bitcade</small></label>${sw('track', val('arcade:track') !== '0', 'setTrack')}</div>
      <h3>FEEDBACK</h3><div class="set-row"><label>Send feedback<small>A bug, an idea, a game you love or don't: it goes straight to the people making Bitcade.</small></label><button type="button" class="set-fb-open">${fbOpen ? 'CLOSE' : '✎ WRITE'}</button></div>
      ${fbOpen ? `<div class="set-fb"><textarea id="setFb" maxlength="1000" rows="4" placeholder="What's on your mind? (no names or emails, please)">${esc(fbText)}</textarea><div class="set-fb-row"><span>${fbMsg}</span><button type="button" class="set-fb-send"${fbBusy || !fbText.trim() ? ' disabled' : ''}>${fbBusy ? 'SENDING…' : 'SEND'}</button></div></div>` : (fbMsg ? `<p class="set-note">${fbMsg}</p>` : '')}` +
      (acts.length ? `<h3>CONTROLS <button type="button" class="set-reset">RESET</button></h3><p class="set-note">Give any button a key of your own. Its usual key keeps working too. Controllers work as they are.</p>
      <div class="set-keys">${acts.map(a => { const mine = Object.keys(map).find(k => map[k] === a.code); return `<div class="set-key"><span>${a.label}</span><kbd>${keyName(a.code)}</kbd><button type="button" data-bind="${a.code}" class="${waiting === a.code ? 'wait' : ''}">${waiting === a.code ? 'PRESS A KEY…' : mine ? keyName(mine) : '+ ADD KEY'}</button></div>`; }).join('')}</div>` : '') +
      (opts.onResetScores ? `<h3>DATA</h3><div class="set-row"><label>Reset high scores<small>Clears your bests, top 10s, play counts and daily and weekly bests ${get('bitcade:sync') ? 'on this device <b>and in your cloud save</b> (your other devices too, when they next sync)' : 'on this device'}. World leaderboards, badges, tickets, levels and prizes stay.</small></label>` +
        `<button type="button" class="set-wipe${armed ? ' armed' : ''}"${wiping ? ' disabled' : ''}>${wiping ? 'RESETTING…' : armed ? 'TAP AGAIN TO ERASE' : 'RESET'}</button></div>` +
        (opts.onDeleteAccount ? `<div class="set-row"><label>Delete my account<small>Deletes your player for good: your name and character, scores on the world boards, messages, friends, challenges, cloud save and play history, and everything on this device. It can't be undone.</small></label><button type="button" class="set-delacct">DELETE</button></div>` : '') : '') +
      `<p class="set-legal"><a href="${new URL('../privacy.html', BASE).href}" target="_blank" rel="noopener">Privacy policy</a> · <a href="${new URL('../terms.html', BASE).href}" target="_blank" rel="noopener">Terms</a></p>` +
      `<p class="set-note">Settings are saved on this device and apply to every game.</p>`;
  }
  // its own styles, so the lobby (which doesn't load arcade.css) gets the same panel
  const CSS = `.set{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,3,12,.78);backdrop-filter:blur(4px);font-family:Rubik,system-ui,sans-serif;color:#f4effd}
.set-panel{width:min(560px,100%);max-height:calc(100dvh - 32px);overflow:auto;display:flex;flex-direction:column;gap:6px;padding:16px 18px 18px;border-radius:18px;border:1px solid #4a3f7e;
  background:radial-gradient(ellipse at 50% 0%,rgba(94,231,255,.12),transparent 60%),linear-gradient(180deg,#1d1740,#130f2a);box-shadow:0 20px 60px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08)}
.set-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}
.set-head b{font-family:Bungee,system-ui,sans-serif;font-weight:400;font-size:22px;letter-spacing:.04em;color:#5ee7ff;text-shadow:0 0 14px rgba(94,231,255,.45)}
.set-x{font-size:16px;color:#f4effd;background:rgba(255,255,255,.04);border:1px solid #3a3260;border-radius:9px;width:34px;height:34px;cursor:pointer}
.set h3{display:flex;align-items:center;justify-content:space-between;margin:12px 0 2px;font-family:Silkscreen,monospace;font-weight:400;font-size:11px;letter-spacing:.16em;color:#a39bc4;border-bottom:1px solid #2c2552;padding-bottom:5px}
.set-row{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:8px 2px}
.set-row label{flex:1 1 150px;display:flex;flex-direction:column;font-size:14.5px;font-weight:500}
.set-row label small{font-weight:400;font-size:11.5px;color:#a39bc4}
.set-sw{display:flex;align-items:center;gap:7px;background:none;border:0;padding:2px;cursor:pointer;color:#a39bc4;font-family:Silkscreen,monospace;font-size:11px;min-width:76px}
.set-sw i{position:relative;width:42px;height:24px;border-radius:12px;background:#2c2552;border:1px solid #4a3f7e;transition:background .18s}
.set-sw i::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#a39bc4;transition:transform .18s,background .18s}
.set-sw[aria-checked="true"]{color:#3dff8f}.set-sw[aria-checked="true"] i{background:#1d5a3a;border-color:#3dff8f}.set-sw[aria-checked="true"] i::after{transform:translateX(18px);background:#3dff8f;box-shadow:0 0 8px #3dff8f}
.set-vol{flex:1 1 140px;accent-color:#5ee7ff;height:22px;cursor:pointer}
.set-seg{display:flex;border:1px solid #4a3f7e;border-radius:10px;overflow:hidden}
.set-seg button{font-family:Silkscreen,monospace;font-size:11px;letter-spacing:.06em;color:#a39bc4;background:#17122f;border:0;border-left:1px solid #2c2552;padding:7px 11px;cursor:pointer}
.set-seg button:first-child{border-left:0}.set-seg button[aria-checked="true"]{color:#120a1c;background:#5ee7ff}
.set-note{margin:4px 0 0;font-size:12px;color:#a39bc4}
.set-fb{display:flex;flex-direction:column;gap:6px;padding:0 2px 6px}
.set-fb textarea{width:100%;resize:vertical;min-height:80px;font:14px Rubik,system-ui,sans-serif;color:#f4effd;background:#120e26;border:1px solid #4a3f7e;border-radius:10px;padding:9px 11px;-webkit-user-select:text;user-select:text}
.set-fb textarea:focus{outline:2px solid #5ee7ff}
.set-fb-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:Silkscreen,monospace;font-size:10.5px;color:#a39bc4}
.set-fb-send{font-family:Silkscreen,monospace;font-size:12px;color:#120a1c;background:#5ee7ff;border:0;border-radius:9px;padding:8px 18px;cursor:pointer}.set-fb-send[disabled]{opacity:.45;cursor:default}
.set-wipe,.set-fb-open{font-family:Silkscreen,monospace;font-size:11px;letter-spacing:.06em;color:#ff8a9a;background:none;border:1px solid #6a2a3a;border-radius:9px;padding:8px 12px;cursor:pointer}
.set-wipe.armed{color:#120a1c;background:#ff4f6d;border-color:#ff4f6d}
.set-row label small b{color:#ff8a9a;font-weight:500}
.set-delacct{font-family:Silkscreen,monospace;font-size:10px;letter-spacing:.06em;color:#fff;background:#8a1a2a;border:1px solid #ff4f6d;border-radius:8px;padding:6px 10px;cursor:pointer}
.set-legal{margin:14px 0 0;font-size:12px;text-align:center;color:#a39bc4}.set-legal a{color:#5ee7ff}
.set-reset{font-family:Silkscreen,monospace;font-size:10px;letter-spacing:.06em;color:#ff8a9a;background:none;border:1px solid #6a2a3a;border-radius:7px;padding:3px 8px;cursor:pointer}
.set-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;margin-top:4px}
.set-key{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid #2c2552}
.set-key span{flex:1;font-size:13.5px}
.set-key kbd{font-family:Silkscreen,monospace;font-size:11px;color:#f4effd;background:#2c2552;border-radius:5px;padding:3px 6px;border-bottom:2px solid #120a1c}
.set-key button{font-family:Silkscreen,monospace;font-size:10.5px;color:#5ee7ff;background:none;border:1px dashed #3a5a7a;border-radius:6px;padding:4px 7px;cursor:pointer;min-width:84px}
.set-key button.wait{color:#120a1c;background:#ffd23d;border:1px solid #ffd23d;animation:setpulse 1s infinite}
@keyframes setpulse{50%{opacity:.6}}
.set-done{margin-top:10px;align-self:center;font-family:Silkscreen,monospace;font-size:14px;border:0;border-radius:10px;padding:11px 34px;cursor:pointer;color:#120a1c;background:#5ee7ff;box-shadow:0 4px 0 #2a7a8a}
.set button:focus-visible,.set input:focus-visible{outline:2px solid #ffe36a;outline-offset:2px}
.set-open body{overflow:hidden}`;
  function build() {
    if (!document.getElementById('set-css')) { const st = document.createElement('style'); st.id = 'set-css'; st.textContent = CSS; document.head.append(st); }
    box = document.createElement('div'); box.className = 'set'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Settings');
    box.setAttribute('data-keys-native', ''); // the kit leaves keys to this panel
    box.innerHTML = '<div class="set-panel"><div class="set-head"><b>⚙ SETTINGS</b><button type="button" class="set-x" aria-label="Close">✕</button></div><div class="set-body"></div><button type="button" class="set-done">DONE</button></div>';
    box.addEventListener('click', e => {
      if (e.target === box || e.target.closest('.set-x') || e.target.closest('.set-done')) return close();
      const s = e.target.closest('[data-sw]');
      if (s) {
        const k = s.dataset.sw;
        if (k === 'sound') set('arcade:muted', val('arcade:muted') === '1' ? '0' : '1');
        if (k === 'music') set('arcade:music', val('arcade:music') === '0' ? '1' : '0');
        if (k === 'buzz') { set('arcade:buzz', val('arcade:buzz') === '0' ? '1' : '0'); if (val('arcade:buzz') === '1' && navigator.vibrate) navigator.vibrate(40); }
        if (k === 'easy') set('arcade:easy', val('arcade:easy') === '1' ? '0' : '1');
        if (k === 'track') { set('arcade:track', val('arcade:track') === '0' ? '1' : '0'); if (val('arcade:track') === '0') try { localStorage.setItem('bitcade:actq', '[]'); } catch (e) {} }
        changed({ sound: 'arcade:muted', music: 'arcade:music', buzz: 'arcade:buzz', easy: 'arcade:easy', track: 'arcade:track' }[k]); refocus(`[data-sw="${k}"]`); return;
      }
      const r = e.target.closest('.set-seg button');
      if (r) { const k = r.parentNode.dataset.key; set(k, r.dataset.v); changed(k); refocus(`[data-key="${k}"] [data-v="${r.dataset.v}"]`); return; }
      const b = e.target.closest('[data-bind]');
      if (b) { waiting = waiting === b.dataset.bind ? null : b.dataset.bind; refocus(`[data-bind="${b.dataset.bind}"]`); return; }
      if (e.target.closest('.set-fb-open')) { fbOpen = !fbOpen; fbMsg = ''; refocus(fbOpen ? '#setFb' : '.set-fb-open'); return; }
      if (e.target.closest('.set-fb-send') && fbText.trim() && !fbBusy) {
        fbBusy = true; refocus('.set-fb-send');
        const ini = get('arcade:initials'), w = Math.min(screen.width, screen.height), dev = matchMedia('(pointer: coarse)').matches ? (w >= 700 ? 'tablet' : 'phone') : 'desktop';
        import(new URL('world.js', BASE).href).then(w => w.sendFeedback({ x: fbText.trim(), g: opts.slug || 'lobby', n: ini, dev }))
          .then(() => { fbText = ''; fbOpen = false; fbMsg = '✓ THANKS! YOUR FEEDBACK WAS SENT.'; }, () => { fbMsg = 'COULDN\u2019T SEND. CHECK YOUR CONNECTION AND TRY AGAIN.'; })
          .finally(() => { fbBusy = false; if (!box.hidden) refocus(fbOpen ? '.set-fb-send' : '.set-fb-open'); });
        return;
      }
      if (e.target.closest('.set-delacct') && opts.onDeleteAccount) {
        const t = prompt('This deletes your Bitcade player and everything with it, for good.\n\nType DELETE to confirm.');
        if (t && t.trim().toUpperCase() === 'DELETE') { e.target.closest('.set-delacct').textContent = 'DELETING…'; e.target.closest('.set-delacct').disabled = true; Promise.resolve(opts.onDeleteAccount()).catch(() => { alert('Couldn\u2019t reach the server. Check your connection and try again.'); close(); }); }
        return;
      }
      if (e.target.closest('.set-wipe') && opts.onResetScores && !wiping) {
        clearTimeout(armT);
        if (!armed) { armed = true; armT = setTimeout(() => { armed = false; if (!box.hidden) refocus('.set-wipe'); }, 4000); refocus('.set-wipe'); return; }
        armed = false; wiping = true; refocus('.set-wipe');
        Promise.resolve(opts.onResetScores()).finally(() => { wiping = false; if (!box.hidden) refocus('.set-wipe'); });
        return;
      }
      if (e.target.closest('.set-reset')) { set(keysKey(), '{}'); waiting = null; changed(keysKey()); refocus('.set-reset'); }
    });
    box.addEventListener('input', e => { if (e.target.id === 'setFb') { fbText = e.target.value; const sb = box.querySelector('.set-fb-send'); if (sb) sb.disabled = !fbText.trim() || fbBusy; return; } const v = e.target.closest('[data-vol]'); if (v) { set(v.dataset.vol, v.value); changed(v.dataset.vol); } });
    addEventListener('keydown', e => {
      if (!box || box.hidden) return;
      if (waiting) { // the next key becomes this button's extra key
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.code !== 'Escape') { const m = keymap(); Object.keys(m).forEach(k => { if (m[k] === waiting || k === e.code) delete m[k]; }); if (e.code !== waiting) m[e.code] = waiting; set(keysKey(), JSON.stringify(m)); changed(keysKey()); }
        const c = waiting; waiting = null; refocus(`[data-bind="${c}"]`); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    }, true);
    document.body.append(box);
  }
  function refocus(q) { render(); const el = box.querySelector(q); if (el) el.focus({ preventScroll: true }); }
  /** Open the panel. opts: { slug, controls: [{ code, label }] } (controls only in games). */
  function open(o = {}) {
    opts = o; if (!box) build(); waiting = null; armed = false; fbMsg = ''; if (o.feedback) fbOpen = true;
    lastFocus = document.activeElement; box.hidden = false; document.documentElement.classList.add('set-open');
    render(); box.querySelector('.set-x').focus();
    if (o.feedback) { const t = box.querySelector('#setFb'); if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); } }
  }
  function close() {
    if (!box || box.hidden) return; waiting = null;
    box.hidden = true; document.documentElement.classList.remove('set-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    changed('close');
  }
  /** Controller presses while the panel is open: d-pad moves between controls, A presses, left/right adjust, B closes. */
  function pad(code) {
    if (!box || box.hidden) return false;
    const all = [...box.querySelectorAll('button:not([disabled]), input')].filter(x => x.offsetParent);
    let i = all.indexOf(document.activeElement);
    if (code === 'ArrowDown' || code === 'ArrowUp') { i = Math.max(0, Math.min(all.length - 1, i + (code === 'ArrowDown' ? 1 : -1))); all[i].focus(); }
    else if ((code === 'ArrowLeft' || code === 'ArrowRight') && document.activeElement && document.activeElement.matches('input[type=range]')) { const r = document.activeElement; r.value = +r.value + (code === 'ArrowRight' ? 5 : -5); r.dispatchEvent(new Event('input', { bubbles: true })); }
    else if (code === 'Space' || code === 'Enter') { if (document.activeElement && box.contains(document.activeElement)) document.activeElement.click(); }
    else if (code === 'Back') close();
    return true;
  }
  return { open, close, pad, get: val, keymap, keyName, isOpen: () => !!box && !box.hidden, onChange: fn => fns.push(fn) };
})();
