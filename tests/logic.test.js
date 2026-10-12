// Node tests for stats, coaching and practice modes. Run: node tests/logic.test.js
const PH = require('../src/physics.js');
const ST = require('../src/stats.js');
const MO = require('../src/modes.js');
const K = PH.K;
let pass = 0, fail = 0; const out = [];
const check = (n, c, i = '') => { c ? pass++ : fail++; out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); };

// ---- stats aggregation
const st = ST.createStore();
const mk = (x, z, made, extra = {}) => ST.addShot(st, Object.assign({ x, z, hoop: 0, dist: Math.hypot(x - K.HOOP_X, z), three: PH.isThree(x, z, 0), made, result: made ? 'swish' : undefined, missType: made ? undefined : 'front', relAngle: 50, relSpeed: 9, entryAngle: 44, eMs: -20 }, extra));
mk(K.HOOP_X - 7.6, 0, true); mk(K.HOOP_X - 7.6, 0, true); mk(K.HOOP_X - 7.6, 0, false);
mk(K.HOOP_X - 4.4, 0, true, { result: 'bank' }); mk(K.HOOP_X - 0.55, 7.05, false, { missType: 'back' }); mk(K.HOOP_X - 0.55, -7.05, true, { result: 'rim' });
const a = ST.aggregate(st.shots);
check('Aggregates attempts/makes/FG%', a.att === 6 && a.made === 4 && Math.abs(a.fg - 4 / 6) < 1e-9, `${a.made}/${a.att}`);
check('Three-point split', a.att3 === 5 && a.made3 === 3, `${a.made3}/${a.att3}`);
check('Streaks (current + best)', a.streak === 1 && a.bestStreak === 2, `current ${a.streak}, best ${a.bestStreak}`);
check('Result split: swish / bank / rim-in', a.swish === 2 && a.bank === 1 && a.rimIn === 1);
check('Miss breakdown front/back', a.miss.front === 1 && a.miss.back === 1);
check('Zones: corners, top 3, midrange', st.shots[4].zone === 'c3-r' && st.shots[5].zone === 'c3-l' && st.shots[0].zone === 't3' && st.shots[3].zone === 'mid-top', st.shots.map(s => s.zone).join(','));
// far hoop mirrored to the same half-court frame
const far = ST.addShot(st, { x: -K.HOOP_X + 0.55, z: -7.05, hoop: 1, dist: 7.07, three: PH.isThree(-K.HOOP_X + 0.55, -7.05, 1), made: true, result: 'swish' });
check('Far-basket shots mirror into the same half-court frame', far.zone === 'c3-r' && Math.abs(far.u - 0.55) < 1e-9 && far.v > 0, `zone ${far.zone}`);
check('isThree: corner 3 and arc', PH.isThree(K.HOOP_X - 0.55, 7.05, 0) && PH.isThree(K.HOOP_X - 7.3, 0, 0) && !PH.isThree(K.HOOP_X - 7.1, 0, 0) && !PH.isThree(K.HOOP_X - 0.5, 6.6, 0));
const hg = ST.heatGrid(st.shots);
check('Heat map grid covers the half court with shrunk percentages', hg.cols === 16 && hg.rows === 15 && Math.max(...hg.pct) <= 1 && Math.max(...hg.pct) > 0, `${hg.cols}x${hg.rows}`);
// coaching
const st2 = ST.createStore();
for (let i = 0; i < 12; i++) ST.addShot(st2, { x: K.HOOP_X - 7.5, z: 0, hoop: 0, dist: 7.5, three: true, made: i % 3 === 0, missType: 'front', eMs: -32 - (i % 4), entryAngle: 42, result: 'swish' });
const tips = ST.coach(st2.shots);
check('Coach flags early releases and front-rim misses', tips.some(t => t.kind === 'timing' && /early/.test(t.text)) && tips.some(t => t.kind === 'depth' && /front rim/.test(t.text)), tips.map(t => t.kind).join(','));

