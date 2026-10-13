// HOOP LAB — shot records, aggregation, zones, heat map, and rule-based coaching feedback.
const HoopStats = (() => {
  'use strict';
  const PH = (typeof HoopPhysics !== 'undefined') ? HoopPhysics : require('./physics.js');
  const K = PH.K;
  const MAX_SHOTS = 3000;

  // Convert a court position to the half-court frame of the target hoop:
  // u = distance from the hoop toward mid-court, v = lateral (positive = shooter's right when facing the hoop)
  function toHalf(x, z, hi) {
    if (hi === 0) return { u: K.HOOP_X - x, v: z };
    return { u: x + K.HOOP_X, v: -z };
  }

  const ZONES = [
    { id: 'ra', label: 'Restricted area' }, { id: 'paint', label: 'Paint' },
    { id: 'mid-lb', label: 'Left baseline mid' }, { id: 'mid-lw', label: 'Left wing mid' }, { id: 'mid-top', label: 'Top of key mid' },
    { id: 'mid-rw', label: 'Right wing mid' }, { id: 'mid-rb', label: 'Right baseline mid' },
    { id: 'c3-l', label: 'Left corner 3' }, { id: 'w3-l', label: 'Left wing 3' }, { id: 't3', label: 'Top 3' },
    { id: 'w3-r', label: 'Right wing 3' }, { id: 'c3-r', label: 'Right corner 3' },
    { id: 'deep', label: 'Deep (28 ft+)' }, { id: 'logo', label: 'Logo & beyond' },
  ];
  const ZONE_LABEL = Object.fromEntries(ZONES.map(z => [z.id, z.label]));

  function zoneOf(u, v, d, three) {
    if (d < K.RA_R) return 'ra';
    const inLane = Math.abs(v) <= K.LANE_W / 2 && u <= K.LANE_L - K.HOOP_FROM_BASELINE;
    if (!three) {
      if (inLane) return 'paint';
      const a = Math.atan2(v, u) * 180 / Math.PI; // 0 = straight on, +90 = right baseline
      if (a < -60) return 'mid-lb'; if (a < -20) return 'mid-lw'; if (a <= 20) return 'mid-top'; if (a <= 60) return 'mid-rw'; return 'mid-rb';
    }
    if (d >= 10.0) return 'logo';
    if (d >= 8.534) return 'deep';
    if (Math.abs(v) >= K.THREE_CORNER - 0.05 && u < 3.0) return v < 0 ? 'c3-l' : 'c3-r';
    const a = Math.atan2(v, u) * 180 / Math.PI;
    if (a < -22) return 'w3-l'; if (a <= 22) return 't3'; return 'w3-r';
  }

  function createStore(saved) {
    const st = { shots: [], sessionStart: Date.now(), records: {} };
    if (saved && Array.isArray(saved.shots)) { st.shots = saved.shots.slice(-MAX_SHOTS); st.records = saved.records || {}; }
    return st;
  }

  function addShot(st, rec) {
    const h = toHalf(rec.x, rec.z, rec.hoop);
    rec.u = h.u; rec.v = h.v;
    rec.zone = zoneOf(h.u, h.v, rec.dist, rec.three);
    rec.session = st.sessionStart;
    st.shots.push(rec);
    if (st.shots.length > MAX_SHOTS) st.shots.splice(0, st.shots.length - MAX_SHOTS);
    return rec;
  }

  function filter(st, scope) {
    if (scope === 'session') return st.shots.filter(s => s.session === st.sessionStart);
    return st.shots;
  }

  function aggregate(shots) {
    const a = { att: 0, made: 0, fg: 0, att3: 0, made3: 0, fg3: 0, streak: 0, bestStreak: 0, swish: 0, bank: 0, rimIn: 0,
      miss: { front: 0, back: 0, left: 0, right: 0, air: 0, board: 0 }, avgDist: 0, relAngle: 0, relSpeed: 0, entry: 0,
      entryN: 0, perfect: 0, timingMean: 0, timingSd: 0, timingN: 0, longest: 0, zones: {} };
    let cur = 0, sd = 0, se = 0, se2 = 0, sang = 0, sspd = 0;
    for (const s of shots) {
      a.att++; sd += s.dist; sang += s.relAngle || 0; sspd += s.relSpeed || 0;
      if (s.three) a.att3++;
      if (s.made) {
        a.made++; if (s.three) a.made3++; cur++; if (cur > a.bestStreak) a.bestStreak = cur;
        if (s.result === 'swish') a.swish++; else if (s.result === 'bank') a.bank++; else a.rimIn++;
        if (s.dist > a.longest) a.longest = s.dist;
      } else {
        cur = 0;
        const m = s.missType || 'air';
        if (m.startsWith('air')) a.miss.air++; else if (a.miss[m] !== undefined) a.miss[m]++;
      }
      if (typeof s.entryAngle === 'number' && s.entryAngle > 0) { a.entry += s.entryAngle; a.entryN++; }
      if (typeof s.eMs === 'number' && Math.abs(s.eMs) < 250) { se += s.eMs; se2 += s.eMs * s.eMs; a.timingN++; if (s.grade === 'Perfect') a.perfect++; }
      const z = a.zones[s.zone] || (a.zones[s.zone] = { att: 0, made: 0 });
      z.att++; if (s.made) z.made++;
    }
    a.streak = cur;
    a.fg = a.att ? a.made / a.att : 0;
    a.fg3 = a.att3 ? a.made3 / a.att3 : 0;
    a.avgDist = a.att ? sd / a.att : 0;
    a.relAngle = a.att ? sang / a.att : 0;
    a.relSpeed = a.att ? sspd / a.att : 0;
    a.entry = a.entryN ? a.entry / a.entryN : 0;
    if (a.timingN) { a.timingMean = se / a.timingN; a.timingSd = Math.sqrt(Math.max(0, se2 / a.timingN - a.timingMean ** 2)); }
    return a;
  }

  // Grid heat map over the half court: makes/attempts per 1 m cell with a Bayesian prior toward the overall average.
  function heatGrid(shots, cell = 1.0) {
    const cols = Math.ceil(K.COURT_HALF_W * 2 / cell), rows = Math.ceil((K.COURT_HALF_L + 0.5) / cell);
    const att = new Float32Array(cols * rows), made = new Float32Array(cols * rows);
    let tm = 0, ta = 0;
    for (const s of shots) {
      const base = s.u + K.HOOP_FROM_BASELINE; // distance from baseline
      const c = Math.floor((s.v + K.COURT_HALF_W) / cell), r = Math.floor(base / cell);
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      // spread each shot into its 3x3 neighborhood (gaussian-ish) for a smooth map
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        const w = dr === 0 && dc === 0 ? 1 : (dr === 0 || dc === 0) ? 0.45 : 0.2;
        att[rr * cols + cc] += w; if (s.made) made[rr * cols + cc] += w;
      }
      ta++; if (s.made) tm++;
    }
    const avg = ta ? tm / ta : 0.45, prior = 2.5;
    const pct = new Float32Array(cols * rows);
    for (let i = 0; i < pct.length; i++) pct[i] = att[i] > 0 ? (made[i] + avg * prior) / (att[i] + prior) : -1;
    return { cols, rows, cell, att, pct, avg };
  }

  // Rule-based coaching: looks at recent shots and returns short, specific tips (most relevant first).
  function coach(shots, opts = {}) {
    const tips = [];
    const recent = shots.slice(-24);
    if (recent.length < 5) return [{ kind: 'info', text: 'Take a few more shots and I will start spotting patterns in your release.' }];
    const timed = recent.filter(s => typeof s.eMs === 'number' && Math.abs(s.eMs) < 250);
    const misses = recent.filter(s => !s.made);
    if (timed.length >= 5) {
      const mean = timed.reduce((t, s) => t + s.eMs, 0) / timed.length;
      const sd = Math.sqrt(timed.reduce((t, s) => t + (s.eMs - mean) ** 2, 0) / timed.length);
      if (mean < -14) tips.push({ kind: 'timing', score: Math.abs(mean), text: `You are releasing early (average ${Math.round(mean)} ms). Early releases leave the ball short. Hold a beat longer before letting go.` });
      else if (mean > 14) tips.push({ kind: 'timing', score: Math.abs(mean), text: `You are releasing late (average +${Math.round(mean)} ms). Late releases fly long and flat. Let go a touch sooner.` });
      if (sd > 30) tips.push({ kind: 'consistency', score: sd * 0.6, text: `Your timing varies by about ±${Math.round(sd)} ms shot to shot. Pick one spot, use the same rhythm every rep, and watch the meter.` });
      else if (Math.abs(mean) <= 10 && sd <= 18) tips.push({ kind: 'praise', score: 5, text: `Release timing is locked in (average ${mean >= 0 ? '+' : ''}${Math.round(mean)} ms, ±${Math.round(sd)} ms).` });
    }
    if (misses.length >= 4) {
      const cnt = (t) => misses.filter(s => s.missType === t).length;
      const front = cnt('front'), back = cnt('back') + cnt('board'), side = cnt('left') + cnt('right');
      const airShort = misses.filter(s => s.missType === 'air-short').length;
      if (front / misses.length > 0.5) tips.push({ kind: 'depth', score: 30 * front / misses.length, text: `${front} of ${misses.length} recent misses hit the front rim. Release slightly later, or add arc in the Jump Shot Creator.` });
      if (back / misses.length > 0.5) tips.push({ kind: 'depth', score: 30 * back / misses.length, text: `${back} of ${misses.length} recent misses were long off the back rim or glass. Release slightly earlier.` });
      if (side / misses.length > 0.35) {
        const moving = misses.filter(s => (s.missType === 'left' || s.missType === 'right') && s.moving).length;
        tips.push({ kind: 'line', score: 25 * side / misses.length, text: moving > side / 2 ? 'Left/right misses come from drifting as you rise. Stop and square your feet before the jump.' : 'Left/right misses: keep the shooting elbow under the ball and let the guide hand come off sooner.' });
      }
      if (airShort >= 2) tips.push({ kind: 'range', score: 18, text: `${airShort} airballs short. You may be beyond your comfort range; the Jump Shot Creator shows your range for each jumper.` });
    }
    const entries = recent.filter(s => s.entryAngle > 0);
    if (entries.length >= 5) {
      const avgEntry = entries.reduce((t, s) => t + s.entryAngle, 0) / entries.length;
      if (avgEntry < 39) tips.push({ kind: 'arc', score: 15, text: `Average entry angle is ${avgEntry.toFixed(0)}°, which is flat. A higher arc (45°+) gives the ball a bigger target.` });
    }
    // zone recommendations over a longer window
    const zs = {};
    for (const s of shots.slice(-300)) { const z = zs[s.zone] || (zs[s.zone] = { att: 0, made: 0 }); z.att++; if (s.made) z.made++; }
    const ranked = Object.entries(zs).filter(([, z]) => z.att >= 6).map(([id, z]) => ({ id, ...z, pct: z.made / z.att })).sort((a, b) => a.pct - b.pct);
    if (ranked.length >= 2) {
      const cold = ranked[0], hot = ranked[ranked.length - 1];
      if (cold.pct < hot.pct - 0.15) tips.push({ kind: 'zone', score: 12, text: `Cold zone: ${ZONE_LABEL[cold.id]} (${cold.made}/${cold.att}). Try a Custom Training set there. Hot zone: ${ZONE_LABEL[hot.id]} (${hot.made}/${hot.att}).` });
    }
    const threes = shots.slice(-60).filter(s => s.three);
    if (threes.length >= 15 && threes.filter(s => s.made).length / threes.length >= 0.55) tips.push({ kind: 'challenge', score: 8, text: `You are hitting ${Math.round(100 * threes.filter(s => s.made).length / threes.length)}% from three. Ready for the Deep-Range Challenge.` });
    tips.sort((a, b) => b.score - a.score);
    return tips.slice(0, opts.max || 4);
  }

  function serialize(st) { return { shots: st.shots, records: st.records }; }

  return { toHalf, zoneOf, ZONES, ZONE_LABEL, createStore, addShot, filter, aggregate, heatGrid, coach, serialize, MAX_SHOTS };
})();
if (typeof module !== 'undefined') module.exports = HoopStats;
