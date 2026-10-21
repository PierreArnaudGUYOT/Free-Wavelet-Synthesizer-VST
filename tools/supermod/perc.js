// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The drums and percussion of the beta 0.3 presets (tools/supermod/compose.js, category "Drums & Perc"): archetypes of a drum or a hit, each with
// the values of its oscillators (A1 A2 B1, in the language of tools/preset_dsl.js) drawn within the range that makes that drum, the voice and its
// effects, the words of its name and one line of description. Every key is a pitched hit (low notes for the drums); the sounds are one-shots
// (sustain 0). A decay time is the time to fall by 60 dB. A noise source is a short cycle repeated at the note's pitch: for a hat it sits three
// octaves down of a note played an octave or more up, so its filter cutoffs are high bands. The same drums as tools/recipes_perc.js, but drawn
// instead of fixed, so that the LFOs (which the composer adds) have different drums to move.
//   const { drum } = require('./perc.js');   drum(r) -> { id, osc: { A1, A2, B1 }, g, words, form, desc }
'use strict';

const f = (x, n = 2) => +x.toFixed(n);
const hit = (g) => Object.assign({ voices: 8, uni: [1, 0] }, g);

const DRUMS = [
  { id: 'kick', w: 3, words: ['Thud', 'Boom', 'Pulse', 'Punch', 'Heartbeat', 'Piston'], form: ['Kick', 'Thump', 'Drum'],
    desc: 'a kick: a sine that falls from high to low in a blink, with a click on top',
    make: (r) => ({
      A1: { lvl: f(r.f(0.8, 1)), wave: 'sine', wavelet: 'db20', penv: [f(r.f(22, 46), 1), f(r.f(0.03, 0.075), 3)] },
      A2: r.p(0.7) ? { lvl: f(r.f(0.35, 0.8)), wave: 'noise', wavelet: r.pick(['db4', 'haar']), ftype: 'hp', fcut: f(r.f(6, 7.5)), oct: -3, env: [0.001, f(r.f(0.012, 0.035), 3), 0, f(r.f(0.015, 0.04), 3)] }
        : { lvl: f(r.f(0.3, 0.6)), wave: 'tri', width: 0.5, wavelet: 'db8', fcut: f(r.f(5, 8)), oct: 1, penv: [f(r.f(12, 30), 1), 0.02], env: [0.001, f(r.f(0.04, 0.09), 3), 0, 0.04] },
      g: hit({ amp: [0.001, f(r.f(0.25, 0.7), 3), 0, f(r.f(0.08, 0.16), 3), 0.5], oct: -2, drive: f(r.f(0.1, 0.4)) }) }) },
  { id: 'snare', w: 3, words: ['Crack', 'Snap', 'Rattle', 'Whip', 'Bite'], form: ['Snare', 'Crack', 'Snap'],
    desc: 'a snare: a tone that falls a little and a bright burst of noise with a short tail',
    make: (r) => ({
      A1: { lvl: f(r.f(0.4, 0.7)), wave: 'tri', wavelet: 'db8', fcut: 8, penv: [f(r.f(4, 10), 1), 0.03], env: [0.001, f(r.f(0.1, 0.2), 3), 0, 0.08] },
      A2: { lvl: f(r.f(0.8, 1)), wave: 'noise', wavelet: r.pick(['db4', 'haar', 'db8']), ftype: 'bp', fcut: f(r.f(7, 8.2)), fres: f(r.f(1, 2.5)), oct: -2, env: [0.001, f(r.f(0.18, 0.4), 3), 0, 0.1] },
      g: hit({ amp: [0.001, f(r.f(0.2, 0.4), 3), 0, 0.1, 0.5], oct: -1, drive: f(r.f(0.15, 0.4)), reverb: [f(r.f(0.25, 0.5)), f(r.f(0.1, 0.2))] }) }) },
  { id: 'hat', w: 3, words: ['Tick', 'Chick', 'Shimmer', 'Sizzle', 'Glint', 'Spit'], form: ['Hat', 'Hi-Hat', 'Chick'],
    desc: 'a hi-hat: bright, metallic noise and a thin pulse',
    make: (r) => { const open = r.p(0.4), d = open ? f(r.f(0.5, 1.1), 3) : f(r.f(0.12, 0.3), 3); return {
      A1: { lvl: 1, wave: 'noise', wavelet: 'haar', ftype: 'hp', fcut: f(r.f(7.5, 8.5)), fslope: 36, oct: -3, env: [0.001, d, 0, f(d * 0.2, 3)] },
      A2: { lvl: f(r.f(0.3, 0.55)), wave: 'pulse', width: 0.2, wavelet: 'haar', ftype: 'hp', fcut: f(r.f(2, 3)), fslope: 36, oct: 3, semi: r.pick([5, 6, 7]), fine: f(r.f(10, 40), 1), env: [0.001, f(d * 0.8, 3), 0, f(d * 0.2, 3)] },
      g: hit({ amp: [0.001, d, 0, f(d * 0.2, 3), 0.5], drive: f(r.f(0.2, 0.45)), reverb: [f(r.f(0.25, 0.45)), 0.1] }) }; },
    descOf: (v) => (v.amp_d > 0.45 ? 'an open hi-hat: bright, metallic noise and a thin pulse, left to ring' : 'a closed hi-hat: bright, metallic noise and a thin pulse, a tight chick') },
  { id: 'clap', w: 2, words: ['Slap', 'Applause', 'Palm', 'Flap'], form: ['Clap', 'Slap'],
    desc: 'a handclap: noise with a slightly slower attack and a roomy tail',
    make: (r) => ({
      A1: { lvl: 1, wave: 'noise', wavelet: 'db4', ftype: 'hp', fcut: f(r.f(4.5, 5.5)), fslope: 18, oct: -3, env: [f(r.f(0.004, 0.01), 3), f(r.f(0.2, 0.4), 3), 0, 0.1] },
      A2: { lvl: f(r.f(0.5, 0.8)), wave: 'noise', wavelet: 'db8', ftype: 'bp', fcut: f(r.f(7, 8)), fres: f(r.f(1, 2)), oct: -3, env: [f(r.f(0.008, 0.02), 3), f(r.f(0.3, 0.5), 3), 0, 0.1] },
      g: hit({ amp: [0.002, f(r.f(0.3, 0.5), 3), 0, 0.12, 0.5], drive: f(r.f(0.15, 0.35)), reverb: [f(r.f(0.55, 0.75)), f(r.f(0.25, 0.4))] }) }) },
  { id: 'tom', w: 2.5, words: ['Round', 'Hollow', 'Skin', 'Barrel', 'Drumhead'], form: ['Tom', 'Drum'],
    desc: 'a tom: a round sine with a falling pitch and mirror atoms for the skin',
    make: (r) => ({
      A1: { lvl: f(r.f(0.6, 0.85)), wave: 'sine', wavelet: 'db20', penv: [f(r.f(8, 18), 1), f(r.f(0.05, 0.09), 3)] },
      B1: { lvl: f(r.f(0.35, 0.6)), pattern: 'mirror', wavelet: 'db20', tilt: f(r.f(-7, -4), 1), bars: [1, 0.5, 0.3], body: f(r.f(0.18, 0.35)), bright: 0.06, sus: 0, penv: [f(r.f(5, 10), 1), 0.05] },
      g: hit({ amp: [0.001, f(r.f(0.4, 0.8), 3), 0, 0.12, 0.5], oct: -1, drive: f(r.f(0.1, 0.3)), reverb: [f(r.f(0.35, 0.6)), f(r.f(0.12, 0.25))] }) }) },
  { id: 'wood', w: 3, words: ['Knock', 'Tap', 'Clack', 'Stick', 'Wood', 'Tock'], form: ['Block', 'Claves', 'Knock'],
    desc: 'a wood block: a hollow knock with a quick bright ring above it',
    make: (r) => ({
      B1: { lvl: 1, pattern: r.pick(['mirror', 'ramp']), wavelet: r.pick(['db8', 'db4']), tilt: f(r.f(-4, -2), 1), bars: [1, f(r.f(0.4, 0.8)), f(r.f(0.2, 0.6)), 0.2], body: f(r.f(0.12, 0.25)), bright: 0.06, sus: 0, oct: r.pick([1, 1, 2]) },
      A1: r.p(0.5) ? { lvl: f(r.f(0.3, 0.6)), wave: 'tri', wavelet: 'db8', fcut: f(r.f(7, 9)), penv: [f(r.f(6, 12), 1), 0.015], env: [0.001, f(r.f(0.05, 0.1), 3), 0, 0.05] } : undefined,
      A2: { lvl: f(r.f(0.4, 0.7)), wave: 'pulse', width: f(r.f(0.1, 0.25)), wavelet: r.pick(['db2', 'haar']), ftype: 'bp', fcut: f(r.f(5, 7.5)), fres: f(r.f(3, 8)), oct: 1, env: [0.001, f(r.f(0.04, 0.1), 3), 0, 0.05] },
      g: hit({ amp: [0.001, f(r.f(0.12, 0.28), 3), 0, 0.06, 0.5], drive: f(r.f(0.15, 0.35)), reverb: [f(r.f(0.25, 0.45)), 0.12] }) }) },
  { id: 'conga', w: 2.5, words: ['Round', 'Palm', 'Skin', 'Slap', 'Bongo'], form: ['Conga', 'Bongo', 'Hand Drum'],
    desc: 'a hand drum: a round open tone with a slap, the pitch settling down as it rings',
    make: (r) => ({
      B1: { lvl: f(r.f(0.7, 1)), pattern: 'mirror', wavelet: 'db20', tilt: f(r.f(-6, -3), 1), bars: [1, f(r.f(0.4, 0.7)), 0.3, 0.15], body: f(r.f(0.3, 0.5)), bright: 0.1, sus: 0, penv: [f(r.f(2, 5), 1), 0.05], oct: r.pick([0, 1]) },
      A2: { lvl: f(r.f(0.3, 0.55)), wave: 'noise', wavelet: 'db8', ftype: 'bp', fcut: f(r.f(6.5, 8)), fres: f(r.f(1.5, 4)), oct: -2, env: [0.001, f(r.f(0.04, 0.09), 3), 0, 0.05] },
      g: hit({ amp: [0.001, f(r.f(0.35, 0.6), 3), 0, 0.12, 0.5], drive: f(r.f(0.1, 0.3)), reverb: [f(r.f(0.3, 0.55)), f(r.f(0.12, 0.25))] }) }) },
  { id: 'metal', w: 2.5, words: ['Clank', 'Cowbell', 'Tin', 'Anvil', 'Clang', 'Steel'], form: ['Cowbell', 'Clank', 'Metal'],
    desc: 'a cowbell: two clanking partials, a hard strike and a short metallic ring',
    make: (r) => ({
      B1: { lvl: f(r.f(0.7, 1)), pattern: r.pick(['walsh', 'alt']), wavelet: 'haar', tilt: f(r.f(-3, -1), 1), bars: [1, 0.7, 0.8, 0.5, 0.3], body: f(r.f(0.2, 0.4)), bright: 0.1, sus: 0, oct: 1 },
      A2: { lvl: f(r.f(0.4, 0.75)), wave: r.pick(['pulse', 'square']), width: 0.35, wavelet: 'haar', ftype: 'bp', fcut: f(r.f(5.5, 7.5)), fres: f(r.f(1, 3)), oct: 1, semi: 7, fine: f(r.f(15, 50), 1), env: [0.001, f(r.f(0.15, 0.3), 3), 0, 0.1] },
      g: hit({ amp: [0.001, f(r.f(0.25, 0.5), 3), 0, 0.1, 0.5], drive: f(r.f(0.1, 0.3)), reverb: [f(r.f(0.25, 0.45)), 0.1] }) }) },
  { id: 'shaker', w: 2, words: ['Jingle', 'Rustle', 'Shake', 'Seeds', 'Gravel'], form: ['Shaker', 'Tambourine', 'Jingles'],
    desc: 'a shaker: jingles of noise and metallic atoms, shaken and fading',
    make: (r) => ({
      A1: { lvl: f(r.f(0.7, 1)), wave: 'noise', wavelet: 'haar', ftype: 'hp', fcut: f(r.f(8, 9)), fslope: 36, oct: -3, env: [f(r.f(0.003, 0.03), 3), f(r.f(0.2, 0.5), 3), 0, 0.1] },
      B1: { lvl: f(r.f(0.5, 0.85)), pattern: 'random', seed: r.i(0, 99), wavelet: 'haar', tilt: 0, bars: [0, 0.3, 0.8, 1, 1, 0.9, 0.7], body: f(r.f(0.25, 0.5)), bright: 0.12, sus: 0, oct: 2 },
      g: hit({ amp: [f(r.f(0.002, 0.02), 3), f(r.f(0.25, 0.55), 3), 0, 0.12, 0.5], drive: f(r.f(0.15, 0.35)), reverb: [f(r.f(0.3, 0.55)), 0.15] }) }) },
  { id: 'zap', w: 2, words: ['Laser', 'Zap', 'Dive', 'Drop', 'Blip', 'Plasma'], form: ['Zap', 'Laser', 'Tom'],
    desc: 'an electronic zap: a sine that dives through the octaves with a hiss on top',
    make: (r) => ({
      A1: { lvl: f(r.f(0.7, 1)), wave: r.pick(['sine', 'sine', 'tri']), width: 0.5, wavelet: 'db20', penv: [f(r.f(28, 46), 1), f(r.f(0.06, 0.2), 3)] },
      A2: { lvl: f(r.f(0.25, 0.55)), wave: 'noise', wavelet: r.pick(['db4', 'haar']), ftype: 'hp', fcut: f(r.f(6.5, 8)), oct: -3, env: [0.001, f(r.f(0.03, 0.12), 3), 0, 0.05] },
      g: hit({ amp: [0.001, f(r.f(0.25, 0.7), 3), 0, 0.1, 0.5], drive: f(r.f(0.1, 0.4)), delay: r.p(0.5) ? [r.pick([0.25, 0.33, 0.5]), f(r.f(0.25, 0.4)), f(r.f(0.1, 0.22))] : undefined, reverb: [f(r.f(0.3, 0.6)), f(r.f(0.1, 0.25))] }) }) },
  { id: 'tick', w: 1.5, words: ['Click', 'Glitch', 'Pin', 'Spark', 'Dot'], form: ['Tick', 'Click', 'Glitch'],
    desc: 'a tick: a very short burst of noise over a high ping of single atoms',
    make: (r) => ({
      A1: { lvl: f(r.f(0.7, 1)), wave: 'noise', wavelet: r.pick(['db4', 'haar']), ftype: r.pick(['hp', 'bp']), fcut: f(r.f(6.5, 8.5)), fres: f(r.f(0, 3)), oct: -3, env: [0.001, f(r.f(0.015, 0.05), 3), 0, 0.02] },
      B1: { lvl: f(r.f(0.4, 0.8)), pattern: 'impulse', wavelet: r.pick(['haar', 'db4']), tilt: f(r.f(-1, 0), 1), bars: [0, 0, 0.7, 1, 0.6], body: f(r.f(0.06, 0.12)), bright: 0.04, sus: 0, oct: r.pick([2, 3]) },
      g: hit({ amp: [0.001, f(r.f(0.07, 0.16), 3), 0, 0.05, 0.5], drive: f(r.f(0.2, 0.4)), reverb: [f(r.f(0.2, 0.4)), 0.1] }) }) },
  { id: 'taiko', w: 1.5, words: ['Thunder', 'Temple', 'Rumble', 'Taiko', 'Distant'], form: ['Taiko', 'Drum', 'Boom'],
    desc: 'a taiko: a very low sine that falls and a big skin that rings in a large room',
    make: (r) => ({
      A1: { lvl: f(r.f(0.75, 1)), wave: 'sine', wavelet: 'db20', penv: [f(r.f(14, 26), 1), f(r.f(0.08, 0.16), 3)] },
      B1: { lvl: f(r.f(0.35, 0.6)), pattern: 'mirror', wavelet: 'db20', tilt: f(r.f(-6, -3), 1), bars: [1, 0.6, 0.4, 0.2], body: f(r.f(0.4, 0.9)), bright: 0.08, sus: 0, penv: [f(r.f(4, 9), 1), 0.08], oct: -1 },
      g: hit({ amp: [0.001, f(r.f(0.9, 1.8), 3), 0, f(r.f(0.15, 0.3), 3), 0.5], oct: -2, drive: f(r.f(0.1, 0.3)), reverb: [f(r.f(0.7, 0.9)), f(r.f(0.25, 0.45))] }) }) },
  { id: 'crash', w: 1.5, words: ['Wash', 'Splash', 'Crash', 'Sizzle', 'Shatter'], form: ['Crash', 'Cymbal', 'Splash'],
    desc: 'a cymbal: a long wash of high noise with rough metallic atoms ringing through it',
    make: (r) => ({
      A1: { lvl: f(r.f(0.7, 1)), wave: 'noise', wavelet: 'haar', ftype: 'hp', fcut: f(r.f(7, 8.5)), fslope: 36, oct: -3, env: [f(r.f(0.001, 0.01), 3), f(r.f(1.2, 2.6), 3), 0, f(r.f(0.3, 0.6), 3)] },
      B1: { lvl: f(r.f(0.4, 0.8)), pattern: 'random', seed: r.i(0, 99), wavelet: r.pick(['db2', 'haar']), tilt: f(r.f(-3, 1), 1), bars: [0, 0.3, 0.7, 1, 1, 0.9, 0.7, 0.5, 0.3], body: f(r.f(0.8, 1.8)), bright: f(r.f(0.1, 0.4)), sus: 0, oct: 2 },
      g: hit({ amp: [0.001, f(r.f(1.2, 2.6), 3), 0, f(r.f(0.3, 0.6), 3), 0.5], drive: f(r.f(0.15, 0.35)), reverb: [f(r.f(0.55, 0.85)), f(r.f(0.2, 0.4))] }) }) },
  { id: 'gong', w: 1, words: ['Gong', 'Temple', 'Brass', 'Resonance', 'Tam'], form: ['Gong', 'Tam-Tam', 'Plate'],
    desc: 'a gong: a deep tone and clanging atoms that ring on and on',
    make: (r) => ({
      B1: { lvl: f(r.f(0.7, 1)), pattern: r.pick(['impulse', 'random']), seed: r.i(0, 99), wavelet: r.pick(['db8', 'sym8']), tilt: f(r.f(-3, 0), 1), bars: [0.3, 0.7, 0.9, 1, 0.8, 0.6, 0.4, 0.3, 0.15], body: f(r.f(2, 5)), bright: f(r.f(0.3, 0.9)), sus: 0, env: [0.001, f(r.f(2, 4), 3), 0, f(r.f(0.6, 1.4), 3)] },
      A1: { lvl: f(r.f(0.3, 0.6)), wave: 'sine', wavelet: 'db20', oct: -1, penv: [f(r.f(1, 3), 1), 0.2] },
      g: hit({ amp: [0.002, f(r.f(2, 4), 3), 0, f(r.f(0.6, 1.4), 3), 0.5], drive: 0.1, reverb: [f(r.f(0.6, 0.85)), f(r.f(0.25, 0.4))] }) }) },
];

const DRUM_BY_ID = Object.fromEntries(DRUMS.map(d => [d.id, d]));
function drum(r, id) {
  const d = id ? DRUM_BY_ID[id] : r.wpick(DRUMS.map(x => [x, x.w]));
  const m = d.make(r), osc = {};
  for (const k of ['A1', 'A2', 'B1']) if (m[k]) osc[k] = m[k];
  const v = { amp_d: m.g.amp[1] };
  return { id: d.id, osc, g: m.g, words: d.words, form: d.form, desc: d.descOf ? d.descOf(v) : d.desc };
}
module.exports = { drum, DRUMS };
