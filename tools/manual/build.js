// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the user manuals web/manual/manual-a.html (subtractive oscillators A1 A2) and manual-b.html (additive B1), and the SVG figures in
// web/manual/img/, from the single source of truth (tools/spec.js -> web/js/spec.js) and the DSP
// reference (web/js/core.js). Ranges, defaults, host names, preset tables, sparsity counts and
// all plots are computed, never typed by hand.
//
// Usage:  node tools/manual/build.js [a] [b]      (default: both manuals)
// Run `node tools/gen_spec.js` first if tools/spec.js changed.
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib.js');            // also generates the SVG figures (figs.js)
const OUT = path.join(L.ROOT, 'web', 'manual');

const which = process.argv.slice(2).filter(x => /^[ab]$/i.test(x)).map(x => x.toLowerCase());
for (const m of (which.length ? which : ['a', 'b'])) {
  const html = L.page(require('./mw.js').manual(m));
  fs.writeFileSync(path.join(OUT, 'manual-' + m + '.html'), html);
  console.log('manual-' + m + '.html', (html.length / 1024).toFixed(0) + ' kB');
}
