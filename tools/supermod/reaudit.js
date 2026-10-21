// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Adds the onset-difference measure (audit.js onsetDiff: how much the notes of a decaying sound differ with the LFO phase) to the
// candidates of the pool that decay and passed the first checks, in parallel, then writes the pool back.
//   node tools/supermod/reaudit.js --from-cands 22     first gathers tools/out/super_cand_0..21.json into tools/out/super_pool.json
//   node tools/supermod/reaudit.js                     the pool only
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const OUT = path.join(__dirname, '..', 'out'), POOL = path.join(OUT, 'super_pool.json');
const N = 22;
if (process.argv[2] === '--part') {
  const part = +process.argv[3];
  const A = require('./audit.js'), SPEC = require('../preset_lab.js').SPEC;
  const rows = JSON.parse(fs.readFileSync(POOL, 'utf8')), out = {};
  const amps = SPEC.PARAMS.find(p => p.key === 'amp_s').def;
  rows.forEach((c, i) => {
    if (i % N !== part) return;
    const s = c.v.amp_s !== undefined ? c.v.amp_s : amps;
    if (s >= 0.15 || c.audit.stopped || c.audit.onsetDiff !== undefined) return;
    if (A.judgeSound(c.audit, c.meta.kind)) return;   // refused for its sound already: not worth the time
    out[i] = A.onsetDiff(A.fullValues(c.v));
  });
  fs.writeFileSync(POOL + '.' + part, JSON.stringify(out));
  process.exit(0);
}
if (process.argv.includes('--from-cands')) {
  const n = +process.argv[process.argv.indexOf('--from-cands') + 1] || 22;
  let rows = [];
  const have = new Set();
  if (fs.existsSync(POOL)) { rows = JSON.parse(fs.readFileSync(POOL, 'utf8')); rows.forEach(r => have.add(r.title.toLowerCase())); }
  for (let k = 0; k < n; k++) {
    const f = path.join(OUT, `super_cand_${k}.json`);
    if (!fs.existsSync(f)) continue;
    for (const r of JSON.parse(fs.readFileSync(f, 'utf8')).rows) if (!have.has(r.title.toLowerCase())) { rows.push(r); have.add(r.title.toLowerCase()); }
  }
  fs.writeFileSync(POOL, JSON.stringify(rows));
  console.log(rows.length + ' candidates in the pool');
}
let done = 0;
for (let k = 0; k < N; k++) fork(__filename, ['--part', String(k)]).on('exit', () => {
  if (++done < N) return;
  const rows = JSON.parse(fs.readFileSync(POOL, 'utf8')); let n = 0;
  for (let j = 0; j < N; j++) {
    const o = JSON.parse(fs.readFileSync(POOL + '.' + j, 'utf8')); fs.unlinkSync(POOL + '.' + j);
    for (const [i, v] of Object.entries(o)) { rows[+i].audit.onsetDiff = v; rows[+i].audit.decaying = true; n++; }
  }
  fs.writeFileSync(POOL, JSON.stringify(rows));
  console.log(`onset difference measured for ${n} decaying candidates; pool ${rows.length}`);
});
