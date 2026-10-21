// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Beta 0.3.1: remakes the new presets that the owner has not rated, to look more like the ones he liked, and adds new SuperModulation presets.
//   - the presets of tools/out/presets_lfo3_v1.js (the 600 of beta 0.3) that he rated (tools/ratings_beta03.js) stay exactly as they are (the low-rated ones are left
//     out by tools/spec.js; they keep their number here);
//   - each preset he has not rated is replaced, under the same number and in the same category, by a candidate of the pool (tools/out/lfo3_pool.json: the candidates
//     the composer made and measured, the old ones and the new ones made with the "lush" composer) chosen by the taste model (tools/supermod/taste.js: what the
//     stars of the rated ones say) and, among the best predicted, by distinctness (farthest point first), as in build.js;
//   - EXTRA new SuperModulation presets are added (numbers 1101 ...), chosen the same way.
//   node tools/supermod/rebuild.js [--extra 150] [--share 0.45]       writes tools/presets_lfo3.js and prints the report
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./taste.js');
const A = require('./audit.js');
const OUT = path.join(__dirname, '..', 'out');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const EXTRA = +arg('extra', 300), SHARE = +arg('share', 0.45), EXTRA_FIRST = 1101;   // the owner asked for 300 new SuperModulation presets in all, that innovate with the wavelets
const { isInnov } = require('./compose.js');
// how many of the recipes of a candidate act on the wavelet itself (sparsity, phase, width, morph, window, additive scales: compose.js INNOV)
const innov = (c) => c.meta.mods.filter(isInnov).length;
const RATED = require('../ratings_beta03.js');
const v1 = require(path.join(OUT, 'presets_lfo3_v1.js'));   // the 600 of beta 0.3, in number order: { name: "NNN CFG · Title", cat, desc, v }
const pool = JSON.parse(fs.readFileSync(path.join(OUT, 'lfo3_pool.json'), 'utf8'));
const cal = JSON.parse(fs.readFileSync(path.join(OUT, 'calib03.json'), 'utf8'));
const numOf = (r) => parseInt(r.name, 10), titleOf = (r) => r.name.split(' · ')[1].toLowerCase();
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(s / a.length); };

// ---- the taste model, from the rated presets (their candidates in the pool)
// (the candidates of the 600 of beta 0.3 come from the pool as it was before the new runs: a new candidate may have the same title as an old one and then replaces it in the pool)
const pool1 = JSON.parse(fs.readFileSync(path.join(OUT, 'lfo3_pool_v1.json'), 'utf8'));
const byTitle = new Map(pool1.map(c => [c.title.toLowerCase(), c]));
const FAV = new Set(RATED.FAV || []);
const rows = [], favRows = [];
for (const r of v1) {
  const st = RATED[numOf(r)]; const c = byTitle.get(titleOf(r));
  if (st === undefined || !c || !c.audit.features || c.audit.features.length < 60) continue;
  // the favourites he named afterwards (7 stars, from another listening) are kept as they are and count for distinctness, but do not train the model
  (FAV.has(numOf(r)) ? favRows : rows).push({ n: numOf(r), stars: st, c });
}
const FEATURES = ['unison', 'chorus', 'reverb', 'delay', 'peak', 'poly', 'bass', 'hf', 'attack', 'release', 'width'];
const model = T.fit(rows, 6, FEATURES);
const looR = T.loo(rows, 6, FEATURES);
console.log(`taste model: ${rows.length} rated presets, leave-one-out correlation ${looR.r.toFixed(2)} (mean absolute error ${looR.mae.toFixed(2)} stars)`);
const w = model.w.map((x, j) => [FEATURES[j], x]).sort((a, b) => b[1] - a[1]);
console.log('  weights (stars per standard deviation): ' + w.map(([k, x]) => `${k} ${x >= 0 ? '+' : ''}${x.toFixed(2)}`).join(', '));

// ---- the candidates that can be chosen
const keptTitles = new Set(v1.map(titleOf));   // the titles of the 600 of beta 0.3 (rated or not): a remade preset is a different one
const SPEC = require('../../web/js/spec.js');
const existing = new Set(SPEC.PRESETS.map(p => (p.name.split(' · ')[1] || p.name).toLowerCase()));
const passes = (c) => {
  const act1 = ['lfo_cut', 'lfo_pos', 'lfo_wav', 'lfo_sp', 'lfo_res', 'lfo_ew', 'lfo_pitch'].some(k => c.v[k] > 0), act2 = c.v.lfo2_amt !== undefined && c.v.lfo2_amt !== 0, act3 = c.v.lfo3_amt !== undefined && c.v.lfo3_amt !== 0;
  if ((act1 && (c.v.lfo_shape || 0) > 1) || (act2 && (c.v.lfo2_shape || 0) > 1) || (act3 && (c.v.lfo3_shape || 0) > 1)) return false;
  if (Object.keys(c.v).some(k => /_semi$/.test(k) && [3, 4, 5].includes(c.v[k]))) return false;
  const a = c.audit;
  return !(A.judgeSound(a, c.meta.kind) || a.stopped || A.judgeMotion(a, c.cat) || A.judgeContrast(a));
};
const seen = new Set();
const cands = pool.filter(c => { const t = c.title.toLowerCase(); if (seen.has(t) || keptTitles.has(t) || existing.has(t) || !c.audit.features || c.audit.features.length < 60 || !passes(c)) return false; seen.add(t); return true; });
for (const c of cands) { c.score = model.predict(c); c.rank = c.score + (c.cat === 'SuperModulation' ? 0.45 * Math.min(4, innov(c)) : 0); }   // SuperModulation: the more wavelet recipes, the better
console.log(`${cands.length} candidates of the pool can be chosen (they pass the measures, are new, and are not among the 600 of beta 0.3)`);

