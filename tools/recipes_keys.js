// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// New presets: Keys (22) and Organ (12). See tools/preset_dsl.js for the language.
'use strict';
const { P } = require('./preset_dsl.js');
const out = [];
const add = (...a) => out.push(P(...a));
const hammer = (lvl, o = {}) => ({ lvl, wave: 'noise', wavelet: 'db4', ftype: 'bp', fcut: 6.5, fres: 2, env: [0.001, 0.03, 0, 0.04], oct: -2, ...o });   // the hammer's thud (a noise played low: see tools/recipes_bass.js)
const keyClick = (lvl, o = {}) => ({ lvl, wave: 'noise', wavelet: 'db4', ftype: 'hp', fcut: 7, env: [0.001, 0.012, 0, 0.02], oct: 2, ...o });      // an organ key's click

// ---------------------------------------------------------------- Keys
add('Keys', 'Tine E-Piano', 'an electric piano: a soft triangle body and a sine tine two octaves up that rings and goes',
  { A1: { lvl: 0.7, wave: 'tri', wavelet: 'db8', fcut: 6, fenv: 3, fvel: 3 },
    A2: { lvl: 0.25, wave: 'sine', wavelet: 'db20', oct: 2, fine: 3, env: [0.001, 0.35, 0, 0.2] },
    g: { amp: [0.002, 2.4, 0.08, 0.4, 0.8], mod: [0.001, 0.3, 0.1, 0.2], chorus: [0.35, 0.6, 0.5], reverb: [0.5, 0.2] } });
add('Keys', 'Wurli Bark', 'a reed-piano bark: a pulse with a saw bite that fades fast, more bite when you play harder',
  { A1: { lvl: 0.65, wave: 'pulse', width: 0.4, wavelet: 'db4', fcut: 5, fres: 4, fenv: 3, fvel: 2 },
    A2: { lvl: 0.25, wave: 'saw', wavelet: 'db4', fcut: 6, oct: 1, env: [0.001, 0.5, 0, 0.2] },
    g: { amp: [0.002, 1.6, 0.15, 0.3, 0.8], mod: [0.001, 0.3, 0.1, 0.2], drive: 0.3, chorus: [0.2], reverb: [0.4, 0.15] } });
add('Keys', 'Clavinet', 'a funky clavinet: a narrow pulse through a snapping band-pass, a short decay',
  { A1: { lvl: 1, wave: 'pulse', width: 0.2, wavelet: 'db4', ftype: 'bp', fcut: 4, fres: 5, fenv: 2, fvel: 2 },
    A2: { lvl: 0.5, wave: 'pulse', width: 0.5, wavelet: 'db4', ftype: 'hp', fcut: 3, oct: 1, env: [0.001, 0.14, 0, 0.1] },
    g: { amp: [0.001, 0.6, 0.2, 0.1, 0.8], mod: [0.001, 0.15, 0.05, 0.1], drive: 0.3, reverb: [0.3, 0.1] } });
add('Keys', 'Bright Piano', 'a simple bright piano: a saw opening with the velocity, and the thud of a hammer',
  { A1: { lvl: 0.7, wave: 'saw', wavelet: 'db8', fcut: 6.5, fenv: 3, fvel: 3, fres: 1 },
    A2: hammer(0.6, { fcut: 6 }),
    g: { amp: [0.002, 2.2, 0.08, 0.4, 0.8], mod: [0.001, 0.4, 0.1, 0.2], reverb: [0.5, 0.2] } });
add('Keys', 'Dyno Keys II', 'a punchy electric piano: a resonant saw snapping open, a chime an octave above, chorus',
  { A1: { lvl: 0.65, wave: 'saw', wavelet: 'db4', fcut: 3.5, fres: 8, fenv: 5, fvel: 3 },
    A2: { lvl: 0.25, wave: 'sine', wavelet: 'db20', oct: 1, env: [0.001, 0.8, 0, 0.3] },
    g: { amp: [0.002, 1.8, 0.2, 0.35, 0.8], mod: [0.001, 0.3, 0.1, 0.2], chorus: [0.3], reverb: [0.4, 0.15] } });
