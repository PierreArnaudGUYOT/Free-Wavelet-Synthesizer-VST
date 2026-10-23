// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// test_web.js - end-to-end test of the Okto MultiWave Synth web app in headless Edge.
//
//   node tests/web/test_web.js [--url <url>] [--out <dir>] [--quick] [--headed]
//
// Default URL: file:///.../Wavelet%20Synthesizer/web/index.html (derived from this file's location).
// Uses the page's test hook window.WS_TEST:
//   await start(); noteOn(note, vel0to1); noteOff(note); setParam(key, plain); getParam(key);
//   paramKeys(); getLevel() -> {peakL, peakR}; presets(); loadPreset(i); openManual('A'|'B'); closeManual()
// tools/spec.js (the single source of truth for parameters/presets) is used as oracle when present.
// beta 0.6: the welcome window at load (its choices, the keyboard, 'Play the synth' starts the audio) and the panel
// against the spec layout (cards, DOWNLOAD VST, one MANUAL button, no tempo SYNC, the credit, MIDI learn, preset browser).
// beta 0.7: the discreet credit at the bottom left under VOICE; TOP Sounds = OktoPierre's 22 sounds and Source Phase the
// last category (preset browser and preset menu).
// Writes <out>/report.txt and PNG screenshots. Exit code: 0 pass, 1 failures, 2 page/API missing.
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('./cdp');
const { decodePng, imageStats, imageDiff } = require('./png');

const ROOT = path.resolve(__dirname, '..', '..');
const opt = { url: null, out: path.join(__dirname, 'out'), quick: false, headed: false, fileAccess: true };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--url') opt.url = process.argv[++i];
  else if (a === '--out') opt.out = path.resolve(process.argv[++i]);
  else if (a === '--quick') opt.quick = true;
  else if (a === '--headed') opt.headed = true;
  else if (a === '--no-file-access') opt.fileAccess = false; // like a normal browser opening file://
  else if (a === '--steps') opt.steps = process.argv[++i].split(',');   // only these steps (welcome, params, panel, note, presets, engines, manuals, keyboard, portamento, polyporta, highnotes, mouse, stress, hashes); the audio start always runs
  else { console.log('usage: node test_web.js [--url URL] [--out DIR] [--quick] [--headed] [--no-file-access] [--steps welcome,manuals]'); process.exit(64); }
}
const want = (name) => !opt.steps || opt.steps.includes(name);
const PAGE = path.join(ROOT, 'web', 'index.html');
const BASE_URL = opt.url || pathToFileURL(PAGE).href;

let SPEC = null;
try { SPEC = require(path.join(ROOT, 'tools', 'spec.js')); } catch (_) { /* oracle optional */ }
const SPEC_BY_KEY = SPEC ? Object.fromEntries(SPEC.PARAMS.map((p) => [p.key, p])) : {};
const DEV_H = SPEC ? SPEC.DEVICE.h : 894;   // beta 0.3: the panel's height (the folder tabs of the oscillators added 34 px)
// DEFAULT_PRESET may be a preset name or an index
if (SPEC && typeof SPEC.DEFAULT_PRESET === 'number') SPEC.DEFAULT_PRESET = (SPEC.PRESETS[SPEC.DEFAULT_PRESET] || {}).name;

// ------------------------------------------------------------------ report
const lines = [];
const results = [];
let section = 'startup';
function log(s = '') { console.log(s); lines.push(s); }
function rec(sev, name, detail = '') {
  results.push({ sev, section, name, detail });
  log(`  [${sev}] ${name}${detail ? '  -- ' + detail : ''}`);
}
function check(ok, name, detail = '', failSev = 'FAIL') { rec(ok ? 'PASS' : failSev, name, ok ? '' : detail); return ok; }
function begin(name) { section = name; log(''); log(`=== ${name} ===`); }
function writeReport(abort) {
  const n = (s) => results.filter((r) => r.sev === s).length;
  log('');
  log('==================================== SUMMARY ====================================');
  log(`Page   : ${BASE_URL}`);
  if (abort) log(`RUN ABORTED: ${abort}`);
  log(`Checks : ${n('PASS')} PASS, ${n('WARN')} WARN, ${n('FAIL')} FAIL`);
  for (const sev of ['FAIL', 'WARN']) {
    const rs = results.filter((r) => r.sev === sev);
    if (!rs.length) continue;
    log(sev === 'FAIL' ? 'FAILURES:' : 'WARNINGS:');
    for (const r of rs) log(`  - [${r.section}] ${r.name}${r.detail ? '  -- ' + r.detail : ''}`);
  }
  log(`RESULT: ${n('FAIL') || abort ? 'FAIL' : 'PASS'}`);
  fs.mkdirSync(opt.out, { recursive: true });
  fs.writeFileSync(path.join(opt.out, 'report.txt'), lines.join('\n') + '\n');
  return n('FAIL') + (abort ? 1 : 0);
}
// beta 0.6: where the free VST plug-in is published (the header's DOWNLOAD VST and the welcome window's third choice)
const VST_URL = 'https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST/releases/latest';
// version 1.0.9: the owner's feedback form (Google Forms), opened by the header's SEND FEEDBACK and by the welcome window's fifth box
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdqkWNwanzcDDURcKepEK_U1P8b_HyR8B5_Gk48xtuQOYHqgQ/viewform';
const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
const short = (arr, max = 10) => (arr.length > max ? arr.slice(0, max).join('; ') + `; ... (${arr.length} total)` : arr.join('; '));

// ------------------------------------------------------------------ helpers
let B = null;
const shots = {};
async function shot(name, w, h) {
  const file = path.join(opt.out, name + '.png');
  const buf = await B.screenshot(file, w ? { width: w, height: h } : {});
  const img = decodePng(buf);
  shots[name] = img;
  const st = imageStats(img);
  log(`  screenshot ${name}.png (${img.width}x${img.height}, ${st.distinctColors} colours, luma std ${st.lumaStd.toFixed(1)})`);
  return { img, st };
}
const ev = (expr, t) => B.evaluate(expr, t);
const level = async () => {
  const l = await ev('Promise.resolve(WS_TEST.getLevel())');
  return l && typeof l === 'object' ? l : { peakL: NaN, peakR: NaN };
};
const peakOf = (l) => Math.max(Number(l.peakL), Number(l.peakR));

// wait until the level crosses a threshold; returns {ok, ms, peak, max}
async function waitLevel(pred, timeoutMs, intervalMs = 40) {
  const t0 = Date.now();
  let p = 0, max = 0, bad = null;
  while (Date.now() - t0 < timeoutMs) {
    const l = await level();
    p = peakOf(l);
    if (!Number.isFinite(p)) bad = l;
    max = Math.max(max, Number.isFinite(p) ? p : 0);
    if (pred(p)) return { ok: true, ms: Date.now() - t0, peak: p, max, bad };
    await sleep(intervalMs);
  }
  return { ok: false, ms: Date.now() - t0, peak: p, max, bad };
}

// play one note and report onset/peak/release
async function playNote(note, vel, holdMs, opts = {}) {
  const on = opts.on || (() => ev(`WS_TEST.noteOn(${note}, ${vel})`));
  const off = opts.off || (() => ev(`WS_TEST.noteOff(${note})`));
  await on();
  const up = await waitLevel((p) => p > (opts.onThreshold || 0.003), opts.onTimeout || 2500);
  let max = up.max;
  const tHold = Date.now();
  while (Date.now() - tHold < holdMs) { const p = peakOf(await level()); if (Number.isFinite(p)) max = Math.max(max, p); await sleep(40); }
  await off();
  const down = await waitLevel((p) => p < (opts.offThreshold || 0.001), opts.offTimeout || 6000);
  return { sounded: up.ok, onsetMs: up.ms, peak: max, released: down.ok, releaseMs: down.ms, residual: down.peak, nonFinite: up.bad || down.bad };
}

// ------------------------------------------------------------------ test steps
// Audio tap: wraps AudioNode.connect so that whatever the app connects to the destination is also
// recorded by a ScriptProcessor (test-only, parallel path through a zero-gain node).
const TAP_SOURCE = `(() => {
  const orig = AudioNode.prototype.connect;
  window.__wsTap = { chunks: [], rec: false, ctx: null };
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = orig.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode && !this.__wsTapped) {
        this.__wsTapped = true;
        const ctx = this.context;
        const sp = ctx.createScriptProcessor(4096, 2, 2);
        const z = ctx.createGain(); z.gain.value = 0;
        orig.call(this, sp); orig.call(sp, z); orig.call(z, ctx.destination);
        sp.onaudioprocess = (e) => {
          if (!window.__wsTap.rec) return;
          window.__wsTap.chunks.push({ t: e.playbackTime, L: Array.from(e.inputBuffer.getChannelData(0)), R: Array.from(e.inputBuffer.getChannelData(1)) });
        };
        window.__wsTap.ctx = ctx;
      }
    } catch (e) { /* tap is best effort */ }
    return r;
  };
})();`;

