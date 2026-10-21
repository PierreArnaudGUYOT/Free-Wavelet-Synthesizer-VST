// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The owner's taste, refitted on his second listening (tools/out/filter_rated.json, made by tools/supermod/filter_data.js: 627 presets with their stars and the measures of audit.js).
// Unlike tools/supermod/taste.js (the features of a composer candidate: its layers and recipes, known only for the presets the composer made) the features here come from the values
// of the preset and from the measures alone, so that every rated preset - the 001-500 ones, the TOP Sounds and the ones the composer made - and every new candidate can be put in the model:
//   - the voice: unison, detune, width, chorus, reverb, delay, drive, attack, decay, sustain, release, polyphony, octave, the master volume and the measures (peak, high frequencies, noise);
//   - the oscillators: which play, their waves, wavelets (rough / mid / clean), additive patterns, octaves, sparsity, the scale filter;
//   - the modulation: the LFOs' amounts, rates and targets;
//   - the FILTER: cutoff, resonance, envelope, key tracking, drive, type, an LFO aimed at it;
//   - the category (the four he rated in numbers) and `legacy` (the TOP Sounds of the first synthesizer, rated in another listening).
// `fit(rows, lambda, names)` is a ridge regression on standardised features (the leave-one-out error comes from the hat matrix, without refitting); `loo`, `report` and the command line give the
// correlations and the weights. The batch builders (tools/supermod/filter_build.js, fav_build.js) fit it when they select (lambda 30: leave-one-out correlation 0.56 on the 627 rated presets, 0.37 on
// the 606 new ones alone, 0.27 for the 11 features of taste.js).
//   node tools/supermod/filter_taste.js              the findings (what he likes, what he rejects), the leave-one-out correlation of several feature sets
//   const T = require('./filter_taste.js');  const m = T.fit(rows, 12);  m.predict(row)  ->  stars (about 1..10)       (a row: { v: full values, cat, audit: {...} })
'use strict';
const fs = require('fs');
const path = require('path');
const SPEC = require('../../web/js/spec.js');
const OUT = path.join(__dirname, '..', 'out');
const KEY = Object.fromEntries(SPEC.PARAMS.map((p, i) => [p.key, i]));
const CATS = ['SuperModulation', 'Bass', 'Lead', 'Keys', 'Organ', 'Pad', 'Strings', 'Brass & Wind', 'Pluck', 'Bells & Mallets', 'FX', 'Drums & Perc'];
const RATED_CATS = ['SuperModulation', 'Bass', 'Lead', 'Keys'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const WAVES = ['saw', 'square', 'pulse', 'tri', 'sine', 'noise'], PATTERNS = ['ramp', 'mirror', 'alt', 'walsh', 'impulse', 'random'];
const WCLASS = (w) => ([0, 1].includes(w) ? 'rough' : [2, 4, 5].includes(w) ? 'mid' : 'clean');   // Haar, db2 | db4, sym8, coif3 | db8, db20 (as layers.js wclass)
// which LFO 2 / 3 target a number is (spec LFO2_TARGETS order): grouped for the model
const TGROUP = { 0: 'scaleCut', 1: 'scaleCut', 2: 'scaleRes', 3: 'scaleCut', 4: 'scaleCut', 5: 'scaleCut', 6: 'window', 7: 'window', 8: 'window', 9: 'phase', 10: 'sparsity', 11: 'phase', 12: 'additive', 13: 'additive', 14: 'additive', 15: 'additive', 16: 'morph', 17: 'fltCut', 18: 'fltRes' };
const TG = ['scaleCut', 'scaleRes', 'window', 'phase', 'sparsity', 'additive', 'morph', 'fltCut', 'fltRes'];

// the features of a row ({ v: full values, cat, audit }): [name, value] pairs
function features(c) {
  const g = (k) => c.v[KEY[k]], f = [], num = (n, x) => f.push([n, x]);
  const a = c.audit || {};
  // the voice
  const uni = g('v_unison');
  num('unison', uni - 1); num('detune', uni > 1 ? g('v_detune') / 10 : 0); num('width', g('v_width')); num('chorus', g('ch_mix')); num('reverb', g('fx_rmix')); num('rsize', g('fx_rsize'));
  num('delay', g('fx_dmix')); num('drive', g('fx_drive'));
  num('attack', Math.log10(clamp(g('amp_a'), 0.001, 3)) / 3 + 1); num('decay', Math.log10(clamp(g('amp_d'), 0.01, 10)) / 3 + 0.7); num('sustain', g('amp_s'));
  num('release', Math.log10(clamp(g('amp_r'), 0.01, 5)) / 2 + 1); num('mono', g('v_voices') === 1 ? 1 : 0); num('octave', g('v_oct')); num('master', g('master') / 10);
  num('subOsc', g('sub_level') > 0 ? 1 : 0);
  // the measures
  num('peak', a.peak || 0); num('hf', Math.min(1.5, a.hf || 0)); num('hfBurst', Math.min(60, a.hfBurst || 0) / 20); num('flat', a.flat || 0); num('motion', (a.motion || 0) / 5);
  num('motionStatic', (a.motionStatic || 0) / 5); num('modShift', (a.modShift || 0) / 5);
  // the oscillators
  const lv = ['a1_lvl', 'a2_lvl', 'b1_lvl'].map(k => g(k)), on = lv.map(x => x > 0.02);
  num('nOsc', on.filter(Boolean).length); num('A1', on[0] ? 1 : 0); num('A2', on[1] ? 1 : 0); num('B1', on[2] ? 1 : 0);
  const wcount = {}, pcount = {}, ccount = {};
  let sparse = 0, nA = 0, fcut = 0, fres = 0, nonLp = 0, low = 0, oct = 0, fenvA = 0, pen = 0, ownEnv = 0;
  [['a', 0], ['a2', 1]].forEach(([pre, s]) => {
    if (!on[s]) return;
    const k = (n) => (pre === 'a' ? { wave: 'a_wave', sparsity: 'a_sparsity', cut: 'f_cutoff', res: 'f_res', type: 'f_type', wavelet: 'wavelet', oct: 'a1_oct', env: 'f_env', pamt: 'a1_pamt', eon: 'a1_eon' }[n] : { wave: 'a2_wave', sparsity: 'a2_sparsity', cut: 'a2_fcut', res: 'a2_fres', type: 'a2_ftype', wavelet: 'a2_wavelet', oct: 'a2_oct', env: 'a2_fenv', pamt: 'a2_pamt', eon: 'a2_eon' }[n]);
    nA++; const w = WAVES[g(k('wave'))]; wcount[w] = (wcount[w] || 0) + 1; sparse += g(k('sparsity')); fcut += g(k('cut')); fres += g(k('res')); if (g(k('type')) !== 0) nonLp++;
    const cl = WCLASS(g(k('wavelet'))); ccount[cl] = (ccount[cl] || 0) + 1; if (g(k('oct')) < 0) low++; oct += g(k('oct')); fenvA += Math.abs(g(k('env'))); if (g(k('pamt')) > 1) pen++; if (g(k('eon'))) ownEnv++;
  });
  if (on[2]) {
    const pt = PATTERNS[g('b_pattern')]; pcount[pt] = 1; const cl = WCLASS(g('b1_wavelet')); ccount[cl] = (ccount[cl] || 0) + 1; if (g('b1_oct') < 0) low++; oct += g('b1_oct');
    if (g('b1_eon')) ownEnv++; if (g('b1_pamt') > 1) pen++;
  }
  const nAll = Math.max(1, on.filter(Boolean).length);
  for (const w of WAVES) num('wave:' + w, (wcount[w] || 0) / Math.max(1, nA));
  for (const p of PATTERNS) num('pat:' + p, pcount[p] || 0);
  for (const cl of ['rough', 'mid', 'clean']) num('wavelet:' + cl, (ccount[cl] || 0) / nAll);
  num('sparsity', nA ? sparse / nA : 0); num('scaleCut', nA ? fcut / nA / 12 : 0.5); num('scaleRes', nA ? fres / nA / 12 : 0); num('scaleNonLp', nonLp > 0 ? 1 : 0); num('scaleEnv', nA ? fenvA / nA / 6 : 0);
  num('lowOsc', low > 0 ? 1 : 0); num('octMean', oct / nAll); num('pitchEnv', pen > 0 ? 1 : 0); num('ownEnv', ownEnv / nAll);
  num('level2', on[0] && on[1] ? Math.min(lv[0], lv[1]) : 0);
  // the modulation
  const l1 = ['lfo_cut', 'lfo_pos', 'lfo_wav', 'lfo_sp', 'lfo_res', 'lfo_ew'].map(k => g(k)), vib = g('lfo_pitch');
  num('lfo1Amount', (l1[0] / 6 + l1[1] / 0.5 + l1[2] + l1[3] + l1[4] / 24 + l1[5]) / 3); num('vibrato', vib / 20);
  const a2 = Math.abs(g('lfo2_amt')), a3 = Math.abs(g('lfo3_amt'));
  num('lfo2Amt', a2); num('lfo3Amt', a3); num('bothLfo', a2 > 0 && a3 > 0 ? 1 : 0); num('lfoRate', Math.log10(clamp(a2 >= a3 ? g('lfo2_rate') : g('lfo3_rate'), 0.05, 20)) / 1.3 + 0.5);
  num('lfo1Rate', (l1.some(x => x > 0) || vib > 0) ? Math.log10(clamp(g('lfo_rate'), 0.05, 20)) / 1.3 + 0.5 : 0);
  const tg = {}; for (const [am, t] of [[a2, g('lfo2_target')], [a3, g('lfo3_target')]]) if (am > 0) tg[TGROUP[t]] = 1;
  for (const t of TG) num('lfoTo:' + t, tg[t] || 0);
  num('morph', g('wmorph') > 0 || g('lfo_wav') > 0 || g('env_wav') !== 0 ? 1 : 0); num('modEnv', Math.abs(g('env_wav')) + (g('mod_a') > 0 ? 0 : 0));
  // the FILTER
  const has = g('vf_cut') < 20000 || g('vf_res') > 0 || g('vf_drive') > 0 || g('vf_env') !== 0;
  num('filter', has ? 1 : 0); num('fltCut', has ? Math.log2(g('vf_cut') / 20) / 10 : 0); num('fltRes', has ? g('vf_res') : 0); num('fltEnv', has ? Math.abs(g('vf_env')) : 0);
  num('fltKey', has ? g('vf_key') : 0); num('fltDrive', has ? g('vf_drive') : 0); num('fltOta', has && g('vf_type') === 1 ? 1 : 0); num('fltLfo', (tg.fltCut || tg.fltRes) ? 1 : 0);
  // the category (only the four he rated in numbers: the others have a handful of TOP Sounds), and the TOP Sounds of the first synthesizer, rated in another listening: 1 for them, 0 for every new preset
  for (const cat of RATED_CATS) num('cat:' + cat, c.cat === cat ? 1 : 0);
  num('legacy', c.legacy ? 1 : 0);
  return f;
}
const NAMES = features({ v: SPEC.PARAMS.map(p => p.def), cat: '', legacy: false }).map(x => x[0]);
const vec = (c) => features(c).map(x => x[1]);

// ---- ridge regression, intercept free, on standardised features. fit(rows[{ c, stars }], lambda, names) -> model
function solve(A, b) {   // Gauss-Jordan with partial pivoting (A d x d, b d x m)
  const d = A.length, m = b[0].length, M = A.map((r, i) => r.concat(b[i]));
  for (let col = 0; col < d; col++) {
    let piv = col; for (let r = col + 1; r < d; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const pv = M[col][col];
    for (let k = col; k < d + m; k++) M[col][k] /= pv;
    for (let r = 0; r < d; r++) { if (r === col) continue; const fct = M[r][col]; if (fct === 0) continue; for (let k = col; k < d + m; k++) M[r][k] -= fct * M[col][k]; }
  }
  return M.map(r => r.slice(d));
}
function design(rows, names) {
  const cols = names ? names.map(n => NAMES.indexOf(n)) : NAMES.map((_, j) => j);
  if (cols.some(j => j < 0)) throw new Error('unknown feature');
  const X = rows.map(r => { const v = r.vec || (r.vec = vec(r.c)); return cols.map(j => v[j]); });
  return { cols, X };
}
function fit(rows, lambda = 10, names = null) {
  const { cols, X } = design(rows, names), y = rows.map(r => r.stars), n = X.length, d = cols.length;
  const mu = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (const x of X) x.forEach((v, j) => { mu[j] += v / n; });
  for (const x of X) x.forEach((v, j) => { sd[j] += (v - mu[j]) ** 2 / n; });
  sd.forEach((s, j) => { sd[j] = Math.sqrt(s) || 1; });
  const my = y.reduce((a, b) => a + b, 0) / n, Z = X.map(x => x.map((v, j) => (v - mu[j]) / sd[j]));
  const A = Array.from({ length: d }, (_, j) => Array.from({ length: d }, (_, k) => (j === k ? lambda : 0))), b = Array.from({ length: d }, () => [0]);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) { for (let k = 0; k < d; k++) A[j][k] += Z[i][j] * Z[i][k]; b[j][0] += Z[i][j] * (y[i] - my); }
  const w = solve(A, b).map(r => r[0]);
  return { w, mu, sd, my, lambda, names: cols.map(j => NAMES[j]), cols, predict: (c) => { const v = vec(c); let s = my; for (let j = 0; j < d; j++) s += w[j] * (v[cols[j]] - mu[j]) / sd[j]; return s; } };
}
// leave-one-out predictions by the hat matrix: e_i / (1 - h_ii) (the intercept is the mean of the training set: exact enough for a ranking)
function loo(rows, lambda = 10, names = null) {
  const { X } = design(rows, names), y = rows.map(r => r.stars), n = X.length, d = X[0].length;
  const mu = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (const x of X) x.forEach((v, j) => { mu[j] += v / n; });
  for (const x of X) x.forEach((v, j) => { sd[j] += (v - mu[j]) ** 2 / n; });
  sd.forEach((s, j) => { sd[j] = Math.sqrt(s) || 1; });
  const my = y.reduce((a, b) => a + b, 0) / n, Z = X.map(x => x.map((v, j) => (v - mu[j]) / sd[j]));
  const A = Array.from({ length: d }, (_, j) => Array.from({ length: d }, (_, k) => (j === k ? lambda : 0)));
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) for (let k = 0; k < d; k++) A[j][k] += Z[i][j] * Z[i][k];
  const I = Array.from({ length: d }, (_, j) => Array.from({ length: d }, (_, k) => (j === k ? 1 : 0))), Ainv = solve(A, I);
  const pred = [];
  for (let i = 0; i < n; i++) {
    let h = 1 / n;   // the intercept's part of the leverage
    const t = new Array(d).fill(0); for (let j = 0; j < d; j++) for (let k = 0; k < d; k++) t[j] += Ainv[j][k] * Z[i][k];
    for (let j = 0; j < d; j++) h += Z[i][j] * t[j];
    pred.push(h);
  }
  // the fit on all the rows, then the leave-one-out prediction from its residuals
  const bvec = Array.from({ length: d }, () => [0]);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) bvec[j][0] += Z[i][j] * (y[i] - my);
  const w = solve(A, bvec).map(r => r[0]);
  const out = rows.map((_, i) => { let p = my; for (let j = 0; j < d; j++) p += w[j] * Z[i][j]; const e = y[i] - p; return y[i] - e / (1 - pred[i]); });
  const mp = out.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0, mae = 0; out.forEach((p, i) => { sxy += (p - mp) * (y[i] - my); sxx += (p - mp) ** 2; syy += (y[i] - my) ** 2; mae += Math.abs(p - y[i]); });
  return { r: sxy / Math.sqrt(sxx * syy || 1), mae: mae / n, pred: out };
}
function corr(a, b) {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (a[i] - ma) * (b[i] - mb); sxx += (a[i] - ma) ** 2; syy += (b[i] - mb) ** 2; }
  return sxy / Math.sqrt(sxx * syy || 1);
}
function load() { return JSON.parse(fs.readFileSync(path.join(OUT, 'filter_rated.json'), 'utf8')).filter(r => r.audit).map(r => ({ c: { v: r.v, cat: r.cat, audit: r.audit, legacy: !/^[0-9]/.test(r.name) }, stars: r.stars, num: r.num, name: r.name, src: r.src })); }

