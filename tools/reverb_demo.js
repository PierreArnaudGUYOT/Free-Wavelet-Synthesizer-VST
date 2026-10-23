// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Version 1.0.16: the web demo rendered offline through the real audio worklet (web/js/worklet.js, run without a browser as tools/demo_sim.js runs it: the page sends each scene 0.6 s ahead
// with the song time of its chord, the audio thread makes the change at the chord), the preset changes made as app.js finalValues makes them (a hidden or performance setting stays as it is,
// then the demo's rules), with the Classic reverb's performance settings given here. It measures the reverb's level: the same piece with every reverb off (fx_rmix 0) is subtracted, what
// is left is what the reverb adds; its loudness (BS.1770: K-weighting, 400 ms blocks, the two gates) over the piece and per scene, and its share of lows and highs, against the reverb of
// 1.0.15 (STEREO 0, PRE 0, DAMP 0.25, LOW CUT off, WIDTH 1). --wav writes the piece (16-bit stereo 48 kHz, TPDF dither) with the reverb of 1.0.15 (<prefix>-actuelle.wav) and with each setting tried
// (<prefix>-<name>.wav: --names gives one per setting; else -nouvelle when one is tried), and <prefix>-scenes.json (the scenes' times in the files, the measures).
//   node tools/reverb_demo.js --try "fx_rpre=0.02,fx_rdamp=0.35;fx_rhp=150" [--scenes] [--wav <prefix> [--names a,b]] [--ref "<k=v,...>"]   (--ref "": the defaults as the reference)
'use strict';
const fs = require('fs'), path = require('path');
const { fork } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(__dirname, 'out');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const sr = 48000, Q = 128, LEAD_IN = 0.25, SEND_LEAD = 0.6, TAIL = 3;
const OLD = 'fx_rstereo=0,fx_rpre=0,fx_rdamp=0.25,fx_rhp=20,fx_rwidth=1,fx_punch=0';   // the sound of 1.0.15 (the defaults are the improved reverb and PUNCH 50 % since 1.0.16)
const parseSet = (s) => { const o = {}; for (const kv of (s || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); o[k.trim()] = +v; } return o; };

if (args.includes('--render')) {
  // one render: --render <label> --set <k=v,...> [--dry]
  const SPEC = require(path.join(ROOT, 'web/js/spec.js')), CF = require(path.join(ROOT, 'web/js/core.js')), C = CF(SPEC), P = C.P, PARAMS = SPEC.PARAMS;
  const label = opt('--render'), set = parseSet(opt('--set', '')), DRY = args.includes('--dry');
  for (const k in set) if (!(k in P)) throw new Error('no parameter ' + k);
  global.WS_SPEC = SPEC;
  const evalGlobal = (file, name) => { global[name] = new Function(fs.readFileSync(path.join(ROOT, file), 'utf8') + '\nreturn ' + name + ';')(); };
  evalGlobal('web/js/demo_data.js', 'WS_DEMO_SONGS');
  evalGlobal('web/js/demo.js', 'WSDemo');
  const demo = WSDemo({ C, P, PARAMS });
  const song = WS_DEMO_SONGS[0], plan = demo.tourPlan();
  // the page's values: the defaults, the reverb's settings (performance settings: no preset changes them)
  let values = Float64Array.from(PARAMS, p => p.def);
  for (const k in set) values[P[k]] = set[k];
  const fit = (i, x) => { const p = PARAMS[i]; x = Math.min(p.max, Math.max(p.min, x)); return p.curve === 'int' || p.curve === 'choice' ? Math.round(x) : x; };
  const finalValues = (name) => {   // app.js finalValues with the preset's keyed values (demoPresetObj) and the demo's rules
    const src = (SPEC.DEMO_PRESETS || []).find(p => p.name === name) || SPEC.PRESETS.find(p => p.name === name);
    if (!src) throw new Error('no preset ' + name);
    const v = Float64Array.from(values);
    PARAMS.forEach((p, i) => { if (!p.hidden && !p.perf) v[i] = fit(i, src.values[i]); });
    demo.rules(name)((key, x) => { if (key in P) v[P[key]] = fit(P[key], x); }, key => v[P[key]]);
    if (DRY) v[P.fx_rmix] = 0;
    values = v;
    return v;
  };
  const SPEC_CORE = {}; for (const k of ['PARAMS', 'SLOTS', 'ROLES', 'LFO2_ROLE', 'LFO2_TARGETS', 'WAVELETS', 'CHORDS', 'CHORD_KEYS', 'MICRO', 'DELAY_BEATS', 'LFO_BEATS']) SPEC_CORE[k] = SPEC[k];
  global.WSCoreFactory = CF; global.sampleRate = sr; global.currentFrame = 0;
  global.AudioWorkletProcessor = class { constructor() { this.port = { postMessage() {}, onmessage: null }; } };
  global.registerProcessor = (n, c) => { global.WSProc = c; };
  new Function(fs.readFileSync(path.join(ROOT, 'web/js/worklet.js'), 'utf8') + ';WSWorkletMain();')();
  const proc = new global.WSProc({ processorOptions: { spec: SPEC_CORE } }), send = (m) => proc.port.onmessage({ data: m });
  const total = Math.ceil((LEAD_IN + song.duration + TAIL) * sr / Q) * Q, start = Math.round(LEAD_IN * sr);
  const v0 = finalValues(plan[0].preset);
  v0.forEach((x, i) => send({ t: 'p', i, v: x })); send({ t: 'tables', tables: C.buildTables(v0, true) });   // the first scene is in place before the piece starts
  send({ t: 'seq', notes: song.notes, delay: LEAD_IN });
  const out = new Float32Array(total * 2), o = [new Float32Array(Q), new Float32Array(Q)], sent = plan.map((s, i) => i === 0);
  for (let s = 0; s < total; s += Q) {
    global.currentFrame = s;
    const tSong = (s - start) / sr;
    for (let i = 1; i < plan.length; i++) if (!sent[i] && tSong >= plan[i].chord - SEND_LEAD) {
      sent[i] = true;
      const v = finalValues(plan[i].preset);
      send({ t: 'bulk', v: Array.from(v), tables: C.buildTables(v, true), at: plan[i].chord });
    }
    o[0].fill(0); o[1].fill(0);
    proc.process([[]], [o]);
    for (let j = 0; j < Q; j++) { out[2 * (s + j)] = o[0][j]; out[2 * (s + j) + 1] = o[1][j]; }
  }
  fs.writeFileSync(path.join(OUT, `reverb_demo_${label}.f32`), Buffer.from(out.buffer));
  fs.writeFileSync(path.join(OUT, `reverb_demo_${label}.json`), JSON.stringify({ chords: plan.map(s => s.chord), names: plan.map(s => s.preset), start }));
  process.exit(0);
}