add('Keys', 'Toy Piano', 'a small toy piano: bright squares two octaves up with a fast decay and a metallic ping',
  { A1: { lvl: 0.6, wave: 'square', wavelet: 'db4', fcut: 7, oct: 1, fenv: 1 },
    A2: { lvl: 0.3, wave: 'sine', wavelet: 'db20', oct: 3, semi: 4, env: [0.001, 0.4, 0, 0.3] },
    g: { amp: [0.001, 0.9, 0, 0.3, 0.7], mod: [0.001, 0.2, 0, 0.1], reverb: [0.4, 0.2] }, win: 0.1 });
add('Keys', 'Stage Piano', 'a full stage piano: a saw, a triangle an octave below and a soft hammer thud',
  { A1: { lvl: 0.6, wave: 'saw', wavelet: 'db8', fcut: 5.5, fenv: 3, fvel: 3 },
    A2: { lvl: 0.4, wave: 'tri', wavelet: 'db20', fcut: 6, oct: -1, fenv: 1 },
    g: { amp: [0.002, 2.6, 0.06, 0.45, 0.8], mod: [0.001, 0.4, 0.1, 0.25], chorus: [0.15], reverb: [0.55, 0.2] } });
add('Keys', 'Honky Keys', 'an out-of-tune upright: two pulse waves tuned apart with a short, bright decay',
  { A1: { lvl: 0.6, wave: 'pulse', width: 0.35, wavelet: 'db4', fcut: 5.5, fenv: 2.5, fvel: 2, fine: 12 },
    A2: { lvl: 0.55, wave: 'pulse', width: 0.35, wavelet: 'db4', fcut: 5.5, fenv: 2.5, fvel: 2, fine: -12 },
    g: { amp: [0.002, 1.2, 0.05, 0.25, 0.8], mod: [0.001, 0.25, 0.05, 0.15], reverb: [0.4, 0.15] } });

add('Keys', 'Bell Piano', 'a piano with a bell: Walsh atoms ringing down and an impulse ping that dies in a moment',
  { B1: { lvl: 0.65, pattern: 'walsh', wavelet: 'db20', tilt: -5, bars: [1, 0.8, 0.6, 0.4, 0.3], body: 2, bright: 0.3, sus: 0 },
    B2: { lvl: 0.2, pattern: 'impulse', wavelet: 'db8', tilt: -2, bars: [0, 0.2, 0.7, 1, 0.8, 0.5], oct: 2, env: [0.001, 0.6, 0, 0.4] },
    g: { amp: [0.002, 2.5, 0, 0.6, 0.7], chorus: [0.2], reverb: [0.6, 0.25] } });
add('Keys', 'Celesta', 'a celesta: a sparkling high voice and a soft low one that blooms and fades',
  { B1: { lvl: 0.6, pattern: 'ramp', wavelet: 'db20', tilt: -3, bars: [1, 0, 0.4, 0, 0.2], body: 1.8, bright: 0.4, sus: 0, oct: 1 },
    B2: { lvl: 0.3, pattern: 'ramp', wavelet: 'db20', tilt: -6, bars: [1, 0.2], body: 2.4, bright: 1, sus: 0, env: [0.001, 2, 0, 0.8] },
    g: { amp: [0.001, 2, 0, 0.8, 0.7], reverb: [0.7, 0.3] } });
