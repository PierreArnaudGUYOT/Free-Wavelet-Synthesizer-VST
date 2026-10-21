// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// manual_figs.js - the figures of the manual (web/manual/img/*.svg), computed with the real engine (web/js/core.js): the wavelet atoms, the 11 octave bands of a
// cycle, the sparsity, the scale filter, the position window, the drawbar patterns, the band envelopes of the additive oscillator. The pages themselves
// (web/manual/*.html) are written by hand; run this script after a change of the engine or of the look (dark Crepuscule colours: gold = subtractive,
// cyan = additive), then commit the SVG files (the manual must work offline):
//   node tools/manual_figs.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SPEC = require(path.join(ROOT, 'web', 'js', 'spec.js'));
const C = require(path.join(ROOT, 'web', 'js', 'core.js'))(SPEC);
const N = C.N, NB = C.NB, P = C.P, K = C.K;
const IMG = path.join(ROOT, 'web', 'manual', 'img');
fs.mkdirSync(IMG, { recursive: true });

// ------------------------------------------------------------------ look
const BG = '#2a1230', EDGE = 'rgba(255,255,255,0.18)', TXT = '#f6f9ff', DIM = '#c2d1e6', FAINT = '#9a88ab', GRID = 'rgba(255,255,255,0.13)';
const GOLD = '#ffd166', CYAN = '#7ae7ff', PINK = '#ff9ec7', GREY = '#b9a9c8';
const FONT = `font-family="'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif"`;
const f1 = (v) => String(Math.round(v * 10) / 10);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const bandColor = (b) => { const t = (b - 1) / 10, h = 42 + 148 * t; return `hsl(${Math.round(h)},95%,${Math.round(72 - 6 * Math.sin(Math.PI * t))}%)`; };
function svg(w, h, title, desc, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${FONT} role="img" aria-labelledby="t d">` +
    `<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc><rect width="${w}" height="${h}" rx="12" fill="${BG}"/>${body}</svg>\n`;
}
const text = (x, y, s, o = {}) => `<text x="${f1(x)}" y="${f1(y)}" font-size="${o.size || 12}" fill="${o.fill || DIM}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}${o.italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
const line = (x1, y1, x2, y2, st, sw = 1, dash) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${st}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const rect = (x, y, w, h, fill, o = {}) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"${o.rx ? ` rx="${o.rx}"` : ''}${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ''}${o.op ? ` fill-opacity="${o.op}"` : ''}/>`;
const poly = (pts, st, sw = 2, o = {}) => `<polyline points="${pts.map((p) => f1(p[0]) + ',' + f1(p[1])).join(' ')}" fill="none" stroke="${st}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.op ? ` stroke-opacity="${o.op}"` : ''}/>`;
const panel = (x, y, w, h, mid = true) => rect(x, y, w, h, 'rgba(255,255,255,0.05)', { rx: 8, stroke: EDGE }) + (mid ? line(x + 5, y + h / 2, x + w - 5, y + h / 2, GRID, 1, '3 3') : '');
// a caption wrapped at about `max` characters per line: { svg, n, h } (lines of 15 px)
function caption(x, y, str, max = 112, o = {}) {
  const words = str.split(' '), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return { svg: lines.map((l, i) => text(x, y + i * 15, l, Object.assign({ size: 11.5 }, o))).join(''), n: lines.length, h: lines.length * 15 };
}
const out = (name, s) => { fs.writeFileSync(path.join(IMG, name), s); console.log('  img/' + name, (s.length / 1024).toFixed(1) + ' kB'); };
const peak = (y) => { let p = 0; for (let i = 0; i < y.length; i++) p = Math.max(p, Math.abs(y[i])); return p || 1; };

// one cycle (or any N-sample array) -> polyline points inside (x0, y0, w, h); `scale` 1 = the peak touches the panel's edge. min/max per column keeps the edges sharp.
function wavePts(y, x0, y0, w, h, scale, n = y.length) {
  const pts = [], cols = Math.max(2, Math.round(w / 2)), Y = (v) => y0 + h / 2 - v * scale * h / 2, big = 0.3 * peak(y);
  for (let c = 0; c < cols; c++) {
    const i0 = Math.floor(c / cols * n), i1 = Math.max(i0 + 1, Math.floor((c + 1) / cols * n));
    let mn = Infinity, mx = -Infinity;
    for (let i = i0; i < i1; i++) { mn = Math.min(mn, y[i]); mx = Math.max(mx, y[i]); }
    const X = x0 + c * w / cols;
    if (mx - mn > big) { const first = y[i0], last = y[i1 - 1]; pts.push([X, Y(first)]); pts.push([X, Y(first > last ? mx : mn)]); pts.push([X, Y(first > last ? mn : mx)]); pts.push([X + w / cols, Y(last)]); }
    else pts.push([X, Y(y[(i0 + i1) >> 1])]);
  }
  pts.push([x0 + w, Y(y[n - 1])]);
  return pts;
}
const params = (o) => { const p = Float64Array.from(C.defaults()); for (const k in o) p[P[k]] = o[k]; return p; };
// one display cycle of oscillator s (0 A1, 1 A2, 2 B1) as the panel's scope draws it: its tables, the scale filter and the position window
function cycleOf(o, s = 0, win) {
  const p = params(Object.assign({ osc_view: s }, o)), tb = C.buildTables(p, false), g = C.staticGains(p, new Float64Array(NB), s), k = K[s];
  const w = win || { c: p[k.pcen], w: p[k.pwid], d: p[k.pdep] };
  return { y: C.displayCycle(tb, g, w.c, w.w, w.d, new Float64Array(N)), tb, p, g };
}
const atomOf = (band, k, wav) => { const c = new Float64Array(N); c[(1 << (band - 1)) + k] = 1; return C.idwt(c, C.FILTERS[wav]); };

// ------------------------------------------------------------------ 1. a sine against atoms (wavelets.html)
{
  const W = 720, H = 238, pw = 336, ph = 150, y0 = 40, xa = 14, xb = 370;
  let b = text(xa, 26, 'A sine wave', { fill: TXT, weight: 700, size: 14 }) + text(xb, 26, 'Three wavelet atoms', { fill: TXT, weight: 700, size: 14 });
  b += panel(xa, y0, pw, ph) + panel(xb, y0, pw, ph, false);
  const sine = new Float64Array(N); for (let i = 0; i < N; i++) sine[i] = Math.sin(2 * Math.PI * 7 * i / N);
  b += poly(wavePts(sine, xa + 6, y0 + 8, pw - 12, ph - 16, 1), GREY, 2);
  const rows = [[3, 1, GOLD, 'large, slow'], [5, 9, bandColor(6), 'medium'], [7, 55, CYAN, 'small, fast']], rh = 46;
  rows.forEach(([band, k, col, name], i) => {
    const a = atomOf(band, k, 2), pk = peak(a), nn = Float64Array.from(a, (v) => v / pk), ry = y0 + 5 + i * (rh + 4);
    b += rect(xb + 5, ry, pw - 10, rh, 'rgba(255,255,255,0.04)', { rx: 5 }) + line(xb + 8, ry + rh / 2, xb + pw - 8, ry + rh / 2, GRID, 1, '3 3');
    b += poly(wavePts(nn, xb + 96, ry + 2, pw - 104, rh - 4, 0.92), col, 2) + text(xb + 12, ry + rh / 2 + 4, name, { size: 11.5, fill: col, weight: 600 });
  });
  const c1 = caption(xa, y0 + ph + 20, 'always there, the same everywhere: it tells how fast, never where', 52);
  const c2 = caption(xb, y0 + ph + 20, 'each has a size (a row) and a place (a column): it starts, rings, stops', 52);
  b += c1.svg + c2.svg;
  out('wl-sine-vs-atom.svg', svg(W, H, 'A sine wave and three wavelet atoms', 'A sine wave fills the whole cycle with the same oscillation; three wavelet atoms of different sizes each live in one place of the cycle and fade away.', b));
}

// ------------------------------------------------------------------ 2. Haar on eight numbers (wavelets.html)
{
  const sig = [4, 6, 10, 12, 8, 6, 5, 5], W = 720, bw = 46, bh = 28, gap = 7, x0 = 262, rowY = [38, 90, 142, 194];
  const rows = [{ avg: sig, det: [] }];
  for (let r = 0; r < 3; r++) { const a = rows[r].avg, na = [], nd = []; for (let i = 0; i < a.length; i += 2) { na.push((a[i] + a[i + 1]) / 2); nd.push((a[i] - a[i + 1]) / 2); } rows.push({ avg: na, det: nd }); }
  let b = text(14, 22, 'Haar: the simplest wavelet transform, on eight numbers', { fill: TXT, weight: 700, size: 14 });
  const labels = ['the signal', 'pairs: average | half-difference', 'again, on the averages', 'and again'];
  const box = (x, y, v, col, fillop) => rect(x, y, bw, bh, col, { rx: 6, op: fillop }) + text(x + bw / 2, y + 19, String(v).replace('-', '−'), { anchor: 'middle', size: 14, fill: TXT, weight: 600 });
  rows.forEach((r, i) => {
    const y = rowY[i]; b += text(14, y + 19, labels[i], { size: 12, fill: DIM });
    if (i === 0) { sig.forEach((v, k) => { b += box(x0 + k * (bw + gap), y, v, 'rgba(255,255,255,0.14)', 1); }); return; }
    const n = r.avg.length;
    r.avg.forEach((v, k) => { b += box(x0 + k * (bw + gap), y, v, GOLD, 0.34); });
    r.det.forEach((v, k) => { b += box(x0 + (n + k) * (bw + gap) + 14, y, v, CYAN, 0.30); });
  });
  b += rect(14, rowY[3] + 52, 14, 10, GOLD, { rx: 3, op: 0.5 }) + text(34, rowY[3] + 61, 'average = the broad outline', { size: 11.5 });
  b += rect(240, rowY[3] + 52, 14, 10, CYAN, { rx: 3, op: 0.5 }) + text(260, rowY[3] + 61, 'half-difference = the detail that averaging loses', { size: 11.5 });
  const res = rows[3].avg.concat(rows[3].det, rows[2].det, rows[1].det).map((v) => String(v).replace('-', '−'));
  b += text(14, rowY[3] + 86, 'Kept: ' + res.join(' · ') + '   (8 numbers in, 8 numbers out: nothing is lost, the signal can be rebuilt)', { size: 11.5, fill: TXT });
  out('wl-haar.svg', svg(W, rowY[3] + 100, 'Haar transform of eight numbers', 'Eight numbers are cut three times into averages and half-differences, ending with one average and seven details: 1, 2 and 4 details at three sizes. Nothing is lost: the eight numbers can be rebuilt.', b));
}

// ------------------------------------------------------------------ 3. a cycle as the sum of its 11 octave bands (wavelets.html)
{
  const f = C.FILTERS[2], src = C.sourceCycle(0, 0.5, 0), c = C.dwt(src, f);
  const W = 720, rowH = 22, x0 = 150, w = 556, y0 = 84;
  let b = text(14, 22, 'One cycle of a saw = the sum of 11 octave bands', { fill: TXT, weight: 700, size: 14 });
  b += panel(x0, 34, w, 44, false) + line(x0 + 4, 56, x0 + w - 4, 56, GRID, 1, '3 3') + poly(wavePts(src, x0 + 4, 38, w - 8, 36, 0.92), TXT, 1.8);
  b += text(14, 60, 'the saw cycle', { size: 12.5, fill: TXT }) + text(14, 74, '2048 samples', { size: 11, fill: FAINT });
  let sum = new Float64Array(N), top = 0;
  const layers = [];
  for (let k = 1; k <= NB; k++) { const o = new Float64Array(N); for (let i = 1 << (k - 1); i < 1 << k; i++) o[i] = c[i]; const l = C.idwt(o, f); layers.push(l); top = Math.max(top, peak(l)); for (let i = 0; i < N; i++) sum[i] += l[i]; }
  let err = 0; for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(sum[i] - src[i]));
  if (err > 1e-9) throw new Error('the bands do not add up to the cycle: ' + err);
  layers.forEach((l, i) => {
    const bnd = i + 1, y = y0 + i * (rowH + 3), pk = peak(l);
    b += panel(x0, y, w, rowH, false) + line(x0 + 4, y + rowH / 2, x0 + w - 4, y + rowH / 2, GRID, 1);
    b += poly(wavePts(l, x0 + 4, y + 1, w - 8, rowH - 2, 1 / pk), bandColor(bnd), 1.5);
    b += text(14, y + 10, `band ${bnd}`, { size: 12, fill: bandColor(bnd), weight: 600 }) + text(14, y + 20, `${1 << (bnd - 1)} atom${bnd > 1 ? 's' : ''}`, { size: 10.5, fill: FAINT });
    b += text(x0 - 8, y + 15, Math.round(pk / top * 100) + '%', { anchor: 'end', size: 10.5, fill: FAINT });
  });
  const yEnd = y0 + NB * (rowH + 3) + 10;
  const cp = caption(14, yEnd + 4, 'Each row is drawn at its own height (the % is its real size against the biggest band). Band 1 is the slow body of the wave, band 11 the finest detail; the bursts of the fine bands sit where the saw jumps: wavelets know where things happen.', 118);
  b += cp.svg;
  out('wl-layers.svg', svg(W, yEnd + cp.h + 14, 'A saw cycle cut into 11 octave bands', 'The 11 octave bands of a saw cycle drawn one under the other, each with its number of atoms; the finest bands show short bursts at the place where the saw jumps. Added up they give back the saw exactly.', b));
}

