# HOOP LAB — anatomy of a real jump shot (animation spec)

Every jumper in HOOP LAB is built from the phases below. Each phase is its own authored
sub-animation with its own timing, easing and per-player style data, so a Curry jumper, a LeBron
jumper and a Jordan jumper differ in *every* phase, not just in one key pose. Custom jumpers
(Jump Shot Creator) choose/blend the same phases through the 16 sliders.

The ball path and release instant still come from `shotBallWorld()` / `derive().releaseTime`, so
what you see is exactly what the physics launches.

## Global motion rules (what makes it fluid instead of stiff)

1. **Kinetic chain, not keyframes on one clock.** Power flows ankles → knees → hips → trunk →
   shoulder → elbow → wrist → fingers. Each segment starts ~30–60 ms after the one below it
   (overlapping action). Legs lead, arms lag, wrist is last.
2. **Velocity-continuous curves.** Phase boundaries match position *and* velocity (C1 Hermite or
   critically damped springs). No linear lerps, no instant direction flips, no "hold" poses that
   freeze — even holds drift a few millimetres.
3. **Secondary motion.** Head stays quiet while the body moves (eyes locked on the rim); the off
   arm, shoulders, shorts/jersey and fingers settle with damped springs after big motions.
4. **Weight.** The pelvis carries momentum: it dips before rising, overshoots slightly on landing
   and recovers. Feet never slide while planted; heels lift before toes leave.
5. **Blending.** Entering the shot from a dribble, catch, step-back, hop or 1-2 blends over
   80–150 ms from the current pose, never snaps.

## Phases

| # | Phase | What happens in a real shot | Key numbers (typical) |
|---|---|---|---|
| 0 | **Approach / gather** | Catch or pick-up into the "shot pocket"; feet arrive with a **hop** (both feet land together) or a **1-2 step** (inside foot then outside foot). Shoulders square up toward the rim, shooting foot slightly ahead, toes turned 5–15° toward the shooting side. | gather 0.12–0.30 s; stance hip-width to shoulder-width |
| 1 | **Grip & pocket** | Ball on the finger pads (gap under the palm), shooting hand behind/under the ball, guide hand on the side (thumb not pushing), wrist cocked back ("tray"). Pocket height: waist (LeBron/Jordan) to chest/right hip (Curry). | wrist extension 60–90° |
| 2 | **Dip / load** | Ball dips toward the hip as knees and hips flex together; slight forward trunk lean; weight on the balls of the feet; heels light. Depth is personal (Curry small and fast, Jordan deeper). | knee flexion 45–75°; dip 0–25 cm; 0.08–0.20 s |
| 3 | **Rise (lift)** | Ball travels up the midline "in the slot" in front of the shooting eye; elbow under the ball, in line with knee and foot; legs extend (triple extension: ankles, knees, hips) slightly before the arms rise. | arms lag legs 40–60 ms |
| 4 | **Take-off** | Toes are last to leave the floor; jump is mostly vertical (Jordan), slightly forward (Curry), or fading back (fadeaway). | jump height 5–60 cm depending on jumper |
| 5 | **Set point** | One-motion shooters pass through it without stopping (Curry); two-motion shooters pause briefly (LeBron, Jordan on deep shots). Upper arm near 90–150° of shoulder flexion, elbow ~90°, ball above forehead/right eye or overhead. | pause 0–80 ms |
| 6 | **Release** | Elbow extends (snaps straight), shoulder keeps flexing, then the **wrist flicks** forward (60–90°) and the ball rolls off the index/middle fingertips → backspin. Guide hand comes off cleanly just before. Timing within the jump: on the way up (Curry), at the apex (Jordan), near the apex (LeBron). | release ~0.35–0.75 s after shot start; 2–3 rev/s backspin |
| 7 | **Follow-through** | Arm stays fully extended, wrist "goose-neck" hangs, fingers point at the rim, guide hand stays up and still, eyes on the rim. Held 0.25–0.6 s, then relaxes with a spring settle. | hold 0.25–0.6 s |
| 8 | **Flight (legs in air)** | Knees soften, toes point down, legs together (Jordan) or a slight leg kick/split (LeBron), drift or fade per style. | |
| 9 | **Landing** | Land on the balls of the feet then heels, slightly in front of the take-off spot (or behind it on fades), knees absorb (30–45° flex), arms come down, pelvis overshoots and recovers; 1–2 small balance steps if drifting. | absorb 0.15–0.30 s |
| 10 | **Recovery / reaction** | Back to stance or a personality beat: Curry may turn away / back-pedal before the ball lands; Jordan holds the wrist; LeBron drops both hands and jogs back. | |

## Signature styles (per-phase differences)

| Phase | Stephen Curry | LeBron James | Michael Jordan |
|---|---|---|---|
| Gather | Very quick hop or 1-2, tiny stance, often off the move | Strong wide 1-2 or hop, deliberate | Sharp jab/pivot, quick square-up |
| Pocket | Low, right hip/chest, ball close | Waist, in front | Chest, slightly right |
| Dip | Small, very fast | Moderate | Moderate–deep |
| Rise | Straight up the middle in one line, very fast | Ball travels up in front of the face, elbow slightly out | Ball carried high and fast |
| Take-off | Small, slightly forward | Moderate, vertical; leg kick on deeper shots | Explosive and vertical; fadeaway option |
| Set point | Forehead / above right eye, no pause (one-motion) | High in front of face, short pause | High above the head, released at the apex |
| Release | On the way up, quick flick | Near the apex, two-hand look until late | At the apex, classic high release |
| Follow-through | Relaxed, high, wrist snapped down; may hold and turn | Both arms up briefly, elbow out | Long hold, wrist hanging, guide hand up |
| Flight | Slight forward drift | Leg kick / split | Legs together, slight tuck |
| Landing | Light and quick, forward | Wide and balanced | Controlled, slightly back on fades |

Custom jumpers map the sliders to these phases: `pocket` (phase 1), `dip`/`knee` (2), `motion`
(one- vs two-motion: phase 5 pause), `setPoint`/`extension`/`elbow` (5–6), `speed` (overall tempo),
`flick` (6), `guide` (guide-hand release timing), `jump`/`releaseTiming` (4, 6), `footWidth`/
`footStagger` (0), `lean` (fade/lean-in in 4, 8, 9), `arc` (release angle — physics).

## Finishing moves (layups and dunks)

Layups and dunks use the same phase thinking: approach (gather steps: 1-2 / euro step / hop),
plant, take-off off one foot (layups, most dunks) or two (power dunks), carry the ball up (protect
with the off arm), release or throw-down at the top, landing. Layups launch the ball through the
real physics (soft high release off the glass or over the front rim — finger roll, reverse, floater);
dunks are kinematic until the ball is forced through the ring, then physics takes over.
