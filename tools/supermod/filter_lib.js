// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// What the two filter batches share (tools/supermod/filter_build.js: 1401-1550, "the filter used a little more, with a little resonance"; tools/supermod/fav_build.js: 1551-1650,
// "inspired by my favourites"): the settings of the voice FILTER by kind of sound, the description of what it does, the CPU budget of a voice, the measure of how much the filter changes a
// sound, the loudness match, the writer of the data files, and the selection (the owner's taste model of tools/supermod/filter_taste.js, then the farthest point against the presets he
// kept and against the ones already chosen).
// The FILTER (beta 0.3, CLAUDE.md 3.3i): per voice, after the oscillators are mixed, a four-pole low-pass: vf_type LADDER / OTA, vf_cut (Hz, 20000 = open = bypassed), vf_res (0..1: 0.3-0.5 is a peak
// of 3-8 dB above the passband, 1 sings), vf_drive, vf_key (cutoff follows the note: 1 = one octave per octave), vf_env (+-8 octaves x the filter envelope), vf_a/d/s/r (that envelope).
//   const L = require('./filter_lib.js');
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out');
const rd = (x, n = 2) => +x.toFixed(n);

// ---- the filter of a kind of sound, for the "filter used a little more" batch: the cutoff clearly under the open position, a little resonance (0.28-0.5: a peak, not singing), a gentle envelope
// (the owner rated filter-envelope-heavy sounds low), key tracking where the pitch range is wide. Returns the g.flt of tools/preset_dsl.js.
const ladderRes = (r, lo = 0.3, hi = 0.48) => rd(r.f(lo, hi)), otaRes = (r, lo = 0.28, hi = 0.44) => rd(r.f(lo, hi));
const typeRes = (r, pOta, lo, hi) => (r.p(pOta) ? { type: 'ota', res: otaRes(r, lo, hi) } : { type: 'ladder', res: ladderRes(r, lo, hi) });
const FLT2 = {
  bass: (r) => Object.assign(typeRes(r, 0.6, 0.26, 0.42), { cut: rd(r.f(220, 620), 0), drive: rd(r.f(0.05, 0.2)), key: rd(r.f(0.4, 0.75)), env: rd(r.f(0.1, 0.28)), adsr: [0.002, rd(r.f(0.12, 0.45), 3), rd(r.f(0.1, 0.45)), rd(r.f(0.1, 0.3), 3)] }),
  lead: (r) => Object.assign(typeRes(r, 0.5, 0.28, 0.46), { cut: rd(r.f(1100, 3200), 0), drive: rd(r.f(0.04, 0.2)), key: rd(r.f(0.45, 0.85)), env: rd(r.f(0.08, 0.24)), adsr: [rd(r.f(0.003, 0.03), 3), rd(r.f(0.25, 0.8), 3), rd(r.f(0.35, 0.8)), rd(r.f(0.15, 0.5), 3)] }),
  keys: (r) => Object.assign(typeRes(r, 0.5, 0.28, 0.44), { cut: rd(r.f(900, 2600), 0), drive: rd(r.f(0, 0.15)), key: rd(r.f(0.5, 0.85)), env: rd(r.f(0.1, 0.26)), adsr: [0.002, rd(r.f(0.25, 0.9), 3), rd(r.f(0.1, 0.45)), rd(r.f(0.2, 0.5), 3)] }),
  organ: (r) => Object.assign(typeRes(r, 0.65, 0.24, 0.38), { cut: rd(r.f(1800, 4200), 0), drive: rd(r.f(0, 0.12)), key: rd(r.f(0.6, 0.95)), env: rd(r.f(0.05, 0.14)), adsr: [0.005, 0.3, rd(r.f(0.7, 1)), 0.1] }),
  pad: (r) => Object.assign(typeRes(r, 0.4, 0.28, 0.44), { cut: rd(r.f(380, 1400), 0), drive: rd(r.f(0, 0.1)), key: rd(r.f(0.35, 0.7)), env: rd(r.f(0.1, 0.24)), adsr: [rd(r.f(0.5, 1.8), 3), rd(r.f(1, 3), 3), rd(r.f(0.5, 0.9)), rd(r.f(1.2, 3), 3)] }),
  strings: (r) => Object.assign(typeRes(r, 0.5, 0.26, 0.4), { cut: rd(r.f(900, 2800), 0), drive: 0, key: rd(r.f(0.45, 0.8)), env: rd(r.f(0.08, 0.2)), adsr: [rd(r.f(0.15, 0.8), 3), rd(r.f(0.8, 2), 3), rd(r.f(0.6, 0.95)), rd(r.f(0.5, 1.5), 3)] }),
  brass: (r) => Object.assign(typeRes(r, 0.4, 0.28, 0.44), { cut: rd(r.f(450, 1500), 0), drive: rd(r.f(0, 0.15)), key: rd(r.f(0.4, 0.75)), env: rd(r.f(0.15, 0.3)), adsr: [rd(r.f(0.04, 0.16), 3), rd(r.f(0.25, 0.8), 3), rd(r.f(0.5, 0.9)), rd(r.f(0.15, 0.4), 3)] }),
  pluck: (r) => Object.assign(typeRes(r, 0.5, 0.28, 0.44), { cut: rd(r.f(700, 2200), 0), drive: rd(r.f(0, 0.15)), key: rd(r.f(0.5, 0.85)), env: rd(r.f(0.15, 0.32)), adsr: [0.001, rd(r.f(0.15, 0.7), 3), rd(r.f(0, 0.05)), rd(r.f(0.1, 0.4), 3)] }),
  bell: (r) => Object.assign(typeRes(r, 0.5, 0.24, 0.38), { cut: rd(r.f(2000, 6000), 0), drive: 0, key: rd(r.f(0.7, 1)), env: rd(r.f(0.06, 0.18)), adsr: [0.002, rd(r.f(0.8, 3), 3), rd(r.f(0, 0.1)), rd(r.f(0.5, 1.5), 3)] }),
  fx: (r) => Object.assign(typeRes(r, 0.5, 0.28, 0.5), { cut: rd(r.f(300, 3800), 0), drive: rd(r.f(0, 0.3)), key: rd(r.f(0.1, 0.6)), env: rd(r.f(-0.2, 0.28)), adsr: [rd(r.f(0.005, 1.2), 3), rd(r.f(0.3, 2.5), 3), rd(r.f(0.2, 0.8)), rd(r.f(0.4, 2.5), 3)] }),
  perc: (r) => Object.assign(typeRes(r, 0.5, 0.26, 0.42), { cut: rd(r.f(1800, 6500), 0), drive: rd(r.f(0, 0.2)), key: rd(r.f(0.3, 0.7)), env: rd(r.f(0.1, 0.3)), adsr: [0.001, rd(r.f(0.04, 0.25), 3), 0, rd(r.f(0.04, 0.15), 3)] }),
};
const flt2 = (ctx, r) => FLT2[ctx.kind](r);