// ------------------------------------------------------------------ 4. a scalogram: rows = bands, columns = places (used by the additive one)
function scalogramBody(coefRows, x0, y0, w, rowH, cols, col, label) {
  // coefRows[b-1][k] = strength of atom k of band b (any scale); drawn on a grid of `cols` columns, the maximum per cell
  let mx = 0; for (const r of coefRows) for (const v of r) mx = Math.max(mx, v);
  let b = '';
  coefRows.forEach((r, i) => {
    const bnd = i + 1, n = r.length, y = y0 + (NB - bnd) * (rowH + 2);
    b += rect(x0, y, w, rowH, 'rgba(255,255,255,0.05)', { rx: 2 });
    const cell = Math.min(cols, n);
    for (let c = 0; c < cell; c++) {
      let v = 0; const k0 = Math.floor(c / cell * n), k1 = Math.max(k0 + 1, Math.floor((c + 1) / cell * n));
      for (let k = k0; k < k1; k++) v = Math.max(v, r[k]);
      const t = Math.sqrt(v / (mx || 1)); if (t < 0.04) continue;
      b += rect(x0 + c * w / cell + (cell < 64 ? 1 : 0), y, w / cell - (cell < 64 ? 2 : 0), rowH, col, { op: Math.min(1, 0.15 + 0.85 * t) });
    }
    if (label) b += text(x0 - 8, y + rowH - 4, String(bnd), { anchor: 'end', size: 11, fill: DIM });
  });
  return b;
}
// ------------------------------------------------------------------ 5. the six source waves (subtractive-1)
{
  const names = ['SAW', 'SQUARE', 'PULSE', 'TRI', 'SINE', 'NOISE'], W = 720, pw = 104, gap = 14, ph = 84;
  let b = text(14, 22, 'The six source waves: one cycle each (WIDTH 25 % for PULSE, 30 % for TRI)', { fill: TXT, weight: 700, size: 14 });
  names.forEach((n, i) => {
    const y = C.sourceCycle(i, i === 2 ? 0.25 : i === 3 ? 0.3 : 0.5, 0), x = 14 + i * (pw + gap);
    b += panel(x, 36, pw, ph) + poly(wavePts(y, x + 4, 40, pw - 8, ph - 8, 0.9), GOLD, 1.8) + text(x + pw / 2, 36 + ph + 17, n, { anchor: 'middle', size: 12.5, fill: TXT, weight: 600 });
  });
  out('sub-sources.svg', svg(W, 36 + ph + 30, 'The six source waves', 'One cycle of the saw, square, pulse, triangle, sine and noise waves that the subtractive oscillators start from.', b));
}

