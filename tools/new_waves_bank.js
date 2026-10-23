// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Version 1.0.17: the "New Waves" bank, the owner's test of the 20 new source waves (a_wave / a2_wave 6 .. 25). It starts from the sounds he rated
// highest in his presets file (every one with STARS stars or more: the factory presets and his user bank), and makes 200 sounds from them:
//   - the wave of each subtractive oscillator that plays (A1, A2) becomes a new one of the same family (a saw a sync saw, a reso saw ...), every
//     new wave used about as often as the others; a sound with no subtractive oscillator gets A2 with a new wave under its own sound;
//   - his rules for this bank: not much reverb, not a long amp release (the previous bank had too much of both), both varied from sound to sound;
//     many sounds with a sharper attack (a short amp attack, a faster mod envelope, more PUNCH), the attack varied too;
//   - each sound at the loudness of the sound it comes from (tools/preset_lab.js chordLoudness), then lowered by whole dB until the loudest chords
//     of tools/supermod/loud.js stay under 0.9 before the output stage (no crackle).
//   node tools/new_waves_bank.js "<path>/OKTOMULTIWAVE presets.txt" --stats       his rated sounds, their oscillators
//   node tools/new_waves_bank.js "<path>/OKTOMULTIWAVE presets.txt"               makes the bank: tools/out/new_waves.txt (the section) + new_waves.json
//   node tools/new_waves_bank.js "<path>/OKTOMULTIWAVE presets.txt" --write       also puts the section into his file (a "New Waves" bank already there is replaced)
//   node tools/new_waves_bank.js "<path>/OKTOMULTIWAVE presets.txt" --write-only  puts the section made last time into his file (nothing measured again)
// Back his file up before --write.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = process.argv[2] === '--worker' ? '' : process.argv[2];
const COUNT = +arg('count', 200), STARS = +arg('stars', 6), SEED = +arg('seed', 17), BANK = 'New Waves';
const OUT = path.join(__dirname, 'out');
const SPEC = require('../web/js/spec.js');
const PK = {}; SPEC.PARAMS.forEach((p, i) => { PK[p.key] = i; });
const NEW_WAVES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

// ---------------------------------------------------------------- loudness (worker processes)
const CHORDS = [[60, 64, 67], [72, 76, 79], [84, 88, 91], [72, 76, 79, 84, 88], [60, 64, 67, 72, 76, 79],
  [36, 43, 48, 52, 55, 60, 64, 67], [36, 48, 55, 60, 64, 67, 72, 76, 79, 84], [48, 52, 55, 60, 64, 67, 72, 76, 79]];
if (process.argv[2] === '--worker') {
  const lab = require('./preset_lab.js'), { C, P, sr } = lab, mp = SPEC.PARAMS[P.master];
  const peakRender = (values, notes) => {
    const params = Float64Array.from(values), eng = new C.Engine(sr);
    params.forEach((v, i) => eng.setParam(i, v));
    eng.vol = Math.exp(params[P.master] * (Math.LN10 / 20));
    eng.setTables(C.buildTables(params, true));
    const n = Math.round(2.4 * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128, offAt = Math.round(1.6 * sr / blk) * blk;
    let pk = 0, bad = 0;
    for (let s = 0; s < n; s += blk) {
      if (s === 0) for (const k of notes) eng.noteOn(k, 1);
      if (s === offAt) for (const k of notes) eng.noteOff(k);
      eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s));
      for (let i = s; i < Math.min(s + blk, n); i++) { if (!isFinite(L[i]) || !isFinite(R[i])) bad++; else pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    }
    return { pk, bad };
  };
  const peakOf = (values) => {   // the loudest chord's peak at the preset's master volume (rendered 18 dB lower, scaled back: the output stage stays out of the way)
    const low = Math.max(mp.min, values[P.master] - 18), gain = Math.pow(10, (values[P.master] - low) / 20), v2 = values.slice(); v2[P.master] = low;
    let worst = 0, bad = 0;
    for (const ch of CHORDS) { const r = peakRender(v2, ch); worst = Math.max(worst, r.pk * gain); bad += r.bad; }
    return { peak: worst, bad };
  };
  const jobs = JSON.parse(fs.readFileSync(arg('jobs', ''), 'utf8')), part = +arg('worker', 0), of = +arg('of', 1), res = [];
  const loud = (values) => lab.chordLoudness(values, 0.2).db;   // the same 200 ms window for a sound and its source (a sharper attack would switch the short-sound rule)
  const srcLvl = new Map();
  jobs.forEach((j, k) => {
    if (k % of !== part) return;
    // the source's loudness and its own loud-chord peak: a new sound may peak as high as its source does, up to 1.0 (never stricter than the source)
    if (!srcLvl.has(j.ri)) srcLvl.set(j.ri, { db: loud(j.src), peak: peakOf(j.src).peak });
    const target = srcLvl.get(j.ri).db, lim = Math.min(1, Math.max(0.9, srcLvl.get(j.ri).peak)), v = j.values.slice(), m0 = v[P.master];
    // two passes: the soft limiter bends the level near the top
    for (let pass = 0; pass < 2; pass++) {
      const d = target - loud(v);
      if (Math.abs(d) < 0.3) break;
      v[P.master] = Math.max(mp.min, Math.min(mp.max, Math.max(m0 - 18, Math.min(m0 + 12, v[P.master] + d))));
    }
    const pk = peakOf(v);
    const down = pk.peak > lim ? Math.min(12, Math.ceil(20 * Math.log10(pk.peak / lim) - 1e-9)) : 0;
    v[P.master] = Math.max(mp.min, v[P.master] - down);
    const db = loud(v);
    res.push({ i: j.i, master: Math.round(v[P.master] * 10) / 10, db, target, lim, peak: pk.peak * Math.pow(10, -down / 20), down, bad: pk.bad });
  });
  fs.writeFileSync(path.join(OUT, `nw_${part}.json`), JSON.stringify(res));
  process.exit(0);
}

