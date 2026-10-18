// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// test_demo.js - tests the web app's DEMO split button in headless Edge.
//
//   node tests/web/test_demo.js [--url URL] [--out DIR] [--file-access] [--smoke]
//
// UI: `.demo-btn` ("▶ DEMO") plays the DEFAULT demo (song 0) and shows "■ STOP" while running;
// `.demo-arrow` ("▾") opens `.demo-menu` (songs + "Load a MIDI file…", the default song tagged DEFAULT).
// By default Edge runs WITHOUT --allow-file-access-from-files (like a normal browser opening file://).
// Data-driven: songs come from WS_TEST.demoSongs() and are looked up by title; presets by name.
// - Default demo = PRESET TOUR (demoState().preset defined): the agreed sequence EXPECTED_TOUR (OktoPierre's
//   favourites first), a change every ~4 s on a chord (WS_TEST.demoTour gives the times), with Voices 16, Octave 0,
//   Glide 0 and Amp Attack capped at 0.08 s forced; all other values must equal the spec preset. Played from a cold
//   start via `.demo-btn`, to the end (full mode).
// - Toccata (looked up by title): the agreed scene schedule (SCHED) over the first 30 s.
// - Every other song: starts, sounds, monotonic scenes, the varied parameter moves, stop restores exactly.
// - Stop paths (header STOP, window STOP, Esc), user MIDI files, non-MIDI error, Ctrl+click reset.
// - Welcome window (beta 0.6): 'Run the demo' from a cold start plays the default demo; when another tab takes the audio,
//   the window comes back with the reason, and its 'Play the synth' / 'Run the demo' take the audio back (lifecycle).
// --smoke: welcome 'Run the demo', menu via the arrow, default tour from a cold start for 4 preset changes, header STOP
//          restore, another song from the arrow menu + Esc restore, hostile MIDI files, lifecycle (about 2 min).
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('./cdp');

const ROOT = path.resolve(__dirname, '..', '..');
const opt = { url: null, out: path.join(__dirname, 'out_demo'), fileAccess: false, smoke: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--url') opt.url = process.argv[++i];
  else if (a === '--out') opt.out = path.resolve(process.argv[++i]);
  else if (a === '--file-access') opt.fileAccess = true;
  else if (a === '--smoke') opt.smoke = true;
  else { console.log('usage: node test_demo.js [--url URL] [--out DIR] [--file-access] [--smoke]'); process.exit(64); }
}
const URL0 = opt.url || pathToFileURL(path.join(ROOT, 'web', 'index.html')).href;
const SPEC = require(path.join(ROOT, 'tools', 'spec.js'));
if (typeof SPEC.DEFAULT_PRESET === 'number') SPEC.DEFAULT_PRESET = (SPEC.PRESETS[SPEC.DEFAULT_PRESET] || {}).name;
const SPEC_BY_KEY = Object.fromEntries(SPEC.PARAMS.map((p) => [p.key, p]));
const presetValues = (name) => {
  const pr = SPEC.PRESETS.find((p) => p.name === name);
  return pr ? Object.assign({}, ...SPEC.PARAMS.map((p) => ({ [p.key]: p.def })), pr.v) : null;
};

// Agreed scene schedule of the Bach Toccata
const SCHED = [
  { t: 0, param: 'wavelet', steps: [[0, 6], [2, 4], [4, 0]] },
  { t: 6, param: 'b_tilt', ramp: [6, 9.4, -12, 1] },
  { t: 11.5, param: 'f_cutoff', ramp: [11.75, 17.5, 1.5, 10] },
  { t: 19.5, param: 'f_res', ramp: [19.75, 25.5, 0, 18] },
  { t: 27.5, param: 'f_slope', ramp: [27.75, 38, 6, 72] },
  { t: 38.6, param: 'a_wave', steps: [[38.6, 1], [41.1, 2], [43.6, 3]] },
  { t: 45.5, param: 'p_depth', ramp: [45.75, 51, 0, 1] },
  { t: 59.8, param: 'a_sparsity', ramp: [60, 68, 0, 0.92] },
  { t: 68.8, param: 'b_pattern', steps: [[68.8, 0], [73.3, 1], [76.9, 3], [80.6, 5]] },
  { t: 85.5, param: 'drawbars', wave: [86, 105.5] },
  { t: 105.6, param: 'fx_rmix', ramp: [106, 117.5, 0.25, 0.6] },
];
const TOL_T = 0.3; // s: scene clock vs. parameter update (rAF) tolerance
const TOUR_STEP = 4; // s per preset in the tour (TOL_T = 0.3 s leaves a 3.4 s checked window per preset)
const TOUR_START = 'B · Clarinet'; // first preset of the tour (the opening chords of the piece are cut)
// the agreed preset sequence of the default demo (beta 0.5): Clarinet, the first eleven TOP Sounds, then beta 0.2 presets
// (the five left out in beta 0.5 replaced by kept sounds of the same type)
const EXPECTED_TOUR = ['B · Clarinet', 'B · Mirror Sub Bass', 'A · Mirror Sub Bass Shift', 'B · Theatre Organ',
  'A · Wave Riser Shift', 'A · Noise Wash Pad', 'A · Wave Atom Choir Shift', 'A · Siren Sweep', 'A · Focus Sweep Shift',
  'B · Space Choir', 'A · Wave Wobble Bass Shift', 'A · Wavelet Lead', 'A · String Machine',
  'AB · Analog Strings', 'A · Ladder Bass', 'AB · Dream Pad', 'B · Ensemble Organ', 'AB · Bell Pad', 'A · Reese Sub',
  'A · Solina Cellos', 'AB · Wavelet Choir', 'A · Wave Wobble Bass', 'AB · Hybrid Keys', 'A · Poly Chorus Pad',
  'AB · Organ Lead', 'A · Acid Sub', 'B · Glass Ensemble', 'AB · Silk Strings', 'AB · Wobble Bass', 'A · Chorus Square Lead'];
// base preset of the Toccata scenes (label shows it with the modified dot)
const TOC_PRESETS = [[0, 'B · Octave Organ'], [11.5, 'A · Init'], [68.8, 'B · Init'], [105.6, 'B · Octave Organ']];
const FORCED = { v_voices: 16, v_oct: 0, v_glide: 0 }; // + caps: amp_a <= 0.08, fx_dmix <= 0.1, fx_dfb <= 0.3
const CAPS = { amp_a: 0.08, fx_dmix: 0.1, fx_dfb: 0.3 };

// ------------------------------------------------------------------ report
const lines = [], results = [];
let section = 'startup';
const log = (s = '') => { console.log(s); lines.push(s); };
const rec = (sev, name, detail = '') => { results.push({ sev, section, name, detail }); log(`  [${sev}] ${name}${detail ? '  -- ' + detail : ''}`); };
const check = (ok, name, detail = '', failSev = 'FAIL') => { rec(ok ? 'PASS' : failSev, name, detail); return ok; };
const begin = (n) => { section = n; log(''); log(`=== ${n} ===`); };
const short = (a, m = 8) => (a.length > m ? a.slice(0, m).join('; ') + `; ... (${a.length} total)` : a.join('; '));
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

