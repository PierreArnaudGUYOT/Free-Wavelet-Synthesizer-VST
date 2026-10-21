// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The listening of the composer: a preset is rendered with the JS engine the way a player plays it (CHORD MODE with BASS: a chord
// two octaves wide with its louder bass) and measured, because nobody can listen to a thousand candidates:
//   - limDist: how much the soft limiter changes the sound (the same chord 12 dB lower, scaled up, compared with the sound) — a
//     chord whose notes add up beyond the limiter's knee crackles; the other cause of crackle, a burst of high frequencies, is
//     hfBurst (the largest 5 ms of the second difference over its median) and hf (its level over the sound's);
//   - motion: how much the spectrum moves in time (the standard deviation over time of the level of each band, in dB) with the
//     modulation and without it (every LFO amount and the morph at 0): a SuperModulation preset must move, and must not drop out;
//   - contrast: how different two oscillators of the same kind are when each plays alone;
//   - features: a vector for the distinctness of the set (the spectrum at three moments, the envelope, the motion).
'use strict';
const lab = require('../preset_lab.js');
const { C, SPEC, P, sr } = lab;
const SLOT_LVL = ['a1_lvl', 'a2_lvl', 'b1_lvl'];   // beta 0.3: B2 is gone

function fullValues(v) { return SPEC.PARAMS.map(p => (v[p.key] !== undefined ? v[p.key] : p.def)); }

// plays one chord with the chord keyboard: root, type (index in CHORDS), BASS on, FOLDED. Returns { L, R, n, hold }
function chord(values, o = {}) {
  const params = Float64Array.from(values);
  params[P.chord_mode] = 1; params[P.chord_bass] = 1; params[P.chord_voicing] = 1; params[P.chord_type] = o.type === undefined ? 4 : o.type;
  if (o.set) for (const [k, x] of Object.entries(o.set)) params[P[k]] = x;
  const seconds = o.seconds || 4, hold = o.hold || 3, root = o.root || 60;
  const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
  eng.vol = Math.exp(params[P.master] * (Math.LN10 / 20));   // the master level is at its value from the first sample (it would glide from its default)
  eng.setTables(C.buildTables(params, true));
  const n = Math.round(seconds * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128;
  const offAt = Math.round(hold * sr / blk) * blk;
  for (let s = 0; s < n; s += blk) {
    if (s === 0) eng.keyOn(root, o.vel || 0.9);
    if (s === offAt) eng.keyOff(root);
    eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s));
  }
  return { L, R, n, hold, sr, offAt };
}
const mono = (r, a, b) => { const o = new Float64Array(b - a); for (let i = a; i < b; i++) o[i - a] = 0.5 * (r.L[i] + r.R[i]); return o; };
const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };
const peakOf = (r) => { let p = 0; for (let i = 0; i < r.n; i++) p = Math.max(p, Math.abs(r.L[i]), Math.abs(r.R[i])); return p; };