// ---- the description of the filter: what it does, in a clause of the preset's one-line description (v: the sparse values of the preset)
const hz = (f) => (f >= 1000 ? (Math.round(f / 100) / 10) + ' kHz' : Math.round(f / 10) * 10 + ' Hz');
function fltClause2(v) {
  const ty = v.vf_type === 1 ? 'OTA' : 'ladder', res = v.vf_res || 0, env = v.vf_env || 0, key = v.vf_key || 0, drv = v.vf_drive || 0, slow = (v.vf_a || 0) > 0.3;
  const s = `a 24 dB ${ty} low-pass at ${hz(v.vf_cut)} with ${res > 0.4 ? 'a clear resonance peak' : res > 0.3 ? 'a gentle resonance peak' : 'a touch of resonance'}`, ex = [];
  if (env > 0.04) ex.push(slow ? 'opened slowly by each note' : 'opened a little by each note'); else if (env < -0.04) ex.push('closed a little by each note');
  if (key > 0.3) ex.push('following the keyboard');
  if (drv > 0.12) ex.push('lightly driven');
  return ex.length ? s + ', ' + (ex.length > 1 ? ex.slice(0, -1).join(', ') + ' and ' + ex[ex.length - 1] : ex[0]) : s;
}
// the description of a composer candidate: the layers, what each LFO does, the filter. mods: the recipe ids (compose.js meta.mods)
function describeFlt(base, modIds, v, CLAUSE) {
  const cl = modIds.map(id => CLAUSE[id](v));
  cl.push(fltClause2(v));
  return base + '; ' + (cl.length > 1 ? cl.slice(0, -1).join(', ') + ', and ' + cl[cl.length - 1] : cl[0]) + '.';
}

