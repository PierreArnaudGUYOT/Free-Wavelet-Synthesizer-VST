// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — single source of truth (based on the Wavelet Synthesizer beta 0.7).
// Created by Pierre Arnaud GUYOT ("OktoPierre"). Release history: see RELEASE_HISTORY.md
// Okto MultiWave Synth beta 0.1 (2026-10-18) — the Wavelet Synthesizer beta 0.7 with TWO OSCILLATORS PER ENGINE (A1 A2 subtractive,
//   B1 B2 additive, each with its own wavelet, filter, window, level, tuning, own envelope and pitch envelope), its 22 TOP
//   Sounds, 200 new presets (the first listening), a CHORD MODE (chord-harp-style chord keyboard) and the findings of
//   the CPU load study. The history of the base synthesizer is in RELEASE_HISTORY.md.
// Parameters, panel layout and factory presets are defined here once and
// generated into web/js/spec.js and vst/src/generated/spec.h by gen_spec.js.
// Parameter order defines the VST3 ParamIDs: append only, never reorder.
'use strict';

const DEVICE = { w: 1100, h: 944 };   // the panel (beta 0.3.4: 944, the owner's mock-up P6 / Q1 / R6); CHORD MODE adds CHORD_H below the keyboard row (the chord card)
// beta 0.3.4: the ORIENTAL colour code, on while the TUNING switch of the PLAY card is ARAB or TURK (mt_mode is not 0): the accent becomes the palette's colour for the
// subtractive oscillators (a) and for the additive one (b) (knob arcs, tabs, scope, toggles, ...), the cards stay grey, and the PLAY card gets a
// pattern of octagons and squares (4.8.8, an eight-pointed star in each octagon; one tile = `tile` px) in c1 / c2 / c3 (light) over
// c4 / c5 (dark); pl = the card's gradient, dim = the captions on the pattern; `opacity`: the pattern over the card's gradient. Web: CSS
// variables + an SVG pattern; plug-in: accent() and polygons (the owner's mock-up, tuning ARAB).
// version 1.0.5: the same pattern in two colours, one for each tuning: ARAB sand-gold, TURK carmine (the owner's choice among four pairs); a / b = the accent of the subtractive / additive oscillators
// while the tuning is on (the rest of the names as above); the web reads ORIENT.arab / ORIENT.turk, the plug-in kOrientPals[0] / [1].
const ORIENT = {
  // version 1.0.9 (proposal): g = the panel's gradient (5 stops, as the Crepuscule one) and glow = its three colour blobs, in the colours of the pattern; page = the dark ground of the web page behind the pattern
  arab: { a: '#f0b84a', b: '#e46f4a', c1: '#c98a1f', c2: '#e46f4a', c3: '#fbf0d6', c4: '#2b2010', c5: '#4a3715', pl: ['#3a2c14', '#281d0d'], dim: '#cdbf9c',
    g: ['#2b2010', '#4a3715', '#7a5618', '#b07a22', '#d9a03a'], glow: ['#e46f4a', '#f0b84a', '#a8431f'], page: '#0e0a05' },
  turk: { a: '#ff5468', b: '#ffb347', c1: '#d6334a', c2: '#ffb347', c3: '#ffe9ea', c4: '#33101a', c5: '#5a1a2a', pl: ['#401522', '#2c0e17'], dim: '#d1aab1',
    g: ['#33101a', '#5a1a2a', '#8f2a3c', '#c23a4a', '#e0603c'], glow: ['#ff5468', '#ffb347', '#a0183a'], page: '#12060a' },
  tile: 34, opacity: 0.7,
  pageTile: 64, pageOpacity: 0.55,   // version 1.0.9 (web): the same pattern, larger, in the page's margins
};
const APP = {
  name: 'Okto MultiWave Synth',
  author: 'Pierre Arnaud GUYOT',
  credit: 'created by OktoPierre',   // the vendor line (manuals)
  panelCredit: 'By OktoPierre',      // beta 0.7: the panel's credit (bottom left, small and discreet)
  copyright: 'Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)',
  license: 'GPL v3',                 // shown on the panel; the licence is GPL-3.0-or-later (file LICENSE)
  version: '1.0',   // the version SHOWN (the panel's credit, the preset files): OktoWave 1.0, the first stable release; the technical number below is the release's (1.0.x)
  versionNum: '1.0.11',
  date: '2026-10-21',
  doi: '',                           // no Zenodo record yet (the base synthesizer's is 10.5281/zenodo.23431760)
  base: 'Wavelet Synthesizer beta 0.7',   // the synthesizer Okto MultiWave Synth is built on
};
// curve: lin | exp | pow2 | int | choice
// fmt:   pct | db | sec | hz | cents | band | dbband | int | choice | deg | cyc | semi | bipct | bandamt
const P = [];
// perf: a performance setting (Okto MultiWave Synth): on the panel and automatable, but never stored in a preset, never marking the
// preset modified; the plug-in's state and the web app's saved state keep it (like the keyboard, it is not a sound).
function add(key, name, short, o) { P.push(Object.assign({ key, name, short, curve: 'lin', fmt: 'pct', hidden: false, structural: false, perf: false }, o)); }

// the oscillator shown on the panel (A1 A2 | B1); not a sound: switching it never marks a preset as modified
// (beta 0.3: B2 is gone; the three folder tabs OSC1 A1 | OSC2 A2 | OSC3 B1 above the cards choose it)
add('osc_view', 'Oscillator Shown', 'OSC', { curve: 'choice', fmt: 'choice', min: 0, max: 2, def: 0, structural: true,
  choices: ['A1 · Subtractive', 'A2 · Subtractive', 'B1 · Additive'], choiceShort: ['A1', 'A2', 'B1'] });
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
// beta 0.2: a string-machine triple chorus.
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
// Okto MultiWave Synth beta 0.2: SUPERMODULATION. LFO 2 reaches every control of the wavelet oscillators (the choices from SPARSITY on are
// appended): SPARSITY and SOURCE WIDTH (the subtractive oscillators' tables are then built at several values and each voice
// crossfades between the two nearest, like SOURCE PHASE), TILT, ODD BARS, EVEN BARS and SCALE SUSTAIN (the additive ones), and the
// WAVELET MORPH position. LFO 1 gains three more amounts: SPARSITY, RESO and ENV>WAV (the envelope's reach on the morph).
add('lfo2_target', 'LFO 2 Target', 'TARGET', { curve: 'choice', fmt: 'choice', min: 0, max: 18, def: 0,
  choices: ['Cutoff', 'Slope', 'Resonance', 'Key Tracking', 'Envelope Amount', 'Velocity Amount', 'Position', 'Window Width', 'Window Depth',
    'Source Phase', 'Sparsity', 'Source Width', 'Tilt', 'Odd Bars', 'Even Bars', 'Scale Sustain', 'Wavelet Morph', 'Filter Cutoff', 'Filter Resonance'],
  choiceShort: ['CUTOFF', 'SLOPE', 'RESO', 'KEY TRK', 'ENV AMT', 'VEL AMT', 'POSITION', 'WIDTH', 'DEPTH', 'PHASE', 'SPARSITY', 'SRC WIDTH',
    'TILT', 'ODD BARS', 'EVEN BARS', 'SCALE SUS', 'MORPH', 'FLT CUT', 'FLT RESO'] });
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

// ---------------------------------------------------------------- Okto MultiWave Synth: the chord keyboard (beta 0.1)
// The chord types: label (the pads, the selector keys), suffix (the chord name after the root; "" = major), iv = the
// notes in semitones above the root. Append only: chord_type stores the index. The first twelve are on the selector keys.
const CHORDS = [
  { label: 'Maj', name: 'Major', suffix: '', iv: [0, 4, 7] },
  { label: 'Min', name: 'Minor', suffix: 'm', iv: [0, 3, 7] },
  { label: '7', name: 'Dominant 7', suffix: '7', iv: [0, 4, 7, 10] },
  { label: 'm7', name: 'Minor 7', suffix: 'm7', iv: [0, 3, 7, 10] },
  { label: 'Maj7', name: 'Major 7', suffix: 'maj7', iv: [0, 4, 7, 11] },
  { label: 'Sus2', name: 'Sus2', suffix: 'sus2', iv: [0, 2, 7] },
  { label: 'Sus4', name: 'Sus4', suffix: 'sus4', iv: [0, 5, 7] },
  { label: 'Dim', name: 'Diminished', suffix: 'dim', iv: [0, 3, 6] },
  { label: 'Aug', name: 'Augmented', suffix: 'aug', iv: [0, 4, 8] },
  { label: '5', name: 'Power chord', suffix: '5', iv: [0, 7] },
  { label: 'Add9', name: 'Add 9', suffix: 'add9', iv: [0, 4, 7, 14] },
  { label: 'Note', name: 'Single note', suffix: '', iv: [0] },
  { label: '6', name: 'Major 6', suffix: '6', iv: [0, 4, 7, 9] },
  { label: 'm6', name: 'Minor 6', suffix: 'm6', iv: [0, 3, 7, 9] },
  { label: 'm7b5', name: 'Half-diminished', suffix: 'm7b5', iv: [0, 3, 6, 10] },
  { label: 'Dim7', name: 'Diminished 7', suffix: 'dim7', iv: [0, 3, 6, 9] },
  { label: '9', name: 'Dominant 9', suffix: '9', iv: [0, 4, 7, 10, 14] },
  { label: 'm9', name: 'Minor 9', suffix: 'm9', iv: [0, 3, 7, 10, 14] },
  { label: 'Maj9', name: 'Major 9', suffix: 'maj9', iv: [0, 4, 7, 11, 14] },
  { label: '7sus4', name: '7 sus4', suffix: '7sus4', iv: [0, 5, 7, 10] },
  { label: 'mMaj7', name: 'Minor-major 7', suffix: 'mMaj7', iv: [0, 3, 7, 11] },
  { label: '6/9', name: '6/9', suffix: '6/9', iv: [0, 4, 7, 9, 14] },
];
// The chord type of each key of the selector octave, C to B: the white keys carry the major / bright family, the black keys
// the minor, altered or bare chords, so the left hand finds them without looking (C Maj, C# Min, D 7, D# m7, E Maj7,
// F Sus2, F# Dim, G Sus4, G# Aug, A Add9, A# 5, B Note).
const CHORD_KEYS = [0, 1, 2, 3, 4, 5, 7, 6, 8, 10, 9, 11];
const CHORD_OCTAVES = ['C1–B1', 'C2–B2', 'C3–B3', 'C4–B4', 'C5–B5'];   // selector octave k = MIDI 24 + 12 k .. + 11
add('chord_mode', 'Chord Keyboard', 'CHORD', { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 0, perf: true, choices: ['Off', 'On'], choiceShort: ['OFF', 'ON'] });
add('chord_type', 'Chord Type', 'TYPE', { curve: 'choice', fmt: 'choice', min: 0, max: CHORDS.length - 1, def: 0, perf: true,
  choices: CHORDS.map(c => c.name), choiceShort: CHORDS.map(c => c.label) });
