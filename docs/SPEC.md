PROJECT: HOOP LAB — The Ultimate 3D Basketball Shootaround Simulator

You are the lead game developer, graphics engineer, physics programmer, gameplay designer, animation engineer, and technical director of a new basketball video game called HOOP LAB.

Your task is to actually build a fully playable, highly polished 3D basketball shootaround game.

I am giving you complete creative freedom to develop the best basketball shooting simulator you can reasonably create within your coding environment.

Think of the movement quality of NBA 2K, the shooting physics of a serious sports simulation, and the freedom of a dedicated basketball training facility.

This is NOT a full basketball game. There are no opposing teams, seasons, or complicated career modes.

There is one player, a basketball, a highly detailed court, and an extraordinarily sophisticated shooting system.

Your objective is to make the act of shooting a basketball feel so realistic, responsive, and satisfying that someone could spend hours practicing.

1. Technology and implementation

Build this as a real-time 3D game that runs in a modern web browser.

Preferred technology:

* JavaScript or TypeScript
* Three.js for 3D rendering
* Custom fixed-timestep basketball physics, with an established physics library only if it demonstrably improves reliability
* WebGL rendering with carefully optimized lighting, shadows, geometry, and materials
* Web Audio for sound effects
* Full keyboard/mouse controls and gamepad support
* Optional touch controls for mobile

Prefer a project that can be launched without an elaborate installation process. If possible, provide a self-contained HTML implementation using CDN dependencies. If the scope requires multiple files, organize a runnable project with clear instructions.

The game should work on ordinary computers, with adjustable graphical quality. Performance and responsiveness take priority over expensive visual effects.

Use original or procedurally generated assets where possible. Do not depend on proprietary NBA 2K assets.

Critical requirement: Write the actual executable game. Do not stop at a design document, pseudocode, or an incomplete demo.

2. The basketball environment

Build a beautiful, realistic indoor basketball practice facility.

The court should include:

* Accurate NBA court dimensions and line markings
* Regulation ten-foot rim
* Proper basketball-to-rim size proportions
* Realistic glass backboard with padded support
* Three-dimensional net that visibly reacts to shots
* Detailed polished hardwood flooring
* Court reflections, realistic lighting and shadows
* Surrounding gym walls, seating, ceiling architecture and lights
* Subtle ambient sound and realistic acoustics

Create a cinematic atmosphere with attractive color grading, realistic material properties, and strong environmental detail.

Include a graphics settings menu with low, medium, high and ultra presets.

3. Player movement and controls

Create a controllable 3D basketball player with human proportions and a recognizable basketball stance.

Controls must feel smooth and responsive.

Support:

* Walking
* Jogging and sprinting
* Turning and changing directions
* Basketball dribbling
* Ball pickups
* Stationary shooting
* Moving pull-up jump shots
* Catch-and-shoot style actions
* Step-backs
* Basic crossovers
* Smooth acceleration and deceleration

The character must not simply slide across the floor. Create procedural movement and animation blending with sensible foot planting.

Use a basketball-focused third-person camera similar to a sports video game.

The camera should track the player intelligently without interfering with aiming.

Allow camera sensitivity, zoom, and angle adjustments.

Keyboard/mouse example:

* WASD: Movement
* Mouse: Camera control
* Shift: Sprint
* Space: Hold to begin a shot, release to shoot
* X: Crossover
* C: Step-back
* R: Retrieve or reset the ball
* V: Change camera
* Escape: Pause/settings

Add equivalent gamepad controls and display the control scheme in the game.

4. The shooting system — MOST IMPORTANT FEATURE

This is the absolute centerpiece of the entire project.

I want shooting to be based on understandable physical principles, not simply random make-or-miss outcomes.

The basketball must behave like an actual projectile after release.

Simulate:

* Gravity
* Ball position and velocity
* Launch angle
* Release height
* Forward and sideways momentum
* Backspin
* Rim collisions
* Backboard collisions
* Floor bounces
* Energy loss during impacts
* Realistic rebounds

Use a fixed physics timestep and sufficient collision accuracy to prevent the ball passing through the rim or backboard.

The ball should interact with the actual rim geometry. An invisible scoring trigger may determine when a valid basket occurs, but it must not force the basketball through the hoop.

A basketball should be capable of:

* Swishing cleanly
* Hitting the front rim
* Hitting the back rim
* Bouncing sideways
* Banking off the glass
* Circling or rolling around the rim where physically feasible
* Bouncing several times before falling through
* Completely airballing

A made basket must be determined by the simulated ball path rather than a predetermined canned animation.

Shooting inputs

The player holds the shoot button to initiate a shooting motion and releases to launch the ball.

Implement a calibrated aiming and release system incorporating distance, release timing, player balance and selected shooting mechanics.

