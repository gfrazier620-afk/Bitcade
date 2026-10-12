# Bitcade

Fourteen classic-style arcade games that run in your browser, on phone or keyboard.

**Play:** https://gfrazier620-afk.github.io/Bitcade/

| Game | Style |
|---|---|
| Neon Noodle | Snake |
| Wallbuster | Brick breaker |
| Star Siege | Alien shooter |
| Rock Rift | Asteroid blaster |
| Stackdown | Falling blocks |
| Back Alley Brawl | Street fighter |
| Circuit Chase | Maze chase |
| Highrise Handyman | Fix-it climber |
| Nitro Lane | Racing |
| Volley Duel | Paddle duel (1 or 2 players) |
| Crater Lander | Lunar lander |
| Sky Shield | Missile defense |
| Hedge Hop | Road crossing |
| Blip Sports | LED football + baseball |

Top-10 score tables with your initials save in your browser and post to a world leaderboard (Firebase). Stackdown and Wallbuster have a daily challenge that gives every player the same pieces or walls, with its own world board each day. Every game has three badges to earn, and finished games can be shared. Blip Sports keeps a world board of wins. Install it from the lobby (or Share → Add to Home Screen on iPhone) and it plays offline. To run it locally, use `python3 -m http.server` in this folder, then open http://localhost:8000.

Tests: `npm install` then `npm test` opens the lobby and every game in a headless browser and fails on any error. GitHub Actions runs them on every push and only publishes the site when they pass.
