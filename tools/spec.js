// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — single source of truth.
// Created by Pierre Arnaud GUYOT ("OktoPierre"). Release history: see RELEASE_HISTORY.md
//   beta 0.1 (2026-10-14) — first release.
//   beta 0.2 (2026-10-15) — engines A and B mixed (A/B MIX), triple chorus, 107 presets by category.
//   beta 0.4 (2026-10-17) — SOURCE PHASE (engine A, also an LFO 2 target), 100 presets in the Source Phase section.
//   beta 0.5 (2026-10-17) — OktoPierre's sort: 150 presets, new TOP Sounds, Source Phase second; presets moved between
//                           categories and chosen with the arrow keys in the plug-in's browser.
//   beta 0.6 (2026-10-18) — new panel layout (SUB OSC at the top, LFO 1 and LFO 2 side by side, the chorus in EFFECTS,
//                           VOICE at the bottom, one MANUAL button); tempo sync of the delay and both LFOs (plug-in);
//                           the web app's welcome window and DOWNLOAD VST button.
// Parameters, panel layout and factory presets are defined here once and
// generated into web/js/spec.js and vst/src/generated/spec.h by gen_spec.js.
// Parameter order defines the VST3 ParamIDs: append only, never reorder.
'use strict';

const DEVICE = { w: 1100, h: 720 };
const APP = {
  name: 'Wavelet Synthesizer',
  author: 'Pierre Arnaud GUYOT',
  credit: 'created by OktoPierre',   // shown on the panel
  copyright: 'Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)',
  license: 'GPL v3',                 // shown on the panel; the licence is GPL-3.0-or-later (file LICENSE)
  version: 'beta 0.6',
  versionNum: '0.6.0',
  date: '2026-10-17',
  doi: '10.5281/zenodo.23431760',   // the Zenodo record of the code (https://zenodo.org/records/23431760)
};
const DEFAULT_PRESET = 'A · Warm Pad';   // sound loaded when the app / a new plugin instance opens (first preset)

// curve: lin | exp | pow2 | int | choice
// fmt:   pct | db | sec | hz | cents | band | dbband | int | choice | deg | cyc | semi | bipct | bandamt
const P = [];
function add(key, name, short, o) { P.push(Object.assign({ key, name, short, curve: 'lin', fmt: 'pct', hidden: false, structural: false }, o)); }

add('engine', 'Engine', 'ENGINE', { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 0, structural: true,
  choices: ['A · Subtractive', 'B · Additive'], choiceShort: ['A · SUBTRACTIVE', 'B · ADDITIVE'] });
add('wavelet', 'Wavelet', 'WAVELET', { curve: 'choice', fmt: 'choice', min: 0, max: 6, def: 2, structural: true,
  choices: ['Haar', 'Daubechies 2', 'Daubechies 4', 'Daubechies 8', 'Symlet 8', 'Coiflet 3', 'Daubechies 20'],
  choiceShort: ['HAAR', 'DB2', 'DB4', 'DB8', 'SYM8', 'COIF3', 'DB20'] });
add('a_wave', 'Source Wave', 'WAVE', { curve: 'choice', fmt: 'choice', min: 0, max: 5, def: 0, structural: true,
  choices: ['Saw', 'Square', 'Pulse', 'Triangle', 'Sine', 'Noise'], choiceShort: ['SAW', 'SQUARE', 'PULSE', 'TRI', 'SINE', 'NOISE'] });
add('a_width', 'Source Width', 'WIDTH', { min: 0.02, max: 0.98, def: 0.5, structural: true });
add('a_sparsity', 'Sparsity', 'SPARSITY', { min: 0, max: 1, def: 0, structural: true });
add('b_pattern', 'Atom Pattern', 'PATTERN', { curve: 'choice', fmt: 'choice', min: 0, max: 5, def: 0, structural: true,
  choices: ['Ramp', 'Mirror', 'Alternate', 'Walsh', 'Impulse', 'Random'], choiceShort: ['RAMP', 'MIRROR', 'ALT', 'WALSH', 'IMPULSE', 'RANDOM'] });
add('b_seed', 'Random Seed', 'SEED', { curve: 'int', fmt: 'int', min: 0, max: 99, def: 1, structural: true });
add('b_tilt', 'Tilt', 'TILT', { fmt: 'dbband', min: -24, max: 12, def: -6 });
for (let b = 1; b <= 11; b++) add('b_bar' + b, 'Band ' + b + ' Level', String(b), { min: 0, max: 1, def: 1 });
add('b_atk', 'Scale Attack', 'ATTACK', { curve: 'exp', fmt: 'sec', min: 0.001, max: 5, def: 0.005 });
add('b_spread', 'Attack Spread', 'SPREAD', { fmt: 'bipct', min: -1, max: 1, def: 0 });
add('b_body', 'Body Decay', 'BODY', { curve: 'exp', fmt: 'sec', min: 0.01, max: 20, def: 20 });
add('b_bright', 'Bright Decay', 'BRIGHT', { curve: 'exp', fmt: 'sec', min: 0.01, max: 20, def: 20 });
add('b_sus', 'Scale Sustain', 'SUSTAIN', { min: 0, max: 1, def: 1 });
add('f_type', 'Filter Type', 'TYPE', { curve: 'choice', fmt: 'choice', min: 0, max: 3, def: 0,
  choices: ['Low-pass', 'High-pass', 'Band-pass', 'Band-reject'], choiceShort: ['LOW-PASS', 'HIGH-PASS', 'BAND-PASS', 'BAND-REJ'] });
add('f_cutoff', 'Cutoff', 'CUTOFF', { fmt: 'band', min: 0, max: 12, def: 12 });   // 12 = fully open
add('f_slope', 'Slope', 'SLOPE', { fmt: 'dbband', min: 6, max: 96, def: 24 });
add('f_res', 'Resonance', 'RESO', { fmt: 'db', min: 0, max: 24, def: 0 });
add('f_keytrk', 'Key Tracking', 'KEY TRK', { min: 0, max: 1, def: 1 });
add('f_env', 'Envelope Amount', 'ENV AMT', { fmt: 'band', min: -11, max: 11, def: 0 });
add('f_vel', 'Velocity Amount', 'VEL AMT', { fmt: 'band', min: -6, max: 6, def: 0 });
add('p_center', 'Position', 'POSITION', { fmt: 'deg', min: 0, max: 1, def: 0 });
add('p_width', 'Window Width', 'WIDTH', { fmt: 'pct', min: 0.05, max: 1, def: 0.5 });
add('p_depth', 'Window Depth', 'DEPTH', { min: 0, max: 1, def: 0 });
add('amp_a', 'Amp Attack', 'ATTACK', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.003 });
add('amp_d', 'Amp Decay', 'DECAY', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.4 });
add('amp_s', 'Amp Sustain', 'SUSTAIN', { min: 0, max: 1, def: 0.8 });
add('amp_r', 'Amp Release', 'RELEASE', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.3 });
add('amp_vel', 'Amp Velocity', 'VELOCITY', { min: 0, max: 1, def: 0.5 });
add('mod_a', 'Mod Attack', 'ATTACK', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.003 });
add('mod_d', 'Mod Decay', 'DECAY', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.5 });
add('mod_s', 'Mod Sustain', 'SUSTAIN', { min: 0, max: 1, def: 0.3 });
add('mod_r', 'Mod Release', 'RELEASE', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.5 });
add('lfo_shape', 'LFO 1 Shape', 'SHAPE', { curve: 'choice', fmt: 'choice', min: 0, max: 4, def: 0,
  choices: ['Sine', 'Triangle', 'Saw', 'Square', 'Sample & Hold'], choiceShort: ['SINE', 'TRI', 'SAW', 'SQR', 'S&H'] });
add('lfo_rate', 'LFO 1 Rate', 'RATE', { curve: 'exp', fmt: 'hz', min: 0.05, max: 20, def: 4 });
add('lfo_pitch', 'LFO 1 to Pitch', 'PITCH', { fmt: 'cents', min: 0, max: 100, def: 0 });
add('lfo_cut', 'LFO 1 to Cutoff', 'CUTOFF', { fmt: 'bandamt', min: 0, max: 6, def: 0 });
add('lfo_pos', 'LFO 1 to Position', 'POSITION', { fmt: 'cyc', min: 0, max: 0.5, def: 0 });
add('v_oct', 'Octave', 'OCTAVE', { curve: 'int', fmt: 'int', min: -3, max: 3, def: 0 });
add('v_fine', 'Fine Tune', 'FINE', { fmt: 'cents', min: -100, max: 100, def: 0 });
add('v_voices', 'Voices', 'VOICES', { curve: 'int', fmt: 'int', min: 1, max: 16, def: 8 });
add('v_glide', 'Glide', 'GLIDE', { curve: 'pow2', fmt: 'sec', min: 0, max: 2, def: 0 });
add('v_unison', 'Unison', 'UNISON', { curve: 'int', fmt: 'int', min: 1, max: 4, def: 1 });
add('v_detune', 'Unison Detune', 'DETUNE', { fmt: 'cents', min: 0, max: 50, def: 12 });
add('v_width', 'Stereo Width', 'STEREO', { min: 0, max: 1, def: 0.7 });
add('fx_drive', 'Drive', 'DRIVE', { min: 0, max: 1, def: 0 });
add('fx_dtime', 'Delay Time', 'TIME', { curve: 'exp', fmt: 'sec', min: 0.01, max: 1, def: 0.35 });
add('fx_dfb', 'Delay Feedback', 'FEEDBACK', { min: 0, max: 0.9, def: 0.35 });
add('fx_dmix', 'Delay Mix', 'DLY MIX', { min: 0, max: 1, def: 0 });
add('fx_rsize', 'Reverb Size', 'SIZE', { min: 0, max: 1, def: 0.6 });
add('fx_rmix', 'Reverb Mix', 'REV MIX', { min: 0, max: 1, def: 0 });
add('master', 'Master Volume', 'VOLUME', { fmt: 'db', min: -36, max: 6, def: -3 });
add('bend', 'Pitch Bend', 'BEND', { fmt: 'bipct', min: -1, max: 1, def: 0, hidden: true });
add('modwheel', 'Mod Wheel', 'MOD', { min: 0, max: 1, def: 0, hidden: true });
add('hold', 'Sustain Pedal', 'HOLD', { min: 0, max: 1, def: 0, hidden: true });
// sub oscillator (beta 0.1): a pure sine/triangle/square one or two octaves below the note, not filtered
add('sub_level', 'Sub Level', 'LEVEL', { min: 0, max: 1, def: 0 });
add('sub_oct', 'Sub Octave', 'OCT', { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 0,
  choices: ['−1 octave', '−2 octaves'], choiceShort: ['−1', '−2'] });
add('sub_shape', 'Sub Shape', 'SHAPE', { curve: 'choice', fmt: 'choice', min: 0, max: 2, def: 0,
  choices: ['Sine', 'Triangle', 'Square'], choiceShort: ['SIN', 'TRI', 'SQR'] });
// portamento mode (beta 0.1): Off; Poly = polyphonic portamento (every voice glides from its own previous note;
// one note at a time = from the previous note); Legato only = glide only while another key is held
add('v_porta', 'Portamento', 'PORTA', { curve: 'choice', fmt: 'choice', min: 0, max: 2, def: 1,
  choices: ['Off', 'Poly', 'Legato only'], choiceShort: ['OFF', 'POLY', 'LEGATO'] });
// beta 0.2: engines A and B mixed, and a string-machine triple chorus.
// A/B MIX makes the sound (0 = engine A alone, 1 = engine B alone); the ENGINE tabs only choose the panel shown.
// States and presets saved without A/B MIX get A/B MIX = ENGINE, so they sound as before.
add('ab_mix', 'A/B Mix', 'MIX', { fmt: 'abmix', min: 0, max: 1, def: 0 });
add('ch_mix', 'Chorus', 'CHORUS', { min: 0, max: 1, def: 0 });
add('ch_rate', 'Chorus Rate', 'RATE', { curve: 'exp', fmt: 'hz', min: 0.1, max: 3, def: 0.7 });
add('ch_depth', 'Chorus Depth', 'DEPTH', { min: 0, max: 1, def: 0.6 });
// beta 0.3: WAVELET MORPH. The sound is also built with WAVELET 2 and crossfaded with the main one: position MORPH
// (0 = WAVELET, 1 = WAVELET 2) + LFO x LFO TO WAVELET + mod envelope x ENV TO WAVELET. Audible where the wavelet
// shapes the sound: scale filter (CUTOFF, RESO), sparsity, position window, and all of engine B. The defaults (all 0)
// keep the sound of older presets and Live Sets bit-identical.
add('wav2', 'Wavelet 2', 'WAVELET 2', { curve: 'choice', fmt: 'choice', min: 0, max: 6, def: 0, structural: true,
  choices: ['Haar', 'Daubechies 2', 'Daubechies 4', 'Daubechies 8', 'Symlet 8', 'Coiflet 3', 'Daubechies 20'],
  choiceShort: ['HAAR', 'DB2', 'DB4', 'DB8', 'SYM8', 'COIF3', 'DB20'] });
add('wmorph', 'Wavelet Morph', 'MORPH', { min: 0, max: 1, def: 0 });
add('lfo_wav', 'LFO 1 to Wavelet Morph', 'WAVELET', { min: 0, max: 1, def: 0 });
add('env_wav', 'Envelope to Wavelet Morph', 'ENV>WAV', { fmt: 'bipct', min: -1, max: 1, def: 0 });
// beta 0.3: LFO 2, a second free-running LFO on one parameter of the SCALE FILTER or the POSITION window (the TARGET menu
// next to its title, LFO2_TARGETS below). AMOUNT moves the target by up to ± half its range (kept in range; POSITION wraps
// round the cycle); 0 % (the default) leaves every older sound bit-identical.
add('lfo2_shape', 'LFO 2 Shape', 'SHAPE', { curve: 'choice', fmt: 'choice', min: 0, max: 4, def: 0,
  choices: ['Sine', 'Triangle', 'Saw', 'Square', 'Sample & Hold'], choiceShort: ['SINE', 'TRI', 'SAW', 'SQR', 'S&H'] });
add('lfo2_rate', 'LFO 2 Rate', 'RATE', { curve: 'exp', fmt: 'hz', min: 0.05, max: 20, def: 1 });
add('lfo2_amt', 'LFO 2 Amount', 'AMOUNT', { fmt: 'bipct', min: -1, max: 1, def: 0 });
add('lfo2_target', 'LFO 2 Target', 'TARGET', { curve: 'choice', fmt: 'choice', min: 0, max: 9, def: 0,
  choices: ['Cutoff', 'Slope', 'Resonance', 'Key Tracking', 'Envelope Amount', 'Velocity Amount', 'Position', 'Window Width', 'Window Depth',
    'Source Phase'],
  choiceShort: ['CUTOFF', 'SLOPE', 'RESO', 'KEY TRK', 'ENV AMT', 'VEL AMT', 'POSITION', 'WIDTH', 'DEPTH', 'PHASE'] });
