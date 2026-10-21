// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: Brass & Wind (14). See tools/preset_dsl.js for the language.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));
const breath = (lvl, o = {}) => ({ lvl, wave: 'noise', wavelet: 'db4', ftype: 'bp', fcut: 8, fres: 3, oct: 2, env: [0.03, 0.4, 0.5, 0.15], ...o });   // the air in a wind sound

add('Brass & Wind', 'Brass Section', 'a section of brass: two saws, the second an octave below, both swelling open with a bite',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db8', fcut: 3.3, fslope: 36, fres: 5, fenv: 4, fine: 6 },
    A2: { lvl: 0.5, wave: 'saw', wavelet: 'db8', fcut: 3, fslope: 36, fres: 4, fenv: 4, oct: -1, fine: -6 },
    g: { amp: [0.04, 0.5, 0.9, 0.25], mod: [0.06, 0.5, 0.45, 0.3], uni: [2, 9], reverb: [0.5, 0.2], lfo: { rate: 5, pitch: 3 } } });
add('Brass & Wind', 'Synth Brass Stab', 'a short, sharp brass stab: a saw and a pulse whose filter opens and closes in an instant',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db4', fcut: 2.5, fslope: 36, fres: 6, fenv: 6 },
    A2: { lvl: 0.45, wave: 'pulse', width: 0.4, wavelet: 'db4', fcut: 2.5, fres: 4, fenv: 5, fine: 8 },
    g: { amp: [0.01, 0.3, 0.2, 0.15], mod: [0.015, 0.28, 0.1, 0.15], uni: [2, 10], reverb: [0.4, 0.15] }, win: 0.1 });
add('Brass & Wind', 'Trumpet Lead', 'a bright, brassy trumpet: a saw with a quick, rasping swell and a pulse above it',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db8', fcut: 3.5, fslope: 36, fres: 4, fenv: 4 },
    A2: { lvl: 0.3, wave: 'saw', wavelet: 'db8', fcut: 4.5, fenv: 3.5, oct: 1, fine: 9 },
    g: { voices: 1, porta: 'legato', glide: 0.03, amp: [0.03, 0.4, 0.9, 0.12], mod: [0.04, 0.3, 0.6, 0.2], lfo: { rate: 5.5, pitch: 4 }, reverb: [0.5, 0.2] } });
add('Brass & Wind', 'Tuba', 'a deep tuba: a dark saw and a square an octave below, a slow, round attack',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db20', fcut: 2.8, fslope: 30, fres: 3, fenv: 2 },
    A2: { lvl: 0.55, wave: 'square', wavelet: 'db8', fcut: 2.8, oct: -1 },
    g: { voices: 4, amp: [0.05, 0.5, 0.9, 0.2], mod: [0.06, 0.4, 0.6, 0.3], oct: -1, reverb: [0.5, 0.2] } });
add('Brass & Wind', 'Horn Pad', 'a pad of far horns: two saws opening slowly, soft and wide',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db20', fcut: 3.5, fslope: 24, fenv: 3.5, fine: 6 },
    A2: { lvl: 0.5, wave: 'saw', wavelet: 'db20', fcut: 3.5, fslope: 24, fenv: 3.5, fine: -6, oct: -1 },
    g: { amp: [0.5, 1, 0.9, 1.2], mod: [0.6, 1, 0.5, 1], uni: [2, 8], chorus: [0.35], reverb: [0.7, 0.35] } });

add('Brass & Wind', 'Alto Flute', 'a low, warm flute: a hollow fundamental with a little of its octave and a long, soft breath',
  { B1: { lvl: 0.7, pattern: 'mirror', wavelet: 'db20', tilt: -10, bars: [1, 0.35, 0.15], atk: 0.12, oct: -1 },
    B2: { lvl: 0.2, pattern: 'random', seed: 18, wavelet: 'db8', tilt: -1, bars: [0, 0, 0.2, 0.6, 1, 0.9], oct: 1, env: [0.06, 0.6, 0.6, 0.3] },
    g: { amp: [0.1, 0.5, 0.9, 0.3], lfo: { rate: 4.5, pitch: 5 }, reverb: [0.65, 0.3] } });
add('Brass & Wind', 'Pan Flute', 'a pan flute: a pure tone with a burst of breath in the first fraction of a second',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -12, bars: [1, 0.15], atk: 0.04 },
    B2: { lvl: 0.18, pattern: 'random', seed: 29, wavelet: 'db8', tilt: -1, bars: [0, 0, 0.3, 0.7, 1, 1, 0.8], oct: 1, env: [0.005, 0.25, 0.1, 0.15] },
    g: { amp: [0.04, 0.4, 0.9, 0.25], lfo: { rate: 4.8, pitch: 3 }, reverb: [0.7, 0.35] } });
