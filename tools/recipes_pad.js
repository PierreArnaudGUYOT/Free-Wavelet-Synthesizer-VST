// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: Pad (30) and Strings (18). See tools/preset_dsl.js for the language.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));
const air = (lvl, o = {}) => ({ lvl, wave: 'noise', wavelet: 'db4', ftype: 'bp', fcut: 7.5, fres: 3, oct: -2, ...o });   // a hiss, as a constant layer or with an own envelope (a noise played low: see tools/recipes_bass.js)

// ---------------------------------------------------------------- Pad
add('Pad', 'Velvet Pad', 'two detuned saws, soft and wide, with a slow breath in the filter',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 5, fres: 3, fine: 7 },
    A2: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 5.5, fres: 2, fine: -7 },
    g: { amp: [0.7, 1, 0.85, 1.6], uni: [2, 8], lfo: { rate: 0.3, cut: 0.6 }, chorus: [0.45, 0.6, 0.6], reverb: [0.7, 0.3], width: 0.9 } });
add('Pad', 'Dusk Saw Pad', 'a dark saw with a triangle one octave down: warm, a little sad',
  { A1: { lvl: 0.8, wave: 'saw', wavelet: 'sym8', fcut: 4, fres: 5 },
    A2: { lvl: 0.55, wave: 'tri', wavelet: 'db20', fcut: 4.5, oct: -1 },
    g: { amp: [1.1, 1, 0.9, 2.2], lfo: { rate: 0.2, cut: 0.8 }, chorus: [0.3, 0.5, 0.6], reverb: [0.85, 0.4] } });
add('Pad', 'Sunrise Pad', 'a saw whose filter opens slowly with each note, a pulse shimmer an octave above',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db20', fcut: 3.5, fenv: 3.5, fres: 2 },
    A2: { lvl: 0.3, wave: 'pulse', width: 0.4, wavelet: 'db8', fcut: 7, oct: 1, fine: 5 },
    g: { amp: [1.6, 1, 0.9, 2.5], mod: [1.4, 1, 0.7, 1.5], uni: [2, 10], chorus: [0.4, 0.5, 0.6], reverb: [0.8, 0.4] } });
add('Pad', 'Hollow Sweep Pad', 'a square pad with a resonant band-pass layer, both swept slowly by LFO 2',
  { A1: { lvl: 0.6, wave: 'square', wavelet: 'db8', fcut: 4.5, fres: 6 },
    A2: { lvl: 0.45, wave: 'saw', wavelet: 'sym8', ftype: 'bp', fcut: 5, fres: 10, oct: 1 },
    g: { amp: [0.9, 1, 0.9, 2], lfo2: { shape: 'sine', rate: 0.12, amt: 0.55, target: 'cutoff' }, uni: [2, 9], reverb: [0.8, 0.4] } });
add('Pad', 'Analog Cloud', 'pulse and saw, three unison copies: a big soft cloud',
  { A1: { lvl: 0.6, wave: 'pulse', width: 0.35, wavelet: 'db4', fcut: 5, fres: 3 },
    A2: { lvl: 0.55, wave: 'saw', wavelet: 'db4', fcut: 5.5, fine: 12 },
    g: { amp: [0.8, 1, 0.85, 1.8], uni: [3, 12], width: 1, lfo: { rate: 0.35, cut: 0.7 }, chorus: [0.6, 0.55, 0.7], reverb: [0.7, 0.3] } });
add('Pad', 'Tape Pad', 'a warm saw over a layer of tape hiss',
  { A1: { lvl: 0.75, wave: 'saw', wavelet: 'db4', fcut: 4.5, fres: 2, fine: 4 },
    A2: air(0.4),
    g: { amp: [0.6, 1, 0.9, 1.4], uni: [2, 9], lfo: { rate: 0.5, pitch: 6 }, chorus: [0.3], reverb: [0.6, 0.25] } });
add('Pad', 'Moonlight Pad', 'a triangle with a sine glow an octave above',
  { A1: { lvl: 0.8, wave: 'tri', wavelet: 'db20', fcut: 7 },
    A2: { lvl: 0.4, wave: 'sine', wavelet: 'db20', oct: 1, fine: 4 },
    g: { amp: [1.3, 1, 1, 3], uni: [2, 7], chorus: [0.5, 0.45, 0.65], reverb: [0.9, 0.5] } });
