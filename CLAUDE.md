# Bitcade

A GitHub Pages arcade site: a lobby page plus 10 classic-style browser games. Plain HTML, CSS and canvas JavaScript. No build step, no frameworks, no dependencies beyond Google Fonts.

## Layout

- `index.html`: the lobby. The `GAMES` array lists each cabinet: slug, name, colour, blurb, and a 12×8 pixel icon with two frames (`px`, `px2`) that alternate. Add a new game here to show it in the lobby.
- `shared/arcade.css`: the cabinet frame shared by every game page (header bar, screen, overlay, touch pad).
- `shared/arcade.js`: the shared kit, exposed as `window.Arcade`. It covers:
  - high scores in localStorage: `arcade:best:<slug>` (the record), `arcade:top:<slug>` (top 10 with initials, JSON), `arcade:daily:<slug>` (today's daily-challenge best)
  - `A.submit(score, daily)` on game over. The next `A.overlay` call then asks for initials if the score made the top 10, and shows the table
  - daily challenges: `A.seeded(key)` returns a seeded random function, and `A.today()` returns the local date. Stackdown and Wallbuster use them
  - sound (`tone`, `noise`, `jingle`)
  - keyboard, touch and gamepad input (`held`, `onPress`, `swipe`, `[data-k]` pad buttons)
  - a header PAUSE button for touch, added automatically unless the pad already has a `KeyP` button
  - canvas sizing
  - the fixed-step `loop`
  - the start/pause/game-over `overlay`. Pass `scores: true` on title screens to list the top 10, and `alt: { btn, onGo }` for a second button (gamepad Y)
- `games/<slug>/index.html`: one self-contained page per game, loading the shared kit with `../../shared/`.
  - `body data-game="<slug>"` sets the score key.
  - `style="--game:#hex"` sets the accent colour.
  - `data-pad="0:KeyK 2:KeyJ"` maps gamepad buttons (standard mapping index) to key codes. The defaults are d-pad and left stick → arrows, A (0) → Space, Start (9) → KeyP. A or Start also presses the overlay button.
- `games/blip-sports/`: the exception. It's a standalone LED handheld (football and baseball) that doesn't use the shared kit, and it tracks wins in `arcade:best:blip-sports`.

## Games

neon-noodle (snake), wallbuster (brick breaker), star-siege (alien shooter), rock-rift (asteroids), stackdown (falling blocks), back-alley-brawl (1v1 fighter vs CPU ladder), circuit-chase (maze chase), highrise-handyman (fix-it climber), nitro-lane (racing), blip-sports (LED football + baseball).

All names, characters and art are original. Keep it that way: no trademarked game names, characters or sprites.

## Conventions

- Every game works on keyboard and touch. Kit games also work on a gamepad (Blip Sports doesn't yet). Touch pads appear only on coarse pointers.
- Pages need `[hidden]{display:none!important}` (it's in arcade.css), because the overlay uses `display:flex`.
- Initialise arrays used by draw/update at declaration. The loop runs on the title screen before a game starts.
- Test locally by running `python3 -m http.server` in the repo root and opening http://localhost:8000.

## Deploy

GitHub Pages from the `main` branch, root folder. The site lives at https://gfrazier620-afk.github.io/Bitcade/
