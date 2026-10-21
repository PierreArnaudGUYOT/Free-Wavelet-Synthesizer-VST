// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The demo's preset changes against the chords of the piece, on the real audio worklet (web/js/worklet.js, run here without a browser, quantum after quantum), with a model of the page that
// sends them. It answers three questions: does the new sound start WITH the chord (when the change is made and when the output is fully up again, against the chord), does the change disturb the
// chord that starts (its level, its first 60 ms against the same chord on a preset that was in place long before, the click of the change), and does it cost the audio thread more at that
// moment (the longest quantum around the chord, against the 2.67 ms a quantum may take at 48 kHz).
//   node tools/demo_sim.js [--scenes 12] [--configs old:40,old:100,new] [--reps 3] [--fresh] [--table] [--dump 6] [--click 7] [--json]   (--json: the rows of every config as JSON, for tests/demo_sync.js)
// A config is a model of the page: "old:<ms>" = the page sends the change (one 'bulk' message) when its clock reaches the scene's time (the chord less 80 ms) plus a delay of <ms> (its
// clock runs late: the audio thread's reports arrive late, a frame is 16 ms, the main thread may be busy: version 1.0.7 and before); "new" = the page sends it 0.6 s ahead with `at`, the song
// time of the chord, and the audio thread makes the change at the chord (version 1.0.8; "new:<hold>:<up>:<morph>" overrides the constants of the scheduled dip, in render quanta of 128 samples).
// The reference ("ref") makes the change 0.35 s before the chord, so that the new sound is in place and settled when the chord starts. The runs of the configs are interleaved, repeated --reps
// times, and the cost of a quantum is the smallest of its repetitions (what the machine does at the same time only ever adds to a time). --fresh builds the tables when the message is sent
// (warm in the caches), else they are the ones of the previous run (cold).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SPEC = require(path.join(ROOT, 'web/js/spec.js')), CF = require(path.join(ROOT, 'web/js/core.js')), C = CF(SPEC), P = C.P;
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPS = +opt('--reps', 3), NSC = +opt('--scenes', 12), FIRST = +opt('--first', 1), FRESH = args.includes('--fresh');
const CONFIGS = opt('--configs', 'old:40,old:100,new').split(',').map(s => {
  const a = s.split(':');
  return a[0] === 'old' ? { label: `OLD (the page sends it at the scene's time + ${a[1] || 0} ms)`, model: 'old', delay: +(a[1] || 0) }
    : { label: a[1] ? `NEW (hold ${a[1]}, up ${a[2]}, morph ${a[3]} quanta)` : 'NEW (the audio thread makes the change at the chord)', model: 'new', hold: a[1], up: a[2], morph: a[3] };
});
const sr = 48000, Q = 128;

// the song and the plan of the tour (the same code as the page: WSDemo, which only reads its api when it runs)
global.WS_SPEC = SPEC;
const evalGlobal = (file, name) => { global[name] = new Function(fs.readFileSync(path.join(ROOT, file), 'utf8') + '\nreturn ' + name + ';')(); };
evalGlobal('web/js/demo_data.js', 'WS_DEMO_SONGS');
evalGlobal('web/js/demo.js', 'WSDemo');
const demo = WSDemo({ C, P, PARAMS: SPEC.PARAMS });
const song = WS_DEMO_SONGS[0], plan = demo.tourPlan();
const scenes = plan.map((s, i) => ({ k: i, name: s.preset, t: s.t, chord: s.chord !== undefined ? s.chord : s.t + 0.08 }));

