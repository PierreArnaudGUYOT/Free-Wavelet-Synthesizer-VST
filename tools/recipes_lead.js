// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: Lead (22). See tools/preset_dsl.js for the language.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));
const solo = { voices: 1, porta: 'legato', glide: 0.05 };

add('Lead', 'Classic Saw Lead', 'two slightly detuned saws, a filter snap on every note, vibrato and a short echo',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 5.5, fres: 4, fenv: 2, fine: 5 },
    A2: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 5.5, fres: 4, fenv: 2, fine: -5 },
    g: { ...solo, amp: [0.005, 0.5, 0.85, 0.15], mod: [0.002, 0.4, 0.4, 0.3], lfo: { rate: 5.5, pitch: 6 }, delay: [0.32, 0.3, 0.14], reverb: [0.5, 0.15] } });
add('Lead', 'Octave Square Lead', 'a hollow square with another an octave above: a clear, penetrating lead',
  { A1: { lvl: 0.7, wave: 'square', wavelet: 'db4', fcut: 6, fres: 5, fenv: 1.5 },
    A2: { lvl: 0.35, wave: 'square', wavelet: 'db4', fcut: 6, oct: 1, fine: 4 },
    g: { ...solo, amp: [0.004, 0.5, 0.9, 0.12], mod: [0.002, 0.3, 0.5, 0.2], lfo: { rate: 5.8, pitch: 5 }, delay: [0.3, 0.3, 0.12], reverb: [0.45, 0.15] } });
add('Lead', 'Pulse Duo Lead', 'two pulse waves, one narrow and one wide: a nasal, chiptune-like lead with echoes',
  { A1: { lvl: 0.6, wave: 'pulse', width: 0.25, wavelet: 'db4', fcut: 6.5, fres: 3 },
    A2: { lvl: 0.55, wave: 'pulse', width: 0.45, wavelet: 'db4', fcut: 6.5, fine: 7 },
    g: { ...solo, amp: [0.003, 0.5, 0.9, 0.1], lfo: { rate: 6, pitch: 7 }, delay: [0.28, 0.4, 0.2] } });
add('Lead', 'Screamer', 'a very resonant saw doubled an octave up, hard-driven: for solos',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 6, fslope: 30, fres: 14, fenv: 3, fine: 6 },
    A2: { lvl: 0.4, wave: 'saw', wavelet: 'db8', fcut: 6.5, fres: 8, oct: 1, fine: -8 },
    g: { ...solo, amp: [0.004, 0.5, 0.9, 0.15], mod: [0.002, 0.4, 0.5, 0.3], drive: 0.6, delay: [0.3, 0.3, 0.14], reverb: [0.5, 0.15] } });
add('Lead', 'Sync Sweep Lead', 'a saw with a moving position window and a square below: the sound of hard sync',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db4', fcut: 7, pdep: 1, pwid: 0.3, pcen: 0.5 },
    A2: { lvl: 0.4, wave: 'square', wavelet: 'db4', fcut: 5, oct: -1 },
    g: { ...solo, amp: [0.003, 0.5, 0.9, 0.12], lfo: { rate: 3, pos: 0.3 }, delay: [0.3, 0.3, 0.15], reverb: [0.5, 0.15] } });
add('Lead', 'Whistle Lead', 'a pure whistling sine with a breath of air, vibrato that opens after the attack',
  { A1: { lvl: 0.75, wave: 'sine', wavelet: 'db20', oct: 1 },
    A2: { lvl: 0.3, wave: 'noise', wavelet: 'db4', ftype: 'bp', fcut: 7.5, fres: 3, oct: -2 },
    g: { ...solo, amp: [0.03, 0.4, 0.95, 0.25], lfo: { rate: 5.5, pitch: 10 }, delay: [0.35, 0.3, 0.18], reverb: [0.6, 0.25] } });
add('Lead', 'Talk Lead', 'a band-pass saw moved by the LFO, with a bright saw above: a talking "wah" lead',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', ftype: 'bp', fcut: 5, fres: 10 },
    A2: { lvl: 0.35, wave: 'saw', wavelet: 'db8', fcut: 7, oct: 1, fine: 6 },
    g: { ...solo, amp: [0.004, 0.5, 0.9, 0.15], lfo: { rate: 3.2, cut: 2.2 }, drive: 0.2, delay: [0.3, 0.3, 0.14] } });
