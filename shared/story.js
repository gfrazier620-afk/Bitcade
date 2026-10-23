/*
 * Story mode for the flagship games: a campaign of named stages on a map, an intro and an ending, upgrades bought with
 * the game's own currency, HARD mode and a bonus mode (boss rush, time trial) once the story is beaten. Loaded after
 * arcade.js. Story runs never touch the score tables (upgrades would make them unfair); they pay XP, and tickets for
 * beating the story, except in easy mode.
 *
 *   const S = Story({ title, coin: 'GEMS', coinColor, stages: [{ name, sub }], upgrades: [{ id, name, desc, cost: [..] }],
 *                     mode: { id, name, desc, lower }, intro: [lines], ending: [lines], cast: [[role, name]],
 *                     play(run), stop() });
 *   S.title(args)  the title overlay with a ★ STORY button added
 *   S.run          the run in progress ({ stage, hard, mode: 'story' | <mode id> }), or null in arcade play
 *   S.lv(id)       an upgrade's level in story runs (0 in arcade play)
 *   S.reach(i), S.clear(i), S.bank(n), S.fail({ title, big, sub }), S.win(), S.modeEnd(value, { title, big, sub })
 *   S.quit()       an alt button for the pause screen in story runs (undefined otherwise)
 *
 * Saved in arcade:story:<slug>: { at (furthest stage unlocked), done, hard (beaten on hard), earned, spent, up: { id: level },
 * best (bonus mode; times are stored negative so higher is always better), intro (seen) }. Cloud save merges it field by field.
 */
