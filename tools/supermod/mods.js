// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The modulation recipes of the SuperModulation presets (tools/supermod/compose.js). The novelty of the synthesizer is that every
// timbre control acts on the scales of one waveform cycle (the scale filter's cutoff and resonance, the SPARSITY that keeps only the
// largest wavelet atoms, the POSITION window that confines the filtering to part of the cycle, the SOURCE PHASE and WIDTH, the WAVELET
// MORPH between two families, the additive oscillators' drawbars and tilt). A recipe lets one of the two LFOs (or the mod envelope)
// move such controls while a note sounds, so the timbre is alive in time instead of fixed.
//   kind: 'lfo1' (LFO 1 amounts: PITCH CUTOFF POSITION WAVELET SPARSITY RESO ENV>WAV; several recipes share the LFO's shape and rate),
//         'lfo2' (LFO 2: one target; beta 0.3: every LFO 2 recipe has a twin for LFO 3, kind 'lfo3', id + '_3'), 'env' (the mod envelope's reach).
//   w: how often the recipe is drawn among the fitting ones (beta 0.3: the wavelet parameters of the subtractive oscillators come first).
//   dest: what it moves, for the statistics; wd: it is a wavelet-domain destination (counts as SuperModulation).
//   fits(ctx) tells whether it makes sense with the oscillators chosen; apply(ctx, r) changes ctx (oscillators and globals) and
//   returns { desc } (a clause for the description) — or null when it cannot be applied after all.
// One kind of table-changing destination per sound (SPARSITY, SOURCE PHASE, SOURCE WIDTH: the engine builds sets of tables for it).
'use strict';
const { wclass } = require('./layers.js');

