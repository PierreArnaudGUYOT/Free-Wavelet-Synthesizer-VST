// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// quick.js - fast developer check (about 15-30 s) to run after every change. The full suites
// (tests/vst3host, tests/web/test_web.js, tests/web/test_demo.js) stay for releases and big changes.
//
//   node tests/quick.js          static checks + JS engine + VST3 core sections + web app smoke test
//   node tests/quick.js --dsp    also compares the C++ engine with the JS reference (needs llvm-mingw, +20 s)
//
// The browser is headless and muted (cdp.js always passes --mute-audio) and is always closed at the end.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const R = (...p) => path.join(ROOT, ...p);
const opt = { dsp: process.argv.includes('--dsp') };
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
  const dll = R('build', 'WaveletSynthesizer.vst3', 'Contents', 'x86_64-win', 'WaveletSynthesizer.vst3');
  if (mtime(dll) < newest([...listFiles(R('vst', 'src'), /\.(cpp|h|rc)$/), R('tools', 'spec.js')])) stale.push('VST3 build is older than its sources: run  vst\\build.bat');
  const man = newest([...listFiles(R('tools', 'manual'), /\.js$/), R('tools', 'spec.js')]);
  if (mtime(R('web', 'manual', 'manual-a.html')) < man || mtime(R('web', 'manual', 'manual-b.html')) < man) stale.push('manuals are older than their sources: run  node tools/manual/build.js a b');
  report('up to date', stale.length === 0, stale.length ? stale.join('; ') : 'generated spec, VST3 build and manuals are newer than their sources', t2);
}

// ---------------------------------------------------------------- 2. JS engine (reference DSP), no browser
function jsEngine() {
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
  for (const pr of SPEC.PRESETS) {
    const r = run(pr.values, (e, b) => { if (b === 0) e.noteOn(60, 0.9); if (b === 120) { e.noteOn(64, 0.8); e.noteOn(67, 0.8); } }, 190);
    if (r.nan) bad.push(`${pr.name}: ${r.nan} non-finite samples`);
    else if (r.pk < 1e-4) bad.push(`${pr.name}: silent`);
    else if (r.pk > 1.0001) bad.push(`${pr.name}: peak ${r.pk.toFixed(3)} > 0 dBFS`);
  }
  const hi = SPEC.PRESETS[SPEC.DEFAULT_PRESET].values.slice(); hi[P.v_oct] = 3; hi[P.sub_level] = 0.8;
  const x = run(hi, (e, b) => { if (b === 0) e.noteOn(127, 1); if (b === 40) { e.noteOff(127); e.noteOn(60, 0.9); } }, 120);
  if (x.nan || x.pk < 1e-4) bad.push(`note 127 at Octave +3 then C4: ${x.nan} non-finite, peak ${x.pk.toFixed(3)}`);
  // MIDI reader: a hostile 31-byte file (huge text length) must be rejected at once
  const midi = require(R('web', 'js', 'midi.js'));
  const bomb = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 1, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 9, 0, 0xff, 1, 0x8f, 0xff, 0xff, 0xff, 0x7f, 0x41];
  const tm = Date.now(); try { midi(new Uint8Array(bomb)); } catch (_) { /* rejecting it is fine */ }
  if (Date.now() - tm > 200) bad.push(`hostile MIDI file took ${Date.now() - tm} ms`);
  report('JS engine', bad.length === 0, bad.length ? bad.join('; ') : `${SPEC.PRESETS.length} presets sound, finite, <= 0 dBFS; extreme notes and a hostile MIDI file are safe`, t);
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
      [R('build', 'WaveletSynthesizer.vst3'), out, '--quick', '--skip-editor', '--no-reload', '--only', sections, '--presets', presets, '--timeout', '60'],
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
const DEMO_FIRST = 'B · Clarinet';   // the agreed opening sound of the default demo (tests/web/test_demo.js has the whole sequence)
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
    const want = SPEC.PRESETS.map(p => p.name);
    if (JSON.stringify(names.slice(0, want.length)) !== JSON.stringify(want)) bad.push('preset menu order differs from the spec');
    const label = await B.evaluate("(document.querySelector('.presets .pname span') || {}).textContent || ''");
    if (label !== SPEC.PRESETS[SPEC.DEFAULT_PRESET].name) bad.push(`opens on '${label}' instead of '${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}'`);
    await B.evaluate('WS_TEST.start()', 10000);
    if (await B.evaluate('WS_TEST.audioState()') !== 'running') bad.push('audio did not start');
    for (const k of [0, SPEC.DEFAULT_PRESET, SPEC.PRESETS.length - 1]) {
      await B.evaluate(`WS_TEST.loadPreset(${k})`);
      await B.evaluate('WS_TEST.noteOn(60, 0.9)');
      let peak = 0;   // pads have slow attacks: listen up to 2 s
      for (let w = 0; w < 2000 && !(peak > 1e-3); w += 150) {
        await sleep(150);
        const lv = await B.evaluate('WS_TEST.getLevel()');
        peak = Math.max(peak, lv.peakL, lv.peakR);
      }
      await B.evaluate('WS_TEST.allNotesOff()');
      if (!(peak > 1e-3)) bad.push(`${SPEC.PRESETS[k].name}: no sound`);
    }
    await B.evaluate('WS_TEST.demoStart(0)');
    await sleep(1200);
    const st = await B.evaluate('WS_TEST.demoState()');
    await B.evaluate('WS_TEST.demoStop()');
    if (!st.running) bad.push('the default demo did not start');
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
function dspCompare() {
  const t = Date.now(), dir = R('tests', 'vst3host', 'out_quick', 'dsp');
  fs.mkdirSync(dir, { recursive: true });
  const bin = path.join(process.env.LLVM_MINGW || path.join(process.env.USERPROFILE, 'tools', 'llvm-mingw'), 'bin', 'x86_64-w64-mingw32-clang++.exe');
  const exe = path.join(dir, 'dsp_render.exe');
  let r = cp.spawnSync(bin, ['-std=c++17', '-O2', '-static', '-Wno-format', '-DNOMINMAX', '-I', R('vst', 'external'), '-I', R('vst', 'src'), R('vst', 'devtest', 'dsp_render.cpp'), '-o', exe], { encoding: 'utf8' });
  if (r.status !== 0) return report('C++ vs JS', false, 'compile failed: ' + (r.stderr || r.error || '').toString().slice(0, 300), t);
  r = cp.spawnSync(exe, [dir], { encoding: 'utf8' });
  r = cp.spawnSync(process.execPath, [R('tools', 'dsp_compare.js'), dir], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').pop();
  report('C++ vs JS', r.status === 0 && /matches/.test(last), last, t);
}

// ---------------------------------------------------------------- run
(async () => {
  console.log('Wavelet Synthesizer - quick check' + (opt.dsp ? ' (+ C++/JS cross-check)' : ''));
  staticChecks();
  jsEngine();
  await Promise.all([vst3(), web()]);   // the two slowest parts run side by side
  if (opt.dsp) dspCompare();
  for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(11)} ${r.detail}${r.time ? `  (${r.time})` : ''}`);
  const ok = results.every(r => r.ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} in ${secs(t0)}`);
  process.exit(ok ? 0 : 1);
})();
