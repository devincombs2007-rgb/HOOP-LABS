# HOOP LAB — handoff for Claude Code

3D basketball shootaround simulator for the browser (Three.js r147 + custom physics). The full original
spec is in `docs/SPEC.md`. This file is the current state and the plan for finishing it.

## Update — integration baseline (multi-agent phase)

The game is now wired together and playable: `src/game.js` (fixed-step loop, shot flow from input
timestamps, physics-resolved make/miss classification, ball return, modes, replay recording,
`window.HOOP` automation API), `src/ui.js` + `src/style.css` + `index.html` (menu/character select,
HUD, shot meter, results), `build/build.js` (single-file `dist/hoop-lab.html`), `build/serve.js`
(`npm start`), and `tests/e2e/smoke.test.js` (`npm run test:e2e`, real game in headless Chromium).
Characters are now Stephen Curry / LeBron James / Michael Jordan (ids `curry`, `lebron`, `jordan`).
**Module ownership and the interfaces every module must keep are in `docs/TEAM.md`.**

## Status at handoff

**Done and tested in Node** (`npm test` → 42 tests, all passing):

| File | What it is | Tested |
|---|---|---|
| `src/physics.js` | Ball physics: gravity, quadratic drag, Magnus/backspin, RK2 with adaptive substeps (≤1.2 cm/substep, no tunneling), torus rim, backboard box, rim bracket, stanchion, floor, walls, bleachers, net drag zone, scoring detection (ball center crosses ring plane downward inside the ring, confirmed 30 cm below), launch-speed solver | 23 tests in `tests/physics.test.js` |
| `src/shotmodel.js` | Turns jumper mechanics + release timing + body momentum into release velocity/spin. Early = short, late = long, guide hand/elbow = predictable lateral error, uncompensated drift carries the ball. Clean-entry timing window calculator (drives the shot meter's green zone). Seeded variance RNG. | covered by physics tests |
| `src/roster.js` | 16 Jump Shot Creator params, 6 presets incl. "My Real-Life Jumper", 3 characters with distinct movement + shooting mechanics | covered |
| `src/stats.js` | Shot records, aggregates, 14 zones, heat-map grid, rule-based coach tips | 10 tests in `tests/logic.test.js` |
| `src/modes.js` | Free, Three-Point Challenge, Deep-Range, Perfect Release, Around the World, Hot Streak, Custom Training | 9 tests |

**Done, verified visually in headless Chromium** (`npm run rig-test`, screenshots in `tests/shots/`):

| File | What it is |
|---|---|
| `src/characters3d.js` | Loads the 3 supplied GLBs with `THREE.GLTFLoader` from base64 (`src/assets.gen.js`, made by `npm run assets`). Linearizes sRGB vertex colors, computes missing normals, merges meshes per pivot (~18 draw calls/character), redraws jersey lettering on canvas, recolor support, two-bone IK applied to the named pivots. |
| `src/anim.js` | Player controller + procedural animation: cyclic gait with planted feet, re-step mode for turning/standing, dribble, crossover, step-back, jump, catch/pickup hooks, full jump-shot motion driven by the 16 jumper params (load, takeoff, flight, release, wrist flick, guide hand, follow-through, landing). |

**Written but not yet run in a browser** (syntax-checked only):
`src/world.js` (court with NBA markings, hoops, verlet nets, stands, lights, planar floor reflection, quality presets),
`src/audio.js` (synthesized Web Audio SFX + gym reverb), `src/input.js` (keyboard/mouse/gamepad/touch),
`src/camera.js` (6 camera modes), `src/replay.js` (frame recorder + exact playback).

**Not written yet:** the game loop that wires it all together, the HTML/CSS interface, the single-file build, browser integration tests.

## Next steps (in order)

1. **`src/game.js`** — boot (renderer, `HoopCharacters.loadAll`, `HoopWorld.build`), 120 Hz fixed tick with ball physics at 2×1/240, render interpolation. Ball pool (≤6, `HoopPhysics.createBall`), shot trackers that resolve make/miss and classify (swish/bank/rim/rattle; front/back/left/right/board/airball; entry angle from the `'cross'` event), ball return (rebounder / rapid / manual; R calls the ball), auto pickup, target-hoop choice (camera forward), shot flow: `shootDown` → `player.startShot` + `HoopShot.planShot` + `timingWindow` for the meter; `shootUp` → `player.release(t)` using **event timestamps** (`(keyup.timeStamp - keydown.timeStamp)/1000`), re-plan from the ideal release point, `releaseFromPlan`, hand the velocity to the physics ball. Quick tap < 0.16 s = pump fake. Auto-release at T + 0.25 s.
2. **`src/index.html` + CSS + `src/ui.js`** — main menu (attract mode behind it), character select (3 models on court), training select + custom config, Jump Shot Creator (sliders grouped by `PARAMS[].group`, live derived readouts, looping preview), player customization (name plate, number, colors via `model.setColors`/`setLettering`), stats dashboard (shot chart, zone heat map, miss breakdown, coach tips), settings (graphics/camera/audio/gameplay), pause, results, replay bar, HUD + shot meter, touch overlay (`#touch` with `.stick`, `.stick-knob`, `[data-touch]` buttons — `input.js` expects these).
   Design direction already chosen: dark game UI over the 3D scene; maple-gold accent `#E3A33A`, court-paint blue `#1F4E86`, make `#4CD18A`, miss `#FF6B5A`; fonts Big Shoulders Display (display) + Barlow (UI, tabular numbers).
3. **`build/build.js`** — concatenate into one `dist/hoop-lab.html`: `<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js">`, then `.../examples/js/loaders/GLTFLoader.js`, then inline: physics, roster, shotmodel, stats, modes, assets.gen, characters3d, anim, world, audio, input, camera, replay, ui, game.
4. **Browser tests** with Playwright (pattern in `tests/rig_shots*.py`: SwiftShader flags, route the jsDelivr URLs to `node_modules/three/...`): models load with heights 1.88/1.98/2.06 m, a perfectly timed shot scores, early/late miss correctly, every mode completes, pause/resume, camera cycling, a stubbed `navigator.getGamepads`, zero console errors, screenshots.
5. Polish: player-animation tuning from screenshots, audio balancing, performance on low preset.

## Things to know

- **Pivot sides are mirrored in the pack:** `L_*` nodes sit at −X, which is the avatar's anatomical *right* when facing +Z. `characters3d.js` picks sides by position (`model.sideNames`, `model.limbs[0]` = right/shooting arm), so don't trust the names.
- Pack textures have V stored bottom-up → canvas lettering uses `flipY = true`.
- The GLBs ship without normals and with sRGB vertex colors in a linear slot; both are fixed at load.
- Three.js is pinned to **r147** because it's the last release with classic (non-module) `examples/js` loaders. Uses `renderer.outputEncoding = THREE.sRGBEncoding` (pre-r152 API).
- Characters use original role names (Range Guard #30, Point Forward #23 purple, Aerial Wing #23 red); the back-of-jersey plate shows the player-editable name.
- Units are meters/seconds everywhere. Hoop 0 is at +X, hoop 1 at −X. Yaw ψ means forward = (sin ψ, 0, cos ψ).
- `HoopShot` tuning constants (`KT`, `KA`, `KG`, `KE`) and `DIFFICULTY` set how forgiving timing is; the physics tests print a table of clean timing windows by distance.

## Commands

```bash
npm install              # three@0.147.0 (local copy for tests)
npm test                 # 42 Node tests
npm run assets           # rebuild src/assets.gen.js from assets/*.glb
npm run rig-test         # headless render of the three characters (needs: pip install playwright && playwright install chromium)
```
