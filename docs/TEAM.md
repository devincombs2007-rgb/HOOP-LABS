# HOOP LAB — team contract (module ownership + shared interfaces)

Nineteen development agents (plus the lead) work in parallel, each in its own git worktree/branch, then the lead
integrates. This file is the contract: **ownership** says who may edit what, **interfaces** say
what must keep working no matter who changes the internals.

## Ground rules

1. Edit only what you own (table below — some files are split by **function**). If you need a change
   in someone else's area, **message that teammate** (SendMessage, agent IDs in the roster you were
   sent) or keep it to a few clearly-commented lines and list it under "Cross-module edits" in your
   report. The lead (Engine Architect) merges all branches and resolves conflicts.
2. Never break an interface listed below. You may *add* optional fields/functions. If you must
   change a signature, keep the old one working (adapter) and document it.
3. Keep these green before every commit: `npm test` (Node physics/logic) and `npm run test:e2e`
   (real game in headless Chromium). Add tests for what you build.
4. Never claim something is tested unless you ran it. Screenshots go in `tests/shots/` (gitignored
   except `sheet.png`); look at them, don't just produce them.
5. Units: meters, seconds, kg. Y up. Hoop 0 at +X, hoop 1 at −X. Yaw ψ ⇒ forward (sin ψ, 0, cos ψ),
   right (−cos ψ, 0, sin ψ). Three.js is pinned to r147 (classic `examples/js`, `outputEncoding`).
6. Scope exclusions: no AI Evolution, no reinforcement learning, no autonomous AI athletes.
7. No official NBA/team logos or crests. Player names, numbers, generic colorways are fine.
8. Shared machine (4 CPU cores, ~19 agents): keep headless-browser runs short (SwiftShader is
   CPU-heavy) — use `HOOP.setAuto(false)` + `HOOP.advance()`, small viewports (≤1280×720), close
   browsers, don't run long benchmarks in loops. Don't bind fixed ports (load `index.html` via
   `file://`, or `PORT=<random> npm start`).
9. Commit early and often in your own worktree branch; never push; the lead merges.

## Team (20 roles) and ownership