let B, DEV;
const ev = (e, t) => B.evaluate(e, t);

async function snapshotAll() {
  return ev(`({ vals: Object.fromEntries(WS_TEST.paramKeys().map(k => [k, WS_TEST.getParam(k)])),
    label: (document.querySelector('.presets .pname') || {}).innerHTML || '' })`);
}
function diffVals(a, b) {
  const d = [];
  for (const k of Object.keys(a.vals)) if (!(Math.abs(a.vals[k] - b.vals[k]) <= 1e-9)) d.push(`${k}: ${a.vals[k]} -> ${b.vals[k]}`);
  return d;
}
async function deviceRect() {
  return ev(`(() => { const d = document.getElementById('device'); if (!d) return null; const r = d.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
}
const P = (x, y) => [DEV.x + (x * DEV.w) / 1100, DEV.y + (y * DEV.h) / 720];
async function rectOf(sel, index = 0) {
  return ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${index}]; if (!e) return null; const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, text: e.textContent.trim(),
      visible: r.width > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' }; })()`);
}

const SNAP_EXPR = `(() => { const s = WS_TEST.demoState(); const l = WS_TEST.getLevel();
  const keys = ['wavelet','b_tilt','f_cutoff','f_res','f_slope','a_wave','p_depth','a_sparsity','b_pattern','fx_rmix'];
  for (let b = 1; b <= 11; b++) keys.push('b_bar' + b);
  const v = {}; for (const k of keys) v[k] = WS_TEST.getParam(k);
  let pv = null; if (s.running && s.param && !s.preset) { const k = s.param === 'drawbars' ? 'b_bar1' : s.param; if (WS_TEST.paramKeys().includes(k)) pv = WS_TEST.getParam(k); }
  const all = s.running && s.preset ? Object.fromEntries(WS_TEST.paramKeys().map(k => [k, WS_TEST.getParam(k)])) : null;
  const q = (c) => { const e = document.querySelector(c); return e ? e.textContent.trim() : null; };
  const w = document.querySelector('.demo-win');
  return { s, v, pv, all, lv: Math.max(l.peakL, l.peakR), hot: document.querySelectorAll('.hot').length,
    sec: q('.dw-sec'), param: q('.dw-param'), val: q('.dw-val'), btn: q('.demo-btn'), win: !!w && getComputedStyle(w).display !== 'none',
    lbl: (() => { const n = document.querySelector('.presets .pname'); if (!n) return null; const sp = n.querySelector('span');
      return { name: (sp ? sp.textContent : n.textContent).trim(), dirty: !!n.querySelector('.dirty') }; })() }; })()`;

async function waitStopped(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { if (!(await ev('WS_TEST.demoState()')).running) return true; await sleep(100); }
  return false;
}
async function waitDemoTime(tSec, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const s = await ev('WS_TEST.demoState()'); if (s.running && s.time >= tSec) return s; await sleep(50); }
  return null;
}
async function checkRestored(base, how) {
  await sleep(300);
  const after = await snapshotAll();
  const d = diffVals(base, after);
  check(d.length === 0, `${how}: every parameter restored exactly`, short(d));
  check(after.label === base.label, `${how}: preset label restored`, `'${after.label}' vs '${base.label}'`);
  const ui = await ev(`({ btn: (document.querySelector('.demo-btn') || {}).textContent, hot: document.querySelectorAll('.hot').length,
    win: (() => { const w = document.querySelector('.demo-win'); return !!w && getComputedStyle(w).display !== 'none'; })() })`);
  check(/DEMO/.test(ui.btn) && ui.hot === 0 && !ui.win, `${how}: UI back to idle ('▶ DEMO', no hot controls, window hidden)`, JSON.stringify(ui));
}
async function follow(maxSec, onSample) {
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < (maxSec + 20) * 1000) {
    const s = await ev(SNAP_EXPR);
    samples.push(s);
    if (!s.s.running) break;
    if (s.s.time >= maxSec) break;
    if (onSample) await onSample(s);
    await sleep(200);
  }
  return samples;
}
async function openMenu() {
  const a = await rectOf('.demo-arrow');
  if (!a) return null;
  await B.click(a.x, a.y);
  await sleep(300);
  return ev(`(() => { const m = document.querySelector('.demo-menu'); if (!m) return null;
    return { items: [...m.querySelectorAll('.it')].map(e => e.textContent.trim()), visible: getComputedStyle(m).display !== 'none' }; })()`);
}
async function chooseFromMenu(title, songs) {
  const menu = await openMenu();
  if (!menu) return false;
  const idx = songs.findIndex((s) => s.title === title);
  const r = await rectOf('.demo-menu .it', idx);
  if (!r) return false;
  await B.click(r.x, r.y);
  return true;
}

// ------------------------------------------------------------------ checks
function songChecks(name, song, samples, full) {
  const run = samples.filter((x) => x.s.running);
  const titles = [...new Set(run.map((x) => x.s.song))];
  check(titles.length === 1 && titles[0] === song.title, `${name}: demoState().song is the song title`, JSON.stringify(titles));
  const nsc = [...new Set(run.map((x) => x.s.scenes))];
  let mono = true, prev = -1, prevT = -1e9;
  const sceneVals = {};
  for (const x of run) {
    if (x.s.scene < prev || x.s.time < prevT - 0.2) mono = false;
    prev = Math.max(prev, x.s.scene);
    prevT = Math.max(prevT, x.s.time);
    if (x.s.time > 0 && x.pv !== null) (sceneVals[x.s.scene] = sceneVals[x.s.scene] || new Set()).add(Math.round(x.pv * 1e6));
  }
  log(`  ${name}: ${nsc.join('/')} scenes; scene time reached ${run.length ? run[run.length - 1].s.time.toFixed(1) : '-'} s`);
  check(mono, `${name}: scene index and scene time never go backwards`);
  const still = Object.entries(sceneVals).filter(([, s]) => s.size < 2).map(([k]) => `scene ${Number(k) + 1} (${run.find((x) => x.s.scene === Number(k)).s.param})`);
  check(still.length === 0 || (!full && still.length === 1 && Object.keys(sceneVals).length <= 2), `${name}: the varied parameter moves in every observed scene`, `no movement in ${still.join(', ')}`);
  check(run.filter((x) => x.s.time > 0.3).every((x) => x.hot >= 1 && (x.param || '').startsWith('Now varying')), `${name}: window shows 'Now varying: …' and a control is marked 'hot'`);
  const badLbl = run.filter((x) => x.s.time > 0.3 && !(x.lbl && x.lbl.dirty && SPEC.PRESETS.some((p) => p.name === x.lbl.name))).map((x) => `t=${x.s.time.toFixed(1)} ${JSON.stringify(x.lbl)}`);
  check(badLbl.length === 0, `${name}: preset label shows the scene's base preset with the modified dot`, short(badLbl));
  const maxLv = Math.max(0, ...run.map((x) => x.lv));
  const lv = run.filter((x) => x.s.time > 1).map((x) => x.lv);
  check(maxLv <= 1.0, `${name}: no output level above 1.0`, `max ${maxLv}`);
  check(lv.filter((v) => v > 0.001).length / Math.max(1, lv.length) > 0.8, `${name}: sounds while playing`, `${lv.filter((v) => v > 0.001).length}/${lv.length} samples above -60 dBFS`, 'WARN');
  if (full) {
    const maxScene = Math.max(...run.map((x) => x.s.scene));
    check(maxScene === nsc[0] - 1, `${name}: progresses through all scenes to the last one`, `reached scene ${maxScene + 1} of ${nsc[0]}`);
  }
}

