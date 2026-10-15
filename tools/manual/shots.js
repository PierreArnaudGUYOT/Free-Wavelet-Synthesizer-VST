// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Re-captures the UI screenshots used by the manuals (web/manual/img/*.png) with headless Edge.
// Run after a change to the panel layout or look, then check the numbered callouts
// (the `pins` arrays in engA.js / engB.js use panel coordinates from tools/spec.js).
//
// Usage:  node tools/manual/shots.js        (set EDGE=<path to msedge.exe> if it is not in the default place)
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { capture } = require('./cdp.js');
const SPEC = require(path.join(path.resolve(__dirname, '..', '..'), 'web', 'js', 'spec.js'));
const pre = name => { const k = SPEC.PRESETS.findIndex(p => p.name === name); if (k < 0) throw new Error('no preset ' + name); return k; };

const ROOT = path.resolve(__dirname, '..', '..');
const IMG = path.join(ROOT, 'web', 'manual', 'img');
const APP = pathToFileURL(path.join(ROOT, 'web', 'index.html')).href;
// The 1100 x 720 panel is drawn at scale 1 in a 1124 x 782 window (12 px margin, 38 px status bar).
// Clips are in CSS pixels of that window: panel coordinate + 12.
const TOP = { x: 20, y: 64, width: 1084, height: 268 };      // ENGINE section + SCOPE · SCALOGRAM
const set = o => Object.entries(o).map(([k, v]) => `WS_TEST.setParam('${k}', ${v});`).join('');

const jobs = [
  { url: `${APP}#noaudio&preset=${pre('A · Edge Pluck')}`, out: 'panel-a.png' },
  { url: `${APP}#noaudio&preset=${pre('B · Random Glass')}`, out: 'panel-b.png' },
  { url: `${APP}#noaudio&preset=${pre('A · Init')}`, eval: set({ a_wave: 1, wavelet: 0, f_cutoff: 12 }), wait: 500, clip: TOP, out: 'haar-square.png' },
  { url: `${APP}#noaudio&preset=${pre('A · Init')}`, eval: set({ a_wave: 1, wavelet: 6, f_cutoff: 12 }), wait: 500, clip: TOP, out: 'db20-square.png' },
  { url: `${APP}#noaudio&preset=${pre('A · Init')}`, eval: set({ a_wave: 0, wavelet: 3, a_sparsity: 0.5, f_cutoff: 12 }), wait: 500, clip: TOP, out: 'sparse-saw.png' },
  { url: `${APP}#noaudio&preset=${pre('B · Octave Organ')}`, clip: TOP, out: 'organ.png' },
  { url: `${APP}#noaudio&preset=${pre('B · Focus Sweep')}`, clip: TOP, out: 'focus-sweep.png' },
  { url: `${APP}#noaudio`, eval: "document.querySelector('.presets .pname').click();", clip: { x: 570, y: 14, width: 316, height: 560 }, out: 'presets-menu.png' },
  { url: `${APP}`, clip: { x: 157, y: 300, width: 810, height: 150 }, out: 'start-overlay.png' },
  // the ▾ demo menu (opens without starting audio)
  { url: `${APP}#noaudio`, eval: "document.querySelector('.demo-arrow').click();", wait: 400, clip: { x: 226, y: 18, width: 384, height: 344 }, out: 'demo-menu.png' },
  // the default DEMO (preset tour) about 9.5 s in (4 s per preset), on its third preset; the panel only, without the status bar
  { url: `${APP}#noaudio`, eval: '(async () => { await WS_TEST.start(); WS_TEST.demoStart(); await new Promise(r => setTimeout(r, 9500)); })()',
    clip: { x: 0, y: 0, width: 1124, height: 744 }, after: 'WS_TEST.demoStop()', out: 'demo.png' },
].map(j => Object.assign({ w: 1124, h: 782, dsf: 1.5 }, j, { out: path.join(IMG, j.out) }));

capture(jobs).catch(e => { console.error(e); process.exit(1); });
