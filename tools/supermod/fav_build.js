// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds tools/presets_fav.js: 100 new presets, numbers 1551-1650, "inspired by my favourites, with ONE oscillator or TWO, and with the FILTER; I like presets with a little SUSTAIN (so that notes are
// a bit long), and I like ORGANIC and WARM sounds, with a little effect" (the owner, 2026-10-20).
// The favourites are the six he named (669 680 692 694 697 of beta 0.3, 377 of beta 0.2) and every preset he rated 8 or more of 10, the TOP Sounds included (tools/ratings_owner2.js; their values
// are read from web/js/spec.js). Two ways of making a neighbour:
//   - the gene route (Bass, Lead, Keys, Organ, Pad, Strings, Brass & Wind, FX: 82 presets): an oscillator of a favourite (its wave or pattern, its wavelet, its scale filter, its sparsity, its drawbars: the
//     "gene" of one oscillator) is taken for the main sound, a second one from another favourite when there are two, each varied a little (a neighbouring wavelet of the same family, a few cents of detune,
//     a nudged scale cutoff, drawbars within 0.1); the envelope, the voice and the effects are the kind's own, in the ranges the favourites show, made sustained and warm (the ratings: sustain is the
//     strongest sign of a keeper) with a light vibrato, a little chorus, a little room, a soft echo on the leads; the filter is slightly closed with a little resonance (FLT_FAV);
//   - the composer route (SuperModulation, Pluck, Bells & Mallets, Drums & Perc: 18 presets): tools/supermod/compose.js with two oscillators at most, the same warm filter and voice, a sustain floor.
// Every candidate has one or two oscillators sounding (never three), the filter really used, a sustain, a gentle top end (the high-frequency measures of audit.js and the spectral centroid of the favourites
// as limits); the candidates are measured, their loudness is matched to the TOP Sounds, and the ones kept are the best predicted by the owner's taste model (tools/supermod/filter_taste.js) that are, among
// themselves, against the presets he kept and against the filter batch (tools/presets_filter.js), the farthest apart. The gates are the filter batch's (tools/supermod/filter_lib.js).
//   node tools/supermod/fav_build.js [--per 9] [--seed 1] [--procs 8]     candidates -> tools/out/fav_cand_<k>.json, then the selection -> tools/presets_fav.js
//   node tools/supermod/fav_build.js --cats SuperModulation --seed 2 --pool   more candidates for some categories only, added to the pool
//   node tools/supermod/fav_build.js --select-only                         only the selection, from the pool (tools/out/fav_pool.json)
//   node tools/supermod/fav_build.js --report                              the statistics of the written file
//   node tools/supermod/fav_build.js --calib                               the measures of the favourites themselves (the limits of the warm gates)
// The file written is the one of 2026-10-20: --per 9 --seed 1 --procs 8, then --cats SuperModulation --seed 2 --pool --per 12 (a SuperModulation sound is a sustained kind), then --select-only if needed.
// Run tools/supermod/filter_data.js and filter_build.js first (the taste model and the distinctness need tools/out/filter_rated.json and filter_pool.json), then fav_build.js --calib
// (once), and afterwards node tools/supermod/loud_filter.js --file tools/presets_fav.js --apply (the loud-chord gate); node tools/supermod/filter_check.js checks both files.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./filter_lib.js');
const OUT = L.OUT;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const TAG = arg('tag', ''), FILE = path.resolve(arg('out', path.join(__dirname, '..', 'presets_fav.js')));
const FIRST = 1551;
const QUOTA = [['SuperModulation', 4], ['Bass', 9], ['Lead', 12], ['Keys', 11], ['Organ', 9], ['Pad', 12], ['Strings', 11], ['Brass & Wind', 10], ['Pluck', 6], ['Bells & Mallets', 5], ['FX', 8], ['Drums & Perc', 3]];
const KIND = { 'Bass': 'bass', 'Lead': 'lead', 'Keys': 'keys', 'Organ': 'organ', 'Pad': 'pad', 'Strings': 'strings', 'Brass & Wind': 'brass', 'FX': 'fx', 'Pluck': 'pluck', 'Bells & Mallets': 'bell', 'Drums & Perc': 'perc' };
const GENE = new Set(['Bass', 'Lead', 'Keys', 'Organ', 'Pad', 'Strings', 'Brass & Wind', 'FX']);
const SUS = { bass: 0.55, lead: 0.55, keys: 0.45, pad: 0.7, strings: 0.7, brass: 0.6, fx: 0.5, organ: 0.85, pluck: 0.28, bell: 0.28, perc: 0.3 };   // the floor of amp_s by kind
const GATE = { hfMax: 0.4, hfBurstMax: 8, fltMin: 1.0, holdMin: -9 };   // the warm gates: the favourites' own 90 % quantile of hf is 0.39, of hfBurst 6.7, and 75 % of them are above -5 dB after 2 s (tools/out/fav_calib.json)

