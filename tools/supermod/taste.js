// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The owner's taste, learned from his ratings (tools/ratings_beta03.js: the stars he gave in EVALUATE SOUNDS). A candidate of the composer (a row of
// tools/out/lfo3_pool.json: its sparse values `v`, its `meta` — layers, recipes, configuration — and its measures `audit`) becomes a vector of numbers (the
// richness of the voice: unison, detune, chorus, reverb, delay, the attack and release; the filter; the layers and recipes it is made of; the measures)
// and a ridge regression on the rated presets predicts the stars it would get. Few ratings (about 80) and a strong regularisation: it is a way to put the
// candidates that look like the ones he liked first, not an oracle; `loo()` says how well it predicts a rating it has not seen (leave-one-out).
//   const T = require('./taste.js');  const model = T.fit(rows);  model.predict(candidate)  ->  stars (about 1..10)
'use strict';
const SPEC = require('../../web/js/spec.js');
const P = Object.fromEntries(SPEC.PARAMS.map((p, i) => [p.key, p]));
const val = (c, k) => (c.v[k] !== undefined ? c.v[k] : P[k].def);

const LAYERS = ['warmsaw', 'hollowsq', 'reedpulse', 'softtri', 'sinepure', 'sparsesaw', 'buzzsaw', 'gritsaw', 'glassqs', 'pulsar', 'phasesaw', 'phasepulse', 'trigrit', 'noisewash',
  'ticknoise', 'pinghaar', 'zapsine', 'thumptri', 'knockpulse', 'chiff', 'pluckcoif', 'subsine', 'subtri', 'subsq',
  'organ', 'choir', 'hollowbars', 'bellbar', 'glassrand', 'walsh', 'pluckscale', 'airpad', 'bassmirror', 'brassramp', 'mallet', 'clang', 'impulseorg'];