add('Pad', 'Silent Film Pad', 'a digital Haar saw, sparse and a bit glassy, over a dark saw',
  { A1: { lvl: 0.55, wave: 'saw', wavelet: 'haar', sparsity: 0.3, fcut: 6, fres: 2 },
    A2: { lvl: 0.55, wave: 'saw', wavelet: 'db8', fcut: 3.5, oct: -1 },
    g: { amp: [0.9, 1, 0.9, 2], lfo: { rate: 0.25, cut: 0.8 }, delay: [0.4, 0.3, 0.1], reverb: [0.8, 0.35] } });
add('Pad', 'Warm Octave Pad', 'a saw doubled an octave down: round and full',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 5, fres: 2, fine: 5 },
    A2: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 3.8, oct: -1, fine: -5 },
    g: { amp: [0.8, 1, 0.9, 1.7], uni: [2, 8], chorus: [0.4, 0.5, 0.6], reverb: [0.7, 0.3] } });
add('Pad', 'Slow Brass Pad', 'a slow filter swell on a saw and a narrow pulse: a pad that sounds like far horns',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db4', fcut: 3.5, fenv: 3, fres: 3 },
    A2: { lvl: 0.45, wave: 'pulse', width: 0.3, wavelet: 'db4', fcut: 4, fenv: 2.5, fine: 8 },
    g: { amp: [0.9, 1, 0.9, 1.5], mod: [0.8, 1, 0.5, 1.2], uni: [2, 10], reverb: [0.7, 0.3], chorus: [0.3] } });

add('Pad', 'Crystal Choir', 'two mirror-atom voices an octave apart: a crystal choir that fades in',
  { B1: { lvl: 0.7, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.7, 0.9, 0.3, 0.5, 0.2, 0.1], atk: 1, spread: 0.5 },
    B2: { lvl: 0.5, pattern: 'mirror', wavelet: 'db20', tilt: -6, bars: [0.8, 0.4, 0.6, 0.2], oct: 1, fine: 6, atk: 1.4, spread: 0.6 },
    g: { amp: [1.2, 1, 1, 3], uni: [3, 14], chorus: [0.5, 0.45, 0.65], reverb: [0.9, 0.6] } });
add('Pad', 'Glass Cathedral', 'random atoms in two seeds, bright and slow: a glass cathedral',
  { B1: { lvl: 0.65, pattern: 'random', seed: 61, wavelet: 'db8', tilt: -7, bars: [1, 0.8, 0.7, 0.5, 0.4, 0.3, 0.2], atk: 1.2, sus: 0.8 },
    B2: { lvl: 0.45, pattern: 'random', seed: 17, wavelet: 'sym8', tilt: -8, bars: [0.6, 0.6, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2], oct: 1, atk: 1.6, sus: 0.8 },
    g: { amp: [1, 1, 1, 3], uni: [2, 12], chorus: [0.45], reverb: [0.95, 0.7] } });
add('Pad', 'Frost Pad', 'alternating atoms with a Walsh sparkle above: cold and clear',
  { B1: { lvl: 0.7, pattern: 'alt', wavelet: 'db4', tilt: -8, bars: [1, 0.4, 0.6, 0.2, 0.3], atk: 0.8 },
    B2: { lvl: 0.4, pattern: 'walsh', wavelet: 'db8', tilt: -6, bars: [0.6, 0, 0.5, 0, 0.3], oct: 1, atk: 1.2 },
    g: { amp: [0.9, 1, 1, 2.5], uni: [2, 9], chorus: [0.6, 0.5, 0.6], reverb: [0.85, 0.5] } });
add('Pad', 'Ghost Choir', 'a mirror choir with a low double and a slow vibrato',
  { B1: { lvl: 0.65, pattern: 'mirror', wavelet: 'sym8', tilt: -4, bars: [1, 0.5, 0.9, 0.7, 0.3, 0.1], atk: 0.8, spread: 0.4 },
    B2: { lvl: 0.5, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.5], oct: -1, atk: 0.9 },
    g: { amp: [1, 1, 1, 2.5], uni: [3, 12], lfo: { rate: 4.5, pitch: 4 }, chorus: [0.45], reverb: [0.9, 0.55] } });
