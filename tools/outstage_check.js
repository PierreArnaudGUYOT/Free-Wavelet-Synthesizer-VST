// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Version 1.0.15: does the output stage crackle? Every scene of the web demo (the phrase each preset of the tour plays, as tools/demo_level.js renders it: velocity 1, 16 voices, the
// demo's trims) is rendered three times with the engine: OUTPUT Classic (the guard + tanh soft limiter of 1.0.14), OUTPUT Limiter (the look-ahead limiter of 1.0.15), and a clean
// reference (the master 30 dB lower, scaled back up: no output stage acts on it). Against the reference:
//   dist  = the distortion the stage added, once its gain riding is taken out (each 5 ms block of the render is fitted to the reference by one gain; what that gain cannot explain is
//           the crackle / buzz: the tanh flattening the peaks). Heard as crackle above about 2 %.
//   gain  = the lowest gain of a block (how far the stage turned the sound down), peak = the highest output sample, in = the peak that reached the stage.
//   node tools/outstage_check.js [--procs 12] [--all]      --all: every preset of the factory list plays the loud chord of tools/crackle.js (C5 E5 G5 at velocity 1) instead of the demo
'use strict';
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const PROCS = +arg('procs', 12), ALL = process.argv.includes('--all'), TAIL = 0.6, OUT = path.join(__dirname, 'out');
// --all only: --notes 48,52,55,60,64,67,72,76 (a denser chord), --boost 6 (the master raised by that many dB, as a player may), --polycomp 0 (CHORD COMP off)
const NOTES = arg('notes', '72,76,79').split(',').map(Number), BOOST = +arg('boost', 0), POLYC = +arg('polycomp', 1);
// --blockms 1: the gain is fitted per 1 ms instead of 5 ms (a limiter's gain hardly moves within 1 ms: what is left is the waveform the stage bent, the crackle itself)
const BLOCKMS = +arg('blockms', 5);

function load() {
  global.window = global;
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(__dirname, '..', 'web', 'js', 'demo_data.js'), 'utf8') + ';global.SONG = WS_DEMO_SONGS[0];');
  const SPEC = require('../web/js/spec.js');
  const C = require('../web/js/core.js')(SPEC);
  return { SPEC, C, song: global.SONG };
}