// beta 0.4: SOURCE PHASE (engine A). The source wave is moved inside the cycle before the wavelet transform: sample i is
// the wave at frac(i/N + phase) (the noise cycle is shifted by round(phase·N) samples). The transform is shift-variant, so
// the scale filter, the sparsity and the position window meet other atoms and the timbre changes: strongly with Haar and
// Daubechies 2/4, weakly with Daubechies 20; a shift by a multiple of 2^(12-b) samples leaves band b as it was. 0 (the
// default) is the source of beta 0.3: older sounds stay bit-identical. LFO 2 can move it (its last TARGET): the tables
// are then also built at PHASE_K positions round the cycle and each voice crossfades between the two nearest (core.js).
add('a_phase', 'Source Phase', 'PHASE', { fmt: 'deg', min: 0, max: 1, def: 0, structural: true });
// beta 0.6: TEMPO SYNC (VST plug-in: the host's tempo, 120 BPM when the host gives none). SYNC on: the delay's TIME and the
// LFOs' RATE become note values (T = triplet, x 2/3; D = dotted, x 1.5), listed by length (the knob goes one way); the
// delay holds up to 4 s. The web app has no tempo: it keeps seconds and hertz (its panel has no SYNC). Off by default.
const noteBeats = n => {   // '1/8 D' -> 0.75 beat (a quarter note = 1)
  const m = /^(\d+)\/(\d+)( [TD])?$/.exec(n);
  return 4 * m[1] / m[2] * (m[3] === ' T' ? 2 / 3 : m[3] === ' D' ? 1.5 : 1);
};
const DELAY_NOTES = ['1/32', '1/16 T', '1/16', '1/8 T', '1/16 D', '1/8', '1/4 T', '1/8 D', '1/4', '1/2 T', '1/4 D', '1/2', '1/2 D', '1/1'];
const LFO_NOTES = ['4/1', '2/1', '1/1', '1/2 D', '1/2', '1/4 D', '1/2 T', '1/4', '1/8 D', '1/4 T', '1/8', '1/16 D', '1/8 T', '1/16',
  '1/16 T', '1/32'];
const syncChoice = { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 0, choices: ['Off', 'On'], choiceShort: ['OFF', 'SYNC'] };
const notes = (list, def) => ({ curve: 'choice', fmt: 'choice', min: 0, max: list.length - 1, def: list.indexOf(def), choices: list,
  choiceShort: list.map(n => n.replace(' ', '')) });
add('fx_dsync', 'Delay Sync', 'SYNC', syncChoice);
add('fx_ddiv', 'Delay Time (sync)', 'TIME', notes(DELAY_NOTES, '1/8'));
add('lfo_sync', 'LFO 1 Sync', 'SYNC', syncChoice);
add('lfo_div', 'LFO 1 Rate (sync)', 'RATE', notes(LFO_NOTES, '1/4'));
add('lfo2_sync', 'LFO 2 Sync', 'SYNC', syncChoice);
add('lfo2_div', 'LFO 2 Rate (sync)', 'RATE', notes(LFO_NOTES, '1/4'));
const DELAY_BEATS = DELAY_NOTES.map(noteBeats), LFO_BEATS = LFO_NOTES.map(noteBeats);
for (const b of [DELAY_BEATS, LFO_BEATS]) for (let i = 1; i < b.length; i++)
  if ((b === DELAY_BEATS) !== (b[i] > b[i - 1])) throw new Error('note values must be listed by length');

// the parameters LFO 2 can move, in the order of the TARGET choices (all linear: the move is in plain units)
const LFO2_TARGETS = ['f_cutoff', 'f_slope', 'f_res', 'f_keytrk', 'f_env', 'f_vel', 'p_center', 'p_width', 'p_depth', 'a_phase'];

const idx = Object.fromEntries(P.map((p, i) => [p.key, i]));
if (LFO2_TARGETS.length !== P[idx.lfo2_target].choices.length || LFO2_TARGETS.some(k => !(k in idx) || (P[idx[k]].curve || 'lin') !== 'lin'))
  throw new Error('LFO2_TARGETS must match the lfo2_target choices and be linear parameters');

// ---------------------------------------------------------------- layout
// Sections are cards; widget coordinates are relative to their section.
// widget types: knobL knobM knobS knobT seg step drawbar scope scalogram atom source
//               window adsr leds fxheads keyboard wheels logo presets manual download meter zoom credit menu toggle label
// beta 0.6 widget fields: only 'web' / 'vst' (shown in one of them), vis + visOn (shown while that parameter is on / off,
// the plug-in's SYNC), style 'value' (a knob labelled with its value: note values), text (toggle, label, menu caption)
const S = [];
function section(id, title, x, y, w, h, mode, widgets) { S.push({ id, title, x, y, w, h, mode: mode || '', widgets }); }
const kn = (key, x, y, t) => ({ type: t || 'knobM', param: key, x, y, w: t === 'knobL' ? 80 : 52, h: t === 'knobL' ? 92 : 60 });
const row = (keys, x0, y) => keys.map((k, i) => kn(k, x0 + i * 52, y));

section('header', '', 0, 0, 1100, 48, '', [
  { type: 'logo', x: 16, y: 8, w: 200, h: 32 },
  { type: 'zoom', x: 222, y: 14, w: 50, h: 20 },
  { type: 'seg', param: 'engine', style: 'engine', x: 290, y: 9, w: 264, h: 30 },
  { type: 'presets', x: 566, y: 9, w: 300, h: 30 },
  { type: 'download', only: 'web', x: 876, y: 9, w: 68, h: 30 },   // beta 0.6; the plug-in has SAVE PRESET there
  { type: 'manual', x: 950, y: 9, w: 68, h: 30 },                    // beta 0.6: the manual of the engine shown
  { type: 'knobS', param: 'master', x: 1028, y: 6, w: 36, h: 36 },
  { type: 'meter', x: 1072, y: 9, w: 14, h: 30 },
]);

section('engA', 'ENGINE A · WAVELET SUBTRACTIVE', 12, 56, 544, 260, 'A', [
  { type: 'seg', param: 'a_wave', x: 12, y: 32, w: 520, h: 28 },
  { type: 'atom', x: 12, y: 70, w: 250, h: 104 },
  { type: 'step', param: 'wavelet', x: 12, y: 180, w: 250, h: 28 },
  { type: 'step', param: 'wav2', x: 12, y: 214, w: 250, h: 28 },   // WAVELET MORPH (beta 0.3)
  { type: 'source', x: 276, y: 70, w: 126, h: 64 },   // narrower since beta 0.4: SOURCE PHASE at its right
  kn('a_phase', 408, 70),
  kn('wmorph', 470, 64), kn('env_wav', 470, 122),
  kn('a_width', 280, 146, 'knobL'),
  kn('a_sparsity', 376, 146, 'knobL'),
  kn('ab_mix', 470, 180),   // same place in both engine panels
]);

const bars = [];
for (let b = 1; b <= 11; b++) bars.push({ type: 'drawbar', param: 'b_bar' + b, x: 12 + (b - 1) * 30, y: 70, w: 24, h: 98 });
section('engB', 'ENGINE B · WAVELET ADDITIVE', 12, 56, 544, 260, 'B', [
  { type: 'seg', param: 'b_pattern', x: 12, y: 32, w: 520, h: 28 },
  ...bars,
  { type: 'atom', x: 356, y: 70, w: 176, h: 64 },
  { type: 'step', param: 'wavelet', x: 356, y: 140, w: 176, h: 28 },
  kn('b_tilt', 356, 180), kn('b_seed', 412, 180), kn('ab_mix', 470, 180),
  ...row(['b_atk', 'b_spread', 'b_body', 'b_bright', 'b_sus'], 12, 198),
]);

// beta 0.6: SUB OSC next to the oscillator; the scope narrower, SCALOGRAM written above the scalogram
section('sub', 'SUB OSC', 564, 56, 112, 260, '', [
  kn('sub_level', 16, 40, 'knobL'),
  kn('sub_oct', 4, 156), kn('sub_shape', 56, 156),
]);
section('display', 'SCOPE', 684, 56, 404, 260, '', [
  { type: 'scope', x: 12, y: 30, w: 380, h: 92 },
  { type: 'label', text: 'SCALOGRAM', x: 12, y: 126, w: 380, h: 14 },
  { type: 'scalogram', x: 12, y: 142, w: 380, h: 106 },
]);

section('filter', 'SCALE FILTER', 12, 324, 336, 140, '', [
  { type: 'seg', param: 'f_type', x: 12, y: 30, w: 312, h: 24 },
  ...row(['f_cutoff', 'f_slope', 'f_res', 'f_keytrk', 'f_env', 'f_vel'], 12, 64),
]);
section('position', 'POSITION', 356, 324, 180, 140, '', [
  { type: 'window', x: 12, y: 30, w: 156, h: 24 },
  ...row(['p_center', 'p_width', 'p_depth'], 12, 64),
]);
section('ampenv', 'AMP ENVELOPE', 544, 324, 284, 140, '', [
  { type: 'adsr', env: 'amp', x: 12, y: 30, w: 260, h: 26 },
  ...row(['amp_a', 'amp_d', 'amp_s', 'amp_r', 'amp_vel'], 12, 64),
]);
section('modenv', 'MOD ENVELOPE', 836, 324, 252, 140, '', [
  { type: 'adsr', env: 'mod', x: 12, y: 30, w: 228, h: 26 },
  ...row(['mod_a', 'mod_d', 'mod_s', 'mod_r'], 22, 64),
]);
// beta 0.6: LFO 1 and LFO 2 side by side, the same size; the plug-in's SYNC buttons swap RATE / TIME for a note value
const synced = (key, div, sync, x, y) => [Object.assign(kn(key, x, y), { vis: sync, visOn: false }),
  Object.assign(kn(div, x, y), { vis: sync, visOn: true, only: 'vst', style: 'value' })];
const syncBtn = (key, x, y) => ({ type: 'toggle', param: key, text: 'SYNC', only: 'vst', x, y, w: 42, h: 17 });
section('lfo', 'LFO 1', 12, 472, 284, 140, '', [
  { type: 'seg', param: 'lfo_shape', x: 12, y: 30, w: 260, h: 24 },
  syncBtn('lfo_sync', 230, 6),
  ...synced('lfo_rate', 'lfo_div', 'lfo_sync', 12, 64),
  ...row(['lfo_pitch', 'lfo_cut', 'lfo_pos', 'lfo_wav'], 64, 64),
]);
section('lfo2', 'LFO 2', 304, 472, 284, 140, '', [
  { type: 'seg', param: 'lfo2_shape', x: 12, y: 30, w: 260, h: 24 },
  syncBtn('lfo2_sync', 230, 6),
  ...synced('lfo2_rate', 'lfo2_div', 'lfo2_sync', 12, 64),
  kn('lfo2_amt', 64, 64),
  { type: 'menu', param: 'lfo2_target', text: 'TARGET', x: 128, y: 84, w: 144, h: 24 },
]);
// the effects in the order of the sound: saturation, chorus (beta 0.6: from its own card), ping-pong delay, reverb
section('fx', 'EFFECTS', 596, 472, 492, 140, '', [
  { type: 'fxheads', x: 0, y: 32, w: 492, h: 18 },
  syncBtn('fx_dsync', 332, 29),
  ...row(['fx_drive', 'ch_mix', 'ch_rate', 'ch_depth'], 12, 64),
  ...synced('fx_dtime', 'fx_ddiv', 'fx_dsync', 220, 64),
  ...row(['fx_dfb', 'fx_dmix', 'fx_rsize', 'fx_rmix'], 272, 64),
]);
section('keys', '', 0, 620, 1100, 100, '', [
  { type: 'wheels', x: 436, y: 0, w: 60, h: 84 },   // beta 0.6: just left of the keyboard
  { type: 'keyboard', x: 504, y: 0, w: 584, h: 84 },   // narrower since beta 0.3 (LFO 2 card), still C2–C7
  { type: 'credit', x: 588, y: 85, w: 500, h: 15 },   // beta 0.6: "Created by OktoPierre" larger
]);
// beta 0.6: VOICE at the bottom left (the wheels moved next to the keyboard): the portamento selector and the voice LEDs in its
// title row, its seven knobs below
section('voice', 'VOICE', 12, 620, 416, 84, '', [
  { type: 'seg', param: 'v_porta', x: 66, y: 4, w: 150, h: 18 },
  { type: 'leds', x: 226, y: 4, w: 180, h: 18 },
  ...row(['v_oct', 'v_fine', 'v_voices', 'v_glide', 'v_unison', 'v_detune', 'v_width'], 26, 24),
]);

// ---------------------------------------------------------------- presets
const bars11 = (arr) => Object.fromEntries(arr.map((v, i) => ['b_bar' + (i + 1), v]));
// "A · Warm Pad" is the first preset and the sound the app opens with; the two "Square Mod" presets
// were designed by OktoPierre from it (knob values read from his panel screenshots and cutoff/resonance
// fitted to the scope curves in those screenshots, 2026-10-14).
const WARM_PAD = { engine: 0, a_wave: 0, wavelet: 5, f_cutoff: 5, f_res: 4, lfo_rate: 0.4, lfo_cut: 0.8,
  amp_a: 0.6, amp_d: 1, amp_s: 0.85, amp_r: 1.4, v_unison: 3, v_detune: 16, v_width: 0.9,
  fx_rsize: 0.7, fx_rmix: 0.3, fx_dtime: 0.42, fx_dfb: 0.3, fx_dmix: 0.12, master: -5 };