| # | Role | Owns |
|---|---|---|
| 1 | Engine Architect (lead) | `docs/TEAM.md`, `CLAUDE.md`, `README.md`, script order in `index.html`, all integration merges |
| 2 | 3D Character Modeler | `src/characters3d.js` (loading, CharacterModel, body/uniform/shoe geometry, skinning, `dims`), `assets/**`, `build/make_assets.js`, new `src/models/body*.js` |
| 3 | Face & Texture Specialist | `src/models/head.js` (`HoopHead`), `src/gfx/materials.js` (`HoopMaterials`: skin, hair, fabric, rubber/leather, procedural textures) |
| 4 | Character Rigging Engineer | `src/rig.js` (`HoopRig.applyPose`: IK, joint limits, twist distribution, spine chain, hand/finger poses, foot roll) |
| 5 | Shooting Animation Engineer | `src/anim.js` **shot functions**: `startShot, buildShotKeys, shotBallWorld, pelvisOffsetAt, bodyVyAt, predictReleasePos, release, pumpFake, updateShot` and the `shot`/`s` branches inside `computePose`/`computeHands`; `src/roster.js` `sig` + new `style` per character |
| 6 | Movement Animation Engineer | `src/anim/move.js` (`HoopMove.install` prototype overrides) and in `src/anim.js` the **non-shot functions**: `update` (locomotion part), `updateFeet, replantFeet, updateBallCarry, crossover, stepback, jump, giveBall`, non-shot branches of `computePose`/`computeHands`; `src/roster.js` `move` |
| 7 | Basketball Physics Engineer | `src/physics.js` **flight**: aero constants in `K` (CD, CL, rho), `accel, integrateFree, integrateOrientation, flightCross, solveLaunchSpeed, minSpeedAngle, backspinAxis`, spin decay, ball–ball collision (`collideBalls`); `tests/physics/flight*.test.js` |
| 8 | Collision Physics Engineer | `src/physics.js` **contacts**: `MAT, resolve, sphereBox, sphereCapsule, sphereRim, sphereBleachers, applyNet, netRadiusAt`, floor/settle/rolling + scoring detection inside `step`, hoop geometry in `makeHoop`; `tests/physics/contact*.test.js` |
| 9 | Shooting Mechanics Engineer | `src/shotmodel.js` (release timing windows, angle, velocity, spin, body-motion compensation, difficulty/variance, `resolveRelease`, `shotWindow`, `derive`); `tests/physics/shotmodel*.test.js` |
| 10 | Player Controls Engineer | `src/input.js` (keyboard/mouse/gamepad/touch, bindings, dead zones, `HoopInput.rumble(strength, ms)`, `HoopInput.device()` for glyphs), `tests/e2e/input*.test.js` |
| 11 | Camera Engineer | `src/camera.js`, `src/replay.js` (gameplay cameras, cinematic replay cameras, slow-mo/scrub/angles) |
| 12 | Environment Artist | `src/world.js` (court, hardwood, markings, hoops/backboard/stanchion/net visuals, arena, stands, scoreboard, banners) |
| 13 | Graphics Engineer | `src/gfx/render.js` (`HoopRender`: renderer config, post-processing AA/AO/bloom/grading), `src/gfx/lighting.js` (`HoopLighting`: arena light rig, shadows), may add `node_modules/three/examples/js/postprocessing|shaders/*` scripts to `index.html` |
| 14 | Gameplay Engineer | `src/game.js`, `src/modes.js`, `tests/logic.test.js` (modes part): shootaround systems, ball return, drills/challenges, wiring other roles' hooks |
| 15 | Jump Shot Creator Engineer | `src/ui/jsc.js`, `src/ui/jsc.css` (`HoopJSC`) |
| 16 | UI/UX Designer | `src/ui.js`, `src/style.css`, `index.html` markup (menus, character select, HUD, meter, settings, pause, results, touch overlay) |
| 17 | Statistics Engineer | `src/stats.js`, `src/ui/stats.js`, `src/ui/stats.css` (`HoopStatsUI`), new `tests/stats.test.js` |
| 18 | Audio Engineer | `src/audio.js` (`HoopAudio`, optional `HoopAudio.attach(game)` to subscribe to game events) |
| 19 | Performance Engineer | `src/perf.js` (`HoopPerf`: frame-time monitor, dynamic resolution, auto quality), `tests/perf/**`, `tests/PERF.md`; hot-path fixes elsewhere only as small surgical edits or patches sent to the owner |
| 20 | Quality Assurance Engineer | `tests/e2e/**` (except `input*`), `tests/tools/*`, `tests/BUGS.md`, `tests/*.html` |

Shared-file etiquette: `src/anim.js`, `src/physics.js`, `src/roster.js`, `index.html` have several
owners split by function/section — touch only your functions, don't reformat or move code you don't
own, keep diffs tight so the lead's 3-way merges stay clean. New script files: add your `<script>`
tag in `index.html` at the right place in the load order (build order = that order).

## Integration hooks (already wired in the baseline — fill them in, don't re-wire)

| Hook | Called from | Owner |
|---|---|---|
| `HoopRig.applyPose(model, pose)` | `HoopCharacters.applyPose` delegates when it's a function | Rigging |
| `HoopHead.attach(model, def)` → `{ update(dt, pose) }` | `CharacterModel` constructor; `HoopCharacters.update(model, dt, pose)` each frame | Face & Texture |
| `HoopMaterials.*` | used by modeler/head code | Face & Texture |
| `HoopMove.install(Player)` | runs at load from `src/anim/move.js` | Movement |
| `HoopLighting.build(scene, W, Q, renderer)` (must set `W.sun`) | `HoopWorld.build` instead of its built-in lights | Graphics |
| `HoopRender.init / setQuality / resize / render(renderer, scene, camera, dt, G)` | `game.js` (render replaces `renderer.render`) | Graphics |
| `HoopWorld.configureRenderer(renderer, q)`, `W.update(dt, camera, G)` | `game.js` | Environment |
| `HoopAudio.attach(HoopGame)` | `game.js` boot | Audio |
| `HoopInput.rumble(strength 0..1, ms)` | `game.js` on release/make | Controls |
| `HoopPerf.attach(HoopGame)`, `HoopPerf.frame(dt, G)` | `game.js` boot / every frame | Performance |
| `HoopJSC.init(game, #jsc)`, `open(onClose)`, `close()` | `ui.js` menu button "Jump Shot Creator" | JSC |
| `HoopStatsUI.init(game, #stats)`, `open(onClose)`, `close()` | `ui.js` menu button "Stats", Tab key in game | Statistics |

