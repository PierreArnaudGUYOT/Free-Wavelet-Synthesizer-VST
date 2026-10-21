// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Beta 0.3.1: the loudness of the presets against the soft limiter, measured the way EVALUATE SOUNDS plays them. Every preset of tools/presets_lfo3.js is rendered
// with the listening rules (16 voices, normal octave, no glide, attack <= 80 ms, short echoes) on the passage of the evaluation (3.5 s of Beethoven, then a C minor
// chord C3 G3 C4 Eb4 G4 held 2 s), and the same passage again 12 dB lower and scaled back up: the difference is what the limiter (the knee at 0.7) did to the sound. A pad
// with unison and chorus that plays five notes adds up beyond the knee and saturates; its master volume goes down by whole dB until the difference is small.
//   node tools/supermod/gain.js                  report only (how many presets saturate, by how much they must go down)
//   node tools/supermod/gain.js --apply          writes the new master values into tools/presets_lfo3.js (presets numbered 501 and up)
//   node tools/supermod/gain.js --first 201      the presets of the file from this number (default 501)
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.join(__dirname, '..', 'presets_lfo3.js');
const THRESH = +arg('thresh', 0.004), MAXDOWN = 14, PROCS = +arg('procs', 20), FIRST = +arg('first', 501), LIMIT = +arg('limit', 0);   // limit: a test run, this many presets per process

if (process.argv[2] === '--worker') {
  const part = +arg('worker', 0), of = +arg('of', 1);
  const lab = require('../preset_lab.js'), A = require('./audit.js');
  const { C, P, sr, SPEC } = lab;
  const vm = require('vm');
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'js', 'demo_data.js'), 'utf8') + ';this.songs = WS_DEMO_SONGS;', sandbox);
  const song = sandbox.songs[0], START = 12.9, LEN = 3.5, CHORD_LEN = 2, notes = [];
  for (let i = 0; i < song.notes.length; i += 4) {
    const t = song.notes[i];
    if (t < START || t >= START + LEN) continue;
    notes.push([t - START, Math.min(song.notes[i + 1], START + LEN - t), song.notes[i + 2], song.notes[i + 3]]);
  }
  const t0 = notes[0][0], ev = [];
  for (const [t, d, n, v] of notes) ev.push([t - t0, n, v], [t - t0 + d, n, 0]);
  for (const n of [48, 55, 60, 63, 67]) ev.push([LEN + 0.4, n, 0.7], [LEN + 0.4 + CHORD_LEN, n, 0]);
  ev.sort((a, b) => a[0] - b[0] || (a[2] > 0) - (b[2] > 0));
  const TOTAL = LEN + 0.4 + CHORD_LEN + 1.6;
  const render = (values) => {
    const params = Float64Array.from(values);
    params[P.v_voices] = 16; params[P.v_oct] = 0; params[P.v_glide] = 0;   // the listening rules of EVALUATE SOUNDS
    if (params[P.amp_a] > 0.08) params[P.amp_a] = 0.08;
    if (params[P.fx_dmix] > 0.1) params[P.fx_dmix] = 0.1;
    if (params[P.fx_dfb] > 0.3) params[P.fx_dfb] = 0.3;
    const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
    eng.vol = Math.exp(params[P.master] * (Math.LN10 / 20));
    eng.setTables(C.buildTables(params, true));
    const n = Math.round(TOTAL * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128;
    let e = 0;
    for (let s = 0; s < n; s += blk) {
      while (e < ev.length && ev[e][0] * sr < s + blk) { if (ev[e][2] > 0) eng.noteOn(ev[e][1], ev[e][2]); else eng.noteOff(ev[e][1]); e++; }
      eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s));
    }
    return { L, R, n };
  };
  const mp = SPEC.PARAMS[P.master];
  // how much the limiter changed the sound: the passage at the master value, against the same 12 dB lower and scaled back up
  const dist = (values) => {
    const low = Math.max(mp.min, values[P.master] - 12), gain = Math.pow(10, (values[P.master] - low) / 20);
    const a = render(values), v2 = values.slice(); v2[P.master] = low;
    const b = render(v2);
    let d = 0, en = 0, peak = 0;
    for (let i = Math.round(0.05 * sr); i < a.n; i++) { const x = a.L[i], y = b.L[i] * gain; d += (x - y) * (x - y); en += x * x; peak = Math.max(peak, Math.abs(a.L[i]), Math.abs(a.R[i])); }
    return { d: en > 0 ? Math.sqrt(d / en) : 0, peak };
  };
  const list = require(FILE);
  const out = [];
  list.forEach((p, i) => {
    if (i % of !== part || parseInt(p.name, 10) < FIRST || (LIMIT && out.length >= LIMIT)) return;
    const values = A.fullValues(p.v);
    let m = dist(values), down = 0;
    const d0 = m.d, peak0 = m.peak;
    while (m.d > THRESH && down < MAXDOWN && values[P.master] - 1 >= mp.min) { values[P.master] -= 1; down++; m = dist(values); }
    out.push({ name: p.name, cat: p.cat, d0, peak0, down, d: m.d, master: values[P.master] });
  });
  fs.writeFileSync(path.join(__dirname, '..', 'out', `gain_${part}.json`), JSON.stringify(out));
  process.exit(0);
}

