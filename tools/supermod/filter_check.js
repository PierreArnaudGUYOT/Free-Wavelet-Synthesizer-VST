// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Checks the data files of the filter batches (tools/presets_filter.js 1401-1550, tools/presets_fav.js 1551-1650): the format ({ name: "NNNN CFG · Title", cat, desc, v }), the numbers in order, unique names
// across the whole list (the generated web/js/spec.js and every data file, the left-out presets included), a description, known parameters inside their ranges, no B2, the filter really used with a little
// resonance, the unison, the number of oscillators; then every preset is played (a chord and a single note) and must be finite, not silent and under 0 dBFS at its master volume.
//   node tools/supermod/filter_check.js [--file tools/presets_filter.js --first 1401 --count 150] [--procs 8]     (both files when no --file)
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const TOOLS = path.join(__dirname, '..');
const FILES = arg('file', '') ? [{ file: path.resolve(arg('file')), first: +arg('first', 1401), count: +arg('count', 150) }]
  : [{ file: path.join(TOOLS, 'presets_filter.js'), first: 1401, count: 150, filter: true }, { file: path.join(TOOLS, 'presets_fav.js'), first: 1551, count: 100, fav: true }];
const PROCS = +arg('procs', 8);
const CATEGORIES = ['SuperModulation', 'Bass', 'Lead', 'Keys', 'Organ', 'Pad', 'Strings', 'Brass & Wind', 'Pluck', 'Bells & Mallets', 'FX', 'Drums & Perc'];

if (process.argv.includes('--worker')) {
  const part = +arg('worker', 0), of = +arg('of', 1), A = require('./audit.js'), lab = require('../preset_lab.js');
  const out = [];
  let i = 0;
  for (const f of FILES) {
    if (!fs.existsSync(f.file)) continue;
    for (const p of require(f.file)) {
      if (i++ % of !== part) continue;
      const values = A.fullValues(p.v), bad = [];
      for (const [label, r] of [['chord', A.chord(values, { root: 60, seconds: 3, hold: 2 })], ['chord high', A.chord(values, { root: 76, type: 1, seconds: 2.5, hold: 1.8 })], ['note', lab.render(values, { note: 48, vel: 1, hold: 1.2, tail: 0.5 })]]) {
        let pk = 0, e = 0, fin = true;
        for (let k = 0; k < r.n; k++) { const a = r.L[k], b = r.R[k]; if (!Number.isFinite(a) || !Number.isFinite(b)) { fin = false; break; } pk = Math.max(pk, Math.abs(a), Math.abs(b)); e += a * a; }
        if (!fin) bad.push(label + ': NaN / infinite'); else if (pk < 0.02) bad.push(`${label}: silent (peak ${pk.toFixed(3)})`); else if (pk > 1) bad.push(`${label}: peak ${pk.toFixed(3)} over 0 dBFS`);
      }
      out.push({ name: p.name, bad });
    }
  }
  fs.writeFileSync(path.join(TOOLS, 'out', `check_${part}.json`), JSON.stringify(out));
  process.exit(0);
}

const SPEC = require('../../web/js/spec.js');
const P = Object.fromEntries(SPEC.PARAMS.map(p => [p.key, p]));
let problems = 0;
const fail = (m) => { problems++; console.log('  PROBLEM: ' + m); };
const titleOf = (n) => (n.split(' · ')[1] || n).toLowerCase();
const taken = new Map();   // title -> where
for (const p of SPEC.PRESETS) taken.set(titleOf(p.name), 'spec ' + p.name);
for (const f of ['presets_new.js', 'presets_super.js', 'presets_lfo3.js']) for (const r of require(path.join(TOOLS, f))) if (!taken.has(titleOf(r.name))) taken.set(titleOf(r.name), f + ' ' + r.name);
for (const F of FILES) {
  if (!fs.existsSync(F.file)) { console.log(`${path.basename(F.file)}: not there`); continue; }
  const rows = require(F.file), fn = path.basename(F.file);
  console.log(`${fn}: ${rows.length} presets`);
  if (rows.length !== F.count) fail(`${fn}: ${rows.length} presets, ${F.count} expected`);
  const cnt = {}; rows.forEach((r, i) => {
    const m = /^(\d{4}) ([AB]\d)+ · (.+)$/.exec(r.name);
    if (!m) return fail(`${r.name}: the name is not "NNNN CFG · Title"`);
    if (+m[1] !== F.first + i) fail(`${r.name}: number ${m[1]}, ${F.first + i} expected`);
    const cfg = r.name.split(' ')[1], t = titleOf(r.name);
    if (taken.has(t)) fail(`${r.name}: the title is already used by ${taken.get(t)}`); taken.set(t, fn + ' ' + r.name);
    if (!CATEGORIES.includes(r.cat)) fail(`${r.name}: category ${r.cat}`); cnt[r.cat] = (cnt[r.cat] || 0) + 1;
    if (!r.desc || r.desc.length < 40 || /\n/.test(r.desc)) fail(`${r.name}: no one-line description`);
    if (/omnichord/i.test(r.name + r.desc) || /moog|korg|oberheim|roland|prophet|jupiter/i.test(r.desc)) fail(`${r.name}: a brand name`);
    for (const [k, x] of Object.entries(r.v)) {
      if (!P[k]) { fail(`${r.name}: unknown parameter ${k}`); continue; }
      if (x < P[k].min - 1e-9 || x > P[k].max + 1e-9) fail(`${r.name}: ${k} = ${x} out of range`);
      if (/^b2_/.test(k)) fail(`${r.name}: B2 parameter ${k}`);
    }
    const g = (k) => (r.v[k] !== undefined ? r.v[k] : P[k].def);
    if (!(g('vf_cut') < 20000 - 1)) fail(`${r.name}: the filter is open`);
    if (!(g('vf_res') >= 0.1 && g('vf_res') <= 0.6)) fail(`${r.name}: resonance ${g('vf_res')}`);
    if (g('v_unison') > 3) fail(`${r.name}: unison ${g('v_unison')}`);
    const lv = ['a1_lvl', 'a2_lvl', 'b1_lvl'].filter(k => g(k) > 0).length;
    if (F.fav && (lv < 1 || lv > 2)) fail(`${r.name}: ${lv} oscillators sounding`);
    if (lv !== (cfg.match(/[AB]\d/g) || []).length) fail(`${r.name}: the oscillators sounding (${lv}) are not the ones in the name (${cfg})`);
    if (F.fav && g('amp_s') < (['Pluck', 'Bells & Mallets', 'Drums & Perc'].includes(r.cat) ? 0.25 : 0.45)) fail(`${r.name}: sustain ${g('amp_s')}`);
    if (r.v.vf_type !== undefined && ![0, 1].includes(r.v.vf_type)) fail(`${r.name}: filter type`);
  });
  console.log('  categories: ' + Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(', '));
}
// the playing test
fs.mkdirSync(path.join(TOOLS, 'out'), { recursive: true });
let done = 0;
for (let k = 0; k < PROCS; k++) fork(__filename, process.argv.slice(2).concat(['--worker', String(k), '--of', String(PROCS)])).on('exit', () => {
  if (++done < PROCS) return;
  let n = 0;
  for (let j = 0; j < PROCS; j++) { const f = path.join(TOOLS, 'out', `check_${j}.json`); for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) { n++; for (const b of r.bad) fail(`${r.name}: ${b}`); } fs.unlinkSync(f); }
  console.log(`${n} presets played (a chord, a high chord, a low note at velocity 1): ${problems ? problems + ' problem(s)' : 'finite, not silent, under 0 dBFS'}`);
  process.exit(problems ? 1 : 0);
});
