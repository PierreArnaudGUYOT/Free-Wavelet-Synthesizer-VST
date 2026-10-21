// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The composer of the beta 0.2 and 0.3 presets: builds one preset from the layers (tools/supermod/layers.js) and the modulation recipes
// (tools/supermod/mods.js) with a seeded generator. Two oscillators of the same kind are chosen to be very different (the contrast
// score: family, role, wavelet class, wave or pattern, brightness, tuning, filter, own envelope), the category sets the envelope, the
// voices, the effects and the speed of the LFOs, and the recipes make the wavelet-domain controls move in time.
// Beta 0.3: three oscillators (A1 A2 B1), LFO 2 and LFO 3 (every preset moves wavelet parameters with one of them or both, mostly of the subtractive
// oscillators), the FILTER effect (about two presets in three) and the Drums & Perc category (tools/supermod/perc.js).
//   const { compose } = require('./compose.js');   compose(r, cat, { taken: Set of names }) -> a preset { cat, title, desc, v, meta } or null
'use strict';
const { P } = require('../preset_dsl.js');
const LAY = require('./layers.js');
const { MODS, CLAUSE, aOsc, bOsc, allOsc, canon, FLT_PROB, fltSetup, fltClause } = require('./mods.js');
const { drum } = require('./perc.js');
const { wclass } = LAY;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const FORM = {
  bass: ['Bass', 'Low End', 'Growl', 'Sub', 'Rumble', 'Undertow', 'Foundation'], lead: ['Lead', 'Cry', 'Call', 'Line', 'Voice', 'Signal'],
  keys: ['Keys', 'Tines', 'Clav', 'Chords', 'Piano'], pad: ['Pad', 'Cloud', 'Wash', 'Haze', 'Bed', 'Fog', 'Aurora'], strings: ['Strings', 'Bows', 'Ensemble', 'Section'],
  brass: ['Horns', 'Brass', 'Reeds', 'Fanfare'], pluck: ['Pluck', 'Harp', 'Strum', 'Lute', 'Pick'], bell: ['Bells', 'Chimes', 'Gong', 'Mallets', 'Bars'],
  organ: ['Organ', 'Pipes', 'Drawbars'], fx: ['Texture', 'Scape', 'Event', 'Machine', 'Storm', 'Signal'],
};
// category -> the kind of sound (SuperModulation draws one) and the speed of its LFOs (Hz, slow..fast, log scale)
const CATS = {
  'SuperModulation': { kind: null }, 'Bass': { kind: 'bass', speed: [0.2, 6] }, 'Lead': { kind: 'lead', speed: [0.4, 8] }, 'Keys': { kind: 'keys', speed: [0.25, 5] },
  'Organ': { kind: 'organ', speed: [0.3, 7] }, 'Pad': { kind: 'pad', speed: [0.06, 1.4] }, 'Strings': { kind: 'strings', speed: [0.12, 4] },
  'Brass & Wind': { kind: 'brass', speed: [0.3, 6] }, 'Pluck': { kind: 'pluck', speed: [0.25, 5] }, 'Bells & Mallets': { kind: 'bell', speed: [0.08, 2.5] },
  'FX': { kind: 'fx', speed: [0.05, 9] }, 'Drums & Perc': { kind: 'perc', speed: [1.5, 12] },
};
const SPEED = { bass: [0.2, 6], lead: [0.4, 8], keys: [0.25, 5], organ: [0.3, 7], pad: [0.06, 1.4], strings: [0.12, 4], brass: [0.3, 6], pluck: [0.25, 5], bell: [0.08, 2.5], fx: [0.05, 9], perc: [1.5, 12] };
// (beta 0.3.1, after the owner's ratings of 501-620: the SuperModulation sounds he liked were pads and leads, the basses were rated lowest: fewer basses)
const SUPER_KINDS = [['pad', 4], ['lead', 3], ['bass', 0.8], ['keys', 2], ['pluck', 2], ['strings', 1.4], ['fx', 3], ['brass', 1], ['bell', 1.2], ['organ', 0.6]];
// beta 0.3.1: the recipes that act on the wavelet itself (what the instrument is about), not only on a filter: the atoms kept (sparsity), the source phase and width, the morph between two
// wavelets, the window, the additive scales. SuperModulation sounds draw them more often and need at least two of them (the owner asked for presets "that innovate with the wavelets").
const INNOV = new Set(['sparseBreath', 'morphLfo', 'windowSweep', 'ewSwing', 'l2Sparse', 'l2Phase', 'l2Width', 'l2Morph', 'l2Pos', 'l2WinW', 'l2Tilt', 'l2Odd', 'l2Even', 'l2Sus']);
const isInnov = (id) => INNOV.has(id.replace(/_3$/, ''));
// beta 0.3.1: how much a layer is drawn, from the mean stars of the presets made of it (shrunk towards 1: few ratings each): smooth warm waves up, nasal / phased / stepped ones down
const LAYER_W = { softtri: 1.8, warmsaw: 1.6, subsq: 1.5, knockpulse: 1.3, trigrit: 1.2, hollowbars: 1.2, buzzsaw: 1.1, reedpulse: 0.4, phasesaw: 0.4, phasepulse: 0.5, walsh: 0.6, zapsine: 0.6,
  bassmirror: 0.5, thumptri: 0.7, sparsesaw: 0.7, hollowsq: 0.7, mallet: 0.8, subsine: 0.8, sinepure: 0.9 };