add('chord_oct', 'Chord Keys Octave', 'KEYS OCT', { curve: 'choice', fmt: 'choice', min: 0, max: CHORD_OCTAVES.length - 1, def: 2, perf: true,
  choices: CHORD_OCTAVES, choiceShort: CHORD_OCTAVES.map(s => s.slice(0, 2)) });
add('chord_voicing', 'Chord Voicing', 'VOICING', { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 1, perf: true, choices: ['Stacked', 'Folded'], choiceShort: ['STACKED', 'FOLDED'] });
// beta 0.2: BASS is on by default: a bass note two octaves below the chord's root plays with the chord, a little louder
add('chord_bass', 'Chord Bass', 'BASS', { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 1, perf: true, choices: ['Off', 'On'], choiceShort: ['OFF', 'BASS'] });
add('chord_strum', 'Chord Strum', 'STRUM', { fmt: 'sec', min: 0, max: 0.1, def: 0, perf: true });
// ---------------------------------------------------------------- Okto MultiWave Synth: four oscillators (beta 0.1)
// Two oscillators per engine: A1 A2 (wavelet subtractive) and B1 B2 (wavelet additive). Each one is a complete little voice:
// its own wavelet and source (or atom pattern and drawbars), SCALE FILTER, POSITION window, LEVEL, tuning (octave, semitones,
// cents), an optional OWN ENVELOPE (it multiplies the AMP ENVELOPE: a short one gives a percussive attack) and a PITCH
// ENVELOPE (the pitch falls from AMOUNT semitones in TIME seconds). A1 and B1 are the two oscillators of the Wavelet
// Synthesizer beta 0.7 and keep its parameters (a_wave, f_cutoff, b_bar1 ...), so its 22 TOP Sounds are unchanged; their
// level, tuning and envelope parameters are new, and so are the filter and window of B1 (they were shared with A1).
// The SLOTS table maps the fields of an oscillator to its parameters: the engine and both panels are written once for any slot.
const WAVELET_KEYS = { A: { wavelet: 'wavelet', wave: 'a_wave', width: 'a_width', sparsity: 'a_sparsity', phase: 'a_phase' },
  B: { wavelet: 'wavelet', pattern: 'b_pattern', seed: 'b_seed', tilt: 'b_tilt', atk: 'b_atk', spread: 'b_spread', body: 'b_body',
    bright: 'b_bright', sus: 'b_sus' } };
for (let b = 1; b <= 11; b++) WAVELET_KEYS.B['bar' + b] = 'b_bar' + b;
const FILTER_KEYS = { ftype: 'f_type', fcut: 'f_cutoff', fslope: 'f_slope', fres: 'f_res', fkey: 'f_keytrk', fenv: 'f_env', fvel: 'f_vel',
  pcen: 'p_center', pwid: 'p_width', pdep: 'p_depth' };
const SLOT_IDS = ['a1', 'a2', 'b1'];   // beta 0.3: the second additive oscillator (B2) was removed
const SLOTS = [];
const paramByKey = k => P.find(p => p.key === k);
// clones the parameter `base` (a template from the Wavelet Synthesizer's list) as key `key` of slot `name`
function cloneParam(key, name, base) {
  const t = paramByKey(base);
  const o = Object.assign({}, t); delete o.key; delete o.name; delete o.short;
  add(key, name + ' ' + t.name, t.short, o);
}
for (const id of SLOT_IDS) {
  const mode = id[0] === 'a' ? 0 : 1, name = id.toUpperCase(), k = {};
  // the oscillator's tone: the Wavelet Synthesizer's own keys for A1 and B1 (A1 also its filter and window), clones for the others
  // (B1 has its own wavelet, filter and window: it shared A1's)
  for (const [f, base] of Object.entries(WAVELET_KEYS[mode ? 'B' : 'A'])) {
    if (id === 'a1' || (id === 'b1' && f !== 'wavelet')) k[f] = base; else { k[f] = id + '_' + f; cloneParam(k[f], name, base); }
  }
  for (const [f, base] of Object.entries(FILTER_KEYS)) {
    if (id === 'a1') k[f] = base; else { k[f] = id + '_' + f; cloneParam(k[f], name, base); }
  }
  // level, tuning, own envelope, pitch envelope (all new)
  k.lvl = id + '_lvl'; add(k.lvl, name + ' Level', name, { min: 0, max: 1, def: id === 'a1' ? 1 : 0 });
  k.oct = id + '_oct'; add(k.oct, name + ' Octave', 'OCTAVE', { curve: 'int', fmt: 'int', min: -3, max: 3, def: 0 });
  k.semi = id + '_semi'; add(k.semi, name + ' Semitones', 'SEMI', { curve: 'int', fmt: 'semi', min: -12, max: 12, def: 0 });
  k.fine = id + '_fine'; add(k.fine, name + ' Fine Tune', 'FINE', { fmt: 'cents', min: -100, max: 100, def: 0 });
  k.eon = id + '_eon'; add(k.eon, name + ' Own Envelope', 'OWN ENV', { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 0,
    choices: ['Off', 'On'], choiceShort: ['OFF', 'ON'] });
  // the four envelope parameters stay consecutive (the ADSR display reads param .. param + 3)
  k.ea = id + '_ea'; add(k.ea, name + ' Env Attack', 'ATTACK', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.001 });
  k.ed = id + '_ed'; add(k.ed, name + ' Env Decay', 'DECAY', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.25 });
  k.es = id + '_es'; add(k.es, name + ' Env Sustain', 'SUSTAIN', { min: 0, max: 1, def: 0 });
  k.er = id + '_er'; add(k.er, name + ' Env Release', 'RELEASE', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.15 });
  k.pamt = id + '_pamt'; add(k.pamt, name + ' Pitch Env Amount', 'PITCH ENV', { curve: 'lin', fmt: 'semi', min: -48, max: 48, def: 0 });
  k.ptime = id + '_ptime'; add(k.ptime, name + ' Pitch Env Time', 'TIME', { curve: 'exp', fmt: 'sec', min: 0.005, max: 2, def: 0.08 });
  SLOTS.push({ id, mode, name, k });
}
// beta 0.2 (appended after the oscillators' clones): three more amounts of LFO 1. SPARSITY moves every subtractive oscillator's
// sparsity by ± the amount (its tables are built at several sparsities, see core.js), RESO the resonance of every scale filter by ±
// the amount in dB (kept in 0 .. 24), ENV>WAV makes the reach of the mod envelope on the WAVELET MORPH swing with the LFO
// (env_wav + amount · LFO).
add('lfo_sp', 'LFO 1 to Sparsity', 'SPARSITY', { fmt: 'pct', min: 0, max: 1, def: 0 });
add('lfo_res', 'LFO 1 to Resonance', 'RESO', { fmt: 'db', min: 0, max: 24, def: 0 });
add('lfo_ew', 'LFO 1 to Envelope>Wavelet', 'ENV>WAV', { fmt: 'pct', min: 0, max: 1, def: 0 });
// beta 0.2: ORIENTAL KEYBOARD, quarter tones as on the oriental keyboards of Yamaha. A three-position switch (TUNING: Western, Arabic,
// Turkish) re-tunes the keys; MAQAM chooses the scale and TONIC the key it starts on. Arabic: 24-tone equal temperament (quarter tones
// of 50 cents); Turkish: the 53-comma system (a comma = 1200/53 = 22.64 cents, the Arel-Ezgi-Uzdilek values). A key that is not a
// degree of the scale keeps its equal-tempered pitch, so the sharps and flats stay playable. Each key's pitch is moved from its
// equal-tempered value by MICRO_TABLES[tuning][scale][semitones above the tonic] cents, whatever plays it (a key, a chord's notes).
// A performance setting, like CHORD MODE: never in a preset, off in the demo.
const COMMA = 1200 / 53;
const MICRO_SCALES = [   // degrees: semitone above the tonic -> cents (Arabic) / commas (Turkish) above the tonic
  { name: 'Rast', short: 'RAST', ar: { 2: 200, 4: 350, 5: 500, 7: 700, 9: 900, 11: 1050 }, tr: { 2: 9, 4: 17, 5: 22, 7: 31, 9: 40, 11: 48 } },
  { name: 'Bayati / Uşşak', short: 'BAYATI', ar: { 2: 150, 3: 300, 5: 500, 7: 700, 8: 800, 10: 1000 }, tr: { 2: 8, 3: 13, 5: 22, 7: 31, 8: 35, 10: 44 } },
  { name: 'Hijaz / Hicaz', short: 'HIJAZ', ar: { 1: 100, 4: 400, 5: 500, 7: 700, 8: 800, 10: 1000 }, tr: { 1: 5, 4: 17, 5: 22, 7: 31, 8: 36, 10: 44 } },
  { name: 'Saba', short: 'SABA', ar: { 2: 150, 3: 300, 4: 400, 7: 700, 8: 800, 10: 1000 }, tr: { 2: 8, 3: 13, 4: 18, 7: 31, 8: 35, 10: 44 } },
  { name: 'Nahawand / Buselik', short: 'NAHAWAND', ar: { 2: 200, 3: 300, 5: 500, 7: 700, 8: 800, 10: 1000 }, tr: { 2: 9, 3: 13, 5: 22, 7: 31, 8: 35, 10: 44 } },
];
const MICRO_TABLES = ['ar', 'tr'].map(t => MICRO_SCALES.map(s => {
  const o = new Array(12).fill(0);
  for (const [pc, v] of Object.entries(s[t])) o[+pc] = (t === 'ar' ? v : v * COMMA) - 100 * pc;   // cents above or below the equal-tempered key
  return o;
}));
const NOTE_LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
add('mt_mode', 'Oriental Tuning', 'TUNING', { curve: 'choice', fmt: 'choice', min: 0, max: 2, def: 0, perf: true,
  choices: ['Western', 'Arabic', 'Turkish'], choiceShort: ['WEST', 'ARAB', 'TURK'] });