fs.mkdirSync(path.join(__dirname, '..', 'out'), { recursive: true });
let done = 0;
const t0 = Date.now();
for (let k = 0; k < PROCS; k++) fork(__filename, ['--worker', String(k), '--of', String(PROCS), '--first', String(FIRST), '--thresh', String(THRESH), '--procs', String(PROCS), '--limit', String(LIMIT)]).on('exit', () => { if (++done === PROCS) report(); });
function report() {
  let rows = [];
  for (let k = 0; k < PROCS; k++) { const f = path.join(__dirname, '..', 'out', `gain_${k}.json`); rows = rows.concat(JSON.parse(fs.readFileSync(f, 'utf8'))); fs.unlinkSync(f); }
  rows.sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10));
  const sat = rows.filter(r => r.down > 0 || r.d0 > THRESH);
  console.log(`${rows.length} presets measured in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${sat.length} saturate on the evaluation passage (the limiter changes the sound by more than ${(THRESH * 100).toFixed(1)} %)`);
  const byCat = {};
  for (const r of rows) { const c = byCat[r.cat] = byCat[r.cat] || { n: 0, sat: 0, down: 0 }; c.n++; if (r.down > 0) { c.sat++; c.down += r.down; } }
  for (const [c, o] of Object.entries(byCat)) console.log(`  ${c.padEnd(16)} ${String(o.sat).padStart(3)} / ${String(o.n).padStart(3)} saturate, lowered by ${(o.sat ? o.down / o.sat : 0).toFixed(1)} dB on average`);
  const hist = {}; for (const r of sat) hist[r.down] = (hist[r.down] || 0) + 1;
  console.log('  lowered by (dB): ' + Object.entries(hist).map(([k, v]) => `${k}: ${v}`).join(', '));
  const stillBad = rows.filter(r => r.d > THRESH);
  if (stillBad.length) console.log(`  ${stillBad.length} still above the threshold after ${MAXDOWN} dB: ${stillBad.slice(0, 8).map(r => r.name.split(' ')[0]).join(' ')}`);
  if (process.argv.includes('--apply')) {
    let js = fs.readFileSync(FILE, 'utf8');
    const crlf = /\r\n/.test(js); js = js.replace(/\r\n/g, '\n');
    let n = 0;
    for (const r of rows) {
      if (!r.down) continue;
      // the preset's line:  { name: "NNN CFG · Title", ... v: {...,"master":X,...} },
      const key = JSON.stringify(r.name), at = js.indexOf('{ name: ' + key);
      if (at < 0) continue;
      const end = js.indexOf('} },', at), seg = js.slice(at, end);
      const m = /"master":(-?[\d.]+)/.exec(seg);
      const nv = Math.round(r.master * 10) / 10;
      const seg2 = m ? seg.replace(m[0], `"master":${nv}`) : seg.replace(/v: \{/, `v: {"master":${nv},`);
      js = js.slice(0, at) + seg2 + js.slice(end); n++;
    }
    fs.writeFileSync(FILE, crlf ? js.replace(/\n/g, '\r\n') : js);
    console.log(`master values lowered in tools/presets_lfo3.js for ${n} presets`);
  }
}