const pickLayer = (r, pool) => r.wpick(pool.map(l => [l, LAYER_W[l.id] || 1]));

// which layers a kind of sound may use for each role
const okLayer = (l, kind) => {
  if (l.role === 'sub') return kind === 'bass' || kind === 'pad' || kind === 'lead' || kind === 'fx';
  if (kind === 'bass') return l.bright <= 3 && l.id !== 'noisewash';
  if (kind === 'pad' || kind === 'strings') return l.role !== 'attack' || ['chiff', 'bellbar', 'thumptri'].includes(l.id) || l.bright <= 3;
  if (kind === 'bell') return l.role === 'attack' || l.role === 'color' || l.role === 'air' || l.bright >= 3;
  if (kind === 'organ') return l.mode === 'B' || l.role !== 'attack';
  return true;
};
const bodyOk = (l, kind) => l.role === 'body' || (l.role === 'color' && (kind === 'lead' || kind === 'fx' || kind === 'keys' || kind === 'brass' || kind === 'pluck'));

function contrast(a, b) {   // how different two layers (with their oscillator values) are: 0 .. 8
  let s = 0;
  if (a.l.fam !== b.l.fam) s++; else return 0;
  if (a.l.role !== b.l.role) s++;
  if (a.l.mode === b.l.mode) {
    if (wclass(a.o.wavelet || 'db4') !== wclass(b.o.wavelet || 'db4')) s++;
    if ((a.o.wave || a.o.pattern) !== (b.o.wave || b.o.pattern)) s++;
    if ((a.o.ftype || 'lp') !== (b.o.ftype || 'lp')) s++;
  } else s += 2;
  if (Math.abs(a.l.bright - b.l.bright) >= 2) s++;
  if (((a.o.oct || 0) * 12 + (a.o.semi || 0)) !== ((b.o.oct || 0) * 12 + (b.o.semi || 0))) s++;
  if (!!a.o.env !== !!b.o.env) s++;
  return s;
}

// ---- the sound's tuning relation between a layer and the body, by its role
function placeLayer(r, kind, role, o, isBody) {
  const lowKind = kind === 'bass';
  if (isBody) { o.oct = lowKind ? r.pick([-1, 0]) : 0; return; }
  if (role === 'sub') { o.oct = lowKind ? r.pick([-2, -1]) : r.pick([-1, -2]); return; }
  if (role === 'attack') { o.oct = r.wpick([[0, 4], [1, 3], [2, 1], [-1, lowKind ? 3 : 1]]); if (lowKind && o.oct > 0) o.oct = 0; return; }
  if (role === 'air') { o.oct = r.wpick([[1, 3], [2, 2], [0, 2]]); return; }
  // color: another octave, a fifth, or the same pitch detuned
  // (never a third or a fourth: stacked on every note of a chord they make clusters)
  const way = r.wpick([['oct+', 3], ['oct-', 2.2], ['fifth', 1.3], ['same', 2.6]]);
  if (way === 'oct+') o.oct = 1; else if (way === 'oct-') o.oct = -1; else if (way === 'fifth') { o.oct = 0; o.semi = 7; }
  else { o.oct = 0; o.fine = r.pick([-1, 1]) * +r.f(5, 14).toFixed(1); }
  if (lowKind && o.oct > 0) o.oct = 0;
}
function levelFor(r, role) {
  return +({ body: () => r.f(0.72, 1), color: () => r.f(0.38, 0.8), attack: () => r.f(0.5, 0.95), sub: () => r.f(0.4, 0.85), air: () => r.f(0.18, 0.45) }[role]()).toFixed(2);
}

