# HOOP LAB — team contract (module ownership + shared interfaces)

Five development agents work in parallel, each in its own git worktree/branch, then the lead
integrates. This file is the contract: **ownership** says who may edit what, **interfaces** say
what must keep working no matter who changes the internals.

## Ground rules

1. Edit only the files you own. If you truly need a change in someone else's file, keep it to a
   few clearly-commented lines and list it under "Cross-module edits" in your final report.
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

## Ownership

| Agent | Area | Owns |
|---|---|---|
| 1 Graphics | character models, court, lighting, materials, environment | `src/characters3d.js`, `src/world.js`, `assets/**`, `build/make_assets.js`, new `src/models/*` or `src/gfx/*` |
| 2 Physics | ball flight, spin, rim/board/floor/net contact, release → launch | `src/physics.js`, `src/shotmodel.js`, `tests/physics.test.js`, new `tests/physics/*` |
| 3 Animation | locomotion, dribbling, footwork, jump/landing, signature jumpers | `src/anim.js`, `src/roster.js` (`move`, `sig`, new `style` per character), new `src/anim/*` |
| 4 Gameplay | menus, character select, Jump Shot Creator, modes, analytics, camera, replay, input/controller, audio | `src/game.js`, `src/ui.js`, `src/style.css`, `index.html`, `src/modes.js`, `src/stats.js`, `src/camera.js`, `src/replay.js`, `src/input.js`, `src/audio.js`, `build/build.js`, `build/serve.js`, `tests/logic.test.js` |
| 5 QA/Perf | automated browser tests, perf, verification | `tests/e2e/**`, `tests/*.html`, new `tests/tools/*`; small isolated fixes elsewhere (see rule 1) |

`index.html` script order is the build order (`build/build.js` reads it). New files must be added
there (Agent 4 merges requests from others; the lead resolves conflicts).

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
