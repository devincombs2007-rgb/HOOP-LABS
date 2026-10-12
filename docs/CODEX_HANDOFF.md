# HOOP LAB — playable update and integration handoff

Built on original PR #1 head `08f15eb17a26a2c934d0290825cb711677a73832`.
Local development branch: `codex/playable-mobile-build`.
Live build: https://dev-hoop-lab-play.devincombs.chatgpt.site

## Import without losing Claude's later work

The ZIP contains the full project, standalone export and a cumulative patch.
If Claude has newer commits, preserve that branch first. Apply the patch to a
branch from the original PR head and merge/reconcile with the current work.
The patch includes the earlier launch fixes and this update.

```sh
git switch -c codex-import 08f15eb17a26a2c934d0290825cb711677a73832
git apply --check /path/to/CODEX_CHANGES.patch
git apply --index /path/to/CODEX_CHANGES.patch
git commit -m "Integrate Codex HOOP LAB gameplay update"
npm ci
npm test
npm run test:engine
npm run test:build
```

Alternatively, use the complete source ZIP as the new working copy. Do not copy
node_modules or hosting credentials. The archive excludes both.

GitHub write operations returned HTTP 403 `Resource not accessible by integration`.
No remote GitHub branch/PR or Claude conversation was updated. The published Site
and this archive carry the changes until GitHub contents write access is granted.

## Implemented

- `profiles.js`: original custom 0–99 attributes, modeled shot/drive/pass tendencies,
  play-style personality data and ten original badges. Bronze brown, Silver silver,
  Gold gold, Hall of Fame purple, Legend red. Badge effects hook into AI timing,
  range, motion compensation, handles, finishing, jump recovery, stamina, defense,
  contests and steal timing. Ratings are estimates, not official 2K/Live ratings.
- Prime Curry 2015–16, LeBron 2012–13, Jordan 1990–91. Devin is 8 feet (2.4384 m),
  all 99 attributes and every badge Legend, with explicitly experimental mobility.
- `models/head.js`: distinct head proportions, face details, hair/beard styles.
  `characters3d.js`: ten five-finger hands with three articulated joints per finger;
  pressure weights are a visual/contact foundation, not separate finger rigid bodies.
- `anim.js`: Curry's continuous lift, LeBron's side gather/set, Jordan's higher set
  and apex release have authored key paths, shoulder turn, guide-hand separation,
  airborne foot sweep and follow-through. Custom sliders retain procedural motion.
- `anim/move.js`: behind-back, between-legs, hesitation, stamina, jump recovery,
  defensive stance, one-hand/two-hand/tomahawk finishes. Foot planting retains the
  original gait/IK targets. Dunk gathers are kinematic; ball entry uses real physics.
- `world.js`: denser net lattice, momentum-driven downward pull, flare and distinct
  swish/rattle/bank/dunk impulses, integrated on fixed simulation ticks.
- `match.js`: real physics 1v1 and continuous AI spectator games, AI movement,
  drives/shots/dunks/handles, defensive contests/blocks, timing-based steals,
  14-second clock, 1s/2s, 11 win by two, alternating possessions after attempts.
- Coaching: balanced, spacing, rim attack and pressure defense alter bot decisions.
  Personality tendency data influences self-created shot selection. Passing and
  multi-player chemistry are schema groundwork; there are no teammates in 1v1.
- Functional sixteen-slider Jump Shot Creator, per-player saving, presets including
  My Real-Life Jumper. Stats panel includes shooting splits and coaching feedback.
- Trajectory trail, guide and release marker hidden even with old saved preferences.
  Phone defaults Low graphics/Casual, scrollable menus and additional touch buttons.
  Export includes Three.js so the live game does not depend on CDN script downloads.
- Reset fixes: clear stale release meters, queued shots and old in-flight attempts
  when changing drills; changing graphics rebuilds the world correctly.

## Controls

