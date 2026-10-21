// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// test_demo.js - tests the web app's DEMO button in headless Edge (Okto MultiWave Synth: the demo is a preset tour of one piece).
//
//   node tests/web/test_demo.js [--url URL] [--out DIR] [--file-access] [--smoke]
//
// UI: `.demo-btn` ("▶ DEMO") plays the demo (Beethoven, Appassionata III) and shows "■ STOP" while running. There is no song menu
// (no `.demo-arrow`, no `.demo-menu`) and no MIDI file input (no `#file-midi`): the final version has one song only.
// By default Edge runs WITHOUT --allow-file-access-from-files (like a normal browser opening file://).
// - The demo plays the PRESET TOUR of tools/spec.js (TOUR: the TOP Sounds mixed with new presets; the first two are not heard, the song
//   starts at 7.8 s): a change every ~4 s on a chord (WS_TEST.demoTour gives the times), with Voices 16, Octave 0,
//   Glide 0 and Amp Attack capped at 0.08 s forced; all other values must equal the spec preset. During the first presets the demo
//   window shows the presentation of the synth, one sentence per preset (tools/spec.js DEMO_STORY: a chapter in .dw-chap, the sentence in .dw-text).
// - Stop paths (header STOP, window STOP, Esc), Ctrl+click reset.
// - Welcome window: 'Run the demo' from a cold start plays the demo; when another tab takes the audio, the window comes
//   back with the reason, and its 'Play the synth' / 'Run the demo' take the audio back (lifecycle).
// --smoke: welcome 'Run the demo', the header button (no arrow, no menu), the tour from a cold start up to its 7th preset, header STOP
//          restore, Esc restore, lifecycle (about 1.5 min).
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
  const pr = (SPEC.DEMO_PRESETS || []).find((p) => p.name === name) || SPEC.PRESETS.find((p) => p.name === name);   // the demo's tour has presets of its own
  return pr ? Object.assign({}, ...SPEC.PARAMS.map((p) => ({ [p.key]: p.def })), pr.v) : null;
};

const TOL_T = 0.3; // s: scene clock vs. parameter update (rAF) tolerance
const TOUR_STEP = 4; // s per preset in the tour (TOL_T = 0.3 s leaves a 3.4 s checked window per preset)
// the preset sequence of the default demo: tools/spec.js TOUR from its third entry (the opening chords of the piece are cut), wrapping round
const TOUR = SPEC.TOUR;
const tourFrom = (first, n) => Array.from({ length: n }, (_, i) => TOUR[(first + i) % TOUR.length]);
const TOUR_START = TOUR[2];   // first preset heard on the default song
// version 1.0.6: the demo window presents the synth while the piece plays: one sentence per preset of the tour (web/js/demo.js, the spec's DEMO_STORY: [chapter, sentence]; the last one stays if the tour is longer)
const STORY = SPEC.DEMO_STORY;
const storyAt = (k) => STORY[Math.min(k, STORY.length - 1)];
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
const P = (x, y) => [DEV.x + (x * DEV.w) / 1100, DEV.y + (y * DEV.h) / SPEC.DEVICE.h];
async function rectOf(sel, index = 0) {
  return ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${index}]; if (!e) return null; const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, text: e.textContent.trim(),
      visible: r.width > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' }; })()`);
}

const SNAP_EXPR = `(() => { const s = WS_TEST.demoState(); const l = WS_TEST.getLevel();
  const all = s.running && s.preset ? Object.fromEntries(WS_TEST.paramKeys().map(k => [k, WS_TEST.getParam(k)])) : null;
  const q = (c) => { const e = document.querySelector(c); return e ? e.textContent.trim() : null; };
  const w = document.querySelector('.demo-win');
  return { s, all, lv: Math.max(l.peakL, l.peakR), hot: document.querySelectorAll('.hot').length,
    sec: q('.dw-sec'), param: q('.dw-param'), val: q('.dw-val'), chap: q('.dw-chap'), text: q('.dw-text'), btn: q('.demo-btn'), win: !!w && getComputedStyle(w).display !== 'none',
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
// ------------------------------------------------------------------ checks
// The tour plan itself (independent of the player): the agreed sequence, a change about every TOUR_STEP s.
function planChecks(plan, song, first) {
  const seq = plan.map((p) => p.preset), gaps = plan.slice(1).map((p, i) => p.t - plan[i].t), want = tourFrom(first, plan.length);
  check(JSON.stringify(seq) === JSON.stringify(want), `tour plan: the spec's TOUR from entry ${first + 1} on (${plan.length} presets, from '${want[0]}')`,
    seq.map((n, i) => (n === want[i] ? null : `#${i + 1} '${n}' expected '${want[i]}'`)).filter(Boolean).slice(0, 3).join('; ') || `${seq.length} presets`);
  check(plan.length > 0 && plan[0].t === 0 && gaps.every((g) => g > TOUR_STEP - 1.5 && g < TOUR_STEP + 1.5) && plan[plan.length - 1].t < song.duration,
    `tour plan: starts at 0 s, then a change every ${TOUR_STEP} ± 1.5 s (on a chord) until the end`,
    `gaps ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)} s, last change ${plan[plan.length - 1].t.toFixed(1)} s of ${song.duration} s`);
}

