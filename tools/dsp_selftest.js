// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer self-test of the reference DSP core (web/js/core.js).
// Usage: node tools/dsp_selftest.js [--wav]   (WAV files go to build/test-audio/)
'use strict';
const fs = require('fs');
const path = require('path');
const SPEC = require('../web/js/spec.js');
const C = require('../web/js/core.js')(SPEC);

const root = path.join(__dirname, '..');
const writeWav = process.argv.includes('--wav');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };

function wav(file, L, R, sr) {
  const n = L.length, buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(L[i], 44 + i * 8); buf.writeFloatLE(R[i], 48 + i * 8); }
  fs.writeFileSync(file, buf);
}

console.log('1. perfect reconstruction (periodic DWT)');
const r = C.rng(42), x = new Float64Array(C.N);
for (let i = 0; i < C.N; i++) x[i] = r() * 2 - 1;
C.FILTERS.forEach((f, wi) => {
  const y = C.idwt(C.dwt(x, f), f);
  let err = 0; for (let i = 0; i < C.N; i++) err = Math.max(err, Math.abs(y[i] - x[i]));
  let e1 = 0, e2 = 0; const c = C.dwt(x, f); for (let i = 0; i < C.N; i++) { e1 += x[i] * x[i]; e2 += c[i] * c[i]; }
  check(err < 1e-9 && Math.abs(e1 - e2) / e1 < 1e-9, `${SPEC.WAVELETS[wi].name}: max err ${err.toExponential(2)}, energy ratio ${(e2 / e1).toFixed(12)}`);
});

console.log('2. Haar: one cycle of a square wave is a single atom');
{
  const sq = C.sourceCycle(1, 0.5), c = C.dwt(sq, C.FILTERS[0]);
  let nz = 0; for (let i = 0; i < C.N; i++) if (Math.abs(c[i]) > 1e-12) nz++;
  check(nz === 1 && Math.abs(c[1]) > 1, `non-zero coefficients: ${nz} (c[1] = ${c[1].toFixed(3)})`);
}

console.log('3. engine A layers sum back to the source');
{
  const p = C.defaults(); p[C.P.engine] = 0; p[C.P.a_wave] = 0; p[C.P.wavelet] = 3;
  const tb = C.buildTables(p, false), src = C.sourceCycle(0, 0.5);
  let err = 0; for (let i = 0; i < C.N; i++) err = Math.max(err, Math.abs(tb.layers[C.DRY][i] - src[i]));
  check(err < 1e-7, `dry layer vs source (coefficients below 1e-9 of max are zeroed) max err ${err.toExponential(2)}`);
}

console.log('4. band-limited mips contain no harmonics above their limit');
{
  const p = C.defaults(); p[C.P.engine] = 0; p[C.P.a_wave] = 0; p[C.P.wavelet] = 0;
  const t0 = Date.now(); const tb = C.buildTables(p, true); const ms = Date.now() - t0;
  let worst = 0;
  for (let m = 0; m < C.NMIP; m++) {
    const H = 1024 >> m, re = new Float64Array(C.N), im = new Float64Array(C.N);
    for (let i = 0; i < C.N; i++) re[i] = tb.mips[m * C.TW + i * C.NL + C.DRY];
    C.fft(re, im, false);
    let inB = 0, outB = 0;
    for (let h = 1; h < C.N / 2; h++) { const e = re[h] * re[h] + im[h] * im[h]; if (h <= H) inB += e; else outB += e; }
    worst = Math.max(worst, outB / (inB + 1e-30));
  }
  check(worst < 1e-12, `worst out-of-band energy ratio ${worst.toExponential(2)}; table build ${ms} ms`);
}

console.log('5. scale filter gains');
{
  const g = C.filterGains(0, 5, 24, 0, new Float64Array(11));
  check(g[0] > 0.99 && g[3] > 0.95 && g[6] < 0.08 && g[10] < 1e-4, 'low-pass cutoff 5: ' + Array.from(g).map(v => v.toFixed(3)).join(' '));
  const h = C.filterGains(1, 5, 24, 0, new Float64Array(11));
  check(h[10] > 0.99 && h[0] < 1e-3, 'high-pass cutoff 5: ' + Array.from(h).map(v => v.toFixed(3)).join(' '));
  const rz = C.filterGains(0, 5, 24, 12, new Float64Array(11));
  check(rz[4] > 2, 'resonance boosts the cutoff band: ' + rz[4].toFixed(2));
}

