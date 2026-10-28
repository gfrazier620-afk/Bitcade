/*
 * Progression shared by the lobby and every game: badges, then the weekly tournament rotation and tickets (at the end).
 * Games unlock badges with Arcade.badge(id); the lobby shows how many each player has.
 * Loaded before arcade.js on every game page, and by the lobby. Ids must match the Arcade.badge calls in the games.
 */
window.BADGES = {
  'neon-noodle': [
    { id: 'gem', name: 'Gem Snatcher', desc: 'Grab a gold gem before it fades' },
    { id: 'long', name: 'Long Noodle', desc: 'Grow to a length of 30' },
    { id: 'score', name: 'Noodle Legend', desc: 'Score 1,000 points' }],
  'wallbuster': [
    { id: 'clear', name: 'Wall Down', desc: 'Clear a whole wall' },
    { id: 'multi', name: 'Triple Trouble', desc: 'Have 3 balls in play at once' },
    { id: 'lvl5', name: 'Demolition Pro', desc: 'Reach level 5' }],
  'star-siege': [
    { id: 'wave', name: 'Holding the Line', desc: 'Clear a wave' },
    { id: 'saucer', name: 'Saucer Sniper', desc: 'Shoot the gold saucer' },
    { id: 'w5', name: 'Fleet Breaker', desc: 'Reach wave 5' }],
  'rock-rift': [
    { id: 'wave', name: 'Rock Breaker', desc: 'Clear a wave' },
    { id: 'saucer', name: 'Saucer Down', desc: 'Destroy a saucer' },
    { id: 'score', name: 'Rift Ranger', desc: 'Score 10,000 points' }],
  'stackdown': [
    { id: 'four', name: 'Stackdown!', desc: 'Clear 4 rows at once' },
    { id: 'lvl5', name: 'Speed Stacker', desc: 'Reach level 5' },
    { id: 'daily', name: 'Daily Grinder', desc: 'Finish a daily challenge' }],
  'back-alley-brawl': [
    { id: 'round', name: 'First Blood', desc: 'Win a round' },
    { id: 'perfect', name: 'Untouchable', desc: 'Win a round without taking a hit' },
    { id: 'champ', name: 'Alley Champ', desc: 'Beat all four fighters' }],
  'circuit-chase': [
    { id: 'zap', name: 'Antivirus', desc: 'Zap a virus' },
    { id: 'combo', name: 'Clean Sweep', desc: 'Zap all four viruses on one power-up' },
    { id: 'clear', name: 'Circuit Clear', desc: 'Collect every data bit in a level' }],
  'highrise-handyman': [
    { id: 'coffee', name: 'Coffee Break', desc: 'Grab a coffee' },
    { id: 'clear', name: 'All Fixed', desc: 'Fix every window on a level' },
    { id: 'lvl3', name: 'Tower Tamer', desc: 'Reach level 3' }],
  'nitro-lane': [
    { id: 'close', name: 'Close Call', desc: 'Pass a car with a hair to spare' },
    { id: 'nitro', name: 'Afterburner', desc: 'Fire a nitro boost' },
    { id: 'km5', name: 'Road Warrior', desc: 'Drive 5 km in one run' }],
  'volley-duel': [
    { id: 'match', name: 'Rally Winner', desc: 'Win a match against the CPU' },
    { id: 'shutout', name: 'Shutout', desc: 'Win a match 7–0' },
    { id: 'champ', name: 'Rally Champ', desc: 'Beat APEX' }],
  'crater-lander': [
    { id: 'land', name: 'Touchdown', desc: 'Land safely' },
    { id: 'feather', name: 'Feather Touch', desc: 'Land extra gently' },
    { id: 'x5', name: 'Pinpoint', desc: 'Land on a ×5 pad' }],
  'sky-shield': [
    { id: 'wave', name: 'Not One Lost', desc: 'Clear a wave with all six cities standing' },
    { id: 'rebuild', name: 'Rebuilder', desc: 'Earn a rebuilt city' },
    { id: 'w5', name: 'Iron Dome', desc: 'Reach wave 5' }],
  'hedge-hop': [
    { id: 'home', name: 'Home Sweet Home', desc: 'Get a hedgehog into a burrow' },
    { id: 'berry', name: 'Berry Good', desc: 'Bring home a berry' },
    { id: 'all', name: 'Full House', desc: 'Fill all five burrows' }],
  'scaffold-scramble': [
    { id: 'jump', name: 'Can Hurdler', desc: 'Jump over a rolling paint can' },
    { id: 'smash', name: 'Hammer Time', desc: 'Smash a can with a hammer' },
    { id: 'top', name: 'Topping Out', desc: 'Reach the finish flag' }],
  'swarm-strike': [
    { id: 'boss', name: 'Commander Down', desc: 'Destroy a commander' },
    { id: 'rescue', name: 'Double Trouble', desc: 'Win back a captured ship' },
    { id: 'stage5', name: 'Swarm Breaker', desc: 'Reach stage 5' }],
  'garden-gunner': [
    { id: 'spider', name: 'Web Buster', desc: 'Spray a spider' },
    { id: 'wave', name: 'Pest Control', desc: 'Clear a whole caterpillar' },
    { id: 'w5', name: 'Master Gardener', desc: 'Clear 5 caterpillars in one game' }],
  'cube-hopper': [
    { id: 'round', name: 'Colour Me In', desc: 'Finish a round' },
    { id: 'lure', name: 'Spring Trap', desc: 'Lure the spring off the pyramid' },
    { id: 'r5', name: 'Pyramid Pro', desc: 'Reach round 5' }],
  'light-trail': [
    { id: 'round', name: 'Boxed In', desc: 'Win a round against a CPU rider' },
    { id: 'match', name: 'Grid Runner', desc: 'Win a match against a CPU rider' },
    { id: 'champ', name: 'Grid Champion', desc: 'Beat FLUX, the last rider' }],
  'wing-duel': [
    { id: 'first', name: 'Unseated', desc: 'Knock a rival rider off their bird' },
    { id: 'egg', name: 'Air Catch', desc: 'Catch an egg before it lands' },
    { id: 'wave5', name: 'Sky Marshal', desc: 'Clear wave 5' }],
  'twin-blast': [
    { id: 'brute', name: 'Big Game', desc: 'Take down a brute' },
    { id: 'crew', name: 'Nobody Left Behind', desc: 'Clear a wave with all the crew saved' },
    { id: 'wave5', name: 'Arena Veteran', desc: 'Reach wave 5' }],
  'mole-patrol': [
    { id: 'rock', name: 'Rockslide', desc: 'Crush two pests with one rock' },
    { id: 'veg', name: 'Green Thumb', desc: 'Grab the bonus veggie' },
    { id: 'level5', name: 'Deep Digger', desc: 'Clear level 5' }],
  'turbo-tour': [
    { id: 'checkpoint', name: 'Checkpoint!', desc: 'Reach your first checkpoint' },
    { id: 'clean', name: 'Clean Lap', desc: 'Clear a stage without crashing' },
    { id: 'tour', name: 'World Tourist', desc: 'Make it through all four stages' }],
  'raptor-ridge': [
    { id: 'boss', name: 'Sleep Tight', desc: 'Put the big one to sleep' },
    { id: 'sharp', name: 'Sharpshooter', desc: 'Finish an area with 80% accuracy' },
    { id: 'escape', name: 'Valley Escape', desc: 'Clear all three areas' }],
  'marsh-marksman': [
    { id: 'pair', name: 'Double Up', desc: 'Hit both birds of a pair with two shots' },
    { id: 'perfect', name: 'Ten for Ten', desc: 'Hit every bird in a round' },
    { id: 'round10', name: 'Season Pro', desc: 'Reach round 10' }],
  'pixel-peaks': [
    { id: 'gems100', name: 'Gem Hoarder', desc: 'Collect 100 gems in one climb' },
    { id: 'stomp10', name: 'Critter Crusher', desc: 'Stomp 10 critters in one climb' },
    { id: 'peak5', name: 'Mountaineer', desc: 'Reach level 5' }],
  'pop-lagoon': [
    { id: 'drop10', name: 'Avalanche', desc: 'Drop 10 bubbles with one shot' },
    { id: 'clear', name: 'Clean Sweep', desc: 'Clear a whole board' },
    { id: 'level5', name: 'Deep Diver', desc: 'Reach level 5' }],
  'neon-steps': [
    { id: 'fullcombo', name: 'Full Combo', desc: 'Finish a song without a single miss' },
    { id: 'grade_a', name: 'Star Dancer', desc: 'Get an A or an S grade' },
    { id: 'hard', name: 'Hyper Drive', desc: 'Clear the hard song' }],
  'blast-brigade': [
    { id: 'pow5', name: 'Liberator', desc: 'Free 5 hostages in one run' },
    { id: 'boss', name: 'Tank Buster', desc: 'Destroy a heavy tank' },
    { id: 'stage3', name: 'Front Line', desc: 'Clear the third stage' }],
  'dungeon-delve': [
    { id: 'boss', name: 'Slime Slayer', desc: 'Defeat a dungeon guardian' },
    { id: 'floor3', name: 'Deep Delver', desc: 'Reach floor 3' },
    { id: 'gems100', name: 'Treasure Hunter', desc: 'Collect 100 gems in one run' }],
  'lucky-line': [
    { id: 'catch10', name: 'Full Bucket', desc: 'Catch 10 fish in one session' },
    { id: 'golden', name: 'Golden Koi', desc: 'Catch the golden koi' },
    { id: 'log', name: 'Master Angler', desc: 'Catch every kind of fish' }],
  'rampart-rush': [
    { id: 'wave10', name: 'Holdout', desc: 'Reach wave 10' },
    { id: 'flawless', name: 'None Shall Pass', desc: 'Hold five waves without losing a life' },
    { id: 'max', name: 'Fortified', desc: 'Fully upgrade a tower' }],
  'sky-squadron': [
    { id: 'boss', name: 'Ace Pilot', desc: 'Bring down a battleship or a sky fortress' },
    { id: 'power', name: 'Full Power', desc: 'Power your guns all the way up' },
    { id: 'stage3', name: 'Squadron Leader', desc: 'Reach the third stage' }],
  'street-sweepers': [
    { id: 'boss', name: 'Street Boss', desc: 'Beat a Rust Gang boss' },
    { id: 'clean', name: 'Clean Sweep', desc: 'Clear a street without losing a life' },
    { id: 'duo', name: 'Partners', desc: 'Clear a street with both players standing' }],
  'gem-cascade': [
    { id: 'cascade', name: 'Avalanche', desc: 'Set off a five-step cascade' },
    { id: 'star', name: 'Star Maker', desc: 'Make a star gem (five in a row)' },
    { id: 'daily', name: 'Daily Gem', desc: 'Finish a daily board' }],
  'knockout-kings': [
    { id: 'star', name: 'Star Punch', desc: 'Land a star punch' },
    { id: 'perfect', name: 'Untouchable', desc: 'Win a fight without being hit' },
    { id: 'champ', name: 'Champion', desc: 'Beat the Iron Duke for the belt' }],
  'tank-tactics': [
    { id: 'star3', name: 'Full Firepower', desc: 'Pick up three stars for a steel-breaking cannon' },
    { id: 'stage5', name: 'Tank Commander', desc: 'Clear stage 5' },
    { id: 'duo', name: 'Side by Side', desc: 'Clear a stage in 2P with both tanks still in it' }],
  'bomb-squad': [
    { id: 'stage5', name: 'Demolition Expert', desc: 'Clear adventure stage 5' },
    { id: 'champ', name: 'Last Squad Standing', desc: 'Win a battle match' },
    { id: 'blast', name: 'Big Bang', desc: 'Power your blast up to six' }],
  'paper-route': [
    { id: 'perfect', name: 'Perfect Delivery', desc: 'Deliver to every subscriber in a day' },
    { id: 'mailbox', name: 'Sharpshooter', desc: 'Land eight papers in mailboxes in one day' },
    { id: 'week', name: 'Full Week', desc: 'Finish a whole week of deliveries' }],
  'soda-slinger': [
    { id: 'tips', name: 'Showtime', desc: 'Grab a tip for a jukebox show' },
    { id: 'spotless', name: 'Spotless', desc: 'Clear a round without losing a life' },
    { id: 'moon', name: 'Out of This World', desc: 'Clear the Moon Base Cafe' }],
  'pipe-panic': [
    { id: 'cross', name: 'Crossroads', desc: 'Fill a crossover both ways' },
    { id: 'level5', name: 'Master Plumber', desc: 'Clear level 5' },
    { id: 'daily', name: 'Daily Plumber', desc: 'Finish a daily run' }],
  'boulder-bash': [
    { id: 'butterfly', name: 'Metamorphosis', desc: 'Turn a butterfly into diamonds' },
    { id: 'cave5', name: 'Deep Digger', desc: 'Clear cave 5' },
    { id: 'speedy', name: 'In a Hurry', desc: 'Clear a cave with 100 seconds to spare' }],
  'ten-pin-blitz': [
    { id: 'strike', name: 'Strike!', desc: 'Bowl a strike' },
    { id: 'turkey', name: 'Turkey', desc: 'Bowl three strikes in a row' },
    { id: 'game200', name: 'Two Hundred Club', desc: 'Score 200 in a game' }],
  'field-day': [
    { id: 'gold', name: 'Golden Games', desc: 'Qualify in all four events' },
    { id: 'sprint', name: 'Lightning', desc: 'Run the 100 metres in under 10.5 seconds' },
    { id: 'jav80', name: 'Long Throw', desc: 'Throw the javelin 80 metres' }],
  'blip-sports': [
    { id: 'fbwin', name: 'Gridiron Win', desc: 'Win a football game' },
    { id: 'bbwin', name: 'Ballpark Win', desc: 'Win a baseball game' },
    { id: 'shutout', name: 'Shutout', desc: 'Win without the CPU scoring' }]
};

