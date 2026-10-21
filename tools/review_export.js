// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Reads an "OKTOMULTIWAVE presets.txt" that the owner exported from the plug-in (EXPORT in the preset browser): for every factory preset its current name, its original name ("Factory:"),
// "Adjusted: yes/no", "Deleted: yes", "Stars: N" (1-10) and the parameters that differ from the defaults; the user bank; the order of the lists. This module parses it and, run alone,
// prints a summary: the ratings by value, the adjusted presets with what he changed, the deleted ones, the user bank.
//   node tools/review_export.js "<path to the exported file>"            summary
//   node tools/review_export.js "<file>" --write tools/ratings_owner2.js   writes the ratings (by number, or by name for the TOP Sounds) and the adjusted presets as a module
//   const { parseExport, fullValues } = require('./review_export.js')
'use strict';
const fs = require('fs');
const SPEC = require('../web/js/spec.js');
const KEYS = new Map(SPEC.PARAMS.map((p, i) => [p.key, i]));

// -> { factory: [{ name, orig, adjusted, deleted, stars (undefined = not rated), params: {key: number} }], user: [{ section, name, from, stars, params }], lists: ... }
function parseExport(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = { factory: [], user: [], header: lines.slice(0, 8).join('\n') };
  let part = 0, cur = null, section = '';
  for (const raw of lines) {
    if (raw.startsWith('######## ')) { part = /FACTORY/.test(raw) ? 1 : /USER BANK/.test(raw) ? 2 : 3; cur = null; continue; }
    if (part === 3) continue;
    let m;
    if (part === 2 && (m = /^== (.*) ==$/.exec(raw))) { section = m[1]; continue; }
    if (part === 1 && /^== /.test(raw)) continue;
    if ((m = /^Preset: (.*)$/.exec(raw))) {
      cur = { name: m[1], orig: m[1], adjusted: false, deleted: false, stars: undefined, params: {}, section, from: '' };
      (part === 1 ? out.factory : out.user).push(cur); continue;
    }
    if (!cur) continue;
    if ((m = /^Factory: (.*)$/.exec(raw))) cur.orig = m[1];
    else if ((m = /^From: (.*)$/.exec(raw))) cur.from = m[1];
    else if ((m = /^Adjusted: (yes|no)/.exec(raw))) cur.adjusted = m[1] === 'yes';
    else if (/^Deleted: yes/.test(raw)) cur.deleted = true;
    else if ((m = /^Stars: (\d+)/.exec(raw))) cur.stars = +m[1];
    else if ((m = /^\s+([a-z0-9_]+): (-?[\d.]+(?:e[-+]?\d+)?)\b/i.exec(raw)) && KEYS.has(m[1])) cur.params[m[1]] = +m[2];
  }
  return out;
}
// the 175 values of a block: the defaults, then the lines
const fullValues = (params) => SPEC.PARAMS.map(p => (params[p.key] !== undefined ? params[p.key] : p.def));

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/review_export.js <exported presets file>'); process.exit(1); }
  const e = parseExport(file);
  console.log(e.header.split('\n')[5]);
  const hist = {}; let rated = 0;
  for (const p of e.factory) if (p.stars !== undefined) { hist[p.stars] = (hist[p.stars] || 0) + 1; rated++; }
  console.log('factory blocks', e.factory.length, 'rated', rated, 'by stars (1-10):', JSON.stringify(hist));
  const byName = new Map(SPEC.PRESETS.map((p, i) => [p.name, i]));
  console.log('\nadjusted:');
  for (const p of e.factory.filter(q => q.adjusted)) {
    const i = byName.get(p.orig);
    const base = i === undefined ? null : SPEC.PRESETS[i].values, now = fullValues(p.params);
    const diff = [];
    if (base) SPEC.PARAMS.forEach((q, k) => { if (Math.abs(now[k] - base[k]) > 1e-9 * Math.max(1, Math.abs(base[k]))) diff.push(`${q.key} ${+base[k].toFixed(4)}->${+now[k].toFixed(4)}`); });
    console.log(`  ${p.name}${p.name !== p.orig ? ' (was ' + p.orig + ')' : ''}  stars ${p.stars}  changed ${diff.length}: ${diff.slice(0, 8).join(', ')}${diff.length > 8 ? ' ...' : ''}`);
  }
  console.log('\ndeleted:', e.factory.filter(p => p.deleted).map(p => p.name).join(' | ') || 'none');
  console.log('user bank:', e.user.length, e.user.slice(0, 10).map(p => `${p.name} [${p.section}] from ${p.from} stars ${p.stars}`).join(' | '));
  const renamed = e.factory.filter(p => p.name !== p.orig);
  console.log('renamed:', renamed.length, renamed.slice(0, 5).map(p => p.orig + ' -> ' + p.name).join(' | '));
}
// --write <module>: { numbers: { 501: 8, ... }, names: { 'A · Warm Pad': 7 }, adjusted: { '1101 A1A2 · Bloom of Soft': { v_unison: 3 } } } (the adjusted presets: only the parameters he changed, against the preset of this version)
if (require.main === module && process.argv.includes('--write')) {
  const out = process.argv[process.argv.indexOf('--write') + 1], e = parseExport(process.argv[2]);
  // --baseline <spec.js>: the values shipped in the version the owner rated (a preset he adjusted is compared with them; his master volume is kept as a delta, 'master_delta')
  const BASE = process.argv.includes('--baseline') ? require(require('path').resolve(process.argv[process.argv.indexOf('--baseline') + 1])) : SPEC;
  const byName = new Map(BASE.PRESETS.map((p, i) => [p.name, i]));
  const numbers = {}, names = {}, adjusted = {};
  for (const p of e.factory) {
    const n = parseInt(p.orig, 10);
    if (p.stars !== undefined && p.stars > 0) { if (n) numbers[n] = p.stars; else names[p.orig] = p.stars; }
    const i = byName.get(p.orig);
    if (p.adjusted && i !== undefined) {
      const now = fullValues(p.params), base = BASE.PRESETS[i].values, d = {};
      SPEC.PARAMS.forEach((q, k) => { if (Math.abs(now[k] - base[k]) > 1e-9 * Math.max(1, Math.abs(base[k]))) { if (q.key === 'master') d.master_delta = +(now[k] - base[k]).toFixed(4); else d[q.key] = now[k]; } });
      if (Object.keys(d).length) adjusted[p.orig] = d;
    }
  }
  const saved = (/Saved: (\S+ \S+)/.exec(e.header) || [])[1];
  const text = [
    '// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)',
    '// SPDX-License-Identifier: GPL-3.0-or-later',
    '// GENERATED by tools/review_export.js --write from the presets file the owner exported on ' + saved + " (his second listening, with the preset browser's stars: 1-10):",
    '// the ratings of the presets by number (by name for the TOP Sounds) and the presets he adjusted (only the parameters he changed).',
    "'use strict';",
    'module.exports = ' + JSON.stringify({ numbers, names, adjusted }, null, 1) + ';',
    ''].join('\n');
  fs.writeFileSync(out, text);
  console.log('written', out, Object.keys(numbers).length, 'numbered ratings,', Object.keys(names).length, 'by name,', Object.keys(adjusted).length, 'adjusted');
}
module.exports = { parseExport, fullValues };