// Each engine's presets in their own order; PRESETS below sets the factory order.
const PRESET_LIST = [
  { name: 'A · Warm Pad', v: WARM_PAD },
  { name: 'A · Init', v: { engine: 0, a_wave: 0, wavelet: 2, f_cutoff: 7 } },
  { name: 'A · Wavelet Lead', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 4.5, f_res: 9, f_env: 4, mod_d: 0.6, mod_s: 0.2,
    v_voices: 1, v_glide: 0.06, v_unison: 2, v_detune: 9, lfo_rate: 5.5, lfo_pitch: 8, fx_dmix: 0.22, fx_dtime: 0.32, fx_rmix: 0.15 } },
  { name: 'A · Glass Pad', v: { engine: 0, a_wave: 3, wavelet: 6, f_cutoff: 6, f_res: 12, lfo_rate: 0.3, lfo_cut: 1.5,
    amp_a: 0.8, amp_d: 1, amp_s: 0.8, amp_r: 1.5, v_unison: 3, v_detune: 14, fx_rmix: 0.4, fx_dmix: 0.15, master: -5 } },
  { name: 'A · Noise Brass', v: { engine: 0, a_wave: 5, wavelet: 5, f_cutoff: 3, f_res: 6, f_env: 5, mod_a: 0.08, mod_d: 0.6,
    mod_s: 0.4, amp_a: 0.05, amp_s: 0.9, v_unison: 2, v_detune: 8, fx_rmix: 0.18 } },
  // beta 0.1 additions, from subtle to extreme effects
  { name: 'A · Clean Keys', v: { engine: 0, a_wave: 3, a_width: 0.5, wavelet: 3, f_cutoff: 7, f_env: 2, mod_d: 0.4, mod_s: 0.2,
    amp_a: 0.002, amp_d: 1.2, amp_s: 0.3, amp_r: 0.3, amp_vel: 0.7, fx_rsize: 0.4, fx_rmix: 0.08 } },
  { name: 'A · Dub Echo Lead', v: { engine: 0, a_wave: 2, a_width: 0.3, wavelet: 2, f_cutoff: 5, f_res: 10, f_env: 3, mod_d: 0.3,
    mod_s: 0.1, v_voices: 1, v_glide: 0.04, fx_dtime: 0.375, fx_dfb: 0.72, fx_dmix: 0.55, fx_rmix: 0.2, master: -5 } },
  // beta 0.5: adjusted by OktoPierre (LFO rate 0.366317, sub level 0.261111)
  { name: 'A · Laser Sweep', v: { engine: 0, a_wave: 0, wavelet: 1, f_cutoff: 3, f_res: 20, f_slope: 60, lfo_shape: 2,
    lfo_rate: 0.366317, lfo_cut: 4, p_depth: 0.7, p_width: 0.2, lfo_pos: 0.3, fx_drive: 0.3, fx_dtime: 0.18, fx_dfb: 0.6, fx_dmix: 0.35,
    master: -8, sub_level: 0.261111 } },
  // designed by OktoPierre from "B · Chip Walsh" (knob/drawbar values read from his screenshot, cutoff,
  // resonance, tilt and window fitted to its scope curve within the knobs' precision, 2026-10-14)
  { name: 'B · Mirror Sub Bass', v: { engine: 1, wavelet: 4, b_pattern: 1, b_seed: 98, b_tilt: 4.2,
    ...bars11([1, 0.55, 0.69, 0.62, 0.4, 0, 0, 0, 0, 0, 0]), b_atk: 0.001, b_spread: -0.67, b_bright: 8.2, b_sus: 0.54,
    f_type: 0, f_cutoff: 2.85, f_slope: 74, f_res: 21.6, f_keytrk: 0.79, f_env: 7.5, f_vel: 2.2,
    p_center: 0.48, p_width: 0.48, p_depth: 0.5, amp_a: 0.001, amp_d: 0.2, amp_s: 0.6, amp_r: 0.05,
    lfo_rate: 1.27, lfo_pitch: 12, lfo_cut: 0.8, lfo_pos: 0.023, v_oct: -2, v_unison: 2, v_detune: 2.7, v_porta: 2,
    fx_dmix: 0.2, fx_rmix: 0.18, sub_level: 0.65, sub_oct: 0, sub_shape: 1, master: -6 } },
  { name: 'B · Init', v: { engine: 1, wavelet: 0, b_pattern: 0, b_tilt: -6 } },
  { name: 'B · Octave Organ', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: 0,
    ...bars11([1, 0.8, 0.6, 0.7, 0.3, 0.5, 0.2, 0, 0, 0, 0]), amp_a: 0.01, amp_d: 0.1, amp_s: 1, amp_r: 0.08,
    lfo_rate: 6, lfo_pitch: 6, fx_rmix: 0.2 } },
  { name: 'B · Random Glass', v: { engine: 1, wavelet: 3, b_pattern: 5, b_seed: 17, b_tilt: -4, b_atk: 0.2, b_spread: 0.5,
    b_body: 6, b_bright: 1.5, b_sus: 0.4, amp_a: 0.3, amp_s: 0.9, amp_r: 2, v_unison: 3, lfo_rate: 0.2, lfo_pos: 0.2,
    p_depth: 0.6, fx_rmix: 0.45, master: -5 } },
  { name: 'B · Mirror Pad', v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -5, b_atk: 1.5, b_spread: 1, amp_a: 1,
    amp_r: 2, amp_s: 1, v_unison: 4, v_detune: 18, fx_rmix: 0.5, master: -6 } },
  // beta 0.5: adjusted by OktoPierre (unison 2)
  { name: 'B · Focus Sweep', v: { engine: 1, wavelet: 0, b_pattern: 0, b_tilt: -3, p_depth: 1, p_width: 0.3,
    lfo_rate: 0.5, lfo_pos: 0.5, amp_s: 1, fx_dmix: 0.25, fx_rmix: 0.2, v_unison: 2 } },
  // beta 0.1 additions, from subtle to extreme effects
  { name: 'B · Music Box', v: { engine: 1, wavelet: 4, b_pattern: 3, b_tilt: -2, b_atk: 0.001, b_body: 1.5, b_bright: 0.2, b_sus: 0,
    amp_a: 0.001, amp_d: 2.5, amp_s: 0, amp_r: 1.2, v_oct: 1, fx_dtime: 0.28, fx_dfb: 0.35, fx_dmix: 0.25, fx_rmix: 0.25 } },
  { name: 'B · Space Choir', v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -6, b_atk: 1.2, b_spread: 1, amp_a: 1.2, amp_s: 1,
    amp_r: 3, v_unison: 4, v_detune: 22, lfo_rate: 0.25, lfo_pos: 0.25, p_depth: 0.5, fx_rsize: 0.95, fx_rmix: 0.75, master: -8 } },
  { name: 'B · Distorted Organ', v: { engine: 1, wavelet: 3, b_pattern: 0, b_tilt: 0, ...bars11([1, 1, 0.8, 0.6, 0.4, 0.6, 0.3, 0, 0, 0, 0]),
    amp_a: 0.005, amp_s: 1, amp_r: 0.1, lfo_rate: 6.5, lfo_pitch: 10, fx_drive: 0.7, fx_rmix: 0.2, master: -9 } },
  { name: 'B · Alien Texture', v: { engine: 1, wavelet: 1, b_pattern: 5, b_seed: 42, b_tilt: -2,
    ...bars11([1, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0, 0, 0, 0]), lfo_shape: 4, lfo_rate: 7, lfo_pos: 0.5,
    p_depth: 0.8, p_width: 0.3, lfo_cut: 2, f_cutoff: 10, b_atk: 0.4, b_spread: -1, amp_a: 0.3, amp_r: 2,
    fx_dtime: 0.33, fx_dfb: 0.7, fx_dmix: 0.4, fx_rsize: 0.9, fx_rmix: 0.5, master: -2 } },

  // ---- beta 0.2: string-machine chorus
  { name: 'A · String Machine', v: { engine: 0, a_wave: 0, wavelet: 6, f_cutoff: 7.5, f_slope: 18, f_res: 2, f_keytrk: 0.6,
    amp_a: 0.35, amp_d: 1, amp_s: 0.9, amp_r: 0.9, amp_vel: 0.2, v_voices: 16, ch_mix: 0.85, ch_rate: 0.65, ch_depth: 0.75,
    fx_rsize: 0.75, fx_rmix: 0.28, master: -6 } },
  { name: 'A · Solina Cellos', v: { engine: 0, a_wave: 0, wavelet: 5, v_oct: -1, f_cutoff: 5.5, f_slope: 24, f_res: 3,
    amp_a: 0.25, amp_s: 0.9, amp_r: 0.7, ch_mix: 0.8, ch_rate: 0.55, ch_depth: 0.8, sub_level: 0.25, sub_shape: 0,
    fx_rmix: 0.25, master: -6 } },
  { name: 'A · Poly Chorus Pad', v: { engine: 0, a_wave: 2, a_width: 0.3, wavelet: 4, f_cutoff: 5, f_res: 6, lfo_rate: 0.35,
    lfo_cut: 1.2, amp_a: 0.5, amp_s: 0.85, amp_r: 1.2, ch_mix: 0.6, ch_rate: 0.9, ch_depth: 0.55, fx_dmix: 0.12, fx_rmix: 0.3,
    master: -6 } },
  { name: 'A · Chorus Square Lead', v: { engine: 0, a_wave: 1, wavelet: 3, f_cutoff: 6, f_res: 7, f_env: 2.5, mod_d: 0.4,
    mod_s: 0.3, v_voices: 1, v_glide: 0.05, v_porta: 2, lfo_rate: 5, lfo_pitch: 6, ch_mix: 0.45, ch_rate: 1.2, ch_depth: 0.5,
    fx_dtime: 0.33, fx_dmix: 0.18, fx_rmix: 0.15, master: -3 } },
  { name: 'B · Ensemble Organ', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: 0,
    ...bars11([1, 0.8, 0.6, 0.7, 0.3, 0.5, 0.2, 0, 0, 0, 0]), amp_a: 0.01, amp_d: 0.1, amp_s: 1, amp_r: 0.12,
    ch_mix: 0.7, ch_rate: 0.8, ch_depth: 0.6, fx_rmix: 0.2, master: -1 } },
  { name: 'B · Glass Ensemble', v: { engine: 1, wavelet: 3, b_pattern: 4, b_tilt: -3, b_atk: 0.1, b_spread: 0.4, b_body: 4,
    b_bright: 1.2, b_sus: 0.6, amp_a: 0.2, amp_s: 0.9, amp_r: 1.5, ch_mix: 0.75, ch_rate: 0.5, ch_depth: 0.7, fx_rmix: 0.4,
    master: 6 } },
  { name: 'B · Chorus Flute', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: -9, ...bars11([1, 0.5, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0]),
    b_atk: 0.08, b_spread: 0.6, amp_a: 0.06, amp_s: 0.9, amp_r: 0.3, lfo_rate: 5, lfo_pitch: 6, ch_mix: 0.55, ch_rate: 0.7,
    ch_depth: 0.5, fx_rmix: 0.18 } },
  // ---- beta 0.2: sub oscillator
  { name: 'A · Reese Sub', v: { engine: 0, a_wave: 0, wavelet: 4, f_cutoff: 4.2, f_res: 4, amp_r: 0.12, v_oct: -1, v_voices: 1,
    v_unison: 3, v_detune: 22, v_width: 0.6, lfo_rate: 0.2, lfo_cut: 0.6, sub_level: 0.75, sub_oct: 0, sub_shape: 0,
    fx_drive: 0.25, master: -7 } },
  // beta 0.5: adjusted by OktoPierre (octave -2, unison 2)
  { name: 'A · Acid Sub', v: { engine: 0, a_wave: 1, wavelet: 0, f_cutoff: 2.5, f_slope: 48, f_res: 18, f_env: 6, f_vel: 2,
    mod_d: 0.22, mod_s: 0, amp_a: 0.002, amp_d: 0.3, amp_s: 0.6, amp_r: 0.08, v_oct: -2, v_voices: 1, v_glide: 0.08, v_porta: 2,
    sub_level: 0.55, sub_oct: 0, sub_shape: 1, fx_drive: 0.35, fx_dtime: 0.375, fx_dfb: 0.4, fx_dmix: 0.15, master: -7, v_unison: 2 } },
  // ---- beta 0.2: engines A and B mixed
  { name: 'AB · Wavelet Choir', v: { engine: 1, ab_mix: 0.55, a_wave: 3, wavelet: 6, b_pattern: 1, b_tilt: -6, b_atk: 0.8,
    b_spread: 1, amp_a: 0.9, amp_s: 1, amp_r: 2.5, v_unison: 3, v_detune: 18, lfo_rate: 0.25, lfo_pos: 0.2, p_depth: 0.4,
    ch_mix: 0.5, ch_rate: 0.45, ch_depth: 0.6, fx_rsize: 0.9, fx_rmix: 0.6, master: -5 } },
  { name: 'AB · Bell Pad', v: { engine: 1, ab_mix: 0.45, a_wave: 0, wavelet: 4, f_cutoff: 5.5, b_pattern: 3, b_tilt: -3,
    b_atk: 0.002, b_body: 4, b_bright: 0.6, b_sus: 0.2, amp_a: 0.3, amp_d: 3, amp_s: 0.6, amp_r: 2, ch_mix: 0.4,
    fx_dmix: 0.18, fx_rmix: 0.45, master: -1 } },
  { name: 'AB · Hybrid Keys', v: { engine: 0, ab_mix: 0.5, a_wave: 1, wavelet: 3, f_cutoff: 6.5, f_env: 3, mod_d: 0.5, mod_s: 0.1,
    b_pattern: 4, b_tilt: -2, b_body: 1.2, b_bright: 0.15, b_sus: 0.1, amp_a: 0.002, amp_d: 1.4, amp_s: 0.25, amp_r: 0.4,
    amp_vel: 0.7, ch_mix: 0.3, fx_rmix: 0.15, master: 0 } },
  { name: 'AB · Organ Lead', v: { engine: 1, ab_mix: 0.35, a_wave: 0, wavelet: 6, f_cutoff: 6, f_res: 6,
    ...bars11([1, 0.8, 0.6, 0.7, 0.3, 0.5, 0.2, 0, 0, 0, 0]), amp_a: 0.01, amp_s: 1, amp_r: 0.1, v_voices: 1, v_glide: 0.06,
    v_porta: 2, lfo_rate: 6, lfo_pitch: 7, fx_drive: 0.25, fx_dmix: 0.2, fx_rmix: 0.15, master: -2 } },
  { name: 'AB · Dream Pad', v: { engine: 0, ab_mix: 0.5, a_wave: 2, a_width: 0.4, wavelet: 5, f_cutoff: 5, f_res: 5,
    lfo_rate: 0.2, lfo_cut: 1, lfo_pos: 0.25, p_depth: 0.4, b_pattern: 1, b_tilt: -6, b_atk: 1, b_spread: 0.8, amp_a: 1.2,
    amp_s: 0.9, amp_r: 3, v_unison: 3, v_detune: 14, ch_mix: 0.65, ch_rate: 0.4, ch_depth: 0.7, fx_dmix: 0.15,
    fx_rsize: 0.85, fx_rmix: 0.55, master: -3 } },
  { name: 'AB · Glass Keys', v: { engine: 1, ab_mix: 0.6, a_wave: 4, wavelet: 3, b_pattern: 4, b_tilt: -3, b_body: 2,
    b_bright: 0.25, b_sus: 0, amp_a: 0.002, amp_d: 2, amp_s: 0, amp_r: 1, amp_vel: 0.6, ch_mix: 0.35, fx_rmix: 0.3, master: 1 } },
  { name: 'AB · Wide Brass', v: { engine: 0, ab_mix: 0.3, a_wave: 0, wavelet: 3, f_cutoff: 3.5, f_res: 5, f_env: 5, mod_a: 0.06,
    mod_d: 0.5, mod_s: 0.5, b_pattern: 0, b_tilt: -2, amp_a: 0.04, amp_s: 0.9, amp_r: 0.3, v_unison: 2, v_detune: 10,
    ch_mix: 0.35, ch_rate: 0.8, fx_rmix: 0.2, master: -3 } },

  // ---- beta 0.2: a library by category (cat), like the factory banks of a hardware synthesizer
  // Bass
  { name: 'A · Ladder Bass', cat: 'Bass', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 2.8, f_slope: 48, f_res: 9, f_env: 4.5, f_vel: 2,
    mod_d: 0.28, mod_s: 0.15, amp_a: 0.002, amp_d: 0.6, amp_s: 0.8, amp_r: 0.1, v_oct: -1, v_voices: 1, v_glide: 0.03, v_porta: 2,
    sub_level: 0.4, sub_shape: 0, fx_drive: 0.2, master: -1 } },
  { name: 'AB · Wobble Bass', cat: 'Bass', v: { engine: 0, ab_mix: 0.3, a_wave: 0, wavelet: 0, f_cutoff: 3, f_res: 10, lfo_rate: 3,
    lfo_cut: 3, b_pattern: 3, v_oct: -1, v_voices: 1, sub_level: 0.6, sub_shape: 0, fx_drive: 0.4, master: -2.5 } },
  // Lead
  { name: 'A · Saw Lead', cat: 'Lead', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 7, f_res: 4, v_voices: 1, v_porta: 2, v_glide: 0.05,
    v_unison: 2, v_detune: 10, lfo_rate: 5.5, lfo_pitch: 5, fx_dtime: 0.375, fx_dfb: 0.35, fx_dmix: 0.18, fx_rmix: 0.15, master: 0.5 } },
  { name: 'A · Whistle Lead', cat: 'Lead', v: { engine: 0, a_wave: 4, wavelet: 6, v_oct: 1, v_voices: 1, v_porta: 2, v_glide: 0.1,
    lfo_rate: 5.5, lfo_pitch: 10, amp_a: 0.04, amp_r: 0.2, fx_dmix: 0.15, fx_rmix: 0.25, master: -1 } },
  { name: 'AB · Hybrid Lead', cat: 'Lead', v: { engine: 1, ab_mix: 0.5, a_wave: 1, wavelet: 4, f_cutoff: 6, f_res: 6, b_pattern: 1,
    ...bars11([1, 0.7, 0.5, 0.4, 0.3, 0.2, 0, 0, 0, 0, 0]), v_voices: 1, v_porta: 2, v_glide: 0.06, lfo_rate: 5, lfo_pitch: 6,
    fx_drive: 0.2, fx_dmix: 0.2, master: -1 } },
  // Keys
  { name: 'A · Tine Piano', cat: 'Keys', v: { engine: 0, a_wave: 3, wavelet: 3, f_cutoff: 5, f_env: 3, f_vel: 2, mod_d: 0.25, mod_s: 0,
    amp_a: 0.002, amp_d: 2.5, amp_s: 0.15, amp_r: 0.5, amp_vel: 0.8, ch_mix: 0.25, ch_rate: 0.9, ch_depth: 0.4, fx_rmix: 0.15, master: -1 } },
  { name: 'AB · Electric Piano', cat: 'Keys', v: { engine: 0, ab_mix: 0.35, a_wave: 4, wavelet: 6, b_pattern: 4, b_tilt: -3, b_body: 1.2,
    b_bright: 0.12, b_sus: 0, amp_a: 0.002, amp_d: 2.2, amp_s: 0.2, amp_r: 0.4, amp_vel: 0.8, ch_mix: 0.4, ch_rate: 0.8,
    ch_depth: 0.5, fx_rmix: 0.15, master: 2 } },
  { name: 'B · Reed Piano', cat: 'Keys', v: { engine: 1, wavelet: 4, b_pattern: 1, b_tilt: -4, ...bars11([1, 0.6, 0.4, 0.2, 0.1, 0, 0, 0, 0, 0, 0]),
    b_body: 1.5, b_bright: 0.3, b_sus: 0.2, amp_a: 0.002, amp_d: 1.8, amp_s: 0.25, amp_r: 0.3, amp_vel: 0.7, fx_drive: 0.25, master: 1 } },
  { name: 'A · Clavi', cat: 'Keys', v: { engine: 0, a_wave: 2, a_width: 0.15, wavelet: 1, f_type: 1, f_cutoff: 2, f_vel: 2,
    amp_a: 0.001, amp_d: 0.45, amp_s: 0.15, amp_r: 0.05, amp_vel: 0.8, master: 0 } },
  { name: 'B · Toy Piano', cat: 'Keys', v: { engine: 1, wavelet: 4, b_pattern: 3, b_tilt: -2, b_atk: 0.001, b_body: 1.2, b_bright: 0.25, b_sus: 0,
    amp_a: 0.001, amp_d: 1.5, amp_s: 0, amp_r: 0.5, v_oct: 1, fx_rmix: 0.2, master: 5.5 } },
  { name: 'A · Lo-Fi Piano', cat: 'Keys', v: { engine: 0, a_wave: 0, wavelet: 2, a_sparsity: 0.55, f_cutoff: 6, f_env: 2, mod_d: 0.3,
    mod_s: 0, amp_a: 0.002, amp_d: 2, amp_s: 0.1, amp_r: 0.4, amp_vel: 0.7, ch_mix: 0.2, fx_rmix: 0.25, master: -1 } },
  // Organ
  { name: 'B · Jazz Organ', cat: 'Organ', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: 0, ...bars11([1, 1, 0.8, 0, 0, 0, 0, 0, 0, 0, 0]),
    amp_a: 0.005, amp_d: 0.1, amp_s: 1, amp_r: 0.06, lfo_rate: 6.5, lfo_pitch: 6, ch_mix: 0.45, ch_rate: 1.2, ch_depth: 0.4,
    fx_drive: 0.1, fx_rmix: 0.15, master: 1 } },
  { name: 'B · Gospel Organ', cat: 'Organ', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: 0, ...bars11([1, 1, 1, 1, 0.6, 0.8, 0.5, 0.3, 0, 0, 0]),
    amp_a: 0.005, amp_s: 1, amp_r: 0.1, lfo_rate: 6.8, lfo_pitch: 8, fx_drive: 0.3, ch_mix: 0.3, fx_rmix: 0.2, master: 3.5 } },
  { name: 'B · Church Organ', cat: 'Organ', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: -1, ...bars11([1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0, 0]),
    amp_a: 0.08, amp_s: 1, amp_r: 0.8, fx_rsize: 0.95, fx_rmix: 0.55, master: -2 } },
  { name: 'B · Reed Organ', cat: 'Organ', v: { engine: 1, wavelet: 4, b_pattern: 1, b_tilt: -2, ...bars11([1, 0.8, 0.6, 0.5, 0.4, 0.3, 0, 0, 0, 0, 0]),
    amp_a: 0.03, amp_s: 1, amp_r: 0.15, ch_mix: 0.5, ch_rate: 0.7, fx_rmix: 0.2, master: 3 } },
  { name: 'B · Flute Organ', cat: 'Organ', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: -6, ...bars11([1, 0.3, 0.15, 0, 0, 0, 0, 0, 0, 0, 0]),
    amp_a: 0.03, amp_s: 1, amp_r: 0.2, lfo_rate: 5.5, lfo_pitch: 4, fx_rmix: 0.3, master: -6 } },
  // Pad
  { name: 'A · Analog Pad', cat: 'Pad', v: { engine: 0, a_wave: 0, wavelet: 5, f_cutoff: 4.5, f_res: 3, lfo_rate: 0.25, lfo_cut: 1,
    amp_a: 0.9, amp_s: 0.9, amp_r: 2, v_unison: 4, v_detune: 18, ch_mix: 0.5, fx_rmix: 0.4, master: -2 } },
  { name: 'B · Halo Pad', cat: 'Pad', v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -5, b_atk: 2.5, b_spread: 1, amp_a: 1.5, amp_s: 1,
    amp_r: 3, v_unison: 3, v_detune: 14, ch_mix: 0.6, ch_rate: 0.35, fx_rsize: 0.95, fx_rmix: 0.7, master: -1 } },
  { name: 'AB · Evolving Pad', cat: 'Pad', v: { engine: 0, ab_mix: 0.5, a_wave: 2, a_width: 0.3, wavelet: 4, f_cutoff: 5, p_depth: 0.6,
    p_width: 0.3, lfo_rate: 0.12, lfo_pos: 0.5, lfo_cut: 0.8, b_pattern: 5, b_seed: 23, b_atk: 3, b_spread: 1, b_tilt: -4,
    amp_a: 2, amp_s: 1, amp_r: 3, v_unison: 2, v_detune: 10, ch_mix: 0.5, fx_dmix: 0.15, fx_rmix: 0.6, master: 0 } },
  // Strings
  { name: 'A · Pizzicato', cat: 'Strings', v: { engine: 0, a_wave: 0, wavelet: 5, f_cutoff: 4, f_env: 4, mod_d: 0.15, mod_s: 0,
    amp_a: 0.002, amp_d: 0.35, amp_s: 0, amp_r: 0.2, fx_rmix: 0.35, master: 1 } },
  { name: 'A · Slow Strings', cat: 'Strings', v: { engine: 0, a_wave: 0, wavelet: 6, f_cutoff: 7, f_slope: 18, amp_a: 1.2, amp_s: 0.9,
    amp_r: 2, ch_mix: 0.7, ch_rate: 0.5, ch_depth: 0.7, fx_rmix: 0.5, master: -1 } },
  { name: 'AB · Analog Strings', cat: 'Strings', v: { engine: 0, ab_mix: 0.25, a_wave: 0, wavelet: 6, b_pattern: 0, b_tilt: -6,
    f_cutoff: 6.5, amp_a: 0.3, amp_s: 0.9, amp_r: 1, ch_mix: 0.9, ch_rate: 0.6, ch_depth: 0.8, fx_rmix: 0.3, master: -0.5 } },
  // Brass & Wind
  { name: 'B · Clarinet', cat: 'Brass & Wind', v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -6, ...bars11([1, 0.6, 0.4, 0.2, 0, 0, 0, 0, 0, 0, 0]),
    b_atk: 0.05, amp_a: 0.05, amp_s: 0.9, amp_r: 0.15, lfo_rate: 5, lfo_pitch: 5, fx_rmix: 0.2, master: -3.5 } },
  // Pluck
  { name: 'A · Harp', cat: 'Pluck', v: { engine: 0, a_wave: 3, wavelet: 6, f_cutoff: 4.5, f_env: 4, mod_d: 0.6, mod_s: 0, amp_a: 0.002,
    amp_d: 2, amp_s: 0, amp_r: 1, fx_rsize: 0.8, fx_rmix: 0.45, master: -2.5 } },
  { name: 'A · Synth Pluck', cat: 'Pluck', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 2.5, f_res: 6, f_env: 7, mod_d: 0.2, mod_s: 0,
    amp_a: 0.001, amp_d: 0.5, amp_s: 0, amp_r: 0.3, fx_dtime: 0.375, fx_dfb: 0.4, fx_dmix: 0.25, fx_rmix: 0.2, master: -0.5 } },
  { name: 'AB · Arp Pluck', cat: 'Pluck', v: { engine: 0, ab_mix: 0.3, a_wave: 1, wavelet: 2, f_cutoff: 3.5, f_env: 5, mod_d: 0.15,
    mod_s: 0, b_pattern: 3, amp_a: 0.001, amp_d: 0.35, amp_s: 0, amp_r: 0.15, ch_mix: 0.3, fx_dtime: 0.25, fx_dfb: 0.45,
    fx_dmix: 0.3, master: 1 } },
  // Bells & Mallets
  { name: 'B · Glockenspiel', cat: 'Bells & Mallets', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: 0, ...bars11([1, 0, 0, 0.5, 0, 0.25, 0, 0, 0, 0, 0]),
    b_body: 2.5, b_bright: 0.6, b_sus: 0, amp_a: 0.001, amp_d: 3, amp_s: 0, amp_r: 1.5, v_oct: 1, fx_rmix: 0.3, master: -0.5 } },
  { name: 'B · Vibraphone', cat: 'Bells & Mallets', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: -4,
    ...bars11([1, 0, 0.35, 0, 0.15, 0, 0, 0, 0, 0, 0]), b_body: 3, b_bright: 1, b_sus: 0, amp_a: 0.002, amp_d: 3.5, amp_s: 0,
    amp_r: 1.2, ch_mix: 0.35, ch_rate: 2.5, ch_depth: 0.3, fx_rmix: 0.3, master: 0.5 } },
  { name: 'B · Marimba', cat: 'Bells & Mallets', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: -2, ...bars11([1, 0, 0.3, 0, 0, 0, 0, 0, 0, 0, 0]),
    b_body: 0.7, b_bright: 0.1, b_sus: 0, amp_a: 0.001, amp_d: 0.9, amp_s: 0, amp_r: 0.3, fx_rmix: 0.2, master: 1 } },
  { name: 'B · Tubular Bells', cat: 'Bells & Mallets', v: { engine: 1, wavelet: 4, b_pattern: 3, b_tilt: -1, b_body: 6, b_bright: 1.5,
    b_sus: 0, amp_a: 0.001, amp_d: 6, amp_s: 0, amp_r: 3, fx_rsize: 0.9, fx_rmix: 0.5, master: 5 } },
  { name: 'AB · Crystal Bell', cat: 'Bells & Mallets', v: { engine: 1, ab_mix: 0.7, a_wave: 4, wavelet: 3, b_pattern: 3, b_tilt: -2,
    b_body: 3, b_bright: 0.5, b_sus: 0, amp_a: 0.001, amp_d: 3, amp_s: 0, amp_r: 2, ch_mix: 0.3, fx_dmix: 0.2, fx_rmix: 0.4,
    master: 3 } },
  // FX
  { name: 'A · Wind', cat: 'FX', v: { engine: 0, a_wave: 5, wavelet: 5, f_type: 0, f_cutoff: 4, f_res: 10, lfo_rate: 0.15, lfo_cut: 2.5,
    amp_a: 1.5, amp_s: 1, amp_r: 3, fx_rsize: 0.9, fx_rmix: 0.6, master: 1.5 } },
  { name: 'B · Sci-Fi Burble', cat: 'FX', v: { engine: 1, wavelet: 2, b_pattern: 5, b_seed: 61, lfo_shape: 4, lfo_rate: 9, lfo_pos: 0.5,
    p_depth: 1, p_width: 0.2, amp_s: 1, amp_r: 0.5, fx_dtime: 0.2, fx_dfb: 0.6, fx_dmix: 0.35, master: -1.5 } },
  { name: 'AB · Robot Voice', cat: 'FX', v: { engine: 0, ab_mix: 0.4, a_wave: 1, wavelet: 0, f_type: 2, f_cutoff: 5, f_res: 14,
    lfo_shape: 4, lfo_rate: 8, lfo_cut: 2.5, b_pattern: 3, amp_s: 1, amp_r: 0.2, fx_drive: 0.3, master: 4.5 } },
  { name: 'A · Alarm', cat: 'FX', v: { engine: 0, a_wave: 1, wavelet: 0, f_cutoff: 9, lfo_shape: 1, lfo_rate: 2.5, lfo_pitch: 100,
    amp_s: 1, amp_r: 0.1, v_voices: 1, fx_dmix: 0.2, master: -5.5 } },
  // Drums & Perc (play them on the keyboard: the pitch follows the key)
  { name: 'AB · Sub Kick', cat: 'Drums & Perc', v: { engine: 0, ab_mix: 0.15, a_wave: 4, wavelet: 6, b_pattern: 4, b_body: 0.05,
    b_bright: 0.01, b_sus: 0, amp_a: 0.001, amp_d: 0.3, amp_s: 0, amp_r: 0.05, v_oct: -1, sub_level: 0.7, sub_oct: 0, sub_shape: 0,
    master: -6 } },
  { name: 'A · Noise Snare', cat: 'Drums & Perc', v: { engine: 0, a_wave: 5, wavelet: 2, f_type: 1, f_cutoff: 2.5, amp_a: 0.001, amp_d: 0.2, amp_s: 0,
    amp_r: 0.1, sub_level: 0.5, sub_shape: 1, sub_oct: 0, fx_rmix: 0.15, master: 3 } },
  { name: 'A · Closed Hat', cat: 'Drums & Perc', v: { engine: 0, a_wave: 5, wavelet: 0, f_type: 1, f_cutoff: 4.5, f_res: 4, fx_drive: 0.3, amp_a: 0.001, amp_d: 0.06, amp_s: 0,
    amp_r: 0.04, master: 6 } },
  { name: 'A · Open Hat', cat: 'Drums & Perc', v: { engine: 0, a_wave: 5, wavelet: 0, f_type: 1, f_cutoff: 4.5, f_res: 4, fx_drive: 0.3, amp_a: 0.001, amp_d: 0.5, amp_s: 0,
    amp_r: 0.3, master: 6 } },
  { name: 'B · Wood Block', cat: 'Drums & Perc', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: 0, ...bars11([1, 0, 0.6, 0, 0.3, 0, 0, 0, 0, 0, 0]),
    b_body: 0.25, b_bright: 0.05, b_sus: 0, amp_a: 0.001, amp_d: 0.22, amp_s: 0, amp_r: 0.06, v_oct: 1, master: 3.5 } },
  { name: 'A · Synth Tom', cat: 'Drums & Perc', v: { engine: 0, a_wave: 3, wavelet: 6, f_cutoff: 4, f_env: 3, mod_d: 0.1, mod_s: 0,
    amp_a: 0.001, amp_d: 0.45, amp_s: 0, amp_r: 0.2, sub_level: 0.5, sub_shape: 0, sub_oct: 0, master: -6.5 } },
  // beta 0.3: OktoPierre’s best candidates of the TEST listening session (stars = his vote, 7 to 10; the changes he
  // recorded while listening are applied). In each category the voted presets come first, the best vote first.
  { name: 'B · Flute Lead', cat: 'Lead', stars: 8, v: { engine: 1, wavelet: 6, b_tilt: -8, b_bar2: 0.3, b_bar3: 0.1,
    b_bar4: 0, b_bar5: 0, b_bar6: 0, b_bar7: 0, b_bar8: 0, b_bar9: 0, b_bar10: 0, b_bar11: 0, b_atk: 0.06,
    amp_a: 0.06, amp_s: 0.9, amp_r: 0.2, lfo_rate: 5, lfo_pitch: 5, v_voices: 1, v_glide: 0.08, fx_rmix: 0.3,
    master: -1, v_porta: 2, ab_mix: 1 } },
  { name: 'B · Full Drawbar Organ', cat: 'Organ', stars: 7, v: { engine: 1, wavelet: 6, b_tilt: -1, b_bar9: 0.6,
    b_bar10: 0, b_bar11: 0, amp_a: 0.004, amp_s: 1, amp_r: 0.06, lfo_rate: 6.8, lfo_pitch: 5, fx_rmix: 0.15,
    master: 5.5, ab_mix: 1, ch_mix: 0.4 } },
  { name: 'B · Theatre Organ', cat: 'Organ', stars: 9, v: { engine: 1, wavelet: 4, b_pattern: 1, b_tilt: -2,
    b_bar2: 0.8, b_bar3: 0.7, b_bar4: 0.6, b_bar5: 0.4, b_bar6: 0.3, b_bar7: 0, b_bar8: 0, b_bar9: 0, b_bar10: 0,
    b_bar11: 0, amp_a: 0.02, amp_s: 1, amp_r: 0.25, lfo_rate: 6.5, lfo_pitch: 7, fx_rmix: 0.35, master: 3, ab_mix: 1,
    ch_mix: 0.5 } },
  { name: 'A · Sweep Pad', cat: 'Pad', stars: 7, v: { engine: 0, wavelet: 6, f_cutoff: 3, f_res: 8, amp_a: 1.2,
    amp_s: 0.9, amp_r: 2.5, lfo_rate: 0.15, lfo_cut: 2, v_unison: 3, v_detune: 16, fx_rmix: 0.5, master: -2.5,
    ab_mix: 0, ch_mix: 0.4 } },
  { name: 'B · Choir Pad', cat: 'Pad', stars: 8, v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -5, b_bar2: 0.7,
    b_bar3: 0.9, b_bar4: 0.3, b_bar5: 0.5, b_bar6: 0.2, b_bar7: 0.1, b_bar8: 0, b_bar9: 0, b_bar10: 0, b_bar11: 0,
    b_atk: 1, b_spread: 0.5, amp_a: 0.001506, amp_s: 1, amp_r: 0.00116, lfo_rate: 0.3, lfo_pitch: 4, v_unison: 3,
    v_detune: 14, fx_rmix: 0.6, master: -2, ab_mix: 1, ch_mix: 0.5 } },
  { name: 'A · Analog Brass Pad', cat: 'Pad', stars: 7, v: { engine: 0, wavelet: 3, f_cutoff: 3, f_res: 3, f_env: 3,
    amp_a: 0.6, amp_s: 0.9, amp_r: 1.5, mod_a: 1, mod_d: 2, mod_s: 0.5, v_unison: 3, fx_rmix: 0.4, master: -2.5,
    ab_mix: 0, ch_mix: 0.4 } },
  { name: 'AB · Glass Choir', cat: 'Pad', stars: 8, v: { engine: 1, wavelet: 1, a_wave: 4, b_pattern: 5, b_seed: 61,
    b_tilt: -8.000001, b_bar10: 0, b_bar11: 0, b_atk: 1.2, b_sus: 0.8, f_cutoff: 10.6, f_slope: 72.000001,
    f_keytrk: 0.977778, amp_a: 0.001756, amp_s: 1, amp_r: 0.10591, v_unison: 2, v_detune: 10, fx_rmix: 0.7,
    master: 3.5, ab_mix: 0.6, ch_mix: 0.6 } },
  { name: 'A · Noise Wash Pad', cat: 'Pad', stars: 9, v: { engine: 0, wavelet: 6, a_wave: 5, a_sparsity: 0.244444,
    f_type: 2, f_cutoff: 5, f_res: 14, amp_a: 0.023318, amp_s: 1, amp_r: 3, lfo_rate: 0.1, lfo_pitch: 22.222222,
    lfo_cut: 1.333333, fx_rsize: 0.95, fx_rmix: 0.8, master: -2, ab_mix: 0 } },
  { name: 'A · Ensemble Strings', cat: 'Strings', stars: 7, v: { engine: 0, wavelet: 6, f_cutoff: 6.5, f_slope: 18,
    amp_a: 0.4, amp_s: 0.9, amp_r: 1, v_unison: 3, v_detune: 10, fx_rmix: 0.35, master: -1, ab_mix: 0, ch_mix: 0.7,
    ch_rate: 0.6 } },
  { name: 'A · Cello Section', cat: 'Strings', stars: 8, v: { engine: 0, wavelet: 6, f_cutoff: 5, f_slope: 18,
    amp_a: 0.25, amp_s: 0.9, amp_r: 0.7, lfo_rate: 5, lfo_pitch: 5, v_oct: -1, v_unison: 2, v_detune: 6,
    fx_rmix: 0.35, master: -2, ab_mix: 0, ch_mix: 0.4 } },
  { name: 'AB · Silk Strings', cat: 'Strings', stars: 8, v: { engine: 0, wavelet: 6, b_pattern: 1, f_cutoff: 7,
    f_slope: 18, amp_a: 0.8, amp_s: 0.9, amp_r: 1.6, v_unison: 2, v_detune: 9, fx_rmix: 0.5, master: 1.5, ab_mix: 0.3,
    ch_mix: 0.8, ch_rate: 0.5, ch_depth: 0.7 } },
  { name: 'A · Spiccato Strings', cat: 'Strings', stars: 8, v: { engine: 0, wavelet: 3, f_cutoff: 4.5, f_env: 3,
    amp_d: 0.25, amp_s: 0, amp_r: 0.15, mod_d: 0.1, mod_s: 0, v_unison: 2, v_detune: 7, fx_rmix: 0.3, master: 4,
    ab_mix: 0 } },
  { name: 'B · Vox Strings', cat: 'Strings', stars: 7, v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -5,
    b_atk: 0.4, amp_a: 0.35, amp_s: 0.9, amp_r: 1.2, v_unison: 3, v_detune: 14, fx_rmix: 0.4, master: 2, ab_mix: 1,
    ch_mix: 0.7 } },
  { name: 'A · Shimmering Strings', cat: 'Strings', stars: 8, v: { engine: 0, wavelet: 6, f_cutoff: 6, f_slope: 18,
    amp_a: 0.3, amp_s: 0.9, amp_r: 1, lfo_rate: 2.096106, lfo_pitch: 7.222223, lfo_cut: 1, v_unison: 3, v_detune: 10,
    fx_rmix: 0.4, master: -2, ab_mix: 0, ch_mix: 0.5 } },
  { name: 'A · French Horn', cat: 'Brass & Wind', stars: 7, v: { engine: 0, wavelet: 6, a_wave: 3, f_cutoff: 3.5,
    f_env: 2, amp_a: 0.08, amp_s: 0.9, mod_a: 0.1, mod_d: 0.6, mod_s: 0.6, v_unison: 2, v_detune: 6, fx_rmix: 0.4,
    master: -6, ab_mix: 0 } },
  { name: 'A · Brass Section Stab', cat: 'Brass & Wind', stars: 7, v: { engine: 0, wavelet: 3, f_cutoff: 3, f_res: 5,
    f_env: 6, amp_a: 0.005, amp_d: 0.3, amp_s: 0.2, amp_r: 0.2, mod_d: 0.15, mod_s: 0.1, v_unison: 3, fx_rmix: 0.3,
    master: 3.5, ab_mix: 0 } },
  { name: 'A · Steel Pluck', cat: 'Pluck', stars: 7, v: { engine: 0, wavelet: 3, f_cutoff: 4, f_res: 4, f_env: 5,
    amp_a: 0.001, amp_d: 1.5, amp_s: 0.777778, amp_r: 0.4, amp_vel: 0.6, mod_d: 0.2, mod_s: 0, lfo_pitch: 3.333334,
    lfo_cut: 1.4, v_oct: -1, fx_dtime: 0.475775, fx_dfb: 0.545, fx_dmix: 0.305556, fx_rmix: 0.2, master: -2.5,
    ab_mix: 0, ch_mix: 0.2 } },
  { name: 'B · Xylophone', cat: 'Bells & Mallets', stars: 7, v: { engine: 1, wavelet: 6, b_tilt: -2, b_bar2: 0,
    b_bar3: 0, b_bar4: 0.4, b_bar5: 0, b_bar6: 0.15, b_bar7: 0, b_bar8: 0, b_bar9: 0, b_bar10: 0, b_bar11: 0,
    b_body: 0.4, b_bright: 0.05, b_sus: 0, amp_a: 0.001, amp_d: 0.6, amp_s: 0, amp_r: 0.25, v_oct: 1, fx_rmix: 0.2,
    master: 4.5, ab_mix: 1 } },
  { name: 'A · UFO', cat: 'FX', stars: 7, v: { engine: 0, wavelet: 6, a_wave: 4, amp_a: 0.2, amp_s: 1, amp_r: 1.5,
    lfo_rate: 7, lfo_pitch: 100, v_voices: 1, fx_dtime: 0.3, fx_dfb: 0.6, fx_dmix: 0.3, fx_rmix: 0.5, master: -2.5,
    ab_mix: 0 } },
  { name: 'A · Siren Sweep', cat: 'FX', stars: 9, v: { engine: 0, f_type: 2, f_cutoff: 6, f_res: 18, amp_s: 1,
    mod_s: 0.672222, lfo_shape: 1, lfo_rate: 0.5, lfo_pitch: 17.777778, lfo_cut: 4.3, fx_drive: 0.3,
    fx_dmix: 0.083333, fx_rmix: 0.3, master: -15, sub_level: 0.816667, ab_mix: 0 } },
  { name: 'A · Wave Atom Scanner', cat: 'FX', stars: 7, v: { engine: 0, wavelet: 3, f_cutoff: 9, p_center: 0.544444,
    p_width: 0.326944, p_depth: 1, amp_s: 0.9, amp_r: 0.5, lfo_shape: 1, lfo_rate: 0.5, lfo_pitch: 8.333334,
    lfo_cut: 2.1, lfo_pos: 0.5, fx_rmix: 0.3, master: -5.5, ab_mix: 0 } },
  { name: 'A · Wave Wobble Bass', cat: 'Bass', stars: 7, v: { engine: 0, wavelet: 6, a_wave: 1, f_cutoff: 3,
    f_res: 10, amp_s: 0.9, amp_r: 0.1, lfo_rate: 3, lfo_cut: 1.5, v_oct: -3, v_voices: 1, fx_drive: 0.4, master: -6.5,
    sub_level: 0.5, ab_mix: 0, wmorph: 0.5, lfo_wav: 0.6 } },
  { name: 'A · Wave Attack Lead', cat: 'Lead', stars: 9, v: { engine: 0, wavelet: 6, f_cutoff: 3, f_slope: 36,
    f_res: 6, f_env: 3, mod_d: 0.4, mod_s: 0.35, lfo_rate: 5.5, lfo_pitch: 5, v_voices: 1, v_glide: 0.04,
    fx_dmix: 0.18, fx_rmix: 0.15, master: 1, v_porta: 2, ab_mix: 0, env_wav: 1 } },
  { name: 'A · Wave S/H Lead', cat: 'Lead', stars: 7, v: { engine: 0, wavelet: 0, f_cutoff: 5, f_res: 8, lfo_shape: 4,
    lfo_rate: 8, lfo_pitch: 5, lfo_cut: 1.5, v_voices: 1, fx_dtime: 0.25, fx_dfb: 0.4, fx_dmix: 0.25, master: 0,
    ab_mix: 0, wav2: 6, wmorph: 0.5, lfo_wav: 0.6 } },
  // beta 0.5: adjusted by OktoPierre (octave -3, unison 4)
  { name: 'A · Wave Pulse Lead', cat: 'Lead', stars: 9, v: { engine: 0, wavelet: 5, a_wave: 2, a_width: 0.2,
    f_cutoff: 3, f_slope: 36, f_res: 6, mod_a: 0.3, mod_s: 0.35, lfo_rate: 1.277258, lfo_pitch: 5, lfo_cut: 1.3,
    lfo_pos: 0.091667, v_voices: 1, v_glide: 0.04, fx_dmix: 0.15, master: 2.5, v_porta: 2, ab_mix: 0, wmorph: 1,
    env_wav: -1, v_oct: -3, v_unison: 4 } },
  { name: 'A · Wave Morph Pad', cat: 'Pad', stars: 7, v: { engine: 0, wavelet: 6, f_cutoff: 4, f_res: 6, amp_a: 1,
    amp_s: 0.9, amp_r: 2.5, lfo_rate: 0.15, lfo_cut: 1, v_unison: 3, v_detune: 14, fx_rmix: 0.5, ab_mix: 0,
    ch_mix: 0.4, wmorph: 0.5, lfo_wav: 0.5 } },
  { name: 'AB · Wave Atom Choir', cat: 'Pad', stars: 7, v: { engine: 1, wavelet: 0, a_wave: 3, b_pattern: 1,
    b_tilt: -5, b_bar8: 0.525, b_atk: 0.8, f_cutoff: 5.066667, f_slope: 17.999999, f_res: 4, f_env: 8.433333,
    f_vel: 2.066666, amp_a: 0.8, amp_s: 1, amp_r: 2.5, lfo_rate: 0.689475, lfo_pitch: 6.111112, lfo_cut: 3.533333,
    lfo_pos: 0.122222, v_unison: 3, fx_rmix: 0.6, master: 4, ab_mix: 0.6, ch_mix: 0.6, wav2: 4, wmorph: 0.5,
    lfo_wav: 0.5 } },
  { name: 'A · Wave Tremolo Strings', cat: 'Strings', stars: 7, v: { engine: 0, wavelet: 6, f_cutoff: 3, f_slope: 36,
    f_res: 6, amp_a: 0.3, amp_s: 0.9, amp_r: 1, lfo_shape: 1, lfo_rate: 1.693665, lfo_pitch: 1.666667, lfo_cut: 0.8,
    v_unison: 3, v_detune: 10, fx_rmix: 0.4, ab_mix: 0, ch_mix: 0.5, wmorph: 0.3, lfo_wav: 0.4 } },
  { name: 'A · Wave Brass', cat: 'Brass & Wind', stars: 8, v: { engine: 0, wavelet: 6, f_cutoff: 3.3, f_slope: 36,
    f_res: 8, f_env: 4, amp_a: 0.04, amp_s: 0.9, amp_r: 0.25, mod_a: 0.06, mod_s: 0.4, lfo_rate: 0.599894,
    lfo_pitch: 6.666667, lfo_cut: 1.6, v_unison: 2, v_detune: 10, fx_dmix: 0.25, fx_rmix: 0.2, master: -5.5,
    ab_mix: 0, wmorph: 0.35, env_wav: 0.65 } },
  { name: 'A · Wave Robot', cat: 'FX', stars: 10, v: { engine: 0, wavelet: 0, f_type: 2, f_cutoff: 5, f_res: 14,
    amp_s: 1, amp_r: 0.2, lfo_shape: 4, lfo_rate: 10, lfo_cut: 2.5, fx_drive: 0.3, ab_mix: 0, wav2: 6, wmorph: 0.5,
    lfo_wav: 0.8 } },
  { name: 'A · Wave Riser', cat: 'FX', stars: 9, v: { engine: 0, wavelet: 6, a_wave: 5, f_type: 2, f_cutoff: 5,
    f_res: 14, amp_a: 1, amp_s: 1, amp_r: 2.5, lfo_shape: 2, lfo_rate: 0.15, lfo_cut: 3, v_unison: 2, fx_rsize: 0.9,
    fx_rmix: 0.6, master: -1, ab_mix: 0, wmorph: 0.5, lfo_wav: 0.5 } },
  // ---- beta 0.4: the SOURCE PHASE section (100 presets, engine A; OktoPierre kept 44 of them in beta 0.5).
  // 50 from OktoPierre's 15 favourites and 35 best voted
  // ("Shift": the engine B and A+B ones rebuilt on engine A), 50 new; two pairs at 0° and at their phase, and one sound
  // that exists only through its phase. Each phase was chosen among odd sample shifts for an audible change (tools/
  // phase_effect.js: 6 dB or more on some harmonic, 4 dB or more on the loud ones), the level matched to the favourites.
  { name: 'A · Square Mod 2 Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 6, a_phase: 0.537598,
    f_type: 2, f_cutoff: 5.4, f_res: 17.75, amp_a: 0.6, amp_d: 1, amp_s: 0.85, amp_r: 1.4, lfo_rate: 0.4,
    lfo_pitch: 5, lfo_cut: 3.75, v_unison: 3, v_detune: 16, v_width: 0.9, fx_dtime: 0.42, fx_dfb: 0.3, fx_dmix: 0.12,
    fx_rsize: 0.7, fx_rmix: 0.3, master: -18.5, ab_mix: 0 } },
  // beta 0.5: adjusted by OktoPierre (octave -1)
  { name: 'A · Wavelet Lead Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 3, a_phase: 0.553223,
    f_cutoff: 4.5, f_res: 9, f_env: 4, mod_d: 0.6, mod_s: 0.2, lfo_rate: 5.5, lfo_pitch: 8, v_voices: 1,
    v_glide: 0.06, v_unison: 2, v_detune: 9, fx_dtime: 0.32, fx_dmix: 0.22, fx_rmix: 0.15, master: 1, ab_mix: 0,
    lfo2_shape: 0, lfo2_rate: 0.3, lfo2_amt: 0.15, lfo2_target: 9, v_oct: -1 } },
  // beta 0.5: adjusted by OktoPierre (octave -2)
  { name: 'A · Focus Sweep Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 0, a_phase: 0.029785,
    f_type: 2, f_cutoff: 5.5, f_res: 10, p_width: 0.3, p_depth: 1, amp_s: 1, lfo_rate: 0.5, lfo_pos: 0.5,
    v_unison: 2, v_detune: 8, fx_dmix: 0.25, fx_rmix: 0.2, master: -5, ab_mix: 0, lfo2_shape: 1, lfo2_rate: 0.13,
    lfo2_amt: 0.4, lfo2_target: 9, v_oct: -2 } },
  { name: 'A · Laser Sweep Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 1, a_phase: 0.154785,
    f_cutoff: 3, f_slope: 60, f_res: 20, p_width: 0.2, p_depth: 0.7, lfo_shape: 2, lfo_rate: 6, lfo_cut: 4,
    lfo_pos: 0.3, fx_drive: 0.3, fx_dtime: 0.18, fx_dfb: 0.6, fx_dmix: 0.35, master: -4.5, ab_mix: 0, lfo2_shape: 2,
    lfo2_rate: 6, lfo2_amt: 0.3, lfo2_target: 9 } },
  { name: 'A · Warm Pad Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 1, a_phase: 0.76416,
    f_cutoff: 4, f_slope: 36, f_res: 4, amp_a: 0.6, amp_d: 1, amp_s: 0.85, amp_r: 1.4, lfo_rate: 0.4, lfo_cut: 0.8,
    v_unison: 3, v_detune: 16, v_width: 0.9, fx_dtime: 0.42, fx_dfb: 0.3, fx_dmix: 0.12, fx_rsize: 0.7, fx_rmix: 0.3,
    master: -5, ab_mix: 0, lfo2_shape: 0, lfo2_rate: 0.07, lfo2_amt: 0.25, lfo2_target: 9 } },
  { name: 'A · Mirror Sub Bass Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 1, wavelet: 1, a_phase: 0.225098,
    f_cutoff: 2.85, f_slope: 74, f_res: 18, f_keytrk: 0.79, f_env: 7.5, f_vel: 2.2, p_center: 0.48, p_width: 0.48,
    p_depth: 0.5, amp_a: 0.001, amp_d: 0.2, amp_s: 0.6, amp_r: 0.05, lfo_rate: 1.27, lfo_pitch: 12, lfo_cut: 0.8,
    v_oct: -2, v_voices: 1, v_unison: 2, v_detune: 2.7, fx_dmix: 0.2, fx_rmix: 0.18, master: -3, sub_level: 0.65,
    sub_oct: 0, sub_shape: 1, v_porta: 2, ab_mix: 0 } },
  { name: 'A · Space Choir Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 2, a_phase: 0.834473,
    f_type: 2, f_cutoff: 5, f_res: 9, p_depth: 0.5, amp_a: 1.2, amp_s: 1, amp_r: 3, lfo_rate: 0.25, lfo_pos: 0.25,
    v_unison: 4, v_detune: 22, fx_rsize: 0.95, fx_rmix: 0.75, master: -4, ab_mix: 0, ch_mix: 0.3, lfo2_shape: 0,
    lfo2_rate: 0.1, lfo2_amt: 0.2, lfo2_target: 9 } },
  { name: 'A · Square Mod Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 0, a_phase: 0.186035,
    f_cutoff: 3.06, f_res: 17.75, amp_a: 0.6, amp_d: 1, amp_s: 0.85, amp_r: 1.4, lfo_rate: 0.4, lfo_pitch: 5,
    lfo_cut: 0.8, v_unison: 3, v_detune: 16, v_width: 0.9, fx_dtime: 0.42, fx_dfb: 0.3, fx_dmix: 0.12, fx_rsize: 0.7,
    fx_rmix: 0.3, master: -16, ab_mix: 0 } },
  { name: 'A · Wave Robot Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 0, a_phase: 0.98291, f_type: 2,
    f_cutoff: 5, f_res: 14, amp_s: 1, amp_r: 0.2, lfo_shape: 4, lfo_rate: 10, lfo_cut: 2.5, fx_drive: 0.3,
    master: -7.5, ab_mix: 0, wav2: 6, wmorph: 0.5, lfo_wav: 0.8, lfo2_shape: 4, lfo2_rate: 10, lfo2_amt: 0.35,
    lfo2_target: 9 } },
  { name: 'A · Wave Pulse Lead Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 2, a_width: 0.2, wavelet: 5,
    a_phase: 0.100098, f_cutoff: 3, f_slope: 36, f_res: 6, mod_a: 0.3, mod_s: 0.35, lfo_rate: 1.277258, lfo_pitch: 5,
    lfo_cut: 1.3, lfo_pos: 0.091667, v_voices: 1, v_glide: 0.04, fx_dmix: 0.15, master: 2, v_porta: 2, ab_mix: 0,
    wmorph: 1, env_wav: -1 } },
  { name: 'A · Noise Wash Pad Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 5, wavelet: 6,
    a_sparsity: 0.244444, a_phase: 0.51416, f_type: 2, f_cutoff: 5, f_res: 14, amp_a: 0.023318, amp_s: 1, amp_r: 3,
    lfo_rate: 0.1, lfo_pitch: 22.222222, lfo_cut: 1.333333, fx_rsize: 0.95, fx_rmix: 0.8, master: 0, ab_mix: 0 } },
  { name: 'A · Solo Violin Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 4, a_phase: 0.029785, f_type: 2,
    f_cutoff: 3.8, f_slope: 12.5, f_res: 14.866666, f_keytrk: 0.455556, amp_a: 0.08, amp_s: 0.9, amp_r: 0.018929,
    lfo_rate: 0.438243, lfo_pitch: 7, lfo_cut: 1.233333, v_oct: -2, v_voices: 4, fx_rmix: 0.1, master: -8.5,
    v_porta: 2, ab_mix: 0, env_wav: 0.2 } },
  { name: 'A · Siren Sweep Shift', cat: 'Source Phase', v: { engine: 0, a_phase: 0.287598, f_type: 2, f_cutoff: 6,
    f_res: 18, amp_s: 1, mod_s: 0.672222, lfo_shape: 1, lfo_rate: 0.5, lfo_pitch: 17.777778, lfo_cut: 4.3,
    fx_drive: 0.3, fx_dmix: 0.083333, fx_rmix: 0.3, master: -16.5, sub_level: 0.816667, ab_mix: 0 } },
  { name: 'A · Wave Riser Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 5, wavelet: 6, a_phase: 0.79541,
    f_type: 2, f_cutoff: 5, f_res: 14, amp_a: 1, amp_s: 1, amp_r: 2.5, lfo_shape: 2, lfo_rate: 0.15, lfo_cut: 3,
    v_unison: 2, fx_rsize: 0.9, fx_rmix: 0.6, master: -1, ab_mix: 0, wmorph: 0.5, lfo_wav: 0.5 } },
  { name: 'A · Wave Laser Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 6, a_phase: 0.529785, f_cutoff: 5,
    f_res: 10, amp_s: 1, amp_r: 0.4, lfo_shape: 2, lfo_rate: 6, lfo_pitch: 30, v_voices: 1, v_unison: 2,
    fx_dtime: 0.2, fx_dfb: 0.6, fx_dmix: 0.35, master: -4, sub_level: 0.661111, ab_mix: 0, wmorph: 0.5, lfo_wav: 1 } },
  { name: 'A · Flute Lead Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 3, a_width: 0.45, wavelet: 1,
    a_sparsity: 0.4, a_phase: 0.912598, f_cutoff: 3, f_slope: 42, amp_a: 0.06, amp_s: 0.9, amp_r: 0.2, lfo_rate: 5,
    lfo_pitch: 5, v_voices: 1, v_glide: 0.08, fx_rmix: 0.3, master: 0.5, v_porta: 2, ab_mix: 0 } },
  { name: 'A · Wave Window Lead Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 3, a_phase: 0.443848,
    f_cutoff: 2.5, f_slope: 36, f_res: 8, p_center: 0.5, p_width: 0.3, p_depth: 1, lfo_rate: 2, lfo_pos: 0.25,
    v_voices: 1, v_glide: 0.05, fx_dmix: 0.15, master: 0.5, v_porta: 2, ab_mix: 0, wmorph: 0.5, lfo_wav: 0.6 } },
  { name: 'A · Choir Pad Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 2, a_phase: 0.029785,
    f_type: 2, f_cutoff: 4.5, f_slope: 20, f_res: 7, amp_a: 0.8, amp_s: 1, amp_r: 2, lfo_rate: 0.3, lfo_pitch: 4,
    v_unison: 3, v_detune: 14, fx_rmix: 0.6, master: 6, ab_mix: 0, ch_mix: 0.5, lfo2_shape: 0, lfo2_rate: 0.2,
    lfo2_amt: 0.12, lfo2_target: 9 } },
  { name: 'A · Glass Choir Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 2, a_width: 0.3, wavelet: 1,
    a_phase: 0.29541, f_type: 1, f_cutoff: 2.5, f_slope: 36, amp_a: 0.5, amp_s: 1, amp_r: 1.5, v_unison: 2,
    v_detune: 10, fx_rmix: 0.7, master: 0.5, ab_mix: 0, ch_mix: 0.6 } },
  { name: 'A · Cello Section Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 1, a_phase: 0.396973, f_cutoff: 4,
    f_slope: 30, amp_a: 0.25, amp_s: 0.9, amp_r: 0.7, lfo_rate: 5, lfo_pitch: 5, v_oct: -1, v_unison: 3, v_detune: 6,
    fx_rmix: 0.35, master: -4, ab_mix: 0, ch_mix: 0.4 } },
  { name: 'A · Shimmering Strings Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 1, a_phase: 0.88916,
    f_cutoff: 4.5, f_slope: 36, amp_a: 0.3, amp_s: 0.9, amp_r: 1, lfo_rate: 2.096106, lfo_pitch: 7.222223,
    lfo_cut: 1, v_unison: 3, v_detune: 10, fx_rmix: 0.4, master: -1.5, ab_mix: 0, ch_mix: 0.5 } },
  { name: 'A · Acid Line Shift', cat: 'Source Phase', v: { engine: 0, a_phase: 0.943848, f_cutoff: 2,
    f_res: 15.466667, f_env: 6, f_vel: 2, amp_d: 0.3, amp_s: 0.7, amp_r: 0.08, mod_d: 0.18, mod_s: 0, v_oct: -1,
    v_voices: 5, v_glide: 0.06, fx_drive: 0.4, fx_dtime: 0.25, fx_dfb: 0.3, fx_dmix: 0.12, master: -7, v_porta: 2,
    ab_mix: 0, lfo2_shape: 3, lfo2_rate: 2, lfo2_amt: 0.25, lfo2_target: 9 } },
  { name: 'A · Wave Wobble Bass Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 1, wavelet: 6,
    a_phase: 0.373535, f_cutoff: 3, f_res: 10, amp_s: 0.9, amp_r: 0.1, lfo_rate: 3, lfo_cut: 1.5, v_oct: -3,
    v_voices: 1, fx_drive: 0.4, master: -7, sub_level: 0.5, ab_mix: 0, wmorph: 0.5, lfo_wav: 0.6 } },
  { name: 'A · Full Drawbar Organ Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 1, wavelet: 1,
    a_sparsity: 0.25, a_phase: 0.154785, f_type: 0, f_cutoff: 4, f_slope: 36, amp_a: 0.004, amp_s: 1, amp_r: 0.06,
    lfo_rate: 6.8, lfo_pitch: 5, fx_drive: 0.15, fx_rmix: 0.15, master: -6, ab_mix: 0, ch_mix: 0.4 } },
  { name: 'A · Analog Brass Pad Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 3, a_phase: 0.350098,
    f_cutoff: 3, f_res: 3, f_env: 3, amp_a: 0.6, amp_s: 0.9, amp_r: 1.5, mod_a: 1, mod_d: 2, mod_s: 0.5, v_unison: 3,
    fx_rmix: 0.4, master: -2.5, ab_mix: 0, ch_mix: 0.4 } },
  { name: 'A · Wave Morph Pad Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 1, a_phase: 0.178223,
    f_cutoff: 3.5, f_slope: 36, f_res: 6, amp_a: 1, amp_s: 0.9, amp_r: 2.5, lfo_rate: 0.15, lfo_cut: 1, v_unison: 3,
    v_detune: 14, fx_rmix: 0.5, master: -3.5, ab_mix: 0, ch_mix: 0.4, wmorph: 0.5, lfo_wav: 0.5 } },
  { name: 'A · Wave Atom Choir Shift', cat: 'Source Phase', v: { engine: 0, a_wave: 2, a_width: 0.35, wavelet: 0,
    a_phase: 0.803223, f_cutoff: 3, f_slope: 42, f_res: 4, f_env: 4, f_vel: 2, p_depth: 0.4, amp_a: 0.8, amp_s: 1,
    amp_r: 2.5, lfo_rate: 0.69, lfo_pitch: 6, lfo_cut: 2, lfo_pos: 0.12, v_unison: 3, fx_rmix: 0.6, master: -4.5,
    ab_mix: 0, ch_mix: 0.6, wav2: 4, wmorph: 0.25, lfo_wav: 0.5 } },
  { name: 'A · Ensemble Strings Shift', cat: 'Source Phase', v: { engine: 0, wavelet: 1, a_phase: 0.88916,
    f_cutoff: 4.5, f_slope: 36, amp_a: 0.4, amp_s: 0.9, amp_r: 1, v_unison: 3, v_detune: 10, fx_rmix: 0.35,
    master: -0.5, ab_mix: 0, ch_mix: 0.7, ch_rate: 0.6 } },
  { name: 'A · Phase Wobble Bass', cat: 'Source Phase', v: { engine: 0, a_wave: 1, wavelet: 1, a_phase: 0.412598,
    f_cutoff: 3.5, f_slope: 36, f_res: 10, amp_s: 0.9, amp_r: 0.1, v_oct: -1, v_voices: 1, fx_drive: 0.3,
    master: -5.5, sub_level: 0.5, ab_mix: 0, lfo2_shape: 1, lfo2_rate: 3, lfo2_amt: 0.5, lfo2_target: 9 } },
  { name: 'A · Window Phase Lead', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 1, a_phase: 0.67041,
    f_cutoff: 3, f_slope: 36, f_res: 8, p_center: 0.25, p_width: 0.35, p_depth: 1, lfo_rate: 1.2, lfo_pos: 0.15,
    v_voices: 1, v_glide: 0.05, fx_dmix: 0.18, master: 1, ab_mix: 0 } },
  { name: 'A · Pipe Phase', cat: 'Source Phase', v: { engine: 0, a_wave: 1, a_width: 0.5, wavelet: 2,
    a_sparsity: 0.45, a_phase: 0.100098, f_cutoff: 4, f_slope: 30, amp_a: 0.08, amp_s: 1, amp_r: 0.4, fx_rsize: 0.9,
    fx_rmix: 0.45, master: -11.5, ab_mix: 0 } },
  { name: 'A · Phase Drift Pad', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 1, a_phase: 0.76416,
    f_cutoff: 4.5, f_res: 6, amp_a: 1.5, amp_s: 0.9, amp_r: 3, v_unison: 3, v_detune: 14, fx_rmix: 0.5, master: -2.5,
    ab_mix: 0, ch_mix: 0.4, lfo2_shape: 1, lfo2_rate: 0.06, lfo2_amt: 1, lfo2_target: 9 } },
  { name: 'A · Dawn Phase', cat: 'Source Phase', v: { engine: 0, a_wave: 2, a_width: 0.4, wavelet: 2,
    a_phase: 0.779785, f_cutoff: 3.5, f_res: 8, f_env: 3, amp_a: 2, amp_s: 0.9, amp_r: 3, mod_a: 2.5, mod_d: 3,
    mod_s: 0.4, v_unison: 2, v_detune: 10, fx_dmix: 0.15, fx_rmix: 0.55, master: -9.5, ab_mix: 0 } },
  { name: 'A · Shifted Strings Pad', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 1, a_phase: 0.396973,
    f_cutoff: 4, f_slope: 36, amp_a: 0.9, amp_s: 0.9, amp_r: 2, v_unison: 3, v_detune: 12, fx_rmix: 0.45, master: 0,
    ab_mix: 0, ch_mix: 0.7 } },
  { name: 'A · Noise Phase Pad', cat: 'Source Phase', v: { engine: 0, a_wave: 5, wavelet: 1, a_sparsity: 0.5,
    a_phase: 0.146973, f_type: 2, f_cutoff: 5, f_res: 12, amp_a: 1.5, amp_s: 1, amp_r: 3, lfo_rate: 0.1, lfo_cut: 1,
    fx_rsize: 0.9, fx_rmix: 0.7, master: 2, ab_mix: 0 } },
  { name: 'A · Phase Glass Pad', cat: 'Source Phase', v: { engine: 0, a_wave: 3, a_width: 0.25, wavelet: 1,
    a_phase: 0.115723, f_type: 1, f_cutoff: 2.2, f_res: 6, amp_a: 1, amp_s: 0.9, amp_r: 2.5, v_unison: 3,
    v_detune: 9, fx_rmix: 0.6, master: 1, ab_mix: 0, ch_mix: 0.5 } },
  { name: 'A · Dark Phase Pad', cat: 'Source Phase', v: { engine: 0, a_wave: 1, wavelet: 2, a_phase: 0.459473,
    f_cutoff: 3, f_slope: 30, f_res: 4, amp_a: 1.2, amp_s: 0.9, amp_r: 2.5, v_oct: -1, v_unison: 3, v_detune: 12,
    fx_rmix: 0.5, master: -11.5, sub_level: 0.3, ab_mix: 0, lfo2_shape: 0, lfo2_rate: 0.09, lfo2_amt: 0.3,
    lfo2_target: 9 } },
  { name: 'A · Phase Ensemble', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 1, a_phase: 0.63916,
    f_cutoff: 4.2, f_slope: 36, amp_a: 0.4, amp_s: 0.9, amp_r: 1, v_unison: 3, v_detune: 10, fx_rmix: 0.35,
    master: -0.5, ab_mix: 0, ch_mix: 0.7, ch_rate: 0.6 } },
  { name: 'A · Phase Tremolo Strings', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 1, a_phase: 0.396973,
    f_cutoff: 4, f_slope: 36, amp_a: 0.3, amp_s: 0.9, amp_r: 1, v_unison: 3, v_detune: 10, fx_rmix: 0.4, master: -1,
    ab_mix: 0, ch_mix: 0.5, lfo2_shape: 1, lfo2_rate: 6, lfo2_amt: 0.2, lfo2_target: 9 } },
  { name: 'A · Shifted Horns', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 1, a_phase: 0.287598,
    f_cutoff: 3, f_slope: 30, f_env: 3, amp_a: 0.08, amp_s: 0.9, amp_r: 0.4, mod_a: 0.15, mod_s: 0.5, lfo_rate: 5,
    lfo_pitch: 4, v_unison: 2, v_detune: 6, fx_rmix: 0.3, master: -3.5, ab_mix: 0, ch_mix: 0.2 } },
  { name: 'A · Phase Stab', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 0, a_phase: 0.217285,
    f_cutoff: 4, f_slope: 36, f_res: 8, f_env: 5, amp_a: 0.003, amp_d: 0.35, amp_s: 0, amp_r: 0.15, mod_d: 0.15,
    mod_s: 0, v_unison: 3, v_detune: 14, fx_dmix: 0.15, fx_rmix: 0.25, master: 1.5, ab_mix: 0 } },
  { name: 'A · Phase Clarinet', cat: 'Source Phase', v: { engine: 0, a_wave: 1, wavelet: 2, a_phase: 0.100098,
    f_cutoff: 4, f_slope: 30, amp_a: 0.05, amp_s: 0.9, amp_r: 0.15, lfo_rate: 5, lfo_pitch: 4, v_voices: 1,
    v_glide: 0.03, fx_rmix: 0.2, master: -4, ab_mix: 0 } },
  { name: 'A · Phase Scanner', cat: 'Source Phase', v: { engine: 0, a_wave: 0, wavelet: 0, a_phase: 0.436035,
    f_type: 2, f_cutoff: 5.5, f_res: 12, amp_s: 1, amp_r: 1, fx_dmix: 0.25, fx_rmix: 0.35, master: -3.5, ab_mix: 0,
    lfo2_shape: 2, lfo2_rate: 0.25, lfo2_amt: 1, lfo2_target: 9 } },
  { name: 'A · Phase Glitch', cat: 'Source Phase', v: { engine: 0, a_wave: 1, wavelet: 0, a_sparsity: 0.5,
    a_phase: 0.178223, f_cutoff: 5, f_res: 10, amp_s: 1, amp_r: 0.2, fx_dtime: 0.11, fx_dfb: 0.5, fx_dmix: 0.3,
    master: -10, ab_mix: 0, lfo2_shape: 4, lfo2_rate: 14, lfo2_amt: 0.8, lfo2_target: 9 } },
];
// Presets saved before A/B MIX existed play the engine they were made for.
for (const pr of PRESET_LIST) if (pr.v.ab_mix === undefined) pr.v.ab_mix = pr.v.engine || 0;