/*
 * The weekly tournament: one featured game each week, with its own world board
 * (weekly/{game}/weeks/{monday}/scores). Weeks start on Monday 00:00 UTC, so everyone sees the same game.
 * It lives here because the lobby and every game load this file. ?feature=<slug> overrides it for testing.
 */
window.WEEKLY = (() => {
  // Single-player score games, mixed so neighbouring weeks feel different. Blip Sports counts wins, so it sits out.
  // The schedule runs down this list from the week of 12 October 2026 (Rock Rift), one game a week, then starts over.
  // Add new games at the END: that never changes the current week or the weeks before the list wraps round.
  const ROTATION = ['rock-rift', 'light-trail', 'wallbuster', 'garden-gunner', 'crater-lander', 'circuit-chase',
    'scaffold-scramble', 'back-alley-brawl', 'swarm-strike', 'highrise-handyman', 'volley-duel', 'turbo-tour', 'raptor-ridge', 'marsh-marksman',
    'pixel-peaks', 'pop-lagoon', 'neon-steps', 'twin-blast', 'stackdown', 'hedge-hop', 'wing-duel', 'neon-noodle', 'sky-shield', 'mole-patrol',
    'star-siege', 'nitro-lane', 'cube-hopper', 'blast-brigade', 'dungeon-delve', 'lucky-line', 'rampart-rush', 'sky-squadron', 'street-sweepers', 'gem-cascade', 'knockout-kings',
    'tank-tactics', 'bomb-squad', 'paper-route', 'soda-slinger', 'pipe-panic', 'boulder-bash', 'ten-pin-blitz', 'field-day'];
  const DAY = 864e5, EPOCH = Date.UTC(2024, 0, 1), FIRST = 145; // EPOCH is a Monday; week 145 is the one starting 2026-10-12
  const index = (now = Date.now()) => Math.floor((now - EPOCH) / (7 * DAY));
  const start = (now = Date.now()) => EPOCH + index(now) * 7 * DAY;
  let override = null; try { override = new URLSearchParams(location.search).get('feature'); } catch (e) {}
  return {
    rotation: ROTATION,
    /** This week's featured game slug. */
    game: (now = Date.now()) => override !== null ? override : ROTATION[(((index(now) - FIRST) % ROTATION.length) + ROTATION.length) % ROTATION.length],
    /** This week's id: the Monday it started, as YYYY-MM-DD (UTC). */
    key: (now = Date.now()) => new Date(start(now)).toISOString().slice(0, 10),
    /** Milliseconds until the tournament ends and the next game takes over. */
    left: (now = Date.now()) => start(now) + 7 * DAY - now,
    /** "3D 04H" / "5H 12M" style countdown. */
    leftText(now = Date.now()) {
      const m = Math.max(0, Math.floor(this.left(now) / 6e4)), d = Math.floor(m / 1440), h = Math.floor(m / 60) % 24;
      return d ? `${d}D ${String(h).padStart(2, '0')}H` : `${h}H ${String(m % 60).padStart(2, '0')}M`;
    }
  };
})();