// ------------------------------------------------------------------ 6. the seven wavelets: one atom each (subtractive-1, additive-2)
function atomsFig(name, col, title, desc) {   // (a figure of its own, the page of the subtractive oscillator uses it)
  const W = 720, cw = 90, ch = 92, gap = 10, x0 = 14;
  let b = text(14, 22, title, { fill: TXT, weight: 700, size: 14 });
  SPEC.WAVELETS.forEach((wv, wi) => {
    const a = C.atomShape(wi), x = x0 + wi * (cw + gap);
    b += panel(x, 36, cw, ch);
    const span = a.hi - a.lo + 1, m = Math.max(4, span * 0.15), lo = a.lo - m, hi = a.hi + m;
    let pk = 0; for (let i = a.lo; i <= a.hi; i++) pk = Math.max(pk, Math.abs(a.x[i]));
    const pts = [], cols = cw - 10;
    for (let c = 0; c <= cols; c++) { const i = Math.round(lo + c / cols * (hi - lo)); const v = i >= a.lo && i <= a.hi ? a.x[i] : 0; pts.push([x + 5 + c, 36 + ch / 2 - v / pk * (ch / 2 - 10)]); }
    b += poly(pts, col, 1.8);
    b += text(x + cw / 2, 36 + ch + 16, wv.name.replace('Daubechies', 'Daub.'), { anchor: 'middle', size: 11.5, fill: TXT, weight: 600 });
    b += text(x + cw / 2, 36 + ch + 30, `${wv.h.length} taps`, { anchor: 'middle', size: 11, fill: FAINT });
  });
  out(name, svg(W, 36 + ch + 42, title, desc, b));
}
atomsFig('sub-atoms.svg', GOLD, 'One atom of each wavelet (the ATOM SHAPE display of the panel)', 'The seven wavelets, from the blocky Haar with two taps to the smooth Daubechies 20 with forty taps.');