add('Keys', 'Glass Keys', 'keys of glass: random atoms with a bright, fast-fading top and a soft chorus',
  { B1: { lvl: 0.65, pattern: 'random', seed: 33, wavelet: 'db8', tilt: -5, bars: [1, 0.8, 0.8, 0.6, 0.5, 0.3], body: 2, bright: 0.2, sus: 0 },
    B2: { lvl: 0.3, pattern: 'random', seed: 50, wavelet: 'sym8', tilt: -3, bars: [0, 0.3, 0.7, 1, 0.8], oct: 1, env: [0.001, 0.5, 0, 0.3] },
    g: { amp: [0.002, 2.2, 0.05, 0.5, 0.7], chorus: [0.35], reverb: [0.6, 0.25] } });
add('Keys', 'Harp Keys', 'keys with the warmth of a harp: ramp atoms decaying one by one, a soft pluck at the start',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -6, bars: [1, 0.8, 0.5, 0.3, 0.2], body: 3, bright: 0.2, sus: 0 },
    B2: { lvl: 0.3, pattern: 'impulse', wavelet: 'db8', tilt: -3, bars: [0, 0.4, 0.8, 1, 0.6], oct: 1, env: [0.001, 0.15, 0, 0.15] },
    g: { amp: [0.001, 2.4, 0, 0.7, 0.7], chorus: [0.2], reverb: [0.65, 0.3] } });
add('Keys', 'Soft Keys', 'a very soft keyboard: a sine-like voice with a quiet partner, a long gentle decay',
  { B1: { lvl: 0.7, pattern: 'ramp', wavelet: 'db20', tilt: -10, bars: [1, 0.3], body: 3, bright: 1, sus: 0 },
    B2: { lvl: 0.35, pattern: 'mirror', wavelet: 'db20', tilt: -8, bars: [1, 0.5, 0.3], oct: 1, fine: 4, env: [0.001, 1.5, 0, 0.5] },
    g: { amp: [0.003, 2.8, 0.05, 0.6, 0.6], chorus: [0.3, 0.5, 0.5], reverb: [0.7, 0.3] } });
add('Keys', 'Mallet Keys', 'soft mallets on wood: four low bands, a woody click on top',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'sym8', tilt: -3, bars: [1, 0.6, 0.4, 0.2], body: 1, bright: 0.15, sus: 0 },
    B2: { lvl: 0.3, pattern: 'impulse', wavelet: 'db4', tilt: -1, bars: [0, 0, 0.6, 1, 0.7], oct: 1, env: [0.001, 0.08, 0, 0.1] },
    g: { amp: [0.001, 1.4, 0, 0.4, 0.7], chorus: [0.2], delay: [0.3, 0.3, 0.12], reverb: [0.5, 0.2] } });
add('Keys', 'Dulcimer Keys', 'a hammered dulcimer: alternating atoms with an octave that rings longer',
  { B1: { lvl: 0.6, pattern: 'alt', wavelet: 'db8', tilt: -4, bars: [1, 0.7, 0.8, 0.5, 0.4], body: 2, bright: 0.25, sus: 0 },
    B2: { lvl: 0.4, pattern: 'alt', wavelet: 'db8', tilt: -6, bars: [1, 0.6, 0.5], oct: 1, fine: 5, env: [0.001, 1.6, 0, 0.5] },
    g: { amp: [0.001, 2.2, 0, 0.5, 0.7], delay: [0.36, 0.3, 0.14], reverb: [0.6, 0.25] } });

add('Keys', 'Soft E-Piano', 'a soft electric piano: a sine body and impulse atoms, a deep chorus',
  { A1: { lvl: 0.6, wave: 'sine', wavelet: 'db20', fcut: 12 },
    B1: { lvl: 0.35, pattern: 'impulse', wavelet: 'db8', tilt: -5, bars: [1, 0.8, 0.6, 0.4, 0.3], body: 1.5, bright: 0.1, sus: 0 },
    g: { amp: [0.002, 2.8, 0.15, 0.45, 0.8], chorus: [0.4, 0.7, 0.6], reverb: [0.5, 0.2] } });
