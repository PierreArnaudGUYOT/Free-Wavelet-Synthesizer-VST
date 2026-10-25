// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// selftest_cdp.js - validates cdp.js against tests/web/dummy/index.html (not the product).
//   node tests/web/selftest_cdp.js
// Checks: launch/connect, navigate, evaluate (incl. promises and exceptions), viewport +
// screenshots, mouse click/drag, key events, console.error / uncaught exception capture,
// navigation error reporting, close.
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('./cdp');
const { decodePng, imageStats } = require('./png');

const DUMMY = pathToFileURL(path.join(__dirname, 'dummy', 'index.html')).href;
const OUT = path.join(__dirname, 'out_selftest');
let fails = 0;
const ok = (c, name, d = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${name}${!c && d ? '  -- ' + d : ''}`); if (!c) fails++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await Browser.launch({ width: 1280, height: 860 });
  try {
    await b.navigate(DUMMY);
    ok(await b.evaluate('typeof WS_TEST') === 'object', 'navigate + evaluate');
    ok(await b.evaluate('new Promise(r => setTimeout(() => r(42), 50))') === 42, 'evaluate awaits promises');
    let threw = false;
    try { await b.evaluate('(() => { throw new Error("boom") })()'); } catch (e) { threw = /boom/.test(e.message); }
    ok(threw, 'evaluate surfaces page exceptions');
    for (const [w, h] of [[1280, 860], [1920, 1080]]) {
      const img = decodePng(await b.screenshot(path.join(OUT, `dummy_${w}x${h}.png`), { width: w, height: h }));
      ok(img.width === w && img.height === h, `screenshot at ${w}x${h} has that size`, `${img.width}x${img.height}`);
      ok(imageStats(img).distinctColors > 8, `screenshot at ${w}x${h} is not blank`);
    }
    await b.setViewport(1280, 860);
    await sleep(200);
    ok(b.errors().length === 0, 'no errors on a clean page', b.errors().join('; '));
    await b.evaluate('WS_TEST.start()'); // hides the start overlay
    await sleep(100);
    // mouse: engine segment click (device fills the viewport height: scale = 860/720)
    const r = await b.evaluate(`(() => { const r = document.getElementById('cv').getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; })()`);
    const P = (x, y) => [r.x + (x * r.w) / 1100, r.y + (y * r.h) / 720];
    await b.click(...P(488, 24));
    ok(await b.evaluate(`WS_TEST.getParam('engine')`) === 1, 'Input.dispatchMouseEvent click reaches the page');
    const c0 = await b.evaluate(`WS_TEST.getParam('f_cutoff')`);
    await b.drag(...P(50, 418), P(50, 418)[0], P(50, 418)[1] + 40, 8);
    ok(await b.evaluate(`WS_TEST.getParam('f_cutoff')`) !== c0, 'mouse drag reaches the page');
    // keys
    await b.evaluate(`window.__keys = []; addEventListener('keydown', e => __keys.push(e.code + ':' + e.key + ':' + e.repeat)); true`);
    await b.key('1', { code: 'Digit1' });
    await b.key('a', { code: 'KeyA' });
    await b.key('1', { code: 'Numpad1' });
    const keys = await b.evaluate('__keys');
    ok(JSON.stringify(keys) === JSON.stringify(['Digit1:1:false', 'KeyA:a:false', 'Numpad1:1:false']), 'key events (code/key) reach the page', JSON.stringify(keys));
    // audio via WS_TEST
    await b.evaluate('WS_TEST.noteOn(60, 0.8)');
    await sleep(300);
    const lv = await b.evaluate('WS_TEST.getLevel()');
    ok(lv.peakL > 0.01, 'headless Edge renders WebAudio (level rises)', JSON.stringify(lv));
    await b.evaluate('WS_TEST.noteOff(60)');
    // console capture
    await b.navigate('about:blank');
    const t0 = Date.now();
    await b.navigate(DUMMY + '#error');
    await sleep(300);
    ok(b.errors(t0).some((e) => /deliberate console error/.test(e)), 'console.error captured', b.errors(t0).join('; '));
    await b.navigate('about:blank');
    const t1 = Date.now();
    await b.navigate(DUMMY + '#throw');
    await sleep(300);
    ok(b.errors(t1).some((e) => /deliberate uncaught exception/.test(e)), 'uncaught exception captured', b.errors(t1).join('; '));
    let navErr = '';
    try { await b.navigate(pathToFileURL(path.join(__dirname, 'dummy', 'does-not-exist.html')).href); } catch (e) { navErr = e.message; }
    ok(/ERR_FILE_NOT_FOUND/.test(navErr), 'navigation to a missing file is reported', navErr);
    await b.navigate(DUMMY);
    await b.navigate(DUMMY + '#preset=2');
    ok(true, 'hash-only (same-document) navigation returns without waiting for a load event');
  } catch (e) {
    ok(false, 'self-test ran without driver exceptions', e.stack);
  } finally {
    await b.close();
  }
  ok(true, 'browser closed');
  console.log(fails ? `SELFTEST FAIL (${fails})` : 'SELFTEST PASS');
  process.exit(fails ? 1 : 0);
})();
