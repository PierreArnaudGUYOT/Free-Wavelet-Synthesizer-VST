// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Version 1.0.15: is the demo the same as in another version? (the owner's rule: a change of presets must leave the music of the demo as it was.) Compares, against the web app of another
// checkout (--old, a folder that holds web/): the tour (the 30 preset names), each tour preset's values, the demo's level trims and the song; then renders every scene with both engines, as
// tools/demo_level.js does (velocity 1, 16 voices, the demo's rules and trims), and compares the audio sample by sample, the new render read from its output stage's latency on (limD:
// the look-ahead limiter of 1.0.15 delays the output by 1.5 ms; 0 for an engine without it).
//   node tools/demo_compare.js --old build/wt-main [--procs 10]
'use strict';
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const OLD = path.resolve(arg('old', '')), NEW = path.join(__dirname, '..'), PROCS = +arg('procs', 10), TAIL = 0.6;
if (!arg('old', '')) { console.error('usage: node tools/demo_compare.js --old <folder that holds web/>'); process.exit(1); }

function load(root) {
  const g = {}; g.window = g;
  // eslint-disable-next-line no-new-func
  const song = new Function('window', fs.readFileSync(path.join(root, 'web', 'js', 'demo_data.js'), 'utf8') + ';return window.WS_DEMO_SONGS ? window.WS_DEMO_SONGS[0] : WS_DEMO_SONGS[0];')(g);
  const SPEC = require(path.join(root, 'web', 'js', 'spec.js'));
  const C = require(path.join(root, 'web', 'js', 'core.js'))(SPEC);
  return { SPEC, C, song };
}
const presetOf = (S, name) => S.DEMO_PRESETS.find(p => p.name === name) || S.PRESETS.find(p => p.name === name);

if (process.argv.includes('--worker')) {
  const part = +arg('worker', 0), of = +arg('of', 1);
  const A = load(OLD), B = load(NEW), sr = 48000, blk = 128, out = [];
  A.SPEC.TOUR.forEach((name, k) => {
    if (k % of !== part) return;
    const render = (X) => {
      const P = X.C.P, pr = presetOf(X.SPEC, name), base = Float64Array.from(pr.values), mp = X.SPEC.PARAMS[P.master];
      base[P.v_voices] = 16; base[P.v_oct] = 0; base[P.v_glide] = 0; if (P.vel_amt !== undefined) base[P.vel_amt] = 0;
      if (base[P.amp_a] > 0.08) base[P.amp_a] = 0.08;
      if (base[P.fx_dmix] > 0.1) base[P.fx_dmix] = 0.1;
      if (base[P.fx_dfb] > 0.3) base[P.fx_dfb] = 0.3;
      if ((X.SPEC.DEMO_TRIM || {})[name]) base[P.master] = Math.max(mp.min, base[P.master] - X.SPEC.DEMO_TRIM[name]);
      const eng = new X.C.Engine(sr); base.forEach((v, i) => eng.setParam(i, v));
      eng.vol = Math.exp(base[P.master] * (Math.LN10 / 20));
      eng.setTables(X.C.buildTables(base, true));
      const STEP = X.song.phrase, t0 = k * STEP, n = Math.round((STEP + TAIL) * sr), lat = eng.limD || 0, m = n + lat, ev = [];
      for (let i = 0; i < X.song.notes.length; i += 4) {
        const on = X.song.notes[i], off = on + X.song.notes[i + 1];
        if (off <= t0 || on >= t0 + STEP) continue;
        ev.push([Math.max(0, Math.round((on - t0) * sr)), 1, X.song.notes[i + 2], X.song.notes[i + 3]]);
        ev.push([Math.min(n - 1, Math.round((off - t0) * sr)), 0, X.song.notes[i + 2], 0]);
      }
      ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const L = new Float32Array(m), R = new Float32Array(m);
      let e = 0;
      for (let s = 0; s < m; s += blk) {
        while (e < ev.length && ev[e][0] < s + blk) { if (ev[e][1]) eng.noteOn(ev[e][2], ev[e][3]); else eng.noteOff(ev[e][2]); e++; }
        eng.process(L.subarray(s, Math.min(s + blk, m)), R.subarray(s, Math.min(s + blk, m)), Math.min(blk, m - s));
      }
      return { L: L.subarray(lat, lat + n), R: R.subarray(lat, lat + n), n };
    };
    const a = render(A), b = render(B);
    let peak = 0, maxd = 0;
    for (let i = 0; i < a.n; i++) { peak = Math.max(peak, Math.abs(a.L[i]), Math.abs(a.R[i])); maxd = Math.max(maxd, Math.abs(a.L[i] - b.L[i]), Math.abs(a.R[i] - b.R[i])); }
    out.push({ k, name, peak, maxd });
  });
  fs.writeFileSync(path.join(__dirname, 'out', `demo_compare_${part}.json`), JSON.stringify(out));
  process.exit(0);
}

// the data first
const A = load(OLD), B = load(NEW);
let dataOk = true;
const say = (ok, what) => { if (!ok) dataOk = false; console.log(`${ok ? 'ok  ' : 'DIFF'} ${what}`); };
say(JSON.stringify(A.SPEC.TOUR) === JSON.stringify(B.SPEC.TOUR), `the tour: the same ${A.SPEC.TOUR.length} presets in the same order`);
const diffs = A.SPEC.TOUR.filter(n => { const a = presetOf(A.SPEC, n), b = presetOf(B.SPEC, n); if (!a || !b) return true; return A.SPEC.PARAMS.some((p, i) => { const j = B.SPEC.PARAMS.findIndex(q => q.key === p.key); return j < 0 || a.values[i] !== b.values[j]; }); });
say(!diffs.length, `the values of every tour preset (every parameter of the older version)${diffs.length ? ': ' + diffs.join(', ') : ''}`);
say(JSON.stringify(A.SPEC.DEMO_TRIM || {}) === JSON.stringify(B.SPEC.DEMO_TRIM || {}), 'the demo level trims');
say(JSON.stringify(A.song.notes) === JSON.stringify(B.song.notes) && A.song.phrase === B.song.phrase, `the song (${A.song.notes.length / 4} notes, phrase ${A.song.phrase} s)`);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
let done = 0;
for (let w = 0; w < PROCS; w++) {
  fork(__filename, ['--worker', String(w), '--of', String(PROCS), '--old', OLD]).on('exit', () => {
    if (++done < PROCS) return;
    let rows = [];
    for (let k = 0; k < PROCS; k++) { const f = path.join(__dirname, 'out', `demo_compare_${k}.json`); rows = rows.concat(JSON.parse(fs.readFileSync(f, 'utf8'))); fs.unlinkSync(f); }
    rows.sort((x, y) => x.k - y.k);
    let worst = 0;
    for (const r of rows) { const rel = r.maxd / Math.max(r.peak, 1e-9); worst = Math.max(worst, rel); console.log(`${rel <= 1e-6 ? 'ok  ' : 'DIFF'} scene ${String(r.k).padStart(2)} ${r.name.padEnd(36)} peak ${r.peak.toFixed(3)}  max difference ${r.maxd.toExponential(2)}`); }
    const audioOk = worst <= 1e-6;
    console.log(dataOk && audioOk ? `THE DEMO IS THE SAME: data identical, ${rows.length} scenes, worst audio difference ${worst.toExponential(2)} of the peak` : 'THE DEMO DIFFERS (see the lines above)');
    process.exit(dataOk && audioOk ? 0 : 1);
  });
}
