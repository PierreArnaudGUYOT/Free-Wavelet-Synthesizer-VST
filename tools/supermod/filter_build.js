// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds tools/presets_filter.js: 150 new presets, numbers 1401-1550, for the owner's request "make new presets that use the filter a little more, with a little resonance". The composer
// (tools/supermod/compose.js, the same layers and recipes as the other batches: A1 / A2 subtractive and B1 additive wavelet oscillators) is told to give EVERY preset the voice filter
// (tools/supermod/filter_lib.js FLT2: a cutoff clearly under the open position, a little resonance, a gentle envelope, key tracking where it suits, no LFO on the cutoff or a very slow one;
// LADDER and OTA both), the voice is touched up for the owner's taste (unison <= 3, a small detune, the effects not all at once, a sustain for the kinds that hold, softer LFOs: the
// owner's second listening, tools/supermod/filter_taste.js) and several candidates are made for every slot (--per 7): they are measured (tools/supermod/audit.js: it plays, it does not
// clip or crackle, the oscillators of a kind differ, the LFOs are alive, and the filter changes the sound by at least FLT_MIN dB), their loudness is matched to the TOP Sounds, and
// the ones kept are the best predicted by the taste model that are, among themselves and against the presets he kept (3 stars or more), the farthest apart.
//   node tools/supermod/filter_build.js [--per 7] [--seed 1] [--procs 8]    candidates -> tools/out/filter_cand_<k>.json, then the selection -> tools/presets_filter.js
//   node tools/supermod/filter_build.js --tag test --out tools/out/filter_test.js   a trial run (its own candidate and pool files; the real file is not touched)
//   node tools/supermod/filter_build.js --select-only                         only the selection, from the pool (tools/out/filter_pool.json: several runs add up, one seed each)
//   node tools/supermod/filter_build.js --report                              the statistics of the written file
// The file written is the one of 2026-10-20: node tools/supermod/filter_build.js --per 7 --seed 1 --procs 8 (the order of the candidates depends on --procs), then --select-only (the selection is deterministic),
// then node tools/supermod/loud_filter.js --file tools/presets_filter.js --apply (the loud-chord gate), and node tools/supermod/fav_build.js for the other batch (1551-1650).
// Needs tools/out/filter_rated.json (node tools/supermod/filter_data.js: the owner's exported ratings, measured) for the taste model and the distinctness.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const L = require('./filter_lib.js');
const OUT = L.OUT;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const TAG = arg('tag', ''), FILE = path.resolve(arg('out', path.join(__dirname, '..', 'presets_filter.js')));   // --tag test --out tools/out/x.js: a trial run that leaves the real file and pool alone
const FIRST = 1401;
const FLT_MIN = 1.5;    // how much (dB) the filter has to change the spectrum of the held chord to count as used
const MOVE_MIN = 0.2;   // how much (dB) the LFOs have to move the spectrum (audit.js moveDelta, or onsetDiff for a decaying sound): alive but gentle, the owner rates the timbres that move a lot lower
// how many presets of each category (150 in all): fewer SuperModulation and Drums & Perc (the owner rejected most of them), more of the sounds he plays: Bass Lead Keys Pad Strings
const QUOTA = [['SuperModulation', 8], ['Bass', 15], ['Lead', 15], ['Keys', 15], ['Organ', 12], ['Pad', 15], ['Strings', 15], ['Brass & Wind', 12], ['Pluck', 12], ['Bells & Mallets', 11], ['FX', 12], ['Drums & Perc', 8]];