// ---- modes
const records = {};
// 3pt challenge: 25 balls, money balls worth 2
let m = MO.create('three', {}, records), score = 0;
const shots = [];
for (let i = 0; i < 25; i++) { const s = {}; m.onRelease(s); shots.push(s); }
let done = null;
for (let i = 0; i < 25; i++) { const ev = m.onResult({ made: true, dist: 7.3 }, shots[i]); done = ev.find(e => e.type === 'done') || done; }
check('Three-Point Challenge: perfect round scores 30 (money balls worth 2)', m.score === 30 && done && records.three === 30, `score ${m.score}`);
check('Three-Point Challenge: rack spots rotate corner → corner', m.rack === 5);
m = MO.create('three', {}, {});
const s1 = {}; m.onRelease(s1); m.update(61);
check('Three-Point Challenge: buzzer stops new shots', m.buzzer && !m.canShoot());
// deep range: make moves back 2 ft, 3 strikes end
m = MO.create('deep', {}, records);
const d0 = m.spot.dist;
let s = {}; m.onRelease(s); m.onResult({ made: true, dist: d0 }, s);
const d1 = m.spot.dist;
check('Deep-Range: a make moves the spot back 2 ft', Math.abs(d1 - d0 - 0.6096) < 0.01, `${d0.toFixed(2)} → ${d1.toFixed(2)} m`);
for (let i = 0; i < 3; i++) { s = {}; m.onRelease(s); m.onResult({ made: false, dist: d1 }, s); }
check('Deep-Range: three strikes ends the run and saves the best distance', m.done && records.deep > 7);
// perfect release scoring
m = MO.create('perfect', {}, records);
for (let i = 0; i < 10; i++) { s = {}; m.onRelease(s); m.onResult({ made: true, eMs: 0 }, s); }
check('Perfect Release: ten perfect makes = 1000', m.score === 1000 && m.done);
// around the world
m = MO.create('atw', {}, records);
const order = [];
for (let i = 0; i < 9; i++) { order.push(m.spot.id); s = {}; m.onRelease(s); m.onResult({ made: i !== 2 && i !== 3 }, s); }
check('Around the World: advances only on makes, finishes in 9 shots', m.done && m.attempts === 9 && order[2] === order[3] && order[3] === order[4], order.join(' '));
// hot streak
m = MO.create('streak', {}, records);
for (const r of [{ made: true, dist: 6 }, { made: true, dist: 6 }, { made: true, dist: 2 }, { made: true, dist: 7 }, { made: false, dist: 7 }]) { s = {}; m.onRelease(s); m.onResult(r, s); }
check('Hot Streak: short shots ignored, miss ends the run, best kept', m.streak === 0 && m.best === 3);
// custom
m = MO.create('custom', { spots: ['ft', 'top3'], perSpot: 3, target: 0.5 }, records);
const seen = [];
for (let i = 0; i < 6; i++) { seen.push(m.spot.id); s = {}; m.onRelease(s); m.onResult({ made: i < 4 }, s); }
check('Custom Training: rotates spots, counts per spot, compares to target', m.done && m.perSpot.ft.made === 3 && m.perSpot.top3.made === 1 && seen.join() === 'ft,ft,ft,top3,top3,top3');