add('Pad', 'Aurora', 'ramp atoms swept by the position window: the light moves across the cycle',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'db20', tilt: -6, pdep: 0.6, pwid: 0.35, atk: 1 },
    B2: { lvl: 0.4, pattern: 'ramp', wavelet: 'db20', tilt: -9, oct: 1, pdep: 0.7, pwid: 0.3, pcen: 0.5, atk: 1.4 },
    g: { amp: [1.1, 1, 1, 2.8], lfo: { rate: 0.12, pos: 0.4 }, uni: [2, 10], reverb: [0.9, 0.55], chorus: [0.35] } });
add('Pad', 'Night Chimes Pad', 'a soft random pad; each note rings a chime that dies away',
  { B1: { lvl: 0.7, pattern: 'random', seed: 9, wavelet: 'db2', tilt: -6, bars: [1, 0.8, 0.6, 0.4, 0.3], body: 6, bright: 1.5, sus: 0.5, atk: 0.3 },
    B2: { lvl: 0.35, pattern: 'impulse', wavelet: 'db8', tilt: -3, bars: [0.4, 0.6, 0.9, 1, 0.8], oct: 1, env: [0.002, 2, 0, 1.2] },
    g: { amp: [0.5, 1, 0.9, 2], uni: [2, 8], reverb: [0.9, 0.5], delay: [0.5, 0.35, 0.12] } });
add('Pad', 'Vapor Pad', 'two ramp voices, one a little flat, breathing with the wavelet morph',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'db4', tilt: -6, atk: 0.9 },
    B2: { lvl: 0.55, pattern: 'ramp', wavelet: 'db4', tilt: -7, fine: -10, atk: 1.1 },
    g: { amp: [1, 1, 1, 2.4], morph: ['db20', 0.2, 0.5], lfo: { rate: 0.18 }, uni: [2, 10], chorus: [0.5], reverb: [0.85, 0.5] } });
add('Pad', 'Opal Pad', 'Walsh atoms with a lower mirror voice: a milky, stepped pad',
  { B1: { lvl: 0.6, pattern: 'walsh', wavelet: 'db8', tilt: -7, bars: [1, 0.6, 0.5, 0.4, 0.3, 0.2], atk: 0.8 },
    B2: { lvl: 0.55, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.6, 0.6, 0.3], oct: -1, atk: 1 },
    g: { amp: [1, 1, 1, 2.4], uni: [2, 9], chorus: [0.55, 0.5, 0.65], reverb: [0.85, 0.5] } });
add('Pad', 'Cathedral Air', 'a pure organ-like pad with a swell of air above it',
  { B1: { lvl: 0.75, pattern: 'ramp', wavelet: 'db20', tilt: -10, bars: [1, 0.25, 0.1], atk: 0.6 },
    B2: { lvl: 0.2, pattern: 'random', seed: 33, wavelet: 'db8', tilt: -2, bars: [0, 0, 0, 0.3, 0.7, 1, 1, 0.8], oct: 1, env: [1.2, 1, 0.9, 1.5] },
    g: { amp: [0.9, 1, 1, 2.8], uni: [2, 6], lfo: { rate: 4.8, pitch: 3 }, reverb: [0.95, 0.6] } });
add('Pad', 'Starlit Pad', 'a sparse mirror pad with stars blinking above: high impulses that decay',
  { B1: { lvl: 0.65, pattern: 'mirror', wavelet: 'db20', tilt: -9, bars: [1, 0.5, 0.7, 0.3], atk: 1.1 },
    B2: { lvl: 0.4, pattern: 'impulse', wavelet: 'sym8', tilt: -2, bars: [0, 0.3, 0.6, 1, 0.9, 0.6], oct: 2, env: [0.002, 1.4, 0, 0.8] },
    g: { amp: [1, 1, 1, 2.6], uni: [2, 10], chorus: [0.4], delay: [0.38, 0.4, 0.14], reverb: [0.9, 0.55] } });