// the limiter's share in the sound: the chord at master - 12 dB, scaled by +12 dB, against the chord as it is
function limiterShare(values, r0, o) {
  const m = SPEC.PARAMS[P.master], low = Math.max(m.min, values[P.master] - 12), gain = Math.pow(10, (values[P.master] - low) / 20);
  const r1 = chord(values, Object.assign({}, o, { set: { master: low } }));
  let d = 0, e = 0;
  for (let i = Math.round(0.05 * sr); i < r0.n; i++) { const a = r0.L[i], b = r1.L[i] * gain; d += (a - b) * (a - b); e += a * a; }
  return e > 0 ? Math.sqrt(d / e) : 0;
}
// bursts of high frequencies: the second difference of the mono sustain
function hfMeasure(r) {
  const x = mono(r, Math.round(0.05 * sr), Math.min(r.offAt, r.n)), y = new Float64Array(x.length);
  for (let i = 2; i < x.length; i++) y[i] = x[i] - 2 * x[i - 1] + x[i - 2];
  // per 5 ms: the high-frequency level over the broadband one (so that a decaying sound is not taken for bursts), for the blocks within
  // 40 dB of the loudest
  const W = Math.round(0.005 * sr), bb = [], hh = [];
  for (let s = 0; s + W <= y.length; s += W) { let e = 0, f = 0; for (let i = s; i < s + W; i++) { e += x[i] * x[i]; f += y[i] * y[i]; } bb.push(Math.sqrt(e / W)); hh.push(Math.sqrt(f / W)); }
  const top = Math.max(...bb, 1e-12), q = [];
  for (let k = 0; k < bb.length; k++) if (bb[k] > top * 0.01) q.push(hh[k] / (bb[k] + 1e-12));
  const sorted = q.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] || 1e-12;
  return { hf: rms(y) / (rms(x) + 1e-12), hfBurst: q.length ? Math.max(...q) / (med + 1e-12) : 1 };
}
// the log-spectrum frames (2048 points, hop 1024) of the mono mix between two times; bands of 1/3 octave from 100 Hz to 10 kHz
const BANDS = []; for (let f = 100; f < 10000; f *= Math.pow(2, 1 / 3)) BANDS.push(f);
function bandFrames(r, t0, t1) {
  const out = [], re = new Float64Array(2048), im = new Float64Array(2048);
  const hann = lab.hann || Float64Array.from({ length: 2048 }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / 2048));
  for (let s = Math.round(t0 * sr); s + 2048 <= Math.min(Math.round(t1 * sr), r.n); s += 1024) {
    for (let i = 0; i < 2048; i++) { re[i] = 0.5 * (r.L[s + i] + r.R[s + i]) * hann[i]; im[i] = 0; }
    C.fft(re, im, false);
    const fr = new Float64Array(BANDS.length);
    for (let b = 0; b < BANDS.length; b++) {
      const lo = Math.max(1, Math.round(BANDS[b] * 2048 / sr)), hi = Math.max(lo + 1, Math.round(BANDS[b] * Math.pow(2, 1 / 3) * 2048 / sr));
      let e = 0; for (let k = lo; k < Math.min(1024, hi); k++) e += re[k] * re[k] + im[k] * im[k];
      fr[b] = 10 * Math.log10(e / 2048 / 2048 + 1e-14);
    }
    out.push(fr);
  }
  return out;
}
// the spread of the spectrum in time: the standard deviation over the frames of each band that matters (within 40 dB of the loudest), averaged
function motionOf(frames0) {
  if (frames0.length < 3) return 0;
  // the shape of the spectrum, not its level: every frame is taken re its own total power (a decaying sound is not "moving")
  const frames = frames0.map(f => { let t = 0; for (const v of f) t += Math.pow(10, v / 10); const db = 10 * Math.log10(t + 1e-20); return f.map(v => v - db); });
  let top = -1e9; for (const f of frames) for (const v of f) top = Math.max(top, v);
  const sds = [];
  for (let b = 0; b < BANDS.length; b++) {
    let mu = 0, mx = -1e9; for (const f of frames) { mu += f[b]; mx = Math.max(mx, f[b]); }
    if (mx < top - 40) continue;
    mu /= frames.length; let v = 0; for (const f of frames) v += (f[b] - mu) * (f[b] - mu);
    sds.push(Math.sqrt(v / frames.length));
  }
  // the four bands that move most (a change of the scale filter, the sparsity or the window is local in frequency: an average over
  // all the bands would dilute it)
  sds.sort((a, b) => b - a);
  const n = Math.min(4, sds.length);
  return n ? sds.slice(0, n).reduce((s, x) => s + x, 0) / n : 0;
}
// the deepest drop of the loudness during the sustain (dB below the sustain's median): no dropouts
function dropout(r) {   // the largest sudden fall of the level (dB) between a 20 ms window and the loudest of the three before it
  const W = Math.round(0.02 * sr), es = [];
  for (let s = Math.round(0.3 * sr); s + W <= Math.min(r.offAt, r.n); s += W) { let e = 0; for (let i = s; i < s + W; i++) e += 0.5 * (r.L[i] * r.L[i] + r.R[i] * r.R[i]); es.push(10 * Math.log10(e / W + 1e-14)); }
  let worst = 0;
  for (let k = 3; k < es.length; k++) worst = Math.max(worst, Math.max(es[k - 1], es[k - 2], es[k - 3]) - es[k]);
  return worst;
}
// the values of the sound with every modulation switched off (static)
function staticValues(values) {
  const v = values.slice();
  for (const k of ['lfo_pitch', 'lfo_cut', 'lfo_pos', 'lfo_wav', 'lfo_sp', 'lfo_res', 'lfo_ew', 'lfo2_amt', 'lfo3_amt']) v[P[k]] = 0;
  return v;
}
function soloValues(values, slot) {
  const v = values.slice();
  SLOT_LVL.forEach((k, s) => { if (s !== slot) v[P[k]] = 0; });
  return v;
}
const SLOT_IDS = ['A1', 'A2', 'B1'];
function meanSpectrum(r, t0, t1) {
  const fr = bandFrames(r, t0, t1), m = new Float64Array(BANDS.length);
  for (const f of fr) for (let b = 0; b < BANDS.length; b++) m[b] += f[b] / fr.length;
  return m;
}
// the distance between two layers' sounds (dB): the mean spectrum and the attack
function layerDistance(values, s1, s2) {
  const a = lab.render(soloValues(values, s1), { note: 60, vel: 0.8, hold: 1.2, tail: 0.3 }), b = lab.render(soloValues(values, s2), { note: 60, vel: 0.8, hold: 1.2, tail: 0.3 });
  const na = (r) => { let pk = 0; for (let i = 0; i < r.n; i++) pk = Math.max(pk, Math.abs(r.L[i])); return pk || 1; };
  const sa = meanSpectrum(a, 0.15, 1.2), sb = meanSpectrum(b, 0.15, 1.2);
  const ga = 20 * Math.log10(na(a)), gb = 20 * Math.log10(na(b));
  let d = 0, c = 0;
  for (let k = 0; k < BANDS.length; k++) { if (Math.max(sa[k], sb[k]) < Math.max(...sa, ...sb) - 50) continue; d += Math.abs((sa[k] - Math.max(...sa)) - (sb[k] - Math.max(...sb))); c++; }
  const ea = lab.envelope(a, 20), eb = lab.envelope(b, 20), pa = Math.max(...ea), pb = Math.max(...eb);
  let de = 0; const m = Math.min(ea.length, eb.length, 60);
  for (let i = 0; i < m; i++) de += Math.abs(Math.max(-50, ea[i] - pa) - Math.max(-50, eb[i] - pb));
  return { spec: c ? d / c : 0, env: de / m, gDiff: Math.abs(ga - gb) };
}