// ---- new drills + catalogue
const recs = {};
// every mode in the catalogue can be created with its defaults and has intro-card data
check('Catalogue: every mode has rules + default config and creates cleanly', MO.MODE_INFO.every(mi => Array.isArray(mi.rules) && mi.rules.length && MO.create(mi.id, MO.defaultCfg(mi.id), {}).id === mi.id), MO.MODE_INFO.map(m => m.id).join(','));
// free-throw practice with routine
m = MO.create('ft', { count: 10, routine: true }, recs);
check('Free throws: spot is the line, routine of 3 dribbles, rebounder', m.spot.id === 'ft' && m.routine === 3 && m.ballReturn === 'rebounder' && m.requireSpot);
let lastEv = [];
for (let i = 0; i < 10; i++) { s = { routine: i % 2 === 0 }; m.onRelease(s); check.q = m.canShoot(); lastEv = m.onResult({ made: i !== 4, eMs: i % 2 ? 6 : -6, green: true }, s); }
const ftDone = lastEv.find(e => e.type === 'done');
check('Free throws: 9/10 ends the set, best run 5, timing SD reported, PB saved per count', m.done && ftDone && m.made === 9 && m.bestStreak === 5 && recs.ft[10] === 9 && /± 6 ms/.test(ftDone.rows.find(r => /Timing/.test(r[0]))[1]) && m.withRoutine === 5, ftDone && ftDone.title);
check('Free throws: one shot at a time (blocked while the ball is in the air)', (() => { const f = MO.create('ft', {}, {}); const a = {}; f.onRelease(a); return !f.canShoot(); })());
check('Free throws: routine off → routine 0', MO.create('ft', { routine: false }, {}).routine === 0);
// spot-up 5-spot
m = MO.create('spot5', { range: 'three', perSpot: 3 }, recs);
const spotSeq = [], moves = [];
for (let i = 0; i < 15; i++) { spotSeq.push(m.spot.id); s = {}; const ev = m.onRelease(s); if (ev.some(e => e.type === 'moveTo')) moves.push(i); m.update(1); m.onResult({ made: i % 3 !== 0 }, s); }
check('Spot-up: corner → corner, 3 per spot, moves after each spot, rapid rack', spotSeq.join(',') === 'lc3,lc3,lc3,lw3,lw3,lw3,top3,top3,top3,rw3,rw3,rw3,rc3,rc3,rc3' && moves.join() === '2,5,8,11' && m.ballReturn === 'rapid', spotSeq.slice(0, 4).join(','));
check('Spot-up: 10/15 recorded with time as the PB tiebreaker', m.done && m.made === 10 && recs.spot5['three-3'].made === 10 && Math.abs(recs.spot5['three-3'].time - 15) < 1e-9);
const m2 = MO.create('spot5', { range: 'three', perSpot: 3 }, recs);
for (let i = 0; i < 15; i++) { s = {}; m2.onRelease(s); m2.update(0.5); m2.onResult({ made: i % 3 !== 0 }, s); }
check('Spot-up: same makes in less time is a new best', recs.spot5['three-3'].time < 10 && m2.done);
check('Spot-up: midrange spots', MO.create('spot5', { range: 'mid' }, {}).spot.id === 'lbase');
// catch-and-shoot
m = MO.create('catch', { perSpot: 2 }, recs);
check('Catch-and-shoot: starts without the ball, passer feeds', m.startEmpty && m.ballReturn === 'feed' && m.passer && typeof m.passer.x === 'number');
for (let i = 0; i < 10; i++) { s = { catchShoot: i < 6, catchDelay: i < 6 ? 0.3 : 0.9 }; m.onRelease(s); m.onResult({ made: i % 2 === 0 }, s); }
check('Catch-and-shoot: make 2 + rhythm bonus 1; 5 makes (3 in rhythm) = 13', m.done && m.score === 13 && m.rhythm === 6 && recs.catch === 13, `score ${m.score}`);
// off-the-dribble
m = MO.create('dribble', { shots: 10 }, recs);
s = { dist: 8 }; const noMove = m.onRelease(s);
check('Off-the-dribble: shot without a move does not count', !s.counted && noMove.some(e => /move/.test(e.text)) && m.counted === 0);
s = { dist: 3, afterMove: 'crossover' }; m.onRelease(s);
check('Off-the-dribble: pull-ups shorter than 15 ft do not count', !s.counted);
for (let i = 0; i < 10; i++) { s = { dist: 8, afterMove: i < 5 ? 'stepback' : 'crossover' }; m.onRelease(s); m.onResult({ made: i % 2 === 0 }, s); }
check('Off-the-dribble: step-back make 3, crossover make 2 (3+3+3 + 2+2 = 13)', m.done && m.score === 13 && m.step.made === 3 && m.cross.made === 2 && recs.dribble === 13, `score ${m.score}`);
// three-point challenge: modern format
m = MO.create('three', { format: 'modern', moneyRack: 'rc3' }, recs);
const mshots = [];
for (let i = 0; i < 27; i++) { s = {}; m.onRelease(s); mshots.push(s); }
for (const x of mshots) m.onResult({ made: true }, x);
check('Three-Point Challenge (modern): 27 balls incl. 2 deep balls and a money rack = 40, separate PB', m.done && m.score === 40 && m.total === 27 && recs.threeModern === 40 && mshots.filter(x => x.deep).length === 2, `score ${m.score}`);
check('Three-Point Challenge (modern): 70-second clock', MO.create('three', { format: 'modern' }, {}).timer === 70);
m = MO.create('three', {}, {});
for (let i = 0; i < 24; i++) { s = {}; m.onRelease(s); m.onResult({ made: false }, s); }
s = {}; m.onRelease(s); const clutchEv = m.onResult({ made: true }, s);
check('Three-Point Challenge: last-ball make is flagged clutch (auto-replay hook)', s.clutch && clutchEv.some(e => e.type === 'clutch'));
// around the world: chance rule
m = MO.create('atw', { chance: true }, {});
for (const r of [true, true, false, false]) { s = {}; m.onRelease(s); m.onResult({ made: r }, s); }
check('Around the World (chance): two misses in a row send you back to the start', m.idx === 0 && m.resets === 1);
// ending a session early
m = MO.create('streak', { min: 'three' }, recs);
for (const r of [{ made: true, three: true }, { made: true, three: false, dist: 6 }, { made: true, three: true }]) { s = {}; m.onRelease(s); m.onResult(r, s); }
const endEv = m.end();
check('Hot Streak (threes): only threes count; end() produces results', m.streak === 2 && endEv[0].type === 'done' && recs.streak3 === 2 && m.done);
m = MO.create('perfect', {}, {}); s = {}; m.onRelease(s); m.onResult({ made: true, eMs: 0 }, s);
const pe = m.end();
check('Ending a drill early reports results without saving an incomplete PB', pe[0].type === 'done' && m.done && !({}).perfect);
check('Best text for intro cards', MO.bestText('ft', recs, { count: 10 }) === '9/10' && MO.bestText('three', recs, { format: 'modern' }) === '40 pts' && MO.bestText('deep', {}, {}) === null);

console.log(out.join('\n')); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