## Interfaces that must keep working

### HoopPhysics (`physics.js`, global + CommonJS)
- `K` constants (incl. `BALL_R`, `RIM_TOP`, `RIM_Y`, `RIM_R`, `RIM_IN_R`, `HOOP_X`, `FIXED_DT`, `PHYS_DT`, `ARENA_X`, `BLEACH_Z`, `THREE_ARC`, `FT_DIST`, …), `MAT`, `HOOPS[2]` (`cx, cy, cz, side, board, neck, …`).
- `createBall()` → `{ px,py,pz, vx,vy,vz, wx,wy,wz, qx,qy,qz,qw, held, resting, restTime, airTime, onFloor, hs[2] }`.
- `placeBall(b, x,y,z, vx,vy,vz, wx,wy,wz)`.
- `step(b, dt, ev, sev)`; `ev(kind, hoopIdx, x,y,z, impactSpeed, impulse)` with kinds
  `floor | rim | neck | board | stanchion | wall | ceiling | bleachers`;
  `sev(type, hoopIdx, data)` with `'cross'` (`{rho,x,z,vx,vy,vz}`, ball center crossing the ring
  plane descending) and `'score'` (`{vx,vy,vz}`, confirmed make). The game classifies shots from these.
- `flightCross`, `solveLaunchSpeed`, `minSpeedAngle`, `backspinAxis`, `integrateFree(b, h)`,
  `distToHoop`, `isThree`, `rangeLabel`, `nearestHoopIndex`, `netRadiusAt`.

