// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the RATE THE DEMO test version of the web app (version 1.0.13: the owner rates the presets of the demo while it plays; see tools/rate/rate.js): a copy of web/ plus the rating module,
// its style and a "Rate the demo presets" box in the welcome window.
//   node tools/make_rate_build.js [outdir]      default tools/out/rate_build
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'rate_build'));
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw new Error('not unique / missing: ' + a.slice(0, 70)); return s.replace(a, () => b); };

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'web'), OUT, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'rate', 'rate.js'), path.join(OUT, 'js', 'rate.js'));
fs.copyFileSync(path.join(__dirname, 'rate', 'rate.css'), path.join(OUT, 'css', 'rate.css'));

let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'); const crlf = html.includes('\r\n'); html = html.replace(/\r\n/g, '\n');
html = rep(html, '<link rel="stylesheet" href="css/synth.css">', '<link rel="stylesheet" href="css/synth.css">\n<link rel="stylesheet" href="css/rate.css">');
html = rep(html, '<script src="js/app.js"></script>', '<script src="js/rate.js"></script>\n<script src="js/app.js"></script>');
html = rep(html, '    <div class="choices">\n', `    <div class="choices">
      <button id="w-rate" class="choice learn rate">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        <span><b>Rate the demo presets</b><small>Test version: the demo plays each preset 4 times on its phrase and you give it 1 to 10 stars meanwhile (5 s back and pause to change your mind). The good ones of the second half come to the start in place of the ones under 5.</small></span>
      </button>
`);
html = html.replace(/<title>([^<]*)<\/title>/, (m, t) => `<title>${t} - rate the demo (test)</title>`);
fs.writeFileSync(path.join(OUT, 'index.html'), crlf ? html.replace(/\n/g, '\r\n') : html);

fs.writeFileSync(path.join(OUT, 'RATE-TEST.md'), `# OktoWave - rate the demo (test version)

A test copy of the web app to put the best sounds at the start of the demo (it is not a release). Open it, click **Rate the demo presets** (or **★ RATE** in the header), then **Play the demo**.

- Each preset plays **its phrase of the piece 4 times** (about 14 s; the bar says "loop 2 / 4"). While it plays, give it **1 to 10 stars** in the bar at the bottom (click, or press 1 to 9 and 0 for 10). **⏪ 5 s** goes back 5 seconds (the part before plays again and its stars can be changed), **Pause** stops the music where it is.
- At the end (or **Stop**): the ratings (they can still be changed) and the **new order**: in the first half of the demo (parts 1 to 15) a preset rated **under 5** changes places with a preset of the second half (parts 16 to 30) rated **above 5**, the best rated first. 5 and not rated stay.
- **Listen to the new demo**, then **Accept**.
- **Send report** posts the ratings and the new order to the feedback Google Form; **Copy** and **Download** keep the same text.

The ratings are kept in this browser. Made by tools/make_rate_build.js from the OktoWave sources.
`);
const n = fs.readdirSync(OUT, { recursive: true }).length;
console.log(`rate build: ${OUT} (${n} entries)`);
