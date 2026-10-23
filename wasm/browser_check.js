// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: the test copy with the engine switch (tools/make_test_copy.js --module ab_engine) checked in a headless, muted browser (tests/web/cdp.js; EDGE_PATH),
// opened from file:// WITHOUT --allow-file-access-from-files (as the owner opens it): the page loads with no console error, the JS engine plays by default, the switch
// to WASM plays the WebAssembly engine (sound, a heavy preset, the panel's text), the demo starts with it and keeps running across a switch back to JS.
//   node wasm/browser_check.js --out <empty folder outside the sources> [--keep]
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { Browser, EDGE, sleep } = require('../tests/web/cdp.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', '');
if (!OUT) { console.error('usage: node wasm/browser_check.js --out <folder>'); process.exit(1); }
const ROOT = path.join(__dirname, '..');
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
(async () => {
  console.log(execFileSync(process.execPath, [path.join(ROOT, 'tools/make_test_copy.js'), '--out', OUT, '--module', 'ab_engine'], { encoding: 'utf8' }).trim());
  const b = await Browser.launch({ edgePath: process.env.EDGE_PATH || EDGE, fileAccess: false });
  try {
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const AC = window.AudioContext; if (!AC) return; window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ctx = this; } }; })();` });
    await b.navigate('file:///' + path.join(path.resolve(OUT), 'index.html').replace(/\\/g, '/'));
    await b.waitFor('!!(window.WS_TEST && WS_TEST.setEngine && document.getElementById("ab-engine"))', 20000);
    check(true, 'page and panel loaded');
    const panel = () => b.evaluate('document.getElementById("ab-engine").innerText.replace(/\\s+/g, " ")');
    check((await b.evaluate('WS_TEST.engine().wanted')) === 'js', 'default engine wanted: js');
    const level = async (note, preset) => {   // the peak of a held note (the display messages, 30 per second)
      if (preset !== undefined) { await b.evaluate(`WS_TEST.loadPreset(${preset})`); await sleep(300); }
      await b.evaluate(`WS_TEST.noteOn(${note}, 0.9)`);
      let pk = 0;
      for (let k = 0; k < 15; k++) { await sleep(100); const l = await b.evaluate('WS_TEST.getLevel()'); pk = Math.max(pk, l.peakL, l.peakR); }
      await b.evaluate(`WS_TEST.noteOff(${note})`); await sleep(400);
      return pk;
    };
    await b.evaluate('WS_TEST.start()');
    await b.waitFor('WS_TEST.audioState() === "running"', 10000);
    check((await b.evaluate('WS_TEST.engine().running')) === 'js', 'audio started with the JS engine');
    const pJs = await level(60);
    check(pJs > 0.01, `JS engine sound: peak ${pJs.toFixed(3)}`);
    // switch with the panel's button
    await b.evaluate('document.querySelector("#ab-engine button[data-engine=wasm]").click()');
    await b.waitFor('WS_TEST.engine().running === "wasm" && WS_TEST.engine().switches === 1', 15000);
    const e = await b.evaluate('WS_TEST.engine()');
    check(e.running === 'wasm' && !e.err, `switched to WASM (simd ${e.simd}, error "${e.err}")`);
    const pW = await level(60);
    check(pW > 0.01 && Math.abs(pW - pJs) < 0.02, `WASM engine sound: peak ${pW.toFixed(3)} (JS ${pJs.toFixed(3)})`);
    const names = await b.evaluate('WS_TEST.presets()');
    const heavy = names.findIndex(n => /HIGH_CPU/.test(n));
    const pH = await level(48, heavy >= 0 ? heavy : 5);
    check(pH > 0.01, `WASM, heavy preset "${names[heavy >= 0 ? heavy : 5]}": peak ${pH.toFixed(3)}`);
    const st = await b.evaluate('document.getElementById("st-audio").innerText');
    check(/WASM/.test(st), `status bar: "${st}"`);
    let txt = await panel();
    check(/En marche : WASM/.test(txt), `panel: "${txt}"`);
    // the demo with WASM, then a switch back to JS while it plays
    await b.evaluate('WS_TEST.loadPreset(0)');
    await b.evaluate('WS_TEST.demoStart()');
    await b.waitFor('WS_TEST.demoState().running', 10000);
    await sleep(6000);
    let ds = await b.evaluate('WS_TEST.demoState()');
    let lv = await b.evaluate('WS_TEST.getLevel()');
    check(ds.running && ds.scene >= 1, `demo plays with WASM (scene ${ds.scene}, ${ds.preset})`);
    console.log(`     demo level now: ${Math.max(lv.peakL, lv.peakR).toFixed(3)}`);
    const statsW = await b.evaluate('WS_TEST.playbackStats()');
    await b.evaluate('document.querySelector("#ab-engine button[data-engine=js]").click()');
    await b.waitFor('WS_TEST.engine().running === "js" && WS_TEST.engine().switches === 2', 15000);
    await sleep(3000);
    ds = await b.evaluate('WS_TEST.demoState()');
    check(ds.running, `demo restarted with JS after the switch (scene ${ds.scene})`);
    txt = await panel();
    check(/En marche : JS/.test(txt), `panel: "${txt}"`);
    await b.evaluate('WS_TEST.demoStop()');
    console.log('playbackStats during the WASM demo:', JSON.stringify(statsW));
    const errs = b.errors();
    check(errs.length === 0, `no console error${errs.length ? ': ' + errs.join(' | ') : ''}`);
  } finally {
    await b.close();
  }
  console.log(fails ? `${fails} check(s) failed` : 'browser check passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