add('mt_scale', 'Oriental Scale', 'MAQAM', { curve: 'choice', fmt: 'choice', min: 0, max: MICRO_SCALES.length - 1, def: 0, perf: true,
  choices: MICRO_SCALES.map(s => s.name), choiceShort: MICRO_SCALES.map(s => s.short) });
add('mt_tonic', 'Oriental Tonic', 'TONIC', { curve: 'choice', fmt: 'choice', min: 0, max: 11, def: 0, perf: true, choices: NOTE_LETTERS, choiceShort: NOTE_LETTERS });

// beta 0.3: LFO 3, a second LFO like LFO 2: the same shapes, TARGET choices and roles (it moves that control in every oscillator that has it, and its move adds to
// LFO 2's when both aim at the same control), its own phase, rate, amount, tempo sync and sample & hold sequence; amount 0 (the default) leaves every sound as it was.
// LFO 1 is unchanged. The two share one card: LFO CARD (a playing setting, not a sound) is the sub-tab that shows LFO 2 or LFO 3.
for (const f of ['shape', 'rate', 'amt', 'target']) {
  const t = paramByKey('lfo2_' + f), o = Object.assign({}, t);
  delete o.key; delete o.name; delete o.short;
  add('lfo3_' + f, t.name.replace('LFO 2', 'LFO 3'), t.short, o);
}
add('lfo3_sync', 'LFO 3 Sync', 'SYNC', syncChoice);
add('lfo3_div', 'LFO 3 Rate (sync)', 'RATE', notes(LFO_NOTES, '1/4'));
add('lfo_view', 'LFO Card Shown', 'LFO', { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 0, perf: true, choices: ['LFO 2', 'LFO 3'], choiceShort: ['2', '3'] });

// beta 0.3: FILTER, a classic resonant low-pass filter in every voice, before the amp envelope (the oscillators' sum is filtered, then shaped by the AMP ENVELOPE):
// four poles (24 dB per octave), a resonance that can sing on its own, DRIVE that saturates its input, key tracking and its own ADSR (ENV AMT sweeps the cutoff
// by up to +-8 octaves). Two characters on one switch: LADDER (the transistor ladder: dark, resonance thins the low end) and OTA (the four-pole of the polyphonic
// analog synthesizers of the late 1970s: rounder, the low end stays). Open by default (cutoff at 20 kHz, no resonance, no drive, no envelope): the filter is then
// bypassed and every sound made without it is bit-identical.
add('vf_type', 'Filter Type', 'TYPE', { curve: 'choice', fmt: 'choice', min: 0, max: 1, def: 0, choices: ['Ladder 24 dB', 'OTA 24 dB'], choiceShort: ['LADDER', 'OTA'] });
add('vf_cut', 'Filter Cutoff', 'CUTOFF', { curve: 'exp', fmt: 'hz', min: 20, max: 20000, def: 20000 });
add('vf_res', 'Filter Resonance', 'RESO', { min: 0, max: 1, def: 0 });
add('vf_drive', 'Filter Drive', 'DRIVE', { min: 0, max: 1, def: 0 });
add('vf_key', 'Filter Key Tracking', 'KEY TRK', { min: 0, max: 1, def: 0 });
add('vf_env', 'Filter Envelope Amount', 'ENV AMT', { fmt: 'bipct', min: -1, max: 1, def: 0 });
// the four envelope parameters stay consecutive (the ADSR display reads param .. param + 3)
add('vf_a', 'Filter Env Attack', 'ATTACK', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.005 });
add('vf_d', 'Filter Env Decay', 'DECAY', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.3 });
add('vf_s', 'Filter Env Sustain', 'SUSTAIN', { min: 0, max: 1, def: 0.5 });
add('vf_r', 'Filter Env Release', 'RELEASE', { curve: 'exp', fmt: 'sec', min: 0.001, max: 10, def: 0.3 });

const DELAY_BEATS = DELAY_NOTES.map(noteBeats), LFO_BEATS = LFO_NOTES.map(noteBeats);
for (const b of [DELAY_BEATS, LFO_BEATS]) for (let i = 1; i < b.length; i++)
  if ((b === DELAY_BEATS) !== (b[i] > b[i - 1])) throw new Error('note values must be listed by length');

// the parameters LFO 2 can move, in the order of the TARGET choices (all linear: the move is in plain units). With four oscillators
// the target is a ROLE of an oscillator (cutoff, slope ...): LFO 2 moves that parameter of every oscillator that has it
// (SOURCE PHASE: the subtractive oscillators only), by the same amount; LFO2_TARGETS names the parameters of A1.
// beta 0.2: the targets after SOURCE PHASE. LFO2_TARGETS[i] is the parameter whose range gives the size of the move (the first oscillator
// that has the role; ODD BARS / EVEN BARS: a drawbar; MORPH: the global WAVELET MORPH) and ROLES[i] the role: the field of an oscillator
// it moves ("odd", "even" and "morph" have no single field: the engine moves the drawbars of odd / even bands and the morph itself).
const LFO2_TARGETS = ['f_cutoff', 'f_slope', 'f_res', 'f_keytrk', 'f_env', 'f_vel', 'p_center', 'p_width', 'p_depth', 'a_phase',
  'a_sparsity', 'a_width', 'b_tilt', 'b_bar1', 'b_bar2', 'b_sus', 'wmorph', 'vf_cut', 'vf_res'];
// beta 0.3: the last two roles belong to the FILTER (one per voice, not per oscillator): no slot field (like morph); the cutoff is an exponential parameter: its move
// is in octaves (± half of log2(max / min) at full amount), the resonance's in plain units
const ROLES = ['fcut', 'fslope', 'fres', 'fkey', 'fenv', 'fvel', 'pcen', 'pwid', 'pdep', 'phase', 'sparsity', 'width', 'tilt', 'odd', 'even', 'sus', 'morph', 'vfcut', 'vfres'];
const LFO2_ROLE = ROLES.slice();   // target i moves role i

const idx = Object.fromEntries(P.map((p, i) => [p.key, i]));
if (LFO2_TARGETS.length !== P[idx.lfo2_target].choices.length || LFO2_TARGETS.length !== ROLES.length || P[idx.lfo2_target].max !== ROLES.length - 1 ||
    LFO2_TARGETS.some(k => !(k in idx) || ((P[idx[k]].curve || 'lin') !== 'lin' && k !== 'vf_cut')))
  throw new Error('LFO2_TARGETS must match the lfo2_target choices and be linear parameters (but the filter cutoff, which is exponential)');
for (const r of ROLES) {   // a role has the same range in every oscillator that has it (LFO 2 moves them by the same amount)
  const first = SLOTS.find(s => s.k[r]);
  for (const s of SLOTS) {
    if (!s.k[r]) continue;
    const a = P[idx[first.k[r]]], b = P[idx[s.k[r]]];
    if (a.min !== b.min || a.max !== b.max) throw new Error('role ' + r + ': ranges differ in ' + s.id);
  }
}
for (const s of SLOTS) for (const [i, f] of ['ed', 'es', 'er'].entries()) if (idx[s.k[f]] !== idx[s.k.ea] + i + 1)
  throw new Error('own envelope parameters of ' + s.id + ' must be consecutive');
for (const s of SLOTS) if (s.mode === 1) for (let b = 0; b < 11; b++) if (idx[s.k.bar1] + b !== idx[s.k.bar1.replace('1', String(b + 1))])
  throw new Error('drawbars of ' + s.id + ' must be consecutive');