// Categories (preset menu groups, like the banks of a hardware synthesizer), in menu order.
// beta 0.5: 'Source Phase' second, after TOP Sounds (OktoPierre's choice; beta 0.4 had it last)
const CATEGORIES = ['Source Phase', 'Bass', 'Lead', 'Keys', 'Organ', 'Pad', 'Strings', 'Brass & Wind', 'Pluck', 'Bells & Mallets', 'FX',
  'Drums & Perc', 'Init'];
const CATEGORY_OF = {   // presets of beta 0.1 and 0.2
  'A · Square Mod 2': 'Pad', 'A · Wavelet Lead': 'Lead', 'A · Haar Bass': 'Bass', 'A · Edge Pluck': 'Pluck', 'B · Focus Sweep': 'FX',
  'B · Soft Flute': 'Brass & Wind', 'A · Infra Sub Bass': 'Bass', 'A · Dub Echo Lead': 'Lead', 'A · Fuzz Bass': 'Bass',
  'A · Laser Sweep': 'FX', 'A · Warm Pad': 'Pad', 'B · Mirror Sub Bass': 'Bass', 'A · Sparse Keys': 'Keys', 'B · Space Choir': 'Pad',
  'A · Square Mod': 'Pad', 'A · Init': 'Init', 'B · Init': 'Init', 'A · Glass Pad': 'Pad', 'A · Noise Brass': 'Brass & Wind',
  'A · Scanning Edge': 'FX', 'A · Clean Keys': 'Keys', 'A · Cathedral Saw': 'Pad', 'B · Octave Organ': 'Organ', 'B · Chip Walsh': 'Lead',
  'B · Walsh Bells': 'Bells & Mallets', 'B · Impulse Pluck': 'Pluck', 'B · Random Glass': 'Pad', 'B · Mirror Pad': 'Pad',
  'B · Music Box': 'Bells & Mallets', 'B · Chip Echo': 'Lead', 'B · Distorted Organ': 'Organ', 'B · Alien Texture': 'FX',
  'A · String Machine': 'Strings', 'A · Solina Cellos': 'Strings', 'A · Poly Chorus Pad': 'Pad', 'A · Chorus Square Lead': 'Lead',
  'B · Ensemble Organ': 'Organ', 'B · Glass Ensemble': 'Pad', 'B · Chorus Flute': 'Brass & Wind', 'A · Sub Saw Bass': 'Bass',
  'A · Reese Sub': 'Bass', 'A · Acid Sub': 'Bass', 'B · Sub Organ Bass': 'Bass', 'A · Deep Sub Pluck': 'Bass',
  'AB · Hybrid Strings': 'Strings', 'AB · Wavelet Choir': 'Pad', 'AB · Bell Pad': 'Pad', 'AB · Hybrid Keys': 'Keys',
  'AB · Organ Lead': 'Lead', 'AB · Sub Hybrid Bass': 'Bass', 'AB · Dream Pad': 'Pad', 'AB · Space Strings': 'Strings',
  'AB · Glass Keys': 'Keys', 'AB · Wide Brass': 'Brass & Wind', 'AB · Chip Hybrid': 'Lead', 'AB · Shimmer Pluck': 'Pluck',
};
for (const pr of PRESET_LIST) {
  pr.cat = pr.cat || CATEGORY_OF[pr.name];
  if (!CATEGORIES.includes(pr.cat)) throw new Error(`preset ${pr.name}: no category`);
}