// ---- the measures
function biquad(b0, b1, b2, a1, a2) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }; }
function rbj(type, f0) {
  const w = 2 * Math.PI * f0 / sr, cs = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
  return type === 'lp' ? biquad((1 - cs) / 2 / a0, (1 - cs) / a0, (1 - cs) / 2 / a0, -2 * cs / a0, (1 - al) / a0)
    : biquad((1 + cs) / 2 / a0, -(1 + cs) / a0, (1 + cs) / 2 / a0, -2 * cs / a0, (1 - al) / a0);
}
const kStage = () => { const s1 = biquad(1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585), s2 = biquad(1, -2, 1, -1.99004745483398, 0.99007225036621); return (x) => s2(s1(x)); };
// K-weighted squares of a stereo signal (interleaved), per sample (L² + R²)
function kSquares(x) { const kl = kStage(), kr = kStage(), n = x.length / 2, e = new Float64Array(n); for (let i = 0; i < n; i++) { const l = kl(x[2 * i]), r = kr(x[2 * i + 1]); e[i] = l * l + r * r; } return e; }
function integrated(e) {
  const B = 0.4 * sr, H = 0.1 * sr, z = [];
  for (let s = 0; s + B <= e.length; s += H) { let a = 0; for (let i = s; i < s + B; i++) a += e[i]; z.push(a / B); }
  const lk = (m) => -0.691 + 10 * Math.log10(m);
  const g1 = z.filter(m => lk(m) > -70), rel = lk(g1.reduce((a, b) => a + b, 0) / g1.length) - 10, g2 = g1.filter(m => lk(m) > rel);
  return lk(g2.reduce((a, b) => a + b, 0) / g2.length);
}
const db = (x) => 10 * Math.log10(Math.max(x, 1e-30));
function bands(x) {   // the share of the energy under 200 Hz and over 4 kHz (dB against the whole)
  const lpL = [rbj('lp', 200), rbj('lp', 200)], hpL = [rbj('hp', 4000), rbj('hp', 4000)], lpR = [rbj('lp', 200), rbj('lp', 200)], hpR = [rbj('hp', 4000), rbj('hp', 4000)];
  let all = 0, lo = 0, hi = 0;
  for (let i = 0; i < x.length / 2; i++) {
    const l = x[2 * i], r = x[2 * i + 1];
    all += l * l + r * r;
    const a = lpL[1](lpL[0](l)), b = lpR[1](lpR[0](r)), c = hpL[1](hpL[0](l)), d = hpR[1](hpR[0](r));
    lo += a * a + b * b; hi += c * c + d * d;
  }
  return { lo: db(lo / all), hi: db(hi / all) };
}