Provide subtle visual feedback without making shots automatic.

Good input should create repeatable, accurate release conditions. Poor timing should introduce predictable errors.

Make it possible to become genuinely skilled through repetition.

5. The advanced Jump Shot Creator

Create an interactive jump-shot customization system.

The player should be able to change:

1. Shooting pocket height
2. Release height
3. Release speed
4. Shooting elbow position
5. Guide-hand involvement
6. Wrist flick timing
7. Shot arc preference
8. Amount of knee bend
9. Jump elevation
10. Release during ascent or near the top of the jump
11. Forward arm extension
12. Foot positioning
13. One-motion versus two-motion shooting
14. Ball dip before release
15. Body lean

These settings must visibly alter the player’s shooting animation, not merely change numbers on a screen.

Use a procedural skeletal animation system with inverse kinematics where useful.

Keep the movement within plausible anatomical limits.

Shooting presets

Include original presets inspired by recognizable basketball archetypes:

The Deep-Range Marksman

* Quick one-motion shot
* Strong lower-body synchronization
* Compact release
* Excellent movement shooting

The High-Release Scorer

* Elevated set point
* Controlled release
* Moderate jump
* Strong shot elevation

The Unorthodox Range Shooter

* Low shooting pocket
* Continuous forward-and-upward release
* Minimal jumping
* Naturally high arc
* Substantial ball movement in front of the torso

The Traditional Jump Shooter

* Higher set point
* Distinct jump and release sequence
* Classic follow-through

The Set-Shot Specialist

* Very small jump
* Quick release
* Efficient movement

These are inspiration-based archetypes, not exact reproductions of real athletes.

Custom preset: My Real-Life Jumper

I also want one preset based on this description:

I developed my jumper at a young age when I wasn’t strong enough to reach a ten-foot basket with conventional mechanics.

As a result, I naturally developed a high-arching release.

My shooting motion begins relatively low, around the chest area.

My arms move continuously forward and upward.

My guide hand appears to remain close to the ball late into the motion.

I generate considerable range without jumping very high.

My shooting form resembles an unconventional two-handed push, although it still contains a normal shooting-hand follow-through.

My shot should feel fluid, compact, and comfortable from long distances.

Create the closest physically plausible procedural representation of that movement. Treat it as an approximation rather than pretending it can be reconstructed perfectly from text alone.

Make this preset editable.

6. Realistic shooting distances

A player should be able to move anywhere on the court and shoot from any distance.

Support:

* Layup-area shots
* Free throws
* Midrange jump shots
* College three-point range
* NBA three-point range
* NBA hash-mark distance
* Logo threes
* Half-court attempts
* Full-court heaves

Each distance should influence the required release velocity and trajectory.

Make shooting from long distances challenging but mechanically achievable.

Do not artificially shorten the flight of the basketball or snap the ball toward the basket.

Provide a calibration process so the controls are useful from both close and long range.

7. Basketball physics details

Use actual physical measurements as the foundation.

Suggested reference measurements:

* Hoop height: 3.048 meters
* Rim inner diameter: approximately 0.4572 meters
* Regulation men’s basketball diameter: approximately 0.239 meters
* NBA court: 28.65 meters long and 15.24 meters wide
* Basketball mass: approximately 0.62 kilograms
* Earth’s gravitational acceleration: 9.81 meters per second squared

Use internally consistent units.

Ball spin, collisions and rebound behavior should feel believable.

Prioritize accurate trajectories, proper rim collision response, and deterministic simulation over simulating microscopic effects.

Implement physics substeps or continuous collision handling to prevent tunneling.

8. Ball handling and retrieval

The basketball must exist as a physical object rather than being permanently attached to the player.

It should travel freely after release.

When the ball lands, it should bounce realistically and eventually lose energy.

Allow the player to retrieve it manually.

Also include an optional automated ball-return system so players can continuously practice.

A ball-return feature should collect a settled basketball and return it to the player smoothly.

Make it possible to switch between realistic manual rebounding and uninterrupted shooting practice.

9. Shooting analytics

Create a high-quality training dashboard that records:

* Shots attempted
* Shots made
* Field goal percentage
* Three-point percentage
* Current make streak
* Best streak
* Shooting distance
* Shot location
* Estimated release angle
* Estimated release speed
* Ball entry angle
* Front-rim misses
* Back-rim misses
* Left/right misses
* Airballs
* Swishes
* Bank shots

Create a shot chart showing makes and misses across the court.

Build a heat map identifying hot and cold shooting areas.

Let players reset statistics and start new practice sessions.

Allow local saving when the browser supports it.

10. Practice modes

Implement the following:

Free Shootaround
Unlimited shooting, no restrictions.

Three-Point Challenge
Shoot from designated three-point locations and track makes.