console.log('6. render every factory preset (C4 + chord, 48 kHz)');
const sr = 48000;
if (writeWav) fs.mkdirSync(path.join(root, 'build', 'test-audio'), { recursive: true });
let totalMs = 0, totalSec = 0;
SPEC.PRESETS.forEach((pr, pi) => {
  const params = Float64Array.from(pr.values);
  const eng = new C.Engine(sr);
  params.forEach((v, i) => eng.setParam(i, v));
  eng.setTables(C.buildTables(params, true));
  const secs = 4, n = sr * secs, L = new Float32Array(n), R = new Float32Array(n);
  const blk = 128;
  const t0 = process.hrtime.bigint();
  for (let o = 0; o < n; o += blk) {
    const t = o / sr;
    if (o === 0) eng.noteOn(60, 0.9);
    if (o === sr * 0.75 - (sr * 0.75) % blk) eng.noteOff(60);
    if (o === sr * 1.0 - (sr * 1.0) % blk) { eng.noteOn(57, 0.8); eng.noteOn(64, 0.8); eng.noteOn(67, 0.8); eng.noteOn(48, 0.8); }
    if (o === sr * 2.2 - (sr * 2.2) % blk) eng.allNotesOff();
    const l = L.subarray(o, o + blk), rr = R.subarray(o, o + blk);
    eng.process(l, rr, Math.min(blk, n - o));
    void t;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  totalMs += ms; totalSec += secs;
  let peak = 0, nan = 0, tail = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (!isFinite(a) || !isFinite(b)) nan++; peak = Math.max(peak, a, b); }
  for (let i = n - sr / 10; i < n; i++) tail = Math.max(tail, Math.abs(L[i]), Math.abs(R[i]));
  check(nan === 0 && peak > 0.05 && peak < 1.2, `${pr.name.padEnd(20)} peak ${peak.toFixed(3)}  tail ${tail.toExponential(1)}  ${(ms / secs / 10).toFixed(1)}% CPU (1 core)`);
  if (writeWav) wav(path.join(root, 'build', 'test-audio', `${String(pi + 1).padStart(2, '0')}_${pr.name.replace(/[^A-Za-z0-9]+/g, '_')}.wav`), L, R, sr);
});
console.log(`  average real-time load ${(totalMs / totalSec / 10).toFixed(1)}% of one core for 4 voices`);

console.log('7. aliasing: saw at C7 (2093 Hz), engine A, filter open');
{
  const p = C.defaults(); p[C.P.engine] = 0; p[C.P.a_wave] = 0; p[C.P.wavelet] = 0; p[C.P.f_cutoff] = 11; p[C.P.amp_s] = 1;
  const eng = new C.Engine(sr); p.forEach((v, i) => eng.setParam(i, v)); eng.setTables(C.buildTables(p, true));
  eng.noteOn(96, 1);
  const n = 8192, L = new Float32Array(n * 2), R = new Float32Array(n * 2);
  eng.process(L, R, n * 2);
  const re = new Float64Array(C.N), im = new Float64Array(C.N);
  // 2048-point Hann-windowed spectrum of the steady state
  for (let i = 0; i < C.N; i++) { const a = 2 * Math.PI * i / C.N, w = 0.35875 - 0.48829 * Math.cos(a) + 0.14128 * Math.cos(2 * a) - 0.01168 * Math.cos(3 * a); re[i] = L[n + i] * w; }
  C.fft(re, im, false);
  const f0 = 440 * Math.pow(2, (96 - 69) / 12);
  let harm = 0, alias = 0;
  for (let k = 1; k < C.N / 2; k++) {
    const f = k * sr / C.N; if (f > 19000) break;
    const e = re[k] * re[k] + im[k] * im[k];
    const hn = f / f0, dist = Math.abs(hn - Math.round(hn)) * f0;
    if (dist < 5 * sr / C.N) harm += e; else alias += e;
  }
  const db = 10 * Math.log10(alias / harm);
  check(db < -50, `in-band alias/harmonic energy ${db.toFixed(1)} dB`);
}

