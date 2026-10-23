// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: runs a Node script of the repository and writes its output (stdout + stderr) to a log file as well as to the console, then its exit code.
// (One plain command per measure, no shell redirection.)
//   node wasm/run_logged.js <log file> <script.js> [args...]
'use strict';
const fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const [log, script, ...args] = process.argv.slice(2);
if (!log || !script) { console.error('usage: node wasm/run_logged.js <log file> <script.js> [args...]'); process.exit(2); }
fs.mkdirSync(path.dirname(path.resolve(log)), { recursive: true });
const out = fs.createWriteStream(log);
// the tools of this machine (C:/Users/Pierra/tools): the headless browser of the tests (always muted, tests/web/cdp.js), node and llvm-mingw for the builds of the tests
const env = Object.assign({}, process.env);
const CHROME = 'C:/Users/Pierra/tools/chrome/chrome.exe';
if (!env.EDGE_PATH && fs.existsSync(CHROME)) env.EDGE_PATH = CHROME;
const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
env[pathKey] = [path.dirname(process.execPath), 'C:\\Users\\Pierra\\tools\\llvm-mingw\\bin', env[pathKey] || ''].join(path.delimiter);
const isScript = /\.js$/i.test(script);
// (run from the repository's root: the build scripts and the tests expect it)
const p = spawn(isScript ? process.execPath : script, isScript ? [script, ...args] : args, { windowsHide: true, env, cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });   // (no input: nothing can wait for a key)
p.stdout.on('data', d => { process.stdout.write(d); out.write(d); });
p.stderr.on('data', d => { process.stderr.write(d); out.write(d); });
p.on('close', (c) => { out.end(`exit ${c}\n`, () => process.exit(c || 0)); });
