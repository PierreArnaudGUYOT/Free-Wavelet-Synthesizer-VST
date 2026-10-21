// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds tools/presets_new.js, the new presets of Okto MultiWave Synth, from the recipes (tools/recipes_*.js, written in the
// language of tools/preset_dsl.js): numbers them in category order, matches their loudness to the TOP Sounds (loudest 200 ms of a
// held C major chord, 50 ms and 3 dB lower for drums; master rounded to 0.5 dB, peak under 0 dBFS), checks them (sound, finite,
// distinct from each other) and draws a contact sheet per category (tools/out/sheet-*.png).
//   node tools/make_presets.js [--sheets] [--no-write]
// Then: node tools/gen_spec.js
'use strict';
const fs = require('fs');
const path = require('path');
const lab = require('./preset_lab.js');
const SPEC = lab.SPEC, C = lab.C, P = lab.P;
const CATS = ['Bass', 'Lead', 'Keys', 'Organ', 'Pad', 'Strings', 'Brass & Wind', 'Pluck', 'Bells & Mallets', 'FX', 'Drums & Perc'];
const FILES = ['bass', 'lead', 'keys', 'pad', 'brass', 'pluck', 'bells', 'fx', 'perc'];
const sheets = process.argv.includes('--sheets'), write = !process.argv.includes('--no-write');

// ---- the recipes, in category order
const all = [];
for (const f of FILES) {
  const file = path.join(__dirname, `recipes_${f}.js`);
  if (fs.existsSync(file)) for (const r of require(file)) all.push(r);
}
for (const r of all) if (!CATS.includes(r.cat)) throw new Error(`${r.title}: unknown category ${r.cat}`);
all.sort((a, b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat));   // stable: the recipe order within a category stays
const titles = new Set();
for (const r of all) { if (titles.has(r.title)) throw new Error('duplicate title ' + r.title); titles.add(r.title); }

// ---- the target loudness: the TOP Sounds
const top = SPEC.PRESETS.slice(0, SPEC.TOP).map(p => lab.chordLoudness(p.values, 0.2).db).sort((a, b) => a - b);   // the TOP Sounds by the 200 ms rule
const target = top[Math.floor(top.length / 2)];
console.log(`TOP Sounds: median ${target.toFixed(1)} dB over ${top.length} presets`);

const mp = SPEC.PARAMS[P.master], defMaster = mp.def;
const presets = [];
let problems = 0;
all.forEach((r, i) => {
  const num = String(i + 1).padStart(3, '0');
  const values = SPEC.PARAMS.map(p => (r.v[p.key] !== undefined ? r.v[p.key] : p.def));
  const win = r.win || undefined;   // normally automatic: a short sound is matched over 50 ms, 3 dB lower (lab.chordLoudness)
  let m = lab.chordLoudness(values, win);
  const cur = r.v.master !== undefined ? r.v.master : defMaster;
  const need = (mm) => Math.round((cur + target - mm.db) * 2) / 2;
  const v0 = Object.assign({}, r.v);
  // a sound that would need more than +3 dB of master gets its oscillators louder (all by the same factor, the loudest at most
  // at 100 %), so that the master keeps a margin and the levels on the panel are used; not with DRIVE (the saturation depends on the level)
  if (need(m) > 3 && !(r.v.fx_drive > 0)) {
    let maxLvl = 0;
    for (const s of SPEC.SLOTS) { const key = SPEC.PARAMS[s.k.lvl].key; maxLvl = Math.max(maxLvl, v0[key] !== undefined ? v0[key] : SPEC.PARAMS[s.k.lvl].def); }
    const f = Math.min(Math.pow(10, (need(m) - 3) / 20), 1 / maxLvl);
    if (f > 1.01) {
      for (const s of SPEC.SLOTS) { const key = SPEC.PARAMS[s.k.lvl].key; if (v0[key] !== undefined && v0[key] > 0) v0[key] = Math.round(v0[key] * f * 1000) / 1000; }
      const nv = SPEC.PARAMS.map(q => (v0[q.key] !== undefined ? v0[q.key] : q.def));
      m = lab.chordLoudness(nv, win);
    }
  }
  let master = Math.max(mp.min, Math.min(mp.max, need(m)));
  const pk = m.peak * Math.pow(10, (master - cur) / 20);
  if (pk > 0.98) master = Math.round((master - 20 * Math.log10(pk / 0.98) - 0.25) * 2) / 2;
  const v = Object.assign({}, v0, { master });
  const name = `${num} ${r.used} · ${r.title}`;
  presets.push({ name, cat: r.cat, desc: r.desc, v, used: r.used, peak: m.peak, db: m.db, master });
  const finalDb = m.db + (master - cur);
  const flag = m.peak < 1e-3 ? '  SILENT' : !isFinite(m.db) ? '  NOT FINITE' : finalDb < target - 1.5 ? `  QUIET (${(finalDb - target).toFixed(1)} dB)` : '';
  if (flag) problems++;
  if (process.argv.includes('-v') || flag) console.log(`${name.padEnd(44)} ${m.db.toFixed(1).padStart(6)} dB${m.short ? ' short' : ''} peak ${m.peak.toFixed(2)} master ${cur} -> ${master}${flag}`);
});

