// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// A scratch bench to try a recipe: node tools/try_preset.js <file.js> ...   where the file exports an array of P(...) presets
// (tools/preset_dsl.js). Prints the loudness (re the TOP Sounds' median), the measures and writes tools/out/try.png.
'use strict';
const path = require('path');
const lab = require('./preset_lab.js');
const SPEC = lab.SPEC;
const top = SPEC.PRESETS.slice(0, SPEC.TOP).map(p => lab.chordLoudness(p.values, 0.2).db).sort((a, b) => a - b);
const target = top[Math.floor(top.length / 2)];
const cells = [];
for (const f of process.argv.slice(2)) {
  for (const r of require(path.resolve(f))) {
    const values = SPEC.PARAMS.map(p => (r.v[p.key] !== undefined ? r.v[p.key] : p.def));
    const l = lab.chordLoudness(values);
    const rend = lab.render(values), m = lab.measure(rend);
    console.log(`${r.title.padEnd(26)} ${(l.db - target).toFixed(1).padStart(6)} dB re target${l.short ? ' (short)' : ''}  peak ${l.peak.toFixed(2)}  t20 ${m.t20Ms} ms  cen50 ${m.cen50.toFixed(0)} Hz  flat ${m.flat400.toFixed(2)}`);
    cells.push({ label: cells.length + 1, r: rend });
  }
}
lab.sheet(cells, path.join(__dirname, 'out', 'try.png'), { cols: 4 });
