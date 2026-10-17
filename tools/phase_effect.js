// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check (beta 0.4): how much SOURCE PHASE changes the presets that use it. For each engine-A preset with a
// phase (or of the "Source Phase" section), its static cycle at middle C — scale-filter gains without envelope or LFO,
// sparsity, position window, the WAVELET MORPH mix — is built at phase 0 and at the preset's phase, and the largest change
// of a harmonic magnitude is reported (harmonics 1-64 within 50 dB of the strongest one; the method of the paper's
// shift-variance measurement), then the same among the harmonics within 20 dB of the strongest (the clearly audible part).
// A Fourier filter would give 0 dB. Presets under 6 dB are flagged (exit code 1).
// Usage: node tools/phase_effect.js            (the presets of the spec)
'use strict';
const path = require('path');
const SPEC = require(path.join(__dirname, '../web/js/spec.js'));
const C = require(path.join(__dirname, '../web/js/core.js'))(SPEC);
const P = C.P, N = C.N, NB = C.NB;
const H = 64, FLOOR_DB = 50, MIN_DB = 6;

function spectrum(y) {
  const re = Float64Array.from(y), im = new Float64Array(N);
  C.fft(re, im, false);
  const m = new Float64Array(H + 1);
  for (let h = 1; h <= H; h++) m[h] = Math.hypot(re[h], im[h]) / N;
  return m;
}
// the static cycle of a preset at a given source phase (engine A)
function cycle(values, phase) {
  const one = wav => {
    const v = Float64Array.from(values);
    v[P.engine] = 0; v[P.a_phase] = phase; v[P.wavelet] = wav;
    const tb = C.buildTables(v, false), g = C.staticGains(v, new Float64Array(NB)), y = new Float64Array(N);
    C.displayCycle(tb, g, v[P.p_center], v[P.p_width], v[P.p_depth], y);
    return y;
  };
  const y = one(values[P.wavelet]);
  const wm = values[P.wmorph];
  if (C.morphNeeded(values) && wm > 0) {
    const y2 = one(values[P.wav2]);
    for (let i = 0; i < N; i++) y[i] = (1 - wm) * y[i] + wm * y2[i];
  }
  return y;
}
// the largest harmonic change (dB) between phase 0 and `phase`, and the harmonic where it happens; `loud` = the same among
// the harmonics within 20 dB of the strongest one (the clearly audible part of the change)
function phaseEffect(values, phase) {
  const a = spectrum(cycle(values, 0)), b = spectrum(cycle(values, phase));
  let mx = 0; for (let h = 1; h <= H; h++) mx = Math.max(mx, a[h], b[h]);
  const worst = (floorDb) => {
    const floor = mx * Math.pow(10, -floorDb / 20);
    let db = 0, at = 0;
    for (let h = 1; h <= H; h++) {
      if (Math.max(a[h], b[h]) < floor) continue;
      const d = Math.abs(20 * Math.log10(Math.max(b[h], floor * 1e-3) / Math.max(a[h], floor * 1e-3)));
      if (d > db) { db = d; at = h; }
    }
    return { db, at };
  };
  const all = worst(FLOOR_DB), loud = worst(20);
  return { db: all.db, at: all.at, loud: loud.db, loudAt: loud.at };
}

module.exports = { phaseEffect, cycle, spectrum, MIN_DB };

if (require.main === module) {
  let low = 0, n = 0;
  for (const pr of SPEC.PRESETS) {
    const v = pr.values, ph = v[P.a_phase];
    if (pr.cat !== 'Source Phase' && ph === 0) continue;
    if (Math.round(v[P.engine]) !== 0) continue;
    n++;
    if (ph === 0) { console.log(`  ref  ${pr.name.padEnd(30)} phase 0° (the reference of a pair)`); continue; }
    const e = phaseEffect(v, ph), ok = e.db >= MIN_DB;
    if (!ok) low++;
    console.log(`  ${ok ? 'ok  ' : 'LOW '} ${pr.name.padEnd(30)} phase ${(ph * 360).toFixed(1).padStart(5)}°  ${e.db.toFixed(1).padStart(5)} dB (harmonic ${e.at}),` +
      ` loud harmonics ${e.loud.toFixed(1).padStart(5)} dB (harmonic ${e.loudAt})`);
  }
  console.log(low ? `${low} of ${n} presets under ${MIN_DB} dB` : `${n} presets: every phase changes the timbre by ${MIN_DB} dB or more`);
  process.exit(low ? 1 : 0);
}