WASD move, Shift sprint, Space hold/release shoot (contest on defense), X crossover
(steal on defense), C step-back, B behind-back, N between-legs, Z hesitation,
E dunk within 8 feet while holding the ball, R call ball, V camera, T replay,
Esc pause. Gamepad: X shoot, A cross, B step-back, Y ball, RB handle cycle,
left-stick click dunk, RT sprint, LB camera, Start pause. Phone: stick plus
Shoot/Cross/Step/Ball/Cam/Moves/Dunk buttons. Landscape recommended.

## Validation

42 original Node physics/logic tests passed. 42 Node integration checks passed
using real character GLBs with mocked DOM canvas/texture/rendering/world creation.
All exported scripts compile and load in order without external scripts/styles.
No real browser, GPU, iPhone performance, screenshot or likeness inspection was
completed. The unsupported browser-preview environment was not bypassed.

## Next work / known limits

1. Run real browser and phone QA. Inspect hand/ball contact, planted ankle height,
   faces, dunk reach and net settling at several frame rates.
2. Replace procedural heads/bodies with properly licensed high-detail scans and
   retargeted captured motion. This is not ProPlay or scan-accurate NBA likeness.
3. Individual finger/ball contact forces and foot friction/ground reaction forces
   need a true articulated-body solver; existing animation/IK is not that solver.
4. Add real rebound contests, ball-body collision volumes, fouls, clearance and
   out-of-bounds rules. Current block/steal and alternating-possession model is basic.
5. Attributes for passing/rebounding/FT are stored/displayed but do not yet have
   dedicated passing, rebound or foul-line subsystems. Do not call them implemented.
6. Add teammates before applying coach/team chemistry, assist behavior or pass
   tendencies. Current `chemistry()` returns a fit estimate, not measured chemistry.
7. Coach/tendency/overall numbers are original design estimates, never official
   ratings or factual psychological judgments about the real players.

## References

Stat sources:
- Curry: https://pr.nba.com/stephen-curry-2015-16-kia-nba-mvp-award-warriors/
- LeBron: https://pr.nba.com/lebron-james-2012-13-kia-nba-mvp-award/
- LeBron season table: https://www.nba.com/stats/leaders?Season=2012-13&SeasonType=Regular+Season
- Jordan season overview: https://www.nba.com/news/history-season-review-1990-91
- Jordan full season table: https://www.basketball-reference.com/leagues/NBA_1991_per_game.html

Motion references located:
- Curry explains his form: https://www.nba.com/watch/video/artof3bblock
- LeBron jump shot: https://www.nba.com/watch/video/lebron-james-hits-the-jump-shot
- Jordan profile and highlight references: https://www.nba.com/news/history-nba-legend-michael-jordan
- 2K feature context: https://support.nba2k.com/hc/en-us/articles/54276003253907-NBA-2K27-Game-Mode-Breakdown

A real Curry release photo was visually inspected. Full reference videos were
located but not played frame by frame; motion paths remain authored approximations.

## Follow-up bug fixes (same playable project)

- Reproduced stuck-air dunk state in the original code before fixing it.
- Ground pickup/catch/shot input no longer interrupts a dunk before landing.
- Takeoff releases planted feet; landing resets air state and movement control.
- Shared linear skin color/material removes face/body/finger mismatch.
- Less protruding cheeks/eyes, more natural eye/hair material conversion.
- Horizontal shot meter; Casual and Pro assist windows agree with actual green
  ball launches. Simulation remains unassisted. Contact/blocks can still cause misses.
- Rim paths can be guarded; players cannot run through each other; airborne
  defenders can deflect a dunk using real ball velocity rather than forced results.
- AI choices include more midrange/perimeter shots rather than repeated rim drives.
- Signature release arm angles and recovery phases differ more clearly.

Validation: 42 original tests plus 42 Node integration checks pass. Real GPU/browser
verification is still unavailable. User video was visually inspected as reference.
