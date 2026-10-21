// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: Drums & Perc (12). Every key is a pitched hit (play low notes for the drums); the sounds are one-shots (sustain 0).
// A decay time is the time to fall by 60 dB. A noise source is a short cycle repeated at the note's pitch: for a hat it is played
// three octaves up (about 2 kHz, only its first harmonics fit below the Nyquist frequency), so its filter cutoffs are low bands.
// See tools/preset_dsl.js for the language.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));
const hit = { voices: 8, uni: [1, 0] };

add('Drums & Perc', 'Kick', 'a deep kick: a sine that falls from high to low in a blink, a short click on top',
  { A1: { lvl: 0.85, wave: 'sine', wavelet: 'db20', penv: [30, 0.045] },
    A2: { lvl: 0.8, wave: 'noise', wavelet: 'db4', ftype: 'hp', fcut: 6.5, oct: -3, env: [0.001, 0.02, 0, 0.02] },
    g: { ...hit, amp: [0.001, 0.45, 0, 0.1, 0.5], oct: -2, drive: 0.3 } });
add('Drums & Perc', 'Snare', 'a snare: a tone that falls a little and a bright burst of noise with a short tail',
  { A1: { lvl: 0.6, wave: 'tri', wavelet: 'db8', fcut: 8, penv: [7, 0.03], env: [0.001, 0.14, 0, 0.08] },
    A2: { lvl: 1, wave: 'noise', wavelet: 'db4', ftype: 'bp', fcut: 7.5, fres: 1.5, oct: -2, env: [0.001, 0.28, 0, 0.1] },
    g: { ...hit, amp: [0.001, 0.3, 0, 0.1, 0.5], oct: -1, drive: 0.3, reverb: [0.4, 0.15] } });
add('Drums & Perc', 'Closed Hat', 'a closed hi-hat: bright, metallic noise and a thin pulse, a tight chick',
  { A1: { lvl: 1, wave: 'noise', wavelet: 'haar', ftype: 'hp', fcut: 8, fslope: 36, oct: -3, env: [0.001, 0.22, 0, 0.05] },
    A2: { lvl: 0.4, wave: 'pulse', width: 0.2, wavelet: 'haar', ftype: 'hp', fcut: 2.5, fslope: 36, oct: 3, semi: 5, fine: 20, env: [0.001, 0.18, 0, 0.05] },
    g: { ...hit, amp: [0.001, 0.25, 0, 0.06, 0.5], drive: 0.35, reverb: [0.3, 0.1] } });
add('Drums & Perc', 'Open Hat', 'an open hi-hat: the same shimmer, left to ring for most of a second',
  { A1: { lvl: 1, wave: 'noise', wavelet: 'haar', ftype: 'hp', fcut: 8, fslope: 36, oct: -3, env: [0.001, 0.9, 0, 0.15] },
    A2: { lvl: 0.4, wave: 'pulse', width: 0.2, wavelet: 'haar', ftype: 'hp', fcut: 2.5, fslope: 36, oct: 3, semi: 5, fine: 20, env: [0.001, 0.7, 0, 0.12] },
    g: { ...hit, amp: [0.001, 0.9, 0, 0.15, 0.5], drive: 0.35, reverb: [0.4, 0.15] } });
add('Drums & Perc', 'Clap', 'a handclap: band-passed noise with a slightly slower attack and a roomy tail',
  { A1: { lvl: 1, wave: 'noise', wavelet: 'db4', ftype: 'hp', fcut: 5, fslope: 18, oct: -3, env: [0.006, 0.3, 0, 0.1] },
    A2: { lvl: 0.7, wave: 'noise', wavelet: 'db8', ftype: 'bp', fcut: 7.5, fres: 1.5, oct: -3, env: [0.012, 0.4, 0, 0.1] },
    g: { ...hit, amp: [0.002, 0.4, 0, 0.12, 0.5], drive: 0.3, reverb: [0.65, 0.35] } });

add('Drums & Perc', 'Wood Block', 'a wood block: a hollow knock, a quick ring an octave up',
  { B1: { lvl: 1, pattern: 'mirror', wavelet: 'db8', tilt: -3, bars: [1, 0.8, 0.5, 0.2], body: 0.2, bright: 0.07, sus: 0, oct: 1 },
    B2: { lvl: 0.6, pattern: 'impulse', wavelet: 'db4', tilt: -1, bars: [0, 0.3, 1, 0.8], oct: 2, env: [0.001, 0.09, 0, 0.06] },
    g: { ...hit, amp: [0.001, 0.2, 0, 0.06, 0.5], drive: 0.25, reverb: [0.35, 0.12] } });
