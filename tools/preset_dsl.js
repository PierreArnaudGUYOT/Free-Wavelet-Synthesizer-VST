// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// A small language to write presets of the three oscillators (tools/recipes_*.js; beta 0.3: B2 is gone). A preset is
//   P(category, title, description, { A1: {...}, A2: {...}, B1: {...}, g: {...} })
// with, per oscillator (only the ones the preset uses; the others are off):
//   level: lvl, tuning: oct semi fine, own envelope: env [attack, decay, sustain, release] (switches it on), pitch envelope:
//   penv [semitones, seconds]; subtractive (A1 A2): wave width sparsity phase wavelet, filter ftype fcut fslope fres fkey fenv fvel,
//   window pcen pwid pdep; additive (B1): pattern seed tilt bars [11 levels] atk spread body bright sus, wavelet, filter, window.
// and the voice and effects in g:
//   amp [a d s r vel], mod [a d s r], lfo { shape rate pitch cut pos wav sp res ew }, lfo2 / lfo3 { shape rate amt target }, uni [copies, detune cents],
//   flt { type: 'ladder' | 'ota', cut (Hz), res, drive, key, env, adsr: [a d s r] } (the FILTER effect, beta 0.3),
//   width, voices, glide, porta, oct, fine, sub [level, oct, shape], drive, delay [time, feedback, mix], reverb [size, mix],
//   chorus [mix, rate, depth], master, morph [wavelet 2, amount, lfo, env]; win: the window (s) of the loudness match for a short sound.
'use strict';
const SPEC = require('../web/js/spec.js');
const SLOTS = SPEC.SLOTS, PARAMS = SPEC.PARAMS, IDX = Object.fromEntries(PARAMS.map((p, i) => [p.key, i]));
const KEY = (slot, field) => PARAMS[SLOTS[slot].k[field]].key;
const WAVE = { saw: 0, square: 1, pulse: 2, tri: 3, sine: 4, noise: 5 };
const FTYPE = { lp: 0, hp: 1, bp: 2, br: 3 };
const PAT = { ramp: 0, mirror: 1, alt: 2, walsh: 3, impulse: 4, random: 5 };
const WAVELET = { haar: 0, db2: 1, db4: 2, db8: 3, sym8: 4, coif3: 5, db20: 6 };
const LFO = { sine: 0, tri: 1, saw: 2, square: 3, sh: 4 };
// (beta 0.2: LFO 1 also has sp = SPARSITY, res = RESO, ew = ENV>WAV; LFO 2 targets from sparsity on; beta 0.3: LFO 3 (the same targets), fltcut / fltres = the filter)
const L2T = { cutoff: 0, slope: 1, reso: 2, keytrk: 3, envamt: 4, velamt: 5, position: 6, width: 7, depth: 8, phase: 9,
  sparsity: 10, srcwidth: 11, tilt: 12, odd: 13, even: 14, sus: 15, morph: 16, fltcut: 17, fltres: 18 };
const FLT_TYPE = { ladder: 0, ota: 1 };
const SLOT_IDS = ['A1', 'A2', 'B1'];
const num = (m, v, what) => { if (typeof v === 'string') { if (!(v in m)) throw new Error('unknown ' + what + ' ' + v); return m[v]; } return v; };

function oscValues(id, o, out) {
  const s = SLOT_IDS.indexOf(id), mode = SLOTS[s].mode, k = (f) => KEY(s, f);
  const set = (f, v) => { out[k(f)] = v; };
  set('lvl', o.lvl === undefined ? 1 : o.lvl);
  for (const f of ['oct', 'semi', 'fine', 'fcut', 'fslope', 'fres', 'fkey', 'fenv', 'fvel', 'pcen', 'pwid', 'pdep', 'wavelet']) {
    if (o[f] !== undefined) set(f, f === 'wavelet' ? num(WAVELET, o[f], 'wavelet') : o[f]);
  }
  if (o.ftype !== undefined) set('ftype', num(FTYPE, o.ftype, 'filter type'));
  if (o.env) { out[k('eon')] = 1; [out[k('ea')], out[k('ed')], out[k('es')], out[k('er')]] = o.env; }
  if (o.penv) { out[k('pamt')] = o.penv[0]; out[k('ptime')] = o.penv[1]; }
  if (mode === 0) {
    if (o.wave !== undefined) set('wave', num(WAVE, o.wave, 'wave'));
    for (const f of ['width', 'sparsity', 'phase']) if (o[f] !== undefined) set(f, o[f]);
  } else {
    if (o.pattern !== undefined) set('pattern', num(PAT, o.pattern, 'pattern'));
    for (const f of ['seed', 'tilt', 'atk', 'spread', 'body', 'bright', 'sus']) if (o[f] !== undefined) set(f, o[f]);
    if (o.bars) for (let b = 0; b < 11; b++) out[PARAMS[SLOTS[s].k.bar1 + b].key] = o.bars[b] === undefined ? 0 : o.bars[b];
  }
}

