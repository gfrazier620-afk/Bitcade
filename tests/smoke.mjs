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
  // Seasonal events (window.EVENT) follow the calendar; tests run without one unless the URL asks (?event=halloween).
  await page.addInitScript(() => { try { if (!/[?&]event=/.test(location.search)) sessionStorage.setItem('bitcade:event', 'none'); } catch (e) {} });
  // New players make a profile first (shared/setup.js); tests skip it unless the URL says ?newplayer.
  await page.addInitScript(() => { try { if (!/[?&]newplayer/.test(location.search)) sessionStorage.setItem('bitcade:nosetup', '1'); else sessionStorage.removeItem('bitcade:nosetup'); } catch (e) {} });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // The world leaderboard is never contacted from tests: pages must work with Firebase unreachable.
  await page.route(/gstatic\.com\/firebasejs|googleapis\.com/, r => r.abort());
  // The weekly tournament game changes every Monday; pages get ?feature=none (no featured game) unless a test picks one.
  await page.goto(BASE + path + (/feature=/.test(path) ? '' : (path.includes('?') ? '&' : '?') + 'feature=none'));
  return { page, errors, close: () => ctx.close() };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
/** Get past the lobby's boot sequence: keys power it on, skip the BIOS and the flight, put a coin in and hurry the doors. */
async function skipBoot(page) {
  for (let i = 0; i < 6 && await page.isVisible('#boot'); i++) { await page.keyboard.press('KeyX'); await wait(350); }
  await page.waitForSelector('#boot', { state: 'hidden' });
}

