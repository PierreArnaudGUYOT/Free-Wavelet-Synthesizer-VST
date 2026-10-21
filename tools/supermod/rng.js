// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// A seeded random generator with the helpers the preset composer uses (tools/supermod/): the same seed gives the same presets.
'use strict';
function Rng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; s ^= s >>> 15; s = Math.imul(s, 2246822519) >>> 0; return (s >>> 0) / 4294967296; };
  const r = {
    next,
    f: (a, b) => a + (b - a) * next(),                     // a float in [a, b)
    i: (a, b) => a + Math.floor(next() * (b - a + 1)),     // an integer in [a, b]
    p: (prob) => next() < prob,                            // true with this probability
    pick: (list) => list[Math.floor(next() * list.length)],
    // weighted choice: [[item, weight], ...]
    wpick: (pairs) => { let t = 0; for (const [, w] of pairs) t += w; let x = next() * t; for (const [it, w] of pairs) { x -= w; if (x < 0) return it; } return pairs[pairs.length - 1][0]; },
    shuffle: (list) => { const a = list.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(next() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; },
    round: (x, step) => Math.round(x / step) * step,
  };
  return r;
}
module.exports = { Rng };
