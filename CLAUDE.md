# HOOP LAB — current Codex handoff

Start with `docs/CODEX_HANDOFF.md`. This is the original shootaround project from
PR #1, extended in place. Do not replace it with another game or AI evaluation.

Current features: four characters (prime Curry, LeBron, Jordan, experimental
8-foot Devin), different authored signature shooting paths, replacement heads,
ten articulated fingers, dribble combinations, near-rim dunks, reactive nets,
1v1 and AI spectator modes, custom attributes and five-tier original badges,
coaching choices, working Jump Shot Creator, and coaching notes in Stats.
Trajectory trails and guide lines are disabled, including old saved settings.

```sh
npm ci
npm test
npm run test:engine
npm run test:build
npm start
```

The 42 original physics/logic tests and 42 Node integration checks passed.
Integration checks load the actual GLBs, exercise the animations, scoring,
net reactions, AI match possessions and interface controls. DOM, texture loading
and renderer/world construction are mocked. They are not browser/GPU validation.

`npm run test:e2e` is the existing real-browser suite. Run it once Playwright
Chromium is available, then inspect desktop and phone layouts and animation
contact visually before claiming visual quality. Screenshots were not taken
in this environment. `dist/index.html` and `dist/hoop-lab.html` are complete
single-file exports with Three.js and models embedded.

Player models remain procedural likenesses, not photoreal scans. Finger joints
and weighted grip states are animated; fingers do not yet run separate rigid-body
contact dynamics. Dunks use a kinematic character gather with a real physics ball
release. 1v1 uses simplified alternating possessions rather than a full foul,
rebound, double-dribble and out-of-bounds rules engine. Team chemistry has a pure
fit model for future teammates; it has no artificial effect in 1v1.

Keep `window.HOOP` and existing module contracts. `docs/TEAM.md` describes the
original Claude team workflow; this handoff was implemented by one Codex agent.

## Bug-fix follow-up

Dunks now unplant both feet on takeoff and restore grounded action, velocity and
foot targets on landing. Loose-ball pickup and catching cannot interrupt an
airborne dunk. Regression tests include body/foot height and movement after
landing for all four players, rather than only checking ball scoring.

Head/finger skin materials use the actual linear neck vertex color and the same
roughness as the body. Facial features were flattened and eye contrast reduced.

The meter is a horizontal rail with a larger assisted green band in Casual/Pro.
Human green releases solve from the real release point; Simulation remains raw
physics timing. AI has no human timing assistance. Guarded rim paths, mass-weighted
body separation, defender interception/contests and actual dunk deflection prevent
uncontested automatic finishes. Bot shot choice balances drive/mid/three tendencies.
Signature arm extension, wrist flick, guide-hand drop and follow-through duration
are different for Curry/LeBron/Jordan. No unrelated feature work was added.
