// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: FX (14). See tools/preset_dsl.js for the language.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));

add('FX', 'Rising Sweep', 'a riser: filtered noise and a saw whose band-pass climbs for seconds, then falls away',
  { A1: { lvl: 0.8, wave: 'noise', wavelet: 'db20', ftype: 'bp', fcut: 3, fres: 10, fenv: 6, oct: -2 },
    A2: { lvl: 0.4, wave: 'saw', wavelet: 'db8', ftype: 'bp', fcut: 3, fres: 10, fenv: 7, oct: 1 },
    g: { amp: [2.2, 1, 1, 2.2], mod: [2.5, 1, 1, 1.5], uni: [2, 12], reverb: [0.9, 0.55] } });
add('FX', 'Pitch Dive', 'a long fall in pitch: a saw and a sine dropping two octaves, the note becoming a rumble',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db8', fcut: 5, fres: 3, penv: [24, 1.2] },
    A2: { lvl: 0.55, wave: 'sine', wavelet: 'db20', oct: -1, penv: [36, 0.9] },
    g: { amp: [0.002, 2, 0.8, 1.2], reverb: [0.7, 0.3], drive: 0.2 } });
add('FX', 'Laser Zap', 'a sci-fi laser shot: a saw and a square falling steeply in pitch in a tenth of a second',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db4', fcut: 7, fres: 3, penv: [36, 0.12] },
    A2: { lvl: 0.4, wave: 'square', wavelet: 'db4', oct: 1, fcut: 7, penv: [48, 0.08], env: [0.001, 0.15, 0, 0.1] },
    g: { amp: [0.001, 0.3, 0, 0.15], drive: 0.3, delay: [0.25, 0.45, 0.25], reverb: [0.5, 0.2] }, win: 0.1 });
add('FX', 'Engine Drone', 'a throbbing drone: two low saws and a pulse, the pitch and the filter wobbling slowly',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 3, fres: 4, oct: -1, fine: 8 },
    A2: { lvl: 0.5, wave: 'pulse', width: 0.3, wavelet: 'db8', fcut: 3.5, fres: 3, oct: -2, fine: -8 },
    g: { voices: 4, amp: [0.5, 1, 1, 1.5], lfo: { shape: 'tri', rate: 0.7, pitch: 20, cut: 1.5 }, drive: 0.35, reverb: [0.6, 0.25] } });
add('FX', 'Robot Voice', 'a robot talking: a band-pass saw whose cutoff jumps at random, with a noisy buzz above',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'haar', ftype: 'bp', fcut: 5, fres: 14 },
    A2: { lvl: 0.5, wave: 'noise', wavelet: 'db4', ftype: 'bp', fcut: 7, fres: 3, oct: -2 },
    g: { amp: [0.005, 0.5, 1, 0.15], lfo: { shape: 'sh', rate: 8, cut: 2.5 }, drive: 0.3 } });

add('FX', 'Alien Choir', 'strange voices: two random-atom choirs, the position window jumping around the cycle',
  { B1: { lvl: 0.6, pattern: 'random', seed: 42, wavelet: 'db8', tilt: -4, bars: [1, 0.8, 0.7, 0.6, 0.5, 0.3], atk: 0.6, pdep: 0.7, pwid: 0.3 },
    B2: { lvl: 0.45, pattern: 'random', seed: 77, wavelet: 'sym8', tilt: -5, bars: [1, 0.7, 0.8, 0.6, 0.4], oct: 1, fine: 20, atk: 0.8, pdep: 0.6, pwid: 0.3, pcen: 0.5 },
    g: { amp: [0.6, 1, 1, 2], lfo: { shape: 'sh', rate: 2.5, pos: 0.5 }, uni: [3, 18], reverb: [0.9, 0.5], delay: [0.45, 0.45, 0.2] } });
add('FX', 'Glitter Rain', 'falling glitter: bright impulse atoms and random sparkles, each note a shower that fades',
  { B1: { lvl: 0.8, pattern: 'impulse', wavelet: 'db8', tilt: -2, bars: [0, 0.2, 0.6, 1, 1, 0.8, 0.5], body: 1.5, bright: 0.25, sus: 0, oct: 1 },
    B2: { lvl: 0.6, pattern: 'random', seed: 9, wavelet: 'db4', tilt: 0, bars: [0, 0, 0.3, 0.7, 1, 1, 0.8], oct: 2, env: [0.001, 1.2, 0, 0.8] },
    g: { amp: [0.001, 2, 0, 1], drive: 0.2, delay: [0.18, 0.55, 0.3], reverb: [0.85, 0.5] } });