/*
 * Tickets: earned in every game (shared/arcade.js: a few per finished game, more for records, 10 per badge,
 * double on the weekly tournament game) and spent at the lobby's prize counter (shared/prizes.js) on cosmetics.
 * arcade:tickets is the balance, arcade:tickets:earned the lifetime total.
 */
window.TICKETS = (() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode: tickets just don't stick */ } };
  // Kept as two running totals (earned, spent) so cloud save can merge devices; arcade:tickets caches the balance.
  function totals() {
    let e = get('arcade:tickets:earned'), sp = get('arcade:tickets:spent');
    if (e === null) {
      // First visit since tickets arrived: 20 to start, plus back pay for badges already earned and games played.
      let start = 20;
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('arcade:badges:')) { const l = JSON.parse(get(k)); start += 10 * (Array.isArray(l) ? l.length : 0); }
          else if (k.startsWith('arcade:plays:')) start += Math.min(+get(k) || 0, 50);
        });
      } catch (err) {}
      e = start; sp = 0; set('arcade:tickets:earned', e); set('arcade:tickets:spent', 0); set('arcade:tickets', e);
    } else if (sp === null) { sp = Math.max(0, (+e || 0) - (+get('arcade:tickets') || 0)); set('arcade:tickets:spent', sp); } // from the balance-only days
    return { e: +e || 0, s: +sp || 0 };
  }
  const balance = () => { const t = totals(); return Math.max(0, t.e - t.s); };
  return {
    balance,
    earned: () => totals().e,
    /** Add n tickets; returns the new balance. */
    add(n) { const t = totals(); set('arcade:tickets:earned', t.e + n); set('arcade:tickets', Math.max(0, t.e + n - t.s)); return balance(); },
    /** Spend n tickets if there are enough; returns true when spent. */
    spend(n) { const t = totals(); if (t.e - t.s < n) return false; set('arcade:tickets:spent', t.s + n); set('arcade:tickets', t.e - t.s - n); return true; }
  };
})();

