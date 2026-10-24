// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// supermod.js - checks of what Okto MultiWave Synth beta 0.2 added, on the JS engine (the C++ port is compared with it by
// tools/dsp_compare.js): the SUPERMODULATION destinations (LFO 1 -> SPARSITY / RESO / ENV>WAV, LFO 2 -> the wavelet controls),
// the chord keyboard (BASS two octaves down and louder, the chord changing while the root is held) and the oriental tunings.
//   node tests/supermod.js
'use strict';
const path = require('path');
const SPEC = require(path.join(__dirname, '..', 'web', 'js', 'spec.js'));
const C = require(path.join(__dirname, '..', 'web', 'js', 'core.js'))(SPEC);
const P = C.P, sr = 48000;
let fails = 0;
const check = (ok, what, detail = '') => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${what}${detail ? '  -- ' + detail : ''}`); if (!ok) fails++; };

const A_PRESET = SPEC.PRESETS.findIndex(p => p.name === 'A · Warm Pad');
function make(set, preset = A_PRESET) {
  const v = SPEC.PRESETS[preset].values.slice();
  // version 1.0.18: A · Warm Pad has the author's OTA filter at 1395 Hz now (it softened the morph's changes these checks measure): they start from it with the FILTER open
  if (preset === A_PRESET) for (const p of SPEC.PARAMS) if (/^vf_/.test(p.key)) v[P[p.key]] = p.def;
  for (const [k, x] of Object.entries(set)) { if (!(k in P)) throw new Error('unknown parameter ' + k); v[P[k]] = x; }
  const eng = new C.Engine(sr); v.forEach((x, i) => eng.setParam(i, x));
  const tb = C.buildTables(Float64Array.from(v), true); eng.setTables(tb);
  return { eng, tb, v };
}
function render(eng, seconds, events = []) {
  const n = Math.round(seconds * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128;
  for (let o = 0; o < n; o += blk) {
    for (const [t, f] of events) if (Math.round(t * sr / blk) * blk === o) f(eng);
    eng.process(L.subarray(o, Math.min(n, o + blk)), R.subarray(o, Math.min(n, o + blk)), Math.min(blk, n - o));
  }
  return { L, R, n };
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
// the frequency of a clean tone: the first rising zero crossings (a sine source through a low-pass)
function freq(x, a, b) {
  let first = -1, last = -1, cnt = 0;
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) { const t = i - 1 + (-x[i - 1]) / (x[i] - x[i - 1]); if (first < 0) first = t; last = t; cnt++; }
  return cnt > 1 ? (cnt - 1) * sr / (last - first) : 0;
}
const sineSet = { a_wave: 4, wavelet: 6, a_sparsity: 0, f_cutoff: 12, amp_a: 0.001, amp_s: 1, amp_d: 1, ch_mix: 0, fx_rmix: 0, fx_dmix: 0, v_voices: 8, v_unison: 1, v_porta: 0, sub_level: 0 };

// ---- 1. the variants' tables: built only when an LFO moves SPARSITY / SOURCE WIDTH / SOURCE PHASE
console.log('1. SUPERMODULATION: the variants\' tables');
{
  const off = make({ wavelet: 0 }), sp1 = make({ wavelet: 0, lfo_sp: 0.4 }), sp2 = make({ wavelet: 0, lfo2_target: 10, lfo2_amt: 0.5 });
  check(!off.tb.slots[0].ph, 'no LFO on a table-changing destination: no extra sets');
  check(sp1.tb.slots[0].vk === C.VK_SPARSITY && sp1.tb.slots[0].ph.length === C.SPARSE_K, `LFO 1 -> SPARSITY builds ${C.SPARSE_K} sparsity sets`);
  check(sp2.tb.slots[0].vk === C.VK_SPARSITY, 'LFO 2 -> SPARSITY too');
  const w = make({ wavelet: 1, a_wave: 2, lfo2_target: 11, lfo2_amt: 0.5 }), wsaw = make({ wavelet: 1, a_wave: 0, lfo2_target: 11, lfo2_amt: 0.5 });
  check(w.tb.slots[0].vk === C.VK_WIDTH && w.tb.slots[0].ph.length === C.WIDTH_K, 'LFO 2 -> SOURCE WIDTH builds the width sets for a pulse');
  check(!wsaw.tb.slots[0].ph, 'a saw has no width: nothing built');
  const ph = make({ wavelet: 0, lfo2_target: 9, lfo2_amt: 0.5 });
  check(ph.tb.slots[0].vk === C.VK_PHASE && ph.tb.slots[0].ph.length === C.PHASE_K - 1, `LFO 2 -> SOURCE PHASE: ${C.PHASE_K - 1} more sets as before`);
  const both = make({ wavelet: 0, lfo_sp: 0.4, lfo2_target: 9, lfo2_amt: 0.5 });
  check(both.tb.slots[0].vk === C.VK_SPARSITY, 'SPARSITY comes before PHASE when both are asked for');
  check(C.variantSig(off.v) === 0 && C.variantSig(sp1.v) !== 0 && C.variantSig(sp1.v) !== C.variantSig(ph.v), 'the table signature tells the kinds apart (the apps rebuild when it changes)');
  // the sets reach the ends of their range: the first is sparsity 0 (all atoms), the last sparsity 1 (one atom)
  const s0 = C.buildTables(Float64Array.from(sp1.v), false);
  check(s0.nonzero > 100, 'display set built as before', `${s0.kept} / ${s0.nonzero} atoms`);
}

// ---- 2. the destinations move the sound
console.log('2. the destinations move the sound');
{
  const diff = (a, b) => { let m = 0; for (let i = 0; i < a.n; i++) m = Math.max(m, Math.abs(a.L[i] - b.L[i])); return m; };
  const notes = [[0.0, e => { e.noteOn(48, 0.9); e.noteOn(55, 0.9); e.noteOn(64, 0.9); }]];
  const base = { wavelet: 3, a_wave: 0, f_cutoff: 6, f_res: 6, amp_s: 1, ch_mix: 0 };
  const r0 = render(make(base).eng, 1.5, notes);
  const cases = [['LFO 1 -> SPARSITY', { lfo_sp: 0.6, lfo_rate: 3 }], ['LFO 1 -> RESO', { lfo_res: 18, lfo_rate: 3 }],
    ['LFO 1 -> ENV>WAV (with a morph)', { wav2: 4, wmorph: 0.2, env_wav: 0.3, lfo_ew: 0.6, lfo_rate: 3 }],
    ['LFO 2 -> SPARSITY', { lfo2_target: 10, lfo2_amt: 0.8, lfo2_rate: 3 }], ['LFO 2 -> SOURCE WIDTH (pulse)', { a_wave: 2, lfo2_target: 11, lfo2_amt: 0.8, lfo2_rate: 3 }],
    ['LFO 2 -> MORPH', { wav2: 4, wmorph: 0.4, lfo2_target: 16, lfo2_amt: 0.8, lfo2_rate: 3 }]];
  for (const [name, set] of cases) {
    const ref = set.a_wave === 2 || set.wav2 !== undefined ? render(make(Object.assign({}, base, set, { lfo_sp: 0, lfo_res: 0, lfo_ew: 0, lfo2_amt: 0 })).eng, 1.5, notes) : r0;
    const r = render(make(Object.assign({}, base, set)).eng, 1.5, notes);
    const d = diff(r, ref), peak = r.L.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    check(d > 0.01 && isFinite(peak) && peak <= 1, name + ' changes the sound', `max difference ${d.toFixed(3)}, peak ${peak.toFixed(2)}`);
  }
  // additive controls on B1 (beta 0.3: B2 is gone)
  const add = { a1_lvl: 0, a2_lvl: 0.3, b1_lvl: 0.6, b_pattern: 0, b_tilt: -3, b_bar1: 1, b_bar2: 0.5, b_bar3: 0.5, b_bar4: 0.5, b_bar5: 0.5, b_bar6: 0.5, b_body: 3, b_bright: 3, b_sus: 0.5, amp_s: 1 };
  const ra = render(make(add).eng, 1.5, notes);
  for (const [name, t] of [['TILT', 12], ['ODD BARS', 13], ['EVEN BARS', 14], ['SCALE SUSTAIN', 15]]) {
    const r = render(make(Object.assign({}, add, { lfo2_target: t, lfo2_amt: 0.9, lfo2_rate: 3 })).eng, 1.5, notes);
    check(diff(r, ra) > 0.005, `LFO 2 -> ${name} (additive oscillators) changes the sound`, `max difference ${diff(r, ra).toFixed(3)}`);
  }
  // the old sound is untouched when every new amount is 0 (also: the first 22 presets are bit-identical with beta 0.7: tests/regress_v07.js)
  const a = render(make(base).eng, 1, notes), b = render(make(Object.assign({}, base, { lfo_sp: 0, lfo_res: 0, lfo_ew: 0, mt_mode: 0 })).eng, 1, notes);
  check(diff(a, b) === 0, 'all new amounts at 0: bit-identical');
}

// ---- 3. the chord keyboard: BASS two octaves down and louder; the chord changes while the root is held
console.log('3. chord keyboard');
{
  const { eng } = make({ chord_mode: 1, chord_bass: 1, chord_voicing: 1, chord_type: 0, v_voices: 8, amp_r: 2 });
  eng.keyOn(48, 1);   // selector key C (major)
  eng.keyOn(67, 1);   // the root G4
  const sounding = () => eng.voices.filter(v => v.active && v.gate).map(v => v.note).sort((a, b) => a - b);
  const s1 = sounding();
  check(s1[0] === 43 && s1.includes(67) && s1.includes(71) && s1.includes(62), 'G major: bass G2 (two octaves below G4), then G B D folded in the octave of the root', JSON.stringify(s1));
  const bass = eng.voices.find(v => v.active && v.note === 43), other = eng.voices.find(v => v.active && v.note === 67);
  const trim = Math.sqrt(3 / (3 + 1.96));
  check(bass && other && Math.abs(bass.gain - 1.4 * trim) < 1e-12 && Math.abs(other.gain - trim) < 1e-12, 'the bass plays 1.4 times louder (+2.9 dB) than the others; a chord with its bass keeps the level of a triad (all notes x ' + trim.toFixed(3) + ')');
  // the left hand changes the chord: Gm7 (selector D#), then G7 (selector D)
  eng.keyOn(51, 1);
  const s2 = sounding();
  check(JSON.stringify(s2) === JSON.stringify([43, 65, 67, 70, 62].sort((a, b) => a - b)) || (s2.length === 5 && s2.includes(70) && !s2.includes(71)), 'Gm7 at once: B goes, B flat comes, F (7th) comes', JSON.stringify(s2));
  const dropped = eng.voices.filter(v => v.active && !v.gate && v.note === 71);
  check(dropped.length === 1 && dropped[0].quick === true, 'the dropped note (B) fades out quickly (not a long release)');
  const keep = eng.voices.find(v => v.active && v.gate && v.note === 67);
  check(keep && keep.age < eng.voices.find(v => v.active && v.gate && v.note === 70).age, 'the notes that stay are not played again');
  // after 0.2 s only the new chord is heard (the 2 s release of the preset would otherwise keep B)
  const r = render(eng, 0.3);
  check(!eng.voices.some(v => v.active && !v.gate && v.note === 71), 'the dropped note is gone after 0.3 s although the release is 2 s');
  // selector key pressed before the root: the type is remembered (the left hand's memory) and applies to the next root
  eng.keyOff(67);
  eng.keyOn(50, 1); eng.keyOff(50);   // D: dominant 7, key released
  eng.keyOn(60, 1);
  check(eng.p[P.chord_type] === 2 && sounding().includes(70) && sounding().length === 5, 'the left hand\'s last chord is remembered after its key is released', JSON.stringify(sounding()));
  eng.allNotesOff();
  // BASS never below C1: a low root keeps the bass in range
  const e2 = make({ chord_mode: 1, chord_bass: 1, chord_oct: 0, v_voices: 8 }).eng;
  e2.keyOn(40, 1);   // the root E2 with the selector octave at C1-B1 (24..35)
  const low = e2.voices.filter(v => v.active && v.gate).map(v => v.note);
  check(Math.min(...low) >= 24, 'a low root: the bass is kept at C1 or above', JSON.stringify(low));
  // BASS off: a triad plays at the plain level
  const e4 = make({ chord_mode: 1, chord_bass: 0, v_voices: 8 }).eng; e4.keyOn(67, 1);
  check(e4.voices.filter(v => v.active).every(v => v.gain === 1), 'a triad without BASS: every note at the plain level (1)');
  // BASS off
  const e3 = make({ chord_mode: 1, chord_bass: 0, v_voices: 8 }).eng; e3.keyOn(67, 1);
  check(e3.voices.filter(v => v.active).every(v => v.note >= 55), 'BASS off: no bass note');
  // BASS switched while the root is held
  e3.setParam(P.chord_bass, 1);
  check(e3.voices.some(v => v.active && v.gate && v.note === 43), 'BASS switched on while the root is held: the bass comes in at once');
}

// ---- 4. oriental tunings
console.log('4. oriental tunings');
{
  const f = (set, note) => {
    const { eng } = make(Object.assign({}, sineSet, set));
    const r = render(eng, 0.6, [[0, e => e.noteOn(note, 1)]]);
    return freq(r.L, Math.round(0.25 * sr), Math.round(0.6 * sr));
  };
  const hz = (semi) => 440 * Math.pow(2, (semi - 69) / 12);
  const cents = (a, b) => 1200 * Math.log2(a / b);
  const w = f({ mt_mode: 0 }, 64);
  check(Math.abs(cents(w, hz(64))) < 2, 'Western: E4 = 329.6 Hz', `${w.toFixed(2)} Hz`);
  const rast = f({ mt_mode: 1, mt_scale: 0, mt_tonic: 0 }, 64);
  check(Math.abs(cents(rast, hz(64)) + 50) < 2, 'Arabic Rast on C: E is a quarter tone (50 cents) flat', `${cents(rast, hz(64)).toFixed(1)} cents`);
  const rastB = f({ mt_mode: 1, mt_scale: 0, mt_tonic: 0 }, 71);
  check(Math.abs(cents(rastB, hz(71)) + 50) < 2, 'Rast on C: B is a quarter tone flat too', `${cents(rastB, hz(71)).toFixed(1)} cents`);
  const rastD = f({ mt_mode: 1, mt_scale: 0, mt_tonic: 0 }, 62);
  check(Math.abs(cents(rastD, hz(62))) < 2, 'Rast on C: D (a degree at 200 cents) is not moved', `${cents(rastD, hz(62)).toFixed(1)} cents`);
  const bay = f({ mt_mode: 1, mt_scale: 1, mt_tonic: 2 }, 64);
  check(Math.abs(cents(bay, hz(64)) + 50) < 2, 'Bayati on D: E (the second degree) is a quarter tone flat', `${cents(bay, hz(64)).toFixed(1)} cents`);
  const hic = f({ mt_mode: 2, mt_scale: 2, mt_tonic: 0 }, 64), c53 = 1200 / 53;
  check(Math.abs(cents(hic, hz(64)) - (17 * c53 - 400)) < 2, 'Turkish Hicaz on C: the third at 17 commas (-15 cents)', `${cents(hic, hz(64)).toFixed(1)} cents`);
  const oct = f({ mt_mode: 1, mt_scale: 0, mt_tonic: 0 }, 76);
  check(Math.abs(cents(oct, hz(76)) + 50) < 3, 'an octave higher (E5) is moved the same way', `${cents(oct, hz(76)).toFixed(1)} cents`);
  // the demo plays in equal temperament
  const { eng } = make(Object.assign({}, sineSet, { mt_mode: 1, mt_scale: 0 })); eng.noMicro = true;
  const r = render(eng, 0.6, [[0, e => e.noteOn(64, 1)]]);
  check(Math.abs(cents(freq(r.L, 12000, 28800), hz(64))) < 2, 'noMicro (the demo): equal temperament whatever the tuning');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
