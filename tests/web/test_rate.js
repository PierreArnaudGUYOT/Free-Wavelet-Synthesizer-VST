// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// test_rate.js - a QUICK check of the RATE THE DEMO test build (tools/make_rate_build.js, tools/rate/rate.js) in headless (muted) Edge: the rule of the new order on made-up ratings, then the
// real demo: it plays, a digit rates the part playing, 5 s back goes back in the piece (and to the part before, whose stars can be changed), pause stops the clock and resume plays on,
// Stop gives the summary, the report holds the new order, the new demo plays.
//   node tests/web/test_rate.js [<build folder>]      (default: builds tools/out/rate_build first)
'use strict';
const path = require('path'), cp = require('child_process');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'tools', 'out', 'rate_build'));
if (!process.argv[2]) { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'make_rate_build.js'), DIR], { encoding: 'utf8' }); if (r.status !== 0) { console.log(r.stderr || r.stdout); process.exit(1); } }
let fails = 0;
const check = (ok, name, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : '  -- ' + detail}`); };

(async () => {
  const B = await Browser.launch({ width: 1500, height: 1000, headless: true, fileAccess: false });
  const ev = (x) => B.evaluate(x), st = async () => JSON.parse(await ev('JSON.stringify(WS_RATE.state())'));
  try {
    const t0 = Date.now();
    await B.navigate(pathToFileURL(path.join(DIR, 'index.html')).href + '#noaudio');
    await sleep(1200);
    check(B.errors(t0).length === 0, 'the rate build loads without console errors', JSON.stringify(B.errors(t0)));
    check(await ev("!!document.getElementById('w-rate') && !!document.querySelector('.rate-btn')"), 'the welcome window has its box and the header its RATE button');
    // the rule, on made-up ratings: parts 2 (3 stars) and 5 (4 stars) of the start, parts 20 (9) and 25 (7) of the second half; 5 and not rated stay
    const r = JSON.parse(await ev(`(() => { const o = WS_SPEC.TOUR.slice(); return JSON.stringify(WS_RATE.newOrder(o, { 1: 3, 4: 4, 6: 5, 19: 9, 24: 7, 27: 5 })); })()`));
    const T = await ev('JSON.stringify(WS_SPEC.TOUR)').then(JSON.parse);
    check(r.order[1] === T[19] && r.order[19] === T[1] && r.order[4] === T[24] && r.order[24] === T[4], 'the best of the second half (9) takes the first place to fill (part 2), the next (7) part 5; the ones under 5 go to their places', JSON.stringify(r.swaps));
    check(r.swaps.length === 2 && r.order[6] === T[6] && r.order[27] === T[27] && new Set(r.order).size === T.length, 'a 5 and the presets not rated stay; no preset twice', JSON.stringify(r.order));
    const r2 = JSON.parse(await ev(`JSON.stringify(WS_RATE.newOrder(WS_SPEC.TOUR.slice(), { 0: 2, 1: 2, 2: 2, 20: 8 }))`));
    check(r2.swaps.length === 1 && r2.order[0] === T[20] && r2.order[1] === T[1], 'more presets under 5 than above 5: only as many changes as there are good ones', JSON.stringify(r2.swaps));
    // the real demo
    await ev("localStorage.removeItem('oktowave.rate.v1'); WS_RATE.reset(); WS_RATE.open(); true");
    await ev("WS_TEST.start().then(() => true)"); await sleep(300);
    await ev("document.querySelector('.rate-win [data-act=start]').click(); true");
    let s; for (let i = 0; i < 30; i++) { await sleep(200); s = await st(); if (s.scene >= 0) break; }
    check(s.phase === 'playing' && s.scene === 0, 'Play the demo: it plays part 1 and the bar shows it', JSON.stringify(s));
    let peak = 0; for (let i = 0; i < 10; i++) { await sleep(150); peak = Math.max(peak, (await ev('WS_TEST.getLevel()')).peakL); }
    check(peak > 0.01, 'the demo sounds', `peak ${peak}`);
    await ev("window.dispatchEvent(new KeyboardEvent('keydown', { key: '7' })); true");
    s = await st();
    check(s.stars[0] === 7, 'the key 7 gives the part playing 7 stars', JSON.stringify(s.stars));
    await ev("document.querySelector('.rate-bar [data-act=rate][data-v=\"3\"]').click(); true");
    check((await st()).stars[0] === 3, 'a click on the third star changes it to 3', '');
    const lab = await ev("document.querySelector('.rate-lab').textContent");
    check(/loop 1 \/ 4/.test(lab), 'the bar says the loop (each preset plays its phrase 4 times)', lab);
    for (let i = 0; i < 100; i++) { await sleep(200); s = await st(); if (s.scene >= 1) break; }
    check(s.scene === 1 && (await ev('WS_RATE.time()')) > 13, 'the demo goes on to part 2 after the 4 loops of part 1 (about 14 s)', JSON.stringify(s));
    for (let i = 0; i < 40 && (await ev('WS_RATE.time()')) < 15.5; i++) await sleep(150);   // (1 s into part 2: 5 s back lands in part 1)
    const tA = await ev('WS_RATE.time()');
    await ev("document.querySelector('.rate-bar [data-act=back]').click(); true");
    await sleep(500);
    const tB = await ev('WS_RATE.time()'); s = await st();
    check(tB < tA - 4 && tB > tA - 5.5 && s.scene === 0, '5 s back: the piece goes back (and part 1 plays again, its stars can be changed)', `from ${tA.toFixed(2)} s to ${tB.toFixed(2)} s, part ${s.scene + 1}`);
    await ev("document.querySelector('.rate-bar [data-act=rate][data-v=\"8\"]').click(); true");
    check((await st()).stars[0] === 8, 'part 1 re-rated 8 after going back', '');
    await ev("document.querySelector('.rate-bar [data-act=pause]').click(); true");
    const p1 = await ev('WS_RATE.time()'); await sleep(1000); const p2 = await ev('WS_RATE.time()');
    check(await ev('WS_RATE.paused()') && Math.abs(p2 - p1) < 0.05, 'Pause: the piece stops where it is', `${p1} -> ${p2}`);
    let lv = 0; await sleep(1500); for (let i = 0; i < 4; i++) { await sleep(100); lv = Math.max(lv, (await ev('WS_TEST.getLevel()')).peakL); }
    check(lv < 0.02, 'Pause: silence after the release', `peak ${lv}`);
    await ev("document.querySelector('.rate-bar [data-act=pause]').click(); true");
    await sleep(1500); const p3 = await ev('WS_RATE.time()');
    check(!(await ev('WS_RATE.paused()')) && p3 > p2 + 0.8, 'Resume: it plays on from there', `${p2} -> ${p3}`);
    await ev("document.querySelector('.rate-bar [data-act=stop]').click(); true");
    await sleep(300); s = await st();
    check(s.phase === 'summary', 'Stop: the summary', JSON.stringify(s.phase));
    const rep = await ev('WS_RATE.report()');
    check(/NEW DEMO ORDER:/.test(rep) && /1 \| .* \| 8/.test(rep), 'the report has the ratings and the new order', rep.slice(0, 200));
    await ev("WS_RATE.replay(); true"); await sleep(1500); s = await st();
    check(s.phase === 'replay', 'Listen to the new demo: it plays', JSON.stringify(s.phase));
    await ev("document.querySelector('.rate-bar [data-act=accept]').click(); true"); await sleep(200);
    check((await st()).accepted, 'Accept', '');
    await ev('WS_RATE.closeAll(); true');
  } catch (e) { fails++; console.log('FAIL exception: ' + e.stack); }
  await B.close();
  console.log(fails ? `${fails} FAIL` : 'rate test passed');
  process.exit(fails ? 1 : 0);
})();