// beta 0.5: OktoPierre's sort of the presets (his presets file "OKTOWAVE presets V4.txt": 150 kept, 103 left out, the order
// of every list as he arranged it in the preset browser). TOP Sounds = his TOP list and the first 15 sounds of Source Phase,
// one in two (the best first). Each category lists its presets in his order, TOP Sounds included (★ in the browsers).
const TOP_SOUNDS = [
  'B · Mirror Sub Bass', 'A · Mirror Sub Bass Shift', 'B · Theatre Organ', 'A · Wave Riser Shift',
  'A · Noise Wash Pad', 'A · Wave Atom Choir Shift', 'A · Siren Sweep', 'A · Focus Sweep Shift', 'B · Space Choir',
  'A · Wave Wobble Bass Shift', 'A · Wavelet Lead', 'A · Noise Wash Pad Shift', 'B · Focus Sweep',
  'A · Shifted Strings Pad', 'B · Flute Lead', 'A · Ensemble Strings Shift', 'B · Choir Pad', 'A · Siren Sweep Shift',
  'A · Wave Brass', 'A · Cello Section Shift', 'A · Wave Riser', 'A · Wavelet Lead Shift', 'A · Warm Pad',
  'A · Window Phase Lead', 'A · Wave Attack Lead', 'A · Solo Violin Shift', 'A · Dub Echo Lead',
  'A · Square Mod 2 Shift', 'A · Wave Pulse Lead', 'A · Square Mod Shift', 'AB · Glass Choir', 'A · Cello Section',
  'AB · Silk Strings', 'A · Spiccato Strings', 'A · Shimmering Strings', 'A · Wave Robot', 'A · Laser Sweep'];