add('FX', 'Ice Texture', 'a cold, evolving texture: Walsh atoms and bright alternating atoms under a slow moving window',
  { B1: { lvl: 0.6, pattern: 'walsh', wavelet: 'db4', tilt: -5, bars: [0.8, 0.7, 0.8, 0.9, 0.6, 0.4], atk: 1, pdep: 0.8, pwid: 0.25 },
    B2: { lvl: 0.4, pattern: 'alt', wavelet: 'db8', tilt: -3, bars: [0.3, 0.6, 0.9, 1, 0.8], oct: 1, atk: 1.4, pdep: 0.7, pwid: 0.25, pcen: 0.5 },
    g: { amp: [1.4, 1, 1, 3], lfo: { rate: 0.1, pos: 0.5 }, uni: [2, 12], chorus: [0.5], reverb: [0.95, 0.65] } });
add('FX', 'Breath Wind', 'wind in a canyon: faint random atoms in the high bands, swelling and fading slowly',
  { B1: { lvl: 0.6, pattern: 'random', seed: 71, wavelet: 'db4', tilt: -1, bars: [0, 0.1, 0.4, 0.8, 1, 1, 0.8, 0.6], atk: 1.5, sus: 0.9 },
    B2: { lvl: 0.4, pattern: 'random', seed: 5, wavelet: 'db8', tilt: -3, bars: [0.2, 0.5, 0.8, 1, 0.6], oct: -1, atk: 2, sus: 0.9, pdep: 0.5, pwid: 0.4 },
    g: { amp: [1.2, 1, 1, 2.5], lfo: { rate: 0.12, pos: 0.4 }, uni: [3, 15], reverb: [0.9, 0.55] } });
add('FX', 'Metal Scrape', 'a scraping metal sound: random atoms that fall in pitch while they ring',
  { B1: { lvl: 0.9, pattern: 'random', seed: 88, wavelet: 'haar', tilt: -2, bars: [0.6, 0.8, 1, 0.9, 0.7, 0.4], body: 1, bright: 0.2, sus: 0, penv: [5, 0.4] },
    B2: { lvl: 0.6, pattern: 'random', seed: 14, wavelet: 'haar', tilt: -1, bars: [0, 0.3, 0.8, 1, 0.9], oct: 1, penv: [8, 0.3], env: [0.001, 0.8, 0, 0.5] },
    g: { amp: [0.001, 1.6, 0, 0.8], drive: 0.3, delay: [0.2, 0.5, 0.25], reverb: [0.7, 0.35] } });

add('FX', 'Laser Hybrid', 'a resonant saw swept by LFO 2, with impulse atoms that crackle on the attack',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db4', fcut: 3, fres: 18, fslope: 48 },
    B1: { lvl: 0.35, pattern: 'impulse', wavelet: 'db8', tilt: -2, bars: [0, 0.3, 0.8, 1, 0.9], body: 0.3, bright: 0.06, sus: 0.2 },
    g: { amp: [0.003, 0.5, 0.9, 0.3], lfo2: { shape: 'saw', rate: 0.5, amt: 0.8, target: 'cutoff' }, drive: 0.3, delay: [0.2, 0.5, 0.3], reverb: [0.5, 0.2] } });
add('FX', 'Wind Tunnel', 'a rushing tunnel: band-passed noise and a random-atom whistle, the filter breathing',
  { A1: { lvl: 0.8, wave: 'noise', wavelet: 'db20', ftype: 'bp', fcut: 6.5, fres: 6, oct: -2 },
    B1: { lvl: 0.4, pattern: 'random', seed: 66, wavelet: 'db8', tilt: -2, bars: [0, 0.2, 0.6, 1, 1, 0.8], atk: 0.8, sus: 0.9 },
    g: { amp: [0.8, 1, 1, 1.5], lfo: { rate: 0.2, cut: 2 }, uni: [2, 12], reverb: [0.85, 0.45] } });
add('FX', 'Spaceship', 'a spaceship hum: a slow, deep saw wobbling in pitch and a mirror choir shimmering on top',
  { A1: { lvl: 0.55, wave: 'saw', wavelet: 'db8', fcut: 3, fres: 5, oct: -2 },
    B1: { lvl: 0.45, pattern: 'mirror', wavelet: 'db20', tilt: -5, bars: [1, 0.6, 0.8, 0.5, 0.3], atk: 1, oct: 1 },
    g: { voices: 6, amp: [0.8, 1, 1, 2], lfo: { shape: 'tri', rate: 0.35, pitch: 35, cut: 1 }, uni: [3, 20], chorus: [0.5], reverb: [0.9, 0.5] } });
add('FX', 'Dark Rumble', 'a rumble from the deep: a very low saw with random atoms, slowly opening and closing',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db20', fcut: 2.2, fres: 3, oct: -2 },
    B1: { lvl: 0.4, pattern: 'random', seed: 3, wavelet: 'db8', tilt: -7, bars: [1, 0.8, 0.5, 0.3], atk: 0.6, oct: -1 },
    g: { amp: [0.6, 1, 1, 2], lfo: { rate: 0.15, cut: 1.5 }, uni: [2, 10], drive: 0.3, reverb: [0.8, 0.4] } });

module.exports = out;