### HoopShot (`shotmodel.js`)
- `derive(params, charDef)` → `{ releaseTime, jumpH, power, comfort, sensMech, comp, spinRps, arcDeg }`.
- **Game entry points (the only calls `game.js` makes for shot math):**
  - `resolveRelease(ctx)` → `{ plan, rel }`; `rel` = `{ vx,vy,vz, wx,wy,wz, speed, angle, idealSpeed, idealAngle, yaw, e, dist }`.
  - `shotWindow(ctx)` → `{ lo, hi, best, width, plan }` (seconds of timing error that give a clean make; drives the meter's green zone).
  - `ctx` fields: `hoop, idealPos, pos, eSec, body, bodyIdeal, offBalance, d, ch, p, difficulty, variance, rng, posAtE(e)`.
- `gradeTiming(eMs, win)`, `makeRng(seed)`, `planShot`, `releaseFromPlan`, `timingWindow`, `evalCross`, `DIFFICULTY`, `VARIANCE`.

### HoopRoster (`roster.js`)
- `PARAMS` (16 Jump Shot Creator sliders: `key,label,group,lo,hi[,min,max]`), `PRESETS`, `CHARACTERS`, `getCharacter(id)`, `presetById(id)`, `cloneParams(p)`.
- Character def: `id ('curry'|'lebron'|'jordan'), file, name, short, plate, number, role, heightM, massKg, colors{jersey,accent,shorts,shoe,sole}, blurb, move{…}, shoot{…}, sig{id,name,params}, attrs{}`. Agent 3 may add `style{}` (signature animation data); Agent 1 may add `look{}` (appearance data).

### HoopCharacters (`characters3d.js`)
- `loadAll(defs, assets, onProgress)` → `Promise<{ models: {id: CharacterModel} }>`.
- `CharacterModel`: `root` (Group placed at floor), `nodes[PIVOT]` for all `PIVOTS`
  (`AvatarRoot, Hips, Spine, Neck, Head, L_/R_ Shoulder, Elbow, Wrist, Hip, Knee, Ankle`),
  `dims` (`height, hipsY, shoulderY, headY, upper, fore, thigh, shin, armLen, legLen, palm, handLen, toe, heel, soleDrop, shoulderHalf, hipHalf, …`),
  `limbs[0]` = anatomical right (shooting) side, `setColors(colors)`, `setLettering(plate, number, color)`, `resetPose()`, `dispose()`.
- `applyPose(model, pose)`; pose = `{ rootX, rootZ, pelvis:V3, pelvisQ:Q, chestQ:Q, headYaw, headPitch, hands:[{wrist,pole,fingers,palm}×2], feet:[{ankle,pole,fwd,up}×2] }`. Optional extra fields may be added (e.g. finger curl, facial expression) — `applyPose` must ignore missing ones.
- `HoopReplay` records/plays back the `PIVOTS` quaternions + Hips position; extra animated nodes should be children that follow those pivots (or be added to the replay frame by Agent 4).

### HoopPlayer (`anim.js`)
- `new Player(model, def)`; `setJumper(params, derived)`; `placeAt(x, z, yaw)`;
  `update(dt, input|null, now)` → events (`shotStart, release, pumpFake, move, jump, land, catch, squeak, dribble, footstep, arrived, autoShotFromStepback`); `computePose(dt)`; `pose`.
- Shot: `startShot(now)` → bool; `shot` (`{ T, t, released, start, catchShoot, pullUp, tTake, landT }`); `release(tRelease)` → `{ pos, eSec, bodyV, offBalance }`; `shotBallWorld(t, out)`; `bodyVyAt(t)`; `pumpFake()`.
- Moves: `crossover()`, `stepback()`, `jump()`, `giveBall(now, how)`.
- State the game reads/writes: `x, z, yaw, vx, vz, hasBall, action ('none'|'shoot'|'cross'|'stepback'|'jump'|'catch'|'pickup'), actionT, ballPos, ballSpin, targetHoop, autopilot {x,z,yaw}, reaching, reachTarget, pickupH, dims, hs, def, derived, jumper, offBalance, fwd(yaw), right(yaw), speed(), hoopYaw(), dribbling`.

### HoopWorld (`world.js`)
- `build(renderer, qualityName)` → `W` with: `scene, Q, envMap, floor, floorMat, hoopGroups, nets[2]` (`Net.step(dt, balls[{x,y,z}])`, `writeLines()`, `energy`, `hoop`), `ballMeshes[6]`, `blobs[≥6]`, `spotRing`, `trail`, `guide`, `releaseMarker`, `contactMarkers`, `updateBoard(a, b, c)`, `reflect` (`render(renderer, scene, camera, hideList)`, `resize(w,h)`, `rt`) or null.
- `QUALITY` presets `low|medium|high|ultra` (`ppm, shadows, shadowSize, reflect, pixel, aniso, …`).
- Optional hooks the game calls if present: `HoopWorld.configureRenderer(renderer, quality)` (tone mapping, exposure, shadows type) and `W.update(dt, camera, G)` once per rendered frame.

### HoopGame (`game.js`) and the automation API (`window.HOOP`)
- Events (`HoopGame.on(evt, fn)`): `progress, loaded, character, jumper, mode, shotStart, release, shotResult, toast, modeDone, buzzer, pause, replay, move, pumpFake, ui, contextLost, contextRestored`.
- `window.HOOP`: `state()`, `shots()`, `advance(sec)` (synchronous fixed ticks, no rendering), `render()`, `setAuto(bool)`, `place(x, z[, yaw])`, `shoot(eMs)` (release `eMs` from the ideal instant), `giveBall()`, `select(id)`, `mode(id, cfg)`, `setSetting(k, v)`, `pause(bool)`, `replay()`, `stopReplay()`, `jumper(params, presetId)`, `input(type, t)`.
  Tests rely on this; extend it, don't break it.

## Commands
```bash
npm install          # three r147 + playwright (browsers are preinstalled at /opt/pw-browsers)
npm test             # Node unit tests (physics, shot model, stats, modes)
npm run test:e2e     # boots the real game in headless Chromium (SwiftShader) and plays shots
npm start            # dev server → http://localhost:8080
npm run build        # dist/hoop-lab.html (single file, Three.js from jsDelivr)
```