// Preset tour: at time t the preset of the last plan entry with plan[k].t <= t; all values = spec preset except the forced ones
function tourChecks(name, song, samples, plan, full, intro = true, start = plan[0].preset) {
  const run = samples.filter((x) => x.s.running && x.s.time >= 0);
  const N = plan.length;
  const seen = [], badOrder = [], badVals = [], badText = [], badLbl = [], badIntro = [], introSeen = new Set(), sceneSeen = new Set();
  let summarySeen = 0;
  for (const x of run) {
    const t = x.s.time;
    let k = 0;
    for (let i = 0; i < N; i++) if (plan[i].t <= t) k = i;
    if ((k > 0 && Math.abs(t - plan[k].t) < TOL_T) || (k + 1 < N && Math.abs(t - plan[k + 1].t) < TOL_T)) continue;
    const want = plan[k].preset, next = k + 1 < N ? plan[k + 1].preset : null;
    sceneSeen.add(k);
    if (!seen.length || seen[seen.length - 1] !== x.s.preset) seen.push(x.s.preset);
    if (x.s.preset !== want) { badOrder.push(`t=${t.toFixed(1)} '${x.s.preset}' expected '${want}'`); continue; }
    const pv = presetValues(want);
    if (pv && x.all) {
      for (const [key, v] of Object.entries(pv)) {
        if (SPEC_BY_KEY[key].hidden) continue;
        let e = key in FORCED ? FORCED[key] : v;
        if (key in CAPS) e = Math.min(v, CAPS[key]);
        if (key === 'master' && (SPEC.DEMO_TRIM || {})[want]) e = Math.max(SPEC_BY_KEY.master.min, v - SPEC.DEMO_TRIM[want]);   // (version 1.0.4: the master of a few presets of the tour goes down in the demo)
        if (!(Math.abs(x.all[key] - e) <= 1e-6 * Math.max(1, Math.abs(SPEC_BY_KEY[key].max - SPEC_BY_KEY[key].min)))) { badVals.push(`t=${t.toFixed(1)} ${want}: ${key}=${x.all[key]} expected ${e}`); break; }
      }
    }
    if (!(x.lbl && x.lbl.name === want && !x.lbl.dirty)) badLbl.push(`t=${t.toFixed(1)} label ${JSON.stringify(x.lbl)} expected '${want}' without dot`);
    if (!((x.sec || '').includes('Preset tour') && (x.sec || '').includes(`${k + 1}/${N}`) && (x.param || '').includes(want)))
      badText.push(`t=${t.toFixed(1)} sec '${x.sec}' param '${x.param}'`);
    else if (full && next && !(x.val || '').includes(next)) badText.push(`t=${t.toFixed(1)} next '${x.val}' (expected '${next}')`);
    // version 1.0.6: the chapter and the sentence of the presentation for the place in the tour
    const [wantChap, wantLine] = storyAt(k);
    if (x.text === wantLine && x.chap === wantChap) { introSeen.add(k); summarySeen++; } else badIntro.push(`t=${t.toFixed(1)} #${k + 1} chapter '${x.chap}' text '${x.text}' expected '${wantChap}' / '${wantLine}'`);
  }
  log(`  ${name}: presets in order of appearance (${seen.length}): ${seen.join(' | ')}`);
  check(seen[0] === start, `${name}: the tour starts at '${start}'`, `first preset '${seen[0]}'`);
  check(badOrder.length === 0, `${name}: at every moment the preset of the tour plan`, short(badOrder));
  check(badLbl.length === 0, `${name}: preset label shows exactly the tour preset (no modified dot)`, short(badLbl));
  check(badVals.length === 0, `${name}: each preset's spec values with Voices 16, Octave 0, Glide 0 forced and Amp Attack <= 0.08 s, Delay Mix <= 0.1, Delay Feedback <= 0.3, and the demo trim of the master`, short(badVals));
  check(badText.length === 0, `${name}: window shows 'Preset tour · n/${N}', 'Now playing: <preset>' and the next preset`, short(badText));
  if (intro) {
    const nIntro = full ? Math.min(STORY.length, N) : sceneSeen.size;   // the smoke run plays only the first presets of the tour: one sentence for each scene it went through
    check(badIntro.length === 0 && introSeen.size === nIntro && summarySeen > 0,
      `${name}: the window presents the synth, one sentence (with its chapter) per preset of the tour, in order`,
      `${short(badIntro, 4)}${badIntro.length ? '; ' : ''}sentences seen ${introSeen.size} of ${nIntro}, ${summarySeen} samples`);
  }
  if (full) {
    // one run plays every preset of the plan exactly once
    const lastWant = plan[N - 1].preset;
    log(`  ${name}: ${seen.length - 1} preset changes, ${new Set(seen).size} distinct presets of ${N}, last '${seen[seen.length - 1]}'`);
    // (the spec's TOUR repeats two sounds, and the plan wraps round once: the distinct names of the plan are the ones to count)
    const want = new Set(plan.map((p) => p.preset)).size;
    check(seen.length === N && new Set(seen).size === want, `${name}: all ${N} presets of the plan played in one run, in the plan's order`, `${seen.length} entries, ${new Set(seen).size} distinct (the plan has ${want})`);
    check(seen[seen.length - 1] === lastWant, `${name}: ends on '${lastWant}'`, `last '${seen[seen.length - 1]}'`);
  }
  const maxLv = Math.max(0, ...run.map((x) => x.lv));
  const lv = run.filter((x) => x.s.time > 1).map((x) => x.lv);
  check(maxLv <= 1.0, `${name}: no output level above 1.0`, `max ${maxLv}`);
  check(lv.filter((v) => v > 0.001).length / Math.max(1, lv.length) > 0.8, `${name}: sounds while playing`, `${lv.filter((v) => v > 0.001).length}/${lv.length} samples above -60 dBFS`, 'WARN');
  return seen.length;
}

