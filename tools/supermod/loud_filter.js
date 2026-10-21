// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The loudness gates of the presets of the filter batches (tools/presets_filter.js, 1401-1550, and tools/presets_fav.js, 1551-1650): the logic of tools/supermod/gain.js and
// tools/supermod/loud.js (which hard-code tools/presets_lfo3.js) on the file given, in whole dB of master volume:
//   1. the evaluation passage (EVALUATE SOUNDS: 3.5 s of Beethoven then the C minor chord, the listening rules: 16 voices, normal octave, no glide, attack <= 80 ms, short echoes) is
//      rendered at the preset's master volume and again 12 dB lower, scaled back up: the difference is what the output stage (soft limiter, knee 0.7) did to the sound. Above
//      0.4 % the master goes down by whole dB until it is not (gain.js);
//   2. five loud chords at velocity 1 (triads at C4, C5, C6, a five-note and a six-note chord), rendered 18 dB lower and scaled back: the peak the voices sum to before the output
//      stage. Above the target (1.0) the master goes down by whole dB (loud.js; the loud-chord crackle of beta 0.3.2).
//   node tools/supermod/loud_filter.js --file tools/presets_filter.js            the report (how many presets are lowered by which rule)
//   node tools/supermod/loud_filter.js --file tools/presets_filter.js --apply    writes the new master values into the file
//   const { peakOf, passageDist } = require('./loud_filter.js')                  the two measures on a full parameter array (used by tools/supermod/filter_build.js)
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const CHORDS = [[60, 64, 67], [72, 76, 79], [84, 88, 91], [72, 76, 79, 84, 88], [60, 64, 67, 72, 76, 79]], VEL = 1;
const THRESH = 0.004, MAXDOWN = 14;

let ctx = null;
function init() {
  if (ctx) return ctx;
  const lab = require('../preset_lab.js'), { C, P, sr, SPEC } = lab, vm = require('vm');
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
  ctx = { C, P, sr, SPEC, ev, TOTAL: LEN + 0.4 + CHORD_LEN + 1.6, mp: SPEC.PARAMS[P.master] };
  return ctx;
}
function passage(values) {   // the evaluation passage with the listening rules
  const { C, P, sr, ev, TOTAL } = init();
  const params = Float64Array.from(values);
  params[P.v_voices] = 16; params[P.v_oct] = 0; params[P.v_glide] = 0;
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
}
// how much the output stage changed the passage (relative RMS of the difference with the same passage 12 dB lower, scaled back), and its peak
function passageDist(values) {
  const { P, sr, mp } = init();
  const low = Math.max(mp.min, values[P.master] - 12), gain = Math.pow(10, (values[P.master] - low) / 20);
  const a = passage(values), v2 = Array.from(values); v2[P.master] = low;
  const b = passage(v2);
  let d = 0, en = 0, peak = 0;
  for (let i = Math.round(0.05 * sr); i < a.n; i++) { const x = a.L[i], y = b.L[i] * gain; d += (x - y) * (x - y); en += x * x; peak = Math.max(peak, Math.abs(a.L[i]), Math.abs(a.R[i])); }
  return { d: en > 0 ? Math.sqrt(d / en) : 0, peak };
}
function chordPeak(values, notes) {
  const { C, P, sr } = init();
  const params = Float64Array.from(values);
  const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
  eng.vol = Math.exp(params[P.master] * (Math.LN10 / 20));
  eng.setTables(C.buildTables(params, true));
  const hold = 1.6, n = Math.round(2.4 * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128, offAt = Math.round(hold * sr / blk) * blk;
  let pk = 0;
  for (let s = 0; s < n; s += blk) {
    if (s === 0) for (const k of notes) eng.noteOn(k, VEL);
    if (s === offAt) for (const k of notes) eng.noteOff(k);
    eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s));
    for (let i = s; i < Math.min(s + blk, n); i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  }
  return pk;
}
// the peak the loudest of the five chords reaches before the output stage at the preset's own master volume (measured 18 dB lower, scaled back)
function peakOf(values) {
  const { P, mp } = init();
  const low = Math.max(mp.min, values[P.master] - 18), gain = Math.pow(10, (values[P.master] - low) / 20), v2 = Array.from(values); v2[P.master] = low;
  let worst = 0;
  for (const ch of CHORDS) worst = Math.max(worst, chordPeak(v2, ch) * gain);
  return worst;
}
// the two rules in turn: -> { values (master lowered), downGain, downLoud, d0, peak0, peak }
function gate(values, target = 1.0) {
  const { P, mp } = init();
  const v = Array.from(values), m0 = passageDist(v);
  let m = m0, downGain = 0;
  while (m.d > THRESH && downGain < MAXDOWN && v[P.master] - 1 >= mp.min) { v[P.master] -= 1; downGain++; m = passageDist(v); }
  const peak0 = peakOf(v);
  const downLoud = peak0 > target ? Math.min(12, Math.ceil(20 * Math.log10(peak0 / target) - 1e-9)) : 0;
  v[P.master] = Math.max(mp.min, v[P.master] - downLoud);
  return { values: v, downGain, downLoud, d0: m0.d, d: m.d, peak0, peak: downLoud ? peakOf(v) : peak0 };
}
module.exports = { peakOf, passageDist, gate };

