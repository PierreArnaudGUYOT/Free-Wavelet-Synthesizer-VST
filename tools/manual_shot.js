// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// manual_shot.js - web/manual/panel.jpg, the picture of the panel (oscillator A1 shown) on the contents page of the manual ("The panel"). The pages themselves (web/manual/*.html) are written
// by hand and their figures are made by tools/manual_figs.js. Run this after a change of the panel's look or layout (headless Edge, muted; nothing is played):
//   node tools/manual_shot.js
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Browser, sleep } = require('../tests/web/cdp');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const B = await Browser.launch({ width: 1300, height: 1100, headless: true, fileAccess: true });
  try {
    await B.setViewport(1300, 1100, 1);
    await B.navigate(pathToFileURL(path.join(ROOT, 'web', 'index.html')).href + '#noaudio#nobrowser');
    await sleep(1200);
    await B.evaluate(`(() => { SynthUI.prototype.fit = function () { const DH = this.SPEC.DEVICE.h; this.scale = 1; this.dev.style.height = DH + 'px'; this.dev.style.transform = 'scale(1)'; this.dev.style.left = '30px'; this.dev.style.top = '30px'; this.sizeCanvases(); }; window.dispatchEvent(new Event('resize')); WS_TEST.setParam('osc_view', 0); return true; })()`);
    await sleep(600);
    const r = await B.evaluate(`(() => { const q = document.getElementById('device').getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; })()`);
    const res = await B.send('Page.captureScreenshot', { format: 'jpeg', quality: 86, clip: { x: r[0], y: r[1], width: r[2], height: r[3], scale: 1 }, captureBeyondViewport: true });
    const out = path.join(ROOT, 'web', 'manual', 'panel.jpg');
    fs.writeFileSync(out, Buffer.from(res.data, 'base64'));
    console.log('wrote', out, fs.statSync(out).size, 'bytes');
  } finally { await B.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
