# HOOP LAB — Basketball Character Starter Pack

Three **actual `.glb` files** made as original, stylized, low-detail prototypes representing Stephen Curry, LeBron James and Michael Jordan. These are **not photorealistic scans or exact facial likenesses**. Their overall height, body type, basic hair, uniform color, and numbers are differentiated. This pack is intended to give a browser-game developer a working starting point.

## Files

- `stephen_curry.glb` — blue/gold #30, 1.8796 meters (6 ft 2 in), slimmer guard
- `lebron_james.glb` — purple/gold #23, 2.0574 meters (6 ft 9 in), broad athletic forward
- `michael_jordan.glb` — red #23, 1.9812 meters (6 ft 6 in), athletic wing, bald
- `player_profiles.json` — dimensions, player names, metadata
- `preview.png` — approximate software-rendered view of the low-poly assets
- `viewer.html` — Three.js model viewer demonstrating loading and named-pivot animation; requires an internet connection for Three.js modules
- `generate_models.py` — Python source generator (requires trimesh, numpy and Pillow)
- `CLAUDE_INSTRUCTIONS.md` — ready-to-use instructions for the coding assistant

The exported mesh bounds have been programmatically checked to exactly match the heights in `player_profiles.json` within floating-point tolerance. Height reference: NBA player profiles.

## Three.js GLB integration

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/assets/stephen_curry.glb');
const player = gltf.scene;
scene.add(player);

// Named transform pivots (articulated rigid meshes, not skinning):
const arm = player.getObjectByName('R_Shoulder');
const elbow = player.getObjectByName('R_Elbow');
arm.rotation.x = -1.2; // illustrative forward/up reach
elbow.rotation.x = 0.3;
```

All three characters use **Y-up, +Z-forward, meter** units and have the same node names: `AvatarRoot`, `Hips`, `Spine`, `Head`, `L_Shoulder`, `R_Shoulder`, `L_Elbow`, `R_Elbow`, `L_Wrist`, `R_Wrist`, `L_Hip`, `R_Hip`, `L_Knee`, `R_Knee`, `L_Ankle`, `R_Ankle`. Use those nodes for procedural animation. These are NOT skinned / Mixamo-rigged meshes and standard humanoid animation FBXs will **not** automatically retarget to them. Implement procedural pose interpolation or replace them with truly rigged detailed avatars later.

## Preview

Run inside this folder:

```bash
python -m http.server 8000
```

Visit `http://localhost:8000/viewer.html`. Internet is needed for the viewer's Three.js imports. It shows a basic articulated shooting and dribbling pose preview, **not** a full basketball animation or gameplay simulation.

## Quality and rights

The bodies are simplified and visibly stylized, not photogrammetry or scans. This is the quick-playable prototype pack; high-quality licensed body/face scans and proper skinning will need replacing for near-NBA-2K realism. Jersey designs are generic and do not include official team crests. If publishing a product with recognizable names or likenesses, consider player likeness, branding, and publicity rights separately. Models discovered on third-party marketplaces have their own licenses and may contain derivative IP.