// ----------------------------------------------------------------------------- worker: composes and measures candidates
if (process.argv.includes('--worker')) {
  const k = +arg('worker', 0), per = +arg('per', 7), seed = +arg('seed', 1), procs = +arg('procs', 1);
  const { Rng } = require('./rng.js');
  const { compose } = require('./compose.js');
  const A = require('./audit.js');
  const lab = require('../preset_lab.js');
  const SPEC = lab.SPEC, P = lab.P, mp = SPEC.PARAMS[P.master];
  const target = L.topTarget(lab), taken = L.takenTitles();
  const r = Rng(seed * 7919 + k * 104729 + 31);
  const rows = [], stats = { composed: 0, nulls: 0, errors: 0 };
  const opts = { taken, flt: L.flt2, fltLfo: 0.1, tune: null };
    opts.tune = (ctx, rr, kind) => { L.tuneVoice(ctx.g, rr, kind); L.softenLfos(ctx.g, rr); };
  for (const [cat, quota] of QUOTA) {
    const want = Math.ceil(quota * per / procs);
    for (let n = 0, tries = 0; n < want && tries < want * 14; tries++) {
      let pr = null;
      try { pr = compose(r, cat, opts); } catch (e) { stats.errors++; if (stats.errors < 4) console.error('compose error:', e.stack); continue; }
      if (!pr) { stats.nulls++; continue; }
      stats.composed++;
      const values = L.loudnessMatch(pr, lab, A, target, mp, P);
      const used = pr.used.match(/[AB]\d/g), ids = A.SLOT_IDS, pairs = [];
      for (let a = 0; a < used.length; a++) for (let b = a + 1; b < used.length; b++) if (used[a][0] === used[b][0]) pairs.push([ids.indexOf(used[a]), ids.indexOf(used[b])]);
      const kindOf = pr.meta.kind;
      const au = A.audit(values, { pairs, stage1: (a) => A.judgeSound(a, kindOf) });
      const row = { cat, title: pr.title, desc: pr.desc, used: pr.used, v: pr.v, meta: pr.meta, audit: au };
      if (au.stopped) { row.refused = A.judgeSound(au, kindOf); au.features = [0]; }
      else row.fltEffect = L.fltEffect(A, values, au.r60, { root: 60, seconds: 4.2, hold: 3.2 });
      delete au.r60; delete au.frames;
      rows.push(row); taken.add(pr.title.toLowerCase()); n++;
    }
  }
  fs.writeFileSync(path.join(OUT, `filter${TAG}_cand_${k}.json`), JSON.stringify({ rows, stats }));
  process.exit(0);
}