/*
 * Daily missions: three a day (local date), the same for everyone that day: a score to reach in one game, a kind of
 * play (different games, an area, the tournament, a daily challenge) and something on the arcade floor. Each pays
 * 10 tickets, and all three pay 20 more. Progress comes from MISSIONS.record(event): arcade.js sends
 * { type: 'run', slug, score, daily } after every game that counts (not easy mode, not demos); the floor sends
 * skee, pinball, claw and photo events; Blip Sports sends blip-win. Kept per device in bitcade:missions.
 */
/*
 * Seasonal events (window.EVENT): each runs between two dates every year, by the local calendar. While Halloween is
 * on, the lobby and the arcade floor dress up (pumpkins, cobwebs, bats, orange light), five ghosts a day hide on the
 * floor, the floor mission becomes a ghost hunt, and two prizes (event: 'halloween' in prizes.js) can be bought.
 * ?event=halloween (or none) forces one for the visit, for testing.
 */
window.EVENT = (() => {
  const EVENTS = [{ id: 'halloween', name: 'HALLOWEEN AT BITCADE', from: '10-20', to: '10-31' }];
  const md = d => String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  let force = null;
  try { const m = /[?&]event=(\w+)/.exec(location.search); if (m) sessionStorage.setItem('bitcade:event', m[1]); force = sessionStorage.getItem('bitcade:event'); } catch (e) {}
  function current() {
    if (force) return force === 'none' ? null : EVENTS.find(e => e.id === force) || null;
    const k = md(new Date()); return EVENTS.find(e => k >= e.from && k <= e.to) || null;
  }
  return { EVENTS, current, on: id => { const c = current(); return !!c && (!id || c.id === id); } };
})();