// ---- the envelope, voices and effects of a kind of sound
function globals(r, kind) {
  const g = {};
  const mono = (kind === 'bass' || kind === 'lead') && r.p(kind === 'lead' ? 0.55 : 0.45);
  g.voices = mono ? 1 : r.pick([6, 8, 10, 12]);
  if (mono) { g.porta = 'legato'; g.glide = +r.f(0.02, 0.12).toFixed(3); }
  switch (kind) {
    case 'bass': g.oct = -1; g.amp = [r.f(0.002, 0.01), r.f(0.3, 0.9), r.f(0.5, 0.9), r.f(0.08, 0.25), r.f(0.4, 0.8)]; g.uni = [1, 0]; g.width = 0.3;
      g.reverb = [r.f(0.15, 0.3), r.f(0.04, 0.12)]; if (r.p(0.3)) g.drive = +r.f(0.05, 0.25).toFixed(2); if (r.p(0.25)) g.chorus = [r.f(0.15, 0.35), 0.5, 0.5]; break;
    case 'lead': g.amp = [r.f(0.004, 0.03), r.f(0.3, 0.8), r.f(0.6, 0.9), r.f(0.15, 0.4), 0.5]; g.uni = [r.pick([1, 1, 2]), r.f(6, 14)]; g.width = 0.7;
      if (r.p(0.65)) g.delay = [r.pick([0.25, 0.33, 0.375, 0.5]), r.f(0.25, 0.4), r.f(0.1, 0.25)]; g.reverb = [r.f(0.4, 0.7), r.f(0.1, 0.3)]; break;
    case 'keys': g.amp = [r.f(0.002, 0.01), r.f(0.5, 2.5), r.f(0, 0.4), r.f(0.2, 0.6), 0.6]; g.uni = [1, 0]; g.width = 0.7;
      if (r.p(0.6)) g.chorus = [r.f(0.25, 0.5), r.f(0.4, 0.9), 0.55]; g.reverb = [r.f(0.3, 0.6), r.f(0.1, 0.25)]; break;
    case 'organ': g.amp = [r.f(0.003, 0.02), 0.2, r.f(0.85, 1), r.f(0.05, 0.15), 0.3]; g.uni = [1, 0]; g.width = 0.6;
      g.chorus = [r.f(0.25, 0.5), r.f(0.6, 1.6), 0.6]; g.reverb = [r.f(0.2, 0.45), r.f(0.1, 0.2)]; break;
    case 'pad': g.amp = [r.f(0.5, 1.6), 0.8, r.f(0.7, 1), r.f(1.4, 3), 0.3]; g.uni = [r.pick([2, 3]), r.f(8, 14)]; g.width = r.f(0.8, 1);
      g.chorus = [r.f(0.3, 0.6), r.f(0.35, 0.7), 0.6]; g.reverb = [r.f(0.7, 0.92), r.f(0.3, 0.55)]; break;
    case 'strings': g.amp = [r.f(0.15, 0.6), 0.8, r.f(0.8, 1), r.f(0.5, 1.4), 0.5]; g.uni = [r.pick([2, 3]), r.f(6, 12)]; g.width = 0.9;
      g.chorus = [r.f(0.3, 0.5), 0.6, 0.6]; g.reverb = [r.f(0.5, 0.8), r.f(0.2, 0.4)]; break;
    case 'brass': g.amp = [r.f(0.03, 0.2), r.f(0.3, 0.8), r.f(0.7, 0.95), r.f(0.15, 0.4), 0.6]; g.uni = [r.pick([1, 2]), r.f(5, 10)]; g.width = 0.6;
      g.reverb = [r.f(0.35, 0.6), r.f(0.1, 0.25)]; break;
    case 'pluck': g.amp = [r.f(0.001, 0.004), r.f(0.3, 1.2), 0, r.f(0.15, 0.5), 0.7]; g.uni = [1, 0]; g.width = 0.7;
      if (r.p(0.5)) g.delay = [r.pick([0.25, 0.33, 0.375]), r.f(0.25, 0.4), r.f(0.1, 0.22)]; g.reverb = [r.f(0.35, 0.65), r.f(0.12, 0.28)]; break;
    case 'bell': g.amp = [0.002, r.f(1.5, 4), 0, r.f(0.6, 1.8), 0.5]; g.uni = [1, 0]; g.width = 0.8; g.reverb = [r.f(0.6, 0.85), r.f(0.2, 0.4)];
      if (r.p(0.3)) g.delay = [r.pick([0.33, 0.5]), r.f(0.25, 0.4), r.f(0.1, 0.2)]; break;
    default: g.amp = [r.f(0.005, 1.2), r.f(0.5, 2), r.f(0.3, 1), r.f(0.5, 2.5), 0.4]; g.uni = [r.pick([1, 2, 3]), r.f(6, 16)]; g.width = r.f(0.7, 1);   // fx
      g.delay = [r.pick([0.25, 0.33, 0.5, 0.75]), r.f(0.3, 0.45), r.f(0.15, 0.3)]; g.reverb = [r.f(0.6, 0.9), r.f(0.25, 0.5)]; if (r.p(0.4)) g.chorus = [0.4, 0.5, 0.6];
  }
  g.amp = g.amp.map((x, i) => (i < 4 ? +x.toFixed(3) : x));
  if (g.uni) g.uni = [g.uni[0], +g.uni[1].toFixed(1)];
  if (g.reverb) g.reverb = g.reverb.map(x => +x.toFixed(2));
  if (g.chorus) g.chorus = g.chorus.map(x => +x.toFixed(2));
  if (g.delay) g.delay = g.delay.map(x => +x.toFixed(2));
  if (g.width !== undefined) g.width = +g.width.toFixed(2);
  return g;
}

