// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Re-captures the UI screenshots used by the manuals (web/manual/img/*.png) with headless Edge.
// Run after a change to the panel layout or look, then check the numbered callouts
// (the `pins` of tools/manual/mw.js use panel coordinates from tools/spec.js).
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
// The 1100 x 1050 panel (Okto MultiWave Synth beta 0.3: three folder tabs, the plate, the FILTER row and the PLAY card) is drawn at scale 1 in a 1124 x 1112 window (12 px margin, 38 px status bar); "#nobrowser" leaves the
// preset browser (beta 0.3) out, so the panel alone fills the window.
// Clips are in CSS pixels of that window: panel coordinate + 12.
const TOP = { x: 14, y: 58, width: 1096, height: 318 };      // the top: the folder tabs, the oscillator's card + OSC MIX + SCOPE (scope and scalogram)
// the welcome window (640 px wide, centred; about 298 px high) with a 20 px margin of the dimmed panel around it
const WELCOME = { x: 222, y: 309, width: 680, height: 338 };
const set = o => Object.entries(o).map(([k, v]) => `WS_TEST.setParam('${k}', ${v});`).join('');
// every parameter at its default (A1 alone at 100 %): there is no Init preset in Okto MultiWave Synth
const NEUTRAL = "WS_SPEC.PARAMS.filter(p => !p.hidden).forEach(p => WS_TEST.setParam(p.key, p.def));";
const presetOf = title => SPEC.PRESETS.findIndex(p => p.name === title || p.name.split(' · ').slice(1).join(' · ') === title);

const jobs = [
  { url: `${APP}#nobrowser&noaudio&preset=${pre('A · Warm Pad')}`, out: 'panel-a.png' },
  { url: `${APP}#nobrowser&noaudio&preset=${pre('B · Choir Pad')}`, out: 'panel-b.png' },
  { url: `${APP}#nobrowser&noaudio`, eval: NEUTRAL + set({ a_wave: 1, wavelet: 0, f_cutoff: 12 }), wait: 500, clip: TOP, out: 'haar-square.png' },
  { url: `${APP}#nobrowser&noaudio`, eval: NEUTRAL + set({ a_wave: 1, wavelet: 6, f_cutoff: 12 }), wait: 500, clip: TOP, out: 'db20-square.png' },
  { url: `${APP}#nobrowser&noaudio`, eval: NEUTRAL + set({ a_wave: 0, wavelet: 3, a_sparsity: 0.5, f_cutoff: 12 }), wait: 500, clip: TOP, out: 'sparse-saw.png' },
  { url: `${APP}#nobrowser&noaudio&preset=${pre('B · Theatre Organ')}`, clip: TOP, out: 'organ.png' },
  { url: `${APP}#nobrowser&noaudio&preset=${pre('B · Focus Sweep')}`, clip: TOP, out: 'focus-sweep.png' },
  // the preset list with ★ TOP SOUNDS folded and the Keys group open, scrolled to its top
  { url: `${APP}#nobrowser&noaudio`, eval: "document.querySelector('.presets .pname').click(); { const m = document.querySelector('.pmenu');" +
    " const g = m && m.querySelector('.grp.fold.open'); if (g) g.click();" +
    " const k = m && [...m.querySelectorAll('.grp.fold')].find(x => /KEYS/.test(x.textContent)); if (k && !k.classList.contains('open')) k.click();" +
    " if (m) m.scrollTop = 0; }",
    clip: { x: 388, y: 14, width: 316, height: 560 }, out: 'presets-menu.png' },
  // the page without #noaudio opens on the welcome window
  { url: `${APP}#nobrowser`, clip: WELCOME, out: 'start-overlay.png' },
  // the DEMO (preset tour) about 9.5 s in (4 s per preset), on its third preset; the panel only, without the status bar
  { url: `${APP}#nobrowser&noaudio`, eval: '(async () => { await WS_TEST.start(); WS_TEST.demoStart(); await new Promise(r => setTimeout(r, 9500)); })()',
    clip: { x: 0, y: 0, width: 1124, height: 1074 }, after: 'WS_TEST.demoStop()', out: 'demo.png' },
  // the CHORD KEYBOARD card (CHORD MODE on: the panel is 120 px taller) with G major 7 held (FOLDED) and a string of the strum plate touched
  { url: `${APP}#nobrowser&noaudio`, h: 1232, eval: "(async () => { await WS_TEST.start(); WS_TEST.setParam('chord_mode', 1); WS_TEST.setParam('chord_type', 4); WS_TEST.noteOn(67, 0.9); WS_TEST.plateOn(83, 0.8); await new Promise(r => setTimeout(r, 700)); })()",
    clip: { x: 20, y: 1060, width: 1084, height: 112 }, after: 'WS_TEST.allNotesOff()', out: 'chord-card.png' },
  // the keyboard row with CHORD MODE on: the selector octave C3–B3 tinted
  { url: `${APP}#nobrowser&noaudio`, h: 1232, eval: "WS_TEST.setParam('chord_mode', 1);", wait: 500,
    clip: { x: 330, y: 934, width: 780, height: 118 }, out: 'chord-keys.png' },
].map(j => Object.assign({ w: 1124, h: 1112, dsf: 1.5 }, j, { out: path.join(IMG, j.out) }));

capture(jobs).catch(e => { console.error(e); process.exit(1); });