const A_IDS = ['A1', 'A2'], B_IDS = ['B1'];
const aOsc = (ctx) => A_IDS.filter(id => ctx.osc[id]);
const bOsc = (ctx) => B_IDS.filter(id => ctx.osc[id]);
const allOsc = (ctx) => [...aOsc(ctx), ...bOsc(ctx)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// the LFO 1 / LFO 2 rate in hertz, by the speed of the sound's kind (ctx.speed: [slow, fast]), on a log scale
const rate = (ctx, r, lo = 0, hi = 1) => { const [a, b] = ctx.speed; return +(a * Math.pow(b / a, r.f(lo, hi) * 0.85)).toFixed(3); };   // beta 0.3.1: a little slower (the slower LFOs were rated higher)
const lfo1 = (ctx, r, shape, lo, hi) => {   // the first LFO 1 recipe sets the shape and rate; the others only add amounts
  const l = ctx.g.lfo = ctx.g.lfo || {};
  if (l.rate === undefined) { l.shape = shape || r.wpick([['sine', 5], ['tri', 4]]);   l.rate = rate(ctx, r, lo, hi); }
  return l;
};
// which of the two LFOs a recipe writes to: the LFO 2 recipes also run for LFO 3 (ctx.cur = 'lfo3')
const lk = (ctx) => ctx.cur || 'lfo2';
const withLfo = (c, k, f) => { const o = c.cur; c.cur = k; try { return f(); } finally { c.cur = o; } };
const lfo2 = (ctx, r, target, amt, shape, lo, hi) => {
  const key = lk(ctx), other = key === 'lfo2' ? 'lfo3' : 'lfo2', l2 = ctx.g[key] = ctx.g[key] || {};
  let rt = rate(ctx, r, lo, hi);
  for (const q of [ctx.g.lfo, ctx.g[other]]) {   // never in lock with another LFO
    const q1 = q && q.rate;
    if (q1 && Math.abs(Math.log(rt / q1)) < 0.35) rt = +(q1 * r.pick([0.43, 0.61, 1.57, 2.3])).toFixed(3);
  }
  l2.target = target; l2.amt = +amt.toFixed(2); l2.rate = clamp(rt, 0.05, 20); l2.shape = shape || r.wpick([['sine', 5], ['tri', 4]]);
  return l2;
};
const sign = (r) => (r.p(0.5) ? 1 : -1);
const ensure = (o, key, lo, hi, r) => { if (o[key] === undefined || o[key] < lo || o[key] > hi) o[key] = +r.f(lo, hi).toFixed(2); };
// is a table-changing destination already used (kind of variant) ?
const variantOf = (ctx) => ctx.variant || null;
const takeVariant = (ctx, k) => { if (ctx.variant && ctx.variant !== k) return false; ctx.variant = k; return true; };
// the wavelet the morph goes to: another class than the oscillators' own
const otherWavelet = (ctx, r) => {
  const own = allOsc(ctx).map(id => wclass(ctx.osc[id].wavelet || 'db4'));
  const want = own.includes('rough') && !own.includes('clean') ? ['db20', 'db8'] : own.includes('clean') && !own.includes('rough') ? ['haar', 'db2'] : ['db20', 'haar', 'db2'];
  return r.pick(want);
};

// A recipe that moves the scales only changes the sound where the wavelet shapes it: the scale filter has to cut into the sound (a cutoff
// between bands 3.8 and 6.8 for a subtractive oscillator), or the sparsity / window / additive scales have to be in play. sensitize puts the
// cutoffs of the oscillators that can be shaped there; it returns how many there are (0: this recipe would not be heard).
const sensitize = (c, r) => {
  let n = 0;
  for (const id of A_IDS) { const o = c.osc[id]; if (!o || ['sine', 'noise'].includes(o.wave)) continue; if (o.fcut === undefined || o.fcut > 8 || o.fcut < 2.8) o.fcut = +r.f(3.8, 6.8).toFixed(2); n++; }
  for (const id of B_IDS) { const o = c.osc[id]; if (!o) continue; if (o.fcut === undefined || o.fcut > 9) o.fcut = +r.f(5, 8).toFixed(2); n++; }
  return n;
};

const MODS = [
  // ---------------------------------------------------------------- LFO 1
  { id: 'cutBreath', kind: 'lfo1', dest: 'cut', wd: true, words: ['Breath', 'Swell', 'Lung'], fits: (c) => allOsc(c).length > 0,
    apply(c, r) { if (!sensitize(c, r)) return null; const l = lfo1(c, r); l.cut = +r.f(2, 4.5).toFixed(2); return { desc: 'the scale cutoff breathes' }; } },
  { id: 'sparseBreath', kind: 'lfo1', dest: 'sp', wd: true, words: ['Tide', 'Bloom', 'Atoms'], fits: (c) => aOsc(c).length > 0 && (!variantOf(c) || variantOf(c) === 'sparsity'),
    apply(c, r) {
      if (!takeVariant(c, 'sparsity')) return null;
      const l = lfo1(c, r, r.p(0.7) ? 'sine' : 'tri', 0, 0.55);
      for (const id of aOsc(c)) { const o = c.osc[id]; if (o.sparsity === undefined || o.sparsity > 0.45) o.sparsity = +r.f(0, 0.3).toFixed(2); if (wclass(o.wavelet || 'db4') === 'rough' && r.p(0.5)) o.wavelet = r.pick(['db4', 'db8']); }
      l.sp = +r.f(0.35, 0.75).toFixed(2);
      return { desc: 'its sparsity swings between a rich tone and a few wavelet atoms' };
    } },
  { id: 'resoWah', kind: 'lfo1', dest: 'res', wd: true, words: ['Wah', 'Ripple', 'Resonance'], fits: (c) => allOsc(c).length > 0,
    apply(c, r) {
      if (!sensitize(c, r)) return null;
      const l = lfo1(c, r, undefined, 0.15, 0.8);
      for (const id of allOsc(c)) ensure(c.osc[id], 'fres', 1, 3, r);
      l.res = +r.f(8, 18).toFixed(1);
      return { desc: 'the resonance of the scale filter pulses' };
    } },
  { id: 'windowSweep', kind: 'lfo1', dest: 'pos', wd: true, words: ['Sweep', 'Beam', 'Orbit'], fits: (c) => allOsc(c).length > 0,
    apply(c, r) {
      const l = lfo1(c, r, r.p(0.6) ? 'sine' : 'tri', 0, 0.6);
      const pick = r.pick(allOsc(c)), o = c.osc[pick];
      o.pdep = +r.f(0.6, 1).toFixed(2); o.pwid = +r.f(0.15, 0.4).toFixed(2); o.pcen = +r.f(0, 1).toFixed(2);
      if (c.osc[pick] && (pick[0] === 'A') && (o.fcut === undefined || o.fcut > 7)) o.fcut = +r.f(3.5, 6).toFixed(2);
      l.pos = +r.f(0.25, 0.5).toFixed(2);
      return { desc: 'the filtered part of the cycle is swept along it' };
    } },
  { id: 'morphLfo', kind: 'lfo1', dest: 'wav', wd: true, words: ['Morph', 'Blend', 'Shapeshift'], fits: (c) => allOsc(c).length > 0 && !c.g.morph,
    apply(c, r) {
      if (!sensitize(c, r)) return null;
      const l = lfo1(c, r, undefined, 0.05, 0.6), w2 = otherWavelet(c, r);
      c.g.morph = [w2, +r.f(0.2, 0.5).toFixed(2), +r.f(0.5, 1).toFixed(2), 0];
      l.wav = c.g.morph[2];
      return { desc: `its wavelet morphs towards ${w2.toUpperCase()}` };
    } },
  { id: 'ewSwing', kind: 'lfo1', dest: 'ew', wd: true, words: ['Swing', 'Pulse', 'Surge'], fits: (c) => allOsc(c).length > 0 && !c.g.morph,
    apply(c, r) {
      if (!sensitize(c, r)) return null;
      const l = lfo1(c, r, undefined, 0.1, 0.6), w2 = otherWavelet(c, r);
      c.g.morph = [w2, +r.f(0.05, 0.2).toFixed(2), 0, +r.f(0.3, 0.6).toFixed(2)];
      c.g.mod = c.g.mod || [+r.f(0.005, 0.3).toFixed(3), +r.f(0.6, 1.6).toFixed(2), +r.f(0.6, 0.95).toFixed(2), +r.f(0.3, 1).toFixed(2)];
      l.ew = +r.f(0.45, 0.95).toFixed(2);
      return { desc: `each note's envelope pushes the wavelet towards ${w2.toUpperCase()}, by an amount the LFO swings` };
    } },
  { id: 'pitchVib', kind: 'lfo1', dest: 'pitch', wd: false, words: ['Vibrato', 'Waver'], fits: (c) => c.kind !== 'perc',
    apply(c, r) { const l = lfo1(c, r, 'sine', 0.55, 0.85); l.pitch = +r.f(3, 14).toFixed(1); return { desc: 'a light vibrato' }; } },
  // ---------------------------------------------------------------- LFO 2
  { id: 'l2Sparse', kind: 'lfo2', w: 3, dest: 'sparsity', wd: true, words: ['Tide', 'Bloom', 'Atoms'], fits: (c) => aOsc(c).length > 0 && (!variantOf(c) || variantOf(c) === 'sparsity') && !(c.g[lk(c)]),
    apply(c, r) {
      if (!takeVariant(c, 'sparsity')) return null;
      for (const id of aOsc(c)) { const o = c.osc[id]; if (o.sparsity === undefined || o.sparsity > 0.5) o.sparsity = +r.f(0.05, 0.4).toFixed(2); if (wclass(o.wavelet || 'db4') === 'rough') o.wavelet = r.pick(['db4', 'db8', 'sym8']); }
      lfo2(c, r, 'sparsity', sign(r) * r.f(0.45, 0.9), undefined, 0, 0.5);
      return { desc: 'LFO 2 thins and thickens the atoms (sparsity)' };
    } },
  { id: 'l2Phase', kind: 'lfo2', w: 3, dest: 'phase', wd: true, words: ['Swirl', 'Spiral', 'Shift'], fits: (c) => aOsc(c).length > 0 && (!variantOf(c) || variantOf(c) === 'phase') && !c.g[lk(c)],
    apply(c, r) {
      if (!takeVariant(c, 'phase')) return null;
      if (!sensitize(c, r)) return null;
      for (const id of aOsc(c)) { const o = c.osc[id]; if (wclass(o.wavelet || 'db4') === 'clean') o.wavelet = r.pick(['haar', 'db2', 'db4']); ensure(o, 'fres', 1.5, 4, r); }
      lfo2(c, r, 'phase', sign(r) * r.f(0.3, 0.75), undefined, 0, 0.45);
      return { desc: 'LFO 2 slides the source inside its cycle, so the wavelet atoms meet other parts of the wave (source phase)' };
    } },
  { id: 'l2Width', kind: 'lfo2', w: 3, dest: 'srcwidth', wd: true, words: ['Pinch', 'Weave', 'Pulse'], fits: (c) => aOsc(c).some(id => ['pulse', 'tri'].includes(c.osc[id].wave)) && (!variantOf(c) || variantOf(c) === 'width') && !c.g[lk(c)],
    apply(c, r) {
      if (!takeVariant(c, 'width')) return null;
      lfo2(c, r, 'srcwidth', sign(r) * r.f(0.45, 0.9), undefined, 0, 0.55);
      return { desc: 'LFO 2 pulls the source wave between narrow and wide (source width)' };
    } },
  { id: 'l2Cut', kind: 'lfo2', w: 2.5, dest: 'cutoff', wd: true, words: ['Sweep', 'Rise'], fits: (c) => allOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) { if (!sensitize(c, r)) return null; lfo2(c, r, 'cutoff', sign(r) * r.f(0.35, 0.7), undefined, 0, 0.5); return { desc: 'LFO 2 sweeps the scale filter' }; } },
  { id: 'l2Reso', kind: 'lfo2', w: 2.2, dest: 'reso', wd: true, words: ['Wah', 'Ripple'], fits: (c) => allOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) { if (!sensitize(c, r)) return null; for (const id of allOsc(c)) ensure(c.osc[id], 'fres', 2, 5, r); lfo2(c, r, 'reso', r.f(0.55, 0.9), undefined, 0, 0.6); return { desc: 'LFO 2 swells the resonance' }; } },
  { id: 'l2Pos', kind: 'lfo2', w: 2.5, dest: 'position', wd: true, words: ['Orbit', 'Beam', 'Sweep'], fits: (c) => allOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) {
      const id = r.pick(allOsc(c)), o = c.osc[id];
      o.pdep = +r.f(0.65, 1).toFixed(2); o.pwid = +r.f(0.15, 0.4).toFixed(2); o.pcen = +r.f(0, 1).toFixed(2);
      if (id[0] === 'A' && (o.fcut === undefined || o.fcut > 7)) o.fcut = +r.f(3.5, 6).toFixed(2);
      lfo2(c, r, 'position', sign(r) * r.f(0.5, 1), undefined, 0, 0.5);
      return { desc: 'LFO 2 carries the window of the scale filter round the cycle' };
    } },
  { id: 'l2WinW', kind: 'lfo2', w: 1.5, dest: 'width', wd: true, words: ['Pinch', 'Breathe'], fits: (c) => allOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) {
      const id = r.pick(allOsc(c)), o = c.osc[id];
      o.pdep = +r.f(0.7, 1).toFixed(2); o.pwid = +r.f(0.2, 0.5).toFixed(2); o.pcen = +r.f(0, 1).toFixed(2);
      if (id[0] === 'A' && (o.fcut === undefined || o.fcut > 7)) o.fcut = +r.f(3.5, 6).toFixed(2);
      lfo2(c, r, 'width', sign(r) * r.f(0.5, 0.9), undefined, 0, 0.5);
      return { desc: 'LFO 2 widens and narrows the filtered window' };
    } },
  { id: 'l2Morph', kind: 'lfo2', w: 2.5, dest: 'morph', wd: true, words: ['Morph', 'Blend', 'Drift'], fits: (c) => allOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) {
      if (!sensitize(c, r)) return null;
      if (!c.g.morph) { const w2 = otherWavelet(c, r); c.g.morph = [w2, +r.f(0.25, 0.5).toFixed(2), 0, 0]; }
      lfo2(c, r, 'morph', sign(r) * r.f(0.5, 0.9), undefined, 0, 0.5);
      return { desc: `LFO 2 drifts between two wavelet families (${(c.g.morph[0]).toUpperCase()})` };
    } },
  { id: 'l2Tilt', kind: 'lfo2', dest: 'tilt', wd: true, words: ['Tilt', 'Lean', 'Rise'], fits: (c) => bOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) { for (const id of bOsc(c)) ensure(c.osc[id], 'tilt', -7, -2, r); lfo2(c, r, 'tilt', sign(r) * r.f(0.15, 0.35), undefined, 0, 0.5); return { desc: 'LFO 2 tilts the scales from dark to bright' }; } },
  { id: 'l2Odd', kind: 'lfo2', dest: 'odd', wd: true, words: ['Flip', 'Hollow', 'Odd'], fits: (c) => bOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) {
      for (const id of bOsc(c)) { const o = c.osc[id]; o.bars = (o.bars || []).slice(); for (let b = 0; b < 8; b += 2) o.bars[b] = Math.max(0.35, Math.min(0.9, o.bars[b] === undefined ? 0.6 : o.bars[b])); }
      lfo2(c, r, 'odd', sign(r) * r.f(0.55, 0.95), undefined, 0, 0.45);
      return { desc: 'LFO 2 swells and drops the odd scales: hollow, then full' };
    } },
  { id: 'l2Even', kind: 'lfo2', dest: 'even', wd: true, words: ['Flip', 'Even', 'Alternate'], fits: (c) => bOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) {
      for (const id of bOsc(c)) { const o = c.osc[id]; o.bars = (o.bars || []).slice(); for (let b = 1; b < 8; b += 2) o.bars[b] = Math.max(0.35, Math.min(0.9, o.bars[b] === undefined ? 0.55 : o.bars[b])); }
      lfo2(c, r, 'even', sign(r) * r.f(0.55, 0.95), undefined, 0, 0.45);
      return { desc: 'LFO 2 pulls the even scales in and out' };
    } },
  { id: 'l2Sus', kind: 'lfo2', dest: 'sus', wd: true, words: ['Hold', 'Float'], fits: (c) => bOsc(c).some(id => c.osc[id].sus !== undefined && c.osc[id].sus < 0.9) && !c.g[lk(c)],
    apply(c, r) { for (const id of bOsc(c)) { const o = c.osc[id]; ensure(o, 'sus', 0.25, 0.6, r); o.body = +r.f(0.8, 2.5).toFixed(2); o.bright = +r.f(0.15, 0.5).toFixed(2); } lfo2(c, r, 'sus', sign(r) * r.f(0.45, 0.8), undefined, 0, 0.4); return { desc: 'LFO 2 changes how much of the upper scales survives the decay' }; } },
  { id: 'l2EnvAmt', kind: 'lfo2', dest: 'envamt', wd: true, words: ['Surge', 'Rise'], fits: (c) => allOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) {
      c.g.mod = c.g.mod || [+r.f(0.003, 0.2).toFixed(3), +r.f(0.4, 1.4).toFixed(2), +r.f(0.05, 0.4).toFixed(2), +r.f(0.3, 1).toFixed(2)];
      for (const id of allOsc(c)) { const o = c.osc[id]; o.fenv = +r.f(1.5, 4.5).toFixed(2); if (o.fcut === undefined || o.fcut > 7) o.fcut = +r.f(2.5, 5).toFixed(2); }
      lfo2(c, r, 'envamt', r.f(0.4, 0.8), undefined, 0, 0.5);
      return { desc: 'LFO 2 changes how far each note\'s envelope opens the scale filter' };
    } },
  { id: 'l2Slope', kind: 'lfo2', w: 1.8, dest: 'slope', wd: true, words: ['Edge', 'Slope'], fits: (c) => allOsc(c).length > 0 && !c.g[lk(c)],
    apply(c, r) { if (!sensitize(c, r)) return null; for (const id of allOsc(c)) c.osc[id].fslope = +r.f(18, 40).toFixed(1); lfo2(c, r, 'slope', r.f(0.4, 0.7), undefined, 0, 0.5); return { desc: 'LFO 2 sharpens and relaxes the edge of the scale filter' }; } },
  // the FILTER effect (beta 0.3) moved by an LFO: its cutoff (octaves) or its resonance; the filter is set up first (g.flt)
  { id: 'l2FltCut', kind: 'lfo2', w: 0.3, dest: 'fltcut', wd: false, words: ['Sweep', 'Wah', 'Rise'], fits: (c) => !!c.g.flt && !c.g[lk(c)],
    apply(c, r) { lfo2(c, r, 'fltcut', sign(r) * r.f(0.1, 0.28), undefined, 0, 0.55); return { desc: 'LFO 2 sweeps the cutoff of the low-pass filter' }; } },
  { id: 'l2FltRes', kind: 'lfo2', w: 0.5, dest: 'fltres', wd: false, words: ['Wah', 'Ripple'], fits: (c) => !!c.g.flt && !c.g[lk(c)],
    apply(c, r) { c.g.flt.res = +Math.max(c.g.flt.res, r.f(0.35, 0.55)).toFixed(2); lfo2(c, r, 'fltres', r.f(0.3, 0.55), undefined, 0, 0.6); return { desc: 'LFO 2 pulses the resonance of the low-pass filter' }; } },
  // ---------------------------------------------------------------- the mod envelope
  { id: 'envSweep', kind: 'env', dest: 'envcut', wd: true, words: ['Rise', 'Open'], fits: (c) => allOsc(c).length > 0 && !c.g.mod,
    apply(c, r) {
      c.g.mod = [+r.f(0.003, 0.4).toFixed(3), +r.f(0.3, 1.6).toFixed(2), +r.f(0.05, 0.5).toFixed(2), +r.f(0.3, 1.2).toFixed(2)];
      for (const id of allOsc(c)) { const o = c.osc[id]; if (o.fenv === undefined || o.fenv < 1.5) o.fenv = +r.f(2, 5).toFixed(2); if (o.fcut === undefined || o.fcut > 7) o.fcut = +r.f(2.5, 5).toFixed(2); }
      return { desc: 'each note opens its scale filter on its own envelope' };
    } },
];
// beta 0.3: LFO 3 does what LFO 2 does (the same targets): every LFO 2 recipe has a twin that writes to LFO 3
for (const m of MODS.filter(x => x.kind === 'lfo2')) {
  MODS.push(Object.assign({}, m, { id: m.id + '_3', kind: 'lfo3',
    fits: (c) => withLfo(c, 'lfo3', () => m.fits(c)),
    apply: (c, r) => { const res = withLfo(c, 'lfo3', () => m.apply(c, r)); return res && { desc: res.desc.replace('LFO 2', 'LFO 3') }; } }));
}
// the destinations that are the same control moved by two LFOs (LFO 1 amounts and the LFO 2 / LFO 3 targets): one at a time
const EQUIV = { cut: 'cutoff', sp: 'sparsity', res: 'reso', pos: 'position', wav: 'morph', ew: 'morph' };
const canon = (d) => EQUIV[d] || d;

