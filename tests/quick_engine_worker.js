// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Worker thread of tests/quick.js: plays a note and a chord with the presets k, k + n, k + 2n ... on the JS engine and reports the ones that are silent, not finite or above 0 dBFS.
'use strict';
const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const R = (...p) => path.join(__dirname, '..', ...p);
const SPEC = require(R('web', 'js', 'spec.js')), C = require(R('web', 'js', 'core.js'))(SPEC);
const sr = 48000, L = new Float32Array(128), Rb = new Float32Array(128), bad = [];
const run = (params, script, blocks) => {
  const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
  eng.setTables(C.buildTables(Float64Array.from(params), true));
  let pk = 0, nan = 0;
  for (let b = 0; b < blocks; b++) {
    script(eng, b); eng.process(L, Rb, 128);
    for (let i = 0; i < 128; i++) { const a = Math.abs(L[i]), c = Math.abs(Rb[i]); if (!isFinite(a) || !isFinite(c)) nan++; else pk = Math.max(pk, a, c); }
  }
  return { pk, nan };
};
SPEC.PRESETS.forEach((pr, i) => {
  if (i % workerData.n !== workerData.k) return;
  const r = run(pr.values, (e, b) => { if (b === 0) e.noteOn(60, 0.9); if (b === 120) { e.noteOn(64, 0.8); e.noteOn(67, 0.8); } }, 190);
  if (r.nan) bad.push(pr.name + ': ' + r.nan + ' non-finite samples');
  else if (r.pk < 1e-4) bad.push(pr.name + ': silent');
  else if (r.pk > 1.0001) bad.push(pr.name + ': peak ' + r.pk.toFixed(3) + ' > 0 dBFS');
});
parentPort.postMessage(bad);