// A sound that decays (no sustain) lives too briefly for its LFOs to be judged inside one note: what the LFO does is that every note starts
// at another point of its cycle, so the notes differ. The same chord played at two moments half an LFO cycle apart (the LFOs run freely):
// how much does the spectrum shape of the first 0.4 s differ (the four bands that differ most, dB)?
function onsetDiff(values) {
  const rate = Math.max(0.3, Math.min(values[P.lfo_rate], 6)), rate2 = Math.max(0.3, Math.min(values[P.lfo2_rate], 6)), rate3 = Math.max(0.3, Math.min(values[P.lfo3_rate], 6));
  const delays = [0.5 / rate, 0.5 / rate2, 0.5 / rate3, 0.25 / rate, 0.25 / rate2, 0.25 / rate3].map(d => Math.min(1.6, Math.max(0.12, d)));
  const shape = (r, t0) => {
    const m = meanSpectrum(r, t0 + 0.02, t0 + 0.42);
    let t = 0; for (const v of m) t += Math.pow(10, v / 10);
    const db = 10 * Math.log10(t + 1e-20); return m.map(v => v - db);
  };
  const play = (delay) => {
    const params = Float64Array.from(values);
    params[P.chord_mode] = 1; params[P.chord_bass] = 1; params[P.chord_voicing] = 1; params[P.chord_type] = 4;
    const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
    eng.vol = Math.exp(params[P.master] * (Math.LN10 / 20));
    eng.setTables(C.buildTables(params, true));
    const n = Math.round((delay + 1) * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128, at = Math.round(delay * sr / blk) * blk;
    for (let s = 0; s < n; s += blk) { if (s === at) eng.keyOn(60, 0.9); eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s)); }
    return { L, R, n, sr, offAt: n, t0: at / sr };
  };
  const base = play(0.05), a = shape(base, 0.05);
  let best = 0;
  for (const d of delays) {
    const r = play(0.05 + d), b = shape(r, 0.05 + d);
    const diffs = a.map((v, i) => Math.abs(v - b[i])).sort((x, y) => y - x).slice(0, 4);
    best = Math.max(best, diffs.reduce((s, x) => s + x, 0) / 4);
  }
  return best;
}