const LIST_ORDER = {
  'Source Phase': [
    'A · Mirror Sub Bass Shift', 'A · Wave Riser Shift', 'A · Wave Atom Choir Shift', 'A · Focus Sweep Shift',
    'A · Wave Wobble Bass Shift', 'A · Noise Wash Pad Shift', 'A · Shifted Strings Pad', 'A · Ensemble Strings Shift',
    'A · Siren Sweep Shift', 'A · Cello Section Shift', 'A · Wavelet Lead Shift', 'A · Window Phase Lead',
    'A · Solo Violin Shift', 'A · Square Mod 2 Shift', 'A · Square Mod Shift', 'A · Wave Pulse Lead Shift',
    'A · Space Choir Shift', 'A · Warm Pad Shift', 'A · Phase Clarinet', 'A · Wave Robot Shift',
    'A · Wave Window Lead Shift', 'A · Laser Sweep Shift', 'A · Wave Laser Shift', 'A · Flute Lead Shift',
    'A · Shimmering Strings Shift', 'A · Glass Choir Shift', 'A · Choir Pad Shift', 'A · Acid Line Shift',
    'A · Full Drawbar Organ Shift', 'A · Analog Brass Pad Shift', 'A · Wave Morph Pad Shift', 'A · Phase Wobble Bass',
    'A · Pipe Phase', 'A · Phase Drift Pad', 'A · Dawn Phase', 'A · Noise Phase Pad', 'A · Phase Glass Pad',
    'A · Dark Phase Pad', 'A · Phase Ensemble', 'A · Phase Tremolo Strings', 'A · Shifted Horns', 'A · Phase Stab',
    'A · Phase Scanner', 'A · Phase Glitch'],
  'Bass': [
    'B · Mirror Sub Bass', 'A · Wave Wobble Bass', 'A · Reese Sub', 'A · Acid Sub', 'A · Ladder Bass',
    'AB · Wobble Bass'],
  'Lead': [
    'A · Wave Attack Lead', 'A · Wave S/H Lead', 'A · Wave Pulse Lead', 'B · Flute Lead', 'A · Wavelet Lead',
    'A · Dub Echo Lead', 'A · Chorus Square Lead', 'AB · Organ Lead', 'A · Saw Lead', 'A · Whistle Lead',
    'AB · Hybrid Lead'],
  'Keys': [
    'A · Clean Keys', 'AB · Hybrid Keys', 'AB · Glass Keys', 'A · Tine Piano', 'AB · Electric Piano', 'B · Reed Piano',
    'A · Clavi', 'B · Toy Piano', 'A · Lo-Fi Piano'],
  'Organ': [
    'B · Theatre Organ', 'B · Full Drawbar Organ', 'B · Reed Organ', 'B · Octave Organ', 'B · Distorted Organ',
    'B · Ensemble Organ', 'B · Jazz Organ', 'B · Gospel Organ', 'B · Church Organ', 'B · Flute Organ'],
  'Pad': [
    'A · Noise Wash Pad', 'AB · Glass Choir', 'A · Poly Chorus Pad', 'B · Space Choir', 'B · Random Glass',
    'A · Warm Pad', 'AB · Wavelet Choir', 'A · Analog Brass Pad', 'B · Mirror Pad', 'A · Wave Morph Pad',
    'A · Glass Pad', 'B · Choir Pad', 'A · Sweep Pad', 'AB · Wave Atom Choir', 'B · Glass Ensemble', 'AB · Bell Pad',
    'AB · Dream Pad', 'A · Analog Pad', 'B · Halo Pad', 'AB · Evolving Pad'],
  'Strings': [
    'A · Shimmering Strings', 'B · Vox Strings', 'A · String Machine', 'A · Cello Section', 'AB · Silk Strings',
    'A · Spiccato Strings', 'A · Ensemble Strings', 'A · Wave Tremolo Strings', 'A · Solina Cellos', 'A · Pizzicato',
    'A · Slow Strings', 'AB · Analog Strings'],
  'Brass & Wind': [
    'A · French Horn', 'A · Wave Brass', 'A · Noise Brass', 'B · Chorus Flute', 'A · Brass Section Stab',
    'AB · Wide Brass', 'B · Clarinet'],
  'Pluck': [
    'A · Steel Pluck', 'A · Harp', 'A · Synth Pluck', 'AB · Arp Pluck'],
  'Bells & Mallets': [
    'B · Xylophone', 'B · Music Box', 'B · Glockenspiel', 'B · Vibraphone', 'B · Marimba', 'B · Tubular Bells',
    'AB · Crystal Bell'],
  'FX': [
    'A · Wave Riser', 'B · Focus Sweep', 'A · UFO', 'B · Alien Texture', 'A · Siren Sweep', 'A · Laser Sweep',
    'A · Wave Robot', 'A · Wave Atom Scanner', 'A · Wind', 'B · Sci-Fi Burble', 'AB · Robot Voice', 'A · Alarm'],
  'Drums & Perc': [
    'AB · Sub Kick', 'A · Noise Snare', 'A · Closed Hat', 'A · Open Hat', 'B · Wood Block', 'A · Synth Tom'],
  'Init': [
    'A · Init', 'B · Init'],
};
// each preset is in the list of its own category exactly once; `rank` = its place there (the browsers' default order)
for (const pr of PRESET_LIST) {
  const l = LIST_ORDER[pr.cat] || [];
  pr.rank = l.indexOf(pr.name);
  if (pr.rank < 0 || l.lastIndexOf(pr.name) !== pr.rank) throw new Error(`LIST_ORDER: ${pr.name} not once in ${pr.cat}`);
}
for (const [cat, l] of Object.entries(LIST_ORDER)) {
  if (!CATEGORIES.includes(cat)) throw new Error('LIST_ORDER: unknown category ' + cat);
  for (const n of l) if (!PRESET_LIST.some(p => p.name === n && p.cat === cat)) throw new Error(`LIST_ORDER: ${n} is not a ${cat} preset`);
}
// beta 0.5: the factory presets of earlier versions that OktoPierre left out. A Live Set saved with one of them keeps
// its sound (in the plug-in state) and shows its name; any other unknown name is ignored.
const LEFT_OUT = [
  'A · Square Mod 2', 'A · Haar Bass', 'A · Edge Pluck', 'B · Soft Flute', 'A · Infra Sub Bass', 'A · Fuzz Bass',
  'A · Sparse Keys', 'A · Square Mod', 'A · Deep Saw Bass', 'A · Wave Morph Bass', 'A · Acid Line',
  'A · Fat Unison Bass', 'A · Sub Saw Bass', 'B · Sub Organ Bass', 'A · Deep Sub Pluck', 'AB · Sub Hybrid Bass',
  'B · Pluck Bass', 'A · Rubber Bass', 'A · Octave Bass', 'A · Screaming Lead', 'AB · Duo Lead',
  'A · Wave Window Lead', 'B · Chip Walsh', 'B · Chip Echo', 'AB · Chip Hybrid', 'A · Pulse Lead', 'A · Dyno Keys',
  'AB · Wurli Bark', 'AB · Gospel Mix Organ', 'A · Cathedral Saw', 'A · Dark Pad', 'A · Solo Violin',
  'AB · Hybrid Strings', 'AB · Space Strings', 'A · Chamber Strings', 'A · Synth Brass', 'A · Brass Stab',
  'AB · Breathy Flute', 'B · Impulse Pluck', 'AB · Shimmer Pluck', 'B · Koto', 'B · Walsh Bells', 'A · Wave Laser',
  'B · Wave Random Computer', 'B · Wave Reverse Bands', 'A · Wave Glitch Morph', 'A · Scanning Edge',
  'A · Haar Bass Shift', 'A · Edge Pluck Shift', 'A · Soft Flute Shift', 'A · Infra Sub Bass Shift',
  'A · Dub Echo Lead Shift', 'A · Fuzz Bass Shift', 'A · Sparse Keys Shift', 'A · Screaming Lead Shift',
  'A · Wave Attack Lead Shift', 'A · Dyno Keys Shift', 'A · Theatre Organ Shift', 'A · Deep Saw Bass Shift',
  'A · Wave Morph Bass Shift', 'A · Duo Lead Shift', 'A · Wurli Bark Shift', 'A · Gospel Mix Organ Shift',
  'A · Silk Strings Shift', 'A · Spiccato Strings Shift', 'A · Wave Brass Shift', 'A · Fat Unison Bass Shift',
  'A · Wave S/H Lead Shift', 'A · Sweep Pad Shift', 'A · Phase Pair Bass 0°', 'A · Phase Pair Bass 67°',
  'A · Shifted Reese', 'A · Haar Grit Bass', 'A · Rubber Phase Bass', 'A · Phase Sub Pluck', 'A · S&H Phase Bass',
  'A · Phase Pair Lead 0°', 'A · Phase Pair Lead 2°', 'A · Phase Scream', 'A · Shift Lead', 'A · Phase Sync Lead',
  'A · Morph Phase Lead', 'A · Chip Phase', 'A · Phase E-Piano', 'A · Shifted Clav', 'A · Phase Bell Keys',
  'A · Glass Phase Keys', 'A · Tine Shift', 'A · Lo-Fi Phase Keys', 'A · Phase Organ', 'A · Rotary Phase Organ',
  'A · Reed Phase Organ', 'A · Phase Choir', 'A · Phase Is The Sound', 'A · Shifted Cellos', 'A · Phase Viola',
  'A · Phase Brass', 'A · Phase Pluck', 'A · Shift Harp', 'A · Phase Bells', 'A · Phase Mallet', 'A · Phase Hat',
  'A · Phase Snare'];