// ---------------------------------------------------------------- layout
// Sections are cards; widget coordinates are relative to their section. A section with `view` n (0..2 = A1 A2 B1) is shown
// while that oscillator is the one shown on the panel (the osc_view parameter); -1 = always. `vis` (a parameter) + `visOn`:
// the section is shown only while that parameter is on / off (the chord card).
// widget types: knobL knobM knobS knobT seg step drawbar scope scalogram atom source
//               window adsr leds fxheads keyboard wheels logo presets manual download meter zoom credit menu toggle label
//               chordpads chordname strumplate osctabs (beta 0.3: the folder tabs of the oscillators)
//               lfotabs (beta 0.3.4: the LFO 2 | LFO 3 tabs along the top of the LFO 2/3 card, parameter lfo_view)
// widget fields: only 'web' / 'vst' (shown in one of them), vis + visOn (shown while that parameter is on / off,
// the plug-in's SYNC), style 'value' (a knob labelled with its value: note values), 'choice' (beta 0.3.4: a knob of a choice parameter, the current choice
// written under it in the accent colour: the LFO SHAPE), 'uline' (a seg drawn underlined, no frame: the wave selector of LFO 1), text (toggle, label, menu caption)
// section options: vis / visOn, tabbed (beta 0.3.4: no title, the card has a tab bar along its top: the LFO 2/3 card)
const S = [];
// beta 0.3: the panel was reorganised (the owner's choice among six proposals): all coordinates are absolute panel coordinates, in this order from the top:
// the header; the folder tabs of the oscillators and the plate behind the cards of the one shown (section 'oscframe'); OSC MIX and the SCOPE at the top right,
// outside the plate (common to every oscillator); the filter row of the oscillator; FILTER, AMP and MOD ENVELOPEs; LFO 1, LFO 2/3, VOICE; EFFECTS and PLAY;
// the keyboard.
function section(id, title, x, y, w, h, view, widgets, opts) { S.push(Object.assign({ id, title, x, y, w, h, view, widgets }, opts || {})); }
// knobL (beta 0.3.4: only SOURCE WIDTH and SPARSITY of the subtractive oscillators): a 42 px disc (the other knobs 38), a box of 64 x 62: the disc's centre 32 px from the left and 22 from the top
const kn = (key, x, y, t) => ({ type: t || 'knobM', param: key, x, y, w: t === 'knobL' ? 64 : 52, h: t === 'knobL' ? 62 : 60 });
const row = (keys, x0, y) => keys.map((k, i) => kn(k, x0 + i * 52, y));
const CHORD_H = 120;   // the chord card (shown by CHORD MODE) adds this much to the panel's height

section('header', '', 0, 0, 1100, 48, -1, [
  { type: 'logo', x: 16, y: 8, w: 224, h: 32 },   // version 1.0: OKTOWAVE / FRACTAL WAVELET SYNTHESIZER
  { type: 'zoom', x: 248, y: 14, w: 50, h: 20 },
  { type: 'presets', x: 384, y: 9, w: 296, h: 30 },   // beta 0.3: narrower (the oscillator tabs left the header: they are the folder tabs under it)
  { type: 'download', only: 'web', x: 788, y: 9, w: 68, h: 30 },   // version 1.0.9: one button to the left (the plug-in has SAVE PRESET at 862)
  { type: 'feedback', only: 'web', x: 862, y: 9, w: 68, h: 30 },   // version 1.0.9: SEND FEEDBACK, between DOWNLOAD VST and USER MANUAL (a Google Form in a new tab)
  { type: 'manual', x: 936, y: 9, w: 68, h: 30 },
  { type: 'knobS', param: 'master', x: 1028, y: 6, w: 36, h: 36 },
  { type: 'meter', x: 1072, y: 9, w: 14, h: 30 },
]);

// ---- the folder tabs of the oscillators (OSC1 A1 · SUBTRACTIVE | OSC2 A2 · SUBTRACTIVE | OSC3 B1 · ADDITIVE: 176 x 40 px every 182) and the plate behind the cards of
// the one shown, in its colour (A1 A2 yellow, B1 blue). OSC MIX and the SCOPE are common to every oscillator: they sit outside the plate, at the top right, so the plate
// is an L (the section draws it itself: x 6 to 1094, from y 88 to y 511, with the notch from x 564 down to y 360, half way between the cards)
section('oscframe', '', 6, 50, 1088, 462, -1, [
  { type: 'osctabs', param: 'osc_view', x: 0, y: 0, w: 546, h: 40 },
]);

// ---- the oscillator shown (one card of each kind per oscillator, all at the same place)
const bars = (s) => { const o = []; for (let b = 1; b <= 11; b++) o.push({ type: 'drawbar', param: s.k.bar1.replace('1', String(b)), x: 12 + (b - 1) * 30, y: 70, w: 24, h: 98 }); return o; };
SLOTS.forEach((s, v) => {
  const K = s.k;
  if (s.mode === 0) {
    section('tone_' + s.id, 'WAVELET · SUBTRACTIVE', 12, 98, 544, 260, v, [
      { type: 'seg', param: K.wave, x: 12, y: 32, w: 520, h: 28 },
      { type: 'atom', x: 12, y: 70, w: 250, h: 104 },
      { type: 'step', param: K.wavelet, x: 12, y: 180, w: 250, h: 28 },
      { type: 'step', param: 'wav2', x: 12, y: 214, w: 250, h: 28 },   // WAVELET MORPH (all oscillators)
      { type: 'source', x: 276, y: 70, w: 126, h: 64 },
      kn(K.phase, 408, 70),
      kn('wmorph', 470, 64), kn('env_wav', 470, 122),
      kn(K.width, 294, 162, 'knobL'),      // (compactPanel() places them: 42 px discs centred at (326, 184) and (410, 184))
      kn(K.sparsity, 378, 162, 'knobL'),
      kn(K.lvl, 470, 180),
    ]);
  } else {
    section('tone_' + s.id, 'WAVELET · ADDITIVE', 12, 98, 544, 260, v, [
      { type: 'seg', param: K.pattern, x: 12, y: 32, w: 520, h: 28 },
      ...bars(s),
      { type: 'atom', x: 356, y: 70, w: 176, h: 64 },
      { type: 'step', param: K.wavelet, x: 356, y: 140, w: 176, h: 28 },
      kn(K.tilt, 356, 180), kn(K.seed, 412, 180), kn(K.lvl, 470, 180),
      ...row([K.atk, K.spread, K.body, K.bright, K.sus], 12, 198),
    ]);
  }
  section('filter_' + s.id, 'SCALE FILTER', 12, 366, 336, 140, v, [
    { type: 'seg', param: K.ftype, x: 12, y: 30, w: 312, h: 24 },
    ...row([K.fcut, K.fslope, K.fres, K.fkey, K.fenv, K.fvel], 12, 64),
  ]);
  section('position_' + s.id, 'POSITION', 356, 366, 180, 140, v, [
    { type: 'window', x: 12, y: 30, w: 156, h: 24 },
    ...row([K.pcen, K.pwid, K.pdep], 12, 64),
  ]);
  // tuning, the oscillator's own envelope (on top of the AMP ENVELOPE) and its pitch envelope
  section('osc_' + s.id, 'TUNE · OWN ENVELOPE · PITCH ENVELOPE', 544, 366, 544, 140, v, [
    { type: 'label', text: 'TUNE', x: 12, y: 32, w: 80, h: 14 },
    kn(K.oct, 12, 64), kn(K.semi, 64, 64), kn(K.fine, 116, 64),
    { type: 'toggle', param: K.eon, text: 'OWN ENVELOPE', x: 184, y: 28, w: 104, h: 22 },
    { type: 'adsr', env: 'own', param: K.ea, x: 296, y: 28, w: 112, h: 22 },
    ...row([K.ea, K.ed, K.es, K.er], 184, 64),
    { type: 'label', text: 'PITCH ENVELOPE', x: 420, y: 32, w: 110, h: 14 },
    kn(K.pamt, 420, 64), kn(K.ptime, 472, 64),
  ]);
});

// ---- always shown. At the top right, outside the plate: OSC MIX (the three levels, the sub oscillator) and the SCOPE, which show the whole sound (every oscillator
// that plays and the sub oscillator, at the reference note C4), not the oscillator shown; they start under the header, level with the tabs
section('mix', 'OSC MIX', 572, 56, 124, 298, -1, [
  kn('a1_lvl', 4, 34), kn('a2_lvl', 64, 34), kn('b1_lvl', 4, 104),
  { type: 'label', text: 'SUB OSC', x: 8, y: 198, w: 100, h: 14 },
  { type: 'knobT', param: 'sub_level', x: 2, y: 220, w: 40, h: 46 },
  { type: 'knobT', param: 'sub_oct', x: 42, y: 220, w: 40, h: 46 },
  { type: 'knobT', param: 'sub_shape', x: 82, y: 220, w: 40, h: 46 },
]);
section('display', 'SCOPE · ALL OSCILLATORS', 704, 56, 384, 298, -1, [
  { type: 'scope', x: 12, y: 30, w: 360, h: 108 },
  { type: 'label', text: 'SCALOGRAM', x: 12, y: 146, w: 360, h: 14 },
  { type: 'scalogram', x: 12, y: 162, w: 360, h: 126 },
]);
// the FILTER (one per voice, before the amp envelope) with its ADSR, then the AMP and MOD ENVELOPEs
section('flt', 'FILTER', 12, 520, 504, 128, -1, [
  { type: 'seg', param: 'vf_type', x: 70, y: 5, w: 120, h: 20 },
  { type: 'adsr', env: 'own', param: 'vf_a', x: 284, y: 30, w: 208, h: 26 },
  ...row(['vf_cut', 'vf_res', 'vf_drive', 'vf_key', 'vf_env'], 12, 62),
  ...row(['vf_a', 'vf_d', 'vf_s', 'vf_r'], 284, 62),
]);
section('ampenv', 'AMP ENVELOPE', 524, 520, 284, 128, -1, [
  { type: 'adsr', env: 'amp', x: 12, y: 30, w: 260, h: 26 },
  ...row(['amp_a', 'amp_d', 'amp_s', 'amp_r', 'amp_vel'], 12, 62),
]);
section('modenv', 'MOD ENVELOPE', 816, 520, 272, 128, -1, [
  { type: 'adsr', env: 'mod', x: 12, y: 30, w: 248, h: 26 },
  ...row(['mod_a', 'mod_d', 'mod_s', 'mod_r'], 32, 62),
]);
// the effects in the order of the sound: saturation, chorus, ping-pong delay, reverb; the plug-in's SYNC buttons swap RATE / TIME
// for a note value
const synced = (key, div, sync, x, y) => [Object.assign(kn(key, x, y), { vis: sync, visOn: false }),
  Object.assign(kn(div, x, y), { vis: sync, visOn: true, only: 'vst', style: 'value' })];
