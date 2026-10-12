// HOOP LAB — arena lighting rig (Graphics Engineer).
// Contract: if HoopLighting.build is a function, HoopWorld.build calls
//   HoopLighting.build(scene, W, Q, renderer)
// instead of creating its own lights. It must set W.sun (the shadow-casting DirectionalLight the
// rest of the code may reference) and may add any other lights / light probes / env maps to W.
const HoopLighting = (() => {
  'use strict';
  return { build: null };
})();
