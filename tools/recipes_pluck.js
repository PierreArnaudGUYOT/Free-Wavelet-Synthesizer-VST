// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: Pluck (20). See tools/preset_dsl.js for the language.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));
// A noise source is one short cycle repeated at the note's pitch and band-limited: the sound only has harmonics up to the Nyquist
// frequency. To get dense, noise-like high frequencies the noise is played low (oct -2 or -3) and the filter takes its high bands.
const tick = (lvl, o = {}) => ({ lvl, wave: 'noise', wavelet: 'db4', ftype: 'hp', fcut: 6.5, env: [0.001, 0.02, 0, 0.03], oct: -3, ...o });   // the nail on the string

add('Pluck', 'Saw Pluck', 'a classic synth pluck: a saw whose filter closes in a flash, with a noisy tick',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 3, fres: 3, fenv: 4, fvel: 2 },
    A2: tick(0.7, { fcut: 7 }),
    g: { amp: [0.001, 0.6, 0, 0.2, 0.7], mod: [0.001, 0.2, 0, 0.15], delay: [0.3, 0.3, 0.12], reverb: [0.4, 0.15] }, win: 0.1 });
add('Pluck', 'Pulse Pluck', 'a hollow pulse pluck with a brighter pulse an octave above that fades at once',
  { A1: { lvl: 0.6, wave: 'pulse', width: 0.3, wavelet: 'db4', fcut: 3.5, fres: 4, fenv: 4 },
    A2: { lvl: 0.35, wave: 'pulse', width: 0.5, wavelet: 'db4', fcut: 6, oct: 1, env: [0.001, 0.12, 0, 0.08] },
    g: { amp: [0.001, 0.55, 0, 0.15, 0.7], mod: [0.001, 0.18, 0, 0.12], delay: [0.25, 0.3, 0.14], reverb: [0.35, 0.15] }, win: 0.1 });
add('Pluck', 'Harp Pluck', 'a soft harp-like pluck: a triangle with a faint fingernail tick and a long, quiet ring',
  { A1: { lvl: 0.7, wave: 'tri', wavelet: 'db20', fcut: 6, fenv: 2, fvel: 2 },
    A2: tick(0.5, { fcut: 6.5, ftype: 'bp', fres: 2 }),
    g: { amp: [0.001, 1.8, 0, 0.5, 0.7], mod: [0.001, 0.3, 0, 0.2], chorus: [0.2], reverb: [0.7, 0.3] }, win: 0.1 });
add('Pluck', 'Nylon Guitar', 'a nylon-string guitar: a mellow saw, a soft body thump and a short ring',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db8', fcut: 3, fres: 2, fenv: 3, fvel: 2 },
    A2: { lvl: 0.35, wave: 'sine', wavelet: 'db20', penv: [5, 0.04], env: [0.001, 0.15, 0.2, 0.1] },
    g: { amp: [0.001, 1.1, 0, 0.3, 0.7], mod: [0.001, 0.3, 0, 0.2], reverb: [0.5, 0.2] }, win: 0.1 });
add('Pluck', 'Steel Guitar', 'a steel-string guitar: a bright saw with a second string that rings out of tune and fades',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 5, fres: 2, fenv: 3, fvel: 2 },
    A2: { lvl: 0.4, wave: 'saw', wavelet: 'db8', fcut: 6, oct: 1, fine: 6, env: [0.001, 0.4, 0, 0.2] },
    g: { amp: [0.001, 1.4, 0, 0.3, 0.7], mod: [0.001, 0.25, 0, 0.2], chorus: [0.2], reverb: [0.5, 0.2] }, win: 0.1 });
add('Pluck', 'Sitar Pluck', 'a sitar-like twang: a very resonant band-pass saw and a buzzing pulse an octave above',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db4', ftype: 'bp', fcut: 4.5, fres: 8, fenv: 3 },
    A2: { lvl: 0.35, wave: 'pulse', width: 0.15, wavelet: 'db4', fcut: 7, oct: 1, fine: 10, env: [0.002, 0.5, 0.1, 0.2] },
    g: { amp: [0.001, 1.5, 0.05, 0.3, 0.7], mod: [0.001, 0.4, 0.1, 0.3], delay: [0.3, 0.3, 0.12], reverb: [0.5, 0.2], drive: 0.2 }, win: 0.1 });
add('Pluck', 'Pizzicato Synth', 'a short synthetic pizzicato: a pulse and a tick, dry and quick',
  { A1: { lvl: 0.7, wave: 'pulse', width: 0.4, wavelet: 'db4', fcut: 3.5, fres: 2, fenv: 3.5 },
    A2: tick(0.8, { fcut: 7 }),
    g: { amp: [0.001, 0.25, 0, 0.1, 0.7], mod: [0.001, 0.12, 0, 0.1], reverb: [0.3, 0.1] }, win: 0.05 });