// The tour plan itself (independent of the player): the agreed sequence, a change about every TOUR_STEP s.
function planChecks(plan, song) {
  const seq = plan.map((p) => p.preset), gaps = plan.slice(1).map((p, i) => p.t - plan[i].t);
  check(JSON.stringify(seq) === JSON.stringify(EXPECTED_TOUR), `tour plan: the agreed sequence of ${EXPECTED_TOUR.length} presets, from '${TOUR_START}'`,
    seq.map((n, i) => (n === EXPECTED_TOUR[i] ? null : `#${i + 1} '${n}' expected '${EXPECTED_TOUR[i]}'`)).filter(Boolean).slice(0, 3).join('; ') || `${seq.length} presets`);
  check(plan.length > 0 && plan[0].t === 0 && gaps.every((g) => g > TOUR_STEP - 1.5 && g < TOUR_STEP + 1.5) && plan[plan.length - 1].t < song.duration,
    `tour plan: starts at 0 s, then a change every ${TOUR_STEP} ± 1.5 s (on a chord) until the end`,
    `gaps ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)} s, last change ${plan[plan.length - 1].t.toFixed(1)} s of ${song.duration} s`);
}

// Preset tour: at time t the preset of the last plan entry with plan[k].t <= t; all values = spec preset except the forced ones
function tourChecks(name, song, samples, plan, full) {
  const run = samples.filter((x) => x.s.running && x.s.time >= 0);
  const N = plan.length;
  const seen = [], badOrder = [], badVals = [], badText = [], badLbl = [];
  for (const x of run) {
    const t = x.s.time;
    let k = 0;
    for (let i = 0; i < N; i++) if (plan[i].t <= t) k = i;
    if ((k > 0 && Math.abs(t - plan[k].t) < TOL_T) || (k + 1 < N && Math.abs(t - plan[k + 1].t) < TOL_T)) continue;
    const want = plan[k].preset, next = k + 1 < N ? plan[k + 1].preset : null;
    if (!seen.length || seen[seen.length - 1] !== x.s.preset) seen.push(x.s.preset);
    if (x.s.preset !== want) { badOrder.push(`t=${t.toFixed(1)} '${x.s.preset}' expected '${want}'`); continue; }
    const pv = presetValues(want);
    if (pv && x.all) {
      for (const [key, v] of Object.entries(pv)) {
        if (SPEC_BY_KEY[key].hidden) continue;
        let e = key in FORCED ? FORCED[key] : v;
        if (key in CAPS) e = Math.min(v, CAPS[key]);
        if (!(Math.abs(x.all[key] - e) <= 1e-6 * Math.max(1, Math.abs(SPEC_BY_KEY[key].max - SPEC_BY_KEY[key].min)))) { badVals.push(`t=${t.toFixed(1)} ${want}: ${key}=${x.all[key]} expected ${e}`); break; }
      }
    }
    if (!(x.lbl && x.lbl.name === want && !x.lbl.dirty)) badLbl.push(`t=${t.toFixed(1)} label ${JSON.stringify(x.lbl)} expected '${want}' without dot`);
    if (!((x.sec || '').includes('Preset tour') && (x.sec || '').includes(`${k + 1}/${N}`) && (x.param || '').includes(want)))
      badText.push(`t=${t.toFixed(1)} sec '${x.sec}' param '${x.param}'`);
    else if (full && next && !(x.val || '').includes(next)) badText.push(`t=${t.toFixed(1)} next '${x.val}' (expected '${next}')`);
  }
  log(`  ${name}: presets in order of appearance (${seen.length}): ${seen.join(' | ')}`);
  check(seen[0] === TOUR_START, `${name}: the tour starts at '${TOUR_START}'`, `first preset '${seen[0]}'`);
  check(badOrder.length === 0, `${name}: at every moment the preset of the tour plan`, short(badOrder));
  check(badLbl.length === 0, `${name}: preset label shows exactly the tour preset (no modified dot)`, short(badLbl));
  check(badVals.length === 0, `${name}: each preset's spec values with Voices 16, Octave 0, Glide 0 forced and Amp Attack <= 0.08 s, Delay Mix <= 0.1, Delay Feedback <= 0.3`, short(badVals));
  check(badText.length === 0, `${name}: window shows 'Preset tour · n/${N}', 'Now playing: <preset>' and the next preset`, short(badText));
  if (full) {
    // one run plays every preset of the plan exactly once
    const lastWant = plan[N - 1].preset;
    log(`  ${name}: ${seen.length - 1} preset changes, ${new Set(seen).size} distinct presets of ${N}, last '${seen[seen.length - 1]}'`);
    check(seen.length === N && new Set(seen).size === N, `${name}: all ${N} presets of the plan played exactly once in one run`, `${seen.length} entries, ${new Set(seen).size} distinct`);
    check(seen[seen.length - 1] === lastWant, `${name}: ends on '${lastWant}'`, `last '${seen[seen.length - 1]}'`);
  }
  const maxLv = Math.max(0, ...run.map((x) => x.lv));
  const lv = run.filter((x) => x.s.time > 1).map((x) => x.lv);
  check(maxLv <= 1.0, `${name}: no output level above 1.0`, `max ${maxLv}`);
  check(lv.filter((v) => v > 0.001).length / Math.max(1, lv.length) > 0.8, `${name}: sounds while playing`, `${lv.filter((v) => v > 0.001).length}/${lv.length} samples above -60 dBFS`, 'WARN');
  return seen.length;
}