// ------------------------------------------------------------------ 7. sparsity (subtractive-1)
{
  const f = C.FILTERS[3], src = C.sourceCycle(0, 0.5, 0), W = 720, pw = 160, gap = 20, ph = 96, vals = [0, 0.5, 0.8, 0.95];
  let b = text(14, 22, 'SPARSITY keeps only the strongest atoms (a saw, Daubechies 8)', { fill: TXT, weight: 700, size: 14 });
  vals.forEach((s, i) => {
    const c = C.dwt(src, f); c[0] = 0; const sp = C.sparsify(c, s), y = C.idwt(c, f), x = 14 + i * (pw + gap);
    b += panel(x, 36, pw, ph) + poly(wavePts(src, x + 4, 40, pw - 8, ph - 8, 0.9), GREY, 1.2, { op: 0.6 }) + poly(wavePts(y, x + 4, 40, pw - 8, ph - 8, 0.9 / Math.max(1, peak(y) / 1)), GOLD, 1.8);
    b += text(x + pw / 2, 36 + ph + 17, `SPARSITY ${Math.round(s * 100)} %`, { anchor: 'middle', size: 12, fill: TXT, weight: 600 }) + text(x + pw / 2, 36 + ph + 32, `${sp.K} of ${sp.nz} atoms`, { anchor: 'middle', size: 11.5, fill: FAINT });
  });
  const cp = caption(14, 36 + ph + 52, 'Grey: the original saw. Gold: what is left of it. The wave gets simpler, and the tone stranger, as atoms are dropped.', 118);
  b += cp.svg;
  out('sub-sparsity.svg', svg(W, 36 + ph + cp.h + 60, 'Sparsity of a saw cycle', 'A saw cycle rebuilt from all of its atoms, from half of them, from a few and from very few: the shape is more and more simplified.', b));
}

// ------------------------------------------------------------------ 8. the wavelet matters once bands are scaled (subtractive-1)
{
  const W = 720, pw = 160, gap = 20, ph = 96, picks = [0, 2, 3, 6];
  let b = text(14, 22, 'Same saw, same low-pass (CUTOFF 5): four wavelets, four shapes', { fill: TXT, weight: 700, size: 14 });
  picks.forEach((wi, i) => {
    const r = cycleOf({ wavelet: wi, f_cutoff: 5, f_slope: 24 }, 0), x = 14 + i * (pw + gap);
    b += panel(x, 36, pw, ph) + poly(wavePts(r.y, x + 4, 40, pw - 8, ph - 8, 0.9 / peak(r.y)), GOLD, 1.8);
    b += text(x + pw / 2, 36 + ph + 17, SPEC.WAVELETS[wi].name, { anchor: 'middle', size: 12, fill: TXT, weight: 600 });
  });
  const cp = caption(14, 36 + ph + 40, 'Cut the bands above 5 and the saw loses its detail: Haar leaves steps, the smoother wavelets leave a rounded wave. Each is drawn at its own height.', 118);
  b += cp.svg;
  out('sub-wavelet-choice.svg', svg(W, 36 + ph + cp.h + 48, 'The wavelet changes what a filter leaves', 'The same saw wave low-passed at band 5, rebuilt with Haar, Daubechies 4, Daubechies 8 and Daubechies 20: four different smoothed shapes.', b));
}

