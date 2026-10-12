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

console.log(out.join('\n')); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
