// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — single source of truth.
// Created by Pierre Arnaud GUYOT ("OktoPierre"). Release history: see RELEASE_HISTORY.md
//   beta 0.1 (2026-10-14) — first release.
//   beta 0.2 (2026-10-15) — engines A and B mixed (A/B MIX), triple chorus, new presets.
//   beta 0.3 (2026-10-15) — 107 presets organised by category, demo starts after the opening chords.
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
  version: 'beta 0.3',
  versionNum: '0.3.0',
  date: '2026-10-15',
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
add('lfo_shape', 'LFO Shape', 'SHAPE', { curve: 'choice', fmt: 'choice', min: 0, max: 4, def: 0,
  choices: ['Sine', 'Triangle', 'Saw', 'Square', 'Sample & Hold'], choiceShort: ['SINE', 'TRI', 'SAW', 'SQR', 'S&H'] });
add('lfo_rate', 'LFO Rate', 'RATE', { curve: 'exp', fmt: 'hz', min: 0.05, max: 20, def: 4 });
add('lfo_pitch', 'LFO to Pitch', 'PITCH', { fmt: 'cents', min: 0, max: 100, def: 0 });
add('lfo_cut', 'LFO to Cutoff', 'CUTOFF', { fmt: 'bandamt', min: 0, max: 6, def: 0 });
add('lfo_pos', 'LFO to Position', 'POSITION', { fmt: 'cyc', min: 0, max: 0.5, def: 0 });
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

const idx = Object.fromEntries(P.map((p, i) => [p.key, i]));

// ---------------------------------------------------------------- layout
// Sections are cards; widget coordinates are relative to their section.
// widget types: knobL knobM knobS knobT seg step drawbar scope scalogram atom source
//               window adsr leds fxheads keyboard wheels logo presets manualA manualB meter zoom credit
const S = [];
function section(id, title, x, y, w, h, mode, widgets) { S.push({ id, title, x, y, w, h, mode: mode || '', widgets }); }
const kn = (key, x, y, t) => ({ type: t || 'knobM', param: key, x, y, w: t === 'knobL' ? 80 : 52, h: t === 'knobL' ? 92 : 60 });
const row = (keys, x0, y) => keys.map((k, i) => kn(k, x0 + i * 52, y));

section('header', '', 0, 0, 1100, 48, '', [
  { type: 'logo', x: 16, y: 8, w: 200, h: 32 },
  { type: 'zoom', x: 222, y: 14, w: 50, h: 20 },
  { type: 'seg', param: 'engine', style: 'engine', x: 290, y: 9, w: 264, h: 30 },
  { type: 'presets', x: 566, y: 9, w: 300, h: 30 },
  { type: 'manualA', x: 876, y: 9, w: 68, h: 30 },
  { type: 'manualB', x: 950, y: 9, w: 68, h: 30 },
  { type: 'knobS', param: 'master', x: 1028, y: 6, w: 36, h: 36 },
  { type: 'meter', x: 1072, y: 9, w: 14, h: 30 },
]);