if (process.argv.includes('--worker')) {
  const part = +arg('worker', 0), of = +arg('of', 1);
  const { SPEC, C, song } = load();
  const P = C.P, sr = 48000, mp = SPEC.PARAMS[P.master], blk = 128, STEP = song.phrase;
  const items = ALL ? SPEC.PRESETS.map((p, i) => [p.name, i]) : SPEC.TOUR.map((n, k) => [n, k]);
  const out = [];
  items.forEach(([name, k]) => {
    if (k % of !== part) return;
    let base, ev, n;
    if (ALL) {
      base = Float64Array.from(SPEC.PRESETS[k].values);
      base[P.master] = Math.min(mp.max, base[P.master] + BOOST); base[P.poly_comp] = POLYC; base[P.v_voices] = Math.max(base[P.v_voices], Math.min(16, NOTES.length));
      n = Math.round(2.4 * sr);
      const off = Math.round(1.6 * sr / blk) * blk;
      ev = NOTES.map(x => [0, 1, x, 1]).concat(NOTES.map(x => [off, 0, x, 0]));
    } else {
      const pr = SPEC.DEMO_PRESETS.find(p => p.name === name) || SPEC.PRESETS.find(p => p.name === name);
      base = Float64Array.from(pr.values);
      // as demo.js enterScene (the same rules as tools/demo_level.js), with the demo's trim
      base[P.v_voices] = 16; base[P.v_oct] = 0; base[P.v_glide] = 0; base[P.vel_amt] = 0;
      if (base[P.amp_a] > 0.08) base[P.amp_a] = 0.08;
      if (base[P.fx_dmix] > 0.1) base[P.fx_dmix] = 0.1;
      if (base[P.fx_dfb] > 0.3) base[P.fx_dfb] = 0.3;
      if ((SPEC.DEMO_TRIM || {})[name]) base[P.master] = Math.max(mp.min, base[P.master] - SPEC.DEMO_TRIM[name]);
      const t0 = k * STEP; n = Math.round((STEP + TAIL) * sr); ev = [];
      for (let i = 0; i < song.notes.length; i += 4) {
        const on = song.notes[i], off = on + song.notes[i + 1];
        if (off <= t0 || on >= t0 + STEP) continue;
        ev.push([Math.max(0, Math.round((on - t0) * sr)), 1, song.notes[i + 2], song.notes[i + 3]]);
        ev.push([Math.min(n - 1, Math.round((off - t0) * sr)), 0, song.notes[i + 2], 0]);
      }
      ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    }
    const tables = C.buildTables(base, true);
    const render = (master, mode) => {
      const params = Float64Array.from(base); params[P.master] = master; params[P.out_mode] = mode;
      const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
      eng.vol = Math.exp(master * (Math.LN10 / 20));
      eng.setTables(tables);
      const L = new Float32Array(n), R = new Float32Array(n);
      let e = 0;
      for (let s = 0; s < n; s += blk) {
        while (e < ev.length && ev[e][0] < s + blk) { if (ev[e][1]) eng.noteOn(ev[e][2], ev[e][3]); else eng.noteOff(ev[e][2]); e++; }
        eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s));
      }
      return { L, R };
    };
    const m0 = base[P.master], low = Math.max(mp.min, m0 - 30), gain = Math.pow(10, (m0 - low) / 20);
    const ref = render(low, 1), row = { k, name };
    let pin = 0;
    for (let i = 0; i < n; i++) pin = Math.max(pin, Math.abs(ref.L[i] * gain), Math.abs(ref.R[i] * gain));
    row.in = pin;
    for (const [mode, key] of [[0, 'classic'], [1, 'limiter']]) {
      const a = render(m0, mode), B = Math.round(BLOCKMS / 1000 * sr);
      let res = 0, en = 0, gmin = 1, peak = 0;
      for (let b0 = Math.round(0.05 * sr); b0 + B <= n; b0 += B) {
        let xy = 0, yy = 0, xx = 0;
        for (let i = b0; i < b0 + B; i++) {
          const yl = ref.L[i] * gain, yr = ref.R[i] * gain;
          xy += a.L[i] * yl + a.R[i] * yr; yy += yl * yl + yr * yr; xx += a.L[i] * a.L[i] + a.R[i] * a.R[i];
          peak = Math.max(peak, Math.abs(a.L[i]), Math.abs(a.R[i]));
        }
        if (yy < 1e-12) continue;
        const g = xy / yy;
        if (yy > 1e-6) gmin = Math.min(gmin, g);
        for (let i = b0; i < b0 + B; i++) { const dl = a.L[i] - g * ref.L[i] * gain, dr = a.R[i] - g * ref.R[i] * gain; res += dl * dl + dr * dr; }
        en += xx;
      }
      row[key] = { dist: en > 0 ? Math.sqrt(res / en) : 0, gain: gmin, peak };
    }
    out.push(row);
  });
  fs.writeFileSync(path.join(OUT, `outstage_${part}.json`), JSON.stringify(out));
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
let done = 0; const t0 = Date.now();
for (let w = 0; w < PROCS; w++) {
  fork(__filename, ['--worker', String(w), '--of', String(PROCS), '--notes', NOTES.join(','), '--boost', String(BOOST), '--polycomp', String(POLYC), '--blockms', String(BLOCKMS)].concat(ALL ? ['--all'] : [])).on('exit', () => {
    if (++done < PROCS) return;
    let rows = [];
    for (let k = 0; k < PROCS; k++) { const f = path.join(OUT, `outstage_${k}.json`); rows = rows.concat(JSON.parse(fs.readFileSync(f, 'utf8'))); fs.unlinkSync(f); }
    rows.sort((a, b) => a.k - b.k);
    const pc = (x) => (100 * x).toFixed(2).padStart(6) + ' %', db = (g) => (20 * Math.log10(Math.max(g, 1e-6))).toFixed(1).padStart(6) + ' dB';
    if (!ALL || process.argv.includes('--rows')) {
      console.log('  # preset                                  in    | Classic: dist     gain      peak | Limiter: dist     gain      peak');
      for (const r of rows) console.log(`${String(r.k).padStart(3)} ${r.name.slice(0, 38).padEnd(38)} ${r.in.toFixed(2).padStart(5)} | ${pc(r.classic.dist)} ${db(r.classic.gain)} ${r.classic.peak.toFixed(3)} | ${pc(r.limiter.dist)} ${db(r.limiter.gain)} ${r.limiter.peak.toFixed(3)}`);
    }
    const med = (f) => { const v = rows.map(f).sort((a, b) => a - b); return v[v.length >> 1]; }, max = (f) => Math.max(...rows.map(f));
    for (const key of ['classic', 'limiter']) {
      console.log(`${key.padEnd(8)}: dist median ${pc(med(r => r[key].dist))}, max ${pc(max(r => r[key].dist))}; over 2 %: ${rows.filter(r => r[key].dist > 0.02).length}, over 0.5 %: ${rows.filter(r => r[key].dist > 0.005).length} of ${rows.length}; highest output sample ${max(r => r[key].peak).toFixed(3)}`);
    }
    console.log(`${rows.length} ${ALL ? 'presets (loud chord)' : 'demo scenes'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    fs.writeFileSync(path.join(OUT, ALL ? 'outstage_all.json' : 'outstage_demo.json'), JSON.stringify(rows));
  });
}