const MODS = ['cutBreath', 'sparseBreath', 'resoWah', 'windowSweep', 'morphLfo', 'ewSwing', 'pitchVib', 'l2Sparse', 'l2Phase', 'l2Width', 'l2Cut', 'l2Reso', 'l2Pos', 'l2WinW', 'l2Morph',
  'l2Tilt', 'l2Odd', 'l2Even', 'l2Sus', 'l2EnvAmt', 'l2Slope', 'l2FltCut', 'l2FltRes', 'envSweep'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// the features of a candidate: [name, value] pairs
function features(c) {
  const f = [];
  const num = (name, x) => f.push([name, x]);
  num('unison', val(c, 'v_unison') - 1); num('detune', val(c, 'v_unison') > 1 ? val(c, 'v_detune') / 10 : 0);
  num('chorus', val(c, 'ch_mix')); num('reverb', val(c, 'fx_rmix')); num('rsize', val(c, 'fx_rsize')); num('delay', val(c, 'fx_dmix'));
  num('attack', Math.log10(clamp(val(c, 'amp_a'), 0.001, 3)) / 3 + 1); num('release', Math.log10(clamp(val(c, 'amp_r'), 0.01, 5)) / 2 + 1); num('sustain', val(c, 'amp_s'));
  num('width', val(c, 'v_width')); num('drive', val(c, 'fx_drive')); num('poly', val(c, 'v_voices') > 1 ? 1 : 0);
  const hasFlt = c.v.vf_cut !== undefined && c.v.vf_cut < 20000;
  num('filter', hasFlt ? 1 : 0); num('fltEnv', hasFlt ? Math.abs(val(c, 'vf_env')) : 0); num('fltRes', hasFlt ? val(c, 'vf_res') : 0); num('fltLow', hasFlt ? Math.log2(val(c, 'vf_cut') / 20) / 10 : 0);
  num('nOsc', (c.meta.cfg.match(/[AB]\d/g) || []).length);
  num('both', val(c, 'lfo2_amt') && val(c, 'lfo3_amt') ? 1 : 0);
  num('lfo2Amt', Math.abs(val(c, 'lfo2_amt'))); num('lfo3Amt', Math.abs(val(c, 'lfo3_amt')));
  num('lfoSlow', Math.log10(clamp(val(c, 'lfo2_rate'), 0.05, 20)) / 1.3 + 0.5);
  num('peak', c.audit.peak || 0); num('motionStatic', (c.audit.motionStatic || 0) / 5); num('motion', (c.audit.motion || 0) / 5);
  num('hf', Math.min(1.5, c.audit.hf || 0)); num('flat', c.audit.flat || 0); num('bass', c.cat === 'Bass' ? 1 : 0); num('perc', c.cat === 'Drums & Perc' ? 1 : 0);
  for (const id of LAYERS) num('L:' + id, c.meta.layers.includes(id) ? 1 : 0);
  const mods = c.meta.mods.map(m => m.replace(/_3$/, ''));
  for (const id of MODS) num('M:' + id, mods.includes(id) ? 1 : 0);
  return f;
}
const NAMES = features({ v: {}, meta: { cfg: 'A1', layers: [], mods: [] }, audit: {}, cat: '' }).map(x => x[0]);
const vec = (c) => features(c).map(x => x[1]);

// ridge regression y ~ w . z + b on standardised features (names: a subset of NAMES, default all of them); indicator features (layers, recipes) are shrunk harder (they have a few
// examples each). With about 80 ratings a small set of features predicts better than all of them: the owner's stars follow the richness of the voice (unison, width, chorus, reverb, delay, release).
function fit(rows, lambda = 6, names = null) {
  const cols = names ? names.map(n => NAMES.indexOf(n)) : NAMES.map((_, j) => j);
  if (cols.some(j => j < 0)) throw new Error('unknown feature');
  const X = rows.map(r => { const v = vec(r.c); return cols.map(j => v[j]); }), y = rows.map(r => r.stars), n = X.length, d = cols.length;
  const mu = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (const x of X) x.forEach((v, j) => { mu[j] += v / n; });
  for (const x of X) x.forEach((v, j) => { sd[j] += (v - mu[j]) ** 2 / n; });
  sd.forEach((s, j) => { sd[j] = Math.sqrt(s) || 1; });
  const my = y.reduce((a, b) => a + b, 0) / n;
  const Z = X.map(x => x.map((v, j) => (v - mu[j]) / sd[j]));
  const lam = cols.map(j => (/^[LM]:/.test(NAMES[j]) ? lambda * 3 : lambda));
  const A = Array.from({ length: d }, () => new Array(d + 1).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) { for (let k = 0; k < d; k++) A[j][k] += Z[i][j] * Z[i][k]; A[j][d] += Z[i][j] * (y[i] - my); }
  for (let j = 0; j < d; j++) A[j][j] += lam[j];
  for (let col = 0; col < d; col++) {   // Gaussian elimination with partial pivoting
    let piv = col; for (let r = col + 1; r < d; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < d; r++) { if (r === col) continue; const f = A[r][col] / A[col][col]; for (let k = col; k <= d; k++) A[r][k] -= f * A[col][k]; }
  }
  const w = A.map((row, j) => row[d] / row[j]);
  return { w, mu, sd, my, names: cols.map(j => NAMES[j]), predict: (c) => { const v = vec(c); let s = my; for (let j = 0; j < d; j++) s += w[j] * (v[cols[j]] - mu[j]) / sd[j]; return s; } };
}
// leave-one-out: the correlation between the predicted and the given stars, and the mean absolute error
function loo(rows, lambda, names = null) {
  const pred = rows.map((r, i) => fit(rows.filter((_, k) => k !== i), lambda, names).predict(r.c));
  const ys = rows.map(r => r.stars), mp = pred.reduce((a, b) => a + b, 0) / pred.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let a = 0, b = 0, c = 0, e = 0;
  pred.forEach((p, i) => { a += (p - mp) * (ys[i] - my); b += (p - mp) ** 2; c += (ys[i] - my) ** 2; e += Math.abs(p - ys[i]); });
  return { r: a / Math.sqrt(b * c || 1), mae: e / pred.length, pred };
}
module.exports = { fit, loo, features, vec, NAMES, LAYERS, MODS };
