/*
 * Badges for every game. Games unlock them with Arcade.badge(id); the lobby shows how many each player has.
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
  'blip-sports': [
    { id: 'fbwin', name: 'Gridiron Win', desc: 'Win a football game' },
    { id: 'bbwin', name: 'Ballpark Win', desc: 'Win a baseball game' },
    { id: 'shutout', name: 'Shutout', desc: 'Win without the CPU scoring' }]
};
