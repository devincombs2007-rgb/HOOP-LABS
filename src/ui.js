// HOOP LAB — interface: loading, main menu + character select, HUD, shot meter, toasts, pause, results.
// Reads game state through HoopGame (never mutates simulation state directly).
const HoopUI = (() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  let game = null, G = null, toastTimer = 0, lastShotShown = null, menuOpen = true;

  function init(g) {
    game = g; G = g.G;
    game.on('progress', ({ p, label }) => { const b = $('#load-bar'); if (b) b.style.width = Math.round(p * 100) + '%'; const l = $('#load-label'); if (l) l.textContent = label; });
    game.on('loaded', () => { $('#loading').classList.add('hidden'); buildMenu(); showMenu(true); });
    game.on('toast', (t) => toast(t.text, t.tone));
    game.on('release', (r) => showRelease(r));
    game.on('shotResult', (tr) => showResult(tr));
    game.on('modeDone', (d) => showDone(d));
    game.on('pause', (p) => { $('#pause').classList.toggle('hidden', !p || menuOpen); });
    game.on('replay', (on) => { $('#replay-tag').classList.toggle('hidden', !on); });
    game.on('character', () => { refreshMenu(); });
    game.on('ui', (type) => {
      if (type === 'pause') { if (menuOpen) return; game.setPaused(!G.paused); }
      else if (type === 'hud') { G.settings.hud = !G.settings.hud; document.body.classList.toggle('hud-off', !G.settings.hud); }
      else if (type === 'fullscreen') { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
      else if (type === 'gamepadConnected') toast('Controller connected', 'info');
      else if (type === 'gamepadDisconnected') toast('Controller disconnected', 'info');
    });
    $('#btn-resume').onclick = () => game.setPaused(false);
    $('#btn-menu').onclick = () => { game.setPaused(true); showMenu(true); };
    $('#btn-done-again').onclick = () => { $('#results').classList.add('hidden'); game.startMode(G.mode.id, G.mode.cfg || {}); };
    $('#btn-done-free').onclick = () => { $('#results').classList.add('hidden'); game.startMode('free'); };
  }

  // ---------------------------------------------------------------- menu
  function buildMenu() {
    const cards = $('#char-cards');
    cards.innerHTML = '';
    for (const def of HoopRoster.CHARACTERS) {
      const c = el('button', 'char-card');
      c.dataset.id = def.id;
      c.style.setProperty('--team', def.colors.jersey);
      const attrs = Object.entries(def.attrs).map(([k, v]) => `<div class="attr"><span>${k}</span><b>${v}</b><i style="width:${v}%"></i></div>`).join('');
      c.innerHTML = `<div class="num">${def.number}</div><div class="cname">${def.name}</div><div class="role">${def.role} · ${heightFt(def.heightM)}</div><p>${def.blurb}</p><div class="attrs">${attrs}</div>`;
      c.onclick = () => { game.selectCharacter(def.id); if (HoopAudio.ready) HoopAudio.S.ui('click'); };
      cards.appendChild(c);
    }
    const ms = $('#mode-select');
    ms.innerHTML = HoopModes.MODE_INFO.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    ms.onchange = () => { $('#mode-desc').textContent = HoopModes.MODE_INFO.find(m => m.id === ms.value).desc; };
    ms.onchange();
    const q = $('#set-quality'); q.value = G.settings.quality; q.onchange = () => game.setSetting('quality', q.value);
    const d = $('#set-diff'); d.value = G.settings.difficulty; d.onchange = () => game.setSetting('difficulty', d.value);
    $('#btn-play').onclick = () => { showMenu(false); game.startMode(ms.value); game.setPaused(false); if (HoopAudio.ready) HoopAudio.S.ui('confirm'); };
    refreshMenu();
  }
  function refreshMenu() {
    if (!G.def) return;
    document.querySelectorAll('.char-card').forEach(c => c.classList.toggle('on', c.dataset.id === G.def.id));
  }
  function showMenu(v) {
    menuOpen = v;
    $('#menu').classList.toggle('hidden', !v);
    $('#pause').classList.add('hidden');
    document.body.classList.toggle('in-menu', v);
    if (v) game.setPaused(true);
  }
  const heightFt = (m) => { const i = Math.round(m / 0.0254); return `${Math.floor(i / 12)}'${i % 12}"`; };

  // ---------------------------------------------------------------- HUD
  function toast(text, tone = 'info') {
    const t = $('#toast');
    t.textContent = text; t.className = 'toast show ' + tone;
    toastTimer = 2.2;
  }
  function showRelease(r) {
    const g = $('#grade');
    g.textContent = r.green ? 'Perfect release' : r.grade;
    g.className = 'grade show ' + (r.green ? 'green' : Math.abs(r.eMs) <= 35 ? 'ok' : 'bad');
  }
  function showResult(tr) {
    lastShotShown = tr;
    const box = $('#last-shot');
    const res = tr.made ? ({ swish: 'Swish', bank: 'Bank', rattle: 'Rattled in', rim: 'Rim in' })[tr.result] : missLabel(tr.missType);
    box.innerHTML = `<div class="res ${tr.made ? 'make' : 'miss'}">${res}</div>
      <div class="kv"><span>Distance</span><b>${HoopModes.ft(tr.dist)}</b></div>
      <div class="kv"><span>Timing</span><b>${tr.eMs >= 0 ? '+' : ''}${Math.round(tr.eMs)} ms</b></div>
      <div class="kv"><span>Release</span><b>${tr.relAngle.toFixed(1)}° · ${tr.relSpeed.toFixed(2)} m/s</b></div>
      <div class="kv"><span>Backspin</span><b>${tr.spinRps.toFixed(1)} rev/s</b></div>
      <div class="kv"><span>Entry</span><b>${tr.entryAngle ? tr.entryAngle.toFixed(1) + '°' : '—'}</b></div>`;
    box.classList.add('show');
  }
  function missLabel(m) {
    return ({ front: 'Front rim', back: 'Back rim', left: 'Off left', right: 'Off right', board: 'Off the glass', 'air-short': 'Airball (short)', 'air-long': 'Airball (long)', 'air-left': 'Airball (left)', 'air-right': 'Airball (right)', air: 'Airball' })[m] || 'Miss';
  }
  function showDone(d) {
    $('#results-title').textContent = d.title;
    $('#results-lines').innerHTML = (d.lines || []).map(l => `<div>${l}</div>`).join('');
    $('#results').classList.remove('hidden');
  }

  function frame(dt) {
    if (!G || !G.ready) return;
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('#toast').classList.remove('show'); }
    // shot meter
    const M = G.meter, meter = $('#meter');
    const show = G.settings.meter && M.active;
    meter.classList.toggle('show', show);
    if (show) {
      $('#meter-fill').style.height = (M.fill * 100).toFixed(1) + '%';
      const z = $('#meter-zone');
      if (M.lo !== null) { const a = (M.T + M.lo) / M.max, b = (M.T + M.hi + 0.002) / M.max; z.style.bottom = (a * 100) + '%'; z.style.height = Math.max(0.8, (b - a) * 100) + '%'; z.style.display = 'block'; }
      else z.style.display = 'none';
      $('#meter-ideal').style.bottom = (M.T / M.max * 100) + '%';
      meter.classList.toggle('green', !!M.green && M.released);
    }
    // session / mode panel
    const s = HoopStats.aggregate(HoopStats.filter(G.store, 'session'));
    const hud = G.mode && G.mode.hud ? G.mode.hud() : null;
    const panel = $('#mode-panel');
    if (hud) {
      panel.innerHTML = `<div class="mt">${hud.title}</div><div class="mm">${hud.main}</div><div class="ms">${hud.sub || ''}</div>${hud.timer != null ? `<div class="timer">${hud.timer.toFixed(1)}</div>` : ''}`;
    } else {
      panel.innerHTML = `<div class="mt">${G.def ? G.def.name : ''} · Free Shootaround</div><div class="mm">${s.made}/${s.att}</div><div class="ms">${s.att ? Math.round(s.fg * 100) : 0}% FG · 3PT ${s.made3}/${s.att3} · streak ${s.streak}</div>`;
    }
    const pl = G.player;
    if (pl) {
      const d = HoopPhysics.distToHoop(pl.x, pl.z, pl.targetHoop);
      $('#dist').textContent = `${HoopModes.ft(d)} · ${HoopPhysics.rangeLabel(d)}`;
    }
    $('#fps').textContent = `${Math.round(G.fps)} fps`;
  }

  return { init, frame, toast, showMenu };
})();