// Hann-windowed Goertzel amplitude (same estimator as the VST host)
function toneAmp(x, sr, f) {
  const n = x.length, w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0, ws = 0;
  for (let i = 0; i < n; i++) {
    const win = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    ws += win;
    const s0 = x[i] * win + c * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / ws;
}
const bandMax = (x, sr, f0, f1) => { let m = 0; for (let f = f0; f <= f1; f++) m = Math.max(m, toneAmp(x, sr, f)); return m; };
const dB = (a) => 20 * Math.log10(Math.max(a, 1e-12));

// Neutral patch: every spec default (A1 alone at 100 %; there is no Init preset in Okto MultiWave Synth).
const NEUTRAL_EXPR = () => `${SPEC_DEFAULTS_EXPR()} true`;
const SPEC_DEFAULTS_EXPR = () => (SPEC ? SPEC.PARAMS.filter((p) => !p.hidden).map((p) => `WS_TEST.setParam('${p.key}', ${p.def});`).join(' ') : '');

async function stepPortamento() {
  begin('Portamento (Off / On / Legato, mono and poly)');
  const keys = await ev('WS_TEST.paramKeys()');
  if (!keys.includes('v_porta')) { rec('WARN', 'Portamento parameter (v_porta) present', 'not in paramKeys()'); return; }
  if (!(await ev('!!(window.__wsTap && window.__wsTap.ctx)'))) { rec('WARN', 'audio tap available', 'could not tap the output; portamento not measured'); return; }
  const choices = SPEC_BY_KEY.v_porta ? SPEC_BY_KEY.v_porta.choices : ['Off', 'On', 'Legato'];
  const fB = 329.6276;
  const rows = [], bad = [];
  for (const voices of [1, 8]) for (let mode = 0; mode < 3; mode++) for (const scen of ['separated', 'legato']) {
    if (voices > 1 && mode === 1 && scen === 'legato') { log(`  (${choices[mode]}, 8 voices, legato: allocation-dependent - checked in the voice-allocation step)`); continue; }
    await ev(`${SPEC_DEFAULTS_EXPR()} WS_TEST.allNotesOff && WS_TEST.allNotesOff();
      WS_TEST.setParam('v_porta', ${mode}); WS_TEST.setParam('v_glide', 0.3); WS_TEST.setParam('v_voices', ${voices});
      WS_TEST.setParam('amp_r', 0.05); WS_TEST.setParam('fx_dmix', 0); WS_TEST.setParam('fx_rmix', 0); true`);
    await sleep(300);
    const r = await ev(`(async () => {
      const T = window.__wsTap, ctx = T.ctx, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      if (${voices} > 1) { for (let k = 0; k < 8; k++) WS_TEST.noteOn(100 + k, 0.3); await sleep(100); for (let k = 0; k < 8; k++) WS_TEST.noteOff(100 + k); await sleep(350); }
      T.chunks = []; T.rec = true;
      await sleep(250);
      const t1 = ctx.currentTime; WS_TEST.noteOn(57, 0.7);
      ${scen === 'separated' ? 'await sleep(400); WS_TEST.noteOff(57); await sleep(300);' : 'await sleep(500);'}
      const t2 = ctx.currentTime; WS_TEST.noteOn(64, 0.7);
      await sleep(800); WS_TEST.noteOff(64); WS_TEST.noteOff(57); await sleep(300);
      T.rec = false;
      return { t1, t2, sr: ctx.sampleRate, chunks: T.chunks };
    })()`, 30000);
    // assemble the recording (mono) and find the first onset
    const x = [];
    for (const c of r.chunks) for (let i = 0; i < c.L.length; i++) x.push(0.5 * (c.L[i] + c.R[i]));
    const on1 = x.findIndex((v) => Math.abs(v) > 0.01);
    const sr = r.sr;
    if (on1 < 0) { bad.push(`${choices[mode]} ${scen} ${voices}v: no sound recorded`); continue; }
    const on2 = on1 + Math.round((r.t2 - r.t1) * sr);
    const win = (a, b) => x.slice(on2 + Math.round(a * sr), on2 + Math.round(b * sr));
    const mid = win(0.07, 0.17), end = win(0.5, 0.6);
    const midDb = dB(bandMax(mid, sr, 245, 305)) - dB(toneAmp(mid, sr, fB));
    const endDb = dB(bandMax(end, sr, 245, 305)) - dB(toneAmp(end, sr, fB));
    const expectGlide = mode === 1 || (mode === 2 && scen === 'legato');
    const ok = (expectGlide ? midDb > 6 : midDb < -6) && endDb < -6;
    rows.push(`  ${choices[mode].padEnd(12)} ${String(voices).padEnd(6)} ${scen.padEnd(10)} ${midDb.toFixed(1).padStart(7)} ${endDb.toFixed(1).padStart(7)}  ${(expectGlide ? 'glide' : 'no glide').padEnd(9)} ${ok ? 'ok' : 'WRONG'}`);
    if (!ok) bad.push(`${choices[mode]} ${scen} ${voices} voice(s): +0.12 s ${midDb.toFixed(1)} dB, end ${endDb.toFixed(1)} dB (expected ${expectGlide ? 'glide' : 'no glide'})`);
  }
  log('  glide band (245-305 Hz) vs target E4 at +70..170 ms / +500..600 ms after the 2nd note (dB; > 0 = still gliding):');
  log(`  ${'mode'.padEnd(12)} ${'voices'.padEnd(6)} ${'notes'.padEnd(10)} ${'+0.12s'.padStart(7)} ${'+0.55s'.padStart(7)}  ${'expected'.padEnd(9)} result`);
  for (const r of rows) log(r);
  check(bad.length === 0, 'Portamento: Off never glides; Poly glides (mono; poly melody); Legato glides only when a key is held (mono and poly)', short(bad));
  await ev(`${NEUTRAL_EXPR()}; true`);
}

// Autocorrelation pitch estimate (same estimator as the VST host); 0 when no clear periodicity.
function estimatePitch(x, from, len, sr) {
  if (from < 0 || from + len > x.length) return 0;
  const minLag = Math.max(2, Math.floor(sr / 2000)), maxLag = Math.min(Math.floor(len / 2), Math.floor(sr / 40));
  const n = len - maxLag;
  if (n <= 0) return 0;
  const r = new Array(maxLag + 2).fill(0);
  let best = 0;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0, e0 = 0, e1 = 0;
    for (let i = 0; i < n; i++) { const a = x[from + i], b = x[from + i + lag]; s += a * b; e0 += a * a; e1 += b * b; }
    r[lag] = e0 > 0 && e1 > 0 ? s / Math.sqrt(e0 * e1) : 0;
    if (lag <= maxLag) best = Math.max(best, r[lag]);
  }
  if (best < 0.5) return 0;
  for (let lag = minLag + 1; lag <= maxLag; lag++)
    if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      const a = r[lag - 1], b = r[lag], c = r[lag + 1], den = a - 2 * b + c;
      return sr / (lag + (Math.abs(den) > 1e-12 ? (0.5 * (a - c)) / den : 0));
    }
  return 0;
}
const hzOf = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Polyphonic portamento, same cases and method as the VST host: "pluck" envelope so that held notes are
// silent at the next note-on; the start pitch (first 12 ms) of each new note must be nearest to the
// expected source pitch among the candidates (other sources and the target).
async function stepPolyPorta() {
  begin('Polyphonic portamento (voice allocation)');
  const keys = await ev('WS_TEST.paramKeys()');
  if (!keys.includes('v_porta') || !(await ev('!!(window.__wsTap && window.__wsTap.ctx)'))) { rec('WARN', 'polyphonic portamento measurable', 'no v_porta or no audio tap'); return; }
  const bad = [];
  // events: [ms, 'on'|'off', note]; returns mono samples, sample rate and the onset sample of every 'on'
  const run = async (mode, pluck, release, events) => {
    await ev(`${SPEC_DEFAULTS_EXPR()} WS_TEST.allNotesOff && WS_TEST.allNotesOff();
      WS_TEST.setParam('v_porta', ${mode}); WS_TEST.setParam('v_glide', 0.4); WS_TEST.setParam('v_voices', 8);
      WS_TEST.setParam('amp_r', ${release}); ${pluck ? "WS_TEST.setParam('amp_s', 0); WS_TEST.setParam('amp_d', 0.12);" : ''} true`);
    await sleep(400);
    const r = await ev(`(async () => {
      const T = window.__wsTap, ctx = T.ctx, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const ev = ${JSON.stringify(events)};
      for (let k = 0; k < 8; k++) WS_TEST.noteOn(100 + k, 0.3);   // prime the voice history (far away)
      await sleep(100); for (let k = 0; k < 8; k++) WS_TEST.noteOff(100 + k); await sleep(350);
      T.chunks = []; T.rec = true;
      await sleep(250);
      const t0 = performance.now(), times = [];
      for (const [ms, kind, note] of ev) {
        const wait = ms - (performance.now() - t0); if (wait > 0) await sleep(wait);
        if (kind === 'on') { times.push(ctx.currentTime); WS_TEST.noteOn(note, 0.5); } else WS_TEST.noteOff(note);
      }
      await sleep(700); T.rec = false;
      return { times, sr: ctx.sampleRate, chunks: T.chunks };
    })()`, 30000);
    const x = [];
    for (const c of r.chunks) for (let i = 0; i < c.L.length; i++) x.push(0.5 * (c.L[i] + c.R[i]));
    const sr = r.sr;
    const first = x.findIndex((v) => Math.abs(v) > 0.003);
    // onset of each note: predicted from the first onset + context time, refined to the first sample
    // above threshold within -15..+15 ms when the signal was quiet before (pluck cases)
    const ons = r.times.map((t) => first + Math.round((t - r.times[0]) * sr));
    // refine each predicted onset (message/timer jitter of a few ms): first sample within -25..+25 ms whose level
    // jumps above 3x the residual of the preceding 15 ms (earlier notes may still be decaying)
    const refined = ons.map((o) => {
      const a = Math.round(0.025 * sr), w = Math.round(0.015 * sr);
      let base = 0; for (let i = Math.max(0, o - a - w); i < o - a; i++) base = Math.max(base, Math.abs(x[i]));
      const thr = Math.max(0.003, 3 * base);
      for (let i = Math.max(0, o - a); i < Math.min(x.length, o + a); i++) if (Math.abs(x[i]) > thr) return i;
      return o;
    });
    return { x, sr, ons: refined };
  };
  const judge = (what, f, expect, cands) => {
    let nearest = expect, best = 1e9;
    for (const c of cands) { const d = Math.abs(12 * Math.log2(f / hzOf(c))); if (d < best) { best = d; nearest = c; } }
    const ok = f > 0 && nearest === expect && best < 1.5;
    log(`    ${what.padEnd(44)} start ${f.toFixed(1).padStart(7)} Hz  expected ${hzOf(expect).toFixed(1).padStart(7)} Hz (MIDI ${expect})  nearest MIDI ${nearest}  ${ok ? 'ok' : 'WRONG'}`);
    if (!ok) bad.push(`${what}: starts at ${f.toFixed(1)} Hz (nearest MIDI ${nearest}), expected MIDI ${expect}`);
  };
  const start = (r, k) => estimatePitch(r.x, r.ons[k], Math.round(0.012 * r.sr), r.sr);

  log('  1. Poly, one note at a time (release 1.5 s tails): 60 -> 64 -> 67');
  // the first note is held 1.2 s so that its voice settles (it glides in from the primed pitch)
  let r = await run(1, false, 1.5, [[0, 'on', 60], [1200, 'off', 60], [1450, 'on', 64], [1700, 'off', 64], [1950, 'on', 67], [2200, 'off', 67]]);
  judge('64 starts from 60', start(r, 1), 60, [60, 64, 67]);
  judge('67 starts from 64', start(r, 2), 64, [60, 64, 67]);
  for (const mode of [1, 0]) {
    log(`  2. ${mode ? 'Poly' : 'Off'}: hold C4-E4-G4, release, then F4 / A4 / C5 (each while the previous are held)`);
    // the first chord is held 1.2 s so that its voices settle (they glide in from the primed pitches)
    r = await run(mode, true, 0.05, [[0, 'on', 60], [1, 'on', 64], [2, 'on', 67], [1200, 'off', 60], [1200, 'off', 64], [1200, 'off', 67],
      [1650, 'on', 65], [2050, 'on', 69], [2450, 'on', 72], [2950, 'off', 65], [2950, 'off', 69], [2950, 'off', 72]]);
    if (mode) {
      judge('F4 (first note, most recent free voice = G4)', start(r, 3), 67, [60, 64, 67, 65]);
      judge('A4 (nearest free voice = E4)', start(r, 4), 64, [60, 64, 67, 65, 69]);
      judge('C5 (nearest free voice = C4)', start(r, 5), 60, [60, 64, 67, 69, 72]);
    } else {
      judge('Off: F4 starts on its own pitch', start(r, 3), 65, [60, 64, 67, 65]);
      judge('Off: A4 starts on its own pitch', start(r, 4), 69, [60, 64, 67, 65, 69]);
      judge('Off: C5 starts on its own pitch', start(r, 5), 72, [60, 64, 67, 69, 72]);
    }
  }
  log('  3. Legato only, 8 voices: 60 released, then 67; 67 held, then 72');
  r = await run(2, true, 0.05, [[0, 'on', 60], [300, 'off', 60], [750, 'on', 67], [1150, 'on', 72], [1800, 'off', 72], [1800, 'off', 67]]);
  judge('67 after a released 60 (no glide)', start(r, 1), 67, [60, 67]);
  judge('72 while 67 is held (glides from 67)', start(r, 2), 67, [60, 67, 72]);
  check(bad.length === 0, 'polyphonic portamento: melody glides from the previous note, chord change voice by voice (G->F, E->A, C->C5), Legato from the held note, Off never glides', short(bad));
  await ev(`${NEUTRAL_EXPR()}; true`);
}

