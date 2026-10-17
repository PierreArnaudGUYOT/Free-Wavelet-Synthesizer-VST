// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
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
  const LN1000 = Math.log(1000);
  const VOICE_GAIN = 0.4;   // about -8 dB per voice: headroom for chords
  const LIMIT_T = 0.7;      // output soft limiter: transparent below -3 dBFS, never above 0 dBFS
  const CH_BASE = 0.006, CH_DEPTH = 0.003, CH_FAST = 9.7;   // chorus: base delay, sweep per unit of depth (s), fast/slow LFO ratio

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
      case 'abmix': return v <= 0 ? 'A' : v >= 1 ? 'B' : `A ${Math.round((1 - v) * 100)} · B ${Math.round(v * 100)}`;
      default: return v.toFixed(2);
    }
  }
  function parse(p, s) {
    if (p.fmt === 'choice') {
      const i = p.choices.findIndex(c => c.toLowerCase() === String(s).trim().toLowerCase());
      if (i >= 0) return i;
    }
    if (p.fmt === 'abmix') {   // "A", "B", or the B share in percent ("A 70 · B 30" or "30")
      const t = String(s).trim().toUpperCase();
      if (t === 'A') return 0;
      if (t === 'B') return 1;
      const mb = /B\s*([0-9.]+)/.exec(t) || /^([0-9.]+)/.exec(t);
      return mb ? Math.min(1, Math.max(0, parseFloat(mb[1]) / 100)) : null;
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
        for (let n = 0; n < f.L; n++) { const v = a[(2 * k + n) % M]; sa += f.h[n] * v; sd += f.g[n] * v; }
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
        for (let n = 0; n < f.L; n++) { const i = (2 * k + n) % M; x[i] += f.h[n] * ak + f.g[n] * dk; }
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
  function sourceCycle(wave, width) {
    const x = new Float64Array(N);
    const r = rng(12345);
    for (let i = 0; i < N; i++) {
      const ph = i / N;
      switch (wave) {
        case 0: x[i] = 1 - 2 * ph; break;
        case 1: x[i] = ph < 0.5 ? 1 : -1; break;
        case 2: x[i] = ph < width ? 1 : -1; break;
        case 3: x[i] = ph < width ? -1 + 2 * ph / width : 1 - 2 * (ph - width) / (1 - width); break;
        case 4: x[i] = Math.sin(2 * Math.PI * ph); break;
        default: x[i] = r() * 2 - 1; break;
      }
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

  // Which table sets the sound needs: bit 0 = engine A (A/B MIX below B), bit 1 = engine B (MIX above A).
  function tableNeeds(params) {
    const m = params[P.ab_mix];
    return (m < 1 ? 1 : 0) | (m > 0 ? 2 : 0);
  }

  // Builds everything that depends only on structural parameters.
  // withMips=false is used by displays (raw layers of the engine shown on the panel).
  // withMips=true builds what the sound needs: engine A or B alone (A/B MIX at A or at B), or both when they are
  // mixed: then the engine shown on the panel is the main set and the other one is in `alt` ({ mode, mips, rms }).
  function buildTables(params, withMips) {
    const view = Math.round(params[P.engine]);
    if (!withMips) return buildSet(params, view, false);
    const out = buildSound(params, view);
    // WAVELET MORPH (beta 0.3): the same sound built with WAVELET 2, crossfaded with the main one in renderMorph
    if (morphNeeded(params)) {
      const p2 = Float64Array.from(params); p2[P.wavelet] = params[P.wav2];
      const w2 = buildSound(p2, view);
      out.w2 = { mode: w2.mode, mips: w2.mips, rms: w2.rms, alt: w2.alt || null };
    }
    return out;
  }
  function buildSound(params, view) {
    const need = tableNeeds(params);
    if (need !== 3) return buildSet(params, need === 1 ? 0 : 1, true);
    const out = buildSet(params, view, true), alt = buildSet(params, 1 - view, true);
    out.alt = { mode: alt.mode, mips: alt.mips, rms: alt.rms };
    return out;
  }
  // The morph needs the WAVELET 2 tables when it can move away from WAVELET (MORPH, LFO or envelope to the wavelet)
  // and WAVELET 2 is another wavelet.
  function morphNeeded(params) {
    return (params[P.wmorph] > 0 || params[P.lfo_wav] > 0 || params[P.env_wav] !== 0) &&
      Math.round(params[P.wav2]) !== Math.round(params[P.wavelet]);
  }

  function buildSet(params, mode, withMips) {
    const f = FILTERS[Math.round(params[P.wavelet])];
    let c, kept = 0, nonzero = 0;
    const layers = [];
    const bandScale = new Float64Array(NB).fill(1);
    if (mode === 0) {
      const src = sourceCycle(Math.round(params[P.a_wave]), params[P.a_width]);
      c = dwt(src, f);
      c[0] = 0;
      const sp = sparsify(c, params[P.a_sparsity]);
      kept = sp.K; nonzero = sp.nz;
      const dry = new Float64Array(N);
      for (let b = 1; b <= NB; b++) {
        const l = idwt(bandOnly(c, b), f);
        for (let i = 0; i < N; i++) dry[i] += l[i];
        layers.push(l);
      }
      layers.push(dry);
    } else {
      c = patternCoeffs(Math.round(params[P.b_pattern]), Math.round(params[P.b_seed]));
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
        g = Math.pow(10, (boost - att) / 20);
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

  // ------------------------------------------------------------ engine
  function Env() { this.stage = 0; this.level = 0; }
  // stage: 0 idle, 1 attack, 2 decay/sustain, 3 release
  Env.prototype.gate = function (on) { this.stage = on ? 1 : (this.stage ? 3 : 0); };
  Env.prototype.step = function (n, sr, a, d, s, r) {
    if (this.stage === 1) {
      this.level += n / (a * sr);
      if (this.level >= 1) { this.level = 1; this.stage = 2; }
    } else if (this.stage === 2) {
      this.level = s + (this.level - s) * Math.exp(-n * LN1000 / (d * sr));
    } else if (this.stage === 3) {
      this.level *= Math.exp(-n * LN1000 / (r * sr));
      if (this.level < 1e-5) { this.level = 0; this.stage = 0; }
    }
    return this.level;
  };

  function Voice() {
    this.active = false; this.gate = false; this.held = false;
    this.note = 60; this.vel = 1; this.age = 0;
    this.pitch = 60; this.target = 60; this.glide = false;
    this.phase = new Float64Array(4);
    this.subPhase = 0;
    this.amp = new Env(); this.mod = new Env();
    this.scale = new Float64Array(NB); this.scaleAtk = new Uint8Array(NB);
    this.gA = new Float64Array(NB); this.dA = new Float64Array(NB);
    this.gB = new Float64Array(NB); this.dB = new Float64Array(NB);
    this.tA = new Float64Array(NB); this.tB = new Float64Array(NB);
    this.fresh = true;
    this.wm0 = 0; this.wm1 = 0;   // WAVELET MORPH position
  }

  function Engine(sr) {
    this.p = Float64Array.from(defaults());
    this.voices = [];
    for (let i = 0; i < MAXV; i++) this.voices.push(new Voice());
    this.cur = null; this.prev = null; this.fade = 1;
    this.counter = 0; this.lastPitch = 60; this.stack = [];
    this.lfoPhase = 0; this.lfo = 0; this.sh = 0; this.lfoRng = rng(777);
    this.keys = new Uint8Array(128);
    this.tmpA = new Float64Array(NB); this.tmpB = new Float64Array(NB); this.fg = new Float64Array(NB);
    this.active = new Int32Array(NL);
    this.bufL = new Float32Array(CTRL); this.bufR = new Float32Array(CTRL);
    this.panL = new Float64Array(4); this.panR = new Float64Array(4); this.inc = new Float64Array(4);
    this.endPhase = new Float64Array(4); this.lg = new Float64Array(NB); this.endLevel = 0; this.endStage = 0;
    this.disp = { gains: new Float32Array(NB), mode: 0, voices: 0, peakL: 0, peakR: 0, center: 0, width: 1, depth: 0, note: -1 };
    this.lastVoice = -1;
    this.setSampleRate(sr);
  }
  const E = Engine.prototype;

  E.setSampleRate = function (sr) {
    this.sr = sr;
    this.fmax = Math.max(0.45 * sr, sr - 19000);
    this.dlyLen = Math.ceil(sr * 1.1) + 4;
    this.dlyL = new Float32Array(this.dlyLen); this.dlyR = new Float32Array(this.dlyLen);
    this.dlyW = 0; this.dlyT = this.p[P.fx_dtime] * sr; this.lpL = 0; this.lpR = 0;
    const sc = sr / 44100;
    const cT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aT = [556, 441, 341, 225];
    this.combs = []; this.aps = [];
    for (let ch = 0; ch < 2; ch++) {
      for (const t of cT) this.combs.push({ buf: new Float32Array(Math.round((t + ch * 23) * sc)), i: 0, f: 0, ch });
      for (const t of aT) this.aps.push({ buf: new Float32Array(Math.round((t + ch * 23) * sc)), i: 0, ch });
    }
    this.vol = Math.pow(10, this.p[P.master] / 20);
    this.dcR = 1 - 2 * Math.PI * 10 / sr; this.dcxL = 0; this.dcyL = 0; this.dcxR = 0; this.dcyR = 0;
    this.chLen = Math.ceil(sr * 0.03) + 4;
    this.chBuf = new Float32Array(this.chLen); this.chW = 0; this.chPh = 0; this.chPh2 = 0;
    this.mixSm = this.p[P.ab_mix];
  };

  E.setParam = function (id, v) {
    const old = this.p[id];
    this.p[id] = v;
    if (id === P.hold && old >= 0.5 && v < 0.5) {
      for (const vc of this.voices) if (vc.active && vc.held) { vc.held = false; vc.gate = false; vc.amp.gate(false); vc.mod.gate(false); }
    }
  };

  // Tables: { mode, mips, rms }. Switches with a short crossfade.
  E.setTables = function (t) {
    if (!this.cur) { this.cur = t; this.fade = 1; return; }
    this.prev = this.cur; this.cur = t; this.fade = 0;
  };

  // glideOn: this note slides from the previous pitch (portamento mode and legato decide)
  E.trigger = function (vc, note, vel, legato, glideOn) {
    vc.glide = !!glideOn;
    const glide = glideOn ? this.p[P.v_glide] : 0;
    if (!vc.active) {
      vc.fresh = true;
      for (let u = 0; u < 4; u++) vc.phase[u] = (u * 0.618034) % 1;
      vc.subPhase = 0;
      vc.amp.level = 0; vc.mod.level = 0; vc.scale.fill(0);
      // polyphonic portamento: an idle voice glides from its own last pitch (a never-used voice from the last note)
      vc.pitch = glide > 0 ? (vc.age ? vc.pitch : this.lastPitch) : note;
    } else if (glide <= 0) vc.pitch = note;
    vc.active = true; vc.gate = true; vc.held = false;
    vc.note = note; vc.target = note; vc.vel = vel;
    vc.age = ++this.counter;
    if (!legato) { vc.amp.gate(true); vc.mod.gate(true); vc.scaleAtk.fill(1); }
    this.lastPitch = note;
  };

  E.noteOn = function (note, vel) {
    if (vel <= 0) { this.noteOff(note); return; }
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
      for (let k = 1; k < MAXV; k++) if (this.voices[k].active) { this.voices[k].gate = false; this.voices[k].amp.gate(false); this.voices[k].mod.gate(false); }
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

  E.noteOff = function (note) {
    this.keys[note] = 0;
    const hold = this.p[P.hold] >= 0.5;
    if (Math.round(this.p[P.v_voices]) <= 1) {
      const i = this.stack.indexOf(note); if (i >= 0) this.stack.splice(i, 1);
      const vc = this.voices[0];
      if (vc.active && vc.note === note) {
        if (this.stack.length) {
          const n = this.stack[this.stack.length - 1];
          vc.note = n; vc.target = n; vc.glide = Math.round(this.p[P.v_porta]) !== 0;
          if (!vc.glide || this.p[P.v_glide] <= 0) vc.pitch = n;
          this.lastPitch = n;
        } else if (hold) vc.held = true;
        else { vc.gate = false; vc.amp.gate(false); vc.mod.gate(false); }
      }
      return;
    }
    for (const vc of this.voices) if (vc.active && vc.gate && vc.note === note) {
      if (hold) vc.held = true; else { vc.gate = false; vc.amp.gate(false); vc.mod.gate(false); }
    }
  };

  E.allNotesOff = function () {
    this.stack.length = 0; this.keys.fill(0);
    for (const vc of this.voices) if (vc.active) { vc.gate = false; vc.held = false; vc.amp.gate(false); vc.mod.gate(false); }
  };

  // MIDI CC120: silence immediately (voices and effect tails)
  E.allSoundOff = function () {
    this.stack.length = 0; this.keys.fill(0);
    for (const vc of this.voices) { vc.active = false; vc.gate = false; vc.held = false; vc.amp.stage = 0; vc.amp.level = 0; vc.mod.stage = 0; vc.mod.level = 0; }
    this.dlyL.fill(0); this.dlyR.fill(0); this.lpL = 0; this.lpR = 0;
    for (const c of this.combs) { c.buf.fill(0); c.f = 0; }
    for (const a of this.aps) a.buf.fill(0);
    this.chBuf.fill(0);
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
    this.lfoPhase += p[P.lfo_rate] * n / this.sr;
    if (this.lfoPhase >= 1) { this.lfoPhase -= Math.floor(this.lfoPhase); this.sh = this.lfoRng() * 2 - 1; }
  };

  // Per-voice control update for a block of n samples. Returns false if the voice ended.
  E.control = function (vc, n) {
    const p = this.p, sr = this.sr;
    const glide = vc.glide ? p[P.v_glide] : 0;
    if (glide > 0 && vc.pitch !== vc.target) {
      vc.pitch += (vc.target - vc.pitch) * (1 - Math.exp(-n * 4.6 / (glide * sr)));
      if (Math.abs(vc.target - vc.pitch) < 1e-3) vc.pitch = vc.target;
    } else vc.pitch = vc.target;
    const semis = vc.pitch + 12 * p[P.v_oct] + p[P.v_fine] / 100 + 2 * p[P.bend] +
      this.lfo * (p[P.lfo_pitch] + 50 * p[P.modwheel]) / 100;
    const f0 = 440 * Math.pow(2, (semis - 69) / 12);
    vc.f0 = f0;
    const U = Math.round(p[P.v_unison]), det = p[P.v_detune];
    vc.U = U;
    const fTop = f0 * Math.pow(2, (U > 1 ? det : 0) / 1200);
    const maxH = Math.floor(this.fmax / fTop);
    vc.mip = maxH >= 1024 ? 0 : maxH < 1 ? NMIP - 1 : Math.min(NMIP - 1, Math.ceil(Math.log2(1024 / maxH) - 1e-9));

    const mod = vc.mod.step(n, sr, p[P.mod_a], p[P.mod_d], p[P.mod_s], p[P.mod_r]);
    const cut = p[P.f_cutoff] + (1 - p[P.f_keytrk]) * Math.log2(261.63 / f0) + p[P.f_env] * mod +
      p[P.lfo_cut] * this.lfo + p[P.f_vel] * (vc.vel - 1);
    filterGains(Math.round(p[P.f_type]), cut, p[P.f_slope], p[P.f_res], this.fg);

    // Engine B: drawbars, tilt and scale envelope
    let norm = 0;
    const atk = p[P.b_atk], spread = p[P.b_spread], body = p[P.b_body], bright = p[P.b_bright], sus = p[P.b_sus];
    for (let b = 0; b < NB; b++) {
      const bar = p[P.b_bar1 + b] * Math.pow(10, p[P.b_tilt] * b / 20);
      norm += bar;
      const t = b / 10;
      let lv = vc.scale[b];
      if (vc.scaleAtk[b]) {
        lv += n / (atk * Math.pow(16, spread * (t - 0.5)) * sr);
        if (lv >= 1) { lv = 1; vc.scaleAtk[b] = 0; }
      } else {
        const dt = body * Math.pow(bright / body, t);
        lv = sus + (lv - sus) * Math.exp(-n * LN1000 / (dt * sr));
      }
      vc.scale[b] = lv;
      this.tmpB[b] = bar * lv * this.fg[b];
    }
    norm = Math.max(1, norm);
    for (let b = 0; b < NB; b++) {
      const tA = this.fg[b], tB = this.tmpB[b] / norm;
      if (vc.fresh) { vc.gA[b] = tA; vc.gB[b] = tB; }
      vc.tA[b] = tA; vc.tB[b] = tB;
      vc.dA[b] = (tA - vc.gA[b]) / n; vc.dB[b] = (tB - vc.gB[b]) / n;
    }
    // WAVELET MORPH position of this voice (0 = WAVELET, 1 = WAVELET 2): MORPH + LFO + mod envelope, moving from wm0 to
    // wm1 across the block
    const wm = Math.min(1, Math.max(0, p[P.wmorph] + p[P.lfo_wav] * this.lfo + p[P.env_wav] * mod));
    vc.wm0 = vc.fresh ? wm : vc.wm1; vc.wm1 = wm;
    vc.fresh = false;

    let pc = p[P.p_center] + p[P.lfo_pos] * this.lfo; pc -= Math.floor(pc);
    vc.pc = pc;
    vc.pw = Math.min(1, Math.max(p[P.p_width], 16 * fTop / sr));
    vc.pd = p[P.p_depth];
  };

  // Render one voice for n samples with table set t, accumulating into bufL/bufR.
  // Does not modify the voice: the end state is left in this.endLevel/endStage/endPhase
  // so that during a table crossfade both table sets render from the same state.
  // Output gain ramps from fade0 by fadeInc per sample (invert: 1 - fade).
  // gain0/gainInc: the A/B MIX share of this table set (1, 0 when it plays alone); withSub: adds the sub oscillator
  // (once per voice, at full level whatever the mix).
  E.renderVoice = function (vc, n, t, fade0, fadeInc, invert, gain0, gainInc, withSub) {
    const mode = t.mode, mips = t.mips, rms = t.rms;
    const off = vc.mip * TW;
    const g = mode === 0 ? vc.gA : vc.gB, dg = mode === 0 ? vc.dA : vc.dB;
    const act = this.active;
    // A fundamental at or above Nyquist can only alias: the wavetable part of such a voice stays silent.
    const audible = vc.f0 < 0.5 * this.sr;
    let na = 0;
    if (audible) for (let b = 0; b < NB; b++) {
      if (rms[vc.mip * NL + b] > 1e-7 && (Math.abs(g[b]) > 1e-6 || Math.abs(g[b] + dg[b] * n) > 1e-6)) act[na++] = b;
    }
    const p = this.p, sr = this.sr, U = vc.U;
    const useDry = audible && mode === 0 && vc.pd > 0;
    const det = p[P.v_detune], width = p[P.v_width];
    const gl = this.panL, gr = this.panR, inc = this.inc, ph = this.endPhase, lg = this.lg;
    const uGain = 1 / Math.sqrt(U);
    for (let u = 0; u < U; u++) {
      const pos = U > 1 ? 2 * u / (U - 1) - 1 : 0;
      inc[u] = vc.f0 * Math.pow(2, det * pos / 1200) / sr;
      const th = (pos * width + 1) * Math.PI / 4;
      gl[u] = Math.SQRT2 * Math.cos(th) * uGain; gr[u] = Math.SQRT2 * Math.sin(th) * uGain;
      ph[u] = vc.phase[u];
    }
    for (let b = 0; b < NB; b++) lg[b] = g[b];
    const pc = vc.pc, pw = vc.pw, pd = vc.pd;
    const L = this.bufL, R = this.bufR;
    // amp envelope, per sample
    let lev = vc.amp.level, st = vc.amp.stage;
    const s = p[P.amp_s];
    const aInc = 1 / (p[P.amp_a] * sr), dC = Math.exp(-LN1000 / (p[P.amp_d] * sr)), rC = Math.exp(-LN1000 / (p[P.amp_r] * sr));
    const velGain = VOICE_GAIN * (1 - p[P.amp_vel] * (1 - vc.vel));
    // sub oscillator: one per voice (not per unison voice), centred, not filtered
    const subInc = vc.f0 * (Math.round(p[P.sub_oct]) === 1 ? 0.25 : 0.5) / sr, subShape = Math.round(p[P.sub_shape]);
    const subLvl = p[P.sub_level], subOn = withSub && subLvl > 0 && subInc < 0.5;   // silent when it would alias (above Nyquist)
    const unity = gain0 === 1 && gainInc === 0;
    let sph = vc.subPhase;
    let fade = fade0, gain = gain0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < na; j++) { const b = act[j]; lg[b] += dg[b]; }
      if (st === 1) { lev += aInc; if (lev >= 1) { lev = 1; st = 2; } }
      else if (st === 2) lev = s + (lev - s) * dC;
      else if (st === 3) { lev *= rC; if (lev < 1e-5) { lev = 0; st = 0; } }
      const fg = fade >= 1 ? 1 : fade;
      const envBase = lev * velGain * (invert ? 1 - fg : fg);
      const env = unity ? envBase : envBase * gain;
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
      let sv = 0;
      if (subOn) {
        sph += subInc; if (sph >= 1) sph -= Math.floor(sph);
        sv = subLvl * subWave(sph, subInc, subShape);
        if (unity) { outL += sv; outR += sv; }
      }
      if (unity) { L[i] += outL * env; R[i] += outR * env; }
      else { L[i] += outL * env + sv * envBase; R[i] += outR * env + sv * envBase; }
    }
    this.endLevel = lev; this.endStage = st;
    if (withSub) this.endSubPhase = sph;
  };

  // Renders one voice with a table set and, when engines A and B are mixed, its `alt` set: shares 1 - mix (A) and
  // mix (B), moving from m0 to m1 across the block; the sub oscillator is rendered once.
  E.renderSet = function (vc, n, t, fade0, fadeInc, invert, m0, m1) {
    if (!t.alt) { this.renderVoice(vc, n, t, fade0, fadeInc, invert, 1, 0, true); return; }
    const g0 = t.mode === 0 ? 1 - m0 : m0, g1 = t.mode === 0 ? 1 - m1 : m1;
    this.renderVoice(vc, n, t, fade0, fadeInc, invert, g0, (g1 - g0) / n, true);
    this.renderVoice(vc, n, t.alt, fade0, fadeInc, invert, 1 - g0, (g0 - g1) / n, false);
  };

  // WAVELET MORPH: without WAVELET 2 tables exactly renderSet (bit-identical sound when the morph is off); with them, the sound of WAVELET (share
  // 1 - morph) and the same sound built with WAVELET 2 (share morph), the voice's morph moving from wm0 to wm1.
  E.renderMorph = function (vc, n, t, fade0, fadeInc, invert, m0, m1) {
    if (!t.w2) { this.renderSet(vc, n, t, fade0, fadeInc, invert, m0, m1); return; }
    this.renderSetK(vc, n, t, fade0, fadeInc, invert, m0, m1, 1 - vc.wm0, 1 - vc.wm1, true);
    this.renderSetK(vc, n, t.w2, fade0, fadeInc, invert, m0, m1, vc.wm0, vc.wm1, false);
  };
  // renderSet with an extra share k (k0 -> k1 across the block) and the sub oscillator only when withSub
  E.renderSetK = function (vc, n, t, fade0, fadeInc, invert, m0, m1, k0, k1, withSub) {
    if (!t.alt) { this.renderVoice(vc, n, t, fade0, fadeInc, invert, k0, (k1 - k0) / n, withSub); return; }
    const s0 = t.mode === 0 ? 1 - m0 : m0, s1 = t.mode === 0 ? 1 - m1 : m1;
    this.renderVoice(vc, n, t, fade0, fadeInc, invert, s0 * k0, (s1 * k1 - s0 * k0) / n, withSub);
    this.renderVoice(vc, n, t.alt, fade0, fadeInc, invert, (1 - s0) * k0, ((1 - s1) * k1 - (1 - s0) * k0) / n, false);
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

  E.block = function (outL, outR, o, n) {
    const p = this.p, L = this.bufL, R = this.bufR;
    L.fill(0, 0, n); R.fill(0, 0, n);
    this.lfoTick(n);
    let voices = 0;
    const fading = !!this.prev, fadeInc = fading ? 1 / 512 : 0, fade0 = fading ? this.fade : 1;
    // A/B MIX, smoothed (20 ms) so that turning the knob does not click
    const m0 = this.mixSm;
    this.mixSm += (p[P.ab_mix] - this.mixSm) * (1 - Math.exp(-n / (0.02 * this.sr)));
    const m1 = this.mixSm;
    for (let k = 0; k < MAXV; k++) {
      const vc = this.voices[k];
      if (!vc.active || !this.cur) continue;
      this.control(vc, n);
      if (fading) this.renderMorph(vc, n, this.prev, fade0, fadeInc, true, m0, m1);
      this.renderMorph(vc, n, this.cur, fade0, fadeInc, false, m0, m1);
      // commit end-of-block state
      vc.amp.level = this.endLevel; vc.amp.stage = this.endStage;
      for (let u = 0; u < 4; u++) vc.phase[u] = this.endPhase[u];
      vc.subPhase = this.endSubPhase;
      vc.gA.set(vc.tA); vc.gB.set(vc.tB);
      if (vc.amp.stage === 0) { vc.active = false; vc.gate = false; continue; }
      voices |= 1 << k;
    }
    if (fading) { this.fade += n * fadeInc; if (this.fade >= 1) { this.fade = 1; this.prev = null; } }

    // ---- effects
    const drive = p[P.fx_drive], k = Math.pow(10, drive * 24 / 20), comp = 0.5 / Math.tanh(0.5 * k);
    const fb = p[P.fx_dfb], dmix = p[P.fx_dmix], rmix = p[P.fx_rmix];
    const dTarget = p[P.fx_dtime] * this.sr, dlen = this.dlyLen;
    const feedback = 0.7 + 0.28 * p[P.fx_rsize], damp = 0.25;
    const volT = Math.pow(10, p[P.master] / 20);
    const chMix = p[P.ch_mix], chLen = this.chLen, chBuf = this.chBuf;
    const chBase = CH_BASE * this.sr, chDepth = p[P.ch_depth] * CH_DEPTH * this.sr;
    const chInc = p[P.ch_rate] / this.sr, chInc2 = chInc * CH_FAST;
    let pkL = this.disp.peakL, pkR = this.disp.peakR;
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
        let v0 = 0, v1 = 0, v2 = 0;
        for (let c = 0; c < 3; c++) {
          const mo = 0.8 * Math.sin(2 * Math.PI * (this.chPh + c / 3)) + 0.2 * Math.sin(2 * Math.PI * (this.chPh2 + c / 3));
          let rp = this.chW - (chBase + chDepth * (1 + mo)); if (rp < 0) rp += chLen;
          const i0 = Math.floor(rp), fr = rp - i0, i1 = (i0 + 1) % chLen;
          const v = chBuf[i0] + fr * (chBuf[i1] - chBuf[i0]);
          if (c === 0) v0 = v; else if (c === 1) v1 = v; else v2 = v;
        }
        l += chMix * ((2 * v0 + v1) / 3 - l);
        r += chMix * ((2 * v2 + v1) / 3 - r);
      }
      if (++this.chW >= chLen) this.chW = 0;
      // ping-pong delay
      this.dlyT += (dTarget - this.dlyT) * 0.0005;
      if (dmix > 0 || fb > 0) {
        let rp = this.dlyW - this.dlyT; if (rp < 0) rp += dlen;
        const i0 = rp | 0, fr = rp - i0, i1 = (i0 + 1) % dlen;
        const dl = this.dlyL[i0] + fr * (this.dlyL[i1] - this.dlyL[i0]);
        const dr = this.dlyR[i0] + fr * (this.dlyR[i1] - this.dlyR[i0]);
        this.lpL += (dl - this.lpL) * 0.35; this.lpR += (dr - this.lpR) * 0.35;
        this.dlyL[this.dlyW] = 0.5 * (L[i] + R[i]) + fb * this.lpR;
        this.dlyR[this.dlyW] = fb * this.lpL;
        l += dmix * dl; r += dmix * dr;
      } else { this.dlyL[this.dlyW] = 0; this.dlyR[this.dlyW] = 0; }
      if (++this.dlyW >= dlen) this.dlyW = 0;
      // reverb (Freeverb topology)
      if (rmix > 0) {
        const inp = (l + r) * 0.015;
        let wl = 0, wr = 0;
        for (const c of this.combs) {
          const y = c.buf[c.i];
          c.f = y * (1 - damp) + c.f * damp;
          c.buf[c.i] = inp + c.f * feedback;
          if (++c.i >= c.buf.length) c.i = 0;
          if (c.ch === 0) wl += y; else wr += y;
        }
        for (const a of this.aps) {
          const bo = a.buf[a.i], x = a.ch === 0 ? wl : wr;
          a.buf[a.i] = x + bo * 0.5;
          if (++a.i >= a.buf.length) a.i = 0;
          if (a.ch === 0) wl = bo - x; else wr = bo - x;
        }
        l += rmix * wl * 1.5; r += rmix * wr * 1.5;
      }
      // DC blocker (10 Hz), master volume, soft limiter
      const yl = l - this.dcxL + this.dcR * this.dcyL; this.dcxL = l; this.dcyL = Math.abs(yl) < 1e-20 ? 0 : yl; l = this.dcyL;
      const yr = r - this.dcxR + this.dcR * this.dcyR; this.dcxR = r; this.dcyR = Math.abs(yr) < 1e-20 ? 0 : yr; r = this.dcyR;
      this.vol += (volT - this.vol) * 0.002;
      l = softLimit(l * this.vol); r = softLimit(r * this.vol);
      outL[o + i] = l; outR[o + i] = r;
      const al = Math.abs(l), ar = Math.abs(r);
      if (al > pkL) pkL = al; if (ar > pkR) pkR = ar;
    }
    // ---- display state
    const d = this.disp;
    d.peakL = pkL; d.peakR = pkR; d.voices = voices;
    d.mode = this.cur ? this.cur.mode : Math.round(p[P.engine]);
    const lv = this.lastVoice >= 0 ? this.voices[this.lastVoice] : null;
    if (lv && lv.active) {
      const g = d.mode === 0 ? lv.gA : lv.gB;
      for (let b = 0; b < NB; b++) d.gains[b] = g[b];
      d.center = lv.pc; d.width = lv.pw; d.depth = lv.pd; d.note = lv.note;
    } else d.note = -1;
  };

  // Static gains for displays when no voice is playing (reference note C4, full velocity).
  function staticGains(params, out) {
    const fg = filterGains(Math.round(params[P.f_type]), params[P.f_cutoff], params[P.f_slope], params[P.f_res], new Float64Array(NB));
    if (Math.round(params[P.engine]) === 0) { for (let b = 0; b < NB; b++) out[b] = fg[b]; return out; }
    let norm = 0;
    for (let b = 0; b < NB; b++) { const bar = params[P.b_bar1 + b] * Math.pow(10, params[P.b_tilt] * b / 20); norm += bar; out[b] = bar * fg[b]; }
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

  // Shape of one atom of the given wavelet (band 7, centred) for the atom preview.
  function atomShape(waveletIndex) {
    const c = new Float64Array(N); c[64 + 32] = 1;
    const x = idwt(c, FILTERS[waveletIndex]);
    let lo = N, hi = 0;
    for (let i = 0; i < N; i++) if (Math.abs(x[i]) > 1e-9) { lo = Math.min(lo, i); hi = Math.max(hi, i); }
    return { x, lo, hi };
  }

  return {
    N, NB, NL, DRY, NMIP, TW, CTRL, MAXV, P, NP,
    rng, toPlain, toNorm, format, parse, defaults,
    FILTERS, dwt, idwt, fft, sourceCycle, sparsify, patternCoeffs, buildTables, tableNeeds, morphNeeded,
    filterGains, windowValue, staticGains, displayCycle, atomShape, Engine,
  };
}
if (typeof module !== 'undefined') module.exports = WSCoreFactory;