const syncBtn = (key, x, y) => ({ type: 'toggle', param: key, text: 'SYNC', only: 'vst', x, y, w: 42, h: 17 });
// beta 0.3.4 (the owner's mock-ups P6 / Q1): the wave selector of LFO 1 is on the title line, to the right of the title, drawn underlined (style 'uline'); the knobs of
// the three cards of the row (LFO 1, LFO 2/3, VOICE) are on the same line (compactPanel(): K0)
section('lfo', 'LFO 1', 12, 656, 440, 128, -1, [
  { type: 'seg', param: 'lfo_shape', x: 66, y: 5, w: 250, h: 20, style: 'uline' },
  syncBtn('lfo_sync', 386, 6),
  ...synced('lfo_rate', 'lfo_div', 'lfo_sync', 12, 58),
  ...row(['lfo_pitch', 'lfo_cut', 'lfo_pos', 'lfo_wav', 'lfo_sp', 'lfo_res', 'lfo_ew'], 64, 58),
]);
// beta 0.3: the LFO 2/3 card has two sub-tabs, LFO 2 and LFO 3 (the playing setting LFO CARD, lfo_view); each LFO has its own section at the same place, shown while
// LFO CARD says so. Beta 0.3.4: the sub-tabs are real tabs along the top of the card (`lfotabs`, a lit dot: the LFO's amount is not 0, like the oscillators' tabs;
// the tab bar also holds the plug-in's SYNC), the SHAPE is a stepped knob (five positions, the name of the shape under it) after RATE and AMOUNT, and TARGET is narrower
const lfoCard = (n) => section('lfo' + n, 'LFO 2/3', 460, 656, 246, 128, -1, [
  { type: 'lfotabs', param: 'lfo_view', x: 0, y: 0, w: 246, h: 25 },
  syncBtn(`lfo${n}_sync`, 200, 4),
  ...synced(`lfo${n}_rate`, `lfo${n}_div`, `lfo${n}_sync`, 4, 58),
  kn(`lfo${n}_amt`, 54, 58),
  Object.assign(kn(`lfo${n}_shape`, 104, 58), { style: 'choice' }),
  { type: 'menu', param: `lfo${n}_target`, text: 'TARGET', x: 160, y: 78, w: 80, h: 22 },
], { vis: 'lfo_view', visOn: n === 3, tabbed: true });
lfoCard(2); lfoCard(3);
section('voice', 'VOICE', 714, 656, 374, 128, -1, [
  { type: 'seg', param: 'v_porta', x: 76, y: 5, w: 150, h: 20 },
  { type: 'leds', x: 236, y: 6, w: 128, h: 18 },
  ...['v_oct', 'v_fine', 'v_voices', 'v_glide', 'v_unison', 'v_detune', 'v_width'].map((k, i) => kn(k, 10 + i * 51, 40)),
]);
section('fx', 'EFFECTS', 12, 792, 492, 128, -1, [
  { type: 'fxheads', x: 0, y: 30, w: 492, h: 18 },
  syncBtn('fx_dsync', 332, 27),
  ...row(['fx_drive', 'ch_mix', 'ch_rate', 'ch_depth'], 12, 58),
  ...synced('fx_dtime', 'fx_ddiv', 'fx_dsync', 220, 58),
  ...row(['fx_dfb', 'fx_dmix', 'fx_rsize', 'fx_rmix'], 272, 58),
]);
// beta 0.3: PLAY, the keyboard's settings: CHORD MODE (it switches the chord card on) and BASS (shown with it), the three-position TUNING switch (Western | Arabic |
// Turkish) and, while it is not Western, the scale (MAQAM) and the TONIC of the oriental tuning
section('play', 'PLAY · CHORD MODE · TUNING', 512, 792, 576, 128, -1, [
  { type: 'toggle', param: 'chord_mode', text: 'CHORD MODE', x: 14, y: 36, w: 100, h: 34 },
  { type: 'toggle', param: 'chord_bass', text: 'BASS', x: 14, y: 78, w: 100, h: 26, vis: 'chord_mode', visOn: true },
  { type: 'seg', param: 'mt_mode', x: 146, y: 36, w: 150, h: 24 },
  { type: 'menu', param: 'mt_scale', text: 'MAQAM', x: 146, y: 88, w: 176, h: 24, vis: 'mt_mode', visOn: true },
  { type: 'label', text: 'TONIC', x: 340, y: 70, w: 100, h: 14, vis: 'mt_mode', visOn: true },
  { type: 'step', param: 'mt_tonic', x: 340, y: 86, w: 110, h: 26, vis: 'mt_mode', visOn: true },
]);
// the keyboard row: the wheels and the keyboard (C2-C7, 36 white keys)
section('keys', '', 0, 928, 1100, 112, -1, [
  { type: 'wheels', x: 12, y: 0, w: 60, h: 100 },
  { type: 'keyboard', x: 82, y: 0, w: 1006, h: 100 },
  { type: 'credit', x: 14, y: 97, w: 170, h: 15 },
]);
// Okto MultiWave Synth: the CHORD KEYBOARD card, shown below the keyboard while CHORD MODE is on (the panel grows by CHORD_H):
// the twelve chord pads (the white-key family above, the black-key family below, as on the selector octave); the chord
// shown (name and notes); KEYS OCT, VOICING, BASS, STRUM; and the strum plate: drag across it to strum the chord, as on an
// electronic chord harp.
section('chord', 'CHORD KEYBOARD', 12, 1054, 1076, 104, -1, [
  { type: 'chordpads', x: 12, y: 26, w: 364, h: 70 },
  { type: 'chordname', x: 388, y: 26, w: 170, h: 70 },
  { type: 'label', text: 'KEYS OCT', x: 570, y: 8, w: 110, h: 14 },
  { type: 'step', param: 'chord_oct', x: 570, y: 26, w: 110, h: 26 },
  { type: 'seg', param: 'chord_voicing', x: 570, y: 64, w: 110, h: 24 },
  kn('chord_strum', 746, 22),
  { type: 'strumplate', x: 812, y: 26, w: 252, h: 70 },
], { vis: 'chord_mode', visOn: true });

// ---------------------------------------------------------------- the compact panel (beta 0.3.3)
// The owner chose proposition "V1" among five (mock-ups on a 1920 x 1080 screen with the taskbar): the panel of beta 0.3 is 1050 px tall, which hides the bottom of the keyboard on
// a 1080-pixel screen. The sections above keep their widgets; this block moves and shortens them (a card's knob rows move up, the widgets keep their size): the wavelet card 10 px
// shorter, the second row of the plate, OSC MIX and the SCOPE; the three rows of cards 8 px shorter; EFFECTS and PLAY, which lost their title bar to a vertical title in a strip at
// the left of the card (vtitle), 98 px tall; the keyboard 82 px tall. The CHORD KEYBOARD card (CHORD MODE) is under the keyboard in the web app; the plug-in puts it under the list of
// the preset browser while the browser is open (vst/src/editor.cpp).
(function compactPanel() {
  const find = (id) => S.find(s => s.id === id);
  const shift = (s, from, dy) => { for (const w of s.widgets) if (w.y >= from) w.y += dy; };
  const box = (s, x, y, w, h) => { s.x = x; s.y = y; s.w = w; s.h = h; };
  const widget = (s, i, x, y, w, h) => { const o = s.widgets[i]; o.x = x; o.y = y; if (w !== undefined) { o.w = w; o.h = h; } };
  for (const s of S) {
    const base = s.id.replace(/_(a1|a2|b1)$/, '');
    if (base === 'tone') {
      s.h = 250;
      let nBig = 0;
      for (const w of s.widgets) {
        if (w.type === 'atom') w.h -= 8;
        else if (w.type === 'source') w.h = 82;   // beta 0.3.4 (mock-up R6): the SOURCE CYCLE picture takes the height the smaller knobs free (64 -> 82)
        else if (w.type === 'knobL') { w.x = (nBig++ ? 410 : 326) - w.w / 2; w.y = 184 - 22; }   // R6: SOURCE WIDTH and SPARSITY, 42 px discs, centres (326, 184) and (410, 184)
        else if (w.y >= 140 && !(/^knob/.test(w.type) && w.x >= 460)) w.y -= 8;
      }
      // version 1.0.6 (the owner's rule: nothing overlaps): the wave selector is 6 px higher, and the three knobs of the right-hand column (WAVELET MORPH, ENV>WAV, LEVEL) are 62 px apart (their
      // rings and labels touched), the first one under the selector
      for (const w of s.widgets) if (w.type === 'seg') w.y -= 6;
      if (base === 'tone' && s.id !== 'tone_b1') s.widgets.filter(w => /^knob/.test(w.type) && w.x >= 460).sort((a, b) => a.y - b.y).forEach((w, i) => { w.y = 62 + 62 * i; });
    } else if (base === 'filter' || base === 'position' || base === 'osc') {
      s.y = 356; s.h = 132; shift(s, 50, -8);
      // version 1.0.6 (nothing overlaps): the type selector / window picture is 4 px higher and the knobs 3 px lower: the rings of the knobs cleared it by -2.5 px
      if (base !== 'osc') for (const w of s.widgets) { if (w.y === 30) w.y = 26; else if (/^knob/.test(w.type)) w.y += 3; }
      else for (const w of s.widgets) if (w.y === 28) w.y = 26;   // the TUNE card: the OWN ENVELOPE toggle and its picture 2 px higher (1.5 px from the rings under them)
    }
  }
  const mix = find('mix'); mix.h = 290; shift(mix, 190, -8);
  const dsp = find('display'); dsp.h = 290;
  widget(dsp, 0, 12, 30, 360, 104); widget(dsp, 1, 12, 142, 360, 14); widget(dsp, 2, 12, 158, 360, 122);
  find('oscframe').h = 444;
  for (const [id, x, y, w, from] of [['flt', 12, 496, 504, 50], ['ampenv', 524, 496, 284, 50], ['modenv', 816, 496, 272, 50]]) {
    const s = find(id); box(s, x, y, w, 120); shift(s, from, -8);
    // version 1.0.6 (nothing overlaps): the ADSR picture goes up 6 px (it ended 6.5 px inside the rings of the knobs) and the knobs down 4 px
    for (const w of s.widgets) { if (w.type === 'adsr') w.y = 24; else if (/^knob/.test(w.type)) w.y += 4; }
  }
  // beta 0.3.4 (the owner's mock-ups P6 / Q1): the row LFO 1 | LFO 2/3 | VOICE is 98 px tall (22 less); the knobs of the three cards are on ONE line (K0 = 32 px under the top of
  // the card); the wave selector of LFO 1, the tab bar of LFO 2/3 (its tabs, its SYNC) and the header of VOICE are on the title line
  const K0 = 32;
  for (const [id, x, w] of [['lfo', 12, 440], ['lfo2', 460, 246], ['lfo3', 460, 246], ['voice', 714, 374]]) {
    const s = find(id); box(s, x, 622, w, 98);
    for (const wd of s.widgets) { if (/^knob/.test(wd.type)) wd.y = K0; else if (wd.type === 'menu') wd.y = K0 + 20; }
  }
  // EFFECTS and PLAY: the title is a vertical strip at the left (22 px): the content moves right by 12 and up into the title row (mock-up P6: the row under is at y 726,
  // and PLAY ends at x 1088, like the cards above, not at the edge of the panel)
  const fx = find('fx'); box(fx, 12, 726, 496, 98); fx.vtitle = true;
  for (const w of fx.widgets) {
    if (w.type === 'fxheads') { w.x = 12; w.y = 5; w.w = 484; } else if (w.type === 'toggle') { w.x += 12; w.y = 3; } else { w.x += 12; w.y = 32; }
  }
  const play = find('play'); box(play, 516, 726, 572, 98); play.vtitle = true; play.title = 'PLAY'; play.accentTitle = true;
  widget(play, 0, 26, 8, 100, 34); widget(play, 1, 26, 48, 100, 26); widget(play, 2, 158, 8, 150, 24); widget(play, 3, 158, 62, 176, 24);
  widget(play, 4, 360, 44, 100, 14); widget(play, 5, 360, 62, 110, 26);
  const keys = find('keys'); box(keys, 0, 830, 1100, 98);
  widget(keys, 0, 12, 0, 60, 82); widget(keys, 1, 82, 0, 1006, 82); widget(keys, 2, 14, 83, 170, 15);
  find('chord').y = DEVICE.h + 4;
})();

