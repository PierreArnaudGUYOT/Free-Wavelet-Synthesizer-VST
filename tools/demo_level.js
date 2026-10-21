// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Version 1.0: the level of the web demo. The demo plays Beethoven's Appassionata with every note at velocity 1 and 16 voices, through the presets of the tour (WS_SPEC.DEMO_PRESETS, web/js/demo.js:
// the presets are set as in enterScene). This tool renders the 4 s each preset plays (song time 4 k to 4 k + 4) with the engine, with the master lowered by each trim in turn, and measures what
// the output stage (the peak guard and the soft limiter) adds: the same window 24 dB lower, scaled back up, is the clean reference (`d` = relative RMS of the difference), and the share of
// the time the output goes above the limiter's knee (0.7).
//   node tools/demo_level.js                   trims 0 -3 -6 -9 -12 dB, a table per trim
//   node tools/demo_level.js --trims 0,-6      other trims
//   node tools/demo_level.js --all --window 13 every preset of the factory list (the plug-in's) plays one window of the piece, here the densest (4 s from 4 x 13 s), the demo's way
'use strict';
const path = require('path');
const { fork } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const TRIMS = arg('trims', '0,-3,-6,-9,-12').split(',').map(Number), PROCS = +arg('procs', 12), STEP = 4, TAIL = 0.6, ALL = process.argv.includes('--all'), WIN = +arg('window', 13);

function load() {
  const fs = require('fs');
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
  const P = C.P, sr = 48000, mp = SPEC.PARAMS[P.master];
  const out = [];
  const LIST = process.env.DEMOSET ? SPEC.DEMO_PRESETS : SPEC.PRESETS;   // (DEMOSET=1 with --all: the presets of the demo's tour on that one window)
  const items = ALL ? LIST.map((p, i) => [p.name, i]) : SPEC.TOUR.map((n, k) => [n, k]);
  items.forEach(([name, idx]) => {
    const k = ALL ? WIN : idx;
    if (ALL ? idx % of !== part : (k < 2 || k % of !== part)) return;
    const pr = ALL ? LIST[idx] : SPEC.DEMO_PRESETS.find(p => p.name === name) || SPEC.PRESETS.find(p => p.name === name);
    const base = Float64Array.from(pr.values);
    // as demo.js enterScene: polyphonic, normal octave, no glide, short attack, little delay
    base[P.v_voices] = 16; base[P.v_oct] = 0; base[P.v_glide] = 0;
    if (base[P.amp_a] > 0.08) base[P.amp_a] = 0.08;
    if (base[P.fx_dmix] > 0.1) base[P.fx_dmix] = 0.1;
    if (base[P.fx_dfb] > 0.3) base[P.fx_dfb] = 0.3;
    const t0 = k * STEP, n = Math.round((STEP + TAIL) * sr), blk = 128;
    const ev = [];   // [sample, on?, note, vel]
    for (let i = 0; i < song.notes.length; i += 4) {
      const on = song.notes[i], off = on + song.notes[i + 1];
      if (off <= t0 || on >= t0 + STEP) continue;
      ev.push([Math.max(0, Math.round((on - t0) * sr)), 1, song.notes[i + 2], song.notes[i + 3]]);
      ev.push([Math.min(n - 1, Math.round((off - t0) * sr)), 0, song.notes[i + 2], 0]);
    }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const render = (master) => {
      const params = Float64Array.from(base); params[P.master] = master;
      const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
      eng.vol = Math.exp(master * (Math.LN10 / 20));
      eng.setTables(C.buildTables(params, true));
      const L = new Float32Array(n), R = new Float32Array(n);
      let e = 0;
      for (let s = 0; s < n; s += blk) {
        while (e < ev.length && ev[e][0] < s + blk) { if (ev[e][1]) eng.noteOn(ev[e][2], ev[e][3]); else eng.noteOff(ev[e][2]); e++; }
        eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s));
      }
      return { L, R };
    };
    const m0 = base[P.master], low = Math.max(mp.min, m0 - 30);
    const ref = render(low);
    for (const trim of TRIMS) {
      const master = Math.max(mp.min, m0 + trim), gain = Math.pow(10, (master - low) / 20), a = render(master);
      let d = 0, en = 0, over = 0, cnt = 0, peak = 0;
      const i0 = Math.round(0.05 * sr);
      for (let i = i0; i < n; i++) {
        for (const [x, y] of [[a.L[i], ref.L[i] * gain], [a.R[i], ref.R[i] * gain]]) {
          d += (x - y) * (x - y); en += x * x; peak = Math.max(peak, Math.abs(y)); if (Math.abs(x) > 0.7) over++; cnt++;
        }
      }
      out.push({ k, name, trim, d: en > 0 ? Math.sqrt(d / en) : 0, over: over / cnt, peak, master });
    }
  });
  require('fs').writeFileSync(path.join(__dirname, 'out', `demo_level_${part}.json`), JSON.stringify(out));
  process.exit(0);
}

const fs = require('fs');
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
let done = 0; const t0 = Date.now();
for (let w = 0; w < PROCS; w++) {
  fork(__filename, ['--worker', String(w), '--of', String(PROCS), '--trims', TRIMS.join(',')].concat(ALL ? ['--all', '--window', String(WIN)] : [])).on('exit', () => {
    if (++done < PROCS) return;
    let rows = [];
    for (let k = 0; k < PROCS; k++) { const f = path.join(__dirname, 'out', `demo_level_${k}.json`); rows = rows.concat(JSON.parse(fs.readFileSync(f, 'utf8'))); fs.unlinkSync(f); }
    console.log(`${new Set(rows.map(r => r.name)).size} ${ALL ? 'presets of the list' : 'tour presets'}, 4 s each, in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    console.log('trim dB | presets with output-stage distortion d above 2 % / 5 % / 10 % | median d | median time above the knee (0.7) | median peak before the output stage');
    for (const trim of TRIMS) {
      const r = rows.filter(x => x.trim === trim), med = (f) => { const v = r.map(f).sort((a, b) => a - b); return v[v.length >> 1]; };
      console.log(`${String(trim).padStart(5)}   | ${r.filter(x => x.d > 0.02).length} / ${r.filter(x => x.d > 0.05).length} / ${r.filter(x => x.d > 0.1).length} of ${r.length} | ${(100 * med(x => x.d)).toFixed(1)} % | ${(100 * med(x => x.over)).toFixed(0)} % | ${med(x => x.peak).toFixed(2)}`);
    }
    fs.writeFileSync(path.join(__dirname, 'out', 'demo_level.json'), JSON.stringify(rows));
  });
}