function toccataChecks(samples) {
  const expected = (t) => { let k = 0; for (let i = 0; i < SCHED.length; i++) if (t >= SCHED[i].t) k = i; return k; };
  const sceneBad = [], valBad = [];
  for (const x of samples.filter((y) => y.s.running)) {
    const t = x.s.time;
    if (t < 0 || SCHED.some((s) => Math.abs(t - s.t) < TOL_T)) continue;
    const k = expected(t), sc = SCHED[k];
    if (x.s.scene !== k || x.s.param !== sc.param) sceneBad.push(`t=${t.toFixed(2)} ${x.s.scene}/${x.s.param} vs ${k}/${sc.param}`);
    if (sc.ramp) {
      const [t0, t1, a, b] = sc.ramp;
      const e = a + (b - a) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      if (!(Math.abs(x.v[sc.param] - e) <= (Math.abs(b - a) / (t1 - t0)) * TOL_T + Math.abs(b - a) * 0.01 + 1e-6)) valBad.push(`t=${t.toFixed(2)} ${sc.param}=${x.v[sc.param].toFixed(3)} vs ${e.toFixed(3)}`);
    } else if (sc.steps) {
      if (sc.steps.some((st) => Math.abs(t - st[0]) < TOL_T)) continue;
      let e = sc.steps[0][1]; for (const st of sc.steps) if (t >= st[0]) e = st[1];
      if (x.v[sc.param] !== e) valBad.push(`t=${t.toFixed(2)} ${sc.param}=${x.v[sc.param]} vs ${e}`);
    }
  }
  const lblBad = [];
  for (const x of samples.filter((y) => y.s.running && y.s.time > 0.3)) {
    const t = x.s.time;
    if (TOC_PRESETS.some((p) => Math.abs(t - p[0]) < TOL_T)) continue;
    let want = TOC_PRESETS[0][1];
    for (const p of TOC_PRESETS) if (t >= p[0]) want = p[1];
    if (!(x.lbl && x.lbl.name === want && x.lbl.dirty)) lblBad.push(`t=${t.toFixed(1)} ${JSON.stringify(x.lbl)} expected '${want}•'`);
  }
  check(lblBad.length === 0, "Toccata: preset label shows the scene's base preset with the modified dot ('B · Octave Organ•', then 'A · Init•')", short(lblBad));
  check(sceneBad.length === 0, 'Toccata: scenes follow the agreed schedule', short(sceneBad));
  check(valBad.length === 0, 'Toccata: parameter ramps/steps follow the schedule', short(valBad));
}

// ------------------------------------------------------------------ MIDI helpers
function vlq(n) { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; }
function makeMidi(title) {
  const e = [];
  const name = Buffer.from(title, 'latin1');
  e.push(0, 0xff, 0x03, ...vlq(name.length), ...name);
  e.push(0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20);
  const scale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 83, 81, 79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60, 64, 67, 72];
  for (const n of scale) { e.push(0, 0x90, n, 96, 0, 0x99, 36, 100); e.push(...vlq(240), 0x80, n, 0, 0, 0x89, 36, 0); }
  e.push(0, 0xff, 0x2f, 0);
  const trk = Buffer.from(e);
  const hdr = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0]);
  const th = Buffer.from([0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 0]);
  th.writeUInt32BE(trk.length, 4);
  return Buffer.concat([hdr, th, trk]); // 8 s
}
async function setInputFile(selector, file) {
  const doc = await B.send('DOM.getDocument', { depth: 1 });
  const q = await B.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
  if (!q.nodeId) throw new Error('no ' + selector);
  await B.send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [file] });
}

// Test-only hook (every tab): records AudioContext.close() calls and the demo state at pagehide in localStorage.
const HOOK_SOURCE = `(() => {
  try {
    const origClose = AudioContext.prototype.close;
    AudioContext.prototype.close = function () {
      try { localStorage.setItem('ws.test.closed', JSON.stringify({ t: Date.now(), href: location.href, state: this.state })); } catch (e) {}
      return origClose.apply(this, arguments);
    };
  } catch (e) {}
  addEventListener('load', () => addEventListener('pagehide', () => {
    try { localStorage.setItem('ws.test.pagehide', JSON.stringify({ t: Date.now(), demo: WS_TEST.demoState().running, audio: WS_TEST.audioState() })); } catch (e) {}
  }));
})();`;

// beta 0.6: the welcome window (#start-overlay): its sub-title (#w-sub) shows why the audio was paused, its 'Play the synth'
// choice (#start-btn) takes the audio back, 'Run the demo' (#w-demo) starts the default demo
const OVERLAY_EXPR = `(() => { const o = document.getElementById('start-overlay'); if (!o) return null;
  const vis = !o.classList.contains('gone') && getComputedStyle(o).display !== 'none' && getComputedStyle(o).visibility !== 'hidden';
  const p = o.querySelector('#w-sub'), b = o.querySelector('#start-btn'), d = o.querySelector('#w-demo');
  const r = b ? b.getBoundingClientRect() : null, rd = d ? d.getBoundingClientRect() : null;
  return { visible: vis, text: p ? p.textContent.trim() : '', button: b ? b.textContent.trim() : '', choices: o.querySelectorAll('.choice').length,
    bx: r ? r.left + r.width / 2 : 0, by: r ? r.top + r.height / 2 : 0, dx: rd ? rd.left + rd.width / 2 : 0, dy: rd ? rd.top + rd.height / 2 : 0 }; })()`;

async function tabLevel(T, note) {
  await T.evaluate(`WS_TEST.noteOn(${note}, 0.8); true`);
  let m = 0;
  for (let i = 0; i < 12; i++) { await sleep(60); const l = await T.evaluate('WS_TEST.getLevel()'); m = Math.max(m, l.peakL, l.peakR); }
  await T.evaluate(`WS_TEST.noteOff(${note}); true`);
  return m;
}