// ---- the CPU of a preset: a voice costs its unison copies, the oscillators and the filter; the effects add to it (the owner measured up to 7 % on a chord with the filter). A rough budget:
// unison <= 3, and not everything at once (unison + chorus + delay + a long reverb). Returns the number of expensive things a preset stacks.
function cpuStack(v, defs) {
  const g = (k) => (v[k] !== undefined ? v[k] : defs[k]);
  return (g('v_unison') > 1 ? g('v_unison') - 1 : 0) + (g('ch_mix') > 0.01 ? 1 : 0) + (g('fx_dmix') > 0.01 ? 1 : 0) + (g('fx_rmix') > 0.3 && g('fx_rsize') > 0.75 ? 1 : 0);
}
// the voice of a candidate touched up for the owner's taste and the CPU (ctx.g of compose.js): the unison <= 3 (<= 2 when the voices are many), a small detune, the effects not all at once,
// a sustain for the kinds that hold. o.sus: the floor of the sustain level by kind
const SUS_FLOOR = { bass: 0.5, lead: 0.55, keys: 0.3, pad: 0.65, strings: 0.65, brass: 0.55, fx: 0.35, organ: 0.8 };
function tuneVoice(g, r, kind, o = {}) {
  if (g.uni) {
    let u = Math.min(3, g.uni[0]); if (kind === 'bass') u = Math.min(2, u); if ((g.voices || 8) > 10 && u > 2) u = 2;
    g.uni = [u, u > 1 ? rd(Math.min(g.uni[1], kind === 'bass' ? r.f(3, 6) : r.f(5, 10)), 1) : 0];
  }
  if (g.width !== undefined) g.width = rd(Math.min(g.width, 0.92));
  const stack = () => (g.uni && g.uni[0] > 1 ? g.uni[0] - 1 : 0) + (g.chorus && g.chorus[0] > 0.01 ? 1 : 0) + (g.delay && g.delay[2] > 0.01 ? 1 : 0) + (g.reverb && g.reverb[1] > 0.3 && g.reverb[0] > 0.75 ? 1 : 0);
  let guard = 0;
  while (stack() > 3 && guard++ < 4) {   // not all at once: the echo goes first, then the chorus, then the room is made smaller
    if (g.delay && g.delay[2] > 0.01) g.delay = null; else if (g.chorus && g.chorus[0] > 0.01) g.chorus = null; else if (g.reverb) g.reverb = [0.7, g.reverb[1]];
  }
  if (g.delay === null) delete g.delay;
  if (g.chorus === null) delete g.chorus;
  const fl = (o.sus || SUS_FLOOR)[kind];
  if (fl !== undefined && g.amp && g.amp[2] < fl) g.amp[2] = rd(Math.min(0.95, fl + r.f(0, 0.2)), 3);
  if (g.amp && ['pad', 'strings', 'lead', 'brass', 'bass', 'keys', 'organ'].includes(kind) && g.amp[3] < 0.2) g.amp[3] = rd(r.f(0.2, 0.5), 3);
  return g;
}
// an LFO on the filter's cutoff or resonance is never fast (the owner rated the LFO-on-cutoff presets low): at most 0.2 Hz and a smaller sweep. The other LFOs are the composer's.
function softenLfos(g, r) {
  for (const n of ['lfo2', 'lfo3']) if (g[n]) {
    const l = g[n];
    if (l.target === 'fltcut' || l.target === 'fltres') { l.rate = rd(Math.min(l.rate, r.f(0.07, 0.2)), 3); l.amt = rd(l.amt * 0.7); }
  }
}

// ---- how much the filter changes a sound: the mean spectrum of the held chord with the filter, against the same with the filter bypassed (cutoff open, no resonance / drive / envelope, no LFO on it):
// the mean absolute difference (dB) of the third-octave bands within 40 dB of the loudest, the spectrum shapes re the total power (a level change alone is not "using" the filter)
function fltEffect(A, values, rWith, o) {
  const SPEC = require('../preset_lab.js').SPEC, K = Object.fromEntries(SPEC.PARAMS.map((p, i) => [p.key, i]));
  const v = Array.from(values);
  v[K.vf_cut] = 20000; v[K.vf_res] = 0; v[K.vf_drive] = 0; v[K.vf_env] = 0;
  for (const n of ['lfo2', 'lfo3']) if (v[K[n + '_target']] >= 17) v[K[n + '_amt']] = 0;
  const rWithout = A.chord(v, o);
  const shape = (r) => { const m = A.meanSpectrum(r, 0.45, Math.min(o.hold, o.seconds - 0.2)); let t = 0; for (const x of m) t += Math.pow(10, x / 10); const db = 10 * Math.log10(t + 1e-20); return m.map(x => x - db); };
  const a = shape(rWith), b = shape(rWithout), top = Math.max(...a, ...b);
  let d = 0, c = 0; for (let k = 0; k < a.length; k++) { if (Math.max(a[k], b[k]) < top - 40) continue; d += Math.abs(a[k] - b[k]); c++; }
  return c ? d / c : 0;
}