if (!FILE || !fs.existsSync(FILE)) { console.error('usage: node tools/new_waves_bank.js "<path>/OKTOMULTIWAVE presets.txt" [--stats] [--write]'); process.exit(1); }

// ---------------------------------------------------------------- his file
const text = fs.readFileSync(FILE, 'utf8');
const sounds = [];
{
  let part = '', sec = '', cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('########')) {
      part = line.includes('YOUR PRESETS IN THE FACTORY LISTS') ? 'X' : line.includes('FACTORY') ? 'F' : line.includes('USER BANK') ? 'U' : line.includes('LIST ORDER') ? 'L' : '';
      cur = null; sec = ''; continue;
    }
    if (part === 'L' || part === '') continue;
    const h = line.match(/^== (.+) ==$/);
    if (h) { sec = h[1]; cur = null; continue; }
    if (line.startsWith('Preset: ')) { cur = { name: line.slice(8), part, sec, params: {}, stars: 0 }; sounds.push(cur); continue; }
    if (!cur) continue;
    if (line.startsWith('Factory: ')) cur.orig = line.slice(9);
    else if (line.startsWith('Deleted: ')) cur.del = line.slice(9).startsWith('yes');
    else if (line.startsWith('Stars: ')) cur.stars = parseInt(line.slice(7), 10) || 0;
    else if (line.startsWith('From: ')) cur.from = line.slice(6);
    else { const m = line.match(/^ {2}(\w+): (\S+)/); if (m) cur.params[m[1]] = +m[2]; }
  }
}
const fullValues = (params) => SPEC.PARAMS.map(p => {
  const x = p.perf || p.hidden || params[p.key] === undefined ? p.def : params[p.key];
  return Math.max(p.min, Math.min(p.max, x));
});
const factoryByName = new Map(SPEC.PRESETS.map(p => [p.name, p]));
// the kind of sound (the wave families and envelope ranges follow it): the factory category, else the envelope's shape
const KIND = { Bass: 'bass', Lead: 'lead', Keys: 'keys', Organ: 'keys', Pad: 'pad', Strings: 'pad', 'Brass & Wind': 'lead', Pluck: 'pluck',
  'Bells & Mallets': 'pluck', Chords: 'keys', FX: 'fx', 'Drums & Perc': 'pluck' };
function kindOf(s, v) {
  const f = factoryByName.get(s.orig || s.from || s.name), cat = f ? f.cat : s.sec;
  if (KIND[cat]) return KIND[cat];
  const a = v[PK.amp_a], sus = v[PK.amp_s], d = v[PK.amp_d];
  if (sus < 0.25 && d < 1.5) return 'pluck';
  if (a > 0.12) return 'pad';
  return 'lead';
}
let rated = sounds.filter(s => !s.del && s.stars >= STARS).map(s => {
  const v = fullValues(s.params);
  return { s, v, kind: kindOf(s, v), a1: v[PK.a1_lvl] > 0.01, a2: v[PK.a2_lvl] > 0.01, b1: v[PK.b1_lvl] > 0.01 };
});
rated.sort((x, y) => y.s.stars - x.s.stars || (x.s.name < y.s.name ? -1 : 1));
// the same sound twice (a factory preset and his user-bank copy, unchanged): once, with its higher rating
rated = rated.filter((r, i) => !rated.slice(0, i).some(q => q.v.every((x, k) => Math.abs(x - r.v[k]) < 1e-6)));

