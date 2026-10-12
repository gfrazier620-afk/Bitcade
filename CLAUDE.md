# Bitcade

A GitHub Pages arcade site: a lobby page plus 14 classic-style browser games. Plain HTML, CSS and canvas JavaScript. No build step, no frameworks. The only outside dependencies are Google Fonts and the Firebase SDK, loaded from gstatic only for the world leaderboard.

## Layout

- `index.html`: the lobby. The `GAMES` array lists each cabinet: slug, name, colour, blurb, and a 12×8 pixel icon with two frames (`px`, `px2`) that alternate. Add a new game here to show it in the lobby.
- `shared/arcade.css`: the cabinet frame shared by every game page (header bar, screen, overlay, touch pad).
- `shared/arcade.js`: the shared kit, exposed as `window.Arcade`. It covers:
  - high scores in localStorage: `arcade:best:<slug>` (the record), `arcade:top:<slug>` (top 10 with initials, JSON), `arcade:daily:<slug>` (today's daily-challenge best)
  - `A.submit(score, daily)` on game over. The next `A.overlay` call then asks for initials if the score made the top 10, and shows the table
  - world leaderboard: saving initials queues the score in `arcade:outbox` and posts it through `shared/world.js` (Firebase project `bitcade-4fa25`, Firestore Lite plus anonymous auth, loaded on demand). Score tables have WORLD and THIS DEVICE tabs. Every page must keep working when Firebase is unreachable
  - daily challenges: `A.seeded(key)` returns a seeded random function, and `A.today()` returns the local date. Stackdown and Wallbuster use them. A run that beats the player's best today goes to that day's world board (`daily/{game}/days/{YYYY-MM-DD}/scores`) along with the all-time board, in one write. Pass `daily: true` to `A.overlay` to add a TODAY tab
  - badges: `A.badge(id)` unlocks one (toast and jingle, once). Definitions for every game live in `shared/badges.js`, loaded before arcade.js and by the lobby. Score tables get a BADGES tab
  - a Share score link on game-over screens (share sheet, or copy to the clipboard)
  - sound (`tone`, `noise`, `jingle`)
  - keyboard, touch and gamepad input (`held`, `onPress`, `swipe`, `[data-k]` pad buttons). Inside an element marked `data-keys-native`, keys are left to the page
  - a header PAUSE button for touch, added automatically unless the pad already has a `KeyP` button
  - canvas sizing
  - the fixed-step `loop`
  - the start/pause/game-over `overlay`. Pass `scores: true` on title screens to list the top 10, and `alt: { btn, onGo }` for a second button (gamepad Y)
- `games/<slug>/index.html`: one self-contained page per game, loading the shared kit with `../../shared/`.
  - `body data-game="<slug>"` sets the score key.
  - `style="--game:#hex"` sets the accent colour.
  - `data-pad="0:KeyK 2:KeyJ"` maps gamepad buttons (standard mapping index) to key codes. The defaults are d-pad and left stick → arrows, A (0) → Space, Start (9) → KeyP. A or Start also presses the overlay button.
- `games/blip-sports/`: the exception. It's an LED handheld (football and baseball) with its own shell and styles, not the kit's overlay or arcade.css. It does load arcade.js for keys, gamepad, badges and the world wins board (`A.postWin`, `wins/{uid}` in Firestore). Its own pause freezes game time. It tracks local wins in `arcade:best:blip-sports`.

## Games

neon-noodle (snake), wallbuster (brick breaker), star-siege (alien shooter), rock-rift (asteroids), stackdown (falling blocks), back-alley-brawl (1v1 fighter vs CPU ladder), circuit-chase (maze chase), highrise-handyman (fix-it climber), nitro-lane (racing), volley-duel (paddle duel, 1P vs CPU ladder or 2P on one keyboard/tablet), crater-lander (lunar lander), sky-shield (missile defense), hedge-hop (road crossing), blip-sports (LED football + baseball).

All names, characters and art are original. Keep it that way: no trademarked game names, characters or sprites.

- `sw.js`, `manifest.json`, `icons/`: the installable, offline app. The service worker precaches the lobby and every game. Site files are network-first and revalidated with the server, so they're fresh when online; fonts and the Firebase SDK are cache-first. Every page links the manifest in its `<head>`. `node tools/make-icons.mjs` redraws the icons.
- `firestore.rules`: the Firestore security rules. They're published by pasting them into the Firebase console (Firestore Database → Rules), not deployed from the repo. A new game needs its slug and a max score added to `maxScore()` there before world scores for it will save.

## Adding a game

1. `games/<slug>/index.html`, using the kit (copy the head tags, including the manifest and icon links, from another game).
2. A cabinet in the lobby's `GAMES` array, and the count word in its tagline ("FOURTEEN CLASSIC-STYLE GAMES").
3. The slug in `sw.js` `GAMES`, then bump `VERSION`.
4. Its badges in `shared/badges.js`, with matching `A.badge('id')` calls in the game.
5. The slug and a max score in `firestore.rules` `maxScore()`, then publish the rules in the Firebase console.
6. `npm test`. It fails if the lobby, `sw.js`, the manifest links or the badges miss the new folder.

## Conventions

- Every game works on keyboard and touch. Every game also works on a gamepad. Touch pads appear only on coarse pointers.
- Pages need `[hidden]{display:none!important}` (it's in arcade.css), because the overlay uses `display:flex`.
- Initialise arrays used by draw/update at declaration. The loop runs on the title screen before a game starts.
- Play locally by running `python3 -m http.server` in the repo root and opening http://localhost:8000. Pick another port, such as 5173, if 8000 is blocked, which it is on Windows here.
- Run the smoke tests with `npm install` then `npm test`. `tests/smoke.mjs` serves the repo and opens the lobby and every game in headless Chromium. It checks cabinets and folders match, start, pause and resume, that the canvas draws, the top-10 table, the phone layout, and that there are no errors. New games are picked up automatically from `games/`. Locally it uses installed Chrome or Edge. `package.json` is dev tooling only; the site still has no dependencies.

## Deploy

`.github/workflows/site.yml` runs the smoke tests on every push and pull request. On `main`, a passing run publishes `index.html`, `sw.js`, `manifest.json`, `icons/`, `shared/` and `games/` to GitHub Pages (add any new top-level site file to the copy step in the workflow), so a broken game never goes live. This needs the repo's Settings → Pages → Source set to "GitHub Actions". The site lives at https://gfrazier620-afk.github.io/Bitcade/
