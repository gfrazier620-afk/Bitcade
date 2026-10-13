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

/* ---------- boot sequence ---------- */
console.log('\nBoot sequence');
{
  const { page, errors, close } = await open('/');
  const gone = ms => page.waitForSelector('#boot', { state: 'hidden', timeout: ms }).then(() => true, () => false);
  check(await page.isVisible('#boot'), 'the boot sequence plays on the first visit');
  const bios = await page.waitForFunction(() => /CPU/.test(document.getElementById('bootPost').textContent), null, { timeout: 4000 }).then(() => true, () => false);
  check(bios, 'the BIOS check types out');
  await page.keyboard.press('Space');
  check(await gone(1500), 'any key skips it');
  check(!(await page.evaluate(() => document.documentElement.classList.contains('booting'))), 'the lobby can scroll again afterwards');
  await page.reload();
  check(await page.isHidden('#boot'), 'it plays once per visit');
  await page.goto(BASE + '/?boot');
  check(await page.isVisible('#boot'), '?boot replays it');
  const titled = await page.waitForFunction(() => document.getElementById('boot').classList.contains('scene'), null, { timeout: 8000 }).then(() => true, () => false);
  await wait(3000);
  check(titled && !!(await page.$('#boot')), 'left alone, it waits on the title screen');
  await page.mouse.click(200, 200);
  check(await gone(1500), 'a click on the title opens the lobby');
  // a controller button works too
  await page.goto(BASE + '/?boot');
  await page.evaluate(() => { const gp = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }; Object.defineProperty(navigator, 'getGamepads', { value: () => [gp], configurable: true }); setTimeout(() => { gp.buttons[0].pressed = true; }, 300); });
  check(await gone(2500), 'a controller button skips it');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  // with reduced motion the animations are off, so everything must still be visible, and it ends quickly
  const calm = await open('/', { reducedMotion: 'reduce' });
  await calm.page.waitForFunction(() => document.getElementById('boot').classList.contains('scene'), null, { timeout: 3000 }).catch(() => {});
  const logoVisible = await calm.page.evaluate(() => { const l = document.querySelector('.boot-logo'); return !!l && getComputedStyle(l).opacity === '1'; });
  check(logoVisible, 'reduced motion: the title shows without animating');
  await calm.page.keyboard.press('Enter');
  check(await calm.page.waitForSelector('#boot', { state: 'hidden', timeout: 1500 }).then(() => true, () => false), 'reduced motion: a key opens the lobby');
  await calm.close();
}

