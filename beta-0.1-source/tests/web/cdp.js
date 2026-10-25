// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// cdp.js - tiny Chrome DevTools Protocol driver for headless Microsoft Edge.
// No npm packages: uses child_process, http and Node's global WebSocket (Node >= 22).
//
//   const { Browser } = require('./cdp');
//   const b = await Browser.launch({ width: 1280, height: 860 });
//   await b.navigate('file:///C:/path/page.html');
//   const v = await b.evaluate('1 + 1');          // -> 2 (promises are awaited)
//   await b.screenshot('out.png', { width: 1920, height: 1080 });
//   await b.click(100, 200); await b.key('1', { code: 'Digit1' });
//   console.log(b.errors());                       // console errors + uncaught exceptions
//   await b.close();
//
// Every browser is launched with --mute-audio (pages still render audio - AudioContext/AudioWorklet and
// level measurements work - but nothing reaches the speakers) and is killed with its whole process tree by
// close() and by process exit / Ctrl+C / uncaught-error handlers, so no test browser can outlive the test.
'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ process-tree cleanup
const LIVE = new Set(); // browsers launched by this process and not yet closed
function killTree(pid) {
  if (!pid) return;
  try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 5000 }); } catch (_) { /* ignore */ }
}
// fallback for children whose parent already exited: any msedge.exe whose command line names our temp profile
function killByProfile(dir) {
  if (!dir || !/ws-edge-/.test(dir)) return;
  // kill, then wait (max 5 s) until no process of this profile is left, so close() returns only when all are gone
  const ps = `$d = (Get-Date).AddSeconds(5); do { $p = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(dir)}*' }); ` +
    `$p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; if ($p.Count) { Start-Sleep -Milliseconds 250 } } while ($p.Count -and (Get-Date) -lt $d)`;
  try { spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', windowsHide: true, timeout: 15000 }); } catch (_) { /* ignore */ }
}
function killAll() {
  for (const b of LIVE) { killTree(b.proc && b.proc.pid); killByProfile(b.userDataDir); LIVE.delete(b); }
}
let handlersInstalled = false;
function installExitHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  process.on('exit', killAll);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    try { process.on(sig, () => { killAll(); process.exit(130); }); } catch (_) { /* signal not supported */ }
  }
  process.on('uncaughtException', (e) => { console.error(e); killAll(); process.exit(1); });
  process.on('unhandledRejection', (e) => { console.error(e); killAll(); process.exit(1); });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function httpJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`bad JSON from ${url}: ${body.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('timeout ' + url)));
    req.end();
  });
}

function withTimeout(promise, ms, what) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout after ${ms} ms: ${what}`)), ms); }),
  ]);
}

// Virtual-key codes for Input.dispatchKeyEvent (enough for the synth's computer keyboard).
function keyInfo(key, code) {
  const info = { key, code: code || '', windowsVirtualKeyCode: 0, text: '' };
  if (/^[a-zA-Z]$/.test(key)) {
    info.windowsVirtualKeyCode = key.toUpperCase().charCodeAt(0);
    info.code = info.code || 'Key' + key.toUpperCase();
    info.text = key;
  } else if (/^[0-9]$/.test(key)) {
    info.windowsVirtualKeyCode = key.charCodeAt(0);
    info.code = info.code || 'Digit' + key;
    info.text = key;
  } else {
    const special = { Enter: 13, Escape: 27, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
      ';': 186, "'": 222, ',': 188, '.': 190, '/': 191, '-': 189, '=': 187, Tab: 9, Backspace: 8 };
    info.windowsVirtualKeyCode = special[key] || 0;
    if (key.length === 1) info.text = key;
  }
  if (/^Numpad[0-9]$/.test(info.code)) info.windowsVirtualKeyCode = 96 + Number(info.code.slice(6));
  return info;
}

class Browser {
  constructor() {
    this.proc = null;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.console = [];     // {type, text, url, line, t}
    this.exceptions = [];  // {text, url, line, t}
    this.logEntries = [];  // {level, source, text, url, t}
    this.userDataDir = null;
    this.viewport = { width: 1280, height: 860, deviceScaleFactor: 1 };
  }

  // Launch headless Edge and attach to its first page.
  static async launch(opts = {}) {
    const b = new Browser();
    try {
      return await Browser._launch(b, opts);
    } catch (e) {
      await b.close();
      throw e;
    }
  }