if (require.main === module) {
  const FILE = path.resolve(arg('file', path.join(__dirname, '..', 'presets_filter.js'))), PROCS = +arg('procs', 8), TARGET = +arg('target', 1.0);
  const OUT = path.join(__dirname, '..', 'out');
  if (process.argv.includes('--worker')) {
    const part = +arg('worker', 0), of = +arg('of', 1), A = require('./audit.js');
    const list = require(FILE), out = [];
    list.forEach((p, i) => {
      if (i % of !== part) return;
      const values = A.fullValues(p.v), g = gate(values, TARGET), P = init().P;
      out.push({ name: p.name, cat: p.cat, downGain: g.downGain, downLoud: g.downLoud, d0: g.d0, d: g.d, peak0: g.peak0, peak: g.peak, master: g.values[P.master] });
    });
    fs.writeFileSync(path.join(OUT, `loudf_${part}.json`), JSON.stringify(out));
    process.exit(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  let done = 0;
  const t0 = Date.now();
  for (let k = 0; k < PROCS; k++) fork(__filename, ['--worker', String(k), '--of', String(PROCS), '--file', FILE, '--target', String(TARGET)]).on('exit', () => { if (++done === PROCS) report(); });
  const report = () => {
    let rows = [];
    for (let k = 0; k < PROCS; k++) { const f = path.join(OUT, `loudf_${k}.json`); rows = rows.concat(JSON.parse(fs.readFileSync(f, 'utf8'))); fs.unlinkSync(f); }
    rows.sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10));
    const g1 = rows.filter(r => r.downGain > 0), g2 = rows.filter(r => r.downLoud > 0);
    console.log(`${path.basename(FILE)}: ${rows.length} presets in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${g1.length} lowered by the evaluation-passage rule (limiter share > ${(THRESH * 100).toFixed(1)} %), ${g2.length} by the loud-chord rule (peak > ${TARGET} before the output stage), ${rows.filter(r => r.downGain || r.downLoud).length} lowered in all`);
    const hist = {}; for (const r of rows) { const k = r.downGain + r.downLoud; if (k) hist[k] = (hist[k] || 0) + 1; }
    console.log('  lowered by (dB): ' + Object.entries(hist).map(([k, v]) => `${k}: ${v}`).join(', '));
    const bad = rows.filter(r => r.d > THRESH || r.peak > TARGET + 1e-6);
    if (bad.length) console.log(`  ${bad.length} still above a limit: ${bad.slice(0, 8).map(r => r.name.split(' ')[0]).join(' ')}`);
    const pk = rows.map(r => r.peak).sort((a, b) => a - b);
    console.log(`  loud-chord peaks after: median ${pk[pk.length >> 1].toFixed(2)}, max ${pk[pk.length - 1].toFixed(2)}`);
    if (process.argv.includes('--apply')) {
      let js = fs.readFileSync(FILE, 'utf8');
      const crlf = /\r\n/.test(js); js = js.replace(/\r\n/g, '\n');
      let n = 0;
      for (const r of rows) {
        if (!r.downGain && !r.downLoud) continue;
        const at = js.indexOf('{ name: ' + JSON.stringify(r.name));
        if (at < 0) continue;
        const end = js.indexOf('} },', at), seg = js.slice(at, end), m = /"master":(-?[\d.]+)/.exec(seg), nv = Math.round(r.master * 10) / 10;
        js = js.slice(0, at) + (m ? seg.replace(m[0], `"master":${nv}`) : seg.replace(/v: \{/, `v: {"master":${nv},`)) + js.slice(end); n++;
      }
      fs.writeFileSync(FILE, crlf ? js.replace(/\n/g, '\r\n') : js);
      console.log(`master values lowered in ${path.basename(FILE)} for ${n} presets`);
    }
  };
}