console.log('8. SOURCE PHASE (beta 0.4)');
{
  // the source of beta 0.3, copied here: phase 0 must give exactly the same samples
  const oldSource = (wave, width) => {
    const x = new Float64Array(C.N), r = C.rng(12345);
    for (let i = 0; i < C.N; i++) {
      const ph = i / C.N;
      switch (wave) {
        case 0: x[i] = 1 - 2 * ph; break;
        case 1: x[i] = ph < 0.5 ? 1 : -1; break;
        case 2: x[i] = ph < width ? 1 : -1; break;
        case 3: x[i] = ph < width ? -1 + 2 * ph / width : 1 - 2 * (ph - width) / (1 - width); break;
        case 4: x[i] = Math.sin(2 * Math.PI * ph); break;
        default: x[i] = r() * 2 - 1; break;
      }
    }
    let mean = 0; for (let i = 0; i < C.N; i++) mean += x[i]; mean /= C.N;
    let peak = 0; for (let i = 0; i < C.N; i++) { x[i] -= mean; peak = Math.max(peak, Math.abs(x[i])); }
    if (peak > 0) for (let i = 0; i < C.N; i++) x[i] /= peak;
    return x;
  };
  let same = true;
  for (let w = 0; w <= 5; w++) for (const width of [0.02, 0.2, 0.5, 0.77, 0.98]) {
    const a = oldSource(w, width), b = C.sourceCycle(w, width, 0), c = C.sourceCycle(w, width);
    for (let i = 0; i < C.N; i++) if (a[i] !== b[i] || a[i] !== c[i]) same = false;
  }
  check(same, 'phase 0 is the source of beta 0.3, bit for bit (6 waves x 5 widths)');
  // Haar saw with band 6 removed: harmonic magnitudes at phase 37/2048 against phase 0 (a Fourier filter: 0 dB)
  const band6Removed = ph => {
    const f = C.FILTERS[0], c = C.dwt(C.sourceCycle(0, 0.5, ph), f);
    for (let i = 32; i < 64; i++) c[i] = 0;
    const re = C.idwt(c, f), im = new Float64Array(C.N);
    C.fft(re, im, false);
    const m = new Float64Array(C.N / 2 + 1);
    for (let h = 0; h <= C.N / 2; h++) m[h] = Math.hypot(re[h], im[h]) / C.N;
    return m;
  };
  const a0 = band6Removed(0), a1 = band6Removed(37 / 2048);
  let worst = 0;
  for (let h = 1; h <= 200; h++) if (a0[h] > 1e-4) worst = Math.max(worst, Math.abs(20 * Math.log10((a1[h] + 1e-12) / a0[h])));
  check(worst > 10, `Haar saw, band 6 removed: phase 37/2048 changes a harmonic by ${worst.toFixed(1)} dB (> 10)`);
  // the noise cycle moves by whole samples; a whole turn is phase 0
  const n0 = C.sourceCycle(5, 0.5, 0), nq = C.sourceCycle(5, 0.5, 0.25);
  let ne = 0; for (let i = 0; i < C.N; i++) ne = Math.max(ne, Math.abs(nq[i] - n0[(i + 512) % C.N]));
  check(ne < 1e-12, `noise at phase 0.25 = the noise cycle moved by 512 samples (max err ${ne.toExponential(1)})`);
  const s1 = C.sourceCycle(2, 0.3, 1), s0 = C.sourceCycle(2, 0.3, 0);
  check(s1.every((v, i) => v === s0[i]), 'phase 1 (a whole turn) is phase 0');
  // LFO 2 -> SOURCE PHASE: the engine-A tables at the other PHASE_K - 1 positions, only when needed
  const p = C.defaults(); p[C.P.engine] = 0; p[C.P.ab_mix] = 0; p[C.P.wavelet] = 0; p[C.P.f_cutoff] = 5;
  p[C.P.lfo2_target] = SPEC.LFO2_TARGETS.indexOf(C.P.a_phase);
  const off = C.buildTables(p, true);
  p[C.P.lfo2_amt] = 0.5;
  const t0 = Date.now(), on = C.buildTables(p, true), ms = Date.now() - t0;
  check(!off.ph && on.ph && on.ph.length === C.PHASE_K - 1, `LFO 2 -> PHASE builds ${on.ph ? on.ph.length : 0} more table sets (amount 0: none) in ${ms} ms`);
}

