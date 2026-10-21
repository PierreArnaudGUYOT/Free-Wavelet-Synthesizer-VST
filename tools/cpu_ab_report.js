// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Summary of the CSV of vst/devtest/cpu_ab (two builds of the engine measured in turn): the mean CPU of each, the ratio new / old (mean, median, best, worst), the bit-identity of the two
// outputs, the best and the worst presets, and the ratio by third of the old cost.
//   node tools/cpu_ab_report.js ab.csv [cases.txt (the names)] [label]
const fs = require('fs');
const L = fs.readFileSync(process.argv[2], 'utf8').split('\n').map(l => l.trim()).filter(l => l && l[0] !== '#');
const names = {};
if (process.argv[3]) for (const l of fs.readFileSync(process.argv[3], 'utf8').split('\n')) { const i = l.lastIndexOf(' | '); if (i > 0) names[l.split(' ')[0]] = l.slice(i + 3); }
const rows = L.map(l => { const p = l.split(','); return { idx: p[0], chord: p[1], a: +p[3], b: +p[4], same: p[5] === p[6] }; });
let a = 0, b = 0, same = 0; for (const r of rows) { a += r.a; b += r.b; if (r.same) same++; r.ratio = r.b / r.a; }
const rs = rows.map(r => r.ratio).sort((x, y) => x - y);
const label = process.argv[4] ? process.argv[4] + ': ' : '';
console.log(`${label}n=${rows.length} old mean ${(a / rows.length).toFixed(3)} %  new mean ${(b / rows.length).toFixed(3)} %  new/old ${(b / a).toFixed(3)}  median ${rs[rs.length >> 1].toFixed(3)}  best ${rs[0].toFixed(3)} worst ${rs[rs.length - 1].toFixed(3)}  bit-identical ${same}/${rows.length}`);
const by = rows.slice().sort((x, y) => x.ratio - y.ratio);
const show = (r) => `  ${r.ratio.toFixed(3)}  old ${r.a.toFixed(2)} new ${r.b.toFixed(2)}  #${r.idx} ${names[r.idx] || ''}`;
console.log('best:'); by.slice(0, 6).forEach(r => console.log(show(r)));
console.log('worst:'); by.slice(-8).forEach(r => console.log(show(r)));
// by old cost terciles
const bc = rows.slice().sort((x, y) => x.a - y.a), t = Math.floor(bc.length / 3);
for (const [nm, sl] of [['light third', bc.slice(0, t)], ['middle third', bc.slice(t, 2 * t)], ['heavy third', bc.slice(2 * t)]]) { const o = sl.reduce((s, r) => s + r.a, 0), n = sl.reduce((s, r) => s + r.b, 0); console.log(`${nm}: old ${(o / sl.length).toFixed(2)} % new ${(n / sl.length).toFixed(2)} %  new/old ${(n / o).toFixed(3)}`); }