function globalValues(g, out) {
  const set = (key, v) => { out[key] = v; };
  if (g.amp) { const [a, d, s, r, vel] = g.amp; set('amp_a', a); set('amp_d', d); set('amp_s', s); set('amp_r', r); if (vel !== undefined) set('amp_vel', vel); }
  if (g.mod) { const [a, d, s, r] = g.mod; set('mod_a', a); set('mod_d', d); set('mod_s', s); set('mod_r', r); }
  if (g.lfo) {
    const l = g.lfo;
    if (l.shape !== undefined) set('lfo_shape', num(LFO, l.shape, 'LFO shape'));
    for (const f of ['rate', 'pitch', 'cut', 'pos', 'wav', 'sp', 'res', 'ew']) if (l[f] !== undefined) set('lfo_' + f, l[f]);
  }
  for (const n of ['lfo2', 'lfo3']) if (g[n]) {
    const l = g[n];
    if (l.shape !== undefined) set(n + '_shape', num(LFO, l.shape, 'LFO shape'));
    if (l.rate !== undefined) set(n + '_rate', l.rate);
    if (l.amt !== undefined) set(n + '_amt', l.amt);
    if (l.target !== undefined) set(n + '_target', num(L2T, l.target, n + ' target'));
  }
  if (g.flt) {
    const f = g.flt;
    if (f.type !== undefined) set('vf_type', num(FLT_TYPE, f.type, 'filter type'));
    for (const k of ['cut', 'res', 'drive', 'key', 'env']) if (f[k] !== undefined) set('vf_' + k, f[k]);
    if (f.adsr) { const [a, d, s, r] = f.adsr; set('vf_a', a); set('vf_d', d); set('vf_s', s); set('vf_r', r); }
  }
  if (g.uni) { set('v_unison', g.uni[0]); set('v_detune', g.uni[1]); }
  for (const f of ['width', 'voices', 'glide', 'oct', 'fine', 'drive', 'master']) {
    const key = { width: 'v_width', voices: 'v_voices', glide: 'v_glide', oct: 'v_oct', fine: 'v_fine', drive: 'fx_drive', master: 'master' }[f];
    if (g[f] !== undefined) set(key, g[f]);
  }
  if (g.porta !== undefined) set('v_porta', { off: 0, poly: 1, legato: 2 }[g.porta]);
  if (g.sub) { set('sub_level', g.sub[0]); if (g.sub[1] !== undefined) set('sub_oct', g.sub[1]); if (g.sub[2] !== undefined) set('sub_shape', g.sub[2]); }
  if (g.delay) { set('fx_dtime', g.delay[0]); set('fx_dfb', g.delay[1]); set('fx_dmix', g.delay[2]); }
  if (g.reverb) { set('fx_rsize', g.reverb[0]); set('fx_rmix', g.reverb[1]); }
  if (g.chorus) { set('ch_mix', g.chorus[0]); if (g.chorus[1] !== undefined) set('ch_rate', g.chorus[1]); if (g.chorus[2] !== undefined) set('ch_depth', g.chorus[2]); }
  if (g.morph) { set('wav2', num(WAVELET, g.morph[0], 'wavelet')); set('wmorph', g.morph[1]); if (g.morph[2] !== undefined) set('lfo_wav', g.morph[2]); if (g.morph[3] !== undefined) set('env_wav', g.morph[3]); }
}

// the sparse parameter values of a preset (over the defaults) and the oscillators it uses
function P(cat, title, desc, spec) {
  const v = {}, used = [];
  if (spec.B2) throw new Error(title + ': B2 was removed in beta 0.3 (the recipes of beta 0.1 cannot run on this specification)');
  for (const id of SLOT_IDS) {
    if (spec[id]) { oscValues(id, spec[id], v); if ((spec[id].lvl === undefined ? 1 : spec[id].lvl) > 0) used.push(id); }
    else if (id === 'A1') v.a1_lvl = 0;   // A1 is on by default: a preset that does not use it switches it off
  }
  if (!used.length) throw new Error(title + ': no oscillator');
  v.osc_view = SLOT_IDS.indexOf(used[0]);
  globalValues(spec.g || {}, v);
  for (const key of Object.keys(v)) {
    if (!(key in IDX)) throw new Error(`${title}: unknown parameter ${key}`);
    const p = PARAMS[IDX[key]];
    if (v[key] < p.min - 1e-9 || v[key] > p.max + 1e-9) throw new Error(`${title}: ${key} = ${v[key]} out of range ${p.min}..${p.max}`);
  }
  return { cat, title, desc, used: used.join(''), v, win: spec.win };   // win: the window (s) of the loudness measure, for short sounds
}
module.exports = { P, SLOT_IDS };