// ---- the whole audit of one preset (values = the full parameter array). o.contrast: [[slotA, slotB], ...] the pairs to compare
function audit(values, o = {}) {
  const out = {};
  const dur = o.seconds || 4.2, hold = dur - 1;
  const r60 = chord(values, { root: 60, seconds: dur, hold });
  const r72 = chord(values, { root: 76, type: 1, seconds: 3, hold: 2.2 });
  out.peak = Math.max(peakOf(r60), peakOf(r72));
  out.limDist = Math.max(limiterShare(values, r60, { root: 60, seconds: dur, hold }), limiterShare(values, r72, { root: 76, type: 1, seconds: 3, hold: 2.2 }));
  const h60 = hfMeasure(r60), h72 = hfMeasure(r72);
  out.hf = Math.max(h60.hf, h72.hf); out.hfBurst = Math.max(h60.hfBurst, h72.hfBurst);
  out.dropout = dropout(r60);
  // noise-likeness of a single note after 400 ms (0 = tonal, 1 = noise): the sound has to keep a pitch
  const r1 = lab.render(values, { note: 60, vel: 0.8, hold: 1.2, tail: 0.2 });
  out.flat = lab.flatness(r1, Math.round(0.4 * sr));
  out.decaying = values[P.amp_s] < 0.15;
  if (o.stage1 && o.stage1(out)) { out.stopped = 1; return out; }   // refused already: the rest costs more than it is worth
  // the motion is judged with the LFOs not slower than 0.45 Hz (a pad's 0.06 Hz needs a quarter of a minute to show what it does, the
  // depth is the same): the same sound with its LFOs sped up, against the same with every amount at 0
  const quick = values.slice();
  for (const [kr, ka] of [['lfo_rate', null], ['lfo2_rate', 'lfo2_amt'], ['lfo3_rate', 'lfo3_amt']]) {
    const on = ka ? quick[P[ka]] !== 0 : ['lfo_cut', 'lfo_pos', 'lfo_wav', 'lfo_sp', 'lfo_res', 'lfo_ew'].some(k => quick[P[k]] > 0);
    if (on && quick[P[kr]] < 0.45) quick[P[kr]] = 0.45;
  }
  const rq = chord(quick, { root: 60, seconds: dur, hold });
  const frames = bandFrames(rq, 0.45, hold);
  out.motion = motionOf(frames);
  const rs = chord(staticValues(quick), { root: 60, seconds: dur, hold });
  out.motionStatic = motionOf(bandFrames(rs, 0.45, hold));
  out.moveDelta = out.motion - out.motionStatic;
  // difference of the modulated and the static sound: the largest band of the mean spectrum that moved
  const ms = meanSpectrum(r60, 0.45, hold), mt = meanSpectrum(rs, 0.45, hold);
  let dm = 0, dc = 0; for (let b = 0; b < BANDS.length; b++) { if (Math.max(ms[b], mt[b]) < Math.max(...ms) - 40) continue; dm += Math.abs(ms[b] - mt[b]); dc++; }
  out.modShift = dc ? dm / dc : 0;
  if (out.decaying && !o.noOnset) out.onsetDiff = onsetDiff(values);
  if (o.stage2 && o.stage2(out)) { out.stopped = 2; return out; }
  out.contrast = (o.pairs || []).map(([a, b]) => layerDistance(values, a, b));
  out.frames = frames;
  // features for the distinctness: mean spectrum at three moments (re the loudest band), envelope, motion
  const f = [];
  for (const [t0, t1] of [[0.02, 0.15], [0.3, 1.0], [1.5, hold]]) { const m = meanSpectrum(r60, t0, Math.max(t1, t0 + 0.12)), mx = Math.max(...m); for (const v of m) f.push(Math.max(-50, v - mx)); }
  const env = lab.envelope(r60, 20), pk = Math.max(...env);
  for (const ms2 of [40, 100, 300, 800, 1500, 2500]) f.push(Math.max(-50, env[Math.min(env.length - 1, Math.round(ms2 / 20))] - pk) * 0.6);
  f.push(out.motion * 2, out.modShift * 2);
  out.features = f;
  out.r60 = r60;
  return out;
}