// ---- beta 0.3.1: LUSH. What the owner rated highest (and the measures that go with the stars: width 0.39, reverb 0.37, chorus 0.36, unison 0.34, release 0.27, a delay 0.27) is a wide,
// roomy, slowly moving sound: unison copies, stereo width, chorus, reverb, a little echo, a release that lets go gently. `lush` gives a sound those in most cases (strength: how much).
function lush(r, g, kind, strength) {
  if (!r.p(kind === 'bass' ? 0.5 : 0.85)) return g;
  const s = strength === undefined ? r.f(0.55, 1) : strength;
  const low = kind === 'bass';
  if (!g.uni || g.uni[0] < 2) g.uni = [low ? 2 : r.wpick([[2, 2], [3, 3]]), +(low ? r.f(3, 8) : r.f(7, 14)).toFixed(1)];
  g.width = +Math.max(g.width === undefined ? 0 : g.width, low ? r.f(0.45, 0.7) : r.f(0.75, 1)).toFixed(2);
  const chm = g.chorus ? g.chorus[0] : 0, want = (low ? 0.2 : 0.3) + 0.25 * s * r.next();
  if (chm < want) g.chorus = [+want.toFixed(2), +r.f(0.4, 0.9).toFixed(2), 0.6];
  const rv = g.reverb || [0, 0];
  g.reverb = [+Math.max(rv[0], low ? 0.4 : 0.55 + 0.3 * s * r.next()).toFixed(2), +Math.max(rv[1], (low ? 0.1 : 0.2) + 0.2 * s * r.next()).toFixed(2)];
  if (!g.delay && !low && kind !== 'pad' && kind !== 'strings' && r.p(0.5)) g.delay = [r.pick([0.25, 0.33, 0.5, 0.75]), +r.f(0.25, 0.4).toFixed(2), +r.f(0.1, 0.22).toFixed(2)];
  if (['pad', 'strings', 'lead', 'keys', 'brass', 'fx', 'organ'].includes(kind) && g.amp && g.amp[3] < 0.5) g.amp[3] = +r.f(0.5, 1.4).toFixed(3);
  return g;
}