add('Keys', 'Hybrid Keys', 'a saw and Walsh atoms: bright, synthetic keys with a short bell tail',
  { A1: { lvl: 0.55, wave: 'saw', wavelet: 'db4', fcut: 5, fenv: 3, fvel: 2, fres: 2 },
    B1: { lvl: 0.4, pattern: 'walsh', wavelet: 'db8', tilt: -5, bars: [0.6, 0.8, 1, 0.7, 0.4], body: 1.5, bright: 0.2, sus: 0 },
    g: { amp: [0.002, 1.8, 0.1, 0.4, 0.8], mod: [0.001, 0.3, 0.1, 0.2], chorus: [0.3], reverb: [0.5, 0.2] } });
add('Keys', 'Rhodes Warm', 'a warm Rhodes: a triangle with bell partials and a slow chorus',
  { A1: { lvl: 0.65, wave: 'tri', wavelet: 'db20', fcut: 6, fenv: 2, fvel: 3 },
    B1: { lvl: 0.25, pattern: 'random', seed: 9, wavelet: 'db8', tilt: -4, bars: [0, 0.3, 0.7, 1, 0.8, 0.4], body: 0.8, bright: 0.25, sus: 0 },
    g: { amp: [0.002, 2.4, 0.1, 0.45, 0.85], mod: [0.001, 0.3, 0.1, 0.2], chorus: [0.45, 0.55, 0.6], reverb: [0.5, 0.2] } });
add('Keys', 'Wurli Hybrid', 'a reed-piano with a hollow mirror partner: a little bark, a little glass',
  { A1: { lvl: 0.55, wave: 'pulse', width: 0.4, wavelet: 'db4', fcut: 5, fenv: 3, fvel: 2 },
    B1: { lvl: 0.3, pattern: 'mirror', wavelet: 'db8', tilt: -4, bars: [1, 0.5, 0.6, 0.4], body: 1, bright: 0.15, sus: 0 },
    g: { amp: [0.002, 1.6, 0.15, 0.3, 0.8], mod: [0.001, 0.3, 0.1, 0.2], drive: 0.25, chorus: [0.25], reverb: [0.4, 0.15] } });
add('Keys', 'Piano Pad Keys', 'a piano whose notes melt into a pad: a triangle and slowly blooming mirror atoms',
  { A1: { lvl: 0.55, wave: 'tri', wavelet: 'db8', fcut: 6, fenv: 2, fvel: 2 },
    B1: { lvl: 0.45, pattern: 'mirror', wavelet: 'db20', tilt: -6, bars: [1, 0.6, 0.8, 0.4, 0.3], atk: 0.5, body: 4, bright: 1.5, sus: 0.5 },
    g: { amp: [0.002, 3, 0.4, 1.2, 0.7], chorus: [0.4], reverb: [0.8, 0.4] } });
add('Keys', 'FM Keys', 'a bright digital piano in the style of FM: a sine with a random-atom partner that fades fast',
  { A1: { lvl: 0.55, wave: 'sine', wavelet: 'db20' },
    B1: { lvl: 0.45, pattern: 'random', seed: 11, wavelet: 'db4', tilt: -3, bars: [0.5, 0.8, 1, 0.9, 0.6, 0.3], body: 1, bright: 0.1, sus: 0 },
    g: { amp: [0.001, 2, 0.1, 0.4, 0.8], chorus: [0.2], reverb: [0.4, 0.15] } });
add('Keys', 'Dream Keys', 'keys in a dream: a triangle, glassy atoms and a long, echoing tail',
  { A1: { lvl: 0.5, wave: 'tri', wavelet: 'db20', fcut: 7, fenv: 1.5 },
    B1: { lvl: 0.45, pattern: 'random', seed: 61, wavelet: 'sym8', tilt: -6, bars: [0.8, 0.8, 0.7, 0.6, 0.4], body: 3, bright: 0.6, sus: 0 },
    g: { amp: [0.003, 3, 0.1, 1, 0.7], chorus: [0.4], delay: [0.42, 0.4, 0.2], reverb: [0.85, 0.5] } });

