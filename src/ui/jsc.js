// HOOP LAB — Jump Shot Creator screen (Jump Shot Creator Engineer).
// Contract: HoopJSC.init(game, rootEl) once (rootEl = #jsc); HoopJSC.open() / close() show/hide it.
// Apply a jumper with game.setJumper(params, presetId); read characters/params from HoopRoster and
// derived numbers from HoopShot. The UI/UX menu calls open(); close() must return to the caller.
const HoopJSC = (() => {
  'use strict';
  let game = null, root = null, onClose = null;
  function init(g, el) { game = g; root = el; }
  function open(cb) {
    onClose = cb || null;
    if (!root) return;
    root.innerHTML = '<div class="card"><h2>Jump Shot Creator</h2><p class="dim">In development.</p><button class="primary" data-close>Back</button></div>';
    root.querySelector('[data-close]').onclick = close;
    root.classList.remove('hidden');
  }
  function close() { if (root) root.classList.add('hidden'); if (onClose) onClose(); }
  return { init, open, close };
})();