  static async _launch(b, opts) {
    const width = opts.width || 1280, height = opts.height || 860;
    b.viewport = { width, height, deviceScaleFactor: 1 };
    if (!fs.existsSync(opts.edgePath || EDGE)) throw new Error('Edge not found: ' + (opts.edgePath || EDGE));
    const port = await freePort();
    b.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-edge-'));
    const args = [
      opts.headless === false ? null : '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${b.userDataDir}`,
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio', // never play through the speakers (audio is still rendered and measurable)
      opts.fileAccess === false ? null : '--allow-file-access-from-files',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--disable-features=msEdgeSidebar,EdgeCollections',
      `--window-size=${width},${height}`,
      ...(opts.extraArgs || []),
      'about:blank',
    ].filter(Boolean);
    // opts.stderrFile: write Edge's own log (with --enable-logging=stderr) to a file for crash diagnosis
    if (opts.stderrFile) args.splice(args.length - 1, 0, '--enable-logging=stderr', '--v=0');
    installExitHandlers();
    b.proc = spawn(opts.edgePath || EDGE, args, { stdio: ['ignore', 'ignore', opts.stderrFile ? 'pipe' : 'ignore'], windowsHide: true });
    LIVE.add(b);
    if (opts.stderrFile) { const ws = fs.createWriteStream(opts.stderrFile); b.proc.stderr.pipe(ws); }
    b.proc.on('exit', (code) => { b.exited = code; });
    // wait for the DevTools endpoint
    let targets = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      try { targets = await httpJson(`http://127.0.0.1:${port}/json/list`); if (targets.some((t) => t.type === 'page')) break; }
      catch (_) { /* not up yet */ }
      if (b.exited !== undefined) throw new Error('Edge exited early with code ' + b.exited);
      await sleep(150);
    }
    let page = targets && targets.find((t) => t.type === 'page');
    if (!page) page = await httpJson(`http://127.0.0.1:${port}/json/new?about:blank`, 'PUT');
    if (!page || !page.webSocketDebuggerUrl) throw new Error('no page target from Edge DevTools');
    b.port = port;
    await b._connect(page.webSocketDebuggerUrl);
    await b.send('Page.enable');
    await b.send('Runtime.enable');
    await b.send('Log.enable');
    await b.setViewport(width, height);
    return b;
  }

  _connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(new Error('WebSocket error: ' + (e.message || e.type)));
      ws.onclose = () => { for (const [, p] of this.pending) p.reject(new Error('CDP connection closed')); this.pending.clear(); };
      ws.onmessage = (ev) => this._onMessage(JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()));
    });
  }

  _onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`)); else p.resolve(msg.result);
      return;
    }
    if (!msg.method) return;
    const t = Date.now();
    const pr = msg.params || {};
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (pr.args || []).map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
      const fr = pr.stackTrace && pr.stackTrace.callFrames && pr.stackTrace.callFrames[0];
      this.console.push({ type: pr.type, text, url: fr ? fr.url : '', line: fr ? fr.lineNumber + 1 : 0, t });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = pr.exceptionDetails || {};
      const text = (d.exception && d.exception.description) || d.text || 'exception';
      this.exceptions.push({ text, url: d.url || '', line: (d.lineNumber || 0) + 1, t });
    } else if (msg.method === 'Log.entryAdded') {
      const e = pr.entry || {};
      this.logEntries.push({ level: e.level, source: e.source, text: e.text, url: e.url || '', t });
    }
    const ls = this.listeners.get(msg.method);
    if (ls) for (const fn of [...ls]) fn(pr);
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    const p = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
    return withTimeout(p, timeoutMs, method);
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return () => { const a = this.listeners.get(event); a.splice(a.indexOf(fn), 1); };
  }

  waitEvent(event, timeoutMs = 15000) {
    return withTimeout(new Promise((resolve) => { const off = this.on(event, (p) => { off(); resolve(p); }); }), timeoutMs, event);
  }

  // Navigate and wait for the load event. Throws on navigation errors (e.g. file not found).
  async navigate(url, timeoutMs = 20000) {
    const loaded = this.waitEvent('Page.loadEventFired', timeoutMs);
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) { loaded.catch(() => {}); throw new Error(`navigation to ${url} failed: ${r.errorText}`); }
    // same-document navigation (only the #hash changed): no new loader, no load event
    if (!r.loaderId) { loaded.catch(() => {}); return; }
    await loaded;
  }

  // Evaluate an expression in the page; promises are awaited; returns the JSON value.
  async evaluate(expression, timeoutMs = 15000) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, timeoutMs);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('page exception: ' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result ? r.result.value : undefined;
  }

  // Poll `expression` until it is truthy.
  async waitFor(expression, timeoutMs = 5000, intervalMs = 50) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeoutMs) {
      last = await this.evaluate(expression);
      if (last) return last;
      await sleep(intervalMs);
    }
    return last;
  }

  async setViewport(width, height, deviceScaleFactor = 1) {
    this.viewport = { width, height, deviceScaleFactor };
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
  }

  // PNG screenshot; optionally at a given viewport (kept afterwards).
  async screenshot(file, opts = {}) {
    if (opts.width && opts.height && (opts.width !== this.viewport.width || opts.height !== this.viewport.height)) {
      await this.setViewport(opts.width, opts.height, opts.deviceScaleFactor || 1);
      await sleep(opts.settleMs !== undefined ? opts.settleMs : 400);
    }
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buf = Buffer.from(r.data, 'base64');
    if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }
    return buf;
  }

  async mouse(type, x, y, extra = {}) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  }

  async click(x, y, holdMs = 30) {
    await this.mouse('mouseMoved', x, y, { button: 'none', buttons: 0 });
    await this.mouse('mousePressed', x, y, { buttons: 1 });
    await sleep(holdMs);
    await this.mouse('mouseReleased', x, y, { buttons: 0 });
  }

  async drag(x1, y1, x2, y2, steps = 10) {
    await this.mouse('mouseMoved', x1, y1, { button: 'none', buttons: 0 });
    await this.mouse('mousePressed', x1, y1, { buttons: 1 });
    for (let i = 1; i <= steps; i++)
      await this.mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, { buttons: 1 });
    await this.mouse('mouseReleased', x2, y2, { buttons: 0 });
  }

  async keyDown(key, opts = {}) {
    const k = keyInfo(key, opts.code);
    await this.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', key: k.key, code: k.code,
      windowsVirtualKeyCode: k.windowsVirtualKeyCode, nativeVirtualKeyCode: k.windowsVirtualKeyCode, text: k.text, unmodifiedText: k.text });
  }

  async keyUp(key, opts = {}) {
    const k = keyInfo(key, opts.code);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code,
      windowsVirtualKeyCode: k.windowsVirtualKeyCode, nativeVirtualKeyCode: k.windowsVirtualKeyCode });
  }

  async key(key, opts = {}) {
    await this.keyDown(key, opts);
    await sleep(opts.holdMs || 30);
    await this.keyUp(key, opts);
  }

  // Console errors, uncaught exceptions and error log entries (optionally since time t).
  errors(since = 0) {
    const out = [];
    for (const c of this.console) if (c.t >= since && (c.type === 'error' || c.type === 'assert'))
      out.push(`console.${c.type}: ${c.text}${c.url ? ` (${c.url}:${c.line})` : ''}`);
    for (const e of this.exceptions) if (e.t >= since) out.push(`uncaught: ${e.text}${e.url ? ` (${e.url}:${e.line})` : ''}`);
    for (const l of this.logEntries) if (l.t >= since && l.level === 'error')
      out.push(`log[${l.source}]: ${l.text}${l.url ? ` (${l.url})` : ''}`);
    return out;
  }

  warnings(since = 0) {
    const out = [];
    for (const c of this.console) if (c.t >= since && c.type === 'warning') out.push(`console.warn: ${c.text}`);
    for (const l of this.logEntries) if (l.t >= since && l.level === 'warning') out.push(`log[${l.source}]: ${l.text}`);
    return out;
  }

  // Open another tab in the same browser; returns a Browser-like object for that tab (close() closes the tab only).
  async openTab(url = 'about:blank') {
    const t = await httpJson(`http://127.0.0.1:${this.port}/json/new?${encodeURI(url)}`, 'PUT');
    const tab = new Browser();
    tab.port = this.port;
    tab.parentBrowser = this;
    tab.targetId = t.id;
    await tab._connect(t.webSocketDebuggerUrl);
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');
    await tab.send('Log.enable');
    await tab.setViewport(this.viewport.width, this.viewport.height);
    return tab;
  }

  async close() {
    if (this.parentBrowser) { // a tab opened with openTab(): close only this target
      try { await httpJson(`http://127.0.0.1:${this.port}/json/close/${this.targetId}`); } catch (_) { /* ignore */ }
      try { if (this.ws) this.ws.close(); } catch (_) { /* ignore */ }
      return;
    }
    try { if (this.ws && this.ws.readyState === 1) await this.send('Browser.close', {}, 3000); } catch (_) { /* ignore */ }
    try { if (this.ws) this.ws.close(); } catch (_) { /* ignore */ }
    const t0 = Date.now();
    while (this.proc && this.exited === undefined && Date.now() - t0 < 3000) await sleep(100);
    // kill the whole process tree (renderer/GPU/audio-service children included), even after a graceful exit
    if (this.proc) killTree(this.proc.pid);
    killByProfile(this.userDataDir);
    LIVE.delete(this);
    for (let i = 0; i < 10 && this.userDataDir; i++) {
      try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); break; } catch (_) { await sleep(300); }
    }
  }
}

module.exports = { Browser, EDGE, sleep, keyInfo };