// ---- layers of one mode that fit a kind of sound and a role
function candidates(mode, kind, roles) {
  return (mode === 'A' ? LAY.A : LAY.B).filter(l => roles.includes(l.role) && okLayer(l, kind));
}
// beta 0.3: three oscillators. Two subtractive ones (A1 A2) are the most common: the wavelet parameters of the subtractive oscillators are what the LFOs move most.
const CONFIGS = [['A1A2', 40], ['A1B1', 32], ['A1A2B1', 24], ['A2B1', 4]];

// the modulations of a sound (ctx: osc, g, kind, speed, variant): LFO 1 recipes, then LFO 2 and / or LFO 3 on wavelet parameters, the filter, the envelope.
// Returns the recipes used ({ m, res }) or null when the sound does not make a valid SuperModulation / category preset.
function modulate(r, ctx, cat, kind, opts = {}) {
  const super_ = cat === 'SuperModulation';
  const used = [], dests = new Set();
  const apply = (m) => {
    if (dests.has(canon(m.dest)) || !m.fits(ctx)) return false;   // one LFO per control (two would add up)
    const res = m.apply(ctx, r); if (!res) return false;
    used.push({ m, res }); dests.add(canon(m.dest)); return true;
  };
  const wd = MODS.filter(m => m.wd), by = (k) => wd.filter(m => m.kind === k);
  const wt = (m) => (m.w || 1) * (super_ && isInnov(m.id) ? 2.2 : 1);
  const weighted = (list) => { const out = [], left = list.slice(); while (left.length) { const m = r.wpick(left.map(x => [x, wt(x)])); out.push(m); left.splice(left.indexOf(m), 1); } return out; };
  // the filter effect first (an LFO may move it)
  const doFlt0 = r.p((FLT_PROB[kind] === undefined ? 0.6 : FLT_PROB[kind]) * 0.6);   // beta 0.3.1: the sounds with the filter envelope were rated lower: less often
  // (the filter batch, tools/supermod/filter_build.js: opts.flt(ctx, r) sets the filter in every preset, in its own way; opts.fltLfo = how often an LFO moves it; the default is as before)
  const doFlt = opts.flt ? true : doFlt0;
  if (doFlt) { if (opts.flt) ctx.g.flt = opts.flt(ctx, r); else fltSetup(ctx, r); }
  const both = super_ || r.p(0.45);                                    // LFO 2 and LFO 3 both move wavelet parameters
  const first = r.p(0.5) ? 'lfo2' : 'lfo3', second = first === 'lfo2' ? 'lfo3' : 'lfo2';
  const nL1 = super_ ? r.wpick([[1, 3], [2, 2]]) : both ? r.wpick([[0, 3], [1, 2]]) : r.wpick([[0, 1.2], [1, 3], [2, 1]]);
  const doEnv = r.p(super_ ? 0.3 : 0.2);
  let nDone = 0;
  for (const m of weighted(by('lfo1'))) { if (nDone >= nL1) break; if (apply(m)) nDone++; }
  const lfoWavelet = (slot) => { for (const m of weighted(by(slot))) if (apply(m)) return true; return false; };
  if (!lfoWavelet(first)) return null;
  if (both) { if (!lfoWavelet(second)) return null; }
  else if (ctx.g.flt && r.p(opts.fltLfo === undefined ? 0.5 : opts.fltLfo)) {   // the other LFO moves the filter instead
    for (const m of r.shuffle(MODS.filter(x => x.kind === second && !x.wd))) if (apply(m)) break;
  }
  if (doEnv) { for (const m of by('env')) if (apply(m)) break; }
  const wdCount = new Set(used.filter(u => u.m.wd).map(u => canon(u.m.dest))).size;
  if (super_ && (wdCount < 3 || !ctx.g.lfo2 || !ctx.g.lfo3 || used.filter(u => isInnov(u.m.id)).length < 2)) return null;
  if (!super_ && (wdCount < 1 || wdCount > 3)) return null;
  if (r.p(0.3) && ctx.g.lfo && ctx.g.lfo.pitch === undefined && kind !== 'bell' && kind !== 'pluck' && kind !== 'perc' && r.p(0.4)) { const m = MODS.find(x => x.id === 'pitchVib'); if (m.fits(ctx)) apply(m); }   // (vibrato rated low: 0.3 x 0.4 of the sounds)
  return used;
}

