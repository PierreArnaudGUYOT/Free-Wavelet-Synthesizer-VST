// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// check_params.js - compares the parameter table reported by the VST3 plug-in
// (params.csv written by vst3host.exe) with tools/spec.js (single source of truth).
//
//   node tests/vst3host/check_params.js [path/to/params.csv]   (default: tests/vst3host/out/params.csv)
//
// Checks per ParamID (= index in spec PARAMS): title, plain min/max/default
// (normalizedParamToPlain at 0, 1, default), stepCount for choice/int params, hidden flag.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const csvPath = process.argv[2] || path.join(__dirname, 'out', 'params.csv');
const spec = require(path.join(ROOT, 'tools', 'spec.js'));

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const f = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { f.push(cur); cur = ''; } else cur += c;
    }
    f.push(cur);
    rows.push(f);
  }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

if (!fs.existsSync(csvPath)) {
  console.log(`check_params: ${csvPath} not found - run vst3host.exe first (its Parameters section writes params.csv)`);
  process.exit(2);
}
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const byId = new Map(rows.map((r) => [Number(r.id), r]));
const problems = [], warnings = [];
const close = (a, b) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));
spec.PARAMS.forEach((p, id) => {
  const r = byId.get(id);
  if (!r) { problems.push(`id ${id} (${p.key} '${p.name}') missing in the plug-in`); return; }
  if (r.title !== p.name) problems.push(`id ${id} ${p.key}: title '${r.title}' != spec '${p.name}'`);
  const lo = Number(r.plainAt0), hi = Number(r.plainAt1), def = Number(r.plainAtDefault);
  if (!close(lo, p.min) || !close(hi, p.max)) problems.push(`id ${id} ${p.key}: plain range ${lo}..${hi} != spec ${p.min}..${p.max}`);
  if (!close(def, p.def)) problems.push(`id ${id} ${p.key}: default ${def} != spec ${p.def}`);
  const steps = Number(r.stepCount);
  const want = p.curve === 'choice' ? p.choices.length - 1 : p.curve === 'int' ? p.max - p.min : 0;
  if (steps !== want) (want ? problems : warnings).push(`id ${id} ${p.key}: stepCount ${steps}, expected ${want}`);
  const hidden = /hidden/.test(r.flagNames);
  if (hidden !== !!p.hidden) problems.push(`id ${id} ${p.key}: hidden=${hidden}, spec hidden=${!!p.hidden}`);
  if (p.curve === 'choice') {
    if (r.stringAt0 !== p.choices[0] && r.stringAt0 !== p.choiceShort?.[0]) warnings.push(`id ${id} ${p.key}: string at 0 '${r.stringAt0}' vs spec '${p.choices[0]}'`);
    if (r.stringAt1 !== p.choices[p.choices.length - 1] && r.stringAt1 !== p.choiceShort?.[p.choices.length - 1])
      warnings.push(`id ${id} ${p.key}: string at 1 '${r.stringAt1}' vs spec '${p.choices[p.choices.length - 1]}'`);
  }
});
for (const r of rows) if (Number(r.id) >= spec.PARAMS.length) warnings.push(`id ${r.id} '${r.title}' is not in tools/spec.js`);

console.log(`check_params: ${rows.length} plug-in parameters vs ${spec.PARAMS.length} in tools/spec.js (${csvPath})`);
for (const p of problems) console.log('  [FAIL] ' + p);
for (const w of warnings) console.log('  [WARN] ' + w);
console.log(problems.length ? `RESULT: FAIL (${problems.length})` : `RESULT: PASS${warnings.length ? ` (${warnings.length} warnings)` : ''}`);
process.exit(problems.length ? 1 : 0);