add('Pad', 'Silk Cloud', 'a saw and a choir of mirror atoms: a cloud with a human colour',
  { A1: { lvl: 0.5, wave: 'saw', wavelet: 'db20', fcut: 5.5, fres: 2 },
    B1: { lvl: 0.55, pattern: 'mirror', wavelet: 'db20', tilt: -6, bars: [1, 0.7, 0.8, 0.4, 0.3, 0.1], atk: 0.9 },
    g: { amp: [0.9, 1, 1, 2.2], uni: [3, 12], chorus: [0.6, 0.5, 0.65], reverb: [0.8, 0.45] } });
add('Pad', 'Dream Machine', 'a pulse and random atoms: a shimmering, slightly unreal pad',
  { A1: { lvl: 0.45, wave: 'pulse', width: 0.3, wavelet: 'db8', fcut: 6, fres: 3 },
    B1: { lvl: 0.55, pattern: 'random', seed: 25, wavelet: 'sym8', tilt: -7, bars: [1, 0.8, 0.6, 0.4, 0.3, 0.2], atk: 1.1, sus: 0.8 },
    g: { amp: [1, 1, 1, 2.4], lfo: { rate: 0.2, cut: 0.7 }, uni: [2, 10], chorus: [0.5], reverb: [0.85, 0.5] } });
add('Pad', 'Lunar Hybrid', 'a triangle with a Walsh partner: cold, round and a little digital',
  { A1: { lvl: 0.6, wave: 'tri', wavelet: 'db8', fcut: 7 },
    B1: { lvl: 0.4, pattern: 'walsh', wavelet: 'db4', tilt: -8, bars: [0.6, 0.5, 0.4, 0.3], atk: 0.7 },
    g: { amp: [1, 1, 1, 2.6], uni: [2, 9], lfo: { rate: 0.2, cut: 0.5 }, chorus: [0.45], reverb: [0.85, 0.5] } });
add('Pad', 'Warm Voices', 'a low-passed saw under mirror voices: an old choir keyboard',
  { A1: { lvl: 0.55, wave: 'saw', wavelet: 'db8', fcut: 4, fres: 3, oct: -1 },
    B1: { lvl: 0.6, pattern: 'mirror', wavelet: 'sym8', tilt: -5, bars: [1, 0.6, 0.9, 0.7, 0.3, 0.15], atk: 0.7, spread: 0.4 },
    g: { amp: [0.8, 1, 1, 2], uni: [3, 12], lfo: { rate: 5, pitch: 3 }, chorus: [0.55], reverb: [0.75, 0.4] } });
add('Pad', 'Glass & Saw', 'bright random glass over a mellow saw',
  { A1: { lvl: 0.55, wave: 'saw', wavelet: 'db4', fcut: 4.5, fres: 2 },
    B1: { lvl: 0.45, pattern: 'random', seed: 61, wavelet: 'db8', tilt: -6, bars: [0.4, 0.6, 0.8, 1, 0.8, 0.6, 0.4], atk: 0.9 },
    g: { amp: [0.9, 1, 0.95, 2.2], uni: [2, 10], chorus: [0.5], reverb: [0.85, 0.45] } });
add('Pad', 'Horizon', 'a slow-opening saw with a ramp-atom body: wide and cinematic',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db20', fcut: 3.5, fenv: 4, fres: 3 },
    B1: { lvl: 0.5, pattern: 'ramp', wavelet: 'db20', tilt: -7, atk: 1.5, spread: 0.6 },
    g: { amp: [1.4, 1, 1, 3], mod: [1.6, 1, 0.8, 2], uni: [3, 14], chorus: [0.5], reverb: [0.9, 0.55], width: 1 } });
add('Pad', 'Amber Pad', 'a pulse pad with warm alternating atoms: golden and soft',
  { A1: { lvl: 0.55, wave: 'pulse', width: 0.4, wavelet: 'db4', fcut: 4.5, fres: 2 },
    B1: { lvl: 0.45, pattern: 'alt', wavelet: 'db8', tilt: -6, bars: [1, 0.7, 0.5, 0.3, 0.2], atk: 0.7 },
    g: { amp: [0.8, 1, 0.95, 2], uni: [2, 9], lfo: { rate: 0.3, cut: 0.6 }, chorus: [0.5], reverb: [0.75, 0.4] } });