add('Lead', 'Fifth Lead', 'a saw with another a fifth above: a power-chord lead that sings in two voices',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db8', fcut: 5.5, fres: 3, fenv: 2 },
    A2: { lvl: 0.5, wave: 'saw', wavelet: 'db8', fcut: 5.5, fres: 3, fenv: 2, semi: 7, fine: 4 },
    g: { ...solo, amp: [0.005, 0.5, 0.9, 0.15], mod: [0.002, 0.4, 0.5, 0.3], lfo: { rate: 5.5, pitch: 5 }, drive: 0.3, delay: [0.3, 0.3, 0.14], reverb: [0.5, 0.15] } });

add('Lead', 'Flute Duo Lead', 'a breathy flute: almost only the fundamental, with a fainter voice above and a slow vibrato',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -8, bars: [1, 0.3, 0.1], atk: 0.06 },
    B2: { lvl: 0.2, pattern: 'ramp', wavelet: 'db20', tilt: -9, bars: [1, 0.1], oct: 1, fine: 5, atk: 0.1 },
    g: { ...solo, amp: [0.05, 0.4, 0.9, 0.2], lfo: { rate: 5, pitch: 5 }, reverb: [0.6, 0.3] } });
add('Lead', 'Walsh Chip Lead', 'an 8-bit console lead: stepped Walsh atoms doubled an octave up, with vibrato and echoes',
  { B1: { lvl: 0.65, pattern: 'walsh', wavelet: 'haar', tilt: -2 },
    B2: { lvl: 0.3, pattern: 'walsh', wavelet: 'haar', tilt: -3, oct: 1, fine: 12 },
    g: { ...solo, amp: [0.002, 0.4, 0.9, 0.1], lfo: { rate: 6, pitch: 8 }, delay: [0.25, 0.35, 0.2] } });
add('Lead', 'Clarinet Lead', 'a woody, hollow tone from alternating atoms, with a quiet voice an octave below',
  { B1: { lvl: 0.7, pattern: 'alt', wavelet: 'db8', tilt: -5, bars: [1, 0.1, 0.7, 0.05, 0.5, 0.05], atk: 0.04 },
    B2: { lvl: 0.25, pattern: 'ramp', wavelet: 'db20', tilt: -10, bars: [1, 0.2], oct: -1, atk: 0.06 },
    g: { ...solo, amp: [0.03, 0.4, 0.9, 0.15], lfo: { rate: 5, pitch: 4 }, reverb: [0.5, 0.2] } });
add('Lead', 'Reed Lead', 'a reedy, bright mirror voice with a ramp voice below: an oboe-like lead',
  { B1: { lvl: 0.65, pattern: 'mirror', wavelet: 'sym8', tilt: -3, bars: [1, 0.8, 0.7, 0.6, 0.4, 0.2], atk: 0.04 },
    B2: { lvl: 0.3, pattern: 'ramp', wavelet: 'db8', tilt: -8, oct: -1, atk: 0.05 },
    g: { ...solo, amp: [0.02, 0.4, 0.9, 0.15], lfo: { rate: 5.2, pitch: 5 }, reverb: [0.5, 0.2] } });
add('Lead', 'Glass Lead', 'a smooth random-atom lead with a sparkle that rings at the start of each note',
  { B1: { lvl: 0.65, pattern: 'random', seed: 14, wavelet: 'db20', tilt: -5, bars: [1, 0.8, 0.7, 0.5, 0.3, 0.2] },
    B2: { lvl: 0.3, pattern: 'impulse', wavelet: 'sym8', tilt: -2, bars: [0, 0.2, 0.6, 1, 0.9, 0.6], oct: 1, env: [0.001, 0.4, 0, 0.3] },
    g: { ...solo, amp: [0.004, 0.5, 0.9, 0.2], lfo: { rate: 5.5, pitch: 5 }, delay: [0.33, 0.35, 0.18], reverb: [0.6, 0.25] } });
add('Lead', 'Vox Lead', 'a vowel-like lead: mirror atoms shaped like a formant, a soft breath of random atoms above',
  { B1: { lvl: 0.7, pattern: 'mirror', wavelet: 'db20', tilt: -4, bars: [1, 0.4, 0.9, 0.8, 0.3, 0.1], atk: 0.05 },
    B2: { lvl: 0.12, pattern: 'random', seed: 21, wavelet: 'db8', tilt: -1, bars: [0, 0, 0.3, 0.7, 1, 1, 0.8], oct: 1, env: [0.04, 0.5, 0.7, 0.2] },
    g: { ...solo, amp: [0.02, 0.4, 0.9, 0.2], lfo: { rate: 5.2, pitch: 7 }, uni: [2, 6], reverb: [0.6, 0.25] } });