if (process.argv.includes('--write-only')) {   // the bank made last time (tools/out/new_waves.txt) into his file, nothing measured again
  writeBank(fs.readFileSync(path.join(OUT, 'new_waves.txt'), 'utf8').split(/\r?\n/));
  process.exit(0);
}
if (process.argv.includes('--stats')) {
  const hist = {}; for (const s of sounds) if (!s.del && s.stars) hist[s.stars] = (hist[s.stars] || 0) + 1;
  console.log(`${sounds.length} sounds in the file; rated, by stars: ` + Object.entries(hist).map(([k, n]) => `${k}: ${n}`).join(', '));
  console.log(`${rated.length} with ${STARS} stars or more:`);
  const W = SPEC.PARAMS[PK.a_wave].choices;
  for (const r of rated) console.log(`  ${String(r.s.stars).padStart(2)} ${r.s.part} ${r.kind.padEnd(5)} ${(r.a1 ? 'A1:' + W[r.v[PK.a_wave]] : '-').padEnd(12)} ${(r.a2 ? 'A2:' + W[r.v[PK.a2_wave]] : '-').padEnd(12)} ${r.b1 ? 'B1' : '- '}  r ${r.v[PK.amp_r].toFixed(2)} rev ${r.v[PK.fx_rmix].toFixed(2)} a ${r.v[PK.amp_a].toFixed(3)}  ${r.s.name}`);
  process.exit(0);
}
if (SPEC.PARAMS[PK.a_wave].max < 25) { console.error('this spec has no new waves (a_wave max ' + SPEC.PARAMS[PK.a_wave].max + ')'); process.exit(1); }

// ---------------------------------------------------------------- the 200 sounds
let seed = SEED >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const U = (a, b) => a + (b - a) * rnd();
const logU = (a, b) => a * Math.pow(b / a, rnd());
const pick = (opts) => { let x = rnd() * opts.reduce((s, o) => s + o[0], 0); for (const o of opts) { x -= o[0]; if (x <= 0) return o[1]; } return opts[opts.length - 1][1]; };

// the new waves close to each old one (Saw, Square, Pulse, Triangle, Sine, Noise)
const FAMILY = [[8, 14, 15, 17, 23, 25, 12, 9], [8, 10, 16, 24, 18, 22], [16, 22, 10, 8, 24, 12], [9, 11, 6, 7, 13, 18], [6, 7, 18, 19, 20, 21, 11, 13], []];
const used = new Map(NEW_WAVES.map(w => [w, 0]));
function newWave(old, tried = []) {
  let fam = (rnd() < 0.25 || !FAMILY[old] || !FAMILY[old].length ? NEW_WAVES : FAMILY[old]).filter(w => !tried.includes(w));   // a quarter from all twenty: the bank tries everything
  if (!fam.length) fam = NEW_WAVES.filter(w => !tried.includes(w));
  const lo = Math.min(...fam.map(w => used.get(w)));
  const best = fam.filter(w => used.get(w) === lo);
  const w = best[Math.floor(rnd() * best.length)];
  used.set(w, used.get(w) + 1);
  return w;
}

// how many sounds each rated sound gives: more for more stars, at least one each
const weight = (st) => Math.max(1, st - STARS + 2);   // 6 stars 2 ... 10 stars 6: two to seven sounds each
const wsum = rated.reduce((s, r) => s + weight(r.s.stars), 0);
const alloc = rated.map(r => Math.max(1, Math.floor(COUNT * weight(r.s.stars) / wsum)));
for (let k = 0; alloc.reduce((a, b) => a + b, 0) < COUNT; k = (k + 1) % rated.length) alloc[k]++;
for (let k = rated.length - 1; alloc.reduce((a, b) => a + b, 0) > COUNT; k = (k - 1 + rated.length) % rated.length) if (alloc[k] > 1) alloc[k]--;