section('engA', 'ENGINE A · WAVELET SUBTRACTIVE', 12, 56, 544, 260, 'A', [
  { type: 'seg', param: 'a_wave', x: 12, y: 32, w: 520, h: 28 },
  { type: 'atom', x: 12, y: 70, w: 250, h: 136 },
  { type: 'step', param: 'wavelet', x: 12, y: 214, w: 250, h: 30 },
  { type: 'source', x: 276, y: 70, w: 256, h: 64 },
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

section('display', 'SCOPE · SCALOGRAM', 564, 56, 524, 260, '', [
  { type: 'scope', x: 12, y: 30, w: 500, h: 104 },
  { type: 'scalogram', x: 12, y: 142, w: 500, h: 106 },
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
section('lfo', 'LFO', 12, 472, 284, 140, '', [
  { type: 'seg', param: 'lfo_shape', x: 12, y: 30, w: 260, h: 24 },
  ...row(['lfo_rate', 'lfo_pitch', 'lfo_cut', 'lfo_pos'], 12, 64),
]);
section('voice', 'VOICE', 304, 472, 388, 140, '', [
  { type: 'seg', param: 'v_porta', x: 12, y: 30, w: 156, h: 22 },
  { type: 'leds', x: 176, y: 32, w: 200, h: 18 },
  ...row(['v_oct', 'v_fine', 'v_voices', 'v_glide', 'v_unison', 'v_detune', 'v_width'], 12, 64),
]);
section('fx', 'EFFECTS', 700, 472, 388, 140, '', [
  { type: 'fxheads', x: 12, y: 32, w: 364, h: 18 },
  ...row(['fx_drive', 'fx_dtime', 'fx_dfb', 'fx_dmix', 'fx_rsize', 'fx_rmix'], 38, 64),
]);
section('keys', '', 0, 620, 1100, 100, '', [
  { type: 'wheels', x: 12, y: 0, w: 60, h: 84 },
  { type: 'keyboard', x: 352, y: 0, w: 736, h: 84 },
  { type: 'credit', x: 588, y: 87, w: 500, h: 12 },
]);
// knobT = tiny knob with label (cell 40 x 56)
section('sub', 'SUB OSC', 80, 620, 128, 84, '', [
  { type: 'knobT', param: 'sub_level', x: 4, y: 22, w: 40, h: 58 },
  { type: 'knobT', param: 'sub_oct', x: 44, y: 22, w: 40, h: 58 },
  { type: 'knobT', param: 'sub_shape', x: 84, y: 22, w: 40, h: 58 },
]);
section('chorus', 'CHORUS', 216, 620, 128, 84, '', [
  { type: 'knobT', param: 'ch_mix', x: 4, y: 22, w: 40, h: 58 },
  { type: 'knobT', param: 'ch_rate', x: 44, y: 22, w: 40, h: 58 },
  { type: 'knobT', param: 'ch_depth', x: 84, y: 22, w: 40, h: 58 },
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
  { name: 'A · Square Mod', v: { ...WARM_PAD, wavelet: 0, f_cutoff: 3.06, f_res: 17.75, lfo_pitch: 5, master: -6 } },
  { name: 'A · Square Mod 2', v: { ...WARM_PAD, wavelet: 6, f_type: 2, f_cutoff: 5.4, f_res: 17.75, lfo_cut: 3.75, lfo_pitch: 5, master: -6 } },
  { name: 'A · Init', v: { engine: 0, a_wave: 0, wavelet: 2, f_cutoff: 7 } },
  { name: 'A · Wavelet Lead', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 4.5, f_res: 9, f_env: 4, mod_d: 0.6, mod_s: 0.2,
    v_voices: 1, v_glide: 0.06, v_unison: 2, v_detune: 9, lfo_rate: 5.5, lfo_pitch: 8, fx_dmix: 0.22, fx_dtime: 0.32, fx_rmix: 0.15 } },
  { name: 'A · Haar Bass', v: { engine: 0, a_wave: 2, a_width: 0.35, wavelet: 0, f_cutoff: 3.5, f_slope: 36, f_res: 6, f_env: 4,
    mod_d: 0.25, mod_s: 0, amp_a: 0.002, amp_d: 0.4, amp_s: 0.7, amp_r: 0.1, v_oct: -1, v_voices: 1, fx_drive: 0.3, master: -4,
    sub_level: 0.45, sub_oct: 0, sub_shape: 0 } },
  { name: 'A · Edge Pluck', v: { engine: 0, a_wave: 1, wavelet: 4, f_cutoff: 2.5, f_env: 6, mod_d: 0.35, mod_s: 0,
    p_center: 0.5, p_width: 0.4, p_depth: 1, amp_d: 1.2, amp_s: 0, amp_r: 0.4, fx_rmix: 0.25, master: -7 } },
  { name: 'A · Sparse Keys', v: { engine: 0, a_wave: 0, wavelet: 1, a_sparsity: 0.35, f_cutoff: 9, amp_d: 1.5, amp_s: 0.3,
    amp_r: 0.5, fx_rmix: 0.2, fx_dmix: 0.12 } },
  { name: 'A · Glass Pad', v: { engine: 0, a_wave: 3, wavelet: 6, f_cutoff: 6, f_res: 12, lfo_rate: 0.3, lfo_cut: 1.5,
    amp_a: 0.8, amp_d: 1, amp_s: 0.8, amp_r: 1.5, v_unison: 3, v_detune: 14, fx_rmix: 0.4, fx_dmix: 0.15, master: -5 } },
  { name: 'A · Noise Brass', v: { engine: 0, a_wave: 5, wavelet: 5, f_cutoff: 3, f_res: 6, f_env: 5, mod_a: 0.08, mod_d: 0.6,
    mod_s: 0.4, amp_a: 0.05, amp_s: 0.9, v_unison: 2, v_detune: 8, fx_rmix: 0.18 } },
  { name: 'A · Scanning Edge', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 3, f_res: 6, p_depth: 1, p_width: 0.25,
    lfo_rate: 0.25, lfo_pos: 0.5, amp_s: 1, fx_dmix: 0.2, fx_rmix: 0.2, master: -7 } },
  // beta 0.1 additions, from subtle to extreme effects
  { name: 'A · Clean Keys', v: { engine: 0, a_wave: 3, a_width: 0.5, wavelet: 3, f_cutoff: 7, f_env: 2, mod_d: 0.4, mod_s: 0.2,
    amp_a: 0.002, amp_d: 1.2, amp_s: 0.3, amp_r: 0.3, amp_vel: 0.7, fx_rsize: 0.4, fx_rmix: 0.08 } },
  { name: 'A · Infra Sub Bass', v: { engine: 0, a_wave: 1, wavelet: 4, f_cutoff: 3, f_slope: 30, f_env: 2.5, mod_d: 0.3, mod_s: 0.2,
    amp_a: 0.003, amp_d: 0.6, amp_s: 0.8, amp_r: 0.15, v_oct: -1, v_voices: 1, v_glide: 0.03,
    sub_level: 0.85, sub_oct: 1, sub_shape: 0, fx_rmix: 0.05, master: -4 } },
  { name: 'A · Dub Echo Lead', v: { engine: 0, a_wave: 2, a_width: 0.3, wavelet: 2, f_cutoff: 5, f_res: 10, f_env: 3, mod_d: 0.3,
    mod_s: 0.1, v_voices: 1, v_glide: 0.04, fx_dtime: 0.375, fx_dfb: 0.72, fx_dmix: 0.55, fx_rmix: 0.2, master: -5 } },
  { name: 'A · Fuzz Bass', v: { engine: 0, a_wave: 0, wavelet: 0, f_cutoff: 3.5, f_res: 8, f_env: 3, mod_d: 0.2, mod_s: 0.1,
    amp_a: 0.002, amp_d: 0.5, amp_s: 0.8, amp_r: 0.08, v_oct: -1, v_voices: 1, fx_drive: 0.85,
    sub_level: 0.6, sub_oct: 0, sub_shape: 2, master: -7 } },
  { name: 'A · Cathedral Saw', v: { engine: 0, a_wave: 0, wavelet: 6, f_cutoff: 6.5, amp_a: 0.05, amp_s: 0.9, amp_r: 2.5,
    v_unison: 2, v_detune: 8, fx_rsize: 1, fx_rmix: 0.85, master: -10 } },
  { name: 'A · Laser Sweep', v: { engine: 0, a_wave: 0, wavelet: 1, f_cutoff: 3, f_res: 20, f_slope: 60, lfo_shape: 2,
    lfo_rate: 6, lfo_cut: 4, p_depth: 0.7, p_width: 0.2, lfo_pos: 0.3, fx_drive: 0.3, fx_dtime: 0.18, fx_dfb: 0.6, fx_dmix: 0.35,
    master: -8 } },
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
  { name: 'B · Chip Walsh', v: { engine: 1, wavelet: 0, b_pattern: 3, b_tilt: 0,
    ...bars11([1, 0.5, 0.7, 0, 0.4, 0, 0, 0, 0, 0, 0]), amp_a: 0.001, amp_d: 0.2, amp_s: 0.6, amp_r: 0.05, master: -6 } },
  { name: 'B · Walsh Bells', v: { engine: 1, wavelet: 4, b_pattern: 3, b_tilt: -3, b_atk: 0.002, b_body: 3, b_bright: 0.4,
    b_sus: 0, amp_d: 4, amp_s: 0, amp_r: 2, fx_rmix: 0.35 } },
  { name: 'B · Impulse Pluck', v: { engine: 1, wavelet: 2, b_pattern: 4, b_tilt: -2, b_body: 1.2, b_bright: 0.08, b_sus: 0,
    amp_a: 0.001, amp_d: 1.5, amp_s: 0, amp_r: 0.5, fx_dmix: 0.2 } },
  { name: 'B · Random Glass', v: { engine: 1, wavelet: 3, b_pattern: 5, b_seed: 17, b_tilt: -4, b_atk: 0.2, b_spread: 0.5,
    b_body: 6, b_bright: 1.5, b_sus: 0.4, amp_a: 0.3, amp_s: 0.9, amp_r: 2, v_unison: 3, lfo_rate: 0.2, lfo_pos: 0.2,
    p_depth: 0.6, fx_rmix: 0.45, master: -5 } },
  { name: 'B · Mirror Pad', v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -5, b_atk: 1.5, b_spread: 1, amp_a: 1,
    amp_r: 2, amp_s: 1, v_unison: 4, v_detune: 18, fx_rmix: 0.5, master: -6 } },
  { name: 'B · Focus Sweep', v: { engine: 1, wavelet: 0, b_pattern: 0, b_tilt: -3, p_depth: 1, p_width: 0.3,
    lfo_rate: 0.5, lfo_pos: 0.5, amp_s: 1, fx_dmix: 0.25, fx_rmix: 0.2 } },
  // beta 0.1 additions, from subtle to extreme effects
  { name: 'B · Soft Flute', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: -9, ...bars11([1, 0.5, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0]),
    b_atk: 0.08, b_spread: 0.6, amp_a: 0.06, amp_s: 0.9, amp_r: 0.25, lfo_rate: 5, lfo_pitch: 8, fx_rmix: 0.12 } },
  { name: 'B · Music Box', v: { engine: 1, wavelet: 4, b_pattern: 3, b_tilt: -2, b_atk: 0.001, b_body: 1.5, b_bright: 0.2, b_sus: 0,
    amp_a: 0.001, amp_d: 2.5, amp_s: 0, amp_r: 1.2, v_oct: 1, fx_dtime: 0.28, fx_dfb: 0.35, fx_dmix: 0.25, fx_rmix: 0.25 } },
  { name: 'B · Space Choir', v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -6, b_atk: 1.2, b_spread: 1, amp_a: 1.2, amp_s: 1,
    amp_r: 3, v_unison: 4, v_detune: 22, lfo_rate: 0.25, lfo_pos: 0.25, p_depth: 0.5, fx_rsize: 0.95, fx_rmix: 0.75, master: -8 } },
  { name: 'B · Chip Echo', v: { engine: 1, wavelet: 0, b_pattern: 3, b_tilt: 0, ...bars11([1, 0.6, 0.3, 0.6, 0, 0, 0, 0, 0, 0, 0]),
    amp_a: 0.001, amp_d: 0.25, amp_s: 0.4, amp_r: 0.1, fx_dtime: 0.25, fx_dfb: 0.65, fx_dmix: 0.6, master: -8 } },
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
  { name: 'A · Sub Saw Bass', v: { engine: 0, a_wave: 0, wavelet: 2, f_cutoff: 3.8, f_slope: 30, f_res: 7, f_env: 3, mod_d: 0.3,
    mod_s: 0.15, amp_a: 0.002, amp_d: 0.5, amp_s: 0.75, amp_r: 0.1, v_oct: -1, v_voices: 1, v_glide: 0.04, v_porta: 2,
    sub_level: 0.7, sub_oct: 0, sub_shape: 2, fx_drive: 0.15, master: -6 } },
  { name: 'A · Reese Sub', v: { engine: 0, a_wave: 0, wavelet: 4, f_cutoff: 4.2, f_res: 4, amp_r: 0.12, v_oct: -1, v_voices: 1,
    v_unison: 3, v_detune: 22, v_width: 0.6, lfo_rate: 0.2, lfo_cut: 0.6, sub_level: 0.75, sub_oct: 0, sub_shape: 0,
    fx_drive: 0.25, master: -7 } },
  { name: 'A · Acid Sub', v: { engine: 0, a_wave: 1, wavelet: 0, f_cutoff: 2.5, f_slope: 48, f_res: 18, f_env: 6, f_vel: 2,
    mod_d: 0.22, mod_s: 0, amp_a: 0.002, amp_d: 0.3, amp_s: 0.6, amp_r: 0.08, v_oct: -1, v_voices: 1, v_glide: 0.08, v_porta: 2,
    sub_level: 0.55, sub_oct: 0, sub_shape: 1, fx_drive: 0.35, fx_dtime: 0.375, fx_dfb: 0.4, fx_dmix: 0.15, master: -7 } },
  { name: 'B · Sub Organ Bass', v: { engine: 1, wavelet: 6, b_pattern: 0, b_tilt: -3, ...bars11([1, 0.7, 0.4, 0.2, 0, 0, 0, 0, 0, 0, 0]),
    amp_a: 0.005, amp_d: 0.2, amp_s: 0.9, amp_r: 0.1, v_oct: -1, v_voices: 1, sub_level: 0.8, sub_oct: 1, sub_shape: 0,
    master: -5 } },
  { name: 'A · Deep Sub Pluck', v: { engine: 0, a_wave: 3, wavelet: 3, f_cutoff: 4, f_env: 5, mod_d: 0.25, mod_s: 0,
    amp_a: 0.001, amp_d: 0.9, amp_s: 0, amp_r: 0.3, v_oct: -1, sub_level: 0.8, sub_oct: 1, sub_shape: 0, fx_rmix: 0.1,
    master: -5 } },
  // ---- beta 0.2: engines A and B mixed
  { name: 'AB · Hybrid Strings', v: { engine: 0, ab_mix: 0.4, a_wave: 0, wavelet: 6, b_pattern: 1, b_tilt: -6, f_cutoff: 7,
    f_slope: 18, amp_a: 0.4, amp_s: 0.9, amp_r: 1, v_unison: 2, v_detune: 10, ch_mix: 0.7, ch_rate: 0.6, ch_depth: 0.7,
    fx_rmix: 0.3, master: 0 } },
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
  { name: 'AB · Sub Hybrid Bass', v: { engine: 0, ab_mix: 0.3, a_wave: 0, wavelet: 0, f_cutoff: 3.5, f_res: 8, f_env: 3.5,
    mod_d: 0.25, mod_s: 0.1, b_pattern: 1, b_tilt: 2, ...bars11([1, 0.6, 0.5, 0.3, 0, 0, 0, 0, 0, 0, 0]), amp_a: 0.002,
    amp_d: 0.4, amp_s: 0.8, amp_r: 0.08, v_oct: -1, v_voices: 1, sub_level: 0.6, sub_shape: 0, fx_drive: 0.3, master: -4 } },
  { name: 'AB · Dream Pad', v: { engine: 0, ab_mix: 0.5, a_wave: 2, a_width: 0.4, wavelet: 5, f_cutoff: 5, f_res: 5,
    lfo_rate: 0.2, lfo_cut: 1, lfo_pos: 0.25, p_depth: 0.4, b_pattern: 1, b_tilt: -6, b_atk: 1, b_spread: 0.8, amp_a: 1.2,
    amp_s: 0.9, amp_r: 3, v_unison: 3, v_detune: 14, ch_mix: 0.65, ch_rate: 0.4, ch_depth: 0.7, fx_dmix: 0.15,
    fx_rsize: 0.85, fx_rmix: 0.55, master: -3 } },
  { name: 'AB · Space Strings', v: { engine: 0, ab_mix: 0.3, a_wave: 0, wavelet: 6, f_cutoff: 8, b_pattern: 0, b_tilt: -4,
    amp_a: 0.6, amp_s: 0.9, amp_r: 2, ch_mix: 0.9, ch_rate: 0.55, ch_depth: 0.85, fx_dtime: 0.5, fx_dfb: 0.45, fx_dmix: 0.2,
    fx_rsize: 0.9, fx_rmix: 0.5, master: -5 } },
  { name: 'AB · Glass Keys', v: { engine: 1, ab_mix: 0.6, a_wave: 4, wavelet: 3, b_pattern: 4, b_tilt: -3, b_body: 2,
    b_bright: 0.25, b_sus: 0, amp_a: 0.002, amp_d: 2, amp_s: 0, amp_r: 1, amp_vel: 0.6, ch_mix: 0.35, fx_rmix: 0.3, master: 1 } },
  { name: 'AB · Wide Brass', v: { engine: 0, ab_mix: 0.3, a_wave: 0, wavelet: 3, f_cutoff: 3.5, f_res: 5, f_env: 5, mod_a: 0.06,
    mod_d: 0.5, mod_s: 0.5, b_pattern: 0, b_tilt: -2, amp_a: 0.04, amp_s: 0.9, amp_r: 0.3, v_unison: 2, v_detune: 10,
    ch_mix: 0.35, ch_rate: 0.8, fx_rmix: 0.2, master: -3 } },
  { name: 'AB · Chip Hybrid', v: { engine: 1, ab_mix: 0.5, a_wave: 1, wavelet: 0, f_cutoff: 9, b_pattern: 3,
    ...bars11([1, 0.5, 0.7, 0, 0.4, 0, 0, 0, 0, 0, 0]), amp_a: 0.001, amp_d: 0.25, amp_s: 0.6, amp_r: 0.05, v_voices: 1,
    v_glide: 0.02, v_porta: 2, fx_dtime: 0.25, fx_dfb: 0.5, fx_dmix: 0.25, master: -3 } },
  { name: 'AB · Shimmer Pluck', v: { engine: 0, ab_mix: 0.4, a_wave: 0, wavelet: 4, f_cutoff: 3, f_env: 6, mod_d: 0.35, mod_s: 0,
    b_pattern: 5, b_seed: 7, b_tilt: -2, b_body: 2, b_bright: 0.3, b_sus: 0, amp_a: 0.001, amp_d: 1.2, amp_s: 0, amp_r: 0.5,
    ch_mix: 0.5, fx_dtime: 0.3, fx_dfb: 0.5, fx_dmix: 0.3, fx_rmix: 0.35, master: 0 } },

  // ---- beta 0.3: a library by category (cat), like the factory banks of a hardware synthesizer
  // Bass
  { name: 'A · Ladder Bass', cat: 'Bass', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 2.8, f_slope: 48, f_res: 9, f_env: 4.5, f_vel: 2,
    mod_d: 0.28, mod_s: 0.15, amp_a: 0.002, amp_d: 0.6, amp_s: 0.8, amp_r: 0.1, v_oct: -1, v_voices: 1, v_glide: 0.03, v_porta: 2,
    sub_level: 0.4, sub_shape: 0, fx_drive: 0.2, master: -1 } },
  { name: 'B · Pluck Bass', cat: 'Bass', v: { engine: 1, wavelet: 2, b_pattern: 0, b_tilt: -3, ...bars11([1, 0.8, 0.5, 0.3, 0.2, 0, 0, 0, 0, 0, 0]),
    b_body: 0.9, b_bright: 0.1, b_sus: 0.5, amp_a: 0.001, amp_d: 0.8, amp_s: 0.4, amp_r: 0.08, v_oct: -1, v_voices: 1,
    sub_level: 0.5, master: 4 } },
  { name: 'AB · Wobble Bass', cat: 'Bass', v: { engine: 0, ab_mix: 0.3, a_wave: 0, wavelet: 0, f_cutoff: 3, f_res: 10, lfo_rate: 3,
    lfo_cut: 3, b_pattern: 3, v_oct: -1, v_voices: 1, sub_level: 0.6, sub_shape: 0, fx_drive: 0.4, master: -2.5 } },
  { name: 'A · Rubber Bass', cat: 'Bass', v: { engine: 0, a_wave: 3, wavelet: 4, f_cutoff: 3.5, f_env: 3, mod_d: 0.2, mod_s: 0,
    amp_d: 0.5, amp_s: 0.6, amp_r: 0.06, v_oct: -1, v_voices: 1, v_glide: 0.08, v_porta: 2, sub_level: 0.5, sub_shape: 1, master: 1 } },
  { name: 'A · Octave Bass', cat: 'Bass', v: { engine: 0, a_wave: 1, wavelet: 2, f_cutoff: 4.5, f_env: 2, mod_d: 0.15, mod_s: 0,
    amp_a: 0.002, amp_d: 0.3, amp_s: 0.5, amp_r: 0.05, v_oct: -1, sub_level: 0.6, sub_shape: 2, master: -7.5 } },
  // Lead
  { name: 'A · Saw Lead', cat: 'Lead', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 7, f_res: 4, v_voices: 1, v_porta: 2, v_glide: 0.05,
    v_unison: 2, v_detune: 10, lfo_rate: 5.5, lfo_pitch: 5, fx_dtime: 0.375, fx_dfb: 0.35, fx_dmix: 0.18, fx_rmix: 0.15, master: 0.5 } },
  { name: 'A · Whistle Lead', cat: 'Lead', v: { engine: 0, a_wave: 4, wavelet: 6, v_oct: 1, v_voices: 1, v_porta: 2, v_glide: 0.1,
    lfo_rate: 5.5, lfo_pitch: 10, amp_a: 0.04, amp_r: 0.2, fx_dmix: 0.15, fx_rmix: 0.25, master: -1 } },
  { name: 'A · Pulse Lead', cat: 'Lead', v: { engine: 0, a_wave: 2, a_width: 0.2, wavelet: 2, f_cutoff: 5.5, f_res: 8, f_env: 2.5,
    mod_d: 0.3, mod_s: 0.3, v_voices: 1, v_porta: 2, v_glide: 0.04, ch_mix: 0.3, fx_dmix: 0.2, master: 5 } },
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
  { name: 'A · Dark Pad', cat: 'Pad', v: { engine: 0, a_wave: 3, wavelet: 6, f_cutoff: 3, f_slope: 48, amp_a: 1.5, amp_s: 1, amp_r: 3,
    v_unison: 3, v_detune: 12, sub_level: 0.3, sub_shape: 0, fx_rsize: 0.9, fx_rmix: 0.6, master: -10.5 } },
  { name: 'B · Halo Pad', cat: 'Pad', v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -5, b_atk: 2.5, b_spread: 1, amp_a: 1.5, amp_s: 1,
    amp_r: 3, v_unison: 3, v_detune: 14, ch_mix: 0.6, ch_rate: 0.35, fx_rsize: 0.95, fx_rmix: 0.7, master: -1 } },
  { name: 'AB · Evolving Pad', cat: 'Pad', v: { engine: 0, ab_mix: 0.5, a_wave: 2, a_width: 0.3, wavelet: 4, f_cutoff: 5, p_depth: 0.6,
    p_width: 0.3, lfo_rate: 0.12, lfo_pos: 0.5, lfo_cut: 0.8, b_pattern: 5, b_seed: 23, b_atk: 3, b_spread: 1, b_tilt: -4,
    amp_a: 2, amp_s: 1, amp_r: 3, v_unison: 2, v_detune: 10, ch_mix: 0.5, fx_dmix: 0.15, fx_rmix: 0.6, master: 0 } },
  // Strings
  { name: 'A · Chamber Strings', cat: 'Strings', v: { engine: 0, a_wave: 0, wavelet: 6, f_cutoff: 6.5, f_slope: 18, amp_a: 0.25,
    amp_s: 0.9, amp_r: 0.8, v_unison: 2, v_detune: 8, ch_mix: 0.4, ch_rate: 0.6, ch_depth: 0.5, fx_rmix: 0.35, master: -1.5 } },
  { name: 'A · Pizzicato', cat: 'Strings', v: { engine: 0, a_wave: 0, wavelet: 5, f_cutoff: 4, f_env: 4, mod_d: 0.15, mod_s: 0,
    amp_a: 0.002, amp_d: 0.35, amp_s: 0, amp_r: 0.2, fx_rmix: 0.35, master: 1 } },
  { name: 'A · Slow Strings', cat: 'Strings', v: { engine: 0, a_wave: 0, wavelet: 6, f_cutoff: 7, f_slope: 18, amp_a: 1.2, amp_s: 0.9,
    amp_r: 2, ch_mix: 0.7, ch_rate: 0.5, ch_depth: 0.7, fx_rmix: 0.5, master: -1 } },
  { name: 'AB · Analog Strings', cat: 'Strings', v: { engine: 0, ab_mix: 0.25, a_wave: 0, wavelet: 6, b_pattern: 0, b_tilt: -6,
    f_cutoff: 6.5, amp_a: 0.3, amp_s: 0.9, amp_r: 1, ch_mix: 0.9, ch_rate: 0.6, ch_depth: 0.8, fx_rmix: 0.3, master: -0.5 } },
  // Brass & Wind
  { name: 'A · Synth Brass', cat: 'Brass & Wind', v: { engine: 0, a_wave: 0, wavelet: 3, f_cutoff: 3, f_res: 4, f_env: 6, mod_a: 0.08,
    mod_d: 0.45, mod_s: 0.5, amp_a: 0.03, amp_s: 0.9, amp_r: 0.2, v_unison: 2, v_detune: 12, fx_drive: 0.15, fx_rmix: 0.2, master: -5 } },
  { name: 'A · Brass Stab', cat: 'Brass & Wind', v: { engine: 0, a_wave: 0, wavelet: 2, f_cutoff: 2.5, f_res: 5, f_env: 7, mod_d: 0.2,
    mod_s: 0.1, amp_a: 0.005, amp_d: 0.35, amp_s: 0.2, amp_r: 0.15, v_unison: 2, v_detune: 8, fx_rmix: 0.25, master: -0.5 } },
  { name: 'B · Clarinet', cat: 'Brass & Wind', v: { engine: 1, wavelet: 6, b_pattern: 1, b_tilt: -6, ...bars11([1, 0.6, 0.4, 0.2, 0, 0, 0, 0, 0, 0, 0]),
    b_atk: 0.05, amp_a: 0.05, amp_s: 0.9, amp_r: 0.15, lfo_rate: 5, lfo_pitch: 5, fx_rmix: 0.2, master: -3.5 } },
  { name: 'AB · Breathy Flute', cat: 'Brass & Wind', v: { engine: 1, ab_mix: 0.8, a_wave: 5, wavelet: 6, f_cutoff: 7, b_pattern: 0, b_tilt: -9,
    ...bars11([1, 0.5, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0]), amp_a: 0.08, amp_s: 0.9, amp_r: 0.25, lfo_rate: 5, lfo_pitch: 6, fx_rmix: 0.25,
    master: -3 } },
  // Pluck
  { name: 'A · Harp', cat: 'Pluck', v: { engine: 0, a_wave: 3, wavelet: 6, f_cutoff: 4.5, f_env: 4, mod_d: 0.6, mod_s: 0, amp_a: 0.002,
    amp_d: 2, amp_s: 0, amp_r: 1, fx_rsize: 0.8, fx_rmix: 0.45, master: -2.5 } },
  { name: 'B · Koto', cat: 'Pluck', v: { engine: 1, wavelet: 2, b_pattern: 0, b_tilt: -2, ...bars11([1, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0, 0, 0, 0]),
    b_body: 1.2, b_bright: 0.15, b_sus: 0, amp_a: 0.001, amp_d: 1.4, amp_s: 0, amp_r: 0.4, lfo_rate: 4, lfo_pitch: 3,
    fx_rmix: 0.2, master: 2 } },
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
];
// Presets saved before A/B MIX existed play the engine they were made for.
for (const pr of PRESET_LIST) if (pr.v.ab_mix === undefined) pr.v.ab_mix = pr.v.engine || 0;