// the values of a scene: the preset, then the demo's rules (polyphonic, normal octave, no glide, short attack, little delay, the trim that keeps the piece under the output stage)
const presetValues = (name) => {
  const src = SPEC.DEMO_PRESETS.find(p => p.name === name) || SPEC.PRESETS.find(p => p.name === name);
  if (!src) throw new Error('no preset ' + name);
  const v = Float64Array.from(src.values);
  v[P.v_voices] = 16; v[P.v_oct] = 0; v[P.v_glide] = 0;
  if (v[P.amp_a] > 0.08) v[P.amp_a] = 0.08;
  if (v[P.fx_dmix] > 0.1) v[P.fx_dmix] = 0.1;
  if (v[P.fx_dfb] > 0.3) v[P.fx_dfb] = 0.3;
  const trim = (SPEC.DEMO_TRIM || {})[name];
  if (trim) v[P.master] = Math.max(SPEC.PARAMS[P.master].min, v[P.master] - trim);
  return v;
};
let cache = {};
const sceneData = (sc) => (FRESH ? null : cache[sc.name]) || (cache[sc.name] = (() => { const v = presetValues(sc.name); return { v, tables: C.buildTables(v, true) }; })());
function SPEC_CORE() { const o = {}; for (const k of ['PARAMS', 'SLOTS', 'ROLES', 'LFO2_ROLE', 'LFO2_TARGETS', 'WAVELETS', 'CHORDS', 'CHORD_KEYS', 'MICRO', 'DELAY_BEATS', 'LFO_BEATS']) o[k] = SPEC[k]; return o; }

// the real worklet (one class per config: the constants of the scheduled dip may differ)
global.WSCoreFactory = CF; global.sampleRate = sr; global.currentFrame = 0;
global.AudioWorkletProcessor = class { constructor() { this.port = { postMessage() {}, onmessage: null }; } };
global.registerProcessor = (n, c) => { global.WSProc = c; };
const wsrc0 = fs.readFileSync(path.join(ROOT, 'web/js/worklet.js'), 'utf8');
function workletClass(cfg) {
  let src = wsrc0;
  if (cfg && cfg.hold) src = src.replace(/const SCHED_UP = \d+, SCHED_HOLD = \d+, SCHED_MORPH = \d+;/, `const SCHED_UP = ${cfg.up}, SCHED_HOLD = ${cfg.hold}, SCHED_MORPH = ${cfg.morph};`);
  new Function(src + ';WSWorkletMain();')();
  return global.WSProc;
}

// one run of the first NSC scenes with a model of the page: 'ref' | 'old' | 'new'
function run(Proc, model, delayMs) {
  global.currentFrame = 0; if (FRESH) cache = {};
  const proc = new Proc({ processorOptions: { spec: SPEC_CORE() } }), send = (m) => proc.port.onmessage({ data: m });
  const sc = scenes.slice(0, Math.min(scenes.length, FIRST + NSC)), endT = sc[sc.length - 1].chord + 2.5, total = Math.round((0.25 + endT) * sr / Q) * Q;
  const L = new Float32Array(total), R = new Float32Array(total), qt = new Float64Array(total / Q);
  const start = Math.round(0.25 * sr), dips = [], applies = [];
  const d0 = sceneData(sc[0]); d0.v.forEach((x, i) => send({ t: 'p', i, v: x })); send({ t: 'tables', tables: d0.tables });   // the first scene is in place before the piece starts
  send({ t: 'seq', notes: song.notes, delay: 0.25 });
  const origApply = proc.startMorph.bind(proc);
  proc.startMorph = (...a) => { applies.push(global.currentFrame); return origApply(...a); };
  const sendAt = sc.map((s, i) => (i === 0 ? Infinity : model === 'ref' ? s.chord - 0.35 : model === 'new' ? s.chord - 0.6 : s.chord - 0.08 + delayMs / 1000));
  const sent = new Array(sc.length).fill(false);
  let prevDk = -1;
  const o = [new Float32Array(Q), new Float32Array(Q)];
  for (let s = 0, qi = 0; s < total; s += Q, qi++) {
    global.currentFrame = s;
    const tSong = (s - start) / sr;
    for (let i = 1; i < sc.length; i++) if (!sent[i] && tSong >= sendAt[i]) {
      sent[i] = true;
      const d = sceneData(sc[i]);
      send(model === 'new' ? { t: 'bulk', v: Array.from(d.v), tables: d.tables, at: sc[i].chord } : { t: 'bulk', v: Array.from(d.v), tables: d.tables });
    }
    o[0].fill(0); o[1].fill(0);
    const t0 = process.hrtime.bigint();
    proc.process([[]], [o]);
    qt[qi] = Number(process.hrtime.bigint() - t0) / 1e6;
    if (prevDk < 0 && proc.dk >= 0) dips.push({ start: s, hold: proc.hold });
    if (prevDk >= 0 && proc.dk < 0 && dips.length) dips[dips.length - 1].end = s + Q;
    prevDk = proc.dk;
    L.set(o[0], s); R.set(o[1], s);
  }
  return { L, R, qt, start, dips, applies, sc };
}