// ---- the verdicts (the worker stops early, the selection checks again). Each returns the reason of a refusal, or null.
const SUSTAINED = new Set(['pad', 'strings', 'organ', 'lead', 'bass', 'brass']);
function judgeSound(a, kind) {
  const sus = SUSTAINED.has(kind), perc = kind === 'perc';   // drums are made of noise and clicks, and fall silent: only the real defects count
  if (!isFinite(a.peak) || a.peak < 0.25) return 'quiet or silent';
  if (a.peak > 0.97) return 'peak';
  if (a.limDist > 0.004) return 'limiter share';
  if (a.hfBurst > (perc ? 200 : sus ? 7 : kind === 'fx' ? 60 : 30)) return 'hf bursts';
  if (a.hf > (perc ? 2.5 : kind === 'fx' ? 1.5 : sus ? 0.9 : 1.1)) return 'too much high frequency';
  if (a.dropout > (perc ? 1000 : kind === 'fx' ? 30 : sus ? 9 : 16)) return 'drop-outs';
  if (a.flat > (perc ? 0.97 : kind === 'fx' ? 0.6 : 0.25)) return 'noise-like';
  return null;
}
// the four bands that move most move by more than 3 dB (standard deviation) more than they do without the modulation: SuperModulation
// is bold, the other categories only need to be alive
function judgeMotion(a, cat) {
  // a decaying sound (plucks, bells, mallets) is judged by how much its notes differ with the LFO phase (onsetDiff) as well
  const delta = a.decaying && a.onsetDiff !== undefined ? Math.max(a.moveDelta, a.onsetDiff) : a.moveDelta;
  if (cat === 'SuperModulation') return delta < 3 || (a.motion < 4.5 && !(a.decaying && a.onsetDiff >= 4)) ? 'SuperModulation does not move enough' : null;
  return delta < 1 ? 'modulation inaudible' : null;
}
function judgeContrast(a) {
  for (const c of a.contrast) if (c.spec < 4.5 && c.env < 4.5) return 'two oscillators of a kind too alike';
  return null;
}
module.exports = { onsetDiff, judgeSound, judgeMotion, judgeContrast, audit, chord, fullValues, hfMeasure, limiterShare, motionOf, bandFrames, meanSpectrum, staticValues, SLOT_IDS, BANDS, peakOf };
