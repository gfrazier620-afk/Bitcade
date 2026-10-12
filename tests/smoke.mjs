/*
 * Smoke tests: serve the repo, open the lobby and every game in headless Chromium, and fail on
 * page errors, console errors, broken cabinets, or a start/pause/score flow that doesn't work.
 *
 *   npm install && npm test
 *
 * Locally it uses an installed Chrome or Edge. CI installs Chromium (see .github/workflows/site.yml).
 */
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/* ---------- tiny static server ---------- */
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.includes('..')) { res.writeHead(400).end(); return; }
  let file = join(ROOT, path);
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* ---------- browser ---------- */
async function launch() {
  const tries = [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  for (const opts of tries) { try { return await chromium.launch(opts); } catch (e) { /* try the next one */ } }
  throw new Error('No Chromium found. Run "npx playwright-core install chromium", or install Chrome or Edge.');
}
const browser = await launch();

const failures = [];
let checks = 0;
const check = (ok, what) => { checks++; if (!ok) failures.push(what); console.log(`${ok ? '  ok ' : 'FAIL '} ${what}`); };

/** Open a page and record errors. Google Fonts may be unreachable in CI, so failed requests to it are ignored. */
async function open(path, opts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...opts }); // the offline section below turns it back on
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // The world leaderboard is never contacted from tests: pages must work with Firebase unreachable.
  await page.route(/gstatic\.com\/firebasejs|googleapis\.com/, r => r.abort());
  await page.goto(BASE + path);
  return { page, errors, close: () => ctx.close() };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------- lobby ---------- */