const allNames = new Set(sounds.map(s => s.name));
const W = SPEC.PARAMS[PK.a_wave];
const set = (v, key, x) => { const p = SPEC.PARAMS[PK[key]]; v[PK[key]] = Math.max(p.min, Math.min(p.max, x)); };
const round = (key, x) => { const p = SPEC.PARAMS[PK[key]]; return p.curve === 'choice' || p.curve === 'int' ? Math.round(x) : +x.toPrecision(3); };
const jobs = [];
rated.forEach((r, ri) => {
  for (let n = 0; n < alloc[ri]; n++) {
    const v = r.v.slice(), src = r.v, kind = r.kind, notes = [], waves = [];
    const swap = (key, old) => { set(v, key, newWave(old)); waves.push({ key, old }); };   // (the first one swapped names the sound)
    // the waves
    const a1 = r.a1, a2 = r.a2;
    if (!a1 && !a2) {   // a sound with no subtractive oscillator: A2 with a new wave under it, an octave down on half of them
      set(v, 'a2_lvl', U(0.3, 0.5)); swap('a2_wave', 4); if (rnd() < 0.5) set(v, 'a2_oct', -1); notes.push('A2 added');
    } else {
      const main = a1 && (!a2 || src[PK.a1_lvl] >= src[PK.a2_lvl]) ? 'a_wave' : 'a2_wave', other = main === 'a_wave' ? 'a2_wave' : 'a_wave';
      if (src[PK[main]] !== 5) swap(main, src[PK[main]]);
      else if ((main === 'a_wave' ? a2 : a1) && src[PK[other]] !== 5) swap(other, src[PK[other]]);
      else swap(main, 0);   // two noise sources: the main one becomes a wave
      if ((a1 && a2) && rnd() < 0.5 && src[PK[other]] !== 5 && v[PK[other]] === src[PK[other]]) swap(other, src[PK[other]]);
    }
    // the attack: sharp on many, soft on some pads
    const soft = kind === 'pad' || kind === 'fx';
    const atk = pick(soft ? [[0.3, 'sharp'], [0.4, 'mid'], [0.3, 'soft']] : kind === 'pluck' || kind === 'bass' ? [[0.8, 'sharp'], [0.2, 'mid']] : [[0.6, 'sharp'], [0.32, 'mid'], [0.08, 'soft']]);
    if (atk === 'sharp') {   // (most of his sounds already start in 1 ms: their attack comes from PUNCH and a faster mod envelope)
      set(v, 'amp_a', Math.min(Math.max(src[PK.amp_a], 0.001), logU(0.001, 0.005)));
      set(v, 'fx_punch', U(0.6, 0.85));
      if (src[PK.mod_a] > 0.006) set(v, 'mod_a', logU(0.001, 0.005));
    } else if (atk === 'mid') {
      set(v, 'amp_a', Math.min(Math.max(src[PK.amp_a], 0.001), logU(0.008, 0.045))); set(v, 'fx_punch', U(0.45, 0.65));
    } else {   // a slow swell keeps some of its rise (up to 60 % of it)
      set(v, 'amp_a', Math.min(Math.max(src[PK.amp_a], 0.06), logU(0.06, Math.max(0.3, 0.6 * src[PK.amp_a])))); set(v, 'fx_punch', U(0.3, 0.5));
    }
    // the amp release: short on most, varied, never longer than the sound it comes from
    const rel = kind === 'pad' ? logU(0.35, 1.3) : kind === 'bass' || kind === 'pluck' ? logU(0.05, 0.35)
      : pick([[0.45, [0.06, 0.25]], [0.4, [0.25, 0.6]], [0.15, [0.6, 1.0]]]);
    const relS = Array.isArray(rel) ? logU(rel[0], rel[1]) : rel;
    set(v, 'amp_r', src[PK.amp_r] < 0.05 ? src[PK.amp_r] : Math.min(relS, src[PK.amp_r] * 1.15));
    // the reverb: dry, light or medium, varied, never much more than the sound it comes from
    const revOpts = kind === 'bass' ? [[0.7, [0, 0.04]], [0.3, [0.05, 0.12]]] : kind === 'pad' ? [[0.15, [0, 0.06]], [0.4, [0.08, 0.18]], [0.45, [0.18, 0.3]]]
      : [[0.25, [0, 0.06]], [0.45, [0.08, 0.18]], [0.3, [0.18, 0.28]]];
    const rv = pick(revOpts), mix = rv[1] < 0.05 ? (rnd() < 0.5 ? 0 : U(rv[0], rv[1])) : U(rv[0], rv[1]);
    set(v, 'fx_rmix', Math.min(mix, src[PK.fx_rmix] + 0.04));
    set(v, 'fx_rsize', Math.min(src[PK.fx_rsize], kind === 'pad' ? U(0.45, 0.8) : U(0.3, 0.7)));
    if (src[PK.fx_dmix] > 0) set(v, 'fx_dmix', Math.min(0.25, src[PK.fx_dmix] * U(0.5, 0.9)));
    for (const k of ['amp_a', 'amp_r', 'fx_rmix', 'fx_rsize', 'fx_dmix', 'fx_punch', 'mod_a', 'a2_lvl']) if (v[PK[k]] !== src[PK[k]]) v[PK[k]] = round(k, v[PK[k]]);
    const j = { from: r.s.name, ri, kind, atk, notes, waves, tried: [], src: Array.from(src), values: v };
    j.name = nameOf(j);
    jobs.push(j);
  }
});
// the name: the sound's own words, the new wave's short name (the first one swapped), its CPU mark kept
function nameOf(j) {
  const v = j.values;
  const prefix = (v[PK.a1_lvl] > 0.01 ? 'A' : '') + (v[PK.a2_lvl] > 0.01 ? 'A' : '') + (v[PK.b1_lvl] > 0.01 ? 'B' : '');
  let base = j.from.replace(/^[AB]+ · /, ''), hi = '';
  if (/ HIGH_CPU$/.test(base)) { hi = ' HIGH_CPU'; base = base.replace(/ HIGH_CPU$/, ''); }
  base = base.replace(/ (LGT|LIGHT|NEW|V\d)$/i, '');
  const tag = W.choiceShort[v[PK[j.waves[0].key]]];
  let name = `${prefix} · ${base} ${tag}${hi}`;
  for (let k = 2; allNames.has(name); k++) name = `${prefix} · ${base} ${tag} ${k}${hi}`;
  allNames.add(name);
  return name;
}
// a sound far from its source's loudness: lowered for the loud chords with a PUNCH raised, half the raise first (its transient is the peak);
// else (the master at its end, a louder sound) another wave of its family
function reroll(j) {
  const pu = PK.fx_punch;
  if (j.lvl.down > 0 && !j.punchCut && j.values[pu] > j.src[pu] + 0.05) {
    j.values[pu] = round('fx_punch', j.src[pu] + (j.values[pu] - j.src[pu]) / 2); j.punchCut = true;
    j.values[PK.master] = j.src[PK.master];
    return;
  }
  for (const w of j.waves) {
    const cur = j.values[PK[w.key]];
    used.set(cur, used.get(cur) - 1); j.tried.push(cur);
    set(j.values, w.key, newWave(w.old, j.tried));
  }
  j.values[PK.master] = j.src[PK.master];
  allNames.delete(j.name); j.name = nameOf(j);
}

