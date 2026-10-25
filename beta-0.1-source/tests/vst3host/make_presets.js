// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// make_presets.js - exports the factory presets of tools/spec.js for vst3host.exe --presets <file>.
//
//   node tests/vst3host/make_presets.js [out.txt]     (default: tests/vst3host/presets_spec.txt)
//
// Format (tab separated, UTF-8):
//   default <TAB> <DEFAULT_PRESET name>
//   preset <TAB> <index> <TAB> <name> <TAB> id=plain;id=plain;...   (all parameters: spec default + preset value)
// ParamID = index in spec PARAMS (append-only order). Plain values are converted to normalized by the
// host through the plug-in's own IEditController::plainParamToNormalized.
'use strict';
const fs = require('fs');
const path = require('path');
const spec = require(path.join(__dirname, '..', '..', 'tools', 'spec.js'));
const out = process.argv[2] || path.join(__dirname, 'presets_spec.txt');
const lines = [];
// DEFAULT_PRESET may be a preset name or an index
const defName = typeof spec.DEFAULT_PRESET === 'number' ? (spec.PRESETS[spec.DEFAULT_PRESET] || {}).name : spec.DEFAULT_PRESET;
if (defName) lines.push(`default\t${defName}`);
spec.PRESETS.forEach((pr, i) => {
  const vals = spec.PARAMS.map((p, id) => `${id}=${p.key in pr.v ? pr.v[p.key] : p.def}`);
  lines.push(`preset\t${i}\t${pr.name}\t${vals.join(';')}`);
});
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`make_presets: ${spec.PRESETS.length} presets, ${spec.PARAMS.length} parameters -> ${out}`);