// Security regression: notes far above Nyquist (before the fix: NaN output, synth muted until reload)
async function stepHighNotes() {
  begin('High notes above Nyquist (security regression)');
  if (!(await ev('!!(window.__wsTap && window.__wsTap.ctx)'))) { rec('WARN', 'high notes measurable', 'no audio tap'); return; }
  const sr = await ev('window.__wsTap.ctx.sampleRate');
  const bad = [];
  for (const [oct, note] of [[3, 127], [3, 115], [2, 127]]) {
    await ev(`${SPEC_DEFAULTS_EXPR()} WS_TEST.allNotesOff && WS_TEST.allNotesOff(); WS_TEST.setParam('v_oct', ${oct}); WS_TEST.setParam('sub_level', 0.8); true`);
    await sleep(300);
    const r = await ev(`(async () => {
      const T = window.__wsTap, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      T.chunks = []; T.rec = true;
      const lv = []; WS_TEST.noteOn(${note}, 0.8);
      for (let i = 0; i < 20; i++) { await sleep(50); const l = WS_TEST.getLevel(); lv.push(l.peakL, l.peakR); }
      WS_TEST.noteOff(${note}); await sleep(300); T.rec = false;
      let n = 0, nonFinite = 0, peak = 0;
      for (const c of T.chunks) for (const a of [c.L, c.R]) for (const v of a) { n++; if (!Number.isFinite(v)) nonFinite++; else peak = Math.max(peak, Math.abs(v)); }
      return { lvBad: lv.filter((v) => !Number.isFinite(v)).length, lvMax: Math.max(...lv.filter(Number.isFinite)), n, nonFinite, peak };
    })()`, 20000);
    // a later note must be audible: C4 with the same Octave (sounds C7), then C4 with Octave 0
    const later = async () => {
      await ev('WS_TEST.noteOn(60, 0.8); true');
      let m = 0, nf = 0;
      for (let i = 0; i < 10; i++) { await sleep(60); const l = await ev('WS_TEST.getLevel()'); if (!Number.isFinite(l.peakL) || !Number.isFinite(l.peakR)) nf++; else m = Math.max(m, l.peakL, l.peakR); }
      await ev('WS_TEST.noteOff(60); true');
      await sleep(300);
      return { m, nf };
    };
    const c7 = await later();
    await ev(`WS_TEST.setParam('v_oct', 0); true`);
    const c4 = await later();
    const f0 = 440 * Math.pow(2, (note + 12 * oct - 69) / 12);
    log(`  Octave ${oct > 0 ? '+' : ''}${oct} note ${note} (f0 ${f0.toFixed(0)} Hz, sr ${sr}): ${r.n} samples, non-finite ${r.nonFinite}, peak ${r.peak.toFixed(4)}; getLevel non-finite ${r.lvBad}; then C4 at Octave ${oct}: ${c7.m.toFixed(3)}, C4 at Octave 0: ${c4.m.toFixed(3)}`);
    if (r.nonFinite || r.lvBad) bad.push(`oct ${oct} note ${note}: ${r.nonFinite} non-finite samples, ${r.lvBad} non-finite levels`);
    if (!(c7.m > 0.003 && c4.m > 0.003) || c7.nf || c4.nf) bad.push(`oct ${oct} note ${note}: later C4 not audible (${c7.m.toFixed(4)} / ${c4.m.toFixed(4)})`);
  }
  check(bad.length === 0, 'Octave +3 note 127/115 and Octave +2 note 127: output stays finite and later notes are audible', short(bad));
  check(B.errors().length === 0, 'no console errors with high notes', short(B.errors()));
  await ev(`${NEUTRAL_EXPR()}; true`);
}

async function stepLoad() {
  begin('Load');
  const t0 = Date.now();
  try { await B.navigate(BASE_URL); } catch (e) { rec('FAIL', 'page loads', e.message); return false; }
  await sleep(1500);
  const errs = B.errors(t0);
  check(errs.length === 0, 'page loads without console errors / uncaught exceptions / failed resources', short(errs));
  const api = await ev(`(() => { const t = window.WS_TEST; if (!t) return null;
    return Object.fromEntries(['start','noteOn','noteOff','setParam','getParam','paramKeys','getLevel','presets','loadPreset','openManual','closeManual','allNotesOff'].map(k => [k, typeof t[k]])); })()`);
  if (!check(!!api, 'window.WS_TEST test hook exists', 'window.WS_TEST is undefined')) return false;
  const missing = Object.entries(api).filter(([k, t]) => t !== 'function' && k !== 'allNotesOff').map(([k]) => k);
  check(missing.length === 0, 'WS_TEST exposes the agreed API', 'missing: ' + missing.join(', '));
  if (SPEC && SPEC.DEFAULT_PRESET) {
    // the app opens on DEFAULT_PRESET (spec defaults + preset values)
    const pr = SPEC.PRESETS.find((p) => p.name === SPEC.DEFAULT_PRESET);
    const want = Object.assign({}, ...SPEC.PARAMS.map((p) => ({ [p.key]: p.def })), pr.v);
    const st0 = await ev(`({ vals: Object.fromEntries(WS_TEST.paramKeys().map(k => [k, WS_TEST.getParam(k)])),
      label: (document.querySelector('.presets .pname') || {}).textContent || '' })`);
    const bad = Object.entries(want).filter(([k, v]) => !(Math.abs(st0.vals[k] - v) <= 1e-6 * Math.max(1, Math.abs(SPEC_BY_KEY[k].max - SPEC_BY_KEY[k].min)))).map(([k, v]) => `${k}=${st0.vals[k]} (want ${v})`);
    log(`  startup preset label: '${st0.label.trim()}'`);
    check(st0.label.includes(SPEC.DEFAULT_PRESET) && bad.length === 0, `the app opens on '${SPEC.DEFAULT_PRESET}' (label and all values)`,
      `label '${st0.label.trim()}'; ` + short(bad));
  }
  log(`  (info) WS_TEST.allNotesOff: ${api.allNotesOff}`);
  for (const [w, h] of [[1124, 902], [1280, 860], [1920, 1080]]) {
    const { st } = await shot(`load_${w}x${h}`, w, h);
    check(st.distinctColors > 8 && st.lumaStd > 2, `page renders non-blank content at ${w}x${h}`, `${st.distinctColors} colours`);
    const ov = await ev(`({sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight})`);
    check(ov.sw <= ov.w + 1 && ov.sh <= ov.h + 1, `no scrollbars / overflow at ${w}x${h}`,
      `document ${ov.sw}x${ov.sh} vs viewport ${ov.w}x${ov.h}`, 'WARN');
  }
  await B.setViewport(1280, 860);
  return true;
}

// The welcome window (beta 0.6) as the page shows it at load (no #noaudio): its four boxes, the keyboard, then
// "Play the synth" starts the audio (a real click: the browser's user gesture). "Run the demo" is in test_demo.js.
const WELCOME_EXPR = `(() => { const o = document.getElementById('start-overlay'); if (!o) return null;
  const cs = getComputedStyle(o), q = (s) => o.querySelector(s);
  return { visible: !o.classList.contains('gone') && cs.display !== 'none' && cs.visibility !== 'hidden',
    title: (q('h1') || {}).textContent || '', sub: (q('#w-sub') || {}).textContent || '',
    choices: [...o.querySelectorAll('.choice')].map((c) => ({ id: c.id, tag: c.tagName, title: (c.querySelector('b') || {}).textContent || '',
      small: (c.querySelector('small') || {}).textContent || '', href: c.getAttribute('href'), target: c.getAttribute('target'), rel: c.getAttribute('rel') })),
    manuals: [...o.querySelectorAll('.foot a')].map((a) => a.getAttribute('href')),
    inert: !!(document.getElementById('stage').inert && document.getElementById('statusbar').inert) }; })()`;
const centreOf = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);