// ---------------------------------------------------------------- Organ
add('Organ', 'Full Drawbar Organ', 'a rock organ with the drawbars out and a quick percussion on the third: bright and full',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'db20', tilt: -1, bars: [1, 1, 1, 1, 1, 0.8, 0.5], body: 20, bright: 20 },
    B2: { lvl: 0.3, pattern: 'ramp', wavelet: 'db20', tilt: -3, bars: [0, 0, 1, 0.5], oct: 1, env: [0.001, 0.25, 0, 0.05] },
    g: { amp: [0.004, 0.2, 1, 0.06], lfo: { rate: 6.8, pitch: 5 }, chorus: [0.4, 0.8, 0.6], reverb: [0.5, 0.15], drive: 0.15 } });
add('Organ', 'Jazz Organ', 'a jazz organ: the low drawbars with a snappy percussion and a leslie-like vibrato',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'db20', tilt: 0, bars: [1, 1, 0.8, 0.6], body: 20, bright: 20 },
    B2: { lvl: 0.35, pattern: 'ramp', wavelet: 'db20', tilt: -2, bars: [0, 1, 0.7], oct: 1, env: [0.001, 0.3, 0, 0.05] },
    g: { amp: [0.003, 0.2, 1, 0.06], lfo: { rate: 6.2, pitch: 6, cut: 0.4 }, chorus: [0.4, 0.7, 0.6], reverb: [0.4, 0.12], drive: 0.2 } });
add('Organ', 'Church Organ', 'a church organ: principal voices and an octave coupler, a long hall',
  { B1: { lvl: 0.6, pattern: 'mirror', wavelet: 'sym8', tilt: -3, bars: [1, 0.8, 0.7, 0.6, 0.4, 0.3], body: 20, bright: 20 },
    B2: { lvl: 0.45, pattern: 'mirror', wavelet: 'sym8', tilt: -4, bars: [1, 0.7, 0.5, 0.3], oct: -1 },
    g: { amp: [0.03, 0.2, 1, 0.3], uni: [2, 5], reverb: [0.95, 0.5] } });
add('Organ', 'Gospel Organ', 'a gospel organ: full drawbars, a deep rotary shimmer and a gritty drive',
  { B1: { lvl: 0.65, pattern: 'ramp', wavelet: 'db8', tilt: -1, bars: [1, 1, 1, 0.8, 0.8, 0.6], body: 20, bright: 20 },
    B2: { lvl: 0.35, pattern: 'ramp', wavelet: 'db8', tilt: -2, bars: [0, 0, 1, 0.6], oct: 1, env: [0.001, 0.4, 0.1, 0.06] },
    g: { amp: [0.004, 0.2, 1, 0.06], lfo: { rate: 6.8, pitch: 9, cut: 0.5 }, chorus: [0.5, 0.9, 0.7], drive: 0.4, reverb: [0.5, 0.2] } });
add('Organ', 'Pipe Organ Duo', 'a pipe organ: two stops an octave apart with a breath of air at the start of each note',
  { B1: { lvl: 0.6, pattern: 'ramp', wavelet: 'db20', tilt: -5, bars: [1, 0.6, 0.4, 0.2], body: 20, bright: 20 },
    B2: { lvl: 0.4, pattern: 'ramp', wavelet: 'db20', tilt: -7, bars: [1, 0.4, 0.2], oct: 1, fine: 3 },
    g: { amp: [0.02, 0.2, 1, 0.25], reverb: [0.9, 0.45] } });

add('Organ', 'Square Organ', 'a hollow square-wave organ: a square and another an octave above with a short key click',
  { A1: { lvl: 0.55, wave: 'square', wavelet: 'db4', fcut: 6.5, fres: 2 },
    A2: { lvl: 0.35, wave: 'square', wavelet: 'db4', fcut: 7, oct: 1, fine: 3 },
    g: { amp: [0.004, 0.2, 1, 0.06], lfo: { rate: 6, pitch: 4 }, chorus: [0.3], sub: [0.35, 0, 2], reverb: [0.4, 0.15] } });
