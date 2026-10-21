// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: Bells & Mallets (18). See tools/preset_dsl.js for the language.
// A bell is a few sine-like partials that are not harmonics (ratios 1, 2.4, 2.8, 3.9 ...), the high ones dying first:
// two oscillators tuned to such a ratio (the second's octave, semitones and cents) with different own envelopes.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));
const noteLong = { amp: null };

add('Bells & Mallets', 'FM Bell', 'a bright digital bell: a sine and a second sine at a ratio of 2.4 that fades first',
  { A1: { lvl: 0.7, wave: 'sine', wavelet: 'db20', env: [0.001, 3.5, 0, 1.5] },
    A2: { lvl: 0.45, wave: 'sine', wavelet: 'db20', oct: 1, semi: 3, fine: 20, env: [0.001, 1.2, 0, 0.8] },
    g: { amp: [0.001, 4, 0, 1.5, 0.6], delay: [0.4, 0.3, 0.12], reverb: [0.7, 0.3] } });
add('Bells & Mallets', 'Tubular Bell', 'a tubular bell: a deep strike with a ringing partial at 2.76 times the pitch',
  { A1: { lvl: 0.65, wave: 'tri', wavelet: 'db20', fcut: 7, env: [0.001, 4, 0, 1.5] },
    A2: { lvl: 0.5, wave: 'sine', wavelet: 'db20', oct: 1, semi: 5, fine: 50, env: [0.001, 2.2, 0, 1.2] },
    g: { amp: [0.001, 5, 0, 1.8, 0.7], reverb: [0.8, 0.35] } });
add('Bells & Mallets', 'Glass Bell', 'a glass bell: a clear high sine and a thin, inharmonic partner that rings and dies',
  { A1: { lvl: 0.6, wave: 'sine', wavelet: 'db20', oct: 1, env: [0.001, 3, 0, 1.5] },
    A2: { lvl: 0.4, wave: 'sine', wavelet: 'db20', oct: 2, semi: -1, fine: 40, env: [0.001, 1.6, 0, 1] },
    g: { amp: [0.001, 3.4, 0, 1.5, 0.6], delay: [0.38, 0.35, 0.14], reverb: [0.8, 0.4] } });
add('Bells & Mallets', 'Crotales', 'tiny cymbals, struck: very high, with a shimmer from two almost equal partials',
  { A1: { lvl: 0.55, wave: 'sine', wavelet: 'db20', oct: 2, fine: 8, env: [0.001, 3, 0, 1.2] },
    A2: { lvl: 0.45, wave: 'sine', wavelet: 'db20', oct: 3, semi: 3, fine: 0, env: [0.001, 1.4, 0, 0.8] },
    g: { amp: [0.001, 3.2, 0, 1.2, 0.6], reverb: [0.75, 0.35] } });
add('Bells & Mallets', 'Church Bell', 'a big church bell: a low, round strike and an inharmonic voice that shivers above',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db20', fcut: 3, fres: 2, oct: -1, env: [0.001, 5, 0, 2.5] },
    A2: { lvl: 0.4, wave: 'sine', wavelet: 'db20', semi: 3, fine: 20, env: [0.001, 3, 0, 1.5] },
    g: { amp: [0.001, 6, 0, 2.5, 0.7], reverb: [0.9, 0.45] } });
add('Bells & Mallets', 'Wind Chimes', 'chimes in a breeze: random bright notes that ring out whatever you play',
  { A1: { lvl: 0.55, wave: 'tri', wavelet: 'db20', fcut: 8, oct: 2, env: [0.001, 2.5, 0, 1] },
    A2: { lvl: 0.35, wave: 'sine', wavelet: 'db20', oct: 3, semi: 2, env: [0.001, 1.6, 0, 0.8] },
    g: { amp: [0.001, 3, 0, 1, 0.5], lfo: { shape: 'sh', rate: 6, pitch: 80 }, reverb: [0.85, 0.5], delay: [0.33, 0.4, 0.2] } });

