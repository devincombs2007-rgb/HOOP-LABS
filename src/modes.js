// HOOP LAB — practice modes. Pure game logic; every mode uses the same ball physics.
//
// A mode object (HoopModes.create(id, cfg, records)) is driven by game.js:
//   onRelease(shot)  → events     shot = the game's shot tracker (x, z, dist, three, eMs, green, catchShoot,
//                                  catchDelay, afterMove, routine, …); the mode may tag it (counted, value, spotId…)
//   onResult(r, shot) → events    r = { made, dist, eMs, three, result, missType, green, catchShoot, afterMove, routine }
//   update(dt)       → events     clocks
//   end()            → events     finish early (pause menu "End session"); returns the 'done' event
//   hud()            → { title, main, sub, timer, elapsed, progress, pips } or null
//   canShoot(), spot (getter), cfg, done
// Optional fields the game honors: ballReturn ('rebounder'|'rapid'|'manual'|'feed'), requireSpot (shots only
// from the spot ring), showSpot, startEmpty (start without a ball; 'feed' passes it in), passer {x,y,z},
// feedDelay, routine (pre-shot dribbles), lockHoop.
// Events: { type:'toast', text, tone } · { type:'moveTo', spot, delay } · { type:'buzzer' } · { type:'clutch', text }
//         { type:'done', mode, title, lines, newBest, score, scoreText, best, bestText, rows:[[label, value]], spots:[…] }
const HoopModes = (() => {
  'use strict';
  const PH = (typeof HoopPhysics !== 'undefined') ? HoopPhysics : require('./physics.js');
  const K = PH.K;
  const FT = 0.3048;

  function spotAt(id, label, d, aDeg) {
    const a = aDeg * Math.PI / 180;
    return { id, label, x: K.HOOP_X - d * Math.cos(a), z: d * Math.sin(a), hoop: 0 };
  }
  // Spots are on the floor (player position). Angle 0 = straight on, positive = shooter's right.
  const SPOTS = {
    lc3:   { id: 'lc3', label: 'Left corner 3', x: K.HOOP_X - 0.55, z: -7.05, hoop: 0 },
    lw3:   spotAt('lw3', 'Left wing 3', 7.6, -45),
    top3:  spotAt('top3', 'Top of the key 3', 7.6, 0),
    rw3:   spotAt('rw3', 'Right wing 3', 7.6, 45),
    rc3:   { id: 'rc3', label: 'Right corner 3', x: K.HOOP_X - 0.55, z: 7.05, hoop: 0 },
    lelb:  { id: 'lelb', label: 'Left elbow', x: K.HOOP_X - (K.LANE_L - K.HOOP_FROM_BASELINE) - 0.15, z: -K.LANE_W / 2 - 0.1, hoop: 0 },
    relb:  { id: 'relb', label: 'Right elbow', x: K.HOOP_X - (K.LANE_L - K.HOOP_FROM_BASELINE) - 0.15, z: K.LANE_W / 2 + 0.1, hoop: 0 },
    ft:    { id: 'ft', label: 'Free throw', x: K.HOOP_X - K.FT_DIST - 0.22, z: 0, hoop: 0 },
    lbase: spotAt('lbase', 'Left baseline 15 ft', 4.6, -78),
    rbase: spotAt('rbase', 'Right baseline 15 ft', 4.6, 78),
    lwmid: spotAt('lwmid', 'Left wing midrange', 5.2, -45),
    rwmid: spotAt('rwmid', 'Right wing midrange', 5.2, 45),
    topmid: spotAt('topmid', 'Top of the key midrange', 5.2, 0),
    deep:  spotAt('deep', 'Deep top (29 ft)', 8.9, 0),
    lwdeep: spotAt('lwdeep', 'Left deep ball', K.THREE_ARC + 6 * FT + 0.3, -22.5),
    rwdeep: spotAt('rwdeep', 'Right deep ball', K.THREE_ARC + 6 * FT + 0.3, 22.5),
    pulltop: spotAt('pulltop', 'Top (start)', 8.6, 0),
    pulllw:  spotAt('pulllw', 'Left wing (start)', 8.6, -40),
    pullrw:  spotAt('pullrw', 'Right wing (start)', 8.6, 40),
    logo:  spotAt('logo', 'Logo', 10.6, 0),
    half:  { id: 'half', label: 'Half-court', x: -0.25, z: 0, hoop: 0 },
  };
  for (const s of Object.values(SPOTS)) s.dist = Math.hypot(s.x - K.HOOP_X, s.z);
  const CUSTOM_SPOT_IDS = ['lc3', 'lw3', 'top3', 'rw3', 'rc3', 'lelb', 'ft', 'relb', 'lbase', 'rbase', 'lwmid', 'rwmid', 'topmid', 'deep', 'logo', 'half'];
  const FIVE_SPOTS = { three: ['lc3', 'lw3', 'top3', 'rw3', 'rc3'], mid: ['lbase', 'lwmid', 'topmid', 'rwmid', 'rbase'] };
  // the rebounder / passer for catch-and-shoot: low block, ball out of the hands at chest height
  const PASSER = { x: K.HOOP_X - 1.7, y: 1.2, z: 0.6 };

  const ft = (m) => { const inches = Math.round(m / 0.0254); return `${Math.floor(inches / 12)}′${inches % 12}″`; };
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const toast = (text, tone = 'info') => ({ type: 'toast', text, tone });
  const NONE = Object.freeze([]);   // update() runs every tick: no allocation when nothing happens
  const choice = (v, opts, def) => opts.includes(v) ? v : def;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function spread(vals) {
    if (!vals.length) return { mean: 0, sd: 0, absMean: 0 };
    const mean = vals.reduce((t, v) => t + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((t, v) => t + (v - mean) ** 2, 0) / vals.length);
    return { mean, sd, absMean: vals.reduce((t, v) => t + Math.abs(v), 0) / vals.length };
  }
  const msTxt = (v) => `${v >= 0 ? '+' : ''}${Math.round(v)} ms`;
  const spotRow = (s, made, att) => ({ id: s.id, label: s.label, x: s.x, z: s.z, hoop: s.hoop, made, att });

  // ---------------------------------------------------------------- catalogue (intro cards, config, PBs)
  // cfg descriptors: { key, label, options: [{ v, l }], def } — the UI renders them generically.
  const MODE_INFO = [
    { id: 'free', name: 'Free Shootaround', kind: 'Practice', desc: 'Unlimited shooting anywhere on the floor, at either basket. No score, no clock.',
      rules: ['Shoot from anywhere, either basket', 'Ball return follows your settings (rebounder, rapid rack or manual)', 'Every shot feeds your stats and shot chart'], cfg: [] },
    { id: 'ft', name: 'Free-Throw Practice', kind: 'Drill', desc: 'Free throws with a pre-shot routine. Build a repeatable rhythm and track your consistency.',
      rules: ['Shoot from the free-throw line', 'With the routine on, the shooter takes three dribbles before every attempt (press shoot to skip it)', 'Results grade your make rate and how steady your release timing is'],
      cfg: [{ key: 'count', label: 'Free throws', options: [{ v: 10, l: '10' }, { v: 20, l: '20' }, { v: 50, l: '50' }], def: 10 },
            { key: 'routine', label: 'Pre-shot routine', options: [{ v: true, l: 'On' }, { v: false, l: 'Off' }], def: true }] },
    { id: 'spot5', name: 'Spot-Up 5-Spot', kind: 'Drill', desc: 'Five spots, corner to corner. Catch from the rack, set your feet, shoot. Fastest clean round wins.',
      rules: ['Five spots from corner to corner', 'A rack feeds you right after every release', 'Score = makes; the clock is your tiebreaker'],
      cfg: [{ key: 'range', label: 'Range', options: [{ v: 'three', l: 'Three-point' }, { v: 'mid', l: 'Midrange' }], def: 'three' },
            { key: 'perSpot', label: 'Shots per spot', options: [{ v: 3, l: '3' }, { v: 5, l: '5' }, { v: 10, l: '10' }], def: 5 }] },
    { id: 'catch', name: 'Catch-and-Shoot', kind: 'Drill', desc: 'A passer feeds you around the arc. Catch and fire in rhythm for bonus points.',
      rules: ['Relocate to each spot and wait for the pass', 'Make = 2 points', 'Release within about half a second of the catch for a +1 rhythm bonus'],
      cfg: [{ key: 'perSpot', label: 'Passes per spot', options: [{ v: 2, l: '2' }, { v: 3, l: '3' }, { v: 5, l: '5' }], def: 3 }] },
    { id: 'dribble', name: 'Off-the-Dribble', kind: 'Drill', desc: 'Pull-up jumpers off a move. Cross over or step back, rise, and knock it down.',
      rules: ['Start at the marked spot, then make a move: crossover (X) or step-back (C)', 'Pull up within 1.5 s of the move, from 15 ft or deeper', 'Make off a crossover = 2, off a step-back = 3. Shots without a move do not count'],
      cfg: [{ key: 'shots', label: 'Pull-ups', options: [{ v: 10, l: '10' }, { v: 20, l: '20' }], def: 10 }] },
    { id: 'three', name: 'Three-Point Challenge', kind: 'Challenge', desc: 'Five racks around the arc against the clock. The last ball of every rack is a money ball worth 2.',
      rules: ['Five racks of five balls, corner to corner', 'Regular ball 1, money ball 2', 'Modern format: one all-money rack plus two deep balls worth 3, 70 seconds', 'Balls released before the buzzer still count'],
      cfg: [{ key: 'format', label: 'Format', options: [{ v: 'classic', l: 'Classic · 60 s' }, { v: 'modern', l: 'Modern · 70 s' }], def: 'classic' },
            { key: 'moneyRack', label: 'Money rack (modern)', options: [{ v: 'lc3', l: 'Left corner' }, { v: 'lw3', l: 'Left wing' }, { v: 'top3', l: 'Top' }, { v: 'rw3', l: 'Right wing' }, { v: 'rc3', l: 'Right corner' }], def: 'rc3' }] },
    { id: 'deep', name: 'Deep-Range Challenge', kind: 'Challenge', desc: 'Start at the arc. Every make moves you back 2 feet. Three misses and you are done.',
      rules: ['Start just behind the three-point line', 'Each make moves the spot back 2 ft (angles rotate)', 'Three misses end the run; your longest make is your score'], cfg: [] },
    { id: 'perfect', name: 'Perfect Release', kind: 'Challenge', desc: 'Ten shots scored on release timing. Makes count full, misses count half. 1,000 is flawless.',
      rules: ['Ten shots from around the key', 'Up to 100 points per shot for release timing', 'A miss scores half'], cfg: [] },
    { id: 'atw', name: 'Around the World', kind: 'Challenge', desc: 'Seven spots around the key. Make it to move on. Finish in as few shots as you can.',
      rules: ['Seven spots baseline to baseline', 'Make to advance', 'Chance rule: after a miss you get one more try; miss it and you go back to the start'],
      cfg: [{ key: 'chance', label: 'Chance rule', options: [{ v: false, l: 'Off' }, { v: true, l: 'On' }], def: false }] },
    { id: 'streak', name: 'Hot Streak', kind: 'Challenge', desc: 'How many in a row can you make? One miss and the streak is over.',
      rules: ['Shoot from anywhere at the minimum distance or deeper', 'Shorter shots do not count either way', 'End the session from the pause menu to see your results'],
      cfg: [{ key: 'min', label: 'Minimum distance', options: [{ v: 'mid', l: '15 ft' }, { v: 'three', l: 'Three-pointers' }], def: 'mid' }] },
    { id: 'custom', name: 'Custom Training', kind: 'Practice', desc: 'Pick your spots, shots per spot, and a target percentage.',
      rules: ['Choose any spots on the court diagram', 'Set shots per spot and a target make rate', 'Results break down every spot'],
      cfg: [{ key: 'perSpot', label: 'Shots per spot', options: [{ v: 5, l: '5' }, { v: 10, l: '10' }, { v: 20, l: '20' }], def: 10 },
            { key: 'target', label: 'Target', options: [{ v: 0.4, l: '40%' }, { v: 0.5, l: '50%' }, { v: 0.6, l: '60%' }, { v: 0.7, l: '70%' }], def: 0.5 },
            { key: 'rapid', label: 'Ball return', options: [{ v: false, l: 'Rebounder' }, { v: true, l: 'Rapid rack' }], def: false }] },
    { id: 'one', name: '1v1 vs AI', kind: 'Match', desc: 'First to 11 by two. 1s and 2s; alternate possessions after every attempt. 14-second shot clock.',
      rules: ['First to 11, win by two', 'Shots inside the arc count 1, threes count 2', 'Possession alternates after every attempt; 14-second shot clock'], cfg: [] },
    { id: 'watch', name: 'Watch AI vs AI', kind: 'Match', desc: 'Two AI players compete using the same shot physics. Games restart automatically; camera controls remain available.',
      rules: ['Sit back and watch two AI players play to 11', 'Every shot uses the same physics as yours', 'Games restart automatically'], cfg: [] },
  ];
  const info = (id) => MODE_INFO.find(m => m.id === id);
  function defaultCfg(id) {
    const o = {};
    for (const c of (info(id) || { cfg: [] }).cfg) o[c.key] = c.def;
    if (id === 'custom') o.spots = ['lw3', 'top3', 'rw3'];
    return o;
  }

  // personal-best text for the intro card / results
  function bestText(id, records = {}, cfg = {}) {
    const r = records;
    switch (id) {
      case 'ft': { const n = choice(cfg.count, [10, 20, 50], 10), b = r.ft && r.ft[n]; return b != null ? `${b}/${n}` : null; }
      case 'spot5': { const k = `${choice(cfg.range, ['three', 'mid'], 'three')}-${choice(cfg.perSpot, [3, 5, 10], 5)}`, b = r.spot5 && r.spot5[k]; return b ? `${b.made}/${b.total} in ${mmss(b.time)}` : null; }
      case 'catch': return r.catch ? `${r.catch} pts` : null;
      case 'dribble': return r.dribble ? `${r.dribble} pts` : null;
      case 'three': { const b = cfg.format === 'modern' ? r.threeModern : r.three; return b ? `${b} pts` : null; }
      case 'deep': return r.deep ? ft(r.deep) : null;
      case 'perfect': return r.perfect ? `${r.perfect} / 1000` : null;
      case 'atw': return r.atw ? `${r.atw} shots` : null;
      case 'streak': { const b = cfg.min === 'three' ? r.streak3 : r.streak; return b ? `${b} in a row` : null; }
      case 'custom': return r.custom ? `${Math.round(r.custom.pct * 100)}%` : null;
      default: return null;
    }
  }

  // ---------------------------------------------------------------- modes
  function create(id, cfg = {}, records = {}) {
    const rec = records;
    const mi = info(id);
    if (!mi) throw new Error('unknown mode ' + id);
    cfg = Object.assign(defaultCfg(id), cfg || {});
    const base = { id, name: mi.name, cfg, done: false, ballReturn: null, spot: null, requireSpot: false, timer: null, elapsed: null,
      end() { return this.finish ? this.finish() : []; } };
    const doneEv = (o) => Object.assign({ type: 'done', mode: id, lines: [], rows: [], spots: [], newBest: false }, o);

    if (id === 'free' || id === 'one' || id === 'watch') {
      return ({ ...base, ballReturn: id === 'free' ? null : 'manual',
        canShoot() { return true; }, onRelease() { return []; }, onResult() { return []; }, update() { return NONE; },
        end() { return []; }, hud() { return null; }, summary() { return null; },
      });
    }

    // ------------------------------------------------ free-throw practice (with routine)
    if (id === 'ft') {
      const count = choice(cfg.count, [10, 20, 50], 10);
      return ({ ...base,
        ballReturn: 'rebounder', requireSpot: true, lockHoop: 0, routine: cfg.routine === false ? 0 : 3,
        n: 0, made: 0, resolved: 0, streak: 0, bestStreak: 0, errs: [], greens: 0, withRoutine: 0, pendingShot: false, count,
        get spot() { return SPOTS.ft; },
        canShoot() { return !this.pendingShot && !this.done && this.n < count; },
        onRelease(shot) {
          if (this.pendingShot || this.n >= count) return [];
          this.pendingShot = true; shot.counted = true; this.n++;
          if (shot.routine) this.withRoutine++;
          return [];
        },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.pendingShot = false; this.resolved++;
          if (typeof r.eMs === 'number') this.errs.push(r.eMs);
          if (r.green) this.greens++;
          const ev = [];
          if (r.made) { this.made++; this.streak++; if (this.streak > this.bestStreak) this.bestStreak = this.streak; if (this.streak >= 5 && this.streak % 5 === 0) ev.push(toast(`${this.streak} straight`, 'good')); }
          else this.streak = 0;
          if (this.resolved >= count) return ev.concat(this.finish());
          return ev;
        },
        update() { return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const t = spread(this.errs);
          const key = count, prev = (rec.ft && rec.ft[key]) || 0, nb = this.made > prev && this.resolved >= count;
          if (nb) { rec.ft = Object.assign({}, rec.ft, { [key]: this.made }); }
          const rhythm = t.sd <= 12 ? 'Metronome' : t.sd <= 22 ? 'Steady' : t.sd <= 35 ? 'Streaky' : 'All over the place';
          return [doneEv({ title: `${this.made}/${this.resolved} free throws`, score: this.made, scoreText: `${pct(this.made, this.resolved)}%`,
            newBest: nb, best: Math.max(prev, nb ? this.made : 0), bestText: bestText('ft', rec, cfg),
            lines: [`${pct(this.made, this.resolved)}% · best run ${this.bestStreak}`, `Release timing ${msTxt(t.mean)} ± ${Math.round(t.sd)} ms (${rhythm})`, nb ? 'New personal best' : prev ? `Best: ${prev}/${count}` : 'First run logged'],
            rows: [['Makes', `${this.made} / ${this.resolved}`], ['Best run', `${this.bestStreak}`], ['Timing (mean ± SD)', `${msTxt(t.mean)} ± ${Math.round(t.sd)} ms`],
                   ['Green releases', `${this.greens}`], ['Taken after the full routine', this.routine ? `${this.withRoutine} / ${this.n}` : 'Routine off']],
            spots: [spotRow(SPOTS.ft, this.made, this.resolved)] })];
        },
        hud() { return { title: 'Free-Throw Practice', main: `${this.made}/${this.resolved}`, sub: `FT ${Math.min(this.n + 1, count)} of ${count} · ${pct(this.made, this.resolved)}% · run ${this.streak}`, progress: this.resolved / count, timer: null }; },
        summary() { return { made: this.made, att: this.resolved, best: this.bestStreak }; },
      });
    }

    // ------------------------------------------------ spot-up 5-spot
    if (id === 'spot5') {
      const range = choice(cfg.range, ['three', 'mid'], 'three'), per = choice(cfg.perSpot, [3, 5, 10], 5);
      const ids = FIVE_SPOTS[range], seq = [];
      for (const k of ids) for (let i = 0; i < per; i++) seq.push(SPOTS[k]);
      const perSpot = Object.fromEntries(ids.map(k => [k, { att: 0, made: 0 }]));
      return ({ ...base,
        ballReturn: 'rapid', requireSpot: true, lockHoop: 0, released: 0, resolved: 0, made: 0, perSpot, started: false, elapsed: 0, total: seq.length,
        get spot() { return seq[Math.min(this.released, seq.length - 1)]; },
        canShoot() { return !this.done && this.released < seq.length; },
        onRelease(shot) {
          if (this.released >= seq.length) return [];
          this.started = true;
          const cur = seq[this.released]; shot.counted = true; shot.spotId = cur.id; this.released++;
          const next = seq[Math.min(this.released, seq.length - 1)];
          return next !== cur && this.released < seq.length ? [{ type: 'moveTo', spot: next, delay: 0.35 }, toast(next.label)] : [];
        },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.resolved++; const ps = this.perSpot[shot.spotId]; ps.att++; if (r.made) { ps.made++; this.made++; }
          if (this.resolved >= seq.length) return this.finish();
          return [];
        },
        update(dt) { if (this.started && !this.done) this.elapsed += dt; return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const key = `${range}-${per}`, prev = rec.spot5 && rec.spot5[key];
          const complete = this.resolved >= seq.length;
          const nb = complete && (!prev || this.made > prev.made || (this.made === prev.made && this.elapsed < prev.time));
          if (nb) rec.spot5 = Object.assign({}, rec.spot5, { [key]: { made: this.made, total: seq.length, time: this.elapsed } });
          return [doneEv({ title: `${this.made}/${seq.length} in ${mmss(this.elapsed)}`, score: this.made, scoreText: `${pct(this.made, this.resolved)}%`, newBest: nb,
            bestText: bestText('spot5', rec, cfg),
            lines: ids.map(k => `${SPOTS[k].label}: ${this.perSpot[k].made}/${this.perSpot[k].att}`).concat(nb ? ['New personal best'] : prev ? [`Best: ${prev.made}/${prev.total} in ${mmss(prev.time)}`] : []),
            rows: [['Makes', `${this.made} / ${this.resolved}`], ['Time', mmss(this.elapsed)]].concat(ids.map(k => [SPOTS[k].label, `${this.perSpot[k].made}/${this.perSpot[k].att}`])),
            spots: ids.map(k => spotRow(SPOTS[k], this.perSpot[k].made, this.perSpot[k].att)) })];
        },
        hud() {
          const cur = this.spot, ps = this.perSpot[cur.id];
          return { title: `Spot-Up · ${range === 'three' ? 'Three' : 'Midrange'}`, main: `${this.made}/${this.resolved}`, sub: `${cur.label} · shot ${Math.min(per, this.released - seq.indexOf(cur) + 1)} of ${per}`, elapsed: this.elapsed, progress: this.released / seq.length, pips: { n: 5, i: ids.indexOf(cur.id) } };
        },
        summary() { return { made: this.made, total: seq.length, time: this.elapsed }; },
      });
    }

    // ------------------------------------------------ catch-and-shoot (passer feeds)
    if (id === 'catch') {
      const per = choice(cfg.perSpot, [2, 3, 5], 3);
      const ids = FIVE_SPOTS.three, seq = [];
      for (const k of ids) for (let i = 0; i < per; i++) seq.push(SPOTS[k]);
      const perSpot = Object.fromEntries(ids.map(k => [k, { att: 0, made: 0 }]));
      return ({ ...base,
        ballReturn: 'feed', startEmpty: true, passer: PASSER, feedDelay: 0.55, requireSpot: true, lockHoop: 0,
        released: 0, resolved: 0, made: 0, score: 0, rhythm: 0, rhythmMade: 0, delays: [], perSpot, total: seq.length,
        get spot() { return seq[Math.min(this.released, seq.length - 1)]; },
        canShoot() { return !this.done && this.released < seq.length; },
        onRelease(shot) {
          if (this.released >= seq.length) return [];
          const cur = seq[this.released];
          shot.counted = true; shot.spotId = cur.id; shot.rhythm = !!shot.catchShoot; this.released++;
          if (shot.rhythm) this.rhythm++;
          if (typeof shot.catchDelay === 'number' && shot.catchDelay < 5) this.delays.push(shot.catchDelay);
          const next = seq[Math.min(this.released, seq.length - 1)];
          return next !== cur && this.released < seq.length ? [{ type: 'moveTo', spot: next, delay: 0.5 }, toast(`Relocate: ${next.label}`)] : [];
        },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.resolved++; const ps = this.perSpot[shot.spotId]; ps.att++;
          const ev = [];
          if (r.made) {
            ps.made++; this.made++;
            const pts = 2 + (shot.rhythm ? 1 : 0); this.score += pts; if (shot.rhythm) this.rhythmMade++;
            ev.push(toast(shot.rhythm ? `In rhythm +${pts}` : `+${pts}`, 'good'));
          } else if (!shot.rhythm) ev.push(toast('Too slow off the catch', 'info'));
          if (this.resolved >= seq.length) return ev.concat(this.finish());
          return ev;
        },
        update() { return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const prev = rec.catch || 0, nb = this.score > prev && this.resolved >= seq.length;
          if (nb) rec.catch = this.score;
          const avg = this.delays.length ? this.delays.reduce((t, v) => t + v, 0) / this.delays.length : 0;
          return [doneEv({ title: `${this.score} points`, score: this.score, scoreText: `${this.made}/${this.resolved}`, newBest: nb, bestText: bestText('catch', rec, cfg),
            lines: [`${this.made} of ${this.resolved} makes · ${this.rhythm} in rhythm`, `Average catch-to-release ${avg.toFixed(2)} s`, nb ? 'New personal best' : prev ? `Best: ${prev} pts` : 'First run logged'],
            rows: [['Makes', `${this.made} / ${this.resolved}`], ['Rhythm shots', `${this.rhythm} (${this.rhythmMade} made)`], ['Catch to release', `${avg.toFixed(2)} s`]]
              .concat(ids.map(k => [SPOTS[k].label, `${this.perSpot[k].made}/${this.perSpot[k].att}`])),
            spots: ids.map(k => spotRow(SPOTS[k], this.perSpot[k].made, this.perSpot[k].att)) })];
        },
        hud() { return { title: 'Catch-and-Shoot', main: `${this.score}`, sub: `Pass ${Math.min(this.released + 1, seq.length)} of ${seq.length} · ${this.made}/${this.resolved} · rhythm ${this.rhythm}`, progress: this.released / seq.length, pips: { n: 5, i: ids.indexOf(this.spot.id) } }; },
        summary() { return { score: this.score, made: this.made }; },
      });
    }

    // ------------------------------------------------ off-the-dribble pull-ups
    if (id === 'dribble') {
      const N = choice(cfg.shots, [10, 20], 10);
      const starts = [SPOTS.pulltop, SPOTS.pulllw, SPOTS.pullrw];
      return ({ ...base,
        ballReturn: 'rebounder', requireSpot: false, showSpot: true, lockHoop: 0, idx: 0, counted: 0, resolved: 0, score: 0,
        cross: { att: 0, made: 0 }, step: { att: 0, made: 0 }, total: N,
        get spot() { return starts[this.idx % starts.length]; },
        canShoot() { return !this.done && this.counted < N; },
        onRelease(shot) {
          if (this.counted >= N) return [];
          if (!shot.afterMove) return [toast('Make a move first: crossover or step-back, then pull up', 'info')];
          if (shot.dist < 4.4) return [toast('Pull up from 15 ft or deeper', 'info')];
          shot.counted = true; this.counted++; this.idx++;
          const t = shot.afterMove === 'stepback' ? this.step : this.cross; t.att++;
          return this.counted < N ? [{ type: 'moveTo', spot: this.spot, delay: 1.6 }] : [];
        },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.resolved++;
          const ev = [];
          if (r.made) {
            const sb = shot.afterMove === 'stepback', pts = sb ? 3 : 2;
            this.score += pts; (sb ? this.step : this.cross).made++;
            ev.push(toast(`${sb ? 'Step-back' : 'Crossover'} pull-up +${pts}`, 'good'));
          }
          if (this.resolved >= N) return ev.concat(this.finish());
          return ev;
        },
        update() { return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const prev = rec.dribble || 0, nb = this.score > prev && this.resolved >= N;
          if (nb) rec.dribble = this.score;
          const made = this.cross.made + this.step.made;
          return [doneEv({ title: `${this.score} points`, score: this.score, scoreText: `${made}/${this.resolved}`, newBest: nb, bestText: bestText('dribble', rec, cfg),
            lines: [`Crossover pull-ups ${this.cross.made}/${this.cross.att}`, `Step-back pull-ups ${this.step.made}/${this.step.att}`, nb ? 'New personal best' : prev ? `Best: ${prev} pts` : 'First run logged'],
            rows: [['Makes', `${made} / ${this.resolved}`], ['Off the crossover', `${this.cross.made}/${this.cross.att}`], ['Off the step-back', `${this.step.made}/${this.step.att}`]] })];
        },
        hud() { return { title: 'Off-the-Dribble', main: `${this.score}`, sub: `Pull-up ${Math.min(this.counted + 1, N)} of ${N} · cross ${this.cross.made}/${this.cross.att} · step-back ${this.step.made}/${this.step.att}`, progress: this.counted / N }; },
        summary() { return { score: this.score }; },
      });
    }

    // ------------------------------------------------ three-point challenge (classic / modern)
    if (id === 'three') {
      const modern = cfg.format === 'modern';
      const moneyRack = modern ? choice(cfg.moneyRack, FIVE_SPOTS.three, 'rc3') : null;
      const stations = [];
      for (const k of FIVE_SPOTS.three) {
        stations.push({ spot: SPOTS[k], balls: 5, rack: true, money: k === moneyRack });
        if (modern && k === 'lw3') stations.push({ spot: SPOTS.lwdeep, balls: 1, deep: true });
        if (modern && k === 'top3') stations.push({ spot: SPOTS.rwdeep, balls: 1, deep: true });
      }
      const seq = [];
      stations.forEach((st, si) => { for (let b = 0; b < st.balls; b++) seq.push({ spot: st.spot, si, ball: b, rackLast: st.rack && b === st.balls - 1, value: st.deep ? 3 : (st.money || b === st.balls - 1) ? 2 : 1 }); });
      const maxScore = seq.reduce((t, s) => t + s.value, 0), clock = modern ? 70 : 60;
      const stationStats = stations.map(() => ({ att: 0, made: 0, pts: 0 }));
      return ({ ...base,
        ballReturn: 'rapid', requireSpot: true, lockHoop: 0, idx: 0, rack: 0, score: 0, made: 0, released: 0, resolved: 0, total: seq.length, maxScore,
        timer: cfg.timed === false ? null : clock, started: false, buzzer: false, format: modern ? 'modern' : 'classic',
        get ball() { return this.idx < seq.length ? seq[this.idx].ball : 0; },
        get spot() { return seq[Math.min(this.idx, seq.length - 1)].spot; },
        canShoot() { return !this.buzzer && !this.done && this.idx < seq.length; },
        onRelease(shot) {
          if (!this.canShoot()) return [toast('Buzzer has sounded', 'bad')];
          this.started = true;
          const cur = seq[this.idx];
          shot.counted = true; shot.value = cur.value; shot.money = cur.value === 2; shot.deep = cur.value === 3; shot.station = cur.si;
          shot.clutch = (this.timer !== null && this.timer <= 3) || this.idx === seq.length - 1;
          this.released++; this.idx++;
          if (cur.rackLast) this.rack++;
          const ev = [];
          const next = seq[this.idx];
          if (next && next.si !== cur.si) {
            const st = stations[next.si];
            ev.push({ type: 'moveTo', spot: next.spot, delay: 0.3 }, toast(st.deep ? `Deep ball: ${next.spot.label} (3 pts)` : `Rack ${stations.slice(0, next.si + 1).filter(s => s.rack).length}: ${next.spot.label}${st.money ? ' · money rack' : ''}`));
          } else if (next && next.value === 2 && !stations[next.si].money) ev.push(toast('Money ball next', 'info'));
          return ev;
        },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.resolved++;
          const ss = stationStats[shot.station]; ss.att++;
          const ev = [];
          if (r.made) {
            this.score += shot.value; this.made++; ss.made++; ss.pts += shot.value;
            ev.push(toast(shot.deep ? 'Deep ball! +3' : shot.money ? 'Money ball! +2' : '+1', 'good'));
            if (shot.clutch) ev.push({ type: 'clutch', text: this.buzzer ? 'Beat the buzzer' : 'Clutch make' });
          }
          if (this.resolved >= seq.length || (this.buzzer && this.resolved >= this.released)) return ev.concat(this.finish());
          return ev;
        },
        update(dt) {
          if (this.timer === null || !this.started || this.done || this.buzzer) return NONE;
          this.timer = Math.max(0, this.timer - dt);
          if (this.timer === 0) {
            this.buzzer = true;
            const ev = [{ type: 'buzzer' }];
            if (this.resolved >= this.released) ev.push(...this.finish());
            return ev;
          }
          return NONE;
        },
        finish() {
          if (this.done) return [];
          this.done = true;
          const key = modern ? 'threeModern' : 'three';
          const best = rec[key] || 0, nb = this.score > best;
          if (nb) rec[key] = this.score;
          return [doneEv({ title: `${this.score} points`, score: this.score, scoreText: `${this.score} / ${maxScore}`, newBest: nb, best: Math.max(best, this.score), bestText: bestText('three', rec, cfg),
            lines: [`${this.made} of ${this.released} makes`, nb ? 'New personal best' : `Best: ${best}`],
            rows: [['Makes', `${this.made} / ${this.released}`], ['Score', `${this.score} of ${maxScore}`]]
              .concat(stations.map((s, i) => [s.deep ? s.spot.label : `${s.spot.label}${s.money ? ' (money)' : ''}`, `${stationStats[i].made}/${stationStats[i].att} · ${stationStats[i].pts} pts`])),
            spots: stations.map((s, i) => spotRow(s.spot, stationStats[i].made, stationStats[i].att)) })];
        },
        hud() {
          const cur = seq[Math.min(this.idx, seq.length - 1)], st = stations[cur.si];
          const sub = this.idx >= seq.length || this.buzzer ? 'Final balls in the air'
            : st.deep ? `Deep ball · worth 3` : `Rack ${stations.slice(0, cur.si + 1).filter(s => s.rack).length} · ball ${cur.ball + 1}${cur.value === 2 ? ' (money)' : ''}`;
          return { title: 'Three-Point Challenge', main: `${this.score}`, sub, timer: this.timer, progress: this.released / seq.length, pips: { n: 5, i: Math.min(this.rack, 4) } };
        },
        summary() { return { score: this.score }; },
      });
    }

    // ------------------------------------------------ deep range
    if (id === 'deep') {
      const angles = [0, -20, 20, -35, 35];
      const start = 7.4;
      return ({ ...base,
        ballReturn: 'rapid', requireSpot: true, lockHoop: 0, dist: start, strikes: 0, makes: 0, longest: 0, idx: 0, pendingShot: false, shots: 0,
        _spot: null, _spotKey: '',
        get spot() {
          const key = this.idx + ':' + this.dist;
          if (this._spotKey !== key) { const s = spotAt('deep', `${ft(this.dist)} out`, this.dist, angles[this.idx % angles.length]); s.dist = this.dist; this._spot = s; this._spotKey = key; }
          return this._spot;
        },
        canShoot() { return !this.pendingShot && !this.done; },
        onRelease(shot) { if (this.pendingShot) return []; this.pendingShot = true; shot.counted = true; this.shots++; shot.clutch = shot.dist > (rec.deep || 0) + 0.05 && shot.dist > 8.5; return []; },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.pendingShot = false;
          if (r.made) {
            this.makes++; this.longest = Math.max(this.longest, r.dist); this.dist += 2 * FT; this.idx++;
            const ev = [toast(`Made from ${ft(r.dist)}. Back 2 feet.`, 'good'), { type: 'moveTo', spot: this.spot }];
            if (shot.clutch) ev.push({ type: 'clutch', text: `Longest ever: ${ft(r.dist)}` });
            return ev;
          }
          this.strikes++;
          if (this.strikes >= 3) return this.finish();
          return [toast(`Strike ${this.strikes}`, 'bad')];
        },
        update() { return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const best = rec.deep || 0, nb = this.longest > best;
          if (nb) rec.deep = this.longest;
          return [doneEv({ title: this.longest ? `Longest make: ${ft(this.longest)}` : 'No makes', score: this.longest, scoreText: this.longest ? ft(this.longest) : '—', newBest: nb, bestText: bestText('deep', rec, cfg),
            lines: [`${this.makes} makes`, nb ? 'New personal best' : `Best: ${best ? ft(best) : '—'}`],
            rows: [['Makes', `${this.makes} of ${this.shots}`], ['Longest make', this.longest ? ft(this.longest) : '—'], ['Reached', ft(this.dist)]] })];
        },
        hud() { return { title: 'Deep-Range Challenge', main: ft(this.dist), sub: `Strikes ${'●'.repeat(this.strikes)}${'○'.repeat(Math.max(0, 3 - this.strikes))} · makes ${this.makes}`, progress: Math.min(1, (this.dist - start) / 6) }; },
        summary() { return { longest: this.longest }; },
      });
    }

    // ------------------------------------------------ perfect release
    if (id === 'perfect') {
      const order = ['ft', 'lelb', 'relb', 'top3', 'lw3', 'rw3', 'ft', 'lwmid', 'rwmid', 'top3'].map(k => SPOTS[k]);
      return ({ ...base,
        ballReturn: 'rebounder', requireSpot: true, lockHoop: 0, n: 0, score: 0, errs: [], greens: 0, makes: 0, pendingShot: false, per: [],
        get spot() { return order[Math.min(this.n, 9)]; },
        canShoot() { return !this.pendingShot && !this.done; },
        onRelease(shot) { if (this.pendingShot) return []; this.pendingShot = true; shot.counted = true; return []; },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.pendingShot = false;
          const e = Math.abs(r.eMs || 0), pts = Math.round(Math.max(0, 100 - 2.2 * e) * (r.made ? 1 : 0.5));
          this.score += pts; this.errs.push(r.eMs || 0); this.n++; if (r.green) this.greens++; if (r.made) this.makes++;
          this.per.push(pts);
          const ev = [toast(`${pts} pts · ${msTxt(r.eMs || 0)}`, pts >= 80 ? 'good' : pts >= 50 ? 'info' : 'bad')];
          if (this.n >= 10) return ev.concat(this.finish());
          ev.push({ type: 'moveTo', spot: this.spot });
          return ev;
        },
        update() { return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const t = spread(this.errs);
          const best = rec.perfect || 0, nb = this.score > best && this.n >= 10;
          if (nb) rec.perfect = this.score;
          return [doneEv({ title: `${this.score} / 1000`, score: this.score, scoreText: `${this.score}`, newBest: nb, bestText: bestText('perfect', rec, cfg),
            lines: [`Average timing error ${t.absMean.toFixed(0)} ms`, nb ? 'New personal best' : `Best: ${best}`],
            rows: [['Makes', `${this.makes} / ${this.n}`], ['Green releases', `${this.greens}`], ['Average |timing error|', `${t.absMean.toFixed(0)} ms`], ['Timing (mean ± SD)', `${msTxt(t.mean)} ± ${Math.round(t.sd)} ms`], ['Points per shot', this.per.join(' · ')]] })];
        },
        hud() { return { title: 'Perfect Release', main: `${this.score}`, sub: `Shot ${Math.min(this.n + 1, 10)} of 10 · ${this.spot.label}`, progress: this.n / 10 }; },
        summary() { return { score: this.score }; },
      });
    }

    // ------------------------------------------------ around the world
    if (id === 'atw') {
      const order = ['lbase', 'lwmid', 'lelb', 'ft', 'relb', 'rwmid', 'rbase'].map(k => SPOTS[k]);
      const chanceRule = cfg.chance === true;
      const perSpot = order.map(() => ({ att: 0, made: 0 }));
      return ({ ...base,
        ballReturn: 'rebounder', requireSpot: true, lockHoop: 0, idx: 0, attempts: 0, pendingShot: false, onChance: false, resets: 0,
        get spot() { return order[Math.min(this.idx, 6)]; },
        canShoot() { return !this.pendingShot && !this.done; },
        onRelease(shot) { if (this.pendingShot) return []; this.pendingShot = true; shot.counted = true; shot.spotIdx = this.idx; shot.clutch = this.idx === 6; return []; },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.pendingShot = false; this.attempts++;
          const ps = perSpot[shot.spotIdx]; ps.att++;
          if (!r.made) {
            if (!chanceRule) return [toast('Stay here', 'bad')];
            if (!this.onChance) { this.onChance = true; return [toast('Chance shot: make it or go back to the start', 'bad')]; }
            this.onChance = false; this.idx = 0; this.resets++;
            return [toast('Back to the start', 'bad'), { type: 'moveTo', spot: this.spot }];
          }
          ps.made++; this.onChance = false; this.idx++;
          if (this.idx >= 7) {
            const ev = this.finish();
            if (shot.clutch) ev.unshift({ type: 'clutch', text: 'Around the world' });
            return ev;
          }
          return [toast(`Spot ${this.idx + 1}: ${this.spot.label}`, 'good'), { type: 'moveTo', spot: this.spot }];
        },
        update() { return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const complete = this.idx >= 7;
          const best = rec.atw || 0, nb = complete && (!best || this.attempts < best);
          if (nb) rec.atw = this.attempts;
          return [doneEv({ title: complete ? `Around the world in ${this.attempts}` : `Reached spot ${this.idx + 1} of 7`, score: this.attempts, scoreText: `${this.attempts} shots`, newBest: nb, bestText: bestText('atw', rec, cfg),
            lines: [complete ? '7 spots complete' : `${this.idx} spots cleared`, nb ? 'New personal best' : best ? `Best: ${best} shots` : 'No complete round yet'],
            rows: [['Shots', `${this.attempts}`], ['Spots cleared', `${this.idx} / 7`]].concat(chanceRule ? [['Back to the start', `${this.resets}`]] : []),
            spots: order.map((s, i) => spotRow(s, perSpot[i].made, perSpot[i].att)) })];
        },
        hud() { return { title: 'Around the World', main: `${this.idx} / 7`, sub: `${this.spot.label}${this.onChance ? ' · chance shot' : ''} · ${this.attempts} shots`, progress: this.idx / 7, pips: { n: 7, i: this.idx } }; },
        summary() { return { attempts: this.attempts }; },
      });
    }

    // ------------------------------------------------ hot streak
    if (id === 'streak') {
      const threes = cfg.min === 'three';
      const key = threes ? 'streak3' : 'streak';
      return ({ ...base,
        ballReturn: null, streak: 0, best: rec[key] || 0, sessionBest: 0, runs: 0, att: 0, made: 0,
        canShoot() { return !this.done; },
        onRelease(shot) { shot.counted = true; return []; },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          if (threes ? !r.three : r.dist < 4.4) return [toast(threes ? 'Only threes count' : 'Too close. Shots from 15 ft or deeper count.', 'info')];
          this.att++;
          if (r.made) {
            this.made++; this.streak++;
            if (this.streak > this.sessionBest) this.sessionBest = this.streak;
            if (this.streak > this.best) { this.best = this.streak; rec[key] = this.best; return [toast(`${this.streak} in a row · new best`, 'good')]; }
            return [toast(`${this.streak} in a row`, 'good')];
          }
          const ended = this.streak; this.streak = 0; this.runs++;
          return [toast(ended ? `Streak over at ${ended}` : 'Miss', 'bad')];
        },
        update() { return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const nb = this.sessionBest > 0 && this.sessionBest >= this.best && this.sessionBest > (this.prevBest || 0);
          return [doneEv({ title: `Best run: ${this.sessionBest}`, score: this.sessionBest, scoreText: `${this.sessionBest} in a row`, newBest: nb, bestText: bestText('streak', rec, cfg),
            lines: [`${this.made} of ${this.att} counted shots`, `All-time best ${this.best}`],
            rows: [['Best run this session', `${this.sessionBest}`], ['Counted shots', `${this.made} / ${this.att}`], ['All-time best', `${this.best}`]] })];
        },
        hud() { return { title: threes ? 'Hot Streak · threes' : 'Hot Streak', main: `${this.streak}`, sub: `Best ${this.best} · ${threes ? 'threes only' : '15 ft+'}` }; },
        summary() { return { best: this.best }; },
        prevBest: rec[key] || 0,
      });
    }

    // ------------------------------------------------ custom training
    if (id === 'custom') {
      const ids = (cfg.spots && cfg.spots.length ? cfg.spots : ['lw3', 'top3', 'rw3']).filter(k => SPOTS[k]);
      const per = Math.max(1, Math.min(50, cfg.perSpot | 0 || 10));
      const target = Math.max(0.05, Math.min(1, cfg.target || 0.5));
      const seq = [];
      for (const k of ids) for (let i = 0; i < per; i++) seq.push(SPOTS[k]);
      const perSpot = Object.fromEntries(ids.map(k => [k, { att: 0, made: 0 }]));
      return ({ ...base,
        ballReturn: cfg.rapid ? 'rapid' : 'rebounder', requireSpot: true, lockHoop: 0, i: 0, made: 0, resolved: 0, released: 0, perSpot, target, total: seq.length,
        get spot() { return seq[Math.min(this.released, seq.length - 1)]; },
        canShoot() { return !this.done && this.released < seq.length; },
        onRelease(shot) {
          if (this.released >= seq.length) return [];
          shot.counted = true; shot.spotId = seq[this.released].id;
          const prev = seq[this.released]; this.released++;
          const next = seq[Math.min(this.released, seq.length - 1)];
          return next !== prev && this.released < seq.length ? [{ type: 'moveTo', spot: next, delay: cfg.rapid ? 0.4 : null }, toast(next.label)] : [];
        },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.resolved++; const ps = this.perSpot[shot.spotId]; ps.att++; if (r.made) { ps.made++; this.made++; }
          if (this.resolved >= seq.length) return this.finish();
          return [];
        },
        update() { return NONE; },
        finish() {
          if (this.done) return [];
          this.done = true;
          const p = this.resolved ? this.made / this.resolved : 0;
          const lines = ids.map(k => `${SPOTS[k].label}: ${this.perSpot[k].made}/${this.perSpot[k].att}`);
          lines.push(p >= target ? `Target ${Math.round(target * 100)}% reached` : `Target ${Math.round(target * 100)}% missed`);
          const prev = rec.custom;
          if (this.resolved >= seq.length) rec.custom = { pct: p, target, at: Date.now(), best: Math.max(p, (prev && prev.best) || 0) };
          return [doneEv({ title: `${this.made}/${this.resolved} · ${Math.round(p * 100)}%`, score: this.made, scoreText: `${Math.round(p * 100)}%`, lines, newBest: p >= target,
            rows: [['Makes', `${this.made} / ${this.resolved}`], ['Target', `${Math.round(target * 100)}% ${p >= target ? '(reached)' : '(missed)'}`]].concat(ids.map(k => [SPOTS[k].label, `${this.perSpot[k].made}/${this.perSpot[k].att}`])),
            spots: ids.map(k => spotRow(SPOTS[k], this.perSpot[k].made, this.perSpot[k].att)) })];
        },
        hud() { const p = this.resolved ? this.made / this.resolved : 0; return { title: 'Custom Training', main: `${this.made}/${this.resolved}`, sub: `${Math.round(p * 100)}% · target ${Math.round(target * 100)}% · ${this.spot.label}`, progress: this.released / seq.length }; },
        summary() { return { made: this.made, total: seq.length }; },
      });
    }
    throw new Error('unknown mode ' + id);
  }

  return { SPOTS, CUSTOM_SPOT_IDS, FIVE_SPOTS, PASSER, MODE_INFO, info, defaultCfg, bestText, create, ft, mmss };
})();
if (typeof module !== 'undefined') module.exports = HoopModes;
