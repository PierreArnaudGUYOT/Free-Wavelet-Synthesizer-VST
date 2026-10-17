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

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
