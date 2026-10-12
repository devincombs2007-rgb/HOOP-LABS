// HOOP LAB — character rig: pose → pivot rotations (Character Rigging Engineer).
// Contract: if HoopRig.applyPose is a function, HoopCharacters.applyPose(model, pose) delegates to it.
// It must accept the pose format documented in docs/TEAM.md (extra optional fields allowed) and
// produce the same world placement conventions (root at rootX/rootZ, pelvis world position, IK
// hands/feet targets). Joint limits, twist distribution, spine chain, finger/hand poses live here.
const HoopRig = (() => {
  'use strict';
  return { applyPose: null };
})();