async function lifecycleTests() {
  begin('Audio lifecycle (one window/tab plays at a time)');
  const A = B;
  check(await A.evaluate(`typeof WS_TEST.audioState === 'function'`), 'WS_TEST.audioState() exists');
  await A.evaluate(`localStorage.removeItem('ws.test.closed'); localStorage.removeItem('ws.test.pagehide'); true`);
  await A.evaluate('Promise.resolve(WS_TEST.start()).then(() => true)');
  await sleep(300);
  check(await A.evaluate('WS_TEST.audioState()') === 'running', "tab A: audioState() is 'running' after start()", await A.evaluate('WS_TEST.audioState()'));
  await A.evaluate('WS_TEST.demoStart(0)');
  check(!!(await waitDemoTime(1, 8000)), 'tab A: demo playing');
  // second tab
  const T2 = await A.openTab();
  await T2.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK_SOURCE });
  await T2.navigate(URL0 + '#noaudio');
  await sleep(1200);
  const st2 = await T2.evaluate('WS_TEST.audioState()');
  log(`  tab B before start: audioState() = '${st2}'`);
  check(st2 === 'none' || st2 === 'suspended', "tab B: audioState() reports no running context before start ('none' or 'suspended')", st2);
  await T2.evaluate('Promise.resolve(WS_TEST.start()).then(() => true)');
  await sleep(1000);
  const aState = await A.evaluate('WS_TEST.audioState()'), aDemo = (await A.evaluate('WS_TEST.demoState()')).running, aOv = await A.evaluate(OVERLAY_EXPR);
  log(`  after tab B starts: tab A audio '${aState}', demo running ${aDemo}, overlay ${JSON.stringify(aOv)}`);
  check(aState === 'suspended', "starting audio in tab B suspends tab A's AudioContext", aState);
  check(!aDemo, "starting audio in tab B stops tab A's demo");
  check(!!aOv && aOv.visible && /playing in another window or tab/.test(aOv.text) && /Play the synth/.test(aOv.button) && aOv.choices === 3,
    "tab A shows the welcome window again: 'The synthesizer is playing in another window or tab…' and its three choices", JSON.stringify(aOv));
  check(await T2.evaluate('WS_TEST.audioState()') === 'running', "tab B: audioState() 'running'");
  const lvB = await tabLevel(T2, 64);
  check(lvB > 0.003, 'tab B plays (level rises on a note)', `max ${lvB}`);
  await A.screenshot(path.join(opt.out, 'tabA_paused_overlay.png'));
  // take the audio back in tab A with the overlay button
  await A.click(aOv.bx, aOv.by);
  await sleep(1200);
  const a2 = await A.evaluate('WS_TEST.audioState()'), b2 = await T2.evaluate('WS_TEST.audioState()');
  const aOv2 = await A.evaluate(OVERLAY_EXPR), bOv2 = await T2.evaluate(OVERLAY_EXPR);
  log(`  after 'Play the synth' in tab A: A '${a2}' overlay ${aOv2 && aOv2.visible}, B '${b2}' overlay ${JSON.stringify(bOv2)}`);
  check(a2 === 'running' && aOv2 && !aOv2.visible, "'Play the synth' in tab A resumes its audio and hides the window", `${a2}, overlay ${aOv2 && aOv2.visible}`);
  check(b2 === 'suspended' && bOv2 && bOv2.visible && /another window or tab/.test(bOv2.text), 'tab B is then paused with the same overlay message', `${b2} ${JSON.stringify(bOv2)}`);
  const lvA = await tabLevel(A, 60);
  check(lvA > 0.003, 'tab A plays again (level rises on a note)', `max ${lvA}`);
  // pagehide: make tab B the player again with the 'Run the demo' choice of its paused window, then navigate it away
  if (bOv2 && bOv2.visible) await T2.click(bOv2.dx, bOv2.dy);
  let t2run = false;
  for (let i = 0; i < 80 && !t2run; i++) { await sleep(100); t2run = (await T2.evaluate('WS_TEST.demoState()')).running; }
  const bOv3 = await T2.evaluate(OVERLAY_EXPR);
  check(t2run && await T2.evaluate('WS_TEST.audioState()') === 'running' && !bOv3.visible,
    "tab B: 'Run the demo' in its paused window takes the audio back and plays the demo (window closed)", `demo ${t2run}, window ${bOv3.visible}`);
  check(await A.evaluate('WS_TEST.audioState()') === 'suspended', 'tab A paused again while tab B plays');
  await T2.navigate('about:blank');
  await sleep(800);
  const closed = JSON.parse((await A.evaluate(`localStorage.getItem('ws.test.closed')`)) || 'null');
  const ph = JSON.parse((await A.evaluate(`localStorage.getItem('ws.test.pagehide')`)) || 'null');
  log(`  after leaving tab B's page: AudioContext.close() record ${JSON.stringify(closed)}; state at pagehide ${JSON.stringify(ph)}`);
  check(!!closed, "pagehide closes the page's AudioContext (AudioContext.close() called)", JSON.stringify(closed));
  check(!!ph && ph.demo === false, 'pagehide stops the demo', JSON.stringify(ph));
  await T2.close();
  check(A.errors().length === 0 && T2.errors().length === 0, 'no console errors in either tab', short([...A.errors(), ...T2.errors()]));
  await A.evaluate(`localStorage.removeItem('ws.test.closed'); localStorage.removeItem('ws.test.pagehide'); true`);
}

// ------------------------------------------------------------------ hostile MIDI files (security regression)
function u32be(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return [...b]; }
function smfHeader(fmt, ntrk, div, hlen = 6) { return [0x4d, 0x54, 0x68, 0x64, ...u32be(hlen), fmt >> 8, fmt & 255, ntrk >> 8, ntrk & 255, div >> 8, div & 255]; }
function smfTrack(bytes, lenOverride) { return [0x4d, 0x54, 0x72, 0x6b, ...u32be(lenOverride === undefined ? bytes.length : lenOverride), ...bytes]; }
const NOTE = [0x00, 0x90, 0x3c, 0x60, 0x83, 0x60, 0x80, 0x3c, 0x00]; // C4 for 480 ticks
function hostileMidis() {
  const tempos = [];
  for (let i = 0; i < 20000; i++) tempos.push(0x01, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20);
  const garbage = [];
  let seed = 7;
  for (let i = 0; i < 200; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; garbage.push(seed & 255); }
  return [
    // the 31-byte file from the review: meta type 1 with a 5-byte VLQ length 8F FF FF FF 7F
    { name: 'meta_vlq_bomb', bytes: [...smfHeader(0, 1, 480), ...smfTrack([0x00, 0xff, 0x01, 0x8f, 0xff, 0xff, 0xff, 0x7f, 0x00])], expect: 'alert' },
    { name: 'sysex_vlq_huge', bytes: [...smfHeader(0, 1, 480), ...smfTrack([0x00, 0xf0, 0x8f, 0xff, 0xff, 0x7f, 0x00, 0x90, 0x3c, 0x40])], expect: 'alert' },
    { name: 'track_len_ffffffff', bytes: [...smfHeader(0, 1, 480), ...smfTrack(NOTE, 0xffffffff)], expect: 'either' },
    { name: 'header_len_huge', bytes: smfHeader(0, 1, 480, 0xfffffff0).concat(smfTrack(NOTE)), expect: 'alert' },
    { name: 'division_zero', bytes: [...smfHeader(0, 1, 0), ...smfTrack(NOTE)], expect: 'alert' },
    { name: 'division_smpte', bytes: [...smfHeader(0, 1, 0xe728), ...smfTrack(NOTE)], expect: 'alert' },
    { name: 'ntrk_65535', bytes: [...smfHeader(1, 65535, 480), ...smfTrack(NOTE)], expect: 'either' },
    { name: 'bad_data_bytes', bytes: [...smfHeader(0, 1, 480), ...smfTrack([0x00, 0x90, 0x3c, 0xc0, 0x00, 0x90, 0xff, 0xff, 0x00, 0x90, 0x3c])], expect: 'alert' },
    { name: 'many_tempos_20000', bytes: [...smfHeader(0, 1, 480), ...smfTrack([...tempos, ...NOTE])], expect: 'play' },
    { name: 'far_future_note', bytes: [...smfHeader(0, 1, 480), ...smfTrack([...NOTE, 0xff, 0xff, 0xff, 0x7f, 0x90, 0x3e, 0x60, 0x10, 0x80, 0x3e, 0x00])], expect: 'either' },
    { name: 'garbage_after_mthd', bytes: [0x4d, 0x54, 0x68, 0x64, ...garbage], expect: 'alert' },
    { name: 'empty_track', bytes: [...smfHeader(0, 1, 480), ...smfTrack([])], expect: 'alert' },
    { name: 'zero_bytes', bytes: [], expect: 'alert' },
  ];
}