// ---- the slots: the numbers of the unrated presets of each category (same number, same category), then the extra SuperModulation ones
const slots = {};   // category -> [numbers]
for (const r of v1) if (RATED[numOf(r)] === undefined) (slots[r.cat] = slots[r.cat] || []).push(numOf(r));
slots.SuperModulation = (slots.SuperModulation || []).concat(Array.from({ length: EXTRA }, (_, i) => EXTRA_FIRST + i));
const fixed = cal.map(r => r.features).concat(rows.concat(favRows).filter(r => r.stars >= 5).map(r => r.c.audit.features));
const chosen = {};   // number -> candidate
const report = [];
for (const [cat, nums] of Object.entries(slots)) {
  const pc = cands.filter(c => c.cat === cat && (cat !== 'SuperModulation' || innov(c) >= 2)).sort((a, b) => b.rank - a.rank);
  const short = pc.slice(0, Math.max(nums.length + 10, Math.round(pc.length * SHARE)));
  const minD = short.map(c => Math.min(...fixed.map(f => dist(c.audit.features, f))));
  const mine = [];
  for (let n = 0; n < nums.length && short.length; n++) {
    let best = -1, bd = -1;
    for (let i = 0; i < short.length; i++) if (short[i] && minD[i] > bd) { bd = minD[i]; best = i; }
    if (best < 0) break;
    const pick = short[best]; short[best] = null; mine.push(pick);
    for (let i = 0; i < short.length; i++) if (short[i]) minD[i] = Math.min(minD[i], dist(short[i].audit.features, pick.audit.features));
  }
  const avg = (l) => l.length ? l.reduce((s, c) => s + c.score, 0) / l.length : 0;
  report.push(`${cat.padEnd(16)} slots ${String(nums.length).padStart(3)}  candidates ${String(pc.length).padStart(4)}  chosen ${String(mine.length).padStart(3)}  predicted stars: chosen ${avg(mine).toFixed(2)} / all ${avg(pc).toFixed(2)}`);
  mine.forEach((c, i) => { chosen[nums[i]] = c; });
}
console.log(report.join('\n'));

// ---- the file: every number of the 600 in order (a rated preset as it was, an unrated one replaced), then the extra ones
const rounded = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number.isInteger(x) ? x : Math.round(x * 1e4) / 1e4]));
const entry = (num, c) => ({ name: `${String(num).padStart(3, '0')} ${c.used} · ${c.title}`, cat: c.cat, desc: c.desc, v: rounded(c.v) });
const list = [];
let missing = 0;
for (const r of v1) {
  const num = numOf(r);
  if (RATED[num] !== undefined) list.push({ name: r.name, cat: r.cat, desc: r.desc, v: r.v });
  else if (chosen[num]) list.push(entry(num, chosen[num]));
  else { missing++; list.push({ name: r.name, cat: r.cat, desc: r.desc, v: r.v }); }   // no candidate left for this slot: the preset stays as it was
}
for (let i = 0; i < EXTRA; i++) if (chosen[EXTRA_FIRST + i]) list.push(entry(EXTRA_FIRST + i, chosen[EXTRA_FIRST + i]));
let js = '// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)\n// SPDX-License-Identifier: GPL-3.0-or-later\n' +
  '// GENERATED by tools/supermod/rebuild.js (from the pool of build.js and the owner\'s ratings, tools/ratings_beta03.js): the new presets of beta 0.3.1, numbers 501-1100 (the ones he rated\n' +
  '// as they were, the others remade) and 1101-' + (EXTRA_FIRST + EXTRA - 1) + ' (new SuperModulation presets), loudness matched.\n\'use strict\';\nmodule.exports = [\n';
for (const e of list) js += `  { name: ${JSON.stringify(e.name)}, cat: ${JSON.stringify(e.cat)}, desc: ${JSON.stringify(e.desc)},\n    v: ${JSON.stringify(e.v)} },\n`;
js += '];\n';
fs.writeFileSync(path.join(__dirname, '..', 'presets_lfo3.js'), js.replace(/\n/g, '\r\n'));
console.log(`written tools/presets_lfo3.js: ${list.length} presets (${v1.length} numbers kept or remade, ${list.length - v1.length} new SuperModulation)${missing ? `, ${missing} slots without a candidate (left as they were)` : ''}`);
fs.writeFileSync(path.join(OUT, 'rebuild_report.json'), JSON.stringify({ loo: looR.r, rated: rows.length, chosen: Object.fromEntries(Object.entries(chosen).map(([n, c]) => [n, { title: c.title, cat: c.cat, score: c.score, cfg: c.meta.cfg }])) }));