/* ---------- attract mode ---------- */
console.log('\nAttract mode');
{
  const { page, errors, close } = await open('/');
  await page.evaluate(() => { sessionStorage.setItem('bitcade:booted', '1'); localStorage.setItem('arcade:best:stackdown', '4321'); });
  await page.goto(BASE + '/?idle=2');
  check(await page.isHidden('#boot'), 'no boot screen once this visit has booted');
  const came = await page.waitForFunction(() => document.getElementById('boot').classList.contains('attract') && !document.getElementById('boot').hidden, null, { timeout: 5000 }).then(() => true, () => false);
  check(came, 'after sitting idle, the title comes back (attract mode)');
  const hof = await page.waitForFunction(() => document.getElementById('boot').classList.contains('hof'), null, { timeout: 9000 }).then(() => true, () => false);
  check(hof && /STACKDOWN/.test(await page.textContent('#bootHof')) && /4,321/.test(await page.textContent('#bootHof')), 'then it shows a high-score screen');
  await page.keyboard.press('KeyA');
  check(await page.waitForSelector('#boot', { state: 'hidden', timeout: 1500 }).then(() => true, () => false), 'any key returns to the lobby');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- music and CRT ---------- */
console.log('\nMusic and CRT');
{
  const { page, errors, close } = await open('/games/swarm-strike/');
  const themes = await page.evaluate(() => {
    const a = JSON.stringify(Chip.theme('swarm-strike')), b = JSON.stringify(Chip.theme('swarm-strike')), c = JSON.stringify(Chip.theme('cube-hopper'));
    const s = Chip.theme('swarm-strike'); return { same: a === b, differ: a !== c, notes: s.lead.filter(Boolean).length, bpm: s.bpm };
  });
  check(themes.same && themes.differ && themes.notes > 20, `each game has its own theme, the same every time (${themes.notes} melody notes at ${themes.bpm} bpm)`);
  check(await page.isVisible('#music') && await page.isVisible('#crt'), 'MUSIC and CRT buttons sit next to SOUND');
  await page.keyboard.press('KeyM'); // a key press lets the browser start sound
  check(await page.waitForFunction(() => Chip.playing, null, { timeout: 3000 }).then(() => true, () => false), 'the title screen plays its theme');
  await page.click('#ov .go');
  check(await page.waitForFunction(() => !Chip.playing, null, { timeout: 2000 }).then(() => true, () => false), 'the music stops when the game starts');
  await page.keyboard.press('KeyP'); await page.click('#music');
  check((await page.textContent('#music')) === 'MUSIC OFF' && (await page.evaluate(() => localStorage.getItem('arcade:music'))) === '0', 'MUSIC OFF is remembered');
  await page.click('#crt');
  check(await page.evaluate(() => document.body.classList.contains('crt')), 'CRT ON turns on the scanline look');
  await page.reload();
  check(await page.evaluate(() => document.body.classList.contains('crt')) && (await page.textContent('#crt')) === 'CRT ON', 'CRT is remembered');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- every game ---------- */
const KEYS = ['ArrowUp', 'ArrowLeft', 'Space', 'ArrowRight', 'ArrowDown', 'KeyJ', 'KeyK', 'KeyW'];
for (const slug of dirs) {
  console.log(`\n${slug}`);
  const { page, errors, close } = await open(`/games/${slug}/`);
  const kit = await page.evaluate(() => !!document.getElementById('ov')); // kit games use the overlay; Blip Sports has its own shell
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
    // Blip Sports: its own handheld shell, with the shared kit underneath
    check(await page.evaluate(() => !!window.Arcade && Arcade.id === 'blip-sports'), 'the shared kit is loaded');
    await page.keyboard.press('Enter');
    await wait(400);
    check(/BALL ON|KICKOFF|BATTING/.test(await page.textContent('#ticker')), 'Enter kicks off a game');
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowUp', 'Space']) { await page.keyboard.press(k); await wait(150); }
    await page.keyboard.press('KeyP');
    check(/PAUSED/.test(await page.textContent('#ticker')), 'P pauses');
    await page.keyboard.press('KeyP');
    check(!/PAUSED/.test(await page.textContent('#ticker')), 'P resumes');
    await page.waitForFunction(() => /offline|No world/.test(document.getElementById('worldWins').textContent));
    check(true, 'world wins board falls back when offline');
    await page.click('#ini'); await page.keyboard.type('qz9x');
    check((await page.inputValue('#ini')) === 'QZX' && (await page.evaluate(() => localStorage.getItem('arcade:initials'))) === 'QZX', 'initials box keeps 3 capital letters, and typing in it does not steer the game');
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
  check(JSON.stringify(tabs) === '["WORLD","TODAY","THIS DEVICE","BADGES 0/3"]', `daily game's title screen has WORLD, TODAY, THIS DEVICE and BADGES tabs (${tabs.join(', ')})`);
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
  // The deploy copies a fixed list of files into _site; everything the service worker caches must be on it.
  const wf = await readFile(join(ROOT, '.github/workflows/site.yml'), 'utf8');
  const copied = ((wf.match(/cp -r (.+?) _site\//) || [])[1] || '').split(/\s+/);
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const needed = [...new Set(['index.html', 'sw.js', 'games', ...[...shell.matchAll(/'([^']*)'/g)].map(m => m[1]).filter(p => p !== './').map(p => p.split('/')[0])])];
  const notCopied = needed.filter(f => !copied.includes(f));
  check(!notCopied.length, `the deploy workflow publishes every file the app needs${notCopied.length ? ' (missing: ' + notCopied.join(', ') + ')' : ''}`);
  const pages = ['index.html', ...dirs.map(d => `games/${d}/index.html`)], unlinked = [];
  for (const p of pages) if (!/rel="manifest"/.test(await readFile(join(ROOT, p), 'utf8'))) unlinked.push(p);
  check(!unlinked.length, `every page links the manifest${unlinked.length ? ' (missing: ' + unlinked.join(', ') + ')' : ''}`);

  const ctx = await browser.newContext();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|gstatic\.com\/firebasejs|googleapis\.com/, r => r.abort());
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cacheName = sw.match(/VERSION = '([^']+)'/)[1];
  const cached = await page.waitForFunction(([name, n]) => caches.open(name).then(c => c.keys()).then(k => k.length >= n && k.length), [cacheName, swGames.length + 3], { timeout: 20000 }).then(h => h.jsonValue(), () => 0);
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

/* ---------- badges and sharing ---------- */
console.log('\nBadges and sharing');
{
  // every Arcade.badge('id') in a game exists in shared/badges.js, and every game has badges
  global.window = {}; await import(new URL('../shared/badges.js', import.meta.url)); const DEFS = global.window.BADGES; delete global.window;
  const missing = [], noBadges = dirs.filter(d => !(DEFS[d] && DEFS[d].length));
  for (const d of dirs) {
    const html = await readFile(join(ROOT, 'games', d, 'index.html'), 'utf8'), ids = (DEFS[d] || []).map(b => b.id);
    for (const m of html.matchAll(/A\.badge\('([a-z0-9]+)'\)/g)) if (!ids.includes(m[1])) missing.push(`${d}:${m[1]}`);
    for (const id of ids) if (!html.includes(`A.badge('${id}')`)) missing.push(`${d}:${id} is never unlocked`);
  }
  check(!noBadges.length, `every game has badges${noBadges.length ? ' (none for ' + noBadges.join(', ') + ')' : ''}`);
  check(!missing.length, `badge ids in the games match shared/badges.js${missing.length ? ' (' + missing.join(', ') + ')' : ''}`);

  const { page, errors, close } = await open('/games/neon-noodle/', { permissions: ['clipboard-read', 'clipboard-write'] });
  await page.evaluate(() => { delete Navigator.prototype.share; Arcade.badge('gem'); Arcade.badge('gem'); });
  check(await page.isVisible('.arcade-toast'), 'unlocking a badge shows a toast');
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:badges:neon-noodle')))).join() === 'gem', 'the badge is saved once');
  await page.keyboard.press('ArrowLeft'); // WORLD → BADGES (tabs wrap around)
  check(/BADGES 1\/3/.test(await page.textContent('#ov .hs-tabs .on')), 'the title screen has a BADGES 1/3 tab');
  await page.evaluate(() => { Arcade.submit(4321); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  check(await page.isHidden('#ov .share'), 'Share waits until initials are saved');
  await page.keyboard.type('SHR'); await page.keyboard.press('Enter');
  await page.click('#ov .share');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(/4,321 on Neon Noodle/.test(clip) && /games\/neon-noodle\//.test(clip), `Share copies the score and a link ("${clip.slice(0, 60)}…")`);
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();

  const lobby = await open('/');
  await lobby.page.evaluate(() => localStorage.setItem('arcade:badges:wallbuster', '["clear"]'));
  await lobby.page.reload();
  check(/BADGES 1\/\d+/.test(await lobby.page.textContent('#stats')), 'the lobby counts badges');
  check((await lobby.page.textContent('.cab[href="games/wallbuster/"] .bd')).includes('1/3'), 'each cabinet shows its badges');
  await lobby.close();
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
