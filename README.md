# HOOP LAB

Original 3D basketball shootaround, plus half-court 1v1 and AI spectator games.
Prime Curry, LeBron, Jordan and an experimental maxed 8-foot Devin Combs.

```sh
npm ci
npm start          # http://localhost:8080
npm test           # 42 physics/logic checks
npm run test:engine # DOM/GLB/engine integration, mocked renderer
npm run test:build  # standalone export and module load order
npm run test:e2e    # existing real-browser suite; requires Playwright Chromium
```

WASD move, Space hold/release shoot, E dunk near the rim, X cross, B/N/Z handles,
C step-back, V camera, Esc pause. Phone: landscape, left stick, hold/release Shoot.
On defense in 1v1, Shoot contests and Cross attempts a steal. Choose **Watch AI vs AI**
for automatically played matches, or **Attributes & badges** to inspect player profiles.

`dist/index.html` and `dist/hoop-lab.html` embed scripts, Three.js and player assets.
The export needs no CDN requests. Phone defaults use Low graphics and Casual difficulty.

The update includes authored signature shooting paths, articulated fingers,
procedural likenesses, reactive nets, dribble/dunk animations and original badges.
Player motion is procedural/IK, not motion capture. Fingers are animated, not
independent rigid-body contacts. 1v1 rules are simplified. Ratings and tendencies
are design estimates calibrated from selected prime-season statistics.

See [docs/CODEX_HANDOFF.md](docs/CODEX_HANDOFF.md) for integration instructions,
references, actual validation and remaining work.