async function stepWelcome() {
  begin('Welcome window');
  const t0 = Date.now();
  const w = await ev(WELCOME_EXPR);
  if (!check(!!w && w.visible, 'the welcome window is shown when the page opens', JSON.stringify(w))) return;
  await shot('welcome');
  log(`  title '${w.title}'; choices: ${w.choices.map((c) => c.title).join(' | ')}`);
  check(/OKTOMULTIWAVE/.test(w.title) && /Wavelet Synthesizer/.test(w.title), "its title is 'OKTOMULTIWAVE · Wavelet Synthesizer'", w.title);
  const titles = w.choices.map((c) => c.title);
  // version 1.0.14 (the owner: "met 'run the demo' au milieu, pour le mettre bien en valeur"): Run the demo is the middle one of the three boxes of the first row, highlighted
  check(JSON.stringify(titles) === JSON.stringify(['Play the synth', 'Run the demo', 'Download the VST', 'Learn more about the sound engine', 'Send your feedback']), 'five boxes: Play the synth, Run the demo (in the middle), Download the VST, Learn more about the sound engine, Send your feedback', JSON.stringify(titles));
  const demo = w.choices[1] || {}, play = w.choices.find((c) => c.id === 'start-btn'), dl = w.choices[2] || {};
  check(demo.small.trim() === 'and play the Synth' && demo.id === 'w-demo', "'Run the demo' (#w-demo) says only 'and play the Synth' under it (version 1.0.14: the main information only)", JSON.stringify(demo));
  const hl = await ev("(() => { const d = document.getElementById('w-demo'), p = document.getElementById('start-btn'); const a = getComputedStyle(d), b = getComputedStyle(p); return { demo: d.classList.contains('demo'), bgDemo: a.backgroundImage, bgPlay: b.backgroundImage, wDemo: d.getBoundingClientRect().width, wPlay: p.getBoundingClientRect().width }; })()");
  check(hl.demo && /gradient/.test(hl.bgDemo) && hl.bgDemo !== hl.bgPlay && hl.wDemo > hl.wPlay, "'Run the demo' is highlighted (its own gradient, a little larger than the other boxes)", JSON.stringify(hl));
  check(!!play && play.title === 'Play the synth' && play.small.trim() === 'MIDI supported', "'Play the synth' is #start-btn and says only 'MIDI supported'", JSON.stringify(play));
  check(dl.tag === 'A' && dl.href === VST_URL && dl.target === '_blank' && /\bnoopener\b/.test(dl.rel || ''), `'Download the VST' opens ${VST_URL} in a new tab (rel noopener)`, JSON.stringify(dl));
  check(w.manuals.length === 1 && /manual\.html$/.test(w.manuals[0]), 'its footer links to the manual (the contents page)', JSON.stringify(w.manuals));
  // version 1.0.9: the fifth box opens the feedback form in a new tab (no referrer sent), the same address as the header's SEND FEEDBACK
  const fbBox = w.choices.find((c) => c.id === 'w-feedback') || {};
  check(fbBox.tag === 'A' && fbBox.href === FEEDBACK_URL && fbBox.target === '_blank' && /\bnoopener\b/.test(fbBox.rel || '') && /\bnoreferrer\b/.test(fbBox.rel || '') && /no account needed/.test(fbBox.small || ''),
    `'Send your feedback' (#w-feedback) opens ${FEEDBACK_URL} in a new tab (rel noopener noreferrer) and says no account is needed`, JSON.stringify(fbBox));
  // the fourth box: a link to the introduction to wavelets (a new tab with Ctrl / Shift / Cmd), shown in the manual viewer over the window; nothing starts the audio
  const learn = w.choices.find((c) => c.id === 'w-learn') || {};
  check(learn.tag === 'A' && /manual\/wavelets\.html$/.test(learn.href || '') && learn.target === '_blank' && /\bnoopener\b/.test(learn.rel || '') && /wavelet transform/.test(learn.small || ''),
    "'Learn more about the sound engine' (#w-learn) links to manual/wavelets.html and speaks of the wavelet transform", JSON.stringify(learn));
  {
    const lc = await centreOf('#w-learn');
    await B.click(lc.x, lc.y);
    await sleep(700);
    const m = await ev(`({ open: !document.getElementById('manual-overlay').hidden, src: document.getElementById('manual-iframe').getAttribute('src') || '', tab: document.getElementById('manual-newtab').getAttribute('href') })`);
    const wl = await ev(WELCOME_EXPR), au = await ev('WS_TEST.audioState()');
    check(m.open && m.src === 'manual/wavelets.html' && m.tab === 'manual/wavelets.html' && wl.visible && au === 'none', "a click on that box opens the introduction to wavelets over the welcome window and starts no audio", JSON.stringify({ m, window: wl.visible, audio: au }));
    await B.key('Escape', { code: 'Escape' });
    await sleep(300);
    const m2 = await ev("document.getElementById('manual-overlay').hidden"), wl2 = await ev(WELCOME_EXPR);
    check(m2 === true && wl2.visible && (await ev('WS_TEST.audioState()')) === 'none', 'Esc closes the manual and the welcome window is still there, the audio still off', JSON.stringify({ hidden: m2, window: wl2.visible }));
    // the owner's rule, nothing overlaps: the five boxes sit inside the window and apart from each other, on a desktop and on a phone
    const boxes = `(() => { const w = document.querySelector('.welcome').getBoundingClientRect(); const r = [...document.querySelectorAll('.welcome .choice')].map((c) => { const q = c.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom]; }); return { w: [w.left, w.top, w.right, w.bottom], r }; })()`;
    for (const [vw, vh] of [[1280, 860], [390, 800]]) {
      await B.setViewport(vw, vh);
      await sleep(300);
      const g = await ev(boxes), bad = [];
      g.r.forEach((p, i) => {
        if (p[0] < g.w[0] - 0.5 || p[2] > g.w[2] + 0.5 || p[1] < g.w[1] - 0.5 || p[3] > g.w[3] + 0.5) bad.push('box ' + (i + 1) + ' leaves the window');
        g.r.forEach((q, j) => { if (j > i && p[0] < q[2] - 0.5 && q[0] < p[2] - 0.5 && p[1] < q[3] - 0.5 && q[1] < p[3] - 0.5) bad.push('boxes ' + (i + 1) + ' and ' + (j + 1) + ' overlap'); });
      });
      check(g.r.length === 5 && bad.length === 0, `the five boxes of the welcome window sit apart and inside it (${vw} px wide)`, bad.join('; ') || g.r.length + ' boxes');
    }
    await B.setViewport(1280, 860);
    await sleep(200);
  }
  check(w.inert, 'the panel and the status bar behind it are inert while it is shown', 'stage / statusbar not inert');
  // keyboard: Tab goes to a choice of the window (the panel behind is inert), with a visible focus ring
  await B.key('Tab', { code: 'Tab' });
  await sleep(150);
  const f = await ev(`(() => { const a = document.activeElement; if (!a) return null; const cs = getComputedStyle(a);
    return { inside: !!a.closest('#start-overlay'), id: a.id, outline: cs.outlineStyle + ' ' + cs.outlineWidth }; })()`);
  check(!!f && f.inside && !/^none/.test(f.outline), 'Tab moves the focus into the window, with a visible focus ring', JSON.stringify(f));
  // Download: the page stays as it is (the new tab itself is cancelled here: the test needs no network)
  await ev(`document.getElementById('w-vst').addEventListener('click', (e) => { window.__wsDl = (window.__wsDl || 0) + 1; e.preventDefault(); }, { once: true }); true`);
  const d = await centreOf('#w-vst');
  await B.click(d.x, d.y);
  await sleep(400);
  const w2 = await ev(WELCOME_EXPR), clicked = await ev('window.__wsDl || 0'), st0 = await ev('WS_TEST.audioState()');
  check(clicked === 1 && w2.visible && st0 === 'none', "a click on 'Download the VST' leaves the window open and starts no audio", `click ${clicked}, window ${w2.visible}, audio '${st0}'`);
  // Feedback (version 1.0.9): the same, the form's new tab cancelled here
  await ev(`document.getElementById('w-feedback').addEventListener('click', (e) => { window.__wsFb = (window.__wsFb || 0) + 1; e.preventDefault(); }, { once: true }); true`);
  const fbc = await centreOf('#w-feedback');
  await B.click(fbc.x, fbc.y);
  await sleep(400);
  const w2f = await ev(WELCOME_EXPR), clickedFb = await ev('window.__wsFb || 0'), stFb = await ev('WS_TEST.audioState()');
  check(clickedFb === 1 && w2f.visible && stFb === 'none', "a click on 'Send your feedback' leaves the window open and starts no audio", `click ${clickedFb}, window ${w2f.visible}, audio '${stFb}'`);
  // Play: starts the audio, closes the window, plays no note
  const p = await centreOf('#start-btn');
  await B.click(p.x, p.y);
  let st = 'none';
  for (let i = 0; i < 100 && st !== 'running'; i++) { await sleep(100); st = await ev('WS_TEST.audioState()'); }
  const w3 = await ev(WELCOME_EXPR);
  check(st === 'running' && !w3.visible && !w3.inert, "'Play the synth' starts the audio and closes the window (the panel usable again)",
    `audio '${st}', window ${w3.visible}, inert ${w3.inert}`);
  const noise = await waitLevel((pk) => pk > 0.001, 800);
  check(!noise.ok, "'Play the synth' plays no note", `level ${noise.peak}`);
  check(B.errors(t0).length === 0, 'no console errors in the welcome window', short(B.errors(t0)));
}

async function stepStart() {
  begin('Start audio');
  const t0 = Date.now();
  let ok = true;
  try { await ev('Promise.resolve(WS_TEST.start()).then(() => true)', 15000); }
  catch (e) { ok = false; rec('FAIL', 'WS_TEST.start() resolves', e.message); }
  if (ok) check(true, 'WS_TEST.start() resolves', '');
  log(`  start() took ${Date.now() - t0} ms`);
  const l = await level();
  check(Number.isFinite(Number(l.peakL)) && Number.isFinite(Number(l.peakR)), 'getLevel() returns numeric {peakL, peakR}', JSON.stringify(l));
  const idle = await waitLevel((p) => p < 0.001, 2000);
  check(idle.ok, 'silence when idle after start()', `peak ${idle.peak}`, 'WARN');
  await sleep(300);
  for (const [w, h] of [[1124, 902], [1280, 860], [1920, 1080]]) await shot(`ui_${w}x${h}`, w, h);
  await B.setViewport(1280, 860);
  await sleep(300);
  await shot('ui_1280x860_ref');
  const errs = B.errors(t0);
  check(errs.length === 0, 'no console errors while starting audio', short(errs));
  return ok;
}

async function stepParams() {
  begin('Parameters');
  const keys = await ev('WS_TEST.paramKeys()');
  if (!check(Array.isArray(keys) && keys.length > 0, 'paramKeys() returns a non-empty array', JSON.stringify(keys))) return [];
  log(`  ${keys.length} parameter keys`);
  if (SPEC) {
    const specKeys = SPEC.PARAMS.map((p) => p.key);
    const missing = specKeys.filter((k) => !keys.includes(k)), extra = keys.filter((k) => !specKeys.includes(k));
    check(missing.length === 0, 'every spec parameter is exposed (tools/spec.js)', 'missing: ' + missing.join(', '));
    check(extra.length === 0, 'no parameters beyond the spec', 'extra: ' + extra.join(', '), 'WARN');
  }
  // read, range-check, set/get round-trip and clamping, all inside the page for speed
  const spec = SPEC ? SPEC.PARAMS.map((p) => ({ key: p.key, min: p.min, max: p.max, def: p.def, curve: p.curve })) : [];
  const res = await ev(`(() => {
    const spec = ${JSON.stringify(spec)}; const S = Object.fromEntries(spec.map(p => [p.key, p]));
    const out = { bad: [], range: [], rt: [], clamp: [], values: {} };
    for (const k of WS_TEST.paramKeys()) {
      const v0 = WS_TEST.getParam(k); out.values[k] = v0;
      if (typeof v0 !== 'number' || !isFinite(v0)) { out.bad.push(k + '=' + v0); continue; }
      const s = S[k]; if (!s) continue;
      if (v0 < s.min - 1e-9 || v0 > s.max + 1e-9) out.range.push(k + '=' + v0 + ' not in [' + s.min + ',' + s.max + ']');
      let t = s.min + (s.max - s.min) * 0.37; if (s.curve === 'int' || s.curve === 'choice') t = Math.round(t);
      WS_TEST.setParam(k, t); const g = WS_TEST.getParam(k);
      if (!(Math.abs(g - t) <= 1e-6 * Math.max(1, Math.abs(s.max - s.min)))) out.rt.push(k + ': set ' + t + ' got ' + g);
      WS_TEST.setParam(k, s.max + (s.max - s.min) * 10); const hi = WS_TEST.getParam(k);
      WS_TEST.setParam(k, s.min - (s.max - s.min) * 10); const lo = WS_TEST.getParam(k);
      if (!(hi <= s.max + 1e-9 && lo >= s.min - 1e-9)) out.clamp.push(k + ': ' + lo + '..' + hi);
      WS_TEST.setParam(k, v0);
    }
    return out; })()`);
  check(res.bad.length === 0, 'getParam returns finite numbers for every key', short(res.bad));
  if (SPEC) {
    check(res.range.length === 0, 'current values within the spec ranges', short(res.range));
    check(res.rt.length === 0, 'setParam/getParam round-trip (plain values)', short(res.rt));
    check(res.clamp.length === 0, 'setParam clamps out-of-range values to [min, max]', short(res.clamp), 'WARN');
    const nonDef = Object.entries(res.values).filter(([k, v]) => SPEC_BY_KEY[k] && Math.abs(v - SPEC_BY_KEY[k].def) > 1e-6).map(([k, v]) => `${k}=${v}`);
    log(`  (info) values differing from spec defaults at startup (initial preset?): ${nonDef.join(', ') || 'none'}`);
  }
  return keys;
}

async function stepNote() {
  begin('Note on / off');
  const t0 = Date.now();
  const r = await playNote(60, 0.8, 600);
  log(`  C4: sound after ${r.onsetMs} ms, peak ${db(r.peak)} dBFS, back below -60 dBFS ${r.releaseMs} ms after noteOff (residual ${r.residual})`);
  check(r.sounded && r.peak > 0, 'noteOn(60, 0.8) makes the output level rise above 0', `peak ${r.peak}`);
  check(r.released, 'level returns to ~0 (< 0.001) after noteOff + release', `still ${r.residual} after ${r.releaseMs} ms`);
  check(!r.nonFinite, 'getLevel stays finite', JSON.stringify(r.nonFinite));
  check(r.peak <= 1.0, 'single note does not clip (peak <= 0 dBFS)', `peak ${r.peak}`, 'WARN');
  // a low and a high note
  for (const n of [24, 96]) {
    const q = await playNote(n, 0.8, 300);
    log(`  MIDI ${n}: peak ${db(q.peak)} dBFS, released ${q.released}`);
    check(q.sounded && q.released, `MIDI ${n} sounds and releases`, `sounded ${q.sounded}, residual ${q.residual}`);
  }
  const errs = B.errors(t0);
  check(errs.length === 0, 'no console errors while playing', short(errs));
}

