// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// smoke.js - a quick look at the web app in headless (muted) Edge: the page loads without errors, the three oscillator views show
// their own cards, the folder tabs belong to the engine shown (OSC1 A1 | OSC2 A2, OSC1 B1), CHORD MODE shows the chord card and grows the panel; screenshots of each view go to <out>.
//   node tests/web/smoke.js [--out <dir>] [--hash <fragment>]
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('./cdp');
const OVERLAP = require('./overlap');   // the layout rule: nothing overlaps (see overlap.js)
const ROOT = path.resolve(__dirname, '..', '..');
let out = path.join(__dirname, 'out'), hash = '#noaudio#nobrowser';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--out') out = path.resolve(process.argv[++i]);
  else if (process.argv[i] === '--hash') hash = process.argv[++i];
}
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (ok, name, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : '  -- ' + detail}`); };

(async () => {
  const B = await Browser.launch({ width: 1500, height: 1160, headless: true, fileAccess: true });
  try {
    await B.navigate(pathToFileURL(path.join(ROOT, 'web', 'index.html')).href + hash);
    await sleep(800);
    check(await B.evaluate('typeof WS_TEST === "object"'), 'the test hook is there');
    const noOverlap = async (what) => { const l = JSON.parse(await B.evaluate(OVERLAP)); check(l.length === 0, `${what}: nothing overlaps (knob rings, labels, pictures) and nothing leaves its card`, l.slice(0, 4).join(' | ')); };
    const shown = () => B.evaluate(`[...document.querySelectorAll('#device .section')].filter(s => !s.classList.contains('hidden')).map(s => s.querySelector('.title') ? s.querySelector('.title').textContent : '(' + s.style.top + ')')`);
    // beta 0.3: the three folder tabs OSC1 A1 | OSC2 A2 | OSC3 B1 (no engine tabs), the cards of the oscillator shown, OSC MIX and the SCOPE common to all
    const tabs = () => B.evaluate(`[...document.querySelectorAll('#device .otab')].map(b => b.querySelector('.t1').textContent.trim() + (b.classList.contains('on') ? '*' : ''))`);
    check((await B.evaluate(`document.querySelectorAll('#device .engtabs').length`)) === 0, 'no ENGINE tabs any more');
    for (const [v, name] of [[0, 'A1'], [1, 'A2'], [2, 'B1']]) {
      await B.evaluate(`WS_TEST.setParam('osc_view', ${v})`);
      await sleep(250);
      const want = ['OSC1 A1' + (v === 0 ? '*' : ''), 'OSC2 A2' + (v === 1 ? '*' : ''), 'OSC3 B1' + (v === 2 ? '*' : '')];
      const tb = await tabs();
      check(JSON.stringify(tb) === JSON.stringify(want), `view ${name}: the folder tabs are ${want.join(' | ')}`, JSON.stringify(tb));
      const t = await shown(), n = (s) => t.filter(x => x === s).length;
      check(n(name === 'B1' ? 'WAVELET · ADDITIVE' : 'WAVELET · SUBTRACTIVE') === 1 && n(name === 'B1' ? 'WAVELET · SUBTRACTIVE' : 'WAVELET · ADDITIVE') === 0, `view ${name}: its wavelet card is shown, and only that one`, JSON.stringify(t));
      check(n('SCALE FILTER') === 1 && n('POSITION') === 1 && n('TUNE · OWN ENVELOPE · PITCH ENVELOPE') === 1, `view ${name}: one SCALE FILTER, POSITION and TUNE card`, JSON.stringify(t));
      check(n('OSC MIX') === 1 && t.some(x => x.startsWith('SCOPE')) && n('FILTER') === 1 && n('LFO 1') === 1, `view ${name}: OSC MIX, the SCOPE, the FILTER and LFO 1 are always there`, JSON.stringify(t));
      await noOverlap('view ' + name);
      await B.screenshot(path.join(out, `view-${name}.png`), { width: 1500, height: 1160 });
    }
    // the LFO 2 | LFO 3 sub-tab: one card at a time
    for (const lv of [0, 1, 0]) {
      await B.evaluate(`WS_TEST.setParam('lfo_view', ${lv})`);
      await sleep(200);
      const t = await shown();
      check(t.filter(x => x === 'LFO 2/3').length === 1, `LFO card ${lv === 0 ? 'LFO 2' : 'LFO 3'}: one LFO 2/3 card is shown`, JSON.stringify(t.filter(x => /LFO/.test(x))));
      await noOverlap(lv === 0 ? 'LFO 2' : 'LFO 3');
    }
    // beta 0.3.4: the LFO 2 | LFO 3 tabs, the stepped SHAPE knob, the knobs of LFO 1 / LFO 2/3 / VOICE on one line, LFO 1's underlined selector
    {
      const q = (js) => B.evaluate(js);
      const tabsOn = () => q(`[...document.querySelectorAll('#device .section:not(.hidden) .ltab')].map(b => b.textContent.trim() + (b.classList.contains('on') ? '*' : '') + (b.classList.contains('heard') ? '+' : ''))`);
      await q(`WS_TEST.setParam('osc_view', 0); WS_TEST.setParam('lfo2_amt', 0.45); WS_TEST.setParam('lfo3_amt', 0); WS_TEST.setParam('lfo_view', 0); WS_TEST.setParam('lfo2_shape', 3); WS_TEST.setParam('lfo3_shape', 2); true`);
      await sleep(200);
      check(JSON.stringify(await tabsOn()) === JSON.stringify(['LFO 2*+', 'LFO 3']), 'LFO 2/3 card: two tabs, LFO 2 shown and lit (its amount is not 0), LFO 3 off', JSON.stringify(await tabsOn()));
      const c = await q(`(() => { const t = [...document.querySelectorAll('#device .section:not(.hidden) .ltab')][1].getBoundingClientRect(); return [t.left + t.width / 2, t.top + t.height / 2]; })()`);
      await B.click(c[0], c[1]);
      await sleep(250);
      check((await q(`WS_TEST.getParam('lfo_view')`)) === 1 && JSON.stringify(await tabsOn()) === JSON.stringify(['LFO 2+', 'LFO 3*']), 'a click on the LFO 3 tab shows LFO 3', JSON.stringify(await tabsOn()));
      const shape = () => q(`(() => { const k = [...document.querySelectorAll('#device .section:not(.hidden) .knob')].filter(e => /LFO 3 Shape/.test(e.title)); return k.length + ':' + (k[0] ? k[0].querySelector('.label').textContent : ''); })()`);
      check((await shape()) === '1:SAW', 'the SHAPE of LFO 3 is a knob with its shape written under it (SAW)', await shape());
      await q(`WS_TEST.setParam('lfo3_shape', 4); true`); await sleep(150);
      check((await shape()) === '1:S&H', 'the knob follows the parameter (S&H)', await shape());
      const rows = await q(`(() => { const y = (sid, sel) => { const e = document.querySelector('#device .section[data-sid="' + sid + '"]:not(.hidden) ' + sel); return Math.round(e.getBoundingClientRect().top * 10) / 10; };
        return [y('lfo', '.knob'), y('lfo3', '.knob'), y('voice', '.knob')]; })()`);
      check(rows[0] === rows[1] && rows[1] === rows[2], 'the knobs of LFO 1, LFO 2/3 and VOICE are on one line', JSON.stringify(rows));
      check(await q(`document.querySelector('#device .section[data-sid="lfo"] .seg.uline button.on') !== null`), 'the wave selector of LFO 1 is the underlined one');
      await q(`WS_TEST.setParam('lfo_view', 0); true`);
      // the oriental colour code: ARAB / TURK on the PLAY card's TUNING switch
      const accent = () => q(`getComputedStyle(document.getElementById('device')).getPropertyValue('--accent').trim()`);
      check((await accent()) === '#ffd166' && !(await q(`document.getElementById('device').classList.contains('orient')`)), 'TUNING WEST: the yellow accent, no oriental class');
      await q(`WS_TEST.setParam('mt_mode', 1); true`); await sleep(250);
      check((await accent()) === '#f0b84a' && (await q(`document.getElementById('device').classList.contains('orient')`)), 'TUNING ARAB: the sand-gold accent', await accent());
      check(await q(`getComputedStyle(document.querySelector('#device .orientbg')).display === 'block'`), 'TUNING ARAB: the PLAY card shows its pattern');
      await noOverlap('TUNING ARAB');
      await B.screenshot(path.join(out, 'tuning-arab.png'), { width: 1500, height: 1160 });
      await q(`WS_TEST.setParam('osc_view', 2); true`); await sleep(250);
      check((await accent()) === '#e46f4a', 'TUNING ARAB, additive oscillator B1: the coral accent', await accent());
      await q(`WS_TEST.setParam('mt_mode', 2); true`); await sleep(250);
      check((await accent()) === '#ffb347', 'TUNING TURK, additive oscillator B1: the carmine palette\'s amber accent', await accent());
      await q(`WS_TEST.setParam('osc_view', 0); true`); await sleep(250);
      check((await accent()) === '#ff5468', 'TUNING TURK, subtractive oscillator A1: the carmine accent', await accent());
      await noOverlap('TUNING TURK');
      await q(`WS_TEST.setParam('osc_view', 2); true`); await sleep(250);
      await B.screenshot(path.join(out, 'tuning-turk-b1.png'), { width: 1500, height: 1160 });
      await q(`WS_TEST.setParam('osc_view', 0); WS_TEST.setParam('mt_mode', 0); true`); await sleep(250);
      check((await accent()) === '#ffd166' && await q(`getComputedStyle(document.querySelector('#device .orientbg')).display === 'none'`), 'TUNING WEST again: the yellow accent, no pattern');
    }
    check(!(await shown()).some(x => x.includes('CHORD KEYBOARD')), 'the chord card is hidden while CHORD MODE is off');
    const h0 = await B.evaluate(`document.getElementById('device').style.height`);
    await B.evaluate(`WS_TEST.setParam('chord_mode', 1)`);
    await sleep(300);
    const h1 = await B.evaluate(`document.getElementById('device').style.height`);
    check((await shown()).some(x => x.includes('CHORD KEYBOARD')), 'CHORD MODE shows the chord card');
    check(parseFloat(h1) === parseFloat(h0) + 120, 'CHORD MODE grows the panel by 120', `${h0} -> ${h1}`);
    await noOverlap('CHORD MODE');
    await B.screenshot(path.join(out, 'chord-mode.png'), { width: 1500, height: 1320 });
    await B.evaluate(`WS_TEST.setParam('chord_mode', 0)`);
    await sleep(200);
    check(parseFloat(await B.evaluate(`document.getElementById('device').style.height`)) === parseFloat(h0), 'CHORD MODE off: the panel shrinks back');
    const errs = B.errors();
    // version 1.0.7 (CPU review 7.3): a parameter moved redraws the displays of the sound, not the canvases that do not show it (the keyboard repaints on its heartbeat, twice a second)
    {
      await B.evaluate(`(() => { window.__draws = { keyboard: 0, scope: 0 };
        for (const k of ['keyboard', 'scope']) { const f = SynthUI.prototype['draw_' + k]; SynthUI.prototype['draw_' + k] = function () { window.__draws[k]++; return f.apply(this, arguments); }; } })()`);
      await sleep(800);
      const d0 = JSON.parse(await B.evaluate('JSON.stringify(window.__draws)'));
      for (let i = 0; i < 16; i++) { await B.evaluate(`WS_TEST.setParam('vf_cut', ${400 + i * 300})`); await sleep(30); }
      await sleep(150);
      const d1 = JSON.parse(await B.evaluate('JSON.stringify(window.__draws)'));
      check(d1.scope - d0.scope >= 8, 'a knob moved (the FILTER cutoff) redraws the SCOPE at the next frames', JSON.stringify([d0, d1]));
      check(d1.keyboard - d0.keyboard <= 4, 'a knob moved (the FILTER cutoff) does not redraw the keyboard (its heartbeat only)', JSON.stringify([d0, d1]));
      await B.evaluate(`WS_TEST.setParam('chord_mode', 1)`); await sleep(120);
      const d2 = JSON.parse(await B.evaluate('JSON.stringify(window.__draws)'));
      check(d2.keyboard > d1.keyboard, 'CHORD MODE (it tints the selector octave) redraws the keyboard at once', JSON.stringify([d1, d2]));
      await B.evaluate(`WS_TEST.setParam('chord_mode', 0)`); await sleep(150);
    }
    check(errs.length === 0, 'no console error', errs.slice(0, 5).join(' | '));
  } finally { await B.close(); }
  console.log(fails ? `${fails} failure(s)` : 'smoke test passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