// Test-only hook (every tab): records AudioContext.close() calls and the demo state at pagehide in localStorage.
const HOOK_SOURCE = `(() => {
  try {
    const origClose = AudioContext.prototype.close;
    AudioContext.prototype.close = function () {
      try { localStorage.setItem('mw.test.closed', JSON.stringify({ t: Date.now(), href: location.href, state: this.state })); } catch (e) {}
      return origClose.apply(this, arguments);
    };
  } catch (e) {}
  addEventListener('load', () => addEventListener('pagehide', () => {
    try { localStorage.setItem('mw.test.pagehide', JSON.stringify({ t: Date.now(), demo: WS_TEST.demoState().running, audio: WS_TEST.audioState() })); } catch (e) {}
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
  await A.evaluate(`localStorage.removeItem('mw.test.closed'); localStorage.removeItem('mw.test.pagehide'); true`);
  await A.evaluate('Promise.resolve(WS_TEST.start()).then(() => true)');
  await sleep(300);
  check(await A.evaluate('WS_TEST.audioState()') === 'running', "tab A: audioState() is 'running' after start()", await A.evaluate('WS_TEST.audioState()'));
  await A.evaluate('WS_TEST.demoStart()');
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
  // tab A is told by a message, then suspends its context (a promise): under a heavy load (the other lane of full.js) that takes longer than a second, so wait for it (version 1.0.6)
  for (let i = 0; i < 40; i++) { await sleep(250); if (await A.evaluate('WS_TEST.audioState()') === 'suspended' && !(await A.evaluate('WS_TEST.demoState()')).running) break; }
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
  const closed = JSON.parse((await A.evaluate(`localStorage.getItem('mw.test.closed')`)) || 'null');
  const ph = JSON.parse((await A.evaluate(`localStorage.getItem('mw.test.pagehide')`)) || 'null');
  log(`  after leaving tab B's page: AudioContext.close() record ${JSON.stringify(closed)}; state at pagehide ${JSON.stringify(ph)}`);
  check(!!closed, "pagehide closes the page's AudioContext (AudioContext.close() called)", JSON.stringify(closed));
  check(!!ph && ph.demo === false, 'pagehide stops the demo', JSON.stringify(ph));
  await T2.close();
  check(A.errors().length === 0 && T2.errors().length === 0, 'no console errors in either tab', short([...A.errors(), ...T2.errors()]));
  await A.evaluate(`localStorage.removeItem('mw.test.closed'); localStorage.removeItem('mw.test.pagehide'); true`);
}