async function stepPresets() {
  begin('Presets');
  const names = await ev('WS_TEST.presets()');
  if (!check(Array.isArray(names) && names.length > 0, 'presets() returns a non-empty array', JSON.stringify(names))) return;
  log(`  ${names.length} presets`);
  if (SPEC) {
    // the menu lists the TOP Sounds, then each category's presets by rank (beta 0.2: not the array order, which has the 300 new presets before the 200 of beta 0.1)
    const inTop = new Set(SPEC.TOP_LIST), sn = SPEC.TOP_LIST.map((i) => SPEC.PRESETS[i].name);   // (version 1.0.3: the TOP Sounds list of the plug-in, the best first)
    for (const c of SPEC.CATEGORIES) for (const p of SPEC.PRESETS.filter((q, i) => q.cat === c && !inTop.has(i)).sort((a, b) => a.rank - b.rank)) sn.push(p.name);
    check(names.length === sn.length, 'preset count matches the spec', `${names.length} vs ${sn.length}`);
    const diff = sn.map((n, i) => (names[i] !== n ? `#${i} '${names[i]}' vs spec '${n}'` : null)).filter(Boolean);
    check(diff.length === 0, 'preset names/order match the spec', short(diff), 'WARN');
  }
  const silent = [], stuck = [], errsAll = [], valueBad = [], notReset = [], sameShot = [];
  log(`  ${'#'.padEnd(3)} ${'name'.padEnd(22)} ${'peak dB'.padStart(8)} ${'onset ms'.padStart(9)} ${'release ms'.padStart(11)}`);
  let prevImg = shots.ui_1280x860_ref;
  let prevVals = await ev(`JSON.stringify(WS_TEST.paramKeys().map(k => WS_TEST.getParam(k)))`);
  for (let i = 0; i < names.length; i++) {
    const t0 = Date.now();
    await ev(`WS_TEST.loadPreset(${i})`);
    await sleep(250);
    const specPreset = SPEC && SPEC.PRESETS.find((p) => p.name === names[i]);
    if (specPreset) {
      const v = specPreset.v;
      const vals = await ev(`Object.fromEntries(WS_TEST.paramKeys().map(k => [k, WS_TEST.getParam(k)]))`);
      for (const [k, x] of Object.entries(v))
        if (!(Math.abs(vals[k] - x) <= 1e-6 * Math.max(1, Math.abs(SPEC_BY_KEY[k].max - SPEC_BY_KEY[k].min))))
          valueBad.push(`#${i} ${k}=${vals[k]} (preset ${x})`);
      for (const p of SPEC.PARAMS)
        if (!(p.key in v) && !p.hidden && Math.abs(vals[p.key] - p.def) > 1e-6) notReset.push(`#${i} ${p.key}=${vals[p.key]} (default ${p.def})`);
    }
    const { img } = await shot(`preset_${String(i).padStart(2, '0')}`);
    const valsNow = await ev(`JSON.stringify(WS_TEST.paramKeys().map(k => WS_TEST.getParam(k)))`);
    // only expect a visible change when the parameter values actually changed
    if (prevImg && valsNow !== prevVals) { const d = imageDiff(prevImg, img); if (d && d.changedFraction < 0.002) sameShot.push(`#${i}`); }
    prevImg = img;
    prevVals = valsNow;
    const r = await playNote(60, 0.8, 300, { onTimeout: 3000, offTimeout: opt.quick ? 4000 : 9000 });
    log(`  ${String(i).padEnd(3)} ${String(names[i]).padEnd(22)} ${db(r.peak).padStart(8)} ${String(r.sounded ? r.onsetMs : '-').padStart(9)} ${String(r.released ? r.releaseMs : 'no').padStart(11)}`);
    if (!r.sounded || !(r.peak > 0)) silent.push(`#${i} ${names[i]}`);
    if (!r.released) stuck.push(`#${i} ${names[i]} (residual ${r.residual.toFixed ? r.residual.toFixed(4) : r.residual})`);
    const e = B.errors(t0);
    if (e.length) errsAll.push(`#${i} ${names[i]}: ${e[0]}`);
    if (!r.released) { await ev('WS_TEST.allNotesOff && WS_TEST.allNotesOff()'); await waitLevel((p) => p < 0.001, 3000); }
  }
  check(silent.length === 0, 'every preset produces sound (C4)', short(silent));
  check(stuck.length === 0, 'every preset returns to ~0 after noteOff + release', short(stuck));
  check(errsAll.length === 0, 'no console errors while loading/playing presets', short(errsAll));
  if (SPEC) {
    check(valueBad.length === 0, 'loadPreset applies the preset values from the spec', short(valueBad));
    check(notReset.length === 0, 'loadPreset resets parameters the preset does not set to their defaults', short(notReset), 'WARN');
  }
  check(sameShot.length === 0, 'the UI visibly changes when a different preset is loaded', 'no visible change at ' + sameShot.join(', '), 'WARN');
}

async function stepEngines() {
  begin('Oscillators A1 A2 B1');
  await ev(NEUTRAL_EXPR());
  const OSC = ['A1', 'A2', 'B1'];
  for (let e = 0; e < 3; e++) {
    await ev(`WS_TEST.setParam('osc_view', ${e})`);
    await sleep(300);
    const r = await playNote(57, 0.8, 400);
    log(`  oscillator ${OSC[e]} shown: peak ${db(r.peak)} dBFS, released ${r.released}`);
    check(r.sounded && r.released, `with the ${OSC[e]} panel shown the synth plays and releases`, `sounded ${r.sounded}, residual ${r.residual}`);
    await shot(`osc_${OSC[e]}`);
  }
  const d = imageDiff(shots.osc_A1, shots.osc_B1);
  check(d && d.changedFraction > 0.01, 'UI switches between the A1 and B1 panels', d ? `${(d.changedFraction * 100).toFixed(2)} % pixels changed` : 'size mismatch', 'WARN');
  // the tabs only choose the panel shown: the sound is that of the oscillator levels (OSC MIX)
  for (const [k, v] of [['a1_lvl', 0], ['b1_lvl', 1]]) await ev(`WS_TEST.setParam('${k}', ${v}); true`);
  const rb = await playNote(57, 0.8, 400);
  check(rb.sounded && rb.released, 'B1 alone (OSC MIX: A1 0, B1 1) plays and releases', `peak ${db(rb.peak)} dBFS`);
  await ev(`WS_TEST.setParam('osc_view', 0); true`);
  await ev(NEUTRAL_EXPR());
}