// ----------------------------------------------------------------------------- the report of the written file
if (process.argv.includes('--report')) {
  const SPEC = require('../../web/js/spec.js'), rows = require('../presets_filter.js');
  const K = Object.fromEntries(SPEC.PARAMS.map((p, i) => [p.key, p])), val = (x, key) => (x.v[key] !== undefined ? x.v[key] : K[key].def);
  const cnt = (f) => { const c = {}; for (const x of rows) { const q = f(x); c[q] = (c[q] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([q, v]) => `${q} ${v}`).join(', '); };
  const q = (key, p) => { const a = rows.map(x => val(x, key)).sort((m, n) => m - n); return a[Math.floor(p * (a.length - 1))]; };
  console.log(rows.length + ' presets');
  console.log('categories: ' + cnt(x => x.cat));
  console.log('oscillators: ' + cnt(x => x.name.split(' ')[1]));
  console.log('filter type: ' + cnt(x => (val(x, 'vf_type') === 1 ? 'OTA' : 'LADDER')));
  for (const [key, label] of [['vf_cut', 'cutoff Hz'], ['vf_res', 'resonance'], ['vf_env', 'envelope'], ['vf_key', 'key tracking'], ['vf_drive', 'drive'], ['v_unison', 'unison'], ['amp_s', 'sustain']]) console.log(`${label.padEnd(13)} min ${q(key, 0)}  10% ${q(key, 0.1)}  median ${q(key, 0.5)}  90% ${q(key, 0.9)}  max ${q(key, 1)}`);
  const lfoF = rows.filter(x => [val(x, 'lfo2_target'), val(x, 'lfo3_target')].some((t, i) => t >= 17 && val(x, i ? 'lfo3_amt' : 'lfo2_amt') !== 0)).length;
  console.log(`LFO on the filter: ${lfoF}; masters: ${cnt(x => val(x, 'master'))}`);
  process.exit(0);
}

// ----------------------------------------------------------------------------- main: workers, then the selection
const per = +arg('per', 7), seed = +arg('seed', 1), procs = +arg('procs', 8);
fs.mkdirSync(OUT, { recursive: true });
let done = 0;
const t0 = Date.now();
if (process.argv.includes('--select-only')) select(true);
else for (let k = 0; k < procs; k++) fork(__filename, ['--worker', String(k), '--per', String(per), '--seed', String(seed), '--procs', String(procs), '--tag', TAG]).on('exit', () => { if (++done === procs) select(false); });

function select(selectOnly) {
  const lab = require('../preset_lab.js'), SPEC = lab.SPEC, A = require('./audit.js');
  const poolFile = path.join(OUT, `filter${TAG}_pool.json`);
  let cands = [], stats = { composed: 0, nulls: 0, errors: 0 };
  if (!selectOnly) for (let k = 0; k < procs; k++) {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, `filter${TAG}_cand_${k}.json`), 'utf8'));
    cands = cands.concat(j.rows); for (const s of Object.keys(stats)) stats[s] += j.stats[s];
  }
  if (fs.existsSync(poolFile) && (selectOnly || process.argv.includes('--pool'))) {
    const have = new Set(cands.map(c => c.title.toLowerCase()));
    for (const c of JSON.parse(fs.readFileSync(poolFile, 'utf8'))) if (!have.has(c.title.toLowerCase())) { cands.push(c); have.add(c.title.toLowerCase()); }
  }
  fs.writeFileSync(poolFile, JSON.stringify(cands));
  console.log(`${cands.length} candidates measured (${stats.composed} composed, ${stats.nulls} refused by the composer, ${stats.errors} errors) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // ---- the gates
  const reasons = {}, bad = (why) => { reasons[why] = (reasons[why] || 0) + 1; return false; };
  const defs = Object.fromEntries(SPEC.PARAMS.map(p => [p.key, p.def]));
  const seen = new Set();
  const ok = cands.filter((c) => {
    const t = c.title.toLowerCase(); if (seen.has(t)) return false; seen.add(t);
    const a = c.audit;
    if (c.refused) return bad(c.refused);
    if (!(c.v.vf_cut < 20000) || !(c.v.vf_res >= 0.2)) return bad('no filter / no resonance');
    const resTop = c.v.vf_res + ['lfo2', 'lfo3'].reduce((t, n) => t + (c.v[n + '_target'] === 18 && c.v[n + '_amt'] ? 0.5 * Math.abs(c.v[n + '_amt']) : 0), 0);   // an LFO on the resonance adds to it
    if (resTop > 0.62) return bad('resonance too high (a peak, not singing)');
    for (const key of ['lfo_shape', 'lfo2_shape', 'lfo3_shape']) { const amtKey = key === 'lfo_shape' ? null : key.replace('shape', 'amt'); const act = amtKey ? c.v[amtKey] : ['lfo_cut', 'lfo_pos', 'lfo_wav', 'lfo_sp', 'lfo_res', 'lfo_ew', 'lfo_pitch'].some(q => c.v[q] > 0); if (act && (c.v[key] || 0) > 1) return bad('an LFO that jumps'); }
    if (Object.keys(c.v).some(q => /_semi$/.test(q) && [3, 4, 5].includes(c.v[q]))) return bad('a third or a fourth above every note');
    if (Object.keys(c.v).some(q => /^b2_/.test(q))) return bad('B2');
    if ((c.v.v_unison || 1) > 3 || L.cpuStack(c.v, defs) > 3) return bad('CPU: unison / stacked effects');
    const why = A.judgeSound(a, c.meta.kind) || (c.cat === 'SuperModulation' ? A.judgeMotion(a, c.cat) : (Math.max(a.moveDelta, a.decaying && a.onsetDiff !== undefined ? a.onsetDiff : 0) < MOVE_MIN ? 'modulation inaudible' : null)) || A.judgeContrast(a);
    if (why) return bad(why);
    if (c.fltEffect < FLT_MIN) return bad('the filter hardly changes the sound');
    return true;
  });
  console.log(`${ok.length} pass the gates. Refused: ` + Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  // ---- the taste model and the distinctness against what he kept
  const { model, loo, keepers } = L.tasteModel(30);
  console.log(`taste model: leave-one-out correlation ${loo.r.toFixed(2)} on ${model.names.length} features; ${keepers.length} kept presets (3 stars or more) for the distinctness`);
  const nn = keepers.map((f, i) => Math.min(...keepers.map((g, j) => (i === j ? 99 : L.dist(f, g))))).sort((a, b) => a - b);
  const dmin = nn[Math.floor(0.1 * (nn.length - 1))];   // a candidate nearer to a kept preset than the nearest tenth of the kept ones are to each other is a clone
  console.log(`  distance of the kept presets to their nearest neighbour: 10 % ${dmin.toFixed(2)}, median ${nn[nn.length >> 1].toFixed(2)}`);
  for (const c of ok) { c.score = model.predict({ v: A.fullValues(c.v), cat: c.cat, audit: c.audit }); c.features = c.audit.features; c.dKeep = Math.min(...keepers.map(f => L.dist(c.features, f))); }
  const chosen = [];
  const { CLAUSE } = require('./mods.js');
  for (const [cat, quota] of QUOTA) {
    // two tiers: the candidates no nearer to a kept preset than dmin first; when a category is short of them (the organs sound alike), the ones down to 0.7 dmin
    const tier = (minD, left) => { const p = ok.filter(c => c.cat === cat && c.dKeep >= minD && !picksAll.includes(c)).sort((a, b) => b.score - a.score), sh = p.slice(0, Math.max(left + 4, Math.ceil(p.length * 0.6)));
      return { p, got: L.farthest(sh, left, keepers.concat(chosen.map(c => c.features)).concat(picksAll.map(c => c.features)), 0).map(i => sh[i]) }; };
    const picksAll = [], t1 = tier(dmin, quota); picksAll.push(...t1.got);
    let relaxed = 0;
    if (picksAll.length < quota) { const t2 = tier(0.7 * dmin, quota - picksAll.length); relaxed = t2.got.length; picksAll.push(...t2.got); }
    const picks = picksAll, pool = t1.p;
    const avg = (l) => (l.length ? l.reduce((s, c) => s + c.score, 0) / l.length : 0);
    console.log(`${cat.padEnd(16)} ${String(picks.length).padStart(2)} / ${quota} chosen from ${pool.length} (${ok.filter(c => c.cat === cat).length} before the distance gate${relaxed ? ', ' + relaxed + ' of them from the relaxed tier' : ''}); predicted stars: chosen ${avg(picks).toFixed(2)}, all ${avg(pool).toFixed(2)}`);
    for (const c of picks) chosen.push(c);
  }
  if (chosen.length < 150) console.log(`WARNING: only ${chosen.length} of 150 chosen: run more candidates (--pool, another --seed)`);
  // ---- the numbers and the file (categories in menu order, 1401 upwards)
  for (const c of chosen) c.desc = L.describeFlt(c.meta.base, c.meta.mods, c.v, CLAUSE);   // the composer's description with this batch's account of the filter
  const entries = chosen.map((c, i) => ({ name: `${FIRST + i} ${c.used} · ${c.title}`, cat: c.cat, desc: c.desc, v: L.sparse(c.v, SPEC) }));
  L.writeData(FILE, 'GENERATED by tools/supermod/filter_build.js (compose.js with the filter forced, filter_lib.js, audit.js, the taste model of filter_taste.js): the presets of the filter batch, numbers 1401-1550\n(the voice FILTER used a little more, with a little resonance), loudness matched; tools/supermod/loud_filter.js lowers the master volumes after a loud chord.', entries);
  fs.writeFileSync(path.join(OUT, `filter${TAG}_chosen.json`), JSON.stringify(chosen.map((c, i) => ({ num: FIRST + i, cat: c.cat, title: c.title, used: c.used, score: c.score, dKeep: c.dKeep, fltEffect: c.fltEffect, meta: c.meta }))));
  console.log(`written ${path.relative(path.join(__dirname, '..', '..'), FILE)} (${entries.length} presets)`);
  if (!selectOnly) for (let k = 0; k < procs; k++) fs.unlinkSync(path.join(OUT, `filter${TAG}_cand_${k}.json`));
}