// ------------------------------------------------------------------ 9. the four scale-filter types (subtractive-2)
{
  const pw = 330, ph = 150, gx = 30, W = 2 * pw + gx + 28, names = ['LOW-PASS', 'HIGH-PASS', 'BAND-PASS', 'BAND-REJ'], dbTop = 24, dbBot = -60;
  const gainAt = (type, band, cut, slope, res) => { const o = new Float64Array(NB); C.filterGains(type, cut - (band - 1), slope, res, o); return o[0]; };
  let b = text(14, 22, 'The SCALE FILTER: gain of each band (CUTOFF 6)', { fill: TXT, weight: 700, size: 14 });
  names.forEach((nm, t) => {
    const ox = 14 + (t % 2) * (pw + gx), oy = 40 + Math.floor(t / 2) * (ph + 40), L = ox + 34, R = ox + pw - 4, Tp = oy + 16, Bt = oy + ph - 16;
    const X = (band) => L + (band - 1) / 10 * (R - L), Y = (db) => Tp + (dbTop - Math.max(dbBot, Math.min(dbTop, db))) / (dbTop - dbBot) * (Bt - Tp);
    b += text(ox, oy + 8, nm, { fill: TXT, weight: 700, size: 12 });
    for (const db of [24, 0, -24, -48]) { b += line(L, Y(db), R, Y(db), db === 0 ? 'rgba(255,255,255,0.3)' : GRID, 1) + text(L - 5, Y(db) + 4, (db > 0 ? '+' : '') + db, { anchor: 'end', size: 10, fill: FAINT }); }
    for (let k = 1; k <= 11; k++) b += text(X(k), Bt + 13, String(k), { anchor: 'middle', size: 10, fill: FAINT });
    b += line(X(6), Tp, X(6), Bt, GOLD, 1, '2 3');
    const curve = (slope, res, col, sw, dash) => { const pts = []; for (let s = 0; s <= 100; s++) { const band = 1 + s / 10, g = gainAt(t, band, 6, slope, res); pts.push([X(band), Y(20 * Math.log10(Math.max(g, 1e-9)))]); } return poly(pts, col, sw, { dash }); };
    b += curve(6, 0, GREY, 1.4) + curve(96, 0, PINK, 1.4, '5 4');
    if (t < 3) b += curve(24, 12, CYAN, 1.8, '2 3');
    b += curve(24, 0, GOLD, 2.4);
  });
  const yl = 40 + 2 * (ph + 40) - 18;
  const leg = (x, col, label, dash, sw = 2) => line(x, yl - 4, x + 24, yl - 4, col, sw, dash) + text(x + 30, yl, label, { size: 11.5, fill: TXT });
  b += leg(14, GOLD, 'SLOPE 24', null, 2.4) + leg(150, GREY, 'SLOPE 6', null, 1.4) + leg(272, PINK, 'SLOPE 96', '5 4', 1.4) + leg(400, CYAN, 'SLOPE 24 + RESO 12 dB', '2 3', 1.8);
  b += text(W - 14, yl, 'x: band · y: gain in dB', { anchor: 'end', size: 11, fill: FAINT });
  out('sub-filter.svg', svg(W, yl + 16, 'The four types of the scale filter', 'Gain in dB of each of the 11 bands for the low-pass, high-pass, band-pass and band-reject types at cutoff 6, with a gentle, a 24 dB and a 96 dB slope and with resonance.', b));
}

// ------------------------------------------------------------------ 11. the position window (subtractive-2)
{
  const W = 720, ph = 100, pw = 330, gap = 36;
  const wv = (d) => { const a = new Float64Array(N); for (let i = 0; i < N; i++) a[i] = C.windowValue(i / N, 0.25, 0.3, d); return a; };
  let b = text(14, 22, 'The POSITION window (POSITION 25 %, WIDTH 30 %): the filter acts only inside it', { fill: TXT, weight: 700, size: 14 });
  b += panel(14, 36, pw, ph, false);
  const pts = (d) => { const a = wv(d), r = []; for (let c = 0; c <= pw - 8; c++) r.push([18 + c, 36 + ph - 8 - a[Math.min(N - 1, Math.round(c / (pw - 8) * (N - 1)))] * (ph - 16)]); return r; };
  b += poly(pts(1), GOLD, 2) + poly(pts(0.5), CYAN, 1.6, { dash: '4 3' });
  b += text(14 + pw / 2, 36 + ph + 17, 'gold: DEPTH 100 % · cyan: DEPTH 50 % · x: the cycle', { anchor: 'middle', size: 11.5 });
  const x2 = 14 + pw + gap, pw2 = W - x2 - 14;
  const filt = { wavelet: 3, a_wave: 1, f_cutoff: 2, f_slope: 48 };
  const on = cycleOf(Object.assign({ p_center: 0.25, p_width: 0.3, p_depth: 1 }, filt), 0), dry = cycleOf({ wavelet: 3, a_wave: 1 }, 0);
  const sc = 0.9 / Math.max(peak(dry.y), peak(on.y));
  b += panel(x2, 36, pw2, ph) + poly(wavePts(dry.y, x2 + 4, 40, pw2 - 8, ph - 8, sc), GREY, 1.1, { op: 0.55 }) + poly(wavePts(on.y, x2 + 4, 40, pw2 - 8, ph - 8, sc), GOLD, 1.9);
  b += text(x2 + pw2 / 2, 36 + ph + 17, 'a square wave, low-passed inside the window only', { anchor: 'middle', size: 11.5 });
  const cp = caption(14, 36 + ph + 40, 'Outside the window you hear the wave as it is (grey, a flat-topped square); inside it the wave is filtered (gold, the flat top becomes an arch). With DEPTH 0 there is no window and the filter acts on the whole cycle.', 118);
  b += cp.svg;
  out('sub-window.svg', svg(W, 36 + ph + cp.h + 48, 'The position window', 'Left: the shape of the window over one cycle, for full and half depth. Right: a square wave that is low-passed only inside the window; outside it the unfiltered square remains.', b));
}