window.Story = cfg => {
  const A = Arcade, KEY = 'arcade:story:' + A.id;
  const load = () => { try { const v = JSON.parse(A.store.get(KEY)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
  const fresh = () => Object.assign({ at: 0, done: 0, hard: 0, earned: 0, spent: 0, up: {}, best: 0, intro: 0 }, load());
  let sv = fresh();
  const save = () => A.store.set(KEY, JSON.stringify(sv));
  const bank = () => Math.max(0, sv.earned - sv.spent);
  const N = cfg.stages.length, coinC = cfg.coinColor || '#ffd23d';
  const S = { run: null, cfg };
  let el = null, tab = 'map', sel = 0, hard = false, scene = null;
  const fmt = v => cfg.mode && cfg.mode.lower ? (v ? (-v / 1000).toFixed(2) + 's' : '—') : (v ? v.toLocaleString() : '—');
  const rewards = () => !A.demo && !A.runEasy();

  /* ---------- the map ---------- */
  function build() {
    el = document.createElement('div'); el.className = 'story'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', cfg.title);
    document.querySelector('.screen').append(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return; A.unlock();
      if (b.dataset.stage) { if (+b.dataset.stage === sel) return play(); sel = +b.dataset.stage; A.sfx('select'); render(); focus(`[data-stage="${sel}"]`); } // a second tap plays it
      else if (b.dataset.tab) { tab = b.dataset.tab; A.sfx('select'); render(); focus(tab === 'up' ? '[data-up]' : `[data-stage="${sel}"]`); }
      else if (b.dataset.up) buy(b.dataset.up);
      else if (b.dataset.act === 'hard') { hard = !hard; A.sfx('select'); render(); focus('[data-act="hard"]'); }
      else if (b.dataset.act === 'mode') start({ stage: 0, hard: false, mode: cfg.mode.id });
      else if (b.dataset.act === 'intro') cutscene(cfg.intro, 'PROLOGUE', () => S.open());
      else if (b.dataset.act === 'play') play();
      else if (b.dataset.act === 'back') back();
    });
  }
  // on the game screen, or over the whole page on phones (the cabinet's effects would trap it inside the small screen)
  const small = matchMedia('(max-width: 760px), (max-height: 520px)');
  const place = () => { const host = small.matches ? document.body : document.querySelector('.screen'); if (el.parentNode !== host) host.append(el); };
  const focus = q => { const b = el && el.querySelector(q); if (b) b.focus({ preventScroll: false }); };
  function render() {
    const unlocked = Math.min(N - 1, sv.at), st = cfg.stages[sel];
    const nodes = cfg.stages.map((s, i) => `<button class="st-node${i === sel ? ' on' : ''}${i < sv.at || (sv.done && i <= unlocked) ? ' clear' : ''}" data-stage="${i}" ${i > unlocked ? 'disabled' : ''} aria-label="${i + 1}: ${s.name}${i > unlocked ? ' (locked)' : ''}">${i > unlocked ? '🔒' : i + 1}</button>`).join('<i></i>');
    const ups = (cfg.upgrades || []).map(u => {
      const l = sv.up[u.id] || 0, max = u.cost.length, cost = u.cost[l];
      return `<button class="st-up" data-up="${u.id}" ${l >= max ? 'disabled' : ''}><b>${u.name}</b><span class="pips">${'●'.repeat(l)}${'○'.repeat(max - l)}</span><small>${u.desc}</small><em>${l >= max ? 'MAXED' : `${cost} ${cfg.coin}`}</em></button>`;
    }).join('');
    el.innerHTML = `<div class="st-head"><b>${cfg.title}</b><span class="st-bank" style="color:${coinC}">${bank().toLocaleString()} ${cfg.coin}</span></div>
      <div class="st-tabs"><button data-tab="map" aria-pressed="${tab === 'map'}">★ STORY</button><button data-tab="up" aria-pressed="${tab === 'up'}">▲ UPGRADES</button></div>` +
      (tab === 'map' ? `<div class="st-path">${nodes}</div>
      <div class="st-info"><h3>${sel + 1} · ${st.name}</h3><p>${st.sub || ''}</p><small>${sel < sv.at || sv.done ? '✓ CLEARED' : 'NOT CLEARED YET'}${sv.done ? ' · STORY BEATEN' + (sv.hard ? ' ON HARD ★' : '') : ''}</small></div>
      <div class="st-opts">${cfg.intro ? '<button class="st-opt" data-act="intro">▤ PROLOGUE</button>' : ''}${sv.done ? `<button class="st-opt${hard ? ' on' : ''}" data-act="hard" aria-pressed="${hard}">${hard ? '☑' : '☐'} HARD</button>` : '<span class="st-lock">🔒 HARD and ' + (cfg.mode ? cfg.mode.name : 'more') + ' open when you beat the story</span>'}${sv.done && cfg.mode ? `<button class="st-opt mode" data-act="mode">${cfg.mode.name} · BEST ${fmt(sv.best)}</button>` : ''}</div>`
      : `<div class="st-ups">${ups}</div><p class="st-note">Upgrades work in story mode. Arcade mode stays the same for everyone, so its scores stay fair.</p>`) +
      `<div class="btns"><button class="go" data-act="play">${tab === 'map' ? (hard ? 'PLAY ON HARD ▶' : 'PLAY ▶') : 'BACK TO MAP'}</button><button class="go2" data-act="back">EXIT</button></div>
      <small class="st-keys">ARROWS pick · ENTER play · TAB upgrades · ESC exit</small>`;
  }
  function buy(id) {
    const u = cfg.upgrades.find(x => x.id === id), l = sv.up[id] || 0, cost = u && u.cost[l];
    if (!u || cost == null) return;
    if (bank() < cost) { A.tone(160, 0.12, 'square', 0.04); return; }
    sv.spent += cost; sv.up[id] = l + 1; save(); A.jingle([660, 880, 1320], 0.06, 'square'); render(); focus(`[data-up="${id}"]`);
  }
  function play() {
    if (tab === 'up') { tab = 'map'; render(); focus(`[data-stage="${sel}"]`); return; }
    const go = () => start({ stage: sel, hard, mode: 'story' });
    if (sel === 0 && !sv.intro && cfg.intro) { sv.intro = 1; save(); cutscene(cfg.intro, 'PROLOGUE', go); } else go();
  }
  function start(run) {
    close(); S.run = run; A.startRun(); A.hideOverlay(); cfg.play(run);
  }
  function back() { close(); S.run = null; if (cfg.stop) cfg.stop(); if (titleArgs) A.overlay(titleArgs); }
  function close() { if (el) el.hidden = true; scene = null; }
  /** Show the map (from the title screen, a game over or the pause screen). */
  S.open = () => {
    if (!el) build();
    A.hideOverlay(); if (window.Chip) Chip.volume(0.5);
    S.run = null; if (cfg.stop) cfg.stop(); sv = fresh(); // cloud save may have brought progress from another device
    sel = Math.min(sel, Math.min(N - 1, sv.at)); tab = 'map'; place(); el.hidden = false; render(); focus(`[data-stage="${sel}"]`);
    if (sv.at === 0 && !sv.intro) sel = 0;
  };
  const isOpen = () => !!el && !el.hidden;

  /* ---------- cutscenes: the prologue and the ending (with credits) ---------- */
  function cutscene(lines, head, then, credits) {
    if (!el) build();
    place(); el.hidden = false; scene = { then };
    el.innerHTML = `<div class="st-scene${credits ? ' end' : ''}"><div class="st-kicker">${head}</div><div class="st-lines"></div>${credits ? '<div class="st-credits"></div>' : ''}<button class="go" data-scene>CONTINUE ▶</button></div>`;
    const box = el.querySelector('.st-lines'); let i = 0;
    const nextLine = () => {
      if (!scene) return;
      if (i >= lines.length) { if (credits) rollCredits(); return; }
      const p = document.createElement('p'); p.textContent = lines[i++]; box.append(p); A.tone(520 + i * 40, 0.05, 'triangle', 0.025);
      scene.t = setTimeout(nextLine, 1500);
    };
    nextLine();
    const btn = el.querySelector('[data-scene]'); btn.focus();
    btn.addEventListener('click', () => { if (!scene) return; if (i < lines.length) { clearTimeout(scene.t); while (i < lines.length) { const p = document.createElement('p'); p.textContent = lines[i++]; box.append(p); } if (credits) rollCredits(); return; } const f = scene.then; clearTimeout(scene.t); clearInterval(scene.fx); scene = null; f(); });
    function rollCredits() {
      const c = el.querySelector('.st-credits'); if (!c || c.childElementCount) return;
      const name = (document.querySelector('.bar h1') || {}).textContent || '';
      c.innerHTML = `<b class="st-end">THE END</b>` + (cfg.cast || []).map(([r, n]) => `<div><small>${r}</small><span>${n}</span></div>`).join('') +
        `<div><small>A BITCADE ORIGINAL</small><span>${name}</span></div><div><small>AND STARRING</small><span>YOU</span></div><b class="st-thanks">THANKS FOR PLAYING</b>`;
      A.jingle([523, 659, 784, 1047, 784, 1047, 1319, 1568, 1319, 1568, 2093], 0.12, 'square');
      scene.fx = setInterval(() => { if (!scene) return; A.burst(A.W * (0.15 + Math.random() * 0.7), A.H * (0.2 + Math.random() * 0.4), { n: 24, colors: ['#ffd23d', '#ff4fd1', '#5ee7ff', '#3dff8f', '#fff'], speed: 200, life: 1.1, gravity: 160 }); A.tone(300 + Math.random() * 600, 0.15, 'triangle', 0.02); }, 700);
    }
  }

  /* ---------- keys and controller while the map or a cutscene is up ---------- */
  function nav(code) {
    if (!isOpen()) return false;
    if (scene) { if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { const b = el.querySelector('[data-scene]'); if (b) b.click(); } return true; }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
    if (dirs[code]) { step(...dirs[code]); return true; }
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { const b = document.activeElement && el.contains(document.activeElement) ? document.activeElement : el.querySelector('[data-act="play"]'); if (b && !b.disabled) b.click(); return true; }
    if (code === 'Tab' || code === 'KeyU') { tab = tab === 'map' ? 'up' : 'map'; A.sfx('select'); render(); focus(tab === 'up' ? '[data-up]' : `[data-stage="${sel}"]`); return true; }
    if (code === 'Escape' || code === 'KeyP' || code === 'Backspace') { back(); return true; }
    if (code === 'KeyH' && sv.done) { hard = !hard; render(); focus('[data-act="hard"]'); return true; }
    return true; // everything else is swallowed while the map is up
  }
  // arrows move to the nearest button that way; on the map row they also pick the stage
  function step(dx, dy) {
    const all = [...el.querySelectorAll('button:not([disabled])')], cur = el.contains(document.activeElement) ? document.activeElement : all[0];
    if (!cur) return;
    const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bd = 1e9;
    for (const b of all) {
      if (b === cur) continue; const r = b.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const along = dx ? x * dx : y * dy, across = dx ? Math.abs(y) : Math.abs(x); if (along <= 4) continue;
      const d = along + across * 2.2; if (d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    A.sfx('select');
    if (best.dataset.stage) { sel = +best.dataset.stage; render(); focus(`[data-stage="${sel}"]`); } else best.focus();
  }
  addEventListener('keydown', e => {
    if (!isOpen() || document.documentElement.classList.contains('set-open')) return; // the settings panel is on top
    e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat && !/^Arrow/.test(e.code)) return;
    A.unlock(); nav(e.code);
  }, true);
  A.keyHook = code => isOpen() ? nav(code) : false; // controller presses come through the kit as key codes
  A.padHook = i => { if (!isOpen()) return false; if (i === 1) nav('Escape'); else if (i === 3) nav('Tab'); else if (i === 0 || i === 9) nav('Enter'); else return false; return true; };

  /* ---------- what games call ---------- */
  let titleArgs = null;
  S.title = args => { titleArgs = { ...args, alt: { btn: '★ STORY', onGo: S.open } }; A.overlay(titleArgs); };
  S.lv = id => S.run ? sv.up[id] || 0 : 0;
  S.stageName = i => (cfg.stages[i] || {}).name || '';
  S.done = () => !!sv.done;
  S.reach = i => { if (!S.run || S.run.mode !== 'story') return; if (i > sv.at && i < N) { sv.at = i; save(); } };
  /** Stage i finished. Returns true when it was the last one (call S.win). */
  S.clear = i => {
    if (!S.run || S.run.mode !== 'story') return false;
    const first = i >= sv.at && !sv.done;
    if (i + 1 > sv.at && i + 1 < N) sv.at = i + 1;
    save();
    if (rewards()) A.gainXP(first ? 30 : 5, 'story', true);
    return i >= N - 1;
  };
  S.bank = n => { if (!S.run || !n) return; sv.earned += Math.round(n); save(); };
  S.fail = (o = {}) => {
    const run = S.run;
    A.overlay({ title: o.title || 'GAME OVER', big: o.big || '', sub: (o.sub ? o.sub + '<br>' : '') + `${bank().toLocaleString()} ${cfg.coin} IN THE BANK · spend them on upgrades`, btn: 'Retry', onGo: () => { S.run = run; A.startRun(); cfg.play(run); }, alt: { btn: 'Story map', onGo: S.open } });
  };
  S.win = () => {
    const wasHard = S.run && S.run.hard, firstDone = !sv.done, firstHard = wasHard && !sv.hard, pay = rewards();
    sv.done = 1; sv.at = N - 1; if (wasHard) sv.hard = 1; save();
    S.run = null;
    if (pay && (firstDone || firstHard)) {
      const t = firstHard ? 150 : 100; if (window.TICKETS) TICKETS.add(t);
      A.gainXP(firstHard ? 200 : 150, 'story', true);
      setTimeout(() => A.toast(`★ STORY BEATEN${firstHard ? ' ON HARD' : ''} · +${t} TICKETS`), 600);
    }
    A.hideOverlay(); if (window.Chip) Chip.volume(0.5);
    cutscene(cfg.ending, wasHard ? 'THE END · HARD MODE' : 'THE END', () => S.open(), true);
  };
  S.modeEnd = (value, o = {}) => {
    const run = S.run, v = cfg.mode.lower ? -Math.round(value) : Math.round(value), rec = value > 0 && (!sv.best || v > sv.best);
    if (rec) { sv.best = v; save(); if (rewards()) A.gainXP(20, 'story', true); }
    A.overlay({ title: o.title || cfg.mode.name, big: o.big || '', sub: (o.sub ? o.sub + '<br>' : '') + `${rec ? 'NEW BEST! · ' : ''}BEST ${fmt(sv.best)}`, btn: 'Retry', onGo: () => { S.run = run; A.startRun(); cfg.play(run); }, alt: { btn: 'Story map', onGo: S.open } });
  };
  S.quit = () => S.run ? { btn: 'Quit to map', onGo: S.open } : undefined;
  S.save = () => sv; // for tests
  return S;
};