// The panel against the spec layout (beta 0.6): cards, captions, the header's DOWNLOAD VST and single MANUAL button, no
// tempo SYNC (plug-in only: the web app has no tempo), the credit, greyed controls, MIDI learn and the preset browser
// (beta 0.7: the plain credit at the bottom left; TOP Sounds 22 and Source Phase last in the browser and the menu).
async function stepPanel() {
  begin('Panel (spec layout, beta 0.7)');
  const t0 = Date.now();
  if (!SPEC) { rec('WARN', 'panel checks', 'tools/spec.js not available'); return; }
  const r = await deviceRect();
  if (!r) { rec('WARN', 'device element (panel aspect) found on the page', 'panel checks skipped'); return; }
  const P = (x, y) => [r.x + (x * r.w) / 1100, r.y + (y * r.h) / DEV_H];
  const all = [];
  for (const s of SPEC.SECTIONS) for (const w of s.widgets) all.push(Object.assign({ sx: s.x + w.x, sy: s.y + w.y, lfoPage: s.vis === 'lfo_view' ? (s.visOn ? 1 : 0) : -1 }, w));
  // cards and captions follow the spec (no CHORUS card, no 'SCOPE · SCALOGRAM', LFO 1 / LFO 2, the TARGET caption)
  const ui = await ev(`({ cards: [...document.querySelectorAll('#device .section .title')].map((e) => e.textContent),
    labels: [...document.querySelectorAll('#device .wlabel')].map((e) => e.textContent),
    caps: [...document.querySelectorAll('#device .menu .mcap')].map((e) => e.textContent) })`);
  const cards = SPEC.SECTIONS.filter((s) => s.title).map((s) => s.title);
  check(JSON.stringify(ui.cards) === JSON.stringify(cards), 'the cards are the spec sections, in order', `${JSON.stringify(ui.cards)} vs spec ${JSON.stringify(cards)}`);
  const labels = all.filter((w) => w.type === 'label').map((w) => w.text), caps = all.filter((w) => w.type === 'menu' && w.text).map((w) => w.text);
  check(JSON.stringify(ui.labels) === JSON.stringify(labels) && JSON.stringify(ui.caps) === JSON.stringify(caps), `captions from the spec (${[...labels, ...caps].join(', ')})`,
    JSON.stringify(ui));
  // header: DOWNLOAD VST (web only) and one MANUAL button
  const dw = all.find((w) => w.type === 'download');
  const dl = await ev(`(() => { const a = document.querySelector('#device a.hbtn.dl'); if (!a) return null; const q = a.getBoundingClientRect();
    return { text: a.textContent, href: a.getAttribute('href'), target: a.target, rel: a.rel, x: q.left, y: q.top, clipped: a.scrollWidth > a.clientWidth + 1 }; })()`);
  const [dx, dy] = dw ? P(dw.sx, dw.sy) : [NaN, NaN];
  check(!!dl && /^DOWNLOAD\s*VST$/.test(dl.text) && dl.href === VST_URL && dl.target === '_blank' && /\bnoopener\b/.test(dl.rel) && !dl.clipped &&
    Math.abs(dl.x - dx) < 2 && Math.abs(dl.y - dy) < 2, `header 'DOWNLOAD VST' opens ${VST_URL} in a new tab, at its spec place`, JSON.stringify({ dl, spec: [dx, dy] }));
  // version 1.0.9: SEND FEEDBACK (web only) between DOWNLOAD VST and USER MANUAL: the owner's form in a new tab, at its spec place, the three buttons in that order, apart, the text not clipped
  const fw = all.find((w) => w.type === 'feedback');
  const hb = await ev(`(() => { const r = (s) => { const a = document.querySelector(s); if (!a) return null; const q = a.getBoundingClientRect(), b = a.querySelector('b');
    return { text: a.textContent, href: a.getAttribute('href'), target: a.target, rel: a.rel, title: a.title, x: q.left, y: q.top, r: q.right, clipped: a.scrollWidth > a.clientWidth + 1 || (b ? b.scrollWidth > b.clientWidth + 1 : false) }; };
    return { dl: r('#device a.hbtn.dl'), fb: r('#device a.hbtn.fb'), man: r('#device .hbtn.manual'), n: document.querySelectorAll('#device .hbtn.fb').length }; })()`);
  const [fx, fy] = fw ? P(fw.sx, fw.sy) : [NaN, NaN];
  check(hb.n === 1 && !!hb.fb && /^SEND\s*FEEDBACK$/.test(hb.fb.text) && hb.fb.href === FEEDBACK_URL && hb.fb.target === '_blank' && /\bnoopener\b/.test(hb.fb.rel) && /\bnoreferrer\b/.test(hb.fb.rel) && !hb.fb.clipped &&
    Math.abs(hb.fb.x - fx) < 2 && Math.abs(hb.fb.y - fy) < 2 && /Google Forms/.test(hb.fb.title), `header 'SEND FEEDBACK' opens ${FEEDBACK_URL} in a new tab, at its spec place`, JSON.stringify({ fb: hb.fb, spec: [fx, fy] }));
  check(!!hb.dl && !!hb.fb && !!hb.man && hb.dl.r <= hb.fb.x + 0.5 && hb.fb.r <= hb.man.x + 0.5 && Math.abs(hb.dl.y - hb.fb.y) < 1 && Math.abs(hb.fb.y - hb.man.y) < 1,
    'the header reads DOWNLOAD VST, SEND FEEDBACK, USER MANUAL from left to right, on one line, apart', JSON.stringify({ dl: hb.dl && [hb.dl.x, hb.dl.r], fb: hb.fb && [hb.fb.x, hb.fb.r], man: hb.man && [hb.man.x, hb.man.r] }));
  const mb = await ev(`[...document.querySelectorAll('#device button, #device a')].filter((b) => /MANUAL/.test(b.textContent)).map((b) => b.textContent)`);
  check(mb.length === 1 && mb[0] === 'USERMANUAL', "one 'USER MANUAL' button (no MANUAL A / MANUAL B)", JSON.stringify(mb));
  const eng0 = await ev(`WS_TEST.getParam('osc_view')`);
  for (const e of [0, 2]) {   // (version 1.0.6: the same page whatever oscillator is shown)
    await ev(`WS_TEST.setParam('osc_view', ${e}); true`);
    await sleep(200);
    const c = await centreOf('#device .hbtn.manual');
    if (c) await B.click(c.x, c.y);
    await sleep(500);
    const m = await ev(`({ open: !document.getElementById('manual-overlay').hidden, src: document.getElementById('manual-iframe').getAttribute('src') || '' })`);
    check(!!c && m.open && m.src.endsWith('manual/manual.html'), `MANUAL opens the manual (${['A1', 'A2', 'B1'][e]} shown: manual/manual.html)`, JSON.stringify(m));
    await ev('WS_TEST.closeManual(); true');
    await sleep(200);
  }
  await ev(`WS_TEST.setParam('osc_view', ${eng0}); true`);
  // tempo SYNC is the plug-in's: neither its buttons nor its note-value knobs here; the hertz / seconds knobs at their place
  const vstOnly = all.filter((w) => w.only === 'vst' && w.param).map((w) => ({ name: SPEC_BY_KEY[w.param].name, x: w.sx + w.w / 2, y: w.sy + w.h / 2 }));
  // (the widgets of beta 0.2 that show with a playing setting — BASS with CHORD MODE, MAQAM and TONIC with TUNING — are not sync twins)
  const shown = all.filter((w) => w.vis && w.only !== 'vst' && w.param && !SPEC_BY_KEY[w.vis].perf).map((w) => ({ name: SPEC_BY_KEY[w.param].name, x: w.sx + w.w / 2, y: w.sy + w.h / 2, lfoPage: w.lfoPage }));
  const probe = (list) => ev(`(() => { const d = document.getElementById('device').getBoundingClientRect();
    return ${JSON.stringify(list)}.map((w) => { const e = document.elementFromPoint(d.left + w.x * d.width / 1100, d.top + w.y * d.height / ${DEV_H});
      const k = e && e.closest('.w'); return { want: w.name, at: k ? (k.title || '').split(' — ')[0] || k.className : (e ? e.tagName : null), text: k ? k.textContent.trim() : '' }; }); })()`);
  const atVst = await probe(vstOnly), atShown = [];
  // beta 0.3: the LFO 2 and LFO 3 pages share one place (sub-tab LFO 2 | LFO 3): each page is probed while it is shown
  const lfoView0 = await ev(`WS_TEST.getParam('lfo_view')`);
  for (const pg of [0, 1]) {
    await ev(`WS_TEST.setParam('lfo_view', ${pg}); true`);
    await sleep(250);
    atShown.push(...(await probe(shown.filter((x) => (pg === 1 ? x.lfoPage === 1 : x.lfoPage !== 1)))));
  }
  await ev(`WS_TEST.setParam('lfo_view', ${lfoView0}); true`);
  await sleep(150);
  const syncEls = await ev(`[...document.querySelectorAll('#device *')].filter((e) => /\\(sync\\)|^(Delay|LFO \\d) Sync/.test(e.title || '') || (e.children.length === 0 && /^SYNC$/.test(e.textContent.trim()))).length`);
  log(`  plug-in-only places: ${atVst.map((x) => `${x.want} -> ${x.at}${x.text ? ' "' + x.text + '"' : ''}`).join('; ')}`);
  check(syncEls === 0 && atVst.every((x) => x.at !== x.want && x.text !== 'SYNC'), `no SYNC button and no note-value knob (${vstOnly.length} plug-in-only widgets)`,
    `${syncEls} sync element(s); ${JSON.stringify(atVst)}`);
  check(atShown.every((x) => x.at === x.want), `the hertz / seconds knobs are shown at their place (${shown.map((x) => x.name).join(', ')})`, JSON.stringify(atShown));
  // the credit (beta 0.7): one plain, discreet line "By OktoPierre · version · licence" (as before beta 0.6: small, the faint
  // text colour, not bold, on both engine tabs), left-aligned at the bottom left under the VOICE card
  const CREDIT_EXPR = `(() => { const c = document.querySelector('#device .credit'); if (!c) return null;
    const dev = document.getElementById('device'), d = dev.getBoundingClientRect(), s = d.width / 1100;
    const t = document.createElement('span'); t.style.color = 'var(--faint)'; dev.appendChild(t); const faint = getComputedStyle(t).color; t.remove();
    const rg = document.createRange(); rg.selectNodeContents(c); const tx = rg.getBoundingClientRect();
    const cs = getComputedStyle(c), q = c.getBoundingClientRect();
    const voice = [...document.querySelectorAll('#device .section')].find((e) => (e.querySelector('.title') || {}).textContent === 'VOICE');
    const v = voice ? voice.getBoundingClientRect() : null;
    const dx = (x) => (x - d.left) / s, dy = (y) => (y - d.top) / s;
    return { text: c.textContent, children: c.children.length, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, color: cs.color, faint,
      align: cs.textAlign, clipped: c.scrollWidth > c.clientWidth + 1, inside: q.right <= d.right + 1 && q.bottom <= d.bottom + 1,
      text_l: dx(tx.left), text_r: dx(tx.right), text_t: dy(tx.top), text_b: dy(tx.bottom),
      voice: v && { l: dx(v.left), r: dx(v.right), b: dy(v.bottom) } }; })()`;
  const crw = all.find((w) => w.type === 'credit'), wheels = all.find((w) => w.type === 'wheels');
  const crs = [];
  for (const e of [0, 2]) {
    await ev(`WS_TEST.setParam('osc_view', ${e}); true`);
    await sleep(200);
    crs.push(await ev(CREDIT_EXPR));
  }
  await ev(`WS_TEST.setParam('osc_view', ${eng0}); true`);
  const cr = crs[0], crText = `${SPEC.APP.panelCredit} · ${SPEC.APP.version} · ${SPEC.APP.license}`;
  log(`  credit '${cr && cr.text}': text at x ${cr && cr.text_l.toFixed(1)}–${cr && cr.text_r.toFixed(1)}, y ${cr && cr.text_t.toFixed(1)}–${cr && cr.text_b.toFixed(1)} (VOICE card ${JSON.stringify(cr && cr.voice)}); ${cr && cr.size} px, weight ${cr && cr.weight}, colour A ${cr && cr.color}, B ${crs[1] && crs[1].color}, faint ${cr && cr.faint}`);
  check(!!cr && SPEC.APP.panelCredit === 'By OktoPierre' && cr.text === crText && cr.children === 0 && !!crs[1] && crs[1].text === crText && !cr.clipped && cr.inside,
    `credit: one plain text '${crText}', not clipped, inside the panel`, JSON.stringify(cr));
  const discreet = (c) => !!c && c.size <= 10 && c.weight < 600 && c.color === c.faint;
  check(discreet(crs[0]) && discreet(crs[1]), 'credit: discreet on both engine tabs (<= 10 px, not bold, the faint text colour)',
    JSON.stringify(crs.map((c) => c && { size: c.size, weight: c.weight, color: c.color, faint: c.faint })));
  // left-aligned at the bottom left, inside the panel, below the VOICE card and clear of the wheels (the keyboard section)
  const clearOfWheels = !wheels || !(cr.text_l < wheels.sx + wheels.w && cr.text_r > wheels.sx && cr.text_t < wheels.sy + wheels.h - 4 && cr.text_b > wheels.sy);
  check(!!cr && !!crw && cr.align === 'left' && Math.abs(cr.text_l - crw.sx) < 2 && !!cr.voice && cr.text_t >= cr.voice.b - 1 && clearOfWheels && cr.text_b <= DEV_H + 0.5,
    `credit: left-aligned at the bottom left (text from x ${crw ? crw.sx : '?'}), below the VOICE card, clear of the wheels`, JSON.stringify(cr));
  // controls greyed out when they do nothing (still driven by the parameters)
  const greyed = (key) => ev(`(() => { const e = [...document.querySelectorAll('#device .knob')].find((k) => (k.title || '').split(' — ')[0] === ${JSON.stringify(SPEC_BY_KEY[key].name)});
    return e ? e.classList.contains('disabled') : null; })()`);
  const wave0 = await ev(`WS_TEST.getParam('a_wave')`), pat0 = await ev(`WS_TEST.getParam('b_pattern')`), g = [];
  for (const [k, v] of [['a_wave', 0], ['a_wave', 2], ['a_wave', 3], ['b_pattern', 0], ['b_pattern', 5]]) {
    await ev(`WS_TEST.setParam('${k}', ${v}); true`);
    g.push(await greyed(k === 'a_wave' ? 'a_width' : 'b_seed'));
  }
  await ev(`WS_TEST.setParam('a_wave', ${wave0}); WS_TEST.setParam('b_pattern', ${pat0}); true`);
  check(JSON.stringify(g) === '[true,false,false,true,false]', 'WIDTH greyed unless PULSE / TRI, SEED unless RANDOM', JSON.stringify(g));
  // MIDI learn by a right-click on a moved control (the delay TIME, now in EFFECTS), then unlinked again
  const tw = all.find((w) => w.param === 'fx_dtime' && w.only !== 'vst');
  const [tx, ty] = P(tw.sx + tw.w / 2, tw.sy + 20);
  await B.mouse('mouseMoved', tx, ty, { button: 'none', buttons: 0 });
  await B.mouse('mousePressed', tx, ty, { button: 'right', buttons: 2 });
  await B.mouse('mouseReleased', tx, ty, { button: 'right', buttons: 0 });
  await sleep(200);
  const learnTxt = await ev('WS_TEST.midiStatus()');
  await ev('WS_TEST.midi([0xB0, 21, 64]); true');
  const map = await ev('WS_TEST.midiMap()');
  await ev(`WS_TEST.midiLearn('fx_dtime'); true`);
  await B.key('Backspace');
  const unlinked = await ev('WS_TEST.midiMap()');
  check(/MIDI learn/.test(learnTxt) && /Delay Time/.test(learnTxt) && map[21] === 'fx_dtime' && !Object.values(unlinked).includes('fx_dtime'),
    'right-click on the delay TIME knob starts MIDI learn; a CC links it; Backspace unlinks it', `status '${learnTxt}', map ${JSON.stringify(map)}, after ${JSON.stringify(unlinked)}`);
  // TOP Sounds = the sounds of beta 0.7 that OktoPierre kept (21 in the final list), the categories in the spec order (Pad ... Drums & Perc): in the preset browser
  // (its sound types and their numbers) and in the preset menu (its groups: the categories that hold a sound that is not a TOP Sound)
  const TOP_N = SPEC.TOP_LIST.length;   // (version 1.0.3: the web's TOP Sounds are the plug-in's list)
  const inTop = new Set(SPEC.TOP_LIST);
  const topNames = SPEC.TOP_LIST.map((i) => SPEC.PRESETS[i].name);
  const lastCat = SPEC.CATEGORIES[SPEC.CATEGORIES.length - 1];
  const lights = SPEC.PRESETS.filter((p) => / LGT$/.test(p.name)).length, high = SPEC.PRESETS.filter((p) => / HIGH_CPU$/.test(p.name));   // (version 1.0.14: the LGT versions, tools/spec.js LGT; the full versions of the favourites they replace are in Other)
  // (version 1.0.15: the owner deleted AA · Morph of Brass LGT and three HIGH_CPU originals: 19 LGT versions, 14 HIGH_CPU)
  // (version 1.0.17: 32 presets appended after them: the 30 New Waves sounds the owner kept, one of them a HIGH_CPU sound, and the 2 basses of his user bank; his stars
  // rate some HIGH_CPU originals now)
  const added = SPEC.PRESETS.length - (SPEC.TOP + SPEC.NEW_COUNT + lights);
  check(added === 32 && lights === 19 && high.length === 15 && high.every((p) => p.cat === 'Other') && lastCat === 'Other', `spec: TOP Sounds = ${TOP_N} sounds, then ${SPEC.NEW_COUNT} new presets, ${lights} LGT versions and ${added} presets of 1.0.17 (${high.length} HIGH_CPU sounds in Other); ${lastCat} is the last category`,
    `TOP ${SPEC.TOP}, presets ${SPEC.PRESETS.length}, light ${lights}, high ${high.length}, last category '${lastCat}'`);
  const bInfo = await ev(`(() => { const b = document.getElementById('browser'); if (!b) return null;
    const tab = b.querySelector('.btabs button'); if (tab) tab.click();   // FACTORY
    const first = b.querySelector('.bcats .bcat'); if (first) first.click();   // TOP Sounds
    return { cats: [...b.querySelectorAll('.bcats .bcat')].map((r) => ({ label: (r.querySelector('span') || {}).textContent || '', n: +((r.querySelector('.n') || {}).textContent || NaN) })),
      rows: [...b.querySelectorAll('.blist .bsnd')].map((e) => e.title) }; })()`);
  const catWant = ['TOP Sounds', ...SPEC.CATEGORIES];
  log(`  browser: ${bInfo ? bInfo.cats.map((c) => `${c.label} ${c.n}`).join(' | ') : 'none'}`);
  check(!!bInfo && JSON.stringify(bInfo.cats.map((c) => c.label)) === JSON.stringify(catWant) && bInfo.cats[0].n === TOP_N &&
    bInfo.cats[bInfo.cats.length - 1].label === lastCat && bInfo.cats[bInfo.cats.length - 1].n === SPEC.PRESETS.filter((p) => p.cat === lastCat).length,
    `preset browser: TOP Sounds (${TOP_N}) first, then the categories in the spec order, ${lastCat} last`, JSON.stringify(bInfo && bInfo.cats));
  check(!!bInfo && JSON.stringify(bInfo.rows) === JSON.stringify(topNames), `preset browser: TOP Sounds lists OktoPierre's ${TOP_N} sounds in the spec order (${topNames[0]} … ${topNames[topNames.length - 1]})`,
    JSON.stringify(bInfo && bInfo.rows.slice(0, 4)) + ` … (${bInfo ? bInfo.rows.length : 0} rows)`);
  // the classic menu (the preset name opens it while the browser is shown; a second click closes it)
  const groups = await ev(`(() => { const n = document.querySelector('.presets .pname'); if (!n) return null;
    n.click(); const m = document.querySelector('.pmenu');
    const g = m ? [...m.querySelectorAll('.grp')].map((h) => { const c = h.querySelector('.cnt'); return { name: h.textContent.replace(/^[▾▸]/, '').replace(c ? c.textContent : '', '').trim(), n: c ? +c.textContent : NaN }; }) : null;
    if (m) n.click(); return g; })()`);
  const factoryGroups = (groups || []).filter((g) => g.name !== 'USER PRESETS');
  const grpWant = ['★ TOP SOUNDS', ...SPEC.CATEGORIES.filter((c) => SPEC.PRESETS.some((p, i) => p.cat === c && !inTop.has(i))).map((c) => c.toUpperCase())];
  log(`  preset menu groups: ${(groups || []).map((g) => `${g.name} ${g.n}`).join(' | ')}`);
  check(!!groups && JSON.stringify(factoryGroups.map((g) => g.name)) === JSON.stringify(grpWant) && factoryGroups[0].n === TOP_N &&
    factoryGroups[factoryGroups.length - 1].name === lastCat.toUpperCase() && !(await ev(`!!document.querySelector('.pmenu')`)),
    `preset menu: ★ TOP SOUNDS (${TOP_N}) first, then one group per category in the spec order, ${lastCat.toUpperCase()} last`, JSON.stringify(groups));
  // the preset browser selects presets (a click on a row, then the arrow key)
  const rows = await ev(`[...document.querySelectorAll('#browser .blist .bsnd')].map((e) => e.title)`);
  if (rows.length >= 3) {
    const rc = await ev(`(() => { const e = document.querySelectorAll('#browser .blist .bsnd')[1]; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
    await B.click(rc.x, rc.y);
    await sleep(300);
    const l1 = await ev(`(document.querySelector('.presets .pname span') || {}).textContent`);
    await ev('document.activeElement && document.activeElement.blur && document.activeElement.blur(); true');
    await B.key('ArrowDown');
    await sleep(300);
    const l2 = await ev(`(document.querySelector('.presets .pname span') || {}).textContent`);
    check(l1 === rows[1] && l2 === rows[2], 'the preset browser: a click on a sound loads it, the down arrow the next one', `'${l1}' / '${l2}' vs '${rows[1]}' / '${rows[2]}'`);
  } else rec('WARN', 'preset browser rows present', `${rows.length} rows`);
  await shot('panel');
  check(B.errors(t0).length === 0, 'no console errors in the panel checks', short(B.errors(t0)));
  await ev(`${NEUTRAL_EXPR()}; true`);
}

async function stepManuals() {
  begin('Manuals');
  await sleep(200);
  const { img: base } = await shot('manual_base');
  for (const m of ['manual.html', 'wavelets.html']) {
    const t0 = Date.now();
    try { await ev(`Promise.resolve(WS_TEST.openManual('${m}')).then(() => true)`); }
    catch (e) { rec('FAIL', `openManual('${m}')`, e.message); continue; }
    await sleep(1000);
    const { img, st } = await shot(`manual_${m}`);
    const d = imageDiff(base, img);
    check(d && d.changedFraction > 0.05, `openManual('${m}') opens a manual view`, d ? `${(d.changedFraction * 100).toFixed(1)} % pixels changed` : 'size mismatch');
    check(st.distinctColors > 8, `manual ${m} is not blank`, `${st.distinctColors} colours`);
    // the manual document itself must load and contain text (iframe or inline)
    const tree = await B.send('Page.getFrameTree');
    const frames = [];
    (function walk(n) { for (const c of n.childFrames || []) { frames.push(c.frame); walk(c); } })(tree.frameTree);
    const failed = frames.filter((f) => f.unreachableUrl).map((f) => f.unreachableUrl);
    const missing = frames.map((f) => f.url).filter((u) => /^file:/.test(u) && !fs.existsSync(require('url').fileURLToPath(u.split('#')[0])));
    const info = await ev(`(() => { const out = [];
      for (const f of document.querySelectorAll('iframe')) { const r = f.getBoundingClientRect(); if (r.width < 50 || r.height < 50) continue;
        let len = -1; try { len = f.contentDocument && f.contentDocument.body ? f.contentDocument.body.innerText.trim().length : -1; } catch (e) { len = -2; }
        out.push({ src: f.getAttribute('src'), len }); }
      return out; })()`);
    log(`  manual ${m}: frames ${JSON.stringify(frames.map((f) => f.unreachableUrl || f.url))}, visible iframes ${JSON.stringify(info)}`);
    // len -1/-2: document not readable from the parent (file:// without --allow-file-access-from-files is
    // cross-origin); load failures are still caught by the frame tree / file existence checks above.
    const textOk = info.length === 0 || info.some((x) => x.len > 200 || x.len < 0);
    check(failed.length === 0 && missing.length === 0 && textOk, `manual ${m} document loads and has content`,
      failed.length || missing.length ? 'failed to load: ' + [...failed, ...missing].join(', ') : 'iframe has no readable text: ' + JSON.stringify(info));
    for (const [w, h] of [[1920, 1080]]) await shot(`manual_${m}_${w}x${h}`, w, h);
    await B.setViewport(1280, 860);
    await sleep(200);
    await ev(`Promise.resolve(WS_TEST.closeManual())`);
    await sleep(600);
    const { img: after } = await shot(`manual_${m}_closed`);
    const d2 = imageDiff(base, after);
    check(d2 && d2.changedFraction < 0.05, `closeManual() returns to the synth view (manual ${m})`,
      d2 ? `${(d2.changedFraction * 100).toFixed(1)} % pixels differ from before opening` : 'size mismatch', 'WARN');
    const errs = B.errors(t0);
    check(errs.length === 0, `no console errors with manual ${m}`, short(errs));
  }
}

async function stepKeyboard() {
  begin('Computer keyboard');
  await ev(NEUTRAL_EXPR());
  await ev('document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.focus(); true');
  await sleep(200);
  const keys = [['1', 'Digit1'], ['5', 'Digit5'], ['0', 'Digit0'], ['1', 'Numpad1'], ['a', 'KeyA'], ['w', 'KeyW'], ['k', 'KeyK']];
  const bad = [];
  for (const [k, code] of keys) {
    const t0 = Date.now();
    const r = await playNote(0, 0, 300, { on: () => B.keyDown(k, { code }), off: () => B.keyUp(k, { code }) });
    log(`  key ${code}: sound ${r.sounded ? 'yes' : 'NO'} (peak ${db(r.peak)} dBFS), released ${r.released}`);
    if (!r.sounded) bad.push(`${code} no sound`);
    if (!r.released) bad.push(`${code} stuck`);
    const e = B.errors(t0);
    if (e.length) bad.push(`${code}: ${e[0]}`);
  }
  check(bad.length === 0, 'computer keyboard keys (digits, numpad, letters) play and release notes', short(bad));
  // auto-repeat while held must not retrigger/stick
  {
    await B.keyDown('d', { code: 'KeyD' });
    for (let i = 0; i < 6; i++) {
      await B.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68, text: 'd', autoRepeat: true });
      await sleep(40);
    }
    await B.keyUp('d', { code: 'KeyD' });
    const down = await waitLevel((p) => p < 0.001, 5000);
    check(down.ok, 'held key with auto-repeat releases on keyup (no stuck note)', `residual ${down.peak}`);
  }
  // octave keys must not throw
  const t0 = Date.now();
  await B.key('z', { code: 'KeyZ' });
  await B.key('x', { code: 'KeyX' });
  check(B.errors(t0).length === 0, 'Z/X octave keys raise no errors', short(B.errors(t0)));
}

// Locate the device (the 1100 x DEVICE.h layout) on the page to click spec coordinates.
async function deviceRect() {
  return ev(`(() => {
    let best = null;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 300 || r.height < 200) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const ar = r.width / r.height, err = Math.abs(ar / (1100 / ${DEV_H}) - 1);
      if (err > 0.03 || r.width * r.height < 0.3 * innerWidth * innerHeight) continue;
      // closest aspect ratio wins (an outer stage/container is usually a bit off), then the larger one
      if (!best || err < best.err - 0.002 || (Math.abs(err - best.err) <= 0.002 && r.width * r.height > best.w * best.h))
        best = { x: r.left, y: r.top, w: r.width, h: r.height, err, tag: el.tagName, id: el.id, cls: String(el.className) };
    }
    return best; })()`);
}

async function stepMouse() {
  begin('Mouse on the UI (spec layout coordinates)');
  await ev(NEUTRAL_EXPR());
  await sleep(300);
  const r = await deviceRect();
  if (!r) { rec('WARN', 'device element (panel aspect) found on the page', 'cannot map spec coordinates; mouse checks skipped'); return; }
  log(`  device element <${r.tag} id='${r.id}' class='${r.cls}'> at ${r.x.toFixed(0)},${r.y.toFixed(0)} size ${r.w.toFixed(0)}x${r.h.toFixed(0)}`);
  const P = (x, y) => [r.x + (x * r.w) / 1100, r.y + (y * r.h) / DEV_H];
  const t0 = Date.now();
  // beta 0.3: the three folder tabs OSC1 A1 | OSC2 A2 | OSC3 B1 (x 6 + 182 k, 176 wide, y 50 to 90)
  const clickView = async (x, y) => { await B.click(...P(x, y)); await sleep(300); return ev(`WS_TEST.getParam('osc_view')`); };
  const tabC = (k) => 6 + 182 * k + 88;
  const o1 = await clickView(tabC(1), 70);   // OSC2 A2
  const o2 = await clickView(tabC(2), 70);   // OSC3 B1
  const o3 = await clickView(tabC(0), 70);   // OSC1 A1
  check(o1 === 1 && o2 === 2 && o3 === 0, 'the three folder tabs show A2, B1 and A1', `OSC2 A2: ${o1}, OSC3 B1: ${o2}, OSC1 A1: ${o3}`, 'WARN');
  const c0 = await ev(`WS_TEST.getParam('f_cutoff')`);
  let kx0 = 50, ky0 = 455;   // the CUTOFF knob of A1 (from the spec layout)
  for (const sec of SPEC.SECTIONS) for (const w of sec.widgets) if (w.param === 'f_cutoff') { kx0 = sec.x + w.x + w.w / 2; ky0 = sec.y + w.y + w.h / 2 - 5; }
  const [kx, ky] = P(kx0, ky0);
  await B.drag(kx, ky, kx, ky + 60, 12);
  await sleep(200);
  const c1 = await ev(`WS_TEST.getParam('f_cutoff')`);
  check(c1 !== c0, 'dragging the Cutoff knob down changes f_cutoff', `${c0} -> ${c1}`, 'WARN');
  log(`  cutoff drag: ${c0} -> ${c1}`);
  // on-screen keyboard: press the first white key below the black keys (position from the spec layout)
  let kbx = 110, kby = 690;
  for (const sec of SPEC.SECTIONS) for (const w of sec.widgets) if (w.type === 'keyboard') { kbx = sec.x + w.x + 10; kby = sec.y + w.y + w.h - 12; }
  log(`  on-screen keyboard click at device (${kbx}, ${kby})`);
  const [px, py] = P(kbx, kby);
  await B.mouse('mouseMoved', px, py, { button: 'none', buttons: 0 });
  await B.mouse('mousePressed', px, py, { buttons: 1 });
  const up = await waitLevel((p) => p > 0.003, 2000);
  await sleep(200);
  await B.mouse('mouseReleased', px, py, { buttons: 0 });
  const down = await waitLevel((p) => p < 0.001, 5000);
  check(up.ok && down.ok, 'clicking an on-screen keyboard key plays and releases a note', `sounded ${up.ok}, released ${down.ok}`, 'WARN');
  await shot('mouse_after');
  check(B.errors(t0).length === 0, 'no console errors during mouse interaction', short(B.errors(t0)));
  await ev(NEUTRAL_EXPR());
}

async function stepStress() {
  begin('Random parameter stress');
  if (!SPEC) { rec('WARN', 'random stress', 'tools/spec.js not available'); return; }
  const t0 = Date.now();
  const spec = SPEC.PARAMS.filter((p) => !p.hidden).map((p) => ({ key: p.key, min: p.min, max: p.max, int: p.curve === 'int' || p.curve === 'choice' }));
  let nonFinite = 0, maxPeak = 0;
  const iters = opt.quick ? 15 : 40;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < iters; i++) {
    const sets = [];
    for (let k = 0; k < 10; k++) {
      const p = spec[Math.floor(rnd() * spec.length)];
      let v = p.min + rnd() * (p.max - p.min); if (p.int) v = Math.round(v);
      sets.push([p.key, v]);
    }
    const note = 36 + Math.floor(rnd() * 48);
    await ev(`(() => { for (const [k, v] of ${JSON.stringify(sets)}) WS_TEST.setParam(k, v); WS_TEST.noteOn(${note}, 0.9); return true; })()`);
    await sleep(120);
    const l = await level();
    const p = peakOf(l);
    if (!Number.isFinite(p)) nonFinite++; else maxPeak = Math.max(maxPeak, p);
    await ev(`WS_TEST.noteOff(${note})`);
  }
  log(`  ${iters} iterations x 10 random parameter values; max peak ${db(maxPeak)} dBFS`);
  check(nonFinite === 0, 'output level stays finite under random parameters (no NaN)', `${nonFinite} non-finite readings`);
  check(maxPeak < 4, 'no blow-up under random parameters (peak < +12 dBFS)', `peak ${maxPeak}`);
  await ev(`${NEUTRAL_EXPR()}; WS_TEST.allNotesOff && WS_TEST.allNotesOff(); true`);
  const down = await waitLevel((p) => p < 0.001, 12000);
  check(down.ok, 'silence after random stress + all notes off (no stuck voice)', `residual ${down.peak}`);
  check(B.errors(t0).length === 0, 'no console errors during random stress', short(B.errors(t0)));
}

async function stepHashes() {
  begin('URL hash options');
  // full reload (hash-only navigation would not reload the document)
  for (const [hash, idx] of [['#noaudio', null], ['#preset=3', 3]]) {
    await B.navigate('about:blank');
    const t0 = Date.now();
    await B.navigate(BASE_URL + hash);
    await sleep(1200);
    const errs = B.errors(t0);
    check(errs.length === 0, `${hash}: loads without console errors`, short(errs));
    // #noaudio (screenshots, docs) leaves the welcome window out; any other address shows it
    const w = await ev(WELCOME_EXPR), noaudio = hash === '#noaudio';
    check(!!w && w.visible === !noaudio && w.inert === !noaudio, `${hash}: welcome window ${noaudio ? 'hidden (panel not inert)' : 'shown'}`, JSON.stringify(w && { visible: w.visible, inert: w.inert }));
    await shot('hash_' + hash.replace(/[^a-z0-9]/gi, '_'));
    if (idx !== null && SPEC && SPEC.PRESETS[idx]) {
      const v = SPEC.PRESETS[idx].v;
      const vals = await ev(`Object.fromEntries(WS_TEST.paramKeys().map(k => [k, WS_TEST.getParam(k)]))`);
      const bad = Object.entries(v).filter(([k, x]) => Math.abs(vals[k] - x) > 1e-6).map(([k, x]) => `${k}=${vals[k]} (want ${x})`);
      check(bad.length === 0, `${hash}: preset ${idx} '${SPEC.PRESETS[idx].name}' is loaded`, short(bad));
    }
  }
  if (shots.load_1280x860 && shots.hash__noaudio) {
    const d = imageDiff(shots.load_1280x860, shots.hash__noaudio);
    log(`  (info) #noaudio vs normal load: ${d ? (d.changedFraction * 100).toFixed(1) + ' % pixels differ' : 'size differs'}`);
  }
}

