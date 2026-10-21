// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// full.js - the whole validation, for an official release (a pre-release only needs tests/quick.js, the owner's rule): builds the plug-in, then runs one after the other the quick check
// with the C++/JS cross-check, the TOP Sounds against beta 0.7, the engine tests, the web suites (smoke, the demo tour, the full web run on every preset), the plug-in's
// developer checks (the presets file, the VST2 entry point, the plug-in window in a host) and the loud-chord crackle measure on every preset. One line per step, the failing step's last
// lines, a summary at the end, the full log in tests/out/full.log. Takes about 40 minutes on a quiet machine (the web run is the longest).
//   node tests/full.js                run everything
//   node tests/full.js --skip web     leave out the steps whose name contains "web" (several words: --skip web,crackle)
//   node tests/full.js --only quick   only the steps whose name contains "quick"
//   node tests/full.js --parallel     the web suites and everything else side by side (two processes, two logs: tests/out/full-web.log and full-main.log): about half the time
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : ''; };
const skip = arg('skip').split(',').filter(Boolean), only = arg('only').split(',').filter(Boolean);
const LLVM = path.join(process.env.LLVM_MINGW || path.join(process.env.USERPROFILE, 'tools', 'llvm-mingw'), 'bin');
const CXX = path.join(LLVM, 'x86_64-w64-mingw32-clang++.exe'), SCRATCH = path.join(ROOT, 'tests', 'out', 'full');
fs.mkdirSync(SCRATCH, { recursive: true });
const LOGNAME = arg('log') || 'full';
const LOG = path.join(ROOT, 'tests', 'out', LOGNAME + '.log');
const PARALLEL = process.argv.includes('--parallel');
if (PARALLEL) {   // the web suites (headless Edge) and the rest (node, C++) do not need each other: two child runs
  const kids = [['web', ['--only', 'web:', '--log', 'full-web']], ['main', ['--skip', 'web:', '--log', 'full-main']]];
  console.log('Okto MultiWave Synth - full validation, two lanes side by side (logs: tests/out/full-web.log, full-main.log)');
  let pending = kids.length, bad = 0;
  const t0 = Date.now();
  for (const [name, a] of kids) {
    const p = cp.spawn(process.execPath, [__filename, ...a], { cwd: ROOT, windowsHide: true });
    let out = ''; p.stdout.on('data', d => { out += d; });
    p.on('close', code => {
      console.log(`--- lane ${name} ---\n${out.trim()}`);
      if (code) bad++;
      if (--pending === 0) { console.log(`${bad ? 'FAIL' : 'PASS'}: both lanes in ${((Date.now() - t0) / 60000).toFixed(1)} min`); process.exit(bad ? 1 : 0); }
    });
  }
}
if (!PARALLEL) fs.writeFileSync(LOG, 'full validation ' + new Date().toISOString() + '\n');
const env = Object.assign({}, process.env, { PATH: LLVM + path.delimiter + process.env.PATH });

const steps = [];
const step = (name, fn) => steps.push({ name, fn });
const run = (cmd, args, o = {}) => {
  const r = cp.spawnSync(cmd, args, Object.assign({ cwd: ROOT, encoding: 'utf8', env, maxBuffer: 1 << 28, windowsHide: true }, o));
  const out = (r.stdout || '') + (r.stderr || '');
  fs.appendFileSync(LOG, '\n$ ' + cmd + ' ' + args.join(' ') + '\n' + out);
  return { code: r.status === null ? 1 : r.status, out };
};
const node = (script, ...a) => run(process.execPath, [path.join(ROOT, script), ...a]);
const tail = (s, n = 3) => s.trim().split('\n').slice(-n).join(' | ').slice(0, 260);
const ok = (r, re) => r.code === 0 && (!re || re.test(r.out));