add('Pad', 'Prairie Pad', 'a wide, airy sweep: a saw and noisy random atoms with a moving window',
  { A1: { lvl: 0.5, wave: 'saw', wavelet: 'db8', fcut: 6, fres: 2, pdep: 0.5, pwid: 0.4 },
    B1: { lvl: 0.5, pattern: 'random', seed: 5, wavelet: 'db4', tilt: -5, bars: [0.7, 0.6, 0.7, 0.8, 0.6, 0.4], atk: 1 },
    g: { amp: [1, 1, 0.95, 2.4], lfo: { rate: 0.15, pos: 0.4 }, uni: [2, 11], chorus: [0.4], reverb: [0.9, 0.5] } });
add('Pad', 'Velvet Voices', 'mirror voices with a soft saw bed: smooth, centred and calm',
  { A1: { lvl: 0.45, wave: 'saw', wavelet: 'db20', fcut: 4, fres: 1 },
    B1: { lvl: 0.65, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.8, 0.7, 0.4, 0.3, 0.1], atk: 0.8 },
    g: { amp: [0.8, 1, 1, 2.2], uni: [3, 10], chorus: [0.5], reverb: [0.8, 0.45] } });
add('Pad', 'Cloud Choir', 'a triangle-based pad with a wide mirror choir above: for slow chords',
  { A1: { lvl: 0.5, wave: 'tri', wavelet: 'db20', fcut: 6 },
    B1: { lvl: 0.55, pattern: 'mirror', wavelet: 'db20', tilt: -6, bars: [1, 0.6, 0.9, 0.5, 0.4, 0.2], atk: 1.2, spread: 0.5 },
    g: { amp: [1.2, 1, 1, 2.8], uni: [3, 14], lfo: { rate: 4.5, pitch: 3 }, chorus: [0.55], reverb: [0.9, 0.55] } });

// ---------------------------------------------------------------- Strings
add('Strings', 'Ensemble Strings', 'two detuned saws with a bow-like attack: a classic string ensemble',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db20', fcut: 6.5, fslope: 18, fres: 1, fine: 8 },
    A2: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 6, fslope: 18, fine: -8 },
    g: { amp: [0.3, 1, 0.9, 0.9], uni: [2, 7], lfo: { rate: 5, pitch: 4 }, chorus: [0.7, 0.6, 0.7], reverb: [0.7, 0.35] } });
add('Strings', 'Chamber Strings', 'a close, dry string quartet: saw and pulse, short release',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 5.5, fslope: 18, fine: 5 },
    A2: { lvl: 0.4, wave: 'pulse', width: 0.45, wavelet: 'db8', fcut: 5, fine: -5, oct: 1 },
    g: { amp: [0.15, 1, 0.9, 0.35], lfo: { rate: 5.5, pitch: 5 }, chorus: [0.35], reverb: [0.5, 0.2] } });
add('Strings', 'Warm Cellos', 'saws an octave apart, dark and slow: a cello section',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db20', fcut: 4.5, fslope: 18, oct: -1 },
    A2: { lvl: 0.5, wave: 'saw', wavelet: 'db8', fcut: 4.5, fslope: 18, oct: -1, fine: 9 },
    g: { amp: [0.3, 1, 0.9, 0.8], uni: [2, 6], lfo: { rate: 5, pitch: 5 }, chorus: [0.4], reverb: [0.6, 0.3] } });
add('Strings', 'Spiccato Section', 'bowed bounces: a short attack and decay, a noisy tick at the start of each note',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 4.5, fenv: 3, fres: 2 },
    A2: { lvl: 0.6, wave: 'noise', wavelet: 'db4', ftype: 'bp', fcut: 7.5, fres: 3, oct: -3, env: [0.002, 0.05, 0, 0.05] },
    g: { amp: [0.004, 0.22, 0, 0.12], mod: [0.001, 0.12, 0, 0.1], uni: [2, 7], chorus: [0.25], reverb: [0.45, 0.25] } });
add('Strings', 'Tremolo Strings', 'a saw pair with a fast square LFO on the pitch and the filter: trembling bows',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db8', fcut: 5.5, fslope: 18, fine: 6 },
    A2: { lvl: 0.55, wave: 'saw', wavelet: 'db8', fcut: 5.5, fslope: 18, fine: -6 },
    g: { amp: [0.2, 1, 0.9, 0.7], lfo: { shape: 'tri', rate: 8.5, cut: 2, pitch: 3 }, uni: [2, 6], chorus: [0.4], reverb: [0.6, 0.3] } });