add('Organ', 'Reed Organ', 'a harmonium: a pulse and a saw, a little nasal, with a slow swell',
  { A1: { lvl: 0.55, wave: 'pulse', width: 0.4, wavelet: 'db8', fcut: 5.5, fres: 2 },
    A2: { lvl: 0.45, wave: 'saw', wavelet: 'db8', fcut: 5, fine: 7, oct: 0 },
    g: { amp: [0.03, 0.2, 1, 0.15], lfo: { rate: 5, pitch: 3 }, chorus: [0.3], reverb: [0.5, 0.2] } });
add('Organ', 'Combo Organ', 'a 60s combo organ: a thin pulse and a bright saw an octave up, a sharp click and a touch of echo',
  { A1: { lvl: 0.5, wave: 'pulse', width: 0.15, wavelet: 'db4', fcut: 8.5, fres: 3 },
    A2: { lvl: 0.4, wave: 'saw', wavelet: 'db4', fcut: 7, oct: 1, fine: 4 },
    g: { amp: [0.001, 0.2, 1, 0.04], lfo: { rate: 7, pitch: 5, cut: 0.8 }, delay: [0.3, 0.3, 0.14], reverb: [0.35, 0.12], drive: 0.15 } });

add('Organ', 'Theatre Organ II', 'a cinema organ: a saw swell with mirror atoms, deep vibrato and a wide hall',
  { A1: { lvl: 0.45, wave: 'saw', wavelet: 'db20', fcut: 5, fres: 2 },
    B1: { lvl: 0.55, pattern: 'mirror', wavelet: 'sym8', tilt: -2, bars: [1, 0.8, 0.7, 0.6, 0.4, 0.3], body: 20, bright: 20 },
    g: { amp: [0.02, 0.2, 1, 0.25], lfo: { rate: 6.5, pitch: 7 }, chorus: [0.5], reverb: [0.9, 0.4] } });
add('Organ', 'Chapel Organ', 'a small chapel organ: a triangle and soft ramp atoms, calm and close',
  { A1: { lvl: 0.5, wave: 'tri', wavelet: 'db20', fcut: 8 },
    B1: { lvl: 0.45, pattern: 'ramp', wavelet: 'db20', tilt: -5, bars: [1, 0.7, 0.5, 0.3, 0.2], body: 20, bright: 20 },
    g: { amp: [0.015, 0.2, 1, 0.2], uni: [2, 4], reverb: [0.8, 0.35] } });
add('Organ', 'Fair Organ', 'a fairground organ: a saw and Walsh atoms, loud, nasal and jolly',
  { A1: { lvl: 0.5, wave: 'saw', wavelet: 'db4', fcut: 7, fres: 2 },
    B1: { lvl: 0.45, pattern: 'walsh', wavelet: 'db4', tilt: -3, bars: [1, 0.9, 0.8, 0.6, 0.5], body: 20, bright: 20 },
    g: { amp: [0.002, 0.2, 1, 0.06], lfo: { rate: 6, pitch: 6 }, chorus: [0.4], reverb: [0.5, 0.2] } });
add('Organ', 'Positive Organ', 'a baroque positive organ: alternating atoms, an airy chiff and a light, woody tone',
  { A1: { lvl: 0.6, wave: 'noise', wavelet: 'db4', ftype: 'bp', fcut: 7, fres: 3, oct: -2, env: [0.002, 0.07, 0, 0.05] },
    B1: { lvl: 0.6, pattern: 'alt', wavelet: 'db8', tilt: -4, bars: [1, 0.3, 0.7, 0.2, 0.5, 0.1], body: 20, bright: 20 },
    g: { amp: [0.006, 0.2, 1, 0.1], reverb: [0.6, 0.25] } });

module.exports = out;