function compose(r, cat, opts = {}) {
  const spec = CATS[cat];
  const kind = opts.kind || spec.kind || r.wpick(SUPER_KINDS);
  const slotsInfo = kind === 'perc' ? composeDrum(r) : composeLayers(r, kind, opts.configs);
  if (!slotsInfo) return null;
  const { slots, ctx, layerWords, form: form0, baseDesc } = slotsInfo;
  const used = modulate(r, ctx, cat, kind, opts);
  if (!used) return null;
  if (opts.tune) opts.tune(ctx, r, kind);   // (the filter batch: the voice and the effects are touched up before the preset is written)
  // an additive-only or attack-only kind keeps a safe resonance
  for (const sl of Object.keys(ctx.osc)) { const o = ctx.osc[sl]; if (o.fres !== undefined) o.fres = Math.min(o.fres, 12); }
  if (ctx.g.lfo && ctx.g.lfo.res) for (const sl of Object.keys(ctx.osc)) { const o = ctx.osc[sl]; if (o.fres !== undefined) o.fres = Math.min(o.fres, 6); }
  // the name and the description
  const modWords = used.filter(u => u.m.wd).map(u => r.pick(u.m.words));
  const form = form0 || r.pick(FORM[kind] || FORM.fx);
  const patterns = [() => `${r.pick(modWords)} ${form}`, () => `${r.pick(layerWords)} ${r.pick(modWords)}`, () => `${r.pick(layerWords)} ${form}`,
    () => `${r.pick(layerWords)} & ${r.pick(layerWords)}`, () => `${r.pick(modWords)} of ${r.pick(layerWords)}`, () => `${r.pick(layerWords)} ${r.pick(modWords)} ${form}`];
  let title = null;
  for (let t = 0; t < 40 && !title; t++) { const c = r.pick(patterns)(); if (!/^(\w+) & \1$/.test(c) && !opts.taken.has(c.toLowerCase())) title = c; }
  if (!title) return null;
  const specObj = { g: ctx.g };
  for (const s of slots) specObj[s] = ctx.osc[s];
  const v0 = P(cat, title, '', specObj).v;
  const desc = describeWith(baseDesc(v0), used.map(u => u.m.id), v0);
  const pr = P(cat, title, desc, specObj);
  pr.desc = desc;
  const order = slotsInfo.order || slots;
  pr.meta = { base: baseDesc(v0), cfg: slots.join(''), bodySlot: order[0], order, kind, layers: slotsInfo.layers, roles: slotsInfo.roles, mods: used.map(u => u.m.id), dests: [...new Set(used.map(u => u.m.dest))],
    flt: ctx.g.flt ? ctx.g.flt.type : null };
  return pr;
}

// ---- a drum or a hit (Drums & Perc): tools/supermod/perc.js
function composeDrum(r) {
  const d = drum(r), slots = Object.keys(d.osc);
  const ctx = { osc: d.osc, g: d.g, kind: 'perc', speed: SPEED.perc, variant: null, cur: null };
  return { slots, ctx, layerWords: d.words, form: r.pick(d.form), baseDesc: () => cap(d.desc), layers: [d.id], roles: slots.map(() => 'hit'), order: slots };
}

