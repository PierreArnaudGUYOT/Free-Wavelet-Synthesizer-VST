// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The cases of the CPU measure (vst/devtest/cpu_bench.cpp): writes a file of presets, one per line "index v0 v1 ... | name" (the values with 17
// digits: the exact doubles; the index is the preset's place in SPEC.PRESETS), and the table of their features (cases.json) that tools/cpu_report.js
// aggregates.
//   node tools/cpu_cases.js <dir> all         every preset (237)
//   node tools/cpu_cases.js <dir> check       the set of the equality check: every TOP Sound, four fixed presets and a stratified sample of
//                                             every category (about 90 presets; `all` is the complete proof); written as <dir>/cases_check.txt
//   node tools/cpu_cases.js <dir> sample [k]  every k-th preset (default 8) and the TOP Sounds: a quick CPU measure; written as <dir>/cases_sample.txt
'use strict';
const fs = require('fs'), path = require('path');
const SPEC = require('../web/js/spec.js');
const C = require('../web/js/core.js')(SPEC);
const P = C.P;
const dir = process.argv[2], what = process.argv[3] || 'all';
if (!dir) { console.error('usage: node tools/cpu_cases.js <dir> all|check|sample [k]'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const n = SPEC.PRESETS.length;
let ids;
if (what === 'check') {
  const set = new Set();
  for (let i = 0; i < SPEC.TOP; i++) set.add(i);
  [3, 40, 120, 200].forEach(i => { if (i < n) set.add(i); });
  // every category: about one preset in 3 (the stratified sample: the same share of every category, spread over its list; version 1.0.7: the list has 237 presets)
  const by = {};
  SPEC.PRESETS.forEach((p, i) => { (by[p.cat] = by[p.cat] || []).push(i); });
  for (const cat of Object.keys(by)) { const l = by[cat]; for (let j = 0; j < l.length; j += 3) set.add(l[j]); }
  ids = [...set].sort((a, b) => a - b);
} else if (what === 'sample') {
  const k = +process.argv[4] || 8, set = new Set();
  for (let i = 0; i < SPEC.TOP; i++) set.add(i);
  for (let i = 3; i < n; i += k) set.add(i);
  ids = [...set].sort((a, b) => a - b);
} else ids = Array.from({ length: n }, (_, i) => i);
const num = (v) => (Number.isInteger(v) ? String(v) : v.toPrecision(17));
const lines = ids.map(i => `${i} ${SPEC.PRESETS[i].values.map(num).join(' ')} | ${SPEC.PRESETS[i].name}`);
const file = what === 'all' ? 'cases.txt' : `cases_${what}.txt`;
fs.writeFileSync(path.join(dir, file), lines.join('\n') + '\n');
// the features of each preset (what the report groups by); the filter is "in the path" as Engine.prepBlock decides it (LFO moves of the filter included)
const feat = {};
for (const i of ids) {
  const pr = SPEC.PRESETS[i], v = pr.values, g = (k) => v[P[k]];
  const role = (t) => (SPEC.LFO2_ROLE[Math.round(g(t))]), roleName = (t) => SPEC.ROLES[role(t)];
  const r2 = g('lfo2_amt') !== 0 ? roleName('lfo2_target') : '', r3 = g('lfo3_amt') !== 0 ? roleName('lfo3_target') : '';
  const fltMove = ['vfcut', 'vfres'].includes(r2) || ['vfcut', 'vfres'].includes(r3);
  const fltOn = !(g('vf_cut') >= 20000 && g('vf_res') === 0 && g('vf_drive') === 0 && g('vf_env') === 0 && !fltMove);
  const oscs = ['a1', 'a2', 'b1'].filter(s => g(s + '_lvl') > 0).map(s => s.toUpperCase()).join(' ');
  const morph = g('wmorph') > 0 || g('lfo_wav') > 0 || g('env_wav') !== 0 || g('lfo_ew') > 0 || r2 === 'morph' || r3 === 'morph';
  feat[i] = {
    name: pr.name, cat: pr.cat, flt: fltOn, fltType: Math.round(g('vf_type')), drive: g('vf_drive') > 0,
    unison: Math.max(1, Math.min(4, Math.round(g('v_unison')))), voices: Math.round(g('v_voices')),
    chorus: g('ch_mix') > 0, delay: g('fx_dmix') > 0 || g('fx_dfb') > 0, reverb: g('fx_rmix') > 0, fxdrive: g('fx_drive') > 0, sub: g('sub_level') > 0,
    oscs, nosc: oscs ? oscs.split(' ').length : 0, lfo1: g('lfo_pitch') !== 0 || g('lfo_cut') !== 0 || g('lfo_pos') !== 0 || g('lfo_wav') > 0 || g('lfo_sp') > 0 || g('lfo_res') > 0 || g('lfo_ew') > 0,
    lfo2: g('lfo2_amt') !== 0, lfo3: g('lfo3_amt') !== 0, morph, ownEnv: ['a1', 'a2', 'b1'].some(s => g(s + '_lvl') > 0 && g(s + '_eon') >= 0.5),
    pitchEnv: ['a1', 'a2', 'b1'].some(s => g(s + '_lvl') > 0 && g(s + '_pamt') !== 0),
    additive: g('b1_lvl') > 0,
  };
}
fs.writeFileSync(path.join(dir, `features_${what}.json`), JSON.stringify(feat));
console.log(`${ids.length} presets written to ${path.join(dir, file)}`);