window.MISSIONS = (() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  // a score you can reach with a decent run (about two or three times what the demo bot gets in fifteen seconds)
  const TARGETS = {
    'neon-noodle': 300, wallbuster: 500, 'star-siege': 800, 'rock-rift': 3000, stackdown: 2000, 'back-alley-brawl': 1500,
    'circuit-chase': 1500, 'highrise-handyman': 8000, 'nitro-lane': 1500, 'volley-duel': 60, 'crater-lander': 800, 'sky-shield': 1000,
    'hedge-hop': 1500, 'scaffold-scramble': 500, 'swarm-strike': 4000, 'garden-gunner': 1500, 'cube-hopper': 1200, 'light-trail': 500,
    'wing-duel': 1500, 'twin-blast': 5000, 'mole-patrol': 1500, 'turbo-tour': 6000, 'raptor-ridge': 4000, 'marsh-marksman': 8000,
    'pixel-peaks': 3000, 'pop-lagoon': 3000, 'neon-steps': 25000,
    'blast-brigade': 3000, 'dungeon-delve': 800, 'lucky-line': 300, 'rampart-rush': 2500,
    'sky-squadron': 12000, 'street-sweepers': 2500, 'gem-cascade': 3500, 'knockout-kings': 4000,
    'tank-tactics': 2000, 'bomb-squad': 1000, 'paper-route': 5000, 'soda-slinger': 6000, 'pipe-panic': 1500, 'boulder-bash': 3000, 'ten-pin-blitz': 120, 'field-day': 4000
  };
  const AREAS = { RACEWAY: ['turbo-tour', 'nitro-lane', 'light-trail'], 'SHOOTING GALLERY': ['raptor-ridge', 'marsh-marksman'] };
  const DAILY = ['stackdown', 'wallbuster', 'twin-blast', 'mole-patrol', 'wing-duel', 'gem-cascade', 'pipe-panic'];
  const name = slug => slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const REWARD = 10, BONUS = 20;
  function rng(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function make(d) {
    const r = rng('missions:' + d), pick = a => a[Math.floor(r() * a.length)];
    const slugs = Object.keys(TARGETS), g = pick(slugs);
    const feat = window.WEEKLY && WEEKLY.game ? WEEKLY.game() : null;
    const plays = [
      { kind: 'variety', n: 3 }, { kind: 'variety', n: 4 }, { kind: 'plays', n: 5 },
      { kind: 'area', area: 'RACEWAY', n: 2 }, { kind: 'area', area: 'SHOOTING GALLERY', n: 2 },
      { kind: 'daily', game: pick(DAILY), n: 1 }
    ];
    if (feat && TARGETS[feat]) plays.push({ kind: 'tour', game: feat, n: 1 }, { kind: 'tour', game: feat, n: 1 });
    const floor = window.EVENT && EVENT.on('halloween') ? [{ kind: 'ghost', n: 3 }, { kind: 'ghost', n: 5 }] : [{ kind: 'skee', n: 250 }, { kind: 'skee', n: 300 }, { kind: 'pinball', n: 8000 }, { kind: 'pinball', n: 12000 }, { kind: 'claw', n: 1 }, { kind: 'photo', n: 1 }, { kind: 'blip', n: 1 }, { kind: 'hoops', n: 20 }, { kind: 'bop', n: 20 }];
    const t = TARGETS[g] * (r() < 0.3 ? 2 : 1);
    return { d, list: [{ kind: 'score', game: g, n: t }, pick(plays), pick(floor)].map((m, i) => ({ id: i, prog: 0, done: false, seen: [], ...m })), bonus: false };
  }
  function load() {
    let m = null; try { m = JSON.parse(get('bitcade:missions')); } catch (e) {}
    if (!m || m.d !== today() || !Array.isArray(m.list)) { m = make(today()); set('bitcade:missions', JSON.stringify(m)); }
    return m;
  }
  const text = m => ({
    score: () => `Score ${m.n.toLocaleString()} in ${name(m.game)}`,
    variety: () => `Play ${m.n} different games`,
    plays: () => `Play ${m.n} games`,
    area: () => `Play ${m.n} ${m.area === 'RACEWAY' ? 'Raceway' : 'Shooting Gallery'} games`,
    daily: () => `Play today's ${name(m.game)} daily challenge`,
    tour: () => `Play this week's tournament: ${name(m.game)}`,
    skee: () => `Roll ${m.n} or more in skee-ball`,
    pinball: () => `Score ${m.n.toLocaleString()} in pinball`,
    claw: () => 'Win tickets at the Mega Claw',
    photo: () => 'Take a photo booth strip',
    blip: () => 'Win a game of Blip Sports',
    hoops: () => `Score ${m.n} at the hoop shooter`,
    bop: () => `Bop ${m.n} points at Bop-a-Bot`,
    ghost: () => `Find ${m.n} ghosts on the arcade floor`
  }[m.kind] || (() => 'Mission'))();
  /** Where you go to do it: a game page, or the arcade floor. */
  const where = m => m.game ? `games/${m.game}/` : ['skee', 'pinball', 'claw', 'photo', 'hoops', 'bop', 'ghost'].includes(m.kind) ? 'floor' : m.kind === 'blip' ? 'games/blip-sports/' : null;
  /** Count an event; returns { done: [missions just finished], tickets, all }. */
  function record(ev) {
    const m = load(), done = [];
    for (const x of m.list) {
      if (x.done) continue;
      let p = x.prog;
      if (ev.type === 'run') {
        if (x.kind === 'score' && ev.slug === x.game) p = Math.max(p, ev.score);
        if (x.kind === 'plays') p++;
        if (x.kind === 'variety' && !x.seen.includes(ev.slug)) { x.seen.push(ev.slug); p = x.seen.length; }
        if (x.kind === 'area' && AREAS[x.area].includes(ev.slug)) p++;
        if (x.kind === 'daily' && ev.daily && ev.slug === x.game) p = 1;
        if (x.kind === 'tour' && ev.slug === x.game) p = 1;
      }
      if (ev.type === 'skee' && x.kind === 'skee') p = Math.max(p, ev.score);
      if (ev.type === 'pinball' && x.kind === 'pinball') p = Math.max(p, ev.score);
      if ((ev.type === 'hoops' || ev.type === 'bop') && x.kind === ev.type) p = Math.max(p, ev.score);
      if (ev.type === 'claw' && x.kind === 'claw' && ev.won) p = 1;
      if (ev.type === 'photo' && x.kind === 'photo') p = 1;
      if (ev.type === 'blip-win' && x.kind === 'blip') p = 1;
      if (ev.type === 'ghost' && x.kind === 'ghost') p = Math.max(p, ev.found);
      x.prog = p;
      if (p >= x.n) { x.done = true; done.push(x); }
    }
    let tickets = done.length * REWARD, all = false;
    if (!m.bonus && m.list.every(x => x.done)) { m.bonus = true; all = true; tickets += BONUS; }
    set('bitcade:missions', JSON.stringify(m));
    if (tickets && window.TICKETS) TICKETS.add(tickets);
    return { done, tickets, all };
  }
  /** Time left until new missions (local midnight), like 5H 12M. */
  function left() { const n = new Date(), mid = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1), m = Math.max(0, Math.floor((mid - n) / 6e4)); return `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M`; }
  return { list: () => load().list, bonus: () => load().bonus, record, text, where, left, REWARD, BONUS, TARGETS };
})();