console.log('9. no stuck note when a preset changes VOICES while a key is held (beta 0.4 fix)');
{
  const byName = n => SPEC.PRESETS.find(p => p.name === n).values;
  const load = (eng, vals) => { vals.forEach((v, i) => eng.setParam(i, v)); eng.setTables(C.buildTables(Float64Array.from(vals), true)); };
  const run = (eng, secs) => { const n = 128, L = new Float32Array(n), R = new Float32Array(n); let pk = 0;
    for (let b = 0; b < secs * sr / n; b++) { eng.process(L, R, n); for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); } return pk; };
  const poly = byName('A · Warm Pad'), mono = byName('A · Acid Sub');   // VOICES 8 / VOICES 1 (beta 0.5)
  check(poly[C.P.v_voices] > 1 && mono[C.P.v_voices] === 1, 'test presets: one polyphonic, one mono');
  // poly -> mono between note on and note off: before the fix the second voice was never released
  let eng = new C.Engine(sr); load(eng, poly);
  eng.noteOn(60, 0.8); eng.noteOn(64, 0.8); run(eng, 0.3);
  load(eng, mono); eng.noteOff(60); eng.noteOff(64);
  const pk1 = run(eng, 6);
  check(eng.voices.every(v => !v.active), `poly -> mono, then note off: every voice ends (peak ${pk1.toExponential(1)} while released)`);
  // mono -> poly -> mono: the mono list of held keys forgets a key released under the poly preset
  eng = new C.Engine(sr); load(eng, mono);
  eng.noteOn(60, 0.8); run(eng, 0.2);
  load(eng, poly); eng.noteOff(60); run(eng, 1);
  load(eng, mono); eng.noteOn(67, 0.8); run(eng, 0.2); eng.noteOff(67); run(eng, 6);
  check(eng.stack.length === 0 && eng.voices.every(v => !v.active), `mono -> poly -> mono: no key left held (list ${JSON.stringify(eng.stack)}), every voice ends`);
  // normal mono legato is unchanged: releasing the top key goes back to the key still held
  eng = new C.Engine(sr); load(eng, mono);
  eng.noteOn(48, 0.8); run(eng, 0.1); eng.noteOn(55, 0.8); run(eng, 0.1); eng.noteOff(55);
  check(eng.voices[0].gate && eng.voices[0].note === 48, `mono legato: back to the key still held (note ${eng.voices[0].note})`);
}

console.log('10. tempo sync of the delay and the LFOs (beta 0.6)');
{
  const P = C.P, eng = new C.Engine(sr), DN = SPEC.PARAMS[P.fx_ddiv].choices, LN = SPEC.PARAMS[P.lfo_div].choices;
  const set = o => { for (const [k, v] of Object.entries(o)) eng.setParam(P[k], v); };
  set({ fx_dtime: 0.35, fx_dsync: 1, fx_ddiv: DN.indexOf('1/8 D'), lfo_rate: 4, lfo_sync: 1, lfo_div: LN.indexOf('1/4') });
  check(eng.delaySec() === 0.35 && eng.lfoHz(P.lfo_sync, P.lfo_div, P.lfo_rate) === 4,
    'no tempo (the web app): SYNC changes nothing, TIME 0.35 s and RATE 4 Hz stay');
  eng.setTempo(120);
  check(Math.abs(eng.delaySec() - 0.375) < 1e-12, `120 BPM, 1/8 D: the delay is ${eng.delaySec()} s (0.375)`);
  check(Math.abs(eng.lfoHz(P.lfo_sync, P.lfo_div, P.lfo_rate) - 2) < 1e-12, '120 BPM, 1/4: LFO 1 at 2 Hz');
  set({ fx_ddiv: DN.indexOf('1/16 T') }); eng.setTempo(100);
  check(Math.abs(eng.delaySec() - 0.1) < 1e-12, `100 BPM, 1/16 T: ${eng.delaySec().toFixed(4)} s (0.1)`);
  set({ fx_ddiv: DN.indexOf('1/1') }); eng.setTempo(30);
  check(eng.delaySec() === 4, `30 BPM, 1/1 (8 s) is held at the 4 s maximum (${eng.delaySec()} s)`);
  set({ lfo2_sync: 1, lfo2_div: LN.indexOf('4/1'), lfo2_rate: 1 }); eng.setTempo(60);
  check(Math.abs(eng.lfoHz(P.lfo2_sync, P.lfo2_div, P.lfo2_rate) - 1 / 16) < 1e-12, '60 BPM, 4/1: LFO 2 at 1/16 Hz (four bars)');
  set({ fx_dsync: 0, lfo_sync: 0, lfo2_sync: 0 });
  check(eng.delaySec() === 0.35 && eng.lfoHz(P.lfo_sync, P.lfo_div, P.lfo_rate) === 4 && eng.lfoHz(P.lfo2_sync, P.lfo2_div, P.lfo2_rate) === 1,
    'SYNC off at a tempo: the seconds and hertz of the knobs');
  check(DN.length === 14 && LN.length === 16 && SPEC.PARAMS[P.fx_dsync].def === 0 && SPEC.PARAMS[P.lfo_sync].def === 0 && SPEC.PARAMS[P.lfo2_sync].def === 0,
    '14 delay and 16 LFO note values; every SYNC off by default');
  // the delay line holds 4 s: a 1/1 echo at 60 BPM comes 4 s after the note
  const e2 = new C.Engine(sr), p2 = C.defaults();
  p2[P.fx_dsync] = 1; p2[P.fx_ddiv] = DN.indexOf('1/1'); p2[P.fx_dmix] = 1; p2[P.fx_dfb] = 0; p2[P.amp_d] = 0.05; p2[P.amp_s] = 0; p2[P.amp_r] = 0.02;
  p2.forEach((v, i) => e2.setParam(i, v)); e2.setTables(C.buildTables(p2, true)); e2.setTempo(60);
  e2.setSampleRate(sr);   // the delay line starts at its synced length
  const n = Math.ceil(4.4 * sr / 128) * 128, L = new Float32Array(n), R = new Float32Array(n);
  for (let o = 0; o < n; o += 128) { if (o === 0) e2.noteOn(60, 0.9); if (o === 2432) e2.noteOff(60); e2.process(L.subarray(o, o + 128), R.subarray(o, o + 128), 128); }
  let dry = 0; for (let i = 0; i < 0.2 * sr; i++) dry = Math.max(dry, Math.abs(L[i]));
  let at = -1; for (let i = Math.round(0.3 * sr); i < n && at < 0; i++) if (Math.abs(L[i]) > 0.3 * dry) at = i / sr;
  check(Math.abs(at - 4) < 0.01, `60 BPM, 1/1: the first echo after ${at.toFixed(3)} s (4 s)`);
}

