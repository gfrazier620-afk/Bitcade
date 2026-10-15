/*
 * Lobby cabinet footage: plays each game's attract demo in headless Chromium and saves two frames of it as small
 * WebP images, icons/screens/<slug>-1.webp and -2.webp. The lobby shows them on the cabinet screens, alternating.
 * Blip Sports has no demo, so its frames come from its LED screen.
 *
 *   npm install && node tools/make-screens.mjs [slug ...]
 *
 * Run it again after changing how a game looks.
 */
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), OUT = join(ROOT, 'icons', 'screens');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.includes('..')) { res.writeHead(400).end(); return; }
  let file = join(ROOT, path);
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let browser; for (const o of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) { try { browser = await chromium.launch(o); break; } catch (e) { /* next */ } }
if (!browser) throw new Error('No Chromium found.');
const all = (await readdir(join(ROOT, 'games'), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : all;
await mkdir(OUT, { recursive: true });

/** The canvas, scaled to 320 px wide, as WebP. */
const grab = (page, sel) => page.evaluate(sel => {
  const cv = document.querySelector(sel), w = 320, h = Math.round(w * cv.height / cv.width), c = document.createElement('canvas');
  c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, w, h);
  return c.toDataURL('image/webp', 0.72).split(',')[1];
}, sel);

await Promise.all(slugs.map(async (slug, i) => {
  await new Promise(r => setTimeout(r, i * 250));
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
  await ctx.route(/gstatic\.com\/firebasejs|firestore\.googleapis|identitytoolkit|securetoken/, r => r.abort()); // fonts load; the leaderboard doesn't
  await ctx.addInitScript(() => { localStorage.setItem('arcade:crt', '0'); localStorage.setItem('arcade:muted', '1'); });
  const page = await ctx.newPage();
  const blip = slug === 'blip-sports';
  await page.goto(`${BASE}/games/${slug}/${blip ? '' : '?demo=1&feature=none'}`);
  if (blip) { await page.waitForTimeout(800); await page.keyboard.press('Enter'); }
  const sel = blip ? '#screen' : '#cv';
  await page.waitForTimeout(blip ? 2500 : 7000);
  await writeFile(join(OUT, `${slug}-1.webp`), Buffer.from(await grab(page, sel), 'base64'));
  await page.waitForTimeout(blip ? 1500 : 3500);
  await writeFile(join(OUT, `${slug}-2.webp`), Buffer.from(await grab(page, sel), 'base64'));
  await ctx.close();
  console.log('saved', slug);
}));
await browser.close(); server.close();
