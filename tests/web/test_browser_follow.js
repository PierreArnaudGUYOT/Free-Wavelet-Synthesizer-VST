// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// test_browser_follow.js - beta 0.2: the preset browser at the right follows the preset box. Every sound chosen with the box's arrows (the
// whole factory list, TOP Sounds then each category) must be shown in the browser: its row is there and marked, the category shown is its
// own; a knob moved on the same sound leaves the bank the player is looking at.
//   node tests/web/test_browser_follow.js
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('./cdp');

const ROOT = path.resolve(__dirname, '..', '..');
const SPEC = require(path.join(ROOT, 'web', 'js', 'spec.js'));
const URL0 = pathToFileURL(path.join(ROOT, 'web', 'index.html')).href + '#noaudio';
let fails = 0;
const check = (ok, what, detail = '') => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${what}${detail ? '  -- ' + detail : ''}`); if (!ok) fails++; };

(async () => {
  const B = await Browser.launch({ width: 1700, height: 1000 });
  const ev = (e) => B.evaluate(e);
  try {
    await B.navigate(URL0);
    await sleep(1200);
    const state = () => ev(`(() => { const b = document.querySelector('.browser'); if (!b || getComputedStyle(b).display === 'none') return null;
      const cur = b.querySelector('.bsnd.cur'), hd = b.querySelector('.bhd'), sel = b.querySelector('.bcat.sel span');
      return { name: (document.querySelector('.presets .pname span') || {}).textContent, row: cur ? cur.title : null, head: hd ? hd.textContent : '', cat: sel ? sel.textContent : '' }; })()`);
    const next = () => ev(`document.querySelectorAll('.presets .arrow')[1].click(); true`);
    const s0 = await state();
    check(!!s0 && s0.row === s0.name, 'the preset browser is open and shows the sound playing', JSON.stringify(s0));
    // step through the whole factory list: at every step the browser shows the sound
    const total = SPEC.PRESETS.length;
    let bad = 0, firstBad = '', cats = new Set(), prevCat = s0 && s0.cat, changes = 0;
    for (let i = 0; i < total + 2; i++) {
      await next();
      await sleep(15);
      const s = await state();
      if (!s || !s.row || s.row !== s.name) { bad++; if (!firstBad) firstBad = JSON.stringify(s); }
      if (s) { cats.add(s.cat); if (s.cat !== prevCat) changes++; prevCat = s.cat; }
    }
    check(bad === 0, `all ${total + 2} steps of the arrows: the sound chosen is shown (its row is in the list at the right)`, firstBad);
    check(cats.size >= SPEC.CATEGORIES.length, `the browser changed bank ${changes} times: ${[...cats].join(', ')}`);
    // a bank chosen by the player stays while the same sound is edited
    await ev(`document.querySelectorAll('.browser .bcat')[3].click(); true`);
    await sleep(100);
    const before = await state();
    await ev(`WS_TEST.setParam('f_cutoff', 4); true`);
    await sleep(100);
    const after = await state();
    check(!!before && !!after && before.cat === after.cat, 'a knob moved on the sound keeps the bank the player is looking at', `${before && before.cat} / ${after && after.cat}`);
    check(B.errors().length === 0, 'no console error', JSON.stringify(B.errors()).slice(0, 200));
  } finally {
    await B.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