async function hostileMidiTests(base, dialogs) {
  begin('Hostile MIDI files through "Load a MIDI file…" (#file-midi)');
  const dir = path.join(opt.out, 'hostile_midi');
  fs.mkdirSync(dir, { recursive: true });
  const problems = [];
  log(`  ${'file'.padEnd(20)} ${'bytes'.padStart(7)}  ${'result'.padEnd(46)} ${'resp ms'.padStart(7)} ${'heap MB'.padStart(7)}`);
  for (const h of hostileMidis()) {
    const file = path.join(dir, h.name + '.mid');
    fs.writeFileSync(file, Buffer.from(h.bytes));
    const d0 = dialogs.length, e0 = B.errors().length;
    let crashed = null;
    try { await setInputFile('#file-midi', file); } catch (e) { crashed = e.message; }
    let msg = null, playing = false;
    const t0 = Date.now();
    while (!crashed && Date.now() - t0 < 4000) {
      if (dialogs.length > d0) { msg = dialogs[d0]; break; }
      try { if ((await ev('WS_TEST.demoState()', 3000)).running) { playing = true; break; } } catch (e) { crashed = e.message; break; }
      await sleep(100);
    }
    let resp = -1, heap = -1, st = null;
    if (!crashed) {
      try {
        const r0 = Date.now();
        heap = await ev('Math.round((performance.memory ? performance.memory.usedJSHeapSize : 0) / 1048576)', 3000);
        resp = Date.now() - r0;
        st = await ev('WS_TEST.demoState()', 3000);
      } catch (e) { crashed = e.message; }
    }
    const res = crashed ? `PAGE/BROWSER LOST: ${crashed}` : msg ? `alert: ${msg}` : playing ? `plays (${st && st.scenes} scenes, '${st && st.song}')` : 'nothing (no alert, not playing)';
    log(`  ${h.name.padEnd(20)} ${String(h.bytes.length).padStart(7)}  ${res.slice(0, 46).padEnd(46)} ${String(resp).padStart(7)} ${String(heap).padStart(7)}`);
    if (crashed) { problems.push(`${h.name}: ${res}`); break; }
    const newErr = B.errors().slice(e0);
    if (newErr.length) problems.push(`${h.name}: console error/uncaught exception: ${newErr[0]}`);
    if (resp > 1000) problems.push(`${h.name}: page slow to respond (${resp} ms)`);
    if (heap > 300) problems.push(`${h.name}: JS heap ${heap} MB`);
    const alertOk = !!msg && /could not play|no playable notes/i.test(msg);
    if (h.expect === 'alert' && !(alertOk && !playing)) problems.push(`${h.name}: expected the 'could not play / no playable notes' alert, got: ${res}`);
    if (h.expect === 'play' && !playing) problems.push(`${h.name}: expected playback, got: ${res}`);
    if (h.expect === 'either' && !(alertOk || playing)) problems.push(`${h.name}: neither alert nor playback: ${res}`);
    if (playing) {
      if (h.name === 'far_future_note') log(`    (info) far_future_note: a note ~${(0x0fffffff / 480 * 0.5 / 3600).toFixed(0)} h after the start is accepted; the demo would run that long`);
      await ev('WS_TEST.demoStop()');
      await waitStopped(2000);
    }
    await sleep(200);
  }
  check(problems.length === 0, 'hostile MIDI files: page stays responsive, alert for unplayable files, no uncaught exception, bounded memory', short(problems, 12));
  await checkRestored(base, 'after hostile MIDI files');
}