// ---- the FILTER effect (beta 0.3): what a player expects of a good synth filter, by kind of sound. A bass has a closed low-pass that its envelope snaps
// open, a pad opens slowly, a pluck snaps shut, an organ hardly moves it, an effect may do anything. Returns the g.flt of tools/preset_dsl.js.
const rd = (x, n) => +x.toFixed(n === undefined ? 2 : n);
const FLT = {
  bass: (r) => ({ type: r.pick(['ladder', 'ladder', 'ota']), cut: rd(r.f(110, 420), 0), res: rd(r.f(0.12, 0.5)), drive: rd(r.f(0, 0.35)), key: rd(r.f(0.35, 0.8)), env: rd(r.f(0.3, 0.7)), adsr: [0.002, rd(r.f(0.12, 0.5), 3), rd(r.f(0, 0.35)), rd(r.f(0.08, 0.3), 3)] }),
  lead: (r) => ({ type: r.pick(['ota', 'ota', 'ladder']), cut: rd(r.f(900, 3500), 0), res: rd(r.f(0.08, 0.4)), drive: rd(r.f(0, 0.3)), key: rd(r.f(0.5, 1)), env: rd(r.f(0.25, 0.6)), adsr: [rd(r.f(0.002, 0.03), 3), rd(r.f(0.2, 0.7), 3), rd(r.f(0.3, 0.8)), rd(r.f(0.15, 0.5), 3)] }),
  keys: (r) => ({ type: r.pick(['ladder', 'ota']), cut: rd(r.f(700, 2800), 0), res: rd(r.f(0.05, 0.3)), drive: rd(r.f(0, 0.2)), key: rd(r.f(0.5, 0.9)), env: rd(r.f(0.25, 0.55)), adsr: [0.002, rd(r.f(0.25, 0.9), 3), rd(r.f(0.05, 0.4)), rd(r.f(0.2, 0.5), 3)] }),
  organ: (r) => ({ type: 'ota', cut: rd(r.f(2200, 8000), 0), res: rd(r.f(0, 0.18)), drive: rd(r.f(0, 0.2)), key: rd(r.f(0.6, 1)), env: rd(r.f(0.08, 0.25)), adsr: [0.005, 0.3, rd(r.f(0.7, 1)), 0.1] }),
  pad: (r) => ({ type: r.pick(['ladder', 'ota']), cut: rd(r.f(280, 1400), 0), res: rd(r.f(0.08, 0.4)), drive: rd(r.f(0, 0.15)), key: rd(r.f(0.3, 0.7)), env: rd(r.f(0.25, 0.55)), adsr: [rd(r.f(0.5, 2.4), 3), rd(r.f(1, 3), 3), rd(r.f(0.5, 0.9)), rd(r.f(1.2, 3), 3)] }),
  strings: (r) => ({ type: r.pick(['ota', 'ladder']), cut: rd(r.f(1100, 4000), 0), res: rd(r.f(0.03, 0.25)), drive: 0, key: rd(r.f(0.4, 0.8)), env: rd(r.f(0.15, 0.4)), adsr: [rd(r.f(0.15, 0.8), 3), rd(r.f(0.8, 2), 3), rd(r.f(0.6, 0.95)), rd(r.f(0.5, 1.5), 3)] }),
  brass: (r) => ({ type: r.pick(['ladder', 'ota']), cut: rd(r.f(350, 1400), 0), res: rd(r.f(0.05, 0.3)), drive: rd(r.f(0, 0.2)), key: rd(r.f(0.4, 0.8)), env: rd(r.f(0.4, 0.75)), adsr: [rd(r.f(0.04, 0.18), 3), rd(r.f(0.25, 0.8), 3), rd(r.f(0.5, 0.9)), rd(r.f(0.15, 0.4), 3)] }),
  pluck: (r) => ({ type: r.pick(['ladder', 'ota']), cut: rd(r.f(600, 2400), 0), res: rd(r.f(0.08, 0.4)), drive: rd(r.f(0, 0.2)), key: rd(r.f(0.5, 0.9)), env: rd(r.f(0.35, 0.7)), adsr: [0.001, rd(r.f(0.15, 0.8), 3), rd(r.f(0, 0.05)), rd(r.f(0.1, 0.4), 3)] }),
  bell: (r) => ({ type: 'ota', cut: rd(r.f(1500, 6000), 0), res: rd(r.f(0, 0.2)), drive: 0, key: rd(r.f(0.7, 1)), env: rd(r.f(0.15, 0.4)), adsr: [0.002, rd(r.f(0.8, 3), 3), rd(r.f(0, 0.1)), rd(r.f(0.5, 1.5), 3)] }),
  fx: (r) => ({ type: r.pick(['ladder', 'ota']), cut: rd(r.f(150, 5000), 0), res: rd(r.f(0.1, 0.7)), drive: rd(r.f(0, 0.6)), key: rd(r.f(0, 0.6)), env: rd(r.f(-0.7, 0.7)), adsr: [rd(r.f(0.005, 1.5), 3), rd(r.f(0.3, 2.5), 3), rd(r.f(0.2, 0.8)), rd(r.f(0.4, 2.5), 3)] }),
  perc: (r) => ({ type: r.pick(['ladder', 'ota']), cut: rd(r.f(1500, 7000), 0), res: rd(r.f(0.05, 0.4)), drive: rd(r.f(0, 0.3)), key: rd(r.f(0.3, 0.7)), env: rd(r.f(0.2, 0.6)), adsr: [0.001, rd(r.f(0.04, 0.25), 3), 0, rd(r.f(0.04, 0.15), 3)] }),
};
// how often a kind of sound has the filter (a little over two thirds of the new presets in all)
const FLT_PROB = { bass: 0.85, lead: 0.75, keys: 0.65, organ: 0.4, pad: 0.75, strings: 0.6, brass: 0.75, pluck: 0.7, bell: 0.45, fx: 0.7, perc: 0.5 };
const fltSetup = (c, r) => { const f = c.g.flt = FLT[c.kind](r); f.env = rd(f.env * 0.6); return f; };   // beta 0.3.1: gentler filter envelopes (rated lower)
// the clause of a description for the filter (v: the sparse values of the preset)
const fltClause = (v) => {
  const ty = v.vf_type === 1 ? 'OTA' : 'ladder', env = v.vf_env || 0, res = v.vf_res || 0;
  let s = `a 24 dB ${ty} low-pass (${Math.round(v.vf_cut)} Hz)`;
  if (Math.abs(env) > 0.12) s += env > 0 ? ' that opens on every note' : ' that closes on every note';
  if (res > 0.4) s += ' with a singing resonance'; else if (res > 0.22) s += ' with some bite';
  if ((v.vf_drive || 0) > 0.3) s += ', driven hard';
  return s;
};
const BY_ID = Object.fromEntries(MODS.map(m => [m.id, m]));
// the clause of a recipe in a description, from the values of the preset (v: sparse parameter values)
const WN = ['Haar', 'Daubechies 2', 'Daubechies 4', 'Daubechies 8', 'Symlet 8', 'Coiflet 3', 'Daubechies 20'];
const CLAUSE = {
  cutBreath: () => 'the scale cutoff breathes', sparseBreath: () => 'the sparsity swings between a rich tone and a few wavelet atoms',
  resoWah: () => 'the resonance of the scale filter pulses', windowSweep: () => 'the filtered part of the cycle is swept along it',
  morphLfo: (v) => `the wavelet morphs towards ${WN[v.wav2]}`, ewSwing: (v) => `each note's envelope pushes the wavelet towards ${WN[v.wav2]}, by an amount the LFO swings`,
  pitchVib: () => 'a light vibrato', envSweep: () => 'each note opens its scale filter on its own envelope',
  l2Sparse: () => 'LFO 2 thins and thickens the atoms (sparsity)', l2Phase: () => 'LFO 2 slides the source inside its cycle, so the atoms meet other parts of the wave (source phase)',
  l2Width: () => 'LFO 2 pulls the source wave between narrow and wide', l2Cut: () => 'LFO 2 sweeps the scale filter', l2Reso: () => 'LFO 2 swells the resonance',
  l2Pos: () => 'LFO 2 carries the window of the scale filter round the cycle', l2WinW: () => 'LFO 2 widens and narrows the filtered window',
  l2Morph: (v) => `LFO 2 drifts the wavelet towards ${WN[v.wav2]}`, l2Tilt: () => 'LFO 2 tilts the scales from dark to bright',
  l2Odd: () => 'LFO 2 swells and drops the odd scales: hollow, then full', l2Even: () => 'LFO 2 pulls the even scales in and out',
  l2Sus: () => 'LFO 2 changes how much of the upper scales survives the decay', l2EnvAmt: () => 'LFO 2 changes how far each note\'s envelope opens the scale filter',
  l2Slope: () => 'LFO 2 sharpens and relaxes the edge of the scale filter', l2FltCut: () => 'LFO 2 sweeps the cutoff of the low-pass filter', l2FltRes: () => 'LFO 2 pulses the resonance of the low-pass filter',
};
for (const id of Object.keys(CLAUSE)) if (/^l2/.test(id)) { const f = CLAUSE[id]; CLAUSE[id + '_3'] = (v) => f(v).replace('LFO 2', 'LFO 3'); }
module.exports = { MODS, BY_ID, CLAUSE, aOsc, bOsc, allOsc, canon, FLT_PROB, fltSetup, fltClause, withLfo };