// ---- the oscillators from the layers: one body and the others chosen against it
function composeLayers(r, kind, configs) {
  const cfg = r.wpick(configs || CONFIGS), slots = cfg.match(/[AB]\d/g);
  const picked = {};   // slot -> { l: layer, o: osc values, role }
  const usedFam = new Set();
  const take = (slot, l, role, isBody) => {
    const o = l.make(r);
    placeLayer(r, kind, role, o, isBody);
    o.lvl = levelFor(r, role);
    picked[slot] = { l, o, role };
    usedFam.add(l.fam);
  };
  // the body: the first slot gets a sustained layer fitting the kind; the others are chosen against it
  const order = r.shuffle(slots);
  let bodySlot = null;
  for (const s of order) {
    const mode = s[0];
    const pool = candidates(mode, kind, ['body', 'color']).filter(l => bodyOk(l, kind));
    if (!pool.length) continue;
    bodySlot = s; take(s, pickLayer(r, pool), 'body', true); break;
  }
  if (!bodySlot) return null;
  for (const s of slots) {
    if (picked[s]) continue;
    const mode = s[0], same = slots.filter(x => x[0] === mode && picked[x]).map(x => picked[x]);
    // roles for this oscillator: a second sustained sound, an attack, the sub, or air; the percussive roles when the kind decays
    const rolePool = kind === 'bell' || kind === 'pluck' ? [['attack', 3], ['color', 3], ['air', 1]] : kind === 'bass' ? [['sub', 3], ['color', 3], ['attack', 2]]
      : kind === 'pad' || kind === 'strings' ? [['color', 4], ['air', 2], ['sub', 1], ['attack', 1.2]] : [['color', 4], ['attack', 2.5], ['air', 1.4], ['sub', kind === 'lead' ? 0.6 : 0.9]];
    let best = null;
    for (let tries = 0; tries < 14; tries++) {
      const role = r.wpick(rolePool), pool = candidates(mode, kind, [role]).filter(l => !usedFam.has(l.fam));
      if (!pool.length) continue;
      const l = pickLayer(r, pool), o = l.make(r); placeLayer(r, kind, role, o, false); o.lvl = levelFor(r, role);
      const cand = { l, o, role };
      const worst = same.length ? Math.min(...same.map(x => contrast(x, cand))) : 9;
      const need = same.length ? 4 : 0;   // two oscillators of the same kind must be very different
      if (worst >= need) { best = cand; break; }
      if (!best || worst > best.score) { best = Object.assign(cand, { score: worst }); }
    }
    if (!best) return null;
    if (same.length && Math.min(...same.map(x => contrast(x, best))) < 3) return null;
    picked[s] = best; usedFam.add(best.l.fam);
  }
  const ctx = { osc: {}, g: lush(r, globals(r, kind), kind), kind, speed: SPEED[kind], variant: null, cur: null };
  for (const s of slots) ctx.osc[s] = picked[s].o;
  const order2 = [bodySlot, ...slots.filter(s => s !== bodySlot)];
  return { slots, ctx, layerWords: slots.map(s => r.pick(picked[s].l.words)), form: null, order: order2, layers: slots.map(s => picked[s].l.id), roles: slots.map(s => picked[s].role),
    baseDesc: () => layersText(order2.map(s => picked[s].l), order2.map(s => picked[s].o)) };
}

// the description of a preset: its layers (the body first, then the others with their relation to the body) and what the LFOs and the filter do
const rel = (o) => {
  const st = (o.oct || 0) * 12 + (o.semi || 0);
  const t = st === 12 ? 'an octave above' : st === 24 ? 'two octaves above' : st === -12 ? 'an octave below' : st === -24 ? 'two octaves below' : st === 7 ? 'a fifth above' : '';
  return t ? ' ' + t : o.fine ? ', slightly detuned' : '';
};
function layersText(layers, oscs) {
  const parts = layers.map((l, i) => l.desc + (i === 0 ? '' : rel(oscs[i])));
  return cap(parts[0]) + (parts.length > 1 ? ' against ' + parts.slice(1).join(', and ') : '');
}
function describeWith(base, modIds, v) {
  const cl = modIds.map(id => CLAUSE[id](v));
  if (v.vf_cut !== undefined && v.vf_cut < 20000) cl.push(fltClause(v));
  return base + '; ' + (cl.length > 1 ? cl.slice(0, -1).join(', ') + ', and ' + cl[cl.length - 1] : cl[0]) + '.';
}
function describe(layers, oscs, modIds, v) { return describeWith(layersText(layers, oscs), modIds, v); }
module.exports = { compose, describe, describeWith, CATS, contrast, INNOV, isInnov };