/* ---------- lobby ---------- */
const dirs = (await readdir(join(ROOT, 'games'), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
console.log('\nLobby');
{
  const { page, errors, close } = await open('/');
  const slugs = await page.$$eval('.cab', as => as.map(a => a.getAttribute('href').replace(/^games\/|\/$/g, '')));
  check(slugs.length === dirs.length, `lobby lists ${slugs.length} cabinets for ${dirs.length} game folders`);
  check(JSON.stringify([...slugs].sort()) === JSON.stringify(dirs), 'every cabinet links to a game folder and every folder has a cabinet');
  const tag = (await page.textContent('.tag')).trim();
  const WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN', 'TWENTY', 'TWENTY-ONE', 'TWENTY-TWO', 'TWENTY-THREE', 'TWENTY-FOUR', 'TWENTY-FIVE', 'TWENTY-SIX', 'TWENTY-SEVEN', 'TWENTY-EIGHT', 'TWENTY-NINE', 'THIRTY', 'THIRTY-ONE', 'THIRTY-TWO', 'THIRTY-THREE', 'THIRTY-FOUR', 'THIRTY-FIVE', 'THIRTY-SIX', 'THIRTY-SEVEN', 'THIRTY-EIGHT', 'THIRTY-NINE', 'FORTY', 'FORTY-ONE', 'FORTY-TWO', 'FORTY-THREE', 'FORTY-FOUR', 'FORTY-FIVE', 'FORTY-SIX', 'FORTY-SEVEN', 'FORTY-EIGHT'];
  check(tag.startsWith(WORDS[slugs.length] + ' '), `lobby tagline says ${WORDS[slugs.length]} games ("${tag}")`);
  // the lobby header once picked up the game cabinet's .marquee styles (a short, clipped box) and cut the logo off
  const logo = await page.evaluate(() => { const L = document.querySelector('.logo'), H = document.querySelector('.topbar'), l = L.getBoundingClientRect(), h = H.getBoundingClientRect(); return { top: l.top, headerTall: h.height > l.height, clipped: getComputedStyle(H).overflow === 'hidden' }; });
  check(logo.top >= 0 && logo.headerTall && !logo.clipped, 'the BITCADE logo is fully visible (not clipped by game-page styles)');
  await wait(1200); // let the cabinet animation tick
  check(!errors.length, `lobby has no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- boot sequence ---------- */
console.log('\nBoot sequence');
{
  const { page, errors, close } = await open('/');
  const gone = ms => page.waitForSelector('#boot', { state: 'hidden', timeout: ms }).then(() => true, () => false);
  const cls = c => page.evaluate(c => document.getElementById('boot').classList.contains(c), c);
  const until = (c, ms) => page.waitForFunction(c => document.getElementById('boot').classList.contains(c), c, { timeout: ms }).then(() => true, () => false);
  check(await page.isVisible('#boot') && await cls('gate'), 'the boot sequence plays on the first visit, starting at the power switch');
  await wait(600);
  check(await cls('gate') && !(await page.textContent('#bootPost')).trim(), 'it waits at the power switch');
  await page.keyboard.press('Space');
  const bios = await page.waitForFunction(() => /CPU/.test(document.getElementById('bootPost').textContent), null, { timeout: 4000 }).then(() => true, () => false);
  check(bios, 'a key powers it on and the BIOS check types out');
  await page.keyboard.press('Space');
  check(await until('scene', 1500) && !(await cls('slam')), 'a key skips the BIOS to the flight over the grid');
  await wait(300);
  const drawn = await page.evaluate(() => { const c = document.getElementById('bootCv'); return c.width > 0 && c.getContext('2d').getImageData(c.width / 2, c.height * 0.8, 1, 1).data[3] > 0; });
  check(drawn, 'the flight draws on its canvas');
  await page.keyboard.press('Space');
  check(await until('slam', 1500), 'a key lands the logo');
  await page.keyboard.press('Space');
  check(await until('coined', 1500), 'a key on the title puts a coin in');
  check(await until('shut', 3000), 'the doors shut');
  check(await page.waitForFunction(() => document.querySelectorAll('.door.l .ds-word span.lit').length === 7, null, { timeout: 3000 }).then(() => true, () => false), 'the sign lights letter by letter');
  check(await gone(4000), 'the doors open on the lobby');
  check(!(await page.evaluate(() => document.documentElement.classList.contains('booting'))), 'the lobby can scroll again afterwards');
  await page.reload();
  check(await page.isHidden('#boot'), 'it plays once per visit');
  await page.goto(BASE + '/?boot');
  check(await page.isVisible('#boot'), '?boot replays it');
  await page.mouse.click(200, 200);
  const titled = await until('slam', 15000);
  await wait(1500);
  check(titled && await page.isVisible('#boot'), 'left alone after power-on, it flies in, lands the logo and waits on the title');
  await page.mouse.click(200, 200); await wait(300); await page.mouse.click(200, 200);
  check(await gone(1500), 'a click puts a coin in, and another hurries it into the lobby');
  // a controller button works too
  await page.goto(BASE + '/?boot');
  await page.evaluate(() => { const gp = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }; Object.defineProperty(navigator, 'getGamepads', { value: () => [gp], configurable: true }); setInterval(() => { gp.buttons[0].pressed = !gp.buttons[0].pressed; }, 300); });
  check(await gone(8000), 'controller buttons work through it');
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
  check(await page.waitForSelector('#boot', { state: 'hidden', timeout: 6000 }).then(() => true, () => false), 'any key returns to the lobby (coin, doors)');
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
  check(await page.isVisible('#settings') && /SETTINGS/.test(await page.textContent('#settings')), 'the header has a SETTINGS button');
  check(await page.evaluate(() => document.body.classList.contains('crt-lite')), 'the light CRT look is on by default');
  await page.keyboard.press('KeyM'); // a key press lets the browser start sound
  check(await page.waitForFunction(() => Chip.playing, null, { timeout: 3000 }).then(() => true, () => false), 'the title screen plays its theme');
  await page.click('#ov .go');
  await wait(800);
  check(await page.evaluate(() => Chip.playing && Chip.level < 0.5), 'the music keeps playing through the game, a little quieter');
  await page.click('#settings'); await page.waitForSelector('.set-panel');
  check(/PAUSED/.test(await page.textContent('#ov')), 'opening settings mid-game pauses it');
  check(await page.isVisible('[data-key="arcade:crt"] [data-v="lite"][aria-checked="true"]'), 'the settings panel shows the CRT look on LITE');
  await page.click('#setMusic');
  check((await page.getAttribute('#setMusic', 'aria-checked')) === 'false' && (await page.evaluate(() => localStorage.getItem('arcade:music'))) === '0' && await page.waitForFunction(() => !Chip.playing, null, { timeout: 2000 }).then(() => true, () => false), 'turning music off stops it, and is remembered');
  await page.click('[data-key="arcade:crt"] [data-v="1"]');
  check(await page.evaluate(() => document.body.classList.contains('crt')), 'CRT goes FULL');
  await page.locator('[data-vol="arcade:vol:sfx"]').fill('40'); await page.click('[data-key="arcade:shake"] [data-v="0"]');
  check(await page.evaluate(() => localStorage.getItem('arcade:vol:sfx') === '40' && localStorage.getItem('arcade:shake') === '0'), 'effects volume and screen shake are saved');
  await page.keyboard.press('Escape');
  check(await page.isHidden('.set') && /PAUSED/.test(await page.textContent('#ov')), 'Escape closes settings and leaves the game paused');
  await page.reload();
  check(await page.evaluate(() => document.body.classList.contains('crt')), 'CRT is remembered');
  await page.click('#settings'); await page.click('[data-key="arcade:crt"] [data-v="0"]');
  check(await page.evaluate(() => !document.body.classList.contains('crt') && !document.body.classList.contains('crt-lite')), 'and can be turned OFF');
  check((await page.$$('.set-key')).length >= 3, 'games list their controls to remap');
  await page.click('[data-bind="Space"]'); await page.keyboard.press('KeyK');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:keys:swarm-strike')).KeyK === 'Space'), 'pressing a key gives that control a key of your own');
  await page.keyboard.press('Escape'); await page.click('#ov .go'); await wait(200);
  await page.keyboard.down('KeyK');
  check(await page.evaluate(() => Arcade.held('Space')), 'and that key then works in the game');
  await page.keyboard.up('KeyK');
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
  for (const slug of ['wallbuster', 'stackdown', 'twin-blast', 'mole-patrol', 'wing-duel']) {
    const g = await open(`/games/${slug}/`);
    const btns = await g.page.$$eval('#ov .btns button', bs => bs.map(b => b.textContent));
    const t = await g.page.$$eval('#ov .hs-tabs button', bs => bs.map(b => b.textContent));
    check(btns.includes('Daily') && t.includes('TODAY'), `${slug} offers a Daily run and a TODAY board (${btns.join(', ')})`);
    await g.close();
  }
}

/* ---------- weekly tournament ---------- */
console.log('\nWeekly tournament');
{
  global.window = {}; global.location = { search: '' };
  await import(new URL('../shared/badges.js?weekly', import.meta.url)); const WK = global.window.WEEKLY; delete global.window; delete global.location;
  const notIn = dirs.filter(d => d !== 'blip-sports' && !WK.rotation.includes(d)), extra = WK.rotation.filter(d => !dirs.includes(d));
  check(!notIn.length && !extra.length, `the tournament rotation covers every score game${notIn.length ? ' (missing: ' + notIn.join(', ') + ')' : ''}${extra.length ? ' (no folder: ' + extra.join(', ') + ')' : ''}`);
  const mon = Date.UTC(2026, 9, 12, 0, 0, 1); // a Monday
  check(WK.key(mon) === '2026-10-12' && WK.key(mon + 6.9 * 864e5) === '2026-10-12' && WK.key(mon + 7 * 864e5) === '2026-10-19', 'tournament weeks run Monday to Monday (UTC)');
  check(WK.game(mon) !== WK.game(mon + 7 * 864e5), 'next week features a different game');

  const { page, errors, close } = await open('/games/neon-noodle/?feature=neon-noodle');
  check(/WEEKLY TOURNAMENT · ENDS IN/.test(await page.textContent('#ov .weekly')), 'the featured game\'s title screen shows the tournament banner');
  const tabs = await page.$$eval('#ov .hs-tabs button', bs => bs.map(b => b.textContent));
  check(tabs.includes('THIS WEEK'), `the featured game has a THIS WEEK board (${tabs.join(', ')})`);
  await page.evaluate(() => { Arcade.submit(700); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  await page.keyboard.type('WKY'); await page.keyboard.press('Enter');
  check((await page.textContent('#ov .hs-tabs .on')) === 'THIS WEEK', 'after a run the THIS WEEK tab is selected');
  const week = await page.evaluate(() => Arcade.week());
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:outbox') || '[]'));
  check(q.length === 1 && q[0].w === week && q[0].all === true, 'the run is queued for both the all-time and this week\'s board');
  await page.evaluate(() => { localStorage.setItem('arcade:top:neon-noodle', JSON.stringify(Array.from({ length: 10 }, () => ({ n: 'TOP', s: 9999 })))); Arcade.submit(800); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  check(/THIS WEEK'S BEST/.test(await page.textContent('#ov .hs')), 'a weekly best that misses the top 10 still asks for initials');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { Arcade.submit(100); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  const q2 = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade:outbox') || '[]'));
  check(q2.length === 2 && q2[1].w === week && q2[1].all === false && !(await page.isVisible('#ov .ini')), 'a lower score this week isn\'t sent again');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const other = await open('/games/neon-noodle/?feature=stackdown');
  check(!(await other.page.isVisible('#ov .weekly')) && !(await other.page.$$eval('#ov .hs-tabs button', bs => bs.map(b => b.textContent))).includes('THIS WEEK'), 'other games have no banner or THIS WEEK board');
  await other.close();
  const lobby = await open('/?feature=twin-blast');
  check(await lobby.page.isVisible('#tourney') && (await lobby.page.textContent('#tourney h2')) === 'Twin Blast', 'the lobby shows this week\'s tournament banner');
  check(await lobby.page.$eval('#tourney', a => a.getAttribute('href')) === 'games/twin-blast/' && await lobby.page.isVisible('.tile.feat[href="games/twin-blast/"]'), 'the banner links to the featured cabinet, which wears the THIS WEEK ribbon');
  await lobby.page.waitForFunction(() => /Offline/.test(document.querySelector('#tourney .t-top').textContent));
  check(true, 'with the world board offline, the banner says so');
  check(!lobby.errors.length, `no errors${lobby.errors.length ? ': ' + lobby.errors.join(' | ') : ''}`);
  await lobby.close();
}

/* ---------- tickets, prize counter and the arcade floor ---------- */
console.log('\nTickets and prizes');
{
  const { page, errors, close } = await open('/games/neon-noodle/');
  check(await page.evaluate(() => TICKETS.balance()) === 20, 'a new player starts with 20 tickets');
  await page.evaluate(() => { Arcade.submit(300); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  check(/\+4 TICKETS/.test(await page.textContent('#ov .tix')) && await page.evaluate(() => TICKETS.balance()) === 24, 'a first top-10 score pays 4 tickets, shown on game over');
  check(!(await page.isVisible('#ov .home')), 'HOME waits while you type your initials');
  await page.keyboard.press('Enter');
  check(await page.isVisible('#ov .home') && await page.isVisible('#ov .go'), 'game over offers PLAY AGAIN and HOME');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { Arcade.submit(900); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  check(await page.evaluate(() => TICKETS.balance()) === 24 + 11, 'a new #1 and a new record pay 11');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { XP.add(55); Arcade.submit(50); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  check(await page.isVisible('#ov .rsum .tix') && await page.isVisible('#ov .rsum .xpbar') && !(await page.isVisible('.arcade-toast')), 'game over sums up the run in one block, with no toasts on top');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { Arcade.toast('ONE'); Arcade.toast('TWO'); Arcade.toast('TWO'); });
  check(await page.evaluate(() => document.querySelectorAll('.arcade-toast').length) === 1, 'toasts show one at a time');
  check(await page.waitForFunction(() => [...document.querySelectorAll('.arcade-toast')].some(t => t.textContent === 'TWO'), null, { timeout: 5000 }).then(() => true, () => false), 'and the next one follows');
  await wait(3200);
  const tb = await page.evaluate(() => TICKETS.balance());
  await page.evaluate(() => Arcade.badge('gem'));
  check(await page.evaluate(() => TICKETS.balance()) === tb + 10, 'a badge pays 10 tickets');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const wk = await open('/games/neon-noodle/?feature=neon-noodle');
  await wk.page.evaluate(() => { Arcade.submit(300); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  check(/\+8 TICKETS · DOUBLE THIS WEEK/.test(await wk.page.textContent('#ov .tix')), 'tickets are doubled on the weekly tournament game');
  await wk.close();

  const lobby = await open('/');
  await skipBoot(lobby.page);
  check((await lobby.page.textContent('#tixN')) === '20', 'the lobby shows the ticket balance');
  await lobby.page.click('#vPrize');
  check(await lobby.page.isVisible('.pc') && await lobby.page.isDisabled('.pc-item[data-id="gold"] button'), 'the prize counter opens, and prizes you can\'t afford are greyed out');
  check(await lobby.page.isDisabled('.pc-item[data-id="cap"] button') && await lobby.page.evaluate(() => !Prizes.buy('cap') && TICKETS.balance() === 20), 'buying needs enough tickets');
  await lobby.page.evaluate(() => TICKETS.add(200)); await lobby.page.keyboard.press('Escape'); await lobby.page.click('#vPrize');
  await lobby.page.click('.pc-item[data-id="amber"] button');
  check(await lobby.page.evaluate(() => Prizes.has('amber') && Prizes.equipped().tint === 'amber' && TICKETS.balance() === 160), 'buying a prize spends its tickets and puts it on');
  check((await lobby.page.textContent('#tixN')) === '160', 'the lobby balance updates');
  await lobby.page.click('.pc-item[data-id="amber"] button');
  check(await lobby.page.evaluate(() => !Prizes.equipped().tint), 'pressing WEARING takes it off again');
  await lobby.page.click('.pc-item[data-id="amber"] button'); await lobby.page.keyboard.press('Escape');
  check(!(await lobby.page.isVisible('.pc')), 'Escape closes the counter');
  check(!lobby.errors.length, `no errors${lobby.errors.length ? ': ' + lobby.errors.join(' | ') : ''}`);
  // the tint follows you into the games
  await lobby.page.goto(BASE + '/games/rock-rift/?feature=none');
  check(await lobby.page.evaluate(() => document.body.classList.contains('tint-amber')), 'a game page wears the tint bought at the counter');
  await lobby.close();
}

console.log('\nArcade floor');
{
  const { page, errors, close } = await open('/');
  await skipBoot(page);
  check(await page.isVisible('#shelves') && !(await page.isVisible('#arcadeFloor')), 'the lobby opens on the cabinet shelves');
  check(await page.evaluate(() => { const ids = [...document.querySelectorAll('.shelf')].map(s => s.dataset.shelf); return ids.includes('picked') && !ids.includes('untried') && !ids.includes('daily') && !ids.includes('fav') && ids.indexOf('new') < ids.indexOf('picked'); }), 'shelves: New arrivals, then Picked for you; no empty Favorites, Not tried or Daily shelves');
  check(await page.evaluate(() => !!document.querySelector('.tile[href="games/stackdown/"] .tags .tg-daily') && !!document.querySelector('.tile[href="games/dungeon-delve/"] .tags .tg-story')), 'daily and story games are tagged on their tiles');
  check(await page.evaluate(() => document.querySelectorAll('#missions .ms-col:not(.wk) .ms').length === 3 && document.querySelectorAll('#missions .ms-col.wk .ms').length === 3), 'the lobby has three daily and three weekly missions');
  check(/LEVEL/.test(await page.textContent('#lvl')) && await page.evaluate(() => XP.info().level >= 1), 'the lobby shows your level and XP');
  check(await page.isVisible('#quests') && /LV\s*\d/.test(await page.textContent('#todayCard')) && await page.$$eval('#qCols .ms', b => b.filter(x => x.offsetParent).length) >= 3 && /WEEKLY MISSIONS/.test(await page.textContent('#qCols')), 'PLAY shows the missions board: level and pass, then daily and weekly missions');
  check(await page.evaluate(() => { const m = MISSIONS.week(); return m.length === 3 && new Set(m.map(x => x.kind)).size === 3 && m.every(x => MISSIONS.text(x) !== 'Mission') && /^\d+[DH] \d+/.test(MISSIONS.wleft()); }), 'this week has three different weekly missions and a countdown');
  await page.click('#todayCard');
  check(await page.isVisible('#rewardsView') && await page.isVisible('#missions') && await page.isVisible('#lvl') && !(await page.isVisible('#cabs')) && (await page.getAttribute('#vRewards', 'aria-pressed')) === 'true', 'the Today card opens REWARDS: level, pass and missions');
  await page.click('#vScores');
  check(await page.isVisible('#scoresView') && (await page.$$('.sv-row')).length === dirs.length, 'SCORES lists every cabinet');
  await page.evaluate(() => { localStorage.setItem('arcade:top:stackdown', JSON.stringify([{ n: 'ABC', s: 1234 }])); localStorage.setItem('arcade:best:stackdown', '1234'); }); await page.click('#vGrid'); await page.click('#vScores');
  check(/1,234/.test(await page.textContent('.sv-row[data-slug="stackdown"] .sv-mine')), 'it shows your best for each game');
  await page.click('.sv-row[data-slug="stackdown"] .sv-top');
  check(await page.isVisible('.sv-row[data-slug="stackdown"] .sv-detail') && (await page.$$eval('.sv-row[data-slug="stackdown"] [data-board]', b => b.map(x => x.textContent))).join() === 'WORLD,TODAY,THIS DEVICE', 'tapping a game opens its top 10, with WORLD, TODAY (daily games) and THIS DEVICE');
  await page.click('.sv-row[data-slug="stackdown"] [data-board="local"]');
  check(/ABC/.test(await page.textContent('.sv-row[data-slug="stackdown"] .sv-table')), 'THIS DEVICE lists the scores saved here');
  await page.keyboard.press('/');
  check(await page.isVisible('#cabs') && await page.evaluate(() => document.activeElement.id === 'cabQ'), '"/" jumps to the cabinet search from any section');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#cabQ')), 'Escape closes the search');
  await page.evaluate(() => { localStorage.setItem('arcade:best:wallbuster', '777'); localStorage.setItem('arcade:badges:wallbuster', '["clear"]'); });
  await page.click('#setBtn');
  check(await page.isVisible('.set-wipe') && !/cloud save/.test(await page.textContent('.set-panel')), 'the lobby settings have a high-score reset (this device only, with no cloud save)');
  await page.click('.set-wipe');
  check(/TAP AGAIN/.test(await page.textContent('.set-wipe')) && await page.evaluate(() => localStorage.getItem('arcade:best:wallbuster')) === '777', 'it asks for a second tap first');
  await Promise.all([page.waitForEvent('load'), page.click('.set-wipe')]); await skipBoot(page);
  check(await page.evaluate(() => !localStorage.getItem('arcade:best:wallbuster') && !!localStorage.getItem('arcade:badges:wallbuster') && +localStorage.getItem('arcade:scores:reset') > 0), 'resetting clears the scores (badges stay) and stamps the reset for cloud save');
  check(!(await page.isVisible('#reset')), 'the footer no longer has a reset button');
  await page.click('#vFloor');
  await page.waitForFunction(() => window.Floor && Floor.state(), null, { timeout: 5000 }); // the floor loads when it's first needed
  check(await page.isVisible('#arcadeFloor') && !(await page.isVisible('#cabs')), 'WALK THE ARCADE shows the floor');
  const y0 = await page.evaluate(() => Floor.state().y);
  await page.keyboard.down('ArrowUp'); await wait(400); await page.keyboard.up('ArrowUp');
  check(await page.evaluate(() => Floor.state().y) < y0 - 20, 'the arrow keys walk');
  const dirsOnFloor = await page.evaluate(() => { const s = []; for (const g of ['neon-noodle', 'blip-sports', 'mole-patrol']) { Floor.goTo(g); s.push(g); } return s; });
  await page.evaluate(() => Floor.goTo('hedge-hop')); await wait(150);
  check((await page.evaluate(() => Floor.state().near)) === 'hedge-hop' && /Hedge Hop/.test(await page.textContent('#floorCard')), 'standing at a cabinet shows its card');
  await page.evaluate(() => Floor.goTo('counter')); await wait(150);
  await page.keyboard.press('Enter');
  check(await page.isVisible('.pc'), 'Enter at the prize counter opens it');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => Floor.state().people) > 0, 'other arcade-goers walk the floor');
  await page.evaluate(() => Floor.goTo('claw')); await wait(150); await page.keyboard.press('Enter'); await wait(150);
  check((await page.evaluate(() => Floor.state().mode)) === 'claw', 'Enter at the Mega Claw opens it');
  await page.keyboard.press('Escape'); await wait(100);
  await page.evaluate(() => Floor.goTo('jukebox')); await wait(150); await page.keyboard.press('Enter'); await wait(150);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await wait(100);
  check((await page.evaluate(() => Floor.state().mode)) === 'jukebox' && !!(await page.evaluate(() => localStorage.getItem('bitcade:jukebox'))), 'the jukebox picks a game theme for the lobby');
  await page.keyboard.press('Escape'); await wait(100);
  check((await page.evaluate(() => Floor.state().mode)) === null, 'Escape closes it');
  for (const m of ['skee', 'pinball', 'hockey', 'golf']) {
    await page.evaluate(m => Floor.goTo(m), m); await wait(150); await page.keyboard.press('Enter'); await wait(150);
    check((await page.evaluate(() => Floor.state().mode)) === m, `the ${{ skee: 'skee-ball lanes', pinball: 'pinball machines', hockey: 'air hockey table', golf: 'mini-golf course' }[m]} ${m === 'hockey' || m === 'golf' ? 'is' : 'are'} playable`);
    await page.keyboard.press('Escape'); await wait(100);
  }
  await page.evaluate(() => Floor.goTo('stairs')); await wait(150);
  check(/THE LOFT/.test(await page.textContent('#floorCard')), 'the escalator in the entrance goes up to the Loft');
  await page.keyboard.press('Enter'); await wait(1100);
  const upstairs = await page.evaluate(() => Floor.state());
  check(upstairs.level === 1 && upstairs.zone === 'NEW ARRIVALS' && upstairs.people > 0, 'riding it takes you up to the Loft, with its own arcade-goers');
  await page.evaluate(s => Floor.goTo(s), upstairs.loft[0]); await wait(150);
  check(upstairs.loft.length > 0 && await page.evaluate(s => Floor.state().near === s && Floor.state().level === 1, upstairs.loft[0]), "the cabinets that don't fit downstairs are up there");
  await page.evaluate(() => Floor.goTo('pusher')); await wait(150); await page.keyboard.press('Enter'); await wait(150);
  check((await page.evaluate(() => Floor.state().mode)) === 'pusher', 'Ticket Tide, the coin pusher, is playable');
  await page.keyboard.press('Escape'); await wait(100);
  await page.evaluate(() => Floor.goTo('stairs')); await wait(150); await page.keyboard.press('Enter'); await wait(1100);
  check((await page.evaluate(() => Floor.state().level)) === 0, 'and the escalator brings you back down');
  await page.evaluate(() => Floor.goTo('vipdoor')); await wait(150);
  check(/LOCKED/.test(await page.textContent('#floorCard')), 'the VIP room starts locked');
  await page.evaluate(() => Floor.goTo([2210, 650])); await page.keyboard.down('ArrowRight'); await wait(600); await page.keyboard.up('ArrowRight');
  check((await page.evaluate(() => Floor.state().x)) < 2236, 'the velvet rope keeps you out');
  await page.evaluate(() => Floor.goTo('crater-lander')); await wait(150);
  await Promise.all([page.waitForURL(/games\/crater-lander\//), page.keyboard.press('Enter')]);
  check(true, 'Enter at a cabinet opens that game');
  await page.goto(BASE + '/?feature=none');
  check(await page.isVisible('#arcadeFloor'), 'the floor view is remembered');
  await page.goto(BASE + '/?feature=none&vip=1'); await wait(300);
  await page.evaluate(() => Floor.goTo([2210, 650])); await page.keyboard.down('ArrowRight'); await wait(700); await page.keyboard.up('ArrowRight');
  check((await page.evaluate(() => Floor.state().zone)) === 'VIP ROOM', 'once unlocked, you can walk into the VIP room');
  check(!errors.length && dirsOnFloor.length === 3, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- easy mode and attract demos ---------- */
console.log('\nEasy mode');
{
  const { page, errors, close } = await open('/games/star-siege/');
  const easy = async () => { await page.click('#settings'); await page.click('#setEasy'); await page.keyboard.press('Escape'); };
  check(await page.isHidden('.easy-tag') && await page.evaluate(() => !Arcade.easy), 'easy mode is off by default');
  await easy();
  check(await page.isVisible('.easy-tag'), 'turning it on in settings puts an EASY tag in the header');
  check(/EASY MODE ON/.test(await page.textContent('#ov')), 'the title screen says scores won\'t count');
  await page.click('#ov .go');
  check(await page.evaluate(() => Arcade.easy) && /lives = A\.easy \? 5 : 3/.test(await readFile(join(ROOT, 'games/star-siege/index.html'), 'utf8')), 'easy mode is on, and games with lives start with 5');
  await wait(300);
  await page.evaluate(() => { Arcade.badge('wave'); Arcade.submit(5000); Arcade.overlay({ title: 'GAME OVER', btn: 'Again', onGo: () => {} }); });
  check(/SCORE NOT RECORDED/.test(await page.textContent('#ov')) && !(await page.isVisible('#ov .ini')), 'an easy run asks for no initials and says it isn\'t recorded');
  check(await page.evaluate(() => !localStorage.getItem('arcade:top:star-siege') && !localStorage.getItem('arcade:outbox') && !localStorage.getItem('arcade:badges:star-siege') && TICKETS.balance() === 20 && Arcade.best() === 0),
    'easy runs save no score, post nothing, and earn no badges or tickets');
  await easy(); // off again
  await page.click('#ov .go'); await wait(300);
  await page.keyboard.press('KeyP'); await easy(); await page.click('#ov .go'); await wait(300); // a moment played in easy mode
  await page.keyboard.press('KeyP'); await easy(); await page.click('#ov .go'); await wait(200);
  await page.evaluate(() => { Arcade.submit(700); Arcade.overlay({ title: 'GAME OVER', btn: 'Again', onGo: () => {} }); });
  check(/SCORE NOT RECORDED/.test(await page.textContent('#ov')), 'switching easy mode on mid-run (even briefly) means that run doesn\'t count');
  await page.click('#ov .go'); await wait(300);
  await page.evaluate(() => { Arcade.submit(600); Arcade.overlay({ title: 'GAME OVER', btn: 'Again', onGo: () => {} }); });
  check(await page.isVisible('#ov .ini'), 'the next normal run counts again');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

console.log('\nAttract demos');
{
  const kitGames = dirs.filter(d => d !== 'blip-sports'), noDemo = [];
  for (const d of kitGames) if (!/A\.attract\(\{/.test(await readFile(join(ROOT, 'games', d, 'index.html'), 'utf8'))) noDemo.push(d);
  check(!noDemo.length, `every kit game has an attract demo${noDemo.length ? ' (missing: ' + noDemo.join(', ') + ')' : ''}`);
  const { page, errors, close } = await open('/games/rock-rift/?demo=1');
  await page.waitForFunction(() => Arcade.demo, null, { timeout: 4000 });
  check(await page.isVisible('#demoTag') && await page.isHidden('#ov'), 'left alone, the title screen plays a demo');
  await wait(2500);
  check(await page.evaluate(() => Arcade.demo && +document.getElementById('score').textContent >= 0), 'the demo keeps playing');
  await page.keyboard.press('KeyQ');
  check(await page.evaluate(() => !Arcade.demo) && await page.isVisible('#ov .push'), 'any key ends the demo and brings the title back');
  check(await page.evaluate(() => !localStorage.getItem('arcade:top:rock-rift') && !localStorage.getItem('arcade:tickets')), 'a demo records nothing');
  await page.click('#ov .go');
  check(await page.isHidden('#ov') && await page.evaluate(() => !Arcade.demo), 'and the player can start a real game');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- profile and cloud save ---------- */
console.log('\nProfile and cloud save');
{
  // the merge rules, straight from shared/save.js
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const S = await import(new URL('../shared/save.js', import.meta.url));
  delete globalThis.localStorage;
  const code = S.newCode();
  check(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(code) && S.normalize(code.toLowerCase().replace(/-/g, ' ')) === code && S.normalize('abc') === null, `sync codes look like ${code} and can be typed loosely`);
  const a = { 'arcade:best:x': '50', 'arcade:plays:x': '4', 'arcade:top:x': JSON.stringify([{ n: 'AAA', s: 50 }]), 'arcade:badges:x': '["a"]', 'arcade:tickets:earned': '100', 'arcade:prizes': '["amber"]', 'arcade:initials': 'AAA', 'arcade:daily:x': JSON.stringify({ d: '2026-10-12', s: 9 }) };
  const b = { 'arcade:best:x': '80', 'arcade:plays:x': '6', 'arcade:top:x': JSON.stringify([{ n: 'BBB', s: 80 }, { n: 'AAA', s: 50 }]), 'arcade:badges:x': '["b"]', 'arcade:tickets:earned': '120', 'arcade:prizes': '["wood"]', 'arcade:initials': 'BBB', 'arcade:daily:x': JSON.stringify({ d: '2026-10-13', s: 5 }) };
  const prices = { amber: 60, wood: 90 }, m = S.merge(a, b, prices), j = S.merge(a, b, prices, true);
  check(m['arcade:best:x'] === '80' && JSON.parse(m['arcade:top:x']).map(e => e.n).join() === 'BBB,AAA' && JSON.parse(m['arcade:badges:x']).join() === 'a,b', 'merging keeps the higher best, combines the top 10 and unions badges');
  check(JSON.parse(m['arcade:daily:x']).d === '2026-10-13' && m['arcade:initials'] === 'AAA', 'the newer daily best wins, and this device keeps its initials');
  check(m['arcade:tickets:spent'] === '150' && m['arcade:tickets'] === '0' && m['arcade:plays:x'] === '6', 'tickets spent come from the combined prizes; counters take the higher value');
  check(j['arcade:tickets:earned'] === '220' && j['arcade:tickets'] === '70' && j['arcade:plays:x'] === '10', 'when a device first joins, play counts and tickets earned add up');
  const st = S.merge({ 'arcade:story:g': JSON.stringify({ at: 3, done: 0, up: { a: 2 }, earned: 50 }), 'arcade:pass:got:s1': '["f2"]', 'arcade:pass:xp:s1': '300' }, { 'arcade:story:g': JSON.stringify({ at: 1, done: 1, up: { a: 1, b: 1 }, earned: 80 }), 'arcade:pass:got:s1': '["p1"]', 'arcade:pass:xp:s1': '500' });
  const sm = JSON.parse(st['arcade:story:g']);
  check(sm.at === 3 && sm.done === 1 && sm.up.a === 2 && sm.up.b === 1 && sm.earned === 80, 'story saves merge field by field, keeping the furthest progress and every upgrade');
  check(JSON.parse(st['arcade:pass:got:s1']).sort().join() === 'f2,p1' && st['arcade:pass:xp:s1'] === '500', 'pass rewards claimed on either device stay claimed, and season XP keeps the higher');

  const { page, errors, close } = await open('/');
  await skipBoot(page);
  await page.click('#vProfile');
  check(await page.isVisible('#profileView .pf-card') && !(await page.isVisible('#floor')) && /ROOKIE/.test(await page.textContent('.pf-rank')), 'PROFILE shows the player card with a rank');
  check((await page.$$('.pf-game')).length === dirs.length, 'the trophy case has every cabinet');
  await page.click('#pfEdit');
  check(await page.isVisible('.su') && await page.isVisible('.su-cancel'), '✎ EDIT on the profile card opens the profile setup, which can be cancelled');
  await page.click('.su-cancel');
  check(!(await page.isVisible('.su')), 'CANCEL closes it');
  await page.click('#pfOn');
  await page.waitForFunction(() => /Couldn.t reach the cloud/.test(document.getElementById('pfCloud').textContent));
  check(await page.evaluate(() => !localStorage.getItem('bitcade:sync')), 'offline, turning on cloud save says so and leaves it off');
  await page.click('#pfHave'); await page.fill('#pfCode', 'nope'); await page.click('#pfJoin');
  check(await page.waitForFunction(() => /doesn.t look like a code/.test(document.getElementById('pfCloud').textContent), null, { timeout: 3000 }).then(() => true, () => false), 'a mistyped code is caught');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();

  const g = await open('/games/rock-rift/');
  await g.page.click('#ov .go'); await wait(1600);
  await g.page.evaluate(() => dispatchEvent(new Event('pagehide')));
  check(+(await g.page.evaluate(() => localStorage.getItem('arcade:time:rock-rift'))) >= 1, 'games keep track of play time for the profile');
  await g.close();
}

/* ---------- cabinet footage and title logos ---------- */
console.log('\nCabinet footage and title logos');
{
  const missing = [];
  for (const d of dirs) for (const n of [1, 2]) { try { await stat(join(ROOT, 'icons', 'screens', `${d}-${n}.webp`)); } catch { missing.push(`${d}-${n}`); } }
  check(!missing.length, `every cabinet has two frames of footage${missing.length ? ' (missing: ' + missing.join(', ') + '; run node tools/make-screens.mjs)' : ''}`);
  const { page, errors, close } = await open('/');
  await skipBoot(page);
  await page.waitForFunction(() => [...document.querySelectorAll('.cab-screen .shot')].filter(i => i.complete && i.naturalWidth).length >= 4, null, { timeout: 8000 }).catch(() => {});
  check(await page.evaluate(() => document.querySelectorAll('.cab-screen .shot').length) === dirs.length * 2, 'lobby cabinets show the footage');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const g = await open('/games/stackdown/');
  check(await g.page.isVisible('#ov .logo') && (await g.page.textContent('#ov h2')) === 'STACKDOWN' && await g.page.evaluate(() => document.getElementById('ov').classList.contains('title')), 'title screens draw a logo (the name stays as text for screen readers)');
  await g.page.click('#ov .go'); await g.page.keyboard.press('KeyP');
  check(!(await g.page.isVisible('#ov .logo')) && await g.page.isVisible('#ov h2'), 'other screens keep the plain heading');
  await g.close();
}

/* ---------- screen transitions and mastered cabinets ---------- */
console.log('\nTransitions and gold cabinets');
{
  const { page, errors, close } = await open('/');
  await skipBoot(page);
  await Promise.all([page.waitForURL(/games\/wallbuster\//, { timeout: 5000 }), page.locator('a.tile[href="games/wallbuster/"]').first().click()]);
  check(true, 'picking a cabinet powers the lobby off and opens the game');
  check(await page.evaluate(() => !!document.querySelector('.crt-fx')), 'the game powers on as it opens');
  await page.waitForFunction(() => !document.querySelector('.crt-fx'), null, { timeout: 3000 });
  check(true, 'and the power-on clears away');
  await Promise.all([page.waitForURL(u => !/games\//.test(u), { timeout: 5000 }), page.click('a.back')]);
  check(await page.evaluate(() => !!document.getElementById('floor')), 'the back link powers off and returns to the lobby');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();

  const g = await open('/games/neon-noodle/');
  check(!(await g.page.evaluate(() => document.body.classList.contains('mastered'))), 'a cabinet starts plain');
  await g.page.evaluate(() => ['gem', 'long', 'score'].forEach(id => Arcade.badge(id)));
  check(await g.page.evaluate(() => document.body.classList.contains('mastered')) && await g.page.isVisible('.plaque'), 'earning every badge turns the cabinet gold, with a MASTERED plaque');
  await g.page.goto(BASE + '/?feature=none');
  check(await g.page.evaluate(() => document.querySelector('a.cab[href="games/neon-noodle/"]').classList.contains('gold')), 'the lobby shows that cabinet in gold');
  await g.close();
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
  await page.addInitScript(() => { try { sessionStorage.setItem('bitcade:nosetup', '1'); } catch (e) {} }); // no profile setup in the way
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

  const ac = await open('/games/rock-rift/');
  await ac.page.evaluate(() => { Arcade.startRun(); Arcade.submit(120); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  await wait(300);
  check(await ac.page.evaluate(() => JSON.parse(localStorage.getItem('bitcade:actq') || '[]').some(e => e.k === 'run' && e.g === 'rock-rift' && e.s === 120)), 'a run is logged for the admin page (queued while Firebase is unreachable)');
  await ac.page.click('#settings'); await ac.page.click('#setTrack');
  check(await ac.page.evaluate(() => localStorage.getItem('arcade:track') === '0' && localStorage.getItem('bitcade:actq') === '[]'), 'turning off Share play activity stops it and clears the queue');
  await ac.page.evaluate(() => { Arcade.submit(50); });
  check(await ac.page.evaluate(() => localStorage.getItem('bitcade:actq') === '[]'), 'and nothing more is logged');
  await ac.close();

  const hm = await open('/games/rock-rift/');
  check(!(await hm.page.isVisible('#ov .home')), 'title screens have no HOME button (the header has ◀ BITCADE)');
  await hm.page.evaluate(() => { Arcade.submit(0); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  await Promise.all([hm.page.waitForURL(u => !/games\//.test(u.pathname), { timeout: 5000 }).then(() => true, () => false).then(ok => check(ok, 'Backspace on game over goes back to the arcade')), hm.page.keyboard.press('Backspace')]);
  await hm.close();

  const lobby = await open('/');
  await lobby.page.evaluate(() => localStorage.setItem('arcade:badges:wallbuster', '["clear"]'));
  await lobby.page.reload();
  await skipBoot(lobby.page); await lobby.page.click('#vProfile');
  check(/BADGES\s*1\/\d+/.test(await lobby.page.textContent('.pf-stats')), 'the profile counts badges');
  await lobby.page.click('#vGrid');
  check((await lobby.page.textContent('.cab[href="games/wallbuster/"] .bd')).includes('1/3'), 'each cabinet shows its badges');
  await lobby.close();
}

/* ---------- the cabinet and arcade details ---------- */
console.log('\nCabinet');
{
  const { page, errors, close } = await open('/games/star-siege/');
  check((await page.textContent('.cabinet .marquee')).trim() === 'STAR SIEGE', 'the lit marquee shows the game name');
  check(await page.isVisible('.bezel-top #score') && /1UP/.test(await page.textContent('.bezel-top')), 'the bezel carries the 1UP / HI-SCORE strip');
  check(await page.isVisible('.cpanel .stick') && await page.isVisible('.cpanel .help'), 'the control panel has a joystick and the controls card');
  check(await page.isVisible('#ov .push') && /FREE PLAY/.test(await page.textContent('#ov .credit')), 'the title screen says PUSH START and FREE PLAY');
  const fits = await page.evaluate(() => { const c = document.querySelector('.cabinet').getBoundingClientRect(); return c.right <= innerWidth + 1 && c.bottom <= innerHeight + 40; });
  check(fits, 'the cabinet fits the window');
  await page.evaluate(() => { localStorage.setItem('arcade:top:star-siege', JSON.stringify([{ n: 'AAA', s: 900 }, { n: 'BBB', s: 800 }])); Arcade.submit(5); Arcade.overlay({ title: 'EARTH FALLS', btn: 'Play again', onGo: () => {} }); });
  await page.keyboard.press('Enter'); // save the initials (5 makes this device's top 10)
  const first = await page.textContent('#ov .cont'); await wait(1300); const later = await page.textContent('#ov .cont');
  check(/CONTINUE\? 9/.test(first) && /CONTINUE\? [78]/.test(later), `game over counts down to continue ("${first}" → "${later}")`);
  check((await page.textContent('#ov .hs-table .r1 span')) === '1ST', 'score tables rank 1ST, 2ND, 3RD');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- the cabinets page: shelves, search, chips, sorting, favorites, size ---------- */
console.log('\nCabinets page');
{
  const src = await readFile(join(ROOT, 'index.html'), 'utf8');
  const entries = src.match(/\{ slug: '[^']+'[^\n]*/g) || [], bad = entries.filter(l => !/genre: '[a-z0-9 ]+', added: '\d{4}-\d\d-\d\d'/.test(l));
  check(entries.length === dirs.length && !bad.length, `every cabinet has a genre and the date it was added${bad.length ? ' (missing: ' + bad.map(l => l.slice(9, 40)).join(', ') + ')' : ''}`);
  const { page, errors, close } = await open('/?feature=none');
  await page.evaluate(() => { localStorage.setItem('arcade:plays:stackdown', '3'); localStorage.setItem('bitcade:recent', JSON.stringify(['stackdown'])); });
  await page.reload(); await skipBoot(page);
  const shelves = await page.$$eval('.shelf', ss => ss.map(s => s.dataset.shelf));
  check(['recent', 'new', 'shooter', 'racing', 'puzzle'].every(id => shelves.includes(id)) && !shelves.includes('fav'), 'shelves: Continue playing, New arrivals and one per genre (no Favorites until something is pinned)');
  check((await page.$$eval('.shelf[data-shelf="recent"] .tile', t => t.map(a => a.getAttribute('href'))))[0] === 'games/stackdown/', 'Continue playing starts with the last game played');
  const visible = () => page.$$eval('#floor .cab', cs => cs.filter(c => !c.hidden).map(c => c.querySelector('h2').textContent));
  await page.click('#tbSearch');
  await page.fill('#cabQ', 'lander');
  check(JSON.stringify(await visible()) === '["Crater Lander"]' && await page.isHidden('#shelves'), 'searching shows just the matching cabinets');
  await page.fill('#cabQ', '');
  await page.click('.gchip[data-chip="shooter"]');
  const shooters = await visible();
  check(shooters.includes('Star Siege') && !shooters.includes('Stackdown') && /Shooters/.test(await page.textContent('#gridHead')), 'a genre chip shows that genre');
  await page.click('#filterBtn'); await page.selectOption('#cabSort', 'az'); await page.keyboard.press('Escape');
  const az = await visible();
  check(az.length === shooters.length && az.join('|') === [...az].sort((a, b) => a.localeCompare(b)).join('|'), 'sorting A–Z puts them in order');
  await page.click('#gridHead .see');
  check(await page.isVisible('#shelves'), '‹ SHELVES goes back to the shelves');
  await page.locator('.shelf[data-shelf="puzzle"] .see').click();
  check((await visible()).includes('Stackdown') && await page.isHidden('#shelves'), 'SEE ALL opens the grid for that shelf');
  await page.click('.gchip[data-chip="home"]');
  const url = page.url();
  await page.locator('.tile[href="games/rock-rift/"] .fav').first().click(); await wait(200);
  check(page.url() === url && JSON.parse(await page.evaluate(() => localStorage.getItem('bitcade:favs'))).includes('rock-rift'), 'the ★ pins a cabinet without opening it');
  check((await page.$$eval('.shelf[data-shelf="fav"] .tile', t => t.map(a => a.getAttribute('href')))).includes('games/rock-rift/') && await page.evaluate(() => document.querySelector('.cab[href="games/rock-rift/"] .fav').classList.contains('on')), 'it shows on the Favorites shelf, and its big cabinet is starred too');
  await page.click('#filterBtn'); await page.click('[data-size="small"]'); await page.reload(); await skipBoot(page);
  check(await page.evaluate(() => document.getElementById('floor').classList.contains('small') && localStorage.getItem('bitcade:cabsize') === 'small'), 'the big/small toggle is remembered');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const ph = await open('/?feature=none', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await skipBoot(ph.page);
  await ph.page.click('.gchip[data-chip="all"]');
  const cols = await ph.page.evaluate(() => getComputedStyle(document.getElementById('floor')).gridTemplateColumns.split(' ').length);
  check(await ph.page.evaluate(() => document.getElementById('floor').classList.contains('small')) && cols >= 2 && cols <= 3, `phones get small cabinets, ${cols} across`);
  check(!(await ph.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'the cabinets page has no sideways scrolling on a phone');
  check(await ph.page.evaluate(() => { const r = document.getElementById('vScores').getBoundingClientRect(); return r.bottom > innerHeight - 4 - 80 && r.top > innerHeight / 2; }), 'phones get the sections as a tab bar at the bottom');
  check(!ph.errors.length, `no errors${ph.errors.length ? ': ' + ph.errors.join(' | ') : ''}`);
  await ph.close();
}

/* ---------- the lobby: welcome back, the featured banner, couch mode ---------- */
console.log('\nLobby extras');
{
  const { page, errors, close } = await open('/?feature=twin-blast');
  await page.evaluate(() => { localStorage.setItem('arcade:initials', 'QZX'); localStorage.setItem('arcade:plays:stackdown', '2'); });
  await page.goto(BASE + '/?boot&feature=twin-blast'); await page.keyboard.press('Space');
  check(await page.waitForFunction(() => /PLAYER \.+ QZX DETECTED/.test(document.getElementById('bootPost').textContent) && /WELCOME BACK, QZX/.test(document.getElementById('bootPost').textContent), null, { timeout: 6000 }).then(() => true, () => false), 'a returning player gets a personal BIOS: their initials, then WELCOME BACK');
  check(/WELCOME BACK, QZX · LEVEL/.test(await page.textContent('#bootSub')), 'and the title says welcome back with their level');
  await skipBoot(page);
  const slides = await page.$$eval('#heroTrack > *:not([hidden])', s => s.length);
  check(slides === 2 && await page.isVisible('#hero') && (await page.$$('.hero-dots button')).length === slides, `the featured banner has ${slides} slides with a dot each`);
  check(await page.evaluate(() => document.getElementById('heroTrack').firstElementChild.id === 'tourney'), 'the weekly tournament is its first slide');
  await page.click('.hero-dots button:nth-child(2)'); await wait(700);
  check((await page.getAttribute('.hero-dots button:nth-child(2)', 'aria-selected')) === 'true', 'a dot turns to its slide');
  await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
  await page.keyboard.press('ArrowDown');
  check(await page.evaluate(() => document.documentElement.classList.contains('couch') && document.activeElement !== document.body && !document.activeElement.closest('.music-btn')), 'the arrow keys pick something on the page (couch mode)');
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowDown');
  const on = await page.evaluate(() => document.activeElement.className);
  check(/tile|gchip|cab|see/.test(on), `and keep going down through the page (now on ${on.split(' ')[0]})`);
  await page.evaluate(() => document.querySelector('a.tile').focus());
  await page.keyboard.press('f');
  check(JSON.parse(await page.evaluate(() => localStorage.getItem('bitcade:favs') || '[]')).length === 1, 'F pins the highlighted cabinet');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- the floor: new machines, pets, trails and emotes ---------- */
console.log('\nFloor extras');
{
  const { page, errors, close } = await open('/');
  await skipBoot(page);
  await page.click('#vFloor'); await page.waitForFunction(() => window.Floor && Floor.state(), null, { timeout: 5000 });
  await page.evaluate(() => Floor.goTo('wheel')); await wait(150); await page.keyboard.press('Enter'); await wait(150);
  check((await page.evaluate(() => Floor.state().mode)) === 'wheel', 'the ticket wheel opens');
  const t0 = await page.evaluate(() => TICKETS.balance());
  await page.keyboard.press('Enter');
  check(await page.waitForFunction(t0 => TICKETS.balance() > t0, t0, { timeout: 15000 }).then(() => true, () => false), 'a spin pays tickets');
  await page.keyboard.press('Enter'); await wait(150);
  await page.evaluate(() => Floor.goTo('wheel')); await wait(150); await page.keyboard.press('Enter'); await wait(150); const t1 = await page.evaluate(() => TICKETS.balance()); await page.keyboard.press('Enter'); await wait(800);
  check(await page.evaluate(t1 => TICKETS.balance() === t1, t1), 'and only once a day');
  await page.keyboard.press('Escape'); await wait(150);
  for (const m of ['hoops', 'bop']) {
    await page.evaluate(m => Floor.goTo(m), m); await wait(150); await page.keyboard.press('Enter'); await wait(150);
    check((await page.evaluate(() => Floor.state().mode)) === m, `the ${m === 'hoops' ? 'hoop shooter' : 'Bop-a-Bot machine'} opens`);
    await page.keyboard.press('Enter'); await wait(100); await page.keyboard.press(m === 'hoops' ? 'Space' : 'KeyS'); await wait(200);
    await page.keyboard.press('Escape'); await wait(150);
  }
  check(await page.evaluate(() => ['robodog', 'pixelcat', 'slime', 'ufo', 'sparkle', 'neonprint', 'dance', 'robot'].every(id => Prizes.LIST.some(p => p.id === id))), 'the prize counter has pets, footstep trails and emotes');
  await page.evaluate(() => { TICKETS.add(500); Prizes.buy('pixelcat'); Prizes.buy('rainbow'); Prizes.buy('dance'); });
  check(await page.evaluate(() => Prizes.equipped().pet === 'pixelcat' && Prizes.equipped().trail === 'rainbow'), 'buying a pet or a trail wears it');
  await page.keyboard.press('KeyE'); await wait(150);
  check((await page.evaluate(() => Floor.state().mode)) === 'emotes', 'E opens the emote picker');
  await page.keyboard.press('Digit3'); await wait(200);
  check((await page.evaluate(() => Floor.state().mode)) === null, 'a number picks an emote (wave and cheer are free, dance came from the counter)');
  await page.keyboard.down('ArrowRight'); await wait(500); await page.keyboard.up('ArrowRight');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- loading ---------- */
console.log('\nLoading');
{
  const pages = ['index.html', ...dirs.map(d => `games/${d}/index.html`)], google = [];
  for (const p of pages) if (/fonts\.googleapis|fonts\.gstatic/.test(await readFile(join(ROOT, p), 'utf8'))) google.push(p);
  check(!google.length, `every page uses the fonts served from shared/fonts${google.length ? ' (still on Google: ' + google.join(', ') + ')' : ''}`);
  const fcss = await readFile(join(ROOT, 'shared/fonts.css'), 'utf8'), sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const files = [...new Set([...fcss.matchAll(/url\(fonts\/([^)]+)\.woff2\)/g)].map(m => m[1]))], swFonts = JSON.parse(sw.match(/const FONTS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  const missing = []; for (const f of files) { try { await stat(join(ROOT, 'shared/fonts', f + '.woff2')); } catch { missing.push(f); } }
  check(!missing.length && files.every(f => swFonts.includes(f)), `every font file exists and is kept offline${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);
  check(/addEventListener\('message'[^\n]*skip/.test(sw) && /GITHUB_SHA/.test(await readFile(join(ROOT, '.github/workflows/site.yml'), 'utf8')), 'each deploy stamps a new service worker version, which waits to be told to take over');
  check(!/<script src="shared\/floor(-play)?\.js">/.test(await readFile(join(ROOT, 'index.html'), 'utf8')), 'the lobby doesn\'t load the arcade floor up front');
  const { page, errors, close } = await open('/?feature=none');
  await skipBoot(page);
  const asked = []; page.on('request', r => asked.push(r.url()));
  await page.hover('a.tile[href="games/stackdown/"]'); await wait(300);
  check(asked.some(u => /games\/stackdown\/$/.test(u)), 'pointing at a cabinet starts fetching its game');
  await page.click('#vPrize');
  check(await page.waitForFunction(() => window.Floor && document.querySelector('.pc:not([hidden])'), null, { timeout: 5000 }).then(() => true, () => false), 'the prize counter brings the floor in for its outfit pictures');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const g = await open('/games/rock-rift/');
  await g.page.addInitScript(() => { window.__warm = false; new MutationObserver(() => { if (document.querySelector('.screen .warm')) window.__warm = true; }).observe(document, { childList: true, subtree: true }); });
  await g.page.reload();
  check(await g.page.evaluate(() => window.__warm), 'a game\'s screen warms up as it loads');
  check(await g.page.waitForFunction(() => !document.querySelector('.screen .warm'), null, { timeout: 3000 }).then(() => true, () => false), 'and the warm-up clears away by itself');
  await g.close();
}

/* ---------- feedback, error reports, challenges and messages (Firebase is unreachable here) ---------- */
console.log('\nFeedback, errors and challenges');
{
  const { page, errors, close } = await open('/games/rock-rift/');
  await page.evaluate(() => { localStorage.setItem('arcade:initials', 'TST'); Arcade.submit(150); Arcade.overlay({ title: 'GAME OVER', btn: 'Play again', onGo: () => {} }); });
  await page.keyboard.press('Enter'); // save initials (a top-10 score)
  check(await page.isVisible('#ov .chal-go') && /CHALLENGE A FRIEND/.test(await page.textContent('#ov .chal-go')), 'game over offers ⚔ CHALLENGE A FRIEND');
  await page.click('#ov .fbk'); await page.waitForSelector('.set-panel');
  check(await page.isVisible('#setFb') && await page.evaluate(() => document.activeElement.id === 'setFb'), '✎ Feedback opens Settings with the feedback box ready');
  await page.fill('#setFb', 'Love the ghosts'); await page.click('.set-fb-send');
  check(await page.waitForFunction(() => /COULDN.T SEND|THANKS/.test(document.querySelector('.set-panel').textContent), null, { timeout: 8000 }).then(() => true, () => false), 'sending feedback says whether it went (offline here)');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const er = await open('/games/rock-rift/');
  await er.page.evaluate(() => setTimeout(() => { throw new Error('test boom'); }));
  await wait(300);
  check(await er.page.evaluate(() => JSON.parse(localStorage.getItem('bitcade:errq') || '[]').some(e => e.m.includes('test boom') && e.g === 'rock-rift')), 'errors on a game page are queued for the admin page');
  await er.close();
  const lb = await open('/');
  await skipBoot(lb.page);
  await lb.page.click('#tbMsg');
  check(await lb.page.isVisible('.ib-panel') && await lb.page.waitForFunction(() => /connection/.test(document.querySelector('.ib-body').textContent), null, { timeout: 8000 }).then(() => true, () => false), '✉ opens the messages, which say they need a connection when offline');
  check(await lb.page.evaluate(() => { const r = performance.getEntriesByType('resource').map(e => e.name); return r.some(n => /\/shared\/world\.js$/.test(n)) && !r.some(n => /shared\/shared\//.test(n)); }), 'the messages load shared/world.js from the right place');
  await lb.page.keyboard.press('Escape');
  check(!(await lb.page.isVisible('.ib-panel')), 'Escape closes them');
  check(await lb.page.evaluate(() => Inbox.clean('you are a bitch') === 'you are a *****' && Inbox.clean('nice shot!') === 'nice shot!'), 'free text goes through a word filter');
  check(!lb.errors.length, `no errors${lb.errors.length ? ': ' + lb.errors.join(' | ') : ''}`);
  await lb.close();
}

/* ---------- the admin console (admin.html) ---------- */
console.log('\nAdmin console');
{
  const gate = await open('/admin.html');
  check(await gate.page.isVisible('#in') && !(await gate.page.isVisible('#app')), 'the admin console asks to sign in first');
  await gate.page.click('#in');
  check(await gate.page.waitForFunction(() => /reach Firebase/.test(document.getElementById('gateErr').textContent), null, { timeout: 5000 }).then(() => true, () => false), 'and says so when Firebase is unreachable');
  check(!gate.errors.length, `no errors${gate.errors.length ? ': ' + gate.errors.join(' | ') : ''}`);
  await gate.close();
  for (const [what, opts] of [['desktop', {}], ['phone', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }]]) {
    const { page, errors, close } = await open('/admin.html?demo', opts);
    await page.waitForSelector('#kpis .kpi:nth-child(6)');
    check(await page.$$eval('#sess .row', r => r.length) > 0 && await page.$$eval('#queue .row', r => r.length) > 0 && await page.$$eval('#games tbody tr', r => r.length) > 0, `${what}: the overview shows KPIs, live sessions, alerts and top games (demo data)`);
    check(await page.evaluate(() => document.getElementById('lvl').classList.contains('crit')), `${what}: the alert level goes critical for an unseen report`);
    const wide = [];
    for (const v of ['ov', 'feed', 'pl', 'inc', 'fb']) {
      await page.click(`#nav [data-v="${v}"]`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) wide.push(v);
    }
    check(!wide.length, `${what}: no view scrolls sideways${wide.length ? ' (' + wide.join(', ') + ')' : ''}`);
    await page.click('#nav [data-v="feed"]');
    check(await page.$$eval('#log .ln', r => r.length) > 20, `${what}: the feed lists events`);
    await page.click('#nav [data-v="pl"]'); await page.click('#plist .pr[data-p]');
    check(await page.isVisible('#drawer') && /TIMELINE/.test(await page.textContent('#drawer')), `${what}: tapping a player opens their details`);
    await page.keyboard.press('Escape');
    check(!(await page.isVisible('#drawer')), `${what}: Escape closes them`);
    await page.click('#menuBtn'); await page.click('#modBtn'); await page.click('#mFind');
    check(await page.$$eval('#mList .mrow', r => r.length) > 0 && await page.$$eval('#mProf .mrow', r => r.length) > 0, `${what}: moderation lists test scores and player profiles`);
    const before = await page.$$eval('#mList .mrow', r => r.length);
    await page.click('#mList .mrow .btn'); await page.click('#mList .mrow .btn');
    check(await page.$$eval('#mList .mrow', r => r.length) === before - 1, `${what}: removing a score takes two taps`);
    check(await page.evaluate(() => document.getElementById('drawer').scrollWidth <= innerWidth + 1), `${what}: the moderation drawer fits the screen`);
    await page.keyboard.press('Escape');
    if (what === 'phone') check(await page.evaluate(() => { const r = document.getElementById('nav').getBoundingClientRect(); return Math.abs(r.bottom - innerHeight) < 2 && r.width >= innerWidth - 1; }), 'phone: the tabs sit along the bottom');
    check(!errors.length, `${what}: no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await close();
  }
}

/* ---------- new players: the profile setup (shared/setup.js) ---------- */
console.log('\nProfile setup');
{
  const { page, errors, close } = await open('/?newplayer');
  await skipBoot(page);
  check(await page.waitForSelector('.su', { timeout: 6000 }).then(() => true, () => false) && !(await page.isVisible('.su-cancel')), 'a new player makes a profile once the doors open, with no way round it');
  await page.fill('#suName', 'admin');
  check(/different name/.test(await page.textContent('#suNameHint')), 'names that would look official are refused');
  await page.fill('#suName', 'pixelpat9');
  check(await page.inputValue('#suName') === 'PIXELPAT9' && await page.inputValue('#suIni') === 'PIX', 'names are capitals and numbers, and the initials fill in from the name');
  check(await page.waitForFunction(() => /online/.test(document.getElementById('suNameHint').textContent), null, { timeout: 8000 }).then(() => true, () => false), 'offline, it says the name will be checked once online');
  const part = await page.textContent('[data-part="1"] span');
  await page.click('[data-part="1"] [data-d="1"]');
  check(part !== await page.textContent('[data-part="1"] span'), 'the arrows change the character');
  await page.click('.su-go');
  check(await page.waitForSelector('.su', { state: 'detached', timeout: 8000 }).then(() => true, () => false), 'ENTER THE ARCADE saves it, offline too');
  check(await page.evaluate(() => localStorage.getItem('arcade:name') === 'PIXELPAT9' && localStorage.getItem('arcade:initials') === 'PIX' && Avatar.valid(localStorage.getItem('arcade:avatar')) && !localStorage.getItem('arcade:name:ok')), 'the name, initials and character are kept, and the name waits to be claimed online');
  await page.click('#vProfile');
  check(/PIXELPAT9/.test(await page.textContent('.pf-name')) && /PIX/.test(await page.textContent('.pf-name small')), 'the profile card shows the player name and initials');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const g = await open('/games/rock-rift/?newplayer'); // a friend's challenge link can be someone's first page
  check(await g.page.waitForSelector('.su', { timeout: 6000 }).then(() => true, () => false), 'a game page asks a new player too');
  check(!g.errors.length, `no errors${g.errors.length ? ': ' + g.errors.join(' | ') : ''}`);
  await g.close();
}

/* ---------- seasonal events: Halloween ---------- */
console.log('\nHalloween');
{
  const { page, errors, close } = await open('/?feature=none&event=halloween');
  await skipBoot(page);
  check(await page.evaluate(() => EVENT.on('halloween') && document.body.classList.contains('ev-halloween') && !!document.querySelector('#heroTrack .hero-slide.halloween')), 'Halloween dresses up the lobby and adds its banner slide');
  check(/GHOSTS/.test(await page.textContent('#todayCard')) && await page.evaluate(() => MISSIONS.list().some(m => m.kind === 'ghost')), 'the Today card counts ghosts, and the floor mission is a ghost hunt');
  await page.evaluate(() => TICKETS.add(300)); await page.click('#vPrize');
  check(await page.isVisible('.pc-item[data-id="ghostpet"]') && await page.isVisible('.pc-item[data-id="pumpkin"]'), 'the prize counter has the Halloween prizes');
  check(await page.evaluate(() => Prizes.buy('pumpkin') && Prizes.buy('ghostpet')), 'and they can be bought while it\'s on');
  await page.keyboard.press('Escape');
  await page.click('#vFloor'); await page.waitForFunction(() => window.Floor && Floor.state()); await wait(400);
  const gs = await page.evaluate(() => Floor.state().ghosts);
  check(gs.length === 5 && gs.every(g => !g.got), 'five ghosts hide on the floor');
  const t0 = await page.evaluate(() => TICKETS.balance());
  await page.evaluate(g => Floor.goTo([g.x, g.y + 10]), gs[0]); await wait(500);
  check(await page.evaluate(() => Floor.state().ghosts.filter(g => g.got).length) === 1 && await page.evaluate(t0 => TICKETS.balance() === t0 + 2, t0), 'walking into one finds it for 2 tickets');
  check(await page.evaluate(() => MISSIONS.list().find(m => m.kind === 'ghost').prog === 1 && JSON.parse(localStorage.getItem('bitcade:ghosts')).f.length === 1), 'it counts for the mission and is remembered for the day');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
  const off = await open('/?feature=none&event=none');
  await skipBoot(off.page); await off.page.click('#vPrize');
  check(!(await off.page.$('.pc-item[data-id="pumpkin"]')) && await off.page.evaluate(() => !Prizes.buy('pumpkin')), 'out of season the Halloween prizes are gone and can\'t be bought');
  await off.close();
  const gp = await open('/games/neon-noodle/?event=halloween');
  check(await gp.page.evaluate(() => document.body.classList.contains('ev-halloween')), 'game pages get a pumpkin by FREE PLAY');
  await gp.close();
}

/* ---------- the Arcade Pass ---------- */
console.log('\nArcade Pass');
{
  const { page, errors, close } = await open('/?feature=none');
  await skipBoot(page);
  const on = await page.evaluate(() => !!PASS.season());
  check(await page.evaluate(() => PASS.SEASONS.every(se => [...Object.values(se.free), ...Object.values(se.pass)].every(r => r.t === 'tix' || Prizes.LIST.some(p => p.id === r.id && p.pass === se.id))) && Object.keys(PASS.SEASONS[0].pass).length === PASS.TIERS), 'every pass reward is a real prize marked for its season, and the pass track has all 50 tiers');
  if (on) {
    await page.evaluate(() => XP.add(260));
    check(await page.evaluate(() => PASS.tier() === 2) && /TIER\s*2/.test(await page.textContent('#passStrip')), 'XP climbs the pass, and the lobby strip shows the tier');
    await page.click('#vRewards'); await page.click('#passStrip');
    check(await page.isVisible('.ps-panel') && (await page.$$('.ps-col')).length === 50 && await page.isVisible('.ps-cell.pass.locked'), 'the pass screen shows 50 tiers, with the pass track locked without the pass');
    const t0 = await page.evaluate(() => TICKETS.balance());
    await page.click('.ps-all');
    check(await page.evaluate(t0 => TICKETS.balance() === t0 + 10 && PASS.ready().length === 0, t0), 'CLAIM ALL pays the free rewards reached');
    check(!(await page.evaluate(() => Prizes.buy('synth'))), 'pass prizes can\'t be bought with tickets');
    await page.keyboard.press('Escape');
    check(await page.isHidden('.ps'), 'Escape closes the pass screen');
    await page.goto(BASE + '/?feature=none&pass=1'); await skipBoot(page);
    await page.evaluate(() => PASS.claimAll());
    check(await page.evaluate(() => Prizes.has('synth') && PASS.owned()), 'with the pass, its prizes come with the tiers');
  } else check(true, 'no Arcade Pass season is running today: add the next one to PASS.SEASONS in shared/badges.js');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- story mode in the flagship games ---------- */
console.log('\nStory mode');
for (const [slug, chapters, coin] of [['dungeon-delve', 5, 'GEMS'], ['blast-brigade', 5, 'MEDALS'], ['pixel-peaks', 8, 'GEMS'], ['turbo-tour', 6, 'PRIZE $'], ['sky-squadron', 6, 'MEDALS'], ['knockout-kings', 7, 'PURSE $'], ['bomb-squad', 6, 'BOLTS'], ['tank-tactics', 6, 'PARTS'], ['field-day', 5, 'SPONSOR $']]) {
  const { page, errors, close } = await open(`/games/${slug}/?feature=none`);
  check(/STORY/.test(await page.textContent('#ov .go2')), `${slug}: the title screen has a ★ STORY button`);
  await page.evaluate(([slug, coin]) => localStorage.setItem('arcade:story:' + slug, JSON.stringify({ earned: 500 })), [slug, coin]);
  await page.click('#ov .go2'); await wait(200);
  check(await page.isVisible('.story') && (await page.$$('.st-node')).length === chapters && (await page.$$('.st-node:disabled')).length === chapters - 1, `${slug}: the map shows ${chapters} chapters, all but the first locked`);
  await page.keyboard.press('Tab');
  const ups = await page.$$('.st-up');
  await ups[0].click();
  check(await page.evaluate(slug => JSON.parse(localStorage.getItem('arcade:story:' + slug)).spent > 0, slug) && (await page.textContent('.st-bank')).includes(coin), `${slug}: upgrades are bought with ${coin.toLowerCase()}`);
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await wait(200);
  check(await page.isVisible('.st-scene'), `${slug}: the first chapter opens with the prologue`);
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await wait(1200);
  check(await page.isHidden('.story') && await page.isHidden('#ov'), `${slug}: then the run starts`);
  await page.keyboard.press('KeyP'); await wait(150);
  check(/Quit to map/.test(await page.textContent('#ov')), `${slug}: pausing a story run offers Quit to map`);
  await page.click('#ov .go2'); await wait(200);
  check(await page.isVisible('.story'), `${slug}: which goes back to the map`);
  await page.keyboard.press('Escape'); await wait(200);
  check(await page.isHidden('.story') && /STORY/.test(await page.textContent('#ov .go2')), `${slug}: Escape leaves the map for the title screen`);
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

/* ---------- phones: pause button and touch pad ---------- */
console.log('\nPhone layout');
{
  const { page, errors, close } = await open('/games/star-siege/', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  check(await page.isVisible('.bar .pause'), 'header PAUSE button shows on a touch screen');
  check(await page.isVisible('.pad'), 'touch pad shows on a touch screen');
  check(await page.isVisible('.marquee') && await page.isHidden('.cpanel'), 'phones get the slim cabinet: marquee, no control panel');
  check(await page.evaluate(() => { const s = getComputedStyle(document.body); return s.userSelect === 'none' || s.webkitUserSelect === 'none'; }), 'tapping and holding does not select text');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no sideways scrolling at phone width');
  check(!errors.length, `no errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await close();
}

await browser.close(); server.close();
console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) { console.log('\nFailed:\n- ' + failures.join('\n- ')); process.exit(1); }