add('Brass & Wind', 'Clarinet', 'a clarinet: only the odd bands, a woody chalumeau register an octave below',
  { B1: { lvl: 0.7, pattern: 'alt', wavelet: 'db8', tilt: -5, bars: [1, 0.05, 0.7, 0.03, 0.5, 0.02], atk: 0.04 },
    B2: { lvl: 0.25, pattern: 'alt', wavelet: 'db8', tilt: -8, bars: [1, 0.05, 0.5], oct: -1, atk: 0.05 },
    g: { voices: 8, amp: [0.03, 0.4, 0.9, 0.15], lfo: { rate: 5, pitch: 3 }, reverb: [0.5, 0.2] } });
add('Brass & Wind', 'Oboe', 'an oboe: a bright, nasal mirror voice, a hint of its octave and a lively vibrato',
  { B1: { lvl: 0.65, pattern: 'mirror', wavelet: 'sym8', tilt: -2, bars: [0.8, 1, 0.9, 0.7, 0.4, 0.2], atk: 0.03 },
    B2: { lvl: 0.2, pattern: 'ramp', wavelet: 'db8', tilt: -6, oct: 1, atk: 0.04 },
    g: { amp: [0.03, 0.4, 0.9, 0.12], lfo: { rate: 5.5, pitch: 6 }, reverb: [0.5, 0.2] } });
add('Brass & Wind', 'Recorder', 'a recorder: a clear, slightly airy tone that blows in quickly',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -11, bars: [1, 0.25, 0.08], atk: 0.03, oct: 1 },
    B2: { lvl: 0.15, pattern: 'random', seed: 8, wavelet: 'db8', tilt: -1, bars: [0, 0, 0.2, 0.6, 1, 1, 0.7], oct: 2, env: [0.002, 0.2, 0.2, 0.1] },
    g: { amp: [0.02, 0.4, 0.9, 0.15], lfo: { rate: 5, pitch: 3 }, reverb: [0.5, 0.2] } });

add('Brass & Wind', 'Saxophone', 'a tenor sax: a saw with a growl and a reedy mirror voice, a breath of air at each note',
  { A1: { lvl: 0.55, wave: 'saw', wavelet: 'db8', fcut: 4.5, fres: 5, fenv: 2.5 },
    B1: { lvl: 0.5, pattern: 'mirror', wavelet: 'db8', tilt: -4, bars: [1, 0.8, 0.9, 0.6, 0.4, 0.2], atk: 0.03 },
    g: { voices: 1, porta: 'legato', glide: 0.03, amp: [0.02, 0.4, 0.9, 0.12], mod: [0.02, 0.3, 0.6, 0.2], lfo: { rate: 5.2, pitch: 6 }, drive: 0.15, reverb: [0.5, 0.2] } });
add('Brass & Wind', 'Harmonica', 'a blues harmonica: a reedy pulse and bright mirror atoms, a quick wobble in the pitch',
  { A1: { lvl: 0.5, wave: 'pulse', width: 0.3, wavelet: 'db4', fcut: 6.5, fres: 3 },
    B1: { lvl: 0.5, pattern: 'mirror', wavelet: 'db4', tilt: -3, bars: [0.8, 1, 0.9, 0.7, 0.5, 0.3], atk: 0.03 },
    g: { voices: 4, amp: [0.015, 0.4, 0.9, 0.1], lfo: { rate: 6.5, pitch: 5 }, drive: 0.25, reverb: [0.4, 0.15] } });
add('Brass & Wind', 'Wind Ensemble', 'flutes, clarinets and oboes together: a saw and soft mirror atoms with an airy attack',
  { A1: { lvl: 0.4, wave: 'tri', wavelet: 'db20', fcut: 6.5 },
    B1: { lvl: 0.55, pattern: 'mirror', wavelet: 'sym8', tilt: -5, bars: [1, 0.7, 0.8, 0.5, 0.3, 0.1], atk: 0.12 },
    g: { amp: [0.1, 0.5, 0.9, 0.35], uni: [3, 9], lfo: { rate: 5, pitch: 3 }, chorus: [0.4], reverb: [0.7, 0.35] } });
add('Brass & Wind', 'Accordion', 'an accordion: a pair of detuned reeds, a saw with a pulse, a wet musette tremolo',
  { A1: { lvl: 0.5, wave: 'saw', wavelet: 'db4', fcut: 6, fres: 2, fine: 12 },
    B1: { lvl: 0.45, pattern: 'alt', wavelet: 'db4', tilt: -3, bars: [1, 0.3, 0.8, 0.2, 0.6, 0.1], fine: -12, atk: 0.02 },
    g: { amp: [0.02, 0.3, 1, 0.08], lfo: { rate: 6, pitch: 5, cut: 0.3 }, chorus: [0.6, 0.8, 0.5], reverb: [0.4, 0.15] } });

module.exports = out;
