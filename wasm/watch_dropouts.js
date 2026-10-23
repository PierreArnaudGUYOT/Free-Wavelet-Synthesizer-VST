// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: prints each result of wasm/dropouts_all.js as it lands (wasm/out/logs/dropouts_<k>_*.txt), exits when its summary is written.
//   node wasm/watch_dropouts.js
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'out', 'logs'), seen = new Set();
const t0 = Date.now();
// (only the files of this run: written after the watch started, or the summary of this run)
const fresh = f => { try { return fs.statSync(path.join(dir, f)).mtimeMs >= t0 - 3600000; } catch (_) { return false; } };
setInterval(() => {
  let files = [];
  try { files = fs.readdirSync(dir); } catch (_) { return; }
  for (const f of files.filter(x => /^dropouts_\d+_/.test(x)).sort()) {
    if (seen.has(f) || !fresh(f)) continue;
    seen.add(f);
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = /TOTAL: .*/.exec(txt);
    console.log(`${f}: ${m ? m[0] : 'no TOTAL line: ' + txt.trim().split('\n').slice(-1)[0]}`);
  }
  if (files.includes('dropouts_summary.txt') && fresh('dropouts_summary.txt')) { console.log('summary written'); process.exit(0); }
}, 5000);
