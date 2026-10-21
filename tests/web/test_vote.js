// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// test_vote.js - a QUICK check of the demo VOTE test build (tools/make_vote_build.js, tools/vote/vote.js) in headless (muted) Edge: the first phrase really plays and ends with the rating window,
// then (the audio left out, fast mode) the rules: 8+ keeps, 10 asks a position, under 5 offers five other presets (and "5 more" five different ones), a digit key rates, the summary lists the
// final order (the moved preset where asked, the replacement at its place, no preset twice), the report is posted to the Google Form (fetch mocked), and the whole demo plays again with the new list.
//   node tests/web/test_vote.js [<build folder>]      (default: builds tools/out/vote_build first)
'use strict';
const path = require('path'), cp = require('child_process');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'tools', 'out', 'vote_build'));
if (!process.argv[2]) { const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'make_vote_build.js'), DIR], { encoding: 'utf8' }); if (r.status !== 0) { console.log(r.stderr || r.stdout); process.exit(1); } }
let fails = 0;
const check = (ok, name, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : '  -- ' + detail}`); };

(async () => {
  const B = await Browser.launch({ width: 1500, height: 1000, headless: true, fileAccess: false });
  const ev = (x) => B.evaluate(x), V = (x) => ev(`WS_VOTE.${x}`), st = async () => JSON.parse(await ev('JSON.stringify(WS_VOTE.state())'));
  const waitPhase = async (p, ms = 8000) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await st(); if (s.phase === p) return s; await sleep(100); } return s; };
  try {
    const t0 = Date.now();
    await B.navigate(pathToFileURL(path.join(DIR, 'index.html')).href + '#noaudio');
    await sleep(1200);
    check(B.errors(t0).length === 0, 'the vote build loads without console errors', JSON.stringify(B.errors(t0)));
    check(await ev("!!document.getElementById('w-vote') && !!document.getElementById('vote-btn')"), 'the welcome window has its vote box and the header its VOTE button');
    await ev("localStorage.removeItem('oktowave.vote.v1'); WS_VOTE.reset(); true");
    await ev('WS_VOTE.open(); true');
    let s = await st();
    check(s.phase === 'start' && s.n === 30, 'the vote window opens on its start screen (30 parts)', JSON.stringify(s));
    // the first phrase really plays: start, a level above silence while it plays, then the rating window
    await ev("WS_TEST.start().then(() => true)"); await sleep(400);
    await ev("document.querySelector('[data-act=restart]').click(); true");
    s = await waitPhase('listen', 3000);
    check(s.phase === 'listen' && s.k === 0, 'Start plays part 1', JSON.stringify(s));
    let peak = 0; for (let i = 0; i < 20; i++) { await sleep(150); peak = Math.max(peak, (await ev('WS_TEST.getLevel()')).peakL); }
    check(peak > 0.01, 'the first phrase sounds', `peak ${peak}`);
    s = await waitPhase('rate', 6000);
    check(s.phase === 'rate' && s.k === 0, 'the rating window opens at the end of the phrase', JSON.stringify(s));
    const label = await ev("document.querySelector('.vote-name').textContent");
    const plan = JSON.parse(await ev('JSON.stringify(WS_VOTE.plan())'));
    check(label === plan[0].preset, 'the window names the preset of part 1', `${label} / ${plan[0].preset}`);
    check(await ev("document.querySelectorAll('.vote-star').length") === 10, 'ten stars to click');
    const notes = JSON.parse(await ev('JSON.stringify(WS_VOTE.phraseNotes(0))'));
    check(notes.length > 40 && notes[0] === 0, 'part 1 is a phrase of the piece, starting at 0 on its first note', `${notes.length / 4} notes, first at ${notes[0]}`);
    // the rules, without the audio
    await V('fast(true)');
    await ev("document.querySelectorAll('.vote-star')[8].click(); true");   // 9 stars on part 1: nothing changes
    s = await waitPhase('rate', 3000);
    check(s.stars[0] === 9 && s.k === 1 && !s.moved[0] && !s.replaced[0], '9 stars keep the preset and go to part 2', JSON.stringify(s));
    await ev("document.querySelectorAll('.vote-star')[9].click(); true");   // 10 stars on part 2
    s = await waitPhase('ten', 2000);
    check(s.phase === 'ten' && /Position in the demo/.test(await ev("document.querySelector('.vote-body').textContent")), '10 stars ask the position in the demo', JSON.stringify(s));
    await ev("document.getElementById('vote-pos').value = '1'; document.querySelector('[data-act=move]').click(); true");
    s = await waitPhase('rate', 3000);
    check(s.moved[1] === 1 && s.k === 2 && s.final[0] === plan[1].preset, 'the 10-star preset is moved to position 1', JSON.stringify({ moved: s.moved, first: s.final[0] }));
    await ev("window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true })); true");   // a digit rates: 3 stars on part 3
    s = await waitPhase('alt', 2000);
    check(s.phase === 'alt' && s.stars[2] === 3 && s.alt.length === 5 && new Set(s.alt).size === 5, 'a digit key rates: 3 stars offer five different presets', JSON.stringify(s.alt));
    const tour = new Set(plan.map((x) => x.preset));
    check(s.alt.every((n) => !tour.has(n)), 'none of the five is already in the demo');
    const first5 = s.alt.slice();
    await ev("document.querySelector('[data-act=more]').click(); true"); await sleep(100);
    s = await st();
    check(s.alt.length === 5 && s.alt.every((n) => !first5.includes(n)), '"5 more" offers five others', JSON.stringify(s.alt));
    await V('listenAlt(WS_VOTE.state().alt[0]).then(() => true)'); await sleep(100);
    const pick = s.alt[1];
    await ev("document.querySelectorAll('[data-act=choose]')[1].click(); true");
    s = await waitPhase('rate', 3000);
    check(s.replaced[2] === pick && s.k === 3 && s.final[s.final.indexOf(pick)] === pick, 'the chosen preset replaces the original at its place', JSON.stringify({ replaced: s.replaced, k: s.k }));
    await ev("document.querySelectorAll('.vote-star')[6].click(); true");   // 7 stars: kept
    s = await waitPhase('rate', 3000);
    check(s.stars[3] === 7 && !s.replaced[3] && !s.moved[3] && s.k === 4, '7 stars keep the preset', JSON.stringify(s.stars));
    await ev("document.querySelector('[data-act=skip]').click(); true");
    s = await waitPhase('rate', 3000);
    check(s.k === 5 && s.stars[4] === undefined, 'Skip goes on without a rating', JSON.stringify(s));
    for (let k = 5; k < 30; k++) { await ev("document.querySelectorAll('.vote-star')[7].click(); true"); await sleep(60); }
    s = await waitPhase('summary', 4000);
    const uniq = new Set(s.final);
    check(s.phase === 'summary' && s.final.length === 30 && uniq.size === 30, 'the summary lists 30 different presets', `${s.final.length} presets, ${uniq.size} different`);
    check(s.final[0] === plan[1].preset && s.final.includes(pick) && !s.final.includes(plan[2].preset), 'the new order has the moved preset first and the replacement instead of the poor one', JSON.stringify(s.final.slice(0, 4)));
    // the report goes to the form
    await ev("window.__posts = []; window.fetch = (u, o) => { window.__posts.push({ u, body: String(o.body), mode: o.mode }); return Promise.resolve({}); }; true");
    await V('sendReport().then(() => true)'); await sleep(200);
    const posts = JSON.parse(await ev('JSON.stringify(window.__posts)')); s = await st();
    const sent = posts[0] && new URLSearchParams(posts[0].body);
    check(posts.length === 1 && /docs\.google\.com\/forms\/d\/e\/.+\/formResponse$/.test(posts[0].u) && posts[0].mode === 'no-cors' && s.sendStatus === 'sent', 'SEND REPORT posts to the Google Form', JSON.stringify({ n: posts.length, u: posts[0] && posts[0].u, status: s.sendStatus }));
    const rep = sent && sent.get('entry.79964320') || '';
    const json = JSON.parse((/\nJSON: (.*)$/.exec(rep) || [])[1] || 'null');
    check(/OKTOWAVE DEMO VOTE REPORT/.test(rep) && json && json.stars.length === 30 && json.stars[1].stars === 10 && json.stars[1].moved === 1 && json.stars[2].replaced === pick && json.stars[2].heard.length === 10 && json.final.length === 30,
      'the report lists every part with its stars, the move, the replacement, the presets heard, and the final order', rep.slice(0, 200));
    // the whole demo plays again with the new list
    await V('fast(false)');
    await V('replayWhole().then(() => true)'); await sleep(1800);
    const d = await ev('JSON.stringify(WS_TEST.demoState())'), ds = JSON.parse(d);
    check(ds.running && ds.preset === s.final[0] && (await st()).phase === 'replay', 'the replay plays the demo with the new list (its first preset is the moved one)', d);
    await V('accept()'); await sleep(300);
    s = await st();
    check(s.phase === 'accepted' && s.accepted && !(await ev('WS_TEST.demoState().running')), 'Accept ends the replay and records the acceptance', JSON.stringify({ phase: s.phase, accepted: s.accepted }));
    const stored = JSON.parse(await ev("localStorage.getItem('oktowave.vote.v1')"));
    check(stored && stored.accepted === true && Object.keys(stored.stars).length === 29, 'the progress is kept in the browser', JSON.stringify(stored && Object.keys(stored)));
  } finally { await B.close(); }
  console.log(fails ? `${fails} failure(s)` : 'vote test passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
