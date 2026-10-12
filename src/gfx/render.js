// HOOP LAB — render pipeline (Graphics Engineer).
// Contract (all optional; game.js calls whatever exists):
//   HoopRender.init(renderer, settings)            once, right after the renderer is created
//   HoopRender.setQuality(qualityName, renderer)   when the graphics preset changes
//   HoopRender.resize(w, h, renderer)              on window resize
//   HoopRender.render(renderer, scene, camera, dt, G)  replaces renderer.render() each frame
//                                                   (post-processing: AA, AO, bloom, grading…)
const HoopRender = (() => {
  'use strict';
  return {};
})();