/*
 * The VIP room on the arcade floor. It opens for good (bitcade:vip) once you have 30 badges, or 3 mastered cabinets
 * (every badge in a game), or 1,500 tickets earned in all. ?vip=1 opens it for testing. It unlocks VIP-only prizes too.
 */
window.VIP = (() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const NEED = { badges: 30, mastered: 3, earned: 1500 };
  function status() {
    const all = window.BADGES || {}; let badges = 0, mastered = 0;
    for (const slug of Object.keys(all)) {
      let got = []; try { got = JSON.parse(get('arcade:badges:' + slug)) || []; } catch (e) {}
      const n = all[slug].filter(b => got.includes(b.id)).length; badges += n; if (all[slug].length && n === all[slug].length) mastered++;
    }
    const earned = window.TICKETS ? TICKETS.earned() : 0;
    const met = badges >= NEED.badges || mastered >= NEED.mastered || earned >= NEED.earned;
    const test = /[?&]vip=1\b/.test(location.search);
    if (met) try { localStorage.setItem('bitcade:vip', '1'); } catch (e) {}
    return { unlocked: met || test || get('bitcade:vip') === '1', badges, mastered, earned, NEED };
  }
  return { status, unlocked: () => status().unlocked, NEED };
})();

/*
 * Player level: XP from everything you do (window.XP). arcade:xp is the lifetime total (cloud save adds it up when
 * a device joins, otherwise keeps the higher). Level n needs 50 + 20n more XP than the last, up to 50. Levels give
 * titles, a nameplate on the arcade floor and free prizes (prizes.js items with a `level`), which are added to
 * arcade:prizes as soon as you reach them. Sources: a scoring run 10 (+10 top 10, +15 new record, +5 daily, double
 * on the tournament game), a badge 50, a mission 30 (+50 for all three), a floor game 8, a Blip Sports win 20.
 */
