# Bitcade

Thirty-six classic-style arcade games that run in your browser, on phone or keyboard.

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
| Scaffold Scramble | Girder climber |
| Swarm Strike | Dive-bomb shooter |
| Garden Gunner | Caterpillar shooter |
| Cube Hopper | Pyramid hopper |
| Light Trail | Light-cycle duel, 1P vs CPU ladder or 2P |
| Wing Duel | Flying joust, 1P waves or 2P duel |
| Twin Blast | Twin-stick arena shooter |
| Mole Patrol | Dig and trap |
| Turbo Tour | Cross-country racer |
| Raptor Ridge | Dino ride shooter |
| Marsh Marksman | Bird hunt |
| Pixel Peaks | Mountain platformer |
| Pop Lagoon | Bubble popper |
| Neon Steps | Rhythm dance |
| Blast Brigade | Run and gun |
| Dungeon Delve | Dungeon adventure |
| Lucky Line | Fishing |
| Rampart Rush | Tower defense |
| Sky Squadron | Plane shooter |
| Street Sweepers | Beat 'em up (2P) |
| Gem Cascade | Match-3 puzzle |
| Knockout Kings | Cartoon boxing |
| Blip Sports | LED football + baseball |

Top-10 score tables with your initials save in your browser and post to a world leaderboard (Firebase). Stackdown, Wallbuster, Twin Blast, Mole Patrol and Wing Duel have a daily challenge that gives every player the same layout, with its own world board each day. Each week one game is the featured tournament game, with a world board that starts fresh every Monday. Every game pays tickets, which buy screen tints, cabinet finishes, outfits and decorations at the prize counter, and the lobby can be walked as a big neon arcade (with a pet, a footstep trail and emotes from the prize counter), with a raceway, a shooting gallery, a lounge, a jukebox, a photo booth, a hoop shooter, Bop-a-Bot, a daily ticket wheel, a claw machine that pays tickets and other arcade-goers wandering about. Left on its title screen, every game plays a demo of itself. Every title screen has its own animated logo, and the lobby's cabinets show footage of their games, on shelves by genre with search, sorting, favorites and a compact view for phones. Picking a cabinet drops a coin and switches the screen over like an old CRT, and earning all three badges in a game turns its cabinet gold. Dungeon Delve, Blast Brigade, Pixel Peaks, Turbo Tour, Sky Squadron and Knockout Kings each have a story mode: a campaign map with a prologue and an ending, upgrades bought with what you collect, then HARD mode and a boss rush, survival or time trial. Every bit of XP also climbs the season's Arcade Pass, 50 tiers of tickets and exclusive prizes. The ★ PROFILE view shows your player card, trophy case and prizes, and cloud save carries your progress to another device with a sync code (no account needed). EASY mode (in the header) slows games down and adds lives, but easy runs don't count for scores, challenges, badges or tickets. Every game has three badges to earn, and finished games can be shared. Blip Sports keeps a world board of wins. Every title screen has its own chiptune, a settings panel has volumes, screen shake and flash options, vibration on phones, keys of your own for any control, and an optional CRT filter, and the lobby boots up with a flight over a neon grid (drop in a coin and the doors open on the arcade) and has an attract mode. Install it from the lobby (or Share → Add to Home Screen on iPhone) and it plays offline. To run it locally, use `python3 -m http.server` in this folder, then open http://localhost:8000.

Tests: `npm install` then `npm test` opens the lobby and every game in a headless browser and fails on any error. GitHub Actions runs them on every push and only publishes the site when they pass.