// Categories (preset menu groups, like the banks of a hardware synthesizer), in menu order.
const CATEGORIES = ['Bass', 'Lead', 'Keys', 'Organ', 'Pad', 'Strings', 'Brass & Wind', 'Pluck', 'Bells & Mallets', 'FX', 'Drums & Perc', 'Init'];
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

// Factory order (preset menu, ◀ ▶, VST programs): OktoPierre's favourite sounds first, in his order (the
// ★ FAVOURITES group of the menu), then every other preset by category, in the order of CATEGORIES.
const FAVOURITES = ['A · Square Mod 2', 'A · Wavelet Lead', 'A · Haar Bass', 'A · Edge Pluck', 'B · Focus Sweep',
  'B · Soft Flute', 'A · Infra Sub Bass', 'A · Dub Echo Lead', 'A · Fuzz Bass', 'A · Laser Sweep', 'A · Warm Pad',
  'B · Mirror Sub Bass', 'A · Sparse Keys', 'B · Space Choir', 'A · Square Mod'];
const PRESETS = FAVOURITES.map((n) => {
  const p = PRESET_LIST.find(x => x.name === n);
  if (!p) throw new Error('preset not found: ' + n);
  return p;
});
for (const cat of CATEGORIES) for (const p of PRESET_LIST) if (p.cat === cat && !FAVOURITES.includes(p.name)) PRESETS.push(p);
if (PRESETS.length !== PRESET_LIST.length || new Set(PRESETS).size !== PRESET_LIST.length) throw new Error('factory order: every preset exactly once');
if (!PRESETS.some(p => p.name === DEFAULT_PRESET)) throw new Error('DEFAULT_PRESET not found: ' + DEFAULT_PRESET);

// Validate preset keys and ranges at generation time.
for (const pr of PRESETS) for (const [k, v] of Object.entries(pr.v)) {
  if (!(k in idx)) throw new Error(`preset ${pr.name}: unknown param ${k}`);
  const p = P[idx[k]];
  if (v < p.min || v > p.max) throw new Error(`preset ${pr.name}: ${k}=${v} out of range`);
}
for (const s of S) for (const w of s.widgets) if (w.param && !(w.param in idx)) throw new Error('layout: unknown param ' + w.param);

module.exports = { DEVICE, APP, DEFAULT_PRESET, PARAMS: P, INDEX: idx, SECTIONS: S, PRESETS, FAVOURITES: FAVOURITES.length, CATEGORIES };
