// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// test_manual.js - the eight pages of the manual (web/manual/*.html) in headless (muted) Edge, opened from file:// as the plug-in's MANUAL button opens them:
// every page loads without a console error, has its menu (built by manual.js from one list) with its own entry marked, a "previous / next" pager that leads
// through all the pages in order, a title, pictures that really load and have a text alternative, nothing wider than a phone screen, a print style; each of the
// seven pages of the explanation prints on ONE A4 sheet (a WARN, not a failure, if a font of another computer makes one run over).
//   node tests/web/test_manual.js
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'web', 'manual');
const PAGES = ['manual', 'wavelets', 'subtractive-1', 'subtractive-2', 'subtractive-3', 'additive-1', 'additive-2', 'additive-3'];
let fails = 0, warns = 0;
const check = (ok, name, detail = '', sev = 'FAIL') => { if (!ok) { if (sev === 'WARN') warns++; else fails++; } console.log(`${ok ? 'ok  ' : sev === 'WARN' ? 'WARN' : 'FAIL'} ${name}${ok ? '' : '  -- ' + detail}`); };

(async () => {
  const B = await Browser.launch({ width: 1000, height: 900, headless: true, fileAccess: false });
  try {
    for (const [i, p] of PAGES.entries()) {
      const t0 = Date.now();
      await B.setViewport(1000, 900);
      await B.navigate(pathToFileURL(path.join(DIR, p + '.html')).href);
      await sleep(500);
      const info = JSON.parse(await B.evaluate(`JSON.stringify((() => {
        const pills = [...document.querySelectorAll('.mnav a.pill')], cur = pills.filter((a) => a.hasAttribute('aria-current'));
        const pager = [...document.querySelectorAll('.pager a')].map((a) => a.getAttribute('href'));
        const imgs = [...document.querySelectorAll('main img')].map((m) => ({ src: m.getAttribute('src'), ok: m.complete && m.naturalWidth > 0, alt: (m.getAttribute('alt') || '').length }));
        let printRule = false; try { for (const sh of document.styleSheets) for (const r of sh.cssRules) if (r.type === 4 && /print/.test(r.conditionText || r.media.mediaText)) printRule = true; } catch (e) { printRule = null; }
        return { title: document.title, h1: (document.querySelector('h1') || {}).textContent || '', pills: pills.length, cur: cur.map((a) => a.getAttribute('href')), pager, imgs, printRule,
          wide: document.documentElement.scrollWidth > window.innerWidth + 1 }; })())`));
      check(B.errors(t0).length === 0, `${p}: loads without console errors`, JSON.stringify(B.errors(t0)));
      check(/OktoWave/.test(info.title) && info.h1.length > 3, `${p}: has a title and a heading`, JSON.stringify([info.title, info.h1]));
      check(info.pills === PAGES.length && info.cur.length === 1 && info.cur[0] === p + '.html', `${p}: the menu has ${PAGES.length} entries and marks this page`, JSON.stringify([info.pills, info.cur]));
      const want = [i > 0 ? PAGES[i - 1] + '.html' : null, i < PAGES.length - 1 ? PAGES[i + 1] + '.html' : null].filter(Boolean);
      check(JSON.stringify(info.pager) === JSON.stringify(want), `${p}: the pager leads to ${want.join(' and ')}`, JSON.stringify(info.pager));
      check(info.imgs.every((m) => m.ok && m.alt > 10), `${p}: its ${info.imgs.length} pictures load and have a text alternative`, JSON.stringify(info.imgs.filter((m) => !m.ok || m.alt <= 10)));
      check(info.printRule !== false, `${p}: has a print style`, 'no @media print rule', 'WARN');
      // a phone: no horizontal scroll
      await B.setViewport(390, 800);
      await sleep(250);
      const wide = await B.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1');
      check(!wide, `${p}: nothing wider than a phone screen (390 px)`, `scrollWidth ${await B.evaluate('document.documentElement.scrollWidth')}`);
    }
    // version 1.0.9: the credits and thanks of the earlier manuals are kept on the contents page (the testers, the demo music, the licences of what is reused)
    await B.navigate(pathToFileURL(path.join(DIR, 'manual.html')).href);
    await sleep(300);
    const credits = await B.evaluate(`(() => { const h = document.getElementById('credits'); if (!h) return null; let t = ''; for (let e = h.nextElementSibling; e && e.tagName !== 'FOOTER' && e.tagName !== 'H2'; e = e.nextElementSibling) t += ' ' + e.textContent; return t; })()`);
    check(!!credits && /Jérémie Paligrini \(Soul Machine\)/.test(credits) && /Flo \(Go Tiger\)/.test(credits) && /Arnaud Grignard/.test(credits) && /Mutopia/.test(credits) && /PyWavelets/.test(credits) && /Steinberg/.test(credits),
      'manual: "Credits and thanks" names Soul Machine, Go Tiger, Arnaud Grignard, the demo music (Mutopia), PyWavelets and the Steinberg headers', String(credits).slice(0, 200));
    // one A4 sheet per page of the explanation
    await B.setViewport(1000, 900);
    for (const p of PAGES.slice(1)) {
      await B.navigate(pathToFileURL(path.join(DIR, p + '.html')).href);
      await sleep(400);
      const r = await B.send('Page.printToPDF', { paperWidth: 8.27, paperHeight: 11.69, preferCSSPageSize: true, printBackground: true });
      const sheets = (Buffer.from(r.data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      check(sheets === 1, `${p}: prints on one A4 sheet`, `${sheets} sheets`, 'WARN');
    }
  } finally { await B.close(); }
  console.log(`\nChecks done: ${fails} FAIL, ${warns} WARN`);
  console.log(fails ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
