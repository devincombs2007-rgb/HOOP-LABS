// HOOP LAB — locomotion, footwork, dribbling, jumping and landing (Movement Animation Engineer).
// Contract: HoopMove.install(Player) runs once at load (below) and may replace/extend
// HoopPlayer.Player.prototype methods that the Movement role owns (see docs/TEAM.md):
// updateFeet, replantFeet, updateBallCarry, crossover, stepback, jump, giveBall, and the
// non-shot parts of the pose. The shooting methods belong to the Shooting Animation role.
const HoopMove = (() => {
  'use strict';
  function install(Player) { /* no overrides yet */ }
  install(HoopPlayer.Player);
  return { install };
})();