// ---------------------------------------------------------------- presets
// The 22 TOP Sounds of the Wavelet Synthesizer beta 0.7 (tools/presets_top.js, in that version's parameters) are converted to the
// oscillators of this version without changing the sound: the balance ab_mix becomes the levels of A1 and B1 (1 - mix, mix) and
// B1 gets the wavelet, filter and window the two engines shared; the panel shown (engine) becomes the oscillator shown.
function convertLegacy(v0) {
  const v = Object.assign({}, v0);
  const eng = v.engine || 0, mix = v.ab_mix !== undefined ? v.ab_mix : eng;
  delete v.engine; delete v.ab_mix;
  v.osc_view = eng * 2;
  v.a1_lvl = 1 - mix; v.b1_lvl = mix;
  for (const f of ['wavelet', ...Object.keys(FILTER_KEYS)]) {
    const src = SLOTS[0].k[f], dst = SLOTS[2].k[f];
    if (v[src] !== undefined) v[dst] = v[src];
  }
  return v;
}
// The new presets (tools/presets_new.js, written with tools/make_presets.js): { name, cat, v } in this version's parameters,
// numbered in their names ("012 A1A2 · Glass Bell": the oscillators they use) for the listening tests.
let OLD_RAW = [], SUPER_RAW = [], LFO3_RAW = [], FILTER_RAW = [], FAV_RAW = [];
try { OLD_RAW = require('./presets_new.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }   // the 200 presets of beta 0.1 (001-200), unchanged
// beta 0.2: 300 more (201-500, tools/supermod/build.js); MW_NO_SUPER=1 leaves them out (the builder measures the others)
if (!process.env.MW_NO_SUPER) try { SUPER_RAW = require('./presets_super.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// beta 0.3: 600 more (501-1100, tools/supermod/build.js: 50 in each category, LFO 2 / LFO 3 and the FILTER); MW_NO_LFO3=1 leaves them out (the builder measures the others)
if (!process.env.MW_NO_LFO3) try { LFO3_RAW = require('./presets_lfo3.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// beta 0.3.4: 150 more (1401-1550, tools/supermod: the FILTER used a little more, with a little resonance), after the owner's second listening
if (!process.env.MW_NO_FILTER) try { FILTER_RAW = require('./presets_filter.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// beta 0.3.4: 100 more (1551-1650, inspired by the owner's favourites: one or two oscillators, the FILTER, sustained, organic and warm)
if (!process.env.MW_NO_FAV) try { FAV_RAW = require('./presets_fav.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// beta 0.3: the second additive oscillator (B2) is gone. A preset that played it (b2_lvl > 0: 192 of the 500) is left out, with its number (the
// ratings of the others stay valid); the others only lose their b2_* values (an unused oscillator: the sound does not change) and a view of B2.
const usesB2 = r => (r.v.b2_lvl || 0) > 0;
const withoutB2 = r => {
  const v = {};
  for (const [k, x] of Object.entries(r.v)) if (!k.startsWith('b2_')) v[k] = x;
  if (v.osc_view > 2) delete v.osc_view;
  return Object.assign({}, r, { v });
};
// beta 0.3.1: the owner's listening test of 501-580 (tools/ratings_beta03.js). The presets he rated below 5 stars are left out (their numbers are not used again, so the
// ratings of the others stay valid); the others keep their stars (the preset browser shows them, and he can change them) and those above 7 are in TOP Sounds.
const RATED = require('./ratings_beta03.js');
const numOfName = r => parseInt(r.name, 10);   // the number written first in a new preset's name (3 or 4 digits)
// beta 0.3.4: the owner's second listening (his export of the presets file, tools/review_export.js -> tools/ratings_owner2.js): the presets rated one star or less (1 or 2 of 10) are
// left out (the numbers are not used again), except the favourites he named; the others keep their stars (the built-in votes) and those above 7 are in TOP Sounds; the ten presets he
// adjusted take his values (only the parameters he changed).
// beta 1.0 (the final list): tools/ratings_final.js is the owner's LAST listening (his export of 2026-10-20 17:03 with the stars of the preset browser, 1-10): only the presets he rated
// more than one star (3 or more of 10) are in the product, nothing else (the unrated ones, the 250 made after his listening, and the 1-2 star ones are out); the lists are sorted
// from the best to the least rated; the synth opens on the first sound of TOP Sounds.
const isFav = r => RATED.FAV.includes(numOfName(r));
const RATED2 = require('./ratings_final.js');
const lowRated = r => !(RATED2.numbers[numOfName(r)] >= 3);
// the presets he adjusted (SAVE PRESET) take his values: the parameters he changed, and his master volume as a delta from the shipped one
const applyAdj = (name, v0) => {
  const a = RATED2.adjusted[name]; if (!a) return v0;
  const { master_delta, ...p } = a, v = Object.assign({}, v0, p);
  if (master_delta) v.master = (v0.master !== undefined ? v0.master : -3) + master_delta;
  return v;
};
const withAdjusted = r => (RATED2.adjusted[r.name] ? Object.assign({}, r, { v: applyAdj(r.name, r.v) }) : r);
const starsOf = r => RATED2.numbers[numOfName(r)] || RATED[numOfName(r)];
// beta 0.3.4: the master volume of a preset lowered in whole dB after measuring a loud chord at velocity 1 (tools/supermod/loud.js --spec -> tools/master_adjust.js, by number)
let MASTER_ADJ = {};
try { MASTER_ADJ = require('./master_adjust.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
// the presets of the listening tests, in this order: the 600 of beta 0.3, the 300 of beta 0.2, the 200 of beta 0.1 (minus the B2 ones and the low-rated ones)
const NEW_RAW = [...LFO3_RAW, ...FILTER_RAW, ...FAV_RAW, ...SUPER_RAW, ...OLD_RAW].filter(r => !usesB2(r)).filter(r => !lowRated(r)).map(withoutB2).map(withAdjusted)
  .sort((a, b) => RATED2.numbers[numOfName(b)] - RATED2.numbers[numOfName(a)] || numOfName(a) - numOfName(b));   // the best first
const DESCRIPTIONS = {};   // the new presets' one-line descriptions (the manual's preset table shows them)
for (const r of NEW_RAW) if (r.desc) DESCRIPTIONS[r.name] = r.desc;

// Categories (preset menu groups, like the banks of a hardware synthesizer), in menu order.
// (beta 0.2: SuperModulation: the presets whose life is the LFOs moving the wavelet-domain controls. Version 1.0: Pad comes right after TOP Sounds, and Keys and Pluck are one section,
// Keyboard: the presets' own category names (the data files, the user bank) are unchanged, SECTION_OF maps them)
const CATEGORIES = ['Pad', 'SuperModulation', 'Bass', 'Lead', 'Keyboard', 'Organ', 'Strings', 'Brass & Wind', 'Bells & Mallets', 'FX', 'Drums & Perc', 'Other'];   // (version 1.0.2: Other = the SuperModulation sounds that have no stars)
const SECTION_OF = { Keys: 'Keyboard', Pluck: 'Keyboard' };
// the 22 TOP Sounds of beta 0.7 the owner rated more than one star, best first (the same stars: the order of beta 0.7)
const TOP_RAW = require('./presets_top.js').filter(r => RATED2.names[r.name] >= 3).map((r, i) => ({ r, i }))
  .sort((a, b) => RATED2.names[b.r.name] - RATED2.names[a.r.name] || a.i - b.i).map(x => x.r);
const PRESETS = [];
// version 1.0.1: the TOP Sounds are in master_adjust.js too, by name (a loud chord at velocity 1 must not reach the output stage): only their master volume goes down
const lowerMaster = (v, down) => (down ? { ...v, master: Math.max(-36, (v.master !== undefined ? v.master : -3) - down) } : v);
for (const r of TOP_RAW) PRESETS.push({ name: r.name, cat: r.cat, v: lowerMaster(applyAdj(r.name, convertLegacy(r.v)), MASTER_ADJ[r.name]), stars: RATED2.names[r.name] });
const TOP_COUNT = PRESETS.length;
// beta 0.3.3: a uniform trim of every preset numbered 501 and up while the good ones had not been chosen (2 dB); the owner has chosen them (beta 0.3.4): 0, and the loud-chord
// calibration is per preset (MASTER_ADJ, on top of the masters of the data files).
const NEW_TRIM_DB = 0;
const trimmed = r => { const down = NEW_TRIM_DB + (MASTER_ADJ[numOfName(r)] || 0); return down ? { ...r.v, master: Math.max(-36, (r.v.master !== undefined ? r.v.master : -3) - down) } : r.v; };
for (const r of NEW_RAW) PRESETS.push({ name: r.name, cat: r.cat, v: trimmed(r), ...(starsOf(r) ? { stars: starsOf(r) } : {}) });
// the presets he rated above 7 and the favourites he named (RATED.FAV, 7 stars) go to TOP Sounds (after the 22 of beta 0.7), the best first
const TOP_EXTRA = PRESETS.map((p, i) => i).filter(i => i >= TOP_COUNT && (PRESETS[i].stars > 7 || RATED.FAV.includes(parseInt(PRESETS[i].name, 10))))
  .sort((a, b) => PRESETS[b].stars - PRESETS[a].stars || a - b);
// the TOP Sounds list of the plug-in (and the sound the synth opens on): the TOP Sounds of beta 0.7 and the presets rated above 7, the best rated first (a tie: the earlier one)
const TOP_LIST = [...PRESETS.slice(0, TOP_COUNT).map((p, i) => i), ...TOP_EXTRA].sort((a, b) => (PRESETS[b].stars || 0) - (PRESETS[a].stars || 0) || a - b);
for (const p of PRESETS) if (SECTION_OF[p.cat]) p.cat = SECTION_OF[p.cat];
// version 1.0: the numbers are gone from the names and the oscillators are written as in the Wavelet Synthesizer, by type: A (one subtractive oscillator), AA (two), AB (one subtractive +
// the additive one), AAB (two + the additive one), B (the additive one alone): "1129 A1A2B1 · Dive Texture" -> "AAB · Dive Texture" (the browsers colour the A and the B). `id` keeps the old
// name, with its number: the tools that read it (the web spec carries it); the plug-in knows the new name only.
{
  const typeOf = n => { const m = /^\d+ ((?:[AB][12]?)+) · /.exec(n); if (!m) return null; const a = (m[1].match(/A/g) || []).length, b = (m[1].match(/B/g) || []).length; return 'A'.repeat(a) + (b ? 'B' : ''); };
  const renamed = new Map();
  for (const p of PRESETS) { p.id = p.name; const t = typeOf(p.name); if (t) p.name = t + ' · ' + p.name.split(' · ').slice(1).join(' · '); renamed.set(p.id, p.name); }
  for (const k of Object.keys(DESCRIPTIONS)) { const n = renamed.get(k); if (n && n !== k) { DESCRIPTIONS[n] = DESCRIPTIONS[k]; delete DESCRIPTIONS[k]; } }
}
// version 1.0.2: the owner's third listening (tools/ratings_v3.js: his export of 2026-10-20 20:51, 36 presets with stars, one adjusted): in every section (TOP Sounds too) the sounds he starred come
// first, the most starred first, then the order of before; SuperModulation keeps only the presets that have stars: the other ones are in a section of their own, Other; the preset he adjusted
// takes his values. The stars stay a feature of the browsers (no sound has a built-in vote): here they only decide the order.
const RATED3 = require('./ratings_v3.js');
const stars3 = p => RATED3.names[p.name] || 0;
for (const p of PRESETS) {
  const a = RATED3.adjusted[p.name];
  if (a) { const { master_delta, ...q } = a; p.v = Object.assign({}, p.v, q); if (master_delta) p.v.master = (p.v.master !== undefined ? p.v.master : -3) + master_delta; }
  if (p.cat === 'SuperModulation' && !stars3(p)) p.cat = 'Other';
  if (stars3(p)) p.vote = stars3(p);   // (version 1.0.3: the web app shows it, read only)
}
const PIN_FIRST = 'AA · Flint Ripple Haze';   // version 1.0.4: the owner's favourite leads everything: first of TOP Sounds (so the sound the synth opens on) and first of its section, then the order by stars
const before3 = (x, y) => (PRESETS[x].name === PIN_FIRST ? -1 : PRESETS[y].name === PIN_FIRST ? 1 : 0) || stars3(PRESETS[y]) - stars3(PRESETS[x]) || (PRESETS[y].stars || 0) - (PRESETS[x].stars || 0) || x - y;   // x before y: more stars now, then the stars of the second listening, then the array order
TOP_LIST.sort(before3);
// version 1.0.3: the best 20 % of the rated presets (all sections together: with 36 rated, the seven he gave 10 stars to) lead TOP Sounds, the most starred first
{
  const rated = PRESETS.map((p, i) => i).filter(i => stars3(PRESETS[i])).sort(before3);
  const cut = stars3(PRESETS[rated[Math.max(0, Math.round(rated.length * 0.2) - 1)]]);
  const best = rated.filter(i => stars3(PRESETS[i]) >= cut);
  TOP_LIST.splice(0, TOP_LIST.length, ...best, ...TOP_LIST.filter(i => !best.includes(i)));
}
// the factory order is each category's order too: every section lists its presets from the best to the least rated
PRESETS.map((p, i) => i).sort(before3).forEach((i, rank) => { PRESETS[i].rank = rank; });
// Version 1.0.11: the owner's edits of factory presets (the parameters named, by preset name). A · Shimmering Strings: LFO 1 RATE 6.5 Hz (it was 2.1; he wrote 65, a slip of the comma: the knob stops at 20 Hz).
const PRESET_EDITS = { 'A · Shimmering Strings': { lfo_rate: 6.5 } };
for (const [name, edit] of Object.entries(PRESET_EDITS)) { const p = PRESETS.find(x => x.name === name); if (!p) throw new Error('PRESET_EDITS: no preset ' + name); Object.assign(p.v, edit); }
for (const p of PRESETS) if (!CATEGORIES.includes(p.cat)) throw new Error(`preset ${p.name}: no category`);
if (new Set(PRESETS.map(p => p.name)).size !== PRESETS.length) throw new Error('preset names must be unique');
// version 1.0.3: KeyAttac, a folder of the USER BANK of the plug-in (filled when the presets file has none yet): the factory presets that have stars, retouched to be very percussive: the attacks at their
// minimum (amp, the own envelopes, the additive scales, the mod and filter envelopes), a short decay to a low sustain, the release kept long; being percussive they are set again for big chords
// (tools/keyattac_adjust.js, written by tools/supermod/loud.js --keyattac --apply).
let KA_ADJ = {}; try { KA_ADJ = require('./keyattac_adjust.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
const percussive = (v0) => {
  const v = Object.assign({}, v0), g = k => (v[k] !== undefined ? v[k] : P[idx[k]].def);
  v.amp_a = 0.001; v.amp_d = Math.min(g('amp_d'), 0.2); v.amp_s = Math.min(g('amp_s'), 0.08); v.amp_r = Math.max(g('amp_r'), 0.8);
  for (const o of ['a1', 'a2', 'b1']) if (g(o + '_eon') >= 0.5) { v[o + '_ea'] = 0.001; v[o + '_ed'] = Math.min(g(o + '_ed'), 0.3); v[o + '_es'] = Math.min(g(o + '_es'), 0.15); v[o + '_er'] = Math.max(g(o + '_er'), 0.4); }
  v.b_atk = 0.001; v.b_sus = Math.min(g('b_sus'), 0.2); v.b_body = Math.min(g('b_body'), 0.7); v.b_bright = Math.min(g('b_bright'), 0.35);
  v.mod_a = 0.001; v.vf_a = 0.001;
  return v;
};
const KEYATTAC = PRESETS.map((p, i) => i).filter(i => PRESETS[i].vote).sort((a, b) => PRESETS[a].rank - PRESETS[b].rank).map(i => {
  const p = PRESETS[i], v = percussive(p.v), down = KA_ADJ[p.name] || 0;
  if (down) v.master = Math.max(-36, (v.master !== undefined ? v.master : P[idx.master].def) - down);
  return { name: p.name, from: p.name, stars: p.vote, v };
});
// Version 1.0.11 (the owner's request, web app and plug-in): places of the TOP Sounds: AA · Sweep of Pixel the 2nd, A · Shimmering Strings the 3rd, AB · Kalimba Lung Machine the 5th and A · Noise Wash Pad
// the 6th (he asked for the 5th for both, the later request, Kalimba, took the place and Noise Wash Pad follows it); the others keep their order around them. Each stays in its category too (the
// browsers list the TOP Sounds in their category as well).
{
  const FIXED = { 2: 'AA · Sweep of Pixel', 3: 'A · Shimmering Strings', 5: 'AB · Kalimba Lung Machine', 6: 'A · Noise Wash Pad' };
  const fixedNames = Object.values(FIXED), idxOf = n => { const i = TOP_LIST.findIndex(k => PRESETS[k].name === n); if (i < 0) throw new Error('TOP_LIST: ' + n + ' is not in the TOP Sounds'); return TOP_LIST[i]; };
  const rest = TOP_LIST.filter(k => !fixedNames.includes(PRESETS[k].name)), out = [];
  for (let pos = 1; out.length < TOP_LIST.length; pos++) out.push(FIXED[pos] ? idxOf(FIXED[pos]) : rest.shift());
  TOP_LIST.splice(0, TOP_LIST.length, ...out);
}
const DEFAULT_PRESET = PRESETS[TOP_LIST[0]].name;   // sound loaded when the app / a new plugin instance opens: the first of TOP Sounds (beta 1.0)
// The preset tour of the demo (the default piece, Beethoven's Appassionata; version 1.0.10: one preset per phrase of 8 beats, 3.6 s, from the low F that starts the theme; before, about one every 4 s from 7.8 s, so the first two entries of the old list were not heard). Version 1.0: it is the tour of the
// Wavelet Synthesizer's web app (beta 0.7.1): the same piece, the same presets in the same order, at the same level. Those presets are not all in the factory list (the 237 the owner kept), so
// the tour carries its own copies, DEMO_PRESETS (tools/demo_presets.js, written by tools/demo_presets_extract.js from that web app and converted as the TOP Sounds are): they play the demo
// and are in no list of the browsers.
const DEMO_RAW = require('./demo_presets.js');
const DEMO_PRESETS = DEMO_RAW.presets.map(r => ({ name: r.name, v: convertLegacy(r.v) }));
// Version 1.0.10: the tour is the owner's own list, from his vote on the demo (the demo vote test version, 2026-10-21): he rated the 30 presets of the previous tour one phrase at a time, kept the
// ones he liked, replaced the poor ones by presets of the factory list he picked among five proposed (and the 10-star favourite stays first), and this is the order he sent. One preset per
// phrase of 8 beats (web/js/demo.js), scene k plays TOUR[k]. The names are found in DEMO_PRESETS (the copies the old tour carried) or in the factory list, in that order (app.js demoPreset).
const TOUR = [
  "A · Wavelet Lead",
  "AA · Tide Lute",
  "AB · Kalimba Lung Machine",
  "AA · Hollow Bass",
  "AA · Drum Bloom",
  "A · Wave Pulse Lead",
  "A · Wave Atom Choir Shift",
  "AA · Knock Sweep",
  "A · Spiccato Strings",
  "AAB · Sweep Call",
  "AA · Wood Rise Bows",
  "AB · Pure Fog",
  "AA · Moon & Breath",
  "AB · Ripple Reeds",
  "B · Flute Lead",
  "AB · Silk Strings",
  "AB · Swing of Odd",
  "AB · Sweep of Trumpet",
  "AA · Orbit Drum",
  "AAB · Rust Aurora",
  "A · Cello Section",
  "AB · Step Sub",
  "AAB · Ice Rise Clav",
  "AA · Opal Rise Chords",
  "AB · Bloom of Timber",
  "AB · Orbit Cloud",
  "AB · Open Mallets",
  "AA · Analog Cloud",
  "AA · Salt Beam Strings",
  "AB · Beam Lung Keys"
];
let DEMO_TRIM = {}; try { DEMO_TRIM = require('./demo_trim.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }   // version 1.0.4: the whole dB each preset of the tour goes down while the piece plays (tools/demo_level.js --write-trim)
for (const n of TOUR) if (!DEMO_PRESETS.some(p => p.name === n) && !PRESETS.some(p => p.name === n)) throw new Error('TOUR: preset not found: ' + n);
// version 1.0.10: only the copies the tour still uses are kept (the others were the old tour's presets: the demo vote replaced them; tools/demo_presets.js keeps them all)
for (let i = DEMO_PRESETS.length - 1; i >= 0; i--) if (!TOUR.includes(DEMO_PRESETS[i].name)) DEMO_PRESETS.splice(i, 1);
// version 1.0.6: what the demo window says while the piece plays (the owner's request: a short, readable presentation of the synth, the wavelets and the idea of an oscillator made of them, and how it
// differs from the other synthesizers). One sentence per preset of the tour (every ~4 s, so about 13 words at the most, simple words), [chapter, sentence]; the web app shows them in order, the last one stays
// if the tour is longer. Only facts of the engine: tools/ and CLAUDE.md section 3.1 (a cycle is split into 11 bands of wavelets; the scale filter works on bands, the position window on a part of the cycle).
const DEMO_STORY = [
  ['WELCOME', 'Welcome to OKTOWAVE, a synthesizer built on wavelets.'],
  ['WELCOME', 'Listen to the music. We will explain the idea, one step at a time.'],
  ['WHAT IS A WAVELET?', 'A normal wave goes on and on, like a long smooth ripple.'],
  ['WHAT IS A WAVELET?', 'A wavelet is a tiny wave: it starts, rings for a moment, and fades.'],
  ['WHAT IS A WAVELET?', 'It lives in one place and one moment only.'],
  ['WHAT IS A WAVELET?', 'Like a small brick of sound, it is simple on its own.'],
  ['WHAT IS A WAVELET?', 'Many bricks of different sizes can build any sound.'],
  ['WHAT IS A WAVELET?', 'Big bricks make the deep body. Small bricks make the shine.'],
  ['AN OSCILLATOR MADE OF WAVELETS', 'OKTOWAVE turns this idea into an oscillator.'],
  ['AN OSCILLATOR MADE OF WAVELETS', 'The oscillator is the part of a synth that makes the raw sound.'],
  ['AN OSCILLATOR MADE OF WAVELETS', 'Here, that raw sound is built from wavelets, brick by brick.'],
  ['AN OSCILLATOR MADE OF WAVELETS', 'You choose the wavelet: Haar, Daubechies, Symlet, Coiflet.'],
  ['AN OSCILLATOR MADE OF WAVELETS', 'A blocky wavelet sounds raw. A smooth one sounds soft.'],
  ['AN OSCILLATOR MADE OF WAVELETS', 'The SCALOGRAM shows the bricks: each row is a size.'],
  ['AN OSCILLATOR MADE OF WAVELETS', 'Turn a knob and you add or remove bricks, while you play.'],
  ['HOW IT DIFFERS', 'Most synthesizers start from one long, repeating wave.'],
  ['HOW IT DIFFERS', 'They carve it with a filter. That is subtractive synthesis.'],
  ['HOW IT DIFFERS', 'Others stack pure sine waves. That is additive synthesis.'],
  ['HOW IT DIFFERS', 'A sine wave never stops, so it has no place in time.'],
  ['HOW IT DIFFERS', 'A wavelet knows where it sits, so you can shape just one part of the sound.'],
  ['HOW IT DIFFERS', 'The SCALE FILTER keeps or removes bricks by size.'],
  ['HOW IT DIFFERS', 'SPARSITY keeps only the strongest bricks: fewer bricks, a stranger tone.'],
  ['HOW IT DIFFERS', 'WAVELET MORPH slides from one wavelet to another.'],
  ['NOW PLAY', 'A1 and A2 start from a classic wave. B1 builds the sound from bricks alone.'],
  ['NOW PLAY', 'Add the filter, three LFOs and effects, and a sound is born.'],
  ['NOW PLAY', 'CHORD MODE turns one key into a whole chord.'],
  ['NOW PLAY', 'The ARAB and TURK tunings bring quarter tones to the keyboard.'],
  ['NOW PLAY', 'Pads, plucks, organs, basses: every preset is yours to play.'],
  ['NOW PLAY', 'Press STOP, touch a knob, and make the sound your own.'],
  ['NOW PLAY', 'Thank you for listening to OKTOWAVE.'],
];
if (!PRESETS.some(p => p.name === DEFAULT_PRESET)) throw new Error('DEFAULT_PRESET not found: ' + DEFAULT_PRESET);

// Validate preset keys and ranges at generation time.
for (const pr of [...PRESETS, ...DEMO_PRESETS, ...KEYATTAC]) for (const [k, v] of Object.entries(pr.v)) {
  if (!(k in idx)) throw new Error(`preset ${pr.name}: unknown param ${k}`);
  const p = P[idx[k]];
  if (v < p.min || v > p.max) throw new Error(`preset ${pr.name}: ${k}=${v} out of range`);
  if (p.perf) throw new Error(`preset ${pr.name}: ${k} is a performance setting, not a sound`);
}
for (const s of S) {
  if (s.vis && !(s.vis in idx)) throw new Error('layout: unknown section vis param ' + s.vis);
  for (const w of s.widgets) {
    if (w.param && !(w.param in idx)) throw new Error('layout: unknown param ' + w.param);
    if (w.vis && !(w.vis in idx)) throw new Error('layout: unknown vis param ' + w.vis);
    if (w.only && w.only !== 'web' && w.only !== 'vst') throw new Error('layout: only web or vst');
  }
}

module.exports = { DEVICE, ORIENT, CHORD_H, APP, DEFAULT_PRESET, PARAMS: P, INDEX: idx, SECTIONS: S, PRESETS, TOP: TOP_COUNT, TOP_EXTRA, TOP_LIST, PRESET_EDITS, DEMO_PRESETS, DEMO_TRIM, DEMO_STORY, KEYATTAC, CATEGORIES,
  LFO2_TARGETS, LFO2_ROLE, ROLES, SLOTS, DELAY_BEATS, LFO_BEATS, CHORDS, CHORD_KEYS, MICRO_TABLES, NEW_FIRST: TOP_COUNT, NEW_COUNT: NEW_RAW.length, DESCRIPTIONS, TOUR };