add('Strings', 'Slow Violins', 'a high, soft string line that blooms slowly',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db20', fcut: 6, fslope: 18, fine: 6, oct: 1 },
    A2: { lvl: 0.5, wave: 'saw', wavelet: 'db20', fcut: 5.5, fslope: 18, fine: -6, oct: 1 },
    g: { amp: [0.7, 1, 0.9, 1.4], uni: [2, 8], lfo: { rate: 5.5, pitch: 6 }, chorus: [0.5, 0.5, 0.65], reverb: [0.75, 0.4] } });

add('Strings', 'Glass Strings', 'bowed glass: random atoms doubled, a little unreal, very smooth',
  { B1: { lvl: 0.65, pattern: 'random', seed: 12, wavelet: 'db20', tilt: -7, bars: [1, 0.8, 0.7, 0.5, 0.4, 0.3], atk: 0.25 },
    B2: { lvl: 0.45, pattern: 'random', seed: 12, wavelet: 'db8', tilt: -8, bars: [1, 0.8, 0.7, 0.5, 0.4, 0.3], fine: 9, atk: 0.3 },
    g: { amp: [0.25, 1, 0.9, 0.9], uni: [2, 6], lfo: { rate: 5, pitch: 5 }, chorus: [0.5], reverb: [0.7, 0.35] } });
add('Strings', 'Pizzicato Duo', 'plucked strings in two voices: sharp impulses with a soft body an octave below',
  { B1: { lvl: 0.7, pattern: 'impulse', wavelet: 'db8', tilt: -4, bars: [1, 0.9, 0.7, 0.5, 0.3, 0.2], body: 0.4, bright: 0.07, sus: 0, atk: 0.001 },
    B2: { lvl: 0.4, pattern: 'ramp', wavelet: 'db20', tilt: -10, bars: [1, 0.3], oct: -1, env: [0.002, 0.35, 0, 0.12] },
    g: { amp: [0.001, 0.9, 0, 0.2], uni: [1, 0], reverb: [0.5, 0.2] } });
add('Strings', 'Hollow Strings', 'a quiet, hollow string tone: the even bands removed with mirror atoms',
  { B1: { lvl: 0.7, pattern: 'mirror', wavelet: 'sym8', tilt: -4, bars: [1, 0.3, 0.8, 0.2, 0.6, 0.1], atk: 0.3 },
    B2: { lvl: 0.4, pattern: 'alt', wavelet: 'db8', tilt: -6, bars: [1, 0.2, 0.5, 0.1], oct: 1, fine: 6, atk: 0.35 },
    g: { amp: [0.35, 1, 0.9, 1], uni: [2, 7], lfo: { rate: 5, pitch: 4 }, chorus: [0.45], reverb: [0.7, 0.35] } });
add('Strings', 'Choir Strings', 'strings and voices as one: mirror atoms with a slow vibrato',
  { B1: { lvl: 0.65, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.8, 0.9, 0.6, 0.4, 0.2], atk: 0.5, spread: 0.4 },
    B2: { lvl: 0.45, pattern: 'ramp', wavelet: 'db20', tilt: -8, oct: 1, fine: 7, atk: 0.6 },
    g: { amp: [0.5, 1, 0.95, 1.4], uni: [3, 9], lfo: { rate: 5.2, pitch: 5 }, chorus: [0.55], reverb: [0.8, 0.45] } });
add('Strings', 'Silver Strings', 'bright, thin strings with a fast shimmer from alternating atoms',
  { B1: { lvl: 0.6, pattern: 'alt', wavelet: 'db8', tilt: -3, bars: [0.8, 0.9, 1, 0.8, 0.6, 0.4], atk: 0.2 },
    B2: { lvl: 0.45, pattern: 'ramp', wavelet: 'db4', tilt: -6, oct: 1, fine: -8, atk: 0.3 },
    g: { amp: [0.25, 1, 0.9, 0.8], uni: [2, 8], lfo: { rate: 6, pitch: 5 }, chorus: [0.55], reverb: [0.6, 0.3] } });
