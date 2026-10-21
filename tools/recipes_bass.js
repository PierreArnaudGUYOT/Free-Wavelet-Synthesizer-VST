// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: Bass (18). See tools/preset_dsl.js for the language.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));
// the hit at the start of a plucked or struck note: a short filtered noise burst
// A noise source is one short cycle repeated at the note's pitch and band-limited: the sound only has harmonics up to the Nyquist
// frequency. To get dense, noise-like high frequencies the noise is played low (oct -2 or -3) and the filter takes its high bands.
const tick = (lvl, o = {}) => ({ lvl, wave: 'noise', wavelet: 'db4', ftype: 'hp', fcut: 6.5, env: [0.001, 0.02, 0, 0.03], oct: -3, ...o });
const mono = { voices: 1, porta: 'legato', glide: 0.04 };

add('Bass', 'Deep Saw Bass', 'a resonant saw with a square one octave down: deep, round, with a filter snap',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 3, fslope: 30, fres: 5, fenv: 3, fvel: 1.5 },
    A2: { lvl: 0.6, wave: 'square', wavelet: 'db4', fcut: 3, fslope: 30, oct: -1 },
    g: { ...mono, amp: [0.002, 0.6, 0.9, 0.1], mod: [0.001, 0.3, 0.15, 0.2], oct: -1 } });
add('Bass', 'Pick Bass', 'a finger-picked electric bass: a saw with a short filter snap and a noisy pick at the start',
  { A1: { lvl: 0.75, wave: 'saw', wavelet: 'db8', fcut: 3.2, fslope: 30, fres: 3, fenv: 4, fvel: 2 },
    A2: tick(0.8, { fcut: 7 }),
    g: { voices: 1, porta: 'legato', glide: 0.02, amp: [0.001, 0.7, 0.55, 0.12, 0.7], mod: [0.001, 0.18, 0.1, 0.15], oct: -1, sub: [0.25, 0, 0] } });
add('Bass', 'Rubber Bass', 'a bouncy pulse bass: a narrow pulse and a saw, a resonant filter with a fast envelope',
  { A1: { lvl: 0.6, wave: 'pulse', width: 0.3, wavelet: 'db4', fcut: 3, fslope: 36, fres: 8, fenv: 5 },
    A2: { lvl: 0.5, wave: 'saw', wavelet: 'db4', fcut: 3, fslope: 36, fres: 6, fenv: 4, fine: 7, oct: -1 },
    g: { ...mono, amp: [0.002, 0.45, 0.6, 0.08], mod: [0.001, 0.22, 0.05, 0.15], oct: -1 } });
add('Bass', 'Sub Drop', 'an 808-style sub: a sine that falls from a high pitch in a few milliseconds, with a click',
  { A1: { lvl: 0.8, wave: 'sine', wavelet: 'db20', penv: [12, 0.05] },
    A2: { lvl: 0.3, wave: 'sine', wavelet: 'db20', oct: 1, penv: [24, 0.03], env: [0.001, 0.05, 0, 0.05] },
    g: { voices: 1, amp: [0.001, 1.6, 0.6, 0.25], oct: -1, drive: 0.2 }, win: 0.1 });
add('Bass', 'Reese Duo', 'two saws detuned against each other: the classic beating bass, slowly breathing',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'sym8', fcut: 4, fres: 3, fine: -14 },
    A2: { lvl: 0.6, wave: 'saw', wavelet: 'sym8', fcut: 4, fres: 3, fine: 14 },
    g: { voices: 1, amp: [0.01, 0.5, 0.95, 0.15], lfo: { rate: 0.4, cut: 0.8 }, chorus: [0.3, 0.4, 0.6], oct: -1, sub: [0.3, 0, 0] } });
add('Bass', 'Wobble Bass', 'a saw and a square one octave down, the cutoff shaken by the LFO: a dub wobble',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 3.5, fslope: 36, fres: 9 },
    A2: { lvl: 0.55, wave: 'square', wavelet: 'db4', fcut: 3.5, fslope: 36, fres: 6, oct: -1 },
    g: { voices: 1, amp: [0.003, 0.5, 0.95, 0.12], lfo: { shape: 'tri', rate: 2.2, cut: 2.6 }, oct: -1, drive: 0.25 } });
add('Bass', 'Pulse Duo Bass', 'two pulse waves of different widths: a hollow, nasal bass',
  { A1: { lvl: 0.6, wave: 'pulse', width: 0.25, wavelet: 'db4', fcut: 3.5, fres: 4, fenv: 2.5 },
    A2: { lvl: 0.55, wave: 'pulse', width: 0.5, wavelet: 'db4', fcut: 3.2, fres: 3, fenv: 2, fine: 6, oct: -1 },
    g: { ...mono, amp: [0.002, 0.5, 0.8, 0.1], mod: [0.001, 0.25, 0.15, 0.2], oct: -1 } });
add('Bass', 'Acid Duo', 'a 303-like line: a very resonant saw snapping open, a clean square one octave below',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db4', fcut: 2, fslope: 36, fres: 16, fenv: 6, fvel: 2 },
    A2: { lvl: 0.4, wave: 'square', wavelet: 'db4', fcut: 3, oct: -1 },
    g: { voices: 1, porta: 'legato', glide: 0.06, amp: [0.002, 0.3, 0.7, 0.08], mod: [0.001, 0.18, 0, 0.12], oct: -1, drive: 0.4, delay: [0.25, 0.3, 0.12] } });