add('Drums & Perc', 'Claves', 'claves: two hard, bright sticks, a very short, clear tone',
  { B1: { lvl: 1, pattern: 'ramp', wavelet: 'db8', tilt: -3, bars: [1, 0.4, 0.8, 0.3], body: 0.15, bright: 0.05, sus: 0, oct: 2 },
    B2: { lvl: 0.6, pattern: 'impulse', wavelet: 'db4', tilt: 0, bars: [0, 0, 0.7, 1, 0.6], oct: 3, env: [0.001, 0.07, 0, 0.05] },
    g: { ...hit, amp: [0.001, 0.15, 0, 0.05, 0.5], drive: 0.25, reverb: [0.3, 0.1] } });
add('Drums & Perc', 'Conga', 'a conga: a round open tone with a slap, the pitch settling down as it rings',
  { B1: { lvl: 0.9, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.6, 0.3, 0.15], body: 0.4, bright: 0.1, sus: 0, penv: [3, 0.05], oct: 1 },
    B2: { lvl: 0.6, pattern: 'random', seed: 6, wavelet: 'db8', tilt: -2, bars: [0, 0.3, 0.8, 1, 0.6], oct: 2, env: [0.001, 0.07, 0, 0.05] },
    g: { ...hit, amp: [0.001, 0.45, 0, 0.12, 0.5], drive: 0.2, reverb: [0.4, 0.15] } });
add('Drums & Perc', 'Cowbell', 'a cowbell: two clanking partials, a hard strike and a short metallic ring',
  { B1: { lvl: 0.9, pattern: 'walsh', wavelet: 'haar', tilt: -2, bars: [1, 0.7, 0.8, 0.5, 0.3], body: 0.3, bright: 0.1, sus: 0, oct: 1 },
    B2: { lvl: 0.7, pattern: 'alt', wavelet: 'haar', tilt: -1, bars: [1, 0.3, 0.9, 0.2], oct: 1, semi: 7, fine: 30, env: [0.001, 0.22, 0, 0.1] },
    g: { ...hit, amp: [0.001, 0.35, 0, 0.1, 0.5], drive: 0.2, reverb: [0.3, 0.1] } });

add('Drums & Perc', 'Tom', 'a tom: a round sine with a falling pitch and mirror atoms for the skin',
  { A1: { lvl: 0.75, wave: 'sine', wavelet: 'db20', penv: [12, 0.06] },
    B1: { lvl: 0.5, pattern: 'mirror', wavelet: 'db20', tilt: -6, bars: [1, 0.5, 0.3], body: 0.25, bright: 0.06, sus: 0, penv: [8, 0.05] },
    g: { ...hit, amp: [0.001, 0.55, 0, 0.12, 0.5], oct: -1, drive: 0.2, reverb: [0.45, 0.18] } });
add('Drums & Perc', 'Rim Shot', 'a rim shot: a sharp knock with a bright crack, dry and quick',
  { A1: { lvl: 0.6, wave: 'tri', wavelet: 'db8', fcut: 9, penv: [9, 0.015], env: [0.001, 0.1, 0, 0.05] },
    B1: { lvl: 0.8, pattern: 'impulse', wavelet: 'haar', tilt: -1, bars: [0, 0.3, 0.8, 1, 0.9, 0.6], body: 0.12, bright: 0.04, sus: 0, oct: 1 },
    g: { ...hit, amp: [0.001, 0.14, 0, 0.05, 0.5], drive: 0.3, reverb: [0.35, 0.12] } });
add('Drums & Perc', 'Tambourine', 'a tambourine: jingles of noise and metallic atoms, shaken and fading',
  { A1: { lvl: 0.9, wave: 'noise', wavelet: 'haar', ftype: 'hp', fcut: 8.5, fslope: 36, oct: -3, env: [0.004, 0.4, 0, 0.1] },
    B1: { lvl: 0.8, pattern: 'random', seed: 52, wavelet: 'haar', tilt: 0, bars: [0, 0.3, 0.8, 1, 1, 0.9, 0.7], body: 0.4, bright: 0.12, sus: 0, oct: 2 },
    g: { ...hit, amp: [0.003, 0.45, 0, 0.12, 0.5], drive: 0.3, reverb: [0.4, 0.15] } });

module.exports = out;