// ------------------------------------------------------------------ main
async function main() {
  fs.mkdirSync(opt.out, { recursive: true });
  for (const f of fs.readdirSync(opt.out)) if (/\.(png|txt|mid)$/.test(f)) fs.rmSync(path.join(opt.out, f));
  log(`test_demo.js - web DEMO button${opt.smoke ? ' (smoke)' : ''}`);
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
    const song = await ev('WS_TEST.demoSong()');
    const ov1 = await ev(OVERLAY_EXPR), hb0 = await rectOf('.demo-btn');
    log(`  after 'Run the demo': ${JSON.stringify(wd)}, window ${ov1 && ov1.visible}, header '${hb0 && hb0.text}'`);
    check(!!wd && wd.song === song.title && (wd.preset === undefined || wd.preset === TOUR_START), `'Run the demo' plays the demo (${song.title}${wd && wd.preset ? ', from ' + TOUR_START : ''})`, JSON.stringify(wd));
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
    const api = await ev(`['demoStart','demoStop','demoState','demoSong','demoTour'].map(k => typeof (window.WS_TEST || {})[k])`);
    if (!check(api.every((t) => t === 'function'), 'WS_TEST exposes demoStart/demoStop/demoState/demoSong/demoTour', JSON.stringify(api))) throw new Error('no demo API');
    const names = await ev('WS_TEST.presets()');
    log(`  the demo: ${song.composer} - ${song.title} (${fmtT(song.duration)})`);
    check(song.license === 'Public Domain' && /Appassionata/.test(song.title) && Math.abs(song.duration - 119.104) < 0.01, 'the only song is Beethoven, Appassionata III (public domain, 119.1 s)', JSON.stringify(song));
    const startLabel = await ev(`(document.querySelector('.presets .pname') || {}).textContent || ''`);
    if (SPEC.DEFAULT_PRESET) check(startLabel.includes(SPEC.DEFAULT_PRESET), `the app opens on '${SPEC.DEFAULT_PRESET}'`, `label '${startLabel}'`);
    // the preset menu (click on the name) and WS_TEST.presets() list the factory presets in tools/spec.js order
    // (beta 0.2: the TOP Sounds, then each category's presets by rank: the array order has the 300 new presets before the 200 of beta 0.1)
    const inTop = new Set(SPEC.TOP_LIST), specNames = SPEC.TOP_LIST.map((i) => SPEC.PRESETS[i].name);   // (version 1.0.3: the TOP Sounds list of the plug-in, the best first)
    for (const c of SPEC.CATEGORIES) for (const p of SPEC.PRESETS.filter((q, i) => q.cat === c && !inTop.has(i)).sort((a, b) => a.rank - b.rank)) specNames.push(p.name);
    const menuItems = await ev(`(() => { const n = document.querySelector('.presets .pname'); if (!n) return null; n.click();
      const it = [...document.querySelectorAll('.pmenu .it')].map((e) => e.textContent.replace(/✕$/, ''));
      n.click(); return it; })()`);
    const menuWant = specNames;   // the menu shows each name whole (the letters before it are coloured)
    check(Array.isArray(menuItems) && menuWant.every((s, i) => menuItems[i] === s), `preset menu lists the ${specNames.length} factory presets in spec order`,
      JSON.stringify((menuItems || []).slice(0, 6)) + ' …');
    check(JSON.stringify(names.slice(0, specNames.length)) === JSON.stringify(specNames), 'WS_TEST.presets() follows the spec order', JSON.stringify(names.slice(0, 4)));
    const baseStartup = await snapshotAll();

    // ---- the button: no song menu any more
    begin('DEMO button (no arrow, no song menu, no MIDI file input)');
    const btn = await rectOf('.demo-btn');
    check(!!btn && btn.visible && /DEMO/.test(btn.text), "'▶ DEMO' button present", JSON.stringify(btn && btn.text));
    if (btn) log(`  button centre at device x ${(((btn.x - DEV.x) * 1100) / DEV.w).toFixed(0)} (CSS 222-286)`);
    const gone = await ev(`({ arrow: !!document.querySelector('.demo-arrow'), menu: !!document.querySelector('.demo-menu'), file: !!document.querySelector('#file-midi'),
      evalBtn: !!document.querySelector('.evalbtn') })`);
    check(!gone.arrow && !gone.menu && !gone.file, 'there is no arrow next to DEMO, no song menu and no MIDI file input', JSON.stringify(gone));
    check(!gone.evalBtn, 'there is no EVALUATE SOUNDS button in the header', JSON.stringify(gone));

    // ---- the demo from a cold start via the button
    begin(`Demo via '▶ DEMO' (cold start): ${song.title}`);
    await B.click(btn.x, btn.y);
    const started = await waitDemoTime(0, 10000);
    check(!!started, "'▶ DEMO' plays the demo directly (audio was not started)", JSON.stringify(started));
    if (!started) throw new Error('the demo did not start');
    check(started.song === song.title, 'the demo is the Appassionata', `'${started.song}'`);
    const st0 = await ev(SNAP_EXPR);
    check(/STOP/.test(st0.btn) && st0.win, "while running: '■ STOP', demo window visible", JSON.stringify({ btn: st0.btn, win: st0.win }));
    const isTour = typeof st0.s.preset === 'string';
    check(isTour, 'the demo is a preset tour (demoState().preset)', JSON.stringify(st0.s.preset));
    log(`  preset tour: ${isTour ? 'yes' : 'no'} (demoState().preset = ${JSON.stringify(st0.s.preset)})`);
    let shot = false;
    // smoke: the first seven presets of the tour (the first sentences of the presentation)
    const plan0 = isTour ? await ev('WS_TEST.demoTour()') : null;
    const smokeEnd = plan0 && plan0[6] ? plan0[6].t + 1.5 : 4 * TOUR_STEP + 2;
    const tourSamples = await follow(opt.smoke ? smokeEnd : song.duration + 6, async (s) => {
      if (!shot && s.s.time > 13) { shot = true; await B.screenshot(path.join(opt.out, 'tour_t13.png')); }
    });
    if (isTour) {
      const plan = plan0;
      planChecks(plan, song, 2);
      const n = tourChecks('tour', song, [st0, ...tourSamples], plan, !opt.smoke, true, TOUR_START);
      check(n >= (opt.smoke ? 5 : plan.length), `tour: at least ${opt.smoke ? 5 : plan.length} presets observed`, `${n}`);
    }
    if (opt.smoke) {
      const hb = await rectOf('.demo-btn');
      await B.click(hb.x, hb.y);
      check(await waitStopped(2000), "'■ STOP' stops the tour");
    } else {
      const last = tourSamples[tourSamples.length - 1];
      const lastT = Math.max(...tourSamples.filter((x) => x.s.running).map((x) => x.s.time));
      check(!last.s.running && lastT >= song.duration - 0.5 && lastT <= song.duration + 3.5, 'the demo ends by itself ~2.5 s after its last note',
        `last scene time ${lastT.toFixed(2)} s, duration ${song.duration} s`);
    }
    await checkRestored(baseStartup, 'demo (startup preset)');
    check(B.errors().length === 0, 'no console errors during the demo', short(B.errors()));

    // ---- a modified preset as baseline from here on
    await ev(`WS_TEST.loadPreset(${SPEC.TOP + 40})`);   // a new preset as the baseline
    await ev(`WS_TEST.setParam('f_cutoff', 5.5); WS_TEST.setParam('fx_rmix', 0.33); true`);
    await sleep(200);
    const base = await snapshotAll();
    log(`  baseline from here: '${base.label.replace(/<[^>]+>/g, ' ').trim()}' (modified)`);

    // ---- stop paths
    begin('Stop paths and restarts');
    const hb = await rectOf('.demo-btn');
    await B.click(hb.x, hb.y);
    await waitDemoTime(3);
    await B.key('Escape', { code: 'Escape' });
    check(await waitStopped(2000), 'Esc stops the demo');
    await checkRestored(base, 'Esc');
    if (opt.smoke) { check(B.errors().length === 0, 'no console errors', short(B.errors())); await lifecycleTests(); throw SMOKE_DONE; }
    await B.click(hb.x, hb.y);
    await waitDemoTime(3);
    const ws = await rectOf('.dw-stop');
    if (ws) await B.click(ws.x, ws.y);
    check(await waitStopped(2000), "the window's '■ STOP' stops the demo");
    await checkRestored(base, 'window STOP');
    await ev('WS_TEST.demoStart()');
    await sleep(500);
    await ev('WS_TEST.demoStop()');
    await ev('WS_TEST.demoStart()');
    const s3 = await waitDemoTime(1);
    check(!!s3 && s3.scene === 0, 'start -> stop -> start plays again from the beginning', JSON.stringify(s3));
    await ev('WS_TEST.demoStop()');
    await waitStopped(2000);
    await checkRestored(base, 'restart');

    // ---- Ctrl+click
    begin('Ctrl+click on a knob resets it to the default');
    const centre = (key) => { for (const sec of SPEC.SECTIONS) if (sec.view === undefined || sec.view <= 0) for (const w of sec.widgets) if (w.param === key) return [sec.x + w.x + w.w / 2, sec.y + w.y + w.h / 2]; return null; };
    for (const [key, x, y] of [['f_cutoff', ...centre('f_cutoff')], ['amp_a', ...centre('amp_a')]]) {
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
