// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.6).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// DSP core (reference implementation).
// The same algorithm is ported 1:1 to C++ in vst/src/dsp.h.
// Used by the page (table building, displays), by the AudioWorklet (engine,
// via WSCoreFactory.toString()) and by Node tests (module.exports).
function WSCoreFactory(SPEC) {
  'use strict';

  const N = 2048;          // samples per cycle (2^11)
  const NB = 11;           // detail bands; band 1 = coarsest (fundamental), band 11 = finest
  const NL = 12;           // table layers: 11 bands + dry (engine A)
  const DRY = 11;
  const NMIP = 11;         // band-limited mip levels, mip m keeps harmonics 1..(1024 >> m)
  const TW = (N + 1) * NL; // floats per mip table (interleaved, +1 guard sample)
  const CTRL = 32;         // control-rate block
  const MAXV = 16;
  // SOURCE PHASE moved by LFO 2 (beta 0.4): the engine-A tables are also built at PHASE_K positions round the cycle
  // (phase + k / PHASE_K). 12 (30°) is not a power of two, so neighbouring positions differ in every band (a shift by a
  // multiple of 2^(12-b) samples would leave band b unchanged), and each extra position costs one more table set.
  const PHASE_K = 12;
  // SUPERMODULATION (Okto MultiWave Synth beta 0.2): the same idea for SPARSITY and SOURCE WIDTH of the subtractive oscillators,
  // moved by LFO 1 (sparsity) or LFO 2. The tables are built at SPARSE_K sparsities 0, 1/8 .. 1 (or WIDTH_K widths 0.02 .. 0.98)
  // and each voice crossfades between the two nearest; one kind of variant per oscillator (VK_*), see slotVariant.
  const SPARSE_K = 9, WIDTH_K = 9, VK_PHASE = 0, VK_SPARSITY = 1, VK_WIDTH = 2;
  const VK_N = [PHASE_K, SPARSE_K, WIDTH_K];
  const WIDTH_MIN = 0.02, WIDTH_MAX = 0.98;
  const BASS_GAIN = 1.4;    // the chord's bass note plays this much louder (about +3 dB)
  const QUICK_REL = 0.06;   // a chord note dropped by a live chord change fades out in at most this many seconds
  const LN1000 = Math.log(1000);
  const VOICE_GAIN = 0.4;   // about -8 dB per voice: headroom for chords
  const LIMIT_T = 0.7;      // output soft limiter: transparent below -3 dBFS, never above 0 dBFS
  // beta 0.3.2 (the crackle of a loud chord): in front of the soft limiter, a peak guard rides the output gain so that the signal that reaches the limiter never goes
  // past GUARD_T (the limiter's knee flattens a chord that sums to two or three times its knee into a buzz). Below GUARD_T the gain is exactly 1 (bit-identical with
  // the earlier versions); above it the gain falls with GUARD_ATT (s), is held for GUARD_HOLD (s) so that it does not ripple at the pitch of the sound, and comes back
  // with GUARD_REL (s).
  const GUARD_T = 0.9, GUARD_ATT = 0.0003, GUARD_HOLD = 0.015, GUARD_REL = 0.15;
  // Version 1.0.15: the look-ahead limiter (OUTPUT 'Limiter'). The output is delayed by LIM_LA (s); the gain each sample needs to stay under LIM_CEIL is held for the
  // B = D + 1 samples of the look-ahead plus LIM_HOLD (a running minimum: it does not ripple at the pitch of a bass), comes back with LIM_REL (s), and is averaged over B
  // samples, so it reaches the needed gain exactly when the peak leaves the delay: no sample ever goes past LIM_CEIL and no tanh colours the sound. Below the ceiling the
  // gain is exactly 1. 'Classic' (the guard + soft limiter of 1.0.14) goes through the same delay: the latency never changes.
  const LIM_LA = 0.0015, LIM_HOLD = 0.015, LIM_REL = 0.15, LIM_CEIL = 0.89;
  // beta 0.3.2 (the crackle of a loud chord): the presets' masters are set for about three notes; a denser chord drove the soft limiter into audible distortion (the same fix as
  // the Wavelet Synthesizer's beta 0.7.1). The voice sum is scaled by sqrt(POLY_FREE / n) when n > POLY_FREE voices sound (n weighted by their energy relative to the loudest one,
  // so release tails count little), smoothed: up to POLY_FREE voices nothing changes.
  const POLY_FREE = 3;
  const POLY_DOWN = 0.02, POLY_UP = 0.05;   // time constants (s) of the compensation going down / back up
  const CH_BASE = 0.006, CH_DEPTH = 0.003, CH_FAST = 9.7;   // chorus: base delay, sweep per unit of depth (s), fast/slow LFO ratio
  // the three chorus taps are 120 degrees apart: sin(a + 2*pi*c/3) = sin(a) * CH_COS[c] + cos(a) * CH_SIN[c]
  const CH_COS = [1, -0.5, -0.5], CH_SIN = [0, 0.8660254037844386, -0.8660254037844386];
  // an effect that has nothing left to give is skipped: no voice, and the output under QUIET_PEAK for a whole echo (see block)
  const QUIET_PEAK = 1e-9, QUIET_EXTRA = 4096;
  // the smoothing constants below are given per sample at 48 kHz (as in the earlier versions); other rates get the same time constant
  const rateCoef = (a48, sr) => (sr === 48000 ? a48 : 1 - Math.pow(1 - a48, 48000 / sr));
  const DLY_MAX = 4;   // beta 0.6: the longest delay (s): a whole note at 60 BPM (tempo sync)

  const P = {};
  SPEC.PARAMS.forEach((p, i) => { P[p.key] = i; });
  const NP = SPEC.PARAMS.length;

  // ------------------------------------------------------------ utilities
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  function toPlain(p, n) {
    n = Math.min(1, Math.max(0, n));
    switch (p.curve) {
      case 'exp': return p.min * Math.pow(p.max / p.min, n);
      case 'pow2': return p.min + (p.max - p.min) * n * n;
      case 'int': case 'choice': return p.min + Math.round(n * (p.max - p.min));
      default: return p.min + (p.max - p.min) * n;
    }
  }
  function toNorm(p, v) {
    v = Math.min(p.max, Math.max(p.min, v));
    switch (p.curve) {
      case 'exp': return Math.log(v / p.min) / Math.log(p.max / p.min);
      case 'pow2': return Math.sqrt((v - p.min) / (p.max - p.min));
      default: return (v - p.min) / (p.max - p.min);
    }
  }
  const sgn = (v, s) => (v > 0 ? '+' : v < 0 ? '−' : '') + s;
  function format(p, v) {
    switch (p.fmt) {
      case 'pct': return Math.round(v * 100) + '%';
      case 'bipct': return sgn(v, Math.abs(Math.round(v * 100)) + '%');
      case 'db': return (v >= 0 ? '' : '−') + Math.abs(v).toFixed(1) + ' dB';
      case 'dbband': return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + ' dB/band';
      case 'sec':
        if (p.curve === 'pow2' && v < 0.0005) return 'off';
        return v < 0.9995 ? (v * 1000).toFixed(v < 0.01 ? 1 : 0) + ' ms' : v.toFixed(2) + ' s';
      case 'hz': return v.toFixed(v < 1 ? 2 : 1) + ' Hz';
      case 'cents': return sgn(v, Math.abs(Math.round(v)) + ' ct');
      case 'band': return p.min < 0 ? sgn(v, Math.abs(v).toFixed(1) + ' bands') : 'band ' + v.toFixed(1);
      case 'int': return p.min < 0 ? sgn(Math.round(v), String(Math.abs(Math.round(v)))) : String(Math.round(v));
      case 'choice': return p.choices[Math.round(v)] || '';
      case 'deg': return Math.round(v * 360) + '°';
      case 'cyc': return '±' + Math.round(v * 360) + '°';
      case 'bandamt': return '±' + v.toFixed(1) + ' bands';
      case 'semi': return sgn(Math.round(v), Math.abs(Math.round(v)) + ' st');
      default: return v.toFixed(2);
    }
  }
  function parse(p, s) {
    if (p.fmt === 'choice') {
      const i = p.choices.findIndex(c => c.toLowerCase() === String(s).trim().toLowerCase());
      if (i >= 0) return i;
    }
    let t = String(s).replace('−', '-');
    if (p.fmt === 'sec' && /off/i.test(t)) return p.min;
    const m = /[-+]?[0-9]*.?[0-9]+/.exec(t);
    let v = m ? parseFloat(m[0]) : NaN;
    if (isNaN(v)) return null;
    switch (p.fmt) {
      case 'pct': case 'bipct': v /= 100; break;
      case 'deg': case 'cyc': v /= 360; break;
      case 'sec': if (/ms/i.test(t)) v /= 1000; break;
    }
    return Math.min(p.max, Math.max(p.min, v));
  }
  function defaults() { return SPEC.PARAMS.map(p => p.def); }
  // ------------------------------------------------------------ wavelets
  const FILTERS = SPEC.WAVELETS.map(w => {
    const L = w.h.length, h = Float64Array.from(w.h), g = new Float64Array(L);
    for (let n = 0; n < L; n++) g[n] = ((n & 1) ? -1 : 1) * h[L - 1 - n];
    return { h, g, L };
  });

  // Periodic orthogonal DWT, full depth. Output layout: c[0] = approximation,
  // band b (1..11) occupies c[2^(b-1) .. 2^b - 1] (band 11 = finest).
  function dwt(x, f) {
    const c = new Float64Array(N);
    let a = Float64Array.from(x), M = N;
    while (M > 1) {
      const half = M >> 1, na = new Float64Array(half);
      for (let k = 0; k < half; k++) {
        let sa = 0, sd = 0;
        for (let n = 0; n < f.L; n++) { const v = a[(2 * k + n) & (M - 1)]; sa += f.h[n] * v; sd += f.g[n] * v; }
        na[k] = sa; c[half + k] = sd;
      }
      a = na; M = half;
    }
    c[0] = a[0];
    return c;
  }
  function idwt(c, f) {
    let a = new Float64Array(1); a[0] = c[0];
    for (let M = 2; M <= N; M <<= 1) {
      const half = M >> 1, x = new Float64Array(M);
      for (let k = 0; k < half; k++) {
        const ak = a[k], dk = c[half + k];
        if (ak === 0 && dk === 0) continue;
        for (let n = 0; n < f.L; n++) { const i = (2 * k + n) & (M - 1); x[i] += f.h[n] * ak + f.g[n] * dk; }
      }
      a = x;
    }
    return a;
  }
  function bandOnly(c, b) {
    const o = new Float64Array(N), lo = 1 << (b - 1), hi = 1 << b;
    for (let i = lo; i < hi; i++) o[i] = c[i];
    return o;
  }

  // ------------------------------------------------------------ FFT (radix-2, N points)
  const rev = new Uint16Array(N), cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < 11; b++) if (i & (1 << b)) r |= 1 << (10 - b); rev[i] = r; }
  for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = Math.sin(2 * Math.PI * i / N); }
  function fft(re, im, inverse) {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step, wr = cosT[k], wi = inverse ? sinT[k] : -sinT[k];
          const a = i + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  // ------------------------------------------------------------ table building
  // SOURCE PHASE (beta 0.4): the wave is read at frac(i/N + phase), exactly (no interpolation); the noise cycle is shifted
  // by round(phase·N) whole samples. phase 0 gives the source of beta 0.3 bit for bit.
  // sin(2·pi·t) for t in [0, 1) from additions and multiplications only (a Taylor series after folding t into [0, 1/4]), so that this engine and the C++
  // one get the very same bits: Math.sin and std::sin differ in the last bit, and SPARSITY chooses between atoms of equal size (a sine analysed with a
  // long wavelet has many), so the last bit would keep other atoms: the web app and the plug-in would sound different (beta 0.2).
  function sinTurn(t) {
    let neg = false;
    if (t >= 0.5) { t -= 0.5; neg = true; }
    if (t > 0.25) t = 0.5 - t;
    const x = 2 * Math.PI * t, y = x * x;
    const s = x * (1 + y * (-1.6666666666666666e-1 + y * (8.333333333333333e-3 + y * (-1.984126984126984e-4 + y * (2.7557319223985893e-6 +
      y * (-2.505210838544172e-8 + y * (1.6059043836821613e-10 + y * (-7.647163731819816e-13 + y * (2.8114572543455206e-15 +
      y * (-8.22063524662433e-18 + y * (1.957294106339126e-20 + y * -3.868170170630684e-23)))))))))));
    return neg ? -s : s;
  }
  function fracT(t) { return t - Math.floor(t); }
  // Version 1.0.17: 20 more source waves, appended after NOISE (indices 6 .. 25) so that every older preset and project keeps its
  // wave. Only +, -, *, /, Math.floor and sinTurn (never Math.sin / cos / exp / pow / tanh): dsp.h computes the very same bits
  // with the same operations in the same order (SPARSITY picks atoms by size: a last-bit difference would change the sound).
  // None of them uses SOURCE WIDTH (only PULSE and TRI do); all follow SOURCE PHASE like the first five.
  function sourceCycle(wave, width, phase) {
    const x = new Float64Array(N);
    const r = rng(12345);
    const sh = phase || 0;
    for (let i = 0; i < N; i++) {
      let ph = i / N + sh; ph -= Math.floor(ph);
      switch (wave) {
        case 0: x[i] = 1 - 2 * ph; break;
        case 1: x[i] = ph < 0.5 ? 1 : -1; break;
        case 2: x[i] = ph < width ? 1 : -1; break;
        case 3: x[i] = ph < width ? -1 + 2 * ph / width : 1 - 2 * (ph - width) / (1 - width); break;
        case 4: x[i] = sinTurn(ph); break;
        // HALF SINE: the sine with its negative half cut (half-wave rectified)
        case 6: { const s = sinTurn(ph); x[i] = s > 0 ? s : 0; break; }
        // ABS SINE: |sin| with one arch per cycle (full-wave rectified at half the rate, so its pitch is the note's, not an octave up)
        case 7: x[i] = sinTurn(0.5 * ph); break;
        // SAW+SQR: the average of the saw and the square (the Juno mix)
        case 8: x[i] = 0.5 * ((1 - 2 * ph) + (ph < 0.5 ? 1 : -1)); break;
        // SHARK: an RC charge over 30 % of the cycle, then the discharge over 70 % (4th-power curves: steep at the start, flat at the end)
        case 9: {
          let y;
          if (ph < 0.3) { const w = 1 - ph / 0.3; y = 1 - w * w * w * w; } else { const w = 1 - (ph - 0.3) / 0.7; y = w * w * w * w; }
          x[i] = 2 * y - 1; break;
        }
        // TRAPEZOID: a triangle clipped at ± 0.5, scaled back to ± 1
        case 10: { const t = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; x[i] = 2 * (t > 0.5 ? 0.5 : t < -0.5 ? -0.5 : t); break; }
        // PARABOLA: two parabolic arches (+ then -), a rounded near-sine with soft odd harmonics (1/k^3)
        case 11: { const u = ph < 0.5 ? 4 * ph - 1 : 4 * ph - 3; x[i] = ph < 0.5 ? 1 - u * u : u * u - 1; break; }
        // STEP SAW: the saw in 4 steps
        case 12: x[i] = 1 - 2 * Math.floor(ph * 4) / 3; break;
        // STEP SINE: the sine held over 8 steps (the value at the middle of each step)
        case 13: x[i] = sinTurn((Math.floor(ph * 8) + 0.5) / 8); break;
        // SYNC 2.5 / SYNC 4.3: a saw at 2.5 / 4.3 times the note, restarted every cycle (hard sync); SYNC SQR: a square at 3.5 times
        case 14: x[i] = 1 - 2 * fracT(2.5 * ph); break;
        case 15: x[i] = 1 - 2 * fracT(4.3 * ph); break;
        case 16: x[i] = fracT(3.5 * ph) < 0.5 ? 1 : -1; break;
        // OCT SAW: the saw and the saw an octave up, averaged
        case 17: x[i] = 0.5 * ((1 - 2 * ph) + (1 - 2 * fracT(2 * ph))); break;
        // CLIP SINE: the sine driven x 3, clipped at ± 1 and rounded by the cubic soft clip 1.5 c - 0.5 c^3
        case 18: { let c = 3 * sinTurn(ph); c = c > 1 ? 1 : c < -1 ? -1 : c; x[i] = c * (1.5 - 0.5 * c * c); break; }
        // FM 1:1 / 2:1 / 3:1: a sine phase-modulated by a sine at 1 / 2 / 3 times the note; the index in turns (0.24 / 0.19 / 0.16 turn = 1.51 / 1.19 / 1.01 rad)
        case 19: x[i] = sinTurn(fracT(ph + 0.24 * sinTurn(ph))); break;
        case 20: x[i] = sinTurn(fracT(ph + 0.19 * sinTurn(fracT(2 * ph)))); break;
        case 21: x[i] = sinTurn(fracT(ph + 0.16 * sinTurn(fracT(3 * ph)))); break;
        // FORMANT: a sine at 5 times the note under a raised-cosine window over the first half of the cycle, silence after (a vowel-like
        // formant round harmonic 5, CZ / VOSIM-style)
        case 22: { if (ph < 0.5) { const w = sinTurn(ph); x[i] = w * w * sinTurn(fracT(5 * ph)); } else x[i] = 0; break; }
        // RESO SAW: a cosine at 6 times the note under a falling saw window, restarted every cycle (the CZ-101 "resonance" wave)
        case 23: x[i] = (1 - ph) * sinTurn(fracT(6 * ph + 0.25)); break;
        // ORGAN: the drawbars 8' + 4' + 2 2/3' (sines 1, 2, 3 at 1, 0.6, 0.4)
        case 24: x[i] = sinTurn(ph) + 0.6 * sinTurn(fracT(2 * ph)) + 0.4 * sinTurn(fracT(3 * ph)); break;
        // SAW STACK: saws at harmonics 1, 2, 3 at 1, 1/2, 1/3
        case 25: x[i] = (1 - 2 * ph) + 0.5 * (1 - 2 * fracT(2 * ph)) + (1 - 2 * fracT(3 * ph)) / 3; break;
        default: x[i] = r() * 2 - 1; break;   // NOISE (5)
      }
    }
    if (wave === 5) {
      const s = ((Math.round(sh * N) % N) + N) % N;
      if (s) { const y = Float64Array.from(x); for (let i = 0; i < N; i++) x[i] = y[(i + s) % N]; }
    }
    let mean = 0; for (let i = 0; i < N; i++) mean += x[i]; mean /= N;
    let peak = 0; for (let i = 0; i < N; i++) { x[i] -= mean; peak = Math.max(peak, Math.abs(x[i])); }
    if (peak > 0) for (let i = 0; i < N; i++) x[i] /= peak;
    return x;
  }

  // Keeps the K largest atoms, K = nz^(1-s), nz = number of non-zero atoms of this source,
  // so the knob acts over its whole range whatever the wave and wavelet.
  function sparsify(c, s) {
    let mx = 0; for (let i = 1; i < N; i++) mx = Math.max(mx, Math.abs(c[i]));
    const idx = [];
    for (let i = 1; i < N; i++) { if (Math.abs(c[i]) > mx * 1e-9) idx.push(i); else c[i] = 0; }
    const nz = idx.length;
    const K = Math.min(nz, s <= 0 ? nz : Math.max(1, Math.round(Math.pow(nz, 1 - s))));
    if (K < nz) {
      idx.sort((a, b) => (Math.abs(c[b]) - Math.abs(c[a])) || (a - b));
      for (let j = K; j < nz; j++) c[idx[j]] = 0;
    }
    return { K, nz };
  }

  function patternCoeffs(pattern, seed) {
    const c = new Float64Array(N);
    const r = rng((seed * 2654435761 + 12345) >>> 0);
    for (let b = 1; b <= NB; b++) {
      const n = 1 << (b - 1);
      for (let k = 0; k < n; k++) {
        let v;
        switch (pattern) {
          case 0: v = 1; break;                                   // Ramp
          case 1: v = b === 1 ? 1 : (k < n / 2 ? 1 : -1); break;  // Mirror
          case 2: v = (b & 1) ? 1 : -1; break;                    // Alternate
          case 3: v = (k & 1) ? -1 : 1; break;                    // Walsh
          case 4: v = k === 0 ? 1 : 0; break;                     // Impulse
          default: v = r() * 2 - 1; break;                        // Random
        }
        c[n + k] = v;
      }
    }
    return c;
  }

  // ------------------------------------------------------------ oscillators and table building
  // Three oscillators (A1 A2 subtractive, B1 additive; beta 0.3: B2 was removed); K[s] maps the fields of oscillator s to parameter indices (spec.js SLOTS).
  const SLOTS = SPEC.SLOTS, ROLES = SPEC.ROLES, LFO2_ROLE = SPEC.LFO2_ROLE;
  const NS = SLOTS.length;
  const K = SLOTS.map(s => s.k);
  const ROLE_PCEN = ROLES.indexOf('pcen'), ROLE_PHASE = ROLES.indexOf('phase'), ROLE_SPARSITY = ROLES.indexOf('sparsity'), ROLE_WIDTH = ROLES.indexOf('width'),
    ROLE_TILT = ROLES.indexOf('tilt'), ROLE_ODD = ROLES.indexOf('odd'), ROLE_EVEN = ROLES.indexOf('even'), ROLE_SUS = ROLES.indexOf('sus'),
    ROLE_MORPH = ROLES.indexOf('morph'), ROLE_FRES = ROLES.indexOf('fres'), ROLE_VFCUT = ROLES.indexOf('vfcut'), ROLE_VFRES = ROLES.indexOf('vfres');
  // the size of a move of LFO 2 / LFO 3 at full amount: half the range of its target in plain units; the filter cutoff is exponential: half its range in octaves
  function roleSpan(tp, role) { return role === ROLE_VFCUT ? Math.log2(tp.max / tp.min) : tp.max - tp.min; }
  const LVL_EPS = 1e-5;     // an oscillator whose smoothed level is below this is not rendered

  // Which oscillators the sound needs: bit s = oscillator s has a level above 0.
  function tableNeeds(params) {
    let m = 0;
    for (let s = 0; s < NS; s++) if (params[K[s].lvl] > 0) m |= 1 << s;
    return m;
  }
  // WAVELET MORPH (beta 0.3): the amounts that can move the sound away from WAVELET; an oscillator whose wavelet is WAVELET 2 has
  // nothing to morph to
  // the role LFO 2 moves now (-1: its amount is 0)
  function lfo2Role(params) { return params[P.lfo2_amt] !== 0 ? LFO2_ROLE[Math.round(params[P.lfo2_target])] : -1; }
  // beta 0.3: LFO 3, a second LFO like LFO 2 (the same roles; its move adds to LFO 2's when both aim at the same control)
  function lfo3Role(params) { return params[P.lfo3_amt] !== 0 ? LFO2_ROLE[Math.round(params[P.lfo3_target])] : -1; }
  function morphOn(params) {
    return params[P.wmorph] > 0 || params[P.lfo_wav] > 0 || params[P.env_wav] !== 0 || params[P.lfo_ew] > 0 || lfo2Role(params) === ROLE_MORPH || lfo3Role(params) === ROLE_MORPH;
  }
  function slotMorph(params, s) { return morphOn(params) && Math.round(params[P.wav2]) !== Math.round(params[K[s].wavelet]); }
  function morphNeeded(params) {
    for (let s = 0; s < NS; s++) if (params[K[s].lvl] > 0 && slotMorph(params, s)) return true;
    return false;
  }
  // SOURCE PHASE (beta 0.4), SPARSITY and SOURCE WIDTH (beta 0.2) moved by an LFO: a subtractive oscillator that plays gets its tables
  // built at several values (the kind of variant, VK_*, or -1 for none). One kind per oscillator: SPARSITY (LFO 1's amount above 0, or
  // LFO 2 / LFO 3 on SPARSITY) before PHASE (LFO 2 / 3) before WIDTH (LFO 2 / 3; only a pulse or triangle source has a width).
  function slotVariant(params, s) {
    if (SLOTS[s].mode !== 0 || !(params[K[s].lvl] > 0)) return -1;
    const r = lfo2Role(params), r3 = lfo3Role(params);
    if (params[P.lfo_sp] > 0 || r === ROLE_SPARSITY || r3 === ROLE_SPARSITY) return VK_SPARSITY;
    if (r === ROLE_PHASE || r3 === ROLE_PHASE) return VK_PHASE;
    if (r === ROLE_WIDTH || r3 === ROLE_WIDTH) { const w = Math.round(params[K[s].wave]); if (w === 2 || w === 3) return VK_WIDTH; }
    return -1;
  }
  function variantNeeded(params) {
    for (let s = 0; s < NS; s++) if (slotVariant(params, s) >= 0) return true;
    return false;
  }
  // the kinds of all oscillators in one number: the tables are rebuilt when it changes
  function variantSig(params) {
    let m = 0;
    for (let s = 0; s < NS; s++) m |= (slotVariant(params, s) + 1) << (2 * s);
    return m;
  }

  // Builds everything that depends only on structural parameters.
  // withMips=false is used by displays: the raw layers of the oscillator shown on the panel (osc_view).
  // withMips=true builds what the sound needs: { slots: [A1, A2, B1] } with, for each oscillator that plays,
  // { mode, mips, rms } (null: it does not play). WAVELET MORPH (beta 0.3): `w2` = the same oscillator built with WAVELET 2,
  // crossfaded with it in renderSlot. SOURCE PHASE moved by LFO 2 (beta 0.4): `ph` = the other PHASE_K - 1 phases of a
  // subtractive oscillator (also in w2).
  function buildTables(params, withMips) {
    if (!withMips) return buildSet(params, Math.round(params[P.osc_view]), false);
    const need = tableNeeds(params), out = { needs: need, slots: [] };
    for (let s = 0; s < NS; s++) {
      if (!(need & (1 << s))) { out.slots.push(null); continue; }
      const b = buildSet(params, s, true);
      const t = { mode: b.mode, mips: b.mips, rms: b.rms };
      if (slotMorph(params, s)) {
        const w = buildSet(params, s, true, { wavelet: params[P.wav2] });
        t.w2 = { mode: w.mode, mips: w.mips, rms: w.rms };
      }
      const vk = slotVariant(params, s);
      if (vk >= 0) {   // SOURCE PHASE / SPARSITY / SOURCE WIDTH moved by an LFO: the other sets of the variant (also for WAVELET 2)
        t.vk = vk; t.ph = variantSets(params, s, params[K[s].wavelet], vk);
        if (t.w2) { t.w2.vk = vk; t.w2.ph = variantSets(params, s, params[P.wav2], vk); }
      }
      out.slots.push(t);
    }
    return out;
  }
  // The other sets of a variant of subtractive oscillator s with wavelet wav. PHASE: phase a_phase + k / PHASE_K for k = 1 .. PHASE_K - 1
  // (set 0 is the oscillator's own). SPARSITY and WIDTH: the SPARSE_K sparsities k / (SPARSE_K - 1) and the WIDTH_K widths
  // WIDTH_MIN + k (WIDTH_MAX - WIDTH_MIN) / (WIDTH_K - 1), k = 0 .. K - 1 (all of them; the oscillator's own set is not one of them).
  function variantSets(params, s, wav, vk) {
    const sets = [];
    const first = vk === VK_PHASE ? 1 : 0;
    for (let k = first; k < VK_N[vk]; k++) {
      const over = { wavelet: wav };
      if (vk === VK_PHASE) { let v = params[K[s].phase] + k / PHASE_K; v -= Math.floor(v); over.phase = v; }
      else if (vk === VK_SPARSITY) over.sparsity = k / (SPARSE_K - 1);
      else over.width = WIDTH_MIN + k * (WIDTH_MAX - WIDTH_MIN) / (WIDTH_K - 1);
      const b = buildSet(params, s, true, over);
      sets.push({ mode: 0, mips: b.mips, rms: b.rms });
    }
    return sets;
  }
  // the set k of a table set t with variants (PHASE: k = 0 is t itself)
  function variantSet(t, k) { return t.vk === VK_PHASE ? (k === 0 ? t : t.ph[k - 1]) : t.ph[k]; }

  // over: { wavelet, phase, sparsity, width } replace the oscillator's own (the WAVELET MORPH set, the variants' sets)
  function buildSet(params, s, withMips, over) {
    const k = K[s], mode = SLOTS[s].mode;
    const f = FILTERS[Math.round(over && over.wavelet !== undefined ? over.wavelet : params[k.wavelet])];
    let c, kept = 0, nonzero = 0;
    const layers = [];
    const bandScale = new Float64Array(NB).fill(1);
    if (mode === 0) {
      const ph = over && over.phase !== undefined ? over.phase : params[k.phase];
      const src = sourceCycle(Math.round(params[k.wave]), over && over.width !== undefined ? over.width : params[k.width], ph);
      c = dwt(src, f);
      c[0] = 0;
      const sp = sparsify(c, over && over.sparsity !== undefined ? over.sparsity : params[k.sparsity]);
      kept = sp.K; nonzero = sp.nz;
      const dry = new Float64Array(N);
      for (let b = 1; b <= NB; b++) {
        const l = idwt(bandOnly(c, b), f);
        for (let i = 0; i < N; i++) dry[i] += l[i];
        layers.push(l);
      }
      layers.push(dry);
    } else {
      c = patternCoeffs(Math.round(params[k.pattern]), Math.round(params[k.seed]));
      for (let b = 1; b <= NB; b++) {
        const l = idwt(bandOnly(c, b), f);
        let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(l[i]));
        if (peak > 0) { for (let i = 0; i < N; i++) l[i] /= peak; bandScale[b - 1] = 1 / peak; }
        layers.push(l);
      }
      layers.push(new Float64Array(N));
      kept = nonzero = N - 1;
    }
    const out = { mode, layers, coeffs: c, bandScale, kept, nonzero };
    if (!withMips) return out;

    const mips = new Float32Array(NMIP * TW), rms = new Float32Array(NMIP * NL);
    const re = new Float64Array(N), im = new Float64Array(N), yr = new Float64Array(N), yi = new Float64Array(N);
    for (let l = 0; l < NL; l++) {
      const src = layers[l];
      let any = false;
      for (let i = 0; i < N; i++) { re[i] = src[i]; im[i] = 0; if (src[i] !== 0) any = true; }
      if (!any) continue;
      fft(re, im, false);
      for (let m = 0; m < NMIP; m++) {
        const H = 1024 >> m;
        yr.fill(0); yi.fill(0);
        for (let h = 1; h <= H; h++) { yr[h] = re[h]; yi[h] = im[h]; }
        for (let h = 1; h <= Math.min(H, N / 2 - 1); h++) { yr[N - h] = re[N - h]; yi[N - h] = im[N - h]; }
        fft(yr, yi, true);
        const off = m * TW;
        let e = 0;
        for (let i = 0; i < N; i++) { const v = yr[i] / N; mips[off + i * NL + l] = v; e += v * v; }
        mips[off + N * NL + l] = mips[off + l];
        rms[m * NL + l] = Math.sqrt(e / N);
      }
    }
    out.mips = mips; out.rms = rms;
    return out;
  }

  // ------------------------------------------------------------ band gains
  const softplus = x => (x > 10 ? x : Math.log(1 + Math.exp(4 * x)) / 4);
  // Scale filter: gain per band for a (fractional) cutoff position in bands.
  function filterGains(type, cut, slope, res, out) {
    for (let b = 0; b < NB; b++) {
      const d = (b + 1) - cut;
      let g;
      if (type === 3) {
        const w = 0.25 + 12 / slope;
        g = 1 - Math.exp(-(d / w) * (d / w));
      } else {
        let att;
        if (type === 0) att = slope * softplus(d);
        else if (type === 1) att = slope * softplus(-d);
        else att = slope * softplus(Math.abs(d) - 0.5);
        const boost = res * Math.exp(-d * d / (2 * 0.36));
        att = Math.min(att, 140);
        g = Math.exp((boost - att) * (Math.LN10 / 20));
      }
      out[b] = g;
    }
    return out;
  }

  // Position window: (1-D) + D * raised-cosine bump of width w centred on pc.
  function windowValue(ph, pc, w, D) {
    let d = Math.abs(ph - pc); if (d > 0.5) d = 1 - d;
    const bump = d < w * 0.5 ? 0.5 + 0.5 * Math.cos(2 * Math.PI * d / w) : 0;
    return (1 - D) + D * bump;
  }

  // PolyBLEP correction for the band-limited square of the sub oscillator
  function polyBlep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }
  // Sub oscillator sample at phase ph (0..1), shape 0 sine, 1 triangle, 2 square
  function subWave(ph, dt, shape) {
    if (shape === 0) return Math.sin(2 * Math.PI * ph);
    if (shape === 1) return 1 - 4 * Math.abs(ph - 0.5);
    let t2 = ph + 0.5; if (t2 >= 1) t2 -= 1;
    return (ph < 0.5 ? 1 : -1) + polyBlep(ph, dt) - polyBlep(t2, dt);
  }

  function softLimit(x) {
    const a = Math.abs(x);
    if (a <= LIMIT_T) return x;
    const y = LIMIT_T + (1 - LIMIT_T) * Math.tanh((a - LIMIT_T) / (1 - LIMIT_T));
    return x < 0 ? -y : y;
  }

  // ------------------------------------------------------------ FILTER (Okto MultiWave Synth beta 0.3)
  // A four-pole (24 dB per octave) resonant low-pass in every voice, before the amp envelope. Cutoff = FILTER CUTOFF x 2^(ENV AMT x 8 x its ADSR + KEY TRK x (note - C4) / 12
  // + LFO 2 / LFO 3), the resonance feeds the output of the last stage back to the input (4 = it sings by itself), DRIVE saturates the input. Two characters:
  // LADDER (every stage saturates: dark and gritty, the resonance thins the low end) and OTA (only the input of the loop saturates and the low end is partly
  // restored: rounder). It is bypassed while it is open (cutoff at its maximum, no resonance, no drive, no envelope, no LFO aimed at it): every older sound is
  // then bit-identical. tnh is a rational tanh (no library call: the same operations in the plug-in).
  function tnh(x) {
    if (x > 3) x = 3; else if (x < -3) x = -3;
    const x2 = x * x;
    return x * (27 + x2) / (27 + 9 * x2);
  }
  const FLT_K = 4.05;   // feedback gain at RESO 100 %: just above the 4 where a four-pole ladder sings
  // one sample of one channel (its four states are st[o .. o + 3]) through the ladder; G = g / (1 + g), g = tan(pi fc / sr); k the feedback gain; type 0 LADDER, 1 OTA.
  // The feedback is solved without delay for the linear ladder (y4 = (G^4 u + S) / (1 + k G^4)); the saturations then act on that signal.
  function ladder(st, o, u, G, k, type) {
    const g1 = 1 - G, G2 = G * G, G3 = G2 * G, G4 = G2 * G2;
    const s1 = st[o], s2 = st[o + 1], s3 = st[o + 2], s4 = st[o + 3];
    const S = g1 * (G3 * s1 + G2 * s2 + G * s3 + s4);
    const y4l = (G4 * u + S) / (1 + k * G4);
    let x = u - k * y4l;
    if (type === 0) {
      const a = tnh(x), v1 = (a - s1) * G, y1 = v1 + s1; st[o] = y1 + v1;
      const b = tnh(y1), v2 = (b - s2) * G, y2 = v2 + s2; st[o + 1] = y2 + v2;
      const c = tnh(y2), v3 = (c - s3) * G, y3 = v3 + s3; st[o + 2] = y3 + v3;
      const d = tnh(y3), v4 = (d - s4) * G, y4 = v4 + s4; st[o + 3] = y4 + v4;
      return y4;
    }
    x = tnh(x);
    const v1 = (x - s1) * G, y1 = v1 + s1; st[o] = y1 + v1;
    const v2 = (y1 - s2) * G, y2 = v2 + s2; st[o + 1] = y2 + v2;
    const v3 = (y2 - s3) * G, y3 = v3 + s3; st[o + 2] = y3 + v3;
    const v4 = (y3 - s4) * G, y4 = v4 + s4; st[o + 3] = y4 + v4;
    return y4;
  }

  // ------------------------------------------------------------ engine
  function Env() { this.stage = 0; this.level = 0; }
  // stage: 0 idle, 1 attack, 2 decay/sustain, 3 release
  Env.prototype.gate = function (on) { this.stage = on ? 1 : (this.stage ? 3 : 0); };
  // exp() of an argument that is the same in every call of a block (it depends on the settings and on the block length only): computed once, the same value as the call it replaces
  function ExpMemo() { this.arg = NaN; this.val = 0; }
  ExpMemo.prototype.get = function (a) { if (a !== this.arg) { this.arg = a; this.val = Math.exp(a); } return this.val; };
  const expOf = (m, a) => (m ? m.get(a) : Math.exp(a));
  Env.prototype.step = function (n, sr, a, d, s, r, decay, release) {
    if (this.stage === 1) {
      this.level += n / (a * sr);
      if (this.level >= 1) { this.level = 1; this.stage = 2; }
    } else if (this.stage === 2) {
      this.level = s + (this.level - s) * expOf(decay, -n * LN1000 / (d * sr));
    } else if (this.stage === 3) {
      this.level *= expOf(release, -n * LN1000 / (r * sr));
      if (this.level < 1e-5) { this.level = 0; this.stage = 0; }
    }
    return this.level;
  };

  // The state of one oscillator of one voice.
  function Slot() {
    this.phase = new Float64Array(4);                       // the unison copies' phases
    this.g = new Float64Array(NB); this.dg = new Float64Array(NB); this.tg = new Float64Array(NB);   // band gains: now, step, target
    this.scale = new Float64Array(NB); this.scaleAtk = new Uint8Array(NB);   // additive oscillators: the band envelopes
    this.f0 = 261.63; this.mip = 0; this.pc = 0; this.pw = 1; this.pd = 0;   // its pitch, mip level and position window
    this.own = new Env(); this.pe = 1;                      // its own envelope; its pitch envelope (1 -> 0)
    this.live = false;                                      // rendered in the last block
    // its place among the sets of each kind of variant (VK_*: phase, sparsity, width), from the start to the end of the block
    this.vq0 = new Float64Array(3); this.vq1 = new Float64Array(3);
    // memos of what the last block computed from the same inputs (compared exactly): the oscillator's pitch, the scale filter's gains, the mip level
    this.mA = NaN; this.mF0 = 0; this.mL2f0 = NaN; this.mL2 = 0; this.mTop = NaN; this.mFmax = NaN; this.mMip = 0;
    this.mType = -1; this.mCut = 0; this.mSlope = 0; this.mRes = 0; this.mFg = new Float64Array(NB);
  }
  function Voice() {
    this.active = false; this.gate = false; this.held = false;
    this.note = 60; this.vel = 1; this.age = 0;
    this.pitch = 60; this.target = 60; this.glide = false;
    this.f0 = 261.63;
    this.subPhase = 0;
    this.amp = new Env(); this.mod = new Env();
    this.fe = new Env(); this.fs = new Float64Array(8); this.fOn = false;   // the filter's envelope and states (left and right: four each); filtered in the last block
    this.fG0 = 0; this.fG1 = 0; this.fk = 0;                                  // its coefficient G at the start and the end of the block, the feedback gain
    this.sl = [];
    for (let s = 0; s < NS; s++) this.sl.push(new Slot());
    this.fresh = true;
    this.wm0 = 0; this.wm1 = 0;   // WAVELET MORPH position
    this.gain = 1; this.quick = false;   // the chord's bass note plays louder; a note dropped by a live chord change fades out quickly
    this.pu = 0;   // PUNCH (version 1.0.16): the boost's envelope, 1 at the start of a note, falling to 0
    this.mSemis = NaN; this.mPitchF0 = 0;   // memo: the voice's frequency for its last pitch in semitones
  }
  // releases the voice's own envelopes (with the AMP and MOD envelopes)
  function relOwn(vc) { for (let s = 0; s < NS; s++) vc.sl[s].own.gate(false); }

  // ---------------------------------------------------------------- Okto MultiWave Synth: chord names and the strum plate (both panels)
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  // "G#m7" for a root and a chord type; the single-note type is the note alone
  function chordName(root, type) { return NOTE_NAMES[((root % 12) + 12) % 12] + SPEC.CHORDS[type].suffix; }
  // The notes of the strum plate, lowest first: the chord's pitch classes over the three octaves above the C..B octave
  // holding the root, at most 12 strings (as on the touch plate of an electronic chord harp), notes above 127 dropped.
  function plateNotes(root, type) {
    const win = 12 * Math.floor(root / 12) + 12, c = SPEC.CHORDS[type], pcs = [];
    for (const iv of c.iv) { const pc = (root + iv) % 12; if (!pcs.includes(pc)) pcs.push(pc); }
    pcs.sort((a, b) => a - b);
    const out = [];
    for (let o = 0; o < 3 && out.length < 12; o++) for (const pc of pcs) { const n = win + 12 * o + pc; if (n <= 127 && out.length < 12) out.push(n); }
    return out;
  }

  function Engine(sr) {
    this.p = Float64Array.from(defaults());
    this.voices = [];
    for (let i = 0; i < MAXV; i++) this.voices.push(new Voice());
    this.cur = null; this.prev = null; this.fade = 1;
    this.counter = 0; this.lastPitch = 60; this.stack = [];
    this.lfoPhase = 0; this.lfo = 0; this.sh = 0; this.lfoRng = rng(777);
    this.lfo2Phase = 0; this.lfo2 = 0; this.sh2 = 0; this.lfo2Rng = rng(778);   // LFO 2 (beta 0.3)
    this.lfo3Phase = 0; this.lfo3 = 0; this.sh3 = 0; this.lfo3Rng = rng(779);   // LFO 3 (beta 0.3 of Okto MultiWave Synth)
    this.keys = new Uint8Array(128);
    this.tmpB = new Float64Array(NB); this.fg = new Float64Array(NB);
    this.active = new Int32Array(NL);
    this.bufL = new Float32Array(CTRL); this.bufR = new Float32Array(CTRL);
    this.vtL = new Float32Array(CTRL); this.vtR = new Float32Array(CTRL);   // a voice before its filter (the sum of its oscillators with a unit envelope)
    this.envOne = new Float64Array(CTRL).fill(1);
    this.fltOn = false; this.dFltOct = 0; this.dFltRes = 0;               // the filter is in the path; the moves LFO 2 / LFO 3 give its cutoff (octaves) and resonance
    this.panL = new Float64Array(4); this.panR = new Float64Array(4); this.inc = new Float64Array(4); this.detMul = new Float64Array(4);
    this.lg = new Float64Array(NB);
    // exp() memos of the envelopes' factors and of the filter gains of the last voice that asked (per oscillator); the unison copies; the output stage's factors
    this.mAmpD = new ExpMemo(); this.mAmpR = new ExpMemo(); this.mAmpQ = new ExpMemo(); this.mModD = new ExpMemo(); this.mModR = new ExpMemo(); this.mFeD = new ExpMemo(); this.mFeR = new ExpMemo();
    this.mOwnD = []; this.mOwnR = []; this.mOwnStepD = []; this.mOwnStepR = []; this.mPe = []; this.fgMemo = [];
    for (let s = 0; s < NS; s++) { this.mOwnD.push(new ExpMemo()); this.mOwnR.push(new ExpMemo()); this.mOwnStepD.push(new ExpMemo()); this.mOwnStepR.push(new ExpMemo()); this.mPe.push(new ExpMemo()); this.fgMemo.push({ type: -1, cut: 0, slope: 0, res: 0, fg: new Float64Array(NB) }); }
    this.mKd = new ExpMemo(); this.mVol = new ExpMemo(); this.mLvl = new ExpMemo(); this.mCompKd = NaN; this.mComp = 0;
    this.uMemoU = -1; this.uMemoDet = NaN; this.uMemoWidth = NaN;
    this.ownZero = new Uint8Array(NS);
    // per block, computed once for all voices (prepBlock): the oscillators' levels and settings
    this.lvlSm = new Float64Array(NS); this.m0 = new Float64Array(NS); this.m1 = new Float64Array(NS); this.live = new Uint8Array(NS);
    this.pr = [];
    for (let s = 0; s < NS; s++) this.pr.push({ tune: 0, ftype: 0, fcut: 0, fslope: 0, fres: 0, fkey: 0, fenv: 0, fvel: 0, pcen: 0, pwid: 0, pdep: 0,
      bar: new Float64Array(NB), norm: 1, atkRate: new Float64Array(NB), decay: new Float64Array(NB), sus: 1 });
    this.U = 1; this.topMul = 1; this.role2 = -1; this.d2 = 0; this.role3 = -1; this.d3 = 0; this.dMorph = 0;
    // per voice and block: the amp envelope (with the velocity gain) per sample, each oscillator's own envelope, end states
    this.envA = new Float64Array(CTRL);
    this.ownBuf = []; this.endPh = [];
    for (let s = 0; s < NS; s++) { this.ownBuf.push(new Float64Array(CTRL)); this.endPh.push(new Float64Array(4)); }
    this.ownOn = new Uint8Array(NS); this.ownLevel = new Float64Array(NS); this.ownStage = new Int32Array(NS);
    this.endLevel = 0; this.endStage = 0; this.endSubPhase = 0; this.endPunch = 0;
    // beta 0.3.1: also the live gains and window of every oscillator that plays in the last voice (sg: NS x NB, swin: NS x [center, width, depth], mask: its bits), for the
    // SCOPE and the SCALOGRAM, which show the whole sound and move with the modulation (the cutoff of the LFOs and the envelopes, the note)
    this.disp = { gains: new Float32Array(NB), mode: 0, view: 0, voices: 0, peakL: 0, peakR: 0, center: 0, width: 1, depth: 0, note: -1, slotLive: false,
      sg: new Float32Array(NS * NB), swin: new Float32Array(NS * 3), mask: 0 };
    this.lastVoice = -1;
    this.tempo = 0;   // beta 0.6: the host's tempo (BPM), 0 = none
    this.started = false;   // the first block has been rendered
    // Okto MultiWave Synth: the chord layer (keyOn / keyOff, see there)
    this.holdCnt = new Uint8Array(128);    // how many held keys and chord notes want each note sounding (reference count)
    this.plainHeld = new Uint8Array(128);  // keys played as themselves (below the selector octave, or over the chord)
    this.plateHeld = new Uint8Array(128);  // notes of the strum plate being touched
    this.selHeld = new Uint8Array(128);    // the selector keys held (they make no sound, so the panel's keyboard lights them from here)
    this.chordRoot = -1; this.chordN = 0; this.chordVel = 0; this.chordLastRoot = 60;
    this.chordNote = new Int16Array(MAXV); this.chordOn = new Uint8Array(MAXV); this.strumDue = new Float64Array(MAXV);
    this.noMicro = false;        // the demo and the evaluation passage play in equal temperament whatever the oriental tuning says
    this.chordHasBass = false;   // the first note of the chord is the bass (louder)
    this.chordTrim = 1;          // the level of a chord's notes: a chord of more than a triad's power is scaled down (see chordNotes)
    this.nextGain = 1;           // the gain the next note on gives its voice (the chord's bass note)
    this.clock = 0;   // samples rendered since the start (the strum's timing)
    this.chordTypeChanged = false;   // a selector key set chord_type: the host reads it and tells its controller / panel
    this.setSampleRate(sr);
  }
  const E = Engine.prototype;

  // beta 0.6: TEMPO SYNC. The plug-in gives the host's tempo (setTempo); 0 = none (the web app): the delay's TIME and the
  // LFOs' RATE then stay in seconds and hertz whatever SYNC says. With SYNC off every sound is bit-identical with beta 0.5.
  // at most 1000 BPM (DAWs stop at 999): a broken host's huge tempo would make the LFO phase infinite (security review)
  E.setTempo = function (bpm) { this.tempo = bpm > 0 && isFinite(bpm) ? Math.min(bpm, 1000) : 0; };
  const noteAt = (list, v) => list[Math.max(0, Math.min(list.length - 1, Math.round(v)))];
  E.delaySec = function () {
    const p = this.p;
    if (!(this.tempo > 0) || p[P.fx_dsync] < 0.5) return p[P.fx_dtime];
    return Math.min(DLY_MAX, noteAt(SPEC.DELAY_BEATS, p[P.fx_ddiv]) * 60 / this.tempo);
  };
  E.lfoHz = function (sync, div, rate) {
    const p = this.p;
    if (!(this.tempo > 0) || p[sync] < 0.5) return p[rate];
    return this.tempo / 60 / noteAt(SPEC.LFO_BEATS, p[div]);
  };

  E.setSampleRate = function (sr) {
    this.sr = sr;
    this.fmax = Math.max(0.45 * sr, sr - 19000);
    this.dlyLen = Math.ceil(sr * (DLY_MAX + 0.1)) + 4;   // beta 0.6: 4 s (was 1.1 s; the reads never reach further back)
    this.dlyL = new Float32Array(this.dlyLen); this.dlyR = new Float32Array(this.dlyLen);
    this.dlyW = 0; this.dlyT = this.delaySec() * sr; this.lpL = 0; this.lpR = 0;
    const sc = sr / 44100;
    const cT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aT = [556, 441, 341, 225];
    // the reverb's lines side by side: 16 combs (8 per channel) and 8 all-pass filters (4 per channel)
    this.cB = []; this.cLen = new Int32Array(16); this.cI = new Int32Array(16); this.cF = new Float64Array(16);
    this.aB = []; this.aLen = new Int32Array(8); this.aI = new Int32Array(8);
    for (let ch = 0; ch < 2; ch++) {
      for (let k = 0; k < 8; k++) { const len = Math.round((cT[k] + ch * 23) * sc); this.cB.push(new Float32Array(len)); this.cLen[ch * 8 + k] = len; }
      for (let k = 0; k < 4; k++) { const len = Math.round((aT[k] + ch * 23) * sc); this.aB.push(new Float32Array(len)); this.aLen[ch * 4 + k] = len; }
    }
    this.kDly = rateCoef(0.0005, sr); this.kLp = rateCoef(0.35, sr); this.kVol = rateCoef(0.002, sr);
    this.damp = sr === 48000 ? 0.25 : Math.pow(0.25, 48000 / sr);
    // the Classic reverb's input (version 1.0.16): the pre-delay lines (up to 0.1 s) and the low cut's states (x, y left; x, y right)
    this.rpLen = Math.ceil(0.1 * sr) + 2; this.rpL = new Float32Array(this.rpLen); this.rpR = new Float32Array(this.rpLen); this.rpW = 0;
    this.rh = new Float64Array(4);
    this.quiet = 0; this.quietNeed = 1 << 30;   // samples of silence so far, and how many an idle skip needs (set by every block)
    this.vol = Math.exp(this.p[P.master] * (Math.LN10 / 20));
    this.guard = { t: GUARD_T, att: GUARD_ATT, hold: GUARD_HOLD, rel: GUARD_REL };   // (a test can change them before the first block)
    this.gd = 1; this.gHold = 0;   // the guard's gain and the samples it is still held for
    // the look-ahead limiter (version 1.0.15): D samples of delay (the latency), a B-sample average, an H-sample running minimum
    this.limD = Math.max(1, Math.round(LIM_LA * sr)); this.limB = this.limD + 1; this.limH = this.limB + Math.round(LIM_HOLD * sr);
    this.limL = new Float64Array(this.limD); this.limR = new Float64Array(this.limD);
    this.limQG = new Float64Array(this.limH); this.limQT = new Float64Array(this.limH);   // the running minimum's queue (gains, sample numbers)
    this.limAv = new Float64Array(this.limB);
    this.kLr = rateCoef(1 - Math.exp(-1 / (LIM_REL * 48000)), sr);
    this.limReset();
    this.polyG = 1;   // the chord compensation (1 = none)
    this.polyDown = 1 - Math.exp(-1 / (POLY_DOWN * sr)); this.polyUp = 1 - Math.exp(-1 / (POLY_UP * sr));
    this.dcR = 1 - 2 * Math.PI * 10 / sr; this.dcxL = 0; this.dcyL = 0; this.dcxR = 0; this.dcyR = 0;
    this.chLen = Math.ceil(sr * 0.03) + 4;
    this.chBuf = new Float32Array(this.chLen); this.chW = 0; this.chPh = 0; this.chPh2 = 0;
    for (let s = 0; s < NS; s++) this.lvlSm[s] = this.p[K[s].lvl];
  };
  // the look-ahead limiter at rest: silent delay, gain 1 (setSampleRate, allSoundOff, an idle block)
  E.limReset = function () {
    this.limL.fill(0); this.limR.fill(0); this.limW = 0; this.limT = 0;
    this.limQh = 0; this.limQn = 0;   // the queue's head and length
    this.limAv.fill(1); this.limAw = 0; this.limSum = this.limB; this.limBelow = 0;   // the average: its samples, where the next one goes, their sum, how many are under 1
    this.limEnv = 1; this.limG = 1; this.limRest = true;
  };

  E.setParam = function (id, v) {
    const old = this.p[id];
    this.p[id] = v;
    if (id === P.hold && old >= 0.5 && v < 0.5) {
      for (const vc of this.voices) if (vc.active && vc.held) { vc.held = false; vc.gate = false; vc.amp.gate(false); vc.mod.gate(false), vc.fe.gate(false), relOwn(vc); }
    }
    // Okto MultiWave Synth: CHORD switched on / off or the selector octave moved while keys are held: the chord and the counted keys
    // are released first (nothing generated stays behind)
    if ((id === P.chord_mode || id === P.chord_oct) && old !== v) this.chordReset();
    // beta 0.2: the chord type, voicing or BASS changed while a root is held: the held chord changes at once
    else if ((id === P.chord_type || id === P.chord_voicing || id === P.chord_bass) && old !== v && this.chordRoot >= 0) this.rechord();
  };

  // Tables: { mode, mips, rms }. Switches with a short crossfade.
  E.setTables = function (t) {
    if (!this.cur) { this.cur = t; this.fade = 1; return; }
    this.prev = this.cur; this.cur = t; this.fade = 0;
  };

  // Before the first block an oscillator's level (smoothed over 20 ms while the audio runs) simply takes its value: a sound
  // loaded into a new engine, or an offline render, never fades in
  const setParamBase = E.setParam;
  E.setParam = function (id, v) {
    setParamBase.call(this, id, v);
    if (!this.started) for (let s = 0; s < NS; s++) if (id === K[s].lvl) this.lvlSm[s] = v;
  };
  // glideOn: this note slides from the previous pitch (portamento mode and legato decide)
  E.trigger = function (vc, note, vel, legato, glideOn) {
    vc.glide = !!glideOn;
    const glide = glideOn ? this.p[P.v_glide] : 0;
    if (!vc.active) {
      vc.fresh = true;
      for (let s = 0; s < NS; s++) {
        const sl = vc.sl[s];
        for (let u = 0; u < 4; u++) sl.phase[u] = (u * 0.618034) % 1;
        sl.scale.fill(0); sl.live = false; sl.own.level = 0; sl.own.stage = 0; sl.pe = 1;
      }
      vc.subPhase = 0;
      vc.amp.level = 0; vc.mod.level = 0; vc.fe.level = 0; vc.fs.fill(0); vc.fOn = false;
      // polyphonic portamento: an idle voice glides from its own last pitch (a never-used voice from the last note)
      vc.pitch = glide > 0 ? (vc.age ? vc.pitch : this.lastPitch) : note;
    } else if (glide <= 0) vc.pitch = note;
    vc.active = true; vc.gate = true; vc.held = false;
    vc.note = note; vc.target = note; vc.vel = vel;
    vc.gain = this.nextGain; vc.quick = false;
    vc.age = ++this.counter;
    if (!legato) {
      vc.amp.gate(true); vc.mod.gate(true); vc.fe.gate(true);
      for (let s = 0; s < NS; s++) { const sl = vc.sl[s]; sl.scaleAtk.fill(1); sl.own.gate(true); sl.pe = 1; }
      vc.pu = 1;   // PUNCH (version 1.0.16): a new start of the note
    }
    this.lastPitch = note;
  };

  E.noteOn = function (note, vel) {
    if (!(note >= 0 && note < 128)) return;
    if (!(vel > 0)) { this.noteOff(note); return; }   // also a NaN
    if (vel > 1) vel = 1;
    let othersHeld = false;
    for (let k = 0; k < 128; k++) if (k !== note && this.keys[k]) { othersHeld = true; break; }
    const porta = Math.round(this.p[P.v_porta]);
    this.keys[note] = 1;
    const maxV = Math.round(this.p[P.v_voices]);
    if (maxV <= 1) {
      const i = this.stack.indexOf(note); if (i >= 0) this.stack.splice(i, 1);
      const vc = this.voices[0];
      const legato = vc.active && this.stack.length > 0;   // another key is still held down
      this.stack.push(note);
      for (let k = 1; k < MAXV; k++) if (this.voices[k].active) { this.voices[k].gate = false; this.voices[k].amp.gate(false); this.voices[k].mod.gate(false), this.voices[k].fe.gate(false), relOwn(this.voices[k]); }
      this.trigger(vc, note, vel, legato, porta === 1 || (porta === 2 && legato));
      this.lastVoice = 0;
      return;
    }
    const glideOn = porta === 1 || (porta === 2 && othersHeld);
    let pick = -1;
    for (let k = 0; k < MAXV; k++) if (this.voices[k].active && this.voices[k].note === note) { pick = k; break; }
    if (pick < 0 && glideOn && this.p[P.v_glide] > 0) pick = this.glideVoice(note, maxV, othersHeld);
    if (pick < 0) for (let k = 0; k < maxV; k++) if (!this.voices[k].active) { pick = k; break; }
    if (pick < 0) {
      let best = -1, bestAge = Infinity;
      for (let k = 0; k < maxV; k++) { const v = this.voices[k]; if (!v.gate && v.age < bestAge) { best = k; bestAge = v.age; } }
      if (best < 0) for (let k = 0; k < maxV; k++) { const v = this.voices[k]; if (v.age < bestAge) { best = k; bestAge = v.age; } }
      pick = best;
    }
    const from = this.lastPitch;
    this.trigger(this.voices[pick], note, vel, false, glideOn);
    // Legato only, polyphonic: like a mono legato line, glide from the note still held (the last one played)
    if (porta === 2 && glideOn && this.p[P.v_glide] > 0) this.voices[pick].pitch = from;
    this.lastVoice = pick;
  };

  // Polyphonic portamento: which free voice glides to the new note. Playing one note at a time it is the
  // voice of the previous note (the melody glides while older release tails continue); with other keys held
  // (chords) it is the free voice whose last pitch is nearest, so chord changes glide voice by voice.
  E.glideVoice = function (note, maxV, othersHeld) {
    let pick = -1, best = Infinity;
    for (let k = 0; k < maxV; k++) {
      const v = this.voices[k];
      if (v.gate || !v.age) continue;
      const score = othersHeld ? Math.abs(v.pitch - note) - v.age * 1e-9 : -v.age;
      if (score < best) { best = score; pick = k; }
    }
    return pick;
  };

  // beta 0.4 fix: a note is released whatever VOICES is now — a preset change between its note on and its note off may
  // have switched mono <-> poly (before, the note off then missed its voice, which played on for ever)
  // quick (beta 0.2): the chord note dropped by a live chord change: its release is at most QUICK_REL long
  E.noteOff = function (note, quick) {
    this.keys[note] = 0;
    const hold = this.p[P.hold] >= 0.5;
    const i = this.stack.indexOf(note); if (i >= 0) this.stack.splice(i, 1);   // the mono list keeps held keys only
    if (Math.round(this.p[P.v_voices]) <= 1) {
      const vc = this.voices[0];
      if (vc.active && vc.gate && vc.note === note && this.stack.length) {   // mono legato: back to the last key held
        const n = this.stack[this.stack.length - 1];
        vc.note = n; vc.target = n; vc.glide = Math.round(this.p[P.v_porta]) !== 0;
        if (!vc.glide || this.p[P.v_glide] <= 0) vc.pitch = n;
        this.lastPitch = n;
        return;
      }
    }
    for (const vc of this.voices) if (vc.active && vc.gate && vc.note === note) {
      vc.quick = !!quick;
      if (hold) vc.held = true; else { vc.gate = false; vc.amp.gate(false); vc.mod.gate(false), vc.fe.gate(false), relOwn(vc); }
    }
  };

  E.allNotesOff = function () {
    this.stack.length = 0; this.keys.fill(0); this.chordClear();
    for (const vc of this.voices) if (vc.active) { vc.gate = false; vc.held = false; vc.amp.gate(false); vc.mod.gate(false), vc.fe.gate(false), relOwn(vc); }
  };

  // MIDI CC120: silence immediately (voices and effect tails)
  E.allSoundOff = function () {
    this.stack.length = 0; this.keys.fill(0); this.chordClear();
    for (const vc of this.voices) { vc.active = false; vc.gate = false; vc.held = false; vc.pu = 0; vc.amp.stage = 0; vc.amp.level = 0; vc.mod.stage = 0; vc.mod.level = 0; vc.fe.stage = 0; vc.fe.level = 0; vc.fs.fill(0); vc.fOn = false; }
    this.dlyL.fill(0); this.dlyR.fill(0); this.lpL = 0; this.lpR = 0;
    for (const b of this.cB) b.fill(0);
    this.cF.fill(0);
    for (const b of this.aB) b.fill(0);
    this.rpL.fill(0); this.rpR.fill(0); this.rh.fill(0);
    this.chBuf.fill(0);
    this.quiet = 0;
    this.polyG = 1; this.gd = 1; this.gHold = 0;
    this.limReset();
  };

  // ---------------------------------------------------------------- Okto MultiWave Synth: the chord layer
  // Every key a player presses comes here (MIDI, the on-screen and computer keyboards); the demo sequencer plays noteOn /
  // noteOff directly and is never affected. CHORD off: keyOn is exactly noteOn (the base synthesizer, bit for bit).
  // CHORD on, three zones of the keyboard:
  //   - the selector octave (KEYS OCT, 12 keys): a key sets chord_type (CHORD_KEYS) and makes no sound; the new type
  //     applies to the next root, a chord already sounding is not changed;
  //   - above it: a key pressed while no root is held becomes the root and the whole chord sounds (chordNotes: the type,
  //     STACKED or FOLDED voicing, BASS, at most VOICES notes, lowest first, spread by STRUM); any other key pressed while
  //     the root is held plays as itself with its own velocity (a melody over the chord, an extension added by hand);
  //     releasing the root releases the chord's notes only;
  //   - below it: keys play as themselves (a left-hand bass).
  // The engine's notes are reference-counted (holdCnt): a note shared by the chord and a held key keeps sounding until
  // both release it. Below this layer nothing changes: sustain pedal, portamento, voice stealing, velocity.
  E.chordBase = function () { return 24 + 12 * Math.round(this.p[P.chord_oct]); };   // the first key of the selector octave
  // gain (beta 0.2): the chord's bass note plays louder (the voice keeps it until it is triggered again)
  E.holdOn = function (note, vel, gain) { this.holdCnt[note]++; this.nextGain = gain || 1; this.noteOn(note, vel); this.nextGain = 1; };
  E.holdOff = function (note, quick) { if (this.holdCnt[note] > 0 && --this.holdCnt[note] === 0) this.noteOff(note, quick); };
  // the gain of chord note k: the bass (the first note of a chord that has one) plays louder
  E.chordGain = function (k) { return (k === 0 && this.chordHasBass ? BASS_GAIN : 1) * this.chordTrim; };
  E.keyOn = function (note, vel) {
    if (note < 0 || note > 127) return;
    if (!(vel > 0)) { this.keyOff(note); return; }
    if (this.p[P.chord_mode] < 0.5) { this.noteOn(note, vel); return; }
    const base = this.chordBase();
    if (note >= base && note < base + 12) {   // the selector octave: a chord type, no sound
      this.selHeld[note] = 1;
      const t = SPEC.CHORD_KEYS[note - base];
      if (this.p[P.chord_type] !== t) {
        this.p[P.chord_type] = t; this.chordTypeChanged = true;
        this.rechord();   // beta 0.2: a held root takes the new chord at once (the left hand remembers its last chord for the next root)
      }
      return;
    }
    if (note === this.chordRoot) {   // the root pressed again (a host repeating a note on): the chord notes start again
      for (let k = 0; k < this.chordN; k++) if (this.chordOn[k]) { this.nextGain = this.chordGain(k); this.noteOn(this.chordNote[k], vel); this.nextGain = 1; }
      return;
    }
    if (this.plainHeld[note]) { this.noteOn(note, vel); return; }   // a key repeated without its release: once in the count
    if (note >= base + 12 && this.chordRoot < 0) { this.startChord(note, vel); return; }
    this.plainHeld[note] = 1; this.holdOn(note, vel);
  };
  E.keyOff = function (note) {
    if (note < 0 || note > 127) return;
    this.selHeld[note] = 0;
    if (this.p[P.chord_mode] < 0.5) { this.noteOff(note); return; }
    if (note === this.chordRoot) { this.endChord(); return; }
    if (this.plainHeld[note]) { this.plainHeld[note] = 0; this.holdOff(note); return; }
    const base = this.chordBase();
    if (note >= base && note < base + 12) return;
    this.noteOff(note);   // a key held since before CHORD was switched on
  };
  // The chord's notes for a root, ascending, into out (length MAXV); returns their number.
  // STACKED: root + intervals. FOLDED: the chord's pitch classes inside the C..B octave holding the root (successive chords
  // stay in one register: C4 -> C E G, G4 -> D G B, A4 -> C E A). BASS: the root's pitch class one octave below (below the
  // window when FOLDED). At most VOICES notes: the chord is cut from the top, the root is always kept, then the bass (never
  // with a single voice). Notes above 127 are dropped.
  // beta 0.2: BASS = the root two octaves below (never under C1: an octave up when it would be), played louder (chordGain);
  // it is the first note of the list (chordHasBass).
  E.chordNotes = function (root, out) {
    const c = SPEC.CHORDS[Math.round(this.p[P.chord_type])], folded = this.p[P.chord_voicing] >= 0.5;
    const win = 12 * Math.floor(root / 12), rootNote = folded ? win + root % 12 : root;
    let bassNote = rootNote - 24;
    while (bassNote < 24) bassNote += 12;
    const list = [];
    for (const iv of c.iv) { const n = folded ? win + (root + iv) % 12 : root + iv; if (n <= 127 && !list.includes(n)) list.push(n); }
    list.sort((a, b) => a - b);
    const maxV = Math.max(1, Math.round(this.p[P.v_voices]));
    const withBass = this.p[P.chord_bass] >= 0.5 && bassNote < rootNote && maxV >= 2;
    this.chordHasBass = withBass;
    while (list.length + (withBass ? 1 : 0) > maxV) {
      let k = list.length - 1;
      while (k > 0 && list[k] === rootNote) k--;
      if (list[k] === rootNote) break;
      list.splice(k, 1);
    }
    // a chord keeps the level of a triad: the notes' total power (the bass counts BASS_GAIN squared) over that of three notes scales them
    // down, so that a seventh with its bass does not hit the limiter (a triad, a power chord or a single note: 1)
    const power = list.length + (withBass ? BASS_GAIN * BASS_GAIN : 0);
    this.chordTrim = power > 3 ? Math.sqrt(3 / power) : 1;
    let n = 0;
    if (withBass) out[n++] = bassNote;
    for (const x of list) if (n < MAXV) out[n++] = x;
    return n;
  };
  E.startChord = function (root, vel) {
    const n = this.chordNotes(root, this.chordNote);
    this.chordRoot = root; this.chordLastRoot = root; this.chordN = n; this.chordVel = vel;
    const strum = this.p[P.chord_strum] * this.sr;   // STRUM: samples between two notes, lowest first
    for (let k = 0; k < n; k++) { this.chordOn[k] = 0; this.strumDue[k] = this.clock + k * strum; }
    this.strumTick();   // the first note starts now (all of them without STRUM)
  };
  // beta 0.3.2 (the crackle of a loud chord): scales this block's voice sum (before the effects) when more than POLY_FREE voices sound. nv = the sum of the voices' energies over the
  // loudest one's (each voice's level at the end of the block, with its velocity gain; the notes of the chord keyboard are left out: chordTrim already scales them): equal voices count 1 each, a release tail 20 dB down counts 0.01. Target
  // sqrt(POLY_FREE / nv), reached with POLY_DOWN / POLY_UP per sample; it snaps to the target within 1e-6, so up to POLY_FREE voices the gain is exactly 1 and the sound is
  // bit-identical with beta 0.3.1; with no voice sounding it is 1 at once (the next note starts unscaled).
  E.polyComp = function (L, R, n) {
    const p = this.p;
    let amax = 0, sum = 0, any = false;
    for (let k = 0; k < MAXV; k++) {
      const vc = this.voices[k];
      if (!vc.active || vc.gain !== 1) continue;   // a chord keyboard note has its own level (chordTrim): it is not counted again
      any = true;
      const a = vc.amp.level * (1 - p[P.amp_vel] * (1 - vc.vel));
      if (a > amax) amax = a;
      sum += a * a;
    }
    if (!any) { this.polyG = 1; return; }
    const nv = amax > 0 ? sum / (amax * amax) : 0;
    // + 1e-6: three equal voices give nv = 3.0000000000000004 (rounding), which must still mean "no compensation"; CHORD COMP off (1.0.15): the gain glides back to 1
    const gT = nv > POLY_FREE + 1e-6 && p[P.poly_comp] >= 0.5 ? Math.sqrt(POLY_FREE / nv) : 1;
    let g = this.polyG;
    if (g === 1 && gT === 1) return;
    const c = gT < g ? this.polyDown : this.polyUp;
    for (let i = 0; i < n; i++) {
      g += (gT - g) * c;
      if (Math.abs(gT - g) < 1e-6) g = gT;
      L[i] *= g; R[i] *= g;
    }
    this.polyG = g;
  };
  // at every block: the chord notes whose time has come (the strum; block boundaries, identical in both engines)
  E.strumTick = function () {
    if (this.chordRoot < 0) return;
    for (let k = 0; k < this.chordN; k++) if (!this.chordOn[k] && this.strumDue[k] <= this.clock) { this.chordOn[k] = 1; this.holdOn(this.chordNote[k], this.chordVel, this.chordGain(k)); }
  };
  E.endChord = function () {   // the root released: its notes (pending ones are forgotten)
    if (this.chordRoot < 0) return;
    for (let k = 0; k < this.chordN; k++) if (this.chordOn[k]) this.holdOff(this.chordNote[k]);
    this.chordRoot = -1; this.chordN = 0;
  };
  // beta 0.2: the held root takes the chord of the new type / voicing / BASS at once. Only the notes of the chord now played sound:
  // the notes that are not in the new chord fade out quickly (QUICK_REL), the ones in both go on untouched, the new ones start with
  // the root's velocity (without STRUM). A note held by hand over the chord is not touched (it is counted apart).
  E.rechord = function () {
    if (this.chordRoot < 0) return;
    const oldN = this.chordN, oldNote = Array.from(this.chordNote.subarray(0, oldN)), oldOn = Array.from(this.chordOn.subarray(0, oldN));
    const next = new Int16Array(MAXV), n = this.chordNotes(this.chordRoot, next);
    for (let i = 0; i < oldN; i++) {
      if (!oldOn[i]) continue;
      let stays = false;
      for (let j = 0; j < n; j++) if (next[j] === oldNote[i]) stays = true;
      if (!stays) this.holdOff(oldNote[i], true);
    }
    for (let j = 0; j < n; j++) {
      let was = false;
      for (let i = 0; i < oldN; i++) if (oldOn[i] && oldNote[i] === next[j]) was = true;
      this.chordNote[j] = next[j]; this.chordOn[j] = 1;
      if (!was) this.holdOn(next[j], this.chordVel, this.chordGain(j));
    }
    this.chordN = n;
  };
  E.chordReset = function () {   // the chord and the counted keys released (CHORD or KEYS OCT changed)
    this.endChord();
    for (let n = 0; n < 128; n++) {
      if (this.plainHeld[n]) { this.plainHeld[n] = 0; this.holdOff(n); }
      if (this.plateHeld[n]) { this.plateHeld[n] = 0; this.holdOff(n); }
      this.holdCnt[n] = 0;
    }
  };
  E.chordClear = function () {   // allNotesOff / allSoundOff: the layer forgets everything (the voices are released there)
    this.chordRoot = -1; this.chordN = 0; this.holdCnt.fill(0); this.plainHeld.fill(0); this.plateHeld.fill(0); this.selHeld.fill(0);
  };
  // The strum plate: its notes play as themselves, whatever CHORD says (they come from the panel), counted like held keys
  E.plateOn = function (note, vel) {
    if (note < 0 || note > 127) return;
    if (this.plateHeld[note]) { this.noteOn(note, vel); return; }
    this.plateHeld[note] = 1; this.holdOn(note, vel);
  };
  E.plateOff = function (note) {
    if (note < 0 || note > 127 || !this.plateHeld[note]) return;
    this.plateHeld[note] = 0; this.holdOff(note);
  };

  // ORIENTAL KEYBOARD (beta 0.2): how far, in semitones, the key playing this pitch is moved from its equal-tempered pitch. TUNING 0
  // (Western) or noMicro: 0 (the sound is bit for bit the old one). Otherwise the cents of MICRO[tuning - 1][scale][semitones above the
  // tonic], interpolated between the two neighbouring keys while a note glides (an integer pitch gives the table's value).
  E.microSemis = function (pitch) {
    const mode = Math.round(this.p[P.mt_mode]);
    if (mode === 0 || this.noMicro) return 0;
    const t = SPEC.MICRO[mode - 1][Math.round(this.p[P.mt_scale])];
    const x = pitch - Math.round(this.p[P.mt_tonic]), f = Math.floor(x), fr = x - f;
    const a = ((f % 12) + 12) % 12, b = (a + 1) % 12;
    return (t[a] + fr * (t[b] - t[a])) / 100;
  };

  E.lfoTick = function (n) {
    const p = this.p, shape = Math.round(p[P.lfo_shape]), ph = this.lfoPhase;
    let v;
    switch (shape) {
      case 0: v = Math.sin(2 * Math.PI * ph); break;
      case 1: v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      case 2: v = 1 - 2 * ph; break;
      case 3: v = ph < 0.5 ? 1 : -1; break;
      default: v = this.sh; break;
    }
    this.lfo = v;
    this.lfoPhase += this.lfoHz(P.lfo_sync, P.lfo_div, P.lfo_rate) * n / this.sr;
    if (this.lfoPhase >= 1) { this.lfoPhase -= Math.floor(this.lfoPhase); this.sh = this.lfoRng() * 2 - 1; }
  };
  // LFO 2 (beta 0.3): the same shapes, its own phase and sample & hold sequence
  E.lfo2Tick = function (n) {
    const p = this.p, shape = Math.round(p[P.lfo2_shape]), ph = this.lfo2Phase;
    let v;
    switch (shape) {
      case 0: v = Math.sin(2 * Math.PI * ph); break;
      case 1: v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      case 2: v = 1 - 2 * ph; break;
      case 3: v = ph < 0.5 ? 1 : -1; break;
      default: v = this.sh2; break;
    }
    this.lfo2 = v;
    this.lfo2Phase += this.lfoHz(P.lfo2_sync, P.lfo2_div, P.lfo2_rate) * n / this.sr;
    if (this.lfo2Phase >= 1) { this.lfo2Phase -= Math.floor(this.lfo2Phase); this.sh2 = this.lfo2Rng() * 2 - 1; }
  };
  // LFO 3 (Okto MultiWave Synth beta 0.3): LFO 2 again, with its own phase and sample & hold sequence
  E.lfo3Tick = function (n) {
    const p = this.p, shape = Math.round(p[P.lfo3_shape]), ph = this.lfo3Phase;
    let v;
    switch (shape) {
      case 0: v = Math.sin(2 * Math.PI * ph); break;
      case 1: v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      case 2: v = 1 - 2 * ph; break;
      case 3: v = ph < 0.5 ? 1 : -1; break;
      default: v = this.sh3; break;
    }
    this.lfo3 = v;
    this.lfo3Phase += this.lfoHz(P.lfo3_sync, P.lfo3_div, P.lfo3_rate) * n / this.sr;
    if (this.lfo3Phase >= 1) { this.lfo3Phase -= Math.floor(this.lfo3Phase); this.sh3 = this.lfo3Rng() * 2 - 1; }
  };

  // LFO 2 (beta 0.3) moves the parameter of a role (cutoff, slope ... position width) by d2 in plain units: the value of that
  // field of an oscillator as LFO 2 moves it (kept in range, POSITION wraps later)
  function roleVal(p, k, role, role2, d2, role3, d3) {
    const i = k[ROLES[role]], v = p[i];
    const m2 = role2 === role, m3 = role3 === role;   // beta 0.3: LFO 3's move (role3, d3) adds to LFO 2's
    if (!m2 && !m3) return v;
    const w = v + (m2 ? d2 : 0) + (m3 ? d3 : 0);
    return role === ROLE_PCEN ? w : Math.min(SPEC.PARAMS[i].max, Math.max(SPEC.PARAMS[i].min, w));
  }

  // Everything the voices share in a block of n samples, computed once: LFO 2, the unison copies, the oscillators' levels
  // (smoothed over 20 ms) and settings, the additive oscillators' band terms. `live[s]`: oscillator s is rendered.
  E.prepBlock = function (n, fading) {
    const p = this.p, sr = this.sr;
    const t2 = Math.round(p[P.lfo2_target]), tp = SPEC.PARAMS[SPEC.LFO2_TARGETS[t2]];
    const role2 = LFO2_ROLE[t2], d2 = p[P.lfo2_amt] * this.lfo2 * 0.5 * roleSpan(tp, role2);
    this.role2 = role2; this.d2 = d2;
    const t3 = Math.round(p[P.lfo3_target]), tp3 = SPEC.PARAMS[SPEC.LFO2_TARGETS[t3]];
    const role3 = p[P.lfo3_amt] !== 0 ? LFO2_ROLE[t3] : -1, d3 = p[P.lfo3_amt] * this.lfo3 * 0.5 * roleSpan(tp3, role3);
    this.role3 = role3; this.d3 = d3;
    // the odd (1, 3, 5 ...) or even (2, 4 ...) bands' drawbars that LFO 2 and LFO 3 move, and the morph position they add
    const dOdd = (role2 === ROLE_ODD ? d2 : 0) + (role3 === ROLE_ODD ? d3 : 0), dEven = (role2 === ROLE_EVEN ? d2 : 0) + (role3 === ROLE_EVEN ? d3 : 0);
    this.dMorph = (role2 === ROLE_MORPH ? d2 : 0) + (role3 === ROLE_MORPH ? d3 : 0);
    // the filter: LFO 2 / LFO 3 moves of its cutoff (octaves) and resonance; in the path unless it is open
    const l2on = p[P.lfo2_amt] !== 0;
    const c2 = l2on && role2 === ROLE_VFCUT, r2 = l2on && role2 === ROLE_VFRES, c3 = role3 === ROLE_VFCUT, r3 = role3 === ROLE_VFRES;
    this.dFltOct = (c2 ? d2 : 0) + (c3 ? d3 : 0); this.dFltRes = (r2 ? d2 : 0) + (r3 ? d3 : 0);
    const velF = p[P.vel_amt] > 0 && Math.round(p[P.vel_target]) !== 0;   // version 1.0.13: the PLAY card's VELOCITY moves the cutoff
    this.fltOn = !(p[P.vf_cut] >= 20000 && p[P.vf_res] === 0 && p[P.vf_drive] === 0 && p[P.vf_env] === 0 && !c2 && !r2 && !c3 && !r3 && !velF);
    // unison copies (detune and pan are the same for every oscillator)
    const U = Math.round(p[P.v_unison]), det = p[P.v_detune], width = p[P.v_width];
    this.U = U;
    if (U !== this.uMemoU || det !== this.uMemoDet || width !== this.uMemoWidth) {   // topMul, detMul, panL, panR depend on these three only
      this.uMemoU = U; this.uMemoDet = det; this.uMemoWidth = width;
      const uGain = 1 / Math.sqrt(U);
      this.topMul = Math.pow(2, (U > 1 ? det : 0) / 1200);
      for (let u = 0; u < U; u++) {
        const pos = U > 1 ? 2 * u / (U - 1) - 1 : 0;
        this.detMul[u] = Math.pow(2, det * pos / 1200);
        const th = (pos * width + 1) * Math.PI / 4;
        this.panL[u] = Math.SQRT2 * Math.cos(th) * uGain; this.panR[u] = Math.SQRT2 * Math.sin(th) * uGain;
      }
    }
    const a = 1 - this.mLvl.get(-n / (0.02 * sr));
    for (let s = 0; s < NS; s++) {
      const k = K[s], q = this.pr[s];
      this.m0[s] = this.lvlSm[s];
      this.lvlSm[s] += (p[k.lvl] - this.lvlSm[s]) * a;
      this.m1[s] = this.lvlSm[s];
      const has = (this.cur && this.cur.slots[s]) || (fading && this.prev && this.prev.slots[s]);
      this.live[s] = has && (this.m0[s] > LVL_EPS || this.m1[s] > LVL_EPS) ? 1 : 0;
      if (!this.live[s]) continue;
      q.tune = 12 * p[k.oct] + p[k.fine] / 100 + p[k.semi];
      q.ftype = Math.round(p[k.ftype]);
      q.fcut = roleVal(p, k, 0, role2, d2, role3, d3); q.fslope = roleVal(p, k, 1, role2, d2, role3, d3); q.fres = roleVal(p, k, 2, role2, d2, role3, d3);
      q.fkey = roleVal(p, k, 3, role2, d2, role3, d3); q.fenv = roleVal(p, k, 4, role2, d2, role3, d3); q.fvel = roleVal(p, k, 5, role2, d2, role3, d3);
      q.pcen = roleVal(p, k, 6, role2, d2, role3, d3); q.pwid = roleVal(p, k, 7, role2, d2, role3, d3); q.pdep = roleVal(p, k, 8, role2, d2, role3, d3);
      if (SLOTS[s].mode === 1) {   // additive: drawbars x tilt, their sum, the band envelopes' steps (the same for every voice)
        const atk = p[k.atk], spread = p[k.spread], body = p[k.body], bright = p[k.bright];
        const tilt = roleVal(p, k, ROLE_TILT, role2, d2, role3, d3);
        let norm = 0;
        for (let b = 0; b < NB; b++) {
          let bv = p[k.bar1 + b];
          const dBar = (b & 1) === 0 ? dOdd : dEven;   // band b + 1 is odd when b is even
          if (dBar !== 0) bv = Math.min(1, Math.max(0, bv + dBar));
          const bar = bv * Math.exp(tilt * b * (Math.LN10 / 20));
          q.bar[b] = bar; norm += bar;
          const t = b / 10;
          q.atkRate[b] = n / (atk * Math.pow(16, spread * (t - 0.5)) * sr);
          const dt = body * Math.pow(bright / body, t);
          q.decay[b] = Math.exp(-n * LN1000 / (dt * sr));
        }
        q.norm = Math.max(1, norm); q.sus = roleVal(p, k, ROLE_SUS, role2, d2, role3, d3);
      }
    }
  };

  // The filter's coefficients for this voice and block (feLev: the level of its envelope at the end of the block)
  // version 1.0.13: the PLAY card's VELOCITY (tools/spec.js vel_amt, vel_target): the voice's gain (Volume) and the octaves its FILTER cutoff goes down (Filter); 1 and 0 when it is off
  E.velVolume = function (vc) {
    const p = this.p, amt = p[P.vel_amt], t = Math.round(p[P.vel_target]);
    return amt > 0 && t !== 1 ? Math.pow(Math.max(vc.vel, 1e-3), 2 * amt) : 1;
  };
  E.velFilterOct = function (vc) {
    const p = this.p, amt = p[P.vel_amt], t = Math.round(p[P.vel_target]);
    return amt > 0 && t !== 0 ? -amt * 4 * (1 - vc.vel) : 0;
  };
  E.fltPrep = function (vc, n, feLev) {
    const p = this.p, sr = this.sr;
    const octs = p[P.vf_env] * 8 * feLev + p[P.vf_key] * (vc.pitch - 60) / 12 + this.dFltOct + this.velFilterOct(vc);
    let fc = p[P.vf_cut] * Math.pow(2, octs);
    const fmax = 0.45 * sr;
    if (fc > fmax) fc = fmax; else if (fc < 8) fc = 8;
    const g = Math.tan(Math.PI * fc / sr), G = g / (1 + g);
    if (!vc.fOn) { vc.fs.fill(0); vc.fG0 = G; vc.fOn = true; } else vc.fG0 = vc.fG1;   // a note starts with a cold filter at its cutoff
    vc.fG1 = G;
    const res = Math.min(1, Math.max(0, p[P.vf_res] + this.dFltRes));
    vc.fk = FLT_K * res;
  };
  // The voice buffers through the filter, times the amp envelope, added to the mix
  E.fltProcess = function (vc, n) {
    const p = this.p, L = this.bufL, R = this.bufR, a = this.vtL, b = this.vtR, env = this.envA, st = vc.fs;
    const k = vc.fk, type = Math.round(p[P.vf_type]), drive = p[P.vf_drive];
    const gin = 1 + 7 * drive, mk = (1 + gin) / (2 * gin), comp = type === 1 ? 1 + 0.6 * k : 1;   // OTA: the low end the resonance takes away comes back in part
    const G0 = vc.fG0, dG = (vc.fG1 - vc.fG0) / n;
    for (let i = 0; i < n; i++) {
      const G = G0 + dG * (i + 1);
      let xl = a[i], xr = b[i];
      if (drive > 0) { xl = tnh(gin * xl) * mk; xr = tnh(gin * xr) * mk; }
      xl *= comp; xr *= comp;
      L[i] += ladder(st, 0, xl, G, k, type) * env[i];
      R[i] += ladder(st, 4, xr, G, k, type) * env[i];
    }
    for (let q = 0; q < 8; q++) { const x = st[q]; st[q] = Math.abs(x) < 1e-20 || !Number.isFinite(x) ? 0 : x; }   // no denormals, no NaN left in a state
  };

  // Per-voice control update for a block of n samples.
  E.control = function (vc, n) {
    const p = this.p, sr = this.sr;
    const glide = vc.glide ? p[P.v_glide] : 0;
    if (glide > 0 && vc.pitch !== vc.target) {
      vc.pitch += (vc.target - vc.pitch) * (1 - Math.exp(-n * 4.6 / (glide * sr)));
      if (Math.abs(vc.target - vc.pitch) < 1e-3) vc.pitch = vc.target;
    } else vc.pitch = vc.target;
    const semis = vc.pitch + this.microSemis(vc.pitch) + 12 * p[P.v_oct] + p[P.v_fine] / 100 + 2 * p[P.bend] +
      this.lfo * (p[P.lfo_pitch] + 50 * p[P.modwheel]) / 100;
    if (semis !== vc.mSemis) { vc.mSemis = semis; vc.mPitchF0 = 440 * Math.pow(2, (semis - 69) / 12); }
    vc.f0 = vc.mPitchF0;   // the voice's pitch (the sub oscillator follows it); each oscillator adds its tuning
    const mod = vc.mod.step(n, sr, p[P.mod_a], p[P.mod_d], p[P.mod_s], p[P.mod_r], this.mModD, this.mModR);
    // WAVELET MORPH position of this voice (0 = WAVELET, 1 = WAVELET 2): MORPH + LFO + mod envelope, moving from wm0 to wm1
    // across the block
    // (beta 0.2: LFO 2 can add to the morph, LFO 1 can swing the envelope's reach: ENV>WAV + LFO1 TO ENV>WAV · LFO)
    const wm = Math.min(1, Math.max(0, p[P.wmorph] + this.dMorph + p[P.lfo_wav] * this.lfo + (p[P.env_wav] + p[P.lfo_ew] * this.lfo) * mod));
    vc.wm0 = vc.fresh ? wm : vc.wm1; vc.wm1 = wm;
    vc.fresh = false;

    for (let s = 0; s < NS; s++) {
      const sl = vc.sl[s], k = K[s], q = this.pr[s];
      // the pitch envelope and the own envelope go on whether the oscillator sounds or not
      if (p[k.pamt] !== 0) sl.pe *= this.mPe[s].get(-n * LN1000 / (p[k.ptime] * sr));
      if (!this.live[s]) {
        if (p[k.eon] >= 0.5) sl.own.step(n, sr, p[k.ea], p[k.ed], p[k.es], p[k.er], this.mOwnStepD[s], this.mOwnStepR[s]);
        sl.live = false;
        continue;
      }
      const pa = (semis + q.tune + p[k.pamt] * sl.pe - 69) / 12;
      if (pa !== sl.mA) { sl.mA = pa; sl.mF0 = 440 * Math.pow(2, pa); }
      const f0 = sl.mF0;
      sl.f0 = f0;
      const fTop = f0 * this.topMul;
      if (fTop !== sl.mTop || this.fmax !== sl.mFmax) {
        sl.mTop = fTop; sl.mFmax = this.fmax;
        const maxH = Math.floor(this.fmax / fTop);
        sl.mMip = maxH >= 1024 ? 0 : maxH < 1 ? NMIP - 1 : Math.min(NMIP - 1, Math.ceil(Math.log2(1024 / maxH) - 1e-9));
      }
      sl.mip = sl.mMip;
      // scale filter
      if (f0 !== sl.mL2f0) { sl.mL2f0 = f0; sl.mL2 = Math.log2(261.63 / f0); }
      const cut = q.fcut + (1 - q.fkey) * sl.mL2 + q.fenv * mod + p[P.lfo_cut] * this.lfo + q.fvel * (vc.vel - 1);
      // LFO 1 TO RESO: the resonance swings by ± the amount (dB), kept in 0 .. 24
      const res = p[P.lfo_res] > 0 ? Math.min(24, Math.max(0, q.fres + p[P.lfo_res] * this.lfo)) : q.fres;
      // the band gains are a function of (type, cut, slope, res) only: the voice's last ones, or the last ones computed for this oscillator, are reused when those four are the same
      if (sl.mType === q.ftype && sl.mCut === cut && sl.mSlope === q.fslope && sl.mRes === res) this.fg.set(sl.mFg);
      else {
        const m = this.fgMemo[s];
        if (m.type === q.ftype && m.cut === cut && m.slope === q.fslope && m.res === res) this.fg.set(m.fg);
        else { filterGains(q.ftype, cut, q.fslope, res, this.fg); m.type = q.ftype; m.cut = cut; m.slope = q.fslope; m.res = res; m.fg.set(this.fg); }
        sl.mType = q.ftype; sl.mCut = cut; sl.mSlope = q.fslope; sl.mRes = res; sl.mFg.set(this.fg);
      }
      const fresh = !sl.live;   // a note's first block, or the oscillator just came in: the gains start at their target
      if (SLOTS[s].mode === 0) {
        // the voice's place among the sets of each kind of variant (the tables' own kind decides which one is read, renderTable):
        // PHASE: LFO 2's move round the cycle; SPARSITY: the oscillator's sparsity + LFO 1 · LFO 1 TO SPARSITY + LFO 2's move; WIDTH:
        // the source width + LFO 2's move
        let qp = ((this.role2 === ROLE_PHASE ? this.d2 : 0) + (this.role3 === ROLE_PHASE ? this.d3 : 0)) * PHASE_K; qp -= Math.floor(qp / PHASE_K) * PHASE_K;
        const sp = Math.min(1, Math.max(0, p[k.sparsity] + p[P.lfo_sp] * this.lfo + (this.role2 === ROLE_SPARSITY ? this.d2 : 0) + (this.role3 === ROLE_SPARSITY ? this.d3 : 0)));
        const wd = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, p[k.width] + (this.role2 === ROLE_WIDTH ? this.d2 : 0) + (this.role3 === ROLE_WIDTH ? this.d3 : 0)));
        const qs = sp * (SPARSE_K - 1), qw = (wd - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN) * (WIDTH_K - 1);
        sl.vq0[VK_PHASE] = fresh ? qp : sl.vq1[VK_PHASE]; sl.vq1[VK_PHASE] = qp;
        sl.vq0[VK_SPARSITY] = fresh ? qs : sl.vq1[VK_SPARSITY]; sl.vq1[VK_SPARSITY] = qs;
        sl.vq0[VK_WIDTH] = fresh ? qw : sl.vq1[VK_WIDTH]; sl.vq1[VK_WIDTH] = qw;
      }
      if (SLOTS[s].mode === 1) {   // additive: the band envelopes (a returning oscillator starts them again)
        if (fresh) { sl.scale.fill(0); sl.scaleAtk.fill(1); }
        for (let b = 0; b < NB; b++) {
          let lv = sl.scale[b];
          if (sl.scaleAtk[b]) {
            lv += q.atkRate[b];
            if (lv >= 1) { lv = 1; sl.scaleAtk[b] = 0; }
          } else lv = q.sus + (lv - q.sus) * q.decay[b];
          sl.scale[b] = lv;
          this.tmpB[b] = q.bar[b] * lv * this.fg[b];
        }
        for (let b = 0; b < NB; b++) {
          const t = this.tmpB[b] / q.norm;
          if (fresh) sl.g[b] = t;
          sl.tg[b] = t; sl.dg[b] = (t - sl.g[b]) / n;
        }
      } else {
        for (let b = 0; b < NB; b++) {
          const t = this.fg[b];
          if (fresh) sl.g[b] = t;
          sl.tg[b] = t; sl.dg[b] = (t - sl.g[b]) / n;
        }
      }
      let pc = q.pcen + p[P.lfo_pos] * this.lfo; pc -= Math.floor(pc);
      sl.pc = pc;
      sl.pw = Math.min(1, Math.max(q.pwid, 16 * fTop / sr));
      sl.pd = q.pdep;
    }
  };

  // The voice's AMP ENVELOPE for the block, per sample, with the velocity gain (envA); its end state in endLevel / endStage.
  E.ampPass = function (vc, n) {
    const p = this.p, sr = this.sr, env = this.envA;
    let lev = vc.amp.level, st = vc.amp.stage;
    const s = p[P.amp_s];
    const aInc = 1 / (p[P.amp_a] * sr), dC = this.mAmpD.get(-LN1000 / (p[P.amp_d] * sr)), rC = this.mAmpR.get(-LN1000 / (p[P.amp_r] * sr));
    // beta 0.2: the chord's bass note plays louder (vc.gain; exactly the old value when it is 1), and a note dropped by a live chord
    // change fades out in QUICK_REL at most
    const velGain = VOICE_GAIN * (1 - p[P.amp_vel] * (1 - vc.vel)) * vc.gain * this.velVolume(vc);
    const rQ = vc.quick && p[P.amp_r] > QUICK_REL ? this.mAmpQ.get(-LN1000 / (QUICK_REL * sr)) : rC;
    // PUNCH (version 1.0.16): the start of the note boosted by (1 + gP pu), pu falling from 1 in 30 + 20 x PUNCH ms, gP from +8 dB x PUNCH, the whole of it up to C3 and a quarter
    // of it from C6 up (a transient shaper per note: it never lowers the level). PUNCH 0: the loop of before, bit for bit (and no boost left for later).
    const pAmt = p[P.fx_punch];
    if (pAmt > 0) {
      const lowK = Math.min(1, Math.max(0.25, (84 - vc.note) / 36));
      const gP = (Math.exp(8 * pAmt * (Math.LN10 / 20)) - 1) * lowK, pd = Math.exp(-1 / ((0.03 + 0.02 * pAmt) * sr));
      let pu = vc.pu;
      for (let i = 0; i < n; i++) {
        if (st === 1) { lev += aInc; if (lev >= 1) { lev = 1; st = 2; } }
        else if (st === 2) lev = s + (lev - s) * dC;
        else if (st === 3) { lev *= rQ; if (lev < 1e-5) { lev = 0; st = 0; } }
        env[i] = lev * velGain * (1 + gP * pu);
        pu *= pd;
      }
      this.endLevel = lev; this.endStage = st; this.endPunch = pu < 1e-6 ? 0 : pu;
      return;
    }
    for (let i = 0; i < n; i++) {
      if (st === 1) { lev += aInc; if (lev >= 1) { lev = 1; st = 2; } }
      else if (st === 2) lev = s + (lev - s) * dC;
      else if (st === 3) { lev *= rQ; if (lev < 1e-5) { lev = 0; st = 0; } }
      env[i] = lev * velGain;
    }
    this.endLevel = lev; this.endStage = st; this.endPunch = 0;
  };
  // Oscillator s's OWN ENVELOPE for the block, per sample (ownBuf[s]); its end state in ownLevel[s] / ownStage[s].
  E.ownPass = function (vc, s, n) {
    const p = this.p, sr = this.sr, k = K[s], buf = this.ownBuf[s], sl = vc.sl[s];
    let lev = sl.own.level, st = sl.own.stage;
    const sus = p[k.es];
    const aInc = 1 / (p[k.ea] * sr), dC = this.mOwnD[s].get(-LN1000 / (p[k.ed] * sr)), rC = this.mOwnR[s].get(-LN1000 / (p[k.er] * sr));
    let zero = true;
    for (let i = 0; i < n; i++) {
      if (st === 1) { lev += aInc; if (lev >= 1) { lev = 1; st = 2; } }
      else if (st === 2) { lev = sus + (lev - sus) * dC; if (Math.abs(lev - sus) < 1e-9) lev = sus; }
      else if (st === 3) { lev *= rC; if (lev < 1e-5) { lev = 0; st = 0; } }
      buf[i] = lev;
      if (lev !== 0) zero = false;
    }
    this.ownZero[s] = zero ? 1 : 0;
    this.ownLevel[s] = lev; this.ownStage[s] = st;
  };

  // Render one voice's oscillator s for n samples with table set (mode, mips, rms), accumulating into bufL/bufR.
  // Does not modify the voice: the end phases are left in endPh[s] so that several renders of the same oscillator (table
  // crossfade, WAVELET MORPH, phase sets) start from the same state. The output follows the amp envelope (envA), the own
  // envelope when it is on, the crossfade (ramping from fade0 by fadeInc per sample; invert: 1 - fade) and the oscillator's
  // level share gain0 (+ gainInc per sample).
  E.renderVoice = function (vc, n, s, mode, mips, rms, fade0, fadeInc, invert, gain0, gainInc) {
    const sl = vc.sl[s], off = sl.mip * TW, g = sl.g, dg = sl.dg;
    const act = this.active;
    // A fundamental at or above Nyquist can only alias: the wavetable part of such a voice stays silent.
    const audible = sl.f0 < 0.5 * this.sr;
    let na = 0;
    if (audible) for (let b = 0; b < NB; b++) {
      if (rms[sl.mip * NL + b] > 1e-7 && (Math.abs(g[b]) > 1e-6 || Math.abs(g[b] + dg[b] * n) > 1e-6)) act[na++] = b;
    }
    const sr = this.sr, U = this.U;
    const useDry = audible && mode === 0 && sl.pd > 0;
    const gl = this.panL, gr = this.panR, inc = this.inc, ph = this.endPh[s], lg = this.lg;
    for (let u = 0; u < U; u++) { inc[u] = sl.f0 * this.detMul[u] / sr; ph[u] = sl.phase[u]; }
    for (let b = 0; b < NB; b++) lg[b] = g[b];
    const pc = sl.pc, pw = sl.pw, pd = sl.pd;
    const L = this.bufL, R = this.bufR, envA = this.envA, own = this.ownOn[s] ? this.ownBuf[s] : null;
    if (own && this.ownZero[s]) {
      for (let i = 0; i < n; i++) for (let u = 0; u < U; u++) { let x = ph[u] + inc[u]; if (x >= 1) x -= Math.floor(x); ph[u] = x; }
      return;
    }
    const unity = gain0 === 1 && gainInc === 0;
    let fade = fade0, gain = gain0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < na; j++) { const b = act[j]; lg[b] += dg[b]; }
      const fg = fade >= 1 ? 1 : fade;
      let env = envA[i] * (invert ? 1 - fg : fg);
      if (!unity) env *= gain;
      if (own) env *= own[i];
      fade += fadeInc; gain += gainInc;
      let outL = 0, outR = 0;
      for (let u = 0; u < U; u++) {
        let x = ph[u] + inc[u];
        if (x >= 1) x -= Math.floor(x);   // keeps the table position inside the cycle even for steps longer than a cycle
        ph[u] = x;
        const pos = x * N, i0 = pos | 0, fr = pos - i0, base = off + i0 * NL, nx = base + NL;
        let y;
        if (mode === 0) {
          let sum = 0;
          for (let j = 0; j < na; j++) { const b = act[j]; const v0 = mips[base + b]; sum += lg[b] * (v0 + fr * (mips[nx + b] - v0)); }
          if (useDry) {
            const v0 = mips[base + DRY], dry = v0 + fr * (mips[nx + DRY] - v0);
            y = dry + windowValue(x, pc, pw, pd) * (sum - dry);
          } else y = sum;
        } else {
          let first = 0, sum = 0;
          for (let j = 0; j < na; j++) {
            const b = act[j]; const v0 = mips[base + b]; const v = lg[b] * (v0 + fr * (mips[nx + b] - v0));
            if (b === 0) first = v; else sum += v;
          }
          y = pd > 0 ? first + windowValue(x, pc, pw, pd) * sum : first + sum;
        }
        outL += y * gl[u]; outR += y * gr[u];
      }
      L[i] += outL * env; R[i] += outR * env;
    }
  };

  // The sub oscillator: one per voice (not per unison voice), centred, not filtered, following the amp envelope.
  E.renderSub = function (vc, n) {
    const p = this.p, subLvl = p[P.sub_level];
    this.endSubPhase = vc.subPhase;
    if (!(subLvl > 0)) return;
    const subInc = vc.f0 * (Math.round(p[P.sub_oct]) === 1 ? 0.25 : 0.5) / this.sr, subShape = Math.round(p[P.sub_shape]);
    if (!(subInc < 0.5)) return;   // silent when it would alias (above Nyquist)
    const L = this.bufL, R = this.bufR, envA = this.envA;
    let sph = vc.subPhase;
    for (let i = 0; i < n; i++) {
      sph += subInc; if (sph >= 1) sph -= Math.floor(sph);
      const sv = subLvl * subWave(sph, subInc, subShape) * envA[i];
      L[i] += sv; R[i] += sv;
    }
    this.endSubPhase = sph;
  };

  // WAVELET MORPH: without WAVELET 2 tables exactly renderTable (bit-identical sound when the morph is off); with them, the
  // oscillator (share 1 - morph) and the same oscillator built with WAVELET 2 (share morph), the voice's morph moving from wm0
  // to wm1. The oscillator's level moves from m0 to m1 across the block.
  E.renderSlot = function (vc, n, s, t, fade0, fadeInc, invert, m0, m1) {
    if (!t.w2) { this.renderTable(vc, n, s, t, fade0, fadeInc, invert, m0, (m1 - m0) / n); return; }
    const a0 = m0 * (1 - vc.wm0), a1 = m1 * (1 - vc.wm1), b0 = m0 * vc.wm0, b1 = m1 * vc.wm1;
    this.renderTable(vc, n, s, t, fade0, fadeInc, invert, a0, (a1 - a0) / n);
    this.renderTable(vc, n, s, t.w2, fade0, fadeInc, invert, b0, (b1 - b0) / n);
  };

  // SOURCE PHASE moved by LFO 2 (beta 0.4): a subtractive set with its phase sets (t.ph) plays the sets on each side of the
  // voice's place q (share 1 - |q - k| round the cycle), q moving from ap0 to ap1 across the block; the shares of a block
  // start and end each add up to 1. Without phase sets exactly renderVoice. A share of 0 at both ends renders nothing.
  E.renderTable = function (vc, n, s, t, fade0, fadeInc, invert, gain0, gainInc) {
    if (!t.ph) {
      if (gain0 === 0 && gainInc === 0) return;
      this.renderVoice(vc, n, s, t.mode, t.mips, t.rms, fade0, fadeInc, invert, gain0, gainInc);
      return;
    }
    const gain1 = gain0 + gainInc * n;
    const vk = t.vk, KN = VK_N[vk], sl = vc.sl[s], q0 = sl.vq0[vk], q1 = sl.vq1[vk];
    // PHASE wraps round the cycle; SPARSITY and WIDTH stop at their ends (the last set has no neighbour above it)
    const a0 = Math.min(Math.floor(q0), KN - 1) % KN, f0 = q0 - Math.floor(q0), b0 = vk === VK_PHASE ? (a0 + 1) % KN : Math.min(a0 + 1, KN - 1);
    const a1 = Math.min(Math.floor(q1), KN - 1) % KN, f1 = q1 - Math.floor(q1), b1 = vk === VK_PHASE ? (a1 + 1) % KN : Math.min(a1 + 1, KN - 1);
    for (let k = 0; k < KN; k++) {
      const s0 = k === a0 ? 1 - f0 : k === b0 ? f0 : 0, s1 = k === a1 ? 1 - f1 : k === b1 ? f1 : 0;
      if (s0 === 0 && s1 === 0) continue;
      const k0 = gain0 * s0, k1 = gain1 * s1, set = variantSet(t, k);
      this.renderVoice(vc, n, s, set.mode, set.mips, set.rms, fade0, fadeInc, invert, k0, (k1 - k0) / n);
    }
  };

  // Process n samples (any n) into outL/outR (overwrites).
  E.process = function (outL, outR, n) {
    let done = 0;
    while (done < n) {
      const m = Math.min(CTRL, n - done);
      this.block(outL, outR, done, m);
      done += m;
    }
  };

  E.anyVoice = function () { for (let k = 0; k < MAXV; k++) if (this.voices[k].active) return true; return false; };

  // The oscillator shown on the panel, and the level meters
  E.publish = function (pkL, pkR, voices) {
    const d = this.disp, view = Math.round(this.p[P.osc_view]);
    d.peakL = pkL; d.peakR = pkR; d.voices = voices;
    d.view = view; d.mode = SLOTS[view].mode;
    const lv = this.lastVoice >= 0 ? this.voices[this.lastVoice] : null;
    if (lv && lv.active && lv.sl[view].live) {
      const sl = lv.sl[view];
      for (let b = 0; b < NB; b++) d.gains[b] = sl.g[b];
      d.center = sl.pc; d.width = sl.pw; d.depth = sl.pd; d.note = lv.note; d.slotLive = true;
    } else { d.note = lv && lv.active ? lv.note : -1; d.slotLive = false; }
    d.mask = 0;
    if (lv && lv.active) {
      for (let s = 0; s < NS; s++) {
        const sl = lv.sl[s];
        if (!sl.live) continue;
        d.mask |= 1 << s;
        for (let b = 0; b < NB; b++) d.sg[s * NB + b] = sl.g[b];
        d.swin[s * 3] = sl.pc; d.swin[s * 3 + 1] = sl.pw; d.swin[s * 3 + 2] = sl.pd;
      }
    }
  };

  E.block = function (outL, outR, o, n) {
    const p = this.p, L = this.bufL, R = this.bufR;
    this.strumTick(); this.clock += n;   // Okto MultiWave Synth: the strummed chord notes whose time has come
    this.started = true;
    this.lfoTick(n);
    this.lfo2Tick(n);
    this.lfo3Tick(n);
    // Idle: no voice, no table fade, and the output has been silent for longer than any echo takes to come back (the delay's time
    // while it is on, the reverb's lines and the chorus's 4096 more samples): the effects have nothing left to give, so the block
    // is not computed. The master level and the delay time take their values at once, as they would have by the next note.
    if (this.quiet >= this.quietNeed && !this.prev && !this.anyVoice()) {
      outL.fill(0, o, o + n); outR.fill(0, o, o + n);
      this.vol = Math.exp(p[P.master] * (Math.LN10 / 20)); this.dlyT = this.delaySec() * this.sr;
      this.gd = 1; this.gHold = 0;
      if (!this.limRest) this.limReset();
      this.publish(this.disp.peakL, this.disp.peakR, 0);
      return;
    }
    this.limRest = false;
    L.fill(0, 0, n); R.fill(0, 0, n);
    let voices = 0;
    const fading = !!this.prev, fadeInc = fading ? 1 / 512 : 0, fade0 = fading ? this.fade : 1;
    this.prepBlock(n, fading);
    const live = this.live, m0 = this.m0, m1 = this.m1;
    for (let k = 0; k < MAXV; k++) {
      const vc = this.voices[k];
      if (!vc.active || !this.cur) continue;
      this.control(vc, n);
      this.ampPass(vc, n);
      // the FILTER (beta 0.3): the voice is rendered with a unit envelope into its own buffers, filtered, then shaped by the real amp envelope and added to the mix
      const feLev = vc.fe.step(n, this.sr, p[P.vf_a], p[P.vf_d], p[P.vf_s], p[P.vf_r], this.mFeD, this.mFeR);
      let realEnv = null;
      if (this.fltOn) {
        this.fltPrep(vc, n, feLev);
        realEnv = this.envA; this.envA = this.envOne; this.bufL = this.vtL; this.bufR = this.vtR;
        this.vtL.fill(0, 0, n); this.vtR.fill(0, 0, n);
      } else vc.fOn = false;
      for (let s = 0; s < NS; s++) {
        if (!live[s]) continue;
        const sl = vc.sl[s];
        this.ownOn[s] = p[K[s].eon] >= 0.5 ? 1 : 0;
        if (this.ownOn[s]) this.ownPass(vc, s, n);
        this.endPh[s].set(sl.phase);   // a render that is skipped leaves the phases as they were
        if (fading && this.prev.slots[s]) this.renderSlot(vc, n, s, this.prev.slots[s], fade0, fadeInc, true, m0[s], m1[s]);
        if (this.cur.slots[s]) this.renderSlot(vc, n, s, this.cur.slots[s], fade0, fadeInc, false, m0[s], m1[s]);
      }
      this.renderSub(vc, n);
      if (realEnv) { this.envA = realEnv; this.bufL = L; this.bufR = R; this.fltProcess(vc, n); }
      // commit end-of-block state
      vc.amp.level = this.endLevel; vc.amp.stage = this.endStage; vc.pu = this.endPunch;
      vc.subPhase = this.endSubPhase;
      for (let s = 0; s < NS; s++) {
        const sl = vc.sl[s];
        if (live[s]) {
          sl.phase.set(this.endPh[s]); sl.g.set(sl.tg); sl.live = true;
          if (this.ownOn[s]) { sl.own.level = this.ownLevel[s]; sl.own.stage = this.ownStage[s]; }
        } else sl.live = false;
      }
      if (vc.amp.stage === 0) { vc.active = false; vc.gate = false; continue; }
      voices |= 1 << k;
    }
    if (fading) { this.fade += n * fadeInc; if (this.fade >= 1) { this.fade = 1; this.prev = null; } }
    this.polyComp(L, R, n);

    // ---- effects
    const drive = p[P.fx_drive], k = this.mKd.get(drive * 24 * (Math.LN10 / 20));
    if (k !== this.mCompKd) { this.mCompKd = k; this.mComp = 0.5 / Math.tanh(0.5 * k); }
    const comp = this.mComp;
    const fb = p[P.fx_dfb], dmix = p[P.fx_dmix], rmix = p[P.fx_rmix];
    const dTarget = this.delaySec() * this.sr, dlen = this.dlyLen;
    // the Classic reverb (version 1.0.16): DAMP (0.25 = the damping of every earlier version, as before at 48 kHz and the same time constant at other rates), the input path (pre-delay,
    // low cut, stereo input: taken only when one of them is set, else the mono sum of 1.0.15) and WIDTH (1 = each comb bank to its own side, as before)
    const feedback = 0.7 + 0.28 * p[P.fx_rsize], rDamp = p[P.fx_rdamp], damp = this.sr === 48000 ? rDamp : Math.pow(rDamp, 48000 / this.sr);
    const rSt = p[P.fx_rstereo], rWid = p[P.fx_rwidth], rW1 = rWid / 2 + 0.5, rW2 = (1 - rWid) / 2;
    const rpd = p[P.fx_rpre] > 0 ? Math.max(1, Math.min(this.rpLen - 1, Math.round(p[P.fx_rpre] * this.sr))) : 0;
    const rhA = p[P.fx_rhp] > 20 ? Math.exp(-2 * Math.PI * p[P.fx_rhp] / this.sr) : 0, rIn = rSt > 0 || rpd > 0 || rhA > 0;
    const rpL = this.rpL, rpR = this.rpR, rpLen = this.rpLen, rh = this.rh;
    let rpw = this.rpW;
    if (rhA) for (let q = 0; q < 4; q++) if (Math.abs(rh[q]) < 1e-20) rh[q] = 0;
    const volT = this.mVol.get(p[P.master] * (Math.LN10 / 20));
    const kDly = this.kDly, kLp = this.kLp, kVol = this.kVol;
    const chMix = p[P.ch_mix], chLen = this.chLen, chBuf = this.chBuf;
    const chBase = CH_BASE * this.sr, chDepth = p[P.ch_depth] * CH_DEPTH * this.sr;
    const chInc = p[P.ch_rate] / this.sr, chInc2 = chInc * CH_FAST;
    // the chorus's two LFOs as rotating vectors (sin and cos of the phase, turned by one step per sample): two sines and two
    // cosines per block instead of six sines per sample
    let sa = 0, ca = 0, sb = 0, cb = 0, cosA = 1, sinA = 0, cosB = 1, sinB = 0;
    if (chMix > 0) {
      sa = Math.sin(2 * Math.PI * this.chPh); ca = Math.cos(2 * Math.PI * this.chPh);
      sb = Math.sin(2 * Math.PI * this.chPh2); cb = Math.cos(2 * Math.PI * this.chPh2);
      cosA = Math.cos(2 * Math.PI * chInc); sinA = Math.sin(2 * Math.PI * chInc);
      cosB = Math.cos(2 * Math.PI * chInc2); sinB = Math.sin(2 * Math.PI * chInc2);
    }
    const cB = this.cB, cLen = this.cLen, cI = this.cI, cF = this.cF, aB = this.aB, aLen = this.aLen, aI = this.aI;
    let pkL = this.disp.peakL, pkR = this.disp.peakR, bpk = 0;
    const gG = this.guard, gGt = gG.t, kGa = rateCoef(1 - Math.exp(-1 / (gG.att * 48000)), this.sr), kGr = rateCoef(1 - Math.exp(-1 / (gG.rel * 48000)), this.sr), gHoldN = Math.round(gG.hold * this.sr);
    let gd = this.gd, gHold = this.gHold;
    // the look-ahead limiter's state for the block (version 1.0.15)
    const limiter = p[P.out_mode] >= 0.5, limD = this.limD, limB = this.limB, limH = this.limH, limL = this.limL, limR = this.limR;
    const qG = this.limQG, qT = this.limQT, av = this.limAv, kLr = this.kLr;
    let lw = this.limW, limT = this.limT, qh = this.limQh, qn = this.limQn, aw = this.limAw, sum = this.limSum, below = this.limBelow, env = this.limEnv, g = this.limG;
    for (let i = 0; i < n; i++) {
      let l = L[i], r = R[i];
      if (drive > 0) {
        l = (1 - drive) * l + drive * Math.tanh(k * l) * comp;
        r = (1 - drive) * r + drive * Math.tanh(k * r) * comp;
      }
      // string-machine triple chorus: three delay lines swept by a slow and a fast LFO, 120° apart,
      // spread left / centre / right
      chBuf[this.chW] = 0.5 * (l + r);
      if (chMix > 0) {
        this.chPh += chInc; if (this.chPh >= 1) this.chPh -= 1;
        this.chPh2 += chInc2; if (this.chPh2 >= 1) this.chPh2 -= 1;
        let t = sa * cosA + ca * sinA; ca = ca * cosA - sa * sinA; sa = t;
        t = sb * cosB + cb * sinB; cb = cb * cosB - sb * sinB; sb = t;
        let v0 = 0, v1 = 0, v2 = 0;
        for (let c = 0; c < 3; c++) {
          const mo = 0.8 * (sa * CH_COS[c] + ca * CH_SIN[c]) + 0.2 * (sb * CH_COS[c] + cb * CH_SIN[c]);
          let rp = this.chW - (chBase + chDepth * (1 + mo)); if (rp < 0) rp += chLen;
          const i0 = Math.floor(rp), fr = rp - i0; let i1 = i0 + 1; if (i1 >= chLen) i1 = 0;
          const v = chBuf[i0] + fr * (chBuf[i1] - chBuf[i0]);
          if (c === 0) v0 = v; else if (c === 1) v1 = v; else v2 = v;
        }
        l += chMix * ((2 * v0 + v1) / 3 - l);
        r += chMix * ((2 * v2 + v1) / 3 - r);
      }
      if (++this.chW >= chLen) this.chW = 0;
      // ping-pong delay
      this.dlyT += (dTarget - this.dlyT) * kDly;
      if (dmix > 0 || fb > 0) {
        let rp = this.dlyW - this.dlyT; if (rp < 0) rp += dlen;
        const i0 = rp | 0, fr = rp - i0; let i1 = i0 + 1; if (i1 >= dlen) i1 = 0;
        const dl = this.dlyL[i0] + fr * (this.dlyL[i1] - this.dlyL[i0]);
        const dr = this.dlyR[i0] + fr * (this.dlyR[i1] - this.dlyR[i0]);
        this.lpL += (dl - this.lpL) * kLp; this.lpR += (dr - this.lpR) * kLp;
        this.dlyL[this.dlyW] = 0.5 * (L[i] + R[i]) + fb * this.lpR;
        this.dlyR[this.dlyW] = fb * this.lpL;
        l += dmix * dl; r += dmix * dr;
      } else { this.dlyL[this.dlyW] = 0; this.dlyR[this.dlyW] = 0; }
      if (++this.dlyW >= dlen) this.dlyW = 0;
      // reverb (Freeverb topology)
      if (rmix > 0) {
        // its input: the mono sum (1.0.15), or (version 1.0.16) through the pre-delay and the low cut, the left combs hearing more of the left as STEREO rises
        let inL, inR;
        if (rIn) {
          let xl = l, xr = r;
          if (rpd) { rpL[rpw] = xl; rpR[rpw] = xr; let ri = rpw - rpd; if (ri < 0) ri += rpLen; xl = rpL[ri]; xr = rpR[ri]; rpw = rpw + 1 >= rpLen ? 0 : rpw + 1; }
          if (rhA) { let t = rhA * (rh[1] + xl - rh[0]); rh[0] = xl; rh[1] = t; xl = t; t = rhA * (rh[3] + xr - rh[2]); rh[2] = xr; rh[3] = t; xr = t; }
          const m = (xl + xr) * 0.015, s = rSt * (xl - xr) * 0.015;
          inL = m + s; inR = m - s;
        } else inL = inR = (l + r) * 0.015;
        let wl = 0, wr = 0;
        for (let q = 0; q < 16; q++) {
          const buf = cB[q], ci = cI[q], y = buf[ci];
          const f = y * (1 - damp) + cF[q] * damp; cF[q] = f;
          buf[ci] = (q < 8 ? inL : inR) + f * feedback;
          cI[q] = ci + 1 >= cLen[q] ? 0 : ci + 1;
          if (q < 8) wl += y; else wr += y;
        }
        for (let q = 0; q < 8; q++) {
          const buf = aB[q], ai = aI[q], bo = buf[ai], x = q < 4 ? wl : wr;
          buf[ai] = x + bo * 0.5;
          aI[q] = ai + 1 >= aLen[q] ? 0 : ai + 1;
          if (q < 4) wl = bo - x; else wr = bo - x;
        }
        if (rWid === 1) { l += rmix * wl * 1.5; r += rmix * wr * 1.5; }
        else { l += rmix * (wl * rW1 + wr * rW2) * 1.5; r += rmix * (wr * rW1 + wl * rW2) * 1.5; }   // WIDTH (version 1.0.16): the Freeverb's own wet1 / wet2 mix
      }
      // DC blocker (10 Hz), master volume, soft limiter
      const yl = l - this.dcxL + this.dcR * this.dcyL; this.dcxL = l; this.dcyL = Math.abs(yl) < 1e-20 ? 0 : yl; l = this.dcyL;
      const yr = r - this.dcxR + this.dcR * this.dcyR; this.dcxR = r; this.dcyR = Math.abs(yr) < 1e-20 ? 0 : yr; r = this.dcyR;
      this.vol += (volT - this.vol) * kVol;
      l *= this.vol; r *= this.vol;
      // how loud the output stage's input is (the idle rule: when a block is skipped, the delay below holds nothing but silence)
      const ai = Math.abs(l) > Math.abs(r) ? Math.abs(l) : Math.abs(r);
      if (ai > bpk) bpk = ai;
      // the look-ahead limiter's gain (version 1.0.15): the gain this sample needs, its minimum over the last limH samples (a queue of increasing gains), the release,
      // the average over limB samples (exactly 1 while none of them is under 1)
      const gq = ai > LIM_CEIL && ai < 1e9 ? LIM_CEIL / ai : 1;
      // the oldest gain leaves the window BEFORE the new one comes in: the queue never holds more than limH (a long falling peak above the ceiling, a loud low square through
      // the DC blocker, filled it to limH + 1 and overran it)
      if (qn > 0 && qT[qh] <= limT - limH) { qh = qh + 1 >= limH ? 0 : qh + 1; qn--; }
      while (qn > 0) { let b = qh + qn - 1; if (b >= limH) b -= limH; if (qG[b] >= gq) qn--; else break; }
      let e = qh + qn; if (e >= limH) e -= limH;
      qG[e] = gq; qT[e] = limT; qn++;
      limT++;
      const hm = qG[qh];
      if (hm < env) env = hm;
      else if (env < 1) { env += (hm - env) * kLr; if (hm === 1 && 1 - env < 1e-9) env = 1; }
      const old = av[aw]; av[aw] = env; aw = aw + 1 >= limB ? 0 : aw + 1;
      below += (env < 1 ? 1 : 0) - (old < 1 ? 1 : 0);
      if (below === 0) { sum = limB; g = 1; } else { sum += env - old; g = sum / limB; }
      // the delay: the output stage works on the sample of limD samples ago
      const dl = limL[lw], dr = limR[lw]; limL[lw] = l; limR[lw] = r; lw = lw + 1 >= limD ? 0 : lw + 1;
      // Classic, the output stage of 1.0.14: the peak guard (beta 0.3.2), the gain that keeps the larger channel under gT before the soft limiter. It follows the delayed signal in
      // both modes, so that switching OUTPUT finds it in step (no stale gain cut when Classic comes back)
      const aq = Math.abs(dl) > Math.abs(dr) ? Math.abs(dl) : Math.abs(dr), gT = aq > gGt && aq < 1e9 ? gGt / aq : 1;
      if (gT < gd) { gd += (gT - gd) * kGa; gHold = gHoldN; }
      else if (gHold > 0) gHold--;
      else if (gd < 1) { gd += (gT - gd) * kGr; if (gT === 1 && 1 - gd < 1e-9) gd = 1; }
      if (limiter) {
        l = dl * g; r = dr * g;
        l = l > 1 ? 1 : l < -1 ? -1 : l === l ? l : 0;   // never reached by a finite input (the gain keeps it under LIM_CEIL): a safety net
        r = r > 1 ? 1 : r < -1 ? -1 : r === r ? r : 0;
      } else {
        l = softLimit(dl * gd); r = softLimit(dr * gd);
      }
      outL[o + i] = l; outR[o + i] = r;
      const al = Math.abs(l), ar = Math.abs(r);
      if (al > pkL) pkL = al; if (ar > pkR) pkR = ar;
    }
    this.gd = gd; this.gHold = gHold;
    this.limW = lw; this.limT = limT; this.limQh = qh; this.limQn = qn; this.limAw = aw; this.limSum = sum; this.limBelow = below; this.limEnv = env; this.limG = g;
    // how long the output stage's input has been silent, and how long it must stay so before the block is skipped
    if (voices === 0 && !fading && bpk < QUIET_PEAK) this.quiet += n; else this.quiet = 0;
    this.rpW = rpw;
    this.quietNeed = Math.ceil(1.5 * (dmix > 0 || fb > 0 ? Math.max(dTarget, this.dlyT) : 0)) + QUIET_EXTRA + limD + rpd;   // (version 1.0.16: and the reverb's pre-delay)
    this.publish(pkL, pkR, voices);
  };

  // Static gains for displays when no voice is playing (reference note C4, full velocity): the oscillator shown.
  // (beta 0.3: s = the oscillator, the one shown when omitted)
  function staticGains(params, out, s0) {
    const s = s0 === undefined ? Math.round(params[P.osc_view]) : s0, k = K[s], mode = SLOTS[s].mode;
    const fg = filterGains(Math.round(params[k.ftype]), params[k.fcut], params[k.fslope], params[k.fres], new Float64Array(NB));
    if (mode === 0) { for (let b = 0; b < NB; b++) out[b] = fg[b]; return out; }
    let norm = 0;
    for (let b = 0; b < NB; b++) { const bar = params[k.bar1 + b] * Math.exp(params[k.tilt] * b * (Math.LN10 / 20)); norm += bar; out[b] = bar * fg[b]; }
    norm = Math.max(1, norm);
    for (let b = 0; b < NB; b++) out[b] /= norm;
    return out;
  }

  // One display cycle (raw layers, not band-limited) for given gains and window.
  function displayCycle(tb, gains, center, width, depth, out) {
    const L = tb.layers;
    for (let i = 0; i < N; i++) {
      const ph = i / N;
      let y;
      if (tb.mode === 0) {
        let sum = 0; for (let b = 0; b < NB; b++) sum += gains[b] * L[b][i];
        y = depth > 0 ? L[DRY][i] + windowValue(ph, center, width, depth) * (sum - L[DRY][i]) : sum;
      } else {
        let sum = 0; for (let b = 1; b < NB; b++) sum += gains[b] * L[b][i];
        y = gains[0] * L[0][i] + (depth > 0 ? windowValue(ph, center, width, depth) : 1) * sum;
      }
      out[i] = y;
    }
    return out;
  }

  // beta 0.3 (Okto MultiWave Synth): the SCOPE and the SCALOGRAM show the whole sound, not the oscillator shown. buildScopeSets: the raw layers of every
  // oscillator that plays (level above 0; the set of the oscillator shown is passed in, so it is built once).
  function buildScopeSets(params, shown) {
    const view = Math.round(params[P.osc_view]), sets = [];
    for (let s = 0; s < NS; s++) sets.push(params[K[s].lvl] > 0 ? (shown && s === view ? shown : buildSet(params, s, false)) : null);
    return sets;
  }
  // One cycle of the mix at the reference note (C4, full velocity): each oscillator that plays through its own scale filter and position window, at
  // its level and tuning (an octave up shows two of its cycles), plus the sub oscillator; dry (no envelope, no effect).
  // (beta 0.3.1: `live` = { mask, sg, win } from the last voice: an oscillator it plays shows its live gains and window, so the display moves with the sound; else the static ones)
  function globalCycle(params, sets, out, live) {
    out.fill(0);
    const g = new Float64Array(NB), cyc = new Float64Array(N);
    for (let s = 0; s < NS; s++) {
      if (!sets[s]) continue;
      const k = K[s];
      let c = params[k.pcen], w = params[k.pwid], d = params[k.pdep];
      if (live && (live.mask & (1 << s))) { for (let b = 0; b < NB; b++) g[b] = live.sg[s * NB + b]; c = live.win[s * 3]; w = live.win[s * 3 + 1]; d = live.win[s * 3 + 2]; }
      else staticGains(params, g, s);
      displayCycle(sets[s], g, c, w, d, cyc);
      const lvl = params[k.lvl], ratio = Math.pow(2, (12 * params[k.oct] + params[k.semi] + params[k.fine] / 100) / 12);
      for (let i = 0; i < N; i++) {
        const x = i * ratio, f = Math.floor(x), fr = x - f, i0 = f % N, i1 = (i0 + 1) % N;
        out[i] += lvl * (cyc[i0] + fr * (cyc[i1] - cyc[i0]));
      }
    }
    const sub = params[P.sub_level];
    if (sub > 0) {
      const ratio = Math.round(params[P.sub_oct]) === 1 ? 0.25 : 0.5, shape = Math.round(params[P.sub_shape]);
      for (let i = 0; i < N; i++) out[i] += sub * subWave(i / N * ratio, ratio / N, shape);
    }
    return out;
  }
  // The scalogram of the mix: for each oscillator that plays, its coefficients and the scale of each band (level, band scale, size of the atoms,
  // the band's filter gain); the screen shows the root of the sum of the squares.
  function scopeBands(params, sets, live) {
    const r = [], g = new Float64Array(NB), sq = 1 / Math.sqrt(N);
    for (let s = 0; s < NS; s++) {
      if (!sets[s]) continue;
      if (live && (live.mask & (1 << s))) { for (let b = 0; b < NB; b++) g[b] = live.sg[s * NB + b]; }
      else staticGains(params, g, s);
      const sc = new Float64Array(NB);
      for (let b = 1; b <= NB; b++) sc[b - 1] = params[K[s].lvl] * sets[s].bandScale[b - 1] * Math.pow(2, (b - 1) / 2) * sq * Math.abs(g[b - 1]);
      r.push({ coeffs: sets[s].coeffs, sc });
    }
    return r;
  }

  // Shape of one atom of the given wavelet (band 7, centred) for the atom preview.
  function atomShape(waveletIndex) {
    const c = new Float64Array(N); c[64 + 32] = 1;
    const x = idwt(c, FILTERS[waveletIndex]);
    let lo = N, hi = 0;
    for (let i = 0; i < N; i++) if (Math.abs(x[i]) > 1e-9) { lo = Math.min(lo, i); hi = Math.max(hi, i); }
    return { x, lo, hi };
  }

  return {
    N, NB, NL, DRY, NMIP, TW, CTRL, MAXV, PHASE_K, SPARSE_K, WIDTH_K, VK_PHASE, VK_SPARSITY, VK_WIDTH, NS, P, NP, K, SLOTS,
    rng, toPlain, toNorm, format, parse, defaults,
    FILTERS, dwt, idwt, fft, sourceCycle, sparsify, patternCoeffs, buildTables, tableNeeds, morphNeeded, slotVariant, variantNeeded, variantSig,
    filterGains, windowValue, staticGains, displayCycle, buildScopeSets, globalCycle, scopeBands, atomShape, Engine, ladder, tnh, FLT_K,
    NOTE_NAMES, chordName, plateNotes,   // Okto MultiWave Synth
  };
}
if (typeof module !== 'undefined') module.exports = WSCoreFactory;
