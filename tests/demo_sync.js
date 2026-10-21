// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The demo's preset changes happen WITH the chords of the piece (version 1.0.8), on the real audio worklet: tools/demo_sim.js plays the first changes of the tour (the real plan, the real
// presets and demo rules) the way the page now sends them (0.6 s ahead, with the song time of the chord) and measures, on the audio, when the change is made and when the new sound is fully up
// again, against the chord, and how loud the chord is against the same chord on a sound that was in place long before. Nothing here depends on the speed of the machine (the CPU cost per
// quantum is reported by tools/demo_sim.js, not asserted).
//   node tests/demo_sync.js
'use strict';
const cp = require('child_process'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
let bad = 0;
const check = (ok, what, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? '  -- ' + detail : ''}`); if (!ok) bad++; };
const m = /const SCHED_UP = (\d+), SCHED_HOLD = (\d+), SCHED_MORPH = (\d+);/.exec(fs.readFileSync(path.join(ROOT, 'web', 'js', 'worklet.js'), 'utf8'));
const up = +m[1], hold = +m[2], Q = 128, sr = 48000, madeWant = -(hold + up) * Q / sr * 1000;   // the change is made at the bottom of the dip, hold + up quanta before the chord
const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'demo_sim.js'), '--scenes', '8', '--reps', '1', '--configs', 'new', '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (r.status !== 0) { console.log(r.stderr || r.stdout); process.exit(1); }
const rows = JSON.parse(r.stdout.trim().split('\n').pop())[0].rows;
check(rows.length === 8, `${rows.length} changes of the tour played`);
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const made = rows.map(x => x.made), upAt = rows.map(x => x.up), att = rows.map(x => x.att), gap = rows.map(x => x.gapMs);
check(made.every(x => Math.abs(x - madeWant) < 3), `every change is made ${(-madeWant).toFixed(0)} ms before its chord (within 3 ms)`, made.map(x => x.toFixed(1)).join(' '));
check(upAt.every(x => x > -Q / sr * 1000 - 0.5 && x <= 0.5), 'the new sound is fully up when its chord starts (within one quantum)', upAt.map(x => x.toFixed(1)).join(' '));
check(Math.min(...att) > -6 && med(att) > -2 && med(att) < 4, 'the chord is as loud as on a sound in place long before (the dip does not muffle it)', `median ${med(att).toFixed(1)} dB, lowest ${Math.min(...att).toFixed(1)} dB`);
check(Math.max(...gap) < 16, 'the silence before the chord is short (it is the dip)', `longest ${Math.max(...gap).toFixed(1)} ms`);
console.log(bad ? `${bad} failure(s)` : 'demo sync test passed');
process.exit(bad ? 1 : 0);