// ---- statistics
const count = {};
for (const p of presets) count[p.used] = (count[p.used] || 0) + 1;
console.log(`${presets.length} presets; oscillators used: ` + Object.entries(count).sort().map(([k, v]) => `${k} ${v}`).join(', '));
const byCat = {};
for (const p of presets) byCat[p.cat] = (byCat[p.cat] || 0) + 1;
console.log('per category: ' + CATS.map(c => `${c} ${byCat[c] || 0}`).join(', '));

// ---- distinctness: a feature vector per preset (the spectrum in 14 bands at three moments + the envelope), nearest pairs
const feats = presets.map((p) => {
  const values = SPEC.PARAMS.map(q => (p.v[q.key] !== undefined ? p.v[q.key] : q.def));
  const r = lab.render(values, { hold: 1.2, tail: 0.6 });
  const f = [];
  for (const ms of [30, 250, 900]) {
    const sp = lab.spectrum(r, Math.round(ms / 1000 * lab.sr));
    for (let b = 0; b < 14; b++) {
      const lo = Math.round(80 * Math.pow(2, b * 0.62) * 2048 / lab.sr), hi = Math.max(lo + 1, Math.round(80 * Math.pow(2, (b + 1) * 0.62) * 2048 / lab.sr));
      let e = 0; for (let k = lo; k < Math.min(1024, hi); k++) e += Math.pow(10, sp[k] / 10);
      f.push(10 * Math.log10(e + 1e-12));
    }
  }
  const env = lab.envelope(r, 20);
  for (const ms of [40, 100, 300, 800, 1400]) f.push(env[Math.min(env.length - 1, Math.round(ms / 20))] * 1.0);
  p.m = lab.measure(r);
  return f;
});
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(s / a.length); };
const pairs = [];
for (let i = 0; i < presets.length; i++) for (let j = i + 1; j < presets.length; j++) pairs.push([dist(feats[i], feats[j]), i, j]);
pairs.sort((a, b) => a[0] - b[0]);
console.log('closest pairs (distance in dB):');
for (const [d, i, j] of pairs.slice(0, 8)) console.log(`  ${d.toFixed(1).padStart(5)}  ${presets[i].name}  ~  ${presets[j].name}`);

// ---- output
if (write) {
  let js = '// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)\n// SPDX-License-Identifier: GPL-3.0-or-later\n// GENERATED by tools/make_presets.js from tools/recipes_*.js: the new presets of Okto MultiWave Synth (numbered, loudness matched).\n' +
    "'use strict';\nmodule.exports = [\n";
  for (const p of presets) js += `  { name: ${JSON.stringify(p.name)}, cat: ${JSON.stringify(p.cat)}, desc: ${JSON.stringify(p.desc)},\n    v: ${JSON.stringify(p.v)} },\n`;
  js += '];\n';
  fs.writeFileSync(path.join(__dirname, 'presets_new.js'), js);
  console.log(`written tools/presets_new.js (${presets.length} presets)`);
}
if (sheets) {
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  for (const cat of CATS) {
    const list = presets.filter(p => p.cat === cat);
    if (!list.length) continue;
    const cells = list.map((p) => {
      const values = SPEC.PARAMS.map(q => (p.v[q.key] !== undefined ? p.v[q.key] : q.def));
      return { label: p.name.slice(0, 3), r: lab.render(values, { hold: 1.4, tail: 1.1 }) };
    });
    const file = path.join(out, 'sheet-' + cat.replace(/[^A-Za-z]+/g, '') + '.png');
    lab.sheet(cells, file, { cols: 4 });
    console.log('sheet ' + file);
  }
}
console.log(problems ? problems + ' PROBLEMS' : 'all presets sound and are finite');
process.exit(problems ? 1 : 0);
