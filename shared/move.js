/*
 * The move to playbitcade.com. Progress lives in each browser's storage, which belongs to the site's address, and each
 * player is a Firebase account on that address, so moving address needs a handover (functions/index.js):
 * - On the old address (gfrazier620-afk.github.io/Bitcade/), every page packs this browser's progress (the arcade: and
 *   bitcade: keys), hands it to the server with moveStart (signed in as this player) and goes to the same page on the
 *   new address with ?move=<id>. Offline, or if the server says no, the page carries on here and tries again next time.
 *   Once moved (bitcade:moved), the old address just sends you along.
 * - On the new address, ?move=<id> gets it back with moveFinish, signs in as the same player (same name, friends,
 *   messages and pass), puts the progress in this browser's storage and reloads the page without it.
 * Loaded first by the lobby, the legal pages and admin.html, and by game pages through arcade.js. ON switches the old
 * address over; until then ?movetest does it for one visit (and, on a local server, ?movetest=http://localhost:5181/
 * moves to another local server, for testing).
 */
(() => {
  const ON = true; // switched on 2026-10-31
  const HOME = 'https://playbitcade.com/';
  const me = document.currentScript && document.currentScript.src;
  if (!me) return;
  const ROOT = new URL('../', me).href; // the site's root on this address (…/Bitcade/ on the old one)
  const here = location.href.slice(ROOT.length).replace(/[?&](move|from)=[^&#]*/g, '').replace(/^([^?]*)&/, '$1?').replace(/\?(#|$)/, '$1'); // this page, from the root
  const q = new URLSearchParams(location.search), local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const keys = () => { try { return Object.keys(localStorage).filter(k => /^(arcade|bitcade):/.test(k) && k !== 'bitcade:moved'); } catch (e) { return []; } };
  const world = () => import(ROOT + 'shared/world.js');
  function cover(text) {
    const d = document.createElement('div'); d.id = 'moveCover';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#0f0c1f;color:#f4effd;font:16px/1.5 Rubik,system-ui,sans-serif';
    d.innerHTML = '<div style="font:28px Bungee,sans-serif;color:#ffd23d;letter-spacing:.04em">BITCADE</div><div class="mv-t"></div>';
    d.querySelector('.mv-t').textContent = text;
    (document.body || document.documentElement).append(d);
    return d;
  }

  // the new address: unpack a handover
  const id = q.get('move');
  if (id) {
    const c = () => document.getElementById('moveCover') || cover('Bringing your progress to the new arcade…');
    if (document.body) c(); else addEventListener('DOMContentLoaded', c);
    world().then(w => w.moveFinish(id)).then(blob => {
      const data = JSON.parse(blob);
      for (const k of keys()) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(data)) if (/^(arcade|bitcade):/.test(k) && typeof v === 'string') localStorage.setItem(k, v);
      try { sessionStorage.setItem('bitcade:booted', '1'); } catch (e) {}
      location.replace(ROOT + here);
    }).catch(e => {
      const d = c(); d.querySelector('.mv-t').innerHTML = 'We couldn’t bring your progress over just now.<br><small style="color:#a39bc4">Open your old Bitcade link again to try once more. Your progress is safe there.</small>';
      const b = document.createElement('button'); b.textContent = 'PLAY ANYWAY'; b.style.cssText = 'font:14px Silkscreen,monospace;padding:10px 18px;border-radius:10px;border:0;background:#ffd23d;color:#1a1030;cursor:pointer';
      b.onclick = () => location.replace(ROOT + here); d.append(b);
      // back to the old address to hand over again (it remembers it moved, so it's told to try once more)
      const from = q.get('from') || '';
      if (/^https:\/\/[a-z0-9-]+\.github\.io\/[A-Za-z0-9_-]+\/$|^http:\/\/(localhost|127\.0\.0\.1):\d+\/$/.test(from)) {
        const r = document.createElement('button'); r.textContent = 'TRY AGAIN'; r.style.cssText = b.style.cssText.replace('#ffd23d', '#5ee7ff');
        r.onclick = () => location.replace(from + here + (here.includes('?') ? '&' : '?') + 'moveagain=1'); b.before(r);
      }
      console.warn('move:', e && (e.code || e.message));
    });
    return;
  }

  // the old address: hand over and go
  const test = q.get('movetest');
  const old = /\.github\.io$/.test(location.hostname) || (local && test);
  if (!old || !(ON || test != null)) return;
  const dest = local && /^http:\/\/(localhost|127\.0\.0\.1):\d+\/$/.test(test || '') ? test : HOME;
  const page = here.replace(/[?&](movetest|moveagain)(=[^&#]*)?(?=&|#|$)/g, '').replace(/^([^?]*)&/, '$1?').replace(/^\?$/, '').replace(/\?(#|$)/, '$1');
  const go = (mid = '') => location.replace(dest + page + (mid ? (page.includes('?') ? '&' : '?') + 'move=' + encodeURIComponent(mid) + '&from=' + encodeURIComponent(ROOT) : ''));
  if (get('bitcade:moved') && test == null && !q.has('moveagain')) return go();
  const ks = keys();
  if (!ks.some(k => k.startsWith('arcade:'))) { try { localStorage.setItem('bitcade:moved', dest); } catch (e) {} return go(); } // nothing to bring
  const start = () => {
    const d = cover('Bitcade has moved to playbitcade.com. Bringing your progress along…');
    const data = {}; ks.forEach(k => { data[k] = get(k); });
    world().then(w => w.moveStart(JSON.stringify(data))).then(mid => {
      try { localStorage.setItem('bitcade:moved', dest); } catch (e) {}
      go(mid);
    }).catch(e => { d.remove(); console.warn('move:', e && (e.code || e.message)); }); // offline: play here, try next time
  };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
})();
