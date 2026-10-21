// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// quick.js - fast developer check (about 15-30 s) to run after every change. The full suites
// (tests/vst3host, tests/web/test_web.js, tests/web/test_demo.js) stay for releases and big changes.
//
//   node tests/quick.js          static checks + JS engine + VST3 core sections + web app smoke test
//   node tests/quick.js --dsp    also compares the C++ engine with the JS reference (needs llvm-mingw; the cases run in parallel shards, about a minute; skipped when the engine, the
//                                spec and the cases are unchanged since the last successful run, --force runs it anyway)
//
// The browser is headless and muted (cdp.js always passes --mute-audio) and is always closed at the end.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const R = (...p) => path.join(ROOT, ...p);
const opt = { dsp: process.argv.includes('--dsp'), force: process.argv.includes('--force') };
const results = [];
const t0 = Date.now();
const secs = (t) => ((Date.now() - t) / 1000).toFixed(1) + ' s';
function report(name, ok, detail, t) { results.push({ name, ok, detail, time: t ? secs(t) : '' }); }

// ---------------------------------------------------------------- 1. static checks
function listFiles(dir, re, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/^(out|node_modules|build|external|hostile_midi)/.test(e.name)) listFiles(p, re, out); } else if (re.test(e.name)) out.push(p);
  }
  return out;
}
const mtime = (f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0);
const newest = (files) => Math.max(...files.map(mtime));
function staticChecks() {
  const t = Date.now(), bad = [];
  const js = [R('web', 'js'), R('tools'), R('tests')].flatMap(d => listFiles(d, /\.js$/));
  for (const f of js) {
    try { new vm.Script(fs.readFileSync(f, 'utf8').replace(/^#!.*/, ''), { filename: f }); } catch (e) { bad.push(`${path.relative(ROOT, f)}: ${e.message}`); }
  }
  report('static', bad.length === 0, bad.length ? 'syntax: ' + bad.join('; ') : `${js.length} JS files parse`, t);
  const t2 = Date.now(), stale = [];
  const specSrc = newest([R('tools', 'spec.js'), R('tools', 'gen_spec.js'), R('tools', 'wavelets.json')]);
  if (mtime(R('web', 'js', 'spec.js')) < specSrc || mtime(R('vst', 'src', 'generated', 'spec.h')) < specSrc) stale.push('generated spec is older than tools/spec.js: run  node tools/gen_spec.js');
  const dll = R('build', 'OktoMultiWaveSynth.vst3', 'Contents', 'x86_64-win', 'OktoMultiWaveSynth.vst3');
  if (mtime(dll) < newest([...listFiles(R('vst', 'src'), /\.(cpp|h|rc)$/), R('tools', 'spec.js')])) stale.push('VST3 build is older than its sources: run  vst\\build.bat');
  const man = newest([...listFiles(R('tools', 'manual'), /\.js$/), R('tools', 'spec.js')]);
  if (mtime(R('web', 'manual', 'manual-a.html')) < man || mtime(R('web', 'manual', 'manual-b.html')) < man) stale.push('manuals are older than their sources: run  node tools/manual/build.js a b');
  report('up to date', stale.length === 0, stale.length ? stale.join('; ') : 'generated spec, VST3 build and manuals are newer than their sources', t2);
}

// ---------------------------------------------------------------- 1b. the layout rule: nothing overlaps (the owner's rule, 2026-10-21, for every future implementation)
// On the spec's numbers, for the web app AND the plug-in (it has widgets of its own: the SYNC buttons, the note-value knobs): inside a card no two widgets overlap (a knob counts as
// its ring, 4 px outside the disc, with the stroke), no widget leaves its card, and no two cards that are on screen together overlap (the plate behind the oscillator cards is a frame).
// The text (labels, titles) is checked in the page: tests/web/smoke.js with tests/web/overlap.js.
function layoutChecks() {
  const t = Date.now(), bad = [];
  const SPEC = require(R('web', 'js', 'spec.js'));
  const ink = (w) => {
    if (/^knob/.test(w.type)) {
      const thin = w.type === 'knobS' || w.type === 'knobT', d = w.type === 'knobL' ? 42 : w.type === 'knobS' ? 30 : w.type === 'knobT' ? 26 : 38;
      const cx = w.x + w.w / 2, cy = w.y + (w.type === 'knobL' ? 22 : w.type === 'knobS' ? 18 : w.type === 'knobT' ? 15 : 20), ar = d / 2 + (thin ? 2 : 4) + (thin ? 1.25 : 1.5);
      return { x0: cx - ar, y0: cy - ar, x1: cx + ar, y1: cy + ar };
    }
    return { x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.h };
  };
  const hit = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.01 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.01;
  const never = (a, b) => a.vis && b.vis && a.vis === b.vis && !!a.visOn !== !!b.visOn;   // twins: only one is shown (RATE or the note value)
  // the bars (the LFO 2/3 tab bar, the strip of the effects' captions) draw their tabs / captions on the left and leave the rest to the plug-in's SYNC button
  const barAndSync = (a, b) => (/^(lfotabs|fxheads)$/.test(a.type) && b.type === 'toggle') || (/^(lfotabs|fxheads)$/.test(b.type) && a.type === 'toggle');
  for (const platform of ['web', 'vst']) {
    const here = (w) => !w.only || w.only === platform, label = (w) => (w.type === 'adsr' || w.type === 'toggle' || w.type === 'label' ? w.type + ' ' + (w.param || w.text || '') : w.type + ' ' + (w.param || ''));
    for (const s of SPEC.SECTIONS) {
      const ws = s.widgets.filter(here).map(w => Object.assign({ w }, ink(w)));
      for (let i = 0; i < ws.length; i++) {
        const a = ws[i];
        if (a.x0 < -0.01 || a.y0 < -0.01 || a.x1 > s.w + 0.01 || a.y1 > s.h + 0.01) bad.push(platform + ' ' + s.id + ': ' + label(a.w) + ' leaves the card');
        for (let j = i + 1; j < ws.length; j++) if (hit(a, ws[j]) && !never(a.w, ws[j].w) && !barAndSync(a.w, ws[j].w)) bad.push(platform + ' ' + s.id + ': ' + label(a.w) + ' overlaps ' + label(ws[j].w));
      }
    }
    const cards = SPEC.SECTIONS.filter(s => s.id !== 'oscframe' && (platform === 'vst' || !s.widgets.every(w => w.only === 'vst')));
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      if (a.view >= 0 && b.view >= 0 && a.view !== b.view) continue;   // another oscillator's cards: not on screen together
      if (a.id.startsWith('lfo') && b.id.startsWith('lfo') && a.id !== 'lfo' && b.id !== 'lfo') continue;   // LFO 2 and LFO 3 share the place
      if (hit({ x0: a.x, y0: a.y, x1: a.x + a.w, y1: a.y + a.h }, { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h })) bad.push(platform + ': the cards ' + a.id + ' and ' + b.id + ' overlap');
    }
  }
  report('layout', bad.length === 0, bad.length ? [...new Set(bad)].slice(0, 6).join('; ') + (bad.length > 6 ? ' ...' : '') : 'no widget overlaps another or leaves its card, no card overlaps another (web app and plug-in)', t);
}

// ---------------------------------------------------------------- 2. JS engine (reference DSP), no browser
async function jsEngine() {
  const t = Date.now(), bad = [];
  const SPEC = require(R('web', 'js', 'spec.js')), C = require(R('web', 'js', 'core.js'))(SPEC), P = C.P;
  const sr = 48000, L = new Float32Array(128), Rb = new Float32Array(128);
  const run = (params, script, blocks) => {
    const eng = new C.Engine(sr); params.forEach((v, i) => eng.setParam(i, v));
    eng.setTables(C.buildTables(Float64Array.from(params), true));
    let pk = 0, nan = 0;
    for (let b = 0; b < blocks; b++) {
      script(eng, b); eng.process(L, Rb, 128);
      for (let i = 0; i < 128; i++) { const a = Math.abs(L[i]), c = Math.abs(Rb[i]); if (!isFinite(a) || !isFinite(c)) nan++; else pk = Math.max(pk, a, c); }
    }
    return { pk, nan };
  };
  // every preset plays a note and a chord (the worker threads share the work: tests/quick_engine_worker.js)
  const { Worker } = require('worker_threads'), nw = Math.max(1, Math.min(12, (require('os').cpus().length || 4) - 2));
  const parts = await Promise.all(Array.from({ length: nw }, (_, k) => new Promise((res) => {
    const w = new Worker(R('tests', 'quick_engine_worker.js'), { workerData: { k, n: nw } });
    w.on('message', res); w.on('error', (e) => res(['worker ' + k + ': ' + e.message]));
  })));
  for (const p of parts) bad.push(...p);
  // Okto MultiWave Synth: the chord keyboard on the opening preset: a selector key, a root, a strum, a plate note
  const ch = SPEC.PRESETS[SPEC.DEFAULT_PRESET].values.slice(); ch[P.chord_mode] = 1; ch[P.chord_strum] = 0.02; ch[P.chord_bass] = 1;
  const c = run(ch, (e, b) => { if (b === 0) { e.keyOn(50, 1); e.keyOn(67, 0.9); } if (b === 60) e.plateOn(79, 0.8); if (b === 90) { e.plateOff(79); e.keyOff(67); } }, 150);
  if (c.nan || c.pk < 1e-3) bad.push(`chord keyboard (G7 strummed, plate): ${c.nan} non-finite, peak ${c.pk.toFixed(3)}`);
  const hi = SPEC.PRESETS[SPEC.DEFAULT_PRESET].values.slice(); hi[P.v_oct] = 3; hi[P.sub_level] = 0.8;
  const x = run(hi, (e, b) => { if (b === 0) e.noteOn(127, 1); if (b === 40) { e.noteOff(127); e.noteOn(60, 0.9); } }, 120);
  if (x.nan || x.pk < 1e-4) bad.push(`note 127 at Octave +3 then C4: ${x.nan} non-finite, peak ${x.pk.toFixed(3)}`);
  // MIDI reader (tools/midi.js, used by the demo converter): a hostile 31-byte file (huge text length) must be rejected at once
  const midi = require(R('tools', 'midi.js')).readSMF;
  const bomb = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 1, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 9, 0, 0xff, 1, 0x8f, 0xff, 0xff, 0xff, 0x7f, 0x41];
  const tm = Date.now(); try { midi(new Uint8Array(bomb)); } catch (_) { /* rejecting it is fine */ }
  if (Date.now() - tm > 200) bad.push(`hostile MIDI file took ${Date.now() - tm} ms`);
  report('JS engine', bad.length === 0, bad.length ? bad.join('; ') : `${SPEC.PRESETS.length} presets sound, finite, <= 0 dBFS; the chord keyboard, extreme notes and a hostile MIDI file are safe`, t);
}

// ---------------------------------------------------------------- 3. VST3 (test host, fast sections only)
function vst3() {
  const t = Date.now(), out = R('tests', 'vst3host', 'out_quick');
  fs.mkdirSync(out, { recursive: true });
  const presets = path.join(out, 'presets_spec.txt');
  cp.spawnSync(process.execPath, [R('tests', 'vst3host', 'make_presets.js'), presets], { encoding: 'utf8' });
  const sections = 'params,audio,offline,attrlist';
  return new Promise((resolve) => {
    const p = cp.spawn(R('tests', 'vst3host', 'vst3host.exe'),
      [R('build', 'OktoMultiWaveSynth.vst3'), out, '--quick', '--skip-editor', '--no-reload', '--only', sections, '--presets', presets, '--timeout', '60'],
      { stdio: 'ignore', windowsHide: true });
    p.on('error', (e) => { report('VST3', false, e.message, t); resolve(); });
    p.on('exit', (code) => {
      let txt = ''; try { txt = fs.readFileSync(path.join(out, 'report.txt'), 'utf8'); } catch (_) { /* no report */ }
      const m = /Checks : (\d+) PASS, (\d+) WARN, (\d+) FAIL/.exec(txt);
      const fails = (txt.match(/^\s*\[FAIL\].*$/gm) || []).slice(0, 3).map(s => s.trim());
      report('VST3', code === 0, m ? `${m[1]} checks pass (${sections})${+m[3] ? '; ' + fails.join(' | ') : ''}${code !== 0 && !+m[3] ? ` (exit ${code}: see tests/vst3host/out_quick/report.txt)` : ''}`
        : `no report (exit ${code}) - see tests/vst3host/out_quick`, t);
      resolve();
    });
  });
}

// ---------------------------------------------------------------- 4. web app smoke test (muted headless Edge)
const DEMO_FIRST = require('../web/js/spec.js').TOUR[2];   // the opening sound of the demo (version 1.0.6: A · Wavelet Lead; tests/web/test_demo.js has the whole sequence)
async function web() {
  const t = Date.now(), bad = [];
  const { Browser, sleep } = require(R('tests', 'web', 'cdp.js'));
  const SPEC = require(R('web', 'js', 'spec.js'));
  let B = null;
  try {
    B = await Browser.launch({ width: 640, height: 430 });   // small window: the live displays redraw faster
    await B.navigate('file:///' + R('web', 'index.html').replace(/\\/g, '/').replace(/ /g, '%20'));
    if (!await B.waitFor('!!window.WS_TEST', 5000)) throw new Error('the app did not start (no WS_TEST)');
    const names = await B.evaluate('WS_TEST.presets()');
    // the menu: the TOP Sounds, then each category's presets by rank (beta 0.2: not the array order, which has the 300 new presets before the 200 of beta 0.1)
    const inTop = new Set(SPEC.TOP_LIST), want = SPEC.TOP_LIST.map(i => SPEC.PRESETS[i].name);   // (version 1.0.3: the TOP Sounds list of the plug-in, the best first; the sections follow without them)
    for (const c of SPEC.CATEGORIES) for (const p of SPEC.PRESETS.filter((q, i) => q.cat === c && !inTop.has(i)).sort((a, b) => a.rank - b.rank)) want.push(p.name);
    if (JSON.stringify(names.slice(0, want.length)) !== JSON.stringify(want)) bad.push('preset menu order differs from the spec');
    const label = await B.evaluate("(document.querySelector('.presets .pname span') || {}).textContent || ''");
    if (label !== SPEC.PRESETS[SPEC.DEFAULT_PRESET].name) bad.push(`opens on '${label}' instead of '${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}'`);
    await B.evaluate('WS_TEST.start()', 10000);
    if (await B.evaluate('WS_TEST.audioState()') !== 'running') bad.push('audio did not start');
    // (beta 0.3: the last preset of the list is a tambourine, a transient a few tens of ms long that the 150 ms polling missed in about one run in three:
    // the last sustained sound is played instead, and the level is read every 50 ms)
    const ampS = SPEC.PARAMS.findIndex(q => q.key === 'amp_s');   // (version 1.0: Pluck is part of Keyboard: a sustained sound is one whose amp sustain is high)
    const sustained = SPEC.PRESETS.map((p, i) => i).filter(i => !/Drums|Bells/.test(SPEC.PRESETS[i].cat) && SPEC.PRESETS[i].values[ampS] >= 0.5).pop();
    for (const k of [0, SPEC.DEFAULT_PRESET, sustained]) {
      await B.evaluate(`WS_TEST.loadPreset(${k})`);
      await B.evaluate('WS_TEST.noteOn(60, 0.9)');
      let peak = 0;   // pads have slow attacks: listen up to 2 s
      for (let w = 0; w < 2000 && !(peak > 1e-3); w += 50) {
        await sleep(50);
        const lv = await B.evaluate('WS_TEST.getLevel()');
        peak = Math.max(peak, lv.peakL, lv.peakR);
      }
      await B.evaluate('WS_TEST.allNotesOff()');
      if (!(peak > 1e-3)) bad.push(`${SPEC.PRESETS[k].name}: no sound`);
    }
    await B.evaluate('WS_TEST.demoStart()');
    await sleep(1200);
    const st = await B.evaluate('WS_TEST.demoState()');
    await B.evaluate('WS_TEST.demoStop()');
    if (!st.running) bad.push('the demo did not start');
    else if (st.preset !== undefined && st.preset !== DEMO_FIRST) bad.push(`demo tour starts on '${st.preset}' instead of '${DEMO_FIRST}'`);
    const errs = B.errors();
    if (errs.length) bad.push('page errors: ' + errs.slice(0, 2).join(' | '));
  } catch (e) {
    bad.push(e.message);
  } finally {
    if (B) await B.close();
  }
  report('web app', bad.length === 0, bad.length ? bad.join('; ') : 'loads without errors, preset order, sound on 3 presets, demo tour starts', t);
}

// ---------------------------------------------------------------- 5. optional: C++ engine vs JS reference
const crypto = require('crypto');
async function dspCompare() {
  const t = Date.now(), dir = R('tests', 'vst3host', 'out_quick', 'dsp');
  fs.mkdirSync(dir, { recursive: true });
  // what the result depends on: the two engines, the spec they are built from, the cases and the two drivers
  const inputs = ['vst/src/dsp.h', 'vst/src/common.h', 'vst/src/generated/spec.h', 'web/js/core.js', 'web/js/spec.js', 'tools/dsp_cases.js', 'tools/dsp_compare.js', 'vst/devtest/dsp_render.cpp'];
  const h = crypto.createHash('sha256'); for (const f of inputs) h.update(fs.readFileSync(R(...f.split('/'))));
  const sig = h.digest('hex'), stamp = path.join(dir, 'last_ok.json');
  if (!opt.force) { try { const o = JSON.parse(fs.readFileSync(stamp, 'utf8')); if (o.sig === sig) return report('C++ vs JS', true, 'unchanged since the last successful run (' + o.line + '); --force runs it again', t); } catch (e) { /* none yet */ } }
  const bin = path.join(process.env.LLVM_MINGW || path.join(process.env.USERPROFILE, 'tools', 'llvm-mingw'), 'bin', 'x86_64-w64-mingw32-clang++.exe');
  const exe = path.join(dir, 'dsp_render.exe');
  let r = cp.spawnSync(bin, ['-std=c++17', '-O2', '-static', '-Wno-format', '-DNOMINMAX', '-I', R('vst', 'external'), '-I', R('vst', 'src'), R('vst', 'devtest', 'dsp_render.cpp'), '-o', exe], { encoding: 'utf8' });
  if (r.status !== 0) return report('C++ vs JS', false, 'compile failed: ' + (r.stderr || r.error || '').toString().slice(0, 300), t);
  r = cp.spawnSync(process.execPath, [R('tools', 'dsp_compare.js'), '--list', dir], { encoding: 'utf8' });   // the cases (cases.txt) the C++ engine renders
  // the shards side by side: each renders its cases with the C++ engine, then compares them with the JS core
  const n = Math.max(1, Math.min(12, (require('os').cpus().length || 4) - 2));
  const run = (cmd, args) => new Promise(res => { let out = ''; const p = cp.spawn(cmd, args, { windowsHide: true }); p.stdout.on('data', d => { out += d; }); p.on('close', code => res({ code, out })); p.on('error', () => res({ code: -1, out })); });
  const shards = await Promise.all(Array.from({ length: n }, async (_, i) => {
    await run(exe, [dir, i + '/' + n]);
    return run(process.execPath, [R('tools', 'dsp_compare.js'), dir, i + '/' + n]);
  }));
  let cases = 0, worst = 0, ok = true;
  for (const s of shards) {
    const m = /matches the JS reference in (\d+) cases \(worst ([0-9.e+-]+)\)/.exec(s.out.trim().split('\n').pop());
    if (s.code !== 0 || !m) { ok = false; continue; }
    cases += +m[1]; worst = Math.max(worst, +m[2]);
  }
  const last = ok ? `C++ port matches the JS reference in ${cases} cases (worst ${worst.toExponential(2)}, ${n} shards)` : shards.filter(s => s.code !== 0).map(s => s.out.trim().split('\n').pop()).join(' | ').slice(0, 300) || 'a shard failed';
  if (ok) fs.writeFileSync(stamp, JSON.stringify({ sig, line: last }));
  report('C++ vs JS', ok, last, t);
}

// ---------------------------------------------------------------- run
(async () => {
  console.log('Okto MultiWave Synth - quick check' + (opt.dsp ? ' (+ C++/JS cross-check)' : ''));
  staticChecks();
  layoutChecks();
  await Promise.all([jsEngine(), vst3(), web()]);   // the slowest parts run side by side
  if (opt.dsp) await dspCompare();
  for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(11)} ${r.detail}${r.time ? `  (${r.time})` : ''}`);
  const ok = results.every(r => r.ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} in ${secs(t0)}`);
  process.exit(ok ? 0 : 1);
})();