add('Pluck', 'Harp', 'a concert harp: ramp atoms that die away from the top, a bright pluck and a long ring',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -6, bars: [1, 0.8, 0.6, 0.4, 0.3], body: 3.5, bright: 0.25, sus: 0 },
    B2: { lvl: 0.3, pattern: 'impulse', wavelet: 'db8', tilt: -3, bars: [0, 0.3, 0.8, 1, 0.7], oct: 1, env: [0.001, 0.12, 0, 0.1] },
    g: { amp: [0.001, 3, 0, 0.8, 0.7], chorus: [0.2], reverb: [0.75, 0.35] }, win: 0.1 });
add('Pluck', 'Kalimba', 'a kalimba: a round tone, a metallic ping that drops in pitch, a wooden resonance',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'db20', tilt: -9, bars: [1, 0.3, 0.1], body: 1.4, bright: 0.4, sus: 0, oct: 1 },
    B2: { lvl: 0.3, pattern: 'random', seed: 7, wavelet: 'db8', tilt: -3, bars: [0, 0.2, 0.7, 1, 0.8], oct: 2, penv: [3, 0.03], env: [0.001, 0.1, 0, 0.1] },
    g: { amp: [0.001, 1.4, 0, 0.4, 0.7], delay: [0.3, 0.3, 0.1], reverb: [0.6, 0.25] }, win: 0.1 });
add('Pluck', 'Koto', 'a koto: a sharp, bright pluck of alternating atoms that bends down a little as it fades',
  { B1: { lvl: 0.65, pattern: 'alt', wavelet: 'db8', tilt: -4, bars: [1, 0.7, 0.8, 0.6, 0.4], body: 1.6, bright: 0.2, sus: 0, penv: [1, 0.15] },
    B2: { lvl: 0.3, pattern: 'impulse', wavelet: 'db4', tilt: -2, bars: [0, 0.2, 0.7, 1, 0.9], oct: 1, env: [0.001, 0.08, 0, 0.1] },
    g: { amp: [0.001, 1.8, 0, 0.5, 0.7], reverb: [0.6, 0.25] }, win: 0.1 });
add('Pluck', 'Banjo', 'a banjo: a twangy, bright pluck, hollow in the middle, with a quick ringing top',
  { B1: { lvl: 0.9, pattern: 'mirror', wavelet: 'db4', tilt: -2, bars: [0.8, 0.5, 1, 0.9, 0.6, 0.3], body: 0.8, bright: 0.14, sus: 0 },
    B2: { lvl: 0.6, pattern: 'impulse', wavelet: 'db4', tilt: -1, bars: [0, 0, 0.6, 1, 0.9, 0.6], oct: 1, env: [0.001, 0.08, 0, 0.08] },
    g: { amp: [0.001, 1, 0, 0.2, 0.7], drive: 0.2, reverb: [0.35, 0.15] }, win: 0.1 });
add('Pluck', 'Music Box', 'a music box: soft, high Walsh atoms ringing and fading, with the tiny tick of the comb',
  { B1: { lvl: 0.6, pattern: 'walsh', wavelet: 'db20', tilt: -4, bars: [1, 0.5, 0.7, 0.4, 0.3], body: 2.2, bright: 0.35, sus: 0, oct: 1 },
    B2: { lvl: 0.25, pattern: 'impulse', wavelet: 'db8', tilt: -1, bars: [0, 0, 0.4, 1, 0.9], oct: 2, env: [0.001, 0.05, 0, 0.06] },
    g: { amp: [0.001, 2.4, 0, 0.7, 0.6], delay: [0.3, 0.35, 0.14], reverb: [0.7, 0.3] }, win: 0.1 });
add('Pluck', 'Zither', 'a zither: shimmering plucks, two voices a hair apart that beat as they die away',
  { B1: { lvl: 0.55, pattern: 'ramp', wavelet: 'db8', tilt: -5, bars: [1, 0.8, 0.6, 0.4, 0.3], body: 2.2, bright: 0.3, sus: 0, fine: 7 },
    B2: { lvl: 0.55, pattern: 'ramp', wavelet: 'db8', tilt: -5, bars: [1, 0.8, 0.6, 0.4, 0.3], body: 2.2, bright: 0.3, sus: 0, fine: -7 },
    g: { amp: [0.001, 2.2, 0, 0.5, 0.7], chorus: [0.2], reverb: [0.6, 0.3] }, win: 0.1 });
