// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The cases of the C++ <-> JS cross-check: every factory preset, then variants of the engine's features (LFO 2 on each
// target, SOURCE PHASE, WAVELET MORPH, the three oscillators with their own envelopes and pitch envelopes, tempo sync, the
// chord keyboard). tools/dsp_compare.js writes them to a file (--list), vst/devtest/dsp_render.cpp renders them with the C++
// engine, tools/dsp_compare.js compares the JS render with the C++ one. kind 'note': one note, then a chord; 'chord': the
// chord keyboard played through keyOn / keyOff and the strum plate (CHORD_SCRIPT).
'use strict';
module.exports = function cases(SPEC, C) {
  const P = C.P, out = [];
  const add = (name, values, opt = {}) => out.push({ name, kind: opt.kind || 'note', tempo: opt.tempo || 0, values: Array.from(values) });
  SPEC.PRESETS.forEach(pr => add(pr.name, pr.values));
  const preset0 = () => SPEC.PRESETS[0].values.slice();
  const variant = (name, set, opt, from) => {
    const v = (from === undefined ? preset0() : SPEC.PRESETS[from % SPEC.PRESETS.length].values.slice());
    for (const [k, x] of Object.entries(set)) { if (!(k in P)) throw new Error('unknown parameter ' + k); v[P[k]] = x; }
    add(name, v, opt);
  };
  // LFO 2 on each of its targets (every oscillator that has the parameter)
  SPEC.LFO2_TARGETS.forEach((target, t) => {
    const pi = (t * 17) % SPEC.PRESETS.length, v = SPEC.PRESETS[pi].values.slice();
    v[P.lfo2_target] = t; v[P.lfo2_amt] = t % 2 ? -0.8 : 0.8; v[P.lfo2_rate] = 3; v[P.lfo2_shape] = t % 5;
    add(`LFO 2 -> ${SPEC.PARAMS[target].key}`, v);
  });
  const PHT = SPEC.LFO2_ROLE.indexOf(SPEC.ROLES.indexOf('phase'));
  // SOURCE PHASE static, and moved by LFO 2 with WAVELET MORPH and with two oscillators (every phase set)
  variant('phase 37/2048, Haar saw', { wavelet: 0, a_wave: 0, a_phase: 37 / 2048, f_cutoff: 5 });
  variant('phase 0.3, noise', { wavelet: 1, a_wave: 5, a_phase: 0.3, a_sparsity: 0.4 });
  variant('LFO 2 -> phase + morph', { wavelet: 0, wav2: 2, wmorph: 0.4, a_phase: 0.1, lfo2_target: PHT, lfo2_amt: 0.7, lfo2_rate: 2.5, lfo2_shape: 0 });
  variant('LFO 2 -> phase on A1 + A2 + morph', { a1_lvl: 0.6, a2_lvl: 0.6, a2_wave: 1, a2_phase: 0.35, a2_wavelet: 2, wav2: 1, wmorph: 0.5,
    a_phase: 0.62, lfo2_target: PHT, lfo2_amt: -0.6, lfo2_rate: 4, lfo2_shape: 1 });
  // the three oscillators (beta 0.3: B2 is gone; its variants now use B1)
  variant('A1 + A2: octave, own envelope, pitch envelope', { a1_lvl: 0.6, a2_lvl: 0.8, a2_oct: 1, a2_wave: 1, a2_eon: 1, a2_ea: 0.002, a2_ed: 0.12, a2_es: 0.1,
    a2_er: 0.3, a2_pamt: 12, a2_ptime: 0.06, a2_fcut: 7, a2_fres: 6 });
  variant('A2 click: noise burst, mono legato', { a1_lvl: 0.7, a2_lvl: 1, a2_wave: 5, a2_eon: 1, a2_ed: 0.04, a2_es: 0, a2_ftype: 1, a2_fcut: 6, v_voices: 1, v_glide: 0.05,
    amp_s: 0.9 });
  variant('A2 + B1: fifth, detuned partials, own envelope', { a1_lvl: 0, a2_lvl: 0.5, b1_lvl: 0.7, b1_semi: 7, b1_fine: -8, b_pattern: 3, b_bar2: 0.4, b_bar3: 0.7,
    b_atk: 0.01, b_body: 1.2, b_bright: 0.3, b1_eon: 1, b1_ed: 0.8, b1_es: 0.3, b_tilt: -3, b1_fcut: 8 });
  variant('A1 + B1: filters, window, key tracking', { a1_lvl: 0.5, b1_lvl: 0.7, b1_fcut: 5, b1_fres: 8, b1_fenv: 3, b1_pdep: 0.6, b1_pwid: 0.3, b1_fkey: 0.3, f_cutoff: 6,
    f_keytrk: 0.2, mod_d: 0.4 });
  variant('three oscillators, unison 3, morph, sub', { a1_lvl: 0.5, a2_lvl: 0.4, b1_lvl: 0.5, a2_oct: -1, b1_oct: 1, v_unison: 3, v_detune: 15, wav2: 1, wmorph: 0.5,
    lfo_wav: 0.3, a2_wavelet: 4, b1_wavelet: 5, sub_level: 0.4, ch_mix: 0.5 });
  variant('LFO 2 -> cutoff on three oscillators', { a1_lvl: 0.5, a2_lvl: 0.5, b1_lvl: 0.5, a2_fcut: 6, b1_fcut: 7, f_cutoff: 8,
    lfo2_target: 0, lfo2_amt: 0.7, lfo2_rate: 2, lfo2_shape: 1 });
  variant('pitch envelope down on B1, own envelope off', { a1_lvl: 0, b1_lvl: 1, b1_pamt: -24, b1_ptime: 0.2, b_pattern: 0, b_tilt: -9 });
  variant('LFO 1 and mod wheel on three oscillators', { a1_lvl: 0.4, a2_lvl: 0.4, b1_lvl: 0.4, lfo_pitch: 30, lfo_cut: 2, lfo_pos: 0.3, a2_pdep: 0.8, v_unison: 2 });
  // TEMPO SYNC of the delay and both LFOs at a tempo
  variant('sync delay 1/8 D @120', { fx_dsync: 1, fx_ddiv: 7, fx_dmix: 0.4, fx_dfb: 0.5 }, { tempo: 120 });
  variant('sync LFO 1 1/16 @97', { lfo_sync: 1, lfo_div: 13, lfo_cut: 3, lfo_pitch: 30 }, { tempo: 97 });
  variant('sync LFO 2 1/8 T + delay 1/1 @133', { lfo2_sync: 1, lfo2_div: 12, lfo2_amt: 0.7, lfo2_target: 0, fx_dsync: 1, fx_ddiv: 13, fx_dmix: 0.3 }, { tempo: 133 });
  // the chord keyboard (folded voicing with the bass; stacked with a strum and 4 voices; mono with a long strum); with two oscillators
  variant('chord folded + bass', { chord_mode: 1, chord_voicing: 1, chord_bass: 1 }, { kind: 'chord' });
  variant('chord stacked, strum, 4 voices', { chord_mode: 1, chord_voicing: 0, chord_strum: 0.02, v_voices: 4, chord_type: 2 }, { kind: 'chord' });
  variant('chord mono, strum 50 ms', { chord_mode: 1, v_voices: 1, chord_strum: 0.05 }, { kind: 'chord' });
  variant('chord with A1 + A2 own envelope', { chord_mode: 1, a2_lvl: 0.6, a2_oct: 1, a2_eon: 1, a2_ed: 0.1, a2_es: 0 }, { kind: 'chord' });
  // beta 0.2: SUPERMODULATION. LFO 1 on SPARSITY / RESO / ENV>WAV, LFO 2 on the targets that need the variants' tables (SPARSITY, SOURCE
  // WIDTH) and on the additive ones (TILT, ODD / EVEN BARS, SCALE SUSTAIN) and the MORPH
  const A_BASE = SPEC.PRESETS.findIndex(p => p.name === 'A · Warm Pad');
  const va = (name, set, opt) => variant(name, Object.assign({ a1_lvl: 1 }, set), opt, A_BASE);
  const T = (role) => SPEC.LFO2_ROLE.indexOf(SPEC.ROLES.indexOf(role));
  va('LFO 1 -> sparsity, Haar saw', { wavelet: 0, a_wave: 0, a_sparsity: 0.3, lfo_sp: 0.5, lfo_rate: 2.2, f_cutoff: 9 });
  va('LFO 1 -> sparsity on A1 + A2 + morph', { a1_lvl: 0.6, a2_lvl: 0.5, a2_wave: 2, a2_width: 0.3, a2_wavelet: 2, a_sparsity: 0.1, a2_sparsity: 0.5, lfo_sp: 0.6, lfo_rate: 3,
    lfo_shape: 1, wav2: 3, wmorph: 0.3, lfo_wav: 0.2 });
  va('LFO 1 + LFO 2 -> sparsity (two sources)', { wavelet: 1, a_sparsity: 0.4, lfo_sp: 0.3, lfo_rate: 2, lfo2_target: T('sparsity'), lfo2_amt: 0.5, lfo2_rate: 0.7 });
  va('LFO 2 -> sparsity, sample & hold', { wavelet: 2, a_sparsity: 0.6, lfo2_target: T('sparsity'), lfo2_amt: -0.9, lfo2_rate: 5, lfo2_shape: 4 });
  va('LFO 2 -> source width, pulse', { wavelet: 1, a_wave: 2, a_width: 0.4, lfo2_target: T('width'), lfo2_amt: 0.8, lfo2_rate: 1.5 });
  va('LFO 2 -> source width on A1 triangle + A2 pulse', { a1_lvl: 0.5, a2_lvl: 0.5, a_wave: 3, a_width: 0.3, a2_wave: 2, a2_width: 0.7, a2_wavelet: 3, lfo2_target: T('width'),
    lfo2_amt: -0.7, lfo2_rate: 2.5, lfo2_shape: 1 });
  va('LFO 1 -> reso', { f_cutoff: 6, f_res: 8, lfo_res: 10, lfo_rate: 3 });
  va('LFO 1 -> reso on A1 + B1 (kept in range)', { a1_lvl: 0.5, b1_lvl: 0.6, f_cutoff: 7, f_res: 1, lfo_res: 20, lfo_rate: 4, lfo_shape: 3, b1_fcut: 6, b1_fres: 22 });
  va('LFO 1 -> ENV>WAV with morph', { wav2: 4, wavelet: 0, wmorph: 0.2, env_wav: 0.4, lfo_ew: 0.5, lfo_rate: 2.5, mod_a: 0.3, mod_d: 0.6, mod_s: 0.5 });
  va('LFO 2 -> morph', { wav2: 5, wavelet: 1, wmorph: 0.3, lfo2_target: T('morph'), lfo2_amt: 0.9, lfo2_rate: 2 });
  for (const role of ['tilt', 'odd', 'even', 'sus']) {
    variant('LFO 2 -> ' + role + ' on B1 (+ A2)', { a1_lvl: 0, a2_lvl: 0.3, b1_lvl: 0.6, b_pattern: 2, b_tilt: -4, b_bar3: 0.5, b_bar4: 0.5, b_bar1: 0.5, b_bar2: 0.5, b_bar5: 0.4,
      b_body: 2, b_bright: 0.6, b_sus: 0.5, lfo2_target: T(role), lfo2_amt: 0.8, lfo2_rate: 2.2 });
  }
  // beta 0.3 (Okto MultiWave Synth): LFO 3, a second LFO like LFO 2 (its move adds to LFO 2's when both aim at the same control)
  va('LFO 3 -> cutoff', { f_cutoff: 7, lfo3_target: T('fcut'), lfo3_amt: 0.7, lfo3_rate: 2.4 });
  va('LFO 2 + LFO 3 -> cutoff (the moves add up)', { f_cutoff: 7, lfo2_target: T('fcut'), lfo2_amt: 0.4, lfo2_rate: 1.3, lfo3_target: T('fcut'), lfo3_amt: -0.5, lfo3_rate: 2.9, lfo3_shape: 1 });
  va('LFO 3 -> sparsity on A1 + A2, LFO 2 -> phase', { a1_lvl: 0.6, a2_lvl: 0.5, a2_wave: 2, a2_width: 0.4, a2_wavelet: 3, a_sparsity: 0.2, lfo3_target: T('sparsity'), lfo3_amt: 0.7, lfo3_rate: 1.7,
    lfo2_target: PHT, lfo2_amt: 0.5, lfo2_rate: 0.9 });
  va('LFO 2 -> source width + LFO 3 -> source width (pulse)', { wavelet: 1, a_wave: 2, a_width: 0.4, lfo2_target: T('width'), lfo2_amt: 0.5, lfo2_rate: 1.1, lfo3_target: T('width'), lfo3_amt: 0.4, lfo3_rate: 3.1, lfo3_shape: 2 });
  va('LFO 3 -> morph, sample & hold', { wav2: 4, wavelet: 1, wmorph: 0.3, lfo3_target: T('morph'), lfo3_amt: 0.9, lfo3_rate: 3, lfo3_shape: 4 });
  variant('LFO 3 -> ' + 'tilt and LFO 2 -> odd bars on B1', { a1_lvl: 0, b1_lvl: 0.7, b_pattern: 2, b_tilt: -4, b_bar3: 0.5, b_bar4: 0.5, b_body: 2, b_bright: 0.6, b_sus: 0.5,
    lfo3_target: T('tilt'), lfo3_amt: 0.8, lfo3_rate: 2.2, lfo2_target: T('odd'), lfo2_amt: 0.6, lfo2_rate: 1.4 });
  variant('sync LFO 3 1/8 T @133', { lfo3_sync: 1, lfo3_div: 12, lfo3_amt: 0.7, lfo3_target: 0, f_cutoff: 8 }, { tempo: 133 });
  // beta 0.3: the FILTER (a four-pole ladder per voice, before the amp envelope) and the two LFOs aimed at it
  va('filter LADDER: cutoff, resonance, envelope, key tracking', { vf_type: 0, vf_cut: 700, vf_res: 0.55, vf_drive: 0, vf_key: 0.6, vf_env: 0.5, vf_a: 0.01, vf_d: 0.3, vf_s: 0.4, vf_r: 0.4 });
  va('filter OTA: drive, high resonance, closing envelope', { vf_type: 1, vf_cut: 3500, vf_res: 0.9, vf_drive: 0.6, vf_key: 0, vf_env: -0.6, vf_a: 0.005, vf_d: 0.5, vf_s: 0.2, vf_r: 0.2 });
  va('filter on A1 + A2 + B1 with unison 3 and the sub oscillator', { a1_lvl: 0.5, a2_lvl: 0.4, a2_oct: -1, b1_lvl: 0.4, v_unison: 3, v_detune: 18, sub_level: 0.4, vf_cut: 900, vf_res: 0.4, vf_env: 0.7, vf_a: 0.02, vf_d: 0.4, vf_s: 0.5 });
  va('LFO 2 -> filter cutoff, LFO 3 -> filter resonance', { vf_cut: 1200, vf_res: 0.3, lfo2_target: T('vfcut'), lfo2_amt: 0.7, lfo2_rate: 2.2, lfo3_target: T('vfres'), lfo3_amt: 0.8, lfo3_rate: 1.3, lfo3_shape: 1 });
  va('open filter with LFO 2 on its cutoff (square)', { vf_cut: 20000, lfo2_target: T('vfcut'), lfo2_amt: 1, lfo2_rate: 1.5, lfo2_shape: 3 });
  va('filter, chord with bass', { chord_mode: 1, chord_bass: 1, vf_type: 0, vf_cut: 600, vf_res: 0.5, vf_env: 0.6, vf_key: 0.5 }, { kind: 'chord' });
  // the chord keyboard with BASS two octaves down and louder, and changing while the root is held
  variant('chord live changes (BASS, VOICING switched live)', { chord_mode: 1, chord_bass: 1, chord_voicing: 1, amp_r: 1.5, v_voices: 8 }, { kind: 'chordlive' });
  variant('chord live changes, 4 voices, strum', { chord_mode: 1, chord_bass: 1, chord_voicing: 0, v_voices: 4, chord_strum: 0.03, amp_r: 0.4 }, { kind: 'chordlive' });
  // ORIENTAL KEYBOARD: both tunings, a tonic, a glide (the offset follows the gliding pitch), the sub oscillator and the chord keyboard
  va('oriental Arabic Rast on C, notes', { mt_mode: 1, mt_scale: 0, mt_tonic: 0 });
  va('oriental Turkish Hicaz on D, glide', { mt_mode: 2, mt_scale: 2, mt_tonic: 2, v_glide: 0.15, v_porta: 1, sub_level: 0.3 });
  va('oriental Arabic Bayati on D with chord keyboard', { mt_mode: 1, mt_scale: 1, mt_tonic: 2, chord_mode: 1, chord_bass: 1 }, { kind: 'chord' });
  // beta 0.3.2: loud dense chords played with MIDI notes (LOUD_SCRIPT: a triad, then five and eight notes at velocity 1, then the notes released in two steps): the chord compensation
  // (core.js polyComp) and the peak guard act. The presets are the loudest ones of the crackle measure (tools/crackle.js) and a few of every age; two variants change the voices and the unison.
  // (version 1.0: the 237 presets of the final list, so the indices wrap round: a spread of the list)
  [3, 40, 120, 200, 360, 500, 641, 700, 900, 1105, 1170, 1181].forEach(i => { const pr = SPEC.PRESETS[i % SPEC.PRESETS.length]; add('loud chord: ' + pr.name, pr.values, { kind: 'loud' }); });
  variant('loud chord, 16 voices, unison 4, wide', { v_voices: 16, v_unison: 4, v_detune: 0.3, v_width: 1, fx_rmix: 0.3, ch_mix: 0.5 }, { kind: 'loud' }, 20);
  variant('loud chord, 3 voices (no compensation)', { v_voices: 3 }, { kind: 'loud' }, 90);
  variant('loud chord, master +6 dB: the peak guard rides the gain', { master: 6 }, { kind: 'loud' }, 5);
  variant('loud chord, master +6 dB, slow attack: the guard and the soft limiter', { master: 6, amp_a: 0.2 }, { kind: 'loud' }, 600);
  // version 1.0.15: the output stage. The variants above play the look-ahead limiter (OUTPUT Limiter, the default); these play OUTPUT Classic (the guard + soft limiter of 1.0.14,
  // delayed like the limiter), CHORD COMP off, and the case the review found: a loud square two octaves under C1 whose flat tops, through the DC blocker, keep falling above the
  // ceiling for longer than the limiter's window (its queue overflowed: the plug-in wrote past its end)
  variant('loud chord, master +6 dB, OUTPUT Classic', { master: 6, out_mode: 0 }, { kind: 'loud' }, 5);
  variant('loud chord, master +6 dB, slow attack, OUTPUT Classic', { master: 6, amp_a: 0.2, out_mode: 0 }, { kind: 'loud' }, 600);
  variant('loud chord, 16 voices, CHORD COMP off', { v_voices: 16, poly_comp: 0, master: 3 }, { kind: 'loud' }, 20);
  variant('limiter: loud low square + sub square 2 octaves down (queue overflow)', { a1_lvl: 1, a_wave: 1, sub_level: 1, sub_shape: 2, sub_oct: 1, v_oct: -3, amp_s: 1, vel_amt: 0, master: 6 });
  variant('limiter: the same, OUTPUT Classic', { a1_lvl: 1, a_wave: 1, sub_level: 1, sub_shape: 2, sub_oct: 1, v_oct: -3, amp_s: 1, vel_amt: 0, master: 6, out_mode: 0 });
  // version 1.0.16: the Classic reverb's new settings (stereo input, pre-delay, damping, low cut, width), alone and together, on wide sounds and chords
  variant('reverb: stereo input 1, pre-delay 40 ms, width 0.5, wide unison', { fx_rmix: 0.4, fx_rsize: 0.8, fx_rstereo: 1, fx_rpre: 0.04, fx_rwidth: 0.5, v_unison: 3, v_width: 1, v_detune: 0.2 });
  variant('reverb: low cut 150 Hz, damping 0.5, big room', { fx_rmix: 0.5, fx_rsize: 0.95, fx_rhp: 150, fx_rdamp: 0.5, sub_level: 0.5 }, { kind: 'chord' });
  variant('reverb: every new setting, loud chords', { fx_rmix: 0.35, fx_rsize: 0.7, fx_rstereo: 0.6, fx_rpre: 0.025, fx_rdamp: 0.4, fx_rhp: 100, fx_rwidth: 0.8 }, { kind: 'loud' }, 20);
  variant('reverb: longest pre-delay, no damping, width 0', { fx_rmix: 0.6, fx_rsize: 0.6, fx_rpre: 0.1, fx_rdamp: 0, fx_rwidth: 0 }, undefined, 40);
  variant('reverb: the settings of 1.0.15 (the mono sum, no pre-delay, no low cut)', { fx_rmix: 0.45, fx_rsize: 0.8, fx_rstereo: 0, fx_rpre: 0, fx_rdamp: 0.25, fx_rhp: 20 }, { kind: 'chord' });
  // version 1.0.16: PUNCH (the boost of every note's start; every case above plays its default, 50 %): off, its maximum, on chords, loud chords, with the FILTER, the chord keyboard
  // and a legato line (no boost on a legato change)
  variant('punch: off (the sound of before), notes', { fx_punch: 0 });
  variant('punch: 100 %, notes', { fx_punch: 1 });
  variant('punch: 75 %, chord', { fx_punch: 0.75 }, { kind: 'chord' }, 30);
  variant('punch: 100 %, loud chords', { fx_punch: 1 }, { kind: 'loud' }, 20);
  variant('punch: 25 %, ladder filter, sub', { fx_punch: 0.25, vf_cut: 900, vf_res: 0.5, vf_env: 0.4, sub_level: 0.5 });
  variant('punch: 100 % with the chord keyboard', { fx_punch: 1, chord_mode: 1, chord_bass: 1 }, { kind: 'chord' });
  variant('punch: 100 %, legato line (one voice, glide)', { fx_punch: 1, v_voices: 1, v_porta: 2, v_glide: 0.1 });
  // version 1.0.17: the 20 new source waves (6 .. 25). Each one on A1 with a spread of wavelets, sparsities, phases and scale filters (dsp.h must
  // compute the very same source bits: SPARSITY picks atoms by size), then on A2 with sparsity, phase, morph, the LFOs' variants and a chord
  const WAVES = SPEC.PARAMS[P.a_wave].choices;
  for (let w = 6; w <= 25; w++) {
    va(`wave ${w} ${WAVES[w]} on A1`, { a_wave: w, wavelet: w % 7, a_sparsity: (w % 4) * 0.2, a_phase: (w % 3) * 0.17, f_cutoff: 6 + (w % 7), f_res: (w % 5) * 3 });
  }
  va('A2 FM 2:1, sparsity 0.7 (DB20) + A1 Organ', { a1_lvl: 0.5, a_wave: 24, a2_lvl: 0.6, a2_wave: 20, a2_wavelet: 6, a2_sparsity: 0.7, a2_oct: 1 });
  va('A2 Formant, phase 0.41, sparsity 0.3, morph', { a1_lvl: 0.4, a2_lvl: 0.7, a2_wave: 22, a2_phase: 0.41, a2_wavelet: 1, a2_sparsity: 0.3, wav2: 4, wmorph: 0.5 });
  va('A2 Reso Saw + A1 Sync Saw 2.5, LFO 2 -> phase', { a1_lvl: 0.5, a_wave: 14, a2_lvl: 0.6, a2_wave: 23, a2_wavelet: 2, lfo2_target: PHT, lfo2_amt: 0.6, lfo2_rate: 1.8 });
  va('A2 Stepped Sine + A1 Abs Sine, LFO 1 -> sparsity', { a1_lvl: 0.4, a_wave: 7, a2_lvl: 0.6, a2_wave: 13, a2_wavelet: 3, a2_sparsity: 0.4, lfo_sp: 0.5, lfo_rate: 2.5 });
  va('LFO 2 -> source width on Trapezoid (a new wave has no width sets)', { a_wave: 10, wavelet: 2, lfo2_target: T('width'), lfo2_amt: 0.8, lfo2_rate: 1.5 });
  va('chord: A1 Saw Stack + A2 FM 3:1 (sparsity 0.5, phase 0.25)', { a1_lvl: 0.5, a_wave: 25, a2_lvl: 0.5, a2_wave: 21, a2_wavelet: 4, a2_sparsity: 0.5, a2_phase: 0.25, chord_mode: 1, chord_bass: 1 }, { kind: 'chord' });
  return out;
};