window.XP = (() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) {} };
  const MAX = 50, need = n => 50 + 20 * n; // XP to go from level n to n + 1
  const TITLES = [[1, 'ROOKIE'], [3, 'COIN SLINGER'], [5, 'BUTTON MASHER'], [8, 'JOYSTICK JOCKEY'], [12, 'HIGH SCORER'], [16, 'ARCADE RAT'],
    [20, 'COMBO CRUSHER'], [25, 'PIXEL PRO'], [30, 'CABINET CHAMPION'], [35, 'NEON LEGEND'], [40, 'GRAND MASTER'], [45, 'HALL OF FAMER'], [50, 'BITCADE LEGEND']];
  // what each level unlocks besides titles: prize ids (see prizes.js), and the floor nameplate at 3
  const REWARDS = { 3: 'nameplate', 6: 'varsity', 10: 'starfield', 14: 'skater', 18: 'racetrack', 24: 'captain', 32: 'synthwave', 40: 'aurora', 50: 'legend' };
  function total() {
    let x = get('arcade:xp');
    if (x === null) { // first visit since levels arrived: back pay for games played and badges earned
      let v = 0;
      try { Object.keys(localStorage).forEach(k => { if (k.startsWith('arcade:plays:')) v += (+localStorage.getItem(k) || 0) * 12; if (k.startsWith('arcade:badges:')) { try { v += (JSON.parse(localStorage.getItem(k)) || []).length * 50; } catch (e) {} } }); } catch (e) {}
      set('arcade:xp', v); x = v;
    }
    return +x || 0;
  }
  function info(xp = total()) {
    let level = 1, rest = xp;
    while (level < MAX && rest >= need(level)) { rest -= need(level); level++; }
    const title = TITLES.filter(t => t[0] <= level).pop()[1];
    const next = Object.keys(REWARDS).map(Number).find(l => l > level);
    return { xp, level, into: rest, need: level < MAX ? need(level) : 0, pct: level < MAX ? rest / need(level) : 1, title, nextReward: next ? { level: next, id: REWARDS[next] } : null };
  }
  /** Prize ids unlocked by level so far: make sure they're in arcade:prizes (free). */
  function grant(level) {
    let owned = []; try { owned = JSON.parse(get('arcade:prizes')) || []; } catch (e) {}
    const want = Object.entries(REWARDS).filter(([l, id]) => +l <= level && id !== 'nameplate').map(([, id]) => id).filter(id => !owned.includes(id));
    if (want.length) set('arcade:prizes', JSON.stringify([...owned, ...want]));
    return want;
  }
  const fns = [];
  /** Add XP; returns { gained, level, up (levels gained), unlocked (prize ids), title }. */
  function add(n, why) {
    n = Math.max(0, Math.round(n)); const before = info();
    set('arcade:xp', before.xp + n);
    if (window.PASS) PASS.gain(n); // the same XP climbs the Arcade Pass
    const after = info(), up = after.level - before.level, unlocked = up ? grant(after.level) : [];
    const r = { gained: n, why, before, after, up, unlocked, newTitle: after.title !== before.title ? after.title : null };
    fns.forEach(f => { try { f(r); } catch (e) {} });
    return r;
  }
  grant(info().level);
  return { total, info, add, need, MAX, TITLES, REWARDS, onChange: fn => fns.push(fn), titleAt: l => TITLES.filter(t => t[0] <= l).pop()[1] };
})();

