// HOOP LAB — playable roster and jump-shot presets (pure data).
const HoopRoster = (() => {
  'use strict';

  // Jump Shot Creator parameters. All sliders are normalized; the animation and the
  // shot model map them to physical quantities.
  const PARAMS = [
    { key: 'pocket',        label: 'Shooting pocket',       group: 'Set-up',      lo: 'Waist',       hi: 'Chin' },
    { key: 'dip',           label: 'Ball dip',              group: 'Set-up',      lo: 'None',        hi: 'Deep' },
    { key: 'motion',        label: 'One- vs two-motion',    group: 'Set-up',      lo: 'One-motion',  hi: 'Two-motion' },
    { key: 'setPoint',      label: 'Release height',        group: 'Release',     lo: 'Forehead',    hi: 'High overhead' },
    { key: 'extension',     label: 'Forward arm extension', group: 'Release',     lo: 'Straight up', hi: 'Out front' },
    { key: 'speed',         label: 'Release speed',         group: 'Release',     lo: 'Deliberate',  hi: 'Quick' },
    { key: 'arc',           label: 'Shot arc',              group: 'Release',     lo: 'Flat',        hi: 'Rainbow' },
    { key: 'elbow',         label: 'Shooting elbow',        group: 'Arms',        lo: 'Tucked',      hi: 'Flared' },
    { key: 'guide',         label: 'Guide-hand involvement',group: 'Arms',        lo: 'Off early',   hi: 'Two-hand push' },
    { key: 'flick',         label: 'Wrist flick timing',    group: 'Arms',        lo: 'Early snap',  hi: 'Late snap' },
    { key: 'knee',          label: 'Knee bend',             group: 'Lower body',  lo: 'Upright',     hi: 'Deep load' },
    { key: 'jump',          label: 'Jump elevation',        group: 'Lower body',  lo: 'Set shot',    hi: 'High rise' },
    { key: 'releaseTiming', label: 'Release in the jump',   group: 'Lower body',  lo: 'On the way up', hi: 'At the top' },
    { key: 'footWidth',     label: 'Foot width',            group: 'Lower body',  lo: 'Narrow',      hi: 'Wide' },
    { key: 'footStagger',   label: 'Foot stagger',          group: 'Lower body',  lo: 'Square',      hi: 'Staggered' },
    { key: 'lean',          label: 'Body lean',             group: 'Lower body',  lo: 'Fade back',   hi: 'Lean in', min: -1, max: 1 },
  ];

  const P = (o) => Object.assign({
    pocket: .5, dip: .2, motion: .3, setPoint: .6, extension: .45, speed: .6, arc: .55, elbow: .15,
    guide: .25, flick: .6, knee: .5, jump: .4, releaseTiming: .6, footWidth: .5, footStagger: .3, lean: 0,
  }, o);

  const PRESETS = [
    { id: 'marksman', name: 'Deep-Range Marksman', blurb: 'Quick one-motion shot, legs and arms in sync, compact release, built to fire on the move.',
      params: P({ pocket: .45, dip: .25, motion: 0, setPoint: .55, extension: .45, speed: .92, arc: .55, elbow: .12, guide: .2, flick: .62, knee: .58, jump: .3, releaseTiming: .3, footWidth: .45, footStagger: .3, lean: .05 }) },
    { id: 'highrelease', name: 'High-Release Scorer', blurb: 'Elevated set point above the head, controlled release, moderate jump, hard to contest.',
      params: P({ pocket: .65, dip: .1, motion: .6, setPoint: .95, extension: .25, speed: .55, arc: .5, elbow: .1, guide: .25, flick: .72, knee: .45, jump: .55, releaseTiming: .85, footWidth: .5, footStagger: .35, lean: -.05 }) },
    { id: 'unorthodox', name: 'Unorthodox Range Shooter', blurb: 'Low pocket, one continuous forward-and-up push, barely leaves the floor, naturally high arc.',
      params: P({ pocket: .12, dip: .5, motion: 0, setPoint: .45, extension: .88, speed: .7, arc: .95, elbow: .42, guide: .5, flick: .5, knee: .68, jump: .1, releaseTiming: .2, footWidth: .55, footStagger: .2, lean: .12 }) },
    { id: 'traditional', name: 'Traditional Jump Shooter', blurb: 'Higher set point, a distinct jump then release at the top, classic held follow-through.',
      params: P({ pocket: .6, dip: .3, motion: 1, setPoint: .85, extension: .35, speed: .45, arc: .6, elbow: .1, guide: .2, flick: .8, knee: .5, jump: .7, releaseTiming: .95, footWidth: .42, footStagger: .4, lean: 0 }) },
    { id: 'setshot', name: 'Set-Shot Specialist', blurb: 'Very small jump, quick release, efficient motion with nothing wasted.',
      params: P({ pocket: .55, dip: .15, motion: .1, setPoint: .6, extension: .5, speed: .86, arc: .55, elbow: .1, guide: .3, flick: .5, knee: .4, jump: .05, releaseTiming: .5, footWidth: .45, footStagger: .25, lean: .05 }) },
    { id: 'mine', name: 'My Real-Life Jumper', blurb: 'Starts low at the chest, arms travel forward and up in one motion, guide hand stays late like a two-hand push, normal follow-through, high arc, long range on a small jump.',
      params: P({ pocket: .38, dip: .12, motion: 0, setPoint: .42, extension: .78, speed: .66, arc: .88, elbow: .32, guide: .92, flick: .7, knee: .62, jump: .14, releaseTiming: .3, footWidth: .52, footStagger: .22, lean: .1 }) },
  ];

  // Playable characters. Each loads the supplied GLB from the character pack.
  // Names are original role names; the back-of-jersey plate shows the editable player name.
  const CHARACTERS = [
    {
      id: 'guard30', file: 'stephen_curry.glb', name: 'Range Guard', plate: 'RANGE', number: '30',
      role: 'Point guard', heightM: 1.8796, massKg: 91,
      colors: { jersey: '#1C54A3', accent: '#F6C84A', shorts: '#1C54A3', shoe: '#E7EAE6', sole: '#E2BD4B' },
      blurb: 'Lightning one-motion release from anywhere. Tight, low handle and the best shooting on the move.',
      move: { walk: 1.5, jog: 4.0, sprint: 7.3, accel: 11.0, decel: 13.5, turn: 12.0, dribbleHz: 2.7, dribbleTop: 0.78, stepback: 1.05, maxLeap: 0.66, crossTime: 0.30 },
      shoot: { baseRange: 10.2, kMul: 0.86, kMulMid: 0.86, moveComp: 0.94, releaseMul: 0.92, heave: 1.05 },
      sig: { id: 'sig', name: 'Signature: Range Guard', params: P({ pocket: .48, dip: .22, motion: 0, setPoint: .58, extension: .42, speed: .95, arc: .62, elbow: .1, guide: .18, flick: .66, knee: .56, jump: .32, releaseTiming: .28, footWidth: .44, footStagger: .28, lean: .04 }) },
      attrs: { Range: 97, Release: 98, 'Shot IQ on the move': 96, Strength: 62, Speed: 86, Elevation: 70 },
    },
    {
      id: 'forward23', file: 'lebron_james.glb', name: 'Point Forward', plate: 'FORWARD', number: '23',
      role: 'Forward', heightM: 2.0574, massKg: 113,
      colors: { jersey: '#542A80', accent: '#EEB84E', shorts: '#542A80', shoe: '#F4EDDD', sole: '#6D4BAC' },
      blurb: 'Huge frame and top-end speed. Set point in front of the face, strong two-foot base, power step-back.',
      move: { walk: 1.6, jog: 4.3, sprint: 8.1, accel: 8.4, decel: 9.8, turn: 8.5, dribbleHz: 2.1, dribbleTop: 0.82, stepback: 1.2, maxLeap: 0.8, crossTime: 0.36 },
      shoot: { baseRange: 9.4, kMul: 1.02, kMulMid: 1.0, moveComp: 0.84, releaseMul: 1.06, heave: 1.3 },
      sig: { id: 'sig', name: 'Signature: Point Forward', params: P({ pocket: .58, dip: .2, motion: .45, setPoint: .7, extension: .4, speed: .55, arc: .45, elbow: .22, guide: .3, flick: .58, knee: .45, jump: .38, releaseTiming: .62, footWidth: .7, footStagger: .35, lean: -.02 }) },
      attrs: { Range: 84, Release: 80, 'Shot IQ on the move': 82, Strength: 98, Speed: 92, Elevation: 88 },
    },
    {
      id: 'wing23', file: 'michael_jordan.glb', name: 'Aerial Wing', plate: 'WING', number: '23',
      role: 'Shooting guard', heightM: 1.9812, massKg: 98,
      colors: { jersey: '#C91F37', accent: '#F2F2F0', shorts: '#C91F37', shoe: '#F5F5F5', sole: '#CC2D37' },
      blurb: 'Explosive leaper with a high release at the apex. Lethal midrange fadeaway, sharp footwork.',
      move: { walk: 1.6, jog: 4.2, sprint: 7.9, accel: 10.2, decel: 12.8, turn: 10.5, dribbleHz: 2.35, dribbleTop: 0.8, stepback: 0.95, maxLeap: 0.95, crossTime: 0.32 },
      shoot: { baseRange: 8.6, kMul: 0.98, kMulMid: 0.74, moveComp: 0.89, releaseMul: 1.0, heave: 1.1 },
      sig: { id: 'sig', name: 'Signature: Aerial Wing', params: P({ pocket: .62, dip: .25, motion: .55, setPoint: .9, extension: .3, speed: .62, arc: .5, elbow: .08, guide: .2, flick: .78, knee: .5, jump: .78, releaseTiming: .95, footWidth: .45, footStagger: .38, lean: -.18 }) },
      attrs: { Range: 78, Release: 90, 'Shot IQ on the move': 88, Strength: 80, Speed: 90, Elevation: 99 },
    },
  ];

  function getCharacter(id) { return CHARACTERS.find(c => c.id === id) || CHARACTERS[0]; }
  function presetById(id) { return PRESETS.find(p => p.id === id); }
  function cloneParams(p) { return Object.assign({}, p); }

  return { PARAMS, PRESETS, CHARACTERS, getCharacter, presetById, cloneParams };
})();
if (typeof module !== 'undefined') module.exports = HoopRoster;