// ------------------------------------------------------------------ 12. own envelope and pitch envelope (subtractive-3)
{
  const W = 720, ph = 118, pw = 340, x2 = 14 + pw + 26, pw2 = W - x2 - 14;
  let b = text(14, 22, 'OWN ENVELOPE shortens the note · PITCH ENVELOPE drops the pitch', { fill: TXT, weight: 700, size: 14 });
  b += panel(14, 36, pw, ph, false);
  const T = 1.6, pt = (fn) => { const r = []; for (let c = 0; c <= pw - 12; c++) { const t = c / (pw - 12) * T; r.push([20 + c, 36 + ph - 10 - fn(t) * (ph - 24)]); } return r; };
  const amp = (t) => (t < 0.03 ? t / 0.03 : t < 0.3 ? 1 - 0.25 * (t - 0.03) / 0.27 : t < 1.2 ? 0.75 : Math.max(0, 0.75 * (1 - (t - 1.2) / 0.35)));
  const own = (t) => (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) * Math.LN10 * 3 / 0.35));
  b += poly(pt(amp), GREY, 1.6, { dash: '4 3' }) + poly(pt((t) => amp(t) * own(t)), GOLD, 2.2);
  b += text(14 + pw / 2, 36 + ph + 17, 'grey: the AMP ENVELOPE · gold: heard with OWN ENVELOPE on', { anchor: 'middle', size: 11 });
  b += text(14 + pw / 2, 36 + ph + 32, 'x: 0 – 1.6 s (key held for 1.2 s)', { anchor: 'middle', size: 11, fill: FAINT });
  b += panel(x2, 36, pw2, ph, false);
  const tp = 0.5, pts2 = [], amt = 12, tm = 0.08;
  for (let c = 0; c <= pw2 - 12; c++) { const t = c / (pw2 - 12) * tp, st = amt * Math.exp(-t * Math.LN10 * 3 / tm); pts2.push([x2 + 6 + c, 36 + ph - 10 - st / amt * (ph - 24)]); }
  b += poly(pts2, CYAN, 2) + line(x2 + 6, 36 + ph - 10, x2 + pw2 - 6, 36 + ph - 10, GRID, 1) + text(x2 + 10, 36 + 20, '+12 semitones', { size: 11, fill: CYAN }) + text(x2 + pw2 - 10, 36 + ph - 14, 'the note', { anchor: 'end', size: 11, fill: FAINT });
  b += text(x2 + pw2 / 2, 36 + ph + 17, 'PITCH ENV +12, TIME 80 ms: the pitch falls to the note', { anchor: 'middle', size: 11 });
  b += text(x2 + pw2 / 2, 36 + ph + 32, 'x: 0 – 0.5 s', { anchor: 'middle', size: 11, fill: FAINT });
  out('sub-envelopes.svg', svg(W, 36 + ph + 46, 'Own envelope and pitch envelope', 'Left: the amp envelope of a voice and, in gold, the short note that remains when the oscillator has its own envelope. Right: a pitch envelope that starts twelve semitones high and falls to the note in about eighty milliseconds.', b));
}

// ------------------------------------------------------------------ 13. the signal path (subtractive-3 and the home page)
{
  const W = 720, H = 262;
  const bx = (x, y, w, h, label, sub, col, op = 0.22) => rect(x, y, w, h, col, { rx: 9, op, stroke: col }) +
    text(x + w / 2, y + 19, label, { anchor: 'middle', size: 12.5, fill: TXT, weight: 700 }) + sub.map((l, i) => text(x + w / 2, y + 34 + i * 12.5, l, { anchor: 'middle', size: 10.5, fill: DIM })).join('');
  const ar = (x1, y1, x2, y2) => line(x1, y1, x2, y2, FAINT, 1.5) + `<path d="M${f1(x2)} ${f1(y2)} ${x2 > x1 ? 'l-7 -4 v8 z' : 'l-4 -7 h8 z'}" fill="${FAINT}"/>`;
  let b = text(14, 22, 'The path of the sound', { fill: TXT, weight: 700, size: 14 });
  b += bx(14, 36, 168, 50, 'A1  ·  A2', ['wavelets → scale filter → window'], GOLD) + bx(14, 94, 168, 50, 'B1', ['drawbars → scale filter → window'], CYAN) + bx(14, 152, 168, 40, 'SUB OSC', ['sine / triangle / square'], GREY, 0.14);
  b += bx(222, 66, 118, 96, 'OSC MIX', ['levels · tuning', 'pitch + own envelope', 'unison · stereo'], PINK);
  b += bx(372, 66, 100, 96, 'FILTER', ['LADDER / OTA', 'own envelope'], GREY);
  b += bx(504, 66, 100, 96, 'AMP ENVELOPE', ['ADSR', 'velocity'], GREY);
  b += bx(222, 196, 382, 44, 'EFFECTS', ['saturation → chorus → delay → reverb → master + limiter'], PINK);
  b += ar(182, 62, 222, 98) + ar(182, 119, 222, 114) + ar(182, 172, 222, 134) + ar(340, 114, 372, 114) + ar(472, 114, 504, 114);
  b += ar(554, 162, 554, 196) + text(566, 184, 'all the notes added', { size: 10.5, fill: FAINT });
  b += text(626, 108, 'each note', { size: 11, fill: FAINT }) + text(626, 122, 'has its own', { size: 11, fill: FAINT }) + text(626, 136, 'path (up to', { size: 11, fill: FAINT }) + text(626, 150, '16 voices)', { size: 11, fill: FAINT });
  out('signal-flow.svg', svg(W, H, 'The path of the sound through OktoWave', 'Three wavelet oscillators and a sub oscillator go through the oscillator mix, the voice filter and the amp envelope of each note; all the notes are then added and share the effects and the limiter.', b));
}

// ------------------------------------------------------------------ 14. the drawbars and the tilt (additive-1)
{
  const W = 720, ph = 118, pw = 218, gap = 14, tilts = [0, -3, -6];
  let b = text(14, 22, 'The 11 drawbars = the 11 octave bands (all bars up): TILT sets how fast the fine bands fade', { fill: TXT, weight: 700, size: 14 });
  tilts.forEach((t, i) => {
    const x = 14 + i * (pw + gap); b += panel(x, 36, pw, ph, false);
    const bw = (pw - 16) / NB;
    for (let k = 0; k < NB; k++) {
      const v = Math.exp(t * k * Math.LN10 / 20), h = v * (ph - 28);
      b += rect(x + 8 + k * bw + 2, 36 + ph - 18 - h, bw - 4, h, bandColor(k + 1), { rx: 2, op: 0.85 }) + text(x + 8 + k * bw + bw / 2, 36 + ph - 6, String(k + 1), { anchor: 'middle', size: 9.5, fill: FAINT });
    }
    b += text(x + pw / 2, 36 + ph + 17, 'TILT ' + (t === 0 ? '0' : String(t).replace('-', '−')) + ' dB per band', { anchor: 'middle', size: 12, fill: TXT, weight: 600 });
  });
  const cp = caption(14, 36 + ph + 40, 'Band b holds roughly the harmonics 2^(b−2) to 2^(b−1) of the note: band 1 is the fundamental, band 5 the harmonics 8–16, band 11 the harmonics 512–1024. With all bars at 1 and a TILT of −6 dB, each band is half as loud as the one below.', 118);
  b += cp.svg;
  out('add-drawbars.svg', svg(W, 36 + ph + cp.h + 48, 'Drawbars and tilt', 'Three rows of eleven bars: with a tilt of zero all bands are equal, with minus three and minus six decibels per band the fine bands fall away progressively.', b));
}