// the measures around each chord
const at = (r, t) => r.start + Math.round(t * sr);
function rmsErr(a, b, i0, i1) { let e = 0, n = 0; for (let i = i0; i < i1; i++) { e += (a.L[i] - b.L[i]) ** 2 + (a.R[i] - b.R[i]) ** 2; n += b.L[i] ** 2 + b.R[i] ** 2; } return n > 0 ? 10 * Math.log10(e / n) : -Infinity; }
function d2peak(r, i0, i1) { let m = 0, at0 = i0; for (let i = Math.max(2, i0); i < i1; i++) { const d = Math.max(Math.abs(r.L[i] - 2 * r.L[i - 1] + r.L[i - 2]), Math.abs(r.R[i] - 2 * r.R[i - 1] + r.R[i - 2])); if (d > m) { m = d; at0 = i; } } return { m, i: at0 }; }
function rmsOf(r, i0, i1) { let e = 0; for (let i = i0; i < i1; i++) e += r.L[i] ** 2 + r.R[i] ** 2; return Math.sqrt(e / (2 * (i1 - i0))); }
function quantile(a, q) { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const med = (a) => quantile(a.filter(Number.isFinite), 0.5), mx = (a) => Math.max(...a.filter(Number.isFinite)), mn = (a) => Math.min(...a.filter(Number.isFinite));
function measure(r, ref) {
  const rows = [];
  for (let i = 1; i < r.sc.length; i++) {
    const c = at(r, r.sc[i].chord), w60 = Math.round(0.06 * sr);
    // the change of this scene: the dip that starts nearest before the chord, and the moment the change is made (the first silent quantum)
    const dip = r.dips.filter(d => d.start < c + 0.5 * sr).pop(), applied = r.applies.filter(fr => fr <= c + 0.5 * sr).pop();
    const lvl = rmsOf(ref, c, c + w60);
    const ck = d2peak(r, c - Math.round(0.1 * sr), c + Math.round(0.15 * sr)), ckR = d2peak(ref, c - Math.round(0.1 * sr), c + Math.round(0.15 * sr));
    const q0 = Math.floor((c - w60) / Q), q1 = Math.floor((c + w60) / Q), hs = dip ? Math.floor(dip.start / Q) + 2 : -9, he = hs + (dip && dip.hold ? dip.hold : 3);
    let qmax = 0, qaud = 0;   // the longest quantum near the chord, and the longest that is not one of the silent quanta of the change (an overrun there is inaudible)
    for (let q = q0; q <= q1; q++) { qmax = Math.max(qmax, r.qt[q]); if (!(q >= hs && q < he)) qaud = Math.max(qaud, r.qt[q]); }
    let gap = 0; for (let k = c - Math.round(0.1 * sr); k < c; k += 16) { let e = 0; for (let j = k; j < k + 16; j++) e += r.L[j] ** 2 + r.R[j] ** 2; if (Math.sqrt(e / 32) < lvl * 0.01) gap += 16; }
    rows.push({ name: r.sc[i].name, made: applied !== undefined ? (applied - c) / sr * 1000 : NaN, up: dip && dip.end !== undefined ? (dip.end - c) / sr * 1000 : NaN,
      err: rmsErr(r, ref, c, c + w60), att: 20 * Math.log10(rmsOf(r, c, c + Math.round(0.04 * sr)) / rmsOf(ref, c, c + Math.round(0.04 * sr))),
      click: ck.m, clickR: ckR.m, clickAt: (ck.i - c) / sr * 1000, clickRAt: (ckR.i - c) / sr * 1000, qmax, qaud, gapMs: gap / sr * 1000 });
  }
  return rows;
}
function report(label, r, ref) {
  const rows = measure(r, ref);
  console.log(`\n== ${label}`);
  console.log(`  change made at (ms from the chord): median ${f(med(rows.map(x => x.made)))}, from ${f(mn(rows.map(x => x.made)))} to ${f(mx(rows.map(x => x.made)))}`);
  console.log(`  new sound fully up at (ms from the chord): median ${f(med(rows.map(x => x.up)))}, from ${f(mn(rows.map(x => x.up)))} to ${f(mx(rows.map(x => x.up)))}`);
  console.log(`  level of the chord's first 40 ms against the settled sound (dB; 0 = as loud, negative = muffled by the dip): median ${f(med(rows.map(x => x.att)))}, lowest ${f(mn(rows.map(x => x.att)))}`);
  console.log(`  error of the chord's first 60 ms against the settled sound (dB, lower is better): median ${f(med(rows.map(x => x.err)))}, worst ${f(mx(rows.map(x => x.err)))}`);
  console.log(`  silent gap before the chord (ms): median ${f(med(rows.map(x => x.gapMs)))}, longest ${f(mx(rows.map(x => x.gapMs)))}`);
  console.log(`  click (largest second difference around the chord) / the reference's: worst ${f(mx(rows.map(x => x.click / x.clickR)), 2)}, median ${f(med(rows.map(x => x.click / x.clickR)), 2)}`);
  console.log(`  longest quantum within 60 ms of a chord (ms; a quantum must take less than 2.67): median ${f(med(rows.map(x => x.qmax)), 2)}, worst ${f(mx(rows.map(x => x.qmax)), 2)}; leaving out the silent quanta of the change: median ${f(med(rows.map(x => x.qaud)), 2)}, worst ${f(mx(rows.map(x => x.qaud)), 2)}`);
  const all = Array.from(r.qt).filter(x => x > 0);
  console.log(`  every quantum: mean ${f(all.reduce((a, b) => a + b, 0) / all.length, 3)} ms, p99 ${f(quantile(all, 0.99), 2)}, p99.9 ${f(quantile(all, 0.999), 2)}, max ${f(Math.max(...all), 2)}`);
  if (args.includes('--table')) rows.forEach((x, k) => console.log(`    ${String(k + 1).padStart(2)} ${x.name.padEnd(30)} made ${f(x.made).padStart(6)} up ${f(x.up).padStart(6)} level ${f(x.att).padStart(6)} dB click x${f(x.click / x.clickR, 2).padStart(6)} (at ${f(x.clickAt, 0)} ms; the reference's at ${f(x.clickRAt, 0)}) quantum ${f(x.qaud, 2)} ms`));
  if (opt('--dump', '')) {   // the cost of every quantum within 80 ms of the chord of one scene
    const i = +opt('--dump', '1'), c = at(r, r.sc[i].chord); let line = `  scene ${i}, ms from the chord: cost in ms  `;
    for (let q = Math.floor((c - Math.round(0.08 * sr)) / Q); q <= Math.floor((c + Math.round(0.08 * sr)) / Q); q++) line += ((q * Q - c) / sr * 1000).toFixed(0) + ':' + r.qt[q].toFixed(2) + ' ';
    console.log(line);
  }
  return rows;
}

const t00 = Date.now();
if (!args.includes("--json")) console.log(`demo_sim: ${scenes.length} scenes in the tour, the first ${NSC} changes after scene ${FIRST - 1}; ${REPS} repetitions${FRESH ? ', tables built when sent' : ''}`);
const classes = CONFIGS.map(c => (c.model === 'new' ? workletClass(c) : workletClass(null)));
const refCls = workletClass(null);
const ref = run(refCls, 'ref', 0);
const results = CONFIGS.map(() => null);
for (let k = 0; k < REPS; k++) CONFIGS.forEach((c, j) => {
  const r = run(classes[j], c.model, c.delay || 0);
  if (!results[j]) results[j] = r; else for (let i = 0; i < r.qt.length; i++) results[j].qt[i] = Math.min(results[j].qt[i], r.qt[i]);
});
if (args.includes('--json')) { console.log(JSON.stringify(CONFIGS.map((c, j) => ({ label: c.label, model: c.model, rows: measure(results[j], ref) })))); process.exit(0); }
const clickWhere = opt('--click', '');
CONFIGS.forEach((c, j) => { const rows = report(c.label, results[j], ref); if (clickWhere !== '') { const x = rows[+clickWhere - 1]; console.log(`  click of scene ${clickWhere} (${x.name}): ${x.click.toFixed(3)} at ${x.clickAt.toFixed(1)} ms from the chord; the reference's ${x.clickR.toFixed(3)} at ${x.clickRAt.toFixed(1)} ms`); } });
console.log(`\ndone in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