add('Bass', 'Sync Bass', 'a saw whose position window sweeps its cycle, like hard sync, over a sine sub',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 5, fres: 3, pdep: 1, pwid: 0.25, pcen: 0.3 },
    A2: { lvl: 0.55, wave: 'sine', wavelet: 'db20', oct: -1 },
    g: { ...mono, amp: [0.002, 0.5, 0.9, 0.1], lfo: { rate: 3.5, pos: 0.4 }, oct: -1 } });
add('Bass', 'Thump Bass', 'an electric bass with a thump: a saw and a sine whose pitch drops a fifth in a blink',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 3, fslope: 30, fres: 2, fenv: 2.5 },
    A2: { lvl: 0.5, wave: 'sine', wavelet: 'db20', penv: [7, 0.025], env: [0.001, 0.2, 0.3, 0.1] },
    g: { ...mono, amp: [0.001, 0.6, 0.7, 0.1], mod: [0.001, 0.2, 0.1, 0.15], oct: -1 } });

add('Bass', 'Drawbar Bass', 'an organ-like bass: the four lowest bands on one voice, a sine-like voice an octave below',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -4, bars: [1, 0.9, 0.4, 0.2], body: 0.6, bright: 0.08, sus: 0.4 },
    B2: { lvl: 0.6, pattern: 'ramp', wavelet: 'db20', tilt: -10, bars: [1, 0.1], oct: -1 },
    g: { amp: [0.002, 0.7, 0.7, 0.08], voices: 1, oct: -1 } });
add('Bass', 'Pedal Bass', 'a church-organ pedal: deep fundamentals with a soft click on each key',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -6, bars: [1, 0.5, 0.3], oct: -1 },
    B2: { lvl: 0.2, pattern: 'impulse', wavelet: 'db8', tilt: -2, bars: [0, 0.2, 0.7, 1, 0.8], env: [0.001, 0.03, 0, 0.03], oct: 1 },
    g: { amp: [0.01, 0.2, 1, 0.12], voices: 8, oct: -1, reverb: [0.7, 0.2] } });
add('Bass', 'Walsh Bass', 'a stepped bass from Walsh atoms, with a mirror voice an octave below',
  { B1: { lvl: 0.65, pattern: 'walsh', wavelet: 'haar', tilt: -4, bars: [1, 0.7, 0.5, 0.3, 0.2], body: 0.8, bright: 0.12, sus: 0.5 },
    B2: { lvl: 0.6, pattern: 'mirror', wavelet: 'db8', tilt: -7, bars: [1, 0.4], oct: -1 },
    g: { ...mono, amp: [0.002, 0.6, 0.8, 0.1], oct: -1, drive: 0.2 } });
add('Bass', 'Pluck Bass', 'a plucked bass: impulse atoms whose bright bands die quickly, with a soft sine below',
  { B1: { lvl: 0.7, pattern: 'impulse', wavelet: 'sym8', tilt: -6, bars: [1, 0.9, 0.7, 0.5, 0.3], body: 0.5, bright: 0.05, sus: 0.3 },
    B2: { lvl: 0.5, pattern: 'ramp', wavelet: 'db20', tilt: -10, bars: [1], oct: -1, env: [0.002, 0.5, 0.4, 0.1] },
    g: { amp: [0.001, 0.9, 0.3, 0.1], voices: 1, oct: -1 } });
add('Bass', 'Sub Bell Bass', 'a deep sine bass with a bell partial that rings and fades on each note',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -12, bars: [1, 0.15], body: 1.2, bright: 1.2, sus: 0.7 },
    B2: { lvl: 0.3, pattern: 'random', seed: 44, wavelet: 'db8', tilt: -3, bars: [0, 0.2, 0.6, 1, 0.9, 0.5], oct: 1, env: [0.001, 0.6, 0, 0.3] },
    g: { amp: [0.002, 1, 0.8, 0.15], voices: 1, oct: -1, reverb: [0.6, 0.15] } });

add('Bass', 'Round Bass', 'a triangle bass with a warm mirror voice: round and friendly, for slow lines',
  { A1: { lvl: 0.6, wave: 'tri', wavelet: 'db8', fcut: 3.5, fres: 2, fenv: 2 },
    B1: { lvl: 0.5, pattern: 'mirror', wavelet: 'db20', tilt: -8, bars: [1, 0.3], body: 2, bright: 0.5, sus: 0.6 },
    g: { ...mono, amp: [0.004, 0.6, 0.85, 0.15], mod: [0.002, 0.25, 0.2, 0.2], oct: -1 } });
add('Bass', 'Growl Bass', 'a resonant saw and bright Walsh atoms, driven, with the LFO on the cutoff',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'haar', fcut: 3, fslope: 36, fres: 10 },
    B1: { lvl: 0.35, pattern: 'walsh', wavelet: 'haar', tilt: -2, bars: [0.3, 0.5, 0.8, 1, 0.8], fcut: 6 },
    g: { voices: 1, amp: [0.003, 0.5, 0.9, 0.1], lfo: { rate: 2, cut: 2 }, oct: -1, drive: 0.5, sub: [0.35, 0, 0] } });
add('Bass', 'Fretless', 'a singing fretless line: a saw and a mirror voice gliding between notes with a slow vibrato',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db20', fcut: 4, fres: 2, fenv: 1.5 },
    B1: { lvl: 0.4, pattern: 'mirror', wavelet: 'db20', tilt: -7, bars: [1, 0.6, 0.5], atk: 0.02 },
    g: { voices: 1, porta: 'legato', glide: 0.07, amp: [0.01, 0.8, 0.85, 0.2], mod: [0.005, 0.3, 0.3, 0.3], lfo: { rate: 4.5, pitch: 8 }, oct: -1, chorus: [0.2] } });

module.exports = out;