const dirs = (await readdir(join(ROOT, 'games'), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
console.log('\nLobby');
{
  const { page, errors, close } = await open('/');
  const slugs = await page.$$eval('.cab', as => as.map(a => a.getAttribute('href').replace(/^games\/|\/$/g, '')));
  check(slugs.length === dirs.length, `lobby lists ${slugs.length} cabinets for ${dirs.length} game folders`);
  check(JSON.stringify([...slugs].sort()) === JSON.stringify(dirs), 'every cabinet links to a game folder and every folder has a cabinet');
  const tag = (await page.textContent('.tag')).trim();
  const WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN', 'TWENTY'];
  check(tag.startsWith(WORDS[slugs.length] + ' '), `lobby tagline says ${WORDS[slugs.length]} games ("${tag}")`);
  await wait(1200); // let the cabinet animation tick
  check(!errors.length, `lobby has no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- every game ---------- */
const KEYS = ['ArrowUp', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowDown', 'KeyJ', 'KeyK', 'KeyW'];
for (const slug of dirs) {
  console.log(`\n${slug}`);
  const { page, errors, close } = await open(`/games/${slug}/`);
  const kit = await page.evaluate(() => !!window.Arcade);
  if (kit) {
    check(await page.isVisible('#ov .go'), 'title screen shows a start button');
    check((await page.getAttribute('body', 'data-game')) === slug, 'body data-game matches the folder name');
    await page.click('#ov .go');
    check(await page.isHidden('#ov'), 'start button starts the game');
    // Pause right away: after random input the player may be mid-death, when pausing is (correctly) ignored.
    await page.keyboard.press('KeyP');
    check((await page.textContent('#ov h2')) === 'PAUSED', 'P pauses');
    await page.keyboard.press('Enter');
    check(await page.isHidden('#ov'), 'Enter resumes');
    for (const k of KEYS) { await page.keyboard.down(k); await wait(120); await page.keyboard.up(k); }
    await wait(800);
  } else {
    // Blip Sports: its own handheld shell
    await page.keyboard.press('Enter');
    await wait(400);
    check(/BALL ON|KICKOFF|BATTING/.test(await page.textContent('#ticker')), 'Enter kicks off a game');
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowUp', 'Space']) { await page.keyboard.press(k); await wait(150); }
  }
  // the canvas actually draws something
  const painted = await page.evaluate(() => {
    const c = document.querySelector('canvas#cv') || document.querySelector('canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 60) return true;
    return false;
  });
  check(painted, 'canvas is drawing');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- shared kit: top-10 table and initials ---------- */
console.log('\nScore table');
{
  const { page, errors, close } = await open('/games/neon-noodle/');
  await page.evaluate(() => { Arcade.submit(500); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  check(await page.isVisible('#ov .ini'), 'a top-10 score asks for initials');
  await page.keyboard.type('ABC'); await page.keyboard.press('Enter');
  const table = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:top:neon-noodle')));
  check(table && table[0].n === 'ABC' && table[0].s === 500, 'typed initials are saved with the score');
  check((await page.textContent('#ov .go')) === 'Play again', 'after saving, the button goes back to Play again');
  await page.waitForFunction(() => /offline/.test(document.querySelector('#ov .hs').textContent));
  check(await page.isVisible('#ov .hs-table'), 'with the world board offline, the table falls back to this device');
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:outbox') || '[]'));
  check(queued.length === 1 && queued[0].n === 'ABC' && queued[0].g === 'neon-noodle', 'the score is queued to post to the world board later');
  await page.keyboard.press('ArrowRight');
  check((await page.textContent('#ov .hs-tabs .on')) === 'THIS DEVICE', '→ switches to the This device tab');
  await page.evaluate(() => { Arcade.submit(900); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  await page.keyboard.press('Enter');
  const t2 = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:top:neon-noodle')));
  check(t2.length === 2 && t2[0].s === 900 && t2[1].s === 500, 'a higher score goes to the top and the table stays sorted');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- daily challenge: TODAY tab ---------- */
console.log('\nDaily boards');
{
  const { page, errors, close } = await open('/games/stackdown/');
  const tabs = await page.$$eval('#ov .hs-tabs button', bs => bs.map(b => b.textContent));
  check(JSON.stringify(tabs) === '["WORLD","TODAY","THIS DEVICE"]', `daily game's title screen has WORLD, TODAY and THIS DEVICE tabs (${tabs.join(', ')})`);
  await page.click('#ov .go2'); // Daily
  await page.evaluate(() => { Arcade.submit(321, true); Arcade.overlay({ title: 'TOPPED OUT', btn: 'Retry daily', daily: true, onGo: () => {} }); });
  check(await page.isVisible('#ov .ini'), 'a daily best asks for initials');
  await page.keyboard.type('DAY'); await page.keyboard.press('Enter');
  check((await page.textContent('#ov .hs-tabs .on')) === 'TODAY', 'after a daily run the TODAY tab is selected');
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:outbox') || '[]'));
  check(q.length === 1 && q[0].d === await page.evaluate(() => Arcade.today()) && q[0].all === true, 'the run is queued for both the all-time and today\'s board');
  await page.evaluate(() => { Arcade.submit(100, true); Arcade.overlay({ title: 'TOPPED OUT', btn: 'Retry daily', daily: true, onGo: () => {} }); });
  await page.keyboard.press('Enter'); // still makes this device's top 10, so it's saved for the all-time board
  const q2 = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:outbox') || '[]'));
  check(q2.length === 2 && !q2[1].d, 'a lower daily score isn\'t sent to today\'s board again');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const plain = await open('/games/neon-noodle/');
  const t2 = await plain.page.$$eval('#ov .hs-tabs button', bs => bs.map(b => b.textContent));
  check(!t2.includes('TODAY'), 'games without a daily challenge have no TODAY tab');
  await plain.close();
}

/* ---------- install + offline ---------- */
console.log('\nInstall and offline');
{
  const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.json'), 'utf8'));
  for (const icon of manifest.icons) {
    const buf = await readFile(join(ROOT, icon.src)), [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    check(buf.toString('ascii', 1, 4) === 'PNG' && icon.sizes === `${w}x${h}`, `manifest icon ${icon.src} is a ${icon.sizes} PNG`);
  }
  check(manifest.icons.some(i => i.purpose === 'maskable') && manifest.display === 'standalone', 'manifest has a maskable icon and opens standalone');
  const sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const swGames = JSON.parse(sw.match(/const GAMES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  check(JSON.stringify([...swGames].sort()) === JSON.stringify(dirs), 'sw.js caches every game folder');
  const pages = ['index.html', ...dirs.map(d => `games/${d}/index.html`)], unlinked = [];
  for (const p of pages) if (!/rel="manifest"/.test(await readFile(join(ROOT, p), 'utf8'))) unlinked.push(p);
  check(!unlinked.length, `every page links the manifest${unlinked.length ? ' (missing: ' + unlinked.join(', ') + ')' : ''}`);

  const ctx = await browser.newContext();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|gstatic\.com\/firebasejs|googleapis\.com/, r => r.abort());
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.waitForFunction(n => caches.open('bitcade-v1').then(c => c.keys()).then(k => k.length >= n && k.length), swGames.length + 3, { timeout: 20000 }).then(h => h.jsonValue(), () => 0);
  check(cached >= swGames.length + 3, `service worker cached the lobby and all ${swGames.length} games (${cached} files)`);
  await ctx.setOffline(true);
  await page.reload();
  check((await page.$$('.cab')).length === dirs.length, 'offline: the lobby still loads with every cabinet');
  await page.goto(BASE + '/games/hedge-hop/');
  await page.click('#ov .go');
  await page.keyboard.press('ArrowUp'); await wait(500);
  check(await page.isHidden('#ov'), 'offline: a game loads and starts');
  await page.goto(BASE + '/games/blip-sports/');
  check(await page.isVisible('#ticker'), 'offline: Blip Sports loads');
  check(!errors.length, `offline: no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

/* ---------- phones: pause button and touch pad ---------- */
console.log('\nPhone layout');
{
  const { page, errors, close } = await open('/games/star-siege/', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  check(await page.isVisible('.bar .pause'), 'header PAUSE button shows on a touch screen');
  check(await page.isVisible('.pad'), 'touch pad shows on a touch screen');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no sideways scrolling at phone width');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

await browser.close(); server.close();
console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) { console.log('\nFailed:\n- ' + failures.join('\n- ')); process.exit(1); }
