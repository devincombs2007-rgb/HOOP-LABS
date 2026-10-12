// HOOP LAB — practice modes. Pure game logic; every mode uses the same ball physics.
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
    deep:  spotAt('deep', 'Deep top (29 ft)', 8.9, 0),
    logo:  spotAt('logo', 'Logo', 10.6, 0),
    half:  { id: 'half', label: 'Half-court', x: -0.25, z: 0, hoop: 0 },
  };
  for (const s of Object.values(SPOTS)) s.dist = Math.hypot(s.x - K.HOOP_X, s.z);
  const CUSTOM_SPOT_IDS = ['lc3', 'lw3', 'top3', 'rw3', 'rc3', 'lelb', 'ft', 'relb', 'lbase', 'rbase', 'lwmid', 'rwmid', 'deep', 'logo', 'half'];

  const ft = (m) => { const inches = Math.round(m / 0.0254); return `${Math.floor(inches / 12)}′${inches % 12}″`; };
  const toast = (text, tone = 'info') => ({ type: 'toast', text, tone });

  const MODE_INFO = [
    { id: 'free', name: 'Free Shootaround', desc: 'Unlimited shooting anywhere on the floor, at either basket. No score, no clock.' },
    { id: 'three', name: 'Three-Point Challenge', desc: 'Five racks around the arc, five balls each. The last ball of every rack is a money ball worth 2. 60 seconds.' },
    { id: 'deep', name: 'Deep-Range Challenge', desc: 'Start at the arc. Every make moves you back 2 feet. Three misses and you are done.' },
    { id: 'perfect', name: 'Perfect Release', desc: 'Ten shots scored on release timing. Makes count full, misses count half. 1,000 is flawless.' },
    { id: 'atw', name: 'Around the World', desc: 'Seven spots around the key. Make it to move on. Finish in as few shots as you can.' },
    { id: 'streak', name: 'Hot Streak', desc: 'Shoot from anywhere 15 ft or deeper. How many in a row can you make?' },
    { id: 'custom', name: 'Custom Training', desc: 'Pick your spots, shots per spot, and a target percentage.' },
    { id:'one',name:'1v1 vs AI',desc:'First to 11 by two. 1s and 2s; alternate possessions after every attempt. 14-second shot clock.' },
    { id:'watch',name:'Watch AI vs AI',desc:'Two AI players compete using the same shot physics. Games restart automatically; camera controls remain available.' },
  ];

  function create(id, cfg = {}, records = {}) {
    const rec = records;
    const base = { id, name: MODE_INFO.find(m => m.id === id).name, done: false, ballReturn: null, spot: null, requireSpot: false, timer: null };

    if (id === 'free' || id==='one' || id==='watch') {
      return ({ ...base,
        onRelease() { return []; }, onResult() { return []; }, update() { return []; }, ballReturn:id==='free'?null:'manual',
        hud() { return null; }, summary() { return null; },
      });
    }

    if (id === 'three') {
      const racks = ['lc3', 'lw3', 'top3', 'rw3', 'rc3'].map(k => SPOTS[k]);
      const m = ({ ...base,
        ballReturn: 'rapid', requireSpot: true, rack: 0, ball: 0, score: 0, made: 0, released: 0, resolved: 0,
        timer: cfg.timed === false ? null : 60, started: false, buzzer: false,
        get spot() { return racks[Math.min(this.rack, 4)]; },
        canShoot() { return !this.buzzer && this.rack < 5; },
        onRelease(shot) {
          if (!this.canShoot()) return [toast('Buzzer has sounded', 'bad')];
          this.started = true;
          shot.money = this.ball === 4; shot.counted = true;
          this.released++; this.ball++;
          const ev = [];
          if (this.ball === 5) { this.ball = 0; this.rack++; if (this.rack < 5) ev.push({ type: 'moveTo', spot: racks[this.rack] }, toast(`Rack ${this.rack + 1}: ${racks[this.rack].label}`)); }
          else if (this.ball === 4) ev.push(toast('Money ball next', 'info'));
          return ev;
        },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.resolved++;
          const ev = [];
          if (r.made) { const pts = shot.money ? 2 : 1; this.score += pts; this.made++; ev.push(toast(shot.money ? 'Money ball! +2' : '+1', 'good')); }
          if ((this.resolved >= 25) || (this.buzzer && this.resolved >= this.released)) return ev.concat(this.finish());
          return ev;
        },
        update(dt) {
          if (this.timer === null || !this.started || this.done) return [];
          this.timer = Math.max(0, this.timer - dt);
          if (this.timer === 0 && !this.buzzer) {
            this.buzzer = true;
            const ev = [{ type: 'buzzer' }];
            if (this.resolved >= this.released) ev.push(...this.finish());
            return ev;
          }
          return [];
        },
        finish() {
          if (this.done) return [];
          this.done = true;
          const best = rec.three || 0, nb = this.score > best;
          if (nb) rec.three = this.score;
          return [{ type: 'done', title: `${this.score} points`, lines: [`${this.made} of ${this.released} makes`, nb ? 'New personal best' : `Best: ${best}`], newBest: nb }];
        },
        hud() { return { title: 'Three-Point Challenge', main: `${this.score}`, sub: this.rack < 5 ? `Rack ${this.rack + 1} · ball ${this.ball + 1}${this.ball === 4 ? ' (money)' : ''}` : 'Final balls in the air', timer: this.timer, progress: this.released / 25 }; },
        summary() { return { score: this.score }; },
      });
      return m;
    }

    if (id === 'deep') {
      const angles = [0, -20, 20, -35, 35];
      return ({ ...base,
        ballReturn: 'rapid', requireSpot: true, dist: 7.4, strikes: 0, makes: 0, longest: 0, idx: 0, pendingShot: false,
        get spot() { const a = angles[this.idx % angles.length]; const s = spotAt('deep', `${ft(this.dist)} out`, this.dist, a); s.dist = this.dist; return s; },
        canShoot() { return !this.pendingShot && !this.done; },
        onRelease(shot) { if (this.pendingShot) return []; this.pendingShot = true; shot.counted = true; return []; },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.pendingShot = false;
          if (r.made) {
            this.makes++; this.longest = Math.max(this.longest, r.dist); this.dist += 2 * FT; this.idx++;
            return [toast(`Made from ${ft(r.dist)}. Back 2 feet.`, 'good'), { type: 'moveTo', spot: this.spot }];
          }
          this.strikes++;
          if (this.strikes >= 3) {
            this.done = true;
            const best = rec.deep || 0, nb = this.longest > best;
            if (nb) rec.deep = this.longest;
            return [{ type: 'done', title: this.longest ? `Longest make: ${ft(this.longest)}` : 'No makes', lines: [`${this.makes} makes`, nb ? 'New personal best' : `Best: ${best ? ft(best) : '—'}`], newBest: nb }];
          }
          return [toast(`Strike ${this.strikes}`, 'bad')];
        },
        update() { return []; },
        hud() { return { title: 'Deep-Range Challenge', main: ft(this.dist), sub: `Strikes ${'●'.repeat(this.strikes)}${'○'.repeat(3 - this.strikes)} · makes ${this.makes}`, progress: Math.min(1, (this.dist - 7.4) / 6) }; },
        summary() { return { longest: this.longest }; },
      });
    }

    if (id === 'perfect') {
      const order = ['ft', 'lelb', 'relb', 'top3', 'lw3', 'rw3', 'ft', 'lwmid', 'rwmid', 'top3'].map(k => SPOTS[k]);
      return ({ ...base,
        ballReturn: 'rebounder', requireSpot: true, n: 0, score: 0, errs: [], pendingShot: false,
        get spot() { return order[Math.min(this.n, 9)]; },
        canShoot() { return !this.pendingShot && !this.done; },
        onRelease(shot) { if (this.pendingShot) return []; this.pendingShot = true; shot.counted = true; return []; },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.pendingShot = false;
          const e = Math.abs(r.eMs || 0), pts = Math.round(Math.max(0, 100 - 2.2 * e) * (r.made ? 1 : 0.5));
          this.score += pts; this.errs.push(r.eMs || 0); this.n++;
          const ev = [toast(`${pts} pts · ${r.eMs >= 0 ? '+' : ''}${Math.round(r.eMs)} ms`, pts >= 80 ? 'good' : pts >= 50 ? 'info' : 'bad')];
          if (this.n >= 10) {
            this.done = true;
            const avg = this.errs.reduce((t, v) => t + Math.abs(v), 0) / this.errs.length;
            const best = rec.perfect || 0, nb = this.score > best;
            if (nb) rec.perfect = this.score;
            ev.push({ type: 'done', title: `${this.score} / 1000`, lines: [`Average timing error ${avg.toFixed(0)} ms`, nb ? 'New personal best' : `Best: ${best}`], newBest: nb });
          } else ev.push({ type: 'moveTo', spot: this.spot });
          return ev;
        },
        update() { return []; },
        hud() { return { title: 'Perfect Release', main: `${this.score}`, sub: `Shot ${Math.min(this.n + 1, 10)} of 10 · ${this.spot.label}`, progress: this.n / 10 }; },
        summary() { return { score: this.score }; },
      });
    }

    if (id === 'atw') {
      const order = ['lbase', 'lwmid', 'lelb', 'ft', 'relb', 'rwmid', 'rbase'].map(k => SPOTS[k]);
      return ({ ...base,
        ballReturn: 'rebounder', requireSpot: true, idx: 0, attempts: 0, pendingShot: false,
        get spot() { return order[Math.min(this.idx, 6)]; },
        canShoot() { return !this.pendingShot && !this.done; },
        onRelease(shot) { if (this.pendingShot) return []; this.pendingShot = true; shot.counted = true; return []; },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          this.pendingShot = false; this.attempts++;
          if (!r.made) return [toast('Stay here', 'bad')];
          this.idx++;
          if (this.idx >= 7) {
            this.done = true;
            const best = rec.atw || 0, nb = !best || this.attempts < best;
            if (nb) rec.atw = this.attempts;
            return [{ type: 'done', title: `Around the world in ${this.attempts}`, lines: ['7 spots complete', nb ? 'New personal best' : `Best: ${best} shots`], newBest: nb }];
          }
          return [toast(`Spot ${this.idx + 1}: ${this.spot.label}`, 'good'), { type: 'moveTo', spot: this.spot }];
        },
        update() { return []; },
        hud() { return { title: 'Around the World', main: `${this.idx} / 7`, sub: `${this.spot.label} · ${this.attempts} shots`, progress: this.idx / 7 }; },
        summary() { return { attempts: this.attempts }; },
      });
    }

    if (id === 'streak') {
      return ({ ...base,
        ballReturn: null, streak: 0, best: rec.streak || 0, runs: 0,
        canShoot() { return true; },
        onRelease(shot) { shot.counted = true; return []; },
        onResult(r, shot) {
          if (!shot || !shot.counted) return [];
          if (r.dist < 4.4) return [toast('Too close. Shots from 15 ft or deeper count.', 'info')];
          if (r.made) {
            this.streak++;
            if (this.streak > this.best) { this.best = this.streak; rec.streak = this.best; return [toast(`${this.streak} in a row · new best`, 'good')]; }
            return [toast(`${this.streak} in a row`, 'good')];
          }
          const ended = this.streak; this.streak = 0; this.runs++;
          return [toast(ended ? `Streak over at ${ended}` : 'Miss', 'bad')];
        },
        update() { return []; },
        hud() { return { title: 'Hot Streak', main: `${this.streak}`, sub: `Best ${this.best} · 15 ft+` }; },
        summary() { return { best: this.best }; },
      });
    }

    if (id === 'custom') {
      const ids = (cfg.spots && cfg.spots.length ? cfg.spots : ['lw3', 'top3', 'rw3']).filter(k => SPOTS[k]);
      const per = Math.max(1, Math.min(50, cfg.perSpot | 0 || 10));
      const target = Math.max(0.05, Math.min(1, cfg.target || 0.5));
      const seq = [];
      for (const k of ids) for (let i = 0; i < per; i++) seq.push(SPOTS[k]);
      const perSpot = Object.fromEntries(ids.map(k => [k, { att: 0, made: 0 }]));
      return ({ ...base,
        ballReturn: cfg.rapid ? 'rapid' : 'rebounder', requireSpot: true, i: 0, made: 0, resolved: 0, released: 0, perSpot, target,
        get spot() { return seq[Math.min(this.released, seq.length - 1)]; },
        canShoot() { return this.released < seq.length; },
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
          if (this.resolved >= seq.length) {
            this.done = true;
            const pct = this.made / seq.length;
            const lines = ids.map(k => `${SPOTS[k].label}: ${this.perSpot[k].made}/${this.perSpot[k].att}`);
            lines.push(pct >= target ? `Target ${Math.round(target * 100)}% reached` : `Target ${Math.round(target * 100)}% missed`);
            rec.custom = { pct, target, at: Date.now() };
            return [{ type: 'done', title: `${this.made}/${seq.length} · ${Math.round(pct * 100)}%`, lines, newBest: pct >= target }];
          }
          return [];
        },
        update() { return []; },
        hud() { const pct = this.resolved ? this.made / this.resolved : 0; return { title: 'Custom Training', main: `${this.made}/${this.resolved}`, sub: `${Math.round(pct * 100)}% · target ${Math.round(target * 100)}% · ${this.spot.label}`, progress: this.released / seq.length }; },
        summary() { return { made: this.made, total: seq.length }; },
      });
    }
    throw new Error('unknown mode ' + id);
  }

  return { SPOTS, CUSTOM_SPOT_IDS, MODE_INFO, create, ft };
})();
if (typeof module !== 'undefined') module.exports = HoopModes;