step('build plug-in', () => { const r = run('cmd', ['/c', 'vst\\build.bat']); return { ok: r.code === 0, detail: tail(r.out, 2) }; });
step('quick + C++/JS cross-check', () => { const r = node('tests/quick.js', '--dsp', '--force'); return { ok: ok(r, /^PASS/m), detail: tail(r.out, 7) }; });
step('TOP Sounds vs beta 0.7', () => { const r = node('tests/regress_v07.js'); return { ok: ok(r), detail: tail(r.out, 1) }; });
for (const t of ['idle_skip', 'filter', 'supermod', 'display_live', 'preset_change']) step('engine: ' + t, () => { const r = node('tests/' + t + '.js'); return { ok: ok(r), detail: tail(r.out, 1) }; });
for (const t of ['smoke', 'test_demo', 'test_web']) step('web: ' + t, () => { const r = node('tests/web/' + t + '.js'); return { ok: ok(r), detail: tail(r.out, 2) }; });
// the plug-in's developer checks (each is compiled here)
const cc = (src, exe, extra) => run(CXX, ['-std=c++17', '-O2', '-static', '-DNOMINMAX', '-I', 'vst/external', '-I', 'vst/src', ...src, '-o', exe, ...extra]);
step('plug-in: presets file (library_test)', () => {
  const exe = path.join(SCRATCH, 'library_test.exe');
  let r = cc(['vst/devtest/library_test.cpp'], exe, ['-municode', '-DUNICODE', '-D_UNICODE', '-lshell32', '-lole32']);
  if (r.code !== 0) return { ok: false, detail: 'compile: ' + tail(r.out, 2) };
  r = run(exe, [path.join(SCRATCH, 'library_out')]); return { ok: ok(r, /ALL PASS/), detail: tail(r.out, 1) };
});
step('plug-in: VST2 entry point', () => {
  const exe = path.join(SCRATCH, 'vst2_smoke.exe');
  let r = cc(['vst/devtest/vst2_smoke.cpp'], exe, ['-luser32', '-lgdi32']);
  if (r.code !== 0) return { ok: false, detail: 'compile: ' + tail(r.out, 2) };
  r = run(exe, []); return { ok: ok(r, /0 FAIL/), detail: tail(r.out, 1) };
});
step('plug-in: window in a host (vote_session: tabs, CHORD MODE, fit, browser)', () => {
  const exe = path.join(SCRATCH, 'vote_session.exe'), dir = path.join(SCRATCH, 'vote');
  fs.mkdirSync(dir, { recursive: true });
  let r = cc(['vst/devtest/vote_session.cpp', 'vst/src/iids.cpp', 'vst/external/pluginterfaces/base/funknown.cpp'], exe, ['-municode', '-DUNICODE', '-D_UNICODE', '-lgdiplus', '-lgdi32', '-luser32', '-lole32', '-luuid']);
  if (r.code !== 0) return { ok: false, detail: 'compile: ' + tail(r.out, 2) };
  r = run(exe, [path.join(ROOT, 'build', 'OktoMultiWaveSynth.vst3', 'Contents', 'x86_64-win', 'OktoMultiWaveSynth.vst3'), dir], { timeout: 600000 });
  return { ok: ok(r, /ALL PASS/), detail: tail(r.out, 1) };
});
// the crackle of a loud chord: the high-frequency residual of what the output stage adds, every preset, three chords at velocity 1 (tools/crackle.js)
for (const [label, notes] of [['triad C6', '84,88,91'], ['five notes', '72,76,79,84,88'], ['six notes', '60,64,67,72,76,79']]) {
  step('crackle: ' + label, () => {
    const r = node('tools/crackle.js', '--notes', notes, '--procs', '12');
    const m = /crackle \(HF residual d3\): >2 % (\d+)\s+>1 % (\d+)/.exec(r.out), d2 = /(\d+) crackle \(the waveform/.exec(r.out);
    const good = r.code === 0 && m && +m[1] === 0 && +m[2] <= 3;
    return { ok: !!good, detail: m ? `HF residual above 2 %: ${m[1]}, above 1 %: ${m[2]}; waveform change above 2 %: ${d2 ? d2[1] : '?'}` : tail(r.out, 2) };
  });
}

if (!PARALLEL) {   // (the parallel run only starts the two lanes above)
  const results = [], t0 = Date.now();
  console.log('Okto MultiWave Synth - full validation (log: tests/out/full.log)');
  for (const s of steps) {
    if ((skip.length && skip.some(k => s.name.includes(k))) || (only.length && !only.some(k => s.name.includes(k)))) { console.log(`  skip  ${s.name}`); continue; }
    const t = Date.now();
    let r; try { r = s.fn(); } catch (e) { r = { ok: false, detail: e.message }; }
    results.push({ name: s.name, ok: r.ok });
    console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${s.name.padEnd(42)} ${((Date.now() - t) / 1000).toFixed(0).padStart(5)} s  ${r.detail || ''}`);
  }
  const fails = results.filter(r => !r.ok);
  console.log(`${fails.length ? 'FAIL' : 'PASS'}: ${results.length - fails.length} / ${results.length} steps in ${((Date.now() - t0) / 60000).toFixed(1)} min${fails.length ? '; failed: ' + fails.map(f => f.name).join(', ') : ''}`);
  process.exit(fails.length ? 1 : 0);
}