// ------------------------------------------------------------------ main
async function main() {
  fs.mkdirSync(opt.out, { recursive: true });
  for (const f of fs.readdirSync(opt.out)) if (/\.(png|txt|mid)$/.test(f)) fs.rmSync(path.join(opt.out, f));
  log(`test_demo.js - web DEMO split button${opt.smoke ? ' (smoke)' : ''}`);
  log(`page   : ${URL0}`);
  log(`browser: headless Edge ${opt.fileAccess ? 'with' : 'WITHOUT'} --allow-file-access-from-files`);
  let abort = null;
  const dialogs = [];
  try {
    B = await Browser.launch({ width: 1280, height: 860, fileAccess: opt.fileAccess });
    await B.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK_SOURCE });
    await B.send('DOM.enable');
    B.on('Page.javascriptDialogOpening', (p) => { dialogs.push(p.message); B.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });

    // ---- beta 0.6: the welcome window's 'Run the demo' starts the audio and the default demo as '▶ DEMO' does
    begin("Welcome window: 'Run the demo' (cold start)");
    await B.navigate(URL0);
    await sleep(1200);
    const ov0 = await ev(OVERLAY_EXPR), a0 = await ev('WS_TEST.audioState()');
    check(!!ov0 && ov0.visible && ov0.choices === 3 && a0 === 'none', 'the page opens on the welcome window, audio not started', JSON.stringify({ ov0, a0 }));
    if (ov0 && ov0.visible) await B.click(ov0.dx, ov0.dy);
    const wd = await waitDemoTime(0, 10000);
    const song0 = (await ev('WS_TEST.demoSongs()'))[0];
    const ov1 = await ev(OVERLAY_EXPR), hb0 = await rectOf('.demo-btn');
    log(`  after 'Run the demo': ${JSON.stringify(wd)}, window ${ov1 && ov1.visible}, header '${hb0 && hb0.text}'`);
    check(!!wd && wd.song === song0.title && (wd.preset === undefined || wd.preset === TOUR_START), `'Run the demo' plays the default demo (${song0.title}${wd && wd.preset ? ', from ' + TOUR_START : ''})`, JSON.stringify(wd));
    check(!!ov1 && !ov1.visible && await ev('WS_TEST.audioState()') === 'running' && /STOP/.test(hb0.text), "the window closes, the audio runs and the header shows '■ STOP'",
      JSON.stringify({ visible: ov1 && ov1.visible, btn: hb0 && hb0.text }));
    await ev('WS_TEST.demoStop()');
    check(await waitStopped(2000), 'demoStop() stops it');
    await B.navigate('about:blank');   // a real reload below (a #hash change alone keeps the document)

    begin('Setup (audio not started)');
    await B.navigate(URL0 + '#noaudio');
    await sleep(1200);
    DEV = await deviceRect();
    check(B.errors().length === 0, 'page loads without errors', short(B.errors()));
    const api = await ev(`['demoStart','demoStop','demoState','demoSongs'].map(k => typeof (window.WS_TEST || {})[k])`);
    if (!check(api.every((t) => t === 'function'), 'WS_TEST exposes demoStart/demoStop/demoState/demoSongs', JSON.stringify(api))) throw new Error('no demo API');
    const songs = await ev('WS_TEST.demoSongs()');
    const names = await ev('WS_TEST.presets()');
    log(`  ${songs.length} songs:`);
    songs.forEach((s, i) => log(`    [${i}] ${s.composer} - ${s.title} (${fmtT(s.duration)})${s.license ? '  [' + s.license + ']' : ''}`));
    const startLabel = await ev(`(document.querySelector('.presets .pname') || {}).textContent || ''`);
    if (SPEC.DEFAULT_PRESET) check(startLabel.includes(SPEC.DEFAULT_PRESET), `the app opens on '${SPEC.DEFAULT_PRESET}'`, `label '${startLabel}'`);
    // the preset menu (click on the name) and WS_TEST.presets() list the factory presets in tools/spec.js order
    const specNames = SPEC.PRESETS.map((p) => p.name);
    const menuItems = await ev(`(() => { const n = document.querySelector('.presets .pname'); if (!n) return null; n.click();
      const it = [...document.querySelectorAll('.pmenu:not(.demo-menu) .it')].map((e) => e.textContent.replace(/✕$/, ''));
      n.click(); return it; })()`);
    const menuWant = specNames.map((s) => s.replace(' · ', ''));
    check(Array.isArray(menuItems) && menuWant.every((s, i) => menuItems[i] === s), `preset menu lists the ${specNames.length} factory presets in spec order`,
      JSON.stringify((menuItems || []).slice(0, 6)) + ' …');
    check(JSON.stringify(names.slice(0, specNames.length)) === JSON.stringify(specNames), 'WS_TEST.presets() follows the spec order', JSON.stringify(names.slice(0, 4)));
    const baseStartup = await snapshotAll();
    const iToccata = songs.findIndex((s) => /toccata/i.test(s.title));

    // ---- menu via the arrow
    begin('Split button: menu via the arrow');
    const btn = await rectOf('.demo-btn'), arrow = await rectOf('.demo-arrow');
    check(!!btn && btn.visible && /DEMO/.test(btn.text), "'▶ DEMO' button present", JSON.stringify(btn && btn.text));
    check(!!arrow && arrow.visible, "'▾' arrow button present (.demo-arrow)", JSON.stringify(arrow && arrow.text));
    if (btn && arrow) {
      const bx = ((btn.x - DEV.x) * 1100) / DEV.w, ax = ((arrow.x - DEV.x) * 1100) / DEV.w;
      log(`  button centre at device x ${bx.toFixed(0)} (spec 222-272), arrow at x ${ax.toFixed(0)} (spec 274-288)`);
    }
    const menu = await openMenu();
    check(!!menu && menu.visible, "the arrow opens the song menu (.demo-menu)");
    if (menu) {
      log('  menu items: ' + menu.items.join(' | '));
      check(menu.items.length === songs.length + 1 && /MIDI/i.test(menu.items[menu.items.length - 1]), 'menu lists every song plus "Load a MIDI file…"', `${menu.items.length} items`);
      check(/DEFAULT/.test(menu.items[0]) && menu.items.filter((t) => /DEFAULT/.test(t)).length === 1, 'the first song (default demo) is tagged DEFAULT, and only it', menu.items[0]);
    }
    check(!(await ev('WS_TEST.demoState()')).running, 'opening the menu does not start a song');
    await B.screenshot(path.join(opt.out, 'demo_menu.png'));
    await B.click(5, 5);
    await sleep(300);
    check(!(await ev(`!!document.querySelector('.demo-menu')`)), 'the menu closes on an outside click');

    // ---- default demo from a cold start via the main button
    begin(`Default demo via '▶ DEMO' (cold start): ${songs[0].title}`);
    await B.click(btn.x, btn.y);
    const started = await waitDemoTime(0, 10000);
    check(!!started, "'▶ DEMO' plays the default demo directly (audio was not started)", JSON.stringify(started));
    if (!started) throw new Error('default demo did not start');
    check(started.song === songs[0].title, 'the default demo is song 0', `'${started.song}'`);
    const st0 = await ev(SNAP_EXPR);
    check(/STOP/.test(st0.btn) && st0.win && !(await ev(`!!document.querySelector('.demo-menu')`)), "while running: '■ STOP', demo window visible, no menu",
      JSON.stringify({ btn: st0.btn, win: st0.win }));
    const isTour = typeof st0.s.preset === 'string';
    log(`  preset tour: ${isTour ? 'yes' : 'no'} (demoState().preset = ${JSON.stringify(st0.s.preset)})`);
    let shot = false;
    const tourSamples = await follow(opt.smoke ? 4 * TOUR_STEP + 2 : songs[0].duration + 6, async (s) => {
      if (!shot && s.s.time > 13) { shot = true; await B.screenshot(path.join(opt.out, 'tour_t13.png')); }
    });
    if (isTour) {
      const plan = await ev('WS_TEST.demoTour(0)');
      planChecks(plan, songs[0]);
      const n = tourChecks('tour', songs[0], [st0, ...tourSamples], plan, !opt.smoke);
      check(n >= (opt.smoke ? 5 : plan.length), `tour: at least ${opt.smoke ? 5 : plan.length} presets observed`, `${n}`);
    } else songChecks('default demo', songs[0], [st0, ...tourSamples], !opt.smoke);
    if (opt.smoke) {
      const hb = await rectOf('.demo-btn');
      await B.click(hb.x, hb.y);
      check(await waitStopped(2000), "'■ STOP' stops the tour");
    } else {
      const last = tourSamples[tourSamples.length - 1];
      const lastT = Math.max(...tourSamples.filter((x) => x.s.running).map((x) => x.s.time));
      check(!last.s.running && lastT >= songs[0].duration - 0.5 && lastT <= songs[0].duration + 3.5, 'the default demo ends by itself ~2.5 s after its last note',
        `last scene time ${lastT.toFixed(2)} s, duration ${songs[0].duration} s`);
    }
    await checkRestored(baseStartup, 'default demo (startup preset)');
    check(B.errors().length === 0, 'no console errors during the default demo', short(B.errors()));

    // ---- a modified preset as baseline from here on
    const iSparse = names.indexOf('A · Clean Keys');   // beta 0.5 (A · Sparse Keys was left out)
    if (iSparse >= 0) await ev(`WS_TEST.loadPreset(${iSparse})`);
    await ev(`WS_TEST.setParam('f_cutoff', 5.5); WS_TEST.setParam('fx_rmix', 0.33); true`);
    await sleep(200);
    const base = await snapshotAll();
    log(`  baseline from here: '${base.label.replace(/<[^>]+>/g, ' ').trim()}' (modified)`);

    // ---- Toccata from the arrow menu
    if (iToccata >= 0) {
      begin(`Toccata from the arrow menu: ${songs[iToccata].title}`);
      check(await chooseFromMenu(songs[iToccata].title, songs), 'the Toccata can be chosen from the arrow menu');
      check(!!(await waitDemoTime(0, 8000)), 'it starts');
      const sm = await follow(opt.smoke ? 10 : 30);
      songChecks('Toccata', songs[iToccata], sm, false);
      toccataChecks(sm);
      const hb = await rectOf('.demo-btn');
      check(/STOP/.test(hb.text), "'■ STOP' shown while a menu song plays", hb.text);
      if (opt.smoke) { await B.key('Escape', { code: 'Escape' }); check(await waitStopped(2000), 'Esc stops the demo'); }
      else { await B.click(hb.x, hb.y); check(await waitStopped(2000), "'■ STOP' stops it"); }
      await checkRestored(base, opt.smoke ? 'Toccata + Esc' : 'Toccata + header STOP');
    }
    if (opt.smoke) { check(B.errors().length === 0, 'no console errors', short(B.errors())); await hostileMidiTests(base, dialogs); await lifecycleTests(); throw SMOKE_DONE; }

    // ---- every other song
    begin('Other songs: start / scenes / stop');
    for (let i = 1; i < songs.length; i++) {
      if (i === iToccata) continue;
      await ev(`WS_TEST.demoStart(${i})`);
      await waitDemoTime(0, 8000);
      const sm = await follow(14);
      const st = sm[sm.length - 1].s;
      if (typeof st.preset === 'string') tourChecks(`song ${i}`, songs[i], sm, await ev(`WS_TEST.demoTour(${i})`), false);
      else songChecks(`song ${i} '${songs[i].short || songs[i].title}' (14 s)`, songs[i], sm, false);
      await ev('WS_TEST.demoStop()');
      check(await waitStopped(2000), `song ${i}: demoStop() stops it`);
      await checkRestored(base, `song ${i} stop`);
    }

    // ---- stop paths
    begin('Stop paths and restarts');
    const hb = await rectOf('.demo-btn');
    await B.click(hb.x, hb.y); // default demo
    await waitDemoTime(3);
    await B.key('Escape', { code: 'Escape' });
    check(await waitStopped(2000), 'Esc stops the demo');
    await checkRestored(base, 'Esc');
    await B.click(hb.x, hb.y);
    await waitDemoTime(3);
    const ws = await rectOf('.dw-stop');
    if (ws) await B.click(ws.x, ws.y);
    check(await waitStopped(2000), "the window's '■ STOP' stops the demo");
    await checkRestored(base, 'window STOP');
    await ev('WS_TEST.demoStart(0)');
    await sleep(500);
    await ev('WS_TEST.demoStop()');
    await ev('WS_TEST.demoStart(0)');
    const s3 = await waitDemoTime(1);
    check(!!s3 && s3.scene === 0, 'start -> stop -> start plays again from the beginning', JSON.stringify(s3));
    await ev('WS_TEST.demoStop()');
    await waitStopped(2000);
    await checkRestored(base, 'restart');

    // ---- MIDI files
    begin('Load a MIDI file');
    const myMid = path.join(opt.out, 'ws_test_tune.mid');
    fs.writeFileSync(myMid, makeMidi('WS Test Tune'));
    const dlg0 = dialogs.length;
    await setInputFile('#file-midi', myMid);
    let su = await waitDemoTime(1, 8000);
    check(!!su, 'a generated MIDI file (32 notes + channel-10 drums) starts playing', JSON.stringify(su));
    if (su) {
      check(/WS Test Tune/.test(su.song), 'title taken from the MIDI track name', `'${su.song}'`);
      const sm = await follow(30);
      const run = sm.filter((x) => x.s.running);
      const lv = Math.max(0, ...run.map((x) => x.lv));
      const lastT = run.length ? run[run.length - 1].s.time : 0;
      check(lv > 0.003 && lv <= 1, 'generated MIDI file sounds (level 0..1)', `max ${lv}`);
      check(!sm[sm.length - 1].s.running && lastT > 7 && lastT < 13, 'generated 8 s MIDI file ends by itself', `last time ${lastT.toFixed(2)} s`);
      await waitStopped(3000);
      await checkRestored(base, 'generated MIDI end');
    }
    const demoDir = path.join(ROOT, 'tools', 'demo');
    const mids = fs.existsSync(demoDir) ? fs.readdirSync(demoDir).filter((f) => /\.mid$/i.test(f)).sort() : [];
    const fe = path.join(demoDir, mids.includes('pathetique1.mid') ? 'pathetique1.mid' : mids[0] || 'none.mid');
    if (fs.existsSync(fe)) {
      await setInputFile('#file-midi', fe);
      su = await waitDemoTime(2, 8000);
      check(!!su, `tools/demo/${path.basename(fe)} loads and plays`, JSON.stringify(su));
      if (su) {
        const lvs = [];
        for (let i = 0; i < 15; i++) { const l = await ev('WS_TEST.getLevel()'); lvs.push(Math.max(l.peakL, l.peakR)); await sleep(100); }
        check(Math.max(...lvs) > 0.003, `${path.basename(fe)} sounds`, `max ${Math.max(...lvs)}`);
        await ev('WS_TEST.demoStop()');
        await waitStopped(2000);
        await checkRestored(base, 'MIDI file stop');
      }
    }
    const bad = path.join(opt.out, 'not_a_midi.mid');
    fs.writeFileSync(bad, 'this is not a MIDI file\n');
    const errs0 = B.errors().length;
    await setInputFile('#file-midi', bad);
    await sleep(1500);
    const msgs = dialogs.slice(dlg0);
    check(msgs.some((m) => /MIDI/i.test(m)), 'a non-MIDI file gives a clear error alert', JSON.stringify(msgs));
    check(!(await ev('WS_TEST.demoState()')).running, 'nothing plays after the non-MIDI file');
    check(B.errors().length === errs0, 'no uncaught exception for the non-MIDI file', short(B.errors().slice(errs0)));
    await checkRestored(base, 'after non-MIDI file');
    await hostileMidiTests(base, dialogs);

    // ---- Ctrl+click
    begin('Ctrl+click on a knob resets it to the default');
    for (const [key, x, y] of [['f_cutoff', 50, 418], ['amp_a', 582, 418]]) {
      const p = SPEC_BY_KEY[key];
      const other = p.min + (p.max - p.min) * 0.3;
      await ev(`WS_TEST.setParam('${key}', ${other})`);
      await sleep(100);
      const [px, py] = P(x, y);
      await B.mouse('mouseMoved', px, py, { button: 'none', buttons: 0, modifiers: 2 });
      await B.mouse('mousePressed', px, py, { buttons: 1, modifiers: 2 });
      await sleep(30);
      await B.mouse('mouseReleased', px, py, { buttons: 0, modifiers: 2 });
      await sleep(200);
      const v = await ev(`WS_TEST.getParam('${key}')`);
      check(Math.abs(v - p.def) < 1e-9, `Ctrl+click on the ${p.name} knob resets it to the spec default (${p.def})`, `got ${v}`);
    }
    check(B.errors().length === 0, 'no console errors overall', short(B.errors()));
    await lifecycleTests();
  } catch (e) {
    abort = e === SMOKE_DONE ? null : String(e && e.stack ? e.stack : e);
  } finally {
    if (B) await B.close();
  }
  const n = (sv) => results.filter((r) => r.sev === sv).length;
  log('');
  log('==================================== SUMMARY ====================================');
  if (abort) log('RUN ABORTED: ' + abort);
  log(`Checks : ${n('PASS')} PASS, ${n('WARN')} WARN, ${n('FAIL')} FAIL`);
  for (const sv of ['FAIL', 'WARN']) for (const r of results.filter((x) => x.sev === sv)) log(`  - ${sv} [${r.section}] ${r.name}${r.detail ? '  -- ' + r.detail : ''}`);
  log(`RESULT: ${n('FAIL') || abort ? 'FAIL' : 'PASS'}`);
  fs.writeFileSync(path.join(opt.out, 'report.txt'), lines.join('\n') + '\n');
  process.exit(n('FAIL') || abort ? 1 : 0);
}
const SMOKE_DONE = Symbol('smoke done');
main();