add('Strings', 'Marcato Strings', 'accented bowed notes: a quick swell of mirror atoms and a hard tick',
  { B1: { lvl: 0.7, pattern: 'mirror', wavelet: 'db8', tilt: -4, bars: [1, 0.7, 0.8, 0.6, 0.3], body: 0.5, bright: 0.12, sus: 0.3, atk: 0.01 },
    B2: { lvl: 0.35, pattern: 'impulse', wavelet: 'db8', tilt: -2, bars: [0, 0.3, 0.7, 1, 0.8], oct: 1, env: [0.001, 0.05, 0, 0.05] },
    g: { amp: [0.01, 0.4, 0.5, 0.2], uni: [2, 6], reverb: [0.5, 0.25], chorus: [0.3] } });

add('Strings', 'Silk Strings II', 'a saw and soft mirror atoms: smooth strings with a vocal edge',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db20', fcut: 6.5, fslope: 18, fine: 5 },
    B1: { lvl: 0.4, pattern: 'mirror', wavelet: 'db20', tilt: -6, bars: [1, 0.6, 0.8, 0.5, 0.3], atk: 0.4 },
    g: { amp: [0.5, 1, 0.9, 1.4], uni: [2, 9], chorus: [0.75, 0.5, 0.7], reverb: [0.7, 0.4] } });
add('Strings', 'Hybrid Ensemble', 'a pulse and ramp atoms: a big ensemble with a synthetic top',
  { A1: { lvl: 0.55, wave: 'pulse', width: 0.4, wavelet: 'db8', fcut: 6, fslope: 18 },
    B1: { lvl: 0.5, pattern: 'ramp', wavelet: 'db8', tilt: -5, atk: 0.3 },
    g: { amp: [0.35, 1, 0.9, 1], uni: [3, 9], lfo: { rate: 5, pitch: 4 }, chorus: [0.65], reverb: [0.7, 0.35] } });
add('Strings', 'Orchestra Swell', 'a swelling orchestral pad: a low saw and mirror atoms opening together',
  { A1: { lvl: 0.55, wave: 'saw', wavelet: 'db20', fcut: 3.5, fenv: 3.5, fslope: 18, oct: -1 },
    B1: { lvl: 0.5, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.8, 0.8, 0.6, 0.4, 0.2], atk: 1.4, spread: 0.6 },
    g: { amp: [1.3, 1, 1, 2], mod: [1.4, 1, 0.8, 1.5], uni: [2, 8], chorus: [0.5], reverb: [0.85, 0.45] } });
add('Strings', 'Solo Violin', 'a single expressive voice: saw with a mirror body, vibrato that grows with the note',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db20', fcut: 6, fslope: 18, fenv: 1.5, oct: 1 },
    B1: { lvl: 0.4, pattern: 'mirror', wavelet: 'db20', tilt: -6, bars: [1, 0.7, 0.9, 0.5, 0.3], atk: 0.15, oct: 1 },
    g: { amp: [0.12, 1, 0.95, 0.3], mod: [0.5, 1, 0.8, 0.5], lfo: { rate: 5.5, pitch: 10 }, voices: 1, porta: 'legato', glide: 0.06, reverb: [0.6, 0.25], chorus: [0.2] } });
add('Strings', 'String Machine II', 'a vintage polyphonic ensemble: saw and ramp atoms, a deep chorus',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db4', fcut: 6, fslope: 18 },
    B1: { lvl: 0.5, pattern: 'ramp', wavelet: 'db4', tilt: -6, atk: 0.2 },
    g: { amp: [0.35, 1, 0.9, 0.9], voices: 16, uni: [1, 0], chorus: [0.9, 0.65, 0.75], reverb: [0.65, 0.3] } });

add('Strings', 'Vintage Violas', 'a mid-register saw and ramp atoms: a thick, mellow viola section',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 5, fslope: 18, fine: 6 },
    B1: { lvl: 0.45, pattern: 'ramp', wavelet: 'db20', tilt: -7, atk: 0.3, fine: -6 },
    g: { amp: [0.35, 1, 0.9, 1], uni: [2, 7], lfo: { rate: 5, pitch: 4 }, chorus: [0.55, 0.5, 0.65], reverb: [0.65, 0.3] } });

module.exports = out;
