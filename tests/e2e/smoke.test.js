// HOOP LAB — browser smoke test: boots the real game in headless Chromium (SwiftShader WebGL),
// checks every character loads and is playable, and that shot outcomes come from the physics.
// Run: npm run test:e2e   (screenshots → tests/shots/e2e_*.png)
const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'shots');
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.HOOP && window.HOOP.G.ready, null, { timeout: 120000 });
  check('Game boots', true);

  // characters: correct heights, playable
  const expect = { curry: 1.8796, lebron: 2.0574, jordan: 1.9812 };
  for (const id of Object.keys(expect)) {
    const h = await page.evaluate((id) => { HOOP.select(id); return HOOP.state().player.height; }, id);
    check(`${id} loads at the right height`, Math.abs(h - expect[id]) < 0.02, h.toFixed(3) + ' m');
  }

  // deterministic shooting
  await page.evaluate(() => { HOOP.setAuto(false); HOOP.setSetting('variance', 'off'); HOOP.setSetting('difficulty', 'pro'); HOOP.pause(false); });
  const shoot = (id, x, z, eMs) => page.evaluate(({ id, x, z, eMs }) => {
    HOOP.select(id); HOOP.place(x, z); HOOP.advance(0.6);
    const ok = HOOP.shoot(eMs); HOOP.advance(4.5);
    return { ok, s: HOOP.state().lastShot };
  }, { id, x, z, eMs });
  const ftX = 12.7248 - 4.19 - 0.25;
  for (const id of Object.keys(expect)) {
    const r = await shoot(id, ftX, 0, 0);
    check(`${id}: perfectly timed free throw scores`, r.ok && r.s && r.s.made, r.s ? `${r.s.result}, ${r.s.relAngle.toFixed(1)}°, ${r.s.relSpeed.toFixed(2)} m/s, entry ${r.s.entryAngle && r.s.entryAngle.toFixed(1)}°` : 'no shot');
    const r3 = await shoot(id, 12.7248 - 7.6, 0, 0);
    check(`${id}: perfectly timed top-of-key 3 scores`, r3.ok && r3.s && r3.s.made, r3.s ? `${r3.s.result} ${r3.s.dist.toFixed(2)} m` : 'no shot');
  }
  const early = await shoot('curry', 12.7248 - 7.6, 0, -140);
  check('Very early release misses short', early.s && !early.s.made && /front|short/.test(early.s.missType), early.s && early.s.missType);
  const late = await shoot('curry', 12.7248 - 7.6, 0, 140);
  check('Very late release misses long', late.s && !late.s.made && /back|long|board/.test(late.s.missType), late.s && late.s.missType);

  // ball comes back (rebounder) and the player can shoot again
  const back = await page.evaluate(() => { HOOP.advance(2.5); return HOOP.state().player.hasBall; });
  check('Rebounder returns the ball', back);

  // render a frame for the screenshot
  await page.evaluate(() => { HoopUI.showMenu(false); HOOP.pause(false); HOOP.select('curry'); HOOP.place(12.7248 - 6.5, 1.5); HOOP.advance(0.5); HOOP.setAuto(true); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'e2e_gameplay.png') });
  const st = await page.evaluate(() => HOOP.state());
  check('Renders frames', st.fps > 0, `${st.fps.toFixed(1)} fps (SwiftShader)`);
  check('No console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