// ------------------------------------------------------------------ 15. the six patterns (additive-1)
{
  const W = 720, pw = 104, gap = 14, ph = 84, names = ['RAMP', 'MIRROR', 'ALT', 'WALSH', 'IMPULSE', 'RANDOM'];
  const bars = {}; for (let k = 1; k <= NB; k++) bars['b_bar' + k] = 1;
  let b = text(14, 22, 'The six PATTERNS: one cycle each, all bars up, TILT −6 (RANDOM: SEED 1)', { fill: TXT, weight: 700, size: 14 });
  names.forEach((n, i) => {
    const r = cycleOf(Object.assign({ b_pattern: i, b_tilt: -6, b_seed: 1, b1_wavelet: 2 }, bars), 2), x = 14 + i * (pw + gap);
    b += panel(x, 36, pw, ph) + poly(wavePts(r.y, x + 4, 40, pw - 8, ph - 8, 0.9 / peak(r.y)), CYAN, 1.7) + text(x + pw / 2, 36 + ph + 17, n, { anchor: 'middle', size: 12.5, fill: TXT, weight: 600 });
  });
  out('add-patterns.svg', svg(W, 36 + ph + 30, 'The six drawbar patterns', 'One cycle of the additive oscillator for each pattern: ramp, mirror, alternate, Walsh, impulse and random, each with all eleven bands at full level.', b));
}

// ------------------------------------------------------------------ 16. the band envelopes (additive-1)
{
  const W = 720, ph = 150, pw = 480, atk = 0.5, spread = 0.6, body = 6, bright = 1, sus = 0.3, T = 5, n = 32, sr = 48000, dt0 = n / sr;
  let b = text(14, 22, 'The band envelopes: ATTACK 0.5 s, SPREAD +0.6, BODY 6 s, BRIGHT 1 s, SUSTAIN 30 %', { fill: TXT, weight: 700, size: 14 });
  b += panel(14, 36, pw, ph, false);
  for (let band = 1; band <= NB; band++) {
    const t01 = (band - 1) / 10, rate = n / (atk * Math.pow(16, spread * (t01 - 0.5)) * sr), dtm = body * Math.pow(bright / body, t01), dec = Math.exp(-n * Math.log(1000) / (dtm * sr));
    let lv = 0, atkOn = true; const pts = []; let tnext = 0;
    for (let s = 0; s * dt0 <= T; s++) {
      const t = s * dt0;
      if (t >= tnext) { pts.push([14 + 8 + t / T * (pw - 16), 36 + ph - 10 - lv * (ph - 22)]); tnext += T / 130; }
      if (atkOn) { lv += rate; if (lv >= 1) { lv = 1; atkOn = false; } } else lv = sus + (lv - sus) * dec;
    }
    b += poly(pts, bandColor(band), 1.8);
  }
  const x2 = 14 + pw + 24;
  b += text(x2, 56, 'ATTACK: how long the', { size: 12 }) + text(x2, 71, 'middle bands take to arrive', { size: 12 });
  b += text(x2, 96, 'SPREAD > 0: the fine', { size: 12 }) + text(x2, 111, 'bands arrive later', { size: 12 });
  b += text(x2, 136, 'BODY / BRIGHT: how long', { size: 12 }) + text(x2, 151, 'band 1 / band 11 take to', { size: 12 }) + text(x2, 166, 'fall to SUSTAIN', { size: 12 });
  b += text(14 + pw / 2, 36 + ph + 17, 'x: 0 – 5 s, key held · colours: band 1 (gold) … band 11 (cyan)', { anchor: 'middle', size: 11.5 });
  out('add-envelope.svg', svg(W, 36 + ph + 30, 'The band envelopes of the additive oscillator', 'Eleven curves, one per band: they rise during the attack, the fine bands later than the coarse ones, then fall towards the sustain level, the fine bands faster.', b));
}

// ------------------------------------------------------------------ 17. one pattern, seven wavelets (additive-2)
{
  const W = 720, pw = 90, gap = 10, ph = 84, bars = {}; for (let k = 1; k <= NB; k++) bars['b_bar' + k] = k <= 8 ? 1 : 0;
  let b = text(14, 22, 'The same MIRROR drawbars (bands 1–8, TILT −4), seven wavelets', { fill: TXT, weight: 700, size: 14 });
  SPEC.WAVELETS.forEach((wv, wi) => {
    const r = cycleOf(Object.assign({ b_pattern: 1, b_tilt: -4, b1_wavelet: wi }, bars), 2), x = 14 + wi * (pw + gap);
    b += panel(x, 36, pw, ph) + poly(wavePts(r.y, x + 4, 40, pw - 8, ph - 8, 0.9 / peak(r.y)), CYAN, 1.6) + text(x + pw / 2, 36 + ph + 16, wv.name.replace('Daubechies', 'Daub.'), { anchor: 'middle', size: 11, fill: TXT, weight: 600 });
  });
  b += text(14, 36 + ph + 40, 'Same levels, same pattern: only the shape of the atoms changes (each drawn at its own height).', { size: 11.5 });
  out('add-wavelets.svg', svg(W, 36 + ph + 54, 'One pattern with seven wavelets', 'The additive oscillator with the same mirror pattern and drawbars, rebuilt with each of the seven wavelets: seven different wave shapes.', b));
}