async function main() {
  fs.mkdirSync(opt.out, { recursive: true });
  for (const f of fs.readdirSync(opt.out)) if (/\.(png|txt)$/.test(f)) fs.rmSync(path.join(opt.out, f));
  log('test_web.js - Okto MultiWave Synth web app test (headless Edge via CDP)');
  log(`date   : ${new Date().toISOString()}`);
  log(`page   : ${BASE_URL}`);
  log(`browser: headless Edge${opt.fileAccess ? ' with --allow-file-access-from-files' : ' WITHOUT --allow-file-access-from-files (normal browser)'}`);
  log(`spec   : ${SPEC ? `tools/spec.js (${SPEC.PARAMS.length} params, ${SPEC.PRESETS.length} presets)` : 'not available'}`);
  if (!opt.url && !fs.existsSync(PAGE)) {
    begin('Load');
    rec('FAIL', 'web/index.html exists', `${PAGE} not found - the web app has not been built yet`);
    process.exit(writeReport() ? 2 : 0);
  }
  let abort = null;
  try {
    B = await Browser.launch({ width: 1280, height: 860, headless: !opt.headed, fileAccess: opt.fileAccess });
    await B.send('Page.addScriptToEvaluateOnNewDocument', { source: TAP_SOURCE });
    const loaded = await stepLoad();
    if (!loaded) { abort = 'page or WS_TEST hook missing'; }
    else {
      if (want('welcome')) await stepWelcome();
      const started = await stepStart();
      if (want('params')) await stepParams();
      if (started) {
        if (want('panel')) await stepPanel();   // needs the welcome window closed (the audio started)
        if (want('note')) await stepNote();
        if (want('presets')) await stepPresets();
        if (want('engines')) await stepEngines();
      }
      if (want('manuals')) await stepManuals();
      if (started) {
        if (want('keyboard')) await stepKeyboard();
        if (want('portamento')) await stepPortamento();
        if (want('polyporta')) await stepPolyPorta();
        if (want('highnotes')) await stepHighNotes();
        if (want('mouse')) await stepMouse();
        if (want('stress')) await stepStress();
      }
      if (want('hashes')) await stepHashes();
      begin('Console summary');
      const all = B.errors(0), warns = B.warnings(0);
      log(`  total console errors: ${all.length}, warnings: ${warns.length}`);
      for (const w of warns.slice(0, 20)) log('    ' + w);
    }
  } catch (e) {
    abort = 'exception in test driver: ' + (e && e.stack ? e.stack : e);
  } finally {
    if (B) await B.close();
  }
  const fails = writeReport(abort);
  process.exit(abort && /missing/.test(abort) ? 2 : fails ? 1 : 0);
}

main();