Deep-Range Challenge
Progressively move farther from the rim.

Perfect Release Challenge
Reward consistent timing and release mechanics.

Around the World
Hit shots from multiple locations.

Hot Streak
See how many consecutive shots you can make.

Custom Training
Choose positions, attempt counts and target percentages.

All practice modes must use the same underlying basketball physics.

11. Camera system and replays

Include:

* Third-person gameplay camera
* Broadcast camera
* Side-view shooting camera
* Behind-the-player shooting camera
* Ball-follow camera
* Free camera for replays

Add slow-motion instant replays.

After a shot, allow the user to inspect:

* Player body motion
* Ball release point
* Ball trajectory
* Shot arc
* Rim contact
* Final result

A replay should reproduce the recorded shot, not generate a different trajectory.

Include a visible trajectory option during training, but allow it to be disabled for realism.

12. Sound design

Use layered sound effects for:

* Dribbling on hardwood
* Sneakers squeaking
* Basketball striking the rim
* Backboard impacts
* Net swishes
* Floor bounces
* Player movement
* Gym ambience

Different impacts should sound different.

A swish should sound distinctly different from a rattling rim make.

Use synthesized audio or legitimately available assets, and avoid broken external dependencies.

13. Visual polish and user interface

The experience should resemble a professionally developed basketball training game.

Create:

* Beautiful main menu
* Playable game scene
* Pause menu
* Training selection
* Jump Shot Creator
* Player customization
* Practice statistics
* Camera settings
* Graphics settings
* Audio settings

Use a modern, minimalistic interface.

Prioritize easy navigation and readability.

Keep the screen mostly unobstructed while shooting.

The game should be genuinely enjoyable rather than simply a technical demonstration.

14. AI-assisted development

Use AI-assisted techniques wherever they genuinely improve quality.

Examples include procedural animation generation, automated calibration, adaptive shooting feedback, animation blending, and context-aware practice recommendations.

However, do not introduce a large runtime AI model unless there is a clear gameplay advantage.

The final game must remain responsive and playable without relying on paid AI APIs.

15. Performance and reliability

Target 60 FPS on capable desktop hardware.

Provide adjustable rendering resolution and quality presets for weaker devices.

Separate the visual rendering timestep from physics updates.

Handle window resizing, pausing, tab switching, context loss where practical, and device input changes.

Avoid excessive memory allocations in the game loop.

Use reliable collision handling and proper cleanup of resources.

Test:

* Shot trajectories
* Ball-rim collisions
* Made-basket detection
* Movement responsiveness
* Jump-shot animation transitions
* Shooting from different distances
* Practice statistics
* Camera behavior
* Pause/resume
* Gamepad controls

Never claim a feature is tested unless you actually executed the relevant test.

16. Development priorities

You have substantial freedom, but prioritize in this order:

Priority 1 — Fully playable core

* 3D court
* Controllable player
* Responsive shooting
* Working basketball physics
* Working hoop and scoring
* Stable camera

Priority 2 — Excellent shooting

* Improved release mechanics
* Shot variation
* Ball spin and collisions
* Realistic misses
* Jump-shot customization

Priority 3 — Gameplay depth

* Dribbling and movement
* Shooting analytics
* Multiple practice modes
* Instant replays

Priority 4 — Presentation

* Better player animation
* Detailed environment
* Graphics and audio polish
* Advanced menus

Do not sacrifice the fully playable core to create an enormous unfinished feature list.

17. Final deliverables

I want an actual completed implementation to the greatest extent your environment allows.

Provide:

1. All necessary source code
2. A clear project structure if more than one file is needed
3. Instructions to launch the game
4. A controls reference
5. An explanation of the shooting physics
6. A description of what is implemented
7. Known limitations
8. Test results for tests you genuinely ran

If you have access to a coding environment, create the files directly and execute available checks.

If you do not have file-writing or execution access, output the runnable code and do not claim it was tested.

Do not invent assets, code files, or features that aren’t actually implemented.

Very important: Do not spend the entire response explaining your plan. Start implementing the game immediately.

If the implementation becomes too large for one response, first deliver a complete, functional shooting game and then extend it in subsequent iterations without breaking the working foundation.

FINAL CREATIVE DIRECTION

Imagine combining the satisfaction of shooting around in NBA 2K with realistic basketball physics, individualized jump-shot mechanics, and a dedicated training simulator.

The player should be able to enter an empty gym, walk to the logo, take a smooth high-arcing jump shot, hear the ball pass through the net, retrieve the basketball, and immediately want to shoot again.

Every successful shot should feel earned.

Every missed shot should make physical sense.

The movement should be fluid.

The game should look polished.

The shooting should be the most important and most satisfying element.

Build HOOP LAB.