// feature sets compared (the leave-one-out correlation says which one predicts a rating it has not seen)
const SETS = {
  'taste.js (11)': ['unison', 'chorus', 'reverb', 'delay', 'peak', 'mono', 'hf', 'attack', 'release', 'width'],
  'voice + measures': ['unison', 'detune', 'width', 'chorus', 'reverb', 'rsize', 'delay', 'drive', 'attack', 'decay', 'sustain', 'release', 'mono', 'octave', 'master', 'subOsc', 'peak', 'hf', 'hfBurst', 'flat'],
};
SETS['voice + oscillators'] = SETS['voice + measures'].concat(NAMES.filter(n => /^(nOsc|A1|A2|B1|wave:|pat:|wavelet:|sparsity|scale|lowOsc|octMean|pitchEnv|ownEnv|level2)/.test(n)));
SETS['+ modulation + filter'] = SETS['voice + oscillators'].concat(NAMES.filter(n => /^(lfo|vibrato|bothLfo|morph|modEnv|motion|modShift|filter|flt)/.test(n)));
SETS['all (with categories)'] = null;

if (require.main === module) {
  const rows = load(), keepers = rows.filter(r => r.stars >= 5), rejected = rows.filter(r => r.stars <= 2), kept3 = rows.filter(r => r.stars >= 3);
  console.log(`${rows.length} rated presets: ${rejected.length} rated 1-2 (rejected), ${kept3.length} rated 3+ (${keepers.length} rated 5+)`);
  const rb = (cat) => { const s = rows.filter(r => r.c.cat === cat); return s.length ? `${cat} ${s.length} (mean ${(s.reduce((a, r) => a + r.stars, 0) / s.length).toFixed(1)}, kept 3+ ${(100 * s.filter(r => r.stars >= 3).length / s.length).toFixed(0)} %)` : null; };
  console.log('by category: ' + CATS.map(rb).filter(Boolean).join('; '));
  for (const [name, names] of Object.entries(SETS)) {
    const res = [3, 10, 30, 100].map(l => [l, loo(rows, l, names)]).sort((a, b) => b[1].r - a[1].r)[0];
    console.log(`  ${name.padEnd(26)} ${String(names ? names.length : NAMES.length).padStart(3)} features: leave-one-out r = ${res[1].r.toFixed(2)} (lambda ${res[0]}, mean error ${res[1].mae.toFixed(2)} stars)`);
  }
  // keepers against rejected: the standardised difference of every feature (Cohen's d, sign = more in the keepers)
  const V = rows.map(r => vec(r.c)), stars = rows.map(r => r.stars);
  const diffs = NAMES.map((n, j) => {
    const a = keepers.map(r => vec(r.c)[j]), b = rejected.map(r => vec(r.c)[j]);
    const m = (x) => x.reduce((s, y) => s + y, 0) / x.length, va = (x) => x.reduce((s, y) => s + (y - m(x)) ** 2, 0) / x.length;
    const sp = Math.sqrt((va(a) + va(b)) / 2) || 1;
    return { n, d: (m(a) - m(b)) / sp, ma: m(a), mb: m(b), r: corr(V.map(v => v[j]), stars) };
  }).filter(x => Math.abs(x.d) > 0 || true).sort((x, y) => y.d - x.d);
  console.log('\nkept (5+ stars) against rejected (1-2): d = standardised difference, r = correlation with the stars');
  const show = (x) => `  ${x.n.padEnd(20)} d ${x.d >= 0 ? '+' : ''}${x.d.toFixed(2)}  r ${x.r >= 0 ? '+' : ''}${x.r.toFixed(2)}   kept ${x.ma.toFixed(2)}  rejected ${x.mb.toFixed(2)}`;
  diffs.slice(0, 22).forEach(x => console.log(show(x))); console.log('  ...'); diffs.slice(-22).forEach(x => console.log(show(x)));
  const m = fit(rows, 30, SETS['+ modulation + filter']);
  console.log('\nridge weights (stars per standard deviation), the model "+ modulation + filter":');
  console.log('  ' + m.w.map((x, j) => [m.names[j], x]).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} ${x >= 0 ? '+' : ''}${x.toFixed(2)}`).join(', '));
}
module.exports = { features, vec, NAMES, SETS, fit, loo, corr, load, CATS };
