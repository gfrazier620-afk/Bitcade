// A full scan (not part of npm test): every game and the lobby's views on desktop, phone (both ways) and tablet,
// looking for errors, sideways scrolling, cut-off screens, buttons or touch pads, and errors while the demo plays.
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
const BASE = 'http://localhost:5180';
const VPS = { desk: { viewport: { width: 1280, height: 800 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, land: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, tab: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }, small: { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true } };
const only = process.argv[2];
const games = readdirSync(new URL('../games/', import.meta.url)).filter(g => !only || only.split(',').includes(g));
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
const issues = [];
const note = (where, what) => { issues.push(`${where}: ${what}`); };
async function page(vp) {
  const c = await b.newContext(VPS[vp]); const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|firestore|firebase|AudioContext|favicon/i.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 160)); });
  await p.addInitScript(() => { try { sessionStorage.setItem('bitcade:nosetup', '1'); sessionStorage.setItem('bitcade:booted', '1'); sessionStorage.setItem('bitcade:happy', '0'); localStorage.setItem('arcade:track', '0'); } catch (e) {} });
  return { p, c, errs };
}
const layout = (p) => p.evaluate(() => {
  const out = [], W = innerWidth, H = innerHeight, vis = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
  if (document.documentElement.scrollWidth > W + 1) out.push(`scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
  const cv = vis(document.querySelector('.screen canvas, canvas#cv'));
  if (cv) { if (cv.right > W + 1 || cv.left < -1) out.push(`game screen cut off sideways (${Math.round(cv.left)}..${Math.round(cv.right)} of ${W})`); if (cv.width < Math.min(W, 640) * 0.55) out.push(`game screen small (${Math.round(cv.width)}x${Math.round(cv.height)})`); }
  const go = vis(document.querySelector('#ov:not([hidden]) .go'));
  if (go && (go.bottom > H + 1 || go.top < 0)) out.push(`start button off screen (top ${Math.round(go.top)}, bottom ${Math.round(go.bottom)} of ${H})`);
  const ov = document.querySelector('#ov:not([hidden])'); if (ov && ov.scrollWidth > ov.clientWidth + 2) out.push('overlay content wider than the screen');
  const pad = document.querySelector('.pad'); if (pad && getComputedStyle(pad).display !== 'none') { const r = pad.getBoundingClientRect(); if (r.bottom > H + 2) out.push(`touch pad below the screen (bottom ${Math.round(r.bottom)} of ${H})`); if (r.right > W + 2) out.push('touch pad cut off sideways'); }
  for (const el of document.querySelectorAll('.pad button, header.bar button, header.bar a')) { const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 2 || r.left < -2 || r.bottom > H + 2)) { out.push(`control off screen: ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}`); break; } }
  return out;
});
async function scanGame(g) {
  for (const vp of ['desk', 'phone', 'land', 'tab', 'small']) {
    const { p, c, errs } = await page(vp);
    try {
      await p.goto(`${BASE}/games/${g}/?feature=none&event=none`, { waitUntil: 'load' }); await p.waitForTimeout(1200);
      for (const x of await layout(p)) note(`${g} [${vp}] title`, x);
      if (vp === 'desk' || vp === 'phone') { // let the game play itself for a while
        await p.goto(`${BASE}/games/${g}/?feature=none&event=none&demo=1`); await p.waitForTimeout(9000);
        for (const x of await layout(p)) note(`${g} [${vp}] demo`, x);
      }
    } catch (e) { note(`${g} [${vp}]`, 'scan failed: ' + e.message.split('\n')[0]); }
    for (const e of [...new Set(errs)]) note(`${g} [${vp}]`, e);
    await c.close();
  }
}
async function scanLobby() {
  for (const vp of ['desk', 'phone', 'land', 'tab', 'small']) {
    for (const view of ['', '?view=scores', '?view=rewards', '?view=profile', '?view=floor']) {
      const { p, c, errs } = await page(vp);
      try {
        await p.goto(`${BASE}/${view || '?'}${view ? '&' : ''}feature=none&event=none`); await p.waitForTimeout(view === '?view=floor' ? 3500 : 2000);
        for (const x of await layout(p)) if (!/game screen/.test(x)) note(`lobby ${view || 'play'} [${vp}]`, x);
        if (!view) { // panels: prize counter, settings, messages
          for (const [btn, sel] of [['#vPrize', '.pc'], ['#tbMsg', '.ib']]) { await p.click(btn).catch(() => {}); await p.waitForTimeout(700); const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden) return 'did not open'; const pn = e.firstElementChild.getBoundingClientRect(); return pn.right > innerWidth + 1 || pn.bottom > innerHeight + 1 || pn.left < -1 || pn.top < -1 ? `panel off screen ${Math.round(pn.left)},${Math.round(pn.top)},${Math.round(pn.right)},${Math.round(pn.bottom)}` : ''; }, sel); if (r) note(`lobby ${sel} [${vp}]`, r); await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
        }
      } catch (e) { note(`lobby ${view} [${vp}]`, 'scan failed: ' + e.message.split('\n')[0]); }
      for (const e of [...new Set(errs)]) note(`lobby ${view || 'play'} [${vp}]`, e);
      await c.close();
    }
  }
}
const queue = [...games];
await Promise.all([...Array(+(process.argv[3] || 6))].map(async () => { while (queue.length) await scanGame(queue.shift()); }));
if (!only) await scanLobby();
console.log(issues.length ? issues.join('\n') : 'no issues');
await b.close();