add('Pluck', 'Glass Pluck', 'a plucked piece of glass: random atoms with a fast, bright decay and a chime above',
  { B1: { lvl: 0.6, pattern: 'random', seed: 19, wavelet: 'db8', tilt: -4, bars: [1, 0.8, 0.8, 0.6, 0.5, 0.3], body: 1.2, bright: 0.15, sus: 0 },
    B2: { lvl: 0.3, pattern: 'random', seed: 41, wavelet: 'sym8', tilt: -2, bars: [0, 0.3, 0.7, 1, 0.8], oct: 1, env: [0.001, 0.4, 0, 0.3] },
    g: { amp: [0.001, 1.4, 0, 0.5, 0.7], delay: [0.33, 0.3, 0.12], reverb: [0.6, 0.3] }, win: 0.1 });

add('Pluck', 'Pizzicato Hybrid', 'a pizzicato with a body: a pulse for the note, impulse atoms for the snap',
  { A1: { lvl: 0.55, wave: 'pulse', width: 0.4, wavelet: 'db8', fcut: 3.5, fenv: 3.5 },
    B1: { lvl: 0.5, pattern: 'impulse', wavelet: 'db8', tilt: -4, bars: [1, 0.8, 0.6, 0.4], body: 0.3, bright: 0.05, sus: 0 },
    g: { amp: [0.001, 0.3, 0, 0.1, 0.7], mod: [0.001, 0.12, 0, 0.1], reverb: [0.35, 0.12] }, win: 0.05 });
add('Pluck', 'Ukulele', 'a small, bright ukulele: a triangle and impulse atoms, a happy, dry pluck',
  { A1: { lvl: 0.5, wave: 'tri', wavelet: 'db8', fcut: 6, fenv: 2 },
    B1: { lvl: 0.5, pattern: 'impulse', wavelet: 'db4', tilt: -3, bars: [0.8, 1, 0.8, 0.5], body: 0.6, bright: 0.1, sus: 0 },
    g: { amp: [0.001, 0.7, 0, 0.15, 0.7], mod: [0.001, 0.15, 0, 0.1], chorus: [0.15], reverb: [0.35, 0.12] }, win: 0.1 });
add('Pluck', 'Bell Pluck', 'a plucked bell: a soft triangle and random atoms that ring longer in the top',
  { A1: { lvl: 0.5, wave: 'tri', wavelet: 'db20', fcut: 7, fenv: 1 },
    B1: { lvl: 0.45, pattern: 'random', seed: 3, wavelet: 'db8', tilt: -3, bars: [0.6, 0.8, 1, 0.9, 0.6, 0.3], body: 1, bright: 0.8, sus: 0 },
    g: { amp: [0.001, 1.8, 0, 0.6, 0.7], mod: [0.001, 0.3, 0, 0.2], delay: [0.33, 0.3, 0.12], reverb: [0.65, 0.3] }, win: 0.1 });
add('Pluck', 'Echo Pluck', 'a pluck that turns into rhythm: a saw, mirror atoms and a long, repeating echo',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 3.5, fres: 3, fenv: 4 },
    B1: { lvl: 0.35, pattern: 'mirror', wavelet: 'db8', tilt: -5, bars: [1, 0.6, 0.4], body: 0.8, bright: 0.15, sus: 0 },
    g: { amp: [0.001, 0.6, 0, 0.2, 0.7], mod: [0.001, 0.2, 0, 0.15], delay: [0.375, 0.55, 0.35], reverb: [0.5, 0.2] }, win: 0.1 });
add('Pluck', 'Lute', 'a lute: a mellow saw, mirror atoms that fade from the top, a gentle, woody ring',
  { A1: { lvl: 0.5, wave: 'saw', wavelet: 'db20', fcut: 3.5, fenv: 2.5, fvel: 2 },
    B1: { lvl: 0.45, pattern: 'mirror', wavelet: 'db20', tilt: -6, bars: [1, 0.7, 0.6, 0.3], body: 1.5, bright: 0.2, sus: 0 },
    g: { amp: [0.001, 1.3, 0, 0.3, 0.7], mod: [0.001, 0.3, 0, 0.2], reverb: [0.5, 0.2] }, win: 0.1 });
add('Pluck', 'Stab Pluck', 'a chord stab: a bright saw and Walsh atoms, hit hard and cut off',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db4', fcut: 4, fres: 4, fenv: 5 },
    B1: { lvl: 0.4, pattern: 'walsh', wavelet: 'haar', tilt: -3, bars: [0.7, 0.9, 1, 0.8, 0.5], body: 0.3, bright: 0.08, sus: 0 },
    g: { amp: [0.001, 0.3, 0, 0.12, 0.7], mod: [0.001, 0.15, 0, 0.1], uni: [2, 8], reverb: [0.4, 0.15] }, win: 0.05 });

module.exports = out;