const SPEC = require('../../web/js/spec.js');
const K = Object.fromEntries(SPEC.PARAMS.map((p, i) => [p.key, i]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ----------------------------------------------------------------------------- the favourites and their oscillators ("genes")
function favourites() {
  const R2 = require('../ratings_owner2.js'), R1 = require('../ratings_beta03.js'), named = new Set(R1.FAV || []);
  const list = [];
  for (const p of SPEC.PRESETS) {
    const n = parseInt(p.name, 10), st = isNaN(n) ? R2.names[p.name] : (R2.numbers[n] || R1[n]);
    if (named.has(n) || st >= 8) list.push({ name: p.name, cat: p.cat, stars: Math.max(st || 0, named.has(n) ? 7 : 0), named: named.has(n), values: Array.from(p.values) });
  }
  return list;
}
const grp = (values, s) => { const k = SPEC.SLOTS[s].k, g = {}; for (const f of Object.keys(k)) g[f] = values[K[SPEC.PARAMS[k[f]].key]]; return g; };
const WAVES = ['saw', 'square', 'pulse', 'tri', 'sine', 'noise'], PATTERNS = ['ramp', 'mirror', 'alt', 'walsh', 'impulse', 'random'], WAVELETS = ['haar', 'db2', 'db4', 'db8', 'sym8', 'coif3', 'db20'];
const WNEAR = { 0: [1, 2], 1: [2, 0], 2: [4, 5, 3], 3: [6, 4], 4: [2, 5, 3], 5: [4, 2], 6: [3, 4] };   // the neighbours of a wavelet in its family (rough, mid, clean: layers.js wclass)
function pool() {
  const out = { A: [], B: [] };
  for (const fav of favourites()) for (let s = 0; s < 3; s++) {
    const g = grp(fav.values, s), mode = s < 2 ? 'A' : 'B';
    if (!(g.lvl >= 0.25)) continue;
    if (mode === 'A') {
      if ((g.eon && g.es < 0.5) || Math.abs(g.pamt) > 2 || ![0, 2].includes(g.ftype) || g.wave === 2 && fav.stars < 8) continue;   // no percussive layer, no pitch dive, no pulse (nasal) unless a 8+ favourite had it
    } else if (g.eon || !(g.sus >= 0.5)) continue;
    out[mode].push({ fav: fav.name, cat: fav.cat, stars: fav.stars, named: fav.named, g, mode });
  }
  return out;
}

// ----------------------------------------------------------------------------- varying an oscillator
function varyA(r, g, kind) {
  const o = Object.assign({}, g);
  o.wavelet = r.p(0.35) ? r.pick(WNEAR[g.wavelet]) : g.wavelet;
  if (o.wavelet <= 1 && r.p(0.75)) o.wavelet = r.pick([2, 4, 6, 3]);   // warm: not the roughest wavelets
  const sine = o.wave === 4, noise = o.wave === 5;
  o.sparsity = sine ? 0 : +clamp(g.sparsity + r.f(-0.06, 0.1), 0, 0.4).toFixed(2);
  if (!sine && g.fcut < 11) o.fcut = +clamp(g.fcut + r.f(-0.8, 0.5), noise ? 4 : 3.2, noise ? 9 : 7.6).toFixed(2);
  o.fres = +clamp(g.fres * r.f(0.7, 1.1), 0, kind === 'fx' ? 9 : 5).toFixed(1);
  if ([1, 2, 3].includes(o.wave)) o.width = +clamp(g.width + r.f(-0.08, 0.08), 0.3, 0.7).toFixed(2);
  o.fenv = 0; o.fvel = 0; o.eon = g.eon && g.es >= 0.5 ? 1 : 0; o.pamt = 0;
  return o;
}
function varyB(r, g, kind) {
  const o = Object.assign({}, g);
  o.wavelet = r.p(0.35) ? r.pick(WNEAR[g.wavelet]) : g.wavelet;
  if (o.wavelet <= 1) o.wavelet = r.pick([4, 6, 3]);
  o.tilt = +clamp(g.tilt + r.f(-1, 1), -8, -1).toFixed(2);
  for (let b = 1; b <= 11; b++) { const v = g['bar' + b]; o['bar' + b] = +clamp(v > 0 ? v + r.f(-0.1, 0.1) : 0, 0, 1).toFixed(2); }
  const atk = g.atk * r.f(0.65, 1.5);
  o.atk = +clamp(atk, 0.003, kind === 'organ' ? 0.03 : kind === 'lead' || kind === 'bass' || kind === 'keys' ? 0.08 : 1.6).toFixed(3);
  o.sus = +clamp(Math.max(g.sus, 0.75), 0, 1).toFixed(2);
  o.fenv = 0; o.fvel = 0; o.eon = 0; o.pamt = 0;
  return o;
}
// an oscillator group -> the DSL of tools/preset_dsl.js
function dsl(g, mode) {
  const o = { lvl: +g.lvl.toFixed(2), oct: g.oct, wavelet: g.wavelet };
  for (const f of ['semi', 'fine', 'fcut', 'fslope', 'fres', 'fkey', 'pcen', 'pwid', 'pdep']) if (g[f] !== undefined) o[f] = g[f];
  if (g.ftype) o.ftype = g.ftype; else if (g.ftype === 0) o.ftype = 0;
  if (g.eon) o.env = [g.ea, g.ed, g.es, g.er];
  if (mode === 'A') { o.wave = g.wave; for (const f of ['width', 'sparsity', 'phase']) if (g[f] !== undefined) o[f] = g[f]; }
  else {
    o.pattern = g.pattern; for (const f of ['seed', 'tilt', 'atk', 'spread', 'body', 'bright', 'sus']) if (g[f] !== undefined) o[f] = g[f];
    o.bars = Array.from({ length: 11 }, (_, b) => g['bar' + (b + 1)]);
  }
  return o;
}

// ----------------------------------------------------------------------------- the words
const AW = { saw: ['Amber', 'Velvet', 'Cedar', 'Honey', 'Copper', 'Walnut'], square: ['Oak', 'Reed', 'Hollow', 'Barrel'], pulse: ['Taper', 'Reed'], tri: ['Soft', 'Moss', 'Milk', 'Willow', 'Flute'], sine: ['Pearl', 'Moon', 'Opal', 'Dawn'], noise: ['Breath', 'Mist', 'Fog', 'Dust'] };
const BW = { ramp: ['Horn', 'Brass', 'Copper'], mirror: ['Choir', 'Chorale', 'Nave', 'Cello'], alt: ['Mallet', 'Kalimba', 'Wood'], walsh: ['Step', 'Mosaic'], impulse: ['Atom', 'Glass', 'Spark'], random: ['Halo', 'Air', 'Shimmer'] };
const ADJ = ['Warm', 'Soft', 'Slow', 'Round', 'Mellow', 'Golden', 'Gentle', 'Woody', 'Silken', 'Hazy', 'Lazy', 'Dusk'];
const FORM = { bass: ['Bass', 'Low End', 'Sub', 'Foundation', 'Undertow'], lead: ['Lead', 'Call', 'Voice', 'Line', 'Solo'], keys: ['Keys', 'Tines', 'Chords', 'Piano', 'Clav'], pad: ['Pad', 'Cloud', 'Wash', 'Haze', 'Bed', 'Aurora'],
  strings: ['Strings', 'Bows', 'Ensemble', 'Section'], brass: ['Horns', 'Brass', 'Reeds', 'Fanfare'], organ: ['Organ', 'Pipes', 'Drawbars'], fx: ['Texture', 'Scape', 'Drift', 'Signal', 'Tide'] };
function textA(g) {
  if (g.wave === 4) return 'a pure sine';
  if (g.wave === 5) return g.ftype === 2 ? 'a veil of band-passed noise' : 'a breath of noise';
  if (g.wave === 3) return g.sparsity > 0.3 ? 'a triangle thinned to a few atoms' : 'a soft triangle';
  if (g.wave === 1) return g.sparsity > 0.3 ? 'a square thinned to a few atoms' : 'a rounded square';
  if (g.wave === 2) return 'a nasal pulse';
  return g.sparsity > 0.3 ? 'a saw thinned to a few atoms' : g.fcut > 6 ? 'a warm saw' : 'a dark saw';
}
function textB(g) {
  if (g.pattern === 1) return g.atk > 0.2 ? 'mirrored atoms that sing like a choir' : 'wavelet drawbars like an organ';
  if (g.pattern === 0) return 'ramp atoms that open like a horn';
  if (g.pattern === 2) return 'alternating atoms';
  if (g.pattern === 3) return 'stepped Walsh atoms';
  if (g.pattern === 4) return 'single wavelet atoms';
  return 'a halo of random atoms';
}
const rel = (g) => {
  const st = (g.oct || 0) * 12 + (g.semi || 0);
  const t = st === 12 ? 'an octave above' : st === 24 ? 'two octaves above' : st === -12 ? 'an octave below' : st === -24 ? 'two octaves below' : st === 7 ? 'a fifth above' : '';
  return t ? ' ' + t : g.fine ? ', slightly detuned' : '';
};
// the clauses of the organic, warm part of a description (v: the sparse values of the preset)
function organicClauses(v, kind) {
  const cl = [];
  const a = v.amp_a !== undefined ? v.amp_a : 0.003, r = v.amp_r !== undefined ? v.amp_r : 0.3, s = v.amp_s !== undefined ? v.amp_s : 0.8;
  if (a >= 0.5) cl.push('it swells in slowly'); else if (a >= 0.1) cl.push('a soft attack'); else if (a >= 0.02) cl.push('a gentle onset');
  if (kind === 'perc') cl.push('a sustain that keeps it ringing'); else if (['pluck', 'bell'].includes(kind)) cl.push('a long ringing tail'); else cl.push(s >= 0.85 ? 'a long sustain' : 'a sustain that holds');
  if (r >= 1.2) cl.push('a slow release'); else if (r >= 0.5) cl.push('a soft release');
  if ((v.lfo_pitch || 0) > 0) cl.push('a light vibrato');
  const fx = []; if ((v.ch_mix || 0) > 0.01) fx.push('a little chorus'); if ((v.fx_rmix || 0) > 0.01) fx.push('a soft room'); if ((v.fx_dmix || 0) > 0.01) fx.push('a faint echo');
  if (fx.length) cl.push(fx.join(' and '));
  return cl;
}
function describeFav(base, modClauses, v, kind) {
  const cl = modClauses.concat(organicClauses(v, kind), [L.fltClause2(v)]);
  return base + '; ' + cl.slice(0, -1).join(', ') + ', and ' + cl[cl.length - 1] + '.';
}

// ----------------------------------------------------------------------------- the warm filter (a little closed, a little resonance) and the voice, by kind
const rd = L.rd;
const FLT_FAV = {
  bass: (r) => ({ cut: rd(r.f(200, 520), 0), res: rd(r.f(0.2, 0.34)), drive: rd(r.f(0.03, 0.14)), key: rd(r.f(0.45, 0.75)), env: rd(r.f(0.08, 0.2)), adsr: [0.003, rd(r.f(0.15, 0.5), 3), rd(r.f(0.2, 0.5)), rd(r.f(0.1, 0.3), 3)] }),
  lead: (r) => ({ cut: rd(r.f(1000, 2600), 0), res: rd(r.f(0.25, 0.42)), drive: rd(r.f(0.03, 0.14)), key: rd(r.f(0.5, 0.85)), env: rd(r.f(0.08, 0.2)), adsr: [rd(r.f(0.005, 0.04), 3), rd(r.f(0.3, 0.8), 3), rd(r.f(0.45, 0.8)), rd(r.f(0.2, 0.5), 3)] }),
  keys: (r) => ({ cut: rd(r.f(800, 2000), 0), res: rd(r.f(0.2, 0.36)), drive: rd(r.f(0, 0.1)), key: rd(r.f(0.5, 0.8)), env: rd(r.f(0.1, 0.22)), adsr: [0.002, rd(r.f(0.3, 1), 3), rd(r.f(0.2, 0.5)), rd(r.f(0.25, 0.6), 3)] }),
  organ: (r) => ({ cut: rd(r.f(1800, 4000), 0), res: rd(r.f(0.15, 0.3)), drive: rd(r.f(0, 0.1)), key: rd(r.f(0.6, 0.95)), env: rd(r.f(0.03, 0.1)), adsr: [0.005, 0.3, rd(r.f(0.8, 1)), 0.1] }),
  pad: (r) => ({ cut: rd(r.f(350, 1100), 0), res: rd(r.f(0.2, 0.36)), drive: rd(r.f(0, 0.08)), key: rd(r.f(0.35, 0.6)), env: rd(r.f(0.08, 0.2)), adsr: [rd(r.f(0.6, 1.6), 3), rd(r.f(1.2, 3), 3), rd(r.f(0.55, 0.85)), rd(r.f(1.2, 2.5), 3)] }),
  strings: (r) => ({ cut: rd(r.f(800, 2200), 0), res: rd(r.f(0.18, 0.32)), drive: 0, key: rd(r.f(0.4, 0.7)), env: rd(r.f(0.05, 0.15)), adsr: [rd(r.f(0.2, 0.8), 3), rd(r.f(0.8, 2), 3), rd(r.f(0.65, 0.95)), rd(r.f(0.5, 1.5), 3)] }),
  brass: (r) => ({ cut: rd(r.f(450, 1200), 0), res: rd(r.f(0.25, 0.4)), drive: rd(r.f(0, 0.12)), key: rd(r.f(0.4, 0.7)), env: rd(r.f(0.14, 0.28)), adsr: [rd(r.f(0.05, 0.18), 3), rd(r.f(0.3, 0.8), 3), rd(r.f(0.5, 0.85)), rd(r.f(0.15, 0.4), 3)] }),
  fx: (r) => ({ cut: rd(r.f(400, 3000), 0), res: rd(r.f(0.2, 0.42)), drive: rd(r.f(0, 0.15)), key: rd(r.f(0.2, 0.6)), env: rd(r.f(-0.1, 0.2)), adsr: [rd(r.f(0.01, 1), 3), rd(r.f(0.5, 2.5), 3), rd(r.f(0.4, 0.85)), rd(r.f(0.5, 2), 3)] }),
  pluck: (r) => ({ cut: rd(r.f(900, 2200), 0), res: rd(r.f(0.2, 0.36)), drive: rd(r.f(0, 0.1)), key: rd(r.f(0.5, 0.85)), env: rd(r.f(0.12, 0.28)), adsr: [0.001, rd(r.f(0.2, 0.7), 3), rd(r.f(0, 0.1)), rd(r.f(0.2, 0.5), 3)] }),
  bell: (r) => ({ cut: rd(r.f(2200, 5000), 0), res: rd(r.f(0.15, 0.3)), drive: 0, key: rd(r.f(0.7, 1)), env: rd(r.f(0.05, 0.15)), adsr: [0.002, rd(r.f(0.8, 3), 3), rd(r.f(0, 0.1)), rd(r.f(0.5, 1.5), 3)] }),
  perc: (r) => ({ cut: rd(r.f(700, 2500), 0), res: rd(r.f(0.2, 0.34)), drive: rd(r.f(0, 0.12)), key: rd(r.f(0.3, 0.7)), env: rd(r.f(0.05, 0.18)), adsr: [0.001, rd(r.f(0.1, 0.4), 3), rd(r.f(0, 0.2)), rd(r.f(0.1, 0.4), 3)] }),
};
const withType = (f, r, pOta = 0.45) => Object.assign({ type: r.p(pOta) ? 'ota' : 'ladder' }, f);
const fltFav = (ctx, r) => withType(FLT_FAV[ctx.kind](r), r);
// the voice and the effects of a kind, in the ranges the favourites show, made sustained and warm: little effect
const VOICE = {
  pad: (r) => ({ amp: [r.f(0.5, 1.5), r.f(0.8, 1.4), r.f(0.75, 0.95), r.f(1, 2.4), 0.4], uni: [r.pick([1, 2, 2, 3]), r.f(5, 9)], width: r.f(0.75, 0.92), chorus: r.p(0.7) ? [r.f(0.18, 0.4), r.f(0.35, 0.8), 0.5] : null, reverb: [r.f(0.55, 0.8), r.f(0.22, 0.4)], delay: r.p(0.12) ? [r.pick([0.33, 0.5]), r.f(0.25, 0.35), r.f(0.08, 0.15)] : null, vib: r.p(0.3) ? [r.f(3, 7), r.f(0.25, 0.6)] : null }),
  strings: (r) => ({ amp: [r.f(0.15, 0.6), r.f(0.8, 1.4), r.f(0.8, 0.95), r.f(0.5, 1.4), 0.5], uni: [r.pick([1, 2, 2, 3]), r.f(5, 8)], width: r.f(0.7, 0.9), chorus: r.p(0.7) ? [r.f(0.18, 0.4), r.f(0.4, 0.7), 0.5] : null, reverb: [r.f(0.5, 0.75), r.f(0.2, 0.36)], delay: null, vib: r.p(0.6) ? [r.f(4, 9), r.f(4.5, 5.8)] : null }),
  lead: (r) => ({ amp: [r.f(0.004, 0.04), r.f(0.3, 0.8), r.f(0.6, 0.85), r.f(0.2, 0.5), 0.5], uni: [r.pick([1, 1, 2]), r.f(5, 9)], width: r.f(0.5, 0.8), chorus: r.p(0.25) ? [r.f(0.15, 0.3), 0.6, 0.5] : null, reverb: [r.f(0.4, 0.65), r.f(0.12, 0.25)], delay: r.p(0.6) ? [r.pick([0.25, 0.33, 0.375, 0.5]), r.f(0.25, 0.38), r.f(0.08, 0.18)] : null, vib: r.p(0.8) ? [r.f(5, 12), r.f(4.5, 6)] : null, mono: r.p(0.55) }),
  keys: (r) => ({ amp: [r.f(0.002, 0.01), r.f(0.8, 2.4), r.f(0.45, 0.65), r.f(0.3, 0.7), 0.6], uni: [1, 0], width: r.f(0.5, 0.8), chorus: r.p(0.6) ? [r.f(0.2, 0.4), r.f(0.5, 0.9), 0.5] : null, reverb: [r.f(0.3, 0.55), r.f(0.12, 0.25)], delay: null, vib: null }),
  organ: (r) => ({ amp: [r.f(0.004, 0.02), 0.2, r.f(0.85, 1), r.f(0.08, 0.25), 0.3], uni: [r.pick([1, 1, 2]), r.f(4, 7)], width: r.f(0.5, 0.8), chorus: [r.f(0.2, 0.4), r.f(0.8, 1.6), 0.5], reverb: [r.f(0.3, 0.5), r.f(0.12, 0.2)], delay: null, vib: r.p(0.5) ? [r.f(3, 7), r.f(5.5, 6.5)] : null }),
  brass: (r) => ({ amp: [r.f(0.04, 0.18), r.f(0.3, 0.7), r.f(0.7, 0.9), r.f(0.15, 0.4), 0.6], uni: [r.pick([1, 1, 2]), r.f(5, 8)], width: r.f(0.5, 0.75), chorus: null, reverb: [r.f(0.4, 0.6), r.f(0.15, 0.25)], delay: r.p(0.25) ? [r.pick([0.25, 0.33, 0.5]), r.f(0.25, 0.35), r.f(0.08, 0.16)] : null, vib: r.p(0.7) ? [r.f(4, 8), r.f(4.5, 5.8)] : null, mono: r.p(0.35) }),
  bass: (r) => ({ amp: [r.f(0.003, 0.012), r.f(0.3, 0.8), r.f(0.55, 0.85), r.f(0.1, 0.3), 0.5], uni: [r.pick([1, 1, 2]), r.f(3, 6)], width: r.f(0.3, 0.5), chorus: r.p(0.25) ? [r.f(0.12, 0.25), 0.5, 0.5] : null, reverb: [r.f(0.2, 0.35), r.f(0.04, 0.1)], delay: null, vib: null, mono: r.p(0.5), oct: -1 }),
  fx: (r) => ({ amp: [r.f(0.2, 1.2), r.f(1, 2), r.f(0.7, 0.95), r.f(1, 3), 0.4], uni: [r.pick([1, 2]), r.f(5, 9)], width: r.f(0.7, 0.9), chorus: r.p(0.4) ? [r.f(0.2, 0.4), 0.5, 0.5] : null, reverb: [r.f(0.6, 0.85), r.f(0.25, 0.4)], delay: r.p(0.5) ? [r.pick([0.25, 0.33, 0.5, 0.75]), r.f(0.3, 0.4), r.f(0.1, 0.2)] : null, vib: r.p(0.4) ? [r.f(3, 9), r.f(0.4, 5)] : null }),
};
// the weights of a favourite as the parent of a kind of sound, by its own category
const AFF = {
  pad: { Pad: 3, SuperModulation: 1.5, FX: 1, Strings: 1 }, strings: { Strings: 3, Pad: 1.5, SuperModulation: 1.2, Keys: 0.4 }, lead: { Lead: 3, SuperModulation: 1.4, FX: 1, 'Brass & Wind': 1 },
  keys: { Keys: 3, SuperModulation: 1.1, Bass: 0.5 }, organ: { Organ: 3, Pad: 1.2, Keys: 0.8 }, brass: { 'Brass & Wind': 3, Lead: 1.6, Strings: 1.2, SuperModulation: 0.8 }, bass: { Bass: 3, SuperModulation: 1, Keys: 0.6 },
  fx: { FX: 3, Pad: 1, Lead: 1, SuperModulation: 1.2 },
};
// how many oscillators and which kind of oscillator by kind of sound: [one oscillator, two], and the share of additive (B1) oscillators in the main sound
const CFG = { pad: [0.35, 0.65, 0.35], strings: [0.5, 0.5, 0.2], lead: [0.5, 0.5, 0.2], keys: [0.4, 0.6, 0.45], organ: [0.6, 0.4, 0.8], brass: [0.55, 0.45, 0.25], bass: [0.45, 0.55, 0.15], fx: [0.5, 0.5, 0.3] };

// ----------------------------------------------------------------------------- the gene route: one preset of a kind
// what may be the main sound of a kind: not a noise wash for a lead or a horn, and of the additive patterns only the singing ones (mirror: choir, organ; ramp: horn) except in a pad or an effect
const okMain = (kind, c) => (c.mode === 'A' ? c.g.wave !== 5 || kind === 'pad' || kind === 'fx' : [0, 1].includes(c.g.pattern) || kind === 'fx' || (kind === 'pad' && c.g.pattern === 5));
function makeGene(r, cat, P, PL0, taken) {
  const kind = KIND[cat], aff = AFF[kind], cfg = CFG[kind], PL = { A: PL0.A, B: PL0.B }, MAIN = { A: PL0.A.filter(c => okMain(kind, c)), B: PL0.B.filter(c => okMain(kind, c)) };
  const weight = (c) => (aff[c.cat] || 0.4) * (0.5 + (c.stars - 5) / 2) * (c.named ? 1.3 : 1);
  const choose = (list) => (list.length ? r.wpick(list.map(c => [c, weight(c)])) : null);
  const two = r.p(cfg[1]), mainB = r.p(cfg[2]);
  let first = choose(mainB ? MAIN.B : MAIN.A) || choose(MAIN.A);
  if (!first) return null;
  const parts = [first];
  if (two) {
    // the second oscillator: another mode when the first is subtractive (a warm B1 under or over it), or a soft subtractive one under an additive one; or another wave
    let second = null;
    for (let t = 0; t < 12 && !second; t++) {
      const c = first.mode === 'A' ? (r.p(0.45) ? choose(PL.B) : choose(PL.A)) : choose(PL.A);
      if (!c || c.fav === first.fav && c.g === first.g) continue;
      if (c.mode === 'A' && first.mode === 'A' && c.g.wave === first.g.wave && Math.abs(c.g.wavelet - first.g.wavelet) < 2) continue;
      second = c;
    }
    if (second) parts.push(second);
  }
  // the oscillators: the A ones go to A1 then A2, the B one to B1
  const spec = {}, used = [], meta = { from: [], kind };
  let aIdx = 0;
  parts.forEach((c, i) => {
    const g = c.mode === 'A' ? varyA(r, c.g, kind) : varyB(r, c.g, kind), id = c.mode === 'B' ? 'B1' : (aIdx++ === 0 ? 'A1' : 'A2');
    if (i === 0) { g.lvl = r.f(0.82, 1); g.oct = kind === 'bass' && r.p(0.5) ? 0 : g.oct; }
    else {
      const sine = g.wave === 4 && c.mode === 'A', noise = g.wave === 5 && c.mode === 'A';
      g.lvl = noise ? r.f(0.15, 0.4) : sine ? r.f(0.4, 0.8) : r.f(0.3, 0.7);
      const way = r.wpick(sine ? [['sub', 4], ['same', 2], ['up', 2]] : noise ? [['same', 3], ['up', 2]] : kind === 'bass' ? [['sub', 3], ['same', 3]] : [['same', 4], ['up', 2], ['sub', 2], ['fifth', 1]]);
      g.oct = 0; g.semi = 0; g.fine = 0;
      if (way === 'sub') g.oct = -1; else if (way === 'up') g.oct = 1; else if (way === 'fifth') g.semi = 7; else g.fine = (r.p(0.5) ? 1 : -1) * +r.f(4, 11).toFixed(1);
    }
    if (c.mode === 'A' && c.g.oct !== undefined && i === 0) g.oct = Math.max(-1, Math.min(1, g.oct));
    spec[id] = dsl(g, c.mode); used.push([id, g, c.mode]); meta.from.push(c.fav);
  });
  const vo = VOICE[kind](r);
  const gl = { amp: vo.amp.map((x, i) => (i < 4 ? +x.toFixed(3) : x)), uni: [vo.uni[0], +vo.uni[1].toFixed(1)], width: +vo.width.toFixed(2), voices: vo.mono ? 1 : r.pick([6, 8, 10]), oct: vo.oct };
  if (vo.mono) { gl.porta = 'legato'; gl.glide = +r.f(0.02, 0.1).toFixed(3); }
  if (vo.chorus) gl.chorus = vo.chorus.map(x => +x.toFixed(2));
  if (vo.reverb) gl.reverb = vo.reverb.map(x => +x.toFixed(2));
  if (vo.delay) gl.delay = vo.delay.map(x => +x.toFixed(2));
  if (vo.vib) gl.lfo = { shape: 'sine', pitch: +vo.vib[0].toFixed(1), rate: +vo.vib[1].toFixed(2) };
  gl.flt = fltFav({ kind }, r);
  L.tuneVoice(gl, r, kind, { sus: SUS });
  warmCaps(gl);
  if (gl.oct === undefined) delete gl.oct;
  spec.g = gl;
  // the title
  const w = (g, mode) => r.pick(mode === 'A' ? AW[WAVES[g.wave]] : BW[PATTERNS[g.pattern]]);
  const w1 = w(used[0][1], used[0][2]), w2 = used[1] ? w(used[1][1], used[1][2]) : null, form = r.pick(FORM[kind]);
  const pats = [() => `${r.pick(ADJ)} ${w1} ${form}`, () => `${w1} ${form}`, () => (w2 ? `${w1} & ${w2}` : `${r.pick(ADJ)} ${w1}`), () => (w2 ? `${w1} ${w2} ${form}` : `${w1} ${r.pick(ADJ)} ${form}`), () => `${r.pick(ADJ)} ${form}`];
  let title = null;
  for (let t = 0; t < 40 && !title; t++) { const c = r.pick(pats)(); if (!/^(\w+) & \1$/.test(c) && !taken.has(c.toLowerCase())) title = c; }
  if (!title) return null;
  const pr = P(cat, title, '', spec);
  const base = cap(used.map(([id, g, mode], i) => (mode === 'A' ? textA(g) : textB(g)) + (i === 0 ? '' : rel(g))).reduce((a, t, i) => (i === 0 ? t : a + ' against ' + t), ''));
  pr.desc = describeFav(base, [], pr.v, kind);
  pr.meta = { kind, cfg: used.map(u => u[0]).join(''), from: meta.from, layers: used.map(u => (u[2] === 'A' ? WAVES[u[1].wave] : PATTERNS[u[1].pattern])), mods: [], bodySlot: used[0][0] };
  return pr;
}
// the effects of a voice kept little (the owner: "a little effect"): the mixes capped
function warmCaps(g) {
  if (g.chorus) g.chorus[0] = Math.min(g.chorus[0], 0.42);
  if (g.reverb) g.reverb[1] = Math.min(g.reverb[1], 0.42);
  if (g.delay) g.delay[2] = Math.min(g.delay[2], 0.2);
  if (g.drive !== undefined) g.drive = Math.min(g.drive, 0.1);
}

// ----------------------------------------------------------------------------- the composer route (compose.js, two oscillators at most, the warm filter and voice)
const WARM_TUNE = (ctx, r, kind) => { L.tuneVoice(ctx.g, r, kind, { sus: SUS }); L.softenLfos(ctx.g, r); warmCaps(ctx.g); if (kind === 'perc' && ctx.g.amp) ctx.g.amp[1] = Math.max(ctx.g.amp[1], +r.f(0.6, 1.2).toFixed(3)); };
const PERC_OK = new Set(['gong', 'taiko', 'tom', 'conga']);   // the drums that ring (the others are over in a blink: no sustain)

// ----------------------------------------------------------------------------- the measures of a note (warmth) and of the held chord (sustain)
function warmth(lab, values, r60) {
  const r1 = lab.render(values, { note: 60, vel: 0.8, hold: 1.2, tail: 0.2 }), sr = lab.sr;
  const env = lab.envelope(r60, 20), pk = Math.max(...env);
  return { centroid: lab.centroid(r1, Math.round(0.4 * sr)), holdDb: env[Math.min(env.length - 1, 100)] - pk };   // the chord held 3.2 s: the level at 2.0 s against the peak
}

// ----------------------------------------------------------------------------- worker
if (process.argv.includes('--worker')) {
  const k = +arg('worker', 0), per = +arg('per', 9), seed = +arg('seed', 1), procs = +arg('procs', 1);
  const { CLAUSE } = require('./mods.js'), { Rng } = require('./rng.js'), { compose } = require('./compose.js'), A = require('./audit.js'), lab = require('../preset_lab.js');
  const { P: PDSL } = require('../preset_dsl.js');
  const P = lab.P, mp = lab.SPEC.PARAMS[P.master];
  const target = L.topTarget(lab), taken = L.takenTitles(['../presets_filter.js']);
  const r = Rng(seed * 6007 + k * 104729 + 59), PL = pool();
  const rows = [], stats = { composed: 0, nulls: 0, errors: 0 }, onlyCats = arg('cats', '') ? arg('cats', '').split(',') : null;
  const copts = { taken, flt: fltFav, fltLfo: 0.05, tune: WARM_TUNE, configs: [['A1A2', 55], ['A1B1', 45], ['A2B1', 6]] };
  for (const [cat, quota] of QUOTA) {
    if (onlyCats && !onlyCats.includes(cat)) continue;
    const want = Math.ceil(quota * per * (cat === 'SuperModulation' || cat === 'Drums & Perc' ? 3 : 1) / procs);
    for (let n = 0, tries = 0; n < want && tries < want * 14; tries++) {
      let pr = null;
      try { pr = GENE.has(cat) ? makeGene(r, cat, PDSL, PL, taken) : compose(r, cat, Object.assign({ kind: cat === 'SuperModulation' ? r.pick(['pad', 'pad', 'strings', 'lead', 'keys', 'brass']) : KIND[cat] }, copts)); } catch (e) { stats.errors++; if (stats.errors < 4) console.error('error:', e.stack); continue; }
      if (!pr) { stats.nulls++; continue; }
      if (!GENE.has(cat) && cat === 'Drums & Perc' && !PERC_OK.has(pr.meta.layers[0])) { stats.nulls++; continue; }
      if ((pr.used.match(/[AB]\d/g) || []).length > 2) { stats.nulls++; continue; }   // one or two oscillators, never three
      stats.composed++;
      if (!GENE.has(cat)) pr.desc = describeFav(pr.meta.base, pr.meta.mods.map(id => CLAUSE[id](pr.v)), pr.v, pr.meta.kind);   // the composer's description, with the clauses of the warm part and of this filter
      const values = L.loudnessMatch(pr, lab, A, target, mp, P);
      const used = pr.used.match(/[AB]\d/g), ids = A.SLOT_IDS, pairs = [];
      for (let a = 0; a < used.length; a++) for (let b = a + 1; b < used.length; b++) if (used[a][0] === used[b][0]) pairs.push([ids.indexOf(used[a]), ids.indexOf(used[b])]);
      const kindOf = pr.meta.kind;
      const au = A.audit(values, { pairs, stage1: (a) => A.judgeSound(a, kindOf) });
      const row = { cat, title: pr.title, desc: pr.desc, used: pr.used, v: pr.v, meta: pr.meta, audit: au };
      if (au.stopped) { row.refused = A.judgeSound(au, kindOf); au.features = [0]; }
      else { row.fltEffect = L.fltEffect(A, values, au.r60, { root: 60, seconds: 4.2, hold: 3.2 }); Object.assign(row, warmth(lab, values, au.r60)); }
      delete au.r60; delete au.frames;
      rows.push(row); taken.add(pr.title.toLowerCase()); n++;
    }
  }
  fs.writeFileSync(path.join(OUT, `fav${TAG}_cand_${k}.json`), JSON.stringify({ rows, stats }));
  process.exit(0);
}

// ----------------------------------------------------------------------------- the measures of the favourites themselves
if (process.argv.includes('--calib')) {
  const lab = require('../preset_lab.js'), A = require('./audit.js'), rows = [];
  for (const f of favourites()) {
    const au = A.audit(f.values, { stage1: () => false });
    const w = warmth(lab, f.values, au.r60);
    rows.push({ name: f.name, cat: f.cat, stars: f.stars, hf: au.hf, hfBurst: au.hfBurst, flat: au.flat, peak: au.peak, centroid: w.centroid, holdDb: w.holdDb });
  }
  fs.writeFileSync(path.join(OUT, 'fav_calib.json'), JSON.stringify(rows));
  const q = (key, p) => { const a = rows.map(x => x[key]).sort((m, n) => m - n); return a[Math.floor(p * (a.length - 1))]; };
  for (const key of ['hf', 'hfBurst', 'flat', 'centroid', 'holdDb']) console.log(`${key.padEnd(9)} min ${q(key, 0).toFixed(2)} 25% ${q(key, 0.25).toFixed(2)} median ${q(key, 0.5).toFixed(2)} 75% ${q(key, 0.75).toFixed(2)} 90% ${q(key, 0.9).toFixed(2)} max ${q(key, 1).toFixed(2)}`);
  process.exit(0);
}

// ----------------------------------------------------------------------------- the report of the written file
if (process.argv.includes('--report')) {
  const rows = require('../presets_fav.js'), defs = Object.fromEntries(SPEC.PARAMS.map(p => [p.key, p.def]));
  const val = (x, key) => (x.v[key] !== undefined ? x.v[key] : defs[key]);
  const cnt = (f) => { const c = {}; for (const x of rows) { const q = f(x); c[q] = (c[q] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([q, v]) => `${q} ${v}`).join(', '); };
  const q = (key, p) => { const a = rows.map(x => val(x, key)).sort((m, n) => m - n); return a[Math.floor(p * (a.length - 1))]; };
  console.log(rows.length + ' presets');
  console.log('categories: ' + cnt(x => x.cat));
  console.log('oscillators: ' + cnt(x => x.name.split(' ')[1]) + '; number of oscillators sounding: ' + cnt(x => ['a1_lvl', 'a2_lvl', 'b1_lvl'].filter(key => val(x, key) > 0).length));
  console.log('filter type: ' + cnt(x => (val(x, 'vf_type') === 1 ? 'OTA' : 'LADDER')));
  for (const [key, label] of [['vf_cut', 'cutoff Hz'], ['vf_res', 'resonance'], ['vf_env', 'envelope'], ['vf_key', 'key tracking'], ['amp_s', 'sustain'], ['amp_r', 'release'], ['v_unison', 'unison'], ['ch_mix', 'chorus'], ['fx_rmix', 'reverb mix'], ['fx_dmix', 'delay mix'], ['lfo_pitch', 'vibrato']]) console.log(`${label.padEnd(13)} min ${q(key, 0)}  10% ${q(key, 0.1)}  median ${q(key, 0.5)}  90% ${q(key, 0.9)}  max ${q(key, 1)}`);
  process.exit(0);
}

// ----------------------------------------------------------------------------- main: workers, then the selection
const per = +arg('per', 9), seed = +arg('seed', 1), procs = +arg('procs', 8);
fs.mkdirSync(OUT, { recursive: true });
let done = 0;
const t0 = Date.now();
if (process.argv.includes('--select-only')) select(true);
else for (let k = 0; k < procs; k++) fork(__filename, ['--worker', String(k), '--per', String(per), '--seed', String(seed), '--procs', String(procs), '--tag', TAG, '--cats', arg('cats', '')]).on('exit', () => { if (++done === procs) select(false); });

function select(selectOnly) {
  const A = require('./audit.js');
  const poolFile = path.join(OUT, `fav${TAG}_pool.json`);
  let cands = [], stats = { composed: 0, nulls: 0, errors: 0 };
  if (!selectOnly) for (let k = 0; k < procs; k++) {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, `fav${TAG}_cand_${k}.json`), 'utf8'));
    cands = cands.concat(j.rows); for (const s of Object.keys(stats)) stats[s] += j.stats[s];
  }
  if (fs.existsSync(poolFile) && (selectOnly || process.argv.includes('--pool'))) {
    const have = new Set(cands.map(c => c.title.toLowerCase()));
    for (const c of JSON.parse(fs.readFileSync(poolFile, 'utf8'))) if (!have.has(c.title.toLowerCase())) { cands.push(c); have.add(c.title.toLowerCase()); }
  }
  fs.writeFileSync(poolFile, JSON.stringify(cands));
  console.log(`${cands.length} candidates measured (${stats.composed} composed, ${stats.nulls} refused by the composer, ${stats.errors} errors) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // the limit of warmth: the spectral centroid of a note (Hz): 75 % of the favourites are below it
  let cmax = 1e9;
  try { const c = JSON.parse(fs.readFileSync(path.join(OUT, 'fav_calib.json'), 'utf8')).map(x => x.centroid).sort((a, b) => a - b); cmax = c[Math.floor(0.75 * (c.length - 1))]; } catch (e) { console.log('(no fav_calib.json: no limit on the spectral centroid)'); }
  const defs = Object.fromEntries(SPEC.PARAMS.map(p => [p.key, p.def]));
  const reasons = {}, bad = (why) => { reasons[why] = (reasons[why] || 0) + 1; return false; };
  const seen = new Set();
  const ok = cands.filter((c) => {
    const t = c.title.toLowerCase(); if (seen.has(t)) return false; seen.add(t);
    const a = c.audit, kind = c.meta.kind, sustained = !['pluck', 'bell', 'perc'].includes(kind);
    if (c.refused) return bad(c.refused);
    const g = (key) => (c.v[key] !== undefined ? c.v[key] : defs[key]);
    if ((c.used.match(/[AB]\d/g) || []).length > 2 || ['a1_lvl', 'a2_lvl', 'b1_lvl'].filter(key => g(key) > 0).length > 2) return bad('three oscillators');
    if (!(g('vf_cut') < 5000) || !(g('vf_res') >= 0.15)) return bad('no filter / no resonance');
    if (g('amp_s') < (sustained || c.cat === 'SuperModulation' ? 0.45 : 0.25)) return bad('no sustain');
    if (Object.keys(c.v).some(q => /^b2_/.test(q))) return bad('B2');
    for (const key of ['lfo2_shape', 'lfo3_shape']) if (c.v[key.replace('shape', 'amt')] && (c.v[key] || 0) > 1) return bad('an LFO that jumps');
    if (Object.keys(c.v).some(q => /_semi$/.test(q) && [3, 4, 5].includes(c.v[q]))) return bad('a third or a fourth above every note');
    if (g('v_unison') > 3 || L.cpuStack(c.v, defs) > 3) return bad('CPU: unison / stacked effects');
    const why = A.judgeSound(a, kind) || (c.cat === 'SuperModulation' ? A.judgeMotion(a, c.cat) : null) || A.judgeContrast(a);
    if (why) return bad(why);
    if (a.hf > GATE.hfMax || a.hfBurst > GATE.hfBurstMax) return bad('not warm: high frequencies');
    if (c.centroid > cmax) return bad('not warm: bright (spectral centroid)');
    if (sustained && c.holdDb < GATE.holdMin) return bad('the note does not hold');
    if (c.fltEffect < GATE.fltMin) return bad('the filter hardly changes the sound');
    return true;
  });
  console.log(`${ok.length} pass the gates. Refused: ` + Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  const { model, loo, keepers } = L.tasteModel(30);
  console.log(`taste model: leave-one-out correlation ${loo.r.toFixed(2)}; ${keepers.length} kept presets for the distinctness`);
  // the filter batch (chosen) counts as kept for the distinctness
  let batch1 = [];
  try { const ch = JSON.parse(fs.readFileSync(path.join(OUT, 'filter_chosen.json'), 'utf8')).map(c => c.title.toLowerCase()), fp = JSON.parse(fs.readFileSync(path.join(OUT, 'filter_pool.json'), 'utf8'));
    batch1 = fp.filter(c => ch.includes(c.title.toLowerCase()) && c.audit.features && c.audit.features.length >= 60).map(c => c.audit.features); } catch (e) { console.log('(no filter batch to compare with)'); }
  const nn = keepers.map((f, i) => Math.min(...keepers.map((g2, j) => (i === j ? 99 : L.dist(f, g2))))).sort((a, b) => a - b);
  const dmin = nn[Math.floor(0.1 * (nn.length - 1))];
  console.log(`  ${batch1.length} presets of the filter batch; the kept presets' nearest-neighbour distance: 10 % ${dmin.toFixed(2)}, median ${nn[nn.length >> 1].toFixed(2)}`);
  for (const c of ok) { c.score = model.predict({ v: A.fullValues(c.v), cat: c.cat, audit: c.audit }); c.features = c.audit.features; c.dKeep = Math.min(...keepers.concat(batch1).map(f => L.dist(c.features, f))); }
  const chosen = [];
  for (const [cat, quota] of QUOTA) {
    // two tiers: the candidates no nearer to a kept preset than dmin first; when a category is short of them (the organs sound alike), the ones down to 0.7 dmin
    const tier = (minD, left) => { const p = ok.filter(c => c.cat === cat && c.dKeep >= minD && !picksAll.includes(c)).sort((a, b) => b.score - a.score), sh = p.slice(0, Math.max(left + 4, Math.ceil(p.length * 0.6)));
      return { p, got: L.farthest(sh, left, keepers.concat(batch1, chosen.map(c => c.features)).concat(picksAll.map(c => c.features)), 0).map(i => sh[i]) }; };
    const picksAll = [], t1 = tier(dmin, quota); picksAll.push(...t1.got);
    let relaxed = 0;
    if (picksAll.length < quota) { const t2 = tier(0.7 * dmin, quota - picksAll.length); relaxed = t2.got.length; picksAll.push(...t2.got); }
    const picks = picksAll, pl = t1.p;
    const avg = (l) => (l.length ? l.reduce((s, c) => s + c.score, 0) / l.length : 0);
    console.log(`${cat.padEnd(16)} ${String(picks.length).padStart(2)} / ${quota} chosen from ${pl.length} (${ok.filter(c => c.cat === cat).length} before the distance gate${relaxed ? ', ' + relaxed + ' of them from the relaxed tier' : ''}); predicted stars: chosen ${avg(picks).toFixed(2)}, all ${avg(pl).toFixed(2)}`);
    for (const c of picks) chosen.push(c);
  }
  if (chosen.length < 100) console.log(`WARNING: only ${chosen.length} of 100 chosen: run more candidates (--pool, another --seed)`);
  const entries = chosen.map((c, i) => ({ name: `${FIRST + i} ${c.used} · ${c.title}`, cat: c.cat, desc: c.desc, v: L.sparse(c.v, SPEC) }));
  L.writeData(FILE, 'GENERATED by tools/supermod/fav_build.js (the owner\'s favourites as parents, compose.js, filter_lib.js, audit.js, the taste model of filter_taste.js): the presets inspired by his favourites, numbers 1551-1650\n(one or two oscillators, the voice FILTER, a sustain, organic and warm, a little effect), loudness matched; tools/supermod/loud_filter.js lowers the master volumes after a loud chord.', entries);
  fs.writeFileSync(path.join(OUT, `fav${TAG}_chosen.json`), JSON.stringify(chosen.map((c, i) => ({ num: FIRST + i, cat: c.cat, title: c.title, used: c.used, score: c.score, dKeep: c.dKeep, fltEffect: c.fltEffect, centroid: c.centroid, holdDb: c.holdDb, from: c.meta.from, meta: c.meta }))));
  console.log(`written ${path.relative(path.join(__dirname, '..', '..'), FILE)} (${entries.length} presets)`);
  if (!selectOnly) for (let k = 0; k < procs; k++) fs.unlinkSync(path.join(OUT, `fav${TAG}_cand_${k}.json`));
}
