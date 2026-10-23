// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Version 1.0.15: does the web demo overload the audio thread? (the procedure of the 1.0.14 investigation, handover §9.2, written down at last.) The web app runs in a headless browser
// (tests/web/cdp.js: Edge, or the browser of EDGE_PATH; muted, no window), plays the whole demo in real time, and reads every 250 ms the browser's own count of the render quanta it could not
// deliver in time (AudioContext.playbackStats.underrunEvents / underrunDuration, Chromium): each one is a gap in the sound, heard as a crackle. The counts are summed per scene of the demo.
//   node tools/dropouts.js [--root <folder that holds web/>] [--eco] [--label text] [--engine js|wasm]
//   --eco: Windows Efficiency mode on the test browser only (EcoQoS + idle priority, what Edge applies to save energy: the hard case of the owner's laptop)
//   --engine (WebAssembly prototype): the sound engine the page runs (WS_TEST.setEngine before the demo starts; default: the page's own choice, js)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { Browser, EDGE, sleep } = require('../tests/web/cdp.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.join(__dirname, '..'))), ECO = process.argv.includes('--eco'), ENGINE = arg('engine', '');
const LABEL = arg('label', path.basename(ROOT) + (ENGINE ? '_' + ENGINE : ''));

// Efficiency mode for the processes of this browser only (their command line names our temporary profile)
function efficiency(profileDir) {
  const ps = `
$sig = @'
using System; using System.Runtime.InteropServices;
public static class Eco {
  [StructLayout(LayoutKind.Sequential)] public struct PPT { public uint Version; public uint ControlMask; public uint StateMask; }
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint a, bool i, uint pid);
  [DllImport("kernel32.dll")] public static extern bool SetProcessInformation(IntPtr h, int cls, ref PPT info, uint size);
  [DllImport("kernel32.dll")] public static extern bool SetPriorityClass(IntPtr h, uint cls);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public static bool Apply(uint pid) {
    IntPtr h = OpenProcess(0x0200 | 0x0400, false, pid); if (h == IntPtr.Zero) return false;
    PPT p = new PPT(); p.Version = 1; p.ControlMask = 1; p.StateMask = 1;
    bool a = SetProcessInformation(h, 4, ref p, (uint)Marshal.SizeOf(p)); bool b = SetPriorityClass(h, 0x40); CloseHandle(h); return a && b;
  }
}
'@
Add-Type -TypeDefinition $sig
$n = 0; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${path.basename(profileDir)}*' } | ForEach-Object { if ([Eco]::Apply([uint32]$_.ProcessId)) { $n++ } }
Write-Output $n`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  return +(r.stdout || '0').trim().split(/\s+/).pop() || 0;
}

(async () => {
  const b = await Browser.launch({ edgePath: process.env.EDGE_PATH || EDGE });
  try {
    // keep the page's AudioContext (the app creates one when the demo starts)
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const AC = window.AudioContext; if (!AC) return; window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ctx = this; } }; })();` });
    await b.navigate('file:///' + path.join(ROOT, 'web', 'index.html').replace(/\\/g, '/'));
    await b.waitFor('!!(window.WS_TEST && WS_TEST.demoStart)', 20000);
    if (ECO) { await sleep(500); console.log(`Efficiency mode on ${efficiency(b.userDataDir)} browser processes`); }
    if (ENGINE) {
      if (!(await b.evaluate('!!WS_TEST.setEngine'))) throw new Error('this web app has no engine switch (--engine)');
      await b.evaluate(`WS_TEST.setEngine(${JSON.stringify(ENGINE)})`);
    }
    await b.evaluate('WS_TEST.demoStart()');
    await b.waitFor('WS_TEST.demoState().running', 10000);
    if (ENGINE) {
      const e = await b.evaluate('WS_TEST.engine()');
      console.log(`engine running: ${e.running}${e.running === 'wasm' ? (e.simd ? ' (SIMD)' : ' (scalar)') : ''}${e.err ? ', error: ' + e.err : ''}`);
      if (e.running !== ENGINE) throw new Error(`asked for ${ENGINE}, ${e.running} plays`);
    }
    const has = await b.evaluate('!!(window.__ctx && window.__ctx.playbackStats)');
    if (!has) throw new Error('this browser has no AudioContext.playbackStats: use Edge or a recent Chrome');
    const per = new Map(); let last = null, t0 = Date.now(), maxScene = -1;
    while (Date.now() - t0 < 400000) {
      await sleep(250);
      const s = await b.evaluate(`(() => { const d = WS_TEST.demoState(), p = window.__ctx.playbackStats; return { run: d.running, scene: d.scene, preset: d.preset, ev: p.underrunEvents, dur: p.underrunDuration, tot: p.totalDuration }; })()`);
      if (last && s.scene !== undefined && s.scene >= 0) {
        const k = s.scene, row = per.get(k) || { preset: s.preset, ev: 0, dur: 0 };
        row.ev += s.ev - last.ev; row.dur += s.dur - last.dur; per.set(k, row); maxScene = Math.max(maxScene, k);
      }
      if (!s.run) break;
      last = s;
    }
    let ev = 0, dur = 0;
    console.log(`${LABEL}${ECO ? ' (Efficiency mode)' : ''}: scene | preset | dropouts | missing ms`);
    for (const [k, r] of [...per.entries()].sort((a, c) => a[0] - c[0])) {
      ev += r.ev; dur += r.dur;
      if (r.ev > 0) console.log(`  ${String(k).padStart(2)} ${String(r.preset).slice(0, 40).padEnd(40)} ${String(r.ev).padStart(5)} ${(1000 * r.dur).toFixed(1).padStart(8)}`);
    }
    console.log(`TOTAL: ${ev} dropouts, ${(1000 * dur).toFixed(0)} ms of sound missing, over ${maxScene + 1} scenes (${((Date.now() - t0) / 1000).toFixed(0)} s of demo)`);
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'out', `dropouts_${LABEL.replace(/\W+/g, '_')}${ECO ? '_eco' : ''}.json`), JSON.stringify({ ev, dur, scenes: [...per.entries()] }));
  } finally {
    await b.close();
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
