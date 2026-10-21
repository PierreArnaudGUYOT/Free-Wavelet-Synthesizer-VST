// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Measures the existing presets with tools/supermod/audit.js (the same numbers the composer uses for its candidates), in parallel:
//   node tools/supermod/calib.js <out.json>          all the factory presets, in 12 processes
// The output gives the distribution of every measure over the existing presets, so that the thresholds of the new ones are set by
// what is already accepted (and the presets that crackle are known by their numbers).
'use strict';
const fs = require('fs');
const { fork } = require('child_process');
const path = require('path');

if (process.argv[2] === '--part') {
  const part = +process.argv[3], of = +process.argv[4], out = process.argv[5];
  const A = require('./audit.js'), SPEC = require('../preset_lab.js').SPEC;
  const rows = [];
  SPEC.PRESETS.forEach((p, i) => {
    if (i % of !== part) return;
    const a = A.audit(p.values);
    rows.push({ i, name: p.name, peak: a.peak, limDist: a.limDist, hf: a.hf, hfBurst: a.hfBurst, dropout: a.dropout, motion: a.motion, motionStatic: a.motionStatic, modShift: a.modShift, features: a.features });
  });
  fs.writeFileSync(out + '.' + part, JSON.stringify(rows));
  process.exit(0);
}
const out = process.argv[2] || path.join(__dirname, '..', 'out', 'calib.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
const N = 12; let done = 0;
for (let k = 0; k < N; k++) fork(__filename, ['--part', String(k), String(N), out]).on('exit', () => {
  if (++done < N) return;
  let rows = [];
  for (let j = 0; j < N; j++) { rows = rows.concat(JSON.parse(fs.readFileSync(out + '.' + j, 'utf8'))); fs.unlinkSync(out + '.' + j); }
  rows.sort((a, b) => a.i - b.i);
  fs.writeFileSync(out, JSON.stringify(rows));
  console.log(rows.length + ' presets measured -> ' + out);
});