console.log('11. chord compensation and ring-buffer reads (beta 0.7.1)');
{
  const prep = (name) => {
    const pr = SPEC.PRESETS.find(q => q.name === name), e = new C.Engine(sr);
    pr.values.forEach((v, i) => e.setParam(i, v)); e.setTables(C.buildTables(pr.values, true)); e.setSampleRate(sr);
    return e;
  };
  const L = new Float32Array(128), R = new Float32Array(128);
  // three voices: the gain never leaves 1 (three equal voices once summed to nv = 3.0000000000000004)
  let e = prep('B · Theatre Organ'), min = 1;
  for (const k of [60, 64, 67]) e.noteOn(k, 0.9);
  for (let o = 0; o < sr; o += 128) { e.process(L, R, 128); min = Math.min(min, e.polyG); }
  check(min === 1, `3 notes: the compensation stays exactly 1 (lowest ${min})`);
  // six voices: sqrt(3/6) after the attack, with no step from one block to the next larger than the smoothing allows
  e = prep('B · Church Organ');
  for (const k of [48, 55, 60, 64, 67, 72]) e.noteOn(k, 0.9);
  let prev = 1, step = 0;
  for (let o = 0; o < sr; o += 128) { e.process(L, R, 128); step = Math.max(step, Math.abs(e.polyG - prev)); prev = e.polyG; }
  check(Math.abs(e.polyG - Math.sqrt(0.5)) < 1e-6, `6 notes: the compensation settles at sqrt(3/6) (${e.polyG.toFixed(6)})`);
  // 20 ms going down: at most 12.5 % of the 0.29 gap per 128 samples (0.037)
  check(step < 0.04, `6 notes: smooth (largest change per 128 samples ${step.toFixed(4)})`);
  // released: it stays down while the six tails sound together, then is exactly 1 once no voice sounds
  for (const k of [48, 55, 60, 64, 67, 72]) e.noteOff(k);
  let downWhileTails = true;
  for (let o = 0; o < 6 * sr && e.voices.some(v => v.active); o += 128) { e.process(L, R, 128); if (e.voices.some(v => v.active) && e.polyG > 0.75) downWhileTails = false; }
  e.process(L, R, 128);
  check(downWhileTails && e.polyG === 1 && !e.voices.some(v => v.active), `released: no swell of the six tails, then exactly 1 with no voice (${e.polyG})`);
  for (const k of [48, 55, 60, 64, 67, 72]) e.noteOn(k, 0.9);
  for (let o = 0; o < 0.2 * sr; o += 128) e.process(L, R, 128);
  e.allSoundOff();
  check(e.polyG === 1, 'allSoundOff (panic) puts the compensation back to 1');
  // B · Music Box: a 0.28 s delay is 13440.000000000002 samples at 48 kHz; the read just before the write position rounded to
  // the end of the line (one sample past it: NaN for ever in beta 0.7). Five seconds pass the 4.1 s line once.
  e = prep('B · Music Box');
  e.noteOn(60, 0.9);
  let finite = true;
  for (let o = 0; o < 5 * sr && finite; o += 128) { e.process(L, R, 128); for (let i = 0; i < 128; i++) if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) finite = false; }
  check(finite, 'B · Music Box (delay 0.28 s at 48 kHz): no NaN over a whole turn of the delay line');
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
