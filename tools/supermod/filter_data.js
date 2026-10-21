// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The data of the filter batch (numbers 1401-1550, tools/presets_filter.js): the owner's second listening (the presets file he exported from the plug-in on 2026-10-20,
// "OKTOMULTIWAVE presets.txt", 579 presets rated 1-10 stars) as a table of presets with their values and the measures of tools/supermod/audit.js, so that
// tools/supermod/filter_taste.js can fit what he likes. Besides the 579, the 48 presets of 501-620 that he rated below 5 in the first listening (tools/ratings_beta03.js) and that
// tools/spec.js left out of the list since are added (their values: tools/out/presets_lfo3_v1.js, the master 2 dB lower as every preset numbered 501 and up now is):
// without them the range 501-620 would only hold the ones he kept.
//   node tools/supermod/filter_data.js [--file <exported presets file>] [--procs 8]      writes tools/out/filter_rated.json
//   node tools/supermod/filter_data.js --no-audit                                       the table without the measures (quick)
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const OUT = path.join(__dirname, '..', 'out');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = arg('file', path.join(process.env.USERPROFILE || process.env.HOME || '.', 'GIT', 'wavelet synthesizer TEST', 'Preset', 'OKTOMULTIWAVE presets.txt'));   // (pass --file with the exported presets file)
const PROCS = +arg('procs', 8);
const TMP = (k) => path.join(OUT, `filter_rated_${k}.json`);

// ---- the table: { num, name, cat, stars, src, v: full values } (src: 'export' | 'dropped')
function table() {
  const { parseExport, fullValues } = require('../review_export.js');
  const SPEC = require('../../web/js/spec.js');
  const e = parseExport(FILE);
  const byName = new Map(SPEC.PRESETS.map(p => [p.name, p]));
  // the category of a preset the list no longer holds (he rated it 1 or 2: tools/spec.js left it out): from the data files, by number
  const catByNum = new Map();
  for (const file of ['../presets_new.js', '../presets_super.js', '../presets_lfo3.js']) for (const r of require(file)) catByNum.set(parseInt(r.name, 10), r.cat);
  const rows = [];
  for (const p of e.factory) {
    if (p.stars === undefined || p.stars <= 0) continue;
    const s = byName.get(p.orig);
    rows.push({ num: parseInt(p.orig, 10) || 0, name: p.orig, cat: s ? s.cat : (catByNum.get(parseInt(p.orig, 10)) || '?'), stars: p.stars, src: 'export', v: fullValues(p.params) });
  }
  const R = require('../ratings_beta03.js'), v1 = require(path.join(OUT, 'presets_lfo3_v1.js'));
  const inExport = new Set(rows.map(r => r.num).filter(n => n > 0));
  const mp = SPEC.PARAMS.findIndex(q => q.key === 'master');
  for (const r of v1) {
    const num = parseInt(r.name, 10);
    if (typeof R[num] !== 'number' || R[num] >= 5 || inExport.has(num)) continue;
    const v = fullValues(r.v); v[mp] = Math.max(-36, v[mp] - 2);
    rows.push({ num, name: r.name, cat: r.cat, stars: R[num], src: 'dropped', v });
  }
  return rows;
}

if (process.argv.includes('--worker')) {
  const k = +arg('worker', 0), of = +arg('of', 1);
  const A = require('./audit.js');
  const rows = table(), out = [];
  rows.forEach((r, i) => {
    if (i % of !== k) return;
    const a = A.audit(r.v, {});
    out.push({ i, peak: a.peak, limDist: a.limDist, hf: a.hf, hfBurst: a.hfBurst, dropout: a.dropout, flat: a.flat, motion: a.motion, motionStatic: a.motionStatic, moveDelta: a.moveDelta,
      modShift: a.modShift, decaying: a.decaying, features: a.features });
  });
  fs.writeFileSync(TMP(k), JSON.stringify(out));
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
const rows = table();
console.log(`${rows.length} rated presets (${rows.filter(r => r.src === 'export').length} from the export, ${rows.filter(r => r.src === 'dropped').length} dropped ones)`);
if (process.argv.includes('--no-audit')) { fs.writeFileSync(path.join(OUT, 'filter_rated.json'), JSON.stringify(rows)); process.exit(0); }
let done = 0;
const t0 = Date.now();
for (let k = 0; k < PROCS; k++) fork(__filename, process.argv.slice(2).concat(['--worker', String(k), '--of', String(PROCS)])).on('exit', () => {
  if (++done < PROCS) return;
  for (let j = 0; j < PROCS; j++) { for (const m of JSON.parse(fs.readFileSync(TMP(j), 'utf8'))) rows[m.i].audit = m; fs.unlinkSync(TMP(j)); }
  fs.writeFileSync(path.join(OUT, 'filter_rated.json'), JSON.stringify(rows));
  console.log(`measured in ${((Date.now() - t0) / 1000).toFixed(0)} s -> tools/out/filter_rated.json`);
});