/*
 * The Arcade Pass: seasons of 50 tiers, climbed with the same XP as player levels (XP.add feeds PASS.gain while a
 * season is on). Every tier has a reward on the pass track, and some have one on the free track too: tickets, or
 * prizes from shared/prizes.js marked pass: '<season>' (a pass-only tint, cabinet finish, outfit or carpet). Rewards
 * are claimed by hand in the lobby (shared/pass.js) and stay claimable until the season ends.
 * Kept per season: arcade:pass:xp:<id> (season XP), arcade:pass:got:<id> (claimed rewards, 'f12' / 'p12') and
 * arcade:pass:own:<id> ('1' with the pass). There is no shop for it yet: ?pass=1 turns it on for testing.
 */
window.PASS = (() => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) {} };
  const TIERS = 50, STEP = 100; // XP per tier
  const tix = n => ({ t: 'tix', n }), prize = id => ({ t: 'prize', id });
  const SEASONS = [{
    id: 's1', name: 'NEON NIGHTS', start: '2026-10-19', end: '2027-01-11', // Mondays, UTC; twelve weeks
    free: { 2: tix(10), 4: tix(10), 6: tix(15), 8: prize('cyber'), 11: tix(15), 14: tix(20), 17: tix(20), 20: prize('tracksuit'), 23: tix(20), 26: tix(25), 29: tix(25), 32: tix(25), 35: prize('arcadered'), 38: tix(30), 41: tix(30), 44: tix(30), 47: tix(40), 50: prize('circuit') },
    pass: { 1: prize('synth'), 5: prize('neonrider'), 10: prize('infrared'), 15: prize('dancefloor'), 20: prize('midnight'), 25: prize('dj'), 30: prize('prism'), 35: prize('phantom'), 40: prize('magma'), 45: prize('starlight'), 50: prize('diamond') }
  }];
  // every other tier on the pass track pays tickets
  SEASONS.forEach(se => { for (let i = 1; i <= TIERS; i++) if (!se.pass[i]) se.pass[i] = tix(i % 5 === 0 ? 50 : 20 + Math.floor(i / 10) * 5); });
  const day = d => Date.parse(d + 'T00:00:00Z');
  const season = (now = Date.now()) => SEASONS.find(se => now >= day(se.start) && now < day(se.end)) || null;
  const next = (now = Date.now()) => SEASONS.find(se => now < day(se.start)) || null;
  try { if (/[?&]pass=1\b/.test(location.search)) SEASONS.forEach(se => set('arcade:pass:own:' + se.id, 1)); } catch (e) {}
  const xp = (se = season()) => se ? +get('arcade:pass:xp:' + se.id) || 0 : 0;
  const tier = (se = season()) => Math.min(TIERS, Math.floor(xp(se) / STEP));
  const owned = (se = season()) => !!se && get('arcade:pass:own:' + se.id) === '1';
  const got = (se = season()) => { try { const g = JSON.parse(get('arcade:pass:got:' + (se && se.id))); return Array.isArray(g) ? g : []; } catch (e) { return []; } };
  const fns = [];
  /** Season XP from XP.add; returns { before, after } tiers when a season is on. */
  function gain(n) {
    const se = season(); if (!se || !n) return null;
    const before = tier(se); set('arcade:pass:xp:' + se.id, xp(se) + n);
    const r = { before, after: tier(se) }; fns.forEach(f => { try { f(r); } catch (e) {} }); return r;
  }
  /** What's waiting to be claimed: [{ key, track, tier, reward }]. Pass rewards only count with the pass. */
  function ready(se = season()) {
    if (!se) return [];
    const t = tier(se), g = got(se), out = [];
    for (let i = 1; i <= t; i++) {
      if (se.free[i] && !g.includes('f' + i)) out.push({ key: 'f' + i, track: 'free', tier: i, reward: se.free[i] });
      if (owned(se) && !g.includes('p' + i)) out.push({ key: 'p' + i, track: 'pass', tier: i, reward: se.pass[i] });
    }
    return out;
  }
  /** Claim one reward by key ('f8', 'p12'); true when it was given. */
  function claim(key) {
    const se = season(); if (!se) return false;
    const r = ready(se).find(x => x.key === key); if (!r) return false;
    if (r.reward.t === 'tix' && window.TICKETS) TICKETS.add(r.reward.n);
    if (r.reward.t === 'prize') { let o = []; try { o = JSON.parse(get('arcade:prizes')) || []; } catch (e) {} if (!o.includes(r.reward.id)) set('arcade:prizes', JSON.stringify([...o, r.reward.id])); }
    set('arcade:pass:got:' + se.id, JSON.stringify([...got(se), key]));
    return true;
  }
  const claimAll = () => ready().map(r => claim(r.key) && r).filter(Boolean);
  const left = (se = season()) => se ? Math.max(0, day(se.end) - Date.now()) : 0;
  return { TIERS, STEP, SEASONS, season, next, xp, tier, owned, got, gain, ready, claim, claimAll, left, onChange: fn => fns.push(fn) };
})();