add('Bells & Mallets', 'Marimba', 'a marimba: warm wooden bars, the top partials gone in a flash',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -6, bars: [1, 0.2, 0.5, 0.1], body: 0.9, bright: 0.07, sus: 0 },
    B2: { lvl: 0.3, pattern: 'impulse', wavelet: 'db8', tilt: -3, bars: [0, 0.2, 1, 0.7], oct: 2, env: [0.001, 0.1, 0, 0.08] },
    g: { amp: [0.001, 1.1, 0, 0.3, 0.7], reverb: [0.5, 0.2] }, win: 0.1 });
add('Bells & Mallets', 'Vibraphone', 'a vibraphone with the motor on: long, pure bars and a slow tremolo',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'db20', tilt: -8, bars: [1, 0.15, 0.4, 0.05], body: 3.5, bright: 1, sus: 0 },
    B2: { lvl: 0.3, pattern: 'impulse', wavelet: 'db8', tilt: -3, bars: [0, 0.3, 1, 0.8], oct: 2, env: [0.001, 0.12, 0, 0.1] },
    g: { amp: [0.001, 3.8, 0, 1.2, 0.7], lfo: { rate: 5.5, pitch: 4, cut: 0.3 }, chorus: [0.2], reverb: [0.65, 0.3] } });
add('Bells & Mallets', 'Xylophone', 'a xylophone: dry, bright wooden bars, a hard strike',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'db8', tilt: -2, bars: [0.8, 0.5, 1, 0.6, 0.3], body: 0.45, bright: 0.05, sus: 0, oct: 1 },
    B2: { lvl: 0.5, pattern: 'impulse', wavelet: 'db4', tilt: -1, bars: [0, 0, 0.6, 1, 0.8], oct: 2, env: [0.001, 0.07, 0, 0.06] },
    g: { amp: [0.001, 0.6, 0, 0.12, 0.7], drive: 0.2, reverb: [0.4, 0.15] }, win: 0.05 });
add('Bells & Mallets', 'Glockenspiel', 'a glockenspiel: small steel bars, very bright, ringing a long time',
  { B1: { lvl: 0.6, pattern: 'ramp', wavelet: 'db20', tilt: -4, bars: [1, 0.2, 0.7, 0.3, 0.2], body: 2.5, bright: 0.5, sus: 0, oct: 2 },
    B2: { lvl: 0.25, pattern: 'random', seed: 4, wavelet: 'db8', tilt: -2, bars: [0, 0.2, 0.8, 1, 0.7], oct: 3, env: [0.001, 0.7, 0, 0.4] },
    g: { amp: [0.001, 3, 0, 1, 0.6], reverb: [0.7, 0.3] } });
add('Bells & Mallets', 'Steel Drum', 'a steel drum: a round note with a hollow, singing octave and a short body thump',
  { B1: { lvl: 0.65, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.8, 0.3, 0.15], body: 1.2, bright: 0.3, sus: 0 },
    B2: { lvl: 0.4, pattern: 'ramp', wavelet: 'db20', tilt: -7, bars: [1, 0.3], oct: 1, fine: 12, penv: [-2, 0.03], env: [0.001, 0.4, 0, 0.3] },
    g: { amp: [0.001, 1.6, 0, 0.5, 0.7], chorus: [0.2], reverb: [0.55, 0.25] } });
add('Bells & Mallets', 'Gamelan', 'a gamelan gong-chime: inharmonic random atoms, slightly flat, beating as they ring',
  { B1: { lvl: 0.6, pattern: 'random', seed: 13, wavelet: 'db8', tilt: -4, bars: [1, 0.5, 0.8, 0.7, 0.5, 0.3], body: 2.5, bright: 0.4, sus: 0, fine: 14 },
    B2: { lvl: 0.5, pattern: 'random', seed: 13, wavelet: 'db8', tilt: -4, bars: [1, 0.5, 0.8, 0.7, 0.5, 0.3], body: 2.5, bright: 0.4, sus: 0, fine: -14 },
    g: { amp: [0.001, 3.5, 0, 1, 0.7], reverb: [0.7, 0.3] } });