for (const n of LEFT_OUT) if (PRESET_LIST.some(p => p.name === n)) throw new Error('LEFT_OUT: still a preset: ' + n);

// Factory order (preset menu, ◀ ▶, VST programs): TOP Sounds first, in their order, then the other presets by category
// (CATEGORIES order), each in its list order.
const byName = new Map(PRESET_LIST.map(p => [p.name, p]));
const PRESETS = TOP_SOUNDS.map((n) => {
  if (!byName.has(n)) throw new Error('TOP_SOUNDS: preset not found: ' + n);
  return byName.get(n);
});
for (const cat of CATEGORIES) for (const n of LIST_ORDER[cat]) if (!TOP_SOUNDS.includes(n)) PRESETS.push(byName.get(n));
if (PRESETS.length !== PRESET_LIST.length || new Set(PRESETS).size !== PRESET_LIST.length) throw new Error('factory order: every preset exactly once');
if (!PRESETS.some(p => p.name === DEFAULT_PRESET)) throw new Error('DEFAULT_PRESET not found: ' + DEFAULT_PRESET);

// Validate preset keys and ranges at generation time.
for (const pr of PRESETS) for (const [k, v] of Object.entries(pr.v)) {
  if (!(k in idx)) throw new Error(`preset ${pr.name}: unknown param ${k}`);
  const p = P[idx[k]];
  if (v < p.min || v > p.max) throw new Error(`preset ${pr.name}: ${k}=${v} out of range`);
}
for (const s of S) for (const w of s.widgets) {
  if (w.param && !(w.param in idx)) throw new Error('layout: unknown param ' + w.param);
  if (w.vis && !(w.vis in idx)) throw new Error('layout: unknown vis param ' + w.vis);
  if (w.only && w.only !== 'web' && w.only !== 'vst') throw new Error('layout: only web or vst');
}

module.exports = { DEVICE, APP, DEFAULT_PRESET, PARAMS: P, INDEX: idx, SECTIONS: S, PRESETS, TOP: TOP_SOUNDS.length, CATEGORIES,
  LFO2_TARGETS, LEFT_OUT, DELAY_BEATS, LFO_BEATS };
