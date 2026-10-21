// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Reads the histogram that `cpu_bench --sample` writes (instruction pointers of the audio thread, relative addresses) and the debug build it came from
// (-g), asks llvm-symbolizer for the source line of every address (inlined frames included) and prints the share of the samples per source line of
// dsp.h and per function.
//   node tools/cpu_profile.js <cpu_bench.exe> <hist.txt> [top lines = 40]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const exe = process.argv[2], histFile = process.argv[3], top = +process.argv[4] || 40;
if (!exe || !histFile) { console.error('usage: node tools/cpu_profile.js <cpu_bench.exe> <hist.txt> [top]'); process.exit(1); }
const sym = path.join(process.env.LLVM_MINGW || path.join(process.env.USERPROFILE, 'tools', 'llvm-mingw'), 'bin', 'llvm-symbolizer.exe');
const rows = fs.readFileSync(histFile, 'utf8').trim().split('\n').filter(l => l[0] !== '#').map(l => l.split(' ')).map(([a, c]) => [a, +c]);   // the '# module' lines (system libraries' places) are for tools/out/funcs.js-style readers
const total = rows.reduce((s, r) => s + r[1], 0);
const r = cp.spawnSync(sym, ['--obj=' + exe, '--inlining', '--relative-address', '--functions=short', '--basenames'], { input: rows.map(x => x[0]).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
// llvm-symbolizer prints, for each address, pairs of lines (function, file:line:col) then an empty line
const blocks = r.stdout.split(/\n\s*\n/);
const byLine = new Map(), byFunc = new Map(), byOuter = new Map();
rows.forEach(([a, c], i) => {
  const ls = (blocks[i] || '').split('\n').filter(Boolean);
  const frames = []; for (let k = 0; k + 1 < ls.length; k += 2) frames.push({ fn: ls[k], loc: ls[k + 1] });
  if (!frames.length) { byLine.set('?', (byLine.get('?') || 0) + c); return; }
  const inner = frames[0], outer = frames[frames.length - 1];
  const m = /^(.*):(\d+):\d+$/.exec(inner.loc), key = m ? `${m[1]}:${m[2]}` : inner.loc;
  byLine.set(key, (byLine.get(key) || 0) + c);
  byFunc.set(inner.fn, (byFunc.get(inner.fn) || 0) + c);
  byOuter.set(outer.fn, (byOuter.get(outer.fn) || 0) + c);
});
const show = (title, map, n) => {
  console.log(`\n${title} (${total} samples)`);
  for (const [k, c] of [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)) console.log(`${(100 * c / total).toFixed(1).padStart(6)} %  ${k}`);
};
show('by function that the samples fell in (inlined callee included)', byFunc, 25);
show('by enclosing function (the callee not inlined, the caller it was inlined into)', byOuter, 15);
show('by source line', byLine, top);