// ---------------------------------------------------------------- loudness, in parallel (rounds: the sounds still more than 3 dB off get other waves)
fs.mkdirSync(OUT, { recursive: true });
const jobFile = path.join(OUT, 'nw_jobs.json');
const PROCS = Math.max(1, Math.min(+arg('procs', os.cpus().length), jobs.length));
const t0 = Date.now();
let rounds = 0, rerolled = 0;
run(jobs.map((_, i) => i));
function run(idx) {
  rounds++;
  fs.writeFileSync(jobFile, JSON.stringify(idx.map(i => Object.assign({ i }, jobs[i]))));
  const procs = Math.min(PROCS, idx.length);
  let done = 0;
  for (let k = 0; k < procs; k++) fork(__filename, ['--worker', String(k), '--of', String(procs), '--jobs', jobFile]).on('exit', () => { if (++done === procs) collect(procs); });
}
function collect(procs) {
  for (let k = 0; k < procs; k++) {
    const f = path.join(OUT, `nw_${k}.json`);
    for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) { jobs[r.i].values[PK.master] = r.master; jobs[r.i].lvl = r; }
    fs.unlinkSync(f);
  }
  fs.unlinkSync(jobFile);
  // louder than its source by more than 1.5 dB (a loud one in the list is worse than a soft one), or softer by more than 3 dB
  const far = jobs.map((j, i) => i).filter(i => jobs[i].lvl.db - jobs[i].lvl.target > 1.5 || jobs[i].lvl.db - jobs[i].lvl.target < -3);
  if (far.length && rounds < 6) { for (const i of far) reroll(jobs[i]); rerolled += far.length; console.log(`round ${rounds}: ${far.length} sounds too far from their source's loudness: half their PUNCH raise or another wave`); run(far); return; }
  finish();
}

