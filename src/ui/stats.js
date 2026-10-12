// HOOP LAB — shooting analytics dashboard (Statistics Engineer).
// Contract: HoopStatsUI.init(game, rootEl) once (rootEl = #stats); open(cb) / close() show/hide it.
// Data: HoopStats over game.G.store (filter/aggregate/heatGrid/coach). Read-only.
const HoopStatsUI = (() => {
  'use strict';
  let game = null, root = null, onClose = null;
  function init(g, el) { game = g; root = el; }
  function open(cb) {
    onClose = cb || null;
    if (!root) return;
    const a = HoopStats.aggregate(HoopStats.filter(game.G.store, 'all'));
    root.innerHTML = `<div class="card"><h2>Shooting stats</h2><p>${a.made}/${a.att} · ${Math.round(a.fg * 100)}% FG · Best streak ${a.bestStreak}</p><p>3PT ${a.made3}/${a.att3} · Longest make ${HoopModes.ft(a.longest)}</p>${HoopStats.coach(HoopStats.filter(game.G.store, 'all')).map(t=>`<p class="dim">${t.text}</p>`).join('')}<button class="primary" data-close>Back</button></div>`;
    root.querySelector('[data-close]').onclick = close;
    root.classList.remove('hidden');
  }
  function close() { if (root) root.classList.add('hidden'); if (onClose) onClose(); }
  return { init, open, close };
})();