// ------------------------------------------------------------------ 18. the additive scalogram and the window on B1 (additive-2)
{
  const W = 720, rowH = 15, x0 = 44, w = 330;
  const bars = [1, 0.8, 0.7, 0.6, 0.4, 0.3, 0, 0, 0, 0, 0], o = { b_pattern: 1, b_tilt: -2, b1_wavelet: 4, osc_view: 2 };
  bars.forEach((v, i) => { o['b_bar' + (i + 1)] = v; });
  const p = params(o), tb = C.buildTables(p, false), g = C.staticGains(p, new Float64Array(NB), 2);
  const rows = []; for (let bnd = 1; bnd <= NB; bnd++) rows.push(Array.from(tb.coeffs.subarray(1 << (bnd - 1), 1 << bnd), (v) => Math.abs(v) * tb.bandScale[bnd - 1] * Math.pow(2, (bnd - 1) / 2) * g[bnd - 1]));
  let b = text(14, 22, 'B1 with drawbars on bands 1–6 (MIRROR, TILT −2): its scalogram and its cycle', { fill: TXT, weight: 700, size: 14 });
  b += scalogramBody(rows, x0, 36, w, rowH, 64, CYAN, true);
  const yb = 36 + NB * (rowH + 2) + 4;
  b += text(x0 + w / 2, yb + 12, 'position →', { anchor: 'middle', size: 11, fill: FAINT });
  const x2 = x0 + w + 36, pw2 = W - x2 - 14, ph = 62;
  const full = C.displayCycle(tb, g, 0, 0.5, 0, new Float64Array(N)), win = C.displayCycle(tb, g, 0.5, 0.3, 1, new Float64Array(N)), pk = peak(full);
  b += text(x2, 44, 'the cycle', { size: 12, fill: TXT, weight: 600 }) + panel(x2, 52, pw2, ph) + poly(wavePts(full, x2 + 4, 56, pw2 - 8, ph - 8, 0.9 / pk), CYAN, 1.7);
  b += text(x2, 52 + ph + 20, 'with a window:', { size: 11.5, fill: TXT, weight: 600 }) + text(x2, 52 + ph + 34, 'POSITION 50 %, WIDTH 30 %, DEPTH 100 %', { size: 11, fill: DIM }) + panel(x2, 52 + ph + 42, pw2, ph) + poly(wavePts(win, x2 + 4, 52 + ph + 46, pw2 - 8, ph - 8, 0.9 / pk), CYAN, 1.7);
  const cp = caption(14, yb + 32, 'Rows: bands 1 (bottom) to 11. A drawbar lights its whole row. The window keeps band 1 everywhere and the other bands only in its place: the middle of the cycle is full of detail, the rest is a slow wave.', 118);
  b += cp.svg;
  out('add-scalogram.svg', svg(W, yb + cp.h + 40, 'The scalogram and the window of the additive oscillator', 'Left: a scalogram with six lit rows, the bands that have a drawbar up. Right: the cycle of that sound, and the same cycle with the position window: the low band stays, the details remain only inside the window.', b));
}

// ------------------------------------------------------------------ 19. A1, B1 and their mix (additive-3)
{
  const W = 720, ph = 70, fw = W - 28;
  const bars = {}; [1, 0.8, 0.7, 0.6, 0.4, 0.3, 0, 0, 0, 0, 0].forEach((v, i) => { bars['b_bar' + (i + 1)] = v; });
  const base = Object.assign({ wavelet: 3, f_cutoff: 6, b_pattern: 1, b_tilt: -2, b1_wavelet: 4 }, bars);
  const mk = (a, bb) => { const p = params(Object.assign({}, base, { a1_lvl: a, b1_lvl: bb, osc_view: 0 })); const sets = C.buildScopeSets(p, null); return C.globalCycle(p, sets, new Float64Array(N), null); };
  const A = mk(1, 0), B = mk(0, 1), M = mk(0.6, 0.5), pk = Math.max(peak(A), peak(B), peak(M));
  let b = text(14, 22, 'OSC MIX: what the SCOPE shows is the sum of the oscillators, each at its level', { fill: TXT, weight: 700, size: 14 });
  const row = (i, y_, col, label) => { const y = 44 + i * (ph + 26); return text(14, y, label, { size: 12, fill: col, weight: 600 }) + panel(14, y + 6, fw, ph) + poly(wavePts(y_, 18, y + 10, fw - 8, ph - 8, 0.9 / pk), col, 1.8); };
  b += row(0, A, GOLD, 'A1 alone (a saw, wavelet Daubechies 8, CUTOFF 6, level 100 %)');
  b += row(1, B, CYAN, 'B1 alone (MIRROR drawbars on bands 1–6, TILT −2, level 100 %)');
  b += row(2, M, TXT, 'the mix: A1 at 60 % + B1 at 50 %');
  const yEnd = 44 + 3 * (ph + 26) - 8;
  const cp = caption(14, yEnd, 'An oscillator at 0 is off and costs nothing. The SUB OSC adds a plain wave one or two octaves below, unfiltered by the scale filter.', 118);
  b += cp.svg;
  out('add-mix.svg', svg(W, yEnd + cp.h + 14, 'Mixing a subtractive and an additive oscillator', 'The cycle of oscillator A1 alone, of oscillator B1 alone and of their mix at levels of sixty and fifty percent, as the scope shows it.', b));
}
console.log('done');