function finish() {
  const res = jobs.map(j => j.lvl);
  // the section of his file: "== New Waves ==", each sound's parameters that differ from the defaults
  const L = [`== ${BANK} ==`, ''];
  for (const j of jobs) {
    L.push('Preset: ' + j.name, 'From: ' + j.from);
    SPEC.PARAMS.forEach((p, i) => {
      if (p.perf || p.hidden) return;
      const x = j.values[i];
      if (Math.abs(x - p.def) > 1e-9 * Math.max(1, Math.abs(p.def))) L.push(`  ${p.key}: ${+x.toFixed(6)}`);
    });
    L.push('');
  }
  fs.writeFileSync(path.join(OUT, 'new_waves.txt'), L.join('\r\n'));
  fs.writeFileSync(path.join(OUT, 'new_waves.json'), JSON.stringify(jobs.map(j => ({ name: j.name, from: j.from, kind: j.kind, atk: j.atk, notes: j.notes, lvl: j.lvl, values: j.values }))));
  // the report
  const bad = res.filter(r => r.bad), off = res.filter(r => Math.abs(r.db - r.target) > 1.5);
  const waves = {}; for (const j of jobs) for (const k of ['a_wave', 'a2_wave']) { const w = j.values[PK[k]]; if (w >= 6 && (k === 'a_wave' ? j.values[PK.a1_lvl] : j.values[PK.a2_lvl]) > 0.01) waves[W.choices[w]] = (waves[W.choices[w]] || 0) + 1; }
  const q = (a, f) => { const s = a.map(f).sort((x, y) => x - y); return `${s[0].toFixed(2)} / ${s[s.length >> 1].toFixed(2)} / ${s[s.length - 1].toFixed(2)}`; };
  console.log(`${jobs.length} sounds from ${rated.length} rated sounds (${STARS}+ stars), measured in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log('  waves: ' + Object.entries(waves).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '));
  console.log('  attack: ' + ['sharp', 'mid', 'soft'].map(a => `${a} ${jobs.filter(j => j.atk === a).length}`).join(', ') + `; amp attack s (min / median / max) ${q(jobs, j => j.values[PK.amp_a])}`);
  console.log(`  amp release s ${q(jobs, j => j.values[PK.amp_r])} (theirs ${q(jobs, j => j.src[PK.amp_r])}); reverb mix ${q(jobs, j => j.values[PK.fx_rmix])} (theirs ${q(jobs, j => j.src[PK.fx_rmix])})`);
  console.log(`  loudness off the source by more than 1.5 dB: ${off.length} (waves changed for the loudness: ${rerolled}, ${rounds} rounds); lowered for the loud chords: ${res.filter(r => r.down).length}; peak max ${Math.max(...res.map(r => r.peak)).toFixed(2)}; non-finite samples: ${bad.length}`);
  for (const r of off) console.log(`    ${jobs[r.i].name}: ${(r.db - r.target).toFixed(1)} dB (lowered ${r.down} dB for the loud chords, limit ${r.lim.toFixed(2)})`);
  if (!process.argv.includes('--write')) { console.log('tools/out/new_waves.txt written (not in his file: --write, or --write-only to put this one in)'); return; }
  writeBank(L);
}
// into his file: the USER BANK part, a "New Waves" bank already there replaced
function writeBank(L) {
  const crlf = /\r\n/.test(text), lines = text.split(/\r?\n/);
  const ub = lines.findIndex(l => l.startsWith('######## USER BANK'));
  if (ub < 0) { console.error('no USER BANK part in the file'); process.exit(1); }
  let end = lines.findIndex((l, i) => i > ub && l.startsWith('########')); if (end < 0) end = lines.length;
  const at = lines.findIndex((l, i) => i > ub && i < end && l === `== ${BANK} ==`);
  let out;
  if (at >= 0) {
    let stop = lines.findIndex((l, i) => i > at && i < end && /^== .+ ==$/.test(l)); if (stop < 0) stop = end;
    out = lines.slice(0, at).concat(L, lines.slice(stop));
  } else {
    let tail = end; while (tail > ub && lines[tail - 1] === '') tail--;
    out = lines.slice(0, tail).concat([''], L, lines.slice(end));
  }
  fs.writeFileSync(FILE, out.join(crlf ? '\r\n' : '\n'));
  console.log(`${FILE}: the bank "${BANK}" written (${L.filter(l => l.startsWith('Preset: ')).length} sounds)`);
}