add('Bells & Mallets', 'Celeste Bell', 'a sweet bell: a triangle and random atoms an octave up, a soft ring',
  { A1: { lvl: 0.5, wave: 'tri', wavelet: 'db20', fcut: 7, oct: 1, env: [0.001, 2.5, 0, 1] },
    B1: { lvl: 0.45, pattern: 'random', seed: 22, wavelet: 'db20', tilt: -4, bars: [0.4, 0.7, 1, 0.8, 0.5], body: 2, bright: 0.5, sus: 0, oct: 1 },
    g: { amp: [0.001, 3, 0, 1, 0.6], delay: [0.36, 0.3, 0.14], reverb: [0.75, 0.35] } });
add('Bells & Mallets', 'Handbell', 'a handbell: a clear strike, partials at 2.4 and 3.5, a tremulous decay',
  { A1: { lvl: 0.55, wave: 'sine', wavelet: 'db20', oct: 1, env: [0.001, 2.5, 0, 1] },
    B1: { lvl: 0.4, pattern: 'random', seed: 31, wavelet: 'db8', tilt: -3, bars: [0, 0.5, 1, 0.8, 0.5], body: 1.5, bright: 0.4, sus: 0, oct: 1, fine: 15 },
    g: { amp: [0.001, 3, 0, 1, 0.6], lfo: { rate: 5, pitch: 3 }, reverb: [0.7, 0.3] } });
add('Bells & Mallets', 'Music Box II', 'a music box with a velvet bottom: a soft sine and Walsh atoms, a long, calm decay',
  { A1: { lvl: 0.45, wave: 'sine', wavelet: 'db20', oct: 1 },
    B1: { lvl: 0.5, pattern: 'walsh', wavelet: 'db20', tilt: -4, bars: [1, 0.5, 0.7, 0.4, 0.3], body: 2.2, bright: 0.35, sus: 0, oct: 1 },
    g: { amp: [0.001, 2.8, 0, 0.8, 0.6], delay: [0.3, 0.35, 0.14], reverb: [0.7, 0.3] } });
add('Bells & Mallets', 'Bell Pad', 'a pad of bells: a slow triangle and bell partials that bloom and fade, then ring on',
  { A1: { lvl: 0.5, wave: 'tri', wavelet: 'db20', fcut: 7, oct: 0 },
    B1: { lvl: 0.4, pattern: 'random', seed: 61, wavelet: 'db8', tilt: -5, bars: [0.5, 0.8, 1, 0.8, 0.5], body: 3, bright: 1.2, sus: 0.2, atk: 0.3, oct: 1 },
    g: { amp: [0.4, 2, 0.5, 2.2], uni: [2, 8], chorus: [0.4], reverb: [0.85, 0.5] } });
add('Bells & Mallets', 'Toy Bell', 'a toy bell: a square and a random top, tiny and bright, ringing briefly',
  { A1: { lvl: 0.5, wave: 'square', wavelet: 'db4', fcut: 8, oct: 2, env: [0.001, 0.8, 0, 0.4] },
    B1: { lvl: 0.35, pattern: 'random', seed: 2, wavelet: 'db4', tilt: -2, bars: [0, 0.3, 0.8, 1, 0.8], body: 0.5, bright: 0.1, sus: 0, oct: 2 },
    g: { amp: [0.001, 1, 0, 0.4, 0.7], reverb: [0.5, 0.2] }, win: 0.1 });
add('Bells & Mallets', 'Dream Bells', 'bells in a dream: soft attacks, long tails and a wide echo around them',
  { A1: { lvl: 0.45, wave: 'sine', wavelet: 'db20', oct: 1, env: [0.02, 3, 0.1, 2] },
    B1: { lvl: 0.45, pattern: 'random', seed: 17, wavelet: 'sym8', tilt: -5, bars: [0.5, 0.8, 1, 0.8, 0.5, 0.3], body: 3, bright: 1, sus: 0.1, atk: 0.05, oct: 1 },
    g: { amp: [0.03, 3.5, 0.2, 2.5, 0.6], chorus: [0.45], delay: [0.45, 0.45, 0.25], reverb: [0.9, 0.55] } });

module.exports = out;