if (!args.includes('--try')) { console.error('usage: node tools/reverb_demo.js --try "k=v,...;k=v,..." [--scenes] [--wav <prefix>]'); process.exit(1); }
const tries = opt('--try').split(';').map(s => s.trim());
const REF = opt('--ref', OLD);   // the reference (--ref "" = the defaults, for a test of another setting than the reverb's)
const jobs = [{ label: 'dry', set: '', dry: true }, { label: 'ref', set: REF }].concat(tries.map((s, i) => ({ label: 't' + i, set: s })));
fs.mkdirSync(OUT, { recursive: true });
let done = 0;
for (const j of jobs) {
  fork(__filename, ['--render', j.label, '--set', j.set].concat(j.dry ? ['--dry'] : [])).on('exit', (code) => {
    if (code) { console.error('render failed: ' + j.label); process.exit(1); }
    if (++done === jobs.length) report();
  });
}

function report() {
  const read = (label) => new Float32Array(new Uint8Array(fs.readFileSync(path.join(OUT, `reverb_demo_${label}.f32`))).buffer);
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'reverb_demo_ref.json'), 'utf8'));
  const dry = read('dry'), rows = [];
  const scenesOf = (e) => meta.chords.map((c, k) => { const a = meta.start + Math.round(c * sr), b = k + 1 < meta.chords.length ? meta.start + Math.round(meta.chords[k + 1] * sr) : e.length; let s = 0; for (let i = a; i < b; i++) s += e[i]; return db(s / (b - a)); });
  for (const j of jobs.slice(1)) {
    const full = read(j.label), wet = new Float32Array(full.length);
    let peak = 0;
    for (let i = 0; i < full.length; i++) { wet[i] = full[i] - dry[i]; peak = Math.max(peak, Math.abs(full[i])); }
    const eW = kSquares(wet);
    rows.push({ j, full, peak, lufs: integrated(kSquares(full)), wet: integrated(eW), band: bands(wet), scenes: scenesOf(eW) });
  }
  const ref = rows[0];
  console.log(`the demo: ${meta.names.length} scenes, ${(dry.length / 2 / sr).toFixed(1)} s; the piece without reverb ${integrated(kSquares(dry)).toFixed(2)} LUFS`);
  for (const r of rows) {
    const d = r.wet - ref.wet;
    console.log(`${(r.j.label === 'ref' ? (REF === OLD ? 'reverb of 1.0.15' : 'reference: ' + (REF || 'the defaults')) : r.j.set).padEnd(78)} piece ${r.lufs.toFixed(2)} LUFS (${(r.lufs - ref.lufs >= 0 ? '+' : '') + (r.lufs - ref.lufs).toFixed(2)})  reverb ${r.wet.toFixed(2)} LUFS (${(d >= 0 ? '+' : '') + d.toFixed(2)} LU)  lows<200 ${r.band.lo.toFixed(1)} dB  highs>4k ${r.band.hi.toFixed(1)} dB  peak ${r.peak.toFixed(3)}`);
    if (args.includes('--scenes') && r !== ref) {
      const ds = r.scenes.map((x, k) => x - ref.scenes[k]).filter(Number.isFinite).sort((a, b) => a - b);
      console.log(`    per scene, reverb against 1.0.15 (dB): lowest ${ds[0].toFixed(2)}, median ${ds[ds.length >> 1].toFixed(2)}, highest ${ds[ds.length - 1].toFixed(2)}`);
    }
  }
  const prefix = opt('--wav', '');
  if (prefix) {
    const names = opt('--names', '').split(',');
    for (const r of rows) writeWav(r.j.label === 'ref' ? `${prefix}-actuelle.wav` : `${prefix}-${names[+r.j.label.slice(1)] || (tries.length === 1 ? 'nouvelle' : r.j.label)}.wav`, r.full);
    // the scenes (their time in the files) and the measures, for a listening page
    fs.writeFileSync(`${prefix}-scenes.json`, JSON.stringify({ scenes: meta.chords.map((c, k) => ({ t: +(meta.start / sr + c).toFixed(3), name: meta.names[k] })),
      levels: rows.map(r => ({ set: r.j.set, piece: +r.lufs.toFixed(2), reverb: +r.wet.toFixed(2), lows: +r.band.lo.toFixed(1), highs: +r.band.hi.toFixed(1) })) }, null, 1));
  }
  for (const j of jobs) for (const ext of ['f32', 'json']) fs.unlinkSync(path.join(OUT, `reverb_demo_${j.label}.${ext}`));
}

function writeWav(file, x) {
  const n = x.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let seed = 22222;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767 + rnd() - rnd()))), 44 + 2 * i);
  fs.writeFileSync(file, buf);
  console.log(`wrote ${file} (${(buf.length / 1048576).toFixed(1)} MB)`);
}
