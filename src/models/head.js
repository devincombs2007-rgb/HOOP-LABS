// HOOP LAB — heads, faces and hair (Face & Texture Specialist).
// Contract: HoopHead.attach(model, def) is called by CharacterModel after the body is built.
// It adds head/face/hair/beard geometry under model.nodes.Head (head-local frame: +Y up, +Z forward,
// origin at the Head pivot, meters), may hide the placeholder head parts, and returns an object with
// optional update(dt, pose) (blinks, eye focus) that HoopCharacters.update() calls every frame.
// Return null to keep the original head.
const HoopHead = (() => {
  'use strict';
  function attach(model, def) { return null; }
  return { attach };
})();
