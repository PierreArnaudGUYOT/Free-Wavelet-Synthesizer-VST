// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Minimal Chrome DevTools Protocol driver for headless Microsoft Edge (no dependencies, Node 22+).
// Edge is always started with --mute-audio (headless Edge would otherwise play through the real speakers)
// and is always shut down in the finally block, even when a capture fails: first a polite Browser.close,
// then the whole process tree is killed (Edge's renderer and audio child processes survive a plain kill).
// capture(jobs): each job = { url, out, w?, h?, dsf?, eval?, wait?, clip?: {x,y,width,height}, full?, maxH?, after? }
// eval runs before the screenshot (promises are awaited), after runs once it is taken.
// CLI: node tools/manual/cdp.js jobs.json
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function killTree(proc) {
  if (!proc || proc.pid == null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-proc.pid, 'SIGKILL'); } catch (_) { /* not a group leader */ } try { proc.kill('SIGKILL'); } catch (_) { /* gone */ } }
}

async function capture(jobs) {
  const port = 9333 + Math.floor(Math.random() * 500);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-manual-edge-'));
  const proc = spawn(EDGE, ['--headless=new', '--mute-audio', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let ws = null, send = null;
  try {
    let targets = [];
    for (let i = 0; i < 60 && !targets.length; i++) {
      try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter(t => t.type === 'page'); } catch (_) { /* not up yet */ }
      if (!targets.length) await sleep(200);
    }
    if (!targets.length) throw new Error('could not start Edge (' + EDGE + ')');
    ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    for (const j of jobs) {
      const W = j.w || 1124, H = j.h || 902;
      await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: j.dsf || 1.5, mobile: false });
      await send('Page.navigate', { url: 'about:blank' }); await sleep(150);   // force a real reload (hash-only URLs)
      await send('Page.navigate', { url: j.url });
      await sleep(j.loadWait || 1200);
      if (j.eval) {
        const r = await send('Runtime.evaluate', { expression: j.eval, awaitPromise: true });
        if (r.result && r.result.exceptionDetails) console.warn('  eval error:', JSON.stringify(r.result.exceptionDetails).slice(0, 200));
      }
      await sleep(j.wait || 300);
      const params = { format: 'png' };
      if (j.full) {
        const m = await send('Page.getLayoutMetrics'); const cs = m.result.cssContentSize || m.result.contentSize;
        params.clip = { x: 0, y: 0, width: W, height: Math.min(j.maxH || 20000, Math.ceil(cs.height)), scale: 1 };
        params.captureBeyondViewport = true;
      }
      if (j.clip) params.clip = Object.assign({ scale: 1 }, j.clip);
      const r = await send('Page.captureScreenshot', params);
      fs.writeFileSync(j.out, Buffer.from(r.result.data, 'base64'));
      console.log('  ' + path.basename(j.out));
      if (j.after) await send('Runtime.evaluate', { expression: j.after, awaitPromise: true });
    }
  } finally {
    // leave the page first (stops any audio), then close the browser, then make sure no process is left
    if (send && ws && ws.readyState === 1) {
      try { await Promise.race([send('Page.navigate', { url: 'about:blank' }), sleep(1000)]); } catch (_) { /* ignore */ }
      try { ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch (_) { /* ignore */ }
      await sleep(500);
    }
    try { if (ws) ws.close(); } catch (_) { /* ignore */ }
    killTree(proc);
    await sleep(500);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (_) { /* Edge may still hold files */ }
  }
}

module.exports = { capture };
if (require.main === module) {
  capture(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))).catch(e => { console.error(e); process.exitCode = 1; });
}
