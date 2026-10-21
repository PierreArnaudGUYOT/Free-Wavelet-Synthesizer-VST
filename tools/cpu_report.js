// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Aggregates the CSV files of vst/devtest/cpu_bench.cpp (one line per preset x chord x velocity: CPU % of real time) by the presets' features
// (the file written by tools/cpu_cases.js), as Markdown tables; with --after, before / after side by side.
//   node tools/cpu_report.js <features.json> --before a.csv[,b.csv...] [--after c.csv[,d.csv...]] [--top 15] [--chord 6]
//   node tools/cpu_report.js <features.json> --paired a.csv[,b.csv...] [--top 15] [--chord 6]     the files of vst/devtest/cpu_ab.cpp: before = column 4, after = column 5
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const feat = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const load = (list, col = 3) => {
  const m = new Map();
  for (const f of (list || '').split(',').filter(Boolean)) {
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!l || l[0] === '#') continue;
      const cols = l.trim().split(','), idx = cols[0], chord = cols[1], mn = cols[col], key = `${idx}|${chord}`;   // a preset measured in several files (repeated runs): the smallest value, the run the machine disturbed least
      if (!m.has(key) || +mn < m.get(key)) m.set(key, +mn);
    }
  }
  return m;
};
const paired = opt('paired');
const before = paired ? load(paired, 3) : load(opt('before')), after = paired ? load(paired, 4) : load(opt('after')), hasAfter = after.size > 0, top = +opt('top', 15);
if (paired) {   // the hashes of both outputs of every render must be equal: the sound is bit-identical
  let n = 0, bad = 0;
  for (const f of paired.split(',')) for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l || l[0] === '#') continue; const c = l.trim().split(','); n++; if (c[5] !== c[6]) bad++; }
  console.log(`${n} renders compared by the hash of their output: ${bad} differ\n`);
}
const ids = [...new Set([...before.keys()].map(k => k.split('|')[0]))].filter(i => feat[i]);
const chords = [...new Set([...before.keys()].map(k => k.split('|')[1]))].sort((a, b) => a - b);
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const f2 = (x) => (x === undefined || isNaN(x) ? '-' : x.toFixed(2));
const groups = [
  ['all presets', () => true],
  ['filter off', f => !f.flt], ['filter on', f => f.flt], ['filter on, LADDER', f => f.flt && f.fltType === 0], ['filter on, OTA', f => f.flt && f.fltType === 1], ['filter drive', f => f.flt && f.drive],
  ['unison 1', f => f.unison === 1], ['unison 2', f => f.unison === 2], ['unison 3', f => f.unison === 3], ['unison 4', f => f.unison === 4],
  ['1 oscillator', f => f.nosc === 1], ['2 oscillators', f => f.nosc === 2], ['3 oscillators', f => f.nosc === 3], ['A1 plays', f => /A1/.test(f.oscs)], ['A2 plays', f => /A2/.test(f.oscs)], ['B1 plays', f => /B1/.test(f.oscs)],
  ['chorus on', f => f.chorus], ['delay on', f => f.delay], ['reverb on', f => f.reverb], ['no effect', f => !f.chorus && !f.delay && !f.reverb && !f.fxdrive],
  ['LFO 1 on', f => f.lfo1], ['LFO 2 on', f => f.lfo2], ['LFO 3 on', f => f.lfo3], ['no LFO', f => !f.lfo1 && !f.lfo2 && !f.lfo3],
  ['morph', f => f.morph], ['own envelope', f => f.ownEnv], ['sub oscillator', f => f.sub], ['mono (1 voice)', f => f.voices === 1],
];
for (const c of chords) {
  console.log(`\n### Chord of ${c} notes (CPU %, mean / median / 90th percentile / worst${hasAfter ? '; after in the same order' : ''})\n`);
  console.log(hasAfter ? '| group | presets | before mean | before median | before p90 | before max | after mean | after median | after p90 | after max | gain (mean) |' : '| group | presets | mean | median | p90 | max |');
  console.log(hasAfter ? '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|' : '|---|---:|---:|---:|---:|---:|');
  for (const [name, pred] of groups) {
    const sel = ids.filter(i => pred(feat[i]) && before.has(`${i}|${c}`));
    if (!sel.length) continue;
    const b = sel.map(i => before.get(`${i}|${c}`));
    if (!hasAfter) { console.log(`| ${name} | ${sel.length} | ${f2(mean(b))} | ${f2(pct(b, 0.5))} | ${f2(pct(b, 0.9))} | ${f2(Math.max(...b))} |`); continue; }
    const a = sel.map(i => after.get(`${i}|${c}`)).filter(x => x !== undefined);
    console.log(`| ${name} | ${sel.length} | ${f2(mean(b))} | ${f2(pct(b, 0.5))} | ${f2(pct(b, 0.9))} | ${f2(Math.max(...b))} | ${f2(mean(a))} | ${f2(pct(a, 0.5))} | ${f2(pct(a, 0.9))} | ${f2(Math.max(...a))} | ${(100 * (1 - mean(a) / mean(b))).toFixed(0)} % |`);
  }
}
const c0 = opt('chord', chords.includes('6') ? '6' : chords[0]);
console.log(`\n### The ${top} most expensive presets (chord of ${c0} notes)\n`);
const worst = ids.filter(i => before.has(`${i}|${c0}`)).sort((x, y) => before.get(`${y}|${c0}`) - before.get(`${x}|${c0}`)).slice(0, top);
console.log(hasAfter ? '| preset | before % | after % | gain | filter | unison | oscillators | effects | LFOs | morph |' : '| preset | % | filter | unison | oscillators | effects | LFOs | morph |');
console.log(hasAfter ? '|---|---:|---:|---:|---|---:|---|---|---|---|' : '|---|---:|---|---:|---|---|---|---|');
for (const i of worst) {
  const f = feat[i], b = before.get(`${i}|${c0}`), a = after.get(`${i}|${c0}`);
  const fx = [f.chorus && 'chorus', f.delay && 'delay', f.reverb && 'reverb', f.fxdrive && 'drive'].filter(Boolean).join(' ') || '-';
  const lf = [f.lfo1 && '1', f.lfo2 && '2', f.lfo3 && '3'].filter(Boolean).join(' ') || '-';
  const fl = f.flt ? (f.fltType === 0 ? 'LADDER' : 'OTA') + (f.drive ? '+drive' : '') : 'off';
  console.log(hasAfter ? `| ${f.name} (#${i}) | ${f2(b)} | ${f2(a)} | ${a ? (100 * (1 - a / b)).toFixed(0) + ' %' : '-'} | ${fl} | ${f.unison} | ${f.oscs}${f.morph ? '' : ''} | ${fx} | ${lf} | ${f.morph ? 'yes' : '-'} |`
    : `| ${f.name} (#${i}) | ${f2(b)} | ${fl} | ${f.unison} | ${f.oscs} | ${fx} | ${lf} | ${f.morph ? 'yes' : '-'} |`);
}