// ---- the loudness match of a candidate (as tools/supermod/build.js): the master from the TOP Sounds' median loudness, the levels raised when the sound is too quiet, then the headroom of the held chord
function loudnessMatch(pr, lab, A, target, mp, P) {
  let values = A.fullValues(pr.v);
  const cur = pr.v.master !== undefined ? pr.v.master : mp.def;
  const m0 = lab.chordLoudness(values);
  let master = Math.round((cur + target - m0.db) * 2) / 2;
  if (master > 3) {
    const f = Math.pow(10, (master - 3) / 20), lv = ['a1_lvl', 'a2_lvl', 'b1_lvl'];
    const mx = Math.max(...lv.map(key => (pr.v[key] !== undefined ? pr.v[key] : lab.SPEC.PARAMS[P[key]].def)));
    const f2 = Math.min(f, 1 / mx);
    if (f2 > 1.01) for (const key of lv) if (pr.v[key] > 0) pr.v[key] = Math.round(pr.v[key] * f2 * 1000) / 1000;
    values = A.fullValues(pr.v);
    const m1 = lab.chordLoudness(values);
    master = Math.round((cur + target - m1.db) * 2) / 2;
  }
  master = Math.max(mp.min, Math.min(mp.max, master));
  pr.v.master = master; values[P.master] = master;
  for (let it = 0; it < 6; it++) {
    const r60 = A.chord(values, { root: 60, seconds: 3.2, hold: 2.4 });
    if (A.peakOf(r60) <= 0.9 && A.limiterShare(values, r60, { root: 60, seconds: 3.2, hold: 2.4 }) <= 0.003) break;
    master = Math.max(mp.min, master - 1); pr.v.master = master; values[P.master] = master;
  }
  return values;
}
const topTarget = (lab) => { const top = lab.SPEC.PRESETS.slice(0, lab.SPEC.TOP).map(p => lab.chordLoudness(p.values, 0.2).db).sort((a, b) => a - b); return top[Math.floor(top.length / 2)]; };

// ---- the titles taken (every title of every data file, the rejected ones included: their numbers are not reused, their names should not be either)
function takenTitles(extraFiles = []) {
  const t = new Set(), SPEC = require('../../web/js/spec.js');
  for (const p of SPEC.PRESETS) t.add((p.name.split(' · ')[1] || p.name).toLowerCase());
  for (const f of ['../presets_new.js', '../presets_super.js', '../presets_lfo3.js', ...extraFiles]) {
    try { for (const r of require(f)) t.add((r.name.split(' · ')[1] || r.name).toLowerCase()); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  return t;
}

// ---- the owner's taste and the distinctness
function tasteModel(lambda = 30) {
  const T = require('./filter_taste.js'), rows = T.load();
  const model = T.fit(rows, lambda), loo = T.loo(rows, lambda);
  const keepers = rows.filter(r => r.stars >= 3 && r.c.audit.features && r.c.audit.features.length >= 60).map(r => r.c.audit.features);
  return { T, model, loo, keepers, rows };
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(s / a.length); };
// farthest point first among the shortlist (index list), against the fixed vectors and the ones already chosen: returns the chosen indices in order
function farthest(items, n, fixed, minDist = 0) {
  const minD = items.map(c => (fixed.length ? Math.min(...fixed.map(f => dist(c.features, f))) : 99)), out = [], alive = items.map(() => true);
  for (let k = 0; k < n; k++) {
    let best = -1, bd = -1;
    for (let i = 0; i < items.length; i++) if (alive[i] && minD[i] > bd && minD[i] >= minDist) { bd = minD[i]; best = i; }
    if (best < 0) break;
    alive[best] = false; out.push(best);
    for (let i = 0; i < items.length; i++) if (alive[i]) minD[i] = Math.min(minD[i], dist(items[i].features, items[best].features));
  }
  return out;
}

// ---- the data file: { name: "NNNN CFG · Title", cat, desc, v: { only the values that differ from the defaults } }, in the format of tools/presets_lfo3.js (the numbers in the order given)
function sparse(v, SPEC) {
  const def = Object.fromEntries(SPEC.PARAMS.map(p => [p.key, p.def])), o = {};
  for (const [k, x] of Object.entries(v)) { const y = Number.isInteger(x) ? x : Math.round(x * 1e4) / 1e4; if (!(k in def)) throw new Error('unknown parameter ' + k); if (Math.abs(y - def[k]) > 1e-9) o[k] = y; }
  return o;
}
function writeData(file, header, entries) {
  let js = '// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)\n// SPDX-License-Identifier: GPL-3.0-or-later\n' + header.replace(/^/gm, '// ').replace(/\n\/\/ $/, '') + '\n\'use strict\';\nmodule.exports = [\n';
  for (const e of entries) js += `  { name: ${JSON.stringify(e.name)}, cat: ${JSON.stringify(e.cat)}, desc: ${JSON.stringify(e.desc)},\n    v: ${JSON.stringify(e.v)} },\n`;
  js += '];\n';
  fs.writeFileSync(file, js.replace(/\n/g, '\r\n'));
}
module.exports = { FLT2, flt2, fltClause2, describeFlt, cpuStack, tuneVoice, softenLfos, fltEffect, loudnessMatch, topTarget, takenTitles, tasteModel, dist, farthest, sparse, writeData, OUT, rd, hz };