add('Lead', 'Digital Sine Lead', 'a clean digital lead: a sine-like fundamental and a ghost of upper bands that fade away',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -12, bars: [1, 0.2] },
    B2: { lvl: 0.35, pattern: 'ramp', wavelet: 'db4', tilt: -4, bars: [0.4, 0.8, 1, 0.6], oct: 1, env: [0.001, 0.3, 0.1, 0.2] },
    g: { ...solo, amp: [0.005, 0.5, 0.95, 0.2], lfo: { rate: 6, pitch: 4 }, delay: [0.3, 0.4, 0.2], reverb: [0.5, 0.2] } });

add('Lead', 'Duo Lead', 'a saw and mirror atoms together, slightly detuned: a lead with two colours',
  { A1: { lvl: 0.55, wave: 'saw', wavelet: 'sym8', fcut: 7, fres: 4 },
    B1: { lvl: 0.5, pattern: 'mirror', wavelet: 'sym8', tilt: -5, fine: 7 },
    g: { ...solo, amp: [0.004, 0.5, 0.9, 0.15], lfo: { rate: 5, pitch: 5 }, uni: [2, 7], delay: [0.3, 0.3, 0.16], reverb: [0.5, 0.2] } });
add('Lead', 'Brass Lead', 'a brassy lead: a saw swelling open, ramp atoms underneath',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db8', fcut: 3.5, fres: 5, fenv: 4 },
    B1: { lvl: 0.3, pattern: 'ramp', wavelet: 'db8', tilt: -5 },
    g: { ...solo, amp: [0.02, 0.5, 0.9, 0.15], mod: [0.05, 0.4, 0.6, 0.3], uni: [2, 9], reverb: [0.5, 0.2] } });
add('Lead', 'Hollow Lead', 'a square with alternating atoms: a hollow, woody, slightly nasal lead',
  { A1: { lvl: 0.6, wave: 'square', wavelet: 'db8', fcut: 6, fres: 5 },
    B1: { lvl: 0.4, pattern: 'alt', wavelet: 'db8', tilt: -5, bars: [1, 0.2, 0.8, 0.1, 0.6] },
    g: { ...solo, amp: [0.01, 0.5, 0.9, 0.15], lfo: { rate: 5.5, pitch: 5 }, delay: [0.3, 0.3, 0.14], reverb: [0.5, 0.2] } });
add('Lead', 'Pipe Lead', 'a triangle and Walsh atoms: a thin, pipe-like lead, bright and a bit digital',
  { A1: { lvl: 0.6, wave: 'tri', wavelet: 'db8', fcut: 8 },
    B1: { lvl: 0.35, pattern: 'walsh', wavelet: 'db4', tilt: -4, bars: [0.8, 0.9, 0.7, 0.5, 0.3] },
    g: { ...solo, amp: [0.01, 0.5, 0.9, 0.12], lfo: { rate: 5.5, pitch: 5 }, delay: [0.3, 0.3, 0.15], reverb: [0.5, 0.2] } });
add('Lead', 'Cry Lead', 'a resonant saw that cries: random atoms add a rough edge, the vibrato deepens with the note',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db4', fcut: 5, fres: 11, fenv: 3 },
    B1: { lvl: 0.35, pattern: 'random', seed: 37, wavelet: 'db4', tilt: -3, bars: [0.6, 0.8, 1, 0.8, 0.6, 0.3] },
    g: { ...solo, amp: [0.005, 0.5, 0.9, 0.2], mod: [0.002, 0.4, 0.5, 0.3], lfo: { rate: 5.5, pitch: 9 }, drive: 0.3, delay: [0.3, 0.3, 0.15] } });
add('Lead', 'Soft Lead', 'a round, soft lead: a triangle with a ramp-atom voice, for slow melodies',
  { A1: { lvl: 0.6, wave: 'tri', wavelet: 'db20', fcut: 7 },
    B1: { lvl: 0.35, pattern: 'ramp', wavelet: 'db20', tilt: -8, bars: [1, 0.5, 0.3] },
    g: { ...solo, glide: 0.08, amp: [0.04, 0.5, 0.95, 0.3], lfo: { rate: 5, pitch: 5 }, delay: [0.38, 0.3, 0.18], reverb: [0.7, 0.3] } });
add('Lead', 'Gliding Synth', 'a pulse and mirror atoms that glide a long way between notes: a swooping lead',
  { A1: { lvl: 0.55, wave: 'pulse', width: 0.35, wavelet: 'db4', fcut: 6, fres: 4 },
    B1: { lvl: 0.45, pattern: 'mirror', wavelet: 'db8', tilt: -5 },
    g: { voices: 1, porta: 'legato', glide: 0.2, amp: [0.01, 0.5, 0.9, 0.2], lfo: { rate: 5.5, pitch: 6 }, uni: [2, 8], delay: [0.33, 0.3, 0.16], reverb: [0.5, 0.2] } });

module.exports = out;
